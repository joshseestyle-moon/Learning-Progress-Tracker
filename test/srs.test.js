const { test } = require('node:test');
const assert = require('node:assert');
const { nextReviewDate, INTERVALS } = require('../utils/srs');

test('review #1 is scheduled 1 day after the preview', () => {
  assert.equal(nextReviewDate('2026-07-08', 1), '2026-07-09');
});

test('later reviews use growing intervals', () => {
  assert.equal(nextReviewDate('2026-07-08', 2), '2026-07-11'); // +3
  assert.equal(nextReviewDate('2026-07-08', 3), '2026-07-15'); // +7
  assert.equal(nextReviewDate('2026-07-08', 4), '2026-07-24'); // +16
});

test('sequences beyond the table clamp to the last interval', () => {
  assert.equal(nextReviewDate('2026-07-08', 99), nextReviewDate('2026-07-08', INTERVALS.length));
  // 2026-01-01 + 35 days (last interval) = 2026-02-05
  assert.equal(nextReviewDate('2026-01-01', 5), '2026-02-05');
});

test('crosses month boundaries correctly', () => {
  assert.equal(nextReviewDate('2026-07-30', 1), '2026-07-31');
  assert.equal(nextReviewDate('2026-07-31', 1), '2026-08-01');
});

test('targetSeq below 1 is treated as 1', () => {
  assert.equal(nextReviewDate('2026-07-08', 0), nextReviewDate('2026-07-08', 1));
});
