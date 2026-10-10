// PLATE 6 `cta` — "Se vuoi provarli tutti, commenta SENIOR e ti mando i link in privato."
// The power strip comes down from the corner to the middle, big, all four plugs in, their names under them:
// 4 SU 4 INSTALLATI. On "commenta" it moves up and a comment box comes in; SENIOR is typed on "SENIOR" and
// sent (a heart pops). On "mando" the reply arrives in the inbox: the four links, one chip each.
import {
  Plate, Gestures, wordAt, card, text, pill, pillW, life, pop, bump, around, sparkle, powerStrip, prog, ease,
  lerp, typed, INK, RED, YELLOW, PAPER, PLUG, F, W, HUD_Y, TAU,
} from './_stage';

const LINKS = ['superpowers', 'karpathy-skills', 'i-have-adhd', 'claude-octopus'];

export default class Cta extends Plate {
  w: Record<string, number> = {};

  override setup() {
    const ly = this.ly, T0 = this.T0;
    const at = (q: string, after = T0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.tutti = at('tutti');
    w.commenta = at('commenta');
    w.senior = at('SENIOR');
    w.seniorEnd = wordAt(ly, 'SENIOR', T0).end;
    w.mando = at('mando');
    w.link = at('link', w.mando);
    w.privato = at('privato');
    this.gest = new Gestures([[T0, 'both'], [w.commenta - 0.1, 'pointUp'], [w.mando, 'presentR'], [w.privato, 'thumb']]);
    this.tags = [[T0, '4 SU 4 INSTALLATI'], [w.commenta - 0.1, 'COMMENTA SENIOR'], [w.mando - 0.1, 'I LINK IN DM']];
  }

  // the big strip replaces the HUD's
  override hud(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    const a = ease.inOutCubic(prog(t, this.T0, this.T0 + 0.6));
    const b = ease.inOutCubic(prog(t, w.commenta! - 0.15, w.commenta! + 0.35));
    const cx = lerp(lerp(W - 226, 540, a), 540, b), cy = lerp(lerp(HUD_Y, 470, a), 300, b), s = lerp(lerp(1, 2.4, a), 1.6, b);
    powerStrip(x, t, this.plugAt, { cx, cy, s, labels: a > 0.5 });
    const fl = bump(t, this.T0 + 0.6, 0.8);
    for (let i = 0; i < 10 && fl > 0; i++) {
      const ang = (i / 10) * TAU, r = 300 + 140 * (1 - fl);
      sparkle(x, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.5, 22 * fl, fl, i % 2 ? YELLOW : '#ffffff');
    }
  }

  override back(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    this.comment(x, t, life(t, w.commenta! - 0.05));
    this.dm(x, t, life(t, w.mando! - 0.1));
  }

  comment(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w, y0 = 404;
    around(x, 540, y0 + 60, s, -0.015, () => {
      card(x, 70, y0, 940, 120, { fill: PAPER, r: 60, shadow: 9, line: 5 });
      // a generic avatar
      x.beginPath(); x.arc(140, y0 + 60, 36, 0, TAU); x.fillStyle = '#cfc9d9'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
      x.save(); x.beginPath(); x.arc(140, y0 + 60, 36, 0, TAU); x.clip();
      x.fillStyle = '#8d879a'; x.beginPath(); x.arc(140, y0 + 50, 13, 0, TAU); x.fill(); x.beginPath(); x.ellipse(140, y0 + 92, 26, 22, 0, 0, TAU); x.fill();
      x.restore();
      const typedS = typed('SENIOR', t, w.senior! - 0.02, 16);
      if (!typedS) text(x, 'Aggiungi un commento…', 200, y0 + 72, 32, { fam: F.grotesk(500), color: '#9a96a3' });
      else text(x, typedS, 200, y0 + 78, 50, { fam: F.grotesk(700) });
      if (typedS && typedS.length < 6 && Math.floor(t * 3) % 2 === 0) { x.fillStyle = INK; x.fillRect(206 + typedS.length * 37, y0 + 34, 4, 54); }
      const sent = t >= w.seniorEnd! + 0.1;
      text(x, 'Pubblica', 950, y0 + 72, 30, { fam: F.grotesk(700), color: sent ? '#9a96a3' : '#3a6ee8', align: 'right' });
    });
    // the heart, once sent
    const h = pop(t, w.seniorEnd! + 0.15, 0.35);
    if (h > 0) {
      const hx = 940, hy = y0 - 6, r = 30 * h * (1 + 0.25 * bump(t, w.seniorEnd! + 0.15, 0.3));
      x.save(); x.translate(hx, hy); x.rotate(0.15);
      x.beginPath();
      x.moveTo(0, r * 0.9);
      x.bezierCurveTo(-r * 1.6, -r * 0.2, -r * 0.7, -r * 1.3, 0, -r * 0.45);
      x.bezierCurveTo(r * 0.7, -r * 1.3, r * 1.6, -r * 0.2, 0, r * 0.9);
      x.fillStyle = RED; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
      x.restore();
    }
  }

  dm(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w, y0 = 556;
    around(x, 540, y0 + 66, s, 0.01, () => {
      card(x, 70, y0, 940, 140, { fill: '#efe8ff', r: 26, shadow: 9, line: 5 });
      x.beginPath(); x.moveTo(110, y0 + 140); x.lineTo(96, y0 + 172); x.lineTo(150, y0 + 140); x.closePath();
      x.fillStyle = '#efe8ff'; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
      x.fillStyle = '#efe8ff'; x.fillRect(104, y0 + 132, 50, 9);
      text(x, 'Messaggio · ecco i link:', 104, y0 + 48, 28, { fam: F.mono(700), color: '#5b3fb5' });
      let px = 104;
      LINKS.forEach((l, i) => {
        const k = pop(t, w.link! - 0.25 + i * 0.12, 0.3);
        const lw = pillW(l, 22);
        around(x, px + lw / 2, y0 + 96, k, 0, () => pill(x, px + lw / 2, y0 + 96, l, { size: 22, fill: PLUG[i]!, ink: '#ffffff' }));
        px += lw + 12;
      });
    });
  }
}
