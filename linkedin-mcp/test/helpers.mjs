import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Fake fetch: routes are [method, matcher, handler]. Every call is recorded
 * with its parsed JSON body so tests can assert on what LinkedIn would receive.
 */
export function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    const href = String(url);
    let json;
    if (typeof init.body === 'string') {
      try {
        json = JSON.parse(init.body);
      } catch {
        json = undefined;
      }
    }
    const call = { method, url: href, headers: init.headers || {}, body: init.body, json };
    calls.push(call);
    for (const [routeMethod, matcher, handle] of routes) {
      const matches = typeof matcher === 'string' ? href.includes(matcher) : matcher.test(href);
      if (routeMethod === method && matches) return handle(call);
    }
    return new Response(JSON.stringify({ message: `No fake route for ${method} ${href}` }), { status: 404 });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

export const json = (data, init = {}) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

export const created = (id) => new Response(null, { status: 201, headers: { 'x-restli-id': id } });

export async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'linkedin-mcp-test-'));
}

export async function tempFile(dir, name, size = 1024) {
  const file = path.join(dir, name);
  await fs.writeFile(file, Buffer.alloc(size, 7));
  return file;
}

/** Standard LinkedIn routes used by most publish tests. */
export function linkedInRoutes(extra = []) {
  let imageCount = 0;
  return [
    ...extra,
    ['GET', '/v2/userinfo', () => json({ sub: 'abc123', name: 'Matteo Test', email: 'm@example.com' })],
    [
      'POST',
      '/rest/images?action=initializeUpload',
      () => {
        imageCount += 1;
        return json({ value: { uploadUrl: `https://www.linkedin.com/dms-uploads/img${imageCount}`, image: `urn:li:image:IMG${imageCount}` } });
      },
    ],
    [
      'POST',
      '/rest/documents?action=initializeUpload',
      () => json({ value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/doc1', document: 'urn:li:document:DOC1' } }),
    ],
    ['PUT', 'https://www.linkedin.com/dms-uploads/', () => new Response(null, { status: 201 })],
    ['GET', /\/rest\/(images|documents|videos)\//, () => json({ status: 'AVAILABLE' })],
    ['POST', '/rest/posts', () => created('urn:li:share:7000000000000000001')],
    [
      'POST',
      '/comments',
      () => json({ id: '555', commentUrn: 'urn:li:comment:(urn:li:activity:1,555)' }, { status: 201 }),
    ],
  ];
}

export const testEnv = (dataDir, extra = {}) => ({
  LINKEDIN_ACCESS_TOKEN: 'test-token',
  LINKEDIN_MCP_HOME: dataDir,
  ...extra,
});
