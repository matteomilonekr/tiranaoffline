// The 3D funnel graph: one billboard per creative stack, a glowing ring per group, a
// wireframe funnel of meridians, and an orbit camera that eases between the overview
// and a focused ring. Depth of field is faked per card by mixing a sharp texture with a
// tiny blurred twin, so it stays cheap on laptops and phones.

import * as THREE from 'three';
import { meridianProfile } from './layout.js';
import { MatrixWorld, textSprite } from './matrix3d.js';

const CARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uSharp;
uniform sampler2D uSoft;
uniform float uBlur;
uniform float uDim;
uniform float uOpacity;
uniform float uBorderOn;
uniform vec3 uBorder;
uniform vec4 uFrame;
uniform vec2 uBorderW;
varying vec2 vUv;
void main() {
  vec4 a = texture2D(uSharp, vUv);
  vec4 b = texture2D(uSoft, vUv);
  vec4 c = mix(a, b, clamp(uBlur, 0.0, 1.0));
  // A coloured frame around the creative, in the card's margin (the matrix's quadrant).
  vec2 out2 = max((uFrame.xy - vUv) / uBorderW, (vUv - uFrame.zw) / uBorderW);
  float outside = max(out2.x, out2.y);
  if (uBorderOn > 0.5 && outside > 0.0 && outside < 1.0) c = vec4(uBorder, 1.0);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(c.rgb, vec3(l), uDim * 0.6) * (1.0 - uDim * 0.5);
  float alpha = c.a * uOpacity;
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(c.rgb, alpha);
}`;

const GLOW_VERT = /* glsl */ `
varying float vR;
void main() {
  vR = length(position.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uR;
uniform float uW;
varying float vR;
void main() {
  float d = (vR - uR) / uW;
  float a = exp(-d * d * 3.0) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`;

function srgbVec(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

export class FunnelGraphScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onHover?:Function, onSelect?:Function, onFrame?:Function, onInteract?:Function}} hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.maxAniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.plane = new THREE.PlaneGeometry(1, 1);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.cards = [];
    this.rings = [];
    this.focusKey = null;
    this.hovered = null;
    this.selectedId = null;
    this.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.interactUntil = 0;

    this.view = { yaw: 0.55, pitch: 0.3, dist: 16, tx: 0, ty: 0.3, tz: 0 };
    this.goal = { ...this.view };
    this.userZoom = 1;
    this.mode = 'funnel';
    this.matrixWorld = null;
    this.insets = { top: 0, right: 0, bottom: 0 };
    this.swayT = 0;

    this._tmpRight = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3();
    this._tmpV = new THREE.Vector3();

    this._bindInput();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();

    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._loop(t));
    document.addEventListener('visibilitychange', () => {
      this._last = performance.now();
    });
  }

  // ---------- data ----------

  /**
   * @param {{rings:Array, cards:Array}} layout
   * @param {Map<string,{sharp:HTMLCanvasElement, soft:HTMLCanvasElement, frame:Object, outW:number, outH:number}>} artwork
   */
  setData(layout, artwork) {
    this._clear();
    this.layout = layout;
    if (this.mode !== 'funnel') {
      // Back from the matrix or the map: the funnel's own framing, not their zoom.
      this.userZoom = 1;
      this._pitchTouched = false;
    }
    this.mode = 'funnel';
    this.goal.tx = this.goal.tz = 0;
    this.goal.yaw = this.view.yaw;

    // Meridians: the funnel's wireframe.
    const profile = meridianProfile(layout.rings);
    if (profile.length >= 3) {
      const count = 30;
      const segs = 90;
      const positions = [];
      const colors = [];
      for (let m = 0; m < count; m++) {
        const theta = (m / count) * Math.PI * 2;
        const curve = new THREE.CatmullRomCurve3(
          profile.map((p) => new THREE.Vector3(Math.cos(theta) * p.r, p.y, Math.sin(theta) * p.r)),
          false,
          'centripetal',
        );
        const pts = curve.getPoints(segs);
        for (let i = 0; i < pts.length - 1; i++) {
          const t0 = i / segs;
          const t1 = (i + 1) / segs;
          positions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
          // Fade in from the flared lip, fade out into the bulb.
          const alpha = (t) => 0.17 * Math.min(1, t / 0.22) * Math.min(1, (1 - t) / 0.12);
          colors.push(1, 1, 1, alpha(t0), 1, 1, 1, alpha(t1));
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
      const lines = new THREE.LineSegments(geo, mat);
      lines.renderOrder = 0;
      this.world.add(lines);
      this.meridians = lines;
    }

    // Rings and their glow bands.
    for (const ring of layout.rings) {
      const pts = [];
      const n = 192;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * ring.r, 0, Math.sin(a) * ring.r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(ring.color), transparent: true, opacity: 0.5, depthWrite: false });
      const line = new THREE.LineLoop(geo, mat);
      line.position.y = ring.y;
      line.renderOrder = 1;
      this.world.add(line);

      const width = 0.16 + ring.r * 0.02;
      const glowGeo = new THREE.RingGeometry(Math.max(0.01, ring.r - width * 2.2), ring.r + width * 2.2, 160, 1);
      const glowMat = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uColor: { value: srgbVec(ring.color) }, uOpacity: { value: 0 }, uR: { value: ring.r }, uW: { value: width } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = ring.y;
      glow.renderOrder = 1;
      this.world.add(glow);
      this.rings.push({ ring, line, glow, lineOpacity: 0.5, glowOpacity: 0 });
    }

    for (const card of layout.cards) this._addCard(card, artwork.get(card.stack.id), null);

    this.appearStart = performance.now();
    this._applyViewGoal(true);
  }

  /**
   * The Spend × ROAS box: the same cards, placed by spend, ROAS and funnel lane. `opts` as
   * MatrixWorld takes them; `colors` also frames each card in its quadrant's colour.
   */
  setMatrix(opts, artwork) {
    const entering = this.mode !== 'matrix';
    this._clear();
    this.layout = null;
    this.mode = 'matrix';
    this.focusKey = opts.focus || null;
    this.colors = opts.colors;
    this.matrixWorld = new MatrixWorld(opts);
    this.matrixWorld.setFocus(this.focusKey);
    this.world.add(this.matrixWorld.group);
    for (const card of this.matrixWorld.cards) this._addCard(card, artwork.get(card.stack.id), this.colors[card.group]);
    if (entering) {
      this.userZoom = 1;
      this._pitchTouched = false;
      this.goal.yaw = this.view.yaw = 0.26;
      this.goal.pitch = this.view.pitch = 0.12;
      this.swayT = 0;
      this.appearStart = performance.now();
    }
    this._applyViewGoal(entering);
  }

  /**
   * The similarity map: cards where the similarity map put them, each framed in its
   * family's colour, a faint link to its nearest look-alikes, the families' names over them.
   * @param {{cards:Array, links:Array<[number, number, number]>, families:Array<{key:string, label:string, color:string}>}} cloud
   */
  setCloud(cloud, artwork) {
    const entering = this.mode !== 'cloud';
    this._clear();
    this.layout = null;
    this.mode = 'cloud';
    this.colors = Object.fromEntries(cloud.families.map((f) => [f.key, f.color]));
    for (const card of cloud.cards) this._addCard(card, artwork.get(card.stack.id), this.colors[card.group]);

    // Links: each card to its two nearest look-alikes, brighter the more alike.
    const pos = [];
    const col = [];
    for (const [i, j, sim] of cloud.links) {
      const a = cloud.cards[i];
      const b = cloud.cards[j];
      const c = new THREE.Color(a.group === b.group ? this.colors[a.group] : '#8a877f');
      const alpha = Math.max(0.06, Math.min(0.5, (sim - 0.5) * 1.1));
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    this.links = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.links.renderOrder = 1;
    this.world.add(this.links);

    // Each family's centre and reach, and its name just above it.
    this.families = cloud.families.map((f) => {
      const members = cloud.cards.filter((c) => c.group === f.key);
      const center = new THREE.Vector3();
      for (const c of members) center.add(new THREE.Vector3(c.x, c.y, c.z));
      center.divideScalar(Math.max(1, members.length));
      let r = 0.8;
      for (const c of members) r = Math.max(r, center.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) + c.h / 2);
      const label = textSprite(`${f.label} · ${members.length}`, { size: 0.3, color: f.color, weight: 650, order: 6 });
      // The name sits just over the family's highest card.
      const top = Math.max(...members.map((c) => c.y + c.h / 2), center.y);
      label.position.set(center.x, top + 0.4, center.z);
      this.world.add(label);
      return { key: f.key, center, r, label };
    });
    // Framed on where most cards are: a lone outlier may sit outside the first view.
    const radii = cloud.cards.map((c) => Math.hypot(c.x, c.y, c.z) + c.h / 2).sort((a, b) => a - b);
    this.reach = Math.max(1, radii[Math.floor((radii.length - 1) * 0.94)] || 1);
    if (entering) {
      this.userZoom = 1;
      this._pitchTouched = false;
      this.goal.pitch = this.view.pitch = 0.22;
      this.appearStart = performance.now();
    }
    this._applyViewGoal(entering);
  }

  /** The matrix's lines moved: planes, quadrants and card frames follow. */
  setMatrixLines(lines) {
    const mw = this.matrixWorld;
    if (!mw) return;
    mw.setLines(lines);
    this._refreshBorders();
    if (this.focusKey) this._applyViewGoal(false);
  }

  _refreshBorders() {
    for (const mesh of this.cards) {
      const hex = this.colors?.[mesh.userData.card.group];
      if (hex) mesh.material.uniforms.uBorder.value.copy(srgbVec(hex));
    }
  }

  _addCard(card, art, borderHex) {
    {
      if (!art) return;
      const sharp = new THREE.CanvasTexture(art.sharp);
      sharp.anisotropy = this.maxAniso;
      sharp.minFilter = THREE.LinearMipmapLinearFilter;
      sharp.generateMipmaps = true;
      const soft = new THREE.CanvasTexture(art.soft);
      soft.minFilter = THREE.LinearFilter;
      soft.generateMipmaps = false;
      const mat = new THREE.ShaderMaterial({
        vertexShader: CARD_VERT,
        fragmentShader: CARD_FRAG,
        uniforms: {
          uSharp: { value: sharp },
          uSoft: { value: soft },
          uBlur: { value: 0.6 },
          uDim: { value: 0 },
          uOpacity: { value: 0 },
          uBorderOn: { value: borderHex ? 1 : 0 },
          uBorder: { value: srgbVec(borderHex || '#ffffff') },
          // The creative's rectangle inside the card canvas, in UV (y up), and the frame's width.
          uFrame: {
            value: new THREE.Vector4(
              art.frame.x / art.outW,
              1 - (art.frame.y + art.frame.h) / art.outH,
              (art.frame.x + art.frame.w) / art.outW,
              1 - art.frame.y / art.outH,
            ),
          },
          uBorderW: { value: new THREE.Vector2((art.frame.x * 0.85) / art.outW, (art.frame.x * 0.85) / art.outH) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.plane, mat);
      const sx = card.w / art.frame.w;
      const sy = card.h / art.frame.h;
      const planeW = art.outW * sx;
      const planeH = art.outH * sy;
      const offX = (art.outW / 2 - (art.frame.x + art.frame.w / 2)) * sx;
      const offY = -(art.outH / 2 - (art.frame.y + art.frame.h / 2)) * sy;
      mesh.renderOrder = 2;
      mesh.userData = { card, planeW, planeH, offX, offY, scale: 1, blur: 0.6, dim: 0, opacity: 0, appear: Math.random() * 0.35 };
      mesh.scale.set(planeW, planeH, 1);
      this.world.add(mesh);
      this.cards.push(mesh);
    }
  }

  _clear() {
    if (this.matrixWorld) {
      this.matrixWorld.dispose();
      this.matrixWorld = null;
    }
    this.families = [];
    this.links = null;
    this.highlight = null;
    this.overlapLines = null;
    for (const obj of [...this.world.children]) {
      this.world.remove(obj);
      if (obj.geometry && obj.geometry !== this.plane) obj.geometry.dispose();
      if (obj.material) {
        const u = obj.material.uniforms;
        if (u?.uSharp) u.uSharp.value.dispose();
        if (u?.uSoft) u.uSoft.value.dispose();
        obj.material.dispose();
      }
    }
    this.cards = [];
    this.rings = [];
    this.meridians = null;
    this.hovered = null;
  }

  // ---------- view state ----------

  setFocus(key) {
    this.focusKey = key ?? null;
    this.userZoom = 1;
    this.matrixWorld?.setFocus(this.focusKey);
    this._applyViewGoal(false);
  }

  setSelected(stackId) {
    this.selectedId = stackId ?? null;
  }

  /**
   * Picks out a set of cards in the similarity map (creatives too alike to test against each
   * other), ties each pair with a red line and frames them; null lets go.
   * @param {Set<string>|null} ids stack ids
   * @param {Array<[string, string]>} pairs stack id pairs to tie
   */
  setHighlight(ids, pairs = []) {
    this.highlight = ids?.size ? ids : null;
    if (this.overlapLines) {
      this.world.remove(this.overlapLines);
      this.overlapLines.geometry.dispose();
      this.overlapLines.material.dispose();
      this.overlapLines = null;
    }
    if (this.highlight && this.mode === 'cloud') {
      const at = new Map(this.cards.map((m) => [m.userData.card.stack.id, m.userData.card]));
      const pos = [];
      for (const [a, b] of pairs) {
        const p = at.get(a);
        const q = at.get(b);
        if (p && q) pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.overlapLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xe8605a, transparent: true, opacity: 0.9, depthWrite: false }));
      this.overlapLines.renderOrder = 2;
      this.world.add(this.overlapLines);
    }
    this.userZoom = 1;
    this._applyViewGoal(false);
  }

  setAutoRotate(on) {
    this.autoRotate = !!on;
  }

  resetView() {
    this.focusKey = null;
    this.userZoom = 1;
    this._pitchTouched = false;
    this.matrixWorld?.setFocus(null);
    const home = this.mode === 'matrix' ? 0.26 : 0.55;
    this.goal.yaw = this.view.yaw - (((this.view.yaw - home) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.goal.pitch = this.mode === 'matrix' ? 0.12 : this.mode === 'cloud' ? 0.22 : 0.3;
    this.swayT = 0;
    this._applyViewGoal(false);
  }

  /** Zoom by a factor, toward the centre (the buttons). */
  zoomBy(factor) {
    this._zoomTo(this.userZoom / factor);
    this._interacted();
  }

  /** The part of the canvas the overlays leave free: width and height in pixels. */
  _visible() {
    const { top, right, bottom } = this.insets;
    return { w: Math.max(1, this.width - right), h: Math.max(1, this.height - top - bottom) };
  }

  _fitDistance(halfW, halfH) {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const tan = Math.tan(vfov / 2);
    const { w, h } = this._visible();
    return Math.max(halfW / (tan * (w / this.height)), halfH / (tan * (h / this.height)));
  }

  _applyViewGoal(instant) {
    if (this.mode === 'cloud') {
      let fam = this.focusKey ? this.families.find((f) => f.key === this.focusKey) : null;
      if (this.highlight) {
        const members = this.cards.map((m) => m.userData.card).filter((c) => this.highlight.has(c.stack.id));
        const center = new THREE.Vector3();
        for (const c of members) center.add(new THREE.Vector3(c.x, c.y, c.z));
        center.divideScalar(Math.max(1, members.length));
        let r = 0.8;
        for (const c of members) r = Math.max(r, center.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) + c.h / 2);
        // Framed wide enough to show where the group sits, not only its cards.
        fam = { center, r: Math.max(3.4, r * 1.3) };
      }
      const center = fam ? fam.center : new THREE.Vector3();
      const r = fam ? Math.max(2.2, fam.r) : this.reach;
      this.goal.dist = (this._fitDistance(r, r) + r * 0.25) * this.userZoom;
      this.goal.tx = center.x;
      this.goal.ty = center.y;
      this.goal.tz = center.z;
      if (!this._pitchTouched) this.goal.pitch = 0.22;
      if (instant) Object.assign(this.view, this.goal);
      return;
    }
    if (this.mode === 'matrix' && this.matrixWorld) {
      const f = this.matrixWorld.frame(this.focusKey);
      // The frame is measured on the box's front face, half its depth nearer than its centre.
      this.goal.dist = (this._fitDistance(f.halfW, f.halfH) + this.matrixWorld.box.D) * this.userZoom;
      this.goal.tx = f.cx;
      this.goal.ty = f.cy;
      this.goal.tz = 0;
      if (!this._pitchTouched) this.goal.pitch = this.focusKey ? 0.08 : 0.12;
      if (instant) Object.assign(this.view, this.goal);
      return;
    }
    const rings = this.layout?.rings || [];
    if (!rings.length) return;
    const vis = this._visible();
    const narrow = vis.w / vis.h < 0.85;
    if (this.focusKey) {
      const ring = rings.find((r) => r.key === this.focusKey);
      if (ring) {
        const halfW = ring.r * (narrow ? 0.9 : 1.3);
        const halfH = (ring.band[1] - ring.band[0]) / 2 + (narrow ? 2.2 : 1.6);
        this.goal.dist = Math.max(7.5, this._fitDistance(halfW, halfH)) * this.userZoom;
        this.goal.ty = (ring.band[0] + ring.band[1]) / 2 - 0.1;
        if (!this._pitchTouched) this.goal.pitch = 0.24;
      }
    } else {
      const top = Math.max(...rings.map((r) => r.band[1])) + 0.4;
      const bottom = Math.min(...rings.map((r) => r.y)) - 2.2;
      const maxR = Math.max(...rings.map((r) => r.r));
      const halfW = maxR * (narrow ? 0.7 : 1.22);
      const halfH = (top - bottom) / 2 + 0.75;
      this.goal.dist = this._fitDistance(halfW, halfH) * this.userZoom;
      // Leave room for the stats pill above the top cards.
      this.goal.ty = (top + bottom) / 2 + 0.35;
      if (!this._pitchTouched) this.goal.pitch = 0.3;
    }
    if (instant) Object.assign(this.view, this.goal);
  }

  resize() {
    const el = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this._updateProjection();
    this._applyViewGoal(false);
  }

  /** Keeps the scene centred in the part of the stage a side panel leaves visible. */
  setInsetRight(px) {
    this.setInsets({ ...this.insets, right: Math.max(0, px || 0) });
  }

  /** Overlays covering the stage's top, right and bottom: the scene centres in what is left. */
  setInsets({ top = 0, right = 0, bottom = 0 }) {
    const next = { top: Math.max(0, top), right: Math.max(0, right), bottom: Math.max(0, bottom) };
    if (next.top === this.insets.top && next.right === this.insets.right && next.bottom === this.insets.bottom) return;
    this.insets = next;
    this._updateProjection();
    this._applyViewGoal(false);
  }

  _updateProjection() {
    const { top, right, bottom } = this.insets;
    // The whole canvas keeps its own aspect (nothing stretches); the view window shifts so
    // the scene's centre lands in the middle of the free part.
    this.camera.aspect = this.width / this.height;
    const ox = right / 2;
    const oy = (bottom - top) / 2;
    if (ox || oy) this.camera.setViewOffset(this.width, this.height, ox, oy, this.width, this.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // ---------- input ----------

  _bindInput() {
    const c = this.canvas;
    const pointers = new Map();
    let downAt = null;
    let moved = 0;
    let pinchStart = 0;
    let pinchZoom = 1;
    let panning = false;
    const setPointer = (e) => {
      const rect = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.pointerPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    c.addEventListener('contextmenu', (e) => {
      if (this.mode !== 'funnel') e.preventDefault();
    });

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setPointer(e);
      if (pointers.size === 1) {
        downAt = { x: e.clientX, y: e.clientY };
        moved = 0;
        // In the matrix: a line's plane or tag drags that line; right button or Shift pans.
        panning = this.mode !== 'funnel' && (e.button === 2 || e.shiftKey);
        if (this.mode === 'matrix' && !panning && !this._pick()) {
          const handle = this._pickHandle();
          if (handle) {
            this.lineDrag = { kind: handle.object.userData.line, plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -handle.point.z) };
            c.classList.add('dragging-line');
          }
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = this.userZoom;
        this.lineDrag = null;
        c.classList.remove('dragging-line');
      }
      this._interacted();
    });

    c.addEventListener('pointermove', (e) => {
      setPointer(e);
      this.pointerInside = true;
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.lineDrag && pointers.size === 1) {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const p = this.raycaster.ray.intersectPlane(this.lineDrag.plane, this._tmpV);
        if (p) this.hooks.onLines?.(this.matrixWorld.lineAt(this.lineDrag.kind, p), false);
        moved += Math.abs(dx) + Math.abs(dy);
        this._interacted();
        return;
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart > 0) this._zoomTo(pinchZoom * (pinchStart / Math.max(1, d)));
        // Two fingers moving together pan the matrix.
        if (this.mode !== 'funnel') this._pan(dx / 2, dy / 2);
        moved += 10;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (panning && moved > 2) {
        c.classList.add('dragging');
        this._pan(dx, dy);
        this._interacted();
        return;
      }
      if (moved > 4) {
        c.classList.add('dragging');
        this.goal.yaw -= dx * 0.0055;
        this.view.yaw -= dx * 0.0055;
        const [lo, hi] = this.mode === 'matrix' ? [-0.35, 1.2] : this.mode === 'cloud' ? [-1.2, 1.3] : [-0.15, 0.95];
        this.goal.pitch = Math.max(lo, Math.min(hi, this.goal.pitch + dy * 0.0035));
        if (Math.abs(dy) > 0) this._pitchTouched = true;
        this._interacted();
      }
    });

    const end = (e) => {
      const wasClick = pointers.size === 1 && moved <= 6 && downAt && !this.lineDrag;
      if (this.lineDrag) {
        this.lineDrag = null;
        c.classList.remove('dragging-line');
        this.hooks.onLines?.(this.matrixWorld?.lines, true);
      }
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        c.classList.remove('dragging');
        panning = false;
      }
      if (wasClick && e.type === 'pointerup') {
        const hit = this._pick();
        this.hooks.onSelect?.(hit ? hit.userData.card : null);
      }
      if (pointers.size < 2) pinchStart = 0;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      if (this.hovered) {
        this.hovered = null;
        this.hooks.onHover?.(null);
      }
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        setPointer(e);
        const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012));
        const before = this.userZoom;
        this._zoomTo(this.userZoom * factor);
        // In the matrix and the map the zoom heads for the point under the cursor: on the
        // matrix's front plane, or on the plane through the map's centre facing the camera.
        if (this.mode !== 'funnel') {
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const plane = new THREE.Plane();
          if (this.mode === 'matrix') plane.set(new THREE.Vector3(0, 0, 1), 0);
          else plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(this.goal.tx, this.goal.ty, this.goal.tz));
          const p = this.raycaster.ray.intersectPlane(plane, this._tmpV);
          if (p) {
            const k = 1 - this.userZoom / before;
            this.goal.tx += (p.x - this.goal.tx) * k;
            this.goal.ty += (p.y - this.goal.ty) * k;
            this.goal.tz += (p.z - this.goal.tz) * k;
            this._clampTarget();
          }
        }
        this._interacted();
      },
      { passive: false },
    );
  }

  _zoomTo(z) {
    const before = this.userZoom;
    // The matrix holds many small cards: it zooms in further.
    this.userZoom = Math.max(this.mode === 'matrix' ? 0.12 : this.mode === 'cloud' ? 0.15 : 0.35, Math.min(2.2, z));
    this.goal.dist *= this.userZoom / before;
  }

  /** Moves the point the camera orbits by a drag of dx, dy pixels, in the screen's plane. */
  _pan(dx, dy) {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const k = (2 * this.view.dist * Math.tan(vfov / 2)) / this.height;
    this._tmpRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._tmpUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    for (const t of [this.goal, this.view]) {
      t.tx += -this._tmpRight.x * dx * k + this._tmpUp.x * dy * k;
      t.ty += -this._tmpRight.y * dx * k + this._tmpUp.y * dy * k;
      t.tz += -this._tmpRight.z * dx * k + this._tmpUp.z * dy * k;
    }
    this._clampTarget();
  }

  _clampTarget() {
    let lo;
    let hi;
    if (this.mode === 'matrix' && this.matrixWorld) {
      const { W, H, D } = this.matrixWorld.box;
      [lo, hi] = [[-W / 2 - 1, -0.5, -D / 2], [W / 2 + 1, H + 0.5, D / 2]];
    } else if (this.mode === 'cloud') {
      const r = this.reach || 1;
      [lo, hi] = [[-r, -r, -r], [r, r, r]];
    } else return;
    for (const t of [this.goal, this.view]) {
      t.tx = Math.max(lo[0], Math.min(hi[0], t.tx));
      t.ty = Math.max(lo[1], Math.min(hi[1], t.ty));
      t.tz = Math.max(lo[2], Math.min(hi[2], t.tz));
    }
  }

  _pickHandle() {
    if (!this.matrixWorld) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.matrixWorld.handles, false)[0] || null;
  }

  _interacted() {
    this.interactUntil = performance.now() + 4500;
    this.hooks.onInteract?.();
  }

  _pick() {
    if (!this.cards.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.cards, false);
    for (const h of hits) {
      const u = h.object.material.uniforms;
      if (u.uOpacity.value < 0.15) continue;
      return h.object;
    }
    return null;
  }

  // ---------- projection helpers for DOM overlays ----------

  /** Screen position of each ring's centre height and right edge. */
  projectRings() {
    const out = [];
    this._tmpRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    for (const r of this.rings) {
      const center = this._tmpV.set(0, r.ring.y, 0).project(this.camera);
      const cy = (-center.y * 0.5 + 0.5) * this.height;
      const edge = new THREE.Vector3(0, r.ring.y, 0).addScaledVector(this._tmpRight, r.ring.r).project(this.camera);
      const ex = (edge.x * 0.5 + 0.5) * this.width;
      out.push({ key: r.ring.key, y: cy, edgeX: ex, behind: center.z > 1 });
    }
    return out;
  }

  /** Screen position of a card (for anchoring the tooltip). */
  projectCard(mesh) {
    const p = this._tmpV.copy(mesh.position).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height };
  }

  // ---------- frame loop ----------

  _loop(now) {
    this._raf = requestAnimationFrame((t) => this._loop(t));
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;

    const matrix = this.mode === 'matrix';
    if (this.autoRotate && now > this.interactUntil) {
      if (matrix) {
        // The matrix sways a little either side of its front instead of turning round.
        const before = Math.sin(this.swayT * 0.21) * 0.24;
        this.swayT += dt;
        const step = Math.sin(this.swayT * 0.21) * 0.24 - before;
        this.goal.yaw += step;
        this.view.yaw += step;
      } else {
        this.goal.yaw += dt * 0.07;
        this.view.yaw += dt * 0.07;
      }
    }
    this.view.yaw = damp(this.view.yaw, this.goal.yaw, 6, dt);
    this.view.pitch = damp(this.view.pitch, this.goal.pitch, 4, dt);
    this.view.dist = damp(this.view.dist, this.goal.dist, 3.6, dt);
    this.view.tx = damp(this.view.tx, this.goal.tx, 3.6, dt);
    this.view.ty = damp(this.view.ty, this.goal.ty, 3.6, dt);
    this.view.tz = damp(this.view.tz, this.goal.tz, 3.6, dt);

    const { yaw, pitch, dist, tx, ty, tz } = this.view;
    this.camera.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, tz + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(tx, ty, tz);
    this.camera.updateMatrixWorld();

    // Hover picking, once per frame.
    if (this.pointerInside && this.cards.length) {
      const busy = this.canvas.classList.contains('dragging') || !!this.lineDrag;
      const hit = busy ? null : this._pick();
      if (hit !== this.hovered) {
        this.hovered = hit;
        this.canvas.classList.toggle('pointing', !!hit);
        this.hooks.onHover?.(hit ? hit.userData.card : null, hit ? this.projectCard(hit) : null);
      }
      if (matrix && !busy) {
        const handle = hit ? null : this._pickHandle();
        const kind = handle?.object.userData.line;
        this.canvas.classList.toggle('resize-x', kind === 'spend');
        this.canvas.classList.toggle('resize-y', kind === 'roas');
      }
    }

    this._tmpRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._tmpUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    const focusDist = dist;
    const appearT = (now - (this.appearStart || 0)) / 1000;

    for (const mesh of this.cards) {
      const d = mesh.userData;
      const card = d.card;
      const inGroup = this.highlight ? this.highlight.has(card.stack.id) : !this.focusKey || card.group === this.focusKey;
      const isHover = mesh === this.hovered;
      const isSelected = card.stack.id === this.selectedId;
      let blur;
      let dim;
      let opacity;
      if (!this.focusKey && !this.highlight) {
        const camDist = this._tmpV.set(card.x, card.y, card.z).distanceTo(this.camera.position);
        const soft = this.mode !== 'funnel';
        blur = Math.max(0, Math.min(soft ? 0.3 : 0.7, (Math.abs(camDist - focusDist) / (focusDist * (soft ? 0.6 : 0.42))) - 0.2));
        dim = 0;
        opacity = 0.97;
      } else if (inGroup) {
        blur = 0;
        dim = 0;
        opacity = 1;
      } else {
        blur = 1;
        dim = 0.75;
        opacity = 0.4;
      }
      if (isHover || isSelected) {
        blur = 0;
        dim = 0;
        opacity = 1;
      }
      const appear = Math.max(0, Math.min(1, (appearT - d.appear) / 0.6));
      d.blur = damp(d.blur, blur, 7, dt);
      d.dim = damp(d.dim, dim, 6, dt);
      d.opacity = damp(d.opacity, opacity * appear, 7, dt);
      d.scale = damp(d.scale, isSelected ? 1.22 : isHover ? 1.14 : 1, 10, dt);
      const u = mesh.material.uniforms;
      u.uBlur.value = d.blur;
      u.uDim.value = d.dim;
      u.uOpacity.value = d.opacity;

      mesh.quaternion.copy(this.camera.quaternion);
      mesh.scale.set(d.planeW * d.scale, d.planeH * d.scale, 1);
      mesh.position
        .set(card.x, card.y, card.z)
        .addScaledVector(this._tmpRight, d.offX * d.scale)
        .addScaledVector(this._tmpUp, d.offY * d.scale);
      // Selected and hovered cards draw last so nothing covers them.
      mesh.renderOrder = isSelected || isHover ? 3 : 2;
    }

    for (const r of this.rings) {
      const focused = this.focusKey === r.ring.key;
      const lineTarget = this.focusKey ? (focused ? 0.95 : 0.2) : 0.5;
      const glowTarget = focused ? 1 : 0;
      r.lineOpacity = damp(r.lineOpacity, lineTarget, 5, dt);
      r.glowOpacity = damp(r.glowOpacity, glowTarget, 4, dt);
      r.line.material.opacity = r.lineOpacity;
      r.glow.material.uniforms.uOpacity.value = r.glowOpacity * 0.85;
      r.glow.visible = r.glowOpacity > 0.01;
    }

    // The map: a family in focus keeps its name bright; the links fade behind it.
    for (const f of this.families || []) f.label.material.opacity = damp(f.label.material.opacity, this.highlight ? 0.1 : !this.focusKey || this.focusKey === f.key ? 1 : 0.25, 5, dt);
    if (this.links) this.links.material.opacity = damp(this.links.material.opacity, this.highlight ? 0.15 : this.focusKey ? 0.45 : 1, 5, dt);

    this.renderer.render(this.scene, this.camera);
    this.hooks.onFrame?.(this);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this._clear();
    this.renderer.dispose();
  }
}
