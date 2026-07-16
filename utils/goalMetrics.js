// Window-scoped SQL metrics for goal progress evaluation. Shared by
// routes/goals.js (GET, read-only) and utils/gamify.js (auto-achievement).
// The pure window/threshold math lives in utils/goalProgress.js.
const db = require('../db/db');

const chapterDoneStmt = db.prepare(`
  SELECT COUNT(*) AS n
  FROM chapter_progress cp
  JOIN chapters c ON c.id = cp.chapter_id
  WHERE cp.user_id = ? AND cp.is_done = 1 AND cp.done_at IS NOT NULL
    AND (? IS NULL OR date(cp.done_at,'localtime') >= date(?))
    AND (? IS NULL OR date(cp.done_at,'localtime') <= date(?))
    AND (? IS NULL OR c.subject_id = ?)
`);

// exam_type lives on exams; manually-entered grades (exam_id NULL) can only
// match when the goal doesn't restrict exam_type.
const bestGradeStmt = db.prepare(`
  SELECT MAX(g.score) AS s
  FROM grades g
  LEFT JOIN exams e ON e.id = g.exam_id
  WHERE g.user_id = ? AND g.subject_id = ?
    AND (? IS NULL OR e.exam_type = ?)
    AND (? IS NULL OR date(g.exam_date) >= date(?))
    AND (? IS NULL OR date(g.exam_date) <= date(?))
`);

function metricsFor(userId, goal, window) {
  if (goal.goal_type === 'chapter') {
    const row = chapterDoneStmt.get(userId, window.from, window.from, window.to, window.to, goal.subject_id, goal.subject_id);
    return { chapterDoneCount: row.n };
  }
  if (goal.goal_type === 'grade') {
    const row = bestGradeStmt.get(userId, goal.subject_id,
      goal.exam_type, goal.exam_type,
      window.from, window.from, window.to, window.to);
    return { bestScore: row.s };
  }
  return {};
}

module.exports = { metricsFor };
