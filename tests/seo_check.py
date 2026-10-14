"""SEO 檢查：標題、描述、canonical、hreflang 互指、JSON-LD、H1、圖片 alt、sitemap。"""
import sys, re, json, pathlib, html
from xml.etree import ElementTree as ET
root = pathlib.Path(sys.argv[1]); SITE = sys.argv[2]
issues, rows = [], []
pages = sorted(p for p in root.rglob('index.html'))
canon = {}
for p in pages:
    s = p.read_text(encoding='utf-8')
    rel = '/' + str(p.parent.relative_to(root)).replace('\\', '/').strip('.') 
    rel = (rel.rstrip('/') + '/').replace('//', '/')
    title = html.unescape(re.search(r'<title>(.*?)</title>', s).group(1))
    desc = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1))
    c = re.search(r'<link rel="canonical" href="([^"]+)"', s).group(1)
    alts = dict(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', s))
    h1 = len(re.findall(r'<h1[\s>]', s))
    lang = re.search(r'<html lang="([^"]+)"', s).group(1)
    ld = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    types = []
    for block in ld:
        try:
            types += [g['@type'] for g in json.loads(block)['@graph']]
        except Exception as e:
            issues.append(f'{rel}: JSON-LD 解析失敗 {e}')
    imgs_no_alt = len(re.findall(r'<img(?![^>]*\balt=)[^>]*>', s))
    canon[rel] = (c, alts)
    if c != SITE + rel: issues.append(f'{rel}: canonical {c}')
    if not (10 <= len(title) <= 65): issues.append(f'{rel}: 標題長度 {len(title)}')
    if not (50 <= len(desc) <= 170): issues.append(f'{rel}: 描述長度 {len(desc)}')
    if h1 != 1: issues.append(f'{rel}: H1 數量 {h1}')
    if imgs_no_alt: issues.append(f'{rel}: {imgs_no_alt} 張圖片沒有 alt')
    if set(alts) != {'zh-TW', 'ko', 'x-default'}: issues.append(f'{rel}: hreflang {alts}')
    rows.append(f'{rel:<16} {lang:<10} H1={h1} title={len(title):>2} desc={len(desc):>3} ld={",".join(types)}')
# hreflang 互指
for rel, (c, alts) in canon.items():
    for hl, url in alts.items():
        target = url.replace(SITE, '')
        if target not in canon: issues.append(f'{rel}: hreflang {hl} 指向不存在頁面 {url}')
        elif canon[target][1].get('zh-TW') != alts.get('zh-TW') or canon[target][1].get('ko') != alts.get('ko'):
            issues.append(f'{rel}: hreflang 未互指 {url}')
sm = ET.parse(root / 'sitemap.xml').getroot()
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
locs = [u.find('s:loc', ns).text for u in sm.findall('s:url', ns)]
for l in locs:
    if l.replace(SITE, '') not in canon: issues.append(f'sitemap 有不存在頁面 {l}')
print('\n'.join(rows)); print(f'sitemap: {len(locs)} 個網址'); print((root / 'robots.txt').read_text())
print('問題：' + ('\n - ' + '\n - '.join(issues) if issues else '無'))
