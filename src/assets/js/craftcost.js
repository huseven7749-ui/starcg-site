// 生產成本（魔幣）：依站長提供的試算表算法（tools/import-craft-cost.py 產生 data/crafting-cost.json）
//   採集屋材料 ＝ 取出費用 ÷ 4000 × 數量（礦條 1 條＝20 個礦）
//   工時 ＝ 數量 ÷ 4000 × 採滿時間(分) ÷ 60 × 工時價格 × 倍率（礦條 20）
//   布：每件價格；特殊材料（採集屋沒有的）：官方公定價或使用者填的價格，沒有就 0
//   中間成品（蕃茄醬、法國面包、炒面…）：用它自己的配方往下算
//   每件總成本 ＝ 材料 ＋ 工時 ＋ 製作費；料理／藥水另算一箱 60 件＋入箱 800
const LV = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
// 網站名錄與試算表寫法不同的字
const SAME = { 樸: '朴', 竹莢魚: '竹夾魚', 棉布: '棉', 木棉布: '木綿布' };
export function splitLv(name) {
  const m = /^([一二三四五六七八九十]+)級(.+)$/.exec(name);
  if (!m) return { lv: 0, base: name };
  const lv = m[1] === '十' ? 10 : m[1].length === 2 && m[1][0] === '十' ? 10 + LV[m[1][1]] : LV[m[1]];
  return { lv, base: m[2] };
}
const norm = n => SAME[n] || n;

/** 一種材料的種類：bar／gather／cloth／sugar／craft／special */
export function kindOf(name, D, recipes) {
  const { lv, base } = splitLv(name);
  const b = norm(base);
  if (lv && /條$/.test(b) && D.gather.includes(b.slice(0, -1))) return { kind: 'bar', lv, base: b };
  if (lv && D.gather.includes(b)) return { kind: 'gather', lv, base: b };
  if (D.cloth[b] != null) return { kind: 'cloth', lv, base: b };
  if (b === '砂糖' && D.sugar != null) return { kind: 'sugar', lv, base: b };
  if (recipes?.has(base)) return { kind: 'craft', lv, base };
  return { kind: 'special', lv, base };
}

/**
 * 算一個配方做 1 件的成本
 * @param it 配方 { n, lv, m:[[材料, 數量]], cat }
 * @param opt { labor, prices: {特殊材料: 價格}, recipes: Map(名稱→配方) }
 */
export function costOf(it, D, opt = {}, depth = 0) {
  const labor = opt.labor ?? D.labor, prices = opt.prices || {};
  const rows = [];
  let mat = 0, work = 0;
  for (const [name, qty] of it.m) {
    const k = kindOf(name, D, opt.recipes);
    let m = 0, w = 0, unit = null, need = false;
    if (k.kind === 'bar' || k.kind === 'gather') {
      const L = D.levels[k.lv - 1], mult = k.kind === 'bar' ? D.barMult : 1;
      m = L.take * mult / 4000 * qty;
      w = qty / 4000 * L.min / 60 * labor * mult;
    } else if (k.kind === 'cloth') { unit = D.cloth[k.base]; m = unit * qty; }
    else if (k.kind === 'sugar') { unit = D.sugar; m = unit * qty; }
    else if (k.kind === 'craft' && depth < 3) {
      const sub = costOf(opt.recipes.get(k.base), D, opt, depth + 1);
      unit = sub.total; m = unit * qty; need = sub.need;
    } else {
      unit = prices[k.base] ?? D.special[k.base] ?? 0;
      need = unit === 0;               // 採集屋沒有、也沒有公定價 → 等使用者填
      m = unit * qty;
    }
    mat += m; work += w;
    rows.push({ name, qty, kind: k.kind, base: k.base, unit, mat: m, work: w, need });
  }
  const fee = feeOf(it, D);
  const total = mat + work + fee;
  const out = { rows, mat, work, fee, total, need: rows.some(r => r.need) };
  if (it.cat === 'food' || it.cat === 'potion') out.box = total * D.box.n + D.box.fee;
  return out;
}

/** 製作費：試算表有列就用；沒有就依等級（裝備 40～2400、料理／藥水 20～200）；11 級以上用攻略網的生產費 */
export function feeOf(it, D) {
  if (D.fee[it.n] != null) return D.fee[it.n];
  const t = it.cat === 'food' ? 'food' : it.cat === 'potion' ? 'potion' : 'equip';
  if (it.lv >= 1 && it.lv <= 10) return D.feeByLv[t][it.lv - 1];
  return Number(it.p) || 0;
}

/** 所有配方用到的特殊材料（給「特殊材料價格」填寫表） */
export function specialsOf(items, D) {
  const recipes = new Map(items.map(it => [it.n, it]));
  const out = new Map();
  for (const it of items) for (const [name] of it.m) {
    const k = kindOf(name, D, recipes);
    if (k.kind === 'special' && !out.has(k.base)) out.set(k.base, D.special[k.base] ?? 0);
  }
  return out;
}
