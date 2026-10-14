// 法蘭城地圖（真實地圖圖片＋ SVG 標記）：傳送石、起點、攤位與採購路線
import { esc, T } from './core.js';
import { START_POINTS } from './route.js';

// 圖片尺寸（src/assets/img/fran-city.jpg）
const IMG_W = 960, IMG_H = 685;
// 座標對應（由站長實際量的四個地標校正：東門口 281,88、西門口 22,88、南門口 153,241、里堡南 153,100）
// 遊戲地圖是斜 45° 的菱形：東往右上、南往右下 → px 只跟 (x+y) 有關、py 只跟 (y−x) 有關
const OX = -24.1, OY = 407.7, U = 2.025, V = 1.516;
export const toPx = (x, y) => ({ px: OX + U * (x + y), py: OY + V * (y - x) });
export const toGame = (px, py) => {
  const s = (px - OX) / U, d = (py - OY) / V;     // s = x+y, d = y−x
  return { x: Math.round((s - d) / 2), y: Math.round((s + d) / 2) };
};

/**
 * @param box  容器
 * @param o { start:{x,y}, stops:[{x,y,label,title}], route:boolean, onPick:(x,y)=>void }
 */
export function drawMap(box, o = {}) {
  const src = box.dataset.src || document.getElementById('bk-map')?.dataset.src || '';
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
