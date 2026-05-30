import { get, escHtml, fmtDate, today, getUserName } from './api.js';
import { t } from './i18n.js';

function TYPE_LABEL() {
  return {
    quiz:    t('enum.examType.quiz'),
    segment: t('enum.examType.segment'),
    midterm: t('enum.examType.midterm'),
    final:   t('enum.examType.final'),
    mock:    t('enum.examType.mock'),
  };
}

function getWeekRange() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Mon=0
  const mon = new Date(now); mon.setDate(now.getDate() - dow);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(mon), end: fmt(sun) };
}

export async function render(el) {
  el.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t('app.loading')}</div>`;

  const [exams, scheduled] = await Promise.all([
    get('/exams?upcoming=8'),
    get('/chapters/scheduled'),
  ]);

  const week   = getWeekRange();
  const todayStr = today();
  const userName = getUserName() || t('print.defaultUser');

  const weekPlan = scheduled.filter(s => s.scheduled_date >= week.start && s.scheduled_date <= week.end)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  el.innerHTML = `
    <div class="print-controls no-print">
      <button class="btn btn-ghost btn-sm" onclick="history.back()">${t('print.back')}</button>
      <button class="btn btn-primary btn-sm" onclick="window.print()">${t('print.print')}</button>
    </div>

    <div class="print-page">
      <div class="print-header">
        <h1>${t('print.title')}</h1>
        <div class="meta">
          ${escHtml(userName)}<br>
          ${t('print.dateLabel', { date: fmtDate(todayStr) })}<br>
          ${t('print.thisWeek', { start: fmtDate(week.start), end: fmtDate(week.end) })}
        </div>
      </div>

      <div class="print-section-title">${t('print.upcomingExams')}</div>
      ${buildExams(exams)}

      <div class="print-section-title">${t('print.weeklyPlan')}</div>
      ${buildWeekPlan(weekPlan, todayStr)}

      <div class="print-footer">
        <span>${t('print.systemName')}</span>
        <span>${escHtml(userName)}・${todayStr}</span>
      </div>
    </div>`;
}

function buildExams(exams) {
  const upcoming = exams.filter(e => !e.is_completed);
  if (!upcoming.length) return `<div style="color:#aaa;font-size:11px;padding:4px;">${t('print.noExams')}</div>`;

  const labels = TYPE_LABEL();
  return upcoming.map(e => {
    const d       = e.days_left;
    const cls     = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
    const daysStr = d <= 0 ? t('exam.today') : t('exam.daysLeft', { n: d });
    return `
      <div class="print-exam-row">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <span class="print-badge" style="background:${e.subject_color};">${escHtml(e.subject_name)}</span>
          <span class="print-chip">${labels[e.exam_type] || e.exam_type}</span>
          <span style="font-weight:600;">${escHtml(e.title)}</span>
          <span class="print-days-left ${cls}">${daysStr}</span>
        </div>
        <div style="font-size:10px;color:#666;margin-top:1px;">${fmtDate(e.exam_date)}${e.notes ? '・' + escHtml(e.notes) : ''}</div>
      </div>`;
  }).join('');
}

function buildWeekPlan(items, todayStr) {
  if (!items.length) return `<div style="color:#aaa;font-size:11px;padding:4px 0;">${t('print.noPlan')}</div>`;

  const rows = items.map(s => {
    const typeLabel = t(s.type === 'preview' ? 'print.typePreview' : 'print.typeReview', { seq: s.seq });
    const isDone    = s.is_done;
    return `
      <tr class="${isDone ? 'done' : ''}">
        <td>${fmtDate(s.scheduled_date)}${s.scheduled_date === todayStr ? ' 📌' : ''}</td>
        <td><span class="print-badge" style="background:${s.subject_color};">${escHtml(s.subject_name)}</span></td>
        <td>${escHtml(s.chapter_title)}</td>
        <td style="text-align:center;">${typeLabel}</td>
        <td style="text-align:center;">${isDone ? '✓' : '○'}</td>
        <td style="font-size:10px;color:#777;">${s.notes ? escHtml(s.notes) : ''}</td>
      </tr>`;
  }).join('');

  return `
    <table class="print-plan-table">
      <thead>
        <tr>
          <th style="width:90px;">${t('th.date')}</th>
          <th style="width:70px;">${t('th.subject')}</th>
          <th>${t('th.chapter')}</th>
          <th style="width:70px;text-align:center;">${t('th.type')}</th>
          <th style="width:36px;text-align:center;">${t('th.done')}</th>
          <th>${t('label.notes')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
