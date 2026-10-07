import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GOOD = 'EAAGoodTokenForTests1234567890abcdef';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'constellation-test-'));
process.env.CONSTELLATION_HOME = home;
delete process.env.META_ACCESS_TOKEN;

const calls = [];

function graphError(res, status, code, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message, code, type: 'OAuthException', fbtrace_id: 'x' } }));
}

function ok(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// A small stand-in for graph.facebook.com.
const graph = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://graph.local');
  const p = url.pathname.replace(/^\/v\d+\.\d+/, '');
  const q = url.searchParams;
  calls.push({ method: req.method, path: p, params: Object.fromEntries(q) });
  if (q.get('access_token') !== GOOD) return graphError(res, 400, 190, 'Invalid OAuth access token.');

  if (p === '/me') return ok(res, { id: '42', name: 'Test Owner' });
  if (p === '/me/adaccounts') return ok(res, { data: [{ id: 'act_123', account_id: '123', name: 'Glow Co', currency: 'EUR', timezone_name: 'Europe/Rome', account_status: 1 }] });
  if (p === '/act_123' && !q.get('ids')) return ok(res, { id: 'act_123', name: 'Glow Co', currency: 'EUR', timezone_name: 'Europe/Rome' });
  if (p === '/act_123/insights') {
    const breakdowns = q.get('breakdowns');
    const fields = q.get('fields') || '';
    if (breakdowns === 'user_segment_key') {
      return ok(res, {
        data: [
          { ad_id: '11', user_segment_key: 'prospecting', spend: '80' },
          { ad_id: '11', user_segment_key: 'engaged_audience', spend: '15' },
          { ad_id: '11', user_segment_key: 'existing_customers', spend: '5' },
          { ad_id: '12', user_segment_key: 'existing_customers', spend: '40' },
          { ad_id: '12', user_segment_key: 'new', spend: '10' },
        ],
      });
    }
    if (breakdowns === 'publisher_platform,platform_position') {
      return ok(res, {
        data: [
          { publisher_platform: 'facebook', platform_position: 'feed', spend: '20', impressions: '1000', action_values: [{ action_type: 'omni_purchase', value: '60' }] },
          { publisher_platform: 'instagram', platform_position: 'instagram_reels', spend: '50', impressions: '3000', action_values: [{ action_type: 'omni_purchase', value: '90' }] },
        ],
      });
    }
    if (q.get('time_increment') === '1') {
      return ok(res, {
        data: [
          { date_start: '2026-09-01', spend: '30', impressions: '1500', action_values: [{ action_type: 'omni_purchase', value: '75' }] },
          { date_start: '2026-09-03', spend: '40', impressions: '2500', action_values: [{ action_type: 'omni_purchase', value: '75' }] },
        ],
      });
    }
    if (fields.includes('video_play_curve_actions')) {
      return ok(res, {
        data: [{ impressions: '4000', actions: [{ action_type: 'video_view', value: '1200' }], video_thruplay_watched_actions: [{ action_type: 'video_view', value: '300' }], video_play_curve_actions: [{ action_type: 'video_view', value: [100, 70, 55, 48, 40] }] }],
      });
    }
    if (q.get('level') === 'ad') {
      const page2 = q.get('after') === 'p2';
      const row = (id, extra = {}) => ({
        ad_id: id,
        ad_name: `2026-09_UGC_PainPoint_Moms_@ana_H${id}`,
        adset_id: '9',
        adset_name: 'Advantage+ audience',
        campaign_id: '8',
        campaign_name: 'ASC Evergreen',
        objective: 'OUTCOME_SALES',
        spend: '100',
        impressions: '5000',
        reach: '4000',
        clicks: '90',
        inline_link_clicks: '60',
        actions: [
          { action_type: 'omni_purchase', value: '4' },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' },
          { action_type: 'video_view', value: '1500' },
        ],
        action_values: [
          { action_type: 'omni_purchase', value: '260.5' },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '260.5' },
        ],
        ...extra,
      });
      if (!page2) {
        return ok(res, {
          data: [row('11', { video_thruplay_watched_actions: [{ action_type: 'video_view', value: '400' }] }), row('12')],
          paging: { next: `http://${req.headers.host}${url.pathname}?${q.toString()}&after=p2` },
        });
      }
      return ok(res, { data: [row('13', { spend: '50' })] });
    }
    return ok(res, { data: [] });
  }
  if (p === '/' && q.get('ids')) {
    const ids = q.get('ids').split(',');
    const out = {};
    for (const id of ids) {
      if (['11', '12', '13'].includes(id)) out[id] = { id, name: 'Ad ' + id, effective_status: id === '13' ? 'PAUSED' : 'ACTIVE', creative: { id: 'c' + id } };
      if (id === 'c11') out[id] = { id, object_type: 'VIDEO', video_id: 'v1', thumbnail_url: 'https://scontent.xx.fbcdn.net/v/t1/abc.jpg?stp=dst-jpg_p480x480&oh=1', body: 'Stop scrolling.' };
      if (id === 'c12') out[id] = { id, object_type: 'SHARE', image_hash: 'hash12', image_url: 'https://scontent.xx.fbcdn.net/v/t1/def.jpg', thumbnail_url: 'https://scontent.xx.fbcdn.net/v/t1/def_t.jpg' };
      if (id === 'c13') out[id] = { id, object_type: 'SHARE', object_story_spec: { link_data: { child_attachments: [{ image_hash: 'a' }, { image_hash: 'b' }], picture: 'https://scontent.xx.fbcdn.net/v/t1/car.jpg' } } };
    }
    return ok(res, out);
  }
  return graphError(res, 404, 100, 'Unknown path ' + p);
});

let server;
let base;

async function api(pathname, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: { 'X-Constellation': '1', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  await new Promise((r) => graph.listen(0, '127.0.0.1', r));
  process.env.META_GRAPH_URL = `http://127.0.0.1:${graph.address().port}`;
  const { createServer } = await import('../server.mjs');
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => graph.close(r));
  fs.rmSync(home, { recursive: true, force: true });
});

test('ping needs nothing; API needs the app header and a local Host', async () => {
  assert.equal((await fetch(base + '/api/ping').then((r) => r.json())).app, 'constellation');
  assert.equal((await fetch(base + '/api/status')).status, 403);
  const rebound = await new Promise((resolve) => {
    const req = http.request(base + '/api/status', { headers: { Host: 'evil.example:80', 'X-Constellation': '1' } }, (res) => resolve(res.statusCode));
    req.end();
  });
  assert.equal(rebound, 403);
  const cross = await api('/api/disconnect', { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
});

test('serves the app and refuses path traversal', async () => {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<canvas id="scene"/);
  const js = await fetch(base + '/js/main.js');
  assert.match(js.headers.get('content-type'), /javascript/);
  const escape = await fetch(base + '/%2e%2e/server.mjs');
  assert.equal(escape.status, 404);
});

test('status starts disconnected; a bad token is rejected', async () => {
  const s = await api('/api/status');
  assert.equal(s.status, 200);
  assert.equal(s.data.connected, false);
  const bad = await api('/api/connect', { method: 'POST', body: { token: 'EAAWrongTokenValue1234567890' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error.kind, 'token');
  const junk = await api('/api/connect', { method: 'POST', body: { token: 'nope' } });
  assert.equal(junk.status, 400);
});

test('connect stores the token owner-only and lists ad accounts', async () => {
  const r = await api('/api/connect', { method: 'POST', body: { token: GOOD } });
  assert.equal(r.status, 200);
  assert.equal(r.data.connected, true);
  assert.equal(r.data.user.name, 'Test Owner');
  assert.deepEqual(r.data.accounts.map((a) => a.id), ['act_123']);
  const file = path.join(home, 'config.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).token, GOOD);
  // The token never comes back to the browser.
  assert.ok(!JSON.stringify(r.data).includes(GOOD));
});

test('snapshot normalizes ads, creatives, purchases and segments', async () => {
  assert.equal((await api('/api/snapshot?account=act_123&since=2026-09-01&until=bad')).status, 400);
  assert.equal((await api('/api/snapshot?account=123&since=2026-09-01&until=2026-09-14')).status, 400);
  const r = await api('/api/snapshot?account=act_123&since=2026-09-01&until=2026-09-14');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const snap = r.data;
  assert.equal(snap.account.currency, 'EUR');
  assert.equal(snap.ads.length, 3, 'second page followed');
  assert.equal(snap.segmentsAvailable, true);
  const [a11, a12, a13] = ['11', '12', '13'].map((id) => snap.ads.find((a) => a.id === id));
  assert.deepEqual(a11.segments, { new: 80, engaged: 15, existing: 5 });
  assert.deepEqual(a12.segments, { new: 10, engaged: 0, existing: 40 });
  assert.equal(a13.segments, null);
  assert.equal(a11.metrics.purchases, 4, 'omni_purchase only, not double counted');
  assert.equal(a11.metrics.purchaseValue, 260.5);
  assert.equal(a11.metrics.video3s, 1500);
  assert.equal(a11.metrics.thruplays, 400);
  assert.equal(a11.creative.type, 'video');
  assert.equal(a11.creative.assetKey, 'v:v1');
  assert.equal(a12.creative.type, 'image');
  assert.equal(a12.creative.assetKey, 'i:hash12');
  assert.equal(a13.creative.type, 'carousel');
  assert.equal(a13.status, 'PAUSED');
  // Thumbnails were requested at a usable size.
  const creativeCall = calls.find((c) => c.params.ids?.includes('c11'));
  assert.equal(creativeCall.params.thumbnail_width, '480');
  // Every call to Meta was a read.
  assert.ok(calls.every((c) => c.method === 'GET'));

  const again = await api('/api/snapshot?account=act_123&since=2026-09-01&until=2026-09-14');
  assert.equal(again.data.cached, true);
});

test('detail aggregates daily spend, placements and the retention curve', async () => {
  assert.equal((await api('/api/detail?account=act_123&since=2026-09-01&until=2026-09-03&ads=abc')).status, 400);
  const r = await api('/api/detail?account=act_123&since=2026-09-01&until=2026-09-03&ads=11,12&video=1');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.daily.map((d) => d.date), ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.equal(r.data.daily[1].spend, 0);
  assert.equal(r.data.daily[2].purchaseValue, 75);
  assert.equal(r.data.placements[0].position, 'instagram_reels');
  assert.deepEqual(r.data.video.curve, [100, 70, 55, 48, 40]);
  assert.equal(r.data.video.video3s, 1200);
  const filterCall = calls.find((c) => c.params.time_increment === '1');
  assert.deepEqual(JSON.parse(filterCall.params.filtering), [{ field: 'ad.id', operator: 'IN', value: ['11', '12'] }]);
});

test('image proxy only fetches from Meta CDN hosts', async () => {
  const r = await fetch(base + '/img?u=' + encodeURIComponent('https://example.com/a.jpg'));
  assert.equal(r.status, 400);
  const local = await fetch(base + '/img?u=' + encodeURIComponent('http://127.0.0.1:1/a.jpg'));
  assert.equal(local.status, 400);
});

test('disconnect forgets the token', async () => {
  const r = await api('/api/disconnect', { method: 'POST' });
  assert.equal(r.status, 200);
  const s = await api('/api/status');
  assert.equal(s.data.connected, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8')).token, undefined);
});
