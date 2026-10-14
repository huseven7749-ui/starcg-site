// 輕量 SVG 折線圖（無外部套件）
import { esc } from './core.js';

/**
 * @param {HTMLElement} box   容器（position:relative）
 * @param {string[]} labels   X 軸標籤
 * @param {number[]} values   數值（null 代表無資料）
 * @param {object} o          { cls: 'coin'|'crystal', fmt: n=>string, tip: (i)=>string }
 */
export function lineChart(box, labels, values, o = {}) {
  const W = 640, H = 220, P = { l: 52, r: 14, t: 14, b: 26 };
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && isFinite(v));
  if (!pts.length) { box.innerHTML = ''; return; }
  let min = Math.min(...pts.map(p => p[1])), max = Math.max(...pts.map(p => p[1]));
  if (min === max) { min *= 0.9; max = max * 1.1 || 1; }
  const pad = (max - min) * 0.12; min = Math.max(0, min - pad); max += pad;
  const n = Math.max(1, labels.length - 1);
  const x = i => P.l + (i / n) * (W - P.l - P.r);
  const y = v => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const fmt = o.fmt || (v => Math.round(v));
  const ticks = 4;
  let g = '';
  for (let k = 0; k <= ticks; k++) {
    const v = min + ((max - min) * k) / ticks, yy = y(v);
    g += `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}"/><text class="axis" x="${P.l - 6}" y="${yy + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  const step = Math.ceil(labels.length / 7);
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) g += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`; });
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const dots = pts.map(([i, v]) => `<circle class="dot-${o.cls}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" data-i="${i}"/>`).join('');
  box.style.position = 'relative';
  box.innerHTML = `<svg class="hist-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || '')}">${g}<path class="ln-${o.cls}" d="${d}"/>${dots}<rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent" class="hit"/></svg><div class="chart-tip" hidden></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.chart-tip');
  const move = e => {
    const r = svg.getBoundingClientRect();
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width);
    let best = pts[0];
    for (const p of pts) if (Math.abs(x(p[0]) - px) < Math.abs(x(best[0]) - px)) best = p;
    tip.hidden = false;
    tip.innerHTML = o.tip ? o.tip(best[0]) : `${esc(labels[best[0]])}：${esc(fmt(best[1]))}`;
    tip.style.left = (x(best[0]) / W) * r.width + 'px';
    tip.style.top = (y(best[1]) / H) * r.height + 'px';
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('touchstart', move, { passive: true });
  svg.addEventListener('pointerleave', () => (tip.hidden = true));
}
