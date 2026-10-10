// Builds the static demo (no local server, demo brand only) as a page body plus its
// JS modules, ready to publish as a hosted page. Usage:
//   node scripts/build-demo.mjs [outDir]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist-demo'));

const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');

const pick = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error('index.html is missing ' + label);
  return m[1].trim();
};
const title = pick(/<title>([\s\S]*?)<\/title>/, '<title>');
const importMap = pick(/<script type="importmap">([\s\S]*?)<\/script>/, 'the import map');
const fonts = pick(/(<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>)/, 'the font link');
let body = pick(/<body>([\s\S]*?)<\/body>/, '<body>');
body = body.replace(/<script type="module" src="js\/main\.js"><\/script>/, '').trim();

const page = `<title>${title}</title>
${fonts}
<style>
${css}
/* Hosted demo: the page wrapper already pads for the phone's safe areas. */
.app { padding-top: 10px; padding-bottom: var(--gutter); }
</style>
<script type="importmap">
${importMap}
</script>
<script>window.FUNNEL_GRAPH_STATIC = true;</script>
${body}
<script type="module" src="js/main.js"></script>
`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), page);
fs.cpSync(path.join(PUBLIC, 'js'), path.join(out, 'js'), { recursive: true });

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walk(abs);
    else files.push(path.relative(out, abs).split(path.sep).join('/'));
  }
})(path.join(out, 'js'));
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(Object.fromEntries(files.map((f) => [f, path.join(out, f)])), null, 2));
console.log(`Demo built in ${out}: index.html + ${files.length} modules`);
