"""文章插圖產生 WebP 版本（同檔名 .webp，放在 src/posts/img/）。
網頁用 <picture> 先給 WebP、不支援的瀏覽器用原本的 JPG；檔案通常小 40～60%。
src/posts/img/webp.json 記錄每張 WebP 是從哪個版本的 JPG 轉的（內容雜湊）；
JPG 換過但沒重轉時，建置會自動改用 JPG，不會顯示舊圖。
用法：python tools/make-webp.py [--quality 80]（做完新圖或改圖後跑一次）
"""
import os, sys, glob, json, hashlib
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'src', 'posts', 'img')
MANIFEST = os.path.join(IMG, 'webp.json')
q = int(sys.argv[sys.argv.index('--quality') + 1]) if '--quality' in sys.argv else 80


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


man = json.load(open(MANIFEST, encoding='utf-8')) if os.path.exists(MANIFEST) else {}
made = skipped = 0
before = after = 0
names = set()
for jpg in sorted(glob.glob(os.path.join(IMG, '*.jpg'))):
    name = os.path.basename(jpg); names.add(name)
    webp = jpg[:-4] + '.webp'
    h = sha(jpg)
    if man.get(name) == h and os.path.exists(webp):
        skipped += 1
        continue
    with Image.open(jpg) as im:
        im.convert('RGB').save(webp, 'WEBP', quality=q, method=6)
    # WebP 沒有比較小就不要（刪掉，網頁只用 JPG）
    if os.path.getsize(webp) >= os.path.getsize(jpg):
        os.remove(webp); man.pop(name, None)
        continue
    man[name] = h
    before += os.path.getsize(jpg); after += os.path.getsize(webp); made += 1
# JPG 已刪除的：一併刪掉 WebP 與紀錄
for name in list(man):
    if name not in names:
        man.pop(name)
        w = os.path.join(IMG, name[:-4] + '.webp')
        if os.path.exists(w): os.remove(w)
json.dump(dict(sorted(man.items())), open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(f'產生 {made} 張、略過 {skipped} 張；這次 JPG {before / 1e6:.1f}MB → WebP {after / 1e6:.1f}MB')
