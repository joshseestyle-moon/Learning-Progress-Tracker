import { getLang, tErr } from './i18n.js';

export function getUserId() { return localStorage.getItem('userId'); }
export function getUserName() { return localStorage.getItem('userName'); }

export async function api(path, options = {}) {
  const userId = getUserId();
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-User-Id': userId } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(tErr(err.error) || tErr('請求失敗'));
  }
  const data = await res.json();
  // Some endpoints legitimately return null (e.g. GET /periods/current with no
  // matching period) — only inspect gamify fields on object responses.
  if (data && typeof data === 'object') {
    if (data.newBadges && data.newBadges.length > 0) {
      window.dispatchEvent(new CustomEvent('badge-earned', { detail: data.newBadges }));
    }
    if ((data.xp && data.xp.gained > 0) || data.surprise || data.questCompleted
        || (data.goalsAchieved && data.goalsAchieved.length > 0)) {
      window.dispatchEvent(new CustomEvent('gamify-result', { detail: data }));
    }
  }
  return data;
}

export const get  = (path)         => api(path);
export const post = (path, body)   => api(path, { method: 'POST', body });
export const put  = (path, body)   => api(path, { method: 'PUT',  body });
export const del  = (path)         => api(path, { method: 'DELETE' });
export const patch = (path, body)  => api(path, { method: 'PATCH', body });

export function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export const LOCALE_MAP = { 'zh-TW': 'zh-TW', 'en': 'en-US', 'ja': 'ja-JP' };

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  const lang = getLang();
  if (lang === 'zh-TW') {
    const roc = dt.getFullYear() - 1911;
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `民國${roc}年${m}月${day}日`;
  }
  return dt.toLocaleDateString(LOCALE_MAP[lang] || 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Format a Date as a LOCAL 'YYYY-MM-DD'. Must NOT use toISOString() (UTC):
// between midnight and 08:00 Asia/Taipei that would be the previous day,
// disagreeing with the server's 'localtime' SQLite queries. Single source for
// every "what local date is this" computation in the frontend.
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function today() {
  return ymd(new Date());
}

export function daysLeft(dateStr) {
  const diff = Math.ceil((new Date(dateStr + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  return diff;
}

export function fmtMonth(ym) {
  const lang   = getLang();
  const year   = parseInt(ym.slice(0, 4));
  const mon    = ym.slice(5, 7);
  if (lang === 'zh-TW') return `民國${year - 1911}年${mon}月`;
  const locale = LOCALE_MAP[lang] || 'en-US';
  return new Date(ym + '-01T00:00:00').toLocaleDateString(locale, { year: 'numeric', month: 'long' });
}
