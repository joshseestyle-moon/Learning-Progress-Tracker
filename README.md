# 學習管理系統

本機局域網路多人學習管理工具，無需上雲、無需登入帳號。

## 功能

| 頁面 | 功能 |
|---|---|
| 個人選擇 | Netflix 卡片風格，點選進入 |
| 今日概覽 | 今日課表、即將到期作業、考試倒數、讀書進度摘要 |
| 每週課表 | 視覺化時間格，支援個人/共用課程 |
| 行事曆 | 月曆整合作業與考試事件 |
| 考試倒數 | 倒數天數卡片，標記完成 |
| 讀書進度 | 各科目章節打勾進度條 |
| 讀書時間 | 碼錶計時 + 手動記錄 + 週統計圖 |
| 成績紀錄 | 歷次成績表格 + 趨勢折線圖 |

## 快速開始

### 1. 安裝 Node.js
從 https://nodejs.org 下載安裝（v18 以上）

### 2. 安裝依賴
```
cd X:\class
npm install
```

### 3. 啟動
```
npm start
```
開瀏覽器前往 http://localhost:3000

### 開發模式（儲存時自動重啟）
```
node --watch server.js
```

## 讓區網其他裝置連線

1. 在此電腦執行 `ipconfig`，找到 IPv4 位址（例：`192.168.1.50`）
2. 其他裝置瀏覽器開啟 `http://192.168.1.50:3000`
3. 若無法連線，新增 Windows 防火牆規則：
   - Windows Defender 防火牆 → 進階設定 → 輸入規則 → 新增規則
   - 類型：連接埠 → TCP → 特定本機連接埠：`3000` → 允許連線
   - 命名：`Study App`

## 資料庫

資料存在 `data/app.db`（SQLite 單一檔案）。
- **備份**：複製此檔案即可
- **重置**：刪除 `data/app.db`，重啟伺服器自動建立新資料庫

## 離線使用 Chart.js / Alpine.js

目前從 CDN 載入圖表庫。若需完全離線，請下載以下檔案：
- https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js → 存至 `public/vendor/chart.min.js`
- https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js → 存至 `public/vendor/alpine.min.js`

然後修改 `public/app.html` 中的 script src 為 `vendor/chart.min.js`。

## 新增第一個使用者

1. 開啟 http://localhost:3000
2. 點選「+ 新增使用者」
3. 輸入姓名，勾選「設為管理員」（第一個使用者建議設為管理員）
4. 點選「新增」，再點選頭像進入系統
