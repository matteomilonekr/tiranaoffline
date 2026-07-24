import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkout = readFileSync(
  new URL("../public/tirana/checkout/index.html", import.meta.url),
  "utf8",
);

test("il box dati acquirente resta scuro e mostra in bianco i valori dei campi", () => {
  assert.match(
    checkout,
    /\.buyer-section\s*\{[\s\S]*?color-scheme:\s*dark;[\s\S]*?linear-gradient\(145deg,[\s\S]*?color:\s*var\(--paper\);/,
  );
  assert.match(
    checkout,
    /\.buyer-section \.field input,\s*\.buyer-section \.field select\s*\{[\s\S]*?background:\s*rgba\(5,5,7,\.62\);[\s\S]*?color:\s*#fff;/,
  );
  assert.match(
    checkout,
    /\.buyer-section \.field input:-webkit-autofill[\s\S]*?-webkit-text-fill-color:\s*#fff;/,
  );
  assert.doesNotMatch(
    checkout,
    /\.buyer-section\s*\{[\s\S]*?color-scheme:\s*light;/,
  );
});
