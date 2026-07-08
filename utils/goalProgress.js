// Pure helpers for goal progress evaluation. SQL fetching stays in routes;
// only the window/threshold math lives here so it can be unit-tested.

// Date window [from, to] for evaluating a goal.
// Priority: linked period range > created_at..due_date > created_at onward (to = null).
function goalWindow(goal, period) {
  if (period) return { from: period.start_date, to: period.end_date };
  const from = (goal.created_at || '').slice(0, 10) || null;
  return { from, to: goal.due_date || null };
}

// Compute { progress, target, achieved } for a goal given pre-fetched metrics:
//   chapter → metrics.chapterDoneCount (sessions done inside the window)
//   grade   → metrics.bestScore (highest matching score inside the window, or null)
//   text    → manual, driven by goal.is_done
function computeProgress(goal, metrics = {}) {
  if (goal.goal_type === 'chapter') {
    const progress = metrics.chapterDoneCount || 0;
    const target = goal.target_value || 0;
    return { progress, target, achieved: target > 0 && progress >= target };
  }
  if (goal.goal_type === 'grade') {
    const best = metrics.bestScore == null ? null : metrics.bestScore;
    const target = goal.target_value || 0;
    return { progress: best, target, achieved: best != null && target > 0 && best >= target };
  }
  return { progress: goal.is_done ? 1 : 0, target: 1, achieved: !!goal.is_done };
}

module.exports = { goalWindow, computeProgress };
