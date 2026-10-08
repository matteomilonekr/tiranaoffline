import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPost } from '../src/publisher.js';
import { createContext, publish } from '../src/server.js';
import { created, fakeFetch, json, linkedInRoutes, tempDir, tempFile, testEnv } from './helpers.mjs';

async function setup(extraRoutes = [], env = {}) {
  const dir = await tempDir();
  const fetchImpl = fakeFetch(linkedInRoutes(extraRoutes));
  const ctx = createContext({
    env: testEnv(dir, env),
    fetchImpl,
    sleep: async () => {},
    publishOptions: { retryDelayMs: 0 },
  });
  return { ctx, dir, fetchImpl };
}

const postCall = (fetchImpl) => fetchImpl.calls.find((c) => c.method === 'POST' && c.url.endsWith('/rest/posts'));

test('text post: author from userinfo, versioned headers, escaped commentary', async () => {
  const { ctx, fetchImpl } = await setup();
  const result = await publish(ctx, { text: 'Nuovo evento (Tirana) #AI' });

  assert.equal(result.urn, 'urn:li:share:7000000000000000001');
  assert.equal(result.url, 'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001/');
  const call = postCall(fetchImpl);
  assert.equal(call.headers.Authorization, 'Bearer test-token');
  assert.equal(call.headers['LinkedIn-Version'], '202609');
  assert.equal(call.headers['X-Restli-Protocol-Version'], '2.0.0');
  assert.deepEqual(call.json, {
    author: 'urn:li:person:abc123',
    commentary: 'Nuovo evento \\(Tirana\\) #AI',
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  });
  const history = await ctx.history.list();
  assert.equal(history[0].urn, result.urn);
});

test('single image post uploads the file and references the image URN', async () => {
  const { ctx, dir, fetchImpl } = await setup();
  const file = await tempFile(dir, 'foto.png');
  await publish(ctx, { text: 'Foto', images: [{ source: file, altText: 'Palco' }] });

  const init = fetchImpl.calls.find((c) => c.url.includes('/rest/images?action=initializeUpload'));
  assert.deepEqual(init.json, { initializeUploadRequest: { owner: 'urn:li:person:abc123' } });
  const put = fetchImpl.calls.find((c) => c.method === 'PUT');
  assert.equal(put.headers.Authorization, 'Bearer test-token');
  assert.equal(put.body.length, 1024);
  assert.deepEqual(postCall(fetchImpl).json.content, { media: { id: 'urn:li:image:IMG1', altText: 'Palco' } });
});

test('2+ images become a multiImage post in order', async () => {
  const { ctx, dir, fetchImpl } = await setup();
  const a = await tempFile(dir, 'a.jpg');
  const b = await tempFile(dir, 'b.gif');
  await publish(ctx, { text: 'Gallery', images: [{ source: a }, { source: b, altText: 'B' }] });
  assert.deepEqual(postCall(fetchImpl).json.content, {
    multiImage: { images: [{ id: 'urn:li:image:IMG1' }, { id: 'urn:li:image:IMG2', altText: 'B' }] },
  });
});

test('PDF carousel downloaded from a URL, title defaults to the file name', async () => {
  const { ctx, fetchImpl } = await setup([
    ['GET', 'https://cdn.example.com/', () => new Response(Buffer.alloc(2048, 1), { headers: { 'content-type': 'application/pdf' } })],
  ]);
  await publish(ctx, { text: 'Carousel', document: { source: 'https://cdn.example.com/files/guida-ai.pdf' } });
  assert.deepEqual(postCall(fetchImpl).json.content, { media: { id: 'urn:li:document:DOC1', title: 'guida-ai' } });
});

test('video upload sends every byte range and finalizes with the ETags', async () => {
  const size = 100 * 1024;
  const { ctx, dir, fetchImpl } = await setup([
    [
      'POST',
      '/rest/videos?action=initializeUpload',
      () =>
        json({
          value: {
            video: 'urn:li:video:VID1',
            uploadToken: 'tok',
            uploadInstructions: [
              { uploadUrl: 'https://www.linkedin.com/dms-uploads/v/part0', firstByte: 0, lastByte: 65535 },
              { uploadUrl: 'https://www.linkedin.com/dms-uploads/v/part1', firstByte: 65536, lastByte: size - 1 },
            ],
          },
        }),
    ],
    ['PUT', '/v/part0', () => new Response(null, { status: 200, headers: { etag: '/ambry/part-0.bin' } })],
    ['PUT', '/v/part1', () => new Response(null, { status: 200, headers: { etag: '/ambry/part-1.bin' } })],
    ['POST', '/rest/videos?action=finalizeUpload', () => new Response(null, { status: 200 })],
  ]);
  const file = await tempFile(dir, 'clip.mp4', size);
  await publish(ctx, { text: 'Video', video: { source: file, title: 'Recap' } });

  const init = fetchImpl.calls.find((c) => c.url.includes('videos?action=initializeUpload'));
  assert.equal(init.json.initializeUploadRequest.fileSizeBytes, size);
  const puts = fetchImpl.calls.filter((c) => c.method === 'PUT');
  assert.deepEqual(puts.map((c) => c.body.length), [65536, size - 65536]);
  const finalize = fetchImpl.calls.find((c) => c.url.includes('finalizeUpload'));
  assert.deepEqual(finalize.json, {
    finalizeUploadRequest: { video: 'urn:li:video:VID1', uploadToken: 'tok', uploadedPartIds: ['/ambry/part-0.bin', '/ambry/part-1.bin'] },
  });
  assert.deepEqual(postCall(fetchImpl).json.content, { media: { id: 'urn:li:video:VID1', title: 'Recap' } });
});

test('article: fills title, description and thumbnail from Open Graph tags', async () => {
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="Offline Mode &amp; AI">
    <meta content="Due giorni a Tirana" property="og:description">
    <meta property="og:image" content="/cover.jpg"></head></html>`;
  const { ctx, fetchImpl } = await setup([
    ['GET', 'https://evento.example.com/tirana', () => new Response(html, { headers: { 'content-type': 'text/html' } })],
    ['GET', 'https://evento.example.com/cover.jpg', () => new Response(Buffer.alloc(500, 2), { headers: { 'content-type': 'image/jpeg' } })],
  ]);
  const result = await publish(ctx, { text: 'Iscriviti', article: { url: 'https://evento.example.com/tirana' } });
  assert.deepEqual(postCall(fetchImpl).json.content, {
    article: {
      source: 'https://evento.example.com/tirana',
      title: 'Offline Mode & AI',
      description: 'Due giorni a Tirana',
      thumbnail: 'urn:li:image:IMG1',
    },
  });
  assert.ok(!result.warnings.some((w) => w.includes('thumbnail')));
});

test('article without og:image is still published, with a warning', async () => {
  const { ctx, fetchImpl } = await setup([['GET', 'https://blog.example.com/', () => new Response('<title>Post</title>')]]);
  const result = await publish(ctx, { text: '', article: { url: 'https://blog.example.com/post' } });
  assert.deepEqual(postCall(fetchImpl).json.content, { article: { source: 'https://blog.example.com/post', title: 'Post' } });
  assert.ok(result.warnings.some((w) => w.includes('without thumbnail')));
});

test('poll post with default duration', async () => {
  const { ctx, fetchImpl } = await setup();
  await publish(ctx, { text: 'Dimmi la tua', poll: { question: 'Usi Claude Code?', options: ['Sì', 'No', 'Non ancora'] } });
  assert.deepEqual(postCall(fetchImpl).json.content, {
    poll: { question: 'Usi Claude Code?', options: [{ text: 'Sì' }, { text: 'No' }, { text: 'Non ancora' }], settings: { duration: 'THREE_DAYS' } },
  });
});

test('reshare, organization author and connections-only visibility', async () => {
  const { ctx, fetchImpl } = await setup();
  await publish(ctx, {
    text: 'Da leggere',
    reshareOf: 'urn:li:share:123',
    author: 'urn:li:organization:42',
    visibility: 'CONNECTIONS',
    disableReshare: true,
  });
  const { json: body } = postCall(fetchImpl);
  assert.equal(body.author, 'urn:li:organization:42');
  assert.equal(body.visibility, 'CONNECTIONS');
  assert.equal(body.isReshareDisabledByAuthor, true);
  assert.deepEqual(body.reshareContext, { parent: 'urn:li:share:123' });
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('userinfo')));
});

test('first comment is posted on the new post; a failure does not fail the publish', async () => {
  const ok = await setup();
  const result = await publish(ok.ctx, { text: 'Post', firstComment: 'Link: https://example.com' });
  const comment = ok.fetchImpl.calls.find((c) => c.url.includes('/comments'));
  assert.equal(comment.url, 'https://api.linkedin.com/rest/socialActions/urn%3Ali%3Ashare%3A7000000000000000001/comments');
  assert.deepEqual(comment.json, {
    actor: 'urn:li:person:abc123',
    object: 'urn:li:share:7000000000000000001',
    message: { text: 'Link: https://example.com' },
  });
  assert.equal(result.firstComment.ok, true);

  const failing = await setup([['POST', '/comments', () => json({ message: 'Not enough permissions' }, { status: 403 })]]);
  const partial = await publish(failing.ctx, { text: 'Post', firstComment: 'ciao' });
  assert.equal(partial.urn, 'urn:li:share:7000000000000000001');
  assert.equal(partial.firstComment.ok, false);
  assert.match(partial.firstComment.error, /403/);
});

test('retries post creation while LinkedIn is still processing the media', async () => {
  let attempts = 0;
  const { ctx, dir } = await setup([
    [
      'POST',
      '/rest/posts',
      () => {
        attempts += 1;
        return attempts < 3 ? json({ message: 'Media asset is PROCESSING' }, { status: 400 }) : created('urn:li:ugcPost:9');
      },
    ],
  ]);
  const file = await tempFile(dir, 'deck.pdf');
  const result = await publish(ctx, { text: 'Deck', document: { source: file } });
  assert.equal(attempts, 3);
  assert.equal(result.urn, 'urn:li:ugcPost:9');
});

test('asset status polling tolerates tokens that cannot read assets', async () => {
  const { ctx, dir } = await setup([['GET', /\/rest\/images\//, () => json({ message: 'forbidden' }, { status: 403 })]]);
  const file = await tempFile(dir, 'x.jpg');
  const result = await publish(ctx, { text: 'Img', images: [{ source: file }] });
  assert.equal(result.type, 'image');
});

test('API errors carry a useful hint and nothing is logged as published', async () => {
  const { ctx } = await setup([['POST', '/rest/posts', () => json({ message: 'Invalid access token' }, { status: 401 })]]);
  await assert.rejects(publish(ctx, { text: 'x' }), (err) => {
    assert.equal(err.status, 401);
    assert.match(err.message, /npm run auth/);
    return true;
  });
  assert.deepEqual(await ctx.history.list(), []);
});

test('validation catches problems before any network call', async () => {
  const { ctx, fetchImpl } = await setup();
  await assert.rejects(publish(ctx, { text: 'x'.repeat(3001) }), /3000/);
  await assert.rejects(publish(ctx, { text: 'x', poll: { question: 'Q?', options: ['solo una'] } }), /2-4 options/);
  await assert.rejects(publish(ctx, { text: 'x', images: [{ source: 'a.webp' }], poll: { question: 'q', options: ['a', 'b'] } }), /only one kind/);
  await assert.rejects(publish(ctx, { text: '   ' }), /text is required/);
  await assert.rejects(publish(ctx, { text: 'x', images: [{ source: '/nope/missing.png' }] }), /File not found/);
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/rest/')).length, 0);
});

test('unsupported media formats are rejected with the supported list', async () => {
  const { ctx, dir } = await setup();
  const file = await tempFile(dir, 'foto.webp');
  await assert.rejects(publish(ctx, { text: 'x', images: [{ source: file }] }), /\.jpg, \.jpeg, \.png, \.gif/);
});

test('inspectPost reports type and errors without throwing', () => {
  const inspected = inspectPost({ text: '**Hook**', poll: { question: 'Q', options: ['a', 'b', 'c', 'd', 'e'] } });
  assert.equal(inspected.type, 'poll');
  assert.equal(inspected.visible, '𝗛𝗼𝗼𝗸');
  assert.deepEqual(inspected.errors, ['A poll needs 2-4 options.']);
});
