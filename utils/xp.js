// XP / level curve and daily-surprise tier rolling (pure, no DB — unit-testable).
// XP is permanent growth value (xp_log), separate from spendable points (point_log).

const MAX_LEVEL = 50;
const TITLE_TIERS = 10; // one tier per 5 levels; i18n keys level.title.1..10

// XP amounts granted per activity. Study XP is capped per calendar day.
const XP_RULES = {
  studyPerMinute: 1,
  studyDailyCap: 180,
  taskPart: 3,
  taskComplete: 5, // extra on top of the last part's XP
  chapterDone: 15,
  assignmentDone: 10,
  goal: { short: 30, mid: 60, long: 100 },
  questDefault: 50,
};

// XP needed to go from `level` to `level + 1`.
function xpToAdvance(level) {
  return 100 + (level - 1) * 75;
}

// Map cumulative XP to { level, intoLevel, toNext, titleTier }.
// Level is capped at MAX_LEVEL (toNext = 0 there).
function levelForXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp) || 0);
  while (level < MAX_LEVEL && remaining >= xpToAdvance(level)) {
    remaining -= xpToAdvance(level);
    level++;
  }
  const atCap = level >= MAX_LEVEL;
  return {
    level,
    intoLevel: atCap ? 0 : remaining,
    toNext: atCap ? 0 : xpToAdvance(level) - remaining,
    titleTier: Math.min(TITLE_TIERS, Math.floor((level - 1) / 5) + 1),
  };
}

// Daily surprise tiers: +5 (55%), +10 (30%), +20 (12%), +50 (3%).
const SURPRISE_TIERS = [
  { points: 5, weight: 55 },
  { points: 10, weight: 30 },
  { points: 20, weight: 12 },
  { points: 50, weight: 3 },
];

// rand is injectable (() => [0,1)) for deterministic tests.
function rollSurpriseTier(rand) {
  const r = (rand || Math.random)() * 100;
  let acc = 0;
  for (let i = 0; i < SURPRISE_TIERS.length; i++) {
    acc += SURPRISE_TIERS[i].weight;
    if (r < acc) return { tier: i + 1, points: SURPRISE_TIERS[i].points };
  }
  return { tier: 1, points: SURPRISE_TIERS[0].points };
}

module.exports = { MAX_LEVEL, XP_RULES, SURPRISE_TIERS, xpToAdvance, levelForXp, rollSurpriseTier };
