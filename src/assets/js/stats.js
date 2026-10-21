// 首頁上方的瀏覽人數／在線人數（每一頁都會回報一次瀏覽，只有首頁顯示）。代碼只是瀏覽器隨機產生的字串，不含任何個資；API 失敗就整列隱藏。
import { $, T, BASE, store } from './core.js';

const fmtN = n => Number(n).toLocaleString();
function cid() {
  let c = store.get('sc.cid', '');
  if (!/^[a-z0-9]{8,32}$/i.test(c)) {
    c = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join('');
    store.set('sc.cid', c);
  }
  return c;
}
async function beat(view) {
  const el = $('#site-stats');
  try {
    const r = await fetch(`${BASE}api/stats.php?c=${cid()}${view ? '&v=1' : ''}`, { cache: 'no-store' });
    if (!r.ok) throw 0;
    const d = await r.json();
    if (!d.ok || !el) return;
    $('#st-online').textContent = fmtN(d.online);
    $('#st-today').textContent = fmtN(d.today);
    $('#st-total').textContent = fmtN(d.total);
    el.hidden = false;
  } catch { /* 沒有後端（本機預覽）就不顯示 */ }
}
export function initStats() {
  beat(true);
  setInterval(() => { if (!document.hidden) beat(false); }, 60000);
}
