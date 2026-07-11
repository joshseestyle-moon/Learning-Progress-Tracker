const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

function openAndMigrate() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Bootstrap schema on first run
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migration: replace old timetable_slots (with start_time/end_time/teacher/classroom) with new period-based schema
  const cols = db.pragma('table_info(timetable_slots)').map(c => c.name);
  if (cols.includes('start_time')) {
    db.exec(`
      DROP TABLE IF EXISTS timetable_slots;
      CREATE TABLE timetable_slots (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        period      INTEGER NOT NULL CHECK (period BETWEEN 1 AND 10),
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, day_of_week, period)
      );
      CREATE INDEX IF NOT EXISTS idx_timetable_user ON timetable_slots(user_id);
    `);
  }

  // Migration: add type + scheduled_date to chapter_progress, change unique constraint
  const cpCols = db.pragma('table_info(chapter_progress)').map(c => c.name);
  if (!cpCols.includes('type')) {
    db.exec(`
      CREATE TABLE chapter_progress_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chapter_id     INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        type           TEXT NOT NULL DEFAULT 'preview' CHECK(type IN ('preview','review')),
        scheduled_date TEXT,
        is_done        INTEGER NOT NULL DEFAULT 0,
        done_at        TEXT,
        UNIQUE(user_id, chapter_id, type)
      );
      INSERT INTO chapter_progress_new (user_id, chapter_id, type, is_done, done_at)
        SELECT user_id, chapter_id, 'review', is_done, done_at FROM chapter_progress;
      DROP TABLE chapter_progress;
      ALTER TABLE chapter_progress_new RENAME TO chapter_progress;
      CREATE INDEX IF NOT EXISTS idx_chapter_progress_user ON chapter_progress(user_id);
    `);
  }

  // Migration: add 'segment' to exam_type CHECK constraint
  const examSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='exams'").get();
  if (examSql && !examSql.sql.includes('segment')) {
    db.exec(`
      CREATE TABLE exams_new (
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
      INSERT INTO exams_new SELECT * FROM exams;
      DROP TABLE exams;
      ALTER TABLE exams_new RENAME TO exams;
      CREATE INDEX IF NOT EXISTS idx_exams_user_date ON exams(user_id, exam_date);
    `);
  }

  // Migration: add chapter_id to study_log
  const slCols = db.pragma('table_info(study_log)').map(c => c.name);
  if (!slCols.includes('chapter_id')) {
    db.exec('ALTER TABLE study_log ADD COLUMN chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL');
  }

  // Migration: add school_year + semester to timetable_slots, update UNIQUE constraint
  const ttCols2 = db.pragma('table_info(timetable_slots)').map(c => c.name);
  if (!ttCols2.includes('school_year')) {
    db.exec(`
      CREATE TABLE timetable_slots_new (
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
      INSERT INTO timetable_slots_new (id, user_id, subject_id, day_of_week, period, created_at)
        SELECT id, user_id, subject_id, day_of_week, period, created_at FROM timetable_slots;
      DROP TABLE timetable_slots;
      ALTER TABLE timetable_slots_new RENAME TO timetable_slots;
      CREATE INDEX IF NOT EXISTS idx_timetable_user ON timetable_slots(user_id);
    `);
  }

  // Migration: add notes to chapter_progress
  const cpCols2 = db.pragma('table_info(chapter_progress)').map(c => c.name);
  if (!cpCols2.includes('notes')) {
    db.exec('ALTER TABLE chapter_progress ADD COLUMN notes TEXT');
  }

  // Migration: add seq to chapter_progress, allow multiple review sessions
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
      CREATE INDEX IF NOT EXISTS idx_chapter_progress_user ON chapter_progress(user_id);
    `);
  }

  // Migration: add user_id to subjects (make subjects per-user)
  const subCols = db.pragma('table_info(subjects)').map(c => c.name);
  if (!subCols.includes('user_id')) {
    const firstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
    const defaultUserId = firstUser ? firstUser.id : 1;
    db.exec(`
      CREATE TABLE subjects_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        color      TEXT NOT NULL DEFAULT '#4a90d9',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO subjects_new (id, user_id, name, color, created_at)
        SELECT id, ${defaultUserId}, name, color, created_at FROM subjects;
      DROP TABLE subjects;
      ALTER TABLE subjects_new RENAME TO subjects;
    `);
  }

  // Ensure index exists regardless of migration path
  db.exec('CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id)');

  // Migration 9: add class_rank to grades
  const gradeCols = db.pragma('table_info(grades)').map(c => c.name);
  if (!gradeCols.includes('class_rank')) {
    db.exec('ALTER TABLE grades ADD COLUMN class_rank TEXT');
  }

  // Migration 10: user_badges table for achievement system
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id  TEXT    NOT NULL,
      earned_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, badge_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
  `);

  // Migration 11: reward store tables
  const hasPointLog = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='point_log'").get();
  if (!hasPointLog) {
    // Whole thing is one transaction, matching the Migration 22 convention below:
    // if the process dies mid-backfill, point_log won't exist on restart so the
    // guard re-runs it cleanly — never a half-backfilled state.
    db.transaction(() => {
      db.exec(`
        CREATE TABLE point_log (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          delta      INTEGER NOT NULL,
          reason     TEXT    NOT NULL,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_point_log_user ON point_log(user_id);
        CREATE TABLE reward_items (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT    NOT NULL,
          cost       INTEGER NOT NULL DEFAULT 0,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_reward_items_user ON reward_items(user_id);
        CREATE TABLE redemption_log (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_name   TEXT    NOT NULL,
          cost        INTEGER NOT NULL,
          redeemed_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_redemption_log_user ON redemption_log(user_id);
      `);

      // Backfill existing badges → point_log so current users get their points
      const { RARITY_PTS } = require('../utils/points');
      const BADGES_DEF = require('../badges/definitions');
      const existing = db.prepare('SELECT user_id, badge_id, earned_at FROM user_badges').all();
      const insertPts = db.prepare('INSERT INTO point_log (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)');
      for (const row of existing) {
        const def = BADGES_DEF.find(b => b.id === row.badge_id);
        if (def) insertPts.run(row.user_id, RARITY_PTS[def.rarity] || 10, 'badge:' + row.badge_id, row.earned_at);
      }
    })();
  }

  // Migration 12: custom achievements per user
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_badges (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      icon       TEXT    NOT NULL DEFAULT '🏅',
      desc       TEXT    NOT NULL DEFAULT '',
      points     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_custom_badges_user ON custom_badges(user_id);
    CREATE TABLE IF NOT EXISTS custom_badge_earned (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      custom_badge_id  INTEGER NOT NULL REFERENCES custom_badges(id) ON DELETE CASCADE,
      earned_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, custom_badge_id)
    );
    CREATE INDEX IF NOT EXISTS idx_custom_badge_earned_user ON custom_badge_earned(user_id);
  `);

  // Migration 13: add category column to custom_badges
  const cbCols = db.pragma('table_info(custom_badges)').map(c => c.name);
  if (!cbCols.includes('category')) {
    db.exec("ALTER TABLE custom_badges ADD COLUMN category TEXT NOT NULL DEFAULT '自訂'");
  }

  // Migration 14: badge exchange log
  const hasExchangeLog = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='badge_exchange_log'").get();
  if (!hasExchangeLog) {
    db.exec(`
      CREATE TABLE badge_exchange_log (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge_id     TEXT    NOT NULL,
        badge_name   TEXT    NOT NULL,
        badge_icon   TEXT    NOT NULL,
        points       INTEGER NOT NULL,
        exchanged_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_badge_exchange_log_user ON badge_exchange_log(user_id);
      CREATE INDEX idx_badge_exchange_log_user_badge ON badge_exchange_log(user_id, badge_id);
    `);
  }

  // Migration 15: add lang preference to users
  const userCols = db.pragma('table_info(users)').map(c => c.name);
  if (!userCols.includes('lang')) {
    db.exec("ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'zh-TW'");
  }

  // Migration 16: daily tasks (free-form homework checklist)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_date  TEXT NOT NULL,
      title      TEXT NOT NULL,
      is_done    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_date ON daily_tasks(user_id, task_date);
  `);

  // Migration 17: add subject_id to daily_tasks + parts table
  const dtCols = db.pragma('table_info(daily_tasks)').map(c => c.name);
  if (!dtCols.includes('subject_id')) {
    db.exec('ALTER TABLE daily_tasks ADD COLUMN subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_task_parts (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id  INTEGER NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
      part_num INTEGER NOT NULL,
      is_done  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(task_id, part_num)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_task_parts_task ON daily_task_parts(task_id);
  `);
  // Backfill: create part 1 for any existing task that has no parts
  const orphanTasks = db.prepare(`
    SELECT id, is_done FROM daily_tasks
    WHERE NOT EXISTS (SELECT 1 FROM daily_task_parts p WHERE p.task_id = daily_tasks.id)
  `).all();
  const bfPart = db.prepare('INSERT OR IGNORE INTO daily_task_parts (task_id, part_num, is_done) VALUES (?, 1, ?)');
  for (const t of orphanTasks) bfPart.run(t.id, t.is_done);

  // Migration 18: per-user study-time goals (daily / weekly, in minutes; 0 = unset)
  const userCols2 = db.pragma('table_info(users)').map(c => c.name);
  if (!userCols2.includes('daily_goal_minutes')) {
    db.exec('ALTER TABLE users ADD COLUMN daily_goal_minutes INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols2.includes('weekly_goal_minutes')) {
    db.exec('ALTER TABLE users ADD COLUMN weekly_goal_minutes INTEGER NOT NULL DEFAULT 0');
  }

  // Migration 19: subject category (考科 exam / 非考科 non_exam)
  const subCols19 = db.pragma('table_info(subjects)').map(c => c.name);
  if (!subCols19.includes('category')) {
    db.exec("ALTER TABLE subjects ADD COLUMN category TEXT NOT NULL DEFAULT 'exam'");
  }

  // Migration 20: academic periods (上學期/寒假/下學期/暑假), user-defined date ranges per school year
  db.exec(`
    CREATE TABLE IF NOT EXISTS periods (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      school_year INTEGER NOT NULL,
      type        TEXT NOT NULL CHECK (type IN ('semester1','winter','semester2','summer')),
      start_date  TEXT NOT NULL,
      end_date    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, school_year, type)
    );
    CREATE INDEX IF NOT EXISTS idx_periods_user ON periods(user_id);
  `);

  // Migration 21: goals (chapter-progress / grade / free-text, short-mid-long horizon)
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      goal_type    TEXT NOT NULL CHECK (goal_type IN ('chapter','grade','text')),
      horizon      TEXT NOT NULL DEFAULT 'short' CHECK (horizon IN ('short','mid','long')),
      period_id    INTEGER REFERENCES periods(id) ON DELETE SET NULL,
      subject_id   INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      exam_type    TEXT,
      target_value INTEGER,
      due_date     TEXT,
      is_done      INTEGER NOT NULL DEFAULT 0,
      done_at      TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
  `);

  // Migration 22: xp_log — permanent growth XP, separate from spendable point_log.
  // One-time backfill (guarded by table existence): historical study minutes at
  // 1 XP/min capped 180/day, and completed chapter sessions at 15 XP each.
  const hasXpLog22 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='xp_log'").get();
  if (!hasXpLog22) {
    // Whole thing is one transaction: if the process dies mid-backfill, the
    // table won't exist on restart so the guard re-runs it cleanly — never a
    // half-backfilled state that the table-existence guard would skip forever.
    db.transaction(() => {
      db.exec(`
        CREATE TABLE xp_log (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          delta      INTEGER NOT NULL,
          reason     TEXT    NOT NULL,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_xp_log_user ON xp_log(user_id);
      `);
      const insertXp22 = db.prepare('INSERT INTO xp_log (user_id, delta, reason) VALUES (?, ?, ?)');
      const studyXp22 = db.prepare(`
        SELECT user_id, SUM(MIN(day_min, 180)) AS xp FROM (
          SELECT user_id, log_date, SUM(minutes) AS day_min FROM study_log GROUP BY user_id, log_date
        ) GROUP BY user_id
      `).all();
      for (const r of studyXp22) if (r.xp > 0) insertXp22.run(r.user_id, r.xp, 'backfill:study');
      const chapXp22 = db.prepare(
        'SELECT user_id, COUNT(*) AS c FROM chapter_progress WHERE is_done = 1 GROUP BY user_id'
      ).all();
      for (const r of chapXp22) if (r.c > 0) insertXp22.run(r.user_id, r.c * 15, 'backfill:chapters');
    })();
  }

  // Migration 23: daily surprise reward log — UNIQUE(user_id, reward_date) is the
  // once-per-day guarantee (INSERT OR IGNORE, changes===1 wins the surprise).
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_reward_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_date TEXT    NOT NULL,
      tier        INTEGER NOT NULL,
      points      INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, reward_date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_reward_user ON daily_reward_log(user_id);
  `);

  // Migration 24: catch-up quests — snapshot of overdue item IDs at accept time;
  // progress is measured against the snapshot (no penalty on expiry, 鼓勵導向)
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_catchup_quests_user ON catchup_quests(user_id);
    CREATE TABLE IF NOT EXISTS catchup_quest_items (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL REFERENCES catchup_quests(id) ON DELETE CASCADE,
      kind     TEXT    NOT NULL CHECK (kind IN ('chapter','task')),
      item_id  INTEGER NOT NULL,
      UNIQUE(quest_id, kind, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_catchup_quest_items_quest ON catchup_quest_items(quest_id);
  `);

  // Migration 25: preserve a chapter session's ORIGINAL due date when the
  // catch-up planner reschedules it, so "was this overdue and later cleared?"
  // (cleared_last7 count + comeback badge) survives the reschedule.
  const cpCols25 = db.pragma('table_info(chapter_progress)').map(c => c.name);
  if (!cpCols25.includes('original_scheduled_date')) {
    db.exec('ALTER TABLE chapter_progress ADD COLUMN original_scheduled_date TEXT');
  }

  return db;
}

let _db = openAndMigrate();

// Wrapper — all routes hold a reference to this object.
// reinitialize() hot-swaps _db so subsequent calls use the new connection.
const dbWrapper = {
  prepare:     (sql) => _db.prepare(sql),
  exec:        (sql) => _db.exec(sql),
  pragma:      (key) => _db.pragma(key),
  transaction: (fn)  => _db.transaction(fn),
  get DB_PATH() { return DB_PATH; },
  reinitialize(sourcePath) {
    try { _db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
    try { _db.close(); } catch (_) {}
    // Remove stale WAL/SHM files so they don't corrupt the restored DB
    for (const ext of ['-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + ext); } catch (_) {}
    }
    if (sourcePath) fs.copyFileSync(sourcePath, DB_PATH);
    _db = openAndMigrate();
  },
};

module.exports = dbWrapper;
