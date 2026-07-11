# 計畫：程式碼跟版與最佳化（2026-07-11）

> 執行者：sonnet agent。依據兩份稽核報告：`docs/audit-2026-07-11-version-lag.md`（版本落後盤點）與 `docs/audit-2026-07-11-optimize.md`（效能盤點）。細節（現況行號、修法、風險）以稽核報告為準，本檔只定順序、範圍與驗收。
> 發現規格與現場矛盾時：停下回報，不要自行改設計。

## 0. 環境與不變量

- 工作目錄 `X:\class`，分支 **chore-optimize-2026-07-11**（已建好，基於 main 8cfc79f）。勿動 main。
- 伺服器啟動/重啟一律 `啟動.bat`（PowerShell：`& ".\啟動.bat"`，run_in_background；背景工作停在最後的 pause 屬正常，以 port 3000 探測為準）。
- UI 驗證一律用「測試用帳號」（user id=7）；絕不動真實帳號（邦正/炎朗）。「測試用帳號B」（id=8）是邦正資料的複本，可用來看資料量較大時的表現，但**不要改它的資料**。
- 本計畫**無 migration、無新 UI 字串**（不需要動 i18n.js；若實作中發現需要新字串，停下回報）。
- 測試腳本若 require db，必先設 `process.env.DB_PATH` 指向拋棄式 DB（require('./db/db') 有 migration 副作用）。
- git 一律逐檔 `git add <路徑>`，禁用 `add -A`/`add .`。每個 Batch 一個 commit，隨做隨 commit。

## 1. Batch 順序（依價值/風險排定，依序做）

### Batch 1 — 日期正確性修復（中風險 bug，最先做）
1. `public/js/badges.js:18`：`fmtDate(new Date(b.earned_at).toISOString().slice(0,10))` → 改用 `period-filter.js` 匯出的 `localD(b.earned_at)`（需 import）。
2. `routes/assignments.js:15-19`：upcoming 上界改為 SQL 端 `date('now','localtime','+N days')`，與下界同基準（詳見 audit-version-lag §3）。
- 驗收：npm test 綠；badges 頁徽章日期顯示正常（Playwright 抽一眼）。
- Commit：`fix: two UTC/local date mixups (badge earned date, assignments upcoming bound)`

### Batch 2 — 區間頁面收斂重構＋快取（#6+#7+#8+#9 合一）
對象：`public/js/period-filter.js` 與四頁 `chapters.js`/`exams.js`/`homework.js`/`studylog.js`（grades.js 視情況一併收斂，若改動面過大可留用現狀並回報）。
1. **#9** period-filter.js 新增匯出 `inRange(dateStr, scope)`（`scope.mode!=='period' ? true : dateStr>=scope.from && dateStr<=scope.to`），手刻比對處改用（chapters.js:26-32、exams.js:29-31、grades.js:31-33）。
2. **#8** 把 `_el`/`_scope`/`_gen`＋render 骨架收斂進 period-filter.js 的高階函式（如 `mountPeriodScoped(el, opts)`），四頁只提供自己的 refresh 回呼。介面自行設計，但必須保留：世代守衛語意（過期 refresh 不落 DOM）、無區間帳號時不顯示 UI 且行為不變、localStorage `periodScope` 跨頁共用。
3. **#6** chapters/exams：首次 render 抓資料後快取在模組變數，切 chip 只重跑本地 filter＋重繪，不重新 fetch；離開頁面重進才重抓（render 時重置快取即可，天然符合）。
4. **#7** studylog：切 chip 只重抓 `/studylog?from&to` 與 `/studylog/summary?from&to` 兩端點；weekly/heatmap/monthly/dashboard-stats 首次抓一次快取重用。
- 驗收（Playwright，測試用帳號）：四頁逐頁——chip 切換資料正確、切到「全部」正確、快速連續切 chip 不壞版（世代守衛仍有效）、切頁再回來資料是新抓的；用瀏覽器 network 或 console 確認切 chip 時 chapters/exams 為 0 個 fetch、studylog 為 2 個。npm test 綠。
- Commit：`refactor: converge period-scope boilerplate into period-filter.js + cache datasets on chip switch (#6-#9)`

### Batch 3 — 九個舊模式頁面補世代守衛
對象（見 audit-version-lag §2 行號）：dashboard、timetable、goals、growth、badges、shop、calendar、report、subjects。
- 比照 grades.js 範本：模組級 `_gen`，每次 refresh/render 開頭 `const gen = ++_gen`，任何 `await` 之後落 DOM 前檢查容器仍存在且 `gen === _gen`，否則 return。
- subjects.js 順手把 `refresh(el)` 改為模組級 `_el`＋無參數 `refresh()`（與新規範一致）。
- **只加守衛，不改各頁其他邏輯**；calendar/report 這種多入口重繪的檔案，守衛放在會 await 後寫 DOM 的函式即可，不必大改結構。
- 驗收：九頁逐頁能正常載入操作（Playwright 快速過一輪：dashboard 卡片、timetable 顯示、goals 新增/勾選、growth 圖、badges 列表、shop 兌換列表、calendar 月曆、report 產生報告、subjects 增改）；npm test 綠。
- Commit：`fix: add render-generation guards to the 9 legacy page modules`

### Batch 4 — 低風險清理＋依賴升級
1. `db/db.js:215` migration 內自建 RARITY_PTS → 改 require `utils/points`；`db/db.js:214-222` 回填迴圈比照 db.js:371 包 `db.transaction()`。
2. `routes/shop.js:5` 移除未使用的 RARITY_PTS 解構（死 import）。
3. `npm install better-sqlite3@12.11.1`（minor；native module 重編譯若失敗，回退 package.json/package-lock.json 並回報，不要硬修）。
- 驗收：npm test 綠；**伺服器重啟兩次皆無錯**（動了 db.js 與 native 依賴，此條必做）。
- Commit：`chore: converge RARITY_PTS in db.js, drop dead import, bump better-sqlite3 to 12.11.1`

## 2. 明確不做（已評估排除，不要順手做）
- badges/checker.js 依 event.type 分流（中風險、實測效益毫秒級，audit-optimize §3.5 判定不動）。
- autoBackup VACUUM 移到 listen 後（優先序低）。
- showGamifyToast/showBadgeToast 收斂、進度條 bar() helper、catchup overdue_chapters 欄位（既有文件判定留待日後）。

## 3. 總驗收（全部 Batch 完成後）
1. `npm test` 綠。
2. `啟動.bat` 重啟兩次皆無錯。
3. Playwright（測試用帳號）：13 個頁面模組全部能載入無 console error；四個區間頁 chip 行為正確；亮/暗主題各抽 2 頁看無壞版。
4. `git log main..HEAD` 恰為 4 個 commit（加上本計畫/稽核的 docs commit），工作樹乾淨。
5. 驗收結果逐條寫回本檔末尾「## 執行紀錄」節（PASS/FAIL＋一句證據），連同異動一併 commit。

## 4. 卡關升級
同一問題兩種本質不同修法都失敗、或涉及品味取捨（如 mountPeriodScoped 介面設計拿不定）時：把「已知/已試/卡點」整理成三段（≤400 字），用 Agent 工具（model: "fable"）問 advisor，不要第三次重試。

## 執行紀錄
（執行者填寫）
