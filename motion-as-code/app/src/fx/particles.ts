// Particles as pure functions of t: no simulation state, so any frame can be drawn alone. A swarm of n
// particles flies from a scatter into targets (the points of a word, of a shape) and back out; a burst throws
// sparks or confetti under gravity; dust drifts in layers for depth. Trails are the same particles drawn at
// earlier times, fading.
import { textPoints, layout } from '../engine/type';
import { clamp, hash, lerp, noise1, TAU, type V2 } from '../engine/util';
import { E, type Ease } from './tl';
import { resample, type Shape } from './path';

/** The points inside a word, centred on (cx, cy) (the middle of its x-height band), `step` px apart. */
export function textTargets(text: string, family: string, size: number, cx: number, cy: number, step = 7, seed = 1): V2[] {
  const w = layout(text, family, size).width;
  return textPoints(text, family, size, step, seed).map((p) => ({ x: cx - w / 2 + p.x, y: cy + size * 0.35 + p.y }));
}
/** n points spread along a shape's outlines (in proportion to their lengths). */
export function shapeTargets(s: Shape, n: number): V2[] {
  const ls = s.map((p) => p.pts.reduce((a, q, i) => (i ? a + Math.hypot(q.x - p.pts[i - 1]!.x, q.y - p.pts[i - 1]!.y) : 0), 0));
  const tot = ls.reduce((a, b) => a + b, 0);
  return s.flatMap((p, k) => resample(p, Math.max(2, Math.round((n * ls[k]!) / tot))));
}

export interface SwarmOpts {
  /** Where the particles wait before (and go after): 'scatter' over the frame, 'ring' round the target, 'point' from (sx, sy), 'below' rising from the bottom. */
  start?: 'scatter' | 'ring' | 'point' | 'below';
  sx?: number; sy?: number;
  /** Seconds the flight takes, and how much the particles' start times spread (random). */
  dur?: number; spread?: number;
  ease?: Ease | string;
  /** Wiggle of each particle while it flies and once it lands (px). */
  drift?: number; jitter?: number;
  /** Curl of the path: particles swing out sideways mid-flight. */
  swirl?: number;
  seed?: number;
}

/**
 * A swarm that assembles into `targets` from tIn, and leaves from tOut (if given) the way it came, or exploding
 * outward with `explode`. Call pos(t, i) for particle i at t, or draw() for all of it.
 */
export function swarm(targets: V2[], W: number, H: number, tIn: number, o: SwarmOpts & { tOut?: number; explode?: boolean } = {}) {
  const n = targets.length, sd = o.seed ?? 1, dur = o.dur ?? 1.2, spread = o.spread ?? 0.6;
  const e = typeof o.ease === 'string' ? E(o.ease) : o.ease ?? E('expo.inOut');
  const cx = targets.reduce((a, p) => a + p.x, 0) / Math.max(1, n), cy = targets.reduce((a, p) => a + p.y, 0) / Math.max(1, n);
  const from = (i: number): V2 => {
    const r1 = hash(i, sd), r2 = hash(i, sd + 1);
    switch (o.start ?? 'scatter') {
      case 'ring': { const a = r1 * TAU, r = Math.max(W, H) * (0.45 + 0.3 * r2); return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; }
      case 'point': return { x: (o.sx ?? cx) + (r1 - 0.5) * 6, y: (o.sy ?? cy) + (r2 - 0.5) * 6 };
      case 'below': return { x: r1 * W, y: H + 40 + r2 * H * 0.5 };
      default: return { x: r1 * W, y: r2 * H };
    }
  };
  const pos = (t: number, i: number): V2 & { a: number } => {
    const p = targets[i]!, f = from(i);
    const delay = hash(i, sd + 2) * spread;
    let u = e(clamp((t - tIn - delay) / dur));
    let out = { x: lerp(f.x, p.x, u), y: lerp(f.y, p.y, u) };
    const sw = (o.swirl ?? 0.25) * Math.sin(u * Math.PI);
    if (sw) { const dx = p.x - f.x, dy = p.y - f.y; out = { x: out.x - dy * sw, y: out.y + dx * sw }; }
    const fl = (o.drift ?? 18) * Math.sin(u * Math.PI) + (o.jitter ?? 1.2) * u;
    out.x += fl * noise1(t * 0.9 + i * 0.37, sd + 3);
    out.y += fl * noise1(t * 0.9 + i * 0.53, sd + 4);
    let a = clamp((t - tIn - delay) * 4);
    if (o.tOut !== undefined && t > o.tOut) {
      const d2 = hash(i, sd + 5) * spread * 0.6;
      const v = E('power3.in')(clamp((t - o.tOut - d2) / dur));
      if (o.explode) {
        const ang = Math.atan2(p.y - cy, p.x - cx) + (hash(i, sd + 6) - 0.5) * 0.8, sp = (300 + 900 * hash(i, sd + 7)) * v;
        out = { x: out.x + Math.cos(ang) * sp, y: out.y + Math.sin(ang) * sp + 400 * v * v };
        a *= 1 - v;
      } else { out = { x: lerp(out.x, f.x, v), y: lerp(out.y, f.y, v) }; a *= 1 - 0.5 * v; }
    }
    return { ...out, a };
  };
  return {
    n, pos,
    /** Draws every particle as a dot of radius r (or square), with an optional trail of k echoes dt apart. */
    draw(x: CanvasRenderingContext2D, t: number, d: { color?: string | ((i: number) => string); r?: number; square?: boolean; trail?: number; dt?: number; glow?: boolean } = {}) {
      const r = d.r ?? 2.2, k = d.trail ?? 0, dt = d.dt ?? 1 / 60;
      x.save();
      if (d.glow) x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        x.fillStyle = typeof d.color === 'function' ? d.color(i) : d.color ?? '#ffffff';
        for (let j = k; j >= 0; j--) {
          const p = pos(t - j * dt, i);
          if (p.a <= 0.01) continue;
          x.globalAlpha = p.a * (1 - j / (k + 1));
          const rr = r * (1 - (0.5 * j) / (k + 1));
          if (d.square) x.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
          else { x.beginPath(); x.arc(p.x, p.y, rr, 0, TAU); x.fill(); }
        }
      }
      x.restore();
    },
  };
}

/**
 * A burst at t0 from (cx, cy): n sparks (lines along their velocity) or confetti (spinning rectangles) thrown
 * out in a cone (angle and width in radians; the default is all round), falling with gravity, fading over life.
 */
export function burst(x: CanvasRenderingContext2D, t: number, t0: number, cx: number, cy: number, o: { n?: number; kind?: 'spark' | 'confetti' | 'dot'; colors?: string[]; speed?: number; gravity?: number; life?: number; angle?: number; cone?: number; size?: number; seed?: number } = {}) {
  const u = t - t0, life = o.life ?? 1.2;
  if (u < 0 || u > life * 1.6) return;
  const n = o.n ?? 40, sd = o.seed ?? 1, g = o.gravity ?? 900, cols = o.colors ?? ['#ffffff'], sz = o.size ?? 8;
  x.save();
  for (let i = 0; i < n; i++) {
    const a = (o.angle ?? -Math.PI / 2) + ((o.cone ?? TAU) * (hash(i, sd) - 0.5));
    const v = (o.speed ?? 900) * (0.35 + 0.65 * hash(i, sd + 1));
    const drag = 1 - Math.exp(-u * 2.2), vx = Math.cos(a) * v, vy = Math.sin(a) * v;
    const px = cx + (vx * drag) / 2.2, py = cy + (vy * drag) / 2.2 + 0.5 * g * u * u * (o.kind === 'confetti' ? 0.35 : 1);
    const lf = clamp(1 - u / (life * (0.6 + 0.6 * hash(i, sd + 2))));
    if (lf <= 0) continue;
    x.globalAlpha = lf;
    const col = cols[i % cols.length]!;
    if (o.kind === 'confetti') {
      x.save(); x.translate(px, py); x.rotate(u * (4 + 8 * hash(i, sd + 3)) + i);
      x.scale(1, Math.abs(Math.cos(u * (5 + 6 * hash(i, sd + 4)) + i)));
      x.fillStyle = col; x.fillRect(-sz / 2, -sz * 0.35, sz, sz * 0.7); x.restore();
    } else if (o.kind === 'dot') {
      x.fillStyle = col; x.beginPath(); x.arc(px, py, sz * 0.4 * lf, 0, TAU); x.fill();
    } else {
      const ex = Math.exp(-u * 2.2), sx = vx * ex, sy = vy * ex + g * u;
      const L = Math.min(sz * 6, Math.hypot(sx, sy) * 0.05);
      const ang = Math.atan2(sy, sx);
      x.strokeStyle = col; x.lineWidth = Math.max(1, sz * 0.25 * lf); x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, py); x.lineTo(px - Math.cos(ang) * L, py - Math.sin(ang) * L); x.stroke();
    }
  }
  x.restore();
}

/** Ambient dust in `layers` depths over (0,0)-(w,h): far specks slow and dim, near ones larger, faster, softer. */
export function dust(x: CanvasRenderingContext2D, t: number, w: number, h: number, o: { n?: number; layers?: number; color?: string; speed?: number; dir?: number; seed?: number; size?: number } = {}) {
  const n = o.n ?? 120, L = o.layers ?? 3, sd = o.seed ?? 1, dir = o.dir ?? -Math.PI / 2, sp = o.speed ?? 30;
  x.save();
  x.fillStyle = o.color ?? '#ffffff';
  for (let i = 0; i < n; i++) {
    const z = 1 + (i % L), k = z / L;
    const vx = Math.cos(dir) * sp * k, vy = Math.sin(dir) * sp * k;
    const px = ((hash(i, sd) * w + vx * t + 12 * noise1(t * 0.3 + i, sd)) % w + w) % w;
    const py = ((hash(i, sd + 1) * h + vy * t + 12 * noise1(t * 0.3 + i * 1.7, sd + 2)) % h + h) % h;
    x.globalAlpha = (0.15 + 0.5 * k) * (0.6 + 0.4 * Math.sin(t * (1 + hash(i, sd + 3)) + i));
    x.beginPath(); x.arc(px, py, (o.size ?? 1.6) * (0.5 + k), 0, TAU); x.fill();
  }
  x.restore();
}
