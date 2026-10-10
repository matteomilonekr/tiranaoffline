// Minimal Graph API client for the Marketing API, read side only.
// Every call is a GET except the creation of an asynchronous insights report, which
// Meta requires for very large reports; a report job reads data and changes nothing.

export class MetaError extends Error {
  constructor(message, { status = 0, code = null, subcode = null, type = null, fbtraceId = null } = {}) {
    super(message);
    this.name = 'MetaError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.fbtraceId = fbtraceId;
    this.kind = classify(code, status);
  }
}

function classify(code, status) {
  if (code === 190 || code === 102 || status === 401) return 'token';
  if (code === 10 || (code >= 200 && code <= 299)) return 'permission';
  if ([4, 17, 32, 341, 613].includes(code) || (code >= 80000 && code <= 80014)) return 'rate';
  if (code === 1 || code === 2 || status >= 500) return 'transient';
  if (code === 100) return 'param';
  return 'error';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redact(text, token) {
  return token ? String(text).split(token).join('***') : String(text);
}

/** True for the errors Meta returns when a synchronous report is too large. */
export function isTooMuchData(err) {
  return (
    err instanceof MetaError &&
    (err.subcode === 1504018 || /reduce the amount of data|too many|timeout|timed out/i.test(err.message) || (err.code === 1 && err.status >= 500))
  );
}

/**
 * @param {{token:string, version?:string, baseUrl?:string, fetchImpl?:typeof fetch, retries?:number}} opts
 */
export function createMetaClient({
  token,
  version = 'v25.0',
  baseUrl = process.env.META_GRAPH_URL || 'https://graph.facebook.com',
  fetchImpl = globalThis.fetch,
  retries = 3,
  backoffMs = 1000,
  pollMs = 1000,
} = {}) {
  if (!token) throw new MetaError('No Meta access token', { code: 190, status: 401 });

  function buildUrl(path, params = {}) {
    const url = new URL(`${baseUrl.replace(/\/$/, '')}/${version}/${String(path).replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return url;
  }

  async function request(url, { method = 'GET', attempt = 0 } = {}) {
    const target = new URL(url);
    let body;
    if (method === 'POST') {
      body = new URLSearchParams(target.searchParams);
      body.set('access_token', token);
      target.search = '';
    } else {
      target.searchParams.set('access_token', token);
    }
    let res;
    try {
      res = await fetchImpl(target, {
        method,
        body,
        headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
        signal: AbortSignal.timeout(90000),
      });
    } catch (e) {
      if (attempt < retries) {
        await sleep(backoffMs * 0.8 * 2 ** attempt);
        return request(url, { method, attempt: attempt + 1 });
      }
      throw new MetaError('Network error talking to Meta: ' + redact(e.message, token), { status: 0, code: 2 });
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // Meta sometimes answers 5xx with HTML.
    }
    if (res.ok && data && !data.error) return data;
    const e = data?.error || {};
    const err = new MetaError(redact(e.error_user_msg || e.message || `HTTP ${res.status}`, token), {
      status: res.status,
      code: e.code ?? null,
      subcode: e.error_subcode ?? null,
      type: e.type ?? null,
      fbtraceId: e.fbtrace_id ?? null,
    });
    if ((err.kind === 'transient' || err.kind === 'rate') && attempt < retries && !isTooMuchData(err)) {
      await sleep(backoffMs * (err.kind === 'rate' ? 4 : 1) * 2 ** attempt);
      return request(url, { method, attempt: attempt + 1 });
    }
    throw err;
  }

  async function get(path, params) {
    return request(buildUrl(path, params));
  }

  /** Follows paging.next until done or a cap is reached. */
  async function paged(path, params, { maxPages = 60 } = {}) {
    const out = [];
    let page = await request(buildUrl(path, params));
    for (let i = 0; page; i++) {
      if (Array.isArray(page.data)) out.push(...page.data);
      const next = page.paging?.next;
      if (!next || i + 1 >= maxPages) break;
      const nextUrl = new URL(next);
      nextUrl.searchParams.delete('access_token');
      page = await request(nextUrl);
    }
    return out;
  }

  /** Reads many nodes by id, 50 per request. Returns Map(id -> node). */
  async function byIds(ids, fields, extra = {}) {
    const unique = [...new Set(ids.filter(Boolean))];
    const out = new Map();
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const data = await get('', { ids: chunk.join(','), fields, ...extra });
      for (const [id, node] of Object.entries(data || {})) out.set(id, node);
    }
    return out;
  }

  /**
   * Insights rows for an object, paged. Drops fields Meta rejects (code 100 naming the
   * field) and switches to an asynchronous report when the synchronous one is too big.
   */
  async function insights(objectId, params, { optionalFields = [] } = {}) {
    let fields = String(params.fields || '').split(',').filter(Boolean);
    const dropped = [];
    for (let tries = 0; tries <= optionalFields.length; tries++) {
      try {
        return { rows: await paged(`${objectId}/insights`, { ...params, fields: fields.join(',') }), dropped };
      } catch (err) {
        if (err instanceof MetaError && err.kind === 'param') {
          const remaining = optionalFields.filter((f) => fields.includes(f));
          const named = remaining.find((f) => err.message.includes(f));
          // Drop the field Meta names; if it names none, drop every optional field once.
          const bad = named ? [named] : remaining;
          if (bad.length) {
            fields = fields.filter((f) => !bad.includes(f));
            dropped.push(...bad);
            continue;
          }
        }
        if (isTooMuchData(err)) {
          return { rows: await asyncInsights(objectId, { ...params, fields: fields.join(',') }), dropped };
        }
        throw err;
      }
    }
    throw new MetaError('Meta rejected the requested insight fields', { code: 100, status: 400 });
  }

  async function asyncInsights(objectId, params) {
    const job = await request(buildUrl(`${objectId}/insights`, params), { method: 'POST' });
    const id = job.report_run_id;
    if (!id) throw new MetaError('Meta did not start the report', { code: 1, status: 500 });
    const started = Date.now();
    for (;;) {
      await sleep(Math.min(5 * pollMs, pollMs + (Date.now() - started) / 10));
      const st = await get(id, { fields: 'async_status,async_percent_completion' });
      if (st.async_status === 'Job Completed') break;
      if (st.async_status === 'Job Failed' || st.async_status === 'Job Skipped') {
        throw new MetaError('Meta could not build the report (' + st.async_status + ')', { code: 1, status: 500 });
      }
      if (Date.now() - started > 8 * 60 * 1000) throw new MetaError('Meta report timed out', { code: 1, status: 504 });
    }
    return paged(`${id}/insights`, { limit: 500 });
  }

  return { get, paged, byIds, insights, version };
}
