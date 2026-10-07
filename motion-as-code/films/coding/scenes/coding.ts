// The whole of `coding`, one plate: @tessa.fairbrook's "4 plugins" reel, shot for shot, in Italian, on the
// look in _look.ts. The shots cut on the words:
//  hook   "Usa questi 4 plugin": the four icons pop in a 2x2 grid, spin out; a counter runs 36 -> 100x; a
//         pixel creature walks in under "vibe coding"; a warm flash to white;
//  1      the coral star "1 Ponytail"; a terminal (the decision ladder before writing code); a bar chart,
//         "-54%" lines of code, "senza perdere precisione";
//  2      "2 OmniRoute"; a loop of dots; the providers grid; "Cambio modello..." with a carousel of models;
//         an editor whose plan limit runs out and hands over; "~1,6 mld" free tokens a month (on paper);
//  3      "3 Graphify"; a knowledge graph of the code; a query that walks the graph instead of the files;
//  4      the talking head ("E infine c'è Agent Skills"); the table of the 24 skills; the repo card (in the
//         place of the original's portrait: no real person is drawn); the talking head again; the six stages
//         lighting up as they are named; the talking head for "commenta CODING".
// The figures are the plugins' own (checked in October 2026): Ponytail's benchmark (-54% lines of code,
// -22% tokens), OmniRoute's 300+ providers and its "up to 1.6 billion tokens" claim, agent-skills' 24 skills
// and ~102k stars. Check them again before you publish.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT } from '@kit/engine/gl';
import type { Lyrics } from '@kit/engine/lyrics';
import { presenter, Gestures } from '../../plugins/scenes/_stage';
import {
  W, H, F, TAU, INK, CORAL, CORAL_L, clamp, ease, hash, lerp, font, rr, txt, pop, wordAt, page, caption, say,
  starTitle, darkCard, titleBar, critter, arrowDown, star5, starPath, talkSet, talkCaps, type Box, type Said,
} from './_look';

const CUT_LEAD = 0.18;
type Shot = { id: string; t0: number; t1: number };

/** `n` said words from the first `a` at or after `after`. */
function take(ly: Lyrics, a: string, n: number, after = 0): Said[] {
  const w0 = wordAt(ly, a, after);
  return ly.words.slice(w0.gi, w0.gi + n);
}
/** A value that steps through `keys` ([time, value]), easing over `d` s at each step. */
function steps(t: number, keys: [number, number][], d = 0.28) {
  let v = keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [ti, vi] = keys[i]!;
    if (t >= ti) v = lerp(keys[i - 1]![1], vi, ease.inOutCubic(clamp((t - ti) / d)));
    if (t >= ti + d) v = vi;
  }
  return v;
}

const BOX = {
  term: { x: 108, y: 735, w: 864, h: 490 },
  chart: { x: 108, y: 660, w: 864, h: 618 },
  loop: { x: 108, y: 715, w: 864, h: 450 },
  grid: { x: 108, y: 690, w: 864, h: 650 },
  quota: { x: 108, y: 660, w: 864, h: 470 },
  tokens: { x: 108, y: 700, w: 864, h: 540 },
  graph: { x: 108, y: 690, w: 864, h: 640 },
  path: { x: 108, y: 700, w: 864, h: 400 },
  table: { x: 108, y: 700, w: 864, h: 700 },
  stages: { x: 108, y: 660, w: 864, h: 700 },
} satisfies Record<string, Box>;

type Node = { x: number; y: number; c: string; r: number; born: number };

export default class Coding extends Scene {
  layer = new Layer2D();
  ly!: Lyrics;
  w: Record<string, number> = {};
  cuts: number[] = [];
  shots: Shot[] = [];
  gest = new Gestures([]);
  sp: Record<string, Said[]> = {};
  nodes: Node[] = [];
  edges: [number, number][] = [];

  override init() {
    const ly = (this.ly = this.ctx.lyrics);
    const cut = (i: number) => {
      const l = ly.lines[i]!, p = ly.lines[i - 1];
      return Math.max(l.words[0]!.start - CUT_LEAD, p ? Math.min(p.end + 0.02, l.words[0]!.start - 0.02) : 0);
    };
    const c = (this.cuts = ly.lines.map((_, i) => cut(i)));
    const at = (q: string, after = 0) => wordAt(ly, q, after).start;
    const w = this.w;
    // the hook
    w.usa = at('Usa'); w.questi = at('questi'); w.four = at('4'); w.plugin = at('plugin');
    w.se = at('se'); w.molt = at('moltiplicare'); w.cento = at('cento'); w.vibe = at('vibe');
    // Ponytail
    w.ponytail = at('Ponytail'); w.che1 = at('che', c[1]!);
    // OmniRoute
    w.omni = at('OmniRoute'); w.che2 = at('che', c[3]!); w.un = at('un', w.che2);
    w.appena = at('appena'); w.limiti = at('limiti');
    // Graphify
    w.graphify = at('Graphify'); w.che3 = at('che', c[6]!);
    // Agent Skills
    w.infine = at('infine'); w.agent = at('Agent'); w.firmato = at('firmato'); w.centomila = at('centomila');
    w.programmare = at('programmare'); w.senior = at('senior');
    w.fase = at('fase'); w.pian = at('pianificazione'); w.codice2 = at('codice', w.pian); w.test = at('test', w.pian);
    w.epubbl = at('e', w.test); w.quindi = at('Quindi'); w.commenta = at('commenta'); w.coding2 = at('CODING', c[12]!);
    w.emando = at('e', w.coding2); w.link = at('link');

    const S = (id: string, t0: number): Shot => ({ id, t0, t1: 0 });
    const list = [
      S('hook', 0),
      S('p1', c[1]!), S('p1term', w.che1 - 0.1), S('p1chart', c[2]!),
      S('p2', c[3]!), S('p2loop', w.che2 - 0.1), S('p2grid', w.un - 0.1), S('p2switch', c[4]!), S('p2quota', w.appena - 0.14), S('p2tokens', c[5]!),
      S('p3', c[6]!), S('p3graph', w.che3 - 0.1), S('p3path', c[7]!),
      S('talk1', c[8]!), S('p4table', c[9]!), S('p4repo', w.firmato - 0.12), S('talk2', c[10]!), S('p4stages', c[11]!), S('talk3', c[12]!),
    ];
    list.forEach((s, i) => (s.t1 = list[i + 1]?.t0 ?? this.ctx.end));
    this.shots = list;

    this.gest = new Gestures([
      [c[8]! - 0.3, 'idle'], [w.infine, 'shrug'], [w.agent - 0.1, 'presentR'],
      [c[10]! - 0.3, 'idle'], [w.programmare, 'think'], [w.senior - 0.1, 'pointUp'],
      [c[12]! - 0.3, 'idle'], [w.quindi, 'shrug'], [w.commenta - 0.1, 'pointR'], [w.link - 0.1, 'thumb'],
    ]);

    const sp = this.sp;
    sp.hookA = take(ly, 'Usa', 4); sp.hookB = take(ly, 'se', 4); sp.hookC = take(ly, 'il', 4, w.cento);
    sp.p1A = take(ly, 'che', 2, c[1]!); sp.p1B = take(ly, "l'output", 4, c[1]!);
    sp.p1cA = take(ly, 'e', 4, c[2]!); sp.p1cB = take(ly, 'oltre', 7, c[2]!); sp.p1dA = take(ly, 'senza', 2, c[2]!); sp.p1dB = take(ly, 'precisione', 1, c[2]!);
    sp.p2A = take(ly, 'che', 5, c[3]!); sp.p2B = take(ly, 'un', 4, w.che2);
    sp.p2sA = take(ly, 'più', 6, c[4]!); sp.p2sB = take(ly, 'appena', 4, c[4]!);
    sp.p2tA = take(ly, 'e', 6, c[5]!); sp.p2tB = take(ly, '1,6', 7, c[5]!);
    sp.p3A = take(ly, 'che', 6, c[6]!); sp.p3B = take(ly, 'in', 5, c[6]!);
    sp.p3pA = take(ly, 'così', 4, c[7]!); sp.p3pB = take(ly, 'non', 3, c[7]!); sp.p3qA = take(ly, 'a', 4, c[7]!); sp.p3qB = take(ly, 'ancora', 3, c[7]!);
    sp.t1A = take(ly, 'E', 3, c[8]!); sp.t1B = take(ly, 'Agent', 2, c[8]!);
    sp.p4A = take(ly, 'un', 5, c[9]!); sp.p4rA = take(ly, 'firmato', 4, c[9]!); sp.p4rB = take(ly, 'con', 6, w.firmato);
    sp.t2A = take(ly, 'che', 6, c[10]!); sp.t2B = take(ly, 'ingegnere', 2, c[10]!);
    sp.p4sA = take(ly, 'attivando', 6, c[11]!); sp.p4s0 = take(ly, 'per', 3, c[11]!);
    sp.p4s1 = take(ly, 'pianificazione', 1); sp.p4s2 = take(ly, 'codice', 1, w.pian); sp.p4s3 = take(ly, 'test', 1, w.pian); sp.p4s4 = take(ly, 'e', 2, w.test);
    sp.t3A = take(ly, 'Quindi', 3); sp.t3B = take(ly, 'provarli', 2); sp.t3C = take(ly, 'commenta', 1); sp.t3D = take(ly, 'CODING', 1, c[12]!);
    sp.t3E = take(ly, 'e', 3, w.coding2); sp.t3F = take(ly, 'i', 3, w.emando);

    // the knowledge graph: six communities of nodes, each node tied to its two nearest neighbours
    const COMM: [number, number, string][] = [[-190, -50, '#ff6b6b'], [10, -130, '#ffa94d'], [200, -20, '#ffd43b'], [-40, 60, '#69db7c'], [170, 120, '#4dabf7'], [-230, 120, '#b197fc']];
    for (let i = 0; i < 240; i++) {
      const [cx, cy, col] = COMM[i % 6]!;
      const a = hash(i, 11) * TAU, d = Math.sqrt(-2 * Math.log(1 - hash(i, 12) * 0.98)) * 52;
      this.nodes.push({ x: cx + Math.cos(a) * d * 1.3, y: cy + Math.sin(a) * d, c: col, r: 2.5 + 4.5 * hash(i, 13) ** 2, born: hash(i, 14) * 0.7 });
    }
    this.nodes.forEach((n, i) => {
      const near = this.nodes.map((m, j) => [j, (m.x - n.x) ** 2 + (m.y - n.y) ** 2] as [number, number])
        .filter(([j]) => j !== i && (j % 6 === i % 6 || hash(i, j) > 0.995)).sort((a, b) => a[1] - b[1]).slice(0, 2);
      for (const [j] of near) if (j > i) this.edges.push([i, j]);
    });
  }

  shot(t: number): Shot {
    let s = this.shots[0]!;
    for (const x of this.shots) if (t >= x.t0) s = x;
    return s;
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out);
    const L = this.layer;
    L.clear();
    const x = L.ctx;
    const s = this.shot(t);
    const talking = s.id.startsWith('talk');
    if (talking) this.talk(x, t, f, s);
    else {
      const sec = s.id === 'hook' ? 0 : Number(s.id[1]);
      page(x, t, { grid: s.id === 'hook' ? 0.15 : 1, spin: [0, 0.35, -0.3, 0.6, 0.15][sec]! });
      (this as unknown as Record<string, (x: CanvasRenderingContext2D, t: number, s: Shot) => void>)[s.id]!.call(this, x, t, s);
    }
    this.flash(x, t);
    comp.draw(renderer, L.upload(), out);
    return talking
      ? { bloom: 0.18, bloomThreshold: 0.8, halation: 0.15, ca: 0, grain: 0.045, vignette: 0.28, hud: 0 }
      : { bloom: 0.08, bloomThreshold: 0.92, halation: 0, ca: 0, grain: 0.025, vignette: 0.06, hud: 0 };
  }

  /** The hook's way out: a warm flash to white, then the white lifts off the first star. */
  flash(x: CanvasRenderingContext2D, t: number) {
    const c1 = this.cuts[1]!;
    const a = clamp((t - (c1 - 0.3)) / 0.3), b = 1 - clamp((t - c1) / 0.22);
    if (t < c1 && a > 0) {
      x.save();
      x.globalCompositeOperation = 'screen'; x.fillStyle = `rgba(255,190,110,${(0.55 * a).toFixed(3)})`; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over'; x.fillStyle = `rgba(255,252,246,${(ease.inCubic(a) * 0.95).toFixed(3)})`; x.fillRect(0, 0, W, H);
      x.restore();
    } else if (t >= c1 && b > 0) {
      x.fillStyle = `rgba(255,252,246,${(0.95 * ease.inQuad(b)).toFixed(3)})`; x.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- the hook
  hook(x: CanvasRenderingContext2D, t: number) {
    const w = this.w, sp = this.sp;
    const out = clamp((t - w.se) / 0.4);
    // "Usa questi 4 plugin", greying out as the icons spin away
    if (t < w.molt - 0.1) {
      x.save(); x.globalAlpha = 1 - 0.6 * out;
      say(x, t, sp.hookA!, W / 2, 500, { fam: F.poppins(600), size: 60, hot: (s) => s === '4' });
      x.restore();
    }
    const icons = [this.iconPony, this.iconRoute, this.iconGraph, this.iconHex];
    const pos: [number, number][] = [[351, 805], [738, 805], [351, 1120], [738, 1120]];
    const born = [w.usa, w.questi, w.four, w.plugin];
    if (out < 1) icons.forEach((draw, i) => {
      const k = pop(t, born[i]! - 0.08, 0.34, 2.2);
      if (k <= 0) return;
      const [cx, cy] = pos[i]!;
      x.save();
      x.translate(cx, cy);
      x.rotate((1 - clamp(k)) * (i % 2 ? 0.6 : -0.6) + ease.inCubic(out) * 1.6 * (i % 2 ? 1 : -1));
      const sc = k * (1 - 0.75 * ease.inCubic(out)); x.scale(sc, sc);
      x.globalAlpha = 1 - out;
      if (out > 0) x.filter = `blur(${(out * 9).toFixed(2)}px)`;
      draw.call(this, x);
      x.restore();
    });
    // "se vuoi moltiplicare per" ... the counter ... "il tuo vibe coding"
    say(x, t, sp.hookB!.map((q) => ({ w: q.w, start: Math.max(q.start, w.se + 0.34) })), 450, 875, { fam: F.poppins(600), size: 46 });
    if (t > w.molt - 0.15) {
      const u = clamp((t - (w.molt - 0.15)) / Math.max(0.2, w.cento - w.molt + 0.15));
      const n = u >= 1 ? 100 : Math.min(96, 36 + 10 * Math.floor(u * 7));
      const e = ease.outBack(clamp((t - (w.molt - 0.15)) / 0.25), 2);
      x.save();
      x.translate(W / 2, 1000); x.scale(e, e);
      x.font = font(F.poppins(700), 190); x.textAlign = 'left';
      const nw = x.measureText(String(n)).width;
      x.font = font(F.poppins(700), 104);
      const xw = n >= 76 ? x.measureText('x').width + 8 : 0;
      x.font = font(F.poppins(700), 190); x.fillStyle = INK;
      x.fillText(String(n), -(nw + xw) / 2, 66);
      if (xw) { x.font = font(F.poppins(700), 104); x.fillText('x', -(nw + xw) / 2 + nw + 8, 66); }
      x.restore();
    }
    say(x, t, sp.hookC!, 640, 1150, { fam: F.poppins(600), size: 46, hot: (s) => s === 'coding' });
    if (t > w.vibe - 0.2) {
      const u = clamp((t - (w.vibe - 0.2)) / 0.55);
      x.save(); x.translate(lerp(1220, 905, ease.outCubic(u)), 1262 - Math.abs(Math.sin(t * 9)) * 8 * (1 - u * 0.6)); x.rotate(-0.12 + 0.06 * Math.sin(t * 9));
      critter(x, 0, 0, 13, t);
      x.restore();
    }
  }

  // the four icons, drawn here (not the plugins' logos)
  iconPony(x: CanvasRenderingContext2D) {
    x.lineWidth = 7; x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.ellipse(8, 6, 74, 82, 0, 0, TAU); x.fillStyle = '#ffffff'; x.fill(); x.stroke(); // the face
    x.beginPath(); x.moveTo(-70, -10); x.bezierCurveTo(-74, -88, 60, -112, 84, -20); x.bezierCurveTo(40, -60, -20, -64, -70, -10); x.fillStyle = INK; x.fill(); // the hair
    x.beginPath(); x.moveTo(-64, -30); x.bezierCurveTo(-130, -10, -120, 70, -96, 110); x.bezierCurveTo(-88, 60, -100, 20, -60, 0); x.fill(); // the ponytail
    for (const ex of [-18, 40]) { x.beginPath(); x.arc(ex, 6, 20, 0, TAU); x.stroke(); }
    x.beginPath(); x.moveTo(2, 6); x.lineTo(20, 6); x.stroke();
    x.beginPath(); x.arc(12, 44, 18, 0.2, Math.PI - 0.2); x.stroke();
  }
  iconRoute(x: CanvasRenderingContext2D) {
    x.rotate(0.08);
    rr(x, -100, -100, 200, 200, 42); x.fillStyle = '#e0475b'; x.fill();
    x.strokeStyle = '#ffffff'; x.fillStyle = '#ffffff'; x.lineWidth = 9; x.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.5;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 58, Math.sin(a) * 58); x.stroke();
      x.beginPath(); x.arc(Math.cos(a) * 62, Math.sin(a) * 62, 13, 0, TAU); x.fill();
    }
    x.beginPath(); x.arc(0, 0, 20, 0, TAU); x.fill();
  }
  iconGraph(x: CanvasRenderingContext2D) {
    const P: [number, number][] = [[0, -92], [80, -46], [80, 46], [0, 92], [-80, 46], [-80, -46], [0, 0], [30, -20], [-26, 30]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [1, 7], [6, 7], [2, 7], [6, 8], [4, 8], [3, 8], [5, 6], [7, 3]];
    x.strokeStyle = INK; x.lineWidth = 5; x.lineJoin = 'round';
    x.beginPath(); for (const [a, b] of E) { x.moveTo(P[a]![0], P[a]![1]); x.lineTo(P[b]![0], P[b]![1]); } x.stroke();
    x.fillStyle = INK; for (const [px, py] of P) { x.beginPath(); x.arc(px, py, 9, 0, TAU); x.fill(); }
  }
  iconHex(x: CanvasRenderingContext2D) {
    x.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; const px = Math.cos(a) * 100, py = Math.sin(a) * 100; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.closePath(); x.fillStyle = '#0a0a0a'; x.fill();
  }

  // ---------------------------------------------------------------- 1 · Ponytail
  p1(x: CanvasRenderingContext2D, t: number, s: Shot) { starTitle(x, t, s.t0 + 0.02, '1', 'Ponytail', this.w.ponytail - 0.22); }

  p1term(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.term;
    caption(x, t, this.sp.p1A!, this.sp.p1B!, b.y - 98);
    darkCard(x, t, s.t0, b, () => {
      titleBar(x, b, 'claude · ~/negozio');
      const lines: [string, string][] = [
        ["> aggiungi l'export CSV agli ordini", '#ececee'],
        ['  ponytail · prima di scrivere codice:', CORAL_L],
        ['  1  serve davvero?            sì', '#a7acb7'],
        ['  2  esiste già nel progetto?  toCsv()', '#a7acb7'],
        ["  3  c'è nella libreria?       no", '#a7acb7'],
        ['  4  basta una dipendenza?     no', '#a7acb7'],
        ['  -> riuso toCsv(): 6 righe, non 140', '#62d394'],
      ];
      lines.forEach(([str, col], i) => {
        const n = Math.floor(clamp((t - s.t0 - 0.3 - i * 0.2) * 75, 0, str.length));
        if (n > 0) txt(x, str.slice(0, n), b.x + 40, b.y + 118 + i * 48, 24, F.mono(400), col);
      });
      if (Math.floor(t * 2.4) % 2 === 0) { x.fillStyle = '#ececee'; x.fillRect(b.x + 40, b.y + 118 + 7 * 48 - 22, 13, 26); }
    }, { rise: 0, dur: 0.5 });
  }

  p1chart(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.chart, sp = this.sp;
    caption(x, t, sp.p1cA!, sp.p1cB!, b.y - 108);
    caption(x, t, sp.p1dA!, sp.p1dB!, b.y + b.h + 92);
    darkCard(x, t, s.t0, b, () => {
      const cy = b.y + 120;
      const sg = x.createLinearGradient(0, cy - 70, 0, cy + 55);
      sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#878c97');
      x.fillStyle = sg;
      x.font = font(F.poppins(700), 140); x.textAlign = 'center'; x.fillText('54%', W / 2, cy + 50);
      arrowDown(x, W / 2 - 262, cy, 104); x.fill(); arrowDown(x, W / 2 + 262, cy, 104); x.fill();
      txt(x, 'Ogni metrica contro nessuna skill · Claude Code, 12 task', W / 2, b.y + 226, 19, F.poppins(500), '#8b909b', { align: 'center' });
      const leg: [string, string][] = [['senza skill', '#9c9ca6'], ['con Ponytail', '#36c27b']];
      leg.forEach(([l, c], i) => { const lx = W / 2 - 150 + i * 170; x.fillStyle = c; x.fillRect(lx, b.y + 250, 14, 14); txt(x, l, lx + 22, b.y + 263, 17, F.poppins(500), '#c3c6cd'); });
      const base = b.y + b.h - 72, hmax = 230, x0 = b.x + 70, gw = (b.w - 110) / 4;
      x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1.5; x.setLineDash([6, 6]);
      for (let i = 1; i <= 4; i++) { const gy = base - (hmax * i) / 4; x.beginPath(); x.moveTo(x0, gy); x.lineTo(b.x + b.w - 40, gy); x.stroke(); }
      x.setLineDash([]);
      const groups: [string, number][] = [['righe di codice', 46], ['token', 78], ['costo', 80], ['tempo', 73]];
      groups.forEach(([name, v], i) => {
        const gx = x0 + i * gw + gw / 2;
        const g = ease.outCubic(clamp((t - s.t0 - 0.3 - i * 0.12) / 0.7));
        ([[100, '#9c9ca6'], [v, '#36c27b']] as [number, string][]).forEach(([val, col], j) => {
          const bh = (hmax * val * g) / 100, bx = gx - 62 + j * 66;
          rr(x, bx, base - bh, 56, bh, 6); x.fillStyle = col; x.fill();
          if (g > 0.6) txt(x, `${val}%`, bx + 28, base - bh - 12, 17, F.poppins(600), '#d9dbe0', { align: 'center', alpha: (g - 0.6) / 0.4 });
        });
        txt(x, name, gx, base + 34, 18, F.poppins(500), '#9a9ea8', { align: 'center' });
      });
    });
  }

  // ---------------------------------------------------------------- 2 · OmniRoute
  p2(x: CanvasRenderingContext2D, t: number, s: Shot) { starTitle(x, t, s.t0 + 0.02, '2', 'OmniRoute', this.w.omni - 0.22); }

  p2loop(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.loop;
    caption(x, t, this.sp.p2A!, [], b.y - 98);
    darkCard(x, t, s.t0, b, () => this.loop(x, t, b), { rise: 0, dur: 0.5 });
  }
  /** A figure-of-eight of dots with a bright head running round it. */
  loop(x: CanvasRenderingContext2D, t: number, b: Box) {
    titleBar(x, b, 'omniroute · localhost:20128');
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 34, a = 330, N = 150;
    const head = (t * 0.55) % 1;
    for (let i = 0; i < N; i++) {
      const u = i / N, th = u * TAU;
      const d = 1 + Math.sin(th) ** 2;
      const px = cx + (a * Math.cos(th)) / d, py = cy + (a * Math.sin(th) * Math.cos(th)) / d;
      const behind = (head - u + 1) % 1;
      const glow = Math.exp(-behind * 7);
      x.globalAlpha = 0.18 + 0.82 * glow;
      x.fillStyle = `rgb(255,${Math.round(lerp(130, 90, u))},${Math.round(lerp(90, 170, u))})`;
      x.beginPath(); x.arc(px, py, 3 + 4 * glow, 0, TAU); x.fill();
    }
    x.globalAlpha = 1;
  }

  p2grid(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.grid;
    caption(x, t, this.sp.p2A!, this.sp.p2B!, b.y - 108);
    darkCard(x, t, s.t0, b, () => {
      rr(x, W / 2 - 270, b.y + 30, 540, 50, 25); x.strokeStyle = '#e8785e'; x.lineWidth = 2.5; x.stroke();
      x.beginPath(); x.arc(W / 2 - 238, b.y + 55, 6, 0, TAU); x.fillStyle = '#e8785e'; x.fill();
      txt(x, '300+ provider · 90+ modelli gratis', W / 2 + 12, b.y + 63, 22, F.poppins(600), '#ffffff', { align: 'center' });
      ['Un solo endpoint per Claude Code, Codex, Cursor e gli altri: OmniRoute manda',
        'ogni richiesta al modello giusto e, quando un provider finisce la quota,',
        'passa da solo al successivo. Gratis, a pagamento o in locale.'].forEach((l, i) =>
        txt(x, l, b.x + 44, b.y + 122 + i * 27, 17, F.poppins(500), '#7f8490'));
      txt(x, 'I grandi modelli, un solo indirizzo', W / 2, b.y + 236, 22, F.poppins(600), '#ffffff', { align: 'center' });
      const names = ['OpenRouter', 'Groq', 'Gemini', 'Mistral', 'Qwen', 'DeepSeek', 'Kimi', 'GLM', 'Cerebras', 'Ollama', 'Together', 'NVIDIA', 'Cohere', 'Fireworks', 'SambaNova', 'Hugging Face', 'Cloudflare', 'LM Studio'];
      const cols = ['#ff7a59', '#f5c542', '#8f7cff', '#ff9f43', '#7c5cff', '#4d8dff', '#e8e8e8', '#5ad1a0', '#ff6b9a', '#cfcfcf', '#55c7ff', '#7ed957', '#d58cff', '#ff8a3d', '#ffb347', '#ffd23f', '#ff9a5a', '#9ad0ff'];
      const tw = 120, th = 104, gx0 = W / 2 - (6 * tw + 5 * 12) / 2;
      names.forEach((n, i) => {
        const k = clamp((t - s.t0 - 0.35 - i * 0.03) / 0.25);
        if (k <= 0) return;
        const tx = gx0 + (i % 6) * (tw + 12), ty = b.y + 268 + Math.floor(i / 6) * (th + 12);
        x.save(); x.globalAlpha *= k; x.translate(tx + tw / 2, ty + th / 2); x.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
        rr(x, -tw / 2, -th / 2, tw, th, 16); x.fillStyle = '#191c24'; x.fill();
        x.fillStyle = cols[i]!; x.strokeStyle = cols[i]!; x.lineWidth = 4;
        const shape = i % 5;
        if (shape === 0) { x.beginPath(); x.arc(0, -14, 16, 0, TAU); x.fill(); }
        else if (shape === 1) { x.beginPath(); x.arc(0, -14, 15, 0, TAU); x.stroke(); }
        else if (shape === 2) { starPath(x, 0, -14, 19); x.fill(); }
        else if (shape === 3) { rr(x, -14, -28, 28, 28, 7); x.fill(); }
        else { x.beginPath(); x.moveTo(0, -32); x.lineTo(16, -2); x.lineTo(-16, -2); x.closePath(); x.fill(); }
        txt(x, n, 0, 34, 15, F.poppins(500), '#c9ccd3', { align: 'center' });
        x.restore();
      });
      txt(x, '…e molti altri, tutti dalla dashboard di OmniRoute', W / 2, b.y + b.h - 26, 16, F.poppins(500), '#6f7480', { align: 'center' });
    });
  }

  p2switch(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const sp = this.sp;
    txt(x, 'CLAUDE CODE  ·  CAMBIO MODELLO', W / 2, 560, 18, F.poppins(600), '#a9a9a9', { align: 'center', track: 4 });
    x.save(); x.font = font(F.poppins(600), 48);
    const base = 'Cambio modello', bw = x.measureText(base).width;
    x.restore();
    txt(x, base + '.'.repeat(1 + (Math.floor((t - s.t0) * 3) % 3)), W / 2 - bw / 2, 628, 48, F.poppins(600), INK);
    this.carousel(x, t, s.t0);
    caption(x, t, sp.p2sA!, sp.p2sB!, 1330);
  }
  /** Four models sliding through a fixed frame, one step every 0.42 s. */
  carousel(x: CanvasRenderingContext2D, t: number, t0: number) {
    const cx = W / 2, cy = 985;
    const u = Math.max(0, t - t0) / 0.42, p = Math.floor(u) + ease.inOutCubic(clamp((u % 1) / 0.68));
    const items: [string, (s: number) => void][] = [
      ['Claude Code', (s) => { rr(x, -s / 2, -s / 2, s, s, s * 0.24); x.fillStyle = '#fbd9ce'; x.fill(); critter(x, 0, 0, s / 13, t, CORAL, false); }],
      ['Gemini', (s) => { rr(x, -s / 2, -s / 2, s, s, s * 0.24); x.fillStyle = '#efeafd'; x.fill(); starPath(x, 0, 0, s * 0.34); x.fillStyle = '#8b6cf2'; x.fill(); }],
      ['GLM-5', (s) => { rr(x, -s / 2, -s / 2, s, s, s * 0.24); x.fillStyle = '#111111'; x.fill(); txt(x, 'Z', 0, s * 0.2, s * 0.56, F.poppins(700), '#ffffff', { align: 'center' }); }],
      ['Kimi', (s) => { rr(x, -s / 2, -s / 2, s, s, s * 0.24); x.fillStyle = '#111111'; x.fill(); txt(x, 'K', 0, s * 0.2, s * 0.56, F.poppins(700), '#ffffff', { align: 'center' }); }],
    ];
    const slots: { slot: number; i: number }[] = [];
    for (let i = 0; i < 4; i++) { let sl = ((i - p) % 4 + 4) % 4; if (sl > 2) sl -= 4; slots.push({ slot: sl, i }); }
    slots.sort((a, b) => Math.abs(b.slot) - Math.abs(a.slot));
    for (const { slot, i } of slots) {
      const d = Math.abs(slot);
      if (d > 1.6) continue;
      const near = clamp(1 - d), px = cx + slot * 330;
      x.save();
      x.globalAlpha = clamp(1.6 - d) * lerp(0.55, 1, near);
      x.translate(px, cy);
      if (near > 0.02) { // the white card under the one in the frame
        x.save(); x.globalAlpha *= near; x.shadowColor = 'rgba(0,0,0,0.12)'; x.shadowBlur = 30; x.shadowOffsetY = 10;
        rr(x, -140, -180, 280, 360, 28); x.fillStyle = '#ffffff'; x.fill(); x.restore();
      }
      x.save(); x.translate(0, -20); items[i]![1](lerp(76, 124, near)); x.restore();
      txt(x, items[i]![0], 0, lerp(52, 92, near), lerp(15, 22, near), F.poppins(600), mixGrey(near), { align: 'center' });
      x.restore();
    }
    rr(x, cx - 165, cy - 205, 330, 410, 30); x.strokeStyle = '#eab1a3'; x.lineWidth = 3; x.stroke();
  }

  p2quota(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.quota, sp = this.sp;
    caption(x, t, sp.p2sA!, sp.p2sB!, 1330);
    darkCard(x, t, s.t0, b, () => {
      x.fillStyle = '#1c1d22'; x.fillRect(b.x, b.y, b.w, b.h);
      titleBar(x, b, 'checkout.ts');
      const v = steps(t, [[s.t0, 81], [s.t0 + 0.35, 68], [s.t0 + 0.7, 34], [this.w.limiti, 0]], 0.22);
      txt(x, 'Claude Code · limite del piano', b.x + 40, b.y + 112, 20, F.poppins(500), '#9da2ad');
      txt(x, `${Math.round(v)}%`, b.x + b.w - 40, b.y + 118, 46, F.poppins(700), '#ff6a55', { align: 'right' });
      rr(x, b.x + 40, b.y + 140, b.w - 80, 10, 5); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fill();
      if (v > 0.5) { rr(x, b.x + 40, b.y + 140, ((b.w - 80) * v) / 100, 10, 5); x.fillStyle = '#ff6a55'; x.fill(); }
      const code: [string, string][] = [
        ["import { carrello } from './stato'", '#c792ea'], ['', ''], ['export async function checkout(id) {', '#82aaff'],
        ['  const ordine = await crea(id)', '#d6deeb'], ['  return paga(ordine.totale)', '#d6deeb'], ['}', '#82aaff'],
      ];
      code.forEach(([str, col], i) => {
        const n = Math.floor(clamp((t - s.t0 - 0.2 - i * 0.12) * 60, 0, str.length));
        if (n > 0) txt(x, str.slice(0, n), b.x + 40, b.y + 205 + i * 36, 21, F.mono(400), col);
      });
      x.save(); x.translate(b.x + b.w - 70, b.y + b.h - 50); critter(x, 0, 0, 4.5, t, CORAL, false); x.restore();
      // the limit runs out: OmniRoute hands the request over
      const k = ease.outBack(clamp((t - this.w.limiti - 0.15) / 0.35), 1.6);
      if (k > 0) {
        x.save(); x.translate(W / 2, b.y + b.h - 58); x.scale(k, k);
        rr(x, -250, -30, 500, 60, 30); x.fillStyle = '#2a2c33'; x.fill(); x.strokeStyle = '#8b6cf2'; x.lineWidth = 2; x.stroke();
        starPath(x, -212, 0, 15); x.fillStyle = '#8b6cf2'; x.fill();
        txt(x, 'limite finito · passo a Gemini', 16, 8, 21, F.poppins(600), '#ffffff', { align: 'center' });
        x.restore();
      }
    }, { fill: '#1c1d22' });
  }

  p2tokens(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.tokens, sp = this.sp;
    caption(x, t, sp.p2tA!, sp.p2tB!, b.y - 108);
    darkCard(x, t, s.t0, b, () => {
      x.fillStyle = '#14151a'; x.fillRect(b.x, b.y, b.w, b.h);
      rr(x, W / 2 - 290, b.y + 30, 580, 50, 25); x.strokeStyle = '#ff7a59'; x.lineWidth = 2.5; x.stroke();
      x.beginPath(); x.moveTo(W / 2 - 256, b.y + 42); x.lineTo(W / 2 - 266, b.y + 58); x.lineTo(W / 2 - 256, b.y + 58); x.lineTo(W / 2 - 262, b.y + 70); x.lineTo(W / 2 - 246, b.y + 52); x.lineTo(W / 2 - 256, b.y + 52); x.closePath(); x.fillStyle = '#ffc94d'; x.fill();
      txt(x, 'Token gratis al mese · stima di OmniRoute', W / 2 + 14, b.y + 63, 21, F.poppins(600), '#ffffff', { align: 'center' });
      ['Somma le quote gratuite dei provider che OmniRoute sa usare: un tetto', 'teorico, non una garanzia. Dipende dai piani gratuiti di ogni provider.'].forEach((l, i) =>
        txt(x, l, b.x + 44, b.y + 122 + i * 27, 17, F.poppins(500), '#7f8490'));
      const v = 1.6 * ease.outCubic(clamp((t - s.t0 - 0.25) / 0.8));
      const g = x.createLinearGradient(b.x + 40, 0, b.x + 520, 0); g.addColorStop(0, '#ff8a65'); g.addColorStop(1, '#ff5fa2');
      x.fillStyle = g; x.font = font(F.mono(700), 116); x.textAlign = 'left';
      x.fillText(`~${v.toFixed(1).replace('.', ',')} mld`, b.x + 40, b.y + 320);
      txt(x, 'token / mese, sulla carta', b.x + 44, b.y + 362, 19, F.poppins(500), '#9da2ad');
      const rows: [string, string][] = [['provider gratis', '90+'], ['cambio provider', 'automatico'], ['endpoint', 'uno solo']];
      rows.forEach(([l, val], i) => {
        txt(x, l, b.x + 44, b.y + 418 + i * 34, 19, F.poppins(500), '#8a8f9a');
        txt(x, val, b.x + b.w - 44, b.y + 418 + i * 34, 19, F.poppins(600), '#5fd394', { align: 'right' });
      });
      const seg = ['#ff7a59', '#ffc94d', '#8b6cf2', '#4dabf7', '#5fd394', '#ff5fa2', '#cfd3da'];
      let sx = b.x + 44;
      seg.forEach((c, i) => { const sw = (b.w - 88) * [0.24, 0.18, 0.16, 0.14, 0.12, 0.09, 0.07][i]!; rr(x, sx, b.y + b.h - 34, sw - 4, 12, 6); x.fillStyle = c; x.fill(); sx += sw; });
    }, { fill: '#14151a' });
  }

  // ---------------------------------------------------------------- 3 · Graphify
  p3(x: CanvasRenderingContext2D, t: number, s: Shot) { starTitle(x, t, s.t0 + 0.02, '3', 'Graphify', this.w.graphify - 0.22); }

  p3graph(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.graph;
    caption(x, t, this.sp.p3A!, this.sp.p3B!, b.y - 108);
    darkCard(x, t, s.t0, b, () => {
      x.fillStyle = '#0a0f1d'; x.fillRect(b.x, b.y, b.w, b.h);
      const cx = b.x + b.w / 2, cy = b.y + 250, rot = 0.04 * (t - s.t0);
      const grow = (n: Node) => ease.outBack(clamp((t - s.t0 - 0.2 - n.born) / 0.4), 2);
      const P = (n: Node): [number, number] => [cx + (n.x * Math.cos(rot) - n.y * Math.sin(rot)) * 1.25, cy + (n.x * Math.sin(rot) + n.y * Math.cos(rot)) * 1.15];
      x.lineWidth = 1.2;
      for (const [i, j] of this.edges) {
        const a = this.nodes[i]!, c = this.nodes[j]!, k = Math.min(grow(a), grow(c));
        if (k <= 0) continue;
        const [ax, ay] = P(a), [bx, by] = P(c);
        x.strokeStyle = `rgba(190,200,255,${(0.12 * k).toFixed(3)})`; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      }
      x.save(); x.globalCompositeOperation = 'lighter';
      this.nodes.forEach((n, i) => {
        const k = grow(n);
        if (k <= 0) return;
        const [px, py] = P(n), tw = 0.75 + 0.25 * Math.sin(t * 3 + i);
        x.fillStyle = n.c; x.globalAlpha = 0.25 * tw; x.beginPath(); x.arc(px, py, n.r * 2.6 * k, 0, TAU); x.fill();
        x.globalAlpha = tw; x.beginPath(); x.arc(px, py, n.r * k, 0, TAU); x.fill();
      });
      x.restore();
      txt(x, 'COMUNITÀ', b.x + 44, b.y + b.h - 150, 15, F.poppins(600), '#7f8490', { track: 3 });
      const comm: [string, string, number][] = [['auth', '#ff6b6b', 18], ['api', '#ffa94d', 42], ['database', '#ffd43b', 27], ['interfaccia', '#69db7c', 51], ['test', '#4dabf7', 33], ['pagamenti', '#b197fc', 22]];
      comm.forEach(([n, c, k], i) => {
        const lx = b.x + 44 + (i % 2) * 400, ly = b.y + b.h - 108 + Math.floor(i / 2) * 34;
        x.beginPath(); x.arc(lx + 7, ly - 6, 7, 0, TAU); x.fillStyle = c; x.fill();
        txt(x, n, lx + 24, ly, 19, F.poppins(500), '#d3d6dc');
        txt(x, `${k} nodi`, lx + 330, ly, 17, F.mono(400), '#6f7480', { align: 'right' });
      });
    }, { fill: '#0a0f1d' });
  }

  p3path(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.path, sp = this.sp;
    caption(x, t, sp.p3pA!, sp.p3pB!, b.y - 108);
    caption(x, t, sp.p3qA!, sp.p3qB!, b.y + b.h + 92);
    darkCard(x, t, s.t0, b, () => {
      x.fillStyle = '#0b1411'; x.fillRect(b.x, b.y, b.w, b.h);
      titleBar(x, b, 'graphify');
      const lines: [string, string][] = [['$ graphify query', '#e6e6e6'], ['  "dove si calcola', '#9fd8b8'], ['   il totale?"', '#9fd8b8'], ['', ''], ['  3 nodi letti', '#7f8a86'], ['  0 file riaperti', '#62d394']];
      lines.forEach(([str, col], i) => {
        const n = Math.floor(clamp((t - s.t0 - 0.25 - i * 0.14) * 60, 0, str.length));
        if (n > 0) txt(x, str.slice(0, n), b.x + 36, b.y + 112 + i * 40, 22, F.mono(400), col);
      });
      const pts: [number, number, string][] = [[b.x + 430, b.y + 300, 'api'], [b.x + 520, b.y + 150, 'checkout'], [b.x + 620, b.y + 290, 'totale'], [b.x + 720, b.y + 140, 'sconti'], [b.x + 800, b.y + 270, 'db']];
      const k = ease.inOutCubic(clamp((t - s.t0 - 0.35) / 0.9));
      x.strokeStyle = '#3ddc97'; x.lineWidth = 3; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(pts[0]![0], pts[0]![1]);
      const segs = pts.length - 1, upto = k * segs;
      for (let i = 1; i <= segs; i++) {
        const f = clamp(upto - (i - 1));
        if (f <= 0) break;
        x.lineTo(lerp(pts[i - 1]![0], pts[i]![0], f), lerp(pts[i - 1]![1], pts[i]![1], f));
      }
      x.stroke();
      pts.forEach(([px, py, n], i) => {
        if (upto < i - 0.05) return;
        x.beginPath(); x.arc(px, py, 10, 0, TAU); x.fillStyle = '#0b1411'; x.fill(); x.strokeStyle = '#3ddc97'; x.lineWidth = 3; x.stroke();
        txt(x, n, px, py + (i % 2 ? -22 : 36), 16, F.mono(400), '#9fd8b8', { align: 'center' });
      });
      // the faint rest of the graph the query never touches
      for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(b.x + 400 + hash(i, 5) * 430, b.y + 100 + hash(i, 6) * 260, 3, 0, TAU); x.fillStyle = 'rgba(160,200,180,0.18)'; x.fill(); }
    }, { fill: '#0b1411' });
  }

  // ---------------------------------------------------------------- 4 · Agent Skills
  talk(x: CanvasRenderingContext2D, t: number, f: Frame, s: Shot) {
    const sp = this.sp, w = this.w;
    talkSet(x, t);
    x.save(); x.translate(540, 650); x.scale(1.35, 1.35); x.translate(-540, -975);
    presenter(x, t, f.a, this.gest, 540, undefined, 1500);
    x.restore();
    const g = x.createLinearGradient(0, 980, 0, H);
    g.addColorStop(0, 'rgba(12,10,10,0)'); g.addColorStop(1, 'rgba(12,10,10,0.72)');
    x.fillStyle = g; x.fillRect(0, 980, W, H - 980);
    if (s.id === 'talk1') talkCaps(x, t, sp.t1A!, sp.t1B!);
    else if (s.id === 'talk2') talkCaps(x, t, sp.t2A!, sp.t2B!);
    else if (t < w.commenta - 0.08) talkCaps(x, t, sp.t3A!, sp.t3B!, { bWhite: true });
    else if (t < w.emando - 0.08) talkCaps(x, t, sp.t3C!, sp.t3D!);
    else talkCaps(x, t, sp.t3E!, sp.t3F!);
  }

  p4table(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.table;
    const rows: [string, string][] = [
      ['using-agent-skills', 'sceglie la skill giusta'], ['interview-me', 'capisce cosa vuoi davvero'],
      ['spec-driven-development', 'prima la specifica, poi il codice'], ['planning-and-task-breakdown', 'divide il lavoro in task piccoli'],
      ['incremental-implementation', 'un pezzo alla volta'], ['test-driven-development', 'rosso, verde, refactor'],
      ['code-review-and-quality', 'rilegge prima del merge'], ['security-and-hardening', 'OWASP, segreti, injection'],
      ['shipping-and-launch', 'pubblica senza sorprese'], ['+ altre 15 skill', ''],
    ];
    const shown = clamp((t - s.t0 - 0.1) / 0.12, 0, rows.length);
    const hh = 110 + 52 * shown, top = b.y;
    caption(x, t, this.sp.p4A!, [], top - 50);
    const bb: Box = { x: b.x, y: top, w: b.w, h: hh, r: 22 };
    x.save();
    x.shadowColor = 'rgba(232,108,86,0.38)'; x.shadowBlur = 44;
    rr(x, bb.x, bb.y, bb.w, bb.h, 22); x.fillStyle = '#0e1116'; x.fill();
    x.restore();
    x.save(); rr(x, bb.x, bb.y, bb.w, bb.h, 22); x.clip();
    titleBar(x, bb, 'README.md · agent-skills');
    txt(x, 'Skill', bb.x + 40, bb.y + 100, 17, F.poppins(600), '#7f8490');
    txt(x, 'Cosa fa', bb.x + 470, bb.y + 100, 17, F.poppins(600), '#7f8490');
    rows.forEach(([sk, what], i) => {
      const k = clamp(shown - i);
      if (k <= 0) return;
      const ry = bb.y + 150 + i * 52;
      x.globalAlpha = k;
      txt(x, sk, bb.x + 40, ry, 19, F.mono(500), sk.startsWith('+') ? '#7f8490' : '#7aa2ff');
      txt(x, what, bb.x + 470, ry, 19, F.poppins(500), '#d0d3da');
      x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(bb.x + 30, ry + 18, bb.w - 60, 1.5);
      x.globalAlpha = 1;
    });
    x.restore();
  }

  p4repo(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const sp = this.sp;
    caption(x, t, sp.p4rA!, sp.p4rB!, 1258);
    const k = ease.outBack(clamp((t - s.t0) / 0.42), 1.3), a = clamp((t - s.t0) / 0.25);
    const bx = 170, by = 560, bw = 740, bh = 520;
    x.save();
    x.globalAlpha = a; x.translate(W / 2, by + bh / 2); x.scale(lerp(0.9, 1, k), lerp(0.9, 1, k)); x.translate(-W / 2, -(by + bh / 2));
    if (a < 1) x.filter = `blur(${((1 - a) * 8).toFixed(2)}px)`;
    x.save(); x.shadowColor = 'rgba(0,0,0,0.12)'; x.shadowBlur = 50; x.shadowOffsetY = 18;
    rr(x, bx, by, bw, bh, 30); x.fillStyle = '#ffffff'; x.fill(); x.restore();
    const ag = x.createLinearGradient(bx + 60, by + 70, bx + 200, by + 210); ag.addColorStop(0, '#ffb199'); ag.addColorStop(1, '#e8644a');
    x.beginPath(); x.arc(bx + 130, by + 140, 70, 0, TAU); x.fillStyle = ag; x.fill();
    txt(x, 'AO', bx + 130, by + 158, 50, F.poppins(700), '#ffffff', { align: 'center' });
    txt(x, 'addyosmani /', bx + 230, by + 118, 28, F.mono(500), '#6b6f78');
    txt(x, 'agent-skills', bx + 230, by + 180, 56, F.poppins(700), INK);
    let px = bx + 60;
    for (const p of ['MIT', 'Claude Code', '24 skill + 1']) {
      x.font = font(F.poppins(600), 20); const pw = x.measureText(p).width + 36;
      rr(x, px, by + 262, pw, 42, 21); x.fillStyle = '#f3f0ee'; x.fill();
      txt(x, p, px + pw / 2, by + 290, 20, F.poppins(600), '#55585f', { align: 'center' });
      px += pw + 14;
    }
    const v = 102.3 * ease.inOutCubic(clamp((t - s.t0 - 0.3) / Math.max(0.5, this.w.centomila + 0.45 - s.t0 - 0.3)));
    star5(x, bx + 92, by + 410, 34); x.fillStyle = CORAL; x.fill();
    txt(x, `${v >= 100 ? Math.round(v) : v.toFixed(1).replace('.', ',')}k`, bx + 144, by + 432, 72, F.poppins(700), INK);
    txt(x, 'stelle su GitHub', bx + 400, by + 428, 26, F.poppins(500), '#8a8d94');
    x.restore();
  }

  p4stages(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const b = BOX.stages, sp = this.sp, w = this.w;
    const B = t < w.pian - 0.07 ? sp.p4s0! : t < w.codice2 - 0.07 ? sp.p4s1! : t < w.test - 0.07 ? sp.p4s2! : t < w.epubbl - 0.07 ? sp.p4s3! : sp.p4s4!;
    caption(x, t, sp.p4sA!, B, b.y - 108);
    darkCard(x, t, s.t0, b, () => {
      x.fillStyle = '#101318'; x.fillRect(b.x, b.y, b.w, b.h);
      titleBar(x, b, 'agent-skills · le sei fasi');
      const st: [string, string, string, string][] = [
        ['Definisci', 'idea, intervista, specifica', 'spec-driven-development', '#ff7a59'],
        ['Pianifica', 'task piccoli, in ordine', 'planning-and-task-breakdown', '#ffc94d'],
        ['Costruisci', 'un pezzo alla volta, con i test', 'incremental-implementation', '#5fd394'],
        ['Verifica', 'browser, debug, errori', 'browser-testing-with-devtools', '#4dabf7'],
        ['Rivedi', 'qualità, sicurezza, prestazioni', 'code-review-and-quality', '#b197fc'],
        ['Pubblica', 'git, CI/CD, lancio', 'shipping-and-launch', '#ff5fa2'],
      ];
      const sel = steps(t, [[s.t0, -1], [w.fase - 0.05, 0], [w.pian - 0.05, 1], [w.codice2 - 0.05, 2], [w.test - 0.05, 3], [w.epubbl, 5]], 0.22);
      st.forEach(([name, what, skill, col], i) => {
        const ry = b.y + 92 + i * 98;
        rr(x, b.x + 30, ry, b.w - 60, 84, 16); x.fillStyle = '#171b22'; x.fill();
        rr(x, b.x + 30, ry, 10, 84, 5); x.fillStyle = col; x.fill();
        txt(x, name, b.x + 64, ry + 38, 26, F.poppins(600), '#ffffff');
        txt(x, what, b.x + 64, ry + 68, 18, F.poppins(500), '#8d929d');
        txt(x, skill, b.x + b.w - 54, ry + 50, 16, F.mono(400), '#6f7480', { align: 'right' });
      });
      if (sel > -1) {
        const hy = b.y + 92 + Math.max(0, sel) * 98;
        x.save(); x.globalAlpha *= clamp(sel + 1); x.shadowColor = 'rgba(240,143,116,0.8)'; x.shadowBlur = 24;
        rr(x, b.x + 26, hy - 4, b.w - 52, 92, 19); x.strokeStyle = CORAL_L; x.lineWidth = 3.5; x.stroke();
        x.restore();
      }
    }, { fill: '#101318' });
  }
}

function mixGrey(near: number) {
  const v = Math.round(lerp(150, 34, near));
  return `rgb(${v},${v},${v})`;
}
