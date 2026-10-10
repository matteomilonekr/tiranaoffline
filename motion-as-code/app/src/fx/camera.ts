// A 2.5D camera for Canvas2D, the "one continuous camera" of the long Opus 5.5 prompts: pushes, pans, punch-ins
// on the beat, smash-pans, zoom-to-fit a rect and zooms across scales (a dot, then a window, then a phone). The
// camera is a function of t; apply() sets the context's transform for a layer at a given depth, so near layers
// move more than far ones (parallax).
import { clamp, lerp, noise1 } from '../engine/util';
import { E, type Ease } from './tl';

export type Cam = { x: number; y: number; zoom: number; rot: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** The camera that frames `r` in a W×H frame with `pad` px round it (centre and zoom). */
export function fit(r: Rect, W: number, H: number, pad = 60): Cam {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, zoom: Math.min((W - 2 * pad) / r.w, (H - 2 * pad) / r.h), rot: 0 };
}

/**
 * Between two cameras at u. Zoom goes in log space, so a 1x -> 100x zoom across scales moves at a steady
 * perceived speed; the centre follows the zoom (the target stays put on screen as it grows), like a real
 * zoom-in on a point rather than a straight slide.
 */
export function between(a: Cam, b: Cam, u: number): Cam {
  const za = Math.log(a.zoom), zb = Math.log(b.zoom), z = Math.exp(lerp(za, zb, u));
  // weight of b's centre: how far the zoom has gone, so the framing tracks the scale
  const k = Math.abs(zb - za) > 1e-3 ? (1 / a.zoom - 1 / z) / (1 / a.zoom - 1 / b.zoom) : u;
  return { x: lerp(a.x, b.x, clamp(k)), y: lerp(a.y, b.y, clamp(k)), zoom: z, rot: lerp(a.rot, b.rot, u) };
}

/** A camera move through keys [time, cam, ease of the segment that ends there]. */
export function track(t: number, ks: [number, Cam, (Ease | string)?][]): Cam {
  if (t <= ks[0]![0]) return ks[0]![1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, c1, e] = ks[i]!;
    if (t <= t1) {
      const [t0, c0] = ks[i - 1]!;
      const f = typeof e === 'string' ? E(e) : e ?? E('power3.inOut');
      return between(c0, c1, f(clamp((t - t0) / (t1 - t0))));
    }
  }
  return ks.at(-1)![1];
}

/** Adds handheld drift (px and degrees, slow noise) and a punch: zoom × (1 + punch). */
export function handheld(c: Cam, t: number, o: { amp?: number; rot?: number; speed?: number; punch?: number; seed?: number } = {}): Cam {
  const a = o.amp ?? 6, s = o.speed ?? 0.35, sd = o.seed ?? 1;
  return { x: c.x + (a * noise1(t * s, sd)) / c.zoom, y: c.y + (a * noise1(t * s, sd + 3)) / c.zoom, zoom: c.zoom * (1 + (o.punch ?? 0)), rot: c.rot + ((o.rot ?? 0.3) * Math.PI / 180) * noise1(t * s * 0.7, sd + 5) };
}

/**
 * Sets x's transform for a layer at `depth` (1 = the focus plane; 0.5 farther, moves half as much; 2 nearer).
 * Draw the layer in world px after this. W×H is the frame. Call inside save()/restore().
 */
export function apply(x: CanvasRenderingContext2D, c: Cam, W: number, H: number, depth = 1) {
  const z = Math.pow(c.zoom, depth);
  x.translate(W / 2, H / 2);
  x.rotate(c.rot * depth);
  x.scale(z, z);
  x.translate(-lerp(W / 2, c.x, depth), -lerp(H / 2, c.y, depth));
}

/**
 * A smash-pan: a fast slide of `dist` px along `dir` (radians) between t0 and t0 + d, with the motion blur of a
 * real whip (a directional blur filter at the peak speed). Returns the offset and sets x.filter while it runs.
 */
export function smash(x: CanvasRenderingContext2D, t: number, t0: number, d: number, dist: number, dir = 0): { dx: number; dy: number } {
  const u = clamp((t - t0) / d), e = E('expo.inOut')(u);
  const speed = Math.sin(Math.PI * u);
  if (speed > 0.05) x.filter = `blur(${(speed * dist * 0.012).toFixed(1)}px)`;
  return { dx: Math.cos(dir) * dist * e, dy: Math.sin(dir) * dist * e };
}
