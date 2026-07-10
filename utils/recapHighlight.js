// Pick the single celebratory highlight for the weekly recap card (pure).
// Encouragement-first: never surfaces a shortfall — falls through to 'default'.
function pickRecapHighlight(stats, prevStats = {}) {
  if (stats.goals >= 1) return 'goals';
  if (stats.chapters >= 3) return 'chapters';
  if (stats.minutes > 0 && stats.minutes > (prevStats.minutes || 0)) return 'minutes';
  return 'default';
}

module.exports = { pickRecapHighlight };
