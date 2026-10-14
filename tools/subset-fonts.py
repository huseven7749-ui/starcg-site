"""依網站實際用到的文字，產生圓體字型子集（WOFF2）。
需要：pip 的 fonttools；若系統沒有 brotli 套件，會自動改用 tools/pyshim 的 Node 版。
用法：python3 tools/subset-fonts.py dist <huninn.ttf> <gowun-dodum.ttf>
  - round-zh.woff2：jf open 粉圓（OFL）子集，介面文字（頁面＋腳本字典），每頁預先載入
  - round-zh-ext.woff2：同字型，寵物／裝備／懸賞等資料名稱用到、但介面沒用到的字；
    以 unicode-range 宣告，只有頁面真的出現這些字時瀏覽器才會下載
  - round-ko.woff2：Gowun Dodum（OFL）子集，給韓文頁面
字型名稱改為 StarRound / StarRoundKO（OFL 規定修改版不可沿用保留字型名稱）。
同時會改寫 src/assets/css/app.css 內 /* font-ext */ 標記之間的 @font-face。
"""
import sys, os, json, re, pathlib, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pyshim'))
try:
    import brotli  # noqa: F401
except ImportError:
    pass
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
dist = pathlib.Path(sys.argv[1])
huninn, gowun = sys.argv[2], sys.argv[3]
out_dir = ROOT / 'src' / 'assets' / 'fonts'
out_dir.mkdir(parents=True, exist_ok=True)

def dict_text(lang):
    js = f"import('{(ROOT / 'src' / 'i18n' / (lang + '.mjs')).as_posix()}').then(m => process.stdout.write(Object.values(m.default).join('\\n')))"
    return subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, check=True).stdout

zh_text, ko_text = set(dict_text('zh')), set(dict_text('ko'))
for p in dist.rglob('*.html'):
    t = p.read_text(encoding='utf-8')
    (ko_text if p.relative_to(dist).as_posix().startswith('ko/') else zh_text).update(t)
data_text = set()
for p in [*(ROOT / 'static' / 'data').glob('*.json'), *(ROOT / 'src' / 'data').glob('*.json')]:
    data_text.update(p.read_text(encoding='utf-8'))

BASE = set(chr(c) for c in range(0x20, 0x7F)) | set('，。、；：？！「」『』（）《》〈〉【】…—～・·•→←↑↓★☆✦◆●○×÷±≈−＋％／｜０１２３４５６７８９ ')
is_cjk = lambda ch: 0x3000 <= ord(ch) <= 0x9FFF or 0xF900 <= ord(ch) <= 0xFAFF or 0xFF00 <= ord(ch) <= 0xFFEF
is_hangul = lambda ch: 0xAC00 <= ord(ch) <= 0xD7A3 or 0x3130 <= ord(ch) <= 0x318F or 0x1100 <= ord(ch) <= 0x11FF

def cmap(path):
    f = TTFont(path)
    return {chr(c) for c in f.getBestCmap()}

zh_have, ko_have = cmap(huninn), cmap(gowun)
zh_core = (BASE | {c for c in zh_text if is_cjk(c) or ord(c) < 0x2E80} | {c for c in ko_text if is_cjk(c)}) & zh_have
zh_ext = {c for c in data_text if is_cjk(c)} & zh_have - zh_core
ko_chars = (BASE | {c for c in ko_text if is_hangul(c) or ord(c) < 0x2E80}) & ko_have

def make(src, chars, family, out):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    font = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in (1, 4, 16):
            rec.string = family
        elif rec.nameID == 6:
            rec.string = family.replace(' ', '')
        elif rec.nameID == 3:
            rec.string = family + ' subset'
    font.flavor = 'woff2'
    font.save(out)
    print(f'{out.name}: {len(chars)} 字，{out.stat().st_size / 1024:.1f} KB')

def ranges(chars):
    cps = sorted(ord(c) for c in chars)
    out, start, prev = [], None, None
    for cp in cps:
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append((start, prev)); start = prev = cp
    if start is not None:
        out.append((start, prev))
    return ', '.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in out)

make(huninn, zh_core, 'StarRound', out_dir / 'round-zh.woff2')
make(gowun, ko_chars, 'StarRoundKO', out_dir / 'round-ko.woff2')
css_path = ROOT / 'src' / 'assets' / 'css' / 'app.css'
css = css_path.read_text(encoding='utf-8')
if zh_ext:
    make(huninn, zh_ext, 'StarRound', out_dir / 'round-zh-ext.woff2')
    face = f'@font-face {{ font-family: "StarRound"; src: url(../fonts/round-zh-ext.woff2) format("woff2"); font-display: swap; unicode-range: {ranges(zh_ext)}; }}'
else:
    face = ''
css, n = re.subn(r'/\* font-ext \*/.*?/\* /font-ext \*/', lambda m: f'/* font-ext */{face}/* /font-ext */', css, flags=re.S)
if not n:
    raise SystemExit('app.css 找不到 /* font-ext */ 標記')
css_path.write_text(css, encoding='utf-8')
print('app.css：已更新資料用字的 unicode-range')
