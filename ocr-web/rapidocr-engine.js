// RapidOCR 浏览器端引擎（PP-OCRv6 small，纯前端，零服务器）
// 算法严格对齐本地 Python 版 rapidocr 包：
//   - 检测：DB（Differentiable Binarization）+ 轮廓 + 外扩(unclip) + 最小外接矩形
//   - 方向分类：LCNet 二分类（0 / 180）
//   - 识别：CRNN + CTC 贪心解码
// 仅需 onnxruntime-web（WASM/WebGPU）与 3 个 onnx 模型 + 1 个字库文本文件。
//
// 用法：
//   import { RapidOCREngine } from './rapidocr-engine.js';
//   const ocr = new RapidOCREngine();
//   await ocr.init({ detUrl, recUrl, clsUrl, vocabUrl, wasmPaths });
//   const { text, lines } = await ocr.recognize(canvasOrImageData);

// onnxruntime-web 通过 init() 动态加载，兼顾浏览器(CDN ESM)与 Node(本地 CJS)。

// ===== 与 rapidocr/config.yaml + default_models.yaml 完全一致的参数 =====
const DET = {
  limit_side_len: 736,
  limit_type: 'min',
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5],
  thresh: 0.3,
  box_thresh: 0.5,
  max_candidates: 1000,
  unclip_ratio: 1.6,
  use_dilation: true,
  score_mode: 'fast',
};
const CLS = { imgH: 48, imgW: 192, thresh: 0.9, label_list: ['0', '180'] };
const REC = { imgH: 48, imgW: 320 };

// ---------- 通用图像工具 ----------
function resizeRGBA(src, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(y * yr));
    const sy1 = Math.min(sh - 1, sy + 1);
    const ty = y * yr - sy;
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(x * xr));
      const sx1 = Math.min(sw - 1, sx + 1);
      const tx = x * xr - sx;
      for (let c = 0; c < 4; c++) {
        const v00 = src[(sy * sw + sx) * 4 + c];
        const v10 = src[(sy * sw + sx1) * 4 + c];
        const v01 = src[(sy1 * sw + sx) * 4 + c];
        const v11 = src[(sy1 * sw + sx1) * 4 + c];
        const top = v00 + (v10 - v00) * tx;
        const bot = v01 + (v11 - v01) * tx;
        out[(y * dw + x) * 4 + c] = top + (bot - top) * ty;
      }
    }
  }
  return out;
}

// 把 rgba 归一化到 CHW Float32（(x/255 - mean)/std）
function rgbaToCHWNorm(rgba, w, h, mean, std) {
  const chw = new Float32Array(3 * w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        chw[c * w * h + y * w + x] = (rgba[p + c] / 255 - mean[c]) / std[c];
      }
    }
  }
  return chw;
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const intersect = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------- 凸包（Andrew monotone chain） ----------
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// ---------- 旋转卡壳求最小外接矩形 ----------
function minAreaRect(points) {
  const hull = convexHull(points);
  const n = hull.length;
  if (n <= 2) {
    // 退化：用首尾点构成
    return hull.length >= 2 ? [hull[0], hull[hull.length - 1]] : hull;
  }
  let best = { area: Infinity, box: null };
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / len, uy = dy / len;       // 边方向
    const vx = -uy, vy = ux;                   // 垂直方向
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const pu = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
      const pv = (p[0] - a[0]) * vx + (p[1] - a[1]) * vy;
      if (pu < minU) minU = pu; if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv; if (pv > maxV) maxV = pv;
    }
    const w = maxU - minU, h = maxV - minV;
    const area = w * h;
    if (area < best.area) {
      const cx = a[0] + ux * (minU + maxU) / 2 + vx * (minV + maxV) / 2;
      const cy = a[1] + uy * (minU + maxU) / 2 + vy * (minV + maxV) / 2;
      const ang = Math.atan2(uy, ux);
      best = { area, box: { cx, cy, w, h, ang } };
    }
  }
  return best.box;
}

// 生成 4 个角点，并按 rapidocr get_mini_boxes 排序：
// 先按 x 排序；左两点按 y 取 (tl, bl)，右两点按 y 取 (tr, br)
function miniBoxCorners(box) {
  const { cx, cy, w, h, ang } = box;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const hw = w / 2, hh = h / 2;
  const corners = [
    [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
  ].map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
  corners.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let i1, i4, i2, i3;
  if (corners[1][1] > corners[0][1]) { i1 = 0; i4 = 1; } else { i1 = 1; i4 = 0; }
  if (corners[3][1] > corners[2][1]) { i2 = 2; i3 = 3; } else { i2 = 3; i3 = 2; }
  return [corners[i1], corners[i2], corners[i3], corners[i4]]; // tl, tr, br, bl
}

// ---------- 多边形外扩（unclip） ----------
function lineIntersection(p1, p2, p3, p4) {
  const a1 = p2[1] - p1[1], b1 = p1[0] - p2[0];
  const c1 = a1 * p1[0] + b1 * p1[1];
  const a2 = p4[1] - p3[1], b2 = p3[0] - p4[0];
  const c2 = a2 * p3[0] + b2 * p3[1];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-9) return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}
function unclip(poly, ratio) {
  // 计算面积与周长（shoelace + 边长和）
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  area = Math.abs(area) / 2;
  let peri = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    peri += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  if (peri < 1e-6) return poly;
  const d = (area * ratio) / peri;
  // 确保多边形为 CCW（外法线方向 = 边的右手法线）
  let signed = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    signed += a[0] * b[1] - b[0] * a[1];
  }
  const pts = signed < 0 ? poly.slice().reverse() : poly.slice();
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    const dx1 = b[0] - a[0], dy1 = b[1] - a[1];
    const L1 = Math.hypot(dx1, dy1) || 1e-6;
    // 边 a->b 的外法线（CCW 多边形，外法线在边的右侧）
    let nx = dy1 / L1, ny = -dx1 / L1;
    const mx = a[0] + nx * d, my = a[1] + ny * d;
    const mx2 = b[0] + nx * d, my2 = b[1] + ny * d;
    // 下一条边 b->c 的外法线
    const dx2 = c[0] - b[0], dy2 = c[1] - b[1];
    const L2 = Math.hypot(dx2, dy2) || 1e-6;
    let nx2 = dy2 / L2, ny2 = -dx2 / L2;
    const cx2 = b[0] + nx2 * d, cy2 = b[1] + ny2 * d;
    out.push(lineIntersection([mx, my], [mx2, my2], [b[0], b[1]], [cx2, cy2]));
  }
  return out;
}

// ---------- 连通域标注 ----------
function labelComponents(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const stack = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] && !seen[idx]) {
        const comp = [];
        stack.length = 0; stack.push(idx);
        seen[idx] = 1;
        while (stack.length) {
          const cur = stack.pop();
          const cx = cur % w, cy = (cur / w) | 0;
          comp.push([cx, cy]);
          const nb = [];
          if (cx > 0) nb.push(cur - 1);
          if (cx < w - 1) nb.push(cur + 1);
          if (cy > 0) nb.push(cur - w);
          if (cy < h - 1) nb.push(cur + w);
          for (const n of nb) {
            if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
          }
        }
        comps.push(comp);
      }
    }
  }
  return comps;
}

function orderPointsClockwise(pts) {
  const xSorted = pts.slice().sort((a, b) => a[0] - b[0]);
  const left = xSorted.slice(0, 2).sort((a, b) => a[1] - b[1]);
  const right = xSorted.slice(2).sort((a, b) => a[1] - b[1]);
  return [left[0], right[0], right[1], left[1]]; // tl, tr, br, bl
}

function dbPostProcess(pred, srcW, srcH, detW, detH, mask0) {
  const seg = new Uint8Array(detW * detH);
  for (let i = 0; i < seg.length; i++) seg[i] = pred[i] > DET.thresh ? 1 : 0;
  if (DET.use_dilation) {
    const dilated = new Uint8Array(seg);
    for (let y = 0; y < detH; y++) {
      for (let x = 0; x < detW; x++) {
        if (seg[y * detW + x]) {
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < detH && nx < detW) dilated[ny * detW + nx] = 1;
          }
        }
      }
    }
    seg.set(dilated);
  }
  const comps = labelComponents(seg, detW, detH);
  const boxes = [], scores = [];
  for (const comp of comps) {
    if (comp.length < DET.min_size) continue;
    const pts = comp.map((p) => [p[0], p[1]]);
    let box = minAreaRect(pts);
    if (!box) continue;
    let corners = miniBoxCorners(box);
    const sside = Math.min(box.w, box.h);
    if (sside < DET.min_size) continue;
    // box_score_fast
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const p of corners) {
      xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]);
      ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]);
    }
    xmin = Math.max(0, Math.floor(xmin)); xmax = Math.min(detW - 1, Math.ceil(xmax));
    ymin = Math.max(0, Math.floor(ymin)); ymax = Math.min(detH - 1, Math.ceil(ymax));
    let sum = 0, cnt = 0;
    for (let y = ymin; y <= ymax; y++) {
      for (let x = xmin; x <= xmax; x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, corners) && seg[y * detW + x]) {
          sum += pred[y * detW + x]; cnt++;
        }
      }
    }
    const score = cnt > 0 ? sum / cnt : 0;
    if (DET.box_thresh > score) continue;
    const expanded = unclip(corners, DET.unclip_ratio);
    box = minAreaRect(expanded);
    if (!box) continue;
    corners = miniBoxCorners(box);
    if (Math.min(box.w, box.h) < DET.min_size + 2) continue;
    // 缩放回原图
    const scaled = corners.map((p) => [
      Math.max(0, Math.min(srcW - 1, Math.round((p[0] / detW) * srcW))),
      Math.max(0, Math.min(srcH - 1, Math.round((p[1] / detH) * srcH))),
    ]);
    boxes.push(scaled);
    scores.push(score);
  }
  return { boxes, scores };
}

// ---------- CTC 解码（对齐 CTCLabelDecode） ----------
function ctcDecode(preds, vocab) {
  const L = preds.length;                 // 序列长度
  const C = preds[0].length;              // 类别数
  const idx = new Int32Array(L);
  const prob = new Float32Array(L);
  for (let t = 0; t < L; t++) {
    let bi = 0, bv = -Infinity;
    for (let c = 0; c < C; c++) if (preds[t][c] > bv) { bv = preds[t][c]; bi = c; }
    idx[t] = bi; prob[t] = bv;
  }
  const chars = [];
  const confs = [];
  for (let t = 0; t < L; t++) {
    if (idx[t] === 0) continue;           // blank
    if (t > 0 && idx[t] === idx[t - 1]) continue; // 去重
    chars.push(vocab[idx[t]] || '');
    confs.push(prob[t]);
  }
  const text = chars.join('');
  const score = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  return { text, score };
}

// 按 y 聚行、行内按 x 排序（对齐 sorted_boxes）
function sortBoxes(boxes, scores) {
  if (!boxes.length) return { boxes, scores };
  const arr = boxes.map((b, i) => ({ b, s: scores[i], y: b[0][1], x: b[0][0] }));
  const byY = arr.slice().sort((a, b) => a.y - b.y);
  const lineIds = [0];
  for (let i = 1; i < byY.length; i++) {
    lineIds.push((byY[i].y - byY[i - 1].y) >= 10 ? lineIds[i - 1] + 1 : lineIds[i - 1]);
  }
  const order = byY.map((o, i) => ({ o, line: lineIds[i] }))
    .sort((a, b) => a.line - b.line || a.o.x - b.o.x);
  return {
    boxes: order.map((x) => x.o.b),
    scores: order.map((x) => x.o.s),
  };
}

export class RapidOCREngine {
  constructor(opts = {}) {
    this.opts = opts;
    this.sessionDet = null;
    this.sessionRec = null;
    this.sessionCls = null;
    this.vocab = null; // [blank,'字',...,' ']
  }

  async _loadSession(url, ep) {
    return this.ort.InferenceSession.create(url, {
      executionProviders: ep || ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }

  async init(opts = {}) {
    const ortNs = await import(opts.ortUrl || 'onnxruntime-web');
    const ort = this.ort = (ortNs.default && ortNs.default.InferenceSession) ? ortNs.default : ortNs;
    if (opts.wasmPaths && this.ort.env && this.ort.env.wasm) this.ort.env.wasm.wasmPaths = opts.wasmPaths;
    if (this.ort.env && this.ort.env.wasm) this.ort.env.wasm.numThreads = 1;
    const o = Object.assign(this.opts, opts);
    this.sessionDet = await this._loadSession(o.detUrl);
    this.sessionRec = await this._loadSession(o.recUrl);
    this.sessionCls = await this._loadSession(o.clsUrl);
    // 字库：每行一个字符；按 CTCLabelDecode：blank@0, 原字@1.. , ' '@end
    let raw = o.vocab;
    if (!Array.isArray(raw) && o.vocabUrl) {
      const txt = await (await fetch(o.vocabUrl)).text();
      raw = txt.split('\n').map((s) => s.replace(/\r$/, '')).filter((s) => s !== '');
    }
    raw = raw || [];
    this.vocab = [''].concat(raw, [' ']);
    return this;
  }

  // 统一的输入：接受 canvas / ImageData / {width,height,data(rgba Uint8ClampedArray)}
  _getRGBA(input) {
    if (input && input.width && input.height && input.data) {
      return { w: input.width, h: input.height, rgba: new Uint8ClampedArray(input.data) };
    }
    if (typeof document !== 'undefined') {
      let canvas = input;
      if (input instanceof HTMLImageElement || input instanceof Image) {
        canvas = document.createElement('canvas');
        canvas.width = input.naturalWidth; canvas.height = input.naturalHeight;
        canvas.getContext('2d').drawImage(input, 0, 0);
      } else if (input instanceof ImageBitmap) {
        canvas = document.createElement('canvas');
        canvas.width = input.width; canvas.height = input.height;
        canvas.getContext('2d').drawImage(input, 0, 0);
      }
      const ctx = canvas.getContext('2d');
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { w: canvas.width, h: canvas.height, rgba: id.data };
    }
    throw new Error('无法解析图像输入');
  }

  async recognize(input) {
    const { w, h, rgba } = this._getRGBA(input);

    // ===== 检测 =====
    let ratio = 1;
    const minSide = Math.min(h, w);
    if (DET.limit_type === 'min' && minSide < DET.limit_side_len) ratio = DET.limit_side_len / minSide;
    let rh = Math.max(32, Math.round((h * ratio) / 32) * 32);
    let rw = Math.max(32, Math.round((w * ratio) / 32) * 32);
    const detImg = resizeRGBA(rgba, w, h, rw, rh);
    const detChw = rgbaToCHWNorm(detImg, rw, rh, DET.mean, DET.std);
    const detTensor = new this.ort.Tensor('float32', detChw, [1, 3, rh, rw]);
    const detOut = await this.sessionDet.run({ x: detTensor });
    const detName = this.sessionDet.outputNames[0];
    const pred = detOut[detName].data; // Float32Array, length rh*rw
    const { boxes, scores } = dbPostProcess(pred, w, h, rw, rh, null);
    const sorted = sortBoxes(boxes, scores);

    const lines = [];
    for (let i = 0; i < sorted.boxes.length; i++) {
      const poly = sorted.boxes[i];
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (const p of poly) {
        xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]);
        ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]);
      }
      xmin = Math.max(0, Math.floor(xmin)); xmax = Math.min(w - 1, Math.ceil(xmax));
      ymin = Math.max(0, Math.floor(ymin)); ymax = Math.min(h - 1, Math.ceil(ymax));
      if (xmax <= xmin || ymax <= ymin) continue;
      // 裁剪 rgba 子区域
      const cw = xmax - xmin, ch = ymax - ymin;
      const sub = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const sp = ((ymin + y) * w + (xmin + x)) * 4;
          const dp = (y * cw + x) * 4;
          sub[dp] = rgba[sp]; sub[dp + 1] = rgba[sp + 1];
          sub[dp + 2] = rgba[sp + 2]; sub[dp + 3] = rgba[sp + 3];
        }
      }
      // ===== 方向分类 =====
      const clsRes = await this._classify(sub, cw, ch);
      let recRgba = sub, recW = cw, recH = ch;
      if (clsRes && clsRes.label === '180' && clsRes.score > CLS.thresh) {
        const rot = rotateRGBA180(sub, cw, ch);
        recRgba = rot; // 尺寸不变（180 度）
      }
      // ===== 识别 =====
      const text = await this._recognizeOne(recRgba, recW, recH);
      lines.push({ text, score: sorted.scores[i], box: poly });
    }

    const text = lines.map((l) => l.text).join('\n');
    return { text, lines };
  }

  async _classify(rgba, w, h) {
    const ratio = w / h;
    let rw = CLS.imgW;
    if (Math.ceil(CLS.imgH * ratio) > CLS.imgW) rw = CLS.imgW;
    else rw = Math.ceil(CLS.imgH * ratio);
    const img = resizeRGBA(rgba, w, h, rw, CLS.imgH);
    const chw = new Float32Array(3 * CLS.imgW * CLS.imgH);
    for (let y = 0; y < CLS.imgH; y++) {
      for (let x = 0; x < CLS.imgW; x++) {
        const sx = x < rw ? x : rw - 1;
        const p = (y * rw + sx) * 4;
        for (let c = 0; c < 3; c++) chw[c * CLS.imgW * CLS.imgH + y * CLS.imgW + x] = img[p + c] / 255;
      }
    }
    // (x/255 - 0.5)/0.5
    for (let i = 0; i < chw.length; i++) chw[i] = (chw[i] - 0.5) / 0.5;
    const tensor = new this.ort.Tensor('float32', chw, [1, 3, CLS.imgH, CLS.imgW]);
    const out = await this.sessionCls.run({ x: tensor });
    const o = out[this.sessionCls.outputNames[0]].data;
    const bi = o[0] > o[1] ? 0 : 1;
    return { label: CLS.label_list[bi], score: Math.max(o[0], o[1]) };
  }

  async _recognizeOne(rgba, w, h) {
    const ratio = w / h;
    let rw = Math.min(REC.imgW, Math.ceil(REC.imgH * ratio));
    const img = resizeRGBA(rgba, w, h, rw, REC.imgH);
    const chw = new Float32Array(3 * REC.imgW * REC.imgH);
    for (let y = 0; y < REC.imgH; y++) {
      for (let x = 0; x < REC.imgW; x++) {
        const sx = x < rw ? x : rw - 1;
        const p = (y * rw + sx) * 4;
        for (let c = 0; c < 3; c++) chw[c * REC.imgW * REC.imgH + y * REC.imgW + x] = img[p + c] / 255;
      }
    }
    for (let i = 0; i < chw.length; i++) chw[i] = (chw[i] - 0.5) / 0.5;
    const tensor = new this.ort.Tensor('float32', chw, [1, 3, REC.imgH, REC.imgW]);
    const out = await this.sessionRec.run({ x: tensor });
    const o = out[this.sessionRec.outputNames[0]].data; // [1, L, C] 或 [L, C]
    const L = this.sessionRec.outputNames ? o.length / this.vocab.length : o.length;
    // 处理维度：若第一维为 1（batch）则去掉
    let seq;
    if (o.length % this.vocab.length === 0) {
      const seqLen = o.length / this.vocab.length;
      seq = [];
      for (let t = 0; t < seqLen; t++) {
        seq.push(o.slice(t * this.vocab.length, (t + 1) * this.vocab.length));
      }
    } else {
      // 已经是 [L, C]
      const seqLen = o.length / (o[0].length || this.vocab.length);
      seq = [];
      for (let t = 0; t < seqLen; t++) seq.push(o[t]);
    }
    const r = ctcDecode(seq, this.vocab);
    return r.text;
  }
}

function rotateRGBA180(rgba, w, h) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = ((h - 1 - y) * w + (w - 1 - x)) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  }
  return out;
}

export default RapidOCREngine;
