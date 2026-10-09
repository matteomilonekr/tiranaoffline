// The look of films/grill, after @piyush.glitch's reel on Matt Pocock's skills: a split screen. Above the seam,
// a flat illustrated stage (sunburst, string lights, a beige floor) where little pixel creatures act each idea
// out; below it, either the presenter (Matteo, drawn) in a lamp-lit room or a browser page with hand-drawn
// circles, underlines and stickers. The caption sits on the seam: white mono capitals on a dark pill.
// Everything here is drawn in code; the pages are illustrations, not screenshots. Canvas2D, pure in t.
import { W, H } from '@kit/engine/gl';
import { F, font } from '@kit/engine/type';
import type { Lyrics, Word } from '@kit/engine/lyrics';
import { clamp, ease, hash, lerp, noise1 } from '@kit/engine/util';

export { W, H, F, font, clamp, ease, hash, lerp, noise1 };
export const TAU = Math.PI * 2;
export const SEAM = 1102, FLOOR = 1000;
export const INK = '#2a2624', CREAM = '#f4efe7', CREAM_D = '#ebe3d6', BEIGE = '#e2d5c2', RED = '#e0493b', ORANGE = '#d9714a',
  ORANGE_D = '#bf5b37', YELLOW = '#f2c14e', GREEN = '#3fae6a', BLUE = '#3d7fd6', PURPLE = '#7c5ce0', SAGE = '#9dbf9e', BOARD = '#1f2d24';
export const LW = 4;

// ------------------------------------------------------------------ helpers
export const k = (t: number, t0: number, d = 0.3) => clamp((t - t0) / d);
export const pop = (t: number, t0: number, d = 0.32, s = 2) => (t < t0 ? 0 : ease.outBack(clamp((t - t0) / d), s));
export function rr(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(x0, y0, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}
/** A flat shape with the illustration's dark outline. */
export function box(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, fill: string, r = 6, lw = LW) {
  rr(x, x0, y0, w, h, r); x.fillStyle = fill; x.fill(); if (lw) { x.lineWidth = lw; x.strokeStyle = INK; x.stroke(); }
}
export function txt(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, color: string,
  o: { align?: CanvasTextAlign; alpha?: number; track?: number; base?: CanvasTextBaseline } = {}) {
  x.save(); x.globalAlpha *= o.alpha ?? 1; x.font = font(fam, size); x.textAlign = o.align ?? 'left'; x.textBaseline = o.base ?? 'alphabetic';
  x.fillStyle = color; if (o.track) x.letterSpacing = `${o.track}px`;
  x.fillText(s, px, py); x.restore();
}
export function at(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number, fn: () => void) {
  if (s <= 0.002) return;
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s); x.translate(-cx, -cy); fn(); x.restore();
}
const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
export function wordAt(ly: Lyrics, q: string, after = 0): Word {
  const w = ly.words.find((w) => key(w.w) === key(q) && w.start >= after - 1e-6);
  if (!w) throw new Error(`word not found: ${q} after ${after}`);
  return w;
}

// ------------------------------------------------------------------ the stage above the seam
/** Cream sunburst from (cx, cy), the beige floor, string lights and two spotlights. */
export function stage(x: CanvasRenderingContext2D, t: number, o: { cx?: number; cy?: number; lights?: boolean; spots?: boolean; floor?: string; c1?: string; c2?: string } = {}) {
  const cx = o.cx ?? W / 2, cy = o.cy ?? 820;
  x.fillStyle = o.c1 ?? CREAM; x.fillRect(0, 0, W, SEAM);
  x.fillStyle = o.c2 ?? CREAM_D;
  const n = 26, rot = t * 0.04;
  for (let i = 0; i < n; i += 2) {
    const a0 = rot + (i / n) * TAU, a1 = rot + ((i + 1) / n) * TAU;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a0) * 2400, cy + Math.sin(a0) * 2400); x.lineTo(cx + Math.cos(a1) * 2400, cy + Math.sin(a1) * 2400); x.closePath(); x.fill();
  }
  floor(x, o.floor);
  if (o.lights !== false) lights(x, t);
  if (o.spots) spots(x);
}
export function floor(x: CanvasRenderingContext2D, col = BEIGE) {
  x.fillStyle = col; x.fillRect(0, FLOOR, W, SEAM - FLOOR);
  x.fillStyle = 'rgba(42,38,36,0.12)'; x.fillRect(0, FLOOR, W, 5);
}
export function lights(x: CanvasRenderingContext2D, t: number, y0 = 26, sag = 40) {
  x.strokeStyle = INK; x.lineWidth = 3;
  x.beginPath(); x.moveTo(-20, y0); x.quadraticCurveTo(W / 2, y0 + sag * 2, W + 20, y0); x.stroke();
  const cols = [YELLOW, '#8ec5ff', '#ff9ec7', '#a6e3a1', '#ffb36b'];
  for (let i = 0; i < 14; i++) {
    const u = (i + 0.5) / 14, px = lerp(-20, W + 20, u), py = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * (y0 + sag * 2) + u * u * y0;
    const on = 0.75 + 0.25 * Math.sin(t * 3 + i * 1.7);
    x.beginPath(); x.arc(px, py + 16, 11, 0, TAU); x.fillStyle = cols[i % cols.length]!; x.globalAlpha = on; x.fill(); x.globalAlpha = 1;
    x.lineWidth = 2.5; x.stroke();
  }
}
export function spots(x: CanvasRenderingContext2D) {
  for (const sd of [-1, 1]) {
    x.save(); x.translate(sd < 0 ? 40 : W - 40, 30); x.rotate(sd * -0.6);
    const g = x.createLinearGradient(0, 0, 0, 700); g.addColorStop(0, 'rgba(255,236,170,0.45)'); g.addColorStop(1, 'rgba(255,236,170,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(-30, 40); x.lineTo(30, 40); x.lineTo(170, 700); x.lineTo(-170, 700); x.closePath(); x.fill();
    box(x, -32, -30, 64, 72, '#1d1b1a', 10, 0);
    x.restore();
  }
}
/** Pale sky, clouds and two sage mountains with snowy tops. */
export function sky(x: CanvasRenderingContext2D, t: number) {
  const g = x.createLinearGradient(0, 0, 0, SEAM); g.addColorStop(0, '#d9ecf7'); g.addColorStop(1, '#eef6f2');
  x.fillStyle = g; x.fillRect(0, 0, W, SEAM);
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 420 + t * 18) % (W + 300)) - 150, cy = 120 + i * 60;
    x.fillStyle = '#ffffff'; for (const [dx, r] of [[0, 34], [36, 44], [76, 32]] as const) { x.beginPath(); x.arc(cx + dx, cy, r, 0, TAU); x.fill(); }
  }
  for (const [mx, mh, mw] of [[260, 520, 520], [800, 430, 460]] as const) {
    x.beginPath(); x.moveTo(mx - mw, FLOOR); x.lineTo(mx, FLOOR - mh); x.lineTo(mx + mw, FLOOR); x.closePath();
    x.fillStyle = SAGE; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.moveTo(mx - mw * 0.22, FLOOR - mh * 0.78); x.lineTo(mx, FLOOR - mh); x.lineTo(mx + mw * 0.22, FLOOR - mh * 0.78); x.lineTo(mx + mw * 0.08, FLOOR - mh * 0.72); x.lineTo(mx - mw * 0.06, FLOOR - mh * 0.8); x.closePath();
    x.fillStyle = '#ffffff'; x.fill(); x.stroke();
  }
  floor(x, '#d8cdb8');
}
/** A plain wall (a room), with a skirting line. */
export function wall(x: CanvasRenderingContext2D, col = '#efe6d8') {
  x.fillStyle = col; x.fillRect(0, 0, W, SEAM);
  x.fillStyle = 'rgba(42,38,36,0.06)'; for (let i = 0; i < 9; i++) x.fillRect(i * 130 + 40, 0, 6, FLOOR);
  floor(x, '#d9c9b2');
}

// ------------------------------------------------------------------ the pixel creature
const BODY = [
  '...##########...',
  '...##########...',
  '...#ee####ee#...',
  '...#ee####ee#...',
  '################',
  '#######mm#######',
  '...##########...',
];
const LEGS = ['...#.#....#.#...', '....#.#..#.#....'];
type Hat = 'cap' | 'beanie' | 'chef' | 'grad' | 'hard' | 'wig' | 'none';
const HATS: Record<Exclude<Hat, 'none'>, [number, number, number, string][]> = {
  // [row, col0, col1, colour key]: rows above the body are negative
  cap: [[-2, 4, 11, 'a'], [-1, 3, 13, 'a']],
  beanie: [[-4, 7, 8, 'b'], [-3, 6, 9, 'a'], [-2, 5, 10, 'b'], [-1, 4, 11, 'a']],
  chef: [[-5, 5, 10, 'w'], [-4, 4, 11, 'w'], [-3, 4, 11, 'w'], [-2, 5, 10, 'g'], [-1, 5, 10, 'w']],
  grad: [[-2, 2, 13, 'k'], [-1, 4, 11, 'k'], [-1, 13, 13, 'y'], [0, 13, 13, 'y'], [1, 13, 13, 'y']],
  hard: [[-3, 5, 10, 'y'], [-2, 4, 11, 'y'], [-1, 2, 13, 'y']],
  wig: [[-2, 4, 11, 'w'], [-1, 3, 12, 'w'], [0, 2, 2, 'w'], [1, 2, 2, 'w'], [2, 2, 2, 'w'], [0, 13, 13, 'w'], [1, 13, 13, 'w'], [2, 13, 13, 'w']],
};
export interface CritOpts { hat?: Hat; a?: string; b?: string; walk?: boolean; face?: 'normal' | 'cool' | 'squint' | 'happy'; hop?: number; flip?: boolean }
/** A creature standing on (cx, footY), cell size P: 16 cells wide, 9 tall (plus its hat). */
export function critter(x: CanvasRenderingContext2D, cx: number, footY: number, P: number, t: number, o: CritOpts = {}) {
  const leg = LEGS[o.walk ? Math.floor(t * 8) % 2 : 0]!;
  const rows = [...BODY, leg, leg];
  const ox = Math.round(cx - 8 * P), oy = Math.round(footY - rows.length * P - (o.hop ?? 0));
  const cell = (r: number, c: number, col: string) => {
    const cc = o.flip ? 15 - c : c;
    x.fillStyle = col; x.fillRect(ox + cc * P, oy + r * P, P + 0.6, P + 0.6);
  };
  rows.forEach((row, r) => Array.from(row).forEach((ch, c) => {
    if (ch === '.') return;
    if (ch === 'e') {
      const f = o.face ?? 'normal';
      if (f === 'cool') return cell(r, c, '#141210');
      if ((f === 'squint' || f === 'happy') && r === 2) return cell(r, c, r >= 6 ? ORANGE_D : ORANGE);
      return cell(r, c, '#1c1917');
    }
    if (ch === 'm') return cell(r, c, o.face === 'happy' ? '#1c1917' : '#3a1d14');
    cell(r, c, r >= 6 ? ORANGE_D : ORANGE);
  }));
  if (o.face === 'cool') for (let c = 4; c <= 11; c++) cell(2, c, '#141210');
  if (o.hat && o.hat !== 'none') {
    const pal: Record<string, string> = { a: o.a ?? BLUE, b: o.b ?? YELLOW, w: '#fbfaf7', g: '#cfcac2', k: '#1c1917', y: YELLOW };
    for (const [r, c0, c1, ck] of HATS[o.hat]) for (let c = c0; c <= c1; c++) cell(r, c, pal[ck]!);
  }
}
/** A crowd of creatures along the floor, bobbing; hats cycle. */
export function crowd(x: CanvasRenderingContext2D, t: number, xs: number[], P = 15, y = FLOOR + 40, seed = 1) {
  const hats: [Hat, string, string][] = [['cap', BLUE, YELLOW], ['beanie', RED, YELLOW], ['cap', RED, YELLOW], ['cap', GREEN, YELLOW], ['beanie', PURPLE, YELLOW], ['hard', YELLOW, YELLOW]];
  xs.forEach((cx, i) => {
    const h = hats[(i + seed) % hats.length]!;
    critter(x, cx, y, P, t, { hat: h[0], a: h[1], b: h[2], hop: Math.max(0, Math.sin(t * 7 + i * 1.3)) * 8 });
  });
}
/** A small creature walking across at height y, every `period` s. */
export function walker(x: CanvasRenderingContext2D, t: number, y: number, P: number, period: number, seed: number, dir = 1) {
  const u = ((t + hash(seed, 1) * period) % period) / period;
  const cx = dir > 0 ? lerp(-120, W + 120, u) : lerp(W + 120, -120, u);
  critter(x, cx, y, P, t, { walk: true, flip: dir < 0, hat: (['cap', 'beanie', 'none'] as Hat[])[seed % 3], a: [BLUE, RED, GREEN][seed % 3] });
}

// ------------------------------------------------------------------ props shared by the shots
/** A sticker: a tilted coloured tag with white mono capitals. */
export function sticker(x: CanvasRenderingContext2D, t: number, t0: number, s: string, cx: number, cy: number, o: { rot?: number; fill?: string; size?: number; ink?: string } = {}) {
  const e = pop(t, t0, 0.3, 2.4);
  if (e <= 0) return;
  const size = o.size ?? 34;
  x.save(); x.font = font(F.mono(600), size); const w = x.measureText(s).width + size * 1.1; x.restore();
  at(x, cx, cy, e, o.rot ?? -0.05, () => {
    x.save(); x.shadowColor = 'rgba(0,0,0,0.18)'; x.shadowOffsetY = 5; x.shadowBlur = 6;
    box(x, cx - w / 2, cy - size * 0.8, w, size * 1.6, o.fill ?? RED, 8, 3); x.restore();
    rr(x, cx - w / 2 + 6, cy - size * 0.8 + 6, w - 12, size * 1.6 - 12, 5); x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 2; x.stroke();
    txt(x, s, cx, cy + size * 0.36, size, F.mono(600), o.ink ?? '#ffffff', { align: 'center' });
  });
}
/** A dark headline pill at the top of the stage. */
export function headline(x: CanvasRenderingContext2D, t: number, t0: number, s: string, y = 92) {
  const e = pop(t, t0, 0.3, 1.8);
  if (e <= 0) return;
  x.save(); x.font = font(F.mono(700), 44); const w = x.measureText(s).width + 70; x.restore();
  at(x, W / 2, y, e, -0.02, () => {
    box(x, W / 2 - w / 2, y - 44, w, 88, '#24211f', 14, 0);
    rr(x, W / 2 - w / 2 + 6, y - 38, w - 12, 76, 10); x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2; x.stroke();
    txt(x, s, W / 2, y + 15, 44, F.mono(700), '#ffffff', { align: 'center', track: 3 });
  });
}
/** A speech bubble with a short text. */
export function bubble(x: CanvasRenderingContext2D, t: number, t0: number, s: string, cx: number, cy: number, size = 40, tail: -1 | 1 = 1) {
  const e = pop(t, t0, 0.28, 2.6);
  if (e <= 0) return;
  x.save(); x.font = font(F.mono(700), size); const w = x.measureText(s).width + size; x.restore();
  at(x, cx, cy, e, 0, () => {
    x.beginPath(); x.roundRect(cx - w / 2, cy - size, w, size * 2, size * 0.5);
    x.moveTo(cx + tail * w * 0.15, cy + size); x.lineTo(cx + tail * w * 0.05, cy + size + 22); x.lineTo(cx + tail * w * 0.32, cy + size);
    x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 3.5; x.strokeStyle = INK; x.stroke();
    txt(x, s, cx, cy + size * 0.36, size, F.mono(700), INK, { align: 'center' });
  });
}
/** A five-point star. */
export function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill = YELLOW, lw = 3) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r;
    if (i) x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); else x.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  x.closePath(); x.fillStyle = fill; x.fill(); if (lw) { x.lineWidth = lw; x.strokeStyle = INK; x.stroke(); }
}
/** A dark terminal window; `lines` are [text, colour, typed-from time]. */
export function terminal(x: CanvasRenderingContext2D, t: number, x0: number, y0: number, w: number, h: number, title: string,
  lines: [string, string, number][], o: { size?: number; cps?: number; cursor?: boolean } = {}) {
  box(x, x0, y0, w, h, '#1d1c21', 16, LW);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.beginPath(); x.arc(x0 + 30 + i * 24, y0 + 28, 7, 0, TAU); x.fillStyle = c; x.fill(); });
  txt(x, title, x0 + w / 2, y0 + 35, 20, F.mono(500), '#8a8790', { align: 'center' });
  const size = o.size ?? 26, cps = o.cps ?? 30;
  let lastY = y0 + 90, lastX = x0 + 30;
  lines.forEach(([s, col, t0], i) => {
    const n = Math.floor(clamp((t - t0) * cps, 0, s.length));
    if (n <= 0) return;
    const py = y0 + 92 + i * size * 1.55;
    txt(x, s.slice(0, n), x0 + 30, py, size, F.mono(500), col);
    x.save(); x.font = font(F.mono(500), size); lastX = x0 + 30 + x.measureText(s.slice(0, n)).width; x.restore(); lastY = py;
  });
  if (o.cursor !== false && Math.floor(t * 2.4) % 2 === 0) { x.fillStyle = '#e8e6ea'; x.fillRect(lastX + 4, lastY - size * 0.8, size * 0.55, size); }
}
/** A chalkboard in a wooden frame. */
export function chalkboard(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  box(x, x0, y0, w, h, '#a8743f', 10, LW);
  box(x, x0 + 16, y0 + 16, w - 32, h - 32, BOARD, 4, 0);
}
/** A traffic light: 0 red, 1 amber, 2 green. */
export function trafficLight(x: CanvasRenderingContext2D, cx: number, y0: number, state: number) {
  x.fillStyle = INK; x.fillRect(cx - 6, y0 + 230, 12, FLOOR - y0 - 230);
  box(x, cx - 52, y0, 104, 240, '#2b2b30', 18, LW);
  ['#ff4b3e', '#ffb02e', '#3ad16b'].forEach((c, i) => {
    x.beginPath(); x.arc(cx, y0 + 44 + i * 76, 30, 0, TAU); x.fillStyle = state === i ? c : '#45434b'; x.fill();
    if (state === i) { x.save(); x.globalAlpha = 0.35; x.beginPath(); x.arc(cx, y0 + 44 + i * 76, 46, 0, TAU); x.fill(); x.restore(); }
  });
}
/** Confetti thrown from (cx, cy) at t0. */
export function confetti(x: CanvasRenderingContext2D, t: number, t0: number, cx: number, cy: number, n = 40) {
  const u = t - t0;
  if (u < 0 || u > 2.5) return;
  const cols = [RED, YELLOW, BLUE, GREEN, PURPLE, '#ff8fc7'];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (hash(i, 3) - 0.5) * 2.6, v = 600 + 500 * hash(i, 4);
    const px = cx + Math.cos(a) * v * u, py = cy + Math.sin(a) * v * u + 900 * u * u;
    x.save(); x.translate(px, py); x.rotate(u * 8 + i); x.fillStyle = cols[i % cols.length]!; x.globalAlpha = clamp(2.5 - u); x.fillRect(-6, -10, 12, 20); x.restore();
  }
}

// ------------------------------------------------------------------ below the seam: the room, the page
/** The presenter's room, out of focus: a dusk-blue wall, a warm lamp on the left, a plant and shelves on the right. */
export function room(x: CanvasRenderingContext2D, t: number) {
  const g = x.createLinearGradient(0, SEAM, W, H); g.addColorStop(0, '#3b3f78'); g.addColorStop(0.55, '#5b4a86'); g.addColorStop(1, '#2c2a48');
  x.fillStyle = g; x.fillRect(0, SEAM, W, H - SEAM);
  x.save(); x.filter = 'blur(14px)';
  const lamp = x.createRadialGradient(170, SEAM + 170, 20, 170, SEAM + 170, 420);
  lamp.addColorStop(0, 'rgba(255,214,150,0.95)'); lamp.addColorStop(0.35, 'rgba(255,170,90,0.45)'); lamp.addColorStop(1, 'rgba(255,170,90,0)');
  x.fillStyle = lamp; x.fillRect(0, SEAM, 640, 640);
  x.fillStyle = '#ffd9a0'; x.beginPath(); x.moveTo(90, SEAM + 120); x.lineTo(250, SEAM + 120); x.lineTo(280, SEAM + 240); x.lineTo(60, SEAM + 240); x.closePath(); x.fill();
  x.strokeStyle = '#2a2230'; x.lineWidth = 12; x.beginPath(); x.moveTo(170, SEAM + 240); x.lineTo(110, H); x.moveTo(170, SEAM + 240); x.lineTo(230, H); x.stroke();
  for (let i = 0; i < 4; i++) { x.fillStyle = `rgba(255,200,120,${0.5 + 0.1 * Math.sin(t + i)})`; x.fillRect(820 + (i % 2) * 120, SEAM + 140 + i * 110, 110, 18); }
  x.fillStyle = '#2f5a3c';
  for (let i = 0; i < 7; i++) { x.save(); x.translate(980, SEAM + 520); x.rotate(-2.4 + i * 0.4); x.beginPath(); x.ellipse(110, 0, 120, 26, 0, 0, TAU); x.fill(); x.restore(); }
  x.restore();
}
/** The browser card that holds the pages: returns the content box. */
export function browser(x: CanvasRenderingContext2D, url: string) {
  x.fillStyle = '#ebe8e3'; x.fillRect(0, SEAM, W, H - SEAM);
  const b = { x: 66, y: SEAM + 72, w: W - 132, h: H - SEAM - 130 };
  x.save(); x.shadowColor = 'rgba(0,0,0,0.12)'; x.shadowBlur = 24; x.shadowOffsetY = 10;
  box(x, b.x, b.y, b.w, b.h, '#ffffff', 18, 3); x.restore();
  x.fillStyle = '#f3f2f0'; rr(x, b.x + 2, b.y + 2, b.w - 4, 54, 16); x.fill();
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.beginPath(); x.arc(b.x + 28 + i * 22, b.y + 29, 7, 0, TAU); x.fillStyle = c; x.fill(); });
  box(x, b.x + 104, b.y + 13, b.w - 130, 32, '#e7e5e1', 16, 0);
  txt(x, url, b.x + 124, b.y + 36, 19, F.mono(400), '#5d5a57');
  x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(b.x, b.y + 56, b.w, 2);
  txt(x, 'illustrativo', b.x + b.w - 16, b.y + b.h - 12, 15, F.mono(400), '#a39f9a', { align: 'right' });
  return { x: b.x, y: b.y + 58, w: b.w, h: b.h - 58 };
}
/** A hand-drawn ellipse round a box, drawn on over 0.35 s from t0. */
export function circleMark(x: CanvasRenderingContext2D, t: number, t0: number, cx: number, cy: number, w: number, h: number, col = '#e2603a') {
  const u = ease.outCubic(k(t, t0, 0.35));
  if (u <= 0) return;
  x.save(); x.strokeStyle = col; x.lineWidth = 5; x.lineCap = 'round';
  x.beginPath();
  const n = 60, turns = 1.12;
  for (let i = 0; i <= n * u; i++) {
    const a = -2.6 + (i / n) * TAU * turns, wob = 1 + 0.04 * Math.sin(i * 0.7);
    const px = cx + Math.cos(a) * (w / 2 + 14) * wob, py = cy + Math.sin(a) * (h / 2 + 10) * wob + (i / n) * 6;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.stroke(); x.restore();
}
/** A hand-drawn underline. */
export function underline(x: CanvasRenderingContext2D, t: number, t0: number, x0: number, y0: number, w: number, col = '#e2603a') {
  const u = ease.outCubic(k(t, t0, 0.3));
  if (u <= 0) return;
  x.save(); x.strokeStyle = col; x.lineWidth = 4.5; x.lineCap = 'round';
  x.beginPath(); x.moveTo(x0, y0);
  for (let i = 1; i <= 20 * u; i++) x.lineTo(x0 + (i / 20) * w, y0 + Math.sin(i * 0.9) * 2.5 + (i / 20) * 3);
  x.stroke(); x.restore();
}
/** A rectangle drawn round a box. */
export function boxMark(x: CanvasRenderingContext2D, t: number, t0: number, x0: number, y0: number, w: number, h: number, col = '#e2603a') {
  const u = k(t, t0, 0.25);
  if (u <= 0) return;
  x.save(); x.strokeStyle = col; x.lineWidth = 4.5; x.globalAlpha = u;
  rr(x, x0 - 10, y0 - 8, w + 20, h + 16, 6); x.stroke(); x.restore();
}

// ------------------------------------------------------------------ the caption on the seam
export type Said = { w: string; start: number; end: number };
/** The words in chunks of up to ~17 characters; a chunk shows from its first word until the next one. */
export function chunks(ws: Said[], max = 17): Said[][] {
  const out: Said[][] = [];
  let cur: Said[] = [], len = 0;
  for (const w of ws) {
    const s = w.w.replace(/[,.;:!?]+$/u, '');
    const brk = /[,.;:!?]$/.test(w.w);
    if (cur.length && len + 1 + s.length > max) { out.push(cur); cur = []; len = 0; }
    cur.push(w); len += (len ? 1 : 0) + s.length;
    if (brk) { out.push(cur); cur = []; len = 0; }
  }
  if (cur.length) out.push(cur);
  return out;
}
export function caption(x: CanvasRenderingContext2D, t: number, all: Said[][]) {
  let c: Said[] | undefined;
  for (const ch of all) if (t >= ch[0]!.start - 0.08) c = ch;
  if (!c) return;
  const last = c[c.length - 1]!;
  if (t > last.end + 0.9) return;
  const words = c.map((w) => w.w.replace(/[,.;:!?]+$/u, '').toUpperCase());
  const size = 50;
  x.save(); x.font = font(F.mono(600), size);
  const sp = x.measureText(' ').width, ws = words.map((s) => x.measureText(s).width);
  const tw = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
  x.restore();
  const bw = tw + 52, bh = 78, bx = W / 2 - bw / 2, by = SEAM - bh / 2;
  x.save(); x.shadowColor = 'rgba(0,0,0,0.25)'; x.shadowBlur = 12; x.shadowOffsetY = 4;
  rr(x, bx, by, bw, bh, 14); x.fillStyle = 'rgba(36,34,38,0.95)'; x.fill(); x.restore();
  rr(x, bx + 1, by + 1, bw - 2, bh - 2, 13); x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 2; x.stroke();
  let px = W / 2 - tw / 2;
  words.forEach((s, i) => {
    const on = t >= c![i]!.start - 0.05;
    txt(x, s, px, SEAM + size * 0.36, size, F.mono(600), on ? '#ffffff' : 'rgba(255,255,255,0.4)');
    px += ws[i]! + sp;
  });
}
