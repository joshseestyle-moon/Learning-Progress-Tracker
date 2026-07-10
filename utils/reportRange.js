// Date-range derivation for the portfolio report and weekly recap (pure).
// All ranges are inclusive [from, to] local calendar dates.
const { addDays } = require('./catchup');

// Taiwan school year `rocYear` (民國) runs Aug 1 (rocYear+1911) → Jul 31 (rocYear+1912).
// If the user has defined periods for the year, span their actual dates instead.
function schoolYearRange(rocYear, periods = []) {
  if (periods && periods.length) {
    let from = periods[0].start_date, to = periods[0].end_date;
    for (const p of periods) {
      if (p.start_date < from) from = p.start_date;
      if (p.end_date > to) to = p.end_date;
    }
    return { from, to };
  }
  return { from: `${rocYear + 1911}-08-01`, to: `${rocYear + 1912}-07-31` };
}

// The most recent COMPLETE Monday–Sunday week (i.e. last week, not this week).
function lastWeekRange(todayStr) {
  const dow = new Date(todayStr + 'T00:00:00').getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = addDays(todayStr, -daysSinceMonday);
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

// The same-length range immediately preceding [from, to] (for period comparison).
function prevRange({ from, to }) {
  const lengthDays = Math.round(
    (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1;
  return { from: addDays(from, -lengthDays), to: addDays(from, -1) };
}

module.exports = { schoolYearRange, lastWeekRange, prevRange };
