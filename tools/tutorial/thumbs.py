"""教學影片的 YouTube 縮圖（1280×720）。用法：python3 tools/tutorial/thumbs.py http://127.0.0.1:8090 out/ [zh|ko]
A 版：品牌底色＋大字＋星野；B 版：首頁截圖＋大字。"""
import os, sys, base64, pathlib, asyncio, html
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SRC = ROOT / 'src'
BASE = sys.argv[1].rstrip('/'); OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
LANG = sys.argv[3] if len(sys.argv) > 3 else 'zh'
SPR = SRC / 'assets' / 'img' / 'sprites'
b64 = lambda p: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
CHEER, CROWN, LOOK = b64(SPR / 'adv-cheer-still.png'), b64(SPR / 'mouse-crown-still.png'), b64(SPR / 'adv-look-still.png')
FONT_ZH = (SRC / 'assets' / 'fonts' / 'round-zh.woff2').as_uri(); FONT_KO = (SRC / 'assets' / 'fonts' / 'round-ko.woff2').as_uri()
sprite = (SRC / 'partials' / 'sprite.svg').read_text(encoding='utf-8')
PAVING = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='48'%3E%3Cg fill='none' stroke='%237B5F43' stroke-opacity='.16' stroke-width='1.5'%3E%3Cpath d='M0 .75h96M0 24.75h96M24 0v24M72 0v24M0 24v24M48 24v24M96 24v24'/%3E%3C/g%3E%3C/svg%3E\")"

T = {
  'zh': dict(pill='魔力寶貝小工具 使用教學', h1a='星詠魔力', h1b='必備網站', chips=[('i-market', '市場查價', '#336F9F'), ('i-maze', '迷宮找樓梯', '#4C7C35'), ('i-pets', '寵物模擬', '#9A6A12'), ('i-exchange', '匯率比價', '#66529C')],
            foot='免費・免安裝・手機電腦都能用', url='starcg.online', bub='一站搞定！',
            b_small='6 分鐘學會', b_big1='市場查價', b_big2='迷宮找樓梯', b_tag='魔力寶貝小工具', b_sub='星詠魔力玩家必備', b_bub='免費用！'),
  'ko': dict(pill='크로스게이트 미니 도구 사용법', h1a='StarCG 필수', h1b='무료 사이트', chips=[('i-market', '시세 검색', '#336F9F'), ('i-maze', '미궁 계단 찾기', '#4C7C35'), ('i-pets', '펫 성장', '#9A6A12'), ('i-exchange', '환율 비교', '#66529C')],
            foot='무료・설치 불필요・PC와 폰 모두 OK', url='starcg.online/ko/', bub='한곳에서!',
            b_small='6분이면 끝', b_big1='시세 검색', b_big2='미궁 계단 찾기', b_tag='크로스게이트 미니 도구', b_sub='StarCG 플레이어 필수', b_bub='무료!'),
}[LANG]
FONT = 'StarRoundKO, StarRound, "Noto Sans CJK KR"' if LANG == 'ko' else 'StarRound, "Noto Sans CJK TC", "Noto Sans CJK HK"'
HEAD = f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: StarRound; src: url({FONT_ZH}); }} @font-face {{ font-family: StarRoundKO; src: url({FONT_KO}); }}
body {{ margin:0; width:1280px; height:720px; overflow:hidden; font-family:{FONT}, sans-serif; color:#4A3422; position:relative; }}
.px {{ image-rendering: pixelated; }}
</style></head><body>{sprite}'''
e = html.escape

def html_a():
    chips = ''.join(f'<span class="chip" style="--c:{c}"><svg><use href="#{ic}"/></svg>{e(t)}</span>' for ic, t, c in T['chips'])
    return HEAD + f'''<style>
body {{ background: linear-gradient(180deg, #CFE4F4 0%, #EAF0EC 28%, #F7EBD2 60%, #EFD9AE 100%); }}
.pave {{ position:absolute; left:0; right:0; bottom:0; height:250px; background-image:{PAVING}; background-size:96px 48px; }}
.frame {{ position:absolute; inset:16px; border:5px solid #D9654A; border-radius:30px; box-shadow: inset 0 0 0 7px #FFF6E2; }}
.pill {{ position:absolute; left:72px; top:64px; background:#FFFAEE; padding:10px 26px; border-radius:999px; font-size:34px; font-weight:700; color:#D9654A; border:3px solid #D5B98A; }}
h1 {{ position:absolute; left:68px; top:128px; margin:0; font-size:138px; line-height:1.0; letter-spacing:4px; color:#4A3422; text-shadow: 0 8px 0 #D5B98A66; }}
h1 b {{ color:#D9654A; }}
.chips {{ position:absolute; left:72px; top:420px; display:flex; gap:12px; flex-wrap:wrap; width:720px; }}
.chip {{ display:inline-flex; align-items:center; gap:10px; background:#fff; border:3px solid var(--c); color:var(--c); font-size:30px; font-weight:700; padding:6px 20px 6px 14px; border-radius:999px; box-shadow:0 5px 0 #0002; --ic2: #fff; }}
.chip svg {{ width:36px; height:36px; }}
.foot {{ position:absolute; left:72px; top:566px; font-size:28px; color:#7B5F43; }}
.url {{ position:absolute; left:72px; bottom:46px; font-size:32px; font-weight:700; color:#fff; background:#D9654A; padding:10px 30px; border-radius:999px; box-shadow:0 6px 0 #0003; font-family:system-ui,sans-serif; }}
.hero {{ position:absolute; right:190px; bottom:60px; width:230px; height:435px; }}
.glow {{ position:absolute; right:110px; bottom:44px; width:400px; height:70px; border-radius:50%; background: radial-gradient(closest-side, #E2AE4799, transparent); }}
.mouse {{ position:absolute; right:56px; bottom:62px; width:132px; height:159px; }}
.bub {{ position:absolute; right:80px; top:120px; background:#FFFAEE; border:5px solid #D9654A; border-radius:40px; padding:14px 30px; font-size:44px; font-weight:700; color:#D9654A; box-shadow:0 8px 0 #D5B98A; transform:rotate(-6deg); }}
.bub::after {{ content:""; position:absolute; left:60px; bottom:-26px; border:14px solid transparent; border-top:16px solid #D9654A; }}
</style><div class="pave"></div><div class="frame"></div>
<span class="pill">{e(T['pill'])}</span>
<h1>{e(T['h1a'])}<br><b>{e(T['h1b'])}</b></h1>
<div class="chips">{chips}</div>
<div class="foot">{e(T['foot'])}</div>
<div class="url">{e(T['url'])}</div>
<div class="glow"></div><img class="hero px" src="{CHEER}"><img class="mouse px" src="{CROWN}"><div class="bub">{e(T['bub'])}</div>
</body></html>'''

def html_b(shot):
    return HEAD + f'''<style>
.bg {{ position:absolute; inset:0; background:url({shot}) center/cover; filter: saturate(1.05); }}
.shade {{ position:absolute; inset:0; background: linear-gradient(90deg, #2A1A10F4 0%, #2A1A10E6 50%, #2A1A1080 74%, #2A1A1040 100%); }}
.small {{ position:absolute; left:70px; top:72px; background:#F2C058; color:#4A3422; font-size:40px; font-weight:700; padding:8px 26px; border-radius:16px; transform:rotate(-3deg); box-shadow:0 6px 0 #0004; }}
h1 {{ position:absolute; left:66px; top:150px; margin:0; font-size:{128 if LANG == 'ko' else 168}px; line-height:1.0; color:#fff; letter-spacing:3px;
     text-shadow: 0 0 2px #D9654A, 0 0 2px #D9654A, 6px 6px 0 #D9654A, 0 14px 30px #0009; }}
h1 b {{ color:#FFE08A; }}
.tag {{ position:absolute; left:72px; top:520px; display:flex; align-items:center; gap:16px; font-size:40px; color:#fff; font-weight:700; text-shadow:0 3px 8px #000A; }}
.tag span {{ background:#D9654A; padding:6px 20px; border-radius:999px; font-size:32px; }}
.url {{ position:absolute; left:72px; bottom:44px; font-size:32px; font-weight:700; color:#fff; background:#D9654A; padding:10px 30px; border-radius:999px; box-shadow:0 6px 0 #0005; font-family:system-ui,sans-serif; }}
.hero {{ position:absolute; right:{60 if LANG == 'ko' else 110}px; bottom:30px; width:{200 if LANG == 'ko' else 230}px; height:{378 if LANG == 'ko' else 435}px; filter: drop-shadow(0 10px 20px #0008); }}
.bub {{ position:absolute; right:{40 if LANG == 'ko' else 70}px; top:150px; background:#FFFAEE; border:5px solid #D9654A; border-radius:40px; padding:14px 30px; font-size:48px; font-weight:700; color:#D9654A; box-shadow:0 8px 0 #0005; transform:rotate(5deg); }}
.bub::after {{ content:""; position:absolute; left:50%; bottom:-28px; border:14px solid transparent; border-top:16px solid #D9654A; }}
</style><div class="bg"></div><div class="shade"></div>
<div class="small">{e(T['b_small'])}</div>
<h1>{e(T['b_big1'])}<br><b>{e(T['b_big2'])}</b></h1>
<div class="tag"><span>{e(T['b_tag'])}</span>{e(T['b_sub'])}</div>
<div class="url">{e(T['url'])}</div>
<img class="hero px" src="{CHEER}"><div class="bub">{e(T['b_bub'])}</div>
</body></html>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1, locale='ko-KR' if LANG == 'ko' else 'zh-TW')
        await ctx.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
        pg = await ctx.new_page()
        await pg.goto(BASE + ('/ko/' if LANG == 'ko' else '/'), wait_until='load'); await pg.wait_for_timeout(1500)
        await pg.evaluate("() => { const r = document.querySelector('.tools').getBoundingClientRect(); scrollTo(0, r.top + scrollY - 300); }"); await pg.wait_for_timeout(600)
        shot = 'data:image/png;base64,' + base64.b64encode(await pg.screenshot()).decode()
        for name, h in [('A', html_a()), ('B', html_b(shot))]:
            await pg.set_content(h); await pg.wait_for_timeout(600)
            await pg.evaluate("document.fonts.ready")
            await pg.screenshot(path=str(OUT / f'thumb-{LANG}-{name}.png'))
            print(OUT / f'thumb-{LANG}-{name}.png')
        await b.close()
asyncio.run(main())
