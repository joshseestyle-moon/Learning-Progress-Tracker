// Shared period-scope filter used by the exam / homework / study-log / chapter
// detail pages. Renders a row of chips (全部 + each period) into `container` and
// calls onChange(scope) initially and on every change. The chosen scope is
// persisted in localStorage under one key shared by all four pages, so moving
// between them keeps the same period selected.
//
// scope = { mode: 'all' } | { mode: 'period', id, from, to }
import { get, ymd } from './api.js';
import { t } from './i18n.js';

const STORAGE_KEY = 'periodScope';

export function periodLabel(p) {
  return `${p.school_year} ${t('enum.periodType.' + p.type)}`;
}

// Convert a SQLite UTC timestamp ('YYYY-MM-DD HH:MM:SS' or ISO) to a local
// calendar date 'YYYY-MM-DD'. Never slice(0,10) a UTC string — that keeps UTC.
export function localD(ts) {
  if (!ts) return null;
  return ymd(new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'));
}

export async function initPeriodFilter(container, onChange) {
  const periods = await get('/periods');
  if (!periods.length) {
    // No periods configured → no filter UI, page behaves exactly as before.
    container.innerHTML = '';
    onChange({ mode: 'all' });
    return;
  }

  const sorted = [...periods].sort((a, b) =>
    b.school_year - a.school_year || b.start_date.localeCompare(a.start_date));

  const scopeFor = (p) => ({ mode: 'period', id: p.id, from: p.start_date, to: p.end_date });

  // Resolve the starting scope: saved choice → today's period → all.
  let current;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'all') {
    current = { mode: 'all' };
  } else if (saved && sorted.some(p => String(p.id) === saved)) {
    current = scopeFor(sorted.find(p => String(p.id) === saved));
  } else {
    const today = ymd(new Date());
    const todayP = sorted.find(p => p.start_date <= today && today <= p.end_date);
    current = todayP ? scopeFor(todayP) : { mode: 'all' };
  }

  function render() {
    const chip = (active, label, val) =>
      `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}" data-scope="${val}">${label}</button>`;
    container.innerHTML = `
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;">
        ${chip(current.mode === 'all', t('period.scopeAll'), 'all')}
        ${sorted.map(p => chip(current.mode === 'period' && current.id === p.id, periodLabel(p), p.id)).join('')}
      </div>`;
    container.querySelectorAll('[data-scope]').forEach(btn => {
      btn.onclick = () => {
        const v = btn.dataset.scope;
        if (v === 'all') { current = { mode: 'all' }; localStorage.setItem(STORAGE_KEY, 'all'); }
        else { current = scopeFor(sorted.find(p => String(p.id) === v)); localStorage.setItem(STORAGE_KEY, v); }
        render();
        onChange(current);
      };
    });
  }

  render();
  onChange(current);
}
