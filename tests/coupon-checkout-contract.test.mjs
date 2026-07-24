import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkout = readFileSync(
  new URL("../public/tirana/checkout/index.html", import.meta.url),
  "utf8",
);

test("il checkout espone un campo coupon accessibile e separato dal referral", () => {
  assert.match(checkout, /id="coupon-code"[^>]*maxlength="32"[^>]*aria-describedby="coupon-status"/);
  assert.match(checkout, /id="coupon-apply"[^>]*type="button"/);
  assert.match(checkout, /id="coupon-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(checkout, /id="referral"[^>]*name="referral"/);
  assert.match(checkout, /@media \(max-width: 620px\)[\s\S]*?\.coupon-controls \{ grid-template-columns: 1fr; \}/);
});

test("il coupon viene verificato dal catalogo e il browser non invia importi", () => {
  assert.match(checkout, /async function fetchPlan\(couponCode = ''\)/);
  assert.match(checkout, /query\.set\('coupon', couponCode\)/);
  assert.match(checkout, /const quotedPlan = await fetchPlan\(requestedCode\)/);
  assert.match(checkout, /quotedPlan\.coupon\?\.code/);
  assert.match(
    checkout,
    /body: JSON\.stringify\(\{\s*planId,\s*expectedPricingStage: state\.plan\.pricingStage,\s*couponCode: state\.couponCode,\s*customer\s*\}\)/,
  );
  assert.doesNotMatch(checkout, /body: JSON\.stringify\(\{[^}]*\b(?:price|amount|discountPercent|discountAmount)\s*:/s);
});

test("il riepilogo mostra prezzo originale, sconto e totale anche su mobile", () => {
  assert.match(checkout, /id="summary-original-price" hidden/);
  assert.match(checkout, /id="summary-coupon" hidden/);
  assert.match(checkout, /id="mobile-original-price" hidden/);
  assert.match(checkout, /plan\.originalPriceFormatted/);
  assert.match(checkout, /Coupon ' \+ plan\.coupon\.code \+ ' · -'/);
  assert.match(checkout, /plan\.price === '0\.00'/);
  assert.match(checkout, /Ottieni il pass gratuito/);
  assert.match(checkout, /'Continua con bonifico · ' \+ plan\.priceFormatted/);
});

test("rimozione, idempotenza e analytics distinguono lo stato coupon", () => {
  assert.match(checkout, /couponState = state\.plan\?\.coupon\?\.code \|\| 'standard'/);
  assert.match(checkout, /state\.plan = state\.basePlan/);
  assert.match(checkout, /Coupon rimosso\. Il prezzo pieno è stato ripristinato\./);
  assert.match(checkout, /couponCode: state\.couponCode/);
  assert.match(checkout, /getCheckoutTracking\?\.\(\)/);
  assert.match(checkout, /trackAddPaymentInfo\?\.\(state\.plan, 'stripe'\)/);
  assert.match(checkout, /trackAddPaymentInfo\?\.\(state\.plan, 'bank-transfer'\)/);
  assert.match(checkout, /trackCompleteRegistration\?\.\(state\.plan\)/);
});

test("SOLOFREEPASS nasconde i campi fiscali e non presenta un bonifico da zero euro", () => {
  assert.equal((checkout.match(/<(?:div|fieldset)[^>]+data-billing-field/g) || []).length, 7);
  assert.match(checkout, /field\.hidden = isFree/);
  assert.match(checkout, /control\.disabled = isFree/);
  assert.match(checkout, /control\.required = !isFree/);
  assert.match(checkout, /syncCustomerTypeFields\(\)/);
  assert.match(checkout, /Nessun pagamento richiesto\. Il pass viene confermato/);
  assert.match(checkout, /Il Workshop Pass è gratuito/);
  assert.match(checkout, /if \(isFree\) \{\s*await window\.TiranaAnalytics\?\.trackCompleteRegistration/s);
});
