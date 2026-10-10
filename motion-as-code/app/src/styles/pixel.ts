// 17 · Pixel art: a tiny canvas blown up with no smoothing, a limited palette, stepped animation. A little
// runner jumps a crate under drifting clouds, coins spin, the title is set in hard pixels.
import { type Style, F, font, scratch, stepT, clamp, hash } from './style';

const PAL = {
  sky0: '#29366f', sky1: '#3b5dc9', sky2: '#41a6f6', sky3: '#73eff7', cloud: '#f4f4f4', grass: '#38b764', grass2: '#257179',
  dirt: '#a76b3a', dirt2: '#7a4a28', skin: '#ffcd75', shirt: '#b13e53', pants: '#333c57', ink: '#1a1c2c', coin: '#ffcd75', coin2: '#ef7d57', crate: '#c07a3e', white: '#f4f4f4',
};
const FPS = 10;

/** Text in hard pixels: drawn small, thresholded (no antialiasing), returned as a canvas. */
function pixelText(s: string, px: number, color: string, key = `read-pxt-${color}`) {
  const fam = F.mono(700);
  const { x: m } = scratch('read-pxm', 4, 4);
  m.font = font(fam, px);
  const tw = Math.ceil(m.measureText(s).width) + 2, th = Math.ceil(px * 1.2);
  const { c, x } = scratch(key, tw, th);
  x.font = font(fam, px); x.textBaseline = 'top'; x.fillStyle = color; x.fillText(s, 1, 0);
  const d = x.getImageData(0, 0, tw, th);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < d.data.length; i += 4) {
    const on = d.data[i + 3]! > 110;
    d.data[i] = r!; d.data[i + 1] = g!; d.data[i + 2] = b!; d.data[i + 3] = on ? 255 : 0;
  }
  x.putImageData(d, 0, 0);
  return { c, tw, th };
}

/** The scene at low resolution (gw x gh pixels). */
function scene(o: CanvasRenderingContext2D, t: number, gw: number, gh: number, title: string | null) {
  const ts = stepT(t, FPS), f = Math.floor(t * FPS);
  const bands = [PAL.sky0, PAL.sky1, PAL.sky2, PAL.sky3];
  bands.forEach((c, i) => { o.fillStyle = c; o.fillRect(0, Math.floor((i * gh * 0.62) / 4), gw, Math.ceil(gh * 0.62 / 4) + 1); });
  // clouds drift a pixel at a time
  for (let i = 0; i < 3; i++) {
    const cx = Math.floor(((i * 37 + ts * (3 + i)) % (gw + 30)) - 15), cy = 6 + i * 9;
    o.fillStyle = PAL.cloud;
    o.fillRect(cx, cy, 14, 3); o.fillRect(cx + 3, cy - 2, 7, 2); o.fillRect(cx + 1, cy + 3, 12, 1);
  }
  // ground
  const gy = Math.floor(gh * 0.72);
  o.fillStyle = PAL.grass; o.fillRect(0, gy, gw, 3);
  o.fillStyle = PAL.grass2; o.fillRect(0, gy + 3, gw, 1);
  o.fillStyle = PAL.dirt; o.fillRect(0, gy + 4, gw, gh - gy - 4);
  o.fillStyle = PAL.dirt2;
  for (let i = 0; i < 40; i++) o.fillRect(Math.floor(hash(i, 1) * gw), gy + 6 + Math.floor(hash(i, 2) * (gh - gy - 8)), 2, 1);
  // the crate the runner jumps
  const crx = Math.floor(gw * 0.55);
  o.fillStyle = PAL.ink; o.fillRect(crx - 1, gy - 9, 10, 9);
  o.fillStyle = PAL.crate; o.fillRect(crx, gy - 8, 8, 8);
  o.fillStyle = PAL.ink; o.fillRect(crx, gy - 5, 8, 1); o.fillRect(crx + 3, gy - 8, 1, 8);
  // coins: four-frame spin
  for (let i = 0; i < 3; i++) {
    const cx = Math.floor(gw * (0.3 + i * 0.17)), cy = gy - 20 - (i % 2) * 4, ph = (f + i) % 4;
    const wdt = [5, 3, 1, 3][ph]!;
    o.fillStyle = PAL.coin2; o.fillRect(cx - Math.floor(wdt / 2), cy, wdt, 6);
    o.fillStyle = PAL.coin; if (wdt > 1) o.fillRect(cx - Math.floor(wdt / 2) + 1, cy + 1, Math.max(1, wdt - 2), 4);
  }
  // the runner: crosses the frame, hops over the crate
  const run = (ts * 14) % (gw + 20) - 10, rx = Math.floor(run);
  const d = rx - crx, hop = Math.abs(d) < 12 ? Math.floor(Math.cos((d / 12) * Math.PI / 2) * 11) : 0;
  const ry = gy - 12 - hop, leg = f % 2;
  o.fillStyle = PAL.ink; o.fillRect(rx, ry, 6, 12);
  o.fillStyle = PAL.skin; o.fillRect(rx + 1, ry + 1, 4, 3);
  o.fillStyle = PAL.ink; o.fillRect(rx + 3, ry + 2, 1, 1);
  o.fillStyle = PAL.shirt; o.fillRect(rx + 1, ry + 4, 4, 4);
  o.fillStyle = PAL.pants;
  if (hop) { o.fillRect(rx + 1, ry + 8, 4, 2); } else { o.fillRect(rx + (leg ? 0 : 1), ry + 8, 2, 3); o.fillRect(rx + (leg ? 4 : 3), ry + 8, 2, 3); }
  // the title, in hard pixels with a drop shadow
  if (title) {
    const p = pixelText(title, 11, PAL.white), sh = pixelText(title, 11, PAL.ink);
    const tx = Math.floor((gw - p.tw) / 2), ty = Math.floor(gh * 0.36) - (f % 6 < 3 ? 0 : 1);
    o.drawImage(sh.c, tx + 1, ty + 1); o.drawImage(p.c, tx, ty);
  }
}

export const pixel: Style = {
  n: 17, id: 'pixel', name: 'Pixel art',
  what: 'Pochi pixel ingranditi senza sfumatura, una palette ridotta e animazione a scatti.',
  recipe: 'Disegna a bassissima risoluzione (circa 96 pixel di larghezza) con una palette di 12-16 colori e ingrandisci senza smoothing; niente antialiasing, nemmeno nel testo; animazioni a 8-12 fps con cicli di 2-4 fotogrammi (camminata, monete che girano), movimenti di un pixel alla volta.',
  palette: { bg: PAL.sky1, ink: PAL.ink, accents: [PAL.shirt, PAL.grass, PAL.coin] },
  fonts: { title: F.mono(700), text: F.mono(500) },
  motion: { ease: (u) => Math.floor(u * 6) / 6, steps: FPS },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0, vignette: 0.1 },

  ground(x, t, w, h) {
    const gw = 96, gh = Math.round((96 * h) / w);
    const { c, x: o } = scratch('pixel-ground', gw, gh);
    scene(o, t, gw, gh, null);
    x.save(); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, w, h); x.restore();
  },

  title(x, t, s, cx, cy, size) {
    const p = pixelText(s, 11, PAL.white), k = size / 11;
    x.save(); x.imageSmoothingEnabled = false;
    x.globalAlpha *= clamp(Math.floor(t * FPS) / 3);
    x.drawImage(p.c, cx - (p.tw * k) / 2, cy - (p.th * k) / 2, p.tw * k, p.th * k);
    x.restore();
  },

  tile(x, t, w, h) {
    const gw = 96, gh = Math.round((96 * h) / w);
    const { c, x: o } = scratch('pixel-tile', gw, gh);
    scene(o, t, gw, gh, t > 0.3 ? 'PIXEL ART' : null);
    x.save(); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, w, h); x.restore();
  },
};
