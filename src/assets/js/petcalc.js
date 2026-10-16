// 寵物能力計算（純函式，瀏覽器與 Node 測試共用）
// 公式依據：魔力寶貝原廠設定（星詠魔力 gamerch 攻略「寵物須知」「寵物洗檔、升星、改造」）
//   BP        ＝（實際檔次 ＋ 隨機檔）× 0.2 ＋ 實際檔次 ÷ 24 × 等級
//              （成長算滿等級數，不是 Lv−1：2026-10 用遊戲內 Lv140 赤焰年獸 5 改的 7 項能力與評分 4472 實測校正，
//               用 Lv−1 會整體少約 5 BP、評分少 20）
//   自由配點  ＝ Lv−1 ＋ 改造點數
//   能力值    ＝ 基礎值 ＋ Σ BP × 係數（下方矩陣）；遊戲畫面顯示無條件捨去的整數，評分用未捨去的值

export const BP_INIT_RATE = 0.2;
export const GROWTH_DIV = 24;
export const RAND_TOTAL_MAX = 10;
export const DROP_PER_STAT_MAX = 4;
export const DROP_TOTAL_MAX = 20;
export const MAX_STAR = 25;
export const STAT_KEYS = ['hp', 'mp', 'atk', 'def', 'agi', 'spt', 'rec'];
export const STAT_BASE = { hp: 20, mp: 20, atk: 20, def: 20, agi: 20, spt: 100, rec: 100 };
// 列：能力；欄：體力、力量、強度、速度、魔法
export const STAT_MATRIX = {
  hp: [8, 2, 3, 3, 1],
  mp: [1, 2, 2, 2, 10],
  atk: [0.2, 2.7, 0.3, 0.3, 0.2],
  def: [0.2, 0.3, 3, 0.3, 0.2],
  agi: [0.1, 0.2, 0.2, 2, 0.1],
  spt: [-0.3, -0.1, 0.2, -0.1, 0.8],
  rec: [0.8, -0.1, -0.1, 0.2, -0.3],
};
// 卡等：基礎總檔、升星後目標總檔、每次改造 BP、評分滿欄加成、改造花費
export const TIERS = {
  '金': { key: 'gold', base: 104, target: 129, remodelBp: 8, fullBonus: 100, fee: { coin: 875000, crystal: 5000 }, fixCap: 20 },
  '銀': { key: 'silver', base: 102, target: 127, remodelBp: 7, fullBonus: 80, fee: { coin: 175000, crystal: 1000 }, fixCap: 15 },
  '普': { key: 'normal', base: 100, target: 125, remodelBp: 6, fullBonus: 60, fee: { coin: 35000, crystal: 200 }, fixCap: 10 },
};
// 改造：第 1～6 次的成功率、保底次數（失敗 N−1 次後第 N 次必成）、等級需求
export const REMODEL = [
  { rate: 1.0, pity: 1, lv: 80 },
  { rate: 0.75, pity: 3, lv: 90 },
  { rate: 0.5, pity: 5, lv: 100 },
  { rate: 0.25, pity: 9, lv: 110 },
  { rate: 0.15, pity: 13, lv: 120 },
  { rate: 0.10, pity: 15, lv: 130 },
];
// 第 6 次改造：各卡等固定 +8 BP
export const REMODEL_MAX = 6;
export const REMODEL_BP6 = 8;
export const remodelLv = n => (REMODEL[Math.min(n, REMODEL.length) - 1] || REMODEL[REMODEL.length - 1]).lv;
/** 改造帶來的自由點數：1～5 次依卡等每次 +6/7/8，第 6 次固定 +8 */
export function remodelPoints(tier, remodelCount) {
  const t = TIERS[tier];
  const n = Math.max(0, Math.min(REMODEL_MAX, remodelCount | 0));
  return (t ? t.remodelBp * Math.min(n, 5) : 0) + (n > 5 ? REMODEL_BP6 * (n - 5) : 0);
}
export const SKILL_WEIGHT = { 6: 10, 7: 30, 8: 60, 9: 100, 10: 150 };
export const PET_ALLOC_POWERS = [64 ** 4, 64 ** 3, 64 ** 2, 64, 1];

export function tierOf(cardTier) {
  const s = String(cardTier || '');
  return s.includes('金') ? '金' : s.includes('銀') ? '銀' : s.includes('普') ? '普' : '';
}
const r2 = v => Math.round(v * 100) / 100;
const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);

/** 依卡等滿星時每項增加的檔次（平均分配，與遊戲升星後總檔一致） */
export function maxStarAdd(pet) {
  const t = TIERS[tierOf(pet.cardTier)];
  if (!t) return [0, 0, 0, 0, 0];
  const missing = Math.max(0, t.target - sum(pet.bp || [pet.hp, pet.power, pet.defense, pet.speed, pet.magic]));
  return Array(5).fill(r2(missing / 5));
}

/** 不含自由配點的 BP（等級成長部分） */
export function baseBp({ ranks, rand, level }) {
  return ranks.map((r, i) => r * BP_INIT_RATE + (rand[i] || 0) * BP_INIT_RATE + (r / GROWTH_DIV) * level);
}

/** 自由點數上限：升級（Lv−1）＋ 改造 BP */
export function freePoints(level, tier, remodelCount) {
  return Math.max(0, level - 1) + remodelPoints(tier, remodelCount);
}

/**
 * 依規則修正配點：
 *  ① 單項 BP 不能超過其他四項 BP 總和（＝不超過總 BP 的一半）
 *  ② 總配點不能超過可用點數
 */
export function capManual(bpBase, manual, limit) {
  const m = manual.map(v => Math.max(0, Math.floor(Number(v) || 0)));
  const caps = bpBase.map((b, i) => {
    let others = 0;
    for (let j = 0; j < 5; j++) if (j !== i) others += bpBase[j] + m[j];
    return Math.max(0, Math.floor(others - b));
  });
  let capped = m.map((v, i) => Math.min(v, caps[i]));
  let used = sum(capped);
  if (used > limit) {
    let run = 0;
    capped = capped.map(v => { const c = Math.min(v, Math.max(0, limit - run)); run += c; return c; });
    used = run;
  }
  return { capped, caps, used };
}

/** BP → 七項能力 */
export function statsFromBp(bp) {
  const out = {};
  for (const k of STAT_KEYS) {
    let v = STAT_BASE[k];
    for (let j = 0; j < 5; j++) v += bp[j] * STAT_MATRIX[k][j];
    out[k] = r2(v);
  }
  return out;
}

/**
 * 完整試算
 * @param {object} o { base[5]（圖鑑檔次）, starAdd[5], drop[5]（正數）, rand[5], level, tier, remodel, manual[5], extra[5] }
 */
export function simulate(o) {
  const ranks = o.base.map((b, i) => b + (o.starAdd?.[i] || 0) - Math.abs(o.drop?.[i] || 0));
  const level = Math.max(1, Math.floor(o.level || 1));
  const bpGrow = baseBp({ ranks, rand: o.rand || [0, 0, 0, 0, 0], level });
  const limit = freePoints(level, o.tier, o.remodel || 0);
  const { capped, caps, used } = capManual(bpGrow, o.manual || [0, 0, 0, 0, 0], limit);
  const bp = bpGrow.map((b, i) => r2(b + capped[i] + (Number(o.extra?.[i]) || 0)));
  return { ranks: ranks.map(r2), bp, bpGrow: bpGrow.map(r2), manual: capped, caps, used, limit, stats: statsFromBp(bp) };
}

/** 寵物評分（估算）：攻略站公布公式 */
export function petScore(stats, { level = 1, slots = 6, tier = '', fullSlot = false } = {}) {
  const base = (stats.hp * 0.985 + stats.mp * 0.522 + stats.atk * 3.21 + stats.def * 1.71 + stats.agi * 2.9 + stats.spt * 7 + stats.rec * 5) / 3;
  const skill = Math.floor(((SKILL_WEIGHT[slots] || 0) / 100) * level);
  const full = fullSlot && TIERS[tier] ? TIERS[tier].fullBonus : 0;
  return { total: Math.floor(base) + skill + full, base: Math.floor(base), skill, full };
}

/** 市場寵物 AllocPoint（64 進位壓縮的五項檔次）解碼 */
export function decodeAlloc(point) {
  const n = Math.floor(Number(String(point ?? '').replace(/,/g, '')) || 0);
  if (n <= 0) return [0, 0, 0, 0, 0];
  let rest = n;
  return PET_ALLOC_POWERS.map(p => { const v = Math.floor(rest / p); rest -= v * p; return v; });
}

/** 市場寵物與圖鑑比對：掉檔、星數、技能欄 */
export function gradeMeta(guidePet, allocBase, allocStar, slots) {
  if (!guidePet) return null;
  const t = TIERS[tierOf(guidePet.cardTier)];
  const perfect = guidePet.bp || [guidePet.hp, guidePet.power, guidePet.defense, guidePet.speed, guidePet.magic];
  const hasBase = allocBase && sum(allocBase) > 0;
  const drop = hasBase ? perfect.reduce((d, p, i) => d + Math.max(0, p - (allocBase[i] || 0)), 0) : null;
  const bornStar = t ? Math.max(0, Math.round(sum(perfect) - t.base)) : null;
  const starUp = allocStar ? sum(allocStar) : 0;
  const totalStar = bornStar == null ? null : Math.min(MAX_STAR, bornStar + starUp);
  const skillDrop = slots != null && guidePet.skillSlots ? Math.max(0, guidePet.skillSlots - Number(slots)) : null;
  return { drop, full: drop === 0, bornStar, starUp, totalStar, maxStar: totalStar != null && totalStar >= MAX_STAR, skillDrop };
}

/** 改造第 n 次（0 起算）的期望嘗試次數：Σ_{k=0}^{pity-1} (1-p)^k */
export function expectedTries(rate, pity) {
  if (rate >= 1) return 1;
  let e = 0;
  for (let k = 0; k < pity; k++) e += (1 - rate) ** k;
  return e;
}
