<?php
// 清理快取：每個不同的查詢、每個 IP 都會留下檔案，不清會吃掉主機的檔案數（inode）額度。
// 部署後會自動跑一次；也可以在 SiteGround「Cron Jobs」設定每天一次：
//   15 4 * * *  php /home/customer/www/starcg.online/public_html/cron/cleanup.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_lib.php';

$base = rtrim((string)cfg('cache_dir'), '/');
$now = time();
// [資料夾, 保留秒數]：查價與成交行情快取最多用到 stale_max_age（6 小時），留 1 天；限流計數留 1 小時
$rules = [
    ['market', 86400], ['history', 86400], ['daily', 3 * 86400], ['rl', 3600], ['img404', 86400],
];
$removed = 0;
foreach ($rules as [$dir, $keep]) {
    foreach (glob("$base/$dir/*") ?: [] as $f) {
        if (is_file($f) && $now - (int)@filemtime($f) > $keep) { @unlink($f) && $removed++; }
    }
}
// 每個 IP 的瀏覽計數（stats/ip-*.json）只需要最近 1 小時
foreach (glob("$base/stats/ip-*.json") ?: [] as $f) {
    if ($now - (int)@filemtime($f) > 3600) { @unlink($f) && $removed++; }
}
// 價格提醒的嘗試次數計數（alerts/rl-*.json）只需要最近 10 分鐘
foreach (glob("$base/alerts/rl-*.json") ?: [] as $f) {
    if ($now - (int)@filemtime($f) > 3600) { @unlink($f) && $removed++; }
}
// 中斷留下的暫存檔
foreach (glob("$base/*/*.tmp") ?: [] as $f) {
    if ($now - (int)@filemtime($f) > 600) { @unlink($f) && $removed++; }
}
fwrite(STDOUT, sprintf("[%s] 清除 %d 個過期快取檔\n", date('Y-m-d H:i:s'), $removed));
