// 2 · Kinetic type: the words are the animation. Letters rise in on a stagger, stretch and squash on the beat,
// swap colour; outlined words scroll behind. Black, white and an acid yellow.
import { type Style, F, font, txt, ease, clamp, lerp, measure } from './style';

const BG = '#0b0b0c', WHITE = '#f5f5f0', ACID = '#e4ff2e', OUT = '#2e2e33';
const BPS = 2; // beats per second

/** One word, letter by letter: each rises in, then pulses on the beat. */
function word(x: CanvasRenderingContext2D, t: number, s: string, cx: number, base: number, size: number, fam: string, o: { t0?: number; stretch?: number; colors?: string[] } = {}) {
  const t0 = o.t0 ?? 0, colors = o.colors ?? [WHITE];
  x.font = font(fam, size);
  const adv = Array.from(s).map((ch) => x.measureText(ch).width);
  const total = adv.reduce((a, b) => a + b, 0);
  let px = cx - total / 2;
  Array.from(s).forEach((ch, i) => {
    const k = ease.outBack(clamp((t - t0 - i * 0.055) / 0.42), 2.2);
    if (k <= 0) { px += adv[i]!; return; }
    const ph = t * BPS - i * 0.12;
    const kick = Math.max(0, Math.cos((ph % 1) * Math.PI * 2)) ** 6; // a pulse on every beat
    const sy = k * (1 + 0.16 * kick), sx = (o.stretch ?? 1) * (1 - 0.08 * kick);
    const col = colors[(Math.floor(ph) + i) % colors.length]!;
    x.save();
    x.translate(px + adv[i]! / 2, base + (1 - k) * size * 0.6);
    x.scale(sx, sy);
    x.fillStyle = col;
    x.textAlign = 'center';
    x.fillText(ch, 0, 0);
    x.restore();
    px += adv[i]!;
  });
}

export const kinetic: Style = {
  n: 2, id: 'kinetic', name: 'Kinetic type',
  what: 'La tipografia è l’animazione: lettere che entrano, si allungano e pulsano a ritmo.',
  recipe: 'Fondo nero, testo bianco e un giallo acido; ogni lettera entra sfalsata dal basso con overshoot, si schiaccia e si allunga a tempo (120 bpm), larghezze del font che cambiano fra condensato ed espanso; parole in solo contorno che scorrono dietro.',
  palette: { bg: BG, ink: WHITE, accents: [ACID] },
  fonts: { title: F.archivo(62, 900), text: F.archivo(125, 900) },
  motion: { ease: (u) => ease.outBack(u, 2.2), steps: 0 },
  post: { bloom: 0.2, halation: 0, ca: 0.4, grain: 0.04, vignette: 0.2 },

  ground(x, t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    // outlined words scroll behind, alternate rows in opposite directions
    const size = h * 0.13, fam = F.archivo(125, 900);
    const row = 'KINETIC TYPE  ';
    const rw = measure(row, fam, size);
    x.save();
    x.font = font(fam, size); x.lineWidth = 2; x.strokeStyle = OUT;
    for (let r = 0; r < 8; r++) {
      const dir = r % 2 ? 1 : -1, off = ((t * 90 * dir) % rw + rw) % rw;
      for (let k = -1; k < w / rw + 1; k++) x.strokeText(row, k * rw - off, r * size * 1.02 + size * 0.85);
    }
    x.restore();
  },

  title(x, t, s, cx, cy, size) {
    word(x, t, s, cx, cy + size * 0.35, size, F.archivo(62, 900), { colors: [WHITE, ACID] });
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const cx = w / 2;
    word(x, t, 'KINETIC', cx, h * 0.47, h * 0.27, F.archivo(62, 900), { t0: 0.05, colors: [WHITE, WHITE, ACID] });
    word(x, t, 'TYPE', cx, h * 0.8, h * 0.3, F.archivo(125, 900), { t0: 0.4, stretch: lerp(0.9, 1.06, 0.5 + 0.5 * Math.sin(t * Math.PI)), colors: [ACID, WHITE] });
    // a playhead bar keeps the beat under the words
    const ph = (t * BPS) % 1;
    x.fillStyle = ACID;
    x.fillRect(w * 0.12, h * 0.885, (w * 0.76) * ph, h * 0.012);
    txt(x, '120 BPM', w * 0.12, h * 0.94, h * 0.03, F.mono(700), WHITE, { alpha: 0.7 });
  },
};
