# 從影片本身偵測字幕切換時間，重寫 SRT
# （Playwright 錄影的時間軸相對實際操作有 0～3 秒不固定的延遲，記錄的時間點不能直接用；
#   這裡在氣泡框最後一行文字的固定區域找畫面穩定的段落，再用記錄的順序與間隔（動態規劃）對上去）
# 用法：python3 srt_from_video.py 影片.mp4 記錄的.srt 輸出.srt [--dump]
import sys, subprocess, numpy as np
mp4, srt_in, srt_out = sys.argv[1:4]
FPS = 20
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', mp4, '-vf', f'fps={FPS},crop=226:34:115:615,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
N = len(raw) // (226 * 34); F = (np.frombuffer(raw, dtype=np.uint8)[:N * 226 * 34].reshape(N, 34, 226) < 150)   # 只看深色的字，忽略氣泡透出的底色
del raw
diff = lambda a, b: np.count_nonzero(a != b) / a.size
total = N / FPS
blocks = open(srt_in, encoding='utf-8-sig').read().strip().split('\n\n')
def sec(t): h, m, s = t.split(':'); s, ms = s.split(','); return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000
ents = []
for blk in blocks:
    l = blk.split('\n'); a, b = l[1].split(' --> '); ents.append((sec(a), '\n'.join(l[2:])))
# 1. 畫面穩定段落（相鄰幀幾乎一樣）
segs = []; s = 0
for i in range(1, N):
    if diff(F[i], F[i - 1]) > 0.015: segs.append((s, i)); s = i
segs.append((s, N))
segs = [(a, b) for a, b in segs if b - a >= 4]
reps = [F[(a + b) // 2] for a, b in segs]
merged = []
for (a, b), r in zip(segs, reps):
    if merged and diff(merged[-1][2], r) < 0.015 and a - merged[-1][1] < 3.0 * FPS: merged[-1][1] = b
    else: merged.append([a, b, r])
bounds = [a / FPS for a, b, r in merged if b - a >= 0.7 * FPS and r.mean() > 0.005]   # 氣泡不見（換頁中）的段落不算
print('段落數', len(merged), '≥1s 的', len(bounds), '字幕句數', len(ents), file=sys.stderr)
if '--dump' in sys.argv:
    for a, b, r in merged: print(f'{a/FPS:.2f}-{b/FPS:.2f} ({(b-a)/FPS:.1f}s) dark={r.mean():.4f}')
    sys.exit()
# 2. 動態規劃：每句對一個段落起點，順序遞增，延遲變化越小越好（換頁後延遲會突然變小，所以往前允許多一點）
K = len(ents); M = len(bounds); INF = 1e9
cost = np.full((K, M), INF); back = np.full((K, M), -1, dtype=int)
for j in range(M):
    lag = bounds[j] - ents[0][0]
    if -0.5 <= lag <= 1.5: cost[0, j] = abs(lag)
for k in range(1, K):
    gap = ents[k][0] - ents[k - 1][0]
    for j in range(M):
        for i in range(j):
            if cost[k - 1, i] >= INF: continue
            dl = (bounds[j] - bounds[i]) - gap          # 延遲變化
            if not (-2.8 <= dl <= 1.6): continue
            c = cost[k - 1, i] + abs(dl) + (0 if bounds[j] - bounds[i] >= 1.2 else 5)
            if c < cost[k, j]: cost[k, j] = c; back[k, j] = i
for k in range(K):
    if cost[k].min() >= INF:
        prev_ok = [bounds[i] for i in range(M) if cost[k - 1, i] < INF]
        print(f'第 {k + 1} 句對不上：記錄 {ents[k][0]:.2f}，上一句候選 {prev_ok}，間隔 {ents[k][0] - ents[k - 1][0]:.2f}', file=sys.stderr)
        print('候選段落起點：', [round(b, 2) for b in bounds if ents[k][0] - 3 < b < ents[k][0] + 8], file=sys.stderr); sys.exit(1)
j = int(np.argmin(cost[K - 1]))
pick = [0] * K
for k in range(K - 1, -1, -1): pick[k] = j; j = back[k, j]
starts = [bounds[p] for p in pick]
def ts(x):
    ms = int(round(max(0.0, min(total, x)) * 1000)); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'
out = []
for k, (st, (a, text)) in enumerate(zip(starts, ents)):
    e = starts[k + 1] - 0.05 if k + 1 < K else total - 0.3
    out.append(f'{k + 1}\n{ts(st)} --> {ts(e)}\n{text}\n')
open(srt_out, 'w', encoding='utf-8-sig').write('\n'.join(out))
for k, (st, (a, t)) in enumerate(zip(starts, ents)): print(k + 1, f'{a:7.2f} -> {st:7.2f} (+{st - a:.2f})', t[:16])
