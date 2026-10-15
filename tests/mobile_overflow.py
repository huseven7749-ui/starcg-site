"""手機版文字溢出檢查：找出「文字超出所屬底色框／邊框」的地方。
用法：python3 tests/mobile_overflow.py <base_url> [輸出資料夾]
檢查方式：對每個有底色或邊框的元素（框），量測框內每段文字的實際範圍，
          超出框的左右邊界（或被框裁掉）就列出來；另外檢查元素本身 scrollWidth > clientWidth（文字被截斷）。
"""
import os, sys, json, asyncio
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip('/')
OUT = sys.argv[2] if len(sys.argv) > 2 else ''

JS = r"""
() => {
  const W = document.documentElement.clientWidth;
  const isBox = el => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor, img = cs.backgroundImage;
    const hasBg = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || (img && img !== 'none');
    const hasBorder = ['Left', 'Right', 'Top', 'Bottom'].some(s => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none');
    return hasBg || hasBorder;
  };
  const visible = el => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
  };
  const label = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + [...el.classList].slice(0, 3).join('.');
    return s;
  };
  const path = el => { const p = []; let e = el; for (let i = 0; e && e !== document.body && i < 4; i++, e = e.parentElement) p.unshift(label(e)); return p.join(' > '); };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.textContent.trim();
    if (!txt) continue;
    const host = n.parentElement;
    if (!host || !visible(host) || host.closest('script,style,svg,dialog:not([open]),[hidden],.sr-only,.skip,.xp-float,.ach-toast,.toast,datalist,option,select')) continue;
    if (host.closest('details:not([open])') && !host.closest('summary')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    const tr = { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) };
    // 超出畫面
    if (tr.right > W + 1 || tr.left < -1) {
      const k = 'vp|' + path(host);
      if (!seen.has(k)) { seen.add(k); out.push({ kind: 'viewport', text: txt.slice(0, 40), el: path(host), over: Math.round(Math.max(tr.right - W, -tr.left)) }); }
    }
    // 超出最近的有底色／邊框的祖先
    let box = host;
    while (box && box !== document.body && !isBox(box)) box = box.parentElement;
    if (!box || box === document.body) continue;
    const br = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const bl = br.left + parseFloat(cs.borderLeftWidth), brr = br.right - parseFloat(cs.borderRightWidth);
    const overR = tr.right - brr, overL = bl - tr.left;
    let overB = tr.bottom - br.bottom, overT = br.top - tr.top;
    if (['auto', 'scroll'].includes(cs.overflowY)) { overB = 0; overT = 0; }   // 會捲動的容器（底部面板）上下超出是正常的
    const over = Math.max(overR, overL, overB, overT);
    if (over > 1.5) {
      const k = 'box|' + path(host) + '|' + label(box);
      if (!seen.has(k)) { seen.add(k); out.push({ kind: 'box', text: txt.slice(0, 40), el: path(host), box: label(box), over: Math.round(over), dir: overR >= Math.max(overL, overB, overT) ? 'right' : overB >= Math.max(overL, overT) ? 'bottom' : overL > overT ? 'left' : 'top' }); }
    }
  }
  // 文字被截斷（容器 overflow 隱藏但內容比容器寬）
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || el.closest('svg,[hidden],.sr-only,.skip,.tbl-wrap,.tabs,.week,.chips,.mk-tags,select,input,textarea,.cta-reg')) return;
    const cs = getComputedStyle(el);
    if (!['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis') return;
    if (el.scrollWidth > el.clientWidth + 2 && el.textContent.trim()) out.push({ kind: 'clipped', text: el.textContent.trim().slice(0, 40), el: path(el), over: el.scrollWidth - el.clientWidth });
  });
  // 輸入框裡的值被截斷（數字欄位太窄）
  document.querySelectorAll('input:not([type=checkbox]):not([type=hidden]), select').forEach(el => {
    if (!visible(el)) return;
    if (el.tagName === 'INPUT' && el.value && el.scrollWidth > el.clientWidth + 2) out.push({ kind: 'input', text: el.value.slice(0, 30), el: path(el), over: el.scrollWidth - el.clientWidth });
    if (el.tagName === 'SELECT') {
      const opt = el.options[el.selectedIndex];
      if (!opt) return;
      const c = document.createElement('canvas').getContext('2d');
      const cs = getComputedStyle(el);
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const need = c.measureText(opt.text).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      if (need > el.clientWidth + 2) out.push({ kind: 'select', text: opt.text.slice(0, 30), el: path(el), over: Math.round(need - el.clientWidth) });
    }
  });
  return { W, scrollW: document.documentElement.scrollWidth, issues: out };
}
"""

async def act(pg, pid, step):
    """切換頁面內的不同狀態，讓每個區塊都被檢查到"""
    if pid == 'market':
        if step in ('bulk', 'data'):
            await pg.click(f'#tab-main-{step}'); await pg.wait_for_timeout(600)
            if step == 'bulk':
                for n in ('大地鼠', '哥布林', '迷你蝙蝠'):
                    await pg.click(f'#bk-cands [data-pick="{n}"]')
                await pg.click('#bk-kind button[value=item]'); await pg.click('#bk-cands [data-pick="水的水晶碎片"]')
                await pg.click('#bk-sel .bk-row:last-child [data-step="1"]')
                await pg.click('#bk-go'); await pg.wait_for_selector('.bk-group', timeout=15000); await pg.wait_for_timeout(300)
            if step == 'data':
                await pg.fill('#dm-text', '時間,商品,數量,單價,幣別\n2026-10-13 21:05,水的水晶碎片,5,880,魔幣\n2026-10-13 21:40,年獸,1,900,魔晶')
                await pg.click('#dm-import'); await pg.wait_for_timeout(300)
            return
        await pg.wait_for_selector('.mk-group', timeout=8000)
        await pg.evaluate("document.querySelector('#mk-adv').open = true")
        if step == 'history': await pg.click('#tab-history'); await pg.wait_for_timeout(500)
        if step == 'pricing':
            await pg.click('#tab-pricing'); await pg.wait_for_timeout(300)
            if await pg.query_selector('#tr-price'): await pg.fill('#tr-price', '123456'); await pg.wait_for_timeout(200)
        if step == 'need': await pg.select_option('#mk-view', 'need'); await pg.fill('#mk-need', '30'); await pg.wait_for_timeout(500)
        if step == 'watch':
            await pg.click('.watch-btn'); await pg.click('#tab-watch'); await pg.wait_for_timeout(300)
    if pid == 'pets':
        await pg.wait_for_selector('.pet-card', timeout=8000)
        if step in ('sim', 'cmp'):
            await pg.click('.pet-card'); await pg.wait_for_timeout(400)
            await pg.fill('#s-lv', '120'); await pg.select_option('#s-rm', '5'); await pg.click('[data-fill="1"]'); await pg.wait_for_timeout(300)
        if step == 'cmp':
            await pg.click('#add-cmp'); await pg.click('#tab-cmp'); await pg.wait_for_timeout(300)
    if pid == 'exchange' and step == 'filled':
        await pg.click('#fiat-seg button[value=KRW]')
        await pg.fill('#c-coin', '12500萬'); await pg.fill('#s-crystal', '12345'); await pg.fill('#s-coin', '4321萬')
        await pg.fill('#batch tr:first-child [data-k=name]', '水的水晶碎片（測試很長的名稱）')
        await pg.fill('#batch tr:first-child [data-k=crystal]', '123456'); await pg.fill('#batch tr:first-child [data-k=coin]', '98765432')
        await pg.wait_for_timeout(300)
    if pid == 'damage' and step == 'magic':
        await pg.click('#tab-magic'); await pg.click('#m-caster button[value=pet]'); await pg.check('#m-pet'); await pg.wait_for_timeout(300)
    if pid == 'damage' and step == 'pet':
        await pg.check('#p-pet'); await pg.select_option('#sk-type', 'huixuan'); await pg.wait_for_timeout(300)
    if pid == 'remodel' and step == 'adv':
        await pg.click('#farm-title ~ details > summary'); await pg.fill('#f-runs', '100000'); await pg.fill('#t-set', '123456789'); await pg.wait_for_timeout(800)
    if pid == 'exchange' and step == 'tip':
        await pg.click('#rate-title .tip > summary'); await pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); await pg.wait_for_timeout(300)
    if pid == 'damage' and step == 'formula':
        await pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); await pg.click('.dmg-result .tip > summary >> visible=true'); await pg.wait_for_timeout(300)
    if pid == 'maze' and step == 'demo':
        await pg.click('#mz-demo'); await pg.wait_for_timeout(4000)
    if pid == 'maze' and step in ('result', 'trip'):
        await pg.click('#mz-demo'); await pg.wait_for_timeout(2500); await pg.click('#mz-runend'); await pg.wait_for_timeout(600)
    if pid == 'maze' and step == 'trip':
        await pg.click('#sheet-mzresult [data-act=close]'); await pg.wait_for_timeout(300)      # 關掉結算畫面才能填打包
        await pg.fill('#mz-pack-name', '測試迷宮'); await pg.fill('#mz-pack-reset', '2026-10-14T22:30:15'); await pg.click('#mz-pack-go'); await pg.wait_for_timeout(400)
    if pid == 'damage' and step == 'dummy':
        await pg.click('#dm-hit10'); await pg.wait_for_timeout(2200)
    if pid == 'remodel' and step == 'sim':
        await pg.select_option('#sim-n', '20'); await pg.click('#sim-go'); await pg.wait_for_timeout(1800)
    if pid == 'home' and step == 'game':
        await pg.click('.top-actions .game-btn'); await pg.wait_for_timeout(500)
    if pid == 'home' and step == 'more':
        await pg.click('.tabbar [data-act=more]'); await pg.wait_for_timeout(400)
    if pid == 'home' and step == 'settings':
        await pg.click('.top-actions [data-act=settings]'); await pg.wait_for_timeout(400)

PLAN = [
    ('home', '/', ['base', 'more', 'settings', 'game']),
    ('market', '/market/?q=%E6%B0%B4%E6%99%B6', ['base', 'history', 'pricing', 'need', 'watch', 'bulk', 'data']),
    ('market2', '/market/?kind=pet&race=%E9%87%8E%E7%8D%B8%E7%B3%BB', ['base']),
    ('exchange', '/exchange/', ['base', 'filled', 'tip']),
    ('pets', '/pets/', ['base', 'sim', 'cmp']),
    ('remodel', '/remodel/', ['base', 'adv', 'sim']),
    ('damage', '/damage/', ['base', 'pet', 'magic', 'formula', 'dummy']),
    ('maze', '/maze/', ['base', 'demo', 'result', 'trip']),
    ('posts', '/posts/', ['base']),
    ('post', '/posts/site-guide/', ['base']),
    ('404', '/nope/', ['base']),
]

async def main():
    total = 0
    report = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for width in (360, 390):
            for lang in ('zh', 'ko'):
                for theme in ('light', 'dark'):
                    if theme == 'dark' and width == 360: continue
                    ctx = await b.new_context(viewport={'width': width, 'height': 800}, is_mobile=True, has_touch=True, device_scale_factor=2,
                                              color_scheme=theme, locale='ko-KR' if lang == 'ko' else 'zh-TW', timezone_id='Asia/Taipei')
                    await ctx.add_init_script("try{localStorage.setItem('sc.langHint','1');localStorage.setItem('sc.welcome','1')}catch(e){}")
                    for pid, path, steps in PLAN:
                        for step in steps:
                            pg = await ctx.new_page()
                            url = BASE + ('/ko' if lang == 'ko' and pid != '404' else '') + path
                            await pg.goto(url, wait_until='load')
                            try: await pg.wait_for_load_state('networkidle', timeout=8000)
                            except Exception: pass
                            await pg.wait_for_timeout(400)
                            try:
                                await act(pg, pid.rstrip('2'), step)
                                await pg.wait_for_timeout(300)
                            except Exception as e:
                                report.setdefault('_errors', []).append(f'{lang} {width} {pid} {step}: {e}')
                            res = await pg.evaluate(JS)
                            key = f'{width}-{lang}-{theme}-{pid}-{step}'
                            if res['issues'] or res['scrollW'] > res['W'] + 1:
                                report[key] = res
                                total += len(res['issues'])
                                if OUT:
                                    os.makedirs(OUT, exist_ok=True)
                                    await pg.screenshot(path=f'{OUT}/{key}.png', full_page=True)
                            await pg.close()
                    await ctx.close()
        await b.close()
    if not report:
        print('OK：手機版沒有文字超出底色框')
        return
    # 依元素彙整，方便閱讀
    agg = {}
    for key, res in report.items():
        if key == '_errors': continue
        for i in res['issues']:
            k = (i['kind'], i['el'], i.get('box', ''))
            a = agg.setdefault(k, {'n': 0, 'over': 0, 'text': i['text'], 'where': set(), 'dir': i.get('dir', '')})
            a['n'] += 1; a['over'] = max(a['over'], i['over']); a['where'].add(key.split('-', 3)[3] if key.count('-') >= 3 else key)
        if res['scrollW'] > res['W'] + 1:
            print('水平捲動：', key, res['scrollW'] - res['W'])
    for (kind, el, box), a in sorted(agg.items(), key=lambda x: -x[1]['over']):
        print(f"[{kind}] {el}{'  ⊂ ' + box if box else ''}  超出 {a['over']}px {a['dir']}  「{a['text']}」  ({a['n']} 次: {', '.join(sorted(a['where']))[:120]})")
    for e in report.get('_errors', []): print('動作失敗：', e)
    print(f'\n共 {len(agg)} 處')

asyncio.run(main())
