import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectOffer, OFFER_KEYS } from '../public/js/offers.js';
import { kindOf, ugcFromCopy, ASSET_TYPES } from '../public/js/kinds.js';
import { overlap, sharedCriteria, overlapFeatures, hookLine } from '../public/js/overlap.js';
import { buildModel, groupStacks } from '../public/js/model.js';

test('the most concrete offer in the copy wins, with the words that made it', () => {
  assert.deepEqual(detectOffer('Limited time! Buy One Get One FREE today'), { key: 'bogo', text: 'buy one get one' });
  assert.equal(detectOffer('Fall Kickoff Sale: take 25% OFF sitewide').key, 'percent');
  assert.equal(detectOffer('Save $20 on your first order').key, 'amount');
  assert.equal(detectOffer('Stock up with the 3-pack').key, 'bundle');
  assert.equal(detectOffer('Prime Day savings are here').key, 'event');
  assert.equal(detectOffer('Try it risk-free for 90 days').key, 'guarantee');
  assert.equal(detectOffer('Special offer available today!').key, 'urgency');
  assert.equal(detectOffer('Sconto del 30% su tutto').key, 'percent');
  assert.deepEqual(detectOffer('Meet the new gummy'), { key: 'none', text: '' });
  assert.deepEqual(detectOffer(null), { key: 'none', text: '' });
  assert.ok(OFFER_KEYS.includes('none'));
});

test('asset type: tags first, then the name format, then the creative type', () => {
  const ad = (type, tags = {}, extra = {}) => ({ creative: { type, ...extra }, tags });
  assert.equal(kindOf(ad('image')).asset, 'static');
  assert.equal(kindOf(ad('video')).asset, 'video');
  assert.equal(kindOf(ad('carousel')).asset, 'carousel');
  assert.equal(kindOf(ad('video', { format: 'UGC' })).asset, 'ugc');
  assert.equal(kindOf(ad('video', { creator: '@sarah' })).asset, 'ugc');
  assert.equal(kindOf(ad('image', { creator: '@sarah', format: 'Static' })).asset, 'static', 'a static with a creator stays static');
  assert.equal(kindOf(ad('video', { asset: 'video', format: 'UGC' })).asset, 'video', 'a shipped tag wins');
  assert.equal(kindOf(ad('image', { format: 'Carousel' })).asset, 'carousel');
  for (const a of [ad('image'), ad('video', { format: 'UGC' })]) assert.ok(ASSET_TYPES.includes(kindOf(a).asset));
});

test('UGC format from tags, the name or the copy; other UGC when none says', () => {
  const ugc = (tags, title = '', body = '') => kindOf({ name: '', creative: { type: 'video', title, body }, tags: { format: 'UGC', ...tags } });
  assert.equal(ugc({ ugc: 'reveal' }).ugc, 'reveal');
  assert.equal(ugc({}, 'My honest unboxing of the new kit').ugc, 'unboxing');
  assert.equal(ugc({}, 'Before and after 30 days').ugc, 'reveal');
  assert.equal(ugc({}, 'GRWM: my morning routine').ugc, 'routine');
  assert.equal(ugc({}, 'POV: you skipped Ozempic').ugc, 'pov');
  assert.equal(ugc({}, 'Meet the gummy').ugc, 'other');
  assert.equal(ugc({ format: 'Unboxing' }).ugc, 'unboxing');
  assert.equal(kindOf({ creative: { type: 'image' }, tags: {} }).ugc, null, 'not UGC: no UGC format');
  assert.equal(ugcFromCopy('nothing here'), null);
});

const sig = (ones) => {
  const bits = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let b = 0; b < ones; b++) bits[b >> 5] = (bits[b >> 5] | (1 << (31 - (b & 31)))) >>> 0;
  return { bits, grid: new Array(27).fill(120) };
};
const BODY = 'With over 500,000 units sold the first collagen weight management product is finally back in stock for everyone';
const stack = (id, { creator = null, title, body = BODY, spend = 100 } = {}) => ({ id, rep: { id, name: title, creative: { title, body } }, ads: [{ id }], tags: { creator }, metrics: { spend } });

test('two creatives share a creator, a hook, the copy or the picture', () => {
  const stacks = [
    stack('a', { creator: 'Creator A', title: 'Lose 30 lbs in 90 days' }),
    stack('b', { creator: 'creator a', title: 'Lose 30 lbs in 90 days!' }),
    stack('c', { title: 'Two pills a day', body: 'Something else entirely, about a gummy that helps your skin glow every morning' }),
  ];
  const sigs = new Map([['a', sig(10)], ['b', sig(30)], ['c', sig(220)]]);
  const f = overlapFeatures(stacks, sigs);
  assert.deepEqual(sharedCriteria(f[0], f[1]), ['creator', 'hook', 'copy', 'visual']);
  assert.deepEqual(sharedCriteria(f[0], f[2]), []);
  assert.equal(hookLine({ creative: { hookLine: 'Shipped', title: 'Title' } }), 'Shipped');
  assert.equal(hookLine({ creative: { body: 'First line.\nSecond' } }), 'First line.');
});

test('groups are tied by every chosen criterion, biggest spend first', () => {
  const stacks = [
    stack('a', { title: 'Buy one get one free', spend: 50 }),
    stack('b', { title: 'Buy one get one free today', spend: 400 }),
    stack('c', { title: 'Buy one, get one free', body: 'A different body copy about skin that glows and hair that grows longer every week', spend: 90 }),
    stack('d', { title: 'Lose 30 lbs', spend: 300 }),
    stack('e', { title: 'Lose 30 lbs fast', spend: 10 }),
  ];
  const both = overlap(stacks, new Map(), ['hook', 'copy']);
  assert.deepEqual(both.groups.map((g) => g.stacks.map((s) => s.id)), [['b', 'a'], ['d', 'e']]);
  assert.equal(both.groups[0].spend, 450);
  // One line per tie that joins the group: a tree, not every pair.
  assert.deepEqual(overlap(stacks, new Map(), ['hook']).groups.map((g) => g.pairs.length), [2, 1]);
  const hookOnly = overlap(stacks, new Map(), ['hook']);
  assert.deepEqual(hookOnly.groups.map((g) => g.stacks.map((s) => s.id)), [['b', 'c', 'a'], ['d', 'e']]);
  assert.equal(overlap(stacks, new Map(), []).groups.length, 0);
  assert.ok(both.byStack.get('c').some((o) => o.stack.id === 'b' && o.shared.includes('hook')));
});

test('the model tags asset, UGC and offer and groups them by spend, none last', () => {
  const ad = (id, type, name, title, body, spend) => ({ id, name, status: 'ACTIVE', creative: { type, title, body, assetKey: id }, metrics: { spend, purchaseValue: spend * 2, impressions: spend * 40 } });
  const model = buildModel({
    ads: [
      ad('1', 'image', 'Static_Offer_BOGO', 'Buy one get one free', '', 500),
      ad('2', 'video', 'UGC_Unboxing_Sarah', 'Unboxing my order', '', 300),
      ad('3', 'video', 'Brand video', 'Meet the gummy', '', 200),
      ad('4', 'image', 'Static', '25% off sitewide', '', 100),
    ],
    range: { since: '2026-09-01', until: '2026-09-30' },
  });
  const by = (arr) => Object.fromEntries(groupStacks(model, arr).map((g) => [g.labelKey, g.stacks.length]));
  assert.deepEqual(by('asset'), { 'asset.static': 2, 'asset.video': 1, 'asset.ugc': 1 });
  assert.deepEqual(groupStacks(model, 'asset').map((g) => g.labelKey), ['asset.static', 'asset.video', 'asset.ugc']);
  assert.deepEqual(by('ugc'), { 'ugc.unboxing': 1, 'ugc.none': 3 });
  assert.equal(groupStacks(model, 'ugc').at(-1).labelKey, 'ugc.none');
  assert.deepEqual(by('offer'), { 'offer.bogo': 1, 'offer.percent': 1, 'offer.none': 2 });
  const bogo = model.stacks.find((s) => s.tags.offer === 'bogo');
  assert.equal(bogo.offerText, 'buy one get one');
});
