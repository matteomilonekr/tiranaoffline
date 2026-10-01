import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const page = read("../public/start/index.html");
const vercel = JSON.parse(read("../vercel.json"));
const SKOOL_PAID = "https://www.skool.com/community-di-scalers-paid/about";

test("Vercel serve /start prima del catch-all della SPA", () => {
  const sources = vercel.rewrites.map((rule) => rule.source);
  const catchAll = sources.findIndex((source) => source.startsWith("/((?!"));
  for (const source of ["/start", "/start/"]) {
    const index = sources.indexOf(source);
    assert.ok(index !== -1 && index < catchAll, `${source} deve precedere il catch-all`);
    assert.equal(vercel.rewrites[index].destination, "/start/index.html");
  }
  assert.match(sources[catchAll], /\|start\)/);
});

test("la CSP di /start consente i video Loom e blocca il framing della pagina", () => {
  const block = vercel.headers.find((entry) => entry.source === "/start(.*)");
  assert.ok(block, "manca il blocco header per /start");
  const csp = block.headers.find((header) => header.key === "Content-Security-Policy")?.value || "";
  assert.match(csp, /frame-src https:\/\/www\.loom\.com;/);
  assert.match(csp, /img-src 'self' data:/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test("ogni CTA porta alla pagina Skool di Scalers+", () => {
  const ctas = [...page.matchAll(/<a\b[^>]*\bdata-cta="([^"]+)"[^>]*>/g)];
  assert.ok(ctas.length >= 4, "la landing deve avere almeno quattro CTA");
  for (const [tag, position] of ctas) {
    assert.ok(tag.includes(`href="${SKOOL_PAID}"`), `la CTA ${position} non punta a Skool`);
  }
});

test("immagini e loghi locali esistono e nessuna immagine viene da host esterni", () => {
  const sources = [...page.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(sources.length > 0);
  for (const src of sources) {
    assert.ok(src.startsWith("/start/assets/"), `immagine fuori da /start/assets: ${src}`);
    assert.ok(existsSync(new URL(`../public${src}`, import.meta.url)), `file mancante: ${src}`);
  }
});

test("i video Loom usano ID validi e restano dietro la facciata", () => {
  const ids = [...page.matchAll(/data-loom="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length >= 6);
  for (const id of ids) assert.match(id, /^[a-f0-9]{32}$/);
  assert.doesNotMatch(page, /<iframe\b/);
});

test("la landing dichiara prezzo, garanzia e disclaimer sui risultati", () => {
  assert.match(page, /\$97 <span>\/mese<\/span>/);
  assert.match(page, /90 giorni/);
  assert.match(page, /I RISULTATI NON SONO GARANTITI/);
  assert.match(page, /Fonte: MarketsandMarkets/);
  assert.match(page, /href="\/privacy"/);
  assert.match(page, /data-consent-settings/);
  assert.match(page, /<meta name="robots" content="noindex, follow">/);
});
