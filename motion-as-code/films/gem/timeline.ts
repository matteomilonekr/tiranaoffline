// The edit of `gem` (FILM=gem): one plate for the whole read; it cuts its own shots on the words (scenes/gem.ts).
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
  return [{ id: 'gem', load: scene('gem'), start: 0, end: au.duration }];
}
