import { get, post, put, del, escHtml, fmtDate } from './api.js';
import { t } from './i18n.js';
import { initPeriodFilter, inRange } from './period-filter.js';

let subjects = [];
let exams = [];
let currentSubjectFilter = '';

let _el;
let _scope = { mode: 'all' };
let _gen = 0;

export async function render(el) {
  _el = el;
  try {
    [subjects, exams] = await Promise.all([get('/subjects'), get('/exams')]);
    subjects = subjects.filter(s => s.category === 'exam');
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">${t('alert.loadFail', { msg: e.message })}</p></div>`;
    return;
  }
  el.innerHTML = `<div id="gr-period-filter"></div><div id="gr-body"></div>`;
  await initPeriodFilter(el.querySelector('#gr-period-filter'), scope => { _scope = scope; refresh(); });
}

async function refresh() {
  const gen = ++_gen;
  const url = currentSubjectFilter ? `/grades?subject_id=${currentSubjectFilter}` : '/grades';
  const grades = await get(url);
  // Period scope narrows both the table and the trend chart — the whole page is
  // one dataset (exam_date is a bare date column, compared directly).
  const scoped = grades.filter(g => inRange(g.exam_date, _scope));
  const body = _el.querySelector('#gr-body');
  if (!body || gen !== _gen) return; // navigated away, or superseded by a newer refresh
  body.innerHTML = buildPage(scoped);
  attachEvents(body, scoped);
  renderChart(body, scoped);
}

function buildPage(grades) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
      <div style="display:flex;gap:.75rem;align-items:center;">
        <label class="form-label" style="margin:0;">${t('grade.filterLabel')}</label>
        <select id="gr-filter" class="form-select" style="width:auto;">
          <option value="">${t('grade.allSubjects')}</option>
          ${subjects.map(s => `<option value="${s.id}" ${currentSubjectFilter==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="gr-add-btn">${t('grade.add')}</button>
    </div>

    <!-- Chart -->
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('grade.trend')}</div>
      <canvas id="grade-chart" height="120"></canvas>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-title">${t('grade.list')}</div>
      <table class="data-table">
        <thead><tr>
          <th>${t('th.date')}</th>
          <th>${t('th.subject')}</th>
          <th>${t('th.examName')}</th>
          <th>${t('th.score')}</th>
          <th style="width:90px;">${t('th.classRank')}</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${grades.length ? grades.map(g => {
            return `<tr>
              <td>${g.exam_date}</td>
              <td><span class="badge" style="background:${g.subject_color}">${escHtml(g.subject_name)}</span></td>
              <td>${escHtml(g.exam_name)}</td>
              <td>${g.score} / ${g.max_score}</td>
              <td>
                <input class="form-input gr-rank-input" data-id="${g.id}"
                  value="${escHtml(g.class_rank||'')}" placeholder="—"
                  style="width:80px;padding:.2rem .4rem;font-size:.85rem;text-align:center;">
              </td>
              <td style="display:flex;gap:.4rem;">
                <button class="btn btn-ghost btn-sm gr-edit-btn" data-id="${g.id}">${t('btn.edit')}</button>
                <button class="btn btn-danger btn-sm gr-del-btn" data-id="${g.id}">✕</button>
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text2);">${t('grade.noGrades')}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div id="gr-modal" class="modal-overlay hidden">${buildModal()}</div>`;
}

function buildModal(g) {
  g = g || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${g.id ? t('grade.editTitle') : t('grade.addTitle')}</div>
      <div class="form-group">
        <label class="form-label">${t('label.linkExam')}</label>
        <select id="gm-exam-pick" class="form-select">
          <option value="">${t('label.noExamLink')}</option>
          ${exams.map(e => `<option value="${e.id}"
            data-name="${escHtml(e.title)}"
            data-date="${e.exam_date}"
            data-sid="${e.subject_id}"
            ${g.exam_id == e.id ? 'selected' : ''}>
            ${escHtml(e.subject_name)}・${escHtml(e.title)}（${fmtDate(e.exam_date)}）
          </option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.subject')}</label>
        <select id="gm-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}" ${g.subject_id==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('th.examName')}</label>
        <input id="gm-name" class="form-input" value="${escHtml(g.exam_name||'')}" placeholder="${t('grade.addTitle')}…">
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.date')}</label>
        <input id="gm-date" type="date" class="form-input" value="${g.exam_date||''}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
        <div class="form-group">
          <label class="form-label">${t('label.score')}</label>
          <input id="gm-score" type="number" class="form-input" value="${g.score??''}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">${t('label.maxScore')}</label>
          <input id="gm-max" type="number" class="form-input" value="${g.max_score??100}" min="1">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.classRankOptional')}</label>
        <input id="gm-rank" class="form-input" value="${escHtml(g.class_rank||'')}" placeholder="3 / 3/40">
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.notesOptional')}</label>
        <input id="gm-notes" class="form-input" value="${escHtml(g.notes||'')}">
      </div>
      <div class="modal-footer">
        ${g.id ? `<button class="btn btn-danger btn-sm" id="gm-del">${t('btn.delete')}</button>` : ''}
        <button class="btn btn-ghost" id="gm-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="gm-save">${t('btn.save')}</button>
      </div>
    </div>`;
}

function openModal(el, grade) {
  const modal = el.querySelector('#gr-modal');
  modal.innerHTML = buildModal(grade);
  modal.classList.remove('hidden');

  const picker = modal.querySelector('#gm-exam-pick');
  picker.onchange = () => {
    const opt = picker.options[picker.selectedIndex];
    if (!opt.value) return;
    modal.querySelector('#gm-name').value    = opt.dataset.name;
    modal.querySelector('#gm-date').value    = opt.dataset.date;
    modal.querySelector('#gm-subject').value = opt.dataset.sid;
  };

  modal.querySelector('#gm-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#gm-save').onclick   = () => save(el, grade);
  const delBtn = modal.querySelector('#gm-del');
  if (delBtn) delBtn.onclick = () => deleteGrade(el, grade.id);
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
}

async function save(el, existing) {
  const modal = el.querySelector('#gr-modal');
  const pickerId = modal.querySelector('#gm-exam-pick').value;
  const body = {
    subject_id: +modal.querySelector('#gm-subject').value,
    exam_id: pickerId ? +pickerId : null,
    exam_name: modal.querySelector('#gm-name').value.trim(),
    exam_date: modal.querySelector('#gm-date').value,
    score: +modal.querySelector('#gm-score').value,
    max_score: +modal.querySelector('#gm-max').value || 100,
    class_rank: modal.querySelector('#gm-rank').value.trim() || null,
    notes: modal.querySelector('#gm-notes').value.trim() || null,
  };
  if (!body.exam_name || !body.exam_date || isNaN(body.score)) return alert(t('alert.fillRequired'));
  if (existing) await put('/grades/' + existing.id, body);
  else          await post('/grades', body);
  await refresh();
}

async function deleteGrade(el, id) {
  if (!confirm(t('confirm.delete'))) return;
  await del('/grades/' + id);
  await refresh();
}

function renderChart(el, grades) {
  const canvas = el.querySelector('#grade-chart');
  if (!canvas || !window.Chart) return;

  const subjectColors = {};
  const bySubject = {};
  for (const g of grades) {
    subjectColors[g.subject_name] = g.subject_color;
    (bySubject[g.subject_name] = bySubject[g.subject_name] || []).push({
      x: g.exam_date,
      y: g.max_score > 0 ? Math.round(g.score / g.max_score * 100) : 0,
      label: g.exam_name,
    });
  }

  const datasets = Object.entries(bySubject).map(([name, pts]) => ({
    label: name,
    data: pts.map(p => ({ x: p.x, y: p.y })),
    borderColor: subjectColors[name],
    backgroundColor: subjectColors[name] + '44',
    tension: 0.3,
    fill: false,
    pointRadius: 5,
  }));

  new window.Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { type: 'category' },
        y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
      },
    }
  });
}

function attachEvents(el, grades) {
  el.querySelector('#gr-filter').onchange = async (e) => {
    currentSubjectFilter = e.target.value;
    await refresh();
  };
  el.querySelector('#gr-add-btn').onclick = () => openModal(el, null);
  el.querySelectorAll('.gr-edit-btn').forEach(btn => {
    btn.onclick = () => openModal(el, grades.find(g => g.id === +btn.dataset.id));
  });
  el.querySelectorAll('.gr-del-btn').forEach(btn => {
    btn.onclick = () => deleteGrade(el, +btn.dataset.id);
  });

  el.querySelectorAll('.gr-rank-input').forEach(input => {
    const save = async () => {
      try {
        await put('/grades/' + input.dataset.id, { class_rank: input.value.trim() || null });
      } catch (e) {
        alert(t('alert.saveFailed', { msg: e.message }));
      }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  });
}
