// Trasforma le risposte grezze di ScrapeCreators (o del wrapper MCP che le
// contiene) in record "video" uniformi, ed estrae il gancio da caption o
// trascrizione. Usato sia dallo script di seed sia dal server a runtime.

import { classifyHook } from "./hook-types.js";

/** Rimuove i wrapper noti finché non resta il payload utile. */
export function unwrapPayload(input) {
  let value = input;
  for (let i = 0; i < 5; i++) {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return value;
      }
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof value.result === "string") {
        value = value.result;
        continue;
      }
      if (value.data && typeof value.data === "object" && ("metadata" in value || "error" in value)) {
        value = value.data;
        continue;
      }
    }
    break;
  }
  return value;
}

/** Restituisce la lista di reel contenuta in una risposta di ricerca. */
export function extractReels(payload) {
  const data = unwrapPayload(payload);
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["reels", "items", "posts", "results"]) {
    if (Array.isArray(data[key])) return data[key].map((item) => item?.media ?? item);
  }
  if (data.data && typeof data.data === "object") return extractReels(data.data);
  const single = extractSinglePost(data);
  return single ? [single] : [];
}

/** Gestisce la risposta di /v1/instagram/post (xdt_shortcode_media). */
export function extractSinglePost(payload) {
  const data = unwrapPayload(payload);
  if (!data || typeof data !== "object") return null;
  if (data.xdt_shortcode_media) return data.xdt_shortcode_media;
  if (data.data?.xdt_shortcode_media) return data.data.xdt_shortcode_media;
  if (data.shortcode || data.code) return data;
  return null;
}

/** Estrae il testo della trascrizione da /v2/instagram/media/transcript. */
export function extractTranscript(payload) {
  const data = unwrapPayload(payload);
  if (typeof data === "string") return data.trim() || null;
  if (!data || typeof data !== "object") return null;
  if (typeof data.transcript === "string") return data.transcript.trim() || null;
  if (Array.isArray(data.transcripts)) {
    const text = data.transcripts
      .map((t) => (typeof t === "string" ? t : t?.text ?? t?.transcript ?? ""))
      .join(" ")
      .trim();
    return text || null;
  }
  if (typeof data.text === "string") return data.text.trim() || null;
  if (data.data) return extractTranscript(data.data);
  return null;
}

function captionText(raw) {
  if (typeof raw.caption === "string") return raw.caption;
  if (raw.caption && typeof raw.caption.text === "string") return raw.caption.text;
  const edge = raw.edge_media_to_caption?.edges?.[0]?.node?.text;
  return typeof edge === "string" ? edge : "";
}

function toNumber(...values) {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function toIsoDate(value) {
  if (value == null) return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const IT_WORDS = new Set(
  "il lo la gli le un una che di da per non con come più sono hai questo questa perché anche cosa tutti fare ho se ma mi ti si del della dei nel nella alla sul tuo tua".split(" ")
);
const EN_WORDS = new Set(
  "the and you your to of is that this for with are it in on how why what if my i we they be have just not do don't can will more".split(" ")
);

/** Stima grezza della lingua (it, en o altro) contando parole funzionali. */
export function detectLanguage(text) {
  // Testi in alfabeti non latini (hindi, arabo, tamil...) non sono né it né en,
  // anche se contengono qualche parola inglese.
  const letters = String(text || "").match(/\p{L}/gu) ?? [];
  const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length;
  if (letters.length > 0 && latin / letters.length < 0.6) return "other";
  const words = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 3) return "unknown";
  let it = 0;
  let en = 0;
  for (const w of words) {
    if (IT_WORDS.has(w)) it++;
    if (EN_WORDS.has(w)) en++;
  }
  if (it === 0 && en === 0) return "other";
  if (it > en) return "it";
  if (en > it) return "en";
  return "unknown";
}

/**
 * Prende la prima riga "parlante" di un testo come gancio: salta righe vuote,
 * hashtag e menzioni, e taglia alla prima frase se la riga è lunga.
 */
export function extractHook(text, maxLength = 180) {
  if (!text) return "";
  // NFKC riporta a lettere normali i caratteri "decorativi" (𝐉𝐨𝐛 → Job).
  const lines = String(text)
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^([#@][\p{L}\p{N}_.]+\s*)+$/u.test(l));
  if (lines.length === 0) return "";
  let hook = lines[0]
    .replace(/(\s*[#@][\p{L}\p{N}_.]+)+\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  if (hook.length > maxLength) {
    const sentence = hook.match(/^(.{20,}?[.!?…])(\s|$)/u);
    hook = sentence ? sentence[1] : hook.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";
  }
  return hook;
}

/**
 * Normalizza un reel grezzo nel formato del database.
 * @param {object} raw - oggetto reel di ScrapeCreators
 * @param {{niche?: string, query?: string, collectedAt?: string}} meta
 */
export function normalizeReel(raw, meta = {}) {
  if (!raw || typeof raw !== "object") return null;
  const shortcode = raw.shortcode ?? raw.code;
  if (!shortcode) return null;
  const caption = captionText(raw).trim();
  const owner = raw.owner ?? raw.user ?? {};
  // video_play_count è il numero di visualizzazioni mostrato da Instagram;
  // la ricerca reel restituisce solo video_view_count, usato come ripiego.
  const views = toNumber(raw.video_play_count, raw.play_count, raw.ig_play_count, raw.video_view_count, raw.view_count);
  const likes = toNumber(raw.like_count, raw.edge_media_preview_like?.count, raw.edge_liked_by?.count);
  const comments = toNumber(
    raw.comment_count,
    raw.edge_media_to_parent_comment?.count,
    raw.edge_media_to_comment?.count,
    raw.edge_media_preview_comment?.count
  );
  const hook = extractHook(caption);
  const classification = classifyHook(hook);
  return {
    shortcode,
    url: raw.url ?? `https://www.instagram.com/reel/${shortcode}/`,
    niches: meta.niche ? [meta.niche] : [],
    queries: meta.query ? [meta.query] : [],
    creator: {
      username: owner.username ?? null,
      full_name: owner.full_name ?? null,
      verified: Boolean(owner.is_verified),
    },
    caption: caption.length > 2000 ? caption.slice(0, 2000) + "…" : caption,
    hook,
    hook_source: "caption",
    hook_types: classification.map((c) => c.type),
    transcript: null,
    language: detectLanguage(caption),
    views,
    likes,
    comments,
    duration_s: toNumber(raw.video_duration) != null ? Math.round(toNumber(raw.video_duration)) : null,
    posted_at: toIsoDate(raw.taken_at ?? raw.taken_at_timestamp),
    is_paid_partnership: Boolean(raw.is_paid_partnership),
    audio: raw.clips_music_attribution_info
      ? {
          title: raw.clips_music_attribution_info.song_name ?? null,
          artist: raw.clips_music_attribution_info.artist_name ?? null,
          original: Boolean(raw.clips_music_attribution_info.uses_original_audio),
        }
      : null,
    collected_at: meta.collectedAt ?? new Date().toISOString(),
  };
}

/**
 * Il gancio parlato: le prime frasi della trascrizione, finché non si arriva
 * ad almeno ~60 caratteri (una frase sola come "Excuse me guys." non basta).
 */
export function extractSpokenHook(transcript, minLength = 60, maxLength = 220) {
  const sentences = String(transcript || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/u)
    .filter(Boolean);
  let hook = "";
  for (const sentence of sentences.slice(0, 3)) {
    const next = hook ? `${hook} ${sentence}` : sentence;
    if (hook && next.length > maxLength) break;
    hook = next;
    if (hook.length >= minLength) break;
  }
  if (hook.length > maxLength) hook = hook.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";
  return hook;
}

/**
 * Aggiorna gancio e tipi quando arriva la trascrizione del video. Se il parlato
 * non è in italiano o inglese, la trascrizione resta ma il gancio della caption
 * non viene sostituito.
 */
export function applyTranscript(video, transcript) {
  if (!transcript) return video;
  const transcriptLanguage = detectLanguage(transcript);
  const next = { ...video, transcript, transcript_language: transcriptLanguage };
  const spokenHook = extractSpokenHook(transcript);
  const usable = spokenHook && detectLanguage(spokenHook) !== "other";
  if (usable && (transcriptLanguage === "it" || transcriptLanguage === "en")) {
    next.hook = spokenHook;
    next.hook_source = "transcript";
    next.hook_types = classifyHook(spokenHook).map((c) => c.type);
    next.language = transcriptLanguage;
  }
  return next;
}

/** Unisce un video nuovo con uno già presente, senza perdere dati. */
export function mergeVideo(existing, incoming) {
  if (!existing) return incoming;
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  const pick = (a, b) => (b ?? a);
  return {
    ...existing,
    ...incoming,
    niches: union(existing.niches, incoming.niches),
    queries: union(existing.queries, incoming.queries),
    views: pick(existing.views, incoming.views),
    likes: pick(existing.likes, incoming.likes),
    comments: pick(existing.comments, incoming.comments),
    transcript: incoming.transcript ?? existing.transcript,
    hook: incoming.transcript ? incoming.hook : existing.transcript ? existing.hook : incoming.hook,
    hook_source: incoming.transcript ? incoming.hook_source : existing.transcript ? existing.hook_source : incoming.hook_source,
    hook_types: incoming.transcript ? incoming.hook_types : existing.transcript ? existing.hook_types : incoming.hook_types,
    language: !incoming.transcript && existing.transcript ? existing.language : incoming.language,
    collected_at: existing.collected_at,
  };
}
