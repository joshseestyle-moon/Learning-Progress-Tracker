import { get, escHtml, fmtDate, today } from './api.js';

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function render(el) {
  const todayStr    = today();
  const tomorrowStr = tomorrow();

  let timetable, exams, scheduled, chapters;
  try {
    [timetable, exams, scheduled, chapters] = await Promise.all([
      get('/timetable'),
      get('/exams?upcoming=5'),
      get('/chapters/scheduled'),
      get('/chapters'),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">載入失敗：${e.message}</p></div>`;
    return;
  }

  const progressMap = {};
  for (const c of chapters) {
    if (!progressMap[c.subject_id]) progressMap[c.subject_id] = { total: 0, prevDone: 0, revDone: 0 };
    const p = progressMap[c.subject_id];
    p.total++;
    if (c.preview_done) p.prevDone++;
    if ((c.reviews || []).some(r => r.is_done)) p.revDone++;
  }

  const todayIdx    = (new Date().getDay() + 6) % 7;
  const tomorrowIdx = (todayIdx + 1) % 7;

  const todaySlots    = timetable.filter(s => s.day_of_week === todayIdx).sort((a, b) => a.period - b.period);
  const tomorrowSlots = timetable.filter(s => s.day_of_week === tomorrowIdx).sort((a, b) => a.period - b.period);

  const todayProgress    = scheduled.filter(p => p.scheduled_date === todayStr);
  const tomorrowProgress = scheduled.filter(p => p.scheduled_date === tomorrowStr);

  el.innerHTML = `
    <div class="dashboard-grid">

      <!-- Today's timetable -->
      <div class="card">
        <div class="card-title">📅 今日課表</div>
        ${timetableCard(todaySlots, '今天沒有課程')}
      </div>

      <!-- Tomorrow's timetable -->
      <div class="card">
        <div class="card-title">📅 明日課表</div>
        ${timetableCard(tomorrowSlots, '明天沒有課程')}
      </div>

      <!-- Today's study progress -->
      <div class="card">
        <div class="card-title">📚 今日讀書進度</div>
        ${studyCard(todayProgress, '今日沒有排定的讀書計畫')}
      </div>

      <!-- Tomorrow's study progress -->
      <div class="card">
        <div class="card-title">📚 明日讀書進度</div>
        ${studyCard(tomorrowProgress, '明日沒有排定的讀書計畫')}
      </div>

      <!-- Exam countdown -->
      <div class="card">
        <div class="card-title">⏰ 考試倒數</div>
        ${exams.length ? exams.map(e => {
          const d = e.days_left;
          const urgency = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
          const typeLabel = { quiz:'小考', segment:'段考', midterm:'期中考', final:'期末考', mock:'模擬考' }[e.exam_type] || e.exam_type;
          const prog = progressMap[e.subject_id];
          const progressBar = prog && prog.total > 0 ? (() => {
            const prevPct = Math.round(prog.prevDone / prog.total * 100);
            const revPct  = Math.round(prog.revDone  / prog.total * 100);
            return `
            <div style="margin-top:.45rem;display:flex;flex-direction:column;gap:4px;">
              <div style="display:flex;align-items:center;gap:.5rem;">
                <span style="font-size:.68rem;color:var(--accent);min-width:2.2rem;">預習</span>
                <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
                  <div style="height:100%;width:${prevPct}%;background:var(--accent);border-radius:999px;"></div>
                </div>
                <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.prevDone}/${prog.total}</span>
              </div>
              <div style="display:flex;align-items:center;gap:.5rem;">
                <span style="font-size:.68rem;color:var(--success);min-width:2.2rem;">複習</span>
                <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
                  <div style="height:100%;width:${revPct}%;background:var(--success);border-radius:999px;"></div>
                </div>
                <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.revDone}/${prog.total}</span>
              </div>
            </div>`;
          })() : '';
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
            ${progressBar}
          </div>`;
        }).join('') : '<div class="text-muted text-sm">近期沒有考試</div>'}
      </div>

    </div>`;
}

function timetableCard(slots, emptyMsg) {
  if (!slots.length) return `<div class="text-muted text-sm">${emptyMsg}</div>`;
  return slots.map(s => `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem;">
      <span style="font-size:.78rem;color:var(--text2);min-width:50px;">第${s.period}節</span>
      <span class="badge" style="background:${s.subject_color}">${escHtml(s.subject_name)}</span>
    </div>`).join('');
}

function studyCard(items, emptyMsg) {
  if (!items.length) return `<div class="text-muted text-sm">${emptyMsg}</div>`;
  return items.map(p => {
    const isPreview = p.type === 'preview';
    const typeLabel = isPreview ? '預習' : '複習';
    const color     = isPreview ? 'var(--accent)' : 'var(--success)';
    return `
    <div style="display:flex;align-items:flex-start;gap:.6rem;margin-bottom:.7rem;${p.is_done ? 'opacity:.55;' : ''}">
      <span style="margin-top:.2rem;width:16px;height:16px;flex-shrink:0;border-radius:50%;
                   border:2px solid ${color};background:${p.is_done ? color : 'transparent'};
                   display:flex;align-items:center;justify-content:center;font-size:.6rem;color:#fff;">
        ${p.is_done ? '✓' : ''}
      </span>
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
          <span class="badge" style="background:${p.subject_color}">${escHtml(p.subject_name)}</span>
          <span style="font-size:.85rem;font-weight:600;${p.is_done ? 'text-decoration:line-through;color:var(--text3);' : ''}">${escHtml(p.chapter_title)}</span>
          <span style="font-size:.7rem;padding:.1rem .4rem;border-radius:999px;border:1.5px solid ${color};color:${color};">${typeLabel}</span>
        </div>
        ${p.notes ? `<div style="font-size:.75rem;color:var(--text2);margin-top:.2rem;">📝 ${escHtml(p.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}
