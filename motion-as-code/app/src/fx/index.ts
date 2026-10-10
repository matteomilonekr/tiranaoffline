// The building blocks distilled from the Opus 5.5 videos list (analysis/opus55.py): what its 317 motion-graphics
// prompts ask for most, as deterministic functions of t for this kit. Import from '@kit/fx'.
//   tl          GSAP-style timing: Timeline with labels and '<' '-=0.3' positions, stagger, E('power2.out'), springs
//   beat        the 120 bpm grid: bars and beats to seconds, snapping, pulses on the beat, shot plans that cut on downbeats
//   text        kinetic type: split reveals behind masks, blur/flip/scale, scramble, typewriter, counters, odometer
//   path        draw-on of SVG paths and glyph outlines, morphs between shapes, blobs, a glint over a logo
//   shared      "never cut": one rounded box springing through sizes and colours, content swapped under a blur
//   camera      2.5D camera: tracks, zoom across scales, fit-to-rect, parallax by depth, handheld, smash-pans
//   transition  masks between two shots: iris, shape, wipe, slices, blinds, tear, letters, push, zoom, flash
//   ui          windows, phone, cursor with clicks, toggle, slider, liquid tabs, toast, ⌘K palette, terminal, button
//   chart       bars, line with area and tooltip, donut, all drawing themselves from the caller's numbers
//   particles   swarms that form words and shapes, bursts of sparks and confetti, ambient dust (optional: many specs ban them)
//   shader      GLSL grounds: mesh gradient, aurora, kaleidoscope, halftone
export * as tl from './tl';
export * as beat from './beat';
export * as text from './text';
export * as path from './path';
export * as shared from './shared';
export * as camera from './camera';
export * as transition from './transition';
export * as ui from './ui';
export * as chart from './chart';
export * as particles from './particles';
export * as shader from './shader';
export { E, tw, stagger, spring, springTo, Timeline } from './tl';
export { Grid } from './beat';
