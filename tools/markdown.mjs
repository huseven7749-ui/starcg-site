// 心得文章用的精簡 Markdown 轉換（零相依）
// 支援：## 標題、段落（單一換行＝換行）、**粗體**、*斜體*、`程式碼`、[連結](網址)、![圖片](路徑)、
//       - 清單、1. 編號清單、> 引用、--- 分隔線、``` 程式碼區塊、| 表格 |
// 為了安全，文章裡的 HTML 標籤一律當成文字顯示。

const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function parseFrontMatter(src) {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([\w-]+)\s*[:：]\s*(.*)$/);
    if (mm) meta[mm[1].toLowerCase()] = mm[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(m[0].length) };
}

// imgUrl：把文章內的相對圖片路徑轉成網址
export function inline(s, { imgUrl = x => x, linkUrl = x => x } = {}) {
  const codes = [];
  let out = escHtml(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${imgUrl(src)}" alt="${alt}" loading="lazy" decoding="async">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => {
      const ext = /^https?:\/\//.test(href);
      return `<a href="${ext ? href : linkUrl(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function markdown(src, opts = {}) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const il = s => inline(s, opts);
  let i = 0;
  const isBlank = l => !l.trim();
  const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }
    // 程式碼區塊
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html.push(`<pre><code>${escHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // 標題（文章標題是 h1，內文最大到 h2）
    const h = l.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (h) { const n = Math.min(4, Math.max(2, h[1].length)); html.push(`<h${n}>${il(h[2])}</h${n}>`); i++; continue; }
    // 分隔線
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { html.push('<hr>'); i++; continue; }
    // 引用
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${markdown(buf.join('\n'), opts)}</blockquote>`);
      continue;
    }
    // 表格
    if (isTableRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const aligns = cells(lines[i + 1]).map(c => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      const td = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${il(c)}</${tag}>`;
      html.push(`<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, k) => td('td', c, k)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    // 清單（支援一層縮排）
    if (isList(l)) {
      const ordered = /^\s*\d+[.)]/.test(l);
      const items = [];
      while (i < lines.length && (isList(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const line = lines[i++];
        if (isList(line) && !/^\s{2,}/.test(line)) items.push([line.replace(/^\s*([-*+]|\d+[.)])\s+/, '')]);
        else items[items.length - 1].push(line.replace(/^\s+/, ''));
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map(([first, ...rest]) => {
        const sub = rest.length && rest.every(isList) ? markdown(rest.join('\n'), opts) : rest.map(r => '<br>' + il(r)).join('');
        return `<li>${il(first)}${sub}</li>`;
      }).join('')}</${tag}>`);
      continue;
    }
    // 單獨一行的圖片 → 圖說
    const img = l.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (img) {
      html.push(`<figure>${il(l.trim())}${img[1] ? `<figcaption>${escHtml(img[1])}</figcaption>` : ''}</figure>`);
      i++; continue;
    }
    // 段落
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,4}\s|```|\s*>|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i]) && !isList(lines[i]) && !isTableRow(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    html.push(`<p>${buf.map(il).join('<br>')}</p>`);
  }
  return html.join('\n');
}

// 純文字（給摘要、閱讀時間用）
export const plainText = md => md
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^[#>\-*+|\s\d.]+/gm, '')
  .replace(/[*_`~|]/g, '')
  .replace(/\s+/g, ' ').trim();
