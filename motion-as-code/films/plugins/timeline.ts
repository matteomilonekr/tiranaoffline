// The edit of `plugins` (FILM=plugins): one plate per section of the read, cut 0.18 s before the first word
// of the section's first line. Each plate runs OVERLAP longer than its section: the next one opens with a
// circle wipe over it. Params: the wall's palette (and the one it wipes over), where the presenter stands.
import type { TimelineEntry } from '@kit/engine/engine';
import type { SceneClass } from '@kit/engine/scene';
import type { Lyrics } from '@kit/engine/lyrics';
import type { AudioData } from '@kit/engine/audio';
import { lineOf } from '@kit/scenes/_vo';
import { OVERLAP } from './scenes/_stage';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export const CUT_LEAD = 0.18;

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const cut = (q: string) => {
    const l = lineOf(ly, q);
    const prev = ly.lines[l.i - 1];
    return Math.max(l.words[0]!.start - CUT_LEAD, prev ? Math.min(prev.end + 0.02, l.words[0]!.start - 0.02) : 0);
  };
  const b = {
    superpowers: cut('Il primo è Superpowers'),
    karpathy: cut('Il secondo sono'),
    adhd: cut('Il terzo è'),
    octopus: cut('E infine Claude Octopus'),
    cta: cut('Se vuoi provarli'),
  };
  const E = (id: string, start: number, stop: number, params: Record<string, any>): TimelineEntry =>
    ({ id, load: scene(id), start, end: stop, params });
  return [
    E('hook', 0, b.superpowers + OVERLAP, { pal: 'hook', px: 420 }),
    E('superpowers', b.superpowers, b.karpathy + OVERLAP, { pal: 'super', prev: 'hook', px: 720, prevX: 420 }),
    E('karpathy', b.karpathy, b.adhd + OVERLAP, { pal: 'karpathy', prev: 'super', px: 700, prevX: 720 }),
    E('adhd', b.adhd, b.octopus + OVERLAP, { pal: 'adhd', prev: 'karpathy', px: 540, prevX: 700 }),
    E('octopus', b.octopus, b.cta + OVERLAP, { pal: 'octopus', prev: 'adhd', px: 330, prevX: 540 }),
    E('cta', b.cta, au.duration, { pal: 'cta', prev: 'octopus', px: 540, prevX: 330, last: true }),
  ];
}
