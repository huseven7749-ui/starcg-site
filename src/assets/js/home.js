import { $, $$, T, api, esc, LANG, BASE, PREVIEW } from './core.js';

// 預覽環境不能帶網址參數換頁：先暫存關鍵字再前往市場頁
if (PREVIEW) {
  $('.hero form')?.addEventListener('submit', e => {
    e.preventDefault();
    try { sessionStorage.setItem('sc.pendingQ', $('#home-q').value.trim()); } catch { /* 忽略 */ }
    location.href = e.target.getAttribute('action');
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('#hot a');
    if (!a) return;
    e.preventDefault();
    try { sessionStorage.setItem('sc.pendingQ', a.textContent); } catch { /* 忽略 */ }
    location.href = a.getAttribute('href').split('?')[0];
  });
}

// ───── 每週活動：以台灣時間（UTC+8）判斷 ─────
const TZ_OFFSET = 8 * 3600e3;
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
function taipeiNow() {
  const d = new Date(Date.now() + TZ_OFFSET);
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function dayLabel(d) { return T('day.' + d); }
function fmtDur(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (LANG === 'ko') return (h ? `${h}시간 ` : '') + `${m}분`;
  return (h ? `${h} 小時 ` : '') + `${m} 分`;
}

function updateSchedule() {
  const week = $('.week');
  if (!week) return;
  const { day, min } = taipeiNow();
  $$('.day', week).forEach(sec => {
    const isToday = Number(sec.dataset.day) === day;
    sec.classList.toggle('is-today', isToday);
    $('.today-pill', sec).hidden = !isToday;
    $$('.ev[data-ev]', sec).forEach(ev => {
      const badge = $('.ev-badge', ev);
      ev.classList.remove('is-live', 'is-soon', 'is-done');
      badge.hidden = true;
      if (!isToday) return;
      let state = '';
      if (ev.dataset.allday) state = 'live';
      else {
        const s = toMin(ev.dataset.start), e = toMin(ev.dataset.end);
        if (min >= s && min < e) state = 'live';
        else if (min < s && s - min <= 90) state = 'soon';
        else if (min >= e) state = 'done';
      }
      if (state) {
        ev.classList.add('is-' + state);
        if (state !== 'done') { badge.hidden = false; badge.textContent = state === 'live' ? T('home.live') : T('home.soon'); }
      }
    });
  });
  // 下一個「有時段」的活動
  const evs = [];
  $$('.day', week).forEach(sec => $$('.ev[data-ev]', sec).forEach(ev => {
    if (ev.dataset.allday) return;
    evs.push({ day: Number(sec.dataset.day), start: toMin(ev.dataset.start), name: $('b', ev).textContent, time: $('.ev-time', ev).textContent });
  }));
  const nowAbs = day * 1440 + min;
  let best = null;
  for (const e of evs) {
    let abs = e.day * 1440 + e.start;
    if (abs <= nowAbs) abs += 7 * 1440;
    if (!best || abs < best.abs) best = { ...e, abs };
  }
  const box = $('#next-ev');
  if (best && box) {
    box.hidden = false;
    $('span', box).innerHTML = `${esc(T('home.nextEvent'))}：<b>${esc(dayLabel(best.day))} ${esc(best.time)} ${esc(best.name)}</b>（${esc(fmtDur(best.abs - nowAbs))}）`;
  }
}
// 手機版：用星期分頁切換，一次只顯示一天，預設今天
function showDay(d) {
  $$('.week-tabs .wt').forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.day) === d)));
  $$('.week .day').forEach(sec => sec.classList.toggle('is-active', Number(sec.dataset.day) === d));
}
$('.week-tabs')?.addEventListener('click', e => { const b = e.target.closest('.wt'); if (b) showDay(Number(b.dataset.day)); });
$('.week-tabs')?.addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = $$('.week-tabs .wt'), i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  next.focus(); showDay(Number(next.dataset.day));
});
updateSchedule();
(() => {
  const { day } = taipeiNow();
  $$('.week-tabs .wt').forEach(b => { if (Number(b.dataset.day) === day) { b.classList.add('is-today'); b.dataset.today = T('home.today'); } });
  showDay(day);
})();
setInterval(updateSchedule, 60e3);

// ───── 熱門搜尋 ─────
let searchEx = T('guide.searchEx').split('|').filter(Boolean);
// 韓文站：熱門搜尋若沒有官方韓文名（kn），寵物名改用遊戲韓文介面抄下的名稱
const petKo = LANG === 'ko' ? fetch(`${BASE}data/pet-names-ko.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})) : Promise.resolve({});
Promise.all([api('hot'), petKo]).then(([d, pk]) => {
  const list = (d.items || []).slice(0, 10);
  if (!list.length) return;
  const box = $('#hot');
  const labelOf = k => { const n = typeof k === 'string' ? k : k.n, kn = typeof k === 'string' ? '' : k.kn; return (kn && kn !== n ? kn : '') || pk['n:' + n] || n; };
  $('.chips', box).innerHTML = list.map(k => { const n = typeof k === 'string' ? k : k.n; return `<a class="chip" href="${BASE}${LANG === 'ko' ? 'ko/' : ''}market/${PREVIEW ? 'index.html' : ''}?q=${encodeURIComponent(n)}">${esc(labelOf(k))}</a>`; }).join('');
  box.hidden = false;
  // 韓文站：輪播的搜尋範例只用有韓文名的熱門詞，沒有就保留預設的韓文範例
  const ex = list.slice(0, 6).map(k => LANG === 'ko' ? labelOf(k) : (typeof k === 'string' ? k : k.n));
  const exOk = LANG === 'ko' ? ex.filter(s => /[가-힣]/.test(s)) : ex;
  if (exOk.length) searchEx = exOk;
}).catch(() => {});

// ───── 主視覺互動 ─────
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 忽略 */ } } };
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

// 歌姬：點一下會唱歌、冒音符、說一句話
(() => {
  const btn = $('.diva-btn');
  if (!btn) return;
  const say = $('.diva-say'), notes = $('.notes');
  const lines = [1, 2, 3, 4, 5, 6].map(i => T('guide.diva' + i));
  const colors = ['var(--pink)', 'var(--sky)', 'var(--mint)', 'var(--lemon)', 'var(--lav)'];
  let n = 0, timer;
  if (store.get('sc.divaSeen')) btn.classList.add('seen');
  btn.addEventListener('click', () => {
    n++;
    btn.classList.add('seen'); store.set('sc.divaSeen', '1');
    replay(btn, 'sing');
    say.textContent = n % 7 === 0 ? T('guide.divaFan') : lines[(n - 1) % lines.length];
    say.hidden = false; replay(say, 'pop');
    clearTimeout(timer); timer = setTimeout(() => { say.hidden = true; }, 4000);
    if (REDUCE) return;
    for (let i = 0; i < 4 + Math.min(n, 6); i++) {
      const s = document.createElement('span');
      s.textContent = '♪♫♬♩'[i % 4];
      s.style.left = (10 + Math.random() * 75) + '%';
      s.style.setProperty('--dx', (Math.random() * 90 - 45).toFixed(0) + 'px');
      s.style.animationDelay = (i * 90) + 'ms';
      s.style.color = colors[i % colors.length];
      notes.append(s);
      setTimeout(() => s.remove(), 2400 + i * 90);
    }
  });
})();

// 鼠王：歡迎詞、最新攻略、下一個活動、小技巧輪播；點對話框換下一則
(() => {
  const box = $('#guide-say');
  if (!box) return;
  const span = $('.say', box), dots = $('.say-dots', box);
  const msgs = [esc(T('guide.home'))];
  const post = $('.post-list-3 .post-card a');
  if (post) msgs.push(`${esc(T('guide.sayPost'))}<a href="${esc(post.getAttribute('href'))}">${esc($('h2', post).textContent)}</a>`);
  const ev = $('#next-ev span');
  if (ev && ev.textContent) msgs.push(esc(ev.textContent));
  [1, 2, 3].forEach(i => msgs.push(esc(T('guide.sayTip' + i))));
  dots.innerHTML = msgs.map(() => '<i></i>').join('');
  let i = 0, paused = false;
  const show = k => {
    i = (k + msgs.length) % msgs.length;
    span.innerHTML = msgs[i];
    replay(span, 'in');
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
  };
  show(0);
  box.addEventListener('click', e => { if (!e.target.closest('a')) show(i + 1); });
  box.addEventListener('mouseenter', () => { paused = true; });
  box.addEventListener('mouseleave', () => { paused = false; });
  if (!REDUCE) setInterval(() => { if (!paused && !document.hidden) show(i + 1); }, 7000);
})();

// 搜尋框：打字機效果輪流示範關鍵字（聚焦或已輸入時停止）
(() => {
  const inp = $('#home-q');
  if (!inp || REDUCE) return;
  const orig = inp.placeholder, pre = T('guide.searchPre');
  let w = 0, c = 0, del = false;
  const tick = () => {
    if (document.hidden) return setTimeout(tick, 2000);   // 分頁在背景：先不動
    if (document.activeElement === inp || inp.value) { inp.placeholder = orig; c = 0; del = false; return setTimeout(tick, 1500); }
    const word = searchEx[w % searchEx.length] || '';
    c += del ? -1 : 1;
    inp.placeholder = pre + word.slice(0, c);
    let d = del ? 45 : 120;
    if (!del && c >= word.length) { del = true; d = 1800; } else if (del && c <= 0) { del = false; w++; d = 400; }
    setTimeout(tick, d);
  };
  setTimeout(tick, 2000);
})();
