// Numbers that build themselves: bars that grow in a stagger, a line (and its area) that draws on with a dot at
// its head and a tooltip where it stops, a donut that fills part by part. Values are the caller's: the Opus 5.5
// specs insist on "no invented metrics", so the chart shows exactly what it is given.
import { font } from '../engine/type';
import { clamp, lerp, TAU } from '../engine/util';
import { E, stagger, type Ease } from './tl';
import type { Rect } from './camera';
import { rr } from './ui';

/** ink: text and the tooltip's fill; paper: the ground (and the tooltip's text); grid: rules; colors: series. */
export interface ChartStyle { ink: string; paper: string; muted: string; grid: string; colors: string[]; font: string; mono: string }

/** Bars over r for `values` (max = the top), growing from t0 with a stagger, labels under and values on top. */
export function bars(x: CanvasRenderingContext2D, t: number, t0: number, r: Rect, values: number[], st: ChartStyle, o: { labels?: string[]; max?: number; dur?: number; each?: number; ease?: Ease | string; format?: (v: number) => string; gap?: number } = {}) {
  const n = values.length, max = o.max ?? Math.max(...values), gap = o.gap ?? 0.28, bw = (r.w / n) * (1 - gap);
  const e = typeof o.ease === 'string' ? E(o.ease) : o.ease ?? E('expo.out');
  x.fillStyle = st.grid; x.fillRect(r.x, r.y + r.h, r.w, 2);
  values.forEach((v, i) => {
    const u = e(clamp((t - t0 - stagger(i, n, { each: o.each ?? 0.08 })) / (o.dur ?? 0.9)));
    const h = (v / max) * r.h * u, bx = r.x + (r.w / n) * i + ((r.w / n) * gap) / 2;
    if (h > 0.5) { rr(x, bx, r.y + r.h - h, bw, h, Math.min(10, bw / 4)); x.fillStyle = st.colors[i % st.colors.length]!; x.fill(); }
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    if (u > 0.05) { x.globalAlpha = u; x.font = font(st.mono, Math.min(28, bw * 0.3)); x.fillStyle = st.ink; x.fillText((o.format ?? ((k) => Math.round(k).toLocaleString('it-IT')))(v * u), bx + bw / 2, r.y + r.h - h - 12); x.globalAlpha = 1; }
    if (o.labels) { x.font = font(st.font, Math.min(24, bw * 0.28)); x.fillStyle = st.muted; x.fillText(o.labels[i] ?? '', bx + bw / 2, r.y + r.h + 34); }
  });
}

/**
 * A line through `values` over r, drawn on from t0 over d (with its area under it, fading in), a dot at its head
 * and, once drawn, a tooltip on the last point. Returns the head's position.
 */
export function line(x: CanvasRenderingContext2D, t: number, t0: number, d: number, r: Rect, values: number[], st: ChartStyle, o: { min?: number; max?: number; color?: string; width?: number; area?: boolean; tip?: string; ease?: Ease | string; smooth?: boolean } = {}) {
  const n = values.length, lo = o.min ?? Math.min(...values), hi = o.max ?? Math.max(...values);
  const P = values.map((v, i) => ({ x: r.x + (r.w * i) / (n - 1), y: r.y + r.h - ((v - lo) / Math.max(1e-6, hi - lo)) * r.h }));
  const e = typeof o.ease === 'string' ? E(o.ease) : o.ease ?? E('power2.inOut');
  const u = e(clamp((t - t0) / d)), s = u * (n - 1), k = Math.floor(s), f = s - k;
  const head = k >= n - 1 ? P[n - 1]! : { x: lerp(P[k]!.x, P[k + 1]!.x, f), y: lerp(P[k]!.y, P[k + 1]!.y, f) };
  const col = o.color ?? st.colors[0]!;
  for (let g = 0; g <= 4; g++) { x.fillStyle = st.grid; x.fillRect(r.x, r.y + (r.h * g) / 4, r.w, 1); }
  if (u <= 0) return head;
  const pts = [...P.slice(0, k + 1), head];
  const trace = () => {
    x.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) {
      if (o.smooth !== false && i < pts.length - 1) { const m = { x: (pts[i]!.x + pts[i + 1]!.x) / 2, y: (pts[i]!.y + pts[i + 1]!.y) / 2 }; x.quadraticCurveTo(pts[i]!.x, pts[i]!.y, m.x, m.y); }
      else x.lineTo(pts[i]!.x, pts[i]!.y);
    }
  };
  if (o.area !== false) {
    const g = x.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
    x.beginPath(); trace(); x.lineTo(head.x, r.y + r.h); x.lineTo(P[0]!.x, r.y + r.h); x.closePath(); x.fillStyle = g; x.fill();
  }
  x.beginPath(); trace(); x.strokeStyle = col; x.lineWidth = o.width ?? 5; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke();
  x.beginPath(); x.arc(head.x, head.y, 9, 0, TAU); x.fillStyle = col; x.fill();
  x.beginPath(); x.arc(head.x, head.y, 4, 0, TAU); x.fillStyle = '#ffffff'; x.fill();
  if (o.tip && t > t0 + d) {
    const a = E('back.out(1.6)')(clamp((t - t0 - d) / 0.35));
    x.save(); x.translate(head.x, head.y - 30); x.scale(a, a);
    x.font = font(st.font, 24); const w = x.measureText(o.tip).width + 32;
    rr(x, -w / 2, -52, w, 44, 12); x.fillStyle = st.ink; x.fill();
    x.beginPath(); x.moveTo(-8, -9); x.lineTo(8, -9); x.lineTo(0, 0); x.fill();
    x.fillStyle = st.paper; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.tip, 0, -30);
    x.restore();
  }
  return head;
}

/** A donut of parts (fractions summing to ≤ 1) at (cx, cy), filling part after part from t0 over d. */
export function donut(x: CanvasRenderingContext2D, t: number, t0: number, d: number, cx: number, cy: number, R: number, parts: number[], st: ChartStyle, o: { width?: number; gapDeg?: number } = {}) {
  const w = o.width ?? R * 0.28, gap = ((o.gapDeg ?? 2) * Math.PI) / 180;
  x.lineWidth = w; x.lineCap = 'butt';
  x.strokeStyle = st.grid; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke();
  const u = E('power3.inOut')(clamp((t - t0) / d));
  let a = -Math.PI / 2, acc = 0;
  parts.forEach((p, i) => {
    const show = clamp(u - acc, 0, p);
    acc += p;
    if (show > 0) { x.strokeStyle = st.colors[i % st.colors.length]!; x.beginPath(); x.arc(cx, cy, R, a + gap / 2, a + show * TAU - gap / 2); x.stroke(); }
    a += p * TAU;
  });
}
