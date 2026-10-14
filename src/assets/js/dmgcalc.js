// 傷害計算（純函式，瀏覽器與 Node 測試共用）
// 依據：魔力寶貝原廠傷害公式、星詠魔力 gamerch「魔法精神理論」與「寵物須知／改造」公布的倍率，
//       以及玩家社群實測整理的魔法基礎傷害與技能倍率。

// ───── 物理 ─────
export const SOFT_CAP = 240;          // 攻擊／防禦超過 240 的部分只算 30%
export const SOFT_RATE = 0.3;
export const RAND = { min: 0.9, avg: 1, max: 1.1 };

export const WEAPON = { none: 0, weapon: 0.15 };
// 水晶屬性（攻擊方水晶對防禦方屬性）
export const CRYSTAL = [
  ['full', 0.30], ['half', 0.15], ['all2', 0.06], ['none', 0], ['all3', -0.06], ['halfRev', -0.15], ['all4', -0.18], ['fullRev', -0.30], ['all5', -0.30],
];
// 種族剋制
export const RACE = [['full', 0.20], ['half', 0.10], ['none', 0], ['halfRev', -0.10], ['fullRev', -0.20]];
// 寵物加成（依卡等）
export const PET_FULL = { normal: 0.10, silver: 0.15, gold: 0.20 };          // 滿檔加乘（PVE）
export const PET_BEAST = { normal: 0.03, silver: 0.05, gold: 0.08 };         // 野獸系被動
export const PET_REMODEL = [                                                  // 改造後首領戰增傷
  { normal: 0, silver: 0, gold: 0 },
  { normal: 0.06, silver: 0.09, gold: 0.13 },
  { normal: 0.09, silver: 0.13, gold: 0.18 },
  { normal: 0.12, silver: 0.17, gold: 0.23 },
  { normal: 0.16, silver: 0.22, gold: 0.29 },
  { normal: 0.20, silver: 0.27, gold: 0.35 },
];

export const effective = v => (v <= SOFT_CAP ? v : SOFT_CAP + SOFT_RATE * (v - SOFT_CAP));

/**
 * 物理傷害
 * @param o { atk, def, atkLv, defLv, weapon, crystal, race, skill(倍率, 1=100%), pet: { tier, full, remodel, beast } | null }
 * @returns { atkE, defE, base, crit, cases: { normal, crit, boss, bossCrit }（各含 min/avg/max）}
 */
export function physical(o) {
  const atkE = effective(Math.max(0, o.atk || 0));
  const defE = effective(Math.max(0, o.def || 0));
  const base = atkE > 0 ? (atkE * atkE * 3) / (atkE + defE * 3) : 0;
  const crit = (Math.max(0, o.def || 0) * Math.max(1, o.atkLv || 1)) / (Math.max(1, o.defLv || 1) * 2);
  const p = o.pet;
  const full = p?.full ? PET_FULL[p.tier] || 0 : 0;
  const beast = p?.beast ? PET_BEAST[p.tier] || 0 : 0;
  const remodel = p ? PET_REMODEL[p.remodel || 0]?.[p.tier] || 0 : 0;
  const pre = base * (1 + (o.weapon || 0)) * (1 + (o.crystal || 0));
  const calc = (withCrit, boss, skill) => {
    const mult = (1 + (o.race || 0)) * skill * (1 + full) * (1 + beast) * (boss ? 1 + remodel : 1);
    const one = r => Math.max(0, Math.floor((pre * r + (withCrit ? crit : 0)) * mult));
    return { min: one(RAND.min), avg: one(RAND.avg), max: one(RAND.max) };
  };
  const skill = o.skill ?? 1;
  return {
    atkE, defE, base, crit, mods: { full, beast, remodel },
    attack: { normal: calc(false, false, 1), crit: calc(true, false, 1), boss: calc(false, true, 1), bossCrit: calc(true, true, 1) },
    skill: { normal: calc(false, false, skill), crit: calc(true, false, skill), boss: calc(false, true, skill), bossCrit: calc(true, true, skill) },
  };
}

// ───── 技能倍率（％）─────
export const SKILL_QIANKUN = lv => 100 + lv * 10;                  // 乾坤一擊
export const SKILL_HUIXUAN = { 1: [56, 70, 84], 2: [60, 75, 90], 3: [64, 80, 96], 4: [68, 85, 102], 5: [72, 90, 108], 6: [76, 95, 114],
  7: [80, 100, 120], 8: [84, 105, 126], 9: [88, 110, 132], 10: [92, 115, 138], 11: [96, 120, 144] };   // 迴旋：等級 × 第幾刀
export const SKILL_ZHUIYUE = { 1: 70, 2: 75, 3: 80, 4: 85, 5: 75, 6: 78, 7: 81, 8: 85, 9: 75, 10: 80, 11: 95 };
export const zhuiyuePve = lv => (lv >= 11 ? 45 : 20 + lv * 2);      // 追月對怪物額外加成

// ───── 魔法 ─────
export const MAGIC_BASE = {
  char: {
    single: [95, 171, 239, 303, 368, 432, 497, 570, 646, 722, 791],
    strong: [57, 103, 143, 182, 221, 259, 298, 342, 388, 433, 475],
    super: [38, 68, 96, 121, 147, 173, 199, 228, 258, 289, 316],
    drain: [63, 114, 159, 202, 245, 288, 331, 380, 430, 481, 522],
  },
  pet: {
    single: [86, 154, 215, 273, 331, 389, 447, 513, 581, 650],
    strong: [51, 93, 129, 164, 199, 233, 268, 307, 349, 390],
  },
};
export const EX_RATE = 1.13;                           // 寵物 EX 法＝10 級 × 1.13
export const MAGIC_RAND = { min: 0.85, avg: 1, max: 1.15 };
export const PET_PVE = 1.2;                            // 寵物魔法打怪 ×1.2

/** 需求精神：103 + 等級 × 20 */
export const requiredSpirit = lv => 103 + lv * 20;

/** 精神差距倍率（gamerch「魔法精神理論」）；寵物最低 36% */
export function spiritGapRate(caster, target, isPet = false) {
  if (!(target > 0)) return 1;
  const d = ((caster - target) / target) * 100;
  let r;
  if (d >= 20) r = 1; else if (d >= 14) r = 0.9; else if (d >= 5) r = 0.82; else if (d >= 2) r = 0.63;
  else if (d >= -10) r = 0.55; else if (d >= -20) r = 0.36; else if (d >= -30) r = 0.27; else r = 0.09;
  return isPet ? Math.max(r, 0.36) : r;
}

/** 法杖魔攻係數：等級 n 時，魔攻 30n−20 為 100%，34n−20 為 150%，中間線性 */
export function staffRate(matk, lv) {
  if (!(matk > 0)) return 1;
  const lo = 30 * lv - 20, hi = 34 * lv - 20;
  if (matk >= hi) return 1.5;
  if (matk <= lo) return 1;
  return 1 + 0.5 * ((matk - lo) / (hi - lo));
}

/**
 * 魔法傷害
 * @param o { caster:'char'|'pet', type, level(1..11 | 'ex'), spirit, targetSpirit, matk, crystal, race, insight(%), pve, pet:{tier,full,remodel,beast} }
 */
export function magic(o) {
  const isPet = o.caster === 'pet';
  const isEx = o.level === 'ex';
  const lv = isEx ? 10 : Math.max(1, Number(o.level) || 1);
  const table = MAGIC_BASE[isPet ? 'pet' : 'char'][o.type] || MAGIC_BASE[isPet ? 'pet' : 'char'].single;
  let base = table[Math.min(table.length, lv) - 1];
  if (isEx && isPet) base = Math.round(table[9] * EX_RATE);
  const need = requiredSpirit(lv);
  const spiritRate = (o.spirit || 0) >= need ? 1 : Math.max(0, (o.spirit || 0) / need);
  const gapRate = spiritGapRate(o.spirit || 0, o.targetSpirit || 0, isPet);
  const staff = isPet ? 1 : staffRate(o.matk || 0, lv);
  const p = isPet ? o.pet : null;
  const full = p?.full ? PET_FULL[p.tier] || 0 : 0;
  const beast = p?.beast ? PET_BEAST[p.tier] || 0 : 0;
  const remodel = p ? PET_REMODEL[p.remodel || 0]?.[p.tier] || 0 : 0;
  const insight = 1 - Math.min(100, Math.max(0, o.insight || 0)) / 100;
  const core = base * (1 + (o.crystal || 0)) * spiritRate * gapRate * staff * (1 + full) * (1 + beast) * insight;
  const scene = (raceMul, pve, boss) => {
    const m = raceMul * pve * (boss ? 1 + remodel : 1);
    const one = r => Math.max(0, Math.floor(core * r * m));
    return { min: one(MAGIC_RAND.min), avg: one(MAGIC_RAND.avg), max: one(MAGIC_RAND.max) };
  };
  const pveMul = isPet && o.pve ? PET_PVE : 1;
  return {
    base, need, spiritRate, gapRate, staff, mods: { full, beast, remodel },
    field: scene(1 + (o.race || 0), pveMul, false),       // 野外打怪
    pk: scene(1 + (o.race || 0) / 2, 1, false),           // PK：種族效果減半、無 PVE 加成
    boss: scene(1 + (o.race || 0), pveMul, true),         // 首領戰：含改造增傷
  };
}
