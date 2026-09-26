import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("public/aaw-workshop/index.html", root), "utf8");
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

test("la landing /aaw-workshop è servita dalla sua pagina statica", () => {
  for (const source of ["/aaw-workshop", "/aaw-workshop/"]) {
    const rewrite = vercel.rewrites.find((entry) => entry.source === source);
    assert.equal(rewrite?.destination, "/aaw-workshop/index.html", `${source}: rewrite mancante`);
  }

  const catchAll = vercel.rewrites.find((entry) => entry.destination === "/index.html");
  assert.ok(catchAll, "rewrite SPA mancante");
  const pattern = new RegExp(`^${catchAll.source.replace(/^\//, "\\/")}$`);
  assert.doesNotMatch("/aaw-workshop", pattern);
  assert.match(page, /<meta name="robots" content="noindex">/);
});

test("tutte le CTA portano al modulo d'ordine", () => {
  const ctas = [...page.matchAll(/<a\b[^>]*class="(?:cta-btn|sa-btn|header-cta)"[^>]*>/g)];
  assert.ok(ctas.length >= 8, "servono le CTA ripetute lungo la pagina");
  for (const [cta] of ctas) assert.match(cta, /href="#order"/);

  assert.match(page, /<div class="hero-col order" id="order">/);
  assert.match(page, /<input id="lead-name" name="name"[^>]*required>/);
  assert.match(page, /<input name="email" type="email"[^>]*required>/);
});

test("countdown e prezzo barrato si attivano solo con valori reali configurati", () => {
  assert.match(page, /offerEndsAt: "",/);
  assert.match(page, /listPrice: 0,/);
  assert.match(page, /Date\.parse\(CONFIG\.offerEndsAt\)/);
  assert.match(page, /if \(CONFIG\.listPrice > CONFIG\.price\)/);
  assert.match(page, /<s class="was" data-list-price hidden><\/s>/);
  assert.match(page, /<span class="clock" id="timer-clock" hidden><\/span>/);
  assert.doesNotMatch(page, /localStorage/, "nessun timer evergreen salvato nel browser");
});

test("testimonianze e case study dichiarano che non sono una garanzia", () => {
  assert.match(page, /non dal solo acquisto del Replay Pass/);
  assert.match(page, /non rappresentano una garanzia di risultato/);
  assert.doesNotMatch(page, /soddisfatti o rimborsati|rimborso garantito|money-back/i);
});

test("le immagini usate dalla pagina esistono in public", async () => {
  const paths = new Set([
    ...[...page.matchAll(/\bsrc="(\/[^"]+)"/g)].map(([, path]) => path),
    ...[...page.matchAll(/url\("(\/[^"]+)"\)/g)].map(([, path]) => path),
  ]);
  assert.ok(paths.size >= 10, "riferimenti alle immagini non trovati");
  for (const path of paths) {
    await access(new URL(`public${decodeURIComponent(path)}`, root));
  }
});
