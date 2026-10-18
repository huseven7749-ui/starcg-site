// 資料管理：匯入成交紀錄、備份與還原本機資料
import { $, T, esc, fmt, store, toast, downloadCsv } from './core.js';
import { parseImport, mergeRecords, twTime } from './mkstats.js';
import { wipeGameBackup } from './game.js';

const IMP_KEY = 'sc.imported';
const MAX_RECORDS = 20000;
export const importedRecords = () => store.get(IMP_KEY, []) || [];
const curName = c => T(c ? 'common.crystal' : 'common.coin');

function renderSummary() {
  const r = importedRecords();
  const box = $('#dm-summary');
  if (!r.length) { box.innerHTML = `<p class="muted small" style="margin:0">${esc(T('dm.none'))}</p>`; return; }
  const counts = new Map();
  for (const x of r) counts.set(x.n, (counts.get(x.n) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const t0 = Math.min(...r.map(x => x.t)), t1 = Math.max(...r.map(x => x.t));
  box.innerHTML = `<div class="kv kv-3"><div class="stat-tile"><span>${esc(T('dm.count'))}</span><b>${fmt(r.length)}</b></div><div class="stat-tile"><span>${esc(T('dm.items'))}</span><b>${fmt(counts.size)}</b></div><div class="stat-tile dm-period"><span>${esc(T('dm.period'))}</span><b>${esc(twTime(t0).slice(0, 10))} ～ ${esc(twTime(t1).slice(0, 10))}</b></div></div>
    <ul class="dm-top">${top.map(([n, c]) => `<li><span lang="zh-Hant">${esc(n)}</span><b>${fmt(c)}</b></li>`).join('')}</ul>`;
}
function localSummary() {
  const n = k => (store.get(k, []) || []).length;
  const rows = [['dm.l.favs', n('sc.favs')], ['dm.l.recent', n('sc.recent')], ['dm.l.watch', n('sc.watch')], ['dm.l.bulk', n('sc.bulk')], ['dm.l.starts', n('sc.starts')], ['dm.l.imported', n(IMP_KEY)]];
  $('#dm-local').innerHTML = rows.map(([k, v]) => `<div class="stat-tile"><span>${esc(T(k))}</span><b>${fmt(v)}</b></div>`).join('');
}
function doImport(text) {
  const { records, errors } = parseImport(text);
  if (!records.length) { toast(T('dm.importNone')); return; }
  const merged = mergeRecords(importedRecords(), records).slice(-MAX_RECORDS);
  store.set(IMP_KEY, merged);
  toast(T('dm.imported', { n: records.length, e: errors.length }), 3200);
  $('#dm-text').value = '';
  renderSummary(); localSummary();
}
function allLocal() {
  const out = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('sc.')) out[k] = localStorage.getItem(k); } } catch { /* 無痕模式 */ }
  return out;
}

export function initData(refresh = false) {
  renderSummary(); localSummary();
  if (refresh) return;
  $('#dm-import').addEventListener('click', () => doImport($('#dm-text').value));
  $('#dm-file').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast(T('dm.tooBig')); return; }
    doImport(await f.text());
    e.target.value = '';
  });
  $('#dm-export').addEventListener('click', () => {
    const r = importedRecords();
    if (!r.length) { toast(T('dm.none')); return; }
    downloadCsv('starcg-imported.csv', [[T('mk.csvHead.t'), T('mk.csvHead.n'), T('mk.csvHead.q'), T('mk.csvHead.p'), T('mk.csvHead.c')], ...r.map(x => [twTime(x.t), x.n, x.q, x.p, curName(x.c)])]);
  });
  $('#dm-clear').addEventListener('click', () => { if (confirm(T('dm.confirmClear'))) { store.set(IMP_KEY, []); renderSummary(); localSummary(); } });
  $('#dm-save').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'starcg.online', v: 1, at: new Date().toISOString(), data: allLocal() }, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `starcg-tools-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#dm-restore').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const data = j?.data;
      if (!data || typeof data !== 'object') throw new Error('format');
      if (!confirm(T('dm.confirmRestore'))) return;
      for (const [k, v] of Object.entries(data)) if (k.startsWith('sc.') && typeof v === 'string') localStorage.setItem(k, v);
      toast(T('dm.restored'));
      setTimeout(() => location.reload(), 800);
    } catch { toast(T('dm.badBackup')); }
    e.target.value = '';
  });
  $('#dm-wipe').addEventListener('click', () => {
    if (!confirm(T('dm.confirmWipe'))) return;
    try { Object.keys(allLocal()).forEach(k => localStorage.removeItem(k)); } catch { /* 忽略 */ }
    wipeGameBackup();
    toast(T('deleted'));
    setTimeout(() => location.reload(), 800);
  });
}
