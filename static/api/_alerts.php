<?php
// 價格提醒（會員功能）：開通碼、裝置綁定、提醒設定、通知（Discord Webhook／Email）
// 資料存在 cache/alerts/members.json（不會被部署覆蓋）。開通碼只存雜湊，看不到原碼。
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

const ALERT_MAX_ITEMS = 3;
const ALERT_COOLDOWN = 6 * 3600;   // 同一個商品 6 小時內不重複通知（除非價格更低）

function alerts_dir(): string { $d = rtrim((string)cfg('cache_dir'), '/') . '/alerts'; if (!is_dir($d)) @mkdir($d, 0700, true); return $d; }
function alerts_file(): string { return alerts_dir() . '/members.json'; }
function alerts_hash(string $s): string { return hash('sha256', 'sc-alert|' . $s); }
function alerts_read(): array { $d = json_decode((string)@file_get_contents(alerts_file()), true); return alerts_sync(is_array($d) ? $d : []); }
/** 加鎖改寫 members.json；$fn 收到整份資料，回傳 [新資料, 回傳值] */
function alerts_mutate(callable $fn) { return locked_json(alerts_file(), fn(array $all) => $fn(alerts_sync($all))); }

/** 站長金鑰：部署時由 GitHub Secret ALERT_ADMIN_KEY 寫到 cache/alerts/admin.key（cache 資料夾禁止外部讀取，也不會被部署覆蓋） */
function alerts_admin_key(): string
{
    $k = (string)cfg('alerts_admin_key', '');
    if ($k === '' && is_file(alerts_dir() . '/admin.key')) $k = trim((string)@file_get_contents(alerts_dir() . '/admin.key'));
    return strlen($k) >= 12 ? $k : '';
}

/** 新開通碼：XXXX-XXXX-XXXX（不含容易看錯的 0/O/1/I） */
function alerts_new_code(): string
{
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $s = '';
    for ($i = 0; $i < 12; $i++) $s .= $abc[random_int(0, strlen($abc) - 1)];
    return substr($s, 0, 4) . '-' . substr($s, 4, 4) . '-' . substr($s, 8, 4);
}
function alerts_norm_code(string $c): string { $c = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $c) ?? ''); return strlen($c) === 12 ? substr($c, 0, 4) . '-' . substr($c, 4, 4) . '-' . substr($c, 8, 4) : ''; }

function alerts_valid_webhook(string $u): bool { return (bool)preg_match('#^https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/webhooks/\d{5,30}/[\w-]{20,120}$#', $u); }

/** 送 Discord Webhook，成功回 true */
function alerts_send_discord(string $url, string $title, string $text, string $link = ''): bool
{
    if (!alerts_valid_webhook($url)) return false;
    $embed = ['title' => mb_substr($title, 0, 250), 'description' => mb_substr($text, 0, 3500), 'color' => 0xD9654A];
    if ($link !== '') $embed['url'] = $link;
    $body = json_encode(['username' => '魔力寶貝小工具', 'embeds' => [$embed]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_USERAGENT => (string)cfg('user_agent', 'StarCGTools')]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code >= 200 && $code < 300;
}

/** 寄 Email（主機內建 mail()），成功回 true */
function alerts_send_mail(string $to, string $title, string $text): bool
{
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $from = (string)cfg('alerts_mail_from', 'noreply@starcg.online');
    $headers = [
        'From: =?UTF-8?B?' . base64_encode('魔力寶貝小工具') . "?= <$from>",
        'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', 'MIME-Version: 1.0',
    ];
    return @mail($to, '=?UTF-8?B?' . base64_encode($title) . '?=', $text, implode("\r\n", $headers), '-f' . $from);
}

/** 依會員設定送出通知（Discord 和 Email 都有就兩個都送），回傳成功的管道 */
function alerts_notify(array $m, string $title, string $text, string $link = ''): array
{
    $ok = [];
    if (!empty($m['discord']) && alerts_send_discord((string)$m['discord'], $title, $text . ($link ? "\n$link" : ''), $link)) $ok[] = 'discord';
    if (!empty($m['email']) && alerts_send_mail((string)$m['email'], $title, $text . ($link ? "\n\n$link" : '') . "\n\n— starcg.online 價格提醒（到網站的「價格提醒」頁可以修改或停用）")) $ok[] = 'email';
    return $ok;
}

/** 名冊（倉庫裡 _alert_codes.php，由 tools/alert-code.py 維護）：id → 設定 */
function alerts_registry(): array
{
    static $reg = null;
    if ($reg === null) {
        $reg = [];
        $list = is_file(__DIR__ . '/_alert_codes.php') ? (require __DIR__ . '/_alert_codes.php') : [];
        foreach (is_array($list) ? $list : [] as $e) if (!empty($e['id']) && !empty($e['code'])) $reg[(string)$e['id']] = $e;
    }
    return $reg;
}
/** 把名冊的狀態套到會員資料：會員編號當標籤、停用、解除裝置綁定 */
function alerts_sync(array $all): array
{
    foreach (alerts_registry() as $id => $e) {
        if (!isset($all[$id])) continue;
        $all[$id]['label'] = (string)($e['no'] ?? ($all[$id]['label'] ?? ''));
        $all[$id]['revoked'] = !empty($e['revoked']);
        $reset = (int)($e['reset'] ?? 0);
        if ($reset > (int)($all[$id]['resetSeen'] ?? 0)) {
            unset($all[$id]['device'], $all[$id]['token'], $all[$id]['boundAt']);
            $all[$id]['resetSeen'] = $reset;
        }
    }
    return $all;
}

/** 找出一筆會員資料（用 token） */
function alerts_find_by_token(array $all, string $token): ?string
{
    if (strlen($token) < 20) return null;
    $h = alerts_hash('t|' . $token);
    foreach ($all as $k => $m) if (($m['token'] ?? '') === $h && empty($m['revoked'])) return $k;
    return null;
}
/** 給前端看的會員資料（不含雜湊） */
function alerts_public(array $m): array
{
    return [
        'label' => (string)($m['label'] ?? ''), 'items' => $m['items'] ?? [], 'discord' => (string)($m['discord'] ?? ''), 'email' => (string)($m['email'] ?? ''),
        'enabled' => !empty($m['enabled']), 'last' => $m['last'] ?? [], 'checkedAt' => (int)($m['checkedAt'] ?? 0), 'boundAt' => (int)($m['boundAt'] ?? 0),
    ];
}

/**
 * 檢查所有會員的提醒（cron 每 10 分鐘跑一次）。同一個商品只向官方抓一次。
 * @return string 摘要
 */
function alerts_run(): string
{
    require_once __DIR__ . '/_market.php';
    $all = alerts_read();
    $want = [];
    foreach ($all as $k => $m) {
        if (!empty($m['revoked']) || empty($m['enabled']) || empty($m['token'])) continue;
        if (empty($m['discord']) && empty($m['email'])) continue;
        foreach (($m['items'] ?? []) as $it) if (($it['n'] ?? '') !== '') $want[norm_name((string)$it['n'])] = true;
    }
    if (!$want) return '價格提醒：沒有啟用中的提醒';
    // 每個商品抓一次（沿用市場快取，2 分鐘內查過就不再打官方）
    $best = [];
    foreach (array_keys($want) as $n) {
        // 名稱不用打完整：用模糊搜尋，所有名稱含這個關鍵字的商品都算（例如「妖草」會比對妖草的血、妖草的根…）
        [$d] = cached_get('market', "m|item|0|$n", (int)cfg('market_ttl', 120), false, fn() => market_fetch($n, 'item', false, 5), false);
        if (!$d) continue;
        foreach (($d['items'] ?? []) as $row) {
            $c = (int)($row['c'] ?? 0); $p = (int)($row['p'] ?? 0);
            if ($p <= 0) continue;
            $rn = (string)($row['n'] ?? '');
            if ($rn !== '' && mb_strpos(norm_name($rn), $n) === false) continue;
            if (!isset($best[$n][$c]) || $p < $best[$n][$c]['p']) $best[$n][$c] = ['p' => $p, 'q' => (int)($row['q'] ?? 1), 'nm' => $rn ?: $n, 'st' => $d['stalls'][$row['s']] ?? []];
        }
        usleep(400000);
    }
    $sent = 0; $now = time();
    $site = rtrim((string)cfg('site_url', 'https://starcg.online'), '/');
    $res = alerts_mutate(function (array $all) use ($best, $now, $site, &$sent) {
        foreach ($all as $k => &$m) {
            if (!empty($m['revoked']) || empty($m['enabled']) || empty($m['token'])) continue;
            $m['checkedAt'] = $now;
            foreach (($m['items'] ?? []) as $it) {
                $n = norm_name((string)($it['n'] ?? '')); $c = (int)($it['c'] ?? 0); $max = (int)($it['max'] ?? 0);
                if ($n === '' || $max <= 0) continue;
                $b = $best[$n][$c] ?? null;
                $m['last'][$n] = $b ? ['p' => $b['p'], 'c' => $c, 'nm' => $b['nm'], 'at' => $now] : ['p' => null, 'c' => $c, 'at' => $now];
                if (!$b || $b['p'] > $max) continue;
                $prev = $m['sent'][$n . '|' . $c] ?? null;
                if ($prev && $now - (int)$prev['at'] < ALERT_COOLDOWN && $b['p'] >= (int)$prev['p']) continue;
                $cur = $c === 1 ? '魔晶' : '魔幣';
                $st = $b['st'];
                $where = trim((isset($st['sv']) && $st['sv'] !== null ? '分流 ' . $st['sv'] . '　' : '') . (string)($st['loc'] ?? ''));
                $nm = (string)$b['nm'];
                $title = "【價格提醒】{$nm} 只要 " . number_format($b['p']) . " {$cur}";
                $text = "你設定的「{$n}」低於 " . number_format($max) . " {$cur} 了！\n商品：{$nm}\n目前最低：" . number_format($b['p']) . " {$cur}（數量 {$b['q']}）\n攤位：" . ((string)($st['n'] ?? '') ?: '—') . ($where ? "　$where" : '') . "\n攤位到期：" . ((string)($st['exp'] ?? '') ?: '—');
                $ok = alerts_notify($m, $title, $text, $site . '/market/?q=' . rawurlencode($nm));
                if ($ok) { $m['sent'][$n . '|' . $c] = ['p' => $b['p'], 'at' => $now]; $sent++; }
            }
        }
        unset($m);
        return [$all, true];
    });
    return sprintf('價格提醒：檢查 %d 個商品，送出 %d 則通知', count($want), $sent);
}
