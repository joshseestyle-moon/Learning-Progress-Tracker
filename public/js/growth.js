// 成長軌跡 page — level card, learning flywheel, cumulative growth line,
// weekly XP bars, and period-vs-period comparison. Single data round trip
// via /api/gamify/growth-summary; period summaries fetched on selection.
import { get } from './api.js';
import { t } from './i18n.js';
import { levelCard } from './gamify-ui.js';
import { periodLabel } from './period-filter.js';

export async function render(el) {
  const data = await get('/gamify/growth-summary');
  el.innerHTML = `
    <div class="dashboard-grid">
      <div class="card">
        <div class="card-title">${t('card.level')}</div>
        ${levelCard(data.status)}
      </div>

      <div class="card">
        <div class="card-title">${t('flywheel.title')}</div>
        ${flywheelWidget(data.flywheel)}
      </div>

      <div class="card" style="grid-column:1/-1;">
        <div class="card-title">📈 ${t('growth.cumulative')}</div>
        ${data.cumulative.length >= 2
          ? '<canvas id="growth-cum-chart" height="80"></canvas>'
          : `<div class="text-muted text-sm">${t('growth.noData')}</div>`}
      </div>

      <div class="card">
        <div class="card-title">⚡ ${t('growth.weeklyXp')}</div>
        ${data.weekly_xp.length
          ? '<canvas id="growth-xp-chart"></canvas>'
          : `<div class="text-muted text-sm">${t('growth.noData')}</div>`}
      </div>

      <div class="card">
        <div class="card-title">🔭 ${t('growth.periodCompare')}</div>
        ${periodCompareShell(data.periods)}
      </div>
    </div>`;

  if (data.cumulative.length >= 2) renderCumChart(el, data.cumulative);
  if (data.weekly_xp.length) renderXpChart(el, data.weekly_xp);
  wirePeriodSelect(el, data.periods);
}

function flywheelWidget(f) {
  const node = (key, emoji, active, pos) => `
    <div style="position:absolute;${pos}display:flex;flex-direction:column;align-items:center;gap:.15rem;">
      <div style="width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                  font-size:1.4rem;border:3px solid ${active ? 'var(--success)' : '#f59e0b'};
                  background:${active ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)'};">${emoji}</div>
      <span style="font-size:.72rem;font-weight:700;color:${active ? 'var(--success)' : '#f59e0b'};">${t('flywheel.node.' + key)}</span>
    </div>`;
  return `
    <div style="position:relative;width:212px;height:212px;margin:.3rem auto 0;">
      ${node('goal',   '🎯', f.goal,   'top:0;left:50%;transform:translateX(-50%);')}
      ${node('study',  '📖', f.study,  'top:50%;right:0;transform:translateY(-50%);')}
      ${node('reward', '🎁', f.reward, 'bottom:0;left:50%;transform:translateX(-50%);')}
      ${node('review', '🔁', f.review, 'top:50%;left:0;transform:translateY(-50%);')}
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.2rem;opacity:.3;">↻</div>
    </div>
    <div style="text-align:center;font-size:.82rem;color:var(--text2);margin-top:.7rem;">💡 ${t('flywheel.hint.' + f.hint)}</div>`;
}

function renderCumChart(el, rows) {
  const canvas = el.querySelector('#growth-cum-chart');
  if (!canvas || !window.Chart) return;
  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(r => r.date.slice(5)),
      datasets: [
        { label: t('growth.cumMinutes'), data: rows.map(r => r.cum_minutes),
          borderColor: '#6366f1', backgroundColor: '#6366f126', fill: true,
          pointRadius: 0, tension: .25, yAxisID: 'y' },
        { label: t('growth.cumChapters'), data: rows.map(r => r.cum_chapters),
          borderColor: '#22c55e', backgroundColor: 'transparent',
          pointRadius: 0, tension: .25, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y:  { beginAtZero: true },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
      },
    },
  });
}

function renderXpChart(el, rows) {
  const canvas = el.querySelector('#growth-xp-chart');
  if (!canvas || !window.Chart) return;
  new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.week_start.slice(5)),
      datasets: [{ label: 'XP', data: rows.map(r => r.xp), backgroundColor: '#fbbf24cc', borderColor: '#f59e0b', borderWidth: 1 }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

// ── Period comparison ──

const METRICS = [
  ['total_minutes',  'growth.m.minutes'],
  ['active_days',    'growth.m.activeDays'],
  ['chapters_done',  'growth.m.chapters'],
  ['tasks_done',     'growth.m.tasks'],
  ['goals_achieved', 'growth.m.goals'],
  ['xp_earned',      'growth.m.xp'],
];


function periodCompareShell(periods) {
  if (!periods.length) {
    return `<div class="text-muted text-sm">${t('growth.noPeriods')}
      <a style="color:var(--accent);cursor:pointer;" onclick="navigate('goals')">${t('dash.goToSetGoals')}</a></div>`;
  }
  const opts = periods.map(p => `<option value="${p.id}">${periodLabel(p)}</option>`).join('');
  return `
    <select id="growth-period-select" class="form-input" style="margin-bottom:.7rem;">${opts}</select>
    <div id="growth-period-compare" class="text-muted text-sm">…</div>`;
}

function wirePeriodSelect(el, periods) {
  const sel = el.querySelector('#growth-period-select');
  if (!sel) return;
  const load = async () => {
    const box = el.querySelector('#growth-period-compare');
    try {
      const r = await get(`/periods/${sel.value}/summary`);
      box.className = '';
      box.innerHTML = renderCompare(r);
    } catch (e) {
      box.textContent = e.message;
    }
  };
  sel.addEventListener('change', load);
  load();
}

function renderCompare(r) {
  const cur = r.summary;
  const prev = r.previous ? r.previous.summary : null;
  const bar = (v, max, color) => `
    <div style="height:8px;border-radius:4px;background:var(--bg3,rgba(128,128,128,.2));overflow:hidden;">
      <div style="width:${Math.round(v / max * 100)}%;height:100%;background:${color};border-radius:4px;"></div>
    </div>`;
  const rows = METRICS.map(([k, key]) => {
    const c = cur[k] || 0;
    const p = prev ? (prev[k] || 0) : null;
    const max = Math.max(c, p || 0, 1);
    return `
      <div style="margin-bottom:.55rem;">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.15rem;">
          <span style="color:var(--text2);">${t(key)}</span>
          <span style="font-weight:700;">${c}${p != null ? ` <span style="color:var(--text3);font-weight:400;">/ ${p}</span>` : ''}</span>
        </div>
        ${bar(c, max, 'var(--accent)')}
        ${p != null ? `<div style="margin-top:2px;">${bar(p, max, 'var(--text3)')}</div>` : ''}
      </div>`;
  }).join('');
  const legend = prev
    ? `<div style="font-size:.7rem;color:var(--text3);margin-top:.4rem;">
         <span style="color:var(--accent);">■</span> ${t('growth.thisPeriod')}
         <span>■</span> ${t('growth.prevPeriod')}（${periodLabel(r.previous.period)}）</div>`
    : `<div style="font-size:.7rem;color:var(--text3);margin-top:.4rem;">${t('growth.noPrev')}</div>`;
  return rows + legend;
}
