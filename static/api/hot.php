<?php
// GET /api/hot.php → 熱門搜尋關鍵字
declare(strict_types=1);
require __DIR__ . '/_market.php';
only_get();
$items = hot_top(12);
if (api_lang() === 'ko') $items = array_map(fn($n) => ['n' => $n, 'kn' => dict_ko($n)], $items);
json_out(['ok' => true, 'items' => $items], 200, 300);
