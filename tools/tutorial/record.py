"""錄製「魔力寶貝小工具」使用教學影片（無語音、字幕版）
用法：python3 tools/tutorial/record.py http://127.0.0.1:8090 輸出資料夾
  - 會用無頭瀏覽器實際操作網站，畫面上疊加導航精靈、字幕、步驟標籤與游標
  - 上線後把網址換成 https://starcg.online 再錄一次，就是真實市場資料
  - 產出：輸出資料夾/starcg-tutorial.mp4（1280×720）
"""
import os, sys, time, asyncio, glob, subprocess, pathlib
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip('/')
OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
DEMO = '127.0.0.1' in BASE or 'localhost' in BASE      # 本機測試資料 → 角落標示「示範資料」
OVERLAY = (pathlib.Path(__file__).parent / 'overlay.js').read_text(encoding='utf-8')
W, H = 1280, 720            # 畫面（CSS 像素）
VW, VH = 1280, 720          # 影片解析度（Playwright 錄影以畫面 CSS 像素為準）


async def ready(pg):
    await pg.wait_for_function("window.__tg && window.__tg.ready()", timeout=20000)
    try:
        await pg.wait_for_load_state('networkidle', timeout=6000)
    except Exception:
        pass


# 字幕節奏：依一般說話速度（中文約每秒 4 字）算每句需要停留多久；
# 下一句要等上一句讀完才會換，但畫面操作可以在讀的時候同時進行（像一般教學影片）
_until = 0.0
def need(text):
    cjk = sum(1 for c in text if ord(c) > 0x2E80)
    other = len(text) - cjk
    return min(8500, max(1500, int(cjk * 235 + other * 90 + 500)))


async def wait_read(pg):
    rem = _until - time.monotonic() * 1000
    if rem > 0:
        await pg.wait_for_timeout(rem)


async def say(pg, text, pose='adv-look', hold=None):
    global _until
    await wait_read(pg)
    await pg.evaluate("([t, p]) => __tg.say(t, p)", [text, pose])
    dur = hold if hold is not None else need(text)
    _until = time.monotonic() * 1000 + dur
    await pg.wait_for_timeout(min(900, dur))


async def point(pg, sel, nth=0):
    loc = pg.locator(sel).nth(nth)
    await loc.scroll_into_view_if_needed()
    box = await loc.bounding_box()
    x, y = box['x'] + min(box['width'] / 2, 60), box['y'] + box['height'] / 2
    await pg.evaluate("([x, y]) => __tg.cursorTo(x, y)", [x, y])
    await pg.wait_for_timeout(550)
    return loc, x, y


async def click(pg, sel, nth=0, after=500):
    loc, x, y = await point(pg, sel, nth)
    await pg.evaluate("([x, y]) => __tg.ripple(x, y)", [x, y])
    await loc.click()
    await pg.wait_for_timeout(after)


async def typing(pg, sel, text, nth=0):
    loc, x, y = await point(pg, sel, nth)
    await pg.evaluate("([x, y]) => __tg.ripple(x, y)", [x, y])
    await loc.click()
    await loc.fill('')
    await loc.type(text, delay=90)
    await pg.wait_for_timeout(350)


async def scroll(pg, sel, block='top', wait=850):
    """把目標捲到畫面上方（避開下方的字幕框）；block='center' 置中"""
    await pg.evaluate("""([s, b]) => {
      const e = document.querySelector(s); if (!e) return;
      const r = e.getBoundingClientRect();
      const y = b === 'center' ? r.top + scrollY - (innerHeight - r.height) / 2 + 60 : r.top + scrollY - 130;
      scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }""", [sel, block])
    await pg.wait_for_timeout(wait)


async def mark(pg, sel):
    await pg.evaluate("s => __tg.mark(s)", sel)


async def unmark(pg):
    await pg.evaluate("() => __tg.unmark()")


async def step(pg, n, title):
    await pg.evaluate("([n, t]) => __tg.step(n, t)", [n, title])


async def go(pg, sel, pose='adv-run', text=None):
    """點導覽列換頁，換頁後疊加層會自動重建"""
    if text:
        await say(pg, text, pose)
    await click(pg, sel, after=0)
    await pg.wait_for_load_state('load')
    await ready(pg)
    if text:
        await pg.evaluate("([t, p]) => __tg.say(t, p)", [text, pose])
    await pg.wait_for_timeout(400)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1, locale='zh-TW', timezone_id='Asia/Taipei',
                                  color_scheme='light', record_video_dir=str(OUT / 'raw'), record_video_size={'width': VW, 'height': VH})
        await ctx.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
        await ctx.add_init_script(OVERLAY)
        t0 = time.monotonic()
        pg = await ctx.new_page()

        # ───── 片頭 ─────
        await pg.goto(BASE + '/', wait_until='load')
        await ready(pg)
        await pg.evaluate("() => __tg.card('魔力寶貝小工具<br><span>使用教學</span>', '星詠魔力玩家專用小幫手')")
        t_start = time.monotonic() - t0
        await pg.wait_for_timeout(900)
        await say(pg, '大家好，我是星野！', 'adv-cheer', 2000)
        await say(pg, '跟大家介紹一下我這次新做的小工具網站——「魔力寶貝小工具」的使用教學。', 'adv-cheer')
        await say(pg, '查市價、算匯率、養寵物、算改造、迷宮找樓梯，全部都在這個網站，而且完全免費！', 'adv-cheer')
        await pg.evaluate("() => __tg.card('')")
        await pg.wait_for_timeout(500)

        # ───── STEP 1 首頁 ─────
        await step(pg, 1, '首頁總覽')
        await mark(pg, '.searchbar')
        await say(pg, '首頁最上面可以直接搜尋商品名稱，按下搜尋就會跳到市場查價。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '.tools')
        await mark(pg, '.tools')
        await say(pg, '這裡是八個常用工具，點一下就能進去；最新加入的是「迷宮找樓梯」，等一下會示範。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '.week')
        await mark(pg, '.week')
        await say(pg, '每週活動時間表會自動標出今天，下面還會倒數下一個活動什麼時候開始。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '.reg-banner')
        await mark(pg, '.reg-banner')
        await say(pg, '還沒有帳號的新玩家，記得從這個連結註冊，才能領到獨家好禮喔！', 'adv-cheer')
        await unmark(pg)
        await scroll(pg, 'body', 'top', 900)
        await say(pg, '右上角可以切換白天和夜晚模式，晚上玩遊戲看起來比較不刺眼。', 'adv-look')
        await click(pg, '.top-actions [data-act=theme]', after=300)
        await wait_read(pg)
        await click(pg, '.top-actions [data-act=theme]', after=400)

        # ───── STEP 2 市場查價 ─────
        await step(pg, 2, '市場查價')
        await go(pg, '.mainnav a[href*="market"]', 'adv-run', '接下來是最常用的「市場查價」。')
        if DEMO:
            await pg.evaluate("() => __tg.demo(true)")
        await typing(pg, '#mk-q', '水晶')
        await say(pg, '輸入商品名稱，按下「查詢市價」。', 'adv-look')
        await click(pg, '#mk-form button[type=submit]', after=300)
        await say(pg, '網站會整理官方擺攤市場目前所有的攤位，依「換算後最便宜」排好。', 'adv-run')
        await pg.wait_for_selector('.mk-group', timeout=30000)
        await scroll(pg, '#mk-tabs', 'top')
        await mark(pg, '#mk-summary')
        await say(pg, '最上面這排直接告訴你最低價，還有用魔晶買還是魔幣買比較划算。', 'adv-look')
        await unmark(pg)
        await mark(pg, '.mk-group')
        await say(pg, '每個攤位都會列出分流、座標和到期時間，按右邊的按鈕就能複製座標。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '#mk-form', 'top', 800)
        await click(pg, '#mk-fav', after=400)
        await say(pg, '常買的東西按一下星星，加到「我的最愛」，下次一點就能查。', 'adv-cheer')
        await mark(pg, '#mk-adv')
        await say(pg, '「篩選與顯示」可以選分流、幣別，或只看每種商品的最低價。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '#mk-tabs', 'top', 800)
        await click(pg, '#tab-history', after=1200)
        await say(pg, '切到「成交行情」，可以看最近真正賣出的價格、平均價和每日走勢圖。', 'adv-look')
        await click(pg, '#tab-pricing', after=800)
        await typing(pg, '#tr-price', '900')
        await scroll(pg, '#tr-out', 'center', 900)
        await mark(pg, '#tr-out')
        await say(pg, '想擺攤的話，在「擺攤定價」輸入售價，就能看到扣完手續費實拿多少，還有在目前攤位排第幾便宜。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '#mk-daily', 'top', 1400)
        await say(pg, '最下面的「每日市場動態」，可以看今天最熱門的商品和漲跌幅。', 'adv-look')

        # ───── STEP 3 批次採購 ─────
        await step(pg, 3, '批次採購')
        await scroll(pg, 'body', 'top', 900)
        await click(pg, '#tab-main-bulk', after=900)
        await say(pg, '如果要一次買很多樣東西，例如懸賞材料，就切到「批次採購」。', 'adv-look')
        await click(pg, '#bk-kind button[value=item]', after=600)
        await click(pg, '#bk-cands [data-pick="水的水晶碎片"]', after=300)
        await click(pg, '#bk-cands [data-pick="火的水晶碎片"]', after=300)
        await typing(pg, '#bk-q', '硬皮靴')
        await click(pg, '#bk-cands [data-pick], #bk-cands [data-add]', after=500)
        await say(pg, '點選要買的商品，數量可以在「已選商品」裡調整。', 'adv-look')
        await scroll(pg, '#bk-start', 'center', 900)
        await mark(pg, '#bk-map')
        await say(pg, '選好起點，像是東門或西門，也可以直接點地圖設定自己的位置。', 'adv-look')
        await unmark(pg)
        await click(pg, '#bk-go', after=300)
        await pg.wait_for_selector('#bk-results .bk-group, #bk-results .notice', timeout=40000)
        await scroll(pg, '#bk-results', 'top', 1300)
        await say(pg, '網站會依分流和幣別排出要跑哪幾攤、照什麼順序走最快，還附示意地圖，最划算的方案會特別標出來！', 'adv-cheer')
        if DEMO:
            await pg.evaluate("() => __tg.demo(false)")

        # ───── STEP 4 匯率比價 ─────
        await step(pg, 4, '匯率比價')
        await scroll(pg, 'body', 'top', 700)
        await go(pg, '.mainnav a[href*="exchange"]', 'adv-run', '再來是「匯率比價」。')
        await mark(pg, '#rate-title')
        await say(pg, '先在「設定行情」填目前魔晶和魔幣的比例，也可以切換台幣、港幣、人民幣、韓元和美金。', 'adv-look')
        await unmark(pg)
        await typing(pg, '#c-coin', '100萬')
        await say(pg, '「三向換算」任一格輸入金額，例如 100萬，魔晶和現金就會自動算好。', 'adv-look')
        await typing(pg, '#s-crystal', '3000')
        await typing(pg, '#s-coin', '950000')
        await mark(pg, '#verdict')
        await say(pg, '「單品比價」填同一件商品的魔晶價和魔幣價，馬上知道用哪種貨幣買比較省。', 'adv-cheer')
        await unmark(pg)

        # ───── STEP 5 寵物成長 ─────
        await step(pg, 5, '寵物成長')
        await go(pg, '.mainnav a[href*="pets"]', 'adv-run', '接著看「寵物成長」。')
        await say(pg, '這裡有完整的寵物圖鑑，可以用名稱、種族、卡等、屬性篩選。', 'adv-look')
        await click(pg, '.pet-card', after=900)
        await say(pg, '點一隻寵物就能開始模擬。', 'adv-look')
        await typing(pg, '#s-lv', '120')
        await click(pg, '[data-fill="1"]', after=600)
        await mark(pg, '#result')
        await say(pg, '調整等級、卡等、改造次數，配點可以一鍵點滿，能力值馬上算給你看。', 'adv-cheer')
        await unmark(pg)
        await scroll(pg, '#lv-table', 'center', 1200)
        await say(pg, '旁邊的等級試算表，會列出每個等級的能力值，還能加入比較清單跟朋友分享。', 'adv-look')

        # ───── STEP 6 改造圖成本 ─────
        await step(pg, 6, '改造圖成本')
        await scroll(pg, 'body', 'top', 700)
        await go(pg, '.mainnav a[href*="remodel"]', 'adv-run', '再來是「改造圖成本」。')
        await mark(pg, '#farm-kv')
        await say(pg, '填好挑戰場次和每場成本，就能算出能掉幾張改造圖、湊幾套、每套要多少錢。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '#stone-title', 'top', 1200)
        await say(pg, '「技能突破石掉落試算」填入場費和突破石價值，馬上知道打幾場、會不會回本。', 'adv-look')
        await mark(pg, '#stone-verdict')
        await say(pg, '最上面的結論會直接告訴你划不划算、平均每場賺多少。', 'adv-cheer')
        await unmark(pg)
        await scroll(pg, '#stone-h-cards', 'top', 1200)
        await typing(pg, '#cp-gset', '2000')
        await mark(pg, '#stone-kv4')
        await say(pg, '再填金改造圖一套的售價，普卡、銀卡會照合成比例自動算好，打 100 場總共能賺多少一目了然。', 'adv-cheer')
        await unmark(pg)
        await mark(pg, '#cp-min')
        await say(pg, '旁邊也會告訴你，改造圖最低可以賣多少才不會虧本。', 'adv-look')
        await unmark(pg)

        # ───── STEP 7 迷宮找樓梯 ─────
        await step(pg, 7, '迷宮找樓梯')
        await scroll(pg, 'body', 'top', 500)
        await go(pg, '.mainnav a[href*="maze"]', 'adv-run', '再來是新工具「迷宮找樓梯」，跑迷宮不用再自己找樓梯了。')
        await mark(pg, '#mz-link')
        await say(pg, '用電腦版 Chrome 或 Edge，按「連結遊戲資料夾」選擇遊戲裡的 StarCG_Data，瀏覽器問的時候選「每次造訪都允許」。', 'adv-look')
        await unmark(pg)
        await say(pg, '只要設定一次，之後打開這頁就會自動接上，不用每次丟檔案，也不會動到遊戲檔案。', 'adv-look')
        await say(pg, '我用示範模式讓大家看效果。', 'adv-cheer')
        await pg.evaluate("() => { window.__mzDemoStep = 1000; }")
        await click(pg, '#mz-demo', after=1200)
        await pg.wait_for_selector('#mz-live:not([hidden])')
        await mark(pg, '#mz-floors')
        await say(pg, '進迷宮前按「開始探索」，之後走到的第一張地圖就是第 1 層，往下自動數 2、3、4 層。', 'adv-look')
        await unmark(pg)
        await scroll(pg, '.mz-mapcard', 'top', 800)
        await mark(pg, '#mz-stage')
        await say(pg, '走到哪、地圖就畫到哪，樓梯和水晶一出現就直接標出來。', 'adv-look')
        await unmark(pg)
        await pg.wait_for_selector('#mz-exits .mz-exit', timeout=20000)
        await mark(pg, '#mz-exits')
        await say(pg, '右邊列出上樓梯、下樓梯和水晶的東南座標，點一下地圖會跳過去，也能一鍵複製座標。', 'adv-look')
        await unmark(pg)
        await click(pg, '#mz-mark [data-type=chest]', after=400)
        box = await pg.locator('#mz-canvas').bounding_box()
        cx, cy = box['x'] + box['width'] * 0.52, box['y'] + box['height'] * 0.45
        await pg.evaluate("([x, y]) => __tg.cursorTo(x, y)", [cx, cy])
        await pg.wait_for_timeout(600)
        await pg.evaluate("([x, y]) => __tg.ripple(x, y)", [cx, cy])
        await pg.mouse.click(cx, cy)
        await pg.wait_for_timeout(400)
        await say(pg, '看到寶箱或怪物，按一下「寶箱」再點地圖，就能自己標起來。', 'adv-cheer')
        await say(pg, '換樓層會自動跟著切，想回頭看就點上面的樓層標籤。', 'adv-look')
        await mark(pg, '#mz-floors')
        await pg.wait_for_function("document.querySelectorAll('#mz-floors .mz-chip').length >= 2", timeout=60000)
        await pg.wait_for_timeout(1200)
        await unmark(pg)
        await scroll(pg, 'body', 'top', 600)
        await mark(pg, '#mz-runline')
        await say(pg, '跑完按「結束探索」。迷宮重置前再回來，會自動認出同一座迷宮，接回上次的樓層。', 'adv-look')
        await unmark(pg)

        # ───── STEP 8 傷害計算 ─────
        await step(pg, 8, '傷害計算')
        await scroll(pg, 'body', 'top', 500)
        await go(pg, '.mainnav a[href*="damage"]', 'adv-run', '接著是「傷害計算機」。')
        await typing(pg, '#p-atk', '650')
        await scroll(pg, '.dmg-result', 'center', 800)
        await mark(pg, '.dmg-result')
        await say(pg, '填入攻擊方和防禦方的數值，一般、必殺、首領戰的傷害範圍一次算好。', 'adv-attack')
        await unmark(pg)
        await scroll(pg, 'body', 'top', 500)
        await click(pg, '#tab-magic', after=600)
        await say(pg, '切到「魔法傷害」，也能算精神和法杖對魔法傷害的影響。', 'adv-attack')

        # ───── STEP 9 心得與其他 ─────
        await step(pg, 9, '心得分享')
        await go(pg, '.mainnav a[href*="posts"]', 'adv-run', '最後是「心得分享」。')
        await say(pg, '每個工具的詳細教學都在這裡，我也會持續分享攻略和遊戲心得，記得常回來看看！', 'adv-cheer')
        await mark(pg, '.lang-btn')
        await say(pg, '網站也有韓文版，右上角一鍵就能切換。', 'adv-look')
        await unmark(pg)
        await mark(pg, '.top-actions .cta-reg')
        await say(pg, '每一頁的右上角都有註冊領好禮的按鈕。', 'adv-cheer')
        await unmark(pg)

        # ───── 片尾 ─────
        await step(pg, 0, '')
        await pg.evaluate("() => __tg.card('魔力寶貝小工具', '查市價・算匯率・養寵物・找樓梯，一站搞定')")
        await say(pg, '以上就是魔力寶貝小工具的使用教學！', 'adv-cheer')
        await say(pg, '新玩家記得透過網站的註冊連結領取獨家好禮，我們遊戲裡見～', 'adv-cheer')
        await wait_read(pg)
        await pg.wait_for_timeout(900)
        t_end = time.monotonic() - t0

        video = pg.video
        t_close = time.monotonic() - t0
        await ctx.close()
        raw = await video.path()
        await b.close()

    # 錄影的時間軸和實際時間不一定一樣長，依比例換算片頭要剪掉的秒數
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(raw)], capture_output=True, text=True).stdout.strip())
    scale = dur / t_close if t_close > 0 else 1
    ss = max(0.0, t_start * scale - 0.2)
    end = min(dur, t_end * scale + 0.5)
    mp4 = OUT / 'starcg-tutorial.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{ss:.2f}', '-to', f'{end:.2f}', '-i', str(raw),
                    '-vf', f'setpts=PTS/{scale:.4f},fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', str(mp4)], check=True)
    print('影片：', mp4, f'約 {(end - ss) / scale:.0f} 秒（錄影比例 {scale:.2f}，已校正為實際速度）')


asyncio.run(main())
