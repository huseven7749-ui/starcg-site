// 寵物改造圖成本計算
import { $, $$, T, api, esc, fmt, fmtWan, rates, loadFx, store, toast, parseAmount, debounce, emptyState } from './core.js';
import { LAYERS, expected, simulate, stoneSummary, stoneProfit, tierPrices, cardIncomePerRun, cardSetBreakEven, craft, stonePerRun } from './farmcalc.js';
import { track } from './game.js';
import { TIERS, REMODEL, expectedTries , remodelPoints } from './petcalc.js';

const KEY = 'sc.remodel.v2';
const ids = ['f-runs', 'f-cost', 'f-per', 'f-target', 'p-n', 'p-s', 'p-g', 'c-ns', 'c-nsf', 'c-sg', 'c-sgf', 'c-set', 'c-letters', 't-tier', 't-from', 't-to', 't-pay', 't-set', 's-runs', 's-target', 's-p2', 's-p3', 's-link', 's-fee', 's-value', 's-stonefee', 'cp-gset'];
let layer = 3, reach = 3;
let lastFarm = null;

function load() {
  const s = store.get(KEY) || {};
  layer = s.layer || 3;
  reach = s.reach || 3;
  setLayer(layer, !s['p-n']);
  setReach(reach);
  for (const id of ids) {
    if (s[id] == null) continue;
    const el = document.getElementById(id);
    if (el.type === 'checkbox') el.checked = !!s[id]; else el.value = s[id];
  }
}
const save = debounce(() => {
  const s = { layer, reach };
  for (const id of ids) { const el = document.getElementById(id); s[id] = el.type === 'checkbox' ? el.checked : el.value; }
  store.set(KEY, s);
}, 300);
function setLayer(l, applyRates = true) {
  layer = l;
  $$('#f-layer button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.value) === l)));
  if (applyRates) { const r = LAYERS[l]; $('#p-n').value = r[0] * 100; $('#p-s').value = r[1] * 100; $('#p-g').value = r[2] * 100; }
  if ($('#s-link')?.checked) setReach(l);
}
function setReach(l) {
  reach = l;
  $$('#s-reach button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.value) === l)));
}
const v = id => Number(document.getElementById(id).value) || 0;

// ───── A：刷圖產出 ─────
function farmOpts() {
  const rs = [v('p-n'), v('p-s'), v('p-g')];
  const tot = rs.reduce((a, b) => a + b, 0) || 1;
  return {
    runs: Math.max(1, Math.floor(v('f-runs'))), per: Math.max(1, v('f-per')), runCost: v('f-cost'),
    rates: rs.map(x => x / tot), target: $('#f-target').value,
    ns: Math.max(1, v('c-ns')), nsFee: v('c-nsf'), sg: Math.max(1, v('c-sg')), sgFee: v('c-sgf'),
    perSet: Math.max(1, v('c-set')), letters: $('#c-letters').checked, rawSum: tot,
  };
}
function renderFarm() {
  const o = farmOpts();
  $('#c-set').disabled = o.letters;
  if (o.letters) o.perSet = 4;
  const e = expected(o);
  const sim = simulate(o, 4000);
  const cost = o.runs * o.runCost + sim.fees;
  const perSet = sim.mean > 0 ? cost / sim.mean : null;
  const r = rates.get();
  lastFarm = { perSet };
  const tile = (label, body, sub = '', hl = false) => `<div class="stat-tile${hl ? ' hl' : ''}"><span>${esc(label)}</span><b>${body}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  const tierName = T('card.' + o.target);
  $('#farm-kv').innerHTML =
    tile(T('rm.totalCost'), esc(fmtWan(cost)), `≈ ${fmt(rates.coinToCrystal(cost, r), 1)} ${T('common.crystal')} · ${rates.fiatText(rates.coinToCrystal(cost, r))}`) +
    tile(T('rm.cards'), esc(fmt(e.cards)), T('rm.cardsSub', { n: fmt(e.n, 1), s: fmt(e.s, 1), g: fmt(e.g, 1) })) +
    tile(T('rm.targetCards', { tier: tierName }), esc(fmt(sim.targetMean, 1)), T('rm.fees', { f: fmtWan(sim.fees) })) +
    tile(T('rm.sets'), esc(fmt(sim.mean, 2)), T('rm.range', { a: sim.p10, b: sim.p90 }), true) +
    tile(T('rm.perSetCost'), perSet ? esc(fmtWan(perSet)) : '–', perSet ? `≈ ${fmt(rates.coinToCrystal(perSet, r), 1)} ${T('common.crystal')}` : '', true);
  // 分佈圖
  const max = sim.sets[sim.sets.length - 1], min = sim.sets[0];
  const bins = Math.min(24, max - min + 1);
  const width = (max - min + 1) / bins;
  const counts = new Array(bins).fill(0);
  sim.sets.forEach(x => counts[Math.min(bins - 1, Math.floor((x - min) / width))]++);
  const peak = Math.max(...counts);
  $('#dist').innerHTML = counts.map(c => `<i style="height:${(c / peak) * 100}%"></i>`).join('');
  $('#dist-axis').innerHTML = `<span>${min}</span><span>${Math.round((min + max) / 2)}</span><span>${max}</span>`;
  $('#dist-note').textContent = T('rm.distNote', { p: fmt(sim.zero * 100, 1), sum: fmt(o.rawSum, 1) });
  save();
}

// ───── 技能突破石 ─────
function renderStones() {
  const linked = $('#s-link').checked;
  if (linked) { $('#s-runs').value = Math.max(1, Math.floor(v('f-runs'))); $('#s-fee').value = Math.max(0, v('f-cost')); setReach(layer); }
  $('#s-runs').disabled = linked; $('#s-fee').disabled = linked;
  $$('#s-reach button').forEach(b => (b.disabled = linked));
  const runs = Math.max(1, Math.min(100000, Math.floor(v('s-runs'))));
  const target = Math.max(1, Math.min(10000, Math.floor(v('s-target')) || 1));
  const p2 = Math.min(100, Math.max(0, v('s-p2'))) / 100, p3 = Math.min(100, Math.max(0, v('s-p3'))) / 100;
  const fee = Math.max(0, v('s-fee')), valueCrystal = Math.max(0, v('s-value'));
  const r = rates.get();
  const cut = $('#s-stonefee').checked ? 0.06 : 0;              // 突破石賣出時扣擺攤手續費
  const netCrystal = valueCrystal * (1 - cut);
  const value = rates.crystalToCoin(netCrystal, r);             // 每顆實拿價值換成魔幣
  const s = stoneSummary(runs, reach, p2, p3, target);
  const box = $('#stone-kv'), box2 = $('#stone-kv2'), verdict = $('#stone-verdict');
  $('#stone-h-runs').textContent = T('rm.stoneByRuns', { n: fmt(runs) });
  $('#stone-h-target').textContent = T('rm.stoneByTarget', { k: fmt(target) });
  if (s.per.mean <= 0) {
    verdict.className = 'verdict stone-verdict'; verdict.textContent = T('rm.stoneNone');
    box.innerHTML = box2.innerHTML = ''; $('#stone-kv4').innerHTML = ''; $('#cp-tiers').innerHTML = ''; $('#cp-min').textContent = ''; save(); return;
  }
  const U = T('rm.unitStone');
  const tile = (label, body, sub = '', cls = '') => `<div class="stat-tile${cls ? ' ' + cls : ''}"><span>${esc(label)}</span><b>${body}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  const money = c => esc(fmtWan(Math.round(c)));
  const conv = c => `≈ ${fmt(rates.coinToCrystal(c, r), 0)} ${T('common.crystal')} · ${rates.fiatText(rates.coinToCrystal(c, r))}`;
  const signed = c => (c > 0 ? '+' : c < 0 ? '−' : '') + fmtWan(Math.abs(Math.round(c)));
  const pf = stoneProfit(s, runs, fee, value);
  const tone = x => (Math.abs(x) < 0.01 ? 'even' : x > 0 ? 'gain' : 'loss');
  // 結論：平均每場賺或虧、每顆要值多少才打平
  const t0 = tone(pf.roi);
  const beCrystal = rates.coinToCrystal(pf.breakEvenValue, r) / (1 - cut);   // 要掛的價格
  verdict.className = `verdict stone-verdict ${t0}`;
  verdict.innerHTML = fee > 0 && valueCrystal > 0
    ? `<b>${esc(T('rm.stoneVerdict.' + t0, { p: fmtWan(Math.abs(Math.round(pf.perRunProfit))), s: signed(pf.perRunProfit), r: fmt(Math.abs(pf.roi) * 100, 1) }))}</b><span>${esc(T('rm.stoneBreakEven', { c: fmt(Math.ceil(beCrystal)) }))}</span>`
    : esc(T('rm.stoneNeedInput'));
  // 依場次：會掉幾顆、花多少、值多少
  box.innerHTML =
    tile(T('rm.stoneExpect'), `${esc(fmt(s.mean, 1))} ${esc(U)}`, T('rm.stoneRange', { a: s.p10, b: s.p90 }), 'hl') +
    tile(T('rm.stoneFeeTotal'), money(pf.cost), conv(pf.cost)) +
    tile(T('rm.stoneWorth'), money(pf.worth), cut ? T('rm.stoneWorthSubNet', { c: fmt(valueCrystal), n: fmt(Math.floor(netCrystal)) }) : T('rm.stoneWorthSub', { c: fmt(valueCrystal) })) +
    tile(T('rm.stoneProfit'), esc(signed(pf.profit)), T('rm.stoneBreakProb', { k: fmt(pf.needStones), p: fmt(pf.breakEvenProb * 100, 0) }), t0);
  // 依目標：要打幾場、花多少，和直接買比
  const buy = target * rates.crystalToCoin(valueCrystal, r);   // 直接買照市價，不扣手續費
  const avgCost = s.runsAvg * fee, cost90 = isFinite(s.runsFor90) ? s.runsFor90 * fee : Infinity;
  const diff = buy - avgCost;
  box2.innerHTML =
    tile(T('rm.stoneAvgRuns'), esc(T('rm.stoneRunsV', { n: fmt(s.runsAvg) })), T('rm.stoneCostV', { c: fmtWan(Math.round(avgCost)) }), 'hl') +
    tile(T('rm.stone90Runs'), isFinite(s.runsFor90) ? esc(T('rm.stoneRunsV', { n: fmt(s.runsFor90) })) : '–', isFinite(cost90) ? T('rm.stoneCostV', { c: fmtWan(Math.round(cost90)) }) : '') +
    tile(T('rm.stonePerStone'), money(pf.costPerStone), `≈ ${fmt(Math.round(rates.coinToCrystal(pf.costPerStone, r)))} ${T('common.crystal')}`) +
    tile(T('rm.stoneBuy', { k: fmt(target) }), money(buy), fee > 0 && valueCrystal > 0 ? T(Math.abs(diff) < buy * 0.01 ? 'rm.stoneBuySame' : diff > 0 ? 'rm.stoneFarmCheaper' : 'rm.stoneBuyCheaper', { c: fmtWan(Math.abs(Math.round(diff))) }) : '');
  // 改造圖：輸入金卡一套售價，普、銀依合成比例與合成費自動對齊
  const fo = farmOpts();
  const toC = c => rates.coinToCrystal(c, r), coinOf = c => rates.crystalToCoin(c, r);
  const setSize = fo.letters ? 4 : fo.perSet;
  const co = { per: fo.per, rates: fo.rates, ns: fo.ns, sg: fo.sg, nsFee: toC(fo.nsFee), sgFee: toC(fo.sgFee), setSize, sellFee: 0.06 };
  const feeC = toC(fee), stoneRun = s.perRunMean * netCrystal;
  const be = cardSetBreakEven({ ...co, fee: feeC, stoneValue: stoneRun });
  const goldSet = Math.max(0, v('cp-gset'));
  const piece = tierPrices(goldSet / setSize, co);
  const counts = fo.rates.map(x => x * fo.per * runs);                 // N 場平均掉幾張普／銀／金
  const crys = x => (x <= 0 ? '0' : x < 10 ? fmt(x, 1) : fmt(Math.round(x)));
  const sg = c => (c > 0 ? '+' : c < 0 ? '−' : '') + fmtWan(Math.abs(Math.round(coinOf(c))));
  const toneC = x => (Math.abs(x) < 0.01 ? 'even' : x > 0 ? 'gain' : 'loss');
  $('#stone-h-cards').textContent = T('rm.cardMinTitle', { n: fmt(runs) });
  const minEl = $('#cp-min');
  minEl.className = `cp-min ${be.covered ? 'gain' : goldSet >= be.setPrice ? 'gain' : 'loss'}`;
  minEl.textContent = be.covered ? T('rm.cardCovered') : T('rm.cardMinSet', { c: fmt(Math.ceil(be.setPrice)), n: crys(be.piece.n), s: crys(be.piece.s) });
  const tierTile = (k, key, i) => tile(T('js.card.' + key), `${esc(crys(piece[k]))} <small class="unit-s">${esc(T('rm.perPiece'))}</small>`,
    T('rm.tierSub', { k: fmt(counts[i], counts[i] < 10 ? 1 : 0), c: fmtWan(Math.round(coinOf(counts[i] * piece[k] * 0.94))) }), k === 'g' ? 'hl' : '');
  $('#cp-tiers').innerHTML = tierTile('g', 'gold', 2) + tierTile('s', 'silver', 1) + tierTile('n', 'normal', 0);
  // 打 N 場：突破石＋改造圖−入場費
  const cardRun = cardIncomePerRun(goldSet / setSize, co);
  const perRun = cardRun + stoneRun - feeC, total = perRun * runs;
  const ratio = feeC > 0 ? perRun / feeC : 0;
  $('#stone-kv4').innerHTML =
    tile(T('rm.sumStone'), money(coinOf(stoneRun * runs)), T('rm.sumStoneSub', { k: fmt(s.mean, 1), v: fmt(Math.floor(netCrystal)) })) +
    tile(T('rm.sumCards'), money(coinOf(cardRun * runs)), T('rm.sumCardsSub', { c: fmt(Math.round(cardRun * runs)) })) +
    tile(T('rm.sumFee'), money(fee * runs), T('rm.sumFeeSub', { n: fmt(runs), f: fmtWan(Math.round(fee)) })) +
    tile(T('rm.sumTotal', { n: fmt(runs) }), esc(sg(total)), T('rm.cardRoi', { r: (ratio >= 0 ? '+' : '−') + fmt(Math.abs(ratio) * 100, 1) }), toneC(ratio) + ' big');
  // 有填改造圖售價時，最上方結論改看「突破石＋改造圖」的總盈虧
  if (fee > 0 && goldSet > 0) {
    const t1 = toneC(ratio);
    verdict.className = `verdict stone-verdict ${t1}`;
    verdict.innerHTML = `<b>${esc(T('rm.totalVerdict.' + t1, { p: fmtWan(Math.abs(Math.round(coinOf(perRun)))), s: sg(perRun), r: fmt(Math.abs(ratio) * 100, 1) }))}</b><span>${esc(T('rm.stoneOnly', { s: signed(pf.perRunProfit) }))}</span>`;
  }
  save();
}

// ───── B：改造期望花費 ─────
function renderTries() {
  const tier = $('#t-tier').value, pay = $('#t-pay').value;
  let from = Number($('#t-from').value), to = Number($('#t-to').value);
  if (to <= from) { to = Math.min(6, from + 1); $('#t-to').value = to; }
  const fee = TIERS[tier].fee[pay];
  let setPrice = parseAmount($('#t-set').value);
  if (!isFinite(setPrice)) setPrice = 0;
  // 改造圖價格以魔幣輸入；若用魔晶支付手續費，統一換算成魔幣比較
  const feeCoin = pay === 'crystal' ? rates.crystalToCoin(fee) : fee;
  let eTot = 0, wTot = 0, costTot = 0, worstCost = 0;
  const L = k => esc(T(k));
  const rows = [];
  for (let k = from; k < to; k++) {
    const st = REMODEL[k];
    const e = expectedTries(st.rate, st.pity);
    const stageCost = e * feeCoin + e * setPrice;              // 每次改造（成功或失敗）都會用掉一套改造圖
    const worst = st.pity * feeCoin + st.pity * setPrice;
    eTot += e; wTot += st.pity; costTot += stageCost; worstCost += worst;
    rows.push(`<tr><td data-label="${L('rm.stage')}"><b>${esc(T('rm.stageN', { n: k + 1 }))}</b> <span class="small muted">Lv${st.lv}</span></td>
      <td class="num" data-label="${L('rm.rate')}">${fmt(st.rate * 100)}%</td><td class="num" data-label="${L('rm.pity')}">${st.pity}</td>
      <td class="num" data-label="${L('rm.eTries')}">${fmt(e, 2)}</td><td class="num" data-label="${L('rm.eCost')}">${esc(fmtWan(stageCost))}</td>
      <td class="num" data-label="${L('rm.worst')}">${esc(fmtWan(worst))}</td></tr>`);
  }
  $('#t-table').innerHTML = `<thead><tr><th>${L('rm.stage')}</th><th class="num">${L('rm.rate')}</th><th class="num">${L('rm.pity')}</th><th class="num">${L('rm.eTries')}</th><th class="num">${L('rm.eCost')}</th><th class="num">${L('rm.worst')}</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  const bp = remodelPoints(tier, to) - remodelPoints(tier, from);
  const r = rates.get();
  const tile = (label, body, sub = '', hl = false) => `<div class="stat-tile${hl ? ' hl' : ''}"><span>${esc(label)}</span><b>${body}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  $('#t-kv').innerHTML =
    tile(T('rm.eTriesTotal'), esc(fmt(eTot, 2)), T('rm.worstTries', { n: wTot })) +
    tile(T('rm.eCostTotal'), esc(fmtWan(costTot)), `≈ ${fmt(rates.coinToCrystal(costTot, r), 0)} ${T('common.crystal')} · ${rates.fiatText(rates.coinToCrystal(costTot, r))}`, true) +
    tile(T('rm.worstCost'), esc(fmtWan(worstCost))) +
    tile(T('rm.bpGain'), `+${bp} BP`, T('rm.feeEach', { fee: fmt(fee), cur: T('common.' + pay) }));
  save();
}

// ───── C：市場現價 ─────
async function loadMarket(btn) {
  btn.disabled = true;
  $('#mk-out').innerHTML = `<div class="skel" style="height:120px"></div>`;
  try {
    const d = await api('market', { q: '改造圖', type: 'item' });
    const items = (d.items || []).filter(i => /改造圖/.test(i.n));
    if (!items.length) { $('#mk-out').innerHTML = emptyState('adv-look', T('noResult')); return; }
    const grade = lv => ({ 5: 'normal', 6: 'silver', 7: 'gold' }[lv] || 'normal');
    const groups = new Map();
    for (const it of items) {
      const k = it.n + '|' + it.lv;
      if (!groups.has(k)) groups.set(k, { n: it.n, g: grade(it.lv), coin: null, crystal: null, cnt: 0 });
      const g = groups.get(k);
      g.cnt += it.q || 1;
      if (it.c === 0) g.coin = g.coin == null ? it.p : Math.min(g.coin, it.p);
      else g.crystal = g.crystal == null ? it.p : Math.min(g.crystal, it.p);
    }
    const order = { gold: 0, silver: 1, normal: 2 };
    const list = [...groups.values()].sort((a, b) => order[a.g] - order[b.g] || a.n.localeCompare(b.n));
    // 若名稱以 A～D 結尾，試算一套最低價
    const sets = new Map();
    for (const g of list) {
      const m = g.n.match(/^(.*?)([A-DＡ-Ｄ])$/);
      if (!m) continue;
      const base = m[1] + '|' + g.g;
      const best = Math.min(g.coin ?? Infinity, g.crystal != null ? rates.crystalToCoin(g.crystal) : Infinity);
      if (!sets.has(base)) sets.set(base, { name: m[1], g: g.g, parts: {} });
      const s = sets.get(base);
      const L = m[2].normalize('NFKC');
      s.parts[L] = Math.min(s.parts[L] ?? Infinity, best);
    }
    const setRows = [...sets.values()].filter(s => ['A', 'B', 'C', 'D'].every(k => isFinite(s.parts[k])))
      .map(s => ({ ...s, total: ['A', 'B', 'C', 'D'].reduce((a, k) => a + s.parts[k], 0) })).sort((a, b) => a.total - b.total);
    const L = k => esc(T(k));
    $('#mk-out').innerHTML = (setRows.length ? `<div class="kv" style="margin-bottom:12px">${setRows.slice(0, 6).map(s => `<div class="stat-tile hl"><span>${esc(s.name)} · ${esc(T('card.' + s.g))}</span><b>${esc(fmtWan(s.total))}</b><small>${L('rm.setMin')} <button class="btn sm ghost" type="button" data-useset="${Math.round(s.total)}">${L('rm.useThis')}</button></small></div>`).join('')}</div>` : '') +
      `<div class="tbl-wrap cardify"><table class="tbl"><thead><tr><th>${L('market.type.item')}</th><th>${L('pet.tier')}</th><th class="num">${L('minCoin')}</th><th class="num">${L('minCrystal')}</th><th class="num">${L('qty')}</th></tr></thead><tbody>${list.map(g => `<tr><td data-label="${L('market.type.item')}" lang="zh-Hant">${esc(g.n)}</td><td data-label="${L('pet.tier')}"><span class="badge b-${g.g}">${esc(T('card.' + g.g))}</span></td><td class="num" data-label="${L('minCoin')}">${g.coin != null ? fmt(g.coin) : '–'}</td><td class="num" data-label="${L('minCrystal')}">${g.crystal != null ? fmt(g.crystal) : '–'}</td><td class="num" data-label="${L('qty')}">${fmt(g.cnt)}</td></tr>`).join('')}</tbody></table></div>`;
  } catch {
    $('#mk-out').innerHTML = `<div class="notice bad"><svg class="ic"><use href="#i-close"/></svg><span>${esc(T('error'))}</span></div>`;
  } finally { btn.disabled = false; }
}

// ───── 事件 ─────
$('#f-layer').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { setLayer(Number(b.value)); renderFarm(); renderStones(); } });
$('#s-reach').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) { setReach(Number(b.value)); renderStones(); } });
['s-runs', 's-target', 's-p2', 's-p3', 's-link', 's-fee', 's-value', 's-stonefee', 'cp-gset'].forEach(id => document.getElementById(id).addEventListener('input', debounce(renderStones, 150)));
$('#f-runs').addEventListener('input', debounce(renderStones, 200));
$('#f-cost').addEventListener('input', debounce(renderStones, 200));
['f-runs', 'f-cost', 'f-per', 'f-target', 'p-n', 'p-s', 'p-g', 'c-ns', 'c-nsf', 'c-sg', 'c-sgf', 'c-set', 'c-letters']
  .forEach(id => document.getElementById(id).addEventListener('input', debounce(() => { renderFarm(); renderStones(); }, 200)));
['t-tier', 't-from', 't-to', 't-pay', 't-set'].forEach(id => document.getElementById(id).addEventListener('input', debounce(renderTries, 100)));
$('#t-use-farm').addEventListener('click', () => { if (lastFarm?.perSet) { $('#t-set').value = Math.round(lastFarm.perSet); renderTries(); toast(T('saved')); } });
$('#mk-load').addEventListener('click', e => loadMarket(e.currentTarget));
$('#mk-out').addEventListener('click', e => { const b = e.target.closest('[data-useset]'); if (b) { $('#t-set').value = b.dataset.useset; renderTries(); $('#try-title').scrollIntoView({ behavior: 'smooth' }); } });
addEventListener('rates', () => { renderFarm(); renderStones(); renderTries(); });

load();
loadFx();
renderFarm();
renderStones();
renderTries();

// ───── 模擬刷場：一場一場隨機跑，看運氣起伏 ─────
const SIM = { busy: false, timer: 0 };
const simReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function simStop() { clearInterval(SIM.timer); SIM.timer = 0; SIM.busy = false; $('#sim-go').disabled = false; }
function simStart() {
  if (SIM.busy) return;
  const n = Math.max(1, Math.min(500, Number($('#sim-n').value) || 50));
  const o = farmOpts();
  const p2 = Math.min(100, Math.max(0, v('s-p2'))) / 100, p3 = Math.min(100, Math.max(0, v('s-p3'))) / 100;
  const per = stonePerRun(reach, p2, p3);
  const grid = $('#sim-grid'); grid.innerHTML = ''; grid.dataset.n = String(n);
  const tally = { n: 0, s: 0, g: 0, stones: 0, runs: 0 };
  SIM.busy = true; $('#sim-go').disabled = true;
  const step = () => {
    tally.runs++;
    const k = Math.floor(o.per) + (Math.random() < o.per % 1 ? 1 : 0);
    let best = -1, cn = 0, cs = 0, cg = 0;
    for (let i = 0; i < k; i++) {
      const r = Math.random();
      const t = r < o.rates[2] ? 2 : r < o.rates[2] + o.rates[1] ? 1 : 0;
      if (t === 0) cn++; else if (t === 1) cs++; else cg++;
      best = Math.max(best, t);
    }
    const st = (reach >= 2 && Math.random() < p2 ? 1 : 0) + (reach >= 3 && Math.random() < p3 ? 1 : 0);
    tally.n += cn; tally.s += cs; tally.g += cg; tally.stones += st;
    const cell = document.createElement('i');
    cell.className = 'sr' + (best === 2 ? ' g' : best === 1 ? ' s' : best === 0 ? ' n' : ' z') + (st ? ' x' : '');
    cell.title = `#${tally.runs}：${T('rm.tier.normal')} ${cn}・${T('rm.tier.silver')} ${cs}・${T('rm.tier.gold')} ${cg}${st ? `・${T('rm.simStone')} ${st}` : ''}`;
    if (st) cell.textContent = st > 1 ? '◆◆' : '◆';
    grid.appendChild(cell);
    simRender(tally, o, per, n, false);
    if (tally.runs >= n) { simStop(); simRender(tally, o, per, n, true); }
  };
  if (simReduced) { while (tally.runs < n) step(); return; }
  SIM.timer = setInterval(step, n > 100 ? 25 : 45);
}
function simRender(t, o, per, n, done) {
  const c = craft(t.n, t.s, t.g, o.target, o);
  const expCards = expected({ ...o, runs: t.runs });
  const fees = c.crafts1 * o.nsFee + c.crafts2 * o.sgFee;
  const cost = t.runs * o.runCost + fees;
  const tier = T('rm.tier.' + o.target);
  const tile = (k, body, sub = '') => `<div class="stat-tile"><span>${esc(k)}</span><b>${body}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  $('#sim-kv').innerHTML =
    tile(T('rm.simCards'), `<span class="t-n">${fmt(t.n)}</span> / <span class="t-s">${fmt(t.s)}</span> / <span class="t-g">${fmt(t.g)}</span>`, T('rm.simExp', { n: `${fmt(expCards.n, 1)} / ${fmt(expCards.s, 1)} / ${fmt(expCards.g, 1)}` })) +
    tile(T('rm.simTarget', { t: tier }), fmt(c.count), T('rm.simExp', { n: fmt(expCards.target, 1) })) +
    tile(T('rm.simStones'), fmt(t.stones), T('rm.simExp', { n: fmt(per.mean * t.runs, 1) })) +
    tile(T('rm.simCost'), fmtWan(cost));
  const vd = $('#sim-verdict');
  if (!done) { vd.textContent = T('rm.simRunning', { i: t.runs, n }); vd.className = 'sim-verdict'; return; }
  // 運氣：目標卡等張數（含突破石加權）對期望值
  const act = c.count + t.stones * 3, exp = expCards.target + per.mean * t.runs * 3;
  const ratio = exp > 0 ? act / exp : 1;
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  // 五段：歐皇 ≥150%、小歐 110～149%、普通 90～109%、小非 51～89%、非酋 ≤50%（樣本太少時一律算普通）
  const kind = exp < 2 ? 'normal' : ratio >= 1.5 ? 'lucky' : ratio >= 1.1 ? 'good' : ratio > 0.9 ? 'normal' : ratio > 0.5 ? 'bad' : 'unlucky';
  vd.textContent = T({ lucky: 'rm.simLucky', good: 'rm.simGood', normal: 'rm.simNormal', bad: 'rm.simBad', unlucky: 'rm.simUnlucky' }[kind], { p: kind === 'normal' ? Math.round(ratio * 100) : pct });
  vd.className = 'sim-verdict ' + kind;
  track('remodel.sim'); if (kind === 'lucky') track('remodel.lucky'); if (kind === 'unlucky') track('remodel.unlucky');
}
$('#sim-go').addEventListener('click', simStart);
$('#sim-reset').addEventListener('click', () => { simStop(); $('#sim-grid').innerHTML = ''; $('#sim-kv').innerHTML = ''; $('#sim-verdict').textContent = ''; });
