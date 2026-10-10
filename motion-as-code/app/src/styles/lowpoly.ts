// 19 · Low poly: everything is triangles in flat colour. A dawn sky and a mountain range, triangulated, each
// face shaded by its slope towards the light; the faces flip in from the bottom, then breathe.
import { type Style, F, txt, ease, clamp, lerp, hash, noise1 } from './style';

const SKY0 = [43, 30, 84], SKY1 = [255, 138, 128], M0 = [44, 62, 110], M1 = [120, 160, 190], SNOW = [236, 240, 250], SUN = '#ffd27a';

interface Tri { p: [number, number][]; c: number[]; d: number }
const cache = new Map<string, Tri[]>();

/** Mountain height (0..1 up from the bottom) at u (0..1 across). */
const ridge = (u: number) => 0.32 + 0.22 * Math.max(0, 1 - Math.abs(u - 0.38) * 3.2) + 0.16 * Math.max(0, 1 - Math.abs(u - 0.78) * 4) + 0.04 * Math.sin(u * 23);

/** The triangulated scene for a w x h box, built once. */
function mesh(w: number, h: number): Tri[] {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cols = 11, rows = 12;
  const P: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    P.push([]);
    for (let i = 0; i <= cols; i++) {
      const jx = i > 0 && i < cols ? (hash(i, j, 1) - 0.5) * 0.7 : 0, jy = j > 0 && j < rows ? (hash(i, j, 2) - 0.5) * 0.7 : 0;
      P[j]!.push([((i + jx) / cols) * w, ((j + jy) / rows) * h]);
    }
  }
  const tris: Tri[] = [];
  const light = [-0.5, -0.8];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = P[j]![i]!, b = P[j]![i + 1]!, c = P[j + 1]![i]!, d = P[j + 1]![i + 1]!;
    const flip = hash(i, j, 3) > 0.5;
    for (const p of flip ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]]) {
      const cx = (p[0]![0] + p[1]![0] + p[2]![0]) / 3, cy = (p[0]![1] + p[1]![1] + p[2]![1]) / 3;
      const u = cx / w, v = 1 - cy / h, top = ridge(u);
      let col: number[];
      if (v > top) { // sky: dawn gradient
        const k = clamp((v - top) / (1 - top));
        col = SKY1.map((s, n) => lerp(s, SKY0[n]!, k ** 0.8));
      } else { // mountain: facets lit by their slope, snow near the top
        const slope = ridge(u + 0.01) - ridge(u - 0.01);
        const lit = clamp(0.55 + (slope * light[0]! * -12) + (hash(i, j, 4) - 0.5) * 0.25);
        col = M0.map((s, n) => lerp(s, M1[n]!, lit));
        if (v > top - 0.05) col = col.map((s, n) => lerp(s, SNOW[n]!, 0.75));
      }
      tris.push({ p: p as [number, number][], c: col, d: (1 - cy / h) + hash(i, j, 5) * 0.15 });
    }
  }
  cache.set(key, tris);
  return tris;
}

export const lowpoly: Style = {
  n: 19, id: 'lowpoly', name: 'Low poly',
  what: 'Solo triangoli a colore piatto, ombreggiati faccia per faccia.',
  recipe: 'Scena costruita da una mesh di triangoli (griglia di punti con jitter, triangolata), ogni faccia di un colore piatto calcolato dalla sua pendenza rispetto a una luce fissa; palette di alba (viola, corallo) e montagne blu con neve; le facce entrano ribaltandosi dal basso verso l’alto con un ritardo sfalsato, poi i vertici respirano piano.',
  palette: { bg: 'rgb(43,30,84)', ink: '#ffffff', accents: [SUN, 'rgb(120,160,190)', 'rgb(255,138,128)'] },
  fonts: { title: F.archivo(112, 900), text: F.archivo(100, 500) },
  motion: { ease: ease.outCubic, steps: 0 },
  post: { bloom: 0.15, halation: 0, ca: 0, grain: 0.02, vignette: 0.15 },

  ground(x, t, w, h) { this.tile(x, t + 5, w, h); },

  title(x, t, s, cx, cy, size) {
    const k = ease.outCubic(clamp(t / 0.6));
    txt(x, s, cx, cy + size * 0.35 + (1 - k) * size * 0.5, size, F.archivo(112, 900), '#ffffff', { align: 'center', alpha: k, stroke: 'rgba(43,30,84,0.35)', lw: size * 0.08 });
  },

  tile(x, t, w, h) {
    const tris = mesh(w, h);
    x.fillStyle = 'rgb(43,30,84)'; x.fillRect(0, 0, w, h);
    // the sun, a faceted disc, behind the range
    const sx = w * 0.62, sy = h * 0.4, sr = w * 0.09;
    x.fillStyle = SUN; x.beginPath();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; x.lineTo(sx + Math.cos(a) * sr, sy + Math.sin(a) * sr); }
    x.closePath(); x.fill();
    for (const tr of tris) {
      const k = ease.outCubic(clamp((t - tr.d * 0.9) / 0.35));
      if (k <= 0) continue;
      const cx = (tr.p[0]![0] + tr.p[1]![0] + tr.p[2]![0]) / 3, cy = (tr.p[0]![1] + tr.p[1]![1] + tr.p[2]![1]) / 3;
      const breathe = 0.02 * noise1(t * 0.7 + cx * 0.01, 3);
      x.beginPath();
      tr.p.forEach(([px, py], n) => {
        const X = cx + (px - cx) * k, Y = cy + (py - cy) * k * (1 + breathe);
        if (n) x.lineTo(X, Y); else x.moveTo(X, Y);
      });
      x.closePath();
      const sky = cy < h * (1 - ridge(cx / w)) - 4;
      x.globalAlpha = sky ? 0.92 : 1;
      x.fillStyle = `rgb(${tr.c.map((v) => Math.round(v)).join(',')})`;
      x.fill();
      x.lineWidth = 1; x.strokeStyle = x.fillStyle; x.stroke(); // close the hairline gaps
    }
    x.globalAlpha = 1;
    this.title(x, t - 0.9, 'LOW POLY', w * 0.5, h * 0.18, h * 0.12);
  },
};
