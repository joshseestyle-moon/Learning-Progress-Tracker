const router = require('express').Router();
const db = require('../db/db');
const userCtx = require('../middleware/userContext');
const { planCatchup, addDays } = require('../utils/catchup');
const { localToday, questProgress, getActiveQuest } = require('../utils/gamify');

const QUEST_BONUS_POINTS = 30;
const QUEST_BONUS_XP = 50;
const QUEST_MAX_TARGET = 5;
const QUEST_DAYS = 3;

function overdueChapters(userId, today) {
  return db.prepare(`
    SELECT cp.id, cp.scheduled_date, cp.type, ch.title AS chapter_title,
           s.name AS subject_name, s.color AS subject_color
    FROM chapter_progress cp
    JOIN chapters ch ON ch.id = cp.chapter_id
    JOIN subjects s ON s.id = ch.subject_id
    WHERE cp.user_id = ? AND cp.is_done = 0
      AND cp.scheduled_date IS NOT NULL AND cp.scheduled_date < ?
    ORDER BY cp.scheduled_date ASC
  `).all(userId, today);
}

// Active quest with progress attached; expiry itself lives in utils/gamify.js
// getActiveQuest so every reader shares one source of truth.
function activeQuest(userId, today) {
  const q = getActiveQuest(userId, today);
  return q ? { ...q, done_count: questProgress(q) } : null;
}

// GET /api/catchup/status — overdue picture + active quest
router.get('/status', userCtx, (req, res) => {
  const today = localToday();
  const chapters = overdueChapters(req.userId, today);
  const overdueTasks = db.prepare(
    'SELECT COUNT(*) AS c FROM daily_tasks WHERE user_id = ? AND is_done = 0 AND task_date < ?'
  ).get(req.userId, today).c;
  const oldestDays = chapters.length
    ? Math.round((new Date(today + 'T00:00:00') - new Date(chapters[0].scheduled_date + 'T00:00:00')) / 86400000)
    : 0;
  const clearedRecent = db.prepare(`
    SELECT COUNT(*) AS c FROM chapter_progress
    WHERE user_id = ? AND is_done = 1 AND done_at IS NOT NULL AND scheduled_date IS NOT NULL
      AND date(done_at,'localtime') > date(scheduled_date)
      AND date(done_at,'localtime') >= date('now','localtime','-6 days')
  `).get(req.userId).c;
  res.json({
    overdue_chapters: chapters,
    overdue_chapter_count: chapters.length,
    overdue_task_count: overdueTasks,
    oldest_overdue_days: oldestDays,
    cleared_last7: clearedRecent,
    active_quest: activeQuest(req.userId, today),
  });
});

// POST /api/catchup/plan — rewrite scheduled_date of overdue chapters, return preview
router.post('/plan', userCtx, (req, res) => {
  const today = localToday();
  const items = overdueChapters(req.userId, today);
  if (!items.length) return res.json({ moved: 0, plan: [] });

  const existingLoadByDate = {};
  for (const r of db.prepare(`
    SELECT scheduled_date AS d, COUNT(*) AS c FROM chapter_progress
    WHERE user_id = ? AND is_done = 0 AND scheduled_date >= ?
    GROUP BY scheduled_date
  `).all(req.userId, today)) existingLoadByDate[r.d] = r.c;

  const plan = planCatchup({ items, existingLoadByDate, todayStr: today });
  const upd = db.prepare('UPDATE chapter_progress SET scheduled_date = ? WHERE id = ? AND user_id = ?');
  db.transaction(() => {
    for (const p of plan) upd.run(p.newDate, p.id, req.userId);
  })();

  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  res.json({
    moved: plan.length,
    plan: plan.map(p => ({
      id: p.id, newDate: p.newDate,
      subject_name: byId[p.id].subject_name,
      chapter_title: byId[p.id].chapter_title,
      type: byId[p.id].type,
    })),
  });
});

// POST /api/catchup/quest — accept a catch-up quest (one active at a time)
router.post('/quest', userCtx, (req, res) => {
  const today = localToday();
  if (activeQuest(req.userId, today)) {
    return res.status(409).json({ error: '已有進行中的挑戰' });
  }
  const chapterIds = overdueChapters(req.userId, today).map(c => c.id);
  const taskIds = db.prepare(
    'SELECT id FROM daily_tasks WHERE user_id = ? AND is_done = 0 AND task_date < ?'
  ).all(req.userId, today).map(r => r.id);
  const total = chapterIds.length + taskIds.length;
  if (total === 0) return res.status(400).json({ error: '沒有逾期項目' });

  const target = Math.min(total, QUEST_MAX_TARGET);
  const deadline = addDays(today, QUEST_DAYS);
  let quest;
  db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO catchup_quests (user_id, title, target_count, deadline_date, bonus_points, bonus_xp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.userId, '補救挑戰', target, deadline, QUEST_BONUS_POINTS, QUEST_BONUS_XP);
    const ins = db.prepare('INSERT OR IGNORE INTO catchup_quest_items (quest_id, kind, item_id) VALUES (?, ?, ?)');
    for (const id of chapterIds) ins.run(r.lastInsertRowid, 'chapter', id);
    for (const id of taskIds) ins.run(r.lastInsertRowid, 'task', id);
    quest = db.prepare('SELECT * FROM catchup_quests WHERE id = ?').get(r.lastInsertRowid);
  })();
  res.status(201).json({ ...quest, done_count: 0 });
});

module.exports = router;
