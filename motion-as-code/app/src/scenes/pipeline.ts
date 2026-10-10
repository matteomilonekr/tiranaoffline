// PLATE 7 `pipeline` — "Il vecchio flusso: After Effects, livelli, keyframe, curve. Il nuovo: prompt,
// codice, render, video."
// The edit flips to bone paper. The old pipeline is drawn in ink, a box per word, each with its own
// pictogram (an app window, stacked layers, keyframe diamonds, an easing curve with handles), joined by
// fussy dog-leg arrows. "Il nuovo": the camera drops a row and the pen draws the new pipeline in signal
// orange, a box per word (a prompt caret, braces, a stack of frames, a play button), joined by straight
// arrows; the old row greys out and the camera pulls back to both.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { ease, noise1, prog, pulse } from '../engine/util';
import {
  Paper, Plot, Notes, camAt, K, w2s, setWorld, layWords, drawWords, drawSpark, lineOf, phraseOf,
  pt, rect, roundRect, line, arc, bezier, arrowHead, type Cam, type CamKey, type KWord, type P,
} from './_vo';

const BW = 300, BH = 170; // box size
const XS = [180, 600, 1020, 1440]; // box left edges
const Y_OLD = 330, Y_NEW = 760;

export default class Pipeline extends Scene {
  paper = new Paper(24, 120);
  plot = new Plot();
  notes = new Notes();
  lines = new LineBatch(30000, { blend: 'normal' });
  fx = new LineBatch(8000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L11!: Line; L12!: Line;
  rowOld: KWord[] = []; rowNew: KWord[] = [];
  oldW: Word[] = []; newW: Word[] = [];
  T0 = 0; T1 = 0; tNew = 0;

  override init() {
    const ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L11 = lineOf(ly, 'Il vecchio flusso');
    this.L12 = lineOf(ly, 'Il nuovo');
    const ae = phraseOf(ly, 'After Effects', { line: this.L11 });
    this.oldW = [ae[0]!, phraseOf(ly, 'livelli', { line: this.L11 })[0]!, phraseOf(ly, 'keyframe', { line: this.L11 })[0]!, phraseOf(ly, 'curve', { line: this.L11 })[0]!];
    this.newW = ['prompt', 'codice', 'render', 'video'].map((q) => phraseOf(ly, q, { line: this.L12 })[0]!);
    this.tNew = this.L12.words[0]!.start;
    // the spoken headers: "Il vecchio flusso:" / "Il nuovo:" (the box words are the boxes' labels)
    const hOld = this.L11.words.slice(0, this.L11.words.indexOf(ae[0]!));
    const hNew = this.L12.words.slice(0, this.L12.words.indexOf(this.newW[0]!));
    this.rowOld = layWords(hOld, XS[0]!, Y_OLD - 70, 56, F.archivo(100, 700), { ant: 0.2 });
    this.rowNew = layWords(hNew, XS[0]!, Y_NEW - 70, 56, F.archivo(100, 700), { ant: 0.2 });
    this.buildOld();
    this.buildNew();
    const mid = (XS[0]! + XS[3]! + BW) / 2;
    this.cams = [
      K(this.T0, mid, Y_OLD + 60, 1.12, 0.0),
      K(this.oldW[3]!.end, mid, Y_OLD + 80, 1.16, 0.0, ease.inOutQuad),
      K(this.tNew + 0.2, mid, Y_NEW + 60, 1.12, 0.0, ease.inOutCubic),
      K(this.newW[3]!.end + 0.1, mid, Y_NEW + 50, 1.16, 0.0, ease.inOutQuad),
      K(this.T1, mid, (Y_OLD + Y_NEW) / 2 + 60, 0.98, 0.0, ease.inOutCubic),
    ];
  }

  box(i: number, y: number, t0: number, ink: 'ink' | 'signal', pen: boolean, group: string) {
    const x = XS[i]!;
    this.plot.add(roundRect(x, y, BW, BH, 10), t0, t0 + 0.32, { pen, ez: ease.inOutCubic, width: ink === 'signal' ? 2.4 : 1.6, ink, group, hot: ink === 'signal' ? 1 : 0.4 });
  }

  buildOld() {
    const P = this.plot;
    this.oldW.forEach((w, i) => {
      const t0 = w.start - 0.05, x = XS[i]!, y = Y_OLD;
      this.box(i, y, t0, 'ink', false, 'old');
      const g = (pts: P[], d = 0.1, len = 0.25) => P.add(pts, t0 + d, t0 + d + len, { ink: 'graphite', width: 1.3, group: 'old', hot: 0.3 });
      const cx = x + BW / 2, cy = y + BH / 2 - 10;
      if (i === 0) { // an app window with a little timeline
        g(rect(cx - 90, cy - 50, 180, 100));
        g(line(pt(cx - 90, cy - 30), pt(cx + 90, cy - 30)), 0.2, 0.1);
        for (let k = 0; k < 3; k++) g(line(pt(cx - 70, cy + k * 18), pt(cx + 40 - k * 25, cy + k * 18)), 0.25 + k * 0.03, 0.1);
      } else if (i === 1) { // stacked layers
        for (let k = 0; k < 4; k++) g(rect(cx - 90 + k * 6, cy - 46 + k * 24, 170 - k * 12, 16), 0.1 + k * 0.05, 0.12);
      } else if (i === 2) { // keyframes on tracks
        for (let k = 0; k < 3; k++) {
          g(line(pt(cx - 100, cy - 30 + k * 30), pt(cx + 100, cy - 30 + k * 30)), 0.1 + k * 0.04, 0.12);
          for (let d = 0; d < 4; d++) {
            const kx = cx - 80 + d * 50 + (k * 17) % 30, ky = cy - 30 + k * 30;
            g([pt(kx, ky - 8), pt(kx + 8, ky), pt(kx, ky + 8), pt(kx - 8, ky), pt(kx, ky - 8)], 0.18 + d * 0.03, 0.05);
          }
        }
      } else { // an easing curve with handles
        const a = pt(cx - 90, cy + 45), b = pt(cx + 90, cy - 45);
        g(bezier(a, pt(cx + 30, cy + 45), pt(cx - 30, cy - 45), b, 40), 0.1, 0.3);
        g(line(a, pt(cx + 30, cy + 45)), 0.25, 0.08); g(line(b, pt(cx - 30, cy - 45)), 0.28, 0.08);
        g(arc(cx + 30, cy + 45, 5, 0, 7, 12), 0.3, 0.05); g(arc(cx - 30, cy - 45, 5, 0, 7, 12), 0.32, 0.05);
      }
      // fussy dog-leg arrows to the next box
      if (i < 3) {
        const a = pt(x + BW, y + BH / 2), b = pt(XS[i + 1]!, y + BH / 2);
        const m = (a.x + b.x) / 2;
        const path = [a, pt(m - 20, a.y), pt(m - 20, a.y - 40), pt(m + 20, a.y - 40), pt(m + 20, a.y + 30), pt(m, a.y + 30), pt(m, b.y), b];
        P.add(path, t0 + 0.3, t0 + 0.55, { ink: 'graphite', width: 1.3, group: 'old', hot: 0.3 });
        P.add(arrowHead(path[path.length - 2]!, b, 12), t0 + 0.53, t0 + 0.58, { ink: 'graphite', width: 1.3, group: 'old' });
      }
    });
    this.notes.add('~ 40 ore · 847 keyframe · 23 livelli', XS[0]!, Y_OLD + BH + 46, this.oldW[3]!.end + 0.05, { size: 18, col: 'graphite', a: 0.95, group: 'old' });
  }

  buildNew() {
    const P = this.plot;
    this.newW.forEach((w, i) => {
      const t0 = w.start - 0.04, x = XS[i]!, y = Y_NEW;
      this.box(i, y, t0, 'signal', true, 'new');
      const cx = x + BW / 2, cy = y + BH / 2 - 10;
      const g = (pts: P[], d = 0.12, len = 0.2, pen = false) => P.add(pts, t0 + d, t0 + d + len, { ink: 'signal', width: 2.2, group: 'new', pen });
      if (i === 0) { g([pt(cx - 60, cy - 30), pt(cx - 25, cy), pt(cx - 60, cy + 30)]); g(line(pt(cx - 5, cy + 30), pt(cx + 55, cy + 30)), 0.25, 0.1); }
      else if (i === 1) { g(bezier(pt(cx - 30, cy - 45), pt(cx - 60, cy - 45), pt(cx - 30, cy), pt(cx - 60, cy), 16)); g(bezier(pt(cx - 60, cy), pt(cx - 30, cy), pt(cx - 60, cy + 45), pt(cx - 30, cy + 45), 16), 0.2); g(bezier(pt(cx + 30, cy - 45), pt(cx + 60, cy - 45), pt(cx + 30, cy), pt(cx + 60, cy), 16), 0.22); g(bezier(pt(cx + 60, cy), pt(cx + 30, cy), pt(cx + 60, cy + 45), pt(cx + 30, cy + 45), 16), 0.3); }
      else if (i === 2) { for (let k = 0; k < 3; k++) g(rect(cx - 70 + k * 16, cy - 40 - k * 12, 110, 62), 0.1 + k * 0.06, 0.14); }
      else { g([pt(cx - 30, cy - 40), pt(cx + 45, cy), pt(cx - 30, cy + 40), pt(cx - 30, cy - 40)], 0.1, 0.22); }
      if (i < 3) {
        const a = pt(x + BW + 8, y + BH / 2), b = pt(XS[i + 1]! - 10, y + BH / 2);
        P.add(line(a, b, 6), t0 + 0.3, t0 + 0.42, { pen: true, ink: 'signal', width: 2.4, group: 'new', ez: ease.inQuad });
        P.add(arrowHead(a, b, 16), t0 + 0.41, t0 + 0.45, { ink: 'signal', width: 2.4, group: 'new' });
      }
    });
    this.notes.add('~ minuti · 0 keyframe · 1 conversazione', XS[0]!, Y_NEW + BH + 46, this.newW[3]!.end + 0.1, { size: 18, col: 'signal', a: 1, group: 'new' });
  }

  ga = (g: string, t: number) => (g === 'old' ? 1 - 0.62 * prog(t, this.tNew, this.tNew + 0.5) : 1);

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = camAt(this.cams, t);
    this.paper.render(renderer, out, c, { light: true, alpha: 0.6 });

    const L = this.lines; L.clear();
    this.plot.draw(L, t, c, this.ga);
    L.render(renderer, out);

    const T = this.text; T.clear();
    const x = T.ctx;
    drawWords(x, c, this.rowOld, t, { cooled: 'ink', rest: 'graphite', alpha: this.ga('old', t) });
    drawWords(x, c, this.rowNew, t, { cooled: 'ink', rest: 'graphite' });
    this.labels(x, c, t);
    this.notes.draw(x, c, t, this.ga);
    comp.draw(renderer, T.upload(), out);

    const X = this.fx; X.clear();
    drawSpark(X, t, (tt) => { const p = this.plot.penAt(tt, pt(XS[0]!, Y_NEW)); return w2s(camAt(this.cams, tt), p.x, p.y); }, { intensity: prog(t, this.tNew - 0.3, this.tNew), scale: 0.9 });
    X.render(renderer, out);

    let hit = 0;
    for (const w of this.newW) hit = Math.max(hit, pulse(t, w.start, 0.07));
    return { paper: 1, bloom: 0.5, bloomThreshold: 0.9, vignette: 0.25, grain: 0.045, zoom: 1 + 0.01 * hit, shake: [1.5 * hit * noise1(t * 50, 1), 0] };
  }

  /** The words of the pipelines as box labels: each set when spoken (ink for the old, signal for the new). */
  labels(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const lab = (w: Word, i: number, y: number, col: string, a: number, text: string) => {
      const k = prog(t, w.start - 0.03, w.start + 0.12);
      if (k <= 0) return;
      setWorld(x, c, XS[i]! + BW / 2, y + BH - 22, 1);
      x.font = font(F.archivo(100, 700), 30);
      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      x.fillStyle = rgba(col, a * k);
      x.fillText(text, 0, 0);
    };
    const ao = this.ga('old', t);
    this.oldW.forEach((w, i) => lab(w, i, Y_OLD, 'ink', 0.9 * ao, ['After Effects', 'livelli', 'keyframe', 'curve'][i]!));
    this.newW.forEach((w, i) => lab(w, i, Y_NEW, 'signal', 1, ['prompt', 'codice', 'render', 'video'][i]!));
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
