const { test } = require('node:test');
const assert = require('node:assert');
const { goalWindow, computeProgress } = require('../utils/goalProgress');

test('goalWindow: linked period wins over due_date', () => {
  const goal = { created_at: '2026-01-05 10:00:00', due_date: '2026-03-01' };
  const period = { start_date: '2026-02-01', end_date: '2026-06-30' };
  assert.deepStrictEqual(goalWindow(goal, period), { from: '2026-02-01', to: '2026-06-30' });
});

test('goalWindow: created_at..due_date when no period', () => {
  const goal = { created_at: '2026-01-05 10:00:00', due_date: '2026-03-01' };
  assert.deepStrictEqual(goalWindow(goal, null), { from: '2026-01-05', to: '2026-03-01' });
});

test('goalWindow: open-ended when no period and no due_date', () => {
  const goal = { created_at: '2026-01-05 10:00:00', due_date: null };
  assert.deepStrictEqual(goalWindow(goal, null), { from: '2026-01-05', to: null });
});

test('goalWindow: missing created_at yields null from', () => {
  assert.deepStrictEqual(goalWindow({ due_date: null }, null), { from: null, to: null });
});

test('chapter goal: below / at / above target', () => {
  const goal = { goal_type: 'chapter', target_value: 5 };
  assert.deepStrictEqual(computeProgress(goal, { chapterDoneCount: 3 }),
    { progress: 3, target: 5, achieved: false });
  assert.deepStrictEqual(computeProgress(goal, { chapterDoneCount: 5 }),
    { progress: 5, target: 5, achieved: true });
  assert.deepStrictEqual(computeProgress(goal, { chapterDoneCount: 9 }),
    { progress: 9, target: 5, achieved: true });
});

test('chapter goal: zero target is never achieved', () => {
  const goal = { goal_type: 'chapter', target_value: 0 };
  assert.strictEqual(computeProgress(goal, { chapterDoneCount: 10 }).achieved, false);
});

test('grade goal: no score yet → progress null, not achieved', () => {
  const goal = { goal_type: 'grade', target_value: 90 };
  assert.deepStrictEqual(computeProgress(goal, { bestScore: null }),
    { progress: null, target: 90, achieved: false });
});

test('grade goal: best score meets target (incl. exact boundary)', () => {
  const goal = { goal_type: 'grade', target_value: 90 };
  assert.strictEqual(computeProgress(goal, { bestScore: 89.5 }).achieved, false);
  assert.strictEqual(computeProgress(goal, { bestScore: 90 }).achieved, true);
  assert.strictEqual(computeProgress(goal, { bestScore: 100 }).achieved, true);
});

test('grade goal: score of 0 counts as progress, not null', () => {
  const goal = { goal_type: 'grade', target_value: 60 };
  const r = computeProgress(goal, { bestScore: 0 });
  assert.strictEqual(r.progress, 0);
  assert.strictEqual(r.achieved, false);
});

test('text goal follows is_done', () => {
  assert.strictEqual(computeProgress({ goal_type: 'text', is_done: 0 }).achieved, false);
  assert.strictEqual(computeProgress({ goal_type: 'text', is_done: 1 }).achieved, true);
});
