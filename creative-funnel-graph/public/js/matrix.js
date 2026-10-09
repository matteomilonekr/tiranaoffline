// Spend × ROAS: every creative placed by what it spent (log scale) and what it returned,
// split by two lines the user sets, a spend threshold and a target ROAS. The four
// quadrants say what to do with each creative. Pure helpers first; the view is DOM.

/** Quadrant keys, in the order the summary lists them. */
export const QUADRANTS = ['scale', 'boost', 'fix', 'cut'];

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

/** Pushes overlapping cards apart; each keeps a dot at its exact point and stays near it. */
export function relaxCards(cards, w, h, iterations = 60) {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < cards.length; i++) {
      const a = cards[i];
      for (let j = i + 1; j < cards.length; j++) {
        const b = cards[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const ox = (a.w + b.w) / 2 + 2 - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Separate along the axis that needs the smaller move; ties push the later card right or down.
        if (ox < oy) {
          const s = (dx >= 0 ? 1 : -1) * ox * 0.5;
          a.cx -= s;
          b.cx += s;
        } else {
          const s = (dy >= 0 ? 1 : -1) * oy * 0.5;
          a.cy -= s;
          b.cy += s;
        }
      }
    }
    for (const c of cards) {
      const dx = c.cx - c.px;
      const dy = c.cy - c.py;
      const d = Math.hypot(dx, dy);
      const max = Math.max(c.w, c.h) * 1.6;
      if (d > max) {
        c.cx = c.px + (dx / d) * max;
        c.cy = c.py + (dy / d) * max;
      }
      c.cx = Math.max(c.w / 2, Math.min(w - c.w / 2, c.cx));
      c.cy = Math.max(c.h / 2, Math.min(h - c.h / 2, c.cy));
    }
    if (!moved) break;
  }
  return cards;
}

// ---------- the view ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawCover(canvas, source) {
  const ctx = canvas.getContext('2d');
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) return;
  const scale = Math.max(canvas.width / sw, canvas.height / sh);
  const cw = canvas.width / scale;
  const ch = canvas.height / scale;
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
}

/**
 * The Spend × ROAS view. `t` translates, `money` and `roas` format, `onSelect(stack)` opens a
 * creative, `onChange(lines)` keeps the lines the user set.
 */
export class MatrixView {
  constructor(root, { t, money, roas, onSelect, onChange }) {
    this.root = root;
    this.t = t;
    // "$5,0k" reads better as "$5k" on an axis and in a field.
    this.money = (v) => money(v).replace(/[.,]0(?=\s?[kM])/, '');
    this.roas = roas;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.stacks = [];
    this.th = { spend: 100, roas: 1 };
    this.defaults = this.th;
    this.sources = new Map();
    this.nodes = new Map();
    this.selected = null;
    this.only = null;
    this.build();
    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(this.plot);
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
    this.controls = el(
      'form',
      { class: 'mx-controls', onsubmit: (e) => e.preventDefault() },
      spendField,
      roasField,
      el('button', { class: 'chip mx-reset', type: 'button', text: t('mx.reset'), onclick: () => this.setThresholds(this.defaults, true) }),
      el('p', { class: 'mx-hint', text: t('mx.hint') }),
    );
    this.svg = svg('svg', { class: 'mx-svg', 'aria-hidden': 'true' });
    this.cards = el('div', { class: 'mx-cards' });
    this.vline = el('div', { class: 'mx-line mx-vline', role: 'slider', tabindex: '0', 'aria-label': t('mx.spend') }, el('span', { class: 'mx-tag' }));
    this.hline = el('div', { class: 'mx-line mx-hline', role: 'slider', tabindex: '0', 'aria-label': t('mx.roas') }, el('span', { class: 'mx-tag' }));
    this.plot = el('div', { class: 'mx-plot' }, this.svg, this.cards, this.vline, this.hline);
    this.summary = el('div', { class: 'mx-summary', role: 'group', 'aria-label': t('mx.summary') });
    this.root.replaceChildren(this.controls, this.plot, this.summary);

    this.drag(this.vline, (px) => ({ spend: roundSpend(this.scales.spendAt(px)), roas: this.th.roas }));
    this.drag(this.hline, (_, py) => ({ spend: this.th.spend, roas: Math.round(this.scales.roasAt(py) * 20) / 20 }));
    const nudge = (key, up) => {
      const v = this.th[key];
      const next = key === 'spend' ? roundSpend(up ? v * 1.2 : v / 1.2) : Math.max(0, Math.round((v + (up ? 0.1 : -0.1)) * 10) / 10);
      this.setThresholds({ ...this.th, [key]: next }, true);
    };
    this.vline.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      nudge('spend', e.key === 'ArrowRight');
    });
    this.hline.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      nudge('roas', e.key === 'ArrowUp');
    });
  }

  drag(handle, toThresholds) {
    let active = false;
    handle.addEventListener('pointerdown', (e) => {
      active = true;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');
      this.root.classList.add('mx-dragging');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!active || !this.scales) return;
      const r = this.plot.getBoundingClientRect();
      this.setThresholds(toThresholds(e.clientX - r.left - this.pad.l, e.clientY - r.top - this.pad.t), false);
    });
    const end = () => {
      if (!active) return;
      active = false;
      handle.classList.remove('dragging');
      this.root.classList.remove('mx-dragging');
      this.onChange?.(this.th);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** `sources`: stack id → the creative's image or canvas. */
  setData({ stacks, thresholds, defaults, sources }) {
    this.stacks = stacks;
    this.defaults = defaults;
    this.th = { ...thresholds };
    this.sources = sources || new Map();
    this.nodes = new Map();
    this.cards.replaceChildren();
    this.layout();
  }

  setSelected(id) {
    this.selected = id;
    for (const [sid, n] of this.nodes) n.btn.classList.toggle('selected', sid === id);
  }

  setThresholds(th, commit) {
    if (!validThresholds(th)) return;
    this.th = { spend: th.spend, roas: th.roas };
    this.layout();
    if (commit) this.onChange?.(this.th);
  }

  /** Shows one quadrant's cards only; the same quadrant again shows them all. */
  showOnly(q) {
    this.only = this.only === q ? null : q;
    this.layout();
  }

  node(s, w, h) {
    let n = this.nodes.get(s.id);
    if (!n) {
      const btn = el('button', { class: 'mx-card', type: 'button', 'data-id': s.id, onclick: () => this.onSelect?.(s) });
      if (s.count > 1) btn.append(el('span', { class: 'mx-count', text: s.count + '×' }));
      n = { btn, canvas: null, w: 0, h: 0 };
      this.nodes.set(s.id, n);
    }
    const source = this.sources.get(s.id);
    if (source && (Math.abs(n.w - w) > 0.5 || Math.abs(n.h - h) > 0.5)) {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const canvas = n.canvas || document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(w * dpr));
      canvas.height = Math.max(2, Math.round(h * dpr));
      drawCover(canvas, source);
      if (!n.canvas) n.btn.prepend(canvas);
      n.canvas = canvas;
      n.w = w;
      n.h = h;
    }
    return n;
  }

  layout() {
    const rect = this.plot.getBoundingClientRect();
    if (!rect.width || !rect.height || !this.stacks.length) return;
    const narrow = rect.width < 560;
    this.pad = { l: narrow ? 40 : 52, r: 12, t: 10, b: narrow ? 34 : 40 };
    const w = rect.width - this.pad.l - this.pad.r;
    const h = rect.height - this.pad.t - this.pad.b;
    const sc = matrixScales(this.stacks, this.th, w, h);
    this.scales = sc;
    const { l, t } = this.pad;
    const tx = sc.x(this.th.spend);
    const ty = sc.y(this.th.roas);
    if (document.activeElement !== this.spendInput) this.spendInput.value = this.money(this.th.spend);
    if (document.activeElement !== this.roasInput) this.roasInput.value = this.roas(this.th.roas);
    const sum = summarizeQuadrants(this.stacks, this.th);

    // Quadrant washes, grid, ticks and axis names.
    const g = svg('g', { transform: `translate(${l} ${t})` });
    const wash = (x0, y0, x1, y1, q) =>
      g.append(svg('rect', { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0), class: `mx-wash mx-wash-${q}${this.only && this.only !== q ? ' dim' : ''}` }));
    wash(tx, 0, w, ty, 'scale');
    wash(0, 0, tx, ty, 'boost');
    wash(tx, ty, w, h, 'fix');
    wash(0, ty, tx, h, 'cut');
    for (const v of sc.yTicks) {
      const y = sc.y(v);
      g.append(svg('line', { x1: 0, x2: w, y1: y, y2: y, class: 'mx-grid' }));
      g.append(svg('text', { x: -7, y: y + 4, class: 'mx-tick mx-tick-y' }, this.roas(v)));
    }
    const minGap = narrow ? 38 : 46;
    let lastX = -Infinity;
    for (const v of sc.xTicks) {
      const x = sc.x(v);
      g.append(svg('line', { x1: x, x2: x, y1: 0, y2: h, class: 'mx-grid' }));
      if (x - lastX < minGap) continue;
      lastX = x;
      const anchor = x > w - 24 ? 'end' : x < 16 ? 'start' : 'middle';
      g.append(svg('text', { x, y: h + 17, class: 'mx-tick mx-tick-x', 'text-anchor': anchor }, this.money(v)));
    }
    g.append(svg('text', { x: w, y: h + (narrow ? 31 : 35), class: 'mx-axis mx-axis-x' }, this.t('mx.axis.spend')));
    g.append(svg('text', { x: -h / 2, y: -l + 12, class: 'mx-axis mx-axis-y', transform: 'rotate(-90)' }, this.t('mx.axis.roas')));
    // Quadrant names in the corners; on a phone the summary beneath the plot names them.
    if (!narrow) {
      const corner = (q, x, y, anchor) => g.append(svg('text', { x, y, class: `mx-qname mx-qname-${q}`, 'text-anchor': anchor }, `${this.t('mx.q.' + q)} · ${sum[q].count}`));
      corner('scale', w - 8, 17, 'end');
      corner('boost', 8, 17, 'start');
      corner('fix', w - 8, h - 9, 'end');
      corner('cut', 8, h - 9, 'start');
    }

    // Cards: sized by spend, nudged apart where they overlap, a dot and a leader at the exact point.
    const maxSpend = Math.max(1, ...this.stacks.map((s) => s.metrics.spend));
    const base = narrow ? 15 : 22;
    const span = narrow ? 20 : 30;
    const shown = this.stacks.filter((s) => !this.only || quadrantOf(s.metrics, this.th) === this.only);
    const cards = shown.map((s) => {
      const px = sc.x(s.metrics.spend);
      const py = sc.y(s.metrics.roas ?? 0);
      const aspect = Math.max(0.56, Math.min(1.5, s.rep?.creative?.aspect || 0.8));
      const ch = base + span * Math.sqrt(s.metrics.spend / maxSpend);
      return { s, px, py, cx: px, cy: py, w: Math.round(ch * aspect), h: Math.round(ch) };
    });
    relaxCards(cards, w, h);
    const marks = svg('g', { class: 'mx-marks' });
    for (const c of cards) {
      const q = quadrantOf(c.s.metrics, this.th);
      if (Math.hypot(c.cx - c.px, c.cy - c.py) > Math.min(c.w, c.h) / 2) marks.append(svg('line', { x1: c.px, y1: c.py, x2: c.cx, y2: c.cy, class: 'mx-leader' }));
      marks.append(svg('circle', { cx: c.px, cy: c.py, r: 2.4, class: `mx-dot mx-dot-${q}` }));
    }
    g.append(marks);
    this.svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    this.svg.replaceChildren(g);

    const order = [];
    for (const c of cards) {
      const s = c.s;
      const q = quadrantOf(s.metrics, this.th);
      const n = this.node(s, c.w, c.h);
      const label = `${s.rep?.name || s.id} · ${this.t('mx.q.' + q)} · ${this.money(s.metrics.spend)} · ROAS ${this.roas(s.metrics.roas)}${s.count > 1 ? ` · ${s.count} ads` : ''}`;
      n.btn.className = `mx-card mx-card-${q}${s.id === this.selected ? ' selected' : ''}${s.count > 1 ? ' stacked' : ''}${c.h < 28 ? ' tiny' : ''}`;
      n.btn.title = label;
      n.btn.setAttribute('aria-label', label);
      Object.assign(n.btn.style, { left: `${l + c.cx - c.w / 2}px`, top: `${t + c.cy - c.h / 2}px`, width: `${c.w}px`, height: `${c.h}px` });
      order.push({ n, area: c.w * c.h });
    }
    // Small cards on top, so none hides beneath a bigger neighbour.
    order.sort((a, b) => b.area - a.area);
    this.cards.replaceChildren(...order.map((o) => o.n.btn));

    // The two lines with their values.
    Object.assign(this.vline.style, { left: `${l + tx}px`, top: `${t}px`, height: `${h}px` });
    this.vline.firstChild.textContent = this.money(this.th.spend);
    Object.assign(this.hline.style, { left: `${l}px`, top: `${t + ty}px`, width: `${w}px` });
    this.hline.firstChild.textContent = 'ROAS ' + this.roas(this.th.roas);
    this.vline.setAttribute('aria-valuetext', this.money(this.th.spend));
    this.hline.setAttribute('aria-valuetext', this.roas(this.th.roas));

    this.summary.replaceChildren(
      ...QUADRANTS.map((q) =>
        el(
          'button',
          { class: `mx-row mx-row-${q}`, type: 'button', 'aria-pressed': String(this.only === q), onclick: () => this.showOnly(q) },
          el('span', { class: 'mx-row-name', text: this.t('mx.q.' + q) }),
          el('span', { class: 'mx-row-do', text: this.t('mx.do.' + q) }),
          el('span', {
            class: 'mx-row-nums',
            text: this.t('mx.row', { n: sum[q].count, spend: this.money(sum[q].spend), share: Math.round(sum[q].share * 100), roas: this.roas(sum[q].roas) }),
          }),
        ),
      ),
    );
  }

  destroy() {
    this.resize.disconnect();
  }
}
