import { get, post, del, escHtml } from './api.js';

const RARITY_LABEL = { common: '普通', uncommon: '進階', rare: '稀有', epic: '傳說', custom: '自訂' };
const RARITY_COLOR = { common: 'var(--border)', uncommon: '#4a90d9', rare: '#9b59b6', epic: '#f39c12', custom: '#27ae60' };

let _el = null;
let _badges = [];
let _showForm = false;
let _formError = '';

async function load() {
  _badges = await get('/badges');
}

function fmtDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function badgeCard(b) {
  const color = RARITY_COLOR[b.rarity] || 'var(--border)';
  const earnedAt = fmtDate(b.earned_at);

  const ptsChip = `<span style="font-size:.65rem;color:#d4a010;font-weight:600">⭐ ${b.points} 點</span>`;

  if (b.earned) {
    const actions = b.custom ? `
      <button onclick="badgeDeleteCustom(${b._db_id})"
        style="margin-top:.2rem;padding:.2rem .5rem;font-size:.65rem;border:1px solid var(--border);
               background:transparent;border-radius:4px;color:var(--text3);cursor:pointer">刪除</button>` : '';
    return `
      <div style="background:var(--bg2);border:2px solid ${color};border-radius:var(--radius);
                  padding:1rem .9rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;text-align:center;
                  box-shadow:0 0 0 1px ${color}22">
        <div style="font-size:2rem;line-height:1">${b.icon}</div>
        <div style="font-size:.88rem;font-weight:700;color:var(--text)">${escHtml(b.name)}</div>
        <div style="font-size:.72rem;color:var(--text2);line-height:1.4">${escHtml(b.desc)}</div>
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;justify-content:center;margin-top:.1rem">
          <span style="font-size:.65rem;color:${color};font-weight:600">${RARITY_LABEL[b.rarity] || b.rarity}</span>
          ${ptsChip}
        </div>
        ${earnedAt ? `<div style="font-size:.65rem;color:var(--text3)">✓ ${earnedAt}</div>` : ''}
        ${actions}
      </div>`;
  }

  // Unearned
  if (b.custom) {
    return `
      <div style="background:var(--bg2);border:2px solid ${color}55;border-radius:var(--radius);
                  padding:1rem .9rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;text-align:center">
        <div style="font-size:2rem;line-height:1">${b.icon}</div>
        <div style="font-size:.88rem;font-weight:700;color:var(--text)">${escHtml(b.name)}</div>
        <div style="font-size:.72rem;color:var(--text2);line-height:1.4">${escHtml(b.desc)}</div>
        ${ptsChip}
        <div style="display:flex;gap:.4rem;margin-top:.15rem">
          <button onclick="badgeEarnCustom(${b._db_id})"
            style="padding:.3rem .75rem;background:${color};color:#fff;border:none;border-radius:4px;
                   font-size:.78rem;font-weight:600;cursor:pointer">完成！</button>
          <button onclick="badgeDeleteCustom(${b._db_id})"
            style="padding:.3rem .5rem;font-size:.78rem;border:1px solid var(--border);
                   background:transparent;border-radius:4px;color:var(--text3);cursor:pointer">刪除</button>
        </div>
      </div>`;
  }

  return `
    <div style="background:var(--bg2);border:2px solid var(--border);border-radius:var(--radius);
                padding:1rem .9rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;text-align:center;
                opacity:.45;filter:grayscale(.6)">
      <div style="font-size:2rem;line-height:1;filter:grayscale(1)">${b.icon}</div>
      <div style="font-size:.88rem;font-weight:700;color:var(--text)">${escHtml(b.name)}</div>
      <div style="font-size:.72rem;color:var(--text2);line-height:1.4">${escHtml(b.desc)}</div>
      <div style="font-size:.65rem;color:var(--text3)">🔒</div>
      ${ptsChip}
    </div>`;
}

function renderAddForm() {
  if (!_showForm) {
    return `<button onclick="badgeShowForm()"
      style="padding:.45rem 1rem;border:1px dashed var(--border);background:transparent;
             border-radius:var(--radius-sm);color:var(--text3);font-size:.85rem;cursor:pointer">
      ＋ 新增自訂成就
    </button>`;
  }

  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.1rem;margin-bottom:.75rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;margin-bottom:.85rem">新增自訂成就</div>
      <div style="display:grid;grid-template-columns:64px 1fr;gap:.6rem;margin-bottom:.6rem">
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">圖示</div>
          <input id="cb-icon" type="text" value="🏅" maxlength="4"
            style="width:100%;padding:.45rem .4rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:1.4rem;text-align:center;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">成就名稱</div>
          <input id="cb-name" type="text" placeholder="例：讀完一本課外書" maxlength="30"
            style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 100px;gap:.6rem;margin-bottom:.75rem">
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">說明（選填）</div>
          <input id="cb-desc" type="text" placeholder="描述這個成就的條件" maxlength="50"
            style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">獎勵點數</div>
          <input id="cb-points" type="number" min="0" value="20"
            style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
      </div>
      ${_formError ? `<div style="color:#e74c3c;font-size:.8rem;margin-bottom:.6rem">${escHtml(_formError)}</div>` : ''}
      <div style="display:flex;gap:.5rem">
        <button onclick="badgeAddCustom()"
          style="padding:.4rem .9rem;background:var(--accent);color:#fff;border:none;border-radius:var(--radius-sm);
                 font-size:.85rem;font-weight:600;cursor:pointer">新增</button>
        <button onclick="badgeHideForm()"
          style="padding:.4rem .8rem;border:1px solid var(--border);background:transparent;border-radius:var(--radius-sm);
                 color:var(--text3);font-size:.85rem;cursor:pointer">取消</button>
      </div>
    </div>`;
}

function renderPage() {
  const systemBadges = _badges.filter(b => !b.custom);
  const customBadges = _badges.filter(b => b.custom);

  const earned = _badges.filter(b => b.earned);
  const total  = _badges.length;
  const pct    = total ? Math.round(earned.length / total * 100) : 0;

  const categories = [...new Set(systemBadges.map(b => b.category))];

  _el.innerHTML = `
    <div style="max-width:860px">

      <div class="card" style="margin-bottom:1.5rem">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
          <div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent)">${earned.length} <span style="font-size:1rem;font-weight:400;color:var(--text2)">/ ${total} 枚徽章</span></div>
            <div style="font-size:.82rem;color:var(--text3);margin-top:.2rem">繼續努力，解鎖更多成就！</div>
          </div>
          <div style="flex:1;min-width:160px;max-width:300px">
            <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text2);margin-bottom:.4rem">
              <span>解鎖進度</span><span>${pct}%</span>
            </div>
            <div style="height:10px;border-radius:999px;background:var(--bg3);overflow:hidden">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--success));border-radius:999px;transition:width .4s"></div>
            </div>
          </div>
        </div>
      </div>

      ${categories.map(cat => {
        const catBadges = systemBadges.filter(b => b.category === cat);
        return `
          <div style="margin-bottom:1.5rem">
            <div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin-bottom:.75rem;padding-left:.1rem">${escHtml(cat)}類成就</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.75rem">
              ${catBadges.map(b => badgeCard(b)).join('')}
            </div>
          </div>`;
      }).join('')}

      <div style="margin-bottom:1.5rem">
        <div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;color:#27ae60;text-transform:uppercase;margin-bottom:.75rem;padding-left:.1rem">自訂成就</div>
        <div id="custom-form-area" style="margin-bottom:.75rem">${renderAddForm()}</div>
        ${customBadges.length > 0
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.75rem">
               ${customBadges.map(b => badgeCard(b)).join('')}
             </div>`
          : `<div style="color:var(--text3);font-size:.85rem;padding:.5rem .1rem">還沒有自訂成就，從上方新增第一個吧！</div>`
        }
      </div>

    </div>`;
}

export async function render(el) {
  _el = el;
  _showForm = false;
  _formError = '';
  el.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text3)">載入中…</div>`;
  try {
    await load();
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">載入失敗：${e.message}</p></div>`;
    return;
  }
  renderPage();
}

// ── Global handlers ──

window.badgeShowForm = function() {
  _showForm = true;
  _formError = '';
  const area = document.getElementById('custom-form-area');
  if (area) area.innerHTML = renderAddForm();
};

window.badgeHideForm = function() {
  _showForm = false;
  _formError = '';
  const area = document.getElementById('custom-form-area');
  if (area) area.innerHTML = renderAddForm();
};

window.badgeAddCustom = async function() {
  const name   = (document.getElementById('cb-name')?.value || '').trim();
  const icon   = (document.getElementById('cb-icon')?.value || '🏅').trim() || '🏅';
  const desc   = (document.getElementById('cb-desc')?.value || '').trim();
  const points = parseInt(document.getElementById('cb-points')?.value) || 0;

  if (!name) {
    _formError = '請輸入成就名稱';
    const area = document.getElementById('custom-form-area');
    if (area) area.innerHTML = renderAddForm();
    return;
  }

  try {
    await post('/badges/custom', { name, icon, desc, points });
    _showForm = false;
    _formError = '';
    await load();
    renderPage();
  } catch (e) {
    _formError = e.message;
    const area = document.getElementById('custom-form-area');
    if (area) area.innerHTML = renderAddForm();
  }
};

window.badgeEarnCustom = async function(dbId) {
  try {
    const res = await post('/badges/custom/' + dbId + '/earn', {});
    await load();
    renderPage();
    if (res.points > 0) {
      window.dispatchEvent(new CustomEvent('badge-earned', {
        detail: [{ icon: '🏅', name: '自訂成就完成', desc: `獲得 ${res.points} 點`, rarity: 'custom' }]
      }));
    }
  } catch (e) {
    alert(e.message);
  }
};

window.badgeDeleteCustom = async function(dbId) {
  try {
    await del('/badges/custom/' + dbId);
    await load();
    renderPage();
  } catch (e) {
    alert(e.message);
  }
};
