// Timing in GSAP's words, as pure functions of t. The Opus 5.5 prompts (analysis/opus55.py) ask for GSAP more than
// for any library: timelines with labels and overlaps ("<", "-=0.3"), staggers from the centre, power2.out and
// back.out(1.7). Here a timeline is built once (in init) and only read in render: tl.p(t, 'title') is that tween's
// eased 0..1 at t, so scrubbing, seeking and rendering frame by frame all give the same picture.
import { clamp, ease, hash, springStep } from '../engine/util';

export type Ease = (u: number) => number;

const pow = (k: number) => ({
  in: (u: number) => Math.pow(u, k),
  out: (u: number) => 1 - Math.pow(1 - u, k),
  inOut: (u: number) => (u < 0.5 ? Math.pow(2 * u, k) / 2 : 1 - Math.pow(2 - 2 * u, k) / 2),
});
const back = (s = 1.70158) => ({
  in: (u: number) => (s + 1) * u * u * u - s * u * u,
  out: (u: number) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
  inOut: (u: number) => {
    const c = s * 1.525;
    return u < 0.5 ? (Math.pow(2 * u, 2) * ((c + 1) * 2 * u - c)) / 2 : (Math.pow(2 * u - 2, 2) * ((c + 1) * (u * 2 - 2) + c) + 2) / 2;
  },
});
const elastic = (amp = 1, period = 0.3) => {
  const a = Math.max(1, amp), s = (period / (2 * Math.PI)) * Math.asin(1 / a);
  const out = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : a * Math.pow(2, -10 * u) * Math.sin(((u - s) * 2 * Math.PI) / period) + 1);
  return { out, in: (u: number) => 1 - out(1 - u), inOut: (u: number) => (u < 0.5 ? (1 - out(1 - 2 * u)) / 2 : (1 + out(2 * u - 1)) / 2) };
};
const bounceOut = (u: number) => {
  const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
};
const circ = { in: (u: number) => 1 - Math.sqrt(1 - u * u), out: (u: number) => Math.sqrt(1 - Math.pow(u - 1, 2)), inOut: (u: number) => (u < 0.5 ? (1 - Math.sqrt(1 - 4 * u * u)) / 2 : (Math.sqrt(1 - Math.pow(-2 * u + 2, 2)) + 1) / 2) };
const sine = { in: (u: number) => 1 - Math.cos((u * Math.PI) / 2), out: (u: number) => Math.sin((u * Math.PI) / 2), inOut: (u: number) => -(Math.cos(Math.PI * u) - 1) / 2 };
const expo = { in: ease.inExpo, out: ease.outExpo, inOut: ease.inOutExpo };

/** A CSS cubic-bezier(x1, y1, x2, y2) as an easing (solved by Newton, then bisection). */
export function bezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s, Y = (s: number) => ((ay * s + by) * s + cy) * s, dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (u: number) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let s = u;
    for (let i = 0; i < 6; i++) {
      const e = X(s) - u, d = dX(s);
      if (Math.abs(e) < 1e-6) return Y(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    let lo = 0, hi = 1;
    s = u;
    for (let i = 0; i < 30; i++) { const x = X(s); if (Math.abs(x - u) < 1e-6) break; if (x < u) lo = s; else hi = s; s = (lo + hi) / 2; }
    return Y(s);
  };
}

/**
 * An easing by its GSAP name: 'power2.out', 'back.out(1.7)', 'elastic.out(1, 0.3)', 'expo.inOut', 'circ.in',
 * 'sine.inOut', 'bounce.out', 'steps(12)', 'none', or a CSS 'cubic-bezier(.2,.8,.2,1)'. Unknown names throw.
 */
export function E(name: string): Ease {
  const m = name.replace(/\s+/g, '').match(/^([a-zA-Z0-9-]+)(?:\.(in|out|inOut))?(?:\(([^)]*)\))?$/);
  if (!m) throw new Error(`unknown ease: ${name}`);
  const [, base, dir = 'out', args] = m;
  const n = (args ?? '').split(',').filter(Boolean).map(Number);
  const d = dir as 'in' | 'out' | 'inOut';
  switch (base) {
    case 'none': case 'linear': return ease.linear;
    case 'power0': return ease.linear;
    case 'power1': case 'quad': return pow(2)[d];
    case 'power2': case 'cubic': return pow(3)[d];
    case 'power3': case 'quart': return pow(4)[d];
    case 'power4': case 'quint': case 'strong': return pow(5)[d];
    case 'back': return back(n[0])[d];
    case 'elastic': return elastic(n[0], n[1])[d];
    case 'bounce': return d === 'out' ? bounceOut : d === 'in' ? (u) => 1 - bounceOut(1 - u) : (u) => (u < 0.5 ? (1 - bounceOut(1 - 2 * u)) / 2 : (1 + bounceOut(2 * u - 1)) / 2);
    case 'circ': return circ[d];
    case 'sine': return sine[d];
    case 'expo': return expo[d];
    case 'steps': { const k = Math.max(1, n[0] ?? 1); return (u) => Math.min(1, Math.floor(u * k) / k); }
    case 'cubic-bezier': return bezier(n[0]!, n[1]!, n[2]!, n[3]!);
    case 'spring': return (u) => springStep(u, n[0] ?? 2, n[1] ?? 0.35);
  }
  throw new Error(`unknown ease: ${name}`);
}

/** 0 before t0, then eased 0 -> 1 over d seconds. `e` is an easing or its GSAP name. */
export function tw(t: number, t0: number, d: number, e: Ease | string = ease.outCubic): number {
  const f = typeof e === 'string' ? E(e) : e;
  return d <= 0 ? (t >= t0 ? 1 : 0) : f(clamp((t - t0) / d));
}

export type StaggerFrom = 'start' | 'end' | 'center' | 'edges' | 'random' | number;
/**
 * GSAP's stagger: the delay of item i of n. `each` is the gap between neighbours, or `amount` the whole spread;
 * `from` is where it starts ('center' ripples outward, 'edges' inward, a number from that index); with `grid`
 * [cols, rows] the distance is measured on the grid (`axis` keeps one direction). `ease` bends the spread.
 */
export function stagger(i: number, n: number, o: { each?: number; amount?: number; from?: StaggerFrom; grid?: [number, number]; axis?: 'x' | 'y'; ease?: Ease | string; seed?: number } = {}): number {
  const from = o.from ?? 'start';
  let d: number, max: number;
  if (o.grid) {
    const [cols, rows] = o.grid;
    const cx = from === 'center' ? (cols - 1) / 2 : from === 'end' ? cols - 1 : typeof from === 'number' ? from % cols : 0;
    const cy = from === 'center' ? (rows - 1) / 2 : from === 'end' ? rows - 1 : typeof from === 'number' ? Math.floor(from / cols) : 0;
    const dx = (i % cols) - cx, dy = Math.floor(i / cols) - cy;
    d = o.axis === 'x' ? Math.abs(dx) : o.axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy);
    max = o.axis === 'x' ? Math.max(cx, cols - 1 - cx) : o.axis === 'y' ? Math.max(cy, rows - 1 - cy) : Math.hypot(Math.max(cx, cols - 1 - cx), Math.max(cy, rows - 1 - cy));
  } else {
    const c = (n - 1) / 2;
    if (from === 'random') { d = hash(i, o.seed ?? 7) * (n - 1); max = n - 1; }
    else if (from === 'center') { d = Math.abs(i - c); max = c; }
    else if (from === 'edges') { d = c - Math.abs(i - c); max = c; }
    else if (from === 'end') { d = n - 1 - i; max = n - 1; }
    else { const k = typeof from === 'number' ? from : 0; d = Math.abs(i - k); max = Math.max(k, n - 1 - k); }
  }
  const total = o.amount ?? (o.each ?? 0.05) * max;
  const u = max > 0 ? d / max : 0;
  const f = o.ease ? (typeof o.ease === 'string' ? E(o.ease) : o.ease) : ease.linear;
  return f(u) * total;
}

/** Loops: t folded into [0, period), and a ping-pong 0 -> 1 -> 0 (GSAP's repeat: -1, yoyo: true). */
export const loop = (t: number, period: number) => ((t % period) + period) % period;
export const yoyo = (t: number, period: number) => { const u = loop(t, 2 * period) / period; return u <= 1 ? u : 2 - u; };

type Span = { start: number; end: number; ease: Ease };
/**
 * A timeline built once and read by t, with GSAP's positions: a number (absolute seconds), '>' (after the last,
 * the default), '<' (with the last), '+=0.2' / '-=0.3' (after the last, with a gap or an overlap), 'label',
 * 'label+=0.5', '<0.2' (0.2 after the last one's start). Each tween is named; p(t, name) is its eased progress.
 */
export class Timeline {
  private spans = new Map<string, Span>();
  private labels = new Map<string, number>();
  private last: Span = { start: 0, end: 0, ease: ease.linear };
  duration = 0;
  constructor(public origin = 0) {}

  private pos(p: number | string | undefined): number {
    if (p === undefined || p === '>') return this.last.end;
    if (typeof p === 'number') return this.origin + p;
    const m = p.match(/^([<>]|[A-Za-z_][\w-]*)?([+-]=?)?(-?[\d.]+)?$/);
    if (!m) throw new Error(`bad position: ${p}`);
    const [, ref, op, num] = m;
    let at = ref === '<' ? this.last.start : ref === '>' || !ref ? this.last.end : this.labels.get(ref) ?? this.spans.get(ref)?.start;
    if (at === undefined) throw new Error(`no such label or tween: ${ref}`);
    const k = num ? parseFloat(num) : 0;
    if (op === '-=' || op === '-') at -= k;
    else if (op === '+=' || op === '+' || (ref === '<' && num)) at += k;
    return at;
  }
  /** Adds a named tween of `dur` seconds at `position`. */
  to(name: string, dur: number, position?: number | string, e: Ease | string = 'power2.out') {
    const start = this.pos(position);
    const s: Span = { start, end: start + dur, ease: typeof e === 'string' ? E(e) : e };
    this.spans.set(name, s);
    this.last = s;
    this.duration = Math.max(this.duration, s.end - this.origin);
    return this;
  }
  /** Adds n tweens name0..name{n-1}, each `dur` long, staggered (see stagger()) from `position`. */
  stagger(name: string, n: number, dur: number, o: Parameters<typeof stagger>[2], position?: number | string, e: Ease | string = 'power2.out') {
    const start = this.pos(position);
    let first: Span | null = null, endMax = start;
    for (let i = 0; i < n; i++) {
      const s0 = start + stagger(i, n, o);
      const s: Span = { start: s0, end: s0 + dur, ease: typeof e === 'string' ? E(e) : e };
      this.spans.set(`${name}${i}`, s);
      if (!first) first = s;
      endMax = Math.max(endMax, s.end);
    }
    this.last = { start, end: endMax, ease: ease.linear };
    this.duration = Math.max(this.duration, endMax - this.origin);
    return this;
  }
  /** Names the current position (or `position`) so later tweens can refer to it. */
  label(name: string, position?: number | string) {
    this.labels.set(name, this.pos(position));
    return this;
  }
  /** Seconds of nothing after the last tween. */
  wait(d: number) { const s = this.last.end + d; this.last = { start: s, end: s, ease: ease.linear }; this.duration = Math.max(this.duration, s - this.origin); return this; }

  span(name: string): Span {
    const s = this.spans.get(name);
    if (!s) throw new Error(`no tween named ${name}`);
    return s;
  }
  at(name: string) { return this.labels.get(name) ?? this.span(name).start; }
  /** The eased 0..1 of a tween at t (0 before, 1 after). */
  p(t: number, name: string): number {
    const s = this.span(name);
    return s.end <= s.start ? (t >= s.start ? 1 : 0) : s.ease(clamp((t - s.start) / (s.end - s.start)));
  }
  /** The raw linear 0..1 of a tween, for things that ease on their own. */
  u(t: number, name: string) { const s = this.span(name); return s.end <= s.start ? (t >= s.start ? 1 : 0) : clamp((t - s.start) / (s.end - s.start)); }
  /** True while a tween runs. */
  active(t: number, name: string) { const s = this.span(name); return t >= s.start && t < s.end; }
}

/**
 * A closed-form damped spring: 0 -> 1 from t0, settling in about `settle` seconds with at most `overshoot`
 * (0.02 = 2%, the "premium" feel the long prompts ask for; 0 is critically damped, no overshoot at all).
 */
export function spring(t: number, t0: number, o: { settle?: number; overshoot?: number } = {}): number {
  const u = t - t0;
  if (u <= 0) return 0;
  const os = o.overshoot ?? 0.02, settle = o.settle ?? 0.6;
  if (os <= 1e-4) {
    // critically damped: 1 - (1 + wt) e^-wt, settled (99%) at wt ~ 6.6
    const w = 6.6 / settle;
    return 1 - (1 + w * u) * Math.exp(-w * u);
  }
  const lo = Math.log(os), zeta = -lo / Math.sqrt(Math.PI * Math.PI + lo * lo);
  const w = 4.6 / (zeta * settle), wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * u) * (Math.cos(wd * u) + ((zeta * w) / wd) * Math.sin(wd * u));
}

/**
 * A value that springs to each new target as it is given: keys [time, target] (the first is where it starts).
 * Each change adds its own spring, so a target changed mid-flight retargets smoothly, as in UI morphs.
 */
export function springTo(t: number, ks: [number, number][], o: { settle?: number; overshoot?: number } = {}): number {
  let v = ks[0]![1];
  for (let i = 1; i < ks.length; i++) v += (ks[i]![1] - ks[i - 1]![1]) * spring(t, ks[i]![0], o);
  return v;
}
