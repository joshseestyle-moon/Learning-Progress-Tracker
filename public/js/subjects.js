import { get, post, put, del, patch, escHtml } from './api.js';

const PRESET_COLORS = [
  '#4f6ef7','#22c55e','#f59e0b','#e04040',
  '#a855f7','#06b6d4','#ec4899','#84cc16',
];

export async function render(el) {
  await refresh(el);
}

async function refresh(el) {
  const [subjects, chapters] = await Promise.all([
    get('/subjects'),
    get('/chapters'),
  ]);
  el.innerHTML = buildPage(subjects, chapters);
  attachEvents(el, subjects, chapters);
}

function buildPage(subjects, chapters) {
  const bySubject = {};
  for (const c of chapters) {
    (bySubject[c.subject_id] = bySubject[c.subject_id] || []).push(c);
  }

  return `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:1.5rem;align-items:start;">

      <!-- 左欄：科目列表 -->
      <div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div class="card-title" style="margin:0;">科目列表</div>
            <button class="btn btn-primary btn-sm" id="sub-add-btn">+ 新增科目</button>
          </div>

          ${subjects.length ? subjects.map(s => `
            <div class="subject-row" data-id="${s.id}" style="
              display:flex;align-items:center;justify-content:space-between;
              padding:.6rem .75rem;border-radius:var(--radius-sm);cursor:pointer;
              margin-bottom:.3rem;border:2px solid transparent;
              background:var(--bg3);transition:.1s;
            ">
              <div style="display:flex;align-items:center;gap:.6rem;">
                <span style="width:14px;height:14px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0;"></span>
                <span style="font-weight:600;">${escHtml(s.name)}</span>
                <span class="text-xs text-muted">(${(bySubject[s.id]||[]).length} 章節)</span>
              </div>
              <div style="display:flex;gap:.4rem;">
                <button class="btn btn-ghost btn-sm sub-edit-btn" data-id="${s.id}">編輯</button>
                <button class="btn btn-danger btn-sm sub-del-btn" data-id="${s.id}">✕</button>
              </div>
            </div>`).join('') :
            '<div class="empty-state" style="padding:1.5rem;"><div class="icon">📚</div><p>尚未新增科目</p></div>'}
        </div>
      </div>

      <!-- 右欄：章節管理（點選科目後顯示） -->
      <div id="chapter-panel">
        <div class="card">
          <div class="empty-state">
            <div class="icon">👈</div>
            <p>點選左方科目來管理章節</p>
          </div>
        </div>
      </div>

    </div>

    <!-- 科目 modal -->
    <div id="sub-modal" class="modal-overlay hidden">${buildSubjectModal()}</div>
  `;
}

function buildSubjectModal(s) {
  s = s || {};
  return `
    <div class="modal-box">
      <div class="modal-title">${s.id ? '編輯科目' : '新增科目'}</div>
      <div class="form-group">
        <label class="form-label">科目名稱</label>
        <input id="sm-name" class="form-input" value="${escHtml(s.name||'')}" placeholder="例：數學、英文、物理">
      </div>
      <div class="form-group">
        <label class="form-label">代表顏色</label>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;" id="sm-colors">
          ${PRESET_COLORS.map(c => `
            <div class="sm-color-swatch" data-color="${c}" style="
              width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;
              border:3px solid ${(s.color||PRESET_COLORS[0])===c ? '#fff' : 'transparent'};
              box-shadow:${(s.color||PRESET_COLORS[0])===c ? '0 0 0 2px var(--accent)' : 'none'};
              transition:.1s;flex-shrink:0;
            "></div>`).join('')}
        </div>
        <input id="sm-color-val" type="hidden" value="${s.color||PRESET_COLORS[0]}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="sm-cancel">取消</button>
        <button class="btn btn-primary" id="sm-save">儲存</button>
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
            ${escHtml(subject.name)} 的章節
          </div>
          <div class="text-xs text-muted mt-1">拖曳可調整順序，或使用 ↑↓ 按鈕</div>
        </div>
        <button class="btn btn-primary btn-sm" id="ch-add-btn">+ 新增章節</button>
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
              <button class="btn btn-ghost btn-sm ch-rename-btn" data-id="${c.id}" data-title="${escHtml(c.title)}">改名</button>
              <button class="btn btn-danger btn-sm ch-del-btn" data-id="${c.id}">✕</button>
            </div>
          </div>`).join('') :
          '<div class="text-muted text-sm">尚未新增章節，點右上「+ 新增章節」開始</div>'}
      </div>
    </div>`;
}

function openSubjectModal(el, subject, subjects, chapters) {
  const modal = el.querySelector('#sub-modal');
  modal.innerHTML = buildSubjectModal(subject);
  modal.classList.remove('hidden');

  // Color swatch selection
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
  if (!name) return alert('請輸入科目名稱');
  if (existing) await put('/subjects/' + existing.id, { name, color });
  else          await post('/subjects', { name, color });
  modal.classList.add('hidden');
  await refresh(el);
}

function attachEvents(el, subjects, chapters) {
  // Add subject
  el.querySelector('#sub-add-btn').onclick = () => openSubjectModal(el, null, subjects, chapters);

  // Edit / delete subject
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
      if (!confirm('刪除科目會同時刪除所有相關章節、作業、考試等資料，確定嗎？')) return;
      await del('/subjects/' + btn.dataset.id);
      await refresh(el);
    };
  });

  // Click subject row → show chapter panel
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

  // Add chapter
  panel.querySelector('#ch-add-btn').onclick = async () => {
    const title = prompt('章節名稱：');
    if (!title || !title.trim()) return;
    const maxOrder = chs.length ? Math.max(...chs.map(c => c.sort_order)) + 1 : 0;
    await post('/chapters', { subject_id: subject.id, title: title.trim(), sort_order: maxOrder });
    await refresh(el);
  };

  // Rename
  panel.querySelectorAll('.ch-rename-btn').forEach(btn => {
    btn.onclick = async () => {
      const newTitle = prompt('新章節名稱：', btn.dataset.title);
      if (!newTitle || !newTitle.trim()) return;
      await put('/chapters/' + btn.dataset.id, { title: newTitle.trim() });
      await refresh(el);
    };
  });

  // Delete
  panel.querySelectorAll('.ch-del-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('確定刪除此章節？')) return;
      await del('/chapters/' + btn.dataset.id);
      await refresh(el);
    };
  });

  // Move up/down
  panel.querySelectorAll('.ch-up-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.idx;
      if (idx === 0) return;
      await swapOrder(chs[idx], chs[idx-1]);
      await refresh(el);
    };
  });
  panel.querySelectorAll('.ch-dn-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.idx;
      if (idx >= chs.length - 1) return;
      await swapOrder(chs[idx], chs[idx+1]);
      await refresh(el);
    };
  });
}

async function swapOrder(a, b) {
  await Promise.all([
    put('/chapters/' + a.id, { sort_order: b.sort_order }),
    put('/chapters/' + b.id, { sort_order: a.sort_order }),
  ]);
}
