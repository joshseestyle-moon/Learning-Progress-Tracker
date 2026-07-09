const db = require('../db/db');

// Single source of truth for badge-rarity point values (previously duplicated
// in badges/checker.js, routes/badges.js, routes/shop.js; db.js keeps its own
// frozen copy inside the already-shipped Migration 11 backfill).
const RARITY_PTS = { common: 10, uncommon: 25, rare: 50, epic: 100 };

function getBalance(userId) {
  return db.prepare('SELECT COALESCE(SUM(delta),0) AS total FROM point_log WHERE user_id = ?').get(userId).total;
}

module.exports = { getBalance, RARITY_PTS };
