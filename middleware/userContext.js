const db = require('../db/db');

const validUserIds = new Set();

module.exports = function userContext(req, res, next) {
  const userId = parseInt(req.headers['x-user-id']);
  if (!userId) return res.status(401).json({ error: '未選擇使用者' });
  if (validUserIds.has(userId)) { req.userId = userId; return next(); }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(401).json({ error: '使用者不存在' });
  validUserIds.add(user.id);
  req.userId = user.id;
  next();
};
