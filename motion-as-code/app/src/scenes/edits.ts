// PLATE 8 `edits` — "E siccome è tutto procedurale, ogni modifica è una frase. Rallenta la transizione.
// Cambia il colore. Aggiungi una scena. Renderizza di nuovo. Quattro comandi, invece di centinaia di
// keyframe da spostare a mano."
// Left: a session log where each spoken command is typed as a prompt, followed by the edit it makes (a
// one-line diff). Right: a small live composition that actually obeys — the transition slows down, the
// accent turns electric blue (the one place the palette breaks, on request), a scene slides into its
// timeline, a render bar runs to a tick. "Quattro comandi": the four prompts are numbered; "centinaia di
// keyframe": the right side fills with hundreds of keyframe diamonds and a cursor drags one, by hand.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, measure, plain } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, hash, hexToLinear, lerp, prog, pulse, TAU } from '../engine/util';
import { Paper, camAt, K, w2s, setWorld, layWords, drawWords, sparkHead, lineOf, phraseOf, mixCss, wp, type Cam, type CamKey, type KWord, type RGB } from './_vo';

const BLUE = '#3D7BFF';
const BLUE_LIN = hexToLinear(BLUE);
const LX = 100, LY = 220, LW = 800, LH_ = 660; // the session log
const PX = 960, PY = 220, PW_ = 860, PH_ = 484; // the preview

interface Cmd { line: Line; diff: [string, string][]; n: number }

export default class Edits extends Scene {
  paper = new Paper(24, 120);
  lines = new LineBatch(30000, { blend: 'add' });
  fx = new LineBatch(4000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L13!: Line; L18!: Line;
  cmds: Cmd[] = [];
  head: KWord[] = []; tail: KWord[] = [];
  w: Record<string, Word> = {};
  T0 = 0; T1 = 0;
  tSlow = 0; tBlue = 0; tScene = 0; tRender = 0; tFour = 0; tKeys = 0; tHand = 0;

  override init() {
    const ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L13 = lineOf(ly, 'tutto procedurale');
    this.L18 = lineOf(ly, 'Quattro comandi');
    const mk = (q: string, diff: [string, string][], n: number): Cmd => ({ line: lineOf(ly, q), diff, n });
    this.cmds = [
      mk('Rallenta la transizione', [['-', 'transizione: 0.6 s'], ['+', 'transizione: 1.2 s']], 1),
      mk('Cambia il colore', [['-', "accento: 'signal'"], ['+', "accento: 'blu elettrico'"]], 2),
      mk('Aggiungi una scena', [['+', "E('caricamento', …)  // timeline.ts"]], 3),
      mk('Renderizza di nuovo', [['$', 'bun run render  →  out/motion-as-code.mp4']], 4),
    ];
    this.tSlow = this.cmds[0]!.line.end; this.tBlue = this.cmds[1]!.line.end; this.tScene = this.cmds[2]!.line.end; this.tRender = this.cmds[3]!.line.end;
    this.w.quattro = this.L18.words[0]!;
    this.w.centinaia = phraseOf(ly, 'centinaia', { line: this.L18 })[0]!;
    this.w.mano = phraseOf(ly, 'mano', { line: this.L18 })[0]!;
    this.w.spostare = phraseOf(ly, 'spostare', { line: this.L18 })[0]!;
    this.w.procedurale = phraseOf(ly, 'procedurale', { line: this.L13 })[0]!;
    this.tFour = this.w.quattro!.start; this.tKeys = this.w.centinaia!.start; this.tHand = this.w.spostare!.start;
    this.head = layWords(this.L13.words, W / 2, 130, 50, F.archivo(100, 600), { align: 'center', ant: 0.25 });
    this.tail = layWords(this.L18.words, W / 2, 985, 50, F.archivo(100, 600), { align: 'center', ant: 0.25 });
    const mid = { x: W / 2, y: H / 2 + 20 };
    const c0 = this.cmds[0]!.line.start;
    this.cams = [
      K(this.T0, mid.x + 60, mid.y - 60, 1.12, 0.0),
      K(this.w.procedurale!.end, mid.x + 40, mid.y - 30, 1.06, 0.0, ease.inOutQuad),
      K(c0 - 0.1, mid.x, mid.y, 1.0, 0.0, ease.inOutCubic),
      K(this.tFour - 0.1, mid.x, mid.y, 1.02, 0.0, ease.linear),
      K(this.tKeys + 0.3, mid.x + 30, mid.y + 40, 1.0, 0.0, ease.inOutCubic),
      K(this.tHand + 0.3, PX + 520, PY + 300, 1.45, 0.0, ease.inOutCubic),
      K(this.T1, PX + 540, PY + 310, 1.55, 0.0, ease.linear),
    ];
  }

  cam(t: number): Cam { return camAt(this.cams, t); }

  /** The demo composition's transition length at t (slowed down by command 1). */
  transDur(t: number) { return lerp(0.6, 1.2, ease.inOutCubic(prog(t, this.tSlow, this.tSlow + 0.4))); }
  /** Phase 0..1 of the shape between its two marks (ping-pong with holds). Integrated so the change is smooth. */
  demoPhase(t: number) {
    // the clock runs at 1 / transDur: integrate the rate piecewise (pure function of t)
    const a = this.T0, s = this.tSlow, e = this.tSlow + 0.4;
    const rate = (x: number) => 1 / this.transDur(x);
    let u = 0;
    if (t <= s) u = (t - a) * rate(a);
    else {
      u = (s - a) * rate(a);
      const N = 16, tt = Math.min(t, e);
      for (let i = 0; i < N; i++) { const x0 = s + ((tt - s) * i) / N; u += ((tt - s) / N) * rate(x0 + (tt - s) / (2 * N)); }
      if (t > e) u += (t - e) * rate(e);
    }
    const cyc = u / 2.4; // move, hold, move back, hold
    const f = cyc - Math.floor(cyc);
    const k = f < 0.35 ? ease.inOutCubic(f / 0.35) : f < 0.5 ? 1 : f < 0.85 ? 1 - ease.inOutCubic((f - 0.5) / 0.35) : 0;
    return k;
  }
  accent(t: number): RGB {
    const k = ease.inOutCubic(prog(t, this.tBlue, this.tBlue + 0.35));
    return [lerp(LIN.signal[0], BLUE_LIN[0], k), lerp(LIN.signal[1], BLUE_LIN[1], k), lerp(LIN.signal[2], BLUE_LIN[2], k)];
  }
  keysOn(t: number) { return prog(t, this.tKeys - 0.1, this.tKeys + 0.2); }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = this.cam(t);
    this.paper.render(renderer, out, c, { alpha: 0.42 });

    const L = this.lines; L.clear();
    this.drawFrames(L, c, t);
    this.drawDemo(L, c, t);
    this.drawKeys(L, c, t);
    L.render(renderer, out);

    const T = this.text; T.clear();
    const x = T.ctx;
    drawWords(x, c, this.head, t, { alpha: 1 - prog(t, this.cmds[0]!.line.start - 0.4, this.cmds[0]!.line.start) });
    this.drawLog(x, c, t);
    this.drawPreviewText(x, c, t);
    drawWords(x, c, this.tail, t, {});
    this.drawHand(x, c, t);
    comp.draw(renderer, T.upload(), out);

    const X = this.fx; X.clear();
    const caret = this.caretPos(t);
    if (caret) { const s = w2s(c, caret.x, caret.y); sparkHead(X, s[0], s[1], t, 0.5, caret.hot); }
    X.render(renderer, out);

    let hit = 0;
    for (const cm of this.cmds) hit = Math.max(hit, pulse(t, cm.line.end, 0.08));
    return { bloom: 0.62, bloomThreshold: 0.86, vignette: 0.42, zoom: 1 + 0.008 * hit + 0.012 * pulse(t, this.tFour, 0.08) };
  }

  // ------------------------------------------------------------------ the session log
  rowY(i: number) { return LY + 110 + i * 130; }
  caretPos(t: number): { x: number; y: number; hot: number } | null {
    for (let i = this.cmds.length - 1; i >= 0; i--) {
      const cm = this.cmds[i]!;
      if (t < cm.line.start - 0.25) continue;
      if (t > cm.line.end + 0.6) return null;
      const s = this.typedOf(cm, t);
      return { x: LX + 76 + measure(s, F.mono(400), 30) + 6, y: this.rowY(i) - 12, hot: 0.4 };
    }
    return null;
  }
  typedOf(cm: Cmd, t: number) {
    let s = '';
    for (const wd of cm.line.words) {
      if (t < wd.start) break;
      const txt = plain(wd.w);
      s += (s ? ' ' : '') + txt.slice(0, Math.max(1, Math.ceil(txt.length * wp(wd, t))));
    }
    return s;
  }

  drawLog(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const a = prog(t, this.T0 + 0.1, this.T0 + 0.5);
    if (a <= 0) return;
    setWorld(x, c, LX, LY, 1);
    x.strokeStyle = rgba('ash', 0.5 * a);
    x.lineWidth = 1.2;
    x.strokeRect(0, 0, LW, LH_);
    x.font = font(F.mono(500), 15);
    x.textBaseline = 'alphabetic';
    x.fillStyle = rgba('ash', 0.85 * a);
    x.fillText('CLAUDE CODE · sessione', 18, -14);
    x.textAlign = 'right';
    x.fillText('modifiche in linguaggio naturale', LW - 6, -14);
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
    this.cmds.forEach((cm, i) => {
      const t0 = cm.line.start - 0.25;
      if (t < t0) return;
      const y = this.rowY(i);
      setWorld(x, c, LX, y, 1);
      // the number, set big on "Quattro comandi"
      const nk = prog(t, this.tFour + i * 0.12, this.tFour + i * 0.12 + 0.15);
      if (nk > 0) {
        x.font = font(F.archivo(125, 900), 40);
        x.fillStyle = rgba('signal', nk);
        x.fillText(String(i + 1), -64, 6);
      }
      x.font = font(F.mono(400), 30);
      x.fillStyle = rgba('ash', 0.9);
      x.fillText('›', 30, 0);
      const s = this.typedOf(cm, t);
      x.fillStyle = t < cm.line.end + 0.2 ? rgba('signal', 1) : rgba('bone', 0.95);
      x.fillText(s, 76, 0);
      // the edit it makes
      const td = cm.line.end + 0.12;
      cm.diff.forEach(([sign, txt], j) => {
        const k = clamp((t - td - j * 0.18) / 0.3);
        if (k <= 0) return;
        const shown = (sign + ' ' + txt).slice(0, Math.ceil((txt.length + 2) * k));
        x.font = font(F.mono(400), 20);
        x.fillStyle = sign === '-' ? rgba('graphite', 1) : sign === '+' ? rgba(i === 1 ? BLUE : 'ember', 1) : rgba('ash', 1);
        x.fillText(shown, 76, 40 + j * 28);
      });
      x.setTransform(1, 0, 0, 1, 0, 0);
    });
  }

  // ------------------------------------------------------------------ the preview
  drawFrames(L: LineBatch, c: Cam, t: number) {
    const a = prog(t, this.T0 + 0.05, this.T0 + 0.45) * (1 - this.keysOn(t));
    if (a <= 0) return;
    const box = (x0: number, y0: number, w: number, h: number, col: RGB, al: number, wd = 1.2) => {
      const p = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h], [x0, y0]].map(([xx, yy]) => w2s(c, xx!, yy!));
      for (let i = 1; i < p.length; i++) L.seg2(p[i - 1]![0], p[i - 1]![1], p[i]![0], p[i]![1], wd, col, al);
    };
    box(PX, PY, PW_, PH_, LIN.ash, 0.55 * a);
    // the timeline strip of scenes under the preview: four blocks, a fifth slides in on command 3
    const k3 = ease.outBack(prog(t, this.tScene + 0.05, this.tScene + 0.45));
    let xx = PX;
    const bw = (PW_ - 4 * 10) / (4 + k3);
    for (let i = 0; i < 5; i++) {
      const isNew = i === 2;
      const w = isNew ? bw * k3 : bw;
      if (w > 2) box(xx, PY + PH_ + 40, w - 4, 52, isNew ? this.accent(t) : LIN.ash, (isNew ? 1 : 0.6) * a, isNew ? 2 : 1.2);
      xx += w + (isNew ? 10 * k3 : 10);
    }
    // render progress (command 4)
    const kr = prog(t, this.tRender + 0.1, this.tRender + 1.1);
    if (kr > 0) {
      const y = PY + PH_ - 30;
      const p0 = w2s(c, PX + 40, y), p1 = w2s(c, PX + 40 + (PW_ - 80) * kr, y);
      L.seg2(p0[0], p0[1], p1[0], p1[1], 6, [this.accent(t)[0] * 1.5, this.accent(t)[1] * 1.5, this.accent(t)[2] * 1.5], a);
    }
  }

  /** The composition: a shape crossing between two marks, morphing circle ↔ square, in the accent colour. */
  drawDemo(L: LineBatch, c: Cam, t: number) {
    const a = prog(t, this.T0 + 0.15, this.T0 + 0.5) * (1 - this.keysOn(t));
    if (a <= 0) return;
    const k = this.demoPhase(t);
    const xa = PX + 210, xb = PX + PW_ - 210, cy = PY + PH_ / 2 - 30;
    const cx = lerp(xa, xb, k);
    const R = 74, sq = k; // corner rounding follows the move: circle at A, square at B
    const col = this.accent(t);
    const hot: RGB = [col[0] * 1.7, col[1] * 1.7, col[2] * 1.7];
    let prev: [number, number] | null = null;
    const N = 96;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      // superellipse: exponent 2 (circle) -> 10 (square-ish)
      const e = lerp(2, 10, sq);
      const ct = Math.cos(th), st = Math.sin(th);
      const rr = R / Math.pow(Math.pow(Math.abs(ct), e) + Math.pow(Math.abs(st), e), 1 / e);
      const p = w2s(c, cx + rr * ct, cy + rr * st);
      if (prev) L.seg2(prev[0], prev[1], p[0], p[1], 3, hot, a);
      prev = p;
    }
    // the two marks and the path
    for (const mx of [xa, xb]) {
      const p0 = w2s(c, mx, cy + R + 26), p1 = w2s(c, mx, cy + R + 44);
      L.seg2(p0[0], p0[1], p1[0], p1[1], 1.2, LIN.ash, 0.8 * a);
    }
    const q0 = w2s(c, xa, cy + R + 35), q1 = w2s(c, xb, cy + R + 35);
    L.seg2(q0[0], q0[1], q1[0], q1[1], 1.0, LIN.graphite, 0.8 * a);
    // the easing curve of the transition, stretched by command 1
    const gx = PX + 30, gy = PY + 40, gw = 170 * (this.transDur(t) / 0.6) * 0.62, gh = 70;
    let pv: [number, number] | null = null;
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const p = w2s(c, gx + u * gw, gy + gh - ease.inOutCubic(u) * gh);
      if (pv) L.seg2(pv[0], pv[1], p[0], p[1], 1.6, LIN.bone, 0.7 * a);
      pv = p;
    }
  }

  drawPreviewText(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const a = prog(t, this.T0 + 0.15, this.T0 + 0.5) * (1 - this.keysOn(t));
    if (a <= 0) return;
    setWorld(x, c, PX, PY, 1);
    x.font = font(F.mono(500), 15);
    x.textBaseline = 'alphabetic';
    x.fillStyle = rgba('ash', 0.85 * a);
    x.fillText('ANTEPRIMA · demo.ts', 14, -14);
    x.textAlign = 'right';
    x.fillStyle = mixCss('signal', 'bone', prog(t, this.tSlow, this.tSlow + 0.4), a);
    x.fillText(`transizione ${this.transDur(t).toFixed(2)} s`, PW_ - 14, 30);
    x.fillStyle = prog(t, this.tBlue, this.tBlue + 0.35) > 0.5 ? rgba(BLUE, a) : rgba('signal', a);
    x.fillText(prog(t, this.tBlue, this.tBlue + 0.35) > 0.5 ? 'accento #3D7BFF' : 'accento #FF4D12', PW_ - 14, 54);
    x.textAlign = 'left';
    // scene names in the strip
    const k3 = ease.outBack(prog(t, this.tScene + 0.05, this.tScene + 0.45));
    const names = ['intro', 'titolo', 'caricamento', 'logo', 'outro'];
    let xx = 0;
    const bw = (PW_ - 4 * 10) / (4 + k3);
    x.font = font(F.mono(400), 14);
    names.forEach((nm, i) => {
      const isNew = i === 2, w = isNew ? bw * k3 : bw;
      if (w > 60) { x.fillStyle = isNew ? rgba(BLUE, a) : rgba('ash', 0.85 * a); x.fillText(nm, xx + 10, PH_ + 72); }
      xx += w + (isNew ? 10 * k3 : 10);
    });
    // the render result
    const kr = prog(t, this.tRender + 0.1, this.tRender + 1.1);
    if (kr > 0) {
      x.font = font(F.mono(500), 18);
      x.fillStyle = kr < 1 ? rgba('bone', a) : rgba('signal', a);
      x.fillText(kr < 1 ? `render ${Math.round(kr * 100)}%` : 'render ✓ 100%  ·  out/motion-as-code.mp4', 40, PH_ - 52);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ------------------------------------------------------------------ hundreds of keyframes
  drawKeys(L: LineBatch, c: Cam, t: number) {
    const on = this.keysOn(t);
    if (on <= 0) return;
    const cols = 44, rows = 19;
    const x0 = PX - 20, y0 = PY - 10, dx = (PW_ + 40) / cols, dy = (PH_ + 120) / rows;
    const k0 = this.tKeys;
    for (let r = 0; r < rows; r++) {
      // track line
      const a0 = w2s(c, x0, y0 + r * dy), a1 = w2s(c, x0 + cols * dx, y0 + r * dy);
      L.seg2(a0[0], a0[1], a1[0], a1[1], 1.0, LIN.graphite, 0.5 * on);
      for (let q = 0; q < cols; q++) {
        if (hash(r, q, 41) > 0.62) continue; // ~847 of them
        const ta = k0 + (r * cols + q) / (rows * cols) * 0.9;
        if (t < ta) continue;
        const kx = x0 + (q + 0.5) * dx + (hash(r, q, 42) - 0.5) * dx * 0.4, ky = y0 + r * dy;
        const s = w2s(c, kx, ky), d = 5 * c.z;
        const hot = Math.exp(-(t - ta) / 0.12);
        const isHand = r === 9 && q === 21;
        const col: RGB = isHand ? [LIN.signal[0] * 1.6, LIN.signal[1] * 1.6, LIN.signal[2] * 1.6] : [0.45 + 1.5 * hot, 0.43 + 0.5 * hot, 0.4 + 0.2 * hot];
        const off = isHand ? this.handOffset(t) * c.z : 0;
        const pts = [[s[0] + off, s[1] - d], [s[0] + off + d, s[1]], [s[0] + off, s[1] + d], [s[0] + off - d, s[1]], [s[0] + off, s[1] - d]];
        for (let i = 1; i < pts.length; i++) L.seg2(pts[i - 1]![0]!, pts[i - 1]![1]!, pts[i]![0]!, pts[i]![1]!, 1.2, col, 0.85 * on);
      }
    }
  }
  handOffset(t: number) { return 60 * ease.inOutQuad(prog(t, this.tHand + 0.1, this.w.mano!.end + 0.4)); }

  drawHand(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const on = prog(t, this.tHand - 0.3, this.tHand);
    if (on <= 0) return;
    const cols = 44, rows = 19;
    const x0 = PX - 20, y0 = PY - 10, dx = (PW_ + 40) / cols, dy = (PH_ + 120) / rows;
    const kx = x0 + 21.5 * dx + (hash(9, 21, 42) - 0.5) * dx * 0.4 + this.handOffset(t), ky = y0 + 9 * dy;
    setWorld(x, c, kx + 4, ky + 4, 1.2);
    x.fillStyle = rgba('bone', on);
    x.strokeStyle = rgba('ink', on);
    x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 26); x.lineTo(7, 20); x.lineTo(12, 31); x.lineTo(16, 29); x.lineTo(11, 18); x.lineTo(20, 18); x.closePath();
    x.fill(); x.stroke();
    x.setTransform(1, 0, 0, 1, 0, 0);
    // the counter
    setWorld(x, c, PX + PW_ - 10, PY + PH_ + 150, 1);
    x.font = font(F.mono(500), 20);
    x.textAlign = 'right';
    x.fillStyle = rgba('signal', on);
    const moved = this.handOffset(t) > 59 ? 1 : 0;
    x.fillText(`keyframe spostati a mano: ${moved} / 847`, 0, 0);
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
