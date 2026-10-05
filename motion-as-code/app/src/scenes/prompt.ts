// PLATE 3 `prompt` — "Per esempio: «Crea una sequenza cinematografica di quindici secondi, con tipografia
// cinetica, transizioni fluide tra le forme, elementi 3D e movimenti di camera continui.»"
// (After pdoom-video's prompt plate.) A prompt field floats in front of a tunnel of nested frames. The
// example prompt is typed as tokens exactly on the spoken word starts, wrapping over three lines; above
// each content token a tiny next-token distribution flickers ("computing…"), the sampled candidate lights
// up and it collapses. The camera rides the caret line by line, pulls back to the whole prompt, ⏎ is
// pressed and the prompt is swallowed by the tunnel. Token splits and candidates: prompt-data.ts.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, measure, plain } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp, noise1, prog, TAU } from '../engine/util';
import { fold, lineOf, layWords, drawWords, sparkHead, sparkParticles, mixCss, tri, type KWord } from './_vo';
import { SPECS, META, type Cand } from './prompt-data';

interface Tok {
  text: string; li: number; col: number; n: number; space: boolean;
  t0: number; word: Word; first: boolean; dist: Cand[] | null; pick: number; id: number; tPopEnd: number;
}

const FS = 46; // token font size (UI px)
const POP_PRE = 0.14; // the distribution appears this long before its token
const LH = 92; // line height

export default class Prompt extends Scene {
  ui = new Layer2D();
  glow = new LineBatch(4000);
  bg!: FSPass;
  L4!: Line; L5!: Line;
  head: KWord[] = [];
  toks: Tok[] = [];
  rows: string[] = [];
  adv = 28;
  fam = F.mono(400);
  fx0 = 0; fx1 = 0; fy0 = 0; fy1 = 0; tx0 = 0; base0 = 0; keyX = 0;
  tFirst = 0; tLast = 0; tEnter = 0; T0 = 0; T1 = 0;

  override init() {
    const { lyrics } = this.ctx;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L4 = lineOf(lyrics, 'Per esempio');
    this.L5 = lineOf(lyrics, 'Crea una sequenza');
    const words = this.L5.words;
    this.adv = measure('0', this.fam, FS);
    // wrap the typed prompt into rows of at most `maxCols` characters (word boundaries)
    const typed = words.map((w) => plain(w.w));
    const textW = 1460;
    const maxCols = Math.floor(textW / this.adv);
    const rowOf: number[] = [], colOf: number[] = [];
    let row = 0, col = 0;
    typed.forEach((s) => {
      if (col > 0 && col + 1 + s.length > maxCols) { row++; col = 0; }
      const lead = col > 0 ? 1 : 0;
      rowOf.push(row); colOf.push(col + lead);
      col += lead + s.length;
    });
    this.rows = Array.from({ length: row + 1 }, () => '');
    typed.forEach((s, i) => { this.rows[rowOf[i]!] = this.rows[rowOf[i]!]! + (colOf[i]! > 0 ? ' ' : '') + s; });

    // geometry: field centred, text left-aligned inside
    const fw = textW + 240, fh = this.rows.length * LH + 90;
    this.fx0 = (W - fw) / 2; this.fx1 = this.fx0 + fw;
    this.fy0 = (H - fh) / 2 + 40; this.fy1 = this.fy0 + fh;
    this.tx0 = this.fx0 + 110;
    this.base0 = this.fy0 + 45 + FS * 0.8;
    this.keyX = this.fx1 - 64;
    this.head = layWords(this.L4.words, this.fx0, this.fy0 - 150, 76, F.serif(400, true), { ant: 0.2 });

    // tokens
    words.forEach((w, wi) => {
      const ww = typed[wi]!;
      let pieces = SPECS[fold(w.w)] ?? null;
      if (!pieces || pieces.map((p) => p.s).join('') !== ww) pieces = [{ s: ww }];
      let off = 0;
      pieces.forEach((p, pi) => {
        const t0 = pi === 0 ? w.start : w.start + pi * Math.min(0.09, (w.end - w.start) / pieces!.length);
        this.toks.push({
          text: p.s, li: rowOf[wi]!, col: colOf[wi]! + off, n: p.s.length, space: colOf[wi]! > 0 && pi === 0, t0, word: w, first: pi === 0,
          dist: p.dist ?? null, pick: p.pick ?? 0, id: 1000 + Math.floor(hash(wi, pi, 7) * 98000), tPopEnd: 0,
        });
        off += p.s.length;
      });
    });
    const popToks = this.toks.filter((k) => k.dist);
    popToks.forEach((k, i) => {
      const next = popToks[i + 1];
      k.tPopEnd = Math.max(k.t0 + 0.18, Math.min(k.t0 + 0.6, next ? next.t0 - POP_PRE - 0.04 : k.t0 + 0.6));
    });
    this.tFirst = words[0]!.start;
    this.tLast = words[words.length - 1]!.start;
    this.tEnter = clamp(Math.max(this.L5.end + 0.18, this.T1 - 0.5), this.L5.end + 0.05, this.T1 - 0.2);

    this.bg = new FSPass(TUNNEL, {
      ui: { value: this.ui.texture }, t: { value: 0 }, camZ: { value: 0 }, glow: { value: 0 }, rush: { value: 0 }, vp: { value: new THREE.Vector2() },
      rot: { value: 0 }, beat: { value: 0 },
    });
  }

  /** Caret (UI px) after the last typed token, eased toward each new token. */
  caret(t: number, smooth: number) {
    let x = this.tx0, li = 0;
    for (const k of this.toks) {
      if (k.t0 > t) break;
      const target = this.tx0 + (k.col + k.n) * this.adv;
      const before = this.tx0 + (k.col - (k.space ? 1 : 0)) * this.adv;
      const sameRow = k.li === li;
      li = k.li;
      x = smooth > 0 && sameRow ? lerp(before, target, ease.outExpo(clamp((t - k.t0) / smooth))) : target;
    }
    return { x, y: this.base0 + li * LH, li };
  }

  /** The camera on the UI plane: rides the caret row by row, then pulls back to the whole field. */
  camAt(t: number) {
    const c = this.caret(t, 0.5);
    const lastRow = this.rows.length - 1;
    // focus follows the caret (smoothed per row change), zoom eases out over the plate
    const kOut = ease.inOutCubic(prog(t, this.tLast - 0.2, this.L5.end + 0.25));
    const z0 = lerp(1.62, 1.38, prog(t, this.tFirst, this.tLast));
    const zoom = lerp(z0, 1.0, kOut);
    let fy = this.base0 - 20;
    for (let li = 1; li <= lastRow; li++) {
      const first = this.toks.find((k) => k.li === li);
      if (first) fy += LH * ease.inOutCubic(prog(t, first.t0 - 0.25, first.t0 + 0.15));
    }
    const fx = clamp(c.x - 220, this.fx0 + W / (2 * zoom) - 60, this.fx1 - W / (2 * zoom) + 60);
    const cx = lerp(fx, W / 2, kOut), cy = lerp(fy - 30, (this.fy0 + this.fy1) / 2 - 40, kOut);
    const intro = 1 - ease.outCubic(prog(t, this.T0, this.tFirst));
    return { cx: cx + intro * 40, cy: lerp(cy, this.fy0 - 120, intro * 0.6), zoom: zoom * (1 + 0.08 * intro), rot: 0.012 * Math.sin(t * 0.4) * (1 - kOut) };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const cam = this.camAt(t);
    let kick = 0;
    for (const k of this.toks) if (k.first && k.t0 <= t) kick = Math.max(kick, Math.pow(0.5, (t - k.t0) / 0.07));
    let { zoom, rot, cx, cy } = cam;
    zoom *= 1 + 0.01 * kick;
    // ⏎: the prompt is swallowed by the tunnel
    const rushK = ease.inCubic(prog(t, this.tEnter + 0.04, this.T1));
    zoom *= 1 - 0.9 * rushK;
    rot += 0.7 * rushK * rushK;
    cx = lerp(cx, W / 2, rushK); cy = lerp(cy, H / 2, rushK);

    // ---- UI layer
    const L = this.ui; L.clear();
    const c = L.ctx;
    const cs = Math.cos(rot) * zoom, sn = Math.sin(rot) * zoom;
    const M = (x: number, y: number) => ({ x: cs * (x - cx) - sn * (y - cy) + W / 2, y: sn * (x - cx) + cs * (y - cy) + H / 2 });
    c.setTransform(cs, sn, -sn, cs, W / 2 - (cs * cx - sn * cy), H / 2 - (sn * cx + cs * cy));
    const hair = 1 / zoom;
    this.drawHead(c, t, cs, sn, cx, cy, zoom);
    c.setTransform(cs, sn, -sn, cs, W / 2 - (cs * cx - sn * cy), H / 2 - (sn * cx + cs * cy));
    this.drawField(c, t, hair);
    this.drawTokens(c, t, hair);
    this.drawPopups(c, t, hair);
    const caret = this.drawCaret(c, t);
    L.upload();

    // ---- tunnel + UI
    const u = this.bg.u;
    const lt = t - this.T0, dur = this.T1 - this.T0;
    u.t!.value = t;
    u.camZ!.value = lt * 0.35 + 1.2 * Math.pow(lt / dur, 2.2) + 14 * Math.pow(rushK, 2);
    u.glow!.value = 0.25 + 0.45 * Math.pow(lt / dur, 2) + 5 * Math.pow(rushK, 3) + 0.15 * kick;
    u.rush!.value = rushK;
    (u.vp!.value as THREE.Vector2).set(-(cx - W / 2) / W * 0.1 + noise1(t * 0.3, 1) * 0.015, (cy - H / 2) / H * 0.07 + noise1(t * 0.27, 2) * 0.012);
    u.rot!.value = t * 0.03 + 0.4 * rushK * rushK;
    u.beat!.value = kick;
    this.bg.render(renderer, out);

    // ---- the caret's spark
    this.glow.clear();
    if (caret && caret.hot > 0.01) {
      const p = M(caret.x, caret.y);
      sparkHead(this.glow, p.x, p.y, t, 0.55 * Math.sqrt(zoom), caret.hot);
    }
    if (t >= this.tEnter) {
      const k = M(this.keyX, (this.fy0 + this.fy1) / 2);
      sparkParticles(this.glow, t, (tb) => (tb >= this.tEnter ? { x: k.x, y: k.y } : null), { rate: 160, life: 0.4, speed: 320, intensity: 1.2 * (1 - rushK), seed: 9 });
    }
    if (this.glow.count) this.glow.render(renderer, out);

    return {
      bloomThreshold: 0.95, bloomKnee: 0.25, bloom: 0.7 + 0.8 * rushK, vignette: 0.45,
      flash: 0.9 * Math.pow(prog(t, this.T1 - 0.1, this.T1 - 1 / 60), 2),
      shake: [noise1(t * 40, 1) * 9 * rushK * rushK, noise1(t * 40, 2) * 9 * rushK * rushK],
      ca: 1.2 + 5 * rushK * rushK,
    };
  }

  // ------------------------------------------------------------------ drawing
  drawHead(c: CanvasRenderingContext2D, t: number, cs: number, sn: number, cx: number, cy: number, zoom: number) {
    // world-space karaoke through the same camera (drawWords takes a Cam: build the equivalent one)
    const cam = { x: cx, y: cy, z: zoom, rot: Math.atan2(sn, cs) };
    drawWords(c, cam, this.head, t, { alpha: 1 - prog(t, this.tFirst + 1.2, this.tFirst + 2), sung: 'signal' });
  }

  drawField(c: CanvasRenderingContext2D, t: number, hair: number) {
    const { fx0, fx1, fy0, fy1 } = this;
    c.save();
    c.fillStyle = rgba('ink', 0.88);
    c.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    c.lineWidth = hair;
    c.strokeStyle = rgba('bone', 0.42);
    c.strokeRect(fx0 + 0.5 * hair, fy0 + 0.5 * hair, fx1 - fx0, fy1 - fy0);
    c.strokeStyle = rgba('bone', 0.6);
    c.beginPath();
    for (const [x, y, sx, sy] of [[fx0, fy0, -1, -1], [fx1, fy0, 1, -1], [fx0, fy1, -1, 1], [fx1, fy1, 1, 1]] as const) {
      c.moveTo(x + sx * 6, y); c.lineTo(x + sx * 20, y);
      c.moveTo(x, y + sy * 6); c.lineTo(x, y + sy * 20);
    }
    c.stroke();
    c.font = font(F.mono(400), 40);
    c.fillStyle = rgba('ash', 0.7);
    c.textBaseline = 'alphabetic';
    c.fillText('›', fx0 + 44, this.base0 - 2);
    // labels under the field
    const nTok = this.toks.filter((k) => k.t0 <= t).length;
    c.font = font(F.mono(500), 14);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('bone', 0.6);
    c.fillText('PROMPT', fx0, fy1 + 32);
    c.fillStyle = rgba('signal', 0.9);
    c.fillText(META.no, fx0 + measure('PROMPT', F.mono(500), 14, 3) + 14, fy1 + 32);
    c.letterSpacing = '0px';
    c.font = font(F.mono(400), 14);
    c.fillStyle = rgba('ash', 0.75);
    c.fillText(META.params, fx0, fy1 + 56);
    c.textAlign = 'right';
    c.letterSpacing = '3px';
    c.font = font(F.mono(500), 14);
    c.fillStyle = rgba('bone', 0.6);
    c.fillText(`CONTESTO ${String(nTok).padStart(2, '0')} / 200000`, fx1, fy1 + 32);
    c.letterSpacing = '0px';
    c.font = font(F.mono(400), 14);
    c.fillStyle = rgba('ash', 0.75);
    c.fillText(META.send, fx1, fy1 + 56);
    c.textAlign = 'left';
    // ⏎ drawn small before "invia"
    {
      const ax = fx1 - measure(META.send, F.mono(400), 14) - 7, ay = fy1 + 51.5, a = 3.6;
      c.strokeStyle = rgba('ash', 0.75); c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(ax + a, ay - a); c.lineTo(ax + a, ay + a * 0.25); c.lineTo(ax - a, ay + a * 0.25);
      c.moveTo(ax - a + a * 0.55, ay + a * 0.25 - a * 0.55); c.lineTo(ax - a, ay + a * 0.25); c.lineTo(ax - a + a * 0.55, ay + a * 0.25 + a * 0.55);
      c.stroke();
    }
    // the ⏎ key
    const press = t >= this.tEnter ? Math.pow(0.5, (t - this.tEnter) / 0.12) : 0;
    const armed = t >= this.L5.end ? 1 : 0;
    const kx = this.keyX, ky = (fy0 + fy1) / 2, ks = 30 * (1 - 0.1 * press);
    c.lineWidth = hair * (1 + armed);
    const lit = t >= this.tEnter ? 1 : 0;
    if (lit) { c.fillStyle = rgba('signal', 1); c.fillRect(kx - ks, ky - ks, ks * 2, ks * 2); }
    c.strokeStyle = lit ? rgba('signal', 1) : rgba('bone', 0.35 + 0.35 * armed * (0.5 + 0.5 * Math.cos(t * TAU * 2)));
    c.strokeRect(kx - ks, ky - ks, ks * 2, ks * 2);
    c.strokeStyle = lit ? rgba('ink', 1) : rgba('bone', 0.8);
    c.lineWidth = 2.2;
    const a = ks * 0.42;
    c.beginPath();
    c.moveTo(kx + a, ky - a); c.lineTo(kx + a, ky + a * 0.25); c.lineTo(kx - a, ky + a * 0.25);
    c.moveTo(kx - a + a * 0.45, ky + a * 0.25 - a * 0.45); c.lineTo(kx - a, ky + a * 0.25); c.lineTo(kx - a + a * 0.45, ky + a * 0.25 + a * 0.45);
    c.stroke();
    c.restore();
  }

  drawTokens(c: CanvasRenderingContext2D, t: number, hair: number) {
    const adv = this.adv;
    c.save();
    c.textBaseline = 'alphabetic';
    for (const k of this.toks) {
      if (k.t0 > t) break;
      const base = this.base0 + k.li * LH;
      const x0 = this.tx0 + (k.col - (k.space ? 1 : 0)) * adv;
      const xv = this.tx0 + k.col * adv;
      const x1 = this.tx0 + (k.col + k.n) * adv;
      const age = t - k.t0, w = k.word;
      const cool = prog(t, w.end, w.end + 0.35);
      const flash = Math.pow(0.5, age / 0.06);
      const drop = (1 - ease.outExpo(clamp(age / 0.18))) * -9;
      // token bracket (the leading space inside it) + id
      const by = base + 16, bw = x1 - x0 - 6;
      c.fillStyle = rgba('bone', 0.38 * (1 - prog(t, k.t0 + 0.8, k.t0 + 3) * 0.4));
      c.fillRect(x0 + 3, by, bw, hair);
      c.fillRect(x0 + 3, by - 5, hair, 5);
      c.fillRect(x0 + 3 + bw - hair, by - 5, hair, 5);
      if (k.n >= 3) {
        c.font = font(F.mono(400), 10);
        c.fillStyle = rgba('ash', 0.55);
        c.fillText(String(k.id), x0 + 5, by + 13);
      }
      c.font = font(this.fam, FS);
      if (k.space) { c.fillStyle = rgba('graphite', 0.9); c.fillRect(x0 + adv * 0.5 - 2, base - FS * 0.2, 3, 3); }
      for (let i = 0; i < k.n; i++) {
        c.fillStyle = t < w.end || cool < 1 ? (flash > 0.05 ? rgba('ember', 1) : cool > 0 ? mixCss('signal', 'bone', cool) : rgba('signal', 1)) : rgba('bone', 0.95);
        c.fillText(k.text[i]!, xv + i * adv, base + drop);
      }
    }
    // karaoke: spoken progress along each word's brackets
    for (const w of this.L5.words) {
      if (w.start > t) break;
      const p = Lyrics.wordProgress(w, t);
      const ks = this.toks.filter((k) => k.word === w && k.t0 <= t);
      if (!ks.length) continue;
      const first = ks[0]!, lastK = ks[ks.length - 1]!;
      const x0 = this.tx0 + (first.col - (first.space ? 1 : 0)) * adv + 3;
      const x1 = this.tx0 + (lastK.col + lastK.n) * adv - 3;
      c.fillStyle = rgba('signal', 1 - 0.75 * prog(t, w.end, w.end + 0.4));
      c.fillRect(x0, this.base0 + first.li * LH + 15, (x1 - x0) * p, 3);
    }
    c.restore();
  }

  drawPopups(c: CanvasRenderingContext2D, t: number, hair: number) {
    for (const k of this.toks) {
      if (!k.dist) continue;
      const a0 = k.t0 - POP_PRE, a1 = k.tPopEnd + 0.12;
      if (t < a0 || t > a1) continue;
      const built = clamp((t - a0) / POP_PRE);
      const picked = t >= k.t0;
      const collapse = ease.inCubic(prog(t, k.tPopEnd, k.tPopEnd + 0.12));
      const ax = this.tx0 + k.col * this.adv;
      const tokTop = this.base0 + k.li * LH - FS * 0.82;
      const ay = this.fy0 - 24; // panels sit above the field, with a leader down to their token
      const rows = k.dist, rh = 22, headH = 20;
      const hgt = headH + rows.length * rh + 6, pw = 300;
      c.save();
      c.translate(ax, ay);
      c.scale(1, 1 - collapse);
      c.globalAlpha = 1 - collapse * 0.6;
      c.fillStyle = rgba('bone', 0.5);
      c.fillRect(0, 0, hair, tokTop - ay);
      c.fillRect(-3, tokTop - ay, 7, hair);
      c.fillStyle = rgba('ink', 0.88);
      c.fillRect(0, -hgt, pw, hgt);
      c.fillStyle = rgba('bone', 0.35);
      c.fillRect(0, -hgt, pw, hair);
      c.fillRect(0, -hgt, hair, hgt);
      c.textBaseline = 'alphabetic';
      c.font = font(F.mono(400), 11);
      c.fillStyle = rgba('ash', 0.85);
      c.fillText('p( prossimo | contesto )', 10, -hgt + 14);
      c.textAlign = 'right';
      c.fillText(picked ? 'campionato' : 'calcolo…', pw - 8, -hgt + 14);
      c.textAlign = 'left';
      const pmax = rows[0]![1];
      rows.forEach(([txt, p], i) => {
        const y = -hgt + headH + (i + 1) * rh - 5;
        const isPick = i === k.pick;
        const fl = hash(i, frameIdx(t), k.id) < 0.25 + 0.75 * built;
        if (!picked && !fl) return;
        const jitter = picked ? 1 : 0.3 + 0.7 * built + (hash(i, frameIdx(t), 3) - 0.5) * 0.5 * (1 - built);
        const on = picked && isPick;
        const flashRow = on ? Math.pow(0.5, (t - k.t0) / 0.08) : 0;
        if (on) { c.fillStyle = rgba('signal', 0.14 + 0.5 * flashRow); c.fillRect(1, y - 15, pw - 1, rh - 1); }
        c.font = font(F.mono(on ? 500 : 400), 14);
        c.fillStyle = on ? rgba('signal', 1) : rgba(picked ? 'ash' : 'bone', picked ? 0.8 : 0.55);
        if (on) tri(c, 8 + measure(' ', F.mono(500), 14) * 0.5, y - 4.4, 3.6);
        c.fillText('  ' + txt, 8, y);
        const bx = 170, bwm = 80;
        const bw = clamp((bwm * p) / pmax * clamp(jitter, 0, 1.2), 1.5, bwm);
        c.fillStyle = on ? rgba('signal', 1) : rgba('bone', picked ? 0.3 : 0.45);
        c.fillRect(bx, y - 9, bw, 7);
        c.font = font(F.mono(400), 12);
        c.fillStyle = on ? rgba('signal', 1) : rgba('ash', 0.8);
        c.textAlign = 'right';
        c.fillText(p >= 0.01 ? p.toFixed(2) : p.toFixed(3), pw - 8, y);
        c.textAlign = 'left';
      });
      c.restore();
    }
  }

  drawCaret(c: CanvasRenderingContext2D, t: number) {
    const last = this.toks.filter((k) => k.t0 <= t).pop();
    const cr = this.caret(t, 0);
    const sinceTok = last ? t - last.t0 : 99;
    const on = (sinceTok < 0.45 || Math.floor(t * 2.2) % 2 === 0) && t < this.tEnter + 0.05;
    if (!on) return null;
    const y0 = cr.y - FS * 0.78, y1 = cr.y + FS * 0.12;
    c.fillStyle = rgba('signal', 1);
    c.fillRect(cr.x + 4, y0, 3.5, y1 - y0);
    return { x: cr.x + 5.75, y: y0 + 4, hot: sinceTok < 0.3 ? 0.35 * Math.pow(0.5, sinceTok / 0.1) : 0 };
  }
}

// ------------------------------------------------------------------ shader: a tunnel of nested frames
const TUNNEL = /* glsl */ `
uniform sampler2D ui; uniform float t, camZ, glow, rush, rot, beat; uniform vec2 vp;
float hairlines(float v, float wpx) {
  float fw = max(fwidth(v), 1e-5) * PX_SCALE;
  float sp = 1.0 / fw;
  float d = abs(fract(v + 0.5) - 0.5) * sp * PX_SCALE;
  float l = pxLine(d, wpx * 0.5 - 0.6, wpx * 0.5 + 0.6);
  return mix(min(1.0, wpx / sp) * 0.8, l, smoothstep(2.2, 4.5, sp));
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(${(W / H).toFixed(5)}, 1.0);
  vec2 q = rot2(rot) * (p - vp);
  // a 16:9 frame's "radius": a superellipse norm, so the walls are rounded rectangles
  vec2 a = abs(q) / vec2(1.6, 0.9);
  float r = pow(pow(a.x, 6.0) + pow(a.y, 6.0), 1.0 / 6.0);
  float z = 0.5 / max(r, 1e-4);              // depth of the frame seen at this radius
  float u = z * 1.4 + camZ;                  // one frame per unit along the tunnel
  float fog = exp(-z * 0.28);
  float lines = hairlines(u, 0.6 + 1.6 * fog);
  // fine scan lines on the frame walls between frames
  float scan = hairlines(u * 9.0, 0.5) * 0.25 * smoothstep(0.08, 0.3, r);
  vec3 col = C_INK;
  col += C_BONE * (0.30 * lines + 0.06 * scan) * fog * (1.0 + 0.6 * beat);
  // the light at the end of the tunnel
  float g = exp(-r * mix(10.0, 1.6, sat(rush * rush))) * glow;
  col += heat(0.3 + 0.45 * sat(g)) * g * 0.7;
  col += C_BONE * 0.3 * rush * rush * hatch(atan(q.y, q.x) * 40.0, 0.12) * smoothstep(0.1, 0.6, r);
  vec4 ui4 = texture(ui, vUv);
  float hot = smoothstep(0.25, 0.7, ui4.r - ui4.g * 1.3);
  col = mix(col, ui4.rgb * (1.0 + 1.2 * hot), ui4.a);
  fragColor = vec4(col, 1.0);
}`;
