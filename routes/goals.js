const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { clampText, LIMITS } = require('../utils/validate');
const { goalWindow, computeProgress } = require('../utils/goalProgress');
// Metrics inside the goal window. Achievement transitions (is_done + XP) are
// owned by processActivity (utils/gamify.js); GET only computes, never writes.
const { metricsFor } = require('../utils/goalMetrics');
const { processActivity } = require('../utils/gamify');

const TYPES = ['chapter', 'grade', 'text'];
const HORIZONS = ['short', 'mid', 'long'];
const EXAM_TYPES = ['quiz', 'segment', 'midterm', 'final', 'mock'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', userCtx, (req, res) => {
  const goals = db.prepare(`
    SELECT g.*, s.name AS subject_name, s.color AS subject_color
    FROM goals g LEFT JOIN subjects s ON s.id = g.subject_id
    WHERE g.user_id = ?
    ORDER BY g.is_done, g.created_at DESC
  `).all(req.userId);
  const periodById = {};
  for (const p of db.prepare('SELECT * FROM periods WHERE user_id = ?').all(req.userId)) {
    periodById[p.id] = p;
  }
  res.json(goals.map(g => {
    const period = g.period_id ? periodById[g.period_id] : null;
    const window = goalWindow(g, period);
    const { progress, target, achieved } = computeProgress(g, metricsFor(req.userId, g, window));
    return {
      ...g, progress, target,
      achieved: achieved || !!g.is_done,
      window_from: window.from, window_to: window.to,
      period_type: period ? period.type : null,
      period_school_year: period ? period.school_year : null,
    };
  }));
});

// Validate type-specific fields. `base` carries existing values on PUT.
function validateGoal(userId, body, base = {}) {
  const goal_type = body.goal_type !== undefined ? body.goal_type : base.goal_type;
  if (!TYPES.includes(goal_type)) return { error: '無效的目標類型' };

  const horizon = body.horizon !== undefined ? body.horizon : (base.horizon || 'short');
  if (!HORIZONS.includes(horizon)) return { error: '無效的目標期程' };

  const { value: title, tooLong } = clampText(
    body.title !== undefined ? body.title : base.title, LIMITS.title);
  if (!title) return { error: '目標名稱不能為空' };
  if (tooLong) return { error: '目標名稱過長' };

  let subject_id = body.subject_id !== undefined ? (body.subject_id || null) : (base.subject_id || null);
  if (subject_id != null) {
    const s = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, userId);
    if (!s) return { error: '科目不存在' };
  }
  if (goal_type === 'grade' && subject_id == null) return { error: '成績目標必須指定科目' };

  let target_value = body.target_value !== undefined ? body.target_value : base.target_value;
  if (goal_type !== 'text') {
    target_value = Number(target_value);
    if (!Number.isFinite(target_value) || target_value < 1 || target_value > 1000)
      return { error: '目標數值須在 1–1000 之間' };
    target_value = Math.round(target_value);
  } else {
    target_value = null;
  }

  let exam_type = body.exam_type !== undefined ? (body.exam_type || null) : (base.exam_type || null);
  if (goal_type !== 'grade') exam_type = null;
  if (exam_type != null && !EXAM_TYPES.includes(exam_type)) return { error: '無效的考試類型' };

  let period_id = body.period_id !== undefined ? (body.period_id || null) : (base.period_id || null);
  if (period_id != null) {
    const p = db.prepare('SELECT id FROM periods WHERE id = ? AND user_id = ?').get(period_id, userId);
    if (!p) return { error: '區間不存在' };
  }

  let due_date = body.due_date !== undefined ? (body.due_date || null) : (base.due_date || null);
  if (due_date != null && !DATE_RE.test(due_date)) return { error: '日期格式須為 YYYY-MM-DD' };

  return { goal: { title, goal_type, horizon, period_id, subject_id, exam_type, target_value, due_date } };
}

router.post('/', userCtx, (req, res) => {
  const v = validateGoal(req.userId, req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const g = v.goal;
  const result = db.prepare(`
    INSERT INTO goals (user_id, title, goal_type, horizon, period_id, subject_id, exam_type, target_value, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.userId, g.title, g.goal_type, g.horizon, g.period_id, g.subject_id, g.exam_type, g.target_value, g.due_date);
  res.status(201).json({ id: result.lastInsertRowid, ...g });
});

router.put('/:id', userCtx, (req, res) => {
  const base = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!base) return res.status(404).json({ error: '目標不存在' });
  const body = { ...req.body };
  delete body.goal_type; // 型別不可改，避免既有欄位語意錯亂
  const v = validateGoal(req.userId, body, base);
  if (v.error) return res.status(400).json({ error: v.error });
  const g = v.goal;
  db.prepare(`
    UPDATE goals SET title = ?, horizon = ?, period_id = ?, subject_id = ?, exam_type = ?, target_value = ?, due_date = ?
    WHERE id = ?
  `).run(g.title, g.horizon, g.period_id, g.subject_id, g.exam_type, g.target_value, g.due_date, req.params.id);
  res.json({ ok: true });
});

router.patch('/:id/toggle', userCtx, (req, res) => {
  const g = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!g) return res.status(404).json({ error: '目標不存在' });
  if (g.goal_type !== 'text') return res.status(400).json({ error: '只有自訂目標可以手動勾選' });
  const newDone = g.is_done ? 0 : 1;
  db.prepare('UPDATE goals SET is_done = ?, done_at = ? WHERE id = ?')
    .run(newDone, newDone ? new Date().toISOString() : null, g.id);
  // Completing a text goal earns horizon XP too (grantOnce — re-toggling never double-grants)
  const gamify = newDone ? processActivity(req.userId, { type: 'goal', goalId: g.id }) : { newBadges: [] };
  res.json({ ok: true, is_done: newDone, ...gamify });
});

router.delete('/:id', userCtx, (req, res) => {
  const g = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!g) return res.status(404).json({ error: '目標不存在' });
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
