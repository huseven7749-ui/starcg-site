// 魔幣・魔晶・法幣（台幣／港幣／人民幣／韓元／美金）匯率比價
import { $, $$, T, api, esc, fmt, fmtWan, rates, store, toast, parseAmount, downloadCsv, debounce, loadFx, FIATS } from './core.js';

const BATCH_KEY = 'sc.batch';
const el = {
  rC: $('#r-crystal'), rT: $('#r-twd'), rev: $('#r-reverse'), quick: $('#quick'),
  coin: $('#c-coin'), crystal: $('#c-crystal'), twd: $('#c-twd'),
  sC: $('#s-crystal'), sG: $('#s-coin'), verdict: $('#verdict'), batch: $('#batch'),
};
const num = v => { const n = parseAmount(v); return isFinite(n) ? n : NaN; };
const out = (n, d = 2) => (isFinite(n) ? fmt(n, d) : '');

// ───── 行情 ─────
const curName = c => T('common.fiat.' + c);
function syncFiatUi() {
  const r = rates.get(), cur = r.fiat;
  $$('#fiat-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.value === cur)));
  $('#r-fiat-label').textContent = T('ex.rateFiat', { cur: curName(cur) });
  $$('.fiat-name').forEach(e => (e.textContent = curName(cur)));
  $$('.fiat-sym').forEach(e => (e.textContent = rates.symbol(cur)));
  const fx = rates.fx();
  $('#fx-note').innerHTML = cur === 'TWD' ? esc(T('ex.fxBase'))
    : `${esc(T('ex.fxNote', { date: fx.date, rate: fmt(fx.rates[cur], cur === 'KRW' ? 2 : 4), cur: curName(cur) }))} <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates By Exchange Rate API</a>`;
}
function loadRates() {
  const r = rates.get();
  el.rC.value = r.crystalPerMil;
  if (document.activeElement !== el.rT) el.rT.value = +rates.crystalPerFiat(r.fiat, r).toFixed(r.fiat === 'KRW' ? 4 : 2);
  syncFiatUi();
}
function showReverse() {
  const r = rates.get();
  const per = rates.crystalPerFiat(r.fiat, r);
  el.rev.textContent = T('ex.reverse', {
    coin: fmt(rates.crystalToCoin(1, r)),
    cur: curName(r.fiat),
    crystal: fmt(per, per < 1 ? 3 : 1),
    coin2: fmtWan(rates.crystalToCoin(per, r)),
  });
  const amounts = [1e5, 5e5, 1e6, 5e6, 1e7, 1e8];
  el.quick.innerHTML = amounts.map(a => {
    const c = rates.coinToCrystal(a, r);
    return `<tr><td class="num">${esc(fmtWan(a))}</td><td class="num">${esc(fmt(c, 1))}</td><td class="num">${esc(rates.fiatText(c))}</td></tr>`;
  }).join('');
}
const saveRates = debounce(() => {
  const c = Number(el.rC.value), t = Number(el.rT.value), r = rates.get();
  // 法幣欄位輸入的是「1 單位所選貨幣可換多少魔晶」，換回台幣基準儲存
  if (c > 0 && t > 0) rates.set({ crystalPerMil: c, crystalPerTwd: t * (rates.fx().rates[r.fiat] || 1) });
}, 200);
el.rC.addEventListener('input', saveRates);
el.rT.addEventListener('input', saveRates);
$('#fiat-seg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !FIATS.includes(b.value)) return;
  rates.set({ fiat: b.value });
});

// ───── 三向換算 ─────
let lastField = 'coin';
function convert(from) {
  if (from) lastField = from;
  const r = rates.get();
  const src = el[lastField].value;
  const v = num(src);
  const set = (k, n) => { if (k !== lastField) el[k].value = out(n, k === 'twd' && r.fiat === 'KRW' ? 0 : 2); };
  if (!src.trim() || !isFinite(v)) { ['coin', 'crystal', 'twd'].forEach(k => k !== lastField && (el[k].value = '')); return; }
  let crystal;
  if (lastField === 'coin') crystal = rates.coinToCrystal(v, r);
  else if (lastField === 'crystal') crystal = v;
  else crystal = rates.fiatToCrystal(v, r.fiat, r);
  set('coin', rates.crystalToCoin(crystal, r));
  set('crystal', crystal);
  set('twd', rates.crystalToFiat(crystal, r.fiat, r));
}
['coin', 'crystal', 'twd'].forEach(k => el[k].addEventListener('input', () => convert(k)));

// ───── 單品比價 ─────
function verdictOf(crystalPrice, coinPrice) {
  const r = rates.get();
  if (!(crystalPrice > 0) || !(coinPrice > 0)) return null;
  const crystalAsCoin = rates.crystalToCoin(crystalPrice, r);
  if (Math.abs(crystalAsCoin - coinPrice) / Math.max(crystalAsCoin, coinPrice) < 0.005) return { better: 'same', pct: 0 };
  if (coinPrice < crystalAsCoin) return { better: 'coin', pct: (crystalAsCoin - coinPrice) / crystalAsCoin * 100, save: crystalAsCoin - coinPrice, crystalAsCoin };
  return { better: 'crystal', pct: (coinPrice - crystalAsCoin) / coinPrice * 100, save: rates.coinToCrystal(coinPrice, r) - crystalPrice, crystalAsCoin };
}
function renderVerdict() {
  const v = verdictOf(num(el.sC.value), num(el.sG.value));
  el.verdict.className = 'verdict';
  if (!v) { el.verdict.textContent = T('ex.verdictEmpty'); return; }
  if (v.better === 'same') { el.verdict.textContent = T('ex.verdictSame'); return; }
  el.verdict.classList.add(v.better);
  const save = v.better === 'coin' ? `${fmtWan(v.save)} ${T('common.coin')}` : `${fmt(v.save, 1)} ${T('common.crystal')}`;
  el.verdict.innerHTML = T(v.better === 'coin' ? 'ex.verdictCoin' : 'ex.verdictCrystal', { p: `<b>${fmt(v.pct, 1)}%</b>`, save: esc(save) }) +
    `<br><span class="muted small">${esc(T('ex.equiv', { crystal: fmt(num(el.sC.value)), coin: fmtWan(v.crystalAsCoin) }))}</span>`;
}
el.sC.addEventListener('input', renderVerdict);
el.sG.addEventListener('input', renderVerdict);

$('#pull-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#pull-q').value.trim();
  if (!q) return;
  const btn = e.submitter || $('#pull-form button');
  btn.disabled = true;
  try {
    const d = await api('market', { q, exact: 1 });
    const rows = [...(d.items || []), ...(d.pets || [])];
    const min = c => { const a = rows.filter(r => r.c === c).map(r => r.p); return a.length ? Math.min(...a) : null; };
    const c = min(1), g = min(0);
    if (c == null && g == null) { toast(T('noResult')); return; }
    el.sC.value = c ?? ''; el.sG.value = g ?? '';
    renderVerdict();
    toast(T('ex.pulled', { n: rows.length }));
  } catch { toast(T('error')); }
  finally { btn.disabled = false; }
});

// ───── 批次比價 ─────
let rows = store.get(BATCH_KEY) || [{ name: '', crystal: '', coin: '' }, { name: '', crystal: '', coin: '' }, { name: '', crystal: '', coin: '' }];
const saveRows = debounce(() => store.set(BATCH_KEY, rows), 300);
function rowResult(r) { return verdictOf(num(r.crystal), num(r.coin)); }
function renderBatch() {
  const L = k => esc(T('ex.' + k));
  el.batch.innerHTML = rows.map((r, i) => {
    const v = rowResult(r);
    const better = !v ? '–' : v.better === 'same' ? T('ex.same') : `<span class="badge ${v.better === 'coin' ? 'b-gold' : 'b-lav'}">${esc(T('common.' + v.better))}</span>`;
    return `<tr data-i="${i}">
      <td data-label="${L('name')}"><input class="input sm" data-k="name" value="${esc(r.name)}" maxlength="30"></td>
      <td data-label="${L('crystal')}"><input class="input sm" data-k="crystal" inputmode="decimal" value="${esc(r.crystal)}"></td>
      <td data-label="${L('coin')}"><input class="input sm" data-k="coin" inputmode="decimal" value="${esc(r.coin)}"></td>
      <td class="num" data-label="${L('better')}" data-out="better">${better}</td>
      <td class="num" data-label="${L('save')}" data-out="save">${v && v.better !== 'same' ? fmt(v.pct, 1) + '%' : '–'}</td>
      <td><button class="btn sm icon ghost" type="button" data-del="${i}" aria-label="${esc(T('common.remove'))}"><svg class="ic"><use href="#i-trash"/></svg></button></td>
    </tr>`;
  }).join('');
}
function updateRowOut(tr) {
  const r = rows[Number(tr.dataset.i)];
  const v = rowResult(r);
  $('[data-out=better]', tr).innerHTML = !v ? '–' : v.better === 'same' ? esc(T('ex.same')) : `<span class="badge ${v.better === 'coin' ? 'b-gold' : 'b-lav'}">${esc(T('common.' + v.better))}</span>`;
  $('[data-out=save]', tr).textContent = v && v.better !== 'same' ? fmt(v.pct, 1) + '%' : '–';
}
el.batch.addEventListener('input', e => {
  const inp = e.target.closest('[data-k]');
  if (!inp) return;
  const tr = inp.closest('tr');
  rows[Number(tr.dataset.i)][inp.dataset.k] = inp.value;
  updateRowOut(tr);
  saveRows();
});
el.batch.addEventListener('click', e => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  rows.splice(Number(b.dataset.del), 1);
  if (!rows.length) rows.push({ name: '', crystal: '', coin: '' });
  saveRows(); renderBatch();
});
$('#b-add').addEventListener('click', () => { rows.push({ name: '', crystal: '', coin: '' }); saveRows(); renderBatch(); $$('#batch tr').at(-1)?.querySelector('input')?.focus(); });
$('#b-sort').addEventListener('click', () => {
  rows.sort((a, b) => (rowResult(b)?.pct || -1) - (rowResult(a)?.pct || -1));
  saveRows(); renderBatch();
});
$('#b-clear').addEventListener('click', () => { rows = [{ name: '', crystal: '', coin: '' }]; saveRows(); renderBatch(); });
$('#b-csv').addEventListener('click', () => {
  const r0 = rates.get();
  downloadCsv('starcg-exchange.csv', [
    [T('ex.name'), T('ex.crystal'), T('ex.coin'), T('ex.better'), T('ex.save'), `100萬=${r0.crystalPerMil}`],
    ...rows.filter(r => r.name || r.crystal || r.coin).map(r => { const v = rowResult(r); return [r.name, num(r.crystal) || '', num(r.coin) || '', v ? (v.better === 'same' ? T('ex.same') : T('common.' + v.better)) : '', v ? v.pct.toFixed(1) + '%' : '']; }),
  ]);
});
$('#to-batch').addEventListener('click', () => {
  if (!el.sC.value && !el.sG.value) return;
  const empty = rows.findIndex(r => !r.name && !r.crystal && !r.coin);
  const row = { name: $('#pull-q').value.trim(), crystal: el.sC.value, coin: el.sG.value };
  if (empty >= 0) rows[empty] = row; else rows.push(row);
  saveRows(); renderBatch(); toast(T('saved'));
});

addEventListener('rates', () => { loadRates(); showReverse(); convert(); renderVerdict(); renderBatch(); });
loadRates();
loadFx();
showReverse();
renderVerdict();
renderBatch();
