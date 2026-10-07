// Client for the local Constellation server. Every call carries a custom header, which
// browsers cannot attach cross-site without a preflight the server refuses, so other
// web pages cannot read the user's ad data through it.

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, kind = 'error' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.kind = kind;
  }
}

/** True when the page runs without the local server (the published demo). */
export function isStatic() {
  return typeof window !== 'undefined' && window.CONSTELLATION_STATIC === true;
}

async function request(path, { method = 'GET', body, timeout = 120000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'X-Constellation': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'timeout' : 'offline', { kind: 'offline' });
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON error page.
  }
  if (!res.ok) {
    throw new ApiError(data?.error?.message || res.statusText || 'Request failed', {
      status: res.status,
      code: data?.error?.code ?? null,
      kind: data?.error?.kind || (res.status === 401 ? 'token' : 'error'),
    });
  }
  return data;
}

const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');

export const api = {
  status: () => request('/api/status', { timeout: 8000 }),
  connect: (token) => request('/api/connect', { method: 'POST', body: { token } }),
  disconnect: () => request('/api/disconnect', { method: 'POST' }),
  accounts: () => request('/api/accounts'),
  saveConfig: (patch) => request('/api/config', { method: 'POST', body: patch }),
  snapshot: ({ account, since, until, refresh }) => request('/api/snapshot?' + qs({ account, since, until, refresh: refresh ? 1 : '' }), { timeout: 600000 }),
  detail: ({ account, ads, since, until, video }) => request('/api/detail?' + qs({ account, ads: ads.join(','), since, until, video: video ? 1 : '' })),
  clearCache: () => request('/api/cache/clear', { method: 'POST' }),
  imageUrl: (url) => '/img?u=' + encodeURIComponent(url),
};
