r"""戰鬥測試（痛打 01）的角色圖集：從資料包的動作包（zip）做成「一張圖＋每個動作的位移資料」。
用法：python tools/make-fighter.py 105211 lancer --attack=5 --magic=3 --reach=130
  - 讀 StarCG_資料包\03_玩家角色\動作包\<編號>-全部動作.zip 的 動作xx_方向4（面向右下）單張 PNG
  - 讀 解析資料 anime_frames.csv／graphicinfo.csv 算出每個動作畫格左上角相對腳底原點的位移
  - 輸出 src/assets/img/dummy/<名稱>.webp、portraits.webp（頭像），並更新 src/assets/js/dummysprites.js
動作對應（遊戲動作編號，可用 --attack=5 --magic=3 改）：站立 0、跑 1、受傷 8、防禦 9、倒地 10；攻擊、法術預設 5、3；開心＝跑、生氣＝攻擊。
"""
import os, re, io, sys, csv, json, glob, zipfile, collections
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(os.path.dirname(ROOT), 'StarCG_資料包')
aid, key = sys.argv[1], sys.argv[2]   # 之後的 --attack= 等選項在下面讀
opt = lambda k, d: int(next((a.split('=')[1] for a in sys.argv if a.startswith(f'--{k}=')), d))
ACT = {'idle': 0, 'run': 1, 'attack': opt('attack', 5), 'magic': opt('magic', 3), 'hurt': 8, 'guard': 9, 'down': 10}
REACH = {'attack': opt('reach', 130), 'magic': 115}
ALIAS = {'happy': 'run', 'angry': 'attack'}
PAD = 4                                     # 匯出的 GIF／PNG 每邊多留 4px

zp = glob.glob(os.path.join(PACK, '*', '動作包', f'{aid}*-全部動作.zip'))[0]
z = zipfile.ZipFile(zp)
set_dir = glob.glob(os.path.join(PACK, '99_工具與解析資料', '解析資料', 'raw_bin', '*'))
g = {}; fr = collections.defaultdict(list)
for d in set_dir:
    ai = os.path.join(d, 'anime_frames.csv')
    if not os.path.exists(ai): continue
    rows = [r for r in csv.DictReader(open(ai, encoding='utf-8-sig')) if r['anime_id'] == aid and r['direction'] == '4']
    if not rows: continue
    for r in csv.DictReader(open(os.path.join(d, 'graphicinfo.csv'), encoding='utf-8-sig')): g[int(r['graphic_id'])] = r
    for r in rows: fr[int(r['action'])].append(r)
    break

blocks, meta, y = {}, {}, 0
for name, act in ACT.items():
    pngs = sorted(n for n in z.namelist() if re.search(rf'單張PNG/動作{act:02d}_方向4/\d+\.png$', n))
    frames = [Image.open(io.BytesIO(z.read(n))).convert('RGBA') for n in pngs]
    rows = fr[act]
    x0 = min(int(g[int(r['graphic_id'])]['offset_x']) + int(r['offset_x']) for r in rows) - PAD
    y0 = min(int(g[int(r['graphic_id'])]['offset_y']) + int(r['offset_y']) for r in rows) - PAD
    w, h = frames[0].size
    n = len(frames); c = min(n, max(1, 1800 // w))
    sheet = Image.new('RGBA', (c * w, ((n + c - 1) // c) * h), (0, 0, 0, 0))
    for i, f in enumerate(frames): sheet.paste(f, ((i % c) * w, (i // c) * h))
    ms = round(int(rows[0]['duration_ms']) / max(1, len(rows))) if n > 1 else round(int(rows[0]['duration_ms']) * 0.7)
    blocks[name] = (sheet, y); meta[name] = {'y': y, 'w': w, 'h': h, 'n': n, 'c': c, 'ms': ms, 'ox': x0, 'oy': y0}
    y += sheet.height
W = max(b[0].width for b in blocks.values())
out = Image.new('RGBA', (W, y), (0, 0, 0, 0))
for sheet, yy in blocks.values(): out.paste(sheet, (0, yy))
for a, b in ALIAS.items(): meta[a] = dict(meta[b])
dst = os.path.join(ROOT, 'src', 'assets', 'img', 'dummy', f'{key}.webp')
out.save(dst, 'WEBP', quality=88, method=6)
print(key, out.size, os.path.getsize(dst) // 1024, 'KB')

# 頭像：站立第一格的上半身，64×64
idle = blocks['idle'][0].crop((0, 0, meta['idle']['w'], meta['idle']['h']))
bb = idle.getbbox(); idle = idle.crop(bb)
head = idle.crop((0, 0, idle.width, min(idle.height, int(idle.width * 1.1))))
head.thumbnail((60, 60), Image.LANCZOS)
por = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); por.paste(head, ((64 - head.width) // 2, (64 - head.height) // 2), head)
por.save(os.path.join(ROOT, 'src', 'assets', 'img', 'dummy', 'portraits.webp'), 'WEBP', quality=90)

# 更新 dummysprites.js：只留這個角色（foe 不動）
p = os.path.join(ROOT, 'src', 'assets', 'js', 'dummysprites.js')
s = open(p, encoding='utf-8').read()
m = re.search(r'export const SPRITES = (\{.*\});', s, re.S)
d = json.loads(m.group(1))
d['order'] = [key]
d['fighters'] = {key: {'id': int(aid), 'reach': REACH, 'a': meta}}
s = s[:m.start()] + 'export const SPRITES = ' + json.dumps(d, ensure_ascii=False, separators=(', ', ': ')) + ';' + s[m.end():]
s = re.sub(r'// 兩位角色來自站長提供的動畫[^\n]*\n', f'// 玩家角色來自站長指定的動畫 {aid}（面向右下、方向 4，tools/make-fighter.py 由資料包動作包做成），happy／angry 直接沿用跑步／攻擊\n', s)
open(p, 'w', encoding='utf-8').write(s)
print('updated', p)
