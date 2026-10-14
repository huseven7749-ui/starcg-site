<?php
// 本機測試用路由（模擬 .htaccess）
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = $_SERVER['DOCUMENT_ROOT'];
if (preg_match('#^/api/(_.*|config.*)\.php$#', $uri) || preg_match('#^/(cron|cache)/#', $uri)) { http_response_code(403); echo 'Forbidden'; return true; }
if (preg_match('#^/img/pets/(\d{1,9})\.gif$#', $uri, $m) && !is_file($root . $uri)) { $_GET['id'] = $m[1]; require $root . '/api/petimg.php'; return true; }
if (is_dir($root . $uri) && is_file(rtrim($root . $uri, '/') . '/index.html')) {
    if (substr($uri, -1) !== '/') { header('Location: ' . $uri . '/', true, 301); return true; }
    header('Content-Type: text/html; charset=utf-8'); readfile($root . $uri . 'index.html'); return true;
}
if (is_file($root . $uri)) {
    if (str_ends_with($uri, '.webmanifest')) { header('Content-Type: application/manifest+json'); readfile($root . $uri); return true; }
    return false;
}
http_response_code(404); header('Content-Type: text/html; charset=utf-8'); readfile($root . '/404.html'); return true;
