// 市場查價器：市價比較、批次採購、資料管理
import { $, $$, T, api, esc, fmt, fmtWan, rates, loadFx, store, copy, toast, normName, petImgSrc, downloadCsv, debounce, PREVIEW, spriteImg, emptyState, runningState, tipHtml, dn, LANG } from './core.js';
import { decodeAlloc, gradeMeta, tierOf } from './petcalc.js';
import { lineChart } from './chart.js';
import { tradeStats, dailyWeighted, pricingRef, trialPrice, inPeriod, stripBr, twTime, FEE } from './mkstats.js';
import { loadCatalog, EQ_CATS, eqCatName, raceName } from './catalog.js';
import { initBulk } from './mkbulk.js';
import { initData, importedRecords } from './mkdata.js';

const ITEM_STATS = ['atk', 'def', 'agi', 'spt', 'rec', 'crit', 'ctr', 'hit', 'avd', 'hp', 'mp', 'matk', 'mres'];
const RES = ['poison', 'sleep', 'stone', 'drunk', 'confusion', 'amnesia'];
const SOUL = { 1007001: 'blue', 1007002: 'red', 1007003: 'yellow' };
const GRADE_BY_LV = { 5: 'normal', 6: 'silver', 7: 'gold' };
const TIER_KEY = { '金': 'gold', '銀': 'silver', '普': 'normal' };
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, all: 0 };
const ROWS_COLLAPSED = 6;
const BROWSE_MAX = 30;
const WATCH_KEY = 'sc.watch', RECENT_KEY = 'sc.recent', FAV_KEY = 'sc.favs', CFG_KEY = 'sc.mkcfg';
const BASE_TITLE = document.title;

const DEFAULTS = { kind: 'all', exact: false, sv: '', cur: 'all', range: '30d', src: 'official', sort: 'value', view: 'all', need: 1 };
const S = {
  ...DEFAULTS, ...(store.get(CFG_KEY) || {}),
  q: '', mode: 'query', browseNames: [], eqCat: '', eqLv: '', eqName: '', petList: 'dex', petRace: '', petTier: '', petQuick: '', petName: '',
  pf: { star: false, full: false, skill: false, slot: '', lv: new Set() },
  data: null, rows: [], hist: null, histPages: 3, histCur: null, histName: '', histShow: 30, expanded: new Set(), token: 0, tab: 'listing', cat: null,
  trial: { price: '', c: 0 },
};
const el = {
  form: $('#mk-form'), q: $('#mk-q'), kind: $('#mk-kind'), exact: $('#mk-exact'), fav: $('#mk-fav'),
  sv: $('#mk-sv'), cur: $('#mk-cur'), range: $('#mk-range'), src: $('#mk-src'), sort: $('#mk-sort'), view: $('#mk-view'), need: $('#mk-need'),
  status: $('#mk-status'), summary: $('#mk-summary'), results: $('#mk-results'), hist: $('#mk-history'), pricing: $('#mk-pricing'), watch: $('#mk-watch'),
};
const saveCfg = () => store.set(CFG_KEY, { kind: S.kind, exact: S.exact, sv: S.sv, cur: S.cur, range: S.range, src: S.src, sort: S.sort, view: S.view, need: S.need });

// ───────────────── 工具 ─────────────────
const nameMatch = (name, q, exact) => {
  const a = stripBr(normName(name)), b = stripBr(normName(q));
  return exact ? a === b : a.includes(b);
};
// 中文名或韓文名其中一個符合就算（韓文站可用韓文關鍵字）
const rowMatch = (r, q, exact) => nameMatch(r.n, q, exact) || (!!r.kn && nameMatch(r.kn, q, exact));
const coinEq = (price, cur) => (cur === 1 ? rates.crystalToCoin(price) : price);
const curName = c => T(c ? 'common.crystal' : 'common.coin');
function priceHtml(p, cur, conv = true) {
  const icon = cur === 1 ? 'crystal' : 'coin';
  const r = rates.get();
  let sub = '';
  if (conv) {
    if (cur === 1) sub = `≈ ${fmtWan(rates.crystalToCoin(p, r))} ${T('common.coin')} · ${rates.fiatText(p)}`;
    else sub = `≈ ${fmt(rates.coinToCrystal(p, r), 1)} ${T('common.crystal')}`;
  }
  return `<span class="price ${icon}"><svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg>${fmt(p)}</span>${sub ? `<span class="conv">${esc(sub)}</span>` : ''}`;
}
function parseExpire(s) {
  const m = String(s || '').match(/(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]) : null; // 官方時間為台灣時間
}
const ago = sec => (sec < 60 ? T('updatedAgo', { s: Math.max(0, Math.round(sec)) }) : T('updatedMin', { m: Math.round(sec / 60) }));
const tile = (label, body, sub = '', hl = false) => `<div class="stat-tile${hl ? ' hl' : ''}"><span>${esc(label)}</span><b>${body}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
const notice = (txt, cls = '', ic = 'sparkle') => `<div class="notice ${cls}"><svg class="ic"><use href="#i-${ic}"/></svg><span>${txt}</span></div>`;
const pct = (x, d = 1) => (x == null || !isFinite(x) ? '–' : `${x > 0 ? '+' : ''}${fmt(x * 100, d)}%`);
function seg(box, v) { $$('button', box).forEach(b => b.setAttribute('aria-pressed', String(b.value === String(v)))); }

// ───────────────── 目錄與篩選選單 ─────────────────
function fillEquipSelects() {
  const c = S.cat;
  if (!c) return;
  const cats = EQ_CATS.filter(k => c.equip.some(e => e.c === k));
  $('#eq-cat').innerHTML = `<option value="">${esc(T('mk.eq.catAll'))}</option>` + cats.map(k => `<option value="${k}">${esc(eqCatName(k))}</option>`).join('');
  $('#eq-cat').value = S.eqCat;
  const lvs = [...new Set(c.equip.filter(e => !S.eqCat || e.c === S.eqCat).map(e => e.lv))].sort((a, b) => a - b);
  $('#eq-lv').innerHTML = `<option value="">${esc(T('mk.eq.lvAll'))}</option>` + lvs.map(l => `<option value="${l}">${esc(T('mk.eq.lvN', { n: l }))}</option>`).join('');
  if (S.eqLv && !lvs.includes(Number(S.eqLv))) S.eqLv = '';
  $('#eq-lv').value = S.eqLv;
  const names = equipNames();
  $('#eq-name').innerHTML = `<option value="">${esc(T('mk.eq.nameAll', { n: names.length }))}</option>` + names.map(e => `<option value="${esc(e.n)}">${esc(e.n)}${S.eqLv ? '' : ` · ${esc(T('mk.eq.lvN', { n: e.lv }))}`}</option>`).join('');
  if (S.eqName && !names.some(e => e.n === S.eqName)) S.eqName = '';
  $('#eq-name').value = S.eqName;
}
function equipNames() {
  return (S.cat?.equip || []).filter(e => (!S.eqCat || e.c === S.eqCat) && (!S.eqLv || e.lv === Number(S.eqLv)));
}
function petCandidates() {
  const c = S.cat;
  if (!c) return [];
  const q = normName(S.petQuick);
  let list = S.petList === 'bounty'
    ? c.bountyPets.map(b => c.petByName.get(normName(b.n)) || { name: b.n, race: '', cardTier: b.tier })
    : c.pets;
  return list.filter(p => (!S.petRace || p.race === S.petRace) && (!S.petTier || tierOf(p.cardTier) === S.petTier) && (!q || normName(p.name).includes(q)));
}
function fillPetSelects() {
  const c = S.cat;
  if (!c) return;
  $('#pet-race').innerHTML = `<option value="">${esc(T('race.all'))}</option>` + c.races.map(r => `<option value="${esc(r)}">${esc(raceName(r))}</option>`).join('');
  $('#pet-race').value = S.petRace;
  $('#pet-tier').value = S.petTier;
  seg($('#pet-list'), S.petList);
  const list = petCandidates();
  $('#pet-name').innerHTML = `<option value="">${esc(T('mk.pet.nameAll', { n: list.length }))}</option>` + list.slice(0, 600).map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  if (S.petName && !list.some(p => p.name === S.petName)) S.petName = '';
  $('#pet-name').value = S.petName;
}
function syncKindUi() {
  seg(el.kind, S.kind);
  $('#mk-equip').hidden = S.kind !== 'equip';
  $('#mk-petsel').hidden = S.kind !== 'pet';
  el.exact.checked = S.exact;
  if (S.kind === 'equip') fillEquipSelects();
  if (S.kind === 'pet') fillPetSelects();
}
function syncFilterUi() {
  seg(el.sv, S.sv); seg(el.cur, S.cur); seg($('#mk-cur-quick'), S.cur); seg(el.src, S.src);
  el.range.value = S.range; el.sort.value = S.sort; el.view.value = S.view;
  el.need.hidden = S.view !== 'need'; el.need.value = S.need;
  $('#pf-star').checked = S.pf.star; $('#pf-full').checked = S.pf.full; $('#pf-skill').checked = S.pf.skill; $('#pf-slot').value = S.pf.slot;
  const n = [S.sv, S.cur !== 'all', S.range !== '30d', S.src !== 'official', S.sort !== 'value', S.view !== 'all', S.pf.star, S.pf.full, S.pf.skill, S.pf.slot, S.pf.lv.size].filter(Boolean).length;
  $('#mk-adv-count').hidden = !n; $('#mk-adv-count').textContent = n;
}

// ───────────────── 網址 ─────────────────
function readUrl() {
  const p = new URLSearchParams(location.search);
  let pending = '';
  try { pending = sessionStorage.getItem('sc.pendingQ') || ''; sessionStorage.removeItem('sc.pendingQ'); } catch { /* 忽略 */ }
  S.q = (p.get('q') || pending).trim().slice(0, 40);
  const kind = p.get('kind') || ({ item: 'item', pet: 'pet' })[p.get('type')];
  if (['all', 'equip', 'item', 'pet'].includes(kind)) S.kind = kind;
  else if (p.get('q')) S.kind = 'all'; // 分享連結只帶關鍵字時，不沿用上次選的種類
  if (p.has('exact')) S.exact = p.get('exact') === '1';
  else if (p.get('q')) S.exact = false;
  S.eqCat = p.get('cat') || ''; S.eqLv = p.get('lv') || '';
  S.petRace = p.get('race') || ''; S.petTier = p.get('tier') || '';
  if (p.get('list') === 'bounty') S.petList = 'bounty';
  el.q.value = S.q;
  if (p.get('tab') === 'bulk' || p.get('tab') === 'data') setMain(p.get('tab'));
}
function writeUrl() {
  const p = new URLSearchParams();
  if (S.q) p.set('q', S.q);
  if (S.kind !== 'all') p.set('kind', S.kind);
  if (S.exact) p.set('exact', '1');
  if (S.mode === 'browse-equip') { if (S.eqCat) p.set('cat', S.eqCat); if (S.eqLv) p.set('lv', S.eqLv); }
  if (S.mode === 'browse-pet') { if (S.petRace) p.set('race', S.petRace); if (S.petTier) p.set('tier', S.petTier); if (S.petList === 'bounty') p.set('list', 'bounty'); }
  history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  document.title = S.q ? `${S.q}｜${BASE_TITLE}` : BASE_TITLE;
  syncFav();
}

// ───────────────── 查詢 ─────────────────
async function search(fresh = false) {
  S.q = el.q.value.trim().slice(0, 40);
  S.cat = S.cat || await loadCatalog();
  // 決定查詢方式：關鍵字／裝備分類瀏覽／寵物瀏覽
  let mode = 'query', names = [];
  if (!S.q && S.kind === 'equip') {
    if (S.eqName) { S.q = S.eqName; S.exact = true; el.q.value = S.q; }
    else {
      names = equipNames().map(e => e.n);
      if (!S.eqCat && !S.eqLv) { toast(T('mk.needFilter')); el.q.focus(); return; }
      if (names.length > BROWSE_MAX) { toast(T('mk.tooMany', { n: names.length, max: BROWSE_MAX })); return; }
      mode = 'browse-equip';
    }
  } else if (!S.q && S.kind === 'pet') {
    if (S.petName) { S.q = S.petName; S.exact = true; el.q.value = S.q; }
    else mode = 'browse-pet';
  }
  if (mode === 'query' && !S.q) { el.q.focus(); return; }
  S.mode = mode; S.browseNames = names;
  el.exact.checked = S.exact;
  const token = ++S.token;
  S.expanded.clear(); S.histName = ''; S.histShow = 30; S.pf.lv.clear();
  writeUrl(); saveCfg();
  if (mode === 'query') saveRecent(S.q);
  setTab('listing');
  el.summary.hidden = true;
  el.status.hidden = false;
  el.status.innerHTML = `<span class="dot"></span>${esc(T('searching'))}`;
  $$('.mk-notes').forEach(n => n.remove());
  el.results.innerHTML = runningState(T('searching')) + Array.from({ length: 2 }, () => `<div class="skel" style="height:118px;margin-bottom:12px"></div>`).join('');
  if (mode === 'query') loadHistory(token); else { S.hist = null; renderHistory(); renderPricing(); }
  try {
    let d;
    if (mode === 'browse-equip') d = mergeBatch(await api('batch', { n: names, type: 'item', fresh: fresh ? 1 : '' }, { timeout: 60000 }), names);
    else if (mode === 'browse-pet') d = await api('market', { q: '', type: 'pet', fresh: fresh ? 1 : '' }, { timeout: 60000 });
    else d = await api('market', { q: S.q, type: S.kind === 'pet' ? 'pet' : S.kind === 'all' ? 'all' : 'item', exact: S.exact ? 1 : '', fresh: fresh ? 1 : '' });
    if (token !== S.token) return;
    S.data = d;
    S.rows = flatten(d);
    render();
    renderPricing();
  } catch (e) {
    if (token !== S.token) return;
    el.status.hidden = true;
    const msg = e.status === 429 ? '⏳ ' + T('mk.rateLimited') : T('error');
    el.results.innerHTML = notice(`${esc(msg)} <button class="btn sm" type="button" data-retry>${esc(T('retry'))}</button>`, 'bad', 'close');
  }
}

/** 批次結果合併成單一資料結構 */
function mergeBatch(b, names) {
  const out = { stalls: [], items: [], pets: [], pages: { fetched: 0, total: 0, failed: [] }, totalStalls: 0, fetchedAt: Infinity, age: 0, stale: false, truncated: false, demo: b.demo, failedNames: b.failed || [] };
  const res = b.results || {};
  for (const n of names) {
    const d = res[n];
    if (!d) continue;
    const off = out.stalls.length;
    out.stalls.push(...(d.stalls || []));
    for (const it of d.items || []) out.items.push({ ...it, s: it.s + off });
    for (const p of d.pets || []) out.pets.push({ ...p, s: p.s + off });
    out.pages.fetched += d.pages?.fetched || 0; out.pages.total += d.pages?.total || 0;
    out.pages.failed.push(...(d.pages?.failed || []));
    out.totalStalls += d.receivedStalls ?? (d.stalls || []).length;
    out.fetchedAt = Math.min(out.fetchedAt, d.fetchedAt || Infinity);
    out.age = Math.max(out.age, d.age || 0);
    out.stale ||= !!d.stale; out.truncated ||= !!d.truncated;
  }
  if (!isFinite(out.fetchedAt)) out.fetchedAt = Date.now() / 1000;
  return out;
}

function flatten(d) {
  const c = S.cat;
  const stalls = d.stalls || [];
  const rows = [];
  const want = new Set(S.browseNames.map(n => normName(n)));
  for (const it of d.items || []) {
    if (S.mode === 'query' && !rowMatch(it, S.q, S.exact)) continue;
    if (S.mode === 'browse-equip' && !want.has(stripBr(normName(it.n)))) continue;
    const isEq = c?.isEquip(stripBr(it.n));
    if (S.kind === 'equip' && !isEq) continue;      // 依裝備名錄判斷
    if (S.kind === 'item' && isEq) continue;        // 道具查詢排除已收錄的裝備
    rows.push({ ...it, pet: false, st: it.st || {}, rs: it.rs || {}, stall: stalls[it.s] || {} });
  }
  for (const p of d.pets || []) {
    if (S.mode === 'query' && !rowMatch(p, S.q, S.exact)) continue;
    if (S.kind === 'equip' || S.kind === 'item') continue;
    const r = { ...p, pet: true, stall: stalls[p.s] || {} };
    const gp = c?.petByName.get(normName(p.n));
    r.gp = gp; r.race = gp?.race || ''; r.tier = gp ? tierOf(gp.cardTier) : '';
    if (gp) {
      const base = r.ap ? decodeAlloc(r.ap) : null, star = r.pa ? decodeAlloc(r.pa) : null;
      const m = gradeMeta(gp, base, star, r.sl);
      r.meta = m ? { ...m, fullSkill: !!(m.maxStar && m.skillDrop === 0), base } : null;
    }
    if (S.mode === 'browse-pet') {
      if (S.petRace && r.race !== S.petRace) continue;
      if (S.petTier && r.tier !== S.petTier) continue;
      if (S.petList === 'bounty' && !c?.bountyPetSet.has(normName(p.n))) continue;
      if (S.petQuick && !normName(p.n).includes(normName(S.petQuick))) continue;
    }
    rows.push(r);
  }
  rows.forEach(r => { r.val = coinEq(r.p, r.c); r.expTs = parseExpire(r.stall.exp); r.name = stripBr(r.n); });
  return rows;
}

// ───────────────── 篩選與檢視 ─────────────────
const lvBucket = lv => Math.max(0, Math.floor(((lv || 1) - 1) / 10));
function filteredRows() {
  return S.rows.filter(r => {
    if (S.cur !== 'all' && r.c !== Number(S.cur)) return false;
    if (S.sv && String(r.stall.sv) !== S.sv) return false;
    if (r.pet) {
      if (S.pf.star && !r.meta?.maxStar) return false;
      if (S.pf.full && !r.meta?.full) return false;
      if (S.pf.skill && !r.meta?.fullSkill) return false;
      if (S.pf.slot && String(r.sl) !== S.pf.slot) return false;
      if (S.pf.lv.size && !S.pf.lv.has(lvBucket(r.lv))) return false;
    } else if (S.pf.star || S.pf.full || S.pf.skill || S.pf.slot || S.pf.lv.size) return false;
    return true;
  });
}
function sortRows(rows) {
  const by = {
    value: (a, b) => a.val - b.val,
    coin: (a, b) => (a.c - b.c) || a.p - b.p,
    crystal: (a, b) => (b.c - a.c) || a.p - b.p,
    expire: (a, b) => (a.expTs || 9e15) - (b.expTs || 9e15),
  }[S.sort];
  return rows.sort(by);
}
/** 依檢視方式挑出要顯示的攤位 */
function applyView(rs) {
  if (S.view === 'lowest') {
    const keep = [];
    for (const c of [0, 1]) {
      const L = rs.filter(r => r.c === c);
      if (!L.length) continue;
      const min = Math.min(...L.map(r => r.p));
      keep.push(...L.filter(r => r.p === min));       // 保留所有同價攤位
    }
    return keep;
  }
  if (S.view === 'server') {
    const best = new Map();
    for (const r of rs) {
      const k = `${r.stall.sv}|${r.c}`;
      if (!best.has(k) || r.p < best.get(k).p) best.set(k, r);
    }
    return [...best.values()].sort((a, b) => (a.stall.sv - b.stall.sv) || (a.c - b.c));
  }
  if (S.view === 'need') {
    const keep = [];
    for (const c of [0, 1]) {
      const L = rs.filter(r => r.c === c).sort((a, b) => a.p - b.p);
      let cum = 0, cost = 0;
      for (const r of L) {
        if (cum >= S.need) break;
        const take = Math.min(r.q || 1, S.need - cum);
        cum += take; cost += take * r.p;
        keep.push({ ...r, take, cum, cumCost: cost });
      }
    }
    return keep;
  }
  return rs;
}

// ───────────────── 畫面：目前攤位 ─────────────────
function render() {
  const d = S.data;
  if (!d) return;
  renderStatus();
  renderLvChips();
  const rows = filteredRows();
  const tabCount = $('#tab-listing .count');
  tabCount.hidden = !rows.length; tabCount.textContent = rows.length;
  if (!rows.length) {
    el.summary.hidden = true;
    el.results.innerHTML = emptyState('adv-look', T('noResult'), S.rows.length ? T('mk.filteredOut') : T('noResultTip'));
    return;
  }
  renderSummary(rows);
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.name)) groups.set(r.name, []);
    groups.get(r.name).push(r);
  }
  const list = [...groups.entries()].map(([name, rs]) => ({ name, kn: rs.find(r => r.kn)?.kn || '', all: rs, rs: S.view === 'all' ? sortRows(rs) : applyView(sortRows(rs)), min: Math.min(...rs.map(r => r.val)) }));
  list.sort((a, b) => a.min - b.min);
  const bestVal = Math.min(...rows.map(r => r.val));
  const showMax = 60;
  el.results.innerHTML = list.slice(0, showMax).map(g => groupHtml(g, bestVal)).join('') +
    (list.length > showMax ? notice(esc(T('mk.groupsCut', { n: list.length, max: showMax })), 'info', 'filter') : '');
}
function renderStatus() {
  const d = S.data;
  const age = d.age ?? 0;
  const parts = [`<span class="dot${d.stale ? ' stale' : ''}"></span><span>${esc(ago(age))}</span>`,
    `<span>${esc(T('stalls', { n: d.totalStalls ?? (d.stalls || []).length }))} · ${esc(T('listings', { n: S.rows.length }))}</span>`];
  if (d.pages) parts.push(`<span class="muted">${esc(T('pagesInfo', { a: d.pages.fetched, b: d.pages.total }))}</span>`);
  if (S.mode !== 'query') parts.push(`<span class="badge b-lav">${esc(T(S.mode === 'browse-pet' ? 'mk.mode.pet' : 'mk.mode.equip', { n: S.browseNames.length }))}</span>`);
  parts.push(`<button class="btn sm ghost" type="button" data-refresh><svg class="ic"><use href="#i-refresh"/></svg>${esc(T('refresh'))}</button>`);
  let notes = '';
  if (d.demo || PREVIEW) notes += notice(esc(T('preview')), 'info');
  if (d.stale) notes += notice(esc(T('stale', { m: Math.max(1, Math.round(age / 60)) })), '', 'clock');
  if (d.pages?.failed?.length || d.failedNames?.length) notes += notice(esc(T('incomplete', { n: (d.pages?.failed?.length || 0) + (d.failedNames?.length || 0) })), '', 'clock');
  if (d.truncated) notes += notice(esc(T('truncated', { n: d.totalStalls })), '', 'filter');
  el.status.hidden = false;
  el.status.innerHTML = parts.join('');
  $$('.mk-notes').forEach(n => n.remove());
  if (notes) el.status.insertAdjacentHTML('afterend', `<div class="mk-notes">${notes}</div>`);
}
function renderLvChips() {
  const box = $('#pf-lv');
  const buckets = [...new Set(S.rows.filter(r => r.pet).map(r => lvBucket(r.lv)))].sort((a, b) => a - b);
  $('#mk-petf').hidden = !buckets.length && S.kind !== 'pet';
  box.innerHTML = buckets.length
    ? buckets.map(b => `<button type="button" class="chip${S.pf.lv.has(b) ? ' on' : ''}" data-lv="${b}" aria-pressed="${S.pf.lv.has(b)}">${b * 10 + 1}–${b * 10 + 10}</button>`).join('')
    : `<span class="small muted">${esc(T('mk.petf.lvNone'))}</span>`;
}
function renderSummary(rows) {
  const coins = rows.filter(r => r.c === 0), crys = rows.filter(r => r.c === 1);
  const minC = coins.length ? coins.reduce((a, b) => (b.p < a.p ? b : a)) : null;
  const minX = crys.length ? crys.reduce((a, b) => (b.p < a.p ? b : a)) : null;
  let deal = '–', dealSub = '';
  if (minC && minX) {
    const xEq = rates.crystalToCoin(minX.p);
    const diff = (minC.p - xEq) / Math.max(minC.p, xEq);
    if (Math.abs(diff) < 0.02) deal = T('sameValue');
    else if (diff > 0) deal = T('cheaperCrystal', { p: fmt(diff * 100, 1) });
    else deal = T('cheaperCoin', { p: fmt(-diff * 100, 1) });
    dealSub = `${fmtWan(1e6)} ${T('common.coin')} = ${fmt(rates.get().crystalPerMil)} ${T('common.crystal')}`;
  }
  const hs = histStats();
  const histTxt = hs ? [0, 1].filter(c => hs[c]?.count).map(c => `${c ? '◆' : '●'} ${fmt(hs[c].wavg)}`).join(' / ') || '–' : (S.mode === 'query' ? '…' : '–');
  el.summary.innerHTML =
    tile(T('minCoin'), minC ? `${fmt(minC.p)}` : '–', minC ? esc(minC.stall.n || '') : '') +
    tile(T('minCrystal'), minX ? `${fmt(minX.p)}` : '–', minX ? esc(minX.stall.n || '') : '') +
    tile(T('bestDeal'), esc(deal), esc(dealSub), true) +
    tile(T('mk.sumHist', { r: T('mk.range.' + S.range) }), esc(histTxt), esc(S.histName ? `${S.histName} · ● ${T('common.coin')} ◆ ${T('common.crystal')}` : `● ${T('common.coin')} ◆ ${T('common.crystal')}`));
  el.summary.hidden = false;
}
function groupHtml(g, bestVal) {
  const first = g.all[0];
  const watched = isWatched(g.name);
  const coins = g.all.filter(r => r.c === 0), crys = g.all.filter(r => r.c === 1);
  const minCoin = coins.length ? Math.min(...coins.map(r => r.p)) : null;
  const minCry = crys.length ? Math.min(...crys.map(r => r.p)) : null;
  let img = '';
  if (first.pet && first.gp?.imageId) img = `<img src="${petImgSrc(first.gp.imageId)}" data-pet="${first.gp.imageId}" alt="" width="36" height="36" loading="lazy">`;
  const kindBadge = first.pet ? 'b-mint' : S.cat?.isEquip(g.name) ? 'b-coral' : 'b-sky';
  const kindTxt = first.pet ? T('mk.kind.pet') : S.cat?.isEquip(g.name) ? T('mk.kind.equip') : T('mk.kind.item');
  const expanded = S.expanded.has(g.name) || S.view !== 'all';
  const shown = expanded ? g.rs : g.rs.slice(0, ROWS_COLLAPSED);
  const more = S.view === 'all' && g.rs.length > ROWS_COLLAPSED
    ? `<button class="mk-more" type="button" data-expand="${esc(g.name)}">${esc(S.expanded.has(g.name) ? T('less') : T('more', { n: g.rs.length }))}</button>` : '';
  let needNote = '';
  if (S.view === 'need') {
    needNote = [0, 1].map(c => {
      const L = g.rs.filter(r => r.c === c);
      if (!L.length) return '';
      const last = L[L.length - 1];
      const ok = last.cum >= S.need;
      return `<span class="badge ${ok ? 'b-ok' : 'b-warn'}">${esc(curName(c))} · ${esc(ok ? T('mk.needOk', { n: L.length, cost: fmt(last.cumCost) }) : T('mk.needShort', { got: last.cum, need: S.need }))}</span>`;
    }).join('');
  }
  return `<article class="mk-group">
    <div class="mk-group-head">
      <h3>${img}<span>${esc(LANG === 'ko' && g.kn ? stripBr(g.kn) : g.name)}</span>${LANG === 'ko' && g.kn ? `<small class="mk-zh" lang="zh-Hant">${esc(g.name)}</small>` : ''}</h3>
      <span class="badge ${kindBadge}">${esc(kindTxt)}</span>
      <span class="badge b-gray">${esc(T('listings', { n: g.all.length }))}</span>
      <div class="meta">
        ${minCoin != null ? priceHtml(minCoin, 0, false) : ''}${minCry != null ? priceHtml(minCry, 1, false) : ''}
        ${S.mode === 'query' ? '' : `<button class="btn sm ghost" type="button" data-goto="${esc(g.name)}" data-exact="1">${esc(T('mk.history'))}</button>`}
        <button class="watch-btn" type="button" data-watch="${esc(g.name)}" data-kind="${first.pet ? 'pet' : 'item'}" aria-pressed="${watched}" aria-label="${esc(T(watched ? 'watchRemove' : 'watchAdd'))}" title="${esc(T(watched ? 'watchRemove' : 'watchAdd'))}"><svg class="ic"><use href="#i-star"/></svg></button>
      </div>
    </div>
    ${needNote ? `<div class="mk-need-note">${needNote}</div>` : ''}
    <ul class="mk-list">${shown.map(r => rowHtml(r, bestVal)).join('')}</ul>${more}
  </article>`;
}
function rowHtml(r, bestVal) {
  const tags = r.pet ? petTags(r) : itemTags(r);
  const s = r.stall;
  const exp = s.exp ? String(s.exp).slice(5, 16) : '';
  const take = r.take != null ? `<span class="badge b-sky">${esc(T('mk.take', { k: r.take, cum: r.cum }))}</span>` : '';
  return `<li class="mk-row${r.val === bestVal ? ' best-row' : ''}">
    <div class="mk-price">${priceHtml(r.p, r.c)}</div>
    <div class="mk-tags">${take}${tags}</div>
    <div class="mk-stall"><b title="${esc(s.n || '')}">${esc(s.n || '—')}</b>
      <span class="mk-loc-line">${s.sv != null ? `<span class="badge b-gray">S${esc(s.sv)}</span> ` : ''}<span class="loc"><svg class="ic"><use href="#i-pin"/></svg>${esc(s.loc || '')}</span>
      ${exp ? `<span class="muted">${esc(T('expires'))} ${esc(exp)}</span>` : ''}</span></div>
    <div class="mk-act">${s.loc ? `<button class="btn sm icon ghost" type="button" data-copy="${esc(s.loc)}" aria-label="${esc(T('copyCoords'))}" title="${esc(T('copyCoords'))}"><svg class="ic"><use href="#i-copy"/></svg></button>` : ''}</div>
  </li>`;
}
function itemTags(r) {
  const out = [];
  if (r.q > 1) out.push(`<span class="stat-chip">${esc(T('qty'))} <b>×${fmt(r.q)}</b></span>`);
  const eq = S.cat?.equipByName.get(normName(r.name));
  if (eq) out.push(`<span class="stat-chip">${esc(eqCatName(eq.c))} <b>${esc(T('mk.eq.lvN', { n: eq.lv }))}</b></span>`);
  const grade = /改造圖/.test(r.n) ? GRADE_BY_LV[r.lv] : null;
  if (grade) out.push(`<span class="badge b-${grade}">${esc(T('card.' + grade))}</span>`);
  if (SOUL[r.id]) out.push(`<span class="badge b-lav">${esc(T('soul.' + SOUL[r.id]))}</span>`);
  if (r.d && r.d[1] > 0) out.push(`<span class="stat-chip">${esc(T('dur'))} <b>${fmt(r.d[0])}/${fmt(r.d[1])}</b></span>`);
  for (const k of ITEM_STATS) if (r.st[k]) out.push(`<span class="stat-chip ${r.st[k] > 0 ? 'pos' : 'neg'}">${esc(T('stat.' + k))} <b>${r.st[k] > 0 ? '+' : ''}${fmt(r.st[k])}</b></span>`);
  for (const k of RES) if (r.rs[k]) out.push(`<span class="stat-chip">${esc(T('res.' + k))} <b>${fmt(r.rs[k])}</b></span>`);
  if (r.arg && /重來的種子/.test(r.n)) {
    out.push(String(r.arg).split('|').map(Number).map((v, i) => (v ? `<span class="stat-chip ${v > 0 ? 'pos' : 'neg'}">${esc(T('bp.' + i))} <b>${v > 0 ? '+' : ''}${v}</b></span>` : '')).join(''));
  }
  return out.join('') || '<span class="muted">—</span>';
}
function petTags(r) {
  const out = [];
  if (r.tier) out.push(`<span class="badge b-${TIER_KEY[r.tier]}">${esc(T('card.' + TIER_KEY[r.tier]))}</span>`);
  out.push(`<span class="stat-chip">Lv <b>${fmt(r.lv || 1)}</b></span>`);
  if (r.tr) out.push(`<span class="stat-chip"><b>${esc(T('pet.trans', { n: r.tr }))}</b></span>`);
  if (r.sl) out.push(`<span class="stat-chip">${esc(T('pet.slot', { n: r.sl }))}</span>`);
  const m = r.meta;
  if (m?.drop != null) {
    const title = `${T('pet.grades')} ${m.base.join('/')}（${r.gp.bp.join('/')}）`;
    out.push(m.full ? `<span class="badge b-ok" title="${esc(title)}">${esc(T('pet.full'))}</span>` : `<span class="badge b-warn" title="${esc(title)}">${esc(T('pet.drop', { n: m.drop }))}</span>`);
  }
  if (m?.totalStar != null) out.push(m.maxStar ? `<span class="badge b-pink">${esc(T('pet.maxStar'))}</span>` : `<span class="badge b-gray">${esc(T('pet.star', { n: m.totalStar }))}</span>`);
  if (m?.fullSkill) out.push(`<span class="badge b-lav">${esc(T('mk.fullSkill'))}</span>`);
  return out.join('');
}

// ───────────────── 成交行情 ─────────────────
async function loadHistory(token, more = false) {
  if (!more) { S.hist = null; S.histPages = 3; }
  el.hist.innerHTML = `<div class="skel" style="height:240px"></div>`;
  if (S.src === 'import') { S.hist = { logs: importedRecords().filter(l => nameMatch(l.n, S.q, S.exact)), imported: true }; afterHistory(); return; }
  try {
    const d = await api('history', { q: S.q, type: S.kind === 'pet' ? 'pet' : S.kind === 'all' ? 'all' : 'item', pages: S.histPages, range: S.range });
    if (token !== S.token) return;
    S.hist = { ...d, logs: (d.logs || []).filter(l => rowMatch(l, S.q, S.exact)) };
    afterHistory();
  } catch {
    if (token !== S.token) return;
    el.hist.innerHTML = notice(esc(T('error')), 'bad', 'close');
  }
}
function afterHistory() {
  const h = S.hist;
  h.logs = inPeriod(h.logs.map(l => ({ ...l, n: stripBr(l.n), kn: l.kn ? stripBr(l.kn) : '' })), RANGE_DAYS[S.range]);
  h.kn = new Map(); for (const l of h.logs) if (l.kn && !h.kn.has(l.n)) h.kn.set(l.n, l.kn);
  // 預設商品：與關鍵字同名者，否則成交最多者（避免不同商品價格混在一起）
  const counts = new Map();
  for (const l of h.logs) counts.set(l.n, (counts.get(l.n) || 0) + 1);
  h.names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (!S.histName || !counts.has(S.histName)) S.histName = h.names.find(n => normName(n) === stripBr(normName(S.q)) || normName(h.kn.get(n) || '') === stripBr(normName(S.q))) || h.names[0] || '';
  renderHistory();
  renderPricing();
  if (S.data) renderSummary(filteredRows());
}
function histLogs() { return (S.hist?.logs || []).filter(l => l.n === S.histName); }
function histStats() {
  if (!S.hist) return null;
  const L = histLogs();
  return { 0: tradeStats(L.filter(l => l.c === 0)), 1: tradeStats(L.filter(l => l.c === 1)) };
}
function productSelect(id) {
  const names = S.hist?.names || [];
  const show = n => (LANG === 'ko' && S.hist?.kn?.get(n)) || n;
  if (names.length < 2) return names.length ? `<b class="mk-prod">${esc(show(names[0]))}</b>` : '';
  return `<label class="field field-inline mk-prod-sel"><span>${esc(T('mk.product'))}</span><select class="input sm" id="${id}">${names.map(n => `<option value="${esc(n)}"${n === S.histName ? ' selected' : ''}>${esc(show(n))}</option>`).join('')}</select></label>`;
}
function renderHistory() {
  const h = S.hist;
  const cnt = $('#tab-history .count');
  if (S.mode !== 'query') { cnt.hidden = true; el.hist.innerHTML = emptyState('adv-sit', T('mk.pickName'), T('mk.pickNameTip')); return; }
  if (!h) return;
  const logs = histLogs();
  cnt.hidden = !logs.length; cnt.textContent = logs.length;
  const rangeNote = h.range && h.requestedRange && h.range !== h.requestedRange ? notice(esc(T('mk.rangeLimited', { r: h.range })), '', 'clock') : '';
  const srcNote = h.imported ? notice(esc(T('mk.usingImport')), 'info', 'download') : '';
  if (!logs.length) { el.hist.innerHTML = srcNote + rangeNote + emptyState('adv-look', T(h.imported ? 'mk.importEmpty' : 'history.empty')); return; }
  const st = histStats();
  const curs = [0, 1].filter(c => st[c].count);
  if (S.histCur == null || !curs.includes(S.histCur)) S.histCur = curs.sort((a, b) => st[b].count - st[a].count)[0];
  const cards = curs.map(c => {
    const s = st[c];
    return `<div class="card"><h3 class="card-title"><svg class="ic"><use href="#i-${c ? 'crystal' : 'coin'}"/></svg>${esc(curName(c))}<span class="sub">${esc(T('mk.qtyTotal', { n: fmt(s.qty) }))}</span></h3>
      <div class="kv kv-4">
        ${tile(T('mk.st.min'), fmt(s.min))}${tile(T('mk.st.max'), fmt(s.max))}
        ${tile(T('mk.st.wavg'), fmt(s.wavg), esc(T('mk.st.wavgSub')), true)}${tile(T('mk.st.count'), fmt(s.count), esc(`${T('history.median')} ${fmt(s.median)}`))}
      </div></div>`;
  }).join('');
  const days = dailyWeighted(logs.filter(l => l.c === S.histCur));
  const segs = curs.length > 1 ? `<div class="seg seg-sm" id="hist-cur">${curs.map(c => `<button type="button" value="${c}" aria-pressed="${c === S.histCur}">${esc(curName(c))}</button>`).join('')}</div>` : '';
  const list = [...logs].sort((a, b) => b.t - a.t);
  const shown = list.slice(0, S.histShow);
  el.hist.innerHTML = srcNote + rangeNote + `<div class="row mk-hist-head">${productSelect('hist-name')}<span class="spacer"></span><button class="btn sm" type="button" data-csv><svg class="ic"><use href="#i-download"/></svg>${esc(T('mk.csv'))}</button></div>
    <div class="grid g2">${cards}</div>
    <section class="card"><h3 class="card-title"><svg class="ic"><use href="#i-chart"/></svg>${esc(T('mk.trend'))}<span class="sub">${segs}</span></h3><div id="hist-chart"></div><p class="small muted" style="margin:6px 0 0">${esc(T('mk.trendHint'))}</p></section>
    <section class="card"><h3 class="card-title"><svg class="ic"><use href="#i-list"/></svg>${esc(T('history.list'))}</h3>
      <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>${esc(T('history.time'))}</th><th class="num">${esc(T('qty'))}</th><th class="num">${esc(T('history.price'))}</th></tr></thead><tbody>
      ${shown.map(l => `<tr><td class="num">${esc(twTime(l.t).slice(5))}</td><td class="num">${fmt(l.q)}</td><td class="num">${priceHtml(l.p, l.c, false)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row end" style="margin-top:10px">${list.length > shown.length ? `<button class="btn sm" type="button" data-hist-more>${esc(T('history.more'))}</button>` : ''}${!h.imported && h.truncated && S.histPages < 10 ? `<button class="btn sm" type="button" data-hist-fetch>${esc(T('mk.fetchMore'))}</button>` : ''}</div>
    </section>`;
  lineChart($('#hist-chart'), days.map(d => d.label), days.map(d => d.wavg), {
    cls: S.histCur ? 'crystal' : 'coin', fmt: v => fmtWan(v), label: T('mk.trend'),
    tip: i => `${esc(days[i].label)}：<b>${esc(fmt(days[i].wavg))}</b><br>${esc(T('mk.tipDay', { c: days[i].count, q: days[i].qty }))}`,
  });
}

// ───────────────── 擺攤定價參考 ─────────────────
function renderPricing() {
  if (S.mode !== 'query') { el.pricing.innerHTML = emptyState('adv-sit', T('mk.pickName'), T('mk.pickNameTip')); return; }
  if (!S.hist) { el.pricing.innerHTML = `<div class="skel" style="height:200px"></div>`; return; }
  const name = S.histName || stripBr(S.q);
  const logs = histLogs();
  const asks = c => S.rows.filter(r => r.name === name && r.c === c).map(r => r.p);
  const cards = [0, 1].map(c => {
    const L = logs.filter(l => l.c === c), A = asks(c);
    if (!L.length && !A.length) return '';
    const ref = pricingRef(L, A);
    const body = ref.enough
      ? tile(T('mk.pr.median'), fmt(ref.median), '', true) +
        tile(T('mk.pr.minAsk'), ref.minAsk != null ? fmt(ref.minAsk) : '–', esc(T('mk.pr.asks', { n: ref.asks }))) +
        tile(T('mk.pr.range'), `${fmt(ref.p25)}～${fmt(ref.p75)}`, esc(T('mk.pr.rangeSub'))) +
        tile(T('mk.pr.diff'), ref.diff != null ? `${ref.diff > 0 ? '+' : ''}${fmt(ref.diff)}` : '–', ref.diffPct != null ? esc(pct(ref.diffPct)) : '')
      : `<p class="muted small" style="grid-column:1/-1;margin:0">${esc(T('mk.pr.notEnough', { n: ref.count, min: 5 }))}${ref.minAsk != null ? ' ' + esc(T('mk.pr.minAskOnly', { p: fmt(ref.minAsk) })) : ''}</p>`;
    return `<div class="card"><h3 class="card-title"><svg class="ic"><use href="#i-${c ? 'crystal' : 'coin'}"/></svg>${esc(curName(c))}<span class="sub">${esc(T('mk.st.count'))} ${fmt(ref.count)}</span></h3><div class="kv kv-4">${body}</div></div>`;
  }).join('');
  el.pricing.innerHTML = `<div class="row mk-hist-head">${productSelect('pr-name') || `<b class="mk-prod">${esc(name)}</b>`}<span class="spacer"></span>${tipHtml(T('mk.pr.note'), true)}</div>
    ${cards ? `<div class="grid g2">${cards}</div>` : emptyState('adv-look', T('history.empty'))}
    <section class="card"><h3 class="card-title"><svg class="ic"><use href="#i-exchange"/></svg>${esc(T('mk.trial'))}</h3>
      <div class="mk-trial-row">
        <div class="input-wrap"><input class="input" id="tr-price" inputmode="decimal" placeholder="${esc(T('mk.trialPh'))}" value="${esc(S.trial.price)}"></div>
        <div class="seg" id="tr-cur"><button type="button" value="0" aria-pressed="${S.trial.c === 0}">${esc(T('common.coin'))}</button><button type="button" value="1" aria-pressed="${S.trial.c === 1}">${esc(T('common.crystal'))}</button></div>
      </div>
      <div id="tr-out" class="mk-trial-out" aria-live="polite"></div>
    </section>`;
  renderTrial();
}
function renderTrial() {
  const out = $('#tr-out');
  if (!out) return;
  const name = S.histName || stripBr(S.q);
  const c = S.trial.c;
  const L = histLogs().filter(l => l.c === c);
  const A = S.rows.filter(r => r.name === name && r.c === c).map(r => r.p);
  const t = trialPrice(String(S.trial.price).replace(/[,\s]/g, ''), c, L, A);
  if (!t) { out.innerHTML = `<p class="muted small" style="margin:0">${esc(T('mk.trialEmpty'))}</p>`; return; }
  const zoneTxt = t.zone ? T('mk.zone.' + t.zone) : T('mk.zone.none');
  out.innerHTML = `<div class="kv kv-4">
      ${tile(T('mk.trial.net'), fmt(t.net), esc(T('mk.trial.fee', { f: fmt(t.fee), p: fmt(FEE[c] * 100) })), true)}
      ${tile(T('mk.trial.vsMedian'), t.vsMedian != null ? esc(pct(t.vsMedian)) : '–')}
      ${tile(T('mk.trial.sold'), t.atOrAbove != null ? esc(fmt(t.atOrAbove * 100, 0) + '%') : '–', esc(T('mk.trial.soldSub')))}
      ${tile(T('mk.trial.rank'), esc(T('mk.trial.rankV', { r: t.rank, n: t.of })))}
    </div><p class="verdict ${t.zone === 'mid' ? 'coin' : ''}" style="margin:10px 0 0">${esc(zoneTxt)}</p>`;
}

// ───────────────── 每日市場動態 ─────────────────
let dailyDay = 0;
async function loadDaily() {
  const body = $('#daily-body');
  const d = new Date(Date.now() + 8 * 3600e3 - dailyDay * 86400e3).toISOString().slice(0, 10);
  try {
    const r = await api('daily', { day: d });
    const t = r.totals || {};
    const item = (x, extra) => `<li><button type="button" class="dl-name" data-goto="${esc(x.n)}" data-exact="1">${esc(dn(x))}</button>${extra}</li>`;
    const medTxt = m => [0, 1].filter(c => m?.[c] != null).map(c => `<span class="price ${c ? 'crystal' : 'coin'}"><svg class="ic"><use href="#i-${c ? 'crystal' : 'coin'}"/></svg>${fmt(m[c])}</span>`).join(' ');
    const move = m => item(m, `<span class="dl-move ${m.chg > 0 ? 'up' : 'down'}">${esc(pct(m.chg, 0))}</span><span class="dl-sub">${esc(curName(m.c))} ${fmt(m.before)} → <b>${fmt(m.now)}</b></span>`);
    const cov = r.coverage?.from ? T('mk.daily.cov', { a: twTime(r.coverage.from).slice(11), b: twTime(r.coverage.to).slice(11), n: fmt(t.trades) }) : '';
    body.innerHTML = (r.demo || PREVIEW ? notice(esc(T('preview')), 'info') : '') + (t.trades
      ? `<div class="kv kv-4">${tile(T('mk.daily.trades'), fmt(t.trades))}${tile(T('mk.daily.coin'), esc(fmtWan(t.coin)))}${tile(T('mk.daily.crystal'), fmt(t.crystal))}${tile(T('mk.daily.items'), fmt(t.items))}</div>
        <div class="dl-block"><h3 class="dl-h">${esc(T('mk.daily.hot'))}</h3><ol class="dl-list dl-hot">${(r.hot || []).map(x => item(x, `<span class="dl-sub">${esc(T('mk.daily.hotSub', { n: x.count }))} ${medTxt(x.med)}</span>`)).join('')}</ol></div>
        <div class="grid g2 dl-moves">
          <div class="dl-block"><h3 class="dl-h dl-up">${esc(T('mk.daily.up'))}</h3>${r.up?.length ? `<ol class="dl-list">${r.up.map(move).join('')}</ol>` : `<p class="small muted dl-none">${esc(T('mk.daily.noMove'))}</p>`}</div>
          <div class="dl-block"><h3 class="dl-h dl-down">${esc(T('mk.daily.down'))}</h3>${r.down?.length ? `<ol class="dl-list">${r.down.map(move).join('')}</ol>` : `<p class="small muted dl-none">${esc(T('mk.daily.noMove'))}</p>`}</div>
        </div><div class="row dl-foot"><span class="small muted">${esc(cov)}</span>${tipHtml(T('mk.daily.note'))}</div>`
      : emptyState('adv-sit', T('mk.daily.empty'), T('mk.daily.emptyTip')));
  } catch {
    body.innerHTML = notice(esc(T('error')), 'bad', 'close');
  }
}

// ───────────────── 追蹤清單 ─────────────────
const getWatch = () => store.get(WATCH_KEY, []) || [];
const isWatched = n => getWatch().some(w => w.n === n);
function toggleWatch(n, kind) {
  let w = getWatch();
  if (w.some(x => x.n === n)) w = w.filter(x => x.n !== n);
  else {
    const rs = S.rows.filter(r => r.name === n);
    const minOf = c => { const a = rs.filter(r => r.c === c).map(r => r.p); return a.length ? Math.min(...a) : null; };
    w.unshift({ n, kn: rs.find(r => r.kn)?.kn || '', kind, coin: minOf(0), crystal: minOf(1), t: Date.now() });
    w = w.slice(0, 30);
  }
  store.set(WATCH_KEY, w);
  renderWatch();
}
function renderWatch() {
  const w = getWatch();
  const cnt = $('#tab-watch .count');
  cnt.hidden = !w.length; cnt.textContent = w.length;
  if (!w.length) { el.watch.innerHTML = emptyState('adv-sit', T('watchEmpty')); return; }
  el.watch.innerHTML = `<div class="row end" style="margin-bottom:10px"><button class="btn sm sky" type="button" data-watch-all><svg class="ic"><use href="#i-refresh"/></svg>${esc(T('watchRefresh'))}</button></div>
  <ul class="watch-list">${w.map(x => `<li class="watch-item"><a href="?q=${encodeURIComponent(x.n)}&exact=1" data-goto="${esc(x.n)}" data-exact="1">${esc(dn(x))}</a>
    <span class="watch-prices">${x.coin != null ? priceHtml(x.coin, 0, false) : ''}${x.crystal != null ? priceHtml(x.crystal, 1, false) : ''}${x.coin == null && x.crystal == null ? '<span class="muted">–</span>' : ''}</span>
    <span class="muted small">${esc(twTime(Math.floor(x.t / 1000)).slice(5))}</span>
    <button class="btn sm icon ghost" type="button" data-unwatch="${esc(x.n)}" aria-label="${esc(T('watchRemove'))}"><svg class="ic"><use href="#i-trash"/></svg></button></li>`).join('')}</ul>`;
}
async function refreshWatch(btn) {
  btn.disabled = true;
  const w = getWatch();
  for (let i = 0; i < w.length; i += BROWSE_MAX) {
    const chunk = w.slice(i, i + BROWSE_MAX);
    try {
      const b = await api('batch', { n: chunk.map(x => x.n) });
      for (const x of chunk) {
        const d = b.results?.[x.n] || b.results?.[normName(x.n)];
        if (!d) continue;
        const all = [...(d.items || []), ...(d.pets || [])].filter(r => stripBr(normName(r.n)) === stripBr(normName(x.n)));
        const minOf = c => { const a = all.filter(r => r.c === c).map(r => r.p); return a.length ? Math.min(...a) : null; };
        Object.assign(x, { coin: minOf(0), crystal: minOf(1), t: Date.now() });
      }
      store.set(WATCH_KEY, w);
      renderWatch();
    } catch { /* 單批失敗不影響其他 */ }
  }
  btn.disabled = false;
}

// ───────────────── 收藏與最近搜尋 ─────────────────
const getFavs = () => store.get(FAV_KEY, []) || [];
const favKey = () => normName(S.q || el.q.value.trim());
function syncFav() {
  const k = favKey();
  const on = !!k && getFavs().some(f => normName(f.q) === k);
  el.fav.setAttribute('aria-pressed', String(on));
  el.fav.title = T(on ? 'mk.favRemove' : 'mk.favAdd');
}
function toggleFav() {
  const q = el.q.value.trim();
  if (!q) { toast(T('mk.favNeedQ')); return; }
  let f = getFavs();
  if (f.some(x => normName(x.q) === normName(q))) { f = f.filter(x => normName(x.q) !== normName(q)); toast(T('mk.favRemoved')); }
  else { f.unshift({ q, kind: S.kind, exact: S.exact }); f = f.slice(0, 40); toast(T('mk.favAdded')); }
  store.set(FAV_KEY, f);
  renderChips(); syncFav();
}
function saveRecent(q) {
  store.set(RECENT_KEY, [q, ...(store.get(RECENT_KEY, []) || []).filter(x => x !== q)].slice(0, 8));
  renderChips();
}
function renderChips() {
  const f = getFavs(), r = store.get(RECENT_KEY, []) || [];
  $('#mk-favs').hidden = !f.length;
  $('#mk-favs .chips').innerHTML = f.map(x => `<span class="chip chip-x"><button type="button" data-fav-go="${esc(x.q)}" data-kind="${esc(x.kind || 'all')}" data-exact="${x.exact ? 1 : ''}">${esc(x.q)}</button><button type="button" class="x" data-fav-del="${esc(x.q)}" aria-label="${esc(T('common.remove'))}">×</button></span>`).join('');
  $('#mk-recent').hidden = !r.length;
  $('#mk-recent .chips').innerHTML = r.map(x => `<button type="button" class="chip" data-goto="${esc(x)}">${esc(x)}</button>`).join('');
}
let suggested = false;
el.q.addEventListener('focus', async () => {
  if (suggested) return;
  suggested = true;
  const c = S.cat || await loadCatalog();
  const names = new Set([...(store.get(RECENT_KEY, []) || []), ...getWatch().map(w => w.n), ...getFavs().map(f => f.q)]);
  c.pets.forEach(p => names.add(p.name));
  c.equip.forEach(e => names.add(e.n));
  $('#mk-suggest').innerHTML = [...names].slice(0, 1200).map(n => `<option value="${esc(n)}">`).join('');
}, { once: true });

// ───────────────── 清空 ─────────────────
function clearAll() {
  S.token++;                                        // 未完成的查詢不再填回結果
  Object.assign(S, DEFAULTS, { q: '', mode: 'query', browseNames: [], eqCat: '', eqLv: '', eqName: '', petList: 'dex', petRace: '', petTier: '', petQuick: '', petName: '', data: null, rows: [], hist: null, histName: '', trial: { price: '', c: 0 } });
  S.pf = { star: false, full: false, skill: false, slot: '', lv: new Set() };
  el.q.value = ''; $('#pet-quick').value = '';
  saveCfg(); writeUrl(); syncKindUi(); syncFilterUi();
  el.status.hidden = true; el.summary.hidden = true;
  $$('.mk-notes').forEach(n => n.remove());
  ['#tab-listing', '#tab-history'].forEach(s => ($(`${s} .count`).hidden = true));
  el.results.innerHTML = emptyState('adv-sit', T('mk.cleared'));
  el.hist.innerHTML = ''; el.pricing.innerHTML = '';
  setTab('listing');
  el.q.focus();
}

// ───────────────── 分頁 ─────────────────
function setTab(tab) {
  S.tab = tab;
  $$('#mk-tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  ['listing', 'history', 'pricing', 'watch'].forEach(t => ($('#pane-' + t).hidden = t !== tab));
  if (tab === 'watch') renderWatch();
}
let bulkReady = false, dataReady = false;
function setMain(t) {
  $$('#mk-main [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.main === t)));
  ['cmp', 'bulk', 'data'].forEach(k => ($('#main-' + k).hidden = k !== t));
  if (t === 'bulk' && !bulkReady) { bulkReady = true; initBulk(); }
  if (t === 'data') { if (!dataReady) { dataReady = true; initData(); } else initData(true); }
  const p = new URLSearchParams(location.search);
  if (t === 'cmp') p.delete('tab'); else p.set('tab', t);
  history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
}

// ───────────────── 事件 ─────────────────
el.form.addEventListener('submit', e => { e.preventDefault(); el.q.blur(); search(); });
el.q.addEventListener('input', debounce(syncFav, 150));
el.fav.addEventListener('click', toggleFav);
$('#mk-clear').addEventListener('click', clearAll);
el.kind.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  S.kind = b.value; S.cat = S.cat || await loadCatalog();
  syncKindUi(); saveCfg();
  if (el.q.value.trim()) search();
});
el.exact.addEventListener('change', () => { S.exact = el.exact.checked; saveCfg(); if (el.q.value.trim()) search(); });
$('#eq-cat').addEventListener('change', e => { S.eqCat = e.target.value; S.eqName = ''; fillEquipSelects(); });
$('#eq-lv').addEventListener('change', e => { S.eqLv = e.target.value; S.eqName = ''; fillEquipSelects(); });
$('#eq-name').addEventListener('change', e => { S.eqName = e.target.value; if (S.eqName) { el.q.value = S.eqName; S.exact = true; el.exact.checked = true; search(); } });
$('#pet-list').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.petList = b.value; fillPetSelects(); } });
$('#pet-race').addEventListener('change', e => { S.petRace = e.target.value; fillPetSelects(); if (S.mode === 'browse-pet' && S.data) { S.rows = flatten(S.data); render(); } });
$('#pet-tier').addEventListener('change', e => { S.petTier = e.target.value; fillPetSelects(); if (S.mode === 'browse-pet' && S.data) { S.rows = flatten(S.data); render(); } });
$('#pet-quick').addEventListener('input', debounce(e => { S.petQuick = e.target.value.trim(); fillPetSelects(); if (S.mode === 'browse-pet' && S.data) { S.rows = flatten(S.data); render(); } }, 150));
$('#pet-name').addEventListener('change', e => { S.petName = e.target.value; if (S.petName) { el.q.value = S.petName; S.exact = true; el.exact.checked = true; search(); } });
const onFilter = (fn, rerenderHist = false) => () => { fn(); saveCfg(); syncFilterUi(); render(); if (rerenderHist) { renderPricing(); } };
el.sv.addEventListener('click', e => { const b = e.target.closest('button'); if (b) onFilter(() => (S.sv = b.value))(); });
el.cur.addEventListener('click', e => { const b = e.target.closest('button'); if (b) onFilter(() => (S.cur = b.value))(); });
$('#mk-cur-quick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) onFilter(() => (S.cur = b.value))(); });
el.sort.addEventListener('change', onFilter(() => (S.sort = el.sort.value)));
el.view.addEventListener('change', onFilter(() => (S.view = el.view.value)));
el.need.addEventListener('input', debounce(onFilter(() => (S.need = Math.max(1, Math.floor(Number(el.need.value) || 1)))), 200));
el.range.addEventListener('change', () => { S.range = el.range.value; saveCfg(); syncFilterUi(); if (S.mode === 'query' && S.q) loadHistory(S.token); });
el.src.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.src = b.value; saveCfg(); syncFilterUi(); if (S.mode === 'query' && S.q) loadHistory(S.token); });
['star', 'full', 'skill'].forEach(k => $('#pf-' + k).addEventListener('change', onFilter(() => (S.pf[k] = $('#pf-' + k).checked))));
$('#pf-slot').addEventListener('change', onFilter(() => (S.pf.slot = $('#pf-slot').value)));
$('#pf-lv').addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (!b) return; const v = Number(b.dataset.lv); onFilter(() => (S.pf.lv.has(v) ? S.pf.lv.delete(v) : S.pf.lv.add(v)))(); });
$('#pf-lv-clear').addEventListener('click', onFilter(() => S.pf.lv.clear()));
$('#mk-tabs').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });
$('#mk-main').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) setMain(b.dataset.main); });
$('#daily-day').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; dailyDay = Number(b.value); seg($('#daily-day'), dailyDay); loadDaily(); });
document.addEventListener('change', e => {
  if (e.target.id === 'hist-name' || e.target.id === 'pr-name') { S.histName = e.target.value; renderHistory(); renderPricing(); if (S.data) renderSummary(filteredRows()); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'tr-price') { S.trial.price = e.target.value; renderTrial(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-copy],[data-expand],[data-watch],[data-unwatch],[data-goto],[data-retry],[data-refresh],[data-hist-more],[data-hist-fetch],[data-watch-all],[data-csv],[data-fav-go],[data-fav-del],#hist-cur button,#tr-cur button');
  if (!t || !t.closest('#main-cmp')) return;
  if (t.dataset.copy) copy(t.dataset.copy);
  else if (t.dataset.expand != null) { const n = t.dataset.expand; S.expanded.has(n) ? S.expanded.delete(n) : S.expanded.add(n); render(); }
  else if (t.dataset.watch != null) { toggleWatch(t.dataset.watch, t.dataset.kind); render(); toast(T(isWatched(t.dataset.watch) ? 'watchAdd' : 'watchRemove')); }
  else if (t.dataset.unwatch != null) { toggleWatch(t.dataset.unwatch); if (S.data) render(); }
  else if (t.dataset.goto != null) {
    e.preventDefault();
    el.q.value = t.dataset.goto;
    if (t.dataset.exact) { S.exact = true; }
    if (S.kind !== 'all' && S.mode !== 'query') { S.kind = 'all'; syncKindUi(); }
    search();
    $('#mk-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  else if (t.dataset.favGo != null) { el.q.value = t.dataset.favGo; S.kind = t.dataset.kind || 'all'; S.exact = !!t.dataset.exact; syncKindUi(); search(); }
  else if (t.dataset.favDel != null) { store.set(FAV_KEY, getFavs().filter(x => x.q !== t.dataset.favDel)); renderChips(); syncFav(); }
  else if (t.hasAttribute('data-retry')) search();
  else if (t.hasAttribute('data-refresh')) search(true);
  else if (t.hasAttribute('data-hist-more')) { S.histShow += 50; renderHistory(); }
  else if (t.hasAttribute('data-hist-fetch')) { S.histPages = Math.min(10, S.histPages + 3); loadHistory(S.token, true); }
  else if (t.hasAttribute('data-watch-all')) refreshWatch(t);
  else if (t.hasAttribute('data-csv')) {
    const L = [...histLogs()].sort((a, b) => a.t - b.t);
    downloadCsv(`starcg-${S.histName || 'trades'}.csv`, [[T('mk.csvHead.t'), T('mk.csvHead.n'), T('mk.csvHead.q'), T('mk.csvHead.p'), T('mk.csvHead.c')],
      ...L.map(l => [twTime(l.t), l.n, l.q, l.p, curName(l.c)])]);
  }
  else if (t.closest('#hist-cur')) { S.histCur = Number(t.value); renderHistory(); }
  else if (t.closest('#tr-cur')) { S.trial.c = Number(t.value); seg($('#tr-cur'), S.trial.c); renderTrial(); }
});
addEventListener('rates', () => render());
loadFx();

// 啟動
readUrl();
syncFilterUi();
renderChips();
renderWatch();
setTab('listing');
if (matchMedia('(min-width: 900px)').matches && document.documentElement.dataset.view !== 'mobile') $('#mk-adv').open = true;
loadCatalog().then(c => {
  S.cat = c;
  syncKindUi();
  if (S.q || (S.kind === 'equip' && (S.eqCat || S.eqLv)) || (S.kind === 'pet' && (S.petRace || S.petTier || S.petList === 'bounty') && new URLSearchParams(location.search).size)) search();
});
syncKindUi();
// 每日市場動態：捲到附近才載入
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); loadDaily(); } }, { rootMargin: '400px' }) : null;
if (io) io.observe($('#mk-daily')); else loadDaily();
