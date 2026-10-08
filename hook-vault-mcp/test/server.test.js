import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { ScrapeCreatorsClient } from "../src/scrapecreators.js";
import { fakeFetch, fixture, makeStore } from "./helpers.js";

async function connect(scraper = new ScrapeCreatorsClient(undefined)) {
  const { server, store } = createServer({ store: makeStore(), scraper });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content[0].text;
    return { isError: Boolean(res.isError), text, data: res.isError ? null : JSON.parse(text) };
  };
  return { client, call, store };
}

test("espone tutti i tool e i prompt", async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      "analyze_hook",
      "discover_reels",
      "fill_hook",
      "get_video",
      "import_reel",
      "linkedin_post_brief",
      "list_niches",
      "niche_report",
      "save_hook",
      "score_linkedin_hook",
      "search_hooks",
      "search_videos",
    ]
  );
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ["piano-settimanale", "post-da-reel"]);
  const prompt = await client.getPrompt({ name: "post-da-reel", arguments: { niche: "marketing" } });
  assert.match(prompt.messages[0].content.text, /search_videos/);
});

test("flusso completo: nicchie → reel → gancio → brief → punteggio", async () => {
  const { call } = await connect();
  const niches = await call("list_niches");
  assert.equal(niches.data.niches.length, 13);
  assert.equal(niches.data.scrapecreators_configured, false);

  const videos = await call("search_videos", { niche: "marketing", sort: "outlier", limit: 5 });
  assert.equal(videos.data.videos[0].shortcode, "VID001");

  const detail = await call("get_video", { video: "https://www.instagram.com/reel/VID001/" });
  assert.match(detail.data.video.transcript, /47%/);
  assert.ok(detail.data.linkedin_templates_same_type.every((h) => h.type === "risultato"));

  const analysis = await call("analyze_hook", { text: detail.data.video.hook, niche: "marketing" });
  assert.equal(analysis.data.types[0].type, "risultato");
  assert.ok(analysis.data.linkedin_templates.length > 0);

  const brief = await call("linkedin_post_brief", {
    topic: "abbassare il costo per lead",
    video: "VID001",
    goal: "lead",
    values: { percentuale: "47%", elemento: "i primi 3 secondi del video" },
  });
  assert.equal(brief.data.niche.id, "marketing");
  assert.equal(brief.data.source_reel.url, "https://www.instagram.com/reel/VID001/");
  assert.equal(brief.data.suggested_hooks.length, 5);
  assert.ok(brief.data.suggested_hooks.every((h) => h.type === "risultato"));
  assert.ok(brief.data.suggested_hooks.some((h) => h.prefilled.includes("47%")));

  const score = await call("score_linkedin_hook", { text: "Abbiamo abbassato il costo per lead del 47%.\n\nCambiando una sola cosa." });
  assert.ok(score.data.score >= 80);

  const filled = await call("fill_hook", { hook_id: "h006", values: { numero: "7", cose: "x" } });
  assert.match(filled.data.text, /^7 cose/);
});

test("errori chiari per nicchia inesistente e API key mancante", async () => {
  const { call } = await connect();
  const bad = await call("search_hooks", { niche: "astrologia" });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /non trovata/);
  const noKey = await call("discover_reels", { niche: "marketing" });
  assert.equal(noKey.isError, true);
  assert.match(noKey.text, /SCRAPECREATORS_API_KEY/);
});

test("discover_reels e import_reel salvano i reel nel database", async () => {
  const fetch = fakeFetch({
    "/v2/instagram/reels/search": fixture("reels-search.json"),
    "/v2/instagram/media/transcript": fixture("transcript.json"),
    "/v1/instagram/post": fixture("single-post.json"),
  });
  const { call, store } = await connect(new ScrapeCreatorsClient("test-key", fetch));

  const found = await call("discover_reels", { niche: "agenzie-freelance", query: "agency tips", transcripts: 1 });
  assert.equal(found.isError, false, found.text);
  assert.equal(found.data.added, 2);
  assert.equal(found.data.credits_used, 2);
  assert.equal(fetch.calls[0].searchParams.get("query"), "agency tips");
  assert.equal(store.getVideo("AAA111").hook_source, "transcript");

  const imported = await call("import_reel", { url: "https://www.instagram.com/reel/DDD444/", niche: "vendite" });
  assert.equal(imported.data.added, 1);
  assert.equal(imported.data.video.views, 4651);
  const saved = await call("save_hook", { text: "Ho chiuso [numero] clienti con un solo post", niches: ["vendite"] });
  assert.equal(saved.isError, false, saved.text);
  assert.equal(saved.data.saved.source, "user");
  assert.equal(saved.data.saved.type, "risultato");
});
