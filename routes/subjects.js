const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { clampText, LIMITS } = require('../utils/validate');

router.get('/', userCtx, (req, res) => {
  res.json(db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY id').all(req.userId));
});

const CATEGORIES = ['exam', 'non_exam'];

router.post('/', userCtx, (req, res) => {
  const { color = '#4a90d9', category = 'exam' } = req.body;
  const { value: name, tooLong } = clampText(req.body.name, LIMITS.name);
  if (!name) return res.status(400).json({ error: '科目名稱不能為空' });
  if (tooLong) return res.status(400).json({ error: '科目名稱過長' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: '無效的科目類別' });
  const result = db.prepare('INSERT INTO subjects (user_id, name, color, category) VALUES (?, ?, ?, ?)')
    .run(req.userId, name, color, category);
  res.status(201).json({ id: result.lastInsertRowid, name, color, category });
});

router.put('/:id', userCtx, (req, res) => {
  const { name, color, category } = req.body;
  const s = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!s) return res.status(404).json({ error: '科目不存在' });
  if (category !== undefined && !CATEGORIES.includes(category)) return res.status(400).json({ error: '無效的科目類別' });
  db.prepare('UPDATE subjects SET name = ?, color = ?, category = ? WHERE id = ?')
    .run(name || s.name, color || s.color, category || s.category, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', userCtx, (req, res) => {
  const s = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!s) return res.status(404).json({ error: '科目不存在' });
  db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
