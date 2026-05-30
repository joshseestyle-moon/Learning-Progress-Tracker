import { api, escHtml } from './api.js';
import { t, getLang } from './i18n.js';

const TABS = ['wishing', 'counter', 'history'];

let state = {
  tab: 'wishing',
  points: 0,
  items: [],
  history: [],
  adding: false,
  error: '',
};

let _el = null;

async function loadAll() {
  const [pts, items, hist] = await Promise.all([
    api('/shop/points'),
    api('/shop/items'),
    api('/shop/history'),
  ]);
  state.points = pts.points;
  state.items  = items;
  state.history = hist;
}

function pointsBadge(n) {
  return `<span style="display:inline-flex;align-items:center;gap:.25rem;background:var(--bg3);
    border:1px solid var(--border);border-radius:2rem;padding:.15rem .6rem;font-size:.8rem;
    font-weight:600;color:var(--text2)">⭐ ${n} ${t('shop.pointUnit')}</span>`;
}

function renderWishing() {
  const items = state.items;
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:1rem">${t('shop.addWish')}</div>
      <div style="display:flex;gap:.6rem;align-items:flex-end;flex-wrap:wrap" id="wish-form">
        <div style="flex:1;min-width:160px">
          <div style="font-size:.75rem;color:var(--text3);margin-bottom:.3rem">${t('label.rewardName')}</div>
          <input id="wish-name" type="text" placeholder="${t('label.rewardNamePlaceholder')}" maxlength="40"
            style="width:100%;padding:.5rem .7rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box"
            onkeydown="if(event.key==='Enter')document.getElementById('wish-add-btn').click()">
        </div>
        <div style="width:110px">
          <div style="font-size:.75rem;color:var(--text3);margin-bottom:.3rem">${t('label.requiredPoints')}</div>
          <input id="wish-cost" type="number" min="0" placeholder="0" value="0"
            style="width:100%;padding:.5rem .7rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
        <button id="wish-add-btn" onclick="shopAddItem()"
          style="padding:.5rem 1.1rem;background:var(--accent);color:#fff;border:none;
                 border-radius:var(--radius-sm);font-size:.88rem;font-weight:600;cursor:pointer;
                 white-space:nowrap;height:36px;align-self:flex-end">
          ${t('btn.add')}
        </button>
      </div>
      ${state.error ? `<div style="margin-top:.6rem;color:#e74c3c;font-size:.82rem">${escHtml(state.error)}</div>` : ''}
    </div>

    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.75rem">
        ${t('shop.wishList')} <span style="font-weight:400;color:var(--text3)">(${items.length})</span>
      </div>
      ${items.length === 0
        ? `<div style="text-align:center;padding:1.5rem 0;color:var(--text3);font-size:.88rem">
             ${t('shop.noWishes')}
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:.5rem">
             ${items.map(it => `
               <div style="display:flex;align-items:center;gap:.75rem;padding:.7rem .9rem;
                           background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm)">
                 <div style="flex:1;font-size:.9rem;font-weight:500;color:var(--text)">${escHtml(it.name)}</div>
                 ${pointsBadge(it.cost)}
                 <button onclick="shopDeleteItem(${it.id})"
                   style="padding:.25rem .6rem;border:1px solid var(--border);background:transparent;
                          border-radius:var(--radius-sm);color:var(--text3);font-size:.78rem;cursor:pointer">
                   ${t('btn.delete')}
                 </button>
               </div>
             `).join('')}
           </div>`
      }
    </div>
  `;
}

function renderCounter() {
  const { points, items } = state;
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
                padding:1.5rem;margin-bottom:1rem;display:flex;align-items:center;gap:1rem">
      <div style="flex:1">
        <div style="font-size:.78rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.25rem">${t('shop.myPoints')}</div>
        <div style="font-size:2.8rem;font-weight:700;color:var(--accent);line-height:1">
          ${points}<span style="font-size:1.1rem;font-weight:500;color:var(--text3);margin-left:.3rem">${t('shop.pointUnit')}</span>
        </div>
        <div style="font-size:.75rem;color:var(--text3);margin-top:.3rem">${t('shop.pointHint')}</div>
      </div>
      <div style="font-size:3rem;opacity:.15">⭐</div>
    </div>

    ${state.error ? `<div style="margin-bottom:.75rem;padding:.6rem .9rem;background:#fdf2f2;border:1px solid #f5c6cb;border-radius:var(--radius-sm);color:#e74c3c;font-size:.85rem">${escHtml(state.error)}</div>` : ''}

    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.9rem">${t('shop.availableRewards')}</div>
      ${items.length === 0
        ? `<div style="text-align:center;padding:1.5rem 0;color:var(--text3);font-size:.88rem">
             ${t('shop.noRewards')}
           </div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.75rem">
             ${items.map(it => {
               const canAfford = points >= it.cost;
               return `
                 <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);
                             padding:1rem;display:flex;flex-direction:column;gap:.5rem;
                             ${canAfford ? '' : 'opacity:.55'}">
                   <div style="font-size:.95rem;font-weight:600;color:var(--text)">${escHtml(it.name)}</div>
                   <div style="flex:1"></div>
                   <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.25rem">
                     ${pointsBadge(it.cost)}
                     <button onclick="shopRedeem(${it.id})" ${canAfford ? '' : 'disabled'}
                       style="padding:.35rem .85rem;border:none;border-radius:var(--radius-sm);font-size:.82rem;
                              font-weight:600;cursor:${canAfford ? 'pointer' : 'not-allowed'};
                              background:${canAfford ? 'var(--accent)' : 'var(--bg)'};
                              color:${canAfford ? '#fff' : 'var(--text3)'};
                              border:1px solid ${canAfford ? 'transparent' : 'var(--border)'}">
                       ${t('btn.exchange')}
                     </button>
                   </div>
                 </div>
               `;
             }).join('')}
           </div>`
      }
    </div>
  `;
}

function renderHistory() {
  const hist = state.history;
  const LOCALE_MAP = { 'zh-TW': 'zh-TW', 'en': 'en-US', 'ja': 'ja-JP' };
  const locale = LOCALE_MAP[getLang()] || 'zh-TW';
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.75rem">${t('shop.historyTitle')}</div>
      ${hist.length === 0
        ? `<div style="text-align:center;padding:1.5rem 0;color:var(--text3);font-size:.88rem">
             ${t('shop.noHistory')}
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:.5rem">
             ${hist.map(r => {
               const d = new Date(r.redeemed_at);
               const dateStr = d.toLocaleDateString(locale, { year:'numeric', month:'2-digit', day:'2-digit' });
               const timeStr = d.toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' });
               return `
                 <div style="display:flex;align-items:center;gap:.75rem;padding:.7rem .9rem;
                             background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm)">
                   <div style="flex:1">
                     <div style="font-size:.9rem;font-weight:500;color:var(--text)">${escHtml(r.item_name)}</div>
                     <div style="font-size:.75rem;color:var(--text3);margin-top:.15rem">${dateStr} ${timeStr}</div>
                   </div>
                   <div style="font-size:.82rem;font-weight:600;color:#e74c3c;white-space:nowrap">−${r.cost} ${t('shop.pointUnit')}</div>
                 </div>
               `;
             }).join('')}
           </div>`
      }
    </div>
  `;
}

function tabBtn(id) {
  const active = state.tab === id;
  return `
    <button onclick="shopSetTab('${id}')"
      style="padding:.5rem 1.1rem;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};
             border-radius:var(--radius-sm);background:${active ? 'var(--accent)' : 'var(--bg2)'};
             color:${active ? '#fff' : 'var(--text2)'};font-size:.88rem;font-weight:${active ? '600' : '400'};
             cursor:pointer;display:flex;align-items:center;gap:.35rem">
      ${t('tab.' + id)}
    </button>
  `;
}

export async function render(el) {
  _el = el;

  if (!state.items.length && !state.history.length && state.points === 0) {
    el.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text3)">${t('app.loading')}</div>`;
    try { await loadAll(); } catch (e) {
      el.innerHTML = `<div class="card"><p style="color:var(--danger)">${t('alert.loadFail', { msg: e.message })}</p></div>`;
      return;
    }
  }

  el.innerHTML = `
    <div style="max-width:720px;margin:0 auto;padding-bottom:2rem">

      <div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
        ${tabBtn('wishing')}
        ${tabBtn('counter')}
        ${tabBtn('history')}
      </div>

      <div id="shop-tab-content">
        ${state.tab === 'wishing' ? renderWishing()
        : state.tab === 'counter' ? renderCounter()
        : renderHistory()}
      </div>

    </div>
  `;
}

// ── Global handlers (called from inline onclick) ──

window.shopSetTab = function(tab) {
  state.error = '';
  state.tab = tab;
  render(_el);
};

window.shopAddItem = async function() {
  const nameEl = document.getElementById('wish-name');
  const costEl = document.getElementById('wish-cost');
  const name = (nameEl?.value || '').trim();
  const cost = parseInt(costEl?.value) || 0;
  if (!name) { state.error = t('shop.enterName'); render(_el); return; }
  try {
    const item = await api('/shop/items', { method: 'POST', body: { name, cost } });
    state.items.unshift(item);
    state.error = '';
    if (nameEl) nameEl.value = '';
    if (costEl) costEl.value = '0';
    render(_el);
  } catch (e) {
    state.error = e.message;
    render(_el);
  }
};

window.shopDeleteItem = async function(id) {
  try {
    await api('/shop/items/' + id, { method: 'DELETE' });
    state.items = state.items.filter(it => it.id !== id);
    render(_el);
  } catch (e) {
    state.error = e.message;
    render(_el);
  }
};

window.shopRedeem = async function(id) {
  state.error = '';
  try {
    const res = await api('/shop/redeem/' + id, { method: 'POST' });
    state.points = res.points;
    const item = state.items.find(it => it.id === id);
    if (item) {
      state.history.unshift({ item_name: item.name, cost: item.cost, redeemed_at: new Date().toISOString() });
    }
    render(_el);
  } catch (e) {
    state.error = e.message;
    render(_el);
  }
};
