import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const home = await readFile(new URL("public/tirana/index.html", root), "utf8");
const offer = await readFile(new URL("public/tirana/offerta/index.html", root), "utf8");

const ACTIVE_PLAN_IDS = [
  "solo-mid",
  "solo-full",
  "agency-mid",
  "agency-full",
  "company-mid",
  "company-full",
];

function offerCard(planId) {
  const marker = `data-price-plan="${planId}"`;
  const start = offer.indexOf(marker);
  assert.notEqual(start, -1, `Card mancante per ${planId}`);
  const end = offer.indexOf("</article>", start);
  assert.notEqual(end, -1, `Chiusura card mancante per ${planId}`);
  return offer.slice(start, end);
}

test("la capienza è unica: 150 posti totali, di cui 60 Builder", () => {
  for (const page of [home, offer]) {
    assert.match(page, /150 posti (?:complessivi|totali|iniziali)/i);
  }

  assert.match(offer, /60 (?:posti )?Builder/i);
  assert.doesNotMatch(offer, />\s*(?:5|7|10) rimasti\s*</i);
  assert.match(offer, /60[^.]{0,120}(?:compresi|inclusi)[^.]{0,120}150/i);
});

test("la pagina offerta espone i sei piani attivi", () => {
  const cardPlanIds = [...offer.matchAll(/data-price-plan="([a-z0-9-]+)"/g)].map(
    ([, planId]) => planId,
  );

  assert.equal(cardPlanIds.length, ACTIVE_PLAN_IDS.length);
  assert.deepEqual(new Set(cardPlanIds), new Set(ACTIVE_PLAN_IDS));

  for (const planId of ACTIVE_PLAN_IDS) {
    assert.match(offer, new RegExp(`href="/checkout\\?plan=${planId}"`));
  }
});

test("ogni piano mostra Full Price sopra al prezzo attuale anche senza catalogo", () => {
  for (const planId of ACTIVE_PLAN_IDS) {
    const card = offerCard(planId);
    const fullPrice = card.indexOf('class="full-price"');
    const currentPrice = card.indexOf('class="price" data-plan-price');

    assert.notEqual(fullPrice, -1, `Full Price mancante per ${planId}`);
    assert.notEqual(currentPrice, -1, `Prezzo attuale mancante per ${planId}`);
    assert.ok(fullPrice < currentPrice, `Full Price deve precedere il prezzo per ${planId}`);
  }

  assert.doesNotMatch(offer, /Verifica nel checkout|Catalogo in aggiornamento/i);
});

test("il selettore Solo mostra Solo OS come sottotitolo", () => {
  assert.match(
    offer,
    /id="tab-solo"[\s\S]*?<strong>Solo<\/strong><small>Solo OS<\/small>/,
  );
  assert.doesNotMatch(
    offer,
    /id="tab-solo"[\s\S]*?<small>Professionisti<\/small>/,
  );
});

test("ogni segmento mostra Workshop e Builder come opzioni distinte", () => {
  const segmentCards = [
    ["solo-mid", /Workshop Pass/i],
    ["solo-full", /Builder Pass \+ Solo OS/i],
    ["agency-mid", /Workshop Pass \+ Agency OS/i],
    ["agency-full", /Builder Pass \+ Agency OS/i],
    ["company-mid", /Workshop Pass \+ Company OS/i],
    ["company-full", /Builder Pass \+ Company OS/i],
  ];

  for (const [planId, name] of segmentCards) {
    const card = offerCard(planId);
    assert.match(card, name);
  }
});

test("promessa e stack operativo sono coerenti in tutti i piani", () => {
  assert.match(home, /Claude Code/i);
  assert.match(home, /Codex/i);
  assert.match(home, /Hermes Agent/i);

  for (const planId of ACTIVE_PLAN_IDS.filter((id) => id !== "solo-mid")) {
    const stack = /Claude Code IDE \+ CLI, Codex Desktop \+ CLI e Hermes Agent/i;
    assert.match(offerCard(planId), stack);
  }

  const solo = offerCard("solo-full");
  assert.match(solo, /Solo OS/i);
  assert.match(solo, /Live Building/i);

  const soloWorkshop = offerCard("solo-mid");
  assert.doesNotMatch(soloWorkshop, /Solo OS/i);
  assert.match(soloWorkshop, /Assessment \+ roadmap operativa/i);
});

test("la location e Matteo sono presenti nel percorso della landing", () => {
  const problemStart = home.indexOf('<section class="section" id="problema">');
  const clarityStart = home.indexOf('<div class="clarity-path reveal"', problemStart);
  const locationStart = home.indexOf('<section class="section venue-section" id="location">');
  const autonomyStart = home.indexOf('<section class="section autonomy-section" id="autonomia">');

  assert.notEqual(problemStart, -1);
  assert.notEqual(clarityStart, -1);
  assert.notEqual(locationStart, -1);
  assert.notEqual(autonomyStart, -1);
  assert.ok(problemStart < clarityStart);
  assert.ok(clarityStart < autonomyStart);
  const locationSection = home.slice(locationStart, home.indexOf("</section>", locationStart));
  assert.match(locationSection, /tirana-venue-auditorium\.webp/);
  assert.match(locationSection, /tirana-live-stage-matteo\.webp/);
});

test("la vecchia nomenclatura commerciale e gli ancoraggi non sono più mostrati", () => {
  assert.doesNotMatch(offer, />\s*(?:Mid-ticket|Full-ticket)\s*</i);
  assert.doesNotMatch(offer, /Valore completo/i);
  assert.doesNotMatch(offer, /60 (?:posti )?Full/i);
});

test("il selettore profilo scorre con la pagina senza coprire le offerte", () => {
  const segmentRules = [...offer.matchAll(/\.segment-shell\s*\{([^}]+)\}/g)].map(
    ([, declarations]) => declarations,
  );
  assert.ok(segmentRules.length >= 1);
  assert.match(segmentRules[0], /position:\s*relative/);
  for (const declarations of segmentRules) {
    assert.doesNotMatch(declarations, /position:\s*sticky/);
    assert.doesNotMatch(declarations, /(?:^|;)\s*top\s*:/);
  }
});
