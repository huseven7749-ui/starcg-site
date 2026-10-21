<?php
// 價格提醒：檢查所有會員設定的商品，低於設定價格就發 Discord／Email 通知。
// SiteGround「Cron Jobs」建議每 10 分鐘一次：
//   */10 * * * *  php /home/customer/www/starcg.online/public_html/cron/alerts.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_alerts.php';
// 同一時間只跑一份（上一輪還沒跑完就跳過）
$lock = fopen(alerts_dir() . '/run.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { fwrite(STDOUT, "價格提醒：上一輪還在執行，略過\n"); exit; }
set_time_limit(300);
fwrite(STDOUT, '[' . date('Y-m-d H:i:s') . '] ' . alerts_run() . "\n");
