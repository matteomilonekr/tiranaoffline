// The whole of `polish`, one plate, eight shots in the paper-night workshop (films/_paper/stage.ts):
//  1. the box creature, a painter, at its easel: a purple "made with AI" site; on "secondo" a stamp slams IA on
//     it, on "indizio" purple lightning crackles round it;
//  2. "dagli stessi template": a TEMPLATE stamp presses out the same site again and again;
//  3. "gradienti viola e riquadri dentro riquadri": the factory belt of identical sites, the nested boxes lit;
//  4. "una skill di design": a crane lowers the golden skill onto its head; the stars roll to 75.000+;
//  5. "Scrivi un solo comando": the command is typed;
//  6. "spaziature, colori e font giusti": the canvas turns over into a designed page; guides, swatches, type;
//  7. "i sessantuno classici segnali": a wall of AI sites turns over one by one, the counter falls 61 → 0;
//  8. "commenta POLISH": the comment box, GRATIS.
// The star count and the 61 come from the original post: check them before you publish.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT } from '@kit/engine/gl';
import type { Lyrics, Word } from '@kit/engine/lyrics';
import {
  F, FLOOR_Y, TAU, PAPER, CREAM, INK, GOLD, GOLD_D, clamp, ease, hash, lerp,
  room, atmosphere, banner, PaperCaptions, bot, commentBox, shotCam, withCam, paperPiece, tornRect, rr, txt, at, pop, bump,
  aiSite, goodSite,
} from '../../_paper/stage';

const CUT_LEAD = 0.18;

function wordAt(ly: Lyrics, q: string, after = 0): Word {
  const k = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const w = ly.words.find((w) => k(w.w) === k(q) && w.start >= after - 1e-6);
  if (!w) throw new Error(`word not found: ${q} after ${after}`);
  return w;
}

/** An easel with a canvas (x0, y0, w, h); `face` draws on the canvas. */
function easel(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, face: () => void) {
  x.strokeStyle = '#7a5134'; x.lineCap = 'round'; x.lineWidth = 22;
  x.beginPath(); x.moveTo(x0 + w * 0.2, y0 + h + 10); x.lineTo(x0 + w * 0.05, FLOOR_Y + 160); x.stroke();
  x.beginPath(); x.moveTo(x0 + w * 0.8, y0 + h + 10); x.lineTo(x0 + w * 0.95, FLOOR_Y + 160); x.stroke();
  x.beginPath(); x.moveTo(x0 + w * 0.5, y0 - 40); x.lineTo(x0 + w * 0.5, FLOOR_Y + 120); x.stroke();
  x.fillStyle = '#8a5d3d'; x.fillRect(x0 - 20, y0 + h, w + 40, 26);
  paperPiece(x, () => rr(x, x0 - 12, y0 - 12, w + 24, h + 24, 10), '#f4ede0', { shadow: 16, speckle: 0 });
  face();
}

/** Lightning: jagged purple bolts round a box, a new shape every frame. */
function zap(x: CanvasRenderingContext2D, t: number, x0: number, y0: number, w: number, h: number, k: number) {
  if (k <= 0) return;
  const f = Math.floor(t * 30);
  x.save(); x.globalCompositeOperation = 'lighter'; x.lineJoin = 'round';
  for (let b = 0; b < 6; b++) {
    const pts: [number, number][] = [];
    const a0 = hash(f, b) * TAU, rx = w * 0.6, ry = h * 0.62;
    for (let i = 0; i <= 14; i++) {
      const a = a0 + (i / 14) * 2.2, j = (hash(f, b, i) - 0.5) * 60;
      pts.push([x0 + w / 2 + Math.cos(a) * (rx + j), y0 + h / 2 + Math.sin(a) * (ry + j)]);
    }
    for (const [lw, col] of [[18, `rgba(150,90,255,${0.25 * k})`], [6, `rgba(210,180,255,${0.9 * k})`]] as const) {
      x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.lineWidth = lw; x.strokeStyle = col; x.stroke();
    }
  }
  x.restore();
}

export default class Polish extends Scene {
  layer = new Layer2D();
  caps!: PaperCaptions;
  w: Record<string, number> = {};
  shots: [number, number][] = [];

  override init() {
    const ly = this.ctx.lyrics;
    this.caps = new PaperCaptions(ly);
    const cut = (i: number) => {
      const l = ly.lines[i]!, p = ly.lines[i - 1];
      return Math.max(l.words[0]!.start - CUT_LEAD, p ? Math.min(p.end + 0.02, l.words[0]!.start - 0.02) : 0);
    };
    const cuts = ly.lines.map((_, i) => cut(i));
    const at = (q: string, after = 0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.secondo = at('secondo'); w.indizio = at('indizio');
    w.template = at('template'); w.gradienti = at('gradienti'); w.riquadri = at('riquadri');
    w.skill = at('skill'); w.stelle = at('settantacinquemila');
    w.comando = at('comando'); w.ridisegna = at('ridisegna'); w.spaziature = at('spaziature'); w.colori = at('colori'); w.font = at('font');
    w.corregge = at('corregge'); w.sessantuno = at('sessantuno'); w.veda = at('veda');
    w.gratis = at('gratis'); w.polish = at('POLISH');
    const end = this.ctx.end;
    const s = [0, cuts[1]!, w.gradienti - 0.25, cuts[2]!, cuts[3]!, w.spaziature - 0.3, cuts[4]!, cuts[5]!, end];
    this.shots = s.slice(0, -1).map((a, i) => [a, s[i + 1]!]);
  }

  shot(t: number) { let k = 0; this.shots.forEach(([a], i) => { if (t >= a) k = i; }); return k; }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out);
    const L = this.layer;
    L.clear();
    const x = L.ctx;
    const k = this.shot(t), [t0, t1] = this.shots[k]!;
    // where each shot's camera looks, and how close it is
    const cams: [number, number, number][] = [[520, 960, 1.18], [540, 900, 1.12], [540, 1020, 1.15], [540, 960, 1.15], [540, 900, 1.1], [560, 900, 1.12], [540, 880, 1.08], [540, 1000, 1.1]];
    const c = shotCam(t, t0, t1, cams[k]![0], cams[k]![1], cams[k]![2]);
    withCam(x, c, () => {
      room(x, t, { win: k % 2 ? [170, 910] : [210, 870], lamp: [560, 420, 700, 520, 540, 560, 540, 540][k] });
      [this.s1, this.s2, this.s3, this.s4, this.s5, this.s6, this.s7, this.s8][k]!.call(this, x, t, t0);
    });
    atmosphere(x, t);
    banner(x, t, [
      [0, 'IL TUO SITO URLA «IA»'], [this.shots[1]![0], 'OGNI SITO, UN SOLO TEMPLATE'], [this.shots[2]![0], 'LA FABBRICA DEI SITI IA'],
      [this.shots[3]![0], 'UNA SKILL DI DESIGN OPEN SOURCE'], [this.shots[4]![0], 'UN SOLO COMANDO'], [this.shots[5]![0], 'UN REDESIGN PRO IN SECONDI'],
      [this.shots[6]![0], '61 SEGNALI DA IA, SPARITI'], [this.shots[7]![0], 'COMMENTA POLISH'],
    ]);
    this.caps.draw(x, t);
    comp.draw(renderer, L.upload(), out);
    const hit = bump(t, this.w.secondo!, 0.2) + 0.7 * bump(t, this.w.indizio!, 0.3) + 0.5 * bump(t, t0, 0.2);
    return { bloom: 0.35, bloomThreshold: 0.78, halation: 0.25, ca: 0.8 + hit, grain: 0.07, vignette: 0.25, hud: 0, shake: [6 * hit * Math.sin(t * 80), 5 * hit * Math.cos(t * 70)] };
  }

  // 1 — the AI-made site, stamped and zapped
  s1(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    const cx0 = 300, cy0 = 640, cw = 560, ch = 400;
    easel(x, cx0, cy0, cw, ch, () => aiSite(x, cx0, cy0, cw, ch, t, { badge: true }));
    // the stamp comes down on "secondo"
    const ts = w.secondo! - 0.25, u = t - ts;
    if (u > -0.6) {
      const down = u < 0 ? 0 : u < 0.25 ? ease.inCubic(u / 0.25) : u < 0.55 ? 1 : 1 - ease.outCubic((u - 0.55) / 0.35);
      const sy = lerp(260, 600, down);
      if (u < 1.0) {
        x.fillStyle = '#8a5d3d'; rr(x, cx0 + cw / 2 - 30, sy - 260, 60, 220, 20); x.fill();
        x.beginPath(); x.arc(cx0 + cw / 2, sy - 270, 55, 0, TAU); x.fillStyle = '#d9302c'; x.fill();
        paperPiece(x, () => rr(x, cx0 + cw / 2 - 120, sy - 50, 240, 70, 10), '#5a3a26', { shadow: 6, speckle: 0 });
      }
      if (u >= 0.25) { // the mark it leaves
        x.save(); x.translate(cx0 + cw / 2, cy0 + ch * 0.55); x.rotate(-0.15);
        x.globalAlpha = 0.92;
        x.lineWidth = 12; x.strokeStyle = '#e8402c'; x.beginPath(); x.arc(0, 0, 120, 0, TAU); x.stroke();
        txt(x, 'IA', 0, 50, 150, F.archivo(100, 900), '#e8402c', { align: 'center' });
        x.restore();
      }
    }
    zap(x, t, cx0, cy0, cw, ch, clamp(1 - Math.abs(t - w.indizio! - 0.3) / 0.6));
    bot(x, t, 330, FLOOR_Y + 150, 1.0, { hat: 'beret', shirt: true, look: 0.6, hop: 12 * bump(t, w.secondo!, 0.3) });
  }

  // 2 — one template, pressed out again and again
  s2(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    const presses = 5, period = 0.5, start = Math.min(w.template! - 0.2, t0 + 0.3);
    const n = clamp(Math.floor((t - start) / period) + 1, 0, presses);
    // the stack of identical sites, fanned out on the floor
    paperPiece(x, () => rr(x, 140, 1110, 800, 40, 12), '#7a5134', { shadow: 14, speckle: 0 }); // the table
    x.fillStyle = '#5c3c27'; x.fillRect(180, 1150, 30, FLOOR_Y + 100 - 1150); x.fillRect(870, 1150, 30, FLOOR_Y + 100 - 1150);
    for (let i = 0; i < n; i++) {
      const fx = 540 + (i - 2) * 140 * clamp((t - start - i * period) / 0.4), fy = 1000 - i * 6;
      at(x, fx, fy, 0.8, (i - 2) * 0.08, () => aiSite(x, fx - 170, fy - 120, 340, 240, t));
    }
    // the press: up, down on each beat
    const ph = ((t - start) % period) / period, down = t < start ? 0 : ph < 0.3 ? ease.inCubic(ph / 0.3) : 1 - ease.outCubic((ph - 0.3) / 0.7);
    const py = lerp(560, 880, down);
    x.fillStyle = '#3b3b48'; x.fillRect(530, -400, 20, py - 60 + 400);
    paperPiece(x, () => rr(x, 330, py - 70, 420, 160, 18), '#d9302c', { shadow: 14, speckle: 0 });
    paperPiece(x, () => rr(x, 360, py - 40, 360, 90, 12), CREAM, { shadow: 0, speckle: 0 });
    txt(x, 'TEMPLATE', 540, py + 20, 56, F.archivo(100, 900), '#d9302c', { align: 'center' });
    bot(x, t, 850, FLOOR_Y + 130, 0.7, { hat: 'beret', shirt: true, look: -1 });
  }

  // 3 — the factory belt, the same site over and over
  s3(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    const by = FLOOR_Y - 40;
    // the belt
    paperPiece(x, () => rr(x, -300, by, 1700, 60, 30), '#2a2a33', { shadow: 12, speckle: 0 });
    x.fillStyle = '#4a4a58';
    for (let i = 0; i < 30; i++) { const px = ((i * 70 + t * 220) % 2100) - 400; x.fillRect(px, by + 8, 30, 44); }
    // identical sites riding it; one is held up on "riquadri" with its nested boxes lit
    const hl = clamp((t - w.riquadri! + 0.1) / 0.3);
    const xAt = (i: number, tt: number) => ((i * 360 + (tt - t0) * 220) % 2160) - 540;
    let hero = 0; // the card nearest the middle when "riquadri" is said
    for (let i = 1; i < 6; i++) if (Math.abs(xAt(i, w.riquadri!) + 170 - 540) < Math.abs(xAt(hero, w.riquadri!) + 170 - 540)) hero = i;
    for (let i = 0; i < 6; i++) {
      const px = xAt(i, t), py = by - 250;
      const isHero = i === hero && hl > 0;
      at(x, px + 170, py + 120, isHero ? 1 + 0.25 * ease.outBack(hl) : 1, 0, () => {
        aiSite(x, px, py, 340, 240, t);
        if (isHero) {
          x.strokeStyle = '#ffd93d'; x.lineWidth = 5;
          for (let b = 0; b < 3; b++) for (let d = 0; d < 3; d++) {
            const bx = px + 340 * (0.08 + b * 0.29), bb = py + 240 * 0.62, bw = 340 * 0.25, bh = 240 * 0.28;
            const inset = [0, 0.15, 0.32][d]!, k = clamp((t - w.riquadri! - d * 0.12 - b * 0.05) / 0.2);
            if (k > 0) { rr(x, bx + bw * inset, bb + bh * inset * 1.2, bw * (1 - 2 * inset), bh * (1 - 2 * inset * 1.2), 6); x.globalAlpha = k; x.stroke(); x.globalAlpha = 1; }
          }
        }
      });
    }
    // purple steam from the factory
    for (let i = 0; i < 8; i++) {
      const u = (t * 0.6 + i / 8) % 1;
      x.beginPath(); x.arc(200 + i * 100 + Math.sin(u * 5 + i) * 30, 520 - u * 400, 40 + u * 60, 0, TAU);
      x.fillStyle = `rgba(160,110,255,${0.18 * (1 - u)})`; x.fill();
    }
  }

  // 4 — the skill arrives, the stars roll up
  s4(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    const land = clamp((t - w.skill! + 0.2) / 0.6), landed = land >= 1;
    const bx = 540, base = FLOOR_Y + 140;
    bot(x, t, bx, base, 1.05, { hat: landed ? 'cap' : 'beret', shirt: true, hop: 16 * bump(t, w.skill! + 0.4, 0.35) });
    if (!landed) { // the crane lowers the cap
      const cy = lerp(-200, base - 330, ease.inOutCubic(land));
      x.fillStyle = '#e8a02c'; x.fillRect(bx - 10, -400, 20, cy + 400 - 60);
      x.strokeStyle = '#3b3b48'; x.lineWidth = 8; x.beginPath(); x.moveTo(bx - 60, cy - 60); x.lineTo(bx - 110, cy + 10); x.moveTo(bx + 60, cy - 60); x.lineTo(bx + 110, cy + 10); x.stroke();
      x.beginPath(); x.ellipse(bx, cy, 140, 30, 0, 0, TAU); x.fillStyle = GOLD_D; x.fill();
      x.beginPath(); x.ellipse(bx, cy - 14, 110, 74, 0, Math.PI, TAU); x.fillStyle = GOLD; x.fill();
    }
    // a label on the cap, and sparkles when it lands
    if (land > 0.3) txt(x, 'DESIGN SKILL', bx, base - 300 - (landed ? 0 : 80 * (1 - land)), 30, F.archivo(100, 900), '#5a3a10', { align: 'center', alpha: clamp((land - 0.3) * 3) });
    const sp = bump(t, w.skill! + 0.4, 0.8);
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10 && sp > 0; i++) { const a = (i / 10) * TAU, r = 160 + 140 * (1 - sp); x.beginPath(); x.arc(bx + Math.cos(a) * r, base - 330 + Math.sin(a) * r * 0.6, 8 * sp, 0, TAU); x.fillStyle = `rgba(255,220,120,${sp})`; x.fill(); }
    x.restore();
    // the star counter
    const k = pop(t, w.stelle! - 0.3, 0.35);
    at(x, 540, 640, k, -0.03, () => {
      paperPiece(x, () => tornRect(x, 250, 560, 580, 160, 21, 5), PAPER, { shadow: 14, speckle: 30, seed: 8 });
      x.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 22 : 50; x.lineTo(330 + Math.cos(a) * r, 640 + Math.sin(a) * r); }
      x.closePath(); x.fillStyle = GOLD; x.fill();
      const v = Math.floor(75000 * ease.outCubic(clamp((t - w.stelle!) / 1.0)));
      txt(x, `${v.toLocaleString('it-IT')}+`, 600, 668, 76, F.fraunces(900), INK, { align: 'center' });
    });
  }

  // 5 — one command
  s5(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    const cmd = 'ridisegna la mia homepage';
    const n = Math.max(0, Math.min(cmd.length, Math.floor((t - w.comando! - 0.1) * 26)));
    at(x, 540, 720, pop(t, t0 + 0.05, 0.35), -0.01, () => {
      paperPiece(x, () => rr(x, 90, 640, 900, 150, 24), '#1f1c22', { shadow: 16, speckle: 0 });
      txt(x, '>', 140, 740, 64, F.mono(700), '#ff9a6c');
      txt(x, cmd.slice(0, n), 200, 735, 44, F.mono(500), '#f4ede0');
      if (Math.floor(t * 2.5) % 2 === 0 || n < cmd.length) { x.fillStyle = '#f4ede0'; x.fillRect(206 + n * 26.4, 700, 22, 46); }
    });
    // the Enter key pressed on "ridisegna"
    const press = t > w.ridisegna! && t < w.ridisegna! + 0.2 ? 1 : 0;
    at(x, 770, 980, pop(t, t0 + 0.25, 0.35), 0, () => {
      paperPiece(x, () => rr(x, 650, 920 + press * 10, 240, 120, 18), CREAM, { shadow: press ? 2 : 14, speckle: 0 });
      txt(x, 'INVIO', 770, 995 + press * 10, 44, F.archivo(100, 900), INK, { align: 'center' });
    });
    bot(x, t, 330, FLOOR_Y + 140, 0.9, { hat: 'cap', shirt: true, look: 0.4 });
  }

  // 6 — a pro redesign: the canvas turns over
  s6(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    const cx0 = 270, cy0 = 600, cw = 580, ch = 420;
    const fl = clamp((t - t0 - 0.1) / 0.45), sx = Math.abs(Math.cos(fl * Math.PI));
    easel(x, cx0, cy0, cw, ch, () => {
      x.save(); x.translate(cx0 + cw / 2, 0); x.scale(Math.max(0.02, sx), 1); x.translate(-(cx0 + cw / 2), 0);
      if (fl < 0.5) aiSite(x, cx0, cy0, cw, ch, t); else goodSite(x, cx0, cy0, cw, ch);
      x.restore();
    });
    // spacing guides, colours, type, on their words
    const g = clamp((t - w.spaziature!) / 0.3);
    if (g > 0) {
      x.save(); x.globalAlpha = g; x.strokeStyle = '#ff4fa3'; x.fillStyle = '#ff4fa3'; x.lineWidth = 3;
      for (const [ax, ay, bx, by, lab] of [[cx0, cy0 + 60, cx0 + cw * 0.09, cy0 + 60, '48'], [cx0 + cw * 0.09, cy0 + ch * 0.62, cx0 + cw * 0.09, cy0 + ch * 0.68, '24']] as const) {
        x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
        rr(x, (ax + bx) / 2 - 28, (ay + by) / 2 - 44, 56, 34, 8); x.fill();
        txt(x, lab, (ax + bx) / 2, (ay + by) / 2 - 18, 24, F.mono(700), '#ffffff', { align: 'center' });
      }
      x.restore();
    }
    const sw = pop(t, w.colori!, 0.3);
    at(x, 740, 1150, sw, 0.04, () => {
      paperPiece(x, () => rr(x, 600, 1100, 300, 100, 14), PAPER, { shadow: 10, speckle: 0 });
      ['#20463a', '#c4633a', '#e3b04b', '#2b2a26'].forEach((c, i) => { rr(x, 620 + i * 70, 1120, 56, 60, 8); x.fillStyle = c; x.fill(); });
    });
    const fo = pop(t, w.font!, 0.3);
    at(x, 200, 1130, fo, -0.06, () => {
      paperPiece(x, () => rr(x, 100, 1060, 200, 150, 14), '#20463a', { shadow: 10, speckle: 0 });
      txt(x, 'Aa', 200, 1165, 90, F.serif(600), CREAM, { align: 'center' });
    });
    bot(x, t, 860, FLOOR_Y + 150, 0.65, { hat: 'cap', shirt: true, look: -1 });
  }

  // 7 — 61 tells, gone
  s7(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    const cols = 5, rows = 3, tw = 170, th = 120, gx = 540 - (cols * (tw + 20)) / 2 + 10, gy = 560;
    const a = w.corregge! - 0.1, b = w.veda!;
    for (let i = 0; i < cols * rows; i++) {
      const c = i % cols, r = Math.floor(i / cols), px = gx + c * (tw + 20), py = gy + r * (th + 30);
      const order = hash(i, 13), tf = lerp(a, b, order), fl = clamp((t - tf) / 0.3), sx = Math.abs(Math.cos(fl * Math.PI));
      const k = pop(t, t0 + i * 0.02, 0.3);
      at(x, px + tw / 2, py + th / 2, k, (hash(i, 2) - 0.5) * 0.05, () => {
        paperPiece(x, () => rr(x, px - 8, py - 8, tw + 16, th + 16, 8), GOLD_D, { shadow: 8, speckle: 0 });
        x.save(); x.translate(px + tw / 2, 0); x.scale(Math.max(0.02, sx), 1); x.translate(-(px + tw / 2), 0);
        if (fl < 0.5) aiSite(x, px, py, tw, th, t); else goodSite(x, px, py, tw, th);
        x.restore();
      });
    }
    // the counter falls as they turn
    const left = Math.round(61 * (1 - clamp((t - a) / (b - a + 0.3))));
    at(x, 540, 1140, pop(t, t0 + 0.2, 0.35), -0.02, () => {
      paperPiece(x, () => tornRect(x, 330, 1060, 420, 170, 17, 5), '#2a2320', { shadow: 14, speckle: 20, seed: 4 });
      txt(x, String(left), 470, 1180, 110, F.fraunces(900), left ? '#ff9a6c' : '#7ee0a0', { align: 'center' });
      txt(x, left ? 'SEGNALI' : 'PULITO', 640, 1165, 34, F.archivo(100, 900), '#cdbf9e', { align: 'center' });
    });
  }

  // 8 — comment POLISH
  s8(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    const g = pop(t, w.gratis! - 0.1, 0.35);
    at(x, 540, 700, g, -0.08, () => {
      paperPiece(x, () => tornRect(x, 330, 620, 420, 160, 41, 5), '#2fa36b', { shadow: 14, speckle: 30, seed: 6 });
      txt(x, 'GRATIS', 540, 728, 92, F.archivo(100, 900), CREAM, { align: 'center' });
    });
    // a pencil writing a tick beside it
    const pk = clamp((t - w.gratis!) / 0.5);
    x.save(); x.translate(800 + 30 * pk, 560 - 20 * Math.sin(pk * Math.PI)); x.rotate(0.6);
    x.fillStyle = GOLD; x.fillRect(-12, -120, 24, 120); x.fillStyle = '#f4d3b0'; x.beginPath(); x.moveTo(-12, 0); x.lineTo(12, 0); x.lineTo(0, 30); x.closePath(); x.fill();
    x.restore();
    commentBox(x, t, 540, 1050, 'POLISH', w.polish! - 0.05, pop(t, t0, 0.35));
    bot(x, t, 540, FLOOR_Y + 120, 0.8, { hat: 'cap', shirt: true, wave: true });
  }
}
