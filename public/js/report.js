import { get, escHtml, fmtDate, today, getUserName } from './api.js';
import { t } from './i18n.js';

const GOAL_ICONS = { chapter: '📖', grade: '🏆', text: '✏️' };

let _periods = [];
let _mode = 'year';

function currentSchoolYear() {
  const d = new Date();
  const y = d.getFullYear();
  return (d.getMonth() + 1 >= 8 ? y : y - 1) - 1911; // 民國 school year
}

function schoolYears() {
  const set = new Set(_periods.map(p => p.school_year));
  const cur = currentSchoolYear();
  set.add(cur); set.add(cur - 1);
  return [...set].sort((a, b) => b - a);
}

function rangeForYear(sy) {
  const inYear = _periods.filter(p => p.school_year === sy);
  if (inYear.length) {
    return {
      from: inYear.reduce((a, p) => p.start_date < a ? p.start_date : a, inYear[0].start_date),
      to:   inYear.reduce((a, p) => p.end_date   > a ? p.end_date   : a, inYear[0].end_date),
    };
  }
  return { from: `${sy + 1911}-08-01`, to: `${sy + 1912}-07-31` };
}

function fmtMinutes(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? t('report.hours', { h, m }) : `${m} ${t('dash.minUnit')}`;
}

export async function render(el) {
  document.body.classList.add('report-print');
  el.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t('app.loading')}</div>`;
  _periods = await get('/periods');

  el.innerHTML = `
    <div class="print-controls no-print" style="flex-wrap:wrap;gap:.6rem;align-items:center;">
      <div id="report-modes" style="display:flex;gap:.4rem;">
        ${modeChip('year')}${modeChip('period')}${modeChip('custom')}
      </div>
      <div id="report-selector" style="display:flex;gap:.4rem;align-items:center;"></div>
      <button class="btn btn-primary btn-sm" id="report-gen">${t('report.generate')}</button>
      <button class="btn btn-ghost btn-sm" id="report-print" disabled>${t('report.print')}</button>
    </div>
    <div id="report-body"></div>`;

  renderSelector(el);
  el.querySelector('#report-modes').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-mode]');
    if (!chip) return;
    _mode = chip.dataset.mode;
    el.querySelectorAll('#report-modes [data-mode]').forEach(c =>
      c.classList.toggle('btn-primary', c.dataset.mode === _mode));
    el.querySelectorAll('#report-modes [data-mode]').forEach(c =>
      c.classList.toggle('btn-ghost', c.dataset.mode !== _mode));
    renderSelector(el);
  });
  el.querySelector('#report-gen').addEventListener('click', () => generate(el));
  el.querySelector('#report-print').addEventListener('click', () => window.print());
}

function modeChip(mode) {
  const cls = mode === _mode ? 'btn-primary' : 'btn-ghost';
  return `<button class="btn ${cls} btn-sm" data-mode="${mode}">${t('report.mode' + mode[0].toUpperCase() + mode.slice(1))}</button>`;
}

function renderSelector(el) {
  const slot = el.querySelector('#report-selector');
  if (_mode === 'year') {
    slot.innerHTML = `<select class="form-input" id="rsel-year" style="width:auto;">
      ${schoolYears().map(sy => `<option value="${sy}">${sy}（${sy + 1911}–${sy + 1912}）</option>`).join('')}
    </select>`;
  } else if (_mode === 'period') {
    if (!_periods.length) {
      slot.innerHTML = `<span class="text-muted text-sm">${t('growth.noPeriods')}</span>`;
    } else {
      slot.innerHTML = `<select class="form-input" id="rsel-period" style="width:auto;">
        ${_periods.map(p => `<option value="${p.id}">${p.school_year} ${t('enum.periodType.' + p.type)}</option>`).join('')}
      </select>`;
    }
  } else {
    const t0 = today();
    slot.innerHTML = `
      <input type="date" class="form-input" id="rsel-from" value="${t0}" style="width:auto;">
      <span>~</span>
      <input type="date" class="form-input" id="rsel-to" value="${t0}" style="width:auto;">`;
  }
}

function pickRange(el) {
  if (_mode === 'year') {
    return rangeForYear(+el.querySelector('#rsel-year').value);
  }
  if (_mode === 'period') {
    const sel = el.querySelector('#rsel-period');
    if (!sel) return null;
    const p = _periods.find(x => x.id === +sel.value);
    return p ? { from: p.start_date, to: p.end_date } : null;
  }
  const from = el.querySelector('#rsel-from').value;
  const to = el.querySelector('#rsel-to').value;
  if (!from || !to) return null;
  return { from, to };
}

async function generate(el) {
  const range = pickRange(el);
  const body = el.querySelector('#report-body');
  if (!range) { body.innerHTML = ''; return; }
  body.innerHTML = `<div class="empty-state"><div class="icon">⏳</div>${t('app.loading')}</div>`;
  let data;
  try {
    data = await get(`/report/summary?from=${range.from}&to=${range.to}`);
  } catch (e) {
    body.innerHTML = `<div class="card"><p style="color:var(--danger)">${escHtml(e.message)}</p></div>`;
    return;
  }
  body.innerHTML = renderReport(data);
  el.querySelector('#report-print').disabled = false;
}

function renderReport(d) {
  const o = d.overview;
  const isEmpty = o.total_minutes === 0 && o.chapters_done === 0 && o.tasks_done === 0
    && o.goals_achieved === 0 && o.badges_earned === 0 && d.grades.length === 0;
  const userName = getUserName() || t('report.student');
  const header = `
    <div class="print-header">
      <h1>📜 ${t('report.title')}</h1>
      <div class="meta">
        ${t('report.student')}：${escHtml(userName)}<br>
        ${fmtDate(d.range.from)} ~ ${fmtDate(d.range.to)}<br>
        ${t('report.generatedAt')}：${fmtDate(today())}
      </div>
    </div>`;

  if (isEmpty) {
    return `<div class="print-page portrait">${header}
      <div class="report-empty" style="text-align:center;padding:40px 0;font-size:13px;">${t('report.empty.range')}</div>
    </div>`;
  }

  return `<div class="print-page portrait">
    ${header}
    ${sectionOverview(d)}
    ${sectionSubjects(d.subjects)}
    ${sectionMonthly(d.monthly)}
    ${sectionGrades(d.grades)}
    ${sectionGoals(d.goals)}
    ${sectionBadges(d.badges)}
    <div class="report-sign">${t('report.signature')}：______________________</div>
    <div class="print-footer" style="margin-top:10px;"><span>${t('report.footer')}</span><span>${fmtDate(today())}</span></div>
  </div>`;
}

function tile(num, lbl) {
  return `<div class="report-tile"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
}

function sectionOverview(d) {
  const o = d.overview;
  const lv = d.level;
  return `<div class="report-section">
    <div class="print-section-title">${t('report.sec.overview')}</div>
    <div class="report-tiles">
      ${tile(fmtMinutes(o.total_minutes), t('report.m.totalHours'))}
      ${tile(o.active_days, t('report.m.activeDays'))}
      ${tile(o.chapters_done, t('report.m.chapters'))}
      ${tile(o.tasks_done, t('report.m.tasks'))}
      ${tile(o.goals_achieved, t('report.m.goals'))}
      ${tile(o.xp_earned, t('report.m.xp'))}
      ${tile(o.badges_earned, t('report.m.badges'))}
      ${tile(t('report.days', { n: o.max_streak }), t('report.m.maxStreak'))}
    </div>
    <div class="report-level">⭐ Lv.${lv.level} ${t(lv.title_key)}（${lv.total_xp} XP）</div>
  </div>`;
}

function bar(pct, color) {
  return `<div class="report-bartrack"><div class="report-bar" style="width:${pct}%;background:${color};"></div></div>`;
}

function sectionSubjects(subjects) {
  let inner;
  if (!subjects.length) {
    inner = `<div class="report-empty">${t('report.empty.section')}</div>`;
  } else {
    const max = Math.max(...subjects.map(s => s.minutes), 1);
    inner = subjects.map(s => `
      <div class="report-row">
        <span class="rlabel"><span style="width:9px;height:9px;border-radius:2px;background:${s.color};display:inline-block;"></span>${escHtml(s.name)}</span>
        ${bar(Math.round(s.minutes / max * 100), s.color)}
        <span class="rval">${fmtMinutes(s.minutes)}</span>
      </div>`).join('');
  }
  return `<div class="report-section"><div class="print-section-title">${t('report.sec.subjects')}</div>${inner}</div>`;
}

function sectionMonthly(monthly) {
  let inner;
  if (!monthly.length) {
    inner = `<div class="report-empty">${t('report.empty.section')}</div>`;
  } else {
    const max = Math.max(...monthly.map(m => m.minutes), 1);
    inner = monthly.map(m => `
      <div class="report-row">
        <span class="rlabel">${m.ym}</span>
        ${bar(Math.round(m.minutes / max * 100), '#6366f1')}
        <span class="rval">${fmtMinutes(m.minutes)}</span>
      </div>`).join('');
  }
  return `<div class="report-section"><div class="print-section-title">${t('report.sec.monthly')}</div>${inner}</div>`;
}

function trendCell(first, last) {
  const diff = last - first;
  if (diff > 2) return `<span style="color:#16a34a;">${t('report.trend.up')}</span>`;
  if (diff < -2) return `<span style="color:#ea580c;">${t('report.trend.down')}</span>`;
  return `<span style="color:#888;">${t('report.trend.flat')}</span>`;
}

function sectionGrades(grades) {
  let inner;
  if (!grades.length) {
    inner = `<div class="report-empty">${t('report.empty.section')}</div>`;
  } else {
    inner = `<table class="report-grade-table">
      <thead><tr>
        <th class="subj" style="text-align:left;">${t('th.subject')}</th>
        <th>${t('report.grades.count')}</th><th>${t('report.grades.avg')}</th>
        <th>${t('report.grades.best')}</th><th>${t('report.grades.trend')}</th>
      </tr></thead>
      <tbody>${grades.map(g => `
        <tr>
          <td class="subj"><span style="width:9px;height:9px;border-radius:2px;background:${g.color};display:inline-block;margin-right:4px;"></span>${escHtml(g.name)}</td>
          <td>${g.count}</td><td>${g.avg_pct}%</td><td>${g.best_pct}%</td><td>${trendCell(g.first_pct, g.last_pct)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  }
  return `<div class="report-section"><div class="print-section-title">${t('report.sec.grades')}</div>${inner}</div>`;
}

function sectionGoals(goals) {
  let inner;
  if (!goals.length) {
    inner = `<div class="report-empty">${t('report.empty.section')}</div>`;
  } else {
    inner = goals.map(g => `
      <div class="report-goal-row">
        <span>${GOAL_ICONS[g.goal_type] || '🎯'}</span>
        <span style="flex:1;">${escHtml(g.title)}</span>
        <span style="color:#888;">${t('goal.horizon.' + g.horizon)}</span>
        <span style="color:#888;">${fmtDate(g.done_date)}</span>
      </div>`).join('');
  }
  return `<div class="report-section"><div class="print-section-title">${t('report.sec.goals')}</div>${inner}</div>`;
}

function sectionBadges(badges) {
  let inner;
  if (!badges.length) {
    inner = `<div class="report-empty">${t('report.empty.section')}</div>`;
  } else {
    inner = `<div class="report-badges">${badges.map(b => `
      <div class="report-badge-item">
        <span class="bi">${b.icon}</span>
        <span class="bn">${escHtml(b.name)}</span>
        <span class="bd">${b.earned_date.slice(5)}</span>
      </div>`).join('')}</div>`;
  }
  return `<div class="report-section"><div class="print-section-title">${t('report.sec.badges')}</div>${inner}</div>`;
}
