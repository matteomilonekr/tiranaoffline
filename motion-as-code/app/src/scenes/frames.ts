// PLATE 6 `frames` — "Poi viene renderizzata fotogramma per fotogramma, e trasformata in un video."
// A film strip slides in, its frames are the plates of this very video (public/plates/<id>.jpg, made by
// `bun scripts/render.ts plates`; abstract stand-ins if they are missing). On "fotogramma per fotogramma"
// the strip advances in hard steps, one frame per beat of the voice, the counter ticking; on "trasformata"
// it runs, blurs and folds into a single player: motion-as-code.mp4, 1920×1080, 60 fps, a tick.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog, pulse, TAU } from '../engine/util';
import { Paper, Plot, camAt, K, w2s, setWorld, layWords, drawWords, drawSpark, lineOf, phraseOf, pt, type Cam, type CamKey, type KWord } from './_vo';

const IDS = ['hook', 'model', 'prompt', 'crazy', 'code', 'frames', 'pipeline', 'edits', 'verdict'];
const FW = 400, FH = 225, GAP = 46, SY = 470; // frame size, gap, strip centre (world px)
const PLW = 960; // the player's width

export default class Frames extends Scene {
  paper = new Paper(24, 120);
  plot = new Plot();
  lines = new LineBatch(20000, { blend: 'add' });
  fx = new LineBatch(8000, { blend: 'add' });
  text = new Layer2D();
  cams: CamKey[] = [];
  L!: Line;
  row: KWord[] = [];
  w: Record<string, Word> = {};
  imgs: (HTMLImageElement | null)[] = [];
  steps: number[] = [];
  T0 = 0; T1 = 0; tRun = 0; tFold = 0; tDone = 0;
  total = 0;

  override async init() {
    const ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L = lineOf(ly, 'Poi viene renderizzata');
    const w = this.w;
    w.render = phraseOf(ly, 'renderizzata', { line: this.L })[0]!;
    const ff = phraseOf(ly, 'fotogramma per fotogramma', { line: this.L });
    w.f1 = ff[0]!; w.f2 = ff[2]!;
    w.trasformata = phraseOf(ly, 'trasformata', { line: this.L })[0]!;
    w.video = phraseOf(ly, 'video', { line: this.L })[0]!;
    this.row = layWords(this.L.words, W / 2, 175, 56, F.archivo(100, 600), { align: 'center', ant: 0.25, maxW: 1700 });
    // frame-by-frame: hard steps on the voice's syllables between the two "fotogramma"s
    const syl = (this.ctx.audio.onsets['syllable'] ?? []).map(([t]) => t).filter((t) => t >= w.f1!.start - 0.02 && t <= w.f2!.end);
    this.steps = syl.length >= 4 ? syl : Array.from({ length: 8 }, (_, i) => lerp(w.f1!.start, w.f2!.end - 0.1, i / 7));
    this.tRun = w.trasformata!.start;
    this.tFold = lerp(w.trasformata!.start, w.video!.start, 0.65);
    this.tDone = w.video!.start + 0.25;
    this.total = Math.round(this.ctx.audio.duration * 60);
    // thumbnails of the plates (optional)
    this.imgs = await Promise.all(IDS.map(async (id) => {
      try {
        const r = await fetch(`plates/${id}.jpg`, { method: 'HEAD' });
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('image')) return null;
        const im = new Image();
        im.src = `plates/${id}.jpg`;
        await im.decode();
        return im;
      } catch { return null; }
    }));
    // the tick, drawn by the pen at the end
    const lx = W / 2 - PLW / 2 + 232, ly2 = SY + 60 + (PLW * 9) / 32 + 50;
    this.plot.add([pt(lx, ly2 - 4), pt(lx + 12, ly2 + 8), pt(lx + 34, ly2 - 20)], this.tDone + 0.1, this.tDone + 0.3, { pen: true, ez: ease.inOutQuad, width: 3.5, ink: 'signal' });
    this.plot.wait(pt(W + 300, SY), this.T0, 0.01);
    this.cams = [
      K(this.T0, W / 2, H / 2 + 30, 1.06, 0.0),
      K(this.steps[0]! - 0.1, W / 2, H / 2 + 20, 1.1, -0.01, ease.inOutQuad),
      K(this.tRun, W / 2, H / 2 + 30, 1.13, 0.008, ease.inOutQuad),
      K(this.tDone, W / 2, H / 2 + 60, 0.96, 0.0, ease.inOutCubic),
      K(this.T1, W / 2, H / 2 + 60, 0.93, 0.0, ease.linear),
    ];
  }

  /** How far the strip has travelled (in frames) at t: slide in, steps, then a run that accelerates. */
  travel(t: number) {
    let x = -1.6 + 1.6 * ease.outCubic(prog(t, this.T0, this.steps[0]! - 0.05));
    for (const s of this.steps) x += ease.outExpo(clamp((t - s) / 0.09));
    if (t > this.tRun) { const u = t - this.tRun; x += u * u * 26; }
    return x;
  }
  /** 0 = a strip, 1 = folded into the player. */
  fold(t: number) { return ease.inOutCubic(prog(t, this.tFold, this.tDone)); }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = camAt(this.cams, t);
    this.paper.render(renderer, out, c, { alpha: 0.4 });
    const tr = this.travel(t), fk = this.fold(t);
    const speed = (this.travel(t + 0.01) - tr) / 0.01;

    // ---- the strip edges and sprockets (lines)
    const L = this.lines; L.clear();
    this.plot.draw(L, t, c);
    L.render(renderer, out);

    // ---- frames and type
    const T = this.text; T.clear();
    const x = T.ctx;
    this.drawStrip(x, c, t, tr, fk, speed);
    this.drawPlayer(x, c, t, fk);
    drawWords(x, c, this.row, t, {});
    this.drawCounter(x, c, t, tr);
    comp.draw(renderer, T.upload(), out);

    const X = this.fx; X.clear();
    drawSpark(X, t, (tt) => { const p = this.plot.penAt(tt); return w2s(camAt(this.cams, tt), p.x, p.y); }, { intensity: prog(t, this.tDone - 0.1, this.tDone + 0.1), scale: 1 });
    X.render(renderer, out);

    let step = 0;
    for (const s of this.steps) step = Math.max(step, pulse(t, s, 0.05));
    return {
      zoom: 1 + 0.008 * step, bloom: 0.62, bloomThreshold: 0.86, vignette: 0.42,
      ca: 1 + Math.min(4, speed * 0.08) * (1 - this.fold(t)),
      shake: [2 * step * noise1(t * 60, 1), 0],
    };
  }

  drawStrip(x: CanvasRenderingContext2D, c: Cam, t: number, tr: number, fk: number, speed: number) {
    if (fk >= 1) return;
    const a = 1 - fk;
    const pitch = FW + GAP;
    const cy = SY;
    const blur = clamp(speed / 14);
    // film base: a dark band with sprocket holes
    const x0 = -pitch * 2, x1 = W + pitch * 2;
    setWorld(x, c, 0, 0, 1);
    x.fillStyle = rgba('ink2', 0.95 * a);
    x.fillRect(x0, cy - FH / 2 - 52, x1 - x0, FH + 104);
    x.fillStyle = rgba('bone', 0.12 * a);
    const off = ((tr * pitch) % 40 + 40) % 40;
    for (let sx = x0 - off; sx < x1; sx += 40) {
      x.fillRect(sx, cy - FH / 2 - 38, 20, 14);
      x.fillRect(sx, cy + FH / 2 + 24, 20, 14);
    }
    // the frames
    const first = Math.floor(tr) - 3, last = Math.floor(tr) + 6;
    for (let n = first; n <= last; n++) {
      if (n < 0) continue;
      const fx = W / 2 - FW / 2 + (n - tr) * pitch;
      const foldX = lerp(fx, W / 2 - FW / 2, fk);
      const fy = cy - FH / 2;
      const im = this.imgs[n % IDS.length] ?? null;
      setWorld(x, c, foldX, fy, 1);
      x.globalAlpha = a;
      if (im) x.drawImage(im, 0, 0, FW, FH);
      else this.standIn(x, n);
      // motion smear at speed: a few offset copies
      if (blur > 0.05 && im) {
        x.globalAlpha = 0.25 * blur * a;
        for (let k = 1; k <= 3; k++) x.drawImage(im, k * 26 * blur, 0, FW, FH);
      }
      x.globalAlpha = 1;
      x.strokeStyle = rgba('bone', 0.5 * a);
      x.lineWidth = 1.2;
      x.strokeRect(0, 0, FW, FH);
      x.font = font(F.mono(500), 15);
      x.fillStyle = rgba(n === Math.round(tr) ? 'signal' : 'ash', 0.9 * a);
      x.fillText(String(n + 1).padStart(4, '0'), 4, FH + 22);
      // a flash on a frame just stepped in
      const st = this.steps.find((s) => Math.round(this.travel(s + 0.2)) === n);
      if (st !== undefined) {
        const fl = pulse(t, st, 0.08);
        if (fl > 0.01) { x.fillStyle = rgba('bone', 0.35 * fl * a); x.fillRect(0, 0, FW, FH); }
      }
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** A stand-in for a plate thumbnail: a mini sheet with a few marks. */
  standIn(x: CanvasRenderingContext2D, n: number) {
    x.fillStyle = rgba('ink', 1);
    x.fillRect(0, 0, FW, FH);
    x.strokeStyle = rgba('bone', 0.08);
    x.lineWidth = 1;
    for (let gx = 0; gx <= FW; gx += 20) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, FH); x.stroke(); }
    for (let gy = 0; gy <= FH; gy += 20) { x.beginPath(); x.moveTo(0, gy); x.lineTo(FW, gy); x.stroke(); }
    x.font = font(F.archivo(125, 900), 40);
    x.fillStyle = rgba('bone', 0.9);
    x.fillText(IDS[n % IDS.length]!.toUpperCase(), 24, FH / 2 + 14);
    x.fillStyle = rgba('signal', 1);
    x.beginPath(); x.arc(40 + hash(n, 1) * (FW - 80), 40 + hash(n, 2) * 40, 5, 0, TAU); x.fill();
  }

  /** The player the strip folds into. */
  drawPlayer(x: CanvasRenderingContext2D, c: Cam, t: number, fk: number) {
    if (fk <= 0) return;
    const pw = lerp(FW, PLW, fk), ph = pw * 9 / 16;
    const px = W / 2 - pw / 2, py = SY + 60 - ph / 2;
    setWorld(x, c, px, py, 1);
    const im = this.imgs[0];
    x.globalAlpha = fk;
    if (im) x.drawImage(im, 0, 0, pw, ph); else { x.fillStyle = rgba('ink', 1); x.fillRect(0, 0, pw, ph); }
    x.globalAlpha = 1;
    x.fillStyle = rgba('ink', 0.35 * fk);
    x.fillRect(0, 0, pw, ph);
    x.strokeStyle = rgba('bone', 0.7 * fk);
    x.lineWidth = 1.5;
    x.strokeRect(0, 0, pw, ph);
    // play button
    const k = prog(t, this.tDone - 0.15, this.tDone + 0.1);
    x.fillStyle = rgba('bone', 0.95 * k);
    x.beginPath(); x.moveTo(pw / 2 - 30, ph / 2 - 40); x.lineTo(pw / 2 + 44, ph / 2); x.lineTo(pw / 2 - 30, ph / 2 + 40); x.closePath(); x.fill();
    // scrub bar
    x.fillStyle = rgba('bone', 0.25 * fk);
    x.fillRect(0, ph + 18, pw, 3);
    x.fillStyle = rgba('signal', fk);
    x.fillRect(0, ph + 17, pw * prog(t, this.tDone, this.T1 + 2), 5);
    x.font = font(F.mono(500), 18);
    x.fillStyle = rgba('bone', 0.9 * k);
    x.fillText('motion-as-code.mp4', 0, ph + 56);
    x.textAlign = 'right';
    x.fillStyle = rgba('ash', 0.9 * k);
    x.fillText('1920 × 1080 · 60 fps · H.264', pw, ph + 56);
    x.textAlign = 'left';
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawCounter(x: CanvasRenderingContext2D, c: Cam, t: number, tr: number) {
    const a = prog(t, this.w.render!.start, this.w.render!.start + 0.2) * (1 - this.fold(t));
    if (a <= 0) return;
    const n = Math.max(1, Math.min(this.total, Math.round(1 + Math.max(0, tr) * (t > this.tRun ? 1 + (t - this.tRun) * 260 : 1))));
    setWorld(x, c, W / 2 - FW / 2 - 400, SY + FH / 2 + 120, 1);
    x.font = font(F.mono(500), 22);
    x.fillStyle = rgba('bone', 0.9 * a);
    x.fillText('$ bun run render', 0, 0);
    x.font = font(F.mono(400), 20);
    x.fillStyle = rgba('signal', a);
    x.fillText(`fotogramma ${String(n).padStart(4, '0')} / ${this.total}`, 0, 36);
    x.fillStyle = rgba('ash', 0.85 * a);
    x.fillText('chrome headless → frame RGB → ffmpeg (libx264)', 0, 68);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
