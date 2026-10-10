// The beat grid: the most common ask in the Opus 5.5 list is a showreel "cut to the music", at 120 bpm, with
// something landing on every beat and staggers of a sixteenth. A Grid turns bars and beats into seconds and back,
// snaps times to it and gives pulses on its divisions. analysis/music.py plays at the same 120 bpm, so a film
// whose sound is the music bed alone (no voice) can cut on Grid times and the sound lands with the picture.
import { clamp } from '../engine/util';

export class Grid {
  /** Seconds per beat and per bar. */
  readonly beat: number;
  readonly bar: number;
  constructor(public bpm = 120, public offset = 0, public perBar = 4) {
    this.beat = 60 / bpm;
    this.bar = this.beat * perBar;
  }
  /** The time of bar `b` (0-based), beat `k` in it, plus `s` sixteenths. */
  at(b: number, k = 0, s = 0) { return this.offset + b * this.bar + k * this.beat + (s * this.beat) / 4; }
  /** Continuous beat and bar counts at t (fractional). */
  beats(t: number) { return (t - this.offset) / this.beat; }
  bars(t: number) { return (t - this.offset) / this.bar; }
  /** t snapped to the nearest (or previous) 1/div of a beat: div 1 = beats, 2 = eighths, 4 = sixteenths. */
  snap(t: number, div = 1, mode: 'round' | 'floor' | 'ceil' = 'round') {
    const q = this.beat / div, k = (t - this.offset) / q;
    return this.offset + Math.round(mode === 'floor' ? Math.floor(k) : mode === 'ceil' ? Math.ceil(k) : Math.round(k)) * q;
  }
  /** 1 on each 1/div beat, decaying with half-life hl seconds: flashes, punch-ins, scale bumps on the beat. */
  pulse(t: number, div = 1, hl = 0.08) {
    const q = this.beat / div, u = (((t - this.offset) % q) + q) % q;
    return t < this.offset ? 0 : Math.pow(0.5, u / hl);
  }
  /** 0..1 through the current 1/div beat (a saw on the grid). */
  phase(t: number, div = 1) { const q = this.beat / div; return ((((t - this.offset) % q) + q) % q) / q; }
  /** Index of the section of `bars` bars that t is in (shot k of a showreel cut every 2 bars, say). */
  section(t: number, bars = 1) { return Math.floor(this.bars(t) / bars); }
  /** The step-time of a stop-motion or a scramble that snaps on the grid (changes only on 1/div beats). */
  stepped(t: number, div = 4) { return this.snap(t, div, 'floor'); }
  /** Stagger in sixteenths: item i's delay. */
  sixteenths(i: number, n = 1) { return (i * n * this.beat) / 4; }
}

/**
 * A plan of shots on the grid: each shot is [name, bars]. at(t) says which shot is on, its index, its local 0..1
 * and its start; cuts land exactly on downbeats.
 */
export function shots(grid: Grid, plan: [string, number][], startBar = 0) {
  const list: { name: string; t0: number; t1: number }[] = [];
  let b = startBar;
  for (const [name, bars] of plan) { list.push({ name, t0: grid.at(b), t1: grid.at(b + bars) }); b += bars; }
  return {
    list,
    end: list.at(-1)?.t1 ?? 0,
    at(t: number) {
      let i = 0;
      while (i < list.length - 1 && t >= list[i + 1]!.t0) i++;
      const s = list[i]!;
      return { ...s, i, lt: t - s.t0, p: clamp((t - s.t0) / (s.t1 - s.t0)) };
    },
  };
}
