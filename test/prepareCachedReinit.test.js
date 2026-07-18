const { test, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const TMP_DB = path.join(__dirname, `tmp-reinit-${process.pid}.db`);
process.env.DB_PATH = TMP_DB; // 必須在 require db 之前（CLAUDE.md 不變量 7）

const db = require('../db/db');
const { metricsFor } = require('../utils/goalMetrics');

after(() => {
  for (const suf of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP_DB + suf); } catch {}
  }
});

test('prepareCached 於 reinitialize 後重建 statement，不打在已關閉連線上', () => {
  const s1 = db.prepareCached('SELECT 1 AS x');
  assert.strictEqual(s1.get().x, 1);
  db.reinitialize();
  const s2 = db.prepareCached('SELECT 1 AS x');
  assert.notStrictEqual(s2, s1, 'reinitialize 後應是新 statement 而非快取舊物件');
  assert.strictEqual(s2.get().x, 1);
});

test('metricsFor 在 reinitialize（備份匯入 hot-swap）後仍可用', () => {
  const goal = { goal_type: 'chapter', subject_id: null };
  const window = { from: null, to: null };
  assert.strictEqual(metricsFor(1, goal, window).chapterDoneCount, 0);
  db.reinitialize();
  assert.strictEqual(metricsFor(1, goal, window).chapterDoneCount, 0);

  const gradeGoal = { goal_type: 'grade', subject_id: 1, exam_type: null };
  assert.strictEqual(metricsFor(1, gradeGoal, window).bestScore, null);
});
