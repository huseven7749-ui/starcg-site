"""價格提醒開通碼管理（改完要 commit＋push，部署後生效）
  python3 tools/alert-code.py new        產生一組新開通碼（印出開通碼與會員編號）
  python3 tools/alert-code.py revoke M001 停用／ python3 tools/alert-code.py restore M001 恢復
  python3 tools/alert-code.py reset M001  解除裝置綁定（會員可在新裝置重新輸入同一組開通碼）
  python3 tools/alert-code.py list
開通碼只存雜湊（sha256('sc-alert|c|開通碼')），和 static/api/_alerts.php 的 alerts_hash 一致。
"""
import sys, json, re, secrets, hashlib, pathlib, datetime
F = pathlib.Path(__file__).resolve().parent.parent / 'static/api/_alert_codes.php'
ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
src = F.read_text(encoding='utf-8')
m = re.search(r"<<<'JSON'\n(.*?)\nJSON, true\)", src, re.S)
data = json.loads(m.group(1))
h = lambda s: hashlib.sha256(('sc-alert|' + s).encode()).hexdigest()

def save():
    body = json.dumps(data, ensure_ascii=False, indent=1)
    F.write_text(src[:m.start(1)] + body + src[m.end(1):], encoding='utf-8')

def find(no):
    for e in data:
        if e['no'] == no.upper(): return e
    sys.exit(f'找不到 {no}')

cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
if cmd == 'new':
    raw = ''.join(secrets.choice(ABC) for _ in range(12))
    code = f'{raw[:4]}-{raw[4:8]}-{raw[8:]}'
    ch = h('c|' + code)
    no = 'M%03d' % (max([int(e['no'][1:]) for e in data] or [0]) + 1)
    data.append({'id': ch[:16], 'code': ch, 'no': no, 'created': datetime.date.today().isoformat()})
    save(); print(no, code)
elif cmd in ('revoke', 'restore'):
    e = find(sys.argv[2]); e['revoked'] = cmd == 'revoke'; save(); print(e['no'], '已停用' if e['revoked'] else '已恢復')
elif cmd == 'reset':
    e = find(sys.argv[2]); e['reset'] = int(e.get('reset', 0)) + 1; save(); print(e['no'], '已解除裝置綁定')
else:
    for e in data: print(e['no'], e['created'], '停用' if e.get('revoked') else '', ('reset×%d' % e['reset']) if e.get('reset') else '')
