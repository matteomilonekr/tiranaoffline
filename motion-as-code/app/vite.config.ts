import { defineConfig, normalizePath, type Plugin } from 'vite';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
// FILM=<name> plays films/<name>/ (its timeline, plates, voice and data) instead of the demo
const FILM = process.env.FILM || '';
const filmDir = FILM ? path.join(repoRoot, 'films', FILM) : repoRoot;
if (FILM && !existsSync(filmDir)) throw new Error(`no such film: films/${FILM}`);
// the film's format: '16x9' (1920x1080, the default) or '9x16' (1080x1920), from films/<name>/film.json
const filmJson = path.join(filmDir, 'film.json');
const FORMAT: string = (FILM && existsSync(filmJson) ? JSON.parse(readFileSync(filmJson, 'utf8')).format : null) ?? '16x9';
// audio/, data/ and images/ come from the film; out/ is shared, out/<film>/ for a film (?mix=1 plays out/mix.wav)
const assetDirs: Record<string, string> = {
  audio: path.join(filmDir, 'audio'),
  data: path.join(filmDir, 'data'),
  images: path.join(filmDir, 'images'),
  out: FILM ? path.join(repoRoot, 'out', FILM) : path.join(repoRoot, 'out'),
};

// Git can check out directory symlinks as plain files on Windows. Serve the
// original assets through Vite and copy them into builds without using symlinks.
function repoAssets(): Plugin {
  return {
    name: 'repo-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // (which film this server plays: render.ts reuses a running server only for the same film)
        if (req.url === '/__film') { res.end(FILM); return; }
        const dir = Object.keys(assetDirs).find((d) => req.url?.startsWith(`/${d}/`));
        if (dir) req.url = `/@fs/${encodeURI(normalizePath(assetDirs[dir]!))}${req.url!.slice(dir.length + 1)}`;
        next();
      });
    },
    writeBundle(options) {
      if (!options.dir) return;
      for (const dir of ['audio', 'data', 'images']) {
        if (existsSync(assetDirs[dir]!)) cpSync(assetDirs[dir]!, path.join(options.dir, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [repoAssets()],
  define: { __FORMAT__: JSON.stringify(FORMAT), __FILM__: JSON.stringify(FILM) },
  // NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.NO_HMR ? false : undefined, fs: { allow: [repoRoot] } },
  resolve: {
    // (a film's plates live outside app/: their imports of these resolve from here)
    dedupe: ['three', 'opentype.js'],
    alias: {
      '@root': repoRoot,
      '@kit': path.join(repoRoot, 'app', 'src'),
      '@timeline': FILM ? path.join(filmDir, 'timeline.ts') : path.join(repoRoot, 'app', 'src', 'timeline.ts'),
    },
  },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
