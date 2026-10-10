// "Never cut": one shape that becomes the next thing. The Opus 5.5 UI-morph prompts animate a single rounded
// rectangle through sizes, radii and colours while its content swaps under a short blur, and carry an element
// from one scene to the next (a chart line becomes a page's edge, a notch becomes a pill). These are the pieces:
// a rect state springing through keys, the in-between of two rects, and the blurred content swap.
import { clamp, lerp } from '../engine/util';
import { E, springTo } from './tl';
import { rr } from './ui';

export type Box = { x: number; y: number; w: number; h: number; r: number };

/** The box at t, each of x, y, w, h, r springing to the next key's value (retargets smoothly mid-flight). */
export function boxAt(t: number, ks: [number, Box][], o: { settle?: number; overshoot?: number } = {}): Box {
  const f = (k: keyof Box) => springTo(t, ks.map(([tt, b]) => [tt, b[k]] as [number, number]), { settle: o.settle ?? 0.6, overshoot: o.overshoot ?? 0.015 });
  return { x: f('x'), y: f('y'), w: f('w'), h: f('h'), r: f('r') };
}

/** Linear in-between of two boxes (FLIP-style, for a shared element handed from one scene to the next). */
export const lerpBox = (a: Box, b: Box, u: number): Box => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u), r: lerp(a.r, b.r, u) });

/** Mixes two #rrggbb colours. */
export function mix(a: string, b: string, u: number): string {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i]!, clamp(u))).toString(16).padStart(2, '0')).join('');
}

/** A colour that changes at each key's time (eased over d seconds), for the morphing shape's fill. */
export function colorAt(t: number, ks: [number, string][], d = 0.4): string {
  let c = ks[0]![1];
  for (let i = 1; i < ks.length; i++) c = mix(c, ks[i]![1], E('power2.inOut')(clamp((t - ks[i]![0]) / d)));
  return c;
}

/** Fills the box (with a soft shadow if `shadow`), clips to it and calls `inside` for its content. */
export function drawBox(x: CanvasRenderingContext2D, b: Box, fill: string, inside?: (b: Box) => void, shadow = 0.6) {
  x.save();
  if (shadow > 0) { x.shadowColor = `rgba(0,0,0,${0.2 * shadow})`; x.shadowBlur = 50 * shadow; x.shadowOffsetY = 16 * shadow; }
  rr(x, b.x, b.y, b.w, b.h, b.r); x.fillStyle = fill; x.fill();
  x.restore();
  if (inside) { x.save(); rr(x, b.x, b.y, b.w, b.h, b.r); x.clip(); inside(b); x.restore(); }
}

/**
 * The content swap of a morph: A blurs and fades out, then B comes in from a blur, over d seconds from t0 (the
 * outgoing content leaves before the incoming one arrives, as the long prompts ask).
 */
export function swap(x: CanvasRenderingContext2D, t: number, t0: number, d: number, A: () => void, B: () => void, blur = 14) {
  const u = clamp((t - t0) / d);
  if (u < 0.5) {
    const k = E('power2.in')(u * 2);
    x.save(); x.globalAlpha *= 1 - k; if (k > 0.01) x.filter = `blur(${(k * blur).toFixed(1)}px)`; x.translate(0, -k * 12); A(); x.restore();
  } else {
    const k = E('power2.out')((u - 0.5) * 2);
    x.save(); x.globalAlpha *= k; if (k < 0.99) x.filter = `blur(${((1 - k) * blur).toFixed(1)}px)`; x.translate(0, (1 - k) * 12); B(); x.restore();
  }
}
