// App entry: state, data loading (demo brand or live Meta through the local server),
// model building, and wiring between the 3D scene and the DOM overlays.

import { FunnelGraphScene } from './scene.js';
import { buildModel, groupStacks, placementHints, DEFAULT_SETTINGS, ARRANGEMENTS } from './model.js';
import { computeLayout } from './layout.js';
import { computeSignature } from './phash.js';
import { buildCardCanvases, placeholderCanvas } from './textures.js';
import { buildDemoSnapshot, buildDemoDetail, DEMO_ACCOUNT } from './demo/demo-data.js';
import { paintCreative } from './demo/painter.js';
import { api, isStatic } from './api.js';
import { bitsToHex, hexToBits } from './stacks.js';
import { t, setLanguage, detectLanguage, localeFor, applyStatic } from './i18n.js';
import * as fmt from './format.js';
import * as ui from './ui.js';
import { renderDetail, closeDetail } from './detail.js';
import { MatrixView, matrixDefaults, validThresholds } from './matrix.js';
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

const state = {
  staticPage: isStatic(),
  status: null,
  accountId: 'demo',
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
};

let scene = null;
let matrix = null;

// ---------- helpers ----------

const isDemo = () => state.accountId === 'demo';
const currency = () => state.model?.account?.currency || state.snapshot?.account?.currency || 'USD';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function accountName() {
  if (isDemo()) return t('account.demo');
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
      snapshot = buildDemoSnapshot(state.range);
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
      state.accountId = 'demo';
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
    const art = buildCardCanvases(source, { aspect, count: s.count, dashed: s.funnel.method !== 'segments', width });
    // The matrix draws the creative itself, at its own size.
    art.source = source;
    state.artwork.set(artKey(s), art);
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
  scene?.setPaused(isMatrix);
  if (isMatrix) return showMatrix();
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
  }
  ui.buildRingLabels(state.groups, pickGroup);
  renderOverlays();
  ui.setEmpty(model.stacks.length === 0);
}

/** Spend × ROAS: the creatives on two axes, split by the lines the user sets for this account. */
async function showMatrix() {
  const model = state.model;
  state.groups = [];
  state.focus = null;
  ui.setLoading(t('load.building'));
  await buildArtwork(model.stacks.map((stack) => ({ stack, h: 1 })));
  const sources = new Map(model.stacks.map((s) => [s.id, state.artwork.get(artKey(s))?.source]));
  const defaults = matrixDefaults(model.stacks);
  const saved = store.get('matrix:' + state.accountId, null);
  if (!matrix) {
    matrix = new MatrixView($('matrix'), {
      t,
      money: (v) => fmt.money(v, currency()),
      roas: fmt.roas,
      onSelect: (stack) => openDetail(stack, null),
      onChange: (th) => store.set('matrix:' + state.accountId, th),
    });
  }
  matrix.setData({ stacks: model.stacks, thresholds: validThresholds(saved) ? saved : defaults, defaults, sources });
  matrix.setSelected(state.selected);
  renderOverlays();
  ui.setEmpty(model.stacks.length === 0);
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
  scene?.setFocus(state.focus);
  renderOverlays();
}

function selectCard(card) {
  if (!card) {
    if (!$('detail').hidden) closeDrawer();
    return;
  }
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
  matrix?.setSelected(state.selected);
  const stage = $('stage');
  if (stage.clientWidth > 900) scene?.setInsetRight(Math.min(460, stage.clientWidth));
  // On a wide screen the matrix makes room for the drawer instead of sitting beneath it.
  $('matrix').classList.toggle('beside-detail', stage.clientWidth > 900);
  renderDetail($('detail'), {
    stack,
    group,
    model: state.model,
    live: !isDemo(),
    preview: previewFor,
    loadDetail: detailFor,
    onClose: closeDrawer,
  });
}

function closeDrawer() {
  state.selected = null;
  scene?.setSelected(null);
  matrix?.setSelected(null);
  $('matrix').classList.remove('beside-detail');
  scene?.setInsetRight(0);
  closeDetail($('detail'));
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
  const items = [{ heading: t('acc.title') }, { label: t('account.demo'), sub: t('acc.demoSub'), checked: isDemo(), onSelect: () => switchAccount('demo') }];
  const accounts = state.status?.accounts || [];
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
  const item = (a) => ({ label: t('arr.' + a), sub: a === 'matrix' ? t('arr.matrixSub') : undefined, checked: state.arrangement === a, onSelect: () => setArrangement(a) });
  const some = (list) => list.filter((a) => ARRANGEMENTS.includes(a)).map(item);
  const detected = some(['format', 'angle', 'persona', 'creator', 'hook']);
  const campaign = some(['campaign']);
  ui.openMenu(
    $('arrange-chip'),
    [
      { heading: t('arrange.title') },
      item('funnel'),
      ...(detected.length ? [{ separator: true }, { heading: t('arrange.detected') }, ...detected] : []),
      ...(campaign.length ? [{ separator: true }, ...campaign] : []),
      ...(ARRANGEMENTS.includes('matrix') ? [{ separator: true }, { heading: t('arrange.performance') }, item('matrix')] : []),
    ],
    { align: 'right' },
  );
}

async function setArrangement(a) {
  if (!ARRANGEMENTS.includes(a) || a === state.arrangement) return;
  state.arrangement = a;
  state.focus = null;
  store.set('arrangement', a);
  closeDrawer();
  await rebuildView();
  ui.setLoading(null);
}

function switchAccount(id) {
  if (id === state.accountId) return;
  state.accountId = id;
  store.set('account', id);
  if (id !== 'demo') api.saveConfig({ defaultAccount: id }).catch(() => {});
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
  state.accountId = 'demo';
  store.set('account', 'demo');
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
    matrix.destroy();
    matrix = null;
    if (state.arrangement === 'matrix' && state.model) showMatrix().then(() => ui.setLoading(null));
  }
}

function updateControlLabels() {
  const paused = scene && !scene.autoRotate;
  const pause = $('pause-btn');
  pause.title = paused ? t('ctl.play') : t('ctl.pause');
  pause.setAttribute('aria-label', pause.title);
  pause.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  $('reset-btn').title = t('ctl.reset');
  $('reset-btn').setAttribute('aria-label', t('ctl.reset'));
}

function bindChrome() {
  $('date-chip').addEventListener('click', openDateMenu);
  $('account-chip').addEventListener('click', openAccountMenu);
  $('arrange-chip').addEventListener('click', openArrangeMenu);
  $('connect-btn').addEventListener('click', openConnect);
  $('settings-btn').addEventListener('click', openSettings);
  $('refresh-btn').addEventListener('click', () => load({ refresh: true }));
  $('stat-pill').addEventListener('click', () => {
    if (state.focus) pickGroup(state.focus);
  });
  $('pause-btn').addEventListener('click', () => {
    scene?.setAutoRotate(!scene.autoRotate);
    updateControlLabels();
  });
  $('reset-btn').addEventListener('click', () => {
    state.focus = null;
    closeDrawer();
    scene?.resetView();
    renderOverlays();
  });
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
    else if (state.focus) pickGroup(state.focus);
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
      onHover: (card, pos) => ui.showTooltip(card, pos, currency(), $('stage')),
      onSelect: selectCard,
      onFrame: (s) => ui.positionRingLabels(s.projectRings(), state.focus, $('stage')),
      onInteract: () => ui.showTooltip(null),
    });
  } catch (err) {
    console.error(err);
    ui.setEmpty(true, 'WebGL', t('err.generic', { msg: 'this browser cannot draw the 3D view (WebGL is off).' }));
  }
  updateControlLabels();

  if (!state.staticPage) {
    try {
      state.status = await api.status();
      if (state.status?.error?.kind === 'token') ui.toast(t('err.token', { msg: state.status.error.message }), { error: true, ms: 8000 });
      if (state.status?.connected) {
        const ids = (state.status.accounts || []).map((a) => a.id);
        const saved = store.get('account', null);
        state.accountId = ids.includes(saved) ? saved : saved === 'demo' ? 'demo' : state.status.defaultAccount && ids.includes(state.status.defaultAccount) ? state.status.defaultAccount : ids[0] || 'demo';
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
    if (state.arrangement === 'matrix') {
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
