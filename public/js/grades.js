import { get, post, put, del, escHtml, fmtDate } from './api.js';

let subjects = [];
let currentSubjectFilter = '';

export async function render(el) {
  subjects = await get('/subjects');
  await refresh(el);
}

async function refresh(el) {
  const url = currentSubjectFilter ? `/grades?subject_id=${currentSubjectFilter}` : '/grades';
  const grades = await get(url);
  el.innerHTML = buildPage(grades);
  attachEvents(el, grades);
  renderChart(el, grades);
}

function buildPage(grades) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
      <div style="display:flex;gap:.75rem;align-items:center;">
        <label class="form-label" style="margin:0;">篩選科目：</label>
        <select id="gr-filter" class="form-select" style="width:auto;">
          <option value="">全部</option>
          ${subjects.map(s => `<option value="${s.id}" ${currentSubjectFilter==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="gr-add-btn">+ 新增成績</button>
    </div>

    <!-- Chart -->
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">📈 成績趨勢</div>
      <canvas id="grade-chart" height="120"></canvas>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-title">成績列表</div>
      <table class="data-table">
        <thead><tr><th>日期</th><th>科目</th><th>考試名稱</th><th>分數</th><th>百分比</th><th></th></tr></thead>
        <tbody>
          ${grades.length ? grades.map(g => {
            const pct = Math.round(g.score / g.max_score * 100);
            const color = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warn)' : 'var(--danger)';
            return `<tr>
              <td>${g.exam_date}</td>
              <td><span class="badge" style="background:${g.subject_color}">${escHtml(g.subject_name)}</span></td>
              <td>${escHtml(g.exam_name)}</td>
              <td>${g.score} / ${g.max_score}</td>
              <td><span style="font-weight:700;color:${color}">${pct}%</span></td>
              <td style="display:flex;gap:.4rem;">
                <button class="btn btn-ghost btn-sm gr-edit-btn" data-id="${g.id}">編輯</button>
                <button class="btn btn-danger btn-sm gr-del-btn" data-id="${g.id}">✕</button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text2);">尚無成績記錄</td></tr>'}
        </tbody>
      </table>
    </div>
    <div id="gr-modal" class="modal-overlay hidden">${buildModal()}</div>`;
}

function buildModal(g) {
  g = g || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${g.id ? '編輯成績' : '新增成績'}</div>
      <div class="form-group">
        <label class="form-label">科目</label>
        <select id="gm-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}" ${g.subject_id==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">考試名稱</label>
        <input id="gm-name" class="form-input" value="${escHtml(g.exam_name||'')}" placeholder="例：期中考">
      </div>
      <div class="form-group">
        <label class="form-label">日期</label>
        <input id="gm-date" type="date" class="form-input" value="${g.exam_date||''}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
        <div class="form-group">
          <label class="form-label">得分</label>
          <input id="gm-score" type="number" class="form-input" value="${g.score??''}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">滿分</label>
          <input id="gm-max" type="number" class="form-input" value="${g.max_score??100}" min="1">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">備註（選填）</label>
        <input id="gm-notes" class="form-input" value="${escHtml(g.notes||'')}">
      </div>
      <div class="modal-footer">
        ${g.id ? `<button class="btn btn-danger btn-sm" id="gm-del">刪除</button>` : ''}
        <button class="btn btn-ghost" id="gm-cancel">取消</button>
        <button class="btn btn-primary" id="gm-save">儲存</button>
      </div>
    </div>`;
}

function openModal(el, grade) {
  const modal = el.querySelector('#gr-modal');
  modal.innerHTML = buildModal(grade);
  modal.classList.remove('hidden');
  modal.querySelector('#gm-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#gm-save').onclick   = () => save(el, grade);
  const delBtn = modal.querySelector('#gm-del');
  if (delBtn) delBtn.onclick = () => deleteGrade(el, grade.id);
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
}

async function save(el, existing) {
  const modal = el.querySelector('#gr-modal');
  const body = {
    subject_id: +modal.querySelector('#gm-subject').value,
    exam_name: modal.querySelector('#gm-name').value.trim(),
    exam_date: modal.querySelector('#gm-date').value,
    score: +modal.querySelector('#gm-score').value,
    max_score: +modal.querySelector('#gm-max').value || 100,
    notes: modal.querySelector('#gm-notes').value.trim() || null,
  };
  if (!body.exam_name || !body.exam_date || isNaN(body.score)) return alert('請填寫必要欄位');
  if (existing) await put('/grades/' + existing.id, body);
  else          await post('/grades', body);
  await refresh(el);
}

async function deleteGrade(el, id) {
  if (!confirm('確定刪除？')) return;
  await del('/grades/' + id);
  await refresh(el);
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
      y: Math.round(g.score / g.max_score * 100),
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
    await refresh(el);
  };
  el.querySelector('#gr-add-btn').onclick = () => openModal(el, null);
  el.querySelectorAll('.gr-edit-btn').forEach(btn => {
    btn.onclick = () => openModal(el, grades.find(g => g.id === +btn.dataset.id));
  });
  el.querySelectorAll('.gr-del-btn').forEach(btn => {
    btn.onclick = () => deleteGrade(el, +btn.dataset.id);
  });
}
