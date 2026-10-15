// 批次採購：多項商品一次查價，依分流／幣別規劃購買攤位與路線
import { $, $$, T, api, esc, fmt, fmtWan, store, toast, normName, debounce, PREVIEW, spriteImg, emptyState, runningState, LANG } from './core.js';
import { loadCatalog, EQ_CATS, CRYSTALS, eqCatName, raceName } from './catalog.js';
import { plan, parseLoc, START_POINTS, TOWN } from './route.js';
import { drawMap } from './mkmap.js';
import { stripBr, twTime } from './mkstats.js';
import { tierOf } from './petcalc.js';

const LIST_KEY = 'sc.bulk', CFG_KEY = 'sc.bulkcfg', START_KEY = 'sc.starts';
const MAX_ITEMS = 60, CAND_SHOW = 48;
const DEF = { kind: 'pet', petMode: 'bounty', cat: '', race: '', sv: 'all', cur: 'both', strat: 'route', tol: 15, basis: 'piece', start: 'E1', x: 242, y: 100, src: 'player' };
let C = null;
const S = { ...DEF, ...(store.get(CFG_KEY) || {}), q: '', showAll: false, results: null, busy: false };
const saveCfg = () => { const { q, showAll, results, busy, ...rest } = S; store.set(CFG_KEY, rest); };
const getList = () => store.get(LIST_KEY, []) || [];
const setList = l => { store.set(LIST_KEY, l.slice(0, MAX_ITEMS)); renderSel(); renderCands(); updateCount(); };
const curName = c => T(Number(c) ? 'common.crystal' : 'common.coin');
const seg = (box, v) => $$('button', box).forEach(b => b.setAttribute('aria-pressed', String(b.value === String(v))));

function updateCount() {
  const n = getList().length, c = $('#tab-main-bulk .count');
  c.hidden = !n; c.textContent = n;
}

// ───── 候選商品 ─────
function candidates() {
  const q = normName(S.q);
  let list = [];
  if (S.kind === 'pet') {
    const src = S.petMode === 'bounty' ? C.bountyPets.map(b => ({ n: b.n, sub: [b.area, b.where].filter(Boolean).join('・'), tier: b.tier })) : C.pets.filter(p => !S.race || p.race === S.race).map(p => ({ n: p.name, sub: raceName(p.race), tier: tierOf(p.cardTier) }));
    list = src.map(x => ({ ...x, kind: 'pet' }));
  } else if (S.kind === 'equip') {
    const bounty = S.cat === '__bounty';
    list = (bounty ? C.bountyEquip.map(e => ({ n: e.n, c: e.c, sub: `${eqCatName(e.c)} ${e.grade}・${T('bk.shopPrice', { p: e.price })}` }))
      : C.equip.filter(e => !S.cat || e.c === S.cat).map(e => ({ n: e.n, c: e.c, sub: `${eqCatName(e.c)}・${T('mk.eq.lvN', { n: e.lv })}` }))).map(x => ({ ...x, kind: 'equip' }));
  } else if (S.kind === 'item') {
    list = CRYSTALS.map(n => ({ n, sub: T('bk.material'), kind: 'item' }));
  } else {
    list = [...CRYSTALS.map(n => ({ n, sub: T('bk.material'), kind: 'item' })),
      ...C.bountyPets.map(b => ({ n: b.n, sub: T('mk.pet.bounty'), kind: 'pet' })),
      ...C.equip.map(e => ({ n: e.n, sub: `${eqCatName(e.c)}・${T('mk.eq.lvN', { n: e.lv })}`, kind: 'equip' })),
      ...C.pets.map(p => ({ n: p.name, sub: raceName(p.race), kind: 'pet' }))];
    const seen = new Set();
    list = list.filter(x => (seen.has(x.n) ? false : seen.add(x.n)));
  }
  if (q) list = list.filter(x => normName(x.n).includes(q));
  return list;
}
function renderQuick() {
  const box = $('#bk-quick');
  if (S.kind === 'pet') {
    box.innerHTML = `<div class="seg seg-sm" id="bk-petmode"><button type="button" value="bounty" aria-pressed="${S.petMode === 'bounty'}">${esc(T('bk.petBounty'))}</button><button type="button" value="all" aria-pressed="${S.petMode === 'all'}">${esc(T('bk.petAll'))}</button></div>` +
      (S.petMode === 'all' ? `<div class="chips"><button type="button" class="chip${!S.race ? ' on' : ''}" data-race="">${esc(T('race.all'))}</button>${C.races.map(r => `<button type="button" class="chip${S.race === r ? ' on' : ''}" data-race="${esc(r)}">${esc(raceName(r))}</button>`).join('')}</div>` : '');
  } else if (S.kind === 'equip') {
    const cats = EQ_CATS.filter(k => C.equip.some(e => e.c === k));
    box.innerHTML = `<div class="chips"><button type="button" class="chip${S.cat === '__bounty' ? ' on' : ''}" data-cat="__bounty">${esc(T('bk.eqBounty'))}</button><button type="button" class="chip${!S.cat ? ' on' : ''}" data-cat="">${esc(T('mk.eq.catAll'))}</button>${cats.map(k => `<button type="button" class="chip${S.cat === k ? ' on' : ''}" data-cat="${k}">${esc(eqCatName(k))}</button>`).join('')}</div>`;
  } else if (S.kind === 'item') {
    box.innerHTML = `<p class="small muted" style="margin:0">${esc(T('bk.itemHint'))}</p>`;
  } else box.innerHTML = '';
}
function renderCands() {
  if (!C) return;
  const list = candidates();
  const sel = new Set(getList().map(x => normName(x.n)));
  const shown = S.showAll ? list : list.slice(0, CAND_SHOW);
  const q = S.q.trim();
  const custom = q && !list.some(x => normName(x.n) === normName(q)) ? `<button type="button" class="cand cand-add" data-add="${esc(q)}"><b>${esc(T('bk.addCustom', { n: q }))}</b><small>${esc(T('bk.addCustomSub'))}</small></button>` : '';
  $('#bk-cands').innerHTML = (shown.length || custom ? custom + shown.map(x => `<button type="button" class="cand${sel.has(normName(x.n)) ? ' on' : ''}" data-pick="${esc(x.n)}" data-kind="${x.kind}" aria-pressed="${sel.has(normName(x.n))}"><b lang="zh-Hant">${esc(x.n)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('') : `<p class="muted small">${esc(T('noResult'))}</p>`) +
    (list.length > shown.length ? `<button type="button" class="btn sm ghost wide" data-cand-more>${esc(T('more', { n: list.length }))}</button>` : '');
}
function renderSel() {
  const l = getList();
  $('#bk-sel').innerHTML = l.length ? l.map((x, i) => `<li class="bk-row" data-i="${i}">
      <span class="bk-name"><b lang="zh-Hant">${esc(x.n)}</b><span class="badge ${x.kind === 'pet' ? 'b-mint' : x.kind === 'equip' ? 'b-coral' : 'b-sky'}">${esc(T('mk.kind.' + (x.kind || 'item')))}</span></span>
      <span class="stepper"><button type="button" data-step="-1" aria-label="-">−</button><input class="input sm" type="number" min="1" max="9999" value="${x.qty}" inputmode="numeric" aria-label="${esc(T('qty'))}"><button type="button" data-step="1" aria-label="+">＋</button></span>
      <button class="btn sm icon ghost" type="button" data-del="${i}" aria-label="${esc(T('common.remove'))}"><svg class="ic"><use href="#i-trash"/></svg></button></li>`).join('')
    : `<li class="empty small">${spriteImg('adv-sit')}<b>${esc(T('bk.selEmpty'))}</b></li>`;
}
function toggle(n, kind) {
  const l = getList();
  const i = l.findIndex(x => normName(x.n) === normName(n));
  if (i >= 0) l.splice(i, 1);
  else { if (l.length >= MAX_ITEMS) { toast(T('bk.tooMany', { n: MAX_ITEMS })); return; } l.push({ n, kind: kind || C.kindOf(n), qty: 1 }); }
  setList(l);
}

// ───── 起點 ─────
const savedStarts = () => store.get(START_KEY, []) || [];
function fillStart() {
  const saved = savedStarts();
  $('#bk-start').innerHTML = START_POINTS.map(p => `<option value="${p.id}">${esc(T('bk.gate.' + p.id))}（${p.x}, ${p.y}）</option>`).join('') +
    saved.map((p, i) => `<option value="saved:${i}">★ ${esc(p.name)}（${p.x}, ${p.y}）</option>`).join('') +
    `<option value="custom">${esc(T('bk.custom'))}</option>`;
  $('#bk-start').value = [...$('#bk-start').options].some(o => o.value === S.start) ? S.start : 'custom';
  $('#bk-x').value = S.x; $('#bk-y').value = S.y;
  $('#bk-saved').hidden = !saved.length;
  $('#bk-saved .chips').innerHTML = saved.map((p, i) => `<span class="chip chip-x"><button type="button" data-start-pick="${i}">${esc(p.name)}</button><button type="button" class="x" data-start-del="${i}" aria-label="${esc(T('common.remove'))}">×</button></span>`).join('');
  drawCfgMap();
}
function setStart(id) {
  S.start = id;
  const p = START_POINTS.find(x => x.id === id) || (id.startsWith('saved:') ? savedStarts()[Number(id.slice(6))] : null);
  if (p) { S.x = p.x; S.y = p.y; }
  saveCfg(); fillStart();
}
function drawCfgMap() {
  const stops = (S.results?.groups?.[0]?.plan.steps || []).map(s => ({ x: s.stall.x, y: s.stall.y, label: s.i, title: s.stall.n }));
  drawMap($('#bk-map'), { start: { x: S.x, y: S.y }, stops, route: !!stops.length, onPick: (x, y) => { S.start = 'custom'; S.x = x; S.y = y; saveCfg(); fillStart(); } });
}

// ───── 規劃 ─────
function stratHint() {
  $('#bk-strat-hint').textContent = T('bk.stratHint.' + S.strat);
  $('#bk-tol-wrap').hidden = S.strat !== 'route';
}
async function go() {
  const list = getList().filter(x => x.qty > 0);
  if (!list.length) { toast(T('bk.selEmpty')); return; }
  if (S.busy) return;
  S.busy = true;
  const btn = $('#bk-go');
  btn.disabled = true;
  const out = $('#bk-results');
  out.innerHTML = `<div class="card">${runningState(T('bk.loading', { n: list.length }))}<div class="skel" style="height:120px"></div></div>`;
  try {
    const names = list.map(x => x.n);
    const results = {}, failed = [];
    let fetchedAt = Infinity, demo = false;
    for (let i = 0; i < names.length; i += 30) {
      const b = await api('batch', { n: names.slice(i, i + 30) }, { timeout: 90000 });
      Object.assign(results, b.results || {});
      failed.push(...(b.failed || []));
      demo ||= !!b.demo;
      for (const d of Object.values(b.results || {})) fetchedAt = Math.min(fetchedAt, d.fetchedAt || Infinity);
    }
    // 攤位清單（名稱完全相同才算）
    const listings = [];
    for (const x of list) {
      const d = results[x.n] || results[normName(x.n)];
      if (!d) continue;
      const want = stripBr(normName(x.n));
      const add = (r, q) => {
        if (stripBr(normName(r.n)) !== want) return;
        const st = d.stalls[r.s] || {};
        const loc = parseLoc(st.loc, st.x, st.y);
        listings.push({ name: x.n, kn: r.kn || '', p: r.p, q, c: r.c, stall: { key: `${st.sv}|${st.n}|${loc.x},${loc.y}`, n: st.n || '—', x: loc.x, y: loc.y, map: loc.map, sv: st.sv, loc: st.loc } });
      };
      (d.items || []).forEach(r => add(r, Math.max(1, r.q || 1)));
      (d.pets || []).forEach(r => add(r, 1));
    }
    const servers = S.sv === 'all' ? [...new Set(listings.map(l => l.stall.sv).filter(v => v != null))].sort((a, b) => a - b) : [Number(S.sv)];
    const curs = S.cur === 'both' ? [0, 1] : [Number(S.cur)];
    const start = { x: Number(S.x), y: Number(S.y), map: TOWN };
    const needs = list.map(x => ({ name: x.n, qty: x.qty }));
    const groups = [];
    for (const sv of servers) for (const c of curs) {
      const L = listings.filter(l => l.stall.sv === sv && l.c === c);
      if (!L.length) continue;
      groups.push({ sv, c, plan: plan({ needs, listings: L, start, strategy: S.strat, basis: S.basis, tol: S.tol / 100 }) });
    }
    const notFound = list.filter(x => !listings.some(l => normName(l.name) === normName(x.n))).map(x => x.n);
    S.results = { groups, notFound, failed, fetchedAt: isFinite(fetchedAt) ? fetchedAt : Date.now() / 1000, demo };
    renderResults();
    drawCfgMap();
  } catch (e) {
    out.innerHTML = `<div class="notice bad"><svg class="ic"><use href="#i-close"/></svg><span>${esc(e.status === 429 ? T('mk.rateLimited') : T('error'))}</span></div>`;
  } finally {
    S.busy = false; btn.disabled = false;
  }
}
function renderResults() {
  const r = S.results;
  const out = $('#bk-results');
  if (!r) { out.innerHTML = ''; return; }
  const ageS = Math.max(0, Math.round(Date.now() / 1000 - r.fetchedAt));
  const head = `<div class="mk-status"><span class="dot"></span><span>${esc(T('bk.queriedAt', { t: twTime(Math.floor(r.fetchedAt)).slice(11), s: ageS }))}</span><span class="muted">${esc(T('bk.requery'))}</span></div>` +
    (r.demo || PREVIEW ? `<div class="notice info"><svg class="ic"><use href="#i-sparkle"/></svg><span>${esc(T('preview'))}</span></div>` : '') +
    (r.notFound.length ? `<div class="notice"><svg class="ic"><use href="#i-search"/></svg><span>${esc(T('bk.notFound'))}${r.notFound.map(n => `<b class="nf">${esc(n)}</b>`).join('')}</span></div>` : '') +
    (r.failed.length ? `<div class="notice bad"><svg class="ic"><use href="#i-close"/></svg><span>${esc(T('bk.failed', { n: r.failed.length }))}</span></div>` : '');
  if (!r.groups.length) { out.innerHTML = head + (r.notFound.length ? '' : emptyState('adv-look', T('noResult'))); return; }
  // 每種幣別最便宜（且全部買齊）的方案
  const best = {};
  const nfAll = new Set(r.notFound);
  for (const g of r.groups) if (!g.plan.unmet.some(u => !nfAll.has(u.name)) && (best[g.c] == null || g.plan.total < best[g.c].plan.total)) best[g.c] = g;
  out.innerHTML = head + r.groups.map((g, gi) => groupCard(g, gi, best[g.c] === g)).join('');
  r.groups.forEach((g, gi) => {
    const box = $(`#bk-gmap-${gi}`);
    if (box) drawMap(box, { start: { x: Number(S.x), y: Number(S.y) }, stops: g.plan.steps.map(s => ({ x: s.stall.x, y: s.stall.y, label: s.i, title: s.stall.n })), route: true });
  });
}
function groupCard(g, gi, isBest) {
  const p = g.plan, cur = g.c ? 'crystal' : 'coin';
  // 全部分流都沒人賣的品項已在上方列出，這裡只列「別的分流／幣別買得到」的
  const nf = new Set(S.results?.notFound || []);
  const um = p.unmet.filter(u => !nf.has(u.name));
  const money = v => `<span class="price ${cur}"><svg class="ic"><use href="#i-${cur}"/></svg>${fmt(v)}</span>`;
  const tiles = `<div class="kv kv-4">
    <div class="stat-tile hl"><span>${esc(T('bk.total'))}</span><b>${money(p.total)}</b>${g.c || p.total < 10000 ? '' : `<small>${esc(fmtWan(p.total))}</small>`}</div>
    <div class="stat-tile"><span>${esc(T('bk.stalls'))}</span><b>${fmt(p.stalls)}</b></div>
    <div class="stat-tile"><span>${esc(T('bk.walk'))}</span><b>${esc(T('bk.steps', { n: fmt(p.walked) }))}</b></div>
    <div class="stat-tile"><span>${esc(T('bk.unmet'))}</span><b>${fmt(um.reduce((a, b) => a + b.qty, 0))}</b></div></div>`;
  const steps = p.steps.map(s => `<li class="bk-step">
      <span class="bk-no">${s.i}</span>
      <div class="bk-step-main"><b>${esc(s.stall.n)}</b><span class="muted small">${esc(T('bk.at', { x: s.stall.x, y: s.stall.y }))} · ${esc(T('bk.stepDist', { d: s.d, w: s.walked }))}</span>
        <ul class="bk-buys">${s.buys.map(b => `<li><span lang="${LANG === 'ko' && b.kn ? 'ko' : 'zh-Hant'}">${esc(stripBr(LANG === 'ko' && b.kn ? b.kn : b.name))}</span> × ${fmt(b.k)}<span class="muted"> @ ${fmt(b.price)}${S.basis === 'stack' ? esc(T('bk.perStack')) : ''}</span><b>${fmt(b.cost)}</b></li>`).join('')}</ul></div>
      <div class="bk-step-cost">${money(s.cost)}</div></li>`).join('');
  const unmet = um.length ? `<div class="notice"><svg class="ic"><use href="#i-search"/></svg><span>${esc(T('bk.unmetList'))}${um.map(u => ` <b>${esc(u.name)} ×${fmt(u.qty)}</b>`).join('')}</span></div>` : '';
  const over = p.over.length ? `<p class="small muted">${esc(T('bk.over'))}${p.over.map(u => ` ${esc(u.name)} +${fmt(u.qty)}`).join('、')}</p>` : '';
  const off = p.offMap.length ? `<details class="bk-off"><summary>${esc(T('bk.offMap', { n: p.offMap.length }))}</summary><ul>${p.offMap.map(l => `<li>${esc(stripBr(l.name))} · ${esc(l.stall.loc || l.stall.map)} · ${money(l.p)}</li>`).join('')}</ul></details>` : '';
  return `<section class="card bk-group">
    <h2 class="card-title"><svg class="ic"><use href="#i-pin"/></svg>S${g.sv} · ${esc(curName(g.c))}${isBest ? `<span class="badge b-ok">${esc(T('bk.best'))}</span>${spriteImg('adv-cheer', 'bk-cheer')}` : ''}</h2>
    ${tiles}${unmet}
    <div class="bk-group-body"><ol class="bk-steps">${steps || `<li class="muted">${esc(T('bk.noStops'))}</li>`}</ol><div class="bk-map" id="bk-gmap-${gi}"></div></div>${over}${off}
  </section>`;
}

// ───── 事件 ─────
function bind() {
  $('#bk-q').addEventListener('input', debounce(e => { S.q = e.target.value; S.showAll = false; renderCands(); }, 120));
  $('#bk-kind').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.kind = b.value; S.showAll = false; seg($('#bk-kind'), S.kind); saveCfg(); renderQuick(); renderCands(); });
  $('#bk-quick').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.closest('#bk-petmode')) S.petMode = b.value;
    else if (b.dataset.race != null) S.race = b.dataset.race;
    else if (b.dataset.cat != null) S.cat = b.dataset.cat;
    S.showAll = false; saveCfg(); renderQuick(); renderCands();
  });
  $('#bk-cands').addEventListener('click', e => {
    const b = e.target.closest('[data-pick],[data-add],[data-cand-more]');
    if (!b) return;
    if (b.dataset.pick != null) toggle(b.dataset.pick, b.dataset.kind);
    else if (b.dataset.add != null) { toggle(b.dataset.add, C.kindOf(b.dataset.add)); $('#bk-q').value = ''; S.q = ''; renderCands(); }
    else { S.showAll = true; renderCands(); }
  });
  $('#bk-sel').addEventListener('click', e => {
    const row = e.target.closest('.bk-row');
    if (!row) return;
    const l = getList(), i = Number(row.dataset.i);
    if (e.target.closest('[data-del]')) { l.splice(i, 1); setList(l); return; }
    const st = e.target.closest('[data-step]');
    if (st) { l[i].qty = Math.max(1, Math.min(9999, (l[i].qty || 1) + Number(st.dataset.step))); store.set(LIST_KEY, l); row.querySelector('input').value = l[i].qty; }
  });
  $('#bk-sel').addEventListener('input', e => {
    const row = e.target.closest('.bk-row');
    if (!row || e.target.tagName !== 'INPUT') return;
    const l = getList(), i = Number(row.dataset.i);
    l[i].qty = Math.max(1, Math.min(9999, Math.floor(Number(e.target.value) || 1)));
    store.set(LIST_KEY, l);
  });
  $('#bk-clear').addEventListener('click', () => { setList([]); });
  const cfg = (id, k, num = false) => $(id).addEventListener('change', e => { S[k] = num ? Number(e.target.value) : e.target.value; saveCfg(); });
  cfg('#bk-sv', 'sv'); cfg('#bk-cur', 'cur'); cfg('#bk-basis', 'basis');
  $('#bk-tol').addEventListener('input', e => { S.tol = Math.max(0, Math.min(500, Number(e.target.value) || 0)); saveCfg(); });
  $('#bk-strat').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.strat = b.value; seg($('#bk-strat'), S.strat); stratHint(); saveCfg(); });
  $('#bk-start').addEventListener('change', e => setStart(e.target.value));
  const xy = () => { S.start = 'custom'; S.x = Math.max(0, Math.floor(Number($('#bk-x').value) || 0)); S.y = Math.max(0, Math.floor(Number($('#bk-y').value) || 0)); saveCfg(); $('#bk-start').value = 'custom'; drawCfgMap(); };
  $('#bk-x').addEventListener('input', debounce(xy, 200)); $('#bk-y').addEventListener('input', debounce(xy, 200));
  $('#bk-save-start').addEventListener('click', () => {
    const name = (prompt(T('bk.saveStartName'), `${S.x}, ${S.y}`) || '').trim().slice(0, 20);
    if (!name) return;
    const l = savedStarts().filter(p => p.name !== name);
    l.unshift({ name, x: Number(S.x), y: Number(S.y) });
    store.set(START_KEY, l.slice(0, 12));
    S.start = 'saved:0'; saveCfg(); fillStart(); toast(T('saved'));
  });
  $('#bk-saved').addEventListener('click', e => {
    const p = e.target.closest('[data-start-pick]'), d = e.target.closest('[data-start-del]');
    if (p) setStart('saved:' + p.dataset.startPick);
    if (d) { const l = savedStarts(); l.splice(Number(d.dataset.startDel), 1); store.set(START_KEY, l); if (S.start.startsWith('saved:')) S.start = 'custom'; saveCfg(); fillStart(); }
  });
  $('#bk-go').addEventListener('click', go);
}

export async function initBulk() {
  C = await loadCatalog();
  if (C.villages) $('#bk-src').hidden = false;
  seg($('#bk-kind'), S.kind); seg($('#bk-strat'), S.strat);
  $('#bk-sv').value = S.sv; $('#bk-cur').value = S.cur; $('#bk-basis').value = S.basis; $('#bk-tol').value = S.tol;
  stratHint(); renderQuick(); renderCands(); renderSel(); fillStart(); updateCount();
  bind();
}
// 頁面載入時就顯示已選數量
updateCount();
