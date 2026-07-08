const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');

const TYPES = ['semester1', 'winter', 'semester2', 'summer'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Aggregate learning stats within a date range.
// goals_achieved / xp_earned will be added when the goals (Phase 2) and XP (Phase 3) tables exist.
function summarize(userId, from, to) {
  const study = db.prepare(`
    SELECT COALESCE(SUM(minutes), 0) AS total_minutes, COUNT(DISTINCT log_date) AS active_days
    FROM study_log
    WHERE user_id = ? AND date(log_date) BETWEEN date(?) AND date(?)
  `).get(userId, from, to);
  const chapters = db.prepare(`
    SELECT COUNT(*) AS n FROM chapter_progress
    WHERE user_id = ? AND is_done = 1 AND done_at IS NOT NULL
      AND date(done_at) BETWEEN date(?) AND date(?)
  `).get(userId, from, to);
  const tasks = db.prepare(`
    SELECT COUNT(*) AS n FROM daily_tasks
    WHERE user_id = ? AND is_done = 1 AND date(task_date) BETWEEN date(?) AND date(?)
  `).get(userId, from, to);
  return {
    total_minutes: study.total_minutes,
    active_days: study.active_days,
    chapters_done: chapters.n,
    tasks_done: tasks.n,
  };
}

router.get('/', userCtx, (req, res) => {
  const rows = req.query.school_year !== undefined
    ? db.prepare('SELECT * FROM periods WHERE user_id = ? AND school_year = ? ORDER BY start_date')
        .all(req.userId, +req.query.school_year)
    : db.prepare('SELECT * FROM periods WHERE user_id = ? ORDER BY school_year, start_date')
        .all(req.userId);
  res.json(rows);
});

router.get('/current', userCtx, (req, res) => {
  const row = db.prepare(`
    SELECT * FROM periods
    WHERE user_id = ?
      AND date(start_date) <= date('now', 'localtime')
      AND date(end_date)   >= date('now', 'localtime')
    ORDER BY start_date DESC LIMIT 1
  `).get(req.userId);
  res.json(row || null);
});

router.post('/', userCtx, (req, res) => {
  const { school_year, type, start_date, end_date } = req.body;
  if (!Number.isInteger(school_year) || school_year < 100 || school_year > 200)
    return res.status(400).json({ error: '無效的學年' });
  if (!TYPES.includes(type)) return res.status(400).json({ error: '無效的區間類型' });
  if (!DATE_RE.test(start_date || '') || !DATE_RE.test(end_date || ''))
    return res.status(400).json({ error: '日期格式須為 YYYY-MM-DD' });
  if (end_date < start_date) return res.status(400).json({ error: '結束日期不能早於開始日期' });

  db.prepare(`
    INSERT INTO periods (user_id, school_year, type, start_date, end_date)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, school_year, type)
    DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date
  `).run(req.userId, school_year, type, start_date, end_date);
  const row = db.prepare('SELECT * FROM periods WHERE user_id = ? AND school_year = ? AND type = ?')
    .get(req.userId, school_year, type);

  // Overlap with another period is allowed but flagged, so the UI can warn.
  const overlap = db.prepare(`
    SELECT COUNT(*) AS n FROM periods
    WHERE user_id = ? AND id != ?
      AND date(start_date) <= date(?) AND date(end_date) >= date(?)
  `).get(req.userId, row.id, end_date, start_date);
  res.status(201).json({ ...row, overlap_warning: overlap.n > 0 });
});

router.put('/:id', userCtx, (req, res) => {
  const p = db.prepare('SELECT * FROM periods WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!p) return res.status(404).json({ error: '區間不存在' });
  const start_date = req.body.start_date !== undefined ? req.body.start_date : p.start_date;
  const end_date   = req.body.end_date   !== undefined ? req.body.end_date   : p.end_date;
  if (!DATE_RE.test(start_date) || !DATE_RE.test(end_date))
    return res.status(400).json({ error: '日期格式須為 YYYY-MM-DD' });
  if (end_date < start_date) return res.status(400).json({ error: '結束日期不能早於開始日期' });
  db.prepare('UPDATE periods SET start_date = ?, end_date = ? WHERE id = ?')
    .run(start_date, end_date, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', userCtx, (req, res) => {
  const p = db.prepare('SELECT id FROM periods WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!p) return res.status(404).json({ error: '區間不存在' });
  db.prepare('DELETE FROM periods WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/summary', userCtx, (req, res) => {
  const p = db.prepare('SELECT * FROM periods WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!p) return res.status(404).json({ error: '區間不存在' });
  const prev = db.prepare(`
    SELECT * FROM periods
    WHERE user_id = ? AND date(end_date) < date(?)
    ORDER BY date(end_date) DESC LIMIT 1
  `).get(req.userId, p.start_date);
  res.json({
    period: p,
    summary: summarize(req.userId, p.start_date, p.end_date),
    previous: prev
      ? { period: prev, summary: summarize(req.userId, prev.start_date, prev.end_date) }
      : null,
  });
});

module.exports = router;
