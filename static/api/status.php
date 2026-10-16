<?php
// GET /api/status.php → 最近一小時向官方抓取失敗的統計（不含任何訪客資料），用來診斷「查價發生錯誤」
declare(strict_types=1);
require __DIR__ . '/_market.php';
only_get();
$file = rtrim((string)cfg('cache_dir'), '/') . '/upstream-log.json';
$log = is_file($file) ? (json_decode((string)@file_get_contents($file), true) ?: []) : [];
$now = time();
$recent = array_values(array_filter($log, fn($x) => is_array($x) && $now - (int)($x['t'] ?? 0) < 3600));
$by = [];
foreach ($recent as $x) { $k = ($x['s'] ?? '?') . ' ' . ($x['c'] ?? 0); $by[$k] = ($by[$k] ?? 0) + 1; }
json_out(['ok' => true, 'now' => $now, 'failsLastHour' => count($recent), 'byStageCode' => $by,
    'last' => array_map(fn($x) => ['ago' => $now - (int)$x['t'], 's' => $x['s'] ?? '', 'c' => $x['c'] ?? 0, 'e' => $x['e'] ?? '', 'b' => $x['b'] ?? ''], array_slice($recent, -10))], 200, 0);
