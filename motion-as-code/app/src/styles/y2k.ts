// 7 · Y2K chrome: liquid-metal type, a chrome ring turning in 3D, bubbles and sparkles on a deep blue night,
// an iridescent subtitle; a glint sweeps across the metal.
import { SCALE } from '../engine/gl';
import { type Style, F, font, txt, scratch, inn, ease, clamp, hash, TAU } from './style';

const BG0 = '#0b1238', BG1 = '#02030c', IRI = ['#ff7ad9', '#7af0ff', '#c6ff7a', '#b48cff'];

function chromeGradient(x: CanvasRenderingContext2D, y0: number, y1: number) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, '#b9c6dc'); g.addColorStop(0.47, '#3d4a63');
  g.addColorStop(0.52, '#e9f0ff'); g.addColorStop(0.7, '#8494b0'); g.addColorStop(1, '#f7fbff');
  return g;
}

function sparkle(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: number) {
  if (a <= 0.02) return;
  x.save(); x.globalAlpha *= a; x.fillStyle = '#ffffff';
  x.beginPath();
  for (let i = 0; i < 8; i++) { const ang = (i * Math.PI) / 4, k = i % 2 ? r * 0.16 : r; x.lineTo(cx + Math.cos(ang) * k, cy + Math.sin(ang) * k); }
  x.closePath(); x.fill();
  x.restore();
}

/** Chrome type with a glint: drawn in a scratch canvas so the glint stays inside the letters. */
function chrome(x: CanvasRenderingContext2D, t: number, s: string, cx: number, cy: number, size: number, key: string, glintAt = 0) {
  const fam = F.archivo(125, 900);
  x.font = font(fam, size);
  const tw = x.measureText(s).width + size * 0.4, th = size * 1.4;
  const { c, x: o } = scratch(key, tw, th, SCALE);
  const base = th * 0.78;
  o.font = font(fam, size); o.textAlign = 'center'; o.lineJoin = 'round';
  o.lineWidth = size * 0.07; o.strokeStyle = '#0d1530'; o.strokeText(s, tw / 2, base);
  o.fillStyle = chromeGradient(o, base - size * 0.78, base + size * 0.05); o.fillText(s, tw / 2, base);
  o.globalCompositeOperation = 'source-atop';
  const ph = ((t - glintAt) % 2.2) / 2.2, gx = -tw * 0.3 + ph * tw * 1.6;
  const g = o.createLinearGradient(gx - size * 0.4, 0, gx + size * 0.4, th);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  o.fillStyle = g; o.fillRect(0, 0, tw, th);
  o.globalCompositeOperation = 'source-over';
  o.lineWidth = size * 0.015; o.strokeStyle = 'rgba(255,255,255,0.85)'; o.strokeText(s, tw / 2 - size * 0.012, base - size * 0.012);
  x.drawImage(c, cx - tw / 2, cy - base + size * 0.36, tw, th);
  // a sparkle where the glint leaves the metal
  sparkle(x, cx - tw / 2 + gx + size * 0.3, cy - size * 0.32, size * 0.16, Math.sin(ph * Math.PI) ** 4);
}

export const y2k: Style = {
  n: 7, id: 'y2k', name: 'Y2K chrome',
  what: 'Metallo liquido, cromature lucide, bolle e brillantini: l’estetica del Duemila.',
  recipe: 'Lettering largo e pesante con riempimento cromato (gradiente argento con una banda scura a metà), contorno blu notte, filo di luce bianco e un riflesso che attraversa le lettere; anelli cromati che ruotano in 3D, bolle trasparenti, stelline a quattro punte e un sottotitolo iridescente su fondo blu profondo.',
  palette: { bg: BG0, ink: '#e9f0ff', accents: IRI },
  fonts: { title: F.archivo(125, 900), text: F.archivo(125, 700) },
  motion: { ease: ease.outBack, steps: 0 },
  post: { bloom: 0.6, bloomThreshold: 0.8, halation: 0.1, ca: 0.6, grain: 0.03, vignette: 0.3 },

  ground(x, t, w, h) {
    const g = x.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, BG0); g.addColorStop(1, BG1);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(i, 3) * 2) + i);
      sparkle(x, hash(i, 1) * w, hash(i, 2) * h, (4 + 10 * hash(i, 4)) * tw, 0.3 + 0.7 * tw);
    }
  },

  title(x, t, s, cx, cy, size) {
    const k = ease.outBack(clamp(t / 0.5));
    x.save(); x.translate(cx, cy); x.scale(k, k); x.translate(-cx, -cy);
    chrome(x, t, s, cx, cy, size, 'y2k-title');
    x.restore();
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const cx = w / 2, cy = h * 0.46;
    // a chrome ring turning in 3D behind the type
    const tilt = 0.32 + 0.12 * Math.sin(t * 1.3);
    x.save(); x.translate(cx, cy); x.rotate(-0.25 + t * 0.15); x.scale(1, tilt);
    x.lineWidth = h * 0.05;
    const rg = x.createLinearGradient(-w * 0.4, -w * 0.4, w * 0.4, w * 0.4);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.3, '#5d6c8a'); rg.addColorStop(0.55, '#f2f6ff'); rg.addColorStop(0.8, '#3b4660'); rg.addColorStop(1, '#dfe7f7');
    x.strokeStyle = rg; x.beginPath(); x.arc(0, 0, w * 0.41, 0, TAU); x.stroke();
    x.restore();
    // bubbles rising
    for (let i = 0; i < 7; i++) {
      const u = (t * (0.08 + 0.04 * hash(i, 7)) + hash(i, 8)) % 1, bx = hash(i, 9) * w, by = h * (1.1 - u * 1.3), r = w * (0.02 + 0.035 * hash(i, 10));
      const g = x.createRadialGradient(bx - r * 0.4, by - r * 0.4, r * 0.1, bx, by, r);
      g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(0.6, 'rgba(160,200,255,0.12)'); g.addColorStop(1, 'rgba(200,170,255,0.45)');
      x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill();
    }
    // the chrome title, and an iridescent subtitle
    const k = ease.outBack(clamp((t - 0.05) / 0.5), 1.8);
    x.save(); x.translate(cx, cy); x.scale(k, k); x.translate(-cx, -cy);
    chrome(x, t, 'Y2K', cx, cy, h * 0.3, 'y2k-tile', 0.4);
    x.restore();
    const k2 = inn(t, 0.45, 0.5);
    const ig = x.createLinearGradient(cx - w * 0.3 + t * 80, 0, cx + w * 0.3 + t * 80, 0);
    IRI.forEach((c, i) => ig.addColorStop(i / (IRI.length - 1), c));
    x.save(); x.globalAlpha *= k2;
    x.font = font(F.archivo(125, 700), h * 0.085); x.textAlign = 'center'; x.letterSpacing = `${h * 0.02}px`;
    x.fillStyle = ig; x.fillText('CHROME', cx, h * 0.78 + (1 - k2) * 20);
    x.restore();
    txt(x, '© 2000', cx, h * 0.9, h * 0.03, F.mono(500), 'rgba(200,215,255,0.7)', { align: 'center', alpha: k2 });
  },
};
