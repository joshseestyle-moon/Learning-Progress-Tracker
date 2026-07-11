# 稽核報告：X:\class 版本落後盤點（對照 v3.9 / Migration 25 現況）

分支：chore-copy-script-m25（程式碼同 main）。唯讀稽核，未改任何檔案。

---

## 1. RARITY_PTS 重複定義

**結論：utils/points.js 已存在且被 3/4 處採用；db/db.js 仍保留獨立定義（未收斂），但值一致，無資料風險。另發現 1 處死 import。**

| 檔案:行號 | 現況 | 值 |
|---|---|---|
| utils/points.js:6 | 目標收斂處，`module.exports` 含 RARITY_PTS（12行） | `{common:10, uncommon:25, rare:50, epic:100}` |
| badges/checker.js:5 | `require('../utils/points')` 取用 | 同上（引用） |
| routes/badges.js:5 | `require('../utils/points')` 取用，18/130 行使用 | 同上（引用） |
| routes/shop.js:5 | `require('../utils/points')` 取用 **但未使用**（僅用 getBalance） | 死 import |
| db/db.js:215 | 一次性 migration（badge→point_log 回填）內**自行重宣告**常數，未 import utils/points | `{common:10, uncommon:25, rare:50, epic:100}`（一致） |

- 建議修法：db/db.js:215 改成 `require('../utils/points')` 取代局部常數（migration 已跑過的舊安裝不受影響，僅利後續維護一致性）；routes/shop.js:5 移除未使用的 `RARITY_PTS` 解構。
- 風險：低（純重複代碼，值目前一致，未造成功能歧異）。

---

## 2. 前端頁面模組的新版模式（世代守衛 `_gen` / null guard / `initPeriodFilter`）採用度

**結論：僅 4 個頁面（exams / homework / studylog / chapters）+ grades 已採新模式；dashboard / timetable / goals / growth / badges / shop / calendar / report / subjects 共 9 個模組仍是舊模式（無 `_gen`、無 async 世代守衛）。**

已採新模式（`_gen` + `gen !== _gen` guard）：
- public/js/grades.js:10-11,22,25,35（範本）
- public/js/exams.js:16,26,33
- public/js/homework.js:8,18,25
- public/js/studylog.js:16,31,45
- public/js/chapters.js:8,35,44

未採新模式（無 `_gen`，`render(el)`/`refresh(el)` 內 `await` 後直接 `el.innerHTML=...`，快速切頁或重複觸發時可能寫入已被路由替換的舊 DOM）：
- public/js/dashboard.js:13（`export async function render(el)`，20 行 `Promise.all` 後 59 行直接 `el.innerHTML=`，無守衛）
- public/js/timetable.js:22-34（`reloadSlots` 於 await 後直接改 DOM）
- public/js/goals.js:28-36（`render(el)` await 後 `el.innerHTML=`；278/286/301/315/321 行多處 `await render(el)` 重呼叫亦無防重入）
- public/js/growth.js:9-11（同步 await 後 innerHTML，無守衛）
- public/js/badges.js:7,205-213（用 `_el` 但無 `_gen`；`load()` 為模組級無世代標記）
- public/js/shop.js:15,231-237（用 `_el` 但無 `_gen`）
- public/js/calendar.js:7,15（`renderMonth(el)` await 後直接改 DOM）
- public/js/report.js:38-43（await 後直接 innerHTML，且 116-125 行 `loadRange`/`body.innerHTML` 亦無守衛）
- public/js/subjects.js:13-22（`refresh(el)` 簽名帶參數，非 `refresh()` 無參數的新規範）

`initPeriodFilter` 採用（v3.9 區間過濾範圍，設計上僅限這 5 頁，非缺陷）：
- grades.js:22、exams.js:22、homework.js:14、studylog.js:27、chapters.js:19
- goals.js / growth.js / calendar.js 未採用（flywheel 計畫的頁面，產品範圍本就不同，非本項缺口）

建議修法：比照 grades.js 範本，為 9 個舊模式模組補上 `_gen` 世代計數與 `if (!body || gen !== _gen) return;` guard；`subjects.js` 的 `refresh(el)` 改為模組級 `_el` + 無參數 `refresh()`。
風險：中（目前多數情況下使用者不會在載入中途狂點導覽，實際觸發機率低，但一旦觸發會寫壞畫面且無錯誤訊息，難排查）。

---

## 3. 日期紀律

**結論：SQL 端已達標（全數對 UTC timestamp 欄位的比較都包 `date(col,'localtime')`）；前端與一處後端發現 2 個 `toISOString().slice` 違規。**

- public/js/badges.js:18 — `fmtDate(new Date(b.earned_at).toISOString().slice(0, 10))`。`earned_at` 是 DB 存的 UTC timestamp，`toISOString()` 保留 UTC、非轉本地，違反 `public/js/period-filter.js:17-18` 明文註解的禁令（"Never slice(0,10) a UTC string — that keeps UTC"）。跨日午夜前後徽章完成日期會顯示錯一天。
  → 建議修法：改用 `period-filter.js` 已匯出的 `localD(b.earned_at)`。
- routes/assignments.js:15-19 — `upcoming` 篩選用 `new Date()` + `toISOString().slice(0,10)` 算上界 `limitStr`（Node 側 UTC 日期），但下界用 SQL `date('now','localtime')`（本地日期）。兩端基準不一致，午夜前後可能造成上下界都不是同一天基準，篩選範圍偏移一天。
  → 建議修法：比照 `date('now','localtime','+N days')` 直接在 SQL 端算上界，或改用 `utils` 內既有的本地日期工具产生 limitStr。
- SQL 端抽查：routes/gamify.js、routes/periods.js、routes/report.js、utils/catchup.js、utils/goalMetrics.js、utils/gamify.js 對 `done_at`/`created_at`/`earned_at` 的比較皆已包 `date(col,'localtime')`（如 routes/report.js:21,27,30,38,44,75,104）。`scheduled_date`/`log_date` 本身即為純日期字串（非 timestamp），routes/gamify.js:54,63-64 未包 localtime 是正確用法，非漏包。

風險：中（跨午夜的邊界情況，影響顯示與清單篩選正確性，非資料損毀）。

---

## 4. 點數/XP 寫入的 transaction 紀律

**結論：所有現行執行路徑（routes + utils）皆已包在 `db.transaction()` 內；僅 1 處歷史 migration 的回填迴圈未包 transaction（一次性、已對舊安裝跑過，風險極低）。**

已確認包在 transaction 內：
- routes/badges.js:108-117（`exchangeTx`，含 111 行 point_log insert）
- routes/badges.js:133-139（`exchangeTx`，含 135 行 point_log insert）
- routes/shop.js:34-43（`redeemTx`，含 37 行 point_log insert，且有餘額不得為負的防呆 throw 觸發 rollback）
- utils/gamify.js:104-171（`tx`，含 143、160 行 point_log insert 與 49 行 xp_log insert 皆在同一 tx 內）
- db/db.js:371-393（Migration 22 xp_log 回填，明確用 `db.transaction()` 包整段，並附註「死掉重啟仍乾淨」的設計理由）

未包 transaction（低風險）：
- db/db.js:214-222 — 舊 migration（badge→point_log 回填）用 `for` 迴圈逐筆 `insertPts.run(...)`，沒有 `db.transaction()` 包裹，跟後來 M22 建立的「migration 回填一律包 transaction」慣例不一致。此 migration 對已升級過的正式環境已經跑過（guard 會跳過），僅新建的空 DB 或尚未升級的舊庫會受影響。
  → 建議修法（若要順手修，非急迫）：比照 db.js:371 的寫法包一層 `db.transaction(() => {...})()`。

風險：低（純歷史一致性問題，非現行資料寫入路徑）。

---

## 5. XP/點數 reason 字串顯示涵蓋度

**結論：已達標。** 顯示端（routes/shop.js:60-103 的 SQL CASE + rows.forEach 後處理，public/js/shop.js:173-174 前端補丁）涵蓋所有實際寫入的 reason 前綴：

寫入端 reason 樣式盤點：`exchange:custom_<id>`（routes/badges.js:111）、`exchange:<id>`（routes/badges.js:135）、`redeem:<id>`（routes/shop.js:37）、`surprise:<date>`（utils/gamify.js:144）、`quest:<id>`（utils/gamify.js:161）、`badge:<id>`（db/db.js:221，v2.8 前舊資料）。

顯示端對照：routes/shop.js SQL CASE 涵蓋 `exchange:%`/`redeem:%`（display_name），`exchange:%`/`redeem:%`/`surprise:%`/`quest:%`（display_icon）；98-103 行另外後處理 `badge:%` 舊資料；public/js/shop.js:173-174 補上 `surprise:%`/`quest:%` 的 display_name（因為這兩類要跟隨 UI 語言即時翻譯，不能存在 DB 裡）。無遺漏樣式。

風險：無。

---

## 6. i18n 完整性（zh-TW / en / ja）

**結論：已達標。** 用 node 腳本解析 `public/js/i18n.js` 的 TRANSLATIONS 物件字面量（該檔 >1100 行，未整檔讀取）：

- zh-TW: 512 keys
- en: 512 keys
- ja: 512 keys
- zh-TW vs en：missing 0、extra 0
- zh-TW vs ja：missing 0、extra 0

風險：無。

---

## 7. schema.sql 與 db.js migrations（M19-M25）同步

**結論：已達標。** 抽查項目全數命中且皆為 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`：

- periods（schema.sql:211）、goals（224，含 period_id FK）、xp_log（242）、daily_reward_log（250，含 `UNIQUE(user_id, reward_date)`）、catchup_quests（260）、catchup_quest_items（273，含 `UNIQUE(quest_id, kind, item_id)`）
- subjects.category（schema.sql:32，Migration 19 註記）
- chapter_progress.original_scheduled_date（schema.sql:91，Migration 25 註記）
- users.daily_goal_minutes / weekly_goal_minutes（schema.sql:22-23，Migration 18 註記，M19 前已存在但仍在同步範圍內）
- 全檔 `CREATE TABLE` / `CREATE INDEX` 語句 48 條，Grep 排除 `IF NOT EXISTS` 後 0 條裸露語句 → 無漏包 guard。
- 無 `ALTER TABLE`/`CREATE TRIGGER` 殘留（新欄位直接內嵌在 CREATE TABLE 定義，適合全新安裝）。

風險：無。

---

## 總表（風險排序）

| 項次 | 結論 | 風險 |
|---|---|---|
| 2 | 9 個頁面模組缺 `_gen` 世代守衛 | 中 |
| 3 | badges.js:18、routes/assignments.js:15-19 兩處 UTC/local 日期混用 | 中 |
| 1 | db.js:215 RARITY_PTS 重複定義 + shop.js:5 死 import | 低 |
| 4 | db.js:214-222 舊 migration 回填無 transaction | 低 |
| 5 | reason 字串顯示涵蓋度 | 已達標 |
| 6 | i18n 三語 key 數一致 | 已達標 |
| 7 | schema.sql 同步 M25 | 已達標 |
