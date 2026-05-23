const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');

router.get('/', userCtx, (req, res) => {
  res.json(db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY id').all(req.userId));
});

router.post('/', userCtx, (req, res) => {
  const { name, color = '#4a90d9' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '科目名稱不能為空' });
  const result = db.prepare('INSERT INTO subjects (user_id, name, color) VALUES (?, ?, ?)')
    .run(req.userId, name.trim(), color);
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), color });
});

router.put('/:id', userCtx, (req, res) => {
  const { name, color } = req.body;
  const s = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!s) return res.status(404).json({ error: '科目不存在' });
  db.prepare('UPDATE subjects SET name = ?, color = ? WHERE id = ?')
    .run(name || s.name, color || s.color, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', userCtx, (req, res) => {
  const s = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!s) return res.status(404).json({ error: '科目不存在' });
  db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
