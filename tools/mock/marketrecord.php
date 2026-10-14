<?php
// 假官方成交紀錄：每 6 分鐘一筆，id 隨時間遞增，可用關鍵字與 range 篩選（新到舊）
@file_put_contents(sys_get_temp_dir() . '/mock_hits.log', $_SERVER['REQUEST_URI'] . "\n", FILE_APPEND);
usleep(60000);
$q = (string)($_GET['search'] ?? '');
$page = max(1, (int)($_GET['page'] ?? 1));
$range = (string)($_GET['range'] ?? '30d');
$days = ['7d' => 7, '30d' => 30, '90d' => 90, 'all' => 120][$range] ?? 30;
$pool = [ // 名稱、魔幣基準價、魔晶基準價、趨勢（每天 %）
  ['[硬皮靴]', 950, 0, 0.002], ['[水的水晶碎片]', 900, 1, -0.004], ['[地的水晶碎片]', 800, 1, 0.006], ['[火的水晶碎片]', 950, 1, 0.0],
  ['[風的水晶碎片]', 700, 1, 0.01], ['[寵物改造圖A]', 320000, 90, 0.0], ['[重來的種子]', 120000, 35, -0.01], ['[格鬥劍]', 5200, 0, 0.003],
  ['[長鍔劍]', 5600, 0, 0.0], ['年獸', 3200000, 900, 0.004], ['赤焰年獸', 3500000, 980, -0.003], ['[皮靴]', 600, 0, 0.0],
];
$slot = 360; $now = time(); $cur = intdiv($now, $slot);
$from = $cur - intdiv($days * 86400, $slot);
$logs = [];
for ($s = $cur; $s > $from; $s--) {
    $h = crc32("slot$s");
    $it = $pool[$h % count($pool)];
    if ($q !== '' && !str_contains($it[0], $q)) continue;
    $ageDays = ($cur - $s) * $slot / 86400;
    $trend = 1 - $it[3] * $ageDays;
    $crystal = $it[2] > 0 && ($h >> 8) % 4 === 0;
    $qty = str_contains($it[0], '水晶') ? 1 + ($h >> 12) % 5 : 1;
    $base = $crystal ? $it[2] : $it[1];
    $gross = max(1, (int)round($base * $trend * (0.85 + (($h >> 16) % 30) / 100)));
    $t = $s * $slot + ($h % 300);
    $logs[] = ['id' => $s, 'time' => $t, 'buff' => "購買{$qty}個：" . $it[0], 'price' => (int)floor($gross * $qty * ($crystal ? 0.94 : 0.9)),
        'pricetype' => $crystal ? 1 : 0, 'time_text' => date('Y-m-d H:i:s', $t + 8 * 3600 - (int)date('Z')), 'ts' => $t, 'qty' => $qty, 'item_name' => $it[0],
        'gross_price' => $gross * $qty, 'unit_price' => (int)floor($gross * ($crystal ? 0.94 : 0.9)), 'unit_gross_price' => $gross, 'currency_label' => $crystal ? '魔晶' : '金幣'];
}
$total = count($logs);
$slice = array_slice($logs, ($page - 1) * 50, 50);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['page' => $page, 'perPage' => 50, 'totalFiltered' => $total, 'totalFilteredRaw' => $total, 'resultsTruncated' => false, 'range' => $range, 'sort' => 'time_desc',
    'currency' => 'all', 'type' => 'all', 'logs' => $slice, 'stats' => null, 'trend6m' => null, 'highlight_terms' => []], JSON_UNESCAPED_UNICODE);
