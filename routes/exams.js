const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');

router.get('/', userCtx, (req, res) => {
  let sql = `SELECT e.*, s.name AS subject_name, s.color AS subject_color,
             CAST(julianday(e.exam_date) - julianday('now','localtime') AS INTEGER) AS days_left
             FROM exams e JOIN subjects s ON s.id = e.subject_id
             WHERE e.user_id = ?`;
  const params = [req.userId];
  if (req.query.upcoming) {
    const n = Math.max(1, Math.min(100, parseInt(req.query.upcoming) || 3));
    sql += ` AND e.is_completed = 0 AND e.exam_date >= date('now','localtime') ORDER BY e.exam_date ASC LIMIT ?`;
    params.push(n);
  } else {
    sql += ' ORDER BY e.exam_date ASC';
  }
  res.json(db.prepare(sql).all(...params));
});

router.post('/', userCtx, (req, res) => {
  const { subject_id, title, exam_date, exam_type = 'quiz', notes } = req.body;
  if (!subject_id || !title || !exam_date) return res.status(400).json({ error: '缺少必要欄位' });
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在' });
  const validTypes = ['quiz','segment','midterm','final','mock'];
  if (!validTypes.includes(exam_type)) return res.status(400).json({ error: '無效的考試類型' });
  const result = db.prepare(
    'INSERT INTO exams (user_id,subject_id,title,exam_date,exam_type,notes) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, subject_id, title, exam_date, exam_type, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', userCtx, (req, res) => {
  const e = db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!e) return res.status(404).json({ error: '不存在' });
  const { subject_id, title, exam_date, exam_type, is_completed, notes } = req.body;
  db.prepare(`UPDATE exams SET subject_id=?,title=?,exam_date=?,exam_type=?,is_completed=?,notes=?,updated_at=datetime('now') WHERE id=?`)
    .run(
      subject_id !== undefined ? subject_id : e.subject_id,
      title || e.title,
      exam_date || e.exam_date,
      exam_type || e.exam_type,
      is_completed !== undefined ? (is_completed ? 1 : 0) : e.is_completed,
      notes !== undefined ? notes : e.notes,
      req.params.id
    );
  res.json({ ok: true });
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM exams WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
