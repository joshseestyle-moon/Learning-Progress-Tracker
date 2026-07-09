// Shared gamification UI snippets — single source for the level card shown on
// both the dashboard and the growth page.
import { t } from './i18n.js';

export function levelCard(s) {
  const span = s.into_level + s.to_next;
  const pct = span > 0 ? Math.min(100, Math.round(s.into_level / span * 100)) : 100;
  const nextLine = s.to_next > 0
    ? `<span class="text-xs text-muted">${t('xp.toNext', { n: s.to_next })}</span>`
    : `<span class="text-xs" style="color:var(--success);font-weight:700;">${t('xp.maxLevel')}</span>`;
  const combo = s.combo_days > 0
    ? `<div style="font-size:.9rem;font-weight:700;color:#f97316;margin-top:.5rem;">${t('combo.days', { n: s.combo_days })}
         <span style="font-weight:400;color:var(--text2);font-size:.78rem;">${t('combo.bonus', { m: s.combo_multiplier.toFixed(1) })}</span></div>`
    : '';
  return `
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem;">
      <span style="font-size:1.8rem;">⭐</span>
      <div>
        <div style="font-weight:800;font-size:1.05rem;">Lv.${s.level} ${t(s.title_key)}</div>
        <div class="text-xs text-muted">${t('xp.totalLabel', { n: s.total_xp })}</div>
      </div>
    </div>
    <div style="height:8px;border-radius:4px;background:var(--bg3,rgba(128,128,128,.2));overflow:hidden;margin-bottom:.3rem;">
      <div style="width:${pct}%;height:100%;border-radius:4px;background:#fbbf24;"></div>
    </div>
    ${nextLine}
    ${combo}`;
}
