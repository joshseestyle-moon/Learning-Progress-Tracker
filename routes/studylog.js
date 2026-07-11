const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { processActivity } = require('../utils/gamify');
const { computeCurrentStreak } = require('../utils/streak');
const { clampText, LIMITS } = require('../utils/validate');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', userCtx, (req, res) => {
  let sql = `SELECT sl.*, s.name AS subject_name, s.color AS subject_color,
             c.title AS chapter_title
             FROM study_log sl
             JOIN subjects s ON s.id = sl.subject_id
             LEFT JOIN chapters c ON c.id = sl.chapter_id
             WHERE sl.user_id = ?`;
  const params = [req.userId];
  if (req.query.from) { sql += ' AND sl.log_date >= ?'; params.push(req.query.from); }
  if (req.query.to)   { sql += ' AND sl.log_date <= ?'; params.push(req.query.to); }
  sql += ' ORDER BY sl.log_date DESC, sl.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// Weekly summary: total minutes per subject for last 7 days
router.get('/weekly', userCtx, (req, res) => {
  const rows = db.prepare(`
    SELECT s.name AS subject_name, s.color AS subject_color,
           sl.log_date, SUM(sl.minutes) AS total_minutes
    FROM study_log sl JOIN subjects s ON s.id = sl.subject_id
    WHERE sl.user_id = ? AND sl.log_date >= date('now', 'localtime', '-6 days')
    GROUP BY sl.subject_id, sl.log_date
    ORDER BY sl.log_date ASC
  `).all(req.userId);
  res.json(rows);
});

// Per-chapter total minutes (for reading progress view)
router.get('/by-chapter', userCtx, (req, res) => {
  const rows = db.prepare(`
    SELECT sl.chapter_id, SUM(sl.minutes) AS total_minutes
    FROM study_log sl
    WHERE sl.user_id = ? AND sl.chapter_id IS NOT NULL
    GROUP BY sl.chapter_id
  `).all(req.userId);
  res.json(rows);
});

// Heatmap: total minutes per day for the last N days (GitHub-style calendar)
router.get('/heatmap', userCtx, (req, res) => {
  const days = Math.max(1, Math.min(730, parseInt(req.query.days) || 365));
  const rows = db.prepare(`
    SELECT log_date, SUM(minutes) AS minutes
    FROM study_log
    WHERE user_id = ? AND log_date >= date('now','localtime',?)
    GROUP BY log_date
    ORDER BY log_date ASC
  `).all(req.userId, `-${days - 1} days`);
  res.json(rows);
});

// Monthly trend: minutes per month per subject for the last N months
router.get('/monthly', userCtx, (req, res) => {
  const months = Math.max(1, Math.min(24, parseInt(req.query.months) || 6));
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', sl.log_date) AS month,
           s.name AS subject_name, s.color AS subject_color,
           SUM(sl.minutes) AS total_minutes
    FROM study_log sl JOIN subjects s ON s.id = sl.subject_id
    WHERE sl.user_id = ? AND sl.log_date >= date('now','localtime','start of month',?)
    GROUP BY month, sl.subject_id
    ORDER BY month ASC
  `).all(req.userId, `-${months - 1} months`);
  res.json(rows);
});

// All-time summary
router.get('/summary', userCtx, (req, res) => {
  // Optional period scope: both from & to must be given, else the all-time totals.
  const { from, to } = req.query;
  if (from || to) {
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
      return res.status(400).json({ error: '日期區間格式錯誤' });
    }
  }
  let where = 'WHERE user_id = ?';
  const params = [req.userId];
  if (from && to) { where += ' AND log_date >= ? AND log_date <= ?'; params.push(from, to); }
  const total = db.prepare(`SELECT COALESCE(SUM(minutes),0) AS m FROM study_log ${where}`).get(...params).m;
  const activeDays = db.prepare(`SELECT COUNT(DISTINCT log_date) AS d FROM study_log ${where}`).get(...params).d;
  res.json({
    total_minutes: total,
    active_days: activeDays,
    avg_per_active_day: activeDays ? Math.round(total / activeDays) : 0,
  });
});

// Current study streak (consecutive days ending today or yesterday)
router.get('/streak', userCtx, (req, res) => {
  const dates = db.prepare('SELECT DISTINCT log_date FROM study_log WHERE user_id = ? ORDER BY log_date ASC')
    .all(req.userId).map(r => r.log_date);
  res.json({ streak: computeCurrentStreak(dates) });
});

// Dashboard summary: today / this week minutes vs goals + current streak (one round-trip)
router.get('/dashboard-stats', userCtx, (req, res) => {
  const todayMin = db.prepare(
    `SELECT COALESCE(SUM(minutes),0) AS m FROM study_log WHERE user_id = ? AND log_date = date('now','localtime')`
  ).get(req.userId).m;
  const weekMin = db.prepare(
    `SELECT COALESCE(SUM(minutes),0) AS m FROM study_log WHERE user_id = ? AND log_date >= date('now','localtime','-6 days')`
  ).get(req.userId).m;
  const dates = db.prepare('SELECT DISTINCT log_date FROM study_log WHERE user_id = ? ORDER BY log_date ASC')
    .all(req.userId).map(r => r.log_date);
  const user = db.prepare('SELECT daily_goal_minutes, weekly_goal_minutes FROM users WHERE id = ?').get(req.userId) || {};
  res.json({
    today_minutes: todayMin,
    week_minutes: weekMin,
    current_streak: computeCurrentStreak(dates),
    daily_goal: user.daily_goal_minutes || 0,
    weekly_goal: user.weekly_goal_minutes || 0,
  });
});

router.post('/', userCtx, (req, res) => {
  const { subject_id, log_date, minutes, chapter_id } = req.body;
  const { value: note, tooLong } = clampText(req.body.note, LIMITS.note);
  if (!subject_id || !log_date || !minutes) return res.status(400).json({ error: '缺少必要欄位' });
  if (tooLong) return res.status(400).json({ error: '備註過長' });
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在' });
  const result = db.prepare(
    'INSERT INTO study_log (user_id,subject_id,log_date,minutes,note,chapter_id) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, subject_id, log_date, minutes, note || null, chapter_id || null);
  const gamify = processActivity(req.userId, {
    type: 'study', id: result.lastInsertRowid, logDate: log_date, minutes: Number(minutes) || 0,
  });
  res.status(201).json({ id: result.lastInsertRowid, ...gamify });
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM study_log WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
