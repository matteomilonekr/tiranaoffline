// The whole of `showreel`, one plate: the kit's answer to the prompt the Opus 5.5 list copies most ("a 15-second
// showreel that shows what an incredible motion designer you are"), built only from the blocks in app/src/fx and
// cut on the 120 bpm grid of the music bed. Ten bars, nine shots, each showing one block, joined by eight
// different transitions. The numbers on screen are the list's own (analysis/opus55.py and its analysis).
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT, W, H } from '@kit/engine/gl';
import { F, font, layout } from '@kit/engine/type';
import { clamp, TAU } from '@kit/engine/util';
import { E, tw, spring, Grid } from '@kit/fx';
import { shots } from '@kit/fx/beat';
import { reveal, scramble, typed, odometer } from '@kit/fx/text';
import { glyphs, drawOn, glint, svg, circle, poly, star, blob, morph, fillShape, type Shape } from '@kit/fx/path';
import { boxAt, colorAt, drawBox, swap, type Box } from '@kit/fx/shared';
import { track, fit, apply, type Cam } from '@kit/fx/camera';
import { transition, type Kind } from '@kit/fx/transition';
import { LIGHT, DARK, themed, cursor, toggle, slider, tabs, toast, palette, windowFrame, phone, rr, type Theme } from '@kit/fx/ui';
import { bars } from '@kit/fx/chart';
import { swarm, textTargets, burst, dust } from '@kit/fx/particles';
import { ShaderBg } from '@kit/fx/shader';

const INK = '#0b0b0f', PAPER = '#f3f1ec', HOT = '#ff5a36', BLUE = '#5b7cff', SUN = '#ffd23f', MINT = '#3ddc97';
const G = new Grid(120);
// the shots, in bars, and the transition that brings each one in
const PLAN: [string, number][] = [['open', 1], ['draw', 1], ['morph', 1], ['ui', 2], ['chart', 1], ['zoom', 1], ['swarm', 1], ['palette', 1], ['outro', 1]];
const INTO: Record<string, Kind> = { draw: 'slices', morph: 'iris', ui: 'wipe', chart: 'push', zoom: 'tear', swarm: 'zoom', palette: 'letters', outro: 'flash' };
/** Shots drawn over a GLSL ground (their canvas is transparent): they only come in through whole-frame transitions. */
const GL: Record<string, 'aurora' | 'mesh'> = { swarm: 'aurora', outro: 'mesh' };
const SHOT_SCALE: Record<string, number> = { ui: 1.12, palette: 1.22 };
const TR_IN = 0.16, TR_OUT = 0.3; // a transition runs from a cut minus TR_IN to the cut plus TR_OUT

const BLOCKS = ['timeline e stagger', 'griglia del beat', 'testo cinetico', 'tracciati e morph', 'forma condivisa', 'camera 2.5D', 'transizioni a maschera', 'interfacce e cursore', 'grafici', 'particelle', 'sfondi GLSL'];

export default class Showreel extends Scene {
  layer = new Layer2D();
  plan = shots(G, PLAN);
  aurora!: ShaderBg;
  mesh!: ShaderBg;
  word!: Shape;
  underline!: Shape;
  morphs!: ReturnType<typeof morph>[];
  shapes!: Shape[];
  sw!: ReturnType<typeof swarm>;
  th!: Theme;
  thD!: Theme;

  override init() {
    this.aurora = new ShaderBg('aurora', ['#04050a', '#0c1424', MINT, BLUE], { speed: 0.5, W, H });
    this.mesh = new ShaderBg('mesh', [HOT, BLUE, SUN, '#1a1033'], { speed: 0.35, W, H });
    const fam = F.archivo(125, 900), size = 190, w = layout('codice', fam, size).width;
    this.word = glyphs('codice', fam, size, W / 2 - w / 2, 1000);
    this.underline = svg('M0 0 C 150 -34, 330 26, 520 -6', { ox: W / 2 - 260, oy: 1090 });
    this.shapes = [circle(540, 900, 230), poly(540, 900, 300, 4, Math.PI / 4), star(540, 900, 310, 140, 5), blob(540, 900, 250, 0, { seed: 4 })];
    this.morphs = [0, 1, 2].map((i) => morph(this.shapes[i]!, this.shapes[i + 1]!, 180));
    const s0 = this.plan.list.find((s) => s.name === 'swarm')!;
    this.sw = swarm(textTargets('11', F.archivo(125, 900), 560, 540, 860, 10, 3), W, H, s0.t0 - 0.1, { dur: 0.75, spread: 0.3, start: 'scatter', tOut: s0.t0 + 1.5, explode: true, seed: 5 });
    this.th = themed(LIGHT);
    this.thD = themed(DARK);
  }

  /** Draws shot `name` at t (its local time is t - its start). */
  shot(x: CanvasRenderingContext2D, name: string, t: number) {
    const s = this.plan.list.find((p) => p.name === name)!;
    // the interface shots are drawn a little larger round the centre, to read on a phone
    const k = SHOT_SCALE[name] ?? 1;
    x.save();
    if (k !== 1) { x.translate(W / 2, H / 2); x.scale(k, k); x.translate(-W / 2, -H / 2); }
    (this as unknown as Record<string, (x: CanvasRenderingContext2D, lt: number, t: number) => void>)[name]!.call(this, x, t - s.t0, t);
    x.restore();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const L = this.layer;
    L.clear();
    const x = L.ctx;
    const cur = this.plan.at(t), list = this.plan.list;
    // inside a transition? (from just before a cut to just after it)
    const next = list[cur.i + 1], prev = list[cur.i - 1];
    let A: string | null = null, B: string | null = null, u = 0;
    if (next && t >= next.t0 - TR_IN) { A = cur.name; B = next.name; u = (t - (next.t0 - TR_IN)) / (TR_IN + TR_OUT); }
    else if (prev && t < cur.t0 + TR_OUT) { A = prev.name; B = cur.name; u = (t - (cur.t0 - TR_IN)) / (TR_IN + TR_OUT); }
    // the GLSL ground, when the shot (or either side of a transition) is drawn over one
    // (a GL shot comes in only through a whole-frame transition, so its ground starts at the transition's middle)
    const gl = B && GL[B] && u >= 0.5 ? GL[B] : A ? GL[A] : GL[cur.name];
    clearRT(renderer, out);
    if (gl === 'aurora') this.aurora.render(renderer, out, t);
    if (gl === 'mesh') this.mesh.render(renderer, out, t);
    if (A && B) transition(x, INTO[B]!, clamp(u), () => this.shot(x, A!, t), () => this.shot(x, B!, t), { W, H, angle: 0.35, edge: 6, color: B === 'outro' ? '#ffffff' : HOT, text: 'FX', family: F.archivo(125, 900), size: 520, n: 8 });
    else this.shot(x, cur.name, t);
    // the loop: the last half second goes to black, as the first frame is
    const end = list.at(-1)!.t1;
    if (t > end - 0.5) { x.fillStyle = `rgba(11,11,15,${E('power2.in')(clamp((t - end + 0.5) / 0.45)).toFixed(3)})`; x.fillRect(0, 0, W, H); }
    comp.draw(renderer, L.upload(), out);
    const dark = !['morph', 'ui', 'zoom', 'palette'].includes(cur.name);
    return { bloom: dark ? 0.3 : 0.08, bloomThreshold: 0.75, halation: 0, ca: 0.0006 * G.pulse(t, 1, 0.05), grain: 0.035, vignette: dark ? 0.25 : 0.08, hud: 0 };
  }

  // ---------------------------------------------------------------- the shots (lt: seconds into the shot)
  open(x: CanvasRenderingContext2D, lt: number, t: number) {
    x.fillStyle = INK; x.fillRect(0, 0, W, H);
    const fam = F.archivo(125, 900);
    reveal(x, t, 0.0, 'MOTION', W / 2, 900, 158, fam, { mode: 'rise', from: 'center', each: 0.045, dur: 0.55, color: PAPER });
    const s = scramble('AS CODE', t, 1.0, 0.45, { rate: 30 });
    x.font = font(F.mono(500), 70); x.textAlign = 'center'; x.fillStyle = HOT; x.fillText(s, W / 2, 1020);
    // a rule that grows a step on each beat
    const k = Math.min(4, Math.floor(lt / G.beat) + 1), pulse = G.pulse(t, 1, 0.06);
    x.fillStyle = PAPER; x.globalAlpha = 0.85;
    for (let i = 0; i < k; i++) x.fillRect(W / 2 - 230 + i * 120, 1090, 100, 6 + 6 * (i === k - 1 ? pulse : 0));
    x.globalAlpha = 1;
  }

  draw(x: CanvasRenderingContext2D, lt: number) {
    x.fillStyle = '#121318'; x.fillRect(0, 0, W, H);
    // never empty after the cut (qc.py): the caption is already there and the pen starts during the transition
    reveal(x, lt, -0.3, 'disegnata, non incollata', W / 2, 640, 44, F.instrument(true), { mode: 'blur', by: 'word', each: 0.04, color: '#c9c7c0' });
    const u = tw(lt, -0.15, 1.2, 'power1.inOut');
    const head = drawOn(x, this.word, u, { order: 'sequence', color: PAPER, width: 5, fill: HOT, fillFrom: 0.8 });
    if (head && u < 1) { x.beginPath(); x.arc(head.x, head.y, 9, 0, TAU); x.fillStyle = SUN; x.fill(); }
    glint(x, this.word, tw(lt, 1.15, 0.6, 'power1.inOut'), { color: 'rgba(255,240,200,0.9)' });
    drawOn(x, this.underline, tw(lt, 1.0, 0.45, 'power3.out'), { color: SUN, width: 9 });
  }

  morph(x: CanvasRenderingContext2D, lt: number) {
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    const cols = [HOT, BLUE, SUN, INK];
    // (lt is negative while a transition brings this shot in, before its cut)
    const k = clamp(Math.floor(lt / G.beat), 0, 3);
    const u = k === 0 ? 0 : E('expo.inOut')(clamp((lt - k * G.beat) / 0.32));
    let shape: Shape;
    if (k === 0) shape = this.shapes[0]!;
    else shape = this.morphs[k - 1]!.at(u);
    if (k === 3 && u >= 1) shape = blob(540, 900, 250, lt, { seed: 4 });
    const col = colorAt(lt, [[0, cols[0]!], [G.beat, cols[1]!], [2 * G.beat, cols[2]!], [3 * G.beat, cols[3]!]], 0.3);
    x.save(); x.translate(540, 900); x.rotate(0.15 * Math.sin(lt * 2)); x.translate(-540, -900);
    fillShape(x, shape, col);
    x.restore();
    reveal(x, lt, 0.1, 'una forma, quattro pose', W / 2, 1320, 52, F.poppins(600), { mode: 'rise', by: 'word', each: 0.07, color: INK });
    for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(W / 2 - 75 + i * 50, 1400, 10, 0, TAU); x.fillStyle = i <= k ? cols[i]! : 'rgba(0,0,0,0.12)'; x.fill(); }
  }

  ui(x: CanvasRenderingContext2D, lt: number) {
    const th = this.th, b = G.beat;
    x.fillStyle = '#e8ecf3'; x.fillRect(0, 0, W, H);
    const pill: Box = { x: 340, y: 860, w: 400, h: 110, r: 55 };
    const cardB: Box = { x: 140, y: 640, w: 800, h: 520, r: 40 };
    const tall: Box = { x: 210, y: 380, w: 660, h: 1080, r: 64 };
    const box = boxAt(lt, [[0, pill], [1.2 * b, cardB], [4 * b, tall]], { settle: 0.55, overshoot: 0.015 });
    const fill = colorAt(lt, [[0, HOT], [1.2 * b, '#ffffff'], [4 * b, '#17171c']], 0.35);
    drawBox(x, box, fill, (bx) => {
      const cx = bx.x + bx.w / 2;
      const pillC = () => { x.font = font(F.poppins(600), 44); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff'; x.fillText('Inizia', cx, bx.y + bx.h / 2); };
      const cardC = () => {
        x.font = font(F.poppins(600), 46); x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = th.ink; x.fillText('Notifiche', bx.x + 60, bx.y + 110);
        x.font = font(F.poppins(500), 30); x.fillStyle = th.muted; x.fillText('Ti avviso quando il render finisce', bx.x + 60, bx.y + 170);
        toggle(x, bx.x + bx.w - 120, bx.y + 110, spring(lt, 3 * b, { settle: 0.35, overshoot: 0.02 }), th, 1.3);
        x.fillStyle = th.line; x.fillRect(bx.x + 60, bx.y + 250, bx.w - 120, 2);
        x.font = font(F.poppins(500), 30); x.fillStyle = th.ink; x.fillText('Qualità', bx.x + 60, bx.y + 320);
        slider(x, bx.x + 60, bx.y + 400, bx.w - 120, 0.35 + 0.4 * tw(lt, 3.2 * b, 0.6, 'power2.inOut'), th);
      };
      const tallC = () => {
        const d = this.thD;
        x.font = font(F.poppins(600), 52); x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = d.ink; x.fillText('Render', bx.x + 56, bx.y + 120);
        tabs(x, lt, { x: bx.x + 50, y: bx.y + 190, w: bx.w - 100, h: 84 }, ['Oggi', 'Settimana', 'Mese'], [[0, 0], [5 * b, 1], [6 * b, 2]], d);
        for (let i = 0; i < 4; i++) {
          const y = bx.y + 340 + i * 150, e = tw(lt, 4.4 * b + i * 0.08, 0.5, 'expo.out');
          x.save(); x.globalAlpha *= e; x.translate(0, (1 - e) * 40);
          rr(x, bx.x + 50, y, bx.w - 100, 120, 26); x.fillStyle = '#222229'; x.fill();
          x.beginPath(); x.arc(bx.x + 110, y + 60, 26, 0, TAU); x.fillStyle = [HOT, BLUE, SUN, MINT][i]!; x.fill();
          x.textAlign = 'left'; x.textBaseline = 'middle';
          x.font = font(F.poppins(600), 32); x.fillStyle = d.ink; x.fillText(['showreel.mp4', 'gem.mp4', 'grill.mp4', 'youtube.mp4'][i]!, bx.x + 160, y + 46);
          x.font = font(F.mono(500), 24); x.fillStyle = d.muted; x.fillText(['20 s · 600 fotogrammi', '28 s · 839 fotogrammi', '66 s · 1973 fotogrammi', '42 s · 1264 fotogrammi'][i]!, bx.x + 160, y + 86);
          x.restore();
        }
      };
      // pill -> card at beat 1, card -> tall at bar 2: the outgoing content leaves before the incoming arrives
      if (lt < 2.5 * b) swap(x, lt, 1.0 * b, 0.4, pillC, cardC);
      else swap(x, lt, 3.9 * b, 0.4, cardC, tallC);
    }, 0.8);
    toast(x, lt, 6.6 * b, 9 * b, W / 2, 1560, 'Render salvato', th);
    // each click lands on a beat (a click shows settle × 0.8 after its key): the pill, the toggle, two tabs
    const k = (beat: number) => beat * b - 0.32;
    cursor(x, lt, [[0, 900, 1500], [k(1), 540, 915, true], [k(3), 820, 750, true], [k(5), 540, 612, true], [k(6), 727, 612, true], [7 * b, 840, 1320]], { size: 40, settle: 0.4 });
  }

  chart(x: CanvasRenderingContext2D, lt: number) {
    x.fillStyle = INK; x.fillRect(0, 0, W, H);
    odometer(x, 317 * E('expo.out')(clamp(lt / 0.9)), 3, W / 2, 470, 190, F.archivo(100, 900), PAPER);
    reveal(x, lt, 0.15, 'prompt di motion graphics nella lista', W / 2, 560, 38, F.poppins(500), { mode: 'fade', by: 'word', each: 0.05, color: '#a9a7a0' });
    bars(x, lt, 0.25, { x: 130, y: 700, w: 820, h: 640 }, [103, 30, 26, 22, 20], { ink: PAPER, paper: INK, muted: '#a9a7a0', grid: 'rgba(255,255,255,0.15)', colors: [HOT, BLUE, SUN, MINT, PAPER], font: F.poppins(500), mono: F.mono(500) }, { labels: ['showreel', 'interfacce', 'molle', 'camera', 'testo'], each: 0.09, dur: 0.8 });
    reveal(x, lt, 0.9, 'quanti li chiedono, circa', W / 2, 1480, 30, F.instrument(true), { mode: 'blur', by: 'word', color: '#8d8b85' });
  }

  zoom(x: CanvasRenderingContext2D, lt: number) {
    const b = G.beat;
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    const win = { x: 140, y: 560, w: 800, h: 800 }, ph = { x: 540 - 137, y: 1000 - 280, w: 274, h: 560 }, chip = { x: 470, y: 975, w: 140, h: 50 };
    const far: Cam = { x: 540, y: 960, zoom: 0.06, rot: 0 };
    // a move lands on each beat: the dot becomes a window, the window a phone, the phone a word
    const cam = track(lt, [[0, far], [0.1, far], [b, fit(win, W, H, 90), 'expo.inOut'], [b + 0.1, fit(win, W, H, 90)], [2 * b, fit(ph, W, H, 160), 'expo.inOut'], [2 * b + 0.1, fit(ph, W, H, 160)], [3 * b, fit(chip, W, H, 120), 'expo.inOut']]);
    // a far grid at half depth, for parallax
    x.save(); apply(x, cam, W, H, 0.5);
    x.strokeStyle = 'rgba(0,0,0,0.06)'; x.lineWidth = 2;
    for (let i = -20; i <= 40; i++) { x.beginPath(); x.moveTo(i * 60, -1200); x.lineTo(i * 60, 3200); x.stroke(); x.beginPath(); x.moveTo(-1200, i * 60); x.lineTo(2400, i * 60); x.stroke(); }
    x.restore();
    x.save(); apply(x, cam, W, H, 1);
    const c = windowFrame(x, win, this.th, { chrome: 'browser', url: 'motion-as-code.local', title: 'Showreel' });
    x.fillStyle = '#eef1f6'; x.fillRect(c.x, c.y, c.w, c.h);
    const s = phone(x, 540, 1000, 560, this.th);
    x.fillStyle = HOT; rr(x, s.x, s.y, s.w, s.h, 40); x.fill();
    rr(x, chip.x, chip.y, chip.w, chip.h, 25); x.fillStyle = '#ffffff'; x.fill();
    x.font = font(F.poppins(600), 22); x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('più vicino', 540, 1000);
    x.restore();
    const lab = ['un punto', 'una finestra', 'un telefono', 'una parola'][clamp(Math.floor(lt / b), 0, 3)]!;
    x.font = font(F.poppins(600), 48); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = INK;
    x.globalAlpha = 1 - G.pulse(lt, 1, 0.05) * 0.5; x.fillText(lab, W / 2, 1640); x.globalAlpha = 1;
  }

  swarm(x: CanvasRenderingContext2D, lt: number, t: number) {
    dust(x, t, W, H, { n: 90, color: '#cfe8ff', speed: 25, seed: 2 });
    this.sw.draw(x, t, { r: 3.2, color: (i) => (i % 7 === 0 ? SUN : i % 3 === 0 ? MINT : '#eaf4ff'), trail: 3, dt: 1 / 60, glow: true });
    reveal(x, lt, 0.55, 'blocchi nuovi', W / 2, 1220, 64, F.poppins(600), { mode: 'rise', by: 'word', each: 0.08, color: '#ffffff', tOut: 1.45 });
    burst(x, t, this.plan.list.find((s) => s.name === 'swarm')!.t0 + 1.5, 540, 760, { n: 60, kind: 'spark', colors: [SUN, MINT, '#ffffff'], speed: 1500, size: 10, seed: 9 });
  }

  palette(x: CanvasRenderingContext2D, lt: number) {
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    reveal(x, lt, 0.05, 'Cerca un blocco', W / 2, 520, 64, F.poppins(600), { mode: 'rise', by: 'word', each: 0.07, color: INK });
    const q = typed('tra', lt, 0.35, 7);
    palette(x, { x: 110, y: 640, w: 860, h: 560 }, q.s, q.s ? BLOCKS : BLOCKS.slice(0, 7), this.th, q.caret);
    toast(x, lt, 1.25, 9, W / 2, 1380, 'transizioni a maschera', this.th);
  }

  outro(x: CanvasRenderingContext2D, lt: number) {
    reveal(x, lt, 0.12, 'Motion as Code', W / 2, 900, 118, F.archivo(100, 900), { mode: 'blur', each: 0.03, dur: 0.6, color: '#ffffff' });
    const s = typed('11 blocchi dalla lista Opus 5.5', lt, 0.55, 40);
    x.font = font(F.mono(500), 36); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = 'rgba(255,255,255,0.92)';
    x.fillText(s.s, W / 2, 1000);
    if (s.caret) { const w = x.measureText(s.s).width; x.fillRect(W / 2 + w / 2 + 6, 970, 18, 38); }
  }
}
