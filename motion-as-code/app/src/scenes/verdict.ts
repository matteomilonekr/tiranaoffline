// PLATE 9 `verdict` — "Quindi: sostituisce After Effects? Non proprio. Ma farlo partendo da un prompt…
// è pazzesco."
// A verdict form on the sheet: the question is set as it is asked, two boxes (Sì / Non proprio) and the
// pen ticks "Non proprio" as it is said, with a deadpan footnote. "Ma farlo partendo da un prompt…" is
// typed under it. "è pazzesco.": a full-frame slam of PAZZESCO., held for HOLD seconds, then it implodes
// into the spark at the centre of the sheet, the crop marks close back in and the title block returns:
// the last frame is the first frame of `hook`, so the video loops.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, lerp, noise1, prog, pulse } from '../engine/util';
import {
  Paper, Plot, Notes, camAt, K, w2s, setWorld, layWords, drawWords, drawSpark, burst, lineOf, phraseOf, mixCss,
  pt, rect, line, type Cam, type CamKey, type KWord,
} from './_vo';

/** How long the PAZZESCO. slam holds before it implodes (s). */
const HOLD = 0.4;
const FX0 = 360, FY0 = 170, FW = 1200, FH = 560; // the form (world px)

export default class Verdict extends Scene {
  paper = new Paper(24, 120);
  plot = new Plot();
  notes = new Notes();
  lines = new LineBatch(20000, { blend: 'add' });
  fx = new LineBatch(12000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L19!: Line; L20!: Line; L21!: Line;
  q: KWord[] = []; ma: KWord[] = [];
  w: Record<string, Word> = {};
  T0 = 0; T1 = 0; tSlam = 0; tImplode = 0; tHome = 0;
  home = pt(W / 2, H / 2);

  override init() {
    const ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L19 = lineOf(ly, 'sostituisce After Effects');
    this.L20 = lineOf(ly, 'Non proprio');
    this.L21 = lineOf(ly, 'farlo partendo');
    const w = this.w;
    w.pazzesco = phraseOf(ly, 'pazzesco', { line: this.L21 })[0]!;
    w.sost = phraseOf(ly, 'sostituisce', { line: this.L19 })[0]!;
    w.non = this.L20.words[0]!;
    this.tSlam = w.pazzesco!.start;
    this.tImplode = Math.min(this.T1 - 0.9, Math.max(w.pazzesco!.end, this.tSlam + 0.35) + HOLD);
    this.tHome = Math.min(this.T1 - 0.35, this.tImplode + 0.45);
    // the question, without "Quindi:" (said, and set small above the form)
    // "Quindi:" in the serif voice on the question's baseline, then the question
    const qx = FX0 + 60 + measure('Quindi:', F.serif(400, true), 60) + 22;
    this.q = layWords(this.L19.words.slice(this.L19.words.indexOf(w.sost!)), qx, FY0 + 168, 64, F.archivo(100, 700), { ant: 0.2 });
    const maWords = this.L21.words.slice(0, this.L21.words.indexOf(w.pazzesco!) - 1);
    this.ma = layWords(maWords, FX0, FY0 + FH + 120, 56, F.archivo(100, 500), { ant: 0.25 });
    this.notes.add('VERDETTO', FX0 + 60, FY0 + 54, this.T0 + 0.1, { size: 18, weight: 500, col: 'ash', group: 'form' });
    this.notes.add(`modulo MAC-${String(9).padStart(2, '0')} · compilato da: Claude`, FX0 + FW - 60, FY0 + 54, this.T0 + 0.2, { size: 15, align: 'right', group: 'form' });
    this.notes.add('Quindi:', FX0 + 60, FY0 + 168, this.L19.words[0]!.start, { size: 60, col: 'bone', a: 0.8, dur: 0.25, group: 'form', fam: F.serif(400, true) });
    this.notes.add('* l’occhio del motion designer resta indispensabile', FX0 + 60, FY0 + FH - 36, this.L20.end + 0.15, { size: 16, group: 'form' });
    // the form and its boxes
    const P = this.plot;
    P.add(rect(FX0, FY0, FW, FH), this.T0 + 0.02, this.T0 + 0.4, { ink: 'ash', width: 1.4, ez: ease.inOutCubic, group: 'form', hot: 0.5 });
    P.add(line(pt(FX0, FY0 + 90), pt(FX0 + FW, FY0 + 90)), this.T0 + 0.25, this.T0 + 0.45, { ink: 'ash', width: 1.0, group: 'form' });
    const by = FY0 + 270;
    for (const [i, bx] of [[0, FX0 + 80], [1, FX0 + 470]] as const) P.add(rect(bx, by, 64, 64), this.T0 + 0.35 + i * 0.1, this.T0 + 0.55 + i * 0.1, { width: 1.8, group: 'form' });
    // the tick on "Non proprio", and a firm underline
    const tN = w.non!.start;
    const tx = FX0 + 470;
    P.add([pt(tx + 10, by + 34), pt(tx + 26, by + 52), pt(tx + 58, by + 8)], tN + 0.02, tN + 0.2, { pen: true, ez: ease.inOutQuad, width: 5, ink: 'signal', group: 'form' });
    P.add(line(pt(tx + 90, by + 76), pt(tx + 90 + 330, by + 76), 8), this.L20.end - 0.05, this.L20.end + 0.2, { pen: true, ez: ease.inOutQuad, width: 2.4, ink: 'signal', group: 'form' });
    // the pen heads home for the finale
    P.wait(this.home, this.tHome, 0.05);
    this.cams = [
      K(this.T0, FX0 + FW / 2, FY0 + FH / 2 + 30, 1.08, 0.0),
      K(this.L20.end + 0.2, FX0 + FW / 2 + 20, FY0 + FH / 2 + 60, 1.12, 0.004, ease.inOutQuad),
      K(this.L21.words[0]!.start + 0.3, FX0 + FW / 2, FY0 + FH / 2 + 150, 1.0, 0.0, ease.inOutCubic),
      K(this.tSlam - 0.06, FX0 + FW / 2, FY0 + FH / 2 + 160, 1.03, 0.0, ease.linear),
      K(this.tSlam + 0.02, W / 2, H / 2, 1.0, 0.0, ease.outExpo),
      K(this.T1, W / 2, H / 2, 1.0, 0.0, ease.linear),
    ];
  }

  ga = (g: string, t: number) => (g === 'form' ? 1 - prog(t, this.tSlam - 0.05, this.tSlam + 0.05) : 1);

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = camAt(this.cams, t);
    const slam = t >= this.tSlam;
    const imp = ease.inExpo(prog(t, this.tImplode, this.tImplode + 0.4));
    const homeK = ease.inOutCubic(prog(t, this.tImplode + 0.3, this.T1 - 0.05));
    const pen = this.plot.penAt(t);
    const ps = w2s(c, pen.x, pen.y);
    // the sheet: dimmed under the slam, back to the opening's grid at the end
    const grid = slam ? lerp(0.15, 0.62, homeK) : 0.62;
    this.paper.render(renderer, out, c, { alpha: grid, pen: [ps[0], ps[1], 0.6 + 0.4 * homeK] });

    const L = this.lines; L.clear();
    this.plot.draw(L, t, c, this.ga);
    L.render(renderer, out);

    const T = this.text; T.clear();
    const x = T.ctx;
    const fa = this.ga('form', t);
    this.drawBoxLabels(x, c, t, fa);
    drawWords(x, c, this.q, t, { alpha: fa });
    drawWords(x, c, this.ma, t, { alpha: fa });
    this.notes.draw(x, c, t, this.ga);
    this.drawSlam(x, t, imp);
    this.titleBlock(x, homeK);
    comp.draw(renderer, T.upload(), out);

    // the spark: the pen through the form, then the point the slam implodes into
    const X = this.fx; X.clear();
    const homeS = w2s(c, this.home.x, this.home.y);
    if (!slam) drawSpark(X, t, (tt) => { const p = this.plot.penAt(tt); return w2s(camAt(this.cams, tt), p.x, p.y); }, { intensity: 0.9, scale: 0.9 });
    else if (t >= this.tImplode + 0.25) {
      // the imploded spark, settling to the opening's resting spark (same scale and intensity as hook at t = 0)
      const k = prog(t, this.tImplode + 0.25, this.T1 - 0.05);
      drawSpark(X, t, () => homeS, { intensity: lerp(1.6, 0.6, ease.outCubic(k)), scale: lerp(2.2, 0.9, ease.outCubic(k)), rate: lerp(160, 34, k) });
    }
    burst(X, t, this.tImplode + 0.36, homeS[0], homeS[1], { n: 120, speed: 1500, seed: 91, intensity: 1.3 });
    X.render(renderer, out);

    const sl = pulse(t, this.tSlam, 0.09), bang = pulse(t, this.tImplode + 0.36, 0.08);
    return {
      // the crop marks close back in for the loop into hook's first frame
      frame: homeK,
      zoom: 1 + 0.03 * sl + 0.02 * bang,
      shake: [10 * sl * noise1(t * 47, 1) + 8 * bang * noise1(t * 53, 3), 10 * sl * noise1(t * 43, 2) + 8 * bang * noise1(t * 41, 4)],
      flash: 0.03 * sl + 0.05 * bang,
      bloom: 0.65, bloomThreshold: 0.85, vignette: 0.42, ca: 1.0 + 2.5 * sl,
    };
  }

  drawBoxLabels(x: CanvasRenderingContext2D, c: Cam, t: number, a: number) {
    if (a <= 0) return;
    const by = FY0 + 270;
    const lab = (s: string, bx: number, t0: number, col: string) => {
      const k = prog(t, t0, t0 + 0.2);
      if (k <= 0) return;
      setWorld(x, c, bx + 90, by + 50, 1);
      x.font = font(F.archivo(100, 600), 52);
      x.textBaseline = 'alphabetic';
      x.fillStyle = rgba(col, a * k);
      x.fillText(s, 0, 0);
    };
    lab('Sì', FX0 + 80, this.T0 + 0.5, 'ash');
    lab('Non proprio', FX0 + 470, this.T0 + 0.6, t >= this.w.non!.start ? 'bone' : 'ash');
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** PAZZESCO., full frame: slams in from 1.35×, holds, then every letter falls into the centre. */
  drawSlam(x: CanvasRenderingContext2D, t: number, imp: number) {
    if (t < this.tSlam - 0.01 || imp >= 1) return;
    const txt = 'PAZZESCO.';
    const fam = F.archivo(125, 900);
    const size = Math.min(380, 1780 / (measure(txt, fam, 100) / 100));
    const pop = 1 + 0.35 * (1 - ease.outExpo(clamp((t - this.tSlam) / 0.16)));
    const tot = measure(txt, fam, size);
    const cy = H / 2 + 0.36 * size;
    let xx = W / 2 - tot / 2;
    const hot = Math.exp(-Math.max(0, t - this.tSlam) / 0.18);
    for (const [i, ch] of Array.from(txt).entries()) {
      const adv = measure(ch, fam, size);
      const gx = xx + adv / 2;
      // implode: each letter flies to the centre, shrinking and turning, the outer ones a little later
      const d = Math.abs(gx - W / 2) / (W / 2);
      const k = clamp(imp * (1.15 - 0.15 * d));
      const px = lerp(W / 2 + (gx - W / 2) * pop, W / 2, k), py = lerp(cy - 0.36 * size + (0.36 * size) * pop, H / 2, k);
      const sc = pop * (1 - k);
      if (sc > 0.01) {
        x.setTransform(sc * Math.cos(k * 2.5 * (i % 2 ? 1 : -1)), sc * Math.sin(k * 2.5 * (i % 2 ? 1 : -1)), -sc * Math.sin(k * 2.5 * (i % 2 ? 1 : -1)), sc * Math.cos(k * 2.5 * (i % 2 ? 1 : -1)), px, py);
        x.font = font(fam, size);
        x.textAlign = 'center';
        x.textBaseline = 'alphabetic';
        x.fillStyle = mixCss('bone', 'ember', Math.max(hot, k), 1);
        x.fillText(ch, 0, 0.36 * size);
      }
      xx += adv;
    }
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The opening's title block (as drawn by hook at t = 0), fading back in for the loop. */
  titleBlock(x: CanvasRenderingContext2D, k: number) {
    const a = ease.inOutQuad(clamp((k - 0.5) / 0.5));
    if (a <= 0) return;
    const bx = W - 600, by = H - 150;
    x.setTransform(1, 0, 0, 1, bx, by);
    x.strokeStyle = rgba('ash', 0.5 * a);
    x.lineWidth = 1;
    x.strokeRect(0, 0, 470, 84);
    x.beginPath(); x.moveTo(0, 42); x.lineTo(470, 42); x.moveTo(250, 42); x.lineTo(250, 84); x.stroke();
    x.font = font(F.mono(400), 15);
    x.fillStyle = rgba('bone', 0.8 * a);
    x.fillText('TITOLO   motion as code', 14, 27);
    x.fillStyle = rgba('ash', 0.85 * a);
    x.fillText('TAVOLA   1 di 9', 14, 69);
    x.fillText('SCALA    1:1', 264, 69);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
