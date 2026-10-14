"""Headless Chromium 截圖小工具。
用法：python3 tools/shot.py <url或檔案> <輸出.png> [寬] [高] [--full] [--dark] [--mobile] [--scale=2] [--wait=ms]
"""
import os, sys, asyncio
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright

async def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = {a.split('=')[0]: (a.split('=')[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
    src, out = args[0], args[1]
    w = int(args[2]) if len(args) > 2 else 1280
    h = int(args[3]) if len(args) > 3 else 800
    if not src.startswith(('http://', 'https://', 'file://')):
        src = 'file://' + os.path.abspath(src)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(
            viewport={'width': w, 'height': h},
            device_scale_factor=float(flags.get('--scale', 2)),
            color_scheme='dark' if flags.get('--dark') else 'light',
            is_mobile=bool(flags.get('--mobile')), has_touch=bool(flags.get('--mobile')),
            locale='ko-KR' if flags.get('--ko') else 'zh-TW', timezone_id='Asia/Taipei')
        page = await ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        await page.goto(src, wait_until='networkidle')
        await page.wait_for_timeout(int(flags.get('--wait', 300)))
        await page.screenshot(path=out, full_page=bool(flags.get('--full')))
        for l in logs:
            print(l)
        await b.close()

asyncio.run(main())
