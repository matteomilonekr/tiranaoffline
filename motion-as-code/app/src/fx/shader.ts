// Backgrounds in GLSL, for when Canvas2D gradients aren't enough: a mesh gradient of drifting colour blobs, an
// aurora of curtains, a kaleidoscope of mirrored noise, a halftone dot screen. Each is an FSPass drawn into the
// scene's target before the Canvas2D layer goes over it (comp.draw with the default 'normal' blend). Colours are
// sRGB hex, converted to the engine's linear light.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { hexToLinear } from '../engine/util';

export type BgKind = 'mesh' | 'aurora' | 'kaleido' | 'halftone';

const FRAG: Record<BgKind, string> = {
  // four colour blobs wandering on noise paths, mixed by inverse distance, with a little grain
  mesh: /* glsl */ `
    uniform float uT; uniform vec3 uC[4]; uniform vec2 uRes; uniform float uSpeed;
    void main() {
      vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0);
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        vec2 c = vec2(0.5 * uRes.x / uRes.y, 0.5) + 0.42 * vec2(snoise(vec2(fi * 3.1, uT * uSpeed)), snoise(vec2(fi * 7.3 + 2.0, uT * uSpeed)));
        float w = 1.0 / pow(length(p - c) + 0.12, 2.4);
        acc += uC[i] * w; wsum += w;
      }
      vec3 col = acc / wsum;
      col += (hash12(gl_FragCoord.xy + fract(uT) * 100.0) - 0.5) * 0.012;
      fragColor = vec4(col, 1.0);
    }`,
  // vertical curtains of light over a dark sky, swaying on noise
  aurora: /* glsl */ `
    uniform float uT; uniform vec3 uC[4]; uniform vec2 uRes; uniform float uSpeed;
    void main() {
      vec2 p = vUv;
      vec3 col = mix(uC[0], uC[1], p.y);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float x = p.x * (1.4 + fi * 0.5) + snoise(vec2(p.y * 1.2 + fi * 4.0, uT * uSpeed * 0.6 + fi)) * 0.35;
        float band = pow(0.5 + 0.5 * sin(x * 6.2831 + uT * uSpeed * (0.6 + fi * 0.2)), 6.0);
        float h = smoothstep(0.15, 0.65, p.y) * (1.0 - smoothstep(0.75, 1.0, p.y));
        col += mix(uC[2], uC[3], fi / 2.0) * band * h * (0.55 + 0.45 * snoise(vec2(x * 3.0, uT * 0.3)));
      }
      fragColor = vec4(col, 1.0);
    }`,
  // noise folded into n mirrored sectors, turning slowly, coloured from the palette
  kaleido: /* glsl */ `
    uniform float uT; uniform vec3 uC[4]; uniform vec2 uRes; uniform float uSpeed; uniform float uN;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(p), a = atan(p.y, p.x) + uT * uSpeed * 0.2;
      float s = 6.2831853 / uN; a = mod(a, s); a = abs(a - s * 0.5);
      vec2 q = vec2(cos(a), sin(a)) * r;
      float n = fbm(q * 3.0 + vec2(uT * uSpeed * 0.3, 0.0), 4);
      vec3 col = mix(uC[0], uC[1], smoothstep(-0.4, 0.4, n));
      col = mix(col, uC[2], smoothstep(0.25, 0.6, n));
      col = mix(col, uC[3], smoothstep(0.55, 0.9, fract(r * 3.0 - uT * uSpeed * 0.25 + n)));
      fragColor = vec4(col * (1.0 - 0.6 * r), 1.0);
    }`,
  // a dot screen whose dots swell with a moving noise field: print, xerox, risograph grounds
  halftone: /* glsl */ `
    uniform float uT; uniform vec3 uC[4]; uniform vec2 uRes; uniform float uSpeed; uniform float uN;
    void main() {
      vec2 px = vUv * uRes;
      float cell = uN; mat2 R = rot2(0.785);
      vec2 g = R * px / cell; vec2 c = fract(g) - 0.5;
      vec2 id = floor(g);
      vec2 world = (transpose(R) * (id + 0.5)) * cell / uRes.y;
      float v = 0.5 + 0.5 * fbm(world * 2.2 + vec2(0.0, uT * uSpeed * 0.2), 3);
      float d = length(c) - 0.5 * sqrt(v);
      float ink = 1.0 - smoothstep(-0.06, 0.06, d);
      fragColor = vec4(mix(uC[0], uC[1], ink), 1.0);
    }`,
};

/** A GLSL background: `new ShaderBg('mesh', ['#..', '#..', '#..', '#..'])`, then render(renderer, out, t). */
export class ShaderBg {
  pass: FSPass;
  constructor(kind: BgKind, colors: string[], o: { speed?: number; n?: number; W?: number; H?: number } = {}) {
    const C = [0, 1, 2, 3].map((i) => new THREE.Vector3(...hexToLinear(colors[i % colors.length]!)));
    this.pass = new FSPass(FRAG[kind], {
      uT: { value: 0 }, uC: { value: C }, uRes: { value: new THREE.Vector2(o.W ?? 1080, o.H ?? 1920) },
      uSpeed: { value: o.speed ?? 0.25 }, uN: { value: o.n ?? (kind === 'halftone' ? 14 : 8) },
    });
  }
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, t: number) {
    this.pass.u.uT!.value = t;
    this.pass.render(renderer, target);
  }
}
