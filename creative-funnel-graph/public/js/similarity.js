// Creative similarity: how alike two creatives are, and a 3D map where alike creatives sit
// close and different ones far apart, grouped into families. Two kinds of likeness, mixed
// by the mode the user picks:
//   - visual: the same 256-bit difference hash and 3x3 colour grid that stack look-alikes
//     (layout, shapes, palette), ranked so it mixes evenly with the other;
//   - message: the tags (angle, format, hook, persona) and the words of the copy.
// Pure module, no DOM: the scene draws the map.

import { hamming, colorDistance } from './stacks.js';

export const SIM_MODES = ['all', 'visual', 'message', 'concept'];
const MIX = { all: { visual: 0.5, message: 0.5 }, visual: { visual: 1, message: 0 }, message: { visual: 0, message: 1 } };
const TAG_WEIGHTS = { angle: 0.4, format: 0.25, hook: 0.2, persona: 0.15 };
const STOP = new Set(
  'the and for you your with that this are was from have has our not but all can get just more now one out who how its it’s it\'s what when will off any day days per con per che non una uno gli del della dei delle nel nella sono come più anche alla alle dal dalla tra fra'.split(
    ' ',
  ),
);

/** The copy's words: lower case, three letters or more, no stop words. */
export function words(text) {
  const out = new Set();
  for (const w of String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Replaces values by their rank among the others, 0 to 1 (ties share one). */
function rankNormalize(values) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => v !== null).sort((a, b) => a[0] - b[0]);
  const out = values.map(() => null);
  const n = idx.length;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const r = n > 1 ? (i + j) / 2 / (n - 1) : 0;
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

/**
 * What each creative is compared on.
 * @param {Array} stacks model stacks
 * @param {Map<string,{bits:number[], grid:number[]}>} signatures by ad id
 */
export function features(stacks, signatures = new Map()) {
  return stacks.map((s) => {
    const rep = s.rep || {};
    const sig = signatures.get(rep.id) || s.ads?.map((a) => signatures.get(a.id)).find(Boolean) || null;
    const c = rep.creative || {};
    return { sig, tags: s.tags || {}, words: words([c.title, c.body, rep.name].filter(Boolean).join(' ')) };
  });
}

/** Pairwise distances, 0 (alike) to 1 (unlike), as an n × n Float64Array. */
export function distanceMatrix(feats, mode = 'all') {
  const n = feats.length;
  const mix = MIX[mode] || MIX.all;
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  const visualRaw = pairs.map(([i, j]) => {
    const a = feats[i].sig;
    const b = feats[j].sig;
    if (!a || !b) return null;
    return 0.75 * (hamming(a.bits, b.bits) / 256) + 0.25 * Math.min(1, colorDistance(a.grid, b.grid) / 160);
  });
  const visual = rankNormalize(visualRaw);
  const copy = rankNormalize(pairs.map(([i, j]) => 1 - jaccard(feats[i].words, feats[j].words)));
  const D = new Float64Array(n * n);
  pairs.forEach(([i, j], p) => {
    let tag = 0;
    for (const [dim, w] of Object.entries(TAG_WEIGHTS)) {
      const a = feats[i].tags[dim];
      const b = feats[j].tags[dim];
      tag += w * (!a || !b ? 0.5 : a === b ? 0 : 1);
    }
    const message = 0.7 * tag + 0.3 * copy[p];
    const v = visual[p];
    let d;
    // By concept: the same idea (a before/after, a comparison…) first, the message inside it.
    if (mode === 'concept') {
      const a = feats[i].tags.concept;
      const b = feats[j].tags.concept;
      d = 0.8 * (!a || !b ? 0.5 : a === b ? 0 : 1) + 0.2 * message;
    } else if (v === null) d = message;
    else d = (mix.visual * v + mix.message * message) / (mix.visual + mix.message);
    D[i * n + j] = D[j * n + i] = d;
  });
  return D;
}

/** Classical MDS to three dimensions: positions whose distances follow D as closely as a flat embedding can. */
export function mds3(D, n, seed = 7) {
  // B = -1/2 J D² J
  const B = new Float64Array(n * n);
  const rowMean = new Float64Array(n);
  let all = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += D[i * n + j] ** 2;
    rowMean[i] = s / n;
    all += s;
  }
  all /= n * n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i * n + j] = -0.5 * (D[i * n + j] ** 2 - rowMean[i] - rowMean[j] + all);
  let rnd = seed;
  const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647) - 0.5;
  const out = new Float64Array(n * 3);
  const vecs = [];
  for (let k = 0; k < 3; k++) {
    let v = Float64Array.from({ length: n }, random);
    let lambda = 0;
    for (let it = 0; it < 120; it++) {
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += B[i * n + j] * v[j];
        w[i] = s;
      }
      // Deflate the axes already found.
      for (const u of vecs) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += w[i] * u[i];
        for (let i = 0; i < n; i++) w[i] -= dot * u[i];
      }
      const norm = Math.hypot(...w) || 1;
      lambda = norm;
      v = w.map((x) => x / norm);
    }
    vecs.push(v);
    const scale = Math.sqrt(Math.max(0, lambda));
    for (let i = 0; i < n; i++) out[i * 3 + k] = v[i] * scale;
  }
  return out;
}

/**
 * Moves the MDS positions so near neighbours keep their distances best (a Sammon-like
 * stress, neighbours weighted most): families tighten, unrelated creatives drift apart.
 */
export function refine(P, D, n, iterations = 80) {
  const step = 0.08;
  for (let it = 0; it < iterations; it++) {
    const grad = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const target = D[i * n + j];
        const dx = P[i * 3] - P[j * 3];
        const dy = P[i * 3 + 1] - P[j * 3 + 1];
        const dz = P[i * 3 + 2] - P[j * 3 + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const w = 1 / (target * target + 0.02);
        const f = (w * (d - target)) / d;
        grad[i * 3] += f * dx;
        grad[i * 3 + 1] += f * dy;
        grad[i * 3 + 2] += f * dz;
        grad[j * 3] -= f * dx;
        grad[j * 3 + 1] -= f * dy;
        grad[j * 3 + 2] -= f * dz;
      }
    }
    const k = step / n;
    for (let i = 0; i < n * 3; i++) P[i] -= k * grad[i];
  }
  return P;
}

/**
 * Families as the map shows them: k-means on the 3D positions (seeded, best of a few
 * starts), so a family is a cloud you can see; families of one or two join their nearest.
 */
export function families(P, n, k, seed = 11) {
  let rnd = seed;
  const random = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const d2 = (i, c) => (P[i * 3] - c[0]) ** 2 + (P[i * 3 + 1] - c[1]) ** 2 + (P[i * 3 + 2] - c[2]) ** 2;
  let best = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    // k-means++ start.
    const first = Math.floor(random() * n);
    const centers = [[P[first * 3], P[first * 3 + 1], P[first * 3 + 2]]];
    while (centers.length < k) {
      const dist = Array.from({ length: n }, (_, i) => Math.min(...centers.map((c) => d2(i, c))));
      const total = dist.reduce((a, b) => a + b, 0);
      let r = random() * total;
      let pick = 0;
      for (; pick < n - 1; pick++) if ((r -= dist[pick]) <= 0) break;
      centers.push([P[pick * 3], P[pick * 3 + 1], P[pick * 3 + 2]]);
    }
    const label = new Int32Array(n);
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        let bi = 0;
        let bd = Infinity;
        centers.forEach((c, ci) => {
          const d = d2(i, c);
          if (d < bd) [bd, bi] = [d, ci];
        });
        if (label[i] !== bi) [label[i], moved] = [bi, true];
      }
      centers.forEach((c, ci) => {
        const m = [0, 0, 0];
        let cnt = 0;
        for (let i = 0; i < n; i++) if (label[i] === ci) [m[0], m[1], m[2], cnt] = [m[0] + P[i * 3], m[1] + P[i * 3 + 1], m[2] + P[i * 3 + 2], cnt + 1];
        if (cnt) centers[ci] = m.map((v) => v / cnt);
      });
      if (!moved && it > 0) break;
    }
    let inertia = 0;
    for (let i = 0; i < n; i++) inertia += d2(i, centers[label[i]]);
    if (!best || inertia < best.inertia) best = { label, centers, inertia };
  }
  // Fold families too small to read into their nearest one, then number them 0..count-1.
  const min = n >= 30 ? 3 : 1;
  const label = best.label;
  for (;;) {
    const sizes = new Map();
    for (const l of label) sizes.set(l, (sizes.get(l) || 0) + 1);
    const small = [...sizes].find(([, c]) => c < min);
    if (!small || sizes.size < 2) break;
    const others = [...sizes.keys()].filter((l) => l !== small[0]);
    const target = others.reduce((a, b) => (d2Centers(best.centers[small[0]], best.centers[a]) <= d2Centers(best.centers[small[0]], best.centers[b]) ? a : b));
    for (let i = 0; i < n; i++) if (label[i] === small[0]) label[i] = target;
  }
  const ids = [...new Set(label)];
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = ids.indexOf(label[i]);
  return { label: out, count: ids.length };
}

function d2Centers(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * A family's name from what most of its spend shares: its angle (or its two main angles),
 * and its format when that holds for most of it too.
 */
export function familyName(stacks, mixed = 'Mix') {
  const angles = ranked(stacks, 'angle');
  const format = ranked(stacks, 'format')[0];
  let name = mixed;
  if (angles[0] && angles[0].share >= 0.45) name = angles[0].value;
  else if (angles[0] && angles[1] && angles[0].share + angles[1].share >= 0.5) name = `${angles[0].value} / ${angles[1].value}`;
  return format && format.share >= 0.5 ? `${name} · ${format.value}` : name;
}

function ranked(stacks, dim) {
  const w = new Map();
  let total = 0;
  for (const s of stacks) {
    const sp = s.metrics.spend + 1e-6;
    total += sp;
    const v = s.tags?.[dim];
    if (v) w.set(v, (w.get(v) || 0) + sp);
  }
  return [...w].map(([value, x]) => ({ value, share: total ? x / total : 0 })).sort((a, b) => b.share - a.share);
}

/**
 * Pushes cards apart until none overlaps another (`size` is each card's half extent),
 * moving each as little as it can so neighbours stay neighbours.
 */
export function separate(P, size, iterations = 50) {
  const n = size.length;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = P[j * 3] - P[i * 3];
        const dy = P[j * 3 + 1] - P[i * 3 + 1];
        const dz = P[j * 3 + 2] - P[i * 3 + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const min = (size[i] + size[j]) * 0.9;
        if (d >= min) continue;
        moved = true;
        const push = (min - d) / 2 / d;
        P[i * 3] -= dx * push;
        P[i * 3 + 1] -= dy * push;
        P[i * 3 + 2] -= dz * push;
        P[j * 3] += dx * push;
        P[j * 3 + 1] += dy * push;
        P[j * 3 + 2] += dz * push;
      }
    }
    if (!moved) break;
  }
  return P;
}

/**
 * The similarity map: a 3D position per stack (radius about `radius`), families of alike
 * creatives (the clouds the map shows), each stack's nearest neighbours, and the links drawn between them.
 * @returns {{positions:Float64Array, family:Int32Array, families:number, neighbors:Array<Array<{index:number, sim:number}>>, links:Array<[number, number, number]>, D:Float64Array}}
 */
export function similarityMap(stacks, signatures, { mode = 'all', radius = 7 } = {}) {
  const n = stacks.length;
  if (!n) return { positions: new Float64Array(0), family: new Int32Array(0), families: 0, neighbors: [], links: [], D: new Float64Array(0) };
  const D = distanceMatrix(features(stacks, signatures), mode);
  const P = n > 3 ? refine(mds3(D, n), D, n) : new Float64Array(n * 3).map((_, i) => (i % 3 === 0 ? i : 0));
  const k = Math.max(2, Math.min(8, Math.round(Math.sqrt(n / 2.2))));
  const { label, count, concepts } = mode === 'concept' ? conceptFamilies(stacks) : { ...families(P, n, Math.min(k, n)), concepts: null };
  // Each family drawn tighter around its centre, and the centres further apart: alike
  // creatives close, families apart, the order inside a family kept.
  const centers = Array.from({ length: count }, () => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const c = centers[label[i]];
    for (let a = 0; a < 3; a++) c[a] += P[i * 3 + a];
    c[3]++;
  }
  for (const c of centers) for (let a = 0; a < 3; a++) c[a] /= c[3] || 1;
  // By concept the families are set apart further: each is one idea, not a gradient.
  const [apart, tight] = mode === 'concept' ? [2.3, 0.45] : [1.6, 0.6];
  for (let i = 0; i < n; i++) {
    const c = centers[label[i]];
    for (let a = 0; a < 3; a++) P[i * 3 + a] = c[a] * apart + (P[i * 3 + a] - c[a]) * tight;
  }
  // Centre and scale to the radius the scene expects.
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k] / n;
  let r = 0;
  for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]));
  const s = r > 0 ? radius / r : 1;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) P[i * 3 + k] = (P[i * 3 + k] - c[k]) * s;

  const neighbors = [];
  const links = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const near = [];
    for (let j = 0; j < n; j++) if (j !== i) near.push({ index: j, sim: 1 - D[i * n + j] });
    near.sort((a, b) => b.sim - a.sim);
    neighbors.push(near.slice(0, 5));
    for (const nb of near.slice(0, 2)) {
      const key = i < nb.index ? `${i}-${nb.index}` : `${nb.index}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push([i, nb.index, nb.sim]);
    }
  }
  return { positions: P, family: label, families: count, familyConcept: concepts, neighbors, links, D };
}

/** By concept, a family is a concept: the seven with most creatives, then the rest together (null). */
function conceptFamilies(stacks) {
  const count = new Map();
  for (const s of stacks) count.set(s.tags?.concept || 'other', (count.get(s.tags?.concept || 'other') || 0) + 1);
  const ranked = [...count].sort((a, b) => (a[0] === 'other') - (b[0] === 'other') || b[1] - a[1]).map(([c]) => c);
  const own = ranked.length > 8 ? ranked.slice(0, 7) : ranked;
  const concepts = ranked.length > 8 ? [...own, null] : own;
  const label = Int32Array.from(stacks, (s) => {
    const f = own.indexOf(s.tags?.concept || 'other');
    return f >= 0 ? f : own.length;
  });
  return { label, count: concepts.length, concepts };
}
