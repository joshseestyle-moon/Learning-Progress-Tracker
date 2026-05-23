import { get, escHtml, fmtDate, daysLeft } from './api.js';

export async function render(el) {
  const [timetable, assignments, exams, chapters] = await Promise.all([
    get('/timetable'),
    get('/assignments?upcoming=7'),
    get('/exams?upcoming=5'),
    get('/chapters'),
  ]);

  const todayIdx = (new Date().getDay() + 6) % 7; // 0=Mon
  const todaySlots = timetable.filter(s => s.day_of_week === todayIdx)
    .sort((a, b) => a.period - b.period);

  // Chapter progress summary per subject
  const subjectMap = {};
  for (const c of chapters) {
    if (!subjectMap[c.subject_id]) subjectMap[c.subject_id] = { name: c.subject_name, color: c.subject_color, done: 0, total: 0 };
    subjectMap[c.subject_id].total++;
    if (c.is_done) subjectMap[c.subject_id].done++;
  }
  const subjectProgress = Object.values(subjectMap).filter(s => s.total > 0);

  el.innerHTML = `
    <div class="dashboard-grid">

      <!-- Today's timetable -->
      <div class="card">
        <div class="card-title">📅 今日課表</div>
        ${todaySlots.length ? todaySlots.map(s => `
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem;">
            <span style="font-size:.78rem;color:var(--text2);min-width:50px;">第${s.period}節</span>
            <span class="badge" style="background:${s.subject_color}">${escHtml(s.subject_name)}</span>
          </div>`).join('') :
          '<div class="text-muted text-sm">今天沒有課程</div>'}
      </div>

      <!-- Upcoming assignments -->
      <div class="card">
        <div class="card-title">📝 即將到期作業</div>
        ${assignments.length ? assignments.map(a => {
          const d = daysLeft(a.due_date);
          const urgency = d <= 1 ? 'urgent' : d <= 3 ? 'soon' : 'ok';
          return `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
            <div>
              <span class="badge" style="background:${a.subject_color};margin-right:.4rem">${escHtml(a.subject_name)}</span>
              <span style="font-size:.9rem">${escHtml(a.title)}</span>
            </div>
            <span class="countdown-pill ${urgency}">${d <= 0 ? '今天！' : d === 1 ? '明天' : d + ' 天'}</span>
          </div>`;
        }).join('') : '<div class="text-muted text-sm">近 7 天內沒有作業</div>'}
      </div>

      <!-- Exam countdown -->
      <div class="card">
        <div class="card-title">⏰ 考試倒數</div>
        ${exams.length ? exams.map(e => {
          const d = e.days_left;
          const urgency = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
          const typeLabel = {quiz:'小考',midterm:'期中',final:'期末',mock:'模考'}[e.exam_type] || e.exam_type;
          return `
          <div style="margin-bottom:.75rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <span class="badge" style="background:${e.subject_color};margin-right:.4rem">${escHtml(e.subject_name)}</span>
                <span class="chip">${typeLabel}</span>
              </div>
              <span class="countdown-pill ${urgency}">${d <= 0 ? '今天！' : d + ' 天後'}</span>
            </div>
            <div style="font-size:.85rem;margin-top:.25rem;color:var(--text2);">${escHtml(e.title)} · ${fmtDate(e.exam_date)}</div>
          </div>`;
        }).join('') : '<div class="text-muted text-sm">近期沒有考試</div>'}
      </div>

      <!-- Reading progress -->
      <div class="card">
        <div class="card-title">📖 讀書進度總覽</div>
        ${subjectProgress.length ? subjectProgress.map(s => {
          const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
          return `
          <div style="margin-bottom:.85rem;">
            <div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">
              <span style="font-size:.88rem;font-weight:600;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:.4rem;"></span>
                ${escHtml(s.name)}
              </span>
              <span class="text-xs text-muted">${s.done}/${s.total} (${pct}%)</span>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width:${pct}%;background:${s.color}"></div>
            </div>
          </div>`;
        }).join('') : '<div class="text-muted text-sm">尚未設定章節</div>'}
      </div>

    </div>`;
}
