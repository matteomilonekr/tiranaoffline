// The 3D funnel graph: one billboard per creative stack, a glowing ring per group, a
// wireframe funnel of meridians, and an orbit camera that eases between the overview
// and a focused ring. Depth of field is faked per card by mixing a sharp texture with a
// tiny blurred twin, so it stays cheap on laptops and phones.

import * as THREE from 'three';
import { meridianProfile } from './layout.js';

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
varying vec2 vUv;
void main() {
  vec4 a = texture2D(uSharp, vUv);
  vec4 b = texture2D(uSoft, vUv);
  vec4 c = mix(a, b, clamp(uBlur, 0.0, 1.0));
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

    this.view = { yaw: 0.55, pitch: 0.3, dist: 16, ty: 0.3 };
    this.goal = { ...this.view };
    this.userZoom = 1;

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

    // Cards.
    for (const card of layout.cards) {
      const art = artwork.get(card.stack.id);
      if (!art) continue;
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
        uniforms: { uSharp: { value: sharp }, uSoft: { value: soft }, uBlur: { value: 0.6 }, uDim: { value: 0 }, uOpacity: { value: 0 } },
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

    this.appearStart = performance.now();
    this._applyViewGoal(true);
  }

  _clear() {
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
    this._applyViewGoal(false);
  }

  setSelected(stackId) {
    this.selectedId = stackId ?? null;
  }

  setAutoRotate(on) {
    this.autoRotate = !!on;
  }

  resetView() {
    this.focusKey = null;
    this.userZoom = 1;
    this._pitchTouched = false;
    this.goal.yaw = this.view.yaw - (((this.view.yaw - 0.55) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.goal.pitch = 0.3;
    this._applyViewGoal(false);
  }

  _fitDistance(halfW, halfH) {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    return Math.max(halfW / Math.tan(hfov / 2), halfH / Math.tan(vfov / 2));
  }

  _applyViewGoal(instant) {
    const rings = this.layout?.rings || [];
    if (!rings.length) return;
    const narrow = this.camera.aspect < 0.85;
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
    this.insetRight = Math.max(0, px || 0);
    this._updateProjection();
    this._applyViewGoal(false);
  }

  _updateProjection() {
    const inset = this.insetRight || 0;
    const visible = Math.max(1, this.width - inset);
    this.camera.aspect = visible / this.height;
    if (inset > 0) this.camera.setViewOffset(visible + inset, this.height, inset, 0, this.width, this.height);
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

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downAt = { x: e.clientX, y: e.clientY };
        moved = 0;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        pinchZoom = this.userZoom;
      }
      this._interacted();
    });

    c.addEventListener('pointermove', (e) => {
      const rect = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.pointerPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.pointerInside = true;
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart > 0) this._zoomTo(pinchZoom * (pinchStart / Math.max(1, d)));
        moved += 10;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        c.classList.add('dragging');
        this.goal.yaw -= dx * 0.0055;
        this.view.yaw -= dx * 0.0055;
        this.goal.pitch = Math.max(-0.15, Math.min(0.95, this.goal.pitch + dy * 0.0035));
        if (Math.abs(dy) > 0) this._pitchTouched = true;
        this._interacted();
      }
    });

    const end = (e) => {
      const wasClick = pointers.size === 1 && moved <= 6 && downAt;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) c.classList.remove('dragging');
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
        const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012));
        this._zoomTo(this.userZoom * factor);
        this._interacted();
      },
      { passive: false },
    );
  }

  _zoomTo(z) {
    const before = this.userZoom;
    this.userZoom = Math.max(0.35, Math.min(2.2, z));
    this.goal.dist *= this.userZoom / before;
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

    if (this.autoRotate && now > this.interactUntil) {
      this.goal.yaw += dt * 0.07;
      this.view.yaw += dt * 0.07;
    }
    this.view.yaw = damp(this.view.yaw, this.goal.yaw, 6, dt);
    this.view.pitch = damp(this.view.pitch, this.goal.pitch, 4, dt);
    this.view.dist = damp(this.view.dist, this.goal.dist, 3.6, dt);
    this.view.ty = damp(this.view.ty, this.goal.ty, 3.6, dt);

    const { yaw, pitch, dist, ty } = this.view;
    this.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(0, ty, 0);
    this.camera.updateMatrixWorld();

    // Hover picking, once per frame.
    if (this.pointerInside && this.cards.length) {
      const hit = this.canvas.classList.contains('dragging') ? null : this._pick();
      if (hit !== this.hovered) {
        this.hovered = hit;
        this.canvas.classList.toggle('pointing', !!hit);
        this.hooks.onHover?.(hit ? hit.userData.card : null, hit ? this.projectCard(hit) : null);
      }
    }

    this._tmpRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._tmpUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    const focusDist = dist;
    const appearT = (now - (this.appearStart || 0)) / 1000;

    for (const mesh of this.cards) {
      const d = mesh.userData;
      const card = d.card;
      const inGroup = !this.focusKey || card.group === this.focusKey;
      const isHover = mesh === this.hovered;
      const isSelected = card.stack.id === this.selectedId;
      let blur;
      let dim;
      let opacity;
      if (!this.focusKey) {
        const camDist = this._tmpV.set(card.x, card.y, card.z).distanceTo(this.camera.position);
        blur = Math.max(0, Math.min(0.7, (Math.abs(camDist - focusDist) / (focusDist * 0.42)) - 0.2));
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
