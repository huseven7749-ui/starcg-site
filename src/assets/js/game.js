// 冒險手冊：經驗值、等級、稱號、頭像、成就、每日任務、連續天數。
// 全部只存在這台裝置的瀏覽器（localStorage），不需要帳號；可以匯出一段代碼搬到別台裝置。
// 防止等級、成就不見：
// - 存檔前先讀回目前存的資料再合併（同時開好幾個分頁時，舊分頁不會用舊資料蓋掉新進度）
// - 其他分頁更新時立刻同步
// - 另存一份精簡備份在 cookie；localStorage 被瀏覽器清掉（iOS 長時間沒來、空間不足等）時用它還原
// - 向瀏覽器申請「持久保存」，降低被自動清除的機會
import { $, $$, T, esc, fmt, store, toast, openSheet, spriteImg, LANG } from './core.js';
import { initStats } from './stats.js';

const KEY = 'sc.game';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ───── 規則 ─────
// 事件：[每次經驗值, 每天最多計算幾次]
const EVENTS = {
  'market.search': [4, 10], 'market.copy': [2, 10], 'market.daily': [4, 2], 'market.bulk': [6, 4],
  'exchange.compare': [4, 6], 'pets.sim': [4, 8], 'remodel.sim': [6, 6], 'remodel.lucky': [0, 99], 'remodel.unlucky': [0, 99],
  'damage.hit': [1, 60], 'damage.crit3': [0, 99], 'maze.run': [30, 6], 'maze.deep': [0, 99], 'maze.pack': [15, 4], 'maze.stairs': [2, 30],
  'posts.read': [5, 4], 'egg.dance': [10, 1], 'egg.rain': [10, 1], 'visit': [3, 1],
};
const QUEST_XP = 20, QUEST_CHEESE = 1, ALL_QUEST_XP = 30, ACH_XP = 40;
export const levelOf = xp => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 50));
export const xpAt = lv => 50 * (lv - 1) * (lv - 1);
const TITLES = [[20, 'rich'], [17, 'legend'], [14, 'ratfriend'], [11, 'mazeguide'], [8, 'merchant'], [5, 'regular'], [3, 'citizen'], [1, 'novice']];
export const titleKey = lv => TITLES.find(([l]) => lv >= l)[1];
// 頭像：達到等級解鎖
export const AVATARS = [['mouse-blue', 1], ['mouse-green', 3], ['mouse-yellow', 5], ['mouse-lav', 8], ['mouse-red', 11], ['mouse-crown', 14], ['mouse-love', 17], ['ratking', 20]];
// 每日任務池：[id, 事件, 次數, 連到哪一頁]
const QUESTS = [
  ['search', 'market.search', 1, '/market/'], ['daily', 'market.daily', 1, '/market/#mk-daily'], ['bulk', 'market.bulk', 1, '/market/'],
  ['exchange', 'exchange.compare', 1, '/exchange/'], ['pet', 'pets.sim', 1, '/pets/'], ['remodel', 'remodel.sim', 1, '/remodel/'],
  ['hit', 'damage.hit', 10, '/damage/'], ['maze', 'maze.run', 1, '/maze/'], ['post', 'posts.read', 1, '/posts/'],
];
// 成就：[id, 圖示（sprite 名或 #icon）, 判斷]
const ACH = [
  ['search1', 'i-market', c => c['market.search'] >= 1], ['search50', 'i-market', c => c['market.search'] >= 50], ['search300', 'i-market', c => c['market.search'] >= 300],
  ['copy10', 'i-copy', c => c['market.copy'] >= 10], ['bulk1', 'i-pin', c => c['market.bulk'] >= 1],
  ['compare1', 'i-exchange', c => c['exchange.compare'] >= 1], ['pet1', 'i-pets', c => c['pets.sim'] >= 1], ['pet30', 'i-pets', c => c['pets.sim'] >= 30],
  ['hit1', 'i-damage', c => c['damage.hit'] >= 1], ['hit100', 'i-damage', c => c['damage.hit'] >= 100], ['hit1000', 'i-damage', c => c['damage.hit'] >= 1000], ['crit3', 'i-bolt', c => c['damage.crit3'] >= 1],
  ['remodel1', 'i-remodel', c => c['remodel.sim'] >= 1], ['lucky', 'i-sparkle', c => c['remodel.lucky'] >= 1], ['unlucky', 'i-ev-monster', c => c['remodel.unlucky'] >= 1],
  ['maze1', 'i-maze', c => c['maze.run'] >= 1], ['maze10', 'i-maze', c => c['maze.run'] >= 10], ['deep5', 'i-maze', c => c['maze.deep'] >= 1], ['pack1', 'i-flag', c => c['maze.pack'] >= 1],
  ['post1', 'i-posts', c => c['posts.read'] >= 1], ['dance', 'ratking', c => c['egg.dance'] >= 1], ['rain', 'mouse-blue', c => c['egg.rain'] >= 1],
  ['streak3', 'i-calendar', (c, s) => s.daily.best >= 3], ['streak7', 'i-calendar', (c, s) => s.daily.best >= 7], ['streak30', 'i-calendar', (c, s) => s.daily.best >= 30],
  ['allquests', 'i-star', (c, s) => s.daily.fullDays >= 1], ['lv5', 'i-star', (c, s) => levelOf(s.xp) >= 5], ['lv10', 'i-star', (c, s) => levelOf(s.xp) >= 10], ['lv20', 'i-star', (c, s) => levelOf(s.xp) >= 20],
];

// ───── 狀態 ─────
const blank = () => ({ v: 1, xp: 0, cheese: 0, cnt: {}, ach: {}, avatar: '', daily: { date: '', done: {}, ev: {}, streak: 0, best: 0, last: '', fullDays: 0 }, since: today() });
function normalize(o) {
  const b = blank();
  if (!o || typeof o !== 'object') return b;
  const s = { ...b, ...o, daily: { ...b.daily, ...(o.daily || {}) }, cnt: { ...(o.cnt || {}) }, ach: { ...(o.ach || {}) } };
  s.xp = Math.max(0, Number(s.xp) || 0); s.cheese = Math.max(0, Number(s.cheese) || 0);
  return s;
}
/** 合併兩份進度：經驗值、乳酪、各項次數取大，成就聯集，每日資料取日期較新的那份 */
function merge(a, b) {
  a = normalize(a); b = normalize(b);
  const keys = new Set([...Object.keys(a.cnt), ...Object.keys(b.cnt)]);
  const ach = { ...b.ach };
  for (const [k, t] of Object.entries(a.ach)) ach[k] = ach[k] ? Math.min(ach[k], t) : t;
  const newer = (b.daily.date || '') > (a.daily.date || '') ? b : a;
  const streakSrc = (b.daily.last || '') > (a.daily.last || '') ? b : a;
  return normalize({
    ...a, ...b,
    xp: Math.max(a.xp, b.xp), cheese: Math.max(a.cheese, b.cheese), ach,
    cnt: Object.fromEntries([...keys].map(k => [k, Math.max(a.cnt[k] || 0, b.cnt[k] || 0)])),
    avatar: b.avatar || a.avatar,
    since: [a.since, b.since].filter(Boolean).sort()[0] || today(),
    daily: {
      ...newer.daily,
      // 每日各事件次數：同一天的兩份取各項較大值（以前直接用「較舊那份」，存檔後次數被洗掉，任務永遠完不成）
      ev: Object.fromEntries([...new Set([...Object.keys(a.daily.ev || {}), ...Object.keys(b.daily.ev || {})])].map(k => [k, Math.max(a.daily.date === newer.daily.date ? a.daily.ev[k] || 0 : 0, b.daily.date === newer.daily.date ? b.daily.ev[k] || 0 : 0)])),
      done: { ...(a.daily.date === newer.daily.date ? a.daily.done : {}), ...(b.daily.date === newer.daily.date ? b.daily.done : {}) },
      streak: streakSrc.daily.streak || 0, last: streakSrc.daily.last || '',
      best: Math.max(a.daily.best || 0, b.daily.best || 0), fullDays: Math.max(a.daily.fullDays || 0, b.daily.fullDays || 0),
    },
  });
}
// cookie 備份：只放還原需要的欄位，壓成一行（約 1KB）；有效 400 天
const CK = 'sc_g';
function backupWrite(s) {
  try {
    const slim = { xp: s.xp, cheese: s.cheese, cnt: s.cnt, ach: Object.fromEntries(Object.keys(s.ach).map(k => [k, 1])), avatar: s.avatar, since: s.since,
      daily: { date: s.daily.date, streak: s.daily.streak, best: s.daily.best, last: s.daily.last, fullDays: s.daily.fullDays } };
    const v = btoa(unescape(encodeURIComponent(JSON.stringify(slim))));
    if (v.length < 3800) document.cookie = `${CK}=${v}; max-age=${400 * 86400}; path=/; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  } catch { /* 忽略 */ }
}
function backupRead() {
  try {
    const c = document.cookie.split('; ').find(x => x.startsWith(CK + '='));
    return c ? JSON.parse(decodeURIComponent(escape(atob(c.slice(CK.length + 1))))) : null;
  } catch { return null; }
}
let S = merge(backupRead(), store.get(KEY));
function save() {
  S = merge(store.get(KEY), S);          // 先合併其他分頁存的進度，再存
  store.set(KEY, S);
  backupWrite(S);
}
// 其他分頁更新進度：立刻合併並重畫
addEventListener('storage', e => {
  if (e.key !== KEY) return;
  if (e.newValue == null) { S = normalize(null); }   // 資料管理「全部清除」
  else { try { S = merge(S, JSON.parse(e.newValue)); } catch { return; } }
  renderHeader(); renderHomeCard(); if ($('#sheet-game')?.open) renderSheet();
});
// 申請持久保存（Chrome 等會依使用程度決定是否同意；不支援就略過）
try { navigator.storage?.persist?.().catch(() => {}); } catch { /* 忽略 */ }
/** 資料管理「全部清除」時一併清掉 cookie 備份 */
export function wipeGameBackup() { try { document.cookie = `${CK}=; max-age=0; path=/`; } catch { /* 忽略 */ } }
function rollDay() {
  const d = today();
  if (S.daily.date === d) return;
  S.daily = { ...S.daily, date: d, done: {}, ev: {} };
  save();
}

// 今天的三個任務：依日期固定抽（同一天每個人看到的一樣）
function seed(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function questsToday() {
  const d = today(); let h = seed('q' + d);
  const pool = QUESTS.slice(); const out = [];
  while (out.length < 3 && pool.length) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const [q] = pool.splice(h % pool.length, 1);
    if (q[0] === 'maze' && out.some(x => x[0] === 'pack')) continue;
    out.push(q);
  }
  return out.map(([id, ev, need, href]) => ({ id, ev, need, href, have: Math.min(need, S.daily.ev[ev] || 0), done: !!S.daily.done[id] }));
}

// ───── 記錄事件 ─────
let flushTimer = 0;
const pending = { xp: 0 };
export function track(ev, n = 1) {
  const rule = EVENTS[ev]; if (!rule) return;
  rollDay();
  S.cnt[ev] = (S.cnt[ev] || 0) + n;
  const before = S.daily.ev[ev] || 0;
  S.daily.ev[ev] = before + n;
  // 經驗值：每天有上限
  const [xpEach, cap] = rule;
  const countable = Math.max(0, Math.min(cap, before + n) - Math.min(cap, before));
  let gained = xpEach * countable;
  // 任務
  const lv0 = levelOf(S.xp);
  for (const q of questsToday()) {
    if (q.done || q.ev !== ev || (S.daily.ev[ev] || 0) < q.need) continue;
    S.daily.done[q.id] = Date.now(); S.cheese += QUEST_CHEESE; gained += QUEST_XP;
    toast(`✅ ${T('game.questDone', { q: T('game.q.' + q.id) })} +${QUEST_XP} XP`, 2600);
    bumpStreak();
    if (questsToday().every(x => x.done)) { S.daily.fullDays = (S.daily.fullDays || 0) + 1; gained += ALL_QUEST_XP; setTimeout(() => toast(`🧀 ${T('game.allDone')} +${ALL_QUEST_XP} XP`, 3000), 900); }
  }
  S.xp += gained;
  const newAch = checkAchievements();
  S.xp += newAch.length * ACH_XP;
  const lv1 = levelOf(S.xp);
  save();
  if (gained) { pending.xp += gained; clearTimeout(flushTimer); flushTimer = setTimeout(() => { floatXp(pending.xp); pending.xp = 0; }, 150); }
  newAch.forEach((id, i) => setTimeout(() => celebrate(id), 400 + i * 2200));
  if (lv1 > lv0) setTimeout(() => toast(`⬆️ ${T('game.levelUp', { n: lv1, t: T('game.t.' + titleKey(lv1)) })}`, 3400), newAch.length ? 2600 : 600);
  renderHeader(); renderHomeCard(); if ($('#sheet-game')?.open) renderSheet();
  document.dispatchEvent(new CustomEvent('sc:game', { detail: { ev, n } }));
}
function bumpStreak() {
  const d = today();
  if (S.daily.last === d) return;
  S.daily.streak = S.daily.last === yesterday() ? (S.daily.streak || 0) + 1 : 1;
  S.daily.best = Math.max(S.daily.best || 0, S.daily.streak);
  S.daily.last = d;
}
function checkAchievements() {
  const out = [];
  for (const [id, , cond] of ACH) {
    if (S.ach[id]) continue;
    try { if (cond(S.cnt, S)) { S.ach[id] = Date.now(); out.push(id); } } catch { /* 略 */ }
  }
  return out;
}

// ───── 畫面：小提示 ─────
function floatXp(n) {
  const btn = $('.game-btn'); if (!btn) return;
  const el = document.createElement('span'); el.className = 'xp-float'; el.textContent = `+${n} XP`;
  btn.appendChild(el); setTimeout(() => el.remove(), REDUCED ? 1200 : 1600);
}
function celebrate(id) {
  const a = ACH.find(x => x[0] === id); if (!a) return;
  const box = document.createElement('div'); box.className = 'ach-toast'; box.setAttribute('role', 'status');
  box.innerHTML = `${iconHtml(a[1])}<div><small>${esc(T('game.achUnlock'))}</small><b>${esc(T('game.a.' + id))}</b><span>+${ACH_XP} XP</span></div>`;
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('show'));
  if (!REDUCED) miceRun(3);
  setTimeout(() => { box.classList.remove('show'); setTimeout(() => box.remove(), 400); }, 3600);
}
// 幾隻小老鼠從畫面下方跑過
export function miceRun(n = 3) {
  if (REDUCED) return;
  const names = ['mouse-blue', 'mouse-yellow', 'mouse-green', 'mouse-red', 'mouse-lav'];
  for (let i = 0; i < n; i++) {
    const w = document.createElement('div'); w.className = 'mice-run'; w.style.setProperty('--d', `${i * 0.25}s`); w.style.setProperty('--b', `${8 + (i % 3) * 14}px`);
    w.innerHTML = spriteImg(names[(i + n) % names.length]);
    document.body.appendChild(w); setTimeout(() => w.remove(), 4200 + i * 250);
  }
}
const iconHtml = ic => ic.startsWith('i-') ? `<span class="ach-ic"><svg class="ic" aria-hidden="true"><use href="#${ic}"/></svg></span>` : `<span class="ach-ic sp">${spriteImg(ic)}</span>`;

// ───── 畫面：右上角頭像、冒險手冊、首頁任務卡 ─────
export const avatar = () => S.avatar && AVATARS.some(([n, lv]) => n === S.avatar && levelOf(S.xp) >= lv) ? S.avatar : 'mouse-blue';
function renderHeader() {
  const btn = $('.game-btn'); if (!btn) return;
  const lv = levelOf(S.xp);
  btn.querySelector('.game-av').innerHTML = spriteImg(avatar());
  btn.querySelector('.game-lv').textContent = `Lv.${lv}`;
  btn.title = `${T('game.title')} · Lv.${lv} ${T('game.t.' + titleKey(lv))}`;
  const n = questsToday().filter(q => !q.done).length;
  btn.classList.toggle('has-todo', n > 0);
}
function questRows(compact) {
  return questsToday().map(q => `<li class="quest${q.done ? ' done' : ''}"><span class="quest-ck" aria-hidden="true">${q.done ? '✓' : ''}</span><a href="${esc(href(q.href))}"><b>${esc(T('game.q.' + q.id))}</b>${q.need > 1 ? `<small>${q.have}/${q.need}</small>` : ''}</a><span class="quest-xp">+${QUEST_XP}</span></li>`).join('');
}
const href = p => (document.documentElement.dataset.base || '/').replace(/\/$/, '') + p;
function renderHomeCard() {
  const box = $('#quest-card'); if (!box) return;
  rollDay();
  const done = questsToday().filter(q => q.done).length;
  box.querySelector('.quest-list').innerHTML = questRows(true);
  box.querySelector('.quest-meta').innerHTML = `<span>${esc(T('game.progress', { a: done, b: 3 }))}</span>${S.daily.streak > 1 ? `<span class="badge b-pink">🔥 ${esc(T('game.streak', { n: S.daily.streak }))}</span>` : ''}<span class="badge b-lemon">🧀 ${S.cheese}</span>`;
}
function renderSheet() {
  const d = $('#sheet-game'); if (!d) return;
  rollDay();
  const lv = levelOf(S.xp), cur = xpAt(lv), next = xpAt(lv + 1), pct = Math.round(((S.xp - cur) / (next - cur)) * 100);
  $('.gm-av', d).innerHTML = spriteImg(avatar());
  $('.gm-title', d).textContent = T('game.t.' + titleKey(lv));
  $('.gm-lv', d).textContent = `Lv.${lv}`;
  $('.gm-xp', d).textContent = `${fmt(S.xp)} / ${fmt(next)} XP`;
  $('.gm-bar i', d).style.width = pct + '%';
  $('.gm-cheese', d).textContent = String(S.cheese);
  $('.gm-streak', d).textContent = String(S.daily.streak || 0);
  $('.gm-best', d).textContent = String(S.daily.best || 0);
  $('.gm-quests', d).innerHTML = questRows(false);
  const unlocked = Object.keys(S.ach).length;
  $('.gm-ach-sum', d).textContent = `${unlocked} / ${ACH.length}`;
  $('.gm-ach', d).innerHTML = ACH.map(([id, ic]) => `<li class="${S.ach[id] ? 'on' : ''}" title="${esc(T('game.a.' + id + '.d'))}">${iconHtml(ic)}<b>${esc(T('game.a.' + id))}</b><small>${esc(T('game.a.' + id + '.d'))}</small></li>`).join('');
  $('.gm-avatars', d).innerHTML = AVATARS.map(([n, need]) => `<button type="button" class="gm-avatar${avatar() === n ? ' on' : ''}" data-avatar="${n}" ${lv >= need ? '' : 'disabled'} title="${lv >= need ? esc(T('game.pick')) : esc(T('game.unlockAt', { n: need }))}">${spriteImg(n)}<small>${lv >= need ? '' : 'Lv.' + need}</small></button>`).join('');
  const nextTitle = TITLES.slice().reverse().find(([l]) => l > lv);
  $('.gm-next', d).textContent = nextTitle ? T('game.nextTitle', { n: nextTitle[0], t: T('game.t.' + nextTitle[1]) }) : T('game.maxTitle');
}

// ───── 匯出／匯入 ─────
function exportCode() {
  const json = JSON.stringify(S);
  const b = btoa(unescape(encodeURIComponent(json)));
  return 'SCG1.' + b;
}
function importCode(code) {
  const m = String(code || '').trim().match(/^SCG1\.([A-Za-z0-9+/=]+)$/);
  if (!m) return false;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    // 合併：經驗值取大、計數取大、成就聯集
    S = merge(S, o); save(); renderHeader(); renderHomeCard(); renderSheet();
    return true;
  } catch { return false; }
}

// ───── 啟動 ─────
export function init() {
  if (!store.get(KEY) && backupRead()) save();   // localStorage 被清掉：用 cookie 備份還原
  rollDay();
  renderHeader(); renderHomeCard();
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act="game"]');
    if (t) { e.preventDefault(); renderSheet(); openSheet('sheet-game'); return; }
    const av = e.target.closest('[data-avatar]');
    if (av && !av.disabled) { S.avatar = av.dataset.avatar; save(); renderHeader(); renderSheet(); return; }
    if (e.target.closest('[data-act="game-export"]')) {
      const ta = $('#gm-code'); ta.value = exportCode(); ta.hidden = false; ta.select();
      navigator.clipboard?.writeText(ta.value).then(() => toast(T('game.copied'))).catch(() => {});
      return;
    }
    if (e.target.closest('[data-act="game-import"]')) {
      const code = prompt(T('game.importPrompt')); if (code == null) return;
      toast(importCode(code) ? T('game.imported') : T('game.importBad'), 2600);
    }
  });
  // 每天第一次來訪、看心得文
  track('visit');
  if (document.body.classList.contains('page-post')) track('posts.read');
  if (document.body.classList.contains('page-home')) eggs();
}
// ───── 首頁彩蛋：連點鼠王 5 下跳舞、Konami 密碼（或長按鼠王）下老鼠雨 ─────
const RAT_SEL = '.hero .guide .rat, .quest-head .quest-sp';
function eggs() {
  let taps = 0, tapTimer = 0, press = 0;
  document.addEventListener('click', e => {
    const rat = e.target.closest(RAT_SEL); if (!rat) return;
    clearTimeout(tapTimer); taps++; tapTimer = setTimeout(() => { taps = 0; }, 900);
    rat.classList.remove('bop'); void rat.offsetWidth; rat.classList.add('bop');
    if (taps >= 5) { taps = 0; ratDance(); }
  });
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let pos = 0;
  addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = k === KONAMI[pos] ? pos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (pos === KONAMI.length) { pos = 0; mouseRain(); }
  });
  document.addEventListener('pointerdown', e => { if (e.target.closest(RAT_SEL)) press = setTimeout(mouseRain, 1500); });
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => clearTimeout(press)));
  document.addEventListener('contextmenu', e => { if (e.target.closest(RAT_SEL)) e.preventDefault(); });
}
function ratDance() {
  document.body.classList.add('rat-dance');
  setTimeout(() => document.body.classList.remove('rat-dance'), 4200);
  toast(T('game.eggDance'), 2600);
  miceRun(5);
  track('egg.dance');
}
function mouseRain() {
  if ($('.mouse-rain')) return;
  const names = ['mouse-blue', 'mouse-yellow', 'mouse-green', 'mouse-red', 'mouse-lav', 'mouse-crown', 'mouse-love'];
  const box = document.createElement('div'); box.className = 'mouse-rain'; box.setAttribute('aria-hidden', 'true');
  const n = REDUCED ? 8 : 26;
  for (let i = 0; i < n; i++) {
    const w = document.createElement('div');
    w.style.left = `${(i / n) * 100 + Math.random() * 3}%`; w.style.setProperty('--d', `${Math.random() * 1.8}s`); w.style.setProperty('--t', `${2.4 + Math.random() * 1.6}s`);
    w.innerHTML = spriteImg(names[i % names.length]); box.appendChild(w);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 5600);
  toast(T('game.eggRain'), 2600);
  track('egg.rain');
}
init();
initStats();
