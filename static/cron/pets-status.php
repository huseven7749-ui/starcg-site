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
