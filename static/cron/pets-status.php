<?php
// 印出寵物圖鑑狀態（筆數、最新幾筆、上次同步結果），部署紀錄與排查用：php cron/pets-status.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_lib.php';
require __DIR__ . '/../api/_pets.php';
$d = json_decode((string)@file_get_contents(pets_file()), true);
$st = pets_state();
if (!is_array($d)) { echo "圖鑑：讀不到 data/pets.json\n"; exit(1); }
$last = array_map(fn($p) => (string)($p['name'] ?? '?'), array_slice($d, -3));
echo '圖鑑：' . count($d) . ' 筆，最新：' . implode('、', $last) . '，檔案時間 ' . date('Y-m-d H:i', (int)@filemtime(pets_file())) . "\n";
if ($st) echo '上次同步：' . date('Y-m-d H:i', (int)($st['at'] ?? 0)) . ' ' . ($st['msg'] ?? '') . "\n";
// 跟倉庫種子（部署時上傳的 data/pets.seed.json）比，多了哪些
$seed = json_decode((string)@file_get_contents(dirname(pets_file()) . '/pets.seed.json'), true);
if (is_array($seed)) {
    $have = array_flip(array_map(fn($p) => (string)($p['name'] ?? ''), $seed));
    $new = array_values(array_filter(array_map(fn($p) => (string)($p['name'] ?? ''), $d), fn($n) => $n !== '' && !isset($have[$n])));
    echo '比倉庫種子多 ' . count($new) . ' 筆' . ($new ? '：' . implode('、', array_slice($new, 0, 60)) : '') . "\n";
}
$find = (string)(getopt('', ['find::'])['find'] ?? '');
if ($find !== '') {
    $hits = array_values(array_filter($d, fn($p) => mb_stripos((string)($p['name'] ?? ''), $find) !== false));
    echo "搜尋「{$find}」：" . (count($hits) ? implode('、', array_map(fn($p) => $p['name'] . '(#' . ($p['id'] ?? '?') . ')', $hits)) : '沒有') . "\n";
}
