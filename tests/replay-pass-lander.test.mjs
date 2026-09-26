import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("public/replay-pass/index.html", root), "utf8");
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

test("la lander del Replay Pass è raggiungibile ed esclusa dal fallback", () => {
  for (const source of ["/replay-pass", "/replay-pass/"]) {
    assert.ok(
      vercel.rewrites.some((rewrite) => rewrite.source === source && rewrite.destination === "/replay-pass/index.html"),
      `rewrite mancante: ${source}`,
    );
  }

  const fallback = vercel.rewrites.at(-1);
  const pattern = new RegExp(`^${fallback.source}$`);
  assert.equal(fallback.destination, "/index.html");
  assert.doesNotMatch("/replay-pass", pattern);
  assert.doesNotMatch("/replay-pass/", pattern);
});

test("la CSP della lander consente soltanto font Google e video Loom", () => {
  const route = vercel.headers.find(({ source }) => source === "/replay-pass(.*)");
  assert.ok(route, "header della lander mancanti");

  const header = (key) => route.headers.find((entry) => entry.key === key)?.value;
  const csp = header("Content-Security-Policy");
  assert.match(csp, /frame-src https:\/\/www\.loom\.com/);
  assert.match(csp, /style-src 'self' https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /font-src 'self' https:\/\/fonts\.gstatic\.com/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(header("X-Frame-Options"), "DENY");
  assert.equal(header("X-Content-Type-Options"), "nosniff");
});

test("tutti gli asset locali della lander esistono", async () => {
  const paths = [...page.matchAll(/\b(?:src|href)="(\/[^"#?]+)"/g)].map(([, path]) => decodeURI(path));
  assert.ok(paths.length > 20, "la lander deve usare asset locali");

  for (const path of new Set(paths)) {
    await assert.doesNotReject(access(new URL(`public${path}`, root)), `asset mancante: ${path}`);
  }
});

test("il prezzo resta 27 euro senza prezzi barrati, scadenze o garanzie non previste", () => {
  const prices = [...page.matchAll(/€\s?(\d+)/g)].map(([, value]) => value);
  assert.ok(prices.length > 5);
  assert.deepEqual([...new Set(prices)], ["27"]);
  assert.match(page, /Nessun abbonamento/);
  assert.doesNotMatch(page, /<(?:s|del|strike)\b|line-through/i);
  assert.doesNotMatch(page, /countdown|ultimi giorni|solo per oggi|posti limitati/i);
  assert.doesNotMatch(page, /soddisfatti o rimborsati|rimborso garantito|money back/i);
});

test("il form a due step raccoglie i contatti prima del riepilogo d'ordine", () => {
  const forms = page.match(/<form\b[^>]*data-two-step[\s\S]*?<\/form>/g) ?? [];
  assert.equal(forms.length, 2);

  for (const form of forms) {
    assert.match(form, /data-step="1"/);
    assert.match(form, /data-step="2" hidden/);
    assert.match(form, /name="name"[^>]*autocomplete="name"/);
    assert.match(form, /name="email" type="email" autocomplete="email"/);
    assert.match(form, /data-back/);
    assert.match(form, /joinscalers\.com\/refund-policy/);
  }

  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, "id duplicati");
  for (const [, target] of page.matchAll(/<label\b[^>]*for="([^"]+)"/g)) {
    assert.ok(ids.includes(target), `label senza campo: ${target}`);
  }

  for (const [, target] of page.matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*data-cta/g)) {
    assert.ok(ids.includes(target), `CTA senza form di destinazione: ${target}`);
  }
});

test("il checkout usa il link di pagamento configurato o un'email precompilata", () => {
  assert.match(page, /const CHECKOUT_URL = "[^"]*";/);
  assert.match(page, /url\.hostname === "buy\.stripe\.com"/);
  assert.match(page, /searchParams\.set\("prefilled_email", lead\.email\)/);
  assert.match(page, /mailto:\$\{CONTACT_EMAIL\}\?subject=\$\{encodeURIComponent\(subject\)\}/);
});

test("le testimonianze video si caricano solo al clic e i risultati non sono garantiti", () => {
  const facades = [...page.matchAll(/<button\b[^>]*data-testimonial-video="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)];
  assert.ok(facades.length >= 8, "servono almeno otto video");

  for (const [facade, source] of facades) {
    assert.match(source, /^https:\/\/www\.loom\.com\/embed\/[0-9a-f]{32}$/);
    assert.match(facade, /aria-label="[^"]+"/);
    assert.match(facade, /<img\b[^>]*loading="lazy"/);
  }

  assert.doesNotMatch(page, /<iframe\b/i);
  assert.match(page, /startsWith\("https:\/\/www\.loom\.com\/embed\/"\)/);
  assert.match(page, /non garanzie di risultato individuale/);
});
