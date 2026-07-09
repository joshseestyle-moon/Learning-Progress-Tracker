# 學習歷程報告＋週回顧＋自動備份 實作規劃書

> 版本：2026-07-10 由 Fable 5 規劃，交由 Opus 實作。
> 依據：`checkgoal.md` 願景驗證（見 git log 2026-07-10 對話）——「輸出學習歷程證明」是唯一明文缺口；週回顧強化「看到努力」的中景回饋；自動備份是多年歷程資料的保全前提。
> **開工前依全域不變量 1 向使用者確認「要開始實作了嗎？」**。工作分支沿用 `dev-2026-07-08`（或使用者指定的新分支）。

## 0. 交接注意（Opus 必讀，違反即事故）

1. 本計畫**不含任何 DB migration**（零 schema 變更）——不需備份 DB 即可動工，但 Phase A 本身就是備份功能，優先做。
2. `require('./db/db')` **當下就會對 DB_PATH 跑 openAndMigrate**（教訓已記 CLAUDE.md 2026-07-10）。所有測試檔開頭必須先 `process.env.DB_PATH = <temp>` 再 require（照抄 `test/gamify.test.js` 開頭模式）。
3. 日期欄位型別參照表（**决定 SQL 要不要加 `'localtime'` 的唯一依據**）：

   | 欄位 | 型別 | 查詢寫法 |
   |---|---|---|
   | study_log.log_date、daily_tasks.task_date、grades.exam_date、chapter_progress.scheduled_date/original_scheduled_date、periods.start/end_date、daily_reward_log.reward_date、catchup_quests.deadline_date | 裸日期字串 YYYY-MM-DD | 直接比較，**不加** localtime |
   | chapter_progress.done_at、goals.done_at、goals.created_at、xp_log.created_at、point_log.created_at、user_badges.earned_at、custom_badge_earned.earned_at、badge_exchange_log.exchanged_at | UTC 時間戳 | **必加** `date(col,'localtime')` |

4. 前端拿「今天/本地日期」一律用 `api.js` 的 `today()` / `ymd(d)`；後端用 `utils/streak.js` 的 `localToday()`。禁止新的 `toISOString().slice(0,10)`。
5. i18n：每個新 key 進 zh-TW/en/ja 三字典（本文件已附全部譯文，照貼），完成後 Grep 每 key 命中數 = 3。
6. git：逐檔 `git add <路徑>`，**禁 add -A**。每個 Phase 完成即 commit。
7. 驗證：改後端跑 `npm test`；UI 用 Playwright + 測試用帳號（id 7），測後清理測試資料；重啟一律 `啟動.bat`（PowerShell `& ".\啟動.bat"` run_in_background；本計畫無 migration，重啟一次確認可服務即可）。
8. 命中門檻就派 subagent（規則見 `C:\Users\Josh\.claude\rules\10-dispatch.md`）；本計畫各 Phase 規格已足夠細，預期主對話直接實作即可。

## 1. 設計原則

- **零新表**：三個功能全部從既有資料推導。報告是「視圖」，不是「狀態」。
- **單次往返**：報告與回顧各一支 API 回全部資料（仿 `routes/gamify.js` growth-summary）。
- **列印即輸出**：PDF 輸出 = 瀏覽器「列印 → 另存 PDF」，零相依套件。報告頁圖表一律 CSS 條狀圖（不用 Chart.js，列印可靠性優先），加 `print-color-adjust: exact`。
- **鼓勵導向**：回顧卡只慶祝不指責（退步時中性措辭）；報告空區塊給友善文案不留白。
- **純邏輯進 utils\ 配單元測試**：日期範圍推導、回顧亮點挑選都是純函式。

## 2. Phase A — 自動備份（最小、先做，保全資料）

### 檔案
- 新 `utils/autoBackup.js`
- 改 `server.js`（啟動時呼叫一行）
- 新 `test/autoBackup.test.js`

### utils/autoBackup.js 規格
```js
// performAutoBackup(db, dataDir, todayStr) → { created: bool, file?: string, pruned: string[] }
// - 目錄 <dataDir>/backups/，不存在則 mkdirSync recursive
// - 檔名 auto-YYYY-MM-DD.db；掃描既有 auto-*.db 依檔名排序取最新日期
// - 若最新日期 >= todayStr 往前 6 天（即 7 天內已有備份）→ { created: false }
// - 否則 db.prepare('VACUUM INTO ?').run(join(dir, tmpName)) 再 fs.renameSync 成正式檔名
//   （VACUUM INTO 不可在 transaction 內；輸出是 checkpoint 過的緊湊單檔）
// - 保留檔名排序最新 8 份，其餘 unlinkSync 並列入 pruned
// - 整體 try/catch：任何失敗 console.warn('[autoBackup]', err.message) 後回 { created:false, error }，絕不 throw（備份失敗不能擋啟動）
```

### server.js 掛載
在 `const db = require('./db/db');` 之後：
```js
const { performAutoBackup } = require('./utils/autoBackup');
const { localToday } = require('./utils/streak');
performAutoBackup(db, path.dirname(path.resolve(process.env.DB_PATH || './data/app.db')), localToday());
```

### 測試（test/autoBackup.test.js，temp DB_PATH 模式）
1. 首次呼叫 → created:true、檔案存在且可被 better-sqlite3 唯讀開啟、含 users 表。
2. 同日再呼叫 → created:false、不產生第二份。
3. 預先放 9 個假 auto-2025-*.db 空檔 → 呼叫後只剩最新 8 份。
4. dataDir 不可寫（傳不存在磁碟路徑）→ 不 throw、回 error。

### 驗收
- npm test 綠；`啟動.bat` 重啟 → `data/backups/auto-<今日>.db` 出現、console 一行紀錄；再重啟 → 不重複產生。`git status` 不得出現 backups 內容（`*.db` 已 ignore）。
- Commit：`feat: weekly rotating auto-backup on server start`

## 3. Phase B — 歷程報告後端

### 檔案
- 新 `utils/reportRange.js` ＋ `test/reportRange.test.js`
- 新 `utils/recapHighlight.js` ＋ `test/recapHighlight.test.js`（Phase D 也用，先做）
- 新 `routes/report.js`，`server.js` mount `app.use('/api/report', ...)`

### utils/reportRange.js（純函式）
```js
// schoolYearRange(rocYear, periods) → { from, to }
//   periods = 該使用者該學年的 periods rows（可空陣列）
//   有 periods → from=min(start_date), to=max(end_date)
//   無 → from=`${rocYear+1911}-08-01`, to=`${rocYear+1912}-07-31`（台灣學年慣例）
// lastWeekRange(todayStr) → { from, to }  上一個完整週一~週日
//   實作：用 Date 物件回推（週一=getDay()===1），照 utils/catchup.js addDays 的本地格式化模式
// prevRange({from,to}) → 同長度緊鄰前一段（週回顧比較用）
```
測試至少：跨月/跨年的 lastWeekRange（例 todayStr='2026-01-01' 週四 → 2025-12-22~28）、schoolYearRange 有/無 periods 兩型、prevRange 長度相等。

### utils/recapHighlight.js（純函式）
```js
// pickRecapHighlight(stats, prevStats) → 'goals' | 'chapters' | 'minutes' | 'default'
// 規則（由上而下第一個命中）：
//   stats.goals >= 1          → 'goals'
//   stats.chapters >= 3       → 'chapters'
//   stats.minutes > (prevStats.minutes || 0) && stats.minutes > 0 → 'minutes'
//   否則 'default'
```

### GET /api/report/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
驗證：兩參數必填且符合 `/^\d{4}-\d{2}-\d{2}$/`、from<=to、範圍 ≤ 400 天（400 拒絕）。回應：
```jsonc
{
  "range": { "from": "...", "to": "..." },
  "overview": {
    "total_minutes": 0, "active_days": 0, "chapters_done": 0, "tasks_done": 0,
    "goals_achieved": 0, "xp_earned": 0, "badges_earned": 0, "max_streak": 0
  },
  "subjects": [ { "subject_id": 1, "name": "國文", "color": "#..", "minutes": 0, "chapters_done": 0 } ],
  "grades":   [ { "subject_id": 1, "name": "國文", "color": "#..", "count": 3,
                  "avg_pct": 86.7, "best_pct": 95, "first_pct": 80, "last_pct": 92 } ],
  "goals":    [ { "id": 1, "title": "...", "goal_type": "chapter", "horizon": "short", "done_date": "2026-06-01" } ],
  "badges":   [ { "id": "streak_7", "name": "一週達人", "icon": "🌟", "rarity": "uncommon",
                  "earned_date": "2026-06-02", "custom": false } ],
  "monthly":  [ { "ym": "2026-06", "minutes": 480 } ],
  "level":    { "level": 6, "title_key": "level.title.2", "total_xp": 1310 }   // 產出當下快照，取自 getStatus 的欄位
}
```
SQL 要點（全部帶 user_id 參數；localtime 規則照第 0 節表）：
- overview.total_minutes / active_days：`SELECT COALESCE(SUM(minutes),0), COUNT(DISTINCT log_date) FROM study_log WHERE user_id=? AND log_date BETWEEN ? AND ?`
- chapters_done：`chapter_progress WHERE is_done=1 AND date(done_at,'localtime') BETWEEN`
- tasks_done：`daily_tasks WHERE is_done=1 AND task_date BETWEEN`
- goals 清單＋數量：`goals WHERE is_done=1 AND date(done_at,'localtime') BETWEEN`，`done_date = date(done_at,'localtime')`
- xp_earned：`xp_log WHERE reason NOT LIKE 'backfill:%' AND date(created_at,'localtime') BETWEEN`
- badges：系統徽章 `user_badges`（`date(earned_at,'localtime') BETWEEN`）名稱/icon/rarity 從 `badges/definitions.js` 在 JS 端 join（**它是 JS 陣列不是表**）；自訂徽章 `custom_badge_earned JOIN custom_badges`（rarity 用 `'custom'`）。合併後按 earned_date 排序。
- max_streak：範圍內 `SELECT DISTINCT log_date ... ORDER BY log_date ASC` → 丟給既有 `computeMaxStreak`（utils/streak.js）。
- subjects：study_log JOIN subjects GROUP BY subject_id；chapters_done per subject 用 `chapter_progress JOIN chapters ON` 再 GROUP BY chapters.subject_id，JS 端合併兩查詢。
- grades：撈範圍內 rows（exam_date 裸日期）`ORDER BY exam_date ASC`，JS 端按科目聚合出 count/avg/best/first/last（pct = score/max_score*100，取一位小數；max_score<=0 的列跳過）。
- monthly：`SELECT strftime('%Y-%m', log_date) ym, SUM(minutes) m FROM study_log ... GROUP BY ym ORDER BY ym`。

### GET /api/report/weekly-recap
```jsonc
{
  "week": { "from": "...", "to": "..." }, "prev": { "from": "...", "to": "..." },
  "stats":     { "minutes": 0, "active_days": 0, "chapters": 0, "tasks": 0, "goals": 0, "xp": 0 },
  "prevStats": { ...同構... },
  "highlight": "goals",
  "hasActivity": true    // stats 六項任一 > 0
}
```
週界用 `lastWeekRange(localToday())`；stats 聚合復用 summary 的查詢邏輯（抽一個內部 `aggregateRange(userId, from, to)` 兩支 API 共用，避免複製 SQL）。

### 驗收
- reportRange / recapHighlight 單元測試綠。
- 用測試帳號 curl 實測：`from=2026-05-01&to=2026-07-31` 應回 total_minutes≈635、chapters_done≈40、badges 含 level_5（帳號既有資料，唯讀查詢**無需清理**）；非法參數回 400。
- Commit：`feat: portfolio report + weekly recap API (single round-trip)`

## 4. Phase C — 歷程報告前端

### 檔案
- 新 `public/js/report.js`；改 `public/js/router.js`（route `report`）、`public/app.html`（側欄 nav，放在「成長軌跡」之後、分隔線之前）、`public/css/print.css`（直式變體）、`public/js/i18n.js`
- 側欄項目：`📜 <span data-i18n="nav.report">學習歷程</span>`

### 頁面結構（wireframe）
```
[no-print 控制列]
  模式 chips：(整學年)(單一區間)(自訂範圍)     ← 預設「整學年」
  整學年   → <select> 民國學年（來源：periods 去重 school_year；若無 periods，列出「今年、去年」兩個推算學年）
  單一區間 → <select> 各 period（school_year + enum.periodType.*）
  自訂範圍 → 兩個 <input type="date">
  [產生報告] [🖨️ 列印 / 另存 PDF]（產生前 print 鈕 disabled）
[.print-page portrait 報告本體]
  print-header：📜 學習歷程報告｜學生名＋範圍＋產生日期（fmtDate 民國格式）
  ① 學習總覽：8 格 stat tiles（總時數 h/m、活躍天數、完成章節、完成作業、達成目標、獲得XP、獲得徽章、最長連續）＋一行等級稱號「⭐ Lv.6 勤奮新星（累積 1310 XP）」
  ② 各科學習時間：每科一列（色塊＋科名＋CSS 橫條＋分鐘/時數）；條寬 = minutes/max*100%
  ③ 每月學習軌跡：每月一列 CSS 橫條
  ④ 成績表現：表格（科目｜次數｜平均｜最高｜趨勢），趨勢用 last_pct vs first_pct：差 >+2 ↑進步 / <-2 ↘再加油 / 其餘 →持平
  ⑤ 目標達成：列表（型別icon＋標題＋期程＋達成日）
  ⑥ 獲得徽章：flex-wrap 徽章格（icon＋名稱＋日期）
  頁尾：家長簽名 ______＋「本報告由學習管理系統自動產生 YYYY-MM-DD」
```
- 空資料：整個範圍無任何紀錄 → 報告本體換 `report.empty.range` 訊息；個別區塊空 → 該區塊顯示 `report.empty.section`。
- 型別 icon 沿用 goals 頁慣例（chapter 📖 / grade 💯 / text ✏️——**實作時先 Grep public/js/goals.js 對齊既有 icon**，不同就照 goals.js）。
- 所有使用者輸入內容（goal title、自訂徽章名、科目名）過 `escHtml`。

### print.css 追加
```css
.print-page.portrait { width: 210mm; min-height: 297mm; }
.report-section { break-inside: avoid; margin-bottom: 12px; }
.report-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
```
（沿用既有 `@media print` 隱藏側欄的機制——照 print.js 的頁面骨架抄，先確認該機制對新頁生效。）

### i18n（zh-TW / en / ja，照貼；插入位置照 growth 區塊前例，各字典一處）
```
'nav.report': '學習歷程' / 'Portfolio' / '学習のあゆみ'
'report.title': '學習歷程報告' / 'Learning Portfolio Report' / '学習ポートフォリオレポート'
'report.modeYear': '整學年' / 'School year' / '学年'
'report.modePeriod': '單一區間' / 'Period' / '期間'
'report.modeCustom': '自訂範圍' / 'Custom range' / 'カスタム範囲'
'report.generate': '產生報告' / 'Generate' / 'レポート作成'
'report.print': '🖨️ 列印 / 另存 PDF' / '🖨️ Print / Save as PDF' / '🖨️ 印刷 / PDF保存'
'report.student': '學生' / 'Student' / '生徒'
'report.generatedAt': '產生日期' / 'Generated' / '作成日'
'report.sec.overview': '學習總覽' / 'Overview' / '学習サマリー'
'report.sec.subjects': '各科學習時間' / 'Study Time by Subject' / '科目別学習時間'
'report.sec.monthly': '每月學習軌跡' / 'Monthly Study Trail' / '月別学習記録'
'report.sec.grades': '成績表現' / 'Grades' / '成績'
'report.sec.goals': '目標達成' / 'Goals Achieved' / '達成した目標'
'report.sec.badges': '獲得徽章' / 'Badges Earned' / '獲得バッジ'
'report.m.totalHours': '總學習時數' / 'Total study time' / '総学習時間'
'report.m.activeDays': '活躍天數' / 'Active days' / '学習日数'
'report.m.chapters': '完成章節' / 'Chapters done' / '完了章数'
'report.m.tasks': '完成作業' / 'Tasks done' / '完了宿題'
'report.m.goals': '達成目標' / 'Goals achieved' / '達成目標'
'report.m.xp': '獲得 XP' / 'XP earned' / '獲得XP'
'report.m.badges': '獲得徽章' / 'Badges' / '獲得バッジ'
'report.m.maxStreak': '最長連續學習' / 'Longest streak' / '最長連続学習'
'report.hours': '{h} 小時 {m} 分' / '{h}h {m}m' / '{h}時間{m}分'
'report.days': '{n} 天' / '{n} days' / '{n}日'
'report.grades.count': '次數' / 'Count' / '回数'
'report.grades.avg': '平均' / 'Average' / '平均'
'report.grades.best': '最高' / 'Best' / '最高'
'report.grades.trend': '趨勢' / 'Trend' / '傾向'
'report.trend.up': '↑ 進步' / '↑ Improving' / '↑ 上昇'
'report.trend.flat': '→ 持平' / '→ Steady' / '→ 横ばい'
'report.trend.down': '↘ 再加油' / '↘ Keep going' / '↘ これから'
'report.empty.section': '這段期間沒有紀錄' / 'No records in this range' / 'この期間の記録はありません'
'report.empty.range': '這個範圍還沒有學習紀錄，換個範圍試試！' / 'No study records in this range yet — try another one!' / 'この範囲にはまだ記録がないよ。別の範囲を試してみて！'
'report.signature': '家長簽名' / 'Parent signature' / '保護者サイン'
'report.footer': '本報告由學習管理系統自動產生' / 'Generated automatically by the Study Manager' / '学習管理システムにより自動作成'
```

### 驗收
- Playwright：測試帳號開 `#report` → 選自訂範圍 2026-05-01~07-31 → 產生 → 總覽數字與 Phase B curl 結果一致；亮/暗主題（報告本體恆白底黑字，控制列跟主題）；切 en 一次確認全翻。唯讀功能，**無需清理**。i18n Grep 每 key ×3。
- Commit：`feat: portfolio report page (printable, v3.7)`

## 5. Phase D — 週回顧卡

### 檔案
- 改 `public/js/dashboard.js`（Promise.all 加 `get('/report/weekly-recap')`；新卡插在「成長等級」卡之後）、`public/js/i18n.js`

### 卡片規格
- `recap.hasActivity === false` → **整卡不渲染**（零活動不顯示、不指責）。
- 內容：標題 `🗓️ recap.title`＋大字亮點句 `recap.headline.<highlight>`（goals/chapters/minutes 帶 {n}）＋五格迷你統計（分鐘/活躍天/章節/作業/XP），每格下方小字與前週差值 `recap.vs`：**僅當該項 ≥ 前週才顯示**（+N 綠色）；低於前週不顯示差值（鼓勵導向，不出現負數）。
- highlight 由 API 給，前端不重算。

### i18n
```
'recap.title': '上週回顧' / 'Last Week Recap' / '先週のふりかえり'
'recap.headline.goals': '上週達成了 {n} 個目標，太厲害了！' / 'You achieved {n} goals last week — amazing!' / '先週は目標を{n}個達成、すごい！'
'recap.headline.chapters': '上週完成了 {n} 個章節進度！' / '{n} chapter sessions done last week!' / '先週は章の進度を{n}件完了！'
'recap.headline.minutes': '上週讀了 {n} 分鐘，比前一週更多！' / '{n} minutes last week — more than the week before!' / '先週は{n}分学習、前の週よりアップ！'
'recap.headline.default': '上週也有好好累積喔，繼續保持！' / 'Solid progress last week — keep it up!' / '先週もコツコツ積み上げたね、その調子！'
'recap.m.minutes': '讀書分鐘' / 'Minutes' / '学習分'
'recap.m.activeDays': '活躍天數' / 'Active days' / '学習日数'
'recap.m.chapters': '完成章節' / 'Chapters' / '完了章'
'recap.m.tasks': '完成作業' / 'Tasks' / '宿題'
'recap.m.xp': '獲得 XP' / 'XP' / '獲得XP'
'recap.vs': '比前週 +{n}' / '+{n} vs prior week' / '前週比 +{n}'
```

### 驗收
- 測試帳號上週無資料 → 卡不出現；用 DB 直插一筆上週 study_log（記下 id）→ 重整卡出現、亮點句正確 → **刪除該筆＋對應 xp_log/daily_reward_log/point_log 測試列還原**（若走 API 建立才會產生後三者；直插 DB 則只需刪 study_log）。亮/暗主題各看一次。i18n Grep ×3。
- Commit：`feat: weekly recap card on dashboard`

## 6. 總驗收清單（全部 Phase 完成後逐條核對）
- [ ] npm test 全綠（新增 autoBackup / reportRange / recapHighlight 測試）
- [ ] `啟動.bat` 重啟：正常服務＋自動備份檔出現且不重複
- [ ] 測試帳號實測四項：報告產生（數字對得上 curl）、列印預覽正常分頁、回顧卡顯示/隱藏邏輯、`data/backups` 不入 git
- [ ] i18n 全部新 key Grep ×3（report.* 36 + recap.* 11 + nav.report）
- [ ] 測試資料清理完畢、user7 lang 仍 zh-TW
- [ ] 逐檔 commit（4 個 feature commit）
- [ ] 更新 `X:\class\CLAUDE.md` 進行中的工作段（標記 v3.7 完成）

## 7. 風險備忘
- **列印樣式是本計畫最大的品味/相容性風險**：完成後務必實際開列印預覽（Playwright 可 `browser_run_code_unsafe` 觸發 `matchMedia('print')` 有限，最穩是人工按 Ctrl+P 目視一次）——交付報告時明確標註「列印效果建議人工過目」。
- 報告頁白底固定（證明文件不跟暗色主題），只有控制列跟主題——避免暗色主題下白紙刺眼以外的複雜度。
- `badges/definitions.js` 是 JS 陣列：徽章名稱在 JS 端 join，別嘗試 SQL JOIN。
- 範圍上限 400 天防止整學年＋誤輸入造成的巨量掃描；夠涵蓋一個學年（366 天）。
- 週回顧「上週」語意固定為上一個完整週一~週日，與 growth 頁的 weekly XP（Monday-start）一致。
