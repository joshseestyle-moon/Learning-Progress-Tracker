const router  = require('express').Router();
const db      = require('../db/db');
const userCtx = require('../middleware/userContext');
const BADGES  = require('../badges/definitions');
const { getBalance } = require('../utils/points');
const { clampText, LIMITS } = require('../utils/validate');

const RARITY_PTS = { common: 10, uncommon: 25, rare: 50, epic: 100 };
const VALID_CATEGORIES = ['習慣', '努力', '完成', '成績', '自訂'];

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

// ── Custom badge CRUD ──────────────────────────────────────────
router.post('/custom', userCtx, (req, res) => {
  const { value: name, tooLong: nameTooLong } = clampText(req.body.name, LIMITS.name);
  const icon     = (req.body.icon || '🏅').trim().slice(0, 8) || '🏅';
  const { value: desc, tooLong: descTooLong } = clampText(req.body.desc, LIMITS.note);
  const points   = Math.max(0, parseInt(req.body.points) || 0);
  const category = VALID_CATEGORIES.includes(req.body.category) ? req.body.category : '自訂';
  if (!name) return res.status(400).json({ error: '請輸入成就名稱' });
  if (nameTooLong || descTooLong) return res.status(400).json({ error: '成就名稱或說明過長' });

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

  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
  const exchangedToday = db.prepare(
    "SELECT id FROM badge_exchange_log WHERE user_id = ? AND badge_id = ? AND date(exchanged_at, 'localtime') = ?"
  ).get(req.userId, 'custom_' + req.params.id, today);
  if (exchangedToday) return res.status(400).json({ error: '今天已兌換過此成就，明天才能再次達成' });

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

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const exchangeTx = db.transaction(() => {
    db.prepare('DELETE FROM custom_badge_earned WHERE user_id = ? AND custom_badge_id = ?').run(req.userId, req.params.id);
    if (row.points > 0) {
      db.prepare('INSERT INTO point_log (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)').run(req.userId, row.points, 'exchange:custom_' + row.id, now);
    }
    db.prepare('INSERT INTO badge_exchange_log (user_id, badge_id, badge_name, badge_icon, points, exchanged_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.userId, 'custom_' + row.id, row.name, row.icon, row.points, now);
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

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const exchangeTx = db.transaction(() => {
    db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(req.userId, req.params.badgeId);
    db.prepare('INSERT INTO point_log (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)').run(req.userId, points, 'exchange:' + def.id, now);
    db.prepare('INSERT INTO badge_exchange_log (user_id, badge_id, badge_name, badge_icon, points, exchanged_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.userId, def.id, def.name, def.icon, points, now);
    return getBalance(req.userId);
  });

  res.json({ ok: true, points: exchangeTx() });
});

module.exports = router;
