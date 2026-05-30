import { get, post, put, del, escHtml } from './api.js';
import { t } from './i18n.js';

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

function DAYS() {
  return [0,1,2,3,4,5,6].map(i => t(`day.${i}`));
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
    rows.push(`<option value="${y}" ${y === currentYear ? 'selected' : ''}>${t('tt.schoolYear', { y })}</option>`);
  }
  return rows.join('');
}

function buildPage() {
  const days = DAYS();
  return `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;">
      <select id="tt-year-sel" class="form-select" style="width:auto;">
        ${yearOptions()}
      </select>
      <select id="tt-sem-sel" class="form-select" style="width:auto;">
        <option value="1" ${currentSem === 1 ? 'selected' : ''}>${t('tt.sem1')}</option>
        <option value="2" ${currentSem === 2 ? 'selected' : ''}>${t('tt.sem2')}</option>
      </select>
      <span class="text-sm text-muted" style="margin-left:.25rem;">${t('tt.hint')}</span>
    </div>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;width:100%;min-width:600px;background:var(--bg2);border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);">
        <thead>
          <tr>
            <th style="padding:.5rem .75rem;background:var(--bg3);border-bottom:1px solid var(--border);font-size:.8rem;color:var(--text2);width:60px;">${t('tt.periodHeader')}</th>
            ${days.map(d => `<th style="padding:.5rem .75rem;background:var(--bg3);border-bottom:1px solid var(--border);font-size:.8rem;font-weight:700;text-align:center;border-left:1px solid var(--border);">${d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${buildTbody()}</tbody>
      </table>
    </div>
    <div id="tt-modal" class="modal-overlay hidden"></div>`;
}

function buildTbody() {
  const days = DAYS();
  return PERIODS.map(p => `
    <tr>
      <td style="padding:.4rem .75rem;border-bottom:1px solid var(--border);text-align:center;color:var(--text2);font-size:.82rem;font-weight:600;background:var(--bg3);">${t('tt.period', { n: p })}</td>
      ${days.map((_, d) => {
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
  const days = DAYS();
  const s = slot || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${s.id
        ? t('tt.editTitle', { y: s.school_year, sem: s.semester })
        : t('tt.addTitle', { day: days[day], period })}</div>
      ${!subjects.length
        ? `<div class="empty-state" style="padding:1rem;"><p>${t('tt.noSubject')}</p></div>`
        : `<div class="form-group">
            <label class="form-label">${t('label.subject')}</label>
            <select id="tt-subject" class="form-select">
              ${subjects.map(sub => `<option value="${sub.id}" ${s.subject_id == sub.id ? 'selected' : ''}>${escHtml(sub.name)}</option>`).join('')}
            </select>
          </div>`}
      ${s.id ? '' : `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
          <div class="form-group">
            <label class="form-label">${t('label.dayOfWeek')}</label>
            <select id="tt-day" class="form-select">
              ${days.map((d, i) => `<option value="${i}" ${day === i ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${t('label.period')}</label>
            <select id="tt-period" class="form-select">
              ${PERIODS.map(p => `<option value="${p}" ${period === p ? 'selected' : ''}>${t('tt.period', { n: p })}</option>`).join('')}
            </select>
          </div>
        </div>`}
      <div class="modal-footer">
        ${s.id ? `<button class="btn btn-danger btn-sm" id="tt-del-btn">${t('btn.delete')}</button>` : ''}
        <button class="btn btn-ghost" id="tt-cancel-btn">${t('btn.cancel')}</button>
        ${subjects.length ? `<button class="btn btn-primary" id="tt-save-btn">${t('btn.save')}</button>` : ''}
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
  if (!confirm(t('confirm.deleteSlot'))) return;
  await del('/timetable/' + id);
  el.querySelector('#tt-modal').classList.add('hidden');
  await reloadSlots(el);
}
