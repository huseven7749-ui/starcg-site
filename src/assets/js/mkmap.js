// 法蘭城示意地圖（SVG）：傳送點、起點、攤位與採購路線
import { esc, T } from './core.js';
import { START_POINTS } from './route.js';

/**
 * @param box  容器
 * @param o { start:{x,y}, stops:[{x,y,label,title}], route:boolean, onPick:(x,y)=>void }
 */
export function drawMap(box, o = {}) {
  const pts = [...START_POINTS, ...(o.stops || []), ...(o.start ? [o.start] : [])].filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  const pad = 14;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const W = 640, scale = W / (x1 - x0), H = Math.max(180, Math.round((y1 - y0) * scale));
  const sx = x => ((x - x0) * scale).toFixed(1), sy = y => ((y - y0) * (H / (y1 - y0))).toFixed(1);
  let g = '';
  const step = 20;
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) g += `<line class="mp-grid" x1="${sx(x)}" x2="${sx(x)}" y1="0" y2="${H}"/><text class="mp-ax" x="${sx(x)}" y="${H - 4}" text-anchor="middle">${x}</text>`;
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) g += `<line class="mp-grid" x1="0" x2="${W}" y1="${sy(y)}" y2="${sy(y)}"/><text class="mp-ax" x="4" y="${Number(sy(y)) - 3}">${y}</text>`;
  const gates = START_POINTS.map(p => `<g class="mp-gate"><rect x="${Number(sx(p.x)) - 5}" y="${Number(sy(p.y)) - 5}" width="10" height="10" rx="2" transform="rotate(45 ${sx(p.x)} ${sy(p.y)})"/><text x="${sx(p.x)}" y="${Number(sy(p.y)) - 9}" text-anchor="middle">${esc(T('bk.gate.' + p.id))}</text></g>`).join('');
  let route = '';
  const stops = o.stops || [];
  if (o.route && o.start && stops.length) {
    const d = [o.start, ...stops].map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join('');
    route = `<path class="mp-route" d="${d}"/>`;
  }
  const dots = stops.map(p => `<g class="mp-stop"><title>${esc(p.title || '')}</title><circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="9"/><text x="${sx(p.x)}" y="${Number(sy(p.y)) + 3.5}" text-anchor="middle">${esc(p.label ?? '')}</text></g>`).join('');
  const start = o.start ? `<g class="mp-start"><circle cx="${sx(o.start.x)}" cy="${sy(o.start.y)}" r="8"/><path d="M${sx(o.start.x)} ${Number(sy(o.start.y)) - 6}l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z"/></g>` : '';
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('bk.map'))}"><rect class="mp-bg" width="${W}" height="${H}" rx="12"/>${g}<text class="mp-dir" x="${W - 8}" y="16" text-anchor="end">${esc(T('bk.mapDir'))}</text>${gates}${route}${dots}${start}</svg>`;
  if (o.onPick) {
    const svg = box.querySelector('svg');
    svg.style.cursor = 'crosshair';
    svg.addEventListener('click', e => {
      const r = svg.getBoundingClientRect();
      const x = Math.round(x0 + ((e.clientX - r.left) / r.width) * (x1 - x0));
      const y = Math.round(y0 + ((e.clientY - r.top) / r.height) * (y1 - y0));
      o.onPick(x, y);
    });
  }
}
