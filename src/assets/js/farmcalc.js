// 魔物幻境刷改造圖：期望值與蒙地卡羅模擬（純函式）
// 規則：每張卡依機率決定卡等（普／銀／金），編號 A～D 均等；
//       合成只在「同編號」之間進行：普 → 銀（預設 3:1）、銀 → 金（預設 4:1），每次合成收手續費。
//       一套改造圖＝A、B、C、D 各一張（同卡等）。

export const LAYERS = {
  1: [1, 0, 0],
  2: [0.8, 0.2, 0],
  3: [0.6, 0.32, 0.08],
};

/** 依目標卡等，把一組（普、銀、金）卡片數量合成到目標卡等 */
export function craft(n, s, g, target, o) {
  let crafts1 = 0, crafts2 = 0;
  if (target === 'normal') return { count: n, crafts1, crafts2 };
  crafts1 = Math.floor(n / o.ns);
  const silver = s + crafts1;
  if (target === 'silver') return { count: silver, crafts1, crafts2 };
  crafts2 = Math.floor(silver / o.sg);
  return { count: g + crafts2, crafts1, crafts2 };
}

/** 期望值（不考慮編號分布，用平均值估算） */
export function expected(o) {
  const cards = o.runs * o.per;
  const [pn, ps, pg] = o.rates;
  const n = cards * pn, s = cards * ps, g = cards * pg;
  const c = craft(n, s, g, o.target, o);
  const fees = c.crafts1 * o.nsFee + c.crafts2 * o.sgFee;
  const sets = Math.floor(c.count / o.perSet);
  return { cards, n, s, g, target: c.count, sets, fees, cost: o.runs * o.runCost + fees };
}

// 二項分佈抽樣（n 大時用常態近似）
function binom(n, p, rng) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n < 60) { let k = 0; for (let i = 0; i < n; i++) if (rng() < p) k++; return k; }
  const mu = n * p, sd = Math.sqrt(n * p * (1 - p));
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(0, Math.min(n, Math.round(mu + sd * z)));
}

/** 蒙地卡羅：回傳可湊套數的分佈 */
export function simulate(o, iters = 4000, rng = Math.random) {
  const cards = Math.round(o.runs * o.per);
  const letters = o.letters ? 4 : 1;
  const cells = [];
  for (let t = 0; t < 3; t++) for (let l = 0; l < letters; l++) cells.push(o.rates[t] / letters);
  const sets = new Array(iters);
  let feeSum = 0, targetSum = 0;
  for (let it = 0; it < iters; it++) {
    // 多項分佈：依序用條件二項抽樣
    let remain = cards, pRemain = 1;
    const cnt = new Array(cells.length);
    for (let k = 0; k < cells.length; k++) {
      const p = pRemain > 0 ? Math.min(1, cells[k] / pRemain) : 0;
      cnt[k] = k === cells.length - 1 ? remain : binom(remain, p, rng);
      remain -= cnt[k]; pRemain -= cells[k];
    }
    let fees = 0, minPerLetter = Infinity, total = 0;
    for (let l = 0; l < letters; l++) {
      const c = craft(cnt[l], cnt[letters + l], cnt[2 * letters + l], o.target, o);
      fees += c.crafts1 * o.nsFee + c.crafts2 * o.sgFee;
      minPerLetter = Math.min(minPerLetter, c.count);
      total += c.count;
    }
    sets[it] = o.letters ? minPerLetter : Math.floor(total / o.perSet);
    feeSum += fees; targetSum += total;
  }
  sets.sort((a, b) => a - b);
  const q = p => sets[Math.min(iters - 1, Math.floor(p * (iters - 1)))];
  const mean = sets.reduce((a, b) => a + b, 0) / iters;
  return { sets, mean, p10: q(0.1), p50: q(0.5), p90: q(0.9), fees: feeSum / iters, targetMean: targetSum / iters, zero: sets.filter(v => v === 0).length / iters };
}

// ───── 技能突破石 ─────
// 第二層、第三層首領各自獨立判定掉落（預設 5%、15%）。打到第三層＝第二層與第三層各判定一次。
export function stonePerRun(reach, p2 = 0.05, p3 = 0.15) {
  const a = reach >= 2 ? p2 : 0, b = reach >= 3 ? p3 : 0;
  return { q0: (1 - a) * (1 - b), q1: a * (1 - b) + (1 - a) * b, q2: a * b, mean: a + b };
}

/** n 場的掉落顆數分佈（陣列索引＝顆數） */
export function stoneDist(n, per) {
  let d = new Float64Array(1); d[0] = 1;
  for (let i = 0; i < n; i++) {
    const nd = new Float64Array(d.length + 2);
    for (let k = 0; k < d.length; k++) {
      const v = d[k];
      if (v < 1e-300) continue;
      nd[k] += v * per.q0; nd[k + 1] += v * per.q1; nd[k + 2] += v * per.q2;
    }
    d = nd;
  }
  return d;
}

/** 摘要：期望、八成區間、至少 1 顆、至少 K 顆的機率、90% 把握拿到 K 顆要幾場 */
export function stoneSummary(runs, reach, p2, p3, target = 1) {
  const per = stonePerRun(reach, p2, p3);
  const n = Math.max(0, Math.floor(runs));
  const out = { per, mean: per.mean * n, perRunMean: per.mean, runsPerStone: per.mean > 0 ? 1 / per.mean : Infinity };
  if (per.mean <= 0) return { ...out, atLeast1: 0, atLeastK: 0, atLeast: k => (k <= 0 ? 1 : 0), p10: 0, p90: 0, runsFor50: Infinity, runsFor90: Infinity, runsAvg: Infinity };
  let cdf;
  if (n <= 3000) {
    const d = stoneDist(n, per);
    const acc = []; let s = 0;
    for (let k = 0; k < d.length; k++) { s += d[k]; acc.push(s); }
    cdf = k => (k < 0 ? 0 : k >= acc.length ? 1 : acc[k]);
  } else {
    const varOne = per.q1 + 4 * per.q2 - per.mean ** 2;
    const mu = per.mean * n, sd = Math.sqrt(varOne * n);
    const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
    cdf = k => phi((k + 0.5 - mu) / sd);
  }
  const quant = q => { let k = 0; while (cdf(k) < q && k < 4 * n + 2) k++; return k; };
  // 湊到 target 顆要幾場：一半機會（runsFor50）、九成把握（runsFor90），逐場累加分佈
  let runsFor50 = Infinity, runsFor90 = Infinity;
  if (target > 0) {
    const varOne = per.q1 + 4 * per.q2 - per.mean ** 2;
    // 常態近似：n·μ − z·√(n·σ²) ≥ target − 0.5 的最小 n
    const approx = z => Math.ceil(((z * Math.sqrt(varOne) + Math.sqrt(z * z * varOne + 4 * per.mean * (target - 0.5))) / (2 * per.mean)) ** 2);
    let d = new Float64Array(1); d[0] = 1;
    for (let i = 1; i <= 20000; i++) {
      const nd = new Float64Array(d.length + 2);
      for (let k = 0; k < d.length; k++) { const v = d[k]; nd[k] += v * per.q0; nd[k + 1] += v * per.q1; nd[k + 2] += v * per.q2; }
      d = nd;
      let below = 0;
      for (let k = 0; k < Math.min(target, d.length); k++) below += d[k];
      if (runsFor50 === Infinity && 1 - below >= 0.5) runsFor50 = i;
      if (1 - below >= 0.9) { runsFor90 = i; break; }
      if (d.length > 4000) { // 大量時改用常態近似估算
        if (runsFor50 === Infinity) runsFor50 = approx(0);
        runsFor90 = approx(1.2816);
        break;
      }
    }
  }
  // 平均要打幾場（期望值）＝目標顆數 ÷ 每場平均
  const runsAvg = target > 0 ? Math.ceil(target / per.mean - 1e-9) : 0;
  return { ...out, atLeast1: 1 - cdf(0), atLeastK: 1 - cdf(target - 1), atLeast: k => (k <= 0 ? 1 : 1 - cdf(k - 1)), p10: quant(0.1), p90: quant(0.9), runsFor50, runsFor90, runsAvg };
}

function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/**
 * 突破石划不划算：入場費（魔幣）對比掉落的突破石價值（換成魔幣）
 * s＝stoneSummary 的結果；fee＝每場入場費；value＝每顆價值（魔幣）
 */
export function stoneProfit(s, runs, fee, value) {
  const n = Math.max(0, Math.floor(runs));
  const cost = n * fee, worth = s.mean * value;
  const perRunWorth = s.perRunMean * value;
  const needStones = value > 0 ? Math.ceil(cost / value - 1e-9) : Infinity;   // 要掉幾顆才回本
  return {
    cost, worth, profit: worth - cost, perRunProfit: perRunWorth - fee,
    needStones, breakEvenProb: isFinite(needStones) ? s.atLeast(needStones) : 0,
    costPerStone: s.perRunMean > 0 ? fee / s.perRunMean : Infinity,             // 自己打，每顆平均成本
    breakEvenValue: s.perRunMean > 0 ? fee / s.perRunMean : Infinity,           // 每顆要值多少才打平
    roi: cost > 0 ? (worth - cost) / cost : 0,
  };
}

/**
 * 改造圖售價：依金卡售價自動換算普、銀（照合成比例與合成手續費）
 * 1 金＝sg 張銀＋金合成費 → 銀＝(金−sgFee)÷sg；1 銀＝ns 張普＋銀合成費 → 普＝(銀−nsFee)÷ns
 * 金額一律以魔晶計，回傳每張的價格。
 */
export function tierPrices(goldPiece, { ns = 3, sg = 4, nsFee = 0, sgFee = 0 } = {}) {
  const g = Math.max(0, goldPiece);
  const s = Math.max(0, (g - sgFee) / sg);
  const n = Math.max(0, (s - nsFee) / ns);
  return { n, s, g };
}
/** 每場改造圖收入（扣掉擺攤手續費 sellFee 後實拿） */
export function cardIncomePerRun(goldPiece, o) {
  const p = tierPrices(goldPiece, o);
  const [rn, rs, rg] = o.rates;
  return o.per * (1 - (o.sellFee ?? 0.06)) * (rn * p.n + rs * p.s + rg * p.g);
}
/**
 * 金改造圖一套最低賣多少才不虧：入場費扣掉突破石價值後，剩下靠改造圖補回
 * o：fee（每場入場費）、stoneValue（每場突破石價值）、per、rates、ns、sg、nsFee、sgFee、setSize、sellFee
 */
export function cardSetBreakEven(o) {
  const need = o.fee - o.stoneValue;
  if (need <= 0) return { need, covered: true, setPrice: 0, piece: tierPrices(0, o) };
  let lo = 0, hi = 1;
  while (cardIncomePerRun(hi, o) < need && hi < 1e12) hi *= 2;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (cardIncomePerRun(m, o) >= need) hi = m; else lo = m; }
  return { need, covered: false, setPrice: hi * (o.setSize || 4), piece: tierPrices(hi, o) };
}
