import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MICRO_OFFER_BUMPS,
  MICRO_OFFER_PRODUCT,
  formatEuro,
} from "../api/micro-offer/_shared.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const page = await read("public/micro-offer/index.html");
const checkout = await read("public/micro-offer/checkout/index.html");
const thankYou = await read("public/micro-offer/grazie/index.html");
const vercel = JSON.parse(await read("vercel.json"));
const pages = [
  ["public/micro-offer/index.html", page],
  ["public/micro-offer/checkout/index.html", checkout],
  ["public/micro-offer/grazie/index.html", thankYou],
];

function headersFor(path) {
  const rule = vercel.headers.find(({ source }) => new RegExp(`^${source}$`).test(path));
  return new Map((rule?.headers || []).map(({ key, value }) => [key, value]));
}

test("Vercel espone sales page, checkout e conferma Micro Offer OS", () => {
  const rewrites = new Map(vercel.rewrites.map(({ source, destination }) => [source, destination]));
  assert.equal(rewrites.get("/micro-offer"), "/micro-offer/index.html");
  assert.equal(rewrites.get("/micro-offer/"), "/micro-offer/index.html");
  assert.equal(rewrites.get("/micro-offer/checkout"), "/micro-offer/checkout/index.html");
  assert.equal(rewrites.get("/micro-offer/checkout/"), "/micro-offer/checkout/index.html");
  assert.equal(rewrites.get("/micro-offer/grazie"), "/micro-offer/grazie/index.html");
  assert.equal(rewrites.get("/micro-offer/grazie/"), "/micro-offer/grazie/index.html");

  const fallback = vercel.rewrites.find(({ destination }) => destination === "/index.html");
  const fallbackPattern = new RegExp(`^${fallback.source}$`);
  assert.equal(fallbackPattern.test("/micro-offer"), false, "il fallback non deve intercettare /micro-offer");
  assert.equal(fallbackPattern.test("/micro-offer/checkout"), false);
  assert.equal(fallbackPattern.test("/pagina-inesistente"), true);
});

test("checkout e conferma non finiscono in cache e la conferma non passa il referrer", () => {
  const checkoutHeaders = headersFor("/micro-offer/checkout");
  assert.equal(checkoutHeaders.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(checkoutHeaders.get("Cross-Origin-Opener-Policy"), "same-origin-allow-popups");
  assert.doesNotMatch(checkoutHeaders.get("Permissions-Policy"), /payment/, "Apple Pay e Google Pay devono restare disponibili");
  const csp = checkoutHeaders.get("Content-Security-Policy");
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/js\.stripe\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/api\.stripe\.com/);
  assert.match(csp, /frame-src https:\/\/js\.stripe\.com [^;]*https:\/\/hooks\.stripe\.com/);
  assert.match(csp, /frame-ancestors 'none'/);

  const thankYouHeaders = headersFor("/micro-offer/grazie");
  assert.equal(thankYouHeaders.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(thankYouHeaders.get("Referrer-Policy"), "no-referrer");
  assert.match(thankYouHeaders.get("Content-Security-Policy"), /connect-src 'self'/);
});

test("le pagine sono in italiano e non riprendono brand o contatti del sito di riferimento", () => {
  assert.match(page, /<title>Micro Offer OS \| Il tuo primo cliente in 24 ore<\/title>/);
  for (const [file, html] of pages) {
    assert.match(html, /<html lang="it">/, file);
    assert.doesNotMatch(
      html,
      /Sell While You Sleep|SWYS|Productized Coach|effortlessscale|Zac Hansen|sellwhileyousleep|Costco/i,
      file,
    );
    assert.doesNotMatch(html, /\$\d/, `${file}: i prezzi devono essere in euro`);
  }
});

test("ogni prezzo della sales page coincide con il prezzo dell'offerta", () => {
  assert.match(page, /priceLabel: "€14,95"/);
  const prices = page.match(/€\d+,\d{2}/g) || [];
  assert.ok(prices.length >= 10);
  assert.deepEqual([...new Set(prices)], [formatEuro(MICRO_OFFER_PRODUCT.amountCents)]);
});

test("tutti gli asset locali usati dalle pagine esistono in public/", () => {
  for (const [file, html] of pages) {
    const paths = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((match) => match[1]);
    for (const path of paths) {
      assert.ok(existsSync(new URL(`public${decodeURI(path)}`, root)), `${file}: ${path} non esiste in public/`);
    }
  }
});

test("ogni pulsante della sales page porta al checkout passando dal pop-up", () => {
  const ctas = [...page.matchAll(/<a class="cta" href="([^"]+)" data-cta-checkout>/g)].map((match) => match[1]);
  assert.ok(ctas.length >= 8);
  assert.deepEqual([...new Set(ctas)], ["/micro-offer/checkout"]);
  assert.match(page, /<div id="optin" class="so-overlay" hidden>/);
  assert.match(page, /Passo 1 di 2/);
  assert.match(page, /checkoutUrl: "\/micro-offer\/checkout"/);
  assert.match(page, /const PREFILL_KEY = "micro_offer_prefill";/);
  assert.match(checkout, /const PREFILL_KEY = "micro_offer_prefill";/);
  assert.match(page, /prefilled_email/);
});

test("il checkout usa Stripe Elements e non invia mai importi al server", () => {
  assert.match(checkout, /const API_URL = "\/api\/micro-offer\/checkout";/);
  assert.match(checkout, /script\.src = "https:\/\/js\.stripe\.com\/v3\/";/);
  assert.match(checkout, /paymentMethodCreation: "manual"/);
  assert.match(checkout, /createConfirmationToken/);
  assert.match(checkout, /handleNextAction/);
  assert.match(checkout, /"Idempotency-Key": idempotencyKey\(\)/);
  const payload = checkout.match(/await postJson\(\{([\s\S]*?)\}\);/)[1];
  assert.deepEqual(
    payload.split(",").map((field) => field.trim().split(":")[0]).filter(Boolean),
    ["fullName", "email", "bumps", "confirmationTokenId"],
  );
  assert.doesNotMatch(checkout, /STRIPE_SECRET_KEY|sk_(?:live|test)_/);
});

test("il checkout mostra prezzo e aggiunte coerenti con il catalogo del server", () => {
  assert.match(checkout, new RegExp(`<p class="price">${formatEuro(MICRO_OFFER_PRODUCT.amountCents)} <small>`));
  assert.match(checkout, new RegExp(`Accedi subito per ${formatEuro(MICRO_OFFER_PRODUCT.amountCents)}<`));
  for (const bump of MICRO_OFFER_BUMPS) {
    assert.match(checkout, new RegExp(`"${bump.id}": cover\\(`), `copertina mancante per ${bump.id}`);
  }
  assert.match(checkout, /Garanzia a vita “Primi 3 Clienti”/);
});

test("la conferma verifica il pagamento sul server e ripulisce l'indirizzo", () => {
  assert.match(thankYou, /action: "finalize", paymentIntentId, clientSecret/);
  assert.match(thankYou, /history\.replaceState\(null, "", window\.location\.pathname\)/);
  assert.match(thankYou, /<meta name="referrer" content="no-referrer">/);
  assert.match(thankYou, /Non ti è stato addebitato nulla/);
});

test("i risultati dichiarano la provenienza e i video usano solo embed Loom", () => {
  assert.match(page, /non dal solo acquisto di Micro Offer OS/);
  assert.match(page, /Risultati individuali\. Non rappresentano una garanzia di risultato\./);
  const videos = [...page.matchAll(/data-video="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(videos.length >= 8);
  for (const video of videos) {
    assert.match(video, /^https:\/\/www\.loom\.com\/embed\/[a-f0-9]{32}$/);
  }
});
