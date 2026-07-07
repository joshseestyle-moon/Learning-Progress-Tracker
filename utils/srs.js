// Spaced-repetition scheduling (pure, no DB dependency — unit-testable).
//
// After a preview or review session is completed, the NEXT review session
// (targetSeq) is scheduled INTERVALS[targetSeq-1] days later. Intervals grow
// so recall is tested at expanding gaps — the core of spaced repetition.
//
//   preview done            -> schedule review #1  (+1 day)
//   review #1 done          -> schedule review #2  (+3 days)
//   review #2 done          -> schedule review #3  (+7 days)
//   review #3 done          -> schedule review #4  (+16 days)
//   review #4 done and on   -> schedule review #n  (+35 days)
const INTERVALS = [1, 3, 7, 16, 35];

// doneDate: 'YYYY-MM-DD' (the day the previous session was completed)
// targetSeq: the review sequence number being scheduled (1-based)
// -> returns 'YYYY-MM-DD' for the next review
function nextReviewDate(doneDate, targetSeq) {
  const idx = Math.min(Math.max(targetSeq, 1), INTERVALS.length) - 1;
  const days = INTERVALS[idx];
  const d = new Date(doneDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { nextReviewDate, INTERVALS };
