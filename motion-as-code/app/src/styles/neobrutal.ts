// 13 · Neobrutalism: cream ground, thick black borders, hard offset shadows, flat loud colours, chunky type.
// Cards snap in with an overshoot; a cursor presses a button (the shadow goes, the button drops into its place).
import { type Style, F, txt, rr, pop, ease, clamp, lerp, measure, TAU } from './style';

const CREAM = '#fffdf5', INK = '#000000', YELLOW = '#ffd93d', VIOLET = '#8b5cf6', PINK = '#ff6b9d', GREEN = '#4ade80', BLUE = '#60a5fa';

/** A card: hard shadow, fill, thick border. */
function box(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, fill: string, sh = 10, r = 14, lw = 5) {
  if (sh) { rr(x, x0 + sh, y0 + sh, w, h, r); x.fillStyle = INK; x.fill(); }
  rr(x, x0, y0, w, h, r); x.fillStyle = fill; x.fill(); x.lineWidth = lw; x.strokeStyle = INK; x.stroke();
}

function at(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number, fn: () => void) {
  if (s <= 0.002) return;
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s); x.translate(-cx, -cy); fn(); x.restore();
}

export const neobrutal: Style = {
  n: 13, id: 'neobrutal', name: 'Neobrutalism',
  what: 'Bordi neri spessi, ombre nette senza sfocatura, colori piatti e forti.',
  recipe: 'Fondo crema, bordi neri di 3-5 px su tutto, ombre piene spostate di 6-12 px senza sfocatura, colori piatti saturi (giallo, viola, rosa, verde), caratteri grotesk pesanti; elementi che entrano a scatto con overshoot; un pulsante che, premuto, perde l’ombra e scende nella sua impronta.',
  palette: { bg: CREAM, ink: INK, accents: [YELLOW, VIOLET, PINK, GREEN] },
  fonts: { title: F.grotesk(700), text: F.grotesk(500) },
  motion: { ease: (u) => ease.outBack(u, 2.0), steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.015, vignette: 0 },

  ground(x, _t, w, h) {
    x.fillStyle = CREAM; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 24; y < h; y += 32) for (let px = 24; px < w; px += 32) { x.beginPath(); x.arc(px, y, 2, 0, TAU); x.fill(); }
  },

  title(x, t, s, cx, cy, size) {
    const fam = F.grotesk(700), tw = measure(s, fam, size) + size * 0.7, th = size * 1.35;
    at(x, cx, cy, pop(t, 0, 0.35), -0.03, () => {
      box(x, cx - tw / 2, cy - th / 2, tw, th, YELLOW, size * 0.12, size * 0.16, Math.max(4, size * 0.06));
      txt(x, s, cx, cy + size * 0.36, size, fam, INK, { align: 'center' });
    });
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    // NEO, then BRUTALISM, snapping in
    at(x, w * 0.36, h * 0.24, pop(t, 0.05), -0.04, () => {
      box(x, w * 0.1, h * 0.12, w * 0.52, h * 0.24, YELLOW, 12, 18);
      txt(x, 'NEO', w * 0.36, h * 0.3, h * 0.16, F.grotesk(700), INK, { align: 'center' });
    });
    at(x, w * 0.52, h * 0.47, pop(t, 0.22), 0.03, () => {
      box(x, w * 0.1, h * 0.39, w * 0.82, h * 0.17, VIOLET, 12, 18);
      txt(x, 'BRUTALISM', w * 0.51, h * 0.51, h * 0.11, F.grotesk(700), '#ffffff', { align: 'center' });
    });
    // stickers
    at(x, w * 0.8, h * 0.2, pop(t, 0.4), 0.2, () => {
      x.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, k = i % 2 ? 0.62 : 1; x.lineTo(w * 0.8 + Math.cos(a) * w * 0.09 * k, h * 0.2 + Math.sin(a) * w * 0.09 * k); }
      x.closePath(); x.fillStyle = GREEN; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
      txt(x, 'NEW', w * 0.8, h * 0.2 + h * 0.018, h * 0.05, F.grotesk(700), INK, { align: 'center' });
    });
    // the button and a cursor that presses it
    const bx = w * 0.18, by = h * 0.66, bw = w * 0.46, bh = h * 0.14;
    const press = t > 1.15 && t < 1.38 ? 1 : 0, sh = lerp(10, 0, press);
    at(x, bx + bw / 2, by + bh / 2, pop(t, 0.45), 0, () => {
      box(x, bx + 10 - sh, by + 10 - sh, bw, bh, PINK, sh, 16);
      txt(x, 'CLICCA', bx + 10 - sh + bw / 2, by + 10 - sh + bh * 0.66, bh * 0.45, F.grotesk(700), INK, { align: 'center' });
    });
    at(x, w * 0.8, h * 0.74, pop(t, 0.6), -0.12, () => box(x, w * 0.7, h * 0.66, w * 0.2, h * 0.16, BLUE, 8, 50));
    // the cursor
    const u = ease.inOutCubic(clamp((t - 0.6) / 0.5));
    const cx = lerp(w * 0.9, bx + bw * 0.62, u), cy = lerp(h * 0.98, by + bh * 0.62, u) + press * 6;
    if (t > 0.55) {
      x.save(); x.translate(cx, cy); x.scale(1.6, 1.6);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 26); x.lineTo(7, 20); x.lineTo(12, 31); x.lineTo(17, 29); x.lineTo(12, 18); x.lineTo(21, 18); x.closePath();
      x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke();
      x.restore();
    }
  },
};
