// Creatives too alike to test against each other: the same creator, the same hook line,
// the same copy, near the same picture or the same concept. Two creatives overlap on a criterion when they
// share it; a group is every creative tied to another by all the chosen criteria at once.
// Pure module, no DOM.

import { hamming, colorDistance } from './stacks.js';
import { words } from './similarity.js';

export const OVERLAP_CRITERIA = ['creator', 'hook', 'copy', 'visual', 'concept'];

// The picture: looser than a stack (40 bits, 32 colour), which already merged near-copies.
const VISUAL_BITS = 72;
const VISUAL_COLOR = 48;
// The hook line and the copy: share of words in common.
const HOOK_SHARE = 0.6;
const COPY_SHARE = 0.7;
const COPY_MIN_WORDS = 8;

const norm = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%$€ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The line a creative opens with: a shipped hook line, the headline, or the copy's first line. */
export function hookLine(ad) {
  const c = ad?.creative || {};
  const first = String(c.body || '').split(/\n|(?<=[.!?])\s/)[0];
  return c.hookLine || c.title || first || ad?.name || '';
}

function share(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** What each creative is compared on. */
export function overlapFeatures(stacks, signatures = new Map()) {
  return stacks.map((s) => {
    const rep = s.rep || {};
    const hook = norm(hookLine(rep));
    return {
      creator: s.tags?.creator ? String(s.tags.creator).toLowerCase().trim() : null,
      concept: s.tags?.concept && s.tags.concept !== 'other' ? s.tags.concept : null,
      hook,
      hookWords: new Set(hook.split(' ').filter((w) => w.length > 1)),
      copy: words(rep.creative?.body || ''),
      sig: signatures.get(rep.id) || s.ads?.map((a) => signatures.get(a.id)).find(Boolean) || null,
    };
  });
}

/** The criteria two creatives share. */
export function sharedCriteria(a, b) {
  const out = [];
  if (a.creator && a.creator === b.creator) out.push('creator');
  if (a.hook && (a.hook === b.hook || (a.hookWords.size >= 2 && b.hookWords.size >= 2 && share(a.hookWords, b.hookWords) >= HOOK_SHARE))) out.push('hook');
  if (a.copy.size >= COPY_MIN_WORDS && b.copy.size >= COPY_MIN_WORDS && share(a.copy, b.copy) >= COPY_SHARE) out.push('copy');
  if (a.sig && b.sig && hamming(a.sig.bits, b.sig.bits) <= VISUAL_BITS && colorDistance(a.sig.grid, b.sig.grid) <= VISUAL_COLOR) out.push('visual');
  if (a.concept && a.concept === b.concept) out.push('concept');
  return out;
}

/**
 * Pairs that share something, and the groups tied by every chosen criterion.
 * @param {Array} stacks model stacks
 * @param {Map} signatures by ad id
 * @param {string[]} criteria a subset of OVERLAP_CRITERIA
 * @returns {{groups:Array<{stacks:Array, shared:string[], spend:number, pairs:Array<[string, string]>}>, byStack:Map<string, Array<{stack, shared:string[]}>>, counts:Object}}
 */
export function overlap(stacks, signatures, criteria = ['hook', 'copy']) {
  const feats = overlapFeatures(stacks, signatures);
  const n = stacks.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byStack = new Map(stacks.map((s) => [s.id, []]));
  const counts = Object.fromEntries(OVERLAP_CRITERIA.map((c) => [c, 0]));
  const chosen = criteria.filter((c) => OVERLAP_CRITERIA.includes(c));
  const tied = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const shared = sharedCriteria(feats[i], feats[j]);
      if (!shared.length) continue;
      for (const c of shared) counts[c]++;
      byStack.get(stacks[i].id).push({ stack: stacks[j], shared });
      byStack.get(stacks[j].id).push({ stack: stacks[i], shared });
      // Only the ties that join two groups are kept as lines: a tree per group, not every pair.
      if (chosen.length && chosen.every((c) => shared.includes(c)) && find(i) !== find(j)) {
        parent[find(i)] = find(j);
        tied.push([i, j]);
      }
    }
  }
  for (const list of byStack.values()) list.sort((a, b) => b.shared.length - a.shared.length || b.stack.metrics.spend - a.stack.metrics.spend);
  const sets = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!sets.has(r)) sets.set(r, []);
    sets.get(r).push(stacks[i]);
  }
  const groups = [...sets.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([root, g]) => ({
      stacks: g.sort((a, b) => b.metrics.spend - a.metrics.spend),
      shared: chosen,
      spend: g.reduce((t, s) => t + s.metrics.spend, 0),
      pairs: tied.filter(([i]) => find(i) === root).map(([i, j]) => [stacks[i].id, stacks[j].id]),
    }))
    .sort((a, b) => b.spend - a.spend);
  return { groups, byStack, counts };
}
