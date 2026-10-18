"""魔物分布：本站寵物圖鑑沒有的魔物，用本機資料包（raw_bin 匯出的站立圖）做 96px 小圖
→ static/img/monsters/<imageId>.png，並在 static/data/monster-map.json 標記 img:1。
跑完 tools/scrape-monster-map.py 之後再跑這個。資料包路徑：桌面 starcg\\StarCG_資料包。
"""
import os, json, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(os.path.dirname(ROOT), 'StarCG_資料包', '99_工具與解析資料', '匯出總覽', 'stand')
DATA = os.path.join(ROOT, 'static', 'data', 'monster-map.json')
OUT = os.path.join(ROOT, 'static', 'img', 'monsters')
PETS = os.path.join(ROOT, 'dist', 'data', 'pets.json')

d = json.load(open(DATA, encoding='utf-8'))
pets = json.load(open(PETS, encoding='utf-8'))
ids = {str(p.get('imageId')) for p in pets}; names = {p['name'] for p in pets}
stand = {os.path.splitext(os.path.basename(f))[0]: f for f in glob.glob(os.path.join(PACK, '*', '*.png'))}
os.makedirs(OUT, exist_ok=True)
n = 0
for a in d['areas']:
    for g in a['groups']:
        for x in g['monsters']:
            i = str(x['imageId'])
            if (i in ids or x['name'] in names) or i not in stand: continue
            x['img'] = 1
            t = os.path.join(OUT, f'{i}.png')
            if not os.path.exists(t):
                im = Image.open(stand[i]).convert('RGBA'); bb = im.getbbox()
                im = im.crop(bb) if bb else im; im.thumbnail((96, 96)); im.save(t, optimize=True); n += 1
json.dump(d, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('新增小圖', n)
