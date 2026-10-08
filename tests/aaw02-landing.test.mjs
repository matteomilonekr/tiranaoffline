import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("public/aaw/index.html", root), "utf8");
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

const SKOOL_FREE = "https://www.skool.com/community-di-scalers-8843";

test("la landing AAW02 dichiara date, orario e gratuità", () => {
  assert.match(page, /Edizione N°02/);
  assert.match(page, /9–13 novembre 2026/);
  assert.match(page, /21:00/);
  assert.match(page, /Lun 16 nov/);
  assert.match(page, /Gratis/);
});

test("ogni serata ha un deliverable dichiarato", () => {
  const rows = page.match(/<div class="row[^"]*">/g) || [];
  const deliverables = page.match(/<b>Ti porti via<\/b>/g) || [];
  assert.equal(rows.length, 7);
  assert.equal(deliverables.length, rows.length);
});

test("le iscrizioni passano dalla Skool gratuita in una nuova scheda sicura", () => {
  const links = page.match(new RegExp(`<a[^>]+href="${SKOOL_FREE}"[^>]*>`, "g")) || [];
  assert.ok(links.length >= 3);
  for (const link of links) {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  }
});

test("la landing non promette risultati né clienti garantiti", () => {
  assert.doesNotMatch(page, /garantit[oi] (clienti|risultat)/i);
  assert.doesNotMatch(page, /clienti garantiti/i);
  assert.match(page, /non rappresentano una garanzia di risultato/i);
  assert.match(page, /È formazione: costruisci tu, con noi\./);
  assert.match(page, /Nessun obbligo/);
});

test("Vercel serve /aaw e reindirizza la vecchia /aaw26", () => {
  const rewrites = new Map(vercel.rewrites.map(({ source, destination }) => [source, destination]));
  assert.equal(rewrites.get("/aaw"), "/aaw/index.html");
  assert.equal(rewrites.get("/aaw/"), "/aaw/index.html");
  assert.equal(rewrites.has("/aaw26"), false);

  const redirects = new Map(vercel.redirects.map(({ source, destination }) => [source, destination]));
  for (const source of ["/aaw26", "/aaw26/", "/aaw26/index.html"]) {
    assert.equal(redirects.get(source), "/aaw", `${source} non reindirizza a /aaw`);
  }

  const fallback = vercel.rewrites.at(-1);
  assert.equal(fallback.destination, "/index.html");
  assert.match(fallback.source, /\(\?!api\|aaw\|/);
});
