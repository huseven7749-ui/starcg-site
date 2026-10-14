// 批次採購路線規劃（純函式，瀏覽器與 Node 測試共用）
// 距離：魔力寶貝可斜走，走一格（含斜角）算 1 步 → max(|dx|, |dy|)

export const START_POINTS = [
  { id: 'E1', x: 242, y: 100 }, { id: 'E2', x: 233, y: 78 },
  { id: 'S1', x: 141, y: 148 }, { id: 'S2', x: 162, y: 130 },
  { id: 'W1', x: 63, y: 79 }, { id: 'W2', x: 72, y: 123 },
];
export const TOWN = '法蘭城';
export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** 「法蘭城 [東:219 南:132]」→ { map, x, y } */
export function parseLoc(loc, x, y) {
  const s = String(loc ?? '');
  const m = s.match(/\[東[:：](\d+)\s*南[:：](\d+)\]/);
  const map = s.split('[')[0].trim() || TOWN;
  return { map, x: x ?? (m ? +m[1] : null), y: y ?? (m ? +m[2] : null) };
}

/** 路線排序：最近鄰 ＋ 2-opt（從起點出發、不回起點） */
export function orderRoute(start, pts) {
  if (pts.length < 2) return [...pts];
  const left = [...pts], route = [];
  let cur = start;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (dist(cur, left[i]) < dist(cur, left[bi])) bi = i;
    cur = left.splice(bi, 1)[0];
    route.push(cur);
  }
  const len = r => r.reduce((s, p, i) => s + dist(i ? r[i - 1] : start, p), 0);
  let improved = true, guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const cand = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        if (len(cand) < len(route)) { route.splice(0, route.length, ...cand); improved = true; }
      }
    }
  }
  return route;
}

const norm = s => String(s ?? '').normalize('NFKC').trim().replace(/^\[(.*)\]$/, '$1');

/**
 * 規劃一組（同分流、同幣別）的採購
 * @param o {
 *   needs: [{ name, qty }],
 *   listings: [{ name, p, q, stall: { key, n, x, y, map, sv } }],
 *   start: { x, y, map }, strategy: 'route' | 'fewest' | 'price', basis: 'piece' | 'stack', tol: 0.15
 * }
 */
export function plan(o) {
  const basis = o.basis === 'stack' ? 'stack' : 'piece';
  const start = { map: TOWN, ...o.start };
  const rem = new Map();
  for (const n of o.needs) if (n.qty > 0) rem.set(norm(n.name), (rem.get(norm(n.name)) || 0) + Math.floor(n.qty));
  const all = o.listings.filter(l => rem.has(norm(l.name)) && l.q > 0 && l.p > 0);
  const onMap = all.filter(l => l.stall.map === start.map && Number.isFinite(l.stall.x) && Number.isFinite(l.stall.y));
  const offMap = all.filter(l => !onMap.includes(l));
  const unit = l => (basis === 'stack' ? l.p / l.q : l.p);
  const left = new Map(onMap.map(l => [l, l.q]));         // 每個攤位商品剩餘數量
  const minUnit = new Map();
  for (const l of onMap) { const k = norm(l.name); minUnit.set(k, Math.min(minUnit.get(k) ?? Infinity, unit(l))); }
  const visits = new Map();                                 // stall.key → { stall, buys: [] }
  const take = (l, want) => {
    const avail = left.get(l);
    if (!(avail > 0) || want <= 0) return 0;
    let k, cost;
    if (basis === 'stack') { if (avail < l.q) return 0; k = l.q; cost = l.p; }
    else { k = Math.min(want, avail); cost = k * l.p; }
    left.set(l, avail - k);
    const v = visits.get(l.stall.key) || { stall: l.stall, buys: [] };
    v.buys.push({ name: l.name, k, unit: unit(l), price: l.p, cost });
    visits.set(l.stall.key, v);
    return k;
  };
  const buyAt = (stallKey, okUnit = () => true) => {
    const ls = onMap.filter(l => l.stall.key === stallKey && left.get(l) > 0 && rem.get(norm(l.name)) > 0 && okUnit(l)).sort((a, b) => unit(a) - unit(b));
    let got = 0;
    for (const l of ls) {
      const k = norm(l.name), need = rem.get(k);
      if (!(need > 0)) continue;
      const g = take(l, need);
      rem.set(k, Math.max(0, need - g));
      got += g;
    }
    return got;
  };
  const stalls = () => [...new Map(onMap.map(l => [l.stall.key, l.stall])).values()];
  const coverage = (st, okUnit = () => true) => {
    const byItem = new Map();
    for (const l of onMap) {
      if (l.stall.key !== st.key || !(left.get(l) > 0) || !okUnit(l)) continue;
      const k = norm(l.name);
      if (!(rem.get(k) > 0)) continue;
      byItem.set(k, (byItem.get(k) || 0) + left.get(l));
    }
    let c = 0;
    for (const [k, a] of byItem) c += Math.min(a, rem.get(k));
    return c;
  };
  const remaining = () => [...rem.values()].some(v => v > 0);

  if (o.strategy === 'price') {
    for (const [k] of rem) {
      const ls = onMap.filter(l => norm(l.name) === k).sort((a, b) => unit(a) - unit(b) || dist(start, a.stall) - dist(start, b.stall));
      for (const l of ls) {
        const need = rem.get(k);
        if (!(need > 0)) break;
        rem.set(k, Math.max(0, need - take(l, need)));
      }
    }
  } else if (o.strategy === 'fewest') {
    let pos = start;
    while (remaining()) {
      let best = null;
      for (const st of stalls()) {
        const c = coverage(st);
        if (!c) continue;
        const d = dist(pos, st);
        if (!best || c > best.c || (c === best.c && d < best.d)) best = { st, c, d };
      }
      if (!best) break;
      buyAt(best.st.key);
      pos = best.st;
    }
  } else { // 路程優先：只考慮不超過最低價 (1 + tol) 的攤位，從目前位置走最近的
    const tol = Number.isFinite(o.tol) ? o.tol : 0.15;
    let ok = l => unit(l) <= minUnit.get(norm(l.name)) * (1 + tol) + 1e-9;
    let pos = start;
    while (remaining()) {
      let best = null;
      for (const st of stalls()) {
        const c = coverage(st, ok);
        if (!c) continue;
        const d = dist(pos, st);
        if (!best || d < best.d || (d === best.d && c > best.c)) best = { st, c, d };
      }
      if (!best) {
        if (ok.relaxed) break;
        ok = () => true; ok.relaxed = true; // 便宜攤位買完了，改用其他價格的攤位
        continue;
      }
      buyAt(best.st.key, ok);
      pos = best.st;
    }
  }

  const ordered = orderRoute(start, [...visits.values()].map(v => v.stall));
  let prev = start, walked = 0, total = 0;
  const steps = ordered.map((st, i) => {
    const v = visits.get(st.key);
    const d = dist(prev, st);
    walked += d; prev = st;
    const cost = v.buys.reduce((s, b) => s + b.cost, 0);
    total += cost;
    return { i: i + 1, stall: st, d, walked, buys: v.buys, cost, total };
  });
  const bought = new Map();
  for (const s of steps) for (const b of s.buys) bought.set(norm(b.name), (bought.get(norm(b.name)) || 0) + b.k);
  const needMap = new Map(o.needs.map(n => [norm(n.name), n.qty]));
  const unmet = [...rem.entries()].filter(([, v]) => v > 0).map(([name, qty]) => ({ name, qty }));
  const over = [...bought.entries()].filter(([k, v]) => v > (needMap.get(k) || 0)).map(([name, v]) => ({ name, qty: v - needMap.get(name) }));
  // 其他地圖：每項列出最便宜的攤位供參考
  const offBest = new Map();
  for (const l of offMap) { const k = norm(l.name); if (!offBest.has(k) || unit(l) < unit(offBest.get(k))) offBest.set(k, l); }
  return { steps, total, walked, stalls: steps.length, unmet, over, offMap: [...offBest.values()] };
}
