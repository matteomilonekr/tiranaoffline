// 10 · Paper collage: torn paper, tape, a halftone patch and cut-out letters on kraft, each letter its own scrap,
// paper and typeface, like a ransom note. Pieces land one by one, stop-motion: 12 fps and a little boil.
import { type Style, F, font, torn, halftone, stepT, ease, clamp, hash, lerp } from './style';

const KRAFT = '#d3b07e', RED = '#e2423a', CREAM = '#fbf6ea', NAVY = '#1f2f5c', YELLOW = '#f5c518', INK = '#141414', BLUE = '#6ec6ff';
const FPS = 12;
// each letter: scrap colour, letter colour, typeface
const SCRAPS: [string, string, string][] = [
  [CREAM, INK, F.archivo(100, 900)],
  [RED, CREAM, F.serif(600, true)],
  [YELLOW, INK, F.archivo(62, 900)],
  [INK, CREAM, F.archivo(125, 900)],
  [BLUE, NAVY, F.serif(600, true)],
  [CREAM, RED, F.mono(700)],
  [NAVY, CREAM, F.archivo(87.5, 900)],
];

/** A strip of tape across (cx, cy). */
function tape(x: CanvasRenderingContext2D, cx: number, cy: number, len: number, rot: number) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.fillStyle = 'rgba(250,247,232,0.62)'; x.fillRect(-len / 2, -len * 0.14, len, len * 0.28);
  x.restore();
}

/** One cut-out letter on its scrap; lands at t0 (stop-motion). */
function letter(x: CanvasRenderingContext2D, t: number, ch: string, i: number, cx: number, cy: number, size: number, t0: number) {
  const ts = stepT(t, FPS), u = clamp((ts - t0) / 0.25);
  if (u <= 0) return;
  const [paper, ink, fam] = SCRAPS[i % SCRAPS.length]!;
  const k = lerp(1.7, 1, ease.outCubic(u)), boil = (hash(Math.floor(t * FPS), i) - 0.5) * 1.5;
  const rot = (hash(i, 3) - 0.5) * 0.3 + boil * 0.01;
  x.font = font(fam, size);
  const lw = Math.max(x.measureText(ch).width, size * 0.5) + size * 0.32, lh = size * 1.15;
  x.save();
  x.translate(cx + boil, cy - boil); x.rotate(rot); x.scale(k, k);
  x.globalAlpha *= u;
  x.shadowColor = 'rgba(40,25,10,0.35)'; x.shadowBlur = 6; x.shadowOffsetX = 3; x.shadowOffsetY = 4;
  torn(x, -lw / 2, -lh / 2, lw, lh, i + 20, 5); x.fillStyle = paper; x.fill();
  x.shadowColor = 'transparent';
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, 0, size * 0.04);
  x.restore();
}

export const collage: Style = {
  n: 10, id: 'collage', name: 'Paper collage',
  what: 'Carta strappata, nastro adesivo e lettere ritagliate, una diversa dall’altra.',
  recipe: 'Fondo di carta kraft con fibre; pezzi di carta dai bordi strappati in rosso, crema, giallo e blu notte, con un’ombra corta; nastro adesivo semitrasparente; ogni lettera ritagliata da una carta diversa con un carattere diverso, come una lettera anonima; i pezzi entrano uno alla volta in stop-motion a 12 fps, con un leggero tremolio.',
  palette: { bg: KRAFT, ink: INK, accents: [RED, YELLOW, NAVY, CREAM] },
  fonts: { title: F.archivo(100, 900), text: F.serif(600, true) },
  motion: { ease: ease.outCubic, steps: FPS },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.05, vignette: 0.15 },

  ground(x, _t, w, h) {
    x.fillStyle = KRAFT; x.fillRect(0, 0, w, h);
    x.lineWidth = 1.2;
    for (let i = 0; i < 160; i++) { // fibres
      const px = hash(i, 1) * w, py = hash(i, 2) * h, a = hash(i, 3) * Math.PI, l = 8 + 22 * hash(i, 4);
      x.strokeStyle = hash(i, 5) > 0.5 ? 'rgba(255,240,210,0.35)' : 'rgba(110,80,40,0.25)';
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
  },

  title(x, t, s, cx, cy, size) {
    const chars = Array.from(s);
    const step = size * 0.82;
    chars.forEach((ch, i) => { if (ch !== ' ') letter(x, t, ch, i, cx + (i - (chars.length - 1) / 2) * step, cy, size, i * 0.09); });
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const ts = stepT(t, FPS);
    const land = (t0: number) => clamp((ts - t0) / 0.17);
    // the base sheet, a red strip, a navy halftone patch, a yellow scrap: each lands in its turn
    const piece = (t0: number, fn: () => void) => {
      const u = land(t0);
      if (u <= 0) return;
      x.save(); x.globalAlpha *= u; x.translate(0, (1 - ease.outCubic(u)) * -40);
      x.shadowColor = 'rgba(40,25,10,0.35)'; x.shadowBlur = 8; x.shadowOffsetX = 4; x.shadowOffsetY = 5;
      fn();
      x.restore();
    };
    piece(0.0, () => { x.save(); x.translate(w * 0.5, h * 0.52); x.rotate(0.03); torn(x, -w * 0.4, -h * 0.3, w * 0.8, h * 0.6, 1, 8); x.fillStyle = CREAM; x.fill(); x.restore(); });
    piece(0.12, () => { x.save(); x.translate(w * 0.3, h * 0.17); x.rotate(-0.08); torn(x, -w * 0.26, -h * 0.045, w * 0.52, h * 0.09, 2, 6); x.fillStyle = RED; x.fill(); x.restore(); });
    piece(0.2, () => {
      x.save(); x.translate(w * 0.74, h * 0.8); x.rotate(0.12); torn(x, -w * 0.17, -h * 0.11, w * 0.34, h * 0.22, 3, 6); x.fillStyle = NAVY; x.fill();
      x.shadowColor = 'transparent'; x.clip();
      halftone(x, -w * 0.17, -h * 0.11, w * 0.34, h * 0.22, Math.max(12, w * 0.03), CREAM, () => 0.42, false);
      x.restore();
    });
    piece(0.28, () => { x.save(); x.translate(w * 0.18, h * 0.82); x.rotate(-0.15); torn(x, -w * 0.1, -h * 0.06, w * 0.2, h * 0.12, 4, 6); x.fillStyle = YELLOW; x.fill(); x.restore(); });
    // the letters: COLL / AGE
    const size = h * 0.15;
    'COLL'.split('').forEach((ch, i) => letter(x, t, ch, i, w * (0.22 + i * 0.19), h * 0.43, size, 0.4 + i * 0.09));
    'AGE'.split('').forEach((ch, i) => letter(x, t, ch, i + 4, w * (0.3 + i * 0.19), h * 0.64, size, 0.76 + i * 0.09));
    // tape over the corners
    if (land(1.1) > 0) { tape(x, w * 0.14, h * 0.24, w * 0.14, -0.6); tape(x, w * 0.86, h * 0.72, w * 0.14, 0.7); }
  },
};
