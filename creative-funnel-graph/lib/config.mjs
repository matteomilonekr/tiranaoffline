// Local settings: the Meta token and a few preferences, stored in ~/.creative-funnel-graph with
// owner-only permissions. Environment variables override the file.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_API_VERSION = 'v25.0';

export function homeDir() {
  return process.env.FUNNEL_GRAPH_HOME || path.join(os.homedir(), '.creative-funnel-graph');
}

export function cacheDir() {
  return path.join(homeDir(), 'cache');
}

function configFile() {
  return path.join(homeDir(), 'config.json');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function loadConfig() {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    // No config yet.
  }
  return {
    token: process.env.META_ACCESS_TOKEN || file.token || null,
    tokenFromEnv: !!process.env.META_ACCESS_TOKEN,
    apiVersion: process.env.META_API_VERSION || file.apiVersion || DEFAULT_API_VERSION,
    appId: process.env.META_APP_ID || file.appId || null,
    defaultAccount: file.defaultAccount || null,
    user: file.user || null,
  };
}

export function saveConfig(patch) {
  ensureDir(homeDir());
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    // First write.
  }
  const next = { ...current, ...patch };
  for (const [k, v] of Object.entries(next)) if (v === null || v === undefined) delete next[k];
  const tmp = configFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, configFile());
  fs.chmodSync(configFile(), 0o600);
  return loadConfig();
}

export function clearToken() {
  return saveConfig({ token: null, user: null, defaultAccount: null });
}

export function clearCache() {
  fs.rmSync(cacheDir(), { recursive: true, force: true });
  ensureDir(cacheDir());
}

export function readCache(name, maxAgeMs) {
  try {
    const file = path.join(cacheDir(), name);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeCache(name, value) {
  ensureDir(cacheDir());
  const file = path.join(cacheDir(), name);
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
}
