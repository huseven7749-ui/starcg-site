<?php
// GET /api/hot.php → 熱門搜尋關鍵字
declare(strict_types=1);
require __DIR__ . '/_lib.php';
only_get();
json_out(['ok' => true, 'items' => hot_top(12)], 200, 300);
