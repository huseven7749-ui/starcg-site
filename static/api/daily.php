<?php
// GET /api/daily.php?day=YYYY-MM-DD → 每日市場動態（台灣日期，預設今天）
declare(strict_types=1);
require __DIR__ . '/_records.php';
only_get();

$day = (string)($_GET['day'] ?? '');
if (!preg_match('/^\d{4}-\d\d-\d\d$/', $day)) $day = tw_day(time());

// 沒設定排程時的保險：距離上次收集超過 10 分鐘就順便補抓最新 2 頁
$state = json_decode((string)@file_get_contents(records_dir() . '/state.json'), true) ?: [];
if (time() - (int)($state['at'] ?? 0) > 600 && rate_allow()) records_ingest(2);

[$data] = cached_get('daily', "d|$day", 600, false, fn() => daily_summary($day), false);
if (!$data) fail('unavailable', 502);
json_out(with_age($data), 200, 120);
