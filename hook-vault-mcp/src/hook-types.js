// Tassonomia dei ganci e classificatore a regole (italiano + inglese).
// Le regole sono volutamente semplici: servono a etichettare ganci estratti dai
// reel e a suggerire template LinkedIn dello stesso tipo, non a giudicarli.

export const HOOK_TYPES = [
  {
    id: "contrarian",
    label: "Contro-intuitivo",
    description: "Ribalta una convinzione diffusa o prende una posizione netta.",
    linkedin_tip: "Funziona se subito dopo porti una prova concreta: senza prova sembra clickbait.",
  },
  {
    id: "lista",
    label: "Numero / lista",
    description: "Promette un numero preciso di punti, errori, strumenti o passaggi.",
    linkedin_tip: "Usa numeri dispari e mantieni la promessa: un punto per riga, niente riempitivi.",
  },
  {
    id: "storia",
    label: "Storia personale",
    description: "Apre su un momento preciso della tua esperienza o di un cliente.",
    linkedin_tip: "Data, luogo o cifra nella prima riga: la specificità rende credibile la storia.",
  },
  {
    id: "errore",
    label: "Errore da evitare",
    description: "Mette in guardia da un errore comune che costa tempo o soldi.",
    linkedin_tip: "Quantifica il costo dell'errore (€, ore, clienti persi) per alzare la posta.",
  },
  {
    id: "segreto",
    label: "Segreto / dietro le quinte",
    description: "Promette qualcosa che di solito non viene detto o mostrato.",
    linkedin_tip: "Su LinkedIn rendi il 'segreto' un processo verificabile, non una frase da guru.",
  },
  {
    id: "risultato",
    label: "Risultato / prova",
    description: "Apre con un risultato misurabile e promette di spiegare come.",
    linkedin_tip: "Numero reale + tempo + contesto. Evita cifre tonde che sembrano inventate.",
  },
  {
    id: "domanda",
    label: "Domanda",
    description: "Una domanda che il lettore si è già fatto o che lo mette in crisi.",
    linkedin_tip: "Una sola domanda, chiusa e scomoda. Mai 'Siete d'accordo?' in apertura.",
  },
  {
    id: "come-fare",
    label: "Come fare (tutorial)",
    description: "Promette un metodo pratico per ottenere un risultato.",
    linkedin_tip: "Dichiara il risultato e il tempo necessario: 'Come X in Y senza Z'.",
  },
  {
    id: "confronto",
    label: "Confronto / prima-dopo",
    description: "Mette due opzioni, due periodi o due approcci uno contro l'altro.",
    linkedin_tip: "Perfetto per caroselli e post con due colonne di righe brevi.",
  },
  {
    id: "avvertimento",
    label: "Avvertimento / urgenza",
    description: "Ferma il lettore prima che faccia qualcosa di dannoso.",
    linkedin_tip: "Usa un tono da collega esperto, non da allarmista.",
  },
  {
    id: "curiosita",
    label: "Curiosità / open loop",
    description: "Apre una domanda implicita che si chiude solo leggendo tutto.",
    linkedin_tip: "Chiudi il loop entro il post: i loop aperti senza risposta bruciano fiducia.",
  },
  {
    id: "identificazione",
    label: "Chiamata al target",
    description: "Chiama per nome il pubblico giusto e lo seleziona subito.",
    linkedin_tip: "Ottimo per post di lead generation: chi si riconosce commenta.",
  },
];

export const HOOK_TYPE_IDS = HOOK_TYPES.map((t) => t.id);

const RULES = {
  contrarian: [
    /\b(smetti|smettila|smettete) di\b/i,
    /\bè (morto|morta|finito|finita|una bugia|sopravvalutat[oa])\b/i,
    /\bnon (ti serve|serve|hai bisogno)\b/i,
    /\b(opinione impopolare|impopolare|controcorrente|tutti sbagliano|hanno torto)\b/i,
    /\b(unpopular opinion|hot take|is dead|is a lie|overrated|you don'?t need|stop (doing|trying|posting|chasing))\b/i,
    /\b(nobody|no one) (should|needs)\b/i,
    /\bsaid no (one|man|woman|founder|ceo|client|customer)[\w ]* ever\b/i,
    /\b(nessuno|nessun) [\p{L} ]{0,30}ha mai detto\b/iu,
    /\bwrong\b/i,
  ],
  lista: [
    /^\s*\d{1,2}\s+\p{L}/u,
    /\b\d{1,2}\s+(modi|errori|motivi|cose|strumenti|tool|regole|passi|step|lezioni|segreti|consigli|domande|abitudini|segnali|ragioni|strategie|idee)\b/i,
    /\b\d{1,3}\s+(?:[\p{L}-]+\s+){0,3}(ways|mistakes|reasons|things|tools|rules|steps|lessons|secrets|tips|questions|habits|signs|strategies|ideas|books|trends|words|codes|tricks|hacks|apps|prompts|calculations|phrases|skills|websites|sites)\b/iu,
    /\b\d{1,3}\s+(?:[\p{L}-]+\s+){0,3}(modi|errori|motivi|cose|strumenti|regole|passi|lezioni|segreti|consigli|domande|abitudini|segnali|strategie|idee|libri|trend|parole|frasi|trucchi|app|prompt|siti|competenze)\b/iu,
    /\b(top|these|the|i|le|gli|questi|queste)\s+\d{1,3}\b/i,
    /\b(the best|i migliori|le migliori)\s+(?:[\p{L}-]+\s+){0,2}(tools|apps|books|tips|strumenti|libri|consigli|app)\b/iu,
  ],
  storia: [
    // L'anno da solo non basta ("Come investire nel 2026" è un tutorial):
    // serve un soggetto che racconta o l'anno in apertura.
    /^\s*nel (19|20)\d{2}\b/i,
    /\b(nel|a) (19|20)\d{2},? (ho|avevo|ero|mi|abbiamo|stavo|lavoravo|guadagnavo)\b/i,
    /\bback in (19|20)\d{2}\b/i,
    /\bin (19|20)\d{2},? (i|we|my)\b/i,
    /\b(quando ho|quando avevo|ho perso|ho lasciato|ho fallito|mi hanno|il mio primo|la mia prima|un mio cliente|una mia cliente|ieri|la settimana scorsa)\b/i,
    /\b(when i|i was|i lost|i quit|i got fired|my first|my client|last week|yesterday|years ago|i asked|i spent|i tried|i built|i started)\b/i,
    /\b(ho chiesto|ho speso|ho provato|ho costruito|ho iniziato|ho aperto)\b/i,
    /\b(\d+ anni fa|\d+ mesi fa)\b/i,
  ],
  errore: [
    /\b(errore|errori|sbaglio|sbagli|sbagliando)\b/i,
    /\b(mistake|mistakes|wrong way|biggest error)\b/i,
  ],
  segreto: [
    /\b(nessuno (ti )?(dice|parla|racconta)|segreto|segreti|dietro le quinte|non ti diranno mai|quello che non)\b/i,
    /\b(nobody (tells|talks)|no one (tells|talks)|secret|secrets|behind the scenes|they don'?t want you|you need to know|trick|tricks|hack|hacks|nobody knows|most people don'?t know)\b/i,
    /\b(trucco|trucchi|pochi sanno|devi sapere)\b/i,
  ],
  risultato: [
    /[€$£]\s?\d|\d\s?(€|k|mila|mln|milioni|million|m\b)/i,
    /\bda\s+\d+\s+a\s+\d+/i,
    /\bfrom\s+\$?\d+\s*(k)?\s+to\s+\$?\d+/i,
    /\b(in|entro) \d+ (giorni|settimane|mesi|days|weeks|months)\b/i,
    /\b(fatturato|ho generato|ho guadagnato|ho fatturato|revenue|made|generated)\b.*\d/i,
    /\d{2,}[\d.,]*\s*(nuovi |new )?(clienti|follower|followers|clients|customers|lead|leads|iscritti|subscribers)\b/i,
  ],
  domanda: [/\?\s*$/],
  "come-fare": [
    /^\s*(come|ecco come|here'?s how|how i|this is how)\b/i,
    /\b(how to|come (fare|ottenere|trovare|creare|scrivere|vendere|trovare))\b/i,
    /\b(guida|tutorial|step by step|passo passo)\b/i,
  ],
  confronto: [
    /\bvs\.?\b|\bversus\b/i,
    /\b(prima|before)\b.*\b(dopo|after)\b/i,
    /\b(invece di|instead of|rather than|differenza tra|difference between)\b/i,
  ],
  avvertimento: [
    /^\s*(attenzione|occhio|fermati|non fare|non usare|warning|stop|don'?t|never|mai)\b/i,
    /\b(se stai|if you'?re (still|about))\b/i,
  ],
  curiosita: [
    /\b(questo cambia tutto|ecco cosa|ecco perché|indovina|non ci crederai|guarda cosa|scopri)\b/i,
    /\b(this changes everything|here'?s why|here'?s what|wait for it|you won'?t believe|watch this|the reason)\b/i,
    /(…|\.\.\.)\s*$/,
    /^\s*(why|perché)\b[^?]*$/i,
  ],
  identificazione: [
    /^\s*(se sei|se hai|se vuoi|founder|freelance|coach|imprenditori|imprenditore|manager|recruiter|agenzie|agency owners?)\b[^.?!]{0,60}[,:]/i,
    /\b(if you'?re a|if you are a|if you have|if you want|calling all)\b/i,
  ],
};

// In JavaScript \b conosce solo [A-Za-z0-9_]: "perché" o "è" non avrebbero
// confini di parola. Riscriviamo \b con lookaround Unicode.
const WORD = "[\\p{L}\\p{N}_]";
const UNICODE_BOUNDARY = `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`;
const COMPILED = Object.fromEntries(
  Object.entries(RULES).map(([type, patterns]) => [
    type,
    patterns.map((re) => new RegExp(re.source.replaceAll("\\b", UNICODE_BOUNDARY), re.flags.includes("u") ? re.flags : re.flags + "u")),
  ])
);

/**
 * Classifica un gancio nei tipi della tassonomia.
 * @returns {{type: string, score: number}[]} ordinati per punteggio decrescente
 */
export function classifyHook(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  const results = [];
  for (const [type, patterns] of Object.entries(COMPILED)) {
    const score = patterns.reduce((n, re) => n + (re.test(value) ? 1 : 0), 0);
    if (score > 0) results.push({ type, score });
  }
  return results.sort((a, b) => b.score - a.score || HOOK_TYPE_IDS.indexOf(a.type) - HOOK_TYPE_IDS.indexOf(b.type));
}

export function getHookType(id) {
  return HOOK_TYPES.find((t) => t.id === id) ?? null;
}
