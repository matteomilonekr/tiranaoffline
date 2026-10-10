// The edit of `magia` (FILM=magia): one plate, thirteen shots cut on the narrator's words, generated objects in kinetic type (scenes/magia.ts).
import type { TimelineEntry } from '@kit/engine/engine';
import type { SceneClass } from '@kit/engine/scene';
import type { Lyrics } from '@kit/engine/lyrics';
import type { AudioData } from '@kit/engine/audio';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(_ly: Lyrics, au: AudioData): TimelineEntry[] {
  return [{ id: 'magia', load: scene('magia'), start: 0, end: au.duration }];
}
