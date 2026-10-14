// 傷害計算機（站內版）
import { $, $$, T, esc, fmt, store, debounce } from './core.js';
import { physical, magic, CRYSTAL, RACE, SKILL_QIANKUN, SKILL_HUIXUAN, SKILL_ZHUIYUE, zhuiyuePve, MAGIC_BASE } from './dmgcalc.js';

const KEY = 'sc.damage';
const CRY = Object.fromEntries(CRYSTAL), RAC = Object.fromEntries(RACE);
const num = id => Number(document.getElementById(id).value) || 0;
const val = id => document.getElementById(id).value;
const chk = id => document.getElementById(id).checked;
const IDS = ['p-atk', 'p-alv', 'p-weapon', 'p-skill', 'p-def', 'p-dlv', 'p-crystal', 'p-race', 'p-pet', 'p-tier', 'p-rm', 'p-full', 'p-beast',
  'sk-type', 'sk-lv', 'sk-hit', 'sk-pve', 'm-type', 'm-lv', 'm-spirit', 'm-target', 'm-staff', 'm-insight', 'm-crystal', 'm-race', 'm-pve', 'm-pet', 'm-tier', 'm-rm', 'm-full', 'm-beast'];
let caster = 'char', tab = 'phys';

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
