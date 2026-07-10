# v3.9 四大明細頁依學習區間整併（避免跨學期資料混雜）

> 2026-07-11 Fable 5 規劃，交由 Opus 實作。工作分支：建議新開 `dev-2026-07-11`（main 已含 v3.6-3.8）。
> **開工前依全域不變量 1 向使用者確認**。
> 背景：邦正已設 4 個區間、炎朗 3 個——區間基礎設施（v3.6 P1）已被真實使用。本計畫讓「考試倒數／作業清單／讀書進度／讀書時間」四頁的明細以區間為時間容器，學期交替後舊資料不再堆積。

## 0. 交接注意
1. **後端變更極小**：只有 `routes/studylog.js` 的 `/summary` 加可選 from/to（見 Phase C）。**無 migration**。已查證（2026-07-11）：`GET /exams` 回全部（前端過濾）、`GET /daily-tasks?from&to` 存在（**兩參數必須同給**，缺一 400）、`GET /studylog?from&to` 存在、`chapters` 表無期別欄但**有 created_at（UTC 時間戳）**。
2. 裸日期直接比（exam_date/task_date/log_date/scheduled_date）；UTC 時間戳（chapters.created_at、chapter_progress.done_at）在前端要先轉本地日：`const localD = ts => ymd(new Date(ts.includes('T') ? ts : ts.replace(' ','T')+'Z'))`（放進共用元件，勿用 slice(0,10)）。
3. i18n 新 key ×3 並 Grep 驗證；git 逐檔 add；測試帳號（id7）**目前 0 個區間**——測試時先建區間、測後刪除；UI 亮/暗主題各看一次。
4. 卡關升級：派 `model:"fable"` 顧問 agent（已知/已試/卡點三段，≤400 字），同 plan-calendar-tasks.md 第 8 條。

## 1. 共用設計：區間篩選元件（新 `public/js/period-filter.js`）
```js
// initPeriodFilter(container, onChange) → 渲染 chips 並回傳目前 scope
// - 內部 get('/periods') 一次；無區間 → 不渲染任何 UI，回 {mode:'all'}（頁面行為不變）
// - chips：[全部][114 上學期][114 寒假]...（新→舊排序；label 沿用 growth.js periodLabel 寫法：
//   `${p.school_year} ${t('enum.periodType.'+p.type)}`——把該 helper 搬進本元件並讓 growth.js 改 import，消除重複）
// - 預設選中：今天落在其起訖內的區間；沒有 → 全部
// - 選擇存 localStorage 'periodScope'（存 period id 或 'all'），四頁共用同一 key——切頁時範圍跟著走
// - onChange(scope) 由頁面重新渲染；scope = {mode:'all'} | {mode:'period', id, from, to}
```
樣式沿用 goals/growth 既有 chip/btn-ghost 語彙；不新增 CSS 檔。
i18n 新 key（×3）：`period.scopeAll`：全部 / All / すべて；`period.scopeHint`：依區間顯示 / Filter by period / 期間で絞り込み（chips 前的小字，可視擁擠程度省略——省略則不加此 key）。

## 2. Phase A — 元件 + 考試倒數 + 作業清單（一個 commit）
- 新 `period-filter.js`＋i18n key；`growth.js` 的 periodLabel 改 import（行為不變）。
- **exams.js**：頁首插入篩選列；scope=period 時 `exams.filter(e => e.exam_date >= from && e.exam_date <= to)` 再進 upcoming/expired/done 三分區（純前端，GET /exams 不變）。「清除過期」按鈕作用於**過濾後**清單（只清當前區間的過期考試——語意更安全）。
- **homework.js**：scope=all 維持現行 ±30 天；scope=period 改呼叫 `/daily-tasks?from=<period.from>&to=<period.to>`。今日/逾期/即將到來三分區邏輯不變（都以 today 比較，區間只是資料範圍）。
- 驗收：測試帳號建 2 個相鄰區間＋各放 1 筆考試與作業（node 建，**勿用 curl 傳中文**）→ 切 chips 各只見自己區間的資料、全部見兩筆；清除過期只動當前區間；亮/暗各一次；測後清理。
- Commit：`feat: period scope filter — exams + homework (v3.9 Phase A)`

## 3. Phase B — 讀書時間（一個 commit）
- 後端：`/studylog/summary` 加可選 from/to（兩者皆給才生效，否則維持全量；比照 GET / 的寫法，log_date 裸日期直比）。
- **studylog.js**：篩選列；scope=period 時 記錄列表 `GET /studylog?from&to`、學習總覽 `GET /studylog/summary?from&to`（目前連續 streak 卡不受 scope 影響，維持全量——連續天數本質是「現在」的屬性）。**近7天長條圖、熱力圖、月趨勢維持不變**（本質是固定時間窗的視圖，不參與區間切換；在篩選列旁加一行小字說明可省）。
- 驗收：建區間＋區間內外各一筆紀錄 → 切換後列表/總覽數字正確、圖表不變；`npm test` 綠；測後清理（含 xp_log 等，按慣例）。
- Commit：`feat: period scope — study log list & summary (v3.9 Phase B)`

## 4. Phase C — 讀書進度（一個 commit，最需判斷的一頁）
**歸屬規則（免 migration，推導式）**：一個章節屬於某區間，若
`localD(chapter.created_at) ∈ [from,to]`（該學期建的內容）**或** 其任一 progress session 的 `scheduled_date ∈ [from,to]`（跨學期排入的複習仍會出現——間隔重複跨區間是正常現象，必須保留）。
- **chapters.js**：篩選列；scope=period 時科目卡內只渲染符合歸屬的章節；某科目過濾後無章節 → 整科目卡隱藏；全部隱藏時顯示友善空狀態（沿用既有 empty-state 語彙＋一句「這個區間還沒有章節」新 i18n key `ch.emptyPeriod` ×3：這個區間還沒有章節 / No chapters in this period / この期間には章がありません）。
- 章節內的 session 列**不再二次過濾**（章節既已屬於區間，顯示完整 preview/reviews 脈絡更易懂）。
- 新增章節行為不變（歸屬由 created_at 自然決定）。
- 前端需要 `chapters.created_at`：先 Grep 確認 `GET /chapters` 回傳含 created_at（SELECT c.* 應已含；若無則後端補一欄，屬允許的小變更）。
- 驗收：建兩區間、各建一章節（改 DB 的 created_at 模擬跨學期）＋一筆舊章節排進新區間的複習 → 切換顯示正確（舊章節因複習出現在新區間）；亮/暗；測後清理。
- Commit：`feat: period scope — chapters by derived membership (v3.9 Phase C)`

## 5. 總驗收
- [ ] npm test 綠、啟動.bat 重啟正常（動了 studylog 後端）
- [ ] 四頁切換 chips 行為一致、localStorage 記憶跨頁生效、無區間帳號四頁完全不變
- [ ] i18n 新 key（period.scopeAll、ch.emptyPeriod，若加 scopeHint 共 3 個）Grep ×3
- [ ] 測試帳號區間/考試/作業/章節/紀錄全清、lang=zh-TW
- [ ] 更新 X:\class\CLAUDE.md（標記 v3.9）

## 6. 明確不做（本輪範圍外）
- 不動 dashboard（本質是「今天」視圖）；不動行事曆（本質是「月」視圖）；不動成績頁（成績天然按考試日期分組，混雜感低——若日後要，同 exams 模式照搬）。
- 不做全域 topbar 區間切換器（等四頁模式被實際使用驗證後再考慮升級，避免過早抽象）。
- 不給 chapters 加期別欄位（推導式已足夠；若未來推導規則不敷使用再議 Migration）。
