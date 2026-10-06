// 20 · Line art: one black line on white, never lifted. It draws a plant in its pot in a single stroke, then
// the title is written in a single-stroke script, the pen still moving.
import { strokeText, drawStrokeText, type StrokeText } from '../engine/stroke';
import { type Style, F, txt, ease, clamp, lerp, TAU } from './style';

const PAPER = '#fbfaf6', INK = '#141414', ACCENT = '#e8572a';

type Pt = [number, number];
const cache = new Map<string, { pts: Pt[]; L: number[] }>();

/** The plant as one continuous polyline (pot, stem, leaves as loops, a spiral bloom), built once per box. */
function plant(w: number, h: number) {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pts: Pt[] = [];
  const cx = w * 0.5, base = h * 0.78, pw = w * 0.13;
  const seg = (a: Pt, b: Pt, n = 12) => { for (let i = 1; i <= n; i++) pts.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]); };
  const curve = (p0: Pt, c: Pt, p1: Pt, n = 24) => { for (let i = 1; i <= n; i++) { const u = i / n; pts.push([(1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1]]); } };
  // the pot: in from the left along the table, round the pot, back to its rim
  pts.push([w * 0.12, base + h * 0.1]);
  seg([w * 0.12, base + h * 0.1], [cx - pw * 0.8, base + h * 0.1]);
  seg([cx - pw * 0.8, base + h * 0.1], [cx - pw, base - h * 0.08]);
  seg([cx - pw, base - h * 0.08], [cx + pw, base - h * 0.08]);
  seg([cx + pw, base - h * 0.08], [cx + pw * 0.8, base + h * 0.1]);
  seg([cx + pw * 0.8, base + h * 0.1], [cx, base + h * 0.1], 8);
  seg([cx, base + h * 0.1], [cx, base - h * 0.08], 8);
  // up the stem, a leaf loop on alternating sides
  let y = base - h * 0.08, x = cx;
  for (let k = 0; k < 4; k++) {
    const ny = y - h * 0.11, side = k % 2 ? 1 : -1, nx = cx + Math.sin(k * 1.3) * w * 0.02;
    curve([x, y], [x + side * w * 0.03, (y + ny) / 2], [nx, ny]);
    const tip: Pt = [nx + side * w * (0.16 - k * 0.02), ny - h * 0.05];
    curve([nx, ny], [nx + side * w * 0.06, ny - h * 0.1], tip, 18);
    curve(tip, [nx + side * w * 0.1, ny + h * 0.03], [nx, ny], 18);
    x = nx; y = ny;
  }
  // a spiral bloom at the top
  const fx = x, fy = y - h * 0.08;
  curve([x, y], [x, y - h * 0.04], [fx, fy]);
  for (let i = 1; i <= 90; i++) { const u = i / 90, a = u * TAU * 2.6 - Math.PI / 2, r = u * w * 0.07; pts.push([fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.9]); }
  // and off to the right, along the table
  const last = pts[pts.length - 1]!;
  curve(last, [w * 0.75, base], [w * 0.88, base + h * 0.1]);
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const out = { pts, L };
  cache.set(key, out);
  return out;
}

/** The first `len` px of a polyline; returns the pen's position. */
function drawUpTo(x: CanvasRenderingContext2D, pts: Pt[], L: number[], len: number): Pt {
  x.beginPath(); x.moveTo(pts[0]![0], pts[0]![1]);
  let head = pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    if (L[i]! <= len) { x.lineTo(pts[i]![0], pts[i]![1]); head = pts[i]!; continue; }
    const u = (len - L[i - 1]!) / Math.max(1e-6, L[i]! - L[i - 1]!);
    head = [lerp(pts[i - 1]![0], pts[i]![0], u), lerp(pts[i - 1]![1], pts[i]![1], u)];
    x.lineTo(head[0], head[1]);
    break;
  }
  x.stroke();
  return head;
}

let written: (StrokeText & { s: string; size: number }) | null = null;

function script(x: CanvasRenderingContext2D, t: number, s: string, cx: number, cy: number, size: number, dur = 1.0) {
  if (!written || written.s !== s || written.size !== size) written = Object.assign(strokeText(s, 'script', size), { s, size });
  const st = written;
  x.save();
  x.translate(cx - st.width / 2, cy + st.capHeight * 0.35);
  x.lineWidth = Math.max(2.5, size * 0.035); x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round';
  drawStrokeText(x, st, st.total * ease.inOutCubic(clamp(t / dur)));
  x.restore();
}

export const lineart: Style = {
  n: 20, id: 'lineart', name: 'Line art',
  what: 'Una sola linea nera su bianco, che non si stacca mai dal foglio.',
  recipe: 'Fondo bianco carta, un unico tratto nero di spessore costante che disegna tutto senza staccarsi (contorni, foglie ad anello, una spirale), rivelato progressivamente lungo la sua lunghezza con una punta che lo traccia; titolo in corsivo a tratto singolo scritto dopo il disegno; un solo accento di colore al massimo.',
  palette: { bg: PAPER, ink: INK, accents: [ACCENT] },
  fonts: { title: F.serif(400, true), text: F.mono(400) },
  motion: { ease: ease.inOutCubic, steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.02, vignette: 0.05 },

  ground(x, _t, w, h) { x.fillStyle = PAPER; x.fillRect(0, 0, w, h); },

  title(x, t, s, cx, cy, size) { script(x, t, s, cx, cy, size); },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const { pts, L } = plant(w, h);
    x.lineWidth = Math.max(3, w * 0.005); x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round';
    const k = ease.inOutCubic(clamp(t / 1.7));
    const head = drawUpTo(x, pts, L, L[L.length - 1]! * k);
    if (k < 1) { x.fillStyle = ACCENT; x.beginPath(); x.arc(head[0], head[1], Math.max(5, w * 0.008), 0, TAU); x.fill(); }
    script(x, t - 1.1, 'line art', w * 0.5, h * 0.13, h * 0.15, 0.9);
    txt(x, '1 linea · 0 stacchi', w * 0.5, h * 0.96, h * 0.03, F.mono(400), INK, { align: 'center', alpha: clamp((t - 1.8) / 0.4) });
  },
};
