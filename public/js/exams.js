import { get, post, put, del, escHtml, fmtDate } from './api.js';
import { t } from './i18n.js';
import { inRange, mountPeriodScoped } from './period-filter.js';

let subjects = [];

function TYPE_LABEL() {
  return {
    quiz: t('enum.examType.quiz'), segment: t('enum.examType.segment'),
    midterm: t('enum.examType.midterm'), final: t('enum.examType.final'), mock: t('enum.examType.mock'),
  };
}

let _scope = { mode: 'all' };
let _mount;
// { exams, chapters } — first fetch per render() is cached here so chip
// switches only refilter+redraw (0 fetches); render() resets it to null so
// leaving and re-entering the page still refetches.
let _cache = null;

export async function render(el) {
  _cache = null;
  subjects = await get('/subjects');
  await mountPeriodScoped(el, {
    filterId: 'exam-filter', bodyId: 'exam-body',
    onChange: (scope, mount) => { _mount = mount; _scope = scope; applyScope(); },
  });
}

function renderFromCache(body) {
  const progressMap = buildProgressMap(_cache.chapters);
  const scoped = _cache.exams.filter(e => inRange(e.exam_date, _scope));
  body.innerHTML = buildPage(scoped, progressMap);
  attachEvents(body, scoped);
}

// Chip switch: reuse the cached dataset, just refilter + redraw (no fetch).
function applyScope() {
  if (!_cache) { refresh(); return; }
  const body = _mount.begin()(); // bump gen, then resolve immediately (no await in between)
  if (!body) return;
  renderFromCache(body);
}

// Mutations (add/edit/delete/toggle) always refetch — the dataset actually changed.
async function refresh() {
  const done = _mount.begin();
  const [exams, chapters] = await Promise.all([get('/exams'), get('/chapters')]);
  _cache = { exams, chapters };
  const body = done();
  if (!body) return;
  renderFromCache(body);
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
  const tl = TYPE_LABEL();
  const upcoming = exams.filter(e => !e.is_completed && e.days_left >= 0);
  const expired  = exams.filter(e => !e.is_completed && e.days_left < 0);
  const done     = exams.filter(e => e.is_completed);

  return `
    <div style="display:flex;justify-content:space-between;margin-bottom:1.25rem;">
      <div></div>
      <button class="btn btn-primary" id="exam-add-btn">${t('exam.add')}</button>
    </div>

    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('exam.upcoming', { n: upcoming.length })}</div>
      ${upcoming.length ? upcoming.map(e => examCard(e, progressMap[e.subject_id], tl)).join('') :
        `<div class="text-muted text-sm">${t('exam.noUpcoming')}</div>`}
    </div>

    ${expired.length ? `
    <div class="card" style="margin-bottom:1.25rem;border-left:3px solid var(--danger);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">
        <div class="card-title" style="color:var(--danger);margin-bottom:0;">${t('exam.expired', { n: expired.length })}</div>
        <button class="btn btn-danger btn-sm" id="exam-clear-expired-btn">${t('exam.clearExpired')}</button>
      </div>
      ${expired.map(e => examCard(e, progressMap[e.subject_id], tl)).join('')}
    </div>` : ''}

    ${done.length ? `
    <div class="card">
      <div class="card-title" style="color:var(--text2)">${t('exam.done', { n: done.length })}</div>
      ${done.map(e => examCard(e, progressMap[e.subject_id], tl)).join('')}
    </div>` : ''}

    <div id="exam-modal" class="modal-overlay hidden">${buildModal()}</div>`;
}

function examCard(e, prog, tl) {
  tl = tl || TYPE_LABEL();
  const d = e.days_left;
  const urgency = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';

  let progressBar = '';
  if (prog && prog.total > 0) {
    const prevPct = Math.round(prog.prevDone / prog.total * 100);
    const revPct  = Math.round(prog.revDone  / prog.total * 100);
    progressBar = `
      <div style="margin-top:.55rem;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;gap:.5rem;">
          <span style="font-size:.68rem;color:var(--accent);min-width:2.2rem;">${t('dash.preview')}</span>
          <div style="flex:1;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
            <div style="height:100%;width:${prevPct}%;background:var(--accent);border-radius:999px;transition:width .3s;"></div>
          </div>
          <span style="font-size:.68rem;color:var(--text3);min-width:2.8rem;text-align:right;">${prog.prevDone}/${prog.total}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem;">
          <span style="font-size:.68rem;color:var(--success);min-width:2.2rem;">${t('dash.review')}</span>
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
          <span class="chip">${tl[e.exam_type] || e.exam_type}</span>
          ${!e.is_completed ? `<span class="countdown-pill ${urgency}">${d < 0 ? t('exam.overdueBy', { n: -d }) : d === 0 ? t('exam.today') : t('exam.daysLeft', { n: d })}</span>` : ''}
        </div>
        <div style="font-weight:600;margin-bottom:.15rem;">${escHtml(e.title)}</div>
        <div class="text-xs text-muted">${fmtDate(e.exam_date)}${e.notes ? '・' + escHtml(e.notes) : ''}</div>
        ${progressBar}
      </div>
      <div style="display:flex;gap:.5rem;align-items:center;margin-left:1rem;flex-shrink:0;">
        <button class="btn btn-ghost btn-sm exam-toggle-btn" data-id="${e.id}" data-done="${e.is_completed}">
          ${e.is_completed ? t('btn.undone') : t('btn.done')}
        </button>
        <button class="btn btn-ghost btn-sm exam-edit-btn" data-id="${e.id}">${t('btn.edit')}</button>
        <button class="btn btn-danger btn-sm exam-del-btn" data-id="${e.id}">✕</button>
      </div>
    </div>`;
}

function buildModal(e) {
  e = e || {};
  const tl = TYPE_LABEL();
  return `
    <div class="modal-box">
      <div class="modal-title">${e.id ? t('exam.editTitle') : t('exam.addTitle')}</div>
      <div class="form-group">
        <label class="form-label">${t('label.subject')}</label>
        <select id="em-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}" ${e.subject_id==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.examName')}</label>
        <input id="em-title" class="form-input" value="${escHtml(e.title||'')}" placeholder="${t('enum.examType.quiz')}…">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
        <div class="form-group">
          <label class="form-label">${t('label.date')}</label>
          <input id="em-date" type="date" class="form-input" value="${e.exam_date||''}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('label.type')}</label>
          <select id="em-type" class="form-select">
            ${Object.entries(tl).map(([v, l]) => `<option value="${v}" ${e.exam_type==v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.notesOptional')}</label>
        <input id="em-notes" class="form-input" value="${escHtml(e.notes||'')}">
      </div>
      <div class="modal-footer">
        ${e.id ? `<button class="btn btn-danger btn-sm" id="em-del">${t('btn.delete')}</button>` : ''}
        <button class="btn btn-ghost" id="em-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="em-save">${t('btn.save')}</button>
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
  if (!body.title || !body.exam_date) return alert(t('alert.fillNameDate'));
  if (existing) await put('/exams/' + existing.id, body);
  else          await post('/exams', body);
  await refresh();
}

async function deleteExam(el, id) {
  if (!confirm(t('confirm.delete'))) return;
  await del('/exams/' + id);
  await refresh();
}

function attachEvents(el, exams) {
  el.querySelector('#exam-add-btn').onclick = () => openModal(el, null);

  const clearBtn = el.querySelector('#exam-clear-expired-btn');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      const expired = exams.filter(e => !e.is_completed && e.days_left < 0);
      if (!confirm(t('confirm.clearExpired', { n: expired.length }))) return;
      await Promise.all(expired.map(e => put('/exams/' + e.id, { is_completed: true })));
      await refresh();
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
      await refresh();
    };
  });
}
