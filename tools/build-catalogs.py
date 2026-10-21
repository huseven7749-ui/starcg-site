"""產生市場查價用的裝備名錄 static/data/equipment.json（名稱、分類、級別）
來源：星詠攻略網裝備圖鑑 https://guide.starcg.net/equipment（2026-10 逐頁整理成 tools/data/equipment-guide-2026-10.txt，格式：名稱|分類|級別;…）
  - 弗旦、水龍系列歸在自己的分類；公主傳說的「之裳」系列沿用原本分類；攻略網的 headwear（頭戴）在本站叫 headband
  - 攻略網沒收錄、但市場上有在賣的少數裝備放在 EXTRA
懸賞名錄 static/data/bounty.json 已直接依攻略網 https://guide.starcg.net/production/bounty 手動校對，這支程式不再產生（避免覆蓋）。
用法：python3 tools/build-catalogs.py
"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PRINCESS = {'兵消之裳', '城堡之裳', '戰靈之裳', '結界之裳', '血盟之衣', '雲群之裳', '魔消之裳', '魔靈之裳',
            '凜冽之裳', '大地之裳', '氤氳之裳', '海洋之裳', '火焰之裳', '炙熱之裳', '無情之裳', '禍害之裳'}
EXTRA = [('狂怒繃帶', 'bracelet', 1), ('受詛咒的薑餅人', 'headband', 1), ('屈原的戒指', 'ring', 1)]
CAT_MAP = {'headwear': 'headband'}

raw = (ROOT / 'tools/data/equipment-guide-2026-10.txt').read_text(encoding='utf-8').strip()
seen, eq = set(), []
for row in raw.split(';'):
    n, c, lv = row.split('|')
    if n in seen: continue
    seen.add(n)
    c = 'princess-legend' if n in PRINCESS else CAT_MAP.get(c, c)
    eq.append([n, c, int(lv)])
for n, c, lv in EXTRA:
    if n not in seen: eq.append([n, c, lv])
eq.sort(key=lambda x: (x[1], x[2], x[0]))
(ROOT / 'static/data/equipment.json').write_text(json.dumps({'v': '2026-10-21', 'src': 'https://guide.starcg.net/equipment', 'items': eq}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('equipment', len(eq))
