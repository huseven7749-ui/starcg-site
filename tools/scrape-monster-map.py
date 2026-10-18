"""抓御劍軒 cgsword.com/bm（魔物分布）整理成 static/data/monster-map.json。
- 只取事實資料：地點、樓層／區域、出現數量、魔物名稱、等級、地水火風、種族、卡片等級、可否封印、一級出沒座標。
  不複製網站的介紹文字、建議水晶與留言。
- 每頁間隔 2 秒；抓過的頁面存在 tools/cache/bm/（不進版本庫），重跑不會再抓。
- 資料是經典服（2014 年前），星詠魔力可能不同，網站上會註明來源與差異。
用法：python tools/scrape-monster-map.py
"""
import os, re, sys, json, time, html, urllib.request, urllib.parse
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', 'cache', 'bm')
OUT = os.path.join(ROOT, 'static', 'data', 'monster-map.json')
BASE = 'https://cgsword.com'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 StarCGTools (+https://starcg.online)'
os.makedirs(CACHE, exist_ok=True)


def get(path):
    f = os.path.join(CACHE, re.sub(r'[\\/:*?"<>|]', '_', path.strip('/')) or 'index') + '.html'
    if os.path.exists(f):
        return open(f, encoding='utf-8').read()
    url = BASE + urllib.parse.quote(path, safe='/-')
    for i in range(3):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read().decode('utf-8', 'replace')
            open(f, 'w', encoding='utf-8').write(b)
            time.sleep(2.0)
            return b
        except Exception as e:
            print('  重試', path, e, flush=True); time.sleep(5 * (i + 1))
    return ''


strip = lambda x: html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x))).strip()


def parse_area(s):
    head = s[s.find('class="path"'):]
    path = [html.unescape(t) for t in re.findall(r'itemprop="title">([^<]+)</span>', head[:6000])]
    title = re.search(r'<title>([^:<]+)::', s)
    name = re.sub(r'\s*-\s*魔物分布\s*$', '', html.unescape(title.group(1).strip())) if title else (path[-1] if path else '')
    body = s[s.find('id="listlogo"'):] if 'id="listlogo"' in s else s
    groups = []
    for g in re.split(r'<div style="background:#FFFFDD', body)[1:]:
        cnt = re.search(r'出現數量[:：]\s*([^<]*)', g)
        label = strip(re.sub(r'^[^>]*>', '', g.split('出現數量')[0]))[:40]
        mons = []
        for c in re.split(r'<div class="beastCell">', g)[1:]:
            a = re.search(r'<a href="/bm/(\d+)-([^"]+)">([^<]+)</a>', c)
            if not a: continue
            img = re.search(r'anim/map/(\d+?)400\.png', c)
            props = dict(re.findall(r'class="prop (\w+)" style="width:(\d+)px', c))
            el = [round(int(props.get(k, 0)) / 12) for k in ('earth', 'water', 'fire', 'wind')]
            info = strip(c[c.find('width:170px'):]) if 'width:170px' in c else strip(c)
            lv = re.search(r'Lv\s*(\d+)(?:\s*-\s*(\d+))?', info)
            race = re.search(r'(\S{1,3}系)\(', info)
            card = re.search(r'卡片[:：]\s*(\S+)', info)
            lv1 = re.search(r'一級[:：]\s*([^\s]+)', info)
            mons.append({
                'no': int(a.group(1)), 'name': html.unescape(a.group(3).strip()),
                'imageId': int(img.group(1)) if img else None,
                'lvMin': int(lv.group(1)) if lv else None, 'lvMax': int(lv.group(2) or lv.group(1)) if lv else None,
                'elem': el, 'race': race.group(1) if race else '', 'card': card.group(1) if card else '',
                'catch': '不可封印' not in info and '可封印' in info,
                'lv1': lv1.group(1) if lv1 and '不在' not in lv1.group(1) else '',
            })
        if mons:
            groups.append({'label': label if label and len(label) < 30 else '', 'count': cnt.group(1).strip() if cnt else '', 'monsters': mons})
    return path, name, groups


def main():
    idx = get('/bm/')
    links = []
    for href in re.findall(r'href="(/bm/[0-9a-z]{5}-[^"]+)"', idx):
        if href not in links: links.append(href)
    print('地點頁', len(links), flush=True)
    areas = []
    for i, href in enumerate(links):
        s = get(href)
        if not s: continue
        path, name, groups = parse_area(s)
        aid = href.split('/')[-1].split('-')[0]
        areas.append({'id': aid, 'name': name, 'path': path[:-1] if path and path[-1] == name else path, 'groups': groups})
        if i % 20 == 0: print(f'{i}/{len(links)} {name} 群組 {len(groups)}', flush=True)
    n = sum(len(m['monsters']) for a in areas for m in a['groups'])
    data = {'source': 'https://cgsword.com/bm/', 'sourceName': '御劍軒 魔物分布', 'fetched': date.today().isoformat(), 'areas': [a for a in areas if a['groups']]}
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('完成：有資料的地點', len(data['areas']), '／', len(areas), '，魔物出現紀錄', n)


if __name__ == '__main__':
    main()
