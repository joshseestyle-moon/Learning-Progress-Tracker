// Integration tests for POST /goals's "already-met confirmation" gate (F1
// follow-up): a chapter/grade goal whose target is satisfied by pre-existing
// progress must NOT be created (and must NOT grant XP) until the frontend
// resubmits with confirmAlreadyMet:true. DB_PATH is redirected to a throwaway
// file BEFORE requiring db/db.js so the real data/app.db is never touched.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const TMP_DB = path.join(os.tmpdir(), `goals-route-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;

const db = require('../db/db');
const express = require('express');
const goalsRouter = require('../routes/goals');

let server, base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/goals', goalsRouter);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/goals`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  try { db.close && db.close(); } catch (_) {}
  for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(TMP_DB + ext); } catch (_) {} }
});

function newUser() {
  const uid = db.prepare("INSERT INTO users (name) VALUES ('t')").run().lastInsertRowid;
  const sid = db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)').run(uid, 'S').lastInsertRowid;
  return { uid, sid };
}

async function postGoal(uid, body) {
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': String(uid) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

function xpFor(gid) {
  return db.prepare("SELECT COALESCE(SUM(delta),0) AS x FROM xp_log WHERE reason = ?").get('goal:' + gid).x;
}
function goalCount(uid) {
  return db.prepare('SELECT COUNT(*) AS c FROM goals WHERE user_id = ?').get(uid).c;
}

test('chapter goal already met at creation: needs confirm, nothing written', async () => {
  const { uid, sid } = newUser();
  const chId = db.prepare('INSERT INTO chapters (subject_id, title) VALUES (?,?)').run(sid, 'C').lastInsertRowid;
  db.prepare("INSERT INTO chapter_progress (user_id, chapter_id, type, seq, is_done, done_at) VALUES (?,?,?,?,1,datetime('now'))")
    .run(uid, chId, 'preview', 1);

  const body = { title: 'G', goal_type: 'chapter', horizon: 'short', subject_id: sid, target_value: 1 };
  const r1 = await postGoal(uid, body);
  assert.equal(r1.status, 200);
  assert.deepStrictEqual(r1.json, { needsConfirm: true });
  assert.equal(goalCount(uid), 0, 'no goal row must be written while unconfirmed');

  const r2 = await postGoal(uid, { ...body, confirmAlreadyMet: true });
  assert.equal(r2.status, 201);
  assert.equal(goalCount(uid), 1);
  assert.equal(r2.json.goalsAchieved.length, 1, 'confirmed create still auto-achieves (F1 unchanged)');
  assert.equal(xpFor(r2.json.id), 30, 'short-horizon XP granted exactly once');
});

test('grade goal already met at creation: needs confirm, nothing written', async () => {
  const { uid, sid } = newUser();
  db.prepare("INSERT INTO grades (user_id, subject_id, exam_name, score, exam_date) VALUES (?,?,?,?,date('now'))").run(uid, sid, 'E', 95);

  const body = { title: 'G', goal_type: 'grade', horizon: 'short', subject_id: sid, target_value: 90 };
  const r1 = await postGoal(uid, body);
  assert.equal(r1.status, 200);
  assert.deepStrictEqual(r1.json, { needsConfirm: true });
  assert.equal(goalCount(uid), 0);

  const r2 = await postGoal(uid, { ...body, confirmAlreadyMet: true });
  assert.equal(r2.status, 201);
  assert.equal(goalCount(uid), 1);
  assert.equal(r2.json.goalsAchieved.length, 1);
  assert.equal(xpFor(r2.json.id), 30);
});

test('text goal is never gated by needsConfirm, even though it starts undone', async () => {
  const { uid } = newUser();
  const r = await postGoal(uid, { title: 'T', goal_type: 'text', horizon: 'short' });
  assert.equal(r.status, 201);
  assert.equal(r.json.needsConfirm, undefined);
  assert.equal(goalCount(uid), 1);
});

test('a goal not yet met at creation is created normally with no confirm gate', async () => {
  const { uid, sid } = newUser();
  const body = { title: 'G', goal_type: 'chapter', horizon: 'short', subject_id: sid, target_value: 5 };
  const r = await postGoal(uid, body);
  assert.equal(r.status, 201);
  assert.equal(r.json.needsConfirm, undefined);
  assert.equal(goalCount(uid), 1);
  assert.equal((r.json.goalsAchieved || []).length, 0);
});
