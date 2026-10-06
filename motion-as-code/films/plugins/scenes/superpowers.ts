// PLATE 2 `superpowers` — "Il primo è Superpowers, quasi trecentomila stelle, e impedisce a Claude di buttarsi
// subito nel codice. / Ti chiede cosa stai costruendo davvero, lo trasforma in una specifica che firmi tu, /
// e passa il lavoro a dei subagent che scrivono prima i test: così lavora per ore senza uscire dal piano."
// Plug 1 drops into the strip on "Superpowers". Five beats on the blue wall:
//  1. the repo card, and its stars rolling up to ~300K on "trecentomila";
//  2. "buttarsi subito nel codice": Claude starts typing code at once, a STOP sign slams on it;
//  3. "cosa stai costruendo": the brainstorming questions; he holds up his idea on a sign;
//  4. "una specifica che firmi tu": the SPEC clipboard, signed on "firmi", stamped;
//  5. "subagent ... prima i test": three subagent cards and a traffic light, red then green;
//     "lavora per ore senza uscire dal piano": the clock spins, the plan ticks itself off.
import {
  Plate, Gestures, wordAt, terminal, card, paper, rr, text, odometer, tick, stamp, star, pill, life, pop, bump,
  around, sparkle, prog, ease, clamp, lerp, hash, INK, RED, GREEN, YELLOW, PAPER, TERM, F, HEAD_Y, TAU,
  type PostOverrides,
} from './_stage';

export default class Superpowers extends Plate {
  w: Record<string, number> = {};

  override setup() {
    const ly = this.ly, T0 = this.T0;
    const at = (q: string, after = T0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.primo = at('primo');
    w.stars = at('trecentomila');
    w.stop = at('impedisce');
    w.jump = at('buttarsi');
    w.ask = at('chiede');
    w.build = at('costruendo');
    w.spec = at('specifica');
    w.sign = at('firmi');
    w.pass = at('passa');
    w.sub = at('subagent');
    w.test = at('test', w.sub);
    w.hours = at('ore', w.sub);
    w.plan = at('piano', w.hours);
    this.gest = new Gestures([
      [T0, 'idle'], [w.primo, 'pointL'], [w.stop, 'stopR'], [w.ask, 'presentL'], [w.build, 'holdL'],
      [w.spec, 'pointUp'], [w.sign + 0.3, 'thumb'], [w.sub, 'pointUpL'], [w.hours, 'shrug'], [w.plan, 'thumb'],
    ]);
    this.tags = [[T0, '01 · SUPERPOWERS'], [w.ask, 'SPEC PRIMA DEL CODICE'], [w.sub - 0.2, 'TEST PRIMA DEL CODICE'], [w.hours, 'ORE DI LAVORO, ZERO DERIVE']];
  }

  override back(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    this.repo(x, t, life(t, this.T0 + 0.15, w.stop));
    if (t >= w.stop - 0.1 && t < w.ask) this.jumpIn(x, t, life(t, w.stop - 0.1, w.ask));
    if (t >= w.ask - 0.05 && t < w.sub) this.brainstorm(x, t, life(t, w.ask - 0.05, w.sub - 0.15));
    if (t >= w.spec - 0.05 && t < w.sub) this.spec(x, t, life(t, w.spec - 0.05, w.sub - 0.15));
    if (t >= w.sub - 0.2 && t < w.hours) this.tdd(x, t, life(t, w.sub - 0.2, w.hours));
    if (t >= w.hours - 0.05) this.hoursOnPlan(x, t, life(t, w.hours - 0.05));
  }

  // 1 — the repo and its stars
  repo(x: CanvasRenderingContext2D, t: number, s: number) {
    around(x, 330, 420, s, -0.02, () => {
      card(x, 56, 268, 560, 300, { fill: PAPER, r: 18, shadow: 12 });
      x.beginPath(); x.arc(104, 322, 22, 0, TAU); x.fillStyle = '#c9c4d6'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
      text(x, 'obra / superpowers', 140, 332, 27, { fam: F.mono(700) });
      text(x, 'README · licenza MIT', 84, 382, 19, { fam: F.mono(500), color: '#6e6a78' });
      x.fillStyle = '#e6e1d6'; x.fillRect(80, 398, 512, 3);
      text(x, 'Superpowers', 84, 462, 50, { fam: F.grotesk(700) });
      text(x, 'Skill per agenti di coding:', 84, 506, 25, { fam: F.grotesk(500), color: '#3b3842' });
      text(x, 'un metodo di sviluppo che funziona.', 84, 540, 25, { fam: F.grotesk(500), color: '#3b3842' });
    });
    const k = ease.inOutCubic(prog(t, this.w.stars! - 0.1, this.w.stars! + 1.1));
    around(x, 330, 690, Math.min(s, pop(t, this.w.stars! - 0.35)), 0.02, () => {
      card(x, 56, 600, 560, 190, { fill: '#26242c', r: 18, shadow: 12 });
      star(x, 130, 676, 42, YELLOW, 5);
      odometer(x, 330, 676, '000', '300', k, { dw: 76, dh: 104, size: 82 });
      text(x, 'K', 462, 706, 82, { fam: F.grotesk(700), color: PAPER });
      text(x, 'STELLE SU GITHUB · QUASI', 330, 766, 19, { fam: F.mono(700), color: '#b9b4c4', align: 'center' });
      const fl = bump(t, this.w.stars! + 1.1, 0.5);
      for (let i = 0; i < 5; i++) sparkle(x, 330 + Math.cos(i * 1.3) * (240 + 60 * (1 - fl)), 676 + Math.sin(i * 1.3) * (90 + 30 * (1 - fl)), 16 * fl, fl, YELLOW);
    });
  }

  // 2 — Claude starts coding at once; a STOP sign slams on it
  jumpIn(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w, tStop = w.jump! + 0.45;
    around(x, 380, 470, s, 0, () => {
      terminal(x, 56, 268, 640, 400, t, {
        title: 'claude — ~/app',
        lines: [
          { s: '> aggiungi il checkout', at: w.stop! - 0.1, cps: 60 },
          { s: 'ok! scrivo subito il codice…', at: w.stop! + 0.35, col: '#f4a273', cps: 60 },
          { s: 'function checkout(cart) {', at: w.jump!, col: '#8fd18f', strike: tStop + 0.1, cps: 60 },
          { s: '  const tot = cart.reduce(', at: w.jump! + 0.4, col: '#8fd18f', strike: tStop + 0.2, cps: 60 },
        ],
      });
    });
    // the STOP sign, slammed on the code
    const k = pop(t, tStop, 0.22);
    around(x, 590, 560, k * s, -0.12, () => {
      x.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * TAU) / 8; x.lineTo(590 + 118 * Math.cos(a), 560 + 118 * Math.sin(a)); }
      x.closePath(); x.fillStyle = RED; x.fill(); x.lineWidth = 8; x.strokeStyle = INK; x.stroke();
      x.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * TAU) / 8; x.lineTo(590 + 100 * Math.cos(a), 560 + 100 * Math.sin(a)); }
      x.closePath(); x.lineWidth = 5; x.strokeStyle = '#ffffff'; x.stroke();
      text(x, 'STOP', 590, 584, 64, { fam: F.grotesk(700), color: '#ffffff', align: 'center' });
    });
  }

  // 3 — the questions
  brainstorm(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    around(x, 360, 470, s, 0, () => {
      terminal(x, 56, 268, 620, 430, t, {
        title: 'superpowers · brainstorming', size: 24,
        lines: [
          { s: '• brainstorming', at: w.ask! - 0.05, col: '#9ad0ff', bold: true, cps: 60 },
          { s: '? Cosa stai costruendo?', at: w.ask! + 0.2, cps: 60 },
          { s: '  › app di fatture', at: w.build! + 0.25, col: '#8fd18f', cps: 60 },
          { s: '? Per chi?', at: w.build! + 0.6, cps: 60 },
          { s: '  › freelance', at: w.build! + 0.85, col: '#8fd18f', cps: 60 },
          { s: '? Cosa fa la v1?', at: w.spec! - 0.55, cps: 60 },
          { s: '  › invia le fatture', at: w.spec! - 0.25, col: '#8fd18f', cps: 60 },
        ],
      });
    });
  }

  // the sign he holds up while he says what he is building
  override held(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    const s = life(t, w.build! + 0.05, w.spec! + 0.2);
    if (s <= 0) return;
    // held up beside his face, his left hand on its lower edge
    const cx = this.presenterX(t) - 430, cy = HEAD_Y + 50;
    around(x, cx + 200, cy + 70, s, -0.06, () => {
      card(x, cx - 230, cy - 82, 460, 164, { fill: '#f6e7c8', r: 6, shadow: 10 });
      text(x, 'LA MIA IDEA', cx - 196, cy - 34, 22, { fam: F.mono(700), color: RED });
      text(x, 'fatture', cx, cy + 16, 46, { fam: F.grotesk(700), align: 'center' });
      text(x, 'per freelance', cx, cy + 62, 38, { fam: F.grotesk(700), color: '#2b55c8', align: 'center' });
      x.beginPath(); x.ellipse(cx + 2, cy + 50, 150, 26, -0.04, 0.2, Math.PI * 1.05); // a marker loop round it
      x.lineWidth = 4; x.strokeStyle = RED; x.stroke();
    });
  }

  // 4 — the spec, signed
  spec(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w, cx = 860, cy = 470;
    around(x, cx, cy, s, 0.05, () => {
      rr(x, cx - 160, cy - 210, 320, 420, 20); x.fillStyle = '#9a6a3f'; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
      card(x, cx - 136, cy - 178, 272, 368, { fill: PAPER, r: 4, shadow: 0, line: 4 });
      rr(x, cx - 60, cy - 226, 120, 44, 10); x.fillStyle = '#b7b3bf'; x.fill(); x.lineWidth = 5; x.stroke();
      text(x, 'SPEC', cx - 110, cy - 118, 40, { fam: F.grotesk(700) });
      text(x, 'v1 · fatture', cx - 110, cy - 88, 18, { fam: F.mono(500), color: '#6e6a78' });
      for (let i = 0; i < 5; i++) {
        const u = clamp((t - w.spec! - 0.15 - i * 0.12) / 0.2);
        x.fillStyle = '#3a6ee8'; x.fillRect(cx - 110, cy - 56 + i * 34, (i % 2 ? 150 : 200) * u, 12);
      }
      x.fillStyle = INK; x.fillRect(cx - 110, cy + 150, 220, 3);
      text(x, 'firma', cx - 110, cy + 176, 16, { fam: F.mono(500), color: '#6e6a78' });
      // the signature, written on "firmi"
      const k = clamp((t - w.sign!) / 0.55);
      if (k > 0) {
        x.beginPath();
        const N = Math.floor(80 * k);
        for (let i = 0; i <= N; i++) {
          const u = i / 80, px = cx - 100 + u * 200;
          const py = cy + 130 - 22 * Math.sin(u * TAU * 2.5) * (1 - 0.6 * u) - 10 * Math.sin(u * TAU * 7) * u;
          if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1d3fa6'; x.stroke();
      }
      stamp(x, cx + 30, cy + 40, 'FIRMATA', t, w.sign! + 0.6, { color: GREEN, size: 40, rot: -0.2 });
    });
  }

  // 5a — subagents writing the tests first; red, then green
  tdd(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    const green = Math.min(w.test! + 0.55, w.hours! - 0.3);
    // the traffic light
    around(x, 130, 480, s, 0, () => {
      card(x, 66, 270, 128, 400, { fill: '#2a2830', r: 30, shadow: 10 });
      const lamps: [string, string, boolean][] = [
        ['#ff4a3a', '#5a2420', t >= w.test! - 0.1 && t < green],
        ['#ffc23a', '#5a4a1e', false],
        ['#2ed37d', '#1d4a33', t >= green],
      ];
      lamps.forEach(([on, off, lit], i) => {
        const cy = 345 + i * 126;
        if (lit) { const g = x.createRadialGradient(130, cy, 20, 130, cy, 110); g.addColorStop(0, on + 'aa'); g.addColorStop(1, on + '00'); x.fillStyle = g; x.fillRect(20, cy - 110, 220, 220); }
        x.beginPath(); x.arc(130, cy, 46, 0, TAU); x.fillStyle = lit ? on : off; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
      });
      pill(x, 130, 700, t >= green ? 'VERDE' : 'ROSSO', { size: 20, fill: t >= green ? '#9ff0c3' : '#ffb3a8' });
    });
    // three fresh subagents, each with its own test file
    const files = ['carrello.test.ts', 'fatture.test.ts', 'auth.test.ts'];
    files.forEach((f, i) => {
      const t0 = w.sub! - 0.15 + i * 0.16;
      const k = Math.min(s, pop(t, t0, 0.3));
      const y0 = 270 + i * 142;
      around(x, 640, y0 + 62, k, (hash(i, 4) - 0.5) * 0.03, () => {
        card(x, 250, y0, 780, 124, { fill: TERM, r: 14, shadow: 8, line: 5 });
        text(x, `subagent ${i + 1} · contesto pulito`, 280, y0 + 40, 19, { fam: F.mono(500), color: '#8d8a96' });
        text(x, `Task ${i + 1} · ${f}`, 280, y0 + 90, 27, { fam: F.mono(700), color: '#ece8de' });
        const ok = t >= green + i * 0.12, fail = t >= w.test! - 0.05 + i * 0.1;
        if (fail) pill(x, 900, y0 + 62, ok ? 'PASSA' : 'FALLISCE', { size: 20, fill: ok ? '#9ff0c3' : '#ffb3a8' });
      });
    });
  }

  // 5b — hours of work, never off the plan
  hoursOnPlan(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    const items = ['Spec firmata', 'Test scritti', 'Codice minimo', 'Refactor', 'Review'];
    around(x, 320, 480, s, -0.02, () => {
      paper(x, 66, 262, 520, 440, { fold: 50 });
      text(x, 'PIANO', 100, 330, 40, { fam: F.grotesk(700) });
      text(x, 'v1 · fatture', 250, 330, 20, { fam: F.mono(500), color: '#6e6a78' });
      items.forEach((it, i) => {
        const y = 392 + i * 62;
        const tt = lerp(w.hours! + 0.1, w.plan! + 0.2, i / (items.length - 1));
        rr(x, 100, y - 30, 40, 40, 6); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
        tick(x, 121, y - 10, 34, clamp((t - tt) / 0.18), GREEN, 7);
        text(x, `${i + 1}. ${it}`, 162, y, 30, { fam: F.grotesk(600), color: t >= tt ? INK : '#8a8592' });
      });
    });
    // the clock spins through the hours
    const cx = 830, cy = 420;
    const run = Math.max(0, t - w.hours!);
    around(x, cx, cy, s, 0.03, () => {
      x.beginPath(); x.arc(cx + 10, cy + 10, 150, 0, TAU); x.fillStyle = INK; x.fill();
      x.beginPath(); x.arc(cx, cy, 150, 0, TAU); x.fillStyle = PAPER; x.fill(); x.lineWidth = 7; x.strokeStyle = INK; x.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        x.beginPath(); x.moveTo(cx + Math.cos(a) * 124, cy + Math.sin(a) * 124); x.lineTo(cx + Math.cos(a) * (i % 3 ? 112 : 102), cy + Math.sin(a) * (i % 3 ? 112 : 102));
        x.lineWidth = i % 3 ? 4 : 7; x.stroke();
      }
      const hand = (a: number, len: number, wd: number) => {
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a - Math.PI / 2) * len, cy + Math.sin(a - Math.PI / 2) * len);
        x.lineWidth = wd; x.lineCap = 'round'; x.strokeStyle = INK; x.stroke();
      };
      const turns = 6 * ease.outCubic(clamp(run / 2.2)); // six hours go by
      hand(TAU * turns, 108, 7);
      hand((TAU * turns) / 12 + 0.6, 70, 11);
      x.beginPath(); x.arc(cx, cy, 10, 0, TAU); x.fillStyle = RED; x.fill();
    });
    const b = pop(t, w.hours! + 0.5, 0.3);
    around(x, cx + 120, cy + 150, Math.min(s, b), 0.1, () => pill(x, cx + 120, cy + 150, '+6 ORE', { size: 30, fam: F.grotesk(700), fill: YELLOW }));
    stamp(x, 330, 640, 'ZERO DERIVE', t, w.plan! + 0.25, { color: GREEN, size: 38, rot: -0.08, fill: 'rgba(255,253,245,0.85)' });
  }

  override post(t: number): PostOverrides {
    const b = bump(t, this.w.jump! + 0.45, 0.2) + 0.6 * bump(t, this.w.sign! + 0.6, 0.18);
    return { shake: [8 * b * Math.sin(t * 91), 6 * b * Math.cos(t * 73)], zoom: 1 + 0.01 * b };
  }
}
