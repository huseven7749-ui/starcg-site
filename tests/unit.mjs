// 公式單元測試：node tests/unit.mjs
// 期望值為手算結果（見各行註解），用來確認程式與攻略站公布的公式一致。
import assert from 'node:assert/strict';
import { simulate, statsFromBp, petScore, decodeAlloc, gradeMeta, expectedTries, capManual, maxStarAdd, REMODEL, TIERS, freePoints, remodelPoints } from '../src/assets/js/petcalc.js';
import { expected, simulate as farmSim, craft, stonePerRun, stoneSummary, stoneProfit, tierPrices, cardIncomePerRun, cardSetBreakEven, LAYERS } from '../src/assets/js/farmcalc.js';
import { physical, magic, staffRate, spiritGapRate, requiredSpirit, effective } from '../src/assets/js/dmgcalc.js';
import { tradeStats, dailyWeighted, pricingRef, trialPrice, parseImport, mergeRecords, inPeriod } from '../src/assets/js/mkstats.js';
import { plan, orderRoute, dist, parseLoc, START_POINTS, START_GROUPS } from '../src/assets/js/route.js';
import { isWalk, inMain, snap, bfs, makeDist, pathBetween, GW, GH } from '../src/assets/js/frangrid.js';
import { parseDat, encodeDat, exitKind, classify, freshMask, shardOf, demoMaze, KIND, MARK_EXIT } from '../src/assets/js/mazedat.js';

const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('赤焰年獸 Lv1、隨機檔各 2：BP', () => {
  // BP = (檔次 + 2) × 0.2 + 檔次 ÷ 24 × 1
  const r = simulate({ base: [29, 54, 17, 23, 6], rand: [2, 2, 2, 2, 2], level: 1, tier: '金', remodel: 0 });
  assert.deepEqual(r.bp, [7.41, 13.45, 4.51, 5.96, 1.85]);
  assert.equal(r.limit, 0);
  const s = petScore(r.stats, { level: 1, slots: 10, tier: '金' });
  assert.equal(s.skill, 1);  // floor(150/100 × 1)
});

t('遊戲實測：赤焰年獸 Lv140 金卡 5 改、體力 26 力量 153（遊戲評分 4472）', () => {
  // 遊戲畫面：HP 3352、MP 2027、攻擊 1433、防禦 561、敏捷 438、精神 27、回復 219；滿檔、10 技、評分 4472
  // 隨機檔實際分配不明（總和 10），取一組；容許每項差 2、評分差 2
  const r = simulate({ base: [29, 54, 17, 23, 6], rand: [1, 1, 3, 5, 0], level: 140, tier: '金', remodel: 5, manual: [26, 153, 0, 0, 0] });
  assert.equal(r.limit, 179);                 // 升級 139 ＋ 改造 40
  assert.deepEqual(r.manual, [26, 153, 0, 0, 0]); // 遊戲裡 153 點加得進去，沒有爆點
  const game = { hp: 3352, mp: 2027, atk: 1433, def: 561, agi: 438, spt: 27, rec: 219 };
  for (const k in game) assert.ok(Math.abs(Math.floor(r.stats[k]) - game[k]) <= 2, `${k} ${r.stats[k]} vs ${game[k]}`);
  const s = petScore(r.stats, { level: 140, slots: 10, tier: '金', fullSlot: true });
  assert.ok(Math.abs(s.total - 4472) <= 2, `score ${s.total}`);
});

t('升級成長：BP 每級 + 檔次 ÷ 24（算滿等級），自由點數 Lv−1', () => {
  const r = simulate({ base: [24, 24, 24, 24, 24], rand: [0, 0, 0, 0, 0], level: 25, tier: '', remodel: 0, manual: [24, 0, 0, 0, 0] });
  // 4.8 + 24/24 × 25 = 29.8，體力再 +24
  assert.deepEqual(r.bpGrow, [29.8, 29.8, 29.8, 29.8, 29.8]);
  assert.equal(r.limit, 24);
  assert.equal(r.bp[0], 53.8);
});

t('改造點數：金卡 3 改 = 24 點', () => {
  const r = simulate({ base: [20, 20, 20, 20, 20], rand: [0, 0, 0, 0, 0], level: 100, tier: '金', remodel: 3, manual: [0, 0, 0, 0, 0] });
  assert.equal(r.limit, 99 + 24);
});

t('改造點數：第 6 次固定 +8（金 5 改 40、6 改 48；普 6 改 38）', () => {
  assert.equal(remodelPoints('金', 5), 40); assert.equal(remodelPoints('金', 6), 48);
  assert.equal(remodelPoints('普', 6), 30 + 8); assert.equal(remodelPoints('銀', 6), 35 + 8);
  assert.equal(freePoints(120, '金', 6), 119 + 48);
  const r = simulate({ base: [20, 20, 20, 20, 20], rand: [0, 0, 0, 0, 0], level: 120, tier: '金', remodel: 6, manual: [0, 0, 0, 0, 0] });
  assert.equal(r.limit, 119 + 48);
});

t('單項 BP 不可超過其他四項總和', () => {
  const { capped, caps } = capManual([10, 1, 1, 1, 1], [100, 0, 0, 0, 0], 200);
  assert.equal(caps[0], 0);       // 10 已大於 4，不能再加
  assert.equal(capped[0], 0);
  const r2 = capManual([4, 4, 4, 4, 4], [100, 0, 0, 0, 0], 200);
  assert.equal(r2.capped[0], 12); // 4 + 12 = 16 = 其餘四項
});

t('總配點不可超過可用點數', () => {
  const { capped, used } = capManual([20, 20, 20, 20, 20], [10, 10, 10, 0, 0], 15);
  assert.equal(used, 15);
  assert.deepEqual(capped, [10, 5, 0, 0, 0]);
});

t('一鍵滿星：銀卡 120 → 127，平均分配 1.4', () => {
  assert.deepEqual(maxStarAdd({ cardTier: '銀', bp: [24, 24, 24, 24, 24] }), [1.4, 1.4, 1.4, 1.4, 1.4]);
});

t('市場 AllocPoint 解碼與掉檔判斷', () => {
  const enc = v => v.reduce((a, x, i) => a + x * 64 ** (4 - i), 0);
  assert.deepEqual(decodeAlloc(enc([32, 50, 16, 21, 8])), [32, 50, 16, 21, 8]);
  assert.deepEqual(decodeAlloc('550,045,000'), [32, 50, 16, 21, 8]);
  const m = gradeMeta({ cardTier: '金', bp: [32, 52, 16, 21, 8], skillSlots: 10 }, [32, 50, 16, 21, 8], [0, 1, 0, 0, 0], 8);
  assert.equal(m.drop, 2);
  assert.equal(m.bornStar, 25);   // 129 − 104
  assert.equal(m.maxStar, true);
  assert.equal(m.skillDrop, 2);
});

t('改造期望次數（含保底）', () => {
  near(expectedTries(1, 1), 1);
  near(expectedTries(0.75, 3), 1.3125);       // 1 + 0.25 + 0.0625
  near(expectedTries(0.5, 5), 1.9375);
  near(expectedTries(0.25, 9), 3.6997, 0.001);
  near(expectedTries(0.15, 13), 5.8607, 0.001);
  const total5 = REMODEL.slice(0, 5).reduce((a, r) => a + expectedTries(r.rate, r.pity), 0);
  near(total5, 13.8106, 0.001);
  assert.deepEqual(REMODEL[5], { rate: 0.10, pity: 15, lv: 130 });   // 第 6 次（遊戲內：130 級、10%、失敗 14 次後必成）
  near(expectedTries(0.10, 15), 7.9411, 0.001);                       // Σ k·0.1·0.9^(k−1)（k=1…14）＋ 15·0.9^14 ≈ 7.94
  assert.equal(TIERS['金'].fee.coin * 31, 27125000); // 1～5 次最壞 31 次
});

t('刷圖期望值：100 場、第三層、目標金卡', () => {
  const o = { runs: 100, per: 5, runCost: 175000, rates: [0.6, 0.32, 0.08], target: 'gold', ns: 3, nsFee: 1500, sg: 4, sgFee: 2000, perSet: 4 };
  const e = expected(o);
  assert.equal(e.cards, 500);
  near(e.n, 300); near(e.s, 160); near(e.g, 40);
  assert.equal(e.target, 105);         // 40 + floor((160 + 100) / 4)
  assert.equal(e.fees, 280000);        // 100×1500 + 65×2000
  assert.equal(e.sets, 26);
  assert.deepEqual(craft(9, 1, 0, 'silver', o), { count: 4, crafts1: 3, crafts2: 0 });
});

t('刷圖模擬：結果合理且依編號會少於總張數 ÷ 4', () => {
  let seed = 7;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const o = { runs: 100, per: 5, runCost: 175000, rates: [0.6, 0.32, 0.08], target: 'gold', ns: 3, nsFee: 1500, sg: 4, sgFee: 2000, perSet: 4, letters: true };
  const s = farmSim(o, 2000, rng);
  assert.ok(s.mean > 18 && s.mean < 26, 'mean ' + s.mean);
  assert.ok(s.p10 <= s.p50 && s.p50 <= s.p90);
  const s2 = farmSim({ ...o, letters: false }, 2000, rng);
  assert.ok(s2.mean > s.mean, '不分編號應該可湊更多套');
  near(s2.mean, 25.6, 1.2);
});

t('技能突破石：打到第三層，二、三層各判定一次', () => {
  const per = stonePerRun(3, 0.05, 0.15);
  near(per.mean, 0.2, 1e-9);
  near(per.q0, 0.8075, 1e-9); near(per.q1, 0.185, 1e-9); near(per.q2, 0.0075, 1e-9);
  const s = stoneSummary(100, 3, 0.05, 0.15, 20);
  near(s.mean, 20, 1e-9);                 // 100 場平均 20 顆
  assert.equal(s.p10, 15); assert.equal(s.p90, 25);
  assert.ok(s.atLeast1 > 0.999999);
  assert.ok(s.atLeastK > 0.5 && s.atLeastK < 0.58);
  assert.equal(stoneSummary(100, 2, 0.05, 0.15).mean, 5);   // 只到第二層：100 × 5%
  assert.equal(stoneSummary(100, 1, 0.05, 0.15).mean, 0);   // 第一層不掉
  assert.deepEqual(LAYERS[1], [1, 0, 0]);
});

t('技能突破石：湊 100 顆要幾場、入場費與突破石價值的盈虧', () => {
  const s = stoneSummary(100, 3, 0.05, 0.15, 100);
  assert.equal(s.runsAvg, 500);                       // 100 ÷ 0.2
  assert.ok(s.runsFor50 >= 495 && s.runsFor50 <= 505);
  assert.ok(s.runsFor90 > 540 && s.runsFor90 < 580);  // 九成把握約 560 場
  const value = 2800 * 1e6 / 3000;                    // 2,800 魔晶 ≈ 933,333 魔幣
  const p = stoneProfit(s, 100, 175000, value);
  assert.equal(p.cost, 17500000);
  near(p.worth, 20 * value, 1e-6);
  near(p.costPerStone, 875000, 1e-6);                 // 自己打每顆 87.5 萬
  near(p.roi, 1 / 15, 1e-9);                          // 賺 6.7%
  assert.equal(p.needStones, 19);                     // 1,750 萬 ÷ 93.3 萬 → 19 顆回本
  assert.ok(p.breakEvenProb > 0.6 && p.breakEvenProb < 0.66);
  const loss = stoneProfit(s, 100, 200000, value);
  assert.ok(loss.profit < 0 && loss.perRunProfit < 0);
});

t('改造圖售價：普、銀照合成比例與手續費對齊金卡，並算出不虧本的最低售價', () => {
  const c = x => x / 1e6 * 3000;                        // 魔幣 → 魔晶（3,000 魔晶＝100 萬）
  const o = { per: 5, rates: [0.6, 0.32, 0.08], ns: 3, sg: 4, nsFee: c(1500), sgFee: c(2000), setSize: 4, sellFee: 0.06 };
  const p = tierPrices(500, o);                          // 金一套 2,000 晶 → 每張 500
  near(p.s, (500 - 6) / 4, 1e-9);                        // 銀＝(金−合成費 6 晶)÷4
  near(p.n, (p.s - 4.5) / 3, 1e-9);                      // 普＝(銀−合成費 4.5 晶)÷3
  const inc = cardIncomePerRun(500, o);
  near(inc, 5 * 0.94 * (0.6 * p.n + 0.32 * p.s + 0.08 * 500), 1e-9);
  const ok = cardSetBreakEven({ ...o, fee: c(175000), stoneValue: 0.2 * 2800 });
  assert.ok(ok.covered && ok.setPrice === 0);            // 光突破石就回本
  const b = cardSetBreakEven({ ...o, fee: c(250000), stoneValue: 0.2 * 2800 });   // 每場還差 190 晶
  near(cardIncomePerRun(b.setPrice / 4, o), 190, 1e-6); // 最低售價剛好打平
  assert.ok(b.setPrice > 780 && b.setPrice < 830);       // 約 802 晶一套
});

t('物理傷害：攻擊 500、防禦 300（超過 240 只算 30%）', () => {
  near(effective(500), 318, 1e-9); near(effective(300), 258, 1e-9); near(effective(200), 200, 1e-9);
  const r = physical({ atk: 500, def: 300, atkLv: 120, defLv: 100, weapon: 0.15, crystal: 0, race: 0, skill: 1.5, pet: null });
  near(r.base, 303372 / 1092, 1e-9);      // 318² × 3 ÷ (318 + 258 × 3)
  near(r.crit, 180, 1e-9);                // 300 × 120 ÷ (100 × 2)
  assert.deepEqual(r.attack.normal, { min: 287, avg: 319, max: 351 });
  assert.equal(r.attack.crit.avg, 499);
  assert.equal(r.skill.normal.avg, Math.floor(277.8131868 * 1.15 * 1.5));
  const p = physical({ atk: 500, def: 300, atkLv: 120, defLv: 100, weapon: 0.15, crystal: 0, race: 0.2, skill: 1, pet: { tier: 'gold', full: true, remodel: 5, beast: true } });
  assert.equal(p.attack.boss.avg, Math.floor(277.8131868 * 1.15 * 1.2 * 1.2 * 1.08 * 1.35));
  assert.equal(p.attack.normal.avg, Math.floor(277.8131868 * 1.15 * 1.2 * 1.2 * 1.08));
});

t('魔法傷害：需求精神、精神差、法杖魔攻', () => {
  assert.equal(requiredSpirit(10), 303);
  near(staffRate(102, 4), 1.0625, 1e-9);  // gamerch 範例
  near(staffRate(82, 3), 1.5, 1e-9);
  near(staffRate(50, 4), 1, 1e-9);
  assert.equal(spiritGapRate(240, 200), 1);     // 高 20%
  assert.equal(spiritGapRate(230, 200), 0.9);   // 高 15%（14～20%）
  assert.equal(spiritGapRate(210, 200), 0.82);  // 高 5%
  assert.equal(spiritGapRate(100, 200), 0.09);  // 低 50%
  assert.equal(spiritGapRate(100, 200, true), 0.36); // 寵物最低 36%
  const m = magic({ caster: 'char', type: 'single', level: 10, spirit: 320, targetSpirit: 200, matk: 320, crystal: 0, race: 0, insight: 0 });
  assert.deepEqual(m.field, { min: 920, avg: 1083, max: 1245 }); // 722 × 1.5 × 85%～115%
  const ex = magic({ caster: 'pet', type: 'single', level: 'ex', spirit: 400, targetSpirit: 200, crystal: 0, race: 0, pve: true });
  assert.equal(ex.base, Math.round(650 * 1.13));
});

t('成交統計：數量加權均價、百分位、每日加權', () => {
  const logs = [{ t: 1000, q: 1, p: 100, c: 0 }, { t: 2000, q: 3, p: 200, c: 0 }, { t: 90000, q: 1, p: 300, c: 0 }];
  const s = tradeStats(logs);
  assert.equal(s.count, 3); assert.equal(s.qty, 5);
  near(s.wavg, (100 + 600 + 300) / 5, 1e-9);   // 200
  assert.equal(s.median, 200); assert.equal(s.p25, 150); assert.equal(s.p75, 250);
  assert.equal(s.min, 100); assert.equal(s.max, 300); assert.equal(s.last, 300);
  const d = dailyWeighted(logs);
  assert.equal(d.length, 2); near(d[0].wavg, 700 / 4, 1e-9);
  assert.equal(inPeriod(logs, 1, 90000).length, 1);
});

t('擺攤定價參考與試算售價', () => {
  const logs = Array.from({ length: 10 }, (_, i) => ({ t: i, q: 1, p: 100 + i * 10, c: 0 }));  // 100..190
  const r = pricingRef(logs, [150, 130, 170]);
  assert.equal(r.enough, true); assert.equal(r.minAsk, 130);
  near(r.median, 145, 1e-9); near(r.p25, 122.5, 1e-9); near(r.p75, 167.5, 1e-9);
  near(r.diff, 145 - 130, 1e-9);
  assert.equal(pricingRef(logs.slice(0, 4), [1]).median, null);    // 不足 5 筆不提供
  const tp = trialPrice(140, 0, logs, [150, 130, 170]);
  assert.equal(tp.net, 126); assert.equal(tp.fee, 14);             // 魔幣手續費 10%
  assert.equal(tp.rank, 2); assert.equal(tp.of, 4);                // 只比 130 貴
  assert.equal(tp.zone, 'mid'); near(tp.atOrAbove, 0.6, 1e-9);
  assert.equal(trialPrice(100, 1, logs, []).net, 94);              // 魔晶 6%
});

t('匯入 CSV／JSON 成交紀錄', () => {
  const csv = '時間,商品,數量,單價,幣別\n2026-10-13 12:00,[硬皮靴],2,"1,050",魔幣\n2026-10-13 13:00,水的水晶碎片,1,3,魔晶\n壞掉的一行';
  const r = parseImport(csv);
  assert.equal(r.records.length, 2); assert.equal(r.errors.length, 1);
  assert.deepEqual(r.records[0], { t: Math.floor(Date.UTC(2026, 9, 13, 4, 0) / 1000), n: '硬皮靴', q: 2, p: 1050, c: 0 });
  assert.equal(r.records[1].c, 1);
  const j = parseImport('[{"time":"2026-10-13 12:00","name":"年獸","qty":1,"price":900,"currency":"crystal"}]');
  assert.equal(j.records[0].c, 1);
  assert.equal(mergeRecords(r.records, r.records).length, 2);
});

t('採購路線：距離、排序、三種策略與堆疊計價', () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 5 }), 5);           // 可斜走
  assert.deepEqual(parseLoc('法蘭城 [東:219 南:132]'), { map: '法蘭城', x: 219, y: 132 });
  assert.equal(START_POINTS.length, 24);
  assert.ok(START_POINTS.every(p => START_GROUPS.includes(p.g) && Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.equal(new Set(START_POINTS.map(p => p.id)).size, START_POINTS.length);
  const start = { x: 0, y: 0, map: '法蘭城' };
  assert.deepEqual(orderRoute(start, [{ x: 10, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 0 }]).map(p => p.x), [1, 5, 10]);
  const S = (key, x) => ({ key, n: key, x, y: 0, map: '法蘭城', sv: 1 });
  const A = S('A', 2), B = S('B', 50), C = S('C', 3);
  const listings = [
    { name: '甲', p: 100, q: 5, stall: B }, { name: '乙', p: 50, q: 5, stall: B },     // 最便宜但最遠
    { name: '甲', p: 110, q: 5, stall: A },                                             // 近、貴 10%
    { name: '乙', p: 80, q: 5, stall: C },                                              // 近、貴 60%
  ];
  const needs = [{ name: '甲', qty: 3 }, { name: '乙', qty: 3 }];
  const price = plan({ needs, listings, start, strategy: 'price', basis: 'piece' });
  assert.equal(price.total, 3 * 100 + 3 * 50); assert.equal(price.stalls, 1); assert.equal(price.walked, 50);
  const route = plan({ needs, listings, start, strategy: 'route', basis: 'piece', tol: 0.15 });
  assert.deepEqual(route.steps.map(s => s.stall.key), ['A', 'B']);   // 甲在 A（多 10% 可接受），乙仍去 B
  assert.equal(route.total, 330 + 150);
  const fewest = plan({ needs, listings, start, strategy: 'fewest', basis: 'piece' });
  assert.equal(fewest.stalls, 1); assert.equal(fewest.steps[0].stall.key, 'B');
  const stack = plan({ needs: [{ name: '甲', qty: 3 }], listings, start, strategy: 'price', basis: 'stack' });
  assert.equal(stack.total, 100); assert.deepEqual(stack.over, [{ name: '甲', qty: 2 }]);  // 整堆 5 個 100
  const short = plan({ needs: [{ name: '甲', qty: 20 }], listings, start, strategy: 'price', basis: 'piece' });
  assert.deepEqual(short.unmet, [{ name: '甲', qty: 10 }]);
});

t('法蘭城可走格：連通、貼齊、實際步數與路線', () => {
  assert.equal(GW * GH, 90000);
  // 起點都要在主要連通區（或 6 格內能貼到）
  for (const p of START_POINTS) assert.ok(snap(p.x, p.y), `起點 ${p.id} 貼不到可走格`);
  assert.ok(inMain(153, 103) && inMain(153, 235) && inMain(277, 88) && inMain(27, 88), '城門、里堡都連得到');
  assert.ok(!inMain(153, 85), '里堡內部不算城內可走區');
  const d = makeDist();
  const castleS = { x: 153, y: 103 }, gateS = { x: 153, y: 235 }, gateE = { x: 277, y: 88 };
  assert.equal(d(castleS, castleS), 0);
  assert.ok(d(castleS, gateS) >= Math.max(0, 235 - 103), '實際步數不會小於直線距離');
  assert.ok(d(castleS, gateE) > 124 && d(castleS, gateE) < 400, `里堡→東門 ${d(castleS, gateE)} 步要合理`);
  assert.equal(d(castleS, gateE), d(gateE, castleS), '來回一樣');
  // 水面不能走：直線穿過護城河的兩點，實際要繞
  assert.ok(d({ x: 153, y: 103 }, { x: 153, y: 68 }) > 60, '里堡南→北要繞護城河');
  // 貼齊：欄杆內的傳送石 W1 會貼到旁邊的可走格；城外座標退回直線距離
  assert.ok(d({ x: 69, y: 79 }, { x: 72, y: 123 }) > 40);
  assert.equal(d({ x: 0, y: 0 }, { x: 3, y: 5 }), 5);
  const path = pathBetween(castleS, gateS);
  assert.ok(path.length >= 2 && path[0].x === 153 && path[path.length - 1].y === 235, '路線從起點到終點');
  for (let i = 1; i < path.length; i++) assert.ok(isWalk(path[i].x, path[i].y), '路線每個轉折點都可走');
  const { dist: D } = bfs(153, 103);
  assert.equal(D[235 * GW + 153], d(castleS, gateS));
  // 規劃時用實際步數：最近鄰會改變順序
  const start = { x: 153, y: 103, map: '法蘭城' };
  const far = { x: 153, y: 68 }, near = { x: 170, y: 103 };
  assert.deepEqual(orderRoute(start, [far, near], d).map(p => p.y), [103, 68]);
});

t('迷宮地圖檔：檔頭、三層資料與出入口座標', () => {
  // 5×3 地圖：(東1,南0) 上樓梯、(東4,南2) 下樓梯、(東2,南1) 水晶（出入口但沒有物件）
  const W = 5, H = 3, N = W * H;
  const tile = new Uint16Array(N).fill(100), obj = new Uint16Array(N), mark = new Uint16Array(N);
  const cell = (e, s) => s * W + e;
  for (const [e, s] of [[1, 0], [2, 1], [3, 1], [4, 2]]) tile[cell(e, s)] = 777;
  mark[cell(1, 0)] = MARK_EXIT; obj[cell(1, 0)] = 13268;
  mark[cell(4, 2)] = MARK_EXIT; obj[cell(4, 2)] = 13269;
  mark[cell(2, 1)] = MARK_EXIT;
  mark[cell(3, 1)] = 0xC000; obj[cell(3, 1)] = 12000;                  // 不是出入口標記：不算
  const buf = encodeDat({ width: W, height: H, tile, obj, mark });
  assert.equal(buf.length, 20 + 6 * N);
  const m = parseDat(buf);
  assert.ok(m.ok); assert.equal(m.width, 5); assert.equal(m.height, 3); assert.equal(m.floor, 4);
  assert.deepEqual(m.exits.map(x => [x.e, x.s, x.kind]), [[1, 0, KIND.UP], [2, 1, KIND.CRYSTAL], [4, 2, KIND.DOWN]]);
  assert.deepEqual(m.bbox, { minE: 1, maxE: 4, minS: 0, maxS: 2 });
  assert.equal(parseDat(buf.slice(0, 40)).code, 'partial');         // 遊戲寫到一半
  assert.equal(parseDat(buf.slice(0, 10)).code, 'short');
  assert.equal(classify(0, 0), null); assert.equal(classify(0, MARK_EXIT), KIND.CRYSTAL);
});

t('迷宮地圖檔：樓梯圖檔編號分類', () => {
  const up = [12000, 12001, 13268, 13270, 13274, 13996, 13998, 15561, 15887, 15891, 16610, 16611, 16626, 16629, 17952, 17998];
  const down = [12002, 12003, 13269, 13275, 13997, 13999, 15562, 15888, 15892, 16612, 16615, 17953, 17999];
  up.forEach(v => assert.equal(exitKind(v), KIND.UP, String(v)));
  down.forEach(v => assert.equal(exitKind(v), KIND.DOWN, String(v)));
  [14676].forEach(v => assert.equal(exitKind(v), KIND.WARP));
  [12004, 14000, 15000, 18000, 30000].forEach(v => assert.equal(exitKind(v), KIND.OTHER, String(v)));
});

t('迷宮：這趟新探索的格子、分流、示範迷宮', () => {
  const full = parseDat(demoMaze({ seed: 3, explored: 1 }));
  const part = parseDat(demoMaze({ seed: 3, explored: 0.3 }));
  assert.equal(full.width, part.width);
  assert.ok(part.floor < full.floor);
  assert.deepEqual(full.exits.map(x => x.kind).sort(), [KIND.UP, KIND.DOWN, KIND.CRYSTAL].sort());
  assert.ok(!part.exits.some(x => x.kind === KIND.DOWN));             // 還沒走到最遠處
  const mask = freshMask(part, full);
  const changed = mask.reduce((a, b) => a + b, 0);
  assert.ok(changed > 0 && changed < full.width * full.height);
  assert.equal(freshMask(null, full).every(x => x === 1), true);
  assert.equal(shardOf('1'), 'S1'); assert.equal(shardOf('3'), 'S3'); assert.equal(shardOf('map'), ''); assert.equal(shardOf('0'), '');
});

console.log(`\n全部 ${n} 項通過`);
