<?php
// GET /api/history.php?q=關鍵字&type=all|item|pet&pages=1..10&range=7d|30d|90d|all
declare(strict_types=1);
require __DIR__ . '/_market.php';
only_get();
set_time_limit(75);

$q = norm_name(mb_substr((string)($_GET['q'] ?? ''), 0, 40));
$type = (string)($_GET['type'] ?? 'all');
if (!in_array($type, ['all', 'item', 'pet'], true)) $type = 'all';
$range = (string)($_GET['range'] ?? '30d');
if (!in_array($range, ['7d', '30d', '90d', 'all'], true)) $range = '30d';
$pages = max(1, min((int)cfg('history_max_pages', 10), (int)($_GET['pages'] ?? 2)));
if ($q === '') fail('missing q');
$lang = api_lang(); $sfx = $lang === 'ko' ? '|ko' : '';

[$data, $code] = cached_get('history', "h|$type|$range|$pages|$q" . $sfx, (int)cfg('history_ttl', 180), false,
    fn() => history_fetch($q, $type, $pages, $range, $lang));
if (!$data) fail_upstream($code);
json_out(with_age($data), 200, 60);
