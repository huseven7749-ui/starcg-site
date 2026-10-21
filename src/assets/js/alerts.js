// 價格提醒（會員功能）：開通碼綁定這台裝置 → 設定最多 3 個商品的目標價 → 伺服器每 10 分鐘檢查，低於目標價就發 Discord／Email
// 站長管理：網址加上 #admin，輸入站長金鑰後可以產生開通碼、解除裝置綁定、停用
import { $, T, esc, fmt, store, toast, copy, BASE, LANG, PREVIEW, api, normName, debounce } from './core.js';
import { loadCatalog, CRYSTALS } from './catalog.js';

const MAX = 3, TOKEN_KEY = 'sc.alertToken', DEV_KEY = 'sc.alertDev';
let ME = null, ADMIN_KEY = '';

function deviceId() {
  let d = store.get(DEV_KEY, '');
  if (!/^[a-z0-9]{16,40}$/i.test(d)) {
    d = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => (b % 36).toString(36)).join('');
    store.set(DEV_KEY, d);
  }
  return d;
}
async function call(action, body = {}) {
  if (PREVIEW) throw new Error('preview');
  const r = await fetch(`${BASE}api/alerts.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  let d = null;
  try { d = await r.json(); } catch { /* 忽略 */ }
  if (!r.ok || !d || d.ok === false) throw new Error(d?.error || 'http-' + r.status);
  return d;
}
const errText = e => {
  const k = 'al.err.' + String(e.message || e).replace(/[^a-z]+/gi, '_');
  const v = T(k); return v === k ? T('al.err.generic') : v;
};
const say = (id, text, ok = false) => { const el = $(id); el.textContent = text; el.classList.toggle('ok', ok); el.classList.toggle('bad', !ok && !!text); };
const curName = c => T(c ? 'common.crystal' : 'common.coin');
const ago = s => { if (!s) return '–'; const m = Math.max(0, Math.round((Date.now() / 1000 - s) / 60)); return m < 1 ? T('al.justNow') : m < 60 ? T('al.minAgo', { n: m }) : T('al.hourAgo', { n: Math.round(m / 60) }); };

// ───── 會員設定 ─────
function itemRow(it, i) {
  const last = ME?.last?.[it.n];
  const lastTxt = it.n && last ? (last.p != null ? T('al.lowNow', { p: fmt(last.p), c: curName(last.c) }) + (last.nm && last.nm !== it.n ? `（${last.nm}）` : '') : T('al.noneNow')) : '';
  const hit = it.n && last && last.p != null && it.max > 0 && last.p <= it.max && last.c === it.c;
  return `<div class="al-item" data-i="${i}"><span class="al-no">${i + 1}</span>
    <label class="field al-n"><span>${esc(T('al.item'))}</span><input class="input" data-k="n" value="${esc(it.n || '')}" maxlength="40" placeholder="${esc(T('al.itemPh'))}" lang="zh-Hant" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="al-sug-${i}"><ul class="al-sug" id="al-sug-${i}" role="listbox" hidden></ul></label>
    <label class="field al-max"><span>${esc(T('al.below'))}</span><input class="input" data-k="max" type="number" min="1" inputmode="numeric" value="${it.max || ''}" placeholder="0"></label>
    <label class="field al-c"><span>${esc(T('al.cur'))}</span><select class="input" data-k="c"><option value="0"${it.c ? '' : ' selected'}>${esc(T('common.coin'))}</option><option value="1"${it.c ? ' selected' : ''}>${esc(T('common.crystal'))}</option></select></label>
    ${lastTxt ? `<small class="al-last${hit ? ' hit' : ''}">${esc(lastTxt)}</small>` : ''}</div>`;
}
function renderMe() {
  $('#al-join').hidden = !!ME; $('#al-set').hidden = !ME;
  if (!ME) return;
  const items = [...(ME.items || [])];
  while (items.length < MAX) items.push({ n: '', max: 0, c: 0 });
  $('#al-items').innerHTML = items.slice(0, MAX).map(itemRow).join('');
  $('#al-discord').value = ME.discord || ''; $('#al-email').value = ME.email || '';
  $('#al-enabled').checked = !!ME.enabled;
  $('#al-status').textContent = T('al.status', { t: ago(ME.checkedAt) }) + (ME.label ? `　${ME.label}` : '');
}
function readForm() {
  const items = [...document.querySelectorAll('#al-items .al-item')].map(r => ({
    n: r.querySelector('[data-k=n]').value.trim(), max: Math.round(Number(r.querySelector('[data-k=max]').value) || 0), c: Number(r.querySelector('[data-k=c]').value) ? 1 : 0,
  })).filter(x => x.n && x.max > 0);
  return { items, discord: $('#al-discord').value.trim(), email: $('#al-email').value.trim(), enabled: $('#al-enabled').checked };
}
async function loadMe() {
  const token = store.get(TOKEN_KEY, '');
  if (!token) { renderMe(); return; }
  try { ME = (await call('me', { token })).me; }
  catch (e) { if (/not activated/.test(e.message)) store.set(TOKEN_KEY, ''); ME = null; }
  renderMe();
}
function bindMember() {
  $('#al-act-form').addEventListener('submit', async e => {
    e.preventDefault();
    // 開通碼是 12 個英數字（XXXX-XXXX-XXXX）；格式不對就先提醒，不送出（例如貼成站長金鑰）
    if ($('#al-code').value.replace(/[^a-z0-9]/gi, '').length !== 12) { say('#al-act-msg', T('al.err.bad_format')); return; }
    say('#al-act-msg', T('al.working'));
    try {
      const d = await call('activate', { code: $('#al-code').value, device: deviceId() });
      store.set(TOKEN_KEY, d.token); ME = d.me; say('#al-act-msg', ''); renderMe(); toast(T('al.activated'));
    } catch (err) { say('#al-act-msg', errText(err)); }
  });
  $('#al-save').addEventListener('click', async () => {
    const f = readForm();
    if (f.enabled && !f.discord && !f.email) { say('#al-msg', T('al.err.no_channel')); return; }
    say('#al-msg', T('al.working'));
    try { ME = (await call('save', { token: store.get(TOKEN_KEY, ''), ...f })).me; renderMe(); say('#al-msg', T('al.saved'), true); }
    catch (err) { say('#al-msg', errText(err)); }
  });
  $('#al-test').addEventListener('click', async () => {
    say('#al-msg', T('al.working'));
    try {
      const d = await call('test', { token: store.get(TOKEN_KEY, '') });
      say('#al-msg', d.sent?.length ? T('al.testOk', { w: d.sent.map(x => T('al.ch.' + x)).join('、') }) : T('al.testFail'), !!d.sent?.length);
    } catch (err) { say('#al-msg', errText(err)); }
  });
}

// ───── 站長管理 ─────
function renderMembers(list) {
  const day = s => (s ? new Date(s * 1000).toLocaleDateString(LANG === 'ko' ? 'ko-KR' : 'zh-TW') : '–');
  $('#al-members').innerHTML = `<thead><tr><th>${esc(T('al.admin.label'))}</th><th>${esc(T('al.admin.created'))}</th><th>${esc(T('al.admin.device'))}</th><th class="num">${esc(T('al.admin.items'))}</th><th></th></tr></thead><tbody>` +
    (list.length ? list.sort((a, b) => b.created - a.created).map(m => `<tr data-id="${esc(m.id)}"${m.revoked ? ' class="muted"' : ''}><td>${esc(m.label || '—')}${m.revoked ? ` <span class="badge">${esc(T('al.admin.revoked'))}</span>` : ''}</td><td>${day(m.created)}</td><td>${m.bound ? esc(T('al.admin.boundAt', { d: day(m.boundAt) })) : esc(T('al.admin.unbound'))}</td><td class="num">${m.items}</td>
      <td class="num al-admin-btns">${m.bound ? `<button type="button" class="btn sm ghost" data-reset>${esc(T('al.admin.reset'))}</button>` : ''}<button type="button" class="btn sm ghost" data-revoke="${m.revoked ? 0 : 1}">${esc(T(m.revoked ? 'al.admin.restore' : 'al.admin.revoke'))}</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="muted small">${esc(T('al.admin.none'))}</td></tr>`) + '</tbody>';
}
function bindAdmin() {
  if (location.hash !== '#admin') return;
  // 站長管理放到最上面，直接把游標移到金鑰欄
  const box = $('#al-admin'), first = document.querySelector('main .card');
  if (first && first !== box) first.before(box);
  box.hidden = false;
  box.scrollIntoView({ block: 'start' }); $('#al-admin-key').focus({ preventScroll: true });
  $('#al-admin-login').addEventListener('submit', async e => {
    e.preventDefault();
    ADMIN_KEY = $('#al-admin-key').value;
    try { renderMembers((await call('admin_list', { key: ADMIN_KEY })).members); $('#al-admin-login').hidden = true; $('#al-admin-body').hidden = false; say('#al-admin-msg', ''); }
    catch (err) { say('#al-admin-msg', errText(err)); }
  });
  $('#al-gen').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const d = await call('admin_new', { key: ADMIN_KEY, n: Number($('#al-gen-n').value) || 1, label: $('#al-gen-label').value });
      const box = $('#al-new-codes');
      box.hidden = false;
      box.innerHTML = `<div><b>${esc(T('al.admin.newCodes'))}</b><pre class="al-codes">${esc(d.codes.join('\n'))}</pre><button type="button" class="btn sm" data-copy>${esc(T('common.copy'))}</button></div>`;
      box.querySelector('[data-copy]').onclick = async () => { await copy(d.codes.join('\n')); toast(T('common.copied')); };
      renderMembers(d.members);
    } catch (err) { say('#al-admin-msg', errText(err)); }
  });
  $('#al-members').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.closest('tr').dataset.id;
    try {
      const d = b.hasAttribute('data-reset') ? await call('admin_reset', { key: ADMIN_KEY, id }) : await call('admin_revoke', { key: ADMIN_KEY, id, on: b.dataset.revoke === '1' });
      renderMembers(d.members);
    } catch (err) { say('#al-admin-msg', errText(err)); }
  });
}

// ───── 商品名稱建議：輸入開頭就列出完整名稱可以選；也可以只打一部分 ─────
let NAMES = null;
const REMOTE = new Map();
async function names() {
  if (NAMES) return NAMES;
  const set = new Set(CRYSTALS);
  try {
    const c = await loadCatalog();
    c.equip.forEach(e => set.add(e.n)); c.bountyPets.forEach(p => set.add(p.n));
  } catch { /* 忽略 */ }
  try {
    const d = await fetch(BASE + 'data/crafting.json').then(r => r.json());
    for (const list of Object.values(d.cats || {})) for (const it of list) { set.add(it.n); for (const [m] of it.m || []) set.add(m.replace(/^[一二三四五六七八九十]+級/, '')); }
  } catch { /* 忽略 */ }
  NAMES = [...set];
  return NAMES;
}
const fetchRemote = debounce(async (q, input) => {
  if (!q || PREVIEW || REMOTE.has(q)) return;
  REMOTE.set(q, []);
  try {
    const d = await api('market', { q, type: 'item' }, { timeout: 20000 });
    REMOTE.set(q, [...new Set((d.items || []).map(x => x.n).filter(Boolean))]);
  } catch { REMOTE.delete(q); return; }
  if (document.activeElement === input && normName(input.value) === q) showSug(input);
}, 400);
async function showSug(input) {
  const ul = input.parentElement.querySelector('.al-sug');
  const q = normName(input.value.trim());
  if (!q) { hideSug(input); return; }
  const all = [...new Set([...(await names()), ...(REMOTE.get(q) || [])])];
  const starts = [], has = [];
  for (const n of all) { const k = normName(n); if (k === q) continue; if (k.startsWith(q)) starts.push(n); else if (k.includes(q)) has.push(n); }
  const list = [...starts.sort((a, b) => a.length - b.length), ...has.sort((a, b) => a.length - b.length)].slice(0, 8);
  ul.innerHTML = `<li class="al-sug-any" role="option" data-v="${esc(input.value.trim())}">${esc(T('al.sugAny', { q: input.value.trim() }))}</li>` +
    list.map(n => `<li role="option" data-v="${esc(n)}">${esc(n)}</li>`).join('');
  ul.hidden = false; input.setAttribute('aria-expanded', 'true');
}
function hideSug(input) { const ul = input.parentElement.querySelector('.al-sug'); if (ul) ul.hidden = true; input.setAttribute('aria-expanded', 'false'); }
function bindSuggest() {
  const box = $('#al-items');
  box.addEventListener('input', e => { const i = e.target.closest('[data-k=n]'); if (!i) return; showSug(i); fetchRemote(normName(i.value.trim()), i); });
  box.addEventListener('focusin', e => { const i = e.target.closest('[data-k=n]'); if (i && i.value.trim()) showSug(i); });
  box.addEventListener('focusout', e => { const i = e.target.closest('[data-k=n]'); if (i) setTimeout(() => hideSug(i), 150); });
  // 用 pointerdown 選擇，免得輸入框先失去焦點把清單收起來
  box.addEventListener('pointerdown', e => {
    const li = e.target.closest('.al-sug li'); if (!li) return;
    e.preventDefault();
    const i = li.closest('.field').querySelector('[data-k=n]');
    i.value = li.dataset.v; hideSug(i);
    i.closest('.al-item').querySelector('[data-k=max]').focus();
  });
  box.addEventListener('keydown', e => {
    const i = e.target.closest('[data-k=n]'); if (!i) return;
    const ul = i.parentElement.querySelector('.al-sug'); if (ul.hidden) return;
    const items = [...ul.children], cur = ul.querySelector('[aria-selected=true]');
    let k = items.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); k = (k + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, j) => li.setAttribute('aria-selected', String(j === k)));
    } else if (e.key === 'Enter' && cur) { e.preventDefault(); i.value = cur.dataset.v; hideSug(i); }
    else if (e.key === 'Escape') hideSug(i);
  });
}

bindSuggest(); bindMember(); bindAdmin(); loadMe();
window.addEventListener('hashchange', () => { if (location.hash === '#admin') location.reload(); });
