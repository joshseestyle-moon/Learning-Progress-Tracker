# 學習管理系統 — 技術規格文件

> 版本：1.1　　最後更新：2026-05-23  
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

`db/db.js` 匯出單一 `better-sqlite3` 連線實例，整個 Node.js 進程共用：

```js
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
module.exports = db;
```

所有 route 模組 `require('../db/db')` 取得同一物件，**不存在連線池**，因為 `better-sqlite3` 為同步 API，每次呼叫在 JS event loop 中序列執行。

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
| `/api/subjects` | 否 | 科目為全體共用資料 |
| `/api/chapters` GET/POST/PUT/DELETE | 否（GET 有 userCtx） | 章節定義共用；GET 附帶個人進度需 userId |
| `/api/chapters/:id/progress` | 是 | 個人進度 |
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
| `users` | timetable_slots、assignments、exams、chapter_progress、study_log、grades |
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
| `chapter_progress` | `(user_id, chapter_id, type)` | 每人每章節的預習/複習各只有一筆進度 |

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

### 已實作的 5 個遷移

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
| 共用資料 | 科目與章節共用 | 各自獨立 | 同班學生讀同樣的課程，定義共用才合理 |
| 可攜版方案 | 內嵌 Node.js portable + bat | pkg 單一 exe | better-sqlite3 為 native addon，portable Node 方案相容性更佳 |

---

*本文件反映截至 2026-05-23 的實作狀態。*
