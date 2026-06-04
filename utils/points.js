const db = require('../db/db');

function getBalance(userId) {
  return db.prepare('SELECT COALESCE(SUM(delta),0) AS total FROM point_log WHERE user_id = ?').get(userId).total;
}

module.exports = { getBalance };
