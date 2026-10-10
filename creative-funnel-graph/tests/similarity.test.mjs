import { test } from 'node:test';
import assert from 'node:assert/strict';

import { words, features, distanceMatrix, mds3, similarityMap, separate, familyName, families } from '../public/js/similarity.js';

// A 256-bit hash with `ones` leading bits set, and a flat colour grid.
const sig = (ones, color = 120) => {
  const bits = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let b = 0; b < ones; b++) bits[b >> 5] = (bits[b >> 5] | (1 << (31 - (b & 31)))) >>> 0;
  return { bits, grid: new Array(27).fill(color) };
};
const stack = (id, tags, title, spend = 100) => ({ id, rep: { id, name: title, creative: { title, body: '' } }, tags, metrics: { spend } });

test('copy words skip short and common words and fold accents', () => {
  assert.deepEqual([...words('Lose 30 lbs in 90 days — perché funziona!')].sort(), ['lbs', 'lose', 'perche', 'funziona'].sort());
});

test('distances are symmetric, 0 to 1, and closer for alike creatives', () => {
  const stacks = [
    stack('a', { angle: 'GLP-1', format: 'UGC', hook: 'POV', persona: 'Moms' }, 'POV you skipped Ozempic'),
    stack('b', { angle: 'GLP-1', format: 'UGC', hook: 'POV', persona: 'Moms' }, 'POV you skipped Ozempic again'),
    stack('c', { angle: 'Offer', format: 'Static', hook: 'Price', persona: 'Deals' }, 'Buy one get one free'),
    stack('d', { angle: 'Offer', format: 'Static', hook: 'Price', persona: 'Deals' }, 'BOGO today only free'),
  ];
  const sigs = new Map([['a', sig(10)], ['b', sig(14)], ['c', sig(200, 30)], ['d', sig(190, 40)]]);
  for (const mode of ['all', 'visual', 'message']) {
    const D = distanceMatrix(features(stacks, sigs), mode);
    for (let i = 0; i < 4; i++) {
      assert.equal(D[i * 4 + i], 0);
      for (let j = 0; j < 4; j++) {
        assert.equal(D[i * 4 + j], D[j * 4 + i]);
        assert.ok(D[i * 4 + j] >= 0 && D[i * 4 + j] <= 1);
      }
    }
    assert.ok(D[0 * 4 + 1] < D[0 * 4 + 2], `${mode}: a is nearer b than c`);
    assert.ok(D[2 * 4 + 3] < D[1 * 4 + 3], `${mode}: c is nearer d than b`);
  }
  // Without a visual signature the message alone decides.
  const noSig = distanceMatrix(features(stacks, new Map()), 'visual');
  assert.ok(noSig[1] < noSig[2]);
});

test('the map keeps alike creatives together and every family is a real group', () => {
  const stacks = [];
  const sigs = new Map();
  const angles = ['GLP-1', 'Offer', 'Body', 'Proof'];
  for (let g = 0; g < 4; g++) {
    for (let k = 0; k < 10; k++) {
      const id = `${g}-${k}`;
      stacks.push(stack(id, { angle: angles[g], format: g % 2 ? 'Static' : 'UGC', hook: 'H' + g, persona: 'P' + g }, `${angles[g]} creative ${k}`, 100 + k));
      sigs.set(id, sig(g * 60 + k, 40 + g * 50));
    }
  }
  const map = similarityMap(stacks, sigs, { mode: 'all', radius: 7 });
  assert.equal(map.positions.length, stacks.length * 3);
  let maxR = 0;
  for (let i = 0; i < stacks.length; i++) maxR = Math.max(maxR, Math.hypot(map.positions[i * 3], map.positions[i * 3 + 1], map.positions[i * 3 + 2]));
  assert.ok(Math.abs(maxR - 7) < 1e-6, 'scaled to the radius');
  // Each creative's nearest neighbour comes from its own group.
  const sameGroup = map.neighbors.filter((nb, i) => stacks[nb[0].index].tags.angle === stacks[i].tags.angle).length;
  assert.ok(sameGroup >= 38, `${sameGroup}/40 nearest neighbours in the same group`);
  // Families follow the groups.
  const pure = Array.from({ length: map.families }, (_, f) => new Set(stacks.filter((_, i) => map.family[i] === f).map((s) => s.tags.angle)).size === 1);
  assert.ok(map.families >= 3 && pure.filter(Boolean).length >= 3);
  assert.ok(map.links.length >= stacks.length);
  const fam = stacks.filter((_, i) => map.family[i] === map.family[0]);
  assert.match(familyName(fam), /GLP-1/);
});

test('separating cards leaves none overlapping, and small families fold away', () => {
  const P = Float64Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? (i % 2) * 0.01 : 0));
  const size = new Array(10).fill(0.5);
  separate(P, size, 200);
  for (let i = 0; i < 10; i++) {
    for (let j = i + 1; j < 10; j++) {
      const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
      assert.ok(d >= 0.89, `cards ${i} and ${j} at ${d.toFixed(2)}`);
    }
  }
  const pts = new Float64Array(40 * 3);
  for (let i = 0; i < 40; i++) pts[i * 3] = i < 38 ? (i % 2) * 10 : 100 + i;
  const { label, count } = families(pts, 40, 4);
  const sizes = Array.from({ length: count }, (_, c) => label.filter((l) => l === c).length);
  assert.ok(sizes.every((n) => n >= 3), `sizes ${sizes}`);
  assert.equal(mds3(new Float64Array(4), 2).length, 6);
});
