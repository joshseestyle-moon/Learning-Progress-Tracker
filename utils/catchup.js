// Catch-up planner (pure, no DB — unit-testable).
// Redistributes overdue chapter_progress items over the coming days: oldest
// first, spread evenly (least-loaded earliest day wins), never exceeding
// maxPerDay per calendar day; when every day in the window is full the window
// grows by one day (overflow rolls forward instead of overloading).

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// items: [{ id, scheduled_date }] — overdue items, any order.
// existingLoadByDate: { 'YYYY-MM-DD': count } — not-yet-done items already scheduled.
// Returns [{ id, newDate }] with newDate in [todayStr, todayStr + windowLen).
function planCatchup({ items, existingLoadByDate = {}, todayStr, days = 7, maxPerDay = 3 }) {
  if (!items || !items.length) return [];
  const sorted = [...items].sort((a, b) =>
    String(a.scheduled_date || '').localeCompare(String(b.scheduled_date || '')) || (a.id - b.id));
  const load = { ...existingLoadByDate };
  let windowLen = Math.max(1, days);
  const out = [];
  for (const it of sorted) {
    let best = -1, bestLoad = Infinity;
    for (let i = 0; i < windowLen; i++) {
      const l = load[addDays(todayStr, i)] || 0;
      if (l >= maxPerDay) continue;
      if (l < bestLoad) { best = i; bestLoad = l; }
    }
    if (best === -1) { best = windowLen; windowLen++; }
    const date = addDays(todayStr, best);
    load[date] = (load[date] || 0) + 1;
    out.push({ id: it.id, newDate: date });
  }
  return out;
}

module.exports = { planCatchup, addDays };
