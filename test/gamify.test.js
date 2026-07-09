// Integration tests for the gamification hub against a throwaway migrated DB.
// DB_PATH is redirected to a temp file BEFORE requiring db/db.js so the real
// data/app.db is never touched.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const TMP_DB = path.join(os.tmpdir(), `gamify-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;

const db = require('../db/db');
const { processActivity, achieveGoalOnCreate } = require('../utils/gamify');
const { localToday } = require('../utils/streak');

function newUser(dailyGoal = 0) {
  const uid = db.prepare("INSERT INTO users (name) VALUES ('t')").run().lastInsertRowid;
  if (dailyGoal) db.prepare('UPDATE users SET daily_goal_minutes = ? WHERE id = ?').run(dailyGoal, uid);
  const sid = db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)').run(uid, 'S').lastInsertRowid;
  return { uid, sid };
}
function studyXpToday(uid) {
  return db.prepare(
    "SELECT COALESCE(SUM(delta),0) AS x FROM xp_log WHERE user_id = ? AND reason LIKE 'study:%' AND date(created_at,'localtime') = ?"
  ).get(uid, localToday()).x;
}

after(() => {
  try { db.close && db.close(); } catch (_) {}
  for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP_DB + ext); } catch (_) {} }
});

test('study XP respects the 180/day cap and delete+re-add cannot bypass it', () => {
  const { uid, sid } = newUser();
  const today = localToday();
  const logStudy = (minutes) => {
    const id = db.prepare('INSERT INTO study_log (user_id, subject_id, log_date, minutes) VALUES (?,?,?,?)')
      .run(uid, sid, today, minutes).lastInsertRowid;
    return processActivity(uid, { type: 'study', id, logDate: today, minutes, _rand: () => 0.99 });
  };
  logStudy(100); // 100 XP
  logStudy(100); // capped: only 80 more → 180 total
  assert.equal(studyXpToday(uid), 180);

  // "Delete" the second log row; its xp_log entry stays, so the cap holds.
  const rows = db.prepare("SELECT id FROM study_log WHERE user_id = ? ORDER BY id", ).all(uid);
  db.prepare('DELETE FROM study_log WHERE id = ?').run(rows[1].id);
  logStudy(100); // re-add — must still grant 0 (day already at 180)
  assert.equal(studyXpToday(uid), 180, 'delete + re-add must not exceed the daily cap');
});

test('backdated study earns no combo multiplier (F7)', () => {
  const { uid, sid } = newUser(30); // daily goal 30 → build a combo
  const today = localToday();
  const dk = (offset) => {
    const d = new Date(); d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  // Seed 3 consecutive days meeting the goal so today's combo multiplier > 1.
  for (const off of [2, 1, 0]) {
    db.prepare('INSERT INTO study_log (user_id, subject_id, log_date, minutes) VALUES (?,?,?,?)').run(uid, sid, dk(off), 40);
  }
  const backDate = dk(10);
  const id = db.prepare('INSERT INTO study_log (user_id, subject_id, log_date, minutes) VALUES (?,?,?,?)')
    .run(uid, sid, backDate, 50).lastInsertRowid;
  const r = processActivity(uid, { type: 'study', id, logDate: backDate, minutes: 50, _rand: () => 0.99 });
  assert.ok(r.combo.multiplier > 1, 'precondition: combo active today');
  // Backdated entry: 50 min × 1.0, NOT × the combo multiplier.
  assert.equal(db.prepare("SELECT delta FROM xp_log WHERE reason = ?").get('study:' + id).delta, 50);
});

test('assignment completion grants XP (F8)', () => {
  const { uid, sid } = newUser();
  const aid = db.prepare('INSERT INTO assignments (user_id, subject_id, title, due_date) VALUES (?,?,?,?)')
    .run(uid, sid, 'A', localToday()).lastInsertRowid;
  const r = processActivity(uid, { type: 'assignment', id: aid, _rand: () => 0.99 });
  assert.equal(r.xp.gained >= 10, true);
  assert.equal(db.prepare("SELECT delta FROM xp_log WHERE reason = ?").get('assignment:' + aid).delta, 10);
});

test('a goal already satisfied at creation is awarded immediately (F1)', () => {
  const { uid, sid } = newUser();
  const chId = db.prepare('INSERT INTO chapters (subject_id, title) VALUES (?,?)').run(sid, 'C').lastInsertRowid;
  db.prepare("INSERT INTO chapter_progress (user_id, chapter_id, type, seq, is_done, done_at) VALUES (?,?,?,?,1,datetime('now'))")
    .run(uid, chId, 'preview', 1);
  const gid = db.prepare("INSERT INTO goals (user_id, title, goal_type, horizon, target_value) VALUES (?,?,?,?,?)")
    .run(uid, 'G', 'chapter', 'short', 1).lastInsertRowid;
  const r = achieveGoalOnCreate(uid, gid);
  assert.equal(r.goalsAchieved.length, 1, 'goal should be achieved on creation');
  assert.equal(db.prepare('SELECT is_done FROM goals WHERE id = ?').get(gid).is_done, 1);
  assert.equal(r.xp.gained, 30, 'short-horizon goal grants 30 XP');
});

test('daily surprise fires at most once per day', () => {
  const { uid, sid } = newUser();
  const today = localToday();
  const s1 = db.prepare('INSERT INTO study_log (user_id, subject_id, log_date, minutes) VALUES (?,?,?,?)').run(uid, sid, today, 20).lastInsertRowid;
  const r1 = processActivity(uid, { type: 'study', id: s1, logDate: today, minutes: 20, _rand: () => 0.0 });
  const s2 = db.prepare('INSERT INTO study_log (user_id, subject_id, log_date, minutes) VALUES (?,?,?,?)').run(uid, sid, today, 20).lastInsertRowid;
  const r2 = processActivity(uid, { type: 'study', id: s2, logDate: today, minutes: 20, _rand: () => 0.0 });
  assert.ok(r1.surprise, 'first qualifying event gets a surprise');
  assert.equal(r2.surprise, null, 'second same-day event gets none');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM daily_reward_log WHERE user_id = ?').get(uid).c, 1);
});
