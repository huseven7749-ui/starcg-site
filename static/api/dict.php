<?php
// GET /api/dict.php → 中文道具名 → 韓文名對照（從市場資料學起來的，韓文版頁面用來把站內名錄翻成韓文）
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_market.php';
only_get();
$d = dict_get();
json_out(['ok' => true, 'zh' => (object)($d['zh'] ?? [])], 200, 3600);
