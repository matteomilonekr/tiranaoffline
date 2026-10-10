// Same-origin proxy for creative thumbnails, cached on disk. Meta's CDN does not send
// CORS headers, and the browser needs same-origin pixels to compute visual hashes.
// Only Meta CDN hosts are allowed, so this is not an open proxy.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir } from './config.mjs';

const ALLOWED_SUFFIXES = ['.fbcdn.net', '.facebook.com', '.fbsbx.com', '.cdninstagram.com', '.xx.fbcdn.net'];
const MAX_BYTES = 8 * 1024 * 1024;

export function isAllowedImageUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
  return ALLOWED_SUFFIXES.some((s) => host.endsWith(s)) || host === 'fbcdn.net';
}

/** Cache key: path plus the size parameter, ignoring the expiring signature params. */
export function cacheKeyFor(raw) {
  const url = new URL(raw);
  const stable = url.hostname + url.pathname + '|' + (url.searchParams.get('stp') || '') + '|' + (url.searchParams.get('w') || '') + (url.searchParams.get('h') || '');
  return crypto.createHash('sha1').update(stable).digest('hex');
}

function sniffType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

function send(res, buf, type) {
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
}

export async function proxyImage(raw, res, { fetchImpl = globalThis.fetch } = {}) {
  if (!isAllowedImageUrl(raw)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Image host not allowed');
    return;
  }
  const dir = path.join(cacheDir(), 'img');
  const file = path.join(dir, cacheKeyFor(raw));
  try {
    const buf = fs.readFileSync(file);
    const type = sniffType(buf);
    if (type) return send(res, buf, type);
  } catch {
    // Not cached yet.
  }
  try {
    const upstream = await fetchImpl(raw, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) throw new Error('HTTP ' + upstream.status);
    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('too large');
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('too large');
    const type = sniffType(buf);
    if (!type) throw new Error('not an image');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, buf, { mode: 0o600 });
    send(res, buf, type);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Image unavailable: ' + err.message);
  }
}
