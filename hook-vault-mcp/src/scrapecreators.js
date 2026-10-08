// Client minimale per l'API ScrapeCreators (https://scrapecreators.com).
// Ogni chiamata costa 1 credito. Serve SCRAPECREATORS_API_KEY.

import { extractReels, extractSinglePost, extractTranscript } from "./normalize.js";

const BASE_URL = process.env.SCRAPECREATORS_BASE_URL ?? "https://api.scrapecreators.com";

export class ScrapeCreatorsError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class ScrapeCreatorsClient {
  constructor(apiKey = process.env.SCRAPECREATORS_API_KEY, fetchImpl = globalThis.fetch) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async #get(path, params) {
    if (!this.apiKey) {
      throw new ScrapeCreatorsError(
        "SCRAPECREATORS_API_KEY non configurata: aggiungila alle variabili d'ambiente del server MCP per importare reel da Instagram.",
        401
      );
    }
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v));
    const res = await this.fetch(url, { headers: { "x-api-key": this.apiKey }, signal: AbortSignal.timeout(60_000) });
    const body = await res.text();
    if (!res.ok) {
      const hint = res.status === 401 ? " (chiave API non valida)" : res.status === 402 ? " (crediti esauriti)" : "";
      throw new ScrapeCreatorsError(`ScrapeCreators ${res.status}${hint}: ${body.slice(0, 300)}`, res.status);
    }
    return JSON.parse(body);
  }

  /** Cerca reel per parola chiave (risultati indicizzati da Google). */
  async searchReels(query, { page, datePosted } = {}) {
    const json = await this.#get("/v2/instagram/reels/search", { query, page, date_posted: datePosted });
    return { reels: extractReels(json), nextPage: json.next_page ?? json.data?.next_page ?? null, credits: json.credits_remaining ?? null };
  }

  /** Dettaglio di un singolo post o reel. */
  async getPost(url) {
    const json = await this.#get("/v1/instagram/post", { url });
    return extractSinglePost(json);
  }

  /** Trascrizione AI del parlato (video sotto i 2 minuti). */
  async getTranscript(url) {
    const json = await this.#get("/v2/instagram/media/transcript", { url });
    return extractTranscript(json);
  }
}
