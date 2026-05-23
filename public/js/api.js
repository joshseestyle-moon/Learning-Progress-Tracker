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
    throw new Error(err.error || '請求失敗');
  }
  return res.json();
}

export const get  = (path)         => api(path);
export const post = (path, body)   => api(path, { method: 'POST', body });
export const put  = (path, body)   => api(path, { method: 'PUT',  body });
export const del  = (path)         => api(path, { method: 'DELETE' });
export const patch = (path, body)  => api(path, { method: 'PATCH', body });

export function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function daysLeft(dateStr) {
  const diff = Math.ceil((new Date(dateStr + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  return diff;
}
