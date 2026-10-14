<?php
// 寵物圖片延遲快取：/img/pets/{id}.gif 不存在時由 .htaccess 轉到這裡，
// 從星詠攻略網取一次後存到本站，之後由伺服器直接當靜態檔提供。
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^\d{1,9}$/', $id)) { http_response_code(404); exit; }
$remote = sprintf((string)cfg('upstream_pet_img'), $id);
$dir = __DIR__ . '/../img/pets';
$file = "$dir/$id.gif";

function send_img(string $file): void
{
    header('Content-Type: image/gif');
    header('Cache-Control: public, max-age=2592000');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}
if (is_file($file)) send_img($file);

// 只允許圖鑑內存在的圖片編號，避免被拿來當開放代理
$allowed = false;
$pets = json_decode((string)@file_get_contents(__DIR__ . '/../data/pets.json'), true);
if (is_array($pets)) {
    foreach ($pets as $p) {
        if ((string)preg_replace('/\D/', '', (string)($p['imageId'] ?? '')) === $id) { $allowed = true; break; }
        foreach (($p['skins'] ?? []) as $s) if ((string)preg_replace('/\D/', '', (string)($s['imageId'] ?? '')) === $id) { $allowed = true; break 2; }
    }
}
if (!$allowed || !rate_allow()) { header('Location: ' . $remote, true, 302); exit; }

$res = http_multi([$remote], 1, 10, ['Accept: image/*']);
$r = $res[$remote] ?? null;
$body = $r['body'] ?? '';
$isImg = $r && $r['code'] === 200 && is_string($body) && strlen($body) > 40 && strlen($body) < 2_000_000
    && (strncmp($body, 'GIF8', 4) === 0 || strncmp($body, "\x89PNG", 4) === 0 || strncmp($body, "\xFF\xD8", 2) === 0);
if (!$isImg) { header('Location: ' . $remote, true, 302); exit; }
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$tmp = "$file." . getmypid() . '.tmp';
if (@file_put_contents($tmp, $body) !== false) @rename($tmp, $file);
@unlink($tmp);
if (is_file($file)) send_img($file);
header('Content-Type: image/gif');
echo $body;
