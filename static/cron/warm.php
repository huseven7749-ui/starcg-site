<?php
// （選用）預熱熱門搜尋：讓最多人查的關鍵字幾乎都能秒開。
// SiteGround「Cron Jobs」範例（每 5 分鐘）：
//   */5 * * * *  php /home/customer/www/starcg.online/public_html/cron/warm.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/../api/_market.php';

$top = array_slice(hot_top(8), 0, 8);
foreach ($top as $q) {
    [$d] = cached_get('market', "m|all|0|$q", (int)cfg('market_ttl', 60), false, fn() => market_fetch($q, 'all', false));
    fwrite(STDOUT, sprintf("%s  %s  %s\n", date('H:i:s'), $q, $d ? ('ok ' . ($d['tookMs'] ?? 0) . 'ms' . (!empty($d['cached']) ? ' (cache)' : '')) : 'fail'));
    usleep(400000);
}
