// 星詠魔力工具站：全站共用腳本（主題、版面、語言、設定、工具函式）
const html = document.documentElement;
export const LANG = html.dataset.lang || 'zh';
export const BASE = html.dataset.base || '/';
export const PREVIEW = html.dataset.preview === '1';
const DICT = (() => { try { return JSON.parse(document.getElementById('i18n').textContent); } catch { return {}; } })();

/** 取得翻譯字串，支援 {name} 參數 */
export function T(key, vars) {
  let s = DICT['js.' + key] ?? DICT[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// ───── localStorage（無痕模式也不會壞）─────
// 外觀、版面、語言偏好另存一份在 window.name：瀏覽器封鎖儲存空間（例如內嵌預覽、無痕）時，換頁也不會跑掉
const PREF_KEYS = new Set(['sc.theme', 'sc.layout', 'sc.lang', 'sc.langHint', 'sc.welcome', 'sc.visited']), NAME_TAG = 'sc-prefs:';
const namePrefs = () => { try { return window.name.startsWith(NAME_TAG) ? JSON.parse(window.name.slice(NAME_TAG.length)) || {} : {}; } catch { return {}; } };
export const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 忽略 */ } },
  raw(k, fallback = null) {
    let v = null;
    try { v = localStorage.getItem(k); } catch { /* 忽略 */ }
    if (v == null && PREF_KEYS.has(k)) v = namePrefs()[k] ?? null;
    return v ?? fallback;
  },
  setRaw(k, v) {
    try { localStorage.setItem(k, v); } catch { /* 忽略 */ }
    if (PREF_KEYS.has(k)) { try { window.name = NAME_TAG + JSON.stringify({ ...namePrefs(), [k]: v }); } catch { /* 忽略 */ } }
  },
};

// 回訪判斷：之前（另一次開啟瀏覽器分頁時）來過本站。同一次瀏覽中換頁不算回訪。
// localStorage 被擋時改用 cookie 記，星野導覽等「第一次才出現」的東西就不會每次都跳出來。
export const RETURNING = (() => {
  let ret = null;
  try { ret = sessionStorage.getItem('sc.ret'); } catch { /* 忽略 */ }
  if (ret != null) return ret === '1';
  let cookie = false;
  try { cookie = document.cookie.split('; ').some(c => c === 'sc_v=1'); } catch { /* 忽略 */ }
  const was = cookie || !!store.raw('sc.visited');
  store.setRaw('sc.visited', '1');
  try { document.cookie = `sc_v=1; max-age=${400 * 86400}; path=/; samesite=lax`; } catch { /* 忽略 */ }
  try { sessionStorage.setItem('sc.ret', was ? '1' : '0'); } catch { /* 忽略 */ }
  return was;
})();

// ───── 字串與數字 ─────
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const NF = new Intl.NumberFormat(LANG === 'ko' ? 'ko-KR' : 'zh-TW');
const NFD = new Map();   // 小數位數 → 格式器（建立 Intl.NumberFormat 很慢，快取起來重複用）
const nfd = d => NFD.get(d) || NFD.set(d, new Intl.NumberFormat(LANG === 'ko' ? 'ko-KR' : 'zh-TW', { maximumFractionDigits: d, minimumFractionDigits: 0 })).get(d);
export const fmt = (n, d = 0) => (n == null || !isFinite(n) ? '–' : (d ? nfd(d).format(n) : NF.format(Math.round(n))));
/** 以「萬／만」為單位的精簡寫法：1,250,000 → 125萬 */
export function fmtWan(n) {
  if (n == null || !isFinite(n)) return '–';
  const unitWan = LANG === 'ko' ? '만' : '萬', unitYi = LANG === 'ko' ? '억' : '億';
  const a = Math.abs(n);
  if (a >= 1e8) return fmt(n / 1e8, 2) + unitYi;
  if (a >= 1e4) return fmt(n / 1e4, a >= 1e6 ? 1 : 2) + unitWan;
  return fmt(n);
}
/** 解析「250萬」「12十萬」「1.5百萬」「3k」「2m」「250만」等寫法 */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').trim().replace(/[,\s，_]/g, '').normalize('NFKC');
  if (!s) return NaN;
  const units = [['千萬', 1e7], ['百萬', 1e6], ['十萬', 1e5], ['億', 1e8], ['萬', 1e4], ['千', 1e3], ['억', 1e8], ['만', 1e4], ['천', 1e3], ['k', 1e3], ['K', 1e3], ['m', 1e6], ['M', 1e6], ['w', 1e4], ['W', 1e4]];
  let total = 0, matched = false;
  // 支援「1億2000萬」這類複合寫法
  const re = /(\d+(?:\.\d+)?)(千萬|百萬|十萬|億|萬|千|억|만|천|[kKmMwW])?/g;
  let m, consumed = '';
  while ((m = re.exec(s))) {
    const u = units.find(([k]) => k === m[2]);
    total += parseFloat(m[1]) * (u ? u[1] : 1);
    consumed += m[0];
    matched = true;
  }
  if (!matched || consumed.length !== s.length) return NaN;
  return total;
}
export function normName(s) {
  return String(s ?? '').normalize('NFKC').trim().replace(/[［【]/g, '[').replace(/[］】]/g, ']').replace(/\s+/g, ' ').replace(/药/g, '藥');
}
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** 顯示用名稱：韓文站有韓文名就用韓文，否則中文（資料比對一律用中文的 n） */
export const dn = r => (LANG === 'ko' && r && r.kn) ? r.kn : (r?.n ?? '');

// ───── 匯率（全站共用，存在瀏覽器）─────
// 預設：1 台幣 = 40 魔晶；3,000 魔晶 = 100 萬魔幣。其他法幣依每日匯率由台幣換算。
const RATE_KEY = 'sc.rates.v2';
const RATE_DEFAULT = { crystalPerMil: 3000, crystalPerTwd: 40, fiat: LANG === 'ko' ? 'KRW' : 'TWD' };
export const FIATS = ['TWD', 'HKD', 'CNY', 'KRW', 'USD'];
const FIAT_SYMBOL = { TWD: 'NT$', HKD: 'HK$', CNY: 'CN¥', KRW: '₩', USD: 'US$' };
// 1 台幣可換多少外幣（2026-10-12 備援值；正式站會改用 /api/fx.php 的每日匯率）
let FX = { rates: { TWD: 1, HKD: 0.245745, CNY: 0.2099, KRW: 41.940143, USD: 0.031285 }, date: '2026-10-12', live: false };
try { const c = JSON.parse(localStorage.getItem('sc.fx') || 'null'); if (c?.rates?.USD && Date.now() - c.t < 12 * 3600e3) FX = { ...c, live: true }; } catch { /* 忽略 */ }
export const rates = {
  get() {
    const v = { ...RATE_DEFAULT, ...(store.get(RATE_KEY) || {}) };
    if (!(v.crystalPerMil > 0)) v.crystalPerMil = RATE_DEFAULT.crystalPerMil;
    if (!(v.crystalPerTwd > 0)) v.crystalPerTwd = RATE_DEFAULT.crystalPerTwd;
    if (!FIATS.includes(v.fiat)) v.fiat = RATE_DEFAULT.fiat;
    return v;
  },
  set(patch) {
    const v = { ...this.get(), ...patch };
    store.set(RATE_KEY, v);
    window.dispatchEvent(new CustomEvent('rates', { detail: v }));
    return v;
  },
  fx() { return FX; },
  /** 魔晶 → 等值魔幣 */
  crystalToCoin(c, r = this.get()) { return (c * 1e6) / r.crystalPerMil; },
  coinToCrystal(g, r = this.get()) { return (g / 1e6) * r.crystalPerMil; },
  /** 1 單位法幣可換多少魔晶 */
  crystalPerFiat(cur = this.get().fiat, r = this.get()) { return r.crystalPerTwd / (FX.rates[cur] || 1); },
  crystalToFiat(c, cur = this.get().fiat, r = this.get()) { return (c / r.crystalPerTwd) * (FX.rates[cur] || 1); },
  fiatToCrystal(v, cur = this.get().fiat, r = this.get()) { return (v / (FX.rates[cur] || 1)) * r.crystalPerTwd; },
  /** 依目前選的法幣顯示金額，例如 NT$1,333、₩55,900 */
  fiatText(crystal, cur = this.get().fiat) {
    const v = this.crystalToFiat(crystal, cur);
    const d = cur === 'KRW' ? 0 : v < 100 ? 2 : 0;
    return FIAT_SYMBOL[cur] + fmt(v, d);
  },
  symbol(cur = this.get().fiat) { return FIAT_SYMBOL[cur]; },
};
// 取得每日匯率（伺服器快取 12 小時）
export async function loadFx() {
  if (FX.live) return FX;
  try {
    const d = await api('fx');
    if (d?.rates?.USD) {
      FX = { rates: d.rates, date: d.date, live: !d.fallback, t: Date.now() };
      try { localStorage.setItem('sc.fx', JSON.stringify(FX)); } catch { /* 忽略 */ }
      window.dispatchEvent(new CustomEvent('rates', { detail: rates.get() }));
    }
  } catch { /* 用備援值 */ }
  return FX;
}

// ───── API ─────
export async function api(name, params = {}, { timeout = 30000 } = {}) {
  if (PREVIEW) return demoApi(name, params); // 預覽版沒有後端，直接用示範資料
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => sp.append(k + '[]', x));
    else if (v !== '' && v != null) sp.append(k, v);
  }
  if (LANG === 'ko') sp.append('lang', 'ko');   // 韓文站：名稱附韓文（kn），關鍵字可用韓文
  const qs = sp.toString();
  const url = `${BASE}api/${name}.php${qs ? '?' + qs : ''}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw Object.assign(new Error('bad-response'), { status: r.status });
    const data = await r.json();
    if (!r.ok || data.ok === false) throw Object.assign(new Error(data.error || 'http-' + r.status), { status: r.status, data });
    return data;
  } catch (e) {
    if (PREVIEW) return demoApi(name, params);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function demoApi(name, params) {
  const now = Math.floor(Date.now() / 1000);
  if (name === 'batch') return demoBatch(params.n || [], now);
  const r = await fetch(`${BASE}assets/demo/${name}.json`);
  const d = await r.json();
  const q = String(params.q ?? '').trim();
  const has = list => (list || []).some(x => x.n.includes(q));
  // 示範資料沒有的關鍵字：依名稱產生固定的示範攤位與成交紀錄，讓預覽能試任何商品
  if (name === 'market' && q && !has(d.items) && !has(d.pets)) {
    const b = (await demoBatch([q], now)).results[q];
    return { ...d, ...b, q, totalStalls: b.stalls.length, receivedStalls: b.stalls.length, expiredStalls: 0, truncated: false, complete: true };
  }
  if (name === 'history') {
    let logs = (d.logs || []).map(l => ({ ...l, t: l.t + (now - d.fetchedAt) }));
    if (q && !has(logs)) logs = demoLogs(q, now, (await demoBatch([q], now)).results[q].items);
    return { ...d, q, logs, total: logs.length, demo: true, fetchedAt: now - 7, age: 7 };
  }
  return { ...d, q: params.q ?? d.q, demo: true, fetchedAt: now - 7, age: 7 };
}
function demoLogs(n, now, items) {
  const coin = items.find(i => !i.c)?.p || 500, crystal = items.find(i => i.c)?.p;
  const logs = [];
  let s = [...n].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 11);
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) % 1000) / 1000;
  for (let i = 0; i < 70; i++) {
    const t = now - Math.floor(i * 9.5 * 3600 + rnd() * 3600);
    const c = crystal && rnd() < 0.25 ? 1 : 0;
    const base = c ? crystal : coin;
    const drift = 1 + 0.12 * Math.sin(i / 9);
    logs.push({ id: 9000000 - i, t, n, q: 1 + Math.floor(rnd() * 3), p: Math.max(1, Math.round(base * drift * (0.85 + rnd() * 0.3))), c });
  }
  return logs;
}
// 預覽用：依名稱產生固定的示範攤位（正式站不會用到）
async function demoBatch(names, now) {
  const base = await (await fetch(`${BASE}assets/demo/market.json`)).json();
  const h = s => [...s].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7);
  const results = {};
  for (const n of names) {
    const real = (base.items || []).filter(i => i.n.replace(/^\[(.*)\]$/, '$1') === n);
    if (real.length) { results[n] = { ...base, items: real, pets: [], fetchedAt: now - 7, age: 7, demo: true }; continue; }
    const k = h(n), stalls = [], items = [];
    const price = 200 + (k % 50) * 90;
    for (let i = 0; i < 4 + (k % 4); i++) {
      const x = 150 + ((k >> (i + 1)) % 100), y = 80 + ((k >> (i + 3)) % 70);
      stalls.push({ n: ['小星的雜貨鋪', '法蘭城口', '便宜賣', '晚安攤', '水晶大特價', '魔晶批發', '寵物專賣'][(k + i) % 7], sv: 1 + ((k + i) % 3), x, y, loc: `法蘭城 [東:${x} 南:${y}]`, exp: '' });
      items.push({ s: i, n, id: 0, p: Math.round(price * (0.9 + ((k >> i) % 30) / 100)), c: (k + i) % 4 === 0 ? 1 : 0, q: 1 + ((k >> (i + 2)) % 5), lv: 1 });
      if (items[i].c === 1) items[i].p = Math.max(1, Math.round(items[i].p / 300));
    }
    results[n] = { ok: true, stalls, items, pets: [], pages: { fetched: 1, total: 1, failed: [] }, fetchedAt: now - 7, age: 7, demo: true };
  }
  return { ok: true, results, failed: [], demo: true, fetchedAt: now - 7 };
}

// ───── 寵物圖片：優先走本站快取，失敗改用攻略網原圖 ─────
// ───── 角色動畫：依情境顯示（減少動態效果時改用靜態圖）─────
let SPR = null;
export function spriteImg(name, cls = '') {
  try { SPR ||= JSON.parse(document.body.dataset.sprites || '{}'); } catch { SPR = {}; }
  const s = SPR[name];
  if (!s) return '';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return `<img class="sp-img${cls ? ' ' + cls : ''}" src="${still ? s[1] : s[0]}" width="${s[2]}" height="${s[3]}" alt="" decoding="async">`;
}
// 點一下才展開的說明（與樣板的 {{tip:…}} 相同）
export const tipHtml = (text, withLabel = false) => `<details class="tip${withLabel ? ' tip-l' : ''}"><summary title="${esc(T('common.moreInfo'))}"${withLabel ? '' : ` aria-label="${esc(T('common.moreInfo'))}"`}><svg class="ic" aria-hidden="true"><use href="#i-info"/></svg>${withLabel ? `<span>${esc(T('common.moreInfo'))}</span>` : ''}</summary><div class="tip-body">${esc(text)}</div></details>`;
// 同時只開一個說明；點其他地方或按 Esc 就收起
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('tip') || !d.open) return;
  document.querySelectorAll('details.tip[open]').forEach(x => { if (x !== d) x.open = false; });
}, true);
document.addEventListener('click', e => { if (!e.target.closest('details.tip')) document.querySelectorAll('details.tip[open]').forEach(x => { x.open = false; }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('details.tip[open]').forEach(x => { x.open = false; }); });
// 空狀態：角色＋標題＋說明
export const emptyState = (pose, title, tip = '') =>
  `<div class="empty">${spriteImg(pose)}<b>${esc(title)}</b>${tip ? `<p>${esc(tip)}</p>` : ''}</div>`;
// 載入中：冒險者在跑道上跑
export const runningState = text =>
  `<div class="sp-loading" role="status"><div class="sp-track">${spriteImg('car-run', 'sp-runner')}</div><span>${esc(text)}</span></div>`;

export function petImgSrc(id) {
  const n = String(id ?? '').match(/\d+/)?.[0];
  if (!n) return '';
  return PREVIEW ? `https://guide.starcg.net/pet/${n}.gif` : `${BASE}img/pets/${n}.gif`;
}
const PET_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="#E8CDB8"><ellipse cx="12" cy="15.6" rx="4.6" ry="4"/><ellipse cx="6.2" cy="10.5" rx="1.9" ry="2.4"/><ellipse cx="17.8" cy="10.5" rx="1.9" ry="2.4"/><ellipse cx="9.4" cy="6.3" rx="1.9" ry="2.5"/><ellipse cx="14.6" cy="6.3" rx="1.9" ry="2.5"/></g></svg>');
/** 道具圖片（市場資料的圖片編號）：本站快取，第一次由伺服器向官方取 */
export function itemImgSrc(im) {
  const n = String(im ?? '').match(/\d+/)?.[0];
  if (!n) return '';
  return PREVIEW ? `https://member.starcg.net/metamo/item/${n}.gif` : `${BASE}img/items/${n}.gif`;
}
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.item) { img.hidden = true; return; }   // 官方沒有這張道具圖：不顯示
  if (img.tagName !== 'IMG' || !img.dataset.pet) return;
  if (img.dataset.fallback === '2') return;
  if (!img.dataset.fallback && !PREVIEW) {
    img.dataset.fallback = '1';
    img.src = `https://guide.starcg.net/pet/${img.dataset.pet}.gif`;
  } else {
    img.dataset.fallback = '2';
    img.src = PET_PLACEHOLDER;
    img.style.opacity = '.6';
  }
}, true);

// ───── 寵物圖鑑資料（快取在記憶體與 sessionStorage）─────
let petsPromise = null;
export function loadPets() {
  if (!petsPromise) {
    // 走 api/pets.php：資料超過一天沒更新時伺服器會先向攻略網同步再回；失敗再退回靜態檔
    petsPromise = fetch(`${BASE}api/pets.php`, { cache: 'no-cache' }).then(r => r.ok ? r : Promise.reject(r.status)).catch(() => fetch(`${BASE}data/pets.json`, { cache: 'no-cache' })).then(r => r.json()).then(list => list.map(p => ({
      ...p,
      imageId: String(p.imageId ?? '').match(/\d+/)?.[0] || '',
      cardTier: p.cardTier || '',
      bp: [p.hp, p.power, p.defense, p.speed, p.magic].map(Number),
    })));
  }
  return petsPromise;
}

// ───── 提示訊息 ─────
let toastTimer;
export function toast(msg, ms = 1800) {
  const el = $('.toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(T('copied'));
}
export function downloadCsv(filename, rows) {
  const csv = '﻿' + rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ───── 外觀、版面、語言 ─────
function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  html.dataset.theme = dark ? 'dark' : 'light';
  html.dataset.themePref = pref;
}
function applyLayout(pref) {
  const vp = $('#vp');
  const small = Math.min(screen.width, innerWidth) <= 820;
  html.dataset.layoutPref = pref;
  html.dataset.view = pref === 'mobile' || (pref === 'auto' && small) ? 'mobile' : 'desktop';
  vp.setAttribute('content', pref === 'desktop' && screen.width < 820 ? 'width=1200' : 'width=device-width, initial-scale=1, viewport-fit=cover');
  if (pref === 'mobile' && !small) html.dataset.frame = '1'; else delete html.dataset.frame;
}
function syncSeg() {
  $$('.seg[data-pref]').forEach(seg => {
    const cur = seg.dataset.pref === 'theme' ? html.dataset.themePref : html.dataset.layoutPref;
    $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.value === (cur || 'auto'))));
  });
  $$('#sheet-settings [data-lang]').forEach(a => a.classList.toggle('on', a.dataset.lang === LANG));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if ((html.dataset.themePref || 'auto') === 'auto') applyTheme('auto'); });
// 按「上一頁」從快取還原，或在其他分頁改了設定時，重新套用目前的偏好
const reapplyPrefs = () => {
  const th = store.raw('sc.theme', 'auto'), ly = store.raw('sc.layout', 'auto');
  if (th !== html.dataset.themePref || (th === 'auto')) applyTheme(th);
  if (ly !== html.dataset.layoutPref) applyLayout(ly);
  syncSeg();
};
addEventListener('pageshow', e => { if (e.persisted) reapplyPrefs(); });
addEventListener('storage', e => { if (e.key === 'sc.theme' || e.key === 'sc.layout') reapplyPrefs(); });
addEventListener('resize', debounce(() => { if ((html.dataset.layoutPref || 'auto') === 'auto') applyLayout('auto'); }, 200));

// ───── 導覽：電腦版大分類下拉、手機版漢堡選單 ─────
function toggleDropdown(btn, open) {
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  if (!panel) return;
  // 滑鼠剛移入時已經展開，這時的點擊不要又把它收起來
  const justHovered = Date.now() - Number(btn.closest('.nav-dd')?.dataset.hoverAt || 0) < 600;
  const show = open ?? (justHovered || btn.getAttribute('aria-expanded') !== 'true');
  if (show) $$('.nav-dd-btn[aria-expanded="true"]').forEach(b => { if (b !== btn) { b.setAttribute('aria-expanded', 'false'); document.getElementById(b.getAttribute('aria-controls')).hidden = true; } });
  btn.setAttribute('aria-expanded', String(show)); panel.hidden = !show;
}
const closeDropdowns = () => $$('.nav-dd-btn[aria-expanded="true"]').forEach(b => toggleDropdown(b, false));
function toggleMenu(open) {
  const m = document.getElementById('mnav'); if (!m) return;
  const show = open ?? m.hidden;
  m.hidden = !show; document.querySelector('.mnav-scrim').hidden = !show;
  $$('[data-act="menu"]').forEach(b => b.setAttribute('aria-expanded', String(show)));
  html.classList.toggle('menu-open', show);
}
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-dd')) closeDropdowns();
  if (e.target.closest('#mnav a, #mnav [data-act="game"]')) toggleMenu(false);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.nav-dd-btn[aria-expanded="true"]');
  if (open) { closeDropdowns(); open.focus(); }
  if (!document.getElementById('mnav')?.hidden) { toggleMenu(false); document.querySelector('.menu-btn')?.focus(); }
});
// 滑鼠移入就展開（有滑鼠的裝置）；移出稍等再收起
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  $$('.nav-dd').forEach(dd => {
    let timer;
    dd.addEventListener('mouseenter', () => { clearTimeout(timer); if (dd.querySelector('.nav-dd-btn').getAttribute('aria-expanded') !== 'true') dd.dataset.hoverAt = Date.now(); toggleDropdown(dd.querySelector('.nav-dd-btn'), true); });
    dd.addEventListener('mouseleave', () => { timer = setTimeout(() => toggleDropdown(dd.querySelector('.nav-dd-btn'), false), 220); });
  });
}
addEventListener('pageshow', () => { closeDropdowns(); toggleMenu(false); });

export function openSheet(id) {
  toggleMenu(false);
  $$('dialog.sheet[open]').forEach(d => d.close());
  const d = document.getElementById(id);
  if (!d) return;
  syncSeg();
  d.showModal();
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'theme') {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    store.setRaw('sc.theme', next); applyTheme(next); syncSeg();
  } else if (act === 'settings') { e.preventDefault(); openSheet('sheet-settings'); }
  else if (act === 'menu') { toggleMenu(); }
  else if (act === 'menu-close') { toggleMenu(false); }
  else if (act === 'dd') { toggleDropdown(t); }
  else if (act === 'sponsor' && document.getElementById('sheet-sponsor')) { e.preventDefault(); openSheet('sheet-sponsor'); }
  else if (act === 'close') { t.closest('dialog')?.close(); }
  else if (act === 'lang') { store.setRaw('sc.lang', t.dataset.lang); }
  else if (act === 'install') { installPrompt?.prompt(); }
  else if (act === 'welcome') { openWelcome(true); }
  else if (act === 'wel-done') { store.setRaw('sc.welcome', '1'); t.closest('dialog')?.close(); }
  else if (act === 'wel-other') { showWelcomeSteps('all'); }
});
// ───── 第一次來：教你加到我的最愛／手機桌面（之後可放教學影片）─────
const OS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop';
function showWelcomeSteps(which) {
  $$('#sheet-welcome .wel-step').forEach(el => { el.hidden = which !== 'all' && el.dataset.os !== which; });
  const other = $('#sheet-welcome .wel-other'); if (other) other.hidden = which === 'all';
  const mac = /Mac/i.test(navigator.platform);
  $$('#sheet-welcome [data-key]').forEach(el => { el.textContent = mac ? '⌘ + D' : 'Ctrl + D'; });
}
function mountWelcomeVideo() {
  const box = $('#wel-video'); if (!box || box.dataset.ready) return;
  const src = box.dataset.src;
  if (!src) return;
  box.dataset.ready = '1';
  const yt = src.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  box.innerHTML = yt
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0" title="${esc(T('wel.title'))}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<video src="${esc(src)}" controls playsinline preload="metadata"></video>`;
}
export function openWelcome(force) {
  const d = document.getElementById('sheet-welcome');
  if (!d || (!force && (store.raw('sc.welcome') || matchMedia('(display-mode: standalone)').matches))) return;
  showWelcomeSteps(OS);
  mountWelcomeVideo();
  openSheet('sheet-welcome');
}
if (!PREVIEW || html.dataset.standalone !== '1') setTimeout(() => openWelcome(false), 900);
document.addEventListener('click', e => {
  const seg = e.target.closest('.seg[data-pref] button');
  if (!seg) return;
  const kind = seg.parentElement.dataset.pref, v = seg.value;
  store.setRaw('sc.' + kind, v);
  if (kind === 'theme') applyTheme(v); else applyLayout(v);
  syncSeg();
});
// 點背景關閉面板；手機上往下滑關閉
$$('dialog.sheet').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  let y0 = null;
  d.addEventListener('touchstart', e => { y0 = d.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  d.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) d.close(); y0 = null; });
});

// 第一次來訪：瀏覽器語言是韓文、目前在中文頁 → 輕提示
(function suggestLang() {
  if (store.raw('sc.lang') || store.raw('sc.langHint')) return;
  const nav = (navigator.languages || [navigator.language || '']).join(',').toLowerCase();
  const wantKo = LANG === 'zh' && /(^|,)ko/.test(nav);
  const wantZh = LANG === 'ko' && /(^|,)zh/.test(nav);
  if (!wantKo && !wantZh) return;
  store.setRaw('sc.langHint', '1');
  const a = $('.lang-btn');
  if (!a) return;
  const bar = document.createElement('div');
  bar.className = 'notice info';
  bar.style.cssText = 'max-width:1240px;margin:10px auto 0';
  bar.innerHTML = `<svg class="ic"><use href="#i-sparkle"/></svg><span>${wantKo ? '한국어 페이지가 있어요.' : '本站也有繁體中文版。'} <a href="${a.getAttribute('href')}" data-act="lang" data-lang="${wantKo ? 'ko' : 'zh'}">${wantKo ? '한국어로 보기 →' : '切換為繁體中文 →'}</a></span>`;
  $('main').prepend(bar);
})();

// ───── PWA ─────
let installPrompt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $$('.install').forEach(el => (el.hidden = false));
});
if ('serviceWorker' in navigator && !PREVIEW && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
addEventListener('offline', () => toast(T('offline'), 3000));

// 讓主要內容在換頁後取得焦點（螢幕閱讀器友善）
if (location.hash === '') $('#main')?.setAttribute('tabindex', '-1');
