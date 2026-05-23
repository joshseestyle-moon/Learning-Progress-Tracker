import { get, post, put, del, escHtml } from './api.js';

const DAYS = ['週一','週二','週三','週四','週五','週六','週日'];
const PERIODS = Array.from({ length: 10 }, (_, i) => i + 1);

let subjects = [];
let slots = [];
let currentYear, currentSem;

function currentPeriod() {
  const m = new Date().getMonth() + 1;
  const roc = new Date().getFullYear() - 1911;
  if (m >= 9) return { year: roc, semester: 1 };
  if (m >= 2) return { year: roc - 1, semester: 2 };
  return { year: roc - 1, semester: 1 };
}

export async function render(el) {
  const ap = currentPeriod();
  currentYear = ap.year;
  currentSem  = ap.semester;
  subjects = await get('/subjects');
  slots    = await get(`/timetable?school_year=${currentYear}&semester=${currentSem}`);
  el.innerHTML = buildPage();
  attachEvents(el);
}

async function reloadSlots(el) {
  slots = await get(`/timetable?school_year=${currentYear}&semester=${currentSem}`);
  el.querySelector('tbody').innerHTML = buildTbody();
  attachCells(el);
}

function yearOptions() {
  const rows = [];
  for (let y = 114; y <= 120; y++) {
    rows.push(`<option value="${y}" ${y === currentYear ? 'selected' : ''}>民國 ${y} 學年度</option>`);
  }
  return rows.join('');
}

function buildPage() {
  return `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;">
      <select id="tt-year-sel" class="form-select" style="width:auto;">
        ${yearOptions()}
      </select>
      <select id="tt-sem-sel" class="form-select" style="width:auto;">
        <option value="1" ${currentSem === 1 ? 'selected' : ''}>第1學期（上學期）</option>
        <option value="2" ${currentSem === 2 ? 'selected' : ''}>第2學期（下學期）</option>
      </select>
      <span class="text-sm text-muted" style="margin-left:.25rem;">點格子新增，點課程編輯或刪除</span>
    </div>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;width:100%;min-width:600px;background:var(--bg2);border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);">
        <thead>
          <tr>
            <th style="padding:.5rem .75rem;background:var(--bg3);border-bottom:1px solid var(--border);font-size:.8rem;color:var(--text2);width:60px;">節次</th>
            ${DAYS.map(d => `<th style="padding:.5rem .75rem;background:var(--bg3);border-bottom:1px solid var(--border);font-size:.8rem;font-weight:700;text-align:center;border-left:1px solid var(--border);">${d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${buildTbody()}</tbody>
      </table>
    </div>
    <div id="tt-modal" class="modal-overlay hidden"></div>`;
}

function buildTbody() {
  return PERIODS.map(p => `
    <tr>
      <td style="padding:.4rem .75rem;border-bottom:1px solid var(--border);text-align:center;color:var(--text2);font-size:.82rem;font-weight:600;background:var(--bg3);">第${p}節</td>
      ${DAYS.map((_, d) => {
        const slot = slots.find(s => s.day_of_week === d && s.period === p);
        return `<td style="border-left:1px solid var(--border);border-bottom:1px solid var(--border);padding:.3rem;min-height:48px;cursor:pointer;transition:background .1s;"
          class="tt-cell" data-day="${d}" data-period="${p}" ${slot ? `data-slot-id="${slot.id}"` : ''}>
          ${slot ? `<div class="tt-slot" style="background:${slot.subject_color};">${escHtml(slot.subject_name)}</div>` : ''}
        </td>`;
      }).join('')}
    </tr>`).join('');
}

function attachEvents(el) {
  el.querySelector('#tt-year-sel').onchange = async e => {
    currentYear = +e.target.value;
    await reloadSlots(el);
  };
  el.querySelector('#tt-sem-sel').onchange = async e => {
    currentSem = +e.target.value;
    await reloadSlots(el);
  };
  attachCells(el);
}

function attachCells(el) {
  el.querySelectorAll('.tt-cell').forEach(cell => {
    cell.onmouseenter = () => { if (!cell.dataset.slotId) cell.style.background = 'var(--bg3)'; };
    cell.onmouseleave = () => { cell.style.background = ''; };
    cell.onclick = () => {
      const slotId = cell.dataset.slotId ? +cell.dataset.slotId : null;
      const slot   = slotId ? slots.find(s => s.id === slotId) : null;
      openModal(el, slot, +cell.dataset.day, +cell.dataset.period);
    };
  });
}

function buildModal(slot, day, period) {
  const s = slot || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${s.id
        ? `編輯課程 — 民國 ${s.school_year} 學年度 第${s.semester}學期`
        : `新增課程 — ${DAYS[day]} 第${period}節`}</div>
      ${!subjects.length
        ? `<div class="empty-state" style="padding:1rem;"><p>請先到「課程資訊」新增科目</p></div>`
        : `<div class="form-group">
            <label class="form-label">科目</label>
            <select id="tt-subject" class="form-select">
              ${subjects.map(sub => `<option value="${sub.id}" ${s.subject_id == sub.id ? 'selected' : ''}>${escHtml(sub.name)}</option>`).join('')}
            </select>
          </div>`}
      ${s.id ? '' : `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
          <div class="form-group">
            <label class="form-label">星期</label>
            <select id="tt-day" class="form-select">
              ${DAYS.map((d, i) => `<option value="${i}" ${day === i ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">節次</label>
            <select id="tt-period" class="form-select">
              ${PERIODS.map(p => `<option value="${p}" ${period === p ? 'selected' : ''}>第${p}節</option>`).join('')}
            </select>
          </div>
        </div>`}
      <div class="modal-footer">
        ${s.id ? `<button class="btn btn-danger btn-sm" id="tt-del-btn">刪除</button>` : ''}
        <button class="btn btn-ghost" id="tt-cancel-btn">取消</button>
        ${subjects.length ? `<button class="btn btn-primary" id="tt-save-btn">儲存</button>` : ''}
      </div>
    </div>`;
}

function openModal(el, slot, day, period) {
  const modal = el.querySelector('#tt-modal');
  modal.innerHTML = buildModal(slot, day, period);
  modal.classList.remove('hidden');
  modal.querySelector('#tt-cancel-btn').onclick = () => modal.classList.add('hidden');
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
  const saveBtn = modal.querySelector('#tt-save-btn');
  if (saveBtn) saveBtn.onclick = () => saveSlot(el, slot, day, period);
  const delBtn = modal.querySelector('#tt-del-btn');
  if (delBtn) delBtn.onclick = () => deleteSlot(el, slot.id);
}

async function saveSlot(el, existing, defaultDay, defaultPeriod) {
  const modal = el.querySelector('#tt-modal');
  const body = {
    subject_id:  +modal.querySelector('#tt-subject').value,
    day_of_week: existing ? existing.day_of_week : +modal.querySelector('#tt-day').value,
    period:      existing ? existing.period       : +modal.querySelector('#tt-period').value,
    school_year: currentYear,
    semester:    currentSem,
  };
  try {
    if (existing) await put('/timetable/' + existing.id, body);
    else          await post('/timetable', body);
  } catch (e) {
    return alert(e.message);
  }
  modal.classList.add('hidden');
  await reloadSlots(el);
}

async function deleteSlot(el, id) {
  if (!confirm('確定刪除這個課程？')) return;
  await del('/timetable/' + id);
  el.querySelector('#tt-modal').classList.add('hidden');
  await reloadSlots(el);
}
