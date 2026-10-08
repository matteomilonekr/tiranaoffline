// Regole e controlli per i post LinkedIn. Il server non scrive i post: prepara
// brief, ganci e controlli, e lascia la scrittura al modello che lo usa.

import { classifyHook, getHookType } from "./hook-types.js";
import { fold } from "./store.js";

// Punti di troncamento indicativi prima del "…altro": LinkedIn li cambia nel
// tempo e dipendono dal dispositivo, quindi vanno letti come ordini di grandezza.
export const FOLD_MOBILE = 140;
export const FOLD_DESKTOP = 210;
export const MAX_POST_LENGTH = 3000;

const WEAK_OPENINGS = [
  "oggi voglio",
  "oggi vorrei",
  "vorrei condividere",
  "voglio condividere",
  "sono felice di",
  "sono felicissimo",
  "sono entusiasta",
  "sono orgoglioso di annunciare",
  "sono orgogliosa di annunciare",
  "ciao a tutti",
  "buongiorno a tutti",
  "in questo post",
  "ho il piacere di",
  "come molti di voi sanno",
  "excited to",
  "thrilled to",
  "happy to announce",
  "i'm happy to",
  "i am happy to",
];

export const GOALS = {
  lead: {
    label: "Lead generation",
    cta: "Invita a commentare una parola chiave o a scrivere in DM per ricevere una risorsa concreta collegata al post.",
  },
  autorita: {
    label: "Autorità / thought leadership",
    cta: "Chiudi con la tua posizione in una frase e una domanda che inviti chi ha esperienza a portare la propria.",
  },
  engagement: {
    label: "Conversazione e reach",
    cta: "Chiudi con una domanda specifica a cui si risponde in una riga (scelta tra due opzioni, un numero, un'esperienza).",
  },
};

export const FORMATS = {
  testo: {
    label: "Post di solo testo",
    structure: [
      "Riga 1, gancio: idealmente sotto i 55 caratteri, da solo sulla riga.",
      `Righe 2-3, ri-gancio: alza la posta o dichiara cosa ottiene chi legge, tutto entro ~${FOLD_MOBILE} caratteri (troncamento mobile).`,
      "Corpo: 3-7 blocchi brevi, un'idea per blocco, frasi da una o due righe, prove concrete (numeri, nomi, esempi).",
      "Svolta: la frase che vorresti venisse citata o salvata.",
      "CTA coerente con l'obiettivo del post.",
    ],
  },
  carosello: {
    label: "Carosello (documento PDF)",
    structure: [
      "Slide 1: gancio in massimo 8 parole, leggibile su smartphone.",
      "Slide 2: il problema o la posta in gioco, con un dato.",
      "Slide 3-8: un punto per slide, titolo + massimo 25 parole.",
      "Penultima slide: riepilogo in una schermata (da salvare).",
      "Ultima slide: chi sei in una riga + CTA.",
      "Testo del post: 3-6 righe che riprendono il gancio e spiegano perché sfogliare.",
    ],
  },
  video: {
    label: "Video nativo",
    structure: [
      "0-3 s: gancio parlato + stesso gancio come testo a schermo.",
      "3-15 s: contesto e promessa (cosa saprà fare chi guarda fino alla fine).",
      "Corpo: 3 punti al massimo, un taglio ogni 3-5 secondi.",
      "Chiusura: insight finale + CTA.",
      "Sottotitoli sempre: gran parte del pubblico guarda senza audio. Durata 30-90 s.",
    ],
  },
};

export const FORMATTING_RULES = [
  "Una frase per riga, riga vuota tra i blocchi: niente muri di testo.",
  `Lunghezza totale indicativa 900-1.800 caratteri, limite LinkedIn ${MAX_POST_LENGTH}.`,
  "Niente link esterni nel corpo: se servono, nel primo commento.",
  "Massimo 3-5 hashtag, in fondo. Nessun hashtag o menzione nelle prime righe.",
  "Emoji solo come segnaposto visivo (elenchi), mai più di una nella prima riga.",
  "Prima persona, tono da collega esperto: specifico, concreto, senza frasi da guru.",
];

export const REPURPOSE_RULES = [
  "Trasforma, non tradurre: del reel tieni l'idea centrale e il tipo di gancio, non le frasi.",
  "Sostituisci gli esempi del creator con esperienze, numeri e casi tuoi o del tuo settore.",
  "Porta il linguaggio al contesto professionale: meno slang, più specificità e ragionamento.",
  "Se riprendi un'idea originale e riconoscibile, cita la fonte.",
];

/** Elenca i segnaposto [così] presenti in un template. */
export function placeholders(template) {
  return [...String(template).matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
}

/**
 * Sostituisce i segnaposto con i valori forniti (chiavi confrontate senza
 * maiuscole né accenti). I segnaposto senza valore restano tra parentesi.
 */
export function fillTemplate(template, values = {}) {
  const map = new Map(Object.entries(values).map(([k, v]) => [fold(k), String(v)]));
  return String(template).replace(/\[([^\]]+)\]/g, (match, name) => map.get(fold(name)) ?? match);
}

function firstLines(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() !== "");
  return start === -1 ? [] : lines.slice(start);
}

const EMOJI = /\p{Extended_Pictographic}/gu;

/**
 * Valuta l'apertura di un post LinkedIn (0-100) e segnala problemi nel corpo.
 */
export function scoreOpening(text) {
  const raw = String(text ?? "").replace(/\r\n/g, "\n").trim();
  const lines = firstLines(raw);
  const firstLine = (lines[0] ?? "").trim();
  const opening = raw.slice(0, FOLD_MOBILE);
  const checks = [];
  const add = (id, label, points, max, detail) => checks.push({ id, label, points, max, passed: points === max, detail });

  const len = firstLine.length;
  add(
    "first_line_length",
    "Prima riga breve",
    len === 0 ? 0 : len <= 55 ? 20 : len <= 90 ? 10 : 0,
    20,
    `${len} caratteri (ideale ≤ 55, accettabile ≤ 90).`
  );

  const firstTwo = lines.slice(0, 3).join(" ");
  const specific = /\d/.test(firstTwo);
  add("specificity", "Specificità (numero, cifra, tempo)", specific ? 15 : 0, 15, specific ? "Contiene un dato concreto." : "Aggiungi un numero, una cifra o un tempo nelle prime righe.");

  const foldedOpening = fold(firstLine);
  const weak = WEAK_OPENINGS.find((w) => foldedOpening.startsWith(fold(w)) || foldedOpening.includes(fold(w)));
  add("no_weak_opening", "Nessuna apertura debole", weak ? 0 : 20, 20, weak ? `Inizia con "${weak}": parti dal punto, non dall'introduzione.` : "Ok.");

  const clutter = /#[\p{L}\p{N}_]+|https?:\/\/|www\.|@[\p{L}\p{N}_.]+/u.test(opening);
  add("clean_fold", `Prime ${FOLD_MOBILE} battute pulite`, clutter ? 0 : 10, 10, clutter ? "Sposta hashtag, link e menzioni più in basso." : "Ok.");

  const standalone = lines.length > 1 && (lines[1].trim() === "" || lines[1].trim().length <= 120);
  add("line_break", "Gancio isolato sulla sua riga", standalone ? 10 : lines.length <= 1 ? 5 : 0, 10, standalone ? "Ok." : "Vai a capo dopo il gancio.");

  const types = classifyHook(firstLine);
  add(
    "hook_pattern",
    "Schema di gancio riconoscibile",
    types.length ? 15 : 0,
    15,
    types.length ? `Tipo: ${types.map((t) => getHookType(t.type)?.label ?? t.type).join(", ")}.` : "Non riconosco uno schema: prova contrarian, numero, storia, risultato o domanda."
  );

  const emojis = firstLine.match(EMOJI)?.length ?? 0;
  const caps = (firstLine.match(/\b[A-ZÀ-Ý]{4,}\b/g) ?? []).length;
  add("calm_tone", "Niente urla (maiuscole/emoji)", emojis <= 1 && caps <= 1 ? 10 : 0, 10, `${emojis} emoji, ${caps} parole in maiuscolo nella prima riga.`);

  // Un'apertura da comunicato ("Sono felice di annunciare...") affonda il post
  // anche se il resto è formattato bene: limitiamo il punteggio.
  const total = checks.reduce((n, c) => n + c.points, 0);
  const score = weak ? Math.min(total, 40) : total;

  const warnings = [];
  if (raw.length > MAX_POST_LENGTH) warnings.push(`Il post supera il limite di ${MAX_POST_LENGTH} caratteri (${raw.length}).`);
  else if (raw.length > 2200) warnings.push(`Post lungo (${raw.length} caratteri): valuta se tagliare o farne un carosello.`);
  const hashtags = raw.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (hashtags > 5) warnings.push(`${hashtags} hashtag: ne bastano 3-5.`);
  if (/https?:\/\/|www\./.test(raw)) warnings.push("Contiene un link: LinkedIn tende a ridurre la portata dei post con link esterni. Mettilo nel primo commento.");
  const longBlock = raw.split(/\n\s*\n/).find((p) => p.length > 350);
  if (longBlock) warnings.push(`Blocco di ${longBlock.length} caratteri senza righe vuote: spezzalo.`);

  return {
    score,
    verdict: score >= 80 ? "forte" : score >= 60 ? "buono, migliorabile" : "debole",
    first_line: firstLine,
    above_fold_mobile: raw.slice(0, FOLD_MOBILE),
    above_fold_desktop: raw.slice(0, FOLD_DESKTOP),
    hook_types: types.map((t) => t.type),
    length: raw.length,
    checks,
    warnings,
  };
}

/** Prepara il brief che il modello userà per scrivere il post. */
export function buildBrief({ topic, niche, goal = "autorita", format = "testo", hooks = [], video = null, values = {} }) {
  const goalInfo = GOALS[goal] ?? GOALS.autorita;
  const formatInfo = FORMATS[format] ?? FORMATS.testo;
  return {
    topic,
    niche: niche ? { id: niche.id, name: niche.name } : null,
    audience: niche?.linkedin_audience ?? null,
    goal: { id: goal, ...goalInfo },
    format: { id: format, ...formatInfo },
    suggested_hooks: hooks.map((h) => ({
      id: h.id,
      type: h.type,
      template: h.text,
      prefilled: fillTemplate(h.text, values),
      placeholders: placeholders(h.text),
      example: h.example,
      tip: getHookType(h.type)?.linkedin_tip ?? null,
    })),
    source_reel: video
      ? {
          url: video.url,
          creator: video.creator?.username ?? null,
          views: video.views,
          hook: video.hook,
          hook_types: video.hook_types,
          caption_excerpt: (video.caption ?? "").slice(0, 600),
          transcript: video.transcript ? video.transcript.slice(0, 2000) : null,
          repurpose_rules: REPURPOSE_RULES,
        }
      : null,
    formatting_rules: FORMATTING_RULES,
    final_check: "Prima di consegnare, passa la bozza a score_linkedin_hook e correggi i controlli non superati.",
  };
}
