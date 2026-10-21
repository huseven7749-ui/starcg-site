// 魔物分布：依地區（島 → 地點 → 樓層）或依等級（每 10 等一個區間）查魔物出沒
// 資料：data/monster-map.json（tools/scrape-monster-map.py 從御劍軒 cgsword.com/bm 整理，經典服資料）
import { $, $$, T, esc, fmt, store, debounce, loadPets, petImgSrc, normName, emptyState, BASE, LANG, loadKo, kt, cardText } from './core.js';
import { raceName } from './catalog.js';
const cnt = c => (LANG === 'ko' ? String(c).replace(/隻$/, '마리') : c);
import { elementMult } from './dmgcalc.js';

const KEY = 'sc.monsters';
const BAND = 10, BAND_MAX = 20;                  // 1-10、11-20 … 191-200（資料最高 Lv200）
const S = { view: 'region', island: '', area: '', elem: '', race: '', band: -1, catch: false, q: '', ...(store.get(KEY) || {}) };
const ELEM = ['earth', 'water', 'fire', 'wind'];
let DATA = null, PETS = new Map(), ROWS = [];

const bandOf = lv => Math.min(BAND_MAX - 1, Math.floor((Math.max(1, lv) - 1) / BAND));
const bandLabel = b => `${b * BAND + 1}–${(b + 1) * BAND}`;
const save = () => store.set(KEY, { view: S.view, island: S.island, area: S.area, elem: S.elem, race: S.race, band: S.band, catch: S.catch });

// 每一筆出現紀錄攤平：地點、樓層、魔物
function flatten() {
  ROWS = [];
  for (const a of DATA.areas) {
    const island = a.path[0] || a.name;
    for (const g of a.groups) for (const m of g.monsters) {
      const pet = (m.imageId && PETS.get(String(m.imageId))) || PETS.get('n:' + normName(m.name)) || null;
      const hasLv = m.lvMin != null;
      const lvMin = m.lvMin ?? 0, lvMax = m.lvMax ?? m.lvMin ?? 0;
      // 等級分類：有等級的紀錄放進它橫跨的每一個區間（例如 Lv90–110 會出現在 81–90、91–100、101–110）。
      // 只有整段樓層合併成 30 級以上的大範圍（像黃金通道「1-49F Lv1–50」）不放進等級分類
      const banded = hasLv && lvMax - lvMin < 30;
      ROWS.push({ ...m, island, area: a, label: g.label, count: g.count, pet, key: normName(m.name), best: bestElem(m.elem),
        nameShow: LANG === 'ko' && pet?.kn ? pet.kn : m.name, hasLv, banded, lvMin, lvMax });
    }
  }
}

/** 用哪種水晶屬性打這隻最痛：單一屬性 10，或相鄰兩種屬性（地水、水火、火風、風地）合計 10，取倍率最高的 */
function bestElem(d) {
  if (!d || !d.some(x => x > 0)) return null;
  let best = null;
  for (let i = 0; i < 4; i++) for (let k = 10; k >= 5; k--) {
    const a = [0, 0, 0, 0]; a[i] = k; a[(i + 1) % 4] = 10 - k;
    const m = elementMult(a, d);
    if (!best || m > best.m + 1e-9) best = { a, m };
    if (k < 10) { const b = [0, 0, 0, 0]; b[i] = k; b[(i + 3) % 4] = 10 - k; const n = elementMult(b, d); if (n > best.m + 1e-9) best = { a: b, m: n }; }
  }
  return best;
}
const bestText = b => b.a.map((v, i) => (v ? T('dmg.e.' + ELEM[i]) + v : '')).filter(Boolean).join('');
const inBand = r => S.band < 0 || (r.banded && bandOf(r.lvMin) <= S.band && bandOf(r.lvMax) >= S.band);
function pass(r) {
  if (S.elem !== '' && !(r.elem[Number(S.elem)] > 0)) return false;
  if (S.race && r.race !== S.race) return false;
  if (S.catch && !r.catch) return false;
  if (S.view === 'level' && !r.banded) return false;           // 沒有等級、或等級跨太多區間的，只在「依地區」顯示
  if (S.band >= 0 && !inBand(r)) return false;
  if (S.q) {
    const q = normName(S.q);
    if (!r.key.includes(q) && !normName(r.area.name).includes(q) && !normName(kt(r.area.name)).includes(q) && !(r.pet?.kn && normName(r.pet.kn).includes(q))) return false;
  }
  if (S.view === 'region') {
    if (S.island && r.island !== S.island) return false;
    if (S.area && r.area.id !== S.area) return false;
  }
  return true;
}

// ───── 畫面 ─────
const elemBar = e => `<span class="mon-elem" aria-label="${ELEM.map((k, i) => e[i] ? T('dmg.e.' + k) + e[i] : '').filter(Boolean).join(' ')}">${ELEM.map((k, i) => e[i] ? `<i class="e${i}" style="flex:${e[i]}">${esc(T('dmg.e.' + k))}${e[i]}</i>` : '').join('')}</span>`;
function img(r) {
  if (r.pet?.imageId) return `<img src="${petImgSrc(r.pet.imageId)}" data-pet="${esc(String(r.pet.imageId).match(/\d+/)?.[0] || '')}" alt="" width="56" height="56" loading="lazy" decoding="async">`;
  if (r.img && r.imageId) return `<img src="${BASE}img/monsters/${r.imageId}.png" alt="" width="56" height="56" loading="lazy" decoding="async">`;   // 本機資料包的站立圖
  return `<span class="mon-noimg" aria-hidden="true"><svg class="ic"><use href="#i-monsters"/></svg></span>`;
}
const lvText = r => (!r.hasLv ? T('mon.noLv') : r.lvMin === r.lvMax ? `Lv${r.lvMin}` : `Lv${r.lvMin}–${r.lvMax}`);
function card(r, where = '') {
  const name = esc(r.nameShow);
  const link = r.pet ? `<a href="${BASE}pets/?q=${encodeURIComponent(r.pet.name)}">${name}</a>` : name;
  return `<li class="mon-card">${img(r)}<div class="mon-body"><b class="mon-name">${link}</b>
    <span class="mon-meta"><span class="badge b-sky">${esc(lvText(r))}</span>${r.race ? `<span class="badge b-gray">${esc(raceName(r.race))}</span>` : ''}${r.card ? `<span class="badge b-lav">${esc(cardText(r.card))}</span>` : ''}${r.catch ? `<span class="badge b-ok">${esc(T('mon.catch'))}</span>` : ''}</span>
    ${elemBar(r.elem)}${r.best ? `<small class="mon-best">${esc(T('mon.best', { e: bestText(r.best), m: fmt(r.best.m, 2) }))}</small>` : ''}${r.lv1 ? `<small class="muted">${esc(T('mon.lv1', { p: r.lv1 }))}</small>` : ''}${where}</div></li>`;
}

function renderRegion(rows) {
  const byArea = new Map();
  for (const r of rows) { if (!byArea.has(r.area)) byArea.set(r.area, new Map()); const g = byArea.get(r.area); const k = r.label + '|' + r.count; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...byArea.entries()].map(([a, groups]) => `<section class="card mon-area"><h2 class="card-title"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg>${esc(kt(a.name))}<span class="sub">${esc(a.path.map(kt).join(' › '))}</span></h2>` +
    [...groups.entries()].map(([k, rs]) => { const [label, count] = k.split('|'); return `<div class="mon-group">${label || count ? `<p class="mon-gh">${label ? `<b>${esc(kt(label))}</b>` : ''}${count ? `<span class="muted">${esc(T('mon.count', { n: cnt(count) }))}</span>` : ''}</p>` : ''}<ul class="mon-list">${rs.map(r => card(r)).join('')}</ul></div>`; }).join('') + '</section>').join('');
}
function renderLevel(rows) {
  // 同一隻魔物合併成一張卡，列出所有出沒地點
  const bands = new Map();
  for (const r of rows) {
    for (let b = bandOf(r.lvMin); b <= bandOf(r.lvMax); b++) {
      if (S.band >= 0 && b !== S.band) continue;
      if (!bands.has(b)) bands.set(b, new Map());
      const m = bands.get(b);
      const lo = Math.max(r.lvMin, b * BAND + 1), hi = Math.min(r.lvMax, (b + 1) * BAND);
      if (!m.has(r.key)) m.set(r.key, { ...r, lvMin: lo, lvMax: hi, places: [] });
      const it = m.get(r.key);
      it.lvMin = Math.min(it.lvMin, lo); it.lvMax = Math.max(it.lvMax, hi);
      it.places.push(`${kt(r.area.name)}${r.label ? ' ' + kt(r.label) : ''}（${lvText(r)}）`);
    }
  }
  return [...bands.keys()].sort((a, b) => a - b).map(b => {
    const list = [...bands.get(b).values()].sort((x, y) => x.lvMin - y.lvMin || x.name.localeCompare(y.name));
    return `<section class="card mon-area"><h2 class="card-title"><svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg>${esc(T('mon.bandTitle', { b: bandLabel(b) }))}<span class="sub">${esc(T('mon.kinds', { n: list.length }))}</span></h2><ul class="mon-list">` +
      list.map(r => { const places = [...new Set(r.places)]; return card(r, `<small class="mon-where">${esc(T('mon.where'))}${esc(places.slice(0, 6).join('、'))}${places.length > 6 ? esc(T('mon.more', { n: places.length - 6 })) : ''}</small>`); }).join('') + '</ul></section>';
  }).join('');
}

const MAX_AREAS = 40;
function render() {
  $$('#mon-view button').forEach(b => b.setAttribute('aria-pressed', String(b.value === S.view)));
  $('#mon-island-wrap').hidden = $('#mon-area-wrap').hidden = S.view !== 'region';
  $$('#mon-bands button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.band) === S.band)));
  const rows = ROWS.filter(pass);
  const kinds = new Set(rows.map(r => r.key)).size;
  $('#mon-count').textContent = T('mon.summary', { n: rows.length, k: kinds });
  if (!rows.length) { $('#mon-results').innerHTML = emptyState('adv-look', T('noResult'), T('mon.emptyTip')); return; }
  let html = S.view === 'level' ? renderLevel(rows) : renderRegion(rows);
  // 地區沒篩選時一次只畫前 40 個地點，避免手機太慢
  if (S.view === 'region' && !S.area) {
    const parts = html.split('</section>').filter(Boolean);
    if (parts.length > MAX_AREAS) html = parts.slice(0, MAX_AREAS).join('</section>') + '</section>' + `<p class="small muted center">${esc(T('mon.cut', { n: parts.length, m: MAX_AREAS }))}</p>`;
  }
  $('#mon-results').innerHTML = html;
}

function fillSelects() {
  const islands = [...new Set(DATA.areas.map(a => a.path[0] || a.name))];
  $('#mon-island').innerHTML = `<option value="">${esc(T('common.all'))}</option>` + islands.map(i => `<option value="${esc(i)}">${esc(kt(i))}</option>`).join('');
  $('#mon-island').value = islands.includes(S.island) ? S.island : (S.island = '');
  fillAreas();
  const races = [...new Set(ROWS.map(r => r.race).filter(Boolean))].sort();
  $('#mon-race').innerHTML = `<option value="">${esc(T('common.all'))}</option>` + races.map(r => `<option value="${esc(r)}">${esc(raceName(r))}</option>`).join('');
  $('#mon-race').value = races.includes(S.race) ? S.race : (S.race = '');
  $('#mon-elem').value = S.elem;
  $('#mon-catch').checked = S.catch;
  const used = new Set(ROWS.filter(r => r.banded).flatMap(r => { const o = []; for (let b = bandOf(r.lvMin); b <= bandOf(r.lvMax); b++) o.push(b); return o; }));
  $('#mon-bands').innerHTML = `<button type="button" class="chip" data-band="-1">${esc(T('common.all'))}</button>` +
    [...used].sort((a, b) => a - b).map(b => `<button type="button" class="chip" data-band="${b}">${bandLabel(b)}</button>`).join('');
}
function fillAreas() {
  const list = DATA.areas.filter(a => !S.island || (a.path[0] || a.name) === S.island);
  $('#mon-area').innerHTML = `<option value="">${esc(T('mon.areaAll', { n: list.length }))}</option>` + list.map(a => `<option value="${a.id}">${esc(a.path.slice(1).concat(a.name).map(kt).join(' › '))}</option>`).join('');
  $('#mon-area').value = list.some(a => a.id === S.area) ? S.area : (S.area = '');
}

// ───── 事件 ─────
$('#mon-view').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.view = b.value; save(); render(); } });
$('#mon-island').addEventListener('change', e => { S.island = e.target.value; S.area = ''; fillAreas(); save(); render(); });
$('#mon-area').addEventListener('change', e => { S.area = e.target.value; save(); render(); });
$('#mon-elem').addEventListener('change', e => { S.elem = e.target.value; save(); render(); });
$('#mon-race').addEventListener('change', e => { S.race = e.target.value; save(); render(); });
$('#mon-catch').addEventListener('change', e => { S.catch = e.target.checked; save(); render(); });
$('#mon-bands').addEventListener('click', e => { const b = e.target.closest('[data-band]'); if (b) { S.band = Number(b.dataset.band); save(); render(); } });
$('#mon-q').addEventListener('input', debounce(e => { S.q = e.target.value.trim(); render(); }, 200));

// ───── 啟動 ─────
const qs = new URLSearchParams(location.search);
if (qs.get('q')) { S.q = qs.get('q').slice(0, 30); $('#mon-q').value = S.q; }
if (qs.get('lv')) { S.view = 'level'; S.band = bandOf(Number(qs.get('lv')) || 1); }
Promise.all([fetch(BASE + 'data/monster-map.json').then(r => r.json()), loadPets().catch(() => []), loadKo()]).then(([d, pets]) => {
  DATA = d;
  for (const p of pets) {
    if (p.imageId) PETS.set(String(p.imageId).match(/\d+/)?.[0], p);
    PETS.set('n:' + normName(p.name), p);
  }
  flatten(); fillSelects(); render();
}).catch(() => { $('#mon-results').innerHTML = emptyState('adv-look', T('error')); });
