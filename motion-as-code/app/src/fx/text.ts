// Text that moves letter by letter, the kinetic type most of the Opus 5.5 prompts ask for: split reveals behind a
// mask, blur-ins, flips, scramble/decode, a typewriter with its caret, counters and a rolling odometer. All are
// drawn in Canvas2D from t alone. Text sits on its alphabetic baseline at (cx, cy), centred unless align says so.
import { font, layout } from '../engine/type';
import { clamp, hash } from '../engine/util';
import { E, stagger, type Ease, type StaggerFrom } from './tl';

export type Reveal = 'rise' | 'drop' | 'blur' | 'scale' | 'flip' | 'fade' | 'slide' | 'skew';
export interface RevealOpts {
  /** How each piece comes in (default 'rise': up from behind a mask at the baseline). */
  mode?: Reveal;
  /** Pieces: letters or words (default letters). */
  by?: 'char' | 'word';
  /** Seconds between pieces, or the whole spread, and where the stagger starts (see tl.stagger). */
  each?: number;
  amount?: number;
  from?: StaggerFrom;
  /** Seconds each piece takes, and its easing (an easing or a GSAP name). */
  dur?: number;
  ease?: Ease | string;
  align?: 'left' | 'center' | 'right';
  tracking?: number;
  /** Fill colour, or one per piece. */
  color?: string | ((i: number) => string);
  /** The pieces leave the same way from tOut on (reversed), if given. */
  tOut?: number;
}

type Piece = { s: string; x: number; w: number };
function pieces(text: string, family: string, size: number, tracking: number, by: 'char' | 'word'): { ps: Piece[]; width: number } {
  const L = layout(text, family, size, tracking);
  if (by === 'char') return { ps: L.glyphs.filter((g) => g.ch !== ' ').map((g) => ({ s: g.ch, x: g.x, w: g.w })), width: L.width };
  const ps: Piece[] = [];
  let cur: Piece | null = null;
  for (const g of L.glyphs) {
    if (g.ch === ' ') { if (cur) ps.push(cur); cur = null; continue; }
    if (!cur) cur = { s: g.ch, x: g.x, w: g.w };
    else { cur.s += g.ch; cur.w = g.x + g.w - cur.x; }
  }
  if (cur) ps.push(cur);
  return { ps, width: L.width };
}

/**
 * Draws `text` coming in piece by piece from t0. Returns the time the last piece lands, so the next thing can
 * follow it. The 'rise' and 'drop' modes clip each line at its own box: the letters slide out of nothing.
 */
export function reveal(x: CanvasRenderingContext2D, t: number, t0: number, text: string, cx: number, cy: number, size: number, family: string, o: RevealOpts = {}): number {
  const mode = o.mode ?? 'rise', by = o.by ?? 'char', dur = o.dur ?? 0.6;
  const e = typeof o.ease === 'string' ? E(o.ease) : o.ease ?? E(mode === 'scale' || mode === 'flip' ? 'back.out(1.6)' : 'expo.out');
  const { ps, width } = pieces(text, family, size, o.tracking ?? 0, by);
  const x0 = o.align === 'left' ? cx : o.align === 'right' ? cx - width : cx - width / 2;
  const n = ps.length;
  let landed = t0;
  x.save();
  x.font = font(family, size);
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  ps.forEach((p, i) => {
    const s0 = t0 + stagger(i, n, { each: o.each ?? (by === 'char' ? 0.035 : 0.08), amount: o.amount, from: o.from });
    landed = Math.max(landed, s0 + dur);
    let u = e(clamp((t - s0) / dur));
    if (o.tOut !== undefined && t > o.tOut) u = Math.min(u, 1 - e(clamp((t - o.tOut - stagger(i, n, { each: o.each ?? 0.02, from: o.from })) / (dur * 0.7))));
    if (u <= 0) return;
    const col = typeof o.color === 'function' ? o.color(i) : o.color ?? '#ffffff';
    const px = x0 + p.x, mid = px + p.w / 2;
    x.save();
    x.fillStyle = col;
    switch (mode) {
      case 'rise': case 'drop': {
        x.beginPath(); x.rect(px - size * 0.1, cy - size * 1.05, p.w + size * 0.2, size * 1.35); x.clip();
        const dy = (1 - u) * size * 1.1 * (mode === 'rise' ? 1 : -1);
        x.fillText(p.s, px, cy + dy);
        break;
      }
      case 'blur': x.globalAlpha *= u; x.filter = `blur(${((1 - u) * size * 0.25).toFixed(2)}px)`; x.fillText(p.s, px, cy + (1 - u) * size * 0.2); break;
      case 'scale': x.translate(mid, cy - size * 0.35); x.scale(u, u); x.globalAlpha *= clamp(u * 2); x.fillText(p.s, -p.w / 2, size * 0.35); break;
      case 'flip': { x.translate(mid, cy - size * 0.35); x.scale(1, Math.max(0.001, Math.sin((u * Math.PI) / 2))); x.globalAlpha *= clamp(u * 1.5); x.fillText(p.s, -p.w / 2, size * 0.35); break; }
      case 'fade': x.globalAlpha *= u; x.fillText(p.s, px, cy); break;
      case 'slide': x.globalAlpha *= clamp(u * 1.4); x.fillText(p.s, px + (1 - u) * size * 0.8, cy); break;
      case 'skew': x.translate(px, cy); x.transform(1, 0, (1 - u) * -0.6, 1, 0, 0); x.globalAlpha *= u; x.fillText(p.s, 0, (1 - u) * size * 0.5); break;
    }
    x.restore();
  });
  x.restore();
  return landed;
}

export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$*+=<>/\\';
/**
 * Scramble/decode: the text as it resolves from random glyphs, left to right, from t0 over d seconds. Unresolved
 * letters change `rate` times a second (deterministically). Spaces stay spaces. Draw the result with your own font.
 */
export function scramble(text: string, t: number, t0: number, d: number, o: { charset?: string; rate?: number; seed?: number; from?: StaggerFrom } = {}): string {
  const cs = o.charset ?? GLYPHS, rate = o.rate ?? 24, tick = Math.floor(t * rate);
  const n = text.length;
  let out = '';
  for (let i = 0; i < n; i++) {
    const ch = text[i]!;
    if (ch === ' ') { out += ' '; continue; }
    const at = t0 + (o.from ? stagger(i, n, { amount: d, from: o.from, seed: o.seed }) : (d * (i + 1)) / n);
    if (t >= at) out += ch;
    else if (t < t0 - 0.05) out += ' ';
    else out += cs[Math.floor(hash(i, tick, o.seed ?? 3) * cs.length)]!;
  }
  return out;
}

/** Typewriter: the part of `text` typed by t at `cps` characters a second, and whether the caret shows. */
export function typed(text: string, t: number, t0: number, cps = 18, blink = 2.2): { s: string; caret: boolean; done: boolean } {
  const n = clamp(Math.floor((t - t0) * cps), 0, text.length);
  const done = n >= text.length;
  return { s: text.slice(0, n), caret: t >= t0 - 0.4 && (!done || Math.floor(t * blink * 2) % 2 === 0), done };
}

/** A number counting from a to b between t0 and t0 + d, formatted the Italian way (1.234,5). */
export function counter(t: number, t0: number, d: number, a: number, b: number, o: { ease?: Ease | string; decimals?: number; prefix?: string; suffix?: string } = {}): string {
  const e = typeof o.ease === 'string' ? E(o.ease) : o.ease ?? E('expo.out');
  const v = a + (b - a) * e(clamp((t - t0) / Math.max(1e-6, d)));
  const dec = o.decimals ?? 0;
  return (o.prefix ?? '') + v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (o.suffix ?? '');
}

/**
 * An odometer: `value` (a number already eased by the caller, e.g. from counter's maths) drawn as rolling digit
 * wheels, each digit sliding to the next. Digits sit in fixed cells of the font's '0' width; (cx, cy) is the
 * baseline centre. Returns the drawn width.
 */
export function odometer(x: CanvasRenderingContext2D, value: number, digits: number, cx: number, cy: number, size: number, family: string, color: string): number {
  x.save();
  x.font = font(family, size);
  x.textBaseline = 'alphabetic';
  x.textAlign = 'center';
  x.fillStyle = color;
  const cw = x.measureText('0').width * 1.04, w = cw * digits, x0 = cx - w / 2, line = size * 1.05;
  x.beginPath(); x.rect(x0 - 4, cy - size * 0.95, w + 8, size * 1.15); x.clip();
  for (let k = 0; k < digits; k++) {
    const place = Math.pow(10, digits - 1 - k);
    // the wheel turns continuously only while the digits below it roll over
    const below = value % place, carry = place > 1 ? clamp(below - (place - 1)) : value % 1;
    const pos = (Math.floor(value / place) % 10) + carry;
    const px = x0 + cw * (k + 0.5);
    for (let j = -1; j <= 1; j++) {
      const dgt = ((Math.floor(pos) + j) % 10 + 10) % 10;
      x.fillText(String(dgt), px, cy + (j - (pos - Math.floor(pos))) * line);
    }
  }
  x.restore();
  return w;
}
