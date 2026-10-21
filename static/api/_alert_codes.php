<?php
// 價格提醒會員名冊（由 tools/alert-code.py 維護，不要手動改格式）
// 只放開通碼的雜湊與會員編號，看不出原本的開通碼；會員名字不放在這裡（倉庫是公開的）。
// revoked：停用；reset：數字變大就解除裝置綁定（讓會員換裝置重新開通）
declare(strict_types=1);
return json_decode(<<<'JSON'
[
 {
  "id": "388c56968e68b41b",
  "code": "388c56968e68b41b1f0fea7f06c0977afe6e762f2666cc8720e26b869c11a2c1",
  "no": "M001",
  "created": "2026-10-21"
 }
]
JSON, true) ?: [];
