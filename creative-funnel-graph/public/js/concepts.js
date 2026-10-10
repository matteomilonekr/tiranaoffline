// The concept of a creative: the idea it sells with (a before/after, a comparison, a
// problem and its fix, a testimonial…). Read from, strongest first: a tag that ships with
// the data, the UGC format, the copy and ad name, then the angle and format the ad name
// gives. Pure module, no DOM.

export const CONCEPTS = [
  'before_after',
  'versus',
  'problem_solution',
  'testimonial',
  'demo',
  'ingredients',
  'benefits',
  'offer',
  'story',
  'pov',
  'authority',
  'native',
  'unboxing',
  'lifestyle',
  'humor',
  'product',
  'other',
];

const FROM_UGC = { reveal: 'before_after', unboxing: 'unboxing', testimonial: 'testimonial', interview: 'testimonial', reaction: 'testimonial', routine: 'lifestyle', tutorial: 'demo', pov: 'pov' };

// Ordered: the first match wins, so a before/after beats the testimonial that shows it.
const FROM_COPY = [
  ['before_after', /before (and |& |\/ ?)after|before\s?\/\s?after|prima (e |\/ ?)dopo|\bb\/a\b|transformation|trasformazione|glow ?up|then (and|vs\.?) now|day 1 (vs\.?|to) day/],
  ['versus', /\bvs\.?\b|versus|us vs them|compared to|instead of|alternative to|confronto|al posto d/],
  ['unboxing', /unbox|what'?s in (the|my) box|\bhaul\b/],
  ['pov', /\bpov\b|\bskit\b/],
  ['problem_solution', /struggling with|tired of|sick of|say goodbye to|no more |stanc[ao] di|basta con|addio a/],
  ['authority', /doctor|dermatologist|\bderm\b|clinically (proven|tested)|scientists?|medico|dermatolog/],
  ['ingredients', /ingredients?|ingredienti|formula|packed with|made with|\d+\s?mg\b/],
  ['testimonial', /\breview|testimonial|recension|my experience|la mia esperienza|“i |"i |i('ve| have)? (lost|tried|been using)/],
  ['demo', /how (it|to) works?|how to (use|take)|watch (how|me)|in action|come funziona|come si usa/],
];

// Values the naming dictionary gives the angle and format dimensions.
const FROM_ANGLE = [
  ['before_after', /transformation|trasformazione|before|prima/i],
  ['versus', /comparison|confronto|versus/i],
  ['problem_solution', /pain|problem/i],
  ['testimonial', /social proof|testimonial|review/i],
  ['offer', /offer|offerta|promo|sale|discount/i],
  ['ingredients', /ingredient/i],
  ['story', /founder|story|storia/i],
  ['authority', /authority|expert|science/i],
  ['demo', /education|tutorial|how/i],
  ['lifestyle', /routine/i],
  ['benefits', /benefit/i],
];
const FROM_FORMAT = [
  ['native', /native|advertorial|screenshot|notes/i],
  ['humor', /meme/i],
  ['unboxing', /unboxing/i],
];

/** A creative's concept and where it came from ("tag", "ugc", "copy", "name"); "other" when nothing says. */
export function conceptOf(ad) {
  const tags = ad.tags || {};
  if (CONCEPTS.includes(tags.concept)) return { concept: tags.concept, source: 'tag' };
  if (FROM_UGC[tags.ugc]) return { concept: FROM_UGC[tags.ugc], source: 'ugc' };
  const copy = [ad.creative?.hookLine, ad.creative?.title, ad.creative?.body, ad.name].filter(Boolean).join(' \n ').toLowerCase();
  for (const [key, re] of FROM_COPY) if (re.test(copy)) return { concept: key, source: 'copy' };
  for (const [key, re] of FROM_ANGLE) if (re.test(String(tags.angle || ''))) return { concept: key, source: 'name' };
  for (const [key, re] of FROM_FORMAT) if (re.test(String(tags.format || ''))) return { concept: key, source: 'name' };
  if (['bogo', 'percent', 'amount', 'bundle'].includes(tags.offer)) return { concept: 'offer', source: 'copy' };
  return { concept: 'other', source: null };
}
