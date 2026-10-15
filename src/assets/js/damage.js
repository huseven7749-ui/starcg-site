// 傷害計算機（站內版）
import { $, $$, T, esc, fmt, store, debounce } from './core.js';
import { physical, magic, CRYSTAL, RACE, SKILL_QIANKUN, SKILL_HUIXUAN, SKILL_ZHUIYUE, zhuiyuePve, MAGIC_BASE } from './dmgcalc.js';
import { track } from './game.js';
import { SPRITES } from './dummysprites.js';

const KEY = 'sc.damage';
const CRY = Object.fromEntries(CRYSTAL), RAC = Object.fromEntries(RACE);
const num = id => Number(document.getElementById(id).value) || 0;
const val = id => document.getElementById(id).value;
const chk = id => document.getElementById(id).checked;
const IDS = ['p-atk', 'p-alv', 'p-weapon', 'p-skill', 'p-def', 'p-dlv', 'p-crystal', 'p-race', 'p-pet', 'p-tier', 'p-rm', 'p-full', 'p-beast',
  'sk-type', 'sk-lv', 'sk-hit', 'sk-pve', 'm-type', 'm-lv', 'm-spirit', 'm-target', 'm-staff', 'm-insight', 'm-crystal', 'm-race', 'm-pve', 'm-pet', 'm-tier', 'm-rm', 'm-full', 'm-beast'];
let caster = 'char', tab = 'phys';
let lastPhys = null;

const range = r => `<span class="num">${fmt(r.min)}～${fmt(r.max)}</span><br><b class="num">${fmt(r.avg)}</b>`;
const tile = (label, body, sub = '') => `<div class="stat-tile"><span>${esc(label)}</span><b>${body}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
const pct = x => fmt(x * 100, 1) + '%';

// ───── 物理 ─────
function renderPhys() {
  const pet = chk('p-pet') ? { tier: val('p-tier'), full: chk('p-full'), remodel: num('p-rm'), beast: chk('p-beast') } : null;
  $('#p-petbox').classList.toggle('is-off', !pet); $$('#p-petbox input, #p-petbox select').forEach(x => { x.disabled = !pet; });
  const r = physical({
    atk: num('p-atk'), def: num('p-def'), atkLv: num('p-alv'), defLv: num('p-dlv'),
    weapon: val('p-weapon') === 'weapon' ? 0.15 : 0, crystal: CRY[val('p-crystal')], race: RAC[val('p-race')],
    skill: num('p-skill') / 100, pet,
  });
  lastPhys = r;
  $('#p-kv').innerHTML = tile(T('dmg.atkE'), fmt(r.atkE, 1)) + tile(T('dmg.defE'), fmt(r.defE, 1)) + tile(T('dmg.base'), fmt(r.base, 1)) + tile(T('dmg.critAdd'), '+' + fmt(r.crit, 1));
  const cols = ['normal', 'crit', 'boss', 'bossCrit'];
  const row = (label, data) => `<tr><th scope="row">${esc(label)}</th>${cols.map(c => `<td class="num" data-label="${esc(T('dmg.col.' + c))}">${range(data[c])}</td>`).join('')}</tr>`;
  $('#p-table').innerHTML = `<thead><tr><th></th>${cols.map(c => `<th class="num">${esc(T('dmg.col.' + c))}</th>`).join('')}</tr></thead>
    <tbody>${row(T('dmg.row.attack'), r.attack)}${row(T('dmg.row.skill', { p: fmt(num('p-skill')) }), r.skill)}</tbody>`;
}

// 技能快速帶入
function fillSkillLv() {
  const type = val('sk-type');
  const lv = $('#sk-lv'), hit = $('#sk-hit');
  lv.hidden = type === 'attack';
  hit.hidden = type !== 'huixuan';
  $('#sk-pve-wrap').hidden = type !== 'zhuiyue';
  const cur = Number(lv.value) || 11;
  lv.innerHTML = Array.from({ length: 11 }, (_, i) => `<option value="${i + 1}">Lv${i + 1}</option>`).join('');
  lv.value = String(Math.min(11, cur));
  const h = Number(hit.value) || 3;
  hit.innerHTML = [1, 2, 3].map(n => `<option value="${n}">${esc(T('dmg.sk.hit', { n }))}</option>`).join('');
  hit.value = String(h);
}
function applySkill() {
  const type = val('sk-type'), lv = Number(val('sk-lv')) || 1;
  let p = 100;
  if (type === 'qiankun') p = SKILL_QIANKUN(lv);
  else if (type === 'huixuan') p = SKILL_HUIXUAN[lv][(Number(val('sk-hit')) || 1) - 1];
  else if (type === 'zhuiyue') p = SKILL_ZHUIYUE[lv] + (chk('sk-pve') ? zhuiyuePve(lv) : 0);
  $('#p-skill').value = p;
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
  if (e.target.closest('#sk-lv, #sk-hit, #sk-pve')) { applySkill(); return; }
  renderPhys(); save();
});
$('#m-caster').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { caster = b.value; fillMagicLv(); renderMagic(); save(); } });
$('#pane-magic').addEventListener('input', () => { renderMagic(); save(); });

load();
renderPhys();
renderMagic();

// ───── 痛打 01：金髮男孩出手，在算出的範圍內隨機傷害，看實際分布 ─────
const DM = { hits: 0, total: 0, max: 0, crits: 0, streak: 0, recent: [], hp: 1, pool: 1 };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
let dmBusy = false;
function dmRange(crit) {
  if (!lastPhys) return null;
  const set = lastPhys[val('dm-mode') === 'skill' ? 'skill' : 'attack'];
  const boss = chk('dm-boss');
  return set[boss ? (crit ? 'bossCrit' : 'boss') : (crit ? 'crit' : 'normal')];
}

// 舞台：一張 canvas 畫兩個角色（遊戲原圖的圖集，依腳底原點對齊）
const stage = $('#dm-stage'), cv = $('#dm-canvas'), ctx = cv.getContext('2d');
const sheet = src => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; };
const ACT = {
  boy: { img: sheet(stage.dataset.boy), m: SPRITES.boy, act: 'idle', t0: 0, loop: true, x: 0, home: 0, flip: false },
  foe: { img: sheet(stage.dataset.foe), m: SPRITES.no01, act: 'idle', t0: 0, loop: true, x: 0, hold: 0 },
};
let W = 0, H = 0, K = 1, GROUND = 0;
function layout() {
  const r = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  W = r.width; H = r.height; K = W >= 520 ? 1.25 : 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  GROUND = H - 24;
  ACT.foe.x = Math.round(W * 0.64);
  ACT.boy.home = ACT.boy.x = Math.round(ACT.foe.x - 150 * K);
  const tag = $('#dm-tag'); tag.style.left = ACT.foe.x + 'px'; tag.style.top = Math.max(4, GROUND - 112 * K) + 'px';
}
function play(a, act, { loop = false, speed = 1 } = {}) {
  a.act = act; a.t0 = performance.now(); a.loop = loop; a.speed = speed;
  const m = a.m[act]; return (m.n * m.ms) / speed;          // 播完需要的毫秒
}
function frameOf(a, now) {
  const m = a.m[a.act]; const f = Math.floor(((now - a.t0) * (a.speed || 1)) / m.ms);
  return a.loop ? f % m.n : Math.min(f, m.n - 1);
}
function draw(a, now) {
  if (!a.img.complete || !a.img.naturalWidth) return;
  const m = a.m[a.act], f = REDUCED ? 0 : frameOf(a, now);
  ctx.drawImage(a.img, f * m.w, m.y, m.w, m.h, Math.round(a.x + m.ox * K), Math.round(GROUND + m.oy * K), m.w * K, m.h * K);
}
let raf = 0, visible = true;
function loop(now) {
  raf = 0;
  ctx.clearRect(0, 0, W, H);
  draw(ACT.foe, now); draw(ACT.boy, now);
  if (visible && !document.hidden) raf = requestAnimationFrame(loop);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
new ResizeObserver(() => { layout(); kick(); }).observe(stage);
new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); kick(); }).observe(stage);
document.addEventListener('visibilitychange', kick);
ACT.boy.img.onload = ACT.foe.img.onload = kick;
play(ACT.boy, 'idle', { loop: true }); play(ACT.foe, 'idle', { loop: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
const tween = (a, to, ms) => new Promise(res => {
  if (REDUCED || ms <= 0) { a.x = to; return res(); }
  const from = a.x, t0 = performance.now();
  const step = now => { const p = Math.min(1, (now - t0) / ms); a.x = Math.round(from + (to - from) * (1 - (1 - p) * (1 - p))); p < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
});

function resetPool() { const top = dmRange(true)?.max || 1; DM.pool = top * 3; DM.hp = DM.pool; hpBar(); }
function hpBar() { const p = Math.max(0, DM.hp / DM.pool); const el = $('#dm-hp'); el.style.width = `${Math.max(p > 0 ? 4 : 0, p * 100)}%`; el.classList.toggle('low', p < 0.3); }

/** 一下：男孩衝上去出招 → 命中時算傷害、01 受擊（血條見底就倒地再爬起來） */
async function dmHit({ combo = false } = {}) {
  const crit = Math.random() * 100 < num('dm-crit');
  const r = dmRange(crit); if (!r) return;
  if (DM.pool <= 1) resetPool();
  const boy = ACT.boy, foe = ACT.foe;
  const move = crit ? 'ball' : (Math.random() < 0.5 ? 'kick' : 'dash');
  const near = foe.x - (crit ? 120 : 62) * K;
  await tween(boy, near, combo ? 70 : 120);
  const speed = combo ? 1.6 : 1.15;
  const dur = play(boy, move, { speed });
  await wait(REDUCED ? 0 : dur * (move === 'ball' ? 0.7 : 0.55));
  // ── 命中 ──
  const dmg = Math.round(r.min + Math.random() * (r.max - r.min));
  DM.hits++; DM.total += dmg; DM.max = Math.max(DM.max, dmg);
  if (crit) { DM.crits++; DM.streak++; if (DM.streak === 3) track('damage.crit3'); } else DM.streak = 0;
  DM.recent.push(dmg); if (DM.recent.length > 40) DM.recent.shift();
  track('damage.hit');
  const pops = $('#dm-pops'), el = document.createElement('b');
  el.className = 'dm-pop' + (crit ? ' crit' : ''); el.textContent = (crit ? T('dmg.dmCritPop') + ' ' : '') + fmt(dmg);
  pops.appendChild(el);
  const ew = el.offsetWidth; el.style.left = `${Math.max(4, Math.min(W - ew - 4, foe.x - ew / 2 + (Math.random() - 0.5) * 30))}px`;   // 不超出舞台
  setTimeout(() => el.remove(), REDUCED ? 700 : 1100);
  DM.hp -= dmg; hpBar();
  let ko = false;
  if (DM.hp <= 0) {
    ko = true; DM.hp = 0; hpBar();
    const down = play(foe, 'down', { speed: 1.2 });
    const msg = document.createElement('b'); msg.className = 'dm-pop ko'; msg.textContent = T('dmg.dmKo'); msg.style.left = `${Math.max(2, (ACT.boy.home / W) * 100 - 6)}%`;
    setTimeout(() => { pops.appendChild(msg); setTimeout(() => msg.remove(), 1600); }, REDUCED ? 0 : down * 0.6);
    foe.hold = performance.now() + down + 900;
    setTimeout(() => { resetPool(); play(foe, 'idle', { loop: true }); }, REDUCED ? 600 : down + 900);
  } else if (performance.now() > foe.hold) {
    const hurt = play(foe, 'hurt', { speed: 2.4 });
    foe.hold = performance.now() + hurt;
    setTimeout(() => { if (performance.now() >= foe.hold - 5) play(foe, 'idle', { loop: true }); }, hurt);
  }
  dmRender();
  await wait(REDUCED ? 0 : dur * (move === 'ball' ? 0.3 : 0.45));
  play(boy, 'idle', { loop: true });
  if (!combo) await tween(boy, boy.home, 160);
  return ko;
}
function dmRender() {
  $('#dm-kv').innerHTML = DM.hits ? tile(T('dmg.dmHits'), fmt(DM.hits)) + tile(T('dmg.dmTotal'), fmt(DM.total)) + tile(T('dmg.dmAvg'), fmt(DM.total / DM.hits, 1)) + tile(T('dmg.dmMax'), fmt(DM.max)) + tile(T('dmg.dmCrits'), `${fmt(DM.crits)} <small>(${fmt(DM.hits ? DM.crits / DM.hits * 100 : 0, 0)}%)</small>`) : '';
  const lo = dmRange(false)?.min ?? 0, hi = dmRange(true)?.max ?? 1;
  if (!DM.recent.length || hi <= lo) { $('#dm-hist').innerHTML = ''; $('#dm-note').textContent = ''; return; }
  const bins = new Array(14).fill(0);
  for (const v of DM.recent) bins[Math.min(13, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * 14)))]++;
  const peak = Math.max(...bins);
  $('#dm-hist').innerHTML = bins.map(c => `<i style="height:${peak ? (c / peak) * 100 : 0}%"></i>`).join('');
  $('#dm-note').textContent = T('dmg.dmNote', { n: DM.recent.length, a: fmt(lo), b: fmt(hi) });
}
const busy = on => { dmBusy = on; $('#dm-hit').disabled = on; $('#dm-hit10').disabled = on; };
$('#dm-hit').addEventListener('click', async () => { if (dmBusy) return; busy(true); try { await dmHit(); } finally { busy(false); } });
$('#dm-hit10').addEventListener('click', async () => {
  if (dmBusy) return; busy(true);
  try { for (let i = 0; i < 10; i++) await dmHit({ combo: true }); await tween(ACT.boy, ACT.boy.home, 160); } finally { busy(false); }
});
$('#dm-reset').addEventListener('click', () => { Object.assign(DM, { hits: 0, total: 0, max: 0, crits: 0, streak: 0, recent: [] }); resetPool(); dmRender(); });
$('#dm-crit').addEventListener('input', () => { $('#dm-crit-v').textContent = num('dm-crit') + '%'; });
$('#pane-phys').addEventListener('input', e => { if (e.target.closest('.dummy-card')) return; resetPool(); dmRender(); });
['dm-mode', 'dm-boss'].forEach(id => $('#' + id).addEventListener('change', resetPool));
