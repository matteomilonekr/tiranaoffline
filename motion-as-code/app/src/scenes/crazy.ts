// PLATE 4 `crazy` — "Ed è qui che diventa folle: non genera direttamente un MP4."
// Out of the prompt's flash: the words slam in one by one as a poster, condensed and springing wide on
// Archivo's width axis; FOLLE fills the frame and boils (every letter re-picks its width, weight and tilt
// a few times a second) while the frame shakes. Then the camera drops to what you would expect to get, a
// video.mp4 file with a render bar: the bar never moves, the pen crosses the file out, and its extension
// scrambles into .ts — the next plate opens that file.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp, noise1, prog, pulse } from '../engine/util';
import {
  Paper, Plot, Notes, camAt, K, w2s, setWorld, layWords, drawWords, drawSpark, burst, lineOf, phraseOf, mixCss,
  pt, line, roundRect, type Cam, type CamKey, type KWord,
} from './_vo';

const WIDTHS = [62, 75, 87.5, 100, 112.5, 125];
const FY = 1560; // the file's area (world y)

export default class Crazy extends Scene {
  paper = new Paper(24, 120);
  plot = new Plot();
  notes = new Notes();
  lines = new LineBatch(20000, { blend: 'add' });
  fx = new LineBatch(12000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L6!: Line; L7!: Line;
  poster: Word[] = [];
  w: Record<string, Word> = {};
  row7: KWord[] = [];
  T0 = 0; T1 = 0;
  file = { x: W / 2 - 170, y: FY - 300, w: 340, h: 420 };

  override init() {
    const ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L6 = lineOf(ly, 'Ed è qui che diventa folle');
    this.L7 = lineOf(ly, 'non genera direttamente');
    this.poster = this.L6.words.slice(0, -1);
    this.w.folle = this.L6.words[this.L6.words.length - 1]!;
    this.w.non = this.L7.words[0]!;
    this.w.mp4 = phraseOf(ly, 'MP4', { line: this.L7 })[0]!;
    this.w.direttamente = phraseOf(ly, 'direttamente', { line: this.L7 })[0]!;
    this.row7 = layWords(this.L7.words, W / 2, FY + 372, 64, F.archivo(100, 500), { align: 'center', ant: 0.25 });
    this.buildPlot();
    const tf = this.w.folle!.start, tn = this.w.non!.start;
    this.cams = [
      K(this.T0, W / 2, H / 2, 1.08, 0.0),
      K(tf - 0.02, W / 2, H / 2 - 10, 1.14, -0.01, ease.inOutQuad),
      K(tf + 0.25, W / 2, H / 2 + 30, 0.98, 0.012, ease.outExpo),
      K(tn - 0.32, W / 2, H / 2 + 40, 1.0, 0.0, ease.inOutQuad),
      K(tn + 0.05, W / 2, FY + 40, 1.0, 0.0, ease.inOutCubic),
      K(this.w.mp4!.end + 0.1, W / 2, FY + 60, 1.1, 0.0, ease.inOutQuad),
      K(this.T1, W / 2 + 90, FY + 30, 1.5, 0.0, ease.inCubic),
    ];
  }

  buildPlot() {
    const P = this.plot, N = this.notes, f = this.file;
    const t0 = this.w.non!.start - 0.25;
    // the file: a sheet with a folded corner
    const fold = 70;
    P.add([pt(f.x, f.y), pt(f.x + f.w - fold, f.y), pt(f.x + f.w, f.y + fold), pt(f.x + f.w, f.y + f.h), pt(f.x, f.y + f.h), pt(f.x, f.y)], t0, t0 + 0.4, { pen: true, ez: ease.inOutCubic, width: 2, group: 'file' });
    P.add([pt(f.x + f.w - fold, f.y), pt(f.x + f.w - fold, f.y + fold), pt(f.x + f.w, f.y + fold)], t0 + 0.38, t0 + 0.48, { width: 1.6, group: 'file' });
    // the play triangle inside
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2 - 20;
    P.add([pt(cx - 40, cy - 52), pt(cx + 58, cy), pt(cx - 40, cy + 52), pt(cx - 40, cy - 52)], t0 + 0.45, t0 + 0.65, { width: 2, group: 'play' });
    // the render bar under the file
    const by = f.y + f.h + 92;
    P.add(roundRect(W / 2 - 260, by, 520, 22, 4), t0 + 0.5, t0 + 0.75, { ink: 'ash', width: 1.4, group: 'bar' });
    N.add('render video.mp4 …', W / 2 - 260, by + 54, t0 + 0.55, { size: 17, group: 'bar' });
    // crossed out on "direttamente"
    const tx = this.w.direttamente!.start + 0.05;
    P.add(line(pt(f.x - 40, f.y - 40), pt(f.x + f.w + 40, f.y + f.h + 40), 8), tx, tx + 0.16, { pen: true, ez: ease.inQuad, width: 5, ink: 'signal', group: 'x' });
    P.add(line(pt(f.x + f.w + 40, f.y - 40), pt(f.x - 40, f.y + f.h + 40), 8), tx + 0.19, tx + 0.35, { pen: true, ez: ease.inQuad, width: 5, ink: 'signal', group: 'x' });
    N.add('0%  ·  nessun video in uscita', W / 2 + 260, by + 54, this.w.non!.start + 0.3, { size: 17, align: 'right', col: 'signal', a: 0.95, group: 'bar' });
    this.plot.wait(pt(W / 2 + 200, FY + 60), this.T1 - 0.2, 0.05);
  }

  ga = (g: string, t: number) => {
    const sw = prog(t, this.w.mp4!.start + 0.15, this.w.mp4!.end + 0.25);
    switch (g) {
      case 'play': return 1 - sw;
      case 'x': return 1 - 0.7 * sw;
      default: return 1;
    }
  };

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = camAt(this.cams, t);
    const tf = this.w.folle!.start;
    const boil = prog(t, tf - 0.02, tf + 0.05) * (1 - prog(t, this.w.non!.start - 0.25, this.w.non!.start));

    this.paper.render(renderer, out, c, { alpha: 0.55, fade: 0.35 * boil });

    const L = this.lines; L.clear();
    this.plot.draw(L, t, c, this.ga);
    L.render(renderer, out);

    const T = this.text; T.clear();
    const x = T.ctx;
    this.drawPoster(x, c, t);
    this.drawFolle(x, c, t, boil);
    this.drawFile(x, c, t);
    drawWords(x, c, this.row7, t, {});
    this.notes.draw(x, c, t, this.ga);
    comp.draw(renderer, T.upload(), out);

    const X = this.fx; X.clear();
    drawSpark(X, t, (tt) => { const p = this.plot.penAt(tt, pt(W / 2, FY - 400)); return w2s(camAt(this.cams, tt), p.x, p.y); }, { intensity: prog(t, this.w.non!.start - 0.4, this.w.non!.start - 0.2), scale: 1 });
    const fcx = w2s(c, W / 2, FY - 90);
    burst(X, t, this.w.direttamente!.start + 0.06, fcx[0], fcx[1], { n: 60, speed: 800, seed: 77 });
    const fs = w2s(c, W / 2, H * 0.62);
    burst(X, t, tf, fs[0], fs[1], { n: 90, speed: 1300, seed: 71, intensity: 1.2 });
    X.render(renderer, out);

    const shake = 16 * boil * (0.6 + 0.4 * f.a.vocal) + 10 * pulse(t, tf, 0.1);
    return {
      shake: [shake * noise1(t * 37, 1), shake * noise1(t * 41, 2)],
      zoom: 1 + 0.03 * pulse(t, tf, 0.09),
      ca: 1.2 + 4 * boil, bloom: 0.7, bloomThreshold: 0.85, vignette: 0.45,
      flash: 0.2 * Math.pow(1 - prog(t, this.T0, this.T0 + 0.1), 2),
    };
  }

  /** "Ed è qui che diventa": each word slams in condensed and springs wide. */
  drawPoster(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const words = this.poster;
    const away = prog(t, this.w.non!.start - 0.3, this.w.non!.start + 0.1);
    const rows = [words.slice(0, Math.ceil(words.length / 2)), words.slice(Math.ceil(words.length / 2))];
    const size = 118;
    rows.forEach((r, ri) => {
      // lay the row out at its final width, then each word animates its own width around its slot
      const fams = r.map((w) => (t >= w.start ? F.archivo(lerp(62, 112.5, ease.outElastic(clamp((t - w.start) / 0.5))), 800) : F.archivo(62, 800)));
      const widths = r.map((w, i) => measure(w.w, fams[i]!, size));
      const sp = size * 0.28;
      const tot = widths.reduce((a, b) => a + b, 0) + sp * (r.length - 1);
      let xx = W / 2 - tot / 2;
      const y = 250 + ri * 150;
      r.forEach((w, i) => {
        const k = prog(t, w.start - 0.04, w.start + 0.06);
        if (k > 0) {
          setWorld(x, c, xx, y, 1);
          x.font = font(fams[i]!, size);
          x.textBaseline = 'alphabetic';
          const hot = Math.exp(-Math.max(0, t - w.start) / 0.12);
          x.fillStyle = mixCss('bone', 'ember', hot, k * (1 - away));
          x.fillText(w.w, 0, 0);
        }
        xx += widths[i]! + sp;
      });
    });
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** FOLLE: every letter re-picks width, weight and tilt on a 15 Hz clock (frameIdx-based: stable in each frame). */
  drawFolle(x: CanvasRenderingContext2D, c: Cam, t: number, boil: number) {
    const w = this.w.folle!;
    if (t < w.start - 0.02) return;
    const away = prog(t, this.w.non!.start - 0.3, this.w.non!.start + 0.05);
    if (away >= 1) return;
    const txt = 'FOLLE:';
    const size = 330;
    const step = Math.floor(frameIdx(t) / 4);
    const glyphs = Array.from(txt).map((ch, i) => {
      const settle = boil < 1 ? 1 - boil : 0;
      const wi = Math.floor(hash(i, step, 5) * WIDTHS.length);
      const width = settle > 0.5 ? 125 : WIDTHS[wi]!;
      const fam = F.archivo(width, hash(i, step, 6) < 0.5 ? 900 : 700);
      return { ch, fam, adv: measure(ch, fam, size), rot: (hash(i, step, 7) - 0.5) * 0.22 * boil, dy: (hash(i, step, 8) - 0.5) * 60 * boil };
    });
    const tot = glyphs.reduce((a, g) => a + g.adv, 0);
    const pop = 1 + 0.25 * (1 - ease.outExpo(clamp((t - w.start) / 0.15)));
    let xx = W / 2 - (tot * pop) / 2;
    const y = H * 0.62 + 0.36 * size;
    for (const g of glyphs) {
      setWorld(x, c, xx + (g.adv * pop) / 2, y + g.dy, pop, g.rot);
      x.font = font(g.fam, size);
      x.textBaseline = 'alphabetic';
      x.textAlign = 'center';
      x.fillStyle = mixCss('signal', 'bone', prog(t, w.end, w.end + 0.6), 1 - away);
      x.fillText(g.ch, 0, 0);
      xx += g.adv * pop;
    }
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The file name under the icon: video.mp4, scrambling into scene.ts on "MP4". */
  drawFile(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const f = this.file, w = this.w.mp4!;
    const t0 = this.w.non!.start + 0.1;
    if (t < t0) return;
    const a = prog(t, t0, t0 + 0.15);
    const from = 'video.mp4', to = 'scene.ts';
    const k = prog(t, w.start + 0.1, w.end + 0.2);
    let s = from;
    if (k > 0) {
      const glyphs = '#%&/\\{}<>=+*01';
      const n = Math.max(from.length, to.length);
      s = Array.from({ length: n }, (_, i) => {
        const done = k * n * 1.3 - i * 0.6 > 1;
        if (done) return to[i] ?? '';
        if (k * n * 1.3 - i * 0.6 > 0) return glyphs[Math.floor(hash(i, frameIdx(t), 9) * glyphs.length)]!;
        return from[i] ?? '';
      }).join('');
    }
    setWorld(x, c, f.x + f.w / 2, f.y + f.h + 54, 1);
    x.font = font(F.mono(500), 40);
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.fillStyle = k > 0 && k < 1 ? rgba('signal', a) : rgba(k >= 1 ? 'signal' : 'bone', a);
    x.fillText(s, 0, 0);
    // { } inside the sheet once it is code
    if (k > 0.6) {
      setWorld(x, c, f.x + f.w / 2, f.y + f.h / 2 + 30, 1);
      x.font = font(F.mono(400), 150);
      x.fillStyle = rgba('bone', prog(k, 0.6, 1));
      x.fillText('{ }', 0, 0);
    }
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
