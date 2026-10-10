// 1 · Swiss style (International Typographic Style): a strict grid, a bold grotesk set flush left with tight
// leading, lots of white, one pure red. Things slide along the grid lines and stop dead.
import { type Style, F, txt, inn, ease, clamp, measure } from './style';

const BG = '#f2f0ea', INK = '#111111', RED = '#e3001b';

function grid(x: CanvasRenderingContext2D, w: number, h: number, cols = 6) {
  x.strokeStyle = 'rgba(17,17,17,0.07)';
  x.lineWidth = 1;
  const m = w * 0.06, cw = (w - 2 * m) / cols;
  for (let i = 0; i <= cols; i++) { x.beginPath(); x.moveTo(m + i * cw, 0); x.lineTo(m + i * cw, h); x.stroke(); }
  for (let y = m; y < h; y += cw / 2) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
}

/** A line revealed from under a mask line, as Swiss posters animate: the text rises into place. */
function rise(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, k: number, color = INK, fam = F.archivo(100, 900)) {
  if (k <= 0) return;
  x.save();
  x.beginPath(); x.rect(px - size, py - size * 1.02, measure(s, fam, size) + 2 * size, size * 1.24); x.clip();
  txt(x, s, px, py + (1 - k) * size * 1.05, size, fam, color, { track: -size * 0.045 });
  x.restore();
}

export const swiss: Style = {
  n: 1, id: 'swiss', name: 'Swiss style',
  what: 'Griglia rigorosa, grotesk bold a sinistra, tanto bianco e un solo rosso.',
  recipe: 'Sfondo bianco caldo e griglia a 6 o 12 colonne; testo grotesk nero, bold, allineato a sinistra, interlinea stretta e tracking negativo; un solo accento rosso puro; gli elementi scorrono lungo la griglia e si fermano secchi (easing inOutQuart), nessuna ombra.',
  palette: { bg: BG, ink: INK, accents: [RED] },
  fonts: { title: F.archivo(100, 900), text: F.archivo(100, 500) },
  motion: { ease: ease.inOutQuart, steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.02, vignette: 0 },

  ground(x, _t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    grid(x, w, h);
  },

  title(x, t, s, cx, cy, size) {
    const w = measure(s, F.archivo(100, 900), size);
    rise(x, s, cx - w / 2, cy + size * 0.35, size, inn(t, 0, 0.5, ease.inOutQuart));
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const m = w * 0.06, e = ease.inOutQuart;
    // the red field grows along the top of the grid, a rule draws across under it
    const k1 = inn(t, 0.0, 0.55, e);
    x.fillStyle = RED;
    x.fillRect(m, h * 0.07, (w * 0.62 - m) * k1, h * 0.27);
    const k2 = inn(t, 0.25, 0.6, e);
    x.fillStyle = INK; x.fillRect(m, h * 0.405, (w - 2 * m) * k2, Math.max(3, h * 0.008));
    // the number drops into the corner
    const k3 = inn(t, 0.3, 0.45, e);
    x.save(); x.beginPath(); x.rect(w * 0.66, h * 0.05, w * 0.3, h * 0.3); x.clip();
    txt(x, '01', w - m, h * 0.3 - (1 - k3) * h * 0.25, h * 0.24, F.archivo(100, 900), INK, { align: 'right', track: -h * 0.012 });
    x.restore();
    // small text in the right columns, one line after another
    const lines = ['Griglia', 'Gerarchia', 'Spazio bianco', 'Funzione'];
    lines.forEach((s, i) => {
      const k = inn(t, 0.55 + i * 0.08, 0.35, e);
      txt(x, s, w * 0.69, h * 0.47 + i * h * 0.045, h * 0.032, F.archivo(100, 500), INK, { alpha: clamp(k * 2), track: -0.3 });
    });
    txt(x, 'Zürich — Basel, 1950', w * 0.69, h * 0.47 + 4.4 * h * 0.045, h * 0.026, F.archivo(100, 500), RED, { alpha: clamp(inn(t, 0.9, 0.3, e) * 2) });
    // the title, two lines rising out of their masks
    const size = h * 0.235;
    rise(x, 'Swiss', m - size * 0.04, h * 0.69, size, inn(t, 0.35, 0.5, e));
    rise(x, 'Style.', m - size * 0.04, h * 0.69 + size * 0.88, size, inn(t, 0.47, 0.5, e));
    // a red dot keeps time on the grid
    const beat = Math.floor(t * 2) % 6;
    x.fillStyle = RED;
    x.beginPath(); x.arc(w * 0.69 + beat * (w * 0.045), h * 0.42 - h * 0.035, h * 0.012, 0, Math.PI * 2); x.fill();
  },
};
