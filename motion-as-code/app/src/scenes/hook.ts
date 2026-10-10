// PLATE 1 `hook` — "E se ti dicessi che puoi creare motion graphics come questa senza nemmeno aprire
// After Effects? E no, non è un MCP per After Effects."
// A dark construction sheet inside crop marks; the spark rests at its centre (the video's first and
// last frame: the verdict comes back here, so it loops). The question is set as a type specimen being
// built: the opening words wipe in, MOTION GRAPHICS slams in at full width while the pen rules its
// baseline, cap line and letter boxes; "questa" gets a callout pointing at the sheet itself; the pen
// strikes After Effects out. Then the camera drops to a wiring diagram, Claude —MCP→ After Effects,
// and on "no" the pen cuts the connector. A whip pan right hands over to `model`.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, lerp, noise1, prog, pulse } from '../engine/util';
import {
  Paper, Plot, Notes, camAt, K, w2s, setWorld, layWords, drawWords, kwWidth, drawSpark, burst, lineOf, phraseOf,
  pt, rect, roundRect, bezier, arrowHead, line, type Cam, type CamKey, type KWord,
} from './_vo';

export default class Hook extends Scene {
  paper = new Paper(24, 120);
  plot = new Plot();
  notes = new Notes();
  lines = new LineBatch(40000, { blend: 'add' });
  fx = new LineBatch(12000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L0!: Line; L1!: Line;
  rowA: KWord[] = []; rowB: KWord[] = []; rowC: KWord[] = []; rowD: KWord[] = []; rowE: KWord[] = [];
  w: Record<string, Word> = {};
  T1 = 0; tWhip = 0;
  home = pt(W / 2, H / 2); // the spark's resting place (frame 0)
  strike = { x0: 0, x1: 0, y: 0 };
  cutAt = pt(0, 0);

  override init() {
    const ly = this.ctx.lyrics;
    this.T1 = this.ctx.end;
    this.L0 = lineOf(ly, 'E se ti dicessi');
    this.L1 = lineOf(ly, 'non è un MCP');
    const ph = (q: string, l: Line = this.L0) => phraseOf(ly, q, { line: l });
    const w = this.w;
    [w.motion, w.graphics] = ph('motion graphics') as [Word, Word];
    [w.come, w.questa] = ph('come questa') as [Word, Word];
    [w.after, w.effects] = ph('After Effects') as [Word, Word];
    w.senza = ph('senza')[0]!;
    [w.e2, w.no] = ph('E no', this.L1) as [Word, Word];
    w.mcp = ph('MCP', this.L1)[0]!;
    [w.after2, w.effects2] = ph('After Effects', this.L1) as [Word, Word];
    this.tWhip = this.T1 - 0.34;

    // ---- the specimen (world px; the camera starts close on the first row)
    const wordsA = this.L0.words.slice(0, this.L0.words.indexOf(w.motion!));
    const wordsC = [w.come!, w.questa!];
    const wordsD = this.L0.words.slice(this.L0.words.indexOf(w.senza!));
    const famA = F.archivo(100, 500), famB = F.archivo(125, 900), famC = F.serif(400, true);
    const X0 = 150;
    this.rowA = layWords(wordsA, X0, 270, 64, famA, { ant: 0.25 });
    for (const k of this.rowA) k.tAnt = Math.max(k.tAnt, 0.08); // frame 0 is the bare sheet (the loop point)
    const bw = layout('MOTION GRAPHICS', famB, 100).width / 100;
    const sizeB = Math.min(230, 1620 / bw);
    this.rowB = layWords([w.motion!, w.graphics!], X0 - 6, 270 + 70 + 0.72 * sizeB, sizeB, famB, { texts: ['MOTION', 'GRAPHICS'], ant: 0.05 });
    const yB = this.rowB[0]!.y;
    this.rowC = layWords(wordsC, X0, yB + 0.21 * sizeB + 150, 92, famC, { ant: 0.2 });
    this.rowD = layWords(wordsD, X0, this.rowC[0]!.y + 140, 64, famA, { ant: 0.25 });
    // "After Effects?" in the bolder cut of the row
    for (const k of this.rowD) if (k.w === w.after || k.w === w.effects) { k.fam = F.archivo(100, 700); k.lay = layout(k.text, k.fam, 100); }
    // re-flow row D after the font change
    let cx = X0;
    for (const k of this.rowD) { k.x = cx; cx += kwWidth(k) + (layout(' ', famA, 100).width / 100) * 64; }
    const kA = this.rowD.find((k) => k.w === w.after)!, kE = this.rowD.find((k) => k.w === w.effects)!;
    this.strike = { x0: kA.x - 14, x1: kE.x + kwWidth(kE) - (layout('?', kE.fam, 100).width / 100) * 64 + 10, y: kA.y - 0.33 * 64 };

    // ---- the diagram, below the specimen
    const DY = 1420;
    this.rowE = layWords(this.L1.words, W / 2, DY + 300, 60, F.archivo(100, 500), { align: 'center', ant: 0.3 });

    this.buildPlot(yB, sizeB, DY);
    this.buildCamera(yB, DY);
  }

  buildPlot(yB: number, sizeB: number, DY: number) {
    const P = this.plot, N = this.notes, w = this.w;
    const tM = w.motion!.start, tG = w.graphics!.start;
    // the pen glides under each word of the first row while it is spoken (an invisible pen path)
    for (const k of this.rowA) P.add(line(pt(k.x + 2, k.y + 22), pt(k.x + kwWidth(k), k.y + 22)), k.w.start, Math.max(k.w.start + 0.05, k.w.end), { pen: true, alpha: 0, ez: ease.linear });
    const x0 = this.rowB[0]!.x, x1 = this.rowB[1]!.x + kwWidth(this.rowB[1]!);
    const cap = yB - 0.72 * sizeB, xh = yB - 0.53 * sizeB, desc = yB + 0.21 * sizeB;
    // rules of the specimen: baseline, cap line, x-height, descender, drawn out of the slam
    P.add(line(pt(x0 - 60, yB), pt(x1 + 60, yB)), tM - 0.02, tM + 0.32, { pen: true, ez: ease.outCubic, ink: 'ash', width: 1.2, group: 'rules' });
    P.add(line(pt(x1 + 60, cap), pt(x0 - 60, cap)), tM + 0.3, tM + 0.55, { pen: true, ez: ease.inOutQuad, ink: 'ash', width: 1.0, dash: 9, group: 'rules' });
    P.add(line(pt(x0 - 60, xh), pt(x1 + 60, xh)), tM + 0.08, tM + 0.4, { ink: 'ash', alpha: 0.6, width: 1.0, dash: 5, group: 'rules' });
    P.add(line(pt(x0 - 60, desc), pt(x1 + 60, desc)), tM + 0.1, tM + 0.42, { ink: 'ash', alpha: 0.5, width: 1.0, dash: 5, group: 'rules' });
    N.add('baseline', x1 + 70, yB + 5, tM + 0.25, { size: 14, group: 'rules' });
    N.add(`cap height ${Math.round(0.72 * sizeB)}`, x1 + 70, cap + 5, tM + 0.5, { size: 14, group: 'rules' });
    N.add('x-height', x1 + 70, xh + 5, tM + 0.35, { size: 14, group: 'rules' });
    // letter boxes, cascading through each word while it is spoken
    for (const k of this.rowB) {
      const n = k.lay.glyphs.length, kk = k.size / 100;
      k.lay.glyphs.forEach((g, gi) => {
        if (g.ch === ' ') return;
        const ta = lerp(k.w.start, Math.max(k.w.start + 0.2, k.w.end), gi / n);
        P.add(rect(k.x + g.x * kk, cap, g.w * kk, yB - cap), ta, ta + 0.12, { ink: 'ash', alpha: 0.55, width: 1.0, group: 'boxes', hot: 0.8 });
      });
    }
    // dimension of the block, with the type spec (under the specimen)
    const dy = desc + 40;
    P.add([pt(x0, dy - 9), pt(x0, dy + 9)], tG + 0.1, tG + 0.14, { ink: 'ash', group: 'dims' });
    P.add([pt(x1, dy - 9), pt(x1, dy + 9)], tG + 0.1, tG + 0.14, { ink: 'ash', group: 'dims' });
    P.add(line(pt(x0, dy), pt(x1, dy)), tG + 0.12, tG + 0.42, { ink: 'ash', group: 'dims', ez: ease.outCubic });
    P.add(arrowHead(pt(x1, dy), pt(x0, dy), 12), tG + 0.12, tG + 0.16, { ink: 'ash', group: 'dims' });
    P.add(arrowHead(pt(x0, dy), pt(x1, dy), 12), tG + 0.4, tG + 0.44, { ink: 'ash', group: 'dims' });
    N.add(`${Math.round(x1 - x0)} px`, (x0 + x1) / 2, dy + 26, tG + 0.36, { size: 15, align: 'center', group: 'dims' });
    N.add(`Archivo 900 · wdth 125 · ${Math.round(sizeB)} px`, x0, dy + 26, tG + 0.2, { size: 15, group: 'dims' });
    N.add(`t = ${tM.toFixed(2)} s`, x1, dy + 26, tM + 0.1, { size: 15, align: 'right', col: 'signal', a: 0.95, group: 'dims' });

    // "questa": the pen underlines it and hooks an arrow up at the specimen
    const kq = this.rowC.find((k) => k.w === w.questa)!;
    const qx0 = kq.x, qx1 = kq.x + kwWidth(kq), qy = kq.y + 18;
    const tq = w.questa!.start;
    P.add(line(pt(qx0 - 4, qy), pt(qx1 + 6, qy), 8), tq + 0.02, tq + 0.24, { pen: true, ez: ease.inOutQuad, width: 2.2, ink: 'signal', group: 'questa' });
    const aEnd = pt(this.rowB[1]!.x + 0.45 * kwWidth(this.rowB[1]!), desc + 6);
    const curve = bezier(pt(qx1 + 18, qy - 6), pt(qx1 + 300, qy - 6), pt(aEnd.x, aEnd.y + 150), aEnd, 48);
    P.add(curve, tq + 0.24, tq + 0.58, { pen: true, ez: ease.inOutCubic, width: 1.8, ink: 'signal', group: 'questa' });
    P.add(arrowHead(curve[curve.length - 4]!, aEnd, 16), tq + 0.57, tq + 0.62, { pen: true, width: 1.8, ink: 'signal', group: 'questa' });
    N.add('fig. 1 — questa, sì.', qx1 + 40, qy + 34, tq + 0.45, { size: 17, col: 'bone', a: 0.85, group: 'questa' });

    // "After Effects?": struck out on the spot
    const s = this.strike, tS = w.effects!.start + 0.16;
    P.add(line(pt(s.x0, s.y + 3), pt(s.x1, s.y - 3), 10), tS, tS + 0.2, { pen: true, ez: ease.inQuad, width: 3.2, ink: 'signal', group: 'strike' });
    N.add('// nessun After Effects è stato aperto', s.x0, s.y + 78, tS + 0.24, { size: 15, group: 'strike' });

    // ---- the diagram: Claude —MCP→ After Effects (drawn while the camera drops), then cut
    const bx = (cx: number) => ({ x: cx - 210, y: DY - 80, w: 420, h: 160 });
    const A = bx(560), B = bx(1360);
    const tD = this.L0.end + 0.05;
    P.add(roundRect(A.x, A.y, A.w, A.h, 18), tD, tD + 0.34, { pen: true, ez: ease.inOutQuad, width: 1.6, group: 'diag' });
    P.add(roundRect(B.x, B.y, B.w, B.h, 18), tD + 0.36, tD + 0.7, { pen: true, ez: ease.inOutQuad, width: 1.6, group: 'diag' });
    const c0 = pt(A.x + A.w + 6, DY), c1 = pt(B.x - 10, DY);
    P.add(line(c0, c1, 12), tD + 0.72, tD + 0.98, { pen: true, ez: ease.inOutQuad, width: 1.6, ink: 'bone', group: 'wire' });
    P.add(arrowHead(c0, c1, 16), tD + 0.97, tD + 1.02, { width: 1.6, group: 'wire' });
    N.add('MCP', (c0.x + c1.x) / 2, DY - 22, tD + 0.86, { size: 22, align: 'center', col: 'bone', weight: 500, group: 'wire' });
    N.add('plugin · socket · bridge', (c0.x + c1.x) / 2, DY + 40, tD + 0.95, { size: 14, align: 'center', group: 'wire' });
    N.add('MODELLO', A.x + 18, A.y - 14, tD + 0.2, { size: 13, group: 'diag' });
    N.add('APP', B.x + 18, B.y - 14, tD + 0.55, { size: 13, group: 'diag' });
    // the cut, on "no"
    const tN = this.w.no!.start;
    const m = pt((c0.x + c1.x) / 2, DY);
    this.cutAt = m;
    P.add(line(pt(m.x - 46, m.y - 46), pt(m.x + 46, m.y + 46), 6), tN, tN + 0.1, { pen: true, ez: ease.inQuad, width: 4, ink: 'signal', group: 'x' });
    P.add(line(pt(m.x + 46, m.y - 46), pt(m.x - 46, m.y + 46), 6), tN + 0.13, tN + 0.23, { pen: true, ez: ease.inQuad, width: 4, ink: 'signal', group: 'x' });
    N.add('collegamento: nessuno', m.x, m.y + 96, tN + 0.3, { size: 16, align: 'center', col: 'signal', a: 1, group: 'x' });
    // the pen leaves to the right on the whip
    this.plot.wait(pt(m.x + 260, m.y - 40), this.tWhip - 0.1, 0.05);
  }

  buildCamera(yB: number, DY: number) {
    const w = this.w, a0 = this.rowA[0]!, aN = this.rowA[this.rowA.length - 1]!;
    const tFirst = this.L0.words[0]!.start;
    this.cams = [
      K(0, W / 2, H / 2, 1, 0),
      K(Math.max(0.05, tFirst - 0.05), W / 2, H / 2, 1, 0),
      // push onto the first row as it is spoken, drifting with the words
      K(tFirst + 0.35, a0.x + 330, a0.y - 30, 1.9, -0.01, ease.inOutCubic),
      K(w.motion!.start - 0.04, aN.x + kwWidth(aN) - 380, a0.y - 24, 1.95, -0.012, ease.inOutQuad),
      // MOTION GRAPHICS: snap back to the whole specimen
      K(w.motion!.start + 0.3, W / 2, yB - 60, 1.0, 0.0, ease.outExpo),
      K(w.questa!.start, W / 2 - 10, yB + 30, 1.03, 0.004, ease.inOutQuad),
      K(w.senza!.start, 935, this.rowC[0]!.y - 30, 1.07, 0.0, ease.inOutQuad),
      K(w.effects!.start + 0.4, 930, this.rowD[0]!.y - 150, 1.12, -0.006, ease.inOutQuad),
      // drop to the diagram
      K(this.L0.end + 0.55, W / 2, DY + 80, 0.98, 0.0, ease.inOutCubic),
      K(w.no!.start - 0.02, W / 2, DY + 70, 1.02, 0.0, ease.inOutQuad),
      K(w.no!.start + 0.22, this.cutAt.x, DY + 40, 1.22, 0.012, ease.outExpo),
      K(this.tWhip, W / 2 + 40, DY + 110, 1.08, 0.0, ease.inOutQuad),
      // whip right (the model plate lands from the left)
      K(this.T1, W / 2 + 2600, DY + 110, 1.08, 0.0, ease.inCubic),
    ];
  }

  cam(t: number): Cam { return camAt(this.cams, t); }

  ga = (g: string, t: number): number => {
    const w = this.w;
    const drop = 1 - prog(t, this.L0.end + 0.1, this.L0.end + 0.6);
    switch (g) {
      case 'rules': return (1 - 0.65 * prog(t, w.come!.start, w.senza!.start)) * drop;
      case 'boxes': return (1 - prog(t, w.graphics!.end, w.graphics!.end + 0.5)) * drop;
      case 'dims': return (1 - 0.5 * prog(t, w.senza!.start, w.after!.start)) * drop;
      case 'questa': return drop;
      case 'strike': return drop;
      case 'diag': return 1 - 0.55 * prog(t, w.no!.start, w.no!.start + 0.3);
      case 'wire': return 1 - 0.75 * prog(t, w.no!.start + 0.05, w.no!.start + 0.35);
      default: return 1;
    }
  };

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, w = this.w;
    const c = this.cam(t);
    const tFirst = this.L0.words[0]!.start;
    const pen = this.plot.penAt(t, this.home);
    const ps = w2s(c, pen.x, pen.y);

    // ---- sheet
    this.paper.render(renderer, out, c, { alpha: 0.62 + 0.18 * prog(t, 0, tFirst + 0.3), pen: [ps[0], ps[1], 0.6 + 0.4 * f.a.vocal] });

    // ---- drawing
    const L = this.lines; L.clear();
    this.plot.draw(L, t, c, this.ga);
    L.render(renderer, out);

    // ---- type
    const T = this.text; T.clear();
    const x = T.ctx;
    const drop = 1 - prog(t, this.L0.end + 0.15, this.L0.end + 0.7);
    drawWords(x, c, this.rowA, t, { alpha: drop * (1 - 0.35 * prog(t, w.motion!.start, w.motion!.start + 0.3)) });
    // MOTION GRAPHICS slams in, word by word, from 1.35x
    drawWords(x, c, this.rowB, t, {
      alpha: drop, outline: false, sung: 'ember', cool: 0.5, whole: true,
      scale: (k) => 1 + 0.35 * (1 - ease.outExpo(clamp((t - k.w.start) / 0.16))),
    });
    drawWords(x, c, this.rowC, t, { alpha: drop });
    drawWords(x, c, this.rowD, t, {
      alpha: (k) => drop * (k.w === w.after || k.w === w.effects ? 1 - 0.45 * prog(t, w.effects!.start + 0.3, w.effects!.start + 0.6) : 1),
    });
    drawWords(x, c, this.rowE, t, { alpha: 1 - prog(t, this.tWhip, this.T1) });
    this.drawBoxLabels(x, c, t);
    this.notes.draw(x, c, t, this.ga);
    // a title block on the sheet, bottom right, in the opening frames
    this.titleBlock(x, c, t);
    comp.draw(renderer, T.upload(), out);

    // ---- the spark
    const X = this.fx; X.clear();
    const wake = prog(t, tFirst - 0.25, tFirst + 0.1);
    drawSpark(X, t, (tt) => { const p = this.plot.penAt(tt, this.home); return w2s(this.cam(tt), p.x, p.y); }, {
      intensity: 0.55 + 0.45 * wake, scale: 0.9 + 0.5 * pulse(t, w.motion!.start, 0.1) + 0.4 * pulse(t, w.no!.start, 0.1), rate: 30 + 60 * wake,
    });
    const cs = w2s(c, this.cutAt.x, this.cutAt.y);
    burst(X, t, w.no!.start + 0.02, cs[0], cs[1], { n: 70, speed: 700, seed: 41 });
    const sk = w2s(c, this.strike.x1, this.strike.y);
    burst(X, t, w.effects!.start + 0.36, sk[0], sk[1], { n: 26, speed: 380, seed: 43, intensity: 0.8 });
    X.render(renderer, out);

    // ---- post: the crop marks hold until the slam, then fly out
    const slamM = pulse(t, w.motion!.start, 0.08), slamG = pulse(t, w.graphics!.start, 0.07), cut = pulse(t, w.no!.start, 0.08);
    const whip = prog(t, this.tWhip, this.T1, ease.inCubic);
    return {
      frame: 1 - prog(t, w.motion!.start + 0.02, w.motion!.start + 0.4, ease.inOutCubic),
      zoom: 1 + 0.018 * slamM + 0.01 * slamG + 0.014 * cut,
      shake: [7 * slamM * noise1(t * 50, 1) + 5 * cut * noise1(t * 47, 3), 7 * slamM * noise1(t * 53, 2) + 5 * cut * noise1(t * 43, 4)],
      flash: 0.012 * slamM + 0.008 * cut,
      bloom: 0.65, bloomThreshold: 0.85, vignette: 0.42, ca: 1.0 + 3 * whip,
    };
  }

  drawBoxLabels(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const tD = this.L0.end + 0.05;
    const DY = 1420;
    const lab = (s: string, cx: number, t0: number) => {
      const k = prog(t, t0, t0 + 0.2);
      if (k <= 0) return;
      const a = this.ga('diag', t) * k;
      setWorld(x, c, cx, DY + 18, 0.5);
      x.font = font(F.archivo(100, 700), 100);
      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      x.fillStyle = rgba('bone', a);
      x.fillText(s, 0, 0);
      x.setTransform(1, 0, 0, 1, 0, 0);
    };
    lab('Claude', 560, tD + 0.25);
    lab('After Effects', 1360, tD + 0.62);
    x.textAlign = 'left';
  }

  titleBlock(x: CanvasRenderingContext2D, c: Cam, t: number) {
    const a = 1 - prog(t, this.w.motion!.start - 0.2, this.w.motion!.start + 0.1);
    if (a <= 0) return;
    const bx = W - 600, by = H - 150;
    setWorld(x, c, bx, by, 1);
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

