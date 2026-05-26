const router  = require('express').Router();
const db      = require('../db/db');
const userCtx = require('../middleware/userContext');
const BADGES  = require('../badges/definitions');

router.get('/', userCtx, (req, res) => {
  const earned = db.prepare(
    'SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC'
  ).all(req.userId);
  const earnedMap = new Map(earned.map(r => [r.badge_id, r.earned_at]));

  res.json(BADGES.map(b => ({
    ...b,
    earned:    earnedMap.has(b.id),
    earned_at: earnedMap.get(b.id) || null,
  })));
});

module.exports = router;
