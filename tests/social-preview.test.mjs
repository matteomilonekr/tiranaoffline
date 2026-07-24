import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url));
const landing = read("../public/tirana/index.html").toString("utf8");
const preview = read("../public/tirana/assets/tiranaoffline-link-preview-v2.jpg");
const whatsappGroupPreview = read(
  "../public/tirana/assets/workshop-builder-pass-whatsapp.jpg",
);

const previewUrl =
  "https://www.tiranaoffline.com/tirana/assets/tiranaoffline-link-preview-v2.jpg";

test("la landing espone la foto nelle anteprime Open Graph e X", () => {
  assert.match(landing, new RegExp(`<meta property="og:image" content="${previewUrl}">`));
  assert.match(landing, new RegExp(`<meta name="twitter:image" content="${previewUrl}">`));
  assert.match(landing, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(landing, /<meta property="og:image:type" content="image\/jpeg">/);
  assert.match(landing, /<meta property="og:image:width" content="1200">/);
  assert.match(landing, /<meta property="og:image:height" content="630">/);
});

test("l’asset social è un JPEG leggero e compatibile con WhatsApp", () => {
  assert.deepEqual([...preview.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(preview.byteLength < 300_000);
});

test("l’anteprima del gruppo WhatsApp è un JPEG distribuibile", () => {
  assert.deepEqual([...whatsappGroupPreview.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(whatsappGroupPreview.byteLength < 300_000);
});
