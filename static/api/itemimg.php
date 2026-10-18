<?php
// 道具圖片延遲快取：/img/items/{編號}.gif 不存在時由 .htaccess 轉到這裡，
// 從官方市場的道具圖取一次後存到本站，之後由伺服器直接當靜態檔提供。
// 來源同官方市場頁：先取 metamo/item/{編號}.gif，沒有再取 metamo/png/{編號}.png（存檔仍叫 .gif，回應時依內容標示格式）。
// 編號＝市場資料的 ITEM_BASEIMAGENUMBER。只抓這兩個固定網址，所以不會被當成開放代理。
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^\d{1,9}$/', $id)) { http_response_code(404); exit; }
$sources = [
    sprintf('https://member.starcg.net/metamo/item/%s.gif', $id),
    sprintf('https://member.starcg.net/metamo/png/%s.png', $id),
];
$dir = __DIR__ . '/../img/items';
$file = "$dir/$id.gif";

function img_type(string $body): string { return strncmp($body, 'GIF8', 4) === 0 ? 'image/gif' : 'image/png'; }
function send_img(string $file): void
{
    header('Content-Type: ' . img_type((string)@file_get_contents($file, false, null, 0, 4)));
    header('Cache-Control: public, max-age=2592000');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}
if (is_file($file)) send_img($file);

// 全站每分鐘取圖上限（不佔訪客的查價次數）；超過就暫時讓瀏覽器直接向官方取
$budget = (bool)locked_json(rtrim((string)cfg('cache_dir'), '/') . '/img-budget.json', function (array $d) {
    $min = (int)floor(time() / 60);
    $used = ($d['m'] ?? 0) === $min ? (int)($d['n'] ?? 0) : 0;
    if ($used >= (int)cfg('item_img_per_min', 300)) return [['m' => $min, 'n' => $used], false];
    return [['m' => $min, 'n' => $used + 1], true];
});
if (!$budget) { header('Location: ' . $sources[0], true, 302); exit; }

$isImg = fn(?array $r): bool => $r && $r['code'] === 200 && is_string($r['body']) && strlen($r['body']) > 40 && strlen($r['body']) < 500_000
    && (strncmp($r['body'], 'GIF8', 4) === 0 || strncmp($r['body'], "\x89PNG", 4) === 0);
// 和查價共用全站 2 條連線名額（官方同一 IP 同時連線太多會擋查價）；等不到就讓瀏覽器直接向官方取這一次
$slots = upstream_slots_acquire(1, 6.0);
if (!$slots && PHP_SAPI !== 'cli') { header('Location: ' . $sources[0], true, 302); exit; }
$r = null;
try {
    foreach ($sources as $u) {
        $res = http_multi([$u], 1, 10, ['Accept: image/*']);
        $r = $res[$u] ?? null;
        if ($isImg($r)) break;
    }
} finally { upstream_slots_release($slots); }
if (!$isImg($r)) {
    // 官方兩種格式都沒有這張圖：回 404，前端就不顯示圖片
    $missing = ($r['code'] ?? 0) === 404;
    http_response_code($missing ? 404 : 502);
    header('Cache-Control: ' . ($missing ? 'public, max-age=3600' : 'no-store'));   // 官方暫時連不上不要快取
    exit;
}
$body = (string)$r['body'];
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$tmp = "$file." . getmypid() . '.tmp';
if (@file_put_contents($tmp, $body) !== false) @rename($tmp, $file);
@unlink($tmp);
if (is_file($file)) send_img($file);
header('Content-Type: ' . img_type($body));
echo $body;
