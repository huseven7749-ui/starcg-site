# 魔力寶貝小工具（starcg.online）

星詠魔力玩家專用小幫手：市場查價、魔幣魔晶台幣匯率比價、寵物圖鑑與成長模擬、改造圖與技能突破石試算、站內傷害計算機、迷宮找樓梯與每週活動表，整合在同一個網站。
繁體中文（`/`）與韓文（`/ko/`）各有獨立網址與 SEO 設定。

---

## 一、資料夾說明

| 位置 | 內容 |
|---|---|
| `upload_to_public_html/` | **直接上傳到 SiteGround 的 `public_html`**（已用 starcg.online 建置好） |
| `src/` | 原始碼：頁面樣板、樣式、腳本、繁中與韓文文字（`src/i18n/`）、每週活動（`src/data/schedule.json`）、心得文章（`src/posts/`） |
| `static/` | 後端 PHP（`api/`）、排程（`cron/`）、`.htaccess`、寵物圖鑑、裝備目錄與懸賞任務資料（`data/`） |
| `build.mjs` | 建置腳本（需要 Node.js 18 以上，無其他套件） |
| `tools/` | 字型子集、圖示與分享圖產生器、裝備／懸賞目錄產生器（`build-catalogs.py`）、本機測試用的假官方 API |
| `tests/` | 公式單元測試、畫面與 SEO 檢查 |
| `old-site-redirect.htaccess` | 舊站 cg-hoshino.online 的 301 轉址設定（保留舊站排名） |

## 二、部署到 SiteGround

1. **網域**：在 SiteGround「Site Tools」新增網站並使用 `starcg.online`。網域若在別家註冊，把 Nameserver 改成 SiteGround 提供的 `ns1/ns2.siteground.net`，或把 A 紀錄指到 SiteGround 給的 IP。
2. **SSL**：Site Tools → Security → SSL Manager 申請 Let's Encrypt，並開啟「HTTPS Enforce」。
3. **PHP 版本**：Site Tools → Devs → PHP Manager 選 **8.1 以上**（建議 8.2/8.3）。需要 curl 與 intl，SiteGround 預設都有。
4. **上傳**：Site Tools → Site → File Manager，進入 `public_html`，把 `upload_to_public_html` 裡的**所有檔案**（包含隱藏的 `.htaccess`）上傳。最簡單的方法是先壓成 zip 上傳，再在 File Manager 裡解壓。
5. **權限**：確認 `cache/`、`img/pets/`、`data/` 三個資料夾權限是 755（PHP 要能寫入快取、寵物圖片與每日圖鑑）。
6. **快取設定**：Site Tools → Speed → Caching → Dynamic Cache，把 `/api/*` 加進排除清單（API 自己會控制快取）。
7. **排程（Cron Jobs）**：Site Tools → Devs → Cron Jobs 新增（路徑依你的帳號調整）：
   - 每日同步寵物圖鑑（建議）：`10 5 * * *` → `php /home/customer/www/starcg.online/public_html/cron/sync-pets.php`（會順便補抓缺的寵物圖片；沒設也行，`api/pets.php` 在圖鑑超過一天沒更新時會自動向攻略網同步一次，每次部署也會同步）
   - 收集成交紀錄、產生「每日市場動態」（建議）：`*/10 * * * *` → `php /home/customer/www/starcg.online/public_html/cron/ingest.php`（每次只抓新增的 1～幾頁；沒設也能用，會在有人看每日動態時順便補抓，最多每 10 分鐘一次）
   - 預熱熱門搜尋（選用）：`*/5 * * * *` → `php /home/customer/www/starcg.online/public_html/cron/warm.php`
8. **上線檢查**：
   - 開 `https://starcg.online/` 與 `https://starcg.online/ko/`
   - 開 `https://starcg.online/api/market.php?q=水晶`，應回傳 JSON（`"ok":true`）
   - 市場查價頁搜尋任一商品，第二次查同一個應該幾乎瞬間出現
   - 開 `https://starcg.online/img/pets/104956.gif`，第一次會從攻略網抓回並存在本站

## 二之一、之後的更新怎麼做（GitHub 自動部署）

程式碼放在 GitHub 倉庫，推到 `main` 分支後，`.github/workflows/deploy.yml` 會自動建置、跑單元測試，再用 SSH（rsync）把 `dist/` 同步到 SiteGround 的 `public_html`，約 1～2 分鐘完成。快取（`cache/`）、寵物圖片（`img/pets/`）、伺服器上同步的寵物圖鑑（`data/pets.json`）與本機設定檔不會被覆蓋或刪除；部署完會在伺服器上跑一次 `cron/sync-pets.php`，Actions 紀錄裡看得到「已更新圖鑑：N 筆」。

一次性設定：
1. GitHub 建私人倉庫，把整個專案推上去（或由 Claude 推）。
2. SiteGround Site Tools → Devs → SSH Keys Manager → Generate，複製 Private Key；同一頁的 Manage → Show credentials 可看到主機、使用者與連接埠（18765）。
3. GitHub 倉庫 → Settings → Secrets and variables → Actions → New repository secret，新增 `SG_HOST`、`SG_USER`、`SG_PORT`、`SG_KEY`、`SG_PASS`（金鑰密碼）、`SG_PATH`（例如 `/home/customer/www/starcg.online/public_html`）。
4. 同頁的 Variables 可選填 `WELCOME_VIDEO`／`WELCOME_VIDEO_KO`（新手彈窗的中／韓教學影片）、`SPONSOR_URL`／`SPONSOR_URL_KO`（贊助站長連結，預設同教學影片）、`GOOGLE_VERIFY`、`NAVER_VERIFY`（搜尋引擎驗證碼）。留空時使用 `build.mjs` 內的預設網址。
5. 之後只要推送（或在 Actions 頁按 Run workflow）就會自動上線；Actions 分頁可看每次部署的結果。

## 三、市場查價怎麼做到「快、省、準」

- **只有伺服器去抓官方**：瀏覽器只呼叫本站 `/api/market.php` 一次，伺服器並行抓官方各頁（最多 6 條連線）、整理成精簡格式後一次回傳，不再經過第三方 CORS 代理。
- **快取 60 秒**：同一個關鍵字 60 秒內直接回快取（約 10 ms）；成交紀錄快取 3 分鐘。
- **合併重複請求**：很多人同時查同一個商品時，只會有一個請求去抓官方，其他人等它寫好快取。
- **保護官方網站**：每個 IP 每分鐘最多觸發 20 次實際抓取，全站每分鐘最多抓 240 頁，單次查詢最多 25 頁（約 500 攤）。
- **正確性**：翻頁期間有人上下架時，依攤位 cdkey 與道具唯一碼去重；已過期攤位不列出；有頁面抓不到會標示「結果可能不完整」；官方暫時掛掉時回傳 1 小時內的舊資料並明確標示。
- **分類瀏覽／批次採購**：一次查多個商品走 `/api/batch.php`（每次最多 30 個名稱），每個名稱各自用 60 秒快取，只算一次頻率限制；寵物瀏覽使用 5 分鐘的寵物攤位快照，很多人同時瀏覽也只抓一次。
- **每日市場動態**：`/api/daily.php` 讀取伺服器累積的成交紀錄（`cache/records/日期.ndjson`，保留 120 天），統計當日熱門、漲跌幅（今日中位數 vs 前 7 天中位數）。
- 參數都在 `api/config.php`，可依流量調整。

### 市場查價頁的功能

| 分頁 | 功能 |
|---|---|
| 市價比較 | 關鍵字查詢；裝備依分類／等級瀏覽、寵物依種族／檔次／懸賞任務瀏覽；分流、幣別、排序、只看最低價、只看可滿足需求數量的攤位；寵物篩滿星／滿檔／滿技／技能欄／等級；我的最愛與最近搜尋 |
| 近期成交 | 7／30／90 天或全部、依數量加權均價、中位數、最低／最高、每日走勢圖、匯出 CSV；可切換用「匯入資料」當來源 |
| 擺攤定價 | 參考中位數與常見區間（25%～75%），輸入售價試算扣手續費（魔幣 10%、魔晶 6%）後實收、與中位數相比、在目前攤位的排名 |
| 追蹤清單 | 一鍵重新整理全部追蹤商品（批次查詢） |
| 每日市場動態 | 今日／昨日的成交筆數、成交額、熱門商品、漲幅與跌幅 |
| 批次採購 | 選商品與數量（預設懸賞任務寵物，也可選裝備分類、水晶、自訂），依分流×幣別規劃要跑的攤位與走法（路程優先／少跑攤位／價格優先），起點可選城門或自訂並儲存 |
| 資料管理 | 匯入自己的成交紀錄（CSV／JSON）、匯出、備份與還原本站存在瀏覽器的所有設定 |

> 村莊商店（NPC 販賣）比價：程式已預留，資料檔 `static/data/village-shops.json` 目前是空的，所以這個選項不會顯示。有正確的村莊商店資料後填進去即可自動出現。

## 四、SEO 已完成項目

- 每頁獨立標題、描述、canonical、Open Graph／Twitter 分享圖（每頁每語言一張）
- 繁中與韓文互相標示 `hreflang`（含 `x-default`），sitemap 內也有對應關係
- 結構化資料：WebSite（含站內搜尋框）、Organization、BreadcrumbList、WebApplication、FAQPage
- `robots.txt`、`sitemap.xml`、語意化標題層級、圖片 alt、行動版友善、PWA
- 靜態頁面＋雜湊檔名長期快取、字型子集化（介面中文約 160 KB、韓文約 55 KB；寵物／裝備名稱用字另成一個補充檔，只有頁面用到時才下載）、無外部框架

**上線後請做：**
1. **Google Search Console**：新增「網域」資源 `starcg.online`，用 DNS TXT 驗證，接著提交 `https://starcg.online/sitemap.xml`。
2. **Naver Search Advisor**（韓國搜尋）：新增網站後選「HTML 태그」驗證，把驗證碼給我（或自行執行 `node build.mjs --naver=驗證碼`）重新建置，再提交 sitemap。
3. **Bing Webmaster Tools**：可直接從 Search Console 匯入。
4. **舊站轉址**：把 `old-site-redirect.htaccess` 的內容放到 cg-hoshino.online 的 `.htaccess`，舊網址會 301 轉到新站對應頁面，保留原本的搜尋排名。

## 五、日常維護

- **改文字**：繁中 `src/i18n/zh.mjs`、韓文 `src/i18n/ko.mjs`（兩邊的鍵要一致）。
  - 腳本用的字串（`js.*`、`common.*`、`wel.*`、`guide.*`、`day.*`）每頁都會內嵌；各工具的字串只放在該頁（`build.mjs` 的 `DICT_GROUPS`：market → `mk|bk|dm|eqc|pet|market.type`、pets → `pet|eqc`、remodel → `rm`、exchange → `ex`、damage → `dmg`、maze → `mz`）。新增工具或在別頁用到別組字串時要加進去，否則 `T()` 會回傳鍵名。
- **改每週活動**：`src/data/schedule.json`。
- **說明文字**：頁面上只放最必要的字，補充說明用 `{{tip:字串鍵}}`（ⓘ 圖示，點了才展開）；長的使用方式、公式都收在可展開的區塊裡。
- **角色圖**：放在 `src/assets/img/sprites/`（GIF 動畫＋同名 `-still.png` 靜態第一格，給設定「減少動態效果」的使用者）。新角色要在 `build.mjs` 的 `SPRITES` 登記；頁面樣板用 `{{pic:名稱 class}}`，腳本用 `spriteImg('名稱')`。目前的安排：鼠王＝各頁引導與官方市場卡；五色小鼠＝首頁各工具卡（顏色對應工具色）；冒險者＝坐著（還沒有資料／等待）、四處張望（找不到、404）、奔跑（搜尋中、規劃路線中）、歡呼（註冊好禮、最划算方案、魔法結果）、攻擊（物理傷害結果）。
- **重新建置**：`node build.mjs`（輸出到 `dist/`，再上傳）。換網域：`node build.mjs --site=https://新網域`。
- **贊助站長連結**：預設是 BobaBoba 贊助頁（`build.mjs` 內 `SPONSOR`），可用 `--sponsor=` / `--sponsor-ko=` 或 GitHub Variables `SPONSOR_URL` / `SPONSOR_URL_KO` 覆蓋。首頁「贊助站長」卡片會先跳出彈窗：請大家到教學影片下留言，想贊助再點連結。
- **新手彈窗的教學影片**：`node build.mjs --video=YouTube網址或mp4網址`。第一次來的人會看到歡迎彈窗（依裝置顯示加到我的最愛／加到主畫面的步驟），影片放在彈窗上方；沒給時顯示「教學影片準備中」。看過會記在瀏覽器裡不再跳出，設定面板有「再看一次新手教學」。
- **新增大量新文字後**：先 `node build.mjs`，再重新產生字型子集 `python3 tools/subset-fonts.py dist <粉圓.ttf> <GowunDodum.ttf>`，然後再建置一次（會一併收錄腳本字典與 `data/` 內的名稱；沒做也能正常顯示，只是新字會改用系統字型）。字型原檔：jf open 粉圓 GitHub releases、Gowun Dodum（yangheeryu/Gowun-Dodum）。
- **寵物圖鑑**：來源是星詠攻略網的 `guide.starcg.net/data/pets.json`（`api/config.php` 的 `upstream_pets`）。伺服器上的 `data/pets.json` 由 cron／部署／`api/pets.php`（超過一天沒更新時）同步，倉庫裡的 `static/data/pets.json` 只是第一次部署的種子，不會覆蓋伺服器的版本；若攻略網缺某隻寵物，本站也會缺，要等上游補。同步狀態在 `cache/pets-sync.json`。
- **官方市場格式若改版**：只需調整 `static/api/_market.php` 的整理邏輯。

## 五之一、心得分享（寫文章）

- 文章放在 `src/posts/`，一篇一個 `.md` 檔，**檔名就是網址**（英文小寫、數字、連字號），例如 `pet-leveling.md` → `https://starcg.online/posts/pet-leveling/`。
- 開頭填文章資訊（照 `src/posts/_範本.md` 複製最快；底線開頭的檔案不會發佈）：

  ```
  ---
  title: 文章標題
  date: 2026-10-20
  desc: 一句話摘要（顯示在列表與 Google 搜尋結果）
  tags: 新手, 賺錢
  ---
  ```
- 內文用簡單的 Markdown：`## 小標題`、`**粗體**`、`- 清單`、`1. 編號`、`> 提醒`、`[連結](網址)`、表格；圖片放 `src/posts/img/`，文中寫 `![說明](img/檔名.png)`。
- 韓文版：同名加 `.ko.md`（例如 `pet-leveling.ko.md`），兩篇會自動互相連結並標示 hreflang；只有中文的文章也會出現在韓文列表（標示語言）。
- 想先存草稿：開頭加 `draft: yes`。
- 建置時會自動產生：文章列表、首頁「最新心得」、上一篇／下一篇、麵包屑、BlogPosting 結構化資料、sitemap。
- 文章修改後可加 `updated: 2026-10-25`，搜尋引擎會看到更新日期。

## 六、測試

```bash
node tests/unit.mjs                       # 公式單元測試
php -S 127.0.0.1:8091 -t tools/mock &     # 假官方 API
tools/dev-rebuild.sh                      # 建置並接上假 API
php -S 127.0.0.1:8090 -t dist tools/router.php &
python3 tests/e2e.py http://127.0.0.1:8090 shots    # 電腦／手機、日／夜、中／韓 截圖與錯誤檢查
python3 tests/market_features.py http://127.0.0.1:8090 shots  # 市場頁各功能實際操作
python3 tests/mobile_overflow.py http://127.0.0.1:8090 shots  # 手機版文字是否超出底色框（含說明彈出框、心得頁、迷宮頁）
python3 tests/maze_e2e.py http://127.0.0.1:8090 shots         # 迷宮找樓梯：用假的遊戲資料夾測試自動讀取、換層、這趟探索
python3 tests/seo_check.py dist https://starcg.online
```

## 六之一、迷宮找樓梯（/maze/）

- 純前端，沒有後端：用瀏覽器的 File System Access API（電腦版 Chrome／Edge）讀取遊戲 `StarCG_Data\map\<分流>\*.dat`，資料夾權限存在 IndexedDB，之後開頁面直接接上（瀏覽器可能再問一次「允許」，選「每次造訪都允許」就不會再問）。其他瀏覽器只能手動選檔或拖曳。
- 地圖檔格式（`src/assets/js/mazedat.js`）：20 bytes 檔頭（第 12、16 byte 起為寬、高 int32 小端序），接著三層 uint16：地面、物件、標記，索引＝南×寬＋東。標記 `0xC003` 為出入口；物件編號決定種類（12000/12001、13268+偶數…為上樓梯，12002/12003、13268+奇數…為下樓梯，物件 0 為水晶，14676 為傳送點）。地面 0 或 100 代表尚未探索。
- 「目前樓層」＝分流資料夾裡最後修改的 .dat；「新的一趟」會把當時所有 .dat 內容存進 IndexedDB 當基準，之後與基準不同的格子才算這趟新探索（舊記錄畫淡、樓梯標「舊記錄」），並依出現順序編第 1、2、3 層。
- 寶箱、怪物、NPC 不在地圖檔裡，由使用者在地圖上手動標記（跟著這趟探索存在 IndexedDB）。「結束探索」後出現「打包分享」：填迷宮名稱、分流、重製時間後，把每層樓梯／水晶座標與手動標記整理成純文字一鍵複製（`buildPack`／`packText`）。
- 不會寫入、刪除遊戲檔案。示範模式用 `demoMaze()` 產生隨機迷宮，與真實遊戲無關。

## 六之二、韓文站的市場搜尋

- 官方市場 API 帶 `lang=ko` 會回傳韓文名稱，而且韓文關鍵字只有在 `lang=ko` 時才搜得到（中文關鍵字兩種都搜得到）。韓文站的所有 API 請求都會自動帶 `lang=ko`（`core.js` 的 `api()`），後端（`market.php`、`history.php`、`batch.php`）在韓文模式會把同一頁再用中文抓一次，用攤位＋順序（或道具唯一碼／紀錄 id）配對出中文名：回傳的 `n` 維持中文（所有比對、圖鑑、裝備分類照舊），多一個 `kn` 是韓文；前端顯示時韓文站優先用 `kn`。
- 韓文關鍵字在中文版搜不到時配不到中文名，就查 `cache/dict/ko.json` 的中韓對照；對照是從每次配對成功的資料、以及 `cron/ingest.php` 每次收集成交紀錄時順便學起來的，用得越久越完整。查不到對照時 `n` 會直接是韓文名（只影響圖鑑／分類等附加資訊）。
- 本機測試：`tools/mock` 的假官方 API 也支援 `lang=ko`（少數名稱有假韓文），`tests/market_features.py` 的 `[ko]` 段落會驗證。

## 六之三、遊戲化（冒險手冊、每日任務、成就）

- 全部在前端，狀態只存在瀏覽器 `localStorage` 的 `sc.game`（經驗值、起司、各事件計數、成就、頭像、今日任務與連續天數），沒有後端、沒有帳號；`src/assets/js/game.js` 每頁都載入。右上角「冒險手冊」按鈕（手機在「更多」）打開面板：等級／稱號、今日任務、頭像、成就、匯出／匯入代碼（`SCG1.<base64>`，換瀏覽器時用，匯入採取最大值合併）。
- 事件與經驗值在 `game.js` 的 `EVENTS` 表（每項有每日上限）；各頁用 `track('事件名')` 回報：查價／複製座標／批次採購（market）、單品比價（exchange）、寵物模擬（pets）、模擬刷場（remodel）、打木樁（damage）、迷宮探索／打包（maze）、看心得文、首頁彩蛋。等級 = 1 + ⌊√(XP／50)⌋，稱號與頭像依等級解鎖（`TITLES`、`AVATARS`）。
- 每日任務：`QUESTS` 池裡依日期挑 3 個（同一天大家一樣），完成一個 +20 XP +1 起司、全完成再 +30，連續天數與最佳紀錄一起記。成就在 `ACH`（29 個，條件是事件計數的函式），解鎖 +40 XP 並跳提示＋小老鼠跑過。
- 小遊戲：傷害頁「打木樁」在算出的範圍內隨機出手，看實際分布（直方圖、必殺率）；改造頁「模擬刷場」一場一場隨機跑出改造圖與突破石，對照期望值分五段判定（歐皇 ≥150%、小歐 110～149%、普通 90～109%、小非 51～89%、非酋 ≤50%）；迷宮「結束探索」後有結算評級（S／A／B／C，依層數、樓梯、標記、探索格數）與存圖；首頁連點鼠王 5 下會跳舞、輸入 ↑↑↓↓←→←→BA（或長按鼠王）下老鼠雨。
- 新增文字都在 `game.*`（`zh.mjs`／`ko.mjs`）；新增事件時：`EVENTS` 加一列、頁面呼叫 `track`、需要的話加任務或成就與對應文字。

## 七、計算依據與假設

- 寵物能力：魔力寶貝原廠公式（1 等 BP＝（檔次＋隨機檔）×0.2、每級＋檔次÷24、BP→能力係數矩陣），與星詠魔力 gamerch 攻略「寵物須知」公布的係數一致；評分為攻略公布公式的估算。
- 改造：成功率 100/75/50/25/15%、保底 1/3/5/9/13 次、手續費與 BP 加成取自 gamerch「寵物洗檔、升星、改造」。
- 改造圖：掉落率、每場成本與合成比例沿用舊站設定，可在頁面上修改；A～D 編號假設均等掉落；改造失敗一定會消耗改造圖，每次嘗試都算一套。
- 魔幣魔晶台幣匯率預設 1 台幣＝40 魔晶、3,000 魔晶＝100 萬魔幣，使用者可自行修改並存在瀏覽器。
- 魔物幻境：第一層 100% 普卡、第二層 普 80%／銀 20%、第三層 普 60%／銀 32%／金 8%；改造圖可在休息室替換同級其他種族或字母，因此預設「同級 4 張＝1 套」。
- 技能突破石：第二層、第三層首領各自獨立判定，掉率 5%、15%；打到第三層＝兩次機會，100 場平均 20 顆。
- 傷害計算機為站內原生實作：攻擊／防禦超過 240 的部分以 30% 計算、基礎傷害＝攻²×3÷(攻＋防×3)、亂數 90%～110%、必殺追加＝防×攻方等級÷(防方等級×2)；魔法需求精神、精神差距與法杖魔攻倍率依 gamerch「魔法精神理論」，魔法基礎傷害與技能倍率取自玩家社群實測資料。

## 八、授權

- 圓體字型子集：jf open 粉圓（SIL OFL 1.1）、Gowun Dodum（SIL OFL 1.1），依授權改名為 StarRound／StarRoundKO，授權全文在 `src/assets/fonts/`。
- 寵物圖片與圖鑑資料來自星詠攻略網；本站為非官方玩家工具站。
