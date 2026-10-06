// The styles, in the order of the list (20 + the ASCII bonus). Import them as `@kit/styles` in a film:
//   import { STYLES, style } from '@kit/styles';
//   const s = style('risograph');  s.ground(x, t, W, H); s.title(x, t, 'Ciao', W / 2, H / 2, 160);  ... s.post
// films/styles shows each tile in turn; README section 09 lists what each one is made of.
import type { Style } from './style';
import { swiss } from './swiss';
import { kinetic } from './kinetic';
import { popart } from './popart';
import { flat } from './flat';
import { clay } from './clay';
import { glass } from './glass';
import { y2k } from './y2k';
import { synthwave } from './synthwave';
import { riso } from './riso';
import { collage } from './collage';
import { glitch } from './glitch';
import { particles } from './particles';
import { neobrutal } from './neobrutal';
import { bauhaus } from './bauhaus';
import { memphis } from './memphis';
import { vaporwave } from './vaporwave';
import { pixel } from './pixel';
import { isometric } from './isometric';
import { lowpoly } from './lowpoly';
import { lineart } from './lineart';
import { ascii } from './ascii';

export type { Style } from './style';

export const STYLES: Style[] = [
  swiss, kinetic, popart, flat, clay, glass, y2k, synthwave, riso, collage,
  glitch, particles, neobrutal, bauhaus, memphis, vaporwave, pixel, isometric, lowpoly, lineart, ascii,
];

/** A style by id ('risograph' and 'riso' both work) or by name, case-insensitive. */
export function style(q: string): Style {
  const k = q.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s = STYLES.find((s) => s.id === k || s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === k || k.startsWith(s.id));
  if (!s) throw new Error(`no such style: ${q} (styles: ${STYLES.map((s) => s.id).join(', ')})`);
  return s;
}
