const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');

// List chapters with user's preview + review progress
router.get('/', userCtx, (req, res) => {
  const where = req.query.subject_id ? 'WHERE c.subject_id = ?' : '';
  const baseParams = req.query.subject_id ? [req.userId, req.userId, req.query.subject_id] : [req.userId, req.userId];

  const rows = db.prepare(`
    SELECT c.*, s.name AS subject_name, s.color AS subject_color,
           prev.is_done        AS preview_done,
           prev.scheduled_date AS preview_date,
           prev.done_at        AS preview_done_at,
           rev.is_done         AS review_done,
           rev.scheduled_date  AS review_date,
           rev.done_at         AS review_done_at
    FROM chapters c
    JOIN subjects s ON s.id = c.subject_id
    LEFT JOIN chapter_progress prev ON prev.chapter_id = c.id AND prev.user_id = ? AND prev.type = 'preview'
    LEFT JOIN chapter_progress rev  ON rev.chapter_id  = c.id AND rev.user_id  = ? AND rev.type  = 'review'
    ${where}
    ORDER BY c.subject_id, c.sort_order, c.id
  `).all(...baseParams);
  res.json(rows);
});

// For calendar: all scheduled chapter items with a date
router.get('/scheduled', userCtx, (req, res) => {
  const rows = db.prepare(`
    SELECT cp.*, c.title AS chapter_title, c.subject_id,
           s.name AS subject_name, s.color AS subject_color
    FROM chapter_progress cp
    JOIN chapters c ON c.id = cp.chapter_id
    JOIN subjects s ON s.id = c.subject_id
    WHERE cp.user_id = ? AND cp.scheduled_date IS NOT NULL
    ORDER BY cp.scheduled_date ASC
  `).all(req.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { subject_id, title, sort_order = 0 } = req.body;
  if (!subject_id || !title) return res.status(400).json({ error: '缺少必要欄位' });
  const result = db.prepare('INSERT INTO chapters (subject_id,title,sort_order) VALUES (?,?,?)').run(subject_id, title, sort_order);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: '不存在' });
  const { title, sort_order } = req.body;
  db.prepare('UPDATE chapters SET title=?,sort_order=? WHERE id=?')
    .run(title || c.title, sort_order !== undefined ? sort_order : c.sort_order, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// PATCH /:id/progress — toggle done and/or set date
// body: { type: 'preview'|'review', scheduled_date?, toggle_done? }
router.patch('/:id/progress', userCtx, (req, res) => {
  const { type = 'preview', scheduled_date, toggle_done } = req.body;
  if (!['preview', 'review'].includes(type))
    return res.status(400).json({ error: '無效的類型' });

  const existing = db.prepare(
    'SELECT * FROM chapter_progress WHERE chapter_id = ? AND user_id = ? AND type = ?'
  ).get(req.params.id, req.userId, type);

  if (existing) {
    const newDone = toggle_done ? (existing.is_done ? 0 : 1) : existing.is_done;
    const newDate = scheduled_date !== undefined ? (scheduled_date || null) : existing.scheduled_date;
    db.prepare('UPDATE chapter_progress SET is_done=?,done_at=?,scheduled_date=? WHERE id=?')
      .run(newDone, newDone && !existing.done_at ? new Date().toISOString() : (newDone ? existing.done_at : null), newDate, existing.id);
    res.json({ is_done: newDone, scheduled_date: newDate });
  } else {
    const isDone = toggle_done ? 1 : 0;
    db.prepare('INSERT INTO chapter_progress (user_id,chapter_id,type,scheduled_date,is_done,done_at) VALUES (?,?,?,?,?,?)')
      .run(req.userId, req.params.id, type, scheduled_date || null, isDone, isDone ? new Date().toISOString() : null);
    res.json({ is_done: isDone, scheduled_date: scheduled_date || null });
  }
});

module.exports = router;
