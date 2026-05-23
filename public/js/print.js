import { get, escHtml, fmtDate, today } from './api.js';
import { getUserName } from './api.js';

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
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

  const [timetable, exams, scheduled, chapters] = await Promise.all([
    get('/timetable'),
    get('/exams?upcoming=8'),
    get('/chapters/scheduled'),
    get('/chapters'),
  ]);

  const week   = getWeekRange();
  const todayStr = today();
  const userName = getUserName() || '使用者';

  // Progress map by subject
  const progMap = {};
  for (const c of chapters) {
    if (!progMap[c.subject_id]) progMap[c.subject_id] = { total: 0, prevDone: 0, revDone: 0 };
    progMap[c.subject_id].total++;
    if (c.preview_done) progMap[c.subject_id].prevDone++;
    if ((c.reviews || []).some(r => r.is_done)) progMap[c.subject_id].revDone++;
  }

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

      <!-- 上半：課表 + 考試 -->
      <div class="print-top">
        <div>
          <div class="print-section-title">本週課表</div>
          ${buildTimetable(timetable)}
        </div>
        <div>
          <div class="print-section-title">近期考試</div>
          ${buildExams(exams, progMap)}
        </div>
      </div>

      <!-- 本週讀書計畫 -->
      <div class="print-section-title">本週讀書計畫</div>
      ${buildWeekPlan(weekPlan, todayStr)}

      <!-- 讀書進度 -->
      <div class="print-section-title">各科讀書進度</div>
      ${buildProgress(chapters)}

      <!-- 頁尾 -->
      <div class="print-footer">
        <span>學習管理系統</span>
        <span>${escHtml(userName)}・${todayStr}</span>
      </div>
    </div>`;
}

// ── 課表 ────────────────────────────────────────────────────────
function buildTimetable(slots) {
  if (!slots.length) return '<div style="color:#aaa;font-size:11px;padding:4px;">本學期尚無課表資料</div>';

  const usedDays    = [...new Set(slots.map(s => s.day_of_week))].sort();
  const usedPeriods = [...new Set(slots.map(s => s.period))].sort((a, b) => a - b);
  const slotMap     = {};
  for (const s of slots) slotMap[`${s.day_of_week}-${s.period}`] = s;

  const header = usedDays.map(d => `<th>${DAY_NAMES[d]}</th>`).join('');
  const rows = usedPeriods.map(p => {
    const cells = usedDays.map(d => {
      const s = slotMap[`${d}-${p}`];
      if (!s) return `<td class="empty-cell"></td>`;
      return `<td class="subject-cell" style="background:${s.subject_color};">${escHtml(s.subject_name)}</td>`;
    }).join('');
    return `<tr><th>第${p}節</th>${cells}</tr>`;
  }).join('');

  return `
    <table class="print-timetable">
      <thead><tr><th></th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── 考試 ────────────────────────────────────────────────────────
function buildExams(exams, progMap) {
  const upcoming = exams.filter(e => !e.is_completed);
  if (!upcoming.length) return '<div style="color:#aaa;font-size:11px;padding:4px;">近期沒有考試</div>';

  return upcoming.map(e => {
    const d       = e.days_left;
    const cls     = d <= 3 ? 'urgent' : d <= 7 ? 'soon' : 'ok';
    const daysStr = d <= 0 ? '今天！' : `${d} 天後`;
    const prog    = progMap[e.subject_id];
    let progHtml  = '';
    if (prog && prog.total > 0) {
      const pPct = Math.round(prog.prevDone / prog.total * 100);
      const rPct = Math.round(prog.revDone  / prog.total * 100);
      progHtml = `
        <div style="margin-top:3px;">
          <div class="print-prog">
            <span class="print-prog-label" style="color:#4f6ef7;">預習</span>
            <div class="print-prog-bar"><div class="print-prog-fill" style="width:${pPct}%;background:#4f6ef7;"></div></div>
            <span class="print-prog-text">${prog.prevDone}/${prog.total}</span>
          </div>
          <div class="print-prog">
            <span class="print-prog-label" style="color:#22c55e;">複習</span>
            <div class="print-prog-bar"><div class="print-prog-fill" style="width:${rPct}%;background:#22c55e;"></div></div>
            <span class="print-prog-text">${prog.revDone}/${prog.total}</span>
          </div>
        </div>`;
    }
    return `
      <div class="print-exam-row" style="flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span class="print-badge" style="background:${e.subject_color};">${escHtml(e.subject_name)}</span>
            <span class="print-chip">${TYPE_LABEL[e.exam_type]||e.exam_type}</span>
            <span style="font-weight:600;">${escHtml(e.title)}</span>
            <span class="print-days-left ${cls}">${daysStr}</span>
          </div>
          <div style="font-size:10px;color:#666;margin-top:1px;">${fmtDate(e.exam_date)}${e.notes ? '・' + escHtml(e.notes) : ''}</div>
          ${progHtml}
        </div>
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

// ── 讀書進度 ─────────────────────────────────────────────────────
function buildProgress(chapters) {
  if (!chapters.length) return '<div style="color:#aaa;font-size:11px;padding:4px 0;">尚無章節資料</div>';

  const bySubject = {};
  for (const c of chapters) {
    if (!bySubject[c.subject_id]) bySubject[c.subject_id] = { name: c.subject_name, color: c.subject_color, items: [] };
    bySubject[c.subject_id].items.push(c);
  }

  return Object.values(bySubject).map(grp => {
    const rows = grp.items.map(c => {
      const reviews = c.reviews || [];
      const revCells = reviews.length
        ? reviews.map(r => `<span class="${r.is_done ? 'done-mark' : 'todo-mark'}" title="${r.scheduled_date ? fmtDate(r.scheduled_date) : ''}">${r.is_done ? '✓' : '○'}</span>`).join(' ')
        : '<span class="todo-mark">—</span>';
      const previewDate = c.preview_date ? `<br><span style="font-size:9px;color:#888;">${fmtDate(c.preview_date)}</span>` : '';
      return `
        <tr>
          <td class="chapter-name">${escHtml(c.title)}</td>
          <td class="${c.preview_done ? 'done-mark' : 'todo-mark'}" style="text-align:center;">${c.preview_done ? '✓' : '○'}${previewDate}</td>
          <td style="text-align:center;">${revCells}</td>
          <td style="text-align:center;font-size:10px;color:#555;">${c.preview_notes || reviews.find(r => r.notes)?.notes ? '📝' : ''}</td>
        </tr>`;
    }).join('');

    return `
      <table class="print-progress-table">
        <thead>
          <tr class="print-subject-header">
            <td colspan="4">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${grp.color};margin-right:5px;"></span>
              ${escHtml(grp.name)}
            </td>
          </tr>
          <tr>
            <th class="left" style="width:45%;">章節</th>
            <th style="width:18%;">預習</th>
            <th style="width:30%;">複習</th>
            <th style="width:7%;">備</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');
}
