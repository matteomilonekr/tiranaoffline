// "Paper night": the set two films share (films/gem, films/polish). A night workshop in papercraft: a navy
// brick wall with moonlit windows, a wooden floor in perspective, warm lamp light; a cream paper banner taped
// across the top with the shot's headline; captions on terracotta paper tags; an orange box creature (Claude's
// stand-in, drawn here) and a blue paper whale (DeepSeek's); props cut from paper with short soft shadows.
// A shot is a camera (a slow push-in, a punch at the cut) over the room and its props. Canvas2D, pure in t.
import { W, H } from '@kit/engine/gl';
import { F, font, measure } from '@kit/engine/type';
import type { Lyrics } from '@kit/engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog } from '@kit/engine/util';

export const NAVY0 = '#121838', NAVY1 = '#1d2652', BRICK = '#232c5c', MOON = '#9cc0ff', WOOD0 = '#4a3326', WOOD1 = '#5c4030', WOOD2 = '#6e4c37';
export const PAPER = '#efe3c7', CREAM = '#fbf3e1', TAG = '#c4633a', TAG_D = '#9f4c2b', INK = '#1b1714', ORANGE = '#e8784a', ORANGE_T = '#f69a6c', ORANGE_S = '#c35b35';
export const BLUE = '#3a5fe6', BLUE_D = '#2a46b8', BLUE_L = '#e7ecff', GOLD = '#f2b53c', GOLD_D = '#c98a1e', PURPLE = '#7b4dff', PINK = '#ff7ad1';
export const TAU = Math.PI * 2;
export const FLOOR_Y = 1290;
export { W, H, F, font, measure, clamp, ease, hash, lerp, noise1, prog };

// ------------------------------------------------------------------ small helpers
export function rr(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(x0, y0, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}
export const pop = (t: number, t0: number, d = 0.32, s = 1.7) => (t < t0 ? 0 : ease.outBack(prog(t, t0, t0 + d), s));
export const life = (t: number, t0: number, t1 = Infinity, d = 0.32) => Math.min(pop(t, t0, d), t1 === Infinity ? 1 : 1 - ease.inBack(prog(t, t1 - 0.2, t1)));
export const bump = (t: number, t0: number, d = 0.25) => (t < t0 ? 0 : Math.max(0, 1 - (t - t0) / d) ** 2);
export function at(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number, fn: () => void) {
  if (s <= 0.002) return;
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s); x.translate(-cx, -cy); fn(); x.restore();
}
export function txt(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, color: string, o: { align?: CanvasTextAlign; alpha?: number; track?: number } = {}) {
  x.save(); x.globalAlpha *= o.alpha ?? 1; x.font = font(fam, size); x.textAlign = o.align ?? 'left'; x.fillStyle = color;
  if (o.track) x.letterSpacing = `${o.track}px`;
  x.fillText(s, px, py); x.restore();
}
/** A path with slightly torn edges (paper) around a rectangle. */
export function tornRect(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number, jag = 4) {
  const pts: [number, number][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number, k: number) => {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 14));
    for (let i = 0; i < n; i++) {
      const u = i / n, nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1, d = (hash(seed, k, i) - 0.5) * jag;
      pts.push([lerp(ax, bx, u) + (nx / nl) * d, lerp(ay, by, u) + (ny / nl) * d]);
    }
  };
  edge(x0, y0, x0 + w, y0, 1); edge(x0 + w, y0, x0 + w, y0 + h, 2); edge(x0 + w, y0 + h, x0, y0 + h, 3); edge(x0, y0 + h, x0, y0, 4);
  x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
}
/** Paper: a soft short shadow, the fill, a faint speckle. */
export function paperPiece(x: CanvasRenderingContext2D, path: () => void, fill: string, o: { shadow?: number; speckle?: number; seed?: number } = {}) {
  const sh = o.shadow ?? 10;
  x.save();
  x.shadowColor = 'rgba(5,6,20,0.45)'; x.shadowBlur = sh * 1.6; x.shadowOffsetY = sh * 0.6;
  path(); x.fillStyle = fill; x.fill();
  x.restore();
  if (o.speckle !== 0) {
    x.save(); path(); x.clip();
    x.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < (o.speckle ?? 60); i++) x.fillRect(hash(i, o.seed ?? 1) * W, hash(i, (o.seed ?? 1) + 7) * H, 2, 2);
    x.restore();
  }
}

// ------------------------------------------------------------------ the room and the camera
export interface Cam { zoom: number; fx: number; fy: number; dx: number; dy: number }
/** A shot's camera: a slow push-in over [t0, t1] towards (fx, fy), a punch-in at the cut. */
export function shotCam(t: number, t0: number, t1: number, fx = W / 2, fy = 1000, base = 1, push = 0.07, sway = 1): Cam {
  const u = clamp((t - t0) / Math.max(0.1, t1 - t0));
  const punch = 0.1 * (1 - ease.outCubic(clamp((t - t0) / 0.32)));
  return { zoom: base * (1 + push * ease.inOutQuad(u) + punch), fx, fy, dx: sway * 10 * noise1(t * 0.35, 3), dy: sway * 8 * noise1(t * 0.3, 7) };
}
export function withCam(x: CanvasRenderingContext2D, c: Cam, fn: () => void) {
  x.save(); x.translate(c.fx + c.dx, c.fy + c.dy); x.scale(c.zoom, c.zoom); x.translate(-c.fx, -c.fy); fn(); x.restore();
}

/** The workshop at night. `win`: windows' x positions; `lamp`: a hanging lamp's x (or null). */
export function room(x: CanvasRenderingContext2D, t: number, o: { win?: number[]; lamp?: number | null; floor?: number } = {}) {
  const fy = o.floor ?? FLOOR_Y;
  // the wall, and its bricks
  const g = x.createLinearGradient(0, -300, 0, fy);
  g.addColorStop(0, NAVY0); g.addColorStop(1, NAVY1);
  x.fillStyle = g; x.fillRect(-400, -400, W + 800, fy + 400);
  x.strokeStyle = 'rgba(8,10,30,0.35)'; x.lineWidth = 3;
  for (let r = 0, y = -380; y < fy; y += 46, r++) {
    x.beginPath(); x.moveTo(-400, y); x.lineTo(W + 400, y); x.stroke();
    for (let bx = -400 + (r % 2 ? 60 : 0); bx < W + 400; bx += 120) { x.beginPath(); x.moveTo(bx, y); x.lineTo(bx, y + 46); x.stroke(); }
  }
  x.fillStyle = 'rgba(70,90,170,0.06)';
  for (let i = 0; i < 90; i++) x.fillRect(-400 + hash(i, 2) * (W + 800), -380 + hash(i, 3) * (fy + 380), 110, 40);
  // moonlit windows and their light on the wall
  for (const wx of o.win ?? [180, 900]) {
    const ww = 220, wh = 380, wy = 330;
    const gl = x.createRadialGradient(wx, wy + wh / 2, 40, wx, wy + wh / 2, 420);
    gl.addColorStop(0, 'rgba(120,160,255,0.22)'); gl.addColorStop(1, 'rgba(120,160,255,0)');
    x.fillStyle = gl; x.fillRect(wx - 450, wy - 250, 900, 900);
    rr(x, wx - ww / 2 - 16, wy - 16, ww + 32, wh + 32, 10); x.fillStyle = '#3a2a22'; x.fill();
    const sky = x.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, '#2c3f8a'); sky.addColorStop(1, '#5b7fd8');
    rr(x, wx - ww / 2, wy, ww, wh, 6); x.fillStyle = sky; x.fill();
    x.beginPath(); x.arc(wx + ww * 0.18, wy + wh * 0.24, 30, 0, TAU); x.fillStyle = '#f4f1dc'; x.fill(); // the moon
    x.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 9; i++) x.fillRect(wx - ww / 2 + hash(i, wx) * ww, wy + hash(i, wx + 1) * wh * 0.7, 2.5, 2.5);
    x.fillStyle = '#3a2a22'; x.fillRect(wx - 6, wy, 12, wh); x.fillRect(wx - ww / 2, wy + wh / 2 - 6, ww, 12);
  }
  // the floor: planks converging to the horizon
  const vx = W / 2, vy = fy - 900;
  for (let i = -14; i < 14; i++) {
    const x0 = vx + (i * 150), x1 = vx + ((i + 1) * 150);
    const k = (y: number) => (y - vy) / (fy + 1400 - vy);
    const pa = (px: number, y: number) => vx + (px - vx) * (k(y) / k(fy + 1400));
    x.beginPath();
    x.moveTo(pa(x0, fy), fy); x.lineTo(pa(x1, fy), fy); x.lineTo(x1, fy + 1400); x.lineTo(x0, fy + 1400); x.closePath();
    x.fillStyle = [WOOD0, WOOD1, WOOD2][(i + 30) % 3]!; x.fill();
    x.strokeStyle = 'rgba(20,10,5,0.45)'; x.lineWidth = 3; x.stroke();
  }
  x.fillStyle = 'rgba(15,8,4,0.55)'; x.fillRect(-400, fy - 6, W + 800, 12); // the skirting
  // a warm lamp and its pool of light
  if (o.lamp !== null) {
    const lx = o.lamp ?? W / 2, ly = 120;
    x.strokeStyle = '#0b0d1e'; x.lineWidth = 5; x.beginPath(); x.moveTo(lx, -400); x.lineTo(lx, ly); x.stroke();
    x.beginPath(); x.moveTo(lx - 90, ly + 70); x.lineTo(lx - 40, ly); x.lineTo(lx + 40, ly); x.lineTo(lx + 90, ly + 70); x.closePath();
    x.fillStyle = '#1a1c30'; x.fill();
    x.beginPath(); x.ellipse(lx, ly + 72, 60, 14, 0, 0, TAU); x.fillStyle = '#ffe2a8'; x.fill();
    x.save(); x.globalCompositeOperation = 'lighter';
    const cone = x.createLinearGradient(0, ly + 70, 0, fy + 300);
    cone.addColorStop(0, `rgba(255,190,110,${0.2 + 0.02 * Math.sin(t * 3)})`); cone.addColorStop(1, 'rgba(255,190,110,0)');
    x.beginPath(); x.moveTo(lx - 80, ly + 72); x.lineTo(lx + 80, ly + 72); x.lineTo(lx + 520, fy + 300); x.lineTo(lx - 520, fy + 300); x.closePath();
    x.fillStyle = cone; x.fill();
    const pool = x.createRadialGradient(lx, fy + 140, 20, lx, fy + 140, 520);
    pool.addColorStop(0, 'rgba(255,180,100,0.28)'); pool.addColorStop(1, 'rgba(255,180,100,0)');
    x.fillStyle = pool; x.fillRect(lx - 600, fy - 200, 1200, 800);
    x.restore();
  }
}

/** Dust motes in the light, and a dark falloff at the edges (drawn over the shot, outside the camera). */
export function atmosphere(x: CanvasRenderingContext2D, t: number) {
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const px = (hash(i, 1) * W + t * 12 * (hash(i, 2) - 0.5) * 3 + W) % W, py = (hash(i, 3) * H + t * 18 * (0.3 + hash(i, 4))) % H;
    const a = 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + i));
    x.fillStyle = `rgba(255,220,170,${a})`; x.beginPath(); x.arc(px, py, 1.5 + 1.5 * hash(i, 5), 0, TAU); x.fill();
  }
  x.restore();
  const v = x.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(2,3,12,0.55)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ the banner and the captions
/** The cream paper strip taped across the top: the current headline flaps in at its time. `keys`: [[t, text], ...]. */
export function banner(x: CanvasRenderingContext2D, t: number, keys: [number, string][], y = 330) {
  let cur: [number, string] | null = null;
  for (const k of keys) if (k[0] <= t) cur = k;
  if (!cur) return;
  const [t0, s] = cur;
  const fam = F.archivo(100, 900);
  let size = 56;
  while (measure(s, fam, size) > 900 && size > 32) size -= 1;
  const tw = measure(s, fam, size) + 110, th = size * 1.9;
  const k = ease.outBack(clamp((t - t0) / 0.35), 1.6), rot = lerp(-0.12, -0.012, k) + 0.004 * Math.sin(t * 1.4);
  x.save();
  x.translate(W / 2, y); x.rotate(rot); x.scale(lerp(0.85, 1, k), lerp(0.6, 1, k));
  paperPiece(x, () => tornRect(x, -tw / 2, -th / 2, tw, th, 31, 5), PAPER, { shadow: 12, speckle: 0 });
  x.fillStyle = 'rgba(120,90,50,0.08)'; for (let i = 0; i < 30; i++) x.fillRect(-tw / 2 + hash(i, 4) * tw, -th / 2 + hash(i, 5) * th, 3, 3);
  txt(x, s, 0, size * 0.36, size, fam, INK, { align: 'center' });
  for (const sx of [-1, 1]) { // tape at both ends
    x.save(); x.translate(sx * (tw / 2 - 18), -th / 2 + 6); x.rotate(sx * 0.7);
    x.fillStyle = 'rgba(245,235,205,0.75)'; x.fillRect(-46, -14, 92, 28);
    x.fillStyle = 'rgba(160,140,100,0.25)'; x.fillRect(-46, -14, 92, 3);
    x.restore();
  }
  x.restore();
}

interface CapWord { w: string; start: number; end: number }
/** The voice in pages of one to three words, each word on its own torn terracotta tag. */
export class PaperCaptions {
  pages: CapWord[][] = [];
  constructor(ly: Lyrics, maxChars = 15) {
    for (const l of ly.lines) {
      let cur: CapWord[] = [];
      for (const w of l.words) {
        const disp = w.w.replace(/[«»"“”]/g, '').replace(/[.,:;!?…]+$/u, '');
        const len = cur.reduce((n, c) => n + c.w.length + 1, 0) + disp.length;
        if (cur.length && (len > maxChars || cur.length >= 3)) { this.pages.push(cur); cur = []; }
        cur.push({ w: disp, start: w.start, end: w.end });
        if (/[.,:;!?]$/u.test(w.w)) { this.pages.push(cur); cur = []; }
      }
      if (cur.length) this.pages.push(cur);
    }
  }
  draw(x: CanvasRenderingContext2D, t: number, y = 1500) {
    let i = -1;
    for (let k = 0; k < this.pages.length; k++) if (t >= this.pages[k]![0]!.start - 0.06) i = k;
    if (i < 0) return;
    const p = this.pages[i]!, next = this.pages[i + 1];
    const out = Math.min(p[p.length - 1]!.end + 0.6, next ? next[0]!.start - 0.06 : Infinity);
    if (t > out) return;
    const fam = F.fraunces(900), size = 76, padX = 22, gap = 14, hgt = 106;
    const ws = p.map((w) => measure(w.w, fam, size) + padX * 2);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (p.length - 1);
    const k0 = total > 980 ? 980 / total : 1;
    let px = W / 2 - (total * k0) / 2;
    p.forEach((w, j) => {
      const s = ease.outBack(clamp((t - (p[0]!.start - 0.06) - j * 0.04) / 0.22), 2) * (1 - ease.inBack(clamp((t - out + 0.1) / 0.1)));
      const cx = px + (ws[j]! * k0) / 2, rot = (hash(i, j) - 0.5) * 0.08, said = t >= w.start - 0.03;
      at(x, cx, y, s * k0, rot, () => {
        paperPiece(x, () => tornRect(x, cx - ws[j]! / 2, y - hgt / 2, ws[j]!, hgt, i * 7 + j, 4), said ? TAG : TAG_D, { shadow: 8, speckle: 30, seed: i + j });
        txt(x, w.w, cx, y + size * 0.32, size, fam, CREAM, { align: 'center', alpha: said ? 1 : 0.75 });
      });
      px += (ws[j]! + gap) * k0;
    });
  }
}

// ------------------------------------------------------------------ the characters
export interface BotLook { hat?: 'beret' | 'goggles' | 'cap' | null; shirt?: boolean; capColor?: string; wave?: boolean }

/** The orange box creature, papercraft: front, top and side faces, two eyes, stubby legs and arms. (cx, base) is its
 *  feet's centre on the floor; s its scale (1: about 300 px tall). */
export function bot(x: CanvasRenderingContext2D, t: number, cx: number, base: number, s = 1, o: BotLook & { look?: number; hop?: number; seed?: number } = {}) {
  const seed = o.seed ?? 0;
  const bob = Math.abs(Math.sin(t * 3.2 + seed)) * 6 + (o.hop ?? 0);
  x.save();
  x.translate(cx, base - bob); x.scale(s, s);
  const bw = 230, bh = 200, depth = 46;
  // shadow on the floor
  x.save(); x.scale(1, 0.22); x.beginPath(); x.arc(0, (bob / s) / 0.22, 150, 0, TAU); x.fillStyle = 'rgba(5,4,15,0.35)'; x.fill(); x.restore();
  // legs
  for (const lx of [-80, -30, 30, 80]) {
    const kick = Math.sin(t * 6 + lx + seed) * 4;
    x.fillStyle = ORANGE_S; x.fillRect(lx - 12, -40 + kick * 0.2, 24, 40);
    x.fillStyle = ORANGE; x.fillRect(lx - 12, -40, 20, 38);
  }
  const top = -40 - bh;
  // body: side face, top face, front face
  x.beginPath(); x.moveTo(bw / 2, top); x.lineTo(bw / 2 + depth * 0.55, top - depth * 0.45); x.lineTo(bw / 2 + depth * 0.55, -40 - depth * 0.45); x.lineTo(bw / 2, -40); x.closePath();
  x.fillStyle = ORANGE_S; x.fill();
  x.beginPath(); x.moveTo(-bw / 2, top); x.lineTo(-bw / 2 + depth * 0.55, top - depth * 0.45); x.lineTo(bw / 2 + depth * 0.55, top - depth * 0.45); x.lineTo(bw / 2, top); x.closePath();
  x.fillStyle = ORANGE_T; x.fill();
  x.fillStyle = ORANGE; x.fillRect(-bw / 2, top, bw, bh);
  // paper grain on the front
  x.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = 0; i < 40; i++) x.fillRect(-bw / 2 + hash(i, 3) * bw, top + hash(i, 4) * bh, 3, 3);
  // shirt (painter): white with paint dots and a red scarf
  if (o.shirt) {
    x.fillStyle = '#f4efe6'; x.fillRect(-bw / 2, top + bh * 0.55, bw, bh * 0.45);
    for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(-bw / 2 + 20 + hash(i, 9) * (bw - 40), top + bh * 0.62 + hash(i, 10) * bh * 0.32, 7, 0, TAU); x.fillStyle = [PURPLE, '#3a8fff', '#ff5a5a'][i % 3]!; x.fill(); }
    x.fillStyle = '#d9302c'; x.fillRect(-bw / 2, top + bh * 0.52, bw, 22); x.fillRect(-14, top + bh * 0.52, 26, 70);
  }
  // eyes (blink)
  const blink = (t + seed) % 3.3 < 0.12 ? 0.15 : 1, look = (o.look ?? 0) * 10;
  for (const ex of [-45, 45]) {
    if (o.hat === 'goggles') {
      x.beginPath(); x.arc(ex + look, top + 62, 30, 0, TAU); x.fillStyle = GOLD; x.fill();
      x.beginPath(); x.arc(ex + look, top + 62, 21, 0, TAU); x.fillStyle = '#14100c'; x.fill();
      x.beginPath(); x.arc(ex + look - 7, top + 55, 6, 0, TAU); x.fillStyle = 'rgba(255,255,255,0.8)'; x.fill();
    } else {
      x.fillStyle = '#14100c'; rr(x, ex - 13 + look, top + 40 + (1 - blink) * 25, 26, 52 * blink, 6); x.fill();
    }
  }
  if (o.hat === 'goggles') { x.fillStyle = '#5a3a1e'; x.fillRect(-bw / 2, top + 56, 18, 12); x.fillRect(bw / 2 - 18, top + 56, 18, 12); x.fillRect(-17 + look, top + 58, 34, 8); }
  if (o.hat === 'beret') {
    x.beginPath(); x.ellipse(-10, top - 18, 120, 34, -0.08, 0, TAU); x.fillStyle = '#1d1c24'; x.fill();
    x.fillStyle = '#1d1c24'; x.fillRect(-14, top - 58, 8, 16);
  }
  if (o.hat === 'cap') { // a golden "design skill" cap
    x.beginPath(); x.ellipse(0, top - 6, 135, 28, 0, 0, TAU); x.fillStyle = GOLD_D; x.fill();
    x.beginPath(); x.ellipse(0, top - 20, 105, 70, 0, Math.PI, TAU); x.fillStyle = o.capColor ?? GOLD; x.fill();
  }
  // arms
  const wv = o.wave ? Math.sin(t * 10) * 0.5 : 0;
  for (const sd of [-1, 1]) {
    x.save(); x.translate(sd * (bw / 2 + 6), top + bh * 0.55); x.rotate(sd * (0.25 + (sd > 0 ? wv - (o.wave ? 1.6 : 0) : 0)));
    x.fillStyle = ORANGE_S; x.fillRect(-11, 0, 22, 62); x.fillStyle = ORANGE; x.fillRect(-11, 0, 18, 60);
    x.restore();
  }
  x.restore();
}

/** The blue paper whale: body, belly, eye, fin, tail; `mouth` 0..1 opens it; faces left (dir -1) or right. */
export function whale(x: CanvasRenderingContext2D, t: number, cx: number, cy: number, s = 1, o: { dir?: number; mouth?: number; seed?: number } = {}) {
  const dir = o.dir ?? -1, m = clamp(o.mouth ?? 0), seed = o.seed ?? 0;
  x.save();
  x.translate(cx, cy + Math.sin(t * 2.4 + seed) * 10); x.scale(s * -dir, s); x.rotate(Math.sin(t * 1.7 + seed) * 0.05);
  x.save(); x.shadowColor = 'rgba(5,6,20,0.45)'; x.shadowBlur = 24; x.shadowOffsetY = 14;
  // tail (flaps)
  const flap = Math.sin(t * 5 + seed) * 0.25;
  x.save(); x.translate(-150, -10); x.rotate(flap);
  x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(-60, -20, -95, -75); x.quadraticCurveTo(-55, -30, -30, 0); x.quadraticCurveTo(-55, 30, -95, 60); x.quadraticCurveTo(-60, 15, 0, 0);
  x.fillStyle = BLUE_D; x.fill(); x.restore();
  // body, with the jaw opening at the front
  x.beginPath();
  x.moveTo(-160, -5);
  x.bezierCurveTo(-150, -110, 40, -130, 150, -50);
  x.lineTo(170, -20 - m * 25);
  x.lineTo(60, 10 + m * 6);
  x.lineTo(170, 25 + m * 30);
  x.bezierCurveTo(120, 95, -60, 100, -160, -5);
  x.closePath();
  x.fillStyle = BLUE; x.fill();
  x.restore();
  // belly
  x.beginPath(); x.moveTo(-120, 30); x.bezierCurveTo(-40, 80, 90, 75, 165, 28 + m * 28); x.lineTo(70, 18 + m * 6); x.bezierCurveTo(10, 40, -60, 40, -120, 30); x.closePath();
  x.fillStyle = BLUE_L; x.fill();
  // mouth inside
  if (m > 0.05) { x.beginPath(); x.moveTo(168, -18 - m * 24); x.lineTo(64, 10 + m * 5); x.lineTo(168, 22 + m * 28); x.closePath(); x.fillStyle = '#1a1440'; x.fill(); }
  // eye, fin, a paper fold
  x.beginPath(); x.arc(70, -40, 16, 0, TAU); x.fillStyle = '#ffffff'; x.fill();
  x.beginPath(); x.arc(74, -40, 9, 0, TAU); x.fillStyle = '#0d0c1c'; x.fill();
  x.beginPath(); x.moveTo(-10, 30); x.quadraticCurveTo(-40, 90, -80, 100); x.quadraticCurveTo(-30, 70, 20, 40); x.closePath(); x.fillStyle = BLUE_D; x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-100, -40); x.quadraticCurveTo(0, -70, 100, -45); x.stroke();
  x.restore();
}

// ------------------------------------------------------------------ props
export function coin(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, spin: number) {
  const k = Math.abs(Math.cos(spin));
  x.save(); x.translate(cx, cy); x.scale(Math.max(0.15, k), 1);
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fillStyle = GOLD_D; x.fill();
  x.beginPath(); x.arc(0, -r * 0.08, r * 0.9, 0, TAU); x.fillStyle = GOLD; x.fill();
  if (k > 0.4) txt(x, '$', 0, r * 0.28, r * 0.9, F.fraunces(900), GOLD_D, { align: 'center' });
  x.restore();
}

/** A comment box (not any app's): an avatar, the comment typed in, a send label. */
export function commentBox(x: CanvasRenderingContext2D, t: number, cx: number, cy: number, word: string, t0: number, s = 1) {
  const n = Math.max(0, Math.min(word.length, Math.floor((t - t0) * 14)));
  const typed = word.slice(0, n), w = 820, h = 130;
  at(x, cx, cy, s, -0.01, () => {
    paperPiece(x, () => rr(x, cx - w / 2, cy - h / 2, w, h, h / 2), '#fbfaf7', { shadow: 14, speckle: 0 });
    x.beginPath(); x.arc(cx - w / 2 + 70, cy, 38, 0, TAU); x.fillStyle = ORANGE; x.fill();
    x.fillStyle = '#14100c'; x.fillRect(cx - w / 2 + 56, cy - 14, 8, 20); x.fillRect(cx - w / 2 + 76, cy - 14, 8, 20);
    if (!typed) txt(x, 'Aggiungi un commento…', cx - w / 2 + 132, cy + 14, 38, F.grotesk(500), '#9a96a3');
    else txt(x, typed, cx - w / 2 + 130, cy + 22, 66, F.archivo(100, 900), INK);
    if (typed && n < word.length) { x.fillStyle = INK; x.fillRect(cx - w / 2 + 134 + measure(typed, F.archivo(100, 900), 66), cy - 30, 5, 58); }
    txt(x, 'Pubblica', cx + w / 2 - 50, cy + 14, 36, F.grotesk(700), n >= word.length ? '#3a6ee8' : '#b6c6ee', { align: 'right' });
  });
}

/** A gem: a faceted diamond in blue. */
export function gem(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number) {
  x.save(); x.translate(cx, cy + Math.sin(t * 2) * 8); x.rotate(Math.sin(t * 1.3) * 0.08);
  const pts: [number, number][] = [[0, -r], [r * 0.62, -r * 0.35], [r * 0.4, r], [-r * 0.4, r], [-r * 0.62, -r * 0.35]];
  x.shadowColor = 'rgba(60,120,255,0.6)'; x.shadowBlur = 40;
  x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fillStyle = '#3d8bff'; x.fill();
  x.shadowBlur = 0;
  x.beginPath(); x.moveTo(0, -r); x.lineTo(r * 0.62, -r * 0.35); x.lineTo(0, 0); x.closePath(); x.fillStyle = '#9cc8ff'; x.fill();
  x.beginPath(); x.moveTo(0, -r); x.lineTo(-r * 0.62, -r * 0.35); x.lineTo(0, 0); x.closePath(); x.fillStyle = '#6aa8ff'; x.fill();
  x.beginPath(); x.moveTo(-r * 0.62, -r * 0.35); x.lineTo(0, 0); x.lineTo(-r * 0.4, r); x.closePath(); x.fillStyle = '#1f5fd8'; x.fill();
  x.beginPath(); x.moveTo(r * 0.62, -r * 0.35); x.lineTo(0, 0); x.lineTo(r * 0.4, r); x.closePath(); x.fillStyle = '#2d74f0'; x.fill();
  x.restore();
}

/** An "AI-made" website card: purple gradient, a headline with a sparkle, a MADE WITH AI badge, boxes in boxes. */
export function aiSite(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, t: number, o: { badge?: boolean; seed?: number } = {}) {
  const g = x.createLinearGradient(x0, y0, x0 + w, y0 + h);
  g.addColorStop(0, '#5b2bd9'); g.addColorStop(0.55, '#8b3bff'); g.addColorStop(1, '#ff6ad5');
  rr(x, x0, y0, w, h, w * 0.03); x.fillStyle = g; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.9)';
  [0, 1, 2].forEach((i) => { x.beginPath(); x.arc(x0 + w * (0.04 + i * 0.03), y0 + h * 0.06, w * 0.008, 0, TAU); x.fill(); });
  txt(x, 'Costruisci', x0 + w * 0.08, y0 + h * 0.3, h * 0.11, F.grotesk(700), '#ffffff');
  txt(x, 'il futuro', x0 + w * 0.08, y0 + h * 0.43, h * 0.11, F.grotesk(700), '#ffffff');
  const kx = x0 + w * 0.08 + measure('il futuro', F.grotesk(700), h * 0.11) + h * 0.07, ky = y0 + h * 0.39, kr = h * 0.045; // a sparkle
  x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, k = i % 2 ? kr * 0.3 : kr; x.lineTo(kx + Math.cos(a) * k, ky + Math.sin(a) * k); } x.closePath(); x.fillStyle = '#ffffff'; x.fill();
  // the sparkle burst on the right
  const sx = x0 + w * 0.78, sy = y0 + h * 0.36, sr = h * 0.17;
  x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fillStyle = '#fff4ec'; x.fill();
  x.strokeStyle = '#ff6a3d'; x.lineWidth = Math.max(2, w * 0.006);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + t * 0.6; x.beginPath(); x.moveTo(sx + Math.cos(a) * sr * 0.2, sy + Math.sin(a) * sr * 0.2); x.lineTo(sx + Math.cos(a) * sr * 0.8, sy + Math.sin(a) * sr * 0.8); x.stroke(); }
  // boxes inside boxes
  for (let i = 0; i < 3; i++) {
    const bx = x0 + w * (0.08 + i * 0.29), by = y0 + h * 0.62, bw = w * 0.25, bh = h * 0.28;
    rr(x, bx, by, bw, bh, w * 0.02); x.fillStyle = 'rgba(255,255,255,0.16)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 2; x.stroke();
    rr(x, bx + bw * 0.15, by + bh * 0.2, bw * 0.7, bh * 0.6, w * 0.015); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fill();
    rr(x, bx + bw * 0.32, by + bh * 0.36, bw * 0.36, bh * 0.28, w * 0.01); x.fillStyle = 'rgba(255,255,255,0.3)'; x.fill();
  }
  if (o.badge) {
    x.save(); x.translate(x0 + w * 0.17, y0 + h * 0.13); x.rotate(-0.08);
    rr(x, -w * 0.12, -h * 0.06, w * 0.24, h * 0.12, 6); x.fillStyle = '#ffe9e0'; x.fill();
    txt(x, 'MADE WITH AI', 0, h * 0.022, h * 0.05, F.archivo(100, 900), '#e0452c', { align: 'center' });
    x.restore();
  }
}

/** A designed page: cream, a serif headline, real spacing, a terracotta button, a palette. */
export function goodSite(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  rr(x, x0, y0, w, h, w * 0.02); x.fillStyle = '#f6f0e4'; x.fill();
  x.fillStyle = '#2b2a26';
  txt(x, 'Fatto', x0 + w * 0.09, y0 + h * 0.3, h * 0.14, F.serif(600), '#22211d');
  txt(x, 'con cura.', x0 + w * 0.09, y0 + h * 0.45, h * 0.14, F.serif(600, true), '#c4633a');
  x.fillStyle = '#7a756b'; x.fillRect(x0 + w * 0.09, y0 + h * 0.53, w * 0.42, h * 0.018); x.fillRect(x0 + w * 0.09, y0 + h * 0.58, w * 0.34, h * 0.018);
  rr(x, x0 + w * 0.09, y0 + h * 0.68, w * 0.26, h * 0.1, h * 0.05); x.fillStyle = '#c4633a'; x.fill();
  txt(x, 'Inizia', x0 + w * 0.22, y0 + h * 0.745, h * 0.05, F.grotesk(700), '#fbf3e1', { align: 'center' });
  ['#20463a', '#c4633a', '#e3b04b', '#2b2a26'].forEach((c, i) => { rr(x, x0 + w * (0.62 + i * 0.075), y0 + h * 0.3, w * 0.06, w * 0.06, 6); x.fillStyle = c; x.fill(); });
  rr(x, x0 + w * 0.6, y0 + h * 0.48, w * 0.32, h * 0.32, 10); x.fillStyle = '#20463a'; x.fill();
  txt(x, 'Aa', x0 + w * 0.76, y0 + h * 0.7, h * 0.14, F.serif(600), '#f6f0e4', { align: 'center' });
}
