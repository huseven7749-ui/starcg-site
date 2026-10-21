<?php
// POST /api/alerts.php  JSON {action, ...}
// 會員：activate（開通碼＋裝置代碼 → 綁定這台裝置，拿到 token）、me、save、test
// 站長：admin_list、admin_new、admin_reset（解除裝置綁定）、admin_revoke（停用／恢復）——都要帶站長金鑰 key
declare(strict_types=1);
require __DIR__ . '/_alerts.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') fail('method', 405);
$in = json_decode((string)file_get_contents('php://input', false, null, 0, 20000), true);
if (!is_array($in)) fail('bad json');
$action = (string)($in['action'] ?? '');

/** 每個 IP 每 10 分鐘最多嘗試 N 次（開通、站長登入），防止亂猜 */
function attempt_allow(string $kind, int $max): bool
{
    $file = alerts_dir() . '/rl-' . $kind . '-' . substr(sha1(client_ip()), 0, 16) . '.json';
    return (bool)locked_json($file, function (array $d) use ($max) {
        $now = time();
        $d = array_values(array_filter($d, fn($t) => is_int($t) && $now - $t < 600));
        if (count($d) >= $max) return [$d, false];
        $d[] = $now; return [$d, true];
    });
}

// ───── 站長 ─────
if (str_starts_with($action, 'admin_')) {
    $key = alerts_admin_key();
    if ($key === '') fail('admin key not configured', 503);
    if (!attempt_allow('admin', 30)) fail('too many attempts', 429);
    if (!hash_equals($key, (string)($in['key'] ?? ''))) fail('wrong key', 403);
    $view = fn(array $all) => array_values(array_map(fn($k, $m) => [
        'id' => $k, 'label' => (string)($m['label'] ?? ''), 'created' => (int)($m['created'] ?? 0), 'bound' => !empty($m['device']),
        'boundAt' => (int)($m['boundAt'] ?? 0), 'revoked' => !empty($m['revoked']), 'enabled' => !empty($m['enabled']),
        'items' => count($m['items'] ?? []), 'checkedAt' => (int)($m['checkedAt'] ?? 0),
    ], array_keys($all), $all));
    if ($action === 'admin_list') json_out(['ok' => true, 'members' => $view(alerts_read())]);
    if ($action === 'admin_new') {
        $n = max(1, min(20, (int)($in['n'] ?? 1)));
        $label = mb_substr(trim((string)($in['label'] ?? '')), 0, 40);
        $codes = [];
        alerts_mutate(function (array $all) use ($n, $label, &$codes) {
            for ($i = 0; $i < $n; $i++) {
                $c = alerts_new_code(); $codes[] = $c;
                $all[substr(alerts_hash('c|' . $c), 0, 16)] = ['code' => alerts_hash('c|' . $c), 'label' => $label, 'created' => time(), 'items' => [], 'enabled' => true];
            }
            return [$all, true];
        });
        json_out(['ok' => true, 'codes' => $codes, 'members' => $view(alerts_read())]);
    }
    if ($action === 'admin_reset' || $action === 'admin_revoke') {
        $id = (string)($in['id'] ?? '');
        $done = alerts_mutate(function (array $all) use ($id, $action, $in) {
            if (!isset($all[$id])) return [$all, false];
            if ($action === 'admin_reset') { unset($all[$id]['device'], $all[$id]['token'], $all[$id]['boundAt']); }
            else $all[$id]['revoked'] = !empty($in['on']);
            return [$all, true];
        });
        if (!$done) fail('not found', 404);
        json_out(['ok' => true, 'members' => $view(alerts_read())]);
    }
    fail('unknown action');
}

// ───── 會員 ─────
if ($action === 'activate') {
    if (!attempt_allow('act', 10)) fail('too many attempts', 429);
    $code = alerts_norm_code((string)($in['code'] ?? ''));
    $dev = (string)($in['device'] ?? '');
    if ($code === '') fail('bad code', 400);
    if (!preg_match('/^[a-z0-9]{8,40}$/i', $dev)) fail('bad device', 400);
    $id = substr(alerts_hash('c|' . $code), 0, 16);
    $token = bin2hex(random_bytes(24));
    $r = alerts_mutate(function (array $all) use ($id, $code, $dev, $token) {
        // 名冊裡有、但還沒開通過的開通碼：第一次開通時建立會員資料
        $reg = alerts_registry()[$id] ?? null;
        if (!isset($all[$id]) && $reg && hash_equals((string)$reg['code'], alerts_hash('c|' . $code))) {
            $all[$id] = ['code' => (string)$reg['code'], 'label' => (string)($reg['no'] ?? ''), 'created' => time(), 'items' => [], 'enabled' => true];
            $all = alerts_sync($all);
        }
        $m = $all[$id] ?? null;
        if (!$m || !hash_equals((string)$m['code'], alerts_hash('c|' . $code))) return [$all, 'bad code'];
        if (!empty($m['revoked'])) return [$all, 'revoked'];
        $dh = alerts_hash('d|' . $dev);
        if (!empty($m['device']) && !hash_equals((string)$m['device'], $dh)) return [$all, 'bound'];
        $all[$id]['device'] = $dh;
        $all[$id]['token'] = alerts_hash('t|' . $token);
        $all[$id]['boundAt'] = $all[$id]['boundAt'] ?? time();
        return [$all, 'ok'];
    });
    if ($r !== 'ok') fail((string)$r, $r === 'bad code' ? 404 : 409);
    $all = alerts_read();
    json_out(['ok' => true, 'token' => $token, 'me' => alerts_public($all[$id])]);
}

$token = (string)($in['token'] ?? '');
$all = alerts_read();
$id = alerts_find_by_token($all, $token);
if ($id === null) fail('not activated', 401);

if ($action === 'me') json_out(['ok' => true, 'me' => alerts_public($all[$id])]);

if ($action === 'save') {
    $items = [];
    foreach (array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, ALERT_MAX_ITEMS) as $it) {
        $n = norm_name(mb_substr(trim((string)($it['n'] ?? '')), 0, 40));
        $max = (int)($it['max'] ?? 0); $c = (int)($it['c'] ?? 0) === 1 ? 1 : 0;
        if ($n === '' || $max <= 0) continue;
        $items[] = ['n' => $n, 'max' => min($max, 2000000000), 'c' => $c];
    }
    $discord = trim((string)($in['discord'] ?? ''));
    $email = trim((string)($in['email'] ?? ''));
    if ($discord !== '' && !alerts_valid_webhook($discord)) fail('bad webhook', 400);
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('bad email', 400);
    $enabled = !empty($in['enabled']);
    alerts_mutate(function (array $all) use ($id, $items, $discord, $email, $enabled) {
        if (!isset($all[$id])) return [$all, false];
        $all[$id]['items'] = $items; $all[$id]['discord'] = $discord; $all[$id]['email'] = mb_substr($email, 0, 120); $all[$id]['enabled'] = $enabled;
        // 改了商品就清掉舊的「已通知」紀錄，讓新設定立刻生效
        $keep = array_flip(array_map(fn($x) => $x['n'] . '|' . $x['c'], $items));
        $all[$id]['sent'] = array_intersect_key($all[$id]['sent'] ?? [], $keep);
        return [$all, true];
    });
    json_out(['ok' => true, 'me' => alerts_public(alerts_read()[$id])]);
}

if ($action === 'test') {
    $m = $all[$id];
    if (empty($m['discord']) && empty($m['email'])) fail('no channel', 400);
    $okRate = alerts_mutate(function (array $all) use ($id) {
        $now = time();
        $t = array_values(array_filter($all[$id]['testAt'] ?? [], fn($x) => is_int($x) && $now - $x < 3600));
        if (count($t) >= 3) return [$all, false];
        $t[] = $now; $all[$id]['testAt'] = $t; return [$all, true];
    });
    if (!$okRate) fail('too many tests', 429);
    $ok = alerts_notify($m, '【價格提醒】測試通知', "這是魔力寶貝小工具的測試通知。看到這則訊息，代表價格提醒的通知管道設定成功了！", rtrim((string)cfg('site_url', 'https://starcg.online'), '/') . '/alerts/');
    json_out(['ok' => true, 'sent' => $ok]);
}

fail('unknown action');
