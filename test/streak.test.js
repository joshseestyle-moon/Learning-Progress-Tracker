const { test } = require('node:test');
const assert = require('node:assert');
const { computeMaxStreak, computeCurrentStreak } = require('../utils/streak');

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
