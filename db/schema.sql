-- Bootstrap schema, executed via db.exec() on every server start (db/db.js openAndMigrate()).
-- Every statement MUST be idempotent (IF NOT EXISTS) — on an existing database this file
-- is a no-op; on a brand-new database it creates the full current-state schema in one pass,
-- after which db.js's individual migration guards see everything already present and skip.
--
-- Resynced 2026-07-11 to match db.js migrations through Migration 25 (previously frozen at
-- the pre-Migration-9 shape). New tables/columns are grouped below with the migration that
-- introduced them. When adding a new migration to db.js, add the equivalent CREATE/column
-- here too so this file does not drift out of sync again.

PRAGMA foreign_keys = ON;

-- ── Core (pre-Migration-9) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL,
    avatar_color        TEXT    NOT NULL DEFAULT '#6c8ebf',
    is_admin            INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    lang                TEXT    NOT NULL DEFAULT 'zh-TW',              -- Migration 15
    daily_goal_minutes  INTEGER NOT NULL DEFAULT 0,                    -- Migration 18
    weekly_goal_minutes INTEGER NOT NULL DEFAULT 0                     -- Migration 18
);

CREATE TABLE IF NOT EXISTS subjects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#4a90d9',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    category   TEXT NOT NULL DEFAULT 'exam'                            -- Migration 19 ('exam'|'non_exam')
);

CREATE TABLE IF NOT EXISTS timetable_slots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    period      INTEGER NOT NULL CHECK (period BETWEEN 1 AND 10),
    school_year INTEGER NOT NULL DEFAULT 114,
    semester    INTEGER NOT NULL DEFAULT 2 CHECK (semester IN (1, 2)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, day_of_week, period, school_year, semester)
);

CREATE TABLE IF NOT EXISTS assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT,
    due_date    TEXT    NOT NULL,
    is_done     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exams (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS chapters (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chapter_progress (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chapter_id              INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    type                    TEXT NOT NULL DEFAULT 'preview' CHECK(type IN ('preview','review')),
    seq                     INTEGER NOT NULL DEFAULT 1,
    scheduled_date          TEXT,
    is_done                 INTEGER NOT NULL DEFAULT 0,
    done_at                 TEXT,
    notes                   TEXT,
    original_scheduled_date TEXT,                                     -- Migration 25
    UNIQUE(user_id, chapter_id, type, seq)
);

CREATE TABLE IF NOT EXISTS study_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    log_date   TEXT    NOT NULL,
    minutes    INTEGER NOT NULL CHECK (minutes > 0),
    note       TEXT,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grades (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    exam_id    INTEGER REFERENCES exams(id) ON DELETE SET NULL,
    exam_name  TEXT    NOT NULL,
    exam_date  TEXT    NOT NULL,
    score      REAL    NOT NULL,
    max_score  REAL    NOT NULL DEFAULT 100,
    notes      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    class_rank TEXT                                                   -- Migration 9
);

-- ── Achievement badges (Migration 10) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_badges (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id  TEXT    NOT NULL,
    earned_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, badge_id)
);

-- ── Reward store (Migration 11) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS point_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL,
    reason     TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reward_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    cost       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redemption_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_name   TEXT    NOT NULL,
    cost        INTEGER NOT NULL,
    redeemed_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Custom achievements (Migration 12 + 13) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_badges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    icon       TEXT    NOT NULL DEFAULT '🏅',
    desc       TEXT    NOT NULL DEFAULT '',
    points     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    category   TEXT    NOT NULL DEFAULT '自訂'                          -- Migration 13
);

CREATE TABLE IF NOT EXISTS custom_badge_earned (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    custom_badge_id INTEGER NOT NULL REFERENCES custom_badges(id) ON DELETE CASCADE,
    earned_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, custom_badge_id)
);

-- ── Badge exchange history (Migration 14) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS badge_exchange_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id     TEXT    NOT NULL,
    badge_name   TEXT    NOT NULL,
    badge_icon   TEXT    NOT NULL,
    points       INTEGER NOT NULL,
    exchanged_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Homework list (Migration 16 + 17) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_date  TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    is_done    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL       -- Migration 17
);

CREATE TABLE IF NOT EXISTS daily_task_parts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id  INTEGER NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
    part_num INTEGER NOT NULL,
    is_done  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(task_id, part_num)
);

-- ── Learning periods (Migration 20) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS periods (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_year INTEGER NOT NULL,
    type        TEXT    NOT NULL CHECK (type IN ('semester1','winter','semester2','summer')),
    start_date  TEXT    NOT NULL,
    end_date    TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, school_year, type)
);

-- ── Goals (Migration 21) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS goals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    goal_type    TEXT    NOT NULL CHECK (goal_type IN ('chapter','grade','text')),
    horizon      TEXT    NOT NULL DEFAULT 'short' CHECK (horizon IN ('short','mid','long')),
    period_id    INTEGER REFERENCES periods(id) ON DELETE SET NULL,
    subject_id   INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    exam_type    TEXT,
    target_value INTEGER,
    due_date     TEXT,
    is_done      INTEGER NOT NULL DEFAULT 0,
    done_at      TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Gamification: XP / surprise rewards / catch-up quests (Migration 22-24) ─

CREATE TABLE IF NOT EXISTS xp_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL,
    reason     TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_reward_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_date TEXT    NOT NULL,
    tier        INTEGER NOT NULL,
    points      INTEGER NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, reward_date)
);

CREATE TABLE IF NOT EXISTS catchup_quests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT    NOT NULL,
    target_count  INTEGER NOT NULL,
    deadline_date TEXT    NOT NULL,
    bonus_points  INTEGER NOT NULL DEFAULT 30,
    bonus_xp      INTEGER NOT NULL DEFAULT 50,
    status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','expired')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS catchup_quest_items (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id INTEGER NOT NULL REFERENCES catchup_quests(id) ON DELETE CASCADE,
    kind     TEXT    NOT NULL CHECK (kind IN ('chapter','task')),
    item_id  INTEGER NOT NULL,
    UNIQUE(quest_id, kind, item_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assignments_user_due        ON assignments(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_exams_user_date              ON exams(user_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_study_log_user_date          ON study_log(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_grades_user_subject          ON grades(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_chapter_progress_user        ON chapter_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_timetable_user                ON timetable_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_subjects_user                 ON subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user              ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_point_log_user                ON point_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_items_user             ON reward_items(user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_log_user           ON redemption_log(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_badges_user            ON custom_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_badge_earned_user      ON custom_badge_earned(user_id);
CREATE INDEX IF NOT EXISTS idx_badge_exchange_log_user       ON badge_exchange_log(user_id);
CREATE INDEX IF NOT EXISTS idx_badge_exchange_log_user_badge ON badge_exchange_log(user_id, badge_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_date         ON daily_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_daily_task_parts_task         ON daily_task_parts(task_id);
CREATE INDEX IF NOT EXISTS idx_periods_user                  ON periods(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user                    ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_user                   ON xp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reward_user             ON daily_reward_log(user_id);
CREATE INDEX IF NOT EXISTS idx_catchup_quests_user           ON catchup_quests(user_id);
CREATE INDEX IF NOT EXISTS idx_catchup_quest_items_quest     ON catchup_quest_items(quest_id);
