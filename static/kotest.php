<?php
// 暫時用的探測：官方市場 API 是否支援韓文（之後會刪除）
declare(strict_types=1);
require_once __DIR__ . '/api/_lib.php';
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');
$base = cfg('upstream_market');
$mk = function (string $q, string $lang = '') use ($base) {
    $p = ['ajax' => 1, 'type' => 'all', 'server' => 'all', 'exact' => 0, 'page' => 1, 'search' => $q];
    if ($lang !== '') $p['lang'] = $lang;
    return $base . '?' . http_build_query($p, '', '&', PHP_QUERY_RFC3986);
};
$cases = ['zh' => $mk('水晶'), 'zh_langko' => $mk('水晶', 'ko'), 'ko_langko' => $mk('수정', 'ko'), 'ko_nolang' => $mk('수정')];
$res = http_multi(array_values($cases), 4, 12, ['Accept-Language: ko-KR,ko;q=0.9,zh-TW;q=0.5', 'Cookie: lang=ko']);
$out = [];
foreach ($cases as $k => $url) {
    $r = $res[$url] ?? null;
    $d = parse_json_body($r['body'] ?? null);
    $names = [];
    if ($d) {
        foreach (($d['itemsByCd'] ?? []) as $items) foreach ((array)$items as $it) { if (count($names) >= 4) break 2; $names[] = $it['ITEM_TRUENAME'] ?? ($it['name'] ?? '?'); }
        foreach (($d['petsByCd'] ?? []) as $pets) foreach ((array)$pets as $pt) { if (count($names) >= 6) break 2; $names[] = 'pet:' . ($pt['Name'] ?? '?'); }
    }
    $first = null;
    if ($d) foreach (($d['itemsByCd'] ?? []) as $items) { foreach ((array)$items as $it) { $first = array_keys($it); break 2; } }
    $out[$k] = ['code' => $r['code'] ?? null, 'err' => $r['err'] ?? null, 'json' => (bool)$d, 'total' => $d['totalFiltered'] ?? null, 'names' => $names, 'keys' => $first, 'head' => $d ? null : mb_substr((string)($r['body'] ?? ''), 0, 120)];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
