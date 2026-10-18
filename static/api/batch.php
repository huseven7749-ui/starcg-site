<?php
// GET /api/batch.php?n[]=名稱1&n[]=名稱2…（最多 30 個，完全相同名稱）
// 批次採購與分類比較用：每個名稱各自沿用 60 秒快取，整批只算一次查詢次數。
declare(strict_types=1);
require __DIR__ . '/_market.php';
only_get();
set_time_limit(120);
$GLOBALS['SC_FETCH_DEADLINE'] = 75;          // 一批多個名稱，給長一點的抓取時間（前端等 90 秒）

$names = $_GET['n'] ?? [];
if (!is_array($names)) $names = [$names];
$names = array_values(array_unique(array_filter(array_map(fn($n) => norm_name(mb_substr((string)$n, 0, 40)), $names), fn($n) => $n !== '')));
$max = (int)cfg('batch_max_names', 30);
if (!$names) fail('missing n');
if (count($names) > $max) fail("too many names (max $max)");
$type = (string)($_GET['type'] ?? 'all');
if (!in_array($type, ['all', 'item', 'pet'], true)) $type = 'all';
$fresh = ($_GET['fresh'] ?? '') === '1';
$lang = api_lang(); $sfx = $lang === 'ko' ? '|ko' : '';

// 全部都有快取就不扣次數；需要向官方抓取時才算一次
$needFetch = false;
foreach ($names as $n) {
    $c = cache_read(cache_path('market', "m|$type|1|$n" . $sfx));
    if (!$c || time() - (int)$c['fetchedAt'] >= ($fresh ? (int)cfg('fresh_min_age', 20) : (int)cfg('market_ttl', 60))) { $needFetch = true; break; }
}
if ($needFetch && !rate_allow()) fail('too many requests, please wait a minute', 429);

$out = []; $failed = [];
foreach ($names as $n) {
    [$d] = cached_get('market', "m|$type|1|$n" . $sfx, (int)cfg('market_ttl', 60), $fresh, fn() => market_fetch($n, $type, true, null, $lang), false);
    if ($d) $out[$n] = with_age($d); else $failed[] = $n;
}
if (!$out) fail_upstream(upstream_cooldown() > 0 ? 503 : 502);
json_out(['ok' => true, 'fetchedAt' => time(), 'results' => $out, 'failed' => $failed], 200, 15);
