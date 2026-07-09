const { test } = require('node:test');
const assert = require('node:assert');
const { MAX_LEVEL, XP_RULES, SURPRISE_TIERS, xpToAdvance, levelForXp, rollSurpriseTier } = require('../utils/xp');

test('xpToAdvance: grows linearly (100, 175, 250, ...)', () => {
  assert.equal(xpToAdvance(1), 100);
  assert.equal(xpToAdvance(2), 175);
  assert.equal(xpToAdvance(10), 775);
});

test('levelForXp: level is monotonic non-decreasing in XP', () => {
  let prev = 0;
  for (let xp = 0; xp <= 30000; xp += 137) {
    const { level } = levelForXp(xp);
    assert.ok(level >= prev, `level dropped at xp=${xp}`);
    prev = level;
  }
});

test('levelForXp: boundaries — 0 and 99 XP are level 1, 100 XP is level 2', () => {
  assert.deepEqual(levelForXp(0), { level: 1, intoLevel: 0, toNext: 100, titleTier: 1 });
  assert.equal(levelForXp(99).level, 1);
  const l2 = levelForXp(100);
  assert.equal(l2.level, 2);
  assert.equal(l2.intoLevel, 0);
  assert.equal(l2.toNext, 175);
});

test('levelForXp: intoLevel + toNext always equals xpToAdvance(level) below cap', () => {
  for (const xp of [0, 50, 100, 500, 12345]) {
    const r = levelForXp(xp);
    if (r.level < MAX_LEVEL) assert.equal(r.intoLevel + r.toNext, xpToAdvance(r.level));
  }
});

test('levelForXp: caps at MAX_LEVEL with toNext 0', () => {
  const r = levelForXp(10_000_000);
  assert.equal(r.level, MAX_LEVEL);
  assert.equal(r.toNext, 0);
  assert.equal(r.titleTier, 10);
});

test('levelForXp: title tier advances every 5 levels', () => {
  assert.equal(levelForXp(0).titleTier, 1); // level 1
  // sum of xpToAdvance(1..5) = 100+175+250+325+400 = 1250 → level 6 → tier 2
  assert.equal(levelForXp(1250).level, 6);
  assert.equal(levelForXp(1250).titleTier, 2);
});

test('levelForXp: negative / garbage input treated as 0', () => {
  assert.equal(levelForXp(-500).level, 1);
  assert.equal(levelForXp(NaN).level, 1);
});

test('rollSurpriseTier: injected RNG hits each weighted band', () => {
  // cumulative weights: 55, 85, 97, 100
  assert.deepEqual(rollSurpriseTier(() => 0.0), { tier: 1, points: 5 });
  assert.deepEqual(rollSurpriseTier(() => 0.549), { tier: 1, points: 5 });
  assert.deepEqual(rollSurpriseTier(() => 0.55), { tier: 2, points: 10 });
  assert.deepEqual(rollSurpriseTier(() => 0.849), { tier: 2, points: 10 });
  assert.deepEqual(rollSurpriseTier(() => 0.85), { tier: 3, points: 20 });
  assert.deepEqual(rollSurpriseTier(() => 0.969), { tier: 3, points: 20 });
  assert.deepEqual(rollSurpriseTier(() => 0.97), { tier: 4, points: 50 });
  assert.deepEqual(rollSurpriseTier(() => 0.999), { tier: 4, points: 50 });
});

test('rollSurpriseTier: weights sum to 100', () => {
  assert.equal(SURPRISE_TIERS.reduce((s, t) => s + t.weight, 0), 100);
});

test('XP_RULES: expected amounts', () => {
  assert.equal(XP_RULES.studyPerMinute, 1);
  assert.equal(XP_RULES.studyDailyCap, 180);
  assert.equal(XP_RULES.assignmentDone, 10);
  assert.deepEqual(XP_RULES.goal, { short: 30, mid: 60, long: 100 });
});
