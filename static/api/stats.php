<?php
// GET /api/stats.php?c=<匿名代碼>&v=1 → 瀏覽人數／在線人數
// c：瀏覽器自己產生的隨機代碼（不含個資）；v=1 表示這次是開新頁面（計入瀏覽），否則只是心跳。
declare(strict_types=1);
require __DIR__ . '/_lib.php';
only_get();

$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
$bot = $ua === '' || preg_match('/bot|crawl|spider|slurp|preview|curl|wget|python|headless|lighthouse|monitor|facebookexternalhit/i', $ua);
$c = (string)($_GET['c'] ?? '');
$valid = (bool)preg_match('/^[a-z0-9]{8,32}$/i', $c);
$view = ($_GET['v'] ?? '') === '1';

$dir = rtrim((string)cfg('cache_dir'), '/') . '/stats';
$file = $dir . '/stats.json';
$now = time();
$today = date('Y-m-d');
$id = $valid ? substr(sha1($c . '|' . cfg('stats_salt', 'sc')), 0, 12) : '';
$write = !$bot && $valid;

// 每個 IP 每小時最多計 120 次瀏覽，避免被灌水
if ($write && $view) {
    $rl = $dir . '/ip-' . substr(sha1(client_ip()), 0, 12) . '.json';
    $ok = locked_json($rl, function (array $d) use ($now) {
        $d = array_values(array_filter($d, fn($t) => is_int($t) && $now - $t < 3600));
        if (count($d) >= 120) return [$d, false];
        $d[] = $now; return [$d, true];
    });
    if (!$ok) $view = false;
}

$out = locked_json($file, function (array $d) use ($now, $today, $id, $write, $view) {
    $d += ['total' => 0, 'visitors' => 0, 'days' => [], 'online' => [], 'seen' => []];
    if ($write) {
        $d['online'][$id] = $now;
        if ($view) {
            $d['total']++;
            $d['days'][$today] = ($d['days'][$today] ?? 0) + 1;
        }
        if (($d['seen'][$id] ?? '') !== $today) {
            if (!isset($d['seen'][$id])) $d['visitors']++;
            $d['seen'][$id] = $today;
            $d['uv'][$today] = ($d['uv'][$today] ?? 0) + 1;
        }
    }
    $d['online'] = array_filter($d['online'], fn($t) => $now - $t < 300);
    $d['days'] = array_slice($d['days'], -60, null, true);
    if (isset($d['uv'])) $d['uv'] = array_slice($d['uv'], -60, null, true);
    if (count($d['seen']) > 20000) $d['seen'] = array_slice($d['seen'], -10000, null, true);
    $online = count(array_filter($d['online'], fn($t) => $now - $t < 120));
    return [$d, ['ok' => true, 'online' => max($online, 1), 'today' => $d['days'][$today] ?? 0, 'total' => $d['total'], 'visitors' => $d['visitors']]];
});
if (!$out) fail('busy', 503);

// 網站自帶的排程：沒在 SiteGround 設 Cron 也沒關係。有人瀏覽時，距離上次超過 10 分鐘就在回應送出後
// 順便收集成交紀錄、檢查價格提醒（同一時間只會有一個請求去跑）。
$tickFile = $dir . '/tick.json';
$due = $write && locked_json($tickFile, function (array $d) use ($now) {
    if ($now - (int)($d['at'] ?? 0) < 600) return [$d, false];
    $d['at'] = $now; return [$d, true];
});
if ($due) {
    register_shutdown_function(function () {
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        ignore_user_abort(true);
        @set_time_limit(240);
        try { require_once __DIR__ . '/_records.php'; records_ingest(5); } catch (Throwable $e) { error_log('tick ingest: ' . $e->getMessage()); }
        try {
            require_once __DIR__ . '/_alerts.php';
            $lock = @fopen(alerts_dir() . '/run.lock', 'c');
            if ($lock && flock($lock, LOCK_EX | LOCK_NB)) alerts_run();
        } catch (Throwable $e) { error_log('tick alerts: ' . $e->getMessage()); }
    });
}
json_out($out);
