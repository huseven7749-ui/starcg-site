<?php
// 寵物圖鑑：回傳 data/pets.json；資料超過一天沒更新時先向星詠攻略網同步一次再回（沒設 cron 也能保持最新）。
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_pets.php';
only_get();

$file = pets_file();
if (!is_file($file)) pets_sync(15);
else pets_sync_if_stale(isset($_GET['refresh']) ? 0 : 86400);   // ?refresh 只跳過「一天內不重抓」，仍受 6 小時一次的節流

$body = (string)@file_get_contents($file);
if ($body === '' || $body[0] !== '[') fail('no data', 503);
$etag = '"' . substr(md5($body), 0, 20) . '"';
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');
header('Cache-Control: public, max-age=3600, stale-while-revalidate=86400');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int)@filemtime($file)) . ' GMT');
header("ETag: $etag");
if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
header('Content-Length: ' . strlen($body));
echo $body;
