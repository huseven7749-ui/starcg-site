import os, sys, asyncio
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for vname, opts in [('desk', {'viewport': {'width': 1366, 'height': 900}}), ('mob', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2})]:
            ctx = await b.new_context(locale='zh-TW', timezone_id='Asia/Taipei', **opts)
            await ctx.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            # 寵物：點第一張卡 → 模擬
            await pg.goto(BASE + '/pets/', wait_until='networkidle')
            await pg.click('.pet-card')
            await pg.wait_for_timeout(400)
            await pg.fill('#s-lv', '120'); await pg.select_option('#s-rm', '5')
            await pg.click('[data-fill="1"]')
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{OUT}/{vname}-pets-sim.png', full_page=True)
            vals = await pg.eval_on_selector_all('#result .stat-tile b', 'els => els.map(e => e.textContent)')
            pts = await pg.text_content('#points')
            print(vname, 'sim result', vals, '|', pts)
            # 市場：近期成交、追蹤
            await pg.goto(BASE + '/market/?q=%E7%A1%AC%E7%9A%AE%E9%9D%B4', wait_until='networkidle')
            await pg.wait_for_selector('.mk-group')
            await pg.click('.watch-btn')
            await pg.click('#tab-history'); await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'{OUT}/{vname}-market-history.png', full_page=True)
            await pg.click('#tab-watch'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{OUT}/{vname}-market-watch.png')
            # 設定面板
            await pg.click('[data-act=settings] >> nth=0')
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{OUT}/{vname}-settings.png')
            await pg.click('#sheet-settings [data-pref=theme] button[value=dark]')
            await pg.click('#sheet-settings [data-act=close]')
            await pg.wait_for_timeout(200)
            theme = await pg.evaluate('document.documentElement.dataset.theme')
            # 匯率
            await pg.goto(BASE + '/exchange/', wait_until='networkidle')
            await pg.fill('#c-coin', '250萬'); await pg.fill('#s-crystal', '600'); await pg.fill('#s-coin', '200萬')
            await pg.wait_for_timeout(300)
            conv = [await pg.input_value('#c-crystal'), await pg.input_value('#c-twd')]
            verdict = await pg.text_content('#verdict')
            print(vname, 'theme after toggle:', theme, '| 250萬 →', conv, '|', verdict.strip()[:60])
            await pg.screenshot(path=f'{OUT}/{vname}-exchange-dark.png', full_page=True)
            if vname == 'mob':
                await pg.goto(BASE + '/', wait_until='networkidle')
                await pg.click('.tabbar [data-act=more]'); await pg.wait_for_timeout(400)
                await pg.screenshot(path=f'{OUT}/mob-more.png')
            print(vname, 'errors:', errs)
            await ctx.close()
        await b.close()
asyncio.run(main())
