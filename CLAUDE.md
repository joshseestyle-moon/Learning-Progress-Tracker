# X:\class — 學習管理系統（給接手的模型）

先讀全域 `C:\Users\Josh\.claude\CLAUDE.md` 的不變量與路由表；本檔只放專案事實。

## 專案不變量（違反即事故）
1. 伺服器啟動/重啟一律用 `啟動.bat`，不要直接 `node server.js`。
2. 測試一律用「測試用帳號」；絕不動真實帳號（如 炎朗）。`data\app.db` 是正式資料，孩子的真實學習紀錄在裡面。
3. 動 migration 前先複製備份 `data\app.db`。migration 寫在 `db\db.js` `openAndMigrate()` 內，必須冪等（`pragma table_info` / `sqlite_master` guard）、編號接續（目前最新編號直接看該函式末尾）。驗證法：重啟伺服器兩次皆無錯。
4. 新 UI 字串必須同步 `public\js\i18n.js` 內 zh-TW/en/ja 三個字典；完成後 Grep 新 key，命中數必須 = 3。
5. SQLite 日期查詢一律加 `'localtime'`；點數/XP 類寫入包 better-sqlite3 transaction（仿 `routes\shop.js` 的 `redeemTx`）。
6. 產品的最終使用者是學生（小孩）：UI 文案以繁中、鼓勵導向為預設；機制設計偏獎勵、不懲罰。

## 架構速覽
Express 5 + better-sqlite3（WAL），入口 `server.js`。無框架 SPA：`public\app.html` 殼 + `public\js\*.js`（hash router，一頁一模組，template-literal HTML）。API 在 `routes\*.js`；純邏輯在 `utils\*.js`（node --test，測試在 `test\`，跑 `npm test`）。schema = `db\schema.sql` + `db\db.js` 內嵌 migrations。徽章邏輯在 `badges\checker.js` + `definitions.js`。已知重複點：`RARITY_PTS` 重複定義於 checker.js / badges.js / shop.js / db.js（改任一處要同步，或趁機收斂到 `utils\points.js`）。

## 省 token 提示（本專案實測的坑）
- `public\js\i18n.js` >1100 行：先 Grep 定位行號，再帶 offset/limit 讀，不要整檔讀。
- `db\db.js`：看 migration 只讀檔案末段。
- 系統全貌別自己掃：`SYSTEM_DOC.md` / `TECH_SPEC.md` 有現成文件，或派 Explore。

## 進行中的工作
- 工作分支：`dev-2026-07-08`（所有異動在此分支，勿直接動 main）。
- 飛輪升級計畫：`docs\plan-flywheel.md` **五階段全部完成並驗證**（P1/P2：6f8cda3、b3bb93f；P3 XP/combo/驚喜 Mig 22-23：f0d16e9；P4 補救引擎 Mig 24：57b580e；P5 成長頁＋飛輪）。2026-07-10 另完成 code-review 全修（F1-F10，見 docs\review-findings-2026-07-10.md）。分支尚未合回 main，合併前建議使用者實際使用幾天。
- **v3.8 已完成並驗證**（規劃 `docs\plan-calendar-tasks.md`，Opus 實作）：行事曆的 assignments **正名為「事件」**（純 i18n 值＋2 枚徽章文案，內部識別名/表/路由不動；Phase A e79182d）；**事件完成不再給 XP／驚喜**（Phase A2 9c7bf0f，routes/assignments.js 的 processActivity 呼叫保留供徽章）；**作業清單 daily_tasks 單向顯示到行事曆**（Phase B 681e13f，月曆 📋、日期詳情快速勾選＋前往作業清單，subject 可為 null 有色彩 fallback）。背景：資料調查發現 assignments 被兩個孩子當「事件」用（非作業）。已順手修正邦正 assignment id2 的 2126→2026 年 due_date。
- **v3.7 已完成並驗證**（規劃 `docs\plan-report.md`，Opus 實作）：Phase A 啟動時每 7 天自動備份到 `data\backups\`（`utils\autoBackup.js`，VACUUM INTO、保留 8 份、失敗不擋啟動）；Phase B 報告 API（`routes\report.js` 的 `/summary`、`/weekly-recap`，純函式 `utils\reportRange.js`、`recapHighlight.js`）；Phase C 學習歷程報告頁（`public\js\report.js`，A4 直式可列印，named `@page reportPage` 與週計畫橫式並存，報告本體恆白底）；Phase D 儀表板週回顧卡（無活動則整卡隱藏）。無 migration。**列印分頁效果建議人工過目一次**（named page 相容性，見 plan-report.md 風險備忘）。
- 遊戲化系統慣例：XP reason `study:<id>`、`chapter:<progressId>`、`task:<taskId>:<partNum|done>`、`goal:<id>`、`quest:<id>`；重複觸發靠 grantOnce（查 xp_log reason）防重；週統計/區間統計一律排除 `backfill:%`。前端 toast 通道：`gamify-result`（api.js 自動派發）與 `app-toast`（頁面模組手動派發），監聽都在 app.html。測試資料清理：測完刪測試用帳號的 goals/periods/catchup_quests 與 xp_log/daily_reward_log/point_log 測試列；用過 switchLang 要把 users.lang 改回 zh-TW。

## 教訓紀錄
（格式見 `C:\Users\Josh\.claude\rules\40-maintenance.md`；新教訓往下加）
- [2026-07-08] 情境：用 Bash 工具跑 啟動.bat｜錯誤假設：Git Bash 能處理中文檔名｜修正：中文檔名的 .bat 用 PowerShell 工具跑（`& ".\啟動.bat"`，run_in_background）｜規則已更新：否，單點技巧記在此即可
- [2026-07-08] 情境：db.js 加 Migration 19 用了 `subCols` 變數名｜錯誤假設：新變數名沒被用過｜修正：openAndMigrate() 是同一個函式作用域，加新 migration 前先 Grep 變數名，慣例用編號後綴（如 subCols19）｜規則已更新：否，此條即紀錄
- [2026-07-09] 情境：goals 頁炸 `null.newBadges`（使用者回報）｜錯誤假設：所有 API 都回 JSON 物件｜修正：`GET /periods/current` 無命中時回 `res.json(null)`，而 api.js 的回應攔截器直接讀 `data.newBadges`；攔截器已改為先驗 `data && typeof data === 'object'`。新端點若回 null/純值，前端不用改｜規則已更新：否，api.js 集中防護即根治
- [2026-07-09] 情境：`git add -A` 把 DB 備份（真實資料）commit 進 repo｜錯誤假設：add -A 很方便且 .gitignore 會擋｜修正：本 repo 一律逐檔 `git add <路徑>`，絕不用 `add -A`/`add .`；.gitignore 已加 `*.bak-*`；當下用 amend 移除（未推送前才可）｜規則已更新：是，.gitignore 即規則
- [2026-07-10] 情境：冒煙測試 `node -e "require('./utils/gamify')"` 讓 db.js 對正式 app.db 跑了 openAndMigrate，新 migration 在備份前就套用｜錯誤假設：require 只是載入模組、不動 DB｜修正：`db/db.js` require 時即執行 `openAndMigrate()`（副作用）。要對程式碼做 require 冒煙測試、或跑任何會 require db 的腳本前，先設 `DB_PATH=<temp>` 指向拋棄式 DB（測試檔已採此法）；動 migration 的正式備份要在任何 require db 之前完成｜規則已更新：否，此條即紀錄
