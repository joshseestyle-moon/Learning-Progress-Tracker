import { get, post, put, del, escHtml, fmtDate, today } from './api.js';

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
  const [assignments, exams, scheduled] = await Promise.all([
    get('/assignments'),
    get('/exams'),
    get('/chapters/scheduled'),
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
    const typeLabel = s.type === 'preview' ? '預習' : '複習';
    (byDate[s.scheduled_date] = byDate[s.scheduled_date] || []).push({
      ...s,
      _type: 'chapter',
      title: `${typeLabel}：${s.chapter_title}`,
    });
  }

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay  = new Date(currentYear, currentMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const totalDays = lastDay.getDate();
  const todayStr = today();

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString('zh-TW', { year:'numeric', month:'long' });

  let cells = '';
  // Empty cells before month start
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell other-month"></div>';

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const events  = byDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    cells += `
      <div class="cal-cell" data-date="${dateStr}">
        <div class="cal-date ${isToday?'today':''}">${d}</div>
        ${events.slice(0,3).map(ev => {
          const label = ev._type === 'exam' ? '⏰ ' + ev.title : '📝 ' + ev.title;
          return `<div class="cal-dot" style="background:${ev.subject_color}" title="${escHtml(ev.title)}">${escHtml(label.slice(0,18))}</div>`;
        }).join('')}
        ${events.length > 3 ? `<div class="text-xs text-muted">+${events.length-3} 更多</div>` : ''}
      </div>`;
  }

  el.innerHTML = `
    <div class="cal-header">
      <button class="btn btn-ghost btn-sm" id="cal-prev">← 上月</button>
      <strong style="font-size:1.05rem;min-width:130px;text-align:center;">${monthName}</strong>
      <button class="btn btn-ghost btn-sm" id="cal-next">下月 →</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="cal-grid">
        ${['一','二','三','四','五','六','日'].map(d=>`<div class="cal-day-header">${d}</div>`).join('')}
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
        <button class="btn btn-primary btn-sm" id="cal-add-btn">+ 新增作業</button>
      </div>
      ${events.length ? events.map(ev => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);">
          <div>
            <span class="badge" style="background:${ev.subject_color};margin-right:.4rem">${escHtml(ev.subject_name)}</span>
            ${ ev._type === 'exam'     ? '<span class="chip">考試</span>'
             : ev._type === 'chapter'  ? `<span class="chip" style="color:var(--accent)">${ev.type==='preview'?'預習':'複習'}</span>`
             : '<span class="chip">作業</span>'}
            <span style="font-size:.9rem;margin-left:.4rem;">${escHtml(ev.title)}</span>
          </div>
          ${ev._type === 'assignment' ? `
            <div style="display:flex;gap:.5rem;">
              <button class="btn btn-ghost btn-sm" onclick="toggleAssignment(${ev.id}, ${ev.is_done})">${ev.is_done?'↩ 取消':'✓ 完成'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteAssignment(${ev.id})">✕</button>
            </div>` : ''}
        </div>`).join('') : '<div class="text-muted text-sm">這天沒有事件</div>'}
    </div>`;

  detail.querySelector('#cal-add-btn').onclick = () => {
    const modal = el.querySelector('#cal-modal');
    modal.innerHTML = buildModal(date);
    modal.classList.remove('hidden');
    modal.querySelector('#cal-cancel').onclick = () => modal.classList.add('hidden');
    modal.querySelector('#cal-save').onclick   = () => saveAssignment(el, date);
    modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
  };

  // Global helpers for inline buttons
  window.toggleAssignment = async (id, isDone) => {
    const a = assignments.find(x => x.id === id);
    await import('./api.js').then(m => m.put('/assignments/' + id, { ...a, is_done: !isDone }));
    await renderMonth(el);
  };
  window.deleteAssignment = async (id) => {
    if (!confirm('確定刪除？')) return;
    await import('./api.js').then(m => m.del('/assignments/' + id));
    await renderMonth(el);
  };
}

function buildModal(date) {
  return `
    <div class="modal-box">
      <div class="modal-title">新增作業</div>
      <div class="form-group">
        <label class="form-label">科目</label>
        <select id="cal-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">作業名稱</label>
        <input id="cal-title" class="form-input" placeholder="例：第三章習題">
      </div>
      <div class="form-group">
        <label class="form-label">截止日期</label>
        <input id="cal-date" type="date" class="form-input" value="${date||''}">
      </div>
      <div class="form-group">
        <label class="form-label">說明（選填）</label>
        <textarea id="cal-desc" class="form-input form-textarea"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="cal-cancel">取消</button>
        <button class="btn btn-primary" id="cal-save">儲存</button>
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
  if (!body.title || !body.due_date) return alert('請填寫名稱與日期');
  await post('/assignments', body);
  modal.classList.add('hidden');
  await renderMonth(el);
}
