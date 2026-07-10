# 行事曆 ↔ 作業清單 連動：正名事件 + 作業清單單向上曆

> 版本：2026-07-10 由 Fable 5 規劃，交由 Opus 實作。
> 依據：使用者要求「行事曆和作業清單應該相互連動」。經資料調查（見下）確認方向。
> **開工前依全域不變量 1 向使用者確認「要開始實作了嗎？」**。工作分支 `dev-2026-07-08`。

## 0. 為什麼是這個方向（給 Opus 的背景）

系統有兩個看似重複、實則用途不同的實體：
- **`assignments`**（行事曆裡建立、有 `due_date`）：資料調查顯示**兩個孩子都沒拿它當作業**——炎朗全部拿來記生活事件（游泳/去澎湖/開學，平均 23 天後的未來行程），邦正只有 2 筆垃圾測試資料。它實際上是被挪用的「事件工具」。
- **`daily_tasks`**（側欄「作業清單」、有 `task_date` + 多段勾選）：**兩個孩子的真正作業都在這**（邦正有標科目、用多段；炎朗記當天簡短作業）。

**結論**：兩者不該合併（合併會把「去澎湖」和「今天的數學作業」攪在一起）。正確做法＝**把 `assignments` 正名為「事件／行程」**（還它實際角色、順便補上系統缺的事件功能），並**把 `daily_tasks` 單向顯示到行事曆**（月曆成為事件＋作業＋考試＋讀書排程的完整時間總覽）。

**已完成的前置**：邦正 assignment id=2 的 `due_date` 打錯成 2126 年，已透過 API 修正為 2026-05-24（測試用帳號 id7 的 id6 同樣有 2126 的測試資料，屬測試資料、未動）。

## 1. 交接注意（違反即事故）

1. **無 DB migration、無後端變更**。所需端點全部已存在：`GET /daily-tasks?from=&to=`（回傳含 parts + subject_name/color 的作業）、`PATCH /daily-tasks/:id`（整項完成、會把所有 part 設為同狀態、回傳含 gamify）、`GET /assignments`、`PUT /assignments/:id`。
2. **正名是純 UI 文案改動**：**不要**改 `assignments` 資料表、`routes/assignments.js`、`calendar.js` 裡的 `_type:'assignment'`、`window.toggleAssignment/deleteAssignment` 等內部識別名，也**不要**改 i18n 的 key 名——只改 i18n 的**顯示值**（key 名維持，雖然 `chip.assignment` 的值變成「事件」略微名不符實，這是為了零風險、不漏改任何呼叫點所做的取捨）。
3. 前端拿「今天/本地日期」一律用 `api.js` 的 `today()`／`ymd(d)`；禁止新的 `toISOString().slice(0,10)`。
4. i18n：改動或新增的 key，完成後 Grep 每 key 命中數 = 3（三語）。新增字串照本文件附的三語表。
5. 日期欄位型別（決定要不要加 `'localtime'`）：`daily_tasks.task_date`、`assignments.due_date` 都是**裸日期字串**，直接比較，**不加** localtime。（本計畫的 SQL 都走既有端點，通常不需自己寫 SQL。）
6. git 逐檔 `git add <路徑>`，**禁 add -A**。每個 Phase 完成即 commit。
7. 驗證：改 UI 用 Playwright + 測試用帳號（id 7）；測後清理測試資料；重啟用 `啟動.bat`（PowerShell `& ".\啟動.bat"` run_in_background）。Phase A2 動了後端，重啟一次確認可服務。動 UI 一律亮/暗主題各看一次。
8. **卡關升級路徑（使用者已授權）**：符合 `rules/20-judgment.md` 第 1 節升級判準（同一問題兩種本質不同的方法都失敗）、第 4 節換路訊號、或遇到高風險/品味裁量時，**用 Agent 工具派 `model: "fable"` 的 general-purpose 顧問 agent**：prompt 附上「已知事實／已試方法／卡點」三段＋相關檔案路徑＋本計畫路徑，回報合約 ≤400 字。顧問意見仍解不了 → 停下來問使用者。不要在沒諮詢前把同一修法試第三次。

## 2. Phase A — 正名「作業(assignments)」為「事件／行程」

### 檔案
- `public/js/i18n.js`（只改顯示值）
- `badges/definitions.js`（兩個徽章的 name/desc，見下）
- ~~檢查 dashboard/calendar 有無寫死「作業」~~ **已查證（2026-07-10）**：`assignmentDueCard`（dashboard.js:287-302）與 calendar.js 全部走 t()，無寫死字串；倒數文案（「X 天後/今天」）對事件同樣通順，**無需動**。

### i18n 顯示值改動（三語，key 名不變）
| key | 新值 zh-TW | 新值 en | 新值 ja |
|---|---|---|---|
| `chip.assignment` | 事件 | Event | イベント |
| `cal.addAssignment` | + 新增事件 | + Add Event | + 予定追加 |
| `modal.addAssignment` | 新增事件 | Add Event | 予定追加 |
| `label.assignmentName` | 事件名稱 | Event Name | 予定名 |
| `label.assignmentPlaceholder` | 例：段考、校外教學、才藝課 | e.g. exam, field trip, class | 例：試験、遠足、習い事 |
| `label.dueDate` | 日期 | Date | 日付 |
| `card.assignmentDue` | 📅 近期事件 | 📅 Upcoming Events | 📅 近日の予定 |
| `dash.noAssignmentDue` | 近期沒有安排事件 | No upcoming events | 近日の予定はありません |
| `confirm.deleteSubject` | 刪除科目會同時刪除所有相關章節、事件、考試等資料，確定嗎？ | Deleting a subject also removes all related chapters, events, exams, etc. Are you sure? | 科目を削除すると関連するすべての章、予定、試験等も削除されます。よろしいですか？ |

- `confirm.deleteAssignment`（「確定刪除？」等）是通用字，**不用改**。
- `label.dueDate` **已查證（2026-07-10）**：全 repo 只有 calendar.js:162 使用 → 直接改值為「日期」，無其他使用點，不需開新 key。

### 徽章文案正名（badges/definitions.js，只改 name/desc，**id/條件/icon/rarity 不動**）
`first_assignment` 與 `assignments_20` 的判定條件綁在 assignments 表（badges/checker.js 的 doneAssignments），正名後它們實際獎勵的是「完成事件」，但文案寫「作業」會變成：孩子勾掉「去澎湖」跳出「完成第一份作業」徽章——不通。改為：
- `first_assignment`：name `責任達人`（保留）、desc `完成第一個行事曆事件`
- `assignments_20`：name `行動英雄`（原「作業英雄」）、desc `累積完成20個事件`
已得徽章按 id 關聯、顯示時查 definitions，改名對已獲得的徽章安全。徽章名稱本來就只有中文（definitions.js 不走 i18n，既有設計），維持。**名稱屬品味，使用者可改**——動工前如使用者有偏好以其為準。

### 驗收 A
- Grep 全 `public/js`：確認提到 assignments 的 user-facing 字串都已是「事件」語意；「作業」二字只剩下 daily_tasks/homework 相關（`nav.homework`=作業清單、`card.todayHomework`=今日作業、`chip.task`=作業 等）。
- `badges/definitions.js`：`first_assignment`/`assignments_20` 的 desc 不再含「作業」；「我的徽章」頁該兩枚徽章顯示新文案（測試帳號目視一次）。
- 行事曆日期詳情的 chip 顯示「事件」、新增鈕顯示「+ 新增事件」、彈窗表單為「事件名稱/日期」；儀表板卡片為「📅 近期事件」。三語各看一次。
- i18n 改動 key Grep ×3。
- Commit：`refactor: rename calendar assignments to events in UI (v3.8 Phase A)`

## 2b. Phase A2 — 事件完成不再給 XP／驚喜（使用者已裁決）

### 檔案
- `utils/gamify.js`：刪 processActivity 直接 XP 區的 `else if (event.type === 'assignment') { grantOnce(XP_RULES.assignmentDone, ...) }` 分支；刪 surprise `qualifies` 裡的 `event.type === 'assignment'` 一項。
- `utils/xp.js`：刪 `XP_RULES.assignmentDone`（移除後即無使用點）。
- `test/xp.test.js`：刪 `assert.equal(XP_RULES.assignmentDone, 10)` 斷言。
- `test/gamify.test.js`：把「assignment completion grants XP (F8)」測試改寫為反向斷言——完成 assignment 後 `r.xp.gained === 0`、`r.surprise === null`、xp_log 無 `assignment:%` 列。
- **不要動** `routes/assignments.js` 的 `processActivity` 呼叫：完成事件仍需觸發 checkBadges（`first_assignment`/`assignments_20` 徽章仍以事件完成為條件），processActivity 對 assignment 事件會自然走到「無 XP、無驚喜、跑徽章」。gamify.js 開頭的事件形狀註解同步更新一行說明。

### 驗收 A2
- `npm test` 綠（含改寫後的測試）。
- 手動：測試帳號完成一個事件 → 回應 `xp.gained===0`、無 surprise、`newBadges` 正常運作（若條件成立會發徽章）→ 測後還原該事件的 is_done 並清理徽章測試列（若有新發）。
- Commit：`fix: completing calendar events no longer grants XP or surprise (v3.8 Phase A2)`

## 3. Phase B — 作業清單(daily_tasks) 單向顯示到行事曆

### 檔案
- `public/js/calendar.js`
- `public/js/i18n.js`（2 個新 key）

### calendar.js 改動
1. **抓資料**：`renderMonth` 的 `Promise.all` 增加當月作業查詢。注意：現有程式的 `lastDay` 在 Promise.all **之後**才計算（calendar.js:39-42），月份天數要先自行算好。確切寫法（勿用 toISOString）：
   ```js
   const mm = String(currentMonth + 1).padStart(2, '0');
   const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
   const [assignments, exams, scheduled, tasks] = await Promise.all([
     get('/assignments'),
     get('/exams'),
     get('/chapters/scheduled'),
     get(`/daily-tasks?from=${currentYear}-${mm}-01&to=${currentYear}-${mm}-${String(daysInMonth).padStart(2, '0')}`),
   ]);
   ```
   （後端 range 查詢要求 from、to **皆為**合法日期，缺一回 400——上式恆兩者皆給。回傳已含 parts 與 subject_name/color，2026-07-10 查證於 routes/daily-tasks.js withParts。）
2. **併入 byDate**：`_type:'task'`，帶 `id, title, subject_name, subject_color, is_done, parts, task_date`。
   ```js
   for (const tk of tasks) (byDate[tk.task_date] = byDate[tk.task_date] || []).push({ ...tk, _type:'task' });
   ```
3. **月曆格子圖示**：在既有 icon 判斷加 task 分支——`ev._type==='task' ? '📋'`。標籤 = `subject_name ? subject_name+'・'+title : title`。**顏色 fallback**：daily_tasks 常無科目（`subject_color` 可能為 null），格子 dot 的 `background:${ev.subject_color || '#94a3b8'}`。
4. **日期詳情彈窗**：task 列渲染——
   - chip 用新 key `t('chip.task')`（值「作業」），與事件的 `chip.assignment`（「事件」）區分。
   - 有 `subject_name` 才顯示 subject badge。
   - 多段作業（`parts.length>1`）在標題後顯示進度 `doneParts/parts.length`。
   - 完成狀態：`is_done`（或所有 part 完成）時標題加刪除線。
   - **快速完成鈕**：`<button onclick="calToggleTask(${ev.id}, ${ev.is_done?1:0})">` → `PATCH /daily-tasks/:id { is_done: !isDone }`（整項；會連動所有 part）→ 成功後 `renderMonth(el)` 重繪。
   - **前往作業清單連結**：`<button onclick="navigate('homework')">${t('cal.goToHomework')}</button>`（細部分段管理仍在作業清單頁做）。
   - task 列**不提供**新增/編輯（單向：作業在作業清單頁建立與編輯；行事曆只顯示 + 快速勾選 + 跳轉）。
5. **新 window handler**：
   ```js
   window.calToggleTask = async (id, isDone) => { await patch('/daily-tasks/'+id, { is_done: !isDone }); await renderMonth(el); };
   ```
   （記得 `patch` 已在 calendar.js 的 import 內：`import { get, post, put, del, ... }`——**需補 `patch`**。）
   `navigate` 是全域函式（app.html 掛在 window），可直接用；若 lint 不過，改 `window.navigate('homework')`。
6. 完成 daily_task 會透過既有端點觸發作業 XP／每日驚喜——`api.js` 的 `gamify-result` 攔截器會自動彈 toast，無需額外處理。

### i18n 新 key（三語，×3）
| key | zh-TW | en | ja |
|---|---|---|---|
| `chip.task` | 作業 | Homework | 宿題 |
| `cal.goToHomework` | 前往作業清單 → | Go to homework → | 宿題リストへ → |

### 驗收 B
- 用測試用帳號（id7）：在作業清單頁（或直接 DB 插入）建一筆本月的 daily_task，記下 id；開行事曆該月 → 該日格子出現 📋 作業；點該日 → 詳情列出該作業、chip 顯示「作業」、有「前往作業清單」；按快速完成 → `is_done` 翻轉（多段則所有 part 一起完成）、行事曆重繪為已完成樣式；按「前往作業清單」→ 跳到 homework 頁。
- 事件（assignments）仍顯示為「事件」chip，與作業並存不混淆。
- 亮/暗主題各一次。
- 測後刪除該測試 daily_task（若走 API 完成過，順手清 xp_log 非 backfill／daily_reward_log／point_log surprise 的測試列；用過 switchLang 要把 users.lang 改回 zh-TW）。
- i18n 新 key Grep ×3。
- Commit：`feat: show homework tasks on the calendar (v3.8 Phase B)`

## 4. 總驗收
- [ ] `npm test` 綠（本計畫不新增純邏輯，測試數不變；跑一次確認無回歸）
- [ ] `啟動.bat` 重啟正常服務
- [ ] 測試帳號實測 A（正名）＋ B（作業上曆、勾選、跳轉），亮/暗主題
- [ ] 所有改動/新增 i18n key Grep ×3
- [ ] 測試資料清理、user7 lang 仍 zh-TW
- [ ] 逐檔 commit（3 個：Phase A、Phase A2、Phase B）
- [ ] 更新 `X:\class\CLAUDE.md` 進行中的工作段（標記 v3.8 完成）

## 5. 風險與備註

### 已裁決：事件不給 XP（使用者 2026-07-10 決定，納入本輪 Phase A2）
背景：v3.6 review 修復（F8）給 assignment 完成加了 XP＋驚喜資格——當時 assignments 還被理解為作業。正名後使用者裁決：**生活行程不給 XP**。實作見 Phase A2。已查證 xp_log 無任何 `assignment:%` 既存紀錄（測試列已清），無資料清理需求。
- **不做的事**：不合併兩實體、不做「事件→作業清單頁」的反向顯示（資料調查顯示把事件塞進作業清單頁沒有意義）、不在行事曆新增/編輯作業。若日後使用者想要「行事曆也能新增作業」，再另議。
- **顏色 fallback** 是本階段唯一容易漏的細節：daily_tasks 多半無 subject，格子 dot 與 badge 都要能容忍 `subject_color=null`。
- 事件（assignments）目前無獨立管理頁，仍在行事曆內建立/刪除——正名後這個互動不變，只是文案正確了。日後若要獨立「事件」頁再另議。
- 測試用帳號 id6 那筆 2126 年的測試 assignment 可留可刪，非孩子真實資料；若它干擾行事曆測試（顯示在很遠的未來月份），測試時略過即可。
