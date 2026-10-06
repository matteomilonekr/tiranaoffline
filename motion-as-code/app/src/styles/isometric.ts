// 18 · Isometric: a little city of blocks on a 30-degree grid, no vanishing point. The blocks rise out of the
// ground one after another, three tones per block (top, left, right); the title lies on the ground plane.
import { type Style, F, font, ease, clamp, hash } from './style';

const BG = '#eef1fb', GRID = '#d6dcf2', TOP = '#ffffff', LEFT = '#a5b4fc', RIGHT = '#6366f1', INK = '#1e1b4b', ORANGE = ['#fed7aa', '#fb923c', '#ea580c'];
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;

/** Ground point (i, j) at height z to screen, for a tile size s around origin (ox, oy). */
const iso = (ox: number, oy: number, s: number, i: number, j: number, z = 0): [number, number] =>
  [ox + (i - j) * s * C30, oy + (i + j) * s * S30 - z * s];

function block(x: CanvasRenderingContext2D, ox: number, oy: number, s: number, i: number, j: number, hgt: number, cols: string[]) {
  const p = (a: number, b: number, z: number) => iso(ox, oy, s, a, b, z);
  const face = (pts: [number, number][], c: string) => {
    x.beginPath(); pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
    x.fillStyle = c; x.fill(); x.lineWidth = 1.2; x.strokeStyle = 'rgba(30,27,75,0.25)'; x.stroke();
  };
  face([p(i, j + 1, 0), p(i + 1, j + 1, 0), p(i + 1, j + 1, hgt), p(i, j + 1, hgt)], cols[1]!); // left face (towards the viewer, left)
  face([p(i + 1, j, 0), p(i + 1, j + 1, 0), p(i + 1, j + 1, hgt), p(i + 1, j, hgt)], cols[2]!); // right face
  face([p(i, j, hgt), p(i + 1, j, hgt), p(i + 1, j + 1, hgt), p(i, j + 1, hgt)], cols[0]!); // top
}

export const isometric: Style = {
  n: 18, id: 'isometric', name: 'Isometric',
  what: 'Un mondo di blocchi su una griglia a 30 gradi, senza punto di fuga.',
  recipe: 'Proiezione isometrica (assi a 30 gradi, niente prospettiva) su una griglia chiara; blocchi con tre toni fissi per faccia (alto chiaro, sinistra media, destra scura) e un colore d’accento; i blocchi crescono dal suolo uno dopo l’altro con overshoot, dal centro verso l’esterno; testo posato sul piano del terreno.',
  palette: { bg: BG, ink: INK, accents: [RIGHT, LEFT, ORANGE[1]!] },
  fonts: { title: F.archivo(100, 900), text: F.archivo(100, 500) },
  motion: { ease: (u) => ease.outBack(u, 1.6), steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.015, vignette: 0.08 },

  ground(x, _t, w, h) {
    x.fillStyle = BG; x.fillRect(0, 0, w, h);
    const s = w / 14, ox = w / 2, oy = h * 0.1;
    x.strokeStyle = GRID; x.lineWidth = 1;
    for (let k = -14; k <= 14; k++) {
      const [ax, ay] = iso(ox, oy, s, k, -2), [bx, by] = iso(ox, oy, s, k, 20);
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      const [cx, cy] = iso(ox, oy, s, -2, k), [dx, dy] = iso(ox, oy, s, 20, k);
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(dx, dy); x.stroke();
    }
  },

  title(x, t, s, cx, cy, size) {
    // laid on the ground plane: the text runs along the i axis
    const k = ease.outCubic(clamp(t / 0.6));
    x.save();
    x.setTransform(x.getTransform().multiply(new DOMMatrix([C30, S30, -C30, S30, cx, cy])));
    x.font = font(F.archivo(100, 900), size); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.globalAlpha *= k;
    x.fillStyle = 'rgba(30,27,75,0.18)'; x.fillText(s, 4, 4 + (1 - k) * size);
    x.fillStyle = INK; x.fillText(s, 0, (1 - k) * size);
    x.restore();
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const s = w / 14, ox = w / 2, oy = h * 0.1;
    // a 5 x 5 city; heights from a hash, a few orange blocks; drawn back to front
    const cells: [number, number, number, boolean][] = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if (hash(i, j, 3) < 0.2) continue;
      cells.push([i + 2, j + 2, 1 + Math.floor(hash(i, j, 4) * 4), hash(i, j, 5) > 0.8]);
    }
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [i, j, hz, accent] of cells) {
      const d = Math.hypot(i - 4, j - 4), k = ease.outBack(clamp((t - 0.05 - d * 0.1) / 0.45), 1.6);
      if (k <= 0) continue;
      block(x, ox, oy, s, i, j, hz * k * 0.9, accent ? ORANGE : [TOP, LEFT, RIGHT]);
    }
    // a tree: a cone on a trunk, at the corner
    const [tx, ty] = iso(ox, oy, s, 8.5, 2.5, 0), tk = ease.outBack(clamp((t - 0.6) / 0.4));
    if (tk > 0) {
      x.fillStyle = '#7c5a3a'; x.fillRect(tx - 4, ty - s * 0.5 * tk, 8, s * 0.5 * tk);
      x.fillStyle = '#34d399'; x.beginPath(); x.moveTo(tx, ty - s * 1.6 * tk); x.lineTo(tx + s * 0.45, ty - s * 0.45 * tk); x.lineTo(tx - s * 0.45, ty - s * 0.45 * tk); x.closePath(); x.fill();
    }
    // the title on the ground in front
    this.title(x, t - 0.55, 'ISOMETRIC', ...iso(ox, oy, s, 9.5, 9.5), s * 0.85);
  },
};
