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

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Fetch all badges already exchanged today in one query instead of one-per-badge
  const exchangedTodaySet = new Set(
    db.prepare("SELECT badge_id FROM badge_exchange_log WHERE user_id = ? AND date(exchanged_at,'localtime') = ?")
      .all(userId, today).map(r => r.badge_id)
  );

  function award(badgeId) {
    if (earned.has(badgeId) || exchangedTodaySet.has(badgeId)) return;
    db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badgeId);
    earned.add(badgeId);
    const def = BADGES.find(b => b.id === badgeId);
    if (def) newlyEarned.push(def);
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
    WITH chapter_counts AS (
      SELECT ch.subject_id,
             COUNT(*) AS total,
             COUNT(CASE WHEN cp.is_done=1 AND cp.type='preview' AND cp.user_id=? THEN 1 END) AS done
      FROM chapters ch
      LEFT JOIN chapter_progress cp ON cp.chapter_id = ch.id
      GROUP BY ch.subject_id
    )
    SELECT COUNT(*) AS c FROM subjects s
    JOIN chapter_counts cc ON cc.subject_id = s.id
    WHERE s.user_id = ? AND cc.total > 0 AND cc.total = cc.done
  `).get(userId, userId).c;
  if (subjectComplete >= 1) award('subject_complete');

  // ── 作業類 ──
  // Dates where user had ≥1 task and all were done
  const hwDoneDates = db.prepare(`
    SELECT task_date FROM daily_tasks
    WHERE user_id = ?
    GROUP BY task_date
    HAVING COUNT(*) > 0 AND SUM(CASE WHEN is_done = 0 THEN 1 ELSE 0 END) = 0
    ORDER BY task_date ASC
  `).all(userId).map(r => r.task_date);

  if (hwDoneDates.length >= 1)  award('hw_day_1');
  if (hwDoneDates.length >= 10) award('hw_days_10');

  const hwStreak = computeMaxStreak(hwDoneDates);
  if (hwStreak >= 3) award('hw_streak_3');
  if (hwStreak >= 7) award('hw_streak_7');

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
