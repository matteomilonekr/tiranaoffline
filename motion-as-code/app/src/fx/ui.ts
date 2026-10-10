// Interfaces to animate, drawn here (no screenshots, no brand icons): a window (macOS or browser chrome), a phone,
// a cursor that moves, clicks and drags, and the widgets the Opus 5.5 launch videos keep showing: a toggle, a
// slider, tabs with a liquid indicator, a toast, a ⌘K palette, a terminal, a button. Colours come in `th`.
import { F, font } from '../engine/type';
import { clamp, lerp, TAU } from '../engine/util';
import { E, spring, springTo } from './tl';
import type { Rect } from './camera';

export interface Theme { bg: string; panel: string; ink: string; muted: string; line: string; accent: string; accentInk: string; font: string; mono: string }
export const LIGHT: Theme = { bg: '#f6f5f2', panel: '#ffffff', ink: '#18181b', muted: '#8a8a93', line: 'rgba(0,0,0,0.08)', accent: '#2f6bff', accentInk: '#ffffff', font: 'Poppins-500', mono: 'PlexMono-500' };
export const DARK: Theme = { bg: '#0d0d10', panel: '#17171c', ink: '#f4f4f5', muted: '#8b8b96', line: 'rgba(255,255,255,0.09)', accent: '#7aa2ff', accentInk: '#0d0d10', font: 'Poppins-500', mono: 'PlexMono-500' };
/** The theme with its fonts resolved through the kit's font registry (call after fonts load). */
export const themed = (th: Theme): Theme => ({ ...th, font: F.poppins(500), mono: F.mono(500) });

export function rr(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  x.beginPath();
  x.moveTo(x0 + k, y0);
  x.arcTo(x0 + w, y0, x0 + w, y0 + h, k);
  x.arcTo(x0 + w, y0 + h, x0, y0 + h, k);
  x.arcTo(x0, y0 + h, x0, y0, k);
  x.arcTo(x0, y0, x0 + w, y0, k);
  x.closePath();
}
function label(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, col: string, align: CanvasTextAlign = 'left') {
  x.font = font(fam, size); x.fillStyle = col; x.textAlign = align; x.textBaseline = 'middle'; x.fillText(s, px, py);
}

/** A soft drop shadow for the next fill (call inside save/restore). */
export function lift(x: CanvasRenderingContext2D, k = 1) { x.shadowColor = `rgba(0,0,0,${0.18 * k})`; x.shadowBlur = 40 * k; x.shadowOffsetY = 14 * k; }

/** A window with macOS traffic lights or browser chrome (tab and address bar). Returns the content rect. */
export function windowFrame(x: CanvasRenderingContext2D, r: Rect, th: Theme, o: { title?: string; url?: string; chrome?: 'mac' | 'browser'; radius?: number; shadow?: number } = {}): Rect {
  const rad = o.radius ?? 18, bar = o.chrome === 'browser' ? 88 : 52;
  x.save();
  lift(x, o.shadow ?? 1);
  rr(x, r.x, r.y, r.w, r.h, rad); x.fillStyle = th.panel; x.fill();
  x.restore();
  x.save();
  rr(x, r.x, r.y, r.w, r.h, rad); x.clip();
  x.fillStyle = th.bg; x.fillRect(r.x, r.y, r.w, bar);
  x.fillStyle = th.line; x.fillRect(r.x, r.y + bar - 1, r.w, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { x.beginPath(); x.arc(r.x + 26 + i * 22, r.y + 26, 7, 0, TAU); x.fillStyle = c; x.fill(); });
  if (o.chrome === 'browser') {
    rr(x, r.x + 110, r.y + 10, Math.min(260, r.w * 0.35), 32, 9); x.fillStyle = th.panel; x.fill();
    label(x, o.title ?? 'Nuova scheda', r.x + 126, r.y + 26, 15, th.font, th.ink);
    rr(x, r.x + 16, r.y + 50, r.w - 32, 30, 15); x.fillStyle = th.panel; x.fill();
    label(x, o.url ?? 'tuosito.it', r.x + 34, r.y + 65, 15, th.mono, th.muted);
  } else if (o.title) label(x, o.title, r.x + r.w / 2, r.y + 26, 16, th.font, th.muted, 'center');
  x.restore();
  return { x: r.x, y: r.y + bar, w: r.w, h: r.h - bar };
}

/** A phone of height h centred on (cx, cy), with an island. Returns the screen rect. */
export function phone(x: CanvasRenderingContext2D, cx: number, cy: number, h: number, th: Theme, o: { shadow?: number; body?: string } = {}): Rect {
  const w = h * 0.49, r = h * 0.085, b = h * 0.018;
  x.save();
  lift(x, o.shadow ?? 1);
  rr(x, cx - w / 2, cy - h / 2, w, h, r); x.fillStyle = o.body ?? '#111114'; x.fill();
  x.restore();
  const s = { x: cx - w / 2 + b, y: cy - h / 2 + b, w: w - 2 * b, h: h - 2 * b };
  rr(x, s.x, s.y, s.w, s.h, r - b); x.fillStyle = th.bg; x.fill();
  rr(x, cx - w * 0.16, s.y + h * 0.014, w * 0.32, h * 0.032, h * 0.016); x.fillStyle = '#000'; x.fill();
  return s;
}

/** A path for the cursor: keys [time, x, y, click?]; it glides between them on springs. */
export type CursorKey = [t: number, x: number, y: number, click?: boolean];
/**
 * Draws the cursor at t (an arrow, or a hand while `hand` says so), with a ripple on each click and a press dip.
 * Returns where it is, so the thing under it can react (hover, drag).
 */
export function cursor(x: CanvasRenderingContext2D, t: number, ks: CursorKey[], o: { color?: string; size?: number; settle?: number; hand?: boolean; ripple?: string } = {}) {
  const st = { settle: o.settle ?? 0.45, overshoot: 0.0 };
  const px = springTo(t, ks.map((k) => [k[0], k[1]] as [number, number]), st);
  const py = springTo(t, ks.map((k) => [k[0], k[2]] as [number, number]), st);
  const sz = o.size ?? 34;
  let press = 0;
  for (const k of ks) {
    if (!k[3]) continue;
    const tc = k[0] + (st.settle ?? 0.45) * 0.8, u = t - tc;
    if (u >= 0 && u < 0.6) {
      press = Math.max(press, Math.max(0, 1 - Math.abs(u - 0.06) / 0.12));
      x.save();
      x.globalAlpha = 1 - u / 0.6;
      x.strokeStyle = o.ripple ?? 'rgba(47,107,255,0.8)'; x.lineWidth = 3;
      x.beginPath(); x.arc(k[1], k[2], 10 + E('expo.out')(u / 0.6) * 46, 0, TAU); x.stroke();
      x.restore();
    }
  }
  x.save();
  x.translate(px, py);
  const s = (sz / 34) * (1 - 0.15 * press);
  x.scale(s, s);
  x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
  x.beginPath();
  x.moveTo(0, 0); x.lineTo(0, 30); x.lineTo(7.5, 23); x.lineTo(12.5, 34); x.lineTo(17, 32); x.lineTo(12, 21.5); x.lineTo(22, 21.5); x.closePath();
  x.fillStyle = o.color ?? '#111111'; x.fill();
  x.shadowColor = 'transparent'; x.lineWidth = 2.2; x.strokeStyle = '#ffffff'; x.stroke();
  x.restore();
  return { x: px, y: py, press };
}

/** A switch at (cx, cy), on = 0..1 (pass a spring for the knob's travel). */
export function toggle(x: CanvasRenderingContext2D, cx: number, cy: number, on: number, th: Theme, scale = 1) {
  const w = 76 * scale, h = 44 * scale, k = clamp(on);
  rr(x, cx - w / 2, cy - h / 2, w, h, h / 2);
  x.fillStyle = k > 0.5 ? th.accent : th.line; x.globalAlpha = 1; x.fill();
  x.save(); x.globalAlpha = k; rr(x, cx - w / 2, cy - h / 2, w, h, h / 2); x.fillStyle = th.accent; x.fill(); x.restore();
  x.save(); lift(x, 0.4);
  x.beginPath(); x.arc(lerp(cx - w / 2 + h / 2, cx + w / 2 - h / 2, on), cy, h / 2 - 4 * scale, 0, TAU); x.fillStyle = '#ffffff'; x.fill();
  x.restore();
}

/** A slider from x0 to x0 + w at y, value v in 0..1. */
export function slider(x: CanvasRenderingContext2D, x0: number, y: number, w: number, v: number, th: Theme) {
  rr(x, x0, y - 4, w, 8, 4); x.fillStyle = th.line; x.fill();
  rr(x, x0, y - 4, w * clamp(v), 8, 4); x.fillStyle = th.accent; x.fill();
  x.save(); lift(x, 0.4); x.beginPath(); x.arc(x0 + w * clamp(v), y, 15, 0, TAU); x.fillStyle = '#ffffff'; x.fill(); x.restore();
}

/**
 * Tabs in a pill at r, with the indicator moving to tab `keys` [time, index]: its leading edge rides a faster
 * spring than its trailing edge, so it stretches as it goes (the "liquid" indicator).
 */
export function tabs(x: CanvasRenderingContext2D, t: number, r: Rect, names: string[], keys: [number, number][], th: Theme) {
  const n = names.length, cw = r.w / n, pad = 6;
  rr(x, r.x, r.y, r.w, r.h, r.h / 2); x.fillStyle = th.line; x.fill();
  const left = springTo(t, keys.map(([tt, i]) => [tt, r.x + i * cw] as [number, number]), { settle: 0.55, overshoot: 0.01 });
  const lead = springTo(t, keys.map(([tt, i]) => [tt, r.x + i * cw] as [number, number]), { settle: 0.3, overshoot: 0.01 });
  const a = Math.min(left, lead), b = Math.max(left, lead) + cw;
  x.save(); lift(x, 0.35); rr(x, a + pad, r.y + pad, b - a - 2 * pad, r.h - 2 * pad, (r.h - 2 * pad) / 2); x.fillStyle = th.panel; x.fill(); x.restore();
  const cur = (left - r.x) / cw;
  names.forEach((s, i) => { x.globalAlpha = 0.55 + 0.45 * clamp(1 - Math.abs(cur - i)); label(x, s, r.x + cw * (i + 0.5), r.y + r.h / 2, r.h * 0.34, th.font, th.ink, 'center'); x.globalAlpha = 1; });
}

/** A toast that springs up from below at t0 and leaves at t1. */
export function toast(x: CanvasRenderingContext2D, t: number, t0: number, t1: number, cx: number, y: number, text: string, th: Theme, icon = '✓') {
  const u = spring(t, t0, { settle: 0.5, overshoot: 0.02 }) * (1 - E('power2.in')(clamp((t - t1) / 0.3)));
  if (u <= 0.001) return;
  x.font = font(th.font, 26);
  const w = x.measureText(text).width + 100;
  x.save();
  x.globalAlpha = clamp(u * 1.5);
  x.translate(0, (1 - u) * 80);
  lift(x, 0.8);
  rr(x, cx - w / 2, y - 34, w, 68, 34); x.fillStyle = th.panel; x.fill();
  x.restore();
  x.save(); x.globalAlpha = clamp(u * 1.5); x.translate(0, (1 - u) * 80);
  x.beginPath(); x.arc(cx - w / 2 + 38, y, 16, 0, TAU); x.fillStyle = th.accent; x.fill();
  label(x, icon, cx - w / 2 + 38, y + 1, 18, th.mono, th.accentInk, 'center');
  label(x, text, cx - w / 2 + 66, y, 26, th.font, th.ink);
  x.restore();
}

/** A ⌘K palette at r: the query typed so far and the items that match it, the first one highlighted. */
export function palette(x: CanvasRenderingContext2D, r: Rect, query: string, items: string[], th: Theme, caret = true) {
  x.save(); lift(x, 1); rr(x, r.x, r.y, r.w, r.h, 22); x.fillStyle = th.panel; x.fill(); x.restore();
  label(x, '⌘K', r.x + 28, r.y + 40, 20, th.mono, th.muted);
  label(x, query || 'Cerca…', r.x + 90, r.y + 40, 28, th.font, query ? th.ink : th.muted);
  if (caret) { x.font = font(th.font, 28); x.fillStyle = th.accent; x.fillRect(r.x + 92 + (query ? x.measureText(query).width : 0), r.y + 24, 3, 32); }
  x.fillStyle = th.line; x.fillRect(r.x, r.y + 80, r.w, 1);
  const hits = items.filter((s) => s.toLowerCase().includes(query.toLowerCase()));
  hits.slice(0, Math.floor((r.h - 96) / 58)).forEach((s, i) => {
    const y = r.y + 96 + i * 58;
    if (i === 0) { rr(x, r.x + 12, y, r.w - 24, 50, 12); x.fillStyle = th.line; x.fill(); }
    label(x, s, r.x + 32, y + 25, 24, th.font, th.ink);
  });
}

/** A terminal at r: `lines` as given (each line's text so far), a prompt sign, a caret on the last line. */
export function terminal(x: CanvasRenderingContext2D, r: Rect, lines: string[], th: Theme, o: { caret?: boolean; size?: number; colors?: (i: number) => string } = {}) {
  const c = windowFrame(x, r, { ...th, bg: '#1b1b20', panel: '#121216', line: 'rgba(255,255,255,0.06)' }, { title: 'terminale' });
  const sz = o.size ?? 26, lh = sz * 1.5;
  lines.forEach((s, i) => label(x, s, c.x + 28, c.y + 30 + i * lh, sz, th.mono, o.colors ? o.colors(i) : i % 2 ? '#a1a1aa' : '#e4e4e7'));
  if (o.caret && lines.length) {
    x.font = font(th.mono, sz);
    const last = lines.at(-1)!, i = lines.length - 1;
    x.fillStyle = '#e4e4e7'; x.fillRect(c.x + 30 + x.measureText(last).width, c.y + 30 + i * lh - sz * 0.55, sz * 0.55, sz * 1.1);
  }
}

/** A button at r, pressed = 0..1 (it dips and darkens). */
export function button(x: CanvasRenderingContext2D, r: Rect, text: string, th: Theme, pressed = 0) {
  const s = 1 - 0.05 * pressed;
  x.save();
  x.translate(r.x + r.w / 2, r.y + r.h / 2); x.scale(s, s); x.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  lift(x, 0.5 * (1 - pressed));
  rr(x, r.x, r.y, r.w, r.h, r.h / 2); x.fillStyle = th.accent; x.fill();
  x.restore();
  label(x, text, r.x + r.w / 2, r.y + r.h / 2, r.h * 0.38, th.font, th.accentInk, 'center');
}
