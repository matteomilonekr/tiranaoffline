import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const privacy = read("../public/tirana/privacy/index.html");
const landing = read("../public/tirana/index.html");
const offer = read("../public/tirana/offerta/index.html");
const checkout = read("../public/tirana/checkout/index.html");
const thankYou = read("../public/tirana/thank-you/index.html");
const bankOrders = read("../api/bank-orders.js");
const funnel = read("../api/_funnel.js");
const vercel = JSON.parse(read("../vercel.json"));

function checkoutInput(name) {
  return checkout.match(new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`))?.[0] || "";
}

test("la Privacy Policy identifica titolare, contatto e fornitori reali", () => {
  assert.match(privacy, /Scalers SHPK/);
  assert.match(privacy, /privacy@joinscalers\.com/);
  assert.match(privacy, /Per assistenza sul biglietto:[\s\S]*evento@tiranaoffline\.com/);
  assert.match(privacy, /Raiffeisen Bank/);
  assert.match(privacy, /<strong>Stripe<\/strong>/);
  assert.match(privacy, /https:\/\/stripe\.com\/it\/privacy/);
  assert.match(privacy, /Resend/);
  assert.match(privacy, /https:\/\/resend\.com\/legal\/privacy-policy/);
  assert.match(privacy, /Google Workspace/);
  assert.match(privacy, /foglio Google Sheets privato/);
  assert.match(privacy, /<strong>Slack<\/strong>/);
  assert.match(privacy, /canale operativo privato/);
  assert.match(privacy, /https:\/\/slack\.com\/trust\/privacy\/privacy-policy/);
  assert.doesNotMatch(privacy, /AgentMail/);
  assert.doesNotMatch(privacy, /PayPal/);
  assert.match(privacy, /Vercel/);
  assert.match(privacy, /https:\/\/www\.tiranaoffline\.com\/privacy/);
  assert.match(privacy, /Meta Conversions API/);
  assert.match(privacy, /hash SHA-256/);
  assert.match(privacy, /stesso identificativo evento viene usato per evitare il doppio conteggio/);
});

test("landing, offerta, checkout e thank you collegano la Privacy Policy", () => {
  for (const page of [landing, offer, checkout, thankYou]) {
    assert.match(page, /href="\/privacy"/);
  }
  assert.match(checkout, /href="\/privacy"/);
});

test("tutte le pagine commerciali mostrano titolare e sede nel footer", () => {
  for (const page of [landing, offer, checkout, thankYou]) {
    const footer = page.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0] || "";
    assert.match(footer, /Scalers SHPK/);
    assert.match(footer, /Rruga e Dibres, Tower Bridge 1, Nr\. 22/);
    assert.match(footer, /Tirana, Albania/);
  }
});

test("checkout richiede telefono e rende la ragione sociale condizionale al tipo azienda", () => {
  const phone = checkoutInput("phone");
  const referral = checkoutInput("referral");
  const companyName = checkoutInput("companyName");
  const privateType = checkout.match(/<input[^>]*name="customerType"[^>]*value="private"[^>]*>/)?.[0] || "";
  const companyType = checkout.match(/<input[^>]*name="customerType"[^>]*value="company"[^>]*>/)?.[0] || "";

  assert.ok(phone, "Manca il campo telefono nel checkout");
  assert.match(phone, /\btype="tel"/);
  assert.match(phone, /\bautocomplete="tel"/);
  assert.match(phone, /\brequired\b/);
  assert.ok(referral, "Manca il campo referral nel checkout");
  assert.doesNotMatch(referral, /\brequired\b/);
  assert.ok(companyName, "Manca il campo ragione sociale nel checkout");
  assert.match(companyName, /\bautocomplete="organization"/);
  assert.doesNotMatch(companyName, /\brequired\b/);
  assert.match(companyName, /\bdisabled\b/);
  assert.match(privateType, /\bchecked\b/);
  assert.match(privateType, /\brequired\b/);
  assert.match(companyType, /\brequired\b/);
  assert.match(checkout, /companyInput\.required = isCompany/);
  assert.doesNotMatch(checkout, /Tutti i campi sono obbligatori/);
});

test("il payload checkout include telefono, referral e ragione sociale", () => {
  assert.match(checkout, /phone:\s*String\(values\.phone/);
  assert.match(checkout, /referral:\s*String\(values\.referral/);
  assert.match(checkout, /customerType:\s*String\(values\.customerType/);
  assert.match(checkout, /companyName:\s*String\(values\.companyName/);
  assert.match(checkout, /fetch\('\/api\/bank-orders'/);
  assert.match(checkout, /fetch\('\/api\/stripe\/create-checkout-session'/);
});

test("checkout e thank you usano Stripe o bonifico senza esporre dati fiscali nella URL", () => {
  assert.match(checkout, /Pagamento sicuro con Stripe/);
  assert.match(checkout, /Bonifico bancario/);
  assert.match(checkout, /name="companyName"/);
  assert.match(checkout, /name="address"/);
  assert.match(checkout, /name="taxId"/);
  assert.match(checkout, /\/api\/bank-orders/);
  assert.match(checkout, /\/api\/stripe\/create-checkout-session/);
  assert.match(thankYou, /\/api\/stripe\/session\?session_id=/);
  assert.match(thankYou, /token=\$\{encodeURIComponent\(token\)\}/);
  assert.doesNotMatch(thankYou, /taxId|companyName|address=/);
  assert.match(funnel, /SCALERS SHPK/);
  assert.match(funnel, /AL66202111850000000011988925/);
  assert.match(funnel, /SGSBALTXXX/);
  assert.match(bankOrders, /PENDING_BANK_TRANSFER/);
});

test("Vercel espone la policy sulla root e sul percorso Tirana", () => {
  const sources = new Set(vercel.rewrites.map(({ source }) => source));
  assert.equal(sources.has("/privacy"), true);
  assert.equal(sources.has("/privacy/"), true);
  assert.equal(sources.has("/tirana/privacy"), true);
  assert.equal(sources.has("/tirana/privacy/"), true);
  assert.equal(sources.has("/registrazione"), true);
  assert.equal(sources.has("/tirana/registrazione"), true);
});

test("la Privacy Policy dichiara la raccolta della ragione sociale", () => {
  assert.match(privacy, /Dati di fatturazione:[\s\S]*tipo di acquirente[\s\S]*ragione sociale soltanto per aziende/i);
});
