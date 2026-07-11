# 修復簡報：v3.9 code-review 發現的 bug（給 Sonnet 執行）

> 這份是「執行說明書」。你（Sonnet）照這份就能把 v3.9 code-review 找到的 4 個正確性 bug + 1 個 API 缺口修完並驗證。發現清單原文在 `docs/handoff-2026-07-11.md` 第二節（含每個發現的 file:line 與建議修法），本檔補上執行所需的環境、順序、程式碼草圖與驗證法。
>
> **開工前先做的事**：讀全域 `C:\Users\Josh\.claude\CLAUDE.md`（不變量）與專案 `X:\class\CLAUDE.md`；本任務不需要「規劃→確認才動工」那一關（使用者已批准修這批 bug），但**動手前先跑一次 advisor**（見末節）確認方向。

## 0. 你是誰、advisor 是誰
- 你（執行修復者）以 **Sonnet** 進行。若這個 session 目前是 Opus 在跑，請 spawn 一個 `Agent(subagent_type: general-purpose, model: "sonnet")` 來做實際編輯，主 session 負責 orchestrate 與呼叫 advisor。
- **卡住就呼叫 `advisor` 工具**（它會把你的完整脈絡轉給更強的模型）。使用者的期望是「遇到問題問 Opus」——請確認 `/advisor` 已設為 Opus（目前可能是 Fable 5；若非 Opus 請提醒使用者用 `/advisor` 切換，或直接把問題整理成三段丟給 advisor 也可）。

## 1. 環境與不變量（違反即事故）
- 伺服器啟動/重啟一律用 `啟動.bat`（PowerShell `& "X:\class\啟動.bat"`, run_in_background），**不要** `node server.js`。中文檔名的 .bat 用 PowerShell 工具跑。
- 測試一律用**測試帳號 user7**（`x-user-id: 7`）；**絕不動真實帳號**（炎朗=?, 邦正=?）。`data/app.db` 是孩子的真實資料。
- 這批修復**不動 DB／不新增 migration**，所以不需備份 DB。但若你臨時決定要動 db.js，就得先備份 `data/app.db` 並走 migration 冪等規範（本任務應該用不到）。
- **新 UI 字串必須同步 `public/js/i18n.js` 的 zh-TW/en/ja 三個字典**；改完 Grep 新 key，命中數必須 = 3。本任務只有 Bug #3 會新增一個 i18n key。
- SQLite 日期查詢一律加 `'localtime'`（本任務的後端改動是加 DATE_RE 驗證，不新增 date('now') 查詢，通常用不到）。
- 產品使用者是小孩：UI 文案繁中、鼓勵導向、不懲罰。

## 2. 分支與工作流
- 本簡報就在分支 `fix-v39-bugs` 上（從 main 開）。**在這個分支做所有修改**，不要直接動 main。
- 每個 bug（或每組同源 bug）獨立 commit，訊息講清楚修了什麼、為什麼。
- commit 訊息結尾照 CLAUDE.md 慣例加 Co-Authored-By 與 Claude-Session 兩行。
- **改完不要自動合併／push**。全部驗證通過後，停下來把結果回報使用者，由使用者決定是否合併回 main。

## 3. 要修的 bug（依此順序）

### 【A】Bug #1 崩潰 + Bug #2 競態（同源，一起修）——最高優先
**檔案**：`public/js/chapters.js`、`exams.js`、`homework.js`、`studylog.js` 各自的 `refresh()`。
**根因**：四頁都用 module-level `_el`/`_scope`，`refresh()` 在 `await` 後直接 `const body = _el.querySelector('#X-body'); body.innerHTML = ...`，沒有：
- (Bug #1) null 檢查：切頁離開後 `router.js:59` 已把 `#view` 內容換掉，`#X-body` 消失 → `body` 為 null → `body.innerHTML=` 拋 TypeError（未處理 rejection）。
- (Bug #2) 世代檢查：快速切區間 chip 時，homework/studylog 把 scope 烤進 fetch query（`range`/`q` 在 await 前算好），慢回應會蓋掉新選取的畫面。(chapters/exams await 後才用即時 `_scope` 過濾，本身自我修復，但加 guard 無害且統一。)

**建議修法（最小、低風險，四頁一致）**：在每個模組加一個 module-level 世代計數器，`refresh()` 開頭取號、每次寫 DOM 前檢查號碼與 body 是否還在：
```js
let _gen = 0;                       // module scope，與 _el/_scope 並列
async function refresh() {
  const gen = ++_gen;
  const [ ...fetches... ] = await Promise.all([ ... ]);
  const body = _el.querySelector('#X-body');
  if (!body || gen !== _gen) return;   // ← 切頁離開(body null) 或 被更新的 refresh 取代(gen 不符) 即放棄
  body.innerHTML = buildPage(...);
  attach...(body ...);
  // 其餘 render 呼叫（chart/heatmap 等）也放在這個 guard 之後
}
```
- studylog.js 的 refresh 有多個 render 步驟（buildPage/renderChart/renderHeatmap/renderMonthly），guard 要放在「所有 await 完成之後、開始寫 DOM 之前」，一次擋住。
- 注意 chapters.js 目前是 `attachEvents(_el, scoped)`（傳整個 `_el`）；修 guard 時不用改這點（那是另一個 minor，見 Bug #9 選做）。
**驗證**：Playwright 開該頁→快速連點兩個不同區間 chip→畫面內容要與高亮 chip 相符；開該頁後立刻切到別頁→不可有 console error / unhandled rejection。

**（選做，altitude）Bug #8**：把 `_el`/`_scope`/`_gen` 與掛載邏輯收斂進 `period-filter.js`（例如 `mountScopedPage(el, bodyHtml, refresh)`），四頁只提供 refresh。**只有在你有把握、且能完整回歸測試四頁時才做**；否則保留上面的最小修法即可，不要為了漂亮引入風險。

### 【B】Bug #3 新增作業消失——`public/js/homework.js`
**根因**：選了不含今天的區間後新增作業（日期框 `#hw-date` 預設今天、無範圍限制），POST 成功但 `refresh()` 依區間範圍抓、後端 `daily-tasks` 伺服器端過濾掉 → 作業從畫面消失、無提示。
**建議修法**：在 `attachAddEvent` 的 `addTask()` 內，POST 成功、`await refresh()` 之後，若目前是 period 模式且新增的 `date` 落在 `[_scope.from, _scope.to]` 之外，用既有的 `app-toast` 通道提示使用者「作業已新增，但不在目前檢視的區間內」。
- 新增一個 i18n key（**三語同步**），建議 key `hw.addedOutsideScope`：
  - zh-TW：`作業已新增，但日期不在目前檢視的區間內`
  - en：`Task added, but its date is outside the period you're viewing`
  - ja：`課題を追加しましたが、表示中の期間外の日付です`
- toast 發送方式看 homework.js/其他頁怎麼派 `app-toast`（app.html 有監聽）；照既有模式。
**驗證**：user7 切到「114 下學期」(2026-02-01~06-30)→新增一筆日期為今天(2026-07-xx，在暑假區間)的作業→應出現提示 toast，且清單不顯示該筆（因為它屬暑假區間）。切回「全部」或暑假區間應看得到。

### 【C】Bug #4 新增後失焦——`public/js/homework.js`
**根因**：`addTask()` 先 `titleInput.focus()` 再 `await refresh()`，refresh 重建整個 `#hw-body`（含 `#hw-title`），新節點沒人重新聚焦。
**建議修法**：在 `await refresh()` 之後補一行重新聚焦：`_el.querySelector('#hw-title')?.focus();`（放在 Bug #3 的提示之後、finally 之前，順序自行斟酌）。
**驗證**：連續輸入標題→Enter→游標應仍停在標題輸入框，可直接打下一筆。

### 【D】Bug #5 `/summary` 部分 from/to 靜默回全期——`routes/studylog.js`
**根因**：`GET /summary` 只在 `from && to` 都給時才過濾，只給其一則靜默回全期總計、無錯誤——與同專案 `routes/report.js`、`routes/daily-tasks.js` 的 `DATE_RE` 400 驗證不一致。
**建議修法**：照 `routes/daily-tasks.js` 既有樣式，先看它與 `routes/report.js` 怎麼定義/引用 `DATE_RE`，然後在 `/summary` 加：
```js
const { from, to } = req.query;
if (from || to) {
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || ''))
    return res.status(400).json({ error: '日期區間格式錯誤' });   // 用專案既有的錯誤字串風格
}
// 之後維持原本 if (from && to) 加篩選的邏輯
```
（前端一定成對送，所以此改動不影響現有 UI，只是把 API 邊界補正。）
**驗證**：`curl "http://localhost:3000/api/studylog/summary?from=2026-01-01" -H "x-user-id: 7"` 應回 400；`?from=..&to=..` 兩者皆給仍正常；兩者皆不給回全期總計。順跑 `npm test`。

### （選做）效能類 Bug #6/#7/#9
- **#7**（`studylog.js` 切 scope 只該重抓 `/studylog`+`/summary`，不必重抓 weekly/heatmap/monthly/dashboard-stats）——中等價值，若你做了【A】的 refresh 重構順手處理最自然；獨立 commit。
- **#6**（chapters/exams 切 chip 不必重抓、可快取後只重跑過濾）、**#9**（`inRange` 共用 helper）——純品質改善，**非必要**。只有在正確性修完、驗證全綠、且你有把握不引入回歸時才做，否則留給日後。不要為了效能改動擴大風險面。

## 4. 完成前的驗證清單（逐條打勾才算完成）
- [ ] `npm test` 綠（65 或更多）。
- [ ] 動過的 JS 用 `node --check` 過。
- [ ] 用 `啟動.bat` 重啟伺服器**兩次**皆無錯。
- [ ] 新 i18n key（Bug #3 的 `hw.addedOutsideScope`）Grep 命中數 = 3。
- [ ] Playwright 用 user7 實跑：Bug #1（切頁無 crash）、#2（快速切 chip 內容正確）、#3（跨區間新增有提示）、#4（新增後保持焦點）各驗一次；**亮/暗主題各看一次**動過的畫面。
- [ ] 測試資料清理：測試中若在 user7 新增了作業/紀錄，測完刪除；若用過 switchLang 把 users.lang 改回 zh-TW。（本任務預設用 user7 既有的 periods 20/21，不要刪。）
- [ ] 每個修復獨立 commit，訊息含 Co-Authored-By / Claude-Session 兩行。
- [ ] **停在這裡**：把「修了哪些、驗證結果、還有哪些選做未做」回報使用者，等使用者決定是否合併回 main。不要自行 merge/push。

## 5. 測試資料現況（user7）
- periods：20（114 下學期 2026-02-01~06-30）、21（114 暑假 2026-07-01~08-31）。今天(2026-07-11)落在暑假=區間 21。
- 這兩個 period 是長期測試素材，**不要刪**。
- 章節/讀書紀錄：user7 有 2026 年 5-6 月的既有資料（落在下學期區間）。

## 6. Advisor 升級規則（何時問）
- **開工前**：先呼叫一次 advisor，把「我打算怎麼修【A】的世代守衛 + 四頁一致做法」講給它聽，確認方向再動手。
- **卡住時**：同一個問題用兩種不同方法都失敗、或不確定某修法會不會破壞其他頁、或 Playwright 出現無法解釋的行為 → 呼叫 advisor，附上「已知/已試/卡點」三段。
- **宣告完成前**：把驗證清單結果丟給 advisor 做一次 second opinion，再回報使用者。
- advisor 給的建議認真對待；若你有實測證據與它矛盾，把衝突再丟一次 advisor 對齊，別默默各做各的。
