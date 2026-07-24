import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const thankYou = read("../public/tirana/thank-you/index.html");
const checkout = read("../public/tirana/checkout/index.html");
const vercel = JSON.parse(read("../vercel.json"));

test("la pagina finale recupera un biglietto firmato e mostra le coordinate", () => {
  assert.match(thankYou, /const query = new URLSearchParams\(window\.location\.search\)/);
  assert.match(thankYou, /query\.get\('token'\)/);
  assert.match(thankYou, /`\/api\/bank-orders\?token=\$\{encodeURIComponent\(token\)\}`/);
  for (const field of ["order-id", "plan-name", "plan-price", "beneficiary", "iban", "swift", "reference"]) {
    assert.match(thankYou, new RegExp(`id="${field}"`));
  }
});

test("il biglietto resta in attesa fino alla conferma", () => {
  assert.match(thankYou, /In attesa di conferma/i);
  assert.match(thankYou, /biglietto resta in attesa finché non ricevi la conferma/i);
  assert.doesNotMatch(thankYou, /pagamento completato|posto confermato/i);
});

test("genera un biglietto social verticale con piano e accessi dinamici", () => {
  assert.match(thankYou, /id="social-ticket"/);
  assert.match(thankYou, /aspect-ratio:\s*4\s*\/\s*5/);
  assert.match(thankYou, /id="ticket-social-plan"/);
  assert.match(thankYou, /id="ticket-social-holder"/);
  assert.match(thankYou, /id="ticket-social-access"/);
  assert.match(thankYou, /setText\('ticket-social-plan', planName\)/);
  assert.match(thankYou, /setText\('ticket-social-access', participantLabel \+ ' · ' \+ accessLabel\)/);
  assert.match(thankYou, /holder\.textContent = sharedTicket\.displayName/);
  assert.match(thankYou, /Prenotazione registrata · conferma dopo accredito/i);
  assert.match(thankYou, /id="ticket-screenshot-button"/);
  assert.match(thankYou, /ticket-screenshot-mode/);
  assert.match(thankYou, /setTicketScreenshotMode\(true\)/);
});

test("il biglietto social usa la palette viola fissa della landing", () => {
  assert.match(thankYou, /--ticket-accent:\s*#9b6cff/);
  assert.match(thankYou, /--ticket-accent-rgb:\s*155,\s*108,\s*255/);
  assert.match(thankYou, /linear-gradient\(165deg, #fffefa 0%, #faf7ff 51%, #d9c6ff 70%, #8850ee 100%\)/);
  assert.match(thankYou, /background-size:\s*32px 32px/);
  assert.match(thankYou, /box-shadow:\s*7px 7px 0 var\(--ticket-accent\)/);
  assert.match(thankYou, /font-variation-settings:\s*"wdth" 80, "wght" 800/);
  assert.doesNotMatch(thankYou, /body\[data-plan-id=/);
});

test("il biglietto social non espone dati personali, bancari o codici sensibili", () => {
  const socialTicket = thankYou.match(/<article class="ticket-social"[\s\S]*?<\/article>/)?.[0] || "";
  assert.ok(socialTicket);
  assert.doesNotMatch(socialTicket, /id="(?:order-id|plan-price|bank-amount|beneficiary|iban|swift|reference)"/i);
  assert.doesNotMatch(socialTicket, /TIR-ORD-|token=/i);
});

test("il token firmato viene conservato per il refresh e rimosso dalla barra indirizzi", () => {
  assert.match(thankYou, /sessionStorage\.setItem\('tirana-bank-ticket-token'/);
  assert.match(thankYou, /sessionStorage\.setItem\('tirana-share-ticket-token'/);
  assert.match(thankYou, /sessionStorage\.setItem\('tirana-stripe-session-id'/);
  assert.match(thankYou, /isStripePaid \? '\?payment=stripe' : isFree \? '\?payment=free' : '\?payment=bank'/);
});

test("SOLOFREEPASS mostra un biglietto confermato senza coordinate bancarie", () => {
  assert.match(thankYou, /result\?\.status === 'CONFIRMED_FREE'/);
  assert.match(thankYou, /\(!isFree && !isStripePaid && !result\?\.bank\)/);
  assert.match(thankYou, /Pass gratuito <span class="gradient-word">confermato\.<\/span>/);
  assert.match(thankYou, /Nessun pagamento è richiesto/);
  assert.match(thankYou, /CONFERMATO · ACCESSO GRATUITO/);
  assert.match(thankYou, /document\.getElementById\('bank-details'\)\.hidden = true/);
  assert.match(thankYou, /document\.getElementById\('confirmation-request'\)\.hidden = true/);
  assert.match(thankYou, /isStripePaid \? '\?payment=stripe' : isFree \? '\?payment=free' : '\?payment=bank'/);
});

test("la revenue Stripe viene tracciata soltanto dopo la verifica paid", () => {
  assert.match(thankYou, /data-analytics-context="thank-you"/);
  const verified = thankYou.indexOf("const isStripePaid = result?.status === 'PAID_STRIPE'");
  const tracked = thankYou.indexOf("TiranaAnalytics?.trackPurchase?.(");
  assert.notEqual(verified, -1);
  assert.notEqual(tracked, -1);
  assert.ok(verified < tracked);
  assert.match(
    thankYou,
    /trackPurchase\?\.\(\s*result\.plan,\s*result\.orderId,\s*result\.trackingEventId/s,
  );
});

test("la condivisione usa solo il token pubblico e offre fallback social", () => {
  assert.match(thankYou, /get\('share'\)/);
  assert.match(thankYou, /fetch\(`\/api\/shared-ticket\?token=/);
  assert.match(thankYou, /window\.location\.origin \+ '\/ticket\?token=' \+ encodeURIComponent\(shareToken\)/);
  assert.match(thankYou, /id="ticket-native-share"/);
  assert.match(thankYou, /id="ticket-share-whatsapp"/);
  assert.match(thankYou, /id="ticket-share-linkedin"/);
  assert.match(thankYou, /typeof navigator\.share === 'function'/);
  assert.match(thankYou, /navigator\.clipboard\.writeText\(ticketSharePayload\.url\)/);
  const shareBlock = thankYou.match(/const renderSocialTicket[\s\S]*?const setTicketScreenshotMode/)?.[0] || "";
  assert.ok(shareBlock);
  assert.doesNotMatch(shareBlock, /tirana-bank-ticket-token|\?token=' \+ encodeURIComponent\(token\)/);
});

test("la pagina richiede lo screenshot e offre WhatsApp ed email", () => {
  assert.match(thankYou, /inviaci lo screenshot del ticket/i);
  assert.match(thankYou, /ricevuta del bonifico/i);
  assert.match(thankYou, /allegare manualmente l’immagine/i);
  assert.match(thankYou, /id="confirm-whatsapp"/);
  assert.match(thankYou, /ticketHolderName \|\| sharedTicket\?\.displayName/);
  assert.match(thankYou, /'Ciao, sono ' \+ confirmationName \+ '\. Ti invio lo screenshot del mio ticket Tirana Offline per confermarlo\./);
  assert.match(thankYou, /Codice biglietto: ' \+ result\.orderId/);
  assert.match(thankYou, /confirmWhatsapp\.href = 'https:\/\/wa\.me\/393759916344\?text='/);
  assert.doesNotMatch(thankYou.match(/const confirmationMessage[\s\S]*?const confirmWhatsapp/)?.[0] || "", /ordine/i);
  assert.match(thankYou, /id="confirm-email"/);
  assert.match(thankYou, /mailto:evento@tiranaoffline\.com/);
});

test("il checkout conserva il nome completo per personalizzare WhatsApp", () => {
  assert.match(checkout, /sessionStorage\.setItem\(\s*'tirana-ticket-holder-name'/);
  assert.match(checkout, /customer\.firstName \+ ' ' \+ customer\.lastName/);
  assert.match(thankYou, /sessionStorage\.getItem\('tirana-ticket-holder-name'\)/);
});

test("mostra il gruppo Workshop + Builder PASS con immagine di anteprima", () => {
  assert.match(thankYou, /class="whatsapp-group-card"/);
  assert.match(thankYou, /Iscriviti al gruppo dell’evento Workshop \+ Builder PASS/);
  assert.match(thankYou, /\/tirana\/assets\/workshop-builder-pass-whatsapp\.jpg/);
  assert.match(thankYou, /alt="Anteprima del gruppo WhatsApp Workshop \+ Builder PASS"/);
  assert.match(thankYou, /https:\/\/chat\.whatsapp\.com\/INqwNswve0XB5PENoWuUX9\?s=cl&amp;p=i&amp;ilr=0&amp;amv=0/);
  assert.match(thankYou, /class="whatsapp-group-cta"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
});

test("mostra la Piramide di Tirana con mappa e link Google Maps", () => {
  const location = thankYou.match(/<section class="event-location-card"[\s\S]*?<\/section>/)?.[0] || "";
  assert.ok(location);
  assert.match(location, /id="event-location-title">Piramide di Tirana<\/h2>/);
  assert.match(location, /4 e 5 settembre 2026 · Tirana, Albania/);
  assert.match(location, /<iframe[^>]+www\.google\.com\/maps\/embed/);
  assert.match(location, /41\.3230699%2C19\.8214613/);
  assert.match(location, /loading="lazy"/);
  assert.match(location, /title="Mappa della Piramide di Tirana, location dell’evento"/);
  assert.match(location, /href="https:\/\/www\.google\.it\/maps\/place\/Piramide\+di\+Tirana\//);
  assert.match(location, /target="_blank" rel="noopener noreferrer"/);

  const thankYouHeaders = vercel.headers.filter(({ source }) => source.includes("thank-you"));
  assert.equal(thankYouHeaders.length, 2);
  for (const route of thankYouHeaders) {
    const csp = route.headers.find(({ key }) => key === "Content-Security-Policy")?.value || "";
    assert.match(csp, /frame-src https:\/\/www\.google\.com/);
  }
});

test("checkout e pagina finale non contengono integrazioni PayPal", () => {
  assert.doesNotMatch(checkout, /paypal\.com|paypalobjects|venmo|\/api\/paypal/i);
  assert.doesNotMatch(thankYou, /paypal\.com|paypalobjects|venmo|\/api\/paypal/i);
  assert.match(checkout, /catalog\.paymentMethods\?\.includes\('stripe'\)/);
  assert.match(checkout, /\/api\/stripe\/create-checkout-session/);
  assert.match(thankYou, /\/api\/stripe\/session\?session_id=/);
});
