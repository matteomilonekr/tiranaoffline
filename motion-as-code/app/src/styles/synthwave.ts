// 8 · Synthwave: an 80s night drive. A striped sun sinking into a neon grid that scrolls towards you, purple
// mountains, stars, and a title written in neon script.
import { strokeText, drawStrokeText, type StrokeText } from '../engine/stroke';
import { type Style, F, txt, vgrad, inn, ease, clamp, hash, TAU } from './style';

const SKY = ['#0d0221', '#2b0b4f', '#7a1263', '#ff2e88'] as const;
const PINK = '#ff2bd6', CYAN = '#2de2ff', SUN0 = '#ffe45c', SUN1 = '#ff2e88';

let script: StrokeText | null = null;
let scriptSize = 0;

function scene(x: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const hz = h * 0.6;
  x.fillStyle = vgrad(x, 0, hz, [[0, SKY[0]], [0.45, SKY[1]], [0.8, SKY[2]], [1, SKY[3]]]);
  x.fillRect(0, 0, w, hz);
  for (let i = 0; i < 40; i++) { // stars
    const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7));
    x.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    x.fillRect(hash(i, 1) * w, hash(i, 2) * hz * 0.7, 2, 2);
  }
  // the sun: a gradient disc cut by bands that thicken towards the horizon
  const sr = w * 0.24, sx = w / 2, sy = hz - sr * 0.35;
  x.save();
  x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.clip();
  x.fillStyle = vgrad(x, sy - sr, sy + sr, [[0, SUN0], [1, SUN1]]);
  x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  x.fillStyle = SKY[3];
  for (let i = 0; i < 7; i++) {
    const u = ((i / 7) + t * 0.06) % 1, y = sy - sr * 0.1 + u * sr * 1.1, gap = 2 + u * u * sr * 0.12;
    x.fillRect(sx - sr, y, sr * 2, gap);
  }
  x.restore();
  // mountains on the horizon, a neon rim on their ridges
  const ridge = (seed: number, base: number, amp: number, col: string, rim: string) => {
    x.beginPath(); x.moveTo(0, hz);
    for (let i = 0; i <= 12; i++) x.lineTo((i / 12) * w, base - amp * (i % 2 ? 0.4 + 0.6 * hash(seed, i) : 0.1 * hash(seed, i)));
    x.lineTo(w, hz); x.closePath(); x.fillStyle = col; x.fill();
    x.save(); x.shadowColor = rim; x.shadowBlur = 10; x.strokeStyle = rim; x.lineWidth = 2; x.stroke(); x.restore();
  };
  ridge(4, hz, h * 0.12, '#240741', PINK);
  // the floor and its grid, scrolling towards you
  x.fillStyle = '#0a0016'; x.fillRect(0, hz, w, h - hz);
  x.save();
  x.beginPath(); x.rect(0, hz, w, h - hz); x.clip();
  x.shadowColor = PINK; x.shadowBlur = 12; x.strokeStyle = PINK; x.lineWidth = 2.5;
  for (let i = -14; i <= 14; i++) { x.beginPath(); x.moveTo(w / 2 + i * w * 0.02, hz); x.lineTo(w / 2 + i * w * 0.22, h); x.stroke(); }
  const ph = (t * 0.9) % 1;
  for (let k = 0; k < 14; k++) {
    const z = (k + 1 - ph), y = hz + (h - hz) * (1 / z) * 0.9;
    if (y > h || y < hz) continue;
    x.globalAlpha = clamp((y - hz) / ((h - hz) * 0.15));
    x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke();
  }
  x.restore();
  // a haze where sky meets floor
  x.fillStyle = vgrad(x, hz - h * 0.05, hz + h * 0.06, [[0, 'rgba(255,46,136,0)'], [0.5, 'rgba(255,46,136,0.45)'], [1, 'rgba(255,46,136,0)']]);
  x.fillRect(0, hz - h * 0.05, w, h * 0.11);
}

/** Neon script, written on. */
function neon(x: CanvasRenderingContext2D, t: number, s: string, cx: number, cy: number, size: number) {
  if (!script || scriptSize !== size || (script as StrokeText & { s?: string }).s !== s) {
    script = Object.assign(strokeText(s, 'script', size), { s });
    scriptSize = size;
  }
  const st = script;
  const len = st.total * ease.inOutCubic(clamp(t / 1.0));
  x.save();
  x.translate(cx - st.width / 2, cy + st.capHeight * 0.35);
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.globalCompositeOperation = 'lighter';
  for (const [lw, col, blur] of [[size * 0.09, 'rgba(255,43,214,0.55)', size * 0.25], [size * 0.045, PINK, size * 0.1], [size * 0.016, '#ffe6fb', 0]] as const) {
    x.lineWidth = lw; x.strokeStyle = col; x.shadowColor = PINK; x.shadowBlur = blur;
    drawStrokeText(x, st, len);
  }
  x.restore();
}

export const synthwave: Style = {
  n: 8, id: 'synthwave', name: 'Synthwave',
  what: 'Neon, sole a strisce e griglia che corre verso l’orizzonte: una notte anni Ottanta.',
  recipe: 'Cielo viola che sfuma in magenta all’orizzonte, sole a gradiente giallo-rosa tagliato da bande orizzontali, montagne viola con il profilo al neon, pavimento nero con una griglia rosa in prospettiva che scorre verso la camera; titolo in corsivo al neon scritto a mano, con bagliore (bloom alto).',
  palette: { bg: SKY[0], ink: '#ffe6fb', accents: [PINK, CYAN, SUN0] },
  fonts: { title: F.archivoItalic(100, 800), text: F.archivo(125, 700) },
  motion: { ease: ease.inOutCubic, steps: 0 },
  post: { bloom: 1.0, bloomThreshold: 0.6, halation: 0.3, ca: 1.2, grain: 0.05, vignette: 0.35 },

  ground(x, t, w, h) { scene(x, t, w, h); },

  title(x, t, s, cx, cy, size) { neon(x, t, s, cx, cy, size); },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    neon(x, t - 0.15, 'Synthwave', w / 2, h * 0.3, h * 0.2);
    const k = inn(t, 1.0, 0.5);
    txt(x, 'NIGHT DRIVE · 1986', w / 2, h * 0.43, h * 0.032, F.archivo(125, 700), CYAN, { align: 'center', track: h * 0.01, alpha: k });
  },
};
