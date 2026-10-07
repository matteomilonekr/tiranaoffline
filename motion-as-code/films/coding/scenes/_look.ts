// The look of films/coding, after the reel it clones (@tessa.fairbrook's "4 plugins"): a white page with a
// faint grid and plus marks, two out-of-focus coral bursts in the corners; two-line captions, Poppins over
// Instrument Serif italic, whose words come in from a grey blur as they are said; numbered coral stars with
// the plugin's name in Cormorant; dark UI cards with a coral glow that develop out of a grey placeholder;
// and the talking-head set: a grey wall, a pink neon sign and a plant, out of focus. Canvas2D, pure in t.
import { W, H } from '@kit/engine/gl';
import { F, font } from '@kit/engine/type';
import type { Lyrics, Word } from '@kit/engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog } from '@kit/engine/util';
import { strokeText, drawStrokeText, type StrokeText } from '@kit/engine/stroke';

export { W, H, F, font, clamp, ease, hash, lerp, noise1, prog };
export const TAU = Math.PI * 2;
export const PAGE = '#fcfcfc', INK = '#121212', GREY = '#c2c2c2', CORAL = '#dd6f55', CORAL_L = '#f08f74', CARD = '#0e1015';

// ------------------------------------------------------------------ helpers
export function rr(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(x0, y0, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}
export function mixHex(a: string, b: string, u: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  const c = [0, 1, 2].map((i) => Math.round(lerp(p(a, i), p(b, i), clamp(u))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
export function txt(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, color: string,
  o: { align?: CanvasTextAlign; alpha?: number; track?: number } = {}) {
  x.save(); x.globalAlpha *= o.alpha ?? 1; x.font = font(fam, size); x.textAlign = o.align ?? 'left'; x.fillStyle = color;
  if (o.track) x.letterSpacing = `${o.track}px`;
  x.fillText(s, px, py); x.restore();
}
export const pop = (t: number, t0: number, d = 0.32, s = 1.7) => (t < t0 ? 0 : ease.outBack(prog(t, t0, t0 + d), s));

const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
export function wordAt(ly: Lyrics, q: string, after = 0): Word {
  const w = ly.words.find((w) => key(w.w) === key(q) && w.start >= after - 1e-6);
  if (!w) throw new Error(`word not found: ${q} after ${after}`);
  return w;
}
/** The said words from `a` to `b`, both included (the first `a` at or after `after`). */
export function span(ly: Lyrics, a: string, b: string, after = 0): Word[] {
  const i = ly.words.findIndex((w) => key(w.w) === key(a) && w.start >= after - 1e-6);
  if (i < 0) throw new Error(`word not found: ${a} after ${after}`);
  let j = i;
  while (j < ly.words.length && key(ly.words[j]!.w) !== key(b)) j++;
  if (j >= ly.words.length) throw new Error(`word not found: ${b} after ${a}`);
  return ly.words.slice(i, j + 1);
}

// ------------------------------------------------------------------ the page
const GX0 = 105, GDX = 125, GY0 = 278, GDY = 139, GTOP = 200, GBOT = 1760;
/** White, a faint grid with plus marks where its lines cross (`grid`: 0..1), the two coral bursts. */
export function page(x: CanvasRenderingContext2D, t: number, o: { grid?: number; spin?: number } = {}) {
  x.fillStyle = PAGE; x.fillRect(0, 0, W, H);
  const v = x.createRadialGradient(W / 2, H * 0.48, H * 0.2, W / 2, H * 0.5, H * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.04)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  const g = o.grid ?? 1;
  if (g > 0) grid(x, g);
  bursts(x, t, o.spin ?? 0);
}

function grid(x: CanvasRenderingContext2D, a: number) {
  const fade = (y: number) => clamp((y - GTOP) / 170) * clamp((GBOT - y) / 170);
  x.save();
  const vg = x.createLinearGradient(0, GTOP, 0, GBOT);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.11, `rgba(0,0,0,${0.055 * a})`);
  vg.addColorStop(0.89, `rgba(0,0,0,${0.055 * a})`); vg.addColorStop(1, 'rgba(0,0,0,0)');
  x.strokeStyle = vg; x.lineWidth = 1.5;
  x.beginPath();
  for (let gx = GX0; gx < W; gx += GDX) { x.moveTo(gx, GTOP); x.lineTo(gx, GBOT); }
  x.stroke();
  for (let gy = GY0; gy < GBOT; gy += GDY) {
    const f = fade(gy) * a;
    if (f <= 0) continue;
    x.strokeStyle = `rgba(0,0,0,${0.05 * f})`; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke();
    x.strokeStyle = `rgba(0,0,0,${0.22 * f})`; x.lineWidth = 2;
    x.beginPath();
    for (let gx = GX0; gx < W; gx += GDX) { x.moveTo(gx - 8, gy); x.lineTo(gx + 8, gy); x.moveTo(gx, gy - 8); x.lineTo(gx, gy + 8); }
    x.stroke();
  }
  x.restore();
}

/** A coral burst: rounded petals of different lengths around a hub, out of focus. */
function burst(x: CanvasRenderingContext2D, cx: number, cy: number, rot: number, s: number) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
  x.filter = 'blur(10px)';
  x.strokeStyle = CORAL; x.lineCap = 'round'; x.lineWidth = 50;
  x.beginPath();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + (hash(i, 3) - 0.5) * 0.18, l = 230 + 110 * hash(i, 7);
    x.moveTo(Math.cos(a) * 60, Math.sin(a) * 60); x.lineTo(Math.cos(a) * l, Math.sin(a) * l);
  }
  x.stroke();
  x.restore();
}
export function bursts(x: CanvasRenderingContext2D, t: number, spin: number) {
  burst(x, 1140, 170, 0.05 * t + spin, 1);
  burst(x, -50, 1990, -0.04 * t - spin * 0.8 + 0.4, 1.08);
}

// ------------------------------------------------------------------ captions
export type Said = { w: string; start: number };
export interface SayStyle { fam: string; size: number; color?: string; hot?: (w: string) => boolean; hotColor?: string; from?: string }
const tidy = (s: string) => s.replace(/[,.;:]+$/u, '');
/** A line of words centred on (cx, baseline by): each word comes in, from a grey blur to sharp, as it is said
 *  (`lead` s before). Returns the line's width. */
export function say(x: CanvasRenderingContext2D, t: number, ws: Said[], cx: number, by: number, st: SayStyle, lead = 0.07) {
  x.save();
  x.font = font(st.fam, st.size); x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  const sp = x.measureText(' ').width * 0.92;
  const words = ws.map((w) => tidy(w.w));
  const widths = words.map((w) => x.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * Math.max(0, ws.length - 1);
  let px = cx - total / 2;
  ws.forEach((w, i) => {
    const u = clamp((t - (w.start - lead)) / 0.26);
    if (u > 0) {
      const e = ease.outCubic(u);
      const col = st.hot?.(words[i]!) ? (st.hotColor ?? CORAL) : (st.color ?? INK);
      x.globalAlpha = e;
      x.fillStyle = mixHex(st.from ?? '#c9c9c9', col, e);
      x.filter = u < 1 ? `blur(${((1 - e) * 6).toFixed(2)}px)` : 'none';
      x.fillText(words[i]!, px, by + (1 - e) * 5);
    }
    px += widths[i]! + sp;
  });
  x.restore();
  return total;
}
/** The film's two-line caption: Poppins on top, Instrument Serif italic below (either may be empty). */
export function caption(x: CanvasRenderingContext2D, t: number, a: Said[], b: Said[], by: number, o: { hot?: (w: string) => boolean; cx?: number } = {}) {
  const cx = o.cx ?? W / 2;
  if (a.length) say(x, t, a, cx, by, { fam: F.poppins(600), size: 40, hot: o.hot });
  if (b.length) say(x, t, b, cx, by + 58, { fam: F.instrument(true), size: 66, hot: o.hot });
}

// ------------------------------------------------------------------ the numbered star
export function starPath(x: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const k = 0.07 * r;
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.quadraticCurveTo(cx + k, cy - k, cx + r, cy);
  x.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
  x.quadraticCurveTo(cx - k, cy + k, cx - r, cy);
  x.quadraticCurveTo(cx - k, cy - k, cx, cy - r);
  x.closePath();
}
/** A section's opener: the coral star comes into focus and settles (from t0), its number fades in, then the
 *  plugin's name types itself in, letter by letter, from `nameAt`. */
export function starTitle(x: CanvasRenderingContext2D, t: number, t0: number, num: string, name: string, nameAt: number) {
  const cx = 292, cy = 882, r = 150;
  const u = clamp((t - t0) / 0.42);
  if (u <= 0) return;
  const e = ease.outCubic(u);
  x.save();
  x.translate(lerp(cx - 46, cx, e), lerp(cy - 74, cy, e)); x.rotate(lerp(-0.5, 0, e));
  const s = lerp(0.45, 1, ease.outBack(u, 1.3)); x.scale(s, s);
  x.globalAlpha = clamp(u * 3);
  x.filter = u < 1 ? `blur(${((1 - e) * 16).toFixed(2)}px)` : 'none';
  const g = x.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#e98468'); g.addColorStop(1, '#d4614a');
  starPath(x, 0, 0, r); x.fillStyle = g; x.fill();
  x.restore();
  // the number, light on the star
  const un = clamp((t - t0 - 0.3) / 0.25);
  if (un > 0) {
    x.save();
    x.globalAlpha = un;
    x.filter = un < 1 ? `blur(${((1 - un) * 6).toFixed(2)}px)` : 'none';
    x.font = font(F.poppins(600), 168); x.textAlign = 'center';
    const ng = x.createLinearGradient(0, cy - 70, 0, cy + 60);
    ng.addColorStop(0, '#ffffff'); ng.addColorStop(1, '#ffd2c6');
    x.shadowColor = 'rgba(120,30,10,0.35)'; x.shadowBlur = 14; x.shadowOffsetY = 4;
    x.fillStyle = ng; x.fillText(num, cx - 6, cy + 58);
    x.restore();
  }
  // the name
  x.save();
  x.font = font(F.serif(600), 98);
  let px = cx + r * 0.66;
  Array.from(name).forEach((ch, i) => {
    const v = clamp((t - nameAt - i * 0.045) / 0.16);
    const cw = x.measureText(ch).width;
    if (v > 0) {
      x.globalAlpha = v;
      x.filter = v < 1 ? `blur(${((1 - v) * 5).toFixed(2)}px)` : 'none';
      x.fillStyle = INK; x.fillText(ch, px, cy + 100);
    }
    px += cw;
  });
  x.restore();
}

// ------------------------------------------------------------------ dark cards
export interface Box { x: number; y: number; w: number; h: number; r?: number }
/** A dark UI card that develops from a grey placeholder from t0: it rises into place, darkens, its glow comes
 *  up, and its content (`body`, given the development 0..1) comes in sharp. */
export function darkCard(x: CanvasRenderingContext2D, t: number, t0: number, b: Box, body: (k: number) => void,
  o: { fill?: string; rise?: number; dur?: number } = {}) {
  const u = t - t0;
  if (u < 0) return;
  const k = clamp(u / (o.dur ?? 0.8));
  const dy = (1 - ease.outCubic(clamp(u / 0.32))) * (o.rise ?? 170);
  const r = b.r ?? 26, fill = o.fill ?? CARD;
  x.save();
  x.translate(0, dy);
  x.save();
  x.filter = k < 0.4 ? `blur(${((0.4 - k) * 22).toFixed(2)}px)` : 'none';
  x.shadowColor = `rgba(232,108,86,${(0.42 * k).toFixed(3)})`; x.shadowBlur = 44;
  rr(x, b.x, b.y, b.w, b.h, r); x.fillStyle = mixHex('#c6c6c6', fill, ease.inOutQuad(k)); x.fill();
  x.restore();
  const kc = clamp((k - 0.22) / 0.78);
  if (kc > 0) {
    x.save();
    rr(x, b.x, b.y, b.w, b.h, r); x.clip();
    x.globalAlpha = kc;
    if (kc < 1) x.filter = `blur(${((1 - kc) * 5).toFixed(2)}px)`;
    body(kc);
    x.restore();
  }
  rr(x, b.x + 1, b.y + 1, b.w - 2, b.h - 2, r); x.strokeStyle = `rgba(255,255,255,${(0.07 * k).toFixed(3)})`; x.lineWidth = 2; x.stroke();
  x.restore();
}
/** A card's title bar: the three window dots and a centred grey title. */
export function titleBar(x: CanvasRenderingContext2D, b: Box, title: string) {
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.beginPath(); x.arc(b.x + 32 + i * 24, b.y + 32, 7, 0, TAU); x.fillStyle = c; x.fill(); });
  txt(x, title, b.x + b.w / 2, b.y + 39, 19, F.mono(400), '#7c818c', { align: 'center' });
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(b.x, b.y + 62, b.w, 2);
}

// ------------------------------------------------------------------ small drawings
const CRIT = ['..######..', '.########.', '##o####o##', '##########', '##########'];
const LEGS = ['.#.#..#.#.', '#.#....#.#'];
/** A little pixel creature (drawn here, not anyone's mascot); it steps on `t`. */
export function critter(x: CanvasRenderingContext2D, cx: number, cy: number, px: number, t: number, col = CORAL, walk = true) {
  const rows = [...CRIT, LEGS[walk ? Math.floor(t * 9) % 2 : 0]!];
  const ox = cx - (10 * px) / 2, oy = cy - (rows.length * px) / 2;
  rows.forEach((row, j) => Array.from(row).forEach((c, i) => {
    if (c === '.') return;
    x.fillStyle = c === 'o' ? '#2a1712' : col;
    x.fillRect(ox + i * px, oy + j * px, px + 0.5, px + 0.5);
  }));
}
/** A down arrow (for "-54%"), its tip at (cx, cy + s/2). */
export function arrowDown(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.beginPath();
  x.moveTo(cx - s * 0.09, cy - s / 2); x.lineTo(cx + s * 0.09, cy - s / 2); x.lineTo(cx + s * 0.09, cy + s * 0.08);
  x.lineTo(cx + s * 0.32, cy - s * 0.14); x.lineTo(cx + s * 0.44, cy - s * 0.02); x.lineTo(cx, cy + s / 2);
  x.lineTo(cx - s * 0.44, cy - s * 0.02); x.lineTo(cx - s * 0.32, cy - s * 0.14); x.lineTo(cx - s * 0.09, cy + s * 0.08);
  x.closePath();
}
/** A five-point star. */
export function star5(x: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
}

// ------------------------------------------------------------------ the talking-head set
let SIGN: StrokeText | null = null;
/** The wall behind the presenter: warm grey, a pink neon sign across the top, a plant on the right; all out of
 *  focus. */
export function talkSet(x: CanvasRenderingContext2D, t: number) {
  const g = x.createLinearGradient(0, 0, W, H * 0.7);
  g.addColorStop(0, '#8e8b88'); g.addColorStop(0.55, '#b7b4b1'); g.addColorStop(1, '#a3a09d');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W * 0.45, 330, 40, W * 0.45, 330, 700);
  glow.addColorStop(0, 'rgba(255,160,230,0.22)'); glow.addColorStop(1, 'rgba(255,160,230,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  // the neon sign, in a script stroke font
  SIGN ??= strokeText('vibe coding', 'script', 300);
  const s = SIGN, sx = 40, sy = 430;
  const flick = 0.92 + 0.08 * Math.sin(t * 31) * Math.sin(t * 7.3);
  x.save();
  x.translate(sx, sy); x.rotate(-0.06);
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.filter = 'blur(3px)';
  x.globalAlpha = 0.55 * flick; x.strokeStyle = '#ff5fd0'; x.lineWidth = 34; drawStrokeText(x, s, s.total);
  x.filter = 'blur(1.2px)';
  x.globalAlpha = flick; x.strokeStyle = '#ffa3e6'; x.lineWidth = 14; drawStrokeText(x, s, s.total);
  x.strokeStyle = '#fff1fb'; x.lineWidth = 5; drawStrokeText(x, s, s.total);
  x.restore();
  // the plant on the right
  x.save();
  x.filter = 'blur(7px)';
  for (let i = 0; i < 9; i++) {
    const a = -2.2 + i * 0.32 + 0.04 * Math.sin(t * 0.8 + i), len = 230 + 80 * hash(i, 4);
    x.save(); x.translate(1110, 1060); x.rotate(a);
    x.beginPath(); x.ellipse(len / 2, 0, len / 2, 26, 0, 0, TAU);
    x.fillStyle = i % 2 ? '#3f6a3c' : '#2f5530'; x.fill();
    x.restore();
  }
  x.restore();
}
/** The talking head's captions: white Poppins words coming in as they are said, the key line in coral. */
export function talkCaps(x: CanvasRenderingContext2D, t: number, a: Said[], b: Said[], o: { bWhite?: boolean } = {}) {
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 18;
  if (a.length) say(x, t, a, W / 2, 1338, { fam: F.poppins(600), size: 54, color: '#ffffff', from: '#9a9a9a' });
  if (b.length) say(x, t, b, W / 2, 1412, { fam: F.poppins(700), size: 60, color: o.bWhite ? '#ffffff' : CORAL_L, from: '#8a6a62' });
  x.restore();
}
