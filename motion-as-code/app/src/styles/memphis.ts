// 15 · Memphis: 80s Milan design. Squiggles, zigzags, confetti, a dot grid, bold shapes in teal, pink, yellow
// and purple with black outlines; everything wobbles a little, like it is having fun.
import { type Style, F, txt, pop, ease, hash, TAU } from './style';

const BG = '#fff2f6', INK = '#141414', TEAL = '#00b3a6', PINK = '#ff5fa2', YELLOW = '#ffcf3f', PURPLE = '#7b61ff';
const COLS = [TEAL, PINK, YELLOW, PURPLE, INK];

function squiggle(x: CanvasRenderingContext2D, x0: number, y0: number, len: number, amp: number, t: number, col: string, lw: number) {
  x.beginPath();
  for (let i = 0; i <= 40; i++) { const u = i / 40; x.lineTo(x0 + u * len, y0 + Math.sin(u * TAU * 2.5 + t * 2) * amp); }
  x.lineWidth = lw; x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke();
}

function zigzag(x: CanvasRenderingContext2D, x0: number, y0: number, len: number, amp: number, n: number, col: string, lw: number) {
  x.beginPath();
  for (let i = 0; i <= n; i++) x.lineTo(x0 + (i / n) * len, y0 + (i % 2 ? -amp : amp));
  x.lineWidth = lw; x.strokeStyle = col; x.lineJoin = 'miter'; x.stroke();
}

export const memphis: Style = {
  n: 15, id: 'memphis', name: 'Memphis',
  what: 'Scarabocchi, zig-zag, coriandoli e forme pop: il design milanese anni Ottanta.',
  recipe: 'Fondo chiaro con coriandoli e una griglia di puntini; forme semplici (cerchi, triangoli, zig-zag, linee ondulate) in teal, rosa, giallo e viola con contorni neri; titolo pesante con un’ombra piena colorata spostata; tutto entra con un rimbalzo e poi continua a oscillare e ruotare piano.',
  palette: { bg: BG, ink: INK, accents: [TEAL, PINK, YELLOW, PURPLE] },
  fonts: { title: F.archivo(112, 900), text: F.grotesk(600) },
  motion: { ease: (u) => ease.outBack(u, 1.8), steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.02, vignette: 0.05 },

  ground(x, t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { // confetti
      const px = hash(i, 1) * w, py = hash(i, 2) * h, a = hash(i, 3) * Math.PI + Math.sin(t + i) * 0.2;
      x.save(); x.translate(px, py); x.rotate(a);
      x.fillStyle = COLS[i % COLS.length]!; x.fillRect(-9, -2.5, 18, 5);
      x.restore();
    }
    x.fillStyle = PURPLE; // a dot grid patch
    for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(w * 0.66 + i * 18, h * 0.08 + j * 18, 3.2, 0, TAU); x.fill(); }
  },

  title(x, t, s, cx, cy, size) {
    const k = pop(t, 0, 0.4);
    x.save(); x.translate(cx, cy); x.scale(k, k); x.rotate(-0.04 + Math.sin(t * 2) * 0.015); x.translate(-cx, -cy);
    txt(x, s, cx + size * 0.08, cy + size * 0.43, size, F.archivo(112, 900), TEAL, { align: 'center' });
    txt(x, s, cx, cy + size * 0.35, size, F.archivo(112, 900), INK, { align: 'center' });
    x.restore();
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const wob = (i: number) => Math.sin(t * 2.2 + i * 1.3) * 0.08;
    // shapes bounce in, then keep wobbling
    const shape = (t0: number, cx: number, cy: number, i: number, fn: () => void) => {
      const k = pop(t, t0, 0.4);
      if (k <= 0) return;
      x.save(); x.translate(cx, cy); x.rotate(wob(i)); x.scale(k, k); x.translate(-cx, -cy); fn(); x.restore();
    };
    shape(0.0, w * 0.2, h * 0.22, 0, () => { x.beginPath(); x.arc(w * 0.2, h * 0.22, w * 0.11, 0, TAU); x.fillStyle = YELLOW; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke(); });
    shape(0.12, w * 0.8, h * 0.34, 1, () => {
      x.beginPath(); x.moveTo(w * 0.8, h * 0.22); x.lineTo(w * 0.92, h * 0.44); x.lineTo(w * 0.68, h * 0.44); x.closePath();
      x.fillStyle = PINK; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
    });
    shape(0.2, w * 0.5, h * 0.12, 2, () => squiggle(x, w * 0.34, h * 0.12, w * 0.32, h * 0.025, t, INK, 7));
    shape(0.28, w * 0.5, h * 0.84, 3, () => zigzag(x, w * 0.22, h * 0.84, w * 0.56, h * 0.03, 10, TEAL, 10));
    shape(0.36, w * 0.14, h * 0.7, 4, () => {
      x.save(); x.translate(w * 0.14, h * 0.7); x.rotate(0.5);
      x.fillStyle = PURPLE; x.fillRect(-w * 0.06, -w * 0.06, w * 0.12, w * 0.12); x.lineWidth = 5; x.strokeStyle = INK; x.strokeRect(-w * 0.06, -w * 0.06, w * 0.12, w * 0.12);
      x.restore();
    });
    shape(0.44, w * 0.86, h * 0.72, 5, () => {
      x.beginPath(); x.arc(w * 0.86, h * 0.72, w * 0.07, Math.PI, TAU); x.closePath();
      x.fillStyle = TEAL; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
    });
    // the title, with its coloured shadow
    this.title(x, t - 0.35, 'MEMPHIS', w * 0.5, h * 0.52, h * 0.17);
    txt(x, 'milano · 1981', w * 0.5, h * 0.64, h * 0.04, F.grotesk(600), PINK, { align: 'center', alpha: ease.outCubic(Math.max(0, Math.min(1, (t - 0.8) / 0.4))) });
  },
};
