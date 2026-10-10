// PLATE 5 `octopus` — "E infine Claude Octopus: manda lo stesso compito fino a dodici altri modelli, come Codex,
// Copilot e Grok, / e ti segnala ogni punto in cui non sono d'accordo, prima che tu pubblichi."
// Plug 4 drops in on "Octopus", and an octopus rises from behind the counter. Beats on the purple wall:
//  1. "manda lo stesso compito": it holds up the task; "fino a dodici altri modelli": twelve model cards pop up
//     and a copy of the task flies to each, which gets to work; "Codex", "Copilot", "Grok" light up as named;
//  2. "ti segnala ogni punto in cui non sono d'accordo": the debate in the terminal, the consensus bar stops
//     short of its threshold and a flag goes up on each disagreement; "prima che tu pubblichi": PUBBLICA,
//     locked until they are settled.
import {
  Plate, Gestures, wordAt, terminal, card, rr, text, flag, pill, life, pop, bump, around,
  prog, ease, clamp, lerp, hash, INK, RED, YELLOW, PAPER, TERM, F, COUNTER_Y, TAU,
  type PostOverrides,
} from './_stage';

const MODELS = ['Codex', 'Antigravity', 'Copilot', 'Qwen', 'Ollama', 'Perplexity', 'OpenRouter', 'OrcaRouter', 'OpenCode', 'Cursor CLI', 'Grok', 'Kimi Code'];
const OCT = { x: 830, y: 1075 };
const PURPLE = '#8b5cf6', PURPLE_D = '#6a3fd8', PURPLE_L = '#c4b5fd';
const DISPUTES: [string, string][] = [['cache: Redis o in-memory?', '5 vs 7'], ['deploy: 1 servizio o 3?', '6 vs 6'], ['auth: JWT o sessioni?', '4 vs 8']];

export default class Octopus extends Plate {
  w: Record<string, number> = {};
  flags: number[] = [];

  override setup() {
    const ly = this.ly, T0 = this.T0;
    const at = (q: string, after = T0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.oct = at('Octopus');
    w.manda = at('manda');
    w.dodici = at('dodici');
    w.codex = at('Codex');
    w.copilot = at('Copilot');
    w.grok = at('Grok');
    w.e2 = at('segnala') - 0.2;
    w.segnala = at('segnala');
    w.accordo = at("d'accordo");
    w.pubb = at('pubblichi');
    this.flags = [w.segnala + 0.1, at('punto', w.segnala) + 0.1, w.accordo];
    this.gest = new Gestures([
      [T0, 'idle'], [w.oct - 0.1, 'presentR'], [w.dodici - 0.1, 'pointUp'], [w.codex, 'pointR'], [w.e2, 'idle'],
      [w.segnala, 'pointUp'], [w.pubb - 0.1, 'stop'],
    ]);
    this.tags = [[T0, '04 · CLAUDE OCTOPUS'], [w.dodici - 0.1, '12 MODELLI, 1 COMPITO'], [w.e2, "DOVE NON SONO D'ACCORDO"]];
  }

  override back(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    if (t < w.e2 + 0.1) this.grid(x, t, life(t, w.dodici - 0.2, w.e2 + 0.1));
    if (t >= w.e2) this.debate(x, t, life(t, w.e2));
    this.octopus(x, t);
    this.task(x, t);
  }

  rise(t: number) { return ease.outBack(prog(t, this.w.oct! - 0.15, this.w.oct! + 0.4), 1.3); }

  // the octopus: up from behind the counter, eyes on the action, arms waving
  octopus(x: CanvasRenderingContext2D, t: number) {
    const k = this.rise(t);
    if (k <= 0) return;
    const cx = OCT.x, cy = lerp(COUNTER_Y + 260, OCT.y, k) + 6 * Math.sin(t * 2.2);
    // arms behind the head
    for (let i = 0; i < 4; i++) this.arm(x, t, cx + (i - 1.5) * 70, cy + 70, -Math.PI / 2 + (i - 1.5) * 0.9, 210 + 30 * hash(i, 2), i);
    // the head
    x.beginPath(); x.ellipse(cx + 10, cy + 10, 160, 150, 0, 0, TAU); x.fillStyle = INK; x.fill();
    x.beginPath(); x.ellipse(cx, cy, 160, 150, 0, 0, TAU); x.fillStyle = PURPLE; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    x.save(); x.clip();
    x.fillStyle = PURPLE_D; x.beginPath(); x.ellipse(cx + 110, cy + 40, 90, 170, 0, 0, TAU); x.fill();
    x.fillStyle = PURPLE_L;
    for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(cx - 110 + hash(i, 4) * 200, cy - 110 + hash(i, 5) * 120, 7 + 9 * hash(i, 6), 0, TAU); x.fill(); }
    x.restore();
    // eyes: towards the cards, or down at the terminal
    const lookX = t < this.w.e2! ? -8 : -4, lookY = t < this.w.e2! ? -8 : 2;
    const bl = (t % 3.1) < 0.12 ? 1 : 0;
    for (const sd of [-1, 1]) {
      const ex = cx + sd * 56, ey = cy + 6;
      x.beginPath(); x.ellipse(ex, ey, 40, bl ? 5 : 46, 0, 0, TAU); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
      if (!bl) {
        x.beginPath(); x.ellipse(ex + lookX, ey + lookY, 18, 24, 0, 0, TAU); x.fillStyle = INK; x.fill();
        x.beginPath(); x.arc(ex + lookX + 6, ey + lookY - 9, 6, 0, TAU); x.fillStyle = '#ffffff'; x.fill();
      }
    }
    x.beginPath(); x.arc(cx, cy + 74, 18, 0.15 * Math.PI, 0.85 * Math.PI); x.lineWidth = 5; x.strokeStyle = INK; x.stroke(); // smile
    x.fillStyle = 'rgba(255,120,150,0.5)';
    for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(cx + sd * 100, cy + 64, 22, 12, 0, 0, TAU); x.fill(); }
  }

  /** A tapered arm with suckers, curling from (bx, by) towards angle a0. */
  arm(x: CanvasRenderingContext2D, t: number, bx: number, by: number, a0: number, len: number, seed: number, reach?: [number, number]) {
    const N = 22, pts: [number, number][] = [];
    let px = bx, py = by, a = a0;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push([px, py]);
      a += (0.16 * Math.sin(t * 2.4 + seed * 1.7 - u * 4) + 0.05) * (seed % 2 ? 1 : -1);
      if (reach) a = lerp(a, Math.atan2(reach[1] - py, reach[0] - px), 0.35 * u);
      px += Math.cos(a) * (len / N); py += Math.sin(a) * (len / N);
    }
    for (const [pass, col] of [[0, INK], [1, PURPLE]] as const) {
      for (let i = 0; i < N; i++) {
        const u = i / N, wd = lerp(46, 12, u) + (pass ? 0 : 12);
        x.beginPath(); x.moveTo(pts[i]![0], pts[i]![1]); x.lineTo(pts[i + 1]![0], pts[i + 1]![1]);
        x.lineCap = 'round'; x.lineWidth = wd; x.strokeStyle = col; x.stroke();
      }
    }
    x.fillStyle = PURPLE_L;
    for (let i = 3; i < N; i += 3) {
      const [ax, ay] = pts[i]!, [bx2, by2] = pts[i + 1]!, nx = -(by2 - ay), ny = bx2 - ax, nl = Math.hypot(nx, ny) || 1;
      const off = lerp(14, 4, i / N);
      x.beginPath(); x.arc(ax + (nx / nl) * off, ay + (ny / nl) * off, lerp(7, 3, i / N), 0, TAU); x.fill();
    }
    return pts[N]!;
  }

  // the task it sends, held up by an arm; on "dodici" a copy flies to every card
  task(x: CanvasRenderingContext2D, t: number) {
    const w = this.w, k = this.rise(t);
    const s = life(t, w.manda! - 0.05, w.e2!);
    if (s <= 0 || k <= 0) return;
    const hx = 640, hy = 820;
    this.arm(x, t, OCT.x - 110, OCT.y + 40, -Math.PI * 0.75, 250, 7, [hx + 20, hy + 40]);
    around(x, hx, hy, s, -0.08, () => {
      card(x, hx - 100, hy - 66, 200, 132, { fill: PAPER, r: 6, shadow: 7, line: 4 });
      text(x, 'COMPITO', hx - 80, hy - 26, 22, { fam: F.mono(700), color: RED });
      x.fillStyle = '#9a96a3'; x.fillRect(hx - 80, hy - 6, 150, 8); x.fillRect(hx - 80, hy + 14, 110, 8); x.fillRect(hx - 80, hy + 34, 130, 8);
    });
    // the copies
    MODELS.forEach((_, i) => {
      const t0 = w.dodici! + 0.05 + i * 0.05, u = prog(t, t0, t0 + 0.4);
      if (u <= 0 || u >= 1) return;
      const [cx, cy] = this.cardAt(i);
      const e = ease.inOutCubic(u);
      const px = lerp(hx, cx, e), py = lerp(hy, cy, e) - 120 * Math.sin(Math.PI * e);
      around(x, px, py, 0.5, (u - 0.5) * 2, () => card(x, px - 50, py - 34, 100, 68, { fill: PAPER, r: 4, shadow: 4, line: 4 }));
    });
  }

  cardAt(i: number): [number, number] { return [56 + 116 + (i % 4) * 244, 262 + 64 + Math.floor(i / 4) * 142]; }

  // 1 — twelve models get the same task
  grid(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    const named: Record<string, number> = { Codex: w.codex!, Copilot: w.copilot!, Grok: w.grok! };
    MODELS.forEach((m, i) => {
      const [cx, cy] = this.cardAt(i);
      const k = Math.min(s, pop(t, w.dodici! - 0.2 + i * 0.045, 0.28));
      const got = w.dodici! + 0.45 + i * 0.05;
      const hi = named[m] !== undefined ? bump(t, named[m]!, 0.9) : 0;
      const lit = named[m] !== undefined && t >= named[m]!;
      around(x, cx, cy, k * (1 + 0.12 * hi), (hash(i, 9) - 0.5) * 0.04, () => {
        card(x, cx - 116, cy - 64, 232, 128, { fill: lit ? '#3b2f66' : TERM, r: 12, shadow: 7, line: 4 });
        if (lit) { rr(x, cx - 116, cy - 64, 232, 128, 12); x.lineWidth = 5; x.strokeStyle = YELLOW; x.stroke(); }
        text(x, m, cx - 98, cy - 22, m.length > 10 ? 22 : 26, { fam: F.grotesk(700), color: lit ? YELLOW : '#ffffff' });
        rr(x, cx - 98, cy - 4, 196, 50, 6); x.fillStyle = '#2c2b33'; x.fill();
        const busy = t >= got;
        text(x, busy ? 'al lavoro' : 'in attesa', cx - 84, cy + 29, 19, { fam: F.mono(500), color: busy ? '#8fd18f' : '#77737f' });
        if (busy) for (let d = 0; d < 3; d++) {
          const on = Math.floor(t * 6 + i) % 3 === d;
          x.beginPath(); x.arc(cx + 54 + d * 14, cy + 22, 4, 0, TAU); x.fillStyle = on ? '#8fd18f' : '#4a4852'; x.fill();
        }
      });
    });
  }

  // 2 — where they disagree, before you ship
  debate(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    around(x, 540, 480, s, 0, () => {
      terminal(x, 56, 262, 968, 450, t, {
        title: 'claude — /octo:debate', size: 25, cursor: false,
        lines: [
          { s: '> /octo:debate monorepo vs microservizi', at: w.e2! + 0.05, cps: 80 },
          { s: '12 modelli · 3 round', at: w.e2! + 0.35, col: '#8d8a96', cps: 80 },
        ],
      });
      // the consensus bar: it stops short of the threshold
      const by = 450, bx = 90, bw = 620;
      text(x, 'consenso', bx, by - 14, 20, { fam: F.mono(500), color: '#b9b4c4' });
      rr(x, bx, by, bw, 26, 13); x.fillStyle = '#2c2b33'; x.fill();
      const fill = (7 / 12) * ease.outCubic(prog(t, w.segnala!, w.accordo! + 0.3));
      if (fill > 0.01) { rr(x, bx, by, bw * fill, 26, 13); x.fillStyle = YELLOW; x.fill(); }
      x.fillStyle = '#ffffff'; x.fillRect(bx + bw * 0.75 - 2, by - 8, 4, 42);
      text(x, 'soglia 75%', bx + bw * 0.75, by + 58, 17, { fam: F.mono(500), color: '#b9b4c4', align: 'center' });
      text(x, `${Math.round(fill * 12)}/12`, bx + bw + 24, by + 22, 26, { fam: F.mono(700), color: '#ffffff' });
      DISPUTES.forEach(([q, v], i) => {
        const t0 = this.flags[i]!;
        if (t < t0) return;
        const y = 560 + i * 48, k = pop(t, t0, 0.25);
        around(x, 108, y - 8, k, 0, () => flag(x, 104, y - 4, 0.9));
        text(x, q.slice(0, Math.floor((t - t0) * 70)), 140, y, 24, { fam: F.mono(500), color: '#ece8de' });
        text(x, v, 990, y, 24, { fam: F.mono(700), color: '#ff8a7a', align: 'right', alpha: prog(t, t0 + 0.3, t0 + 0.45) });
      });
    });
    // ship: locked while they disagree
    const k = Math.min(s, pop(t, w.pubb! - 0.1, 0.3));
    around(x, 860, 790, k, -0.04, () => {
      card(x, 720, 744, 290, 92, { fill: '#d9d4e8', r: 46, shadow: 8, line: 5 });
      rr(x, 750, 776, 36, 30, 5); x.fillStyle = INK; x.fill(); // the lock
      x.beginPath(); x.arc(768, 776, 13, Math.PI, 0); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
      text(x, 'PUBBLICA', 900, 806, 34, { fam: F.grotesk(700), color: '#6e6a78', align: 'center' });
      pill(x, 990, 748, '3', { size: 22, fill: RED, ink: '#ffffff', fam: F.grotesk(700) });
    });
  }

  // two arms draped over the counter's edge
  override front(x: CanvasRenderingContext2D, t: number) {
    const k = this.rise(t);
    if (k < 0.6) return;
    x.save();
    x.globalAlpha *= clamp((k - 0.6) / 0.3);
    this.arm(x, t, OCT.x - 70, COUNTER_Y - 30, Math.PI * 0.55, 150, 3);
    this.arm(x, t, OCT.x + 90, COUNTER_Y - 30, Math.PI * 0.42, 170, 4);
    x.restore();
  }

  override post(t: number): PostOverrides {
    const b = 0.5 * bump(t, this.w.oct! + 0.25, 0.25) + 0.5 * bump(t, this.w.pubb! + 0.1, 0.18);
    return { shake: [6 * b * Math.sin(t * 79), 5 * b * Math.cos(t * 61)], zoom: 1 + 0.008 * b };
  }
}
