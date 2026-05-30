import { api, escHtml } from './api.js';

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

function setTab(tab) {
  state.tab = tab;
  state.error = '';
  render(_el);
}

function pointsBadge(n) {
  return `<span style="display:inline-flex;align-items:center;gap:.25rem;background:var(--bg3);
    border:1px solid var(--border);border-radius:2rem;padding:.15rem .6rem;font-size:.8rem;
    font-weight:600;color:var(--text2)">⭐ ${n} 點</span>`;
}

function renderWishing() {
  const items = state.items;
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:1rem">新增願望</div>
      <div style="display:flex;gap:.6rem;align-items:flex-end;flex-wrap:wrap" id="wish-form">
        <div style="flex:1;min-width:160px">
          <div style="font-size:.75rem;color:var(--text3);margin-bottom:.3rem">獎勵名稱</div>
          <input id="wish-name" type="text" placeholder="例：選一頓大餐" maxlength="40"
            style="width:100%;padding:.5rem .7rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box"
            onkeydown="if(event.key==='Enter')document.getElementById('wish-add-btn').click()">
        </div>
        <div style="width:110px">
          <div style="font-size:.75rem;color:var(--text3);margin-bottom:.3rem">所需點數</div>
          <input id="wish-cost" type="number" min="0" placeholder="0" value="0"
            style="width:100%;padding:.5rem .7rem;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg);color:var(--text);font-size:.9rem;box-sizing:border-box">
        </div>
        <button id="wish-add-btn" onclick="shopAddItem()"
          style="padding:.5rem 1.1rem;background:var(--accent);color:#fff;border:none;
                 border-radius:var(--radius-sm);font-size:.88rem;font-weight:600;cursor:pointer;
                 white-space:nowrap;height:36px;align-self:flex-end">
          新增
        </button>
      </div>
      ${state.error ? `<div style="margin-top:.6rem;color:#e74c3c;font-size:.82rem">${escHtml(state.error)}</div>` : ''}
    </div>

    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.75rem">
        我的願望清單 <span style="font-weight:400;color:var(--text3)">(${items.length})</span>
      </div>
      ${items.length === 0
        ? `<div style="text-align:center;padding:1.5rem 0;color:var(--text3);font-size:.88rem">
             還沒有任何願望，從上方新增第一個吧！
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
                   刪除
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
        <div style="font-size:.78rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.25rem">我的點數</div>
        <div style="font-size:2.8rem;font-weight:700;color:var(--accent);line-height:1">
          ${points}<span style="font-size:1.1rem;font-weight:500;color:var(--text3);margin-left:.3rem">點</span>
        </div>
        <div style="font-size:.75rem;color:var(--text3);margin-top:.3rem">完成徽章任務即可獲得點數</div>
      </div>
      <div style="font-size:3rem;opacity:.15">⭐</div>
    </div>

    ${state.error ? `<div style="margin-bottom:.75rem;padding:.6rem .9rem;background:#fdf2f2;border:1px solid #f5c6cb;border-radius:var(--radius-sm);color:#e74c3c;font-size:.85rem">${escHtml(state.error)}</div>` : ''}

    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.9rem">可兌換獎勵</div>
      ${items.length === 0
        ? `<div style="text-align:center;padding:1.5rem 0;color:var(--text3);font-size:.88rem">
             還沒有設定任何獎勵，先到「許願池」新增吧！
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
                       兌換
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
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem">
      <div style="font-size:.8rem;color:var(--text3);font-weight:500;letter-spacing:.03em;margin-bottom:.75rem">兌換紀錄</div>
      ${hist.length === 0
        ? `<div style="text-align:center;padding:1.5rem 0;color:var(--text3);font-size:.88rem">
             尚無兌換紀錄
           </div>`
        : `<div style="display:flex;flex-direction:column;gap:.5rem">
             ${hist.map(r => {
               const d = new Date(r.redeemed_at);
               const dateStr = d.toLocaleDateString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit' });
               const timeStr = d.toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit' });
               return `
                 <div style="display:flex;align-items:center;gap:.75rem;padding:.7rem .9rem;
                             background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm)">
                   <div style="flex:1">
                     <div style="font-size:.9rem;font-weight:500;color:var(--text)">${escHtml(r.item_name)}</div>
                     <div style="font-size:.75rem;color:var(--text3);margin-top:.15rem">${dateStr} ${timeStr}</div>
                   </div>
                   <div style="font-size:.82rem;font-weight:600;color:#e74c3c;white-space:nowrap">−${r.cost} 點</div>
                 </div>
               `;
             }).join('')}
           </div>`
      }
    </div>
  `;
}

function tabBtn(id, label, icon) {
  const active = state.tab === id;
  return `
    <button onclick="shopSetTab('${id}')"
      style="padding:.5rem 1.1rem;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};
             border-radius:var(--radius-sm);background:${active ? 'var(--accent)' : 'var(--bg2)'};
             color:${active ? '#fff' : 'var(--text2)'};font-size:.88rem;font-weight:${active ? '600' : '400'};
             cursor:pointer;display:flex;align-items:center;gap:.35rem">
      ${icon} ${label}
    </button>
  `;
}

export async function render(el) {
  _el = el;

  if (!state.items.length && !state.history.length && state.points === 0) {
    el.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text3)">載入中…</div>`;
    try { await loadAll(); } catch (e) {
      el.innerHTML = `<div class="card"><p style="color:var(--danger)">載入失敗：${e.message}</p></div>`;
      return;
    }
  }

  el.innerHTML = `
    <div style="max-width:720px;margin:0 auto;padding-bottom:2rem">

      <div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
        ${tabBtn('wishing', '許願池', '✨')}
        ${tabBtn('counter', '櫃台', '🎁')}
        ${tabBtn('history', '兌換紀錄', '📋')}
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
  if (!name) { state.error = '請輸入獎勵名稱'; render(_el); return; }
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
