// 5 · Clay 3D: soft, rounded, matte objects under a studio light, as if made of plasticine. A ball bounces with
// squash and stretch, puffy letters drop in one by one and settle with a wobble.
import { SCALE } from '../engine/gl';
import { type Style, F, font, scratch, ease, clamp, lerp, TAU } from './style';

const BG = '#f8dccb', FLOOR = '#f3cdb6', INK = '#5a3a2e';
const CLAYS = ['#ff8a5c', '#5cb8ff', '#ffc94d', '#8fdc7a', '#c08cff', '#ff7aa8', '#5cd6c9'];

/** A soft contact shadow on the floor. */
function shadow(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a: number) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, `rgba(110,50,30,${0.28 * a})`); g.addColorStop(1, 'rgba(110,50,30,0)');
  x.save(); x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy);
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rx, 0, TAU); x.fill();
  x.restore();
}

/** A clay sphere: matte, lit from the top left. */
function ball(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string, sx = 1, sy = 1) {
  x.save(); x.translate(cx, cy); x.scale(sx, sy);
  const g = x.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, col); g.addColorStop(1, shade(col, 0.62));
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
  x.restore();
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

/** A puffy letter: a thick rounded stroke of the same colour, lit on top, shaded below, with a soft drop shadow. */
function puffy(x: CanvasRenderingContext2D, ch: string, cx: number, base: number, size: number, col: string, sx: number, sy: number, key: string) {
  const fam = F.archivo(112, 900), pad = size * 0.3;
  x.font = font(fam, size);
  const tw = x.measureText(ch).width + 2 * pad, th = size * 1.35;
  const { c, x: o } = scratch(key, tw, th, SCALE);
  o.font = font(fam, size); o.textAlign = 'center'; o.textBaseline = 'alphabetic';
  o.lineJoin = 'round'; o.lineWidth = size * 0.16; o.strokeStyle = col; o.fillStyle = col;
  const by = th - size * 0.22;
  o.strokeText(ch, tw / 2, by); o.fillText(ch, tw / 2, by);
  o.globalCompositeOperation = 'source-atop';
  const g = o.createLinearGradient(0, 0, tw * 0.3, th);
  g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.35, 'rgba(255,255,255,0.05)'); g.addColorStop(0.7, 'rgba(0,0,0,0.04)'); g.addColorStop(1, 'rgba(60,20,10,0.35)');
  o.fillStyle = g; o.fillRect(0, 0, tw, th);
  x.save();
  x.translate(cx, base);
  x.scale(sx, sy);
  x.shadowColor = 'rgba(110,50,30,0.35)'; x.shadowBlur = size * 0.18; x.shadowOffsetY = size * 0.1;
  x.drawImage(c, -tw / 2, -by, tw, th);
  x.restore();
}

export const clay: Style = {
  n: 5, id: 'clay', name: 'Clay 3D',
  what: 'Oggetti morbidi e opachi, come plastilina, con luce da studio e rimbalzi elastici.',
  recipe: 'Forme arrotondate e lettere gonfie in colori pastello saturi, materiale opaco con luce morbida dall’alto a sinistra e ombre di contatto sfumate; animazione con squash and stretch: ogni oggetto si schiaccia quando atterra e oscilla prima di fermarsi.',
  palette: { bg: BG, ink: INK, accents: CLAYS },
  fonts: { title: F.archivo(112, 900), text: F.grotesk(600) },
  motion: { ease: (u) => ease.outElastic(u), steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.02, vignette: 0.12 },

  ground(x, _t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    x.fillStyle = FLOOR; x.beginPath(); x.ellipse(w / 2, h * 0.98, w * 0.8, h * 0.3, 0, 0, TAU); x.fill();
    const g = x.createRadialGradient(w / 2, h * 0.35, h * 0.2, w / 2, h * 0.45, h * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(120,60,40,0.12)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  },

  title(x, t, s, cx, cy, size) {
    x.font = font(F.archivo(112, 900), size);
    const adv = Array.from(s).map((ch) => x.measureText(ch).width + size * 0.05);
    let px = cx - adv.reduce((a, b) => a + b, 0) / 2;
    Array.from(s).forEach((ch, i) => {
      const u = clamp((t - i * 0.09) / 0.7);
      if (u > 0 && ch !== ' ') {
        const drop = (1 - ease.outCubic(clamp(u * 2.2))) * size * 1.6;
        const land = clamp(u * 2.2 - 1);
        const squash = land > 0 ? Math.sin(land * Math.PI * 3) * Math.exp(-land * 3.5) * 0.22 : 0;
        puffy(x, ch, px + adv[i]! / 2, cy + size * 0.38 - drop, size, CLAYS[i % CLAYS.length]!, 1 + squash, 1 - squash, `clay-${i}`);
      }
      px += adv[i]!;
    });
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    // a ball bouncing: squash on landing, stretch in the air
    const T = 1.1, ph = (t % T) / T, y = Math.abs(Math.sin(ph * Math.PI)), floor = h * 0.86, r = w * 0.075;
    const squash = ph < 0.08 || ph > 0.92 ? 0.25 * (1 - Math.min(ph, 1 - ph) / 0.08) : 0;
    const bx = w * 0.78, by = floor - r - y * h * 0.28;
    shadow(x, bx, floor, r * (1.3 - 0.5 * y), r * 0.3, 1 - 0.6 * y);
    ball(x, bx, by + squash * r * 0.6, r, CLAYS[1]!, 1 + squash, lerp(1, 1 - squash, 1) * (1 + 0.12 * y * (1 - squash)));
    // a capsule wobbling on the left
    const wob = Math.sin(t * 4) * 0.08 * Math.exp(-((t % 3) * 0.6));
    shadow(x, w * 0.2, floor, w * 0.11, w * 0.025, 1);
    x.save(); x.translate(w * 0.2, floor - w * 0.06); x.rotate(-0.25 + wob);
    const g = x.createLinearGradient(0, -w * 0.06, 0, w * 0.06);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(0.25, CLAYS[2]!); g.addColorStop(1, shade(CLAYS[2]!, 0.7));
    x.fillStyle = g; x.beginPath(); x.arc(-w * 0.07, 0, w * 0.06, Math.PI / 2, Math.PI * 1.5); x.arc(w * 0.07, 0, w * 0.06, -Math.PI / 2, Math.PI / 2); x.closePath(); x.fill();
    x.restore();
    // the letters drop in and settle
    this.title(x, t - 0.1, 'CLAY', w * 0.47, h * 0.42, h * 0.24);
    this.title(x, t - 0.55, '3D', w * 0.47, h * 0.7, h * 0.2);
  },
};
