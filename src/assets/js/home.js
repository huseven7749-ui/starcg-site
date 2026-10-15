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
api('hot').then(d => {
  const list = (d.items || []).slice(0, 10);
  if (!list.length) return;
  const box = $('#hot');
  $('.chips', box).innerHTML = list.map(k => { const n = typeof k === 'string' ? k : k.n, label = typeof k === 'string' ? k : (k.kn || k.n); return `<a class="chip" href="${BASE}${LANG === 'ko' ? 'ko/' : ''}market/${PREVIEW ? 'index.html' : ''}?q=${encodeURIComponent(n)}">${esc(label)}</a>`; }).join('');
  box.hidden = false;
}).catch(() => {});
