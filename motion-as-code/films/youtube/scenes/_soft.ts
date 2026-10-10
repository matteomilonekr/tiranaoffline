// The look of films/youtube, after @ai.nxtlvl's reel on the YouTube Agent Skill: a warm cream page with a faint
// grid and soft pastel glows; dark command pills over big two-tone titles (a bold sans and a coral serif italic);
// white cards with soft shadows; a coral chapter with rays; a dark, starry chapter for "virality"; captions
// whose spoken word sits in a coral pill. The icons are drawn here (a coral spark for Claude, a play tile for
// the channel), not the brands' logos. Canvas2D, pure in t.
import { W, H } from '@kit/engine/gl';
import { F, font } from '@kit/engine/type';
import type { Lyrics, Word } from '@kit/engine/lyrics';
import { clamp, ease, hash, lerp, noise1 } from '@kit/engine/util';

export { W, H, F, font, clamp, ease, hash, lerp, noise1 };
export const TAU = Math.PI * 2;
export const CREAM = '#f0eee8', INK = '#1c1a18', CORAL = '#d9705a', CORAL_L = '#f2b6a0', MUTED = '#8f8a84', DARK = '#141210', GREEN = '#3fbf6f', RED = '#e8443a';

// ------------------------------------------------------------------ helpers
export const k = (t: number, t0: number, d = 0.3) => clamp((t - t0) / d);
export const pop = (t: number, t0: number, d = 0.34, s = 1.8) => (t < t0 ? 0 : ease.outBack(clamp((t - t0) / d), s));
export function rr(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(x0, y0, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}
export function txt(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, color: string,
  o: { align?: CanvasTextAlign; alpha?: number; track?: number } = {}) {
  x.save(); x.globalAlpha *= o.alpha ?? 1; x.font = font(fam, size); x.textAlign = o.align ?? 'left'; x.fillStyle = color;
  if (o.track) x.letterSpacing = `${o.track}px`;
  x.fillText(s, px, py); x.restore();
}
export function tw(x: CanvasRenderingContext2D, s: string, size: number, fam: string) {
  x.save(); x.font = font(fam, size); const v = x.measureText(s).width; x.restore(); return v;
}
export function at(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number, fn: () => void) {
  if (s <= 0.002) return;
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s); x.translate(-cx, -cy); fn(); x.restore();
}
/** Comes in from a blur: alpha and blur from `t0` over `d`. */
export function blurIn(x: CanvasRenderingContext2D, t: number, t0: number, d: number, fn: () => void, rise = 30) {
  const u = k(t, t0, d);
  if (u <= 0) return;
  const e = ease.outCubic(u);
  x.save(); x.globalAlpha *= e; if (u < 1) x.filter = `blur(${((1 - e) * 10).toFixed(2)}px)`;
  x.translate(0, (1 - e) * rise); fn(); x.restore();
}
const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
export function wordAt(ly: Lyrics, q: string, after = 0): Word {
  const w = ly.words.find((w) => key(w.w) === key(q) && w.start >= after - 1e-6);
  if (!w) throw new Error(`word not found: ${q} after ${after}`);
  return w;
}
/** A white card with a soft shadow. */
export function card(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r = 26, fill = '#ffffff', shadow = 0.1) {
  x.save(); x.shadowColor = `rgba(60,40,30,${shadow})`; x.shadowBlur = 40; x.shadowOffsetY = 14;
  rr(x, x0, y0, w, h, r); x.fillStyle = fill; x.fill(); x.restore();
}
export function tick(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, col = '#ffffff', lw = 4) {
  x.save(); x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(cx - s * 0.5, cy); x.lineTo(cx - s * 0.12, cy + s * 0.38); x.lineTo(cx + s * 0.55, cy - s * 0.42); x.stroke(); x.restore();
}

// ------------------------------------------------------------------ backgrounds
/** The cream page: a faint grid, soft glows that drift, a few tiny outlined circles and plus marks. */
export function cream(x: CanvasRenderingContext2D, t: number, seed = 0) {
  x.fillStyle = CREAM; x.fillRect(0, 0, W, H);
  x.save(); x.filter = 'blur(60px)';
  const glows: [number, number, number, string][] = [[0.25, 0.32, 300, 'rgba(244,190,170,0.55)'], [0.78, 0.45, 280, 'rgba(198,200,240,0.55)'], [0.4, 0.78, 320, 'rgba(246,200,180,0.5)'], [0.85, 0.12, 220, 'rgba(250,215,200,0.6)']];
  glows.forEach(([gx, gy, r, c], i) => {
    const dx = 60 * noise1(t * 0.15, i + seed * 7), dy = 50 * noise1(t * 0.13, i + 20 + seed * 7);
    x.fillStyle = c; x.beginPath(); x.arc(gx * W + dx, gy * H + dy, r, 0, TAU); x.fill();
  });
  x.restore();
  x.strokeStyle = 'rgba(40,30,20,0.045)'; x.lineWidth = 1.5;
  x.beginPath(); for (let gx = 30; gx < W; gx += 66) { x.moveTo(gx, 0); x.lineTo(gx, H); } for (let gy = 20; gy < H; gy += 66) { x.moveTo(0, gy); x.lineTo(W, gy); } x.stroke();
  for (let i = 0; i < 9; i++) {
    const px = hash(i, 3 + seed) * W, py = ((hash(i, 4 + seed) * H) - t * 8 * (0.5 + hash(i, 5))) % H + (t * 8 > 0 ? 0 : 0);
    const yy = py < 0 ? py + H : py;
    x.strokeStyle = 'rgba(217,112,90,0.35)'; x.lineWidth = 2;
    if (i % 2) { x.beginPath(); x.arc(px, yy, 7, 0, TAU); x.stroke(); }
    else { x.beginPath(); x.moveTo(px - 8, yy); x.lineTo(px + 8, yy); x.moveTo(px, yy - 8); x.lineTo(px, yy + 8); x.stroke(); }
  }
}
/** The coral chapter: a warm field, light rays from the centre, a dot grid. */
export function coral(x: CanvasRenderingContext2D, t: number, cy = H * 0.42, spin = 0) {
  const g = x.createRadialGradient(W / 2, cy, 50, W / 2, cy, H * 0.8);
  g.addColorStop(0, '#e28a70'); g.addColorStop(1, '#cf6248');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = 0.18; x.fillStyle = '#ffffff';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU + t * 0.05 + spin, w = 0.035 + 0.03 * hash(i, 2), r0 = 160 + 120 * hash(i, 3), r1 = 900 + 400 * hash(i, 4);
    x.beginPath(); x.moveTo(W / 2 + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0); x.lineTo(W / 2 + Math.cos(a - w * 0.6) * r1, cy + Math.sin(a - w * 0.6) * r1);
    x.lineTo(W / 2 + Math.cos(a + w * 0.6) * r1, cy + Math.sin(a + w * 0.6) * r1); x.lineTo(W / 2 + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0); x.closePath(); x.fill();
  }
  x.restore();
  x.fillStyle = 'rgba(255,255,255,0.12)';
  for (let gx = 20; gx < W; gx += 36) for (let gy = 20; gy < H; gy += 36) x.fillRect(gx, gy, 2.5, 2.5);
}
/** The dark chapter: near black, a faint grid, maroon and plum glows, drifting embers. */
export function dark(x: CanvasRenderingContext2D, t: number) {
  x.fillStyle = DARK; x.fillRect(0, 0, W, H);
  x.save(); x.filter = 'blur(80px)';
  x.fillStyle = 'rgba(120,55,40,0.55)'; x.beginPath(); x.arc(W * 0.55 + 40 * noise1(t * 0.2, 1), H * 0.48, 360, 0, TAU); x.fill();
  x.fillStyle = 'rgba(90,40,90,0.45)'; x.beginPath(); x.arc(W * 0.3, H * 0.6 + 40 * noise1(t * 0.2, 2), 300, 0, TAU); x.fill();
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,0.035)'; x.lineWidth = 1.5;
  x.beginPath(); for (let gx = 30; gx < W; gx += 66) { x.moveTo(gx, 0); x.lineTo(gx, H); } for (let gy = 20; gy < H; gy += 66) { x.moveTo(0, gy); x.lineTo(W, gy); } x.stroke();
  for (let i = 0; i < 40; i++) {
    const px = (hash(i, 7) * W + t * 6 * (hash(i, 8) - 0.5)) % W, py = (hash(i, 9) * H - t * 14 * hash(i, 10) + H) % H;
    x.fillStyle = `rgba(255,${150 + Math.round(60 * hash(i, 11))},110,${0.25 + 0.5 * hash(i, 12) * (0.6 + 0.4 * Math.sin(t * 2 + i))})`;
    x.beginPath(); x.arc(px, py, 1.5 + 2.5 * hash(i, 13), 0, TAU); x.fill();
  }
}

// ------------------------------------------------------------------ type
/** A dark command pill, e.g. "/yt-script". */
export function cmdPill(x: CanvasRenderingContext2D, t: number, t0: number, s: string, cy = 300, cx = W / 2) {
  const e = pop(t, t0, 0.3, 1.6);
  if (e <= 0) return;
  const w = tw(x, s, 34, F.mono(600)) + 56;
  at(x, cx, cy, e, 0, () => { rr(x, cx - w / 2, cy - 34, w, 68, 34); x.fillStyle = '#1e1c1a'; x.fill(); txt(x, s, cx, cy + 12, 34, F.mono(600), CORAL_L, { align: 'center' }); });
}
/** A two-tone title: `a` in the bold sans, `b` in the coral serif italic; each word comes in from a blur. */
export function title2(x: CanvasRenderingContext2D, t: number, t0: number, a: string, b: string, cy = 420, size = 76, col = INK) {
  const fa = F.poppins(700), fb = F.instrument(true), sb = size * 1.12;
  const wa = tw(x, a + ' ', size, fa), wb = tw(x, b, sb, fb), x0 = W / 2 - (wa + wb) / 2;
  blurIn(x, t, t0, 0.3, () => txt(x, a, x0, cy, size, fa, col), 0);
  blurIn(x, t, t0 + 0.15, 0.35, () => txt(x, b, x0 + wa, cy, sb, fb, CORAL), 0);
}

// ------------------------------------------------------------------ icons (drawn here)
/** Claude's stand-in: a white tile with a coral four-point spark. */
export function sparkTile(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  card(x, cx - s / 2, cy - s / 2, s, s, s * 0.24, '#ffffff', 0.12);
  spark(x, cx, cy, s * 0.3, CORAL);
}
export function spark(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, col = CORAL) {
  const k2 = r * 0.16;
  x.beginPath(); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx + k2, cy - k2, cx + r, cy); x.quadraticCurveTo(cx + k2, cy + k2, cx, cy + r);
  x.quadraticCurveTo(cx - k2, cy + k2, cx - r, cy); x.quadraticCurveTo(cx - k2, cy - k2, cx, cy - r); x.closePath(); x.fillStyle = col; x.fill();
}
/** The channel's stand-in: a white tile with a dark rounded screen and a coral play triangle. */
export function playTile(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  card(x, cx - s / 2, cy - s / 2, s, s, s * 0.24, '#ffffff', 0.12);
  rr(x, cx - s * 0.3, cy - s * 0.21, s * 0.6, s * 0.42, s * 0.1); x.fillStyle = '#26221f'; x.fill();
  x.beginPath(); x.moveTo(cx - s * 0.07, cy - s * 0.11); x.lineTo(cx + s * 0.12, cy); x.lineTo(cx - s * 0.07, cy + s * 0.11); x.closePath(); x.fillStyle = CORAL; x.fill();
}

// ------------------------------------------------------------------ captions
export type Said = { w: string; start: number; end: number };
export function chunks(ws: Said[], max = 18): Said[][] {
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
/** The caption at the bottom: said words in ink (or white on a dark/coral chapter), the word being said in a
 *  coral pill, the words to come faded. */
export function caption(x: CanvasRenderingContext2D, t: number, all: Said[][], mode: 'cream' | 'coral' | 'dark', cy = 1650) {
  let c: Said[] | undefined;
  for (const ch of all) if (t >= ch[0]!.start - 0.06) c = ch;
  if (!c) return;
  if (t > c[c.length - 1]!.end + 0.7) return;
  const size = 58, fam = F.poppins(600);
  const words = c.map((w) => w.w.replace(/[;:]+$/u, ''));
  const ws = words.map((s) => tw(x, s, size, fam)), sp = tw(x, ' ', size, fam) + 6;
  const total = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
  let px = W / 2 - total / 2;
  const said = mode === 'cream' ? INK : '#ffffff', faded = mode === 'cream' ? 'rgba(28,26,24,0.28)' : 'rgba(255,255,255,0.35)';
  words.forEach((s, i) => {
    const w = c![i]!, now = t >= w.start - 0.04 && t < w.end + 0.06, done = t >= w.end + 0.06;
    if (now) {
      const e = ease.outBack(k(t, w.start - 0.04, 0.16), 2);
      at(x, px + ws[i]! / 2, cy - size * 0.32, 0.9 + 0.1 * e, 0, () => {
        rr(x, px - 14, cy - size * 0.95, ws[i]! + 28, size * 1.3, 14); x.fillStyle = mode === 'coral' ? '#1e1c1a' : CORAL; x.fill();
        txt(x, s, px, cy, size, fam, '#ffffff');
      });
    } else txt(x, s, px, cy, size, fam, done ? said : faded);
    px += ws[i]! + sp;
  });
}
