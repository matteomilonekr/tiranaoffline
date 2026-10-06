// The set every plate of this film shares, and the plate they all extend.
//  - the set: a coloured pegboard wall, the presenter (Matteo, drawn) behind a counter, the captions on the
//    counter, the HUD (a black tag top left, the power strip top right that the four plugins plug into);
//  - Plate: draws the set and calls the plate's own props (behind the presenter, held, in front of the
//    counter); a plate opens with a circle wipe over the previous one (the entries overlap by OVERLAP);
//  - props every plate uses: terminal windows, cards, sticky notes, odometers, stamps, ticks.
// Flat illustration: thick ink outlines, hard offset shadows, a pegboard of dots. Canvas2D, a pure function of t.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT, W, H } from '@kit/engine/gl';
import { F, font, measure } from '@kit/engine/type';
import type { AudioSample } from '@kit/engine/audio';
import type { Lyrics, Word } from '@kit/engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog, TAU } from '@kit/engine/util';

export const INK = '#17151a';
export const PAPER = '#fffdf5';
export const YELLOW = '#ffd93d';
export const RED = '#e8452c';
export const GREEN = '#22a36b';
export const TERM = '#1d1c22';
/** The four plugins: their colours (plugs, cables) and names, in order. */
export const PLUG = ['#3a6ee8', '#1f9a6e', '#f08a1c', '#7c55e6'];
export const PLUG_NAMES = ['SUPERPOWERS', 'KARPATHY', 'I-HAVE-ADHD', 'OCTOPUS'];
export const LW = 6; // outline width

export interface Pal { wall: string; wall2: string; counter: string; top: string }
export const PAL: Record<string, Pal> = {
  hook: { wall: '#f2e7d2', wall2: '#ece0c8', counter: '#7a4f33', top: '#946240' },
  super: { wall: '#c2d3f1', wall2: '#b6c8ea', counter: '#2b55c8', top: '#3f6adc' },
  karpathy: { wall: '#bfe2d2', wall2: '#b1d9c7', counter: '#1d7d61', top: '#289470' },
  adhd: { wall: '#f4d97c', wall2: '#efcf68', counter: '#df7a1e', top: '#f08f2e' },
  octopus: { wall: '#cabef0', wall2: '#bfb1ea', counter: '#7657d4', top: '#896ce4' },
  cta: { wall: '#f3eada', wall2: '#eee2cc', counter: '#ec7820', top: '#f78f36' },
};

// layout (1080x1920). The app's own UI covers the top ~130 px, the bottom ~380 px and a column on the right
// from ~1000 px down: the HUD sits just under the top bar, the captions on the counter.
export const COUNTER_Y = 1270;
export const HEAD_Y = 975;
export const CAPTION_Y = 1480;
export const HUD_Y = 168;
/** How long a plate's entry overlaps the next one: the next plate's circle wipe (s). */
export const OVERLAP = 0.42;

// ------------------------------------------------------------------ drawing helpers
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

/** A flat card: hard ink shadow, fill, ink outline. */
export function card(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number,
  o: { fill?: string; r?: number; shadow?: number; line?: number; alpha?: number } = {}) {
  const r = o.r ?? 18, sh = o.shadow ?? 10;
  x.save();
  x.globalAlpha *= o.alpha ?? 1;
  if (sh) { rr(x, x0 + sh, y0 + sh, w, h, r); x.fillStyle = INK; x.fill(); }
  rr(x, x0, y0, w, h, r);
  x.fillStyle = o.fill ?? PAPER;
  x.fill();
  if (o.line !== 0) { x.lineWidth = o.line ?? LW; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke(); }
  x.restore();
}

export function text(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number,
  o: { fam?: string; color?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline; alpha?: number; maxW?: number } = {}) {
  if (!s) return;
  x.save();
  x.globalAlpha *= o.alpha ?? 1;
  x.font = font(o.fam ?? F.grotesk(700), size);
  x.fillStyle = o.color ?? INK;
  x.textAlign = o.align ?? 'left';
  x.textBaseline = o.base ?? 'alphabetic';
  if (o.maxW) x.fillText(s, px, py, o.maxW); else x.fillText(s, px, py);
  x.restore();
}

/** Pop-in scale: 0 before t0, then 0 -> overshoot -> 1 over `d` seconds. */
export const pop = (t: number, t0: number, d = 0.3) => (t < t0 ? 0 : ease.outBack(prog(t, t0, t0 + d)));
/** A prop's life: pops in at t0, shrinks away over the 0.22 s before t1. */
export const life = (t: number, t0: number, t1 = Infinity, d = 0.3) =>
  Math.min(pop(t, t0, d), t1 === Infinity ? 1 : 1 - ease.inBack(prog(t, t1 - 0.22, t1)));
/** Typed prefix of s at t (cps characters per second from t0). */
export const typed = (s: string, t: number, t0: number, cps = 38) => s.slice(0, Math.max(0, Math.min(s.length, Math.floor((t - t0) * cps))));
/** A short decaying bump at t0 (1 -> 0 over d). */
export const bump = (t: number, t0: number, d = 0.25) => (t < t0 ? 0 : Math.max(0, 1 - (t - t0) / d) ** 2);

/** Draw `fn` scaled by s and rotated by rot about (cx, cy); skipped while s is ~0. */
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

export function mixHex(a: string, b: string, u: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  const c = [0, 1, 2].map((i) => Math.round(lerp(p(a, i), p(b, i), clamp(u))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------------ wall and counter
export function wall(x: CanvasRenderingContext2D, pal: Pal, t: number) {
  x.fillStyle = pal.wall;
  x.fillRect(0, 0, W, COUNTER_Y);
  // wallpaper: faint broad stripes
  x.fillStyle = pal.wall2;
  for (let sx = -30; sx < W; sx += 120) x.fillRect(sx, 0, 60, COUNTER_Y);
  // pegboard: a grid of holes, a few of them twinkling
  x.fillStyle = 'rgba(23,21,26,0.24)';
  for (let gy = 44; gy < COUNTER_Y - 20; gy += 48) {
    for (let gx = 30; gx < W; gx += 48) { x.beginPath(); x.arc(gx, gy, 3.6, 0, TAU); x.fill(); }
  }
  for (let j = 0, gy = 44; gy < COUNTER_Y - 20; gy += 48, j++) {
    for (let i = 0, gx = 30; gx < W; gx += 48, i++) {
      const h = hash(i, j, 5);
      if (h > 0.985) {
        const tw = 0.5 + 0.5 * Math.sin(t * (2 + 3 * h) + h * 40);
        sparkle(x, gx + 24, gy + 24, 9 + 7 * tw, 0.5 + 0.5 * tw);
      }
    }
  }
  // a soft spotlight: the corners and the floor of the wall darker
  const g = x.createRadialGradient(W / 2, 760, 200, W / 2, 760, 1150);
  g.addColorStop(0, 'rgba(23,21,26,0)');
  g.addColorStop(1, 'rgba(23,21,26,0.26)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, COUNTER_Y);
}

export function counter(x: CanvasRenderingContext2D, pal: Pal) {
  const y0 = COUNTER_Y;
  x.fillStyle = pal.counter;
  x.fillRect(0, y0, W, H - y0);
  // panel seams and handles
  x.strokeStyle = 'rgba(0,0,0,0.3)';
  x.lineWidth = 5;
  for (const sx of [W / 3, (2 * W) / 3]) { x.beginPath(); x.moveTo(sx, y0 + 40); x.lineTo(sx, H); x.stroke(); }
  x.fillStyle = 'rgba(0,0,0,0.35)';
  for (const sx of [W / 6, W / 2, (5 * W) / 6]) { rr(x, sx - 46, y0 + 78, 92, 14, 7); x.fill(); }
  // the top: a lighter lip, ink edges, its shadow on the front
  x.fillStyle = pal.top;
  x.fillRect(0, y0 - 4, W, 40);
  x.fillStyle = INK;
  x.fillRect(0, y0 - 8, W, LW);
  x.fillRect(0, y0 + 34, W, LW);
  x.fillStyle = 'rgba(0,0,0,0.2)';
  x.fillRect(0, y0 + 40, W, 18);
  // the light falls off towards the floor
  const g = x.createLinearGradient(0, y0, 0, H);
  g.addColorStop(0, 'rgba(10,8,12,0)');
  g.addColorStop(1, 'rgba(10,8,12,0.55)');
  x.fillStyle = g;
  x.fillRect(0, y0 + 40, W, H - y0 - 40);
}

/** A four-point twinkle. */
export function sparkle(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, a = 1, col = '#ffffff') {
  if (a <= 0.01 || r <= 0.5) return;
  x.save();
  x.globalAlpha *= Math.min(1, a);
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4, k = i % 2 ? r * 0.28 : r;
    x.lineTo(cx + k * Math.cos(ang), cy + k * Math.sin(ang));
  }
  x.closePath();
  x.fillStyle = col; x.fill();
  x.lineWidth = 2.5; x.strokeStyle = INK; x.stroke();
  x.restore();
}

// ------------------------------------------------------------------ the presenter (Matteo, drawn)
const SKIN = '#e8b28c', SKIN_D = '#c98b66', HAIR = '#2b1c15', HAIR_L = '#4a3326', SHIRT = '#1f1e23', SHIRT_L = '#3a3940';
export const PRESENTER_SCALE = 1.1;

export type Hand = 'open' | 'point' | 'fist' | 'thumb' | 'none';
/** A pose: where each hand is (relative to the head's centre, in presenter px) and what it does. */
export interface Pose { l: [number, number]; r: [number, number]; lh: Hand; rh: Hand; brow: number; tilt: number }
const DOWN_L: [number, number] = [-250, 440], DOWN_R: [number, number] = [250, 440];
export const POSES: Record<string, Pose> = {
  idle: { l: DOWN_L, r: DOWN_R, lh: 'none', rh: 'none', brow: 0, tilt: 0 },
  wave: { l: DOWN_L, r: [300, -110], lh: 'none', rh: 'open', brow: 0.7, tilt: -0.04 },
  stop: { l: [-235, -10], r: DOWN_R, lh: 'open', rh: 'none', brow: -0.5, tilt: 0.03 },
  stopR: { l: DOWN_L, r: [235, -10], lh: 'none', rh: 'open', brow: -0.5, tilt: -0.03 },
  pointR: { l: DOWN_L, r: [300, -170], lh: 'none', rh: 'point', brow: 0.4, tilt: -0.03 },
  pointL: { l: [-300, -170], r: DOWN_R, lh: 'point', rh: 'none', brow: 0.4, tilt: 0.03 },
  pointUp: { l: DOWN_L, r: [220, -300], lh: 'none', rh: 'point', brow: 0.6, tilt: -0.02 },
  pointUpL: { l: [-220, -300], r: DOWN_R, lh: 'point', rh: 'none', brow: 0.6, tilt: 0.02 },
  both: { l: [-320, -90], r: [320, -90], lh: 'open', rh: 'open', brow: 1, tilt: 0 },
  presentR: { l: DOWN_L, r: [330, 60], lh: 'none', rh: 'open', brow: 0.3, tilt: -0.02 },
  presentL: { l: [-330, 60], r: DOWN_R, lh: 'open', rh: 'none', brow: 0.3, tilt: 0.02 },
  shrug: { l: [-300, 110], r: [300, 110], lh: 'open', rh: 'open', brow: 0.9, tilt: 0.05 },
  thumb: { l: DOWN_L, r: [250, 90], lh: 'none', rh: 'thumb', brow: 0.5, tilt: -0.03 },
  think: { l: DOWN_L, r: [70, 190], lh: 'none', rh: 'fist', brow: -0.4, tilt: 0.06 },
  hold: { l: [-150, 250], r: [150, 250], lh: 'fist', rh: 'fist', brow: 0.4, tilt: 0 },
  holdL: { l: [-205, 112], r: DOWN_R, lh: 'fist', rh: 'none', brow: 0.5, tilt: 0.04 },
};

/** Poses keyed on time: [[t, pose], ...]; the hands travel to each new pose in 0.3 s. */
export class Gestures {
  keys: [number, string][];
  constructor(keys: [number, string][]) { this.keys = [...keys].sort((a, b) => a[0] - b[0]); }
  at(t: number): { pose: Pose; name: string; since: number } {
    let i = -1;
    for (let k = 0; k < this.keys.length; k++) if (this.keys[k]![0] <= t) i = k;
    const cur = i >= 0 ? this.keys[i]! : ([-1, 'idle'] as [number, string]);
    const prev = i > 0 ? this.keys[i - 1]! : ([-1, 'idle'] as [number, string]);
    const a = POSES[prev[1]]!, b = POSES[cur[1]]!;
    const u = ease.inOutCubic(prog(t, cur[0], cur[0] + 0.3));
    const mixP = (p: [number, number], q: [number, number]): [number, number] => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)];
    return {
      pose: { l: mixP(a.l, b.l), r: mixP(a.r, b.r), lh: u < 0.5 ? a.lh : b.lh, rh: u < 0.5 ? a.rh : b.rh, brow: lerp(a.brow, b.brow, u), tilt: lerp(a.tilt, b.tilt, u) },
      name: cur[1], since: t - cur[0],
    };
  }
}

/** Where the presenter's hands are at t, in screen px (to hang props on them). */
export function handsAt(g: Gestures, t: number, px: number): { l: [number, number]; r: [number, number] } {
  const { pose } = g.at(t), s = PRESENTER_SCALE;
  return { l: [px + pose.l[0] * s, HEAD_Y + pose.l[1] * s], r: [px + pose.r[0] * s, HEAD_Y + pose.r[1] * s] };
}

function blink(t: number) {
  // about every 3.4 s, 0.15 s long
  const slot = Math.floor(t / 3.4), at = slot * 3.4 + 0.8 + hash(slot, 3) * 1.6;
  const d = Math.abs(t - at);
  return d < 0.075 ? 1 - d / 0.075 : 0;
}

function limb(x: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, c: string) {
  x.lineCap = 'round';
  x.strokeStyle = INK; x.lineWidth = w + 2 * LW;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
  x.strokeStyle = c; x.lineWidth = w;
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
}

function arm(x: CanvasRenderingContext2D, sx: number, sy: number, hx: number, hy: number, side: number, hand: Hand) {
  const L1 = 170, L2 = 165;
  let dx = hx - sx, dy = hy - sy;
  let d = Math.hypot(dx, dy);
  if (d > L1 + L2 - 4) { const k = (L1 + L2 - 4) / d; dx *= k; dy *= k; d = L1 + L2 - 4; hx = sx + dx; hy = sy + dy; }
  const a = Math.atan2(dy, dx);
  const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * Math.max(d, 1)), -1, 1));
  const ea = a + side * A; // the elbow bends out, away from the body
  const ex = sx + L1 * Math.cos(ea), ey = sy + L1 * Math.sin(ea);
  limb(x, ex, ey, hx, hy, 46, SKIN); // forearm
  limb(x, sx, sy, ex, ey, 64, SHIRT); // sleeve
  x.save(); // the sleeve's hem
  x.translate(lerp(sx, ex, 0.86), lerp(sy, ey, 0.86));
  x.rotate(Math.atan2(ey - sy, ex - sx));
  x.fillStyle = SHIRT_L; x.fillRect(-4, -32, 8, 64);
  x.restore();
  if (hand !== 'none') drawHand(x, hx, hy, Math.atan2(hy - ey, hx - ex), hand, side);
}

function drawHand(x: CanvasRenderingContext2D, px: number, py: number, dir: number, hand: Hand, side: number) {
  x.save();
  x.translate(px, py);
  // open palms and thumbs stay upright; a pointing finger and a fist follow the forearm
  x.rotate(hand === 'open' ? side * 0.12 : hand === 'thumb' ? 0 : dir + Math.PI / 2);
  const finger = (fx: number, fy: number, len: number, ang: number, w = 21) => {
    x.save(); x.translate(fx, fy); x.rotate(ang);
    rr(x, -w / 2, -len, w, len + 10, w / 2);
    x.fillStyle = SKIN; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
    x.restore();
  };
  if (hand === 'open') {
    for (let i = 0; i < 4; i++) finger(-27 + i * 18, -24, 48 - Math.abs(i - 1.5) * 7, (i - 1.5) * 0.13);
    finger(side * -36, 4, 38, side * -1.05, 23);
  } else if (hand === 'point') {
    finger(-4, -26, 66, 0.02);
  } else if (hand === 'thumb') {
    finger(-4, -30, 52, 0, 26);
  }
  x.beginPath();
  x.ellipse(0, 0, 40, 36, 0, 0, TAU);
  x.fillStyle = SKIN; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
  if (hand !== 'open') { // knuckles
    x.strokeStyle = 'rgba(80,30,20,0.45)'; x.lineWidth = 4; x.lineCap = 'round';
    for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(-24, i * 12 + 2); x.lineTo(10, i * 12 + 2); x.stroke(); }
  }
  x.restore();
}

/** The presenter at t: head centre at (px, HEAD_Y); pose from `g`, mouth on the voice, blinks, a little bob.
 *  `held` draws in front of his body and behind his hands (a sign he holds up). */
export function presenter(x: CanvasRenderingContext2D, t: number, a: AudioSample, g: Gestures, px: number, held?: () => void) {
  const { pose, name, since } = g.at(t);
  const s = PRESENTER_SCALE;
  const talk = clamp(a.vocal * 1.7, 0, 1);
  const bob = 4 * noise1(t * 1.3, 4) + 4 * talk * Math.sin(t * 9);
  const local = () => { x.translate(px, HEAD_Y + bob); x.scale(s, s); };
  x.save();
  local();
  // the body, behind the counter
  x.beginPath();
  x.moveTo(-310, 420);
  x.lineTo(-300, 290);
  x.quadraticCurveTo(-292, 196, -196, 186);
  x.lineTo(196, 186);
  x.quadraticCurveTo(292, 196, 300, 290);
  x.lineTo(310, 420);
  x.closePath();
  x.fillStyle = SHIRT; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke();
  // the head turns a little about the neck
  x.save();
  x.translate(0, 150);
  x.rotate(pose.tilt + 0.02 * noise1(t * 0.9, 7));
  x.translate(0, -150);
  head(x, t, pose.brow, talk);
  x.restore();
  // the crew neck over the neck
  x.beginPath(); x.moveTo(-84, 188); x.quadraticCurveTo(0, 246, 84, 188);
  x.lineWidth = 12; x.strokeStyle = SHIRT_L; x.stroke();
  x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
  x.restore();
  held?.();
  x.save();
  local();
  // arms, in front of the body
  const wave = name === 'wave' ? Math.sin(since * 12) * 36 : 0;
  arm(x, -226, 236, pose.l[0], pose.l[1], -1, pose.lh);
  arm(x, 226, 236, pose.r[0] + wave, pose.r[1] - Math.abs(wave) * 0.2, 1, pose.rh);
  x.restore();
}

function head(x: CanvasRenderingContext2D, t: number, brow: number, talk: number) {
  // neck
  rr(x, -56, 90, 112, 110, 30);
  x.fillStyle = SKIN_D; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
  // ears
  for (const sd of [-1, 1]) {
    x.beginPath(); x.ellipse(sd * 128, 10, 24, 38, sd * 0.15, 0, TAU);
    x.fillStyle = SKIN; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.ellipse(sd * 130, 12, 10, 20, sd * 0.15, 0, TAU);
    x.fillStyle = SKIN_D; x.fill();
  }
  // face
  x.beginPath(); x.ellipse(0, 0, 130, 156, 0, 0, TAU);
  x.fillStyle = SKIN; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
  x.save(); x.clip(); // a shadow side
  x.fillStyle = 'rgba(170,90,60,0.16)';
  x.beginPath(); x.ellipse(118, 20, 64, 170, 0, 0, TAU); x.fill();
  x.restore();

  // the beard, from the sideburns round the jaw; the mouth opens in it
  x.beginPath();
  x.moveTo(-129, -14);
  x.bezierCurveTo(-136, 124, -84, 190, 0, 194);
  x.bezierCurveTo(84, 190, 136, 124, 129, -14);
  x.bezierCurveTo(116, 46, 84, 60, 50, 64);
  x.bezierCurveTo(22, 54, -22, 54, -50, 64);
  x.bezierCurveTo(-84, 60, -116, 46, -129, -14);
  x.closePath();
  x.fillStyle = HAIR; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
  x.strokeStyle = HAIR_L; x.lineWidth = 4; x.lineCap = 'round'; // texture
  for (let i = 0; i < 9; i++) {
    const ang = Math.PI * (0.12 + 0.76 * (i / 8));
    const bx = Math.cos(ang) * 110, by = 60 + Math.sin(ang) * 112;
    x.beginPath(); x.moveTo(bx, by - 14); x.lineTo(bx * 0.97, by + 4); x.stroke();
  }
  // mouth
  const open = 5 + 30 * talk * (0.55 + 0.45 * Math.abs(Math.sin(t * 15.7)));
  const my = 102;
  x.beginPath(); x.ellipse(0, my + open * 0.22, 34, open * 0.5 + 4, 0, 0, TAU);
  x.fillStyle = '#5c1d22'; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
  if (open > 13) {
    x.save(); x.clip();
    x.fillStyle = '#f6f1e7'; x.fillRect(-26, my + open * 0.22 - open * 0.5 - 4, 52, 9);
    x.fillStyle = '#d0505a'; x.beginPath(); x.ellipse(0, my + open * 0.22 + open * 0.42, 20, 9, 0, 0, TAU); x.fill();
    x.restore();
  }
  // moustache
  x.beginPath();
  x.moveTo(-58, 92); x.quadraticCurveTo(-30, 64, 0, 78); x.quadraticCurveTo(30, 64, 58, 92);
  x.quadraticCurveTo(24, 86, 0, 94); x.quadraticCurveTo(-24, 86, -58, 92);
  x.fillStyle = HAIR; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
  // nose
  x.beginPath(); x.moveTo(-6, 6); x.quadraticCurveTo(-2, 40, -24, 50); x.quadraticCurveTo(0, 62, 22, 50);
  x.lineWidth = 5; x.strokeStyle = SKIN_D; x.lineCap = 'round'; x.stroke();
  // cheeks
  x.fillStyle = 'rgba(225,110,90,0.22)';
  for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(sd * 74, 34, 24, 13, 0, 0, TAU); x.fill(); }

  // eyes and brows
  const bl = blink(t);
  const look = 5 * noise1(t * 0.6, 9);
  for (const sd of [-1, 1]) {
    const ex = sd * 50, ey = -20;
    if (bl > 0.6) {
      x.beginPath(); x.moveTo(ex - 16, ey + 2); x.quadraticCurveTo(ex, ey + 9, ex + 16, ey + 2);
      x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    } else {
      x.beginPath(); x.ellipse(ex + look, ey, 15, 19 * (1 - bl), 0, 0, TAU); x.fillStyle = INK; x.fill();
      x.beginPath(); x.arc(ex + look + 5, ey - 7, 5, 0, TAU); x.fillStyle = '#ffffff'; x.fill();
    }
    const by = ey - 44 - 9 * brow - 3 * talk * Math.sin(t * 5);
    const inner = brow < 0 ? -brow * 12 : 0; // a frown pulls the inner ends down
    x.beginPath();
    x.moveTo(ex - sd * 32, by + 6 + inner);
    x.quadraticCurveTo(ex, by - 9 - 3 * brow, ex + sd * 32, by + 4);
    x.lineCap = 'round'; x.lineWidth = 16; x.strokeStyle = HAIR; x.stroke();
  }

  // hair: a swept quiff over the top
  x.beginPath();
  x.moveTo(-134, -2);
  x.bezierCurveTo(-156, -120, -126, -196, -40, -204);
  x.bezierCurveTo(-8, -250, 76, -250, 100, -204);
  x.bezierCurveTo(160, -188, 166, -110, 133, -2);
  x.bezierCurveTo(120, -66, 100, -92, 72, -100);
  x.bezierCurveTo(34, -124, -30, -118, -68, -104);
  x.bezierCurveTo(-104, -92, -120, -60, -134, -2);
  x.closePath();
  x.fillStyle = HAIR; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
  x.strokeStyle = HAIR_L; x.lineWidth = 7; x.lineCap = 'round';
  for (const [a0, a1] of [[-70, -150], [-10, -178], [44, -160], [90, -130]] as const) {
    x.beginPath(); x.moveTo(a0, a1 + 44); x.quadraticCurveTo(a0 + 26, a1 - 16, a0 + 66, a1 - 2); x.stroke();
  }
}

// ------------------------------------------------------------------ captions
export interface CapWord { w: string; start: number; end: number; hot: boolean }
const capKey = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

/** The voice's words in pages of one to three on the counter: each page pops in, the word being said turns
 *  yellow (the ones to come wait faded), the film's key words (`hot`) are set in ink. */
export class Captions {
  pages: CapWord[][] = [];
  constructor(ly: Lyrics, hot: string[] = [], maxChars = 17) {
    const hotSet = new Set(hot.map(capKey));
    for (const l of ly.lines) {
      let cur: CapWord[] = [];
      for (const w of l.words) {
        const disp = w.w.replace(/[«»"“”]/g, '').replace(/[.,:;!?…]+$/u, '');
        const cw = { w: disp, start: w.start, end: w.end, hot: hotSet.has(capKey(w.w)) };
        const len = cur.reduce((n, c) => n + c.w.length + 1, 0) + cw.w.length;
        if (cur.length && (len > maxChars || cur.length >= 3)) { this.pages.push(cur); cur = []; }
        cur.push(cw);
        if (/[.,:;!?…»]$/u.test(w.w)) { this.pages.push(cur); cur = []; }
      }
      if (cur.length) this.pages.push(cur);
    }
  }

  draw(x: CanvasRenderingContext2D, t: number, y = CAPTION_Y) {
    let i = -1;
    for (let k = 0; k < this.pages.length; k++) if (t >= this.pages[k]![0]!.start - 0.08) i = k;
    if (i < 0) return;
    const p = this.pages[i]!;
    const last = p[p.length - 1]!;
    const next = this.pages[i + 1];
    const out = Math.min(last.end + 0.7, next ? next[0]!.start - 0.08 : Infinity);
    if (t > out) return;
    const size = 66, fam = F.grotesk(700), padX = 24, gap = 14, hgt = 94;
    const ws = p.map((w) => measure(w.w, fam, size) + 2 * padX);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (p.length - 1);
    const k = total > 900 ? 900 / total : 1;
    let px = W / 2 - (total * k) / 2;
    const p0 = p[0]!.start - 0.08;
    p.forEach((w, j) => {
      const s = pop(t, p0, 0.24) * (1 - ease.inBack(prog(t, out - 0.12, out)));
      const said = t >= w.start - 0.02;
      const now = said && t < (p[j + 1]?.start ?? w.end + 0.5) - 0.02;
      const fill = w.hot ? INK : now ? YELLOW : PAPER;
      const ink = w.hot ? (now ? YELLOW : PAPER) : INK;
      const cx = px + (ws[j]! * k) / 2;
      const lift = now ? -10 * ease.outBack(prog(t, w.start - 0.02, w.start + 0.16)) : 0;
      around(x, cx, y, s * k * (now ? 1.07 : 1), (hash(i, j) - 0.5) * 0.07, () => {
        x.save();
        x.globalAlpha *= said ? 1 : 0.62;
        card(x, cx - ws[j]! / 2, y - hgt / 2 + lift, ws[j]!, hgt, { fill, r: 16, shadow: 7, line: 5 });
        text(x, w.w, cx, y + 23 + lift, size, { fam, color: ink, align: 'center' });
        x.restore();
      });
      px += (ws[j]! + gap) * k;
    });
  }
}

// ------------------------------------------------------------------ HUD
/** The black tag top left; each new label types itself in. `keys`: [[t, label], ...]. */
export function tag(x: CanvasRenderingContext2D, t: number, keys: [number, string][]) {
  let cur: [number, string] | null = null;
  for (const k of keys) if (k[0] <= t) cur = k;
  if (!cur) return;
  const fam = F.mono(700), size = 27;
  const w = measure(cur[1], fam, size, 1.5) + 44;
  const s = 0.85 + 0.15 * ease.outBack(prog(t, cur[0], cur[0] + 0.25));
  const label = cur[1], t0 = cur[0];
  around(x, 48, HUD_Y, s, -0.025, () => {
    card(x, 48, HUD_Y - 34, w, 62, { fill: INK, r: 6, shadow: 0, line: 0 });
    x.save(); // a strip of tape
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.translate(56, HUD_Y - 34); x.rotate(-0.5); x.fillRect(-16, -9, 50, 18);
    x.restore();
    x.save();
    x.font = font(fam, size); x.fillStyle = '#ffffff'; x.letterSpacing = '1.5px';
    x.fillText(typed(label, t, t0, 52), 70, HUD_Y + 9);
    x.restore();
  });
}

/** The power strip (top right by default); plugin i's plug drops in on its cable at at[i]. */
export function powerStrip(x: CanvasRenderingContext2D, t: number, at: number[], o: { cx?: number; cy?: number; s?: number; labels?: boolean } = {}) {
  const s = o.s ?? 1, cx = o.cx ?? W - 226, cy = o.cy ?? HUD_Y;
  const n = at.filter((a) => t >= a).length;
  const sw = 340, sh = 74;
  const sockX = (i: number) => -sw / 2 + 98 + i * 66;
  const drop = (a: number) => (t < a ? 0 : ease.outBack(prog(t, a, a + 0.35), 2.4));
  const top = -cy / s - 40; // the top edge of the frame, in strip px
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  // cables first: they come down from above the frame
  at.forEach((a, i) => {
    const d = drop(a);
    if (d <= 0) return;
    const py = lerp(top - 100, -6, d);
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(sockX(i), top - 200); x.lineTo(sockX(i), py - 30);
    x.strokeStyle = INK; x.lineWidth = 13; x.stroke();
    x.strokeStyle = PLUG[i]!; x.lineWidth = 7; x.stroke();
  });
  card(x, -sw / 2, -sh / 2, sw, sh, { fill: '#f4f1ea', r: 18, shadow: 6, line: 5 });
  rr(x, -sw / 2 + 18, -15, 30, 30, 6); x.fillStyle = RED; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke(); // the switch
  at.forEach((a, i) => {
    const sx = sockX(i);
    x.beginPath(); x.arc(sx, 0, 24, 0, TAU); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
    x.fillStyle = INK; x.fillRect(sx - 9, -7, 5, 12); x.fillRect(sx + 4, -7, 5, 12);
    const d = drop(a);
    if (d <= 0) return;
    const py = lerp(top - 100, -6, d);
    rr(x, sx - 25, py - 32, 50, 58, 12); x.fillStyle = PLUG[i]!; x.fill(); x.lineWidth = 4.5; x.strokeStyle = INK; x.stroke();
    text(x, String(i + 1), sx, py + 10, 30, { fam: F.grotesk(700), color: '#ffffff', align: 'center' });
    const fl = bump(t, a + 0.3, 0.45);
    for (let k = 0; k < 4 && fl > 0; k++) {
      const r = 34 + 30 * (1 - fl), ang = k * 1.7 + i;
      sparkle(x, sx + Math.cos(ang) * r, py - 10 + Math.sin(ang) * r, 12 * fl, fl, YELLOW);
    }
    if (o.labels) { // in two rows, so the names do not run into each other
      const lw = measure(PLUG_NAMES[i]!, F.mono(700), 12) + 14, ly = 52 + (i % 2) * 34;
      x.fillStyle = INK; x.fillRect(sx - 1.5, 24, 3, ly - 24);
      card(x, sx - lw / 2, ly, lw, 24, { fill: YELLOW, r: 5, shadow: 3, line: 3, alpha: clamp(d) });
      text(x, PLUG_NAMES[i]!, sx, ly + 17, 12, { fam: F.mono(700), align: 'center', alpha: clamp(d) });
    }
  });
  if (!o.labels) text(x, `PLUGIN ${n}/4`, sw / 2 - 4, sh / 2 + 34, 22, { fam: F.mono(700), align: 'right' });
  x.restore();
}

// ------------------------------------------------------------------ props
export interface TLine { s: string; at: number; col?: string; cps?: number; strike?: number; box?: string; size?: number; dy?: number; bold?: boolean }

/** A terminal window: title bar with three dots, mono lines typed in at their times. */
export function terminal(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, t: number,
  o: { title?: string; lines?: TLine[]; size?: number; cursor?: boolean }) {
  card(x, x0, y0, w, h, { fill: TERM, r: 16, shadow: 12, line: 5 });
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    x.beginPath(); x.arc(x0 + 30 + i * 26, y0 + 28, 8, 0, TAU); x.fillStyle = c; x.fill();
  });
  if (o.title) text(x, o.title, x0 + w / 2 + 30, y0 + 36, 19, { fam: F.mono(500), color: '#8d8a96', align: 'center' });
  x.fillStyle = '#2c2b33'; x.fillRect(x0 + 3, y0 + 54, w - 6, 2);
  const size = o.size ?? 25;
  let y = y0 + 98;
  let lastKey = -1, cy = y, cx = x0 + 32;
  for (const l of o.lines ?? []) {
    const sz = l.size ?? size;
    y += l.dy ?? 0;
    if (t >= l.at) {
      const fam = F.mono(l.bold ? 700 : 500);
      const cps = l.cps ?? 45;
      const s = typed(l.s, t, l.at, cps);
      if (l.box) { // a highlighted line: its box fades in first
        const bw = Math.min(w - 36, measure(l.s, fam, sz) + 34);
        x.save(); x.globalAlpha *= prog(t, l.at, l.at + 0.15);
        rr(x, x0 + 18, y - sz - 12, bw, sz + 28, 8); x.lineWidth = 3; x.strokeStyle = l.box; x.stroke();
        x.restore();
      }
      text(x, s, x0 + 34, y, sz, { fam, color: l.col ?? '#ece8de' });
      if (l.strike !== undefined && t >= l.strike) {
        const k = ease.outCubic(prog(t, l.strike, l.strike + 0.25));
        x.fillStyle = l.col ?? '#ece8de';
        x.fillRect(x0 + 32, y - sz * 0.33, measure(s, fam, sz) * k, 3);
      }
      if (s.length) { lastKey = l.at + s.length / cps; cy = y; cx = x0 + 34 + measure(s, fam, sz) + 4; }
    }
    y += sz * 1.55;
  }
  if (o.cursor !== false && lastKey > 0 && (t - lastKey < 0.4 || Math.floor(t * 2.4) % 2 === 0)) {
    x.fillStyle = '#ece8de'; x.fillRect(cx, cy - size * 0.8, size * 0.55, size);
  }
}

/** A sheet of paper with a folded corner. */
export function paper(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, o: { fill?: string; fold?: number; shadow?: number } = {}) {
  const f = o.fold ?? 46, sh = o.shadow ?? 10;
  const path = (dx: number, dy: number) => {
    x.beginPath();
    x.moveTo(x0 + dx, y0 + dy); x.lineTo(x0 + w - f + dx, y0 + dy); x.lineTo(x0 + w + dx, y0 + f + dy);
    x.lineTo(x0 + w + dx, y0 + h + dy); x.lineTo(x0 + dx, y0 + h + dy); x.closePath();
  };
  if (sh) { path(sh, sh); x.fillStyle = INK; x.fill(); }
  path(0, 0); x.fillStyle = o.fill ?? PAPER; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke();
  x.beginPath(); x.moveTo(x0 + w - f, y0); x.lineTo(x0 + w - f, y0 + f); x.lineTo(x0 + w, y0 + f); x.closePath();
  x.fillStyle = '#e4dccb'; x.fill(); x.stroke();
}

/** A sticky note, slightly rotated, with a strip of tape. */
export function sticky(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rot: number, lines: string[], o: { size?: number; fill?: string; s?: number } = {}) {
  around(x, cx, cy, o.s ?? 1, rot, () => {
    card(x, cx - w / 2, cy - h / 2, w, h, { fill: o.fill ?? '#fde68a', r: 4, shadow: 8, line: 4 });
    x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(cx - 40, cy - h / 2 - 12, 80, 24);
    const size = o.size ?? 26;
    lines.forEach((s, i) => text(x, s, cx, cy - ((lines.length - 1) * size * 1.2) / 2 + i * size * 1.2 + size * 0.35, size, { fam: F.grotesk(700), align: 'center' }));
  });
}

/** Odometer wheels rolling from `from` to `to` (strings of the same length; non-digits switch halfway). */
export function odometer(x: CanvasRenderingContext2D, cx: number, cy: number, from: string, to: string, k: number,
  o: { dw?: number; dh?: number; size?: number; fill?: string; ink?: string } = {}) {
  const dw = o.dw ?? 64, dh = o.dh ?? 92, size = o.size ?? 70;
  const n = to.length, x0 = cx - (n * dw) / 2;
  for (let i = 0; i < n; i++) {
    const a = from[i] ?? '0', b = to[i]!;
    const bx = x0 + i * dw;
    card(x, bx + 3, cy - dh / 2, dw - 6, dh, { fill: o.fill ?? PAPER, r: 8, shadow: 0, line: 4 });
    x.save();
    rr(x, bx + 3, cy - dh / 2, dw - 6, dh, 8); x.clip();
    const glyph = (s: string, off: number) => text(x, s, bx + dw / 2, cy + size * 0.36 + off, size, { fam: F.grotesk(700), color: o.ink ?? INK, align: 'center' });
    if (/\d/.test(a) && /\d/.test(b)) {
      // each wheel turns forward to its digit (a full extra turn for all but the last), left ones later
      const da = +a, db = +b, steps = ((db - da + 10) % 10) + (i < n - 1 ? 10 : 0);
      const kk = ease.inOutCubic(clamp(k * 1.25 - (n - 1 - i) * 0.05));
      const pos = da + steps * kk;
      for (let d = -1; d <= 1; d++) {
        const v = Math.floor(pos) + d;
        glyph(String(((v % 10) + 10) % 10), (v - pos) * dh);
      }
    } else glyph(k < 0.5 ? a : b, 0);
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(bx, cy - dh / 2, dw, dh * 0.18); x.fillRect(bx, cy + dh * 0.32, dw, dh * 0.18);
    x.restore();
  }
}

/** A tick drawn in as u goes 0 -> 1. */
export function tick(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, u: number, color = GREEN, w = 0) {
  if (u <= 0) return;
  const pts: [number, number][] = [[-0.5, 0], [-0.12, 0.38], [0.6, -0.45]];
  x.save();
  x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = w || s * 0.26; x.strokeStyle = color;
  x.beginPath();
  x.moveTo(cx + pts[0]![0] * s, cy + pts[0]![1] * s);
  for (let i = 1; i <= 2; i++) {
    const k = clamp(u * 2 - (i - 1));
    if (k <= 0) break;
    const a = pts[i - 1]!, b = pts[i]!;
    x.lineTo(cx + lerp(a[0], b[0], k) * s, cy + lerp(a[1], b[1], k) * s);
  }
  x.stroke();
  x.restore();
}

/** A rubber stamp slammed on at t0: from big to its size, slightly rotated. */
export function stamp(x: CanvasRenderingContext2D, cx: number, cy: number, s: string, t: number, t0: number, o: { color?: string; size?: number; rot?: number; fill?: string } = {}) {
  if (t < t0) return;
  const k = prog(t, t0, t0 + 0.16);
  const sc = lerp(2.2, 1, ease.outCubic(k));
  const size = o.size ?? 44, col = o.color ?? RED;
  const w = measure(s, F.grotesk(700), size) + 44;
  around(x, cx, cy, sc, o.rot ?? -0.12, () => {
    x.save();
    x.globalAlpha *= k;
    rr(x, cx - w / 2, cy - size * 0.75, w, size * 1.5, 10);
    if (o.fill) { x.fillStyle = o.fill; x.fill(); }
    x.lineWidth = 6; x.strokeStyle = col; x.stroke();
    text(x, s, cx, cy + size * 0.36, size, { fam: F.grotesk(700), color: col, align: 'center' });
    x.restore();
  });
}

/** The first word of the voice that reads `q` (case, accents and punctuation ignored), from time `after`. */
export function wordAt(ly: Lyrics, q: string, after = 0): Word {
  const k = capKey(q);
  const w = ly.words.find((w) => capKey(w.w) === k && w.start >= after - 1e-6);
  if (!w) throw new Error(`word not found: “${q}” after ${after.toFixed(2)} s`);
  return w;
}

// ------------------------------------------------------------------ the plate
let shared: { ly: Lyrics; caps: Captions; plugAt: number[] } | null = null;
/** Words the captions set in ink. */
export const HOT = ['plugin', 'Superpowers', 'specifica', 'subagent', 'test', 'Karpathy', 'CLAUDE.md', 'mille', 'cento', 'regole',
  'semplice', 'i-have-adhd', 'risposta', 'azione', 'cinque', 'Octopus', 'dodici', 'SENIOR', 'link'];

/** A plate of this film. Its entry's params: { pal, prev?, px, prevX?, last? } (palette names, presenter x). */
export abstract class Plate extends Scene {
  override handlesTransition = true;
  layer = new Layer2D();
  ly!: Lyrics;
  caps!: Captions;
  plugAt: number[] = [];
  /** The plate's own window (its entry runs OVERLAP longer, under the next plate's wipe). */
  T0 = 0; T1 = 0;
  pal!: Pal; prev?: Pal;
  px = 540; prevX = 540;
  /** Where the circle wipe that opens this plate grows from. */
  origin: [number, number] = [W - 226, HUD_Y];
  gest = new Gestures([]);
  tags: [number, string][] = [];

  override init() {
    const ly = (this.ly = this.ctx.lyrics);
    if (shared?.ly !== ly) {
      shared = { ly, caps: new Captions(ly, HOT), plugAt: ['Superpowers', 'Karpathy', 'i-have-adhd', 'Octopus'].map((q) => wordAt(ly, q).start) };
    }
    this.caps = shared.caps;
    this.plugAt = shared.plugAt;
    const p = this.ctx.params;
    this.T0 = this.ctx.start;
    this.T1 = p.last ? this.ctx.end : this.ctx.end - OVERLAP;
    this.pal = PAL[p.pal]!;
    this.prev = p.prev ? PAL[p.prev] : undefined;
    this.px = p.px ?? 540;
    this.prevX = p.prevX ?? this.px;
    this.setup();
  }

  /** Look up the plate's words; set its gestures, tags and props' times. */
  abstract setup(): void;
  /** Props on the wall, behind the presenter. */
  back(_x: CanvasRenderingContext2D, _t: number, _f: Frame) {}
  /** A prop the presenter holds: in front of his body, behind his hands. */
  held(_x: CanvasRenderingContext2D, _t: number) {}
  /** Props in front of the counter and of the presenter. */
  front(_x: CanvasRenderingContext2D, _t: number, _f: Frame) {}
  /** The plate's own post (shake, flash...). */
  post(_t: number): PostOverrides { return {}; }
  /** The HUD's power strip (the closing plate draws its own, big). */
  hud(x: CanvasRenderingContext2D, t: number) { powerStrip(x, t, this.plugAt); }

  /** The presenter's x at t: he slides over from where the previous plate had him. */
  presenterX(t: number) { return lerp(this.prevX, this.px, ease.inOutCubic(prog(t, this.T0, this.T0 + 0.55))); }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const tail = t >= this.T1; // the next plate is wiping over this one: it draws everything but the wall and props
    const L = this.layer;
    L.clear();
    const x = L.ctx;
    const [ox, oy] = this.origin;
    const reach = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
    const wipe = this.prev && f.under ? ease.inOutCubic(prog(t, this.T0, this.T0 + OVERLAP)) : 1;
    const R = wipe * reach;
    if (wipe < 1) comp.draw(renderer, f.under!, out, { mode: 'replace', premult: false });
    else clearRT(renderer, out);
    const clipped = (fn: () => void) => {
      if (wipe >= 1) return fn();
      x.save(); x.beginPath(); x.arc(ox, oy, R, 0, TAU); x.clip(); fn(); x.restore();
    };
    clipped(() => { wall(x, this.pal, t); this.back(x, t, f); });
    if (!tail) {
      presenter(x, t, f.a, this.gest, this.presenterX(t), () => this.held(x, t));
      if (wipe < 1) counter(x, this.prev!);
      clipped(() => { counter(x, this.pal); this.front(x, t, f); });
      if (wipe < 1) { x.beginPath(); x.arc(ox, oy, R, 0, TAU); x.lineWidth = 12; x.strokeStyle = INK; x.stroke(); }
      this.caps.draw(x, t);
      tag(x, t, this.tags);
      this.hud(x, t);
    }
    comp.draw(renderer, L.upload(), out);
    return { bloom: 0, halation: 0, ca: 0, grain: 0.035, vignette: 0.14, hud: 0, ...this.post(t) };
  }
}

export { W, H, F, font, measure, ease, prog, clamp, lerp, hash, noise1, TAU };
export type { Frame, Word, Lyrics, PostOverrides };

/** A five-point star. */
export function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill = YELLOW, line = 5) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.46 : r;
    x.lineTo(cx + k * Math.cos(a), cy + k * Math.sin(a));
  }
  x.closePath();
  x.fillStyle = fill; x.fill();
  if (line) { x.lineWidth = line; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke(); }
}

/** A small flag (the "points they disagree on"). */
export function flag(x: CanvasRenderingContext2D, px: number, py: number, s = 1, fill = RED) {
  x.save();
  x.translate(px, py); x.scale(s, s);
  x.fillStyle = INK; x.fillRect(-3, -26, 6, 40);
  x.beginPath(); x.moveTo(2, -26); x.lineTo(30, -18); x.lineTo(2, -8); x.closePath();
  x.fillStyle = fill; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
  x.restore();
}

/** The width of a pill() label. */
export const pillW = (s: string, size = 22, fam = F.mono(700)) => measure(s, fam, size) + size * 1.2;

/** A pill-shaped label (returns its width). */
export function pill(x: CanvasRenderingContext2D, cx: number, cy: number, s: string, o: { size?: number; fill?: string; ink?: string; fam?: string; shadow?: number; line?: number } = {}) {
  const size = o.size ?? 22, fam = o.fam ?? F.mono(700);
  const w = pillW(s, size, fam), h = size * 1.7;
  card(x, cx - w / 2, cy - h / 2, w, h, { fill: o.fill ?? YELLOW, r: h / 2, shadow: o.shadow ?? 4, line: o.line ?? 4 });
  text(x, s, cx, cy + size * 0.36, size, { fam, color: o.ink ?? INK, align: 'center' });
  return w;
}
