const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

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

module.exports = db;
