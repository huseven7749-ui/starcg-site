# 迷宮找樓梯：用假的遊戲資料夾測試自動讀取、跟隨換層、這趟探索、手動選檔
# 用法：python3 tests/maze_e2e.py http://127.0.0.1:8090 [截圖資料夾]
import base64, struct, sys, os, time, tempfile
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
MARK = 0xC003

def end_run(page):
    """結束探索；有結算畫面就順手關掉"""
    page.click('#mz-runend'); page.wait_for_timeout(300)
    if page.is_visible('#sheet-mzresult'):
        page.click('#sheet-mzresult [data-act="close"]'); page.wait_for_timeout(200)

def dat(w, h, floor, exits):
    n = w * h
    tile = [100] * n; obj = [0] * n; mark = [0] * n
    for e, s in floor: tile[s * w + e] = 2000
    for e, s, o in exits:
        i = s * w + e; tile[i] = 2000; mark[i] = MARK; obj[i] = o
    return b'MAP' + b'\0' * 9 + struct.pack('<ii', w, h) + struct.pack(f'<{n}H', *tile) + struct.pack(f'<{n}H', *obj) + struct.pack(f'<{n}H', *mark)

def corridor(points):
    cells = set()
    for (e0, s0), (e1, s1) in zip(points, points[1:]):
        for e in range(min(e0, e1), max(e0, e1) + 1):
            for s in range(min(s0, s1), max(s0, s1) + 1): cells.add((e, s))
    return cells

PATH = [(3, 3), (20, 3), (20, 12), (8, 12), (8, 22), (26, 22)]
F1a = dat(32, 28, corridor(PATH[:3]), [(3, 3, 12000)])
F1b = dat(32, 28, corridor(PATH), [(3, 3, 12000), (26, 22, 12002)])
F2 = dat(30, 30, corridor([(5, 5), (5, 20), (18, 20)]), [(5, 5, 12001), (12, 20, 0)])
b64 = lambda b: base64.b64encode(b).decode()

FAKE = r'''
window.__files = {};
const dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
window.__put = (shard, name, b64, lm) => { (window.__files[shard] ||= {})[name] = { bytes: dec(b64), lm }; };
const fileH = (shard, name) => ({ kind: 'file', name, getFile: async () => { const f = window.__files[shard][name]; return new File([f.bytes], name, { lastModified: f.lm }); } });
const shardDir = shard => ({ kind: 'directory', name: shard,
  async getDirectoryHandle(n) { throw new DOMException('x', 'NotFoundError'); },
  async *entries() { for (const n of Object.keys(window.__files[shard] || {})) yield [n, fileH(shard, n)]; } });
const oneDir = { kind: 'directory', name: '1', async getDirectoryHandle() { throw new DOMException('x', 'NotFoundError'); },
  async *entries() { for (const s of Object.keys(window.__files)) if (s !== '0') yield [s, shardDir(s)]; } };
const mapDir = { kind: 'directory', name: 'map', async getDirectoryHandle(n) { if (n === '1') return oneDir; throw new DOMException('x', 'NotFoundError'); },
  async *entries() { yield ['0', shardDir('0')]; yield ['1', oneDir]; yield ['readme.txt', { kind: 'file', name: 'readme.txt' }]; } };
window.__root = { kind: 'directory', name: 'StarCG_Data',
  async getDirectoryHandle(n) { if (n === 'map') return mapDir; throw new DOMException('x', 'NotFoundError'); },
  async *entries() { yield ['map', mapDir]; } };
'''

errors, fails = [], []
def check(cond, msg):
    print(('✓ ' if cond else '✗ ') + msg)
    if not cond: fails.append(msg)

def wait_text(page, sel, text, timeout=6000):
    try:
        page.wait_for_function('([s, t]) => (document.querySelector(s)?.textContent || "").includes(t)', arg=[sel, text], timeout=timeout)
        return True
    except Exception:
        return False

with sync_playwright() as p:
    br = p.chromium.launch()
    for theme in ['light', 'dark']:
        ctx = br.new_context(viewport={'width': 1366, 'height': 900}, color_scheme=theme)
        ctx.add_init_script("try{localStorage.setItem('sc.welcome','1')}catch(e){}")
        page = ctx.new_page()
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '/maze/')
        page.evaluate(f"document.documentElement.dataset.theme = '{theme}'")
        if theme == 'light':
            check(page.is_visible('#mz-start') and page.is_visible('#mz-link'), '開始卡片與「連結遊戲資料夾」按鈕')
            if SHOTS: page.screenshot(path=f'{SHOTS}/maze-start-{theme}.png', full_page=False)
            # 假資料夾：S1 有一層探索到一半
            page.evaluate(FAKE)
            now = int(time.time() * 1000)
            page.evaluate(f"__put('1', '30101.dat', '{b64(F1a)}', {now - 60000})")
            page.evaluate(f"__put('0', '99999.dat', '{b64(F2)}', {now})")      # map/0 不是分流，不能被當成目前樓層
            page.evaluate('__mzConnect(__root)')
            page.wait_for_selector('#mz-live:not([hidden])')
            check(wait_text(page, '#mz-state', '即時監看中'), '狀態：即時監看中')
            check(page.is_visible('#mz-begin') and page.is_hidden('#mz-stage'), '還沒開始探索：顯示開始面板、不顯示地圖')
            if SHOTS: page.screenshot(path=f'{SHOTS}/maze-begin-{theme}.png', full_page=False)
            # 已在迷宮中：從第 3 層開始（目前最新的檔 30101 就是第 3 層）
            page.fill('#mz-begin-n', '3'); page.click('#mz-begin-mid')
            check(wait_text(page, '#mz-title', '第 3 層'), '已在迷宮中：從第 3 層開始，目前地圖標成第 3 層')
            check(wait_text(page, '#mz-exits', '上樓梯'), '標出上樓梯')
            check(page.inner_text('#mz-exits').count('上樓梯') == 1 and '下樓梯' not in page.inner_text('#mz-exits'), '只有上樓梯（還沒走到下樓梯）')
            xy = page.inner_text('#mz-exits .mz-xy')
            check('3' in xy, f'座標顯示：{xy.split()}')
            check('舊記錄' not in page.inner_text('#mz-exits'), '中途開始：目前這層不會標成舊記錄')
            page.evaluate(f"__put('1', '30101.dat', '{b64(F1b)}', {now - 30000})")
            check(wait_text(page, '#mz-exits', '下樓梯'), '地圖更新後出現下樓梯')
            check('32 × 28' in page.inner_text('#mz-info'), '這層資訊：地圖大小 32 × 28')
            # 走到新的一層 → 第 4 層
            page.evaluate(f"__put('1', '30102.dat', '{b64(F2)}', {now - 10000})")
            check(wait_text(page, '#mz-title', '第 4 層'), '自動跟隨到新樓層，標成第 4 層')
            check(wait_text(page, '#mz-exits', '水晶'), '新樓層標出水晶')
            check(page.locator('#mz-floors .mz-chip').count() == 2, '樓層列只有這次探索的 2 層')
            page.click('#mz-floors .mz-chip:not(.live)')
            check(wait_text(page, '#mz-title', '第 3 層'), '點選舊樓層可以回看')
            check(not page.is_checked('#mz-follow'), '手動選樓層後關閉自動跟隨')
            page.check('#mz-follow')
            check(wait_text(page, '#mz-title', '第 4 層'), '打開自動跟隨後回到最新樓層')
            # 遊戲回到第 3 層：重寫檔案（內容一樣）→ 畫面跟著切回去
            page.evaluate(f"__put('1', '30101.dat', '{b64(F1b)}', {now - 5000})")
            check(wait_text(page, '#mz-title', '第 3 層'), '走回舊樓層（檔案重寫但內容相同）會跟著切')
            page.click('#mz-exits .mz-exit-go >> nth=0')
            check(page.locator('#mz-exits .mz-exit.on').count() == 1, '點樓梯清單會選取並聚焦')
            # 自己標記寶箱：選「寶箱」→ 點地圖
            page.click('#mz-mark [data-type=chest]')
            box = page.locator('#mz-canvas').bounding_box()
            page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            page.wait_for_timeout(300)
            check('寶箱' in page.inner_text('#mz-exits') and page.locator('#mz-exits .mz-exit.mine').count() == 1, '手動標記寶箱出現在清單')
            check(page.get_attribute('#mz-mark [data-type=chest]', 'aria-pressed') == 'false', '放完一個標記後自動退出標記模式')
            page.click('#mz-exits [data-del]')
            check(page.locator('#mz-exits .mz-exit.mine').count() == 0, '可以刪除自己的標記')
            page.click('#mz-mark [data-type=mob]'); page.mouse.click(box['x'] + box['width'] / 2 + 30, box['y'] + box['height'] / 2); page.wait_for_timeout(300)
            check('怪物' in page.inner_text('#mz-exits'), '標記怪物')
            # NPC：點了會問名稱（可留空）
            page.once('dialog', lambda d: d.accept('商人'))
            page.click('#mz-mark [data-type=npc]'); page.mouse.click(box['x'] + box['width'] / 2 - 30, box['y'] + box['height'] / 2); page.wait_for_timeout(300)
            check('商人' in page.inner_text('#mz-exits') and 'NPC' in page.inner_text('#mz-exits'), '標記 NPC（含名稱）')
            page.click('#mz-view button[value=grid]')
            check(not page.eval_on_selector('#mz-stage', 'e => e.classList.contains("is-iso")'), '切換為正方格')
            page.click('#mz-view button[value=iso]')
            box = page.locator('#mz-canvas').bounding_box()
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            page.wait_for_timeout(200)
            check(page.is_visible('#mz-coord') and '東' in page.inner_text('#mz-coord'), '滑鼠移到地圖上顯示東南座標')
            if SHOTS:
                page.mouse.move(5, 5); page.wait_for_timeout(300)
                page.screenshot(path=f'{SHOTS}/maze-run-{theme}.png', full_page=True)
            # 結束探索 → 清掉；之後同一座迷宮再有動靜 → 自動接回
            page.click('#mz-runend')
            check(page.is_visible('#mz-begin') and page.locator('#mz-floors .mz-chip').count() == 0, '結束探索後清掉樓層、回到開始面板')
            # 結算畫面：評級、統計，關掉後才能操作打包
            page.wait_for_selector('#sheet-mzresult[open]')
            grade = page.get_attribute('#sheet-mzresult .mr-grade', 'data-g')
            stats = page.inner_text('#sheet-mzresult .mr-stats')
            check(grade in ('S', 'A', 'B', 'C') and '2' in stats, f'結算畫面：評級 {grade}、統計 2 層')
            page.click('#sheet-mzresult [data-act="close"]'); page.wait_for_timeout(200)
            check(not page.is_visible('#sheet-mzresult'), '關閉結算畫面')
            # 打包分享：三項填好才出現按鈕
            check(page.is_visible('#mz-pack') and page.is_hidden('#mz-pack-go'), '結束後出現打包面板，還沒填資料不給打包')
            check(page.input_value('#mz-pack-shard') == 'S1', '分流自動帶入')
            page.fill('#mz-pack-name', '測試迷宮'); page.fill('#mz-pack-reset', '2026-10-14T22:30:15')
            check(page.is_visible('#mz-pack-go'), '三項填好後出現一鍵打包')
            page.click('#mz-pack-go')
            txt = page.input_value('#mz-pack-text')
            check(page.is_visible('#mz-pack-out') and '【迷宮分享】測試迷宮 · S1' in txt and '10/14 22:30:15' in txt, '打包文字含名稱、分流、重製時間')
            check('第 3 層' in txt and '第 4 層' in txt and '下樓梯　東26 南22' in txt and 'NPC「商人」　東' in txt and '怪物　東' in txt, '打包文字含每層樓梯座標與自己的標記')
            page.evaluate("navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }")
            page.click('#mz-pack-copy'); page.wait_for_timeout(200)
            check(page.evaluate('window.__clip') == txt, '一鍵複製整段文字')
            page.evaluate(f"__put('1', '30102.dat', '{b64(F2)}', {now - 1000})")      # 回到第 4 層（內容一樣＝同一座迷宮）
            check(wait_text(page, '#mz-title', '第 4 層'), '重置前回到同一座迷宮：自動接回第 4 層')
            check(page.is_hidden('#mz-begin') and '已接回' in page.inner_text('#mz-runline'), '狀態列顯示已接回上次的探索')
            check(page.is_hidden('#mz-pack'), '接回探索後打包面板先收起來')
            page.click('#mz-floors .mz-chip >> nth=0'); page.wait_for_timeout(400)
            check('怪物' in page.inner_text('#mz-exits'), '接回後自己的標記也回來了')
            # 迷宮重置：同一個檔名但地圖不一樣 → 不會誤接
            end_run(page)
            F3 = dat(30, 30, corridor([(2, 2), (25, 2), (25, 25)]), [(2, 2, 12001), (25, 25, 12003)])
            page.evaluate(f"__put('1', '30102.dat', '{b64(F3)}', {now})")
            page.wait_for_timeout(1200)
            check(page.is_visible('#mz-begin'), '迷宮重置後（同檔名、不同地圖）不會誤接舊探索')
            # 進迷宮前開始：從第 1 層
            page.click('#mz-begin-fresh')
            check(wait_text(page, '#mz-floors', '進迷宮後'), '進迷宮前開始：等待進入')
            page.evaluate(f"__put('1', '30103.dat', '{b64(F1a)}', {now + 1000})")
            check(wait_text(page, '#mz-title', '第 1 層'), '進迷宮後第一張地圖＝第 1 層')
            page.evaluate(f"__put('1', '30103.dat', '{b64(F1b)}', {now + 2000})")
            page.wait_for_timeout(800)
            check('舊記錄' not in page.inner_text('#mz-exits') and '下樓梯' in page.inner_text('#mz-exits'), '新探索的樓梯不會標成舊記錄')
            end_run(page)
            # 手動選檔
            tmp = tempfile.mkdtemp()
            fp = os.path.join(tmp, '40001.dat'); open(fp, 'wb').write(F1b)
            bad = os.path.join(tmp, 'note.txt'); open(bad, 'w').write('x')
            page.set_input_files('#mz-file', [fp])
            check(wait_text(page, '#mz-title', '40001'), '手動選擇 .dat 檔可以查看')
            check(page.is_hidden('#mz-begin'), '手動選檔時不顯示開始面板')
            page.click('#mz-unlink')
            check(page.is_visible('#mz-start'), '中斷連結回到開始畫面')
        # 示範
        page.click('#mz-demo')
        page.wait_for_selector('#mz-live:not([hidden])')
        page.wait_for_timeout(9000 if theme == 'light' else 6000)
        check(wait_text(page, '#mz-state', '示範中'), f'示範模式（{theme}）')
        check(wait_text(page, '#mz-title', '第 '), f'示範自動開始探索並標樓層（{theme}）')
        check(page.locator('#mz-exits .mz-exit').count() >= 1, f'示範有標出樓梯（{theme}）')
        if SHOTS:
            page.mouse.move(5, 5)
            page.screenshot(path=f'{SHOTS}/maze-demo-{theme}.png', full_page=True)
        ctx.close()
    # 手機
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script("try{localStorage.setItem('sc.welcome','1')}catch(e){}")
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/maze/')
    if SHOTS: page.screenshot(path=f'{SHOTS}/maze-start-mobile.png', full_page=True)
    page.click('#mz-demo')
    page.wait_for_timeout(7000)
    page.evaluate("document.querySelector('#mz-begin').hidden = false")
    over = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check(over <= 0, f'手機版沒有橫向捲動（{over}）')
    if SHOTS: page.screenshot(path=f'{SHOTS}/maze-demo-mobile.png', full_page=True)
    # 首頁工具列
    for vw in [1366, 1024, 390]:
        c2 = br.new_context(viewport={'width': vw, 'height': 900})
        c2.add_init_script("try{localStorage.setItem('sc.welcome','1')}catch(e){}")
        pg = c2.new_page(); pg.goto(BASE + '/')
        n = pg.locator('.tool-groups .tool').count()
        sizes = pg.evaluate("[...new Set([...document.querySelectorAll('.tool-groups .tool')].map(e => Math.round(e.getBoundingClientRect().height) + 'x' + Math.round(e.getBoundingClientRect().width)))]")
        groups = pg.locator('.tool-group').count()
        check(n == 11 and groups == 3 and len(sizes) == 1, f'首頁工具 {n} 個、{groups} 個大分類、卡片尺寸一致 {sizes}（寬 {vw}）')
        if SHOTS and vw == 1366: pg.screenshot(path=f'{SHOTS}/home-tools.png', clip={'x': 0, 'y': 380, 'width': 1366, 'height': 520})
        c2.close()
    br.close()

errors = [e for e in errors if 'favicon' not in e]
check(not errors, '沒有 JS 錯誤' + ('' if not errors else '：' + ' | '.join(errors[:5])))
print('\n全部通過' if not fails else f'\n{len(fails)} 項失敗')
sys.exit(1 if fails else 0)
