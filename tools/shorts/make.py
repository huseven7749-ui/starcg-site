"""直式短片（1080×1920）：「規矩不能壞」風格，主題是魔力寶貝小工具。
用法：python3 tools/shorts/make.py http://127.0.0.1:8090 out/
  1. 用手機尺寸擷取網站各工具畫面
  2. 每個場景輸出「背景層」（手機畫面，之後慢慢推近）＋「文字層」（台詞、角色，固定不動）
  3. ffmpeg 合成：推近、淡入淡出轉場、暗角、顆粒；另輸出 SRT 供剪映配音
"""
import os, sys, json, base64, pathlib, asyncio, subprocess, html
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SRC = ROOT / 'src'
BASE = sys.argv[1].rstrip('/')
OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
WORK = OUT / 'shorts-work'; WORK.mkdir(exist_ok=True)
W, H, FPS = 1080, 1920, 30
SPR = SRC / 'assets' / 'img' / 'sprites'
b64 = lambda p: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
SPRITES = {n: b64(SPR / f'{n}-still.png') for n in ['adv-look', 'adv-cheer', 'adv-sit', 'adv-run', 'mouse-crown', 'ratking']}

# ───── 台詞與場景 ─────
# shot：要用哪張截圖；q：旁人問的話（小字）；a：老闆（站長）回的話（大字）；sub：底下補一行小字；dur：秒
SCENES = [
    dict(shot='home', a='規矩不能壞。', tag='魔力寶貝小工具 · 站長星野', dur=3.2, sprite='adv-look', title=True),
    dict(shot='market', q='不怕虧錢嗎？', a='怕。更怕帳本不清。', dur=4.0, sprite='adv-look'),
    dict(shot='market-summary', a='查價要一筆一筆記清楚，\n誰的攤位誰負責。', dur=4.2),
    dict(shot='exchange', q='貴是貴了點。', a='買了不燒心。', dur=3.6, sprite='adv-look'),
    dict(shot='market-fresh', a='不降。資料不一樣，\n攤位都是當天抓的。', dur=4.2),
    dict(shot='bulk', q='這麼大一單不接嗎？', a='接，只接自己能拿住的。', dur=4.2, sprite='adv-run'),
    dict(shot='maze', q='明天怎麼辦？', a='先做。', dur=3.2, sprite='adv-look'),
    dict(shot='maze-stairs', a='不是我穩，是不能慌。\n一慌就容易走錯路。', dur=4.4),
    dict(shot='damage', a='有人說不準，\n那我就讓他看準。', dur=3.8, sprite='adv-attack'),
    dict(shot='daily', a='今天是今天，明天是明天，\n每天都得重新算。', dur=4.4),
    dict(shot='posts', a='搶得走鋪子，\n搶不走人心。', dur=3.8, sprite='mouse-crown'),
    dict(shot='home-tools', a='寧可少掙點，\n也不能壞了規矩。', sub='全部免費・不用安裝・手機電腦都能用', dur=4.2),
    dict(shot='home', q='終於好起來了。', a='嗯，要穩。', dur=3.4, sprite='adv-cheer'),
    dict(shot='end', q='老闆，你家貴是貴了點，但是用了不燒心。', a='免費的。', sub='starcg.online', dur=5.0, sprite='adv-cheer', end=True),
]
SPRITES['adv-attack'] = b64(SPR / 'adv-attack-still.png')


# ───── 1. 擷取網站畫面（手機 390×844，3 倍）─────
async def shots(ctx):
    pg = await ctx.new_page()
    async def go(path):
        await pg.goto(BASE + path, wait_until='load'); await pg.wait_for_timeout(900)
    async def snap(name, sel=None, block='start', extra=0):
        if sel:
            await pg.evaluate("""([s, b, x]) => { const e = document.querySelector(s); if (!e) return; const r = e.getBoundingClientRect(); scrollTo({ top: r.top + scrollY - (b === 'center' ? (innerHeight - r.height) / 2 : 90) + x }); }""", [sel, block, extra])
            await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(WORK / f'shot-{name}.png'))
    await go('/'); await snap('home')
    await snap('home-tools', '.tools')
    await go('/market/?q=%E6%B0%B4%E6%99%B6'); await pg.wait_for_selector('.mk-group', timeout=30000); await pg.wait_for_timeout(600)
    await snap('market', '.mk-group'); await snap('market-summary', '#mk-summary'); await snap('market-fresh', '#mk-status', 'start', -40)
    await pg.evaluate("document.querySelector('#mk-daily').scrollIntoView()"); await pg.wait_for_timeout(2500); await snap('daily', '#mk-daily')
    await pg.evaluate("scrollTo(0, 0)"); await pg.click('#tab-main-bulk'); await pg.wait_for_timeout(600)
    await pg.click('#bk-kind button[value=item]'); await pg.wait_for_timeout(400)
    for n in ['水的水晶碎片', '火的水晶碎片', '風的水晶碎片']:
        try: await pg.click(f'#bk-cands [data-pick="{n}"]', timeout=3000)
        except Exception: pass
    await pg.click('#bk-go'); await pg.wait_for_selector('#bk-results .bk-group, #bk-results .notice', timeout=40000); await pg.wait_for_timeout(600)
    await snap('bulk', '#bk-results .bk-map', 'center')
    await go('/exchange/')
    await pg.fill('#s-crystal', '3000'); await pg.fill('#s-coin', '950000'); await pg.dispatch_event('#s-coin', 'input'); await pg.wait_for_timeout(400)
    await snap('exchange', '#verdict', 'center')
    await go('/maze/'); await pg.evaluate("() => { window.__mzDemoStep = 700; }")
    await pg.click('#mz-demo'); await pg.wait_for_selector('#mz-live:not([hidden])'); await pg.wait_for_timeout(2500)
    await snap('maze', '.mz-mapcard')
    await pg.wait_for_selector('#mz-exits .mz-exit', timeout=20000); await pg.wait_for_timeout(2500)
    await snap('maze-stairs', '#mz-stage', 'center')
    await go('/damage/'); await pg.fill('#p-atk', '650'); await pg.dispatch_event('#p-atk', 'input'); await pg.wait_for_timeout(400)
    await snap('damage', '.dmg-result', 'center')
    await go('/posts/'); await snap('posts', '.post-list', 'start', -30)
    await pg.close()


# ───── 2. 場景合成 ─────
def bg_html(shot, dim=0.0):
    img = b64(WORK / f'shot-{shot}.png')
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin:0; width:{W}px; height:{H}px; overflow:hidden; background:#0C0907; position:relative; }}
.glow {{ position:absolute; inset:-200px; background: radial-gradient(60% 45% at 50% 38%, #4a3014 0%, #1a110a 55%, #0C0907 100%); }}
.phone {{ position:absolute; left:50%; top:120px; width:760px; height:1644px; transform: translateX(-50%) rotate(-3deg); border-radius:56px; overflow:hidden;
  box-shadow: 0 60px 120px #000c, 0 0 0 10px #1a1410, 0 0 0 12px #3a2a1a; background:#000; }}
.phone img {{ width:100%; height:100%; object-fit:cover; object-position:top; display:block; filter: saturate(.92) contrast(1.02); }}
.shade {{ position:absolute; inset:0; background: linear-gradient(180deg, #0C0907 0%, #0C090700 12%, #0C090700 55%, #0C0907ee 78%, #0C0907 100%); }}
.dim {{ position:absolute; inset:0; background:#0C0907; opacity:{dim}; }}
</style></head><body><div class="glow"></div><div class="phone"><img src="{img}"></div><div class="shade"></div><div class="dim"></div></body></html>'''


def text_html(sc):
    e = html.escape
    q = f'<div class="q">{e(sc["q"])}</div>' if sc.get('q') else ''
    a = '<br>'.join(e(x) for x in sc['a'].split('\n'))
    sub = f'<div class="sub">{e(sc["sub"])}</div>' if sc.get('sub') else ''
    tag = f'<div class="tag">{e(sc["tag"])}</div>' if sc.get('tag') else ''
    spr = f'<img class="spr" src="{SPRITES[sc["sprite"]]}">' if sc.get('sprite') else ''
    big = sc.get('title') or sc.get('end')
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin:0; width:{W}px; height:{H}px; overflow:hidden; background:transparent; position:relative; font-family:"Noto Serif CJK TC","Noto Sans CJK TC",serif; color:#fff; }}
.tag {{ position:absolute; left:0; right:0; top:52px; text-align:center; font-size:30px; letter-spacing:6px; color:#d8c7a8; font-family:"Noto Sans CJK TC"; font-weight:700; text-shadow:0 2px 8px #000; }}
.box {{ position:absolute; left:70px; right:70px; bottom:170px; text-align:center; }}
.q {{ font-size:46px; color:#cdbfa6; margin-bottom:26px; letter-spacing:2px; text-shadow:0 2px 10px #000, 0 0 2px #000; font-family:"Noto Sans CJK TC"; font-weight:500; }}
.a {{ font-size:{96 if big else 78}px; line-height:1.3; font-weight:900; letter-spacing:4px; text-shadow: 0 4px 0 #000, 0 0 18px #000c, 0 10px 30px #000; }}
.a b {{ color:#FFD86B; }}
.sub {{ margin-top:30px; font-size:40px; color:#FFD86B; letter-spacing:3px; font-family:"Noto Sans CJK TC"; font-weight:700; text-shadow:0 2px 10px #000; }}
.spr {{ position:absolute; left:26px; top:1150px; height:250px; image-rendering:pixelated; filter: drop-shadow(0 10px 20px #000c); }}   /* 站在手機左側，不壓到台詞 */
.bar {{ position:absolute; left:0; right:0; height:6px; background:#FFD86B; opacity:.9; }}
.cue {{ position:absolute; left:0; right:0; bottom:40px; text-align:center; font-size:26px; color:#8e7f66; letter-spacing:4px; font-family:"Noto Sans CJK TC"; }}
</style></head><body>{tag}<div class="box">{q}<div class="a">{a}</div>{sub}</div>{spr}<div class="cue">starcg.online</div></body></html>'''


async def render(ctx):
    pg = await ctx.new_page()
    for i, sc in enumerate(SCENES):
        await pg.set_content(bg_html(sc['shot'] if sc['shot'] != 'end' else 'home', dim=0.35 if sc.get('end') else 0.0)); await pg.wait_for_timeout(200)
        await pg.screenshot(path=str(WORK / f'bg-{i:02d}.png'))
        await pg.set_content(text_html(sc)); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=str(WORK / f'tx-{i:02d}.png'), omit_background=True)
    await pg.close()


# ───── 3. ffmpeg ─────
def assemble():
    XF = 0.45
    inputs, filters, labels = [], [], []
    for i, sc in enumerate(SCENES):
        d = sc['dur'] + (XF if i < len(SCENES) - 1 else 0)
        n = int(round(d * FPS))
        inputs += ['-loop', '1', '-t', f'{d:.3f}', '-i', str(WORK / f'bg-{i:02d}.png'), '-loop', '1', '-t', f'{d:.3f}', '-i', str(WORK / f'tx-{i:02d}.png')]
        bg, tx = 2 * i, 2 * i + 1
        # 背景慢慢推近（最多 8%），文字層固定
        filters.append(f"[{bg}:v]scale={W * 2}:{H * 2},zoompan=z='1+0.08*on/{n}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},format=rgba[b{i}];[b{i}][{tx}:v]overlay=0:0:format=auto,setsar=1,format=yuv420p[v{i}]")
        labels.append(f'[v{i}]')
    # 轉場串接
    cur = 'v0'; t = 0.0
    for i in range(1, len(SCENES)):
        t += SCENES[i - 1]['dur']
        out = f'x{i}'
        filters.append(f"[{cur}][v{i}]xfade=transition=fade:duration={XF}:offset={t:.3f}[{out}]")
        cur = out
    total = sum(s['dur'] for s in SCENES)
    filters.append(f"[{cur}]vignette=angle=PI/4.6,noise=alls=6:allf=t+u,fade=t=in:st=0:d=0.8,fade=t=out:st={total - 1.0:.3f}:d=1.0[vout]")
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
           '-filter_complex', ';'.join(filters), '-map', '[vout]', '-map', f'{2 * len(SCENES)}:a', '-t', f'{total:.3f}',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-r', str(FPS), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', str(OUT / 'starcg-short.mp4')]
    subprocess.run(cmd, check=True)
    # SRT：每句台詞的時間（剪映「朗讀」用）
    def ts(x):
        ms = int(round(x * 1000)); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'
    lines, t, k = [], 0.0, 1
    for sc in SCENES:
        parts = ([('q', sc['q'])] if sc.get('q') else []) + [('a', sc['a'].replace('\n', ''))]
        seg = sc['dur'] / len(parts)
        for j, (kind, text) in enumerate(parts):
            s = t + j * seg + 0.25; e = t + (j + 1) * seg - 0.05
            lines.append(f'{k}\n{ts(s)} --> {ts(e)}\n{text}\n'); k += 1
        t += sc['dur']
    (OUT / 'starcg-short.srt').write_text('\n'.join(lines), encoding='utf-8-sig')
    (OUT / 'starcg-short-台詞.txt').write_text('\n'.join((f"（問）{s['q']}\n" if s.get('q') else '') + s['a'].replace('\n', '') for s in SCENES) + '\n', encoding='utf-8-sig')
    print('影片：', OUT / 'starcg-short.mp4', f'{total:.0f} 秒；字幕：', OUT / 'starcg-short.srt')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        m = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True, locale='zh-TW', color_scheme='light')
        await m.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
        await shots(m); await m.close()
        c = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
        await render(c); await c.close()
        await b.close()
    assemble()

asyncio.run(main())
