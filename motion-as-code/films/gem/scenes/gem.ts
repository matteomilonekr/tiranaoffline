// The whole of `gem`, one plate, seven shots in the paper-night workshop (films/_paper/stage.ts):
//  1. the box creature wears a price tag, 50,00 $; the whale swims in on "DeepSeek" and bites it down,
//     21,40 → 9,90 → 3,96, coins bursting at the last bite;
//  2. "Si chiama DeepGEMM": the repo card; GRATIS stamped on "gratis", the MIT badge on "open source";
//  3. "proprio il codice con cui DeepSeek addestra": the engine, gears turning, the whale on the lever;
//  4. "gli stessi computer rispondono a molte più domande": the answer machine, its counter racing;
//  5. "quindi ogni risposta costa molto meno": one coin in, a flood of answers out;
//  6. "dove Claude chiede cinquanta dollari ... DeepSeek ne chiede meno di quattro": the price board, -92%;
//  7. "Commenta GEM": the comment box, a gem, the two of them.
// The prices are the ones the original post quotes (per million output tokens): check them before you publish.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT } from '@kit/engine/gl';
import type { Lyrics, Word } from '@kit/engine/lyrics';
import {
  W, H, F, FLOOR_Y, TAU, PAPER, CREAM, INK, BLUE, GOLD, GOLD_D, clamp, ease, hash, lerp,
  room, atmosphere, banner, PaperCaptions, bot, whale, coin, commentBox, gem, shotCam, withCam, paperPiece, tornRect, rr, txt, at,
  pop, bump,
} from '../../_paper/stage';

const CUT_LEAD = 0.18;

function wordAt(ly: Lyrics, q: string, after = 0): Word {
  const k = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const w = ly.words.find((w) => k(w.w) === k(q) && w.start >= after - 1e-6);
  if (!w) throw new Error(`word not found: ${q} after ${after}`);
  return w;
}

/** A price tag with bites taken out of its right edge; the price flips like a display. */
function priceTag(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rot: number, price: string, bites: number, flip: number) {
  x.save();
  x.translate(cx, cy); x.rotate(rot);
  x.save();
  x.beginPath(); x.rect(-w * 2, -h * 2, w * 4, h * 4);
  for (let b = 0; b < bites; b++) { // each bite: three overlapping teeth marks along the right edge
    const by = lerp(-h * 0.3, h * 0.32, (b * 0.618) % 1), bx = w / 2 - b * w * 0.09;
    for (let k = -1; k <= 1; k++) { const r = h * (0.17 - Math.abs(k) * 0.03); x.moveTo(bx + r + k * 4, by + k * h * 0.13); x.arc(bx + k * 4, by + k * h * 0.13, r, 0, TAU); }
  }
  x.clip('evenodd');
  paperPiece(x, () => { x.beginPath(); x.moveTo(-w / 2 + h * 0.35, -h / 2); x.lineTo(w / 2, -h / 2); x.lineTo(w / 2, h / 2); x.lineTo(-w / 2 + h * 0.35, h / 2); x.lineTo(-w / 2, 0); x.closePath(); }, CREAM, { shadow: 12, speckle: 40, seed: 5 });
  x.beginPath(); x.arc(-w / 2 + h * 0.3, 0, h * 0.09, 0, TAU); x.fillStyle = '#3b2a20'; x.fill(); // the hole
  x.fillStyle = '#e8572a'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; x.fillRect(-w * 0.02 + Math.cos(a) * 14, -h * 0.28 + Math.sin(a) * 14, 4, 4); }
  x.save(); x.scale(1, Math.max(0.05, Math.abs(Math.cos(flip * Math.PI))));
  txt(x, price, w * 0.08, h * 0.22, h * 0.38, F.fraunces(900), INK, { align: 'center' });
  x.restore();
  x.restore();
  x.restore();
}

/** Coins thrown from (cx, cy) at t0: n of them, arcs under gravity. */
function coinBurst(x: CanvasRenderingContext2D, t: number, t0: number, cx: number, cy: number, n = 14, seed = 1) {
  const u = t - t0;
  if (u < 0 || u > 2.2) return;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (hash(i, seed) - 0.5) * 2.2, v = 700 + 500 * hash(i, seed + 1);
    const px = cx + Math.cos(a) * v * u, py = cy + Math.sin(a) * v * u + 1400 * u * u;
    coin(x, px, py, 26 + 10 * hash(i, seed + 2), u * 9 + i);
  }
}

/** Paper slips (answers) flying out of (cx, cy): `rate` per second from t0, for `dur`. */
function slips(x: CanvasRenderingContext2D, t: number, t0: number, dur: number, cx: number, cy: number, rate: number, seed = 1) {
  const n = Math.floor(Math.max(0, Math.min(t, t0 + dur) - t0) * rate);
  for (let i = 0; i < n; i++) {
    const born = t0 + i / rate, u = t - born;
    if (u > 1.6) continue;
    const a = -Math.PI / 2 + (hash(i, seed) - 0.5) * 1.8, v = 900 + 400 * hash(i, seed + 1);
    const px = cx + Math.cos(a) * v * u, py = cy + Math.sin(a) * v * u + 1300 * u * u;
    at(x, px, py, 1, u * (hash(i, seed + 2) - 0.5) * 10, () => {
      paperPiece(x, () => rr(x, px - 46, py - 30, 92, 60, 4), '#f6efdf', { shadow: 5, speckle: 0 });
      x.fillStyle = '#9a8f7c'; x.fillRect(px - 34, py - 14, 60, 6); x.fillRect(px - 34, py, 46, 6);
    });
  }
}

export default class Gem extends Scene {
  layer = new Layer2D();
  caps!: PaperCaptions;
  w: Record<string, number> = {};
  cuts: number[] = [];
  shots: [number, number][] = [];

  override init() {
    const ly = this.ctx.lyrics;
    this.caps = new PaperCaptions(ly);
    const cut = (i: number) => {
      const l = ly.lines[i]!, p = ly.lines[i - 1];
      return Math.max(l.words[0]!.start - CUT_LEAD, p ? Math.min(p.end + 0.02, l.words[0]!.start - 0.02) : 0);
    };
    this.cuts = ly.lines.map((_, i) => cut(i));
    const at = (q: string, after = 0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.deepseek = at('DeepSeek');
    w.bite1 = at('reso'); w.bite2 = at('motore'); w.bite3 = at('intelligenza');
    w.gratis = at('gratis'); w.open = at('open'); w.proprio = at('proprio'); w.addestra = at('addestra');
    w.molte = at('molte'); w.quindi = at('quindi'); w.ogni = at('ogni', w.quindi); w.costa = at('costa', w.quindi);
    w.claude = at('Claude', this.cuts[3]!); w.cinquanta = at('cinquanta'); w.meno = at('meno', w.cinquanta); w.quattro = at('quattro', w.cinquanta);
    w.gem = at('GEM'); w.link = at('link');
    const end = this.ctx.end;
    const s = [0, this.cuts[1]!, w.proprio - 0.15, this.cuts[2]!, w.quindi - 0.12, this.cuts[3]!, this.cuts[4]!, end];
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
    const cams: [number, number, number][] = [[560, 1080, 1.24], [540, 900, 1.12], [570, 980, 1.2], [520, 1040, 1.22], [520, 1040, 1.22], [540, 920, 1.12], [540, 1000, 1.1]];
    const c = shotCam(t, t0, t1, cams[k]![0], cams[k]![1], cams[k]![2]);
    withCam(x, c, () => {
      room(x, t, { win: k % 2 ? [160, 920] : [200, 880], lamp: [540, 760, 420, 540, 600, 540, 540][k] });
      [this.s1, this.s2, this.s3, this.s4, this.s5, this.s6, this.s7][k]!.call(this, x, t, t0);
    });
    atmosphere(x, t);
    banner(x, t, [
      [0, '50 $ SU CLAUDE, 3,96 $ SU DEEPSEEK'], [this.shots[1]![0], 'GRATIS E OPEN SOURCE (MIT)'], [this.shots[2]![0], 'IL MOTORE SOTTO DEEPSEEK'],
      [this.shots[3]![0], 'STESSI COMPUTER, PIÙ RISPOSTE'], [this.shots[4]![0], 'UNA MONETA, MILLE RISPOSTE'], [this.shots[5]![0], 'IL 92% IN MENO'], [this.shots[6]![0], 'COMMENTA GEM'],
    ]);
    this.caps.draw(x, t);
    comp.draw(renderer, L.upload(), out);
    const hit = bump(t, this.w.bite1!, 0.18) + bump(t, this.w.bite2!, 0.18) + bump(t, this.w.bite3!, 0.22) + bump(t, t0, 0.2) * 0.6;
    return { bloom: 0.35, bloomThreshold: 0.78, halation: 0.25, ca: 0.8 + hit, grain: 0.07, vignette: 0.25, hud: 0, shake: [6 * hit * Math.sin(t * 80), 5 * hit * Math.cos(t * 70)] };
  }

  // 1 — the price tag, bitten down
  s1(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    const bites = [w.bite1!, w.bite2!, w.bite3!];
    const n = bites.filter((b) => t >= b).length;
    const prices = ['50,00 $', '21,40 $', '9,90 $', '3,96 $'];
    const flip = n > 0 ? clamp((t - bites[n - 1]!) / 0.25) : 1;
    const bx = 400, base = FLOOR_Y + 110;
    bot(x, t, bx, base, 1.25, { hat: 'goggles', look: t > w.deepseek! ? 1 : 0, hop: 14 * bump(t, w.bite3!, 0.4) });
    // the tag hangs on a string from the creature's corner
    const tx = 640, ty = 1060 + Math.sin(t * 2) * 8, rot = -0.08 + 0.05 * Math.sin(t * 1.6) + 0.12 * bump(t, bites[Math.max(0, n - 1)]!, 0.3);
    x.strokeStyle = '#d9c9a6'; x.lineWidth = 3; x.beginPath(); x.moveTo(bx + 140, base - 300); x.quadraticCurveTo(520, ty - 120, tx - 150, ty); x.stroke();
    priceTag(x, tx, ty, 330, 170, rot, prices[n]!, n, n > 0 ? 1 - flip : 0);
    // the whale: in on "DeepSeek", a lunge at each bite
    const enter = ease.outCubic(clamp((t - w.deepseek! + 0.1) / 0.7));
    let wx = lerp(1400, 960, enter), wy = 760;
    for (const b of bites) {
      const u = t - b;
      if (u > -0.25 && u < 0.4) {
        const k = u < 0 ? ease.inCubic((u + 0.25) / 0.25) : 1 - ease.outCubic(u / 0.4);
        wx -= 150 * k; wy += 140 * k;
      }
    }
    const mouth = Math.max(...bites.map((b) => { const u = t - b; return u > -0.25 && u < 0 ? (u + 0.25) / 0.25 : u >= 0 && u < 0.12 ? 1 - u / 0.12 : 0; }));
    whale(x, t, wx, wy, 1.15, { dir: -1, mouth });
    coinBurst(x, t, w.bite3! + 0.05, tx, ty, 16, 3);
  }

  // 2 — the repo, free and open
  s2(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w, k = pop(t, t0 + 0.05, 0.4);
    at(x, 540, 900, k, -0.02, () => {
      paperPiece(x, () => tornRect(x, 90, 600, 900, 560, 9, 5), PAPER, { shadow: 16, speckle: 60, seed: 2 });
      x.beginPath(); x.arc(160, 690, 30, 0, TAU); x.fillStyle = BLUE; x.fill();
      txt(x, 'deepseek-ai /', 210, 680, 38, F.mono(500), '#4a5ad0');
      txt(x, 'DeepGEMM', 210, 730, 54, F.mono(700), '#2a3aa8');
      rr(x, 720, 690, 140, 52, 26); x.lineWidth = 3; x.strokeStyle = '#8b8370'; x.stroke();
      txt(x, 'Public', 790, 726, 28, F.grotesk(600), '#6e6656', { align: 'center' });
      x.fillStyle = '#d9cfb6'; x.fillRect(140, 780, 800, 3);
      txt(x, 'Kernel FP8 GEMM, puliti ed efficienti,', 140, 850, 36, F.grotesk(500), INK);
      txt(x, 'per addestrare e far girare i modelli.', 140, 898, 36, F.grotesk(500), INK);
      for (let i = 0; i < 4; i++) { x.fillStyle = '#c9bfa6'; x.fillRect(140, 950 + i * 34, 520 - i * 70, 12); }
    });
    // MIT badge on "open source", GRATIS stamped on "gratis"
    const b = pop(t, w.open! - 0.05);
    at(x, 820, 1080, b, 0.06, () => { paperPiece(x, () => rr(x, 720, 1040, 200, 80, 40), '#2fa36b', { shadow: 8, speckle: 0 }); txt(x, 'MIT', 820, 1096, 50, F.archivo(100, 900), CREAM, { align: 'center' }); });
    const s = t >= w.gratis! ? lerp(2, 1, ease.outCubic(clamp((t - w.gratis!) / 0.15))) : 0;
    at(x, 330, 1100, s, -0.16, () => {
      x.save(); x.globalAlpha *= clamp((t - w.gratis!) / 0.1);
      rr(x, 170, 1050, 320, 100, 14); x.lineWidth = 9; x.strokeStyle = '#d9302c'; x.stroke();
      txt(x, 'GRATIS', 330, 1122, 70, F.archivo(100, 900), '#d9302c', { align: 'center' });
      x.restore();
    });
    whale(x, t, 980, 1330, 0.75, { dir: -1, mouth: 0.2 + 0.2 * Math.sin(t * 4) });
  }

  // 3 — the engine DeepSeek runs on
  s3(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w, k = pop(t, t0, 0.4);
    const cx = 600, base = FLOOR_Y + 120;
    at(x, cx, base - 300, k, 0, () => {
      // the machine body
      paperPiece(x, () => rr(x, cx - 260, base - 470, 520, 470, 20), '#8a5a3a', { shadow: 18, speckle: 50, seed: 4 });
      x.fillStyle = '#6e4630'; x.fillRect(cx - 260, base - 120, 520, 24);
      // the glass dome with the glowing core
      const glow = 0.6 + 0.4 * Math.sin(t * 6);
      x.save(); x.globalCompositeOperation = 'lighter';
      const g = x.createRadialGradient(cx, base - 600, 10, cx, base - 600, 200);
      g.addColorStop(0, `rgba(120,200,255,${0.55 * glow})`); g.addColorStop(1, 'rgba(120,200,255,0)');
      x.fillStyle = g; x.fillRect(cx - 220, base - 820, 440, 440);
      x.restore();
      x.beginPath(); x.arc(cx, base - 470, 170, Math.PI, TAU); x.closePath(); x.fillStyle = 'rgba(180,220,255,0.22)'; x.fill();
      x.strokeStyle = 'rgba(230,245,255,0.7)'; x.lineWidth = 6; x.stroke();
      txt(x, 'GEMM', cx, base - 540, 54, F.mono(700), `rgba(210,240,255,${0.7 + 0.3 * glow})`, { align: 'center' });
      // gears
      for (const [gx, gy, r, dir] of [[cx - 150, base - 280, 70, 1], [cx - 40, base - 220, 46, -1], [cx + 150, base - 300, 80, -1]] as const) {
        x.save(); x.translate(gx, gy); x.rotate(t * 2.2 * dir * (70 / r));
        x.beginPath();
        for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, rr2 = i % 2 ? r : r * 0.84; x.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
        x.closePath(); x.fillStyle = GOLD; x.fill();
        x.beginPath(); x.arc(0, 0, r * 0.3, 0, TAU); x.fillStyle = GOLD_D; x.fill();
        x.restore();
      }
      // steam on each turn of the lever
      for (let i = 0; i < 6; i++) {
        const u = ((t * 0.9 + i / 6) % 1);
        x.beginPath(); x.arc(cx + 230 + Math.sin(u * 6 + i) * 20, base - 480 - u * 300, 30 + u * 50, 0, TAU);
        x.fillStyle = `rgba(230,235,245,${0.25 * (1 - u)})`; x.fill();
      }
    });
    // the whale on the lever (pulls it on "addestra"), the creature watching
    const pull = clamp((t - w.addestra!) / 0.3);
    x.save(); x.translate(cx + 300, base - 260); x.rotate(-0.6 + 1.0 * ease.outBack(pull));
    x.fillStyle = '#3b3b48'; x.fillRect(-8, -150, 16, 150); x.beginPath(); x.arc(0, -150, 22, 0, TAU); x.fillStyle = '#d9302c'; x.fill();
    x.restore();
    whale(x, t, cx + 380, base - 520, 0.8, { dir: -1, mouth: 0.15 });
    bot(x, t, 230, FLOOR_Y + 120, 0.75, { hat: 'goggles', look: 1 });
  }

  // 4 — the same computers answer far more questions
  s4(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w, k = pop(t, t0, 0.4);
    const cx = 560, base = FLOOR_Y + 150;
    at(x, cx, base - 300, k, 0, () => {
      paperPiece(x, () => rr(x, cx - 230, base - 640, 460, 640, 24), '#6b4632', { shadow: 18, speckle: 50, seed: 6 });
      paperPiece(x, () => rr(x, cx - 170, base - 590, 340, 120, 14), '#2a2320', { shadow: 0, speckle: 0 });
      // the counter: digits racing faster after "molte"
      const v = Math.floor(7 + Math.max(0, t - t0) * 6 + (t > w.molte! ? (t - w.molte!) ** 2 * 450 : 0));
      const s = String(Math.min(9999, v)).padStart(4, '0');
      s.split('').forEach((d, i) => {
        rr(x, cx - 150 + i * 76, base - 575, 64, 90, 8); x.fillStyle = '#f4ead2'; x.fill();
        txt(x, d, cx - 118 + i * 76, base - 508, 68, F.mono(700), INK, { align: 'center' });
      });
      // the slot the answers come out of
      rr(x, cx - 120, base - 330, 240, 26, 12); x.fillStyle = '#1c1714'; x.fill();
      x.beginPath(); x.arc(cx, base - 180, 70, 0, TAU); x.fillStyle = '#e9d9b0'; x.fill(); x.lineWidth = 10; x.strokeStyle = GOLD_D; x.stroke();
      txt(x, '?', cx, base - 150, 90, F.fraunces(900), '#8a5a3a', { align: 'center' });
    });
    slips(x, t, w.molte! - 0.2, 10, cx, base - 330, t > w.molte! ? 14 : 4, 2);
    bot(x, t, 220, FLOOR_Y + 130, 0.7, { hat: 'goggles', look: 1, hop: 10 * Math.max(0, Math.sin(t * 8)) * (t > w.molte! ? 1 : 0) });
  }

  // 5 — one coin in, a flood of answers out
  s5(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    this.s4(x, t, t0 - 10); // the same machine, already up
    const u = clamp((t - (w.ogni! - 0.35)) / 0.45);
    if (u < 1) coin(x, lerp(260, 560, ease.inOutCubic(u)), lerp(700, FLOOR_Y - 180, ease.inCubic(u)) - Math.sin(u * Math.PI) * 220, 40, t * 10);
    slips(x, t, w.costa! - 0.1, 3, 560, FLOOR_Y - 180, 40, 7);
  }

  // 6 — the price board
  s6(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w, k = pop(t, t0, 0.4);
    at(x, 540, 850, k, -0.015, () => {
      paperPiece(x, () => tornRect(x, 110, 560, 860, 600, 12, 5), '#2a2320', { shadow: 18, speckle: 30, seed: 3 });
      txt(x, 'PER 1 MILIONE DI TOKEN IN OUTPUT', 540, 630, 30, F.archivo(100, 700), '#cdbf9e', { align: 'center' });
      const row = (y: number, name: string, price: string, at0: number, col: string) => {
        txt(x, name, 170, y, 52, F.archivo(100, 900), col);
        const f = clamp((t - at0) / 0.3);
        rr(x, 560, y - 70, 360, 100, 12); x.fillStyle = '#14100e'; x.fill();
        x.save(); x.translate(740, y - 20); x.scale(1, Math.max(0.05, f < 1 ? Math.abs(Math.cos(f * Math.PI * 1.5)) : 1));
        txt(x, f > 0.5 ? price : '--,-- $', 0, 26, 74, F.mono(700), f > 0.5 ? '#ffd27a' : '#5a5046', { align: 'center' });
        x.restore();
      };
      row(780, 'CLAUDE', '50,00 $', w.cinquanta!, '#ff9a6c');
      row(980, 'DEEPSEEK', ' 3,96 $', w.quattro!, '#8fb0ff');
    });
    bot(x, t, 210, FLOOR_Y + 150, 0.65, { hat: 'goggles', look: 1 });
    whale(x, t, 930, 1330, 0.6, { dir: -1, mouth: 0.25 * bump(t, w.quattro!, 0.6) });
    coinBurst(x, t, w.quattro! + 0.2, 760, 1000, 12, 9);
    const s = t >= w.quattro! + 0.55 ? lerp(2.2, 1, ease.outCubic(clamp((t - w.quattro! - 0.55) / 0.15))) : 0;
    at(x, 760, 1240, s, -0.12, () => {
      rr(x, 610, 1185, 300, 110, 14); x.fillStyle = 'rgba(251,243,225,0.95)'; x.fill(); x.lineWidth = 9; x.strokeStyle = '#2fa36b'; x.stroke();
      txt(x, '-92%', 760, 1265, 80, F.archivo(100, 900), '#2fa36b', { align: 'center' });
    });
  }

  // 7 — comment GEM
  s7(x: CanvasRenderingContext2D, t: number, t0: number) {
    const w = this.w;
    gem(x, 540, 720, 120 * pop(t, t0 + 0.1, 0.4), t);
    commentBox(x, t, 540, 1080, 'GEM', w.gem! - 0.05, pop(t, t0, 0.35));
    bot(x, t, 270, FLOOR_Y + 150, 0.75, { hat: 'goggles', wave: true, look: 0.5 });
    whale(x, t, 860, 1320, 0.65, { dir: -1, mouth: 0.2 });
    for (let i = 0; i < 10; i++) { const u = ((t - t0) * 0.35 + hash(i, 4)) % 1; coin(x, hash(i, 5) * W, lerp(-80, H * 0.7, u), 22, t * 6 + i); }
  }
}
