<?php
// 主動學韓文名（平常由網站每 10 分鐘的例行工作自動跑，這支只是手動補跑用）
//   php /home/customer/www/starcg.online/public_html/cron/learn-ko.php 20
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_learn.php';
fwrite(STDOUT, learn_ko(max(1, min(200, (int)($argv[1] ?? 20)))) . "\n");
