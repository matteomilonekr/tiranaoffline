// PLATE 1 `hook` — "Non fare vibe coding con Claude Code prima di aver installato questi quattro plugin."
// The request is typed and ready in the terminal, Enter not hit yet. On "Non" a level-crossing barrier slams
// down across the terminal (its lamps start to blink, the beacon on the counter turns), on "vibe" the
// request is struck through, on "installato" the terminal answers "bloccato: 0 plugin installati", and on
// "quattro plugin" the power strip pops in top right, still empty: PLUGIN 0/4.
import {
  Plate, Gestures, wordAt, terminal, rr, bump, pop, prog, ease, lerp, INK, RED, COUNTER_Y, TAU, powerStrip,
  type PostOverrides,
} from './_stage';

const POST_X = 968, PIVOT_Y = 560, ARM = 860;

export default class Hook extends Plate {
  tNon = 0; tVibe = 0; tInst = 0; tFour = 0;

  override setup() {
    const ly = this.ly;
    this.tNon = wordAt(ly, 'Non').start;
    this.tVibe = wordAt(ly, 'vibe').start;
    this.tInst = wordAt(ly, 'installato').start;
    this.tFour = wordAt(ly, 'quattro').start;
    this.gest = new Gestures([[-1, 'stop'], [this.tFour - 0.15, 'pointUp']]);
    this.tags = [[-1, 'PRIMA DI PREMERE INVIO']];
  }

  override back(x: CanvasRenderingContext2D, t: number) {
    terminal(x, 56, 290, 690, 360, t, {
      title: 'claude — ~/saas',
      lines: [
        { s: '* Benvenuto in Claude Code!', at: -1, box: '#e8743c', col: '#f4a273' },
        { s: '> costruiscimi un SaaS', at: -1, strike: this.tVibe, dy: 16 },
        { s: '  nel weekend', at: -1, strike: this.tVibe + 0.12 },
        { s: 'x bloccato — 0 plugin installati', at: this.tInst, col: '#ff6b5b', bold: true, dy: 8, cps: 70 },
      ],
    });
    this.barrier(x, t);
  }

  barrier(x: CanvasRenderingContext2D, t: number) {
    // the post, its lamps on a crossbar, and the striped arm (up until "Non", then down with a bounce)
    x.fillStyle = INK; x.fillRect(POST_X - 20, PIVOT_Y - 230, 40, COUNTER_Y - PIVOT_Y + 230);
    x.fillStyle = '#f4f1ea'; x.fillRect(POST_X - 13, PIVOT_Y - 224, 26, COUNTER_Y - PIVOT_Y + 224);
    for (let y = PIVOT_Y - 200; y < COUNTER_Y; y += 70) { x.fillStyle = RED; x.fillRect(POST_X - 13, y, 26, 35); }
    rr(x, POST_X - 90, PIVOT_Y - 250, 180, 36, 8); x.fillStyle = INK; x.fill();
    const on = t >= this.tNon;
    for (const [i, lx] of [[0, POST_X - 56], [1, POST_X + 56]] as const) {
      const lit = on && Math.floor((t - this.tNon) * 3) % 2 === i;
      if (lit) {
        const g = x.createRadialGradient(lx, PIVOT_Y - 270, 10, lx, PIVOT_Y - 270, 120);
        g.addColorStop(0, 'rgba(255,90,60,0.55)'); g.addColorStop(1, 'rgba(255,90,60,0)');
        x.fillStyle = g; x.fillRect(lx - 120, PIVOT_Y - 390, 240, 240);
      }
      x.beginPath(); x.arc(lx, PIVOT_Y - 270, 32, 0, TAU);
      x.fillStyle = lit ? '#ff5a3c' : '#6b2a22'; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
      if (lit) { x.beginPath(); x.arc(lx - 9, PIVOT_Y - 280, 9, 0, TAU); x.fillStyle = 'rgba(255,255,255,0.7)'; x.fill(); }
    }
    const k = t < this.tNon ? 0 : ease.outBack(prog(t, this.tNon, this.tNon + 0.38), 1.4);
    const ang = lerp(-Math.PI / 2 + 0.02, -Math.PI, k);
    x.save();
    x.translate(POST_X, PIVOT_Y);
    x.rotate(ang);
    rr(x, -10, -24, ARM, 48, 10); x.fillStyle = '#ffffff'; x.fill();
    x.save(); x.clip();
    x.fillStyle = RED;
    for (let s = 20; s < ARM; s += 110) { x.beginPath(); x.moveTo(s, -30); x.lineTo(s + 55, -30); x.lineTo(s + 15, 30); x.lineTo(s - 40, 30); x.closePath(); x.fill(); }
    x.restore();
    rr(x, -10, -24, ARM, 48, 10); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    x.restore();
    x.beginPath(); x.arc(POST_X, PIVOT_Y, 26, 0, TAU); x.fillStyle = '#6d6a74'; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
  }

  override front(x: CanvasRenderingContext2D, t: number) {
    // a beacon on the counter, turning once the barrier is down
    const bx = 130, by = COUNTER_Y - 8;
    const on = t >= this.tNon;
    if (on) {
      const a = (t - this.tNon) * 7;
      x.save();
      x.globalCompositeOperation = 'lighter';
      for (const s of [0, Math.PI]) {
        const dir = a + s, k = 0.5 + 0.5 * Math.cos(dir);
        x.beginPath(); x.moveTo(bx, by - 70);
        x.arc(bx, by - 70, 330, -Math.PI / 2 + Math.sin(dir) * 1.2 - 0.25, -Math.PI / 2 + Math.sin(dir) * 1.2 + 0.25);
        x.closePath(); x.fillStyle = `rgba(255,150,40,${0.22 * k})`; x.fill();
      }
      x.restore();
    }
    rr(x, bx - 58, by - 26, 116, 30, 6); x.fillStyle = '#2d2b32'; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.moveTo(bx - 46, by - 26); x.lineTo(bx - 46, by - 80); x.arc(bx, by - 80, 46, Math.PI, 0); x.lineTo(bx + 46, by - 26); x.closePath();
    const lit = on ? 0.5 + 0.5 * Math.cos((t - this.tNon) * 7) : 0;
    x.fillStyle = on ? `rgb(255,${Math.round(140 + 60 * lit)},40)` : '#c4772f'; x.fill(); x.lineWidth = 6; x.stroke();
    x.beginPath(); x.ellipse(bx - 16, by - 92, 9, 16, 0.3, 0, TAU); x.fillStyle = 'rgba(255,255,255,0.65)'; x.fill();
  }

  override hud(x: CanvasRenderingContext2D, t: number) {
    const s = pop(t, this.tFour, 0.4);
    if (s > 0) powerStrip(x, t, this.plugAt, { s });
  }

  override post(t: number): PostOverrides {
    const b = bump(t, this.tNon + 0.3, 0.22);
    return { shake: [9 * b * Math.sin(t * 90), 7 * b * Math.cos(t * 77)], zoom: 1 + 0.012 * b };
  }
}
