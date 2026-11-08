// 市場用目錄：裝備名錄、懸賞名錄、寵物圖鑑、村莊商店（皆為靜態 JSON，載入一次）
import { BASE, T, normName, loadPets, loadKo } from './core.js';
import { tierOf } from './petcalc.js';

export const EQ_CATS = ['sword', 'axe', 'spear', 'bow', 'staff', 'dagger', 'boomerang', 'shield', 'helmet', 'hat', 'armor', 'clothes', 'robe', 'boots', 'shoes',
  'necklace', 'amulet', 'ring', 'bracelet', 'earring', 'headband', 'instrument', 'fudan', 'princess-legend', 'water-dragon'];
// 官方市場物品類型 ITEM_TYPE → 裝備分類（2026-11 對照名錄實測；16 沒抽到樣本先不收，26 是雜項，鼠帽、生銹的劍那類不算裝備）
const EQ_TYPE = { 0: 'sword', 1: 'axe', 2: 'spear', 3: 'staff', 4: 'bow', 5: 'dagger', 6: 'boomerang', 7: 'shield', 8: 'helmet', 9: 'hat', 10: 'armor',
  11: 'clothes', 12: 'robe', 13: 'boots', 14: 'shoes', 15: 'bracelet', 17: 'necklace', 18: 'ring', 19: 'headband', 20: 'earring', 21: 'amulet' };
export const CRYSTALS =['地的水晶碎片', '水的水晶碎片', '火的水晶碎片', '風的水晶碎片'];
export const eqCatName = c => { const k = 'eqc.' + c, v = T(k); return v === k ? c : v; };
export const raceName = r => { const k = 'race.' + r, v = T(k); return v === k ? r : v; };

let promise = null;
export function loadCatalog() {
  if (promise) return promise;
  const j = p => fetch(BASE + p).then(r => (r.ok ? r.json() : null)).catch(() => null);
  promise = Promise.all([j('data/equipment.json'), j('data/bounty.json'), loadPets().catch(() => []), j('data/village-shops.json'), loadKo()]).then(([eq, bounty, pets, village]) => {
    const equip = (eq?.items || []).map(([n, c, lv]) => ({ n, c, lv }));
    const equipByName = new Map(equip.map(e => [normName(e.n), e]));
    // 名錄沒收、但官方市場標成裝備類型的（查價時從攤位資料學到）
    const seenEquip = new Map();
    const equipOf = n => { const k = normName(n).replace(/^\[(.*)\]$/, '$1'); return equipByName.get(k) || seenEquip.get(k); };
    const bountyEquip = (bounty?.equip || []).map(([n, c, grade, price]) => ({ n, c, grade, price }));
    const bountyEquipByName = new Map(bountyEquip.map(e => [normName(e.n), e]));
    const bountyPets = bounty?.pets || [];
    const bountyPetSet = new Set(bountyPets.map(p => normName(p.n)));
    const petByName = new Map(pets.map(p => [normName(p.name), p]));
    const races = [...new Set(pets.map(p => p.race).filter(Boolean))].sort();
    const villages = village && typeof village === 'object' && Object.keys(village).length ? village : null;
    return {
      equip, equipByName, bountyEquip, bountyEquipByName, bountyPets, bountyPetSet, pets, petByName, races, villages,
      equipOf,
      isEquip: n => !!equipOf(n),
      /** 攤位資料裡官方類型是裝備、名錄卻沒收的，記下分類與等級 */
      learnTypes(items) {
        for (const it of items || []) {
          const c = EQ_TYPE[it.ty];
          if (!c) continue;
          const k = normName(it.n).replace(/^\[(.*)\]$/, '$1');
          if (!equipByName.has(k) && !seenEquip.has(k)) seenEquip.set(k, { n: k, c, lv: it.lv || 0 });
        }
      },
      kindOf(n) {
        const k = normName(n).replace(/^\[(.*)\]$/, '$1');
        if (petByName.has(k) || bountyPetSet.has(k)) return 'pet';
        if (equipOf(k)) return 'equip';
        return 'item';
      },
      petTier: p => tierOf(p?.cardTier),
    };
  });
  return promise;
}
