const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { checkBadges } = require('../badges/checker');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const partsStmt = db.prepare('SELECT * FROM daily_task_parts WHERE task_id = ? ORDER BY part_num ASC');

function withParts(tasks) {
  for (const t of tasks) t.parts = partsStmt.all(t.id);
  return tasks;
}

// GET /?date=YYYY-MM-DD            — single day (used by dashboard)
// GET /?from=YYYY-MM-DD&to=...     — date range (used by homework page)
router.get('/', userCtx, (req, res) => {
  const { date, from, to } = req.query;

  if (from || to) {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return res.status(400).json({ error: '日期格式錯誤' });
    const tasks = db.prepare(`
      SELECT dt.*, s.name AS subject_name, s.color AS subject_color
      FROM daily_tasks dt
      LEFT JOIN subjects s ON s.id = dt.subject_id
      WHERE dt.user_id = ? AND dt.task_date >= ? AND dt.task_date <= ?
      ORDER BY dt.task_date ASC, dt.created_at ASC
    `).all(req.userId, from, to);
    return res.json(withParts(tasks));
  }

  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: '缺少日期' });
  const tasks = db.prepare(`
    SELECT dt.*, s.name AS subject_name, s.color AS subject_color
    FROM daily_tasks dt
    LEFT JOIN subjects s ON s.id = dt.subject_id
    WHERE dt.user_id = ? AND dt.task_date = ?
    ORDER BY dt.created_at ASC
  `).all(req.userId, date);
  res.json(withParts(tasks));
});

router.post('/', userCtx, (req, res) => {
  const { title, task_date, subject_id, total_parts } = req.body;
  const trimmedTitle = (title || '').trim();
  // Require at least a title or a subject so the task is always identifiable
  if (!task_date || (!trimmedTitle && !subject_id)) {
    return res.status(400).json({ error: '缺少必要欄位' });
  }
  // Validate subject ownership
  if (subject_id) {
    const sub = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
    if (!sub) return res.status(403).json({ error: '科目不存在' });
  }
  const parts = Math.max(1, Math.min(10, parseInt(total_parts) || 1));

  const created = db.transaction(() => {
    const r = db.prepare(
      'INSERT INTO daily_tasks (user_id, task_date, title, subject_id) VALUES (?, ?, ?, ?)'
    ).run(req.userId, task_date, trimmedTitle, subject_id || null);
    const taskId = r.lastInsertRowid;
    const ins = db.prepare('INSERT INTO daily_task_parts (task_id, part_num) VALUES (?, ?)');
    for (let i = 1; i <= parts; i++) ins.run(taskId, i);
    return taskId;
  })();

  const task = db.prepare(`
    SELECT dt.*, s.name AS subject_name, s.color AS subject_color
    FROM daily_tasks dt LEFT JOIN subjects s ON s.id = dt.subject_id
    WHERE dt.id = ?
  `).get(created);
  task.parts = partsStmt.all(created);
  res.status(201).json(task);
});

// Toggle individual part
router.patch('/parts/:partId', userCtx, (req, res) => {
  const part = db.prepare(`
    SELECT p.*, dt.user_id, dt.id AS task_id FROM daily_task_parts p
    JOIN daily_tasks dt ON dt.id = p.task_id
    WHERE p.id = ? AND dt.user_id = ?
  `).get(req.params.partId, req.userId);
  if (!part) return res.status(404).json({ error: '不存在' });

  const is_done = req.body.is_done ? 1 : 0;
  // Capture allDone inside the transaction — no redundant re-read needed
  let allDone = 0;
  db.transaction(() => {
    db.prepare('UPDATE daily_task_parts SET is_done = ? WHERE id = ?').run(is_done, part.id);
    const allParts = db.prepare('SELECT is_done FROM daily_task_parts WHERE task_id = ?').all(part.task_id);
    allDone = allParts.every(p => p.is_done) ? 1 : 0;
    db.prepare('UPDATE daily_tasks SET is_done = ? WHERE id = ?').run(allDone, part.task_id);
  })();

  const newBadges = allDone ? checkBadges(req.userId) : [];
  res.json({ ok: true, task_done: !!allDone, newBadges });
});

// Toggle whole task — sets all parts to the same state
router.patch('/:id', userCtx, (req, res) => {
  const task = db.prepare('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!task) return res.status(404).json({ error: '不存在' });
  const is_done = req.body.is_done ? 1 : 0;
  db.transaction(() => {
    db.prepare('UPDATE daily_tasks SET is_done = ? WHERE id = ?').run(is_done, req.params.id);
    db.prepare('UPDATE daily_task_parts SET is_done = ? WHERE task_id = ?').run(is_done, req.params.id);
  })();
  const newBadges = is_done ? checkBadges(req.userId) : [];
  res.json({ ok: true, newBadges });
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM daily_tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
