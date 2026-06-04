const router  = require('express').Router();
const db      = require('../db/db');
const userCtx = require('../middleware/userContext');
const BADGES  = require('../badges/definitions');
const { getBalance } = require('../utils/points');

const RARITY_PTS = { common: 10, uncommon: 25, rare: 50, epic: 100 };
const _badgeMap  = new Map(BADGES.map(b => [b.id, { name: b.name, icon: b.icon }]));

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

const redeemTx = db.transaction((userId, item, now) => {
  const balance = getBalance(userId);
  if (balance < item.cost) return null;
  db.prepare('INSERT INTO point_log (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)').run(userId, -item.cost, 'redeem:' + item.id, now);
  db.prepare('INSERT INTO redemption_log (user_id, item_name, cost, redeemed_at) VALUES (?, ?, ?, ?)').run(userId, item.name, item.cost, now);
  return balance - item.cost;
});

router.post('/redeem/:id', userCtx, (req, res) => {
  const item = db.prepare('SELECT * FROM reward_items WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!item) return res.status(404).json({ error: '獎勵不存在' });
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newBalance = redeemTx(req.userId, item, now);
  if (newBalance === null) return res.status(400).json({ error: '點數不足' });
  res.json({ ok: true, points: newBalance });
});

router.get('/history', userCtx, (req, res) => {
  const rows = db.prepare(`
    SELECT
      pl.id,
      pl.delta,
      pl.reason,
      pl.created_at,
      SUM(pl.delta) OVER (ORDER BY pl.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance,
      CASE
        WHEN pl.reason LIKE 'exchange:%' THEN COALESCE(bel.badge_name, pl.reason)
        WHEN pl.reason LIKE 'redeem:%'   THEN COALESCE(ri.name, rl.item_name, '(已刪除獎勵)')
        ELSE pl.reason
      END AS display_name,
      CASE
        WHEN pl.reason LIKE 'exchange:%' THEN COALESCE(bel.badge_icon, '🏅')
        WHEN pl.reason LIKE 'redeem:%'   THEN '🛍️'
        ELSE '📝'
      END AS display_icon
    FROM point_log pl
    LEFT JOIN badge_exchange_log bel
      ON bel.user_id = pl.user_id
      AND 'exchange:' || bel.badge_id = pl.reason
      AND bel.exchanged_at = pl.created_at
    LEFT JOIN reward_items ri
      ON pl.reason LIKE 'redeem:%'
      AND ri.id = CAST(SUBSTR(pl.reason, 8) AS INTEGER)
    LEFT JOIN redemption_log rl
      ON pl.reason LIKE 'redeem:%'
      AND rl.user_id = pl.user_id
      AND rl.redeemed_at = pl.created_at
    WHERE pl.user_id = ?
    ORDER BY pl.id DESC
    LIMIT 300
  `).all(req.userId);

  // Enrich legacy badge:* entries (pre-v2.8) with badge name/icon from definitions
  rows.forEach(r => {
    if (r.reason && r.reason.startsWith('badge:')) {
      const def = _badgeMap.get(r.reason.slice(6));
      if (def) { r.display_name = def.name; r.display_icon = def.icon; }
    }
  });

  res.json(rows);
});

module.exports = router;
