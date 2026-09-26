import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("public/micro-offer/index.html", root), "utf8");
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

test("Vercel espone la pagina Micro Offer OS su /micro-offer", () => {
  const rewrites = new Map(vercel.rewrites.map(({ source, destination }) => [source, destination]));
  assert.equal(rewrites.get("/micro-offer"), "/micro-offer/index.html");
  assert.equal(rewrites.get("/micro-offer/"), "/micro-offer/index.html");

  const fallback = vercel.rewrites.find(({ destination }) => destination === "/index.html");
  const fallbackPattern = new RegExp(`^${fallback.source}$`);
  assert.equal(fallbackPattern.test("/micro-offer"), false, "il fallback non deve intercettare /micro-offer");
  assert.equal(fallbackPattern.test("/pagina-inesistente"), true);
});

test("la pagina è in italiano e non riprende brand o contatti del sito di riferimento", () => {
  assert.match(page, /<html lang="it">/);
  assert.match(page, /<title>Micro Offer OS \| Il tuo primo cliente in 24 ore<\/title>/);
  assert.doesNotMatch(page, /Sell While You Sleep|SWYS|Productized Coach|effortlessscale|Zac Hansen|sellwhileyousleep/i);
  assert.doesNotMatch(page, /\$\d/, "i prezzi devono essere in euro");
});

test("ogni prezzo mostrato coincide con il prezzo dell'offerta", () => {
  assert.match(page, /priceLabel: "€14,95"/);
  const prices = page.match(/€\d+,\d{2}/g) || [];
  assert.ok(prices.length >= 10);
  assert.deepEqual([...new Set(prices)], ["€14,95"]);
});

test("tutti gli asset locali usati dalla pagina esistono in public/", () => {
  const paths = [...page.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((match) => match[1]);
  assert.ok(paths.length > 10);
  for (const path of paths) {
    assert.ok(existsSync(new URL(`public${decodeURI(path)}`, root)), `${path} non esiste in public/`);
  }
});

test("ogni pulsante d'acquisto apre il pop-up in due passaggi", () => {
  const ctas = page.match(/data-cta-checkout/g) || [];
  assert.ok(ctas.length >= 8);
  assert.match(page, /<div id="optin" class="so-overlay" hidden>/);
  assert.match(page, /Passo 1 di 2/);
  assert.match(page, /name="first_name"/);
  assert.match(page, /name="email"/);
  assert.match(page, /checkoutUrl: ""/, "il checkout parte vuoto finché non viene configurato");
  assert.match(page, /prefilled_email/);
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
