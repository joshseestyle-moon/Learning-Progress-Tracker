# 學習管理系統 — 系統文件

> 版本：3.4　　最後更新：2026-06-04

---

## 目錄

1. [系統概述](#1-系統概述)
2. [技術架構](#2-技術架構)
3. [專案目錄結構](#3-專案目錄結構)
4. [安裝與啟動](#4-安裝與啟動)
5. [資料庫設計](#5-資料庫設計)
6. [API 文件](#6-api-文件)
7. [前端頁面說明](#7-前端頁面說明)
8. [使用指南](#8-使用指南)
9. [資料備份與還原](#9-資料備份與還原)
10. [區網連線設定](#10-區網連線設定)

---

## 1. 系統概述

本系統為本機局域網路多人學習管理工具，提供課表排定、作業追蹤、考試倒數、讀書進度管理、讀書時間記錄及成績紀錄等功能。

### 設計原則

| 項目 | 說明 |
|---|---|
| 部署方式 | 本機執行（localhost），區網其他裝置可同時連線 |
| 使用者切換 | 首頁選擇個人檔案，無需輸入密碼 |
| 資料隔離 | 每位使用者的作業、考試、成績等資料完全獨立 |
| 共用資料 | 使用者（帳號列表）為全體共用；科目、章節、進度均各自獨立 |
| 離線使用 | 核心功能不依賴外部網路（圖表庫需網路或手動下載） |

---

## 2. 技術架構

```
瀏覽器（區網任意裝置）
       │  HTTP :3000
       ▼
┌─────────────────────────────┐
│  Node.js + Express          │
│  server.js                  │
│  routes/*.js                │
│  middleware/userContext.js  │
│          │                  │
│     db/db.js                │
│          │                  │
│   data/app.db (SQLite)      │
│                             │
│  public/ ──► 靜態檔案       │
└─────────────────────────────┘
```

### 技術選型

| 層級 | 技術 | 版本 | 說明 |
|---|---|---|---|
| 執行環境 | Node.js | v18+ | 伺服器端 JavaScript |
| Web 框架 | Express | v5 | HTTP 路由與靜態服務 |
| 資料庫 | SQLite（better-sqlite3） | v12 | 單一檔案、零設定 |
| 前端框架 | 原生 HTML / CSS / JS | — | 無 build step |
| 圖表 | Chart.js | v4 | 讀書時間柱狀圖、成績折線圖 |
| UI 主題 | CSS Custom Properties | — | 亮色／暗色模式切換 |
| 多語系 | 內嵌 i18n.js | — | 正體中文 / English / 日本語，無 build step |

---

## 3. 專案目錄結構

```
X:\class\
├── server.js                   # Express 入口，監聽 0.0.0.0:3000
├── package.json
├── .env                        # 環境變數（PORT、DB_PATH）
├── SYSTEM_DOC.md               # 本文件
├── README.md                   # 快速啟動說明
│
├── data/
│   └── app.db                  # SQLite 資料庫（首次啟動自動建立）
│
├── db/
│   ├── schema.sql              # 資料表定義與索引
│   └── db.js                   # DB 連線、Schema 初始化、Migration
│
├── middleware/
│   └── userContext.js          # 解析 X-User-Id header，注入 req.userId
│
├── badges/
│   ├── definitions.js          # 20 枚系統徽章定義（id、icon、名稱、描述、稀有度），含 4 枚作業類
│   └── checker.js              # checkBadges(userId)：檢查並頒發新徽章
│
├── utils/
│   └── points.js               # getBalance(userId)：計算使用者點數餘額（共用工具）
│
├── scripts/
│   └── copy-user-data.js       # 複製使用者所有資料至另一帳號（指令列工具）
│
├── routes/
│   ├── users.js                # 使用者 CRUD
│   ├── subjects.js             # 科目 CRUD
│   ├── timetable.js            # 課表 CRUD
│   ├── assignments.js          # 作業 CRUD（結構化，需 subject_id）
│   ├── exams.js                # 考試 CRUD
│   ├── chapters.js             # 章節 CRUD + 進度管理
│   ├── studylog.js             # 讀書時間記錄
│   ├── grades.js               # 成績紀錄
│   ├── badges.js               # 系統徽章 + 自訂成就
│   ├── shop.js                 # 獎勵商店（許願池、兌換、紀錄）
│   └── daily-tasks.js          # 作業清單 CRUD（自由格式，含 subject、多部份、badge 觸發）
│
└── public/
    ├── index.html              # 個人檔案選擇頁
    ├── app.html                # App Shell（側邊欄 + Hash Router + badge toast）
    ├── css/
    │   ├── reset.css           # CSS Reset
    │   ├── theme.css           # 亮／暗色 CSS 變數
    │   ├── app.css             # 元件樣式
    │   └── print.css           # 列印週計畫 A4 版面
    ├── js/
    │   ├── i18n.js             # 多語系模組：t()、setLang()、getLang()；三語內嵌，無 async
    │   ├── api.js              # fetch 封裝，自動帶 X-User-Id；自動派送 badge-earned 事件；fmtDate / fmtMonth locale-aware
    │   ├── router.js           # Hash Router（#dashboard、#exams…）；監聽 langchange 事件重新 render
    │   ├── dashboard.js        # 今日概覽頁
    │   ├── timetable.js        # 每週課表頁
    │   ├── calendar.js         # 行事曆頁
    │   ├── exams.js            # 考試倒數頁
    │   ├── homework.js         # 作業清單頁（科目分類、多部份完成、badge 連動）
    │   ├── chapters.js         # 讀書進度頁
    │   ├── studylog.js         # 讀書時間頁
    │   ├── grades.js           # 成績紀錄頁
    │   ├── badges.js           # 我的徽章頁
    │   ├── subjects.js         # 課程資訊管理頁
    │   └── print.js            # 列印週計畫頁
    └── vendor/
        ├── alpine.min.js       # （選用）Alpine.js 離線備份
        └── chart.min.js        # （選用）Chart.js 離線備份
```

---

## 4. 安裝與啟動

### 系統需求

- Node.js v18 以上（[nodejs.org](https://nodejs.org) 下載）
- Windows 10 / 11（其他 OS 亦可）

### 首次安裝

```bash
cd X:\class
npm install
```

### 啟動伺服器

**方式一：雙擊批次檔（推薦）**

雙擊 `啟動.bat`，腳本會自動：
1. 終止占用 port 3000 的舊行程（僅 kill 該 PID，不影響其他 node 行程）
2. 判斷是可攜版（`node\node.exe`）或安裝版（系統 PATH）
3. 若缺 `node_modules` 自動執行 `npm install`
4. 顯示本機與區網連線位址
5. 2 秒後自動開啟瀏覽器

**方式二：命令列**

```bash
# 正式使用
npm start

# 開發模式（儲存檔案自動重啟，Node.js 18+ 內建，無需 nodemon）
node --watch server.js
```

啟動後開瀏覽器前往：**http://localhost:3000**

### 環境變數（`.env`）

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PORT` | `3000` | 伺服器監聽埠號 |
| `DB_PATH` | `./data/app.db` | SQLite 資料庫路徑 |

### 可攜版（免安裝）

專案內建可攜版打包工具，目標電腦**不需安裝 Node.js**。

**打包（在原機執行一次）**

雙擊 `製作可攜版.bat`，腳本將自動：
1. 下載 Node.js v22 可攜版（約 30 MB）
2. 安裝 `node_modules`
3. 產出 `dist\class-portable\` 資料夾與 `dist\class-portable.zip`

**部署（在目標電腦）**

將 `class-portable.zip` 解壓縮後雙擊 `啟動.bat` 即可。

| 項目 | 說明 |
|---|---|
| 打包大小 | 約 80–100 MB |
| 含現有資料 | 是（`data\app.db` 一併打包） |
| 目標機需求 | Windows 10/11 x64，無其他需求 |
| 區網連線 | 目標機需手動開放 TCP 3000 防火牆規則 |

---

## 5. 資料庫設計

### 資料表關聯圖

```
users ──┬── timetable_slots
        ├── assignments
        ├── exams ──────── grades
        ├── chapter_progress
        ├── study_log
        ├── user_badges
        ├── point_log
        ├── reward_items
        ├── redemption_log
        ├── custom_badges ──── custom_badge_earned
        ├── daily_tasks ──── daily_task_parts
        └── (透過 subjects 繼承) chapters ──── chapter_progress

subjects ──┬── timetable_slots
           ├── assignments
           ├── exams
           ├── chapters ──── chapter_progress
           └── study_log
                   └── chapters（chapter_id，可為 NULL）
```

### 資料表說明

#### `users` — 使用者

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | 自動遞增 |
| `name` | TEXT | 顯示名稱 |
| `avatar_color` | TEXT | 頭像顏色（CSS hex） |
| `is_admin` | INTEGER | 管理員標記（0/1，目前純展示用） |
| `lang` | TEXT | 介面語系（`zh-TW` / `en` / `ja`，預設 `zh-TW`）（Migration 15） |
| `created_at` | TEXT | 建立時間（ISO 8601） |

#### `subjects` — 科目（每人各自獨立）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | 自動遞增 |
| `user_id` | INTEGER FK | 所屬使用者（ON DELETE CASCADE） |
| `name` | TEXT | 科目名稱 |
| `color` | TEXT | 代表顏色（CSS hex） |

#### `timetable_slots` — 每週課表

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 所屬使用者 |
| `subject_id` | INTEGER FK | 科目 |
| `day_of_week` | INTEGER | 星期（0=週一，6=週日） |
| `period` | INTEGER | 節次（1–10） |
| `school_year` | INTEGER | 學年度（民國年，例：114） |
| `semester` | INTEGER | 學期（1=上學期，2=下學期） |

- 唯一約束：`(user_id, day_of_week, period, school_year, semester)`，同學期同節次不允許重複排課
- 課表介面提供民國 114–120 學年度選擇，預設顯示當前學期

#### `assignments` — 作業

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 所屬使用者 |
| `subject_id` | INTEGER FK | 科目 |
| `title` | TEXT | 作業名稱 |
| `description` | TEXT | 說明（可為空） |
| `due_date` | TEXT | 截止日期（YYYY-MM-DD） |
| `is_done` | INTEGER | 是否完成（0/1） |

#### `exams` — 考試

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 所屬使用者 |
| `subject_id` | INTEGER FK | 科目 |
| `title` | TEXT | 考試名稱 |
| `exam_date` | TEXT | 考試日期（YYYY-MM-DD） |
| `exam_type` | TEXT | 類型：`quiz`/`segment`/`midterm`/`final`/`mock` |
| `is_completed` | INTEGER | 是否已完成（0/1） |
| `notes` | TEXT | 備註 |

考試類型對照：

| 值 | 顯示 |
|---|---|
| `quiz` | 小考 |
| `segment` | 段考 |
| `midterm` | 期中考 |
| `final` | 期末考 |
| `mock` | 模擬考 |

#### `chapters` — 章節（透過 subject_id 繼承所有權，每人各自獨立）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `subject_id` | INTEGER FK | 所屬科目 |
| `title` | TEXT | 章節名稱 |
| `sort_order` | INTEGER | 排序權重（數字越小越前） |

#### `chapter_progress` — 章節讀書進度（每人各自）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者 |
| `chapter_id` | INTEGER FK | 章節 |
| `type` | TEXT | `preview`（預習）/ `review`（複習） |
| `seq` | INTEGER | 序號（預習固定為 1；複習可有多筆，從 1 遞增） |
| `scheduled_date` | TEXT | 排定日期（可為空，顯示於行事曆） |
| `is_done` | INTEGER | 是否完成（0/1） |
| `done_at` | TEXT | 完成時間 |
| `notes` | TEXT | 備註（學習狀況、重點、待補內容等，可為空） |

- 唯一約束：`(user_id, chapter_id, type, seq)`
- 每個章節可有一筆預習（seq=1）與多筆複習（seq=1,2,3…）進度記錄

#### `study_log` — 讀書時間記錄

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者 |
| `subject_id` | INTEGER FK | 科目 |
| `chapter_id` | INTEGER FK | 關聯章節（可為空） |
| `log_date` | TEXT | 記錄日期（YYYY-MM-DD） |
| `minutes` | INTEGER | 讀書分鐘數（> 0） |
| `note` | TEXT | 備註 |

#### `grades` — 成績紀錄

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者 |
| `subject_id` | INTEGER FK | 科目 |
| `exam_id` | INTEGER FK | 關聯考試（可為空） |
| `exam_name` | TEXT | 考試名稱 |
| `exam_date` | TEXT | 考試日期 |
| `score` | REAL | 得分 |
| `max_score` | REAL | 滿分（預設 100） |
| `notes` | TEXT | 備註 |
| `class_rank` | TEXT | 班排名（選填，如 `3` 或 `3/40`） |

#### `user_badges` — 使用者已獲得系統徽章

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者（ON DELETE CASCADE） |
| `badge_id` | TEXT | 徽章識別碼（對應 `badges/definitions.js`） |
| `earned_at` | TEXT | 獲得時間（ISO 8601） |

- 唯一約束：`(user_id, badge_id)`，每人每枚徽章只記錄一次
- 徽章定義（名稱、圖示、描述、稀有度）存於後端檔案，不存於 DB

#### `point_log` — 點數流水帳（Migration 11）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者（ON DELETE CASCADE） |
| `delta` | INTEGER | 正值=獲得，負值=扣除 |
| `reason` | TEXT | 來源格式詳見下表 |
| `created_at` | TEXT | 交易時間 |

| reason 格式 | 說明 |
|---|---|
| `badge:<badge_id>` | Migration 11 回填舊有徽章（歷史資料，v2.8 前） |
| `exchange:<badge_id>` | 系統徽章換點數（v2.8+） |
| `exchange:custom_<id>` | 自訂成就換點數（v2.8+） |
| `redeem:<item_id>` | 兌換商店獎勵（負值） |

- 當前餘額 = `SUM(delta) WHERE user_id = ?`
- 系統徽章稀有度對應點數：普通=10、進階=25、稀有=50、傳說=100

#### `reward_items` — 許願池（使用者自訂獎勵，Migration 11）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者（ON DELETE CASCADE） |
| `name` | TEXT | 獎勵名稱 |
| `cost` | INTEGER | 所需點數 |

#### `redemption_log` — 兌換紀錄快照（Migration 11）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者（ON DELETE CASCADE） |
| `item_name` | TEXT | 兌換時的獎勵名稱（快照，避免刪除後遺失） |
| `cost` | INTEGER | 兌換時的點數成本 |
| `redeemed_at` | TEXT | 兌換時間 |

#### `custom_badges` — 使用者自訂成就（Migration 12 + 13）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者（ON DELETE CASCADE） |
| `name` | TEXT | 成就名稱 |
| `icon` | TEXT | emoji 圖示，預設 🏅 |
| `desc` | TEXT | 說明（可為空） |
| `points` | INTEGER | 兌換後獲得的點數（v2.8：透過 exchange 入帳） |
| `category` | TEXT | 分類，預設 `自訂`（可選系統分類：習慣/努力/完成/成績/自訂）（Migration 13） |

#### `custom_badge_earned` — 自訂成就「已達成、待兌換」暫存記錄（Migration 12）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者（ON DELETE CASCADE） |
| `custom_badge_id` | INTEGER FK | 對應自訂成就（ON DELETE CASCADE） |
| `earned_at` | TEXT | 完成時間 |

- 唯一約束：`(user_id, custom_badge_id)` — 同一成就完成後需先兌換才能再次達成
- v2.8：完成成就不再自動入帳，需按「換 N 點」兌換後才入帳，同時清除此記錄

#### `daily_tasks` — 作業清單（每人每日，Migration 16 + 17）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 所屬使用者（ON DELETE CASCADE） |
| `task_date` | TEXT | 作業日期（YYYY-MM-DD） |
| `title` | TEXT | 作業名稱（可空白，但 title 和 subject_id 不可同時為空） |
| `subject_id` | INTEGER FK | 關聯科目（可為 NULL，ON DELETE SET NULL）（Migration 17） |
| `is_done` | INTEGER | 0/1，衍生自所有 parts 的完成狀態，由後端同步維持 |
| `created_at` | TEXT | 建立時間 |

#### `daily_task_parts` — 作業子項目（Migration 17）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `task_id` | INTEGER FK | 所屬作業（ON DELETE CASCADE） |
| `part_num` | INTEGER | 部份序號（1、2、3…，最多 10） |
| `is_done` | INTEGER | 0/1，個別部份完成狀態 |

- 唯一約束：`(task_id, part_num)`
- 每筆作業至少有 1 個 part（預設）；新增時若 total_parts > 1，自動建立對應筆數的 part 記錄
- 伺服器啟動時 backfill：已存在但無 parts 的舊作業自動補建 part_num=1

#### `badge_exchange_log` — 徽章兌換歷史（Migration 14）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK | 使用者（ON DELETE CASCADE） |
| `badge_id` | TEXT | 徽章識別碼（系統：`streak_7`；自訂：`custom_3`） |
| `badge_name` | TEXT | 兌換時的名稱快照 |
| `badge_icon` | TEXT | 兌換時的圖示快照 |
| `points` | INTEGER | 兌換獲得的點數 |
| `exchanged_at` | TEXT | 兌換時間 |

- 每日鎖定：同一 `badge_id` 當天已有兌換記錄則禁止重新獲得，防止刷點

---

## 6. API 文件

### 通用規則

- Base URL：`http://localhost:3000/api`
- 需要使用者身份的路由須帶 Header：`X-User-Id: <userId>`
- 請求與回應 Content-Type：`application/json`
- 錯誤回應格式：`{ "error": "錯誤訊息" }`

---

### 使用者 `/api/users`

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/users` | 取得所有使用者列表（含 `lang` 欄位） |
| POST | `/api/users` | 新增使用者 |
| PUT | `/api/users/:id` | 修改使用者名稱、顏色或語系（`lang`） |
| DELETE | `/api/users/:id` | 刪除使用者（連帶刪除所有個人資料） |

**POST `/api/users` 請求體**
```json
{
  "name": "小明",
  "avatar_color": "#6c8ebf",
  "is_admin": 0
}
```

**PUT `/api/users/:id` — `lang` 欄位**
```json
{ "lang": "en" }
```
> 可接受值：`zh-TW`、`en`、`ja`；無效值會靜默忽略並保留原值

---

### 科目 `/api/subjects`（需 X-User-Id）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/subjects` | 取得目前使用者的科目列表 |
| POST | `/api/subjects` | 新增科目（歸屬於目前使用者） |
| PUT | `/api/subjects/:id` | 修改科目名稱或顏色（僅限本人） |
| DELETE | `/api/subjects/:id` | 刪除科目（連帶刪除相關章節，僅限本人） |

---

### 課表 `/api/timetable`（需 X-User-Id）

| 方法 | 路徑 | 查詢參數 | 說明 |
|---|---|---|---|
| GET | `/api/timetable` | `school_year`、`semester` | 取得指定學年/學期課表（預設當前學期） |
| GET | `/api/timetable/years` | — | 取得該使用者有資料的學年/學期組合列表 |
| POST | `/api/timetable` | — | 新增課程 |
| PUT | `/api/timetable/:id` | — | 修改課程科目 |
| DELETE | `/api/timetable/:id` | — | 刪除課程 |

**POST 請求體**
```json
{
  "subject_id": 1,
  "day_of_week": 0,
  "period": 3,
  "school_year": 114,
  "semester": 2
}
```

> `day_of_week`：0=週一，6=週日；`period`：1–10  
> `school_year`：民國學年度（114–120）；`semester`：1（上學期）或 2（下學期）

---

### 作業 `/api/assignments`（需 X-User-Id）

| 方法 | 路徑 | 查詢參數 | 說明 |
|---|---|---|---|
| GET | `/api/assignments` | `upcoming=N`（近 N 天到期） | 取得作業列表 |
| POST | `/api/assignments` | — | 新增作業 |
| PUT | `/api/assignments/:id` | — | 修改作業（含標記完成） |
| DELETE | `/api/assignments/:id` | — | 刪除作業 |

---

### 考試 `/api/exams`（需 X-User-Id）

| 方法 | 路徑 | 查詢參數 | 說明 |
|---|---|---|---|
| GET | `/api/exams` | `upcoming=N`（取最近 N 筆） | 取得考試列表，含 `days_left` 欄位 |
| POST | `/api/exams` | — | 新增考試 |
| PUT | `/api/exams/:id` | — | 修改考試（含標記完成） |
| DELETE | `/api/exams/:id` | — | 刪除考試 |

---

### 章節 `/api/chapters`

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/chapters` | 取得所有章節及當前使用者的預習/複習進度（需 X-User-Id） |
| GET | `/api/chapters/scheduled` | 取得所有已排定日期的章節進度（需 X-User-Id） |
| POST | `/api/chapters` | 新增章節 |
| PUT | `/api/chapters/:id` | 修改章節名稱或排序 |
| DELETE | `/api/chapters/:id` | 刪除章節 |
| PATCH | `/api/chapters/:id/progress` | Upsert 預習進度（seq=1），設定日期/備註/完成狀態（需 X-User-Id） |
| POST | `/api/chapters/:id/review` | 為章節新增一筆複習進度（seq 自動遞增，需 X-User-Id） |
| PATCH | `/api/chapters/progress/:progressId` | 更新指定進度記錄的日期/備註/完成狀態（需 X-User-Id） |
| DELETE | `/api/chapters/progress/:progressId` | 刪除指定複習進度記錄（預習不可刪除，需 X-User-Id） |

**PATCH `/api/chapters/:id/progress` 請求體**
```json
{
  "type": "preview",
  "toggle_done": true,
  "scheduled_date": "2026-06-01",
  "notes": "重點在第三節"
}
```

> `type`：`preview`（預習），此端點固定操作 seq=1 那筆記錄  
> `toggle_done`：`true` 時切換完成狀態  
> `scheduled_date`：設定日期；傳空字串 `""` 清除日期  
> `notes`：備註文字；傳空字串清除備註

**PATCH `/api/chapters/progress/:progressId` 請求體**
```json
{
  "toggle_done": true,
  "scheduled_date": "2026-06-15",
  "notes": "複習第二次，熟悉度約 70%"
}
```

> 所有欄位均為選填；未傳入的欄位維持原值

---

### 讀書時間 `/api/studylog`（需 X-User-Id）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/studylog` | 取得記錄列表，支援 `from`/`to` 日期篩選 |
| GET | `/api/studylog/weekly` | 近 7 天各科目每日分鐘數（供圖表用） |
| GET | `/api/studylog/by-chapter` | 各章節累積讀書分鐘數 |
| POST | `/api/studylog` | 新增記錄 |
| DELETE | `/api/studylog/:id` | 刪除記錄 |

**POST 請求體**
```json
{
  "subject_id": 1,
  "chapter_id": 3,
  "log_date": "2026-05-23",
  "minutes": 45,
  "note": "複習第三章"
}
```

---

### 成績 `/api/grades`（需 X-User-Id）

| 方法 | 路徑 | 查詢參數 | 說明 |
|---|---|---|---|
| GET | `/api/grades` | `subject_id`（篩選科目） | 取得成績列表 |
| POST | `/api/grades` | — | 新增成績 |
| PUT | `/api/grades/:id` | — | 修改成績 |
| DELETE | `/api/grades/:id` | — | 刪除成績 |

---

### 徽章 `/api/badges`（需 X-User-Id）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/badges` | 取得目前使用者所有徽章（系統 + 自訂），含已獲得/尚未解鎖、點數欄位 |
| GET | `/api/badges/exchanges` | 取得徽章兌換歷史（最新在前） |
| POST | `/api/badges/custom` | 新增自訂成就（可指定 category） |
| DELETE | `/api/badges/custom/:id` | 刪除自訂成就（連帶清除完成記錄與 point_log 的 exchange 記錄） |
| POST | `/api/badges/custom/:id/earn` | 標記自訂成就「已完成」（v2.8：不再自動入帳；需另行兌換） |
| POST | `/api/badges/custom/:id/exchange` | 自訂成就換點數（原子操作：刪除完成記錄 + 入帳 + 寫兌換紀錄） |
| POST | `/api/badges/:badgeId/exchange` | 系統徽章換點數（同上，刪除 user_badges 記錄） |

**GET 回應格式**（陣列，系統徽章在前、自訂成就在後）：
```json
[
  {
    "id": "streak_7",
    "category": "習慣",
    "icon": "🌟",
    "name": "一週達人",
    "desc": "連續7天記錄讀書",
    "rarity": "uncommon",
    "points": 25,
    "earned": true,
    "earned_at": "2026-05-26 14:00:00",
    "custom": false
  },
  {
    "id": "custom_3",
    "_db_id": 3,
    "category": "自訂",
    "icon": "📗",
    "name": "讀完一本課外書",
    "desc": "完成閱讀一本非教科書",
    "rarity": "custom",
    "points": 40,
    "earned": false,
    "earned_at": null,
    "custom": true
  }
]
```

**系統徽章點數對照**（依稀有度，固定值）：

| 稀有度 | points |
|---|---|
| 普通（common） | 10 |
| 進階（uncommon） | 25 |
| 稀有（rare） | 50 |
| 傳說（epic） | 100 |

**系統徽章自動頒發機制**：在以下操作的 POST/PUT/PATCH 回應中附帶 `newBadges` 陣列（v2.8 起，頒發時不再自動入帳 point_log；需透過「換 N 點」兌換才入帳）：
- `POST /api/studylog` — 新增讀書記錄後檢查
- `PUT /api/assignments/:id` — 作業標記完成後檢查
- `PATCH /api/chapters/:id/progress`、`PATCH /api/chapters/progress/:id` — 章節進度完成後檢查
- `POST /api/grades` — 新增成績後檢查
- `PATCH /api/daily-tasks/parts/:partId` — 部份完成且整筆作業全完成時檢查（v3.1）
- `PATCH /api/daily-tasks/:id` — 整筆作業標記完成時檢查（v3.1）

前端 `api.js` 自動偵測回應中的 `newBadges` 欄位，觸發 `badge-earned` CustomEvent，`app.html` 監聽後顯示右下角 toast 通知。

**兌換限制**：同一徽章當天已兌換後，`badge_exchange_log` 中有當日記錄，`checkBadges()` 不再重新頒發，需隔天才能再次獲得。「當天」以伺服器本地日期為準（`date(exchanged_at, 'localtime')`），非 UTC。

---

### 獎勵商店 `/api/shop`（需 X-User-Id）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/shop/points` | 取得目前使用者點數餘額 |
| GET | `/api/shop/items` | 取得使用者的許願池清單 |
| POST | `/api/shop/items` | 新增獎勵願望（名稱、所需點數） |
| DELETE | `/api/shop/items/:id` | 刪除許願池項目 |
| POST | `/api/shop/redeem/:id` | 兌換獎勵（扣點、寫入兌換紀錄） |
| GET | `/api/shop/history` | 取得兌換紀錄 |

**POST `/api/shop/items` 請求體**
```json
{ "name": "週末電影之夜", "cost": 80 }
```

**POST `/api/shop/redeem/:id` 回應**
```json
{ "ok": true, "points": 150 }
```
> 點數不足時回傳 400 `{ "error": "點數不足" }`

---

### 作業清單 `/api/daily-tasks`（需 X-User-Id）

| 方法 | 路徑 | 查詢參數 | 說明 |
|---|---|---|---|
| GET | `/api/daily-tasks` | `date=YYYY-MM-DD` 或 `from=&to=` | 取得指定日期或日期範圍的作業（含 parts、科目名稱色彩） |
| POST | `/api/daily-tasks` | — | 新增作業 |
| PATCH | `/api/daily-tasks/parts/:partId` | — | 切換個別部份完成狀態；若全部完成則觸發 checkBadges |
| PATCH | `/api/daily-tasks/:id` | — | 切換整筆作業完成狀態（所有 parts 同步）；觸發 checkBadges |
| DELETE | `/api/daily-tasks/:id` | — | 刪除作業（parts 連帶刪除） |

**POST `/api/daily-tasks` 請求體**
```json
{
  "title": "數學習作第三章",
  "task_date": "2026-06-01",
  "subject_id": 13,
  "total_parts": 3
}
```
> `title` 與 `subject_id` 至少填一個（不可同時為空）  
> `subject_id` 需屬於當前使用者（403 if not）  
> `total_parts` 1–10，省略預設 1

**GET 回應格式**（陣列，每筆含 parts）：
```json
[
  {
    "id": 5,
    "user_id": 1,
    "task_date": "2026-06-01",
    "title": "英文單字背誦",
    "subject_id": 2,
    "subject_name": "英語",
    "subject_color": "#22c55e",
    "is_done": 0,
    "created_at": "...",
    "parts": [
      { "id": 9,  "task_id": 5, "part_num": 1, "is_done": 1 },
      { "id": 10, "task_id": 5, "part_num": 2, "is_done": 0 }
    ]
  }
]
```

**PATCH parts 回應**：`{ ok: true, task_done: boolean, newBadges: [...] }`

---

### 備份與還原 `/api/backup`

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/backup` | 下載 SQLite 資料庫檔案（備份） |
| POST | `/api/backup` | 上傳備份檔案還原資料（匯入） |

**GET** 回應為 `application/octet-stream`，檔名格式：`studyapp-backup-YYYY-MM-DD.db`  
下載前伺服器自動執行 WAL checkpoint，確保備份完整。

**POST** 請求體為原始二進位（`Content-Type: application/octet-stream`），最大 500 MB  
伺服器驗證 SQLite magic bytes，驗證通過後熱重載資料庫（不需重啟伺服器）  
回應：`{ "ok": true }` 或 `{ "error": "錯誤訊息" }`

---

## 7. 前端頁面說明

### 路由架構

前端採用 Hash Router，無需伺服器端路由處理：

| URL | 頁面 | 對應模組 |
|---|---|---|
| `/`（index.html） | 個人檔案選擇 | `profile.js`（內嵌） |
| `/app#dashboard` | 今日概覽 | `dashboard.js` |
| `/app#timetable` | 每週課表 | `timetable.js` |
| `/app#calendar` | 行事曆 | `calendar.js` |
| `/app#exams` | 考試倒數 | `exams.js` |
| `/app#homework` | 作業清單 | `homework.js` |
| `/app#chapters` | 讀書進度 | `chapters.js` |
| `/app#studylog` | 讀書時間 | `studylog.js` |
| `/app#grades` | 成績紀錄 | `grades.js` |
| `/app#badges` | 我的徽章 | `badges.js` |
| `/app#shop` | 獎勵商店 | `shop.js` |
| `/app#subjects` | 課程資訊 | `subjects.js` |
| `/app#print` | 列印週計畫 | `print.js` |

### 共用模組

#### `i18n.js`
```
t(key, vars)         — 取得目前語系的翻譯字串，支援 {var} 插值
setLang(lang)        — 切換語系（'zh-TW'|'en'|'ja'），更新 localStorage 並派送 langchange 事件
getLang()            — 取得目前語系代碼
tErr(msg)            — 將後端回傳的中文錯誤字串翻譯為目前語系（fallback 原文）
```
三語字串（~200 個 key）全部內嵌，無 CDN 依賴、無 async fetch、無 build step。

#### `api.js`
```
getUserId()          — 從 localStorage 取得目前使用者 ID
getUserName()        — 從 localStorage 取得使用者名稱
get(path)            — GET 請求
post(path, body)     — POST 請求（若回應含 newBadges，自動派送 badge-earned 事件）
put(path, body)      — PUT 請求（同上）
patch(path, body)    — PATCH 請求（同上）
del(path)            — DELETE 請求
escHtml(s)           — XSS 防護，轉義 HTML 特殊字元
fmtDate(d)           — 日期格式化（locale-aware）：zh-TW 輸出「民國N年MM月DD日」，en/ja 使用 toLocaleDateString
today()              — 取得今日日期字串（YYYY-MM-DD）
daysLeft(dateStr)    — 計算距離某日期的剩餘天數
```

#### `router.js`
監聽 `hashchange` 事件，依 hash 動態載入對應頁面模組的 `render(el)` 函式，並更新側邊欄 active 狀態與頁面標題。同時監聽 `langchange` 事件，切換語系時立即重新 render 當前頁面並更新靜態字串。

### 頁面功能說明

#### 個人檔案選擇（index.html）
- Netflix 卡片風格顯示所有使用者
- 「✏️ 編輯帳號」進入編輯模式，卡片右上角出現 ✕ 刪除按鈕
- 「+ 新增使用者」：填入姓名、選擇頭像顏色、可標記管理員
- 「💾 備份資料」：WAL checkpoint 後下載完整資料庫檔案
- 「📂 匯入備份」：選取 `.db` 備份檔上傳，確認警告後還原全部資料（不需重啟伺服器）
- 「🌙 切換主題」：切換亮色／暗色模式
- 選擇後將 `userId`、`userName`、**`lang`**（來自使用者 DB 記錄）寫入 `localStorage`，跳轉至 App；語系跟著帳號走，切換帳號時自動還原各自語系

#### 作業清單（#homework）
- 位置：側邊欄考試倒數與讀書進度之間
- **新增作業**：可選科目（課程資訊的科目列表）、輸入名稱（可空白，但科目和名稱不可同時空）、選日期、設定分成幾部份完成（1–10，預設 1）
- **今日作業**：今天的作業清單，單一部份顯示圓形勾選框，多部份顯示「已完成/總數」進度與各部份子勾選框
- **未完成（逾期）**：過去日期未完成的作業，以紅色左邊框標示，按日期分組
- **即將到來**：未來日期的作業，按日期分組
- 完成最後一個部份（或整筆作業）→ 觸發 checkBadges，若達成條件解鎖作業類徽章

#### 今日概覽（#dashboard）
- **今日課表**：顯示當天節次與科目
- **明日課表**：顯示明天節次與科目
- **今日作業**：來自作業清單的當日作業，顯示科目標籤；單一部份可直接勾選完成；多部份顯示「N/M」進度與各部份子勾選（勾選觸發 badge 檢查）；不提供新增功能（須至作業清單頁操作）
- **今日讀書進度**：排定日期為今天的預習/複習項目，顯示完成狀態與備註
- **明日讀書進度**：排定日期為明天的預習/複習項目
- **待完成讀書進度**：所有 `scheduled_date < 今天` 且 `is_done = 0` 的進度，按日期由舊到新排列；顯示科目、章節、類型、應完成日期及已逾天數（橘色提示）；無逾期時顯示「✓ 目前沒有待完成項目」；點擊 `!` 圓圈按鈕標記完成（同時彈出時間填寫視窗，可略過），項目完成後淡出移除
- **今日/明日讀書進度圓圈按鈕**：點擊可直接切換完成狀態；標記完成時彈出「記錄學習時間」視窗（填入分鐘數後自動寫入讀書時間記錄，可按「略過」跳過）
- **考試倒數**：最近 5 筆未完成考試，顯示剩餘天數（紅/黃/綠區分緊急程度），每筆考試下方顯示對應科目的預習/複習章節完成進度條

#### 每週課表（#timetable）
- 頂部下拉選單選擇學年度與學期（第1/第2學期），預設顯示當前學期
  - **zh-TW**：民國 114–120 學年度
  - **en**：2026–2032（西元年，`ROC + 1912`）
  - **ja**：2026–2032 年度（同上）
- 7 欄（週一–週日）× 10 列（第 1–10 節）的表格
- 不同學期的課表資料完全獨立
- 點空格新增課程，點已有課程編輯或刪除
- 同學期同節次重複排課會顯示錯誤提示

#### 行事曆（#calendar）
- 月曆視圖，顯示當月所有事件
- 事件來源：作業截止日、考試日期、章節預習/複習排定日
- 格子內標籤格式：`📖 科目・章節名`（預習）、`✏️ 科目・章節名`（複習）、`⏰ 科目・考試名`、`📝 科目・作業名`；hover 顯示完整名稱
- 點選日期格可查看當天詳情，並新增作業

#### 考試倒數（#exams）
- 分三個區塊：「即將到來」、「已過期」、「已完成」
  - **即將到來**：考試日期為今天或未來（`days_left >= 0`）
  - **已過期**：日期已過但未標記完成（`days_left < 0`），以紅色左邊框標示
  - **已完成**：手動標記完成的考試
- 每筆顯示：科目、類型標籤、考試名稱、日期、剩餘天數
  - 倒數 label：`N 天後` / `今天！` / `已過 N 天`
- 每筆考試下方顯示對應科目的讀書進度條：預習完成比例（藍）與複習完成比例（綠），格式為 `已完成章節 / 總章節數`；若科目尚無章節則不顯示
- 「已過期」區塊頂部有「清除已過期」按鈕，確認後一次將所有過期考試標為完成
- 可新增、編輯、標記完成、刪除

#### 讀書進度（#chapters）
- 以科目為群組的折疊表格（Accordion）
- 每個章節有「預習」（1次）與「複習」（可多次）的獨立進度
- 複習次數不限，可透過「+ 新增複習」逐次新增，並可刪除任一複習記錄
- 預習與每次複習均可設定排定日期（連動行事曆）及備註
- 按鈕顯示完成狀態（空心虛線=未完成，實心填色=已完成）；點擊標記完成時彈出「記錄學習時間」視窗，輸入分鐘數後自動寫入讀書時間記錄（關聯科目與章節），可按「略過」跳過；取消完成時直接切換，不顯示視窗
- 顯示該章節累積讀書時間（來自讀書時間記錄）
- Accordion header 顯示各科目的預習/複習完成比例
- Accordion 底部有「🗑 刪除此科目所有章節」按鈕，確認後批次刪除該科目所有章節（chapter_progress 連帶清除）

#### 讀書時間（#studylog）
- **手動記錄**：選科目、章節（選填）、日期、分鐘數
- **碼錶計時**：開始/暫停計時，停止後存入記錄，同樣可關聯科目與章節
- 近 7 天讀書時間柱狀圖（各科目堆疊）
- 記錄列表（含章節欄位）

#### 成績紀錄（#grades）
- 成績趨勢折線圖，可依科目篩選
- 記錄表格：日期、科目、考試名稱、得分/滿分、班排名（可直接在表格輸入，失焦或 Enter 自動儲存）
- 新增/編輯/刪除成績
- 新增/編輯表單中有「從考試倒數選擇（選填）」下拉選單，選擇後自動填入考試名稱、日期、科目；也可略過選單直接手動輸入；選擇的考試記錄會以 `exam_id` FK 與成績連結

#### 我的徽章（#badges）
- 頁面頂部顯示已獲得徽章數 / 總數與進度條（百分比，計入自訂成就）
- 以「習慣、努力、完成、成績」四系統類別分區展示，末尾為「自訂成就」區塊
- **已解鎖**徽章：彩色邊框（依稀有度：普通=灰藍、進階=藍、稀有=紫、傳說=金、自訂=綠），顯示徽章圖示、名稱、說明、稀有度標籤、⭐ 點數、獲得日期
- **尚未解鎖**系統徽章：灰階、半透明，顯示 🔒 與點數
- **已解鎖但尚未兌換的徽章**：顯示「換 N 點」按鈕（橘色）；點擊後原子兌換：徽章恢復未解鎖狀態、點數入帳、寫兌換紀錄；每種徽章每天只能兌換一次（隔天才能重新獲得）
- **自訂成就**（未完成）：顯示「完成！」與「刪除」兩個按鈕；點「完成！」標記為「已達成，待兌換」（v2.8：不再自動入帳）
- **自訂成就**（已達成待兌換）：顯示「換 N 點」按鈕；兌換後點數入帳、成就恢復未完成狀態、寫兌換紀錄
- **新增自訂成就**：「＋ 新增自訂成就」展開表單，填入圖示（emoji）、名稱、說明、點數、所屬分類（可選習慣/努力/完成/成績/自訂）後送出；選非「自訂」分類的成就會顯示在對應系統分類區塊中，而非末尾
- **兌換紀錄**：頁面底部顯示所有兌換歷史（圖示、名稱、點數、時間）
- 稀有度四級：普通（common）、進階（uncommon）、稀有（rare）、傳說（epic）；自訂成就另有 custom（綠色）
- 新徽章解鎖時，右下角彈出 toast 通知（動畫入場，3.5 秒後自動消失），多枚徽章依序顯示（每 0.7 秒一枚）
- **v3.1 新增 4 枚作業類徽章**：盡責開始（首次完成當天全部作業）、作業達人（連續 3 天）、作業之星（連續 7 天）、毅力勇者（累積 10 天）

#### 獎勵商店（#shop）
- 三個分頁 tab 切換：
  - **許願池**：新增自訂獎勵（名稱＋所需點數），管理願望清單（可刪除）
  - **櫃台**：顯示目前點數餘額；每張獎勵卡片含「兌換」按鈕，點數不足時按鈕灰化/禁用
  - **兌換紀錄**：顯示歷史兌換記錄（名稱、日期、扣點），最新在最前
- 各帳號的許願池、點數、兌換紀錄完全獨立

#### 課程資訊（#subjects）
- **左欄**：科目列表，可新增（24色色票，6欄×4列格狀選色）、編輯、刪除
- **右欄**：點選科目後顯示章節列表，可新增、改名、刪除、調整上下順序

#### 列印週計畫（#print）
- 產生可列印的 **A4 橫式**週計畫頁面，適合列印或儲存為 PDF
- **頁首**：學習週計畫標題、使用者名稱、列印日期、本週日期範圍
- **近期考試**：未完成的考試列表，含天數倒數（紅/黃/綠）
- **本週讀書計畫**：本週排定日期的預習/複習項目表格（日期、科目、章節、類型、完成狀態）
- **頁尾**：系統名稱與使用者・日期
- 紙張規格：`@page { size: 297mm 210mm landscape; margin: 2mm; }`；螢幕預覽同樣以 297mm 顯示；科目色彩透過 `print-color-adjust: exact` 確保正確輸出

#### 語系切換
- 側邊欄底部顯示三個語系按鈕：**中**（正體中文）、**EN**（English）、**日**（日本語）
- 點擊即時切換整個介面語言（不需重新整理頁面）
- 語系偏好存於個人帳號（DB `users.lang`），切換帳號時自動還原
- `langchange` 事件觸發後，`router.js` 重新 render 當前頁面，`app.html` 更新側邊欄靜態字串
- 後端錯誤訊息以中文儲存，前端透過 `tErr()` 對照表翻譯後顯示
- 日期格式隨語系變化：
  - zh-TW → `民國115年06月03日`（`fmtDate()` 手動轉民國年，ROC = 西元年 − 1911）
  - en → `06/03/2026`（`toLocaleDateString('en-US')`）
  - ja → `2026/06/03`（`toLocaleDateString('ja-JP')`）
- 課表學年度選單顯示隨語系變化（`timetable.js` 的 `displayYear()` 函式負責轉換）：
  - zh-TW → 民國 {y} 學年度（114–120）
  - en / ja → 西元年 {y+1912}（2026–2032）

---

## 8. 使用指南

### 初始設定流程

```
1. 啟動伺服器（npm start）
2. 開啟 http://localhost:3000
3. 點「+ 新增使用者」建立第一個帳號（建議勾選管理員）
4. 點頭像進入系統
5. 前往「⚙️ 課程資訊」新增科目
6. 在各科目下新增章節
7. 其他功能的科目/章節下拉選單即可使用
```

### 建議使用順序

| 步驟 | 操作 |
|---|---|
| 1 | 課程資訊：建立科目 → 各科目下建立章節 |
| 2 | 每週課表：排定每週固定節次 |
| 3 | 考試倒數：登記各科考試日期與類型 |
| 4 | 讀書進度：為章節設定預習/複習日期 |
| 5 | 行事曆：確認所有事件分佈 |
| 6 | 讀書時間：每日記錄讀書時數（可關聯章節） |
| 7 | 成績紀錄：考試後記錄分數 |

### 倒數天數顏色說明

| 顏色 | 天數 | 意義 |
|---|---|---|
| 🔴 紅色 | ≤ 1 天（作業）/ ≤ 3 天（考試） | 緊急 |
| 🟡 黃色 | ≤ 3 天（作業）/ ≤ 7 天（考試） | 即將到期 |
| 🟢 綠色 | 超過上述範圍 | 尚有餘裕 |

---

## 9. 資料備份與還原

### 備份

**方法一：網頁介面（推薦）**
1. 前往首頁（個人選擇頁）
2. 點「💾 備份資料」
3. 瀏覽器自動下載 `studyapp-backup-YYYY-MM-DD.db`

> 伺服器下載前會自動執行 WAL checkpoint，確保備份包含所有資料。

**方法二：直接複製檔案（需停止伺服器）**
```
複製 X:\class\data\app.db 到安全位置
```

### 還原

**方法一：網頁介面（推薦，不需重啟伺服器）**
1. 前往首頁（個人選擇頁）
2. 點「📂 匯入備份」
3. 選取 `.db` 備份檔
4. 確認警告後自動還原，頁面刷新即可使用

**方法二：手動替換檔案**
1. 停止伺服器（關閉執行中的 `node server.js`）
2. 刪除 `X:\class\data\app.db-wal` 與 `app.db-shm`（若存在）
3. 將備份檔案複製至 `X:\class\data\`，並改名為 `app.db`
4. 重新啟動伺服器

### 重置所有資料

```bash
# 停止伺服器後執行
del X:\class\data\app.db
npm start   # 重啟後自動建立空白資料庫
```

---

## 10. 區網連線設定

### 取得本機 IP

```bash
ipconfig
# 找到 "Wi-Fi" 或 "乙太網路" 下的 IPv4 位址
# 例：192.168.1.50
```

其他裝置開啟瀏覽器前往：`http://192.168.1.50:3000`

### Windows 防火牆設定

若其他裝置無法連線，需新增防火牆規則：

1. 開啟「Windows Defender 防火牆」→「進階設定」
2. 左側選「輸入規則」→ 右側點「新增規則」
3. 規則類型：**連接埠**
4. 通訊協定：**TCP**，特定本機連接埠：**3000**
5. 動作：**允許連線**
6. 設定檔：全部勾選
7. 名稱：**Study App**

---

*本文件反映截至 2026-06-01 的實作狀態（v3.1）。*
