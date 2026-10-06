// The whole reel `styles`, one plate: "20 stili di motion design che puoi rubare".
//  - the header: a red ribbon, "che puoi rubare" in italic serif under it;
//  - the list in two columns, 1-10 and 11-20 (21, the bonus, under them): only the numbers at first, each
//    name typed in when the voice says it, the current one on a red pill;
//  - the line being said, word by word, between the list and the card;
//  - the card: the current style's tile (@kit/styles), flipping over to the next at each cut, its number on a
//    badge. The opening line flicks through all 21 in a montage; the closing line shows them all at once,
//    a mosaic, and the call to comment.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT, W } from '@kit/engine/gl';
import { F, font, measure } from '@kit/engine/type';
import type { Line, Word } from '@kit/engine/lyrics';
import { clamp, ease } from '@kit/engine/util';
import { STYLES, type Style } from '@kit/styles';

const BG0 = '#17161c', BG1 = '#09090b', RED = '#e5322d', YELLOW = '#ffd93d', WHITE = '#f7f5f0', DIM = 'rgba(247,245,240,0.38)';
const CUT_LEAD = 0.18;
const CARD = { x: 150, y: 880, w: 780, h: 680, r: 30 };
const LIST = { y: 356, row: 42, xl: 70, xr: 560, size: 34 };
const FLIP = 0.26;

interface Sec { s: Style; start: number; nameAt: number; line: Line; desc: Word[] }

function rr(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(x0, y0, w, h, r);
}

function txt(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, fam: string, color: string, o: { align?: CanvasTextAlign; alpha?: number; shadow?: boolean } = {}) {
  x.save();
  x.globalAlpha *= o.alpha ?? 1;
  x.font = font(fam, size); x.textAlign = o.align ?? 'left'; x.fillStyle = color;
  if (o.shadow) { x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 0; x.shadowOffsetX = 2; x.shadowOffsetY = 3; }
  x.fillText(s, px, py);
  x.restore();
}

export default class Showcase extends Scene {
  layer = new Layer2D();
  secs: Sec[] = [];
  hook!: Line; cta!: Line; ctaStart = 0;

  override init() {
    const ly = this.ctx.lyrics;
    const cut = (l: Line) => {
      const prev = ly.lines[l.i - 1];
      return Math.max(l.words[0]!.start - CUT_LEAD, prev ? Math.min(prev.end + 0.02, l.words[0]!.start - 0.02) : 0);
    };
    // the read is: the hook, one line per style in the list's order, the call to action
    this.hook = ly.lines[0]!;
    this.cta = ly.lines[ly.lines.length - 1]!;
    this.ctaStart = cut(this.cta);
    this.secs = STYLES.map((s, i) => {
      const line = ly.lines[i + 1]!;
      const colon = line.words.findIndex((w) => /:$/.test(w.w));
      const nameEnd = line.words.findIndex((w, k) => k > colon && /\.$/.test(w.w));
      return { s, line, start: cut(line), nameAt: line.words[colon + 1]!.start, desc: line.words.slice(nameEnd + 1) };
    });
  }

  /** The section on screen at t (-1: the hook; STYLES.length: the call to action). */
  at(t: number) {
    if (t >= this.ctaStart) return STYLES.length;
    let k = -1;
    this.secs.forEach((s, i) => { if (t >= s.start) k = i; });
    return k;
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out);
    const L = this.layer;
    L.clear();
    const x = L.ctx;
    this.backdrop(x, t);
    this.header(x, t);
    this.list(x, t);
    this.caption(x, t);
    this.card(x, t);
    comp.draw(renderer, L.upload(), out);
    const k = this.at(t), s = k >= 0 && k < STYLES.length ? this.secs[k]! : null;
    const flip = s ? Math.max(0, 1 - Math.abs(t - s.start - FLIP / 2) / (FLIP / 2)) : 0;
    return { bloom: 0, halation: 0, ca: 0.3 + flip, grain: 0.04, vignette: 0.28, hud: 0, zoom: 1 + 0.006 * flip };
  }

  backdrop(x: CanvasRenderingContext2D, t: number) {
    const g = x.createLinearGradient(0, 0, 0, 1920);
    g.addColorStop(0, BG0); g.addColorStop(1, BG1);
    x.fillStyle = g; x.fillRect(0, 0, W, 1920);
    // a teal light from the right, breathing
    const r = x.createRadialGradient(1020, 700, 40, 1020, 700, 900);
    r.addColorStop(0, `rgba(40,200,190,${0.2 + 0.04 * Math.sin(t * 0.8)})`); r.addColorStop(1, 'rgba(40,200,190,0)');
    x.fillStyle = r; x.fillRect(0, 0, W, 1920);
    const r2 = x.createRadialGradient(80, 1500, 40, 80, 1500, 700);
    r2.addColorStop(0, 'rgba(229,50,45,0.12)'); r2.addColorStop(1, 'rgba(229,50,45,0)');
    x.fillStyle = r2; x.fillRect(0, 0, W, 1920);
  }

  header(x: CanvasRenderingContext2D, t: number) {
    const k = 1 + 0.04 * Math.max(0, 1 - t / 0.3); // up from the first frame (the cover), settling
    const fam = F.archivo(87.5, 900), size = 60, label = '20 STILI DI MOTION DESIGN';
    const tw = measure(label, fam, size) + 70;
    x.save();
    x.translate(W / 2, 205); x.scale(k, k);
    x.rotate(-0.012);
    x.fillStyle = RED; x.fillRect(-tw / 2, -50, tw, 92);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(-tw / 2, 42, tw, 6);
    txt(x, label, 0, 20, size, fam, WHITE, { align: 'center' });
    x.restore();
    txt(x, 'che puoi rubare', W / 2, 318, 66, F.serif(600, true), WHITE, { align: 'center', shadow: true });
  }

  list(x: CanvasRenderingContext2D, t: number) {
    const cur = this.at(t);
    this.secs.forEach((sec, i) => {
      const bonus = i === 20;
      const col = bonus ? 0 : Math.floor(i / 10), row = bonus ? 10.35 : i % 10;
      const px = bonus ? W / 2 - 150 : col ? LIST.xr : LIST.xl, py = LIST.y + row * LIST.row;
      // numbers cascade in during the opening line
      const kn = clamp((t + 0.25 - i * 0.03) / 0.2);
      if (kn <= 0) return;
      const num = bonus ? '+1' : `${sec.s.n}.`;
      const fam = F.grotesk(700), size = LIST.size;
      const said = t >= sec.nameAt - 0.05 || cur === STYLES.length;
      txt(x, num, px, py, size, fam, said ? WHITE : DIM, { alpha: kn, shadow: true });
      if (!said) return;
      const nx = px + measure(bonus ? '+1 ' : '20. ', fam, size) + 2;
      const name = sec.s.name;
      const n = cur === STYLES.length ? name.length : Math.min(name.length, Math.floor((t - sec.nameAt + 0.05) * 40));
      const shown = name.slice(0, n);
      if (i === cur) { // the current one, on a red pill
        const pw = measure(name, fam, size) + 22;
        const kp = ease.outBack(clamp((t - sec.nameAt + 0.05) / 0.25));
        x.save(); x.translate(nx - 11 + pw / 2, py - size * 0.33); x.scale(kp, kp);
        rr(x, -pw / 2, -size * 0.72, pw, size * 1.36, 7); x.fillStyle = RED; x.fill();
        x.restore();
      }
      txt(x, shown, nx, py, size, fam, WHITE, { shadow: i !== cur });
      if (bonus) txt(x, '(bonus)', nx + measure(name, fam, size) + 14, py, size * 0.8, F.serif(600, true), YELLOW, { alpha: clamp((t - sec.nameAt - 0.3) / 0.3) });
    });
  }

  /** The line being said, word by word, between the list and the card. */
  caption(x: CanvasRenderingContext2D, t: number) {
    const k = this.at(t);
    const words = k < 0 ? this.hook.words : k >= STYLES.length ? this.cta.words : this.secs[k]!.desc;
    if (!words.length) return;
    const fam = F.grotesk(600);
    const textAll = words.map((w) => w.w).join(' ');
    let size = 38;
    while (measure(textAll, fam, size) > 980 && size > 22) size -= 1;
    const space = measure(' ', fam, size);
    let px = W / 2 - measure(textAll, fam, size) / 2;
    const py = 832;
    for (const w of words) {
      const ww = measure(w.w, fam, size);
      const on = t >= w.start - 0.05, now = on && t < w.end + 0.05;
      if (on) {
        const u = ease.outCubic(clamp((t - w.start + 0.05) / 0.18));
        txt(x, w.w, px, py + (1 - u) * 14, size, fam, now ? YELLOW : WHITE, { alpha: u, shadow: true });
      }
      px += ww + space;
    }
  }

  card(x: CanvasRenderingContext2D, t: number) {
    const k = this.at(t);
    const { x: cx0, y: cy0, w, h, r } = CARD;
    const appear = ease.outBack(clamp((t + 0.3) / 0.45), 1.4);
    if (appear <= 0) return;
    // which face is up, and the flip at each cut
    let draw: () => void, badge = '';
    let sx = 1;
    if (k < 0) { // the montage: flick through all of them
      const m = Math.max(0, t), i = Math.floor(m / 0.16) % STYLES.length;
      const s = STYLES[i]!;
      draw = () => s.tile(x, 1.4 + (m % 0.16), w, h);
      badge = String(s.n);
    } else if (k >= STYLES.length) {
      const lt = t - this.ctaStart;
      sx = Math.abs(Math.cos(Math.PI * clamp(lt / FLIP)));
      draw = lt < FLIP / 2 ? () => STYLES[STYLES.length - 1]!.tile(x, lt + 3, w, h) : () => this.mosaic(x, lt, w, h);
      badge = lt < FLIP / 2 ? String(STYLES.length) : '21';
    } else {
      const sec = this.secs[k]!, lt = t - sec.start;
      const prev = k > 0 ? this.secs[k - 1]! : null;
      sx = Math.abs(Math.cos(Math.PI * clamp(lt / FLIP)));
      if (lt < FLIP / 2) {
        draw = prev ? () => prev.s.tile(x, t - prev.start, w, h) : () => STYLES[STYLES.length - 1]!.tile(x, 2, w, h);
        badge = prev ? String(prev.s.n) : '';
      } else {
        draw = () => sec.s.tile(x, lt - FLIP / 2, w, h);
        badge = String(sec.s.n);
      }
    }
    x.save();
    x.translate(cx0 + w / 2, cy0 + h / 2);
    x.scale(appear * Math.max(0.02, sx), appear);
    x.translate(-w / 2, -h / 2);
    // its shadow, its face, its border
    x.save(); x.fillStyle = 'rgba(0,0,0,0.5)'; x.filter = 'blur(18px)'; rr(x, 8, 22, w, h, r); x.fill(); x.restore();
    x.save(); rr(x, 0, 0, w, h, r); x.clip(); draw(); x.restore();
    rr(x, 0, 0, w, h, r); x.lineWidth = 7; x.strokeStyle = WHITE; x.stroke();
    x.restore();
    // the number badge on the corner
    if (badge) {
      const bk = k >= 0 && k < STYLES.length ? ease.outBack(clamp((t - this.secs[k]!.start - FLIP / 2) / 0.3)) : 1;
      x.save(); x.translate(cx0 + 18, cy0 + 18); x.scale(appear * Math.max(bk, 0.001), appear * Math.max(bk, 0.001));
      x.beginPath(); x.arc(0, 0, 50, 0, Math.PI * 2); x.fillStyle = RED; x.fill(); x.lineWidth = 6; x.strokeStyle = WHITE; x.stroke();
      txt(x, badge, 0, 15, badge.length > 1 ? 40 : 46, F.grotesk(700), WHITE, { align: 'center' });
      x.restore();
    }
  }

  /** All the styles at once, small, and the call to comment. */
  mosaic(x: CanvasRenderingContext2D, lt: number, w: number, h: number) {
    x.fillStyle = BG1; x.fillRect(0, 0, w, h);
    const cols = 6, rows = 4, gap = 6, cw = (w - gap * (cols + 1)) / cols, ch = (h - gap * (rows + 1)) / rows;
    STYLES.forEach((s, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const k = ease.outBack(clamp((lt - FLIP / 2 - (c + r) * 0.04) / 0.3));
      if (k <= 0) return;
      const px = gap + c * (cw + gap), py = gap + r * (ch + gap);
      x.save();
      x.translate(px + cw / 2, py + ch / 2); x.scale(k, k); x.translate(-cw / 2, -ch / 2);
      x.beginPath(); x.roundRect(0, 0, cw, ch, 10); x.clip();
      s.tile(x, 2 + lt, cw, ch);
      x.restore();
    });
    // the call, over the three free cells
    const k = ease.outBack(clamp((lt - 0.9) / 0.35));
    if (k > 0) {
      const px = gap + 3 * (cw + gap), py = gap + 3 * (ch + gap), pw = 3 * cw + 2 * gap;
      x.save(); x.translate(px + pw / 2, py + ch / 2); x.scale(k, k);
      x.beginPath(); x.roundRect(-pw / 2, -ch / 2, pw, ch, 14); x.fillStyle = RED; x.fill();
      txt(x, 'COMMENTA', 0, -ch * 0.08, ch * 0.2, F.archivo(87.5, 900), WHITE, { align: 'center' });
      txt(x, '«STILI»', 0, ch * 0.27, ch * 0.3, F.archivo(87.5, 900), YELLOW, { align: 'center' });
      x.restore();
    }
  }
}

