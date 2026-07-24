import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pagePaths = [
  "public/tirana/index.html",
  "public/tirana/offerta/index.html",
  "public/tirana/checkout/index.html",
  "public/tirana/thank-you/index.html",
  "public/tirana/privacy/index.html",
];
const pages = await Promise.all(
  pagePaths.map(async (path) => [path, await readFile(new URL(path, root), "utf8")]),
);
const chromeScript = await readFile(
  new URL("public/tirana/assets/event-chrome.js", root),
  "utf8",
);
const chromeStyles = await readFile(
  new URL("public/tirana/assets/event-chrome.css", root),
  "utf8",
);

test("le pagine Tirana caricano la top bar e il contatto WhatsApp condivisi", () => {
  for (const [path, page] of pages) {
    assert.match(page, /\/tirana\/assets\/event-chrome\.css/, `${path}: CSS mancante`);
    assert.match(page, /\/tirana\/assets\/event-chrome\.js/, `${path}: JS mancante`);
  }
});

test("la top bar comunica il prossimo aumento di pricing e porta ai ticket", () => {
  assert.match(
    chromeScript,
    /🚨<\/span>\s*<span class="event-announcement__message">PROSSIMO AUMENTO DI PRICING IL 31 LUGLIO/,
  );
  assert.match(chromeScript, /href="\/offerta"/);
  assert.match(
    chromeStyles,
    /\.event-announcement\s*\{[\s\S]*background:\s*#FF6B6B;[\s\S]*color:\s*#FFFDF5;/,
  );
  assert.match(
    chromeStyles,
    /\.event-announcement__link\s*\{[\s\S]*color:\s*#FFFDF5;/,
  );
  assert.match(chromeStyles, /font:\s*800 12px\/1 "IBM Plex Mono"/);
  assert.match(chromeStyles, /font-size:\s*clamp\(10px, 2\.75vw, 11px\)/);
});

test("il pulsante WhatsApp è accessibile, sicuro e fisso in basso a destra", () => {
  assert.match(chromeScript, /https:\/\/wa\.me\/393759916344/);
  assert.match(chromeScript, /aria-label", "Contatta Scalers su WhatsApp"/);
  assert.match(chromeScript, /<svg/);
  assert.match(chromeStyles, /\.event-whatsapp\s*\{[\s\S]*position:\s*fixed/);
  assert.match(chromeStyles, /right:/);
  assert.match(chromeStyles, /bottom:/);
});
