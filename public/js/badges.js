import { get, post, del, escHtml, fmtDate } from './api.js';
import { t, getLang } from './i18n.js';

const RARITY_COLOR = { common: 'var(--border)', uncommon: '#4a90d9', rare: '#9b59b6', epic: '#f39c12', custom: '#27ae60' };
const ALL_CATEGORIES = ['習慣', '努力', '完成', '成績', '自訂'];

let _el = null;
let _badges = [];
let _exchanges = [];
let _showForm = false;
let _formError = '';

async function load() {
  [_badges, _exchanges] = await Promise.all([
    get('/badges'),
    get('/badges/exchanges'),
  ]);
}

function badgeCard(b) {
  const color = RARITY_COLOR[b.rarity] || 'var(--border)';
  const earnedAt = b.earned_at ? fmtDate(new Date(b.earned_at).toISOString().slice(0, 10)) : '';

  const ptsChip = `<span style="font-size:.65rem;color:#d4a010;font-weight:600">⭐ ${b.points} ${t('shop.pointUnit')}</span>`;

  if (b.earned) {
    const exchangeId = b.custom ? b._db_id : b.id;
    const exchangeType = b.custom ? 'custom' : 'system';
    const exchangeBtn = b.points > 0 ? `
      <button onclick="badgeExchange('${exchangeType}', '${exchangeId}', ${b.points})"
        style="margin-top:.15rem;padding:.22rem .55rem;font-size:.65rem;border:1px solid #e67e22;
               border-radius:4px;color:#e67e22;background:transparent;cursor:pointer;font-weight:600">
        ${t('badge.exchange', { n: b.points })}
      </button>` : '';
    const actions = b.custom ? `
      <button onclick="badgeDeleteCustom(${b._db_id})"
        style="margin-top:.2rem;padding:.2rem .5rem;font-size:.65rem;border:1px solid var(--border);
               background:transparent;border-radius:4px;color:var(--text3);cursor:pointer">${t('btn.delete')}</button>` : '';
    return `
      <div style="background:var(--bg2);border:2px solid ${color};border-radius:var(--radius);
                  padding:1rem .9rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;text-align:center;
                  box-shadow:0 0 0 1px ${color}22">
        <div style="font-size:2rem;line-height:1">${b.icon}</div>
        <div style="font-size:.88rem;font-weight:700;color:var(--text)">${escHtml(b.name)}</div>
        <div style="font-size:.72rem;color:var(--text2);line-height:1.4">${escHtml(b.desc)}</div>
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;justify-content:center;margin-top:.1rem">
          <span style="font-size:.65rem;color:${color};font-weight:600">${t('enum.rarity.' + b.rarity)}</span>
          ${ptsChip}
        </div>
        ${earnedAt ? `<div style="font-size:.65rem;color:var(--text3)">${t('badge.earnedAt', { date: earnedAt })}</div>` : ''}
        ${exchangeBtn}
        ${actions}
      </div>`;
  }

  // Unearned custom
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
                   font-size:.78rem;font-weight:600;cursor:pointer">${t('badge.earn')}</button>
          <button onclick="badgeDeleteCustom(${b._db_id})"
            style="padding:.3rem .5rem;font-size:.78rem;border:1px solid var(--border);
                   background:transparent;border-radius:4px;color:var(--text3);cursor:pointer">${t('btn.delete')}</button>
        </div>
      </div>`;
  }

  // Unearned system
  return `
    <div style="background:var(--bg2);border:2px solid var(--border);border-radius:var(--radius);
                padding:1rem .9rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;text-align:center;
                opacity:.45;filter:grayscale(.6)">
      <div style="font-size:2rem;line-height:1;filter:grayscale(1)">${b.icon}</div>
      <div style="font-size:.88rem;font-weight:700;color:var(--text)">${escHtml(b.name)}</div>
      <div style="font-size:.72rem;color:var(--text2);line-height:1.4">${escHtml(b.desc)}</div>
      <div style="font-size:.65rem;color:var(--text3)">${t('badge.locked')}</div>
      ${ptsChip}
    </div>`;
}

function renderAddForm() {
  if (!_showForm) {
    return `<button onclick="badgeShowForm()"
      style="padding:.45rem 1rem;border:1px dashed var(--border);background:transparent;
             border-radius:var(--radius-sm);color:var(--text3);font-size:.85rem;cursor:pointer">
      ${t('badge.addCustomBtn')}
    </button>`;
  }

  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.1rem;margin-bottom:.75rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;margin-bottom:.85rem">${t('badge.addCustomTitle')}</div>
      <div style="display:grid;grid-template-columns:64px 1fr;gap:.6rem;margin-bottom:.6rem">
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">${t('label.icon')}</div>
          <input id="cb-icon" type="text" value="🏅" maxlength="4"
            style="width:100%;padding:.45rem .4rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:1.4rem;text-align:center;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">${t('label.achievementName')}</div>
          <input id="cb-name" type="text" placeholder="${t('label.achievementNamePlaceholder')}" maxlength="30"
            style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 100px;gap:.6rem;margin-bottom:.6rem">
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">${t('label.descOptional')}</div>
          <input id="cb-desc" type="text" placeholder="${t('label.descPlaceholder')}" maxlength="50"
            style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">${t('label.rewardPoints')}</div>
          <input id="cb-points" type="number" min="0" value="20"
            style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
      </div>
      <div style="margin-bottom:.75rem">
        <div style="font-size:.72rem;color:var(--text3);margin-bottom:.3rem">${t('label.category')}</div>
        <select id="cb-category"
          style="width:100%;padding:.45rem .6rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                 background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
          ${ALL_CATEGORIES.map(c => `<option value="${c}">${t('enum.badgeCat.' + c)}</option>`).join('')}
        </select>
      </div>
      ${_formError ? `<div style="color:#e74c3c;font-size:.8rem;margin-bottom:.6rem">${escHtml(_formError)}</div>` : ''}
      <div style="display:flex;gap:.5rem">
        <button onclick="badgeAddCustom()"
          style="padding:.4rem .9rem;background:var(--accent);color:#fff;border:none;border-radius:var(--radius-sm);
                 font-size:.85rem;font-weight:600;cursor:pointer">${t('btn.add')}</button>
        <button onclick="badgeHideForm()"
          style="padding:.4rem .8rem;border:1px solid var(--border);background:transparent;border-radius:var(--radius-sm);
                 color:var(--text3);font-size:.85rem;cursor:pointer">${t('btn.cancel')}</button>
      </div>
    </div>`;
}

function renderPage() {
  const systemBadges = _badges.filter(b => !b.custom);
  const customBadges = _badges.filter(b => b.custom);
  const mixedCustom       = customBadges.filter(b => b.category !== '自訂');
  const ownSectionCustom  = customBadges.filter(b => b.category === '自訂');

  const earned = _badges.filter(b => b.earned);
  const total  = _badges.length;
  const pct    = total ? Math.round(earned.length / total * 100) : 0;

  const categories = [...new Set(systemBadges.map(b => b.category))];

  const LOCALE_MAP = { 'zh-TW': 'zh-TW', 'en': 'en-US', 'ja': 'ja-JP' };
  const locale = LOCALE_MAP[getLang()] || 'zh-TW';

  _el.innerHTML = `
    <div style="max-width:860px">

      <div class="card" style="margin-bottom:1.5rem">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
          <div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--accent)">${t('badge.earnedCount', { earned: earned.length, total })}</div>
            <div style="font-size:.82rem;color:var(--text3);margin-top:.2rem">${t('badge.keepGoing')}</div>
          </div>
          <div style="flex:1;min-width:160px;max-width:300px">
            <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--text2);margin-bottom:.4rem">
              <span>${t('badge.progress')}</span><span>${pct}%</span>
            </div>
            <div style="height:10px;border-radius:999px;background:var(--bg3);overflow:hidden">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--success));border-radius:999px;transition:width .4s"></div>
            </div>
          </div>
        </div>
      </div>

      ${categories.map(cat => {
        const catBadges = [
          ...systemBadges.filter(b => b.category === cat),
          ...mixedCustom.filter(b => b.category === cat),
        ];
        return `
          <div style="margin-bottom:1.5rem">
            <div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin-bottom:.75rem;padding-left:.1rem">${t('badge.category', { cat: t('enum.badgeCat.' + cat) })}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.75rem">
              ${catBadges.map(b => badgeCard(b)).join('')}
            </div>
          </div>`;
      }).join('')}

      <div style="margin-bottom:1.5rem">
        <div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;color:#27ae60;text-transform:uppercase;margin-bottom:.75rem;padding-left:.1rem">${t('badge.customSection')}</div>
        <div id="custom-form-area" style="margin-bottom:.75rem">${renderAddForm()}</div>
        ${ownSectionCustom.length > 0
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.75rem">
               ${ownSectionCustom.map(b => badgeCard(b)).join('')}
             </div>`
          : `<div style="color:var(--text3);font-size:.85rem;padding:.5rem .1rem">${t('badge.noCustom')}</div>`
        }
      </div>

      ${_exchanges.length > 0 ? `
      <div style="margin-bottom:1.5rem">
        <div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin-bottom:.75rem;padding-left:.1rem">${t('badge.exchangeHistory')}</div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
          ${_exchanges.map(r => {
            const dateStr = new Date(r.exchanged_at).toLocaleDateString(locale, { year:'numeric', month:'2-digit', day:'2-digit' });
            return `
              <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem .9rem;border-bottom:1px solid var(--border)">
                <span style="font-size:1.3rem;flex-shrink:0">${r.badge_icon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:.85rem;font-weight:600;color:var(--text)">${escHtml(r.badge_name)}</div>
                  <div style="font-size:.72rem;color:var(--text3)">${dateStr}</div>
                </div>
                <div style="font-size:.82rem;font-weight:600;color:var(--success);white-space:nowrap">+${r.points} ${t('shop.pointUnit')}</div>
              </div>`;
          }).join('')}
        </div>
      </div>` : ''}

    </div>`;
}

export async function render(el) {
  _el = el;
  _showForm = false;
  _formError = '';
  el.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text3)">${t('app.loading')}</div>`;
  try {
    await load();
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">${t('alert.loadFail', { msg: e.message })}</p></div>`;
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
  const name     = (document.getElementById('cb-name')?.value || '').trim();
  const icon     = (document.getElementById('cb-icon')?.value || '🏅').trim() || '🏅';
  const desc     = (document.getElementById('cb-desc')?.value || '').trim();
  const points   = parseInt(document.getElementById('cb-points')?.value) || 0;
  const category = document.getElementById('cb-category')?.value || '自訂';

  if (!name) {
    _formError = t('badge.nameRequired');
    const area = document.getElementById('custom-form-area');
    if (area) area.innerHTML = renderAddForm();
    return;
  }

  try {
    await post('/badges/custom', { name, icon, desc, points, category });
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
    window.dispatchEvent(new CustomEvent('badge-earned', {
      detail: [{ icon: res.icon || '🏅', name: res.name || t('badge.customEarnedName'), desc: t('badge.earnedDesc'), rarity: 'custom' }]
    }));
  } catch (e) {
    alert(e.message);
  }
};

window.badgeExchange = async function(type, badgeId, points) {
  const path = type === 'custom'
    ? '/badges/custom/' + badgeId + '/exchange'
    : '/badges/' + badgeId + '/exchange';
  try {
    await post(path, {});
    await load();
    renderPage();
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
