PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    avatar_color TEXT    NOT NULL DEFAULT '#6c8ebf',
    is_admin     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#4a90d9',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assignments_user_due  ON assignments(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_exams_user_date        ON exams(user_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_study_log_user_date    ON study_log(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_grades_user_subject    ON grades(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_chapter_progress_user  ON chapter_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_timetable_user         ON timetable_slots(user_id);
