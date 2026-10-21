<?php
// 價格提醒會員名冊（由 tools/alert-code.py 維護，不要手動改格式）
// 只放開通碼的雜湊與會員編號，看不出原本的開通碼；會員名字不放在這裡（倉庫是公開的）。
// revoked：停用；reset：數字變大就解除裝置綁定（讓會員換裝置重新開通）
declare(strict_types=1);
return json_decode(<<<'JSON'
[]
JSON, true) ?: [];
