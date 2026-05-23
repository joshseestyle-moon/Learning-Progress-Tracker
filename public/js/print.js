import { get, escHtml, fmtDate, today, getUserName } from './api.js';

const TYPE_LABEL = { quiz:'小考', segment:'段考', midterm:'期中考', final:'期末考', mock:'模擬考' };

function getWeekRange() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Mon=0
  const mon = new Date(now); mon.setDate(now.getDate() - dow);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(mon), end: fmt(sun) };
}

export async function render(el) {
  el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>資料載入中…</div>';

  const [exams, scheduled] = await Promise.all([
    get('/exams?upcoming=8'),
    get('/chapters/scheduled'),
  ]);

  const week   = getWeekRange();
  const todayStr = today();
  const userName = getUserName() || '使用者';

  // This week's scheduled items
  const weekPlan = scheduled.filter(s => s.scheduled_date >= week.start && s.scheduled_date <= week.end)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  el.innerHTML = `
    <div class="print-controls no-print">
      <button class="btn btn-ghost btn-sm" onclick="history.back()">← 返回</button>
      <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ 列印 / 儲存 PDF</button>
    </div>

    <div class="print-page">
      <!-- 頁首 -->
      <div class="print-header">
        <h1>學習週計畫</h1>
        <div class="meta">
          ${escHtml(userName)}<br>
          列印日期：${fmtDate(todayStr)}<br>
          本週：${fmtDate(week.start)} – ${fmtDate(week.end)}
        </div>
      </div>

      <!-- 近期考試 -->
      <div class="print-section-title">近期考試</div>
      ${buildExams(exams)}

      <!-- 本週讀書計畫 -->
      <div class="print-section-title">本週讀書計畫</div>
      ${buildWeekPlan(weekPlan, todayStr)}

      <!-- 頁尾 -->
      <div class="print-footer">
        <span>學習管理系統</span>
        <span>${escHtml(userName)}・${todayStr}</span>
      </div>
    </div>`;
}

// ── 考試 ────────────────────────────────────────────────────────
function buildExams(exams) {
  const upcoming = exams.filter(e => !e.is_completed);
  if (!upcoming.length) return '<div style="color:#aaa;font-size:11px;padding:4px;">近期沒有考試</div>';

  return upcoming.map(e => {
    const d       = e.days_left;
    const cls     = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
    const daysStr = d <= 0 ? '今天！' : `${d} 天後`;
    return `
      <div class="print-exam-row">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <span class="print-badge" style="background:${e.subject_color};">${escHtml(e.subject_name)}</span>
          <span class="print-chip">${TYPE_LABEL[e.exam_type]||e.exam_type}</span>
          <span style="font-weight:600;">${escHtml(e.title)}</span>
          <span class="print-days-left ${cls}">${daysStr}</span>
        </div>
        <div style="font-size:10px;color:#666;margin-top:1px;">${fmtDate(e.exam_date)}${e.notes ? '・' + escHtml(e.notes) : ''}</div>
      </div>`;
  }).join('');
}

// ── 本週讀書計畫 ─────────────────────────────────────────────────
function buildWeekPlan(items, todayStr) {
  if (!items.length) return '<div style="color:#aaa;font-size:11px;padding:4px 0;">本週沒有排定的讀書計畫</div>';

  const rows = items.map(s => {
    const typeLabel = s.type === 'preview' ? '預習' : `第${s.seq}次複習`;
    const isDone    = s.is_done;
    return `
      <tr class="${isDone ? 'done' : ''}">
        <td>${fmtDate(s.scheduled_date)}${s.scheduled_date === todayStr ? ' 📌' : ''}</td>
        <td><span class="print-badge" style="background:${s.subject_color};">${escHtml(s.subject_name)}</span></td>
        <td>${escHtml(s.chapter_title)}</td>
        <td style="text-align:center;">${typeLabel}</td>
        <td style="text-align:center;">${isDone ? '✓' : '○'}</td>
        <td style="font-size:10px;color:#777;">${s.notes ? escHtml(s.notes) : ''}</td>
      </tr>`;
  }).join('');

  return `
    <table class="print-plan-table">
      <thead>
        <tr>
          <th style="width:90px;">日期</th>
          <th style="width:70px;">科目</th>
          <th>章節</th>
          <th style="width:70px;text-align:center;">類型</th>
          <th style="width:36px;text-align:center;">完成</th>
          <th>備註</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

