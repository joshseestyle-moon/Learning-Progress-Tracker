import { get, post, put, del, patch, escHtml, fmtDate, today } from './api.js';
import { t, getLang } from './i18n.js';

let currentYear, currentMonth;
let subjects = [];

export async function render(el) {
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth();
  subjects = await get('/subjects');
  await renderMonth(el);
}

async function renderMonth(el) {
  const mm = String(currentMonth + 1).padStart(2, '0');
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const [assignments, exams, scheduled, tasks] = await Promise.all([
    get('/assignments'),
    get('/exams'),
    get('/chapters/scheduled'),
    get(`/daily-tasks?from=${currentYear}-${mm}-01&to=${currentYear}-${mm}-${String(daysInMonth).padStart(2, '0')}`),
  ]);

  const byDate = {};
  for (const a of assignments) {
    (byDate[a.due_date] = byDate[a.due_date] || []).push({ ...a, _type: 'assignment' });
  }
  for (const e of exams) {
    if (!e.is_completed) {
      (byDate[e.exam_date] = byDate[e.exam_date] || []).push({ ...e, _type: 'exam' });
    }
  }
  for (const s of scheduled) {
    (byDate[s.scheduled_date] = byDate[s.scheduled_date] || []).push({
      ...s,
      _type: 'chapter',
      title: `${t(s.type === 'preview' ? 'chip.preview' : 'chip.review')}：${s.chapter_title}`,
    });
  }
  for (const tk of tasks) {
    (byDate[tk.task_date] = byDate[tk.task_date] || []).push({ ...tk, _type: 'task' });
  }

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay  = new Date(currentYear, currentMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const totalDays = lastDay.getDate();
  const todayStr = today();

  const LOCALE_MAP = { 'zh-TW': 'zh-TW', 'en': 'en-US', 'ja': 'ja-JP' };
  const locale = LOCALE_MAP[getLang()] || 'zh-TW';
  const monthName = new Date(currentYear, currentMonth).toLocaleDateString(locale, { year:'numeric', month:'long' });

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell other-month"></div>';

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const events  = byDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    cells += `
      <div class="cal-cell" data-date="${dateStr}">
        <div class="cal-date ${isToday?'today':''}">${d}</div>
        ${events.slice(0,3).map(ev => {
          const icon = ev._type === 'exam' ? '⏰'
            : ev._type === 'chapter' ? (ev.type === 'preview' ? '📖' : '✏️')
            : ev._type === 'task' ? '📋' : '📝';
          const name  = ev._type === 'chapter' ? ev.chapter_title : ev.title;
          const label = ev.subject_name && name ? `${icon} ${ev.subject_name}・${name}` : `${icon} ${ev.subject_name || name || ''}`;
          const color = ev.subject_color || '#94a3b8';
          return `<div class="cal-dot" style="background:${color}" title="${escHtml(label)}">${escHtml(label)}</div>`;
        }).join('')}
        ${events.length > 3 ? `<div class="text-xs text-muted">${t('cal.moreEvents', { n: events.length-3 })}</div>` : ''}
      </div>`;
  }

  const dayHeaders = [0,1,2,3,4,5,6].map(i => `<div class="cal-day-header">${t('cal.calDay.' + i)}</div>`).join('');

  el.innerHTML = `
    <div class="cal-header">
      <button class="btn btn-ghost btn-sm" id="cal-prev">${t('cal.prev')}</button>
      <strong style="font-size:1.05rem;min-width:130px;text-align:center;">${monthName}</strong>
      <button class="btn btn-ghost btn-sm" id="cal-next">${t('cal.next')}</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="cal-grid">
        ${dayHeaders}
        ${cells}
      </div>
    </div>
    <div id="cal-detail" style="margin-top:1rem;"></div>
    <div id="cal-modal" class="modal-overlay hidden">${buildModal()}</div>`;

  el.querySelector('#cal-prev').onclick = async () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    await renderMonth(el);
  };
  el.querySelector('#cal-next').onclick = async () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    await renderMonth(el);
  };

  el.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.onclick = () => showDetail(el, cell.dataset.date, byDate[cell.dataset.date] || [], assignments, exams, scheduled);
  });
}

function showDetail(el, date, events, assignments, exams, scheduled) {
  const detail = el.querySelector('#cal-detail');
  detail.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
        <div class="card-title" style="margin:0;">${fmtDate(date)}</div>
        <button class="btn btn-primary btn-sm" id="cal-add-btn">${t('cal.addAssignment')}</button>
      </div>
      ${events.length ? events.map(ev => {
        const badge = ev.subject_name
          ? `<span class="badge" style="background:${ev.subject_color || '#94a3b8'};margin-right:.4rem">${escHtml(ev.subject_name)}</span>` : '';
        const chip = ev._type === 'exam'    ? `<span class="chip">${t('chip.exam')}</span>`
                   : ev._type === 'chapter' ? `<span class="chip" style="color:var(--accent)">${ev.type==='preview' ? t('chip.preview') : t('chip.review')}</span>`
                   : ev._type === 'task'    ? `<span class="chip">${t('chip.task')}</span>`
                   : `<span class="chip">${t('chip.assignment')}</span>`;
        const parts = ev.parts || [];
        const doneParts = parts.filter(p => p.is_done).length;
        const taskDone = ev.is_done || (parts.length > 0 && doneParts === parts.length);
        const progress = ev._type === 'task' && parts.length > 1
          ? ` <span style="color:var(--text3);font-size:.8rem;">${doneParts}/${parts.length}</span>` : '';
        const titleStyle = ev._type === 'task' && taskDone ? 'text-decoration:line-through;color:var(--text3);' : '';
        const actions = ev._type === 'assignment' ? `
            <div style="display:flex;gap:.5rem;flex-shrink:0;">
              <button class="btn btn-ghost btn-sm" onclick="toggleAssignment(${ev.id}, ${ev.is_done})">${ev.is_done ? t('btn.undone') : t('btn.done')}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteAssignment(${ev.id})">✕</button>
            </div>`
          : ev._type === 'task' ? `
            <div style="display:flex;gap:.4rem;flex-shrink:0;align-items:center;">
              <button class="btn btn-ghost btn-sm" onclick="calToggleTask(${ev.id}, ${taskDone ? 1 : 0})">${taskDone ? t('btn.undone') : t('btn.done')}</button>
              <button class="btn btn-ghost btn-sm" onclick="navigate('homework')">${t('cal.goToHomework')}</button>
            </div>` : '';
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);gap:.5rem;">
          <div style="min-width:0;">
            ${badge}${chip}
            <span style="font-size:.9rem;margin-left:.4rem;${titleStyle}">${escHtml(ev.title || '')}${progress}</span>
          </div>
          ${actions}
        </div>`;
      }).join('') : `<div class="text-muted text-sm">${t('cal.noEvents')}</div>`}
    </div>`;

  detail.querySelector('#cal-add-btn').onclick = () => {
    const modal = el.querySelector('#cal-modal');
    modal.innerHTML = buildModal(date);
    modal.classList.remove('hidden');
    modal.querySelector('#cal-cancel').onclick = () => modal.classList.add('hidden');
    modal.querySelector('#cal-save').onclick   = () => saveAssignment(el, date);
    modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
  };

  window.toggleAssignment = async (id, isDone) => {
    const a = assignments.find(x => x.id === id);
    await put('/assignments/' + id, { ...a, is_done: !isDone });
    await renderMonth(el);
  };
  window.calToggleTask = async (id, isDone) => {
    await patch('/daily-tasks/' + id, { is_done: !isDone });
    await renderMonth(el);
  };
  window.deleteAssignment = async (id) => {
    if (!confirm(t('confirm.deleteAssignment'))) return;
    await del('/assignments/' + id);
    await renderMonth(el);
  };
}

function buildModal(date) {
  return `
    <div class="modal-box">
      <div class="modal-title">${t('modal.addAssignment')}</div>
      <div class="form-group">
        <label class="form-label">${t('label.subject')}</label>
        <select id="cal-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.assignmentName')}</label>
        <input id="cal-title" class="form-input" placeholder="${t('label.assignmentPlaceholder')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.dueDate')}</label>
        <input id="cal-date" type="date" class="form-input" value="${date||''}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.descOptional')}</label>
        <textarea id="cal-desc" class="form-input form-textarea"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="cal-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="cal-save">${t('btn.save')}</button>
      </div>
    </div>`;
}

async function saveAssignment(el, date) {
  const modal = el.querySelector('#cal-modal');
  const body = {
    subject_id: +modal.querySelector('#cal-subject').value,
    title:      modal.querySelector('#cal-title').value.trim(),
    due_date:   modal.querySelector('#cal-date').value,
    description:modal.querySelector('#cal-desc').value.trim() || null,
  };
  if (!body.title || !body.due_date) return alert(t('alert.fillNameDate'));
  await post('/assignments', body);
  modal.classList.add('hidden');
  await renderMonth(el);
}
