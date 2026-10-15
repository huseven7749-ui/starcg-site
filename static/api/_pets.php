<?php
// 寵物圖鑑同步：從星詠攻略網下載 pets.json，驗證後覆寫 data/pets.json。
// cron/sync-pets.php（每天，含補圖）與 api/pets.php（資料太舊時順便更新）共用。
declare(strict_types=1);

function pets_file(): string { return __DIR__ . '/../data/pets.json'; }
function pets_state_file(): string { return rtrim((string)cfg('cache_dir'), '/') . '/pets-sync.json'; }

/** 上次同步狀態 {at, ok, count, msg} */
function pets_state(): array
{
    $s = json_decode((string)@file_get_contents(pets_state_file()), true);
    return is_array($s) ? $s : [];
}
function pets_state_set(array $patch): void
{
    locked_json(pets_state_file(), fn($s) => [array_merge($s, $patch), null]);
}

/**
 * 下載並驗證圖鑑；成功時覆寫 data/pets.json（內容相同則不動）。
 * @return array{ok:bool, msg:string, count:int, changed:bool}
 */
function pets_sync(int $timeout = 30): array
{
    $dataFile = pets_file();
    $src = (string)cfg('upstream_pets');
    $done = function (bool $ok, string $msg, int $count = 0, bool $changed = false) use ($dataFile) {
        pets_state_set(['at' => time(), 'ok' => $ok, 'count' => $count, 'msg' => $msg, 'mtime' => (int)@filemtime($dataFile)]);
        return ['ok' => $ok, 'msg' => $msg, 'count' => $count, 'changed' => $changed];
    };
    $res = http_multi([$src], 1, $timeout);
    $r = $res[$src] ?? null;
    $list = $r && $r['code'] === 200 ? parse_json_body($r['body']) : null;
    if (!is_array($list) || !array_is_list($list)) return $done(false, '下載失敗（HTTP ' . ($r['code'] ?? 0) . '），保留現有資料');

    // 驗證：至少 100 筆，且每筆都有名稱與五項檔次
    $clean = [];
    foreach ($list as $p) {
        if (!is_array($p) || trim((string)($p['name'] ?? '')) === '') continue;
        foreach (['hp', 'power', 'defense', 'speed', 'magic'] as $k) if (!is_numeric($p[$k] ?? null)) continue 2;
        $clean[] = $p;
    }
    $old = json_decode((string)@file_get_contents($dataFile), true);
    $oldCount = is_array($old) ? count($old) : 0;
    if (count($clean) < 100 || count($clean) < $oldCount * 0.8) return $done(false, '資料筆數異常（' . count($clean) . " / 原本 $oldCount），不覆寫", count($clean));

    $json = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($old !== null && $json === json_encode($old, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) {
        @touch($dataFile);     // 記住「確認過是最新的」時間
        return $done(true, '圖鑑無變動（' . count($clean) . ' 筆）', count($clean));
    }
    if (is_file($dataFile)) @copy($dataFile, $dataFile . '.prev');
    $tmp = $dataFile . '.tmp';
    if (file_put_contents($tmp, $json) === false || !rename($tmp, $dataFile)) { @unlink($tmp); return $done(false, '寫入失敗（請確認 data/ 可寫入）', count($clean)); }
    return $done(true, '已更新圖鑑：' . count($clean) . " 筆（原本 $oldCount 筆）", count($clean), true);
}

/** 圖鑑裡所有圖片編號（含造型） */
function pets_image_ids(?array $list = null): array
{
    $list ??= json_decode((string)@file_get_contents(pets_file()), true) ?: [];
    $ids = [];
    foreach ($list as $p) {
        $ids[] = preg_replace('/\D/', '', (string)($p['imageId'] ?? ''));
        foreach (($p['skins'] ?? []) as $s) $ids[] = preg_replace('/\D/', '', (string)($s['imageId'] ?? ''));
    }
    return array_values(array_unique(array_filter($ids)));
}

/** 資料超過 maxAge 秒沒更新、且距上次嘗試超過 retry 秒，就同步一次（給網頁請求用，不補圖、逾時短） */
function pets_sync_if_stale(int $maxAge = 86400, int $retry = 21600, int $timeout = 8): ?array
{
    $file = pets_file();
    $mtime = (int)@filemtime($file);
    if ($mtime && time() - $mtime < $maxAge) return null;
    $st = pets_state();
    if (time() - (int)($st['at'] ?? 0) < $retry) return null;
    return with_lock(pets_state_file(), function () use ($timeout, $retry) {
        $st = pets_state();                                   // 等鎖期間可能已有人同步完
        if (time() - (int)($st['at'] ?? 0) < $retry) return null;
        return pets_sync($timeout);
    }, 5.0);
}
