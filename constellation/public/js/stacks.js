// Groups ads that show the same visual into one "stack".
//
// Meta's delivery system clusters near-identical creatives under one internal entity,
// so 30 crops of the same product shot compete as one ad. We approximate that cluster:
//   - ads sharing an asset (same image hash or video id) always stack;
//   - otherwise two creatives stack when their 256-bit difference hashes are within a
//     Hamming threshold and their 3x3 color grids are close.
// Pure module, no DOM: signatures are computed in the browser (see phash.js).

// Thresholds on a 256-bit hash and a 3x3 color grid (mean RGB distance per cell).
export const SENSITIVITY = {
  strict: { maxHamming: 26, maxColor: 24 },
  normal: { maxHamming: 40, maxColor: 32 },
  loose: { maxHamming: 56, maxColor: 44 },
};

function popcount32(n) {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Hamming distance between two hashes stored as arrays of uint32 words. */
export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += popcount32((a[i] ^ b[i]) >>> 0);
  return d;
}

/** Mean Euclidean RGB distance across the cells of two color grids (flat r,g,b lists). */
export function colorDistance(a, b) {
  const cells = Math.min(a.length, b.length) / 3;
  let sum = 0;
  for (let i = 0; i < cells; i++) {
    sum += Math.hypot(a[i * 3] - b[i * 3], a[i * 3 + 1] - b[i * 3 + 1], a[i * 3 + 2] - b[i * 3 + 2]);
  }
  return cells ? sum / cells : 0;
}

export function bitsToHex(bits) {
  return bits.map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

export function hexToBits(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 8) out.push(parseInt(hex.slice(i, i + 8), 16) >>> 0);
  return out;
}

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i) {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/** Sums raw counters across ads and derives the ratios Ads Manager shows. */
export function aggregateMetrics(ads) {
  const sum = (k) => ads.reduce((s, a) => s + (Number(a.metrics?.[k]) || 0), 0);
  const m = {
    spend: sum('spend'),
    impressions: sum('impressions'),
    reach: sum('reach'),
    clicks: sum('clicks'),
    linkClicks: sum('linkClicks'),
    purchases: sum('purchases'),
    purchaseValue: sum('purchaseValue'),
    video3s: sum('video3s'),
    thruplays: sum('thruplays'),
    p25: sum('p25'),
    p50: sum('p50'),
    p75: sum('p75'),
    p95: sum('p95'),
    p100: sum('p100'),
  };
  const div = (a, b) => (b > 0 ? a / b : null);
  m.roas = div(m.purchaseValue, m.spend);
  m.cpm = div(m.spend * 1000, m.impressions);
  // Reach summed across ads double counts people who saw several of them, so
  // stack-level frequency is a lower bound. Single ads are exact.
  m.cpmr = div(m.spend * 1000, m.reach);
  m.frequency = div(m.impressions, m.reach);
  m.ctr = div(m.linkClicks, m.impressions);
  m.cpa = div(m.spend, m.purchases);
  m.hookRate = div(m.video3s, m.impressions);
  m.holdRate = div(m.thruplays, m.video3s);
  return m;
}

export function sumSegments(ads) {
  let any = false;
  const out = { new: 0, engaged: 0, existing: 0 };
  for (const a of ads) {
    if (!a.segments) continue;
    any = true;
    out.new += a.segments.new || 0;
    out.engaged += a.segments.engaged || 0;
    out.existing += a.segments.existing || 0;
  }
  return any ? out : null;
}

/**
 * @param {Array<{id:string, creative:{assetKey?:string}, metrics:Object}>} ads
 * @param {Map<string,{bits:number[], grid:number[]}>} signatures by ad id
 * @param {{maxHamming:number, maxColor:number}} [sensitivity]
 * @returns {Array<{id:string, ads:Object[], rep:Object, count:number, metrics:Object, segments:Object|null}>}
 */
export function buildStacks(ads, signatures = new Map(), sensitivity = SENSITIVITY.normal) {
  const n = ads.length;
  const uf = new UnionFind(n);

  const byAsset = new Map();
  ads.forEach((ad, i) => {
    const key = ad.creative?.assetKey;
    if (!key) return;
    if (byAsset.has(key)) uf.union(byAsset.get(key), i);
    else byAsset.set(key, i);
  });

  const sigs = ads.map((ad) => signatures.get(ad.id) || null);
  for (let i = 0; i < n; i++) {
    const a = sigs[i];
    if (!a) continue;
    for (let j = i + 1; j < n; j++) {
      const b = sigs[j];
      if (!b) continue;
      if (hamming(a.bits, b.bits) > sensitivity.maxHamming) continue;
      if (colorDistance(a.grid, b.grid) > sensitivity.maxColor) continue;
      uf.union(i, j);
    }
  }

  const groups = new Map();
  ads.forEach((ad, i) => {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(ad);
  });

  const stacks = [];
  for (const members of groups.values()) {
    members.sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0));
    const rep = members[0];
    stacks.push({
      id: 'stack_' + rep.id,
      ads: members,
      rep,
      count: members.length,
      metrics: aggregateMetrics(members),
      segments: sumSegments(members),
    });
  }
  stacks.sort((a, b) => b.metrics.spend - a.metrics.spend);
  return stacks;
}
