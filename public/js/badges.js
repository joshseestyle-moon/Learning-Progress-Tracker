import { get, escHtml } from './api.js';

const RARITY_LABEL = { common: '普通', uncommon: '進階', rare: '稀有', epic: '傳說' };

export async function render(el) {
  let badges;
  try {
    badges = await get('/badges');
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">載入失敗：${e.message}</p></div>`;
    return;
  }

  const earned  = badges.filter(b => b.earned);
  const locked  = badges.filter(b => !b.earned);
  const total   = badges.length;
  const pct     = Math.round(earned.length / total * 100);

  const categories = [...new Set(badges.map(b => b.category))];

  el.innerHTML = `
    <div style="max-width:860px">

      <!-- Progress summary -->
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

      <!-- Badges by category -->
      ${categories.map(cat => {
        const catBadges = badges.filter(b => b.category === cat);
        return `
          <div style="margin-bottom:1.5rem">
            <div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;color:var(--text3);text-transform:uppercase;margin-bottom:.75rem;padding-left:.1rem">${escHtml(cat)}類成就</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.75rem">
              ${catBadges.map(b => badgeCard(b)).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function badgeCard(b) {
  const rarityColor = { common: 'var(--border)', uncommon: '#4a90d9', rare: '#9b59b6', epic: '#f39c12' }[b.rarity] || 'var(--border)';
  const earnedAt = b.earned_at ? new Date(b.earned_at).toLocaleDateString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit' }) : '';

  if (b.earned) {
    return `
      <div style="background:var(--bg2);border:2px solid ${rarityColor};border-radius:var(--radius);
                  padding:1rem .9rem;display:flex;flex-direction:column;align-items:center;gap:.45rem;text-align:center;
                  box-shadow:0 0 0 1px ${rarityColor}22">
        <div style="font-size:2rem;line-height:1">${b.icon}</div>
        <div style="font-size:.88rem;font-weight:700;color:var(--text)">${escHtml(b.name)}</div>
        <div style="font-size:.72rem;color:var(--text2);line-height:1.4">${escHtml(b.desc)}</div>
        <div style="font-size:.65rem;color:${rarityColor};font-weight:600;margin-top:.1rem">${RARITY_LABEL[b.rarity] || b.rarity}</div>
        ${earnedAt ? `<div style="font-size:.65rem;color:var(--text3)">✓ ${earnedAt}</div>` : ''}
      </div>`;
  }

  return `
    <div style="background:var(--bg2);border:2px solid var(--border);border-radius:var(--radius);
                padding:1rem .9rem;display:flex;flex-direction:column;align-items:center;gap:.45rem;text-align:center;
                opacity:.45;filter:grayscale(.6)">
      <div style="font-size:2rem;line-height:1;filter:grayscale(1)">${b.icon}</div>
      <div style="font-size:.88rem;font-weight:700;color:var(--text)">${escHtml(b.name)}</div>
      <div style="font-size:.72rem;color:var(--text2);line-height:1.4">${escHtml(b.desc)}</div>
      <div style="font-size:.8rem;color:var(--text3)">🔒</div>
    </div>`;
}
