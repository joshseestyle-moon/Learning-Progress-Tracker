// Gamification hub. processActivity(userId, event) is the single entry point
// that replaced the bare checkBadges() calls in the activity routes: it grants
// XP (× combo multiplier), rolls the once-per-day surprise, auto-completes
// chapter/grade goals, then runs the badge checker.
//
// Event shapes:
//   { type: 'study', id, logDate, minutes }            — study_log inserted
//   { type: 'chapter', progressId }                    — a chapter session became done
//   { type: 'task', taskId, partNums, taskDone }       — daily-task parts marked done
//   { type: 'assignment', id }                         — a calendar event became done
//        (events grant NO XP and NO surprise — they only run the badge check;
//         the assignment-based badges still count completed events)
//   { type: 'grade', id }                              — a grade was recorded
//   { type: 'goal', goalId }                           — a text goal was manually completed
//
// Idempotency: repeatable toggles grant through grantOnce() keyed by a unique
// xp_log reason, so un-doing and re-doing never double-grants. The surprise is
// guaranteed once per day by daily_reward_log's UNIQUE(user_id, reward_date).
const db = require('../db/db');
const { checkBadges } = require('../badges/checker');
const { XP_RULES, levelForXp, rollSurpriseTier } = require('./xp');
const { computeComboDays, comboMultiplier, localToday } = require('./streak');
const { goalWindow, computeProgress } = require('./goalProgress');
const { metricsFor } = require('./goalMetrics');

function totalXpOf(userId) {
  return db.prepare('SELECT COALESCE(SUM(delta),0) AS x FROM xp_log WHERE user_id = ?').get(userId).x;
}

// Combo only depends on the trailing ~2 weeks (streak breaks after one missed
// day, multiplier caps at 10 days), so bound the scan instead of reading the
// whole study_log history on every activity/status call.
function comboOf(userId, todayStr) {
  const user = db.prepare('SELECT daily_goal_minutes FROM users WHERE id = ?').get(userId) || {};
  const minutesByDate = {};
  for (const r of db.prepare(
    "SELECT log_date, SUM(minutes) AS m FROM study_log WHERE user_id = ? AND log_date >= date('now','localtime','-15 days') GROUP BY log_date"
  ).all(userId)) {
    minutesByDate[r.log_date] = r.m;
  }
  const days = computeComboDays(minutesByDate, user.daily_goal_minutes || 0, todayStr);
  return { days, multiplier: comboMultiplier(days), minutesByDate, dailyGoal: user.daily_goal_minutes || 0 };
}

// XP accounting primitives shared by processActivity and achieveGoalOnCreate.
// grant/grantOnce apply the combo multiplier; grantRaw inserts a pre-computed
// delta (used by the study cap, which caps the post-multiplier amount).
function makeGranter(userId, mult) {
  const insertXp = db.prepare('INSERT INTO xp_log (user_id, delta, reason) VALUES (?, ?, ?)');
  const xpReasonExists = db.prepare('SELECT 1 AS x FROM xp_log WHERE user_id = ? AND reason = ? LIMIT 1');
  const state = { gained: 0 };
  const grantRaw = (delta, reason) => {
    if (delta > 0) { insertXp.run(userId, delta, reason); state.gained += delta; }
  };
  const grant = (base, reason, m = mult) => grantRaw(Math.round(base * m), reason);
  const grantOnce = (base, reason, m = mult) => {
    if (!xpReasonExists.get(userId, reason)) grant(base, reason, m);
  };
  return { grant, grantOnce, grantRaw, state };
}

function xpSummary(xpBefore, gained) {
  const total = xpBefore + gained;
  const before = levelForXp(xpBefore);
  const after = levelForXp(total);
  return {
    gained, total,
    level: after.level,
    leveledUp: after.level > before.level,
    titleKey: 'level.title.' + after.titleTier,
    intoLevel: after.intoLevel,
    toNext: after.toNext,
  };
}

// Award every open chapter/grade goal of goalType whose target is now met:
// mark done, grant horizon XP once, and append to `out`. Must run inside the
// caller's transaction; grantOnce is supplied so XP flows through its accounting.
function autoAchieveGoals(userId, goalType, grantOnce, out) {
  const open = db.prepare('SELECT * FROM goals WHERE user_id = ? AND goal_type = ? AND is_done = 0').all(userId, goalType);
  const getPeriod = db.prepare('SELECT * FROM periods WHERE id = ?');
  for (const g of open) {
    const period = g.period_id ? getPeriod.get(g.period_id) : null;
    const { achieved } = computeProgress(g, metricsFor(userId, g, goalWindow(g, period)));
    if (achieved) {
      db.prepare('UPDATE goals SET is_done = 1, done_at = ? WHERE id = ?').run(new Date().toISOString(), g.id);
      grantOnce(XP_RULES.goal[g.horizon] || XP_RULES.goal.short, 'goal:' + g.id);
      out.push({ id: g.id, title: g.title, horizon: g.horizon });
    }
  }
}

function processActivity(userId, event) {
  const today = localToday();
  const combo = comboOf(userId, today);
  const mult = combo.multiplier;
  const xpBefore = totalXpOf(userId);
  const { grant, grantOnce, grantRaw, state } = makeGranter(userId, mult);

  let surprise = null;
  let questCompleted = null;
  const goalsAchieved = [];

  const tx = db.transaction(() => {
    // 1. Direct XP for the activity itself
    if (event.type === 'study' && event.minutes > 0) {
      // Daily cap: derive "study XP already emitted this calendar day" from
      // xp_log itself (not from study_log rows), so deleting + re-adding a log
      // can't reset the cap (F6). Backdated entries (logDate ≠ today) earn no
      // combo multiplier (F7) — they still earn base XP, just not today's bonus.
      const studyXpToday = db.prepare(
        "SELECT COALESCE(SUM(delta),0) AS x FROM xp_log WHERE user_id = ? AND reason LIKE 'study:%' AND date(created_at,'localtime') = ?"
      ).get(userId, today).x;
      const remaining = XP_RULES.studyDailyCap - studyXpToday;
      if (remaining > 0) {
        const studyMult = event.logDate === today ? mult : 1;
        const base = event.minutes * XP_RULES.studyPerMinute;
        const delta = Math.min(Math.round(base * studyMult), remaining);
        grantRaw(delta, 'study:' + event.id);
      }
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
      (event.type === 'task' && event.taskDone);
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
    if (goalType) autoAchieveGoals(userId, goalType, grantOnce, goalsAchieved);

    // 4. Catch-up quest progress — chapter/task completions may clear snapshot items
    if (event.type === 'chapter' || event.type === 'task') {
      const quest = getActiveQuest(userId, today);
      if (quest && questProgress(quest) >= quest.target_count) {
        db.prepare("UPDATE catchup_quests SET status = 'completed', completed_at = ? WHERE id = ?")
          .run(new Date().toISOString(), quest.id);
        // bonus points are flat (combo multiplier only applies to XP and surprise)
        db.prepare('INSERT INTO point_log (user_id, delta, reason) VALUES (?, ?, ?)')
          .run(userId, quest.bonus_points, 'quest:' + quest.id);
        const gainedBefore = state.gained;
        grantOnce(quest.bonus_xp, 'quest:' + quest.id);
        questCompleted = {
          id: quest.id,
          title: quest.title,
          bonusPoints: quest.bonus_points,
          bonusXp: state.gained - gainedBefore,
        };
      }
    }
  });
  tx();

  // Badge checks run full-table scans — skip them for no-op events (a part
  // toggled that granted nothing and completed nothing). Every non-'task' event
  // is badge-relevant; 'task' events only when they granted or completed
  // something. Combo days are already computed above, so pass them through to
  // spare checkBadges a second full-history scan (F10).
  const badgeRelevant = event.type !== 'task' || state.gained > 0 || !!surprise
    || !!questCompleted || !!event.taskDone;
  const newBadges = badgeRelevant ? checkBadges(userId, { comboDays: combo.days }) : [];

  return {
    newBadges,
    xp: xpSummary(xpBefore, state.gained),
    combo: { days: combo.days, multiplier: mult },
    surprise,
    questCompleted,
    goalsAchieved,
  };
}

// Called by POST /api/goals right after a chapter/grade goal is created: if its
// target is already satisfied by pre-existing progress, award it immediately so
// the reward isn't silently lost (F1). Text goals go through their manual toggle.
function achieveGoalOnCreate(userId, goalId) {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ? AND is_done = 0').get(goalId, userId);
  if (!goal || (goal.goal_type !== 'chapter' && goal.goal_type !== 'grade')) return { goalsAchieved: [] };

  const mult = comboOf(userId, localToday()).multiplier;
  const xpBefore = totalXpOf(userId);
  const { grantOnce, state } = makeGranter(userId, mult);
  const goalsAchieved = [];
  db.transaction(() => autoAchieveGoals(userId, goal.goal_type, grantOnce, goalsAchieved))();

  if (!goalsAchieved.length) return { goalsAchieved: [] };
  return {
    goalsAchieved,
    xp: xpSummary(xpBefore, state.gained),
    newBadges: checkBadges(userId),
  };
}

// Pre-check for POST /goals: would a chapter/grade goal with these (validated,
// not-yet-inserted) fields be satisfied the instant it's created? Mirrors the
// window/threshold math autoAchieveGoals uses, read-only — no goal row exists
// yet, so it never touches the DB beyond lookups. Lets the route ask for
// confirmation instead of silently awarding progress that predates the goal.
function wouldAlreadyBeAchieved(userId, goal) {
  if (goal.goal_type !== 'chapter' && goal.goal_type !== 'grade') return false;
  const period = goal.period_id
    ? db.prepare('SELECT * FROM periods WHERE id = ? AND user_id = ?').get(goal.period_id, userId)
    : null;
  // No real created_at yet (the goal isn't inserted) — synthesize "now" in the
  // same UTC format the column's DEFAULT would produce. goalWindow only reads
  // it when there's no linked period.
  const nowTs = db.prepare("SELECT datetime('now') AS n").get().n;
  const synthetic = { ...goal, created_at: nowTs };
  const window = goalWindow(synthetic, period);
  return computeProgress(synthetic, metricsFor(userId, synthetic, window)).achieved;
}

// Single source of truth for the active quest: returns it if still inside the
// deadline, otherwise lazily flips it to 'expired' (no penalty) and returns null.
function getActiveQuest(userId, todayStr) {
  const q = db.prepare("SELECT * FROM catchup_quests WHERE user_id = ? AND status = 'active'").get(userId);
  if (!q) return null;
  if (q.deadline_date < todayStr) {
    db.prepare("UPDATE catchup_quests SET status = 'expired' WHERE id = ?").run(q.id);
    return null;
  }
  return q;
}

// Completed count among a quest's snapshot items (shared with routes/catchup.js).
function questProgress(quest) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM catchup_quest_items qi JOIN chapter_progress cp ON cp.id = qi.item_id
        WHERE qi.quest_id = ? AND qi.kind = 'chapter' AND cp.is_done = 1)
      +
      (SELECT COUNT(*) FROM catchup_quest_items qi JOIN daily_tasks dt ON dt.id = qi.item_id
        WHERE qi.quest_id = ? AND qi.kind = 'task' AND dt.is_done = 1) AS done
  `).get(quest.id, quest.id).done;
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
  const quest = getActiveQuest(userId, today);
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
    active_quest: quest ? { ...quest, done_count: questProgress(quest) } : null,
  };
}

module.exports = { processActivity, achieveGoalOnCreate, wouldAlreadyBeAchieved, getStatus, localToday, questProgress, getActiveQuest };
