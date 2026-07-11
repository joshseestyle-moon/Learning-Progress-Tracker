# 效能/最佳化盤點 — 2026-07-11（唯讀稽核）

範圍：X:\class。分支 chore-copy-script-m25。未改任何檔、未 npm install。

---

## 1. 既知未修效能發現（docs/handoff-2026-07-11.md §2 #6-#9）— 現場核對結果

來源文件標記這 4 項為「非 bug，品質改善」「未做」。逐項核對現行程式碼（v3.9 code-review 之後又經過 F1-F10 修復輪，行號可能已偏移）：

### #6 — 每次點區間 chip 都重抓完整資料集（**現場仍成立**）
- **檔案:行號**（已更新）：`public/js/chapters.js:34-39`（refresh() 內 `Promise.all([get('/chapters'), get('/studylog/by-chapter')])`）／`public/js/exams.js:25-27`（`Promise.all([get('/exams'), get('/chapters')])`）
- **問題**：区间只在客戶端過濾（`inScope()` / `exam_date` 比對），但切 chip 一律重新發整批 API 請求，兩個多餘網路往返。
- **修法**：render() 首次抓資料後快取在模組變數，chip 的 onChange 只重跑本地 filter + 重繪，不重新 fetch；只有離開頁面重進才重抓。
- **預期效益**：切區間從「2 次 API + 序列化」降為 0 次，UI 反應從網路延遲降到純 DOM 重繪（本機/區網通常 <50ms→<5ms 級）。
- **風險**：低（資料在單頁 session 內不會被其他分頁更動；若擔心資料新鮮度，可在「回到本頁簽」或閒置一段時間後失效快取）。

### #7 — studylog 頁切 chip 重抓全部 6 個端點（**現場仍成立**）
- **檔案:行號**：`public/js/studylog.js:30-43`（`refresh()` 內 `Promise.all([get('/studylog'+q), get('/studylog/weekly'), get('/studylog/heatmap?days=364'), get('/studylog/monthly?months=6'), get('/studylog/summary'+q), get('/studylog/dashboard-stats')])`）
- **問題**：檔案自身註解（第 32-34 行）已言明「只有 `/studylog` 與 `/studylog/summary` 依 scope 變動」，其餘 4 個（weekly/heatmap 364天/monthly/dashboard-stats）為固定視窗、與 scope 無關，但每次切 chip 仍全部重抓，尤其 heatmap 364 天筆數不小。
- **修法**：切 scope 只重抓 `get('/studylog'+q)` 與 `get('/studylog/summary'+q)`，其餘 4 個只在首次 render() 抓一次、快取後重複使用（renderChart/renderHeatmap/renderMonthly 用快取值重繪即可，因為這些視圖本身不受 scope 影響、DOM 也不需要重建）。
- **預期效益**：切區間的請求數從 6 降為 2，尤其省掉 364 天 heatmap 這種相對大的查詢/序列化開銷。
- **風險**：低。

### #8 — 四頁重複 `_el`/`_scope`/`_gen` + initPeriodFilter 樣板（**現場仍成立，且因 F1 修復又新增了 `_gen` 世代守衛，重複度不減反增**）
- **檔案:行號**：`public/js/chapters.js:6-8,10-19`、`public/js/exams.js:14-16,18-22`、`public/js/homework.js:5-8,10-14`、`public/js/studylog.js:14-16,18-27`——四份檔案各自宣告 `_el`/`_scope`/`_gen` 模組變數與幾乎相同的 `render()` 骨架（`initPeriodFilter(el.querySelector(...), scope => { _scope = scope; refresh(); })`）。
- **問題**：往後修 race-guard、加快取（呼應 #6/#7）都要同步改 4 處；已發生過一次（`_gen` 世代守衛是這輪 F1 修復時 4 檔各自手植）。
- **修法**：把 `_el`/`_scope`/`_gen` 與 render 骨架收進 `period-filter.js`，改成 `mountPeriodScoped(el, containerId, refresh)` 之類的高階函式，四頁只提供 `refresh(scope)` 回呼與各自的 body 容器 id。
- **預期效益**：非效能本身，是「降低未來重工/漏改風險」的重構型優化；若同時做 #6/#7 的快取，收斂後只需改一處。
- **風險**：中（觸及 4 個頁面的載入路徑，需逐頁手動驗證區間切換、離開頁面時序、無區間帳號等邊界情況；建議與 #6/#7 合併在同一個 PR 做，一次驗證到位）。

### #9 — inRange 比對邏輯手寫三處（**現場仍成立**）
- **檔案:行號**：`public/js/chapters.js:26-32`（`inScope()`：`created >= from && created <= to`，加上 reviews 的 `scheduled_date` 比對）／`public/js/exams.js:29-31`（`e.exam_date >= _scope.from && e.exam_date <= _scope.to`）
- **問題**：`period-filter.js` 目前只有 `localD()`/`periodLabel()`/`initPeriodFilter()`，沒有匯出共用的日期落點判斷，三處字串比較各自手刻（注意：`exam_date`/`scheduled_date` 是純日期欄不需 `localD()`，只有 `created_at` 需要，三處写法已經正確區分，只是沒有收斂）。
- **修法**：`period-filter.js` 新增匯出 `inRange(dateStr, scope)`（`scope.mode!=='period' ? true : dateStr>=scope.from && dateStr<=scope.to`），三處呼叫點改用它。
- **預期效益**：非效能，是一致性/可維護性；順手做，risk 低。
- **風險**：低。

**建議**：#6 + #7 + #8 適合合併成一個重構 PR（同源：都是「把 `_el`/`_scope` 樣板收斂進 period-filter.js，順便讓快取生效」）；#9 可在同一 PR 順手做（新增 `inRange` 匯出即可，呼叫點三行改動）。

---

## 2. 其他 docs/ 中被延後的項目（review-findings-2026-07-10.md）— 現場核對

`review-findings-2026-07-10.md` 底部「完成狀態」明確列出三項「本輪未做（低價值、視覺回歸風險，留待日後）」，非本次任務的效能主軸，但按指示核對現場：

| 項目 | 現場狀態 | 備註 |
|---|---|---|
| `showGamifyToast`/`showBadgeToast` 收斂成一個 `showToast` | **仍未收斂**：`public/app.html:159`（`showBadgeToast`）、`:188`（`showGamifyToast`），呼叫點 `:184,241,244,247,251,254,262` | 純重複程式碼，非效能瓶頸，維持原文件判定（低價值、留待日後） |
| 進度條 `bar()` helper 收斂五處手刻 HTML | 16 個檔案含 `width:`/progress 相關樣式（`goals.js/grades.js/studylog.js/exams.js/homework.js/chapters.js/growth.js/timetable.js/subjects.js/shop.js/print.js/report.js/gamify-ui.js/dashboard.js/calendar.js/badges.js`），未逐一確認是否都是「進度條」寫死 HTML；原文件指五處，實際命中面更廣，但未見新增 `bar()` helper | 屬 UI 一致性/簡化，非效能瓶頸，維持原判定，本輪不深入 |
| `routes/catchup.js:48` `overdue_chapters` 前端未用 | **仍存在**：`routes/catchup.js:48` 回傳 `overdue_chapters: chapters`，前端未見消費（原文件已決定「保留 API」） | 非效能問題（欄位小），維持原決策，不建議動 |

以上三項均為既有文件已下判定（低價值/留待日後/保留 API），非本次「已知未修效能發現」的核心對象，僅供交接完整性記錄，**不建議排入下一輪實作優先序**。

`handoff-2026-07-11.md` §2 的正確性 bug #1（切頁時 refresh 寫入已卸載 DOM）與 #2（chip 快速切換時 race）**已在現場修復**：四頁均已加上 `_gen` 世代守衛（`let _gen = 0; const gen = ++_gen; ... if (!body || gen !== _gen) return;`），與 CLAUDE.md 教訓紀錄「世代守衛 `_gen`＋null guard 模式」吻合，不需再處理。#3（新增作業日期落在區間外消失無提示）、#4（新增後 focus 遺失）、#5（`/summary` 部分 from/to 未回 400）未在本次範圍內逐一重新核對（非效能項，超出本任務範圍）。

---

## 3. 自查（高價值、低風險）

### 3.1 routes/ 中 N+1 查詢
- **`routes/goals.js:16-39`（GET /）＋ `utils/goalMetrics.js:6-36`（metricsFor）**：GET /api/goals 對每一筆 goal 呼叫一次 `metricsFor(userId, g, window)`，`chapter`/`grade` 型各自執行一條 `db.prepare(...).get()`——**每個 goal 一條 SQL**，且 `db.prepare()` 在函式內每次呼叫都重新解析 SQL（未用模組層級快取的 statement handle）。
  - **問題一句**：N 個 goal = N 條額外查詢，且每條都重新 prepare。
  - **修法一句**：短期—把 `metricsFor` 內的 `db.prepare(...)` 移到模組頂層只建立一次（重用 statement 物件，`.get()` 時才傳參數）；長期—若 goal 數量成長，可考慮一次查出所有 chapter/grade 完成統計再用記憶體 map 分配給各 goal。
  - **預期效益**：目前每個帳號 goal 數量通常個位數~十位數，實際影響小；但 statement 重新 prepare 是穩賺不賠的優化（省解析開銷），改起來零風險。
  - **風險**：低（純函式內部實作改變，行為不變，`npm test` 應可驗證 goals 相關測試綠燈）。

- **`utils/gamify.js:79-91`（autoAchieveGoals）**：同一模式，for 迴圈內對每個未完成 goal 呼叫 `metricsFor`；呼叫頻率是每次 processActivity（study/chapter/task/goal 事件都會走到，若 goalType 符合）。資料量同樣是個位數~十位數的 goal，量體小，暫不建議優化，僅記錄與上一項同源。

- 其餘 routes（chapters.js、report.js、catchup.js、studylog.js、daily-tasks.js）中的 `for`/`.forEach` 迴圈皆為**已一次性批次查詢後在記憶體中分組**（例如 chapters.js:57 建 reviewMap、report.js:70-93 建 minBySub/chBySub/gradeBySub），**不是** N+1，是正確寫法，未發現新增問題。

### 3.2 同一 request 內重複查詢
- 未發現重複查同一資料的模式（如連查兩次 users）。`utils/gamify.js` 的 `comboOf()` 會查一次 users.daily_goal_minutes，`processActivity` 內只呼叫一次 `comboOf`，結果通過參數/閉包傳遞，未見重複。

### 3.3 啟動路徑
- **`server.js:9-12`＋`utils/autoBackup.js`**：`performAutoBackup()` 在 `require('./db/db')` 之後、`app.listen` 之前同步執行，內部 `db.prepare('VACUUM INTO ?').run(tmpPath)` 是**阻塞式**操作。但有 `MIN_INTERVAL_DAYS=6` guard，平常啟動只做 `fs.readdirSync` 掃描 + 字串比較就 return，只有約每 7 天觸發一次真正的 VACUUM INTO。
  - **問題一句**：VACUUM INTO 同步阻塞事件迴圈，但因 guard 頻率低、資料庫是單一使用者小型 DB，實測影響應該很小。
  - **修法一句**：如果未來 DB 變大、啟動延遲有感，可把 VACUUM INTO 移到 `setImmediate`/背景（`app.listen` 後才跑），讓伺服器先開始接受請求。
  - **預期效益**：低（目前資料量小，VACUUM 應在毫秒~低秒等級），僅供未來 DB 增長時參考。
  - **風險**：低，但**優先序低**，不建議本輪排入。
- db.js 的 migration 鏈屬必要的同步阻塞（正確性優先於啟動速度），未發現可延後的部分。

### 3.4 前端序列 await（可平行化但目前未平行）
- `public/js/dashboard.js:20` 已用 `Promise.all` 平行抓 11 個端點——**無問題**。
- `public/js/growth.js`、`public/js/report.js`、`public/js/grades.js` 檢視後皆為單一 `await get(...)`（無多端點序列問題）。
- 上述 #6/#7 才是本專案真正的「多端點但序列/重複觸發」問題，已於第一節列出。

### 3.5 badges/checker.js 全量掃描
- **確認**：`checkBadges(userId, precomputed)`（`badges/checker.js:10-146`）**每次呼叫都跑約 18 條查詢**，涵蓋習慣/努力/完成/作業/補救/等級/成績七大類全部徽章條件，**不論觸發事件類型為何都全量掃描**（例如一筆 grade 記錄也會重新掃 study_log streak、daily_tasks 完成率等無關類別）。
  - 已有的優化（F10，`utils/gamify.js:174-182` 註解可見）：`comboDays` 由呼叫端算好傳入，省去 checker 內部重複算 combo；`badgeRelevant` 判斷跳過無效的 'task' 事件呼叫。
  - **問題一句**：每次活動（study/chapter/task/goal/grade/assignment）觸發都做全類別掃描，而非只查與該事件類型相關的類別。
  - **修法一句**：`checkBadges` 依 `event.type` 早退／分段——例如只有 `type==='study'` 才需要跑「習慣類」streak 與「努力類」總時數，只有 `type==='grade'` 才需要跑「成績類」；可傳入 `relevantCategories` 或直接依 event.type 做 switch 分流。
  - **預期效益**：**量化**：目前每次呼叫固定 ~18 條 SELECT（多數是 `COUNT(*)`/`SUM()` 單表掃描，資料量為單一使用者的個位數千筆等級），若依事件類型分流可降到 2-5 條/次。但因為單一使用者資料量小（SQLite 索引良好、WAL 模式），**實測延遲影響可能不明顯**（毫秒等級）。
  - **風險**：中——這是遊戲化核心邏輯，改動觸發時機容易漏掉某類徽章的判定條件（例如漏放某分類導致徽章在某事件類型下永遠不會被檢查到），**需要完整測試覆蓋每種 event.type × 每類徽章的組合才能安全重構**，投入產出比不如第一節的 #6/#7。
  - **建議**：列為「已知可優化但暫不建議動」，除非未來使用者數增加或量測到實際延遲問題。

---

## 4. 依賴版本（`npm outdated`）

```
Package         Current   Wanted   Latest
better-sqlite3  12.10.0   12.11.1  12.11.1
```

- **安全升級（patch/minor）**：`better-sqlite3` 12.10.0 → 12.11.1（minor bump，同大版本）。
- **需評估（major）**：無——`express`（^5.2.1）、`dotenv`（^17.4.2）目前都已是各自最新版，未列在 outdated 清單中。
- 未執行任何安裝；如需升級 better-sqlite3，建議走一般小分支＋`npm test`＋伺服器重啟兩次驗證（native module，重新編譯有失敗風險，雖是 minor）。

---

## 驗收條件核對

- [x] 四項（既知效能發現、其他延後項目、自查、依賴版本）各有結論。
- [x] #6/#7/#8/#9 逐項有「現場仍成立」判定（四項皆仍成立；行號已對照現行程式碼更新，並記錄 #1/#2 正確性 bug 已被後續修復取代）。
