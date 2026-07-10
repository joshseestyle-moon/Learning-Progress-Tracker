const { test } = require('node:test');
const assert = require('node:assert');
const { schoolYearRange, lastWeekRange, prevRange } = require('../utils/reportRange');

test('schoolYearRange: no periods → Taiwan Aug1..Jul31 span', () => {
  assert.deepEqual(schoolYearRange(114, []), { from: '2025-08-01', to: '2026-07-31' });
  assert.deepEqual(schoolYearRange(115), { from: '2026-08-01', to: '2027-07-31' });
});

test('schoolYearRange: with periods → min start .. max end', () => {
  const periods = [
    { start_date: '2025-09-01', end_date: '2026-01-20' },
    { start_date: '2026-02-15', end_date: '2026-06-30' },
  ];
  assert.deepEqual(schoolYearRange(114, periods), { from: '2025-09-01', to: '2026-06-30' });
});

test('lastWeekRange: Thursday 2026-01-01 → prior Mon..Sun 2025-12-22..28', () => {
  assert.deepEqual(lastWeekRange('2026-01-01'), { from: '2025-12-22', to: '2025-12-28' });
});

test('lastWeekRange: on a Monday returns the immediately prior full week', () => {
  // 2026-07-06 is a Monday → last week is 2026-06-29 .. 2026-07-05
  assert.deepEqual(lastWeekRange('2026-07-06'), { from: '2026-06-29', to: '2026-07-05' });
});

test('lastWeekRange: on a Sunday still returns the PREVIOUS complete week', () => {
  // 2026-07-12 is a Sunday → this week's Monday is 07-06, last week 06-29..07-05
  assert.deepEqual(lastWeekRange('2026-07-12'), { from: '2026-06-29', to: '2026-07-05' });
});

test('prevRange: same length, immediately preceding', () => {
  assert.deepEqual(prevRange({ from: '2026-05-01', to: '2026-05-07' }), { from: '2026-04-24', to: '2026-04-30' });
  // single-day range
  assert.deepEqual(prevRange({ from: '2026-05-10', to: '2026-05-10' }), { from: '2026-05-09', to: '2026-05-09' });
});
