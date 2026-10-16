// 寵物卡對戰（純函式，瀏覽器與 Node 測試共用）
// 能力值用 petcalc 的成長公式；傷害用 dmgcalc 的物理／寵物魔法公式。
// 簡化：圖鑑滿檔、隨機檔各 2、不改造、不算技能與種族剋制；力量比魔法高的走物理，否則走寵物單體魔法。
import { simulate, tierOf, TIERS } from './petcalc.js';
import { physical, magic, requiredSpirit } from './dmgcalc.js';

export const CRIT_RATE = 0.1;      // 物理必殺率（寵物圖鑑沒有必殺值，取 10%）
export const MAX_TURNS = 30;

const bpOf = p => p.bp || [p.hp, p.power, p.defense, p.speed, p.magic].map(Number);

/** 依卡片算出對戰用能力：自由點數優先加主屬性，爆點時改加體力 */
export function battleStats(pet, level = 100) {
  const base = bpOf(pet), tier = tierOf(pet.cardTier), lv = Math.max(1, Math.min(200, Math.floor(level) || 1));
  const main = base[4] > base[1] ? 4 : 1;
  const sim = manual => simulate({ base, rand: [2, 2, 2, 2, 2], level: lv, tier, remodel: 0, manual });
  const limit = sim([0, 0, 0, 0, 0]).limit;
  const m = [0, 0, 0, 0, 0];
  for (let k = 0; k < limit; k++) {
    const t = [...m]; t[main]++;
    if (sim(t).manual[main] === t[main]) m[main]++; else m[0]++;
  }
  const s = sim(m).stats;
  const f = v => Math.max(1, Math.floor(v + 1e-9));
  const kind = main === 4 ? 'magic' : 'phys';
  // 寵物魔法等級：精神夠用的最高等級（1～10）
  const mlv = Math.max(1, Math.min(10, Math.floor((s.spt - 103) / 20)));
  return {
    name: pet.name, kn: pet.kn || '', imageId: pet.imageId || '', race: pet.race || '', level: lv, kind, mlv,
    tierKey: TIERS[tier]?.key || 'normal', beast: pet.race === '野獸系', manual: m,
    hp: f(s.hp), atk: f(s.atk), def: f(s.def), agi: f(s.agi), spt: f(s.spt),
  };
}

/** 單次攻擊傷害 */
export function hitDamage(att, def, rng = Math.random) {
  const pet = { tier: att.tierKey, full: true, remodel: 0, beast: att.beast };
  let range, crit = false;
  if (att.kind === 'magic') {
    range = magic({ caster: 'pet', type: 'single', level: att.mlv, spirit: att.spt, targetSpirit: def.spt, crystal: 0, race: 0, pet }).pk;
  } else {
    const r = physical({ atk: att.atk, def: def.def, atkLv: att.level, defLv: def.level, weapon: 0, crystal: 0, race: 0, skill: 1, pet });
    crit = rng() < CRIT_RATE;
    range = crit ? r.attack.crit : r.attack.normal;
  }
  const dmg = Math.max(1, Math.round(range.min + rng() * (range.max - range.min)));
  return { dmg, crit, need: att.kind === 'magic' ? requiredSpirit(att.mlv) : 0 };
}

/**
 * 跑一場對戰：每回合速度快的先動，打到一方倒下或到回合上限（剩餘血量比例高者勝）
 * @returns { winner: 0|1|null, turns, timeout, log: [{ turn, from, dmg, crit, left }] }
 */
export function runBattle(a, b, rng = Math.random, maxTurns = MAX_TURNS) {
  const P = [{ ...a, cur: a.hp, side: 0 }, { ...b, cur: b.hp, side: 1 }];
  const log = [];
  let turn = 0;
  while (P[0].cur > 0 && P[1].cur > 0 && turn < maxTurns) {
    turn++;
    const first = P[0].agi === P[1].agi ? (rng() < 0.5 ? 0 : 1) : P[0].agi > P[1].agi ? 0 : 1;
    for (const i of [first, 1 - first]) {
      const att = P[i], tgt = P[1 - i];
      if (att.cur <= 0 || tgt.cur <= 0) continue;
      const h = hitDamage(att, tgt, rng);
      tgt.cur = Math.max(0, tgt.cur - h.dmg);
      log.push({ turn, from: i, dmg: h.dmg, crit: h.crit, left: tgt.cur });
    }
  }
  const dead = P.map(p => p.cur <= 0);
  const timeout = !dead[0] && !dead[1];
  const winner = dead[0] && dead[1] ? null : dead[1] ? 0 : dead[0] ? 1 : (P[0].cur / P[0].hp >= P[1].cur / P[1].hp ? 0 : 1);
  return { winner, turns: turn, timeout, log, left: P.map(p => p.cur) };
}

/** 卡片星級：圖鑑總檔比卡等基礎多出的星數（0～25），換成 0～5 顆星 */
export function cardStars(pet) {
  const t = TIERS[tierOf(pet.cardTier)];
  if (!t) return 0;
  const born = Math.max(0, Math.min(25, Math.round(bpOf(pet).reduce((x, y) => x + y, 0) - t.base)));
  return Math.round(born / 5);
}
