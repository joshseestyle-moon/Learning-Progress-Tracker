import { get, post, put, del, escHtml, today, getUserId, fmtMonth } from './api.js';
import { t } from './i18n.js';

let subjects = [];
let allChapters = [];
let userGoals = { daily_goal_minutes: 0, weekly_goal_minutes: 0 };
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let timerSubjectId = null;
let timerChapterId = null;

export async function render(el) {
  try {
    [subjects, allChapters] = await Promise.all([get('/subjects'), get('/chapters')]);
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">${t('alert.loadFail', { msg: e.message })}</p></div>`;
    return;
  }
  await refresh(el);
}

async function refresh(el) {
  const [logs, weekly, heatmap, monthly, summary, stats] = await Promise.all([
    get('/studylog'),
    get('/studylog/weekly'),
    get('/studylog/heatmap?days=364'),
    get('/studylog/monthly?months=6'),
    get('/studylog/summary'),
    get('/studylog/dashboard-stats'),
  ]);
  summary.streak = stats.current_streak;
  userGoals = {
    daily_goal_minutes:  stats.daily_goal  || 0,
    weekly_goal_minutes: stats.weekly_goal || 0,
  };
  el.innerHTML = buildPage(logs, weekly, summary);
  attachEvents(el, logs);
  renderChart(el, weekly);
  renderHeatmap(el, heatmap);
  renderMonthly(el, monthly);
}

function chaptersForSubject(subjectId) {
  return allChapters.filter(c => c.subject_id === +subjectId);
}

function chapterSelect(id, subjectId, selected) {
  const chs = chaptersForSubject(subjectId);
  return `<select id="${id}" class="form-select">
    <option value="">${t('sl.noChapter')}</option>
    ${chs.map(c => `<option value="${c.id}" ${selected==c.id?'selected':''}>${escHtml(c.title)}</option>`).join('')}
  </select>`;
}

function fmtHM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}${t('sl.hourUnit')}${m}${t('sl.minUnit')}`;
  if (h) return `${h}${t('sl.hourUnit')}`;
  return `${m}${t('sl.minUnit')}`;
}

function buildPage(logs, weekly, summary) {
  const firstSubjectId = subjects[0]?.id || '';
  return `
    <!-- Goals + overview -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem;">
      <div class="card">
        <div class="card-title">${t('sl.goalSettings')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">${t('sl.dailyGoalMin')}</label>
            <input id="goal-daily" type="number" class="form-input" min="0" max="1440" value="${userGoals.daily_goal_minutes || ''}" placeholder="0">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">${t('sl.weeklyGoalMin')}</label>
            <input id="goal-weekly" type="number" class="form-input" min="0" max="10080" value="${userGoals.weekly_goal_minutes || ''}" placeholder="0">
          </div>
        </div>
        <button class="btn btn-primary w-full" id="goal-save" style="margin-top:.75rem;">${t('sl.saveGoal')}</button>
        <div id="goal-msg" style="font-size:.8rem;color:var(--success);margin-top:.4rem;min-height:1rem;text-align:center;"></div>
      </div>
      <div class="card">
        <div class="card-title">${t('sl.summary')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem 1rem;">
          <div><div style="font-size:1.5rem;font-weight:800;color:var(--accent);">${fmtHM(summary.total_minutes || 0)}</div><div class="text-xs text-muted">${t('sl.totalStudied')}</div></div>
          <div><div style="font-size:1.5rem;font-weight:800;">${summary.active_days || 0} ${t('sl.dayUnit')}</div><div class="text-xs text-muted">${t('sl.activeDays')}</div></div>
          <div><div style="font-size:1.5rem;font-weight:800;">${summary.avg_per_active_day || 0} ${t('sl.minUnit')}</div><div class="text-xs text-muted">${t('sl.avgPerDay')}</div></div>
          <div><div style="font-size:1.5rem;font-weight:800;color:#f97316;">${summary.streak || 0} ${t('sl.dayUnit')}</div><div class="text-xs text-muted">${t('sl.currentStreak')}</div></div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem;">
      <!-- Manual entry -->
      <div class="card">
        <div class="card-title">${t('sl.manualEntry')}</div>
        <div class="form-group">
          <label class="form-label">${t('label.subject')}</label>
          <select id="sl-subject" class="form-select">
            ${subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${t('label.chapterOptional')}</label>
          <div id="sl-chapter-wrap">${chapterSelect('sl-chapter', firstSubjectId, '')}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
          <div class="form-group">
            <label class="form-label">${t('label.date')}</label>
            <input id="sl-date" type="date" class="form-input" value="${today()}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('label.minutes')}</label>
            <input id="sl-minutes" type="number" class="form-input" min="1" placeholder="30">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('label.noteOptional')}</label>
          <input id="sl-note" class="form-input" placeholder="">
        </div>
        <button class="btn btn-primary w-full" id="sl-submit">${t('timeModal.save')}</button>
      </div>

      <!-- Stopwatch -->
      <div class="card" style="text-align:center;">
        <div class="card-title">${t('sl.stopwatch')}</div>
        <div class="form-group">
          <label class="form-label">${t('label.subject')}</label>
          <select id="sw-subject" class="form-select" style="text-align:left;">
            ${subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${t('label.chapterOptional')}</label>
          <div id="sw-chapter-wrap" style="text-align:left;">${chapterSelect('sw-chapter', firstSubjectId, '')}</div>
        </div>
        <div class="stopwatch-display" id="sw-display">00:00:00</div>
        <div style="display:flex;gap:.75rem;justify-content:center;">
          <button class="btn btn-primary" id="sw-toggle">${t('sw.start')}</button>
          <button class="btn btn-ghost" id="sw-reset">${t('sw.reset')}</button>
          <button class="btn btn-ghost" id="sw-save" disabled>${t('sw.saveLog')}</button>
        </div>
        <div id="sw-msg" style="font-size:.8rem;color:var(--text2);margin-top:.5rem;"></div>
      </div>
    </div>

    <!-- Chart -->
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('sl.weeklyChart')}</div>
      <canvas id="study-chart" height="120"></canvas>
    </div>

    <!-- Heatmap -->
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('sl.heatmap')}</div>
      <div id="study-heatmap" style="overflow-x:auto;"></div>
    </div>

    <!-- Monthly trend -->
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${t('sl.monthlyTrend')}</div>
      <canvas id="monthly-chart" height="120"></canvas>
    </div>

    <!-- Log table -->
    <div class="card">
      <div class="card-title">${t('sl.logList')}</div>
      <table class="data-table">
        <thead><tr>
          <th>${t('th.date')}</th>
          <th>${t('th.subject')}</th>
          <th>${t('th.chapter')}</th>
          <th>${t('th.minutes')}</th>
          <th>${t('th.notes')}</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${logs.length ? logs.map(l => `
            <tr>
              <td>${l.log_date}</td>
              <td><span class="badge" style="background:${l.subject_color}">${escHtml(l.subject_name)}</span></td>
              <td class="text-sm text-muted">${l.chapter_title ? escHtml(l.chapter_title) : '—'}</td>
              <td>${l.minutes}</td>
              <td class="text-sm text-muted">${escHtml(l.note||'')}</td>
              <td><button class="btn btn-danger btn-sm sl-del-btn" data-id="${l.id}">✕</button></td>
            </tr>`).join('') :
            `<tr><td colspan="6" style="text-align:center;color:var(--text2);">${t('sl.noLogs')}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function renderChart(el, weekly) {
  const canvas = el.querySelector('#study-chart');
  if (!canvas || !window.Chart) return;

  const labels = [];
  const dateMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    labels.push(ds.slice(5));
    dateMap[ds] = {};
  }

  const subjectColors = {};
  for (const row of weekly) {
    subjectColors[row.subject_name] = row.subject_color;
    if (dateMap[row.log_date]) dateMap[row.log_date][row.subject_name] = row.total_minutes;
  }

  const subjectNames = Object.keys(subjectColors);
  const datasets = subjectNames.map(name => ({
    label: name,
    data: labels.map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return dateMap[d.toISOString().slice(0,10)]?.[name] || 0;
    }),
    backgroundColor: subjectColors[name] + 'cc',
    borderColor: subjectColors[name],
    borderWidth: 1,
  }));

  new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    }
  });
}

const HEAT_COLORS = ['var(--bg3)', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
function heatLevel(min) {
  if (!min) return 0;
  if (min <= 30) return 1;
  if (min <= 60) return 2;
  if (min <= 120) return 3;
  return 4;
}
function _dkey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderHeatmap(el, rows) {
  const container = el.querySelector('#study-heatmap');
  if (!container) return;
  const map = {};
  for (const r of rows) map[r.log_date] = r.minutes;

  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - 363);
  // Align start to Monday (getDay 0=Sun..6=Sat; week starts Monday here)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const cols = [];
  const cur = new Date(start);
  while (cur <= end) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      if (cur <= end) {
        const ds = _dkey(cur);
        week.push({ ds, min: map[ds] || 0 });
      } else {
        week.push(null);
      }
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(week);
  }

  const colHtml = cols.map(week => `
    <div style="display:flex;flex-direction:column;gap:3px;">
      ${week.map(c => c
        ? `<div title="${t('sl.heatmapCell', { date: c.ds, min: c.min })}"
               style="width:11px;height:11px;border-radius:2px;background:${HEAT_COLORS[heatLevel(c.min)]};"></div>`
        : `<div style="width:11px;height:11px;"></div>`).join('')}
    </div>`).join('');

  const legend = `
    <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;margin-top:.5rem;font-size:.7rem;color:var(--text3);">
      <span>${t('sl.heatmapLess')}</span>
      ${HEAT_COLORS.map(c => `<div style="width:11px;height:11px;border-radius:2px;background:${c};"></div>`).join('')}
      <span>${t('sl.heatmapMore')}</span>
    </div>`;

  container.innerHTML = `<div style="display:flex;gap:3px;min-width:max-content;">${colHtml}</div>${legend}`;
}

function renderMonthly(el, rows) {
  const canvas = el.querySelector('#monthly-chart');
  if (!canvas || !window.Chart) return;
  if (!rows.length) {
    canvas.replaceWith(Object.assign(document.createElement('div'), {
      className: 'text-muted text-sm', textContent: t('sl.noData'),
    }));
    return;
  }
  const months = [...new Set(rows.map(r => r.month))].sort();
  const subjectColors = {};
  const byKey = {};
  for (const r of rows) {
    subjectColors[r.subject_name] = r.subject_color;
    byKey[r.month + '|' + r.subject_name] = r.total_minutes;
  }
  const datasets = Object.keys(subjectColors).map(name => ({
    label: name,
    data: months.map(m => byKey[m + '|' + name] || 0),
    backgroundColor: subjectColors[name] + 'cc',
    borderColor: subjectColors[name],
    borderWidth: 1,
  }));
  new window.Chart(canvas, {
    type: 'bar',
    data: { labels: months.map(m => fmtMonth(m)), datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });
}

function updateDisplay() {
  const h = Math.floor(timerSeconds / 3600).toString().padStart(2,'0');
  const m = Math.floor((timerSeconds % 3600) / 60).toString().padStart(2,'0');
  const s = (timerSeconds % 60).toString().padStart(2,'0');
  return `${h}:${m}:${s}`;
}

function attachEvents(el, logs) {
  // Study goals
  const goalSave = el.querySelector('#goal-save');
  if (goalSave) {
    goalSave.onclick = async () => {
      const daily  = Math.max(0, parseInt(el.querySelector('#goal-daily').value) || 0);
      const weekly = Math.max(0, parseInt(el.querySelector('#goal-weekly').value) || 0);
      try {
        await put('/users/' + getUserId(), { daily_goal_minutes: daily, weekly_goal_minutes: weekly });
        userGoals = { daily_goal_minutes: daily, weekly_goal_minutes: weekly };
        const msg = el.querySelector('#goal-msg');
        msg.textContent = t('sl.goalSaved');
        setTimeout(() => { msg.textContent = ''; }, 2000);
      } catch (e) {
        alert(t('alert.saveFailed', { msg: e.message }));
      }
    };
  }

  el.querySelector('#sl-subject').onchange = (e) => {
    el.querySelector('#sl-chapter-wrap').innerHTML = chapterSelect('sl-chapter', e.target.value, '');
  };
  el.querySelector('#sw-subject').onchange = (e) => {
    el.querySelector('#sw-chapter-wrap').innerHTML = chapterSelect('sw-chapter', e.target.value, '');
  };

  // Manual entry
  el.querySelector('#sl-submit').onclick = async () => {
    const body = {
      subject_id: +el.querySelector('#sl-subject').value,
      chapter_id: +el.querySelector('#sl-chapter').value || null,
      log_date:   el.querySelector('#sl-date').value,
      minutes:    +el.querySelector('#sl-minutes').value,
      note:       el.querySelector('#sl-note').value.trim() || null,
    };
    if (!body.minutes || body.minutes < 1) return alert(t('alert.enterMinutes'));
    await post('/studylog', body);
    await refresh(el);
  };

  // Stopwatch
  const display   = el.querySelector('#sw-display');
  const toggleBtn = el.querySelector('#sw-toggle');
  const resetBtn  = el.querySelector('#sw-reset');
  const saveBtn   = el.querySelector('#sw-save');
  const msg       = el.querySelector('#sw-msg');

  toggleBtn.onclick = () => {
    timerRunning = !timerRunning;
    timerSubjectId = +el.querySelector('#sw-subject').value;
    timerChapterId = +el.querySelector('#sw-chapter').value || null;
    if (timerRunning) {
      toggleBtn.textContent = t('sw.pause');
      timerInterval = setInterval(() => {
        timerSeconds++;
        display.textContent = updateDisplay();
        saveBtn.disabled = timerSeconds < 60;
      }, 1000);
    } else {
      clearInterval(timerInterval);
      toggleBtn.textContent = t('sw.resume');
    }
  };

  resetBtn.onclick = () => {
    clearInterval(timerInterval);
    timerRunning = false; timerSeconds = 0;
    toggleBtn.textContent = t('sw.start');
    display.textContent = '00:00:00';
    saveBtn.disabled = true;
    msg.textContent = '';
  };

  saveBtn.onclick = async () => {
    const minutes = Math.floor(timerSeconds / 60);
    if (minutes < 1) return;
    await post('/studylog', {
      subject_id: timerSubjectId || +el.querySelector('#sw-subject').value,
      chapter_id: timerChapterId || +el.querySelector('#sw-chapter').value || null,
      log_date: today(),
      minutes,
    });
    msg.textContent = t('sl.saved', { minutes });
    clearInterval(timerInterval);
    timerRunning = false; timerSeconds = 0;
    toggleBtn.textContent = t('sw.start');
    display.textContent = '00:00:00';
    saveBtn.disabled = true;
    await refresh(el);
  };

  // Delete
  el.querySelectorAll('.sl-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(t('confirm.delete'))) return;
      await del('/studylog/' + btn.dataset.id);
      await refresh(el);
    };
  });
}
