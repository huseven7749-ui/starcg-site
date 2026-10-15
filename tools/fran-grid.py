#!/usr/bin/env python3
"""法蘭城可走格產生器：把 Map1000 格值診斷圖＋世界地圖原圖 → src/assets/js/frangrid.js 裡的 BITS。

用法：python3 tools/fran-grid.py <map1000 格值平面圖.png> <法蘭城世界地圖.png>
  - 格值平面圖：300×300、每格 3px、格線每 25 格，x=0 在 px 55、y=0 在 py 90（站長用遊戲資料匯出的診斷圖）
    顏色：220 灰＝有地面資料、255 白＝建物、115 深灰＝牆／障礙、35 黑＝地圖外、175＝格線
  - 世界地圖原圖：1621×1190 RGBA，用來判斷哪些「有地面資料」的格子其實是水面（藍色）
座標對應（與 mkmap.js 相同）：px = OX + U·(x+y)、py = OY + V·(y−x)
"""
import sys, base64
import numpy as np
from PIL import Image

OX, OY, U, V = -242.71, 789.05, 3.9878, 2.9513
N = 300

def main(diag_path, iso_path, out_path='src/assets/js/frangrid.js'):
    A = np.array(Image.open(diag_path).convert('RGB')).astype(int)
    def cls(px, py):
        r, g, b = A[py, px]
        if abs(r - g) < 6 and abs(g - b) < 6:
            if r >= 250: return 'B'
            if abs(r - 220) < 8: return '.'
            if abs(r - 115) < 10: return '#'
            if r < 60: return 'X'
            if abs(r - 175) < 8: return None
        return 'M'
    grid = [[None] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            c = None
            for dx, dy in [(1, 1), (2, 2), (1, 2), (2, 1), (0, 0)]:
                c = cls(55 + 3 * x + dx, 90 + 3 * y + dy)
                if c and c != 'M': break
            grid[y][x] = '.' if c in (None, 'M') else c
    I = np.array(Image.open(iso_path).convert('RGBA')).astype(int); H, W = I.shape[:2]
    def water(x, y):
        px, py = int(round(OX + U * (x + y))), int(round(OY + V * (y - x)))
        if not (0 <= px < W and 0 <= py < H): return True
        r, g, b, a = I[py, px]
        return a < 128 or (b > 190 and r < 120 and g < 190)
    walk = np.zeros((N, N), bool)
    for y in range(N):
        for x in range(N):
            if grid[y][x] != '.': continue
            votes = sum(water(x + dx, y + dy) for dx, dy in [(0, 0), (.3, 0), (-.3, 0), (0, .3), (0, -.3)])
            walk[y, x] = votes < 3
    # 手動修正：里堡東西側的橋在資料裡只剩一格寬，補成三格
    for y in (87, 88, 89):
        for x in range(129, 140): walk[y, x] = True
        for x in range(166, 181): walk[y, x] = True
    b64 = base64.b64encode(np.packbits(walk.reshape(-1).astype(np.uint8)).tobytes()).decode()
    src = open(out_path, encoding='utf-8').read()
    import re
    src2 = re.sub(r"const BITS = '[A-Za-z0-9+/=]*';", f"const BITS = '{b64}';", src, count=1)
    open(out_path, 'w', encoding='utf-8').write(src2)
    print(f'可走格 {int(walk.sum())}，已寫入 {out_path}')

if __name__ == '__main__':
    if len(sys.argv) < 3: print(__doc__); sys.exit(1)
    main(*sys.argv[1:4])
