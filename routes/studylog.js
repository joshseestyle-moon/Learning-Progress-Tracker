const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { checkBadges } = require('../badges/checker');

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
    WHERE sl.user_id = ? AND sl.log_date >= date('now', '-6 days')
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

router.post('/', userCtx, (req, res) => {
  const { subject_id, log_date, minutes, note, chapter_id } = req.body;
  if (!subject_id || !log_date || !minutes) return res.status(400).json({ error: '缺少必要欄位' });
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在' });
  const result = db.prepare(
    'INSERT INTO study_log (user_id,subject_id,log_date,minutes,note,chapter_id) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, subject_id, log_date, minutes, note || null, chapter_id || null);
  const newBadges = checkBadges(req.userId);
  res.status(201).json({ id: result.lastInsertRowid, newBadges });
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM study_log WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
