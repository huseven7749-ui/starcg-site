// 法蘭城地圖（世界地圖圖片＋ SVG 標記）：城門、里堡出口、傳送石、起點、攤位與實際走的路線
import { esc, T } from './core.js';
import { START_POINTS } from './route.js';

// 圖片尺寸（src/assets/img/fran-city.webp，遊戲世界地圖原圖）
const IMG_W = 1621, IMG_H = 1190;
// 座標對應：遊戲地圖是斜的菱形，東往右上、南往右下 → px 只跟 (x+y) 有關、py 只跟 (y−x) 有關
// 由站長實際量的地標（芙蕾雅三門、里堡四門、大聖堂、競技場、傳送石）校正，再用特徵比對換算到這張原圖，誤差 <3px
const OX = -242.71, OY = 789.05, U = 3.9878, V = 2.9513;
export const toPx = (x, y) => ({ px: OX + U * (x + y), py: OY + V * (y - x) });
export const toGame = (px, py) => {
  const s = (px - OX) / U, d = (py - OY) / V;     // s = x+y, d = y−x
  return { x: Math.round((s - d) / 2), y: Math.round((s + d) / 2) };
};
// 地圖上要標名字的起點（其他的只在下拉選單裡）
const LABELED = new Set(['gateS', 'gateE', 'gateW', 'castleS', 'castleE', 'castleW', 'castleN', 'E1', 'E2', 'S1', 'S2', 'W1', 'W2']);

/**
 * @param box  容器
 * @param o { start:{x,y}, stops:[{x,y,label,title}], route:boolean, paths:[[{x,y}…]…], onPick:(x,y)=>void }
 *   paths：每一段實際走的格子（起點→第 1 站、第 1 站→第 2 站…）；沒給就畫直線
 */
export function drawMap(box, o = {}) {
  const src = box.dataset.src || document.getElementById('bk-map')?.dataset.src || '';
  const stops = o.stops || [];
  const paths = o.paths || [];
  const marks = START_POINTS.filter(p => LABELED.has(p.id));
  // 有路線時只框住起點、攤位與路線；沒有路線（設定起點）時把城門、傳送石都框進來
  const pts = [...(stops.length ? [] : marks), ...stops, ...(o.start ? [o.start] : []), ...paths.flat()].filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => toPx(p.x, p.y));
  // 顯示範圍：包住所有點再留邊，最小一定範圍；沒有圖片時退回全圖
  let x0 = Math.min(...pts.map(p => p.px)), x1 = Math.max(...pts.map(p => p.px));
  let y0 = Math.min(...pts.map(p => p.py)), y1 = Math.max(...pts.map(p => p.py));
  const pad = 90, minW = 820, minH = 500;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  if (x1 - x0 < minW) { const m = (x0 + x1) / 2; x0 = m - minW / 2; x1 = m + minW / 2; }
  if (y1 - y0 < minH) { const m = (y0 + y1) / 2; y0 = m - minH / 2; y1 = m + minH / 2; }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(IMG_W, x1); y1 = Math.min(IMG_H, y1);
  const k = Math.max(1, Math.min(3.6, (x1 - x0) / 480));   // 範圍越大，標記放大一點才看得到（畫面上約固定大小）
  const P = (x, y) => { const q = toPx(x, y); return [q.px.toFixed(1), q.py.toFixed(1)]; };
  const gates = marks.map(p => {
    const [gx, gy] = P(p.x, p.y); const h = (6 * k).toFixed(1);
    return `<g class="mp-gate"><rect x="${(Number(gx) - 6 * k).toFixed(1)}" y="${(Number(gy) - 6 * k).toFixed(1)}" width="${(12 * k).toFixed(1)}" height="${(12 * k).toFixed(1)}" rx="2" transform="rotate(45 ${gx} ${gy})"/><text x="${gx}" y="${(Number(gy) - 11 * k).toFixed(1)}" text-anchor="middle">${esc(T('bk.mk.' + p.id))}</text></g>`;
  }).join('');
  let route = '';
  if (o.route && o.start && stops.length) {
    const line = paths.length ? paths.flatMap((seg, i) => seg.slice(i ? 1 : 0)) : [o.start, ...stops];
    const d = line.map((p, i) => { const [x, y] = P(p.x, p.y); return `${i ? 'L' : 'M'}${x},${y}`; }).join('');
    route = `<path class="mp-route-shadow" d="${d}"/><path class="mp-route" d="${d}"/>`;
  }
  const dots = stops.map(p => { const [x, y] = P(p.x, p.y); return `<g class="mp-stop"><title>${esc(p.title || '')} (${p.x},${p.y})</title><circle cx="${x}" cy="${y}" r="${(11 * k).toFixed(1)}"/><text x="${x}" y="${(Number(y) + 4 * k).toFixed(1)}" text-anchor="middle">${esc(p.label ?? '')}</text></g>`; }).join('');
  const start = o.start ? (([x, y]) => `<g class="mp-start" transform="translate(${x} ${y}) scale(${k.toFixed(2)})"><circle r="10"/><path d="M0 -6.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L0 6.3l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/><text y="24" text-anchor="middle">${o.start.x},${o.start.y}</text></g>`)(P(o.start.x, o.start.y)) : '';
  const bg = src ? `<image href="${esc(src)}" x="0" y="0" width="${IMG_W}" height="${IMG_H}" preserveAspectRatio="none"/>` : `<rect class="mp-bg" width="${IMG_W}" height="${IMG_H}"/>`;
  box.innerHTML = `<svg viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" style="--mk:${k.toFixed(2)}" role="img" aria-label="${esc(T('bk.map'))}">${bg}<text class="mp-dir" x="${(x0 + 10).toFixed(0)}" y="${(y1 - 10 * k).toFixed(0)}">${esc(T('bk.mapDir'))}</text>${gates}${route}${dots}${start}</svg>`;
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
