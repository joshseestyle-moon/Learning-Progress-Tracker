import { get, post, put, del, patch, escHtml, fmtDate } from './api.js';

let subjects = [];

export async function render(el) {
  subjects = await get('/subjects');
  await refresh(el);
}

async function refresh(el) {
  const [chapters, timeByChapter] = await Promise.all([
    get('/chapters'),
    get('/studylog/by-chapter'),
  ]);
  const timeMap = {};
  for (const t of timeByChapter) timeMap[t.chapter_id] = t.total_minutes;
  el.innerHTML = buildPage(chapters, timeMap);
  attachEvents(el, chapters);
}

function buildPage(chapters, timeMap = {}) {
  const bySubject = {};
  for (const c of chapters) {
    if (!bySubject[c.subject_id]) bySubject[c.subject_id] = { name: c.subject_name, color: c.subject_color, items: [] };
    bySubject[c.subject_id].items.push(c);
  }

  return `
    <div style="display:flex;justify-content:space-between;margin-bottom:1.25rem;">
      <p class="text-sm text-muted">為每個章節設定預習、複習日期，並追蹤完成狀態。已排定的項目會顯示在行事曆上。</p>
      <button class="btn btn-primary" id="ch-add-btn" style="flex-shrink:0;margin-left:1rem;">+ 新增章節</button>
    </div>
    ${Object.keys(bySubject).length ? Object.entries(bySubject).map(([sid, grp]) => {
      const total   = grp.items.length;
      const prevDone = grp.items.filter(c => c.preview_done).length;
      const revDone  = grp.items.filter(c => c.review_done).length;
      return `
        <div class="accordion-item" style="margin-bottom:.85rem;">
          <div class="accordion-header" onclick="toggleAccordion(this)">
            <div style="display:flex;align-items:center;gap:.75rem;">
              <span style="width:12px;height:12px;border-radius:50%;background:${grp.color};display:inline-block;"></span>
              <span>${escHtml(grp.name)}</span>
              <span class="text-xs text-muted">${total} 章節</span>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;">
              <span class="text-xs" style="color:var(--accent);">預習 ${prevDone}/${total}</span>
              <span class="text-xs" style="color:var(--success);">複習 ${revDone}/${total}</span>
              <span style="color:var(--text3);">▼</span>
            </div>
          </div>
          <div class="accordion-body" style="padding:0;">
            <table style="width:100%;border-collapse:collapse;font-size:.87rem;">
              <thead>
                <tr style="background:var(--bg3);">
                  <th style="padding:.5rem .85rem;text-align:left;color:var(--text2);font-size:.78rem;width:35%;">章節</th>
                  <th style="padding:.5rem .5rem;text-align:center;color:var(--accent);font-size:.78rem;width:22%;">📖 預習</th>
                  <th style="padding:.5rem .5rem;text-align:center;color:var(--success);font-size:.78rem;width:22%;">✏️ 複習</th>
                  <th style="padding:.5rem .5rem;text-align:center;color:var(--warn);font-size:.78rem;width:12%;">⏱ 時間</th>
                  <th style="padding:.5rem .5rem;width:9%;"></th>
                </tr>
              </thead>
              <tbody>
                ${grp.items.map(c => chapterRow(c, timeMap[c.id] || 0)).join('')}
              </tbody>
            </table>
            <div style="padding:.6rem .85rem;border-top:1px solid var(--border);">
              <button class="btn btn-ghost btn-sm inline-add-btn" data-sid="${sid}">+ 新增章節到此科目</button>
            </div>
          </div>
        </div>`;
    }).join('') : '<div class="empty-state"><div class="icon">📖</div><p>請先到「課程資訊」新增科目與章節</p></div>'}
    <div id="ch-modal" class="modal-overlay hidden">${buildModal()}</div>
    <div id="date-modal" class="modal-overlay hidden"></div>`;
}

function chapterRow(c, minutes) {
  return `
    <tr style="border-bottom:1px solid var(--border);" data-ch-id="${c.id}">
      <td style="padding:.55rem .85rem;font-weight:${c.review_done?'400':'600'};${c.review_done?'text-decoration:line-through;color:var(--text3)':''};">
        ${escHtml(c.title)}
      </td>
      <td style="padding:.4rem .5rem;text-align:center;">
        ${progressCell(c.id, 'preview', c.preview_done, c.preview_date)}
      </td>
      <td style="padding:.4rem .5rem;text-align:center;">
        ${progressCell(c.id, 'review', c.review_done, c.review_date)}
      </td>
      <td style="padding:.4rem .5rem;text-align:center;">
        ${minutes > 0
          ? `<span class="text-xs" style="color:var(--warn);font-weight:700;">${minutes >= 60 ? Math.floor(minutes/60)+'h'+(minutes%60?minutes%60+'m':'') : minutes+'m'}</span>`
          : `<span class="text-xs text-muted">—</span>`}
      </td>
      <td style="padding:.4rem .5rem;text-align:right;">
        <button class="btn btn-danger btn-sm ch-del-btn" data-id="${c.id}" style="opacity:.5;">✕</button>
      </td>
    </tr>`;
}

function progressCell(chId, type, isDone, date) {
  const label = type === 'preview' ? '預習' : '複習';
  const color  = type === 'preview' ? 'var(--accent)' : 'var(--success)';
  const doneStyle = isDone
    ? `background:${color};color:#fff;`
    : `border:1.5px dashed ${color};color:${color};background:transparent;`;

  return `
    <div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;">
      <button class="ch-toggle-btn" data-id="${chId}" data-type="${type}"
        style="padding:.2rem .55rem;border-radius:999px;font-size:.75rem;font-weight:700;cursor:pointer;${doneStyle}transition:.1s;">
        ${isDone ? '✓ ' + label : label}
      </button>
      <button class="ch-date-btn text-xs" data-id="${chId}" data-type="${type}" data-date="${date||''}"
        style="color:${date?color:'var(--text3)'};cursor:pointer;background:none;border:none;font-size:.72rem;padding:0;">
        ${date ? fmtDate(date) : '+ 設定日期'}
      </button>
    </div>`;
}

function buildModal(c) {
  c = c || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${c.id ? '編輯章節' : '新增章節'}</div>
      <div class="form-group">
        <label class="form-label">科目</label>
        <select id="ch-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}" ${c.subject_id==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">章節名稱</label>
        <input id="ch-title" class="form-input" value="${escHtml(c.title||'')}" placeholder="例：第一章 緒論">
      </div>
      <div class="form-group">
        <label class="form-label">順序</label>
        <input id="ch-order" type="number" class="form-input" value="${c.sort_order||0}" min="0">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="ch-cancel">取消</button>
        <button class="btn btn-primary" id="ch-save">儲存</button>
      </div>
    </div>`;
}

function buildDateModal(chId, type, currentDate) {
  const label = type === 'preview' ? '預習' : '複習';
  return `
    <div class="modal-box" style="max-width:340px;">
      <div class="modal-title">設定${label}日期</div>
      <div class="form-group">
        <label class="form-label">排定日期</label>
        <input id="dm-date" type="date" class="form-input" value="${currentDate||''}">
      </div>
      <div class="modal-footer">
        ${currentDate ? `<button class="btn btn-ghost btn-sm" id="dm-clear">清除日期</button>` : ''}
        <button class="btn btn-ghost" id="dm-cancel">取消</button>
        <button class="btn btn-primary" id="dm-save">確認</button>
      </div>
    </div>`;
}

function openModal(el, chapter, preSubject) {
  const modal = el.querySelector('#ch-modal');
  modal.innerHTML = buildModal(chapter);
  if (preSubject) modal.querySelector('#ch-subject').value = preSubject;
  modal.classList.remove('hidden');
  modal.querySelector('#ch-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#ch-save').onclick   = () => save(el, chapter);
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
  setTimeout(() => modal.querySelector('#ch-title').focus(), 50);
}

function openDateModal(el, chId, type, currentDate) {
  const modal = el.querySelector('#date-modal');
  modal.innerHTML = buildDateModal(chId, type, currentDate);
  modal.classList.remove('hidden');
  modal.querySelector('#dm-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#dm-save').onclick = async () => {
    const date = modal.querySelector('#dm-date').value || null;
    await patch('/chapters/' + chId + '/progress', { type, scheduled_date: date });
    modal.classList.add('hidden');
    await refresh(el);
  };
  const clearBtn = modal.querySelector('#dm-clear');
  if (clearBtn) clearBtn.onclick = async () => {
    await patch('/chapters/' + chId + '/progress', { type, scheduled_date: '' });
    modal.classList.add('hidden');
    await refresh(el);
  };
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
}

async function save(el, existing) {
  const modal = el.querySelector('#ch-modal');
  const body = {
    subject_id: +modal.querySelector('#ch-subject').value,
    title: modal.querySelector('#ch-title').value.trim(),
    sort_order: +modal.querySelector('#ch-order').value || 0,
  };
  if (!body.title) return alert('請填寫章節名稱');
  if (existing) await put('/chapters/' + existing.id, body);
  else          await post('/chapters', body);
  await refresh(el);
}

function attachEvents(el, chapters) {
  el.querySelector('#ch-add-btn').onclick = () => openModal(el, null, null);

  el.querySelectorAll('.inline-add-btn').forEach(btn => {
    btn.onclick = () => openModal(el, null, btn.dataset.sid);
  });

  // Toggle done
  el.querySelectorAll('.ch-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      await patch('/chapters/' + btn.dataset.id + '/progress', {
        type: btn.dataset.type,
        toggle_done: true,
      });
      await refresh(el);
    };
  });

  // Set date
  el.querySelectorAll('.ch-date-btn').forEach(btn => {
    btn.onclick = () => openDateModal(el, btn.dataset.id, btn.dataset.type, btn.dataset.date);
  });

  // Delete chapter
  el.querySelectorAll('.ch-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('確定刪除此章節？')) return;
      await del('/chapters/' + btn.dataset.id);
      await refresh(el);
    };
  });
}

window.toggleAccordion = function(header) {
  const body  = header.nextElementSibling;
  const arrow = header.querySelector('span:last-child');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  arrow.textContent  = isOpen ? '▶' : '▼';
};
