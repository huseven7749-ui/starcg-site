<?php
// 星詠魔力工具站：後端設定。一般不需要修改；要調整請改下列數值。
$SC_CONFIG = [
    // 官方資料來源
    'upstream_market'  => 'https://member.starcg.net/market.php',
    'upstream_history' => 'https://member.starcg.net/marketrecord.php',
    'upstream_pets'    => 'https://guide.starcg.net/data/pets.json',
    'upstream_pet_img' => 'https://guide.starcg.net/pet/%s.gif',
    'upstream_fx'      => 'https://open.er-api.com/v6/latest/TWD',   // 各國匯率（台幣基準）
    'referer'          => 'https://member.starcg.net/market.php',
    'user_agent'       => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 StarCGTools/1.0 (+https://starcg.online)',

    // 快取（秒）
    'cache_dir'        => __DIR__ . '/../cache',
    'market_ttl'       => 60,     // 同一個查詢 60 秒內直接回快取
    'history_ttl'      => 180,    // 成交紀錄 3 分鐘
    'fresh_min_age'    => 20,     // 使用者按「重新整理」時，快取至少要 20 秒才重抓
    'stale_max_age'    => 3600,   // 官方暫時掛掉時，最多回傳 1 小時內的舊資料

    // 抓取上限（保護官方網站也保護自己的主機）
    'market_max_pages'  => 25,    // 單次查詢最多抓 25 頁（約 500 個攤位）
    'history_max_pages' => 10,
    'batch_max_names'   => 30,    // 批次查價一次最多幾個商品
    'pet_browse_ttl'    => 300,   // 全部寵物攤位快取 5 分鐘
    'pet_browse_max_pages' => 50,
    'concurrency'       => 6,     // 同時連線數
    'timeout'           => 12,    // 單頁逾時（秒）
    'rate_limit_per_min'     => 20,   // 每個 IP 每分鐘最多觸發 20 次「實際向官方抓取」
    'upstream_pages_per_min' => 240,  // 全站每分鐘最多向官方抓 240 頁

    // 熱門搜尋
    'hot_half_life' => 6 * 3600,  // 熱度半衰期 6 小時
    'hot_max_len'   => 20,

    // 若網站放在 Cloudflare 後面，改為 true 以取得訪客真實 IP
    'behind_cloudflare' => false,
];

// 本機測試用覆寫（正式環境不需要這個檔案）
if (is_file(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
}
