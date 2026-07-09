const { test } = require('node:test');
const assert = require('node:assert');
const { planCatchup, addDays } = require('../utils/catchup');

const T = '2026-07-09';

test('planCatchup: empty input returns empty plan', () => {
  assert.deepEqual(planCatchup({ items: [], todayStr: T }), []);
});

test('planCatchup: oldest overdue item gets the earliest slot', () => {
  const items = [
    { id: 1, scheduled_date: '2026-07-05' },
    { id: 2, scheduled_date: '2026-07-01' }, // oldest
    { id: 3, scheduled_date: '2026-07-03' },
  ];
  const plan = planCatchup({ items, todayStr: T });
  const byId = Object.fromEntries(plan.map(p => [p.id, p.newDate]));
  // oldest-first assignment onto empty days → 07-09, 07-10, 07-11
  assert.equal(byId[2], '2026-07-09');
  assert.equal(byId[3], '2026-07-10');
  assert.equal(byId[1], '2026-07-11');
});

test('planCatchup: spreads evenly instead of stacking one day', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, scheduled_date: '2026-07-01' }));
  const plan = planCatchup({ items, todayStr: T, days: 7, maxPerDay: 3 });
  const counts = {};
  for (const p of plan) counts[p.newDate] = (counts[p.newDate] || 0) + 1;
  // 7 items over 7 empty days → one per day
  assert.equal(Object.keys(counts).length, 7);
  assert.ok(Object.values(counts).every(c => c === 1));
});

test('planCatchup: respects maxPerDay including existing load', () => {
  const items = [
    { id: 1, scheduled_date: '2026-07-01' },
    { id: 2, scheduled_date: '2026-07-02' },
  ];
  // today already carries 3 scheduled items → day 0 is full
  const plan = planCatchup({
    items, todayStr: T, days: 2, maxPerDay: 3,
    existingLoadByDate: { '2026-07-09': 3 },
  });
  assert.ok(plan.every(p => p.newDate !== '2026-07-09'));
});

test('planCatchup: overflow extends the window instead of exceeding the cap', () => {
  // 10 items into a 2-day window with cap 3 → 6 fit, 4 spill into extra days
  const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, scheduled_date: '2026-07-01' }));
  const plan = planCatchup({ items, todayStr: T, days: 2, maxPerDay: 3 });
  const counts = {};
  for (const p of plan) counts[p.newDate] = (counts[p.newDate] || 0) + 1;
  assert.ok(Object.values(counts).every(c => c <= 3), 'no day exceeds maxPerDay');
  assert.equal(plan.length, 10, 'every item is scheduled');
  assert.ok(counts[addDays(T, 2)] > 0, 'overflow rolled past the window');
});

test('planCatchup: null scheduled_date sorts first, ties broken by id', () => {
  const items = [
    { id: 9, scheduled_date: '2026-07-01' },
    { id: 4, scheduled_date: null },
    { id: 2, scheduled_date: null },
  ];
  const plan = planCatchup({ items, todayStr: T });
  assert.equal(plan[0].id, 2);
  assert.equal(plan[1].id, 4);
  assert.equal(plan[2].id, 9);
});

test('addDays crosses month boundaries', () => {
  assert.equal(addDays('2026-07-30', 3), '2026-08-02');
});
