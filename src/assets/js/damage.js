// 傷害計算機（站內版）
import { $, $$, T, esc, fmt, store, debounce } from './core.js';
import { physical, magic, CRYSTAL, RACE, SKILLS, DEF_DOWN, DEF_SOFT, RACES, RACE_BEATS, elementMult, raceRelation, MAGIC_BASE } from './dmgcalc.js';
import { track } from './game.js';
import { SPRITES } from './dummysprites.js';
import { sfx, sfxOn, setSfx } from './sfx.js';

const KEY = 'sc.damage';
const CRY = Object.fromEntries(CRYSTAL), RAC = Object.fromEntries(RACE);
const num = id => Number(document.getElementById(id).value) || 0;
const val = id => document.getElementById(id).value;
const chk = id => document.getElementById(id).checked;
const EL = pre => [0, 1, 2, 3].map(i => `${pre}${i}`);
const IDS = ['p-atk', 'p-alv', 'p-weapon', 'p-skill', 'p-atkup', 'p-hits', 'p-arace', ...EL('p-ae'), 'p-def', 'p-dlv', 'p-defcls', 'p-drace', 'p-race', 'p-defskill', 'p-deflv', ...EL('p-de'),
  'p-pet', 'p-tier', 'p-rm', 'p-full', 'p-beast',
  'sk-type', 'sk-lv', 'sk-hit', 'm-type', 'm-lv', 'm-spirit', 'm-target', 'm-staff', 'm-insight', 'm-crystal', 'm-race', 'm-pve', 'm-pet', 'm-tier', 'm-rm', 'm-full', 'm-beast'];
let caster = 'char', tab = 'phys';
let lastPhys = null;

const range = r => `<span class="num">${fmt(r.min)}～${fmt(r.max)}</span><br><b class="num">${fmt(r.avg)}</b>`;
const tile = (label, body, sub = '') => `<div class="stat-tile"><span>${esc(label)}</span><b>${body}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
const pct = x => fmt(x * 100, 1) + '%';

// ───── 物理 ─────
const elems = pre => EL(pre).map(id => Math.max(0, Math.min(12, num(id))));
const elemMul = () => elementMult(elems('p-ae'), elems('p-de'));
function renderPhys() {
  const pet = chk('p-pet') ? { tier: val('p-tier'), full: chk('p-full'), remodel: num('p-rm'), beast: chk('p-beast') } : null;
  $('#p-petbox').classList.toggle('is-off', !pet); $$('#p-petbox input, #p-petbox select').forEach(x => { x.disabled = !pet; });
  const ds = val('p-defskill');
  $('#p-deflv').disabled = !ds;
  const em = elemMul();
  const hits = Math.max(1, Math.floor(num('p-hits')) || 1);
  const r = physical({
    atk: num('p-atk'), def: num('p-def'), atkLv: num('p-alv'), defLv: num('p-dlv'),
    weapon: val('p-weapon') === 'weapon' ? 0.15 : 0, crystal: em - 1, race: RAC[val('p-race')],
    skill: num('p-skill') / 100, atkUp: num('p-atkup') / 100, defDown: ds ? DEF_DOWN[ds](Number(val('p-deflv')) || 1) / 100 : 0, defSoft: DEF_SOFT[val('p-defcls')], hits, pet,
  });
  lastPhys = r;
  const rel = val('p-race');
  $('#p-kv').innerHTML = tile(T('dmg.atkE'), fmt(r.atkE, 1)) + (num('p-atkup') > 0 ? tile(T('dmg.atkEPlain'), fmt(r.plain.atkE, 1)) : '') + tile(T('dmg.defE'), fmt(r.defE, 1)) + tile(T('dmg.base'), fmt(r.base, 1)) + tile(T('dmg.critAdd'), '+' + fmt(r.crit, 1)) +
    tile(T('dmg.elemMul'), '×' + fmt(em, 3)) + tile(T('dmg.raceRel'), esc(T('dmg.r.' + rel)));
  const cols = ['normal', 'crit', 'boss', 'bossCrit'];
  const row = (label, data) => `<tr><th scope="row">${esc(label)}</th>${cols.map(c => `<td class="num" data-label="${esc(T('dmg.col.' + c))}">${range(data[c])}</td>`).join('')}</tr>`;
  const times = d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { min: v.min * hits, avg: v.avg * hits, max: v.max * hits }]));
  $('#p-table').innerHTML = `<thead><tr><th></th>${cols.map(c => `<th class="num">${esc(T('dmg.col.' + c))}</th>`).join('')}</tr></thead>
    <tbody>${row(T('dmg.row.attack'), r.attack)}${row(T(num('p-atkup') > 0 ? 'dmg.row.skillUp' : 'dmg.row.skill', { p: fmt(num('p-skill')), u: fmt(num('p-atkup')) }), r.skill)}${hits > 1 ? row(T('dmg.row.skillHits', { p: fmt(num('p-skill')), n: hits }), times(r.skill)) : ''}</tbody>`;
}

// 種族：兩邊都選了就自動判斷剋制關係
function autoRace() {
  const rel = raceRelation(val('p-arace'), val('p-drace'));
  if (rel) $('#p-race').value = rel;
}
// 種族相剋表（速查區，靜態）
function renderRef() {
  const rc = id => esc(T('dmg.rc.' + id));
  $('#race-chart').innerHTML = `<thead><tr><th>${esc(T('dmg.rc.col.race'))}</th><th>${esc(T('dmg.rc.col.full'))}</th><th>${esc(T('dmg.rc.col.half'))}</th></tr></thead><tbody>` +
    RACES.filter(r => RACE_BEATS[r]).map(r => `<tr><th scope="row">${rc(r)}</th><td>${rc(RACE_BEATS[r][0])}</td><td>${rc(RACE_BEATS[r][1])}</td></tr>`).join('') +
    `<tr><th scope="row">${rc('evil')}</th><td colspan="2">${esc(T('dmg.evil'))}</td></tr></tbody>`;
}

// 技能快速帶入
function fillSkillLv() {
  const type = val('sk-type'), sk = SKILLS[type];
  const lv = $('#sk-lv'), hit = $('#sk-hit');
  lv.hidden = type === 'attack';
  const tiers = !!sk?.tiers;
  const maxLv = tiers ? sk.tiers.length : sk?.mult && sk.mult.length < 11 ? sk.mult.length : 11;
  const cur = Number(lv.value) || (tiers ? 5 : maxLv);
  lv.innerHTML = tiers ? sk.tiers.map((_, i) => `<option value="${i + 1}">${esc(T('dmg.sk.tier', { n: i + 1 }))}</option>`).join('')
    : Array.from({ length: maxLv }, (_, i) => `<option value="${i + 1}">Lv${i + 1}</option>`).join('');
  lv.value = String(Math.min(maxLv, cur));
  // 第二個選單：迴旋＝第幾刀、穿刺＝前排／後排
  const curLv = Number(lv.value) || 11;
  const opts = sk?.stages ? [1, 2, 3].map(n => [n, T('dmg.sk.hit', { n })]) : sk?.rows ? [['front', T('dmg.sk.front')], ['back', T('dmg.sk.back')]]
    : sk?.shots ? sk.shots[curLv - 1].map((_, i) => [i + 1, T('dmg.sk.shot', { n: i + 1 })])                         // 氣功彈：第幾發
    : sk?.rep ? sk.rep.map((_, i) => [i + 1, T('dmg.sk.arrow', { n: i + 1 === sk.rep.length ? `${i + 1}+` : i + 1 })]) : null;   // 亂射：同對象第幾箭
  hit.hidden = !opts;
  if (opts) { const h = hit.value; hit.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''); hit.value = [...hit.options].some(o => o.value === h) ? h : opts[0][0]; }
}
function applySkill() {
  const type = val('sk-type'), sk = SKILLS[type], lv = Number(val('sk-lv')) || 1;
  let p = 100, up = 0, hits = 1;
  const notes = [];
  if (sk?.mult) p = sk.mult[lv - 1];
  else if (sk?.tiers) { p = sk.tiers[lv - 1]; if (sk.tierUp) { up = sk.tierUp[lv - 1]; notes.push(T('dmg.note.atkUp')); } if (sk.tierHits) notes.push(T('dmg.note.petHits', { p, n: sk.tierHits[lv - 1] })); }
  else if (sk?.shots) { const n = Math.min(Number(val('sk-hit')) || 1, sk.shots[lv - 1].length); p = sk.shots[lv - 1][n - 1]; notes.push(T('dmg.note.shots', { n: sk.count[lv - 1] })); }
  else if (sk?.rep) { p = sk.rep[Math.min(Number(val('sk-hit')) || 1, sk.rep.length) - 1]; notes.push(T('dmg.note.arrows', { n: sk.arrows[lv - 1] })); }
  else if (sk?.chance) { p = Math.round(SKILLS.qiankun.mult[lv - 1] * sk.sec[lv - 1] / 100); notes.push(T('dmg.note.chain', { c: sk.chance[lv - 1], s: sk.sec[lv - 1], m: SKILLS.qiankun.mult[lv - 1] })); }
  else if (sk?.stages) p = sk.stages[lv][(Number(val('sk-hit')) || 1) - 1];
  else if (sk?.rows) p = sk.rows[val('sk-hit') === 'back' ? 'back' : 'front'][lv - 1];
  else if (sk?.per) { p = sk.per[lv - 1]; hits = sk.hits[lv - 1]; notes.push(T('dmg.note.hits', { p, n: sk.hitsMin && sk.hitsMin[lv - 1] !== hits ? `${sk.hitsMin[lv - 1]}～${hits}` : hits })); }
  if (sk?.atkUp) { up = sk.atkUp[lv - 1]; notes.push(T('dmg.note.atkUp')); }
  if (p == null) { p = 100; notes.push(T('dmg.note.noData')); }
  if (sk?.acc) notes.push(T('dmg.note.acc', { n: sk.acc[lv - 1] }));
  if (sk?.targets) notes.push(T('dmg.note.targets', { n: sk.targets[lv - 1], c: sk.crit[lv - 1] }));
  if (sk?.shape) notes.push(T('dmg.note.shape' + sk.shape(lv)));
  if (sk?.note) notes.push(T('dmg.note.' + sk.note));
  if (type !== 'attack') notes.push(T('dmg.note.src'));
  $('#p-skill').value = p; $('#p-atkup').value = up; $('#p-hits').value = hits;
  const n = $('#sk-note'); n.hidden = !notes.length; n.textContent = notes.join(' ');
  renderPhys(); save();
}

// ───── 魔法 ─────
function fillMagicLv() {
  const sel = $('#m-lv'), cur = sel.value || '10';
  const max = caster === 'pet' ? 10 : 11;
  sel.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">Lv${i + 1}</option>`).join('') + (caster === 'pet' ? '<option value="ex">EX</option>' : '');
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '10';
  const types = Object.keys(MAGIC_BASE[caster]);
  $$('#m-type option').forEach(o => (o.hidden = !types.includes(o.value)));
  if (!types.includes(val('m-type'))) $('#m-type').value = 'single';
  $('#m-staff-wrap').hidden = caster === 'pet';
  $('#m-pve-wrap').hidden = caster !== 'pet';
  $('#m-petcard').hidden = caster !== 'pet';
  $$('#m-caster button').forEach(b => b.setAttribute('aria-pressed', String(b.value === caster)));
}
function renderMagic() {
  const pet = caster === 'pet' && chk('m-pet') ? { tier: val('m-tier'), full: chk('m-full'), remodel: num('m-rm'), beast: chk('m-beast') } : null;
  $('#m-petbox').classList.toggle('is-off', !pet); $$('#m-petbox input, #m-petbox select').forEach(x => { x.disabled = !pet; });
  const r = magic({
    caster: caster === 'pet' ? 'pet' : 'char', type: val('m-type'), level: val('m-lv') === 'ex' ? 'ex' : Number(val('m-lv')),
    spirit: num('m-spirit'), targetSpirit: num('m-target'), matk: num('m-staff'), crystal: CRY[val('m-crystal')], race: RAC[val('m-race')],
    insight: num('m-insight'), pve: chk('m-pve'), pet,
  });
  $('#m-kv').innerHTML = tile(T('dmg.mBase'), fmt(r.base)) + tile(T('dmg.mNeed'), fmt(r.need)) + tile(T('dmg.mSpiritRate'), pct(r.spiritRate)) +
    tile(T('dmg.mGap'), pct(r.gapRate)) + (caster === 'pet' ? '' : tile(T('dmg.mStaffRate'), pct(r.staff)));
  const sc = ['field', 'pk', 'boss'];
  $('#m-table').innerHTML = `<thead><tr>${sc.map(c => `<th class="num">${esc(T('dmg.sc.' + c))}</th>`).join('')}</tr></thead><tbody><tr>${sc.map(c => `<td class="num" data-label="${esc(T('dmg.sc.' + c))}">${range(r[c])}</td>`).join('')}</tr></tbody>`;
}

// ───── 狀態 ─────
const save = debounce(() => {
  const s = { caster, tab };
  for (const id of IDS) { const el = document.getElementById(id); s[id] = el.type === 'checkbox' ? el.checked : el.value; }
  store.set(KEY, s);
}, 300);
function load() {
  const s = store.get(KEY) || {};
  caster = s.caster === 'pet' ? 'pet' : 'char';
  fillSkillLv(); fillMagicLv();
  for (const id of IDS) {
    if (s[id] == null) continue;
    const el = document.getElementById(id);
    if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id];
  }
  fillSkillLv(); fillMagicLv();
  if (s.tab === 'magic') setTab('magic');
}
function setTab(t) {
  tab = t;
  $$('#dmg-tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('#pane-phys').hidden = t !== 'phys';
  $('#pane-magic').hidden = t !== 'magic';
}

$('#dmg-tabs').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) { setTab(b.dataset.tab); save(); } });
$('#pane-phys').addEventListener('input', e => {
  if (e.target.closest('#sk-type')) { fillSkillLv(); applySkill(); return; }
  if (e.target.closest('#sk-lv, #sk-hit')) { applySkill(); return; }
  if (e.target.closest('#p-arace, #p-drace')) autoRace();
  renderPhys(); save();
});
$('#m-caster').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { caster = b.value; fillMagicLv(); renderMagic(); save(); } });
$('#pane-magic').addEventListener('input', () => { renderMagic(); save(); });

load();
renderPhys();
renderMagic();
renderRef();

// ───── 屬性相剋計算器：多個攻擊方 × 多個防禦方，算屬性差距的增減傷 ─────
const EC_KEY = 'sc.elemCalc', EC_MAX = 6, EK = ['earth', 'water', 'fire', 'wind'];
const ecLoad = () => { const s = store.get(EC_KEY); return s && Array.isArray(s.atk) && Array.isArray(s.def) && s.atk.length && s.def.length ? s : { atk: [[0, 0, 0, 0], [10, 0, 0, 0]], def: [[0, 0, 0, 0], [0, 0, 10, 0], [0, 10, 0, 0]] }; };
const EC = ecLoad();
const ecLabel = v => v.some(x => x > 0) ? v.map((x, i) => (x > 0 ? T('dmg.e.' + EK[i]) + x : '')).filter(Boolean).join(' ') : T('dmg.ec.none');
function ecRow(side, v, i) {
  const sum = v.reduce((a, b) => a + b, 0);
  return `<li data-side="${side}" data-i="${i}"><span class="ec-no">${side === 'atk' ? 'A' : 'D'}${i + 1}</span>` +
    v.map((x, k) => `<label class="elem-in e${k}"><span>${esc(T('dmg.e.' + EK[k]))}</span><input class="input sm" type="number" min="0" max="10" value="${x}" inputmode="numeric" data-k="${k}"></label>`).join('') +
    (EC[side].length > 1 ? `<button type="button" class="btn sm icon ghost" data-del aria-label="${esc(T('common.remove'))}"><svg class="ic"><use href="#i-trash"/></svg></button>` : '<span></span>') +
    (sum > 10 ? `<small class="ec-warn">${esc(T('dmg.ec.over'))}</small>` : '') + '</li>';
}
function renderEC() {
  $('#ec-atk').innerHTML = EC.atk.map((v, i) => ecRow('atk', v, i)).join('');
  $('#ec-def').innerHTML = EC.def.map((v, i) => ecRow('def', v, i)).join('');
  $('#ec-add-atk').hidden = EC.atk.length >= EC_MAX; $('#ec-add-def').hidden = EC.def.length >= EC_MAX;
  renderECTable();
}
function renderECTable() {
  $('#ec-tbl').innerHTML = `<thead><tr><th>${esc(T('dmg.ec.corner'))}</th>${EC.def.map((d, j) => `<th class="num">D${j + 1}<br><small>${esc(ecLabel(d))}</small></th>`).join('')}</tr></thead><tbody>` +
    EC.atk.map((a, i) => `<tr><th scope="row">A${i + 1} <small>${esc(ecLabel(a))}</small></th>${EC.def.map(d => {
      const p = elementMult(a, d) * 100, cls = p > 100.05 ? 'ec-up' : p < 99.95 ? 'ec-down' : '';
      return `<td class="num ${cls}"><b>${fmt(p, 1)}%</b></td>`;
    }).join('')}</tr>`).join('') + '</tbody>';
}
const ecSave = () => store.set(EC_KEY, EC);
$('.ec').addEventListener('input', e => {
  const inp = e.target.closest('input[data-k]'); if (!inp) return;
  const li = inp.closest('li'), side = li.dataset.side, i = +li.dataset.i, k = +inp.dataset.k;
  EC[side][i][k] = Math.max(0, Math.min(10, Math.round(Number(inp.value) || 0)));
  const sum = EC[side][i].reduce((a, b) => a + b, 0), warn = li.querySelector('.ec-warn');
  if (sum > 10 && !warn) li.insertAdjacentHTML('beforeend', `<small class="ec-warn">${esc(T('dmg.ec.over'))}</small>`);
  else if (sum <= 10 && warn) warn.remove();
  renderECTable(); ecSave();
});
$('.ec').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'ec-add-atk' || b.id === 'ec-add-def') { const side = b.id.slice(7); if (EC[side].length < EC_MAX) EC[side].push([0, 0, 0, 0]); }
  else if (b.hasAttribute('data-del')) { const li = b.closest('li'); EC[li.dataset.side].splice(+li.dataset.i, 1); }
  else return;
  renderEC(); ecSave();
});
renderEC();

// ───── 痛打 GM01：選一個角色出手，在算出的範圍內隨機傷害，看實際分布；GM01 會反擊 ─────
const DM = { hits: 0, total: 0, max: 0, crits: 0, streak: 0, recent: [], hp: 1, pool: 1, countered: 0, myHp: 1, myPool: 1 };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FKEY = 'sc.dmFighter';
let dmBusy = false;
function dmRange(crit) {
  if (!lastPhys) return null;
  const set = lastPhys[val('dm-mode') === 'skill' ? 'skill' : 'attack'];
  const boss = chk('dm-boss');
  return set[boss ? (crit ? 'bossCrit' : 'boss') : (crit ? 'crit' : 'normal')];
}

// ── 舞台：一張 canvas 畫兩個角色（遊戲原圖的圖集，依腳底原點對齊）──
const stage = $('#dm-stage'), cv = $('#dm-canvas'), ctx = cv.getContext('2d');
const imgCache = {};
const sheet = key => imgCache[key] || (imgCache[key] = Object.assign(new Image(), { decoding: 'async', src: stage.dataset[key], onload: () => kick() }));
let fighter = SPRITES.order.includes(store.get(FKEY)) ? store.get(FKEY) : SPRITES.order[0];
const ME = { key: fighter, img: sheet(fighter), m: SPRITES.fighters[fighter].a, act: 'idle', t0: 0, loop: true, x: 0, home: 0, hold: 0 };
const FOE = { key: 'no01', img: sheet('no01'), m: SPRITES.foe.a, act: 'idle', t0: 0, loop: true, x: 0, hold: 0 };
let W = 0, H = 0, K = 1, GROUND = 0;
function layout() {
  const r = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  W = r.width; H = r.height; K = W >= 520 ? 1.2 : 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  GROUND = H - 24;
  FOE.x = Math.round(W * 0.68);
  ME.home = Math.round(Math.max(48, FOE.x - 175 * K));
  if (!dmBusy) ME.x = ME.home;
  const tag = $('#dm-tag'); tag.style.left = FOE.x + 'px'; tag.style.top = Math.max(4, GROUND - 112 * K) + 'px';
  placeMyTag();
}
function placeMyTag() { const t = $('#dm-mytag'); t.style.left = ME.x + 'px'; t.style.top = Math.max(4, GROUND - 112 * K) + 'px'; }
function play(a, act, { loop = false, speed = 1 } = {}) {
  if (!a.m[act]) act = 'idle';
  a.act = act; a.t0 = performance.now(); a.loop = loop; a.speed = speed;
  const m = a.m[act]; return REDUCED ? 250 : (m.n * m.ms) / speed;       // 播完需要的毫秒
}
function draw(a, now) {
  if (!a.img.complete || !a.img.naturalWidth) return;
  const m = a.m[a.act];
  let f = REDUCED ? 0 : Math.floor(((now - a.t0) * (a.speed || 1)) / m.ms);
  f = a.loop ? f % m.n : Math.min(f, m.n - 1);
  const k = Math.min(K, (H - 6) / m.h);                                      // 大型特效縮到放得進舞台
  const sx = (f % m.c) * m.w, sy = m.y + Math.floor(f / m.c) * m.h;
  ctx.drawImage(a.img, sx, sy, m.w, m.h, Math.round(a.x + m.ox * k), Math.round(GROUND + m.oy * k), Math.round(m.w * k), Math.round(m.h * k));
}
let raf = 0, visible = true;
function loop(now) {
  raf = 0;
  ctx.clearRect(0, 0, W, H);
  // 誰在出招誰畫在上面
  const top = FOE.act === 'attack' || FOE.act === 'magic' ? FOE : ME;
  draw(top === ME ? FOE : ME, now); draw(top, now);
  placeMyTag();
  if (visible && !document.hidden) raf = requestAnimationFrame(loop);
}
function kick() { if (!raf) raf = requestAnimationFrame(loop); }
new ResizeObserver(() => { layout(); kick(); }).observe(stage);
new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); kick(); }).observe(stage);
document.addEventListener('visibilitychange', kick);
play(ME, 'idle', { loop: true }); play(FOE, 'idle', { loop: true });

const wait = ms => new Promise(r => setTimeout(r, REDUCED ? 0 : ms));
const tween = (a, to, ms) => new Promise(res => {
  if (REDUCED || ms <= 0) { a.x = to; return res(); }
  const from = a.x, t0 = performance.now();
  const step = now => { const p = Math.min(1, (now - t0) / ms); a.x = Math.round(from + (to - from) * (1 - (1 - p) * (1 - p))); p < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
});
const idleLater = (a, ms) => { a.hold = performance.now() + ms; setTimeout(() => { if (performance.now() >= a.hold - 5) play(a, 'idle', { loop: true }); }, REDUCED ? 0 : ms); };

// ── 血條 ──
function resetPool() { const top = dmRange(true)?.max || 1; DM.pool = top * 3; DM.hp = DM.pool; bar('#dm-hp', DM.hp / DM.pool); }
function resetMine() { const top = dmRange(false)?.max || 1; DM.myPool = top * 2.5; DM.myHp = DM.myPool; bar('#dm-myhp', 1); }
function bar(sel, p) { const el = $(sel); p = Math.max(0, p); el.style.width = `${Math.max(p > 0 ? 4 : 0, p * 100)}%`; el.classList.toggle('low', p < 0.3); }

// ── 跳字（不超出舞台）──
function pop(text, x, cls = '') {
  const pops = $('#dm-pops'), el = document.createElement('b');
  el.className = 'dm-pop ' + cls; el.textContent = text; pops.appendChild(el);
  const ew = el.offsetWidth; el.style.left = `${Math.max(4, Math.min(W - ew - 4, x - ew / 2 + (Math.random() - 0.5) * 24))}px`;
  setTimeout(() => el.remove(), REDUCED ? 700 : 1300);
}

/** 01 反擊：原地出招（攻擊或法術），角色可能格擋；扣角色的血，見底就倒地 */
async function counter() {
  DM.countered++;
  const magicMove = Math.random() < 0.35;
  pop(T('dmg.dmCounter'), FOE.x, 'warn');
  sfx(magicMove ? 'magic' : 'swing');
  const dur = play(FOE, magicMove ? 'magic' : 'attack', { speed: magicMove ? 1.6 : 1.3 });
  await wait(dur * 0.55);
  const r = dmRange(false) || { min: 1, max: 1 };
  const guard = Math.random() < 0.35;
  let dmg = Math.round((r.min + Math.random() * (r.max - r.min)) * (magicMove ? 0.8 : 0.6));
  if (guard) { dmg = Math.round(dmg * 0.25); sfx('guard'); idleLater(ME, play(ME, 'guard')); pop(`${T('dmg.dmGuard')} -${fmt(dmg)}`, ME.x, 'blue'); }
  else { sfx('hit'); idleLater(ME, play(ME, 'hurt', { speed: 2 })); pop(`-${fmt(dmg)}`, ME.x, 'blue'); }
  DM.myHp -= dmg; bar('#dm-myhp', DM.myHp / DM.myPool);
  await wait(dur * 0.45);
  play(FOE, 'idle', { loop: true });
  if (DM.myHp <= 0) {
    DM.myHp = 0; bar('#dm-myhp', 0); sfx('ko');
    const down = play(ME, 'down'); ME.hold = performance.now() + down + 1200;
    pop(T('dmg.dmMeDown'), W * 0.3, 'ko');
    idleLater(FOE, play(FOE, 'happy', { loop: true }) * 2); sfx('cheer');
    await wait(down + 1000);
    resetMine(); idleLater(ME, play(ME, 'angry'));
    await wait(500);
    return true;
  }
  return false;
}

/** 一下：跑上前出招 → 命中算傷害、01 受擊／格擋（血條見底倒地）→ 可能被反擊 → 跑回來 */
async function dmHit({ combo = false } = {}) {
  const crit = Math.random() * 100 < num('dm-crit');
  const r = dmRange(crit); if (!r) return;
  if (DM.pool <= 1) resetPool();
  if (DM.myPool <= 1) resetMine();
  const skill = val('dm-mode') === 'skill';
  const move = skill || (crit && Math.random() < 0.6) ? 'magic' : 'attack';
  const rc = SPRITES.fighters[ME.key].reach || {};                          // 車子比較寬，停遠一點
  const near = FOE.x - (move === 'magic' ? rc.magic || 135 : rc.attack || 72) * K;
  if (Math.abs(ME.x - near) > 4) { play(ME, 'run', { loop: true, speed: 1.4 }); await tween(ME, near, combo ? 110 : 220); }
  sfx(move === 'magic' ? 'magic' : 'swing');
  const speed = combo ? 1.7 : 1.25;
  const dur = play(ME, move, { speed });
  await wait(dur * (move === 'magic' ? 0.65 : 0.5));
  // ── 命中 ──
  const dmg = Math.round(r.min + Math.random() * (r.max - r.min));
  DM.hits++; DM.total += dmg; DM.max = Math.max(DM.max, dmg);
  if (crit) { DM.crits++; DM.streak++; if (DM.streak === 3) track('damage.crit3'); } else DM.streak = 0;
  DM.recent.push(dmg); if (DM.recent.length > 40) DM.recent.shift();
  track('damage.hit');
  sfx(crit ? 'crit' : 'hit');
  pop((crit ? T('dmg.dmCritPop') + ' ' : '') + fmt(dmg), FOE.x, crit ? 'crit' : '');
  DM.hp -= dmg; bar('#dm-hp', DM.hp / DM.pool);
  let ko = false;
  if (DM.hp <= 0) {
    ko = true; DM.hp = 0; bar('#dm-hp', 0);
    const down = play(FOE, 'down', { speed: 1.2 }); FOE.hold = performance.now() + down + 900;
    setTimeout(() => { sfx('ko'); pop(T('dmg.dmKo'), W * 0.3, 'ko'); }, REDUCED ? 0 : down * 0.5);
    setTimeout(() => { resetPool(); play(FOE, 'idle', { loop: true }); }, REDUCED ? 600 : down + 900);
  } else if (performance.now() > FOE.hold) {
    const guardAnim = !crit && Math.random() < 0.2;                           // 只是動作，傷害照算
    if (guardAnim) setTimeout(() => sfx('guard'), 40);
    idleLater(FOE, play(FOE, guardAnim ? 'guard' : 'hurt', { speed: 2.4 }));
  }
  dmRender();
  await wait(dur * (move === 'magic' ? 0.35 : 0.5));
  if (ko) { sfx('cheer'); const hp = play(ME, 'happy', { speed: 1.4 }); await wait(Math.min(hp, 900)); }
  else if (Math.random() * 100 < num('dm-counter')) { await wait(120); await counter(); dmRender(); }
  if (performance.now() >= ME.hold) play(ME, 'idle', { loop: true });
  if (!combo) { play(ME, 'run', { loop: true, speed: 1.4 }); await tween(ME, ME.home, 220); play(ME, 'idle', { loop: true }); }
  return ko;
}
function dmRender() {
  $('#dm-kv').innerHTML = DM.hits ? tile(T('dmg.dmHits'), fmt(DM.hits)) + tile(T('dmg.dmTotal'), fmt(DM.total)) + tile(T('dmg.dmAvg'), fmt(DM.total / DM.hits, 1)) + tile(T('dmg.dmMax'), fmt(DM.max)) + tile(T('dmg.dmCrits'), `${fmt(DM.crits)} <small>(${fmt(DM.hits ? DM.crits / DM.hits * 100 : 0, 0)}%)</small>`) + tile(T('dmg.dmCountered'), fmt(DM.countered)) : '';
  const lo = dmRange(false)?.min ?? 0, hi = dmRange(true)?.max ?? 1;
  if (!DM.recent.length || hi <= lo) { $('#dm-hist').innerHTML = ''; $('#dm-note').textContent = ''; return; }
  const bins = new Array(14).fill(0);
  for (const v of DM.recent) bins[Math.min(13, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * 14)))]++;
  const peak = Math.max(...bins);
  $('#dm-hist').innerHTML = bins.map(c => `<i style="height:${peak ? (c / peak) * 100 : 0}%"></i>`).join('');
  $('#dm-note').textContent = T('dmg.dmNote', { n: DM.recent.length, a: fmt(lo), b: fmt(hi) });
}

// ── 選角色 ──
function renderPick() {
  $('#dm-pick').innerHTML = SPRITES.order.map((k, i) => `<button type="button" role="radio" aria-checked="${k === fighter}" data-fighter="${k}" aria-label="${esc(T('dmg.f.' + k))}"><i style="background-position:${-i * 48}px 0"></i></button>`).join('');
}
function setFighter(k) {
  if (dmBusy || k === fighter || !SPRITES.fighters[k]) return;
  fighter = k; store.set(FKEY, k);
  Object.assign(ME, { key: k, img: sheet(k), m: SPRITES.fighters[k].a, hold: 0 });
  play(ME, 'happy', { speed: 1.3 }); idleLater(ME, 700);
  resetMine(); renderPick(); kick();
}
$('#dm-pick').addEventListener('click', e => { const b = e.target.closest('[data-fighter]'); if (b) setFighter(b.dataset.fighter); });
renderPick();

const soundBtn = $('#dm-sound');
const syncSound = () => soundBtn.setAttribute('aria-pressed', String(sfxOn()));
soundBtn.addEventListener('click', () => { setSfx(!sfxOn()); syncSound(); if (sfxOn()) sfx('hit'); });
syncSound();

const busy = on => { dmBusy = on; $('#dm-hit').disabled = on; $('#dm-hit10').disabled = on; $('#dm-pick').classList.toggle('is-busy', on); };
$('#dm-hit').addEventListener('click', async () => { if (dmBusy) return; busy(true); try { await dmHit(); } finally { busy(false); } });
$('#dm-hit10').addEventListener('click', async () => {
  if (dmBusy) return; busy(true);
  try {
    for (let i = 0; i < 10; i++) await dmHit({ combo: true });
    play(ME, 'run', { loop: true, speed: 1.4 }); await tween(ME, ME.home, 220); play(ME, 'idle', { loop: true });
  } finally { busy(false); }
});
$('#dm-reset').addEventListener('click', () => { Object.assign(DM, { hits: 0, total: 0, max: 0, crits: 0, streak: 0, recent: [], countered: 0 }); resetPool(); resetMine(); dmRender(); });
$('#dm-crit').addEventListener('input', () => { $('#dm-crit-v').textContent = num('dm-crit') + '%'; });
$('#dm-counter').addEventListener('input', () => { $('#dm-counter-v').textContent = num('dm-counter') + '%'; });
$('#pane-phys').addEventListener('input', e => { if (e.target.closest('.dummy-card')) return; resetPool(); resetMine(); dmRender(); });
['dm-mode', 'dm-boss'].forEach(id => $('#' + id).addEventListener('change', () => { resetPool(); resetMine(); }));
