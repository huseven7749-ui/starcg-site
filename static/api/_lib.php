<?php
// 共用函式：輸出、快取、檔案鎖、限流、並行 HTTP
declare(strict_types=1);
require __DIR__ . '/config.php';
date_default_timezone_set('Asia/Taipei');

function cfg(string $k, $default = null) { return $GLOBALS['SC_CONFIG'][$k] ?? $default; }

/** 輸出 JSON（附 ETag，相同內容回 304） */
function json_out(array $data, int $code = 200, int $maxAge = 0): void
{
    $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($body === false) { $code = 500; $body = '{"ok":false,"error":"encode"}'; }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    header($maxAge > 0 && $code === 200 ? "Cache-Control: public, max-age=$maxAge, stale-while-revalidate=30" : 'Cache-Control: no-store');
    $etag = '"' . substr(md5($body), 0, 20) . '"';
    header("ETag: $etag");
    if ($code === 200 && trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    echo $body;
    exit;
}
function fail(string $msg, int $code = 400): void { json_out(['ok' => false, 'error' => $msg], $code); }

/** 名稱正規化：全形轉半形、統一括號、簡體「药」→「藥」 */
function norm_name(string $s): string
{
    if (class_exists('Normalizer')) $s = Normalizer::normalize($s, Normalizer::FORM_KC) ?: $s;
    $s = str_replace(['［', '【', '］', '】', '　', '药'], ['[', '[', ']', ']', ' ', '藥'], $s);
    return trim(preg_replace('/\s+/u', ' ', $s) ?? $s);
}
function strip_br(string $s): string { return preg_replace('/^\[(.*)\]$/u', '$1', norm_name($s)) ?? $s; }
function name_match(string $name, string $q, bool $exact): bool
{
    $a = strip_br($name); $b = strip_br($q);
    return $exact ? $a === $b : ($b === '' || mb_strpos($a, $b) !== false);
}

// ───────────── 快取（原子寫入）─────────────
function cache_path(string $ns, string $key): string
{
    $dir = rtrim((string)cfg('cache_dir'), '/') . '/' . $ns;
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return $dir . '/' . sha1($key) . '.json';
}
function cache_read(string $path): ?array
{
    if (!is_file($path)) return null;
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') return null;
    $d = json_decode($raw, true);
    return is_array($d) ? $d : null;
}
function cache_write(string $path, array $data): void
{
    $tmp = $path . '.' . getmypid() . '.' . bin2hex(random_bytes(3)) . '.tmp';
    if (@file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false) {
        @rename($tmp, $path);
    }
    @unlink($tmp);
}

/** 取得檔案鎖後執行（同一查詢同時只會有一個請求去抓官方，其他人等它寫好快取） */
function with_lock(string $path, callable $fn, float $timeout = 25.0)
{
    $fh = @fopen($path . '.lock', 'c');
    if (!$fh) return $fn();
    $start = microtime(true);
    while (!flock($fh, LOCK_EX | LOCK_NB)) {
        if (microtime(true) - $start > $timeout) { fclose($fh); return null; }
        usleep(150000);
    }
    try { return $fn(); }
    finally { flock($fh, LOCK_UN); fclose($fh); }
}

/** 讀寫一個小 JSON 檔（加鎖），用於限流計數、熱門搜尋 */
function locked_json(string $file, callable $mutate)
{
    $dir = dirname($file);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $fh = @fopen($file, 'c+');
    if (!$fh) return $mutate([])[1] ?? null;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = json_decode($raw ?: '[]', true);
    if (!is_array($data)) $data = [];
    [$data, $ret] = $mutate($data);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data, JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $ret;
}

function client_ip(): string
{
    if (cfg('behind_cloudflare') && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) return (string)$_SERVER['HTTP_CF_CONNECTING_IP'];
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/** 每個 IP 每分鐘最多觸發 N 次實際抓取 */
function rate_allow(): bool
{
    if (PHP_SAPI === 'cli') return true;
    $limit = (int)cfg('rate_limit_per_min', 40);
    $file = rtrim((string)cfg('cache_dir'), '/') . '/rl/' . substr(sha1(client_ip()), 0, 16) . '.json';
    return (bool)locked_json($file, function (array $d) use ($limit) {
        $now = time();
        $d = array_values(array_filter($d, fn($t) => is_int($t) && $now - $t < 60));
        if (count($d) >= $limit) return [$d, false];
        $d[] = $now;
        return [$d, true];
    });
}

/** 全站向官方抓取的頁數預算（每分鐘） */
function upstream_budget(int $pages): bool
{
    $cap = (int)cfg('upstream_pages_per_min', 240);
    $file = rtrim((string)cfg('cache_dir'), '/') . '/budget.json';
    return (bool)locked_json($file, function (array $d) use ($pages, $cap) {
        $min = (int)floor(time() / 60);
        $used = ($d['m'] ?? 0) === $min ? (int)($d['n'] ?? 0) : 0;
        if ($used + $pages > $cap) return [['m' => $min, 'n' => $used], false];
        return [['m' => $min, 'n' => $used + $pages], true];
    });
}

/**
 * 全站同時向官方連線的名額（官方對同一個 IP 超過 2 條同時連線會回 503 service_busy）。
 * 盡量拿 $want 個名額，至少等到 1 個；等太久就回空陣列（呼叫端仍以 1 條連線抓）。
 * @return resource[] 拿到的名額（鎖檔把手），用完交給 upstream_slots_release()
 */
function upstream_slots_acquire(int $want, float $timeout = 20.0): array
{
    if (PHP_SAPI === 'cli') return [];
    $max = max(1, (int)cfg('upstream_slots', 2));
    $dir = rtrim((string)cfg('cache_dir'), '/') . '/slots';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $deadline = microtime(true) + $timeout;
    $got = [];
    while (true) {
        for ($i = 0; $i < $max && count($got) < $want; $i++) {
            if (isset($got[$i])) continue;
            $fh = @fopen("$dir/$i.lock", 'c');
            if (!$fh) continue;
            if (flock($fh, LOCK_EX | LOCK_NB)) $got[$i] = $fh; else fclose($fh);
        }
        if ($got || microtime(true) > $deadline) return $got;
        usleep(150000);
    }
}
function upstream_slots_release(array $got): void
{
    foreach ($got as $fh) { flock($fh, LOCK_UN); fclose($fh); }
}

/**
 * 全站向官方送請求的節奏：每個請求至少間隔 upstream_gap 秒（官方每秒超過 1～2 次就會回 429）。
 * 預約 $n 個請求的時間並等到輪到自己；要等超過 $maxWait 秒就不預約，回傳 false（呼叫端把這批當成失敗）。
 */
function upstream_pace(int $n, float $maxWait): bool
{
    if (PHP_SAPI === 'cli') return true;
    $gap = (float)cfg('upstream_gap', 0.6);
    $file = rtrim((string)cfg('cache_dir'), '/') . '/pace.json';
    $start = (float)locked_json($file, function (array $d) use ($n, $gap, $maxWait) {
        $now = microtime(true);
        $start = max($now, (float)($d['next'] ?? 0));
        if ($start - $now > $maxWait) return [$d, -1.0];
        return [['next' => $start + $gap * $n], $start];
    });
    if ($start < 0) return false;
    $wait = $start - microtime(true);
    if ($wait > 0) usleep((int)($wait * 1e6));
    return true;
}
/** 官方回「忙碌／太頻繁」時：全站下一個請求至少等 $sec 秒（upstream_pace 會照這個時間排隊） */
function upstream_backoff(float $sec): void
{
    if (PHP_SAPI === 'cli') { usleep((int)($sec * 1e6)); return; }
    $file = rtrim((string)cfg('cache_dir'), '/') . '/pace.json';
    locked_json($file, function (array $d) use ($sec) {
        return [['next' => max((float)($d['next'] ?? 0), microtime(true) + $sec)], true];
    });
}

/**
 * 並行 GET。回傳 [url => ['code'=>int, 'body'=>string|null, 'err'=>string|null]]
 */
function http_multi(array $urls, ?int $concurrency = null, ?int $timeout = null, array $extraHeaders = []): array
{
    $concurrency = $concurrency ?? (int)cfg('concurrency', 6);
    $timeout = $timeout ?? (int)cfg('timeout', 12);
    $headers = array_merge([
        'Accept: application/json, text/plain, */*',
        'Accept-Language: zh-TW,zh;q=0.9,en;q=0.6',
        'X-Requested-With: XMLHttpRequest',
    ], $extraHeaders);
    $out = [];
    $queue = array_values(array_unique($urls));
    $mh = curl_multi_init();
    $active = [];
    $add = function () use (&$queue, &$active, $mh, $headers, $timeout) {
        $url = array_shift($queue);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_ENCODING => '',
            CURLOPT_USERAGENT => (string)cfg('user_agent'),
            CURLOPT_REFERER => (string)cfg('referer'),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
        ]);
        curl_multi_add_handle($mh, $ch);
        $active[(int)$ch] = [$ch, $url];
    };
    while ($queue && count($active) < $concurrency) $add();
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 0.5);
        while ($info = curl_multi_info_read($mh)) {
            $ch = $info['handle'];
            [, $url] = $active[(int)$ch];
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $body = curl_multi_getcontent($ch);
            $err = $info['result'] !== CURLE_OK ? curl_error($ch) : null;
            $out[$url] = ['code' => $code, 'body' => $err ? null : $body, 'err' => $err];
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
            unset($active[(int)$ch]);
            if ($queue) $add();
        }
    } while (($running || $active) && $status === CURLM_OK);
    curl_multi_close($mh);
    return $out;
}

/** 解析官方 JSON，失敗回 null（例如回傳了 HTML 錯誤頁） */
function parse_json_body(?string $body): ?array
{
    if ($body === null) return null;
    $t = ltrim($body, "\xEF\xBB\xBF \t\r\n");
    if ($t === '' || ($t[0] !== '{' && $t[0] !== '[')) return null;
    $d = json_decode($t, true);
    return is_array($d) ? $d : null;
}

/** 欄位不分大小寫取值 */
function pick(array $a, array $keys)
{
    foreach ($keys as $k) if (isset($a[$k]) && $a[$k] !== '') return $a[$k];
    $lower = array_change_key_case($a, CASE_LOWER);
    foreach ($keys as $k) { $lk = strtolower($k); if (isset($lower[$lk]) && $lower[$lk] !== '') return $lower[$lk]; }
    return null;
}

/** 熱門搜尋：只記錄「有結果」的關鍵字，時間衰減 */
function hot_record(string $q): void
{
    $q = norm_name($q);
    if (mb_strlen($q) < 2 || mb_strlen($q) > (int)cfg('hot_max_len', 20)) return;
    $file = rtrim((string)cfg('cache_dir'), '/') . '/hot.json';
    $half = (int)cfg('hot_half_life', 21600);
    locked_json($file, function (array $d) use ($q, $half) {
        $now = time();
        $cur = $d[$q] ?? ['s' => 0, 't' => $now];
        $s = $cur['s'] * pow(0.5, ($now - $cur['t']) / $half) + 1;
        $d[$q] = ['s' => round($s, 4), 't' => $now];
        if (count($d) > 300) {
            uasort($d, fn($a, $b) => ($b['s'] * pow(0.5, ($now - $b['t']) / $half)) <=> ($a['s'] * pow(0.5, ($now - $a['t']) / $half)));
            $d = array_slice($d, 0, 200, true);
        }
        return [$d, null];
    });
}
function hot_top(int $n = 10): array
{
    $file = rtrim((string)cfg('cache_dir'), '/') . '/hot.json';
    $d = is_file($file) ? json_decode((string)@file_get_contents($file), true) : [];
    if (!is_array($d)) return [];
    $now = time();
    $half = (int)cfg('hot_half_life', 21600);
    $scored = [];
    foreach ($d as $k => $v) $scored[$k] = ($v['s'] ?? 0) * pow(0.5, ($now - ($v['t'] ?? $now)) / $half);
    arsort($scored);
    return array_map('strval', array_slice(array_keys(array_filter($scored, fn($s) => $s >= 0.5)), 0, $n));
}

function only_get(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') fail('method', 405);
}
