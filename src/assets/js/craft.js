// 生產材料計算：選要做的裝備／補品與數量，算出全部材料，可一鍵丟進批次採購
// 資料：data/crafting.json（整理自星詠魔力攻略網「生產圖鑑」guide.starcg.net/crafting/，只收星詠魔力有的配方）
import { $, $$, T, esc, fmt, store, debounce, toast, copy, normName, emptyState, BASE, LANG, loadKo, kn, kt } from './core.js';
// 韓文版：有對照就顯示韓文，原本的中文名放在 title
const nm = n => { const k = kn(n); return k !== n ? `<span title="${esc(n)}">${esc(k)}</span>` : `<span lang="zh-Hant">${esc(n)}</span>`; };

const KEY = 'sc.craft', BULK_KEY = 'sc.bulk', BULK_MAX = 60, SHOW = 60;
const CATS = ['weapon-sword', 'weapon-axe', 'weapon-spear', 'weapon-bow', 'weapon-staff', 'weapon-dagger', 'weapon-boomerang',
  'armor-helmet', 'armor-hat', 'armor-plate', 'armor-clothes', 'armor-robe', 'armor-boots', 'armor-shoes', 'armor-shield', 'potion', 'food'];
const saved = store.get(KEY) || {};
const S = { cat: CATS.includes(saved.cat) ? saved.cat : 'weapon-sword', q: '', list: Array.isArray(saved.list) ? saved.list : [], all: false };
let ITEMS = [], BY_ID = new Map();
const save = () => store.set(KEY, { cat: S.cat, list: S.list });
const catName = c => T('cr.cat.' + c);
// 市場上的商品名稱沒有「一級」「八級」這種前綴（例如「一級銅條」在市場叫「銅條」）
const marketName = n => n.replace(/^[一二三四五六七八九十]+級/, '');
const lvLabel = it => it.g ? it.g : T('cr.lvN', { n: it.lv });

function itemRow(it) {
  const on = S.list.some(x => x.id === it.id);
  const mats = it.m.map(([n, q]) => `<span class="cr-m">${nm(n)}<b>×${q}</b></span>`).join('');
  const meta = [kt(it.t), it.p != null ? T('cr.price', { p: fmt(it.p) }) : '', kt(it.note)].filter(Boolean).map(esc).join('・');
  return `<li class="cr-item${on ? ' on' : ''}"><span class="cr-lv">${esc(lvLabel(it))}</span>` +
    `<div class="cr-body"><b>${nm(it.n)}</b>${S.q && it.cat !== S.cat ? `<span class="badge b-sky">${esc(catName(it.cat))}</span>` : ''}${meta ? `<small>${meta}</small>` : ''}<div class="cr-ms">${mats}</div></div>` +
    `<button type="button" class="btn sm ${on ? 'ghost' : 'primary'}" data-add="${it.id}">${esc(T(on ? 'cr.added' : 'cr.add'))}</button></li>`;
}
function renderList() {
  const q = normName(S.q.trim());
  // 有關鍵字時跨分類搜尋：成品名稱或材料名稱
  const list = q ? ITEMS.filter(it => normName(it.n).includes(q) || normName(kn(it.n)).includes(q) || it.m.some(([n]) => normName(n).includes(q) || normName(kn(n)).includes(q))) : ITEMS.filter(it => it.cat === S.cat);
  const shown = S.all ? list : list.slice(0, SHOW);
  $('#cr-count').textContent = q ? T('cr.found', { n: list.length }) : '';
  $('#cr-list').innerHTML = list.length ? `<ul class="cr-items">${shown.map(itemRow).join('')}</ul>` +
    (list.length > shown.length ? `<button type="button" class="btn sm ghost wide" data-more>${esc(T('more', { n: list.length }))}</button>` : '')
    : emptyState('adv-look', T('noResult'));
  $$('#cr-cats button').forEach(b => b.setAttribute('aria-pressed', String(!q && b.value === S.cat)));
}
function totals() {
  const m = new Map();
  for (const x of S.list) {
    const it = BY_ID.get(x.id); if (!it) continue;
    for (const [n, q] of it.m) m.set(n, (m.get(n) || 0) + q * x.qty);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function renderPlan() {
  S.list = S.list.filter(x => BY_ID.has(x.id));
  $('#cr-sel').innerHTML = S.list.length ? S.list.map((x, i) => {
    const it = BY_ID.get(x.id);
    return `<li class="bk-row" data-i="${i}"><span class="bk-name"><b>${nm(it.n)}</b><span class="badge b-lav">${esc(catName(it.cat))} ${esc(lvLabel(it))}</span></span>` +
      `<span class="stepper"><button type="button" data-step="-1" aria-label="-">−</button><input class="input sm" type="number" min="1" max="999" value="${x.qty}" inputmode="numeric" aria-label="${esc(T('qty'))}"><button type="button" data-step="1" aria-label="+">＋</button></span>` +
      `<button class="btn sm icon ghost" type="button" data-del="${i}" aria-label="${esc(T('common.remove'))}"><svg class="ic"><use href="#i-trash"/></svg></button></li>`;
  }).join('') : `<li class="empty small">${emptyState('adv-sit', T('cr.empty'))}</li>`;
  const tot = totals();
  const href = n => `${BASE}${LANG === 'ko' ? 'ko/' : ''}market/?q=${encodeURIComponent(marketName(n))}`;
  $('#cr-mats').innerHTML = tot.length ? `<thead><tr><th>${esc(T('cr.mat'))}</th><th class="num">${esc(T('cr.need'))}</th><th></th></tr></thead><tbody>` +
    tot.map(([n, q]) => `<tr><th scope="row">${nm(n)}</th><td class="num"><b>${fmt(q)}</b></td><td class="num"><a class="small" href="${href(n)}">${esc(T('cr.price2'))}</a></td></tr>`).join('') + '</tbody>'
    : `<tbody><tr><td class="muted small">${esc(T('cr.matsEmpty'))}</td></tr></tbody>`;
  $('#cr-bulk').disabled = $('#cr-copy').disabled = !tot.length;
  $('#cr-clear').hidden = !S.list.length;
  save();
}
function add(id) {
  const i = S.list.findIndex(x => x.id === id);
  if (i >= 0) S.list.splice(i, 1); else S.list.push({ id, qty: 1 });
  renderPlan(); renderList();
}

async function init() {
  $('#cr-cats').innerHTML = CATS.map(c => `<button type="button" class="chip" value="${c}" aria-pressed="${c === S.cat}">${esc(catName(c))}</button>`).join('');
  let data;
  try { [data] = await Promise.all([fetch(BASE + 'data/crafting.json').then(r => r.json()), loadKo()]); }
  catch { $('#cr-list').innerHTML = emptyState('adv-sit', T('cr.loadFail')); return; }
  ITEMS = [];
  for (const c of CATS) (data.cats[c] || []).forEach((it, k) => ITEMS.push({ ...it, cat: c, id: `${c}:${it.g || it.lv}:${it.n}:${k}` }));
  BY_ID = new Map(ITEMS.map(it => [it.id, it]));
  renderList(); renderPlan();

  $('#cr-q').addEventListener('input', debounce(e => { S.q = e.target.value; S.all = false; renderList(); }, 150));
  $('#cr-cats').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.cat = b.value; S.q = ''; $('#cr-q').value = ''; S.all = false; renderList(); save(); });
  $('#cr-list').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add) add(b.dataset.add); else if (b.hasAttribute('data-more')) { S.all = true; renderList(); }
  });
  const sel = $('#cr-sel');
  sel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.closest('li')?.dataset.i;
    if (b.dataset.del != null) { S.list.splice(+b.dataset.del, 1); renderPlan(); renderList(); return; }
    if (b.dataset.step && S.list[i]) { S.list[i].qty = Math.max(1, Math.min(999, S.list[i].qty + Number(b.dataset.step))); renderPlan(); }
  });
  sel.addEventListener('change', e => {
    const inp = e.target.closest('input'); if (!inp) return;
    const i = +inp.closest('li').dataset.i;
    if (S.list[i]) { S.list[i].qty = Math.max(1, Math.min(999, Math.round(Number(inp.value) || 1))); renderPlan(); }
  });
  $('#cr-clear').addEventListener('click', () => { S.list = []; renderPlan(); renderList(); });
  $('#cr-copy').addEventListener('click', async () => {
    const lines = S.list.map(x => `${BY_ID.get(x.id).n} ×${x.qty}`).concat(['', T('cr.mats') + '：'], totals().map(([n, q]) => `${n} ×${q}`));
    await copy(lines.join('\n')); toast(T('common.copied'));
  });
  // 材料丟進批次採購（同名的數量取較大值，不重複加總），然後打開批次採購分頁
  $('#cr-bulk').addEventListener('click', () => {
    const cur = store.get(BULK_KEY, []) || [];
    let added = 0;
    const byMarket = new Map();
    for (const [full, q] of totals()) byMarket.set(marketName(full), (byMarket.get(marketName(full)) || 0) + q);
    for (const [n, q] of byMarket) {
      const j = cur.findIndex(x => normName(x.n) === normName(n));
      if (j >= 0) cur[j].qty = Math.max(cur[j].qty || 1, q);
      else if (cur.length < BULK_MAX) { cur.push({ n, qty: q, kind: 'item' }); added++; }
    }
    store.set(BULK_KEY, cur.slice(0, BULK_MAX));
    toast(T('cr.toBulkDone', { n: added }));
    location.href = `${BASE}${LANG === 'ko' ? 'ko/' : ''}market/?tab=bulk`;
  });
}
init();
