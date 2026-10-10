// 9 · Risograph: two spot inks (fluorescent pink and blue) printed one over the other on warm paper, multiplied
// where they overlap, slightly out of register, grainy; it moves in steps like a print run.
import { type Style, F, font, txt, halftone, speckle, stepT, inn, ease, clamp, hash, TAU } from './style';

const PAPER = '#f3ecdc', PINK = '#ff48b0', BLUE = '#0078bf', YELLOW = '#ffe800';
const FPS = 8;

/** The registration offset of an ink at t: a few px, a new one every frame of the print run. */
const reg = (t: number, ink: number, amp: number): [number, number] => {
  const f = Math.floor(t * FPS);
  return [(hash(f, ink, 1) - 0.5) * amp, (hash(f, ink, 2) - 0.5) * amp];
};

function ink(x: CanvasRenderingContext2D, color: string, fn: () => void, off: [number, number]) {
  x.save();
  x.globalCompositeOperation = 'multiply';
  x.translate(off[0], off[1]);
  x.fillStyle = color; x.strokeStyle = color;
  fn();
  x.restore();
}

export const riso: Style = {
  n: 9, id: 'riso', name: 'Risograph',
  what: 'Due inchiostri spot sovrapposti su carta, grana, fuori registro di qualche pixel.',
  recipe: 'Carta color avorio; due inchiostri piatti (rosa fluo e blu) stampati in multiply, viola dove si sovrappongono; ogni livello sfalsato di 2-6 px e un po’ diverso a ogni fotogramma; retini a punti per le sfumature, grana e puntini di carta che bucano l’inchiostro; animazione a scatti a 8-12 fps.',
  palette: { bg: PAPER, ink: BLUE, accents: [PINK, YELLOW] },
  fonts: { title: F.archivo(100, 900), text: F.mono(500) },
  motion: { ease: ease.outCubic, steps: FPS },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.07, vignette: 0.08 },

  ground(x, t, w, h) {
    x.fillStyle = PAPER; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 900, 'rgba(90,70,40,0.10)', 7, t, FPS, 1.6);
  },

  title(x, t, s, cx, cy, size) {
    const k = inn(stepT(t, FPS), 0, 0.5);
    const fam = F.archivo(100, 900);
    ink(x, PINK, () => { x.font = font(fam, size); x.textAlign = 'center'; x.globalAlpha = k; x.fillText(s, cx, cy + size * 0.35); }, reg(t, 1, 6));
    ink(x, BLUE, () => { x.font = font(fam, size); x.textAlign = 'center'; x.globalAlpha = k * 0.85; x.fillText(s, cx + size * 0.04, cy + size * 0.39); }, reg(t, 2, 6));
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const ts = stepT(t, FPS);
    // the blue layer: a dot-screened disc sliding in from the right
    const k1 = inn(ts, 0.0, 0.6);
    ink(x, BLUE, () => {
      const cx = w * (0.95 - 0.3 * k1), cy = h * 0.34, r = w * 0.3;
      x.save(); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.clip();
      halftone(x, cx - r, cy - r, 2 * r, 2 * r, Math.max(9, w * 0.016), BLUE, (u, v) => clamp(1.4 - Math.hypot(u - 0.3, v - 0.3) * 1.5));
      x.restore();
    }, reg(t, 2, 5));
    // the pink layer: an arch rising from the bottom
    const k2 = inn(ts, 0.15, 0.6);
    ink(x, PINK, () => {
      const ax = w * 0.12, aw = w * 0.42, top = h * (1.05 - 0.6 * k2);
      x.beginPath(); x.moveTo(ax, h); x.lineTo(ax, top + aw / 2); x.arc(ax + aw / 2, top + aw / 2, aw / 2, Math.PI, 0); x.lineTo(ax + aw, h); x.closePath(); x.fill();
    }, reg(t, 1, 5));
    // wavy blue lines across
    ink(x, BLUE, () => {
      x.lineWidth = Math.max(4, h * 0.008);
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        for (let px = 0; px <= w; px += 10) x.lineTo(px, h * (0.62 + i * 0.03) + Math.sin(px * 0.03 + ts * 3 + i) * h * 0.01);
        x.stroke();
      }
    }, reg(t, 2, 4));
    // the title in both inks, a little out of register: purple where they overlap
    const k3 = inn(ts, 0.35, 0.4);
    const size = h * 0.27, fam = F.archivo(100, 900);
    ink(x, PINK, () => { x.globalAlpha = k3; x.font = font(fam, size); x.fillText('RISO', w * 0.08, h * 0.83); }, reg(t, 1, 8));
    ink(x, BLUE, () => { x.globalAlpha = k3 * 0.8; x.font = font(fam, size); x.fillText('RISO', w * 0.1, h * 0.85); }, reg(t, 2, 8));
    txt(x, 'graph', w * 0.62, h * 0.85, h * 0.07, F.mono(500), BLUE, { alpha: clamp(inn(ts, 0.6, 0.3) * 1.3) });
    // paper showing through the ink, and the press marks
    speckle(x, w, h, 1400, 'rgba(243,236,220,0.55)', 11, t, FPS, 2.2);
    txt(x, '2 INKS · 1 PASS', w * 0.08, h * 0.08, h * 0.026, F.mono(700), PINK, { alpha: 0.9 });
  },
};
