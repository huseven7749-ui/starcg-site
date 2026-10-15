"""市場查價新功能的互動測試（桌機＋手機）：
裝備分類瀏覽、寵物瀏覽、近期成交、定價試算、每日動態、批量採購路線、資料匯入。
用法：python3 tests/market_features.py http://127.0.0.1:8090 輸出資料夾
"""
import os, sys, asyncio
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright

BASE, OUT = sys.argv[1].rstrip('/'), sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CSV = """時間,品名,數量,單價,幣別
2026-10-10 12:00,硬皮靴,1,880,魔幣
2026-10-10 13:10,硬皮靴,2,900,魔幣
2026-10-11 09:30,硬皮靴,1,860,魔幣
2026-10-11 21:05,年獸,1,3200000,魔幣
2026-10-12 08:00,年獸,1,850,魔晶
"""
fails = []

def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        fails.append(msg)

async def run(b, vname, opts):
    ctx = await b.new_context(locale='zh-TW', timezone_id='Asia/Taipei', **opts)
    await ctx.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    print(f'[{vname}]')

    # 1. 裝備分類瀏覽（靴）
    await pg.goto(BASE + '/market/?kind=equip&cat=boots', wait_until='load')
    await pg.wait_for_selector('.mk-group', timeout=45000)
    n = await pg.locator('.mk-group').count()
    check(n > 0, f'裝備分類瀏覽有結果（{n} 組）')
    await pg.screenshot(path=f'{OUT}/{vname}-equip-browse.png', full_page=True)

    # 2. 寵物瀏覽（野獸系）
    await pg.goto(BASE + '/market/?kind=pet&race=' + '野獸系', wait_until='load')
    await pg.wait_for_selector('#mk-results .mk-group, #mk-results .empty', timeout=45000)
    check(await pg.locator('#mk-results .mk-group').count() > 0, '寵物瀏覽有結果')
    await pg.screenshot(path=f'{OUT}/{vname}-pet-browse.png', full_page=True)

    # 3. 關鍵字查詢 → 近期成交 → 定價試算
    await pg.goto(BASE + '/market/?q=%E7%A1%AC%E7%9A%AE%E9%9D%B4', wait_until='load')
    await pg.wait_for_selector('.mk-group', timeout=45000)
    await pg.click('#tab-history')
    await pg.wait_for_selector('#mk-history .stat-tile', timeout=45000)
    check(await pg.locator('#mk-history .stat-tile').count() >= 3, '近期成交統計磚')
    await pg.screenshot(path=f'{OUT}/{vname}-history.png', full_page=True)
    await pg.click('#tab-pricing')
    await pg.wait_for_selector('#tr-price', timeout=10000)
    await pg.fill('#tr-price', '900')
    await pg.wait_for_timeout(300)
    out = await pg.text_content('#tr-out')
    check('810' in (out or '') or '8' in (out or ''), f'試算售價有輸出（{(out or "").strip()[:40]}…）')
    await pg.screenshot(path=f'{OUT}/{vname}-pricing.png', full_page=True)

    # 4. 每日市場動態
    await pg.locator('#mk-daily').scroll_into_view_if_needed()
    await pg.wait_for_selector('#daily-body .dl-list, #daily-body .empty', timeout=45000)
    check(await pg.locator('#daily-body .dl-list li').count() > 0, '每日動態有熱門清單')
    await pg.locator('#mk-daily').screenshot(path=f'{OUT}/{vname}-daily.png')

    # 5. 批量採購路線
    await pg.goto(BASE + '/market/?tab=bulk', wait_until='load')
    await pg.wait_for_selector('#bk-cands [data-pick]', timeout=45000)
    picks = pg.locator('#bk-cands [data-pick]')
    for i in range(min(2, await picks.count())):
        await picks.nth(i).click()
    for name in ('硬皮靴', '火的水晶碎片'):
        await pg.fill('#bk-q', name)
        await pg.wait_for_timeout(300)
        await pg.locator('#bk-cands [data-pick], #bk-cands [data-add]').first.click()
    check(await pg.locator('#bk-sel .bk-row').count() >= 1, '已選清單有品項')
    await pg.click('#bk-go')
    await pg.wait_for_selector('#bk-results .bk-group, #bk-results .empty, #bk-results .notice', timeout=30000)
    groups = await pg.locator('#bk-results .bk-group').count()
    check(groups > 0, f'產生採購路線（{groups} 組）')
    await pg.screenshot(path=f'{OUT}/{vname}-bulk.png', full_page=True)

    # 6. 資料匯入
    await pg.goto(BASE + '/market/?tab=data', wait_until='load')
    await pg.fill('#dm-text', CSV)
    await pg.click('#dm-import')
    await pg.wait_for_timeout(400)
    s = await pg.text_content('#dm-summary')
    check('5' in (s or ''), '匯入 5 筆成交紀錄')
    await pg.screenshot(path=f'{OUT}/{vname}-data.png', full_page=True)

    # 7. 匯入資料作為來源
    await pg.goto(BASE + '/market/?q=%E7%A1%AC%E7%9A%AE%E9%9D%B4', wait_until='load')
    await pg.wait_for_selector('.mk-group', timeout=45000)
    if not await pg.eval_on_selector('#mk-adv', 'el => el.open'):
        await pg.click('#mk-adv > summary')
    await pg.click('#mk-src button[value="import"]')
    await pg.click('#tab-history')
    await pg.wait_for_timeout(600)
    h = await pg.text_content('#mk-history')
    check('3' in (h or ''), '匯入資料可作為近期成交來源')

    # 水平溢出
    over = await pg.evaluate('document.documentElement.scrollWidth - innerWidth')
    check(over <= 1, f'無水平溢出（{over}px）')
    check(not errs, '無主控台錯誤' + ('：' + ' | '.join(errs[:3]) if errs else ''))
    await ctx.close()

# 韓文站：可用韓文關鍵字搜尋，名稱顯示韓文（中文小字），成交行情與批次採購也跟著
async def run_ko(b):
    print('\n[ko]')
    ctx = await b.new_context(locale='ko-KR', timezone_id='Asia/Seoul', viewport={'width': 1200, 'height': 900})
    await ctx.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE + '/ko/market/'); await pg.wait_for_timeout(500)
    await pg.fill('#mk-q', '수정'); await pg.click('#mk-form button[type=submit]')
    await pg.wait_for_selector('.mk-group', timeout=30000); await pg.wait_for_timeout(400)
    h3 = await pg.inner_text('.mk-group h3')
    check('수정' in h3, '韓文關鍵字搜得到，名稱顯示韓文')
    check('水晶' in h3, '韓文名下方附中文名')
    await pg.click('#tab-history'); await pg.wait_for_timeout(2500)
    check('수정' in await pg.inner_text('#pane-history .mk-hist-head'), '成交行情商品名顯示韓文')
    await pg.goto(BASE + '/ko/market/?q=%E6%B0%B4%E6%99%B6'); await pg.wait_for_selector('.mk-group', timeout=30000); await pg.wait_for_timeout(300)
    check('수정' in await pg.inner_text('.mk-group h3'), '韓文站用中文關鍵字也顯示韓文名')
    await pg.click('#tab-main-bulk'); await pg.wait_for_timeout(500); await pg.click('#bk-kind button[value=item]'); await pg.wait_for_timeout(400)
    await pg.click('#bk-cands [data-pick="水的水晶碎片"]'); await pg.click('#bk-go')
    await pg.wait_for_selector('#bk-results .bk-group, #bk-results .notice', timeout=40000); await pg.wait_for_timeout(300)
    check('수정' in await pg.inner_text('#bk-results .bk-buys li'), '批次採購路線的商品名顯示韓文')
    check(not errs, '無主控台錯誤' + ('：' + ' | '.join(errs[:3]) if errs else ''))
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 'desk', {'viewport': {'width': 1366, 'height': 900}})
        await run(b, 'mob', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2})
        await run_ko(b)
        await b.close()
    print('\n' + ('全部通過' if not fails else f'失敗 {len(fails)} 項'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
