// 法蘭城地圖（真實地圖圖片＋ SVG 標記）：傳送石、起點、攤位與採購路線
import { esc, T } from './core.js';
import { START_POINTS } from './route.js';

// 圖片尺寸（src/assets/img/fran-city.jpg）
const IMG_W = 960, IMG_H = 685;
// 校正點：遊戲座標 (x=東, y=南) ↔ 圖片像素 (px, py)。至少三點，用最小平方法解仿射矩陣。
// 遊戲地圖是斜 45° 的菱形：東往右上、南往右下。
const CAL = [
  { x: 242, y: 100, px: 748, py: 352 },   // 東門傳送石 E1
  { x: 63, y: 79, px: 258, py: 404 },     // 西門傳送石 W1
  { x: 141, y: 148, px: 614, py: 530 },   // 南門傳送石 S1
  { x: 151, y: 40, px: 506, py: 234 },    // 北側（中央廣場北）
];
let M = null;   // [a, b, c, d, e, f]: px = a·x + b·y + c, py = d·x + e·y + f
function solve() {
  if (M) return M;
  // 正規方程式：對 px、py 各解一組 (a,b,c)
  const fit = key => {
    let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0, sxp = 0, syp = 0, sp = 0;
    for (const c of CAL) { const p = c[key]; sxx += c.x * c.x; sxy += c.x * c.y; sx += c.x; syy += c.y * c.y; sy += c.y; n++; sxp += c.x * p; syp += c.y * p; sp += p; }
    // 解 3×3
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [sxp, syp, sp];
    for (let i = 0; i < 3; i++) {
      let piv = i; for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      [A[i], A[piv]] = [A[piv], A[i]]; [B[i], B[piv]] = [B[piv], B[i]];
      for (let r = 0; r < 3; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let k = i; k < 3; k++) A[r][k] -= f * A[i][k]; B[r] -= f * B[i]; }
    }
    return [B[0] / A[0][0], B[1] / A[1][1], B[2] / A[2][2]];
  };
  const [a, b, c] = fit('px'), [d, e, f] = fit('py');
  return (M = [a, b, c, d, e, f]);
}
export const toPx = (x, y) => { const [a, b, c, d, e, f] = solve(); return { px: a * x + b * y + c, py: d * x + e * y + f }; };
export const toGame = (px, py) => {
  const [a, b, c, d, e, f] = solve(); const det = a * e - b * d;
  const u = px - c, v = py - f;
  return { x: Math.round((e * u - b * v) / det), y: Math.round((-d * u + a * v) / det) };
};

/**
 * @param box  容器
 * @param o { start:{x,y}, stops:[{x,y,label,title}], route:boolean, onPick:(x,y)=>void }
 */
export function drawMap(box, o = {}) {
  const src = box.dataset.src;
  const pts = [...START_POINTS, ...(o.stops || []), ...(o.start ? [o.start] : [])].filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => toPx(p.x, p.y));
  // 顯示範圍：包住所有點再留邊，最小一定範圍；沒有圖片時退回全圖
  let x0 = Math.min(...pts.map(p => p.px)), x1 = Math.max(...pts.map(p => p.px));
  let y0 = Math.min(...pts.map(p => p.py)), y1 = Math.max(...pts.map(p => p.py));
  const pad = 60, minW = 520, minH = 320;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  if (x1 - x0 < minW) { const m = (x0 + x1) / 2; x0 = m - minW / 2; x1 = m + minW / 2; }
  if (y1 - y0 < minH) { const m = (y0 + y1) / 2; y0 = m - minH / 2; y1 = m + minH / 2; }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(IMG_W, x1); y1 = Math.min(IMG_H, y1);
  const P = (x, y) => { const q = toPx(x, y); return [q.px.toFixed(1), q.py.toFixed(1)]; };
  const gates = START_POINTS.map(p => { const [gx, gy] = P(p.x, p.y); return `<g class="mp-gate"><rect x="${Number(gx) - 5}" y="${Number(gy) - 5}" width="10" height="10" rx="2" transform="rotate(45 ${gx} ${gy})"/><text x="${gx}" y="${Number(gy) - 9}" text-anchor="middle">${esc(T('bk.gate.' + p.id))}</text></g>`; }).join('');
  let route = '';
  const stops = o.stops || [];
  if (o.route && o.start && stops.length) {
    const d = [o.start, ...stops].map((p, i) => { const [x, y] = P(p.x, p.y); return `${i ? 'L' : 'M'}${x},${y}`; }).join('');
    route = `<path class="mp-route-shadow" d="${d}"/><path class="mp-route" d="${d}"/>`;
  }
  const dots = stops.map(p => { const [x, y] = P(p.x, p.y); return `<g class="mp-stop"><title>${esc(p.title || '')} (${p.x},${p.y})</title><circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${Number(y) + 3.5}" text-anchor="middle">${esc(p.label ?? '')}</text></g>`; }).join('');
  const start = o.start ? (([x, y]) => `<g class="mp-start"><circle cx="${x}" cy="${y}" r="9"/><path d="M${x} ${Number(y) - 6}l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z"/><text x="${x}" y="${Number(y) + 22}" text-anchor="middle">${o.start.x},${o.start.y}</text></g>`)(P(o.start.x, o.start.y)) : '';
  const bg = src ? `<image href="${esc(src)}" x="0" y="0" width="${IMG_W}" height="${IMG_H}" preserveAspectRatio="none"/>` : `<rect class="mp-bg" width="${IMG_W}" height="${IMG_H}"/>`;
  box.innerHTML = `<svg viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" role="img" aria-label="${esc(T('bk.map'))}">${bg}<text class="mp-dir" x="${(x1 - 8).toFixed(0)}" y="${(y0 + 16).toFixed(0)}" text-anchor="end">${esc(T('bk.mapDir'))}</text>${gates}${route}${dots}${start}</svg>`;
  if (o.onPick) {
    const svg = box.querySelector('svg');
    svg.style.cursor = 'crosshair';
    svg.addEventListener('click', e => {
      const r = svg.getBoundingClientRect();
      const px = x0 + ((e.clientX - r.left) / r.width) * (x1 - x0);
      const py = y0 + ((e.clientY - r.top) / r.height) * (y1 - y0);
      const g = toGame(px, py);
      o.onPick(g.x, g.y);
    });
  }
}
