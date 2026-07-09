# Code review findings — 2026-07-10（待修清單）

> 來源：/code-review high（8 finder + 4 verifier 多代理管線），diff = main...dev-2026-07-08。
> 狀態：**已批准全修**（使用者 2026-07-10 凌晨指示「都修」，排程 04:30 後執行）。
> 修復順序：F1→F2→F3 必修優先，再 F4、F5、F7，其餘照列。每修一項跑 `npm test`；動到 db.js 需重啟兩次驗證；動到 UI 字串需 i18n ×3 Grep 驗證；完成後用測試用帳號（id 7）實測、commit。

## 正確性（CONFIRMED）

### F1. 建立即達標的目標永遠拿不到 is_done/XP
- 位置：`utils/gamify.js:98`（goal auto-check 只在 chapter/grade 事件觸發）、`routes/goals.js` POST 不評估達成。
- 症狀：goal 建立時視窗內已達標 → GET /goals 顯示 achieved:true、dashboard 濾出 active 清單，但 is_done 永遠 0、XP 永不發。
- 修法：POST /api/goals 建立後（chapter/grade 型）立即跑一次與 processActivity 相同的達成判定（抽共用函式 `checkGoalAchievement(userId, goal)` 進 utils/gamify.js，POST 與 processActivity 共用；達成時同樣 grantOnce + is_done + 回傳 goalsAchieved 讓前端 toast）。

### F2. 補救計畫覆蓋 scheduled_date，抹掉「已清逾期」統計與 comeback 徽章
- 位置：`routes/catchup.js:72`（UPDATE scheduled_date）；受害查詢 `routes/catchup.js:45`（cleared_last7）、`badges/checker.js:101`（comeback）。
- 症狀：排補救計畫後如期完成 → done_at ≤ 新 scheduled_date → 不算「清逾期」，進度條凍結、comeback 徽章實質不可達。
- 修法：Migration 25 為 `chapter_progress` 加 `original_scheduled_date TEXT`（冪等 guard：pragma table_info）。POST /plan 改寫日期前，若 original_scheduled_date IS NULL 先寫入原值。cleared_last7 與 comeback 改用 `COALESCE(original_scheduled_date, scheduled_date)` 判定「當初是否逾期」。動 migration 前備份 DB（.bak-YYYYMMDD，沿用當日既有備份規則，最多留 2 份）。

### F3. chapters.js 補記讀書時間用 UTC 日期
- 位置：`public/js/chapters.js:314`、`:351`（`new Date().toISOString().slice(0,10)` 作 log_date）。
- 修法：改 import `today` from './api.js'（已是本地日期）。

### F4. 飛輪 goal 節點永遠亮綠
- 位置：`routes/gamify.js:46`（goalActive 的 `is_done = 0 OR ...`）。
- 修法：拿掉 `is_done = 0` 子句，僅保留「本週建立 OR 本週達成」；再加「本週有 text 目標 toggle」不需要（done_at 已涵蓋）。與其他三節點語意一致（本週活躍度）。

### F5. Mig 22 回填無 transaction、部分失敗即永久跳過
- 位置：`db/db.js:367-389`。
- 修法：把 CREATE TABLE + 回填迴圈包進 `db.transaction(() => {...})()`。驗證：重啟兩次無錯、xp_log 筆數不變（正式 DB 已回填過，guard 會跳過——重點是程式碼對全新 DB 正確）。

### F6. 刪除重記可突破 180 XP 日上限
- 位置：`utils/gamify.js:64-67`（alreadyCredited 從 study_log 現存 rows 推算）。
- 修法：alreadyCredited 改從 xp_log 實際已發數查：`SELECT COALESCE(SUM(delta),0) FROM xp_log WHERE user_id=? AND reason LIKE 'study:%' AND <該 log_date 的歸屬>`——但 reason 無日期，需 join study_log 不可靠（row 可能已刪）。務實做法：reason 改帶日期 `study:<id>:<logDate>`？不行，破壞既有資料。**採用**：查當日已發 study XP 用 `xp_log JOIN study_log ON reason='study:'||study_log.id` 會漏已刪 rows——改為直接記錄：`SELECT COALESCE(SUM(delta),0) FROM xp_log WHERE user_id=? AND reason LIKE 'study:%' AND date(created_at,'localtime')=? `＋限制「補記過去日期」不受今日上限影響的語意取捨：上限本意是「單一 log_date 最多 180」，故用 event.logDate 對應的已發 XP。由於 xp_log 沒存 log_date，加欄位過重——**最終決定**：接受以「xp_log 當日(created_at localtime)發出的 study XP」為上限基準（即「每天最多發 180 study XP」而非「每個 log_date 最多 180」），一行 SQL 即可、且不可被刪除重記繞過。實作時在註解寫明語意變更。
- 注意：此修法與 F7 相關，一起改。

### F7. 補記過去日期吃到今天的 combo 倍率
- 位置：`utils/gamify.js:41`（mult 一律用今天的 combo）。
- 修法：`type='study'` 且 `event.logDate !== localToday()` 時，該筆 XP 用 mult=1.0（其餘獎勵照舊）。鼓勵導向：補記仍有 XP，只是不吃當日加成。

### F8. assignment 完成有驚喜沒 XP
- 位置：`utils/gamify.js:68-83`。
- 修法：XP_RULES 加 `assignmentDone: 10`（`utils/xp.js`），processActivity 加 `else if (event.type === 'assignment') grantOnce(XP_RULES.assignmentDone, 'assignment:' + event.id);`。獎勵一致性優先（鼓勵導向）。同步更新 `test/xp.test.js` 的 XP_RULES 斷言。

### F9. 前端殘留 UTC 日期計算（PLAUSIBLE）
- 位置：`public/js/studylog.js:203、220`（近7天圖表 keys）、`public/js/print.js:19`（週界 fmt）、`public/js/homework.js:20`（無害，可順手）、`public/js/badges.js:18`（earned_at 顯示，順手檢查）。
- 修法：全面掃 `toISOString().slice(0` in public/js，改用本地日期格式化（api.js today() 模式）。

## 效能/清理

### F10. combo 全史掃描且每事件重複兩次
- 位置：`utils/gamify.js:31`（comboOf 無日期下限）、`badges/checker.js:111`（combo_7 重算同一份）。
- 修法：comboOf 查詢加 `AND log_date >= date('now','localtime','-15 days')`（combo 上限 10 天＋yesterday grace，15 天窗足夠）；checkBadges 增加可選參數 `precomputed = { comboDays }`，processActivity 傳入，checker 內 fallback 自算（相容其他呼叫點——目前僅 gamify 呼叫）。

## 未進前十的清理（本輪不強制，可順手）
- showGamifyToast 與 showBadgeToast 重複（app.html）→ 收斂一個 showToast。
- 進度條 HTML 五處手刻（dashboard/goals/growth/gamify-ui）→ gamify-ui.js 出 bar() helper。
- 日期格式化重刻：utils/catchup.js addDays、utils/goalProgress.js localDateFromUtc、dashboard tomorrow() → 用 streak.js dateKey / api.js today 系。
- lateCleared SQL 重複（catchup.js vs checker.js）→ F2 修改時一併收斂成共用函式。
- `dateKey` 匯出無人用、`event._rand` 無呼叫點、gamify 的 localToday 轉出口 → 清掉或用起來。
- catchup GET /status 回傳的 overdue_chapters 前端沒用 → 移除或前端改用（決定：保留 API 但 dashboard 不需要就不動，僅在 F2 順手評估）。
- badgeRelevant 布林可簡化為 `event.type !== 'task' || gained > 0 || !!surprise || !!questCompleted || !!event.taskDone`（verifier 確認行為等價）。
- processActivity 缺整合測試 → 新增 test/gamify.test.js（記憶體 SQLite 或測試 DB）至少覆蓋：study XP+cap、chapter+goal 達成、quest 完成、驚喜一天一次。時間允許就做。

## 驗收（全部完成前逐條核對）
- [x] npm test 綠（50 pass，含新增 test/gamify.test.js 5 個整合測試）
- [x] 伺服器重啟兩次無錯（Mig 25 冪等、Mig 22 回填 guard 跳過、xp_log 維持 6）
- [x] 測試用帳號實測：建綁定過去區間的 chapter 目標→POST 立即回 goalsAchieved+xp.gained 30、is_done=1；排補救計畫(46)→完成一個重排項→cleared_last7 由 2→3（COALESCE(original) 生效）
- [x] 無新增 i18n key（F1-F10 皆複用既有 key）→ 免 Grep
- [x] 測試資料清理（goals/periods/catchup_quests/xp_log 非backfill/daily_reward_log/point_log surprise 全清，chapter_progress 86 列還原、點數回 1651）
- [x] commit（逐檔 add，禁 add -A；4 個 fix commit：040eedb F2/F5/F10、cef7332 F1/F6/F7/F8、f4b83a4 F4、77be278 F3/F9）

## 完成狀態（2026-07-10 05:xx，Opus 4.8 執行）
F1-F10 全部完成並驗證。順手清理已做：日期格式化收斂（api.js `ymd`）、lateCleared SQL 收斂（`LATE_CLEARED_PREDICATE`）、badgeRelevant 簡化、processActivity 整合測試、`event._rand` 現由測試使用。
**本輪未做（低價值、視覺回歸風險，留待日後）**：showGamifyToast/showBadgeToast 收斂、進度條 bar() helper 五處收斂、catchup GET /status 的 overdue_chapters 欄位（前端未用但保留 API）。
**F6 語意變更**：日上限由「每個 log_date 最多 180 分鐘」改為「每天最多發 180 study XP（含 combo 加成後）」——不可被刪除重記繞過，但高 combo 重度讀書日的 study XP 會被壓到 180（combo 仍加成章節/作業/目標/驚喜）。
**過程備註**：實作中一次 `require('./utils/gamify')` 冒煙測試無意間讓 db.js 對正式 app.db 跑了 openAndMigrate，Migration 25 因此在正式備份前就套用（純新增 nullable 欄位、資料無損、全 NULL 正確）。乾淨回滾點：`data/app.db.bak-2026-07-09-2`（無該欄位）。
