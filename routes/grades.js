const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { checkBadges } = require('../badges/checker');
const { clampText, LIMITS } = require('../utils/validate');

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
  const { subject_id, exam_id, exam_date, score, max_score = 100, class_rank } = req.body;
  const { value: exam_name, tooLong: nameTooLong } = clampText(req.body.exam_name, LIMITS.title);
  const { value: notes, tooLong: notesTooLong } = clampText(req.body.notes, LIMITS.note);
  if (!subject_id || !exam_name || !exam_date || score === undefined)
    return res.status(400).json({ error: '缺少必要欄位' });
  if (nameTooLong || notesTooLong) return res.status(400).json({ error: '名稱或備註過長' });
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在' });
  const result = db.prepare(
    'INSERT INTO grades (user_id,subject_id,exam_id,exam_name,exam_date,score,max_score,notes,class_rank) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(req.userId, subject_id, exam_id || null, exam_name, exam_date, score, max_score, notes || null, class_rank || null);
  const newBadges = checkBadges(req.userId);
  res.status(201).json({ id: result.lastInsertRowid, newBadges });
});

router.put('/:id', userCtx, (req, res) => {
  const g = db.prepare('SELECT * FROM grades WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!g) return res.status(404).json({ error: '不存在' });
  const { subject_id, exam_id, exam_name, exam_date, score, max_score, notes, class_rank } = req.body;
  db.prepare('UPDATE grades SET subject_id=?,exam_id=?,exam_name=?,exam_date=?,score=?,max_score=?,notes=?,class_rank=? WHERE id=?')
    .run(
      subject_id || g.subject_id,
      exam_id !== undefined ? (exam_id || null) : g.exam_id,
      exam_name || g.exam_name,
      exam_date || g.exam_date,
      score !== undefined ? score : g.score,
      max_score !== undefined ? max_score : g.max_score,
      notes !== undefined ? notes : g.notes,
      class_rank !== undefined ? (class_rank || null) : g.class_rank,
      req.params.id
    );
  res.json({ ok: true });
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM grades WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
