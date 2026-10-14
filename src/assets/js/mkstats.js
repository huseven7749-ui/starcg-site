// 市場統計（純函式，瀏覽器與 Node 測試共用）
// 成交紀錄格式：{ t: Unix 秒, n: 名稱, q: 數量, p: 單價（上架價）, c: 0 魔幣／1 魔晶 }

export const FEE = { 0: 0.10, 1: 0.06 };          // 官方手續費：魔幣 10%、魔晶 6%
export const MIN_TRADES_FOR_REF = 5;               // 成交筆數不足時不提供參考價
const DAY = 86400;

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export const stripBr = s => String(s ?? '').trim().replace(/^\[(.*)\]$/, '$1');

/** 單一幣別的成交統計（均價依數量加權） */
export function tradeStats(logs) {
  if (!logs.length) return { count: 0, qty: 0 };
  const ps = logs.map(l => l.p).sort((a, b) => a - b);
  let qty = 0, sum = 0, last = logs[0];
  for (const l of logs) { qty += l.q; sum += l.p * l.q; if (l.t > last.t) last = l; }
  return {
    count: logs.length, qty, min: ps[0], max: ps[ps.length - 1], wavg: sum / qty,
    median: quantile(ps, 0.5), p25: quantile(ps, 0.25), p75: quantile(ps, 0.75), last: last.p, lastT: last.t,
  };
}

/** 依台灣日期分組的每日加權單價 */
export function dailyWeighted(logs) {
  const days = new Map();
  for (const l of [...logs].sort((a, b) => a.t - b.t)) {
    const d = new Date((l.t + 8 * 3600) * 1000);
    const key = d.toISOString().slice(0, 10);
    const g = days.get(key) || { key, label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, qty: 0, sum: 0, count: 0, prices: [] };
    g.qty += l.q; g.sum += l.p * l.q; g.count++; g.prices.push(l.p);
    days.set(key, g);
  }
  return [...days.values()].map(g => ({ key: g.key, label: g.label, count: g.count, qty: g.qty, wavg: g.sum / g.qty, median: quantile(g.prices.sort((a, b) => a - b), 0.5) }));
}

/** 篩選期間（天數；0＝全部） */
export function inPeriod(logs, days, now = Date.now() / 1000) {
  return days > 0 ? logs.filter(l => l.t >= now - days * DAY) : logs;
}

/**
 * 擺攤定價參考
 * @param logs 某商品、某幣別的成交紀錄
 * @param asks 同商品、同幣別目前攤位的每件掛價陣列
 */
export function pricingRef(logs, asks) {
  const s = tradeStats(logs);
  const minAsk = asks.length ? Math.min(...asks) : null;
  const enough = s.count >= MIN_TRADES_FOR_REF;
  return {
    enough, count: s.count,
    median: enough ? s.median : null, p25: enough ? s.p25 : null, p75: enough ? s.p75 : null, wavg: enough ? s.wavg : null,
    minAsk, asks: asks.length,
    diff: enough && minAsk != null ? s.wavg - minAsk : null,
    diffPct: enough && minAsk ? (s.wavg - minAsk) / minAsk : null,
  };
}

/** 試算售價：實收、與行情比較、在目前攤位中的排名 */
export function trialPrice(price, c, logs, asks) {
  const p = Number(price);
  if (!(p > 0)) return null;
  const net = Math.floor(p * (1 - FEE[c]));
  const ref = pricingRef(logs, asks);
  const ps = logs.map(l => l.p);
  const atOrAbove = ps.length ? ps.filter(x => x >= p).length / ps.length : null;
  const rank = asks.filter(a => a < p).length + 1;
  let zone = null;
  if (ref.enough) zone = p < ref.p25 ? 'low' : p > ref.p75 ? 'high' : 'mid';
  return { price: p, net, fee: p - net, vsMedian: ref.enough ? (p - ref.median) / ref.median : null, atOrAbove, rank, of: asks.length + 1, zone, ref };
}

// ───── 匯入／匯出 ─────
const HEAD = {
  t: ['t', 'time', 'date', '時間', '日期', '成交時間', '시간'],
  n: ['n', 'name', 'item', '商品', '名稱', '道具', '品名', '상품', '이름'],
  q: ['q', 'qty', 'quantity', '數量', '個數', '수량'],
  p: ['p', 'price', 'unit', 'unit_price', '單價', '價格', '단가', '가격'],
  c: ['c', 'currency', '幣別', '貨幣', '화폐'],
};
function parseCurrency(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['1', 'crystal', '魔晶', '마정석', 'c'].includes(s)) return 1;
  if (['0', 'coin', 'gold', '魔幣', '金幣', '골드', 'g', ''].includes(s)) return 0;
  return null;
}
function parseTime(v) {
  if (v == null || v === '') return null;
  if (/^\d{9,13}$/.test(String(v).trim())) { const n = Number(v); return n > 1e12 ? Math.floor(n / 1000) : n; }
  const m = String(v).trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0) - 8, +(m[5] || 0), +(m[6] || 0)) / 1000); // 台灣時間
}
function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
/** 解析 CSV 或 JSON 成交紀錄 → { records, errors } */
export function parseImport(text) {
  const src = String(text ?? '').replace(/^﻿/, '').trim();
  const records = [], errors = [];
  const push = (o, line) => {
    const r = { t: parseTime(o.t), n: stripBr(o.n), q: Math.max(1, Math.floor(Number(o.q) || 1)), p: Number(String(o.p ?? '').replace(/[,\s]/g, '')), c: parseCurrency(o.c) };
    if (!r.n || !(r.p > 0) || r.t == null || r.c == null) { errors.push(line); return; }
    records.push(r);
  };
  if (!src) return { records, errors };
  if (src[0] === '[' || src[0] === '{') {
    let arr;
    try { arr = JSON.parse(src); } catch { return { records, errors: ['JSON'] }; }
    if (!Array.isArray(arr)) arr = arr.records || arr.logs || [];
    arr.forEach((o, i) => push({ t: o.t ?? o.time ?? o.ts, n: o.n ?? o.name ?? o.item_name, q: o.q ?? o.qty, p: o.p ?? o.price ?? o.unit_price, c: o.c ?? o.currency ?? o.pricetype }, i + 1));
    return { records, errors };
  }
  const lines = src.split(/\r?\n/).filter(l => l.trim());
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const idx = {};
  for (const [k, names] of Object.entries(HEAD)) idx[k] = head.findIndex(h => names.includes(h));
  const hasHead = Object.values(idx).filter(i => i >= 0).length >= 3;
  const order = hasHead ? idx : { t: 0, n: 1, q: 2, p: 3, c: 4 };
  lines.slice(hasHead ? 1 : 0).forEach((line, i) => {
    const cols = splitCsvLine(line);
    const get = k => (order[k] >= 0 ? cols[order[k]] : undefined);
    push({ t: get('t'), n: get('n'), q: get('q') ?? 1, p: get('p'), c: get('c') ?? 0 }, i + (hasHead ? 2 : 1));
  });
  return { records, errors };
}
/** 合併並去除重複（同時間、名稱、數量、單價、幣別） */
export function mergeRecords(a, b) {
  const seen = new Set(), out = [];
  for (const r of [...a, ...b]) {
    const k = `${r.t}|${r.n}|${r.q}|${r.p}|${r.c}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out.sort((x, y) => x.t - y.t);
}
export function twTime(t) {
  const d = new Date((t + 8 * 3600) * 1000), p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
