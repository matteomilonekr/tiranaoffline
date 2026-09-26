import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const landing = await read("public/aaw-workshop/index.html");
const checkout = await read("public/aaw-workshop/checkout/index.html");
const config = await read("public/aaw-workshop/config.js");
const funnel = await read("public/aaw-workshop/assets/funnel.js");
const styles = await read("public/aaw-workshop/assets/workshop.css");
const vercel = JSON.parse(await read("vercel.json"));
const pages = [["landing", landing], ["checkout", checkout]];

test("landing e checkout sono servite dalle loro pagine statiche", () => {
  for (const [source, destination] of [
    ["/aaw-workshop", "/aaw-workshop/index.html"],
    ["/aaw-workshop/", "/aaw-workshop/index.html"],
    ["/aaw-workshop/checkout", "/aaw-workshop/checkout/index.html"],
    ["/aaw-workshop/checkout/", "/aaw-workshop/checkout/index.html"],
  ]) {
    const rewrite = vercel.rewrites.find((entry) => entry.source === source);
    assert.equal(rewrite?.destination, destination, `${source}: rewrite mancante`);
  }

  const catchAll = vercel.rewrites.find((entry) => entry.destination === "/index.html");
  assert.ok(catchAll, "rewrite SPA mancante");
  const pattern = new RegExp(`^${catchAll.source.replace(/^\//, "\\/")}$`);
  assert.doesNotMatch("/aaw-workshop", pattern);
  assert.doesNotMatch("/aaw-workshop/checkout", pattern);

  const headers = vercel.headers.find((entry) => entry.source === "/aaw-workshop(.*)")?.headers || [];
  assert.ok(headers.some(({ key, value }) => key === "X-Frame-Options" && value === "DENY"));
  for (const [name, page] of pages) assert.match(page, /<meta name="robots" content="noindex">/, name);
});

test("le pagine caricano configurazione e funzioni condivise prima dello script", () => {
  for (const [name, page] of pages) {
    const configAt = page.indexOf('<script src="/aaw-workshop/config.js"></script>');
    const funnelAt = page.indexOf('<script src="/aaw-workshop/assets/funnel.js"></script>');
    assert.ok(configAt > 0 && configAt < funnelAt && funnelAt < page.lastIndexOf("<script>"), `${name}: ordine degli script`);
    assert.match(page, /<link rel="stylesheet" href="\/aaw-workshop\/assets\/workshop\.css">/, name);
  }
});

test("le CTA della landing portano al modulo e il modulo porta al checkout", () => {
  const ctas = [...landing.matchAll(/<a\b[^>]*class="(?:cta-btn|sa-btn|header-cta)"[^>]*>/g)];
  assert.ok(ctas.length >= 8, "servono le CTA ripetute lungo la pagina");
  for (const [cta] of ctas) assert.match(cta, /href="#order"/);

  assert.match(landing, /<input id="lead-name" name="name"[^>]*required>/);
  assert.match(landing, /funnel\.saveLead\(lead\)/);
  assert.match(landing, /funnel\.withUtm\("\/aaw-workshop\/checkout"\)/);
  assert.match(funnel, /window\.sessionStorage\.setItem\(LEAD_KEY/, "i contatti non passano dall'URL");
});

test("il checkout non raccoglie dati della carta e rimanda al pagamento Stripe", () => {
  assert.doesNotMatch(checkout, /autocomplete="cc-|name="card/i);
  assert.match(checkout, /funnel\.paymentUrl\(/);
  assert.match(funnel, /url\.searchParams\.set\("prefilled_email", email\)/);
  assert.match(funnel, /\/\^https\?:\$\/\.test\(url\.protocol\)/);
  assert.match(checkout, /<div class="bump" data-bump hidden>/);
  assert.match(config, /^  bump: null,$/m);
});

test("countdown e prezzo barrato si attivano solo con valori reali configurati", () => {
  assert.match(config, /offerEndsAt: "",/);
  assert.match(config, /listPrice: 0,/);
  assert.match(landing, /Date\.parse\(config\.offerEndsAt\)/);
  assert.match(landing, /if \(config\.listPrice > product\.price\)/);
  assert.match(landing, /<s class="was" data-list-price hidden><\/s>/);
  assert.match(landing, /<span class="clock" id="timer-clock" hidden><\/span>/);
  for (const [name, source] of [...pages, ["config", config], ["funnel", funnel]]) {
    assert.doesNotMatch(source, /localStorage/, `${name}: nessun timer evergreen salvato nel browser`);
  }
});

test("testimonianze e case study dichiarano che non sono una garanzia", () => {
  for (const [name, page] of pages) {
    assert.match(page, /non dal solo acquisto del Replay Pass/, name);
    assert.match(page, /non rappresentano una garanzia di risultato/, name);
    assert.doesNotMatch(page, /soddisfatti o rimborsati|rimborso garantito|money-back/i, name);
  }
});

test("immagini e script usati dalle pagine esistono in public", async () => {
  const paths = new Set();
  for (const source of [landing, checkout, styles]) {
    for (const [, path] of source.matchAll(/\bsrc="(\/[^"]+)"/g)) paths.add(path);
    for (const [, path] of source.matchAll(/url\("(\/[^"]+)"\)/g)) paths.add(path);
  }
  assert.ok(paths.size >= 12, "riferimenti alle risorse non trovati");
  for (const path of paths) {
    await access(new URL(`public${decodeURIComponent(path)}`, root));
  }
});
