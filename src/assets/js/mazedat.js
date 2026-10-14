// 迷宮地圖檔（StarCG_Data\map\分流\*.dat）解析：純函式，瀏覽器與 Node 測試共用。
// 檔案格式：前 20 bytes 為檔頭（12 bytes 識別＋寬 int32＋高 int32，小端序），
// 之後依序是三層 uint16（小端序）：地面、物件、標記，每層 寬×高 格，索引 = 南 × 寬 + 東。
// 標記為 0xC003 的格子是「出入口」（樓梯、水晶、傳送點），再用物件編號分辨是哪一種。

export const HEADER = 20;
export const MARK_EXIT = 0xC003;
export const EMPTY_TILES = [0, 100];          // 沒有地面（未探索或不能走）
export const MARK_POI = 0xC002;              // 地板上的特殊標記（可能是怪物／事件點，待確認）
export const KIND = { OTHER: 0, UP: 1, DOWN: 2, CRYSTAL: 3, WARP: 4, POI: 5 };
export const KIND_NAMES = ['other', 'up', 'down', 'crystal', 'warp', 'poi'];

// 依物件編號判斷出入口種類（遊戲內樓梯圖檔編號）
export function exitKind(obj) {
  const v = obj | 0;
  if (v <= 14676) {
    if (v <= 12003) {
      if (v === 0) return KIND.WARP;
      if (v - 12000 <= 1) return KIND.UP;
      if (v - 12002 <= 1) return KIND.DOWN;
      return KIND.OTHER;
    }
    const a = v - 13268; if (a >= 0 && a < 8) return a % 2 ? KIND.DOWN : KIND.UP;
    const b = v - 13996; if (b >= 0 && b < 4) return b % 2 ? KIND.DOWN : KIND.UP;
    return v === 14676 ? KIND.WARP : KIND.OTHER;
  }
  if (v <= 15892) {
    if (v === 15561) return KIND.UP;
    if (v === 15562) return KIND.DOWN;
    const c = v - 15887; if (c >= 0 && c < 6) return c % 2 ? KIND.DOWN : KIND.UP;
    return KIND.OTHER;
  }
  if (v <= 16615) {
    if (v - 16610 <= 1) return KIND.UP;
    if (v - 16612 <= 3) return KIND.DOWN;
    return KIND.OTHER;
  }
  if (v - 16626 <= 3) return KIND.UP;
  const d = v - 17952; if (d >= 0 && d < 48) return d % 2 ? KIND.DOWN : KIND.UP;
  return KIND.OTHER;
}
// 出入口格子：沒有物件的是水晶
export const classify = (obj, mark) => (mark !== MARK_EXIT ? null : obj ? exitKind(obj) : KIND.CRYSTAL);
export const isFloor = tile => tile !== 0 && tile !== 100;

const asBytes = b => (b instanceof Uint8Array ? b : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));

// 解析：成功回傳 { ok:true, width, height, tile, obj, mark, exits, bbox, floor }；失敗 { ok:false, code }
export function parseDat(input, { maxCells = 4_000_000 } = {}) {
  const u8 = asBytes(input);
  if (u8.length < HEADER) return { ok: false, code: 'short' };
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const width = dv.getInt32(12, true), height = dv.getInt32(16, true);
  if (width <= 0 || height <= 0) return { ok: false, code: 'size' };
  const n = width * height;
  if (n > maxCells) return { ok: false, code: 'big' };
  if (u8.length < HEADER + 6 * n) return { ok: false, code: 'partial' };   // 遊戲還在寫入，稍後再讀
  const tile = new Uint16Array(n), obj = new Uint16Array(n), mark = new Uint16Array(n);
  const o1 = HEADER, o2 = HEADER + 2 * n, o3 = HEADER + 4 * n;
  const exits = [];
  let floor = 0, minE = width, maxE = -1, minS = height, maxS = -1;
  for (let i = 0; i < n; i++) {
    const t = dv.getUint16(o1 + 2 * i, true), b = dv.getUint16(o2 + 2 * i, true), m = dv.getUint16(o3 + 2 * i, true);
    tile[i] = t; obj[i] = b; mark[i] = m;
    const e = i % width, s = (i / width) | 0;
    const ex = m === MARK_EXIT;
    if (m === MARK_POI) exits.push({ e, s, i, kind: KIND.POI, obj: b, mark: m });
    if (isFloor(t) || ex) {
      if (isFloor(t)) floor++;
      if (e < minE) minE = e; if (e > maxE) maxE = e;
      if (s < minS) minS = s; if (s > maxS) maxS = s;
    }
    if (ex) exits.push({ e, s, i, kind: b ? exitKind(b) : KIND.CRYSTAL, obj: b });
  }
  const bbox = maxE < 0 ? null : { minE, maxE, minS, maxS };
  return { ok: true, width, height, tile, obj, mark, exits, bbox, floor, header: u8.slice(0, 12), trailing: u8.length - (HEADER + 6 * n) };
}

// 與「這趟開始時」的內容比較：回傳每格是否為這趟新出現（1）或沿用舊記錄（0）
export function freshMask(base, cur) {
  const n = cur.width * cur.height;
  const m = new Uint8Array(n);
  if (!base || base.width !== cur.width || base.height !== cur.height) { m.fill(1); return m; }
  for (let i = 0; i < n; i++) m[i] = base.tile[i] !== cur.tile[i] || base.obj[i] !== cur.obj[i] || base.mark[i] !== cur.mark[i] ? 1 : 0;
  return m;
}

// 分流：檔案所在資料夾名稱為數字 N → SN
export const shardOf = dirName => (/^\d{1,4}$/.test(dirName || '') && Number(dirName) > 0 ? 'S' + Number(dirName) : '');

// 產生地圖檔（測試與示範用）
export function encodeDat({ width, height, tile, obj, mark, header }) {
  const n = width * height;
  const buf = new Uint8Array(HEADER + 6 * n);
  const dv = new DataView(buf.buffer);
  buf.set(header || [0x4D, 0x41, 0x50], 0);
  dv.setInt32(12, width, true); dv.setInt32(16, height, true);
  for (let i = 0; i < n; i++) {
    dv.setUint16(HEADER + 2 * i, tile ? tile[i] : 100, true);
    dv.setUint16(HEADER + 2 * n + 2 * i, obj ? obj[i] : 0, true);
    dv.setUint16(HEADER + 4 * n + 2 * i, mark ? mark[i] : 0, true);
  }
  return buf;
}

// 示範迷宮：可重現的隨機迷宮（挖牆演算法），放上下樓梯與水晶；explored 0–1 控制已探索比例
export function demoMaze({ cells = 14, seed = 7, explored = 1, withCrystal = true, layout = 0 } = {}) {
  let r = seed >>> 0;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  const size = cells * 2 + 1, width = size + 4, height = size + 4;
  const n = width * height;
  const tile = new Uint16Array(n).fill(100), obj = new Uint16Array(n), mark = new Uint16Array(n);
  const open = new Uint8Array(n);
  const at = (e, s) => (s + 2) * width + (e + 2);
  const seen = new Uint8Array(cells * cells);
  const stack = [[0, 0]]; seen[0] = 1; open[at(1, 1)] = 1;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < cells && y < cells && !seen[y * cells + x]);
    if (!nb.length) { stack.pop(); continue; }
    const [x, y, dx, dy] = nb[Math.floor(rnd() * nb.length)];
    seen[y * cells + x] = 1;
    open[at(cx * 2 + 1 + dx, cy * 2 + 1 + dy)] = 1; open[at(x * 2 + 1, y * 2 + 1)] = 1;
    stack.push([x, y]);
  }
  // 依離起點的遠近決定探索順序，模擬玩家一路走過去
  const order = [];
  const dist = new Int32Array(n).fill(-1);
  const q = [at(1, 1)]; dist[q[0]] = 0;
  while (q.length) { const i = q.shift(); order.push(i); for (const d of [1, -1, width, -width]) { const j = i + d; if (open[j] && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } } }
  const limit = Math.round(order.length * Math.max(0, Math.min(1, explored)));
  const reveal = new Set();
  for (let k = 0; k < limit; k++) { const i = order[k]; for (let ds = -1; ds <= 1; ds++) for (let de = -1; de <= 1; de++) reveal.add(i + ds * width + de); }
  for (let i = 0; i < n; i++) if (open[i] && reveal.has(i)) tile[i] = 2000 + layout;
  const put = (i, o) => { if (!reveal.has(i)) return; mark[i] = MARK_EXIT; obj[i] = o; tile[i] = 2000 + layout; };
  put(order[0], 12000 + layout % 2);                      // 進來的樓梯
  put(order[order.length - 1], 12002 + layout % 2);       // 最遠的地方是往下一層的樓梯
  if (withCrystal) put(order[Math.floor(order.length * 0.55)], 0);
  return encodeDat({ width, height, tile, obj, mark });
}
