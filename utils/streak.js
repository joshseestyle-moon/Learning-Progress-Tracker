// Streak calculations over a list of 'YYYY-MM-DD' date strings (pure, no DB —
// unit-testable). Dates are treated as calendar days; input need not be sorted
// for computeCurrentStreak, but computeMaxStreak expects ascending order.

function _toDate(s) { return new Date(s + 'T00:00:00'); }
function _key(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Longest run of consecutive calendar days anywhere in the (ascending) list.
function computeMaxStreak(sortedDates) {
  if (!sortedDates.length) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const diffDays = Math.round((_toDate(sortedDates[i]) - _toDate(sortedDates[i - 1])) / 86400000);
    if (diffDays === 1) { cur++; if (cur > max) max = cur; }
    else if (diffDays > 1) cur = 1;
  }
  return max;
}

// Current run of consecutive days ending today (or yesterday — so a streak is
// not shown as broken until a full day has been missed). todayStr is injectable
// for deterministic tests; defaults to the local date.
function computeCurrentStreak(dates, todayStr) {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const today = todayStr || _key(new Date());
  const cursor = _toDate(today);
  if (!set.has(_key(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(_key(cursor))) return 0; // missed both today and yesterday
  }
  let count = 0;
  while (set.has(_key(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

// Combo: consecutive days (ending today, with the same yesterday-grace as
// computeCurrentStreak) where study minutes met the daily goal.
// minutesByDate: { 'YYYY-MM-DD': totalMinutes }. goal <= 0 means no goal set → combo 0.
function computeComboDays(minutesByDate, goal, todayStr) {
  if (!goal || goal <= 0) return 0;
  const qualifying = Object.keys(minutesByDate).filter(d => minutesByDate[d] >= goal);
  return computeCurrentStreak(qualifying, todayStr);
}

// +10% per combo day, capped at ×2.0 (10 days).
function comboMultiplier(days) {
  return 1 + 0.1 * Math.min(Math.max(0, days), 10);
}

// Shared local-date helpers ('YYYY-MM-DD' in the machine's timezone) — the
// single source for "today" across gamify/checker/routes.
function localToday() { return _key(new Date()); }

module.exports = { computeMaxStreak, computeCurrentStreak, computeComboDays, comboMultiplier, dateKey: _key, localToday };
