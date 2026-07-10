const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const BADGES = require('../badges/definitions');
const { computeMaxStreak, localToday } = require('../utils/streak');
const { levelForXp } = require('../utils/xp');
const { lastWeekRange, prevRange } = require('../utils/reportRange');
const { pickRecapHighlight } = require('../utils/recapHighlight');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 400; // covers a full 366-day school year with slack; caps runaway scans

// The six core counts shared by the report overview and the weekly recap.
// Bare-DATE columns (log_date, task_date) compare directly; UTC timestamps
// (done_at, created_at) go through date(col,'localtime').
function aggregateRange(userId, from, to) {
  const study = db.prepare(
    'SELECT COALESCE(SUM(minutes),0) AS minutes, COUNT(DISTINCT log_date) AS active_days FROM study_log WHERE user_id = ? AND log_date BETWEEN ? AND ?'
  ).get(userId, from, to);
  const chapters = db.prepare(
    "SELECT COUNT(*) AS c FROM chapter_progress WHERE user_id = ? AND is_done = 1 AND done_at IS NOT NULL AND date(done_at,'localtime') BETWEEN ? AND ?"
  ).get(userId, from, to).c;
  const tasks = db.prepare(
    'SELECT COUNT(*) AS c FROM daily_tasks WHERE user_id = ? AND is_done = 1 AND task_date BETWEEN ? AND ?'
  ).get(userId, from, to).c;
  const goals = db.prepare(
    "SELECT COUNT(*) AS c FROM goals WHERE user_id = ? AND is_done = 1 AND done_at IS NOT NULL AND date(done_at,'localtime') BETWEEN ? AND ?"
  ).get(userId, from, to).c;
  const xp = db.prepare(
    "SELECT COALESCE(SUM(delta),0) AS x FROM xp_log WHERE user_id = ? AND reason NOT LIKE 'backfill:%' AND date(created_at,'localtime') BETWEEN ? AND ?"
  ).get(userId, from, to).x;
  return { minutes: study.minutes, active_days: study.active_days, chapters, tasks, goals, xp };
}

function badgesInRange(userId, from, to) {
  const defs = new Map(BADGES.map(b => [b.id, b]));
  const out = db.prepare(
    "SELECT badge_id, date(earned_at,'localtime') AS d FROM user_badges WHERE user_id = ? AND date(earned_at,'localtime') BETWEEN ? AND ?"
  ).all(userId, from, to).map(r => {
    const def = defs.get(r.badge_id) || {};
    return { id: r.badge_id, name: def.name || r.badge_id, icon: def.icon || '🏅', rarity: def.rarity || 'common', earned_date: r.d, custom: false };
  });
  for (const r of db.prepare(
    "SELECT cb.name, cb.icon, date(cbe.earned_at,'localtime') AS d FROM custom_badge_earned cbe JOIN custom_badges cb ON cb.id = cbe.custom_badge_id WHERE cbe.user_id = ? AND date(cbe.earned_at,'localtime') BETWEEN ? AND ?"
  ).all(userId, from, to)) {
    out.push({ id: 'custom', name: r.name, icon: r.icon, rarity: 'custom', earned_date: r.d, custom: true });
  }
  return out.sort((a, b) => a.earned_date.localeCompare(b.earned_date));
}

// GET /api/report/summary?from=&to= — everything the portfolio report needs.
router.get('/summary', userCtx, (req, res) => {
  const { from, to } = req.query;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) return res.status(400).json({ error: '日期格式須為 YYYY-MM-DD' });
  if (from > to) return res.status(400).json({ error: '起始日不能晚於結束日' });
  const span = Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1;
  if (span > MAX_SPAN_DAYS) return res.status(400).json({ error: `範圍過大（上限 ${MAX_SPAN_DAYS} 天）` });
  const userId = req.userId;

  const core = aggregateRange(userId, from, to);
  const badges = badgesInRange(userId, from, to);

  const logDates = db.prepare(
    'SELECT DISTINCT log_date FROM study_log WHERE user_id = ? AND log_date BETWEEN ? AND ? ORDER BY log_date ASC'
  ).all(userId, from, to).map(r => r.log_date);
  const maxStreak = computeMaxStreak(logDates);

  // per-subject minutes + chapters completed
  const minBySub = {};
  for (const r of db.prepare(
    'SELECT subject_id, SUM(minutes) AS m FROM study_log WHERE user_id = ? AND log_date BETWEEN ? AND ? GROUP BY subject_id'
  ).all(userId, from, to)) minBySub[r.subject_id] = r.m;
  const chBySub = {};
  for (const r of db.prepare(
    "SELECT c.subject_id AS sid, COUNT(*) AS c FROM chapter_progress cp JOIN chapters c ON c.id = cp.chapter_id WHERE cp.user_id = ? AND cp.is_done = 1 AND cp.done_at IS NOT NULL AND date(cp.done_at,'localtime') BETWEEN ? AND ? GROUP BY c.subject_id"
  ).all(userId, from, to)) chBySub[r.sid] = r.c;
  const subjects = db.prepare('SELECT id, name, color FROM subjects WHERE user_id = ?').all(userId)
    .map(s => ({ subject_id: s.id, name: s.name, color: s.color, minutes: minBySub[s.id] || 0, chapters_done: chBySub[s.id] || 0 }))
    .filter(s => s.minutes > 0 || s.chapters_done > 0)
    .sort((a, b) => b.minutes - a.minutes);

  // grades aggregated per subject (pct = score/max*100), ordered by exam_date
  const gradeRows = db.prepare(
    'SELECT g.subject_id AS sid, s.name, s.color, g.score, g.max_score FROM grades g JOIN subjects s ON s.id = g.subject_id WHERE g.user_id = ? AND g.exam_date BETWEEN ? AND ? ORDER BY g.exam_date ASC, g.id ASC'
  ).all(userId, from, to);
  const gradeBySub = {};
  for (const r of gradeRows) {
    if (!(r.max_score > 0)) continue;
    const pct = r.score / r.max_score * 100;
    const g = gradeBySub[r.sid] || (gradeBySub[r.sid] = { subject_id: r.sid, name: r.name, color: r.color, pcts: [], first_pct: pct, last_pct: pct });
    g.pcts.push(pct);
    g.last_pct = pct; // rows are date-ordered, so the final assignment is the latest
  }
  const grades = Object.values(gradeBySub).map(g => ({
    subject_id: g.subject_id, name: g.name, color: g.color,
    count: g.pcts.length,
    avg_pct: Math.round(g.pcts.reduce((a, b) => a + b, 0) / g.pcts.length * 10) / 10,
    best_pct: Math.round(Math.max(...g.pcts) * 10) / 10,
    first_pct: Math.round(g.first_pct * 10) / 10,
    last_pct: Math.round(g.last_pct * 10) / 10,
  }));

  const goals = db.prepare(
    "SELECT id, title, goal_type, horizon, date(done_at,'localtime') AS done_date FROM goals WHERE user_id = ? AND is_done = 1 AND done_at IS NOT NULL AND date(done_at,'localtime') BETWEEN ? AND ? ORDER BY done_at ASC"
  ).all(userId, from, to);

  const monthly = db.prepare(
    "SELECT strftime('%Y-%m', log_date) AS ym, SUM(minutes) AS minutes FROM study_log WHERE user_id = ? AND log_date BETWEEN ? AND ? GROUP BY ym ORDER BY ym"
  ).all(userId, from, to);

  // level snapshot at generation time (computed directly — no combo scan, no
  // quest-expiry side effect that getStatus would incur in a report endpoint)
  const totalXp = db.prepare('SELECT COALESCE(SUM(delta),0) AS x FROM xp_log WHERE user_id = ?').get(userId).x;
  const lv = levelForXp(totalXp);

  res.json({
    range: { from, to },
    overview: {
      total_minutes: core.minutes, active_days: core.active_days,
      chapters_done: core.chapters, tasks_done: core.tasks,
      goals_achieved: core.goals, xp_earned: core.xp,
      badges_earned: badges.length, max_streak: maxStreak,
    },
    subjects, grades, goals, badges, monthly,
    level: { level: lv.level, title_key: 'level.title.' + lv.titleTier, total_xp: totalXp },
  });
});

// GET /api/report/weekly-recap — last complete week vs the week before.
router.get('/weekly-recap', userCtx, (req, res) => {
  const week = lastWeekRange(localToday());
  const prev = prevRange(week);
  const stats = aggregateRange(req.userId, week.from, week.to);
  const prevStats = aggregateRange(req.userId, prev.from, prev.to);
  const hasActivity = ['minutes', 'active_days', 'chapters', 'tasks', 'goals', 'xp'].some(k => stats[k] > 0);
  res.json({
    week, prev, stats, prevStats,
    highlight: pickRecapHighlight(stats, prevStats),
    hasActivity,
  });
});

module.exports = router;
