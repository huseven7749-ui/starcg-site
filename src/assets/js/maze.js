// 迷宮找樓梯：連結一次遊戲的 StarCG_Data 資料夾，之後自動讀取 map\分流\*.dat，
// 邊走邊畫出地圖、標出樓梯與座標。全部在使用者電腦上讀取，不上傳、不修改遊戲檔案。
import { $, $$, T, LANG, esc, fmt, store, toast, copy, emptyState, clamp, spriteImg, openSheet } from './core.js';
import { parseDat, freshMask, shardOf, demoMaze, KIND_NAMES, isFloor, MARK_EXIT } from './mazedat.js';
import { track, miceRun } from './game.js';

const PREF = 'sc.maze';
const pref = store.get(PREF) || {};
const FS_OK = typeof window.showDirectoryPicker === 'function';
const PIP_OK = 'documentPictureInPicture' in window;
const ORDER = { 1: 0, 2: 1, 3: 2, 4: 3, 0: 4, 5: 5, 6: 6, 9: 7, 7: 8, 8: 9 };
const MARK_KINDS = { chest: 6, mob: 7, note: 8, npc: 9 };
const KIND_NAME = k => KIND_NAMES[k] || { 6: 'chest', 7: 'mob', 8: 'note', 9: 'npc' }[k];
// 這層的點：樓梯、水晶、特殊點＋使用者自己標的（寶箱、怪物、NPC、備註）
function allPoints(f) {
  const m = f.map; if (!m) return [];
  const marks = (S.run?.marks || []).filter(x => x.key === f.key).map((x, k) => ({ e: x.e, s: x.s, i: -1 - k, kind: MARK_KINDS[x.type] || 8, mark: x }));
  return m.exits.concat(marks);
}
const LOC = LANG === 'ko' ? 'ko-KR' : 'zh-TW';
const TF = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const HM = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit', hour12: false });
const xy = (e, s) => `${T('mz.e')} ${e} · ${T('mz.s')} ${s}`;
const xyShort = (e, s) => `${T('mz.e')}${e} ${T('mz.s')}${s}`;

// ───── IndexedDB：記住連結過的資料夾與「這趟」的起點 ─────
const idb = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('sc-maze', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', mode); const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  };
  return {
    get: k => run('readonly', s => s.get(k)).catch(() => undefined),
    set: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => {}),
    del: k => run('readwrite', s => s.delete(k)).catch(() => {}),
  };
})();

// ───── 狀態 ─────
const S = {
  source: null, saved: null,
  floors: new Map(),          // key → { key, name, shard, lastModified, size, read, map, mask, dirty, manual }
  manual: new Map(),
  cur: null, liveKey: null, liveStamp: 0, pendingShow: null,
  follow: pref.follow !== false,
  run: null,                  // 這次探索：{ id, at, mode, start, floors: { key: { n, fp } }, base: { key: bytes } }
  pack: null,                 // 剛結束的探索整理好的內容（打包分享用）
  runs: [],                   // 結束過的探索（迷宮重置前再回來可自動接回）
  baseParsed: new Map(),
  timer: 0, timerWin: window, busy: false, scanMs: 0, error: '', errorText: '', seq: 0,
};
const R = { iso: pref.view !== 'grid', zoom: 10, cx: 0, cy: 0, w: 0, h: 0, dpr: 1, autoFit: true, hover: null, hoverExit: null, sel: null, pulseUntil: 0, paths: null, pathsFor: null, C: null, pip: null };

// ───── 資料來源 ─────
const sub = async (d, n) => { try { return await d.getDirectoryHandle(n); } catch { return null; } };
// 遊戲結構：StarCG_Data\map\0\（固定地圖，幾千個檔，不用看）、StarCG_Data\map\1\<分流>\<編號>.dat（迷宮樓層）
async function resolveMapDir(h) {
  const name = h.name.toLowerCase();
  let mapDir = null;
  if (name === 'map') mapDir = h;
  else mapDir = (await sub(h, 'map')) || (await sub((await sub(h, 'StarCG_Data')) || h, 'map'));
  if (!mapDir) {
    // 可能直接選了 map\1 或 map\1\1
    const dirs = [], hasDat = await hasDatFiles(h);
    for await (const [n, e] of h.entries()) if (e.kind === 'directory' && shardOf(n)) dirs.push([n, e]);
    if (dirs.length) return { shards: dirs };
    if (hasDat) return { shards: [[shardOf(h.name) ? h.name : '', h]] };
    return null;
  }
  const one = await sub(mapDir, '1');
  if (one) {
    const dirs = [];
    for await (const [n, e] of one.entries()) if (e.kind === 'directory' && shardOf(n)) dirs.push([n, e]);
    if (dirs.length) return { shards: dirs };
    if (await hasDatFiles(one)) return { shards: [['1', one]] };
  }
  const dirs = [];
  for await (const [n, e] of mapDir.entries()) if (e.kind === 'directory' && shardOf(n)) dirs.push([n, e]);
  if (dirs.length) return { shards: dirs };
  return null;
}
async function hasDatFiles(d) { try { for await (const [n, e] of d.entries()) if (e.kind === 'file' && /\.dat$/i.test(n)) return true; } catch { /* 略 */ } return false; }
function fingerprint(u8) {
  let h = 2166136261 ^ u8.length;
  const step = Math.max(1, (u8.length / 4096) | 0);
  for (let i = 0; i < u8.length; i += step) { h ^= u8[i]; h = Math.imul(h, 16777619); }
  for (let i = Math.max(0, u8.length - 512); i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + u8.length;
}
function dirSource(root, info) {
  const diag = { dirs: [], errors: [], at: 0, read: 0 };
  const meta = new Map();   // key → { lm, size, fp, bytes }
  return {
    kind: 'dir', label: root.name, handle: root, diag,
    // 只看分流資料夾；只有新出現、大小／時間有變、或正在看的檔案才讀內容，其他只看目錄資訊
    async scan(want = new Set()) {
      const out = [];
      diag.dirs = []; diag.errors = []; diag.at = Date.now(); diag.read = 0;
      for (const [dn, dir] of info.shards) {
        const row = { path: dn, files: 0, dat: 0 };
        diag.dirs.push(row);
        let entries;
        try { entries = []; for await (const en of dir.entries()) entries.push(en); }
        catch (e) { diag.errors.push(`${dn}: ${e.name}`); continue; }
        const files = entries.filter(([n, e]) => e.kind === 'file');
        row.files = files.length;
        const dats = files.filter(([n]) => /\.dat$/i.test(n));
        row.dat = dats.length;
        // 並行查詢目錄資訊（一個一個問在 Windows 上很慢）
        const stats = await Promise.all(dats.map(async ([n, e]) => { try { return [n, e, await e.getFile()]; } catch (err) { diag.errors.push(`${dn}/${n}: ${err.name}`); return null; } }));
        await Promise.all(stats.filter(Boolean).map(async ([n, e, file]) => {
          const key = `${dn}/${n}`;
          let m = meta.get(key);
          if (!m || m.lm !== file.lastModified || m.size !== file.size || want.has(key)) {
            let bytes;
            try { bytes = new Uint8Array(await file.arrayBuffer()); diag.read++; }
            catch (err) { diag.errors.push(`${key}: ${err.name} ${err.message || ''}`); return; }
            const fp = fingerprint(bytes);
            if (!m) m = { fp, bytes };
            else if (m.fp !== fp) { m.fp = fp; m.bytes = bytes; }
            m.lm = file.lastModified; m.size = file.size;
            meta.set(key, m);
          }
          const bytes = m.bytes;
          out.push({ key, name: n.replace(/\.dat$/i, ''), shard: shardOf(dn), lm: m.lm, bytes, fp: m.fp, read: async () => bytes });
        }));
      }
      for (const k of [...meta.keys()]) if (!out.some(o => o.key === k)) meta.delete(k);
      return out;
    },
  };
}
// 示範：模擬一路探索三層迷宮
function demoSource() {
  const floors = [{ seed: 11, layout: 0, cells: 9 }, { seed: 29, layout: 1, cells: 11 }, { seed: 5, layout: 0, cells: 12 }];
  const t0 = Date.now(), STEP = window.__mzDemoStep || 600, STEPS = 18, GAP = 4;
  return {
    kind: 'demo', label: T('mz.demoLabel'),
    async scan() {
      const k = Math.floor((Date.now() - t0) / STEP);
      const fi = Math.min(floors.length - 1, Math.floor(k / (STEPS + GAP)));
      return floors.slice(0, fi + 1).map((f, i) => {
        const prog = i < fi ? STEPS : Math.min(STEPS, k - i * (STEPS + GAP));
        const bytes = demoMaze({ ...f, explored: 0.1 + 0.9 * prog / STEPS });
        return { key: `1/${30101 + i}.dat`, name: String(30101 + i), shard: 'S1', lm: t0 + (i * (STEPS + GAP) + prog) * STEP, bytes, fp: fingerprint(bytes), read: async () => bytes };
      });
    },
  };
}
const filesSource = () => ({ kind: 'files', label: T('mz.st.files'), scan: async () => [] });

async function scanAll() {
  const t0 = performance.now();
  const want = new Set([S.cur, S.liveKey].filter(Boolean));
  const list = S.source ? await S.source.scan(want) : [];
  S.scanMs = performance.now() - t0;
  return list.concat([...S.manual.values()]);
}

// ───── 讀取與更新 ─────
async function loadFloor(f) {
  let bytes;
  try { bytes = await f.read(); } catch { f.dirty = true; return false; }
  const m = parseDat(bytes);
  if (!m.ok) { f.dirty = m.code === 'partial'; f.error = m.code; return false; }
  const stairsBefore = f.map ? f.map.exits.filter(x => x.kind === 1 || x.kind === 2).length : 0;
  f.map = m; f.dirty = false; f.error = '';
  const stairsNow = m.exits.filter(x => x.kind === 1 || x.kind === 2).length;
  if (S.run && !f.manual && stairsNow > stairsBefore && f.key in S.run.floors) { track('maze.stairs'); if (S.source?.kind !== 'files') confetti(); }
  f.mask = null;
  if (S.run && !f.manual) {
    const base = S.run.base[f.key];
    if (base) {
      let bp = S.baseParsed.get(f.key);
      if (!bp) { bp = parseDat(base); S.baseParsed.set(f.key, bp); }
      if (bp.ok) f.mask = freshMask(bp, m);
    }
  }
  if (f.key === S.cur) R.paths = null;
  return true;
}

async function poll() {
  if (S.busy) return;
  S.busy = true;
  let changed = false;
  try {
    const entries = await scanAll();
    const seen = new Set();
    const now = Date.now();
    const first = !S.floors.size;
    if (first) entries.sort((a, b) => (a.lm || 0) - (b.lm || 0));            // 第一次：依修改時間排序，最新的當目前樓層
    let newest = null;
    for (const en of entries) {
      seen.add(en.key);
      let f = S.floors.get(en.key);
      let born = false;
      if (!f) { f = { key: en.key, name: en.name, shard: en.shard, manual: !!en.manual, fp: '', lm: 0, changedAt: 0, seq: 0, map: null }; S.floors.set(en.key, f); changed = true; born = !first; }
      f.read = en.read;
      if (f.fp !== en.fp) {                                       // 內容有變：重新解析
        f.fp = en.fp; f.dirty = true; changed = true;
        f.changedAt = first ? (en.lm || 0) : now;
      }
      let touched = false;
      if (f.lm !== (en.lm || 0)) {                                 // 檔案被重寫（走回舊樓層時內容可能一樣，但時間會更新）
        f.lm = en.lm || 0; f.seq = ++S.seq; changed = true; touched = true;
        if (!first) f.changedAt = now;
      }
      const event = !first && !en.manual && f.shard && touched;    // 這一輪剛被寫入
      if (event && S.source?.kind === 'dir' && !S.run && f.key !== S.endedKey) tryResume(f, en);   // 沒在探索：看看是不是上次那座迷宮
      if (event && S.run && !S.run.floors[f.key]) assignFloor(f, en);      // 探索中：新樓層
      // 目前樓層：探索中只看這次探索的樓層；同一輪裡新建立的檔優先（離開上一層時遊戲會順手存一次舊樓層）
      f.score = f.seq + (born ? 1e6 : 0);
      const inRun = !S.run || !!S.run.floors[f.key] || en.manual;
      const better = !newest || (!!newest.shard < !!f.shard) || (!!newest.shard === !!f.shard && (f.score > newest.score || (f.score === newest.score && f.lm > newest.lm)));
      if (!en.manual && inRun && better) newest = f;
    }
    for (const k of [...S.floors.keys()]) if (!seen.has(k)) { S.floors.delete(k); changed = true; }
    if (S.run && S.source?.kind !== 'files' && !Object.keys(S.run.floors).length) newest = null;   // 還沒進迷宮
    if (newest && (newest.key !== S.liveKey || newest.seq !== S.liveStamp)) {
      const moved = newest.key !== S.liveKey;
      S.liveKey = newest.key; S.liveStamp = newest.seq; changed = true;
      if (S.follow || !S.cur) { if (moved || S.cur !== newest.key) setCur(newest.key); }
    }
    if (S.run && S.cur && !S.run.floors[S.cur] && !S.manual.has(S.cur)) { S.cur = null; changed = true; }
    if (S.pendingShow && S.floors.has(S.pendingShow)) { setCur(S.pendingShow); S.pendingShow = null; }
    if (S.cur && !S.floors.has(S.cur)) setCur(S.liveKey);
    const f = S.cur && S.floors.get(S.cur);
    if (f && (f.dirty || !f.map)) { if (await loadFloor(f)) changed = true; }
    S.error = '';
  } catch (e) {
    S.error = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'lost' : 'read';
    S.errorText = `${e?.name || ''}: ${e?.message || e}`;
    changed = true;
    if (S.error === 'lost') { stopSource(false); showStart(); }
  } finally {
    S.busy = false;
  }
  renderDiag();
  if (changed) renderAll();
}
function setCur(key) {
  if (S.cur === key) return;
  S.cur = key; R.paths = null; R.autoFit = true; R.sel = null; R.hover = null;
}
const interval = () => ((document.hidden && !R.pip) ? 2000 : clamp(S.scanMs, 400, 3000));
function schedule(ms) {
  S.timerWin.clearTimeout(S.timer);
  if (!S.source && !S.manual.size) return;
  S.timerWin = R.pip || window;   // 浮動小視窗開著時改用它的計時器，主分頁被遮住也不會變慢
  S.timer = S.timerWin.setTimeout(async () => { await poll(); if (S.source) schedule(); }, ms ?? interval());
}

function setSource(src) {
  stopSource(false);
  S.source = src;
  for (const k of [...S.floors.keys()]) if (!S.manual.has(k)) S.floors.delete(k);
  S.liveKey = null; S.liveStamp = 0; S.error = '';
  if (src.kind !== 'files') { S.follow = (store.get(PREF) || {}).follow !== false; $('#mz-follow').checked = S.follow; }
  S.baseParsed.clear();
  if (src.kind !== 'files' && !S.pendingShow) S.cur = null;
  if (src.kind === 'dir') S.run = S.savedRun || null; else S.run = null;
  showLive();
  renderAll();
  schedule(0);
  if (src.kind === 'demo') startRun('fresh', 1);
}
function stopSource(clearSaved) {
  S.timerWin.clearTimeout(S.timer);
  if (clearSaved) { idb.del('root'); S.saved = null; }
  S.source = null;
}

// ───── 連結資料夾 ─────
async function connect(h, persist) {
  let info = null;
  try { info = await resolveMapDir(h); } catch { /* 讀不到 */ }
  if (!info) { toast(T('mz.noMap'), 3600); return false; }
  if (persist) { idb.set('root', h); S.saved = h; }
  setSource(dirSource(h, info));
  toast(T('mz.linked', { name: h.name }));
  return true;
}
async function pickFolder() {
  let h;
  try { h = await window.showDirectoryPicker({ id: 'starcg-map', mode: 'read' }); }
  catch (e) {
    if (e?.name === 'AbortError') return;
    problem((e?.name === 'SecurityError' ? T('mz.newTab') : T('mz.denied')) + `（${e?.name || ''}: ${e?.message || e}）`);
    return;
  }
  await connect(h, true);
}
// 把問題直接寫在開始卡片上（不只閃一下提示）
function problem(msg) {
  const el = $('#mz-unsupported');
  el.hidden = false; el.querySelector('span').textContent = msg;
  toast(msg, 4000);
}
async function restore() {
  const h = await idb.get('root');
  if (!h || typeof h.queryPermission !== 'function') return;
  S.saved = h;
  let st = 'prompt';
  try { st = await h.queryPermission({ mode: 'read' }); } catch { /* 忽略 */ }
  if (st === 'granted' && await connect(h, false)) return;
  showResume();
}
function showResume() {
  const b = $('#mz-resume');
  if (!S.saved) { b.hidden = true; return; }
  b.hidden = false;
  b.querySelector('span').textContent = T('mz.resume', { name: S.saved.name });
}
async function resume() {
  const h = S.saved;
  if (!h) return;
  try { if (await h.requestPermission({ mode: 'read' }) !== 'granted') { toast(T('mz.denied')); return; } }
  catch { toast(T('mz.denied')); return; }
  connect(h, false);
}

// ───── 手動選檔／拖曳 ─────
async function addFiles(files) {
  let last = null;
  for (const file of files) {
    const bytes = /\.dat$/i.test(file.name) ? new Uint8Array(await file.arrayBuffer()) : null;
    if (!bytes || !parseDat(bytes).ok) { toast(T('mz.badFile', { name: file.name }), 3000); continue; }
    const key = 'file/' + file.name;
    S.manual.set(key, { key, name: file.name.replace(/\.dat$/i, ''), shard: '', manual: true, lm: file.lastModified, bytes, fp: fingerprint(bytes), read: async () => bytes });
    S.floors.delete(key);
    last = key;
  }
  if (!last) return;
  S.pendingShow = last;
  if (S.source && S.follow) { S.follow = false; $('#mz-follow').checked = false; }
  if (!S.source) setSource(filesSource()); else schedule(0);
}

// ───── 探索（進迷宮前按開始→從第 1 層數；已在迷宮中→從指定樓層數；結束清掉；重置前回來自動接回）─────
const RUNS_MAX = 8;
async function snapshotBase(skipKey) {
  const entries = S.source ? await S.source.scan() : [];
  const base = {};
  for (const en of entries) if (en.shard && en.key !== skipKey) base[en.key] = en.bytes || await en.read();
  return base;
}
async function startRun(mode, start) {
  if (!S.source || S.source.kind === 'files') return;
  const btns = $$('#mz-begin button'); btns.forEach(b => { b.disabled = true; });
  try {
    const curKey = mode === 'mid' ? S.liveKey : null;
    const base = S.source.kind === 'demo' ? {} : await snapshotBase(curKey);
    const run = { id: Date.now().toString(36), at: Date.now(), mode, start, floors: {}, base };
    if (curKey) { const f = S.floors.get(curKey); run.floors[curKey] = { n: start, fp: f?.fp || '' }; }
    S.run = run; S.baseParsed.clear(); S.pack = null; idb.del('pack');
    for (const f of S.floors.values()) { f.dirty = true; f.mask = null; }
    R.paths = null;
    if (curKey) setCur(curKey); else S.cur = null;
    if (S.source.kind === 'dir') await saveRun();
  } finally { btns.forEach(b => { b.disabled = false; }); }
  renderAll(); await poll();
}
function assignFloor(f, en) {
  const ns = Object.values(S.run.floors).map(x => x.n);
  const n = ns.length ? Math.max(...ns) + 1 : S.run.start;
  S.run.floors[f.key] = { n, fp: en.fp };
  if (S.source?.kind === 'dir') saveRun();
}
async function endRun() {
  const run = S.run; if (!run) return;
  S.pack = buildPack(run);
  const result = buildResult(run, S.pack);
  if (S.source?.kind === 'dir') idb.set('pack', S.pack);
  S.run = null; S.baseParsed.clear(); if (R.place) setPlace(null);
  if (S.source?.kind === 'dir') {
    // 存下每層最後的地圖，重置前回來時用來認迷宮
    const floors = {};
    for (const [key, v] of Object.entries(run.floors)) { const f = S.floors.get(key); let bytes = null; try { bytes = f ? await f.read() : null; } catch { /* 略 */ } floors[key] = { n: v.n, bytes }; }
    S.runs = [{ id: run.id, at: run.at, end: Date.now(), mode: run.mode, start: run.start, floors, base: run.base, marks: run.marks || [] }, ...S.runs].slice(0, RUNS_MAX);
    idb.set('runs', S.runs); idb.del('run'); S.savedRun = null;
  }
  for (const f of S.floors.values()) { f.mask = null; f.dirty = true; }
  S.endedKey = S.cur;          // 結束時還在這層的話，繼續寫入不算「回來」
  S.cur = null; S.liveKey = null; S.liveStamp = 0; R.paths = null;
  renderAll(); poll();
  if (result.floors) { track('maze.run'); if (result.floors >= 5) track('maze.deep'); showResult(result); }
}
// ───── 自己標的點（寶箱、怪物、備註）：跟著這次探索一起存 ─────
function setPlace(type) {
  R.place = R.place === type ? null : type;
  $$('#mz-mark button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === R.place)));
  canvas.style.cursor = R.place ? 'crosshair' : 'grab';
  stage.classList.toggle('placing', !!R.place);
  draw();
}
function addMark(type, c) {
  const f = curMap(); if (!f || !S.run) return;
  let note = '';
  if (type === 'note') { note = (prompt(T('mz.notePrompt')) || '').trim().slice(0, 20); if (!note) { setPlace(null); return; } }
  else if (type === 'npc') { const v = prompt(T('mz.npcPrompt')); if (v === null) { setPlace(null); return; } note = v.trim().slice(0, 20); }
  S.run.marks ||= [];
  S.run.marks.push({ key: f.key, e: c.e, s: c.s, type, note });
  if (S.source?.kind === 'dir') saveRun();
  setPlace(null);
  toast(T('mz.markAdded', { t: note || T('mz.k.' + type), xy: xyShort(c.e, c.s) }));
  renderPanel(); draw();
}
function delMark(k) {
  const f = curMap(); if (!f || !S.run?.marks) return;
  const mine = S.run.marks.filter(x => x.key === f.key);
  const target = mine[k]; if (!target) return;
  S.run.marks = S.run.marks.filter(x => x !== target);
  if (S.source?.kind === 'dir') saveRun();
  R.sel = null; renderPanel(); draw();
}
function saveRun() { S.savedRun = S.run; return idb.set('run', S.run); }
// 同一座迷宮？以上次存的探索範圍為準，牆與地板都要一樣
function sameLayout(oldBytes, cur) {
  if (!oldBytes) return false;
  const a = parseDat(oldBytes); if (!a.ok || a.width !== cur.width || a.height !== cur.height) return false;
  let n = 0;
  for (let i = 0; i < a.tile.length; i++) {
    if (!isFloor(a.tile[i])) continue;
    n++;
    if (a.tile[i] !== cur.tile[i] || a.obj[i] !== cur.obj[i]) return false;
  }
  return n >= 20;
}
function tryResume(f, en) {
  if (!S.runs.length) return;
  const cur = parseDat(en.bytes || new Uint8Array()); if (!cur.ok) return;
  for (const r of S.runs) {
    const fl = r.floors[f.key];
    if (!fl || !sameLayout(fl.bytes, cur)) continue;
    const floors = {};
    for (const [k, v] of Object.entries(r.floors)) floors[k] = { n: v.n, fp: '' };
    S.run = { id: r.id, at: r.at, mode: r.mode, start: r.start, floors, base: r.base, marks: r.marks || [], resumed: Date.now() };
    S.runs = S.runs.filter(x => x !== r); idb.set('runs', S.runs); saveRun();
    S.baseParsed.clear();
    for (const x of S.floors.values()) { x.dirty = true; x.mask = null; }
    R.paths = null;
    toast(T('mz.resumed', { n: fl.n }), 3600);
    return;
  }
}
async function restoreRuns() {
  S.savedRun = (await idb.get('run')) || null;
  S.runs = (await idb.get('runs')) || [];
  S.pack = (await idb.get('pack')) || null;
}

// ───── 探索結算：像遊戲結算畫面，評價＋數據，可存成圖片 ─────
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
function buildResult(run, pack) {
  const floors = pack.floors.length;
  const stairs = pack.floors.reduce((a, f) => a + f.pts.filter(p => p.kind === 1 || p.kind === 2).length, 0);
  const marks = (run.marks || []).length;
  const cells = runFloors().reduce((a, { f }) => a + (f.map?.floor || 0), 0);
  const ms = Math.max(0, Date.now() - run.at);
  const score = floors * 10 + stairs * 3 + marks * 2 + cells / 60;
  const grade = score >= 60 ? 'S' : score >= 35 ? 'A' : score >= 15 ? 'B' : 'C';
  return { floors, stairs, marks, cells, ms, grade, at: run.at };
}
const fmtDur = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
let lastResult = null;
function showResult(r) {
  lastResult = r;
  const d = $('#sheet-mzresult'); if (!d) return;
  const pose = r.grade === 'S' || r.grade === 'A' ? 'adv-cheer' : r.grade === 'B' ? 'adv-look' : 'adv-sit';
  $('.mr-grade', d).textContent = r.grade; $('.mr-grade', d).dataset.g = r.grade;
  $('.mr-sp', d).innerHTML = spriteImg(pose);
  $('.mr-line', d).textContent = T('mz.r.line.' + r.grade);
  $('.mr-stats', d).innerHTML = [[T('mz.r.floors'), r.floors], [T('mz.r.time'), fmtDur(r.ms)], [T('mz.r.cells'), fmt(r.cells)], [T('mz.r.stairs'), r.stairs], [T('mz.r.marks'), r.marks]]
    .map(([k, v]) => `<div class="stat-tile"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('');
  openSheet('sheet-mzresult');
  if (!REDUCED && (r.grade === 'S' || r.grade === 'A')) setTimeout(() => miceRun(r.grade === 'S' ? 5 : 3), 300);
}
function confetti() {
  if (REDUCED) return;
  const host = $('#mz-stage'); if (!host) return;
  const colors = ['#D9654A', '#E2AE47', '#7DAE5F', '#4E95D0', '#8B6CE0', '#FFF6D8'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('i'); p.className = 'mz-confetti';
    p.style.cssText = `left:${10 + Math.random() * 80}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.4}s;animation-duration:${1.2 + Math.random() * 0.8}s;transform:rotate(${Math.random() * 360}deg)`;
    host.appendChild(p); setTimeout(() => p.remove(), 2400);
  }
}
// 存成圖片：用 canvas 畫一張結算卡
async function resultImage() {
  const r = lastResult; if (!r) return;
  const W = 720, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#CFE4F4'); g.addColorStop(0.5, '#F7EBD2'); g.addColorStop(1, '#EFD9AE');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#D9654A'; x.lineWidth = 8; x.beginPath(); x.roundRect(14, 14, W - 28, H - 28, 28); x.stroke();
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  x.fillStyle = '#4A3422'; x.textAlign = 'center'; x.font = `700 30px ${font}`; x.fillText(T('mz.r.title'), W / 2, 86);
  x.font = `500 20px ${font}`; x.fillStyle = '#7B5F43'; x.fillText(new Date(r.at).toLocaleString(LOC, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }), W / 2, 120);
  const gc = { S: '#D9654A', A: '#E2AE47', B: '#4E95D0', C: '#8A8A8A' }[r.grade];
  x.fillStyle = gc; x.font = `900 180px ${font}`; x.fillText(r.grade, W / 2, 300);
  x.fillStyle = '#4A3422'; x.font = `700 26px ${font}`; x.fillText(T('mz.r.line.' + r.grade), W / 2, 360);
  const rows = [[T('mz.r.floors'), String(r.floors)], [T('mz.r.time'), fmtDur(r.ms)], [T('mz.r.cells'), fmt(r.cells)], [T('mz.r.stairs'), String(r.stairs)], [T('mz.r.marks'), String(r.marks)]];
  rows.forEach(([k, v], i) => {
    const y = 420 + i * 72;
    x.fillStyle = 'rgba(255,250,238,.9)'; x.beginPath(); x.roundRect(70, y, W - 140, 58, 16); x.fill();
    x.textAlign = 'left'; x.fillStyle = '#7B5F43'; x.font = `600 22px ${font}`; x.fillText(k, 96, y + 38);
    x.textAlign = 'right'; x.fillStyle = '#4A3422'; x.font = `800 30px ${font}`; x.fillText(v, W - 96, y + 40);
  });
  // 角色
  try {
    const spr = JSON.parse(document.body.dataset.sprites || '{}');
    const pose = r.grade === 'S' || r.grade === 'A' ? 'adv-cheer' : r.grade === 'B' ? 'adv-look' : 'adv-sit';
    if (spr[pose]) { const img = new Image(); img.src = spr[pose][1]; await img.decode(); x.imageSmoothingEnabled = false; const h = 150, w = img.naturalWidth * (h / img.naturalHeight); x.drawImage(img, 60, 190, w, h); }
  } catch { /* 略 */ }
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = `700 22px system-ui, sans-serif`;
  x.fillStyle = '#D9654A'; x.beginPath(); x.roundRect(W / 2 - 120, H - 84, 240, 44, 22); x.fill(); x.fillStyle = '#fff'; x.fillText('starcg.online', W / 2, H - 54);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'maze-result.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: T('mz.r.title') }); return; } catch { /* 使用者取消 → 改下載 */ } }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'maze-result.png' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ───── 打包分享：探索結束後，把每層的樓梯座標與自己標的點整理成一段文字，一鍵複製給別人 ─────
function buildPack(run) {
  const floors = runFloors().map(({ n, f }) => {
    const m = f.map;
    const pts = m ? allPoints(f).filter(x => !(!x.mark && f.mask && !f.mask[x.i])) : [];
    return { n, name: f.name, shard: f.shard, w: m?.width || 0, h: m?.height || 0,
      pts: pts.map(x => ({ kind: x.kind, e: x.e, s: x.s, note: x.mark?.note || '' })).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.s - b.s || a.e - b.e) };
  });
  return { at: run.at, end: Date.now(), start: run.start, floors, shard: floors.find(x => x.shard)?.shard || '' };
}
const MD = new Intl.DateTimeFormat(LOC, { month: 'numeric', day: 'numeric' });
// 重製時間：datetime-local 的值 → 「月/日 時:分:秒」；打不出日期欄的瀏覽器就照使用者打的字
function fmtReset(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
  if (!m) return v.trim();
  return `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}:${m[6] || '00'}`;
}
function packText(p, form) {
  const L = [];
  L.push(`【${T('mz.p.head')}】${form.name} · ${form.shard}`);
  L.push(`${T('mz.p.reset')}：${fmtReset(form.reset)}`);
  L.push(`${T('mz.p.explored')}：${MD.format(p.at)} ${HM.format(p.at)}–${HM.format(p.end)} · ${T('mz.p.floorsN', { n: p.floors.length })}`);
  L.push('');
  for (const fl of p.floors) {
    L.push(`▸ ${T('mz.floorN', { n: fl.n })}`);
    if (!fl.pts.length) L.push(`　${T('mz.p.none')}`);
    for (const x of fl.pts) {
      const k = T('mz.k.' + KIND_NAME(x.kind));
      L.push(`　${x.note ? `${k}「${x.note}」` : k}　${xyShort(x.e, x.s)}`);
    }
  }
  L.push('');
  L.push(`${T('mz.p.by')} ${location.origin}${LANG === 'ko' ? '/ko' : ''}/maze/`);
  return L.join('\n');
}
function packForm() {
  return { name: $('#mz-pack-name').value.trim(), shard: $('#mz-pack-shard').value.trim(), reset: $('#mz-pack-reset').value.trim() };
}
function renderPack() {
  const box = $('#mz-pack');
  const show = !!S.pack && !S.run && S.source && S.source.kind !== 'files';
  box.hidden = !show;
  if (!show) return;
  const p = S.pack;
  if (box.dataset.id !== String(p.end)) {
    box.dataset.id = String(p.end);
    $('#mz-pack-out').hidden = true; $('#mz-pack-text').value = '';
    if (!$('#mz-pack-shard').value) $('#mz-pack-shard').value = p.shard;
    const last = (store.get(PREF) || {}).packName; if (!$('#mz-pack-name').value && last) $('#mz-pack-name').value = last;
  }
  $('#mz-pack-sum').textContent = T('mz.p.sum', { n: p.floors.length, k: p.floors.reduce((a, f) => a + f.pts.length, 0) });
  packReady();
}
function packReady() {
  const f = packForm();
  const ok = !!(f.name && f.shard && f.reset);
  $('#mz-pack-go').hidden = !ok;
  $('#mz-pack-need').hidden = ok;
  return ok;
}
function doPack() {
  if (!S.pack || !packReady()) return;
  track('maze.pack');
  const f = packForm();
  store.set(PREF, { ...store.get(PREF), packName: f.name });
  $('#mz-pack-text').value = packText(S.pack, f);
  $('#mz-pack-out').hidden = false;
  $('#mz-pack-text').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ───── 畫面切換 ─────
function showLive() { $('#mz-start').hidden = true; $('#mz-live').hidden = false; requestAnimationFrame(resize); }
function showStart() {
  closePip();
  $('#mz-live').hidden = true; $('#mz-start').hidden = false; showResume();
}
function unlink() {
  const wasDir = S.source?.kind === 'dir';
  stopSource(wasDir);
  S.manual.clear(); S.floors.clear(); S.cur = null; S.liveKey = null; S.run = null;
  showStart();
}

// ───── 介面 ─────
function runFloors() {
  if (!S.run) return [];
  return Object.entries(S.run.floors).map(([key, v]) => ({ key, n: v.n, f: S.floors.get(key) })).filter(x => x.f).sort((a, b) => a.n - b.n);
}
function renderFloors() {
  let html = '';
  if (S.run) {
    html = runFloors().map(({ key, n, f }) => `<button type="button" class="chip mz-chip${key === S.liveKey ? ' live' : ''}" data-key="${esc(key)}" aria-pressed="${key === S.cur}" title="${esc(`${f.shard} ${f.name}.dat`)}">${key === S.liveKey ? '<i class="mz-dot sm"></i>' : ''}${esc(T('mz.floorN', { n }))}</button>`).join('');
    if (!html) html = `<span class="muted small">${esc(T('mz.noFloorYet'))}</span>`;
  }
  html += [...S.manual.values()].map(f => `<button type="button" class="chip mz-chip" data-key="${esc(f.key)}" aria-pressed="${f.key === S.cur}">${esc(f.name)}</button>`).join('');
  $('#mz-floors').innerHTML = html;
  $('.mz-floorbar').hidden = !html;
}
function renderStatus() {
  const src = S.source;
  const dot = $('#mz-dot');
  let st = 'live', label = T('mz.st.live');
  if (!src) { st = 'off'; label = T('mz.st.files'); }
  else if (src.kind === 'demo') { st = 'live'; label = T('mz.st.demo'); }
  else if (src.kind === 'files') { st = 'off'; label = T('mz.st.files'); }
  else if (S.error) { st = 'bad'; label = T('mz.st.error'); }
  else if (!S.liveKey) { st = 'wait'; label = T('mz.st.wait'); }
  dot.className = 'mz-dot ' + st;
  $('#mz-state').textContent = label;
  const shards = [...new Set([...S.floors.values()].filter(f => !f.manual && f.shard).map(f => f.shard))].sort().join('/');
  $('#mz-src').textContent = src && src.kind !== 'files' ? [src.label, shards].filter(Boolean).join(' · ') : '';
  $('#mz-unlink').querySelector('span').textContent = src?.kind === 'demo' ? T('mz.endDemo') : src?.kind === 'dir' ? T('mz.unlink') : T('mz.close');
  $('#mz-follow').closest('.switch').hidden = !src || src.kind === 'files' || !S.run;
  const rl = $('#mz-runline');
  rl.hidden = !S.run || !src || src.kind === 'files';
  if (S.run) {
    const ns = Object.values(S.run.floors).map(x => x.n);
    rl.querySelector('span').textContent = (S.run.resumed ? T('mz.runResumed') + ' · ' : '') + T('mz.runOn', { t: HM.format(S.run.at), n: ns.length ? Math.max(...ns) : S.run.start });
  }
  $('.mz-legend-old').hidden = !S.run;
  // 還沒開始探索：顯示開始面板
  const begin = beginState();
  $('#mz-begin').hidden = !begin;
  $('#mz-stage').hidden = begin; $('#mz-legend').hidden = begin; $('#mz-view').hidden = begin;
  $('#mz-mark').hidden = begin || !S.run;
  if (!S.run && R.place) setPlace(null);
  if (begin) { $('#mz-begin-n').max = 200; }
}
const beginState = () => !S.run && S.source && S.source.kind !== 'files' && !(S.cur && S.manual.has(S.cur));
function renderPanel() {
  const f = !beginState() && S.cur && S.floors.get(S.cur);
  const m = f?.map;
  const n = f && S.run && S.run.floors[f.key] ? S.run.floors[f.key].n : null;
  $('#mz-title').innerHTML = f ? `${esc(n != null ? T('mz.floorN', { n }) : f.manual ? f.name : T('mz.mapN', { n: f.name }))}${f.shard ? ` <span class="badge b-sky">${esc(f.shard)}</span>` : ''}${f.key === S.liveKey && S.source?.kind !== 'files' ? ` <span class="badge b-mint">${esc(T('mz.now'))}</span>` : ''}` : esc(T('mz.title'));
  // 樓梯清單
  const box = $('#mz-exits');
  if (!m) box.innerHTML = beginState() ? emptyState('mouse-lav', T('mz.b.sideEmpty')) : '';
  else {
    const list = allPoints(f).map(x => ({ ...x, old: !x.mark && !!f.mask && !f.mask[x.i] })).sort((a, b) => (a.old - b.old) || ORDER[a.kind] - ORDER[b.kind] || a.s - b.s || a.e - b.e);
    box.innerHTML = list.length ? list.map(x => {
      const k = KIND_NAME(x.kind);
      const del = x.mark ? `<button type="button" class="btn sm icon ghost" data-del="${-1 - x.i}" title="${esc(T('mz.markDel'))}" aria-label="${esc(T('mz.markDel'))}"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg></button>` : '';
      return `<div class="mz-exit${R.sel === x.i ? ' on' : ''}${x.old ? ' old' : ''}${x.mark ? ' mine' : ''}"><button type="button" class="mz-exit-go" data-i="${x.i}"><i class="mzk mzk-${k}"></i><span class="mz-exit-name"><b>${esc(x.mark?.note || T('mz.k.' + k))}</b>${x.old ? `<span class="badge b-gray" title="${esc(T('mz.oldTip'))}">${esc(T('mz.old'))}</span>` : ''}${x.mark && x.mark.note ? `<span class="badge b-gray">${esc(T('mz.k.' + k))}</span>` : ''}</span><span class="mz-xy"><span>${esc(T('mz.e'))}<b>${x.e}</b></span><span>${esc(T('mz.s'))}<b>${x.s}</b></span></span></button>${del}<button type="button" class="btn sm icon ghost" data-copy="${esc(xyShort(x.e, x.s))}" title="${esc(T('mz.copyCoord'))}" aria-label="${esc(T('mz.copyCoord'))}"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg></button></div>`;
    }).join('') : emptyState('mouse-lav', T('mz.noExits'), T('mz.noExitsTip'));
  }
  // 這層資訊
  $('#mz-info').innerHTML = m ? [
    [T('mz.i.map'), f.name], [T('mz.i.shard'), f.shard || '–'], [T('mz.i.size'), `${m.width} × ${m.height}`],
    [T('mz.i.floor'), T('mz.cells', { n: fmt(m.floor) })], [T('mz.i.time'), f.changedAt ? TF.format(f.changedAt) : '–'],
  ].map(([a, b]) => `<div class="stat-tile"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('') : '';
  // 等待畫面
  const wait = $('#mz-wait');
  const msg = S.run && !S.cur ? [T('mz.waitEnter'), T('mz.waitEnterTip')] : !S.floors.size ? (S.source?.kind === 'dir' ? [T('mz.noDat'), T('mz.noDatTip')] : [T('mz.loading'), '']) : !m ? [T('mz.loading'), ''] : null;
  wait.hidden = !msg;
  if (msg) { wait.querySelector('b').textContent = msg[0]; wait.querySelector('span').textContent = msg[1]; }
}
function renderDiag() {
  const box = $('#mz-diag'); if (!box) return;
  const d = S.source?.diag;
  const lines = [];
  if (S.source) lines.push(`${T('mz.d.source')}: ${S.source.kind} · ${S.source.label}`);
  if (d) {
    lines.push(`${T('mz.d.scanned')}: ${d.at ? TF.format(d.at) : '–'} (${Math.round(S.scanMs)} ms, read ${d.read})`);
    for (const r of d.dirs) lines.push(`  ${r.path}/ → ${T('mz.d.files', { n: r.files, d: r.dat })}`);
    for (const e of d.errors) lines.push(`  ✗ ${e}`);
  }
  for (const f of S.floors.values()) lines.push(`  ${f.key} · ${f.fp}${f.error ? ' ✗ ' + f.error : ''}${f.map ? ` · ${f.map.width}×${f.map.height} · ${f.map.exits.length} exits` : ''}${f.key === S.liveKey ? ' ◀' : ''}`);
  if (S.errorText) lines.push('✗ ' + S.errorText);
  box.querySelector('pre').textContent = lines.join('\n');
}
function renderAll() {
  renderStatus(); renderFloors(); renderPanel(); renderPack();
  const f = S.cur && S.floors.get(S.cur);
  if (f?.map && R.autoFit) fit();
  draw();
}

// ───── 地圖繪製 ─────
const stage = $('#mz-stage'), canvas = $('#mz-canvas'), ctx = canvas.getContext('2d');
const win = () => stage.ownerDocument.defaultView || window;
function readColors() {
  const cs = win().getComputedStyle(stage);
  const v = n => cs.getPropertyValue(n).trim();
  R.C = {
    floor: v('--mz-floor'), old: v('--mz-floor-old'), gap: v('--mz-gap'), gapOld: v('--mz-gap-old'), shadow: v('--mz-shadow'), hover: v('--mz-hover'),
    wall: v('--mz-wall'), wallOld: v('--mz-wall-old'), wallDark: v('--mz-wall-dark'),
    kind: ['--mz-other', '--mz-up', '--mz-down', '--mz-crystal', '--mz-warp', '--mz-poi', '--mz-chest', '--mz-mob', '--mz-note', '--mz-npc'].map(v), label: v('--mz-label'), labelInk: v('--mz-label-ink'),
  };
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  R.dpr = Math.min(3, win().devicePixelRatio || 1);
  R.w = w; R.h = h;
  canvas.width = Math.round(w * R.dpr); canvas.height = Math.round(h * R.dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  if (R.autoFit) fit();
  draw();
}
function curMap() { const f = !beginState() && S.cur && S.floors.get(S.cur); return f?.map ? f : null; }
function matrix() {
  const m = new DOMMatrix();
  m.translateSelf(R.w / 2, R.h / 2);
  if (R.iso) m.rotateSelf(-45);
  m.scaleSelf(R.zoom);
  m.translateSelf(-R.cx, -R.cy);
  return m;
}
function fit() {
  const f = curMap();
  if (!f || !R.w) return;
  const m = f.map;
  const b = m.bbox || { minE: 0, maxE: m.width - 1, minS: 0, maxS: m.height - 1 };
  const pad = 1.5;
  const x0 = b.minE - pad, x1 = b.maxE + 1 + pad, y0 = b.minS - pad, y1 = b.maxS + 1 + pad;
  R.cx = (x0 + x1) / 2; R.cy = (y0 + y1) / 2;
  const ew = R.iso ? (x1 - x0 + y1 - y0) * Math.SQRT1_2 : x1 - x0;
  const eh = R.iso ? ew : y1 - y0;
  R.zoom = clamp(Math.min((R.w - 56) / ew, (R.h - 56) / eh), 2, 42);
}
function buildPaths(f) {
  const m = f.map, mask = f.mask, W = m.width, H = m.height;
  const P = { fresh: new Path2D(), old: new Path2D(), tile: new Path2D(), tileOld: new Path2D(), wall: new Path2D(), wallOld: new Path2D() };
  for (let s = 0; s < H; s++) {
    let start = -1, runOld = false;
    for (let e = 0; e <= W; e++) {
      const i = s * W + e;
      const mk = e < W ? m.mark[i] : 0;
      const seen = e < W && (isFloor(m.tile[i]) || mk === MARK_EXIT);
      // 牆：有物件但不是出入口的格子（物件層放牆和裝飾）
      const wall = seen && !!m.obj[i] && mk !== MARK_EXIT;
      const on = seen && !wall;
      const old = seen && !!mask && !mask[i];
      if (start >= 0 && (!on || old !== runOld)) { (runOld ? P.old : P.fresh).rect(start, s, e - start, 1); start = -1; }
      if (on && start < 0) { start = e; runOld = old; }
      if (on) (old ? P.tileOld : P.tile).rect(e + 0.08, s + 0.08, 0.84, 0.84);
      if (wall) (old ? P.wallOld : P.wall).rect(e, s, 1, 1);
    }
  }
  return P;
}
function glyph(kind, x, y, g) {
  ctx.beginPath();
  if (kind === 1) { ctx.moveTo(x, y - g); ctx.lineTo(x + g, y + g * 0.7); ctx.lineTo(x - g, y + g * 0.7); }
  else if (kind === 2) { ctx.moveTo(x, y + g); ctx.lineTo(x + g, y - g * 0.7); ctx.lineTo(x - g, y - g * 0.7); }
  else if (kind === 3) { ctx.moveTo(x, y - g * 1.1); ctx.lineTo(x + g * 0.75, y); ctx.lineTo(x, y + g * 1.1); ctx.lineTo(x - g * 0.75, y); }
  else if (kind === 4) { for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + k * Math.PI / 4, r = k % 2 ? g * 0.42 : g * 1.1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }
  else if (kind === 6) { ctx.rect(x - g * 1.05, y - g * 0.75, g * 2.1, g * 1.5); ctx.fill(); ctx.beginPath(); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.rect(x - g * 1.05, y - g * 0.15, g * 2.1, g * 0.22); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 0.05 * g, g * 0.22, 0, Math.PI * 2); ctx.fill(); return; }
  else if (kind === 7) { ctx.font = `900 ${Math.round(g * 2.6)}px ${getComputedStyle(document.body).getPropertyValue('--font-data') || 'system-ui'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + g * 0.1); return; }
  else if (kind === 8) { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? g * 0.5 : g * 1.15; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } }
  else if (kind === 9) { ctx.arc(x, y - g * 0.5, g * 0.48, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x, y + g * 1.05, g * 0.95, Math.PI, 0); ctx.closePath(); ctx.fill(); return; }
  else if (kind === 5) { ctx.font = `800 ${Math.round(g * 2.4)}px ${getComputedStyle(document.body).getPropertyValue('--font-data') || 'system-ui'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x, y + g * 0.1); return; }
  else { ctx.arc(x, y, g * 0.55, 0, Math.PI * 2); }
  ctx.closePath(); ctx.fill();
}
function markerR() { return clamp(R.zoom * 0.6, 10, 16); }
function draw() {
  if (!R.w) return;
  if (!R.C) readColors();
  const C = R.C, dpr = R.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, R.w, R.h);
  const f = curMap();
  if (!f) return;
  const m = f.map;
  if (!R.paths || R.pathsFor !== f.map) { R.paths = buildPaths(f); R.pathsFor = f.map; }
  const P = R.paths, mat = matrix(), z = R.zoom;
  const apply = () => ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
  // 地板（下方加一點陰影，看起來像一塊塊石板）
  ctx.save(); ctx.translate(0, clamp(z * 0.22, 1.5, 6)); apply(); ctx.fillStyle = C.shadow; ctx.fill(P.fresh); ctx.fill(P.old); ctx.restore();
  ctx.save(); apply();
  // 牆：先畫一層暗色底，再畫稍微內縮的牆面，看起來像石牆
  ctx.fillStyle = C.wallDark; ctx.fill(P.wall); ctx.fill(P.wallOld);
  ctx.save(); ctx.translate(0, -0.18); ctx.fillStyle = C.wall; ctx.fill(P.wall); ctx.fillStyle = C.wallOld; ctx.fill(P.wallOld); ctx.restore();
  if (z >= 12) {
    ctx.fillStyle = C.gap; ctx.fill(P.fresh); ctx.fillStyle = C.gapOld; ctx.fill(P.old);
    ctx.fillStyle = C.floor; ctx.fill(P.tile); ctx.fillStyle = C.old; ctx.fill(P.tileOld);
  } else {
    ctx.fillStyle = C.floor; ctx.fill(P.fresh); ctx.fillStyle = C.old; ctx.fill(P.old);
  }
  if (R.hover && !R.hoverExit) { ctx.strokeStyle = C.hover; ctx.lineWidth = 2.2 / z; ctx.strokeRect(R.hover.e + 0.03, R.hover.s + 0.03, 0.94, 0.94); }
  ctx.restore();
  // 樓梯、水晶：固定大小、永遠正立
  const r = markerR(), now = performance.now();
  const showLabel = true;
  const list = allPoints(f).map(x => ({ x, p: mat.transformPoint(new DOMPoint(x.e + 0.5, x.s + 0.5)), old: !x.mark && !!f.mask && !f.mask[x.i] }));
  list.sort((a, b) => (b.old - a.old) || a.p.y - b.p.y);
  if (R.place && R.hover) { const hp = mat.transformPoint(new DOMPoint(R.hover.e + 0.5, R.hover.s + 0.5)); ctx.save(); ctx.globalAlpha = .55; ctx.beginPath(); ctx.arc(hp.x, hp.y, r, 0, Math.PI * 2); ctx.fillStyle = C.kind[MARK_KINDS[R.place]]; ctx.fill(); ctx.fillStyle = '#fff'; glyph(MARK_KINDS[R.place], hp.x, hp.y, r * 0.5); ctx.restore(); }
  ctx.font = `700 11.5px ${getComputedStyle(document.body).getPropertyValue('--font-data') || 'system-ui'}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const { x, p, old } of list) {
    const col = C.kind[x.kind];
    ctx.save();
    ctx.globalAlpha = old ? 0.5 : 1;
    if (R.sel === x.i && now < R.pulseUntil) {
      const t = ((now / 900) % 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + t * 16, 0, Math.PI * 2);
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = (old ? 0.5 : 1) * (1 - t); ctx.stroke();
      ctx.globalAlpha = old ? 0.5 : 1;
    }
    ctx.beginPath(); ctx.arc(p.x, p.y + 2.5, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = R.sel === x.i || R.hoverExit === x.i ? 3.5 : 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; glyph(x.kind, p.x, p.y, r * 0.5);
    if (showLabel) {
      const txt = (x.mark?.note ? x.mark.note + ' · ' : '') + xyShort(x.e, x.s), tw = ctx.measureText(txt).width + 12, ty = p.y + r + 12;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x - tw / 2, ty - 9, tw, 18, 9); else ctx.rect(p.x - tw / 2, ty - 9, tw, 18);
      ctx.fillStyle = C.label; ctx.fill();
      ctx.fillStyle = C.labelInk; ctx.fillText(txt, p.x, ty + 0.5);
    }
    ctx.restore();
  }
  if (R.sel != null && now < R.pulseUntil) win().requestAnimationFrame(draw);
}

// 螢幕座標 → 格子
function cellAt(sx, sy) {
  const f = curMap(); if (!f) return null;
  const p = matrix().inverse().transformPoint(new DOMPoint(sx, sy));
  const e = Math.floor(p.x), s = Math.floor(p.y);
  return e >= 0 && s >= 0 && e < f.map.width && s < f.map.height ? { e, s } : null;
}
function exitAt(sx, sy) {
  const f = curMap(); if (!f) return null;
  const mat = matrix(), r = markerR() + 4;
  let best = null, bd = r * r;
  for (const x of allPoints(f)) {
    const p = mat.transformPoint(new DOMPoint(x.e + 0.5, x.s + 0.5));
    const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
    if (d <= bd) { bd = d; best = x; }
  }
  return best;
}
function showCoord(c, ex) {
  const el = $('#mz-coord');
  if (!c && !ex) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = ex ? `${T('mz.k.' + KIND_NAME(ex.kind))}${ex.mark?.note ? ' · ' + ex.mark.note : ''} · ${xy(ex.e, ex.s)}` : R.place ? `${T('mz.placeHint', { t: T('mz.k.' + R.place) })} · ${xy(c.e, c.s)}` : xy(c.e, c.s);
}
function zoomAt(k, sx = R.w / 2, sy = R.h / 2) {
  const before = matrix().inverse().transformPoint(new DOMPoint(sx, sy));
  R.zoom = clamp(R.zoom * k, 1.5, 72);
  const after = matrix().inverse().transformPoint(new DOMPoint(sx, sy));
  R.cx += before.x - after.x; R.cy += before.y - after.y;
  R.autoFit = false; draw();
}
function panBy(dx, dy) {
  const inv = matrix().inverse();
  const a = inv.transformPoint(new DOMPoint(0, 0)), b = inv.transformPoint(new DOMPoint(dx, dy));
  R.cx -= b.x - a.x; R.cy -= b.y - a.y;
  R.autoFit = false; draw();
}
function focusExit(i) {
  const f = curMap(); if (!f) return;
  const x = allPoints(f).find(q => q.i === i); if (!x) return;
  R.sel = i; R.cx = x.e + 0.5; R.cy = x.s + 0.5;
  if (R.zoom < 14) R.zoom = 14;
  R.autoFit = false; R.pulseUntil = performance.now() + 2600;
  renderPanel(); draw();
}

// 滑鼠、觸控
const ptrs = new Map();
let drag = null, pinch = null;
const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const p = local(e); ptrs.set(e.pointerId, p);
  if (ptrs.size === 1) drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; }
});
canvas.addEventListener('pointermove', e => {
  const p = local(e);
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.d > 0) zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.d = d; return;
  }
  if (drag && ptrs.has(e.pointerId)) {
    if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) drag.moved = true;
    if (drag.moved) { panBy(p.x - drag.x, p.y - drag.y); drag.x = p.x; drag.y = p.y; canvas.classList.add('grabbing'); }
    return;
  }
  if (e.pointerType === 'mouse') {
    const ex = exitAt(p.x, p.y), c = cellAt(p.x, p.y);
    const changed = (ex?.i ?? null) !== R.hoverExit || c?.e !== R.hover?.e || c?.s !== R.hover?.s;
    R.hoverExit = ex?.i ?? null; R.hover = c;
    canvas.style.cursor = ex ? 'pointer' : 'grab';
    if (changed) { showCoord(c, ex); draw(); }
  }
});
const endPtr = e => {
  const p = local(e);
  const wasDrag = drag && !drag.moved && ptrs.size === 1;
  ptrs.delete(e.pointerId);
  canvas.classList.remove('grabbing');
  if (ptrs.size < 2) pinch = null;
  if (wasDrag && e.type === 'pointerup') {
    const ex = exitAt(p.x, p.y);
    if (R.place) { const c = cellAt(p.x, p.y); if (c) addMark(R.place, c); }
    else if (ex) focusExit(ex.i);
    else if (e.pointerType !== 'mouse') { const c = cellAt(p.x, p.y); R.hover = c; showCoord(c, null); draw(); }
  }
  if (!ptrs.size) drag = null;
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) { R.hover = null; R.hoverExit = null; showCoord(null); draw(); } });
canvas.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016)), p.x, p.y); }, { passive: false });
canvas.addEventListener('dblclick', e => { const p = local(e); zoomAt(1.8, p.x, p.y); });

// ───── 浮動小視窗、全螢幕 ─────
async function openPip() {
  if (R.pip) { closePip(); return; }
  let w;
  try { w = await window.documentPictureInPicture.requestWindow({ width: 440, height: 460 }); } catch { toast(T('mz.pipFail')); return; }
  for (const s of document.styleSheets) {
    if (s.href) { const l = w.document.createElement('link'); l.rel = 'stylesheet'; l.href = s.href; w.document.head.append(l); continue; }
    try { const st = w.document.createElement('style'); st.textContent = [...s.cssRules].map(r => r.cssText).join('\n'); w.document.head.append(st); } catch { /* 略過 */ }
  }
  for (const a of document.documentElement.attributes) w.document.documentElement.setAttribute(a.name, a.value);
  w.document.title = T('mz.title');
  const sprite = document.querySelector('symbol#i-plus')?.closest('svg');
  if (sprite) w.document.body.append(sprite.cloneNode(true));
  w.document.body.className = 'mz-pipbody';
  const ph = document.createElement('div');
  ph.className = 'mz-stage-ph';
  ph.innerHTML = `<b>${esc(T('mz.pipOn'))}</b><button type="button" class="btn sm">${esc(T('mz.pipBack'))}</button>`;
  ph.querySelector('button').addEventListener('click', closePip);
  stage.before(ph);
  w.document.body.append(stage);
  R.pip = w;
  w.addEventListener('resize', resize);
  w.addEventListener('pagehide', () => {
    ph.replaceWith(stage); R.pip = null; R.C = null;
    requestAnimationFrame(resize); schedule();
  });
  R.C = null; resize(); schedule();
}
function closePip() { if (R.pip) R.pip.close(); }
function toggleFull() {
  const d = stage.ownerDocument;
  if (d.fullscreenElement) d.exitFullscreen();
  else stage.requestFullscreen?.().catch(() => {});
}

// ───── 事件 ─────
$('#mz-link').addEventListener('click', pickFolder);
$('#mz-resume').addEventListener('click', resume);
$('#mz-demo').addEventListener('click', () => setSource(demoSource()));
$('#mz-file').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
$('#mz-unlink').addEventListener('click', unlink);
$('#mz-diag-copy').addEventListener('click', () => copy($('#mz-diag pre').textContent));
$('#mz-begin-fresh').addEventListener('click', () => startRun('fresh', 1));
$('#mz-begin-mid').addEventListener('click', () => startRun('mid', clamp(Number($('#mz-begin-n').value) || 1, 1, 200)));
$('#mz-runend').addEventListener('click', endRun);
['#mz-pack-name', '#mz-pack-shard', '#mz-pack-reset'].forEach(q => $(q).addEventListener('input', packReady));
$('#mz-pack-go').addEventListener('click', doPack);
$('#mz-pack-copy').addEventListener('click', () => copy($('#mz-pack-text').value));
$('#mz-pack-close').addEventListener('click', () => { S.pack = null; idb.del('pack'); renderPack(); });
$('#mr-save')?.addEventListener('click', resultImage);
$('#mr-pack')?.addEventListener('click', () => { $('#sheet-mzresult').close(); $('#mz-pack')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#mz-follow').checked = S.follow;
$('#mz-follow').addEventListener('change', e => {
  S.follow = e.target.checked; store.set(PREF, { ...store.get(PREF), follow: S.follow });
  if (S.follow && S.liveKey) { setCur(S.liveKey); renderAll(); poll(); }
});
const pickFloor = key => {
  if (!key || key === S.cur) return;
  if (key !== S.liveKey && S.follow && S.source?.kind !== 'files') { S.follow = false; $('#mz-follow').checked = false; }
  setCur(key); renderAll(); poll();
};
$('#mz-floors').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) pickFloor(b.dataset.key); });
$('#mz-view').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  R.iso = b.value === 'iso';
  $$('#mz-view button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  stage.classList.toggle('is-iso', R.iso);
  store.set(PREF, { ...store.get(PREF), view: R.iso ? 'iso' : 'grid' });
  R.autoFit = true; fit(); draw();
});
$$('#mz-view button').forEach(x => x.setAttribute('aria-pressed', String((x.value === 'iso') === R.iso)));
stage.classList.toggle('is-iso', R.iso);
stage.querySelector('.mz-zoom').addEventListener('click', e => {
  const z = e.target.closest('[data-z]')?.dataset.z;
  if (z === 'in') zoomAt(1.4); else if (z === 'out') zoomAt(1 / 1.4);
  else if (z === 'fit') { R.autoFit = true; R.sel = null; fit(); draw(); renderPanel(); }
  else if (z === 'pip') openPip(); else if (z === 'full') toggleFull();
});
stage.querySelector('[data-z="pip"]').hidden = !PIP_OK;
$('#mz-mark').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) setPlace(b.dataset.type); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && R.place) setPlace(null); });
$('#mz-exits').addEventListener('click', e => {
  const d = e.target.closest('[data-del]'); if (d) { delMark(Number(d.dataset.del)); return; }
  const c = e.target.closest('[data-copy]'); if (c) { copy(c.dataset.copy); return; }
  const g = e.target.closest('[data-i]'); if (g) focusExit(Number(g.dataset.i));
});
new ResizeObserver(() => { if (!R.pip) resize(); }).observe(stage);
new MutationObserver(() => {
  R.C = null;
  if (R.pip) for (const a of document.documentElement.attributes) R.pip.document.documentElement.setAttribute(a.name, a.value);
  draw();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.source) schedule(60); });
document.addEventListener('fullscreenchange', () => requestAnimationFrame(resize));

// 拖曳 .dat 檔進頁面
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#mz-drop').hidden = false; });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('#mz-drop').hidden = true; } });
addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('#mz-drop').hidden = true;
  addFiles([...e.dataTransfer.files]);
});

// 測試用：直接接上一個資料夾物件（不記住）
window.__mzConnect = h => connect(h, false);

// ───── 開始 ─────
if (!FS_OK) { $('#mz-unsupported').hidden = false; $('#mz-link').hidden = true; }
else if (window !== window.top) problem(T('mz.embedded'));
addEventListener('error', e => problem('JS: ' + (e.message || e.error)));
addEventListener('unhandledrejection', e => problem('Promise: ' + (e.reason?.message || e.reason)));
(async () => {
  await restoreRuns();
  if (FS_OK) await restore();
})();
