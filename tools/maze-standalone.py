# 把「迷宮找樓梯」打包成單一 HTML 檔（樣式、腳本、字型、角色圖全部內嵌），
# 不用上傳主機、直接用 Chrome／Edge 開啟就能連結遊戲資料夾測試。
# 用法：node build.mjs --preview && python3 tools/maze-standalone.py out/迷宮找樓梯-測試版.html
import base64, mimetypes, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PREVIEW = ROOT / 'preview'
SRC = ROOT / 'src' / 'assets'
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'out' / '迷宮找樓梯-測試版.html')

html = (PREVIEW / 'maze' / 'index.html').read_text(encoding='utf-8')

def data_uri(p: pathlib.Path):
    mime = mimetypes.guess_type(p.name)[0] or {'.woff2': 'font/woff2'}.get(p.suffix, 'application/octet-stream')
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()

# 1) 樣式：字型改成內嵌
css = (SRC / 'css' / 'app.css').read_text(encoding='utf-8')
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css = re.sub(r'url\(\.\./(fonts/[\w.-]+)\)', lambda m: f'url({data_uri(SRC / m.group(1))})', css)
html = re.sub(r'<link rel="preload"[^>]*as="font"[^>]*>', '', html)
html = re.sub(r'<link rel="stylesheet" href="[^"]*app\.[\w]+\.css">', lambda m: '<style>' + css.replace('</', '<\\/') + '</style>', html)

# 2) 腳本：core + mazedat + maze 合併成一段 module（拿掉 import／export）
def mod(name):
    s = (SRC / 'js' / name).read_text(encoding='utf-8')
    s = re.sub(r'^import .*?;\s*$', '', s, flags=re.M)
    s = re.sub(r'^export (async function|function|const|let|class)', r'\1', s, flags=re.M)
    return s
js = '\n'.join(mod(n) for n in ['core.js', 'mazedat.js', 'maze.js'])
html = re.sub(r'<script type="module" src="[^"]*"></script>\s*', '', html)
html = html.replace('</body>', '<script type="module">' + js.replace('</script', '<\\/script') + '</script></body>')

# 3) 角色圖、圖示：改成內嵌
def img(m):
    rel = m.group(1)
    p = PREVIEW / 'assets' / rel
    return data_uri(p) if p.exists() else m.group(0)
html = re.sub(r'(?:\.\./)+assets/(img/[\w./-]+\.(?:gif|png))', img, html)
html = re.sub(r'<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>', '', html)

# 4) 站內連結改成正式網址
html = re.sub(r'href="(?:\.\./)+(?:(ko)/)?(?:([\w-]+)/)?index\.html"', lambda m: 'href="https://starcg.online/' + (m.group(1) + '/' if m.group(1) else '') + (m.group(2) + '/' if m.group(2) else '') + '"', html)
html = re.sub(r'href="(?:\.\./)+([\w-]+)\.html"', r'href="https://starcg.online/\1"', html)
html = html.replace('<html', '<html data-standalone="1"', 1)
html = html.replace('<body ', '<body data-standalone="1" ', 1)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
print(f'{out}  {out.stat().st_size // 1024} KB')
