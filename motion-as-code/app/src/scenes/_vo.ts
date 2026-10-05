// Shared toolkit for the plates of a voiceover video (Motion as Code):
//  - lookups by content: lineOf / wordOf / phraseOf (accent-, case- and punctuation-insensitive);
//  - a 2D camera over a world in px (y down; at zoom 1 a world px is a screen px), keyframed;
//  - graph paper: a construction sheet drawn in world space (dark ink sheet or bone paper);
//  - the plotter pen: strokes drawn progressively, hot where the pen just passed, and the spark
//    (head, trail, sputter) riding the pen;
//  - world-space karaoke: words laid out on the sheet, each wiped in as it is spoken;
//  - mono annotations typed on, and small geometry helpers.
// Everything is a pure function of time. The spark motif comes from pdoom-video's _motifs.ts (MIT).
import * as THREE from 'three';
import { FSPass, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, type TextLayout } from '../engine/type';
import { strokeText, type StrokeFontName } from '../engine/stroke';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, pulse, TAU } from '../engine/util';

export type RGB = [number, number, number];
export type Ease = (x: number) => number;
export interface P { x: number; y: number }
export const pt = (x: number, y: number): P => ({ x, y });

// ================================================================== lookups by content
/** Lowercase, no accents, no punctuation: what lookups compare. */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The nth line whose text contains `q` (by content). Throws when missing: fail loudly while authoring. */
export function lineOf(ly: Lyrics, q: string, nth = 0): Line {
  const k = fold(q);
  const l = ly.lines.filter((x) => fold(x.text).includes(k))[nth];
  if (!l) throw new Error(`line not found: “${q}”`);
  return l;
}

/** The consecutive words that spell `q` (one or more words), in `line` if given (a Line or a phrase of it). */
export function phraseOf(ly: Lyrics, q: string, o: { line?: Line | string; nth?: number } = {}): Word[] {
  const want = fold(q).split(' ');
  const pool = o.line ? (typeof o.line === 'string' ? lineOf(ly, o.line).words : o.line.words) : ly.words;
  const hits: Word[][] = [];
  for (let i = 0; i + want.length <= pool.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length && ok; j++) ok = fold(pool[i + j]!.w) === want[j];
    if (ok) hits.push(pool.slice(i, i + want.length));
  }
  const h = hits[o.nth ?? 0];
  if (!h) throw new Error(`words not found: “${q}”${o.line ? ` in “${typeof o.line === 'string' ? o.line : o.line.text}”` : ''}`);
  return h;
}

/** One word by content (first match, or the nth), in `line` if given. */
export function wordOf(ly: Lyrics, q: string, o: { line?: Line | string; nth?: number } = {}): Word {
  return phraseOf(ly, q, o)[0]!;
}

/** Word progress 0..1 (Lyrics.wordProgress) and helpers on a group of words. */
export const wp = (w: Word, t: number) => Lyrics.wordProgress(w, t);
export const spanOf = (ws: Word[]) => ({ start: ws[0]!.start, end: ws[ws.length - 1]!.end });

// ================================================================== camera
/** World centre (px, y down), zoom (screen px per world px) and roll (rad). */
export interface Cam { x: number; y: number; z: number; rot: number }
export interface CamKey extends Cam { t: number; ez?: Ease }

/** A keyframed camera: eased per key (the ease on key i shapes the move into it), zooms about the move's fixed point. */
export function camAt(ks: CamKey[], t: number): Cam {
  if (t <= ks[0]!.t) return ks[0]!;
  for (let i = 1; i < ks.length; i++) {
    const b = ks[i]!;
    if (t > b.t) continue;
    const a = ks[i - 1]!;
    const k = (b.ez ?? ease.inOutCubic)(clamp((t - a.t) / Math.max(1e-4, b.t - a.t)));
    const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), k));
    const rot = lerp(a.rot, b.rot, k);
    // zoom about the point that stays put, so a push-in and a pan read as one gesture
    if (Math.abs(b.z - a.z) > a.z * 0.04) {
      const fx = (b.z * b.x - a.z * a.x) / (b.z - a.z), fy = (b.z * b.y - a.z * a.y) / (b.z - a.z);
      return { x: fx - (a.z / z) * (fx - a.x), y: fy - (a.z / z) * (fy - a.y), z, rot };
    }
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z, rot };
  }
  return ks[ks.length - 1]!;
}
export const K = (t: number, x: number, y: number, z: number, rot = 0, ez?: Ease): CamKey => ({ t, x, y, z, rot, ez });
export const IDENT: Cam = { x: W / 2, y: H / 2, z: 1, rot: 0 };

/** World -> screen px. */
export function w2s(c: Cam, x: number, y: number): [number, number] {
  const dx = (x - c.x) * c.z, dy = (y - c.y) * c.z;
  const co = Math.cos(c.rot), si = Math.sin(c.rot);
  return [W / 2 + co * dx - si * dy, H / 2 + si * dx + co * dy];
}
/** Screen px -> world. */
export function s2w(c: Cam, sx: number, sy: number): P {
  const dx = sx - W / 2, dy = sy - H / 2;
  const co = Math.cos(-c.rot), si = Math.sin(-c.rot);
  return pt(c.x + (co * dx - si * dy) / c.z, c.y + (si * dx + co * dy) / c.z);
}
/** Canvas transform that draws at world (x, y), `k` world px per drawing unit, rotated by `rot` (on top of the camera). */
export function setWorld(c2: CanvasRenderingContext2D, c: Cam, x: number, y: number, k = 1, rot = 0, j: [number, number] = [0, 0]) {
  const [sx, sy] = w2s(c, x, y);
  const s = c.z * k, a = c.rot + rot;
  c2.setTransform(s * Math.cos(a), s * Math.sin(a), -s * Math.sin(a), s * Math.cos(a), sx + j[0], sy + j[1]);
}

// ================================================================== graph paper
const PAPER_FRAG = /* glsl */ `
uniform vec4 uCam;      // world centre x, y (px, y down), zoom, roll
uniform vec2 uGrid;     // minor and major spacing (world px)
uniform float uAlpha;   // grid strength
uniform float uLight;   // 0 = ink sheet, 1 = bone paper
uniform vec3 uReveal;   // world centre x, y and radius of the revealed area (radius < 0: all)
uniform vec3 uPen;      // pen screen px (y down) and glow
uniform float uFade;    // to black (ink) / to paper (light)
uniform vec4 uAxes;     // origin x, y (world), on (0/1), unused
void main() {
  vec2 sp = vec2(vUv.x, 1.0 - vUv.y) * vec2(${W}.0, ${H}.0);
  vec2 d = sp - 0.5 * vec2(${W}.0, ${H}.0);
  float c = cos(-uCam.w), s = sin(-uCam.w);
  vec2 p = uCam.xy + vec2(c * d.x - s * d.y, s * d.x + c * d.y) / uCam.z;
  float zpx = uCam.z;                                        // screen px per world px
  vec2 gm = abs(fract(p / uGrid.x + 0.5) - 0.5) * uGrid.x * zpx; // distance to the minor lines, screen px
  vec2 gM = abs(fract(p / uGrid.y + 0.5) - 0.5) * uGrid.y * zpx;
  float minor = max(pxLine(gm.x * PX_SCALE, 0.0, 1.0), pxLine(gm.y * PX_SCALE, 0.0, 1.0));
  float major = max(pxLine(gM.x * PX_SCALE, 0.3, 1.3), pxLine(gM.y * PX_SCALE, 0.3, 1.3));
  float dens = smoothstep(5.0, 14.0, uGrid.x * zpx);         // minor lines fade out when they crowd
  float rev = uReveal.z < 0.0 ? 1.0 : smoothstep(uReveal.z, uReveal.z - 220.0, length(p - uReveal.xy));
  float g = (minor * 0.42 * dens + major) * rev * uAlpha;
  vec2 ax = abs(p - uAxes.xy) * zpx;
  float axes = uAxes.z * max(pxLine(ax.x * PX_SCALE, 0.4, 1.6), pxLine(ax.y * PX_SCALE, 0.4, 1.6)) * rev;
  vec3 col;
  if (uLight > 0.5) {
    col = mix(C_BONE * 0.86, C_BONE * 0.82, smoothstep(0.0, 1.2, length(vUv - 0.5)));
    col = mix(col, C_ASH * 0.55, g * 0.38 + axes * 0.6);
    col = mix(col, C_BONE * 0.86, uFade);
  } else {
    col = C_INK + C_BONE * (0.03 * g + 0.11 * axes);
    float pd = length(sp - uPen.xy);
    col += C_SIGNAL * 0.02 * uPen.z * exp(-pd * pd / (2.0 * 150.0 * 150.0));
    col *= 1.0 - uFade;
  }
  fragColor = vec4(col, 1.0);
}`;

export class Paper {
  pass = new FSPass(PAPER_FRAG, {
    uCam: { value: new THREE.Vector4(W / 2, H / 2, 1, 0) }, uGrid: { value: new THREE.Vector2(24, 120) }, uAlpha: { value: 1 },
    uLight: { value: 0 }, uReveal: { value: new THREE.Vector3(0, 0, -1) }, uPen: { value: new THREE.Vector3() },
    uFade: { value: 0 }, uAxes: { value: new THREE.Vector4(0, 0, 0, 0) },
  });
  constructor(minor = 24, major = 120) { (this.pass.u.uGrid!.value as THREE.Vector2).set(minor, major); }
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, c: Cam, o: { alpha?: number; light?: boolean; reveal?: [number, number, number]; pen?: [number, number, number]; fade?: number; axes?: [number, number] | null } = {}) {
    const u = this.pass.u;
    (u.uCam!.value as THREE.Vector4).set(c.x, c.y, c.z, c.rot);
    u.uAlpha!.value = o.alpha ?? 1;
    u.uLight!.value = o.light ? 1 : 0;
    (u.uReveal!.value as THREE.Vector3).set(...(o.reveal ?? [0, 0, -1]));
    (u.uPen!.value as THREE.Vector3).set(...(o.pen ?? [0, 0, 0]));
    u.uFade!.value = o.fade ?? 0;
    (u.uAxes!.value as THREE.Vector4).set(o.axes?.[0] ?? 0, o.axes?.[1] ?? 0, o.axes ? 1 : 0, 0);
    this.pass.render(r, out);
  }
}

// ================================================================== geometry
export const line = (a: P, b: P, n = 1): P[] => Array.from({ length: n + 1 }, (_, i) => pt(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n)));
export const poly = (...ps: P[]) => ps;
export const rect = (x: number, y: number, w: number, h: number): P[] => [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h), pt(x, y)];
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 64, ry = r): P[] {
  return Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n); return pt(cx + r * Math.cos(a), cy + ry * Math.sin(a)); });
}
export const circle = (cx: number, cy: number, r: number, n = 96, a0 = -Math.PI / 2) => arc(cx, cy, r, a0, a0 + TAU, n);
export function roundRect(x: number, y: number, w: number, h: number, r: number, n = 6): P[] {
  r = Math.min(r, w / 2, h / 2);
  const q = Math.PI / 2;
  return [
    ...arc(x + w - r, y + r, r, -q, 0, n), ...arc(x + w - r, y + h - r, r, 0, q, n),
    ...arc(x + r, y + h - r, r, q, 2 * q, n), ...arc(x + r, y + r, r, 2 * q, 3 * q, n), pt(x + w - r, y),
  ];
}
/** Cubic Bézier. */
export function bezier(a: P, b: P, c: P, d: P, n = 48): P[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n, v = 1 - u;
    return pt(v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x, v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y);
  });
}
/** Arrow head at b pointing from a (two short strokes). */
export function arrowHead(a: P, b: P, s = 12, spread = 0.42): P[] {
  const an = Math.atan2(b.y - a.y, b.x - a.x);
  return [pt(b.x - s * Math.cos(an - spread), b.y - s * Math.sin(an - spread)), b, pt(b.x - s * Math.cos(an + spread), b.y - s * Math.sin(an + spread))];
}
export function lengths(pts: P[]) {
  const L = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) L[i] = L[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return L;
}
export function at(pts: P[], L: Float32Array, s: number): P & { a: number } {
  const n = pts.length;
  if (n === 1) return { ...pts[0]!, a: 0 };
  s = clamp(s, 0, L[n - 1]!);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m]! < s) lo = m; else hi = m; }
  const A = pts[lo]!, B = pts[hi]!, seg = L[hi]! - L[lo]!;
  const u = seg > 0 ? (s - L[lo]!) / seg : 0;
  return { x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), a: Math.atan2(B.y - A.y, B.x - A.x) };
}

// ================================================================== the plotter
export type Ink = 'bone' | 'ash' | 'graphite' | 'signal' | 'ink';
export interface Stroke {
  pts: P[]; L: Float32Array; tot: number; t0: number; t1: number;
  pen: boolean; ez: Ease; ink: Ink; alpha: number; width: number; dash: number; hot: number; group: string;
  tD: Float32Array; // when the head reaches each point
}

/**
 * A pen plotter: strokes appear progressively between t0 and t1, hot (ember) where the head just passed,
 * cooling to their ink. Pen strokes (pen: true) are the ones the spark rides; between them it travels in a
 * quick pen-up move. Coordinates are world px.
 */
export class Plot {
  strokes: Stroke[] = [];
  pens: Stroke[] = [];
  add(pts: P[], t0: number, t1: number, o: Partial<Pick<Stroke, 'pen' | 'ez' | 'ink' | 'alpha' | 'width' | 'dash' | 'hot' | 'group'>> = {}): Stroke {
    const L = lengths(pts), tot = L[L.length - 1]!, ez = o.ez ?? ease.inOutQuad;
    const tD = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const target = tot > 0 ? L[i]! / tot : 1;
      let lo = 0, hi = 1;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (ez(m) < target) lo = m; else hi = m; }
      tD[i] = t0 + (t1 - t0) * hi;
    }
    const s: Stroke = { pts, L, tot, t0, t1, pen: o.pen ?? false, ez, ink: o.ink ?? 'bone', alpha: o.alpha ?? 1, width: o.width ?? 1.4, dash: o.dash ?? 0, hot: o.hot ?? 1, group: o.group ?? 'main', tD };
    this.strokes.push(s);
    if (s.pen) { this.pens.push(s); this.pens.sort((a, b) => a.t0 - b.t0); }
    return s;
  }
  /** The pen waits at p around time t (a pen-up waypoint). */
  wait(p: P, t: number, hold = 0.05) { this.add([p, pt(p.x + 1e-3, p.y)], t, t + Math.max(1e-3, hold), { pen: true, alpha: 0 }); }
  /** Single-stroke lettering written by the pen, left baseline at (x, y), em size `size` world px. */
  write(text: string, x: number, y: number, size: number, t0: number, t1: number, o: { font?: StrokeFontName; group?: string; ink?: Ink; width?: number; pen?: boolean; tracking?: number } = {}) {
    const st = strokeText(text, o.font ?? 'tech', 100, o.tracking ?? 0);
    const k = size / 100;
    let acc = 0;
    st.strokes.forEach((s, i) => {
      const len = st.lens[i]![st.lens[i]!.length - 1] ?? 0;
      const a = t0 + (t1 - t0) * (acc / st.total), b = t0 + (t1 - t0) * ((acc + len) / st.total);
      acc += len;
      if (s.length >= 2) this.add(s.map((p) => pt(x + p.x * k, y + p.y * k)), a, b, { pen: o.pen ?? true, ez: ease.linear, width: o.width ?? 1.6, ink: o.ink ?? 'bone', group: o.group });
    });
    return st.width * k;
  }
  /** Where the pen is at t (null before its first stroke, if `before` is false). */
  penAt(t: number, rest?: P): P {
    const ps = this.pens;
    let prev: Stroke | null = null;
    for (const s of ps) {
      if (t < s.t0) {
        const from = prev ? prev.pts[prev.pts.length - 1]! : rest ?? s.pts[0]!;
        const to = s.pts[0]!;
        const tPrev = prev ? prev.t1 : s.t0 - 1;
        const d = Math.hypot(to.x - from.x, to.y - from.y);
        const dur = Math.min(s.t0 - tPrev, clamp(0.08 + d * 0.0006, 0.08, 0.3));
        const k = ease.inOutCubic(clamp((t - (s.t0 - dur)) / Math.max(1e-4, dur)));
        return pt(lerp(from.x, to.x, k), lerp(from.y, to.y, k));
      }
      if (t <= s.t1) {
        const k = s.ez(clamp((t - s.t0) / Math.max(1e-4, s.t1 - s.t0)));
        return at(s.pts, s.L, k * s.tot);
      }
      prev = s;
    }
    return prev ? prev.pts[prev.pts.length - 1]! : rest ?? pt(0, 0);
  }
  /** Draw every started stroke into a 2D LineBatch (screen px through the camera). */
  draw(L: LineBatch, t: number, c: Cam, ga: (group: string, t: number) => number = () => 1, map: (p: P) => [number, number] = (p) => w2s(c, p.x, p.y)) {
    const sig = LIN.signal, emb = LIN.ember;
    for (const s of this.strokes) {
      if (t < s.t0 || s.alpha <= 0) continue;
      const g = ga(s.group, t);
      if (g <= 0.002) continue;
      const head = s.ez(clamp((t - s.t0) / Math.max(1e-4, s.t1 - s.t0))) * s.tot;
      const base = LIN[s.ink];
      const A = s.alpha * g;
      const wpx = s.width * Math.max(0.6, Math.min(2.2, Math.sqrt(c.z)));
      let prev: [number, number] | null = null;
      let acc = 0;
      for (let i = 0; i < s.pts.length; i++) {
        let p: P = s.pts[i]!;
        let stop = false;
        if (s.L[i]! > head) {
          if (i === 0) break;
          p = at(s.pts, s.L, head);
          stop = true;
        }
        const cur = map(p);
        if (prev) {
          const segLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
          const age = t - Math.min(s.tD[i]!, t);
          const h1 = s.hot * Math.exp(-age / 0.05), h2 = s.hot * Math.exp(-age / 0.32);
          const col: RGB = [
            base[0] * (1 - h2) + sig[0] * 1.5 * h2 + emb[0] * 2.6 * h1,
            base[1] * (1 - h2) + sig[1] * 1.5 * h2 + emb[1] * 2.6 * h1,
            base[2] * (1 - h2) + sig[2] * 1.5 * h2 + emb[2] * 2.6 * h1,
          ];
          const al = Math.min(1, A + h2 * 0.8 * g);
          const wd = wpx * (1 + 0.6 * h1);
          if (s.dash > 0) {
            const dash = s.dash * Math.max(0.5, c.z);
            let u0 = 0;
            while (u0 < segLen) {
              const ph = (acc + u0) % dash;
              const on = ph < dash * 0.55;
              const run = Math.min(segLen - u0, on ? dash * 0.55 - ph : dash - ph);
              if (on && run > 0.05) {
                const a1 = u0 / segLen, b1 = (u0 + run) / segLen;
                L.seg2(lerp(prev[0], cur[0], a1), lerp(prev[1], cur[1], a1), lerp(prev[0], cur[0], b1), lerp(prev[1], cur[1], b1), wd, col, al);
              }
              u0 += Math.max(run, 0.05);
            }
          } else L.seg2(prev[0], prev[1], cur[0], cur[1], wd, col, al);
          acc += segLen;
        }
        prev = cur;
        if (stop) break;
      }
    }
  }
  /** True while the pen is drawing (on a visible pen stroke) at t. */
  drawing(t: number) { return this.pens.some((s) => s.alpha > 0 && t >= s.t0 && t <= s.t1); }
}

/** The spark riding a pen: a short hot trail, sputtering particles and the head. */
export function drawSpark(X: LineBatch, t: number, posAt: (t: number) => [number, number] | null, o: { intensity?: number; scale?: number; rate?: number; seed?: number; since?: number } = {}) {
  const I = o.intensity ?? 1;
  if (I <= 0.001) return;
  const p = posAt(t);
  if (!p) return;
  let prev = p, trail = 0;
  for (let i = 1; i <= 12; i++) {
    const tt = t - i * 0.007;
    if (o.since !== undefined && tt < o.since) break;
    const s = posAt(tt);
    if (!s) break;
    const k = 1 - i / 13;
    trail += Math.hypot(s[0] - prev[0], s[1] - prev[1]);
    const fade = (1 - clamp((trail - 90) / 60)) * I;
    if (fade <= 0) break;
    X.seg2(prev[0], prev[1], s[0], s[1], 2.0 * k + 0.6, [LIN.ember[0] * 3 * k * fade, LIN.ember[1] * 3 * k * fade, LIN.ember[2] * 3 * k * fade], k * fade);
    prev = s;
  }
  sparkParticles(X, t, (tb) => {
    if (o.since !== undefined && tb < o.since) return null;
    const q = posAt(tb);
    return q ? { x: q[0], y: q[1] } : null;
  }, { rate: o.rate ?? 70, intensity: 0.9 * I, seed: o.seed ?? 17, life: 0.42 });
  sparkHead(X, p[0], p[1], t, o.scale ?? 1, I);
}

/**
 * Sputtering particles for a spark whose head position over time is `headAt(t)` (pdoom-video, MIT).
 * Particles are born at fixed times with hashed velocities, so every sub-frame sees the same ones.
 */
export function sparkParticles(lb: LineBatch, t: number, headAt: (t: number) => P | null, o: { rate?: number | ((tb: number) => number); rateMax?: number; life?: number; speed?: number; gravity?: number; intensity?: number; seed?: number; width?: number } = {}) {
  const life = o.life ?? 0.45, speed = o.speed ?? 260, g = o.gravity ?? 520, I = o.intensity ?? 1, seed = o.seed ?? 1;
  const rateAt = typeof o.rate === 'function' ? o.rate : null;
  const rate = rateAt ? o.rateMax! : (o.rate as number | undefined) ?? 90;
  if (!(rate > 0)) return;
  const n0 = Math.floor((t - life) * rate), n1 = Math.floor(t * rate);
  for (let n = n0; n <= n1; n++) {
    const tb = n / rate;
    if (tb > t) continue;
    if (rateAt && hash(n, seed + 3) * rate >= rateAt(tb)) continue;
    const age = t - tb;
    const h = headAt(tb);
    if (!h) continue;
    const a = hash(n, seed) * TAU, sp = speed * (0.25 + hash(n, seed + 1) ** 2 * 1.2);
    const lf = life * (0.35 + 0.65 * hash(n, seed + 2));
    if (age > lf) continue;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - speed * 0.3;
    const x = h.x + vx * age, y = h.y + vy * age + 0.5 * g * age * age;
    const dtb = 0.018;
    const x0 = h.x + vx * Math.max(0, age - dtb), y0 = h.y + vy * Math.max(0, age - dtb) + 0.5 * g * Math.max(0, age - dtb) ** 2;
    const k = 1 - age / lf;
    const heat = k * k;
    const col: RGB = [
      (LIN.signal[0] + (1 - LIN.signal[0]) * heat) * 2.2 * I,
      (LIN.signal[1] + (0.8 - LIN.signal[1]) * heat) * 2.2 * I,
      (LIN.signal[2] + (0.5 - LIN.signal[2]) * heat) * 2.2 * I,
    ];
    lb.seg2(x0, y0, x, y, (o.width ?? 1.6) * (0.5 + k * 0.7), col, Math.min(1, k * 1.4));
  }
}

/** The spark head: a white-hot core and an orange halo (pdoom-video, MIT). */
export function sparkHead(lb: LineBatch, x: number, y: number, t: number, scale = 1, intensity = 1) {
  const flick = 0.85 + 0.15 * Math.sin(t * 91.7) * Math.sin(t * 57.3);
  const I = intensity * flick;
  lb.seg2(x, y, x + 0.01, y, 26 * scale, [LIN.signal[0] * 0.5 * I, LIN.signal[1] * 0.5 * I, LIN.signal[2] * 0.5 * I], 0.35);
  lb.seg2(x, y, x + 0.01, y, 12 * scale, [LIN.ember[0] * 2.5 * I, LIN.ember[1] * 2.5 * I, LIN.ember[2] * 2.5 * I], 0.8);
  lb.seg2(x, y, x + 0.01, y, 5 * scale, [6 * I, 5 * I, 4 * I], 1);
  for (let i = 0; i < 4; i++) {
    const a = i * (TAU / 4) + t * 3 + 0.4;
    const r = (9 + 5 * hash(Math.floor(t * 30), i)) * scale;
    lb.seg2(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, 1.2 * scale, [3 * I, 1.2 * I, 0.4 * I], 0.8);
  }
}

/** A radial burst of hot streaks from (x, y) starting at t0 (screen px). */
export function burst(X: LineBatch, t: number, t0: number, x: number, y: number, o: { n?: number; speed?: number; life?: number; seed?: number; intensity?: number; dir?: number; spread?: number } = {}) {
  const age = t - t0;
  const life = o.life ?? 0.6;
  if (age < 0 || age > life * 1.2) return;
  const n = o.n ?? 60, seed = o.seed ?? 3, I = o.intensity ?? 1;
  for (let i = 0; i < n; i++) {
    const lf = life * (0.4 + 0.6 * hash(i, seed));
    const a2 = age - hash(i, seed + 1) * 0.04;
    if (a2 < 0 || a2 > lf) continue;
    const an = (o.dir ?? 0) + (o.spread !== undefined ? (hash(i, seed + 2) - 0.5) * o.spread : hash(i, seed + 2) * TAU);
    const sp = (o.speed ?? 900) * (0.25 + hash(i, seed + 3) ** 2);
    const pos = (tt: number) => { const d = sp * tt * (1 - 0.45 * tt / lf); return [x + Math.cos(an) * d, y + Math.sin(an) * d + 300 * tt * tt] as const; };
    const p1 = pos(a2), p0 = pos(Math.max(0, a2 - 0.03));
    const k = 1 - a2 / lf;
    X.seg2(p0[0], p0[1], p1[0], p1[1], 1.1 + 1.4 * k, [(LIN.signal[0] + k) * 2.4 * I, (LIN.signal[1] + 0.7 * k * k) * 2.4 * I, (LIN.signal[2] + 0.4 * k * k) * 2.4 * I], Math.min(1, k * 1.5));
  }
}

// ================================================================== world-space type
export interface KWord { w: Word; text: string; x: number; y: number; size: number; fam: string; lay: TextLayout; tAnt: number; group: string }

/**
 * Lay words out from (x, y) (left baseline, world px) at `size` px, wrapping at `maxW` (a new line every
 * `lead` × size). `texts` overrides what is shown for each word (e.g. upper case).
 */
export function layWords(words: Word[], x: number, y: number, size: number, fam: string, o: { texts?: string[]; maxW?: number; lead?: number; ant?: number; group?: string; tracking?: number; align?: 'left' | 'center' | 'right' } = {}): KWord[] {
  const sp = layout(' ', fam, 100).width / 100 * size;
  const rows: KWord[][] = [[]];
  let cx = 0;
  words.forEach((w, i) => {
    const text = o.texts?.[i] ?? w.w;
    const lay = layout(text, fam, 100, (o.tracking ?? 0) * 100);
    const wd = (lay.width / 100) * size;
    if (o.maxW && cx > 0 && cx + wd > o.maxW) { rows.push([]); cx = 0; }
    rows[rows.length - 1]!.push({ w, text, x: cx, y: 0, size, fam, lay, tAnt: w.start - (o.ant ?? 0.3), group: o.group ?? 'main' });
    cx += wd + sp;
  });
  const out: KWord[] = [];
  rows.forEach((r, ri) => {
    const last = r[r.length - 1];
    const rw = last ? last.x + (last.lay.width / 100) * size : 0;
    const dx = o.align === 'center' ? -rw / 2 : o.align === 'right' ? -rw : 0;
    for (const k of r) { k.x += x + dx; k.y = y + ri * (o.lead ?? 1.12) * size; out.push(k); }
  });
  return out;
}

/** Width (world px) of a laid-out word. */
export const kwWidth = (k: KWord) => (k.lay.width / 100) * k.size;

/**
 * Draw karaoke words: unsung words are outlined in ash (from tAnt), the spoken part wipes in signal glyph by
 * glyph and cools to bone after the word ends. `hot` adds a brief ember flash at each word's start.
 */
export function drawWords(c2: CanvasRenderingContext2D, c: Cam, ws: KWord[], t: number, o: { alpha?: number | ((k: KWord) => number); sung?: string; rest?: string; cool?: number; outline?: boolean; jit?: (k: KWord, gi: number) => [number, number]; scale?: (k: KWord) => number; cooled?: string; whole?: boolean } = {}) {
  c2.textBaseline = 'alphabetic';
  c2.textAlign = 'left';
  for (const k of ws) {
    if (t < k.tAnt) continue;
    const ga = typeof o.alpha === 'function' ? o.alpha(k) : o.alpha ?? 1;
    if (ga <= 0.003) continue;
    const px = c.z * k.size;
    if (px < 3 || px > 6000) continue;
    const ant = prog(t, k.tAnt, k.tAnt + 0.18);
    const p = o.whole ? (t >= k.w.start ? 1 : 0) : Lyrics.wordProgress(k.w, t);
    const done = prog(t, k.w.end, k.w.end + (o.cool ?? 0.35));
    const n = k.lay.glyphs.length;
    const sc = o.scale ? o.scale(k) : 1;
    c2.font = font(k.fam, 100);
    for (const g of k.lay.glyphs) {
      const j = o.jit ? o.jit(k, g.i) : [0, 0] as [number, number];
      const kk = k.size / 100;
      if (sc !== 1) {
        const cx = k.x + kwWidth(k) / 2, cy = k.y - 0.35 * k.size;
        setWorld(c2, c, cx + (k.x + g.x * kk - cx) * sc, cy + (k.y - cy) * sc, kk * sc, 0, j);
      } else setWorld(c2, c, k.x + g.x * kk, k.y, kk, 0, j);
      const gp = clamp(p * n - g.i);
      if (gp < 1 && o.outline !== false) {
        c2.lineWidth = (1.1 * 100) / Math.max(1, px * sc);
        c2.strokeStyle = rgba(o.rest ?? 'ash', 0.45 * ant * ga);
        c2.strokeText(g.ch, 0, 0);
      }
      if (gp > 0) {
        c2.save();
        if (gp < 1) { c2.beginPath(); c2.rect(-20, -130, g.w * gp + 20, 190); c2.clip(); }
        c2.fillStyle = done < 1 ? mixCss(o.sung ?? 'signal', o.cooled ?? 'bone', done, ga) : rgba(o.cooled ?? 'bone', ga);
        c2.fillText(g.ch, 0, 0);
        c2.restore();
      }
    }
  }
  c2.setTransform(1, 0, 0, 1, 0, 0);
}

// ================================================================== annotations
export interface Note { text: string; x: number; y: number; size: number; t0: number; dur: number; col: string; a: number; align: CanvasTextAlign; rot: number; group: string; weight: number; hot: number; fam?: string }

/** Small mono annotations typed on (a caret runs ahead of the text while it types). World px. */
export class Notes {
  list: Note[] = [];
  add(text: string, x: number, y: number, t0: number, o: Partial<Omit<Note, 'text' | 'x' | 'y' | 't0'>> = {}) {
    const n: Note = { text, x, y, t0, size: o.size ?? 16, dur: o.dur ?? Math.min(0.5, 0.012 * text.length + 0.06), col: o.col ?? 'ash', a: o.a ?? 0.9, align: o.align ?? 'left', rot: o.rot ?? 0, group: o.group ?? 'main', weight: o.weight ?? 400, hot: o.hot ?? 0, fam: o.fam };
    this.list.push(n);
    return n;
  }
  draw(c2: CanvasRenderingContext2D, c: Cam, t: number, ga: (group: string, t: number) => number = () => 1) {
    c2.textBaseline = 'alphabetic';
    for (const n of this.list) {
      if (t < n.t0) continue;
      const g = ga(n.group, t);
      if (g <= 0.003) continue;
      const shown = Math.floor(n.text.length * clamp((t - n.t0) / Math.max(0.01, n.dur)) + 1e-3);
      if (shown <= 0) continue;
      setWorld(c2, c, n.x, n.y, n.size / 100, n.rot);
      c2.font = font(n.fam ?? F.mono(n.weight), 100);
      c2.textAlign = n.align;
      const hk = n.hot > 0 ? 1 - prog(t, n.t0 + n.dur, n.t0 + n.dur + n.hot) : 0;
      c2.fillStyle = hk > 0 ? mixCss(n.col, 'signal', hk, n.a * g) : rgba(n.col, n.a * g);
      const s = n.align === 'left' ? n.text.slice(0, shown) : n.text;
      c2.fillText(s, 0, 0);
      if (shown < n.text.length && n.align === 'left') {
        c2.fillStyle = rgba('signal', g);
        c2.fillRect(c2.measureText(s).width + 6, -74, 54, 88);
      }
    }
    c2.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// ================================================================== small things
/** CSS colour between two palette keys (0 = a, 1 = b) with alpha. */
export function mixCss(a: string, b: string, k: number, alpha = 1) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * clamp(k))).join(',')},${alpha})`;
}
/** Linear RGB between two palette keys. */
export const mixLin = (a: keyof typeof LIN, b: keyof typeof LIN, k: number, s = 1): RGB => [0, 1, 2].map((i) => lerp(LIN[a][i]!, LIN[b][i]!, clamp(k)) * s) as RGB;
/** A slam: 0 before t0, overshoots to 1 (scale-like) with a quick settle. */
export const slam = (t: number, t0: number, dur = 0.22) => (t < t0 ? 0 : ease.outBack(clamp((t - t0) / dur), 2.2));
/** A punch envelope for post zoom/shake after an event. */
export const punch = (t: number, t0: number, hl = 0.08) => pulse(t, t0, hl);
/** Typed prefix of a string at a given rate (chars per second) from t0. */
export const typed = (s: string, t: number, t0: number, cps = 40) => s.slice(0, Math.max(0, Math.min(s.length, Math.floor((t - t0) * cps))));
/** A caret blink (1 = on), solid while typing recently. */
export const caretOn = (t: number, lastKey: number) => (t - lastKey < 0.45 ? 1 : Math.floor(t * 2.2) % 2 === 0 ? 1 : 0);
/** Draw a filled right-pointing triangle (▸; Plex Mono has none). */
export function tri(c2: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c2.beginPath(); c2.moveTo(x - r * 0.8, y - r); c2.lineTo(x + r * 0.9, y); c2.lineTo(x - r * 0.8, y + r); c2.closePath(); c2.fill();
}
