// 檢查站內名錄（裝備、生產配方、材料）的名稱在官方市場「完整名稱」搜尋是不是找得到
// 用法：node tools/check-market-names.mjs [輸出檔]   慢慢跑（約 1 秒 1 個），沒找到不代表名稱錯，也可能是現在沒人賣；
// 沒人賣的以成交紀錄再確認一次，兩邊都沒有才列為「可疑」。
import fs from 'node:fs';
const eq = JSON.parse(fs.readFileSync('static/data/equipment.json', 'utf8'));
const cr = JSON.parse(fs.readFileSync('static/data/crafting.json', 'utf8'));
const names = new Set(eq.items.map(x => x[0]));
for (const list of Object.values(cr.cats)) for (const it of list) {
  if (it.n) names.add(it.n);
  for (const m of it.m || []) if (m[0]) names.add(String(m[0]).replace(/^[一二三四五六七八九十]+級/, ''));
}
const out = process.argv[2] || 'market-names-report.json';
const UA = { 'User-Agent': 'Mozilla/5.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { for (let t = 0; t < 4; t++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.json(); } catch { /* 重試 */ } await sleep(3000); } return null; };
const q = s => encodeURIComponent(s);
const res = { found: [], suspicious: [] };
let i = 0;
for (const n of names) {
  i++;
  const m = await get(`https://member.starcg.net/market.php?ajax=1&type=all&server=all&exact=1&page=1&search=${q(n)}`);
  await sleep(700);
  let ok = !!m && m.totalFiltered > 0;
  if (!ok) {
    const h = await get(`https://member.starcg.net/marketrecord.php?ajax=1&type=all&page=1&search=${q(n)}&range=30d`);
    await sleep(700);
    ok = !!h && h.totalFiltered > 0;
  }
  (ok ? res.found : res.suspicious).push(n);
  if (i % 50 === 0) { console.log(i, '/', names.size, '可疑', res.suspicious.length); fs.writeFileSync(out, JSON.stringify(res, null, 1)); }
}
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log('完成', res.found.length, '找得到，', res.suspicious.length, '可疑');
