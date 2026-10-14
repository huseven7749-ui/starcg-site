<?php
// GET /api/fx.php → 以台幣為基準的各國匯率（每 12 小時更新一次）
// 來源：ExchangeRate-API 開放端點（https://www.exchangerate-api.com），失敗時回傳上次結果或內建備援值。
declare(strict_types=1);
require __DIR__ . '/_lib.php';
only_get();

const SC_FIATS = ['TWD', 'HKD', 'CNY', 'KRW', 'USD'];
const SC_FX_FALLBACK = ['TWD' => 1, 'HKD' => 0.245745, 'CNY' => 0.2099, 'KRW' => 41.940143, 'USD' => 0.031285, 'date' => '2026-10-12'];

$path = cache_path('fx', 'twd');
$cached = cache_read($path);
if ($cached && time() - (int)$cached['fetchedAt'] < 12 * 3600) json_out($cached + ['cached' => true], 200, 3600);

$res = with_lock($path, function () use ($path) {
    $c = cache_read($path);
    if ($c && time() - (int)$c['fetchedAt'] < 12 * 3600) return $c;
    $url = (string)cfg('upstream_fx', 'https://open.er-api.com/v6/latest/TWD');
    $r = http_multi([$url], 1, 10)[$url] ?? null;
    $d = $r && $r['code'] === 200 ? parse_json_body($r['body']) : null;
    if (!$d || ($d['result'] ?? '') !== 'success' || !is_array($d['rates'] ?? null)) return null;
    $rates = [];
    foreach (SC_FIATS as $f) {
        $v = (float)($d['rates'][$f] ?? 0);
        if ($v <= 0) return null;
        $rates[$f] = $v;
    }
    $out = ['ok' => true, 'base' => 'TWD', 'rates' => $rates, 'date' => gmdate('Y-m-d', (int)($d['time_last_update_unix'] ?? time())),
        'source' => 'https://www.exchangerate-api.com', 'fetchedAt' => time()];
    cache_write($path, $out);
    return $out;
});
if ($res) json_out($res, 200, 3600);
if ($cached) json_out($cached + ['stale' => true], 200, 600);
$fb = SC_FX_FALLBACK;
// 備援值也寫入快取，一小時後再重試，避免來源掛掉時每個請求都等逾時
$fbOut = ['ok' => true, 'base' => 'TWD', 'rates' => array_intersect_key($fb, array_flip(SC_FIATS)), 'date' => $fb['date'],
    'source' => 'https://www.exchangerate-api.com', 'fallback' => true, 'fetchedAt' => time() - 11 * 3600];
cache_write($path, $fbOut);
json_out(['ok' => true, 'base' => 'TWD', 'rates' => array_intersect_key($fb, array_flip(SC_FIATS)), 'date' => $fb['date'],
    'source' => 'https://www.exchangerate-api.com', 'fallback' => true, 'fetchedAt' => time()], 200, 600);
