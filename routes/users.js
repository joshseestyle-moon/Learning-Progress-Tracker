const router = require('express').Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, name, avatar_color, is_admin FROM users ORDER BY id').all();
  res.json(users);
});

router.post('/', (req, res) => {
  const { name, avatar_color = '#6c8ebf', is_admin = 0 } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '名稱不能為空' });
  const result = db.prepare(
    'INSERT INTO users (name, avatar_color, is_admin) VALUES (?, ?, ?)'
  ).run(name.trim(), avatar_color, is_admin ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), avatar_color, is_admin });
});

router.put('/:id', (req, res) => {
  const { name, avatar_color } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '使用者不存在' });
  db.prepare('UPDATE users SET name = ?, avatar_color = ? WHERE id = ?')
    .run(name || user.name, avatar_color || user.avatar_color, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
