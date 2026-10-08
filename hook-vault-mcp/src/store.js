// Database in memoria: dati seed inclusi nel pacchetto (data/) più i dati
// dell'utente salvati in HOOK_VAULT_DATA_DIR (ganci propri e reel importati).
// I file sono JSON semplici: niente dipendenze native, facile da versionare.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyHook } from "./hook-types.js";
import { mergeVideo } from "./normalize.js";

const PACKAGE_DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, path);
}

/** Minuscolo, senza accenti né punteggiatura: per confronti tolleranti. */
export function fold(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "il lo la le gli un una uno di da in con su per tra fra che e ed o non come piu del della dei delle nel nella al alla ai the a an of to in on for and or with how why what is are your my".split(" ")
);

function tokens(query) {
  return fold(query)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Punteggio di pertinenza: quante parole della query compaiono nei campi, pesate. */
function relevance(queryTokens, fields) {
  if (queryTokens.length === 0) return 0;
  let score = 0;
  for (const [text, weight] of fields) {
    const haystack = ` ${fold(text)} `;
    for (const t of queryTokens) if (haystack.includes(t)) score += weight;
  }
  return score;
}

export function median(values) {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Generatore pseudo-casuale riproducibile (mulberry32). */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Store {
  /**
   * @param {{dataDir?: string, packageData?: string}} options
   */
  constructor(options = {}) {
    this.packageData = options.packageData ?? PACKAGE_DATA;
    this.dataDir = options.dataDir ?? process.env.HOOK_VAULT_DATA_DIR ?? join(homedir(), ".hook-vault");
    this.userHooksPath = join(this.dataDir, "user-hooks.json");
    this.userVideosPath = join(this.dataDir, "user-videos.json");
    this.reload();
  }

  reload() {
    this.niches = readJson(join(this.packageData, "niches.json"), []);
    this.userNiches = readJson(join(this.dataDir, "user-niches.json"), []);
    for (const n of this.userNiches) if (!this.niches.some((x) => x.id === n.id)) this.niches.push(n);

    this.seedHooks = readJson(join(this.packageData, "hooks.json"), []);
    this.userHooks = readJson(this.userHooksPath, []);
    this.hooks = [...this.seedHooks, ...this.userHooks];

    const seedVideos = readJson(join(this.packageData, "videos.json"), []);
    this.userVideos = readJson(this.userVideosPath, []);
    const byCode = new Map();
    for (const v of seedVideos) byCode.set(v.shortcode, v);
    for (const v of this.userVideos) byCode.set(v.shortcode, mergeVideo(byCode.get(v.shortcode), v));
    this.videos = [...byCode.values()];
    // Riclassifica al caricamento: i miglioramenti del classificatore valgono
    // anche per i reel già salvati.
    for (const v of this.videos) v.hook_types = classifyHook(v.hook).map((t) => t.type);
    this.#computeOutliers();
  }

  /** outlier_score = views del reel / mediana delle views della sua nicchia principale. */
  #computeOutliers() {
    this.nicheMedians = new Map();
    for (const n of this.niches) {
      this.nicheMedians.set(n.id, median(this.videos.filter((v) => v.niches?.[0] === n.id).map((v) => v.views)));
    }
    for (const v of this.videos) {
      const m = this.nicheMedians.get(v.niches?.[0]);
      v.outlier_score = v.views != null && m ? Math.round((v.views / m) * 10) / 10 : null;
      v.engagement_rate =
        v.views && (v.likes != null || v.comments != null)
          ? Math.round((((v.likes ?? 0) + (v.comments ?? 0)) / v.views) * 10000) / 100
          : null;
    }
  }

  getNiche(id) {
    return this.niches.find((n) => n.id === id) ?? null;
  }

  /** Risolve una nicchia anche dal nome o da un sinonimo parziale. */
  resolveNiche(value) {
    if (!value) return null;
    const exact = this.getNiche(value);
    if (exact) return exact;
    // Corrispondenza parziale solo su inizio di parola, per evitare che "it"
    // finisca dentro "imprenditoria".
    const q = fold(value);
    if (q.length < 2) return null;
    const words = (n) => `${fold(n.id)} ${fold(n.name)}`.split(" ");
    return this.niches.find((n) => words(n).some((w) => w.startsWith(q)) || fold(n.name) === q) ?? null;
  }

  listNiches() {
    return this.niches.map((n) => {
      const videos = this.videos.filter((v) => v.niches?.includes(n.id));
      return {
        id: n.id,
        name: n.name,
        description: n.description,
        linkedin_audience: n.linkedin_audience,
        niche_hooks: this.hooks.filter((h) => h.niches.includes(n.id)).length,
        videos: videos.length,
        videos_with_transcript: videos.filter((v) => v.transcript).length,
        median_views: this.nicheMedians.get(n.id) ?? null,
      };
    });
  }

  /**
   * @param {{niche?: string, type?: string, query?: string, includeUniversal?: boolean, limit?: number, shuffleSeed?: number}} f
   */
  searchHooks(f = {}) {
    const includeUniversal = f.includeUniversal ?? true;
    const q = tokens(f.query);
    let list = this.hooks.filter((h) => {
      if (f.type && h.type !== f.type) return false;
      if (f.niche) {
        const inNiche = h.niches.includes(f.niche);
        const universal = h.niches.length === 0;
        if (!inNiche && !(includeUniversal && universal)) return false;
      }
      return true;
    });
    let scored = list.map((h) => ({
      hook: h,
      score:
        relevance(q, [
          [h.text, 3],
          [h.example, 2],
          [h.notes, 1],
        ]) + (f.niche && h.niches.includes(f.niche) ? 0.5 : 0),
    }));
    if (q.length) scored = scored.filter((s) => s.score >= 1);
    if (f.shuffleSeed != null) {
      const rand = seededRandom(f.shuffleSeed);
      scored = scored.map((s) => ({ ...s, score: s.score + rand() })).sort((a, b) => b.score - a.score);
    } else {
      scored.sort((a, b) => b.score - a.score);
    }
    return { total: scored.length, hooks: scored.slice(0, f.limit ?? 10).map((s) => s.hook) };
  }

  getHook(id) {
    return this.hooks.find((h) => h.id === id) ?? null;
  }

  addHook({ text, type, niches = [], example, notes }) {
    const id = `u${String(this.userHooks.length + 1).padStart(3, "0")}-${Date.now().toString(36)}`;
    const hook = { id, type, niches, text, example: example ?? text, source: "user", notes: notes ?? null, created_at: new Date().toISOString() };
    this.userHooks.push(hook);
    writeJsonAtomic(this.userHooksPath, this.userHooks);
    this.hooks.push(hook);
    return hook;
  }

  /**
   * @param {{niche?: string, query?: string, minViews?: number, language?: string, hookType?: string, withTranscript?: boolean, sort?: string, limit?: number}} f
   */
  searchVideos(f = {}) {
    const q = tokens(f.query);
    let list = this.videos.filter((v) => {
      if (f.niche && !v.niches?.includes(f.niche)) return false;
      if (f.minViews != null && (v.views ?? 0) < f.minViews) return false;
      if (f.language && v.language !== f.language) return false;
      if (f.hookType && !v.hook_types?.includes(f.hookType)) return false;
      if (f.withTranscript && !v.transcript) return false;
      return true;
    });
    let scored = list.map((v) => ({
      video: v,
      score: relevance(q, [
        [v.hook, 3],
        [v.caption, 1],
        [v.transcript, 1],
        [v.creator?.username, 2],
      ]),
    }));
    if (q.length) scored = scored.filter((s) => s.score > 0);
    const sort = f.sort ?? (q.length ? "relevance" : "views");
    const key = {
      relevance: (s) => s.score * 1e12 + (s.video.views ?? 0),
      views: (s) => s.video.views ?? -1,
      outlier: (s) => s.video.outlier_score ?? -1,
      engagement: (s) => ((s.video.views ?? 0) >= 1000 ? s.video.engagement_rate ?? -1 : -1),
      recent: (s) => (s.video.posted_at ? Date.parse(s.video.posted_at) : 0),
    }[sort];
    scored.sort((a, b) => key(b) - key(a));
    return { total: scored.length, sort, videos: scored.slice(0, f.limit ?? 10).map((s) => s.video) };
  }

  getVideo(shortcodeOrUrl) {
    const code = extractShortcode(shortcodeOrUrl);
    return this.videos.find((v) => v.shortcode === code) ?? null;
  }

  /** Salva (o aggiorna) reel nel file utente e ricarica gli indici. */
  upsertVideos(videos) {
    const byCode = new Map(this.userVideos.map((v) => [v.shortcode, v]));
    let added = 0;
    let updated = 0;
    for (const v of videos) {
      const existing = byCode.get(v.shortcode) ?? this.videos.find((x) => x.shortcode === v.shortcode);
      if (existing) updated++;
      else added++;
      const { outlier_score, engagement_rate, ...clean } = mergeVideo(existing, v);
      byCode.set(v.shortcode, clean);
    }
    this.userVideos = [...byCode.values()];
    writeJsonAtomic(this.userVideosPath, this.userVideos);
    this.reload();
    return { added, updated };
  }

  nicheReport(nicheId, topN = 5) {
    const niche = this.getNiche(nicheId);
    if (!niche) return null;
    const videos = this.videos.filter((v) => v.niches?.includes(nicheId));
    const withViews = videos.filter((v) => v.views != null).sort((a, b) => b.views - a.views);
    // I tipi di gancio si misurano sul quartile migliore, così si vede cosa
    // distingue i reel che performano da quelli medi.
    const topQuartile = withViews.slice(0, Math.max(1, Math.ceil(withViews.length / 4)));
    const countTypes = (list) => {
      const counts = {};
      for (const v of list) for (const t of v.hook_types ?? []) counts[t] = (counts[t] ?? 0) + 1;
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count, share: Math.round((count / Math.max(1, list.length)) * 100) }));
    };
    const creators = {};
    for (const v of withViews) {
      const u = v.creator?.username;
      if (!u) continue;
      creators[u] ??= { username: u, reels: 0, total_views: 0 };
      creators[u].reels++;
      creators[u].total_views += v.views;
    }
    const durations = withViews.map((v) => v.duration_s).filter((d) => d != null);
    const topDurations = topQuartile.map((v) => v.duration_s).filter((d) => d != null);
    const languages = {};
    for (const v of videos) languages[v.language] = (languages[v.language] ?? 0) + 1;
    return {
      niche: { id: niche.id, name: niche.name, linkedin_audience: niche.linkedin_audience },
      sample: {
        videos: videos.length,
        with_views: withViews.length,
        with_transcript: videos.filter((v) => v.transcript).length,
        languages,
      },
      views: {
        median: median(withViews.map((v) => v.views)),
        top_quartile_min: topQuartile.at(-1)?.views ?? null,
        max: withViews[0]?.views ?? null,
      },
      duration_s: { median_all: median(durations), median_top_quartile: median(topDurations) },
      hook_types_top_quartile: countTypes(topQuartile),
      hook_types_all: countTypes(withViews),
      top_creators: Object.values(creators)
        .sort((a, b) => b.total_views - a.total_views)
        .slice(0, 5),
      top_videos: withViews.slice(0, topN).map(summarizeVideo),
    };
  }
}

export function extractShortcode(value) {
  const s = String(value ?? "").trim();
  const m = s.match(/instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]+)/i);
  return m ? m[1] : s.replace(/\/+$/, "");
}

/** Versione compatta di un video per le liste (senza trascrizione completa). */
export function summarizeVideo(v) {
  return {
    shortcode: v.shortcode,
    url: v.url,
    niches: v.niches,
    creator: v.creator?.username ?? null,
    hook: v.hook,
    hook_source: v.hook_source,
    hook_types: v.hook_types,
    language: v.language,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    engagement_rate: v.engagement_rate,
    outlier_score: v.outlier_score,
    duration_s: v.duration_s,
    posted_at: v.posted_at,
    has_transcript: Boolean(v.transcript),
  };
}
