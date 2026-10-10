// Small SVG charts for the detail drawer. One measure per chart (no dual axes), thin
// marks, hairline grid, text in ink tokens, and a hover layer on every chart.

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function niceMax(v) {
  if (!(v > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

/** Column whose top corners are rounded (4px) and bottom stays square on the baseline. */
function columnPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Bar growing right from the baseline, rounded at the data end only. */
function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, h / 2, w);
  if (w <= 0) return '';
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

function makeTip(wrap) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  wrap.appendChild(tip);
  return {
    show(x, y, lines) {
      tip.replaceChildren();
      lines.forEach(([value, label], i) => {
        if (i) tip.appendChild(document.createElement('br'));
        const b = document.createElement('b');
        b.textContent = value;
        const s = document.createElement('span');
        s.textContent = label ? ' ' + label : '';
        tip.append(b, s);
      });
      tip.hidden = false;
      const w = tip.offsetWidth;
      const maxX = wrap.clientWidth - w - 2;
      tip.style.transform = `translate(${Math.max(0, Math.min(maxX, x - w / 2))}px, ${Math.max(0, y - tip.offsetHeight - 10)}px)`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/**
 * Daily columns with a crosshair readout.
 * @param {{data:Array<{label:string, value:number, tip?:string}>, width:number, height?:number, color:string, format:(v:number)=>string, axisFormat?:(v:number)=>string}} o
 */
export function columnChart(o) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const W = Math.max(220, o.width);
  const H = o.height || 130;
  const m = { l: 40, r: 6, t: 8, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.label || '' }, wrap);
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const max = niceMax(Math.max(...o.data.map((d) => d.value), 0));
  const axisFmt = o.axisFormat || o.format;

  const grid = el('g', { class: 'grid' }, svg);
  for (let i = 0; i <= 2; i++) {
    const v = (max * i) / 2;
    const y = m.t + ph - (v / max) * ph;
    if (i > 0) el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y }, grid);
    const t = el('text', { x: m.l - 6, y: y + 3, 'text-anchor': 'end' }, svg);
    t.textContent = axisFmt(v);
  }
  el('line', { class: 'baseline', x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph }, svg);

  const n = o.data.length;
  const band = pw / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, band - 2));
  const bars = [];
  o.data.forEach((d, i) => {
    const h = (d.value / max) * ph;
    const x = m.l + i * band + (band - bw) / 2;
    const p = el('path', { d: columnPath(x, m.t + ph - h, bw, h), fill: o.color }, svg);
    bars.push(p);
  });
  const every = Math.ceil(n / Math.max(2, Math.floor(pw / 52)));
  o.data.forEach((d, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every) return;
    const t = el('text', { x: m.l + i * band + band / 2, y: H - 6, 'text-anchor': 'middle' }, svg);
    t.textContent = d.label;
  });

  const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph + m.b, fill: 'transparent' }, svg);
  const tip = makeTip(wrap);
  const onMove = (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x - m.l) / band)));
    const cx = m.l + i * band + band / 2;
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    bars.forEach((b, k) => b.setAttribute('opacity', k === i ? 1 : 0.55));
    const d = o.data[i];
    tip.show((cx / W) * r.width, ((m.t + ph - (d.value / max) * ph) / H) * r.height, [[o.format(d.value), d.tip || d.label]]);
  };
  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    bars.forEach((b) => b.setAttribute('opacity', 1));
    tip.hide();
  });
  return wrap;
}

/**
 * Line with an area wash, end dot and crosshair readout.
 * @param {{data:Array<{label:string, value:number|null, tip?:string}>, width:number, height?:number, color:string, format:Function, axisFormat?:Function, yMax?:number, refLine?:{value:number,label:string}}} o
 */
export function lineChart(o) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const W = Math.max(220, o.width);
  const H = o.height || 120;
  const m = { l: 40, r: 10, t: 10, b: 22 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.label || '' }, wrap);
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const vals = o.data.map((d) => d.value).filter((v) => Number.isFinite(v));
  const max = o.yMax || niceMax(Math.max(...vals, o.refLine?.value || 0, 0));
  const axisFmt = o.axisFormat || o.format;
  const n = o.data.length;
  const xAt = (i) => m.l + (n > 1 ? (i / (n - 1)) * pw : pw / 2);
  const yAt = (v) => m.t + ph - (Math.max(0, v) / max) * ph;

  const grid = el('g', { class: 'grid' }, svg);
  for (let i = 0; i <= 2; i++) {
    const v = (max * i) / 2;
    const y = yAt(v);
    if (i > 0) el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y }, grid);
    const t = el('text', { x: m.l - 6, y: y + 3, 'text-anchor': 'end' }, svg);
    t.textContent = axisFmt(v);
  }
  el('line', { class: 'baseline', x1: m.l, x2: W - m.r, y1: m.t + ph, y2: m.t + ph }, svg);

  if (o.refLine && o.refLine.value <= max) {
    const y = yAt(o.refLine.value);
    el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: 'rgba(255,255,255,0.28)', 'stroke-width': 1 }, svg);
    const t = el('text', { x: W - m.r, y: y - 4, 'text-anchor': 'end' }, svg);
    t.textContent = o.refLine.label;
  }

  const pts = o.data.map((d, i) => (Number.isFinite(d.value) ? [xAt(i), yAt(d.value)] : null));
  const valid = pts.filter(Boolean);
  if (valid.length) {
    const line = valid.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    const area = line + `L${valid[valid.length - 1][0].toFixed(1)},${m.t + ph}L${valid[0][0].toFixed(1)},${m.t + ph}Z`;
    el('path', { d: area, fill: o.color, 'fill-opacity': 0.1, stroke: 'none' }, svg);
    el('path', { d: line, fill: 'none', stroke: o.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    const end = valid[valid.length - 1];
    el('circle', { cx: end[0], cy: end[1], r: 4, fill: o.color, stroke: 'var(--panel-solid)', 'stroke-width': 2 }, svg);
  }

  const every = Math.ceil(n / Math.max(2, Math.floor(pw / 52)));
  o.data.forEach((d, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every) return;
    const t = el('text', { x: xAt(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, svg);
    t.textContent = d.label;
  });

  const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 4, fill: o.color, stroke: 'var(--panel-solid)', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const hit = el('rect', { x: m.l - 6, y: m.t, width: pw + 12, height: ph + m.b, fill: 'transparent' }, svg);
  const tip = makeTip(wrap);
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - m.l) / pw) * (n - 1))));
    const p = pts[i];
    const cx = xAt(i);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    if (p) {
      dot.setAttribute('cx', p[0]);
      dot.setAttribute('cy', p[1]);
      dot.setAttribute('visibility', 'visible');
    } else {
      dot.setAttribute('visibility', 'hidden');
    }
    const d = o.data[i];
    tip.show((cx / W) * r.width, ((p ? p[1] : m.t + ph) / H) * r.height, [[Number.isFinite(d.value) ? o.format(d.value) : '—', d.tip || d.label]]);
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hide();
  });
  return wrap;
}

/**
 * Part-to-whole bar with a 2px surface gap between segments and a legend below.
 * @param {{segments:Array<{label:string, value:number, color:string}>, width:number, format:Function}} o
 */
export function stackedBar(o) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const W = Math.max(220, o.width);
  const H = 22;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.label || '' }, wrap);
  const total = o.segments.reduce((s, x) => s + x.value, 0) || 1;
  const gap = 2;
  const live = o.segments.filter((s) => s.value > 0);
  const usable = W - gap * Math.max(0, live.length - 1);
  let x = 0;
  const tip = makeTip(wrap);
  live.forEach((s, i) => {
    const w = Math.max(1, (s.value / total) * usable);
    const first = i === 0;
    const last = i === live.length - 1;
    const r = 4;
    const d = `M${x + (first ? r : 0)},2H${x + w - (last ? r : 0)}${last ? `Q${x + w},2 ${x + w},${2 + r}V${H - 2 - r}Q${x + w},${H - 2} ${x + w - r},${H - 2}` : `V${H - 2}`}H${x + (first ? r : 0)}${first ? `Q${x},${H - 2} ${x},${H - 2 - r}V${2 + r}Q${x},2 ${x + r},2` : 'V2'}Z`;
    const p = el('path', { d, fill: s.color }, svg);
    const share = s.value / total;
    if (w > 46) {
      const t = el('text', { x: x + 8, y: H / 2 + 3.5, fill: '#111', style: 'fill:#111;font-weight:600' }, svg);
      t.textContent = Math.round(share * 100) + '%';
    }
    const cx = x + w / 2;
    p.addEventListener('pointermove', () => {
      const r2 = svg.getBoundingClientRect();
      tip.show((cx / W) * r2.width, 0, [[o.format(s.value) + ' · ' + Math.round(share * 100) + '%', s.label]]);
      p.setAttribute('opacity', 0.85);
    });
    p.addEventListener('pointerleave', () => {
      tip.hide();
      p.setAttribute('opacity', 1);
    });
    x += w + gap;
  });
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  for (const s of o.segments) {
    const item = document.createElement('span');
    const sw = document.createElement('i');
    sw.style.background = s.color;
    item.append(sw, document.createTextNode(`${s.label} ${o.format(s.value)} (${Math.round((s.value / total) * 100)}%)`));
    legend.appendChild(item);
  }
  wrap.appendChild(legend);
  return wrap;
}

/**
 * Horizontal bars with the value at the tip.
 * @param {{rows:Array<{label:string, value:number, note?:string}>, width:number, color:string, format:Function}} o
 */
export function barList(o) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const W = Math.max(220, o.width);
  const rowH = 26;
  const H = o.rows.length * rowH;
  const labelW = Math.min(150, W * 0.38);
  const valueW = 64;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.label || '' }, wrap);
  const max = Math.max(...o.rows.map((r) => r.value), 0) || 1;
  const pw = W - labelW - valueW;
  const tip = makeTip(wrap);
  o.rows.forEach((r, i) => {
    const y = i * rowH;
    const label = el('text', { x: 0, y: y + rowH / 2 + 3.5, class: 'value-label' }, svg);
    label.textContent = r.label;
    const w = (r.value / max) * pw;
    const bar = el('path', { d: barPath(labelW, y + 6, Math.max(2, w), rowH - 12), fill: o.color }, svg);
    const v = el('text', { x: labelW + Math.max(2, w) + 6, y: y + rowH / 2 + 3.5, class: 'value-label' }, svg);
    v.textContent = o.format(r.value);
    const hit = el('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', () => {
      const rr = svg.getBoundingClientRect();
      tip.show(((labelW + w / 2) / W) * rr.width, (y / H) * rr.height, [[o.format(r.value), r.note || r.label]]);
      bar.setAttribute('opacity', 0.8);
    });
    hit.addEventListener('pointerleave', () => {
      tip.hide();
      bar.setAttribute('opacity', 1);
    });
  });
  return wrap;
}
