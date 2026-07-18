# X:\class — 學習管理系統（給接手的模型）

先讀全域 `C:\Users\Josh\.claude\CLAUDE.md` 的不變量與路由表；本檔只放專案事實。**現況細節與版本史：`docs\handoff-2026-07-16.md`**（找不到再翻更早的 handoff-*）。

## 專案不變量（違反即事故）
1. 伺服器啟動/重啟一律用 `啟動.bat`，不要直接 `node server.js`。
2. 測試一律用「測試用帳號」（id 7）或「測試用帳號B」（id 8，邦正資料複本）；絕不動真實帳號（邦正/炎朗）。`data\app.db` 是正式資料，孩子的真實學習紀錄在裡面。
3. 動 migration 前先備份 `data\app.db`（VACUUM INTO，WAL 熱複製不可靠）。migration 在 `db\db.js` `openAndMigrate()`，必須冪等（pragma/sqlite_master guard）、編號接續；驗證法：重啟兩次皆無錯。`db\schema.sql` 每次啟動都會 exec，語句必須 IF NOT EXISTS。
4. 新 UI 字串同步 `public\js\i18n.js` 三字典（zh-TW/en/ja）；完成後 Grep 新 key 命中數必須 = 3。
5. SQLite 對 UTC 時間戳欄（created_at/done_at/earned_at）做日期比較一律 `date(col,'localtime')`；純日期欄直接字串比較；前端禁用 `toISOString().slice`（用 api.js 的 today()/ymd() 或 period-filter.js 的 localD()）。點數/XP 寫入包 transaction（仿 routes\shop.js redeemTx）。
6. 產品最終使用者是學生（小孩）：文案繁中、鼓勵導向；機制偏獎勵、不懲罰。
7. `require('./db/db')` 有副作用（跑 migration）：任何會 require db 的腳本先設 `DB_PATH=<拋棄式路徑>`；正式備份要在任何 require db 之前完成。

## 架構速覽
Express 5 + better-sqlite3（WAL），入口 `server.js`。無框架 SPA：`public\app.html` 殼＋`public\js\*.js`（hash router，一頁一模組）。API 在 `routes\`；純邏輯在 `utils\`（測試 `test\`，跑 `npm test`）。徽章在 `badges\`。RARITY_PTS 唯一出處 `utils\points.js`（已收斂，勿再重複定義）。頁面模組新版慣例：世代守衛 `_gen`＋無參數 `refresh()`＋`period-filter.js` 共用元件（範本看 grades.js）。
**Android App 已遷出**（2026-07-17）：原生 App（完全單機，Kotlin+Compose+Room）已拆到獨立**私有** repo `X:\learning-tracker-android`（GitHub private `joshseestyle-moon/learning-tracker-android`），準備上架 Google Play 商業化——**App 相關程式碼與文件絕不放進本公開 repo**。App 的 i18n 由該 repo 的 `tools\extract-i18n.js` 跨 repo 讀本 repo 的 `public\js\i18n.js`（環境變數 `WEB_I18N_PATH`）——改動 web 字典結構（TRANSLATIONS 物件形狀）前要想到這個下游。

## 省 token 提示（本專案實測的坑）
- `public\js\i18n.js` >1100 行：先 Grep 定位再帶 offset/limit 讀。
- `db\db.js`：看 migration 只讀檔案末段。
- 系統全貌別自己掃：`SYSTEM_DOC.md`/`TECH_SPEC.md` 或派 Explore。
- 遊戲化慣例（XP/point reason 樣式、徽章兌換循環、toast 通道、測試資料清理）：`docs\handoff-2026-07-16.md` §3。**徽章 user_badges 空列 ≠ 漏頒**，那是兌換循環的正常狀態（§3 有查證紀錄）。

## 進行中的工作
- 分支慣例：每批工作開新分支，完成驗證後**經使用者同意**合回 main；勿直接動 main；commit 逐檔 add。
- 現況（2026-07-18）：web 到「文案/流程優化＋copy-user-data M25＋goals statement 快取」皆已合 main（領先 origin 1 commit：App 遷出 `ad0d59f`，未 push）；Android App 已遷出至私有 repo（見上），`dev-android-app` 分支已刪除，本 repo 僅剩 `main`。未決清單見 handoff §5。

## 教訓紀錄
（格式見 `C:\Users\Josh\.claude\rules\40-maintenance.md`；新教訓往下加）
- [2026-07-08] 情境：用 Bash 工具跑 啟動.bat｜錯誤假設：Git Bash 能處理中文檔名｜修正：中文檔名的 .bat 用 PowerShell 工具跑（`& ".\啟動.bat"`，run_in_background）｜規則已更新：否，單點技巧記在此即可
- [2026-07-08] 情境：db.js 加 Migration 19 用了 `subCols` 變數名｜錯誤假設：新變數名沒被用過｜修正：openAndMigrate() 同一函式作用域，加 migration 前先 Grep 變數名，慣例用編號後綴（subCols19）｜規則已更新：否，此條即紀錄
- [2026-07-09] 情境：goals 頁炸 `null.newBadges`｜錯誤假設：所有 API 都回 JSON 物件｜修正：api.js 攔截器已改為先驗 `data && typeof data === 'object'`，新端點回 null/純值前端不用改｜規則已更新：否，api.js 集中防護即根治
- [2026-07-09] 情境：`git add -A` 把 DB 備份（真實資料）commit 進 repo｜錯誤假設：.gitignore 會擋｜修正：本 repo 一律逐檔 `git add <路徑>`，絕不用 add -A/add .；.gitignore 已加 `*.bak-*`｜規則已更新：是，.gitignore 即規則
- [2026-07-10] 情境：`node -e "require('./utils/gamify')"` 冒煙測試讓 db.js 對正式 app.db 跑了 migration｜錯誤假設：require 只是載入｜修正：已昇華為本檔不變量 7｜規則已更新：是
