# 學習管理系統 — 技術規格文件

> 版本：1.9　　最後更新：2026-05-23  
> 本文件描述系統實作層面的技術細節，補充 `SYSTEM_DOC.md` 未涵蓋的內部機制。

---

## 目錄

1. [請求生命週期](#1-請求生命週期)
2. [模組系統](#2-模組系統)
3. [資料庫層](#3-資料庫層)
4. [身份識別機制](#4-身份識別機制)
5. [前端架構](#5-前端架構)
6. [狀態管理](#6-狀態管理)
7. [錯誤處理](#7-錯誤處理)
8. [安全設計](#8-安全設計)
9. [資料完整性約束](#9-資料完整性約束)
10. [CSS 架構與主題系統](#10-css-架構與主題系統)
11. [HTTP 慣例](#11-http-慣例)
12. [效能特性](#12-效能特性)
13. [資料驗證層次](#13-資料驗證層次)
14. [資料庫遷移機制](#14-資料庫遷移機制)
15. [瀏覽器相容性](#15-瀏覽器相容性)
16. [資料庫完整結構參考](#16-資料庫完整結構參考)

---

## 1. 請求生命週期

以「切換到讀書進度頁並勾選預習完成」為例，完整展示一次操作的資料流：

```
使用者點選「✓ 預習」按鈕
        │
        ▼
chapters.js  attachEvents()
  btn.onclick → patch('/chapters/5/progress', { type:'preview', toggle_done:true })
        │
        ▼
api.js  api()
  ├─ 讀取 localStorage('userId')  →  X-User-Id: 3
  ├─ fetch PATCH /api/chapters/5/progress
  │    Content-Type: application/json
  │    X-User-Id: 3
  │    body: { "type":"preview","toggle_done":true }
        │
        ▼ (網路)
server.js  Express router
  app.use('/api/chapters', require('./routes/chapters'))
        │
        ▼
routes/chapters.js  PATCH /:id/progress
  ├─ middleware: userContext.js
  │    db.prepare('SELECT id FROM users WHERE id = ?').get('3')
  │    → req.userId = 3
  ├─ 查詢現有進度紀錄 (SELECT chapter_progress WHERE chapter_id=5 AND user_id=3 AND type='preview')
  ├─ 若存在：UPDATE，翻轉 is_done；若不存在：INSERT
  └─ res.json({ is_done: 1, scheduled_date: null })
        │
        ▼
api.js  回傳 parsed JSON
        │
        ▼
chapters.js
  await refresh(el)   ← 重新拉取所有章節 + 更新 DOM
```

**原則**：每次使用者操作後呼叫 `refresh(el)` 重新渲染，不做細粒度 DOM patch，確保畫面與資料庫狀態一致。

---

## 2. 模組系統

### 後端（Node.js）

使用 **CommonJS**（`require` / `module.exports`），與 Express v5 的生態系一致。

```
server.js
  require('./db/db')             ← 啟動時建立 DB 連線並執行 Migration
  require('./routes/users')      ← 回傳 Express Router 實例
  require('./middleware/userContext')
```

所有 routes 透過 `app.use('/api/<resource>', router)` 掛載，彼此隔離。

### 前端（瀏覽器）

使用 **ES Modules**（`import` / `export`），透過 `<script type="module">` 載入。

```
app.html
  <script type="module" src="js/router.js">
        │
        ▼  static import（模組初始化時全部解析）
router.js
  import { render as renderDashboard } from './dashboard.js'
  import { render as renderTimetable } from './timetable.js'
  ... (8 個頁面模組)
        │
每個頁面模組
  import { get, post, ... } from './api.js'
```

所有頁面模組在 `app.html` 載入時就被瀏覽器解析，但僅在路由觸發時才執行 `render(el)`。

---

## 3. 資料庫層

### 連線管理

`db/db.js` 匯出一個 **wrapper 物件**（非 Database 實例本身），整個 Node.js 進程共用：

```js
let _db = openAndMigrate();   // 實際的 Database 實例

const dbWrapper = {
  prepare: (sql) => _db.prepare(sql),
  exec:    (sql) => _db.exec(sql),
  pragma:  (key) => _db.pragma(key),
  reinitialize(sourcePath) { /* 熱重載，見下方說明 */ },
};

module.exports = dbWrapper;
```

所有 route 模組 `require('../db/db')` 取得同一個 wrapper 物件。wrapper 的方法委派給當前的 `_db`，因此 `reinitialize()` 更新 `_db` 後，所有 route 的下一次呼叫自動使用新連線，**無需重啟伺服器**。

**不存在連線池**：`better-sqlite3` 為同步 API，每次呼叫在 JS event loop 中序列執行，無競態條件。

### WAL 模式（Write-Ahead Logging）

啟用 WAL 的效果：
- **並行讀取**：多個瀏覽器分頁同時讀取時不互相阻塞
- **寫入不阻塞讀取**：寫入時讀取仍可繼續
- **崩潰安全**：WAL 確保未完成的寫入不會損壞資料庫

### 同步執行模型

`better-sqlite3` 全部 API 為**同步**（blocking），無 callback / Promise 介面：

```js
// 同步，直接回傳結果
const users = db.prepare('SELECT * FROM users').all();
const result = db.prepare('INSERT INTO users ...').run(...);
```

這在 Node.js 單執行緒下是安全的：Express 每次只處理一個請求的 SQL，不存在競態條件（race condition）。

### Prepared Statements

所有 SQL 使用 `db.prepare(sql).run(params)` 或 `.get(params)` / `.all(params)`，**佔位符為 `?`**，從不拼接字串，防止 SQL injection。

---

## 4. 身份識別機制

### 設計選擇

系統採用**無密碼的個人檔案選擇**模式（類似 Netflix 家庭帳戶），適用於本機局域網路可信任環境。

### 識別流程

```
index.html
  使用者點選個人卡片
  localStorage.setItem('userId', id)
  localStorage.setItem('userName', name)
  location.href = '/app#dashboard'
        │
        ▼
api.js  （每次 API 呼叫）
  const userId = localStorage.getItem('userId')
  headers: { 'X-User-Id': userId }
        │
        ▼
middleware/userContext.js  （套用於需要使用者身份的路由）
  const userId = req.headers['x-user-id']
  若無 userId → 401
  db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
  若不存在 → 401
  req.userId = user.id   ← 後續 route handler 從此讀取
```

### 哪些路由需要身份

| 路由 | 套用 userContext | 說明 |
|---|---|---|
| `/api/users` | 否 | 個人選擇頁在登入前使用 |
| `/api/subjects` | 是 | 科目為個人資料，需 userId 過濾 |
| `/api/chapters` GET | 是 | GET 附帶個人進度需 userId |
| `/api/chapters` POST/PUT/DELETE | 是 | 驗證章節的科目屬於目前使用者 |
| `/api/chapters/:id/progress` | 是 | 個人進度 |
| `/api/chapters/progress/:id` | 是 | 個人進度（特定記錄） |
| `/api/timetable` | 是 | 個人課表 |
| `/api/assignments` | 是 | 個人作業 |
| `/api/exams` | 是 | 個人考試 |
| `/api/studylog` | 是 | 個人讀書時間 |
| `/api/grades` | 是 | 個人成績 |

---

## 5. 前端架構

### Hash Router

`router.js` 監聽 `window.hashchange` 事件，依 `location.hash` 動態呼叫頁面模組：

```js
const routes = {
  dashboard: { title: '今日概覽', fn: renderDashboard },
  timetable: { title: '每週課表', fn: renderTimetable },
  // ...
};

window.addEventListener('hashchange', route);
route();  // 初始載入時也執行一次
```

**路由切換流程**：
1. 解析 `location.hash.slice(1)`（去除 `#`），預設為 `dashboard`
2. 若 hash 不在 routes 中，強制跳回 `#dashboard`
3. 更新所有 `.nav-item` 的 `active` class
4. 更新 `#page-title` 文字
5. 顯示「⏳ 載入中…」佔位符
6. 呼叫 `r.fn(view)`（即頁面模組的 `render(el)`），捕捉錯誤顯示 ⚠️ 訊息

### 頁面模組介面合約

每個頁面模組**必須匯出**：

```js
export async function render(el: HTMLElement): Promise<void>
```

- `el`：`#view` 容器元素，模組直接寫入 `el.innerHTML`
- 函式為 async，可 `await` API 呼叫
- 函式自行負責事件綁定（`attachEvents`）
- 函式自行負責重新渲染（通常定義內部 `refresh(el)` 函式）

### 模組內部狀態

某些模組在 module scope（檔案頂層）保有跨渲染的狀態：

```js
// studylog.js — 跨 refresh() 保持碼錶狀態
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let timerSubjectId = null;
let timerChapterId = null;

// timetable.js — 保持當前選取的學年/學期
let currentYear, currentSem;
```

`timerInterval` 等碼錶變數在路由切換離開後仍保留，確保回到讀書時間頁面時碼錶不會重置。`currentYear` / `currentSem` 保持課表頁面的學期選擇狀態，切換其他頁面再回來時維持上次選取的學期。

---

## 6. 狀態管理

### localStorage（跨頁面持久）

| 鍵 | 值 | 用途 |
|---|---|---|
| `userId` | 數字字串（如 `"3"`） | 目前登入使用者 ID，注入所有 API 請求 |
| `userName` | 字串 | 顯示於側邊欄頂部 |
| `theme` | `"light"` 或 `"dark"` | 主題設定，重新整理後還原 |

初始化邏輯（`app.html` 與 `index.html`）：

```js
document.documentElement.setAttribute(
  'data-theme',
  localStorage.getItem('theme') || 'light'
);
```

### 模組層級變數（頁面 session 內）

除 studylog.js 的碼錶外，各頁面模組的資料（科目列表、章節列表等）通常在 `render()` 或 `refresh()` 時重新從 API 取得，不長期快取。

---

## 7. 錯誤處理

### 後端錯誤回應格式

所有錯誤統一回傳 JSON：

```json
{ "error": "錯誤訊息（中文）" }
```

| 狀況 | HTTP 狀態碼 |
|---|---|
| 成功建立資源 | 201 Created |
| 成功操作 | 200 OK |
| 缺少必要欄位 | 400 Bad Request |
| 未提供 X-User-Id / 使用者不存在 | 401 Unauthorized |
| 資源不存在 | 404 Not Found |
| 唯一約束衝突（如課表同節次重複） | 409 Conflict |
| 伺服器內部錯誤 | 500 Internal Server Error |

UNIQUE 約束衝突的處理範例（timetable.js）：

```js
try {
  db.prepare('INSERT INTO timetable_slots ...').run(...);
  res.status(201).json(...);
} catch (e) {
  if (e.message.includes('UNIQUE constraint failed'))
    return res.status(409).json({ error: '該節次已有課程' });
  throw e;
}
```

### 前端錯誤處理

`api.js` 中的統一錯誤處理：

```js
if (!res.ok) {
  const err = await res.json().catch(() => ({ error: res.statusText }));
  throw new Error(err.error || '請求失敗');
}
```

router.js 捕捉頁面模組錯誤並顯示於畫面：

```js
r.fn(view).catch(err => {
  view.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${err.message}</div>`;
});
```

使用者操作（表單送出、刪除）的輸入驗證以 `alert()` 或 `confirm()` 呈現。

---

## 8. 安全設計

### XSS 防護

所有來自資料庫或使用者輸入的字串，在插入 HTML 前一律通過 `escHtml()`：

```js
// api.js
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

使用原則：
- 所有動態插入 `innerHTML` 的字串**必須** `escHtml()`
- 日期（`YYYY-MM-DD` 格式）、數字、已知枚舉值（如 CSS hex color）可直接插入

### SQL Injection 防護

所有 SQL 使用 Prepared Statement 的參數化查詢，從不使用字串拼接：

```js
// 安全
db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

// 不存在此模式（從不這樣做）
// db.exec(`SELECT * FROM users WHERE id = ${req.params.id}`)
```

### CSRF 考量

本系統為**本機局域網路專用工具**，無需標準 Web 的 CSRF token 機制。

理由：
- 不存在跨站請求的威脅模型（不對公開網路暴露）
- 使用者識別透過自訂 Header `X-User-Id`，瀏覽器不會跨站自動帶送自訂 Header
- 無 Cookie 機制，無法被 CSRF 利用

### 資料隔離

後端所有個人資料查詢皆在 SQL WHERE 條件中加入 `user_id = req.userId`：

```js
db.prepare('SELECT * FROM assignments WHERE user_id = ? ORDER BY due_date')
  .all(req.userId);
```

`req.userId` 由 `userContext.js` 從資料庫驗證後設定，不信任客戶端傳入的原始值。

---

## 9. 資料完整性約束

### ON DELETE CASCADE

刪除父資料時自動刪除子資料：

| 刪除 | 連帶刪除 |
|---|---|
| `users` | subjects、timetable_slots、assignments、exams、chapter_progress、study_log、grades |
| `subjects` | timetable_slots、assignments、exams、chapters（連帶 chapter_progress） |
| `chapters` | chapter_progress |

### ON DELETE SET NULL

| 刪除 | 設為 NULL |
|---|---|
| `exams` | grades.exam_id |
| `chapters` | study_log.chapter_id |

### CHECK 約束

| 欄位 | 約束 |
|---|---|
| `timetable_slots.day_of_week` | `BETWEEN 0 AND 6` |
| `timetable_slots.period` | `BETWEEN 1 AND 10` |
| `timetable_slots.semester` | `IN (1, 2)` |
| `exams.exam_type` | `IN ('quiz','segment','midterm','final','mock')` |
| `chapter_progress.type` | `IN ('preview','review')` |
| `study_log.minutes` | `> 0` |

### UNIQUE 約束

| 資料表 | 唯一欄位組合 | 效果 |
|---|---|---|
| `timetable_slots` | `(user_id, day_of_week, period, school_year, semester)` | 同學期同節次不可重複排課 |
| `chapter_progress` | `(user_id, chapter_id, type, seq)` | 每人每章節的每筆預習/複習記錄不重複（允許多筆複習） |

---

## 10. CSS 架構與主題系統

### CSS Custom Properties

主題色票定義於 `css/theme.css`，分為亮色（`:root`）與暗色（`[data-theme="dark"]`）兩組：

```css
:root {
  --bg:         #f7f8fa;
  --bg2:        #ffffff;
  --bg3:        #eef0f4;
  --border:     #e0e3ea;
  --text:       #1a1d23;
  --text2:      #5a6075;
  --text3:      #9aa0b5;
  --accent:     #4f6ef7;   /* 主強調色（藍） */
  --accent-h:   #3a56d4;   /* hover 加深 */
  --danger:     #e04040;   /* 紅色，刪除/緊急 */
  --success:    #22c55e;   /* 綠色，完成/成功 */
  --warn:       #f59e0b;   /* 橘色，警告/時間 */
  --sidebar-bg: #1e2130;   /* 側欄背景 */
  --radius:     10px;
  --radius-sm:  6px;
}
```

暗色模式覆蓋同名變數，所有元件自動套用。

### 主題切換機制

```js
// 切換
document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
localStorage.setItem('theme', isDark ? 'light' : 'dark');

// 頁面載入時還原
document.documentElement.setAttribute('data-theme',
  localStorage.getItem('theme') || 'light'
);
```

切換作用於 `<html>` 元素的 `data-theme` 屬性，CSS selector `[data-theme="dark"]` 立即生效，**無需任何 JavaScript class 操作**。

### 檔案結構

| 檔案 | 職責 |
|---|---|
| `reset.css` | 跨瀏覽器樣式歸零 |
| `theme.css` | CSS Custom Properties（亮/暗） |
| `app.css` | 元件樣式（`.card`、`.btn`、`.form-input`、`.badge`、sidebar、modal 等） |
| `print.css` | A4 列印版面（`.print-page`、`.print-timetable`、`.print-plan-table`、`.print-progress-table`；`@media print` 隱藏 UI chrome） |

---

## 11. HTTP 慣例

### 請求格式

- Content-Type：`application/json`
- 身份 Header：`X-User-Id: <integer>`
- 請求體：JSON 物件（`api.js` 自動序列化）

### 回應狀態碼對照

| 情境 | 狀態碼 |
|---|---|
| GET 成功 | 200 |
| POST 建立成功 | 201 |
| PATCH / PUT / DELETE 成功 | 200 |
| 必要欄位缺失 | 400 |
| 未提供有效 X-User-Id | 401 |
| 資源不存在 | 404 |
| UNIQUE 約束衝突 | 409 |

### 回應格式

成功：資源物件或陣列，或 `{ "ok": true }`

錯誤：
```json
{ "error": "錯誤訊息" }
```

### 備份端點例外

`GET /api/backup` 回應 `application/octet-stream`，Content-Disposition 為 attachment，觸發瀏覽器直接下載。

---

## 12. 效能特性

### 同步 DB 的影響

`better-sqlite3` 同步執行意味著：
- **優點**：程式碼簡單，無 async/await 嵌套，無 callback hell
- **限制**：長時間 SQL 會阻塞整個 Node.js event loop，其他請求需等待

在本系統使用場景（本機局域網路，個位數使用者，資料量小）下此限制無實質影響。

### 靜態檔案服務

`express.static('public/')` 直接從檔案系統提供 HTML/CSS/JS，無任何轉換或 build step，首次載入即完整功能。

### 前端重新渲染策略

各頁面在每次操作後呼叫 `refresh(el)` 完整重新渲染（`el.innerHTML = ...`），而非細粒度 DOM 更新。

- **優點**：邏輯簡單，資料與畫面必然一致
- **限制**：Chart.js 圖表每次重建（`new Chart()`），頻繁操作時稍有閃爍

### 資料庫索引

`schema.sql` 定義 6 個索引，覆蓋最常見查詢模式：

```sql
CREATE INDEX idx_assignments_user_due  ON assignments(user_id, due_date);
CREATE INDEX idx_exams_user_date       ON exams(user_id, exam_date);
CREATE INDEX idx_study_log_user_date   ON study_log(user_id, log_date);
CREATE INDEX idx_grades_user_subject   ON grades(user_id, subject_id);
CREATE INDEX idx_chapter_progress_user ON chapter_progress(user_id);
CREATE INDEX idx_timetable_user        ON timetable_slots(user_id);
```

---

## 13. 資料驗證層次

驗證分三層，由外到內：

```
層次 1：瀏覽器端（UI）
  ├─ HTML input 屬性：maxlength、type="number"、min、type="date"
  ├─ 送出前 JS 檢查：if (!body.minutes || body.minutes < 1) return alert(...)
  └─ 目的：提前攔截，提升使用者體驗

層次 2：後端 Route Handler
  ├─ 必填欄位：if (!name || !name.trim()) return res.status(400).json(...)
  ├─ 枚舉值：if (!['preview','review'].includes(type)) return res.status(400).json(...)
  └─ 目的：防止格式錯誤資料進入 DB

層次 3：資料庫約束（最後防線）
  ├─ CHECK constraints
  ├─ NOT NULL
  ├─ UNIQUE constraints
  └─ REFERENCES（Foreign Key）
```

後端不重複前端驗證的所有細節（如字數限制），但**必填欄位與枚舉值一定在後端驗證**。

---

## 14. 資料庫遷移機制

### 設計原則

遷移在 `db/db.js` 啟動時自動執行，無需手動操作或外部工具。每次遷移檢查**目前 schema 狀態**，而非版本號碼，確保冪等性（多次執行安全）。

### 已實作的 8 個遷移

#### Migration 1：課表欄位重構

**觸發條件**：`timetable_slots` 存在 `start_time` 欄位

**處理方式**：DROP 整張表重建

```js
const cols = db.pragma('table_info(timetable_slots)').map(c => c.name);
if (cols.includes('start_time')) {
  db.exec('DROP TABLE IF EXISTS timetable_slots; CREATE TABLE timetable_slots ...');
}
```

> 注意：此遷移會清除課表資料（因欄位結構不相容）。已在引入新欄位前通知使用者。

#### Migration 2：章節進度表新增 `type` 欄位

**觸發條件**：`chapter_progress` 缺少 `type` 欄位

**處理方式**：CREATE new → INSERT（舊資料轉為 `review` 型別）→ DROP → RENAME

```js
const cpCols = db.pragma('table_info(chapter_progress)').map(c => c.name);
if (!cpCols.includes('type')) { /* rebuild */ }
```

#### Migration 3：考試類型新增 `segment`

**觸發條件**：`exams` 表的 `sql` 定義字串不含 `'segment'`

**處理方式**：CREATE new → INSERT（所有欄位，結構相容）→ DROP → RENAME

```js
const examSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='exams'").get();
if (examSql && !examSql.sql.includes('segment')) { /* rebuild */ }
```

> SQLite 不支援修改 CHECK 約束，必須重建整張表。

#### Migration 4：讀書時間新增 `chapter_id`

**觸發條件**：`study_log` 缺少 `chapter_id` 欄位

**處理方式**：`ALTER TABLE ADD COLUMN`（SQLite 支援新增可為 NULL 的欄位）

```js
const slCols = db.pragma('table_info(study_log)').map(c => c.name);
if (!slCols.includes('chapter_id')) {
  db.exec('ALTER TABLE study_log ADD COLUMN chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL');
}
```

#### Migration 5：課表新增學年度與學期欄位

**觸發條件**：`timetable_slots` 缺少 `school_year` 欄位

**處理方式**：CREATE new → INSERT（舊資料預設歸入 114學年度第2學期）→ DROP → RENAME，UNIQUE 約束同步更新

```js
const ttCols2 = db.pragma('table_info(timetable_slots)').map(c => c.name);
if (!ttCols2.includes('school_year')) { /* rebuild with school_year + semester */ }
```

> 舊課表資料保留，自動歸入 114學年度第2學期（DEFAULT 值）。  
> 前端年份選單範圍固定為民國 114–120 學年度。

#### Migration 6：章節進度新增 `notes` 備註欄位

**觸發條件**：`chapter_progress` 缺少 `notes` 欄位

**處理方式**：`ALTER TABLE ADD COLUMN`（可為 NULL 的欄位，SQLite 原生支援）

```js
const cpCols2 = db.pragma('table_info(chapter_progress)').map(c => c.name);
if (!cpCols2.includes('notes')) {
  db.exec('ALTER TABLE chapter_progress ADD COLUMN notes TEXT');
}
```

> 使用者可在預習或每次複習記錄上填寫備註（學習狀況、重點、待補內容等）。

#### Migration 7：章節進度新增 `seq` 欄位，支援多次複習

**觸發條件**：`chapter_progress` 缺少 `seq` 欄位

**處理方式**：CREATE new → INSERT（所有現有記錄 seq 設為 1）→ DROP → RENAME，UNIQUE 約束由 `(user_id, chapter_id, type)` 更新為 `(user_id, chapter_id, type, seq)`

```js
const cpCols3 = db.pragma('table_info(chapter_progress)').map(c => c.name);
if (!cpCols3.includes('seq')) {
  db.exec(`
    CREATE TABLE chapter_progress_v3 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chapter_id     INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      type           TEXT NOT NULL DEFAULT 'preview' CHECK(type IN ('preview','review')),
      seq            INTEGER NOT NULL DEFAULT 1,
      scheduled_date TEXT,
      is_done        INTEGER NOT NULL DEFAULT 0,
      done_at        TEXT,
      notes          TEXT,
      UNIQUE(user_id, chapter_id, type, seq)
    );
    INSERT INTO chapter_progress_v3 (id, user_id, chapter_id, type, seq, scheduled_date, is_done, done_at, notes)
      SELECT id, user_id, chapter_id, type, 1, scheduled_date, is_done, done_at, notes FROM chapter_progress;
    DROP TABLE chapter_progress;
    ALTER TABLE chapter_progress_v3 RENAME TO chapter_progress;
  `);
}
```

> 遷移後每筆舊記錄 seq=1，行為與舊版完全相同。新增複習時 seq 自動遞增（`MAX(seq)+1`）。  
> 注意：Migration 6（ADD COLUMN notes）需在本遷移前執行，否則 INSERT SELECT 中的 `notes` 欄位不存在。

#### Migration 8：科目新增 `user_id`，從全體共用改為每人獨立

**觸發條件**：`subjects` 缺少 `user_id` 欄位

**處理方式**：CREATE new → INSERT（現有科目歸入第一個使用者）→ DROP → RENAME，並加 FK `ON DELETE CASCADE`

```js
const subCols = db.pragma('table_info(subjects)').map(c => c.name);
if (!subCols.includes('user_id')) {
  const firstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  const defaultUserId = firstUser ? firstUser.id : 1;
  db.exec(`
    CREATE TABLE subjects_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#4a90d9',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO subjects_new (id, user_id, name, color, created_at)
      SELECT id, ${defaultUserId}, name, color, created_at FROM subjects;
    DROP TABLE subjects;
    ALTER TABLE subjects_new RENAME TO subjects;
  `);
}
// 不論走哪條路徑都確保索引存在（遷移後或全新 DB）
db.exec('CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id)');
```

> 遷移後各使用者的科目完全獨立：新增、修改、刪除僅影響自己的科目；章節透過 `subject_id → subjects.user_id` 繼承所有權。

---

### 資料庫熱重載（匯入備份）

`reinitialize(sourcePath)` 支援在不重啟伺服器的情況下替換整個資料庫：

```js
reinitialize(sourcePath) {
  // 1. 將 WAL 完整寫入主檔，避免遺失資料
  try { _db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
  // 2. 關閉連線
  try { _db.close(); } catch (_) {}
  // 3. 刪除舊的 WAL/SHM，避免套用到新資料庫
  for (const ext of ['-wal', '-shm']) {
    try { fs.unlinkSync(DB_PATH + ext); } catch (_) {}
  }
  // 4. 複製備份檔至 DB_PATH
  if (sourcePath) fs.copyFileSync(sourcePath, DB_PATH);
  // 5. 重新開啟並執行 migration
  _db = openAndMigrate();
}
```

**WAL 檔案的重要性**：SQLite WAL 模式下，`app.db-wal` 儲存尚未 checkpoint 的寫入。若還原時不刪除舊 WAL，SQLite 會將舊 WAL 套用至新資料庫，造成資料混亂。

**備份下載亦需 checkpoint**：`GET /api/backup` 下載前執行 `wal_checkpoint(TRUNCATE)`，確保備份的 `.db` 檔已包含所有資料（WAL 已合併至主檔）。

---

### 新增遷移的方式

在 `db/db.js` 的遷移區段末尾追加：

```js
// Migration N: 說明
const xCols = db.pragma('table_info(target_table)').map(c => c.name);
if (!xCols.includes('new_column')) {
  db.exec('ALTER TABLE target_table ADD COLUMN new_column TEXT');
}
```

---

## 15. 瀏覽器相容性

### 最低需求

| 功能 | 最低版本 |
|---|---|
| ES Modules（`import`/`export`） | Chrome 61 / Firefox 60 / Safari 10.1 / Edge 16 |
| CSS Custom Properties | Chrome 49 / Firefox 31 / Safari 9.1 / Edge 15 |
| `fetch` API | Chrome 42 / Firefox 39 / Safari 10.1 / Edge 14 |
| `localStorage` | 所有現代瀏覽器 |
| `<input type="date">` | Chrome 20 / Firefox 57 / Safari 14.1 / Edge 12 |

### 不支援

- Internet Explorer（全版本）：不支援 ES Modules
- 舊版 Safari（< 14）：`<input type="date">` 顯示為文字輸入框

### 建議

區網環境建議使用 **Chrome / Edge 最新版**，確保所有功能正常。

---

## 附錄：關鍵設計決策紀錄

| 決策 | 選擇 | 替代方案 | 理由 |
|---|---|---|---|
| 資料庫 | SQLite + better-sqlite3 | PostgreSQL、MySQL | 單一檔案、零設定、備份即複製一個檔案 |
| DB API | 同步（better-sqlite3） | 非同步（node-sqlite3） | 程式碼簡單，區網小規模不需非同步效能 |
| 身份識別 | X-User-Id header | Session / JWT | 本機環境無需安全性，無需設定密碼 |
| 前端路由 | Hash Router | History API | 無需伺服器端路由設定，重新整理不會 404 |
| 前端框架 | 原生 JS + ES Modules | React / Vue | 無 build step，可直接修改 .js 檔立即生效 |
| 圖表 | Chart.js CDN | 手寫 Canvas | 功能足夠，若無網路可手動放入 vendor/ |
| 課表設計 | 節次制（1–10節） | 時間制（HH:MM） | 符合台灣中小學課表慣例 |
| 課表學年範圍 | 民國 114–120 固定選單 | 動態計算 ± N 年 | 使用情境明確，固定範圍操作更直覺 |
| 共用資料 | 科目與章節各自獨立 | 全體共用 | 實際需求為各帳號資料完全獨立，科目以 user_id 區隔 |
| 可攜版方案 | 內嵌 Node.js portable + bat | pkg 單一 exe | better-sqlite3 為 native addon，portable Node 方案相容性更佳 |

---

### 列印版面規格（print.css）

| 項目 | 規格 |
|---|---|
| 方向 | 橫式（landscape） |
| 紙張 | `297mm × 210mm` |
| `@page` margin | `2mm` |
| 螢幕預覽寬度 | `297mm`（與列印完全一致，不需換算） |
| 列印內容寬度 | `293mm`（297mm − 2mm × 2） |
| 色彩輸出 | `print-color-adjust: exact`（確保 badge 顏色正確列印） |

```css
@page { size: 297mm 210mm landscape; margin: 2mm; }
.print-page { width: 297mm; }          /* 螢幕預覽 */

@media print {
  html, body, .main-content { width: 297mm; }
  .print-page { width: 293mm; }        /* 列印內容 */
  * { print-color-adjust: exact !important; }
}
```

### 列印週計畫（print.js）

`print.js` 的 `render(el)` 以 `Promise.all` 並行取得四支 API：

```js
const [timetable, exams, scheduled, chapters] = await Promise.all([
  get('/timetable'),
  get('/exams?upcoming=8'),
  get('/chapters/scheduled'),
  get('/chapters'),
]);
```

並行取得後以純函式建構四個 HTML 區塊：

| 函式 | 資料來源 | 說明 |
|---|---|---|
| `buildTimetable(slots)` | `/timetable` | 僅顯示有課的星期與節次，過濾空白欄/列 |
| `buildExams(exams, progMap)` | `/exams?upcoming=8` + progressMap | 未完成考試，含進度條 |
| `buildWeekPlan(items, today)` | `/chapters/scheduled` 篩本週 | 本週排定的預習/複習項目 |
| `buildProgress(chapters)` | `/chapters` | 以科目分組的章節進度表格 |

`getWeekRange()` 計算當週週一（Mon=0）到週日：

```js
function getWeekRange() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;  // 將 JS 的 Sun=0 轉為 Mon=0
  const mon = new Date(now); mon.setDate(now.getDate() - dow);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: fmt(mon), end: fmt(sun) };
}
```

**列印樣式設計**：
- `max-width: 794px`（A4 @ 96dpi）讓螢幕預覽接近 A4
- `.print-top` 使用 `grid-template-columns: 1fr 1fr` 左右並排課表和考試
- `@media print { @page { size: A4 portrait; margin: 12mm 15mm; } }`
- `@media print` 中 `.sidebar`、`.topbar`、`.print-controls` 設 `display: none !important`

---

### 成績表單考試選擇器（grades.js）

新增/編輯成績時，表單頂部有一個考試選擇下拉（`#gm-exam-pick`），從模組層級的 `exams[]` 陣列（與 `subjects[]` 並行取得）產生選項：

```js
[subjects, exams] = await Promise.all([get('/subjects'), get('/exams')]);
```

選擇考試後自動填入其他欄位：

```js
picker.onchange = () => {
  const opt = picker.options[picker.selectedIndex];
  if (!opt.value) return;
  modal.querySelector('#gm-name').value    = opt.dataset.name;    // 考試名稱
  modal.querySelector('#gm-date').value    = opt.dataset.date;    // 考試日期
  modal.querySelector('#gm-subject').value = opt.dataset.sid;     // 科目
};
```

每個選項的 `data-*` 屬性（`data-name`、`data-date`、`data-sid`）在 `buildModal()` 產生 HTML 時嵌入，不需要額外查表。

儲存時將 `exam_id` 一起帶入請求：

```js
exam_id: pickerId ? +pickerId : null,
```

`PUT /grades/:id` 已補上 `exam_id` 欄位的更新；`exam_id` 可設為 `null`（不連結考試）。

---

### 考試三分區邏輯（exams.js）

`buildPage()` 依 `days_left` 與 `is_completed` 將考試分成三組：

```js
const upcoming = exams.filter(e => !e.is_completed && e.days_left >= 0);
const expired  = exams.filter(e => !e.is_completed && e.days_left < 0);
const done     = exams.filter(e =>  e.is_completed);
```

倒數 label 三種狀態：

```js
d < 0  → `已過 ${-d} 天`   // 過期
d === 0 → '今天！'
d > 0  → `${d} 天後`
```

「清除已過期」按鈕以 `Promise.all` 並行呼叫每筆過期考試的 `PUT /exams/:id`，無需新增後端端點：

```js
await Promise.all(expired.map(e => put('/exams/' + e.id, { is_completed: true })));
```

### 讀書進度批次刪除章節（chapters route）

`DELETE /api/chapters?subject_id=X` 先驗證科目所有權，再一次刪除該科目所有章節：

```js
router.delete('/', userCtx, (req, res) => {
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
                    .get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在或無權限' });
  const { changes } = db.prepare('DELETE FROM chapters WHERE subject_id = ?').run(subject_id);
  res.json({ ok: true, deleted: changes });
});
```

`chapters` 刪除後 `chapter_progress` 透過 FK CASCADE 自動清除。此路由必須定義在 `DELETE /:id` 之前，否則空路徑 `/` 被 Express 解析時會落入錯誤的 handler。

---

### 跨頁面共用的 progressMap 模式

`exams.js` 與 `dashboard.js` 的考試倒數區塊都需要顯示科目讀書進度，兩者採用相同的計算邏輯：

```js
// 在 refresh() 中與其他 API 並行拉取
const chapters = await get('/chapters');  // 或 Promise.all 中一併取得

// 以 subject_id 為 key 建立進度 map
const progressMap = {};
for (const c of chapters) {
  if (!progressMap[c.subject_id]) progressMap[c.subject_id] = { total: 0, prevDone: 0, revDone: 0 };
  const p = progressMap[c.subject_id];
  p.total++;
  if (c.preview_done) p.prevDone++;
  if ((c.reviews || []).some(r => r.is_done)) p.revDone++;
}
```

渲染時以 `progressMap[e.subject_id]` 取出對應科目的進度，若 `total === 0`（科目無章節）則不顯示進度條。此模式為純客戶端計算，不需新增 API 端點。

---

---

## 16. 資料庫完整結構參考

> 原始定義：`db/schema.sql`（全新安裝時執行）；欄位變更透過 `db/db.js` 的 Migration 自動套用。

---

### 資料表關聯圖（ER）

```
users
 ├─── subjects           (user_id → users.id CASCADE)
 │     └─── chapters     (subject_id → subjects.id CASCADE)
 │           └─── chapter_progress (chapter_id → chapters.id CASCADE)
 │                        (user_id   → users.id   CASCADE)
 ├─── timetable_slots    (user_id → users.id CASCADE)
 │     └── [subject_id]  → subjects.id CASCADE
 ├─── assignments        (user_id    → users.id    CASCADE)
 │     └── [subject_id]  → subjects.id CASCADE
 ├─── exams              (user_id    → users.id    CASCADE)
 │     └── [subject_id]  → subjects.id CASCADE
 ├─── study_log          (user_id    → users.id    CASCADE)
 │     ├── [subject_id]  → subjects.id CASCADE
 │     └── [chapter_id]  → chapters.id SET NULL
 └─── grades             (user_id    → users.id    CASCADE)
       ├── [subject_id]  → subjects.id CASCADE
       └── [exam_id]     → exams.id   SET NULL
```

`[]` 表示 NOT NULL FK；`[x]` 表示可為 NULL 的 FK。

---

### 資料表：`users`

```sql
CREATE TABLE users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    avatar_color TEXT    NOT NULL DEFAULT '#6c8ebf',
    is_admin     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `id` | INTEGER PK | — | 自動遞增，供其他表 FK 引用 |
| `name` | TEXT | — | 顯示於個人選擇頁與側邊欄 |
| `avatar_color` | TEXT | `#6c8ebf` | 頭像背景色（CSS hex），建立時可自選 |
| `is_admin` | INTEGER | `0` | 管理員標記（0/1），目前僅作展示用，無功能差異 |
| `created_at` | TEXT | `datetime('now')` | UTC ISO-8601，SQLite 原生格式 |

**刪除行為**：刪除 user 會 CASCADE 刪除其所有個人資料（subjects、timetable_slots、assignments、exams、chapter_progress、study_log、grades）。

---

### 資料表：`subjects`

```sql
CREATE TABLE subjects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    color      TEXT    NOT NULL DEFAULT '#4a90d9',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_subjects_user ON subjects(user_id);
```

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `id` | INTEGER PK | — | — |
| `user_id` | INTEGER FK | — | 所屬使用者；每人科目完全獨立（Migration 8 加入） |
| `name` | TEXT | — | 科目名稱，如「數學」、「英文」 |
| `color` | TEXT | `#4a90d9` | 代表色，用於課表、考試、行事曆色票 |
| `created_at` | TEXT | `datetime('now')` | — |

**刪除行為**：刪除科目會 CASCADE 刪除相關的 timetable_slots、assignments、exams、chapters（及 chapter_progress）。

---

### 資料表：`timetable_slots`

```sql
CREATE TABLE timetable_slots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id)  ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    period      INTEGER NOT NULL CHECK (period BETWEEN 1 AND 10),
    school_year INTEGER NOT NULL DEFAULT 114,
    semester    INTEGER NOT NULL DEFAULT 2 CHECK (semester IN (1, 2)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, day_of_week, period, school_year, semester)
);
CREATE INDEX idx_timetable_user ON timetable_slots(user_id);
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `user_id` | FK | 所屬使用者 |
| `subject_id` | FK | 該節次的科目 |
| `day_of_week` | INTEGER | 0=週一，1=週二，…，6=週日 |
| `period` | INTEGER | 節次 1–10 |
| `school_year` | INTEGER | 民國學年度（114–120），前端選單固定此範圍 |
| `semester` | INTEGER | 1=上學期，2=下學期 |

**UNIQUE 約束**：同一使用者在同學期同節次只能有一筆課程，重複新增回傳 409。  
**前端邏輯**：依 `day_of_week BETWEEN 0 AND 4`（週一–週五）為主；若有週六/日資料亦顯示。

---

### 資料表：`assignments`

```sql
CREATE TABLE assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT,
    due_date    TEXT    NOT NULL,
    is_done     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assignments_user_due ON assignments(user_id, due_date);
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `title` | TEXT | 作業名稱 |
| `description` | TEXT | 說明（可為空） |
| `due_date` | TEXT | 截止日期（YYYY-MM-DD） |
| `is_done` | INTEGER | 0=未完成，1=已完成 |
| `updated_at` | TEXT | PUT 時由 route handler 手動更新為 `datetime('now')` |

**索引用途**：`(user_id, due_date)` 支援「近 N 天到期」篩選（`?upcoming=N`）。

---

### 資料表：`exams`

```sql
CREATE TABLE exams (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    subject_id   INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    exam_date    TEXT    NOT NULL,
    exam_type    TEXT    NOT NULL DEFAULT 'quiz'
                 CHECK (exam_type IN ('quiz','segment','midterm','final','mock')),
    is_completed INTEGER NOT NULL DEFAULT 0,
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_exams_user_date ON exams(user_id, exam_date);
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `exam_date` | TEXT | 考試日期（YYYY-MM-DD） |
| `exam_type` | TEXT | 五種考試類型（見下表） |
| `is_completed` | INTEGER | 0=即將到來，1=已完成 |
| `notes` | TEXT | 備註（可為空） |

**`exam_type` 對照**：

| 值 | 顯示 |
|---|---|
| `quiz` | 小考 |
| `segment` | 段考 |
| `midterm` | 期中考 |
| `final` | 期末考 |
| `mock` | 模擬考 |

**API 衍生欄位**：GET 回應中額外計算 `days_left`（`exam_date` 距今天數，負值表示已過）與 `subject_name`、`subject_color`（JOIN subjects）。  
**刪除行為**：刪除考試後 `grades.exam_id` SET NULL（成績記錄保留）。

---

### 資料表：`chapters`

```sql
CREATE TABLE chapters (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `subject_id` | FK | 所屬科目；章節透過此 FK 繼承 `user_id`（subjects.user_id） |
| `title` | TEXT | 章節名稱，如「第一章 代數」 |
| `sort_order` | INTEGER | 排序權重，數字越小越靠前；前端上移/下移互換相鄰值 |

**無 `user_id`**：章節所有權從 `subjects.user_id` 繼承，後端 POST/PUT/DELETE 透過 JOIN subjects 驗證操作者是否為章節所有者。

---

### 資料表：`chapter_progress`

```sql
CREATE TABLE chapter_progress (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    chapter_id     INTEGER NOT NULL REFERENCES chapters(id)  ON DELETE CASCADE,
    type           TEXT    NOT NULL DEFAULT 'preview'
                   CHECK(type IN ('preview','review')),
    seq            INTEGER NOT NULL DEFAULT 1,
    scheduled_date TEXT,
    is_done        INTEGER NOT NULL DEFAULT 0,
    done_at        TEXT,
    notes          TEXT,
    UNIQUE(user_id, chapter_id, type, seq)
);
CREATE INDEX idx_chapter_progress_user ON chapter_progress(user_id);
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `user_id` | FK | 所屬使用者 |
| `chapter_id` | FK | 對應章節 |
| `type` | TEXT | `preview`（預習）或 `review`（複習） |
| `seq` | INTEGER | 序號：預習固定為 1；複習為 1、2、3…（每次新增 `MAX(seq)+1`） |
| `scheduled_date` | TEXT | 排定學習日期（可為空），連動行事曆顯示 |
| `is_done` | INTEGER | 0=未完成，1=已完成 |
| `done_at` | TEXT | 完成時間（toggle 為完成時記錄） |
| `notes` | TEXT | 學習備註（可為空），顯示於讀書進度與列印頁 |

**UNIQUE 約束**：`(user_id, chapter_id, type, seq)` — 同一使用者同一章節的預習只有一筆（seq 固定=1），複習可有多筆（seq 遞增）。  
**API 操作**：
- 預習：`PATCH /chapters/:id/progress`（upsert，type=preview，seq=1）
- 新增複習：`POST /chapters/:id/review`（INSERT，seq=MAX+1）
- 更新任意進度：`PATCH /chapters/progress/:progressId`
- 刪除複習：`DELETE /chapters/progress/:progressId`（預習不可刪）

---

### 資料表：`study_log`

```sql
CREATE TABLE study_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    log_date   TEXT    NOT NULL,
    minutes    INTEGER NOT NULL CHECK (minutes > 0),
    note       TEXT,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_study_log_user_date ON study_log(user_id, log_date);
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `log_date` | TEXT | 記錄日期（YYYY-MM-DD），可手動指定或由碼錶計時自動填入當天 |
| `minutes` | INTEGER | 讀書分鐘數，CHECK `> 0` |
| `note` | TEXT | 備註（可為空） |
| `chapter_id` | FK（可NULL） | 關聯章節（選填）；章節刪除後 SET NULL，記錄保留 |

**API 衍生查詢**：
- `GET /studylog/weekly`：GROUP BY `subject_id, log_date`，回傳近 7 天各科每日分鐘數，供 Chart.js 堆疊柱狀圖使用
- `GET /studylog/by-chapter`：GROUP BY `chapter_id`，回傳各章節累積時數，顯示於讀書進度頁

---

### 資料表：`grades`

```sql
CREATE TABLE grades (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    exam_id    INTEGER REFERENCES exams(id) ON DELETE SET NULL,
    exam_name  TEXT    NOT NULL,
    exam_date  TEXT    NOT NULL,
    score      REAL    NOT NULL,
    max_score  REAL    NOT NULL DEFAULT 100,
    notes      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_grades_user_subject ON grades(user_id, subject_id);
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `exam_id` | FK（可NULL） | 可關聯考試記錄；考試刪除後 SET NULL，成績保留 |
| `exam_name` | TEXT | 冗餘欄位，避免關聯考試刪除後名稱消失 |
| `score` | REAL | 得分（支援小數） |
| `max_score` | REAL | 滿分，預設 100；前端計算百分比：`round(score/max_score*100)` |

**API 衍生欄位**：GET 回應中附上 `subject_name`、`subject_color`（JOIN subjects）與 `percentage`（計算值）。

---

### 索引總表

| 索引名稱 | 資料表 | 欄位 | 用途 |
|---|---|---|---|
| `idx_subjects_user` | `subjects` | `(user_id)` | 篩選使用者科目列表 |
| `idx_timetable_user` | `timetable_slots` | `(user_id)` | 篩選使用者課表 |
| `idx_assignments_user_due` | `assignments` | `(user_id, due_date)` | 近 N 天到期作業查詢 |
| `idx_exams_user_date` | `exams` | `(user_id, exam_date)` | 考試倒數排序查詢 |
| `idx_study_log_user_date` | `study_log` | `(user_id, log_date)` | 日期範圍讀書時間查詢 |
| `idx_grades_user_subject` | `grades` | `(user_id, subject_id)` | 依科目篩選成績 |
| `idx_chapter_progress_user` | `chapter_progress` | `(user_id)` | 讀書進度查詢（JOIN chapters） |

---

### FK 刪除行為彙整

| 刪除目標 | 受影響欄位 | 行為 |
|---|---|---|
| `users` | 所有含 `user_id` 的表 | CASCADE（連帶刪除全部個人資料） |
| `subjects` | `timetable_slots.subject_id`、`assignments.subject_id`、`exams.subject_id`、`chapters.subject_id`、`study_log.subject_id` | CASCADE |
| `chapters` | `chapter_progress.chapter_id` | CASCADE |
| `chapters` | `study_log.chapter_id` | SET NULL（記錄保留，chapter_id 清空） |
| `exams` | `grades.exam_id` | SET NULL（成績保留，exam_id 清空） |

---

*本文件反映截至 2026-05-23 的實作狀態（v1.9）。*
