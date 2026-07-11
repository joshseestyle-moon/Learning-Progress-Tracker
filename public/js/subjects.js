import { get, post, put, del, patch, escHtml } from './api.js';
import { t } from './i18n.js';

const PRESET_COLORS = [
  '#4f6ef7','#3b82f6','#0ea5e9','#06b6d4',
  '#14b8a6','#10b981','#22c55e','#84cc16',
  '#eab308','#f59e0b','#f97316','#fb923c',
  '#ef4444','#e04040','#f43f5e','#ec4899',
  '#a855f7','#8b5cf6','#6366f1','#7c3aed',
  '#0891b2','#059669','#dc2626','#9333ea',
];

let _el;
let _gen = 0;

export async function render(el) {
  _el = el;
  await refresh();
}

async function refresh() {
  const gen = ++_gen;
  const [subjects, chapters] = await Promise.all([
    get('/subjects'),
    get('/chapters'),
  ]);
  if (gen !== _gen) return; // navigated away, or superseded by a newer refresh() call
  _el.innerHTML = buildPage(subjects, chapters);
  attachEvents(_el, subjects, chapters);
}

function buildPage(subjects, chapters) {
  const bySubject = {};
  for (const c of chapters) {
    (bySubject[c.subject_id] = bySubject[c.subject_id] || []).push(c);
  }

  return `
    <div class="card" style="margin-bottom:1.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <div class="card-title" style="margin:0;">${t('sub.subjectList')}</div>
        <button class="btn btn-primary btn-sm" id="sub-add-btn">${t('sub.add')}</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.5rem;">
        ${subjects.length ? subjects.map(s => `
          <div class="subject-row" data-id="${s.id}" style="
            display:flex;align-items:center;justify-content:space-between;
            padding:.6rem .75rem;border-radius:var(--radius-sm);cursor:pointer;
            border:2px solid transparent;background:var(--bg3);transition:.1s;
          ">
            <div style="display:flex;align-items:center;gap:.6rem;min-width:0;">
              <span style="width:14px;height:14px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
              <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.name)}</span>
              <span class="text-xs text-muted" style="flex-shrink:0;">${t('sub.chapterCount', { n: (bySubject[s.id]||[]).length })}</span>
            </div>
            <div style="display:flex;gap:.4rem;flex-shrink:0;margin-left:.5rem;align-items:center;">
              <button class="sub-cat-btn" data-id="${s.id}" title="${t('sub.catToggleHint')}" style="
                font-size:.72rem;font-weight:600;padding:.15rem .5rem;border-radius:999px;cursor:pointer;
                border:1px solid ${s.category === 'non_exam' ? 'var(--border)' : 'var(--accent)'};
                color:${s.category === 'non_exam' ? 'var(--text3)' : 'var(--accent)'};
                background:transparent;
              ">${s.category === 'non_exam' ? t('enum.subjectCat.non_exam') : t('enum.subjectCat.exam')}</button>
              <button class="btn btn-ghost btn-sm sub-edit-btn" data-id="${s.id}">${t('btn.edit')}</button>
              <button class="btn btn-danger btn-sm sub-del-btn" data-id="${s.id}">✕</button>
            </div>
          </div>`).join('') :
          `<div class="empty-state" style="padding:1.5rem;grid-column:1/-1;"><div class="icon">📚</div><p>${t('sub.noSubjects')}</p></div>`}
      </div>
    </div>

    <!-- 章節管理面板（點選科目後顯示） -->
    <div id="chapter-panel"></div>

    <!-- 科目 modal -->
    <div id="sub-modal" class="modal-overlay hidden">${buildSubjectModal()}</div>
  `;
}

function buildSubjectModal(s) {
  s = s || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${s.id ? t('sub.editSubject') : t('sub.addSubject')}</div>
      <div class="form-group">
        <label class="form-label">${t('label.subjectName')}</label>
        <input id="sm-name" class="form-input" value="${escHtml(s.name||'')}" placeholder="${t('label.subjectPlaceholder')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('label.color')}</label>
        <div style="display:grid;grid-template-columns:repeat(6,32px);gap:.4rem;" id="sm-colors">
          ${PRESET_COLORS.map(c => `
            <div class="sm-color-swatch" data-color="${c}" style="
              width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;
              border:3px solid ${(s.color||PRESET_COLORS[0])===c ? '#fff' : 'transparent'};
              box-shadow:${(s.color||PRESET_COLORS[0])===c ? '0 0 0 2px var(--accent)' : 'none'};
              transition:.1s;
            "></div>`).join('')}
        </div>
        <input id="sm-color-val" type="hidden" value="${s.color||PRESET_COLORS[0]}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="sm-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="sm-save">${t('btn.save')}</button>
      </div>
    </div>`;
}

function buildChapterPanel(subject, chapters) {
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <div>
          <div class="card-title" style="margin:0;display:flex;align-items:center;gap:.5rem;">
            <span style="width:12px;height:12px;border-radius:50%;background:${subject.color};display:inline-block;"></span>
            ${t('sub.chapters', { name: escHtml(subject.name) })}
          </div>
          <div class="text-xs text-muted mt-1">${t('sub.sortHint')}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="ch-add-btn">${t('sub.addChapter')}</button>
      </div>

      <div id="ch-list">
        ${chapters.length ? chapters.map((c, i) => `
          <div class="chapter-row" data-id="${c.id}" style="
            display:flex;align-items:center;gap:.6rem;
            padding:.5rem .6rem;border-radius:var(--radius-sm);
            border:1px solid var(--border);margin-bottom:.4rem;
            background:var(--bg2);
          ">
            <span style="color:var(--text3);font-size:.8rem;min-width:20px;">${i+1}.</span>
            <span style="flex:1;font-size:.9rem;" class="ch-title-text">${escHtml(c.title)}</span>
            <div style="display:flex;gap:.3rem;">
              <button class="btn btn-ghost btn-sm ch-up-btn" data-id="${c.id}" data-idx="${i}" ${i===0?'disabled':''}>↑</button>
              <button class="btn btn-ghost btn-sm ch-dn-btn" data-id="${c.id}" data-idx="${i}" ${i===chapters.length-1?'disabled':''}>↓</button>
              <button class="btn btn-ghost btn-sm ch-rename-btn" data-id="${c.id}" data-title="${escHtml(c.title)}">${t('btn.edit')}</button>
              <button class="btn btn-danger btn-sm ch-del-btn" data-id="${c.id}">✕</button>
            </div>
          </div>`).join('') :
          `<div class="text-muted text-sm">${t('sub.noChapters')}</div>`}
      </div>
    </div>`;
}

function openSubjectModal(el, subject, subjects, chapters) {
  const modal = el.querySelector('#sub-modal');
  modal.innerHTML = buildSubjectModal(subject);
  modal.classList.remove('hidden');

  modal.querySelectorAll('.sm-color-swatch').forEach(swatch => {
    swatch.onclick = () => {
      modal.querySelectorAll('.sm-color-swatch').forEach(s => {
        s.style.border = '3px solid transparent';
        s.style.boxShadow = 'none';
      });
      swatch.style.border = '3px solid #fff';
      swatch.style.boxShadow = '0 0 0 2px var(--accent)';
      modal.querySelector('#sm-color-val').value = swatch.dataset.color;
    };
  });

  modal.querySelector('#sm-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#sm-save').onclick   = () => saveSubject(el, subject);
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
  setTimeout(() => modal.querySelector('#sm-name').focus(), 50);
}

async function saveSubject(el, existing) {
  const modal = el.querySelector('#sub-modal');
  const name  = modal.querySelector('#sm-name').value.trim();
  const color = modal.querySelector('#sm-color-val').value;
  if (!name) return alert(t('alert.enterSubjectName'));
  if (existing) await put('/subjects/' + existing.id, { name, color });
  else          await post('/subjects', { name, color });
  modal.classList.add('hidden');
  await refresh();
}

function attachEvents(el, subjects, chapters) {
  el.querySelector('#sub-add-btn').onclick = () => openSubjectModal(el, null, subjects, chapters);

  el.querySelectorAll('.sub-cat-btn').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const s = subjects.find(x => x.id === +btn.dataset.id);
      await put('/subjects/' + s.id, { category: s.category === 'non_exam' ? 'exam' : 'non_exam' });
      await refresh();
    };
  });

  el.querySelectorAll('.sub-edit-btn').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const s = subjects.find(x => x.id === +btn.dataset.id);
      openSubjectModal(el, s, subjects, chapters);
    };
  });
  el.querySelectorAll('.sub-del-btn').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      if (!confirm(t('confirm.deleteSubject'))) return;
      await del('/subjects/' + btn.dataset.id);
      await refresh();
    };
  });

  el.querySelectorAll('.subject-row').forEach(row => {
    row.onclick = () => {
      el.querySelectorAll('.subject-row').forEach(r => {
        r.style.borderColor = 'transparent';
        r.style.background = 'var(--bg3)';
      });
      row.style.borderColor = 'var(--accent)';
      row.style.background = 'var(--bg2)';
      const sid = +row.dataset.id;
      const subject = subjects.find(s => s.id === sid);
      const chs = (chapters.filter(c => c.subject_id === sid))
        .sort((a,b) => a.sort_order - b.sort_order || a.id - b.id);
      showChapterPanel(el, subject, chs, subjects, chapters);
    };
  });
}

function showChapterPanel(el, subject, chs, subjects, chapters) {
  const panel = el.querySelector('#chapter-panel');
  panel.innerHTML = buildChapterPanel(subject, chs);

  panel.querySelector('#ch-add-btn').onclick = async () => {
    const title = prompt(t('prompt.addChapter'));
    if (!title || !title.trim()) return;
    const maxOrder = chs.length ? Math.max(...chs.map(c => c.sort_order)) + 1 : 0;
    await post('/chapters', { subject_id: subject.id, title: title.trim(), sort_order: maxOrder });
    await refresh();
  };

  panel.querySelectorAll('.ch-rename-btn').forEach(btn => {
    btn.onclick = async () => {
      const newTitle = prompt(t('prompt.renameChapter'), btn.dataset.title);
      if (!newTitle || !newTitle.trim()) return;
      await put('/chapters/' + btn.dataset.id, { title: newTitle.trim() });
      await refresh();
    };
  });

  panel.querySelectorAll('.ch-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm(t('confirm.deleteChapter'))) return;
      await del('/chapters/' + btn.dataset.id);
      await refresh();
    };
  });

  panel.querySelectorAll('.ch-up-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.idx;
      if (idx === 0) return;
      await swapOrder(chs[idx], chs[idx-1]);
      await refresh();
    };
  });
  panel.querySelectorAll('.ch-dn-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.idx;
      if (idx >= chs.length - 1) return;
      await swapOrder(chs[idx], chs[idx+1]);
      await refresh();
    };
  });
}

async function swapOrder(a, b) {
  await Promise.all([
    put('/chapters/' + a.id, { sort_order: b.sort_order }),
    put('/chapters/' + b.id, { sort_order: a.sort_order }),
  ]);
}
