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
 },
 {
  "id": "b405c64e776b73d4",
  "code": "b405c64e776b73d43976de37759bf515645154076052f28540a0cb30dbaddc24",
  "no": "M002",
  "created": "2026-10-22"
 },
 {
  "id": "a51978266e5e0389",
  "code": "a51978266e5e03897468c3ef075c04a1e81cf5392da20c89db783e80b4ab98c8",
  "no": "M003",
  "created": "2026-10-29"
 },
 {
  "id": "e6ec273172abfbb5",
  "code": "e6ec273172abfbb5926e5d32fd8a15cdb4f57277d3d311931b339aff9c2a0a78",
  "no": "M004",
  "created": "2026-10-29"
 },
 {
  "id": "40e5fb91edbbfca3",
  "code": "40e5fb91edbbfca321bc3aabc8d18122dd12e1f6affb4e1507620d35a8b234e6",
  "no": "M005",
  "created": "2026-10-29"
 },
 {
  "id": "b20a8d0e65d94a50",
  "code": "b20a8d0e65d94a5001ed2e2105e0236749923e031e44ebc2995b423b76852946",
  "no": "M006",
  "created": "2026-10-29"
 },
 {
  "id": "072f3438d6e81c32",
  "code": "072f3438d6e81c322c7818251c44cc1b5cb7b0c2dc3649c41d168376ec0ec0a4",
  "no": "M007",
  "created": "2026-10-29"
 },
 {
  "id": "a4c84265071c8689",
  "code": "a4c84265071c86891b88225205f6141f79ab9f1b3606b4cd24126416f9912295",
  "no": "M008",
  "created": "2026-10-29"
 }
]
JSON, true) ?: [];
