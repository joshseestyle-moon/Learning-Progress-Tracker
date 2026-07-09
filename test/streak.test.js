const { test } = require('node:test');
const assert = require('node:assert');
const { computeMaxStreak, computeCurrentStreak, computeComboDays, comboMultiplier } = require('../utils/streak');

test('computeMaxStreak: empty is 0', () => {
  assert.equal(computeMaxStreak([]), 0);
});

test('computeMaxStreak: finds the longest consecutive run', () => {
  // 3-day run, gap, 2-day run
  assert.equal(computeMaxStreak(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07']), 3);
});

test('computeMaxStreak: single day is 1', () => {
  assert.equal(computeMaxStreak(['2026-07-01']), 1);
});

test('computeCurrentStreak: counts back from today', () => {
  const dates = ['2026-07-06', '2026-07-07', '2026-07-08'];
  assert.equal(computeCurrentStreak(dates, '2026-07-08'), 3);
});

test('computeCurrentStreak: still valid if today not yet logged (ended yesterday)', () => {
  const dates = ['2026-07-06', '2026-07-07'];
  assert.equal(computeCurrentStreak(dates, '2026-07-08'), 2);
});

test('computeCurrentStreak: broken when both today and yesterday missing', () => {
  const dates = ['2026-07-01', '2026-07-02'];
  assert.equal(computeCurrentStreak(dates, '2026-07-08'), 0);
});

test('computeCurrentStreak: empty is 0', () => {
  assert.equal(computeCurrentStreak([], '2026-07-08'), 0);
});

test('computeCurrentStreak: unsorted input and duplicates handled', () => {
  const dates = ['2026-07-08', '2026-07-06', '2026-07-07', '2026-07-07'];
  assert.equal(computeCurrentStreak(dates, '2026-07-08'), 3);
});

test('computeComboDays: no goal set (0 or missing) → combo 0', () => {
  assert.equal(computeComboDays({ '2026-07-08': 120 }, 0, '2026-07-08'), 0);
  assert.equal(computeComboDays({ '2026-07-08': 120 }, undefined, '2026-07-08'), 0);
});

test('computeComboDays: counts only days meeting the goal', () => {
  const m = { '2026-07-06': 60, '2026-07-07': 30, '2026-07-08': 60 };
  // 07-07 misses the 60-min goal → streak is just today
  assert.equal(computeComboDays(m, 60, '2026-07-08'), 1);
});

test('computeComboDays: today not yet qualified keeps yesterday-ending streak', () => {
  const m = { '2026-07-06': 60, '2026-07-07': 60, '2026-07-08': 10 };
  assert.equal(computeComboDays(m, 60, '2026-07-08'), 2);
});

test('computeComboDays: broken when today and yesterday both miss the goal', () => {
  const m = { '2026-07-05': 60, '2026-07-06': 60 };
  assert.equal(computeComboDays(m, 60, '2026-07-08'), 0);
});

test('comboMultiplier: 1.0 at 0 days, +0.1/day, capped ×2.0 at 10+', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.ok(Math.abs(comboMultiplier(3) - 1.3) < 1e-9);
  assert.equal(comboMultiplier(10), 2);
  assert.equal(comboMultiplier(25), 2);
  assert.equal(comboMultiplier(-2), 1);
});
