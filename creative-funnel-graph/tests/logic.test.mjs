import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAdNames, parseTemplate, normalizeText } from '../public/js/naming.js';
import { classifyFunnel, funnelContext, normalizeSegmentKey, levelFromNames } from '../public/js/funnel.js';
import { buildStacks, hamming, aggregateMetrics, bitsToHex, hexToBits } from '../public/js/stacks.js';
import { computeLayout, meridianProfile } from '../public/js/layout.js';
import { buildModel, groupStacks, placementHints } from '../public/js/model.js';

test('normalizeText splits camelCase and separators', () => {
  assert.equal(normalizeText('PainPoint_BusyMom'), 'pain point busy mom');
  assert.equal(normalizeText('UGC-Review.v2'), 'ugc review v2');
});

test('parses an underscore convention with dictionary hits, handle and hook code', () => {
  const [r] = parseAdNames([{ name: '2025-09_UGC_PainPoint_BusyMom_@sarahglow_H3' }]);
  assert.equal(r.format, 'UGC');
  assert.equal(r.angle, 'Pain point');
  assert.equal(r.persona, 'Busy moms');
  assert.equal(r.creator, '@sarahglow');
  assert.equal(r.hook, 'Hook 3');
});

test('parses explicit key:value pairs, including several in one segment', () => {
  const [a, b] = parseAdNames([{ name: 'angle:Offer fmt=static P:40+' }, { name: 'Creator: Sarah K | Hook: Question opener' }]);
  assert.equal(a.angle, 'Offer');
  assert.equal(a.format, 'Static');
  assert.equal(a.persona, '40+');
  assert.equal(b.creator, 'Sarah K');
  assert.equal(b.hook, 'Question opener');
});

test('handles accented Italian words with unicode-aware boundaries', () => {
  const [r] = parseAdNames([{ name: 'Statico | Prima e dopo | Papà' }]);
  assert.equal(r.format, 'Static');
  assert.equal(r.angle, 'Transformation');
  assert.equal(r.persona, 'Men');
});

test('infers positions from repeated name shapes and reads unknown values there', () => {
  const names = [
    'Serum_UGC_PainPoint_Moms_Lena',
    'Serum_Static_Offer_Moms_Kai',
    'Cream_UGC_SocialProof_Men_Lena',
    'Cream_Video_Benefit_GenZ_Rae',
    'Serum_UGC_Glowup_Moms_Lena',
  ].map((name) => ({ name }));
  const parsed = parseAdNames(names);
  // "Glowup" is not in the dictionary but sits in the angle position.
  assert.equal(parsed[4].angle, 'Glowup');
  assert.equal(parsed[4].source.angle, 'position');
  assert.equal(parsed[1].angle, 'Offer');
  assert.equal(parsed[3].persona, 'Gen Z');
});

test('a naming template reads creators and hooks by position', () => {
  const tpl = parseTemplate('{date}_{format}_{angle}_{creator}_{hook}');
  assert.deepEqual(tpl.positions, { format: 1, angle: 2, creator: 3, hook: 4 });
  const [r] = parseAdNames([{ name: '0921_Video_Comparison_Marco_H2' }], { template: '{date}_{format}_{angle}_{creator}_{hook}' });
  assert.equal(r.creator, 'Marco');
  assert.equal(r.hook, 'Hook 2');
  assert.equal(r.source.creator, 'template');
  // Month-like words are dates only when they are the whole token.
  const [m] = parseAdNames([{ name: 'Sep25_Static_Offer_Marco_H1' }], { template: '{date}_{format}_{angle}_{creator}_{hook}' });
  assert.equal(m.creator, 'Marco');
});

test('falls back to creative type for format and to copy for hook', () => {
  const [r] = parseAdNames([{ name: 'Ad 12', creativeType: 'video', body: 'Stop scrolling if your skin feels tight. Here is why.' }]);
  assert.equal(r.format, 'Video');
  assert.equal(r.hook, 'Stop scrolling if your skin feels tight.');
  assert.equal(r.source.hook, 'copy');
});

test('normalizeSegmentKey accepts the usual spellings', () => {
  assert.equal(normalizeSegmentKey('prospecting'), 'new');
  assert.equal(normalizeSegmentKey('New audience'), 'new');
  assert.equal(normalizeSegmentKey('engaged_audience'), 'engaged');
  assert.equal(normalizeSegmentKey('existing_customers'), 'existing');
  assert.equal(normalizeSegmentKey(''), null);
  assert.equal(normalizeSegmentKey('unknown'), null);
});

test('funnel: dominant segment decides, frequency splits engaged spend', () => {
  const ctx = funnelContext(
    [1.2, 1.4, 1.5, 1.8, 2.2, 3.1, 3.6].map((f) => ({ spend: 100, frequency: f, cpmr: 20 })),
    { minSaturationFrequency: 2 },
  );
  assert.ok(ctx.satFreq >= 2);
  const top = classifyFunnel({ spend: 100, frequency: 1.3, cpmr: 18, segments: { new: 80, engaged: 15, existing: 5 } }, ctx);
  assert.equal(top.level, 'top');
  assert.equal(top.method, 'segments');
  const warming = classifyFunnel({ spend: 100, frequency: 1.6, cpmr: 30, segments: { new: 20, engaged: 70, existing: 10 } }, ctx);
  assert.equal(warming.level, 'middle');
  const saturated = classifyFunnel({ spend: 100, frequency: 4.2, cpmr: 45, segments: { new: 10, engaged: 80, existing: 10 } }, ctx);
  assert.equal(saturated.level, 'bottom');
  const existing = classifyFunnel({ spend: 100, frequency: 2, cpmr: 50, segments: { new: 10, engaged: 30, existing: 60 } }, ctx);
  assert.equal(existing.level, 'reactivation');
});

test('funnel: without segments, names then delivery decide', () => {
  const ctx = funnelContext([1, 1.2, 1.3, 1.5, 2].map((f) => ({ spend: 50, frequency: f, cpmr: 10 })));
  assert.equal(classifyFunnel({ spend: 50, frequency: 1.1, cpmr: 9, names: ['RT | Cart 7d'] }, ctx).level, 'bottom');
  assert.equal(classifyFunnel({ spend: 50, frequency: 1.1, cpmr: 9, names: ['Winback existing customers'] }, ctx).method, 'names');
  assert.equal(levelFromNames(['LAL 1% customers']), 'top');
  const hot = classifyFunnel({ spend: 50, frequency: 3.4, cpmr: 30, names: ['Sales 2025'] }, ctx);
  assert.equal(hot.method, 'delivery');
  assert.equal(hot.level, 'bottom');
  assert.equal(classifyFunnel({ spend: 50, frequency: 1.05, cpmr: 9, names: [] }, ctx).level, 'top');
});

test('stacks: shared assets and close hashes collapse into one card', () => {
  const ad = (id, spend, assetKey) => ({ id, creative: { assetKey }, metrics: { spend, impressions: spend * 50, reach: spend * 30, purchaseValue: spend * 2 } });
  const ads = [ad('a', 100, 'img1'), ad('b', 50, 'img1'), ad('c', 80, null), ad('d', 20, null), ad('e', 10, null)];
  const grid = Array.from({ length: 9 }, () => [200, 100, 50]).flat();
  const base = [0xffff0000, 0x0000ffff, 0x12345678, 0x9abcdef0, 0, 0, 0xffffffff, 0x0f0f0f0f];
  const near = [...base];
  near[0] = 0xffff0003; // 2 bits apart
  const far = base.map((w) => ~w >>> 0);
  const sigs = new Map([
    ['c', { bits: base, grid }],
    ['d', { bits: near, grid }],
    ['e', { bits: far, grid }],
  ]);
  assert.equal(hamming(base, near), 2);
  assert.equal(hamming(base, far), 256);
  assert.deepEqual(hexToBits(bitsToHex(base)), base);
  const stacks = buildStacks(ads, sigs);
  assert.equal(stacks.length, 3);
  assert.equal(stacks[0].count, 2);
  assert.equal(stacks[0].rep.id, 'a');
  assert.equal(stacks[0].metrics.spend, 150);
  assert.equal(stacks[0].metrics.roas, 2);
  const cd = stacks.find((s) => s.ads.some((x) => x.id === 'c'));
  assert.equal(cd.count, 2);
});

test('aggregateMetrics derives ratios and tolerates zero denominators', () => {
  const m = aggregateMetrics([{ metrics: { spend: 0, impressions: 0 } }]);
  assert.equal(m.roas, null);
  assert.equal(m.cpm, null);
});

function fakeSnapshot() {
  const ads = [];
  const levels = [
    ['top', { new: 90, engaged: 8, existing: 2 }, 1.2],
    ['middle', { new: 20, engaged: 75, existing: 5 }, 1.5],
    ['bottom', { new: 10, engaged: 85, existing: 5 }, 4.5],
    ['reactivation', { new: 5, engaged: 15, existing: 80 }, 2.4],
  ];
  let i = 0;
  for (const [level, seg, freq] of levels) {
    for (let k = 0; k < 6; k++) {
      const spend = 100 + k * 10;
      ads.push({
        id: `${level}${k}`,
        name: `${level}_UGC_PainPoint_Moms_@c${k % 2}_H${k}`,
        status: 'ACTIVE',
        campaign: { name: 'ASC ' + level },
        adset: { name: 'Adset ' + level },
        creative: { type: 'video', assetKey: 'asset' + i++, aspect: 0.8 },
        metrics: { spend, impressions: spend * 100 * freq, reach: spend * 100, purchaseValue: spend * 2 },
        segments: Object.fromEntries(Object.entries(seg).map(([k2, v]) => [k2, (v / 100) * spend])),
      });
    }
  }
  return { account: { id: 'act_1', name: 'Test', currency: 'USD' }, range: { since: '2026-09-22', until: '2026-10-05' }, ads };
}

test('model groups stacks by funnel level and by name-derived dimensions', () => {
  const model = buildModel(fakeSnapshot());
  assert.equal(model.stacks.length, 24);
  const funnel = groupStacks(model, 'funnel');
  assert.deepEqual(funnel.map((g) => g.key), ['top', 'middle', 'bottom', 'reactivation']);
  assert.deepEqual(funnel.map((g) => g.count), [6, 6, 6, 6]);
  assert.ok(model.segmentsAvailable);
  const creators = groupStacks(model, 'creator');
  assert.deepEqual(creators.map((g) => g.label).sort(), ['@c0', '@c1']);
  const hooks = groupStacks(model, 'hook');
  assert.equal(hooks.length, 6);
});

test('layout keeps cards inside their bands and narrows the funnel downward', () => {
  const model = buildModel(fakeSnapshot());
  const groups = groupStacks(model, 'funnel');
  const layout = computeLayout(groups, { mode: 'funnel', placement: placementHints(groups, 'funnel') });
  assert.equal(layout.cards.length, 24);
  for (const c of layout.cards) {
    assert.ok(c.y >= c.band[0] - 1e-9 && c.y <= c.band[1] + 1e-9, 'card inside band');
    assert.ok(Math.hypot(c.x, c.z) <= c.maxRadius + 1e-9, 'card inside radius');
  }
  const radii = layout.rings.map((r) => r.r);
  assert.deepEqual([...radii].sort((a, b) => b - a), radii);
  const profile = meridianProfile(layout.rings);
  assert.equal(profile.at(-1).r, 0);
  // Deterministic: same input, same positions.
  const again = computeLayout(groups, { mode: 'funnel', placement: placementHints(groups, 'funnel') });
  assert.deepEqual(again.cards.map((c) => [c.x, c.y, c.z]), layout.cards.map((c) => [c.x, c.y, c.z]));
});
