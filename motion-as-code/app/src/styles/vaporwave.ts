// 16 · Vaporwave: pastel pink, lilac and cyan, a striped sunset, a checkerboard floor in perspective, a Greek
// column and a palm, an old operating system window, wide-spaced type; slow, dreamy, a little VHS wobble.
import { type Style, F, font, txt, rr, vgrad, stepT, inn, ease, clamp, hash, TAU } from './style';

const PINK = '#ff71ce', LILAC = '#b967ff', CYAN = '#01cdfe', MINT = '#05ffa1', SUN0 = '#fffb96', GREY = '#c3c3c3', NAVY = '#000080', DEEP = '#3a1060';

function scene(x: CanvasRenderingContext2D, t: number, w: number, h: number) {
  const hz = h * 0.62;
  x.fillStyle = vgrad(x, 0, hz, [[0, LILAC], [0.55, PINK], [1, '#ffb3e6']]);
  x.fillRect(0, 0, w, hz);
  // the sunset, sinking very slowly, cut by bands
  const sr = w * 0.2, sx = w * 0.5, sy = hz - sr * 0.45 + Math.sin(t * 0.3) * 4;
  x.save(); x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.clip();
  x.fillStyle = vgrad(x, sy - sr, sy + sr, [[0, SUN0], [1, PINK]]); x.fillRect(sx - sr, sy - sr, 2 * sr, 2 * sr);
  x.fillStyle = '#ffb3e6';
  for (let i = 0; i < 6; i++) { const y = sy + sr * (0.05 + i * 0.16); x.fillRect(sx - sr, y, 2 * sr, 2 + i * 2.2); }
  x.restore();
  // the floor: a checkerboard in perspective
  x.fillStyle = DEEP; x.fillRect(0, hz, w, h - hz);
  const rows = 12, cols = 16, ph = (t * 0.5) % 1;
  for (let r = 0; r < rows; r++) {
    const z0 = r + ph, z1 = r + 1 + ph;
    const y0 = hz + (h - hz) * (1 / (rows - z0 + 1)) ** 1.2, y1 = hz + (h - hz) * (1 / (rows - z1 + 1)) ** 1.2;
    for (let c = -cols; c < cols; c++) {
      if ((c + r) % 2) continue;
      const k0 = (y0 - hz) / (h - hz), k1 = (y1 - hz) / (h - hz);
      const xa = w / 2 + c * w * 0.012 + c * w * 0.11 * k0, xb = w / 2 + (c + 1) * w * 0.012 + (c + 1) * w * 0.11 * k0;
      const xc = w / 2 + (c + 1) * w * 0.012 + (c + 1) * w * 0.11 * k1, xd = w / 2 + c * w * 0.012 + c * w * 0.11 * k1;
      x.fillStyle = r % 3 === 0 ? CYAN : PINK;
      x.globalAlpha = clamp(k0 * 3) * 0.85;
      x.beginPath(); x.moveTo(xa, y0); x.lineTo(xb, y0); x.lineTo(xc, y1); x.lineTo(xd, y1); x.closePath(); x.fill();
    }
  }
  x.globalAlpha = 1;
  // a Greek column on the left
  const cx = w * 0.13, top = h * 0.3, bot = hz + h * 0.06, cw = w * 0.1;
  x.fillStyle = '#f2e9ff'; x.fillRect(cx - cw / 2, top, cw, bot - top);
  x.strokeStyle = 'rgba(120,80,170,0.45)'; x.lineWidth = 2;
  for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(cx - cw / 2 + (i * cw) / 5, top + 10); x.lineTo(cx - cw / 2 + (i * cw) / 5, bot - 10); x.stroke(); }
  x.fillStyle = '#e4d6ff'; x.fillRect(cx - cw * 0.75, top - h * 0.03, cw * 1.5, h * 0.03); x.fillRect(cx - cw * 0.75, bot, cw * 1.5, h * 0.03);
  // a palm silhouette on the right, swaying
  const px = w * 0.88, py = hz + h * 0.04, sway = Math.sin(t * 0.9) * 0.05;
  x.strokeStyle = DEEP; x.lineWidth = w * 0.018; x.lineCap = 'round';
  x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px - w * 0.02, py - h * 0.2, px - w * 0.05 + sway * 100, py - h * 0.36); x.stroke();
  const tx = px - w * 0.05 + sway * 100, ty = py - h * 0.36;
  x.fillStyle = DEEP;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + sway;
    x.save(); x.translate(tx, ty); x.rotate(a);
    x.beginPath(); x.ellipse(w * 0.09, 0, w * 0.1, h * 0.018, 0.25, 0, TAU); x.fill();
    x.restore();
  }
}

/** An old OS window with a title bar: `body` draws inside it. */
function win(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, title: string, body: () => void) {
  x.fillStyle = GREY; x.fillRect(x0, y0, w, h);
  x.fillStyle = '#ffffff'; x.fillRect(x0, y0, w, 3); x.fillRect(x0, y0, 3, h);
  x.fillStyle = '#5a5a5a'; x.fillRect(x0, y0 + h - 3, w, 3); x.fillRect(x0 + w - 3, y0, 3, h);
  const tb = h * 0.17;
  const g = x.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, NAVY); g.addColorStop(1, '#1084d0');
  x.fillStyle = g; x.fillRect(x0 + 6, y0 + 6, w - 12, tb);
  txt(x, title, x0 + 16, y0 + 6 + tb * 0.72, tb * 0.6, F.archivo(100, 700), '#ffffff');
  for (let i = 0; i < 3; i++) {
    const bx = x0 + w - 12 - (i + 1) * (tb * 0.85);
    x.fillStyle = GREY; x.fillRect(bx, y0 + 9, tb * 0.75, tb - 6);
    x.fillStyle = '#5a5a5a'; x.fillRect(bx + tb * 0.75 - 2, y0 + 9, 2, tb - 6); x.fillRect(bx, y0 + 9 + tb - 8, tb * 0.75, 2);
  }
  x.fillStyle = '#ffffff'; x.fillRect(x0 + 8, y0 + 12 + tb, w - 16, h - tb - 20);
  x.save(); x.beginPath(); x.rect(x0 + 8, y0 + 12 + tb, w - 16, h - tb - 20); x.clip(); body(); x.restore();
}

export const vaporwave: Style = {
  n: 16, id: 'vaporwave', name: 'Vaporwave',
  what: 'Rosa, lilla e azzurro pastello, tramonto a strisce, colonne greche e finestre di un vecchio sistema operativo.',
  recipe: 'Cielo in gradiente lilla-rosa, sole a strisce giallo-rosa, pavimento a scacchiera in prospettiva rosa e ciano, una colonna greca e una palma in silhouette, una finestra grigia stile anni Novanta con barra del titolo blu; testo spaziatissimo (A E S T H E T I C); movimento lento e sognante con un leggero tremolio da VHS e scanline.',
  palette: { bg: LILAC, ink: '#ffffff', accents: [PINK, CYAN, MINT, SUN0] },
  fonts: { title: F.archivo(125, 700), text: F.archivo(100, 700) },
  motion: { ease: ease.inOutCubic, steps: 0 },
  post: { bloom: 0.35, bloomThreshold: 0.85, halation: 0.2, ca: 1.5, grain: 0.06, vignette: 0.25 },

  ground(x, t, w, h) { scene(x, t, w, h); },

  title(x, t, s, cx, cy, size) {
    const k = inn(t, 0, 0.9, ease.inOutCubic);
    const spaced = s.toUpperCase().split('').join(' ');
    txt(x, spaced, cx + 3, cy + size * 0.35 + 3, size, F.archivo(125, 700), PINK, { align: 'center', alpha: k });
    txt(x, spaced, cx, cy + size * 0.35, size, F.archivo(125, 700), '#ffffff', { align: 'center', alpha: k });
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    // the window opens in steps, like an old machine
    const ts = stepT(t, 10), k = clamp((ts - 0.2) / 0.4);
    if (k > 0) {
      const ww = w * 0.66 * (0.6 + 0.4 * k), wh = h * 0.3 * (0.6 + 0.4 * k), x0 = w / 2 - ww / 2, y0 = h * 0.12;
      win(x, x0, y0, ww, wh, 'vaporwave.exe', () => {
        const size = wh * 0.17;
        x.font = font(F.archivo(125, 700), size);
        txt(x, 'A E S T H E T I C', x0 + ww / 2 + 3, y0 + wh * 0.62 + 3, size, F.archivo(125, 700), CYAN, { align: 'center' });
        txt(x, 'A E S T H E T I C', x0 + ww / 2, y0 + wh * 0.62, size, F.archivo(125, 700), PINK, { align: 'center' });
        rr(x, x0 + ww * 0.35, y0 + wh * 0.72, ww * 0.3, wh * 0.14, 2);
        x.fillStyle = GREY; x.fill();
        txt(x, 'OK', x0 + ww / 2, y0 + wh * 0.83, wh * 0.08, F.archivo(100, 700), '#000000', { align: 'center' });
      });
    }
    this.title(x, t - 0.6, 'vaporwave', w * 0.5, h * 0.56, h * 0.055);
    // VHS: now and then a tracking line rolls through, scanlines over it all
    const f = Math.floor(t * 12);
    if (hash(f, 3) > 0.7) {
      const by = hash(f, 4) * h, bh = 6 + hash(f, 5) * 20;
      x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillRect(0, by, w, 2);
      x.fillStyle = 'rgba(1,205,254,0.18)'; x.fillRect(0, by + 2, w, bh);
    }
    x.fillStyle = 'rgba(40,0,60,0.08)';
    for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
  },
};
