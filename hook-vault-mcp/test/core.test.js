import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyHook, HOOK_TYPE_IDS } from "../src/hook-types.js";
import { applyTranscript, extractHook, extractReels, extractSinglePost, extractTranscript, normalizeReel } from "../src/normalize.js";
import { fillTemplate, placeholders, scoreOpening } from "../src/linkedin.js";
import { extractShortcode } from "../src/store.js";
import { fixture, makeStore, root } from "./helpers.js";

const types = (text) => classifyHook(text).map((t) => t.type);

test("classifica ganci italiani e inglesi", () => {
  assert.equal(types("3 errori che ti costano clienti")[0], "lista");
  assert.ok(types("Il cold calling è morto. Ecco cosa funziona").includes("contrarian"));
  assert.ok(types("Nel 2019 ho perso il mio primo cliente da 50k").includes("storia"));
  assert.deepEqual(types("Come trovare clienti su LinkedIn senza ads"), ["come-fare"]);
  assert.ok(types("Perché il 90% dei freelance resta povero").includes("curiosita"));
  assert.ok(types("Unpopular opinion: you don't need a niche").includes("contrarian"));
  assert.ok(types("I made $10k in 30 days").includes("risultato"));
  assert.deepEqual(types(""), []);
});

test("ogni gancio del database ha tipo, nicchie valide ed esempio", () => {
  const hooks = JSON.parse(readFileSync(join(root, "data", "hooks.json"), "utf8"));
  const niches = new Set(JSON.parse(readFileSync(join(root, "data", "niches.json"), "utf8")).map((n) => n.id));
  const ids = new Set();
  for (const h of hooks) {
    assert.ok(HOOK_TYPE_IDS.includes(h.type), h.id);
    for (const n of h.niches) assert.ok(niches.has(n), `${h.id}: ${n}`);
    assert.ok(h.example && !/\[[^\]]+\]/.test(h.example), `${h.id}: esempio non compilato`);
    assert.ok(!ids.has(h.id), `id duplicato ${h.id}`);
    ids.add(h.id);
  }
  for (const n of niches) assert.ok(hooks.some((h) => h.niches.includes(n)), `nessun gancio per ${n}`);
});

test("estrae il gancio dalla prima riga senza hashtag", () => {
  assert.equal(extractHook("3 errori che ti costano clienti #marketing #business\n\naltro"), "3 errori che ti costano clienti");
  assert.equal(extractHook("#solo #hashtag\nVera prima riga"), "Vera prima riga");
  const long = "Questa è una frase iniziale abbastanza lunga da essere tagliata. " + "parole ".repeat(40);
  assert.equal(extractHook(long), "Questa è una frase iniziale abbastanza lunga da essere tagliata.");
});

test("normalizza la risposta della ricerca reel", () => {
  const reels = extractReels(fixture("reels-search.json"));
  assert.equal(reels.length, 3);
  const v = normalizeReel(reels[0], { niche: "marketing", query: "marketing tips" });
  assert.equal(v.shortcode, "AAA111");
  assert.equal(v.views, 120000);
  assert.equal(v.duration_s, 41);
  assert.equal(v.hook, "3 errori che ti costano clienti");
  assert.equal(v.hook_types[0], "lista");
  assert.equal(v.language, "it");
  assert.deepEqual(v.niches, ["marketing"]);
});

test("accetta il wrapper {result: string} dei client MCP", () => {
  const wrapped = { result: JSON.stringify({ metadata: { success: true }, data: fixture("reels-search.json"), error: null }) };
  assert.equal(extractReels(wrapped).length, 3);
});

test("normalizza un post singolo preferendo video_play_count", () => {
  const v = normalizeReel(extractSinglePost(fixture("single-post.json")), { niche: "vendite" });
  assert.equal(v.shortcode, "DDD444");
  assert.equal(v.views, 4651);
  assert.equal(v.likes, 153);
  assert.equal(v.comments, 17);
  assert.equal(v.url, "https://www.instagram.com/reel/DDD444/");
  assert.ok(v.hook_types.includes("storia"));
  assert.equal(v.posted_at, new Date(1739210435 * 1000).toISOString());
});

test("la trascrizione sostituisce il gancio della caption", () => {
  const v = normalizeReel(extractSinglePost(fixture("single-post.json")), { niche: "vendite" });
  const text = extractTranscript(fixture("transcript.json"));
  const next = applyTranscript(v, text);
  assert.equal(next.hook_source, "transcript");
  assert.equal(next.hook, "Smetti di inseguire clienti che non ti pagano.");
  assert.ok(next.hook_types.includes("contrarian"));
});

test("compila i segnaposto ignorando maiuscole e accenti", () => {
  const t = "[Numero] cose che avrei voluto sapere prima di [traguardo].";
  assert.deepEqual(placeholders(t), ["Numero", "traguardo"]);
  assert.equal(fillTemplate(t, { numero: "7", Traguardo: "assumere" }), "7 cose che avrei voluto sapere prima di assumere.");
  assert.equal(fillTemplate(t, { numero: "7" }), "7 cose che avrei voluto sapere prima di [traguardo].");
});

test("score_linkedin_hook premia aperture forti e penalizza quelle deboli", () => {
  const strong = scoreOpening("Ho perso 18.000 € per un solo errore.\n\nTe lo racconto così non lo fai tu.");
  const weak = scoreOpening("Oggi voglio condividere con voi alcune riflessioni sul mondo del marketing #marketing #ads https://example.com");
  assert.ok(strong.score >= 80, JSON.stringify(strong.checks));
  assert.ok(weak.score < 40, JSON.stringify(weak.checks));
  assert.ok(weak.warnings.some((w) => w.includes("link")));
  assert.ok(scoreOpening("Sono felice di annunciare che...").score <= 40);
});

test("estrae lo shortcode da URL diversi", () => {
  assert.equal(extractShortcode("https://www.instagram.com/reel/DXrKqMOgZdT/?igsh=abc"), "DXrKqMOgZdT");
  assert.equal(extractShortcode("https://instagram.com/p/ABC_123/"), "ABC_123");
  assert.equal(extractShortcode("https://www.instagram.com/someuser/reel/XYZ/"), "XYZ");
  assert.equal(extractShortcode("XYZ"), "XYZ");
});

test("store: filtri per nicchia, ganci universali e outlier", () => {
  const store = makeStore();
  const onlyNiche = store.searchHooks({ niche: "vendite", includeUniversal: false, limit: 50 });
  assert.ok(onlyNiche.hooks.length > 0 && onlyNiche.hooks.every((h) => h.niches.includes("vendite")));
  const withUniversal = store.searchHooks({ niche: "vendite", limit: 200 });
  assert.ok(withUniversal.total > onlyNiche.total);
  assert.equal(store.searchHooks({ type: "domanda", limit: 50 }).hooks.every((h) => h.type === "domanda"), true);

  const top = store.searchVideos({ niche: "marketing", sort: "outlier" }).videos;
  assert.equal(top[0].shortcode, "VID001");
  assert.ok(top[0].outlier_score > 1);
  assert.equal(store.searchVideos({ query: "costo per lead" }).videos[0].shortcode, "VID001");
  assert.equal(store.resolveNiche("Vendite & B2B").id, "vendite");
});

test("store: salva ganci e reel nella cartella utente", () => {
  const store = makeStore();
  const hook = store.addHook({ text: "Prova [x]", type: "domanda", niches: ["marketing"] });
  assert.ok(store.getHook(hook.id));
  const reloaded = new (store.constructor)({ packageData: store.packageData, dataDir: store.dataDir });
  assert.ok(reloaded.getHook(hook.id), "il gancio deve sopravvivere al riavvio");

  const v = normalizeReel(extractReels(fixture("reels-search.json"))[1], { niche: "agenzie-freelance" });
  assert.deepEqual(store.upsertVideos([v]), { added: 1, updated: 0 });
  assert.deepEqual(store.upsertVideos([v]), { added: 0, updated: 1 });
  assert.equal(store.getVideo("BBB222").niches[0], "agenzie-freelance");
});

test("report nicchia", () => {
  const store = makeStore();
  const report = store.nicheReport("marketing");
  assert.equal(report.sample.videos, 2);
  assert.equal(report.views.max, 500000);
  assert.equal(report.top_videos[0].shortcode, "VID001");
});
