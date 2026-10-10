// The whole of `salpa`, one plate: an ad for a brand that doesn't exist (Salpa: "it sets sail"), in
// the format of @louis_rlee's reel. A 16:9 film sits in the middle of the 9:16 frame under one line of text, and runs
// a launch in 20 s: the problem, the prompt typed and sent, the three jobs done (copy, visuals, schedule), a spinner
// that becomes the brand, its network, the line and the logo. No voice: music and effects only (sound.py).
// Everything here is drawn for this film: the brand, its sail mark, the copy, the code, the cards, the icons.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT, W, H } from '@kit/engine/gl';
import { F, font, layout } from '@kit/engine/type';
import { clamp, lerp, noise1, TAU } from '@kit/engine/util';
import { E, tw, spring } from '@kit/fx';
import { reveal, typed } from '@kit/fx/text';
import { cursor, rr } from '@kit/fx/ui';

// the 16:9 film inside the frame: drawn in a 1920×1080 space, scaled to the frame's width
const S = W / 1920, FH = 1080 * S, FY = (H - FH) / 2;
const CAPTION = "Questo spot l'ha scritto Claude, in codice";
const SHOTS: [string, number][] = [['need', 0], ['hand', 2.0], ['line', 3.5], ['prompt', 4.0], ['copy', 6.0], ['visuals', 7.5],
  ['schedule', 9.0], ['spinner', 10.5], ['network', 11.5], ['tagline', 13.5], ['logo', 15.5]];
const END = 20, FADE = 19.35;
const WHITE = '#f4f3ff', DIM = 'rgba(244,243,255,0.55)';

/** The Salpa mark: a sail on its mast over a short hull, in a coral → violet → blue gradient, h tall, centred on (cx, cy). */
function mark(x: CanvasRenderingContext2D, cx: number, cy: number, h: number, t = 0, alpha = 1) {
  x.save();
  x.globalAlpha *= alpha;
  x.translate(cx, cy);
  const a = 0.6 + 0.25 * Math.sin(t * 0.8);
  const g = x.createLinearGradient(-h * 0.5 * Math.cos(a), -h * 0.5 * Math.sin(a), h * 0.5 * Math.cos(a), h * 0.5 * Math.sin(a));
  g.addColorStop(0, '#ff5d5d'); g.addColorStop(0.5, '#a45bff'); g.addColorStop(1, '#3d7bff');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(-h * 0.08, -h * 0.5);
  x.bezierCurveTo(h * 0.36, -h * 0.22, h * 0.44, h * 0.12, h * 0.3, h * 0.3);
  x.lineTo(-h * 0.08, h * 0.3);
  x.closePath();
  x.fill();
  x.beginPath(); x.moveTo(-h * 0.2, -h * 0.34); x.quadraticCurveTo(-h * 0.36, 0, -h * 0.2, h * 0.3); x.lineTo(-h * 0.13, h * 0.3); x.quadraticCurveTo(-h * 0.24, 0, -h * 0.13, -h * 0.3); x.closePath(); x.fill();
  rr(x, -h * 0.34, h * 0.38, h * 0.74, h * 0.1, h * 0.05); x.fill();
  x.restore();
}

/** Text at the alphabetic baseline, centred unless said otherwise. */
function txt(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, col: string, align: CanvasTextAlign = 'center', alpha = 1) {
  x.save(); x.globalAlpha *= alpha; x.font = font(fam, size); x.fillStyle = col; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(s, px, py); x.restore();
}

/** A stroke drawn on: the path traced by `trace`, its length L, shown from 0 to u. */
function drawn(x: CanvasRenderingContext2D, u: number, L: number, trace: () => void, col: string, lw: number) {
  if (u <= 0) return;
  x.save(); x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.setLineDash([L, L]); x.lineDashOffset = L * (1 - clamp(u)); x.beginPath(); trace(); x.stroke(); x.restore();
}

// tiny line icons for the network's nodes (drawn here)
const ICONS: [string, (x: CanvasRenderingContext2D) => void][] = [
  ['#ff6b6b', (x) => { x.strokeRect(-9, -7, 18, 14); x.beginPath(); x.moveTo(-9, -7); x.lineTo(0, 1); x.lineTo(9, -7); x.stroke(); }],
  ['#f7b955', (x) => { x.strokeRect(-9, -8, 18, 16); x.beginPath(); x.moveTo(-9, -3); x.lineTo(9, -3); x.moveTo(-4, -11); x.lineTo(-4, -6); x.moveTo(4, -11); x.lineTo(4, -6); x.stroke(); }],
  ['#8f7bff', (x) => { x.strokeRect(-9, -7, 18, 14); x.beginPath(); x.moveTo(-8, 6); x.lineTo(-2, -1); x.lineTo(2, 3); x.lineTo(5, 0); x.lineTo(8, 6); x.stroke(); }],
  ['#6aa8ff', (x) => { x.beginPath(); x.moveTo(-7, 8); x.lineTo(-7, 1); x.moveTo(0, 8); x.lineTo(0, -7); x.moveTo(7, 8); x.lineTo(7, -2); x.stroke(); }],
  ['#3ec5ff', (x) => { x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.stroke(); x.beginPath(); x.ellipse(0, 0, 4, 9, 0, 0, TAU); x.moveTo(-9, 0); x.lineTo(9, 0); x.stroke(); }],
  ['#3ddc97', (x) => { x.strokeRect(-8, -4, 16, 12); x.beginPath(); x.arc(0, -4, 4.5, Math.PI, 0); x.stroke(); }],
  ['#ff5d8f', (x) => { rr(x, -9, -7, 18, 14, 3); x.stroke(); x.beginPath(); x.moveTo(-2, -3); x.lineTo(3, 0); x.lineTo(-2, 3); x.closePath(); x.fill(); }],
  ['#5ad1e6', (x) => { rr(x, -9, -8, 18, 12, 3); x.stroke(); x.beginPath(); x.moveTo(-4, 4); x.lineTo(-6, 9); x.lineTo(1, 4); x.stroke(); }],
];

export default class Salpa extends Scene {
  layer = new Layer2D();

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out);
    const L = this.layer;
    L.clear('#000000');
    const x = L.ctx;
    let i = 0;
    while (i < SHOTS.length - 1 && t >= SHOTS[i + 1]![1]) i++;
    const [name, t0] = SHOTS[i]!;
    // the film, in its 1920×1080 space, clipped to its band of the frame
    x.save();
    x.beginPath(); x.rect(0, FY, W, FH); x.clip();
    x.translate(0, FY); x.scale(S, S);
    (this as unknown as Record<string, (x: CanvasRenderingContext2D, lt: number, t: number) => void>)[name]!.call(this, x, t - t0, t);
    if (t > FADE) { x.fillStyle = `rgba(0,0,0,${E('power2.in')(clamp((t - FADE) / (END - 0.05 - FADE))).toFixed(3)})`; x.fillRect(0, 0, 1920, 1080); }
    x.restore();
    // the line above the film, all the way through
    txt(x, CAPTION, W / 2, FY - 52, 42, F.poppins(500), WHITE);
    comp.draw(renderer, L.upload(), out);
    return { bloom: 0.28, bloomThreshold: 0.7, halation: 0, ca: 0, grain: 0.04, vignette: 0, hud: 0 };
  }

  // ---------------------------------------------------------------- grounds
  glow(x: CanvasRenderingContext2D, t: number, o: { a?: string; b?: string; base?: string } = {}) {
    x.fillStyle = o.base ?? '#05060c'; x.fillRect(0, 0, 1920, 1080);
    const blob = (cx: number, cy: number, r: number, col: string) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 1920, 1080);
    };
    blob(560 + 70 * noise1(t * 0.18, 1), 280 + 50 * noise1(t * 0.15, 2), 820, o.a ?? 'rgba(88,54,222,0.55)');
    blob(1480 + 60 * noise1(t * 0.16, 3), 860 + 40 * noise1(t * 0.2, 4), 640, o.b ?? 'rgba(30,70,205,0.5)');
    blob(1500, 180, 420, 'rgba(255,255,255,0.025)');
  }

  // ---------------------------------------------------------------- the shots (lt: seconds into the shot)
  arrowLine(x: CanvasRenderingContext2D, px: number, py: number, dir: 1 | -1, u: number) {
    if (u <= 0) return;
    x.save(); x.globalAlpha *= clamp(u * 2); x.translate(px + dir * (1 - E('expo.out')(u)) * -40, py);
    x.strokeStyle = WHITE; x.lineWidth = 3.5; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(-14 * dir, 0); x.lineTo(14 * dir, 0); x.moveTo(5 * dir, -9); x.lineTo(14 * dir, 0); x.lineTo(5 * dir, 9); x.stroke();
    x.restore();
  }

  need(x: CanvasRenderingContext2D, lt: number, t: number) {
    this.glow(x, t);
    const s = 'Ti serve una campagna di lancio.', size = 50, fam = F.poppins(500);
    const w = layout(s, fam, size).width, x0 = 960 - w / 2 + 30;
    this.arrowLine(x, x0 - 46, 540, 1, tw(lt, 0.05, 0.4));
    reveal(x, lt, 0.12, s, x0, 557, size, fam, { mode: 'blur', by: 'word', each: 0.07, dur: 0.4, align: 'left', color: WHITE, tOut: 1.75 });
  }

  hand(x: CanvasRenderingContext2D, lt: number, t: number) {
    this.glow(x, t);
    const s = 'Smetti di farla a mano.', size = 50, fam = F.poppins(500);
    const w = layout(s, fam, size).width, x0 = 960 - w / 2 - 30;
    reveal(x, lt, 0.0, s, x0, 557, size, fam, { mode: 'blur', by: 'word', each: 0.06, dur: 0.35, align: 'left', color: WHITE, tOut: 1.25 });
    this.arrowLine(x, x0 + w + 46, 540, -1, tw(lt, 0.3, 0.4) * (1 - tw(lt, 1.25, 0.2)));
  }

  line(x: CanvasRenderingContext2D, lt: number, t: number) {
    this.glow(x, t);
    const u = E('expo.out')(clamp(lt / 0.3));
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(960 - 960 * u, 540); x.lineTo(960 + 960 * u, 540); x.moveTo(960, 540 - 540 * u); x.lineTo(960, 540 + 540 * u); x.stroke();
    const pw = 820 * E('expo.out')(clamp((lt - 0.12) / 0.35));
    if (pw > 4) {
      rr(x, 960 - pw / 2, 540 - 40, pw, 80, 40); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.3)'; x.lineWidth = 2; x.stroke();
      if (pw > 120) txt(x, '+', 960 - pw / 2 + 40, 552, 34, F.poppins(500), DIM, 'center');
    }
  }

  prompt(x: CanvasRenderingContext2D, lt: number, t: number) {
    // the last 0.3 s rush the camera into the send button, blurring: the whip into the next shot
    const whip = E('expo.in')(clamp((lt - 1.7) / 0.3));
    x.save();
    if (whip > 0) { x.translate(1340, 540); x.scale(1 + 1.6 * whip, 1 + 1.6 * whip); x.translate(-1340, -540); x.filter = `blur(${(whip * 26).toFixed(1)}px)`; }
    this.glow(x, t);
    x.strokeStyle = 'rgba(255,255,255,0.1)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 540); x.lineTo(1920, 540); x.stroke();
    const pw = lerp(820, 1040, E('expo.out')(clamp(lt / 0.4))), px = 960 - pw / 2;
    rr(x, px, 540 - 48, pw, 96, 48); x.fillStyle = 'rgba(255,255,255,0.07)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 2; x.stroke();
    txt(x, '+', px + 44, 555, 36, F.poppins(500), DIM);
    // the chips above it
    let cx = 960 - 250;
    ['Testi', 'Visual', 'Video', 'Altro'].forEach((c, k) => {
      const e = E('expo.out')(clamp((lt - 0.1 - k * 0.07) / 0.35)), cw = layout(c, F.poppins(500), 22).width + 58;
      if (e > 0) {
        x.save(); x.globalAlpha = e; x.translate(0, (1 - e) * 16);
        rr(x, cx, 540 - 104, cw, 40, 20); x.fillStyle = k === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.14)'; x.stroke();
        x.beginPath(); x.arc(cx + 20, 540 - 84, 5, 0, TAU); x.fillStyle = ['#ff6b6b', '#8f7bff', '#3ec5ff', DIM][k]!; x.fill();
        txt(x, c, cx + 34, 540 - 76, 22, F.poppins(500), WHITE, 'left');
        x.restore();
      }
      cx += cw + 12;
    });
    const q = typed('Lancia il mio brand in 24 ore.', lt, 0.2, 24);
    txt(x, q.s, px + 84, 556, 40, F.poppins(500), WHITE, 'left');
    if (q.caret && lt < 1.5) { x.font = font(F.poppins(500), 40); x.fillStyle = WHITE; x.fillRect(px + 86 + x.measureText(q.s).width, 524, 3, 44); }
    // the send button: lights up when the line is typed, dips on the click
    const bx = px + pw - 54, ready = tw(lt, 1.25, 0.2), press = Math.max(0, 1 - Math.abs(lt - 1.52) / 0.08);
    x.save(); x.translate(bx, 540); x.scale(1 - 0.12 * press, 1 - 0.12 * press);
    x.beginPath(); x.arc(0, 0, 30, 0, TAU); x.fillStyle = `rgba(255,255,255,${(0.35 + 0.6 * ready).toFixed(3)})`; x.fill();
    x.strokeStyle = '#0b0c18'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 11); x.lineTo(0, -11); x.moveTo(-8, -3); x.lineTo(0, -11); x.lineTo(8, -3); x.stroke();
    x.restore();
    const ring = clamp((lt - 1.52) / 0.45);
    if (ring > 0 && ring < 1) { x.save(); x.globalAlpha = 1 - ring; x.strokeStyle = WHITE; x.lineWidth = 3; x.beginPath(); x.arc(bx, 540, 30 + 44 * E('expo.out')(ring), 0, TAU); x.stroke(); x.restore(); }
    cursor(x, lt, [[0, 1700, 900], [0.55, 1500, 760], [1.2, bx + 4, 546, true]], { size: 30, settle: 0.4, ripple: 'rgba(255,255,255,0)' });
    x.restore();
  }

  copy(x: CanvasRenderingContext2D, lt: number, t: number) {
    // comes out of the whip: from oversize and blurred, settling
    const inn = E('expo.out')(clamp(lt / 0.4));
    x.save();
    if (inn < 1) { x.translate(960, 540); x.scale(1.35 - 0.35 * inn, 1.35 - 0.35 * inn); x.translate(-960, -540); x.filter = `blur(${((1 - inn) * 22).toFixed(1)}px)`; }
    x.fillStyle = '#140603'; x.fillRect(0, 0, 1920, 1080);
    const g = x.createRadialGradient(1320 + 40 * noise1(t * 0.3, 7), 720, 0, 1320, 720, 1150);
    g.addColorStop(0, 'rgba(226,92,38,0.95)'); g.addColorStop(0.55, 'rgba(120,36,14,0.6)'); g.addColorStop(1, 'rgba(20,6,3,0)');
    x.fillStyle = g; x.fillRect(0, 0, 1920, 1080);
    // the arcs: three thick rings turning in, each drawn on a beat after the other
    for (let k = 0; k < 3; k++) {
      const r = 180 + k * 120, u = E('expo.out')(clamp((lt - 0.15 - k * 0.09) / 0.6));
      if (u <= 0) continue;
      const a0 = -2.4 + (1 - u) * -1.4 + lt * 0.22 * (k % 2 ? -1 : 1);
      x.strokeStyle = k === 1 ? '#ff7a45' : '#ff5a2a'; x.lineWidth = 52 - k * 6; x.lineCap = 'round';
      x.beginPath(); x.arc(1600, 900, r, a0, a0 + 4.3 * u); x.stroke();
    }
    const h = typed('Scrivo i testi.', lt, 0.15, 22);
    txt(x, h.s, 210, 330, 56, F.poppins(600), WHITE, 'left');
    if (h.caret) { x.font = font(F.poppins(600), 56); x.fillStyle = WHITE; x.fillRect(214 + x.measureText(h.s).width, 290, 4, 50); }
    txt(x, '// a cura di Salpa AI', 212, 378, 20, F.mono(500), 'rgba(255,225,210,0.45)', 'left');
    const code = ['const lancio = salpa.campagna({', '  brand: "Studio Lume",', '  tono: "deciso, essenziale",', '  canali: ["IG", "TikTok", "Email"],', '  scadenza: "24 ore",', '});'];
    let tt = 0.45;
    code.forEach((ln, k) => {
      const c = typed(ln, lt, tt, 70);
      txt(x, c.s, 212, 430 + k * 34, 22, F.mono(500), 'rgba(255,236,226,0.88)', 'left');
      tt += ln.length / 70;
    });
    x.restore();
  }

  visuals(x: CanvasRenderingContext2D, lt: number, t: number) {
    const g = x.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, '#060a24'); g.addColorStop(1, '#13247a');
    x.fillStyle = g; x.fillRect(0, 0, 1920, 1080);
    this.glow(x, t, { base: 'rgba(0,0,0,0)', a: 'rgba(40,70,220,0.35)', b: 'rgba(60,120,255,0.35)' });
    reveal(x, lt, 0.0, 'Disegno i visual.', 210, 300, 56, F.poppins(600), { mode: 'blur', by: 'word', each: 0.06, dur: 0.35, align: 'left', color: WHITE });
    // the spike: a blue cone rising on the right
    const hgt = 760 * spring(lt, 0.25, { settle: 0.7, overshoot: 0.02 });
    if (hgt > 2) {
      const sg = x.createLinearGradient(0, 1080 - hgt, 0, 1080);
      sg.addColorStop(0, 'rgba(170,205,255,0.95)'); sg.addColorStop(0.5, 'rgba(60,120,255,0.75)'); sg.addColorStop(1, 'rgba(30,60,200,0.2)');
      x.fillStyle = sg; x.beginPath(); x.moveTo(1250, 1080); x.bezierCurveTo(1460, 1050, 1515, 860, 1530, 1080 - hgt); x.bezierCurveTo(1545, 860, 1600, 1050, 1810, 1080); x.closePath(); x.fill();
    }
    // four cards, arriving from oversize one after the other
    const cards: [string, string, string, string][] = [
      ['#ff7a59', '#6a3df0', 'Pronto in', 'un giorno.'], ['#1b3cff', '#22c7ff', 'Più luce,', 'meno rumore.'],
      ['#ffffff', '#ff6a6a', 'Prenota il', 'tuo posto.'], ['#c04bff', '#ff6aa8', 'Online', 'domani.']];
    cards.forEach(([c1, c2, l1, l2], k) => {
      const e = E('expo.out')(clamp((lt - 0.3 - k * 0.12) / 0.45));
      if (e <= 0) return;
      const cx = 210 + k * 215, cy = 370, w = 190, h = 250, sc = 1.3 - 0.3 * e;
      x.save(); x.globalAlpha = clamp(e * 1.6); x.translate(cx + w / 2, cy + h / 2); x.scale(sc, sc); x.translate(-(cx + w / 2), -(cy + h / 2));
      x.shadowColor = 'rgba(0,0,0,0.4)'; x.shadowBlur = 30; x.shadowOffsetY = 12;
      rr(x, cx, cy, w, h, 14); x.fillStyle = k === 2 ? '#f6f4f1' : '#0d1030'; x.fill();
      x.shadowColor = 'transparent';
      x.save(); rr(x, cx, cy, w, h, 14); x.clip();
      if (k === 2) { rr(x, cx + 22, cy + 46, w - 44, 100, 10); x.fillStyle = c2; x.fill(); }
      else if (k === 1) { const rg = x.createRadialGradient(cx + w / 2, cy + 90, 4, cx + w / 2, cy + 90, 80); rg.addColorStop(0, '#9fe8ff'); rg.addColorStop(0.4, c2); rg.addColorStop(1, c1); x.fillStyle = '#0a1240'; x.fillRect(cx, cy, w, 180); x.fillStyle = rg; x.beginPath(); x.arc(cx + w / 2, cy + 90, 62, 0, TAU); x.fill(); }
      else { const lg = x.createLinearGradient(cx, cy, cx + w, cy + 180); lg.addColorStop(0, c1); lg.addColorStop(1, c2); x.fillStyle = lg; x.fillRect(cx, cy, w, 180); }
      x.restore();
      mark(x, cx + 22, cy + 22, 18, t, 0.95);
      const ink = k === 2 ? '#15151c' : WHITE;
      txt(x, l1, cx + 16, cy + h - 44, 17, F.poppins(600), ink, 'left');
      txt(x, l2, cx + 16, cy + h - 22, 17, F.poppins(600), ink, 'left');
      x.restore();
    });
  }

  schedule(x: CanvasRenderingContext2D, lt: number) {
    // the last 0.35 s dive into the big ring, which becomes the spinner
    const dive = E('expo.in')(clamp((lt - 1.15) / 0.35));
    x.save();
    if (dive > 0) { x.translate(1700, 960); x.scale(1 + 3 * dive, 1 + 3 * dive); x.translate(-1700, -960); }
    x.fillStyle = '#05060a'; x.fillRect(0, 0, 1920, 1080);
    reveal(x, lt, -0.2, 'Programmo il lancio.', 150, 290, 50, F.poppins(600), { mode: 'blur', by: 'word', each: 0.05, dur: 0.3, align: 'left', color: WHITE });
    const rx = 330, ry = 620;
    // the root: a turning ring
    x.strokeStyle = WHITE; x.lineWidth = 4; x.beginPath(); x.arc(rx, ry, 16, lt * 5, lt * 5 + 4.8); x.stroke();
    const lu = tw(lt, 0.15, 0.4, 'power2.out');
    drawn(x, lu, 100, () => { x.moveTo(rx + 18, ry); x.lineTo(rx + 100, ry); }, 'rgba(255,255,255,0.5)', 2);
    drawn(x, tw(lt, 0.2, 0.5, 'power2.out'), 210, () => { x.moveTo(rx, ry + 18); x.lineTo(rx, ry + 228); }, 'rgba(255,255,255,0.5)', 2);
    if (lt > 0.6) { x.beginPath(); x.arc(rx, ry + 230, 5, 0, TAU); x.fillStyle = WHITE; x.fill(); }
    const rows: [string, string][] = [['#ff6b9a', 'Instagram · lun 9:00'], ['#5ab8ff', 'LinkedIn · lun 13:00'], ['#ffad4d', 'Newsletter · mar 8:00']];
    rows.forEach(([col, label], k) => {
      const y = ry + (k - 1) * 84, u = tw(lt, 0.3 + k * 0.1, 0.4, 'power2.out');
      drawn(x, u, 200, () => { x.moveTo(rx + 100, ry); x.bezierCurveTo(rx + 150, ry, rx + 140, y, rx + 200, y); x.lineTo(rx + 240, y); }, 'rgba(255,255,255,0.5)', 2);
      const e = E('expo.out')(clamp((lt - 0.5 - k * 0.1) / 0.35));
      if (e <= 0) return;
      x.save(); x.globalAlpha = e; x.translate((1 - e) * 24, 0);
      x.beginPath(); x.arc(rx + 252, y, 6, 0, TAU); x.fillStyle = WHITE; x.fill();
      const tw2 = layout(label, F.poppins(500), 20).width + 56;
      rr(x, rx + 272, y - 20, tw2, 40, 20); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 1.5; x.stroke();
      x.beginPath(); x.arc(rx + 292, y, 6, 0, TAU); x.fillStyle = col; x.fill();
      txt(x, label, rx + 308, y + 7, 20, F.poppins(500), WHITE, 'left');
      x.restore();
    });
    // the big ring that slides in at the corner, and the white line sweeping in before the dive
    const re = E('expo.out')(clamp((lt - 0.75) / 0.45));
    if (re > 0) {
      x.save(); x.translate(1700 + (1 - re) * 300, 960 + (1 - re) * 200); x.rotate(-lt * 1.6);
      x.strokeStyle = WHITE; x.lineWidth = 26; x.beginPath(); x.arc(0, 0, 150, 0.5, 0.5 + 5.6); x.stroke();
      x.lineWidth = 9; x.beginPath(); x.arc(0, 0, 104, 2.2, 2.2 + 5.2); x.stroke();
      x.restore();
    }
    const lx = 1920 - 1920 * E('expo.inOut')(clamp((lt - 0.95) / 0.5));
    if (lt > 0.95 && lt < 1.45) { x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(lx, 0, 3, 1080); }
    x.restore();
  }

  spinner(x: CanvasRenderingContext2D, lt: number) {
    x.fillStyle = '#030305'; x.fillRect(0, 0, 1920, 1080);
    const e = E('expo.out')(clamp(lt / 0.4));
    const r = lerp(360, 42, e), lw = lerp(46, 10, e), cx = 960 - 160 * E('power3.inOut')(clamp((lt - 0.7) / 0.3));
    x.save(); x.shadowColor = 'rgba(200,200,255,0.6)'; x.shadowBlur = 24;
    const a = lt * 7.5;
    x.strokeStyle = WHITE; x.lineWidth = lw; x.lineCap = 'round'; x.beginPath(); x.arc(cx, 540, r, a, a + 4.9); x.stroke();
    x.beginPath(); x.arc(cx + Math.cos(a - 0.45) * r, 540 + Math.sin(a - 0.45) * r, lw * 0.55, 0, TAU); x.fillStyle = WHITE; x.fill();
    x.restore();
  }

  network(x: CanvasRenderingContext2D, lt: number, t: number) {
    const out = E('expo.in')(clamp((lt - 1.65) / 0.35));
    x.save();
    if (out > 0) { x.translate(960, 540); x.scale(1 + 0.25 * out, 1 + 0.25 * out); x.translate(-960, -540); x.filter = `blur(${(out * 20).toFixed(1)}px)`; x.globalAlpha = 1 - 0.6 * out; }
    x.fillStyle = '#030305'; x.fillRect(0, 0, 1920, 1080);
    // leaving, the dark warms into the glow of the next shot (never a dip to black)
    if (out > 0) { x.save(); x.globalAlpha = out; this.glow(x, t); x.restore(); }
    // the pill: its border draws round, the spinner turns into the sail, the name comes in
    const pw = 440, ph = 140, px = 960 - pw / 2, py = 540 - ph / 2;
    const bu = tw(lt, 0.0, 0.35, 'power2.out');
    drawn(x, bu, 2 * (pw - ph) + Math.PI * ph, () => { rr(x, px, py, pw, ph, ph / 2); }, 'rgba(255,255,255,0.4)', 2.5);
    rr(x, px, py, pw, ph, ph / 2); x.fillStyle = `rgba(255,255,255,${(0.05 * bu).toFixed(3)})`; x.fill();
    const sw = tw(lt, 0.05, 0.3);
    if (sw < 1) { x.save(); x.globalAlpha = 1 - sw; x.strokeStyle = WHITE; x.lineWidth = 10; x.lineCap = 'round'; x.beginPath(); x.arc(800, 540, 42, lt * 7.5, lt * 7.5 + 4.9); x.stroke(); x.restore(); }
    mark(x, 806, 540, 92 * (0.7 + 0.3 * sw), t, sw);
    reveal(x, lt, 0.12, 'Salpa', 868, 568, 80, F.poppins(600), { mode: 'blur', each: 0.04, dur: 0.35, align: 'left', color: WHITE });
    // the network: eight nodes round it, each wired to the pill
    ICONS.forEach(([col, icon], k) => {
      const ang = -Math.PI / 2 + (k + 0.5) * (TAU / 8), nx = 960 + Math.cos(ang) * 640, ny = 540 + Math.sin(ang) * 350;
      const ex = 960 + Math.cos(ang) * (pw / 2 + 4), ey = 540 + Math.sin(ang) * (ph / 2 + 4);
      const u = tw(lt, 0.35 + k * 0.06, 0.45, 'power2.out');
      drawn(x, u, 640, () => { x.moveTo(ex, ey); x.bezierCurveTo(lerp(ex, nx, 0.5), ey, lerp(ex, nx, 0.5), ny, nx, ny); }, 'rgba(255,255,255,0.28)', 2);
      const e = E('expo.out')(clamp((lt - 0.6 - k * 0.06) / 0.35));
      if (e <= 0) return;
      x.save(); x.translate(nx, ny + 4 * Math.sin(t * 2 + k)); x.scale(1.4 * (1.4 - 0.4 * e), 1.4 * (1.4 - 0.4 * e)); x.globalAlpha = e;
      x.beginPath(); x.arc(0, 0, 30, 0, TAU); x.fillStyle = '#12131c'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 2; x.stroke();
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round';
      icon(x);
      x.restore();
    });
    x.restore();
  }

  tagline(x: CanvasRenderingContext2D, lt: number, t: number) {
    const inn = E('expo.out')(clamp(lt / 0.45));
    x.save();
    if (inn < 1) x.filter = `blur(${((1 - inn) * 24).toFixed(1)}px)`;
    this.glow(x, t);
    x.restore();
    const a = "Dall'idea al lancio. Con ", b = 'Salpa AI.', size = 32;
    const wa = layout(a, F.poppins(500), size).width, wb = layout(b, F.poppins(600), size).width, x0 = 960 - (wa + wb) / 2;
    reveal(x, lt, 0.3, a, x0, 551, size, F.poppins(500), { mode: 'blur', by: 'word', each: 0.06, dur: 0.4, align: 'left', color: 'rgba(244,243,255,0.85)', tOut: 1.7 });
    reveal(x, lt, 0.62, b, x0 + wa, 551, size, F.poppins(600), { mode: 'blur', by: 'word', each: 0.06, dur: 0.4, align: 'left', color: WHITE, tOut: 1.75 });
  }

  logo(x: CanvasRenderingContext2D, lt: number, t: number) {
    // the glow drifts faster here, so the held logo still breathes
    this.glow(x, 15.5 + lt * 2.2);
    const e = E('expo.out')(clamp(lt / 0.55)), push = 1 + 0.09 * E('sine.inOut')(clamp(lt / 4));
    const sc = (1.6 - 0.6 * e) * push, fam = F.poppins(600), size = 132;
    const w = layout('Salpa', fam, size).width, gap = 26, ih = 150, total = ih * 0.75 + gap + w;
    x.save();
    x.translate(960, 540); x.scale(sc, sc); x.translate(-960, -540);
    if (e < 1) { x.filter = `blur(${((1 - e) * 18).toFixed(1)}px)`; x.globalAlpha = clamp(e * 1.4); }
    x.save(); x.shadowColor = 'rgba(160,110,255,0.55)'; x.shadowBlur = 40; mark(x, 960 - total / 2 + ih * 0.4, 532, ih, t); x.restore();
    txt(x, 'Salpa', 960 - total / 2 + ih * 0.75 + gap, 588, size, fam, WHITE, 'left');
    // a glint crossing the name, a second after it lands
    const gu = clamp((lt - 1.1) / 0.9);
    if (gu > 0 && gu < 1) {
      x.save();
      x.font = font(fam, size); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      const gx = 960 - total / 2 + ih * 0.75 + gap - 120 + (w + 240) * E('power2.inOut')(gu);
      const lg = x.createLinearGradient(gx - 70, 0, gx + 70, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(210,190,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = lg; x.globalCompositeOperation = 'lighter';
      x.fillText('Salpa', 960 - total / 2 + ih * 0.75 + gap, 588);
      x.restore();
    }
    x.restore();
  }
}
