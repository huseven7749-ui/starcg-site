<?php
// 市場與成交紀錄：抓取、驗證、整理成精簡格式
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

const SC_ITEM_STATS = [
    'ITEM_MODIFYATTACK' => 'atk', 'ITEM_MODIFYDEFENCE' => 'def', 'ITEM_MODIFYAGILITY' => 'agi',
    'ITEM_MODIFYMAGIC' => 'spt', 'ITEM_MODIFYRECOVERY' => 'rec', 'ITEM_MODIFYCRITICAL' => 'crit',
    'ITEM_MODIFYCOUNTER' => 'ctr', 'ITEM_MODIFYHITRATE' => 'hit', 'ITEM_MODIFYAVOID' => 'avd',
    'ITEM_MODIFYHP' => 'hp', 'ITEM_MODIFYFORCEPOINT' => 'mp', 'ITEM_ADM' => 'matk', 'ITEM_RSS' => 'mres',
];
const SC_ITEM_RES = [
    'ITEM_POISON' => 'poison', 'ITEM_SLEEP' => 'sleep', 'ITEM_STONE' => 'stone',
    'ITEM_DRUNK' => 'drunk', 'ITEM_CONFUSION' => 'confusion', 'ITEM_AMNESIA' => 'amnesia',
];

function market_url(string $type, bool $exact, int $page, string $q): string
{
    return cfg('upstream_market') . '?' . http_build_query([
        'ajax' => 1, 'type' => $type, 'server' => 'all', 'exact' => $exact ? 1 : 0, 'page' => $page, 'search' => $q,
    ], '', '&', PHP_QUERY_RFC3986);
}
function history_url(string $type, int $page, string $q, string $range = '30d'): string
{
    return cfg('upstream_history') . '?' . http_build_query([
        'ajax' => 1, 'type' => $type, 'page' => $page, 'search' => $q, 'range' => $range,
    ], '', '&', PHP_QUERY_RFC3986);
}

/** 官方成交紀錄的一筆 log → 精簡格式（單價一律為「上架價」，即含手續費前） */
function parse_log(array $l): ?array
{
    $id = $l['id'] ?? null;
    $name = trim((string)($l['item_name'] ?? ''));
    $qty = max(1, (int)($l['qty'] ?? 1));
    if ($name === '') { // 舊格式：「購買3個：[道具名]」
        $buff = (string)($l['buff'] ?? '');
        if (preg_match('/購買(\d+)個[:：]\s*(.+)$/u', $buff, $m)) { $qty = max(1, (int)$m[1]); $name = trim($m[2]); }
        else $name = trim(preg_replace('/^.*?[:：]/u', '', $buff) ?? $buff);
    }
    if ($name === '') return null;
    $c = (int)($l['pricetype'] ?? 0);
    if (isset($l['unit_gross_price'])) $p = (int)$l['unit_gross_price'];
    elseif (isset($l['gross_price'])) $p = (int)ceil((int)$l['gross_price'] / $qty);
    else {
        $fee = $c === 1 ? 0.94 : 0.9; // 官方手續費：魔晶 6%、魔幣 10%
        $net = isset($l['unit_price']) ? (float)$l['unit_price'] : (float)($l['price'] ?? 0) / $qty;
        $p = (int)ceil($net / $fee);
    }
    $t = (int)($l['ts'] ?? $l['time'] ?? 0);
    if ($t <= 0) $t = tw_time($l['time_text'] ?? null) ?? 0;
    return ['id' => $id !== null ? (int)$id : null, 't' => $t, 'n' => $name, 'q' => $qty, 'p' => $p, 'c' => $c];
}

/** 抓一批頁面，失敗的再重試一次。回傳 [page => data]、失敗頁碼 */
function fetch_pages(callable $urlOf, array $pages): array
{
    $got = [];
    $todo = $pages;
    for ($round = 0; $round < 2 && $todo; $round++) {
        if (!upstream_budget(count($todo))) break;
        $urls = [];
        foreach ($todo as $p) $urls[$p] = $urlOf($p);
        $res = http_multi(array_values($urls));
        $next = [];
        foreach ($urls as $p => $u) {
            $r = $res[$u] ?? null;
            $d = ($r && $r['code'] === 200) ? parse_json_body($r['body']) : null;
            if ($d !== null) $got[$p] = $d; else $next[] = $p;
        }
        $todo = $next;
        if ($todo) usleep(300000);
    }
    return [$got, $todo];
}

/** 台灣時間字串 → Unix 秒 */
function tw_time(?string $s): ?int
{
    if (!$s || !preg_match('/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/', $s, $m)) return null;
    return gmmktime((int)$m[4] - 8, (int)$m[5], (int)($m[6] ?? 0), (int)$m[2], (int)$m[3], (int)$m[1]);
}

/**
 * 從官方抓取市場資料並整理
 * @return array|null  null 代表第一頁就失敗
 */
function market_fetch(string $q, string $type, bool $exact, ?int $maxPagesOverride = null): ?array
{
    $t0 = microtime(true);
    [$first, $failed] = fetch_pages(fn($p) => market_url($type, $exact, $p, $q), [1]);
    if (!isset($first[1])) return null;
    $p1 = $first[1];
    $perPage = max(1, (int)($p1['perPage'] ?? 20));
    $total = max(0, (int)($p1['totalFiltered'] ?? 0));
    $pagesTotal = max(1, (int)ceil($total / $perPage));
    $maxPages = $maxPagesOverride ?? (int)cfg('market_max_pages', 25);
    $pagesWanted = min($pagesTotal, $maxPages);
    $pagesData = [1 => $p1];
    $failed = [];
    if ($pagesWanted > 1) {
        [$more, $failed] = fetch_pages(fn($p) => market_url($type, $exact, $p, $q), range(2, $pagesWanted));
        $pagesData += $more;
    }
    ksort($pagesData);

    // 合併：攤位依 cdkey 去重（翻頁期間有人上下架時避免重複），道具再依唯一碼去重
    $now = time();
    $stalls = []; $stallIdx = []; $items = []; $pets = []; $seenItem = []; $seenStall = [];
    $expired = 0;
    foreach ($pagesData as $d) {
        $itemsBy = is_array($d['itemsByCd'] ?? null) ? $d['itemsByCd'] : [];
        $petsBy = is_array($d['petsByCd'] ?? null) ? $d['petsByCd'] : [];
        foreach (($d['stalls'] ?? []) as $st) {
            $cd = (string)($st['cdkey'] ?? '');
            if ($cd === '' || isset($seenStall[$cd])) continue;
            $seenStall[$cd] = true;
            $exp = tw_time($st['expires'] ?? null);
            if ($exp !== null && $exp < $now) { $expired++; continue; } // 已過期的攤位不列出
            $matched = [];
            foreach (($itemsBy[$cd] ?? []) as $it) {
                if (!is_array($it)) continue;
                $name = trim((string)($it['ITEM_TRUENAME'] ?? $it['ITEM_FIRSTNAME'] ?? ''));
                if ($name === '' || !name_match($name, $q, $exact)) continue;
                $uc = (string)($it['ITEM_UNIQUECODE'] ?? '');
                $dk = $uc !== '' ? "u:$uc" : "c:$cd:" . count($matched) . ":$name:" . ($it['price'] ?? '');
                if (isset($seenItem[$dk])) continue;
                $seenItem[$dk] = true;
                $row = ['n' => $name, 'id' => (int)($it['ITEM_ID'] ?? 0), 'p' => (int)($it['price'] ?? 0), 'c' => (int)($it['pricetype'] ?? 0),
                    'q' => max(1, (int)($it['ITEM_REMAIN'] ?? 1)), 'lv' => (int)($it['ITEM_LEVEL'] ?? 0)];
                $dmax = (int)($it['ITEM_MAXDURABILITY'] ?? 0);
                if ($dmax > 0) $row['d'] = [(int)($it['ITEM_DURABILITY'] ?? 0), $dmax];
                $st2 = [];
                foreach (SC_ITEM_STATS as $src => $k) { $v = (int)($it[$src] ?? 0); if ($v !== 0) $st2[$k] = $v; }
                if ($st2) $row['st'] = $st2;
                $rs = [];
                foreach (SC_ITEM_RES as $src => $k) { $v = (int)($it[$src] ?? 0); if ($v !== 0) $rs[$k] = $v; }
                if ($rs) $row['rs'] = $rs;
                $arg = (string)($it['ITEM_ARGUMENT'] ?? '');
                if ($arg !== '') $row['arg'] = mb_substr($arg, 0, 60);
                $matched[] = ['item', $row];
            }
            foreach (($petsBy[$cd] ?? []) as $pet) {
                if (!is_array($pet)) continue;
                $name = trim((string)(pick($pet, ['Name', 'name', 'PET_NAME']) ?? ''));
                if ($name === '' || !name_match($name, $q, $exact)) continue;
                $row = ['n' => $name, 'p' => (int)($pet['price'] ?? 0), 'c' => (int)($pet['pricetype'] ?? 0),
                    'lv' => (int)(pick($pet, ['Lv', 'lv', 'Level']) ?? 1), 'tr' => (int)(pick($pet, ['Trans', 'trans']) ?? 0),
                    'sl' => (int)(pick($pet, ['Slot', 'slot']) ?? 0)];
                $ap = pick($pet, ['AllocPoint', 'allocPoint']);
                $pa = pick($pet, ['PetAllocPoint', 'petAllocPoint', 'PetRandAllocPoint', 'petRandAllocPoint']);
                if ($ap !== null) $row['ap'] = (int)str_replace(',', '', (string)$ap);
                if ($pa !== null) $row['pa'] = (int)str_replace(',', '', (string)$pa);
                $matched[] = ['pet', $row];
            }
            if (!$matched) continue;
            if (!isset($stallIdx[$cd])) {
                $stallIdx[$cd] = count($stalls);
                $stalls[] = ['n' => (string)($st['name'] ?? ''), 'sv' => isset($st['server']) ? (int)$st['server'] : null,
                    'x' => isset($st['x']) ? (int)$st['x'] : null, 'y' => isset($st['y']) ? (int)$st['y'] : null,
                    'loc' => (string)($st['coords'] ?? ''), 'exp' => (string)($st['expires'] ?? '')];
            }
            foreach ($matched as [$kind, $row]) {
                $row = ['s' => $stallIdx[$cd]] + $row;
                if ($kind === 'item') $items[] = $row; else $pets[] = $row;
            }
        }
    }
    $fetched = count($pagesData);
    return [
        'ok' => true, 'q' => $q, 'type' => $type, 'exact' => $exact ? 1 : 0,
        'fetchedAt' => time(), 'tookMs' => (int)round((microtime(true) - $t0) * 1000),
        'pages' => ['fetched' => $fetched, 'total' => $pagesTotal, 'failed' => array_values($failed)],
        'totalStalls' => $total, 'receivedStalls' => count($seenStall), 'expiredStalls' => $expired,
        'truncated' => $pagesTotal > $maxPages,
        'complete' => !$failed && $pagesTotal <= $maxPages,
        'stalls' => $stalls, 'items' => $items, 'pets' => $pets,
    ];
}

/** 成交紀錄（官方預設近 30 天、新到舊） */
function history_fetch(string $q, string $type, int $pages, string $range = '30d'): ?array
{
    $t0 = microtime(true);
    [$first] = fetch_pages(fn($p) => history_url($type, $p, $q, $range), [1]);
    if (!isset($first[1])) return null;
    $p1 = $first[1];
    $perPage = max(1, (int)($p1['perPage'] ?? 50));
    $total = max(0, (int)($p1['totalFiltered'] ?? 0));
    $pagesTotal = max(1, (int)ceil($total / $perPage));
    $want = min($pagesTotal, $pages);
    $data = [1 => $p1];
    $failed = [];
    if ($want > 1) { [$more, $failed] = fetch_pages(fn($p) => history_url($type, $p, $q, $range), range(2, $want)); $data += $more; }
    ksort($data);
    $logs = []; $seen = [];
    foreach ($data as $d) {
        foreach (($d['logs'] ?? []) as $l) {
            if (!is_array($l) || !($row = parse_log($l))) continue;
            $key = $row['id'] !== null ? 'i:' . $row['id'] : "t:{$row['t']}|{$row['p']}|{$row['c']}|{$row['n']}|{$row['q']}";
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $logs[] = $row;
        }
    }
    return [
        'ok' => true, 'q' => $q, 'type' => $type, 'fetchedAt' => time(), 'tookMs' => (int)round((microtime(true) - $t0) * 1000),
        'range' => (string)($p1['range'] ?? $range), 'requestedRange' => $range, 'total' => $total,
        'pages' => ['fetched' => count($data), 'total' => $pagesTotal, 'failed' => array_values($failed)],
        'truncated' => $pagesTotal > $want, 'logs' => $logs,
    ];
}

/**
 * 有快取就用快取，沒有就抓（同查詢合併成一次抓取）。
 * @return array [資料或 null, 錯誤碼]
 */
function cached_get(string $ns, string $key, int $ttl, bool $fresh, callable $fetch, bool $checkRate = true): array
{
    $path = cache_path($ns, $key);
    $cached = cache_read($path);
    $now = time();
    $minAge = $fresh ? (int)cfg('fresh_min_age', 20) : $ttl;
    if ($cached && $now - (int)$cached['fetchedAt'] < $minAge) return [$cached + ['cached' => true], 200];
    if ($checkRate && !rate_allow()) {
        if ($cached && $now - (int)$cached['fetchedAt'] < (int)cfg('stale_max_age', 3600)) return [$cached + ['cached' => true, 'stale' => true], 200];
        return [null, 429];
    }
    $res = with_lock($path, function () use ($path, $minAge, $fetch) {
        $c = cache_read($path); // 等鎖期間別人可能已經抓好了
        if ($c && time() - (int)$c['fetchedAt'] < $minAge) return $c + ['cached' => true];
        $d = $fetch();
        if ($d !== null) cache_write($path, $d);
        return $d;
    });
    if ($res) return [$res, 200];
    if ($cached && $now - (int)$cached['fetchedAt'] < (int)cfg('stale_max_age', 3600)) return [$cached + ['cached' => true, 'stale' => true], 200];
    return [null, 502];
}

function with_age(array $d): array
{
    $d['age'] = max(0, time() - (int)$d['fetchedAt']);
    $d['cached'] = $d['cached'] ?? false;
    $d['stale'] = $d['stale'] ?? false;
    return $d;
}
