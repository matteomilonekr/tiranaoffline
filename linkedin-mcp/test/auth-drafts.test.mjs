import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { AuthError, buildAuthorizationUrl, exchangeCode, TokenProvider } from '../src/auth.js';
import { main, parseCallback } from '../src/cli.js';
import { getConfig } from '../src/config.js';
import { DraftStore } from '../src/drafts.js';
import { createContext } from '../src/server.js';
import { JsonStore } from '../src/store.js';
import { fakeFetch, json, linkedInRoutes, tempDir, testEnv } from './helpers.mjs';

test('authorization URL carries client, redirect, state and space-separated scopes', () => {
  const url = new URL(
    buildAuthorizationUrl({ clientId: 'cid', redirectUri: 'http://localhost:8765/callback', scopes: ['openid', 'w_member_social'], state: 's1' }),
  );
  assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:8765/callback');
  assert.equal(url.searchParams.get('scope'), 'openid w_member_social');
  assert.equal(url.searchParams.get('state'), 's1');
});

test('callback parsing checks state and surfaces LinkedIn errors', () => {
  assert.equal(parseCallback(new URL('http://localhost/callback?code=abc&state=s1'), 's1'), 'abc');
  assert.throws(() => parseCallback(new URL('http://localhost/callback?code=abc&state=evil'), 's1'), /state/);
  assert.throws(
    () => parseCallback(new URL('http://localhost/callback?error=user_cancelled_authorize&error_description=Annullato&state=s1'), 's1'),
    /Annullato/,
  );
});

test('code exchange posts a form and converts expires_in to a timestamp', async () => {
  const fetchImpl = fakeFetch([
    ['POST', '/oauth/v2/accessToken', () => json({ access_token: 'AT', expires_in: 5184000, scope: 'openid,profile,w_member_social' })],
  ]);
  const before = Date.now();
  const token = await exchangeCode({ code: 'c', clientId: 'id', clientSecret: 'sec', redirectUri: 'http://localhost:8765/callback' }, fetchImpl);
  const form = new URLSearchParams(fetchImpl.calls[0].body);
  assert.equal(fetchImpl.calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('client_secret'), 'sec');
  assert.equal(token.accessToken, 'AT');
  assert.ok(token.expiresAt >= before + 5184000 * 1000);
});

test('token provider: env wins, missing or expired tokens explain how to reconnect', async () => {
  const dir = await tempDir();
  const store = new JsonStore(dir);
  const envProvider = new TokenProvider({ config: getConfig(testEnv(dir)), store });
  assert.equal((await envProvider.getToken()).accessToken, 'test-token');

  const provider = new TokenProvider({ config: getConfig({ LINKEDIN_MCP_HOME: dir }), store });
  await assert.rejects(provider.getToken(), (err) => err instanceof AuthError && /npm run auth/.test(err.message));

  await store.write('token', { accessToken: 'old', expiresAt: Date.now() - 1000 });
  await assert.rejects(provider.getToken(), /expired/);

  await store.write('token', { accessToken: 'fresh', expiresAt: Date.now() + 86_400_000, personUrn: 'urn:li:person:p1' });
  assert.equal((await provider.getToken()).personUrn, 'urn:li:person:p1');
});

test('token provider refreshes when a refresh token and client credentials exist', async () => {
  const dir = await tempDir();
  const store = new JsonStore(dir);
  await store.write('token', { accessToken: 'old', expiresAt: Date.now() - 1000, refreshToken: 'RT', personUrn: 'urn:li:person:p1' });
  const fetchImpl = fakeFetch([['POST', '/accessToken', () => json({ access_token: 'new', expires_in: 3600 })]]);
  const provider = new TokenProvider({
    config: getConfig({ LINKEDIN_MCP_HOME: dir, LINKEDIN_CLIENT_ID: 'id', LINKEDIN_CLIENT_SECRET: 'sec' }),
    store,
    fetchImpl,
  });
  const token = await provider.getToken();
  assert.equal(token.accessToken, 'new');
  assert.equal(token.refreshToken, 'RT');
  assert.equal(new URLSearchParams(fetchImpl.calls[0].body).get('grant_type'), 'refresh_token');
  assert.equal((await store.read('token')).accessToken, 'new');
});

test('drafts: create, update, schedule, list order and delete', async () => {
  const drafts = new DraftStore(new JsonStore(await tempDir()));
  const a = await drafts.save({ post: { text: 'A' }, title: 'Primo' });
  const b = await drafts.save({ post: { text: 'B' }, scheduledFor: '2026-10-12T08:30:00+02:00' });
  assert.match(a.id, /^d_[0-9a-f]{8}$/);
  assert.equal(b.scheduledFor, '2026-10-12T06:30:00.000Z');

  const updated = await drafts.save({ id: a.id, notes: 'rivedere hook' });
  assert.equal(updated.post.text, 'A');
  assert.equal(updated.title, 'Primo');
  assert.equal(updated.notes, 'rivedere hook');

  assert.deepEqual((await drafts.list()).map((d) => d.id), [b.id, a.id]);
  await assert.rejects(drafts.save({ scheduledFor: 'domani' , post: { text: 'x' } }), /ISO 8601/);
  await assert.rejects(drafts.save({ id: 'd_missing', notes: 'x' }), /not found/);
  await drafts.remove(a.id);
  assert.deepEqual((await drafts.list()).map((d) => d.id), [b.id]);
});

test('concurrent draft saves are not lost', async () => {
  const drafts = new DraftStore(new JsonStore(await tempDir()));
  await Promise.all(Array.from({ length: 10 }, (_, i) => drafts.save({ post: { text: `post ${i}` } })));
  assert.equal((await drafts.list()).length, 10);
});

test('a claimed draft is not due again and cannot be claimed twice', async () => {
  const drafts = new DraftStore(new JsonStore(await tempDir()));
  const draft = await drafts.save({ post: { text: 'x' }, scheduledFor: '2020-01-01T00:00:00Z' });
  assert.equal((await drafts.due()).length, 1);
  await drafts.claim(draft.id);
  assert.equal((await drafts.due()).length, 0);
  await assert.rejects(drafts.claim(draft.id), /already being published/);
  await drafts.release(draft.id);
  assert.equal((await drafts.due()).length, 1);
});

test('cli publish-due publishes only due drafts and removes them', async (t) => {
  const dir = await tempDir();
  const fetchImpl = fakeFetch(linkedInRoutes());
  const ctx = createContext({ env: testEnv(dir), fetchImpl, sleep: async () => {} });
  const due = await ctx.drafts.save({ post: { text: 'Scaduto' }, scheduledFor: '2020-01-01T08:00:00Z' });
  const future = await ctx.drafts.save({ post: { text: 'Futuro' }, scheduledFor: '2999-01-01T08:00:00Z' });
  const unscheduled = await ctx.drafts.save({ post: { text: 'Senza data' } });
  t.mock.method(console, 'log', () => {});

  assert.equal(await main(['publish-due'], ctx), 0);
  assert.deepEqual((await ctx.drafts.list()).map((d) => d.id).sort(), [future.id, unscheduled.id].sort());
  const posts = fetchImpl.calls.filter((c) => c.url.endsWith('/rest/posts'));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].json.commentary, 'Scaduto');
  assert.ok(!(await ctx.drafts.list()).some((d) => d.id === due.id));
});

test('token file is written with owner-only permissions', async () => {
  const dir = await tempDir();
  const store = new JsonStore(dir);
  await store.write('token', { accessToken: 'secret' });
  const { mode } = await fs.stat(store.file('token'));
  assert.equal(mode & 0o777, 0o600);
});
