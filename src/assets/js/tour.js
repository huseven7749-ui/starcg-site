// 星野導覽：第一次進某個工具頁時，星野跑進來講 2～3 句，並圈出關鍵按鈕；可跳過。
// 右下角「問星野」可隨時重播。只在有定義導覽的頁面出現。
import { $, T, esc, store, RETURNING } from './core.js';

// 每頁的步驟：sel＝要圈的元素（找不到或看不到就跳過）、key＝台詞、pose＝星野動作、before＝圈之前要先點的元素（例如切到某個分頁）
const TOURS = {
  market: [
    { sel: '#mk-form', key: 'tour.market.1', pose: 'adv-look', before: '#tab-main-cmp' },
    { sel: '#mk-tabs', key: 'tour.market.2', pose: 'adv-walk' },
    { sel: '#tab-main-bulk', key: 'tour.market.3', pose: 'adv-cheer' },
  ],
  maze: [
    { sel: '#mz-start', key: 'tour.maze.1', pose: 'adv-look' },
    { sel: '#mz-link', key: 'tour.maze.2', pose: 'adv-run' },
    { sel: '#mz-demo', key: 'tour.maze.3', pose: 'adv-cheer' },
    { sel: '#mz-stage', key: 'tour.maze.4', pose: 'adv-cheer' },   // 已在探索中（地圖看得到）時才會出現
  ],
  pets: [
    { sel: '#f-q', key: 'tour.pets.1', pose: 'adv-look', before: '#tab-dex' },
    { sel: '#tab-sim', key: 'tour.pets.2', pose: 'adv-walk' },
    { sel: '#points', key: 'tour.pets.3', pose: 'adv-cheer', before: '#tab-sim' },
  ],
  // 寵物頁的「寵物卡對戰」分頁：第一次切過去時另外導覽
  'pets.battle': [
    { sel: '#pc-album', key: 'tour.battle.1', pose: 'adv-look', before: '#tab-battle' },
    { sel: '#arena', key: 'tour.battle.2', pose: 'adv-run' },
    { sel: '#pc-fight', key: 'tour.battle.3', pose: 'adv-attack' },
    { sel: '#pc-share', key: 'tour.battle.4', pose: 'adv-cheer' },
  ],
  damage: [
    { sel: '#dmg-tabs', key: 'tour.damage.1', pose: 'adv-look', before: '#tab-phys' },
    { sel: '#p-atk', key: 'tour.damage.2', pose: 'adv-attack' },
    { sel: '#p-table', key: 'tour.damage.3', pose: 'adv-cheer' },
  ],
  remodel: [
    { sel: '#farm-title', key: 'tour.remodel.1', pose: 'adv-look' },
    { sel: '#sim-go', key: 'tour.remodel.2', pose: 'adv-magic' },
    { sel: '#try-title', key: 'tour.remodel.3', pose: 'adv-cheer' },
  ],
  exchange: [
    { sel: '#rate-title', key: 'tour.exchange.1', pose: 'adv-look' },
    { sel: '#c-coin', key: 'tour.exchange.2', pose: 'adv-walk' },
    { sel: '#cmp-title', key: 'tour.exchange.3', pose: 'adv-cheer' },
  ],
};
const page = (document.body.className.match(/\bpage-([\w-]+)/) || [])[1];
const steps = TOURS[page];
// 目前要播哪一份：寵物頁停在對戰分頁時播對戰導覽
const tourKey = () => (page === 'pets' && document.getElementById('pane-battle')?.hidden === false ? 'pets.battle' : page);
let curKey = page;
const SEEN_KEY = 'sc.tour';
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let SPR = {};
try { SPR = JSON.parse(document.body.dataset.sprites || '{}'); } catch { /* 沒有角色圖就只顯示文字 */ }
const sprite = pose => { const s = SPR[pose] || SPR['adv-look']; return s ? (still ? s[1] : s[0]) : ''; };

const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };

let root = null, idx = 0, list = [], target = null, raf = 0;
function build() {
  root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', T('tour.title'));
  root.innerHTML = `<div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-guide">
      <img class="tour-sprite" alt="" decoding="async">
      <div class="tour-bubble">
        <span class="tour-name">${esc(T('tour.name'))}</span>
        <p class="tour-text" aria-live="polite"></p>
        <div class="tour-actions">
          <span class="tour-step"></span>
          <button type="button" class="btn sm ghost tour-skip">${esc(T('tour.skip'))}</button>
          <button type="button" class="btn sm primary tour-next"></button>
        </div>
      </div>
    </div>`;
  document.body.append(root);
  $('.tour-skip', root).addEventListener('click', () => end(true));
  $('.tour-next', root).addEventListener('click', next);
  root.addEventListener('click', e => { if (e.target === root || e.target.classList.contains('tour-spot')) next(); });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); end(true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  });
}
function place() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (!root || !target) return;
    const r = target.getBoundingClientRect(), pad = 8;
    const spot = $('.tour-spot', root);
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // 目標在上半部 → 星野放下面；在下半部 → 放上面
    root.classList.toggle('guide-top', r.top + r.height / 2 > innerHeight * 0.55);
  });
}
function show(i) {
  idx = i;
  const s = list[i];
  if (s.before) { const b = document.querySelector(s.before); if (b && b.getAttribute('aria-selected') !== 'true') b.click(); }
  target = document.querySelector(s.sel);
  target.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  const img = $('.tour-sprite', root);
  img.src = sprite(i === 0 ? 'adv-run' : s.pose);
  if (i === 0 && !still) setTimeout(() => { if (root && idx === 0) img.src = sprite(s.pose); }, 900);
  $('.tour-text', root).textContent = T(s.key);
  $('.tour-step', root).textContent = T('tour.step', { n: i + 1, all: list.length });
  const nb = $('.tour-next', root);
  nb.textContent = T(i === list.length - 1 ? 'tour.done' : 'tour.next');
  nb.focus({ preventScroll: true });
  place();
  setTimeout(() => {           // 平滑捲動結束後再對一次位置；版面高度變了導致目標跑出畫面就再捲一次
    if (!root || !target) return;
    const r = target.getBoundingClientRect();
    if (r.bottom < 60 || r.top > innerHeight - 60) target.scrollIntoView({ block: 'center' });
    place();
  }, 450);
}
function next() { if (idx + 1 < list.length) show(idx + 1); else end(false); }
function markSeen(key) {
  const seen = store.get(SEEN_KEY, {}) || {};
  seen[key] = 1;
  store.set(SEEN_KEY, seen);
}
function end() {
  markSeen(curKey);
  removeEventListener('resize', place); removeEventListener('scroll', place, true);
  root?.classList.add('out');
  const r = root; root = null; target = null;
  setTimeout(() => r?.remove(), still ? 0 : 250);
  $('.ask-hoshino')?.focus({ preventScroll: true });
}
export function startTour() {
  if (!steps || root) return;
  curKey = tourKey();
  list = (TOURS[curKey] || steps).filter(s => { if (s.before) return document.querySelector(s.sel); return visible(document.querySelector(s.sel)); });
  if (!list.length) return;
  markSeen(curKey);            // 一出場就記下，中途離開或重新整理也不會再自動跳出
  build();
  addEventListener('resize', place); addEventListener('scroll', place, true);
  requestAnimationFrame(() => root.classList.add('in'));
  show(0);
}

if (steps) {
  // 右下角「問星野」：隨時重播
  const ask = document.createElement('button');
  ask.type = 'button';
  ask.className = 'ask-hoshino';
  ask.innerHTML = `<img src="${esc(sprite('adv-look'))}" alt="" width="34" height="34" decoding="async"><span>${esc(T('tour.ask'))}</span>`;
  ask.title = T('tour.askTitle');
  ask.addEventListener('click', startTour);
  document.body.append(ask);

  // 第一次來本站時，每個工具第一次打開才出場（等歡迎面板關掉、頁面資料載入後）；以前來過就不再自動出現
  // RETURNING 在 localStorage 被擋時會改用 cookie 判斷，所以不會每次都跳出來
  const first = !RETURNING;
  const seen = store.get(SEEN_KEY, {}) || {};
  if (first && !seen[page] && !new URLSearchParams(location.search).has('s')) {
    const wel = document.getElementById('sheet-welcome');
    // 歡迎面板還開著就每 0.5 秒看一次（不依賴 dialog 的 close 事件，部分內建瀏覽器不會觸發）
    const wait = () => (wel?.open ? setTimeout(wait, 500) : setTimeout(startTour, 700));
    setTimeout(wait, 1400);
  }
  // 第一次打開寵物卡對戰分頁（同樣只在第一次來的那次）
  document.getElementById('tab-battle')?.addEventListener('click', () => {
    if (first && !(store.get(SEEN_KEY, {}) || {})['pets.battle']) setTimeout(startTour, 600);
  });
}
