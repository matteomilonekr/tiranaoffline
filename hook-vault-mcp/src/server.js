// Definizione del server MCP: tool, prompt e istruzioni.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HOOK_TYPES, HOOK_TYPE_IDS, classifyHook, getHookType } from "./hook-types.js";
import { FORMATS, GOALS, buildBrief, fillTemplate, placeholders, scoreOpening } from "./linkedin.js";
import { applyTranscript, normalizeReel } from "./normalize.js";
import { ScrapeCreatorsClient } from "./scrapecreators.js";
import { Store, extractShortcode, summarizeVideo } from "./store.js";

export const SERVER_NAME = "hook-vault";
export const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = `Hook Vault: database di ganci (template LinkedIn in italiano) e di reel Instagram reali divisi per nicchia, con views, gancio estratto e trascrizioni.

Flusso consigliato per creare un post LinkedIn:
1. list_niches per scegliere la nicchia (o niche_report per capire cosa funziona).
2. search_videos (sort "outlier" o "views") per trovare reel che hanno performato; get_video per leggere gancio e trascrizione.
3. analyze_hook sul gancio del reel per avere i template LinkedIn dello stesso tipo.
4. linkedin_post_brief per ottenere struttura, ganci suggeriti e regole; poi scrivi il post.
5. score_linkedin_hook sulla bozza e correggi i controlli non superati.

Regole: trasforma i reel, non tradurli; i ganci con [segnaposto] vanno riempiti con dati reali dell'utente, mai inventati; se mancano numeri reali chiedili all'utente.
discover_reels e import_reel usano crediti ScrapeCreators (1 per chiamata): usali solo se l'utente vuole ampliare il database.`;

const nicheIdSchema = z.string().describe("Id della nicchia (vedi list_niches), es. 'marketing', 'vendite', 'ai-tech'.");
const hookTypeSchema = z.enum(HOOK_TYPE_IDS).describe(`Tipo di gancio: ${HOOK_TYPES.map((t) => `${t.id} (${t.label})`).join(", ")}.`);

function result(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function failure(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function describeHook(h) {
  const type = getHookType(h.type);
  return {
    id: h.id,
    type: h.type,
    type_label: type?.label ?? h.type,
    niches: h.niches.length ? h.niches : ["universale"],
    template: h.text,
    placeholders: placeholders(h.text),
    example: h.example,
    linkedin_tip: type?.linkedin_tip ?? null,
    source: h.source,
  };
}

/**
 * Crea il server MCP.
 * @param {{store?: Store, scraper?: ScrapeCreatorsClient}} deps
 */
export function createServer(deps = {}) {
  const store = deps.store ?? new Store();
  const scraper = deps.scraper ?? new ScrapeCreatorsClient();
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  const requireNiche = (id) => {
    const niche = store.resolveNiche(id);
    if (!niche) throw new Error(`Nicchia "${id}" non trovata. Disponibili: ${store.niches.map((n) => n.id).join(", ")}.`);
    return niche;
  };

  const safe =
    (handler) =>
    async (...args) => {
      try {
        return await handler(...args);
      } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
      }
    };

  server.registerTool(
    "list_niches",
    {
      title: "Elenco nicchie",
      description: "Elenca le nicchie del database con numero di ganci, reel, trascrizioni e views mediane. Include anche i tipi di gancio disponibili.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(async () =>
      result({
        niches: store.listNiches(),
        hook_types: HOOK_TYPES.map(({ id, label, description }) => ({ id, label, description })),
        totals: { hooks: store.hooks.length, videos: store.videos.length },
        scrapecreators_configured: scraper.configured,
      })
    )
  );

  server.registerTool(
    "search_hooks",
    {
      title: "Cerca ganci",
      description:
        "Cerca nel database dei ganci (template LinkedIn in italiano con [segnaposto] ed esempio compilato). Filtra per nicchia, tipo e parole chiave. Usa shuffle_seed per ottenere ganci diversi a ogni chiamata.",
      inputSchema: {
        niche: nicheIdSchema.optional(),
        type: hookTypeSchema.optional(),
        query: z.string().optional().describe("Parole chiave da cercare nel template e nell'esempio."),
        include_universal: z.boolean().default(true).describe("Includi i ganci validi per tutte le nicchie."),
        limit: z.number().int().min(1).max(50).default(10),
        shuffle_seed: z.number().int().optional().describe("Seme per mescolare i risultati in modo riproducibile."),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ niche, type, query, include_universal, limit, shuffle_seed }) => {
      const nicheId = niche ? requireNiche(niche).id : undefined;
      const { total, hooks } = store.searchHooks({ niche: nicheId, type, query, includeUniversal: include_universal, limit, shuffleSeed: shuffle_seed });
      return result({ total, returned: hooks.length, hooks: hooks.map(describeHook) });
    })
  );

  server.registerTool(
    "fill_hook",
    {
      title: "Compila un gancio",
      description: "Sostituisce i [segnaposto] di un gancio del database con valori reali. Restituisce il testo e i segnaposto ancora da riempire.",
      inputSchema: {
        hook_id: z.string().describe("Id del gancio (es. h012)."),
        values: z.record(z.string()).describe('Valori per i segnaposto, es. {"numero": "7", "traguardo": "assumere il primo dipendente"}.'),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ hook_id, values }) => {
      const hook = store.getHook(hook_id);
      if (!hook) return failure(`Gancio ${hook_id} non trovato.`);
      const text = fillTemplate(hook.text, values);
      return result({ id: hook.id, template: hook.text, text, missing: placeholders(text), example: hook.example });
    })
  );

  server.registerTool(
    "search_videos",
    {
      title: "Cerca reel",
      description:
        "Cerca reel Instagram nel database per nicchia, parole chiave, views minime, lingua e tipo di gancio. Ordina per views, outlier (views rispetto alla mediana della nicchia), engagement, recent o relevance.",
      inputSchema: {
        niche: nicheIdSchema.optional(),
        query: z.string().optional().describe("Parole chiave su gancio, caption, trascrizione e creator."),
        min_views: z.number().int().min(0).optional(),
        language: z.enum(["it", "en"]).optional(),
        hook_type: hookTypeSchema.optional(),
        with_transcript: z.boolean().optional().describe("Solo reel con trascrizione del parlato."),
        sort: z.enum(["views", "outlier", "engagement", "recent", "relevance"]).optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ niche, query, min_views, language, hook_type, with_transcript, sort, limit }) => {
      const nicheId = niche ? requireNiche(niche).id : undefined;
      const res = store.searchVideos({ niche: nicheId, query, minViews: min_views, language, hookType: hook_type, withTranscript: with_transcript, sort, limit });
      return result({ total: res.total, sort: res.sort, returned: res.videos.length, videos: res.videos.map(summarizeVideo) });
    })
  );

  server.registerTool(
    "get_video",
    {
      title: "Dettaglio reel",
      description:
        "Restituisce un reel completo (caption, trascrizione, metriche, gancio) e i template LinkedIn dello stesso tipo di gancio. Con fetch_transcript=true scarica la trascrizione se manca (1 credito ScrapeCreators).",
      inputSchema: {
        video: z.string().describe("Shortcode o URL del reel."),
        fetch_transcript: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    safe(async ({ video, fetch_transcript }) => {
      let v = store.getVideo(video);
      if (!v) return failure(`Reel ${extractShortcode(video)} non presente nel database. Usa import_reel per aggiungerlo.`);
      let note = null;
      if (fetch_transcript && !v.transcript) {
        if (!scraper.configured) note = "Trascrizione non scaricata: SCRAPECREATORS_API_KEY non configurata.";
        else {
          const transcript = await scraper.getTranscript(v.url);
          if (transcript) {
            store.upsertVideos([applyTranscript(v, transcript)]);
            v = store.getVideo(v.shortcode);
          } else note = "Nessun parlato trovato nel video.";
        }
      }
      const primaryType = v.hook_types?.[0];
      const templates = primaryType
        ? store.searchHooks({ niche: v.niches?.[0], type: primaryType, limit: 5 }).hooks.map(describeHook)
        : [];
      return result({ video: { ...v }, linkedin_templates_same_type: templates, note });
    })
  );

  server.registerTool(
    "niche_report",
    {
      title: "Report nicchia",
      description:
        "Cosa funziona in una nicchia: views mediane, tipi di gancio nel quartile migliore rispetto al totale, durata media dei top reel, creator principali, top reel e template LinkedIn consigliati.",
      inputSchema: {
        niche: nicheIdSchema,
        top: z.number().int().min(1).max(20).default(5),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ niche, top }) => {
      const n = requireNiche(niche);
      const report = store.nicheReport(n.id, top);
      const bestTypes = report.hook_types_top_quartile.slice(0, 3).map((t) => t.type);
      const templates = bestTypes.flatMap((type) => store.searchHooks({ niche: n.id, type, limit: 2 }).hooks.map(describeHook));
      return result({ ...report, recommended_templates: templates });
    })
  );

  server.registerTool(
    "analyze_hook",
    {
      title: "Analizza un gancio",
      description:
        "Classifica un gancio (da un reel, un post o una tua bozza) nei tipi della tassonomia e restituisce consigli e template LinkedIn equivalenti. Utile per trasformare il gancio di un reel in un gancio LinkedIn.",
      inputSchema: {
        text: z.string().min(1).describe("Il gancio da analizzare."),
        niche: nicheIdSchema.optional(),
        templates: z.number().int().min(0).max(20).default(5),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ text, niche, templates }) => {
      const nicheId = niche ? requireNiche(niche).id : undefined;
      const types = classifyHook(text);
      const primary = types[0]?.type;
      return result({
        text,
        types: types.map((t) => ({ ...t, ...getHookType(t.type) })),
        linkedin_templates: primary ? store.searchHooks({ niche: nicheId, type: primary, limit: templates }).hooks.map(describeHook) : [],
        similar_reels: primary
          ? store.searchVideos({ niche: nicheId, hookType: primary, sort: "views", limit: 5 }).videos.map(summarizeVideo)
          : [],
        note: types.length ? null : "Nessuno schema riconosciuto: potrebbe essere un gancio debole o molto originale.",
      });
    })
  );

  server.registerTool(
    "linkedin_post_brief",
    {
      title: "Brief post LinkedIn",
      description:
        "Prepara il brief per scrivere un post LinkedIn: pubblico, struttura per formato, ganci suggeriti (pre-compilati con i valori forniti), reel sorgente con trascrizione da trasformare, regole di formattazione e CTA per obiettivo.",
      inputSchema: {
        topic: z.string().min(3).describe("Argomento o messaggio del post."),
        niche: nicheIdSchema.optional(),
        goal: z.enum(Object.keys(GOALS)).default("autorita").describe("lead, autorita o engagement."),
        format: z.enum(Object.keys(FORMATS)).default("testo").describe("testo, carosello o video."),
        hook_type: hookTypeSchema.optional().describe("Forza un tipo di gancio. Se c'è un reel sorgente, di default si usa il suo."),
        video: z.string().optional().describe("Shortcode o URL di un reel del database da trasformare in post."),
        values: z.record(z.string()).optional().describe("Valori reali per i segnaposto dei ganci (numero, cifra, tempo, target...)."),
        hooks: z.number().int().min(1).max(15).default(5),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ topic, niche, goal, format, hook_type, video, values, hooks }) => {
      const v = video ? store.getVideo(video) : null;
      if (video && !v) return failure(`Reel ${extractShortcode(video)} non presente nel database.`);
      const n = niche ? requireNiche(niche) : v?.niches?.[0] ? store.getNiche(v.niches[0]) : null;
      const type = hook_type ?? v?.hook_types?.[0];
      let found = store.searchHooks({ niche: n?.id, type, query: topic, limit: hooks }).hooks;
      if (found.length < hooks) {
        const more = store.searchHooks({ niche: n?.id, type, limit: hooks * 2, shuffleSeed: topic.length }).hooks;
        for (const h of more) if (found.length < hooks && !found.includes(h)) found.push(h);
      }
      return result(buildBrief({ topic, niche: n, goal, format, hooks: found, video: v, values }));
    })
  );

  server.registerTool(
    "score_linkedin_hook",
    {
      title: "Valuta apertura LinkedIn",
      description:
        "Valuta da 0 a 100 l'apertura di un post LinkedIn (lunghezza della prima riga, specificità, aperture deboli, righe prima del 'altro', schema di gancio, tono) e segnala problemi nel resto del post (lunghezza, hashtag, link, blocchi lunghi).",
      inputSchema: { text: z.string().min(1).describe("Il gancio o l'intero post.") },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ text }) => result(scoreOpening(text)))
  );

  server.registerTool(
    "save_hook",
    {
      title: "Salva gancio",
      description: "Aggiunge un gancio al database personale (es. da un tuo post che ha funzionato). Se il tipo non è indicato viene classificato automaticamente.",
      inputSchema: {
        text: z.string().min(5).describe("Il gancio, anche con [segnaposto]."),
        type: hookTypeSchema.optional(),
        niches: z.array(nicheIdSchema).default([]).describe("Vuoto = valido per tutte le nicchie."),
        example: z.string().optional(),
        notes: z.string().optional().describe("Contesto o risultati ottenuti (es. '48k impression, 120 commenti')."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    safe(async ({ text, type, niches, example, notes }) => {
      const resolved = niches.map((id) => requireNiche(id).id);
      // I segnaposto numerici diventano un numero, così "[numero] clienti" si classifica come una cifra reale.
      const sample = text.replace(/\[([^\]]+)\]/g, (_, name) => (/numer|cifra|percent|prezzo|fatturato|^[xy]$/i.test(name) ? "10" : name));
      const finalType = type ?? classifyHook(sample)[0]?.type;
      if (!finalType) return failure("Non riesco a classificare il gancio: indica il parametro type.");
      const hook = store.addHook({ text, type: finalType, niches: resolved, example, notes });
      return result({ saved: describeHook(hook), data_dir: store.dataDir });
    })
  );

  server.registerTool(
    "discover_reels",
    {
      title: "Scopri nuovi reel",
      description:
        "Cerca nuovi reel su Instagram per una nicchia tramite ScrapeCreators e li aggiunge al database (1 credito per pagina, ~10 reel a pagina). Senza query usa le ricerche predefinite della nicchia.",
      inputSchema: {
        niche: nicheIdSchema,
        query: z.string().optional(),
        pages: z.number().int().min(1).max(3).default(1),
        date_posted: z.enum(["last-week", "last-month", "last-year"]).optional(),
        transcripts: z.number().int().min(0).max(10).default(0).describe("Scarica la trascrizione dei N reel con più views (1 credito ciascuno)."),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    safe(async ({ niche, query, pages, date_posted, transcripts }) => {
      if (!scraper.configured) return failure("SCRAPECREATORS_API_KEY non configurata: aggiungila all'ambiente del server MCP.");
      const n = requireNiche(niche);
      const queries = query ? [query] : n.search_queries ?? [n.name];
      const collected = new Map();
      let credits = 0;
      for (const q of queries) {
        for (let page = 1; page <= pages; page++) {
          const { reels, nextPage } = await scraper.searchReels(q, { page: page > 1 ? page : undefined, datePosted: date_posted });
          credits++;
          for (const raw of reels) {
            if (raw?.is_video === false) continue;
            const v = normalizeReel(raw, { niche: n.id, query: q });
            if (v && !collected.has(v.shortcode)) collected.set(v.shortcode, v);
          }
          if (!nextPage) break;
        }
      }
      let list = [...collected.values()];
      const top = [...list].filter((v) => v.views != null && (v.duration_s ?? 0) <= 120).sort((a, b) => b.views - a.views).slice(0, transcripts);
      for (const v of top) {
        const text = await scraper.getTranscript(v.url).catch(() => null);
        credits++;
        if (text) list = list.map((x) => (x.shortcode === v.shortcode ? applyTranscript(x, text) : x));
      }
      const { added, updated } = store.upsertVideos(list);
      const best = [...collected.keys()]
        .map((code) => store.getVideo(code))
        .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
        .slice(0, 10);
      return result({ niche: n.id, queries, found: list.length, added, updated, credits_used: credits, top: best.map(summarizeVideo) });
    })
  );

  server.registerTool(
    "import_reel",
    {
      title: "Importa un reel",
      description: "Importa un reel specifico da URL nel database, con metriche e (di default) trascrizione. Costa 1-2 crediti ScrapeCreators.",
      inputSchema: {
        url: z.string().url().describe("URL del reel Instagram."),
        niche: nicheIdSchema,
        transcript: z.boolean().default(true),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    safe(async ({ url, niche, transcript }) => {
      if (!scraper.configured) return failure("SCRAPECREATORS_API_KEY non configurata: aggiungila all'ambiente del server MCP.");
      const n = requireNiche(niche);
      const raw = await scraper.getPost(url);
      let v = normalizeReel(raw, { niche: n.id, query: "import" });
      if (!v) return failure("Reel non trovato o non pubblico.");
      if (transcript) {
        const text = await scraper.getTranscript(v.url).catch(() => null);
        if (text) v = applyTranscript(v, text);
      }
      const counts = store.upsertVideos([v]);
      return result({ ...counts, video: store.getVideo(v.shortcode) });
    })
  );

  server.registerPrompt(
    "post-da-reel",
    {
      title: "Post LinkedIn da un reel virale",
      description: "Trova un reel che ha performato nella nicchia e trasformalo in un post LinkedIn.",
      argsSchema: {
        niche: z.string().describe("Id della nicchia"),
        topic: z.string().optional().describe("Argomento su cui vuoi scrivere (opzionale)"),
      },
    },
    ({ niche, topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Usa Hook Vault per scrivere un post LinkedIn nella nicchia "${niche}"${topic ? ` sull'argomento "${topic}"` : ""}.
1. Chiama search_videos con niche="${niche}", sort="outlier", with_transcript=true${topic ? `, query="${topic}"` : ""} e scegli il reel più adatto.
2. Chiama get_video sul reel scelto e analyze_hook sul suo gancio.
3. Chiama linkedin_post_brief con il reel come video.
4. Scrivi 3 aperture alternative e il post completo, seguendo il brief. Se mancano dati reali (numeri, casi), chiedimeli invece di inventarli.
5. Passa il post a score_linkedin_hook e correggi ciò che non passa. Mostrami post finale e punteggio.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "piano-settimanale",
    {
      title: "Piano editoriale LinkedIn",
      description: "Piano di post LinkedIn per una nicchia, basato su ciò che funziona nei reel.",
      argsSchema: {
        niche: z.string().describe("Id della nicchia"),
        posts: z.string().optional().describe("Numero di post (default 5)"),
      },
    },
    ({ niche, posts }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Crea un piano editoriale LinkedIn di ${posts || "5"} post per la nicchia "${niche}" usando Hook Vault.
1. Chiama niche_report per "${niche}" e individua i tipi di gancio più forti.
2. Per ogni post scegli un reel sorgente diverso (search_videos) e un tipo di gancio diverso, alternando gli obiettivi lead, autorita ed engagement e i formati testo e carosello.
3. Per ogni post restituisci: giorno, obiettivo, formato, reel sorgente, gancio proposto (già compilato con fill_hook dove possibile) e 3 punti del corpo.
Presenta il piano in una tabella.`,
          },
        },
      ],
    })
  );

  return { server, store, scraper };
}
