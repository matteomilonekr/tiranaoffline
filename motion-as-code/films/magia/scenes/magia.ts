// The whole of `magia`, one plate: what motion design does for a brand, in the format of @wecreate's reel, in Italian.
// A narrator's six sentences cut thirteen shots on their words, each a generated object (images/, made on this machine
// by analysis/imagegen.py: no brand, no logo) set in kinetic type: a brain in an orbit, products on green tiles, a
// marble pegasus over neon "Magia", a marble hand touching "Design", a TV on a green floor, a red bar, words that
// stretch, an eye rolling onto a card, a butterfly in a black panel, a word and its reflection, a diamond on a column,
// a chess knight that moves. The objects are generated; everything else (type, grounds, floors, panels, light) is drawn.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT, W, H } from '@kit/engine/gl';
import { F, font, layout } from '@kit/engine/type';
import type { Lyrics } from '@kit/engine/lyrics';
import { clamp, hash, lerp, TAU } from '@kit/engine/util';
import { E, spring } from '@kit/fx';
import { rr } from '@kit/fx/ui';

const RED = '#c8141e', GREEN = '#1d6249', GREEN_D = '#0f3d2d', INK = '#151515', NEON = '#b8ff2e';
const COND = F.archivo(62, 900), SANS = (w = 600) => F.archivo(100, w);
const IMAGES = ['brain', 'sneaker', 'console', 'phone', 'cup', 'pegasus', 'hand', 'tv', 'eye', 'butterfly', 'diamond', 'column', 'knight'] as const;
type Img = (typeof IMAGES)[number];
// the TV's blank screen, as fractions of its image (measured on images/tv.png)
const SCREEN = { x: 0.345, y: 0.168, w: 0.465, h: 0.44 };
const CREDIT = ['Matteo Milone', 'Tutti i diritti riservati'];

const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function T(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, col: string, align: CanvasTextAlign = 'center', alpha = 1) {
  if (alpha <= 0.005) return;
  x.save(); x.globalAlpha *= alpha; x.font = font(fam, size); x.fillStyle = col; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(s, px, py); x.restore();
}

/** A word that lands: from 1.35x and a blur to its place, over d seconds from t0. */
function land(x: CanvasRenderingContext2D, t: number, t0: number, draw: () => void, cx: number, cy: number, o: { d?: number; from?: number; dx?: number; dy?: number } = {}) {
  const u = clamp((t - t0) / (o.d ?? 0.32));
  if (u <= 0) return;
  const e = E('expo.out')(u), s = lerp(o.from ?? 1.35, 1, e);
  x.save();
  x.globalAlpha *= clamp(u * 3);
  x.translate(cx + (1 - e) * (o.dx ?? 0), cy + (1 - e) * (o.dy ?? 0)); x.scale(s, s); x.translate(-cx, -cy);
  if (e < 0.98) x.filter = `blur(${((1 - e) * 14).toFixed(1)}px)`;
  draw();
  x.restore();
}

type Shot = { name: string; t0: number };

export default class Magia extends Scene {
  layer = new Layer2D();
  img = {} as Record<Img, ImageBitmap>;
  ly!: Lyrics;
  w: Record<string, number> = {};
  shots: Shot[] = [];
  end = 0;

  override async init() {
    await Promise.all(IMAGES.map(async (n) => { this.img[n] = await createImageBitmap(await (await fetch(`images/${n}.png`)).blob()); }));
    const ly = (this.ly = this.ctx.lyrics);
    const at = (q: string, after = 0) => {
      const w = ly.words.find((w) => key(w.w) === key(q) && w.start >= after - 1e-6);
      if (!w) throw new Error(`word not found: ${q} after ${after}`);
      return w.start;
    };
    const line = (i: number) => ly.lines[i]!.words[0]!.start;
    const w = this.w;
    w.ti = at('Ti'); w.chiesto = at('chiesto'); w.perche = at('perché'); w.certi = at('certi'); w.brand = at('brand'); w.ti2 = at('ti', w.brand); w.restano = at('restano'); w.testa = at('testa');
    w.non1 = line(1); w.magia = at('magia'); w.e2 = line(2); w.motion = at('motion', line(2)); w.design = at('design', line(2));
    w.l3 = line(3); w.emozione = at('emozione'); w.messaggio = at('messaggio');
    w.l4 = line(4); w.cinetico = at('cinetico'); w.cattura = at('cattura'); w.attenzione = at('lattenzione'); w.due = at('due'); w.secondi = at('secondi');
    w.l5 = line(5); w.visive = at('visive'); w.spiegano = at('spiegano'); w.senza = at('senza'); w.parola = at('parola');
    w.l6 = line(6); w.decorazione = at('decorazione'); w.l7 = line(7); w.strategia = at('strategia'); w.muove = at('muove');
    const last = ly.lines[ly.lines.length - 1]!;
    this.end = last.end;
    const lead = 0.12;
    this.shots = [
      { name: 'domanda', t0: 0 }, { name: 'brand', t0: w.perche - 0.08 }, { name: 'testa', t0: w.ti2 - lead },
      { name: 'magia', t0: w.non1 - lead }, { name: 'design', t0: w.e2 - lead }, { name: 'tv', t0: w.l3 - lead },
      { name: 'emozione', t0: w.emozione - 0.18 }, { name: 'cinetico', t0: w.l4 - lead }, { name: 'attenzione', t0: w.cattura - lead },
      { name: 'metafore', t0: w.l5 - lead }, { name: 'parola', t0: w.senza - lead }, { name: 'decorazione', t0: w.l6 - lead },
      { name: 'strategia', t0: w.l7 - lead }, { name: 'fine', t0: last.end + 0.55 },
    ];
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out);
    const L = this.layer;
    L.clear('#000000');
    const x = L.ctx;
    let i = 0;
    while (i < this.shots.length - 1 && t >= this.shots[i + 1]!.t0) i++;
    const s = this.shots[i]!, lt = t - s.t0, next = this.shots[i + 1]?.t0 ?? Infinity;
    const fn = (this as unknown as Record<string, (x: CanvasRenderingContext2D, t: number, lt: number, dur: number) => void>)[s.name]!;
    x.save();
    fn.call(this, x, t, lt, next - s.t0);
    x.restore();
    // every cut lands with a short white flash of exposure
    const cu = lt / 0.12;
    if (i > 0 && cu < 1) { x.save(); x.globalAlpha = 0.18 * (1 - cu); x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.restore(); }
    comp.draw(renderer, L.upload(), out);
    return { bloom: 0.25, bloomThreshold: 0.75, halation: 0.05, ca: 0.0, grain: 0.05, vignette: 0.25, hud: 0 };
  }

  // grounds ------------------------------------------------------------------------------------------------------

  light(x: CanvasRenderingContext2D) {
    const g = x.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.45, H * 0.75);
    g.addColorStop(0, '#f5f5f4'); g.addColorStop(0.6, '#dcdcdb'); g.addColorStop(1, '#9e9e9d');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }

  dark(x: CanvasRenderingContext2D, t: number) {
    const g = x.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.5, H * 0.72);
    g.addColorStop(0, '#1d5a44'); g.addColorStop(0.55, '#0e3528'); g.addColorStop(1, '#03130d');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // a worn texture: specks and scratches, still
    x.save();
    for (let k = 0; k < 260; k++) {
      const px = hash(k, 1) * W, py = hash(k, 2) * H, r = 0.8 + hash(k, 3) * 2.2;
      x.globalAlpha = 0.05 + hash(k, 4) * 0.08;
      x.fillStyle = hash(k, 5) > 0.5 ? '#ffffff' : '#000000';
      x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    }
    x.restore();
    // a slow drift of light
    const gx = W * (0.5 + 0.2 * Math.sin(t * 0.7));
    const l = x.createRadialGradient(gx, H * 0.4, 10, gx, H * 0.4, 600);
    l.addColorStop(0, 'rgba(120,255,190,0.07)'); l.addColorStop(1, 'rgba(120,255,190,0)');
    x.fillStyle = l; x.fillRect(0, 0, W, H);
  }

  floor(x: CanvasRenderingContext2D, y: number, col = GREEN) {
    const g = x.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, col); g.addColorStop(1, '#0c3123');
    x.fillStyle = g; x.fillRect(0, y, W, H - y);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, y, W, 2);
  }

  /** An image centred on cx, cy, h tall (or w wide if h is 0), with a soft drop shadow. */
  put(x: CanvasRenderingContext2D, n: Img, cx: number, cy: number, h: number, o: { w?: number; rot?: number; alpha?: number; shadow?: number; blur?: number } = {}) {
    const im = this.img[n];
    const hh = h || ((o.w ?? 100) * im.height) / im.width, ww = h ? (h * im.width) / im.height : o.w ?? 100;
    x.save();
    x.globalAlpha *= o.alpha ?? 1;
    x.translate(cx, cy); if (o.rot) x.rotate(o.rot);
    if (o.blur && o.blur > 0.3) x.filter = `blur(${o.blur.toFixed(1)}px)`;
    if (o.shadow) { x.shadowColor = `rgba(0,0,0,${o.shadow})`; x.shadowBlur = 40; x.shadowOffsetY = 24; }
    x.drawImage(im, -ww / 2, -hh / 2, ww, hh);
    x.restore();
    return { w: ww, h: hh };
  }

  /** An image fitted inside a box bw x bh centred on cx, cy. */
  fit(x: CanvasRenderingContext2D, n: Img, cx: number, cy: number, bw: number, bh: number, shadow = 0.25) {
    const im = this.img[n], s = Math.min(bw / im.width, bh / im.height);
    return this.put(x, n, cx, cy, im.height * s, { shadow });
  }

  /** A slow push-in for the whole shot. */
  push(x: CanvasRenderingContext2D, lt: number, k = 0.035, cx = W / 2, cy = H / 2) {
    const s = 1 + k * lt;
    x.translate(cx, cy); x.scale(s, s); x.translate(-cx, -cy);
  }

  // shots -------------------------------------------------------------------------------------------------------------

  domanda(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    // big soft dots drifting across, out of focus
    for (let k = 0; k < 5; k++) {
      const a = t * (0.5 + k * 0.13) + k * 1.7, r = 26 + 14 * hash(k, 9);
      const px = W / 2 + Math.cos(a) * (430 + 60 * k), py = 780 + Math.sin(a * 1.2) * (520 - 40 * k);
      x.save(); x.filter = `blur(${(6 + k * 2).toFixed(0)}px)`; x.fillStyle = 'rgba(20,20,20,0.85)'; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); x.restore();
    }
    this.push(x, lt, 0.03, W / 2, 780);
    const cx = W / 2, cy = 800;
    // the orbit: a thin ring with four dots going round
    const ou = E('expo.out')(clamp((lt - 0.05) / 0.6));
    x.save(); x.globalAlpha = ou; x.strokeStyle = 'rgba(30,30,30,0.55)'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(cx, cy, 340 * lerp(0.6, 1, ou), 0, TAU); x.stroke();
    for (let k = 0; k < 4; k++) {
      const a = t * 0.9 + (k * TAU) / 4 + 0.4;
      x.fillStyle = '#121212'; x.beginPath(); x.arc(cx + Math.cos(a) * 340 * lerp(0.6, 1, ou), cy + Math.sin(a) * 340 * lerp(0.6, 1, ou), 16, 0, TAU); x.fill();
    }
    x.restore();
    const d = spring(t, 0.0, { settle: 0.5, overshoot: 0.08 });
    x.save(); x.translate(cx, cy); x.scale(d, d);
    x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 40; x.shadowOffsetY = 18;
    x.fillStyle = GREEN; x.beginPath(); x.arc(0, 0, 175, 0, TAU); x.fill();
    x.restore();
    const b = spring(t, 0.12, { settle: 0.55, overshoot: 0.1 });
    this.put(x, 'brain', cx + 6, cy + 4, 260 * b, { rot: Math.sin(t * 1.6) * 0.06, shadow: 0.3 });
    // the question, word by word, over the top of the disc
    const w = this.w;
    land(x, t, w.ti - 0.05, () => T(x, 'TI SEI MAI', cx, 560, 150, COND, RED), cx, 510);
    land(x, t, w.chiesto - 0.05, () => T(x, 'CHIESTO?', cx, 695, 150, COND, RED), cx, 645);
  }

  brand(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    // the tiles come up from below, tilted, with a whip blur
    const u = E('expo.out')(clamp(lt / 0.55));
    const oy = (1 - u) * 900;
    x.save();
    x.translate(W / 2, 740 + oy); x.rotate(lerp(-0.25, -0.06, u)); x.transform(1, 0, lerp(-0.25, -0.1, u), 1, 0, 0); x.scale(1 + 0.03 * lt, 1 + 0.03 * lt);
    if (u < 0.95) x.filter = `blur(${((1 - u) * 18).toFixed(1)}px)`;
    const items: Img[] = ['sneaker', 'console', 'phone', 'cup'];
    items.forEach((n, k) => {
      const c = k % 2, r = Math.floor(k / 2), s = 310, gx = (c - 0.5) * (s + 46), gy = (r - 0.5) * (s + 46);
      const pu = spring(t, this.shots[1]!.t0 + 0.1 + k * 0.06, { settle: 0.5, overshoot: 0.08 });
      x.save(); x.translate(gx, gy); x.scale(pu, pu);
      x.fillStyle = '#0f3a2b'; rr(x, -s / 2 + 18, -s / 2 + 22, s, s, 34); x.fill();
      x.save(); x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 40; x.shadowOffsetY = 26;
      x.fillStyle = GREEN; rr(x, -s / 2, -s / 2, s, s, 34); x.fill(); x.restore();
      const g = x.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
      x.fillStyle = g; rr(x, -s / 2, -s / 2, s, s, 34); x.fill();
      this.fit(x, n, 0, 0, s * 0.78, s * 0.78);
      x.restore();
    });
    x.restore();
    // the words come up through a mask at the bottom
    const wu = E('expo.out')(clamp((t - this.w.brand + 0.15) / 0.4));
    x.save(); x.beginPath(); x.rect(0, 1150, W, 330); x.clip();
    T(x, 'CERTI BRAND', W / 2, 1420 + (1 - wu) * 300, 230, COND, RED);
    x.restore();
  }

  testa(x: CanvasRenderingContext2D, t: number, lt: number, dur: number) {
    this.light(x);
    const out = E('power2.in')(clamp((lt - (dur - 0.3)) / 0.3));
    x.save();
    x.translate(W / 2, 900); x.rotate(-0.5 * out); x.scale(1 + 0.4 * out, 1 + 0.4 * out); x.translate(-W / 2, -900);
    if (out > 0.02) x.filter = `blur(${(out * 16).toFixed(1)}px)`;
    land(x, t, this.w.restano - 0.1, () => T(x, 'Ti restano', W / 2, 840, 108, SANS(600), INK), W / 2, 800);
    // the brain drops in from the top, with a bounce, and keeps turning a little
    const d = spring(t, this.w.restano - 0.2, { settle: 0.6, overshoot: 0.12 });
    const by = lerp(-400, 1090, d), vel = Math.abs(1 - d);
    this.put(x, 'brain', W / 2 + 10, by, 330, { rot: -0.2 + 0.2 * d + Math.sin(t * 2) * 0.04, shadow: 0.35, blur: vel > 0.15 ? vel * 20 : 0 });
    land(x, t, this.w.testa - 0.12, () => T(x, 'in testa?', W / 2 + 20, 960, 112, SANS(700), GREEN_D), W / 2, 930);
    x.restore();
  }

  magia(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.dark(x, t);
    this.push(x, lt, 0.03);
    // the pegasus sweeps in from the top right
    const p = E('expo.out')(clamp(lt / 0.8));
    this.put(x, 'pegasus', lerp(1150, 640, p), lerp(150, 660, p) + Math.sin(t * 1.4) * 10, 720, { rot: lerp(0.4, -0.03, p), shadow: 0.5, blur: (1 - p) * 20 });
    land(x, t, this.w.non1, () => T(x, 'non è', 270, 1120, 100, SANS(600), '#f4f4f2'), 270, 1080);
    // the neon word flickers on
    const m = this.w.magia - 0.05;
    if (t >= m) {
      const fl = lt < 0 ? 0 : [0.08, 0.16, 0.22].some((k) => t > m + k && t < m + k + 0.04) ? 0.35 : 1;
      x.save();
      x.globalAlpha *= fl * clamp((t - m) / 0.06);
      x.shadowColor = 'rgba(160,255,40,0.9)'; x.shadowBlur = 50;
      T(x, 'Magia', 600, 1420, 300, F.script(), NEON);
      x.shadowBlur = 16; T(x, 'Magia', 600, 1420, 300, F.script(), '#efffc4');
      x.restore();
    }
  }

  design(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.dark(x, t);
    this.push(x, lt, 0.025);
    land(x, t, this.w.motion - 0.1, () => {
      x.save(); x.shadowColor = 'rgba(255,30,30,0.8)'; x.shadowBlur = 40; T(x, 'Motion', W / 2, 640, 170, SANS(900), '#e8202a'); x.restore();
    }, W / 2, 600);
    land(x, t, this.w.design - 0.1, () => T(x, 'Design', W / 2 + 10, 860, 240, F.hand(), '#f2f2ee'), W / 2, 800);
    // the marble hand rises until its finger touches the word
    const h = spring(t, this.w.design - 0.25, { settle: 0.7, overshoot: 0.03 });
    this.put(x, 'hand', W / 2 + 30, lerp(2300, 1380, h), 1050, { rot: 0.05, shadow: 0.5 });
    const tu = (t - this.w.design - 0.35) / 0.6;
    if (tu > 0 && tu < 1) {
      x.save(); x.globalAlpha = 1 - tu; x.strokeStyle = '#ffffff'; x.lineWidth = 3;
      x.beginPath(); x.arc(W / 2 + 10, 880, 30 + 160 * E('expo.out')(tu), 0, TAU); x.stroke(); x.restore();
    }
  }

  tv(x: CanvasRenderingContext2D, _t: number, lt: number) {
    this.light(x);
    this.floor(x, 1180);
    // the TV slides in from the left and lands on the floor, then the camera eases back
    const u = E('expo.out')(clamp(lt / 0.6));
    const back = 1 - 0.12 * E('sine.inOut')(clamp((lt - 0.6) / 1.4));
    x.save();
    x.translate(W / 2, 1180); x.scale(back, back); x.translate(-W / 2, -1180);
    const im = this.img.tv, tw = 760, th = (tw * im.height) / im.width;
    const cx = lerp(-500, W / 2, u), cy = 1180 - th / 2 + 60;
    this.put(x, 'tv', cx, cy, th, { shadow: 0.4, blur: (1 - u) * 22 });
    // what's on its screen
    const sx = cx - tw / 2 + SCREEN.x * tw, sy = cy - th / 2 + SCREEN.y * th, sw = SCREEN.w * tw, sh = SCREEN.h * th;
    x.save(); rr(x, sx, sy, sw, sh, 18); x.clip();
    x.fillStyle = '#f7f6f1'; x.fillRect(sx, sy, sw, sh);
    const on = clamp((lt - 0.35) / 0.15);
    const ds = Math.min(sh * 0.3, (sw * 0.8 * 100) / layout('Design', SANS(900), 100).width);
    T(x, 'Motion', sx + sw * 0.1, sy + sh * 0.44, ds * 0.78, SANS(600), INK, 'left', on);
    T(x, 'Design', sx + sw * 0.1, sy + sh * 0.44 + ds * 1.0, ds, SANS(900), RED, 'left', on);
    // scanlines
    x.fillStyle = 'rgba(0,0,0,0.05)';
    for (let yy = sy; yy < sy + sh; yy += 6) x.fillRect(sx, yy, sw, 2);
    x.restore();
    x.restore();
  }

  emozione(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    // the green block bottom-left and the red bar sweeping down on the right
    const g = E('expo.out')(clamp(lt / 0.5));
    x.fillStyle = GREEN; x.fillRect(0, 1250, lerp(0, 640, g), H - 1250);
    const r = E('expo.out')(clamp(lt / 0.45));
    x.fillStyle = RED; x.fillRect(W - 230, 0, 230, lerp(0, 840, r));
    land(x, t, this.w.emozione - 0.05, () => T(x, 'Emozione', W / 2, 960, 200, F.script(), INK), W / 2, 900, { dx: 140, from: 1.1 });
    land(x, t, this.w.emozione + 0.35, () => T(x, 'al tuo', W / 2 - 150, 1040, 60, SANS(500), INK), W / 2 - 150, 1020, { dx: 100, from: 1.1 });
    land(x, t, this.w.messaggio - 0.08, () => T(x, 'messaggio', W / 2 + 80, 1150, 130, SANS(800), RED), W / 2 + 80, 1110, { dx: 120, from: 1.1 });
  }

  cinetico(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    this.push(x, lt, 0.04);
    // "Testo" squeezes from wide to condensed as it lands: the word itself moves
    const k = spring(t, this.w.l4, { settle: 0.7, overshoot: 0.05 });
    const widths = [125, 112.5, 100, 87.5, 75, 62];
    const wi = Math.min(widths.length - 1, Math.round(k * (widths.length - 1)));
    const fam = F.archivo(widths[wi]!, 900);
    const size = 250;
    land(x, t, this.w.l4 - 0.05, () => T(x, 'Testo', W / 2, 930, size, fam, GREEN), W / 2, 860, { from: 1.2 });
    // a red bar sweeps through it
    const bu = E('power3.inOut')(clamp((t - this.w.cinetico + 0.1) / 0.45));
    if (bu > 0) {
      const tw = layout('Testo', fam, size).width;
      x.fillStyle = RED;
      x.globalCompositeOperation = 'multiply';
      x.fillRect(W / 2 - tw / 2 - 30, 850, (tw + 60) * bu, 44);
      x.globalCompositeOperation = 'source-over';
    }
    land(x, t, this.w.cinetico - 0.05, () => T(x, 'cinetico', W / 2 + 20, 1110, 210, F.hand(), INK), W / 2, 1060, { dy: 60 });
  }

  attenzione(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    this.push(x, lt, 0.03);
    // the green card, tilted, with depth
    const c = spring(t, this.shots[8]!.t0, { settle: 0.55, overshoot: 0.05 });
    const cx = 610, cy = 860, s = 600 * c;
    x.save(); x.translate(cx, cy); x.rotate(-0.05);
    x.fillStyle = '#0f3a2b'; x.fillRect(-s / 2 + 22, -s / 2 + 26, s, s);
    x.save(); x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 50; x.shadowOffsetY = 30; x.fillStyle = GREEN; x.fillRect(-s / 2, -s / 2, s, s); x.restore();
    x.restore();
    land(x, t, this.w.cattura - 0.02, () => T(x, 'Cattura', 450, cy - 10, 86, SANS(900), RED, 'left'), 640, cy - 40);
    land(x, t, this.w.attenzione - 0.05, () => T(x, 'l’attenzione', 450, cy + 95, 92, F.hand(), '#071f16', 'left'), 660, cy + 60);
    // the eye rolls in from the left and stops at the card's edge, looking at you
    const e = spring(t, this.shots[8]!.t0 + 0.1, { settle: 0.75, overshoot: 0.06 });
    const ex = lerp(-300, 300, e), rot = (ex - 300) / 120;
    this.put(x, 'eye', ex, cy + 30, 250, { rot, shadow: 0.35 });
    land(x, t, this.w.due - 0.08, () => { T(x, 'in', 330, 1290, 66, SANS(500), INK, 'left'); T(x, 'due secondi', 400, 1290, 66, SANS(700), INK, 'left'); }, 540, 1270, { dy: 40 });
  }

  metafore(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    land(x, t, this.w.l5 - 0.05, () => T(x, 'Metafore', W / 2, 330, 170, SANS(800), GREEN_D), W / 2, 280);
    land(x, t, this.w.visive - 0.05, () => T(x, 'visive', W / 2 + 160, 420, 96, SANS(700), INK), W / 2 + 160, 390);
    // the black panel, standing out of the page, the butterfly inside it
    const p = E('expo.out')(clamp((lt - 0.05) / 0.7));
    const pw = 580, ph = 920, px = W / 2 - pw / 2 + 40 + (1 - p) * 700, py = 480;
    x.save();
    if (p < 0.97) x.filter = `blur(${((1 - p) * 16).toFixed(1)}px)`;
    // its depth on the left
    const dg = x.createLinearGradient(px - 90, 0, px, 0);
    dg.addColorStop(0, 'rgba(255,255,255,0)'); dg.addColorStop(1, 'rgba(60,60,60,0.85)');
    x.fillStyle = dg;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px - 90, py + 110); x.lineTo(px - 90, py + ph + 60); x.lineTo(px, py + ph); x.closePath(); x.fill();
    x.save(); x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 60; x.shadowOffsetY = 30;
    x.fillStyle = '#050505'; x.fillRect(px, py, pw, ph); x.restore();
    x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();
    const im = this.img.butterfly, sc = Math.max(pw / im.width, ph / im.height) * (1.04 + 0.04 * lt);
    x.drawImage(im, px + pw / 2 - (im.width * sc) / 2, py + ph / 2 - (im.height * sc) / 2, im.width * sc, im.height * sc);
    x.restore();
    x.restore();
    land(x, t, this.w.spiegano - 0.05, () => T(x, 'spiegano idee complesse', W / 2, 1520, 74, SANS(700), RED), W / 2, 1490, { dy: 40 });
  }

  parola(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    this.push(x, lt, 0.03);
    land(x, t, this.w.senza - 0.05, () => T(x, 'senza una sola', W / 2, 720, 84, SANS(700), INK), W / 2, 690);
    const pu = clamp((t - this.w.parola + 0.08) / 0.35);
    if (pu > 0) {
      const e = E('expo.out')(pu), s = lerp(1.5, 1, e);
      x.save(); x.translate(W / 2, 960); x.scale(s, s); x.translate(-W / 2, -960);
      if (e < 0.98) x.filter = `blur(${((1 - e) * 16).toFixed(1)}px)`;
      x.globalAlpha = clamp(pu * 3);
      T(x, 'PAROLA', W / 2, 1060, 340, COND, RED);
      // its reflection, fading down
      x.save(); x.translate(0, 2 * 1060 + 10); x.scale(1, -1); x.globalAlpha *= 0.45;
      x.filter = 'blur(3px)';
      T(x, 'PAROLA', W / 2, 1060, 340, COND, '#7a7a7a');
      x.restore();
      x.restore();
      const g = x.createLinearGradient(0, 1080, 0, 1420);
      g.addColorStop(0, 'rgba(220,220,219,0)'); g.addColorStop(1, 'rgba(210,210,209,1)');
      x.fillStyle = g; x.fillRect(0, 1080, W, 340);
    }
  }

  decorazione(x: CanvasRenderingContext2D, t: number, _lt: number) {
    this.light(x);
    this.floor(x, 1480);
    land(x, t, this.w.l6, () => T(x, 'non è', W / 2, 640, 84, SANS(600), INK), W / 2, 610);
    land(x, t, this.w.decorazione - 0.05, () => T(x, 'DECORAZIONE', W / 2, 980, 200, COND, RED), W / 2, 920);
    // the column rises out of the floor, the diamond drops onto it and catches the light
    const c = spring(t, this.w.decorazione + 0.05, { settle: 0.6, overshoot: 0.02 });
    const ch = 1050;
    const top = lerp(1950, 1020, c);
    this.put(x, 'column', W / 2, top + ch / 2, ch, { shadow: 0.3 });
    const d = spring(t, this.w.decorazione + 0.25, { settle: 0.5, overshoot: 0.1 });
    if (d > 0.001) this.put(x, 'diamond', W / 2, lerp(-200, top - 110, d), 270, { rot: Math.sin(t * 2.2) * 0.05, shadow: 0.35 });
    const gl = clamp((t - this.w.decorazione - 0.75) / 0.5);
    if (gl > 0 && gl < 1) {
      x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = Math.sin(gl * Math.PI);
      const sx = W / 2 + 40, sy = top - 150;
      x.strokeStyle = '#ffffff'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(sx - 60, sy); x.lineTo(sx + 60, sy); x.moveTo(sx, sy - 60); x.lineTo(sx, sy + 60); x.stroke();
      x.restore();
    }
  }

  strategia(x: CanvasRenderingContext2D, t: number, lt: number) {
    this.light(x);
    this.floor(x, 1330);
    land(x, t, this.w.l7, () => T(x, 'è strategia', 130, 760, 96, SANS(600), INK, 'left'), 340, 730);
    land(x, t, this.w.muove - 0.4, () => T(x, 'che si muove.', 250, 870, 104, SANS(700), RED, 'left'), 560, 830);
    // the knight comes in from the right and moves: up, over, down (an L)
    const a = E('expo.out')(clamp(lt / 0.5));
    const hop = clamp((t - this.w.muove + 0.1) / 0.5);
    const hx = lerp(lerp(1400, 700, a), 470, E('power2.inOut')(hop)), hy = 1140 - Math.sin(hop * Math.PI) * 160;
    // its shadow on the floor
    x.save(); x.filter = 'blur(14px)'; x.fillStyle = 'rgba(0,0,0,0.35)';
    x.beginPath(); x.ellipse(hx + 30, 1385, 130 * (1 - 0.3 * Math.sin(hop * Math.PI)), 26, 0, 0, TAU); x.fill(); x.restore();
    this.put(x, 'knight', hx, hy, 480, { rot: -0.12 * Math.sin(hop * Math.PI), shadow: 0.2, blur: a < 0.9 ? (1 - a) * 20 : 0 });
  }

  fine(x: CanvasRenderingContext2D, _t: number, lt: number) {
    x.fillStyle = '#000000'; x.fillRect(0, 0, W, H);
    const a = clamp((lt - 0.1) / 0.4);
    T(x, CREDIT[0]!, W / 2, 950, 62, SANS(700), '#ffffff', 'center', a);
    T(x, CREDIT[1]!, W / 2, 1020, 50, SANS(600), '#ffffff', 'center', a);
  }
}
