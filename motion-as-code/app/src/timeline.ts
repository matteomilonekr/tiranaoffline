// The edit: which plate plays when. Every cut is anchored to a line of the voiceover by its words
// (data/lyrics.json), so a new read re-times the whole video by itself.
//
// To add a plate: create app/src/scenes/yourplate.ts and add one E('yourplate', 'yourplate', start, end)
// line below. cut('words of a line') is 0.18 s before that line's first word (in the pause before it);
// end() is the end of the voiceover.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import { lineOf } from './scenes/_vo';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

/** Lead of a cut before the first word of its line (s). */
export const CUT_LEAD = 0.18;

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** 0.18 s before the first word of the line that contains `q` (never before the previous line's end). */
  const cut = (q: string, nth = 0) => {
    const l = lineOf(ly, q, nth);
    const prev = ly.lines[l.i - 1];
    return Math.max(l.words[0]!.start - CUT_LEAD, prev ? Math.min(prev.end + 0.02, l.words[0]!.start - 0.02) : 0);
  };
  const end = () => au.duration;

  const E = (id: string, file: string, start: number, stop: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end: stop, ...extra });

  const b = {
    model: cut('Questo è Claude Code'),
    prompt: cut('Per esempio'),
    crazy: cut('Ed è qui che diventa folle'),
    code: cut('Scrive l’animazione stessa'),
    frames: cut('Poi viene renderizzata'),
    pipeline: cut('Il vecchio flusso'),
    edits: cut('E siccome è tutto procedurale'),
    verdict: cut('Quindi: sostituisce After Effects'),
  };

  return [
    E('hook', 'hook', 0, b.model),
    E('model', 'model', b.model, b.prompt),
    E('prompt', 'prompt', b.prompt, b.crazy),
    E('crazy', 'crazy', b.crazy, b.code),
    E('code', 'code', b.code, b.frames),
    E('frames', 'frames', b.frames, b.pipeline),
    E('pipeline', 'pipeline', b.pipeline, b.edits),
    E('edits', 'edits', b.edits, b.verdict),
    E('verdict', 'verdict', b.verdict, end()),
  ];
}
