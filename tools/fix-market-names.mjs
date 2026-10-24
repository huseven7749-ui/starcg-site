// 把站內名錄（裝備、生產配方、商店）裡和官方市場寫法不同的名稱改成市場上的字：node tools/fix-market-names.mjs <對照檔.json>
// 對照檔格式：{ "站內舊名": "市場名" }；名稱要整段完全相同才會換（含生產配方材料前面的「n級」前綴）。
import fs from 'node:fs';
const map = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let total = 0;
for (const f of ['equipment', 'crafting', 'village-shops', 'bounty']) {
  const p = `static/data/${f}.json`;
  if (!fs.existsSync(p)) continue;
  let n = 0;
  const walk = v => {
    if (typeof v === 'string') { const lv = /^([一二三四五六七八九十]+級)(.+)$/.exec(v); if (map[v]) { n++; return map[v]; } if (lv && map[lv[2]]) { n++; return lv[1] + map[lv[2]]; } return v; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  fs.writeFileSync(p, JSON.stringify(walk(d)));
  console.log(f, '換了', n, '處'); total += n;
}
console.log('共', total);
