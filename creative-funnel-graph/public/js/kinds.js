// What kind of asset a creative is (a static, a video, UGC, a carousel) and, for UGC, what
// the creator films (an unboxing, a reveal, a testimonial…). Read from, strongest first:
// tags that ship with the data, the format tag of the ad name, the creative's own type and
// the copy. Pure module, no DOM.

export const ASSET_TYPES = ['static', 'video', 'ugc', 'carousel'];

/** UGC formats; "talking" (to camera) and "other" come only from tags, never from the copy. */
export const UGC_TYPES = ['unboxing', 'reveal', 'testimonial', 'routine', 'tutorial', 'reaction', 'pov', 'interview', 'talking', 'other'];

// Ordered: the first match wins, so the specific formats come before "testimonial".
const UGC_COPY = [
  ['unboxing', /unbox|what'?s in (the|my) (box|package)|\bhaul\b|my (order|package) (came|arrived)|(è )?arrivato il (mio )?pacco|spacchett/],
  ['reveal', /\breveal|before (and |& |\/ ?)after|prima (e )?dopo|transformation|trasformazione|glow ?up|results? after \d+|risultati dopo/],
  ['routine', /\bgrwm\b|get ready with me|routine|day in (the|my) life|\bditl\b|preparati con me/],
  ['tutorial', /how (to|i) use|tutorial|step[- ]by[- ]step|here'?s how (to|i)|come (si )?usa/],
  ['reaction', /\breaction|reacts? to|first (time|impressions?)|taste test|prima volta che|reazione/],
  ['pov', /\bpov\b|\bskit\b|storytime/],
  ['interview', /interview|podcast|street (talk|quiz)|intervista/],
  ['testimonial', /honest review|my review|testimonial|recensione|my experience|la mia esperienza|i('ve| have)? (been using|tried|lost)/],
];

// Values the naming dictionary gives the format dimension ("UGC", "Founder-led"…) or a tag.
const UGC_FORMAT = /ugc|user generated|selfie|talking ?head|founder|unboxing|podcast|green ?screen|creator/i;
const VIDEO_FORMAT = /video|vsl|gif|motion|animat/i;
const CAROUSEL_FORMAT = /carousel|carosello|catalog/i;

const copyOf = (ad) => [ad.creative?.title, ad.creative?.body, ad.name].filter(Boolean).join(' \n ').toLowerCase();

/** The UGC format named by a piece of copy, or null. */
export function ugcFromCopy(text) {
  const copy = String(text || '').toLowerCase();
  for (const [key, re] of UGC_COPY) if (re.test(copy)) return key;
  return null;
}

/**
 * An ad's asset type and UGC format, each with where it came from.
 * @returns {{asset:string, ugc:string|null, source:{asset:string, ugc:string|null}}}
 */
export function kindOf(ad) {
  const tags = ad.tags || {};
  const format = String(tags.format || '');
  const type = ad.creative?.type;
  let asset = ASSET_TYPES.includes(tags.asset) ? tags.asset : null;
  let assetSource = asset ? 'tag' : null;
  if (!asset) {
    assetSource = 'creative';
    // A creator in the name makes a video UGC; a static with one is still a static.
    if (UGC_FORMAT.test(format) || UGC_TYPES.includes(tags.ugc) || (tags.creator && type === 'video')) {
      asset = 'ugc';
      assetSource = 'name';
    } else if (type === 'video' || VIDEO_FORMAT.test(format)) asset = 'video';
    else if (type === 'carousel' || CAROUSEL_FORMAT.test(format)) asset = 'carousel';
    else asset = 'static';
  }
  if (asset !== 'ugc') return { asset, ugc: null, source: { asset: assetSource, ugc: null } };
  if (UGC_TYPES.includes(tags.ugc)) return { asset, ugc: tags.ugc, source: { asset: assetSource, ugc: 'tag' } };
  if (/unboxing/i.test(format)) return { asset, ugc: 'unboxing', source: { asset: assetSource, ugc: 'name' } };
  if (/podcast/i.test(format)) return { asset, ugc: 'interview', source: { asset: assetSource, ugc: 'name' } };
  const fromCopy = ugcFromCopy(copyOf(ad));
  return { asset, ugc: fromCopy || 'other', source: { asset: assetSource, ugc: fromCopy ? 'copy' : null } };
}
