import { get, post, del, escHtml, today } from './api.js';

let subjects = [];
let allChapters = [];
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let timerSubjectId = null;
let timerChapterId = null;

export async function render(el) {
  [subjects, allChapters] = await Promise.all([get('/subjects'), get('/chapters')]);
  await refresh(el);
}

async function refresh(el) {
  const logs   = await get('/studylog');
  const weekly = await get('/studylog/weekly');
  el.innerHTML = buildPage(logs, weekly);
  attachEvents(el, logs);
  renderChart(el, weekly);
}

function chaptersForSubject(subjectId) {
  return allChapters.filter(c => c.subject_id === +subjectId);
}

function chapterSelect(id, subjectId, selected) {
  const chs = chaptersForSubject(subjectId);
  return `<select id="${id}" class="form-select">
    <option value="">— 不指定章節 —</option>
    ${chs.map(c => `<option value="${c.id}" ${selected==c.id?'selected':''}>${escHtml(c.title)}</option>`).join('')}
  </select>`;
}

function buildPage(logs, weekly) {
  const firstSubjectId = subjects[0]?.id || '';
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem;">
      <!-- Manual entry -->
      <div class="card">
        <div class="card-title">📝 手動記錄</div>
        <div class="form-group">
          <label class="form-label">科目</label>
          <select id="sl-subject" class="form-select">
            ${subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">章節（選填）</label>
          <div id="sl-chapter-wrap">${chapterSelect('sl-chapter', firstSubjectId, '')}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
          <div class="form-group">
            <label class="form-label">日期</label>
            <input id="sl-date" type="date" class="form-input" value="${today()}">
          </div>
          <div class="form-group">
            <label class="form-label">分鐘數</label>
            <input id="sl-minutes" type="number" class="form-input" min="1" placeholder="30">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">備註（選填）</label>
          <input id="sl-note" class="form-input" placeholder="">
        </div>
        <button class="btn btn-primary w-full" id="sl-submit">記錄</button>
      </div>

      <!-- Stopwatch -->
      <div class="card" style="text-align:center;">
        <div class="card-title">⏱️ 碼錶計時</div>
        <div class="form-group">
          <label class="form-label">科目</label>
          <select id="sw-subject" class="form-select" style="text-align:left;">
            ${subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">章節（選填）</label>
          <div id="sw-chapter-wrap" style="text-align:left;">${chapterSelect('sw-chapter', firstSubjectId, '')}</div>
        </div>
        <div class="stopwatch-display" id="sw-display">00:00:00</div>
        <div style="display:flex;gap:.75rem;justify-content:center;">
          <button class="btn btn-primary" id="sw-toggle">▶ 開始</button>
          <button class="btn btn-ghost" id="sw-reset">重置</button>
          <button class="btn btn-ghost" id="sw-save" disabled>存入記錄</button>
        </div>
        <div id="sw-msg" style="font-size:.8rem;color:var(--text2);margin-top:.5rem;"></div>
      </div>
    </div>

    <!-- Chart -->
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">📊 近 7 天讀書時間（分鐘）</div>
      <canvas id="study-chart" height="120"></canvas>
    </div>

    <!-- Log table -->
    <div class="card">
      <div class="card-title">記錄列表</div>
      <table class="data-table">
        <thead><tr><th>日期</th><th>科目</th><th>章節</th><th>分鐘</th><th>備註</th><th></th></tr></thead>
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
            '<tr><td colspan="6" style="text-align:center;color:var(--text2);">尚無記錄</td></tr>'}
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

function updateDisplay() {
  const h = Math.floor(timerSeconds / 3600).toString().padStart(2,'0');
  const m = Math.floor((timerSeconds % 3600) / 60).toString().padStart(2,'0');
  const s = (timerSeconds % 60).toString().padStart(2,'0');
  return `${h}:${m}:${s}`;
}

function attachEvents(el, logs) {
  // Subject change → refresh chapter dropdown
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
    if (!body.minutes || body.minutes < 1) return alert('請輸入分鐘數');
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
      toggleBtn.textContent = '⏸ 暫停';
      timerInterval = setInterval(() => {
        timerSeconds++;
        display.textContent = updateDisplay();
        saveBtn.disabled = timerSeconds < 60;
      }, 1000);
    } else {
      clearInterval(timerInterval);
      toggleBtn.textContent = '▶ 繼續';
    }
  };

  resetBtn.onclick = () => {
    clearInterval(timerInterval);
    timerRunning = false; timerSeconds = 0;
    toggleBtn.textContent = '▶ 開始';
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
    msg.textContent = `已記錄 ${minutes} 分鐘！`;
    clearInterval(timerInterval);
    timerRunning = false; timerSeconds = 0;
    toggleBtn.textContent = '▶ 開始';
    display.textContent = '00:00:00';
    saveBtn.disabled = true;
    await refresh(el);
  };

  // Delete
  el.querySelectorAll('.sl-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('確定刪除？')) return;
      await del('/studylog/' + btn.dataset.id);
      await refresh(el);
    };
  });
}
