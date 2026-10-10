import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestFiles } from '../scripts/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('MANIFEST lists exactly the files the installer needs (run: node scripts/manifest.mjs)', () => {
  const listed = fs.readFileSync(path.join(ROOT, 'MANIFEST'), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(listed, manifestFiles());
  for (const f of listed) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test('every module the app imports is in MANIFEST', () => {
  const listed = new Set(fs.readFileSync(path.join(ROOT, 'MANIFEST'), 'utf8').split('\n').filter(Boolean));
  for (const f of listed) {
    if (!/\.(m?js)$/.test(f)) continue;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?:import|from)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      assert.ok(listed.has(target), `${f} imports ${target}, missing from MANIFEST`);
    }
  }
});
