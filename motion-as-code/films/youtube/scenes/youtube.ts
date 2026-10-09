// The whole of `youtube`, one plate: the format of @ai.nxtlvl's reel on the YouTube Agent Skill, shot for shot,
// in Italian, on the look in _soft.ts. Cream chapters for the hook and the skills, a coral one for "eleven", a
// dark one for virality, cream again for the close. The shots cut on the words.
// What the skills do, as their README says (October 2026): eleven `yt-*` skills, MIT. They write: scripts with
// scored hooks, title-and-thumbnail checks, an edit decision list from a transcript (not the cuts themselves),
// drafted comment replies, a weekly plan, outliers in a niche ranked against each channel's median. Nothing is
// published: "these skills write, you upload". The text says so instead of the original's "edits your videos".
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT } from '@kit/engine/gl';
import type { Lyrics } from '@kit/engine/lyrics';
import {
  W, H, F, TAU, INK, CORAL, CORAL_L, MUTED, GREEN, RED, clamp, ease, hash, lerp, k, pop, rr, txt, tw, at, blurIn,
  wordAt, card, tick, cream, coral, dark, cmdPill, title2, sparkTile, spark, playTile, chunks, caption, type Said,
} from './_soft';

const CUT_LEAD = 0.16;
// shots whose block sits high in the frame come down a little
const DY: Record<string, number> = { hook: 60, name: 110, comment2: 240 };
type Shot = { id: string; t0: number; t1: number; mode: 'cream' | 'coral' | 'dark' };

/** A thumbnail tile: a coloured block with a big caption. */
function thumb(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, bg: string, s: string[], col: string) {
  rr(x, x0, y0, w, h, 14); x.fillStyle = bg; x.fill();
  s.forEach((l, i) => txt(x, l, x0 + w / 2, y0 + h / 2 + (i - (s.length - 1) / 2) * 40 + 14, 36, F.archivo(100, 900), col, { align: 'center' }));
}
/** A waveform of n bars across w. */
function wave(x: CanvasRenderingContext2D, x0: number, cy: number, w: number, hmax: number, n: number, col: string, t: number, seed = 1) {
  x.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const v = 0.15 + 0.85 * Math.abs(Math.sin(i * 0.7 + seed) * Math.cos(i * 0.23 + t * 2 + seed));
    const bh = Math.max(4, v * hmax);
    rr(x, x0 + i * (w / n), cy - bh / 2, Math.max(2, w / n - 3), bh, 2); x.fill();
  }
}

export default class Youtube extends Scene {
  layer = new Layer2D();
  ly!: Lyrics;
  w: Record<string, number> = {};
  cuts: number[] = [];
  shots: Shot[] = [];
  caps: Said[][] = [];

  override init() {
    const ly = (this.ly = this.ctx.lyrics);
    const cut = (i: number) => {
      const l = ly.lines[i]!, p = ly.lines[i - 1];
      return Math.max(l.words[0]!.start - CUT_LEAD, p ? Math.min(p.end + 0.02, l.words[0]!.start - 0.02) : 0);
    };
    const c = (this.cuts = ly.lines.map((_, i) => cut(i)));
    const a = (q: string, after = 0) => wordAt(ly, q, after).start;
    const w = this.w;
    w.lavorare = a('lavorare'); w.tutto = a('tutto'); w.canale = a('canale'); w.gratis = a('gratis');
    w.chiama = a('chiama'); w.skillname = a('Skill');
    w.sola = a('sola'); w.undici = a('undici'); w.ventuno = a('ventuno'); w.formule = a('formule');
    w.titoli = a('titoli'); w.copertine = a('copertine'); w.tagli = a('tagli'); w.risposte = a('risposte'); w.commenti = a('commenti');
    w.pianifica = a('pianifica'); w.strategia = a('strategia');
    w.pazzesca = a('pazzesca'); w.viralita = a('viralità');
    w.trova = a('Trova'); w.virali = a('virali'); w.nicchia = a('nicchia'); w.mostra = a('mostra'); w.funzionato = a('funzionato');
    w.rifarli = a('rifarli'); w.voce = a('voce'); w.pubblico = a('pubblico', c[10]!);
    w.indovinare = a('indovinare'); w.tirare = a('tirare'); w.scrive = a('scrive', c[12]!); w.carichi = a('carichi');
    w.dieci = a('dieci'); w.apri = a('apri'); w.incolli = a('incolli'); w.fatto = a('fatto');
    w.youtube = a('YOUTUBE', c[15]!); w.mando = a('mando'); w.guida = a('guida');

    const S = (id: string, t0: number, mode: Shot['mode'] = 'cream'): Shot => ({ id, t0, t1: 0, mode });
    const list = [
      S('hook', 0), S('name', c[1]!), S('eleven', c[2]!, 'coral'),
      S('script', c[3]!), S('pack', c[4]!), S('edit', c[5]!), S('comment', c[6]!), S('plan', c[7]!),
      S('craziest', c[8]!, 'dark'), S('virality', w.viralita - 0.12, 'dark'),
      S('search', c[9]!, 'dark'), S('rebuild', c[10]!, 'dark'),
      S('guess', Math.max(c[11]!, w.tirare - 0.2)), S('upload', c[12]!), S('setup', c[13]!), S('comment2', c[15]!),
    ];
    list.forEach((s, i) => (s.t1 = list[i + 1]?.t0 ?? this.ctx.end));
    this.shots = list;
    this.caps = chunks(ly.words);
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
    if (s.mode === 'cream') cream(x, t, this.shots.indexOf(s) % 3);
    else if (s.mode === 'coral') coral(x, t);
    else dark(x, t);
    // a gentle push-in through each shot, and a soft whip at the cut
    const u = clamp((t - s.t0) / Math.max(0.5, s.t1 - s.t0));
    const whip = 1 - ease.outCubic(k(t, s.t0, 0.22));
    x.save();
    x.translate(W / 2, H * 0.45); x.scale(1 + 0.03 * u + 0.04 * whip, 1 + 0.03 * u + 0.04 * whip); x.translate(-W / 2, -H * 0.45);
    if (whip > 0.02 && s.t0 > 0) x.filter = `blur(${(whip * 8).toFixed(2)}px)`;
    x.translate(0, DY[s.id] ?? 0);
    (this as unknown as Record<string, (x: CanvasRenderingContext2D, t: number, s: Shot) => void>)[s.id]!.call(this, x, t, s);
    x.restore();
    caption(x, t, this.caps, s.mode);
    comp.draw(renderer, L.upload(), out);
    return { bloom: s.mode === 'dark' ? 0.25 : 0.06, bloomThreshold: 0.8, halation: 0, ca: 0, grain: 0.035, vignette: s.mode === 'dark' ? 0.3 : 0.06, hud: 0 };
  }

  // ---------------------------------------------------------------- the shots
  hook(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    const lx = 290, rx = 790, iy = 330, s = 190;
    const link = ease.inOutCubic(k(t, 0.35, 0.45));
    x.strokeStyle = CORAL; x.lineWidth = 5; x.beginPath(); x.moveTo(lx + s / 2, iy); x.lineTo(lerp(lx + s / 2, rx - s / 2, link), iy); x.stroke();
    blurIn(x, t, 0.0, 0.35, () => { sparkTile(x, lx, iy, s); txt(x, 'Claude', lx, iy + s / 2 + 52, 34, F.poppins(600), INK, { align: 'center' }); }, 0);
    blurIn(x, t, 0.15, 0.35, () => { playTile(x, rx, iy, s); txt(x, 'YouTube', rx, iy + s / 2 + 52, 34, F.poppins(600), INK, { align: 'center' }); }, 0);
    const ce = pop(t, 0.75, 0.3);
    at(x, (lx + rx) / 2, iy, ce, 0, () => { rr(x, (lx + rx) / 2 - 120, iy - 32, 240, 64, 32); x.fillStyle = '#1e1c1a'; x.fill(); tick(x, (lx + rx) / 2 - 76, iy, 20, GREEN, 5); txt(x, 'Collegato', (lx + rx) / 2 + 14, iy + 12, 30, F.poppins(600), '#ffffff', { align: 'center' }); });
    // the channel card: each row flips from "Manuale" to "Claude" as the line goes on
    blurIn(x, t, 0.5, 0.4, () => {
      const cx0 = 110, cy0 = 640, cw = 860, ch = 620;
      card(x, cx0, cy0, cw, ch);
      x.beginPath(); x.arc(cx0 + 60, cy0 + 66, 24, 0, TAU); x.fillStyle = CORAL; x.fill();
      x.beginPath(); x.moveTo(cx0 + 52, cy0 + 54); x.lineTo(cx0 + 72, cy0 + 66); x.lineTo(cx0 + 52, cy0 + 78); x.closePath(); x.fillStyle = '#ffffff'; x.fill();
      txt(x, 'Il tuo canale', cx0 + 104, cy0 + 66, 36, F.poppins(700), INK);
      txt(x, 'accesso completo', cx0 + 104, cy0 + 100, 22, F.poppins(500), MUTED);
      const rows = ['Video', 'Titoli', 'Copertine', 'Commenti', 'Analisi', 'Piano contenuti'];
      const span = Math.max(0.5, w.gratis - w.lavorare);
      rows.forEach((r, i) => {
        const ry = cy0 + 170 + i * 74;
        x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(cx0 + 40, ry - 46, cw - 80, 2);
        txt(x, r, cx0 + 44, ry, 32, F.poppins(500), '#3a3633');
        const on = t >= w.lavorare + (i / rows.length) * span;
        const e = on ? ease.outBack(k(t, w.lavorare + (i / rows.length) * span, 0.25), 2) : 0;
        const bw = 170, bx = cx0 + cw - 44 - bw;
        if (e > 0) at(x, bx + bw / 2, ry - 10, e, 0, () => { rr(x, bx, ry - 34, bw, 48, 24); x.fillStyle = CORAL; x.fill(); txt(x, 'Claude', bx + bw / 2 - 12, ry - 1, 26, F.poppins(600), '#ffffff', { align: 'center' }); tick(x, bx + bw - 30, ry - 10, 14, '#ffffff', 3.5); });
        else { rr(x, bx, ry - 34, bw, 48, 24); x.fillStyle = '#ece8e3'; x.fill(); txt(x, 'Manuale', bx + bw / 2, ry - 1, 26, F.poppins(500), '#9a948e', { align: 'center' }); }
      });
    });
    const st = pop(t, w.gratis - 0.05, 0.3, 2.4);
    at(x, 540, 900, st, -0.12, () => {
      rr(x, 230, 830, 620, 140, 16); x.lineWidth = 9; x.strokeStyle = RED; x.stroke(); x.fillStyle = 'rgba(255,255,255,0.92)'; x.fill();
      txt(x, '100% GRATIS', 540, 932, 88, F.archivo(100, 900), RED, { align: 'center' });
    });
  }

  name(x: CanvasRenderingContext2D, t: number, s: Shot) {
    // a burst of soft rays behind the card
    x.save(); x.globalAlpha = 0.25 * k(t, s.t0, 0.4);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + t * 0.1; x.fillStyle = i % 2 ? '#f1c6b6' : '#f7ddd2'; x.beginPath(); x.moveTo(540, 820); x.lineTo(540 + Math.cos(a) * 900, 820 + Math.sin(a) * 900); x.lineTo(540 + Math.cos(a + 0.09) * 900, 820 + Math.sin(a + 0.09) * 900); x.closePath(); x.fill(); }
    x.restore();
    const pe = pop(t, s.t0, 0.3);
    at(x, 540, 470, pe, 0, () => { rr(x, 440, 440, 200, 60, 30); x.fillStyle = '#1e1c1a'; x.fill(); txt(x, 'Si chiama', 540, 481, 28, F.poppins(600), '#ffffff', { align: 'center' }); });
    blurIn(x, t, s.t0 + 0.15, 0.4, () => {
      card(x, 110, 580, 860, 420);
      rr(x, 160, 628, 30, 22, 4); x.fillStyle = CORAL; x.fill();
      txt(x, 'skills / youtube-agent', 206, 648, 26, F.mono(600), '#6e6863');
      txt(x, 'YouTube', 160, 760, 92, F.poppins(700), INK);
      txt(x, 'Agent', 160, 860, 92, F.poppins(700), INK);
      if (t >= this.w.skillname - 0.1) blurIn(x, t, this.w.skillname - 0.1, 0.3, () => txt(x, 'Skill', 160 + tw(x, 'Agent ', 92, F.poppins(700)), 862, 104, F.instrument(true), CORAL), 0);
      txt(x, '11 skill per Claude che lavorano al tuo canale.', 160, 922, 28, F.poppins(500), '#5d5853');
      const chips: [string, string, string][] = [['Gratis', CORAL, '#ffffff'], ['11 skill', '#1e1c1a', '#ffffff'], ['Funziona con Claude', '#ece8e3', '#3a3633']];
      let px = 160;
      chips.forEach(([c2, bg, fg], i) => {
        const e = pop(t, s.t0 + 0.7 + i * 0.12, 0.25);
        const cw = tw(x, c2, 24, F.poppins(600)) + 36;
        at(x, px + cw / 2, 966, e, 0, () => { rr(x, px, 946, cw, 42, 21); x.fillStyle = bg; x.fill(); txt(x, c2, px + cw / 2, 975, 24, F.poppins(600), fg, { align: 'center' }); });
        px += cw + 14;
      });
    });
  }

  eleven(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w, flip = t >= w.undici - 0.08;
    blurIn(x, t, s.t0, 0.3, () => {
      txt(x, 'Non è una', 540, 420, 66, F.poppins(600), '#ffffff', { align: 'center' });
      txt(x, 'skill sola.', 540, 500, 76, F.instrument(true), '#ffffff', { align: 'center' });
    }, 0);
    if (!flip) {
      const e = pop(t, s.t0 + 0.2, 0.3);
      at(x, 540, 880, e, 0, () => txt(x, '1', 540, 1010, 340, F.archivo(100, 900), '#ffffff', { align: 'center' }));
      const st = ease.outCubic(k(t, w.sola, 0.25));
      if (st > 0) { x.save(); x.strokeStyle = '#1e1c1a'; x.lineWidth = 22; x.lineCap = 'round'; x.beginPath(); x.moveTo(400, 940); x.lineTo(400 + 280 * st, 940 - 80 * st); x.stroke(); x.restore(); }
    } else {
      const e = ease.outBack(k(t, w.undici - 0.08, 0.35), 2);
      at(x, 540, 900, e, 0, () => {
        txt(x, '11', 540, 1060, 460, F.archivo(100, 900), '#ffffff', { align: 'center' });
        txt(x, 'skill', 540, 1190, 96, F.poppins(700), '#1e1c1a', { align: 'center' });
      });
    }
  }

  script(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w;
    cmdPill(x, t, s.t0, '/yt-script');
    title2(x, t, s.t0 + 0.08, 'Scrive i tuoi', 'script');
    const n = t < w.ventuno - 0.1 ? 0 : Math.min(21, Math.floor((t - w.ventuno + 0.1) * 60));
    blurIn(x, t, s.t0 + 0.2, 0.3, () => txt(x, String(n), 540, 760, 260, F.poppins(700), CORAL, { align: 'center' }), 0);
    if (t >= w.formule - 0.1) blurIn(x, t, w.formule - 0.1, 0.3, () => txt(x, 'formule per gli hook', 540, 840, 40, F.poppins(600), '#5d5853', { align: 'center' }), 0);
    const cards: [string, string][] = [['#3', "L'errore"], ['#7', 'Il segreto'], ['#12', 'Impossibile'], ['#16', 'Prima / dopo'], ['#21', 'Conto alla rovescia']];
    cards.forEach(([nn, label], i) => {
      const t0 = s.t0 + 0.4 + i * 0.22, e = pop(t, t0, 0.3);
      const fx = 540 + (i - 2) * 180, fy = 1140 + Math.abs(i - 2) * 26, rot = (i - 2) * 0.1;
      at(x, fx, fy, e, rot, () => {
        card(x, fx - 125, fy - 95, 250, 190, 18);
        txt(x, '/yt-script', fx - 103, fy - 52, 18, F.mono(500), MUTED);
        txt(x, nn, fx - 103, fy + 14, 64, F.poppins(700), i === 4 ? RED : '#6a4fd6');
        txt(x, label, fx - 103, fy + 62, 22, F.poppins(700), INK);
      });
    });
  }

  pack(x: CanvasRenderingContext2D, t: number, s: Shot) {
    cmdPill(x, t, s.t0, '/yt-package');
    title2(x, t, s.t0 + 0.08, 'Titoli +', 'copertine');
    const rows: [string, string[], string, string][] = [
      ['#24201d', ['HO DATO', 'IL CANALE', "ALL'IA"], CORAL_L, "Ho dato il canale all'IA per 30 giorni"],
      ['#f6cf4a', ['21', 'HOOK'], INK, '21 hook che funzionano davvero'],
      ['#e8443a', ['SMETTI', 'DI FARE', 'COSÌ'], '#ffffff', 'Smetti di fare questa copertina'],
    ];
    rows.forEach(([bg, th, fg, ttl], i) => {
      blurIn(x, t, s.t0 + 0.3 + i * 0.25, 0.35, () => {
        const ry = 600 + i * 250;
        card(x, 90, ry, 900, 220, 22);
        thumb(x, 110, ry + 20, 330, 180, bg, th, fg);
        const words = ttl.split(' '); let l1 = '', l2 = '';
        for (const wd of words) { if (tw(x, l1 + wd, 34, F.poppins(700)) < 480 && !l2) l1 += (l1 ? ' ' : '') + wd; else l2 += (l2 ? ' ' : '') + wd; }
        txt(x, l1, 470, ry + 90, 34, F.poppins(700), INK); if (l2) txt(x, l2, 470, ry + 134, 34, F.poppins(700), INK);
        txt(x, 'Il tuo canale', 470, ry + (l2 ? 178 : 134), 22, F.poppins(500), MUTED);
      });
    });
  }

  edit(x: CanvasRenderingContext2D, t: number, s: Shot) {
    cmdPill(x, t, s.t0, '/yt-edit');
    title2(x, t, s.t0 + 0.08, 'Prepara i', 'tagli');
    blurIn(x, t, s.t0 + 0.25, 0.4, () => {
      const x0 = 120, y0 = 620, ww = 840, hh = 560;
      card(x, x0, y0, ww, hh, 24, '#1f1c1a', 0.25);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c2, i) => { x.beginPath(); x.arc(x0 + 34 + i * 26, y0 + 34, 8, 0, TAU); x.fillStyle = c2; x.fill(); });
      txt(x, 'lista dei tagli', x0 + 130, y0 + 42, 22, F.mono(500), '#8f8a84');
      rr(x, x0 + 30, y0 + 70, ww - 60, 180, 14); x.fillStyle = '#2b2725'; x.fill();
      x.beginPath(); x.arc(540, y0 + 150, 46, 0, TAU); x.fillStyle = '#4a4441'; x.fill(); rr(x, 470, y0 + 196, 140, 60, 30); x.fill();
      wave(x, x0 + 40, y0 + 320, ww - 80, 90, 70, '#a9a3e6', t);
      const segs: [number, number, boolean][] = [[0, 0.16, false], [0.17, 0.42, false], [0.43, 0.5, true], [0.51, 0.72, false], [0.73, 0.8, true], [0.81, 1, false]];
      segs.forEach(([a, b, cutx]) => {
        const sx = x0 + 40 + a * (ww - 80), sw = (b - a) * (ww - 80);
        rr(x, sx, y0 + 400, sw, 100, 10); x.fillStyle = cutx ? RED : (a % 0.3 > 0.15 ? '#e9a48f' : CORAL); x.fill();
        if (cutx) { x.save(); rr(x, sx, y0 + 400, sw, 100, 10); x.clip(); x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 6; for (let i = -4; i < 8; i++) { x.beginPath(); x.moveTo(sx + i * 14, y0 + 400); x.lineTo(sx + i * 14 + 60, y0 + 500); x.stroke(); } x.restore(); }
      });
      const ph = x0 + 40 + ((t - s.t0) * 0.35 % 1) * (ww - 80);
      x.fillStyle = '#f6cf4a'; x.fillRect(ph - 2, y0 + 270, 4, 240);
    });
    for (const [lbl, cx, d] of [['aria morta', 460, 0.6], ['«ehm»', 760, 0.85]] as const) {
      const e = pop(t, s.t0 + d, 0.28, 2.2);
      const ww2 = tw(x, lbl, 28, F.poppins(600)) + 70;
      at(x, cx, 1225, e, 0, () => { rr(x, cx - ww2 / 2, 1200, ww2, 50, 25); x.fillStyle = RED; x.fill(); this.scissors(x, cx - ww2 / 2 + 28, 1225); txt(x, lbl, cx + 16, 1235, 28, F.poppins(600), '#ffffff', { align: 'center' }); });
    }
  }
  scissors(x: CanvasRenderingContext2D, cx: number, cy: number) {
    x.save(); x.strokeStyle = '#ffffff'; x.lineWidth = 3;
    for (const sd of [-1, 1]) { x.beginPath(); x.arc(cx - 6, cy + sd * 7, 5, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(cx - 2, cy + sd * 5); x.lineTo(cx + 12, cy - sd * 6); x.stroke(); }
    x.restore();
  }

  comment(x: CanvasRenderingContext2D, t: number, s: Shot) {
    cmdPill(x, t, s.t0, '/yt-comment');
    title2(x, t, s.t0 + 0.08, 'Risponde ai', 'commenti');
    const cm: [string, string, string, string | null][] = [
      ['#3d6fe0', '@giulia.edits', "Come l'hai configurato?", 'Link nella bio, ci vogliono 2 minuti.'],
      [CORAL, '@sara.crea', 'Che microfono usi?', 'Uno sotto i 50 €: link in descrizione.'],
      ['#7a4fe0', '@marco.dev', 'Pazzesco', null],
    ];
    let y = 600;
    cm.forEach(([col, user, text, reply], i) => {
      const t0 = s.t0 + 0.3 + i * 0.35;
      blurIn(x, t, t0, 0.3, () => {
        card(x, 100, y, 880, 120, 20);
        x.beginPath(); x.arc(160, y + 60, 28, 0, TAU); x.fillStyle = col; x.fill();
        txt(x, user, 210, y + 48, 22, F.poppins(500), MUTED); txt(x, text, 210, y + 88, 32, F.poppins(700), INK);
      });
      y += 140;
      if (reply) {
        const e = pop(t, t0 + 0.3, 0.3, 1.8);
        const rw = tw(x, reply, 26, F.poppins(500)) + 160;
        at(x, 180 + rw / 2, y + 30, e, 0, () => {
          rr(x, 180, y, rw, 62, 18); x.fillStyle = '#1e1c1a'; x.fill();
          spark(x, 214, y + 31, 14, CORAL); txt(x, reply, 244, y + 40, 26, F.poppins(500), '#ffffff');
          rr(x, 180 + rw - 82, y + 15, 66, 32, 16); x.fillStyle = '#3a3633'; x.fill(); txt(x, 'bozza', 180 + rw - 49, y + 38, 18, F.poppins(600), CORAL_L, { align: 'center' });
        });
        y += 92;
      }
    });
  }

  plan(x: CanvasRenderingContext2D, t: number, s: Shot) {
    cmdPill(x, t, s.t0, '/yt-plan');
    title2(x, t, s.t0 + 0.08, 'Pianifica la', 'strategia');
    blurIn(x, t, s.t0 + 0.25, 0.4, () => {
      const x0 = 90, y0 = 600, ww = 900, hh = 600;
      card(x, x0, y0, ww, hh, 24);
      txt(x, 'Ottobre', x0 + 40, y0 + 70, 42, F.poppins(700), INK);
      txt(x, '/yt-plan', x0 + ww - 40, y0 + 68, 24, F.mono(500), MUTED, { align: 'right' });
      const days = ['L', 'M', 'M', 'G', 'V', 'S', 'D'], cw = (ww - 80) / 7;
      days.forEach((d, i) => txt(x, d, x0 + 40 + i * cw + cw / 2, y0 + 130, 24, F.poppins(600), '#6e6863', { align: 'center' }));
      const plan: Record<number, string> = { 2: 'Long', 4: 'Short', 6: 'Short', 9: 'Long', 10: 'Short', 13: 'Short', 16: 'Long', 18: 'Short', 23: 'Long', 25: 'Short' };
      const span = Math.max(0.6, s.t1 - s.t0 - 0.6);
      for (let d = 0; d < 28; d++) {
        const cx = x0 + 40 + (d % 7) * cw, cy = y0 + 160 + Math.floor(d / 7) * 100;
        rr(x, cx + 4, cy, cw - 8, 88, 10); x.fillStyle = '#f4f1ed'; x.fill();
        txt(x, String(d + 1), cx + 16, cy + 28, 18, F.poppins(500), '#a39d97');
        const p = plan[d];
        if (p) {
          const keys = Object.keys(plan).map(Number), idx = keys.indexOf(d);
          const e = pop(t, s.t0 + 0.45 + (idx / keys.length) * span, 0.25, 2);
          at(x, cx + cw / 2, cy + 58, e, 0, () => { rr(x, cx + 14, cy + 42, cw - 28, 32, 8); x.fillStyle = p === 'Long' ? '#1e1c1a' : CORAL; x.fill(); txt(x, p, cx + cw / 2, cy + 65, 18, F.poppins(600), '#ffffff', { align: 'center' }); });
        }
      }
    });
  }

  craziest(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const u = ease.outCubic(k(t, s.t0, 0.6));
    // a dark planet rising, its rim lit coral
    const py = lerp(H + 600, 1500, u);
    const g = x.createRadialGradient(540, py - 300, 100, 540, py, 900);
    g.addColorStop(0, '#3a2018'); g.addColorStop(1, '#0d0b0a');
    x.fillStyle = g; x.beginPath(); x.arc(540, py + 500, 1100, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(232,140,110,0.55)'; x.lineWidth = 6; x.beginPath(); x.arc(540, py + 500, 1100, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
    blurIn(x, t, s.t0 + 0.15, 0.35, () => {
      const a2 = 'Ma la più ', b2 = 'pazzesca?';
      const wa = tw(x, a2, 72, F.poppins(700)), wb = tw(x, b2, 84, F.instrument(true));
      txt(x, a2, 540 - (wa + wb) / 2, 820, 72, F.poppins(700), '#ffffff');
      txt(x, b2, 540 - (wa + wb) / 2 + wa, 822, 84, F.instrument(true), CORAL);
    }, 0);
  }

  /** A little pixel flame (drawn here). */
  flame(x: CanvasRenderingContext2D, cx: number, cy: number, p: number, t: number) {
    const rows = ['....#.....', '...##.....', '...###..#.', '..####.##.', '.########.', '.###oo###.', '###oooo###', '###oyyo###', '.##oyyo##.', '..######..'];
    const fl = Math.floor(t * 8) % 2;
    rows.forEach((r, j) => Array.from(r).forEach((c, i) => {
      if (c === '.') return;
      x.fillStyle = c === '#' ? CORAL : c === 'o' ? '#f2a66c' : '#ffe08a';
      x.fillRect(cx - 5 * p + i * p + (j < 3 && fl ? p * 0.5 : 0), cy - 5 * p + j * p, p + 0.5, p + 0.5);
    }));
  }
  virality(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const e = pop(t, s.t0, 0.35, 1.6);
    at(x, 540, 560, e, 0, () => this.flame(x, 540, 560, 24, t));
    const g = Math.max(0, 1 - (t - s.t0) / 0.5);
    for (const [dx, col, a] of [[-10 * g, 'rgba(232,68,58,0.8)', g], [10 * g, 'rgba(120,180,255,0.6)', g], [0, '#ffffff', 1]] as const) {
      if (a <= 0.01) continue;
      x.save(); x.globalAlpha = a; txt(x, 'VIRALITÀ', 540 + dx, 940, 150, F.archivo(100, 900), col, { align: 'center' }); x.restore();
    }
    // a rising curve from the bottom left
    const u = ease.inOutCubic(k(t, s.t0 + 0.1, 0.9));
    x.strokeStyle = CORAL; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath();
    for (let i = 0; i <= 60 * u; i++) { const v = i / 60; const px = 40 + v * 980, py = 1500 - Math.pow(v, 2.4) * 900; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke();
    if (u > 0) { const v = u, px = 40 + v * 980, py = 1500 - Math.pow(v, 2.4) * 900; x.beginPath(); x.arc(px, py, 14, 0, TAU); x.fillStyle = '#ffffff'; x.fill(); }
  }

  search(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w;
    const q = 'la tua nicchia', n = Math.floor(clamp((t - s.t0 - 0.05) * 28, 0, q.length));
    rr(x, 100, 260, 880, 84, 42); x.fillStyle = '#ffffff'; x.fill();
    x.strokeStyle = '#6e6863'; x.lineWidth = 4; x.beginPath(); x.arc(160, 300, 14, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(170, 310); x.lineTo(184, 324); x.stroke();
    txt(x, q.slice(0, n), 200, 314, 34, F.poppins(500), INK);
    const rows: [string, string[], string, string, string][] = [
      ['#24201d', ['HO DATO', 'IL CANALE', "ALL'IA"], CORAL_L, "Ho dato il canale all'IA per 30 giorni", '5,2 mln di visualizzazioni'],
      ['#3d6fe0', ['10 TOOL', 'IA'], '#ffffff', '10 tool IA per chi crea video', '1,1 mln di visualizzazioni'],
      ['#7a4fe0', ['IL MIO', 'MONTAGGIO'], '#ffffff', 'Il mio montaggio, senza filtri', '640 mila visualizzazioni'],
      ['#f6cf4a', ['MICROFONO', '-50€'], INK, 'Il miglior microfono sotto i 50 €', '410 mila visualizzazioni'],
    ];
    const breakdown = t >= w.mostra - 0.1;
    rows.forEach(([bg, th, fg, ttl, views], i) => {
      if (breakdown && i > 0) return;
      blurIn(x, t, s.t0 + 0.35 + i * 0.12, 0.3, () => {
        const ry = 400 + i * 190;
        rr(x, 80, ry, 920, 160, 18); x.fillStyle = 'rgba(30,26,24,0.92)'; x.fill();
        thumb(x, 96, ry + 16, 230, 128, bg, th, fg);
        txt(x, ttl, 350, ry + 72, 28, F.poppins(700), '#ffffff'); txt(x, views, 350, ry + 112, 22, F.poppins(500), '#a39d97');
        if (i === 0 && t >= w.virali - 0.05) {
          const e = k(t, w.virali - 0.05, 0.3);
          x.save(); x.globalAlpha = e; x.shadowColor = 'rgba(232,68,58,0.8)'; x.shadowBlur = 30; rr(x, 80, ry, 920, 160, 18); x.lineWidth = 6; x.strokeStyle = RED; x.stroke(); x.restore();
          at(x, 900, ry, pop(t, w.virali, 0.3, 2.2), 0.12, () => { rr(x, 820, ry - 26, 170, 50, 25); x.fillStyle = RED; x.fill(); txt(x, 'Più virale', 905, ry + 8, 24, F.poppins(700), '#ffffff', { align: 'center' }); });
        }
      });
    });
    if (breakdown) {
      const parts: [string, string][] = [['TITOLO', "Ho dato il canale all'IA per 30 giorni"], ['HOOK', '«Non ho toccato un solo upload.»']];
      parts.forEach(([lbl, v], i) => blurIn(x, t, w.mostra - 0.1 + i * 0.2, 0.3, () => {
        const ry = 650 + i * 130;
        rr(x, 80, ry, 920, 100, 18); x.fillStyle = 'rgba(30,26,24,0.92)'; x.fill();
        rr(x, 104, ry + 26, 150, 48, 24); x.fillStyle = CORAL; x.fill(); txt(x, lbl, 179, ry + 59, 22, F.poppins(700), '#ffffff', { align: 'center' });
        txt(x, v, 280, ry + 62, 28, F.poppins(600), '#ffffff');
      }));
      blurIn(x, t, w.mostra + 0.3, 0.3, () => {
        const ry = 910;
        rr(x, 80, ry, 920, 100, 18); x.fillStyle = 'rgba(30,26,24,0.92)'; x.fill();
        rr(x, 104, ry + 26, 190, 48, 24); x.fillStyle = CORAL; x.fill(); txt(x, 'STRUTTURA', 199, ry + 59, 22, F.poppins(700), '#ffffff', { align: 'center' });
        let px = 320;
        (['Hook', 'Setup', 'Prova', 'Payoff'] as const).forEach((c2, i) => {
          const cw = tw(x, c2, 24, F.poppins(600)) + 36;
          rr(x, px, ry + 28, cw, 44, 22); x.fillStyle = i === 0 ? '#ffffff' : i === 3 ? GREEN : '#3a3633'; x.fill();
          txt(x, c2, px + cw / 2, ry + 58, 24, F.poppins(600), i === 0 ? INK : '#ffffff', { align: 'center' }); px += cw + 12;
        });
      });
      // the hand-drawn ring round the hook
      const u = ease.outCubic(k(t, w.funzionato - 0.2, 0.4));
      if (u > 0) {
        x.save(); x.strokeStyle = RED; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath();
        for (let i = 0; i <= 64 * u; i++) { const a = -2.8 + (i / 64) * TAU * 1.08; const px = 540 + Math.cos(a) * 490, py = 830 + Math.sin(a) * 78 + (i / 64) * 8; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
        x.stroke(); x.restore();
      }
    }
  }

  rebuild(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w;
    blurIn(x, t, s.t0, 0.3, () => {
      rr(x, 230, 300, 620, 130, 18); x.fillStyle = 'rgba(30,26,24,0.92)'; x.fill();
      thumb(x, 246, 316, 180, 98, '#24201d', ['HO DATO', "ALL'IA"], CORAL_L);
      txt(x, 'Video virale', 450, 360, 30, F.poppins(700), '#ffffff'); txt(x, '5,2 mln', 450, 398, 22, F.poppins(500), '#a39d97');
    });
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 3;
    const l1 = k(t, s.t0 + 0.2, 0.3);
    if (l1 > 0) { x.beginPath(); x.moveTo(540, 430); x.lineTo(540, 430 + 70 * l1); x.stroke(); }
    const pe = pop(t, s.t0 + 0.3, 0.3);
    at(x, 540, 540, pe, 0, () => { rr(x, 330, 505, 420, 72, 36); x.fillStyle = '#ffffff'; x.fill(); spark(x, 380, 541, 18, CORAL); txt(x, 'Analizza il concetto', 560, 553, 30, F.poppins(600), INK, { align: 'center' }); });
    const l2 = k(t, s.t0 + 0.5, 0.3);
    if (l2 > 0) { x.beginPath(); x.moveTo(540, 577); x.lineTo(540, 620); x.moveTo(300, 620); x.lineTo(780, 620); x.moveTo(300, 620); x.lineTo(300, 620 + 40 * l2); x.moveTo(780, 620); x.lineTo(780, 620 + 40 * l2); x.stroke(); }
    if (t >= w.voce - 0.15) blurIn(x, t, w.voce - 0.15, 0.3, () => {
      rr(x, 110, 660, 380, 190, 18); x.fillStyle = 'rgba(30,26,24,0.92)'; x.fill();
      txt(x, 'La tua voce', 140, 712, 28, F.poppins(600), '#ffffff');
      wave(x, 140, 790, 320, 70, 40, CORAL, t, 3);
    });
    if (t >= w.pubblico - 0.2) blurIn(x, t, w.pubblico - 0.2, 0.25, () => {
      rr(x, 590, 660, 380, 190, 18); x.fillStyle = 'rgba(30,26,24,0.92)'; x.fill();
      txt(x, 'Il tuo pubblico', 620, 712, 28, F.poppins(600), '#ffffff');
      [CORAL, '#3d6fe0', GREEN, '#f6cf4a', '#7a4fe0'].forEach((c2, i) => { x.beginPath(); x.arc(640 + i * 66, 790, 24, 0, TAU); x.fillStyle = c2; x.fill(); });
    });
    const ne = Math.max(w.pubblico + 0.1, s.t0 + 1.2);
    if (t >= ne) {
      x.beginPath(); x.moveTo(300, 850); x.lineTo(300, 900); x.lineTo(780, 900); x.lineTo(780, 850); x.moveTo(540, 900); x.lineTo(540, 940); x.stroke();
      const e = pop(t, ne, 0.35, 1.6);
      at(x, 540, 1110, e, 0, () => {
        x.save(); x.shadowColor = 'rgba(232,120,90,0.7)'; x.shadowBlur = 50; rr(x, 190, 940, 700, 340, 24); x.fillStyle = CORAL; x.fill(); x.restore();
        txt(x, 'HO LASCIATO IL', 540, 1050, 56, F.archivo(100, 900), '#ffffff', { align: 'center' });
        txt(x, "CANALE ALL'IA", 540, 1112, 56, F.archivo(100, 900), '#ffffff', { align: 'center' });
        rr(x, 190, 1200, 700, 80, 0); x.fillStyle = '#ffffff'; x.fill(); rr(x, 190, 1200, 700, 80, 24); x.fill();
        x.fillStyle = '#ffffff'; x.fillRect(190, 1200, 700, 30);
        txt(x, 'La tua versione, il tuo stile', 220, 1252, 28, F.poppins(600), INK);
        rr(x, 790, 920, 120, 48, 24); x.fillStyle = GREEN; x.fill(); txt(x, 'NUOVO', 850, 953, 22, F.poppins(700), '#ffffff', { align: 'center' });
      });
    }
  }

  guess(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w;
    for (let i = 0; i < 6; i++) {
      const e = pop(t, s.t0 + 0.1 + i * 0.08, 0.3);
      const [qx, qy] = ([[190, 560], [880, 520], [150, 1010], [910, 990], [360, 450], [740, 1120]] as const)[i]!;
      at(x, qx, qy, e, (hash(i, 3) - 0.5) * 0.6, () => txt(x, '?', qx, qy, 60 + 40 * hash(i, 4), F.poppins(700), i % 2 ? RED : '#3d6fe0', { align: 'center', alpha: t >= w.indovinare ? 0.3 : 1 }));
    }
    blurIn(x, t, s.t0, 0.3, () => {
      txt(x, 'Cosa dovrei', 540, 780, 76, F.poppins(700), INK, { align: 'center' });
      txt(x, 'pubblicare?', 540, 870, 86, F.instrument(true), CORAL, { align: 'center' });
    }, 0);
    const st = ease.outCubic(k(t, w.indovinare, 0.3));
    if (st > 0) { x.save(); x.strokeStyle = RED; x.lineWidth = 9; x.lineCap = 'round'; x.beginPath(); x.moveTo(300, 820); x.lineTo(300 + 480 * st, 790 - 20 * st); x.stroke(); x.restore(); }
    const e = pop(t, w.indovinare + 0.25, 0.3);
    at(x, 540, 1000, e, 0, () => { rr(x, 290, 966, 500, 68, 34); x.fillStyle = '#1e1c1a'; x.fill(); x.beginPath(); x.arc(334, 1000, 18, 0, TAU); x.fillStyle = GREEN; x.fill(); tick(x, 334, 1000, 16, '#ffffff', 3.5); txt(x, 'Idee provate, pronte', 560, 1012, 30, F.poppins(600), '#ffffff', { align: 'center' }); });
  }

  upload(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w;
    title2(x, t, s.t0, 'Scrive lei,', 'carichi tu', 420, 70);
    blurIn(x, t, Math.max(s.t0 + 0.2, w.scrive - 0.2), 0.35, () => {
      card(x, 90, 560, 420, 500, 24);
      sparkTile(x, 300, 660, 110);
      txt(x, 'Claude', 300, 780, 34, F.poppins(700), INK, { align: 'center' });
      for (let i = 0; i < 5; i++) { rr(x, 140, 820 + i * 38, 320 - (i % 3) * 50, 16, 8); x.fillStyle = '#ece8e3'; x.fill(); }
      rr(x, 200, 1000, 200, 44, 22); x.fillStyle = '#ece8e3'; x.fill(); txt(x, 'bozze', 300, 1030, 24, F.poppins(600), '#6e6863', { align: 'center' });
    });
    blurIn(x, t, w.carichi - 0.2, 0.35, () => {
      card(x, 570, 560, 420, 500, 24);
      x.beginPath(); x.arc(780, 670, 56, 0, TAU); x.fillStyle = '#f4e1da'; x.fill();
      x.strokeStyle = CORAL; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(780, 700); x.lineTo(780, 640); x.moveTo(752, 664); x.lineTo(780, 636); x.lineTo(808, 664); x.stroke();
      txt(x, 'Tu', 780, 780, 34, F.poppins(700), INK, { align: 'center' });
      txt(x, 'rileggi e pubblichi', 780, 830, 26, F.poppins(500), '#6e6863', { align: 'center' });
      const e = pop(t, w.carichi + 0.2, 0.3, 2);
      at(x, 780, 985, e, 0, () => { rr(x, 640, 950, 280, 70, 35); x.fillStyle = CORAL; x.fill(); txt(x, 'Pubblica', 780, 996, 30, F.poppins(700), '#ffffff', { align: 'center' }); });
    });
    const ar = k(t, w.carichi - 0.3, 0.3);
    if (ar > 0) { x.strokeStyle = MUTED; x.lineWidth = 5; x.beginPath(); x.moveTo(518, 810); x.lineTo(518 + 44 * ar, 810); x.stroke(); }
  }

  setup(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w;
    const sec = Math.min(10, Math.max(0, (t - w.dieci + 0.3) * 6));
    blurIn(x, t, s.t0, 0.3, () => {
      x.beginPath(); x.arc(540, 520, 170, 0, TAU); x.fillStyle = '#ffffff'; x.fill();
      x.lineWidth = 18; x.strokeStyle = '#ece8e3'; x.beginPath(); x.arc(540, 520, 150, 0, TAU); x.stroke();
      x.strokeStyle = CORAL; x.lineCap = 'round'; x.beginPath(); x.arc(540, 520, 150, -Math.PI / 2, -Math.PI / 2 + (sec / 10) * TAU); x.stroke();
      rr(x, 524, 330, 32, 26, 6); x.fillStyle = '#1e1c1a'; x.fill();
      txt(x, `${Math.floor(sec)}s`, 540, 560, 110, F.poppins(700), INK, { align: 'center' });
    }, 0);
    const steps: [string, number, () => void][] = [
      ['Apri Claude', w.apri, () => spark(x, 900, 804, 22, CORAL)],
      ['Incolla un link', w.incolli, () => { rr(x, 760, 900, 200, 44, 22); x.fillStyle = '#ece8e3'; x.fill(); txt(x, 'github.com/…', 860, 930, 20, F.mono(500), '#6e6863', { align: 'center' }); }],
      ['Fatto', w.fatto, () => { x.beginPath(); x.arc(910, 1050, 26, 0, TAU); x.fillStyle = GREEN; x.fill(); tick(x, 910, 1050, 22, '#ffffff', 4); }],
    ];
    steps.forEach(([label, t0, extra], i) => blurIn(x, t, t0 - 0.12, 0.3, () => {
      const ry = 760 + i * 125;
      card(x, 120, ry, 840, 100, 20);
      x.beginPath(); x.arc(180, ry + 50, 26, 0, TAU); x.fillStyle = i === 2 ? GREEN : CORAL; x.fill();
      txt(x, String(i + 1), 180, ry + 60, 28, F.poppins(700), '#ffffff', { align: 'center' });
      txt(x, label, 230, ry + 62, 36, F.poppins(600), INK);
      extra();
    }));
    if (t >= w.fatto) for (let i = 0; i < 24; i++) {
      const u = t - w.fatto, a = -Math.PI / 2 + (hash(i, 5) - 0.5) * 2.6, v = 500 + 400 * hash(i, 6);
      const px = 910 + Math.cos(a) * v * u, py = 1050 + Math.sin(a) * v * u + 700 * u * u;
      x.fillStyle = [CORAL, '#3d6fe0', GREEN, '#f6cf4a'][i % 4]!; x.globalAlpha = clamp(1.6 - u); x.fillRect(px, py, 10, 14); x.globalAlpha = 1;
    }
  }

  comment2(x: CanvasRenderingContext2D, t: number, s: Shot) {
    const w = this.w;
    const e1 = pop(t, s.t0, 0.3, 2), e2 = pop(t, s.t0 + 0.15, 0.3, 2);
    at(x, 540, 320, e1, -0.03, () => {
      rr(x, 290, 270, 500, 100, 16); x.fillStyle = '#1e1c1a'; x.fill();
      rr(x, 322, 300, 46, 34, 8); x.fillStyle = '#ffffff'; x.fill(); x.beginPath(); x.moveTo(332, 334); x.lineTo(332, 346); x.lineTo(346, 334); x.fill();
      txt(x, 'COMMENTA', 570, 343, 58, F.archivo(100, 900), '#ffffff', { align: 'center' });
    });
    at(x, 560, 430, e2, 0.02, () => {
      rr(x, 300, 384, 520, 96, 16); x.fillStyle = CORAL; x.fill();
      rr(x, 334, 410, 60, 44, 10); x.fillStyle = '#ffffff'; x.fill(); x.beginPath(); x.moveTo(356, 420); x.lineTo(376, 432); x.lineTo(356, 444); x.closePath(); x.fillStyle = CORAL; x.fill();
      txt(x, 'YOUTUBE', 600, 455, 58, F.archivo(100, 900), '#ffffff', { align: 'center' });
    });
    blurIn(x, t, s.t0 + 0.25, 0.3, () => {
      card(x, 110, 600, 860, 110, 55);
      x.beginPath(); x.arc(175, 655, 30, 0, TAU); x.fillStyle = CORAL; x.fill();
      const q = 'YOUTUBE', n = Math.floor(clamp((t - w.youtube + 0.1) * 18, 0, q.length));
      txt(x, q.slice(0, n), 230, 668, 34, F.poppins(600), INK);
      if (n < q.length && Math.floor(t * 2.4) % 2 === 0) { x.fillStyle = INK; x.fillRect(232 + tw(x, q.slice(0, n), 34, F.poppins(600)), 640, 3, 36); }
      x.beginPath(); x.arc(920, 655, 26, 0, TAU); x.fillStyle = CORAL; x.fill();
      x.beginPath(); x.moveTo(910, 643); x.lineTo(932, 655); x.lineTo(910, 667); x.closePath(); x.fillStyle = '#ffffff'; x.fill();
    });
    if (t >= w.mando - 0.1) blurIn(x, t, w.mando - 0.1, 0.35, () => {
      card(x, 110, 760, 860, 130, 24);
      rr(x, 140, 790, 70, 70, 16); x.fillStyle = '#1e1c1a'; x.fill();
      x.strokeStyle = '#ffffff'; x.lineWidth = 4; rr(x, 155, 808, 40, 32, 4); x.stroke(); x.beginPath(); x.moveTo(155, 810); x.lineTo(175, 826); x.lineTo(195, 810); x.stroke();
      txt(x, 'Nuovo messaggio', 240, 812, 22, F.poppins(500), MUTED);
      txt(x, 'Ecco la guida completa', 240, 852, 32, F.poppins(700), INK);
    });
  }
}
