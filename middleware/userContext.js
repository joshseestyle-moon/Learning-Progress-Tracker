const db = require('../db/db');

module.exports = function userContext(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: '未選擇使用者' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(401).json({ error: '使用者不存在' });
  req.userId = user.id;
  next();
};
