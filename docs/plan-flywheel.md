# 學習飛輪升級計畫（wishlist.md 七項目標）

## Context（背景）

`wishlist.md` 列出七項系統目標：短中長期目標設定、多巴胺激勵機制、落後進度補救激勵、學年四區間（上學期/寒假/下學期/暑假）、成長可視化、課表區分考科/非考科，最終打造「學習飛輪」。

使用者已確認需求：
- 目標類型：**章節/進度完成、成績目標、自訂文字目標**（現有每日/每週分鐘數目標保留）
- 激勵機制：**等級與經驗值（XP）、連續達標加成（combo）、每日驚喜獎勵**
- 區間日期：**使用者自行設定**每學年四區間的起訖日期
- 落後補救：**鼓勵文案+可視化、追趕計畫自動排程、補救挑戰任務** 三者都要

## 設計原則

- **點數與 XP 分離**：`point_log` 仍是可消費貨幣（商店）；XP 是永久成長值，不可消費。
- **能推導就不存狀態**：combo、等級、目標進度都從現有 log 計算，避免計數器失同步。
- **單一遊戲化入口**：現有 7 處 `checkBadges(userId)` 呼叫點改為 `processActivity(userId, event)`，統一觸發 XP/combo/驚喜/目標/任務檢查。
- 純邏輯放 `utils\` 並以 `node --test` 覆蓋；migration 沿用 db.js 內冪等 guard 模式，從 **Migration 19** 起編號；所有新 UI 字串在 `public\js\i18n.js` 補齊 zh-TW/en/ja 三語。

## 資料模型（Migration 19–24，都在 `db\db.js` `openAndMigrate()`）

| Mig | 內容 |
|---|---|
| 19 | `subjects.category TEXT NOT NULL DEFAULT 'exam'`（'exam'\|'non_exam'） |
| 20 | `periods` 表：`user_id, school_year(民國年), type CHECK IN ('semester1','winter','semester2','summer'), start_date, end_date, UNIQUE(user_id,school_year,type)` |
| 21 | `goals` 表：`title, goal_type CHECK IN ('chapter','grade','text'), horizon CHECK IN ('short','mid','long'), period_id(nullable FK), subject_id(nullable), exam_type, target_value, due_date, is_done, done_at`（單表三型，nullable 欄位承載型別差異） |
| 22 | `xp_log(user_id, delta, reason, created_at)` — 仿 point_log；含一次性回填（歷史讀書分鐘/章節完成 → `backfill:study` / `backfill:chapters`），回填要在 guard 內確保只跑一次 |
| 23 | `daily_reward_log(user_id, reward_date, tier, points, UNIQUE(user_id,reward_date))` — UNIQUE 即冪等保證 |
| 24 | `catchup_quests(title, target_count, deadline_date, bonus_points, bonus_xp, status)` + `catchup_quest_items(quest_id, kind, item_id)` 快照逾期項目 ID |

Combo 不建表（從 study_log 推導）；追趕計畫不建表（直接改寫 `chapter_progress.scheduled_date`）。

## 各子系統設計

### XP／等級（`utils\xp.js`，新檔，純函式）
- `xpToAdvance(level) = 100 + (level-1)*75`，上限 50 級；`levelForXp(totalXp)` → `{level, intoLevel, toNext, titleTier}`。
- 10 個稱號階（每 5 級一階），i18n key `level.title.1..10`：初心學徒→勤奮新星→專注行者→進步達人→堅毅學者→卓越挑戰者→智慧大師→學霸傳奇→巔峰王者→飛輪大師。
- XP 來源：讀書 1 XP/分鐘（每日上限 180）、作業 part +3（整項完成再 +5）、章節 session 完成 +15、目標達成（短 +30/中 +60/長 +100）、挑戰完成（預設 +50）。reason 格式仿 point_log：`study:<id>`、`task:<id>`、`chapter:<id>`、`goal:<id>`、`quest:<id>`。

### 遊戲化中樞（`utils\gamify.js`，新檔）
- `processActivity(userId, event)`：授 XP（乘 combo 倍率）→ 每日驚喜檢查 → 自動目標判定（chapter/grade 型）→ 任務進度更新 → 呼叫既有 `checkBadges`。回傳 `{newBadges, xp:{gained,total,level,leveledUp,titleKey}, surprise, questCompleted, goalsAchieved}`。
- 替換 `routes\studylog.js`、`routes\chapters.js`、`routes\daily-tasks.js`、`routes\assignments.js`、`routes\grades.js` 中 7 處 `checkBadges` 呼叫點；回應保留 `newBadges` key 向下相容。
- 點數/XP 寫入必須包 better-sqlite3 transaction（仿 `routes\shop.js` 的 `redeemTx`）；日期一律用 `'localtime'`。
- 順手重構：`RARITY_PTS` 目前重複在 4 檔，統一到 `utils\points.js` 匯出。
- 新路由 `routes\gamify.js`（mount `/api/gamify`）：`GET /status`（XP/等級/稱號/combo/今日驚喜/進行中挑戰）。

### Combo 連續達標加成（加在 `utils\streak.js`）
- `computeComboDays(minutesByDate, goal, todayStr)`：連續達成每日分鐘目標的天數（沿用 yesterday-grace 精神）；goal=0 時 combo=0。
- `comboMultiplier(days) = 1 + 0.1 × min(days,10)`，上限 ×2.0；套用於 XP 與每日驚喜點數（徽章兌換點數不變）。

### 每日驚喜（processActivity 內）
- 當日第一次合格完成（讀書紀錄/章節完成/作業整項完成）觸發；權重：+5(55%)、+10(30%)、+20(12%)、+50(3%)，再乘 combo 倍率。
- Transaction 內 `INSERT OR IGNORE INTO daily_reward_log`，`changes===1` 才寫 `point_log`（reason `surprise:<date>`）並回傳 🎁 toast。`rollSurpriseTier(rand)` 放 `utils\xp.js`（可注入 RNG 便於測試）。
- `routes\shop.js` 的 `/history` CASE 補 `surprise:%`、`quest:%` 顯示名稱。

### 區間（`routes\periods.js`，新檔，mount `/api/periods`）
- `GET /?school_year=`、`POST /`（UNIQUE upsert）、`PUT /:id`、`DELETE /:id`、`GET /current`、`GET /:id/summary`（區間內總分鐘/活躍天/章節完成/作業完成/目標達成/XP，附上一個區間同指標供比較）。
- 驗證：end ≥ start；重疊只警告不阻擋。
- UI：目標頁頂部「學期區間設定」區塊 — 學年選擇器（預設取 timetable 當前學年）+ 四列日期輸入。儀表板頂部顯示當前區間 chip。

### 目標（`routes\goals.js` + `utils\goalProgress.js` + `public\js\goals.js`，皆新檔）
- API：`GET /`（附計算後 progress/target）、`POST /`、`PUT /:id`、`DELETE /:id`、`PATCH /:id/toggle`（text 型手動勾選）。
- 進度計算（純函式在 `utils\goalProgress.js`）：
  - `chapter`：目標視窗內 `chapter_progress.is_done=1` 的 session 數 ≥ target_value（可限定 subject）。
  - `grade`：視窗內存在 `grades` 分數 ≥ target_value（可限定 subject/exam_type），在 `grade_added` 事件時判定。
  - `text`：手動 toggle，完成也走 processActivity 給 XP。
  - 視窗優先序：連結的 period 起訖 → created_at~due_date → created_at 起無限。
  - 自動達成時設 `is_done/done_at`、給 horizon XP、回傳 toast「目標達成！」。
- UI：新頁 route `goals`，側欄 🎯 目標設定（`router.js` + `app.html`）；短/中/長期三區塊，目標卡含型別 icon、進度條、區間 chip。新增表單依型別切換欄位。
- 儀表板加「進行中目標」卡（最近期限前 3 名 + 進度條）。

### 考科/非考科
- `routes\subjects.js` POST/PUT 接受 `category`（驗證 exam|non_exam）。
- `public\js\subjects.js`：每科目一個 考科/非考科 segmented toggle（預設考科）。
- `public\js\timetable.js` + `public\css\app.css`：非考科格子加 `.slot-nonexam`（降飽和/斜紋底 + ◇ 標記，亮暗主題皆可辨），課表加圖例。
- `GET /api/studylog/weekly|monthly` 加選用 `?category=`；讀書分析頁加 全部/考科/非考科 filter chips；儀表板考試倒數 pacing 只計考科。

### 補救引擎（`utils\catchup.js` + `routes\catchup.js`，新檔，mount `/api/catchup`）
- 純規劃器 `planCatchup({items, existingLoadByDate, todayStr, days=7, maxPerDay=3})` → `[{id,newDate}]`：最舊優先 round-robin 分配到未來 N 天，日負載超過 maxPerDay 就順延。只重排逾期 `chapter_progress`；逾期 `daily_tasks` 只計入狀態/挑戰、不自動搬移。
- API：`GET /status`（逾期清單/數量/最舊逾期天數/近 7 日已清數/進行中挑戰）、`POST /plan`（transaction 內改寫 scheduled_date，回傳預覽）、`POST /quest`（target=min(逾期數,5)、期限今+3 天、+30 點/+50 XP，快照項目 ID；同時只能一個 active，否則 409）。
- 挑戰進度在 processActivity 內比對快照；達標→completed、發獎勵、慶祝 toast；逾期挑戰在 GET /status 惰性標 expired，**無懲罰**（鼓勵導向）。
- 儀表板：現有 `overdueCard` 升級為補救卡 — 輪播鼓勵文案（i18n `catchup.cheer.1..5`）、已清/總數進度條、「幫我排補救計畫」與「接受挑戰」兩按鈕、進行中挑戰倒數。
- 新徽章：`quest_first`、`quest_5`、`comeback`（清 10 項逾期）加入 `badges\definitions.js` + `badges\checker.js`。

### 成長頁＋飛輪（`public\js\growth.js`，新檔，route `growth`，側欄 📈 成長軌跡）
- 資料來源：`GET /api/growth/summary`（加在 `routes\gamify.js`，單次往返，仿 dashboard-stats）。
- 內容：①等級卡（等級/稱號/XP 進度條/🔥combo）②累積成長線圖（累積時數+累積章節，Chart.js，window function 仿 shop history）③區間比較長條圖（`/api/periods/:id/summary`，無資料時引導設定區間）④每週 XP 長條圖⑤**飛輪 widget**：目標→學習→獎勵→複習 四節點 CSS/SVG 環，各節點依本週活躍度亮綠/黃，附一句最弱節點提示（如「本週還沒安排複習，轉動飛輪吧！」）。

## 分階段實作（每階段可獨立出貨與驗證）

### Phase 1 — 結構基礎：考科分類＋區間（Mig 19–20）
改：`db\db.js`、`routes\subjects.js`、新 `routes\periods.js`、`server.js`、`public\js\subjects.js`、`public\js\timetable.js`、`public\css\app.css`、`i18n.js`（`enum.subjectCat.*`、`enum.periodType.*`、`period.*` ×3 語）。區間設定 UI 併入 Phase 2 目標頁，本階段先出 API。
驗證：`npm test` 綠；啟動.bat + 測試用帳號切換非考科、亮暗主題檢查課表樣式。

### Phase 2 — 目標頁（Mig 21）
改：`db\db.js`、新 `routes\goals.js`、`server.js`、新 `utils\goalProgress.js` + `test\goalProgress.test.js`、新 `public\js\goals.js`（含區間設定 UI）、`router.js`、`app.html`、dashboard 目標卡、`i18n.js`（`goal.*`）。
驗證：goalProgress 單元測試；手動建三型目標各一，完成章節→chapter 目標進度增加；輸入達標成績→grade 目標自動完成。

### Phase 3 — 遊戲化核心：XP／combo／驚喜（Mig 22–23）
改：`db\db.js`（含回填）、新 `utils\xp.js` + `test\xp.test.js`、`utils\streak.js` combo 函式 + 測試、新 `utils\gamify.js`、新 `routes\gamify.js`、5 個路由檔換 processActivity、RARITY_PTS 併入 `utils\points.js`、`routes\shop.js` history、`app.html` 側欄等級 chip + toast、dashboard 顯示、新徽章 `level_5`/`level_10`/`combo_7`、`i18n.js`（`xp.*`、`level.title.*`、`combo.*`、`surprise.*`）。
驗證：等級曲線單調性、combo 邊界（無目標/今日未達/上限）、驚喜權重（注入 RNG）單元測試；手動記讀書→XP toast、同日第二筆無驚喜、商店餘額反映驚喜點數。

### Phase 4 — 補救引擎（Mig 24）
改：`db\db.js`、新 `utils\catchup.js` + `test\catchup.test.js`、新 `routes\catchup.js`、`utils\gamify.js` 任務 hook、`public\js\dashboard.js` 補救卡、挑戰徽章、`i18n.js`（`catchup.*` 含鼓勵文案）。
驗證：規劃器單元測試（排序/日上限/溢出/空輸入）；手動回填逾期資料→排補救計畫→日期重分配；接受挑戰→完成→獎勵 toast；放到期→expired 無懲罰。

### Phase 5 — 成長頁＋飛輪
改：`routes\gamify.js` 加 `/api/growth/summary`、`/api/periods/:id/summary` 完善、新 `public\js\growth.js`、`router.js`、`app.html`、`i18n.js`（`growth.*`、`flywheel.*`）。
驗證：測試用帳號跑亮暗主題 × 三語言；稀疏資料下圖表優雅降級；區間比較空狀態。

## 風險備忘
- `processActivity` 的點數/XP 寫入務必用 transaction（仿 redeemTx）。
- 日期查詢一律 `'localtime'`，與現有查詢一致。
- Mig 22 回填必須在 guard 內，確保只執行一次。
- 分支：所有異動在 `dev-2026-07-08` 進行（已建立）。
