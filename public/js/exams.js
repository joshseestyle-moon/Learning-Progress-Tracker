import { get, post, put, del, escHtml, fmtDate } from './api.js';

const TYPE_LABEL = { quiz:'小考', segment:'段考', midterm:'期中考', final:'期末考', mock:'模擬考' };
let subjects = [];

export async function render(el) {
  subjects = await get('/subjects');
  await refresh(el);
}

async function refresh(el) {
  const [exams, chapters] = await Promise.all([get('/exams'), get('/chapters')]);
  const progressMap = buildProgressMap(chapters);
  el.innerHTML = buildPage(exams, progressMap);
  attachEvents(el, exams);
}

function buildProgressMap(chapters) {
  const map = {};
  for (const c of chapters) {
    if (!map[c.subject_id]) map[c.subject_id] = { total: 0, prevDone: 0, revDone: 0 };
    const p = map[c.subject_id];
    p.total++;
    if (c.preview_done) p.prevDone++;
    if ((c.reviews || []).some(r => r.is_done)) p.revDone++;
  }
  return map;
}

function buildPage(exams, progressMap) {
  const upcoming = exams.filter(e => !e.is_completed && e.days_left >= 0);
  const expired  = exams.filter(e => !e.is_completed && e.days_left < 0);
  const done     = exams.filter(e => e.is_completed);

  return `
    <div style="display:flex;justify-content:space-between;margin-bottom:1.25rem;">
      <div></div>
      <button class="btn btn-primary" id="exam-add-btn">+ 新增考試</button>
    </div>

    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">即將到來 (${upcoming.length})</div>
      ${upcoming.length ? upcoming.map(e => examCard(e, progressMap[e.subject_id])).join('') :
        '<div class="text-muted text-sm">沒有即將到來的考試</div>'}
    </div>

    ${expired.length ? `
    <div class="card" style="margin-bottom:1.25rem;border-left:3px solid var(--danger);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">
        <div class="card-title" style="color:var(--danger);margin-bottom:0;">已過期 (${expired.length})</div>
        <button class="btn btn-danger btn-sm" id="exam-clear-expired-btn">清除已過期</button>
      </div>
      ${expired.map(e => examCard(e, progressMap[e.subject_id])).join('')}
    </div>` : ''}

    ${done.length ? `
    <div class="card">
      <div class="card-title" style="color:var(--text2)">已完成 (${done.length})</div>
      ${done.map(e => examCard(e, progressMap[e.subject_id])).join('')}
    </div>` : ''}

    <div id="exam-modal" class="modal-overlay hidden">${buildModal()}</div>`;
}

function examCard(e, prog) {
  const d = e.days_left;
  const urgency = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';

  let progressBar = '';
  if (prog && prog.total > 0) {
    const prevPct = Math.round(prog.prevDone / prog.total * 100);
    const revPct  = Math.round(prog.revDone  / prog.total * 100);
    progressBar = `
      <div style="margin-top:.55rem;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;gap:.5rem;">
          <span style="font-size:.68rem;color:var(--accent);min-width:2.2rem;">預習</span>
          <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
            <div style="height:100%;width:${prevPct}%;background:var(--accent);border-radius:999px;transition:width .3s;"></div>
          </div>
          <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.prevDone}/${prog.total}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem;">
          <span style="font-size:.68rem;color:var(--success);min-width:2.2rem;">複習</span>
          <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
            <div style="height:100%;width:${revPct}%;background:var(--success);border-radius:999px;transition:width .3s;"></div>
          </div>
          <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.revDone}/${prog.total}</span>
        </div>
      </div>`;
  }

  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;flex-wrap:wrap;">
          <span class="badge" style="background:${e.subject_color}">${escHtml(e.subject_name)}</span>
          <span class="chip">${TYPE_LABEL[e.exam_type]||e.exam_type}</span>
          ${!e.is_completed ? `<span class="countdown-pill ${urgency}">${d < 0 ? `已過 ${-d} 天` : d === 0 ? '今天！' : d+'天後'}</span>` : ''}
        </div>
        <div style="font-weight:600;margin-bottom:.15rem;">${escHtml(e.title)}</div>
        <div class="text-xs text-muted">${fmtDate(e.exam_date)}${e.notes?'・'+escHtml(e.notes):''}</div>
        ${progressBar}
      </div>
      <div style="display:flex;gap:.5rem;align-items:center;margin-left:1rem;flex-shrink:0;">
        <button class="btn btn-ghost btn-sm exam-toggle-btn" data-id="${e.id}" data-done="${e.is_completed}">
          ${e.is_completed ? '↩ 取消完成' : '✓ 完成'}
        </button>
        <button class="btn btn-ghost btn-sm exam-edit-btn" data-id="${e.id}">編輯</button>
        <button class="btn btn-danger btn-sm exam-del-btn" data-id="${e.id}">✕</button>
      </div>
    </div>`;
}

function buildModal(e) {
  e = e || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${e.id ? '編輯考試' : '新增考試'}</div>
      <div class="form-group">
        <label class="form-label">科目</label>
        <select id="em-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}" ${e.subject_id==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">考試名稱</label>
        <input id="em-title" class="form-input" value="${escHtml(e.title||'')}" placeholder="例：第一章小考">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
        <div class="form-group">
          <label class="form-label">日期</label>
          <input id="em-date" type="date" class="form-input" value="${e.exam_date||''}">
        </div>
        <div class="form-group">
          <label class="form-label">類型</label>
          <select id="em-type" class="form-select">
            ${Object.entries(TYPE_LABEL).map(([v,l]) => `<option value="${v}" ${e.exam_type==v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">備註（選填）</label>
        <input id="em-notes" class="form-input" value="${escHtml(e.notes||'')}">
      </div>
      <div class="modal-footer">
        ${e.id ? `<button class="btn btn-danger btn-sm" id="em-del">刪除</button>` : ''}
        <button class="btn btn-ghost" id="em-cancel">取消</button>
        <button class="btn btn-primary" id="em-save">儲存</button>
      </div>
    </div>`;
}

function openModal(el, exam) {
  const modal = el.querySelector('#exam-modal');
  modal.innerHTML = buildModal(exam);
  modal.classList.remove('hidden');
  modal.querySelector('#em-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#em-save').onclick   = () => save(el, exam);
  const delBtn = modal.querySelector('#em-del');
  if (delBtn) delBtn.onclick = () => deleteExam(el, exam.id);
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
}

async function save(el, existing) {
  const modal = el.querySelector('#exam-modal');
  const body = {
    subject_id: +modal.querySelector('#em-subject').value,
    title: modal.querySelector('#em-title').value.trim(),
    exam_date: modal.querySelector('#em-date').value,
    exam_type: modal.querySelector('#em-type').value,
    notes: modal.querySelector('#em-notes').value.trim() || null,
  };
  if (!body.title || !body.exam_date) return alert('請填寫名稱與日期');
  if (existing) await put('/exams/' + existing.id, body);
  else          await post('/exams', body);
  await refresh(el);
}

async function deleteExam(el, id) {
  if (!confirm('確定刪除？')) return;
  await del('/exams/' + id);
  await refresh(el);
}

function attachEvents(el, exams) {
  el.querySelector('#exam-add-btn').onclick = () => openModal(el, null);

  const clearBtn = el.querySelector('#exam-clear-expired-btn');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      const expired = exams.filter(e => !e.is_completed && e.days_left < 0);
      if (!confirm(`將 ${expired.length} 筆已過期考試標記為完成？`)) return;
      await Promise.all(expired.map(e => put('/exams/' + e.id, { is_completed: true })));
      await refresh(el);
    };
  }
  el.querySelectorAll('.exam-edit-btn').forEach(btn => {
    btn.onclick = () => openModal(el, exams.find(e => e.id === +btn.dataset.id));
  });
  el.querySelectorAll('.exam-del-btn').forEach(btn => {
    btn.onclick = () => deleteExam(el, +btn.dataset.id);
  });
  el.querySelectorAll('.exam-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const exam = exams.find(e => e.id === +btn.dataset.id);
      await put('/exams/' + exam.id, { is_completed: !exam.is_completed });
      await refresh(el);
    };
  });
}
