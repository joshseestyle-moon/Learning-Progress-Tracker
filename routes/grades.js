const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');

router.get('/', userCtx, (req, res) => {
  let sql = `SELECT g.*, s.name AS subject_name, s.color AS subject_color
             FROM grades g JOIN subjects s ON s.id = g.subject_id
             WHERE g.user_id = ?`;
  const params = [req.userId];
  if (req.query.subject_id) { sql += ' AND g.subject_id = ?'; params.push(req.query.subject_id); }
  sql += ' ORDER BY g.exam_date ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', userCtx, (req, res) => {
  const { subject_id, exam_id, exam_name, exam_date, score, max_score = 100, notes } = req.body;
  if (!subject_id || !exam_name || !exam_date || score === undefined)
    return res.status(400).json({ error: '缺少必要欄位' });
  const result = db.prepare(
    'INSERT INTO grades (user_id,subject_id,exam_id,exam_name,exam_date,score,max_score,notes) VALUES (?,?,?,?,?,?,?,?)'
  ).run(req.userId, subject_id, exam_id || null, exam_name, exam_date, score, max_score, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', userCtx, (req, res) => {
  const g = db.prepare('SELECT * FROM grades WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!g) return res.status(404).json({ error: '不存在' });
  const { subject_id, exam_id, exam_name, exam_date, score, max_score, notes } = req.body;
  db.prepare('UPDATE grades SET subject_id=?,exam_id=?,exam_name=?,exam_date=?,score=?,max_score=?,notes=? WHERE id=?')
    .run(
      subject_id || g.subject_id,
      exam_id !== undefined ? (exam_id || null) : g.exam_id,
      exam_name || g.exam_name,
      exam_date || g.exam_date,
      score !== undefined ? score : g.score,
      max_score !== undefined ? max_score : g.max_score,
      notes !== undefined ? notes : g.notes,
      req.params.id
    );
  res.json({ ok: true });
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM grades WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
