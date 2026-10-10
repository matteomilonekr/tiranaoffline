// PLATE 5 `code` — "Scrive l’animazione stessa, come codice. Ogni forma, ogni parola, ogni movimento di
// camera è definito matematicamente nel tempo."
// scene.ts opens: an editor on the left types the plate as it is spoken (the class, then one line per
// "ogni …": the shape, the word, the camera), and a preview on the right runs that very code — the
// circle breathes with r(t), the word types itself, the preview frame zooms. The numbers in the code
// are live. "definito matematicamente nel tempo": the camera moves to the plot under the preview, where
// r(t) is drawn on graph paper with the spark as the playhead, and the equation is set big.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, lerp, prog, pulse, TAU } from '../engine/util';
import {
  Paper, camAt, K, w2s, setWorld, layWords, drawWords, sparkHead, sparkParticles, lineOf, phraseOf, mixCss,
  type Cam, type CamKey, type KWord,
} from './_vo';

// the editor and the preview (world px)
const EX = 90, EY = 150, EW = 960, EH = 780;
const PX = 1110, PY = 150, PW_ = 720, PH_ = 405;
const GX = 1110, GY = 610, GW = 720, GH = 320;
const FS = 23, LH = 38;

/** r(t), the circle's radius: the function the code line states. */
const radius = (lt: number) => 120 + 60 * Math.sin(lt * 2.0);

interface CodeLine { text: string; t0: number; cps: number; key?: string }

export default class Code extends Scene {
  paper = new Paper(24, 120);
  lines = new LineBatch(30000, { blend: 'add' });
  fx = new LineBatch(6000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L8!: Line; L9!: Line;
  w: Record<string, Word> = {};
  code: CodeLine[] = [];
  rowEq: KWord[] = [];
  head: KWord[] = [];
  T0 = 0; T1 = 0; tShape = 0; tWord = 0; tCam = 0; tMath = 0;

  override init() {
    const ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L8 = lineOf(ly, 'Scrive l’animazione');
    this.L9 = lineOf(ly, 'Ogni forma');
    const w = this.w;
    w.forma = phraseOf(ly, 'forma', { line: this.L9 })[0]!;
    w.parola = phraseOf(ly, 'parola', { line: this.L9 })[0]!;
    [w.movimento, , w.camera] = phraseOf(ly, 'movimento di camera', { line: this.L9 }) as [Word, Word, Word];
    w.definito = phraseOf(ly, 'definito', { line: this.L9 })[0]!;
    w.matematicamente = phraseOf(ly, 'matematicamente', { line: this.L9 })[0]!;
    w.tempo = phraseOf(ly, 'tempo', { line: this.L9 })[0]!;
    w.codice = phraseOf(ly, 'codice', { line: this.L8 })[0]!;
    this.tShape = w.forma!.start; this.tWord = w.parola!.start; this.tCam = w.movimento!.start; this.tMath = w.definito!.start;
    const s0 = this.L8.words[0]!.start;
    const C = (text: string, t0: number, cps = 70, key?: string) => this.code.push({ text, t0, cps, key });
    C('// scenes/scena.ts — generato da Claude', this.T0 + 0.1, 90);
    C("import { Scene, type Frame } from '../engine/scene';", s0, 110);
    C('', s0);
    C('export default class Scena extends Scene {', s0 + 0.55, 80);
    C('  render(f: Frame) {', w.codice!.start, 60);
    C('    const r = 120 + 60 * Math.sin(f.lt * 2.0);  // forma', this.tShape, 70, 'shape');
    C("    const parola = 'codice'.slice(0, f.lt * 8);  // parola", this.tWord, 70, 'word');
    C('    cam.zoom = 1 + 0.4 * ease.inOutCubic(f.p);  // camera', this.tCam, 70, 'cam');
    C('    disegna(cerchio(960, 540, r), testo(parola), cam);', this.tCam + 0.9, 80);
    C('  }', this.tCam + 1.5, 40);
    C('}', this.tCam + 1.55, 40);
    this.head = layWords(this.L8.words, EX, EY - 46, 40, F.archivo(100, 600), { ant: 0.2 });
    this.rowEq = layWords(this.L9.words.slice(this.L9.words.indexOf(w.definito!)), GX, GY + GH + 92, 40, F.archivo(100, 600), { ant: 0.2 });

    const mid = { x: (EX + PX + PW_) / 2, y: (EY + EY + EH) / 2 };
    this.cams = [
      K(this.T0, mid.x - 30, mid.y + 10, 1.2, 0.0),
      K(s0 + 0.2, mid.x - 220, 430, 1.28, -0.006, ease.inOutCubic),
      K(this.tShape - 0.05, mid.x - 120, mid.y - 20, 1.12, 0.0, ease.inOutQuad),
      K(this.tCam + 0.3, mid.x, mid.y, 1.0, 0.0, ease.inOutQuad),
      K(this.tMath - 0.05, mid.x + 10, mid.y + 10, 1.0, 0.0, ease.linear),
      K(this.tMath + 0.55, GX + GW / 2 - 40, GY + GH / 2 + 60, 1.75, 0.0, ease.inOutCubic),
      K(this.T1, GX + GW / 2 + 20, GY + GH / 2 + 60, 1.9, 0.0, ease.inQuad),
    ];
  }

  cam(t: number): Cam { return camAt(this.cams, t); }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = this.cam(t);
    const lt = t - this.T0;
    this.paper.render(renderer, out, c, { alpha: 0.45 });

    // ---- the plot (LineBatch): r(t) on the graph, the preview's circle and camera frame
    const L = this.lines; L.clear();
    this.drawPanels(L, c, t);
    this.drawPreviewLines(L, c, t, lt);
    this.drawPlot(L, c, t, lt);
    L.render(renderer, out);

    // ---- type
    const T = this.text; T.clear();
    const x = T.ctx;
    drawWords(x, c, this.head, t, { alpha: 1 - prog(t, this.tShape - 0.4, this.tShape) });
    this.drawCode(x, c, t, lt);
    this.drawPreviewText(x, c, t, lt);
    this.drawPlotText(x, c, t, lt);
    drawWords(x, c, this.rowEq, t, {});
    comp.draw(renderer, T.upload(), out);

    // ---- the playhead spark on the plot
    const X = this.fx; X.clear();
    const on = prog(t, this.tMath - 0.2, this.tMath + 0.2);
    if (on > 0) {
      const head = (tt: number) => { const p = this.plotPoint(tt - this.T0); const s = w2s(this.cam(tt), p.x, p.y); return { x: s[0], y: s[1] }; };
      const h = head(t);
      sparkParticles(X, t, (tb) => (tb > this.tMath - 0.2 ? head(tb) : null), { rate: 70, intensity: 0.9 * on, seed: 23, life: 0.4 });
      sparkHead(X, h.x, h.y, t, 0.9, on);
    }
    X.render(renderer, out);

    return { bloom: 0.62, bloomThreshold: 0.86, vignette: 0.42, zoom: 1 + 0.01 * pulse(t, this.tShape, 0.08) + 0.01 * pulse(t, this.tMath, 0.08) };
  }

  // ------------------------------------------------------------------ panels
  drawPanels(L: LineBatch, c: Cam, t: number) {
    const a = prog(t, this.T0, this.T0 + 0.3);
    const box = (x0: number, y0: number, w: number, h: number, alpha: number) => {
      const p = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h], [x0, y0]].map(([x, y]) => w2s(c, x!, y!));
      for (let i = 1; i < p.length; i++) L.seg2(p[i - 1]![0], p[i - 1]![1], p[i]![0], p[i]![1], 1.2, LIN.ash, alpha);
    };
    box(EX, EY, EW, EH, 0.55 * a);
    box(PX, PY, PW_, PH_, 0.55 * a);
    box(GX, GY, GW, GH, 0.45 * prog(t, this.tMath - 0.6, this.tMath - 0.2));
    // the editor's gutter
    const g0 = w2s(c, EX + 64, EY), g1 = w2s(c, EX + 64, EY + EH);
    L.seg2(g0[0], g0[1], g1[0], g1[1], 1.0, LIN.graphite, 0.8 * a);
  }

  /** Code: typed per line from its trigger, keywords/numbers/strings/comments coloured; numbers live. */
  drawCode(x: CanvasRenderingContext2D, c: Cam, t: number, lt: number) {
    const fam = F.mono(400), famB = F.mono(500);
    const adv = measure('0', fam, FS);
    setWorld(x, c, EX, EY, 1);
    x.textBaseline = 'alphabetic';
    // the file tab
    x.font = font(F.mono(500), 15);
    x.fillStyle = rgba('bone', 0.75);
    x.fillText('scena.ts', 24, -16);
    x.fillStyle = rgba('ash', 0.6);
    x.fillText('TypeScript · three.js', EW - 200, -16);
    let cur = -1;
    this.code.forEach((cl, i) => {
      if (t < cl.t0) return;
      const y = 70 + i * LH;
      let s = cl.text;
      // live values on the three key lines, once fully typed
      const done = t > cl.t0 + s.length / cl.cps + 0.2;
      if (done && cl.key === 'shape') s = s.replace('// forma', `// r = ${radius(lt).toFixed(1)}`);
      if (done && cl.key === 'cam') s = s.replace('// camera', `// zoom = ${this.camZoom(t).toFixed(3)}`);
      const n = Math.min(s.length, Math.floor((t - cl.t0) * cl.cps));
      if (n < s.length) cur = i;
      const hot = Math.exp(-Math.max(0, t - cl.t0 - s.length / cl.cps) / 0.5);
      if (cl.key) {
        x.fillStyle = rgba('signal', 0.05 + 0.1 * hot);
        x.fillRect(66, y - 27, EW - 70, LH - 2);
        x.fillStyle = rgba('signal', 0.9);
        x.fillRect(64, y - 27, 3, LH - 2);
      }
      x.font = font(fam, 15);
      x.fillStyle = rgba('graphite', 1);
      x.textAlign = 'right';
      x.fillText(String(i + 1), 50, y - 2);
      x.textAlign = 'left';
      const shown = s.slice(0, n);
      for (const tk of tokenize(shown)) {
        x.font = font(tk.k === 'kw' ? famB : fam, FS);
        x.fillStyle = tk.k === 'kw' ? rgba('bone', 1) : tk.k === 'num' ? rgba('signal', 1) : tk.k === 'str' ? rgba('ember', 1) : tk.k === 'com' ? (cl.key && done ? rgba('signal', 0.85) : rgba('ash', 0.75)) : rgba('bone', 0.78);
        x.fillText(tk.s, 84 + tk.i * adv, y);
      }
      if (i === cur || (i === this.code.length - 1 && n >= s.length && t < cl.t0 + 1)) {
        if (Math.floor(t * 2.4) % 2 === 0 || n < s.length) { x.fillStyle = rgba('signal', 1); x.fillRect(84 + n * adv + 2, y - 22, 3, 28); }
      }
    });
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  camZoom(t: number) { return 1 + 0.4 * ease.inOutCubic(prog(t, this.tCam, this.T1)); }

  /** Preview: the camera frame (zooming), the circle r(t) as hairline geometry. */
  drawPreviewLines(L: LineBatch, c: Cam, t: number, lt: number) {
    const k = prog(t, this.tShape, this.tShape + 0.2);
    const z = t >= this.tCam ? this.camZoom(t) : 1;
    const cx = PX + PW_ / 2, cy = PY + PH_ / 2;
    if (k > 0) {
      const r = radius(lt) * 0.55 * z * ease.outBack(k);
      let prev: [number, number] | null = null;
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * TAU;
        const p = w2s(c, cx + r * Math.cos(a), cy - 30 * z + r * Math.sin(a));
        if (prev) L.seg2(prev[0], prev[1], p[0], p[1], 2.0, [LIN.signal[0] * 1.6, LIN.signal[1] * 1.6, LIN.signal[2] * 1.6], 1);
        prev = p;
      }
      // the radius, dimensioned
      const a0 = w2s(c, cx, cy - 30 * z), a1 = w2s(c, cx + r, cy - 30 * z);
      L.seg2(a0[0], a0[1], a1[0], a1[1], 1.0, LIN.bone, 0.6);
    }
    // the camera frame inside the preview: a 16:9 rectangle that the zoom pushes outward
    if (t >= this.tCam - 0.1) {
      const kk = prog(t, this.tCam - 0.1, this.tCam + 0.15);
      const fw = (PW_ - 80) / z, fh = (PH_ - 60) / z;
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => w2s(c, cx + (sx! * fw) / 2, cy + (sy! * fh) / 2));
      for (let i = 0; i < 4; i++) {
        const p = pts[i]!, q = pts[(i + 1) % 4]!;
        // corners only (crop marks)
        const m = 0.18;
        L.seg2(p[0], p[1], lerp(p[0], q[0], m), lerp(p[1], q[1], m), 1.6, LIN.bone, 0.8 * kk);
        L.seg2(q[0], q[1], lerp(q[0], p[0], m), lerp(q[1], p[1], m), 1.6, LIN.bone, 0.8 * kk);
      }
    }
  }

  drawPreviewText(x: CanvasRenderingContext2D, c: Cam, t: number, lt: number) {
    setWorld(x, c, PX, PY, 1);
    x.font = font(F.mono(500), 14);
    x.textBaseline = 'alphabetic';
    x.fillStyle = rgba('ash', 0.85);
    x.fillText('ANTEPRIMA · 60 fps', 16, -14);
    x.textAlign = 'right';
    x.fillStyle = rgba('signal', 0.9);
    x.fillText(`t = ${lt.toFixed(2)} s · fotogramma ${Math.round(lt * 60)}`, PW_ - 10, -14);
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (t >= this.tWord) {
      const z = t >= this.tCam ? this.camZoom(t) : 1;
      const s = 'codice'.slice(0, Math.floor((t - this.tWord) * 8));
      setWorld(x, c, PX + PW_ / 2, PY + PH_ / 2 + 140 * Math.min(z, 1.2), z);
      x.font = font(F.archivo(100, 800), 44);
      x.textAlign = 'center';
      x.fillStyle = rgba('bone', 1);
      x.fillText(s, 0, 0);
      x.textAlign = 'left';
      x.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /** The plot of r(t): axes in seconds, the curve drawn up to now. */
  plotPoint(lt: number) {
    const dur = this.T1 - this.T0;
    const u = clamp(lt / dur);
    return { x: GX + 50 + u * (GW - 80), y: GY + GH / 2 + 10 - (radius(lt) - 120) * 1.75 };
  }
  drawPlot(L: LineBatch, c: Cam, t: number, lt: number) {
    const a = prog(t, this.tMath - 0.6, this.tMath - 0.2);
    if (a <= 0) return;
    const ax0 = w2s(c, GX + 50, GY + GH / 2 + 10), ax1 = w2s(c, GX + GW - 20, GY + GH / 2 + 10);
    L.seg2(ax0[0], ax0[1], ax1[0], ax1[1], 1.2, LIN.ash, 0.8 * a);
    const ay0 = w2s(c, GX + 50, GY + 20), ay1 = w2s(c, GX + 50, GY + GH - 20);
    L.seg2(ay0[0], ay0[1], ay1[0], ay1[1], 1.2, LIN.ash, 0.8 * a);
    const dur = this.T1 - this.T0;
    for (let s = 0; s <= Math.floor(dur); s++) {
      const p = this.plotPoint(s);
      const q0 = w2s(c, p.x, GY + GH / 2 + 4), q1 = w2s(c, p.x, GY + GH / 2 + 16);
      L.seg2(q0[0], q0[1], q1[0], q1[1], 1.0, LIN.ash, 0.7 * a);
    }
    let prev: [number, number] | null = null;
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const lti = (i / N) * dur;
      const ghost = lti > lt;
      const p = this.plotPoint(lti), s = w2s(c, p.x, p.y);
      if (prev) {
        if (ghost) L.seg2(prev[0], prev[1], s[0], s[1], 1.0, LIN.graphite, 0.5 * a);
        else L.seg2(prev[0], prev[1], s[0], s[1], 2.2, [LIN.signal[0] * 1.5, LIN.signal[1] * 1.5, LIN.signal[2] * 1.5], a);
      }
      prev = s;
    }
  }
  drawPlotText(x: CanvasRenderingContext2D, c: Cam, t: number, lt: number) {
    const a = prog(t, this.tMath - 0.6, this.tMath - 0.2);
    if (a <= 0) return;
    setWorld(x, c, GX, GY, 1);
    x.textBaseline = 'alphabetic';
    x.font = font(F.mono(400), 13);
    x.fillStyle = rgba('ash', 0.85 * a);
    x.fillText('r', 30, 34);
    x.fillText('t (s)', GW - 60, GH / 2 - 12);
    const dur = this.T1 - this.T0;
    for (let s = 0; s <= Math.floor(dur); s += 2) x.fillText(String(s), this.plotPoint(s).x - GX - 4, GH / 2 + 34);
    // the equation, set big and typed on "matematicamente"
    const eq = 'r(t) = 120 + 60 · sin 2t';
    const k = prog(t, this.w.matematicamente!.start, this.w.matematicamente!.end);
    if (k > 0) {
      x.font = font(F.serif(400, true), 46);
      x.fillStyle = mixCss('signal', 'bone', prog(t, this.w.matematicamente!.end, this.w.matematicamente!.end + 0.5), a);
      x.fillText(eq.slice(0, Math.ceil(eq.length * k)), 0, -28);
    }
    x.font = font(F.mono(500), 15);
    x.fillStyle = rgba('signal', a);
    x.fillText(`r(${lt.toFixed(2)}) = ${radius(lt).toFixed(1)}`, GW - 230, GH - 22);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** A tiny TypeScript highlighter: keywords, numbers, strings, comments; `i` = char column. */
function tokenize(s: string): { s: string; k: 'kw' | 'num' | 'str' | 'com' | 'txt'; i: number }[] {
  const out: { s: string; k: 'kw' | 'num' | 'str' | 'com' | 'txt'; i: number }[] = [];
  const KW = new Set(['import', 'from', 'export', 'default', 'class', 'extends', 'const', 'type', 'return', 'new']);
  let i = 0;
  while (i < s.length) {
    const r = s.slice(i);
    let m: RegExpMatchArray | null;
    if (r.startsWith('//')) { out.push({ s: r, k: 'com', i }); break; }
    if ((m = r.match(/^'[^']*'?/))) { out.push({ s: m[0], k: 'str', i }); i += m[0].length; continue; }
    if ((m = r.match(/^\d+(\.\d+)?/))) { out.push({ s: m[0], k: 'num', i }); i += m[0].length; continue; }
    if ((m = r.match(/^[A-Za-z_]\w*/))) { out.push({ s: m[0], k: KW.has(m[0]) ? 'kw' : 'txt', i }); i += m[0].length; continue; }
    out.push({ s: r[0]!, k: 'txt', i }); i += 1;
  }
  return out;
}
