// Spend × ROAS: every creative placed by what it spent (log scale) and what it returned,
// split by two lines the user sets, a spend threshold and a target ROAS. The four
// quadrants say what to do with each creative. Pure helpers first, then the controls over
// the stage; the 3D box itself is matrix3d.js, drawn by the scene.

/** Quadrant keys, in the order the summary lists them. */
export const QUADRANTS = ['scale', 'boost', 'fix', 'cut'];

/** Each quadrant's colour, the same as the --q-* tokens in styles.css. */
export const QUADRANT_COLORS = { scale: '#3fcf7f', boost: '#55a9f5', fix: '#eda43b', cut: '#e8605a' };

/** Rounds to 1, 2, 2.5 or 5 times a power of ten: a threshold people can read. */
export function niceNumber(x) {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const step = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.75 ? 2.5 : f < 7.5 ? 5 : 10;
  return step * p;
}

/** Two significant digits: what a spend line snaps to while it is dragged. */
export function roundSpend(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}

/** Reads "10k", "1,5k", "$12.000", "2,5", "1.2M" as numbers; null when it isn't one. */
export function parseAmount(text) {
  let s = String(text ?? '').trim().toLowerCase().replace(/[$€£\s]/g, '');
  if (!s) return null;
  let mult = 1;
  if (/k$/.test(s)) {
    mult = 1e3;
    s = s.slice(0, -1);
  } else if (/(mln|m)$/.test(s)) {
    mult = 1e6;
    s = s.replace(/(mln|m)$/, '');
  }
  // "12.000" and "12,000" are thousands; "2,5" and "2.5" are decimals.
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const v = Number(s) * mult;
  return Number.isFinite(v) ? v : null;
}

/** Starting lines: the median creative's spend, and the account's ROAS. */
export function matrixDefaults(stacks) {
  const spends = stacks.map((s) => s.metrics.spend).filter((v) => v > 0).sort((a, b) => a - b);
  const median = spends.length ? spends[Math.floor(spends.length / 2)] : 0;
  const spend = stacks.reduce((t, s) => t + s.metrics.spend, 0);
  const value = stacks.reduce((t, s) => t + (s.metrics.purchaseValue || 0), 0);
  return {
    spend: niceNumber(median) || 100,
    roas: spend > 0 ? Math.max(0.1, Math.round((value / spend) * 10) / 10) : 1,
  };
}

/** Accepts saved or typed lines only when both are usable numbers. */
export function validThresholds(th) {
  return !!th && Number.isFinite(th.spend) && th.spend > 0 && Number.isFinite(th.roas) && th.roas >= 0;
}

export function quadrantOf(metrics, th) {
  const good = (metrics.roas ?? 0) >= th.roas;
  const big = metrics.spend >= th.spend;
  return good ? (big ? 'scale' : 'boost') : big ? 'fix' : 'cut';
}

/** Creatives, ads, spend and ROAS per quadrant. */
export function summarizeQuadrants(stacks, th) {
  const out = Object.fromEntries(QUADRANTS.map((q) => [q, { count: 0, ads: 0, spend: 0, value: 0, roas: null, share: 0 }]));
  let total = 0;
  for (const s of stacks) {
    const q = out[quadrantOf(s.metrics, th)];
    q.count++;
    q.ads += s.count || 1;
    q.spend += s.metrics.spend;
    q.value += s.metrics.purchaseValue || 0;
    total += s.metrics.spend;
  }
  for (const q of Object.values(out)) {
    q.roas = q.spend > 0 ? q.value / q.spend : null;
    q.share = total > 0 ? q.spend / total : 0;
  }
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];
}

/** Room kept between a line and the edge of the plot, so the axes hold still while a line moves. */
const EDGE = 1.25;

/**
 * Axes for a plot of `w` × `h` pixels: spend on a log scale, ROAS from 0 to just past the
 * 97th percentile (a few outliers would flatten everyone else; they sit on the top edge).
 * The range grows to hold a line set outside the data, never because a line moved inside it.
 */
export function matrixScales(stacks, th, w, h) {
  const spends = stacks.map((s) => s.metrics.spend).filter((v) => v > 0).sort((a, b) => a - b);
  const roases = stacks.map((s) => s.metrics.roas ?? 0).sort((a, b) => a - b);
  const lo = Math.max(0.01, Math.min((spends[0] || 1) * 0.6, th.spend / EDGE));
  const hi = Math.max(lo * 10, (spends[spends.length - 1] || 1) * 1.6, th.spend * EDGE);
  const yMax = Math.max(1, quantile(roases, 0.97) * 1.12, th.roas * EDGE);
  const lx0 = Math.log10(lo);
  const lx1 = Math.log10(hi);
  const x = (v) => ((Math.log10(Math.max(lo, Math.min(hi, v))) - lx0) / (lx1 - lx0)) * w;
  const y = (v) => h - (Math.max(0, Math.min(yMax, v)) / yMax) * h;
  // Inverse, clamped so a dragged line stays where it leaves the axes as they are.
  const spendAt = (px) => Math.min(hi / EDGE, Math.max(lo * EDGE, Math.pow(10, lx0 + (px / w) * (lx1 - lx0))));
  const roasAt = (py) => Math.min(yMax / EDGE, Math.max(0, ((h - py) / h) * yMax));
  const xTicks = [];
  for (let e = Math.floor(lx0); e <= Math.ceil(lx1); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= lo && v <= hi) xTicks.push(v);
    }
  }
  const step = niceNumber(yMax / 5) || 1;
  const yTicks = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
  return { x, y, spendAt, roasAt, xTicks, yTicks, yMax, lo, hi };
}

// ---------- the view ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function resetIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon icon-sm');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-reset');
  svg.append(use);
  return svg;
}

/**
 * The matrix's controls over the 3D stage: the two lines as fields (typed, or moved with
 * − / +), the defaults, and the four quadrants summed; a quadrant pressed is zoomed to.
 * `onLines(lines, commit)` moves the planes (commit: keep them); `onQuadrant(q)` focuses.
 */
export class MatrixView {
  constructor(root, { t, money, roas, onLines, onQuadrant }) {
    this.root = root;
    this.t = t;
    // "$5,0k" reads better as "$5k" in a field.
    this.money = (v) => money(v).replace(/[.,]0(?=\s?[kM])/, '');
    this.roas = roas;
    this.onLines = onLines;
    this.onQuadrant = onQuadrant;
    this.stacks = [];
    this.th = { spend: 100, roas: 1 };
    this.defaults = this.th;
    this.only = null;
    this.build();
  }

  build() {
    const t = this.t;
    const field = (id, label, hint) => {
      const input = el('input', { class: 'input mx-input', id, inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', title: hint });
      return [input, el('label', { class: 'mx-field', for: id }, el('span', { class: 'mx-label', text: label }), input)];
    };
    const [spendInput, spendField] = field('mx-spend', t('mx.spend'), t('mx.spendHint'));
    const [roasInput, roasField] = field('mx-roas', t('mx.roas'), t('mx.roasHint'));
    this.spendInput = spendInput;
    this.roasInput = roasInput;
    const commit = () => {
      const spend = parseAmount(spendInput.value);
      const roas = parseAmount(roasInput.value);
      this.setThresholds({ spend: spend > 0 ? spend : this.th.spend, roas: roas !== null ? roas : this.th.roas }, true);
    };
    for (const input of [spendInput, roasInput]) {
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commit();
        input.blur();
      });
    }
    const nudge = (key, up) => {
      const v = this.th[key];
      const next = key === 'spend' ? roundSpend(up ? v * 1.25 : v / 1.25) : Math.max(0, Math.round((v + (up ? 0.1 : -0.1)) * 10) / 10);
      this.setThresholds({ ...this.th, [key]: next }, true);
    };
    const step = (key, up) => el('button', { class: 'icon-btn icon-btn-sm mx-step', type: 'button', text: up ? '+' : '−', 'aria-label': `${t(key === 'spend' ? 'mx.spend' : 'mx.roas')} ${up ? '+' : '−'}`, onclick: () => nudge(key, up) });
    this.controls = el(
      'form',
      { class: 'mx-controls', onsubmit: (e) => e.preventDefault() },
      el('div', { class: 'mx-group' }, spendField, step('spend', false), step('spend', true)),
      el('div', { class: 'mx-group' }, roasField, step('roas', false), step('roas', true)),
      el('button', { class: 'chip mx-reset', type: 'button', title: t('mx.reset'), 'aria-label': t('mx.reset'), onclick: () => this.setThresholds(this.defaults, true) }, resetIcon(), el('span', { text: t('mx.reset') })),
      el('p', { class: 'mx-hint', text: t('mx.hint') }),
    );
    this.summary = el('div', { class: 'mx-summary', role: 'group', 'aria-label': t('mx.summary') });
    this.root.replaceChildren(this.controls, this.summary);
  }

  setData({ stacks, thresholds, defaults, quadrant = null }) {
    this.stacks = stacks;
    this.defaults = defaults;
    this.th = { ...thresholds };
    this.only = quadrant;
    this.render();
  }

  /** New lines from a field, a step, the defaults or a dragged plane. */
  setThresholds(th, commit) {
    if (!validThresholds(th)) return;
    this.th = { spend: th.spend, roas: th.roas };
    this.render();
    this.onLines?.(this.th, commit);
  }

  /** Shows one quadrant (zoomed to); the same quadrant again shows them all. */
  showOnly(q) {
    this.only = this.only === q ? null : q;
    this.render();
    this.onQuadrant?.(this.only);
  }

  render() {
    if (document.activeElement !== this.spendInput) this.spendInput.value = this.money(this.th.spend);
    if (document.activeElement !== this.roasInput) this.roasInput.value = this.roas(this.th.roas);
    const sum = summarizeQuadrants(this.stacks, this.th);
    this.summary.replaceChildren(
      ...QUADRANTS.map((q) =>
        el(
          'button',
          { class: `mx-row mx-row-${q}`, type: 'button', 'aria-pressed': String(this.only === q), onclick: () => this.showOnly(q) },
          el('span', { class: 'mx-row-name', text: `${this.t('mx.q.' + q)} · ${sum[q].count}` }),
          el('span', { class: 'mx-row-do', text: this.t('mx.do.' + q) }),
          el('span', {
            class: 'mx-row-nums',
            text: this.t('mx.row', { n: sum[q].count, spend: this.money(sum[q].spend), share: Math.round(sum[q].share * 100), roas: this.roas(sum[q].roas) }),
          }),
        ),
      ),
    );
  }
}
