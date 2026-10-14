<?php
// 全市場成交紀錄的增量收集與每日市場動態
// 每 10 分鐘只抓官方成交紀錄最新 1～2 頁（50 筆／頁），依台灣日期存成 cache/records/YYYY-MM-DD.ndjson。
declare(strict_types=1);
require_once __DIR__ . '/_market.php';

function records_dir(): string
{
    $d = rtrim((string)cfg('cache_dir'), '/') . '/records';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}
function tw_day(int $t): string { return gmdate('Y-m-d', $t + 8 * 3600); }

/**
 * 增量收集：從第 1 頁往後抓，直到遇到上次看過的 id。
 * @return array ['added' => int, 'pages' => int, 'lastId' => int]
 */
function records_ingest(int $maxPages): array
{
    $dir = records_dir();
    $stateFile = "$dir/state.json";
    return with_lock($stateFile, function () use ($dir, $stateFile, $maxPages) {
        $state = json_decode((string)@file_get_contents($stateFile), true) ?: ['lastId' => 0, 'at' => 0];
        $lastId = (int)($state['lastId'] ?? 0);
        $new = []; $pages = 0; $maxSeen = $lastId; $done = false;
        for ($page = 1; $page <= $maxPages && !$done; $page++) {
            [$got] = fetch_pages(fn($p) => history_url('all', $p, '', '30d'), [$page]);
            $pages++;
            $logs = $got[$page]['logs'] ?? null;
            if (!is_array($logs) || !$logs) break;
            foreach ($logs as $l) {
                if (!is_array($l) || !($row = parse_log($l)) || $row['id'] === null) continue;
                if ($row['id'] <= $lastId) { $done = true; continue; }
                $new[$row['id']] = $row;
                $maxSeen = max($maxSeen, $row['id']);
            }
            if ($lastId === 0 && $page >= 3) $done = true; // 第一次只回補最近幾頁
            if (!$done) usleep(250000);
        }
        if ($new) {
            ksort($new);
            $byDay = [];
            foreach ($new as $row) $byDay[tw_day($row['t'])][] = json_encode([$row['id'], $row['t'], $row['n'], $row['q'], $row['p'], $row['c']], JSON_UNESCAPED_UNICODE);
            foreach ($byDay as $day => $lines) file_put_contents("$dir/$day.ndjson", implode("\n", $lines) . "\n", FILE_APPEND | LOCK_EX);
        }
        $state = ['lastId' => $maxSeen, 'at' => time()];
        cache_write($stateFile, $state);
        // 只保留 120 天
        foreach (glob("$dir/*.ndjson") ?: [] as $f) {
            if (basename($f, '.ndjson') < tw_day(time() - 120 * 86400)) @unlink($f);
        }
        return ['added' => count($new), 'pages' => $pages, 'lastId' => $maxSeen];
    }, 30.0) ?? ['added' => 0, 'pages' => 0, 'lastId' => 0];
}

/** 讀某一天的成交紀錄 */
function records_day(string $day): array
{
    $f = records_dir() . "/$day.ndjson";
    if (!is_file($f)) return [];
    $out = []; $seen = [];
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $r = json_decode($line, true);
        if (!is_array($r) || isset($seen[$r[0]])) continue;
        $seen[$r[0]] = true;
        $out[] = ['id' => $r[0], 't' => $r[1], 'n' => $r[2], 'q' => $r[3], 'p' => $r[4], 'c' => $r[5]];
    }
    return $out;
}

function median(array $a): ?float
{
    if (!$a) return null;
    sort($a);
    $n = count($a); $m = intdiv($n, 2);
    return $n % 2 ? (float)$a[$m] : ($a[$m - 1] + $a[$m]) / 2;
}
function strip_br_name(string $n): string { return preg_replace('/^\[(.*)\]$/u', '$1', trim($n)) ?? $n; }

/** 單日彙整：每個商品×幣別的成交筆數、數量、中位數、加權均價 */
function records_aggregate(array $rows): array
{
    $agg = [];
    foreach ($rows as $r) {
        $k = strip_br_name($r['n']) . '|' . $r['c'];
        $a = &$agg[$k];
        $a['n'] = strip_br_name($r['n']); $a['c'] = $r['c'];
        $a['count'] = ($a['count'] ?? 0) + 1;
        $a['qty'] = ($a['qty'] ?? 0) + $r['q'];
        $a['sum'] = ($a['sum'] ?? 0) + $r['p'] * $r['q'];
        $a['prices'][] = $r['p'];
        unset($a);
    }
    foreach ($agg as &$a) { $a['median'] = median($a['prices']); $a['wavg'] = $a['sum'] / max(1, $a['qty']); unset($a['prices']); }
    return $agg;
}

/** 每日市場動態 */
function daily_summary(string $day): array
{
    $rows = records_day($day);
    $today = records_aggregate($rows);
    // 前 7 天作為比較基準
    $base = [];
    for ($i = 1; $i <= 7; $i++) {
        $d = tw_day(strtotime($day . ' 12:00:00 +0800') - $i * 86400);
        foreach (records_day($d) as $r) $base[] = $r;
    }
    $prev = records_aggregate($base);
    $totals = ['trades' => count($rows), 'coin' => 0, 'crystal' => 0, 'items' => 0];
    $names = [];
    foreach ($rows as $r) { $totals[$r['c'] ? 'crystal' : 'coin'] += $r['p'] * $r['q']; $names[strip_br_name($r['n'])] = true; }
    $totals['items'] = count($names);
    // 熱門：依成交筆數（兩種幣別合計）
    $hotMap = [];
    foreach ($today as $a) {
        $h = &$hotMap[$a['n']];
        $h['n'] = $a['n'];
        $h['count'] = ($h['count'] ?? 0) + $a['count'];
        $h['qty'] = ($h['qty'] ?? 0) + $a['qty'];
        $h['med'][$a['c']] = $a['median'];
        unset($h);
    }
    usort($hotMap, fn($a, $b) => [$b['count'], $b['qty']] <=> [$a['count'], $a['qty']]);
    $hot = array_slice(array_values($hotMap), 0, 10);
    foreach ($hot as &$h) { ksort($h['med']); $h['med'] = (object) $h['med']; } // 一律輸出 {"0":魔幣,"1":魔晶}
    unset($h);
    // 漲跌：今日中位數 vs 前 7 天中位數（今日 ≥3 筆、前 7 天 ≥5 筆）
    $moves = [];
    foreach ($today as $k => $a) {
        $b = $prev[$k] ?? null;
        if (!$b || $a['count'] < 3 || $b['count'] < 5 || !$b['median']) continue;
        $moves[] = ['n' => $a['n'], 'c' => $a['c'], 'now' => $a['median'], 'before' => $b['median'], 'chg' => ($a['median'] - $b['median']) / $b['median'], 'count' => $a['count']];
    }
    usort($moves, fn($x, $y) => $y['chg'] <=> $x['chg']);
    $up = array_values(array_filter($moves, fn($m) => $m['chg'] > 0.02));
    $down = array_reverse(array_values(array_filter($moves, fn($m) => $m['chg'] < -0.02)));
    $first = $rows ? min(array_column($rows, 't')) : null;
    $last = $rows ? max(array_column($rows, 't')) : null;
    return ['ok' => true, 'day' => $day, 'totals' => $totals, 'hot' => $hot, 'up' => array_slice($up, 0, 5), 'down' => array_slice($down, 0, 5),
        'coverage' => ['from' => $first, 'to' => $last, 'baseDays' => 7], 'fetchedAt' => time()];
}
