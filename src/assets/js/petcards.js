// 寵物養成卡＋擂台：可翻面的收藏卡（圖、星級、五檔雷達圖），拖兩張到擂台，用傷害公式跑簡短動畫對戰
import { $, $$, T, esc, fmt, store, toast, copy, petImgSrc, normName, spriteImg, LANG } from './core.js';
import { battleStats, runBattle, cardStars, raceBonus } from './petbattle.js';
import { tierOf } from './petcalc.js';

const KEY = 'sc.petcards', MAX = 40;
const TIER_KEY = { '金': 'gold', '銀': 'silver', '普': 'normal' };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
let PETS = [], byName = new Map(), arena = [null, null], busy = false, showTab = () => {};
const dn = p => (LANG === 'ko' && p.kn) ? p.kn : p.name;
const getAlbum = () => (store.get(KEY, []) || []).filter(n => byName.has(normName(n)));
const setAlbum = list => { store.set(KEY, list.slice(0, MAX)); renderAlbum(); };
const raceLabel = r => { const k = 'race.' + r; const v = T(k); return v === k ? r : v; };

// ───── 五檔雷達圖（SVG）─────
function radar(bp) {
  const cx = 70, cy = 70, R = 52, max = 60;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5, r = R * Math.min(1, v / max); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const poly = vals => vals.map((v, i) => pt(i, v).map(n => n.toFixed(1)).join(',')).join(' ');
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<polygon points="${poly(Array(5).fill(max * f))}" class="rd-grid"/>`).join('');
  const axes = [0, 1, 2, 3, 4].map(i => { const [x, y] = pt(i, max); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="rd-axis"/>`; }).join('');
  const labels = [0, 1, 2, 3, 4].map(i => { const [x, y] = pt(i, max * 1.24); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" class="rd-lab">${esc(T('bp.' + i))}</text>`; }).join('');
  return `<svg class="pc-radar" viewBox="-6 -6 152 152" role="img" aria-label="${esc(T('pc.radar'))}">${grid}${axes}<polygon points="${poly(bp)}" class="rd-val"/>${labels}</svg>`;
}

function cardHtml(p) {
  const tier = tierOf(p.cardTier), tk = TIER_KEY[tier] || 'normal', stars = cardStars(p);
  const img = p.imageId ? `<img src="${petImgSrc(p.imageId)}" data-pet="${p.imageId}" alt="" width="96" height="96" loading="lazy" decoding="async">` : '';
  return `<div class="pc-card tier-${tk}" draggable="true" data-name="${esc(p.name)}">
    <button type="button" class="pc-inner" data-act="flip" aria-label="${esc(T('pc.flip', { n: dn(p) }))}" aria-pressed="false">
      <span class="pc-face pc-front">
        <span class="pc-top"><span class="pc-tier">${esc(T('card.' + tk))}</span><span class="pc-race">${esc(raceLabel(p.race))}</span></span>
        <span class="pc-img">${img}</span>
        <b class="pc-name"${LANG === 'ko' && p.kn ? '' : ' lang="zh-Hant"'}>${esc(dn(p))}</b>
        <span class="pc-stars" aria-label="${esc(T('pc.stars', { n: stars }))}">${'★'.repeat(stars)}<i>${'★'.repeat(5 - stars)}</i></span>
      </span>
      <span class="pc-face pc-back">
        <b class="pc-name sm"${LANG === 'ko' && p.kn ? '' : ' lang="zh-Hant"'}>${esc(dn(p))}</b>
        ${radar(p.bp)}
        <span class="pc-bp">${p.bp.map((v, i) => `<span>${esc(T('bp.' + i))}<b>${fmt(v, 0)}</b></span>`).join('')}</span>
      </span>
    </button>
    <span class="pc-actions">
      <button type="button" class="btn sm primary" data-act="fight">${esc(T('pc.toArena'))}</button>
      <button type="button" class="btn sm ghost icon" data-act="del" aria-label="${esc(T('common.remove'))}"><svg class="ic"><use href="#i-trash"/></svg></button>
    </span>
  </div>`;
}

function renderAlbum() {
  const list = getAlbum();
  const box = $('#pc-album');
  box.innerHTML = list.length ? list.map(n => cardHtml(byName.get(normName(n)))).join('')
    : `<div class="empty" style="grid-column:1/-1">${spriteImg('adv-look')}<b>${esc(T('pc.empty'))}</b><p>${esc(T('pc.emptyTip'))}</p></div>`;
  $('#pc-album-info').textContent = T('pc.albumInfo', { n: list.length, max: MAX });
  const c = $('#card-count'); c.hidden = !list.length; c.textContent = list.length;
}
export function addCard(name, quiet = false) {
  const p = byName.get(normName(name || ''));
  if (!p) { if (!quiet) toast(T('pc.notFound')); return false; }
  const list = getAlbum();
  if (list.some(n => normName(n) === normName(p.name))) { if (!quiet) toast(T('pc.already', { n: dn(p) })); return false; }
  if (list.length >= MAX) { toast(T('pc.full', { max: MAX })); return false; }
  setAlbum([p.name, ...list]);
  if (!quiet) toast(T('pc.added', { n: dn(p) }));
  return true;
}

// ───── 擂台 ─────
function slotHtml(p) {
  const img = p.imageId ? `<img src="${petImgSrc(p.imageId)}" data-pet="${p.imageId}" alt="" width="84" height="84" decoding="async">` : '';
  return `<span class="as-img">${img}</span><b${LANG === 'ko' && p.kn ? '' : ' lang="zh-Hant"'}>${esc(dn(p))}</b><button type="button" class="as-x" data-act="out" aria-label="${esc(T('common.remove'))}">×</button>`;
}
function renderArena() {
  $$('#arena .arena-slot').forEach((el, i) => {
    const p = arena[i];
    el.classList.toggle('filled', !!p);
    el.innerHTML = p ? slotHtml(p) : `<span class="arena-ph">${esc(T('pc.dropHere'))}</span>`;
  });
  $('#pc-fight').disabled = busy || !(arena[0] && arena[1]);
}
function putInArena(name, slot) {
  if (busy) return;
  const p = byName.get(normName(name)); if (!p) return;
  if (slot == null) slot = !arena[0] ? 0 : !arena[1] ? 1 : 1;
  arena[slot] = p;
  $('#arena-stage').hidden = true; $('#arena').classList.remove('fighting');
  renderArena();
  $('#arena').scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
}

const sleep = ms => new Promise(r => setTimeout(r, REDUCED ? 0 : ms));
function fighterHtml(s, side) {
  const p = byName.get(normName(s.name));
  const img = s.imageId ? `<img src="${petImgSrc(s.imageId)}" data-pet="${s.imageId}" alt="" width="110" height="110" decoding="async">` : '';
  return `<div class="ft ft-${side}" data-side="${side}">
    <b class="ft-name"${LANG === 'ko' && p?.kn ? '' : ' lang="zh-Hant"'}>${esc(dn(p || s))}</b>
    <span class="ft-hp"><i style="width:100%"></i></span><small class="ft-hpv">${fmt(s.hp)} / ${fmt(s.hp)}</small>
    <span class="ft-img">${img}</span>
    <small class="ft-stat">${esc(T(s.kind === 'magic' ? 'pc.kindMagic' : 'pc.kindPhys'))} · ${esc(T('pc.atkV', { v: fmt(s.kind === 'magic' ? s.spt : s.atk) }))} · ${esc(T('pc.agiV', { v: fmt(s.agi) }))}</small>
  </div>`;
}
async function fight() {
  if (busy || !arena[0] || !arena[1]) return;
  busy = true; renderArena();
  const lv = Math.max(1, Math.min(160, Math.floor(Number($('#pc-lv').value) || 100)));
  const A = battleStats(arena[0], lv), B = battleStats(arena[1], lv);
  const res = runBattle(A, B);
  const stage = $('#arena-stage'), logEl = $('#arena-log');
  $('#arena').classList.add('fighting');
  stage.hidden = false;
  const nm = x => dn(byName.get(normName(x.name)) || x);
  const ra = raceBonus(A.race, B.race);
  const match = ra > 0 ? T('pc.matchUp', { a: nm(A), b: nm(B), v: Math.round(ra * 100) }) : ra < 0 ? T('pc.matchUp', { a: nm(B), b: nm(A), v: Math.round(-ra * 100) }) : T('pc.matchNone');
  stage.innerHTML = `<p class="ft-match${ra ? ' on' : ''}">${esc(match)}</p>` + fighterHtml(A, 0) + `<div class="ft-mid"><span class="ft-turn"></span></div>` + fighterHtml(B, 1);
  logEl.innerHTML = '';
  const S = [A, B];
  for (const e of res.log) {
    const att = $(`.ft-${e.from}`, stage), tgt = $(`.ft-${1 - e.from}`, stage);
    $('.ft-turn', stage).textContent = T('pc.turn', { n: e.turn });
    att.classList.remove('lunge'); void att.offsetWidth; att.classList.add('lunge');
    await sleep(260);
    tgt.classList.remove('hit'); void tgt.offsetWidth; tgt.classList.add('hit');
    const pop = document.createElement('span');
    pop.className = 'ft-pop' + (e.crit ? ' crit' : '') + (e.race > 0 ? ' race' : '');
    pop.textContent = (e.crit ? T('pc.crit') + ' ' : '') + fmt(e.dmg);
    if (e.race) { const t = document.createElement('small'); t.textContent = T(e.race > 0 ? 'pc.raceUp' : 'pc.raceDown'); pop.append(t); }
    $('.ft-img', tgt).append(pop); setTimeout(() => pop.remove(), 900);
    const max = S[1 - e.from].hp;
    $('.ft-hp i', tgt).style.width = `${(e.left / max) * 100}%`;
    $('.ft-hpv', tgt).textContent = `${fmt(e.left)} / ${fmt(max)}`;
    const li = document.createElement('li');
    li.textContent = T(e.crit ? 'pc.logCrit' : 'pc.log', { t: e.turn, a: dn(byName.get(normName(S[e.from].name)) || S[e.from]), b: dn(byName.get(normName(S[1 - e.from].name)) || S[1 - e.from]), d: fmt(e.dmg) }) + (e.race ? T('pc.logRace', { r: T(e.race > 0 ? 'pc.raceUp' : 'pc.raceDown') }) : '');
    logEl.prepend(li);
    await sleep(420);
  }
  const w = res.winner;
  const wName = w == null ? '' : dn(byName.get(normName(S[w].name)) || S[w]);
  if (w != null) $(`.ft-${1 - w}`, stage).classList.add('down');
  const banner = document.createElement('div');
  banner.className = 'ft-banner';
  banner.innerHTML = `${spriteImg(w == null ? 'adv-sit' : 'adv-cheer')}<b>${esc(w == null ? T('pc.draw') : T(res.timeout ? 'pc.winTime' : 'pc.win', { n: wName }))}</b><small>${esc(T('pc.summary', { t: res.turns, lv }))}</small>`;
  stage.append(banner);
  busy = false; renderArena();
}

// ───── 分享卡組：把收藏的寵物名放進連結（?cards=名,名），朋友打開就匯入 ─────
function shareDeck() {
  const list = getAlbum();
  if (!list.length) { toast(T('pc.shareEmpty')); return; }
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('cards', list.join(','));
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { navigator.share({ title: T('pc.share'), url: u.toString() }).catch(() => {}); return; }
  copy(u.toString()).then(() => toast(T('pc.shared'), 2600));
}
function importFromUrl() {
  const q = new URLSearchParams(location.search).get('cards');
  if (!q) return;
  const have = new Set(getAlbum().map(normName));
  const add = [...new Set(q.split(',').map(n => n.trim()).filter(Boolean))]
    .map(n => byName.get(normName(n))).filter(p => p && !have.has(normName(p.name))).map(p => p.name);
  const list = [...add, ...getAlbum()].slice(0, MAX);
  store.set(KEY + '.init', 1);
  setAlbum(list);
  toast(add.length ? T('pc.imported', { n: add.length }) : T('pc.importNone'), 3000);
  const u = new URL(location.href); u.searchParams.delete('cards'); history.replaceState(null, '', u);
  showTab('battle');
}
// 手機：按住卡片 0.3 秒後可以拖到擂台（HTML5 拖曳在觸控螢幕上不能用）
function touchDrag(album) {
  let timer = 0, start = null, ghost = null, name = '', over = null, bar = null;
  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };
  const slotAt = (x, y) => document.elementFromPoint(x, y)?.closest('#arena .arena-slot, .pc-drop');
  // 拖曳時畫面上方出現「放左邊／放右邊」：擂台不在畫面內也能放
  const showBar = () => {
    bar = document.createElement('div'); bar.className = 'pc-dropbar';
    bar.innerHTML = [0, 1].map(i => `<div class="pc-drop" data-slot="${i}">${esc(T(i ? 'pc.dropRight' : 'pc.dropLeft'))}</div>`).join('');
    document.body.append(bar);
  };
  album.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || busy) return;
    const card = e.target.closest('.pc-card'); if (!card || e.target.closest('.pc-actions')) return;
    start = { x: e.clientX, y: e.clientY }; name = card.dataset.name;
    timer = setTimeout(() => {
      timer = 0;
      const img = card.querySelector('.pc-img img');
      ghost = document.createElement('div'); ghost.className = 'pc-ghost';
      ghost.innerHTML = `${img ? `<img src="${img.src}" alt="">` : ''}<small>${esc(T('pc.dragHint'))}</small>`;
      showBar(); document.body.append(ghost); card.classList.add('dragging');
      ghost.style.transform = `translate(${start.x - 40}px, ${start.y - 40}px)`;
      navigator.vibrate?.(15);
    }, 300);
  });
  album.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (timer && start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();   // 在捲動，不是拖曳
    if (!ghost) return;
    e.preventDefault();
    ghost.style.transform = `translate(${t.clientX - 40}px, ${t.clientY - 40}px)`;
    const s = slotAt(t.clientX, t.clientY);
    if (s !== over) { over?.classList.remove('over'); over = s; over?.classList.add('over'); }
  }, { passive: false });
  const finish = e => {
    if (ghost) {
      const t = e.changedTouches?.[0];
      const s = t && slotAt(t.clientX, t.clientY);
      ghost.remove(); ghost = null; bar?.remove(); bar = null; over?.classList.remove('over'); over = null;
      $$('.pc-card.dragging', album).forEach(c => c.classList.remove('dragging'));
      if (s) putInArena(name, Number(s.dataset.slot));
      e.preventDefault();
    }
    cancel();
  };
  album.addEventListener('touchend', finish, { passive: false });
  album.addEventListener('touchcancel', finish, { passive: false });
  album.addEventListener('contextmenu', e => { if (e.target.closest('.pc-card') && (ghost || start)) e.preventDefault(); });
}

export function initCards({ pets, map, setTab }) {
  PETS = pets; byName = map; if (setTab) showTab = setTab;
  renderAlbum(); renderArena();
  const album = $('#pc-album');
  album.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const card = b.closest('.pc-card'), name = card?.dataset.name;
    if (b.dataset.act === 'flip') { card.classList.toggle('flipped'); b.setAttribute('aria-pressed', String(card.classList.contains('flipped'))); }
    else if (b.dataset.act === 'fight') putInArena(name);
    else if (b.dataset.act === 'del') setAlbum(getAlbum().filter(n => normName(n) !== normName(name)));
  });
  // 拖曳到擂台（電腦版）；手機用「上場」按鈕
  album.addEventListener('dragstart', e => { const c = e.target.closest('.pc-card'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.name); e.dataTransfer.effectAllowed = 'copy'; c.classList.add('dragging'); });
  album.addEventListener('dragend', e => e.target.closest('.pc-card')?.classList.remove('dragging'));
  $$('#arena .arena-slot').forEach((el, i) => {
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); const n = e.dataTransfer.getData('text/plain'); if (n) putInArena(n, i); });
    el.addEventListener('click', e => { if (e.target.closest('[data-act="out"]') && !busy) { arena[i] = null; $('#arena-stage').hidden = true; $('#arena').classList.remove('fighting'); renderArena(); } });
  });
  touchDrag(album);
  $('#pc-share').addEventListener('click', shareDeck);
  $('#pc-fight').addEventListener('click', fight);
  $('#pc-swap').addEventListener('click', () => { if (busy) return; arena = [arena[1], arena[0]]; renderArena(); });
  $('#pc-clear-arena').addEventListener('click', () => { if (busy) return; arena = [null, null]; $('#arena-stage').hidden = true; $('#arena').classList.remove('fighting'); $('#arena-log').innerHTML = ''; renderArena(); });
  const addQ = () => { if (addCard($('#pc-add-q').value)) $('#pc-add-q').value = ''; };
  $('#pc-add').addEventListener('click', addQ);
  $('#pc-add-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addQ(); } });
  $('#pc-random').addEventListener('click', () => {
    const have = new Set(getAlbum().map(normName));
    const pool = PETS.filter(p => !have.has(normName(p.name)));
    if (pool.length) addCard(pool[Math.floor(Math.random() * pool.length)].name);
  });
  // 第一次打開：送三張起始卡
  if (!store.get(KEY + '.init')) {
    store.set(KEY + '.init', 1);
    if (!getAlbum().length && !new URLSearchParams(location.search).has('cards')) ['普', '銀', '金'].forEach(t => { const p = PETS.find(x => tierOf(x.cardTier) === t && x.imageId); if (p) addCard(p.name, true); });
  }
  importFromUrl();
}
