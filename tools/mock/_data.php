<?php
// 測試用假官方資料（格式比照 member.starcg.net 的 ajax 回應）
function mock_alloc(array $v): int { $p = [64**4, 64**3, 64**2, 64, 1]; $n = 0; foreach ($v as $i => $x) $n += $x * $p[$i]; return $n; }
function mock_stalls(): array {
    mt_srand(42);
    $names = ['水的水晶碎片', '地的水晶碎片', '火的水晶碎片', '風的水晶碎片', '硬皮靴', '寵物改造圖A', '寵物改造圖B', '寵物改造圖C', '寵物改造圖D', '重來的種子', '藍色靈魂石', '紅色靈魂石'];
    $stallNames = ['半魔時水滿星', '小星的雜貨鋪', '便宜賣', '法蘭城口', '寵物專賣', '魔晶批發', '晚安攤', '水晶大特價'];
    $pets = [['赤焰年獸', [29, 54, 17, 23, 6]], ['年獸', [32, 52, 16, 21, 8]], ['帕魯凱斯', [31, 50, 20, 19, 9]]];
    $out = [];
    for ($i = 0; $i < 57; $i++) {
        $cd = 'cd' . str_pad((string)$i, 3, '0', STR_PAD_LEFT) . '_1' . ($i % 5);
        $exp = date('Y-m-d H:i:s', time() + 8 * 3600 - (int)date('Z') + ($i === 3 ? -600 : 3600 + $i * 200));
        $stall = ['server' => 1 + $i % 3, 'name' => $stallNames[$i % count($stallNames)], 'x' => 200 + $i, 'y' => 100 + $i % 40, 'time' => time() - 600,
            'cdkey' => $cd, 'coords' => '法蘭城 [東:' . (200 + $i) . ' 南:' . (100 + $i % 40) . ']', 'expires' => $exp];
        $items = []; $petsOut = [];
        $n = 1 + $i % 3;
        for ($k = 0; $k < $n; $k++) {
            $nm = $names[($i * 3 + $k) % count($names)];
            $lv = str_contains($nm, '改造圖') ? 5 + ($i + $k) % 3 : 1;
            $crystal = ($i + $k) % 3 === 0;
            $base = ['水的水晶碎片' => 900, '地的水晶碎片' => 800, '火的水晶碎片' => 950, '風的水晶碎片' => 700, '硬皮靴' => 950, '重來的種子' => 120000][$nm] ?? (300000 * ($lv - 4));
            $price = $crystal ? max(1, (int)round($base / 3846 * (0.8 + mt_rand(0, 40) / 100))) : (int)round($base * (0.8 + mt_rand(0, 40) / 100));
            $items[] = ['cdkey' => $cd, 'price' => $price, 'pricetype' => $crystal ? 1 : 0, 'ITEM_ID' => $nm === '藍色靈魂石' ? 1007001 : 18000 + $k, 'ITEM_TRUENAME' => $nm,
                'ITEM_REMAIN' => str_contains($nm, '水晶') ? 1 + $i % 20 : 1, 'ITEM_LEVEL' => $lv, 'ITEM_DURABILITY' => $nm === '硬皮靴' ? 80 : 0, 'ITEM_MAXDURABILITY' => $nm === '硬皮靴' ? 100 : 0,
                'ITEM_MODIFYDEFENCE' => $nm === '硬皮靴' ? 12 : 0, 'ITEM_MODIFYAGILITY' => $nm === '硬皮靴' ? 3 : 0, 'ITEM_POISON' => $nm === '硬皮靴' && $i % 2 ? 10 : 0,
                'ITEM_ARGUMENT' => $nm === '重來的種子' ? '2|-1|0|0|0' : '', 'ITEM_UNIQUECODE' => "u{$i}_{$k}", 'ITEM_MODIFYATTACK' => 0];
        }
        if ($i % 4 === 1) {
            [$pn, $pb] = $pets[$i % 3];
            $drop = $pb; if ($i % 8 === 1) $drop[1] -= 2;
            $petsOut[] = ['Name' => $pn, 'Lv' => 1 + $i, 'Trans' => $i % 2, 'Slot' => 8, 'AllocPoint' => (string)mock_alloc($drop), 'PetAllocPoint' => mock_alloc([0, 1, 0, 0, 0]),
                'price' => ($i % 3 ? 3000000 + $i * 10000 : 900), 'pricetype' => $i % 3 ? 0 : 1];
        }
        $out[] = [$stall, $items, $petsOut];
    }
    return $out;
}
// 假的中韓對照（模擬官方 lang=ko 回傳韓文名；沒有對照的名稱維持中文）
function mock_ko(string $n): string {
    static $d = ['水的水晶碎片' => '물의 수정 조각', '火的水晶碎片' => '불의 수정 조각', '地的水晶碎片' => '땅의 수정 조각', '風的水晶碎片' => '바람의 수정 조각',
        '硬皮靴' => '가죽 부츠', '皮靴' => '부츠', '格鬥劍' => '격투검', '長鍔劍' => '장검', '寵物改造圖A' => '펫 개조도 A', '重來的種子' => '다시 시작의 씨앗',
        '年獸' => '연수', '赤焰年獸' => '적염 연수', '紫水晶' => '자수정', '藍色靈魂石' => '푸른 영혼석'];
    $core = preg_replace('/^\[(.*)\]$/u', '$1', $n);
    if (!isset($d[$core])) return $n;
    return $core === $n ? $d[$core] : '[' . $d[$core] . ']';
}
function mock_lang_match(string $zh, string $q, string $lang): bool {
    if ($q === '') return true;
    if (str_contains($zh, $q)) return true;
    return $lang === 'ko' && str_contains(mock_ko($zh), $q);
}
