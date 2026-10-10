// Transitions by masks, the ones the Opus 5.5 prompts name: an iris through a circle or any shape, a wipe at an
// angle, slices and blinds, band tears on the beat, a wipe through letterforms, a push, a flash, a hard light/dark
// switch. Each takes the outgoing and incoming shots as draw functions and u in 0..1; the incoming one is drawn
// clipped by the mask, so any two shots (or styles) can meet in any of them.
import { textPath2D, layout } from '../engine/type';
import { clamp, hash, lerp, TAU } from '../engine/util';
import { E } from './tl';
import type { Shape } from './path';

type Draw = () => void;
export type Kind = 'iris' | 'shape' | 'wipe' | 'slices' | 'blinds' | 'tear' | 'letters' | 'push' | 'flash' | 'cut' | 'zoom';

export interface TransOpts {
  W: number; H: number;
  /** Centre of an iris or zoom (default the frame's centre). */
  cx?: number; cy?: number;
  /** Wipe angle (radians, 0 = left to right), number of slices/blinds/bands, softness of the edge (px). */
  angle?: number; n?: number; feather?: number;
  /** For 'shape': the mask's shape at full size, centred on (cx, cy) (it grows from 0 to cover the frame). */
  shape?: Shape;
  /** For 'letters': the word whose letters open onto the next shot, its font and size. */
  text?: string; family?: string; size?: number;
  /** Colour of a flash, of the edge line of a wipe. */
  color?: string; edge?: number;
  seed?: number;
}

/** Draws the frame of a transition at u (0 = all A, 1 = all B). */
export function transition(x: CanvasRenderingContext2D, kind: Kind, u: number, A: Draw, B: Draw, o: TransOpts) {
  const { W, H } = o, cx = o.cx ?? W / 2, cy = o.cy ?? H / 2;
  u = clamp(u);
  const both = (clip: () => void, eased = u) => {
    if (eased <= 0) { A(); return; }
    if (eased >= 1) { B(); return; }
    A();
    // the mask may move the transform to build its path; the shot itself is drawn with the caller's transform
    x.save(); const m = x.getTransform(); x.beginPath(); clip(); x.clip(); x.setTransform(m); B(); x.restore();
  };
  switch (kind) {
    case 'cut': (u < 0.5 ? A : B)(); return;
    case 'iris': {
      const e = E('power3.inOut')(u), R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
      both(() => x.arc(cx, cy, R * e, 0, TAU), e);
      return;
    }
    case 'shape': {
      const e = E('power3.in')(u), s = o.shape ?? [];
      both(() => {
        x.translate(cx, cy); x.scale(e * 12 + 1e-3, e * 12 + 1e-3); x.translate(-cx, -cy);
        for (const p of s) { p.pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y))); x.closePath(); }
      }, e);
      return;
    }
    case 'wipe': {
      const e = E('expo.inOut')(u), a = o.angle ?? 0, D = Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a));
      const pos = lerp(-D / 2, D / 2, e);
      both(() => {
        x.translate(W / 2, H / 2); x.rotate(a);
        x.rect(-D, -D, pos + D, 2 * D);
      }, e);
      if (o.edge && e > 0 && e < 1) {
        x.save(); x.translate(W / 2, H / 2); x.rotate(a); x.fillStyle = o.color ?? '#ffffff'; x.fillRect(pos - o.edge / 2, -D, o.edge, 2 * D); x.restore();
      }
      return;
    }
    case 'slices': case 'blinds': {
      const n = o.n ?? (kind === 'slices' ? 6 : 10);
      both(() => {
        for (let i = 0; i < n; i++) {
          const d = (kind === 'slices' ? i / n : hash(i, o.seed ?? 3)) * 0.5, e = E('power3.inOut')(clamp((u - d) / 0.5));
          if (kind === 'slices') x.rect((i * W) / n, 0, W / n, H * e);
          else x.rect(0, (i * H) / n, W, (H / n) * e);
        }
      }, u);
      return;
    }
    case 'tear': {
      // horizontal bands of B torn in, offset sideways, then settling: a glitch cut
      const n = o.n ?? 9;
      if (u < 0.15) { A(); return; }
      if (u > 0.85) { B(); return; }
      A();
      for (let i = 0; i < n; i++) {
        if (hash(i, Math.floor(u * 12), o.seed ?? 5) > lerp(0.2, 0.95, u)) continue;
        const y0 = hash(i, 1, o.seed ?? 5) * H, h = (0.03 + 0.12 * hash(i, 2, o.seed ?? 5)) * H, dx = (hash(i, Math.floor(u * 20)) - 0.5) * W * 0.15 * (1 - u);
        x.save(); x.beginPath(); x.rect(0, y0, W, h); x.clip(); x.translate(dx, 0); B(); x.restore();
      }
      return;
    }
    case 'letters': {
      // the next shot shows through the letters, which then grow until they fill the frame
      const text = o.text ?? 'MOTION', fam = o.family ?? '', size = o.size ?? W * 0.22;
      const w = layout(text, fam, size).width;
      const p = textPath2D(text, fam, size, -w / 2, size * 0.35);
      const e = E('expo.in')(clamp((u - 0.35) / 0.65)), sc = 1 + e * 40;
      A();
      if (u <= 0) return;
      x.save();
      const m = x.getTransform();
      x.translate(cx, cy); x.scale(sc, sc);
      x.globalAlpha = clamp(u * 4);
      x.clip(p);
      x.setTransform(m);
      B();
      x.restore();
      return;
    }
    case 'push': {
      const e = E('expo.inOut')(u), a = o.angle ?? 0, dx = Math.cos(a) * W * e, dy = Math.sin(a) * H * e;
      x.save(); x.translate(-dx, -dy); A(); x.restore();
      x.save(); x.translate(Math.cos(a) * W - dx, Math.sin(a) * H - dy); B(); x.restore();
      return;
    }
    case 'zoom': {
      // A rushes into the centre and B comes out of it
      const e = E('expo.in')(clamp(u * 2)), f = E('expo.out')(clamp(u * 2 - 1));
      x.save();
      if (u < 0.5) { x.translate(cx, cy); x.scale(1 + e * 3, 1 + e * 3); x.translate(-cx, -cy); x.filter = `blur(${(e * 12).toFixed(1)}px)`; A(); }
      else { x.translate(cx, cy); x.scale(0.6 + 0.4 * f, 0.6 + 0.4 * f); x.translate(-cx, -cy); x.filter = `blur(${((1 - f) * 12).toFixed(1)}px)`; B(); }
      x.restore();
      return;
    }
    case 'flash': {
      (u < 0.5 ? A : B)();
      const k = 1 - Math.abs(u - 0.5) * 2;
      x.save(); x.globalAlpha = Math.pow(k, 1.5); x.fillStyle = o.color ?? '#ffffff'; x.fillRect(0, 0, W, H); x.restore();
      return;
    }
  }
}
