import { get, post, put, del, patch, escHtml, fmtDate } from './api.js';
import { t } from './i18n.js';

let subjects = [];

export async function render(el) {
  try {
    subjects = await get('/subjects');
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">${t('alert.loadFail', { msg: e.message })}</p></div>`;
    return;
  }
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
      <p class="text-sm text-muted">${t('ch.description')}</p>
      <button class="btn btn-primary" id="ch-add-btn" style="flex-shrink:0;margin-left:1rem;">${t('ch.add')}</button>
    </div>
    ${Object.keys(bySubject).length ? Object.entries(bySubject).map(([sid, grp]) => {
      const total    = grp.items.length;
      const prevDone = grp.items.filter(c => c.preview_done).length;
      const revDone  = grp.items.filter(c => (c.reviews || []).some(r => r.is_done)).length;
      return `
        <div class="accordion-item" style="margin-bottom:.85rem;">
          <div class="accordion-header" onclick="toggleAccordion(this)">
            <div style="display:flex;align-items:center;gap:.75rem;">
              <span style="width:12px;height:12px;border-radius:50%;background:${grp.color};display:inline-block;"></span>
              <span>${escHtml(grp.name)}</span>
              <span class="text-xs text-muted">${t('ch.chapterCount', { n: total })}</span>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;">
              <span class="text-xs" style="color:var(--accent);">${t('ch.previewCount', { done: prevDone, total })}</span>
              <span class="text-xs" style="color:var(--success);">${t('ch.reviewCount', { done: revDone, total })}</span>
              <span style="color:var(--text3);">▼</span>
            </div>
          </div>
          <div class="accordion-body" style="padding:0;">
            <table style="width:100%;border-collapse:collapse;font-size:.87rem;">
              <thead>
                <tr style="background:var(--bg3);">
                  <th style="padding:.5rem .85rem;text-align:left;color:var(--text2);font-size:.78rem;width:30%;">${t('th.chapter')}</th>
                  <th style="padding:.5rem .5rem;text-align:center;color:var(--accent);font-size:.78rem;width:20%;">${t('th.preview')}</th>
                  <th style="padding:.5rem .5rem;text-align:left;color:var(--success);font-size:.78rem;width:35%;">${t('th.reviews')}</th>
                  <th style="padding:.5rem .5rem;text-align:center;color:var(--warn);font-size:.78rem;width:9%;">${t('th.time')}</th>
                  <th style="padding:.5rem .5rem;width:6%;"></th>
                </tr>
              </thead>
              <tbody>
                ${grp.items.map(c => chapterRow(c, timeMap[c.id] || 0)).join('')}
              </tbody>
            </table>
            <div style="padding:.6rem .85rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
              <button class="btn btn-ghost btn-sm inline-add-btn" data-sid="${sid}">${t('ch.addToSubject')}</button>
              <button class="btn btn-danger btn-sm del-all-chapters-btn" data-sid="${sid}" data-name="${escHtml(grp.name)}" style="opacity:.6;font-size:.75rem;">${t('ch.deleteAllChapters')}</button>
            </div>
          </div>
        </div>`;
    }).join('') : `<div class="empty-state"><div class="icon">📖</div><p>${t('ch.noSubject')}</p></div>`}
    <div id="ch-modal" class="modal-overlay hidden">${buildModal()}</div>
    <div id="date-modal" class="modal-overlay hidden"></div>`;
}

function chapterRow(c, minutes) {
  const reviews = c.reviews || [];
  const allRevDone = reviews.length > 0 && reviews.every(r => r.is_done);
  return `
    <tr style="border-bottom:1px solid var(--border);vertical-align:top;" data-ch-id="${c.id}">
      <td style="padding:.55rem .85rem;font-weight:${allRevDone?'400':'600'};${allRevDone?'text-decoration:line-through;color:var(--text3)':''};">
        ${escHtml(c.title)}
      </td>
      <td style="padding:.4rem .5rem;text-align:center;">
        ${previewCell(c)}
      </td>
      <td style="padding:.4rem .5rem;">
        ${reviewsCell(c.id, reviews, c.subject_id)}
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

function previewCell(c) {
  const color = 'var(--accent)';
  const doneStyle = c.preview_done
    ? `background:${color};color:#fff;`
    : `border:1.5px dashed ${color};color:${color};background:transparent;`;
  return `
    <div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px;">
      <button class="ch-toggle-btn" data-id="${c.id}" data-type="preview" data-subject-id="${c.subject_id}" data-done="${c.preview_done ? '1' : '0'}"
        style="padding:.2rem .55rem;border-radius:999px;font-size:.75rem;font-weight:700;cursor:pointer;${doneStyle}transition:.1s;">
        ${c.preview_done ? t('ch.previewDone') : t('ch.previewUndone')}
      </button>
      <button class="ch-date-btn text-xs" data-id="${c.id}" data-type="preview"
        data-date="${c.preview_date||''}" data-notes="${escHtml(c.preview_notes||'')}"
        style="color:${c.preview_date?color:'var(--text3)'};cursor:pointer;background:none;border:none;font-size:.72rem;padding:0;">
        ${c.preview_date ? fmtDate(c.preview_date) : t('ch.setDate')}
      </button>
      ${c.preview_notes
        ? `<span class="text-xs" title="${escHtml(c.preview_notes)}"
             style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2);font-size:.68rem;">
             📝 ${escHtml(c.preview_notes)}
           </span>`
        : ''}
    </div>`;
}

function reviewsCell(chId, reviews, subjectId) {
  const color = 'var(--success)';
  return `
    <div style="display:inline-flex;flex-direction:column;align-items:flex-start;gap:5px;">
      ${reviews.map(r => {
        const doneStyle = r.is_done
          ? `background:${color};color:#fff;`
          : `border:1.5px dashed ${color};color:${color};background:transparent;`;
        return `
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          <button class="rev-toggle-btn" data-pid="${r.id}" data-subject-id="${subjectId}" data-ch-id="${chId}" data-done="${r.is_done ? '1' : '0'}"
            style="padding:.15rem .45rem;border-radius:999px;font-size:.73rem;font-weight:700;cursor:pointer;${doneStyle}transition:.1s;white-space:nowrap;">
            ${r.is_done ? t('ch.reviewDone', { seq: r.seq }) : t('ch.reviewUndone', { seq: r.seq })}
          </button>
          <button class="rev-date-btn" data-pid="${r.id}"
            data-date="${r.scheduled_date||''}" data-notes="${escHtml(r.notes||'')}" data-seq="${r.seq}"
            style="color:${r.scheduled_date?color:'var(--text3)'};cursor:pointer;background:none;border:none;font-size:.7rem;padding:0;white-space:nowrap;">
            ${r.scheduled_date ? fmtDate(r.scheduled_date) : t('ch.setRevDate')}
          </button>
          ${r.notes
            ? `<span title="${escHtml(r.notes)}" style="font-size:.68rem;color:var(--text2);cursor:default;">📝</span>`
            : ''}
          <button class="rev-del-btn" data-pid="${r.id}"
            style="width:16px;height:16px;border-radius:50%;background:transparent;border:1px solid var(--text3);
                   color:var(--text3);font-size:.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;
                   padding:0;flex-shrink:0;line-height:1;">✕</button>
        </div>`;
      }).join('')}
      <button class="rev-add-btn" data-ch-id="${chId}"
        style="font-size:.72rem;color:${color};background:none;
               border:1.5px dashed ${color};border-radius:999px;
               padding:.15rem .55rem;cursor:pointer;white-space:nowrap;margin-top:2px;">
        ${t('ch.addReview')}
      </button>
    </div>`;
}

function buildModal(c) {
  c = c || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${c.id ? t('ch.editTitle') : t('ch.addTitle')}</div>
      <div class="form-group">
        <label class="form-label">${t('label.subject')}</label>
        <select id="ch-subject" class="form-select">
          ${subjects.map(s => `<option value="${s.id}" ${c.subject_id==s.id?'selected':''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.chapterName')}</label>
        <input id="ch-title" class="form-input" value="${escHtml(c.title||'')}" placeholder="${t('label.chapterPlaceholder')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.order')}</label>
        <input id="ch-order" type="number" class="form-input" value="${c.sort_order||0}" min="0">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="ch-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="ch-save">${t('btn.save')}</button>
      </div>
    </div>`;
}

function buildDateModal(title, currentDate, currentNotes) {
  return `
    <div class="modal-box" style="max-width:380px;">
      <div class="modal-title">${title}</div>
      <div class="form-group">
        <label class="form-label">${t('label.scheduledDate')}</label>
        <input id="dm-date" type="date" class="form-input" value="${currentDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.notes')}</label>
        <textarea id="dm-notes" class="form-input" rows="3"
          placeholder="${t('label.notesPlaceholder')}"
          style="resize:vertical;">${escHtml(currentNotes||'')}</textarea>
      </div>
      <div class="modal-footer">
        ${currentDate ? `<button class="btn btn-ghost btn-sm" id="dm-clear">${t('btn.clearDate')}</button>` : ''}
        <button class="btn btn-ghost" id="dm-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="dm-save">${t('btn.confirm')}</button>
      </div>
    </div>`;
}

function openDateModal(el, title, currentDate, currentNotes, onSave, onClear) {
  const modal = el.querySelector('#date-modal');
  modal.innerHTML = buildDateModal(title, currentDate, currentNotes);
  modal.classList.remove('hidden');
  modal.querySelector('#dm-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#dm-save').onclick = async () => {
    const date  = modal.querySelector('#dm-date').value || null;
    const notes = modal.querySelector('#dm-notes').value;
    await onSave(date, notes);
    modal.classList.add('hidden');
    await refresh(el);
  };
  const clearBtn = modal.querySelector('#dm-clear');
  if (clearBtn) clearBtn.onclick = async () => {
    const notes = modal.querySelector('#dm-notes').value;
    await onClear(notes);
    modal.classList.add('hidden');
    await refresh(el);
  };
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
  setTimeout(() => modal.querySelector('#dm-notes').focus(), 50);
}

function buildTimeModal() {
  return `
    <div class="modal-box" style="max-width:320px;">
      <div class="modal-title">${t('timeModal.title')}</div>
      <div class="form-group">
        <label class="form-label">${t('timeModal.label')}</label>
        <input id="tm-minutes" type="number" class="form-input" min="1" max="600" placeholder="${t('timeModal.placeholder')}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="tm-skip">${t('timeModal.skip')}</button>
        <button class="btn btn-primary" id="tm-save">${t('timeModal.save')}</button>
      </div>
    </div>`;
}

function openTimeModal(el, onSave, onSkip) {
  const modal = el.querySelector('#date-modal');
  modal.innerHTML = buildTimeModal();
  modal.classList.remove('hidden');
  modal.querySelector('#tm-skip').onclick = async () => { modal.classList.add('hidden'); await onSkip(); };
  modal.querySelector('#tm-save').onclick = async () => {
    const minutes = parseInt(modal.querySelector('#tm-minutes').value) || 0;
    if (minutes < 1) {
      modal.querySelector('#tm-minutes').focus();
      return;
    }
    modal.classList.add('hidden');
    await onSave(minutes);
  };
  modal.onclick = async e => { if (e.target === modal) { modal.classList.add('hidden'); await onSkip(); } };
  setTimeout(() => modal.querySelector('#tm-minutes').focus(), 50);
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

async function save(el, existing) {
  const modal = el.querySelector('#ch-modal');
  const body = {
    subject_id: +modal.querySelector('#ch-subject').value,
    title: modal.querySelector('#ch-title').value.trim(),
    sort_order: +modal.querySelector('#ch-order').value || 0,
  };
  if (!body.title) return alert(t('alert.fillChapterName'));
  if (existing) await put('/chapters/' + existing.id, body);
  else          await post('/chapters', body);
  await refresh(el);
}

function attachEvents(el, chapters) {
  el.querySelector('#ch-add-btn').onclick = () => openModal(el, null, null);

  el.querySelectorAll('.inline-add-btn').forEach(btn => {
    btn.onclick = () => openModal(el, null, btn.dataset.sid);
  });

  // Preview toggle
  el.querySelectorAll('.ch-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const markingDone = btn.dataset.done === '0';
      await patch('/chapters/' + btn.dataset.id + '/progress', { type: 'preview', toggle_done: true });
      if (markingDone) {
        openTimeModal(el,
          async (minutes) => {
            if (minutes > 0) {
              const todayStr = new Date().toISOString().slice(0, 10);
              try { await post('/studylog', { subject_id: +btn.dataset.subjectId, log_date: todayStr, minutes, chapter_id: +btn.dataset.id }); } catch (_) {}
            }
            await refresh(el);
          },
          () => refresh(el)
        );
      } else {
        await refresh(el);
      }
    };
  });

  // Preview date/notes
  el.querySelectorAll('.ch-date-btn').forEach(btn => {
    btn.onclick = () => {
      const chId = btn.dataset.id;
      openDateModal(
        el,
        t('date.preview'),
        btn.dataset.date,
        btn.dataset.notes,
        (date, notes) => patch('/chapters/' + chId + '/progress', { type: 'preview', scheduled_date: date, notes }),
        (notes)       => patch('/chapters/' + chId + '/progress', { type: 'preview', scheduled_date: '', notes })
      );
    };
  });

  // Review toggle
  el.querySelectorAll('.rev-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const markingDone = btn.dataset.done === '0';
      await patch('/chapters/progress/' + btn.dataset.pid, { toggle_done: true });
      if (markingDone) {
        openTimeModal(el,
          async (minutes) => {
            if (minutes > 0) {
              const todayStr = new Date().toISOString().slice(0, 10);
              try { await post('/studylog', { subject_id: +btn.dataset.subjectId, log_date: todayStr, minutes, chapter_id: +btn.dataset.chId }); } catch (_) {}
            }
            await refresh(el);
          },
          () => refresh(el)
        );
      } else {
        await refresh(el);
      }
    };
  });

  // Review date/notes
  el.querySelectorAll('.rev-date-btn').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.pid;
      const seq = btn.dataset.seq;
      openDateModal(
        el,
        t('date.review', { seq }),
        btn.dataset.date,
        btn.dataset.notes,
        (date, notes) => patch('/chapters/progress/' + pid, { scheduled_date: date, notes }),
        (notes)       => patch('/chapters/progress/' + pid, { scheduled_date: '', notes })
      );
    };
  });

  // Delete review session
  el.querySelectorAll('.rev-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(t('confirm.deleteReview'))) return;
      await del('/chapters/progress/' + btn.dataset.pid);
      await refresh(el);
    };
  });

  // Add review session
  el.querySelectorAll('.rev-add-btn').forEach(btn => {
    btn.onclick = async () => {
      try {
        await post('/chapters/' + btn.dataset.chId + '/review', {});
        await refresh(el);
      } catch (e) {
        alert(t('ch.addReviewFail', { msg: e.message }));
      }
    };
  });

  // Delete chapter
  el.querySelectorAll('.ch-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(t('confirm.deleteChapter'))) return;
      await del('/chapters/' + btn.dataset.id);
      await refresh(el);
    };
  });

  // Delete all chapters for a subject
  el.querySelectorAll('.del-all-chapters-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(t('confirm.deleteAllChapters', { name: btn.dataset.name }))) return;
      try {
        await del('/chapters?subject_id=' + btn.dataset.sid);
        await refresh(el);
      } catch (e) {
        alert(t('ch.deleteFail', { msg: e.message }));
      }
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
