// PLATE 4 `adhd` — "Il terzo è i-have-adhd, che impedisce a Claude di seppellire la risposta. / Niente «ottima
// domanda», niente «spero ti sia utile». / Prima la prossima azione, passi numerati, e liste di massimo cinque punti."
// Plug 3 drops in on "i-have-adhd". Beats on the yellow wall:
//  1. the answer, on its card; from "impedisce" slips of filler rain down and bury it ("seppellire");
//  2. "Niente «ottima domanda»": that slip flies into a shredder, then "spero ti sia utile" does; the rest
//     of the pile falls away and the answer is back; a sticky note states the rule;
//  3. "Prima la prossima azione": the reply as the plugin makes Claude write it: the action first, in a box,
//     then numbered steps; "massimo cinque punti" is stamped on.
import {
  Plate, Gestures, wordAt, terminal, card, rr, text, tick, stamp, sticky, pill, life, pop, bump, around,
  sparkle, prog, ease, clamp, lerp, hash, measure, INK, RED, GREEN, YELLOW, PAPER, F, TAU, H,
  type PostOverrides,
} from './_stage';

const FILLER = ['Ottima domanda!', 'Fammi pensare un attimo…', 'Ci sono vari aspetti da considerare.', 'Spero ti sia utile!',
  'In sintesi…', 'Fammi sapere se vuoi approfondire.', 'Domanda interessante!', 'Facciamo un passo indietro.'];
const ANS = { cx: 600, cy: 590 };
const SHRED = { x: 64, y: 330, w: 330 };

export default class Adhd extends Plate {
  w: Record<string, number> = {};
  fallAt: number[] = [];
  shredAt: Record<number, number> = {};
  clearAt = 0;

  override setup() {
    const ly = this.ly, T0 = this.T0;
    const at = (q: string, after = T0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.adhd = at('i-have-adhd');
    w.imped = at('impedisce');
    w.sepp = at('seppellire');
    w.risp = at('risposta');
    w.niente = at('Niente');
    w.ottima = at('ottima');
    w.niente2 = at('niente', w.ottima);
    w.spero = at('spero');
    w.utile = wordAt(ly, 'utile', w.spero).end;
    w.prima = at('Prima', w.utile);
    w.prossima = at('prossima', w.prima);
    w.passi = at('passi', w.prima);
    w.numerati = at('numerati', w.prima);
    w.cinque = at('cinque', w.prima);
    // two slips drift down on "impedisce", the rest pour on "seppellire"
    this.fallAt = FILLER.map((_, i) => (i < 2 ? w.imped + 0.1 + i * 0.35 : w.sepp - 0.1 + (i - 2) * 0.1));
    this.shredAt = { 0: w.ottima - 0.05, 3: w.spero - 0.05 };
    this.clearAt = w.utile + 0.1;
    this.gest = new Gestures([
      [T0, 'idle'], [w.adhd - 0.1, 'pointUp'], [w.imped, 'idle'], [w.sepp, 'shrug'], [w.niente, 'stop'],
      [w.niente2, 'stopR'], [this.clearAt, 'thumb'], [w.prima, 'pointUpL'], [w.passi, 'presentR'], [w.cinque, 'both'],
    ]);
    this.tags = [[T0, '03 · I-HAVE-ADHD'], [w.niente - 0.1, 'ZERO PREAMBOLI'], [w.prima - 0.1, "PRIMA L'AZIONE"]];
  }

  override back(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    if (t < w.prima) {
      const s = life(t, this.T0 + 0.15, w.prima - 0.05);
      this.answer(x, t, s);
      this.pile(x, t, s);
      if (t >= w.niente - 0.1) {
        this.shredder(x, t, life(t, w.niente - 0.1, w.prima - 0.05));
        sticky(x, 850, 380, 300, 210, 0.05, ['REGOLA:', 'niente preamboli,', 'niente riassunti,', 'niente saluti.'],
          { size: 25, s: Math.min(s, pop(t, w.niente + 0.15)) });
      }
    } else this.reply(x, t, life(t, w.prima - 0.05));
  }

  answer(x: CanvasRenderingContext2D, t: number, s: number) {
    const back = bump(t, this.clearAt + 0.45, 0.6);
    around(x, ANS.cx, ANS.cy, s * (1 + 0.08 * back), -0.02, () => {
      card(x, ANS.cx - 390, ANS.cy - 62, 780, 124, { fill: '#e7f8ec', r: 14, shadow: 10 });
      rr(x, ANS.cx - 390, ANS.cy - 62, 780, 124, 14); x.lineWidth = 7; x.strokeStyle = GREEN; x.stroke();
      pill(x, ANS.cx - 290, ANS.cy - 62, 'LA RISPOSTA', { size: 22, fill: '#9ff0c3' });
      text(x, '✓ npm i jsonwebtoken@latest', ANS.cx, ANS.cy + 14, 37, { fam: F.mono(700), color: '#126b44', align: 'center' });
    });
    if (back > 0) for (let i = 0; i < 6; i++) sparkle(x, ANS.cx + Math.cos(i * 1.05) * (360 + 60 * (1 - back)), ANS.cy + Math.sin(i * 1.05) * (90 + 40 * (1 - back)), 18 * back, back, YELLOW);
  }

  // the filler slips: fall onto the answer, two of them are shredded, the rest fall away
  pile(x: CanvasRenderingContext2D, t: number, s: number) {
    if (s <= 0) return;
    const fam = F.grotesk(600), size = 32;
    FILLER.forEach((f, i) => {
      const t0 = this.fallAt[i]!;
      if (t < t0) return;
      const sw = measure(f, fam, size) + 48, sh = 72;
      // resting place on the pile
      const rx = ANS.cx + (hash(i, 11) - 0.5) * 220, ry = ANS.cy + 34 - i * 20;
      const rot = (hash(i, 12) - 0.5) * 0.36;
      const k = ease.outBack(prog(t, t0, t0 + 0.42), 1.1);
      let px = lerp(rx + (hash(i, 13) - 0.5) * 200, rx, k), py = lerp(-120, ry, k), r = lerp(rot * 3, rot, k), sc = 1;
      const tS = this.shredAt[i];
      if (tS !== undefined && t >= tS) {
        // lifted off the pile and fed into the shredder's slot
        const u = ease.inOutCubic(prog(t, tS, tS + 0.35));
        const slotX = SHRED.x + SHRED.w / 2, slotY = SHRED.y - 4;
        px = lerp(px, slotX, u); py = lerp(py, slotY - sh / 2, u); r = lerp(r, 0, u);
        const feed = prog(t, tS + 0.35, tS + 0.8);
        if (feed >= 1) return;
        if (feed > 0) {
          x.save();
          x.beginPath(); x.rect(0, 0, 1080, slotY); x.clip();
          py += feed * (sh + 10);
          around(x, px, py, s, r, () => this.slip(x, f, px, py, sw, sh, fam, size));
          x.restore();
          return;
        }
      } else if (t >= this.clearAt) {
        // the rest of the pile drops off the frame
        const u = t - this.clearAt - i * 0.03;
        if (u > 0) { py += 1800 * u * u; r += (hash(i, 14) - 0.5) * 3 * u; px += (hash(i, 15) - 0.5) * 300 * u; }
        if (py > H + 100) return;
      }
      around(x, px, py, s * sc, r, () => this.slip(x, f, px, py, sw, sh, fam, size));
    });
  }

  slip(x: CanvasRenderingContext2D, f: string, px: number, py: number, sw: number, sh: number, fam: string, size: number) {
    card(x, px - sw / 2, py - sh / 2, sw, sh, { fill: '#ffffff', r: 4, shadow: 6, line: 4 });
    text(x, f, px, py + size * 0.36, size, { fam, color: '#3b3842', align: 'center' });
  }

  shredder(x: CanvasRenderingContext2D, t: number, s: number) {
    const { x: x0, y: y0, w: sw } = SHRED;
    around(x, x0 + sw / 2, y0 + 120, s, 0, () => {
      // the bin and its strips
      rr(x, x0 + 18, y0 + 150, sw - 36, 210, 10); x.fillStyle = '#d7d2c8'; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
      x.save(); rr(x, x0 + 18, y0 + 150, sw - 36, 210, 10); x.clip();
      for (const [i, tS] of Object.entries(this.shredAt)) {
        const k = prog(t, tS + 0.4, tS + 0.9);
        for (let j = 0; j < 22 && k > 0; j++) {
          const sx = x0 + 34 + (hash(+i, j) * (sw - 70)), len = 30 + 50 * hash(j, +i, 2);
          const sy = y0 + 150 + lerp(-40, 150 + 40 * hash(j, 5) - (+i) * 20, k);
          x.save(); x.translate(sx, sy); x.rotate((hash(j, +i, 3) - 0.5) * 0.9);
          x.fillStyle = '#ffffff'; x.fillRect(-4, -len / 2, 8, len); x.lineWidth = 2; x.strokeStyle = INK; x.strokeRect(-4, -len / 2, 8, len);
          x.restore();
        }
      }
      x.restore();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3;
      for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(x0 + 18 + i * (sw - 36) / 6, y0 + 150); x.lineTo(x0 + 18 + i * (sw - 36) / 6, y0 + 360); x.stroke(); }
      // the head with its slot
      const shake = 3 * Math.sin(t * 70) * Object.values(this.shredAt).reduce((a, tS) => a + (t > tS + 0.35 && t < tS + 0.85 ? 1 : 0), 0);
      card(x, x0 + shake, y0, sw, 150, { fill: '#3a3842', r: 14, shadow: 8 });
      rr(x, x0 + 30 + shake, y0 - 8, sw - 60, 16, 6); x.fillStyle = INK; x.fill();
      text(x, 'P-4 CROSS-CUT', x0 + 26 + shake, y0 + 62, 22, { fam: F.mono(700), color: '#d7d2c8' });
      pill(x, x0 + sw - 70 + shake, y0 + 104, 'AUTO', { size: 18, fill: '#9ff0c3' });
      x.beginPath(); x.arc(x0 + 40 + shake, y0 + 104, 9, 0, TAU); x.fillStyle = '#2ed37d'; x.fill();
    });
  }

  // 3 — the reply as i-have-adhd has Claude write it
  reply(x: CanvasRenderingContext2D, t: number, s: number) {
    const w = this.w;
    around(x, 540, 490, s, 0, () => {
      terminal(x, 56, 262, 968, 460, t, {
        title: 'claude — ~/app · i-have-adhd', size: 26,
        lines: [
          { s: 'ORA › npm i jsonwebtoken@latest', at: w.prima! - 0.02, box: YELLOW, col: '#ffe17a', bold: true, cps: 70 },
          { s: '      poi modifica src/auth.ts:42', at: w.prossima! + 0.15, cps: 70 },
          { s: '1. Sostituisci verifyToken (r. 42-58)', at: w.passi! - 0.05, dy: 18, cps: 70 },
          { s: '2. Esegui npm test -- auth.spec.ts', at: w.passi! + 0.3, cps: 70 },
          { s: '3. Apri src/auth.ts e ricontrolla', at: w.numerati! + 0.25, cps: 70 },
        ],
      });
      const b = pop(t, w.prima! + 0.35, 0.3);
      around(x, 900, 336, b, 0.08, () => pill(x, 900, 336, 'ADESSO', { size: 22, fill: YELLOW }));
      // five slots, the limit
      for (let i = 0; i < 5; i++) {
        const on = t >= w.cinque! + i * 0.06;
        x.beginPath(); x.arc(616 + i * 44, 664, 14, 0, TAU);
        x.fillStyle = on ? (i < 3 ? GREEN : '#4a4852') : '#2a2930'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#8d8a96'; x.stroke();
      }
    });
    stamp(x, 820, 780, 'MAX 5 PUNTI', t, w.cinque! + 0.2, { color: RED, size: 44, rot: -0.1, fill: 'rgba(255,253,245,0.92)' });
  }

  override post(t: number): PostOverrides {
    const b = 0.6 * bump(t, this.w.sepp! + 0.35, 0.25) + bump(t, this.w.cinque! + 0.2, 0.2);
    return { shake: [7 * b * Math.sin(t * 83), 6 * b * Math.cos(t * 67)], zoom: 1 + 0.01 * b };
  }
}
