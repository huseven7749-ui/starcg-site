<?php
// 每日同步寵物圖鑑：從星詠攻略網下載 pets.json，驗證後覆寫 data/pets.json，並補抓缺少的寵物圖片。
// SiteGround「Cron Jobs」範例（每天 05:10）：
//   10 5 * * *  php /home/customer/www/starcg.online/public_html/cron/sync-pets.php
// 沒設 cron 也行：api/pets.php 在資料超過一天沒更新時會順便同步（不補圖，圖片由 petimg.php 有人看時再抓）。
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_lib.php';
require __DIR__ . '/../api/_pets.php';

$log = fn(string $m) => fwrite(STDOUT, '[' . date('Y-m-d H:i:s') . "] $m\n");
$maxImg = max(0, (int)((getopt('', ['images::'])['images'] ?? 300)));   // --images=60 可少抓一點（部署時用）
$r = pets_sync(30);
$log($r['msg']);
if (!$r['ok']) exit(1);

// 補抓圖片（每次最多 300 張、4 條連線，溫和地抓）
$imgDir = __DIR__ . '/../img/pets';
$ids = pets_image_ids();
if (!is_dir($imgDir)) @mkdir($imgDir, 0755, true);
$missing = array_values(array_filter($ids, fn($id) => !is_file("$imgDir/$id.gif")));
$batch = array_slice($missing, 0, $maxImg);
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
