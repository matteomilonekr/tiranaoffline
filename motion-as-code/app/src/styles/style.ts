// A style is a look you can ask for by name: its colours and type, how it moves, what the engine's post does
// to a frame in it, and three drawing functions: its ground, a title set in it, and a demo card (`tile`) that
// shows it in motion. Every function is a pure function of time, drawn in Canvas2D in its own box (0,0)-(w,h).
// The list is styles/index.ts; films/styles is the reel that shows them all.
import type { PostOverrides } from '../engine/scene';
import { F, font, measure } from '../engine/type';
import { clamp, ease, hash, lerp, noise1, prog, TAU } from '../engine/util';

export interface Style {
  /** Its number in the list (1-20; 21 is the bonus). */
  n: number;
  id: string;
  name: string;
  /** What makes it, in one line (Italian). */
  what: string;
  /** What to ask Claude for to get it: the recipe, in a sentence (Italian). */
  recipe: string;
  palette: { bg: string; ink: string; accents: string[] };
  /** Font families (type.ts names): titles and text. */
  fonts: { title: string; text: string };
  /** How it moves: the easing of its entrances, and its frame rate when it moves in steps (0: smooth). */
  motion: { ease: (u: number) => number; steps: number };
  /** The engine's post for a whole frame in this style. */
  post: PostOverrides;
  /** Its ground, filling (0,0)-(w,h). */
  ground(x: CanvasRenderingContext2D, t: number, w: number, h: number): void;
  /** A title set in it, centred on (cx, cy), coming in from t = 0. */
  title(x: CanvasRenderingContext2D, t: number, s: string, cx: number, cy: number, size: number): void;
  /** Its demo card: the style in motion in (0,0)-(w,h), t seconds after the card comes up. */
  tile(x: CanvasRenderingContext2D, t: number, w: number, h: number): void;
}

// ------------------------------------------------------------------ helpers the styles share
export { F, font, measure, clamp, ease, hash, lerp, noise1, prog, TAU };

/** Time in steps of 1/fps (stop-motion, print jitter, pixel art). */
export const stepT = (t: number, fps: number) => Math.floor(t * fps) / fps;
/** 0 before t0, then 0 -> 1 over d with the given easing. */
export const inn = (t: number, t0: number, d: number, e: (u: number) => number = ease.outCubic) => e(prog(t, t0, t0 + d));
export const pop = (t: number, t0: number, d = 0.35) => (t < t0 ? 0 : ease.outBack(prog(t, t0, t0 + d)));

export function rr(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  x.beginPath();
  x.moveTo(x0 + k, y0);
  x.arcTo(x0 + w, y0, x0 + w, y0 + h, k);
  x.arcTo(x0 + w, y0 + h, x0, y0 + h, k);
  x.arcTo(x0, y0 + h, x0, y0, k);
  x.arcTo(x0, y0, x0 + w, y0, k);
  x.closePath();
}

/** Text with optional tracking (px) and alignment, at the alphabetic baseline. */
export function txt(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, color: string,
  o: { align?: CanvasTextAlign; track?: number; alpha?: number; stroke?: string; lw?: number; base?: CanvasTextBaseline } = {}) {
  x.save();
  x.globalAlpha *= o.alpha ?? 1;
  x.font = font(fam, size);
  x.textAlign = o.align ?? 'left';
  x.textBaseline = o.base ?? 'alphabetic';
  if (o.track) x.letterSpacing = `${o.track}px`;
  if (o.stroke) { x.lineJoin = 'round'; x.lineWidth = o.lw ?? size * 0.08; x.strokeStyle = o.stroke; x.strokeText(s, px, py); }
  x.fillStyle = color;
  x.fillText(s, px, py);
  x.restore();
}

/** Draw `fn` scaled by s and rotated by rot about (cx, cy). */
export function around(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number, fn: () => void) {
  if (s <= 0.002) return;
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  x.translate(-cx, -cy);
  fn();
  x.restore();
}

/** A dot screen over (x0,y0,w,h): radius r(u, v) at each cell (u, v in 0..1), 45-degree rows when `diag`. */
export function halftone(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, cell: number, color: string,
  r: (u: number, v: number) => number, diag = true) {
  x.fillStyle = color;
  for (let j = 0, y = y0; y <= y0 + h + cell; y += cell, j++) {
    for (let px = x0 + (diag && j % 2 ? cell / 2 : 0); px <= x0 + w + cell; px += cell) {
      const rad = r((px - x0) / w, (y - y0) / h) * cell * 0.5;
      if (rad < 0.4) continue;
      x.beginPath(); x.arc(px, y, rad, 0, TAU); x.fill();
    }
  }
}

/** Speckle: n dots of `color` scattered by `seed` (a new pattern every 1/fps s when fps > 0). */
export function speckle(x: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, seed: number, t = 0, fps = 0, size = 1.6) {
  const s = fps ? Math.floor(t * fps) : 0;
  x.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const px = hash(i, seed, s) * w, py = hash(i, seed + 1, s) * h, r = size * (0.4 + hash(i, seed + 2));
    x.fillRect(px, py, r, r);
  }
}

/** A rectangle with torn edges (paper), as a path. */
export function torn(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number, jag = 7) {
  const edge = (ax: number, ay: number, bx: number, by: number, k: number) => {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 9));
    for (let i = 1; i <= n; i++) {
      const u = i / n, nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
      const d = (hash(seed, k, i) - 0.5) * jag * (i === n ? 0 : 1);
      x.lineTo(lerp(ax, bx, u) + (nx / nl) * d, lerp(ay, by, u) + (ny / nl) * d);
    }
  };
  x.beginPath();
  x.moveTo(x0, y0);
  edge(x0, y0, x0 + w, y0, 1);
  edge(x0 + w, y0, x0 + w, y0 + h, 2);
  edge(x0 + w, y0 + h, x0, y0 + h, 3);
  edge(x0, y0 + h, x0, y0, 4);
  x.closePath();
}

const pool = new Map<string, HTMLCanvasElement>();
/** A scratch canvas of w x h (logical px times `scale`), reused by key. */
export function scratch(key: string, w: number, h: number, scale = 1): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const W = Math.max(1, Math.ceil(w * scale)), H = Math.max(1, Math.ceil(h * scale));
  let c = pool.get(key);
  if (!c) { c = document.createElement('canvas'); pool.set(key, c); }
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d', { willReadFrequently: key.startsWith('read') })!;
  x.setTransform(scale, 0, 0, scale, 0, 0);
  x.clearRect(0, 0, w, h);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  return { c, x };
}

const samples = new Map<string, [number, number][]>();
/** Points inside a text set in `fam` at `size`, centred on (0,0): every `step` px (cached). */
export function textPoints(s: string, fam: string, size: number, step: number): [number, number][] {
  const key = `${s}|${fam}|${size}|${step}`;
  const hit = samples.get(key);
  if (hit) return hit;
  const tw = Math.ceil(measure(s, fam, size)) + 20, th = Math.ceil(size * 1.3);
  const { x } = scratch('read-text', tw, th);
  x.font = font(fam, size); x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillStyle = '#fff';
  x.fillText(s, tw / 2, th / 2);
  const d = x.getImageData(0, 0, tw, th).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < th; y += step) for (let px = 0; px < tw; px += step) if (d[(y * tw + px) * 4 + 3]! > 128) pts.push([px - tw / 2, y - th / 2]);
  samples.set(key, pts);
  return pts;
}

/** A linear gradient from top to bottom of a box. */
export function vgrad(x: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  for (const [k, c] of stops) g.addColorStop(k, c);
  return g;
}

/** The style's name as its tiles set it, with an entrance in its own easing: [prog, scale]. */
export const enter = (t: number, t0: number, d: number, e: (u: number) => number) => e(clamp((t - t0) / d));
