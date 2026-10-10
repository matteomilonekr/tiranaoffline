import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUADRANTS,
  niceNumber,
  roundSpend,
  parseAmount,
  matrixDefaults,
  validThresholds,
  quadrantOf,
  summarizeQuadrants,
  matrixScales,
} from '../public/js/matrix.js';
import { aggregateMetrics } from '../public/js/stacks.js';

const stack = (id, spend, roas, count = 1) => ({
  id,
  count,
  metrics: aggregateMetrics([{ metrics: { spend, purchaseValue: spend * roas } }]),
});

test('quadrants follow the two lines, and a value on a line counts as reaching it', () => {
  const th = { spend: 1000, roas: 2 };
  assert.equal(quadrantOf({ spend: 5000, roas: 3 }, th), 'scale');
  assert.equal(quadrantOf({ spend: 200, roas: 3 }, th), 'boost');
  assert.equal(quadrantOf({ spend: 5000, roas: 1 }, th), 'fix');
  assert.equal(quadrantOf({ spend: 200, roas: 1 }, th), 'cut');
  assert.equal(quadrantOf({ spend: 1000, roas: 2 }, th), 'scale');
  assert.equal(quadrantOf({ spend: 1000, roas: null }, th), 'fix');
});

test('the summary accounts for every creative, its spend and the ROAS of each quadrant', () => {
  const stacks = [stack('a', 4000, 3, 3), stack('b', 300, 2.5), stack('c', 2000, 1), stack('d', 100, 0.5), stack('e', 6000, 2.2, 2)];
  const sum = summarizeQuadrants(stacks, { spend: 1000, roas: 2 });
  assert.deepEqual(QUADRANTS.map((q) => sum[q].count), [2, 1, 1, 1]);
  assert.equal(sum.scale.ads, 5);
  assert.equal(sum.scale.spend, 10000);
  assert.ok(Math.abs(sum.scale.roas - (4000 * 3 + 6000 * 2.2) / 10000) < 1e-9);
  const share = QUADRANTS.reduce((t, q) => t + sum[q].share, 0);
  assert.ok(Math.abs(share - 1) < 1e-9);
  assert.equal(summarizeQuadrants([], { spend: 1, roas: 1 }).cut.roas, null);
});

test('typed amounts read the way people write them', () => {
  assert.equal(parseAmount('10k'), 10000);
  assert.equal(parseAmount('1,5k'), 1500);
  assert.equal(parseAmount('$2.5k'), 2500);
  assert.equal(parseAmount('12.000'), 12000);
  assert.equal(parseAmount('12,000'), 12000);
  assert.equal(parseAmount('€ 750'), 750);
  assert.equal(parseAmount('1.2M'), 1200000);
  assert.equal(parseAmount('2,5'), 2.5);
  assert.equal(parseAmount('2.50'), 2.5);
  assert.equal(parseAmount('0'), 0);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-3'), null);
  assert.equal(parseAmount('1..2'), null);
});

test('starting lines are a readable median spend and the account ROAS', () => {
  assert.equal(niceNumber(7300), 5000);
  assert.equal(niceNumber(1340), 1000);
  assert.equal(niceNumber(3100), 2500);
  assert.equal(roundSpend(12345), 12000);
  assert.equal(roundSpend(987), 990);
  const d = matrixDefaults([stack('a', 1000, 4), stack('b', 3000, 2), stack('c', 9000, 1)]);
  assert.equal(d.spend, 2500);
  assert.equal(d.roas, 1.5);
  assert.deepEqual(matrixDefaults([]), { spend: 100, roas: 1 });
  assert.ok(validThresholds(d));
  assert.ok(!validThresholds({ spend: 0, roas: 1 }));
  assert.ok(!validThresholds({ spend: 10, roas: NaN }));
  assert.ok(!validThresholds(null));
});

test('the axes hold still while a line moves inside them, and grow for a line set outside', () => {
  const stacks = [stack('a', 120, 1), stack('b', 4000, 2), stack('c', 90000, 3.5), stack('d', 800, 0.4)];
  const a = matrixScales(stacks, { spend: 1000, roas: 2 }, 800, 400);
  const b = matrixScales(stacks, { spend: a.spendAt(700), roas: a.roasAt(10) }, 800, 400);
  assert.equal(b.lo, a.lo);
  assert.equal(b.hi, a.hi);
  assert.equal(b.yMax, a.yMax);
  // Dragging to the very edge still leaves the axes as they are.
  const edge = matrixScales(stacks, { spend: a.spendAt(800), roas: a.roasAt(0) }, 800, 400);
  assert.equal(edge.hi, a.hi);
  assert.equal(edge.yMax, a.yMax);
  const wide = matrixScales(stacks, { spend: 1e7, roas: 20 }, 800, 400);
  assert.ok(wide.hi >= 1e7 && wide.yMax >= 20);
  // Positions run left to right and bottom to top, inside the plot.
  assert.ok(a.x(120) < a.x(4000) && a.x(4000) < a.x(90000));
  assert.ok(a.y(3.5) < a.y(1));
  for (const s of stacks) {
    const x = a.x(s.metrics.spend);
    const y = a.y(s.metrics.roas);
    assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 400);
  }
  assert.ok(a.xTicks.length >= 3 && a.yTicks[0] === 0);
});
