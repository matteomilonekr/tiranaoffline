// 12 · Particles: a thousand glowing points swirl in a vortex, then fly to their places and become the word;
// they shimmer while it holds. Additive light on near-black.
import { type Style, F, textPoints, ease, clamp, lerp, hash, noise1, TAU } from './style';

const BG = '#04050d', C0 = [70, 230, 255], C1 = [150, 90, 255], C2 = [255, 80, 200];
const N = 1100;

function col(u: number, a: number) {
  const lo = u < 0.5 ? C0 : C1, hi = u < 0.5 ? C1 : C2, k = u < 0.5 ? u * 2 : (u - 0.5) * 2;
  const c = [0, 1, 2].map((i) => Math.round(lerp(lo[i]!, hi[i]!, k)));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** The particles forming `s` around (cx, cy): swirl until `form`, fly in over ~0.9 s, then hold and shimmer. */
function swarm(x: CanvasRenderingContext2D, t: number, s: string, cx: number, cy: number, size: number, form = 0.7) {
  const pts = textPoints(s, F.archivo(100, 900), size, Math.max(3, Math.round(size / 26)));
  if (!pts.length) return;
  x.save();
  x.globalCompositeOperation = 'lighter';
  const span = size * 3.2;
  for (let i = 0; i < N; i++) {
    const [tx, ty] = pts[Math.floor((i * pts.length) / N) % pts.length]!; // spread over the whole word
    // where it swirls: an orbit around the centre, its radius breathing
    const r0 = span * (0.25 + 0.5 * hash(i, 1)), a0 = hash(i, 2) * TAU + t * (0.8 + 0.6 * hash(i, 3)) * (i % 2 ? 1 : -1);
    const sx = cx + Math.cos(a0) * r0 * 1.1, sy = cy + Math.sin(a0) * r0 * 0.55 + noise1(t * 0.8 + i, 4) * 12;
    const delay = hash(i, 5) * 0.35;
    const k = ease.inOutCubic(clamp((t - form - delay) / 0.9));
    const shimmer = k >= 1 ? Math.sin(t * 6 + i) * 1.2 : 0;
    const px = lerp(sx, cx + tx, k) + shimmer, py = lerp(sy, cy + ty, k) + Math.cos(t * 5 + i) * (k >= 1 ? 1 : 0);
    const u = clamp((px - (cx - span / 2)) / span);
    const r = 1.4 + 1.6 * hash(i, 6);
    x.fillStyle = col(u, 0.85);
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    if (i % 9 === 0) { x.fillStyle = col(u, 0.12); x.beginPath(); x.arc(px, py, r * 5, 0, TAU); x.fill(); }
  }
  x.restore();
}

export const particles: Style = {
  n: 12, id: 'particles', name: 'Particles',
  what: 'Migliaia di punti di luce che vorticano e poi compongono una forma.',
  recipe: 'Fondo quasi nero; un migliaio di particelle luminose in additivo, colorate da ciano a viola a rosa lungo la x; prima vorticano attorno al centro, poi ognuna vola al suo posto (punti campionati dal testo o da una forma) con ritardi sfalsati ed easing in-out, e quando la forma è composta continuano a tremolare; un po’ di bloom.',
  palette: { bg: BG, ink: '#e8f6ff', accents: ['#46e6ff', '#965aff', '#ff50c8'] },
  fonts: { title: F.archivo(100, 900), text: F.mono(500) },
  motion: { ease: ease.inOutCubic, steps: 0 },
  post: { bloom: 0.8, bloomThreshold: 0.6, halation: 0, ca: 0.4, grain: 0.03, vignette: 0.3 },

  ground(x, _t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    g.addColorStop(0, 'rgba(60,40,140,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  },

  title(x, t, s, cx, cy, size) { swarm(x, t, s, cx, cy, size, 0.2); },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    swarm(x, t, 'PARTICLES', w / 2, h * 0.5, Math.min(h * 0.17, w * 0.15), 0.45);
  },
};
