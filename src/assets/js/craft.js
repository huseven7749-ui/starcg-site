// 生產材料計算：選要做的裝備／補品與數量，算出全部材料，可一鍵丟進批次採購
// 資料：data/crafting.json（整理自星詠魔力攻略網「生產圖鑑」guide.starcg.net/crafting/，只收星詠魔力有的配方）
import { $, $$, T, esc, fmt, store, debounce, toast, copy, normName, emptyState, BASE, LANG, loadKo, kn, kt } from './core.js';
import { costOf, kindOf, matCost } from './craftcost.js';
// 韓文版：有對照就顯示韓文，原本的中文名放在 title
const nm = n => { const k = kn(n); return k !== n ? `<span title="${esc(n)}">${esc(k)}</span>` : `<span lang="zh-Hant">${esc(n)}</span>`; };

const KEY = 'sc.craft', BULK_KEY = 'sc.bulk', BULK_MAX = 60, SHOW = 60;
const CATS = ['weapon-sword', 'weapon-axe', 'weapon-spear', 'weapon-bow', 'weapon-staff', 'weapon-dagger', 'weapon-boomerang',
  'armor-helmet', 'armor-hat', 'armor-plate', 'armor-clothes', 'armor-robe', 'armor-boots', 'armor-shoes', 'armor-shield', 'potion', 'food'];
const saved = store.get(KEY) || {};
const S = { cat: CATS.includes(saved.cat) ? saved.cat : 'weapon-sword', q: '', list: Array.isArray(saved.list) ? saved.list : [], all: false };
let ITEMS = [], BY_ID = new Map(), BY_NAME = new Map(), COST = null;
// 成本設定：工時價格、特殊材料價格（使用者填的，存在這台裝置）
const CKEY = 'sc.craft.cost';
const CS = (() => { const v = store.get(CKEY) || {}; return { labor: Number(v.labor) > 0 ? Number(v.labor) : null, free: Number(v.free) > 0 ? Number(v.free) : 0, prices: v.prices && typeof v.prices === 'object' ? v.prices : {}, all: false }; })();
const saveCost = () => store.set(CKEY, { labor: CS.labor, free: CS.free, prices: CS.prices });
const costOpt = () => ({ labor: CS.labor ?? COST.labor, prices: CS.prices, recipes: BY_NAME });
const costIt = it => COST ? costOf(it, COST, costOpt()) : null;
const G = v => fmt(Math.round(v));
const save = () => store.set(KEY, { cat: S.cat, list: S.list });
const catName = c => T('cr.cat.' + c);
// 市場上的商品名稱沒有「一級」「八級」這種前綴（例如「一級銅條」在市場叫「銅條」）
const marketName = n => n.replace(/^[一二三四五六七八九十]+級/, '');
const lvLabel = it => it.g ? it.g : T('cr.lvN', { n: it.lv });

function itemRow(it) {
  const on = S.list.some(x => x.id === it.id);
  const mats = it.m.map(([n, q]) => `<span class="cr-m">${nm(n)}<b>×${q}</b></span>`).join('');
  const meta = [kt(it.t), it.p != null ? T('cr.price', { p: fmt(it.p) }) : '', kt(it.note)].filter(Boolean).map(esc).join('・');
  const c = costIt(it);
  const cost = c ? `<span class="cr-cost${c.need ? ' need' : ''}" title="${esc(c.need ? T('cr.costNeed') : '')}">${esc(T('cr.costEach', { p: G(c.total) }))}${c.need ? ' *' : ''}</span>` : '';
  return `<li class="cr-item${on ? ' on' : ''}"><span class="cr-lv">${esc(lvLabel(it))}</span>` +
    `<div class="cr-body"><b>${nm(it.n)}</b>${S.q && it.cat !== S.cat ? `<span class="badge b-sky">${esc(catName(it.cat))}</span>` : ''}${meta || cost ? `<small>${meta}${meta && cost ? '・' : ''}${cost}</small>` : ''}<div class="cr-ms">${mats}</div></div>` +
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
  // 自產成本：自己採（採集屋取出費＋工時）或特殊材料價格算出來的這些數量要花多少魔幣
  const selfCost = (n, q) => {
    if (!COST) return '';
    const c = matCost(n, q, COST, costOpt());
    return `<td class="num cr-self${c.need ? ' need' : ''}" title="${esc(c.need ? T('cr.costNeed') : '')}">${G(c.total)}${c.need ? ' *' : ''}</td>`;
  };
  $('#cr-mats').innerHTML = tot.length ? `<thead><tr><th>${esc(T('cr.mat'))}</th><th class="num">${esc(T('cr.need'))}</th>${COST ? `<th class="num">${esc(T('cr.selfCost'))}</th>` : ''}<th></th></tr></thead><tbody>` +
    tot.map(([n, q]) => `<tr><th scope="row">${nm(n)}</th><td class="num"><b>${fmt(q)}</b></td>${selfCost(n, q)}<td class="cr-buy"><a class="small" href="${href(n)}" title="${esc(marketName(n))}">${esc(T('cr.price2'))}</a></td></tr>`).join('') + '</tbody>'
    : `<tbody><tr><td class="muted small">${esc(T('cr.matsEmpty'))}</td></tr></tbody>`;
  renderCost();
  renderSet();
  $('#cr-bulk').disabled = $('#cr-copy').disabled = !tot.length;
  $('#cr-clear').hidden = !S.list.length;
  save();
}
// 生產成本：清單裡每一項的每件成本與小計
function renderCost() {
  const box = $('#cr-cost'); if (!box) return;
  if (!COST || !S.list.length) { box.innerHTML = `<p class="muted small">${esc(T('cr.matsEmpty'))}</p>`; return; }
  let sum = 0, mat = 0, work = 0, fee = 0, need = false;
  const rows = S.list.map(x => {
    const it = BY_ID.get(x.id), c = costIt(it);
    sum += c.total * x.qty; mat += c.mat * x.qty; work += c.work * x.qty; fee += c.fee * x.qty; need = need || c.need;
    const box2 = c.box != null ? `<small class="muted">${esc(T('cr.costBox', { p: G(c.box) }))}</small>` : '';
    return `<tr><th scope="row">${nm(it.n)} <span class="muted">×${x.qty}</span>${c.need ? ' <span class="cr-need" title="' + esc(T('cr.costNeed')) + '">*</span>' : ''}${box2}</th><td class="num">${G(c.total)}</td><td class="num"><b>${G(c.total * x.qty)}</b></td></tr>`;
  }).join('');
  box.innerHTML = `<div class="tbl-wrap"><table class="tbl cr-costs"><thead><tr><th>${esc(T('cr.costItem'))}</th><th class="num">${esc(T('cr.costUnit'))}</th><th class="num">${esc(T('cr.costSum'))}</th></tr></thead><tbody>${rows}</tbody>` +
    `<tfoot><tr><th scope="row">${esc(T('cr.costTotal'))}</th><td></td><td class="num"><b class="cr-grand">${G(sum)}</b></td></tr></tfoot></table></div>` +
    `<p class="small muted cr-split">${esc(T('cr.costSplit', { m: G(mat), w: G(work), f: G(fee) }))}</p>` +
    freeLine(work, sum) +
    (need ? `<p class="small cr-needtip">＊${esc(T('cr.costNeed'))}</p>` : '');
}
// 免費卡時：工時成本＝需要的小時數 × 工時價格；有免費卡時就用它折抵（最多折到這單的工時）
function freeLine(work, sum) {
  const price = CS.labor ?? COST.labor, hours = work / price;
  const use = Math.min(CS.free || 0, hours), off = use * price;
  return `<div class="cr-free"><p class="small">${esc(T('cr.freeNeed', { h: hours.toFixed(2), w: G(work), p: fmt(price) }))}</p>` +
    (use > 0 ? `<p class="small">${esc(T('cr.freeUse', { h: +use.toFixed(2), d: G(off) }))}<b class="cr-grand">${G(sum - off)}</b></p>` : `<p class="small muted">${esc(T('cr.freeHint'))}</p>`) + '</div>';
}
// 成本設定：工時價格＋特殊材料價格（預設：官方公定價；沒有公定價的是 0，請自己填）
function specialList() {
  const used = new Map();
  const src = CS.all ? ITEMS : S.list.map(x => BY_ID.get(x.id)).filter(Boolean);
  const walk = (it, d = 0) => { for (const [n] of it.m) { const k = kindOf(n, COST, BY_NAME); if (k.kind === 'special') used.set(k.base, true); else if (k.kind === 'craft' && d < 3) walk(BY_NAME.get(k.base), d + 1); } };
  src.forEach(it => walk(it));
  return [...used.keys()].sort((a, b) => (COST.special[b] != null) - (COST.special[a] != null) || a.localeCompare(b, 'zh-Hant'));
}
function renderSet() {
  const box = $('#cr-set-list'); if (!box || !COST) return;
  if (box.contains(document.activeElement) && !renderSet.force) return;   // 正在填價格：不要重畫，免得游標跳掉
  $('#cr-labor').placeholder = String(COST.labor);
  if (document.activeElement !== $('#cr-labor')) $('#cr-labor').value = CS.labor ?? '';
  if (document.activeElement !== $('#cr-free')) $('#cr-free').value = CS.free || '';
  $('#cr-free-per').textContent = T('cr.freePer', { p: fmt(CS.labor ?? COST.labor) });
  $('#cr-set-all').setAttribute('aria-pressed', String(CS.all));
  const list = specialList();
  box.innerHTML = list.length ? list.map(n => {
    const def = COST.special[n] ?? 0, v = CS.prices[n];
    const val = v ?? def;
    return `<label class="cr-sp${val === 0 ? ' zero' : ''}"><span>${nm(n)}${COST.special[n] != null ? `<small>${esc(T('cr.setOfficial', { p: fmt(def) }))}</small>` : ''}</span>` +
      `<input class="input sm" type="number" min="0" step="1" inputmode="numeric" data-sp="${esc(n)}" value="${val}" aria-label="${esc(n)}"></label>`;
  }).join('') : `<p class="muted small">${esc(T(CS.all ? 'cr.setNone' : 'cr.setEmpty'))}</p>`;
}
function add(id) {
  const i = S.list.findIndex(x => x.id === id);
  if (i >= 0) S.list.splice(i, 1); else S.list.push({ id, qty: 1 });
  renderPlan(); renderList();
}

async function init() {
  $('#cr-cats').innerHTML = CATS.map(c => `<button type="button" class="chip" value="${c}" aria-pressed="${c === S.cat}">${esc(catName(c))}</button>`).join('');
  let data;
  try { [data] = await Promise.all([fetch(BASE + 'data/crafting.json', { cache: 'no-cache' }).then(r => r.json()), loadKo()]); }
  catch { $('#cr-list').innerHTML = emptyState('adv-sit', T('cr.loadFail')); return; }
  ITEMS = [];
  for (const c of CATS) (data.cats[c] || []).forEach((it, k) => ITEMS.push({ ...it, cat: c, id: `${c}:${it.g || it.lv}:${it.n}:${k}` }));
  BY_ID = new Map(ITEMS.map(it => [it.id, it]));
  BY_NAME = new Map(ITEMS.map(it => [it.n, it]));
  try { COST = await fetch(BASE + 'data/crafting-cost.json', { cache: 'no-cache' }).then(r => r.json()); } catch { COST = null; }
  $('#cr-setbox').hidden = !COST;
  renderList(); renderPlan();
  // 成本設定
  const rerender = debounce(() => { renderList(); renderPlan(); }, 200);
  $('#cr-labor').addEventListener('input', e => { const v = Math.round(Number(e.target.value)); CS.labor = v > 0 ? v : null; saveCost(); $('#cr-free-per').textContent = T('cr.freePer', { p: fmt(CS.labor ?? COST.labor) }); rerender(); });
  $('#cr-free').addEventListener('input', e => { const v = Number(e.target.value); CS.free = v > 0 ? Math.round(v * 100) / 100 : 0; saveCost(); rerender(); });
  $('#cr-set-list').addEventListener('input', e => {
    const inp = e.target.closest('[data-sp]'); if (!inp) return;
    const n = inp.dataset.sp, v = inp.value === '' ? null : Math.max(0, Math.round(Number(inp.value) || 0));
    if (v == null || v === (COST.special[n] ?? 0)) delete CS.prices[n]; else CS.prices[n] = v;
    inp.closest('.cr-sp').classList.toggle('zero', (v ?? COST.special[n] ?? 0) === 0);
    saveCost(); rerender();
  });
  $('#cr-set-all').addEventListener('click', () => { CS.all = !CS.all; renderSet(); });
  $('#cr-set-reset').addEventListener('click', () => { CS.labor = null; CS.prices = {}; CS.free = 0; saveCost(); renderSet.force = true; renderList(); renderPlan(); renderSet.force = false; toast(T('cr.setResetDone')); });

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
    const lines = S.list.map(x => { const it = BY_ID.get(x.id), c = costIt(it); return `${it.n} ×${x.qty}` + (c ? `（${T('cr.costEach', { p: G(c.total) })}）` : ''); })
      .concat(['', T('cr.mats') + '：'], totals().map(([n, q]) => `${n} ×${q}`));
    if (COST && S.list.length) lines.push('', `${T('cr.costTotal')}：${G(S.list.reduce((a, x) => a + costIt(BY_ID.get(x.id)).total * x.qty, 0))}`);
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
