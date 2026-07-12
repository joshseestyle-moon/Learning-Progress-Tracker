import { get, post, patch, del, escHtml, fmtDate, today, ymd } from './api.js';
import { t } from './i18n.js';
import { mountPeriodScoped } from './period-filter.js';

let _el = null;
let _subjects = [];
let _scope = { mode: 'all' };
let _mount;

export async function render(el) {
  _el = el;
  _subjects = (await get('/subjects')).filter(s => s.category === 'exam');
  await mountPeriodScoped(el, {
    filterId: 'hw-filter', bodyId: 'hw-body',
    onChange: (scope, mount) => { _mount = mount; _scope = scope; refresh(); },
  });
}

async function refresh() {
  const done = _mount.begin();
  // All scope: rolling ±30 days (current behaviour). Period scope: the period's range.
  const range = _scope.mode === 'period'
    ? { from: _scope.from, to: _scope.to }
    : { from: offsetDate(-30), to: offsetDate(30) };
  const tasks = await get(`/daily-tasks?from=${range.from}&to=${range.to}`);
  const body = done();
  if (!body) return; // navigated away, or superseded by a newer refresh
  body.innerHTML = buildPage(tasks);
  attachAddEvent(body);
}

function offsetDate(days) {
  const d = new Date(); d.setDate(d.getDate() + days); return ymd(d);
}

function buildPage(tasks) {
  const todayStr = today();
  const todayTasks = [], upcomingTasks = [], pastTasks = [];
  for (const task of tasks) {
    if      (task.task_date === todayStr)                   todayTasks.push(task);
    else if (task.task_date > todayStr)                    upcomingTasks.push(task);
    else if (task.task_date < todayStr && !task.is_done)   pastTasks.push(task);
  }
  upcomingTasks.sort((a, b) => a.task_date.localeCompare(b.task_date));
  pastTasks.sort((a, b) => b.task_date.localeCompare(a.task_date));

  return `
    ${addForm(todayStr)}

    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('hw.today')}</div>
      <div id="hw-today-list">
        ${todayTasks.length ? todayTasks.map(taskBlock).join('') : emptyMsg('hw-today-empty')}
      </div>
    </div>

    ${pastTasks.length ? `
    <div class="card" style="margin-bottom:1.25rem;border-left:3px solid var(--danger);">
      <div class="card-title" style="color:var(--danger);">${t('hw.overdue')}</div>
      ${groupByDate(pastTasks)}
    </div>` : ''}

    ${upcomingTasks.length ? `
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('hw.upcoming')}</div>
      ${groupByDate(upcomingTasks)}
    </div>` : ''}`;
}

function addForm(todayStr) {
  const subjectOptions = _subjects.map(s =>
    `<option value="${s.id}">${escHtml(s.name)}</option>`
  ).join('');

  return `
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('hw.addTitle')}</div>
      <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;">
        <select id="hw-subject" class="form-input" style="width:130px;">
          <option value="">${t('hw.noSubject')}</option>
          ${subjectOptions}
        </select>
        <input id="hw-title" type="text" class="form-input" style="flex:1;min-width:160px;"
          placeholder="${t('hw.titlePlaceholder')}">
        <input id="hw-date" type="date" class="form-input" style="width:148px;" value="${todayStr}">
        <div style="display:flex;align-items:center;gap:.4rem;white-space:nowrap;">
          <span style="font-size:.85rem;color:var(--text2);">${t('hw.splitParts')}</span>
          <input id="hw-parts" type="number" class="form-input" min="1" max="10" value="1"
            style="width:56px;text-align:center;">
          <span style="font-size:.85rem;color:var(--text2);">${t('hw.splitPartsUnit')}</span>
        </div>
        <button class="btn btn-primary" id="hw-add-btn">${t('btn.add')}</button>
      </div>
    </div>`;
}

function groupByDate(tasks) {
  const groups = {};
  for (const task of tasks) {
    if (!groups[task.task_date]) groups[task.task_date] = [];
    groups[task.task_date].push(task);
  }
  return Object.keys(groups).map(date => `
    <div style="margin-bottom:.9rem;">
      <div style="font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:.4rem;">${fmtDate(date)}</div>
      ${groups[date].map(taskBlock).join('')}
    </div>`).join('');
}

function taskBlock(task) {
  const parts = task.parts || [];
  const multiPart = parts.length > 1;
  const doneParts = parts.filter(p => p.is_done).length;
  const allDone = task.is_done || (parts.length > 0 && doneParts === parts.length);

  const subjectBadge = task.subject_name
    ? `<span class="badge" style="background:${task.subject_color};margin-right:.35rem;">${escHtml(task.subject_name)}</span>`
    : '';

  const titleStyle = allDone ? 'text-decoration:line-through;color:var(--text3);' : '';

  if (!multiPart) {
    const p = parts[0];
    return `
      <div id="hw-task-${task.id}" style="display:flex;align-items:center;gap:.6rem;margin-bottom:.55rem;">
        <button onclick="hwTogglePart(${p ? p.id : 0}, ${task.id})"
          style="flex-shrink:0;width:20px;height:20px;border-radius:50%;
                 border:2px solid var(--accent);background:${allDone ? 'var(--accent)' : 'transparent'};
                 display:flex;align-items:center;justify-content:center;font-size:.65rem;color:#fff;
                 cursor:pointer;padding:0;">${allDone ? '✓' : ''}</button>
        <span data-task-title style="flex:1;font-size:.92rem;${titleStyle}">${subjectBadge}${escHtml(task.title)}</span>
        <button onclick="hwDelete(${task.id})"
          style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--text3);font-size:.82rem;padding:2px 5px;"
          title="${t('btn.delete')}">✕</button>
      </div>`;
  }

  const progressColor = allDone ? 'var(--success)' : doneParts > 0 ? 'var(--accent)' : 'var(--text3)';
  const partsHtml = parts.map(p => `
    <div id="hw-part-${p.id}" style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0 .2rem 1.8rem;">
      <button onclick="hwTogglePart(${p.id}, ${task.id})"
        style="flex-shrink:0;width:16px;height:16px;border-radius:50%;
               border:2px solid var(--accent);background:${p.is_done ? 'var(--accent)' : 'transparent'};
               display:flex;align-items:center;justify-content:center;font-size:.55rem;color:#fff;
               cursor:pointer;padding:0;">${p.is_done ? '✓' : ''}</button>
      <span style="font-size:.85rem;${p.is_done ? 'text-decoration:line-through;color:var(--text3);' : ''}">
        ${t('hw.partLabel', { n: p.part_num })}
      </span>
    </div>`).join('');

  return `
    <div id="hw-task-${task.id}" style="margin-bottom:.65rem;">
      <div style="display:flex;align-items:center;gap:.6rem;">
        <span style="flex-shrink:0;font-size:.78rem;font-weight:700;min-width:32px;text-align:center;
                     color:${progressColor};">${doneParts}/${parts.length}</span>
        <span data-task-title style="flex:1;font-size:.92rem;${titleStyle}">${subjectBadge}${escHtml(task.title)}</span>
        <button onclick="hwDelete(${task.id})"
          style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--text3);font-size:.82rem;padding:2px 5px;"
          title="${t('btn.delete')}">✕</button>
      </div>
      <div style="margin-top:.2rem;">${partsHtml}</div>
    </div>`;
}

function emptyMsg(id = '') {
  return `<div class="text-muted text-sm"${id ? ` id="${id}"` : ''}>${t('hw.emptyToday')}</div>`;
}

function attachAddEvent(el) {
  const titleInput  = el.querySelector('#hw-title');
  const subjectSel  = el.querySelector('#hw-subject');
  const dateInput   = el.querySelector('#hw-date');
  const partsInput  = el.querySelector('#hw-parts');
  const addBtn      = el.querySelector('#hw-add-btn');

  async function addTask() {
    const title      = titleInput.value.trim();
    const date       = dateInput.value;
    const subject_id = subjectSel.value || null;
    const total_parts = parseInt(partsInput.value) || 1;
    // Require date + at least one of title or subject
    if (!date || (!title && !subject_id)) { titleInput.focus(); return; }
    try {
      addBtn.disabled = true;
      const task = await post('/daily-tasks', { title, task_date: date, subject_id, total_parts });

      // Re-fetch with the current scope (1 request) so added tasks respect it.
      await refresh();

      // Period scope filters the list server-side by date range. A task dated
      // outside the currently-viewed period was saved fine but just vanished
      // from view with no explanation — tell the user where it went.
      if (_scope.mode === 'period' && (date < _scope.from || date > _scope.to)) {
        window.dispatchEvent(new CustomEvent('app-toast', {
          detail: { icon: '📌', title: t('hw.addedOutsideScope'), color: 'var(--warn)' },
        }));
      }

      // refresh() rebuilds #hw-body (including #hw-title) with fresh, already-blank
      // inputs — but the new node isn't focused automatically, which breaks rapid
      // entry. Re-focus it here (guarded: refresh() may have bailed if the user
      // navigated away in the meantime, in which case #hw-title no longer exists).
      _el.querySelector('#hw-title')?.focus();
    } catch (e) {
      alert(t('alert.saveFailed', { msg: e.message }));
    } finally {
      addBtn.disabled = false;
    }
  }

  addBtn.addEventListener('click', addTask);
  titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
}

// ── Global handlers ──────────────────────────────────────────────────────────

window.hwTogglePart = async function(partId, taskId) {
  const partEl = document.getElementById('hw-part-' + partId);
  const taskEl = document.getElementById('hw-task-' + taskId);
  if (!partEl && !taskEl) return;

  const btn    = (partEl || taskEl).querySelector('button');
  const isDone = btn.style.background !== 'transparent' && btn.style.background !== '';
  const newDone = !isDone;

  try {
    await patch('/daily-tasks/parts/' + partId, { is_done: newDone });

    if (partEl) {
      // multi-part: update the individual part row
      const b = partEl.querySelector('button');
      const s = partEl.querySelector('span');
      b.style.background = newDone ? 'var(--accent)' : 'transparent';
      b.textContent = newDone ? '✓' : '';
      s.style.textDecoration = newDone ? 'line-through' : '';
      s.style.color = newDone ? 'var(--text3)' : '';

      // Update progress counter and title strikethrough
      if (taskEl) {
        const allBtns = taskEl.querySelectorAll('[id^="hw-part-"] button');
        const done = [...allBtns].filter(b => b.style.background !== 'transparent' && b.style.background !== '').length;
        const total = allBtns.length;
        const counter = taskEl.querySelector('div > span:first-child');
        if (counter) {
          counter.textContent = `${done}/${total}`;
          counter.style.color = done === total ? 'var(--success)' : done > 0 ? 'var(--accent)' : 'var(--text3)';
        }
        const titleSpan = taskEl.querySelector('[data-task-title]');
        if (titleSpan) {
          titleSpan.style.textDecoration = done === total ? 'line-through' : '';
          titleSpan.style.color = done === total ? 'var(--text3)' : '';
        }
      }
    } else {
      // single-part: update the task row directly
      const b = taskEl.querySelector('button');
      const s = taskEl.querySelector('[data-task-title]');
      b.style.background = newDone ? 'var(--accent)' : 'transparent';
      b.textContent = newDone ? '✓' : '';
      if (s) { s.style.textDecoration = newDone ? 'line-through' : ''; s.style.color = newDone ? 'var(--text3)' : ''; }
    }
  } catch (e) {
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};

window.hwDelete = async function(taskId) {
  const row = document.getElementById('hw-task-' + taskId);
  if (!row) return;
  try {
    await del('/daily-tasks/' + taskId);
    row.style.transition = 'opacity .2s';
    row.style.opacity = '0';
    setTimeout(() => {
      row.remove();
      const list = document.getElementById('hw-today-list');
      if (list && !list.querySelector('[id^="hw-task-"]')) {
        list.innerHTML = emptyMsg('hw-today-empty');
      }
    }, 210);
  } catch (e) {
    alert(t('alert.saveFailed', { msg: e.message }));
  }
};
