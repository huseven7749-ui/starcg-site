"""端對端檢查：各頁在電腦／手機、日／夜、中／韓的畫面與主控台錯誤。
用法：python3 tests/e2e.py <base_url> <輸出資料夾> [頁面過濾]
"""
import os, sys, asyncio, json, pathlib
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip('/')
OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
ONLY = sys.argv[3] if len(sys.argv) > 3 else ''
PAGES = [('home', '/'), ('market', '/market/?q=%E6%B0%B4%E6%99%B6'), ('exchange', '/exchange/'), ('pets', '/pets/'), ('remodel', '/remodel/'), ('damage', '/damage/'), ('maze', '/maze/'), ('posts', '/posts/'), ('post', '/posts/site-guide/')]
VIEWS = [('desk', {'viewport': {'width': 1366, 'height': 900}}), ('mob', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2})]

async def run():
    problems = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ('zh', 'ko'):
            for vname, vopts in VIEWS:
                for theme in ('light', 'dark'):
                    if theme == 'dark' and vname == 'desk' and lang == 'ko':
                        continue
                    ctx = await b.new_context(color_scheme=theme, locale='ko-KR' if lang == 'ko' else 'zh-TW', timezone_id='Asia/Taipei', **vopts)
                    await ctx.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
                    for pid, path in PAGES:
                        if ONLY and ONLY != pid:
                            continue
                        page = await ctx.new_page()
                        errs = []
                        page.on('console', lambda m, errs=errs: errs.append(m.text) if m.type == 'error' else None)
                        page.on('pageerror', lambda e, errs=errs: errs.append('pageerror: ' + str(e)))
                        url = BASE + ('/ko' if lang == 'ko' else '') + path
                        await page.goto(url, wait_until='networkidle')
                        await page.wait_for_timeout(700)
                        if pid == 'market':
                            await page.wait_for_selector('.mk-group', timeout=8000)
                        if pid == 'pets':
                            await page.wait_for_selector('.pet-card', timeout=8000)
                        name = f'{lang}-{vname}-{theme}-{pid}.png'
                        await page.screenshot(path=str(OUT / name), full_page=True)
                        # 水平捲動檢查（手機版不能左右滑）
                        overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
                        errs = [e for e in errs if 'wodenchen' not in e and 'guide.starcg.net' not in e]
                        if errs or overflow > 2:
                            problems.append({'shot': name, 'errors': errs[:5], 'overflowX': overflow})
                        await page.close()
                    await ctx.close()
        await b.close()
    print(json.dumps(problems, ensure_ascii=False, indent=1) if problems else 'OK：沒有主控台錯誤，也沒有水平溢出')

asyncio.run(run())
