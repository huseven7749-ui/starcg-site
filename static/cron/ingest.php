<?php
// 每 10 分鐘收集全市場最新成交紀錄（通常只需 1 頁），供「每日市場動態」使用。
// SiteGround「Cron Jobs」範例：
//   */10 * * * *  php /home/customer/www/starcg.online/public_html/cron/ingest.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_records.php';
$r = records_ingest(20);
fwrite(STDOUT, sprintf("[%s] 新增 %d 筆，抓取 %d 頁，最新 id %d\n", date('Y-m-d H:i:s'), $r['added'], $r['pages'], $r['lastId']));

// 順便跑價格提醒（已經設好這個每 10 分鐘的 Cron，就不用再另外設）
require_once __DIR__ . '/../api/_alerts.php';
$alertLock = @fopen(alerts_dir() . '/run.lock', 'c');
if ($alertLock && flock($alertLock, LOCK_EX | LOCK_NB)) {
    try { fwrite(STDOUT, alerts_run() . "\n"); } catch (Throwable $e) { fwrite(STDOUT, '價格提醒失敗：' . $e->getMessage() . "\n"); }
}
