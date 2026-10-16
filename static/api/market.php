<?php
// GET /api/market.php?q=關鍵字&type=all|item|pet&exact=1&fresh=1&lang=ko（韓文站）
// 寵物可不帶關鍵字（type=pet&q=）：取得全部寵物攤位，快取 5 分鐘，供種族／卡等瀏覽與滿星等篩選。
declare(strict_types=1);
require __DIR__ . '/_market.php';
only_get();

$q = norm_name(mb_substr((string)($_GET['q'] ?? ''), 0, 40));
$type = (string)($_GET['type'] ?? 'all');
if (!in_array($type, ['all', 'item', 'pet'], true)) $type = 'all';
$exact = ($_GET['exact'] ?? '') === '1';
$fresh = ($_GET['fresh'] ?? '') === '1';
$browse = $q === '' && $type === 'pet';
if ($q === '' && !$browse) fail('missing q');
$lang = api_lang();                      // 韓文站：lang=ko → 名稱多一個 kn（韓文），關鍵字可用韓文
$sfx = $lang === 'ko' ? '|ko' : '';

[$data, $code] = $browse
    ? cached_get('market', 'm|pet|all' . $sfx, (int)cfg('pet_browse_ttl', 300), $fresh, fn() => market_fetch('', 'pet', false, (int)cfg('pet_browse_max_pages', 50), $lang))
    : cached_get('market', "m|$type|" . (int)$exact . "|$q" . $sfx, (int)cfg('market_ttl', 60), $fresh, fn() => market_fetch($q, $type, $exact, null, $lang));
if (!$data) fail_upstream($code);
if (!$browse && $lang === 'zh' && (!empty($data['items']) || !empty($data['pets']))) hot_record($q);
json_out(with_age($data), 200, 15);
