// Places each creative in the funnel by where Meta spent on it.
//
// With audience-segment data (Meta's "new / engaged / existing customers" breakdown,
// `user_segment_key` in the Insights API) the dominant segment decides the level, and
// engaged spend is split into "warming" and "saturated" by frequency.
// Without segment data the level comes from campaign/ad set naming hints, then from
// delivery: frequency and CPMr (cost per 1,000 people reached) relative to the account.
// Those placements are drawn dashed in the UI. Pure module, no DOM.

export const FUNNEL_LEVELS = [
  { key: 'top', color: '#1a9fa0' },
  { key: 'middle', color: '#c98500' },
  { key: 'bottom', color: '#e0587f' },
  { key: 'reactivation', color: '#857fe8' },
];

export const SEGMENT_COLORS = { new: '#1a9fa0', engaged: '#c98500', existing: '#857fe8' };

/** Maps whatever Meta returns for user_segment_key onto new | engaged | existing. */
export function normalizeSegmentKey(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (/exist|current|retain|repeat|customer_list|purchas/.test(s)) return 'existing';
  if (/engag|warm|visitor|interact/.test(s)) return 'engaged';
  if (/new|prospect|acquisi|cold/.test(s)) return 'new';
  return null;
}

const NAME_HINTS = [
  ['reactivation', /(?<![a-z])(existing|customers?|clienti|win ?back|winback|reactivat\w*|riattiv\w*|retention|ritenzione|loyal\w*|repeat|upsell|cross ?sell|post ?purchase|vip|crm)(?![a-z])/i],
  ['bottom', /(?<![a-z])(bof|bottom|retarget\w*|rtg|rt|remarketing|cart|atc|checkout|abandon\w*|carrello|dpa ?rt)(?![a-z])/i],
  ['middle', /(?<![a-z])(mof|middle|warm|engag\w*|video ?viewers?|vv|visitors?|visitatori|ig ?engagers?|page ?view\w*|consideration)(?![a-z])/i],
  ['top', /(?<![a-z])(tof|top|prospect\w*|cold|broad|lal|lookalike|interests?|acquisition|acq|awareness|reach)(?![a-z])/i],
];

/** Finds a funnel hint in campaign / ad set names. Checked bottom-up: "TOF + RT" is retargeting. */
export function levelFromNames(names) {
  const text = names.filter(Boolean).join(' | ');
  // "LAL 1% customers" is prospecting, whatever else the name says.
  if (/(?<![a-z])(lal|lookalike|look ?alike|simili)(?![a-z])/i.test(text)) return 'top';
  for (const [level, re] of NAME_HINTS) {
    if (re.test(text)) return level;
  }
  return null;
}

function quantile(values, q) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/**
 * Account-level reference points.
 * @param {Array<{spend:number, frequency:number, cpmr:number}>} units
 */
export function funnelContext(units, settings = {}) {
  const live = units.filter((u) => u.spend > 0 && u.frequency > 0);
  const freqs = live.map((u) => u.frequency);
  const cpmrs = live.filter((u) => u.cpmr > 0).map((u) => u.cpmr);
  const medianFreq = quantile(freqs, 0.5) || 1;
  const medianCpmr = quantile(cpmrs, 0.5) || 1;
  const q = settings.saturationQuantile ?? 0.7;
  // Frequency accumulates with the window: 2.0 over 14 days is about 1.6 over 7 and 2.5 over 30.
  const windowFactor = Math.pow(Math.max(1, settings.windowDays || 14) / 14, 0.3);
  const satFreq = Math.max((settings.minSaturationFrequency ?? 2) * windowFactor, quantile(freqs, q) || 0);
  return { medianFreq, medianCpmr, satFreq, segmentCoverage: settings.segmentCoverage ?? 0.5 };
}

/**
 * @param {{spend:number, frequency:number, cpmr:number,
 *          segments?:{new:number, engaged:number, existing:number}|null,
 *          names?:string[]}} unit
 * @returns {{level:string, method:'segments'|'names'|'delivery', shares:Object|null, depth:number}}
 */
export function classifyFunnel(unit, ctx) {
  const seg = unit.segments;
  const segTotal = seg ? (seg.new || 0) + (seg.engaged || 0) + (seg.existing || 0) : 0;
  const freq = unit.frequency || 0;

  if (seg && segTotal > 0 && segTotal >= ctx.segmentCoverage * (unit.spend || segTotal)) {
    const shares = {
      new: (seg.new || 0) / segTotal,
      engaged: (seg.engaged || 0) / segTotal,
      existing: (seg.existing || 0) / segTotal,
    };
    let level;
    let depth;
    if (shares.existing >= shares.new && shares.existing >= shares.engaged) {
      level = 'reactivation';
      depth = clamp01((shares.existing - 0.34) / 0.66);
    } else if (shares.engaged > shares.new) {
      if (freq >= ctx.satFreq) {
        level = 'bottom';
        depth = clamp01((freq - ctx.satFreq) / ctx.satFreq);
      } else {
        level = 'middle';
        depth = clamp01((freq - ctx.medianFreq) / Math.max(0.01, ctx.satFreq - ctx.medianFreq));
      }
    } else {
      level = 'top';
      depth = clamp01((shares.engaged + shares.existing) / 0.5);
    }
    return { level, method: 'segments', shares, depth };
  }

  const hinted = levelFromNames(unit.names || []);
  const f = freq / ctx.medianFreq;
  const c = (unit.cpmr || ctx.medianCpmr) / ctx.medianCpmr;
  const score = 0.6 * Math.log2(Math.max(f, 0.05)) + 0.4 * Math.log2(Math.max(c, 0.05));
  if (hinted) {
    return { level: hinted, method: 'names', shares: null, depth: clamp01(0.5 + score / 2) };
  }
  let level = 'top';
  if (freq >= ctx.satFreq && score >= 0.6) level = 'bottom';
  else if (score >= 0.35) level = 'middle';
  const depth = level === 'top' ? clamp01(0.5 + score) : clamp01(score / 1.5);
  return { level, method: 'delivery', shares: null, depth };
}
