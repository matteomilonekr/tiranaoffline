import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PURCHASE_TERMS_URL,
  PURCHASE_TERMS_VERSION,
  assertPurchaseTermsAcceptance,
} from "../api/_purchase-terms.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const policy = read("../public/tirana/refund-policy/index.html");
const landing = read("../public/tirana/index.html");
const offer = read("../public/tirana/offerta/index.html");
const checkout = read("../public/tirana/checkout/index.html");
const thankYou = read("../public/tirana/thank-you/index.html");
const privacy = read("../public/tirana/privacy/index.html");
const stripeShared = read("../api/stripe/_shared.js");
const stripeHandler = read("../api/stripe/create-checkout-session.js");
const vercel = JSON.parse(read("../vercel.json"));

test("la policy identifica venditore, servizio, valuta e contatti", () => {
  assert.match(policy, /Scalers SHPK/);
  assert.match(policy, /Rruga e Dibres, Tower Bridge 1, Nr\. 22/);
  assert.match(policy, /4 e 5 settembre 2026/);
  assert.match(policy, /Piramide di Tirana/);
  assert.match(policy, /euro, EUR/);
  assert.match(policy, /evento@tiranaoffline\.com/);
});

test("la policy definisce condizioni e scadenze di rimborso senza ambiguità", () => {
  assert.match(policy, /14 giorni di calendario dalla data di acquisto/);
  assert.match(policy, /23:59 del 14 agosto 2026/);
  assert.match(policy, /annulla definitivamente[\s\S]*rimborso integrale/i);
  assert.match(policy, /14 giorni di calendario dalla comunicazione/);
  assert.match(policy, /23:59 del 28 agosto 2026/);
  assert.match(policy, /5-10 giorni lavorativi/);
  assert.match(policy, /metodo di pagamento originario/);
  assert.match(policy, /diritti inderogabili/);
  assert.match(policy, /non limita il diritto di rivolgersi alla banca/);
});

test("la versione della policy è coerente tra pagina, browser e server", () => {
  assert.equal(PURCHASE_TERMS_VERSION, "2026-07-22-v1");
  assert.equal(PURCHASE_TERMS_URL, "https://www.tiranaoffline.com/refund-policy");
  assert.match(policy, new RegExp(PURCHASE_TERMS_VERSION));
  assert.match(checkout, new RegExp(PURCHASE_TERMS_VERSION));
  assert.match(checkout, /id="purchase-terms-accepted"[\s\S]*type="checkbox"[\s\S]*required/);
  assert.match(checkout, /purchaseTerms:[\s\S]*accepted:[\s\S]*version:/);
  assert.match(stripeHandler, /assertPurchaseTermsAcceptance\(body\?\.purchaseTerms\)/);
});

test("il consenso resta subito sotto la Privacy Policy con una spunta visiva deterministica", () => {
  const buyerSection = checkout.indexOf('class="form-section buyer-section"');
  const privacyLink = checkout.indexOf('Consulta la <a href="/privacy">Privacy Policy</a>', buyerSection);
  const purchaseTerms = checkout.indexOf('class="purchase-terms"', privacyLink);
  const paymentSection = checkout.indexOf('id="payment-kicker"', purchaseTerms);

  assert.notEqual(buyerSection, -1);
  assert.notEqual(privacyLink, -1);
  assert.notEqual(purchaseTerms, -1);
  assert.notEqual(paymentSection, -1);
  assert.ok(buyerSection < privacyLink);
  assert.ok(privacyLink < purchaseTerms);
  assert.ok(purchaseTerms < paymentSection);
  assert.equal((checkout.match(/id="purchase-terms-accepted"/g) || []).length, 1);
  assert.match(checkout, /class="purchase-terms-box" aria-hidden="true"/);
  assert.match(checkout, /\.purchase-terms-check input:checked \+ \.purchase-terms-box/);
  assert.match(checkout, /\.purchase-terms-box svg[\s\S]*opacity:\s*0/);
  assert.match(checkout, /input:checked \+ \.purchase-terms-box svg[\s\S]*opacity:\s*1/);
});

test("il server accetta solo consenso esplicito e versione corrente", () => {
  assert.deepEqual(
    assertPurchaseTermsAcceptance({ accepted: true, version: PURCHASE_TERMS_VERSION }),
    {
      accepted: true,
      version: PURCHASE_TERMS_VERSION,
      url: PURCHASE_TERMS_URL,
      source: "pre_checkout_checkbox",
    },
  );
  for (const invalid of [undefined, {}, { accepted: false, version: PURCHASE_TERMS_VERSION }, { accepted: true, version: "old" }]) {
    assert.throws(
      () => assertPurchaseTermsAcceptance(invalid),
      (error) => error.code === "PURCHASE_TERMS_REQUIRED" && error.status === 400,
    );
  }
});

test("Stripe riceve disclosure e prova versionata dell’accettazione", () => {
  assert.match(stripeShared, /custom_text\[submit\]\[message\]/);
  assert.match(stripeShared, /purchase_terms_accepted/);
  assert.match(stripeShared, /purchase_terms_version/);
  assert.match(stripeShared, /purchase_terms_source/);
  assert.match(stripeShared, /purchase_terms_url/);
  assert.match(stripeShared, /Policy di rimborso e condizioni di acquisto/);
});

test("tutte le pagine commerciali collegano la policy prima e dopo l’acquisto", () => {
  for (const page of [landing, offer, checkout, thankYou, privacy]) {
    assert.match(page, /href="\/refund-policy"/);
  }
});

test("Vercel espone la policy sui percorsi canonici con header sicuri", () => {
  const rewrites = new Map(vercel.rewrites.map(({ source, destination }) => [source, destination]));
  for (const source of ["/refund-policy", "/refund-policy/", "/tirana/refund-policy", "/tirana/refund-policy/"]) {
    assert.equal(rewrites.get(source), "/tirana/refund-policy/index.html");
  }
  const policyHeaders = vercel.headers.filter(({ source }) => source.includes("refund-policy"));
  assert.equal(policyHeaders.length, 2);
  for (const route of policyHeaders) {
    const headers = new Map(route.headers.map(({ key, value }) => [key, value]));
    assert.match(headers.get("Content-Security-Policy"), /script-src 'none'/);
    assert.equal(headers.get("X-Frame-Options"), "DENY");
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  }
});

test("i file della policy non contengono em dash o en dash", () => {
  for (const content of [policy, checkout, stripeShared]) {
    assert.doesNotMatch(content, /[\u2014\u2013]/);
  }
});
