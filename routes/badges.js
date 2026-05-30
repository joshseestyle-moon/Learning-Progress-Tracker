const router  = require('express').Router();
const db      = require('../db/db');
const userCtx = require('../middleware/userContext');
const BADGES  = require('../badges/definitions');

const RARITY_PTS = { common: 10, uncommon: 25, rare: 50, epic: 100 };
const VALID_CATEGORIES = ['習慣', '努力', '完成', '成績', '自訂'];

function getBalance(userId) {
  return db.prepare('SELECT COALESCE(SUM(delta),0) AS total FROM point_log WHERE user_id = ?').get(userId).total;
}

// ── System badges ──────────────────────────────────────────────
router.get('/', userCtx, (req, res) => {
  const earned = db.prepare(
    'SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC'
  ).all(req.userId);
  const earnedMap = new Map(earned.map(r => [r.badge_id, r.earned_at]));

  const system = BADGES.map(b => ({
    ...b,
    points:    RARITY_PTS[b.rarity] || 10,
    earned:    earnedMap.has(b.id),
    earned_at: earnedMap.get(b.id) || null,
    custom:    false,
  }));

  // ── Custom badges ──
  const customDefs = db.prepare(
    'SELECT * FROM custom_badges WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.userId);
  const customEarned = new Map(
    db.prepare('SELECT custom_badge_id, earned_at FROM custom_badge_earned WHERE user_id = ?')
      .all(req.userId).map(r => [r.custom_badge_id, r.earned_at])
  );

  const custom = customDefs.map(b => ({
    id:        'custom_' + b.id,
    _db_id:    b.id,
    category:  b.category || '自訂',
    icon:      b.icon,
    name:      b.name,
    desc:      b.desc,
    rarity:    'custom',
    points:    b.points,
    earned:    customEarned.has(b.id),
    earned_at: customEarned.get(b.id) || null,
    custom:    true,
  }));

  res.json([...system, ...custom]);
});

// ── Exchange history ───────────────────────────────────────────
router.get('/exchanges', userCtx, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM badge_exchange_log WHERE user_id = ? ORDER BY exchanged_at DESC'
  ).all(req.userId);
  res.json(rows);
});

// ── Custom badge CRUD ──────────────────────────────────────────
router.post('/custom', userCtx, (req, res) => {
  const name     = (req.body.name || '').trim();
  const icon     = (req.body.icon || '🏅').trim() || '🏅';
  const desc     = (req.body.desc || '').trim();
  const points   = Math.max(0, parseInt(req.body.points) || 0);
  const category = VALID_CATEGORIES.includes(req.body.category) ? req.body.category : '自訂';
  if (!name) return res.status(400).json({ error: '請輸入成就名稱' });

  const result = db.prepare(
    'INSERT INTO custom_badges (user_id, name, icon, desc, points, category) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, name, icon, desc, points, category);

  res.json({ id: result.lastInsertRowid, user_id: req.userId, name, icon, desc, points, category });
});

router.delete('/custom/:id', userCtx, (req, res) => {
  const row = db.prepare('SELECT id FROM custom_badges WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: '成就不存在' });
  // Revoke any points awarded for this badge so they can't be re-earned after recreation
  db.prepare("DELETE FROM point_log WHERE user_id = ? AND reason = ?").run(req.userId, 'exchange:custom_' + req.params.id);
  db.prepare('DELETE FROM custom_badges WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/custom/:id/earn', userCtx, (req, res) => {
  const row = db.prepare('SELECT * FROM custom_badges WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: '成就不存在' });

  const already = db.prepare(
    'SELECT id FROM custom_badge_earned WHERE user_id = ? AND custom_badge_id = ?'
  ).get(req.userId, req.params.id);
  if (already) return res.status(400).json({ error: '已完成此成就' });

  db.prepare('INSERT INTO custom_badge_earned (user_id, custom_badge_id) VALUES (?, ?)').run(req.userId, req.params.id);

  res.json({ ok: true, icon: row.icon, name: row.name });
});

// ── Exchange: custom badge → points ───────────────────────────
router.post('/custom/:id/exchange', userCtx, (req, res) => {
  const row = db.prepare('SELECT * FROM custom_badges WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: '成就不存在' });

  const earned = db.prepare(
    'SELECT id FROM custom_badge_earned WHERE user_id = ? AND custom_badge_id = ?'
  ).get(req.userId, req.params.id);
  if (!earned) return res.status(400).json({ error: '尚未達成此成就' });

  const exchangeTx = db.transaction(() => {
    db.prepare('DELETE FROM custom_badge_earned WHERE user_id = ? AND custom_badge_id = ?').run(req.userId, req.params.id);
    if (row.points > 0) {
      db.prepare('INSERT INTO point_log (user_id, delta, reason) VALUES (?, ?, ?)').run(req.userId, row.points, 'exchange:custom_' + row.id);
    }
    db.prepare('INSERT INTO badge_exchange_log (user_id, badge_id, badge_name, badge_icon, points) VALUES (?, ?, ?, ?, ?)').run(req.userId, 'custom_' + row.id, row.name, row.icon, row.points);
    return getBalance(req.userId);
  });

  res.json({ ok: true, points: exchangeTx() });
});

// ── Exchange: system badge → points ───────────────────────────
router.post('/:badgeId/exchange', userCtx, (req, res) => {
  const def = BADGES.find(b => b.id === req.params.badgeId);
  if (!def) return res.status(404).json({ error: '徽章不存在' });

  const earned = db.prepare(
    'SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?'
  ).get(req.userId, req.params.badgeId);
  if (!earned) return res.status(400).json({ error: '尚未達成此徽章' });

  const points = RARITY_PTS[def.rarity] || 10;

  const exchangeTx = db.transaction(() => {
    db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(req.userId, req.params.badgeId);
    db.prepare('INSERT INTO point_log (user_id, delta, reason) VALUES (?, ?, ?)').run(req.userId, points, 'exchange:' + def.id);
    db.prepare('INSERT INTO badge_exchange_log (user_id, badge_id, badge_name, badge_icon, points) VALUES (?, ?, ?, ?, ?)').run(req.userId, def.id, def.name, def.icon, points);
    return getBalance(req.userId);
  });

  res.json({ ok: true, points: exchangeTx() });
});

module.exports = router;
