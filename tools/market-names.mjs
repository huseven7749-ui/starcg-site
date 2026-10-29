// 市場商品名稱清單（給市場搜尋建議用）：抓官方市場目前所有攤位＋最近的成交紀錄，收集實際出現過的道具名稱
// 用法：node tools/market-names.mjs [成交紀錄頁數，預設 200]
// 輸出 static/data/market-names.json：{ v: 日期, items: [名稱…]（出現次數多的排前面）}；會和舊檔合併，舊名稱不會消失
// 慢慢抓（約 1 秒 1 頁），不要給官方太大負擔
import fs from 'node:fs';

const OUT = 'static/data/market-names.json';
const HIST_PAGES = Number(process.argv[2]) || 200;
const UA = { 'User-Agent': 'Mozilla/5.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let t = 0; t < 5; t++) {
    try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.json(); } catch { /* 重試 */ }
    await sleep(3000 * (t + 1));
  }
  return null;
}
const cnt = new Map();
const add = (n, k = 1) => {
  n = String(n || '').trim().replace(/^\[(.*)\]$/, '$1').trim();
  if (n && n.length <= 30) cnt.set(n, (cnt.get(n) || 0) + k);
};

// 目前攤位（道具；寵物已有圖鑑，不收）
let pages = 1;
for (let p = 1; p <= pages; p++) {
  const d = await get(`https://member.starcg.net/market.php?ajax=1&type=all&server=all&exact=0&page=${p}&search=`);
  if (!d) { console.log('攤位第', p, '頁抓不到，略過'); continue; }
  pages = Math.ceil((d.totalFiltered || 0) / (d.perPage || 20));
  for (const list of Object.values(d.itemsByCd || {})) for (const it of list) add(it.ITEM_TRUENAME);
  if (p % 20 === 0) console.log('攤位', p, '/', pages, '名稱', cnt.size);
  await sleep(900);
}
// 最近的成交紀錄（item_name 是「[名稱]」；寵物紀錄也是同一個欄位，之後再排除圖鑑寵物）
for (let p = 1; p <= HIST_PAGES; p++) {
  const d = await get(`https://member.starcg.net/marketrecord.php?ajax=1&type=item&page=${p}&search=&range=30d`);
  if (!d) { console.log('成交第', p, '頁抓不到，略過'); continue; }
  for (const l of d.logs || []) if (!String(l.buff || '').includes('寵物')) add(l.item_name);
  if (p % 25 === 0) console.log('成交', p, '/', HIST_PAGES, '名稱', cnt.size);
  if (!(d.logs || []).length) break;
  await sleep(900);
}
// 排除寵物（圖鑑已有）
let pets = new Set();
try { pets = new Set(JSON.parse(fs.readFileSync('static/data/pets.json', 'utf8')).map(p => p.name)); } catch { /* 略 */ }
let old = [];
try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')).items || []; } catch { /* 第一次 */ }
for (const n of old) if (!cnt.has(n)) cnt.set(n, 0);
const items = [...cnt.entries()].filter(([n]) => !pets.has(n)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')).map(([n]) => n);
fs.writeFileSync(OUT, JSON.stringify({ v: new Date().toISOString().slice(0, 10), src: 'https://member.starcg.net/market.php', items }));
console.log('完成：', items.length, '個名稱 →', OUT);
