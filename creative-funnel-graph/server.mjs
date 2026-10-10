#!/usr/bin/env node
// Creative Funnel Graph local server. Serves the app on 127.0.0.1 and reads Meta's Marketing API
// with the user's token. No dependencies: Node 18 or newer.
//
//   node server.mjs [--port 4747] [--open]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { loadConfig, saveConfig, clearToken, clearCache, readCache, writeCache, homeDir } from './lib/config.mjs';
import { createMetaClient, MetaError } from './lib/meta-client.mjs';
import { fetchAccounts, fetchSnapshot } from './lib/meta-snapshot.mjs';
import { fetchDetail } from './lib/meta-detail.mjs';
import { proxyImage } from './lib/image-proxy.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const SNAPSHOT_TTL = 30 * 60 * 1000;
const DETAIL_TTL = 15 * 60 * 1000;
const ACCOUNT_TTL = 10 * 60 * 1000;

const ACCOUNT_RE = /^act_\d{1,20}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{1,24}$/;

// ---------- helpers ----------

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
}

function fail(res, status, message, kind = 'error', code = null) {
  json(res, status, { error: { message, kind, code } });
}

function metaFail(res, err) {
  if (err instanceof MetaError) {
    const status = err.kind === 'token' ? 401 : err.kind === 'permission' ? 403 : err.kind === 'rate' ? 429 : err.kind === 'param' ? 400 : 502;
    return fail(res, status, err.message, err.kind, err.code);
  }
  console.error('[funnel-graph]', err);
  return fail(res, 500, err.message || 'Unexpected error');
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Rejects requests addressed to another host name (DNS rebinding) or sent cross-site. */
function trusted(req) {
  const host = String(req.headers.host || '').toLowerCase();
  // Any port is fine; what matters is that the browser addressed this machine by a local name.
  const okHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host);
  if (!okHost) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const o = new URL(origin);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(o.hostname)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return fail(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return fail(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- Meta session ----------

const session = { accounts: null, accountsAt: 0, user: null };
const detailCache = new Map();

function client(config = loadConfig()) {
  return createMetaClient({ token: config.token, version: config.apiVersion });
}

async function getAccounts(force = false) {
  if (!force && session.accounts && Date.now() - session.accountsAt < ACCOUNT_TTL) return session.accounts;
  session.accounts = await fetchAccounts(client());
  session.accountsAt = Date.now();
  return session.accounts;
}

async function status() {
  const config = loadConfig();
  const out = { ok: true, version: VERSION, connected: false, apiVersion: config.apiVersion, appId: config.appId, user: null, accounts: [], defaultAccount: config.defaultAccount };
  if (!config.token) return out;
  try {
    if (!session.user) session.user = await client(config).get('me', { fields: 'id,name' });
    out.user = session.user;
    out.accounts = await getAccounts();
    out.connected = true;
  } catch (err) {
    out.error = { message: err.message, kind: err.kind || 'error' };
    if (err.kind !== 'token') out.connected = true;
  }
  return out;
}

// ---------- routes ----------

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const q = url.searchParams;
  switch (route) {
    case 'GET /api/status':
      return json(res, 200, await status());

    case 'POST /api/connect': {
      const body = await readBody(req);
      const token = String(body.token || '').trim();
      if (!/^[A-Za-z0-9_\-.|]{20,1024}$/.test(token)) return fail(res, 400, 'That does not look like a Meta access token.', 'token');
      const config = loadConfig();
      const probe = createMetaClient({ token, version: config.apiVersion });
      try {
        const me = await probe.get('me', { fields: 'id,name' });
        const accounts = await fetchAccounts(probe);
        saveConfig({ token, user: me, defaultAccount: accounts[0]?.id || null });
        Object.assign(session, { user: me, accounts, accountsAt: Date.now() });
        detailCache.clear();
        return json(res, 200, await status());
      } catch (err) {
        return metaFail(res, err);
      }
    }

    case 'POST /api/disconnect':
      clearToken();
      Object.assign(session, { user: null, accounts: null, accountsAt: 0 });
      detailCache.clear();
      return json(res, 200, { ok: true });

    case 'POST /api/config': {
      const body = await readBody(req);
      const patch = {};
      if (body.defaultAccount !== undefined) {
        if (body.defaultAccount !== null && !ACCOUNT_RE.test(body.defaultAccount)) return fail(res, 400, 'Invalid account id');
        patch.defaultAccount = body.defaultAccount;
      }
      if (body.apiVersion !== undefined) {
        if (!/^v\d{2}\.\d$/.test(body.apiVersion)) return fail(res, 400, 'Invalid API version');
        patch.apiVersion = body.apiVersion;
      }
      if (body.appId !== undefined) {
        if (body.appId !== null && !ID_RE.test(body.appId)) return fail(res, 400, 'Invalid app id');
        patch.appId = body.appId;
      }
      saveConfig(patch);
      return json(res, 200, { ok: true });
    }

    case 'GET /api/accounts':
      try {
        return json(res, 200, { accounts: await getAccounts(q.get('refresh') === '1') });
      } catch (err) {
        return metaFail(res, err);
      }

    case 'GET /api/snapshot': {
      const account = q.get('account');
      const since = q.get('since');
      const until = q.get('until');
      if (!ACCOUNT_RE.test(account || '') || !DAY_RE.test(since || '') || !DAY_RE.test(until || '') || since > until) {
        return fail(res, 400, 'Invalid account or date range');
      }
      const config = loadConfig();
      if (!config.token) return fail(res, 401, 'Connect Meta first', 'token');
      const cacheName = `snapshot_${account}_${since}_${until}.json`;
      if (q.get('refresh') !== '1') {
        const cached = readCache(cacheName, SNAPSHOT_TTL);
        if (cached) return json(res, 200, { ...cached, cached: true });
      }
      try {
        const snap = await fetchSnapshot(client(config), { account, since, until });
        writeCache(cacheName, snap);
        return json(res, 200, snap);
      } catch (err) {
        return metaFail(res, err);
      }
    }

    case 'GET /api/detail': {
      const account = q.get('account');
      const since = q.get('since');
      const until = q.get('until');
      const ads = String(q.get('ads') || '').split(',').filter(Boolean);
      if (!ACCOUNT_RE.test(account || '') || !DAY_RE.test(since || '') || !DAY_RE.test(until || '') || since > until) {
        return fail(res, 400, 'Invalid account or date range');
      }
      if (!ads.length || ads.length > 500 || !ads.every((id) => ID_RE.test(id))) return fail(res, 400, 'Invalid ad ids');
      const key = [account, since, until, q.get('video') === '1' ? 'v' : '', ads.join(',')].join('|');
      const hit = detailCache.get(key);
      if (hit && Date.now() - hit.at < DETAIL_TTL) return json(res, 200, hit.data);
      try {
        const data = await fetchDetail(client(), { account, adIds: ads, since, until, video: q.get('video') === '1' });
        detailCache.set(key, { at: Date.now(), data });
        if (detailCache.size > 200) detailCache.delete(detailCache.keys().next().value);
        return json(res, 200, data);
      } catch (err) {
        return metaFail(res, err);
      }
    }

    case 'POST /api/cache/clear':
      clearCache();
      detailCache.clear();
      session.accounts = null;
      return json(res, 200, { ok: true });

    default:
      return fail(res, 404, 'Unknown endpoint');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return fail(res, 400, 'Bad request');
    }
    if (url.pathname === '/api/ping') return json(res, 200, { ok: true, app: 'creative-funnel-graph', version: VERSION });
    if (!trusted(req)) return fail(res, 403, 'Forbidden');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-funnel-graph'] !== '1') return fail(res, 403, 'Missing app header');
        return await handleApi(req, res, url);
      }
      if (url.pathname === '/img' && req.method === 'GET') return await proxyImage(url.searchParams.get('u') || '', res);
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      console.error('[funnel-graph]', err.message);
      if (!res.headersSent) fail(res, 500, err.message);
    }
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const fallback = () => console.log(`Open ${url} in your browser.`);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    // A missing launcher (no xdg-open) is reported asynchronously; it must not stop the server.
    child.on('error', fallback);
    child.unref();
  } catch {
    fallback();
  }
}

/** Reads `--name value`; the last occurrence wins, so flags typed after a wrapper's defaults apply. */
export function argValue(argv, name) {
  const i = argv.lastIndexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function alreadyRunning(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(1500) });
    const body = await r.json();
    return body.app === 'creative-funnel-graph';
  } catch {
    return false;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const port = Number(argValue(argv, '--port') || process.env.PORT || 4747);
  const host = argValue(argv, '--host') || '127.0.0.1';
  const open = argv.includes('--open');
  const url = `http://127.0.0.1:${port}`;

  const server = createServer();
  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE' && (await alreadyRunning(port))) {
      console.log(`Creative Funnel Graph is already running at ${url}`);
      if (open) openBrowser(url);
      process.exit(0);
    }
    console.error(`Could not start on port ${port}: ${err.message}`);
    process.exit(1);
  });
  const pidFile = path.join(homeDir(), 'server.pid');
  server.listen(port, host, () => {
    console.log(`Creative Funnel Graph ${VERSION} running at ${url} (read-only, data stays on this computer)`);
    try {
      fs.mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
      fs.writeFileSync(pidFile, String(process.pid));
    } catch {
      // The installer only uses the pid file to stop an old copy.
    }
    if (open) openBrowser(url);
  });
  const stop = () => {
    try {
      if (fs.readFileSync(pidFile, 'utf8') === String(process.pid)) fs.unlinkSync(pidFile);
    } catch {
      // Already gone.
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    console.error('Creative Funnel Graph needs Node.js 18 or newer.');
    process.exit(1);
  }
  main();
}
