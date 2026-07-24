import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const home = await readFile(new URL("public/tirana/index.html", root), "utf8");
const offer = await readFile(new URL("public/tirana/offerta/index.html", root), "utf8");
const checkout = await readFile(
  new URL("public/tirana/checkout/index.html", root),
  "utf8",
);
const vercel = await readFile(new URL("vercel.json", root), "utf8");

const pages = [["home", home], ["offerta", offer]];

const ANDRE_VIDEO =
  "https://www.loom.com/embed/e351d0857ccb4270ad43d6e447505064";
const CLAUDIO_VIDEO =
  "https://www.loom.com/embed/ea08c466f64749a1adae62d5522f2f75";
const DISTRIBUTED_HOME_VIDEOS = [
  "https://www.loom.com/embed/9acc55001f934cd888d722217bd938e3",
  "https://www.loom.com/embed/ab59611fe5544beca89244a29080dd30",
  "https://www.loom.com/embed/9187ac3df771499b847ba1c092c26a58",
  "https://www.loom.com/embed/71007ccbe7514c958683d2a61b558458",
  "https://www.loom.com/embed/fcffe2089642470998e80ae4306a7076",
  "https://www.loom.com/embed/3c255a6273d84549a4173f58ebabf18a",
  "https://www.loom.com/embed/e026ecfecabb445dbdd071a2baf9c0e3",
];

test("home e offerta mostrano i due casi principali verificati", () => {
  for (const [name, page] of pages) {
    assert.match(page, /André/i, `${name}: André mancante`);
    assert.match(page, /70K/i, `${name}: risultato André mancante`);
    assert.match(page, /Claudio Pasinetti/i, `${name}: Claudio mancante`);
    assert.match(page, /2K\s*(?:→|&rarr;)\s*10K/i, `${name}: crescita Claudio mancante`);
  }
});

test("i video originali si caricano soltanto al clic su una copertina accessibile", () => {
  for (const [name, page] of pages) {
    for (const video of [ANDRE_VIDEO, CLAUDIO_VIDEO]) {
      assert.ok(page.includes(video), `${name}: video mancante ${video}`);
    }

    const facades = [
      ...page.matchAll(
        /<button\b[^>]*data-testimonial-video="[^"]+"[^>]*>[\s\S]*?<\/button>/gi,
      ),
    ].map(([facade]) => facade);

    assert.ok(facades.length >= 2, `${name}: servono almeno due video`);
    for (const facade of facades) {
      assert.match(facade, /\baria-label="[^"]+"/i, `${name}: etichetta mancante`);
      assert.match(facade, /<img\b[^>]*\bloading="lazy"/i, `${name}: poster lazy mancante`);
    }

    assert.doesNotMatch(page, /<iframe\b[^>]*loom\.com\/embed\//i);
    assert.match(page, /document\.createElement\('iframe'\)/);
    assert.match(page, /startsWith\('https:\/\/www\.loom\.com\/embed\/'\)/);
  }
});

test("ogni pagina contestualizza i risultati come non garantiti", () => {
  for (const [name, page] of pages) {
    assert.match(page, /non (?:rappresentano|una) (?:una )?garanzia/i, `${name}: disclaimer mancante`);
  }
});

test("la landing distribuisce molte recensioni reali lungo il percorso", () => {
  const journeyBands = home.match(/<aside\b[^>]*class="[^"]*journey-proof[^"]*"[\s\S]*?<\/aside>/gi) ?? [];
  const journeyReviews = home.match(/class="journey-review"/g) ?? [];
  const journeyVideos = home.match(/class="journey-video-card"/g) ?? [];
  const finalReviews = home.match(/class="proof-review"/g) ?? [];

  assert.equal(journeyBands.length, 3, "servono tre proof signal distribuiti nella landing");
  assert.equal(journeyReviews.length, 18, "ogni proof signal deve contenere sei recensioni");
  assert.equal(journeyVideos.length, 7, "i proof signal devono distribuire sette testimonianze video");
  assert.ok(finalReviews.length >= 9, "la sezione risultati deve contenere almeno nove recensioni");

  const positions = {
    problem: home.indexOf('id="problema"'),
    signal01: home.indexOf('class="journey-proof signal-01"'),
    autonomy: home.indexOf('id="autonomia"'),
    workshopMap: home.indexOf('id="workshop-map"'),
    signal02: home.indexOf('class="journey-proof signal-02"'),
    orgChart: home.indexOf('id="organigramma"'),
    signal03: home.indexOf('class="journey-proof signal-03"'),
    ticket: home.indexOf('id="ticket"'),
  };

  assert.ok(positions.problem < positions.signal01 && positions.signal01 < positions.autonomy);
  assert.ok(positions.workshopMap < positions.signal02 && positions.signal02 < positions.orgChart);
  assert.ok(positions.orgChart < positions.signal03 && positions.signal03 < positions.ticket);

  const reviewers = [
    "Andrea Fiore",
    "Vittorio Zitoli",
    "Mattia Pastrello",
    "Luigi Virginio",
    "Andrea Quaranta",
    "Giacomo Simioni",
    "Alberto Giuliani",
    "Andrea Michelin",
    "Michele Bet",
    "Max Pavesio",
    "Victor",
    "Mirko Falleri",
    "Alessandro Venturelli",
    "Nicolò Tassinari",
    "Niccolò Gianotto",
    "Marco Famà",
    "Federico T.",
    "Nicola Caporale",
    "Antonio Pesacane",
    "Lorenzo Matarazzo",
    "Salvatore Maniglio",
    "Massimo Ciotta",
    "Claudio Pasinetti",
    "Valerio Tesi",
    "Pasquale Sarnelli",
  ];

  for (const reviewer of reviewers) {
    assert.match(home, new RegExp(reviewer, "i"), `${reviewer}: recensione mancante`);
  }

  for (const band of journeyBands) {
    assert.match(band, /joinscalers\.com/i);
  }
});

test("la home carica sette video distribuiti solo dopo il clic", () => {
  for (const video of DISTRIBUTED_HOME_VIDEOS) {
    assert.ok(home.includes(video), `video distribuito mancante: ${video}`);
  }

  const distributedPosters = [
    "testimonial-video-mattia-pastrello.webp",
    "testimonial-video-andrea-quaranta.webp",
    "testimonial-video-giacomo-simioni.webp",
    "testimonial-video-luigi-virginio.webp",
    "testimonial-video-francesco-cinori.webp",
    "testimonial-video-stefano.webp",
    "testimonial-video-michele-bet.webp",
  ];

  for (const poster of distributedPosters) {
    assert.match(home, new RegExp(`src="/tirana/assets/${poster.replace(".", "\\.")}"[^>]*loading="lazy"`, "i"));
  }

  const allFacades = home.match(/data-testimonial-video="https:\/\/www\.loom\.com\/embed\//g) ?? [];
  assert.equal(allFacades.length, 9, "la home deve mostrare nove video in totale");
  assert.doesNotMatch(home, /<iframe\b[^>]*loom\.com\/embed\//i);
});

test("l'offerta usa copertine testimonial locali compatibili con la CSP", () => {
  assert.match(offer, /src="\/tirana\/assets\/testimonial-andre\.jpg"/i);
  assert.match(offer, /src="\/tirana\/assets\/testimonial-claudio\.jpg"/i);
  assert.doesNotMatch(offer, /cdn\.loom\.com/i);

  const config = JSON.parse(vercel);
  const offerHeaders = config.headers.filter(({ source }) =>
    source.includes("offerta"),
  );

  assert.equal(offerHeaders.length, 2);
  for (const route of offerHeaders) {
    const csp = route.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;
    assert.match(csp, /frame-src https:\/\/www\.loom\.com/);
    assert.doesNotMatch(csp, /img-src[^;]*loom/i);
  }
});

test("il checkout non autorizza provider esterni di pagamento o video", () => {
  const config = JSON.parse(vercel);
  const checkoutHeaders = config.headers.filter(({ source }) =>
    source.includes("checkout"),
  );

  assert.equal(checkoutHeaders.length, 2);
  for (const route of checkoutHeaders) {
    const csp = route.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;
    assert.ok(csp, `${route.source}: CSP mancante`);
    assert.doesNotMatch(csp, /paypal|venmo|loom/i);
    assert.match(csp, /connect-src 'self'/);
  }
  assert.doesNotMatch(checkout, /paypal\.com|paypalobjects|venmo\.com|\/api\/paypal/i);
});

test("il checkout usa copertine locali e apre le testimonianze solo dopo il clic", () => {
  assert.match(checkout, /src="\/tirana\/assets\/testimonial-andre\.jpg"/i);
  assert.match(checkout, /src="\/tirana\/assets\/testimonial-claudio\.jpg"/i);
  assert.doesNotMatch(checkout, /cdn\.loom\.com/i);
  assert.doesNotMatch(checkout, /document\.createElement\(['"]iframe['"]\)/i);

  const links = [
    ...checkout.matchAll(
      /<a\b[^>]*href="https:\/\/www\.loom\.com\/share\/[^"]+"[^>]*>[\s\S]*?<\/a>/gi,
    ),
  ].map(([link]) => link);

  assert.equal(links.length, 2);
  for (const link of links) {
    assert.match(link, /target="_blank"/i);
    assert.match(link, /rel="noopener noreferrer"/i);
    assert.match(link, /aria-label="[^"]+"/i);
  }
});

test("offerta e checkout usano recensioni attribuite con ritratti locali", () => {
  const sharedReviews = [
    ["Nicola Caporale", "testimonial-nicola-caporale.jpg"],
    ["Michele Bet", "testimonial-michele-bet.jpg"],
  ];

  for (const [name, page] of [["offerta", offer], ["checkout", checkout]]) {
    assert.doesNotMatch(page, /Fonte:\s*testimonianze Scalers\+/i);
    assert.doesNotMatch(page, /https:\/\/www\.joinscalers\.com\/#casi-studio/i);
    for (const [person, portrait] of sharedReviews) {
      assert.match(page, new RegExp(person, "i"), `${name}: ${person} mancante`);
      assert.match(
        page,
        new RegExp(`src="/tirana/assets/${portrait.replace(".", "\\.")}"`, "i"),
        `${name}: ritratto di ${person} mancante`,
      );
    }
  }

  assert.match(offer, /Andrea Michelin/i);
  assert.match(
    offer,
    /src="\/tirana\/assets\/testimonial-andrea-michelin\.jpg"/i,
  );
});
