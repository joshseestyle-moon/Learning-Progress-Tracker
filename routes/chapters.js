const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { processActivity } = require('../utils/gamify');
const { nextReviewDate } = require('../utils/srs');
const { clampText, LIMITS } = require('../utils/validate');

// Spaced repetition: when a preview or review session is just completed, auto-
// schedule the next review session (unless one already exists). Returns the new
// review row {id, seq, scheduled_date} or null. Callers pass the record that was
// just marked done and whether it transitioned into the done state.
function maybeScheduleNextReview(userId, record, becameDone, optOut) {
  if (optOut || !becameDone) return null;
  if (record.type !== 'preview' && record.type !== 'review') return null;
  // Only chain forward from the newest review (or a preview) — never back-fill a
  // gap left by a manually-deleted middle review, and never re-schedule from an
  // older review when a later one already exists.
  const maxSeq = db.prepare(
    "SELECT COALESCE(MAX(seq), 0) AS m FROM chapter_progress WHERE user_id = ? AND chapter_id = ? AND type = 'review'"
  ).get(userId, record.chapter_id).m;
  if (record.type === 'review' && record.seq !== maxSeq) return null;
  const nextSeq = record.type === 'preview' ? 1 : record.seq + 1;
  if (nextSeq <= maxSeq) return null; // a review at/after this seq already exists
  // Use LOCAL date (not UTC) to match the rest of the app's date handling
  const n = new Date();
  const doneDate = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const scheduled = nextReviewDate(doneDate, nextSeq);
  const r = db.prepare(
    "INSERT INTO chapter_progress (user_id,chapter_id,type,seq,scheduled_date,is_done) VALUES (?,?,'review',?,?,0)"
  ).run(userId, record.chapter_id, nextSeq, scheduled);
  return { id: r.lastInsertRowid, seq: nextSeq, scheduled_date: scheduled };
}

// GET / — chapters with preview info + all review sessions
router.get('/', userCtx, (req, res) => {
  const chapters = db.prepare(`
    SELECT c.*, s.name AS subject_name, s.color AS subject_color,
           prev.id             AS preview_id,
           prev.is_done        AS preview_done,
           prev.scheduled_date AS preview_date,
           prev.done_at        AS preview_done_at,
           prev.notes          AS preview_notes
    FROM chapters c
    JOIN subjects s ON s.id = c.subject_id
    LEFT JOIN chapter_progress prev ON prev.chapter_id = c.id AND prev.user_id = ? AND prev.type = 'preview' AND prev.seq = 1
    WHERE s.user_id = ?
    ORDER BY c.subject_id, c.sort_order, c.id
  `).all(req.userId, req.userId);

  const reviews = db.prepare(`
    SELECT * FROM chapter_progress
    WHERE user_id = ? AND type = 'review'
    ORDER BY chapter_id, seq
  `).all(req.userId);

  const reviewMap = {};
  for (const r of reviews) {
    if (!reviewMap[r.chapter_id]) reviewMap[r.chapter_id] = [];
    reviewMap[r.chapter_id].push(r);
  }

  res.json(chapters.map(c => ({ ...c, reviews: reviewMap[c.id] || [] })));
});

// GET /scheduled — for calendar
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

// PATCH /progress/:progressId — update any specific progress record
router.patch('/progress/:progressId', userCtx, (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM chapter_progress WHERE id = ? AND user_id = ?'
  ).get(req.params.progressId, req.userId);
  if (!existing) return res.status(404).json({ error: '不存在' });

  const { toggle_done, scheduled_date, notes } = req.body;
  const newDone  = toggle_done ? (existing.is_done ? 0 : 1) : existing.is_done;
  const newDate  = scheduled_date !== undefined ? (scheduled_date || null) : existing.scheduled_date;
  const newNotes = notes !== undefined ? (notes.trim() || null) : existing.notes;

  db.prepare('UPDATE chapter_progress SET is_done=?,done_at=?,scheduled_date=?,notes=? WHERE id=?')
    .run(
      newDone,
      newDone && !existing.done_at ? new Date().toISOString() : (newDone ? existing.done_at : null),
      newDate,
      newNotes,
      existing.id
    );
  const becameDone = newDone && !existing.is_done;
  const nextReview = maybeScheduleNextReview(req.userId, existing, becameDone, req.body.auto_schedule === false);
  const gamify = becameDone ? processActivity(req.userId, { type: 'chapter', progressId: existing.id }) : { newBadges: [] };
  res.json({ ok: true, is_done: newDone, ...gamify, nextReview });
});

// DELETE /progress/:progressId — delete a review session (preview cannot be deleted)
router.delete('/progress/:progressId', userCtx, (req, res) => {
  const row = db.prepare(
    'SELECT * FROM chapter_progress WHERE id = ? AND user_id = ?'
  ).get(req.params.progressId, req.userId);
  if (!row) return res.status(404).json({ error: '不存在' });
  if (row.type === 'preview') return res.status(400).json({ error: '不能刪除預習進度' });
  db.prepare('DELETE FROM chapter_progress WHERE id = ?').run(req.params.progressId);
  res.json({ ok: true });
});

// POST / — create chapter
router.post('/', userCtx, (req, res) => {
  const { subject_id, sort_order = 0 } = req.body;
  const { value: title, tooLong } = clampText(req.body.title, LIMITS.name);
  if (!subject_id || !title) return res.status(400).json({ error: '缺少必要欄位' });
  if (tooLong) return res.status(400).json({ error: '章節名稱過長' });
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在' });
  const result = db.prepare(
    'INSERT INTO chapters (subject_id,title,sort_order) VALUES (?,?,?)'
  ).run(subject_id, title, sort_order);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /:id — update chapter title/order
router.put('/:id', userCtx, (req, res) => {
  const c = db.prepare(
    'SELECT c.* FROM chapters c JOIN subjects s ON s.id = c.subject_id WHERE c.id = ? AND s.user_id = ?'
  ).get(req.params.id, req.userId);
  if (!c) return res.status(404).json({ error: '不存在' });
  const { title, sort_order } = req.body;
  db.prepare('UPDATE chapters SET title=?,sort_order=? WHERE id=?')
    .run(title || c.title, sort_order !== undefined ? sort_order : c.sort_order, req.params.id);
  res.json({ ok: true });
});

// DELETE / — delete all chapters belonging to a subject (query: ?subject_id=X)
router.delete('/', userCtx, (req, res) => {
  const { subject_id } = req.query;
  if (!subject_id) return res.status(400).json({ error: '缺少 subject_id' });
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
  if (!subject) return res.status(403).json({ error: '科目不存在或無權限' });
  const { changes } = db.prepare('DELETE FROM chapters WHERE subject_id = ?').run(subject_id);
  res.json({ ok: true, deleted: changes });
});

// DELETE /:id — delete chapter
router.delete('/:id', userCtx, (req, res) => {
  const c = db.prepare(
    'SELECT c.id FROM chapters c JOIN subjects s ON s.id = c.subject_id WHERE c.id = ? AND s.user_id = ?'
  ).get(req.params.id, req.userId);
  if (!c) return res.status(404).json({ error: '不存在' });
  db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// PATCH /:id/progress — upsert preview progress (seq=1, type='preview')
router.patch('/:id/progress', userCtx, (req, res) => {
  const { type = 'preview', scheduled_date, toggle_done, notes } = req.body;
  if (!['preview', 'review'].includes(type))
    return res.status(400).json({ error: '無效的類型' });

  const existing = db.prepare(
    'SELECT * FROM chapter_progress WHERE chapter_id = ? AND user_id = ? AND type = ? AND seq = 1'
  ).get(req.params.id, req.userId, type);

  if (existing) {
    const newDone  = toggle_done ? (existing.is_done ? 0 : 1) : existing.is_done;
    const newDate  = scheduled_date !== undefined ? (scheduled_date || null) : existing.scheduled_date;
    const newNotes = notes !== undefined ? (notes.trim() || null) : existing.notes;
    db.prepare('UPDATE chapter_progress SET is_done=?,done_at=?,scheduled_date=?,notes=? WHERE id=?')
      .run(newDone, newDone && !existing.done_at ? new Date().toISOString() : (newDone ? existing.done_at : null), newDate, newNotes, existing.id);
    const becameDone = newDone && !existing.is_done;
    const nextReview = maybeScheduleNextReview(req.userId, existing, becameDone, req.body.auto_schedule === false);
    const gamify = becameDone ? processActivity(req.userId, { type: 'chapter', progressId: existing.id }) : { newBadges: [] };
    res.json({ is_done: newDone, scheduled_date: newDate, notes: newNotes, ...gamify, nextReview });
  } else {
    const isDone   = toggle_done ? 1 : 0;
    const newNotes = notes !== undefined ? (notes.trim() || null) : null;
    const inserted = db.prepare(
      'INSERT INTO chapter_progress (user_id,chapter_id,type,seq,scheduled_date,is_done,done_at,notes) VALUES (?,?,?,1,?,?,?,?)'
    ).run(req.userId, req.params.id, type, scheduled_date || null, isDone, isDone ? new Date().toISOString() : null, newNotes);
    const nextReview = maybeScheduleNextReview(
      req.userId, { chapter_id: +req.params.id, type, seq: 1 }, isDone === 1, req.body.auto_schedule === false
    );
    const gamify = isDone ? processActivity(req.userId, { type: 'chapter', progressId: inserted.lastInsertRowid }) : { newBadges: [] };
    res.json({ is_done: isDone, scheduled_date: scheduled_date || null, ...gamify, nextReview });
  }
});

// POST /:id/review — add a new review session
router.post('/:id/review', userCtx, (req, res) => {
  const row = db.prepare(
    "SELECT MAX(seq) AS maxSeq FROM chapter_progress WHERE chapter_id = ? AND user_id = ? AND type = 'review'"
  ).get(req.params.id, req.userId);
  const nextSeq = (row.maxSeq ?? 0) + 1;
  const result = db.prepare(
    "INSERT INTO chapter_progress (user_id,chapter_id,type,seq,is_done) VALUES (?,?,'review',?,0)"
  ).run(req.userId, req.params.id, nextSeq);
  res.status(201).json({ id: result.lastInsertRowid, seq: nextSeq });
});

module.exports = router;
