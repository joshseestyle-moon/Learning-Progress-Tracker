# 規格：copy-user-data.js 升級到 Migration 25

> 目的：讓 `scripts/copy-user-data.js`（v3.1 時代）完整覆蓋 M19–M25 的表與欄位，之後把邦正複製到「測試用帳號B」當真實形狀的驗證資料。設計決策已定案如下，實作照做即可；發現規格與現場矛盾時停下回報，不要自行改設計。

## 0. 背景事實（已查證）

- 腳本以 `new Database(DB_PATH)` 直接開庫、**不 require db/db.js**——保持這樣（require db.js 會觸發 migration 副作用，是已知教訓）。
- 全部資料表的 `id` 都是 `INTEGER PRIMARY KEY AUTOINCREMENT` → **舊 id 永不被新列重用**，因此 reason 字串即使不改寫也不會與未來新列碰撞；改寫的目的是**保持防重語意**（見 §3）。
- 腳本執行期間 `foreign_keys = OFF` → CASCADE/SET NULL **不會觸發**，清除段必須自己按正確順序刪子表→父表。
- 邦正現況：periods 4、goals 1、xp_log 25、point_log 488、catchup_quests 0、subjects 27（category 欄）、chapter_progress 137（可能含 original_scheduled_date）。

## 1. 清除段（wipe）補六張表

在現有 DELETE 清單**最前面**加（順序重要，FK OFF 但仍照依賴序）：

```sql
DELETE FROM catchup_quest_items WHERE quest_id IN (SELECT id FROM catchup_quests WHERE user_id = ${dstId});
DELETE FROM catchup_quests      WHERE user_id = ${dstId};
DELETE FROM daily_reward_log    WHERE user_id = ${dstId};
DELETE FROM xp_log              WHERE user_id = ${dstId};
DELETE FROM goals               WHERE user_id = ${dstId};
DELETE FROM periods             WHERE user_id = ${dstId};
```

（goals 先於 periods：goals.period_id FK 引用 periods。）

## 2. 既有複製段的欄位補齊

- **subjects**（步驟2）：INSERT 加 `category`。
- **chapter_progress**（步驟7）：INSERT 加 `original_scheduled_date`；**並建立 `cpMap`（舊 progress id → 新 id）**——xp_log 與 catchup 需要。
- **study_log**（步驟8）：**建立 `slMap`（舊 id → 新 id）**。
- **daily_tasks**（步驟16）：**建立 `taskMap`（舊 task id → 新 id）**（parts 不需要 map）。
- **users 同步**（步驟17）：lang 之外加 `daily_goal_minutes`、`weekly_goal_minutes`。

## 3. 新增複製段（放在既有步驟之後，依此順序）

### 3a. periods → 建 `periodMap`
`INSERT INTO periods (user_id, school_year, type, start_date, end_date, created_at)`，逐筆記 `periodMap[old.id] = new id`。（UNIQUE(user_id, school_year, type)——dst 已被清空，直接 INSERT。）

### 3b. goals → 建 `goalMap`
`INSERT INTO goals (user_id, title, goal_type, horizon, period_id, subject_id, exam_type, target_value, due_date, is_done, done_at, created_at)`；
- `period_id` 經 `periodMap` 對映（來源為 null 就 null；對映不到→設 null 並 console.warn）。
- `subject_id` 經 `subjMap`（同樣容錯）。

### 3c. catchup_quests + catchup_quest_items → 建 `questMap`
- quests 逐欄照抄（user_id 換 dst），記 `questMap`。
- items：`kind='chapter'` 的 `item_id` 經 `cpMap`、`kind='task'` 經 `taskMap` 對映；**對映不到的跳過該 item 並 console.warn**（快照指向已被過濾的列，複製過去只會是懸空引用）。
- 邦正目前 0 筆，但要寫完整——工具是通用的。

### 3d. xp_log（最後做，需要所有 map）
逐筆複製 `delta, reason, created_at`，reason 依慣例改寫：

| 原 reason 樣式 | 改寫 |
|---|---|
| `study:<id>` | id 經 `slMap` 換新 |
| `chapter:<progressId>` | 經 `cpMap` |
| `task:<taskId>:<suffix>` | taskId 經 `taskMap`，suffix（partNum 或 done）保留 |
| `goal:<id>` | 經 `goalMap` |
| `quest:<id>` | 經 `questMap` |
| `backfill:%` 及其他不符合上述樣式者 | 原樣保留 |
| 樣式符合但 map 查不到 | 原樣保留＋計數，結束時 console.warn 總數 |

改寫的目的：複製後帳號內的 grantOnce 防重語意與來源一致（例如已完成的 text goal 在複本上取消再勾，不會重複拿 XP）。AUTOINCREMENT 保證原樣保留的 reason 不會與未來新列碰撞，所以容錯路徑是安全的。

### 3e. daily_reward_log
逐欄照抄（user_id 換 dst）。dst 已清空，直接 INSERT。

## 4. 安全護欄（新增）

目標帳號名稱**不含「測試」**時，除非帶 `--allow-any` 旗標，否則列印錯誤並退出（防呆：這腳本的清除段是毀滅性的，別讓手滑打到真實帳號）。來源帳號不受限（讀取不破壞）。

## 5. 驗收條件（逐條過才算完成）

**絕不對正式 `data/app.db` 執行**——全部在拋棄式複本上測（`cp data/app.db <tmp>` 後以 `DB_PATH=<tmp>` 跑）。正式執行由驗收者（主對話）在備份後進行。

1. `node --check scripts/copy-user-data.js` 過。
2. 拋棄式複本上：先直接 INSERT 建「測試用帳號B」（users 表：name='測試用帳號B', avatar_color 任意, is_admin=0），跑 `node scripts/copy-user-data.js 邦正 測試用帳號B`。
3. 對帳（來源 vs 目標逐表筆數相等）：subjects、chapters、timetable_slots、assignments、exams、chapter_progress、study_log、grades、point_log、reward_items、redemption_log、custom_badges、daily_tasks、daily_task_parts、**periods、goals、xp_log、daily_reward_log、catchup_quests、catchup_quest_items**。
4. 欄位保真抽查：`subjects.category` 非預設值的筆數 src=dst；`chapter_progress.original_scheduled_date` 非 null 筆數 src=dst；goals 的 `period_id` 在 dst 指向 dst 自己的 period（join 驗證）。
5. reason 改寫抽查：dst 的 xp_log 中 `study:%`/`chapter:%`/`task:%` 的內嵌 id，逐筆 join 回 dst 對應表確認存在（允許 §3d 容錯保留的例外，數量與 warn 一致）。
6. **冪等**：同一複本上再跑第二次，全部對帳結果不變（先清後灌語意成立）。
7. **不傷旁人**：跑前後，邦正與炎朗與測試用帳號（user7）的各表筆數完全不變。
8. 護欄：對名稱不含「測試」的目標帳號跑 → 拒絕退出；加 `--allow-any` → 放行（用拋棄式複本上的假帳號驗證）。
9. `npm test` 綠（不相關但照慣例跑）。

## 6. 範圍

只改 `scripts/copy-user-data.js`。不動 db/、routes/、public/。發現需要動範圍外的檔案時停下回報。
