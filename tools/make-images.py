"""產生 App 圖示、favicon、捷徑圖示與各頁 OG 分享圖（Headless Chromium 繪製）。
用法：python3 tools/make-images.py
"""
import os, json, re, asyncio, pathlib, subprocess, html
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
ICONS = SRC / 'icons'
OG = SRC / 'assets' / 'img' / 'og'
ICONS.mkdir(exist_ok=True)
OG.mkdir(parents=True, exist_ok=True)

import base64
SPR = SRC / 'assets' / 'img' / 'sprites'
b64 = lambda p: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
RAT = b64(SPR / 'ratking-face.png')          # 51×54
DIVA = b64(SPR / 'diva-still.png')            # 125×195
sprite = (SRC / 'partials' / 'sprite.svg').read_text(encoding='utf-8')
dicts = json.loads(subprocess.check_output(['node', '-e', """
Promise.all([import('./src/i18n/zh.mjs'),import('./src/i18n/ko.mjs')]).then(([z,k])=>process.stdout.write(JSON.stringify({zh:z.default,ko:{...z.default,...k.default}})))
"""], cwd=ROOT))

def icon_svg(maskable=False, size=512):
    # 鼠王（像素放大）＋ 法蘭城砂岩底、赤陶框
    if maskable:
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8EBCB"/><stop offset="1" stop-color="#E8C88E"/></linearGradient></defs><rect width="512" height="512" fill="url(#bg)"/><image href="{RAT}" x="128.5" y="121" width="255" height="270" style="image-rendering:pixelated"/></svg>'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8EBCB"/><stop offset="1" stop-color="#E8C88E"/></linearGradient></defs><rect x="8" y="8" width="496" height="496" rx="112" fill="url(#bg)" stroke="#D9654A" stroke-width="16"/><rect x="30" y="30" width="452" height="452" rx="94" fill="none" stroke="#FFF6E2" stroke-width="6"/><image href="{RAT}" x="78.5" y="58" width="357" height="378" style="image-rendering:pixelated"/></svg>'''

FONT_ZH = (SRC / 'assets' / 'fonts' / 'round-zh.woff2').as_uri()
FONT_KO = (SRC / 'assets' / 'fonts' / 'round-ko.woff2').as_uri()
PAGE_COLORS = {
    'home': ('#D9654A', 'i-sparkle'),
    'market': ('#336F9F', 'i-market'),
    'exchange': ('#9A6A12', 'i-exchange'),
    'pets': ('#4C7C35', 'i-pets'),
    'remodel': ('#66529C', 'i-remodel'),
    'damage': ('#AE4932', 'i-damage'),
    'maze': ('#2E7D5B', 'i-maze'),
    'posts': ('#B5533C', 'i-posts'),
}
PAVING = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='48'%3E%3Cg fill='none' stroke='%237B5F43' stroke-opacity='.14' stroke-width='1.5'%3E%3Cpath d='M0 .75h96M0 24.75h96M24 0v24M72 0v24M0 24v24M48 24v24M96 24v24'/%3E%3C/g%3E%3C/svg%3E\")"

def og_html(page, lang):
    d = dicts[lang]
    accent, ic = PAGE_COLORS[page]
    title = d['page.home.h1'] if page == 'home' else d[f'page.{page}.h1']
    lead = d.get(f'page.{page}.lead') or d.get(f'page.{page}.desc', '')
    if len(lead) > 46: lead = lead[:45] + '…'
    font = 'StarRoundKO, StarRound' if lang == 'ko' else 'StarRound'
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: StarRound; src: url({FONT_ZH}); }}
@font-face {{ font-family: StarRoundKO; src: url({FONT_KO}); }}
body {{ margin:0; width:1200px; height:630px; overflow:hidden; font-family:{font}, sans-serif; color:#4A3422; position:relative;
  background: linear-gradient(180deg, #CFE4F4 0%, #EAF0EC 30%, #F7EBD2 62%, #EFD9AE 100%); }}
.pave {{ position:absolute; left:0; right:0; bottom:0; height:230px; background-image:{PAVING}; background-size:96px 48px; opacity:.9; }}
.frame {{ position:absolute; inset:18px; border:4px solid #D9654A; border-radius:28px; box-shadow: inset 0 0 0 6px #FFF6E2; }}
.card {{ position:absolute; left:70px; top:70px; width:690px; }}
.pill {{ display:inline-block; background:#FFFAEE; padding:8px 22px; border-radius:999px; font-size:30px; font-weight:700; color:{accent}; border:3px solid #D5B98A; }}
.sub {{ margin-top:12px; font-size:24px; color:#7B5F43; }}
h1 {{ font-size:{84 if len(title) < 9 else 66}px; line-height:1.15; margin:26px 0 16px; letter-spacing:2px; }}
p {{ font-size:30px; line-height:1.5; margin:0; color:#7B5F43; }}
.url {{ position:absolute; left:70px; bottom:62px; font-size:28px; font-weight:700; color:#fff; background:{accent}; padding:10px 26px; border-radius:999px; box-shadow:0 6px 0 #0003; font-family:system-ui,sans-serif; }}
.diva {{ position:absolute; right:96px; bottom:40px; width:250px; height:390px; image-rendering:pixelated; }}
.glow {{ position:absolute; right:86px; bottom:30px; width:270px; height:70px; border-radius:50%; background: radial-gradient(closest-side, #E2AE4788, transparent); }}
.rat {{ position:absolute; right:330px; bottom:44px; width:102px; height:108px; image-rendering:pixelated; }}
.bubble {{ position:absolute; right:110px; top:150px; width:260px; height:260px; border-radius:64px; background:#FFFAEE; border:6px solid #D5B98A; box-shadow:0 10px 0 #D5B98A88; display:grid; place-items:center; color:{accent}; --ic2:#F9DFD3; }}
.bubble svg {{ width:150px; height:150px; }}
</style></head><body><div class="pave"></div><div class="frame"></div>{sprite}
<div class="card"><span class="pill">{html.escape(d['site.name'])}</span><div class="sub">{html.escape(d['site.tagline'])}</div><h1>{html.escape(title)}</h1><p>{html.escape(lead)}</p></div>
<div class="bubble"><svg><use href="#{ic}"/></svg></div>
<div class="url">starcg.online{'/ko/' if lang == 'ko' else ''}</div></body></html>'''

def shortcut_html(ic, color, bg):
    return f'''<!doctype html><html><body style="margin:0;background:transparent">{sprite}<div style="width:96px;height:96px;border-radius:50%;background:{bg};display:grid;place-items:center;color:{color};--ic2:#fff"><svg style="width:58px;height:58px"><use href="#{ic}"/></svg></div></body></html>'''

async def main():
    (ICONS / 'icon.svg').write_text(icon_svg(), encoding='utf-8')
    (ICONS / 'maskable.svg').write_text(icon_svg(True), encoding='utf-8')
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def shot(content, out, w, h, transparent=False, fmt='png'):
            pg = await b.new_page(viewport={'width': w, 'height': h})
            tmp = ROOT / 'tools' / '_render.html'
            tmp.write_text(content, encoding='utf-8')
            await pg.goto(tmp.as_uri(), wait_until='networkidle')
            await pg.evaluate('document.fonts.ready')
            await pg.wait_for_timeout(150)
            if fmt == 'jpeg':
                await pg.screenshot(path=str(out), type='jpeg', quality=88)
            else:
                await pg.screenshot(path=str(out), omit_background=transparent)
            await pg.close()
        for size, name in [(32, 'favicon-32.png'), (180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
            await shot(f'<body style="margin:0;background:transparent">{icon_svg(size=size)}</body>', ICONS / name, size, size, transparent=True)
        await shot(f'<body style="margin:0">{icon_svg(True)}</body>', ICONS / 'maskable-512.png', 512, 512)
        for page, ic, color, bg in [('market', 'i-market', '#336F9F', '#DFECF7'), ('exchange', 'i-exchange', '#9A6A12', '#F9EBC6'), ('pets', 'i-pets', '#4C7C35', '#E4EFD7')]:
            await shot(shortcut_html(ic, color, bg), ICONS / f'sc-{page}.png', 96, 96, transparent=True)
        for page in PAGE_COLORS:
            for lang in ('zh', 'ko'):
                await shot(og_html(page, lang), OG / f'{page}-{lang}.jpg', 1200, 630, fmt='jpeg')
        await b.close()
    # favicon.ico（16/32/48）
    Image.open(ICONS / 'icon-512.png').save(ICONS / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    for f in sorted(list(ICONS.iterdir()) + list(OG.iterdir())):
        print(f'{f.relative_to(ROOT)}  {f.stat().st_size // 1024} KB')

asyncio.run(main())
