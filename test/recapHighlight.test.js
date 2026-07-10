const { test } = require('node:test');
const assert = require('node:assert');
const { pickRecapHighlight } = require('../utils/recapHighlight');

test('goals win over everything', () => {
  assert.equal(pickRecapHighlight({ goals: 1, chapters: 9, minutes: 999 }, { minutes: 0 }), 'goals');
});

test('chapters (>=3) win when no goals', () => {
  assert.equal(pickRecapHighlight({ goals: 0, chapters: 3, minutes: 10 }, { minutes: 999 }), 'chapters');
  assert.equal(pickRecapHighlight({ goals: 0, chapters: 2, minutes: 10 }, { minutes: 0 }), 'minutes');
});

test('minutes highlight only when strictly more than prior week and > 0', () => {
  assert.equal(pickRecapHighlight({ goals: 0, chapters: 0, minutes: 100 }, { minutes: 80 }), 'minutes');
  assert.equal(pickRecapHighlight({ goals: 0, chapters: 0, minutes: 80 }, { minutes: 80 }), 'default');
  assert.equal(pickRecapHighlight({ goals: 0, chapters: 0, minutes: 0 }, { minutes: 0 }), 'default');
});

test('default when nothing stands out', () => {
  assert.equal(pickRecapHighlight({ goals: 0, chapters: 1, minutes: 30 }, { minutes: 100 }), 'default');
  assert.equal(pickRecapHighlight({ goals: 0, chapters: 0, minutes: 0 }, {}), 'default');
});
