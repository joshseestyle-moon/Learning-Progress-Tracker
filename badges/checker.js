const db     = require('../db/db');
const BADGES = require('./definitions');

const RARITY_PTS = { common: 10, uncommon: 25, rare: 50, epic: 100 };

function computeMaxStreak(sortedDates) {
  if (!sortedDates.length) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const a = new Date(sortedDates[i - 1]);
    const b = new Date(sortedDates[i]);
    const diffDays = Math.round((b - a) / 86400000);
    if (diffDays === 1) { cur++; if (cur > max) max = cur; }
    else if (diffDays > 1) cur = 1;
  }
  return max;
}

function checkBadges(userId) {
  const earned = new Set(
    db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId).map(r => r.badge_id)
  );

  const newlyEarned = [];

  function award(badgeId) {
    if (earned.has(badgeId)) return;
    db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badgeId);
    earned.add(badgeId);
    const def = BADGES.find(b => b.id === badgeId);
    if (def) {
      newlyEarned.push(def);
      db.prepare('INSERT INTO point_log (user_id, delta, reason) VALUES (?, ?, ?)').run(userId, RARITY_PTS[def.rarity] || 10, 'badge:' + badgeId);
    }
  }

  // ── 習慣類 ──
  const logCount = db.prepare('SELECT COUNT(*) AS c FROM study_log WHERE user_id = ?').get(userId).c;
  if (logCount >= 1) award('first_log');

  const logDates = db.prepare(
    'SELECT DISTINCT log_date FROM study_log WHERE user_id = ? ORDER BY log_date ASC'
  ).all(userId).map(r => r.log_date);
  const maxStreak = computeMaxStreak(logDates);
  if (maxStreak >= 3)  award('streak_3');
  if (maxStreak >= 7)  award('streak_7');
  if (maxStreak >= 14) award('streak_14');
  if (maxStreak >= 30) award('streak_30');

  // ── 努力類 ──
  const totalMinutes = db.prepare('SELECT COALESCE(SUM(minutes),0) AS m FROM study_log WHERE user_id = ?').get(userId).m;
  if (totalMinutes >= 600)  award('hours_10');
  if (totalMinutes >= 3000) award('hours_50');
  if (totalMinutes >= 6000) award('hours_100');

  // ── 完成類 ──
  const doneAssignments = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE user_id = ? AND is_done = 1').get(userId).c;
  if (doneAssignments >= 1)  award('first_assignment');
  if (doneAssignments >= 20) award('assignments_20');

  const doneChapters = db.prepare('SELECT COUNT(*) AS c FROM chapter_progress WHERE user_id = ? AND is_done = 1').get(userId).c;
  if (doneChapters >= 1)  award('first_chapter');
  if (doneChapters >= 10) award('chapters_10');

  // subject_complete: a subject where every chapter has preview is_done=1
  const subjectComplete = db.prepare(`
    SELECT COUNT(*) AS c FROM subjects s
    WHERE s.user_id = ?
      AND (SELECT COUNT(*) FROM chapters ch WHERE ch.subject_id = s.id) > 0
      AND (SELECT COUNT(*) FROM chapters ch WHERE ch.subject_id = s.id)
        = (SELECT COUNT(*) FROM chapter_progress cp
           JOIN chapters ch ON ch.id = cp.chapter_id
           WHERE ch.subject_id = s.id AND cp.user_id = ? AND cp.type = 'preview' AND cp.is_done = 1)
  `).get(userId, userId).c;
  if (subjectComplete >= 1) award('subject_complete');

  // ── 成績類 ──
  const gradeCount = db.prepare('SELECT COUNT(*) AS c FROM grades WHERE user_id = ?').get(userId).c;
  if (gradeCount >= 1) award('first_grade');

  const perfect = db.prepare('SELECT COUNT(*) AS c FROM grades WHERE user_id = ? AND score >= max_score AND max_score > 0').get(userId).c;
  if (perfect >= 1) award('perfect_score');

  const improve = db.prepare(`
    SELECT 1 FROM grades g1
    JOIN grades g2 ON g2.subject_id = g1.subject_id AND g2.user_id = g1.user_id
    WHERE g1.user_id = ?
      AND g2.exam_date > g1.exam_date
      AND (CAST(g2.score AS REAL) / g2.max_score) > (CAST(g1.score AS REAL) / g1.max_score)
    LIMIT 1
  `).get(userId);
  if (improve) award('grade_improve');

  return newlyEarned;
}

module.exports = { checkBadges };
