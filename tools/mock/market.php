<?php
require __DIR__ . '/_data.php';
@file_put_contents(sys_get_temp_dir() . '/mock_hits.log', $_SERVER['REQUEST_URI'] . "\n", FILE_APPEND);
usleep(120000);
$q = (string)($_GET['search'] ?? '');
$page = max(1, (int)($_GET['page'] ?? 1));
$type = (string)($_GET['type'] ?? 'all');
$lang = (string)($_GET['lang'] ?? 'zh');
if ($q === '壞掉') { http_response_code(502); echo '<html>error code: 502</html>'; exit; }
if ($q === '碎片' && $page === 2) { http_response_code(500); echo '<html>Internal error</html>'; exit; }
$all = mock_stalls();
$f = array_values(array_filter($all, function ($s) use ($q, $type, $lang) {
    [, $items, $pets] = $s;
    $ok = false;
    if ($type !== 'pet') foreach ($items as $it) if (mock_lang_match($it['ITEM_TRUENAME'], $q, $lang)) $ok = true;
    if ($type !== 'item') foreach ($pets as $p) if (mock_lang_match($p['Name'], $q, $lang)) $ok = true;
    return $ok;
}));
$per = 20;
$slice = array_slice($f, ($page - 1) * $per, $per);
// 模擬翻頁時有人上架：第 2 頁開頭重複前一頁最後一個攤位
if ($page === 2 && count($f) > $per) array_unshift($slice, $f[$per - 1]);
$out = ['page' => $page, 'perPage' => $per, 'totalFiltered' => count($f), 'stalls' => [], 'itemsByCd' => []];
foreach ($slice as [$st, $items, $pets]) {
    if ($lang === 'ko') {
        foreach ($items as &$it) $it['ITEM_TRUENAME'] = mock_ko($it['ITEM_TRUENAME']); unset($it);
        foreach ($pets as &$pt) $pt['Name'] = mock_ko($pt['Name']); unset($pt);
    }
    $out['stalls'][] = $st;
    $out['itemsByCd'][$st['cdkey']] = $items;   // 官方會回傳整個攤位的道具
    if ($pets) $out['petsByCd'][$st['cdkey']] = $pets;
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode($out, JSON_UNESCAPED_UNICODE);
