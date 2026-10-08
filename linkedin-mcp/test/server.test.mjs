import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createContext, createLinkedInServer } from '../src/server.js';
import { fakeFetch, json, linkedInRoutes, tempDir, testEnv } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function connect(extraRoutes = []) {
  const dir = await tempDir();
  const fetchImpl = fakeFetch(linkedInRoutes(extraRoutes));
  const ctx = createContext({ env: testEnv(dir), fetchImpl, sleep: async () => {} });
  const server = createLinkedInServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content[0].text;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { isError: Boolean(result.isError), data, text };
  };
  return { client, call, ctx, fetchImpl };
}

test('exposes the LinkedIn tools and prompts', async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'linkedin_add_comment',
    'linkedin_delete_draft',
    'linkedin_delete_post',
    'linkedin_edit_post',
    'linkedin_get_draft',
    'linkedin_get_profile',
    'linkedin_list_drafts',
    'linkedin_list_published',
    'linkedin_preview_post',
    'linkedin_publish_draft',
    'linkedin_publish_post',
    'linkedin_save_draft',
  ]);
  const publishTool = tools.find((t) => t.name === 'linkedin_publish_post');
  assert.ok(publishTool.inputSchema.properties.images);
  assert.equal(publishTool.annotations.openWorldHint, true);
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ['linkedin_content_plan', 'repurpose_for_linkedin', 'write_linkedin_post']);
  const prompt = await client.getPrompt({ name: 'write_linkedin_post', arguments: { topic: 'AI offline a Tirana' } });
  assert.match(prompt.messages[0].content.text, /AI offline a Tirana/);
});

test('preview never calls LinkedIn and returns the final text', async () => {
  const { call, fetchImpl } = await connect();
  const { isError, data } = await call('linkedin_preview_post', { text: '**Hook forte**\n\nCorpo del post #AI' });
  assert.equal(isError, false);
  assert.equal(data.finalText, '𝗛𝗼𝗼𝗸 𝗳𝗼𝗿𝘁𝗲\n\nCorpo del post #AI');
  assert.equal(data.type, 'text');
  assert.equal(data.readyToPublish, true);
  assert.equal(fetchImpl.calls.length, 0);
});

test('draft lifecycle through MCP: save, list, get, publish', async () => {
  const { call, fetchImpl } = await connect();
  const saved = await call('linkedin_save_draft', { title: 'Lancio', post: { text: 'Bozza (v1)', firstComment: 'https://x.it' } });
  assert.equal(saved.isError, false);
  const id = saved.data.draft.id;

  const list = await call('linkedin_list_drafts');
  assert.deepEqual(list.data.map((d) => [d.id, d.type, d.title]), [[id, 'text', 'Lancio']]);

  const edited = await call('linkedin_save_draft', { id, post: { text: 'Bozza (v2)' } });
  assert.equal(edited.data.draft.post.text, 'Bozza (v2)');

  const published = await call('linkedin_publish_draft', { id });
  assert.equal(published.isError, false);
  assert.equal(published.data.draftId, id);
  assert.equal(published.data.url, 'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001/');
  assert.equal(fetchImpl.calls.find((c) => c.url.endsWith('/rest/posts')).json.commentary, 'Bozza \\(v2\\)');

  assert.deepEqual((await call('linkedin_list_drafts')).data, []);
  const history = await call('linkedin_list_published');
  assert.equal(history.data[0].urn, 'urn:li:share:7000000000000000001');
});

test('edit and delete hit the right endpoints with Rest.li methods', async () => {
  const { call, fetchImpl } = await connect([
    ['POST', '/rest/posts/urn%3Ali%3Ashare%3A42', () => new Response(null, { status: 204 })],
    ['DELETE', '/rest/posts/urn%3Ali%3Ashare%3A42', () => new Response(null, { status: 204 })],
  ]);
  const edit = await call('linkedin_edit_post', { postUrn: 'urn:li:share:42', text: 'Corretto (typo)' });
  assert.equal(edit.isError, false);
  const patch = fetchImpl.calls.find((c) => c.method === 'POST' && c.url.includes('share%3A42'));
  assert.equal(patch.headers['X-RestLi-Method'], 'PARTIAL_UPDATE');
  assert.deepEqual(patch.json, { patch: { $set: { commentary: 'Corretto \\(typo\\)' } } });

  const del = await call('linkedin_delete_post', { postUrn: 'urn:li:share:42' });
  assert.equal(del.isError, false);
  assert.equal(fetchImpl.calls.find((c) => c.method === 'DELETE').headers['X-RestLi-Method'], 'DELETE');
});

test('profile tool reports a missing connection without failing', async () => {
  const dir = await tempDir();
  const ctx = createContext({ env: { LINKEDIN_MCP_HOME: dir }, fetchImpl: fakeFetch([]) });
  const server = createLinkedInServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name: 'linkedin_get_profile', arguments: {} });
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.connected, false);
  assert.match(data.message, /npm run auth/);
});

test('tool errors come back as MCP errors, not crashes', async () => {
  const { call } = await connect([['POST', '/rest/posts', () => json({ message: 'Not enough permissions to access: posts' }, { status: 403 })]]);
  const result = await call('linkedin_publish_post', { text: 'Ciao' });
  assert.equal(result.isError, true);
  assert.match(result.text, /403/);
  assert.match(result.text, /Share on LinkedIn/);
  const invalid = await call('linkedin_delete_post', { postUrn: 'https://linkedin.com/post/1' });
  assert.equal(invalid.isError, true);
});

test('the stdio entry point starts and answers tools/list', async () => {
  const dir = await tempDir();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, 'src/index.js')],
    env: { ...process.env, LINKEDIN_MCP_HOME: dir, LINKEDIN_ACCESS_TOKEN: 'x' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 12);
  await client.close();
});

test('cli without arguments prints help', async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'src/cli.js')], { env: { ...process.env, LINKEDIN_MCP_HOME: await tempDir() } });
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  assert.match(out, /publish-due/);
});
