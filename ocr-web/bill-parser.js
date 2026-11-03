// 账单解析器（浏览器版）：OCR 文本 → 结构化账单记录
// 与 local_ocr/bill_parser.py 逐行对齐（纯标准库逻辑，无外部依赖）。
// 输出：[{date, type, amount, note}, ...]，与 App 的 applyLocalRecords 字段一致。

const RE_DATE_CN = /(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const RE_DATE_FULL = /(?:(\d{4})\s*[-/.])?\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?![.\d])/;
const RE_TIME = /(\d{1,2})\s*[:：]\s*(\d{1,2})(?:\s*[:：]\s*\d{1,2})?/;
const RE_AMOUNT = /^([+\-])?\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:元)?$/;
const RE_JUNK = /^[\sA-Za-z0-9:：/\\\-_.+*#]{1,6}$/;

const NOISE_PATTERNS = [
  /^[\d:：\s]+$/,
  /^(账单|全部账单|收支统计|收支明细|账单详情|账单服务|交易记录|交易明细|查找交易|搜索|筛选|更多|全部)[>＞»）)】\]\s]*$/,
  // ---- 手机截图顶部状态栏：运营商 + 时间 / 网络标识 / 电量 ----
  /^(?:中国电信|中国移动|中国联通|中国广电)\s*\d{1,2}\s*[:：]\s*\d{2}$/,
  /^(?:5G|4G|3G|5G\+|HD|VoLTE|Wi-?Fi|WLAN)\s*$/,
  /^\d{1,3}\s*%\s*$/,
  /^[A-Za-z]?\s*(查找交易|收支统计|全部账单)[>＞]*$/,
  /^(微信支付|支付宝|微信|收款|付款|财付通)$/,
  /^(支出|收入)\s*[¥￥]?\s*[\d,]+\.\d{1,2}\s*(收入|支出)?\s*[¥￥]?\s*[\d,]*\.?\d*$/,
  /支出.*收入|收入.*支出/,
  /^(余额|零钱|零钱通|银行卡?余额|账户余额)/,
  /^(当前状态|交易单号|商户单号|订单号|转账单号|转账说明|转账时间|创建时间|支付时间|支付方式|付款方式|收款方式|账单分类|收款方备注|付款方留言|收款方服务|收款方名片|转账记录|退款记录)$/,
  /^(本服务由财付通提供|定位到聊天位置|查看往来转账|对订单有疑惑|发起群收款|申请电子凭证|内容由AI生成|仅供参考)/,
  /^已退款\s*[¥￥]?[\d,]+\.?\d*/,
  // 分组标题（如「2026年10月」「2026年10月1日」）不属于任何一笔的备注
  /^\d{4}\s*年\s*(?:\d{1,2}\s*月)?\s*$/,
  /^\d{1,2}\s*月\s*\d{4}\s*年\s*$/,
];

const INCOME_HINTS = ['收款', '收到', '转入', '退款', '红包', '入账', '工资', '利息',
  '报销', '返现', '来自', '收入'];

function norm(s) {
  s = (s || '').trim();
  const map = { '−': '-', '–': '-', '—': '-', '－': '-', '~': '-', '＋': '+', '　': ' ', '：': ':' };
  for (const k in map) s = s.split(k).join(map[k]);
  return s;
}

function isNoise(s) {
  for (const p of NOISE_PATTERNS) if (p.test(s)) return true;
  return false;
}

function isJunk(s) {
  return RE_JUNK.test(s);
}

// 截图顶部状态栏残片（如「中国电信 9:51」「9:51」），需要从备注中剔除，
// 但保留「中国电信话费充值」这类正常备注：只有运营商紧跟时间/孤立时间才算状态栏。
const RE_STATUS_CARRIER_TIME = /(?:中国电信|中国移动|中国联通|中国广电)\s*\d{1,2}\s*[:：]\s*\d{2}/g;
const RE_STATUS_TIME = /(?:^|\s)\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?(?=\s|$)/g;

function scrubStatusBar(s) {
  s = s.replace(RE_STATUS_CARRIER_TIME, ' ');
  s = s.replace(RE_STATUS_TIME, ' ');
  return s;
}

function matchDatePrefix(s) {
  // 先按原文匹配，再按“去掉空格”的写法兜底：
  // 原文优先是为了让「2026-11-01 10:11」这种带时间的日期能匹配上，
  // 去掉空格后日和时会粘成「...0110:11」，被日期的边界判断挡住。
  for (const src of [s, s.replace(/\s+/g, '')]) {
    for (const rx of [RE_DATE_CN, RE_DATE_FULL]) {
      const m = rx.exec(src);
      if (!m) continue;
      const g = m.slice(1).map((x) => (x == null ? null : x));
      const month = parseInt(g[1], 10), day = parseInt(g[2], 10);
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
      let rest = src.slice(m[0].length);
      const tm = RE_TIME.exec(rest);
      // 必须按匹配到的位置切，不能直接 slice(长度)：日期和“时:分”之间通常有空格，
      // 直接切会把时间末尾的字符残留下来（如 “10月17日 17:02” 残留一个 “2”），
      // 这个残片会跟着被拼进备注。
      if (tm) rest = rest.slice(tm.index + tm[0].length);
      return [{ year: g[0] ? parseInt(g[0], 10) : null, month, day }, rest];
    }
  }
  return [null, s];
}

function parseAmount(s) {
  const compact = s.replace(/\s+/g, '');
  const m = RE_AMOUNT.exec(compact);
  if (!m) return null;
  const sign = m[1];
  const num = m[2].replace(/,/g, '');
  const hasDec = num.indexOf('.') >= 0;
  const hasCur = compact.startsWith('¥') || compact.startsWith('￥') || compact.indexOf('元') >= 0;
  if (!(sign || hasDec || hasCur)) return null;
  if (!hasDec && num.length >= 7) return null;
  let val;
  try { val = parseFloat(num); } catch (e) { return null; }
  if (!(val > 0)) return null;
  return [sign, val];
}

function findAmountTail(s) {
  const m = /([+\-])?\s*[¥￥]?\s*([\d,]+\.\d{1,2})\s*(?:元)?$/.exec(s);
  if (!m) return null;
  try {
    return [m[1], parseFloat(m[2].replace(/,/g, '')), s.slice(0, m.index)];
  } catch (e) { return null; }
}

function cleanNote(s) {
  s = norm(s);
  s = scrubStatusBar(s);
  s = s.replace(/^(?:[A-Za-z0-9]{1,6}[\s.、]+)+/, '');
  s = s.replace(/^[·•\-—\s|]+/, '');
  s = s.replace(/[.。·…\s\-|>＞»）)】\]]+$/, '');
  s = s.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  // 清完之后如果只剩界面文字（如「收支统计」）或零碎片段，就不要当备注了
  if (!s || isNoise(s) || isJunk(s)) return '';
  return s.slice(0, 80);
}

// 微信账单卡片里「金额」下面常跟一行被划掉的原价（如 +1518.63 下面的 1520.00）。
// OCR 拿不到删除线信息，只能靠结构判断：没有货币符号、与上一笔金额几乎相同、
// 且两者之间没有任何描述文字（说明它和上一笔属于同一张卡片）。
function looksLikeStruckPrice(s, amt, pending, lastItem, lineIdx) {
  if (!amt || !lastItem) return false;
  if (pending.length) return false;              // 中间夹了描述文字 → 是新的一笔
  if (lineIdx > lastItem.end + 1) return false;  // 必须紧跟上一笔金额
  const compact = s.replace(/\s+/g, '');
  if (/[¥￥]/.test(compact) || compact.indexOf('元') >= 0) return false; // 带货币符号的是真实金额
  // 自己带正负号、上一笔却不带 → 自己才是真实交易（上一笔才是原价/被误识别）
  if (amt[0] && !lastItem.sign) return false;
  const base = lastItem.amount;
  if (!(base > 0)) return false;
  return Math.abs(amt[1] - base) / base <= 0.05;
}

// 「被划掉的原价」判定（不要求紧邻）：用于在「补回标题」之前先排除原价行，
// 否则一旦给它补上标题，isStruckPriceItem 就会认为它是正常交易而保留下来。
function looksLikeStruckPriceFar(s, amt, lastItem) {
  if (!amt || !lastItem) return false;
  const compact = s.replace(/\s+/g, '');
  if (/[¥￥]/.test(compact) || compact.indexOf('元') >= 0) return false;
  if (amt[0] && !lastItem.sign) return false;
  const base = lastItem.amount;
  if (!(base > 0)) return false;
  return Math.abs(amt[1] - base) / base <= 0.05;
}

// 「被划掉的原价」后置清洗：微信卡片里金额下面常跟一行小字原价（带删除线）。
// OCR 拿不到删除线，只能靠结构判断：没有备注、且紧挨着一笔金额几乎相同的账单。
// 用后置统一清洗（而不是只在解析时判断相邻行），是为了兼容原价行被识别成
// "-1520.00"、被拆成多行、或中间夹了噪声行等变体。
function isStruckPriceItem(it, all) {
  if (!it) return false;
  if (cleanNote(it.desc.join(' '))) return false;          // 有备注 = 正常交易
  const raw = (it.raw || '').replace(/\s+/g, '');
  if (/[¥￥]/.test(raw) || raw.indexOf('元') >= 0) return false;  // 带货币符号按真实金额处理
  if (/[\u4e00-\u9fff]/.test(raw)) return false;           // 带中文说明的不是原价行
  const base = Math.abs(it.amount);
  if (!(base > 0)) return false;
  for (const o of all) {
    if (o === it) continue;
    if (Math.abs(o.start - it.start) > 3) continue;        // 必须挨得很近（同一张卡片）
    if (!cleanNote(o.desc.join(' '))) continue;            // 参照物必须有备注
    // 自己带正负号、参照物却不带 → 自己才是真实交易，别被无符号的原价顶掉
    if (it.sign && !o.sign) continue;
    const b2 = Math.abs(o.amount);
    if (!(b2 > 0)) continue;
    if (Math.abs(base - b2) / b2 <= 0.03) return true;     // 金额几乎相同（差 ≤3%）
  }
  return false;
}

function decideType(sign, desc, forced) {
  if (forced === '收入' || forced === '支出') return forced;
  if (sign === '+') return '收入';
  if (sign === '-') return '支出';
  if (desc && INCOME_HINTS.some((k) => desc.indexOf(k) >= 0)) return '收入';
  return '支出';
}

function mkDate(dinfo, yearHint) {
  if (!dinfo) return '';
  const year = dinfo.year || yearHint || new Date().getFullYear();
  try {
    return `${String(year).padStart(4, '0')}-${String(dinfo.month).padStart(2, '0')}-${String(dinfo.day).padStart(2, '0')}`;
  } catch (e) { return ''; }
}

function detailDate(lines, yearHint) {
  for (let i = 0; i < lines.length; i++) {
    if (/(转账时间|支付时间|交易时间|创建时间|付款时间)/.test(lines[i])) {
      const inline = matchDatePrefix(lines[i].replace(/.*?[：:]\s*/, ''))[0];
      if (inline) return mkDate(inline, yearHint);
      for (const j of [i + 1, i + 2]) {
        if (j < lines.length) {
          const d = matchDatePrefix(lines[j])[0];
          if (d) return mkDate(d, yearHint);
        }
      }
    }
  }
  let last = null;
  for (const s of lines) {
    const d = matchDatePrefix(s)[0];
    if (d) last = d;
  }
  return mkDate(last, yearHint);
}

export function parseBills(text, defaultDate) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map((ln) => norm(ln)).filter((ln) => ln && ln.trim());
  if (!lines.length) return [];

  const ym = /(20\d{2})\s*年/.exec(text);
  const yearHint = ym ? parseInt(ym[1], 10) : null;
  const today = defaultDate || new Date().toISOString().slice(0, 10);

  const items = [];
  const dates = [];
  let pending = [];
  let forced = null;
  let lastItem = null;
  // 上一条「日期行」以及它之前累积的文字（卡片标题）。
  // OCR 的阅读顺序按检测框坐标排序，同一张卡片里「标题 / 日期 / 金额」三块的先后并不固定：
  // 有时是 标题→金额→日期，有时是 标题→日期→金额（日期行会清空 pending，导致备注丢失）。
  // 这里把日期行之前的文字存一份，金额紧跟在日期行后面时再接回来。
  let lastDate = null;

  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    const isAmtLine = parseAmount(s) !== null;
    if (!isAmtLine && isNoise(s)) continue;

    const [dinfo, rest] = matchDatePrefix(s);
    if (dinfo) {
      const carry = pending.slice();
      pending = [];
      if (rest) {
        const tail = findAmountTail(rest);
        if (tail && !/(退款|余额|合计)/.test(rest)) {
          const [sign, val, desc] = tail;
          items.push({ desc: [desc], sign, amount: val, start: i, end: i, date: dinfo, raw: s });
          lastItem = items[items.length - 1];
          pending = [];
          lastDate = null;
          continue;
        }
        if (/(退款|余额|合计)/.test(rest)) continue;
        if (!isJunk(rest) && !isNoise(rest)) pending.push(rest);
      }
      dates.push({ idx: i, info: dinfo, hasTime: RE_TIME.test(s) });
      lastDate = { idx: i, carry: carry };
      continue;
    }

    const amt = parseAmount(s);
    if (amt) {
      // 被划掉的原价不是一笔交易，直接丢弃，否则会多出记录并挤乱后面的日期配对
      if (looksLikeStruckPrice(s, amt, pending, lastItem, i)) continue;
      let desc = pending.slice();
      // 金额行紧跟在日期行后面：把日期行之前的标题文字接回来（否则这条备注会是空的）
      if (lastDate && lastDate.idx === i - 1 && lastDate.carry.length) {
        // 但若这一行更像「划掉的原价」（与上一笔金额几乎相同、无货币符号），
        // 就不要给它补标题，否则它会被当成一笔真实交易
        if (!looksLikeStruckPriceFar(s, amt, lastItem)) desc = lastDate.carry.concat(desc);
      }
      items.push({ desc: desc, sign: amt[0], amount: amt[1], start: i, end: i, type: forced, raw: s });
      lastItem = items[items.length - 1];
      pending = [];
      forced = null;
      lastDate = null;
      continue;
    }

    if (s.trim() === '收入' || s.trim() === '支出') {
      forced = s.trim();
      continue;
    }

    if (isJunk(s)) continue;

    pending.push(s);
  }

  // 备注兜底：OCR 有时把「金额框」排在「标题文字」之前（版面分析按坐标排序，
  // 金额那块往往略微偏上），金额行被消费时 pending 还是空的 → 备注空白。
  // 这里在金额行的前后、同一张卡片范围内找回那一行中文描述。
  // 注意：必须在「剔除划掉的原价」之前做——否则原价的参照物（上一笔）还没有备注，
  // 原价行会被当成正常交易留下来。疑似原价的行在这里先跳过（不补备注），
  // 交给后面的清洗剔除。
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (cleanNote(it.desc.join(' '))) continue;
    // 疑似「划掉的原价」不补备注，留给后置清洗剔除
    if (looksLikeStruckPriceFar(it.raw || '', [it.sign, it.amount], items[k - 1])) continue;
    const prevEnd = k > 0 ? items[k - 1].end : -1;
    const nextStart = k + 1 < items.length ? items[k + 1].start : lines.length;
    const near = [];
    for (let j = it.end + 1; j < nextStart; j++) near.push(lines[j]);
    for (let j = it.start - 1; j > prevEnd; j--) near.push(lines[j]);
    for (const c of near) {
      if (!c || !/[\u4e00-\u9fff]/.test(c)) continue;
      if (parseAmount(c)) continue;              // 另一笔金额，不是备注
      if (matchDatePrefix(c)[0]) continue;       // 日期行
      if (isNoise(c) || isJunk(c)) continue;
      const n = cleanNote(c);
      if (n) { it.desc = [n]; break; }
    }
  }

  // 剔除被划掉的原价（必须在日期配对之前，否则会挤乱日期归属）
  const struck = items.map((it) => isStruckPriceItem(it, items));
  for (let k = items.length - 1; k >= 0; k--) {
    if (struck[k]) items.splice(k, 1);
  }

  // 第二遍：日期与交易配对。
  // 用「距离最近优先」的一对一匹配，替代原先的固定偏移整段对齐：
  // 只要 OCR 多识别/漏识别一行，固定偏移就会把后面所有账单的日期整体错位，
  // 导致首尾几笔拿不到日期而退回「今天」。
  function dist(item, d) {
    const lo = item.start - 1, hi = item.end + 1;
    let base;
    if (lo <= d.idx && d.idx <= hi) base = 0;
    else base = Math.min(Math.abs(d.idx - item.start), Math.abs(d.idx - item.end));
    // 「2026年10月31日」这种只有日期没有时间的是分组标题，属于它后面的账单，
    // 不能配给标题上方的那一笔（否则上一组最后一笔会被错标成下一天）。
    if (!d.hasTime && item.start < d.idx) base += 7;
    return base;
  }
  if (items.length && dates.length) {
    const n = items.length, m = dates.length;
    const GAP_ITEM = 3, GAP_DATE = 3;   // 允许中途“跳过”多识别/漏识别的行
    const dp = [], back = [];
    for (let i = 0; i <= n; i++) {
      dp.push(new Array(m + 1).fill(0));
      back.push(new Array(m + 1).fill(0));
    }
    for (let i = 1; i <= n; i++) { dp[i][0] = dp[i - 1][0] + GAP_ITEM; back[i][0] = 1; }
    for (let k = 1; k <= m; k++) { dp[0][k] = dp[0][k - 1] + GAP_DATE; back[0][k] = 2; }
    for (let i = 1; i <= n; i++) {
      for (let k = 1; k <= m; k++) {
        const match = dp[i - 1][k - 1] + dist(items[i - 1], dates[k - 1]);
        const skipItem = dp[i - 1][k] + GAP_ITEM;
        const skipDate = dp[i][k - 1] + GAP_DATE;
        let best = match, act = 0;
        if (skipItem < best) { best = skipItem; act = 1; }
        if (skipDate < best) { best = skipDate; act = 2; }
        dp[i][k] = best; back[i][k] = act;
      }
    }
    // 回溯：0=配对，1=这笔没有日期，2=这个日期是多出来的（如分组标题）
    let i = n, k = m;
    while (i > 0 && k > 0) {
      const act = back[i][k];
      if (act === 0) { items[i - 1].date = dates[k - 1].info; i--; k--; }
      else if (act === 1) { i--; }
      else { k--; }
    }
  }

  // 仍没配到日期的账单：账单列表按时间连续排列，沿用最近一笔已识别的日期，
  // 比直接退回「今天」更接近真实（截图被裁切、OCR 漏行时很常见）。
  if (items.some((it) => it.date)) {
    const known = items.filter((it) => it.date);
    for (const it of items) {
      if (it.date) continue;
      let best = null, bestD = Infinity;
      for (const k of known) {
        const d2 = Math.abs(k.start - it.start);
        if (d2 < bestD) { bestD = d2; best = k; }
      }
      if (best) it.date = best.date;
    }
  }

  const hasTxTime = lines.some((s) => /(转账时间|支付时间|交易时间)/.test(s));
  if (hasTxTime && items.length > 0 && items.length <= 3) {
    const detail = detailDate(lines, yearHint);
    if (detail) for (const it of items) { it.date = null; it._force = detail; }
  }

  let fallback = dates.length ? '' : detailDate(lines, yearHint);
  if (!fallback) fallback = today;

  const records = [];
  for (const it of items) {
    const d = it._force || mkDate(it.date, yearHint) || fallback;
    const note = cleanNote(it.desc.join(' '));
    const rec = {
      date: d,
      type: decideType(it.sign, note, it.type || forced),
      amount: Math.round(it.amount * 100) / 100,
      note,
    };
    if (records.length && (['date', 'amount', 'note']).every((k) => records[records.length - 1][k] === rec[k])) continue;
    records.push(rec);
  }

  if (!records.length) {
    const notes = [];
    for (const s of lines) {
      const amt = parseAmount(s);
      if (amt) {
        const note = cleanNote(notes.slice(-2).join(' '));
        records.push({
          date: fallback,
          type: decideType(amt[0], note, null),
          amount: Math.round(amt[1] * 100) / 100,
          note,
        });
      } else if (!isNoise(s) && !isJunk(s) && s.length <= 40) {
        notes.push(s);
      }
    }
    return records.slice(0, 3);
  }

  return records;
}

export default parseBills;
