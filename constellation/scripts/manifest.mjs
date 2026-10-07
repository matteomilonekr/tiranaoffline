// Writes MANIFEST: the files the installer copies or downloads. Run after adding files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['server.mjs', 'package.json', 'lib', 'public', 'macos'];

function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs
    .readdirSync(abs)
    .filter((name) => !name.startsWith('.'))
    .sort()
    .flatMap((name) => walk(path.posix.join(rel, name)));
}

export function manifestFiles() {
  return INCLUDE.flatMap(walk);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = manifestFiles();
  fs.writeFileSync(path.join(ROOT, 'MANIFEST'), files.join('\n') + '\n');
  console.log(`MANIFEST: ${files.length} files`);
}
