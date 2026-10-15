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
$mk2 = function (array $extra) use ($base) { return $base . '?' . http_build_query($extra, '', '&', PHP_QUERY_RFC3986); };
$cases = [
    'ko_langzh' => $mk2(['ajax' => 1, 'type' => 'all', 'server' => 'all', 'exact' => 0, 'page' => 1, 'search' => '자수정', 'lang' => 'zh']),
    'ko_nolang' => $mk2(['ajax' => 1, 'type' => 'all', 'server' => 'all', 'exact' => 0, 'page' => 1, 'search' => '자수정']),
    'zh_langko' => $mk2(['ajax' => 1, 'type' => 'all', 'server' => 'all', 'exact' => 0, 'page' => 1, 'search' => '紫水晶', 'lang' => 'ko']),
    'zh_langzh' => $mk2(['ajax' => 1, 'type' => 'all', 'server' => 'all', 'exact' => 0, 'page' => 1, 'search' => '紫水晶', 'lang' => 'zh']),
];
$res = []; foreach ($cases as $u) { $res += http_multi([$u], 1, 12); usleep(400000); }
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
    $out[$k] = ['code' => $r['code'] ?? null, 'err' => $r['err'] ?? null, 'json' => (bool)$d, 'total' => $d['totalFiltered'] ?? null, 'perPage' => $d['perPage'] ?? null, 'ids' => $d ? array_slice(array_map(fn($its) => array_map(fn($it) => ($it['ITEM_ID'] ?? '?') . '=' . ($it['ITEM_TRUENAME'] ?? '?'), (array)$its), array_values($d['itemsByCd'] ?? [])), 0, 2) : null, 'names' => $names, 'keys' => $first, 'head' => $d ? null : mb_substr((string)($r['body'] ?? ''), 0, 120)];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
