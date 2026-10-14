// 市場用目錄：裝備名錄、懸賞名錄、寵物圖鑑、村莊商店（皆為靜態 JSON，載入一次）
import { BASE, T, normName, loadPets } from './core.js';
import { tierOf } from './petcalc.js';

export const EQ_CATS = ['sword', 'axe', 'spear', 'bow', 'staff', 'dagger', 'boomerang', 'shield', 'helmet', 'hat', 'armor', 'clothes', 'robe', 'boots', 'shoes',
  'necklace', 'amulet', 'ring', 'bracelet', 'headband', 'fudan', 'princess-legend', 'water-dragon'];
export const CRYSTALS = ['地的水晶碎片', '水的水晶碎片', '火的水晶碎片', '風的水晶碎片'];
export const eqCatName = c => { const k = 'eqc.' + c, v = T(k); return v === k ? c : v; };
export const raceName = r => { const k = 'race.' + r, v = T(k); return v === k ? r : v; };

let promise = null;
export function loadCatalog() {
  if (promise) return promise;
  const j = p => fetch(BASE + p).then(r => (r.ok ? r.json() : null)).catch(() => null);
  promise = Promise.all([j('data/equipment.json'), j('data/bounty.json'), loadPets().catch(() => []), j('data/village-shops.json')]).then(([eq, bounty, pets, village]) => {
    const equip = (eq?.items || []).map(([n, c, lv]) => ({ n, c, lv }));
    const equipByName = new Map(equip.map(e => [normName(e.n), e]));
    const bountyEquip = (bounty?.equip || []).map(([n, c, grade, price]) => ({ n, c, grade, price }));
    const bountyEquipByName = new Map(bountyEquip.map(e => [normName(e.n), e]));
    const bountyPets = bounty?.pets || [];
    const bountyPetSet = new Set(bountyPets.map(p => normName(p.n)));
    const petByName = new Map(pets.map(p => [normName(p.name), p]));
    const races = [...new Set(pets.map(p => p.race).filter(Boolean))].sort();
    const villages = village && typeof village === 'object' && Object.keys(village).length ? village : null;
    return {
      equip, equipByName, bountyEquip, bountyEquipByName, bountyPets, bountyPetSet, pets, petByName, races, villages,
      isEquip: n => equipByName.has(normName(n)),
      kindOf(n) {
        const k = normName(n).replace(/^\[(.*)\]$/, '$1');
        if (petByName.has(k) || bountyPetSet.has(k)) return 'pet';
        if (equipByName.has(k)) return 'equip';
        return 'item';
      },
      petTier: p => tierOf(p?.cardTier),
    };
  });
  return promise;
}
