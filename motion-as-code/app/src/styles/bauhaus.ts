// 14 · Bauhaus: circle, square, triangle in the primaries, black bars, a cream ground and lowercase geometric
// type. The pieces slide in from the edges and turn into place like parts of a machine.
import { type Style, F, txt, inn, ease, lerp, TAU } from './style';

const CREAM = '#efe5cf', RED = '#d6382c', BLUE = '#1f4e9c', YELLOW = '#f2c12e', INK = '#151515';

export const bauhaus: Style = {
  n: 14, id: 'bauhaus', name: 'Bauhaus',
  what: 'Cerchio, quadrato e triangolo nei colori primari, barre nere, tipografia geometrica minuscola.',
  recipe: 'Fondo crema, composizione su griglia con forme geometriche pure (cerchio rosso, quadrato blu, triangolo giallo, semicerchi e barre nere), tipografia geometrica tutta minuscola; le forme entrano scorrendo dai bordi e ruotano in posizione con un movimento meccanico (inOutCubic), niente ombre né gradienti.',
  palette: { bg: CREAM, ink: INK, accents: [RED, BLUE, YELLOW] },
  fonts: { title: F.archivo(100, 900), text: F.archivo(100, 500) },
  motion: { ease: ease.inOutCubic, steps: 0 },
  post: { bloom: 0, halation: 0, ca: 0, grain: 0.035, vignette: 0.05 },

  ground(x, _t, w, h) { x.fillStyle = CREAM; x.fillRect(0, 0, w, h); },

  title(x, t, s, cx, cy, size) {
    const k = inn(t, 0, 0.6, ease.inOutCubic);
    x.save(); x.beginPath(); x.rect(cx - w2(size, s), cy - size, w2(size, s) * 2, size * 1.3); x.clip();
    txt(x, s.toLowerCase(), cx, cy + size * 0.35 + (1 - k) * size, size, F.archivo(100, 900), INK, { align: 'center', track: -size * 0.03 });
    x.restore();
  },

  tile(x, t, w, h) {
    this.ground(x, t, w, h);
    const e = ease.inOutCubic;
    // the red circle rolls in from the left
    const k1 = inn(t, 0.0, 0.7, e), r = w * 0.2;
    const cx = lerp(-r, w * 0.3, k1), cy = h * 0.3;
    x.fillStyle = RED; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    // a black bar slides across, a half circle swings over it
    const k2 = inn(t, 0.15, 0.6, e);
    x.fillStyle = INK; x.fillRect(w * 0.08, h * 0.535, w * 0.84 * k2, h * 0.04);
    const k3 = inn(t, 0.35, 0.7, e);
    x.save(); x.translate(w * 0.72, h * 0.535); x.rotate(lerp(-Math.PI, 0, k3));
    x.fillStyle = INK; x.beginPath(); x.arc(0, 0, w * 0.13, Math.PI, TAU); x.closePath(); x.fill();
    x.restore();
    // the blue square turns 45 degrees as it lands
    const k4 = inn(t, 0.2, 0.75, e), s = w * 0.22;
    x.save(); x.translate(w * 0.72, lerp(-s, h * 0.27, k4)); x.rotate(lerp(0, Math.PI / 4, k4) + Math.sin(t * 0.8) * 0.02);
    x.fillStyle = BLUE; x.fillRect(-s / 2, -s / 2, s, s);
    x.restore();
    // the yellow triangle rises from the bottom
    const k5 = inn(t, 0.4, 0.7, e), ty = lerp(h * 1.3, h * 0.83, k5);
    x.fillStyle = YELLOW; x.beginPath(); x.moveTo(w * 0.08, ty + h * 0.12); x.lineTo(w * 0.24, ty - h * 0.16); x.lineTo(w * 0.4, ty + h * 0.12); x.closePath(); x.fill();
    // lowercase type, and the date
    const k6 = inn(t, 0.6, 0.6, e);
    x.save(); x.beginPath(); x.rect(w * 0.3, h * 0.62, w * 0.68, h * 0.26); x.clip();
    txt(x, 'bauhaus', w * 0.93, h * 0.82 + (1 - k6) * h * 0.2, h * 0.14, F.archivo(100, 900), INK, { align: 'right', track: -h * 0.005 });
    x.restore();
    txt(x, 'weimar · 1919', w * 0.93, h * 0.9, h * 0.035, F.archivo(100, 500), RED, { align: 'right', alpha: inn(t, 0.9, 0.4) });
  },
};

/** Half the width of a title (for its mask). */
function w2(size: number, s: string) { return s.length * size * 0.36 + size; }
