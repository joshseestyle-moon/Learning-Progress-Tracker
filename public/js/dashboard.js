import { get, post, patch, escHtml, fmtDate, today } from './api.js';
import { t } from './i18n.js';

let _el = null;

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function render(el) {
  _el = el;
  const todayStr    = today();
  const tomorrowStr = tomorrow();

  let timetable, exams, scheduled, chapters, dailyTasks;
  try {
    [timetable, exams, scheduled, chapters, dailyTasks] = await Promise.all([
      get('/timetable'),
      get('/exams?upcoming=5'),
      get('/chapters/scheduled'),
      get('/chapters'),
      get('/daily-tasks?date=' + todayStr),
    ]);
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">${t('alert.loadFail', { msg: e.message })}</p></div>`;
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
  const overdueProgress  = scheduled
    .filter(p => p.scheduled_date < todayStr && !p.is_done)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  el.innerHTML = `
    <div class="dashboard-grid">

      <!-- Today's timetable -->
      <div class="card">
        <div class="card-title">${t('card.todaySchedule')}</div>
        ${timetableCard(todaySlots, t('empty.todaySchedule'))}
      </div>

      <!-- Tomorrow's timetable -->
      <div class="card">
        <div class="card-title">${t('card.tomorrowSchedule')}</div>
        ${timetableCard(tomorrowSlots, t('empty.tomorrowSchedule'))}
      </div>

      <!-- Today's homework tasks -->
      <div class="card" id="daily-tasks-card" style="grid-column: 1 / -1;">
        <div class="card-title">${t('card.todayHomework')}</div>
        ${dailyTasksCard(dailyTasks)}
      </div>

      <!-- Today's study progress -->
      <div class="card">
        <div class="card-title">${t('card.todayStudy')}</div>
        ${studyCard(todayProgress, t('empty.todayStudy'))}
      </div>

      <!-- Tomorrow's study progress -->
      <div class="card">
        <div class="card-title">${t('card.tomorrowStudy')}</div>
        ${studyCard(tomorrowProgress, t('empty.tomorrowStudy'))}
      </div>

      <!-- Overdue study progress -->
      <div class="card">
        <div class="card-title">${t('card.overdue')}</div>
        ${overdueCard(overdueProgress)}
      </div>

      <!-- Exam countdown -->
      <div class="card">
        <div class="card-title">${t('card.examCountdown')}</div>
        ${exams.length ? exams.map(e => {
          const d = e.days_left;
          const urgency = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
          const typeLabel = {
            quiz: t('enum.examType.quiz'), segment: t('enum.examType.segment'),
            midterm: t('enum.examType.midterm'), final: t('enum.examType.final'), mock: t('enum.examType.mock'),
          }[e.exam_type] || e.exam_type;
          const prog = progressMap[e.subject_id];
          const progressBar = prog && prog.total > 0 ? (() => {
            const prevPct = Math.round(prog.prevDone / prog.total * 100);
            const revPct  = Math.round(prog.revDone  / prog.total * 100);
            return `
            <div style="margin-top:.45rem;display:flex;flex-direction:column;gap:4px;">
              <div style="display:flex;align-items:center;gap:.5rem;">
                <span style="font-size:.68rem;color:var(--accent);min-width:2.2rem;">${t('dash.preview')}</span>
                <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
                  <div style="height:100%;width:${prevPct}%;background:var(--accent);border-radius:999px;"></div>
                </div>
                <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.prevDone}/${prog.total}</span>
              </div>
              <div style="display:flex;align-items:center;gap:.5rem;">
                <span style="font-size:.68rem;color:var(--success);min-width:2.2rem;">${t('dash.review')}</span>
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
              <span class="countdown-pill ${urgency}">${d <= 0 ? t('dash.today') : t('dash.daysLeft', { n: d })}</span>
            </div>
            <div style="font-size:.85rem;margin-top:.25rem;color:var(--text2);">${escHtml(e.title)} · ${fmtDate(e.exam_date)}</div>
            ${progressBar}
          </div>`;
        }).join('') : `<div class="text-muted text-sm">${t('empty.exams')}</div>`}
      </div>

    </div>
    <div id="dash-time-modal" class="modal-overlay hidden"></div>`;
}

function timetableCard(slots, emptyMsg) {
  if (!slots.length) return `<div class="text-muted text-sm">${emptyMsg}</div>`;
  return slots.map(s => `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem;">
      <span style="font-size:.78rem;color:var(--text2);min-width:50px;">${t('tt.period', { n: s.period })}</span>
      <span class="badge" style="background:${s.subject_color}">${escHtml(s.subject_name)}</span>
    </div>`).join('');
}

function overdueCard(items) {
  if (!items.length) return `<div style="font-size:.85rem;color:var(--success);">${t('empty.overdue')}</div>`;
  return items.map(p => {
    const isPreview = p.type === 'preview';
    const typeLabel = isPreview ? t('dash.preview') : t('dash.review');
    const daysLate  = Math.floor((new Date(today() + 'T00:00:00') - new Date(p.scheduled_date + 'T00:00:00')) / 86400000);
    const lateColor = daysLate >= 7 ? 'var(--danger)' : '#e67e22';
    return `
    <div data-prog-id="${p.id}" data-subject-id="${p.subject_id}" data-chapter-id="${p.chapter_id}" data-is-done="0"
         style="display:flex;align-items:flex-start;gap:.6rem;margin-bottom:.7rem;
                border-radius:var(--radius-sm);padding:.3rem .4rem .3rem .2rem;">
      <button onclick="dashToggleProgress('${p.id}', true)" title="${t('btn.done')}"
        style="margin-top:.2rem;width:18px;height:18px;flex-shrink:0;border-radius:50%;
               border:2px solid ${lateColor};background:transparent;display:flex;align-items:center;
               justify-content:center;font-size:.65rem;color:${lateColor};cursor:pointer;padding:0;">!</button>
      <div style="min-width:0;flex:1;">
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
          <span class="badge" style="background:${p.subject_color}">${escHtml(p.subject_name)}</span>
          <span style="font-size:.85rem;font-weight:600;">${escHtml(p.chapter_title)}</span>
          <span style="font-size:.7rem;padding:.1rem .4rem;border-radius:999px;border:1.5px solid ${lateColor};color:${lateColor};">${typeLabel}</span>
        </div>
        <div style="font-size:.72rem;color:${lateColor};margin-top:.2rem;">${t('dash.dueDate', { date: fmtDate(p.scheduled_date), days: daysLate })}</div>
      </div>
    </div>`;
  }).join('');
}

function studyCard(items, emptyMsg) {
  if (!items.length) return `<div class="text-muted text-sm">${emptyMsg}</div>`;
  return items.map(p => {
    const isPreview = p.type === 'preview';
    const typeLabel = isPreview ? t('dash.preview') : t('dash.review');
    const color     = isPreview ? 'var(--accent)' : 'var(--success)';
    return `
    <div data-prog-id="${p.id}" data-subject-id="${p.subject_id}" data-chapter-id="${p.chapter_id}" data-is-done="${p.is_done ? '1' : '0'}"
         style="display:flex;align-items:flex-start;gap:.6rem;margin-bottom:.7rem;${p.is_done ? 'opacity:.55;' : ''}">
      <button onclick="dashToggleProgress('${p.id}', false)" title="${p.is_done ? t('btn.undone') : t('btn.done')}"
        style="margin-top:.2rem;width:18px;height:18px;flex-shrink:0;border-radius:50%;
               border:2px solid ${color};background:${p.is_done ? color : 'transparent'};
               display:flex;align-items:center;justify-content:center;font-size:.6rem;color:#fff;
               cursor:pointer;padding:0;">
        ${p.is_done ? '✓' : ''}
      </button>
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

function dailyTasksCard(tasks) {
  if (!tasks.length) return `<div class="text-muted text-sm">${t('empty.todayHomework')}</div>`;
  return tasks.map(task => {
    const parts = task.parts || [];
    const multiPart = parts.length > 1;
    const doneParts = parts.filter(p => p.is_done).length;
    const allDone = task.is_done || (parts.length > 0 && doneParts === parts.length);
    const subjectBadge = task.subject_name
      ? `<span class="badge" style="background:${task.subject_color};margin-right:.3rem;">${escHtml(task.subject_name)}</span>`
      : '';
    const titleHtml = `${subjectBadge}${task.title ? escHtml(task.title) : ''}`;
    const titleStyle = allDone ? 'text-decoration:line-through;color:var(--text3);' : '';

    if (!multiPart) {
      const p = parts[0];
      return `
        <div id="dt-row-${task.id}" style="display:flex;align-items:center;gap:.6rem;margin-bottom:.55rem;">
          <button onclick="dashTogglePart(${p ? p.id : 0}, ${task.id})"
            style="flex-shrink:0;width:18px;height:18px;border-radius:50%;
                   border:2px solid var(--accent);background:${allDone ? 'var(--accent)' : 'transparent'};
                   display:flex;align-items:center;justify-content:center;font-size:.6rem;color:#fff;
                   cursor:pointer;padding:0;">${allDone ? '✓' : ''}</button>
          <span style="flex:1;font-size:.9rem;${titleStyle}">${titleHtml}</span>
        </div>`;
    }

    const progressColor = allDone ? 'var(--success)' : doneParts > 0 ? 'var(--accent)' : 'var(--text3)';
    const partsHtml = parts.map(p => `
      <div id="dt-part-${p.id}" style="display:flex;align-items:center;gap:.5rem;padding:.15rem 0 .15rem 1.6rem;">
        <button onclick="dashTogglePart(${p.id}, ${task.id})"
          style="flex-shrink:0;width:15px;height:15px;border-radius:50%;
                 border:2px solid var(--accent);background:${p.is_done ? 'var(--accent)' : 'transparent'};
                 display:flex;align-items:center;justify-content:center;font-size:.5rem;color:#fff;
                 cursor:pointer;padding:0;">${p.is_done ? '✓' : ''}</button>
        <span style="font-size:.82rem;${p.is_done ? 'text-decoration:line-through;color:var(--text3);' : ''}">${t('hw.partLabel', { n: p.part_num })}</span>
      </div>`).join('');

    return `
      <div id="dt-row-${task.id}" style="margin-bottom:.65rem;">
        <div style="display:flex;align-items:center;gap:.6rem;">
          <span style="flex-shrink:0;font-size:.75rem;font-weight:700;min-width:28px;text-align:center;color:${progressColor};">${doneParts}/${parts.length}</span>
          <span style="flex:1;font-size:.9rem;${titleStyle}">${titleHtml}</span>
        </div>
        ${partsHtml}
      </div>`;
  }).join('');
}

// ── Global handler (called from inline onclick in studyCard / overdueCard) ──

function openDashTimeModal(onSave, onSkip) {
  if (!_el) return onSkip();
  const modal = _el.querySelector('#dash-time-modal');
  if (!modal) return onSkip();
  modal.innerHTML = `
    <div class="modal-box" style="max-width:320px;">
      <div class="modal-title">${t('timeModal.title')}</div>
      <div class="form-group">
        <label class="form-label">${t('timeModal.label')}</label>
        <input id="dtm-minutes" type="number" class="form-input" min="1" max="600" placeholder="${t('timeModal.placeholder')}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="dtm-skip">${t('timeModal.skip')}</button>
        <button class="btn btn-primary" id="dtm-save">${t('timeModal.save')}</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  modal.querySelector('#dtm-skip').onclick = () => { modal.classList.add('hidden'); onSkip(); };
  modal.querySelector('#dtm-save').onclick = async () => {
    const minutes = parseInt(modal.querySelector('#dtm-minutes').value) || 0;
    if (minutes < 1) {
      modal.querySelector('#dtm-minutes').focus();
      return;
    }
    modal.classList.add('hidden');
    await onSave(minutes);
  };
  modal.onclick = e => { if (e.target === modal) { modal.classList.add('hidden'); onSkip(); } };
  setTimeout(() => modal.querySelector('#dtm-minutes').focus(), 50);
}

window.dashTogglePart = async function(partId, taskId) {
  const partEl = document.getElementById('dt-part-' + partId);
  const taskRow = document.getElementById('dt-row-' + taskId);
  if (!taskRow) return;

  const btn = (partEl || taskRow).querySelector('button');
  const isDone = btn.style.background !== 'transparent' && btn.style.background !== '';
  const newDone = !isDone;

  try {
    await patch('/daily-tasks/parts/' + partId, { is_done: newDone });

    if (partEl) {
      // multi-part: update the part button
      const b = partEl.querySelector('button');
      const s = partEl.querySelector('span');
      b.style.background = newDone ? 'var(--accent)' : 'transparent';
      b.textContent = newDone ? '✓' : '';
      s.style.textDecoration = newDone ? 'line-through' : '';
      s.style.color = newDone ? 'var(--text3)' : '';

      // update progress counter
      const allBtns = taskRow.querySelectorAll('[id^="dt-part-"] button');
      const done = [...allBtns].filter(b => b.style.background !== 'transparent' && b.style.background !== '').length;
      const total = allBtns.length;
      const counter = taskRow.querySelector('div > span:first-child');
      if (counter) {
        counter.textContent = `${done}/${total}`;
        counter.style.color = done === total ? 'var(--success)' : done > 0 ? 'var(--accent)' : 'var(--text3)';
      }
      const titleSpan = taskRow.querySelector('div > span:nth-child(2)');
      if (titleSpan) {
        titleSpan.style.textDecoration = done === total ? 'line-through' : '';
        titleSpan.style.color = done === total ? 'var(--text3)' : '';
      }
    } else {
      // single-part: update checkbox
      const b = taskRow.querySelector('button');
      const s = taskRow.querySelector('span');
      b.style.background = newDone ? 'var(--accent)' : 'transparent';
      b.textContent = newDone ? '✓' : '';
      s.style.textDecoration = newDone ? 'line-through' : '';
      s.style.color = newDone ? 'var(--text3)' : '';
    }
  } catch (e) {
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};

window.dashToggleProgress = async function(progressId, removeOnDone) {
  const row = document.querySelector(`[data-prog-id="${progressId}"]`);
  if (!row) return;
  const btn = row.querySelector('button');
  const markingDone = removeOnDone || row.dataset.isDone === '0';

  btn.disabled = true;
  btn.style.opacity = '.4';

  try {
    await patch('/chapters/progress/' + progressId, { toggle_done: true });

    function afterToggle() {
      if (removeOnDone) {
        row.style.transition = 'opacity .25s';
        row.style.opacity = '0';
        setTimeout(() => {
          const parent = row.parentElement;
          row.remove();
          if (parent && !parent.querySelector('[data-prog-id]')) {
            parent.innerHTML = `<div style="font-size:.85rem;color:var(--success);">${t('empty.overdue')}</div>`;
          }
        }, 260);
      } else {
        if (_el) render(_el);
      }
    }

    if (markingDone) {
      openDashTimeModal(
        async (minutes) => {
          if (minutes > 0) {
            try {
              await post('/studylog', {
                subject_id:  +row.dataset.subjectId,
                log_date:    today(),
                minutes,
                chapter_id:  +row.dataset.chapterId,
              });
            } catch (_) {}
          }
          afterToggle();
        },
        afterToggle
      );
    } else {
      afterToggle();
    }
  } catch (e) {
    btn.disabled = false;
    btn.style.opacity = '';
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};
