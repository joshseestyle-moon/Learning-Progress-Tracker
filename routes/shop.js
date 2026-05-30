const router  = require('express').Router();
const db      = require('../db/db');
const userCtx = require('../middleware/userContext');

function getBalance(userId) {
  return db.prepare('SELECT COALESCE(SUM(delta),0) AS total FROM point_log WHERE user_id = ?').get(userId).total;
}

router.get('/points', userCtx, (req, res) => {
  res.json({ points: getBalance(req.userId) });
});

router.get('/items', userCtx, (req, res) => {
  const items = db.prepare('SELECT * FROM reward_items WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(items);
});

router.post('/items', userCtx, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '請輸入獎勵名稱' });
  const cost = Math.max(0, parseInt(req.body.cost) || 0);
  const result = db.prepare('INSERT INTO reward_items (user_id, name, cost) VALUES (?, ?, ?)').run(req.userId, name, cost);
  res.json({ id: result.lastInsertRowid, user_id: req.userId, name, cost });
});

router.delete('/items/:id', userCtx, (req, res) => {
  const item = db.prepare('SELECT id FROM reward_items WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!item) return res.status(404).json({ error: '獎勵不存在' });
  db.prepare('DELETE FROM reward_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const redeemTx = db.transaction((userId, item) => {
  const balance = getBalance(userId);
  if (balance < item.cost) return null;
  db.prepare('INSERT INTO point_log (user_id, delta, reason) VALUES (?, ?, ?)').run(userId, -item.cost, 'redeem:' + item.id);
  db.prepare('INSERT INTO redemption_log (user_id, item_name, cost) VALUES (?, ?, ?)').run(userId, item.name, item.cost);
  return balance - item.cost;
});

router.post('/redeem/:id', userCtx, (req, res) => {
  const item = db.prepare('SELECT * FROM reward_items WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!item) return res.status(404).json({ error: '獎勵不存在' });
  const newBalance = redeemTx(req.userId, item);
  if (newBalance === null) return res.status(400).json({ error: '點數不足' });
  res.json({ ok: true, points: newBalance });
});

router.get('/history', userCtx, (req, res) => {
  const rows = db.prepare(
    'SELECT item_name, cost, redeemed_at FROM redemption_log WHERE user_id = ? ORDER BY redeemed_at DESC'
  ).all(req.userId);
  res.json(rows);
});

module.exports = router;
