#!/usr/bin/env node
// 星詠魔力工具站 建置腳本（零相依，Node 18+）
//   node build.mjs                         → 產生 dist/（正式網域，預設 https://starcg.online）
//   node build.mjs --site=https://xxx.com  → 換網域
//   node build.mjs --preview               → 產生 preview/（相對路徑＋示範資料，用於離線預覽）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, markdown, plainText } from './tools/markdown.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const PREVIEW = !!args.preview;
const SITE = String(args.site || 'https://starcg.online').replace(/\/+$/, '');
const OUT = path.join(ROOT, PREVIEW ? 'preview' : 'dist');
const SRC = path.join(ROOT, 'src');
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const TODAY_TW = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);     // 台灣今天；心得日期晚於今天的先不發佈（排程上線）
const SHOW_FUTURE = process.argv.includes('--future');
const REGISTER_URL = 'https://member.starcg.net/register.php?ref=Hsu12rDUCzP.PwC3';
const GOOGLE_VERIFY = args.google || '';      // Search Console 驗證碼（可留空，改用 DNS 驗證）
const NAVER_VERIFY = args.naver || 'd576b4c44e8480d1da926bb2a85446fafdcdd298';   // Naver Search Advisor 驗證碼（公開的 meta 值；GitHub 變數 NAVER_VERIFY 有設時以它為準）
// 教學影片（中／韓各一支）：新手彈窗內嵌播放，贊助彈窗也會請大家到影片下留言
// 可用 --video=網址 --video-ko=網址 --sponsor=網址 --sponsor-ko=網址 覆蓋；留空就用下面的預設
const VIDEO = { zh: args.video || 'https://youtu.be/2dk9OO-lSmw?si=jf8WyNkAkoCsPtGg', ko: args['video-ko'] || 'https://youtu.be/vv5wRaEuV-Y?si=rjLWOqEwNbzLjZGu' };
// 贊助站長：BobaBoba 贊助頁（彈窗先請大家到影片下留言，想贊助再點）
const SPONSOR = { zh: args.sponsor || 'https://portaly.cc/hoshino/support', ko: args['sponsor-ko'] || 'https://ko-fi.com/hoshino7749' };
// 贊助者跑馬燈：src/data/sponsors.json 的名單，開頭和結尾都放感謝的話；內容重複一份讓它無縫循環
function sponsorsOf() {
  try { return JSON.parse(fs.readFileSync(path.join(SRC, 'data', 'sponsors.json'), 'utf8')).list || []; } catch { return []; }
}
// 贊助彈窗裡的名單（同一份 sponsors.json）
function sponsorList(lang, t) {
  const list = sponsorsOf();
  if (!list.length) return '';
  return `<div class="sp-names"><h3>${esc(t('sp.label'))}</h3><ul>` + list.map(s => `<li><svg class="ic" aria-hidden="true"><use href="#i-heart"/></svg><b${/[\u4e00-\u9fff]/.test(s.n) ? ' lang="zh-Hant"' : ''}>${esc(s.n)}</b>${s.a ? `<span>${esc(s.a)}</span>` : ''}</li>`).join('') + '</ul></div>';
}
function sponsorBar(lang, t) {
  const list = sponsorsOf();
  if (!list.length) return '';
  const thanks = `<span class="spb-thanks">${esc(t('sp.thanks'))}</span>`;
  const items = list.map(s => `<span class="spb-item"><svg class="ic" aria-hidden="true"><use href="#i-heart"/></svg><b${/[\u4e00-\u9fff]/.test(s.n) ? ' lang="zh-Hant"' : ''}>${esc(s.n)}</b>${s.a ? `<span class="spb-amt">${esc(s.a)}</span>` : ''}</span>`).join('');
  const run = `${thanks}${items}${thanks}`;
  return `<a class="sponsor-bar" href="${esc(SPONSOR[lang] || '#')}" target="_blank" rel="noopener" data-act="sponsor" aria-label="${esc(t('sp.label') + (lang === 'ko' ? ': ' : '：') + list.map(s => s.n + (s.a ? ' ' + s.a : '')).join(lang === 'ko' ? ', ' : '、'))}">` +
    `<span class="spb-track"><span class="spb-run">${run}</span><span class="spb-run" aria-hidden="true">${run}</span></span></a>`;
}

const LANGS = {
  zh: { prefix: '', dict: (await import('./src/i18n/zh.mjs')).default },
  ko: { prefix: '/ko', dict: (await import('./src/i18n/ko.mjs')).default },
};

// 頁面清單：id、路徑、樣板、Schema 類型、sitemap 優先度
const PAGES = [
  { id: 'home', path: '/', tpl: 'home', js: 'home', priority: '1.0', freq: 'daily' },
  { id: 'market', path: '/market/', tpl: 'market', js: 'market', priority: '0.9', freq: 'hourly', app: true },
  { id: 'exchange', path: '/exchange/', tpl: 'exchange', js: 'exchange', priority: '0.8', freq: 'weekly', app: true },
  { id: 'pets', path: '/pets/', tpl: 'pets', js: 'pets', priority: '0.8', freq: 'daily', app: true },
  { id: 'remodel', path: '/remodel/', tpl: 'remodel', js: 'remodel', priority: '0.7', freq: 'weekly', app: true },
  { id: 'damage', path: '/damage/', tpl: 'damage', js: 'damage', priority: '0.6', freq: 'monthly', app: true },
  { id: 'maze', path: '/maze/', tpl: 'maze', js: 'maze', priority: '0.7', freq: 'monthly', app: true },
  { id: 'monsters', path: '/monsters/', tpl: 'monsters', js: 'monsters', priority: '0.7', freq: 'monthly', app: true },
  { id: 'craft', path: '/craft/', tpl: 'craft', js: 'craft', priority: '0.7', freq: 'monthly', app: true },
  { id: 'alerts', path: '/alerts/', tpl: 'alerts', js: 'alerts', priority: '0.5', freq: 'monthly', app: true },
  { id: 'posts', path: '/posts/', tpl: 'posts', js: null, priority: '0.7', freq: 'weekly' },
  { id: '404', path: '/404.html', tpl: '404', js: null, noindex: true, file: true },
];
// 導覽分類（首頁工具區、電腦版下拉、手機版漢堡選單共用同一份分組）
const NAV_GROUPS = [
  { id: 'trade', icon: 'market', items: ['market', 'exchange', 'alerts'] },
  { id: 'calc', icon: 'damage', items: ['damage', 'craft', 'pets', 'remodel'] },
  { id: 'guide', icon: 'book', items: ['monsters', 'maze', 'posts'] },
];
const TOOLS_ALL = ['market', 'exchange', 'pets', 'monsters', 'craft', 'alerts', 'remodel', 'damage', 'maze', 'posts'];   // 頁尾列出全部工具

// ───────────────────────── 工具函式 ─────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const read = p => fs.readFileSync(p, 'utf8');
const hash = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function copyDir(src, dst, filter = () => true) {
  if (!fs.existsSync(src)) return;
  mkdirp(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!filter(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, filter); else fs.copyFileSync(s, d);
  }
}
function write(rel, content) {
  const p = path.join(OUT, rel);
  mkdirp(path.dirname(p));
  fs.writeFileSync(p, content);
}

// 頁面網址（正式：/market/；預覽：相對路徑 + index.html）
function pageHref(lang, pagePath, fromPath) {
  const full = LANGS[lang].prefix + pagePath;
  if (!PREVIEW) return full;
  return relPath(fromPath, full.endsWith('/') ? full + 'index.html' : full);
}
function relPath(fromPagePath, target) {
  // fromPagePath 為頁面所在目錄（以 / 結尾），target 為站內絕對路徑
  const fromDir = fromPagePath.endsWith('/') ? fromPagePath : path.posix.dirname(fromPagePath) + '/';
  let r = path.posix.relative(fromDir, target);
  if (!r) return './';
  if (target.endsWith('/') && !r.endsWith('/')) r += '/';
  return r;
}
const absUrl = (lang, p) => SITE + LANGS[lang].prefix + p;

// ───────────────────────── 資產（CSS/JS 雜湊）─────────────────────────
const assetMap = {}; // 'css/app.css' → 'css/app.<hash>.css'
function buildAssets() {
  const aDir = path.join(SRC, 'assets');
  // 1) 字型、圖片：檔名加上內容雜湊（可放心長期快取）
  const walk = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name), rel + e.name + '/') : [rel + e.name]);
  for (const rel of walk(aDir)) {
    if (/^(css|js)\//.test(rel)) continue;
    const buf = fs.readFileSync(path.join(aDir, rel));
    if (rel.startsWith('demo/')) { if (PREVIEW) write('assets/' + rel, buf); continue; }
    const ext = path.extname(rel);
    const name = rel.slice(0, -ext.length) + '.' + hash(buf) + ext;
    assetMap[rel] = name;
    write('assets/' + name, buf);
  }
  // 2) CSS：改寫 url(../fonts/x) 為雜湊檔名
  for (const f of fs.readdirSync(path.join(aDir, 'css'))) {
    let css = read(path.join(aDir, 'css', f));
    css = css.replace(/url\(\.\.\/([^)]+)\)/g, (m, rel) => assetMap[rel] ? `url(../${assetMap[rel]})` : m);
    css = minifyCss(css);
    const name = `css/${f.replace(/\.css$/, '')}.${hash(css)}.css`;
    assetMap[`css/${f}`] = name;
    write(`assets/${name}`, css);
  }
  // 3) JS：依相依順序處理，改寫 import 路徑
  const jsDir = path.join(aDir, 'js');
  const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
  const src = Object.fromEntries(files.map(f => [f, read(path.join(jsDir, f))]));
  const deps = f => [...src[f].matchAll(/from\s+['"]\.\/([\w-]+\.js)['"]/g)].map(m => m[1]);
  const done = {};
  const visit = f => {
    if (done[f]) return done[f];
    let code = src[f];
    for (const d of deps(f)) code = code.replaceAll(`./${d}'`, `./${path.basename(visit(d))}'`).replaceAll(`./${d}"`, `./${path.basename(visit(d))}"`);
    const name = `js/${f.replace(/\.js$/, '')}.${hash(code)}.js`;
    write(`assets/${name}`, code);
    assetMap[`js/${f}`] = name;
    return (done[f] = name);
  };
  files.forEach(visit);
}
function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}').trim();
}
const asset = (rel, fromPath) => {
  const p = '/assets/' + (assetMap[rel] || rel);
  return PREVIEW ? relPath(fromPath, p) : p;
};
// 角色動畫（GIF）＋「減少動態效果」時改用的靜態第一格（-still.png）
const SPRITES = ['ratking', 'adv-sit', 'adv-attack', 'adv-look', 'adv-run', 'adv-cheer', 'adv-walk', 'adv-magic', 'adv-fish', 'car-run', 'car-attack', 'car-cheer', 'mouse-blue', 'mouse-yellow', 'mouse-red', 'mouse-lav', 'mouse-green', 'mouse-crown', 'mouse-love'];
const spriteSize = {};
function spriteInfo(name, fromPath) {
  const rel = `img/sprites/${name}.gif`;
  if (!spriteSize[name]) { const b = fs.readFileSync(path.join(SRC, 'assets', rel)); spriteSize[name] = [b.readUInt16LE(6), b.readUInt16LE(8)]; }
  const [w, h] = spriteSize[name];
  return { src: asset(rel, fromPath), still: asset(`img/sprites/${name}-still.png`, fromPath), w, h };
}
// {{pic:名稱 class… @2}}：@2 代表放大兩倍顯示
function pic(spec, fromPath) {
  const parts = spec.trim().split(/\s+/);
  const name = parts.shift();
  const scale = Number((parts.find(x => x.startsWith('@')) || '@1').slice(1)) || 1;
  const cls = parts.filter(x => !x.startsWith('@'));
  const s = spriteInfo(name, fromPath);
  return `<picture class="sp"><source srcset="${s.still}" media="(prefers-reduced-motion: reduce)"><source srcset="${s.still}" media="(prefers-reduced-data: reduce)"><img${cls.length ? ` class="${cls.join(' ')}"` : ''} src="${s.src}" width="${s.w * scale}" height="${s.h * scale}" alt="" loading="lazy" decoding="async"></picture>`;
}
const spritesJson = fromPath => JSON.stringify(Object.fromEntries(SPRITES.map(n => { const s = spriteInfo(n, fromPath); return [n, [s.src, s.still, s.w, s.h]]; })));

// ───────────────────────── 樣板引擎 ─────────────────────────
const tipHtml = (body, label, withText = false) => `<details class="tip${withText ? ' tip-l' : ''}"><summary${withText ? '' : ` aria-label="${esc(label)}"`} title="${esc(label)}"><svg class="ic" aria-hidden="true"><use href="#i-info"/></svg>${withText ? `<span>${esc(label)}</span>` : ''}</summary><div class="tip-body">${body}</div></details>`;
function makeT(lang) {
  const d = LANGS[lang].dict, fallback = LANGS.zh.dict;
  return key => {
    if (key in d) return d[key];
    if (key in fallback) { console.warn(`  ⚠ [${lang}] 缺少翻譯：${key}`); return fallback[key]; }
    throw new Error(`未定義的字串：${key}`);
  };
}
function render(tpl, ctx) {
  // {{> partial}}
  tpl = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => render(read(path.join(SRC, 'partials', n + '.html')), ctx));
  // {{t:key}} 文字（自動跳脫，_html 結尾者不跳脫）
  tpl = tpl.replace(/\{\{t:([\w.-]+)\}\}/g, (_, k) => k.endsWith('_html') ? ctx.t(k) : esc(ctx.t(k)));
  // {{href:/market/}} 站內連結（自動加語言前綴）
  tpl = tpl.replace(/\{\{href:([^}]+)\}\}/g, (_, p) => pageHref(ctx.lang, p.trim(), ctx.fromPath));
  // {{asset:css/app.css}}
  tpl = tpl.replace(/\{\{asset:([^}]+)\}\}/g, (_, p) => asset(p.trim(), ctx.fromPath));
  // {{tip:key}} 點一下才展開的說明
  tpl = tpl.replace(/\{\{tip:([\w.-]+)\}\}/g, (_, k) => tipHtml(k.endsWith('_html') ? ctx.t(k) : esc(ctx.t(k)), ctx.t('common.moreInfo')));
  // {{tipl:key}} 同上，但顯示「說明」字樣
  tpl = tpl.replace(/\{\{tipl:([\w.-]+)\}\}/g, (_, k) => tipHtml(k.endsWith('_html') ? ctx.t(k) : esc(ctx.t(k)), ctx.t('common.moreInfo'), true));
  // {{pic:adv-run class}} 角色動畫
  tpl = tpl.replace(/\{\{pic:([^}]+)\}\}/g, (_, p) => pic(p, ctx.fromPath));
  // {{root:/data/pets.json}} 站台根目錄（不加語言前綴）
  tpl = tpl.replace(/\{\{root:([^}]+)\}\}/g, (_, p) => PREVIEW ? relPath(ctx.fromPath, p.trim()) : p.trim());
  // {{var}}
  tpl = tpl.replace(/\{\{([\w.]+)\}\}/g, (m, k) => (k in ctx.vars ? ctx.vars[k] : m));
  return tpl;
}

// ───────────────────────── 結構化資料 ─────────────────────────
function postFaq(body) {
  const m = body.match(/^##[^\n]*(常見問題|자주 묻는 질문|FAQ)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return [];
  const strip = s => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
  return [...m[2].matchAll(/^\*\*(.+?)\*\*[ \t]*(.+)$/gm)]
    .map(([, q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } }))
    .filter(x => x.name && x.acceptedAnswer.text);
}
function jsonLd(lang, page, t) {
  const url = absUrl(lang, page.path);
  const home = absUrl(lang, '/');
  const graph = [
    {
      '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: LANGS.zh.dict['site.name'],
      alternateName: ['StarCG Tools', LANGS.ko.dict['site.name']], inLanguage: ['zh-TW', 'ko'],
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: absUrl(lang, '/market/') + '?q={search_term_string}' },
        'query-input': 'required name=search_term_string',
      },
    },
    { '@type': 'Organization', '@id': SITE + '/#org', name: LANGS.zh.dict['site.name'], url: SITE + '/', logo: SITE + '/icons/icon-512.png' },
  ];
  if (page.post) {
    const p = page.post;
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('nav.home'), item: home },
        { '@type': 'ListItem', position: 2, name: t('nav.posts'), item: absUrl(lang, '/posts/') },
        { '@type': 'ListItem', position: 3, name: t('posts.cat.' + p.category), item: absUrl(lang, catPath(p.category)) },
        { '@type': 'ListItem', position: 4, name: p.title, item: url },
      ],
    });
    graph.push({
      '@type': 'BlogPosting', headline: p.title, description: p.desc, url, mainEntityOfPage: url,
      datePublished: p.date, dateModified: p.updated || p.date, inLanguage: t('lang.hreflang'),
      keywords: p.tags.join(', ') || undefined, wordCount: p.chars,
      image: p.cover ? postImgAbs(p.cover, p.lang) : `${SITE}/assets/${assetMap[`img/og/home-${lang}.jpg`] || 'img/sprites/ratking-still.png'}`,
      author: { '@id': SITE + '/#org' }, publisher: { '@id': SITE + '/#org' },
    });
  } else if (page.cat) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('nav.home'), item: home },
        { '@type': 'ListItem', position: 2, name: t('nav.posts'), item: absUrl(lang, '/posts/') },
        { '@type': 'ListItem', position: 3, name: t('posts.cat.' + page.cat), item: url },
      ],
    });
  } else if (page.id !== 'home' && page.id !== '404') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('nav.home'), item: home },
        { '@type': 'ListItem', position: 2, name: t('nav.' + page.id), item: url },
      ],
    });
  }
  if (page.id === 'posts') {
    graph.push({
      '@type': 'Blog', name: t('page.posts.h1'), url, inLanguage: t('lang.hreflang'), publisher: { '@id': SITE + '/#org' },
      blogPost: postsFor(lang).filter(p => p.lang === lang && (!page.cat || p.category === page.cat)).slice(0, 20).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: absUrl(lang, postPath(p)), datePublished: p.date })),
    });
  }
  if (page.app) {
    graph.push({
      '@type': 'WebApplication', name: t(`page.${page.id}.h1`), url, description: t(`page.${page.id}.desc`),
      applicationCategory: 'GameApplication', operatingSystem: 'Any', inLanguage: t('lang.hreflang'),
      isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
      publisher: { '@id': SITE + '/#org' },
    });
  }
  // FAQ（樣板中有 faq 區塊者；文章則取「## …常見問題」段落裡的「**問題？** 答案」）
  const faq = page.post ? postFaq(page.post.body) : [];
  for (let i = 1; i <= 6; i++) {
    const q = `${page.id}.faq.q${i}`, a = `${page.id}.faq.a${i}`;
    const d = LANGS[lang].dict;
    if (d[q] && d[a]) faq.push({ '@type': 'Question', name: d[q], acceptedAnswer: { '@type': 'Answer', text: d[a] } });
  }
  if (faq.length) graph.push({ '@type': 'FAQPage', mainEntity: faq });
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}


// ───────────────────────── 心得分享（src/posts/*.md）─────────────────────────
// 檔名＝網址（英文、數字、連字號）；同名加 .ko.md 是韓文版，會自動互相連結。底線開頭的檔案不會發佈。
const POSTS_DIR = path.join(SRC, 'posts');
// 文章分類（frontmatter 的 category），順序＝分類頁籤順序；分類頁在 /posts/category/<id>/
const POST_CATS = ['leveling', 'series', 'main', 'job', 'region', 'tutorial', 'other'];
const catPath = c => `/posts/category/${c}/`;
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const list = [], used = new Set();
  for (const f of fs.readdirSync(POSTS_DIR).sort()) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const { meta, body } = parseFrontMatter(read(path.join(POSTS_DIR, f)));
    if (/^(true|yes|1)$/i.test(meta.draft || '')) continue;
    if (!meta.title) throw new Error(`心得缺少 title：${f}`);
    const lang = /\.ko\.md$/.test(f) || meta.lang === 'ko' ? 'ko' : 'zh';
    const date = isDate(meta.date) ? meta.date : BUILD_DATE;
    if (date > TODAY_TW && !SHOW_FUTURE) continue;
    let slug = String(meta.slug || f.replace(/(\.ko)?\.md$/, '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) slug = 'p-' + date.replace(/-/g, '');
    let key = `${lang}:${slug}`, n = 2;
    while (used.has(key)) key = `${lang}:${slug}-${n++}`;
    used.add(key); slug = key.slice(3);
    const text = plainText(body);
    list.push({
      file: f, lang, slug, title: meta.title, date, updated: isDate(meta.updated) && meta.updated > date ? meta.updated : '',
      desc: meta.desc || meta.description || (text.length > 110 ? text.slice(0, 108) + '…' : text),
      tags: (meta.tags || '').split(/[,，、]/).map(x => x.trim()).filter(Boolean), cover: meta.cover || '', body, chars: text.length,
      category: POST_CATS.includes(meta.category) ? meta.category : 'other',
      // 置頂：pinUntil（台北日期）當天以前排在列表最前面；每天自動重建，過期就自動取消置頂
      pinned: isDate(meta.pinuntil) && meta.pinuntil >= TODAY_TW,
    });
  }
  for (const p of list) p.langs = Object.keys(LANGS).filter(l => list.some(q => q.slug === p.slug && q.lang === l));
  list.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return list;
}
const POSTS = loadPosts();
const postPath = p => `/posts/${p.slug}/`;
// 某語言的列表：該語言的文章＋只有另一種語言的文章（標示語言）
const postsFor = lang => POSTS.filter(p => p.lang === lang || !p.langs.includes(lang));
// 文章圖片檔名固定、快取一年，網址加上內容雜湊，換圖後瀏覽器才會抓新的
const postImgVer = new Map();
function postImgFile(src, lang = 'zh') {
  let f = src.replace(/^(\.\/)?(img\/)?/, '');
  // 韓文文章：同名的 .ko.jpg（韓文版插圖）存在就改用
  if (lang === 'ko') { const k = f.replace(/\.(jpe?g|png|webp)$/i, '.ko.$1'); if (k !== f && fs.existsSync(path.join(POSTS_DIR, 'img', k))) f = k; }
  if (!postImgVer.has(f)) {
    const p = path.join(POSTS_DIR, 'img', f);
    postImgVer.set(f, fs.existsSync(p) ? '?v=' + hash(fs.readFileSync(p)).slice(0, 8) : '');
  }
  return { f, v: postImgVer.get(f) };
}
const postImgAbs = (src, lang) => { const { f, v } = postImgFile(src, lang); return `${SITE}/posts/img/${f}${v}`; };
/** JPEG／PNG 圖片的寬高（讀檔頭），給 <img width height> 用，避免載入時版面跳動 */
const imgSizeCache = new Map();
function imgSize(file) {
  if (imgSizeCache.has(file)) return imgSizeCache.get(file);
  let out = null;
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) out = [b.readUInt32BE(16), b.readUInt32BE(20)];
    else if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { out = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; break; }
        i += 2 + len;
      }
    }
  } catch { /* 沒有檔案 */ }
  imgSizeCache.set(file, out);
  return out;
}
let webpMan = null;
const webpManifest = () => webpMan ??= (() => { try { return JSON.parse(fs.readFileSync(path.join(POSTS_DIR, 'img', 'webp.json'), 'utf8')); } catch { return {}; } })();
/** 文章圖片 → <picture>：有同名 .webp 就先給 WebP（小 40～60%），再用 JPG 備援；附寬高 */
const postPicture = (fromPath, lang) => (src, alt = '', attrs = 'loading="lazy" decoding="async"', cls = '') => {
  const url = postImg(fromPath, lang)(src);
  if (/^(https?:)?\/\//.test(src)) return `<img src="${url}" alt="${alt}" ${attrs}>`;
  const { f } = postImgFile(src, lang);
  const file = path.join(POSTS_DIR, 'img', f);
  const size = imgSize(file);
  const wh = size ? ` width="${size[0]}" height="${size[1]}"` : '';
  const img = `<img${cls ? ` class="${cls}"` : ''} src="${url}" alt="${alt}"${wh} ${attrs}>`;
  const wf = file.replace(/\.(jpe?g|png)$/i, '.webp');
  // 只用和目前 JPG 同一版本轉出的 WebP（tools/make-webp.py 記在 webp.json）；JPG 換過還沒重轉就用 JPG
  if (wf === file || !fs.existsSync(wf) || webpManifest()[f] !== crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16)) return img;
  const wurl = url.replace(/\.(jpe?g|png)(\?|$)/i, '.webp$2').replace(/\?v=[^"]*$/, '') + '?v=' + hash(fs.readFileSync(wf)).slice(0, 8);
  return `<picture><source srcset="${wurl}" type="image/webp">${img}</picture>`;
};
const postImg = (fromPath, lang) => src => {
  if (/^(https?:)?\/\//.test(src)) return src;
  const { f, v } = postImgFile(src, lang);
  return (PREVIEW ? relPath(fromPath, '/posts/img/' + f) : '/posts/img/' + f) + v;
};
function postCard(p, lang, fromPath, t) {
  const foreign = p.lang !== lang;
  const tags = p.tags.length ? `<span class="post-tags">${p.tags.slice(0, 3).map(x => `<span class="badge b-lav">${esc(x)}</span>`).join('')}</span>` : '';
  const thumb = p.cover ? postPicture(fromPath, p.lang)(p.cover, '', 'loading="lazy" decoding="async"', 'post-card-cover') : '';
  return `<article class="post-card"><a href="${pageHref(p.lang, postPath(p), fromPath)}"${foreign ? ` hreflang="${LANGS[p.lang].dict['lang.hreflang']}"` : ''}>` + thumb +
    `<span class="post-card-meta">${p.pinned ? `<span class="badge b-coral">${esc(t('posts.pinned'))}</span>` : ''}<time datetime="${p.date}">${p.date}</time>${foreign ? `<span class="badge b-sky">${esc(LANGS[p.lang].dict['lang.name'])}</span>` : ''}</span>` +
    `<h2${foreign ? ` lang="${LANGS[p.lang].dict['lang.code']}"` : ''}>${esc(p.title)}</h2><p${foreign ? ` lang="${LANGS[p.lang].dict['lang.code']}"` : ''}>${esc(p.desc)}</p>${tags}</a></article>`;
}
// 相關攻略：共同標籤（不算每篇都有的通用標籤）越多越前面，同分類加分
const GENERIC_TAGS = new Set(['魔力寶貝', '星詠魔力', '水藍魔力', '初心魔力寶貝', '任務攻略', '크로스게이트', 'StarCG', '퀘스트 공략']);
function relatedPosts(p, lang, n = 4) {
  const tags = new Set(p.tags.filter(x => !GENERIC_TAGS.has(x)));
  return postsFor(lang).filter(x => x !== p && x.slug !== '_範本')
    .map(x => ({ x, s: x.tags.filter(y => tags.has(y)).length * 3 + (x.category === p.category ? 2 : 0) }))
    .filter(o => o.s > 0).sort((a, b) => b.s - a.s || b.x.date.localeCompare(a.x.date)).slice(0, n).map(o => o.x);
}
const relatedHtml = (list, lang, fromPath, t, title) => list.length ? `<section class="card related" aria-label="${esc(title)}"><h2 class="card-title"><svg class="ic" aria-hidden="true"><use href="#i-posts"/></svg>${esc(title)}</h2><ul class="related-list">` +
  list.map(x => `<li><a href="${pageHref(x.lang, postPath(x), fromPath)}"><small>${esc(t('posts.cat.' + x.category))}</small><b>${esc(x.title)}</b></a></li>`).join('') + '</ul></section>' : '';
// 工具頁底部的相關攻略（依工具挑選文章 slug，找不到的略過）
const TOOL_GUIDES = {
  market: ['site-guide', 'bloody-mary-event-guide', 'leveling-route-guide', 'newbie-leveling-guide'],
  exchange: ['site-guide', 'newbie-quest-guide', 'leveling-route-guide'],
  pets: ['bonds-quest-guide', 'amber-egg-quest-guide', 'lost-alchemy-quest-guide', 'medals-quest-guide'],
  remodel: ['job-change-quest-guide', 'seven-sins-quest-guide', 'dawn-quest-guide', 'time-gate-quest-guide'],
  damage: ['job-advance-quest-guide', 'leveling-route-guide', 'newbie-leveling-guide', 'halfmountain-quest-guide'],
  maze: ['maze-guide', 'job-advance-3-quest-guide', 'leveling-route-guide', 'ke-village-quest-guide'],
  monsters: ['leveling-route-guide', 'newbie-leveling-guide', 'lost-prince-quest-guide', 'halfmountain-quest-guide'],
};
function postVars(page, lang, fromPath, t) {
  const p = page.post;
  const list = postsFor(lang);
  const i = list.findIndex(x => x === p);
  const nav = (x, label, cls) => x ? `<a class="post-nav-link ${cls}" href="${pageHref(x.lang, postPath(x), fromPath)}"><small>${esc(label)}</small><b>${esc(x.title)}</b></a>` : '<span></span>';
  const minutes = Math.max(1, Math.round(p.chars / 450));
  const other = Object.keys(LANGS).find(l => l !== lang && p.langs.includes(l));
  return {
    postTitle: esc(p.title),
    postCat: `<a class="post-cat" href="${pageHref(lang, catPath(p.category), fromPath)}">${esc(t('posts.cat.' + p.category))}</a>`,
    postCover: p.cover ? postPicture(fromPath, p.lang)(p.cover, esc(p.title), 'fetchpriority="high" decoding="async"', 'post-cover') : '',
    postDate: p.date,
    postUpdated: p.updated ? `<span>${esc(t('posts.updated'))} <time datetime="${p.updated}">${p.updated}</time></span>` : '',
    postRead: esc(t('posts.read').replace('{n}', minutes)),
    postTags: p.tags.length ? `<p class="post-tags">${p.tags.map(x => `<span class="badge b-lav">${esc(x)}</span>`).join('')}</p>` : '',
    postHtml: markdown(p.body, { imgUrl: postImg(fromPath, p.lang), imgTag: postPicture(fromPath, p.lang), linkUrl: h => (PREVIEW && h.startsWith('/') && !h.startsWith('//') ? relPath(fromPath, h.endsWith('/') ? h + 'index.html' : h) : h) }).replace(/\{\{/g, '&#123;&#123;'),
    postNav: nav(list[i + 1], t('posts.prev'), 'prev') + nav(list[i - 1], t('posts.next'), 'next'),
    postOtherLang: other ? `<p class="post-other"><a href="${pageHref(other, postPath(p), fromPath)}" hreflang="${LANGS[other].dict['lang.hreflang']}" lang="${LANGS[other].dict['lang.code']}">${esc(LANGS[other].dict['posts.otherLang'])}</a></p>` : '',
    postsHref: pageHref(lang, '/posts/', fromPath),
    postRelated: relatedHtml(relatedPosts(p, lang), lang, fromPath, t, t('posts.related')),
  };
}

// ───────────────────────── 頁面輸出 ─────────────────────────
function buildPages() {
  const layout = read(path.join(SRC, 'layout.html'));
  const schedule = JSON.parse(read(path.join(SRC, 'data', 'schedule.json')));
  for (const lang of Object.keys(LANGS)) {
    const t = makeT(lang);
    // 腳本字典：共用部分每頁都帶，各工具的字串只放在該頁（首頁、心得頁不用載市場／迷宮的字串）
    const TOUR_PAGES = new Set(['market', 'maze', 'pets', 'damage', 'remodel', 'exchange']);   // 對應 src/assets/js/tour.js 的 TOURS
const DICT_GROUPS = { market: 'market\\.type|pet|mk|bk|dm|eqc', pets: 'pet|eqc|pc', remodel: 'rm', exchange: 'ex', damage: 'dmg', maze: 'mz', monsters: 'mon|dmg\\.e', craft: 'cr', alerts: 'al' };
    const fullDict = { ...LANGS.zh.dict, ...LANGS[lang].dict };
    const dictFor = id => { const re = new RegExp(`^(js|common|day|guide|tour|wel|game${DICT_GROUPS[id] ? '|' + DICT_GROUPS[id] : ''})\\.`); return Object.fromEntries(Object.entries(fullDict).filter(([k]) => re.test(k) && !/(_html|\.faq\.)/.test(k))); };
    const postPages = POSTS.filter(p => p.lang === lang).map(p => ({ id: 'post', path: postPath(p), tpl: 'post', js: null, post: p, langs: p.langs }));
    const catPages = POST_CATS.filter(c => postsFor(lang).some(p => p.category === c)).map(c => ({ id: 'posts', path: catPath(c), tpl: 'posts', js: null, cat: c }));
    for (const page of [...PAGES, ...catPages, ...postPages]) {
      if (page.id === '404' && lang !== 'zh') continue; // 404 只需一份
      const fromPath = LANGS[lang].prefix + page.path;
      const ctx = { lang, t, fromPath, vars: {} };
      const other = lang === 'zh' ? 'ko' : 'zh';
      const v = ctx.vars;
      const langsAvail = page.langs || Object.keys(LANGS);
      const otherPath = langsAvail.includes(other) ? page.path : '/posts/';
      Object.assign(v, {
        lang, htmlLang: t('lang.code'), pageId: page.id,
        title: esc(page.post ? ((page.post.title + '｜' + t('site.name')).length > 65 ? page.post.title : `${page.post.title}｜${t('site.name')}`) : page.cat ? t('posts.catTitle').replace('{c}', t('posts.cat.' + page.cat)) : t(`page.${page.id}.title`)),
        description: esc(page.post ? page.post.desc : page.cat ? t('posts.catDesc.' + page.cat) : t(`page.${page.id}.desc`)),
        alternates: `<link rel="alternate" type="application/rss+xml" title="${esc(t('site.name'))}" href="${SITE}${rssPath(lang)}">\n` + langsAvail.map(l => `<link rel="alternate" hreflang="${LANGS[l].dict['lang.hreflang']}" href="${absUrl(l, page.path)}">`).join('\n') +
          `\n<link rel="alternate" hreflang="x-default" href="${absUrl(langsAvail.includes('zh') ? 'zh' : langsAvail[0], page.path)}">`,
        ogType: page.post ? 'article' : 'website',
        articleMeta: page.post ? `<meta property="article:published_time" content="${page.post.date}"><meta property="article:modified_time" content="${page.post.updated || page.post.date}">` + page.post.tags.map(x => `<meta property="article:tag" content="${esc(x)}">`).join('') : '',
        keywords: esc(t('site.keywords')),
        canonical: absUrl(lang, page.path),
        canonicalLink: page.noindex ? '' : `<link rel="canonical" href="${absUrl(lang, page.path)}">`,
        ogImageSize: (page.post && page.post.cover) || assetMap[`img/og/${page.id === '404' ? 'home' : page.id === 'post' ? 'posts' : page.id}-${lang}.jpg`] ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : '',
        altZh: absUrl('zh', page.path), altKo: absUrl('ko', page.path),
        ogLocale: t('lang.og'), ogLocaleAlt: LANGS[other].dict['lang.og'],
        ogImage: page.post && page.post.cover ? postImgAbs(page.post.cover, page.post.lang) : `${SITE}/assets/${assetMap[`img/og/${page.id === '404' ? 'home' : page.id === 'post' ? 'posts' : page.id}-${lang}.jpg`] || 'img/sprites/ratking-still.png'}`,
        otherLangHref: pageHref(other, otherPath, fromPath), otherLangName: LANGS[other].dict['lang.name'],
        otherLangCode: other, otherLangShort: LANGS[other].dict['lang.short'],
        zhHref: pageHref('zh', lang === 'zh' ? page.path : otherPath, fromPath), koHref: pageHref('ko', lang === 'ko' ? page.path : otherPath, fromPath),
        manifest: PREVIEW ? '' : `<link rel="manifest" href="/manifest${lang === 'ko' ? '.ko' : ''}.webmanifest">`,
        robots: page.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1',
        jsonld: jsonLd(lang, page, t),
        i18nJson: JSON.stringify(dictFor(page.id)).replace(/</g, '\\u003c'),
        pageScript: page.js ? `<script type="module" src="${asset(`js/${page.js}.js`, fromPath)}"></script>` : '',
        // 星野導覽只在有導覽的工具頁載入（其他頁不需要多下載、執行 tour.js）
        tourScript: TOUR_PAGES.has(page.id) ? `<script type="module" src="${asset('js/tour.js', fromPath)}"></script>` : '',
        base: PREVIEW ? relPath(fromPath, '/') : '/',
        fontHref: asset(`fonts/round-${lang}.woff2`, fromPath),
        spritesJson: esc(spritesJson(fromPath)),
        preview: PREVIEW ? '1' : '',
        registerUrl: REGISTER_URL,
        sponsorUrl: SPONSOR[lang] || '#',
        sponsorBar: sponsorBar(lang, t),
        sponsorList: sponsorList(lang, t),
        videoUrl: VIDEO[lang],
        welcomeVideo: esc(VIDEO[lang]),
        buildDate: BUILD_DATE,
        verify: (GOOGLE_VERIFY ? `<meta name="google-site-verification" content="${esc(GOOGLE_VERIFY)}">` : '') +
          (NAVER_VERIFY ? `<meta name="naver-site-verification" content="${esc(NAVER_VERIFY)}">` : ''),
        breadcrumb: page.id === 'home' || page.id === '404' ? '' : page.post ?
          `<nav class="crumbs" aria-label="${esc(t('a11y.breadcrumb'))}"><a href="${pageHref(lang, '/', fromPath)}">${esc(t('nav.home'))}</a><span aria-hidden="true">›</span><a href="${pageHref(lang, '/posts/', fromPath)}">${esc(t('nav.posts'))}</a><span aria-hidden="true">›</span><a href="${pageHref(lang, catPath(page.post.category), fromPath)}">${esc(t('posts.cat.' + page.post.category))}</a><span aria-hidden="true">›</span><span aria-current="page">${esc(page.post.title)}</span></nav>` :
          page.cat ?
          `<nav class="crumbs" aria-label="${esc(t('a11y.breadcrumb'))}"><a href="${pageHref(lang, '/', fromPath)}">${esc(t('nav.home'))}</a><span aria-hidden="true">›</span><a href="${pageHref(lang, '/posts/', fromPath)}">${esc(t('nav.posts'))}</a><span aria-hidden="true">›</span><span aria-current="page">${esc(t('posts.cat.' + page.cat))}</span></nav>` :
          `<nav class="crumbs" aria-label="${esc(t('a11y.breadcrumb'))}"><a href="${pageHref(lang, '/', fromPath)}">${esc(t('nav.home'))}</a><span aria-hidden="true">›</span><span aria-current="page">${esc(t('nav.' + page.id))}</span></nav>`,
      });
      if (page.post) Object.assign(v, postVars(page, lang, fromPath, t));
      v.relatedGuides = TOOL_GUIDES[page.id] ? relatedHtml(TOOL_GUIDES[page.id].map(s => postsFor(lang).find(p => p.slug === s)).filter(Boolean), lang, fromPath, t, t('tool.related')) : '';
      const plist = postsFor(lang).slice().sort((a, b) => b.pinned - a.pinned);   // 置頂文章排最前（穩定排序，其餘維持日期順序）
      const shown = page.cat ? plist.filter(p => p.category === page.cat) : plist;
      const catTabs = `<nav class="cat-tabs" aria-label="${esc(t('posts.catNav'))}">` +
        [['', t('posts.cat.all'), plist.length], ...POST_CATS.map(c => [c, t('posts.cat.' + c), plist.filter(p => p.category === c).length]).filter(x => x[2])]
          .map(([c, label, n]) => `<a href="${pageHref(lang, c ? catPath(c) : '/posts/', fromPath)}"${page.id === 'posts' && (page.cat || '') === c ? ' aria-current="page"' : ''}>${esc(label)}<small>${n}</small></a>`).join('') + '</nav>';
      const FIRST = page.cat ? Infinity : 30;
      v.postList = catTabs + (shown.length ? `<div class="post-list">${shown.slice(0, FIRST).map(p => postCard(p, lang, fromPath, t)).join('')}</div>` +
        (shown.length > FIRST ? `<details class="more-posts"><summary class="btn">${esc(t('posts.showMore').replace('{n}', shown.length - FIRST))}</summary><div class="post-list">${shown.slice(FIRST).map(p => postCard(p, lang, fromPath, t)).join('')}</div></details>` : '') :
        `<div class="empty card">${pic('adv-sit', fromPath)}<b>${esc(t('posts.empty'))}</b></div>`);
      v.postsH1 = esc(page.cat ? t('posts.catH1').replace('{c}', t('posts.cat.' + page.cat)) : t('page.posts.h1'));
      v.postsLead = esc(page.cat ? t('posts.catDesc.' + page.cat) : t('page.posts.lead'));
      v.latestPosts = page.id === 'home' && plist.length ?
        `<h2 class="section-title"><svg class="ic" aria-hidden="true"><use href="#i-posts"/></svg>${esc(t('home.postsTitle'))}<a class="section-more" href="${pageHref(lang, '/posts/', fromPath)}">${esc(t('home.postsMore'))}</a></h2><div class="post-list post-list-3">${plist.slice(0, 3).map(p => postCard(p, lang, fromPath, t)).join('')}</div>` : '';
      // 導覽列
      // 導覽列：首頁＋三個大分類下拉（電腦版），手機版是漢堡選單（同一份分類）
      const isCur = id => id === page.id || (id === 'posts' && page.id === 'post');
      const navItem = (id, cls) => {
        const p = PAGES.find(x => x.id === id);
        const lock = id === 'alerts' ? ' is-locked" data-act="alerts-intro' : '';
        return `<a class="${cls} t-${id}${lock}" href="${pageHref(lang, p.path, fromPath)}"${isCur(id) ? ' aria-current="page"' : ''}><span class="t-ic dd-ic"><svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg></span><span class="dd-txt"><b>${esc(t('nav.' + id))}${id === 'alerts' ? `<em class="lock-tag">${esc(t('al.intro.badge'))}</em>` : ''}</b><small>${esc(t('home.tool.' + id))}</small></span></a>`;
      };
      const navExtra = cls => `<div class="${cls}">` +
        `<a href="https://member.starcg.net/market.php" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-shop"/></svg>${esc(t('nav.officialMarket'))}</a>` +
        `<a href="https://guide.starcg.net/" target="_blank" rel="noopener"><svg class="ic" aria-hidden="true"><use href="#i-book"/></svg>${esc(t('nav.guide'))}</a></div>`;
      const homeP = PAGES.find(x => x.id === 'home');
      v.mainnav = `<a class="nav-link" href="${pageHref(lang, homeP.path, fromPath)}"${page.id === 'home' ? ' aria-current="page"' : ''}><svg class="ic" aria-hidden="true"><use href="#i-home"/></svg><span>${esc(t('nav.home'))}</span></a>` +
        `<a class="nav-sponsor" href="${esc(SPONSOR[lang] || '#')}" target="_blank" rel="noopener" data-act="sponsor"><svg class="ic" aria-hidden="true"><use href="#i-heart"/></svg><span>${esc(t('nav.sponsor'))}</span></a>` +
        NAV_GROUPS.map(g => `<div class="nav-dd"><button type="button" class="nav-dd-btn${g.items.some(isCur) ? ' is-cur' : ''}" data-act="dd" aria-expanded="false" aria-controls="dd-${g.id}"><svg class="ic" aria-hidden="true"><use href="#i-${g.icon}"/></svg><span>${esc(t('home.tg.' + g.id))}</span><svg class="ic dd-chev" aria-hidden="true"><use href="#i-chevron"/></svg></button>` +
          `<div class="nav-dd-panel" id="dd-${g.id}" hidden>${g.items.map(id => navItem(id, 'dd-item')).join('')}${g.id === 'guide' ? navExtra('dd-extra') : ''}</div></div>`).join('');
      v.mobileNav = NAV_GROUPS.map(g => `<section class="mnav-g"><h2 class="mnav-h"><svg class="ic" aria-hidden="true"><use href="#i-${g.icon}"/></svg>${esc(t('home.tg.' + g.id))}</h2><div class="mnav-items">${g.items.map(id => navItem(id, 'mnav-item')).join('')}</div></section>`).join('') + navExtra('mnav-extra');
      const tab = (id, label) => {
        const p = PAGES.find(x => x.id === id);
        const cur = id === page.id ? ' aria-current="page"' : '';
        return `<a href="${pageHref(lang, p.path, fromPath)}"${cur}><svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg><span>${esc(label)}</span></a>`;
      };
      const moreActive = !['home', 'market', 'exchange', 'maze'].includes(page.id) ? ' aria-current="page"' : '';
      v.tabbar = tab('home', t('nav.home')) + tab('market', t('nav.tab.market')) + tab('exchange', t('nav.tab.exchange')) + tab('maze', t('nav.short.maze')) +
        `<button type="button" data-act="menu" aria-controls="mnav" aria-expanded="false"${moreActive}><svg class="ic" aria-hidden="true"><use href="#i-menu"/></svg><span>${esc(t('nav.menu'))}</span></button>`;
      v.footerTools = TOOLS_ALL.map(id => `<li><a href="${pageHref(lang, PAGES.find(x => x.id === id).path, fromPath)}">${esc(t('nav.' + id))}</a></li>`).join('');
      v.scheduleHtml = page.id === 'home' ? renderSchedule(schedule, t, lang) : '';
      v.sprite = read(path.join(SRC, 'partials', 'sprite.svg'));
      const body = render(read(path.join(SRC, 'pages', page.tpl + '.html')), ctx);
      v.body = body;
      let html = render(layout, ctx);
      html = minifyHtml(html);
      const out = page.file ? page.path : (LANGS[lang].prefix + page.path + 'index.html');
      write(out.replace(/^\//, ''), html);
    }
  }
}
function minifyHtml(html) {
  return html.replace(/<!--(?!\[)[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\n\s*/g, '\n').trim();
}

// 星期圓章：中文用「月火水…」，韓文用「월화수…」
const dayMark = (s, d, lang) => (lang === 'ko' ? '일월화수목금토'[d] : s.kanji[d]);
function renderSchedule(s, t, lang) {
  // 依星期一到星期日輸出，JS 會再補上「今天／進行中」狀態
  const order = [1, 2, 3, 4, 5, 6, 0];
  // 手機版用的星期分頁（電腦版隱藏），內容仍完整輸出在下方，搜尋引擎可讀
  const tabs = `<div class="week-tabs" role="tablist" aria-label="${esc(t('home.scheduleTitle'))}">` + order.map(d => {
    const n = (s.days[d] || []).length;
    return `<button type="button" role="tab" class="wt day-${d}" data-day="${d}" aria-selected="false" aria-controls="day-${d}">` +
      `<span class="day-kanji">${dayMark(s, d, lang)}</span><small>${esc(t('day.' + d))}</small>` +
      `<span class="wt-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(n, 4))}</span></button>`;
  }).join('') + '</div>';
  return tabs + `<div class="week" data-schedule='${esc(JSON.stringify(s.days))}'>` + order.map(d => {
    const evs = s.days[d] || [];
    const items = evs.length ? evs.map(e => {
      const time = e.allDay ? t('home.allDay') : e.hideEnd ? e.start : `${e.start}–${e.end}`;
      const extra = e.note ? `<small class="ev-note">${esc(t(e.note))}</small>` : '';
      const orig = lang !== 'zh' ? `<small class="ev-orig" lang="zh-Hant">${esc(LANGS.zh.dict['ev.' + e.id])}</small>` : '';
      return `<li class="ev" data-ev="${e.id}" data-start="${e.entry || e.start || ''}" data-end="${e.end || ''}" data-allday="${e.allDay ? 1 : ''}">` +
        `<svg class="ic ev-ic" aria-hidden="true"><use href="#i-ev-${e.icon}"/></svg>` +
        `<div class="ev-body"><b>${esc(t('ev.' + e.id))}</b>${orig}<span class="ev-time">${esc(time)}</span>${extra}<span class="ev-badge" hidden></span></div></li>`;
    }).join('') : `<li class="ev ev-rest"><div class="ev-body"><span>${esc(t('home.restDay'))}</span></div></li>`;
    return `<section class="day day-${d}" id="day-${d}" data-day="${d}" role="tabpanel"><h3><span class="day-kanji" aria-hidden="true">${dayMark(s, d, lang)}</span>${esc(t('day.' + d))}<span class="today-pill" hidden>${esc(t('home.today'))}</span></h3><ul>${items}</ul></section>`;
  }).join('') + '</div>';
}

// ───────────────────────── RSS（Naver Search Advisor、RSS 閱讀器用）：每種語言一份，最新 50 篇 ─────────────────────────
const rssPath = lang => LANGS[lang].prefix + '/rss.xml';
const cdata = s => `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
function buildRss() {
  for (const lang of Object.keys(LANGS)) {
    const t = makeT(lang);
    const items = POSTS.filter(p => p.lang === lang).slice(0, 50).map(p => {
      const url = absUrl(lang, postPath(p));
      const img = p.cover ? `<enclosure url="${esc(postImgAbs(p.cover, p.lang))}" type="image/jpeg" length="0"/>` : '';
      return `<item><title>${cdata(p.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid>` +
        `<pubDate>${new Date(p.date + 'T00:00:00+08:00').toUTCString()}</pubDate><description>${cdata(p.desc)}</description>` +
        `<category>${cdata(t('posts.cat.' + p.category))}</category>${img}</item>`;
    }).join('\n');
    write(rssPath(lang).slice(1), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n` +
      `<title>${cdata(t('site.name'))}</title><link>${absUrl(lang, '/posts/')}</link><description>${cdata(t('page.posts.desc'))}</description>` +
      `<language>${t('lang.hreflang')}</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>` +
      `<atom:link href="${SITE}${rssPath(lang)}" rel="self" type="application/rss+xml"/>\n${items}\n</channel>\n</rss>\n`);
  }
}

// ───────────────────────── sitemap / robots / manifest / sw ─────────────────────────
function buildSeoFiles() {
  if (PREVIEW) return;
  const urls = PAGES.filter(p => !p.noindex).map(p => {
    const alts = Object.keys(LANGS).map(l => `<xhtml:link rel="alternate" hreflang="${LANGS[l].dict['lang.hreflang']}" href="${absUrl(l, p.path)}"/>`).join('') +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${absUrl('zh', p.path)}"/>`;
    return Object.keys(LANGS).map(l => `<url><loc>${absUrl(l, p.path)}</loc><lastmod>${BUILD_DATE}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority>${alts}</url>`).join('\n');
  }).concat(POST_CATS.filter(c => POSTS.some(p => p.category === c)).map(c =>
    Object.keys(LANGS).map(l => `<url><loc>${absUrl(l, catPath(c))}</loc><lastmod>${BUILD_DATE}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority>` +
      Object.keys(LANGS).map(x => `<xhtml:link rel="alternate" hreflang="${LANGS[x].dict['lang.hreflang']}" href="${absUrl(x, catPath(c))}"/>`).join('') +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${absUrl('zh', catPath(c))}"/>` + '</url>').join('\n')
  )).concat(POSTS.map(p => {
    const alts = p.langs.length > 1 ? p.langs.map(l => `<xhtml:link rel="alternate" hreflang="${LANGS[l].dict['lang.hreflang']}" href="${absUrl(l, postPath(p))}"/>`).join('') +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(p.langs.includes('zh') ? 'zh' : p.lang, postPath(p))}"/>` : '';
    return `<url><loc>${absUrl(p.lang, postPath(p))}</loc><lastmod>${p.updated || p.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority>${alts}</url>`;
  })).join('\n');
  buildRss();
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /cron/\nDisallow: /cache/\n\nSitemap: ${SITE}/sitemap.xml\n`);
  for (const lang of Object.keys(LANGS)) {
    const t = makeT(lang);
    const pre = LANGS[lang].prefix;
    const m = {
      name: t('site.name'), short_name: t('site.short'), description: t('page.home.desc'),
      id: pre + '/', start_url: pre + '/?source=pwa', scope: '/', display: 'standalone', display_override: ['standalone', 'minimal-ui'],
      orientation: 'portrait', background_color: '#F1E4C8', theme_color: '#D9654A', lang: t('lang.hreflang'),
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: ['market', 'exchange', 'pets'].map(id => ({
        name: t('nav.' + id), url: pre + PAGES.find(p => p.id === id).path,
        icons: [{ src: `/icons/sc-${id}.png`, sizes: '96x96', type: 'image/png' }],
      })),
      categories: ['games', 'utilities'],
    };
    write(`manifest${lang === 'ko' ? '.ko' : ''}.webmanifest`, JSON.stringify(m, null, 2));
  }
  // Service Worker：預先快取外殼資產
  const precache = ['/', '/ko/', '/offline.html', '/icons/icon.svg', ...['css/app.css', 'js/core.js', 'js/game.js', 'js/stats.js', 'img/sprites/ratking-face.png', 'img/sprites/ratking.gif', 'fonts/round-zh.woff2', 'fonts/round-ko.woff2'].filter(k => assetMap[k]).map(k => '/assets/' + assetMap[k])];
  const version = hash(JSON.stringify(assetMap) + BUILD_DATE);
  let sw = read(path.join(SRC, 'sw.js'));
  sw = sw.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache));
  write('sw.js', sw);
}

// ───────────────────────── 主流程 ─────────────────────────
console.log(`▶ 建置 ${PREVIEW ? '預覽版' : '正式版'} → ${path.relative(ROOT, OUT)}（網域 ${SITE}）`);
rmrf(OUT);
mkdirp(OUT);
buildAssets();
buildPages();
copyDir(path.join(POSTS_DIR, 'img'), path.join(OUT, 'posts', 'img'));
buildSeoFiles();
if (!PREVIEW) {
  copyDir(path.join(ROOT, 'static'), OUT);
  copyDir(path.join(SRC, 'icons'), path.join(OUT, 'icons'));
  for (const f of ['favicon.ico', 'icon.svg', 'apple-touch-icon.png']) {
    if (fs.existsSync(path.join(SRC, 'icons', f))) fs.copyFileSync(path.join(SRC, 'icons', f), path.join(OUT, f));
  }
  fs.copyFileSync(path.join(SRC, 'offline.html'), path.join(OUT, 'offline.html'));
} else {
  // 預覽版也需要寵物資料與圖示
  copyDir(path.join(ROOT, 'static', 'data'), path.join(OUT, 'data'));
  copyDir(path.join(SRC, 'icons'), path.join(OUT, 'icons'));
  rmrf(path.join(OUT, 'assets', 'img', 'og'));
  // 預覽平台會替主頁包上 <html><head><body>，所以主頁只保留內容，屬性改由腳本設定
  const home = path.join(OUT, 'index.html');
  let h = read(home);
  const attrs = Object.fromEntries([...h.match(/<html([^>]*)>/)[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const bodyAttrs = Object.fromEntries([...((h.match(/<body([^>]*)>/) || [])[1] || '').matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&')]));
  const setAttrs = `<script>(function(){var d=document.documentElement,a=${JSON.stringify(attrs).replace(/</g, '\\u003c')},b=${JSON.stringify(bodyAttrs).replace(/</g, '\\u003c')};for(var k in a)if(k!=='data-theme'&&k!=='data-view')d.setAttribute(k,a[k]);var s=function(){for(var k in b)document.body.setAttribute(k,b[k])};document.body?s():document.addEventListener('DOMContentLoaded',s)})();</script>`;
  h = h.replace(/<!doctype html>/i, '').replace(/<html[^>]*>/, '').replace(/<\/?head>/g, '').replace(/<body[^>]*>/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${LANGS.zh.dict['site.name']}</title>`);
  h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + setAttrs);
  fs.writeFileSync(home, h);
}
const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`✔ 完成，共 ${count(OUT)} 個檔案`);
