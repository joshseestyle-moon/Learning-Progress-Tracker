const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { getStatus } = require('../utils/gamify');

// GET /api/gamify/status — XP / level / title / combo / today's surprise / active quest
router.get('/status', userCtx, (req, res) => {
  res.json(getStatus(req.userId));
});

// GET /api/gamify/growth-summary — everything the growth page needs in one round trip
router.get('/growth-summary', userCtx, (req, res) => {
  const userId = req.userId;

  // Cumulative study minutes + completed chapter sessions per day (running totals)
  const cumulative = db.prepare(`
    WITH days AS (
      SELECT log_date AS d, SUM(minutes) AS m, 0 AS c
      FROM study_log WHERE user_id = ? GROUP BY log_date
      UNION ALL
      SELECT date(done_at,'localtime') AS d, 0 AS m, COUNT(*) AS c
      FROM chapter_progress
      WHERE user_id = ? AND is_done = 1 AND done_at IS NOT NULL
      GROUP BY date(done_at,'localtime')
    )
    SELECT d AS date,
           SUM(SUM(m)) OVER (ORDER BY d) AS cum_minutes,
           SUM(SUM(c)) OVER (ORDER BY d) AS cum_chapters
    FROM days GROUP BY d ORDER BY d
  `).all(userId, userId);

  // XP earned per week (Monday-start), last 8 weeks; backfill excluded so the
  // one-time historical grant doesn't dwarf real weekly progress
  const weeklyXp = db.prepare(`
    SELECT date(created_at,'localtime','weekday 0','-6 days') AS week_start, SUM(delta) AS xp
    FROM xp_log
    WHERE user_id = ? AND reason NOT LIKE 'backfill:%'
      AND date(created_at,'localtime') >= date('now','localtime','-56 days')
    GROUP BY week_start ORDER BY week_start
  `).all(userId);

  // Flywheel node activity for the current week (goal → study → reward → review)
  const wk = "date('now','localtime','weekday 0','-6 days')";
  // "Active this week" = a goal created or achieved within the week, matching
  // the in-window activity semantics of the other three nodes. (A merely-open
  // stale goal must NOT keep the node green, or the hint could never fire.)
  const goalActive = db.prepare(`
    SELECT 1 AS x FROM goals WHERE user_id = ? AND (
      date(created_at,'localtime') >= ${wk}
      OR (done_at IS NOT NULL AND date(done_at,'localtime') >= ${wk})
    ) LIMIT 1
  `).get(userId);
  const studyActive = db.prepare(
    `SELECT 1 AS x FROM study_log WHERE user_id = ? AND date(log_date) >= ${wk} LIMIT 1`
  ).get(userId);
  const rewardActive = db.prepare(
    `SELECT 1 AS x FROM point_log WHERE user_id = ? AND delta > 0 AND date(created_at,'localtime') >= ${wk} LIMIT 1`
  ).get(userId);
  const reviewActive = db.prepare(`
    SELECT 1 AS x FROM chapter_progress
    WHERE user_id = ? AND type = 'review' AND (
      (is_done = 1 AND done_at IS NOT NULL AND date(done_at,'localtime') >= ${wk})
      OR (scheduled_date IS NOT NULL AND date(scheduled_date) >= ${wk}
          AND date(scheduled_date) < date(${wk}, '+7 days'))
    ) LIMIT 1
  `).get(userId);
  const nodes = {
    goal: !!goalActive,
    study: !!studyActive,
    reward: !!rewardActive,
    review: !!reviewActive,
  };
  const weakest = ['goal', 'study', 'reward', 'review'].find(k => !nodes[k]) || 'allGreen';

  res.json({
    status: getStatus(userId),
    cumulative,
    weekly_xp: weeklyXp,
    flywheel: { ...nodes, hint: weakest },
    periods: db.prepare('SELECT * FROM periods WHERE user_id = ? ORDER BY school_year DESC, start_date DESC').all(userId),
  });
});

module.exports = router;
