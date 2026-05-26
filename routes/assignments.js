const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { checkBadges } = require('../badges/checker');

router.get('/', userCtx, (req, res) => {
  let sql = `SELECT a.*, s.name AS subject_name, s.color AS subject_color
             FROM assignments a JOIN subjects s ON s.id = a.subject_id
             WHERE a.user_id = ?`;
  const params = [req.userId];

  if (req.query.upcoming) {
    const n = Math.max(1, Math.min(365, parseInt(req.query.upcoming) || 3));
    const limit = new Date();
    limit.setDate(limit.getDate() + n);
    const limitStr = limit.toISOString().slice(0, 10);
    sql += ` AND a.due_date >= date('now','localtime') AND a.due_date <= ? AND a.is_done = 0`;
    params.push(limitStr);
  }
  sql += ' ORDER BY a.due_date ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', userCtx, (req, res) => {
  const { subject_id, title, description, due_date } = req.body;
  if (!subject_id || !title || !due_date) return res.status(400).json({ error: '缺少必要欄位' });
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在' });
  const result = db.prepare(
    'INSERT INTO assignments (user_id,subject_id,title,description,due_date) VALUES (?,?,?,?,?)'
  ).run(req.userId, subject_id, title, description || null, due_date);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', userCtx, (req, res) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!a) return res.status(404).json({ error: '不存在' });
  const { subject_id, title, description, due_date, is_done } = req.body;
  const finalDone = is_done !== undefined ? (is_done ? 1 : 0) : a.is_done;
  db.prepare(`UPDATE assignments SET subject_id=?,title=?,description=?,due_date=?,is_done=?,updated_at=datetime('now') WHERE id=?`)
    .run(
      subject_id !== undefined ? subject_id : a.subject_id,
      title || a.title,
      description !== undefined ? description : a.description,
      due_date || a.due_date,
      finalDone,
      req.params.id
    );
  const newBadges = (finalDone && !a.is_done) ? checkBadges(req.userId) : [];
  res.json({ ok: true, newBadges });
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM assignments WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
