<?php
// 每日同步寵物圖鑑：從星詠攻略網下載 pets.json，驗證後覆寫 data/pets.json，並補抓缺少的寵物圖片。
// SiteGround「Cron Jobs」範例（每天 05:10）：
//   10 5 * * *  php /home/customer/www/starcg.online/public_html/cron/sync-pets.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_lib.php';

$dataFile = __DIR__ . '/../data/pets.json';
$imgDir = __DIR__ . '/../img/pets';
$src = (string)cfg('upstream_pets');
$log = fn(string $m) => fwrite(STDOUT, '[' . date('Y-m-d H:i:s') . "] $m\n");

$res = http_multi([$src], 1, 30);
$r = $res[$src] ?? null;
$list = $r && $r['code'] === 200 ? parse_json_body($r['body']) : null;
if (!is_array($list) || !array_is_list($list)) { $log("下載失敗（HTTP " . ($r['code'] ?? 0) . "），保留現有資料"); exit(1); }

// 驗證：至少 100 筆，且每筆都有名稱與五項檔次
$clean = [];
foreach ($list as $p) {
    if (!is_array($p) || trim((string)($p['name'] ?? '')) === '') continue;
    foreach (['hp', 'power', 'defense', 'speed', 'magic'] as $k) if (!is_numeric($p[$k] ?? null)) continue 2;
    $clean[] = $p;
}
$old = json_decode((string)@file_get_contents($dataFile), true);
$oldCount = is_array($old) ? count($old) : 0;
if (count($clean) < 100 || count($clean) < $oldCount * 0.8) {
    $log('資料筆數異常（' . count($clean) . " / 原本 $oldCount），不覆寫");
    exit(1);
}
$json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($old !== null && $json === json_encode($old, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) {
    $log('圖鑑無變動（' . count($clean) . ' 筆）');
} else {
    if (is_file($dataFile)) @copy($dataFile, $dataFile . '.prev');
    $tmp = $dataFile . '.tmp';
    file_put_contents($tmp, $json);
    rename($tmp, $dataFile);
    $log('已更新圖鑑：' . count($clean) . " 筆（原本 $oldCount 筆）");
}

// 補抓圖片（每次最多 300 張、4 條連線，溫和地抓）
$ids = [];
foreach ($clean as $p) {
    $ids[] = preg_replace('/\D/', '', (string)($p['imageId'] ?? ''));
    foreach (($p['skins'] ?? []) as $s) $ids[] = preg_replace('/\D/', '', (string)($s['imageId'] ?? ''));
}
$ids = array_values(array_unique(array_filter($ids)));
if (!is_dir($imgDir)) @mkdir($imgDir, 0755, true);
$missing = array_values(array_filter($ids, fn($id) => !is_file("$imgDir/$id.gif")));
$batch = array_slice($missing, 0, 300);
$saved = 0;
foreach (array_chunk($batch, 20) as $chunk) {
    $urls = array_map(fn($id) => sprintf((string)cfg('upstream_pet_img'), $id), $chunk);
    $res = http_multi($urls, 4, 15, ['Accept: image/*']);
    foreach ($chunk as $i => $id) {
        $rr = $res[$urls[$i]] ?? null;
        $b = $rr['body'] ?? '';
        if ($rr && $rr['code'] === 200 && strlen((string)$b) > 40 && (strncmp((string)$b, 'GIF8', 4) === 0 || strncmp((string)$b, "\x89PNG", 4) === 0)) {
            file_put_contents("$imgDir/$id.gif", $b);
            $saved++;
        }
    }
    usleep(500000);
}
$log("圖片：共 " . count($ids) . " 張，本次新增 $saved 張，尚缺 " . (count($missing) - $saved) . ' 張');
