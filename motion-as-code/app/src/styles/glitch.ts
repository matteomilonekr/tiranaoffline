// 11 · Glitch: a broken signal. RGB channels slip apart, horizontal slices jump sideways, blocks of noise and
// scanlines; quiet most of the time, in bursts every half second or so.
import { SCALE } from '../engine/gl';
import { type Style, F, font, txt, scratch, hash, clamp } from './style';

const BG = '#050507', WHITE = '#f4f4f6', RED = '#ff2340', CYAN = '#18f0ff', GREEN = '#39ff8f', MAGENTA = '#ff2bd6';
const FPS = 24;

/** How hard the signal breaks at t: 0 between bursts, up to 1 inside one. */
function burst(t: number) {
  const slot = Math.floor(t / 0.55), at = slot * 0.55 + 0.1 + hash(slot, 1) * 0.25;
  const d = t - at;
  return d > 0 && d < 0.16 ? 1 - d / 0.16 : 0.08;
}

/** The text in one colour, in a scratch canvas. */
function plate(s: string, size: number, color: string, key: string) {
  const fam = F.archivo(112, 900);
  const { x: m } = scratch('read-measure', 4, 4);
  m.font = font(fam, size);
  const tw = m.measureText(s).width + size * 0.6, th = size * 1.3;
  const sc = scratch(key, tw, th, SCALE);
  sc.x.font = font(fam, size); sc.x.textAlign = 'center'; sc.x.textBaseline = 'middle'; sc.x.fillStyle = color;
  sc.x.fillText(s, tw / 2, th / 2);
  return { c: sc.c, tw, th };
}

/** Glitched text centred on (cx, cy): channel split, slice displacement. */
function broken(x: CanvasRenderingContext2D, t: number, s: string, cx: number, cy: number, size: number) {
  const tf = Math.floor(t * FPS), b = burst(t);
  const split = size * (0.02 + 0.08 * b) * (hash(tf, 7) - 0.3);
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (const [col, dx, key] of [[RED, -split, 'gl-r'], [CYAN, split, 'gl-c']] as const) {
    const p = plate(s, size, col, key);
    const slices = 9;
    for (let i = 0; i < slices; i++) {
      const sy = (i / slices) * p.th, sh = p.th / slices;
      const jump = hash(tf, i, col === RED ? 3 : 4) < b ? (hash(tf, i, 5) - 0.5) * size * 0.9 * b : 0;
      x.drawImage(p.c, 0, sy * SCALE, p.tw * SCALE, sh * SCALE, cx - p.tw / 2 + dx + jump, cy - p.th / 2 + sy, p.tw, sh);
    }
  }
  x.restore();
}

export const glitch: Style = {
  n: 11, id: 'glitch', name: 'Glitch',
  what: 'Segnale rotto: canali RGB sfasati, fette che saltano, rumore e scanline.',
  recipe: 'Fondo nero, testo bianco ottenuto da un canale rosso e uno ciano sommati e sfalsati; a raffiche brevi (ogni mezzo secondo circa) fette orizzontali che saltano di lato, blocchi di rumore colorato e un lampo; scanline fisse, aberrazione cromatica e un leggero tremolio di camera; tempo a scatti a 24 fps.',
  palette: { bg: BG, ink: WHITE, accents: [RED, CYAN, GREEN, MAGENTA] },
  fonts: { title: F.archivo(112, 900), text: F.mono(500) },
  motion: { ease: (u) => (u < 1 ? Math.round(u * 6) / 6 : 1), steps: FPS },
  post: { bloom: 0.3, halation: 0, ca: 3, grain: 0.08, vignette: 0.3 },

  ground(x, t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1.5);
    const tf = Math.floor(t * FPS), b = burst(t);
    if (b > 0.5) for (let i = 0; i < 12; i++) { // blocks of noise in a burst
      x.fillStyle = [RED, CYAN, GREEN, MAGENTA, WHITE][Math.floor(hash(tf, i, 2) * 5)]!;
      x.globalAlpha = 0.7 * b;
      x.fillRect(hash(tf, i, 3) * w, hash(tf, i, 4) * h, 20 + hash(tf, i, 5) * w * 0.25, 4 + hash(tf, i, 6) * 18);
    }
    x.globalAlpha = 1;
  },

  title(x, t, s, cx, cy, size) { broken(x, t, s, cx, cy, size); },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    broken(x, t, 'GLITCH', w / 2, h * 0.46, h * 0.24);
    const tf = Math.floor(t * FPS), b = burst(t);
    // a timecode and a status that flicker
    const tc = `00:00:${String(Math.floor(t)).padStart(2, '0')}:${String(tf % FPS).padStart(2, '0')}`;
    txt(x, tc, w * 0.06, h * 0.1, h * 0.035, F.mono(500), GREEN, { alpha: 0.85 });
    if (hash(tf, 9) > 0.25) txt(x, b > 0.5 ? 'SIGNAL LOST' : 'REC •', w * 0.94, h * 0.1, h * 0.035, F.mono(700), b > 0.5 ? RED : WHITE, { align: 'right' });
    txt(x, 'ERR 0x2F · BUFFER OVERFLOW', w / 2, h * 0.8, h * 0.032, F.mono(500), 'rgba(244,244,246,0.6)', { align: 'center', alpha: clamp(b * 3) });
    // a flash of inversion at the peak of a burst
    if (b > 0.9) { x.save(); x.globalCompositeOperation = 'difference'; x.fillStyle = '#ffffff'; x.fillRect(0, h * hash(tf, 11), w, h * 0.12); x.restore(); }
  },
};
