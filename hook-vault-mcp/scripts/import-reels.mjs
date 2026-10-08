#!/usr/bin/env node
// Importa nel database seed (data/videos.json) risposte grezze di ScrapeCreators
// salvate su file, ad esempio l'output di una ricerca reel o di una trascrizione.
//
//   node scripts/import-reels.mjs search --niche marketing --query "marketing tips" risposta.json [...]
//   node scripts/import-reels.mjs transcripts mappa.json   # { "<shortcode>": "testo trascritto" }
//   node scripts/import-reels.mjs transcripts-dir cartella/ # un file <shortcode>.txt per video
//
// Accetta sia il JSON nativo di ScrapeCreators sia il wrapper {"result": "..."}
// restituito dai client MCP. I duplicati vengono uniti per shortcode.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyTranscript, extractReels, extractTranscript, mergeVideo, normalizeReel } from "../src/normalize.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const videosPath = process.env.VIDEOS_PATH ?? join(root, "data", "videos.json");
const niches = JSON.parse(readFileSync(join(root, "data", "niches.json"), "utf8")).map((n) => n.id);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

function load() {
  return existsSync(videosPath) ? JSON.parse(readFileSync(videosPath, "utf8")) : [];
}

function save(videos) {
  const order = new Map(niches.map((id, i) => [id, i]));
  videos.sort(
    (a, b) =>
      (order.get(a.niches[0]) ?? 99) - (order.get(b.niches[0]) ?? 99) || (b.views ?? -1) - (a.views ?? -1)
  );
  writeFileSync(videosPath, JSON.stringify(videos, null, 2) + "\n");
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const videos = load();
const index = new Map(videos.map((v, i) => [v.shortcode, i]));

if (command === "search") {
  if (!args.niche || !niches.includes(args.niche)) {
    console.error(`--niche obbligatoria, una tra: ${niches.join(", ")}`);
    process.exit(1);
  }
  let added = 0;
  let merged = 0;
  for (const file of args._) {
    const reels = extractReels(JSON.parse(readFileSync(file, "utf8")));
    for (const raw of reels) {
      if (raw?.is_video === false || raw?.is_ad) continue;
      const video = normalizeReel(raw, { niche: args.niche, query: args.query });
      if (!video) continue;
      if (index.has(video.shortcode)) {
        const i = index.get(video.shortcode);
        videos[i] = mergeVideo(videos[i], video);
        merged++;
      } else {
        index.set(video.shortcode, videos.length);
        videos.push(video);
        added++;
      }
    }
  }
  save(videos);
  console.log(`niche=${args.niche} nuovi=${added} aggiornati=${merged} totale=${videos.length}`);
} else if (command === "transcripts") {
  let applied = 0;
  for (const file of args._) {
    const map = JSON.parse(readFileSync(file, "utf8"));
    for (const [shortcode, payload] of Object.entries(map)) {
      const text = typeof payload === "string" ? payload.trim() : extractTranscript(payload);
      if (!text || !index.has(shortcode)) continue;
      const i = index.get(shortcode);
      videos[i] = applyTranscript(videos[i], text);
      applied++;
    }
  }
  save(videos);
  console.log(`trascrizioni applicate=${applied}`);
} else if (command === "transcripts-dir") {
  let applied = 0;
  for (const dir of args._) {
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
      const shortcode = name.slice(0, -4);
      const text = readFileSync(join(dir, name), "utf8").trim();
      if (!text || !index.has(shortcode)) continue;
      const i = index.get(shortcode);
      videos[i] = applyTranscript(videos[i], text);
      applied++;
    }
  }
  save(videos);
  console.log(`trascrizioni applicate=${applied}`);
} else {
  console.error("Uso: import-reels.mjs search --niche <id> --query <q> <file...> | transcripts <file...> | transcripts-dir <dir...>");
  process.exit(1);
}
