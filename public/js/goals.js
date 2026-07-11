import { get, post, put, del, patch, escHtml, fmtDate } from './api.js';
import { t, getLang } from './i18n.js';

const PERIOD_TYPES = ['semester1', 'winter', 'semester2', 'summer'];
const GOAL_ICONS = { chapter: '📖', grade: '🏆', text: '✏️' };
const EXAM_TYPES = ['quiz', 'segment', 'midterm', 'final', 'mock'];

let goals = [];
let periods = [];
let subjects = [];
let currentPeriod = null;
let selectedYear = null;

function defaultSchoolYear() {
  const m = new Date().getMonth() + 1;
  const roc = new Date().getFullYear() - 1911;
  return m >= 8 ? roc : roc - 1;
}

function displayYear(rocYear) {
  return getLang() === 'zh-TW' ? rocYear : rocYear + 1912;
}

function periodLabel(type) {
  return t('enum.periodType.' + type);
}

export async function render(el) {
  if (selectedYear == null) selectedYear = defaultSchoolYear();
  [goals, periods, subjects, currentPeriod] = await Promise.all([
    get('/goals'),
    get('/periods'),
    get('/subjects'),
    get('/periods/current'),
  ]);
  el.innerHTML = buildPage();
  attachEvents(el);
}

function yearPeriods() {
  const map = {};
  for (const p of periods) if (p.school_year === selectedYear) map[p.type] = p;
  return map;
}

function buildPeriodSection() {
  const byType = yearPeriods();
  const yearOpts = [];
  for (let y = 114; y <= 120; y++) {
    yearOpts.push(`<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${t('tt.schoolYear', { y: displayYear(y) })}</option>`);
  }
  const currentChip = currentPeriod
    ? `<span class="chip" style="border-color:var(--accent);color:var(--accent);">${t('goal.currentPeriod', {
        name: periodLabel(currentPeriod.type),
        from: fmtDate(currentPeriod.start_date), to: fmtDate(currentPeriod.end_date),
      })}</span>`
    : `<span class="text-xs text-muted">${t('goal.noCurrentPeriod')}</span>`;

  return `
    <div class="card" style="margin-bottom:1.25rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem;">
        <div class="card-title" style="margin:0;">${t('goal.periodSettings')}</div>
        ${currentChip}
      </div>
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;">
        <select id="gp-year" class="form-select" style="width:auto;">${yearOpts.join('')}</select>
        <span class="text-xs text-muted">${t('goal.periodHint')}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.5rem;">
        ${PERIOD_TYPES.map(type => {
          const p = byType[type];
          return `
          <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem .6rem;border-radius:var(--radius-sm);background:var(--bg3);">
            <span style="font-weight:600;font-size:.85rem;min-width:3.6rem;">${periodLabel(type)}</span>
            <input type="date" class="form-input gp-start" data-type="${type}" value="${p ? p.start_date : ''}" style="flex:1;font-size:.8rem;padding:.3rem .4rem;">
            <span class="text-muted">–</span>
            <input type="date" class="form-input gp-end" data-type="${type}" value="${p ? p.end_date : ''}" style="flex:1;font-size:.8rem;padding:.3rem .4rem;">
            <button class="btn btn-primary btn-sm gp-save" data-type="${type}">${t('btn.save')}</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function progressBarHtml(g) {
  if (g.goal_type === 'text') return '';
  const target = g.target || 0;
  const raw = g.progress == null ? null : g.progress;
  const pct = target > 0 && raw != null ? Math.min(100, Math.round(raw / target * 100)) : 0;
  const color = g.achieved ? 'var(--success)' : 'var(--accent)';
  const label = g.goal_type === 'grade'
    ? (raw == null ? t('goal.noScoreYet') : `${raw} / ${target} ${t('goal.scoreUnit')}`)
    : `${raw} / ${target}`;
  return `
    <div style="margin-top:.45rem;">
      <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text2);margin-bottom:.2rem;">
        <span>${label}</span><span>${pct}%</span>
      </div>
      <div style="height:6px;border-radius:999px;background:var(--bg3);overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:999px;transition:width .3s;"></div>
      </div>
    </div>`;
}

function goalCard(g) {
  const doneStyle = g.achieved ? 'border-color:var(--success);' : '';
  const subjectBadge = g.subject_name
    ? `<span class="badge" style="background:${g.subject_color};">${escHtml(g.subject_name)}</span>` : '';
  const periodChip = g.period_type
    ? `<span class="chip" style="font-size:.68rem;">${t('tt.schoolYear', { y: displayYear(g.period_school_year) })} ${periodLabel(g.period_type)}</span>`
    : (g.due_date ? `<span class="chip" style="font-size:.68rem;">⏳ ${fmtDate(g.due_date)}</span>` : '');
  const examChip = g.exam_type
    ? `<span class="chip" style="font-size:.68rem;">${t('enum.examType.' + g.exam_type)}</span>` : '';
  const toggleBtn = g.goal_type === 'text'
    ? `<button class="btn btn-sm ${g.is_done ? 'btn-ghost' : 'btn-primary'} goal-toggle-btn" data-id="${g.id}">
         ${g.is_done ? t('btn.undone') : t('btn.done')}</button>`
    : '';
  return `
    <div class="card goal-card" style="padding:.8rem .9rem;border:2px solid var(--border);${doneStyle}margin-bottom:0;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;">
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
            <span>${GOAL_ICONS[g.goal_type]}</span>
            <span style="font-weight:700;font-size:.92rem;${g.achieved ? 'color:var(--success);' : ''}">${escHtml(g.title)}</span>
            ${g.achieved ? `<span style="font-size:.72rem;color:var(--success);font-weight:700;">${t('goal.achieved')}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;margin-top:.35rem;">
            ${subjectBadge}${examChip}${periodChip}
          </div>
        </div>
        <div style="display:flex;gap:.3rem;flex-shrink:0;">
          ${toggleBtn}
          <button class="btn btn-ghost btn-sm goal-edit-btn" data-id="${g.id}">${t('btn.edit')}</button>
          <button class="btn btn-danger btn-sm goal-del-btn" data-id="${g.id}">✕</button>
        </div>
      </div>
      ${progressBarHtml(g)}
    </div>`;
}

function buildGoalSection() {
  const sections = ['short', 'mid', 'long'].map(h => {
    const list = goals.filter(g => g.horizon === h);
    return `
      <div style="margin-bottom:1.25rem;">
        <div style="font-weight:700;font-size:.95rem;margin-bottom:.6rem;color:var(--text2);">${t('goal.horizon.' + h)}</div>
        ${list.length
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.6rem;">${list.map(goalCard).join('')}</div>`
          : `<div class="text-muted text-sm">${t('goal.noneInHorizon')}</div>`}
      </div>`;
  }).join('');
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <div class="card-title" style="margin:0;">${t('goal.myGoals')}</div>
        <button class="btn btn-primary btn-sm" id="goal-add-btn">${t('goal.addGoal')}</button>
      </div>
      ${goals.length ? sections : `<div class="empty-state" style="padding:1.5rem;"><div class="icon">🎯</div><p>${t('goal.none')}</p></div>`}
    </div>`;
}

function buildPage() {
  return `${buildPeriodSection()}${buildGoalSection()}<div id="goal-modal" class="modal-overlay hidden"></div>`;
}

function buildGoalModal(g) {
  g = g || {};
  const isEdit = !!g.id;
  const type = g.goal_type || 'chapter';
  const subjOpts = (required) => `
    ${required ? '' : `<option value="">${t('goal.anySubject')}</option>`}
    ${subjects.map(s => `<option value="${s.id}" ${g.subject_id == s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('')}`;
  const periodOpts = `
    <option value="">${t('goal.noPeriod')}</option>
    ${periods.map(p => `<option value="${p.id}" ${g.period_id == p.id ? 'selected' : ''}>
      ${t('tt.schoolYear', { y: displayYear(p.school_year) })} ${periodLabel(p.type)}</option>`).join('')}`;
  return `
    <div class="modal-box">
      <div class="modal-title">${isEdit ? t('goal.editGoal') : t('goal.addGoalTitle')}</div>
      <div class="form-group">
        <label class="form-label">${t('goal.typeLabel')}</label>
        <select id="gm-type" class="form-select" ${isEdit ? 'disabled' : ''}>
          ${['chapter', 'grade', 'text'].map(tp =>
            `<option value="${tp}" ${type === tp ? 'selected' : ''}>${GOAL_ICONS[tp]} ${t('goal.type.' + tp)}</option>`).join('')}
        </select>
        <div id="gm-type-hint" style="font-size:.8rem;color:var(--text2);background:var(--bg3);border-radius:8px;padding:.5rem .7rem;margin-top:.5rem;line-height:1.5;">💡 ${t('goal.typeHint.' + type)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('goal.titleLabel')}</label>
        <input id="gm-title" class="form-input" value="${escHtml(g.title || '')}" placeholder="${t('goal.titlePlaceholder')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('goal.horizonLabel')}</label>
        <select id="gm-horizon" class="form-select">
          ${['short', 'mid', 'long'].map(h =>
            `<option value="${h}" ${(g.horizon || 'short') === h ? 'selected' : ''}>${t('goal.horizon.' + h)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group gm-only-chapter" ${type !== 'chapter' ? 'style="display:none;"' : ''}>
        <label class="form-label">${t('label.subject')}</label>
        <select id="gm-subject-ch" class="form-select">${subjOpts(false)}</select>
      </div>
      <div class="form-group gm-only-chapter" ${type !== 'chapter' ? 'style="display:none;"' : ''}>
        <label class="form-label">${t('goal.targetCount')}</label>
        <input id="gm-target-ch" type="number" class="form-input" min="1" max="1000" value="${type === 'chapter' && g.target_value ? g.target_value : 5}">
      </div>
      <div class="form-group gm-only-grade" ${type !== 'grade' ? 'style="display:none;"' : ''}>
        <label class="form-label">${t('label.subject')}</label>
        <select id="gm-subject-gr" class="form-select">${subjOpts(true)}</select>
      </div>
      <div class="form-group gm-only-grade" ${type !== 'grade' ? 'style="display:none;"' : ''}>
        <label class="form-label">${t('goal.examTypeLabel')}</label>
        <select id="gm-examtype" class="form-select">
          <option value="">${t('goal.anyExamType')}</option>
          ${EXAM_TYPES.map(et => `<option value="${et}" ${g.exam_type === et ? 'selected' : ''}>${t('enum.examType.' + et)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group gm-only-grade" ${type !== 'grade' ? 'style="display:none;"' : ''}>
        <label class="form-label">${t('goal.targetScore')}</label>
        <input id="gm-target-gr" type="number" class="form-input" min="1" max="1000" value="${type === 'grade' && g.target_value ? g.target_value : 90}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('goal.periodLabel')}</label>
        <select id="gm-period" class="form-select">${periodOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('goal.dueDateLabel')}</label>
        <input id="gm-due" type="date" class="form-input" value="${g.due_date || ''}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="gm-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="gm-save">${t('btn.save')}</button>
      </div>
    </div>`;
}

function openGoalModal(el, existing) {
  const modal = el.querySelector('#goal-modal');
  modal.innerHTML = buildGoalModal(existing);
  modal.classList.remove('hidden');

  const typeSel = modal.querySelector('#gm-type');
  const updateVisibility = () => {
    const tp = typeSel.value;
    modal.querySelectorAll('.gm-only-chapter').forEach(d => d.style.display = tp === 'chapter' ? '' : 'none');
    modal.querySelectorAll('.gm-only-grade').forEach(d => d.style.display = tp === 'grade' ? '' : 'none');
    const hint = modal.querySelector('#gm-type-hint');
    if (hint) hint.textContent = '💡 ' + t('goal.typeHint.' + tp);
  };
  typeSel.onchange = updateVisibility;

  modal.querySelector('#gm-cancel').onclick = () => modal.classList.add('hidden');
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
  modal.querySelector('#gm-save').onclick = async () => {
    const tp = typeSel.value;
    const body = {
      title: modal.querySelector('#gm-title').value.trim(),
      goal_type: tp,
      horizon: modal.querySelector('#gm-horizon').value,
      period_id: +modal.querySelector('#gm-period').value || null,
      due_date: modal.querySelector('#gm-due').value || null,
    };
    if (tp === 'chapter') {
      body.subject_id = +modal.querySelector('#gm-subject-ch').value || null;
      body.target_value = +modal.querySelector('#gm-target-ch').value;
    } else if (tp === 'grade') {
      body.subject_id = +modal.querySelector('#gm-subject-gr').value || null;
      body.exam_type = modal.querySelector('#gm-examtype').value || null;
      body.target_value = +modal.querySelector('#gm-target-gr').value;
    }
    try {
      if (existing) await put('/goals/' + existing.id, body);
      else          await post('/goals', body);
    } catch (e) {
      return alert(e.message);
    }
    modal.classList.add('hidden');
    await render(el.closest('#view') || el);
  };
  setTimeout(() => modal.querySelector('#gm-title').focus(), 50);
}

function attachEvents(el) {
  el.querySelector('#gp-year').onchange = async e => {
    selectedYear = +e.target.value;
    await render(el);
  };

  el.querySelectorAll('.gp-save').forEach(btn => {
    btn.onclick = async () => {
      const type = btn.dataset.type;
      const start = el.querySelector(`.gp-start[data-type="${type}"]`).value;
      const end   = el.querySelector(`.gp-end[data-type="${type}"]`).value;
      if (!start || !end) return alert(t('goal.needBothDates'));
      try {
        const r = await post('/periods', { school_year: selectedYear, type, start_date: start, end_date: end });
        if (r.overlap_warning) alert(t('goal.overlapWarn'));
      } catch (e) {
        return alert(e.message);
      }
      await render(el);
    };
  });

  const addBtn = el.querySelector('#goal-add-btn');
  if (addBtn) addBtn.onclick = () => openGoalModal(el, null);

  el.querySelectorAll('.goal-edit-btn').forEach(btn => {
    btn.onclick = () => openGoalModal(el, goals.find(g => g.id === +btn.dataset.id));
  });
  el.querySelectorAll('.goal-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(t('goal.deleteConfirm'))) return;
      await del('/goals/' + btn.dataset.id);
      await render(el);
    };
  });
  el.querySelectorAll('.goal-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      await patch('/goals/' + btn.dataset.id + '/toggle', {});
      await render(el);
    };
  });
}
