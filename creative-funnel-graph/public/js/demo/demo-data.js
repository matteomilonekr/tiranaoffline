// The "Demo brand": a seeded, believable skincare account so the app opens in a working
// state before anyone connects Meta. Every ad carries a `paint` spec that painter.js
// turns into a creative image; near-duplicate variants share a template, palette and
// product, so the visual stacking finds them the same way it would on real thumbnails.
// Pure module, no DOM.

import { rng, hashString } from '../layout.js';
import { addDays, dayKey, daysBetween } from '../format.js';

export const DEMO_ACCOUNT = { id: 'demo', name: 'Demo brand', currency: 'USD', timezone: 'America/New_York' };

/**
 * The brands this module holds, for the brand menu. One here, named by the app's own
 * strings; a hosted page built with real brands lists each with its name, the day its ads
 * were read and whether its spend is simulated.
 * @type {Array<{key:string, name?:string, read?:string, ads?:number, simulated?:boolean}>}
 */
export const DEMO_BRANDS = [{ key: 'demo' }];

const PRODUCTS = [
  { key: 'serum', name: 'Dark Spot Serum', short: 'DarkSpot', shape: 'dropper' },
  { key: 'neck', name: 'Firming Neck Cream', short: 'NeckCream', shape: 'jar' },
  { key: 'vitc', name: 'Vitamin C Glow Drops', short: 'GlowDrops', shape: 'dropper' },
  { key: 'barrier', name: 'Barrier Repair Moisturizer', short: 'Barrier', shape: 'tube' },
  { key: 'retinol', name: 'Retinol Night Oil', short: 'NightOil', shape: 'bottle' },
  { key: 'spf', name: 'Daily SPF 50 Fluid', short: 'SPF50', shape: 'tube' },
];

const PALETTES = [
  { bg: '#f4d03f', bg2: '#f7dc6f', ink: '#1b1b1b', accent: '#e8590c', product: '#fdfaf3' },
  { bg: '#f8e1e7', bg2: '#fcecef', ink: '#3a2028', accent: '#d6336c', product: '#ffffff' },
  { bg: '#1c3d6e', bg2: '#2b5797', ink: '#ffffff', accent: '#ffd43b', product: '#e7f0ff' },
  { bg: '#e9f5ec', bg2: '#d3eedc', ink: '#123524', accent: '#2f9e44', product: '#ffffff' },
  { bg: '#2b2b2b', bg2: '#444444', ink: '#ffffff', accent: '#ff922b', product: '#f1f3f5' },
  { bg: '#fff4e6', bg2: '#ffe8cc', ink: '#5c2d0a', accent: '#f76707', product: '#ffffff' },
  { bg: '#e7e1f9', bg2: '#d6ccf5', ink: '#2c1f63', accent: '#7048e8', product: '#ffffff' },
  { bg: '#d0ebff', bg2: '#a5d8ff', ink: '#0b2e4f', accent: '#1971c2', product: '#ffffff' },
  { bg: '#f1e4d8', bg2: '#e6d2bf', ink: '#3b2a1e', accent: '#a0522d', product: '#fffaf5' },
  { bg: '#c3fae8', bg2: '#96f2d7', ink: '#063c2f', accent: '#0ca678', product: '#ffffff' },
];

const SKIN = ['#f1c7a8', '#e0ac85', '#c68a62', '#8d5a3b', '#f6d5bd', '#a86e4a'];

const HEADLINES = {
  serum: ['ERASE DARK SPOTS IN JUST 10 MINUTES', 'FADE SPOTS IN 14 DAYS', 'DARK SPOTS? NOT ANYMORE', 'THE SPOT FADER DERMS LOVE'],
  neck: ['GET 60% OFF NECK FIRMING CREAM', 'TECH NECK, MEET YOUR MATCH', 'LIFT YOUR NECK IN 4 WEEKS', 'THE NECK CREAM THAT WORKS'],
  vitc: ['GLOW LIKE YOU SLEPT 9 HOURS', 'VITAMIN C THAT DOES NOT OXIDIZE', 'YOUR 30-SECOND GLOW', 'MAKE THIS YOUR BEST SKIN YEAR'],
  barrier: ['SENSITIVE SKIN? START HERE', 'REPAIR YOUR BARRIER OVERNIGHT', 'NO MORE TIGHT, ITCHY SKIN', 'CALM SKIN IN 3 DAYS'],
  retinol: ['RETINOL WITHOUT THE PEEL', 'WAKE UP SMOOTHER', 'NIGHT OIL, DAY RESULTS', 'FINE LINES, BLURRED'],
  spf: ['SPF YOU WILL ACTUALLY WEAR', 'NO WHITE CAST. EVER.', 'SUNSCREEN THAT FEELS LIKE NOTHING', 'YOUR DAILY ANTI-AGING STEP'],
};

const CAPTIONS = [
  'I had facial hair for years…',
  'POV: my derm asked what I changed',
  'Day 14 of using this serum',
  'Why I stopped buying 5 products',
  'Watch my dark spots fade',
  'Honest review after 30 days',
  'My 3-step night routine',
  'Mom of 3, zero time for skincare',
  'This replaced my $90 cream',
  'Not sponsored, just obsessed',
];

const QUOTES = [
  'My spots faded in two weeks. I stopped wearing concealer.',
  'Finally a cream my sensitive skin does not react to.',
  'I get asked what I use every single day now.',
  'My neck looks firmer than it did at 40.',
  'Worth every penny. I am on my third bottle.',
];

// Invented handles for the demo brand.
const CREATORS = ['@creator.ana', '@creator.lea', '@creator.mila', '@creator.kai', '@creator.noor', '@creator.jules', '@creator.amara', '@creator.tess'];
const PERSONAS = ['BusyMom', 'Over40', 'GenZ', 'SensitiveSkin', 'AcneProne', 'Men', 'Bride'];
const ANGLES = {
  ugc: ['PainPoint', 'SocialProof', 'Routine', 'Transformation', 'Education'],
  headline: ['Benefit', 'PainPoint', 'Urgency'],
  hero: ['Benefit', 'Ingredients', 'Offer'],
  offer: ['Offer', 'Urgency'],
  testimonial: ['SocialProof'],
  beforeAfter: ['Transformation'],
  listicle: ['Education', 'MythBusting'],
  notes: ['PainPoint', 'Founder Story'],
  comparison: ['Comparison'],
  founder: ['Founder Story', 'Authority'],
  ingredients: ['Ingredients', 'Authority'],
  carousel: ['Benefit', 'Education'],
};
const FORMAT_TOKEN = {
  ugc: 'UGC',
  headline: 'Static',
  hero: 'Static',
  offer: 'Static',
  testimonial: 'Static',
  beforeAfter: 'Static',
  listicle: 'Static',
  notes: 'NotesApp',
  comparison: 'Static',
  founder: 'Video',
  ingredients: 'Static',
  carousel: 'Carousel',
};
const ASPECTS = { feed: 0.8, square: 1, story: 0.5625 };

// Concepts per level: [template, how many visual variants (ads in the stack)].
// Funnel targets in cards: top 88, middle 19, bottom 20, reactivation 10.
const LEVEL_PLAN = {
  top: { cards: 88, spend: 40700, roas: 2.41, seg: [0.84, 0.13, 0.03], freq: [1.15, 1.6], noSegments: 4, stackSizes: [12, 4, 3, 3, 2, 2, 2] },
  middle: { cards: 19, spend: 11100, roas: 2.03, seg: [0.24, 0.68, 0.08], freq: [1.35, 1.75], noSegments: 3, stackSizes: [3, 2] },
  bottom: { cards: 20, spend: 3100, roas: 3.06, seg: [0.1, 0.8, 0.1], freq: [3.1, 5.2], noSegments: 3, stackSizes: [2, 2] },
  reactivation: { cards: 10, spend: 2000, roas: 4.12, seg: [0.06, 0.2, 0.74], freq: [2.2, 3.4], noSegments: 2, stackSizes: [2] },
};

const TEMPLATE_WEIGHTS = {
  top: [['ugc', 30], ['headline', 14], ['hero', 10], ['beforeAfter', 7], ['founder', 6], ['listicle', 6], ['comparison', 5], ['notes', 5], ['ingredients', 4], ['carousel', 4]],
  middle: [['testimonial', 6], ['ugc', 5], ['comparison', 3], ['ingredients', 2], ['listicle', 2], ['beforeAfter', 1]],
  bottom: [['offer', 8], ['testimonial', 5], ['headline', 3], ['hero', 2], ['ugc', 2]],
  reactivation: [['offer', 3], ['hero', 3], ['carousel', 2], ['testimonial', 2]],
};

function pick(rand, list) {
  return list[Math.floor(rand() * list.length) % list.length];
}

function weighted(rand, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

function splitTotal(rand, total, n, skew = 1.6) {
  const weights = Array.from({ length: n }, () => Math.pow(rand() + 0.08, skew * 2.2));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * total);
}

function campaignFor(level, hasSegments, rand) {
  if (!hasSegments) {
    return level === 'top'
      ? { name: 'Broad | Manual | Interest stack', adset: 'Broad 25-54 F' }
      : level === 'reactivation'
        ? { name: 'Retention | Manual', adset: 'Purchasers 180d' }
        : level === 'bottom'
          ? { name: 'Retargeting | Manual 2025', adset: 'ATC 14d' }
          : { name: 'Warm | Manual 2025', adset: 'Video viewers 50% 30d' };
  }
  const ascs = ['ASC | Evergreen | US', 'ASC | Q4 Scale | US', 'Advantage+ Sales | Testing'];
  return { name: pick(rand, ascs), adset: 'Advantage+ audience' };
}

function makeName(spec, product, rand, i, until) {
  const date = addDays(until, -Math.floor(rand() * 75)).replace(/-/g, '');
  const fmt = FORMAT_TOKEN[spec.template];
  const angle = spec.angle;
  const persona = spec.persona;
  const style = i % 9;
  if (style === 0) return `${product.short} - ${fmt} - ${spec.creator} - H${spec.hook} ${angle}`;
  if (style === 1) return `${fmt} | ${angle} | ${persona} | ${product.short}`;
  if (style === 2) return `${product.name} ${fmt.toLowerCase()} v${1 + (i % 3)}`;
  return `${date}_${product.short}_${fmt}_${angle.replace(/\s/g, '')}_${persona}_${spec.creator}_H${spec.hook}`;
}

function retentionCurve(rand, quality) {
  // video_play_curve_actions shape: % of plays still watching at seconds 0..14,
  // then 15-20, 20-25, 25-30, 30-40, 40-50, 50-60, 60+.
  const curve = [];
  let v = 100;
  const dropHook = 18 + (1 - quality) * 30 + rand() * 8;
  for (let s = 0; s < 22; s++) {
    if (s === 0) v = 100;
    else if (s <= 3) v -= dropHook / 3;
    else v *= 0.9 - (1 - quality) * 0.06 + rand() * 0.02;
    curve.push(Math.max(0, Math.round(v)));
  }
  return curve;
}

/**
 * Builds the demo snapshot for a date range (and a brand, for modules that hold several).
 * @param {{since:string, until:string}} range
 */
export function buildDemoSnapshot(range) {
  const rand = rng(hashString('demo-brand-2025'));
  const ads = [];
  const usedCombos = new Set();
  let concept = 0;
  const days = daysBetween(range.since, range.until);
  const rangeScale = Math.min(6, Math.max(0.2, days / 14));

  for (const [level, plan] of Object.entries(LEVEL_PLAN)) {
    const cardSpends = splitTotal(rand, plan.spend * rangeScale, plan.cards);
    cardSpends.sort((a, b) => b - a);
    for (let c = 0; c < plan.cards; c++) {
      concept++;
      // Distinct concepts should look distinct: re-roll a template/product/palette combo already used.
      let template;
      let product;
      let palette;
      for (let tries = 0; tries < 12; tries++) {
        template = weighted(rand, TEMPLATE_WEIGHTS[level]);
        product = pick(rand, PRODUCTS);
        palette = PALETTES[Math.floor(rand() * PALETTES.length)];
        const comboKey = template + '|' + product.key + '|' + (template === 'notes' ? '' : palette.bg);
        if (!usedCombos.has(comboKey)) {
          usedCombos.add(comboKey);
          break;
        }
      }
      const placement = template === 'ugc' || template === 'founder' ? 'story' : template === 'testimonial' || template === 'carousel' ? 'square' : pick(rand, ['feed', 'feed', 'square', 'story']);
      const variants = c < plan.stackSizes.length ? plan.stackSizes[c] : 1;
      // The smallest cards of each level come from manual campaigns without segment data.
      const hasSegments = c < plan.cards - plan.noSegments;
      const camp = campaignFor(level, hasSegments, rand);
      const quality = 0.35 + rand() * 0.6;
      const spec = {
        template,
        product: product.key,
        productName: product.name,
        shape: product.shape,
        palette,
        skin: pick(rand, SKIN),
        headline: pick(rand, HEADLINES[product.key]),
        caption: pick(rand, CAPTIONS),
        quote: pick(rand, QUOTES),
        discount: pick(rand, ['30%', '40%', '25%', '60%']),
        creator: pick(rand, CREATORS),
        persona: pick(rand, PERSONAS),
        angle: pick(rand, ANGLES[template]),
        hook: 1 + Math.floor(rand() * 6),
        seed: Math.floor(rand() * 1e9),
      };
      const isVideo = template === 'ugc' || template === 'founder';
      const variantSpends = splitTotal(rand, cardSpends[c], variants, 1.2);
      const roasBase = plan.roas * (0.55 + rand() * 0.9) * (0.7 + quality * 0.5);
      const freqBase = plan.freq[0] + rand() * (plan.freq[1] - plan.freq[0]);
      for (let v = 0; v < variants; v++) {
        const spend = Math.round(variantSpends[v] * 100) / 100;
        const cpm = 9 + rand() * 14 + (level === 'top' ? 0 : 6);
        const impressions = Math.round((spend / cpm) * 1000);
        const frequency = freqBase * (0.9 + rand() * 0.2) * Math.pow(days / 14, 0.3);
        const reach = Math.max(1, Math.round(impressions / frequency));
        const roasAd = roasBase * (0.8 + rand() * 0.4);
        const purchaseValue = Math.round(spend * roasAd * 100) / 100;
        const aov = 48 + rand() * 30;
        const purchases = Math.round(purchaseValue / aov);
        const linkClicks = Math.round(impressions * (0.006 + rand() * 0.012));
        const video3s = isVideo ? Math.round(impressions * (0.18 + quality * 0.25)) : 0;
        const thruplays = isVideo ? Math.round(video3s * (0.12 + quality * 0.2)) : 0;
        const segments = hasSegments
          ? (() => {
              const jitter = plan.seg.map((s) => Math.max(0.005, s * (0.75 + rand() * 0.5)));
              const total = jitter.reduce((a, b) => a + b, 0);
              return { new: (spend * jitter[0]) / total, engaged: (spend * jitter[1]) / total, existing: (spend * jitter[2]) / total };
            })()
          : null;
        const id = `demo_${concept}_${v}`;
        const variantSpec = {
          ...spec,
          variant: v,
          // Small edits a media buyer makes between "new" ads: shift, zoom, badge, headline case.
          dx: v === 0 ? 0 : (rand() - 0.5) * 0.03,
          dy: v === 0 ? 0 : (rand() - 0.5) * 0.024,
          zoom: v === 0 ? 1 : 0.99 + rand() * 0.03,
          badge: v % 3 === 2,
        };
        ads.push({
          id,
          name: makeName({ ...spec, template }, product, rand, concept + v, range.until),
          status: rand() < 0.88 ? 'ACTIVE' : 'PAUSED',
          campaign: { id: 'c_' + hashString(camp.name), name: camp.name, objective: 'OUTCOME_SALES' },
          adset: { id: 'as_' + hashString(camp.adset + camp.name), name: camp.adset },
          creative: {
            id: 'cr_' + id,
            type: template === 'carousel' ? 'carousel' : isVideo ? 'video' : 'image',
            aspect: ASPECTS[placement],
            assetKey: null,
            title: spec.headline,
            body: isVideo ? spec.caption : spec.headline.charAt(0) + spec.headline.slice(1).toLowerCase() + '.',
            paint: variantSpec,
            videoLength: isVideo ? 18 + Math.floor(rand() * 40) : null,
          },
          metrics: {
            spend,
            impressions,
            reach,
            clicks: Math.round(linkClicks * 1.6),
            linkClicks,
            purchases,
            purchaseValue,
            video3s,
            thruplays,
            p25: isVideo ? Math.round(video3s * (0.42 + quality * 0.2)) : 0,
            p50: isVideo ? Math.round(video3s * (0.25 + quality * 0.15)) : 0,
            p75: isVideo ? Math.round(video3s * (0.14 + quality * 0.1)) : 0,
            p95: isVideo ? Math.round(video3s * (0.08 + quality * 0.07)) : 0,
            p100: isVideo ? Math.round(video3s * (0.06 + quality * 0.05)) : 0,
          },
          segments,
          demo: { level, quality, retention: isVideo ? retentionCurve(rand, quality) : null },
        });
      }
    }
  }

  return {
    source: 'demo',
    account: DEMO_ACCOUNT,
    range,
    generatedAt: new Date().toISOString(),
    segmentsAvailable: true,
    ads,
  };
}

const PLACEMENTS = [
  ['instagram', 'instagram_reels', 0.27],
  ['facebook', 'feed', 0.22],
  ['instagram', 'feed', 0.18],
  ['instagram', 'instagram_stories', 0.13],
  ['facebook', 'facebook_reels', 0.08],
  ['audience_network', 'classic', 0.05],
  ['instagram', 'instagram_explore', 0.04],
  ['facebook', 'marketplace', 0.03],
];

/** Daily series, placements and retention for a set of demo ads, shaped like /api/detail. */
export function buildDemoDetail(ads, range) {
  const rand = rng(hashString(ads.map((a) => a.id).join(',')));
  const days = daysBetween(range.since, range.until);
  const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
  const value = ads.reduce((s, a) => s + a.metrics.purchaseValue, 0);
  const impressions = ads.reduce((s, a) => s + a.metrics.impressions, 0);

  const weights = Array.from({ length: days }, (_, i) => {
    const trend = 0.75 + (i / Math.max(1, days - 1)) * 0.5;
    const weekday = parseDayOfWeek(addDays(range.since, i));
    const weekend = weekday === 0 || weekday === 6 ? 1.12 : 1;
    return trend * weekend * (0.8 + rand() * 0.4);
  });
  const wsum = weights.reduce((a, b) => a + b, 0);
  const daily = weights.map((w, i) => {
    const s = (spend * w) / wsum;
    const r = (value / Math.max(1, spend)) * (0.65 + rand() * 0.7);
    return { date: addDays(range.since, i), spend: s, purchaseValue: s * r, impressions: Math.round((impressions * w) / wsum) };
  });

  const placementWeights = PLACEMENTS.map(([, , w]) => w * (0.6 + rand() * 0.8));
  const pw = placementWeights.reduce((a, b) => a + b, 0);
  const placements = PLACEMENTS.map(([platform, position], i) => {
    const s = (spend * placementWeights[i]) / pw;
    return { platform, position, spend: s, purchaseValue: s * (value / Math.max(1, spend)) * (0.6 + rand() * 0.8), impressions: Math.round((impressions * placementWeights[i]) / pw) };
  }).sort((a, b) => b.spend - a.spend);

  const videoAds = ads.filter((a) => a.demo?.retention);
  let video = null;
  if (videoAds.length) {
    const curve = videoAds[0].demo.retention;
    const m = videoAds.reduce(
      (acc, a) => {
        for (const k of ['impressions', 'video3s', 'thruplays', 'p25', 'p50', 'p75', 'p95', 'p100']) acc[k] += a.metrics[k] || 0;
        return acc;
      },
      { impressions: 0, video3s: 0, thruplays: 0, p25: 0, p50: 0, p75: 0, p95: 0, p100: 0 },
    );
    video = { curve, ...m, avgWatchSeconds: 4 + videoAds[0].demo.quality * 9, length: videoAds[0].creative.videoLength };
  }
  return { daily, placements, video, generatedAt: dayKey(new Date()) };
}

function parseDayOfWeek(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}
