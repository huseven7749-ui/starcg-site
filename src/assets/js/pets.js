// 寵物圖鑑 + 成長模擬
import { $, $$, T, esc, fmt, store, copy, toast, loadPets, petImgSrc, normName, downloadCsv, debounce, clamp, emptyState, spriteImg, LANG, BASE } from './core.js';
import { track } from './game.js';
import { initCards, addCard } from './petcards.js';
import { simulate, petScore, maxStarAdd, tierOf, TIERS, REMODEL, STAT_KEYS, freePoints, RAND_TOTAL_MAX, DROP_TOTAL_MAX , remodelPoints, remodelLv, REMODEL_MAX } from './petcalc.js';

const CMP_KEY = 'sc.petcmp';
const TIER_KEY = { '金': 'gold', '銀': 'silver', '普': 'normal' };
const EL_KEYS = ['earth', 'water', 'fire', 'wind'];
const LV_ROWS = [1, 30, 60, 80, 90, 100, 110, 120, 140, 160];
let PETS = [];
const byName = new Map();
const zero = () => [0, 0, 0, 0, 0];
const S = {
  pet: null, base: [20, 20, 20, 20, 20], starAdd: zero(), drop: zero(), rand: [2, 2, 2, 2, 2], manual: zero(), extra: zero(),
  level: 1, tier: '', remodel: 0, slots: 6, fullSlot: false, maxStar: false,
};
const raceLabel = r => { const k = 'race.' + r; const v = T(k); return v === k ? r : v; };
// 取得方式：攻略網資料可能是字串、{text,url} 或兩者混合的陣列；統一成 [{text,url}]，去重、只留 http(s) 連結
function obtainList(o) {
  const seen = new Set();
  const textOf = x => x.text || x.name || x.title || x.label || x.desc || Object.values(x).find(v => typeof v === 'string' && !/^https?:\/\//.test(v)) || '';
  return (Array.isArray(o) ? o : [o]).map(x => typeof x === 'string' ? { text: x } : (x && typeof x === 'object') ? { text: textOf(x), url: x.url || x.href || '' } : { text: '' })
    .map(x => ({ text: koText(String(x.text).trim()), url: /^https?:\/\//.test(x.url || '') ? x.url : '' }))
    .filter(x => x.text && !seen.has(x.text) && seen.add(x.text));
}
// 韓文站：寵物名優先顯示遊戲韓文介面的名稱（data/pet-names-ko.json，imageId → 韓文），中文名縮小放旁邊
const nameHtml = (p, tag = 'b') => (LANG === 'ko' && p.kn)
  ? `<${tag}>${esc(p.kn)} <small class="muted" lang="zh-Hant">${esc(p.name)}</small></${tag}>`
  : `<${tag} lang="zh-Hant">${esc(p.name)}</${tag}>`;
// 韓文站：取得方式、皮膚名稱等攻略網中文資料的韓文對照（data/pet-obtain-ko.json，中文原句 → 韓文）
let OBTAIN_KO = {};
const koText = s => (LANG === 'ko' && OBTAIN_KO[s]) || s;
async function loadKoNames(list) {
  if (LANG !== 'ko') return;
  try {
    const [kn, ob] = await Promise.all([
      fetch(`${BASE}data/pet-names-ko.json`).then(r => r.ok ? r.json() : {}),
      fetch(`${BASE}data/pet-obtain-ko.json`).then(r => r.ok ? r.json() : {}),
    ]);
    OBTAIN_KO = ob || {};
    // 先用圖鑑圖號對，對不到再用中文名（伺服器資料的圖號偶爾和遊戲抄下來的不同）
    list.forEach(p => { const k = kn[p.imageId] || kn['n:' + p.name]; if (k) p.kn = k; });
  } catch { /* 沒有韓文名就只顯示中文 */ }
}
const tierBadge = tier => tier ? `<span class="badge b-${TIER_KEY[tier]}">${esc(T('card.' + TIER_KEY[tier]))}</span>` : '';
const els = p => `<span class="els">${EL_KEYS.filter(k => p[k]).map(k => `<span class="el"><svg class="ic"><use href="#i-el-${k}"/></svg>${fmt(p[k] / 10, 1)}</span>`).join('')}</span>`;

// ───────────────── 分頁 ─────────────────
function setTab(tab) {
  $$('#pet-tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  ['dex', 'sim', 'cmp', 'battle'].forEach(t => ($('#pane-' + t).hidden = t !== tab));
  if (tab === 'cmp') renderCmp();
}
$('#pet-tabs').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });

// ───────────────── 圖鑑 ─────────────────
const F = { q: $('#f-q'), race: $('#f-race'), tier: $('#f-tier'), el: $('#f-el'), sort: $('#f-sort') };
const PAGE = 48;
let dexList = [], dexShown = 0, dexObserver = null;
function cardHtml(p) {
  const max = 60;
  return `<button type="button" class="pet-card" data-name="${esc(p.name)}">
      <span class="spr">${p.imageId ? `<img src="${petImgSrc(p.imageId)}" data-pet="${p.imageId}" alt="${esc(p.name)}" width="84" height="84" loading="lazy" decoding="async">` : ''}</span>
      ${nameHtml(p)}
      <span class="row" style="gap:4px;justify-content:center">${tierBadge(tierOf(p.cardTier))}<span class="badge b-gray">${esc(raceLabel(p.race))}</span></span>
      <span class="bars">${p.bp.map((v, i) => `<span class="bar"><span>${esc(T('bp.' + i))}</span><i style="--w:${Math.min(100, (v / max) * 100).toFixed(1)}%"></i><span>${fmt(v, 2)}</span></span>`).join('')}</span>
      <span class="small muted">${esc(T('pet.totalN', { n: fmt(p.bp.reduce((a, b) => a + b, 0), 2) }))} · ${esc(T('pet.slot', { n: p.skillSlots }))}</span>
      ${els(p)}
    </button>`;
}
function showMoreDex() {
  const next = dexList.slice(dexShown, dexShown + PAGE);
  $('#dex').insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
  dexShown += next.length;
  $('#dex-more').hidden = dexShown >= dexList.length;
}
function renderDex() {
  const q = normName(F.q.value);
  const race = F.race.value, tier = F.tier.value, el = F.el.value, sort = F.sort.value;
  let list = PETS.filter(p => (!q || normName(p.name).includes(q) || (p.kn && normName(p.kn).includes(q)) || (p.skins || []).some(s => normName(s.name).includes(q)))
    && (!race || p.race === race) && (!tier || tierOf(p.cardTier) === tier) && (!el || p[el] > 0));
  const key = p => sort === 'total' ? p.bp.reduce((a, b) => a + b, 0) : sort === 'slots' ? p.skillSlots : sort === 'wash' ? p.washPrice : sort === 'id' ? -p.id : p.bp[Number(sort)];
  dexList = list.slice().sort((a, b) => (key(b) - key(a)) || a.id - b.id);
  dexShown = 0;
  $('#dex-info').textContent = T('pet.dexInfo', { n: dexList.length, all: PETS.length });
  $('#dex').innerHTML = dexList.length ? '' : emptyState('adv-look', T('noResult'));
  if (!$('#dex-more')) {
    $('#dex').insertAdjacentHTML('afterend', `<div class="more-wrap"><button class="btn" type="button" id="dex-more">${esc(T('loadMore'))}</button></div>`);
    $('#dex-more').addEventListener('click', showMoreDex);
    if ('IntersectionObserver' in window) {
      dexObserver = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !$('#pane-dex').hidden) showMoreDex(); }, { rootMargin: '600px' });
      dexObserver.observe($('#dex-more'));
    }
  }
  showMoreDex();
}
Object.values(F).forEach(x => x.addEventListener('input', debounce(renderDex, 120)));
$('#dex').addEventListener('click', e => {
  const c = e.target.closest('.pet-card');
  if (!c) return;
  selectPet(c.dataset.name);
  setTab('sim');
  scrollTo({ top: $('#pet-tabs').offsetTop - 70, behavior: 'smooth' });
});

// ───────────────── 模擬 ─────────────────
const tbody = $('#bp-table tbody');
function buildTable() {
  const opt = n => Array.from({ length: n + 1 }, (_, v) => `<option value="${v}">${v ? '-' + v : 0}</option>`).join('');
  const H = [...$$('#bp-table thead th')].map(th => esc(th.textContent.trim()));
  tbody.innerHTML = [0, 1, 2, 3, 4].map(i => `<tr data-i="${i}">
    <td class="bp-stat">${esc(T('bp.' + i))}</td>
    <td data-label="${H[1]}"><input class="input sm num" data-k="base" type="number" step="0.01" min="0" max="80" inputmode="decimal" aria-label="${H[1]}"></td>
    <td data-label="${H[2]}"><input class="input sm num" data-k="starAdd" type="number" step="0.01" min="0" max="25" inputmode="decimal" aria-label="${H[2]}"></td>
    <td data-label="${H[3]}"><select class="input sm" data-k="drop" aria-label="${H[3]}">${opt(4)}</select></td>
    <td data-label="${H[4]}"><input class="input sm num" data-k="rand" type="number" min="0" max="10" inputmode="numeric" aria-label="${H[4]}"></td>
    <td data-label="${H[5]}"><output data-o="real"></output></td>
    <td data-label="${H[6]}"><input class="input sm num" data-k="manual" type="number" min="0" inputmode="numeric" aria-label="${H[6]}"></td>
    <td data-label="${H[7]}"><input class="input sm num" data-k="extra" type="number" step="1" inputmode="numeric" aria-label="${H[7]}"></td>
    <td data-label="${H[8]}"><output data-o="bp"></output></td></tr>`).join('');
}
function fillInputs() {
  $$('tr', tbody).forEach(tr => {
    const i = Number(tr.dataset.i);
    for (const k of ['base', 'starAdd', 'drop', 'rand', 'manual', 'extra']) {
      const inp = $(`[data-k=${k}]`, tr);
      if (document.activeElement !== inp) inp.value = String(+(S[k][i] || 0).toFixed(2));
    }
  });
  $('#s-lv').value = S.level; $('#s-tier').value = S.tier; $('#s-rm').value = S.remodel; $('#s-slots').value = S.slots;
  $('#s-star').checked = S.maxStar; $('#s-full').checked = S.fullSlot;
}
function renderHead() {
  const p = S.pet;
  if (!p) { $('#sim-head').innerHTML = `<p class="muted small" style="grid-column:1/-1;margin:0">${esc(T('pet.custom'))}</p>`; return; }
  const skins = (p.skins || []).map(s => `<span class="badge b-lav" title="${esc(obtainList(s.obtainInfo).map(x => x.text).join(' / '))}"${koText(s.name) === s.name ? ' lang="zh-Hant"' : ''}>${esc(koText(s.name))}</span>`).join(' ');
  const obtain = obtainList(p.obtainInfo);
  $('#sim-head').innerHTML = `<span class="spr">${p.imageId ? `<img src="${petImgSrc(p.imageId)}" data-pet="${p.imageId}" alt="${esc(p.name)}" width="96" height="96">` : ''}</span>
    <div>${nameHtml(p, 'h2')}
      <div class="row" style="gap:6px">${tierBadge(tierOf(p.cardTier))}<span class="badge b-gray">${esc(raceLabel(p.race))}</span><span class="badge b-sky">${esc(T('pet.slot', { n: p.skillSlots }))}</span>${els(p)}</div>
      ${obtain.length ? `<p class="small muted" style="margin:6px 0 0"${LANG === 'ko' ? '' : ' lang="zh-Hant"'}>${obtain.map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : esc(x.text)).join(LANG === 'ko' ? ' · ' : '、')}</p>` : ''}
      ${skins ? `<p class="small" style="margin:6px 0 0">${skins}</p>` : ''}</div>`;
}
function selectPet(name) {
  const p = byName.get(normName(name));
  if (!p) return;
  track('pets.sim');
  Object.assign(S, {
    pet: p, base: [...p.bp], drop: zero(), rand: [2, 2, 2, 2, 2], manual: zero(), extra: zero(),
    tier: tierOf(p.cardTier), slots: clamp(p.skillSlots || 6, 6, 10), remodel: Math.min(S.remodel, REMODEL_MAX),
  });
  S.starAdd = S.maxStar ? maxStarAdd(p) : zero();
  $('#s-pet').value = p.name;
  renderHead(); fillInputs(); compute();
}
function compute() {
  const r = simulate({ base: S.base, starAdd: S.starAdd, drop: S.drop, rand: S.rand, level: S.level, tier: S.tier, remodel: S.remodel, manual: S.manual, extra: S.extra });
  S.manual = r.manual;
  // 表格輸出
  $$('tr', tbody).forEach(tr => {
    const i = Number(tr.dataset.i);
    $('[data-o=real]', tr).textContent = fmt(r.ranks[i], 2);
    $('[data-o=bp]', tr).textContent = fmt(r.bp[i], 2);
    const m = $('[data-k=manual]', tr);
    if (document.activeElement !== m && Number(m.value) !== r.manual[i]) m.value = r.manual[i];
    m.max = r.caps[i];
  });
  // 點數
  const t = TIERS[S.tier];
  const rmNeed = S.remodel ? remodelLv(S.remodel) : 0;
  const pb = $('#points');
  pb.classList.toggle('over', r.used > r.limit);
  pb.innerHTML = `<span>${esc(T('pet.points'))}</span><span class="num">${fmt(r.used)} / ${fmt(r.limit)}</span><span class="badge ${r.limit - r.used ? 'b-warn' : 'b-ok'}">${esc(T('pet.remain', { n: fmt(r.limit - r.used) }))}</span>
    <span class="small muted">${esc(T('pet.pointsFrom', { lv: Math.max(0, S.level - 1), rm: remodelPoints(S.tier, S.remodel) }))}</span>
    ${S.remodel && S.level < rmNeed ? `<span class="badge b-coral">${esc(T('pet.rmNeed', { n: S.remodel, lv: rmNeed }))}</span>` : ''}`;
  renderPointHint(r);
  // 警示
  const randSum = S.rand.reduce((a, b) => a + b, 0), dropSum = S.drop.reduce((a, b) => a + b, 0);
  const warns = [];
  if (randSum > RAND_TOTAL_MAX || S.rand.some(v => v > 10 || v < 0)) warns.push(T('pet.randWarn', { n: randSum }));
  if (dropSum > DROP_TOTAL_MAX) warns.push(T('pet.dropWarn', { n: dropSum }));
  $('#grade-warn').innerHTML = (warns.length ? `<span class="badge b-coral">${esc(warns.join('、'))}</span> ` : '') + `<span class="badge b-gray">${esc(T('pet.randSum', { n: randSum }))}</span>`;
  // 能力值
  const sc = petScore(r.stats, { level: S.level, slots: S.slots, tier: S.tier, fullSlot: S.fullSlot });
  // 能力值照遊戲畫面無條件捨去成整數（評分仍用未捨去的值計算）
  $('#result').innerHTML = STAT_KEYS.map(k => `<div class="stat-tile"><span>${esc(T('stat.' + k))}</span><b>${fmt(Math.floor(r.stats[k] + 1e-9))}</b></div>`).join('') +
    `<div class="stat-tile hl" style="grid-column:span 1"><span>${esc(T('pet.score'))}</span><b>${fmt(sc.total)}</b></div>`;
  $('#score-sub').textContent = T('pet.scoreParts', { b: fmt(sc.base), s: fmt(sc.skill), f: fmt(sc.full) });
  S.last = { ...r, score: sc.total };
  renderLvTable();
  saveState();
}
// ───── 爆點提示 ─────
// 規則：單項 BP 不能超過其他四項 BP 總和。某項到頂後再加也加不上去（點數會被吃掉），
// 這裡算出每一項「目前還能再加幾點」，有剩點又有能力值到頂時提示，並給一鍵加到其他能力值的按鈕。
function headroom(r) {
  const cur = r.bpGrow.map((b, i) => b + r.manual[i]);
  const tot = cur.reduce((a, b) => a + b, 0), rest = Math.max(0, r.limit - r.used);
  return cur.map(c => Math.max(0, Math.min(rest, Math.floor(tot - 2 * c + 1e-9))));
}
function renderPointHint(r) {
  const box = $('#point-hint'), rest = Math.max(0, r.limit - r.used), room = headroom(r);
  const capped = [0, 1, 2, 3, 4].filter(i => rest > 0 && r.manual[i] > 0 && room[i] === 0);
  $$('tr', tbody).forEach(tr => {
    const i = Number(tr.dataset.i), on = capped.includes(i), inp = $('[data-k=manual]', tr);
    tr.classList.toggle('at-cap', on); inp.classList.toggle('at-cap', on);
    inp.title = on ? T('pet.capTip', { n: r.manual[i] }) : '';
    const cell = $('td.bp-stat', tr);
    let note = $('.cap-note', cell);
    if (on) {
      if (!note) { note = document.createElement('a'); note.className = 'cap-note'; note.href = '#point-hint'; cell.append(note); }
      note.textContent = T('pet.capNote', { n: fmt(rest) });
    } else note?.remove();
  });
  $('#points').classList.toggle('warn', capped.length > 0);
  if (!capped.length) { box.hidden = true; box.innerHTML = ''; return; }
  const name = i => T('bp.' + i);
  const c = capped[0];
  const can = [0, 1, 2, 3, 4].filter(i => room[i] > 0);
  // 推薦：其他能力值每加 1 點，到頂那項上限就多 1 點 → 一半給別項、一半繼續加到頂那項（主屬性最高）
  const splits = can.map(p => ({ p, ...splitFor(r, c, p, rest) })).filter(x => x.b > 0);
  box.hidden = false;
  box.innerHTML = `<b><svg class="ic" aria-hidden="true"><use href="#i-info"/></svg> ${esc(T('pet.capTitle', { s: capped.map(name).join('、') }))}</b>
    <p>${esc(T('pet.capBody2', { s: name(c), n: fmt(rest) }))}</p>
    ${splits.length ? `<p class="small" style="margin-top:8px"><b>${esc(T('pet.capSplitHead', { s: name(c) }))}</b></p>
      <div class="chips">${splits.map(x => `<button class="btn sm primary" type="button" data-split="${x.p}" data-a="${x.a}" data-c="${c}" data-b="${x.b}">${esc(T('pet.capSplit', { p: name(x.p), a: x.a, s: name(c), b: x.b, max: x.top }))}</button>`).join('')}</div>` : ''}
    ${can.length ? `<p class="small" style="margin-top:8px">${esc(T('pet.capAllHead'))}</p><div class="chips">${can.map(i => `<button class="btn sm" type="button" data-add="${i}" data-n="${room[i]}">${esc(T('pet.capAdd', { s: name(i), n: room[i] }))}</button>`).join('')}</div>`
      : `<p class="small">${esc(T('pet.capNone'))}</p>`}`;
}
// 剩餘 rest 點：a 點給 p、其餘給到頂的 c，找讓 c 加最多又不爆點的分法
function splitFor(r, c, p, rest) {
  const ok = m => {
    const cur = r.bpGrow.map((b, i) => b + m[i]), tot = cur.reduce((x, y) => x + y, 0);
    return cur.every(v => v <= tot - v + 1e-6);
  };
  for (let a = 0; a <= rest; a++) {
    const m = [...r.manual]; m[p] += a; m[c] += rest - a;
    if (ok(m)) return { a, b: rest - a, top: m[c] };
  }
  return { a: rest, b: 0, top: r.manual[c] };
}
$('#point-hint').addEventListener('click', e => {
  const s = e.target.closest('[data-split]');
  if (s) {
    S.manual[Number(s.dataset.split)] += Number(s.dataset.a);
    S.manual[Number(s.dataset.c)] += Number(s.dataset.b);
    compute(); fillInputs(); return;
  }
  const b = e.target.closest('[data-add]');
  if (!b) return;
  S.manual[Number(b.dataset.add)] += Number(b.dataset.n);
  compute(); fillInputs();
});

function allocFor(limit, strategy, ratio) {
  if (strategy === 'none' || limit <= 0) return zero();
  if (strategy !== 'ratio') { const a = zero(); a[Number(strategy)] = limit; return a; }
  const tot = ratio.reduce((a, b) => a + b, 0);
  if (!tot) return zero();
  const a = ratio.map(v => Math.floor((limit * v) / tot));
  let rest = limit - a.reduce((x, y) => x + y, 0);
  const order = ratio.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
  for (let k = 0; rest > 0; k = (k + 1) % 5, rest--) a[order[k][1]]++;
  return a;
}
function renderLvTable() {
  const strategy = $('#lv-strategy').value;
  const ratio = S.manual.some(v => v) ? S.manual : zero();
  const rows = LV_ROWS.map(L => {
    const rmAt = Math.min(S.remodel, Array.from({ length: REMODEL_MAX }, (_, i) => i + 1).filter(n => remodelLv(n) <= L).length);
    const limit = freePoints(L, S.tier, rmAt);
    const r = simulate({ base: S.base, starAdd: S.starAdd, drop: S.drop, rand: S.rand, level: L, tier: S.tier, remodel: rmAt, manual: allocFor(limit, strategy, ratio), extra: S.extra });
    const sc = petScore(r.stats, { level: L, slots: S.slots, tier: S.tier, fullSlot: S.fullSlot });
    const nf = document.documentElement.dataset.view === 'mobile' ? v => String(Math.floor(v + 1e-9)) : v => fmt(Math.floor(v + 1e-9), 0); // 照遊戲捨去成整數；手機版不加千分位，避免表格超出
    return `<tr${L === S.level ? ' style="background:var(--mint-l)"' : ''}><td class="num"><b>${L}</b></td>${STAT_KEYS.map(k => `<td class="num">${nf(r.stats[k])}</td>`).join('')}<td class="num"><b>${nf(sc.total)}</b></td></tr>`;
  });
  $('#lv-table').innerHTML = `<thead><tr><th>Lv</th>${STAT_KEYS.map(k => `<th class="num">${esc(T('stat.' + k))}</th>`).join('')}<th class="num">${esc(T('pet.score'))}</th></tr></thead><tbody>${rows.join('')}</tbody>`;
}
$('#lv-strategy').addEventListener('change', renderLvTable);
tbody.addEventListener('input', e => {
  const inp = e.target.closest('[data-k]');
  if (!inp) return;
  const i = Number(inp.closest('tr').dataset.i), k = inp.dataset.k;
  let v = Number(inp.value) || 0;
  if (k === 'drop') v = clamp(Math.floor(v), 0, 4);
  if (k === 'rand') v = clamp(Math.floor(v), 0, 10);
  if (k === 'manual') v = Math.max(0, Math.floor(v));
  S[k][i] = v;
  compute();
});
tbody.addEventListener('change', e => { if (e.target.dataset.k === 'manual') fillInputs(); });
$('#s-lv').addEventListener('input', e => { S.level = clamp(Math.floor(Number(e.target.value) || 1), 1, 200); compute(); });
$('#s-tier').addEventListener('change', e => { S.tier = e.target.value; if (S.maxStar && S.pet) S.starAdd = maxStarAdd({ ...S.pet, cardTier: S.tier }); fillInputs(); compute(); });
$('#s-rm').addEventListener('change', e => { S.remodel = Number(e.target.value); compute(); });
$('#s-slots').addEventListener('change', e => { S.slots = Number(e.target.value); compute(); });
$('#s-full').addEventListener('change', e => { S.fullSlot = e.target.checked; compute(); });
$('#s-star').addEventListener('change', e => {
  S.maxStar = e.target.checked;
  S.starAdd = S.maxStar ? maxStarAdd({ bp: S.base, cardTier: S.tier }) : zero();
  fillInputs(); compute();
});
$('#s-pet').addEventListener('change', e => selectPet(e.target.value));
$('#quick-fill').addEventListener('click', e => {
  const b = e.target.closest('[data-fill]');
  if (!b) return;
  if (b.dataset.fill === 'clear') S.manual = zero();
  else { S.manual = zero(); S.manual[Number(b.dataset.fill)] = 99999; }
  compute(); fillInputs();
});

// ───── 分享與保存 ─────
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '');
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s))));
const stateObj = () => ({ p: S.pet?.name || '', b: S.base, sa: S.starAdd, d: S.drop, r: S.rand, m: S.manual, e: S.extra, l: S.level, t: S.tier, rm: S.remodel, sl: S.slots, f: S.fullSlot ? 1 : 0, ms: S.maxStar ? 1 : 0 });
function applyState(o) {
  const p = o.p ? byName.get(normName(o.p)) : null;
  Object.assign(S, { pet: p || null, base: o.b || S.base, starAdd: o.sa || zero(), drop: o.d || zero(), rand: o.r || S.rand, manual: o.m || zero(), extra: o.e || zero(),
    level: o.l || 1, tier: o.t ?? '', remodel: o.rm || 0, slots: o.sl || 6, fullSlot: !!o.f, maxStar: !!o.ms });
  if (p) $('#s-pet').value = p.name;
}
const saveState = debounce(() => store.set('sc.petsim', stateObj()), 400);
$('#share').addEventListener('click', () => {
  const u = new URL(location.href);
  u.search = '';
  if (S.pet) u.searchParams.set('pet', S.pet.name);
  u.searchParams.set('s', enc(stateObj()));
  copy(u.toString());
});

// ───── 比較清單 ─────
const getCmp = () => store.get(CMP_KEY, []) || [];
$('#add-card').addEventListener('click', () => { if (S.pet) addCard(S.pet.name); else toast(T('pc.notFound')); });
$('#add-cmp').addEventListener('click', () => {
  const l = S.last;
  if (!l) return;
  const c = getCmp();
  c.unshift({ name: S.pet?.name || T('pet.customName'), lv: S.level, tier: S.tier, rm: S.remodel, rand: [...S.rand], drop: [...S.drop], manual: [...S.manual], stats: l.stats, score: l.score, t: Date.now() });
  store.set(CMP_KEY, c.slice(0, 50));
  updateCmpCount();
  toast(T('saved'));
});
let cmpSort = null;
function renderCmp() {
  let c = getCmp();
  if (cmpSort) c = [...c].sort((a, b) => (cmpSort === 'score' ? b.score - a.score : b.stats[cmpSort] - a.stats[cmpSort]));
  const L = k => esc(T(k));
  if (!c.length) { $('#cmp-table').innerHTML = `<tbody><tr><td><div class="empty">${spriteImg('adv-sit')}<b>${L('pet.cmpEmpty')}</b></div></td></tr></tbody>`; return; }
  $('#cmp-table').innerHTML = `<thead><tr><th>${L('pet.name')}</th><th class="num">Lv</th><th class="num">${L('pet.remodel')}</th>${STAT_KEYS.map(k => `<th class="num"><button type="button" data-sort="${k}">${L('stat.' + k)}</button></th>`).join('')}<th class="num"><button type="button" data-sort="score">${L('pet.score')}</button></th><th>${L('pet.col.manual')}</th><th></th></tr></thead>
  <tbody>${c.map((x, i) => `<tr><td data-label="${L('pet.name')}" lang="zh-Hant"><b>${esc(x.name)}</b> ${tierBadge(x.tier)}</td><td class="num" data-label="Lv">${x.lv}</td><td class="num" data-label="${L('pet.remodel')}">${x.rm}</td>
    ${STAT_KEYS.map(k => `<td class="num" data-label="${L('stat.' + k)}">${fmt(x.stats[k], 0)}</td>`).join('')}
    <td class="num" data-label="${L('pet.score')}"><b>${fmt(x.score)}</b></td><td class="small" data-label="${L('pet.col.manual')}">${x.manual.map((v, j) => (v ? `${esc(T('bp.' + j))}${v}` : '')).filter(Boolean).join(' ') || '–'}</td>
    <td><button class="btn sm icon ghost" type="button" data-del="${x.t}" aria-label="${L('common.remove')}"><svg class="ic"><use href="#i-trash"/></svg></button></td></tr>`).join('')}</tbody>`;
}
function updateCmpCount() { const n = getCmp().length; const el = $('#cmp-count'); el.hidden = !n; el.textContent = n; }
$('#cmp-table').addEventListener('click', e => {
  const s = e.target.closest('[data-sort]');
  if (s) { cmpSort = s.dataset.sort; renderCmp(); return; }
  const d = e.target.closest('[data-del]');
  if (d) { store.set(CMP_KEY, getCmp().filter(x => String(x.t) !== d.dataset.del)); updateCmpCount(); renderCmp(); }
});
$('#cmp-clear').addEventListener('click', () => { store.set(CMP_KEY, []); updateCmpCount(); renderCmp(); });
$('#cmp-csv').addEventListener('click', () => downloadCsv('starcg-pets.csv', [
  [T('pet.name'), 'Lv', T('pet.remodel'), ...STAT_KEYS.map(k => T('stat.' + k)), T('pet.score')],
  ...getCmp().map(x => [x.name, x.lv, x.rm, ...STAT_KEYS.map(k => x.stats[k]), x.score]),
]));

// ───────────────── 啟動 ─────────────────
buildTable();
updateCmpCount();
loadPets().then(async list => {
  await loadKoNames(list);
  PETS = list;
  list.forEach(p => { byName.set(normName(p.name), p); if (p.kn) byName.set(normName(p.kn), p); });
  const races = [...new Set(list.map(p => p.race).filter(Boolean))].sort();
  F.race.insertAdjacentHTML('beforeend', races.map(r => `<option value="${esc(r)}">${esc(raceLabel(r))}</option>`).join(''));
  $('#pet-names').innerHTML = list.map(p => `<option value="${esc(p.kn || p.name)}">`).join('');
  $('#dex-count').hidden = false; $('#dex-count').textContent = list.length;
  renderDex();
  initCards({ pets: list, map: byName, setTab });
  const params = new URLSearchParams(location.search);
  let restored = false;
  try {
    if (params.get('s')) { applyState(dec(params.get('s'))); restored = true; }
    else if (params.get('pet')) { selectPet(params.get('pet')); restored = true; }
    else { const saved = store.get('sc.petsim'); if (saved) applyState(saved); }
  } catch { /* 壞掉的分享連結就忽略 */ }
  if (!S.pet && !restored && !store.get('sc.petsim')) selectPet(list.find(p => tierOf(p.cardTier) === '金')?.name || list[0].name);
  renderHead(); fillInputs(); compute();
  if (restored) setTab('sim');
}).catch(() => { $('#dex-info').textContent = T('error'); });
