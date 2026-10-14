"""最小化的 brotli 相容層：沒有 Python brotli 套件時，改用 Node.js 內建 zlib 做壓縮／解壓。
只供 fontTools 產生 WOFF2 使用。"""
import subprocess

MODE_GENERIC, MODE_TEXT, MODE_FONT = 0, 1, 2
_JS = r"""
const z=require('zlib');const c=[];process.stdin.on('data',d=>c.push(d)).on('end',()=>{const b=Buffer.concat(c);
const op=process.argv[1];const mode=+process.argv[2];
const out=op==='c'?z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_MODE]:mode,[z.constants.BROTLI_PARAM_QUALITY]:11,[z.constants.BROTLI_PARAM_SIZE_HINT]:b.length}}):z.brotliDecompressSync(b);
process.stdout.write(out);});
"""

def _run(op, data, mode=0):
    return subprocess.run(['node', '-e', _JS, op, str(mode)], input=bytes(data), capture_output=True, check=True).stdout

def compress(data, mode=MODE_GENERIC, quality=11, lgwin=22, lgblock=0):
    return _run('c', data, mode)

def decompress(data):
    return _run('d', data)
