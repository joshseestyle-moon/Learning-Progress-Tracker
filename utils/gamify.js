// Gamification hub. processActivity(userId, event) is the single entry point
// that replaced the bare checkBadges() calls in the activity routes: it grants
// XP (× combo multiplier), rolls the once-per-day surprise, auto-completes
// chapter/grade goals, then runs the badge checker.
//
// Event shapes:
//   { type: 'study', id, logDate, minutes }            — study_log inserted
//   { type: 'chapter', progressId }                    — a chapter session became done
//   { type: 'task', taskId, partNums, taskDone }       — daily-task parts marked done
//   { type: 'assignment', id }                         — an assignment became done
//   { type: 'grade', id }                              — a grade was recorded
//   { type: 'goal', goalId }                           — a text goal was manually completed
//
// Idempotency: repeatable toggles grant through grantOnce() keyed by a unique
// xp_log reason, so un-doing and re-doing never double-grants. The surprise is
// guaranteed once per day by daily_reward_log's UNIQUE(user_id, reward_date).
const db = require('../db/db');
const { checkBadges } = require('../badges/checker');
const { XP_RULES, levelForXp, rollSurpriseTier } = require('./xp');
const { computeComboDays, comboMultiplier } = require('./streak');
const { goalWindow, computeProgress } = require('./goalProgress');
const { metricsFor } = require('./goalMetrics');

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function totalXpOf(userId) {
  return db.prepare('SELECT COALESCE(SUM(delta),0) AS x FROM xp_log WHERE user_id = ?').get(userId).x;
}

function comboOf(userId, todayStr) {
  const user = db.prepare('SELECT daily_goal_minutes FROM users WHERE id = ?').get(userId) || {};
  const minutesByDate = {};
  for (const r of db.prepare('SELECT log_date, SUM(minutes) AS m FROM study_log WHERE user_id = ? GROUP BY log_date').all(userId)) {
    minutesByDate[r.log_date] = r.m;
  }
  const days = computeComboDays(minutesByDate, user.daily_goal_minutes || 0, todayStr);
  return { days, multiplier: comboMultiplier(days), minutesByDate, dailyGoal: user.daily_goal_minutes || 0 };
}

function processActivity(userId, event) {
  const today = localToday();
  const combo = comboOf(userId, today);
  const mult = combo.multiplier;
  const xpBefore = totalXpOf(userId);

  let gained = 0;
  let surprise = null;
  const goalsAchieved = [];

  const insertXp = db.prepare('INSERT INTO xp_log (user_id, delta, reason) VALUES (?, ?, ?)');
  const xpReasonExists = db.prepare('SELECT 1 AS x FROM xp_log WHERE user_id = ? AND reason = ? LIMIT 1');
  const grant = (base, reason) => {
    const delta = Math.round(base * mult);
    if (delta > 0) { insertXp.run(userId, delta, reason); gained += delta; }
  };
  const grantOnce = (base, reason) => {
    if (!xpReasonExists.get(userId, reason)) grant(base, reason);
  };

  const tx = db.transaction(() => {
    // 1. Direct XP for the activity itself
    if (event.type === 'study' && event.minutes > 0) {
      // Daily cap applies to raw minutes per log_date; the log row is already
      // inserted, so subtract this entry to get what was credited before it.
      const dayTotal = combo.minutesByDate[event.logDate] || event.minutes;
      const alreadyCredited = Math.min(XP_RULES.studyDailyCap, Math.max(0, dayTotal - event.minutes));
      const creditable = Math.min(event.minutes, XP_RULES.studyDailyCap - alreadyCredited);
      if (creditable > 0) grant(creditable * XP_RULES.studyPerMinute, 'study:' + event.id);
    } else if (event.type === 'chapter') {
      grantOnce(XP_RULES.chapterDone, 'chapter:' + event.progressId);
    } else if (event.type === 'task') {
      for (const n of event.partNums || []) grantOnce(XP_RULES.taskPart, `task:${event.taskId}:${n}`);
      if (event.taskDone) grantOnce(XP_RULES.taskComplete, `task:${event.taskId}:done`);
    } else if (event.type === 'goal') {
      const g = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(event.goalId, userId);
      if (g && g.is_done) grantOnce(XP_RULES.goal[g.horizon] || XP_RULES.goal.short, 'goal:' + g.id);
    }

    // 2. Once-per-day surprise on a qualifying completion
    const qualifies =
      (event.type === 'study' && event.minutes > 0) ||
      event.type === 'chapter' ||
      (event.type === 'task' && event.taskDone) ||
      event.type === 'assignment';
    if (qualifies) {
      const roll = rollSurpriseTier(event._rand); // _rand injectable for tests
      const pts = Math.round(roll.points * mult);
      const ins = db.prepare(
        'INSERT OR IGNORE INTO daily_reward_log (user_id, reward_date, tier, points) VALUES (?, ?, ?, ?)'
      ).run(userId, today, roll.tier, pts);
      if (ins.changes === 1) {
        db.prepare('INSERT INTO point_log (user_id, delta, reason) VALUES (?, ?, ?)')
          .run(userId, pts, 'surprise:' + today);
        surprise = { tier: roll.tier, points: pts };
      }
    }

    // 3. Auto-complete chapter/grade goals this event may have satisfied
    const goalType = event.type === 'chapter' ? 'chapter' : (event.type === 'grade' ? 'grade' : null);
    if (goalType) {
      const open = db.prepare('SELECT * FROM goals WHERE user_id = ? AND goal_type = ? AND is_done = 0').all(userId, goalType);
      const getPeriod = db.prepare('SELECT * FROM periods WHERE id = ?');
      for (const g of open) {
        const period = g.period_id ? getPeriod.get(g.period_id) : null;
        const { achieved } = computeProgress(g, metricsFor(userId, g, goalWindow(g, period)));
        if (achieved) {
          db.prepare('UPDATE goals SET is_done = 1, done_at = ? WHERE id = ?').run(new Date().toISOString(), g.id);
          grantOnce(XP_RULES.goal[g.horizon] || XP_RULES.goal.short, 'goal:' + g.id);
          goalsAchieved.push({ id: g.id, title: g.title, horizon: g.horizon });
        }
      }
    }
  });
  tx();

  const newBadges = checkBadges(userId);

  const total = xpBefore + gained;
  const before = levelForXp(xpBefore);
  const after = levelForXp(total);
  return {
    newBadges,
    xp: {
      gained,
      total,
      level: after.level,
      leveledUp: after.level > before.level,
      titleKey: 'level.title.' + after.titleTier,
      intoLevel: after.intoLevel,
      toNext: after.toNext,
    },
    combo: { days: combo.days, multiplier: mult },
    surprise,
    questCompleted: null, // Phase 4 (catch-up quests)
    goalsAchieved,
  };
}

// Snapshot for GET /api/gamify/status and the sidebar chip.
function getStatus(userId) {
  const today = localToday();
  const combo = comboOf(userId, today);
  const total = totalXpOf(userId);
  const lv = levelForXp(total);
  const surpriseToday = db.prepare(
    'SELECT tier, points FROM daily_reward_log WHERE user_id = ? AND reward_date = ?'
  ).get(userId, today) || null;
  return {
    total_xp: total,
    level: lv.level,
    into_level: lv.intoLevel,
    to_next: lv.toNext,
    title_key: 'level.title.' + lv.titleTier,
    combo_days: combo.days,
    combo_multiplier: combo.multiplier,
    daily_goal: combo.dailyGoal,
    surprise_today: surpriseToday,
    active_quest: null, // Phase 4
  };
}

module.exports = { processActivity, getStatus, localToday };
