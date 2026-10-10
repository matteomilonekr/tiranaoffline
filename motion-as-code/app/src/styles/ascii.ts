// 21 · ASCII art (the bonus): the picture is made of characters. A torus turns in 3D, shaded with
// " .,-~:;=!*#$@" (the classic donut), under a banner set in # and a prompt that types itself.
import { type Style, F, font, txt, scratch, clamp } from './style';

const BG = '#040805', GREEN = '#39ff7a', DIM = '#1d7a40';
const RAMP = '.,-~:;=!*#$@';

/** The torus at angles (a, b) on a cols x rows grid of characters; `aspect` is cell width / cell height. */
function donut(a: number, b: number, cols: number, rows: number, aspect: number) {
  const out = new Array<string>(cols * rows).fill(' ');
  const zb = new Float32Array(cols * rows);
  const R1 = 1, R2 = 2, K2 = 5, K1 = (Math.min(cols, rows / aspect) * K2 * 3) / (8 * (R1 + R2));
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b);
  for (let th = 0; th < Math.PI * 2; th += 0.07) {
    const ct = Math.cos(th), st = Math.sin(th);
    for (let ph = 0; ph < Math.PI * 2; ph += 0.02) {
      const cp = Math.cos(ph), sp = Math.sin(ph);
      const cx = R2 + R1 * ct, cy = R1 * st;
      const x = cx * (cB * cp + sA * sB * sp) - cy * cA * sB;
      const y = cx * (sB * cp - sA * cB * sp) + cy * cA * cB;
      const z = K2 + cA * cx * sp + cy * sA, ooz = 1 / z;
      const xp = Math.floor(cols / 2 + K1 * ooz * x), yp = Math.floor(rows / 2 - K1 * ooz * y * aspect);
      if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) continue;
      const L = cp * ct * sB - cA * ct * sp - sA * st + cB * (cA * st - ct * sA * sp);
      const i = xp + yp * cols;
      if (L > 0 && ooz > zb[i]!) { zb[i] = ooz; out[i] = RAMP[Math.min(RAMP.length - 1, Math.floor(L * 8))]!; }
    }
  }
  return out;
}

/** A word as a banner of '#' (sampled from the text set small). */
function banner(s: string, rows: number): string[] {
  const fam = F.mono(700), px = rows + 2;
  const { x: m } = scratch('read-bm', 4, 4);
  m.font = font(fam, px);
  const cols = Math.ceil(m.measureText(s).width) + 2;
  const { x } = scratch('read-banner', cols, rows);
  x.font = font(fam, px); x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText(s, 1, rows / 2 + 1);
  const d = x.getImageData(0, 0, cols, rows).data;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let l = '';
    for (let c = 0; c < cols; c++) l += d[(r * cols + c) * 4 + 3]! > 120 ? '#' : ' ';
    lines.push(l);
  }
  return lines;
}

export const ascii: Style = {
  n: 21, id: 'ascii', name: 'ASCII art',
  what: 'L’immagine fatta di caratteri: luce e ombra diventano punti, virgole e cancelletti.',
  recipe: 'Fondo nero, un solo font monospazio verde fosforo con un leggero bagliore; una forma 3D (un toro che ruota) campionata su una griglia di caratteri e ombreggiata con la rampa " .,-~:;=!*#$@"; un titolo a banner fatto di #; un prompt che si scrive da solo con il cursore che lampeggia; scanline.',
  palette: { bg: BG, ink: GREEN, accents: [DIM] },
  fonts: { title: F.mono(700), text: F.mono(500) },
  motion: { ease: (u) => u, steps: 30 },
  post: { bloom: 0.5, bloomThreshold: 0.55, halation: 0, ca: 0.6, grain: 0.05, vignette: 0.35 },

  ground(x, _t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(57,255,122,0.035)';
    for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
  },

  title(x, t, s, cx, cy, size) {
    const lines = banner(s, 7), fs = size / 7;
    x.save();
    x.font = font(F.mono(700), fs); x.fillStyle = GREEN; x.textAlign = 'center'; x.shadowColor = GREEN; x.shadowBlur = 6;
    const n = Math.min(lines.length, Math.floor(t * 30));
    for (let r = 0; r < n; r++) x.fillText(lines[r]!, cx, cy - size / 2 + (r + 1) * fs);
    x.restore();
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const fs = Math.round(h / 42), fam = F.mono(500);
    x.font = font(fam, fs);
    const cw = x.measureText('M').width, lh = fs * 1.02;
    const cols = Math.floor((w * 0.94) / cw), rows = Math.floor((h * 0.6) / lh);
    const frame = donut(1 + t * 1.1, 0.5 + t * 0.6, cols, rows, cw / lh);
    x.save();
    x.fillStyle = GREEN; x.shadowColor = GREEN; x.shadowBlur = 5;
    const x0 = (w - cols * cw) / 2, y0 = h * 0.3;
    const on = clamp(t / 0.3);
    for (let r = 0; r < rows; r++) {
      if (r / rows > on) break;
      x.fillText(frame.slice(r * cols, (r + 1) * cols).join(''), x0, y0 + (r + 1) * lh);
    }
    x.restore();
    this.title(x, t, 'ASCII', w / 2, h * 0.15, h * 0.17);
    const cmd = '$ ./donut --ascii';
    const typedN = Math.max(0, Math.min(cmd.length, Math.floor((t - 0.4) * 22)));
    txt(x, cmd.slice(0, typedN), w * 0.06, h * 0.95, fs * 1.1, F.mono(700), GREEN);
    if (t > 0.4 && (typedN < cmd.length || Math.floor(t * 2.5) % 2 === 0)) { // the cursor, blinking once typed
      x.fillStyle = GREEN; x.fillRect(w * 0.06 + typedN * cw * 1.1 + 2, h * 0.95 - fs, cw * 0.9, fs * 1.15);
    }
  },
};
