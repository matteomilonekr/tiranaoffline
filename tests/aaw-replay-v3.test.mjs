import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("public/aaw-replay/v3/index.html", root), "utf8");
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

const SESSIONS = ["Chiarezza", "Automazione", "Acquisizione", "Vendita", "Operations", "Prodotto", "Offerta"];
const program = page.match(/<section\b[^>]*id="programma"[\s\S]*?<\/section>/)?.[0] ?? "";

test("la v3 del Replay Pass è raggiungibile ed esclusa dal fallback", () => {
  for (const source of ["/aaw-replay/v3", "/aaw-replay/v3/"]) {
    assert.ok(
      vercel.rewrites.some((rewrite) => rewrite.source === source && rewrite.destination === "/aaw-replay/v3/index.html"),
      `rewrite mancante: ${source}`,
    );
  }

  const fallback = vercel.rewrites.at(-1);
  const pattern = new RegExp(`^${fallback.source}$`);
  assert.equal(fallback.destination, "/index.html");
  assert.doesNotMatch("/aaw-replay/v3", pattern);
  assert.doesNotMatch("/aaw-replay/v3/", pattern);
});

test("la CSP della v3 consente soltanto font Google e video Loom", () => {
  const route = vercel.headers.find(({ source }) => source === "/aaw-replay/v3(.*)");
  assert.ok(route, "header della v3 mancanti");

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

test("tutti gli asset locali della v3 esistono", async () => {
  const paths = [...page.matchAll(/\b(?:src|href)="(\/[^"#?]+)"/g)].map(([, path]) => decodeURI(path));
  assert.ok(paths.length > 20, "la v3 deve usare asset locali");

  for (const path of new Set(paths)) {
    await assert.doesNotReject(access(new URL(`public${path}`, root)), `asset mancante: ${path}`);
  }
});

test("il prezzo resta 7 euro senza prezzi barrati, scadenze o garanzie non previste", () => {
  const prices = [...page.matchAll(/€\s?(\d+)/g)].map(([, value]) => value);
  assert.ok(prices.length > 5);
  assert.deepEqual([...new Set(prices)], ["7"]);
  assert.match(page, /Nessun abbonamento/);
  assert.doesNotMatch(page, /<(?:s|del|strike)\b|line-through/i);
  assert.doesNotMatch(page, /countdown|ultimi giorni|solo per oggi|posti limitati/i);
  assert.doesNotMatch(page, /soddisfatti o rimborsati|rimborso garantito|money back/i);
});

test("il programma racconta le 7 sessioni nell'ordine della Week", () => {
  assert.ok(program, "sezione #programma mancante");

  const list = program.match(/<ol class="program-list">[\s\S]*?<\/ol>/)?.[0] ?? "";
  const days = list.split('<li class="day"').slice(1);
  assert.equal(days.length, SESSIONS.length);

  days.forEach((day, index) => {
    const number = String(index + 1).padStart(2, "0");
    assert.match(day, new RegExp(`^ id="sessione-${index + 1}"`));
    assert.match(day, new RegExp(`<span class="day-num">Sessione ${number}</span><span class="day-pillar">${SESSIONS[index]}</span>`));
    assert.match(day, /<h3>[^<]+<\/h3>/);
    assert.match(day, /class="day-neck"[\s\S]*Il collo di bottiglia:/);
    assert.equal(day.match(/<li><svg aria-hidden="true"><use href="#i-check"\/><\/svg>/g)?.length, 4);
    assert.match(day, new RegExp(`<blockquote class="day-quote">«[^»]+»<cite>Matteo Milone, sessione ${number}</cite></blockquote>`));
    assert.match(day, /<p class="day-take"><strong>Ti porti a casa<\/strong>[^<]+/);
  });

  for (const [, target] of program.matchAll(/<a href="#(sessione-\d)">/g)) {
    assert.match(program, new RegExp(`id="${target}"`), `link del programma senza sessione: ${target}`);
  }

  assert.match(program, /registrazioni integrali delle dirette/);
  assert.match(program, /non sono garanzie di risultato individuale/);
});

test("il form a due step resta fisso a lato del programma", () => {
  const side = program.match(/<aside class="side side-sticky"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(side, "colonna laterale del programma mancante");
  assert.match(side, /<form\b[^>]*data-two-step/);
  assert.match(side, /data-order/);
  assert.match(page, /\.side-sticky \.order-card \{ position: sticky;/);
});

test("le 7 sessioni hanno gli stessi nomi in tutta la pagina", () => {
  const nav = [...program.matchAll(/<a href="#sessione-(\d)"><b>0\1<\/b>([^<]+)<\/a>/g)].map(([, , name]) => name);
  const sidebar = [...page.matchAll(/<li><b>0\d<\/b>([^<]+)<span/g)].map(([, name]) => name);
  const cards = [...page.matchAll(/<article class="session-card">[\s\S]*?<h3>([^<]+)<\/h3>/g)].map(([, name]) => name);
  const pillars = [...page.matchAll(/<span class="day-pillar">([^<]+)<\/span>/g)].map(([, name]) => name);

  for (const list of [nav, sidebar, cards, pillars]) {
    assert.deepEqual(list, SESSIONS);
  }
});

test("i form a due step raccolgono i contatti prima del riepilogo d'ordine", () => {
  const forms = page.match(/<form\b[^>]*data-two-step[\s\S]*?<\/form>/g) ?? [];
  assert.equal(forms.length, 3);

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

  for (const [, target] of page.matchAll(/<a\b[^>]*href="#([^"]+)"/g)) {
    assert.ok(ids.includes(target), `link interno senza destinazione: ${target}`);
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
