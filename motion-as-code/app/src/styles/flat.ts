// 4 · Flat 2D: shapes in flat colour, no outlines, no gradients, no shadows. A little landscape assembles
// itself: hills slide up, the sun rises, a tree pops, clouds drift, birds cross.
import { type Style, F, txt, rr, inn, pop, ease, measure, TAU } from './style';

const SKY = '#8ed6f6', SUN = '#ffcc3a', RAYS = '#ffe48a', HILL1 = '#63c784', HILL2 = '#3aa865', TRUNK = '#8a5a3b', LEAF = '#2f8f58', CORAL = '#ff6b6b', WHITE = '#ffffff', INK = '#21324a';

function cloud(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.fillStyle = WHITE;
  x.beginPath(); x.arc(cx - s * 0.6, cy, s * 0.5, 0, TAU); x.arc(cx, cy - s * 0.3, s * 0.7, 0, TAU); x.arc(cx + s * 0.7, cy, s * 0.45, 0, TAU); x.fill();
  rr(x, cx - s * 1.1, cy - s * 0.05, s * 2.2, s * 0.55, s * 0.27); x.fill();
}

export const flat: Style = {
  n: 4, id: 'flat', name: 'Flat 2D',
  what: 'Forme piatte a tinta unita: niente contorni, niente sfumature, niente ombre.',
  recipe: 'Illustrazione con forme geometriche semplici a tinta piatta, palette di 5-6 colori, nessun contorno, nessun gradiente e nessuna ombra; movimenti morbidi (ease in-out), elementi che entrano scalando dalla base, profondità data solo dalla sovrapposizione dei piani.',
  palette: { bg: SKY, ink: INK, accents: [SUN, HILL2, CORAL] },
  fonts: { title: F.grotesk(700), text: F.grotesk(500) },
  motion: { ease: ease.inOutCubic, steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0, vignette: 0 },

  ground(x, _t, w, h) { x.fillStyle = SKY; x.fillRect(0, 0, w, h); },

  title(x, t, s, cx, cy, size) {
    const k = inn(t, 0, 0.5, ease.inOutCubic), fam = F.grotesk(700), tw = measure(s, fam, size);
    x.save(); x.globalAlpha *= k;
    rr(x, cx - tw / 2 - size * 0.4, cy - size * 0.62 + (1 - k) * 30, tw + size * 0.8, size * 1.24, size * 0.62); x.fillStyle = CORAL; x.fill();
    txt(x, s, cx, cy + size * 0.35 + (1 - k) * 30, size, fam, WHITE, { align: 'center' });
    x.restore();
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const e = ease.inOutCubic;
    // the sun rises, its rays turn
    const sy = h * (0.78 - 0.46 * inn(t, 0.1, 1.0, e)), sx = w * 0.7, sr = w * 0.11;
    x.fillStyle = RAYS;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 0.4;
      x.beginPath(); x.moveTo(sx + Math.cos(a - 0.12) * sr * 1.25, sy + Math.sin(a - 0.12) * sr * 1.25);
      x.lineTo(sx + Math.cos(a) * sr * 1.75, sy + Math.sin(a) * sr * 1.75); x.lineTo(sx + Math.cos(a + 0.12) * sr * 1.25, sy + Math.sin(a + 0.12) * sr * 1.25); x.fill();
    }
    x.fillStyle = SUN; x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fill();
    // clouds drift across
    for (let i = 0; i < 3; i++) {
      const cxw = ((i * 0.41 + t * (0.03 + i * 0.012)) % 1.3) - 0.15;
      cloud(x, cxw * w, h * (0.16 + i * 0.09), w * (0.06 + 0.02 * (i % 2)));
    }
    // two birds
    x.strokeStyle = INK; x.lineWidth = Math.max(3, w * 0.005); x.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const bx = ((t * 0.12 + i * 0.15) % 1.2) * w - w * 0.1, by = h * (0.3 + i * 0.05) + Math.sin(t * 3 + i) * 6, f = Math.sin(t * 10 + i * 2) * 8;
      x.beginPath(); x.moveTo(bx - 14, by - f); x.quadraticCurveTo(bx - 6, by - 6, bx, by); x.quadraticCurveTo(bx + 6, by - 6, bx + 14, by - f); x.stroke();
    }
    // hills slide up, back then front
    const h1 = inn(t, 0.0, 0.6, e), h2 = inn(t, 0.12, 0.6, e);
    x.fillStyle = HILL1; x.beginPath(); x.ellipse(w * 0.25, h * 0.92 + (1 - h1) * h * 0.5, w * 0.62, h * 0.32, 0, 0, TAU); x.fill();
    x.fillStyle = HILL2; x.beginPath(); x.ellipse(w * 0.85, h * 1.02 + (1 - h2) * h * 0.5, w * 0.7, h * 0.34, 0, 0, TAU); x.fill();
    // a tree pops up from its base
    const k = pop(t, 0.55, 0.45), tx = w * 0.28, ty = h * 0.7;
    if (k > 0) {
      x.save(); x.translate(tx, ty); x.scale(k, k);
      x.fillStyle = TRUNK; x.fillRect(-w * 0.012, -h * 0.13, w * 0.024, h * 0.13);
      x.fillStyle = LEAF; x.beginPath(); x.arc(0, -h * 0.19, w * 0.075, 0, TAU); x.arc(-w * 0.05, -h * 0.14, w * 0.05, 0, TAU); x.arc(w * 0.05, -h * 0.14, w * 0.055, 0, TAU); x.fill();
      x.restore();
    }
    this.title(x, t - 0.75, 'Flat 2D', w * 0.5, h * 0.86, h * 0.1);
  },
};
