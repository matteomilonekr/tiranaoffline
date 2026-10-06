// PLATE 3 `karpathy` — "Il secondo sono le Karpathy skills: un solo file CLAUDE.md, nato da una lamentela di
// Andrej Karpathy: / i modelli scrivono mille righe quando ne basterebbero cento. / Quattro regole: pensa prima
// di scrivere codice, resta semplice, tocca solo quello che ti chiedono, e dimostra che funziona."
// Plug 2 drops in on "Karpathy". Beats on the mint wall:
//  1. the install command in the terminal; on "un solo file" the CLAUDE.md sheet, stamped 1 FILE;
//     "una lamentela": an angry speech bubble (symbols, no words put in anyone's mouth), his name under it;
//  2. "mille righe": a printout rises from behind the counter and the line counter rolls to 1000;
//     "cento": the counter rolls back to 0100, the stack drops to a tenth, -90%;
//  3. "Quattro regole": a cork board; each rule is pinned on as it is said and ticked when it is done.
import {
  Plate, Gestures, wordAt, terminal, card, paper, rr, text, odometer, tick, stamp, pill, life, pop, bump,
  around, sparkle, prog, ease, clamp, lerp, hash, INK, RED, GREEN, YELLOW, PAPER, F, COUNTER_Y, TAU,
  type PostOverrides,
} from './_stage';

const RULES: [string, string][] = [['Pensa prima di', 'scrivere codice'], ['Resta', 'semplice'], ['Tocca solo ciò che', 'ti chiedono'], ['Dimostra che', 'funziona']];

export default class Karpathy extends Plate {
  w: Record<string, number> = {};
  rule: number[] = [];
  done: number[] = [];

  override setup() {
    const ly = this.ly, T0 = this.T0;
    const at = (q: string, after = T0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.karp = at('Karpathy');
    w.file = at('file');
    w.md = at('CLAUDE.md');
    w.lam = at('lamentela');
    w.andrej = at('Andrej');
    w.mille = at('mille');
    w.cento = at('cento');
    w.rules = at('Quattro');
    this.rule = ['pensa', 'resta', 'tocca', 'dimostra'].map((q) => at(q, w.rules));
    this.done = [at('resta', w.rules), at('tocca', w.rules), at('dimostra', w.rules), wordAt(ly, 'funziona', w.rules).end + 0.05].map((v) => v - 0.12);
    this.gest = new Gestures([
      [T0, 'idle'], [w.karp - 0.1, 'pointL'], [w.lam, 'presentL'], [w.mille - 0.1, 'think'], [w.cento, 'thumb'],
      [w.rules, 'presentL'], [this.rule[1]!, 'pointL'], [this.rule[2]!, 'stopR'], [this.rule[3]!, 'thumb'],
    ]);
    this.tags = [[T0, '02 · KARPATHY SKILLS'], [w.mille - 0.2, '1.000 → 100 RIGHE'], [w.rules - 0.1, '4 REGOLE · 1 FILE']];
  }

  override back(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    if (t < w.file) this.install(x, t, life(t, this.T0 + 0.1, w.file));
    if (t >= w.file - 0.1 && t < w.mille) {
      this.claudeMd(x, t, life(t, w.file - 0.1, w.mille - 0.15));
      this.complaint(x, t, life(t, w.lam - 0.05, w.mille - 0.15));
    }
    if (t >= w.mille - 0.25 && t < w.rules) this.lines(x, t, life(t, w.mille - 0.25, w.rules - 0.05));
    if (t >= w.rules - 0.1) this.board(x, t, life(t, w.rules - 0.1));
  }

  // 1 — install, the one file, the complaint
  install(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    around(x, 540, 400, s, 0, () => {
      terminal(x, 56, 268, 968, 300, t, {
        title: 'claude — ~/app',
        lines: [
          { s: '> /plugin marketplace add', at: this.T0 + 0.1, cps: 70 },
          { s: '  forrestchang/andrej-karpathy-skills', at: this.T0 + 0.5, cps: 70 },
          { s: '✓ marketplace aggiunto', at: w.karp! + 0.35, col: '#8fd18f', bold: true, cps: 70 },
        ],
      });
    });
  }

  claudeMd(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    around(x, 330, 560, s, -0.03, () => {
      paper(x, 60, 262, 540, 600, { fold: 60 });
      text(x, '#', 96, 350, 54, { fam: F.mono(700), color: '#9a96a3' });
      text(x, 'CLAUDE.md', 140, 350, 54, { fam: F.grotesk(700) });
      text(x, 'linee guida per Claude Code', 98, 392, 21, { fam: F.mono(500), color: '#6e6a78' });
      text(x, 'ispirate ad Andrej Karpathy', 98, 420, 21, { fam: F.mono(500), color: '#6e6a78' });
      const widths = [380, 300, 420, 260, 360, 330, 400, 240, 350];
      widths.forEach((bw, i) => {
        const u = clamp((t - w.md! - 0.1 - i * 0.07) / 0.18);
        x.fillStyle = i % 3 === 0 ? '#2b2930' : '#c9c3b6';
        x.fillRect(98, 466 + i * 40, (i % 3 === 0 ? bw * 0.45 : bw) * u, i % 3 === 0 ? 16 : 11);
      });
    });
    stamp(x, 470, 790, '1 FILE', t, w.md! + 0.35, { color: RED, size: 46, rot: -0.14, fill: 'rgba(255,253,245,0.9)' });
  }

  complaint(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w, cx = 840, cy = 400;
    const shake = 5 * bump(t, w.lam! + 0.05, 0.6) * Math.sin(t * 60);
    around(x, cx, cy, s, 0.06 + shake * 0.004, () => {
      const spikes = 14;
      const path = (dx: number, dy: number) => {
        x.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const a = (i * Math.PI) / spikes, r = i % 2 ? 0.78 : 1 + 0.08 * hash(i, 2);
          x.lineTo(cx + dx + Math.cos(a) * 176 * r, cy + dy + Math.sin(a) * 128 * r);
        }
        x.closePath();
      };
      path(10, 10); x.fillStyle = INK; x.fill();
      path(0, 0); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke();
      text(x, '#@$%!', cx + shake, cy + 26, 72, { fam: F.grotesk(700), color: RED, align: 'center' });
      // the bubble's tail, down towards the name
      x.beginPath(); x.moveTo(cx - 40, cy + 100); x.lineTo(cx - 10, cy + 190); x.lineTo(cx + 30, cy + 104); x.closePath();
      x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 6; x.stroke();
    });
    const n = Math.min(s, pop(t, w.andrej! - 0.05));
    around(x, cx, cy + 236, n, -0.04, () => pill(x, cx, cy + 236, 'ANDREJ KARPATHY', { size: 24, fill: YELLOW }));
  }

  // 2 — a thousand lines where a hundred would do
  lines(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    const rise = ease.outBack(prog(t, w.mille! - 0.2, w.mille! + 0.45), 1.2);
    const fall = ease.inOutCubic(prog(t, w.cento!, w.cento! + 0.45));
    const top = lerp(COUNTER_Y, lerp(290, COUNTER_Y - 90, fall), rise);
    if (s > 0.01 && top < COUNTER_Y) {
      // a continuous-form printout, folded in a stack: green bars, sprocket holes down both sides
      const x0 = 80, sw = 330;
      x.save();
      x.globalAlpha *= clamp(s * 3);
      rr(x, x0 + 10, top + 10, sw, COUNTER_Y - top, 6); x.fillStyle = INK; x.fill();
      rr(x, x0, top, sw, COUNTER_Y - top + 10, 6); x.fillStyle = '#fbfaf3'; x.fill();
      x.save(); x.clip();
      for (let y = top + 6, i = 0; y < COUNTER_Y; y += 22, i++) {
        if (Math.floor(i / 2) % 2 === 0) { x.fillStyle = '#d5efd9'; x.fillRect(x0, y, sw, 22); }
        x.fillStyle = '#9a96a3'; x.fillRect(x0 + 44, y + 9, 60 + 140 * hash(i, 9), 4);
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(x0 + 16, y + 11, 5, 0, TAU); x.arc(x0 + sw - 16, y + 11, 5, 0, TAU); x.fill();
        if (i % 6 === 5) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(x0, y + 21, sw, 2); }
      }
      x.restore();
      rr(x, x0, top, sw, COUNTER_Y - top + 10, 6); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
      x.restore();
      // sheets fly off as it drops
      for (let i = 0; i < 7 && fall > 0 && fall < 1; i++) {
        const u = clamp(fall * 1.4 - i * 0.06), px = x0 + sw / 2 + (hash(i, 1) - 0.5) * 500 * u, py = lerp(400, 160, u) + 400 * u * u;
        around(x, px, py, 1 - u, (hash(i, 3) - 0.5) * 6 * u, () => card(x, px - 50, py - 34, 100, 68, { fill: '#fbfaf3', r: 3, shadow: 0, line: 4 }));
      }
    }
    // the line counter
    around(x, 830, 370, s, 0.03, () => {
      card(x, 640, 262, 380, 220, { fill: '#26242c', r: 18, shadow: 12 });
      text(x, 'RIGHE DI CODICE', 830, 310, 22, { fam: F.mono(700), color: '#b9b4c4', align: 'center' });
      const k1 = prog(t, w.mille!, w.mille! + 0.7), k2 = prog(t, w.cento!, w.cento! + 0.6);
      if (t < w.cento!) odometer(x, 830, 396, '0000', '1000', k1, { dw: 76, dh: 110, size: 86 });
      else odometer(x, 830, 396, '1000', '0100', k2, { dw: 76, dh: 110, size: 86, fill: '#c9f2d6' });
    });
    stamp(x, 900, 560, '-90%', t, w.cento! + 0.55, { color: GREEN, size: 60, rot: 0.1, fill: 'rgba(255,253,245,0.92)' });
  }

  // 3 — four rules on a cork board
  board(x: CanvasRenderingContext2D, t: number, s: number) {
    around(x, 540, 480, s, 0, () => {
      card(x, 50, 256, 980, 450, { fill: '#8a5a33', r: 16, shadow: 12 });
      rr(x, 72, 278, 936, 406, 8); x.fillStyle = '#cf9c63'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
      x.fillStyle = 'rgba(120,70,30,0.25)';
      for (let i = 0; i < 260; i++) { x.beginPath(); x.arc(80 + hash(i, 1) * 920, 286 + hash(i, 2) * 390, 2 + 2 * hash(i, 3), 0, TAU); x.fill(); }
    });
    RULES.forEach(([a, b], i) => {
      const t0 = this.rule[i]! - 0.08;
      const k = Math.min(s, pop(t, t0, 0.3));
      const cx = 300 + (i % 2) * 480, cy = 384 + Math.floor(i / 2) * 196;
      const rot = (hash(i, 7) - 0.5) * 0.08;
      around(x, cx, cy, k, rot, () => {
        card(x, cx - 216, cy - 82, 432, 164, { fill: i === 0 ? '#fff6d6' : PAPER, r: 6, shadow: 8, line: 5 });
        text(x, `0${i + 1}`, cx - 192, cy - 42, 22, { fam: F.mono(700), color: RED });
        text(x, a, cx - 192, cy + 6, 33, { fam: F.grotesk(700) });
        text(x, b, cx - 192, cy + 48, 33, { fam: F.grotesk(700), color: '#1d7d61' });
        rr(x, cx + 150, cy - 60, 46, 46, 6); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
        tick(x, cx + 174, cy - 38, 40, clamp((t - this.done[i]!) / 0.2), GREEN, 8);
        x.beginPath(); x.arc(cx, cy - 78, 13, 0, TAU); x.fillStyle = RED; x.fill(); x.lineWidth = 4; x.stroke(); // the pin
        x.beginPath(); x.arc(cx - 4, cy - 82, 4, 0, TAU); x.fillStyle = 'rgba(255,255,255,0.7)'; x.fill();
      });
      const fl = bump(t, this.done[i]! + 0.15, 0.4);
      if (fl > 0) for (let j = 0; j < 3; j++) sparkle(x, cx + 174 + Math.cos(j * 2.1) * (40 + 30 * (1 - fl)), cy - 38 + Math.sin(j * 2.1) * (40 + 30 * (1 - fl)), 12 * fl, fl, YELLOW);
    });
  }

  override post(t: number): PostOverrides {
    const b = 0.7 * bump(t, this.w.md! + 0.35, 0.18) + bump(t, this.w.cento! + 0.55, 0.2);
    return { shake: [7 * b * Math.sin(t * 89), 6 * b * Math.cos(t * 71)], zoom: 1 + 0.01 * b };
  }
}
