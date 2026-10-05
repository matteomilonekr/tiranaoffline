import { defineConfig, normalizePath, type Plugin } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
// out/ is served too, so the preview can play the SFX mix (?mix=1 plays out/mix.wav)
const assetDirs = ['audio', 'data', 'out'];

// Git can check out directory symlinks as plain files on Windows. Serve the
// original assets through Vite and copy them into builds without using symlinks.
function repoAssets(): Plugin {
  return {
    name: 'repo-assets',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (assetDirs.some((dir) => req.url?.startsWith(`/${dir}/`))) {
          req.url = `/@fs/${encodeURI(normalizePath(repoRoot))}${req.url}`;
        }
        next();
      });
    },
    writeBundle(options) {
      if (!options.dir) return;
      for (const dir of ['audio', 'data']) {
        if (existsSync(path.join(repoRoot, dir))) cpSync(path.join(repoRoot, dir), path.join(options.dir, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [repoAssets()],
  // NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.NO_HMR ? false : undefined, fs: { allow: [repoRoot] } },
  resolve: { alias: { '@root': repoRoot } },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
