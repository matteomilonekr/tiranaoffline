import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const publicFiles = [
  "public/tirana/index.html",
  "public/tirana/offerta/index.html",
  "public/tirana/checkout/index.html",
  "public/tirana/registrazione/index.html",
  "public/tirana/privacy/index.html",
  "public/tirana/thank-you/index.html",
  "public/tirana/ticket/index.html",
];

const pages = await Promise.all(
  publicFiles.map(async (file) => [
    file,
    await readFile(new URL(file, root), "utf8"),
  ]),
);
const bankOrders = await readFile(new URL("api/bank-orders.js", root), "utf8");
const analytics = await readFile(
  new URL("public/tirana/assets/analytics.js", root),
  "utf8",
);

test("tutte le superfici Tirana usano il nome AI Bootcamp", () => {
  for (const [file, page] of pages) {
    assert.match(page, /AI Bootcamp|>Bootcamp</i, `${file}: AI Bootcamp mancante`);
    assert.doesNotMatch(
      page,
      /AI Acceleration|>\s*Acceleration\s*</i,
      `${file}: nome precedente ancora presente`,
    );
  }
});

test("email del biglietto e categorie analytics usano AI Bootcamp", () => {
  assert.match(bankOrders, />BOOTCAMP<\/td>/);
  assert.doesNotMatch(bankOrders, />ACCELERATION<\/td>/);
  assert.match(analytics, /item_category: 'AI Bootcamp '/);
  assert.match(analytics, /content_category: 'AI Bootcamp '/);
  assert.doesNotMatch(analytics, /AI Acceleration/);
});
