// 傷害計算（純函式，瀏覽器與 Node 測試共用）
// 依據：魔力寶貝原廠傷害公式（御劍軒 cgsword.com「物理傷害計算」「屬性相剋計算器」）、
//       星詠魔力攻略網 guide.starcg.net「物理攻擊技能」「職業專屬技能」「寵物技能」的技能倍率、
//       星詠魔力 gamerch「魔法精神理論」與「寵物須知／改造」公布的倍率，以及玩家社群實測整理的魔法基礎傷害。

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
  { normal: 0.25, silver: 0.33, gold: 0.42 },   // 第 6 次：金卡 42% 為遊戲內數值；普、銀依前五次的級距推估
];

export const effective = v => (v <= SOFT_CAP ? v : SOFT_CAP + SOFT_RATE * (v - SOFT_CAP));

// ───── 屬性相剋（cgsword.com/propCal.html）─────
// 地剋水、水剋火、火剋風、風剋地。每種屬性 0～10 格（歌姬等特殊角色單一屬性可到 12 格）。
// 分數 ＝ Σ［（攻方第 i 屬性 − 守方第 i 屬性）× 10 ＋ 攻方第 i 屬性 ×（守方下一屬性 − 守方上一屬性）］；倍率 ＝ 1 ＋ 分數 × 0.3%
export const ELEMS = ['earth', 'water', 'fire', 'wind'];
export function elementScore(a, d) {
  let s = 0;
  for (let i = 0; i < 4; i++) s += ((a[i] || 0) - (d[i] || 0)) * 10 + (a[i] || 0) * ((d[(i + 1) % 4] || 0) - (d[(i + 3) % 4] || 0));
  return s;
}
export const elementMult = (a, d) => 1 + elementScore(a, d) * 0.003;

// ───── 種族相剋（cgsword.com/HurtCalc.htm）：[全剋, 半剋] ─────
export const RACES = ['human', 'dragon', 'undead', 'flying', 'insect', 'plant', 'beast', 'special', 'metal', 'evil'];
export const RACE_BEATS = {
  dragon: ['flying', 'beast'], flying: ['insect', 'undead'], insect: ['special', 'plant'], special: ['metal', 'dragon'], metal: ['dragon', 'human'],
  undead: ['human', 'metal'], human: ['beast', 'insect'], beast: ['plant', 'flying'], plant: ['undead', 'special'],
};
/** 攻方種族對守方種族的關係：full／half／none／halfRev／fullRev（邪魔系剋所有種族） */
export function raceRelation(a, d) {
  if (!a || !d) return null;
  if (a === 'evil') return d === 'evil' ? 'none' : 'full';
  if (d === 'evil') return 'none';
  const [f, h] = RACE_BEATS[a] || [], [rf, rh] = RACE_BEATS[d] || [];
  if (f === d) return 'full'; if (h === d) return 'half';
  if (rf === a) return 'fullRev'; if (rh === a) return 'halfRev';
  return 'none';
}

/**
 * 物理傷害
 * @param o { atk, def, atkLv, defLv, weapon, crystal, race, skill(倍率, 1=100%), atkUp（諸刃等攻擊力加成，0.7=+70%）, defDown（陽炎等防禦降低）, hits（段數）, pet: { tier, full, remodel, beast } | null }
 * @returns { atkE, defE, base, crit, cases: { normal, crit, boss, bossCrit }（各含 min/avg/max）}
 */
export function physical(o) {
  // 諸刃／迅速果斷提高的是攻擊力本身（在 240 軟上限之前）；陽炎、諸刃讓防禦方的防禦力下降
  const atk = Math.max(0, o.atk || 0) * (1 + (o.atkUp || 0));
  const def = Math.max(0, o.def || 0) * Math.max(0, 1 - (o.defDown || 0));
  const atkE = effective(atk);
  const defE = effective(def);
  const base = atkE > 0 ? (atkE * atkE * 3) / (atkE + defE * 3) : 0;
  const crit = (def * Math.max(1, o.atkLv || 1)) / (Math.max(1, o.defLv || 1) * 2);
  const p = o.pet;
  const full = p?.full ? PET_FULL[p.tier] || 0 : 0;
  const beast = p?.beast ? PET_BEAST[p.tier] || 0 : 0;
  const remodel = p ? PET_REMODEL[p.remodel || 0]?.[p.tier] || 0 : 0;
  // 武器、水晶屬性、種族先乘；必殺追加在這之後才加（不受種族、屬性影響）；技能倍率與寵物加成最後乘
  const pre = base * (1 + (o.weapon || 0)) * (1 + (o.crystal || 0)) * (1 + (o.race || 0));
  const calc = (withCrit, boss, skill) => {
    const mult = skill * (1 + full) * (1 + beast) * (boss ? 1 + remodel : 1);
    const one = r => Math.max(0, Math.floor((pre * r + (withCrit ? crit : 0)) * mult));
    return { min: one(RAND.min), avg: one(RAND.avg), max: one(RAND.max) };
  };
  const skill = o.skill ?? 1;
  return {
    atkE, defE, base, crit, hits: Math.max(1, o.hits || 1), mods: { full, beast, remodel },
    attack: { normal: calc(false, false, 1), crit: calc(true, false, 1), boss: calc(false, true, 1), bossCrit: calc(true, true, 1) },
    skill: { normal: calc(false, false, skill), crit: calc(true, false, skill), boss: calc(false, true, skill), bossCrit: calc(true, true, skill) },
  };
}

// ───── 技能倍率（％）：星詠魔力攻略網 guide.starcg.net /skills/物理攻擊技能、/skills/職業專屬技能、/pets/skills ─────
// Lv11 是◆等級。攻略網沒有公布的數值不列（例如崩擊 Lv11 只寫「極大」）。
export const SKILL_QIANKUN = lv => 100 + lv * 10;                  // 乾坤一擲
export const SKILL_HUIXUAN = { 1: [56, 70, 84], 2: [60, 75, 90], 3: [64, 80, 96], 4: [68, 85, 102], 5: [72, 90, 108], 6: [76, 95, 114],
  7: [80, 100, 120], 8: [84, 105, 126], 9: [88, 110, 132], 10: [92, 115, 138], 11: [96, 120, 144] };   // 迴旋利刃：等級 × 第幾刀
export const SKILL_ZHUIYUE = { 1: 92, 2: 99, 3: 106, 4: 118, 5: 105, 6: 112, 7: 116, 8: 126, 9: 118, 10: 130, 11: 142 };   // 追月劍氣：攻略網列的總傷害（％）
/**
 * 技能資料：mult＝傷害倍率（％，每級），hits＝段數，per＝每段％，atkUp＝攻擊力加成％，rows＝可選分段（前排／後排）。
 * acc＝命中修正，note＝提醒（i18n 鍵）。
 */
export const SKILLS = {
  qiankun: { mult: [110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210], acc: [-2, -5, -7, -10, -12, -14, -17, -19, -22, -24, -26] },
  bengji: { mult: [120, 143, 168, 195, 224, 255, 288, 323, 360, 399, null], note: 'guardOnly' },
  fanji: { mult: [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180] },
  jiaojiao: { mult: [105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155] },
  yiji: { mult: [104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144], note: 'bowOnly' },
  chuanci: { rows: { front: [50, 50, 50, 55, 55, 55, 60, 60, 60, 70, 80], back: [60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160] } },
  lianji: { hits: [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7], per: [50, 50, 33, 33, 25, 25, 20, 20, 16, 16, 14] },
  zhuren: { atkUp: [7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77] },
  xunsu: { atkUp: [60, 69, 78, 87, 96, 105, 113, 120, 127, 130, 133] },
  huixuan: { stages: SKILL_HUIXUAN },
  zhuiyue: { mult: Object.values(SKILL_ZHUIYUE) },
  petQiankun: { tiers: [110, 130, 150, 170, 190] },
};
/** 防禦方技能：陽炎 每級防禦 −7%、諸刃 每級防禦 −5%（Lv11 −55%） */
export const DEF_DOWN = { yangyan: lv => 7 * lv, zhuren: lv => 5 * lv };

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
