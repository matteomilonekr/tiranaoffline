// The whole of `lista`, one plate: a to-do list that turns into a reading habit, in the format of @vitalyframes' reel
// (UI motion, nothing said). A folder opens and a note rises out of it; a hand taps it out, three of the four things
// to do are ticked and highlighted, the note becomes an "Iniziamo" button, the button a reading widget (the fourth
// thing: read 20 pages), the widget grows and folds into an app icon. One shape carries the whole film from the note
// on (fx/shared): it springs through sizes, radii and colours while its content swaps under a blur.
// Everything is drawn here: the folder, the note, the hand, the book (invented), the widgets, the icon.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT, W, H } from '@kit/engine/gl';
import { F, font, layout } from '@kit/engine/type';
import { clamp, lerp, TAU } from '@kit/engine/util';
import { E, springTo, spring } from '@kit/fx';
import { boxAt, colorAt, swap, type Box } from '@kit/fx/shared';
import { cursor, rr } from '@kit/fx/ui';
import { typed } from '@kit/fx/text';

// the reel's 720 × 720 frame, scaled up and centred in the 9:16 one (its grounds are plain, so they fill it)
const K = 1.9;
const SANS = (w = 500) => F.archivo(100, w);
const SERIF = F.instrument(false);
const INK = '#1c1c1e', BLUE = '#1a84ff', ORANGE = '#f3920f';
const ITEMS = ['Finire il video', 'Allenamento schiena', 'Fare la spesa', 'Leggere 20 pagine'];
const TICKS = [3.5, 3.95, 4.4];
const TITLE = 'Cose da fare oggi', BOOK = ['Un passo', 'al giorno'], BOOK_LINE = 'Un passo al giorno';
const DAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

// the boxes the one shape goes through (design units, centred on 0, 0)
const CARD: Box = { x: -155, y: -160, w: 310, h: 320, r: 18 };
const PILL: Box = { x: -194, y: -40, w: 388, h: 80, r: 40 };
const SQUARE: Box = { x: -119, y: -125, w: 238, h: 250, r: 34 };
const WIDE: Box = { x: -267, y: -125, w: 534, h: 250, r: 34 };
const BIG: Box = { x: -178, y: -192, w: 356, h: 384, r: 38 };
const ICON: Box = { x: -137, y: -137, w: 274, h: 274, r: 64 };
const OUT = 2.95; // the note leaves the folder
const MORPH: [number, Box, string][] = [[4.95, PILL, '#3a3a3c'], [6.98, SQUARE, ORANGE], [8.0, WIDE, '#8a8a8f'], [9.05, BIG, ORANGE], [9.95, ICON, '#f5960f']];

function T(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, col: string, align: CanvasTextAlign = 'left', alpha = 1) {
  x.save(); x.globalAlpha *= alpha; x.font = font(fam, size); x.fillStyle = col; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(s, px, py); x.restore();
}

type Pose = 'point' | 'open' | 'grab' | 'peace';

/** The hand cursor: white with a dark outline, its hotspot (a fingertip, or the palm's top) at 0, 0. */
function hand(x: CanvasRenderingContext2D, px: number, py: number, pose: Pose, s = 1, rot = 0, alpha = 1) {
  if (alpha <= 0.01) return;
  x.save();
  x.globalAlpha *= alpha;
  x.translate(px, py); x.rotate(rot); x.scale(s, s);
  x.lineJoin = 'round'; x.lineWidth = 2.6; x.strokeStyle = '#1c1c1e'; x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0,0,0,0.18)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
  const part = (x0: number, y0: number, w: number, h: number, r: number, a = 0, ax = 0, ay = 0) => {
    x.save();
    if (a) { x.translate(ax, ay); x.rotate(a); x.translate(-ax, -ay); }
    rr(x, x0, y0, w, h, r); x.fill(); x.shadowColor = 'transparent'; x.stroke();
    x.restore();
  };
  if (pose === 'point' || pose === 'peace') {
    part(-6, 26, 38, 28, 10);
    if (pose === 'peace') part(4, -2, 10, 34, 5, 0.32, 9, 30);
    else { part(5, 20, 10, 15, 5); }
    part(14, 22, 10, 14, 5);
    part(23, 25, 9, 12, 4.5);
    part(-5, 0, 10, 32, 5, pose === 'peace' ? -0.22 : 0, 0, 30);
    part(-17, 30, 18, 10, 5, -0.55, -2, 36);
    part(-1, 52, 31, 9, 2.5);
  } else if (pose === 'open') {
    part(-19, 20, 38, 30, 11);
    const f: [number, number][] = [[-18, 26], [-8.5, 31], [1, 29], [10.5, 23]];
    f.forEach(([fx, fh], i) => part(fx, 20 - fh + 6, 8.5, fh, 4.2, (i - 1.5) * 0.12, fx + 4, 24));
    part(-30, 30, 18, 10, 5, -0.7, -16, 36);
    part(-14, 48, 30, 9, 2.5);
  } else {
    part(-19, 8, 38, 32, 11);
    for (let i = 0; i < 4; i++) part(-18 + i * 9.2, 2, 9, 14, 4.5);
    part(-26, 18, 20, 10, 5, -0.25, -14, 22);
    part(-14, 38, 30, 9, 2.5);
  }
  x.restore();
}

/** The book (invented): a cream cover with its title in orange, w wide (h = 1.46 w), top-left at x0, y0. */
function cover(x: CanvasRenderingContext2D, x0: number, y0: number, w: number) {
  const h = w * 1.46;
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.22)'; x.shadowBlur = w * 0.12; x.shadowOffsetY = w * 0.04;
  rr(x, x0, y0, w, h, w * 0.04); x.fillStyle = '#f7f2e8'; x.fill();
  x.restore();
  x.fillStyle = 'rgba(28,28,30,0.35)';
  for (let i = 0; i < 3; i++) x.fillRect(x0 + w * 0.22, y0 + w * (0.1 + i * 0.07), w * (0.56 - (i % 2) * 0.12), w * 0.03);
  const ts = Math.min(w * 0.26, (w * 0.84) / Math.max(...BOOK.map((b) => layout(b, F.fraunces(900), 100).width / 100)));
  T(x, BOOK[0]!, x0 + w * 0.08, y0 + w * 0.42 + ts, ts, F.fraunces(900), ORANGE);
  T(x, BOOK[1]!, x0 + w * 0.08, y0 + w * 0.44 + ts * 2.05, ts, F.fraunces(900), ORANGE);
  x.fillStyle = 'rgba(28,28,30,0.3)';
  for (let i = 0; i < 3; i++) x.fillRect(x0 + w * 0.08, y0 + w * (1.0 + i * 0.06), w * (0.5 - i * 0.08), w * 0.025);
  x.beginPath(); x.arc(x0 + w * 0.8, y0 + w * 1.06, w * 0.07, 0, TAU); x.fillStyle = '#ef6a3a'; x.fill();
  T(x, 'ANNA RIVA', x0 + w * 0.08, y0 + h - w * 0.1, w * 0.085, SANS(700), INK);
}

/** A bookmark ribbon (the widgets' corner icon), h tall, its top-left at x0, y0. */
function ribbon(x: CanvasRenderingContext2D, x0: number, y0: number, h: number, col = '#ffffff', w = h * 0.7) {
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + w, y0); x.lineTo(x0 + w, y0 + h); x.lineTo(x0 + w / 2, y0 + h * 0.72); x.lineTo(x0, y0 + h); x.closePath();
  x.fillStyle = col; x.fill();
}

/** A progress ring: r, line width lw, u done. */
function ring(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, lw: number, u: number, col = '#ffffff') {
  x.save(); x.lineWidth = lw; x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke();
  x.strokeStyle = col; x.lineCap = 'round';
  if (u > 0) { x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(u)); x.stroke(); }
  x.restore();
}

export default class Lista extends Scene {
  layer = new Layer2D();

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out);
    const L = this.layer;
    // the ground: white, then grey and dark under the button, light again under the widget, dark for the icon
    L.clear(colorAt(t, [[0, '#ffffff'], [4.9, '#c4c4c8'], [5.12, '#2c2c2e'], [5.34, '#141416'], [7.92, '#2c2c2e'], [8.1, '#f2f2f6'],
      [9.92, '#c4c4c8'], [10.08, '#141416']], 0.22));
    const x = L.ctx;
    x.save();
    x.translate(W / 2, H / 2); x.scale(K, K);
    if (t < OUT + 0.45) this.folder(x, t);
    if (t >= OUT) this.shape(x, t);
    this.hands(x, t);
    this.pointer(x, t);
    x.restore();
    comp.draw(renderer, L.upload(), out);
    return { bloom: 0.12, bloomThreshold: 0.85, halation: 0, ca: 0, grain: 0.025, vignette: 0, hud: 0 };
  }

  /** Where the folder and the note are at t: the folder grows open, the note rises, then is pulled out. */
  inFolder(t: number) {
    const grow = spring(t, 0.15, { settle: 0.7, overshoot: 0.03 });
    const leave = E('power2.in')(clamp((t - 2.55) / 0.55));
    const fw = lerp(196, 330, grow), fh = lerp(150, 236, grow);
    const cy = lerp(0, 40, grow) + leave * 300;
    const top = cy - fh / 2, front = top + fh * 0.24;
    const rise = lerp(-0.06, 0.2, spring(t, 0.3, { settle: 0.8, overshoot: 0.02 })) * fh + spring(t, 2.5, { settle: 0.6, overshoot: 0 }) * 110;
    const w = Math.min(fw * 0.9, CARD.w);
    const card: Box = { x: -w / 2, y: top - rise, w, h: CARD.h, r: 16 };
    return { fw, fh, top, front, leave, card };
  }

  /** The folder and the note in it, until the note is out (its box then hands over to `shape`). */
  folder(x: CanvasRenderingContext2D, t: number) {
    const { fw, fh, top, front, leave, card } = this.inFolder(t);
    const blur = leave * 16, fade = 1 - clamp((t - 2.85) / 0.4);
    // back panel with its tab
    x.save();
    x.globalAlpha *= fade; if (blur > 0.3) x.filter = `blur(${blur.toFixed(1)}px)`;
    const g = x.createLinearGradient(0, top - fh * 0.1, 0, top + fh);
    g.addColorStop(0, '#4c9ce4'); g.addColorStop(1, '#2a74c6');
    x.fillStyle = g;
    rr(x, -fw / 2, top - fh * 0.09, fw * 0.4, fh * 0.2, fh * 0.06); x.fill();
    rr(x, -fw / 2, top, fw, fh, fh * 0.07); x.fill();
    x.restore();
    // the note, sharp above the front panel, and hidden below the folder's bottom while it is inside
    if (t < OUT) {
      x.save();
      x.beginPath(); x.rect(-400, -600, 800, top + fh - 6 + 600 + (1 - fade) * 900); x.clip();
      this.note(x, t, card, 1);
      x.restore();
    }
    // the front: frosted glass, the note blurred and tinted through it
    x.save();
    x.globalAlpha *= fade; if (blur > 0.3) x.filter = `blur(${blur.toFixed(1)}px)`;
    x.save();
    x.shadowColor = 'rgba(20,80,150,0.25)'; x.shadowBlur = 30; x.shadowOffsetY = 10;
    rr(x, -fw / 2 - 2, front, fw + 4, top + fh - front, fh * 0.08); x.fillStyle = 'rgba(150,205,240,0.6)'; x.fill();
    x.restore();
    rr(x, -fw / 2 - 2, front, fw + 4, top + fh - front, fh * 0.08); x.clip();
    if (t < OUT) { x.save(); x.filter = `blur(${(9 + blur).toFixed(1)}px)`; x.globalAlpha *= 0.85; this.note(x, t, card, 1); x.restore(); }
    const gl = x.createLinearGradient(0, front, 0, top + fh);
    gl.addColorStop(0, 'rgba(235,246,255,0.72)'); gl.addColorStop(0.55, 'rgba(170,218,246,0.72)'); gl.addColorStop(1, 'rgba(88,170,230,0.9)');
    x.fillStyle = gl; x.fillRect(-fw, front, fw * 2, fh);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2.5;
    rr(x, -fw / 2 - 1, front + 1, fw + 2, top + fh - front - 2, fh * 0.08); x.stroke();
    x.restore();
  }

  /** The note: yellow header (date, •••, Fine), the title typed, the four things to do, ticked as the film goes. */
  note(x: CanvasRenderingContext2D, t: number, b: Box, alpha: number) {
    x.save();
    x.globalAlpha *= alpha;
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.12)'; x.shadowBlur = 24; x.shadowOffsetY = 8;
    rr(x, b.x, b.y, b.w, b.h, b.r); x.fillStyle = '#ffffff'; x.fill();
    x.restore();
    x.save();
    rr(x, b.x, b.y, b.w, b.h, b.r); x.clip();
    x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 1.5; rr(x, b.x, b.y, b.w, b.h, b.r); x.stroke();
    const hg = x.createLinearGradient(0, b.y, 0, b.y + 40);
    hg.addColorStop(0, '#fbd94f'); hg.addColorStop(1, '#f7cf3c');
    x.fillStyle = hg; x.fillRect(b.x, b.y, b.w, 40);
    const s = b.w / CARD.w, lx = b.x + 18 * s;
    T(x, 'ven 12 dic 2025   09:30', lx, b.y + 25, 11 * s, SANS(500), 'rgba(28,28,30,0.55)');
    T(x, '•••', b.x + b.w - 62 * s, b.y + 24, 12 * s, SANS(700), 'rgba(28,28,30,0.6)');
    T(x, 'Fine', b.x + b.w - 16 * s, b.y + 25, 11 * s, SANS(600), 'rgba(28,28,30,0.6)', 'right');
    const ty = typed(TITLE, t, 0.38, 24);
    T(x, ty.s, lx, b.y + 74, 18 * s, SANS(600), INK);
    if (ty.caret && !ty.done && t < 1.5) { const w = layout(ty.s, SANS(600), 18 * s).width; x.fillStyle = '#f2b600'; x.fillRect(lx + w + 2, b.y + 58, 2, 20); }
    x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(lx, b.y + 92, b.w - 36 * s, 1.5);
    ITEMS.forEach((s0, i) => {
      const iy = b.y + 132 + i * 46;
      const a = E('power3.out')(clamp((t - 2.62 - i * 0.09) / 0.35));
      if (a <= 0) return;
      x.save(); x.globalAlpha *= a; x.translate(0, (1 - a) * 10);
      const tk = TICKS[i] ?? Infinity, c = clamp((t - tk) / 0.16);
      const cx = lx + 9;
      x.beginPath(); x.arc(cx, iy - 5, 8.5, 0, TAU);
      if (c > 0) { x.fillStyle = `rgba(150,150,157,${c})`; x.fill(); }
      x.strokeStyle = c > 0.5 ? 'rgba(150,150,157,1)' : 'rgba(60,60,67,0.35)'; x.lineWidth = 1.6; x.stroke();
      if (c > 0) {
        x.save(); x.strokeStyle = '#ffffff'; x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round';
        x.setLineDash([16, 16]); x.lineDashOffset = 16 * (1 - E('power2.out')(c));
        x.beginPath(); x.moveTo(cx - 4, iy - 5); x.lineTo(cx - 1, iy - 2); x.lineTo(cx + 4.5, iy - 8.5); x.stroke(); x.restore();
      }
      // the highlighter: a yellow scribble across the words, left to right
      const tw0 = layout(s0, SANS(500), 15).width, hu = E('power1.inOut')(clamp((t - tk - 0.05) / 0.38));
      if (hu > 0) {
        x.save();
        x.globalCompositeOperation = 'multiply';
        x.strokeStyle = 'rgba(255,214,10,0.8)'; x.lineWidth = 9; x.lineCap = 'round';
        x.beginPath();
        const x0 = lx + 28, n = 24;
        for (let k = 0; k <= n * hu; k++) {
          const u = k / n, px = x0 + u * tw0, py = iy - 5 + Math.sin(u * 23 + i) * 2.2;
          if (k === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
        x.restore();
      }
      T(x, s0, lx + 28, iy, 15, SANS(500), c > 0.5 ? 'rgba(28,28,30,0.8)' : INK);
      x.restore();
    });
    x.restore();
    x.restore();
  }

  /** The one shape, from the note out of the folder to the icon. */
  shape(x: CanvasRenderingContext2D, t: number) {
    const ks: [number, Box][] = [[0, this.inFolder(OUT).card], [OUT, CARD], ...MORPH.map(([tt, b]) => [tt, b] as [number, Box])];
    const st = t < 4.9 ? { settle: 0.55, overshoot: 0.015 } : { settle: 0.5, overshoot: 0.03 };
    const b = boxAt(t, ks, st);
    // the button's press: the whole pill dips and comes back
    const press = t > 6.4 && t < 7.1 ? Math.sin(clamp((t - 6.4) / 0.6) * Math.PI) * 0.1 : 0;
    // the turn into the icon
    const rot = springTo(t, [[0, 0], [9.9, -0.6], [10.16, 0]], { settle: 0.42, overshoot: 0.06 });
    const pop = t > 10.2 ? 1 + 0.035 * Math.sin((t - 10.2) * 2.2) * Math.exp(-(t - 10.2) * 1.5) : 1;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    x.save();
    x.translate(cx, cy); x.rotate(rot); x.scale((1 - press) * pop, (1 - press) * pop); x.translate(-cx, -cy);
    if (t < 4.95) {
      // still the note: drawn whole, with a grab squeeze when the hand takes it
      const sq = t > 4.82 ? Math.sin(clamp((t - 4.82) / 0.25) * Math.PI) * 0.03 : 0;
      x.translate(cx, cy); x.scale(1 - sq, 1 - sq); x.translate(-cx, -cy);
      this.note(x, t, b, 1);
      x.restore();
      return;
    }
    const fill = colorAt(t, [[0, '#ffffff'], ...MORPH.map(([tt, , c]) => [tt, c] as [number, string])], 0.35);
    // the note's own blur-out over the first part of the morph
    const nu = clamp((t - 4.95) / 0.3);
    if (nu < 1) { x.save(); x.globalAlpha *= 1 - nu; x.filter = `blur(${(nu * 14).toFixed(1)}px)`; this.note(x, t, b, 1); x.restore(); }
    x.save();
    x.globalAlpha *= clamp(nu * 2.5);
    x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 40; x.shadowOffsetY = 14;
    rr(x, b.x, b.y, b.w, b.h, b.r); x.fillStyle = fill; x.fill();
    x.restore();
    x.save();
    x.globalAlpha *= clamp(nu * 2.5);
    rr(x, b.x, b.y, b.w, b.h, b.r); x.clip();
    // a soft light from the top-left on the orange stages
    const og = x.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    og.addColorStop(0, 'rgba(255,215,120,0.35)'); og.addColorStop(1, 'rgba(230,90,0,0.18)');
    const orange = Math.max(clamp((t - 6.98) / 0.3) * (1 - clamp((t - 8.0) / 0.3)), clamp((t - 9.05) / 0.3));
    if (orange > 0) { x.save(); x.globalAlpha *= orange; x.fillStyle = og; x.fillRect(b.x, b.y, b.w, b.h); x.restore(); }
    const stage = (s: number) => (s === 0 ? () => this.pill(x, t, b) : s === 1 ? () => this.small(x, t, b) : s === 2 ? () => this.wide(x, t, b) : s === 3 ? () => this.big(x, t, b) : () => this.glyph(x, t, b));
    if (t < 6.95) { const k = E('power2.out')(clamp((t - 5.1) / 0.35)); x.save(); x.globalAlpha *= k; if (k < 0.99) x.filter = `blur(${((1 - k) * 12).toFixed(1)}px)`; stage(0)(); x.restore(); }
    else if (t < 7.98) swap(x, t, 6.95, 0.45, stage(0), stage(1), 14);
    else if (t < 9.02) swap(x, t, 7.98, 0.42, stage(1), stage(2), 14);
    else if (t < 9.92) swap(x, t, 9.02, 0.45, stage(2), stage(3), 14);
    else swap(x, t, 9.92, 0.4, stage(3), stage(4), 16);
    x.restore();
    x.restore();
  }

  pill(x: CanvasRenderingContext2D, t: number, b: Box) {
    const on = spring(t, 6.42, { settle: 0.45, overshoot: 0.05 });
    T(x, 'Iniziamo', b.x + 34, b.y + b.h / 2 + 11, 31, SANS(500), '#f2f2f7');
    const bw = lerp(86, 126, on), bh = lerp(54, 58, on);
    const bx = b.x + b.w - 13 - bw, by = b.y + (b.h - bh) / 2;
    x.save(); x.shadowColor = 'rgba(26,132,255,0.45)'; x.shadowBlur = 18 * on;
    rr(x, bx, by, bw, bh, bh / 2); x.fillStyle = BLUE; x.fill(); x.restore();
    const a = 1 - clamp((t - 6.42) / 0.12);
    if (a > 0) {
      x.save(); x.globalAlpha *= a; x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round';
      const ax = bx + bw / 2, ay = b.y + b.h / 2;
      x.beginPath(); x.moveTo(ax, ay + 12); x.lineTo(ax, ay - 12); x.moveTo(ax - 9, ay - 3); x.lineTo(ax, ay - 12); x.lineTo(ax + 9, ay - 3); x.stroke();
      x.restore();
    }
  }

  small(x: CanvasRenderingContext2D, t: number, b: Box) {
    cover(x, b.x + 24, b.y + 22, 102);
    ribbon(x, b.x + b.w - 40, b.y + 22, 26, '#ffffff', 17);
    const u = 0.49 * E('power2.out')(clamp((t - 7.3) / 0.6));
    ring(x, b.x + 34, b.y + b.h - 30, 9, 3.5, u);
    T(x, '8 min', b.x + 52, b.y + b.h - 24, 17, SANS(600), '#ffffff');
  }

  wide(x: CanvasRenderingContext2D, t: number, b: Box) {
    cover(x, b.x + 24, b.y + 22, 102);
    ribbon(x, b.x + b.w - 40, b.y + 22, 26, '#ffffff', 17);
    T(x, BOOK_LINE, b.x + 150, b.y + 78, 30, SERIF, '#ffffff');
    const pct = Math.round(lerp(30, 49, E('power2.out')(clamp((t - 8.05) / 0.5))));
    T(x, `${pct}% completato`, b.x + 151, b.y + 112, 19, SANS(500), 'rgba(255,255,255,0.88)');
    ring(x, b.x + 34, b.y + b.h - 30, 9, 3.5, 0.49);
    T(x, '8 min all’obiettivo', b.x + 52, b.y + b.h - 24, 17, SANS(500), '#ffffff');
  }

  big(x: CanvasRenderingContext2D, t: number, b: Box) {
    cover(x, b.x + 24, b.y + 24, 116);
    ribbon(x, b.x + b.w - 42, b.y + 24, 28, '#ffffff', 18);
    T(x, BOOK[0]!, b.x + 160, b.y + 62, 23, SERIF, '#ffffff');
    T(x, BOOK[1]!, b.x + 160, b.y + 88, 23, SERIF, '#ffffff');
    T(x, '49% completato', b.x + 160, b.y + 116, 15, SANS(500), 'rgba(255,255,255,0.88)');
    T(x, 'Lettura di oggi', b.x + 26, b.y + 238, 21, SERIF, '#ffffff');
    DAYS.forEach((d, i) => {
      const cx = b.x + 44 + i * 45, cy = b.y + 290, a = E('back.out(2)')(clamp((t - 9.35 - i * 0.04) / 0.3));
      if (a <= 0) return;
      x.save(); x.translate(cx, cy); x.scale(a, a);
      if (i === 0) { x.beginPath(); x.arc(0, 0, 16, 0, TAU); x.fillStyle = '#ffd43b'; x.fill(); T(x, d, 0, 6, 15, SANS(700), '#7a4a00', 'center'); }
      else if (i === 1) { ring(x, 0, 0, 15, 3.5, 0.62 * E('power2.out')(clamp((t - 9.5) / 0.6))); T(x, d, 0, 6, 15, SANS(700), '#ffffff', 'center'); }
      else { x.beginPath(); x.arc(0, 0, 15, 0, TAU); x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 2; x.stroke(); T(x, d, 0, 6, 14, SANS(600), 'rgba(255,255,255,0.7)', 'center'); }
      x.restore();
    });
    T(x, '8 minuti all’obiettivo di oggi', b.x + b.w / 2, b.y + 348, 14, SANS(500), 'rgba(255,255,255,0.85)', 'center');
  }

  /** The app icon's glyph (drawn for this film): a closed book with an orange ribbon, on the orange square. */
  glyph(x: CanvasRenderingContext2D, _t: number, b: Box) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, s = b.w / ICON.w;
    const bw = 124 * s, bh = 156 * s;
    x.save();
    x.shadowColor = 'rgba(150,60,0,0.35)'; x.shadowBlur = 18 * s; x.shadowOffsetY = 6 * s;
    rr(x, cx - bw / 2, cy - bh / 2, bw, bh, 14 * s); x.fillStyle = '#ffffff'; x.fill();
    x.restore();
    rr(x, cx - bw / 2, cy - bh / 2, 22 * s, bh, 14 * s); x.fillStyle = '#ffe3c2'; x.fill();
    x.fillStyle = '#ffe3c2'; x.fillRect(cx - bw / 2 + 12 * s, cy - bh / 2, 10 * s, bh);
    x.fillStyle = 'rgba(243,146,15,0.25)';
    for (let i = 0; i < 3; i++) x.fillRect(cx - bw / 2 + 40 * s, cy - bh / 2 + (40 + i * 18) * s, (64 - i * 14) * s, 6 * s);
    x.save(); x.shadowColor = 'rgba(120,40,0,0.3)'; x.shadowBlur = 6 * s; x.shadowOffsetY = 2 * s;
    ribbon(x, cx + 20 * s, cy - bh / 2 - 8 * s, 100 * s, '#e8590c', 28 * s);
    x.restore();
  }

  /** The hand: it opens the folder, swings off and back, pulls the note out, later takes it, swipes, grabs. */
  hands(x: CanvasRenderingContext2D, t: number) {
    const ks: [number, number, number][] = [[0, 70, 62], [0.25, 120, 110], [1.05, 170, 165], [1.45, -150, 60], [1.8, -270, 40],
      [2.05, 10, -10], [2.25, 12, -55], [2.6, 20, -150], [3.05, 160, -380],
      [4.45, 60, -330], [4.62, 0, -175], [4.98, 0, -150], [5.2, 40, 120],
      [7.6, -420, 30], [7.82, -150, 20], [8.02, 40, 10], [8.25, 330, 40],
      [8.6, 30, -330], [8.82, 0, -150], [9.15, 0, -200], [9.4, 60, -400]];
    const sx = (tt: number) => springTo(tt, ks.map((k) => [k[0], k[1]] as [number, number]), { settle: 0.42, overshoot: 0.0 });
    const sy = (tt: number) => springTo(tt, ks.map((k) => [k[0], k[2]] as [number, number]), { settle: 0.42, overshoot: 0.0 });
    const vis = t < 3.35 ? 1 : t < 4.4 ? 0 : t < 5.45 ? clamp((t - 4.4) / 0.1) * (1 - clamp((t - 5.15) / 0.25)) : t < 7.5 ? 0 :
      t < 8.45 ? clamp((t - 7.55) / 0.08) * (1 - clamp((t - 8.2) / 0.2)) : t < 9.6 ? clamp((t - 8.5) / 0.1) * (1 - clamp((t - 9.25) / 0.3)) : 0;
    if (vis <= 0) return;
    const pose: Pose = t < 1.25 ? 'point' : t < 1.95 ? 'peace' : t < 3.4 ? (t > 2.4 && t < 2.62 ? 'grab' : 'point')
      : t < 4.8 ? 'open' : t < 5.5 ? 'grab' : t < 8.5 ? 'open' : t < 8.95 ? 'open' : 'grab';
    // a tap: a quick dip in size
    const tap = [0.05, 2.3].reduce((m, tt) => Math.max(m, t > tt && t < tt + 0.2 ? Math.sin(((t - tt) / 0.2) * Math.PI) : 0), 0);
    const px = sx(t), py = sy(t);
    // the fast swings smear: a few faint copies along the path just behind
    const vx = (px - sx(t - 1 / 60)) * 60, vy = (py - sy(t - 1 / 60)) * 60, sp = Math.hypot(vx, vy);
    const rot = clamp(vx / 4000, -0.35, 0.35);
    if (sp > 900) for (let k = 4; k >= 1; k--) hand(x, sx(t - k * 0.008), sy(t - k * 0.008), pose, 1.1, rot, vis * 0.16);
    hand(x, px, py, pose, 1.1 * (1 - 0.12 * tap), rot, vis);
  }

  /** The arrow pointer that presses the button. */
  pointer(x: CanvasRenderingContext2D, t: number) {
    if (t < 5.85 || t > 7.15) return;
    x.save();
    x.globalAlpha *= clamp((t - 5.85) / 0.12) * (1 - clamp((t - 6.95) / 0.2));
    cursor(x, t, [[5.85, 210, -170], [6.06, 128, -6, true], [6.62, 150, 96], [6.9, 230, 220]], { color: '#f5f5f7', size: 30, ripple: 'rgba(26,132,255,0.85)' });
    x.restore();
  }
}
