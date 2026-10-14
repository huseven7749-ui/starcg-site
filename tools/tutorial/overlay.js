// 教學影片用的畫面疊加層：導航精靈（紅衣小男孩）＋字幕對話框、步驟標籤、假游標、標示框、片頭片尾卡
// 只在錄影時以 Playwright 的 init script 注入，不會出現在正式網站。
(() => {
  if (window.__tg) return;
  const css = `
  #tg-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: "StarRound", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif; }
  #tg-guide { position: absolute; left: 22px; bottom: 18px; display: flex; align-items: flex-end; gap: 6px; transition: opacity .35s, transform .35s; }
  #tg-guide.hide { opacity: 0; transform: translateY(20px); }
  #tg-sprite { width: auto; height: 150px; image-rendering: pixelated; filter: drop-shadow(0 6px 10px rgba(60,30,10,.25)); }
  #tg-bubble { position: relative; max-width: 640px; min-width: 260px; margin-bottom: 34px; padding: 14px 20px 16px; border-radius: 22px; background: rgba(255,250,238,.97);
    border: 3px solid #D9654A; box-shadow: 0 10px 28px rgba(74,52,34,.28); color: #4A3422; font-size: 22px; line-height: 1.55; font-weight: 700; letter-spacing: .5px; }
  #tg-bubble::before { content: ""; position: absolute; left: -15px; bottom: 26px; border: 10px solid transparent; border-right: 14px solid #D9654A; }
  #tg-bubble::after { content: ""; position: absolute; left: -9px; bottom: 28px; border: 8px solid transparent; border-right: 11px solid rgba(255,250,238,.97); }
  #tg-name { position: absolute; top: -15px; left: 16px; background: #D9654A; color: #fff; font-size: 14px; padding: 2px 12px; border-radius: 999px; letter-spacing: 1px; }
  #tg-text { display: block; min-height: 1.55em; }
  #tg-step { position: absolute; top: 80px; right: 22px; padding: 8px 18px 8px 10px; border-radius: 999px; background: #4A3422; color: #FFFAEE; font-size: 18px; font-weight: 800;
    display: flex; align-items: center; gap: 10px; box-shadow: 0 6px 16px rgba(74,52,34,.3); transition: opacity .3s; }
  #tg-step.hide { opacity: 0; }
  #tg-step b { background: #D9654A; color: #fff; border-radius: 999px; padding: 2px 10px; font-size: 15px; }
  #tg-demo { position: absolute; bottom: 18px; right: 22px; padding: 6px 14px; border-radius: 999px; background: rgba(74,52,34,.82); color: #FFFAEE; font-size: 14px; font-weight: 700; transition: opacity .3s; }
  #tg-demo.hide { opacity: 0; }
  #tg-cursor { position: absolute; left: 0; top: 0; width: 34px; height: 34px; transform: translate(640px, 400px); transition: transform .7s cubic-bezier(.4,.1,.2,1); filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); }
  #tg-cursor.hide { opacity: 0; }
  #tg-cursor { transition: transform .7s cubic-bezier(.4,.1,.2,1), opacity .3s; }
  .tg-ripple { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 4px solid #D9654A; animation: tg-rip .7s ease-out forwards; }
  @keyframes tg-rip { from { transform: scale(.4); opacity: 1; } to { transform: scale(3.2); opacity: 0; } }
  .tg-mark { outline: 4px dashed #D9654A !important; outline-offset: 6px !important; border-radius: 14px; animation: tg-pulse 1.2s ease-in-out infinite; }
  @keyframes tg-pulse { 50% { outline-color: #F3B63F; } }
  #tg-card { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at center, rgba(255,246,228,.94), rgba(241,228,200,.97)); transition: opacity .6s; }
  #tg-card.hide { opacity: 0; }
  #tg-card .in { text-align: center; color: #4A3422; transform: translateY(-70px); }
  #tg-card img { height: 200px; image-rendering: pixelated; filter: drop-shadow(0 10px 14px rgba(60,30,10,.3)); }
  #tg-card h1 { font-size: 64px; margin: 10px 0 6px; letter-spacing: 4px; color: #4A3422; text-shadow: 0 3px 0 #fff; }
  #tg-card h1 span { color: #D9654A; }
  #tg-card p { font-size: 26px; margin: 0; color: #7B5F43; font-weight: 700; }
  #tg-card .url { margin-top: 14px; display: inline-block; padding: 6px 22px; border-radius: 999px; background: #D9654A; color: #fff; font-size: 24px; font-weight: 800; letter-spacing: 1px; }
  `;
  const cursorSvg = `<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2l15 10.5-6.6 1.2 3.9 7.3-3 1.6-3.9-7.4L4 19.5z" fill="#fff" stroke="#4A3422" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  function build() {
    if (document.getElementById('tg-root')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const root = document.createElement('div'); root.id = 'tg-root';
    root.innerHTML = `<div id="tg-card" class="hide"><div class="in"><img alt=""><h1></h1><p></p><span class="url">starcg.online</span></div></div>
      <div id="tg-step" class="hide"><b></b><span></span></div><div id="tg-demo" class="hide">畫面中的價格為示範資料</div>
      <div id="tg-guide" class="hide"><img id="tg-sprite" alt=""><div id="tg-bubble"><span id="tg-name">星野</span><span id="tg-text"></span></div></div>
      <div id="tg-cursor">${cursorSvg}</div>`;
    document.body.append(root);
    const s = sessionStorage.getItem('tg-state');
    if (s) { try { const o = JSON.parse(s); api.step(o.n, o.t, true); api.cursorTo(o.x, o.y, true); api.demo(o.demo); } catch (e) { /* 略 */ } }
  }
  const sprites = () => { try { return JSON.parse(document.body.dataset.sprites || '{}'); } catch (e) { return {}; } };
  const state = () => { try { return JSON.parse(sessionStorage.getItem('tg-state') || '{}'); } catch (e) { return {}; } };
  const save = patch => { sessionStorage.setItem('tg-state', JSON.stringify({ ...state(), ...patch })); };
  const $ = id => document.getElementById(id);
  const api = {
    ready: () => !!document.getElementById('tg-root'),
    say(text, pose = 'adv-look', name = '星野') {
      const g = $('tg-guide'), sp = sprites()[pose];
      if (sp) $('tg-sprite').src = sp[0];
      $('tg-name').textContent = name;
      $('tg-text').textContent = text;
      g.classList.toggle('hide', !text);
    },
    hideGuide() { $('tg-guide').classList.add('hide'); },
    step(n, t, quiet) {
      const el = $('tg-step');
      if (!n) { el.classList.add('hide'); if (!quiet) save({ n: 0, t: '' }); return; }
      el.querySelector('b').textContent = 'STEP ' + n; el.querySelector('span').textContent = t; el.classList.remove('hide');
      if (!quiet) save({ n, t });
    },
    demo(on) { $('tg-demo').classList.toggle('hide', !on); save({ demo: !!on }); },
    card(title, sub, pose = 'adv-cheer') {
      const c = $('tg-card'), sp = sprites()[pose];
      $('tg-cursor').classList.toggle('hide', !!title);
      if (sp) c.querySelector('img').src = sp[0];
      c.querySelector('h1').innerHTML = title; c.querySelector('p').textContent = sub || '';
      c.classList.toggle('hide', !title);
    },
    cursorTo(x, y, instant) {
      const c = $('tg-cursor');
      if (instant) { c.style.transition = 'none'; requestAnimationFrame(() => { c.style.transition = ''; }); }
      c.style.transform = `translate(${x - 6}px, ${y - 3}px)`;
      save({ x, y });
    },
    ripple(x, y) {
      const r = document.createElement('div'); r.className = 'tg-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px';
      $('tg-root').append(r); setTimeout(() => r.remove(), 800);
    },
    mark(sel) { api.unmark(); const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (el) el.classList.add('tg-mark'); },
    unmark() { document.querySelectorAll('.tg-mark').forEach(e => e.classList.remove('tg-mark')); },
  };
  window.__tg = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
