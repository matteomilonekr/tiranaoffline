import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetaClient, MetaError } from '../lib/meta-client.mjs';

/** Fake fetch: answers from a list of handlers, records every request. */
function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null;
    calls.push({ method: init.method || 'GET', path: u.pathname, params: Object.fromEntries(u.searchParams), body });
    const [status, payload] = handler(u, init, calls.length);
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { impl, calls };
}

const opts = (fetchImpl) => ({ token: 'EAAToken1234567890', fetchImpl, baseUrl: 'https://graph.test', backoffMs: 1, pollMs: 1 });

test('drops an optional field Meta names in a #100 error and retries', async () => {
  const { impl, calls } = fakeFetch((u) => {
    const fields = u.searchParams.get('fields');
    if (fields.includes('video_play_curve_actions')) return [400, { error: { code: 100, message: '(#100) video_play_curve_actions is not valid for fields param.' } }];
    return [200, { data: [{ spend: '5' }] }];
  });
  const client = createMetaClient(opts(impl));
  const r = await client.insights('act_1', { fields: 'spend,video_play_curve_actions' }, { optionalFields: ['video_play_curve_actions'] });
  assert.deepEqual(r.rows, [{ spend: '5' }]);
  assert.deepEqual(r.dropped, ['video_play_curve_actions']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.params.access_token === 'EAAToken1234567890'));
});

test('a #100 error that names no field drops all optional fields once', async () => {
  const { impl } = fakeFetch((u) => {
    const fields = u.searchParams.get('fields').split(',');
    if (fields.length > 1) return [400, { error: { code: 100, message: '(#100) Invalid parameter' } }];
    return [200, { data: [] }];
  });
  const r = await createMetaClient(opts(impl)).insights('act_1', { fields: 'spend,a,b' }, { optionalFields: ['a', 'b'] });
  assert.deepEqual(r.dropped, ['a', 'b']);
});

test('token errors fail fast and never echo the token', async () => {
  const { impl, calls } = fakeFetch(() => [400, { error: { code: 190, message: 'Error validating access token EAAToken1234567890 has expired' } }]);
  await assert.rejects(createMetaClient(opts(impl)).get('me'), (err) => {
    assert.ok(err instanceof MetaError);
    assert.equal(err.kind, 'token');
    assert.ok(!err.message.includes('EAAToken1234567890'));
    return true;
  });
  assert.equal(calls.length, 1);
});

test('rate limits and transient errors are retried', async () => {
  const { impl, calls } = fakeFetch((u, init, n) => (n < 3 ? [400, { error: { code: n === 1 ? 17 : 2, message: 'User request limit reached' } }] : [200, { id: '1' }]));
  const r = await createMetaClient(opts(impl)).get('me');
  assert.equal(r.id, '1');
  assert.equal(calls.length, 3);
});

test('a report too large for a direct answer runs as an async job', async () => {
  const { impl, calls } = fakeFetch((u, init, n) => {
    if (u.pathname.endsWith('/act_1/insights') && (init.method || 'GET') === 'GET') return [500, { error: { code: 1, message: 'Please reduce the amount of data you are asking for, then retry your request' } }];
    if ((init.method || 'GET') === 'POST') return [200, { report_run_id: '777' }];
    if (u.pathname.endsWith('/777')) return [200, { async_status: 'Job Completed', async_percent_completion: 100 }];
    if (u.pathname.endsWith('/777/insights')) return [200, { data: [{ ad_id: '1' }] }];
    return [404, { error: { code: 100, message: 'nope' } }];
  });
  const r = await createMetaClient(opts(impl)).insights('act_1', { fields: 'ad_id', level: 'ad' });
  assert.deepEqual(r.rows, [{ ad_id: '1' }]);
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.body.access_token, 'EAAToken1234567890', 'POST sends the token in the body, not the URL');
  assert.equal(post.params.access_token, undefined);
});
