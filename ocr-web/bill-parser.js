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
  /^(账单|全部账单|收支统计|收支明细|账单详情|账单服务|交易记录|交易明细|查找交易|搜索|筛选|更多|全部)[>＞\s]*$/,
  /^[A-Za-z]?\s*(查找交易|收支统计|全部账单)[>＞]*$/,
  /^(微信支付|支付宝|微信|收款|付款|财付通)$/,
  /^(支出|收入)\s*[¥￥]?\s*[\d,]+\.\d{1,2}\s*(收入|支出)?\s*[¥￥]?\s*[\d,]*\.?\d*$/,
  /支出.*收入|收入.*支出/,
  /^(余额|零钱|零钱通|银行卡?余额|账户余额)/,
  /^(当前状态|交易单号|商户单号|订单号|转账单号|转账说明|转账时间|创建时间|支付时间|支付方式|付款方式|收款方式|账单分类|收款方备注|付款方留言|收款方服务|收款方名片|转账记录|退款记录)$/,
  /^(本服务由财付通提供|定位到聊天位置|查看往来转账|对订单有疑惑|发起群收款|申请电子凭证|内容由AI生成|仅供参考)/,
  /^已退款\s*[¥￥]?[\d,]+\.?\d*/,
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

function matchDatePrefix(s) {
  const compact = s.replace(/\s+/g, '');
  for (const rx of [RE_DATE_CN, RE_DATE_FULL]) {
    const m = rx.exec(compact);
    if (!m) continue;
    const g = m.slice(1).map((x) => (x == null ? null : x));
    const month = parseInt(g[1], 10), day = parseInt(g[2], 10);
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
    let rest = compact.slice(m[0].length);
    const tm = RE_TIME.exec(rest);
    if (tm) rest = rest.slice(tm[0].length);
    return [{ year: g[0] ? parseInt(g[0], 10) : null, month, day }, rest];
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
  s = s.replace(/^(?:[A-Za-z0-9]{1,6}[\s.、]+)+/, '');
  s = s.replace(/^[·•\-—\s|]+/, '');
  s = s.replace(/[.。·…\s\-|]+$/, '');
  s = s.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s.slice(0, 80);
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

  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    const isAmtLine = parseAmount(s) !== null;
    if (!isAmtLine && isNoise(s)) continue;

    const [dinfo, rest] = matchDatePrefix(s);
    if (dinfo) {
      pending = [];
      if (rest) {
        const tail = findAmountTail(rest);
        if (tail && !/(退款|余额|合计)/.test(rest)) {
          const [sign, val, desc] = tail;
          items.push({ desc: [desc], sign, amount: val, start: i, end: i, date: dinfo });
          pending = [];
          continue;
        }
        if (/(退款|余额|合计)/.test(rest)) continue;
        pending.push(rest);
      }
      dates.push({ idx: i, info: dinfo });
      continue;
    }

    const amt = parseAmount(s);
    if (amt) {
      items.push({ desc: pending.slice(), sign: amt[0], amount: amt[1], start: i, end: i, type: forced });
      pending = [];
      forced = null;
      continue;
    }

    if (s.trim() === '收入' || s.trim() === '支出') {
      forced = s.trim();
      continue;
    }

    if (isJunk(s)) continue;

    pending.push(s);
  }

  // 第二遍：日期与交易配对（第 k 个日期配第 k 笔，兼容日期在金额前/后）
  function dist(item, d) {
    const lo = item.start - 1, hi = item.end + 1;
    if (lo <= d.idx && d.idx <= hi) return 0;
    return Math.min(Math.abs(d.idx - item.start), Math.abs(d.idx - item.end));
  }
  if (items.length && dates.length) {
    let best = null;
    for (let off = -3; off <= 3; off++) {
      const pairs = [];
      for (let k = 0; k < dates.length; k++) {
        const j = k + off;
        if (j >= 0 && j < items.length) pairs.push([j, k]);
      }
      if (!pairs.length) continue;
      let score = 0;
      for (const [j, k] of pairs) score += dist(items[j], dates[k]);
      score += 3 * (items.length - pairs.length) + 3 * (dates.length - pairs.length);
      if (best === null || score < best[0]) best = [score, pairs];
    }
    if (best) for (const [j, k] of best[1]) items[j].date = dates[k].info;
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
