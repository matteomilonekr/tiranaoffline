// Detects creative attributes (format, angle, persona, creator, hook) from ad names.
//
// Three passes, strongest first:
//   1. explicit markers inside a segment: "angle:price", "fmt=ugc", "@sarah", "H3"
//   2. dictionary hits on each segment ("UGC", "PainPoint", "Busy mom")
//   3. positional inference: when many names share the same shape (same delimiter and
//      segment count) and one position is mostly dictionary hits for a dimension, every
//      name of that shape takes its value from that position, even unknown words.
// A naming template from settings ("{date}_{format}_{angle}_{persona}") overrides 3.
// Pure module: no DOM, shared by the browser app and the node tests.

export const DIMENSIONS = ['format', 'angle', 'persona', 'creator', 'hook'];

const DELIMITERS = [' | ', '|', ' - ', ' – ', ' — ', '_', ' / ', '/', ' • ', '•', ' · ', '·', ';'];

const KEY_ALIASES = {
  format: ['format', 'formato', 'fmt', 'type', 'tipo'],
  angle: ['angle', 'angolo', 'ang', 'concept', 'concetto', 'message', 'messaggio', 'msg'],
  persona: ['persona', 'audience', 'aud', 'target', 'avatar', 'icp', 'per'],
  creator: ['creator', 'talent', 'actor', 'attore', 'attrice', 'influencer', 'crt', 'cr'],
  hook: ['hook', 'gancio', 'opener', 'hk'],
};
// Single letters only count with an explicit ":" or "=" ("A:Price"), never "a-price".
const SHORT_KEYS = { f: 'format', a: 'angle', p: 'persona', c: 'creator', h: 'hook' };

// Ordered: the first matching entry wins, so specific phrases come before generic words.
// Patterns run on normalizeText() output and are wrapped in Unicode-aware word boundaries,
// because \b does not treat accented letters ("papà", "verità") as word characters.
const word = (pattern) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'u');

const DICTIONARY = {
  format: [
    ['UGC', 'ugc|user generated|selfie|talking ?head'],
    ['Founder-led', 'founder|ceo|fondatore|fondatrice'],
    ['Carousel', 'carousel|carosello|crsl|slideshow'],
    ['Catalog', 'dpa|daba|catalog|catalogue|catalogo|collection|dynamic product'],
    ['GIF', 'gif|cinemagraph'],
    ['Meme', 'memes?'],
    ['Podcast', 'podcast|pod clip'],
    ['VSL', 'vsl|long ?form'],
    ['Advertorial', 'advertorial|listicle|article'],
    ['Unboxing', 'unboxing|haul'],
    ['Green screen', 'green ?screen'],
    ['Split screen', 'split ?screen'],
    ['Native screenshot', 'notes ?app|imessage|text message|tweet|reddit post|screenshot'],
    ['Static', 'static|statico|statica|img|image|immagine|photo|foto|still|graphic|banner|jpe?g|png'],
    ['Video', 'video|vid|motion|animation|animated|animazione|mp4|b ?roll'],
  ],
  angle: [
    ['Transformation', 'before ?(?:and |& )?after|b ?a|prima ?(?:e )?dopo|transformation|trasformazione|results?|risultati'],
    ['Comparison', 'us ?vs ?them|usvsthem|uvt|comparison|confronto|versus|competitors?'],
    ['Pain point', 'pain ?points?|problem|problema|frustration|struggle'],
    ['Social proof', 'social ?proof|testimonials?|testimonianza|reviews?|recension[ei]|5 ?stars?|stelle'],
    ['Offer', 'offer|offerta|promo|sale|saldi|discount|sconto|deal|bogo|bundle|bfcm|black ?friday|cyber ?monday|free shipping|price|prezzo|pricing|\\d+ ?% ?off|\\d+ ?off'],
    ['Authority', 'authority|expert|esperto|doctor|derm|dermatologist|dermatologo|science|scienza|clinical|clinico'],
    ['Ingredients', 'ingredients?|ingredienti|formula|actives?'],
    ['Education', 'education|edu|how ?to|tutorial|tips|consigli|guide|guida|explainer'],
    ['Myth busting', 'myths?|myth ?busting|mito|miti|truth|verità'],
    ['Founder story', 'founder ?story|origin(?: story)?|mission|brand story|our story'],
    ['Routine', 'routine|grwm|get ready|day in (?:the|my) life|ditl'],
    ['Urgency', 'urgency|urgenza|scarcity|fomo|last chance|ultima occasione|limited|countdown'],
    ['Gift', "gift|gifting|regalo|xmas|christmas|natale|mother'?s ?day|festa della mamma|valentine"],
    ['Objection', 'objections?|obiezion[ei]|faq'],
    ['Benefit', 'benefits?|benefici|beneficio|outcome|vantaggi'],
  ],
  persona: [
    ['Busy moms', 'busy ?moms?|working ?moms?|mamme? (?:che )?lavora(?:no|trici)'],
    ['Moms', 'moms?|mamm[ae]|mother|mothers|parents?|genitori|new ?moms?'],
    ['Men', 'men|man|male|uom[oi]|dads?|papà|papa'],
    ['Gen Z', 'gen ?z|zoomers?|teens?|students?|studenti'],
    ['Millennials', 'millennials?'],
    ['Busy pros', 'busy|busy ?pros?|professionals?|professionist[ei]|office|corporate|managers?'],
    ['40+', '40 ?\\+|40 ?plus|over ?40|over ?50|50 ?\\+|mature|aging|anti ?age|menopause|menopausa'],
    ['Acne-prone', 'acne|acne ?prone|breakouts?|brufoli'],
    ['Sensitive skin', 'sensitive(?: skin)?|pelle sensibile|redness|rosacea'],
    ['Athletes', 'athletes?|atleti|fitness|gym|palestra|runners?|sport'],
    ['Brides', 'brides?|sposa|spose|wedding|matrimonio'],
    ['Pet owners', 'pets?|pet ?owners?|dogs?|cats?|cane|gatto'],
    ['Women', 'women|woman|female|donn[ae]'],
  ],
};
for (const dim of Object.keys(DICTIONARY)) {
  DICTIONARY[dim] = DICTIONARY[dim].map(([label, pattern]) => [label, word(pattern)]);
}

const DATE_LIKE = /^(\d{2,4}[-./]?\d{1,2}([-./]?\d{1,2})?|\d{6,8}|(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|gen(naio)?|febbraio|marzo|aprile|mag(gio)?|giu(gno)?|lug(lio)?|ago(sto)?|set(tembre)?|ott(obre)?|novembre|dic(embre)?)[-\s]?\d{0,4}|q[1-4][-\s]?\d{0,4}|w\d{1,2}|v\d{1,3}|copy( \d+)?|\d+)$/i;
const EMPTY_LIKE = /^(-+|x|na|n\/a|none|tbd|null|undefined|\?+)$/i;
const HOOK_CODE = /^(?:h|hk|hook)[ -]?(\d{1,2})$/i;
const HOOK_CODE_INLINE = /\b(?:h|hk|hook)[ -]?(\d{1,2})\b/i;
const QUOTED = /["“”«»]([^"“”«»]{3,90})["“”«»]/;

/** Splits camelCase and normalizes separators so dictionary regexes see words. */
export function normalizeText(s) {
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/[^\p{L}\p{N}@+%&' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDelimiter(name) {
  let best = null;
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = name.split(d).length - 1;
    // Prefer the spaced variants (" - ") over bare ones ("-") when tied.
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}

function cleanFreeValue(raw) {
  let v = String(raw || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v || EMPTY_LIKE.test(v) || DATE_LIKE.test(v)) return null;
  if (v.startsWith('@')) return v.toLowerCase();
  v = v.replace(/([a-z])([A-Z])/g, '$1 $2');
  if (v === v.toUpperCase() || v === v.toLowerCase()) {
    v = v.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  }
  return v.length > 48 ? v.slice(0, 47) + '…' : v;
}

function lookupDictionary(dim, text) {
  const entries = DICTIONARY[dim];
  if (!entries) return null;
  for (const [label, re] of entries) {
    if (re.test(text)) return label;
  }
  return null;
}

function keyForAlias(alias) {
  const a = alias.toLowerCase();
  for (const dim of DIMENSIONS) {
    if (KEY_ALIASES[dim].includes(a)) return dim;
  }
  return null;
}

function hookLabel(value) {
  const code = String(value).trim().match(HOOK_CODE);
  if (code) return 'Hook ' + Number(code[1]);
  return cleanFreeValue(value);
}

/** Reads one segment. Returns {explicit:{dim:value}, dict:{dim:label}}. */
function readSegment(segment) {
  const explicit = {};
  const dict = {};
  const raw = segment.trim();
  if (!raw) return { explicit, dict };

  // Several pairs in one segment: "angle:Offer fmt=static P:40+".
  const pairs = raw.split(/\s+(?=[A-Za-zÀ-ÿ]{1,12}\s*[:=])/);
  if (pairs.length > 1 && pairs.every((p) => /^[A-Za-zÀ-ÿ]{1,12}\s*[:=]/.test(p))) {
    for (const piece of pairs) {
      const r = readSegment(piece);
      for (const [dim, v] of Object.entries(r.explicit)) if (!explicit[dim]) explicit[dim] = v;
      for (const [dim, v] of Object.entries(r.dict)) if (!dict[dim]) dict[dim] = v;
    }
    return { explicit, dict };
  }

  // key:value or key=value, including single-letter keys.
  const kv = raw.match(/^([A-Za-zÀ-ÿ]{1,12})\s*[:=]\s*(.+)$/);
  if (kv) {
    const k = kv[1].toLowerCase();
    const dim = SHORT_KEYS[k] || keyForAlias(k);
    if (dim) {
      explicit[dim] = dim === 'hook' ? hookLabel(kv[2]) : normalizeExplicit(dim, kv[2]);
      return { explicit, dict };
    }
  }
  // longkey-value ("angle-price", "creator-sarah"); never single letters.
  const kd = raw.match(/^([A-Za-zÀ-ÿ]{2,12})[-\s]+(.+)$/);
  if (kd) {
    const dim = keyForAlias(kd[1]);
    if (dim && !(dim === 'hook' && HOOK_CODE.test(raw))) {
      explicit[dim] = dim === 'hook' ? hookLabel(kd[2]) : normalizeExplicit(dim, kd[2]);
      return { explicit, dict };
    }
  }

  const handle = raw.match(/@[\p{L}\p{N}._]{2,30}/u);
  if (handle) explicit.creator = handle[0].toLowerCase().replace(/[._]+$/, '');

  const hookCode = raw.match(HOOK_CODE) || (raw.length <= 24 && raw.match(HOOK_CODE_INLINE));
  if (hookCode) explicit.hook = 'Hook ' + Number(hookCode[1]);

  const text = normalizeText(raw);
  for (const dim of ['format', 'angle', 'persona']) {
    const label = lookupDictionary(dim, text);
    if (label) dict[dim] = label;
  }
  return { explicit, dict };
}

function normalizeExplicit(dim, value) {
  const text = normalizeText(value);
  const label = lookupDictionary(dim, text);
  if (label) return label;
  return cleanFreeValue(value);
}

/** Splits a name into its segments and reads each one. */
export function tokenizeName(name) {
  let rest = String(name || '');
  let quotedHook = null;
  const q = rest.match(QUOTED);
  if (q) {
    quotedHook = cleanFreeValue(q[1]);
    rest = rest.replace(q[0], ' ');
  }
  const delimiter = detectDelimiter(rest);
  const parts = delimiter ? rest.split(delimiter) : [rest];
  const segments = parts.map((p) => p.trim()).map((text) => ({ text, ...readSegment(text) }));
  return { delimiter, segments, quotedHook };
}

function looksLikeFreeHook(text) {
  const words = text.trim().split(/\s+/);
  return words.length >= 3 && text.length >= 14;
}

/**
 * Parses a naming template such as "{date}_{format}_{angle}_{persona}_{creator}_{hook}".
 * Returns {delimiter, positions:{dim:index}} or null.
 */
export function parseTemplate(template) {
  const t = String(template || '').trim();
  if (!t || !t.includes('{')) return null;
  const delimiter = detectDelimiter(t.replace(/\{[^}]*\}/g, 'x'));
  const parts = delimiter ? t.split(delimiter) : [t];
  const positions = {};
  parts.forEach((p, i) => {
    const m = p.trim().match(/^\{\s*([A-Za-z]+)\s*\}$/);
    if (!m) return;
    const dim = keyForAlias(m[1]) || (DIMENSIONS.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null);
    if (dim && positions[dim] === undefined) positions[dim] = i;
  });
  return Object.keys(positions).length ? { delimiter, positions, length: parts.length } : null;
}

/**
 * Learns which segment position holds which dimension, per name shape.
 * Returns Map(shapeKey -> {dim: index}).
 */
export function inferPositions(tokenized, { minNames = 3, minShare = 0.5 } = {}) {
  const shapes = new Map();
  for (const tk of tokenized) {
    if (!tk.delimiter || tk.segments.length < 2) continue;
    const key = tk.delimiter + '#' + tk.segments.length;
    if (!shapes.has(key)) shapes.set(key, []);
    shapes.get(key).push(tk);
  }
  const result = new Map();
  for (const [key, list] of shapes) {
    if (list.length < minNames) continue;
    const len = list[0].segments.length;
    const candidates = [];
    for (let pos = 0; pos < len; pos++) {
      const counts = { format: 0, angle: 0, persona: 0, creator: 0, hook: 0 };
      let filled = 0;
      for (const tk of list) {
        const seg = tk.segments[pos];
        const v = seg.text.trim();
        if (!v || EMPTY_LIKE.test(v)) continue;
        filled++;
        for (const dim of ['format', 'angle', 'persona']) {
          if (seg.explicit[dim] || seg.dict[dim]) counts[dim]++;
        }
        if (seg.explicit.creator) counts.creator++;
        if (seg.explicit.hook || looksLikeFreeHook(v)) counts.hook++;
      }
      if (filled < minNames) continue;
      for (const dim of DIMENSIONS) {
        const share = counts[dim] / filled;
        if (share >= minShare) candidates.push({ dim, pos, share });
      }
    }
    candidates.sort((a, b) => b.share - a.share);
    const assigned = {};
    const usedPos = new Set();
    for (const c of candidates) {
      if (assigned[c.dim] !== undefined || usedPos.has(c.pos)) continue;
      assigned[c.dim] = c.pos;
      usedPos.add(c.pos);
    }
    if (Object.keys(assigned).length) result.set(key, assigned);
  }
  return result;
}

const CREATIVE_TYPE_FORMAT = {
  video: 'Video',
  image: 'Static',
  carousel: 'Carousel',
  dynamic: 'Catalog',
  flexible: 'Flexible',
};

/**
 * Parses a batch of ads.
 * @param {Array<{name:string, creativeType?:string, body?:string}>} items
 * @param {{template?:string}} [options]
 * @returns {Array<{format,angle,persona,creator,hook,source:Object}>}
 */
export function parseAdNames(items, options = {}) {
  const tokenized = items.map((it) => tokenizeName(it.name));
  const template = parseTemplate(options.template);
  const positions = inferPositions(tokenized);

  return items.map((item, idx) => {
    const tk = tokenized[idx];
    const out = { format: null, angle: null, persona: null, creator: null, hook: null };
    const source = {};
    const set = (dim, value, src) => {
      if (value && !out[dim]) {
        out[dim] = value;
        source[dim] = src;
      }
    };

    // Template first: the user told us exactly where things are.
    if (template && tk.delimiter === template.delimiter) {
      for (const [dim, pos] of Object.entries(template.positions)) {
        const seg = tk.segments[pos];
        if (!seg) continue;
        let value = seg.explicit[dim] || seg.dict[dim] || null;
        if (!value) value = dim === 'hook' ? hookLabel(seg.text) : normalizeExplicit(dim, seg.text);
        set(dim, value, 'template');
      }
    }

    for (const seg of tk.segments) {
      for (const dim of DIMENSIONS) set(dim, seg.explicit[dim], 'name');
    }
    for (const seg of tk.segments) {
      for (const dim of ['format', 'angle', 'persona']) set(dim, seg.dict[dim], 'name');
    }
    set('hook', tk.quotedHook, 'name');

    const shapeKey = tk.delimiter ? tk.delimiter + '#' + tk.segments.length : null;
    const shapePositions = shapeKey ? positions.get(shapeKey) : null;
    if (shapePositions) {
      for (const [dim, pos] of Object.entries(shapePositions)) {
        const seg = tk.segments[pos];
        if (!seg) continue;
        const value = dim === 'hook' ? hookLabel(seg.text) : normalizeExplicit(dim, seg.text);
        set(dim, value, 'position');
      }
    }

    // Single-segment names ("ugc pain point moms") still get dictionary hits above.
    set('format', CREATIVE_TYPE_FORMAT[item.creativeType] || null, 'creative');

    if (!out.hook && item.body) {
      const firstLine = String(item.body).split(/\n|(?<=[.!?])\s/)[0].trim();
      if (firstLine.length >= 8) set('hook', cleanFreeValue(firstLine), 'copy');
    }
    return { ...out, source };
  });
}
