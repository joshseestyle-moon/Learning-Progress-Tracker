const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');

function currentPeriod() {
  const m = new Date().getMonth() + 1;
  const roc = new Date().getFullYear() - 1911;
  if (m >= 9) return { year: roc, semester: 1 };
  if (m >= 2) return { year: roc - 1, semester: 2 };
  return { year: roc - 1, semester: 1 };
}

// List distinct year/semester combinations that have data for this user
router.get('/years', userCtx, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT school_year, semester
    FROM timetable_slots
    WHERE user_id = ?
    ORDER BY school_year DESC, semester DESC
  `).all(req.userId);
  res.json(rows);
});

router.get('/', userCtx, (req, res) => {
  const def = currentPeriod();
  const school_year = req.query.school_year !== undefined ? +req.query.school_year : def.year;
  const semester    = req.query.semester    !== undefined ? +req.query.semester    : def.semester;
  const slots = db.prepare(`
    SELECT t.*, s.name AS subject_name, s.color AS subject_color
    FROM timetable_slots t
    JOIN subjects s ON s.id = t.subject_id
    WHERE t.user_id = ? AND t.school_year = ? AND t.semester = ?
    ORDER BY t.day_of_week, t.period
  `).all(req.userId, school_year, semester);
  res.json(slots);
});

router.post('/', userCtx, (req, res) => {
  const { subject_id, day_of_week, period, school_year, semester } = req.body;
  if (!subject_id || day_of_week === undefined || !period || !school_year || !semester)
    return res.status(400).json({ error: '缺少必要欄位' });
  try {
    const result = db.prepare(
      'INSERT INTO timetable_slots (user_id, subject_id, day_of_week, period, school_year, semester) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.userId, subject_id, day_of_week, period, school_year, semester);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '該節次已有課程' });
    throw e;
  }
});

router.put('/:id', userCtx, (req, res) => {
  const slot = db.prepare('SELECT * FROM timetable_slots WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!slot) return res.status(404).json({ error: '不存在' });
  const { subject_id } = req.body;
  try {
    db.prepare('UPDATE timetable_slots SET subject_id = ? WHERE id = ?')
      .run(subject_id !== undefined ? subject_id : slot.subject_id, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '該節次已有課程' });
    throw e;
  }
});

router.delete('/:id', userCtx, (req, res) => {
  db.prepare('DELETE FROM timetable_slots WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
