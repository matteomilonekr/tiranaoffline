// PLATE 2 `model` — "Questo è Claude Code. Invece di controllare After Effects, gli descrivi
// semplicemente quello che vuoi."
// The whip from `hook` lands on a terminal that the pen draws on the sheet; `$ claude` is typed and
// CLAUDE CODE is set big inside it. "Invece di controllare After Effects": the camera pulls back to an
// editor timeline beside it (layers, keyframe diamonds, a cursor clicking away, a click counter), which
// the pen strikes out on "After Effects". "gli descrivi semplicemente quello che vuoi": the words are typed
// into the terminal's prompt as they are spoken and the camera pushes onto the caret (`prompt` goes on
// from a caret in the same place).
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, layout, measure, plain } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { ease, hash, lerp, noise1, prog, pulse, TAU } from '../engine/util';
import {
  Paper, Plot, Notes, camAt, K, w2s, setWorld, layWords, drawWords, drawSpark, burst, lineOf, phraseOf,
  pt, rect, roundRect, line, arc, wp, type Cam, type CamKey, type KWord,
} from './_vo';

const TX = 700, TY = 230, TW = 1080, TH = 600; // the terminal (world px)
const EX = -520, EY = 300, EW = 1060, EH = 470; // the editor timeline, left of it

export default class Model extends Scene {
  paper = new Paper(24, 120);
  plot = new Plot();
  notes = new Notes();
  lines = new LineBatch(40000, { blend: 'add' });
  fx = new LineBatch(12000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L2!: Line; L3!: Line;
  title: KWord[] = [];
  w: Record<string, Word> = {};
  typedWords: Word[] = [];
  T0 = 0; T1 = 0;
  clicks: { t: number; x: number; y: number }[] = [];
  promptY = TY + TH - 70;

  override init() {
    const ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L2 = lineOf(ly, 'Questo è Claude Code');
    this.L3 = lineOf(ly, 'Invece di controllare');
    const w = this.w;
    [w.claude, w.code] = phraseOf(ly, 'Claude Code', { line: this.L2 }) as [Word, Word];
    w.questo = this.L2.words[0]!;
    w.invece = this.L3.words[0]!;
    w.controllare = phraseOf(ly, 'controllare', { line: this.L3 })[0]!;
    [w.after, w.effects] = phraseOf(ly, 'After Effects', { line: this.L3 }) as [Word, Word];
    w.gli = phraseOf(ly, 'gli', { line: this.L3 })[0]!;
    this.typedWords = this.L3.words.slice(this.L3.words.indexOf(w.gli!));
    const fam = F.archivo(112, 800);
    const size = Math.min(150, (TW - 130) / (layout('Claude Code', fam, 100).width / 100));
    this.title = layWords([w.claude!, w.code!], TX + 60, TY + 330, size, fam, { texts: ['Claude', 'Code'], ant: 0.15 });

    // clicks on the timeline: one per syllable-ish of "controllare After Effects"
    const t0 = w.controllare!.start, t1 = w.effects!.end;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = lerp(t0, t1 - 0.1, i / (n - 1));
      const row = i % 3, kx = EX + 300 + ((i * 137) % 640);
      this.clicks.push({ t, x: kx, y: EY + 150 + row * 92 });
    }
    this.buildPlot();
    this.buildCamera();
  }

  buildPlot() {
    const P = this.plot, N = this.notes, w = this.w;
    const tq = w.questo!.start;
    // the terminal, drawn as the line starts
    P.add(roundRect(TX, TY, TW, TH, 22), this.T0 + 0.05, tq + 0.45, { pen: true, ez: ease.inOutCubic, width: 1.8, group: 'term' });
    P.add(line(pt(TX, TY + 52), pt(TX + TW, TY + 52)), tq + 0.4, tq + 0.6, { ink: 'ash', width: 1.2, group: 'term' });
    for (let i = 0; i < 3; i++) P.add(arc(TX + 30 + i * 26, TY + 26, 7, 0, TAU, 20), tq + 0.45 + i * 0.04, tq + 0.55 + i * 0.04, { ink: 'ash', width: 1.2, group: 'term' });
    N.add('claude — ~/motion-as-code', TX + TW / 2, TY + 33, tq + 0.5, { size: 16, align: 'center', group: 'term' });
    N.add('$ claude', TX + 60, TY + 130, tq + 0.35, { size: 30, col: 'bone', a: 0.9, dur: 0.25, group: 'term' });
    N.add('modello: Claude · cartella: motion-as-code · 9 tavole', TX + 60, TY + 400, w.code!.end + 0.05, { size: 18, dur: 0.5, group: 'term' });
    // the prompt rule at the bottom of the terminal
    P.add(line(pt(TX + 30, this.promptY - 50), pt(TX + TW - 30, this.promptY - 50)), w.code!.end + 0.1, w.code!.end + 0.5, { ink: 'ash', alpha: 0.7, width: 1.0, group: 'term' });

    // the editor timeline: panel, layer rows, keyframes
    const te = w.invece!.start - 0.05;
    P.add(rect(EX, EY, EW, EH), te, te + 0.4, { ink: 'ash', width: 1.4, group: 'ed', ez: ease.inOutQuad });
    P.add(line(pt(EX, EY + 54), pt(EX + EW, EY + 54)), te + 0.25, te + 0.45, { ink: 'ash', width: 1.0, group: 'ed' });
    P.add(line(pt(EX + 240, EY + 54), pt(EX + 240, EY + EH)), te + 0.3, te + 0.5, { ink: 'ash', width: 1.0, group: 'ed' });
    N.add('TIMELINE', EX + 18, EY + 34, te + 0.3, { size: 15, weight: 500, group: 'ed' });
    N.add('0:00:00:00', EX + EW - 18, EY + 34, te + 0.35, { size: 15, align: 'right', group: 'ed' });
    const names = ['Testo', 'Forma', 'Camera', 'Sfondo'];
    names.forEach((nm, r) => {
      const y = EY + 104 + r * 92;
      N.add(`${r + 1}  ${nm}`, EX + 20, y + 6, te + 0.35 + r * 0.06, { size: 16, col: 'bone', a: 0.75, group: 'ed' });
      P.add(rect(EX + 262, y - 18, 760 - (r % 2) * 120, 36), te + 0.4 + r * 0.05, te + 0.6 + r * 0.05, { ink: 'graphite', width: 1.0, group: 'ed' });
    });
    // the strike, on "After Effects"
    const ts = w.effects!.start + 0.12;
    P.add(line(pt(EX - 30, EY + EH + 30), pt(EX + EW + 30, EY - 30), 10), ts, ts + 0.22, { pen: true, ez: ease.inQuad, width: 3.4, ink: 'signal', group: 'edx' });
    N.add('// cliccare non è il punto', EX, EY + EH + 70, ts + 0.25, { size: 17, group: 'edx' });
    // the pen goes to the prompt
    P.wait(pt(TX + 64, this.promptY + 10), w.gli!.start - 0.05, 0.05);
  }

  buildCamera() {
    const w = this.w, T0 = this.T0;
    const tc = { x: TX + TW / 2, y: TY + TH / 2 };
    this.cams = [
      K(T0, tc.x - 2600, tc.y, 1.25, 0.0),
      K(T0 + 0.34, tc.x - 20, tc.y - 10, 1.25, -0.01, ease.outCubic),
      K(w.claude!.start, tc.x, tc.y - 20, 1.3, -0.006, ease.inOutQuad),
      K(w.code!.end + 0.15, tc.x + 10, tc.y - 10, 1.36, 0.0, ease.inOutQuad),
      // pull back to both panels
      K(w.invece!.start + 0.3, (EX + TX + TW) / 2, tc.y + 20, 0.7, 0.0, ease.inOutCubic),
      K(w.effects!.end + 0.2, (EX + TX + TW) / 2 - 40, tc.y + 25, 0.74, 0.004, ease.inOutQuad),
      // push onto the prompt as it is typed
      K(w.gli!.start + 0.45, TX + 420, this.promptY - 20, 1.45, 0.0, ease.inOutCubic),
      K(this.T1, TX + 520, this.promptY - 10, 1.62, 0.0, ease.inQuad),
    ];
  }

  cam(t: number): Cam { return camAt(this.cams, t); }

  ga = (g: string, t: number): number => {
    const w = this.w;
    switch (g) {
      case 'ed': return prog(t, w.invece!.start - 0.1, w.invece!.start + 0.1) * (1 - 0.6 * prog(t, w.effects!.start + 0.2, w.effects!.start + 0.6));
      case 'edx': return 1;
      default: return 1;
    }
  };

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, w = this.w;
    const c = this.cam(t);
    const pen = this.plot.penAt(t);
    const ps = w2s(c, pen.x, pen.y);
    this.paper.render(renderer, out, c, { alpha: 0.72, pen: [ps[0], ps[1], 0.7] });

    const L = this.lines; L.clear();
    this.plot.draw(L, t, c, this.ga);
    this.keyframes(L, c, t);
    L.render(renderer, out);

    const T = this.text; T.clear();
    const x = T.ctx;
    drawWords(x, c, this.title, t, { sung: 'signal', cool: 0.6 });
    this.notes.draw(x, c, t, this.ga);
    this.cursor(x, c, t);
    this.promptLine(x, c, t);
    comp.draw(renderer, T.upload(), out);

    const X = this.fx; X.clear();
    drawSpark(X, t, (tt) => { const p = this.plot.penAt(tt); return w2s(this.cam(tt), p.x, p.y); }, { intensity: 0.9, scale: 0.9 + 0.5 * pulse(t, w.claude!.start, 0.1) });
    for (const k of this.clicks) {
      const s = w2s(c, k.x, k.y);
      burst(X, t, k.t, s[0], s[1], { n: 10, speed: 260, life: 0.3, seed: Math.floor(k.x), intensity: 0.6 });
    }
    X.render(renderer, out);

    const land = pulse(t, this.T0 + 0.3, 0.08), slam = pulse(t, w.claude!.start, 0.07);
    const whip = 1 - prog(t, this.T0, this.T0 + 0.3);
    return {
      zoom: 1 + 0.012 * land + 0.012 * slam,
      shake: [6 * land * noise1(t * 40, 1), 4 * land * noise1(t * 43, 2)],
      bloom: 0.65, bloomThreshold: 0.85, vignette: 0.42, ca: 1 + 3 * whip,
    };
  }

  /** Keyframe diamonds on the layer bars: they pile up while the cursor clicks. */
  keyframes(L: LineBatch, c: Cam, t: number) {
    const w = this.w;
    const a = this.ga('ed', t);
    if (a <= 0.01) return;
    const t0 = w.invece!.start + 0.3;
    for (let r = 0; r < 4; r++) {
      const y = EY + 104 + r * 92;
      const n = 6 + r * 2;
      for (let i = 0; i < n; i++) {
        const ta = t0 + hash(r, i, 3) * (w.effects!.end - t0);
        if (t < ta) continue;
        const kx = EX + 290 + (i / n) * (680 - (r % 2) * 120) + hash(r, i, 5) * 30;
        const s = w2s(c, kx, y), d = 9 * c.z, hot = Math.exp(-(t - ta) / 0.15);
        const col: [number, number, number] = [0.62 + 2 * hot, 0.6 + 0.6 * hot, 0.56 + 0.2 * hot];
        const pts = [[s[0], s[1] - d], [s[0] + d, s[1]], [s[0], s[1] + d], [s[0] - d, s[1]], [s[0], s[1] - d]];
        for (let k = 1; k < pts.length; k++) L.seg2(pts[k - 1]![0]!, pts[k - 1]![1]!, pts[k]![0]!, pts[k]![1]!, 1.3, col, 0.8 * a);
      }
    }
  }

  /** A mouse pointer hopping between keyframes, clicking (ripple + counter). */
  cursor(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const a = this.ga('ed', t);
    if (a <= 0.01 || t < this.clicks[0]!.t - 0.4) return;
    let i = 0;
    while (i + 1 < this.clicks.length && this.clicks[i + 1]!.t - 0.12 <= t) i++;
    const cur = this.clicks[i]!, nxt = this.clicks[i + 1];
    let px = cur.x, py = cur.y;
    if (nxt) {
      const k = ease.inOutCubic(prog(t, nxt.t - 0.12 - 0.16, nxt.t - 0.12));
      px = lerp(cur.x, nxt.x, k); py = lerp(cur.y, nxt.y, k);
    }
    if (t < this.clicks[0]!.t) { const k = ease.outCubic(prog(t, cur.t - 0.4, cur.t)); px = lerp(EX + EW + 60, cur.x, k); py = lerp(EY + EH + 60, cur.y, k); }
    // ripples
    for (const k of this.clicks) {
      const age = t - k.t;
      if (age < 0 || age > 0.35) continue;
      setWorld(x, c, k.x, k.y, 1);
      x.strokeStyle = rgba('signal', a * (1 - age / 0.35));
      x.lineWidth = 2;
      x.beginPath(); x.arc(0, 0, 8 + 60 * ease.outCubic(age / 0.35), 0, TAU); x.stroke();
    }
    // the pointer (an arrow, drawn)
    setWorld(x, c, px + 2, py + 2, 1.5);
    x.fillStyle = rgba('bone', a);
    x.strokeStyle = rgba('ink', a);
    x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 26); x.lineTo(7, 20); x.lineTo(12, 31); x.lineTo(16, 29); x.lineTo(11, 18); x.lineTo(20, 18); x.closePath();
    x.fill(); x.stroke();
    // the click counter
    const n = this.clicks.filter((k) => k.t <= t).length;
    setWorld(x, c, EX + EW - 18, EY + EH - 20, 1);
    x.font = font(F.mono(500), 18);
    x.textAlign = 'right';
    x.fillStyle = rgba('signal', a);
    x.fillText(`clic: ${n * 47}`, 0, 0);
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The prompt line: the spoken words typed in mono, word by word, with a caret. */
  promptLine(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const w = this.w;
    const t0 = w.code!.end + 0.2;
    if (t < t0) return;
    const y = this.promptY;
    setWorld(x, c, TX + 30, y, 1);
    x.font = font(F.mono(400), 34);
    x.textBaseline = 'alphabetic';
    x.fillStyle = rgba('ash', 0.9);
    x.fillText('›', 4, 0);
    let s = '', lastKey = t0;
    for (const wd of this.typedWords) {
      if (t < wd.start) break;
      const p = wp(wd, t);
      const txt = plain(wd.w);
      s += (s ? ' ' : '') + txt.slice(0, Math.max(1, Math.ceil(txt.length * p)));
      lastKey = Math.min(t, wd.end);
    }
    const fam = F.mono(400);
    x.fillStyle = rgba('bone', 0.95);
    x.fillText(s, 44, 0);
    // the word being spoken is lit
    const cur = this.typedWords.find((wd) => t >= wd.start && t < wd.end + 0.3);
    if (cur) {
      const before = s.lastIndexOf(' ') + 1;
      x.fillStyle = rgba('signal', 1 - prog(t, cur.end, cur.end + 0.3));
      x.fillText(s.slice(before), 44 + measure(s.slice(0, before), fam, 34), 0);
    }
    const on = t - lastKey < 0.4 || Math.floor(t * 2.2) % 2 === 0;
    if (on) { x.fillStyle = rgba('signal', 1); x.fillRect(44 + measure(s, fam, 34) + 4, -27, 4, 34); }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
