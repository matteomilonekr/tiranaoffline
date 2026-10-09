// Builds the view model from a snapshot (live Meta data or the demo brand):
// tags each ad from its name, stacks look-alike visuals, places every stack in the
// funnel and groups stacks for the current arrangement. Pure module, no DOM.

import { parseAdNames, DIMENSIONS } from './naming.js';
import { buildStacks, aggregateMetrics, SENSITIVITY } from './stacks.js';
import { FUNNEL_LEVELS, funnelContext, classifyFunnel } from './funnel.js';
import { daysBetween } from './format.js';

export const ARRANGEMENTS = ['funnel', 'format', 'angle', 'persona', 'creator', 'hook', 'campaign', 'matrix'];

// Reference categorical palette, dark steps, fixed order (validated for CVD separation).
export const GROUP_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const MUTED_COLOR = '#77756f';
const MAX_GROUPS = 7;

export const DEFAULT_SETTINGS = {
  sensitivity: 'normal',
  namingTemplate: '',
  saturationQuantile: 0.7,
  minSaturationFrequency: 2,
  segmentCoverage: 0.5,
  onlyActive: false,
  maxCards: 320,
};

function majorityTags(ads) {
  const out = {};
  for (const dim of DIMENSIONS) {
    const weights = new Map();
    for (const ad of ads) {
      const v = ad.tags?.[dim];
      if (!v) continue;
      weights.set(v, (weights.get(v) || 0) + (ad.metrics?.spend || 0) + 1e-6);
    }
    let best = null;
    let bestW = -1;
    for (const [v, w] of weights) {
      if (w > bestW) {
        best = v;
        bestW = w;
      }
    }
    out[dim] = best;
  }
  return out;
}

/**
 * @param {{ads:Array, account:Object, range:Object}} snapshot
 * @param {{signatures?:Map, settings?:Object}} options
 */
export function buildModel(snapshot, options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(options.settings || {}) };
  const signatures = options.signatures || new Map();

  let ads = (snapshot.ads || []).filter((a) => (a.metrics?.spend || 0) > 0);
  if (settings.onlyActive) ads = ads.filter((a) => !a.status || a.status === 'ACTIVE');
  ads = ads.map((a) => ({ ...a }));

  const tags = parseAdNames(
    ads.map((a) => ({ name: a.name, creativeType: a.creative?.type, body: a.creative?.body })),
    { template: settings.namingTemplate },
  );
  ads.forEach((a, i) => {
    a.tags = tags[i];
  });

  const stacks = buildStacks(ads, signatures, SENSITIVITY[settings.sensitivity] || SENSITIVITY.normal);
  for (const s of stacks) {
    s.tags = majorityTags(s.ads);
    s.campaigns = [...new Set(s.ads.map((a) => a.campaign?.name).filter(Boolean))];
    s.adsets = [...new Set(s.ads.map((a) => a.adset?.name).filter(Boolean))];
  }

  const units = stacks.map((s) => ({
    spend: s.metrics.spend,
    frequency: s.metrics.frequency || 0,
    cpmr: s.metrics.cpmr || 0,
    segments: s.segments,
    names: [...s.campaigns, ...s.adsets],
  }));
  const windowDays = snapshot.range ? daysBetween(snapshot.range.since, snapshot.range.until) : 14;
  const ctx = funnelContext(units, { ...settings, windowDays });
  stacks.forEach((s, i) => {
    s.funnel = classifyFunnel(units[i], ctx);
  });

  return {
    snapshot,
    account: snapshot.account,
    range: snapshot.range,
    settings,
    ads,
    stacks,
    ctx,
    totals: aggregateMetrics(ads),
    segmentsAvailable: stacks.some((s) => s.funnel.method === 'segments'),
  };
}

function summarize(group) {
  const ads = group.stacks.flatMap((s) => s.ads);
  const m = aggregateMetrics(ads);
  return {
    ...group,
    count: group.stacks.length,
    adCount: ads.length,
    spend: m.spend,
    roas: m.roas,
    metrics: m,
    estimated: group.stacks.filter((s) => s.funnel?.method !== 'segments').length,
  };
}

function valueFor(stack, arrangement) {
  if (arrangement === 'campaign') return stack.campaigns[0] || null;
  return stack.tags?.[arrangement] || null;
}

/**
 * Groups stacks for an arrangement. Funnel mode always returns the four levels in
 * order; other modes return up to seven values by spend, then "Unlabeled" and "Other".
 * @returns {Array<{key, label, labelKey, color, stacks, count, adCount, spend, roas, estimated}>}
 */
export function groupStacks(model, arrangement = 'funnel') {
  if (arrangement === 'funnel') {
    return FUNNEL_LEVELS.map((lvl) =>
      summarize({
        key: lvl.key,
        label: null,
        labelKey: 'level.' + lvl.key,
        sublabelKey: 'level.' + lvl.key + '.sub',
        color: lvl.color,
        stacks: model.stacks.filter((s) => s.funnel.level === lvl.key),
      }),
    );
  }

  const byValue = new Map();
  const unlabeled = [];
  for (const s of model.stacks) {
    const v = valueFor(s, arrangement);
    if (!v) {
      unlabeled.push(s);
      continue;
    }
    if (!byValue.has(v)) byValue.set(v, []);
    byValue.get(v).push(s);
  }
  const ranked = [...byValue.entries()]
    .map(([value, stacks]) => ({ value, stacks, spend: stacks.reduce((t, s) => t + s.metrics.spend, 0) }))
    .sort((a, b) => b.spend - a.spend || b.stacks.length - a.stacks.length);

  const keep = ranked.slice(0, MAX_GROUPS);
  const rest = ranked.slice(MAX_GROUPS);
  const groups = keep.map((g, i) =>
    summarize({ key: 'v:' + g.value, label: g.value, labelKey: null, color: GROUP_COLORS[i], stacks: g.stacks }),
  );
  if (rest.length) {
    groups.push(
      summarize({
        key: '__other',
        label: null,
        labelKey: 'group.other',
        labelVars: { n: rest.length },
        color: MUTED_COLOR,
        stacks: rest.flatMap((g) => g.stacks),
      }),
    );
  }
  if (unlabeled.length) {
    groups.push(
      summarize({ key: '__none', label: null, labelKey: 'group.unlabeled', color: '#55534e', stacks: unlabeled }),
    );
  }
  return groups;
}

/** Depth hints for the layout: funnel depth in funnel mode, a spend rank otherwise. */
export function placementHints(groups, arrangement) {
  const map = new Map();
  for (const g of groups) {
    const sorted = [...g.stacks].sort((a, b) => b.metrics.spend - a.metrics.spend);
    sorted.forEach((s, i) => {
      const depth = arrangement === 'funnel' ? s.funnel.depth : sorted.length > 1 ? i / (sorted.length - 1) : 0.5;
      map.set(s.id, { depth });
    });
  }
  return map;
}
