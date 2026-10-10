// Lines that draw themselves and shapes that turn into other shapes: the SVG stroke-dashoffset draw-on and the
// morphs of the Opus 5.5 prompts, done on polylines so the length of any part is known at any t. A shape is a
// list of polylines (one per subpath); they come from SVG path data (svg()), from text outlines (glyphs()) or
// from the generators below (circle, poly, star, blob).
import { textPathCommands } from '../engine/type';
import { clamp, hash, lerp, noise1, TAU, type V2 } from '../engine/util';

export type Poly = { pts: V2[]; closed: boolean };
export type Shape = Poly[];

function cubic(out: V2[], p0: V2, p1: V2, p2: V2, p3: V2, tol: number) {
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const n = Math.max(2, Math.min(64, Math.ceil(len / tol)));
  for (let i = 1; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push({ x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x, y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y });
  }
}
const quad = (out: V2[], p0: V2, q: V2, p: V2, tol: number) =>
  cubic(out, p0, { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) }, { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, p, tol);

/** An SVG elliptical arc (endpoint form) flattened into out, after the spec's centre conversion. */
function arc(out: V2[], p0: V2, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p: V2, tol: number) {
  if (rx === 0 || ry === 0) { out.push(p); return; }
  const phi = (phiDeg * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
  const dx = (p0.x - p.x) / 2, dy = (p0.y - p.y) / 2;
  const x1 = cs * dx + sn * dy, y1 = -sn * dx + cs * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1) / ry, cyp = (-k * ry * x1) / rx;
  const cx = cs * cxp - sn * cyp + (p0.x + p.x) / 2, cy = sn * cxp + cs * cyp + (p0.y + p.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const a1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let da = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && da > 0) da -= TAU;
  if (sweep && da < 0) da += TAU;
  const n = Math.max(2, Math.ceil((Math.abs(da) * Math.max(rx, ry)) / tol));
  for (let i = 1; i <= n; i++) {
    const a = a1 + (da * i) / n;
    out.push({ x: cx + rx * Math.cos(a) * cs - ry * Math.sin(a) * sn, y: cy + rx * Math.cos(a) * sn + ry * Math.sin(a) * cs });
  }
}

/**
 * SVG path data ("M10 10 C 20 20, 40 20, 50 10 Z", all commands, absolute and relative) as a shape, scaled by
 * `scale` and moved by (ox, oy). `tol` is the flattening step in output pixels.
 */
export function svg(d: string, o: { scale?: number; ox?: number; oy?: number; tol?: number } = {}): Shape {
  const sc = o.scale ?? 1, ox = o.ox ?? 0, oy = o.oy ?? 0, tol = (o.tol ?? 3) / sc;
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
  const shape: Shape = [];
  let cur: V2[] | null = null, pos: V2 = { x: 0, y: 0 }, start: V2 = { x: 0, y: 0 }, lastC: V2 | null = null, lastQ: V2 | null = null;
  let i = 0, cmd = '';
  const num = () => parseFloat(toks[i++]!);
  const flush = (closed: boolean) => { if (cur && cur.length > 1) shape.push({ pts: cur, closed }); cur = null; };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i]!)) cmd = toks[i++]!;
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const pt = (): V2 => { const x = num(), y = num(); return rel ? { x: pos.x + x, y: pos.y + y } : { x, y }; };
    if (C === 'Z') { if (cur) { cur.push({ ...start }); flush(true); } pos = { ...start }; lastC = lastQ = null; continue; }
    if (C === 'M') { flush(false); pos = pt(); start = { ...pos }; cur = [{ ...pos }]; cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
    if (!cur) cur = [{ ...pos }];
    if (C === 'L') { pos = pt(); cur.push(pos); lastC = lastQ = null; }
    else if (C === 'H') { const x = num(); pos = { x: rel ? pos.x + x : x, y: pos.y }; cur.push(pos); lastC = lastQ = null; }
    else if (C === 'V') { const y = num(); pos = { x: pos.x, y: rel ? pos.y + y : y }; cur.push(pos); lastC = lastQ = null; }
    else if (C === 'C') { const c1 = pt(), c2 = pt(), p = pt(); cubic(cur, pos, c1, c2, p, tol); lastC = c2; lastQ = null; pos = p; }
    else if (C === 'S') { const c1 = lastC ? { x: 2 * pos.x - lastC.x, y: 2 * pos.y - lastC.y } : { ...pos }; const c2 = pt(), p = pt(); cubic(cur, pos, c1, c2, p, tol); lastC = c2; lastQ = null; pos = p; }
    else if (C === 'Q') { const q = pt(), p = pt(); quad(cur, pos, q, p, tol); lastQ = q; lastC = null; pos = p; }
    else if (C === 'T') { const q: V2 = lastQ ? { x: 2 * pos.x - lastQ.x, y: 2 * pos.y - lastQ.y } : { ...pos }; const p = pt(); quad(cur, pos, q, p, tol); lastQ = q; lastC = null; pos = p; }
    else if (C === 'A') { const rx = num(), ry = num(), rot = num(), la = num() !== 0, sw = num() !== 0; const p = pt(); arc(cur, pos, rx, ry, rot, la, sw, p, tol); pos = p; lastC = lastQ = null; }
    else { i++; }
  }
  flush(false);
  return shape.map((p) => ({ closed: p.closed, pts: p.pts.map((q) => ({ x: ox + q.x * sc, y: oy + q.y * sc })) }));
}

/** The outlines of text (left end of the baseline at (x, y)) as a shape: each contour of each letter. */
export function glyphs(text: string, family: string, size: number, x = 0, y = 0, tol = 2): Shape {
  const shape: Shape = [];
  let cur: V2[] | null = null, pos: V2 = { x: 0, y: 0 };
  for (const c of textPathCommands(text, family, size, x, y) as any[]) {
    if (c.type === 'M') { if (cur && cur.length > 1) shape.push({ pts: cur, closed: true }); pos = { x: c.x, y: c.y }; cur = [pos]; }
    else if (c.type === 'L') { pos = { x: c.x, y: c.y }; cur!.push(pos); }
    else if (c.type === 'C') { const p = { x: c.x, y: c.y }; cubic(cur!, pos, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, p, tol); pos = p; }
    else if (c.type === 'Q') { const p = { x: c.x, y: c.y }; quad(cur!, pos, { x: c.x1, y: c.y1 }, p, tol); pos = p; }
    else if (c.type === 'Z') { if (cur && cur.length > 1) { cur.push({ ...cur[0]! }); shape.push({ pts: cur, closed: true }); } cur = null; }
  }
  if (cur && cur.length > 1) shape.push({ pts: cur, closed: true });
  return shape;
}

// ------------------------------------------------------------------ generators
export const circle = (cx: number, cy: number, r: number, n = 96): Shape => [{ closed: true, pts: Array.from({ length: n + 1 }, (_, i) => ({ x: cx + r * Math.cos((i / n) * TAU - Math.PI / 2), y: cy + r * Math.sin((i / n) * TAU - Math.PI / 2) })) }];
export const poly = (cx: number, cy: number, r: number, sides: number, rot = 0): Shape => [{ closed: true, pts: Array.from({ length: sides + 1 }, (_, i) => ({ x: cx + r * Math.cos(rot + (i / sides) * TAU - Math.PI / 2), y: cy + r * Math.sin(rot + (i / sides) * TAU - Math.PI / 2) })) }];
export const star = (cx: number, cy: number, r1: number, r2: number, points = 5, rot = 0): Shape => [{ closed: true, pts: Array.from({ length: points * 2 + 1 }, (_, i) => { const r = i % 2 ? r2 : r1, a = rot + (i / (points * 2)) * TAU - Math.PI / 2; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }) }];
/** A soft blob that breathes with t (noise on the radius). */
export const blob = (cx: number, cy: number, r: number, t: number, o: { wobble?: number; speed?: number; seed?: number; n?: number } = {}): Shape => {
  const n = o.n ?? 96, w = o.wobble ?? 0.18, sp = o.speed ?? 0.4, sd = o.seed ?? 1;
  return [{ closed: true, pts: Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * TAU; const k = 1 + w * (noise1(Math.cos(a) * 1.3 + t * sp, sd) + 0.5 * noise1(Math.sin(a) * 2.1 - t * sp, sd + 7) - 0.25); return { x: cx + r * k * Math.cos(a - Math.PI / 2), y: cy + r * k * Math.sin(a - Math.PI / 2) }; }) }];
};

// ------------------------------------------------------------------ lengths, draw-on, morph
const lens = (pts: V2[]) => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)); return L; };
export const length = (s: Shape) => s.reduce((a, p) => a + lens(p.pts).at(-1)!, 0);

/** The first `len` px of a polyline (and the point where it stops). */
function partial(pts: V2[], L: number[], len: number): { pts: V2[]; head: V2 & { angle: number } } {
  const out: V2[] = [pts[0]!];
  let i = 1;
  while (i < pts.length && L[i]! <= len) out.push(pts[i++]!);
  let head = { ...out.at(-1)!, angle: 0 };
  if (i < pts.length) {
    const a = pts[i - 1]!, b = pts[i]!, u = (len - L[i - 1]!) / Math.max(1e-6, L[i]! - L[i - 1]!);
    head = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    out.push(head);
  } else if (pts.length > 1) { const a = pts.at(-2)!, b = pts.at(-1)!; head.angle = Math.atan2(b.y - a.y, b.x - a.x); }
  return { pts: out, head };
}

/**
 * Strokes the drawn part of a shape: u in 0..1 of its whole length. `order: 'together'` draws every subpath at
 * once (each from its own start), 'sequence' one after another like a pen. `from` > 0 erases the tail too (a
 * travelling dash: draw u = 0.6 with from = 0.4). Returns the pen's head, to put a dot or a spark on it.
 */
export function drawOn(x: CanvasRenderingContext2D, s: Shape, u: number, o: { order?: 'together' | 'sequence'; from?: number; color?: string; width?: number; cap?: CanvasLineCap; fill?: string; fillFrom?: number } = {}): (V2 & { angle: number }) | null {
  u = clamp(u);
  const a0 = clamp(o.from ?? 0);
  x.save();
  x.strokeStyle = o.color ?? '#ffffff';
  x.lineWidth = o.width ?? 4;
  x.lineCap = o.cap ?? 'round';
  x.lineJoin = 'round';
  // a fill that fades in once the outline is nearly done (logo reveals)
  if (o.fill && u > (o.fillFrom ?? 0.85)) {
    x.save();
    x.globalAlpha *= clamp((u - (o.fillFrom ?? 0.85)) / (1 - (o.fillFrom ?? 0.85)));
    x.fillStyle = o.fill;
    x.beginPath();
    for (const p of s) { p.pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y))); if (p.closed) x.closePath(); }
    x.fill('evenodd');
    x.restore();
  }
  let head: (V2 & { angle: number }) | null = null;
  const Ls = s.map((p) => lens(p.pts));
  const total = Ls.reduce((a, L) => a + L.at(-1)!, 0);
  const strokeSeg = (pts: V2[], L: number[], la: number, lb: number) => {
    if (lb <= la) return;
    const b = partial(pts, L, lb), a = la > 0 ? partial(pts, L, la) : null;
    let seg = b.pts;
    if (a) { const k = a.pts.length - 1; seg = [a.head, ...b.pts.slice(k)]; }
    x.beginPath();
    seg.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)));
    x.stroke();
    head = b.head;
  };
  if ((o.order ?? 'together') === 'together') {
    s.forEach((p, k) => { const L = Ls[k]!, tot = L.at(-1)!; strokeSeg(p.pts, L, a0 * tot, u * tot); });
  } else {
    let acc = 0;
    s.forEach((p, k) => { const L = Ls[k]!, tot = L.at(-1)!; strokeSeg(p.pts, L, clamp(a0 * total - acc, 0, tot), clamp(u * total - acc, 0, tot)); acc += tot; });
  }
  x.restore();
  return head;
}

/** n points spread evenly along a closed or open polyline. */
export function resample(p: Poly, n: number): V2[] {
  const L = lens(p.pts), tot = L.at(-1)!, out: V2[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (tot * i) / (p.closed ? n : n - 1);
    while (j < L.length - 1 && L[j]! < s) j++;
    const a = p.pts[j - 1]!, b = p.pts[j]!, u = (s - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!);
    out.push({ x: lerp(a.x, b.x, clamp(u)), y: lerp(a.y, b.y, clamp(u)) });
  }
  return out;
}

/**
 * Prepares a morph between two shapes (each taken as its longest contour): both resampled to n points, the
 * second rotated to the start that lines up best with the first, so nothing twists. Call once, then at(u).
 */
export function morph(a: Shape, b: Shape, n = 160) {
  const longest = (s: Shape) => s.reduce((m, p) => (lens(p.pts).at(-1)! > lens(m.pts).at(-1)! ? p : m), s[0]!);
  const A = resample({ ...longest(a), closed: true }, n), B0 = resample({ ...longest(b), closed: true }, n);
  let best = 0, bestD = Infinity;
  for (let k = 0; k < n; k += 2) {
    let d = 0;
    for (let i = 0; i < n; i += 4) { const p = A[i]!, q = B0[(i + k) % n]!; d += (p.x - q.x) ** 2 + (p.y - q.y) ** 2; }
    if (d < bestD) { bestD = d; best = k; }
  }
  const B = A.map((_, i) => B0[(i + best) % n]!);
  return {
    /** The in-between shape at u (0 = a, 1 = b). */
    at(u: number): Shape { return [{ closed: true, pts: [...A.map((p, i) => ({ x: lerp(p.x, B[i]!.x, u), y: lerp(p.y, B[i]!.y, u) })), { x: lerp(A[0]!.x, B[0]!.x, u), y: lerp(A[0]!.y, B[0]!.y, u) }] }]; },
  };
}

/** Fills (and/or strokes) a shape; even-odd, so letter counters stay open. */
export function fillShape(x: CanvasRenderingContext2D, s: Shape, fill: string | null, stroke?: string, width = 3) {
  x.beginPath();
  for (const p of s) { p.pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y))); if (p.closed) x.closePath(); }
  if (fill) { x.fillStyle = fill; x.fill('evenodd'); }
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = width; x.lineJoin = 'round'; x.stroke(); }
}

/** A hand-drawn wobble on a shape (for sketchy line art): each point nudged by noise, the same at every t. */
export const wobble = (s: Shape, amp = 2, seed = 1): Shape => s.map((p, k) => ({ closed: p.closed, pts: p.pts.map((q, i) => ({ x: q.x + amp * (hash(i, k, seed) - 0.5), y: q.y + amp * (hash(i, k, seed + 9) - 0.5) })) }));

/**
 * A glint: a bright diagonal band sweeping across a filled shape at u (0..1), clipped to it. The gold or chrome
 * pass over a logo once it has drawn itself.
 */
export function glint(x: CanvasRenderingContext2D, s: Shape, u: number, o: { color?: string; width?: number; angle?: number } = {}) {
  if (u <= 0 || u >= 1) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of s) for (const q of p.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const w = o.width ?? (x1 - x0) * 0.18, a = o.angle ?? 0.35, span = x1 - x0 + (y1 - y0) * Math.tan(a) + 2 * w;
  const cx = x0 - w - (y1 - y0) * Math.tan(a) / 2 + span * u;
  x.save();
  x.beginPath();
  for (const p of s) { p.pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y))); if (p.closed) x.closePath(); }
  x.clip('evenodd');
  x.translate(cx, (y0 + y1) / 2); x.transform(1, 0, -Math.tan(a), 1, 0, 0);
  const g = x.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, o.color ?? 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.globalCompositeOperation = 'lighter';
  x.fillRect(-w, -(y1 - y0), 2 * w, 2 * (y1 - y0));
  x.restore();
}
