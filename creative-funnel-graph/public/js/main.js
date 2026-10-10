// App entry: state, data loading (demo brand or live Meta through the local server),
// model building, and wiring between the 3D scene and the DOM overlays.

import { FunnelGraphScene } from './scene.js';
import { buildModel, groupStacks, placementHints, summarize, DEFAULT_SETTINGS, ARRANGEMENTS, GROUP_COLORS } from './model.js';
import { similarityMap, familyName, separate, SIM_MODES } from './similarity.js';
import { overlap, OVERLAP_CRITERIA } from './overlap.js';
import { computeLayout } from './layout.js';
import { computeSignature } from './phash.js';
import { buildCardCanvases, placeholderCanvas } from './textures.js';
import { buildDemoSnapshot, buildDemoDetail, DEMO_ACCOUNT, DEMO_BRANDS } from './demo/demo-data.js';
import { paintCreative } from './demo/painter.js';
import { api, isStatic } from './api.js';
import { bitsToHex, hexToBits } from './stacks.js';
import { t, setLanguage, detectLanguage, localeFor, applyStatic } from './i18n.js';
import * as fmt from './format.js';
import * as ui from './ui.js';
import { renderDetail, closeDetail } from './detail.js';
import { MatrixView, matrixDefaults, validThresholds, QUADRANT_COLORS } from './matrix.js';
import { FUNNEL_LEVELS } from './funnel.js';
import { BOX, TALL_BOX } from './matrix3d.js';
import { openConnectModal, openInstallModal, openSettingsModal } from './modals.js';
import { BRAND } from './brand.js';

const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('funnel-graph:' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('funnel-graph:' + key, JSON.stringify(value));
    } catch {
      // Private mode or blocked storage: settings last for this visit only.
    }
  },
};

const PRESETS = ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month'];

export function rangeForPreset(preset, today = new Date()) {
  const day = fmt.dayKey(today);
  switch (preset) {
    case 'last_7d':
      return { since: fmt.addDays(day, -7), until: fmt.addDays(day, -1) };
    case 'last_30d':
      return { since: fmt.addDays(day, -30), until: fmt.addDays(day, -1) };
    case 'last_90d':
      return { since: fmt.addDays(day, -90), until: fmt.addDays(day, -1) };
    case 'this_month':
      return { since: day.slice(0, 8) + '01', until: day };
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { since: fmt.dayKey(first), until: fmt.dayKey(last) };
    }
    case 'last_14d':
    default:
      return { since: fmt.addDays(day, -14), until: fmt.addDays(day, -1) };
  }
}

// Brands that ship with the page: ids 'demo' when there is one, 'demo:<key>' when several.
const demoId = (b) => (DEMO_BRANDS.length > 1 ? 'demo:' + b.key : 'demo');
const isDemoId = (id) => DEMO_BRANDS.some((b) => demoId(b) === id);

const state = {
  staticPage: isStatic(),
  status: null,
  accountId: demoId(DEMO_BRANDS[0]),
  preset: 'last_14d',
  range: null,
  arrangement: 'funnel',
  focus: null,
  selected: null,
  settings: { ...DEFAULT_SETTINGS, ...store.get('settings', {}) },
  snapshot: null,
  model: null,
  groups: [],
  signatures: new Map(),
  artwork: new Map(),
  details: new Map(),
  loadId: 0,
  failedImages: 0,
  simMode: SIM_MODES.includes(store.get('simMode', 'all')) ? store.get('simMode', 'all') : 'all',
  similarity: new Map(),
  // "Too similar": the criteria picked, the groups they give, the group in view.
  ovCriteria: (() => {
    const saved = store.get('ovCriteria', ['hook', 'copy']);
    return Array.isArray(saved) ? saved.filter((c) => OVERLAP_CRITERIA.includes(c)) : ['hook', 'copy'];
  })(),
  overlap: null,
  ovGroup: null,
};

let scene = null;
let matrix = null;

// ---------- helpers ----------

const isDemo = () => isDemoId(state.accountId);
const demoBrand = () => DEMO_BRANDS.find((b) => demoId(b) === state.accountId) || DEMO_BRANDS[0];

/** A shipped brand's name in the menu and the chip: its own, else the demo's. */
function demoLabel(b) {
  if (!b.name) return t('account.demo');
  return b.simulated ? `${b.name} · ${t('acc.simulated')}` : b.name;
}

function demoSub(b) {
  if (!b.read) return t('acc.demoSub');
  return t('acc.read', { date: fmt.shortDate(b.read), ads: fmt.integer(b.ads || 0) });
}
const currency = () => state.model?.account?.currency || state.snapshot?.account?.currency || 'USD';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function accountName() {
  if (isDemo()) return demoLabel(demoBrand());
  const acc = state.status?.accounts?.find((a) => a.id === state.accountId);
  return acc?.name || state.accountId;
}

function renderHeader() {
  ui.renderHeader({
    accountName: accountName(),
    connected: !!state.status?.connected && !isDemo(),
    isStaticPage: state.staticPage,
    range: state.range,
    presetKey: state.preset,
  });
  $('connect-btn').hidden = !state.staticPage && !!state.status?.connected;
}

function paintCanvas(spec, aspect, width, readable = false) {
  const c = document.createElement('canvas');
  if (readable) c.getContext('2d', { willReadFrequently: true });
  return paintCreative(c, spec, aspect, width);
}

function imageUrlFor(ad, large = false) {
  const c = ad.creative || {};
  const url = large ? c.imageUrl || c.thumbUrl : c.thumbUrl || c.imageUrl;
  return url ? api.imageUrl(url) : null;
}

function loadImage(src, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('timeout'));
    }, timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('image failed'));
    };
    img.src = src;
  });
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// ---------- loading ----------

async function computeSignatures(snapshot, loadId) {
  const signatures = new Map();
  if (snapshot.source === 'demo') {
    ui.setLoading(t('load.painting'));
    await nextFrame();
    const canvas = document.createElement('canvas');
    canvas.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < snapshot.ads.length; i++) {
      const ad = snapshot.ads[i];
      paintCreative(canvas, ad.creative.paint, ad.creative.aspect, 96);
      const sig = computeSignature(canvas);
      if (sig) signatures.set(ad.id, sig);
      if (i % 40 === 39) {
        await nextFrame();
        if (loadId !== state.loadId) return null;
      }
    }
    return signatures;
  }

  // Live: one signature per distinct preview URL, cached across sessions.
  const cache = store.get('sigs', {});
  const byUrl = new Map();
  for (const ad of snapshot.ads) {
    const src = imageUrlFor(ad);
    if (!src) continue;
    if (!byUrl.has(src)) byUrl.set(src, []);
    byUrl.get(src).push(ad);
  }
  const entries = [...byUrl.entries()];
  let done = 0;
  state.failedImages = 0;
  ui.setLoading(t('load.images', { done: 0, total: entries.length }));
  await pool(entries, 8, async ([src, ads]) => {
    const cacheKey = ads[0].creative?.assetKey || ads[0].creative?.id || src;
    let sig = null;
    const cached = cache[cacheKey];
    if (cached) {
      sig = { bits: hexToBits(cached.b), grid: cached.g, aspect: cached.a };
    } else {
      try {
        const img = await loadImage(src);
        sig = computeSignature(img);
        if (sig) cache[cacheKey] = { b: bitsToHex(sig.bits), g: sig.grid, a: Math.round(sig.aspect * 1000) / 1000 };
      } catch {
        state.failedImages++;
      }
    }
    if (sig) {
      for (const ad of ads) {
        signatures.set(ad.id, sig);
        if (!ad.creative.aspect && sig.aspect) ad.creative.aspect = sig.aspect;
      }
    }
    done++;
    if (loadId === state.loadId && (done % 4 === 0 || done === entries.length)) {
      ui.setLoading(t('load.images', { done, total: entries.length }));
    }
  });
  // Keep the cache bounded.
  const keys = Object.keys(cache);
  if (keys.length > 6000) for (const k of keys.slice(0, keys.length - 6000)) delete cache[k];
  store.set('sigs', cache);
  return signatures;
}

async function load({ refresh = false } = {}) {
  const loadId = ++state.loadId;
  closeDrawer();
  ui.setEmpty(false);
  ui.setLoading(isDemo() ? t('load.painting') : t('load.snapshot'));
  $('refresh-btn').classList.add('spinning');
  try {
    let snapshot;
    if (isDemo()) {
      snapshot = buildDemoSnapshot(state.range, demoBrand().key);
    } else {
      snapshot = await api.snapshot({ account: state.accountId, since: state.range.since, until: state.range.until, refresh });
    }
    if (loadId !== state.loadId) return;
    const signatures = await computeSignatures(snapshot, loadId);
    if (!signatures || loadId !== state.loadId) return;
    state.snapshot = snapshot;
    state.signatures = signatures;
    state.artwork = new Map();
    state.details = new Map();
    await rebuildModel();
    if (refresh && !isDemo()) ui.toast(t('toast.refreshed'));
    if (state.failedImages > 0) ui.toast(t('err.images', { n: state.failedImages }));
    if (snapshot.notes?.segmentError) ui.toast(t('warn.segments', { msg: snapshot.notes.segmentError }), { ms: 7000 });
  } catch (err) {
    if (loadId !== state.loadId) return;
    handleError(err);
    if (!isDemo()) {
      // Fall back to the demo so the view is never empty.
      state.accountId = demoId(DEMO_BRANDS[0]);
      renderHeader();
      return load();
    }
  } finally {
    if (loadId === state.loadId) {
      $('refresh-btn').classList.remove('spinning');
      ui.setLoading(null);
    }
  }
}

function handleError(err) {
  console.error(err);
  if (err?.kind === 'offline') ui.toast(t('err.server'), { error: true, ms: 6000 });
  else if (err?.kind === 'token') ui.toast(t('err.token', { msg: err.message }), { error: true, ms: 7000 });
  else ui.toast(t('err.generic', { msg: err?.message || String(err) }), { error: true, ms: 6000 });
}

async function rebuildModel() {
  state.model = buildModel(state.snapshot, { signatures: state.signatures, settings: state.settings });
  state.similarity = new Map();
  state.overlap = null;
  state.ovGroup = null;
  await rebuildView();
}

async function buildArtwork(cards) {
  const jobs = cards.filter((c) => {
    const key = artKey(c.stack);
    return !state.artwork.has(key);
  });
  await pool(jobs, 6, async (card) => {
    const s = card.stack;
    const rep = s.rep;
    const width = card.h > 0.75 ? 240 : 170;
    let source;
    if (rep.creative?.paint) {
      source = paintCanvas(rep.creative.paint, rep.creative.aspect, width);
    } else {
      const src = imageUrlFor(rep);
      try {
        source = src ? await loadImage(src) : placeholderCanvas(rep.name, rep.creative?.aspect || 0.8);
      } catch {
        source = placeholderCanvas(rep.name, rep.creative?.aspect || 0.8);
      }
    }
    const aspect = rep.creative?.aspect || (source.naturalWidth || source.width) / (source.naturalHeight || source.height) || 0.8;
    state.artwork.set(artKey(s), buildCardCanvases(source, { aspect, count: s.count, dashed: s.funnel.method !== 'segments', width }));
  });
  const byStack = new Map();
  for (const c of cards) byStack.set(c.stack.id, state.artwork.get(artKey(c.stack)));
  return byStack;
}

function artKey(stack) {
  return `${stack.id}|${stack.count}|${stack.funnel.method === 'segments' ? 's' : 'e'}`;
}

async function rebuildView() {
  const model = state.model;
  const isMatrix = state.arrangement === 'matrix';
  document.body.classList.toggle('matrix-mode', isMatrix);
  $('matrix').hidden = !isMatrix;
  const isSim = state.arrangement === 'similarity';
  document.body.classList.toggle('sim-mode', isSim);
  $('sim-panel').hidden = !isSim;
  if (isMatrix) return showMatrix();
  if (isSim) return showSimilarity();
  state.groups = groupStacks(model, state.arrangement);
  if (state.focus && !state.groups.some((g) => g.key === state.focus && g.count > 0)) state.focus = null;
  const layout = computeLayout(state.groups, {
    mode: state.arrangement === 'funnel' ? 'funnel' : 'groups',
    placement: placementHints(state.groups, state.arrangement),
    maxCards: state.settings.maxCards,
  });
  ui.setLoading(t('load.building'));
  const artwork = await buildArtwork(layout.cards);
  state.layout = layout;
  if (scene) {
    scene.setData(layout, artwork);
    scene.setFocus(state.focus);
    updateInsets();
  }
  ui.buildRingLabels(state.groups, pickGroup);
  renderOverlays();
  ui.setEmpty(model.stacks.length === 0);
}

/**
 * Spend × ROAS in 3D: the same scene, the creatives in a box by spend, ROAS and funnel lane,
 * cut into quadrants by the two lines the user sets for this account.
 */
async function showMatrix() {
  const model = state.model;
  state.groups = [];
  if (!['scale', 'boost', 'fix', 'cut'].includes(state.focus)) state.focus = null;
  ui.setLoading(t('load.building'));
  const artwork = await buildArtwork(model.stacks.map((stack) => ({ stack, h: 1 })));
  const defaults = matrixDefaults(model.stacks);
  const saved = store.get('matrix:' + state.accountId, null);
  const lines = validThresholds(saved) ? saved : defaults;
  if (!matrix) {
    matrix = new MatrixView($('matrix'), {
      t,
      money: (v) => fmt.money(v, currency()),
      roas: fmt.roas,
      onLines: (th, commit) => {
        scene?.setMatrixLines(th);
        if (commit) store.set('matrix:' + state.accountId, th);
      },
      onQuadrant: (q) => {
        state.focus = q;
        scene?.setFocus(q);
      },
    });
  }
  matrix.setData({ stacks: model.stacks, thresholds: lines, defaults, quadrant: state.focus });
  const stage = $('stage');
  state.matrixTall = stage.clientWidth < stage.clientHeight * 0.8;
  scene?.setMatrix(
    {
      stacks: model.stacks,
      box: state.matrixTall ? TALL_BOX : BOX,
      lines,
      focus: state.focus,
      colors: QUADRANT_COLORS,
      lanes: FUNNEL_LEVELS.map((l) => ({ key: l.key, label: t('level.' + l.key), color: l.color })),
      money: matrix.money,
      roas: fmt.roas,
      names: Object.fromEntries(['scale', 'boost', 'fix', 'cut'].map((q) => [q, t('mx.q.' + q)])),
      axis: { spend: t('mx.axis.spend'), roas: t('mx.axis.roas') },
    },
    artwork,
  );
  scene?.setSelected(state.selected);
  ui.buildRingLabels([], pickGroup);
  renderOverlays();
  updateInsets();
  ui.setEmpty(model.stacks.length === 0);
}

/** The similarity map for a mode, worked out once per model. */
function similarityFor(mode = state.simMode) {
  if (!state.similarity.has(mode)) state.similarity.set(mode, similarityMap(state.model.stacks, state.signatures, { mode, radius: 7 }));
  return state.similarity.get(mode);
}

/** The creatives too alike to test against each other, for the criteria picked. */
function overlapFor() {
  const key = state.ovCriteria.join(',');
  if (!state.overlap || state.overlap.key !== key) state.overlap = { key, ...overlap(state.model.stacks, state.signatures, state.ovCriteria) };
  return state.overlap;
}

/** Shows one group of too-alike creatives in the map (or none), each pair tied by a line. */
function showOverlapGroup(index) {
  const ov = overlapFor();
  const group = index === null ? null : ov.groups[index];
  state.ovGroup = group ? index : null;
  if (group) state.focus = null;
  const ids = group ? new Set(group.stacks.map((s) => s.id)) : null;
  scene?.setFocus(state.focus);
  scene?.setHighlight(ids, group?.pairs || []);
  renderSimPanel();
  renderOverlays();
}

/**
 * Creative similarity in 3D: alike creatives close, different ones apart, in families named
 * by what most of their spend shares. The legend lists the families; one picked is zoomed to.
 */
async function showSimilarity() {
  const model = state.model;
  ui.setLoading(t('load.building'));
  await nextFrame();
  const map = similarityFor();
  const fams = Array.from({ length: map.families }, (_, f) => model.stacks.filter((_, i) => map.family[i] === f));
  const order = fams.map((stacks, f) => ({ f, spend: stacks.reduce((t, s) => t + s.metrics.spend, 0) })).sort((a, b) => b.spend - a.spend);
  const keyOf = new Map(order.map((o, rank) => [o.f, 'f' + rank]));
  state.groups = order.map((o, rank) =>
    summarize({ key: 'f' + rank, label: familyName(fams[o.f], t('sim.mixed')), labelKey: null, color: GROUP_COLORS[rank % GROUP_COLORS.length], stacks: fams[o.f] }),
  );
  if (state.focus && !state.groups.some((g) => g.key === state.focus)) state.focus = null;
  const maxSpend = Math.max(1, ...model.stacks.map((s) => s.metrics.spend));
  const cards = model.stacks.map((stack, i) => {
    const h = 0.55 + 0.9 * Math.sqrt(stack.metrics.spend / maxSpend);
    const aspect = Math.max(0.56, Math.min(1.5, stack.rep.creative?.aspect || 0.8));
    return { stack, x: 0, y: 0, z: 0, w: h * aspect, h, group: keyOf.get(map.family[i]) };
  });
  // Neighbours stay neighbours, but no card hides another.
  const P = Float64Array.from(map.positions);
  separate(P, cards.map((c) => Math.max(c.w, c.h) / 2));
  cards.forEach((c, i) => Object.assign(c, { x: P[i * 3], y: P[i * 3 + 1], z: P[i * 3 + 2] }));
  const artwork = await buildArtwork(model.stacks.map((stack) => ({ stack, h: 1 })));
  scene?.setCloud({ cards, links: map.links, families: state.groups.map((g) => ({ key: g.key, label: g.label, color: g.color })) }, artwork);
  scene?.setFocus(state.focus);
  if (state.ovGroup !== null) showOverlapGroup(state.ovGroup < overlapFor().groups.length ? state.ovGroup : null);
  scene?.setSelected(state.selected);
  ui.buildRingLabels([], pickGroup);
  renderSimPanel();
  renderOverlays();
  updateInsets();
  ui.setEmpty(model.stacks.length === 0);
}

/** The similarity's mode: all of it, the look alone, or the message alone. */
function renderSimPanel() {
  const panel = $('sim-panel');
  const buttons = SIM_MODES.map((mode) =>
    ui.h('button', {
      type: 'button',
      'aria-pressed': String(state.simMode === mode),
      text: t('sim.mode.' + mode),
      onclick: async () => {
        if (state.simMode === mode) return;
        state.simMode = mode;
        store.set('simMode', mode);
        state.focus = null;
        closeDrawer();
        await showSimilarity();
        ui.setLoading(null);
      },
    }),
  );
  panel.replaceChildren(
    ui.h('div', { class: 'sim-row-top' }, ui.h('span', { class: 'mx-label', text: t('sim.label') }), ui.h('div', { class: 'segmented', role: 'group', 'aria-label': t('sim.label') }, ...buttons)),
    ui.h('p', { class: 'mx-hint', text: t('sim.hint.' + state.simMode) }),
    overlapSection(),
  );
}

/** "Too similar": criteria to pick (same creator, hook, copy, image) and the groups they give. */
function overlapSection() {
  const ov = overlapFor();
  const crit = OVERLAP_CRITERIA.map((c) =>
    ui.h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(state.ovCriteria.includes(c)),
        onclick: () => {
          const on = state.ovCriteria.includes(c);
          state.ovCriteria = on ? state.ovCriteria.filter((x) => x !== c) : OVERLAP_CRITERIA.filter((x) => x === c || state.ovCriteria.includes(x));
          store.set('ovCriteria', state.ovCriteria);
          showOverlapGroup(null);
          updateInsets();
        },
      },
      t('ov.crit.' + c),
      ui.h('small', { text: String(ov.counts[c] ? countWith(ov, c) : 0) }),
    ),
  );
  const max = 12;
  const cur = currency();
  const groups = ov.groups.slice(0, max).map((g, i) =>
    ui.h(
      'button',
      { type: 'button', class: 'ov-group', 'aria-pressed': String(state.ovGroup === i), onclick: () => showOverlapGroup(state.ovGroup === i ? null : i) },
      ui.h('b', { text: overlapTitle(g) }),
      ui.h('span', { text: t('ov.group', { n: g.stacks.length, spend: fmt.money(g.spend, cur) }) }),
    ),
  );
  if (ov.groups.length > max) groups.push(ui.h('span', { class: 'ov-more', text: t('ov.more', { n: ov.groups.length - max }) }));
  let note = null;
  if (!state.ovCriteria.length) note = t('ov.pick');
  else if (state.ovCriteria.includes('creator') && !state.model.stacks.some((s) => s.tags?.creator)) note = t('ov.noCreator');
  else if (!ov.groups.length) note = t('ov.none');
  return ui.h(
    'div',
    { class: 'ov' },
    ui.h('div', { class: 'ov-crit', role: 'group', 'aria-label': t('ov.title') }, ui.h('span', { class: 'mx-label', title: t('ov.hint'), text: t('ov.title') }), ...crit),
    groups.length ? ui.h('div', { class: 'ov-groups' }, ...groups) : null,
    // The why once, while nothing is picked; then only what is missing.
    note || state.ovGroup === null ? ui.h('p', { class: 'mx-hint', text: note || t('ov.hint') }) : null,
  );
}

/** How many creatives share a criterion with at least one other. */
function countWith(ov, c) {
  let n = 0;
  for (const list of ov.byStack.values()) if (list.some((o) => o.shared.includes(c))) n++;
  return n;
}

/** A group's name: the creator, else the hook line, of its biggest creative. */
function overlapTitle(g) {
  const top = g.stacks[0];
  if (g.shared.includes('creator') && top.tags?.creator) return top.tags.creator;
  const c = top.rep.creative || {};
  const line = c.hookLine || c.title || top.rep.name || '';
  return line.length > 40 ? line.slice(0, 39) + '…' : line;
}

/** A quadrant pressed again, Esc or the pill: back to the whole matrix. */
function clearQuadrant() {
  if (state.arrangement === 'matrix' && matrix && state.focus) matrix.showOnly(state.focus);
  else if (state.focus) pickGroup(state.focus);
}

/**
 * Tells the scene which parts of the stage the overlays cover: the drawer on a wide
 * screen and, in the matrix, its controls on top and its summary at the side or beneath.
 */
function updateInsets() {
  if (!scene) return;
  const stage = $('stage').getBoundingClientRect();
  const drawer = !$('detail').hidden && stage.width > 900 ? Math.min(460, stage.width) : 0;
  if (state.arrangement === 'similarity') {
    const panel = $('sim-panel').getBoundingClientRect();
    scene.setInsets({ top: Math.max(0, panel.bottom - stage.top + 4), right: drawer, bottom: 0 });
    return;
  }
  if (state.arrangement !== 'matrix') {
    scene.setInsets({ top: 0, right: drawer, bottom: 0 });
    return;
  }
  const root = $('matrix');
  const controls = root.querySelector('.mx-controls')?.getBoundingClientRect();
  const summary = root.querySelector('.mx-summary')?.getBoundingClientRect();
  if (!controls || !summary) return;
  const beside = summary.top < stage.top + stage.height / 2;
  // Beneath the box on a phone, the summary also leaves a row for the zoom buttons.
  const bottom = beside ? 0 : Math.max(0, stage.bottom - summary.top + 44);
  // A phone turned (or a window resized) past portrait gets the box that fits it.
  const tall = stage.width < stage.height * 0.8;
  if (state.matrixTall !== undefined && tall !== state.matrixTall && state.model) {
    state.matrixTall = tall;
    showMatrix().then(() => ui.setLoading(null));
    return;
  }
  scene.setInsets({
    top: Math.max(0, controls.bottom - stage.top + 4),
    right: Math.max(drawer, beside ? stage.right - summary.left + 4 : 0),
    bottom,
  });
  $('stage').style.setProperty('--mx-bottom', Math.max(0, bottom - 40) + 'px');
}

/** What the tooltip adds in the matrix (the quadrant) and the similarity map (the family). */
function tooltipExtra(card) {
  if (!card) return null;
  if (state.arrangement === 'matrix') return { text: `${t('mx.q.' + card.group)} · ${t('mx.do.' + card.group)}`, color: QUADRANT_COLORS[card.group] };
  if (state.arrangement === 'similarity') {
    const g = state.groups.find((x) => x.key === card.group);
    return g ? { text: g.label, color: g.color } : null;
  }
  return null;
}

function renderOverlays() {
  const model = state.model;
  if (!model) return;
  const focusGroup = state.groups.find((g) => g.key === state.focus) || null;
  ui.renderPill(focusGroup, { cards: model.stacks.length, spend: model.totals.spend, roas: model.totals.roas }, currency());
  ui.renderArrange(state.arrangement);
  const estimatedStacks = model.stacks.filter((s) => s.funnel.method !== 'segments');
  ui.renderLegend({
    groups: state.groups,
    arrangement: state.arrangement,
    focusKey: state.focus,
    currency: currency(),
    estimated: estimatedStacks.length,
    estimatedByNames: estimatedStacks.some((s) => s.funnel.method === 'names'),
    ads: model.ads.length,
    cards: model.stacks.length,
    hidden: state.layout?.hidden || 0,
    onPick: pickGroup,
  });
}

// ---------- interactions ----------

function pickGroup(key) {
  state.focus = state.focus === key ? null : key;
  if (state.ovGroup !== null) {
    state.ovGroup = null;
    scene?.setHighlight(null);
    if (state.arrangement === 'similarity') renderSimPanel();
  }
  scene?.setFocus(state.focus);
  renderOverlays();
}

function selectCard(card) {
  if (!card) {
    if (!$('detail').hidden) closeDrawer();
    return;
  }
  // In the matrix a card opens its detail; the quadrant in view stays as it is.
  if (state.arrangement === 'matrix') return openDetail(card.stack, null);
  // With a group of too-alike creatives in view, a card opens its detail and the group stays.
  if (state.ovGroup !== null && state.arrangement === 'similarity') return openDetail(card.stack, state.groups.find((g) => g.key === card.group) || null);
  if (state.focus !== card.group) {
    state.focus = card.group;
    scene?.setFocus(state.focus);
    renderOverlays();
  }
  openDetail(card.stack, state.groups.find((g) => g.key === card.group) || null);
}

function openDetail(stack, group) {
  state.selected = stack.id;
  scene?.setSelected(state.selected);
  const index = state.model.stacks.indexOf(stack);
  const similar = index >= 0 && state.model.stacks.length > 1 ? similarityFor().neighbors[index].slice(0, 4).map((nb) => ({ stack: state.model.stacks[nb.index], sim: nb.sim })) : [];
  renderDetail($('detail'), {
    stack,
    group,
    model: state.model,
    live: !isDemo(),
    preview: previewFor,
    loadDetail: detailFor,
    onClose: closeDrawer,
    similar,
    overlap: index >= 0 ? (overlapFor().byStack.get(stack.id) || []).slice(0, 5) : [],
    onPick: (other) => openDetail(other, null),
  });
  updateInsets();
}

function closeDrawer() {
  state.selected = null;
  scene?.setSelected(null);
  closeDetail($('detail'));
  updateInsets();
}

async function previewFor(ad, width) {
  if (ad.creative?.paint) return paintCanvas(ad.creative.paint, ad.creative.aspect, width);
  const src = imageUrlFor(ad, true);
  if (!src) return placeholderCanvas(ad.name, ad.creative?.aspect || 0.8);
  try {
    const img = await loadImage(src);
    img.alt = '';
    return img;
  } catch {
    return placeholderCanvas(ad.name, ad.creative?.aspect || 0.8);
  }
}

async function detailFor(ads, { video } = {}) {
  const key = ads.map((a) => a.id).join(',') + '|' + state.range.since + '|' + state.range.until;
  if (state.details.has(key)) return state.details.get(key);
  let detail;
  if (isDemo()) {
    detail = buildDemoDetail(ads, state.range);
  } else {
    detail = await api.detail({ account: state.accountId, ads: ads.map((a) => a.id), since: state.range.since, until: state.range.until, video });
  }
  state.details.set(key, detail);
  return detail;
}

function openDateMenu() {
  const custom = ui.h(
    'form',
    { class: 'menu-custom' },
    ui.h('label', {}, t('date.from'), ui.h('input', { class: 'input', type: 'date', id: 'range-since', value: state.range.since, max: fmt.dayKey(new Date()) })),
    ui.h('label', {}, t('date.to'), ui.h('input', { class: 'input', type: 'date', id: 'range-until', value: state.range.until, max: fmt.dayKey(new Date()) })),
    ui.h('button', { class: 'btn', type: 'submit', text: t('date.apply') }),
  );
  custom.addEventListener('submit', (e) => {
    e.preventDefault();
    const since = custom.querySelector('#range-since').value;
    const until = custom.querySelector('#range-until').value;
    if (!since || !until || since > until) return;
    ui.closeMenu();
    state.preset = 'custom';
    state.range = { since, until };
    store.set('range', { preset: 'custom', ...state.range });
    renderHeader();
    load();
  });
  ui.openMenu(
    $('date-chip'),
    [
      ...PRESETS.map((p) => ({
        label: t('date.' + p),
        meta: (() => {
          const r = rangeForPreset(p);
          return t('date.range', { a: fmt.shortDate(r.since), b: fmt.shortDate(r.until) });
        })(),
        checked: state.preset === p,
        onSelect: () => {
          state.preset = p;
          state.range = rangeForPreset(p);
          store.set('range', { preset: p });
          renderHeader();
          load();
        },
      })),
      { separator: true },
      { heading: t('date.custom') },
      { node: custom },
    ],
    { align: 'right' },
  );
}

function openAccountMenu() {
  const items = [
    { heading: DEMO_BRANDS.length > 1 ? t('acc.brands') : t('acc.title') },
    ...DEMO_BRANDS.map((b) => ({ label: demoLabel(b), sub: demoSub(b), checked: state.accountId === demoId(b), onSelect: () => switchAccount(demoId(b)) })),
  ];
  const accounts = state.status?.accounts || [];
  if (accounts.length && DEMO_BRANDS.length > 1) items.push({ separator: true }, { heading: t('acc.title') });
  for (const a of accounts) {
    items.push({ label: a.name || a.id, sub: `${a.id} · ${a.currency || ''}`, checked: state.accountId === a.id, onSelect: () => switchAccount(a.id) });
  }
  if (state.status?.connected && !accounts.length) items.push({ heading: t('acc.none') });
  items.push({ separator: true });
  if (state.staticPage) items.push({ label: t('acc.connect'), onSelect: openInstallModal });
  else if (state.status?.connected) items.push({ label: t('acc.disconnect'), onSelect: disconnect });
  else items.push({ label: t('acc.connect'), onSelect: openConnect });
  ui.openMenu($('account-chip'), items);
}

function openArrangeMenu() {
  const withSub = ['matrix', 'similarity', 'asset', 'ugc', 'offer'];
  const item = (a) => ({ label: t('arr.' + a), sub: withSub.includes(a) ? t(`arr.${a}Sub`) : undefined, checked: state.arrangement === a, onSelect: () => setArrangement(a) });
  const some = (list) => list.filter((a) => ARRANGEMENTS.includes(a)).map(item);
  const detected = some(['format', 'angle', 'persona', 'creator', 'hook']);
  const creative = some(['asset', 'ugc', 'offer']);
  const campaign = some(['campaign']);
  ui.openMenu(
    $('arrange-chip'),
    [
      { heading: t('arrange.title') },
      item('funnel'),
      ...(creative.length ? [{ separator: true }, { heading: t('arrange.creative') }, ...creative] : []),
      ...(detected.length ? [{ separator: true }, { heading: t('arrange.detected') }, ...detected] : []),
      ...(campaign.length ? [{ separator: true }, ...campaign] : []),
      ...(ARRANGEMENTS.includes('matrix') || ARRANGEMENTS.includes('similarity') ? [{ separator: true }, { heading: t('arrange.performance') }, ...some(['similarity', 'matrix'])] : []),
    ],
    { align: 'right' },
  );
}

async function setArrangement(a) {
  if (!ARRANGEMENTS.includes(a) || a === state.arrangement) return;
  state.arrangement = a;
  state.focus = null;
  state.ovGroup = null;
  store.set('arrangement', a);
  closeDrawer();
  await rebuildView();
  ui.setLoading(null);
}

function switchAccount(id) {
  if (id === state.accountId) return;
  state.accountId = id;
  store.set('account', id);
  if (!isDemoId(id)) api.saveConfig({ defaultAccount: id }).catch(() => {});
  renderHeader();
  load();
}

function openConnect() {
  if (state.staticPage) return openInstallModal();
  openConnectModal({
    appId: state.status?.appId,
    apiVersion: state.status?.apiVersion,
    onConnected: (status) => {
      state.status = status;
      ui.toast(t('toast.connected', { name: status.user?.name || '' }));
      const first = status.defaultAccount || status.accounts?.[0]?.id;
      if (first) switchAccount(first);
      else renderHeader();
    },
  });
}

async function disconnect() {
  try {
    await api.disconnect();
  } catch (err) {
    handleError(err);
  }
  state.status = { ...(state.status || {}), connected: false, accounts: [], user: null };
  state.accountId = demoId(DEMO_BRANDS[0]);
  store.set('account', state.accountId);
  ui.toast(t('toast.disconnected'));
  renderHeader();
  load();
}

function openSettings() {
  openSettingsModal({
    settings: state.settings,
    staticPage: state.staticPage,
    status: state.status,
    onConnect: openConnect,
    onDisconnect: disconnect,
    onClearCache: async () => {
      try {
        await api.clearCache();
        store.set('sigs', {});
        ui.toast(t('toast.cacheCleared'));
      } catch (err) {
        handleError(err);
      }
    },
    onSave: async (next) => {
      const prev = state.settings;
      state.settings = next;
      store.set('settings', next);
      if (next.lang !== prev.lang) applyLanguage(next.lang);
      const modelChanged = ['sensitivity', 'namingTemplate', 'minSaturationFrequency', 'onlyActive'].some((k) => next[k] !== prev[k]);
      if (modelChanged && state.snapshot) {
        closeDrawer();
        await rebuildModel();
        ui.setLoading(null);
      } else {
        renderHeader();
        ui.buildRingLabels(state.groups, pickGroup);
        renderOverlays();
      }
    },
  });
}

function applyLanguage(code) {
  setLanguage(detectLanguage(code));
  fmt.setLocale(localeFor());
  applyStatic();
  updateControlLabels();
  renderHeader();
  // The matrix writes its labels once; build it again in the new language.
  if (matrix) {
    matrix = null;
    if (state.arrangement === 'matrix' && state.model) showMatrix().then(() => ui.setLoading(null));
  }
  // Family names are written in the language too.
  if (state.arrangement === 'similarity' && state.model) showSimilarity().then(() => ui.setLoading(null));
}

function updateControlLabels() {
  const paused = scene && !scene.autoRotate;
  const pause = $('pause-btn');
  pause.title = paused ? t('ctl.play') : t('ctl.pause');
  pause.setAttribute('aria-label', pause.title);
  pause.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  $('reset-btn').title = t('ctl.reset');
  $('reset-btn').setAttribute('aria-label', t('ctl.reset'));
  for (const [id, key] of [['zoom-in-btn', 'ctl.zoomIn'], ['zoom-out-btn', 'ctl.zoomOut']]) {
    $(id).title = t(key);
    $(id).setAttribute('aria-label', t(key));
  }
}

function bindChrome() {
  $('date-chip').addEventListener('click', openDateMenu);
  $('account-chip').addEventListener('click', openAccountMenu);
  $('arrange-chip').addEventListener('click', openArrangeMenu);
  $('connect-btn').addEventListener('click', openConnect);
  $('settings-btn').addEventListener('click', openSettings);
  $('refresh-btn').addEventListener('click', () => load({ refresh: true }));
  $('stat-pill').addEventListener('click', clearQuadrant);
  $('zoom-in-btn').addEventListener('click', () => scene?.zoomBy(1.4));
  $('zoom-out-btn').addEventListener('click', () => scene?.zoomBy(1 / 1.4));
  $('pause-btn').addEventListener('click', () => {
    scene?.setAutoRotate(!scene.autoRotate);
    updateControlLabels();
  });
  $('reset-btn').addEventListener('click', () => {
    if (state.arrangement === 'matrix' && matrix?.only) matrix.showOnly(matrix.only);
    state.focus = null;
    closeDrawer();
    scene?.resetView();
    renderOverlays();
  });
  new ResizeObserver(() => updateInsets()).observe($('stage'));
  new ResizeObserver(() => updateInsets()).observe($('matrix'));
  new ResizeObserver(() => updateInsets()).observe($('sim-panel'));
  const legend = $('legend');
  $('legend-toggle').addEventListener('click', () => {
    const collapsed = legend.classList.toggle('collapsed');
    $('legend-toggle').setAttribute('aria-expanded', String(!collapsed));
    store.set('legendCollapsed', collapsed);
  });
  const startCollapsed = store.get('legendCollapsed', window.innerWidth < 640);
  if (startCollapsed) {
    legend.classList.add('collapsed');
    $('legend-toggle').setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !$('modal').hidden || !$('popover').hidden) return;
    if (!$('detail').hidden) closeDrawer();
    else if (state.ovGroup !== null && state.arrangement === 'similarity') showOverlapGroup(null);
    else clearQuadrant();
  });
}

// ---------- boot ----------

async function boot() {
  document.title = BRAND.name;
  document.querySelector('.brand-mark').textContent = BRAND.mark;
  document.querySelector('.brand-product').textContent = BRAND.product;
  document.querySelector('.brand').setAttribute('aria-label', BRAND.name);

  const savedRange = store.get('range', null);
  if (savedRange?.preset === 'custom' && savedRange.since && savedRange.until) {
    state.preset = 'custom';
    state.range = { since: savedRange.since, until: savedRange.until };
  } else {
    state.preset = PRESETS.includes(savedRange?.preset) ? savedRange.preset : 'last_14d';
    state.range = rangeForPreset(state.preset);
  }
  applyLanguage(state.settings.lang);
  const savedArrangement = store.get('arrangement', 'funnel');
  state.arrangement = ARRANGEMENTS.includes(savedArrangement) ? savedArrangement : 'funnel';
  bindChrome();

  try {
    scene = new FunnelGraphScene($('scene'), {
      onHover: (card, pos) =>
        ui.showTooltip(card, pos, currency(), $('stage'), tooltipExtra(card)),
      onSelect: selectCard,
      onLines: (th, commit) => matrix?.setThresholds(th, commit),
      onFrame: (s) => ui.positionRingLabels(s.projectRings(), state.focus, $('stage')),
      onInteract: () => ui.showTooltip(null),
    });
  } catch (err) {
    console.error(err);
    ui.setEmpty(true, 'WebGL', t('err.generic', { msg: 'this browser cannot draw the 3D view (WebGL is off).' }));
  }
  updateControlLabels();

  // The brand last looked at, when it ships with the page.
  const savedAccount = store.get('account', null);
  if (isDemoId(savedAccount)) state.accountId = savedAccount;

  if (!state.staticPage) {
    try {
      state.status = await api.status();
      if (state.status?.error?.kind === 'token') ui.toast(t('err.token', { msg: state.status.error.message }), { error: true, ms: 8000 });
      if (state.status?.connected) {
        const ids = (state.status.accounts || []).map((a) => a.id);
        const saved = store.get('account', null);
        state.accountId = ids.includes(saved) ? saved : isDemoId(saved) ? saved : state.status.defaultAccount && ids.includes(state.status.defaultAccount) ? state.status.defaultAccount : ids[0] || demoId(DEMO_BRANDS[0]);
      }
    } catch (err) {
      handleError(err);
    }
  }
  renderHeader();
  await load();
}

boot();

// Exposed for debugging from the console.
window.__funnelGraph = {
  state,
  get scene() {
    return scene;
  },
  DEMO_ACCOUNT,
  select(stackId) {
    if (state.arrangement === 'matrix' || state.arrangement === 'similarity') {
      const stack = state.model?.stacks.find((s) => s.id === stackId) || state.model?.stacks[0];
      if (stack) openDetail(stack, null);
      return;
    }
    const card = state.layout?.cards.find((c) => c.stack.id === stackId) || state.layout?.cards[0];
    if (card) selectCard(card);
  },
  get matrix() {
    return matrix;
  },
};
