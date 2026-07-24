import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const ticket = read("../public/tirana/ticket/index.html");
const vercel = JSON.parse(read("../vercel.json"));

test("la pagina pubblica mostra un ticket personalizzato nello stile della landing", () => {
  assert.match(ticket, /id="ticket-holder"/);
  assert.match(ticket, /id="ticket-plan"/);
  assert.match(ticket, /id="ticket-access"/);
  assert.match(ticket, /fetch\('\/api\/shared-ticket\?token='/);
  assert.match(ticket, /aspect-ratio:\s*4\s*\/\s*5/);
  assert.match(ticket, /linear-gradient\(165deg, #fffefa 0%, #faf7ff 51%, #d9c6ff 70%, #8850ee 100%\)/);
  assert.match(ticket, /--violet:\s*#9b6cff/);
  assert.match(ticket, /background-size:\s*32px 32px/);
  assert.match(ticket, /Scalers SHPK/);
  assert.match(ticket, /Rruga e Dibres, Tower Bridge 1, Nr\. 22/);
});

test("il ticket pubblico offre share nativo, WhatsApp, LinkedIn e screenshot", () => {
  assert.match(ticket, /id="native-share"/);
  assert.match(ticket, /id="share-whatsapp"/);
  assert.match(ticket, /id="share-linkedin"/);
  assert.match(ticket, /typeof navigator\.share === 'function'/);
  assert.match(ticket, /navigator\.clipboard\.writeText\(sharePayload\.url\)/);
  assert.match(ticket, /id="focus-ticket"/);
  assert.match(ticket, /ticket-focus/);
  assert.match(ticket, /Per Instagram: apri “Solo ticket”, fai uno screenshot/i);
});

test("la pagina condivisibile non contiene coordinate bancarie o codici ordine", () => {
  assert.doesNotMatch(ticket, /IBAN|SWIFT|beneficiary|bank-amount|TIR-ORD-|registrationId|orderId/i);
  assert.match(ticket, /Prenotazione registrata · conferma dopo accredito/i);
  assert.match(ticket, /noindex, nofollow/i);
});

test("Vercel espone il ticket pubblico con cache e referrer disabilitati", () => {
  const rewrites = vercel.rewrites || [];
  assert.ok(rewrites.some(({ source, destination }) => source === "/ticket" && destination === "/tirana/ticket/index.html"));
  assert.ok(rewrites.some(({ source, destination }) => source === "/tirana/ticket" && destination === "/tirana/ticket/index.html"));
  const ticketHeaders = (vercel.headers || []).find(({ source }) => source === "/ticket(.*)");
  assert.ok(ticketHeaders);
  assert.ok(ticketHeaders.headers.some(({ key, value }) => key === "Cache-Control" && /no-store/.test(value)));
  assert.ok(ticketHeaders.headers.some(({ key, value }) => key === "Referrer-Policy" && value === "no-referrer"));
});
