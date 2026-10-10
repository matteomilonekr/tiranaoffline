// 3 · Pop art: comic-book printing. Ben-Day dots, thick black outlines, primary colours, a burst and a
// speech bubble that slams in with a shake.
import { type Style, F, txt, halftone, around, ease, clamp, hash, TAU } from './style';

const YELLOW = '#ffd400', RED = '#e4002b', BLUE = '#0077c8', INK = '#111111', WHITE = '#ffffff';

/** A jagged "explosion" balloon around (cx, cy). */
function blast(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number) {
  x.beginPath();
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, k = i % 2 ? 0.72 + 0.1 * hash(seed, i) : 1 + 0.12 * hash(seed, i + 50);
    x.lineTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  x.closePath();
}

export const popart: Style = {
  n: 3, id: 'popart', name: 'Pop art',
  what: 'Retini Ben-Day, contorni neri spessi, colori primari e fumetti che esplodono.',
  recipe: 'Colori primari piatti (giallo, rosso, blu) con contorni neri spessi; retino a punti che cresce verso un angolo; raggi di un’esplosione che ruotano; fumetto frastagliato con una parola in maiuscolo corsivo che entra di colpo con overshoot e un tremolio.',
  palette: { bg: YELLOW, ink: INK, accents: [RED, BLUE] },
  fonts: { title: F.archivoItalic(100, 800), text: F.archivo(100, 900) },
  motion: { ease: (u) => ease.outBack(u, 2.6), steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.03, vignette: 0.1 },

  ground(x, t, w, h) {
    x.fillStyle = YELLOW; x.fillRect(0, 0, w, h);
    // the burst: red rays turning slowly
    const cx = w * 0.5, cy = h * 0.45, R = Math.hypot(w, h);
    x.fillStyle = '#ffe766';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + t * 0.25;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.lineTo(cx + Math.cos(a + TAU / 36) * R, cy + Math.sin(a + TAU / 36) * R); x.closePath(); x.fill();
    }
    halftone(x, 0, 0, w, h, Math.max(10, w * 0.026), RED, (u, v) => Math.max(0, (u + v - 0.9) * 0.9));
  },

  title(x, t, s, cx, cy, size) {
    const k = ease.outBack(clamp(t / 0.3), 2.6), sh = t < 0.6 ? Math.sin(t * 80) * 6 * (1 - t / 0.6) : 0;
    around(x, cx + sh, cy, k, -0.06, () => {
      txt(x, s, cx + size * 0.06 + sh, cy + size * 0.42, size, F.archivoItalic(100, 800), INK, { align: 'center', stroke: INK, lw: size * 0.16 });
      txt(x, s, cx + sh, cy + size * 0.36, size, F.archivoItalic(100, 800), RED, { align: 'center', stroke: INK, lw: size * 0.1 });
    });
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    // the main blast, slammed in
    const k = ease.outBack(clamp((t - 0.05) / 0.3), 2.6);
    const sh = t < 0.7 ? Math.sin(t * 90) * 8 * (1 - t / 0.7) : 0;
    const cx = w * 0.5 + sh, cy = h * 0.42;
    around(x, cx, cy, k, -0.05, () => {
      blast(x, cx + 14, cy + 14, w * 0.4, h * 0.3, 3); x.fillStyle = INK; x.fill();
      blast(x, cx, cy, w * 0.4, h * 0.3, 3); x.fillStyle = WHITE; x.fill(); x.lineWidth = 8; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke();
      // action lines inside the balloon
      x.strokeStyle = INK; x.lineWidth = 4;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.2, r0 = w * 0.26, r1 = w * 0.31;
        x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.72); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.72); x.stroke();
      }
      const size = h * 0.25;
      txt(x, 'POP!', cx + 8, cy + size * 0.4, size, F.archivoItalic(100, 800), INK, { align: 'center', stroke: INK, lw: size * 0.16 });
      txt(x, 'POP!', cx, cy + size * 0.34, size, F.archivoItalic(100, 800), RED, { align: 'center', stroke: INK, lw: size * 0.09 });
    });
    // a round balloon with a tail: ART
    const k2 = ease.outBack(clamp((t - 0.55) / 0.3), 2.4);
    const bx = w * 0.7, by = h * 0.8;
    around(x, bx, by, k2, 0.06, () => {
      x.beginPath(); x.ellipse(bx + 10, by + 10, w * 0.2, h * 0.11, 0, 0, TAU); x.fillStyle = INK; x.fill();
      x.beginPath(); x.moveTo(bx - w * 0.13, by - h * 0.04); x.lineTo(bx - w * 0.24, by - h * 0.17); x.lineTo(bx - w * 0.06, by - h * 0.09); x.closePath();
      x.fillStyle = BLUE; x.fill(); x.lineWidth = 7; x.strokeStyle = INK; x.stroke();
      x.beginPath(); x.ellipse(bx, by, w * 0.2, h * 0.11, 0, 0, TAU); x.fillStyle = BLUE; x.fill(); x.stroke();
      txt(x, 'ART', bx, by + h * 0.045, h * 0.12, F.archivo(100, 900), WHITE, { align: 'center', stroke: INK, lw: 7 });
    });
    // a black frame, like a comic panel
    x.lineWidth = 10; x.strokeStyle = INK; x.strokeRect(5, 5, w - 10, h - 10);
  },
};
