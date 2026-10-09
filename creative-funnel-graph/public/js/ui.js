// DOM overlays around the 3D stage: header chips, stats pill, arrange chip, legend,
// ring labels, tooltip, loading state, popover menus, modals and toasts.

import { t } from './i18n.js';
import * as fmt from './format.js';

const $ = (id) => document.getElementById(id);

export function svgIcon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function groupLabel(g) {
  if (g.label) return g.label;
  return t(g.labelKey, g.labelVars);
}

export function groupSublabel(g, currency) {
  if (g.sublabelKey) return t(g.sublabelKey);
  return t('group.sub', { ads: fmt.integer(g.adCount), roas: fmt.roas(g.roas) });
}

// ---------- header ----------

export function renderHeader({ accountName, connected, isStaticPage, range, presetKey }) {
  $('account-name').textContent = accountName;
  const chip = $('account-chip');
  chip.querySelector('.dot').className = 'dot ' + (connected ? 'dot-live' : 'dot-accent');
  const connect = $('connect-btn');
  connect.hidden = connected && !isStaticPage;
  connect.textContent = t('connect.cta');
  $('date-preset').textContent = t('date.' + presetKey);
  $('date-short').textContent = t('date.short.' + presetKey);
  $('date-range').textContent = t('date.range', { a: fmt.shortDate(range.since), b: fmt.shortDate(range.until) });
  $('refresh-btn').title = t('refresh');
  $('refresh-btn').setAttribute('aria-label', t('refresh'));
  $('settings-btn').title = t('settings');
  $('settings-btn').setAttribute('aria-label', t('settings'));
}

// ---------- stats pill ----------

export function renderPill(group, totals, currency) {
  const pill = $('stat-pill');
  const color = group?.color || 'var(--ink-3)';
  const name = group ? groupLabel(group) : t('pill.all');
  const count = group ? group.count : totals.cards;
  const spend = group ? group.spend : totals.spend;
  const roas = group ? group.roas : totals.roas;
  pill.replaceChildren(
    h('span', { class: 'stat-name' }, h('span', { class: 'dot', style: { background: color } }), name),
    h('span', {}, h('b', { text: fmt.integer(count) }), t('pill.creatives')),
    h('span', {}, h('b', { text: fmt.money(spend, currency) }), t('pill.spend')),
    h('span', {}, h('b', { text: fmt.roas(roas) }), t('pill.roas')),
  );
  pill.title = group ? t('pill.clear') : '';
  pill.setAttribute('aria-label', `${name}: ${fmt.integer(count)} ${t('pill.creatives')}, ${fmt.money(spend, currency)} ${t('pill.spend')}, ${fmt.roas(roas)} ROAS`);
}

export function renderArrange(arrangement) {
  $('arrange-value').textContent = t('arr.' + arrangement);
}

// ---------- legend ----------

export function renderLegend({ groups, arrangement, focusKey, currency, estimated, estimatedByNames, ads, cards, hidden, onPick }) {
  $('legend-title').textContent =
    arrangement === 'funnel' ? t('legend.funnel') : t('legend.groups', { dim: t('arr.' + arrangement) });
  const rows = $('legend-rows');
  rows.replaceChildren(
    ...groups.map((g) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            class: 'legend-row',
            type: 'button',
            'aria-pressed': String(focusKey === g.key),
            onclick: () => onPick(g.key),
          },
          h('span', { class: 'dot', style: { background: g.color } }),
          h('span', { class: 'lr-text' }, h('span', { class: 'lr-name', text: groupLabel(g) }), h('span', { class: 'lr-sub', text: groupSublabel(g, currency) })),
          h('span', { class: 'lr-num', text: fmt.integer(g.count) }),
          h('span', { class: 'lr-num lr-spend', text: fmt.money(g.spend, currency) }),
        ),
      ),
    ),
  );
  const foot = $('legend-foot');
  const parts = [];
  if (estimated > 0 && arrangement === 'funnel') {
    const line = h('span', {}, h('span', { class: 'dash' }), estimatedByNames ? t('legend.dashedNames', { n: estimated }) : t('legend.dashed', { n: estimated }));
    parts.push(line);
  }
  if (ads > cards) parts.push(h('span', { text: t('legend.entities', { ads: fmt.integer(ads), cards: fmt.integer(cards) }) }));
  if (hidden > 0) parts.push(h('span', { text: t('legend.hidden', { n: fmt.integer(hidden) }) }));
  foot.replaceChildren(...parts.flatMap((p, i) => (i ? [h('br'), p] : [p])));
  foot.hidden = parts.length === 0;
}

// ---------- ring labels ----------

let labelNodes = new Map();

export function buildRingLabels(groups, onPick) {
  const host = $('ring-labels');
  host.replaceChildren();
  labelNodes = new Map();
  for (const g of groups) {
    const node = h(
      'button',
      { class: 'ring-label', type: 'button', tabindex: '-1', onclick: () => onPick(g.key) },
      h('span', { class: 'rl-name' }, h('span', { class: 'dot', style: { background: g.color } }), groupLabel(g), h('span', { class: 'rl-count', text: fmt.integer(g.count) })),
      g.sublabelKey ? h('span', { class: 'rl-sub', text: t(g.sublabelKey) }) : null,
    );
    host.appendChild(node);
    labelNodes.set(g.key, node);
  }
}

/** Places labels in a fixed column at each ring's projected height, without overlaps. */
export function positionRingLabels(projected, focusKey, stage) {
  if (!labelNodes.size) return;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const narrow = W < 640;
  const colX = narrow ? W - 128 : Math.max(W * 0.62, W - 240);
  const minGap = narrow ? 22 : 38;
  const top = narrow ? 92 : 56;
  const bottom = H - (narrow ? 64 : 40);
  const items = projected
    .filter((p) => labelNodes.has(p.key))
    .map((p) => ({ ...p, node: labelNodes.get(p.key) }))
    .sort((a, b) => a.y - b.y);
  // Forward pass pushes down, backward pass pulls up, then clamp to the stage.
  let prev = -Infinity;
  for (const it of items) {
    it.ty = Math.max(it.y - 10, prev + minGap);
    prev = it.ty;
  }
  let next = Infinity;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.ty = Math.min(it.ty, next - minGap, bottom - (items.length - 1 - i) * minGap);
    next = it.ty;
  }
  items.forEach((it, i) => {
    it.ty = Math.max(it.ty, top + i * minGap);
    it.node.style.transform = `translate(${Math.round(colX)}px, ${Math.round(it.ty)}px)`;
    it.node.classList.toggle('dim', !!focusKey && focusKey !== it.key);
    it.node.classList.toggle('focus', focusKey === it.key);
  });
}

// ---------- tooltip ----------

export function showTooltip(card, pos, currency, stage, extra = null) {
  const tip = $('tooltip');
  if (!card || !pos) {
    tip.hidden = true;
    return;
  }
  const s = card.stack;
  const m = s.metrics;
  const rows = [
    [t('tt.spend'), fmt.money(m.spend, currency)],
    [t('tt.roas'), fmt.roas(m.roas)],
    [t('tt.freq'), fmt.ratio(m.frequency)],
  ];
  if (s.count > 1) rows.unshift([t('tt.ads'), fmt.integer(s.count)]);
  const note = s.funnel?.method === 'delivery' ? t('tt.delivery') : s.funnel?.method === 'names' ? t('tt.names') : null;
  tip.replaceChildren(
    h('div', { class: 'tt-name', text: s.rep.name || s.rep.id }),
    extra ? h('div', { class: 'tt-quad', style: { color: extra.color }, text: extra.text }) : null,
    ...rows.map(([k, v]) => h('div', { class: 'tt-row' }, k, h('b', { text: v }))),
    note ? h('div', { class: 'tt-note', text: note }) : null,
    h('div', { class: 'tt-note', text: t('tt.click') }),
  );
  tip.hidden = false;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const w = tip.offsetWidth;
  const hgt = tip.offsetHeight;
  let x = pos.x + 18;
  let y = pos.y - hgt / 2;
  if (x + w > W - 8) x = pos.x - w - 18;
  y = Math.max(8, Math.min(H - hgt - 8, y));
  tip.style.transform = `translate(${Math.round(Math.max(8, x))}px, ${Math.round(y)}px)`;
}

// ---------- loading / empty ----------

export function setLoading(text) {
  const box = $('loading');
  if (text === null) {
    box.classList.add('fade');
    setTimeout(() => {
      if (box.classList.contains('fade')) box.hidden = true;
    }, 320);
    return;
  }
  box.hidden = false;
  box.classList.remove('fade');
  $('loading-text').textContent = text;
}

export function setEmpty(show, title = t('empty.title'), body = t('empty.body')) {
  $('empty').hidden = !show;
  $('empty-title').textContent = title;
  $('empty-body').textContent = body;
}

// ---------- toast ----------

let toastTimer = null;
export function toast(message, { error = false, ms = 3800 } = {}) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

// ---------- popover menus ----------

let menuCleanup = null;

export function closeMenu() {
  if (menuCleanup) menuCleanup();
  menuCleanup = null;
}

/**
 * @param {HTMLElement} anchor
 * @param {Array<{heading?:string, separator?:boolean, label?:string, sub?:string, meta?:string, checked?:boolean, onSelect?:Function, node?:HTMLElement}>} items
 */
export function openMenu(anchor, items, { align = 'left' } = {}) {
  closeMenu();
  const pop = $('popover');
  pop.replaceChildren(
    ...items.map((it) => {
      if (it.separator) return h('div', { class: 'menu-sep', role: 'separator' });
      if (it.heading) return h('div', { class: 'menu-label', text: it.heading });
      if (it.node) return it.node;
      return h(
        'button',
        {
          class: 'menu-item',
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': String(!!it.checked),
          onclick: () => {
            closeMenu();
            it.onSelect?.();
          },
        },
        it.checked ? svgIcon('check') : h('span'),
        h('span', {}, it.label, it.sub ? h('span', { class: 'mi-sub', text: it.sub }) : null),
        it.meta ? h('span', { class: 'mi-meta', text: it.meta }) : h('span'),
      );
    }),
  );
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  let left = align === 'right' ? r.right - pw : r.left;
  left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
  let top = r.bottom + 6;
  if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  pop.querySelector('.menu-item')?.focus({ preventScroll: true });

  const onDoc = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      anchor.focus();
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
  document.addEventListener('keydown', onKey);
  menuCleanup = () => {
    pop.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDoc);
    document.removeEventListener('keydown', onKey);
  };
}

// ---------- modal ----------

let modalCleanup = null;

export function openModal(build) {
  closeModal();
  const backdrop = $('modal');
  const card = $('modal-card');
  card.replaceChildren();
  build(card);
  backdrop.hidden = false;
  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  const onClick = (e) => {
    if (e.target === backdrop) closeModal();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('pointerdown', onClick);
  modalCleanup = () => {
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKey);
    backdrop.removeEventListener('pointerdown', onClick);
  };
  setTimeout(() => card.querySelector('input, textarea, select, button.btn-primary')?.focus(), 30);
}

export function closeModal() {
  if (modalCleanup) modalCleanup();
  modalCleanup = null;
}

/** Copy to clipboard with a select-the-text fallback. */
export async function copyText(text, codeEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (codeEl) {
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return false;
  }
}
