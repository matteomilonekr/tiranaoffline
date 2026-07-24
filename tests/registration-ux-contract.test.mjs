import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [home, checkout, offer] = await Promise.all([
  readFile(new URL("public/tirana/index.html", root), "utf8"),
  readFile(new URL("public/tirana/checkout/index.html", root), "utf8"),
  readFile(new URL("public/tirana/offerta/index.html", root), "utf8"),
]);

test("il blocco host precede Zero teoria e il manifesto Stop prompting è rimosso", () => {
  const hostPosition = home.indexOf('id="host"');
  const workshopPosition = home.indexOf('id="workshop-map"');

  assert.notEqual(hostPosition, -1);
  assert.notEqual(workshopPosition, -1);
  assert.ok(hostPosition < workshopPosition);
  assert.doesNotMatch(home, /Stop prompting|Start looping/i);
  assert.doesNotMatch(home, /Capisci e usa l’AI/i);
});

test("la landing non mostra più il blocco lista prioritaria", () => {
  assert.doesNotMatch(home, /id="aggiornamenti"/);
  assert.doesNotMatch(home, /id="launch-updates-form"/);
  assert.doesNotMatch(home, /Lista prioritaria \/ Tirana/i);
  assert.doesNotMatch(home, /Non perdere il lancio/i);
});

test("il Manifesto 02 collega i risultati alla CTA di accesso", () => {
  const resultsPosition = home.indexOf('id="risultati"');
  const manifestoPosition = home.indexOf("Manifesto 02");
  const accessPosition = home.indexOf('id="accesso"');

  assert.notEqual(resultsPosition, -1);
  assert.notEqual(manifestoPosition, -1);
  assert.notEqual(accessPosition, -1);
  assert.ok(resultsPosition < manifestoPosition);
  assert.ok(manifestoPosition < accessPosition);
  assert.match(home, /L’AI non ti sostituisce,[\s\S]*ti accelera/i);
});

test("il manifesto iniziale include tutti i profili richiesti", () => {
  const start = home.indexOf('class="manifesto-audience"');
  const end = home.indexOf("</ul>", start);
  const audience = home.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  for (const profile of ["Coach", "SMM", "Liberi professionisti", "Content creator"]) {
    assert.match(audience, new RegExp(`<li>${profile}</li>`, "i"));
  }
});

test("il checkout distingue privato e azienda e richiede la ragione sociale soltanto all’azienda", () => {
  assert.match(checkout, /name="firstName"[^>]*placeholder="Il tuo nome"[^>]*required/);
  assert.match(checkout, /name="lastName"[^>]*placeholder="Il tuo cognome"[^>]*required/);
  assert.doesNotMatch(checkout, /placeholder="(?:Matteo|Milone)"/i);
  assert.match(checkout, /name="phone"[^>]*type="tel"[^>]*required/);
  assert.match(checkout, /name="customerType" value="private" checked required/);
  assert.match(checkout, /name="customerType" value="company" required/);
  assert.match(checkout, /name="companyName"[^>]*autocomplete="organization"[^>]*disabled/);
  assert.doesNotMatch(checkout.match(/<input[^>]*name="companyName"[^>]*>/)?.[0] || "", /\srequired(?:\s|>)/);

  const referralField = checkout.match(/<input[^>]*name="referral"[^>]*>/)?.[0] || "";
  assert.ok(referralField);
  assert.doesNotMatch(referralField, /\srequired(?:\s|>)/);
  assert.match(checkout, /phone:\s*String\(values\.phone/);
  assert.match(checkout, /referral:\s*String\(values\.referral/);
  assert.match(checkout, /customerType:\s*String\(values\.customerType/);
  assert.match(checkout, /companyName:\s*String\(values\.companyName/);
  assert.match(checkout, /companyInput\.required = isCompany/);
});

test("il checkout non mostra il messaggio tecnico sulla verifica del prezzo", () => {
  assert.doesNotMatch(checkout, /il prezzo è sempre verificato dal server/i);
});

test("il menu mobile include la CTA per acquistare i biglietti", () => {
  assert.match(
    home,
    /<a class="menu-buy" href="\/offerta">Acquista i biglietti/,
  );
  assert.match(
    home,
    /<a class="nav-cta" href="\/offerta">\s*Acquista i biglietti/,
  );
});

test("offerta e checkout sono accessibili senza form preliminare", () => {
  assert.doesNotMatch(offer, /registration-gate\.js/);
  assert.doesNotMatch(checkout, /registration-gate\.js/);
  assert.match(home, /href="\/offerta"/);
});

test("la hero mobile mostra prima il pass, poi la full immersion e infine lo stack", () => {
  assert.match(
    home,
    /grid-template-areas:\s*"pass"\s*"copy"\s*"modules"/,
  );
  assert.match(home, /Due giorni di full immersion/);
  assert.match(home, />Full immersion<\/span>/);
  assert.match(home, /<div class="hero-kicker[^>]*>[\s\S]*?<span>Offline<\/span>/);
  assert.doesNotMatch(home, /<span>Online \+ Offline<\/span>/i);
  assert.match(
    home,
    /Per freelancer, SMM, advertiser, liberi professionisti, coach, content creator, imprenditori e aziende/i,
  );
  assert.match(home, /class="hero-module-rail-head"/);
  assert.match(home, /<ol class="hero-module-list">/);
  assert.match(home, /class="hero-module-count"[^>]*>08<\/span>/);
  assert.doesNotMatch(home, /\.hero-module:first-child\s*\{/);
});

test("la hero non mostra più la Piramide dietro al pass", () => {
  assert.doesNotMatch(home, /\.pass-scene::before\s*\{/);
  assert.doesNotMatch(home, /ai-acceleration-pyramid-gpt-image-2\.webp/);
  assert.match(home, /\.orbit\s*\{[\s\S]*?z-index:\s*1/);
  assert.match(home, /\.lanyard\s*\{[\s\S]*?top:\s*2%[\s\S]*?z-index:\s*2/);
  assert.match(home, /\.manifesto-bar\s*\{[\s\S]*?margin:\s*24px 8px 12px/);
});

test("la sezione location mostra anche l’esterno della Piramide di Tirana", () => {
  assert.match(home, /class="venue-gallery-card venue-gallery-landmark"/);
  assert.match(home, /src="\/tirana\/assets\/piramide-tirana-esterno\.webp"/);
  assert.match(home, />La Piramide di Tirana\.<\/strong>/);
});

test("il Solo Mid include il corso completo Claude Code 2.0 nella Skool", () => {
  const start = offer.indexOf('data-price-plan="solo-mid"');
  const end = offer.indexOf("</article>", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(
    offer.slice(start, end),
    /Corso completo Claude Code 2\.0 nella Skool/i,
  );
  assert.match(home, /corso completo Claude Code 2\.0 nella Skool/i);
});
