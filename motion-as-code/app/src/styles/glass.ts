// 6 · Glassmorphism: frosted-glass panels floating over bright, moving colour. The panel blurs what is behind
// it, a white hairline and a sheen on top; slow, floaty motion.
import { type Style, F, txt, rr, inn, ease, clamp, lerp, TAU } from './style';

const BG0 = '#1b1646', BG1 = '#4b2a8f', WHITE = '#ffffff';
const BLOBS: [string, number, number, number, number][] = [
  // colour, x, y (0..1), radius (of w), speed
  ['#ff4fa3', 0.25, 0.3, 0.42, 0.5],
  ['#2fd5ff', 0.8, 0.35, 0.38, 0.4],
  ['#ffb02e', 0.55, 0.85, 0.4, 0.6],
  ['#7c5cff', 0.15, 0.85, 0.3, 0.45],
];

function blobs(x: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const g0 = x.createLinearGradient(0, 0, w, h);
  g0.addColorStop(0, BG0); g0.addColorStop(1, BG1);
  x.fillStyle = g0; x.fillRect(0, 0, w, h);
  for (const [c, bx, by, br, sp] of BLOBS) {
    const cx = (bx + 0.08 * Math.sin(t * sp + bx * 9)) * w, cy = (by + 0.07 * Math.cos(t * sp * 0.8 + by * 7)) * h, r = br * w;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, c); g.addColorStop(1, c + '00');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  }
}

/** A frosted panel: what is behind it, blurred, then a white veil, a hairline and a sheen. */
function panel(x: CanvasRenderingContext2D, t: number, w: number, h: number, px: number, py: number, pw: number, ph: number, r: number, rot: number, a = 1) {
  x.save();
  x.globalAlpha *= a;
  x.translate(px + pw / 2, py + ph / 2); x.rotate(rot); x.translate(-(px + pw / 2), -(py + ph / 2));
  // its soft shadow
  x.save(); x.filter = 'blur(24px)'; rr(x, px + 10, py + 24, pw, ph, r); x.fillStyle = 'rgba(10,5,40,0.35)'; x.fill(); x.restore();
  x.save(); rr(x, px, py, pw, ph, r); x.clip();
  x.filter = 'blur(26px)';
  // what is behind, in the tile's own (unrotated) frame
  x.save(); x.translate(px + pw / 2, py + ph / 2); x.rotate(-rot); x.translate(-(px + pw / 2), -(py + ph / 2)); blobs(x, t, w, h); x.restore();
  x.filter = 'none';
  x.fillStyle = 'rgba(255,255,255,0.16)'; x.fillRect(px - 50, py - 50, pw + 100, ph + 100);
  const g = x.createLinearGradient(px, py, px + pw * 0.6, py + ph);
  g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(0.45, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(px, py, pw, ph);
  x.restore();
  rr(x, px, py, pw, ph, r); x.lineWidth = 1.6; x.strokeStyle = 'rgba(255,255,255,0.55)'; x.stroke();
  x.restore();
}

export const glass: Style = {
  n: 6, id: 'glass', name: 'Glassmorphism',
  what: 'Pannelli di vetro smerigliato che sfocano i colori vivaci che passano dietro.',
  recipe: 'Sfondo con macchie di colore saturo (rosa, ciano, arancio, viola) che si muovono piano; pannelli semitrasparenti con sfocatura dello sfondo (backdrop blur 20-30 px), velo bianco al 15%, bordo bianco sottile e riflesso in alto; movimenti lenti e fluttuanti, angoli molto arrotondati.',
  palette: { bg: BG0, ink: WHITE, accents: BLOBS.map((b) => b[0]) },
  fonts: { title: F.grotesk(700), text: F.grotesk(400) },
  motion: { ease: ease.inOutCubic, steps: 0 },
  post: { bloom: 0.25, bloomThreshold: 0.9, halation: 0, ca: 0, grain: 0.02, vignette: 0.15 },

  ground(x, t, w, h) { blobs(x, t, w, h); },

  title(x, t, s, cx, cy, size) {
    const k = inn(t, 0, 0.7, ease.inOutCubic);
    txt(x, s, cx, cy + size * 0.35 + (1 - k) * size * 0.4, size, F.grotesk(700), WHITE, { align: 'center', alpha: k });
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const f = (k: number) => Math.sin(t * 1.1 + k) * h * 0.012;
    // a small card behind, tilted, floating
    const k2 = inn(t, 0.25, 0.8, ease.inOutCubic);
    panel(x, t, w, h, w * 0.5, h * 0.12 + f(1) + (1 - k2) * 60, w * 0.4, h * 0.26, 26, 0.1, k2);
    // the main card rises into place
    const k1 = inn(t, 0.0, 0.8, ease.inOutCubic);
    const px = w * 0.12, py = h * 0.36 + f(0) + (1 - k1) * 80, pw = w * 0.76, ph = h * 0.44;
    panel(x, t, w, h, px, py, pw, ph, 32, -0.03, k1);
    x.save();
    x.translate(px + pw / 2, py + ph / 2); x.rotate(-0.03); x.translate(-(px + pw / 2), -(py + ph / 2));
    x.globalAlpha *= k1;
    txt(x, 'Glass', px + pw * 0.08, py + ph * 0.38, ph * 0.26, F.grotesk(700), WHITE);
    txt(x, 'morphism', px + pw * 0.08, py + ph * 0.58, ph * 0.13, F.grotesk(400), 'rgba(255,255,255,0.85)');
    // a toggle that switches on
    const on = clamp((t - 0.9) / 0.35), knob = ease.inOutCubic(on);
    const tx = px + pw * 0.08, ty = py + ph * 0.72, tw = ph * 0.34, th = ph * 0.17;
    rr(x, tx, ty, tw, th, th / 2); x.fillStyle = `rgba(${lerp(255, 47, on)},${lerp(255, 213, on)},255,${lerp(0.25, 0.8, on)})`; x.fill();
    x.beginPath(); x.arc(tx + th / 2 + knob * (tw - th), ty + th / 2, th * 0.4, 0, TAU); x.fillStyle = WHITE; x.fill();
    // three glassy dots
    for (let i = 0; i < 3; i++) {
      x.beginPath(); x.arc(px + pw * (0.66 + i * 0.09), py + ph * 0.8, ph * 0.045, 0, TAU);
      x.fillStyle = `rgba(255,255,255,${0.35 + 0.2 * Math.sin(t * 3 + i)})`; x.fill();
    }
    x.restore();
  },
};
