import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../src/store.js";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const fixtures = join(root, "test", "fixtures");

export function fixture(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

/** Store con ganci e nicchie reali, video di fixture e cartella utente temporanea. */
export function makeStore() {
  const packageData = mkdtempSync(join(tmpdir(), "hv-pkg-"));
  copyFileSync(join(root, "data", "niches.json"), join(packageData, "niches.json"));
  copyFileSync(join(root, "data", "hooks.json"), join(packageData, "hooks.json"));
  copyFileSync(join(fixtures, "videos.json"), join(packageData, "videos.json"));
  const dataDir = mkdtempSync(join(tmpdir(), "hv-user-"));
  return new Store({ packageData, dataDir });
}

/** fetch finto che risponde in base al path dell'endpoint ScrapeCreators. */
export function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const body = routes[u.pathname];
    if (!body) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(typeof body === "function" ? body(u) : body), { status: 200 });
  };
  impl.calls = calls;
  return impl;
}
