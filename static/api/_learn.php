<?php
// 主動學韓文名：從本站名錄（裝備、生產配方、寵物圖鑑）挑還沒有韓文對照的名稱，
// 到官方成交紀錄用中文名查韓文版（近 30 天），有人買賣過就把中韓名稱記到 cache/dict/ko.json。
// 由 api/stats.php 的 10 分鐘例行工作呼叫，每次只查幾個，不會給官方太大負擔；同一個名稱查不到的話 7 天後再試。
declare(strict_types=1);
require_once __DIR__ . '/_market.php';

function learn_names(): array
{
    $names = [];
    $data = __DIR__ . '/../data';
    $eq = json_decode((string)@file_get_contents("$data/equipment.json"), true);
    foreach (($eq['items'] ?? []) as $e) if (!empty($e[0])) $names[] = (string)$e[0];
    $cr = json_decode((string)@file_get_contents("$data/crafting.json"), true);
    foreach (($cr['cats'] ?? []) as $list) foreach ((array)$list as $it) {
        if (!empty($it['n'])) $names[] = (string)$it['n'];
        foreach (($it['m'] ?? []) as $m) if (!empty($m[0])) $names[] = preg_replace('/^[一二三四五六七八九十]+級/u', '', (string)$m[0]);
    }
    $pets = json_decode((string)@file_get_contents("$data/pets.json"), true);
    foreach ((is_array($pets) ? $pets : []) as $p) if (!empty($p['name'])) $names[] = (string)$p['name'];
    return array_values(array_unique(array_filter($names)));
}

/** @return string 摘要 */
function learn_ko(int $max = 4): string
{
    $dict = dict_get();
    $stateFile = rtrim((string)cfg('cache_dir'), '/') . '/dict/learn.json';
    $state = cache_read($stateFile) ?: ['tried' => []];
    $now = time();
    $todo = [];
    foreach (learn_names() as $n) {
        if (isset($dict['zh'][$n])) continue;                                    // 已經有韓文名
        if ($now - (int)($state['tried'][$n] ?? 0) < 7 * 86400) continue;        // 7 天內查過
        $todo[] = $n;
        if (count($todo) >= $max) break;
    }
    $got = 0;
    foreach ($todo as $n) {
        $state['tried'][$n] = $now;
        try { history_fetch($n, 'all', 1, '30d', 'ko'); } catch (Throwable $e) { /* 下次再試 */ }
        usleep(300000);
    }
    $fresh = cache_read(dict_file()) ?: [];   // dict_get 在同一個請求內有快取，重新讀檔看學到幾個
    foreach ($todo as $n) if (isset($fresh['zh'][$n])) $got++;
    $state['tried'] = array_slice($state['tried'], -5000, null, true);
    cache_write($stateFile, $state);
    $missing = 0; foreach (learn_names() as $n) if (!isset($fresh['zh'][$n])) $missing++;
    return sprintf('韓文名：查 %d 個，學到 %d 個，名錄還缺 %d 個', count($todo), $got, $missing);
}
