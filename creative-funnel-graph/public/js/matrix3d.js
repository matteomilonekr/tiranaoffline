// Spend × ROAS in 3D: a box whose width is spend (log scale), whose height is ROAS and
// whose depth holds one lane per funnel level, front to back. Seen from the front it reads
// as the flat matrix; turned, it shows where in the funnel each creative works. Two
// translucent planes, the spend threshold and the target ROAS, cut the box into the four
// quadrants; each card stands on a stem coloured by its quadrant. The scene owns the cards
// and the camera; this builds and moves everything else.

import * as THREE from 'three';
import { matrixScales, quadrantOf } from './matrix.js';

/** The box in world units: width (spend), height (ROAS), depth (funnel lanes); a phone's is upright. */
export const BOX = { W: 16, H: 9, D: 6 };
export const TALL_BOX = { W: 9, H: 12, D: 4.5 };
export const LANES = ['top', 'middle', 'bottom', 'reactivation'];

/** A text label as a sprite; `set(text)` redraws it. Anchored left, centre or right. */
function textSprite(text, { size = 0.34, color = '#bcb9b1', weight = 500, bg = null, align = 'center', order = 0.5 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  // Labels sit under the cards; the line tags over everything.
  sprite.renderOrder = order;
  const px = 64;
  const set = (value) => {
    const font = `${weight} ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(value).width);
    const padX = bg ? px * 0.55 : px * 0.1;
    canvas.width = tw + padX * 2;
    canvas.height = Math.round(px * 1.45);
    ctx.font = font;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) {
      const r = canvas.height / 2;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, r);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, padX, canvas.height / 2 + px * 0.04);
    tex.needsUpdate = true;
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(size * 1.45 * aspect, size * 1.45, 1);
    sprite.center.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
  };
  set(text);
  sprite.userData.set = set;
  return sprite;
}

function color(hex) {
  return new THREE.Color(hex);
}

export class MatrixWorld {
  /**
   * @param {{stacks:Array, lines:{spend:number, roas:number}, colors:Record<string,string>, lanes:Array<{key,label,color}>,
   *          money:(v:number)=>string, roas:(v:number)=>string, names:Record<string,string>, axis:{spend:string, roas:string}}} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.box = opts.box || BOX;
    this.group = new THREE.Group();
    this.lines = { ...opts.lines };
    this.focus = null;
    this.cards = opts.stacks.map((stack) => ({ stack, x: 0, y: 0, z: 0, w: 1, h: 1, group: 'cut' }));
    this.build();
  }

  /** World x of a spend and y of a ROAS, and back, for the box as the lines set it. */
  scales() {
    const { W, H } = this.box;
    const sc = matrixScales(this.opts.stacks, this.lines, W, H);
    return {
      ...sc,
      wx: (spend) => sc.x(spend) - W / 2,
      wy: (roas) => H - sc.y(roas),
      spendAt: (wx) => sc.spendAt(wx + W / 2),
      roasAt: (wy) => sc.roasAt(H - wy),
    };
  }

  build() {
    for (const obj of [...this.group.children]) this.dispose(obj);
    const { W, H, D } = this.box;
    const sc = this.scales();
    this.sc = sc;
    this.domain = `${sc.lo}|${sc.hi}|${sc.yMax}`;
    this.placeCards();

    const furniture = new THREE.Group();
    this.furniture = furniture;
    this.group.add(furniture);

    // Floor with one faint strip per funnel lane, and the back wall.
    const laneD = D / LANES.length;
    this.opts.lanes.forEach((lane, i) => {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(W, laneD * 0.94), new THREE.MeshBasicMaterial({ color: color(lane.color), transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0, D / 2 - (i + 0.5) * laneD);
      strip.renderOrder = 0;
      furniture.add(strip);
      const label = textSprite(lane.label, { size: 0.3, color: lane.color, weight: 600, align: 'left' });
      label.position.set(W / 2 + 0.3, 0.05, D / 2 - (i + 0.5) * laneD);
      furniture.add(label);
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    wall.position.set(0, H / 2, -D / 2);
    furniture.add(wall);

    // Grid: spend ticks across the floor and up the wall, ROAS ticks along the wall.
    const grid = [];
    const minGap = 1.15;
    let lastX = -Infinity;
    for (const v of sc.xTicks) {
      const x = sc.wx(v);
      grid.push(x, 0, D / 2, x, 0, -D / 2, x, 0, -D / 2, x, H, -D / 2);
      if (x - lastX < minGap) continue;
      lastX = x;
      const t = textSprite(this.opts.money(v), { size: 0.27, color: '#8a877f' });
      t.position.set(x, -0.35, D / 2 + 0.25);
      furniture.add(t);
    }
    for (const v of sc.yTicks) {
      const y = sc.wy(v);
      grid.push(-W / 2, y, -D / 2, W / 2, y, -D / 2);
      const t = textSprite(this.opts.roas(v), { size: 0.27, color: '#8a877f', align: 'right' });
      t.position.set(-W / 2 - 0.2, y, -D / 2);
      furniture.add(t);
    }
    for (let i = 0; i <= LANES.length; i++) {
      const z = D / 2 - i * laneD;
      grid.push(-W / 2, 0, z, W / 2, 0, z);
    }
    // The box's edges.
    grid.push(-W / 2, 0, -D / 2, -W / 2, H, -D / 2, W / 2, 0, -D / 2, W / 2, H, -D / 2, -W / 2, H, -D / 2, W / 2, H, -D / 2);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    const gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false }));
    furniture.add(gridLines);

    const ax = textSprite(this.opts.axis.spend, { size: 0.3, color: '#bcb9b1', align: 'right' });
    ax.position.set(W / 2, -0.85, D / 2 + 0.25);
    const ay = textSprite(this.opts.axis.roas, { size: 0.3, color: '#bcb9b1', align: 'right' });
    ay.position.set(-W / 2 - 0.2, H + 0.45, -D / 2);
    furniture.add(ax, ay);

    // Quadrant washes on the back wall, and their names in its corners.
    this.washes = {};
    this.names = {};
    for (const q of ['scale', 'boost', 'fix', 'cut']) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: color(this.opts.colors[q]), transparent: true, opacity: 0.12, depthWrite: false }));
      m.position.z = -D / 2 + 0.01;
      m.renderOrder = 0;
      furniture.add(m);
      this.washes[q] = m;
      const n = textSprite(this.opts.names[q], { size: 0.32, color: this.opts.colors[q], weight: 650, align: q === 'scale' || q === 'fix' ? 'right' : 'left' });
      furniture.add(n);
      this.names[q] = n;
    }

    // Stems from the floor to each card, and a dot where they stand.
    const stemPos = [];
    const dotPos = [];
    for (const c of this.cards) {
      stemPos.push(c.x, 0, c.z, c.x, c.y, c.z);
      dotPos.push(c.x, 0.01, c.z);
    }
    const stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute('position', new THREE.Float32BufferAttribute(stemPos, 3));
    stemGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(stemPos.length).fill(1), 3));
    this.stems = new THREE.LineSegments(stemGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
    this.stems.renderOrder = 1;
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPos, 3));
    dotGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(dotPos.length).fill(1), 3));
    this.dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ vertexColors: true, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.dots.renderOrder = 1;
    furniture.add(this.stems, this.dots);

    // The two lines: a plane each, its outline, a value tag, and an invisible handle to drag.
    const planeMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
    const edgeMat = () => new THREE.LineBasicMaterial({ color: 0xf3f1ec, transparent: true, opacity: 0.75, depthWrite: false });
    const handleMat = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const vGeo = new THREE.PlaneGeometry(D, H);
    this.vPlane = new THREE.Mesh(vGeo, planeMat());
    this.vPlane.rotation.y = Math.PI / 2;
    this.vEdge = new THREE.LineSegments(new THREE.EdgesGeometry(vGeo), edgeMat());
    this.vEdge.rotation.y = Math.PI / 2;
    this.vHandle = new THREE.Mesh(new THREE.BoxGeometry(0.45, H, D), handleMat());
    this.vHandle.userData.line = 'spend';
    const hGeo = new THREE.PlaneGeometry(W, D);
    this.hPlane = new THREE.Mesh(hGeo, planeMat());
    this.hPlane.rotation.x = -Math.PI / 2;
    this.hEdge = new THREE.LineSegments(new THREE.EdgesGeometry(hGeo), edgeMat());
    this.hEdge.rotation.x = -Math.PI / 2;
    this.hHandle = new THREE.Mesh(new THREE.BoxGeometry(W, 0.45, D), handleMat());
    this.hHandle.userData.line = 'roas';
    for (const m of [this.vPlane, this.hPlane, this.vEdge, this.hEdge]) m.renderOrder = 4;
    this.vTag = textSprite('', { size: 0.34, color: '#141415', weight: 700, bg: '#f3f1ec', order: 7 });
    this.vTag.userData.line = 'spend';
    this.hTag = textSprite('', { size: 0.34, color: '#141415', weight: 700, bg: '#f3f1ec', align: 'left', order: 7 });
    this.hTag.userData.line = 'roas';
    furniture.add(this.vPlane, this.vEdge, this.vHandle, this.hPlane, this.hEdge, this.hHandle, this.vTag, this.hTag);
    this.handles = [this.vTag, this.hTag, this.vHandle, this.hHandle];

    this.placeLines();
  }

  /**
   * Cards at their exact spend and ROAS, in their funnel lane. Where two would overlap, the
   * later one steps forward or back inside its lane rather than off its values.
   */
  placeCards() {
    const { D } = this.box;
    const laneD = D / LANES.length;
    const sc = this.sc;
    const maxSpend = Math.max(1, ...this.opts.stacks.map((s) => s.metrics.spend));
    const order = [...this.cards].sort((a, b) => b.stack.metrics.spend - a.stack.metrics.spend);
    const placed = [];
    const offsets = [0, -0.3, 0.3, -0.55, 0.55];
    for (const c of order) {
      const s = c.stack;
      const lane = Math.max(0, LANES.indexOf(s.funnel?.level));
      const z0 = D / 2 - (lane + 0.5) * laneD;
      const aspect = Math.max(0.56, Math.min(1.5, s.rep?.creative?.aspect || 0.8));
      c.h = 0.5 + 0.85 * Math.sqrt(s.metrics.spend / maxSpend);
      c.w = c.h * aspect;
      c.x = sc.wx(s.metrics.spend);
      c.y = sc.wy(s.metrics.roas ?? 0);
      let best = 0;
      let bestOverlap = Infinity;
      for (const dz of offsets) {
        let overlap = 0;
        for (const p of placed) {
          if (Math.abs(p.z - (z0 + dz)) > 0.2) continue;
          const ox = Math.min(c.x + c.w / 2, p.x + p.w / 2) - Math.max(c.x - c.w / 2, p.x - p.w / 2);
          const oy = Math.min(c.y + c.h / 2, p.y + p.h / 2) - Math.max(c.y - c.h / 2, p.y - p.h / 2);
          if (ox > 0 && oy > 0) overlap += ox * oy;
        }
        if (overlap < bestOverlap - 1e-6) {
          bestOverlap = overlap;
          best = dz;
        }
        if (overlap === 0) break;
      }
      c.z = z0 + best;
      placed.push(c);
    }
  }

  /** Moves the planes, washes and tags to the lines, recolours stems and dots. */
  placeLines() {
    const { W, H, D } = this.box;
    const sc = this.sc;
    const xs = sc.wx(this.lines.spend);
    const yr = sc.wy(this.lines.roas);
    this.xs = xs;
    this.yr = yr;
    for (const m of [this.vPlane, this.vEdge]) m.position.set(xs, H / 2, 0);
    this.vHandle.position.set(xs, H / 2, 0);
    for (const m of [this.hPlane, this.hEdge]) m.position.set(0, yr, 0);
    this.hHandle.position.set(0, yr, 0);
    this.vTag.userData.set(this.opts.money(this.lines.spend));
    this.vTag.position.set(xs, H + 0.4, D / 2);
    this.hTag.userData.set('ROAS ' + this.opts.roas(this.lines.roas));
    this.hTag.position.set(W / 2 + 0.25, yr, D / 2);

    const rect = { scale: [xs, W / 2, yr, H], boost: [-W / 2, xs, yr, H], fix: [xs, W / 2, 0, yr], cut: [-W / 2, xs, 0, yr] };
    const counts = { scale: 0, boost: 0, fix: 0, cut: 0 };
    for (const c of this.cards) {
      c.group = quadrantOf(c.stack.metrics, this.lines);
      counts[c.group]++;
    }
    for (const [q, [x0, x1, y0, y1]] of Object.entries(rect)) {
      const m = this.washes[q];
      m.scale.set(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), 1);
      m.position.x = (x0 + x1) / 2;
      m.position.y = (y0 + y1) / 2;
      m.material.opacity = this.focus && this.focus !== q ? 0.03 : q === 'scale' ? 0.14 : 0.11;
      const n = this.names[q];
      n.userData.set(`${this.opts.names[q]} · ${counts[q]}`);
      const right = q === 'scale' || q === 'fix';
      n.position.set(right ? W / 2 - 0.2 : -W / 2 + 0.2, q === 'scale' || q === 'boost' ? H - 0.35 : 0.35, -D / 2 + 0.02);
      n.material.opacity = this.focus && this.focus !== q ? 0.35 : 1;
    }
    const cols = this.stems.geometry.getAttribute('color');
    const dots = this.dots.geometry.getAttribute('color');
    this.cards.forEach((c, i) => {
      const col = color(this.opts.colors[c.group]);
      cols.setXYZ(i * 2, col.r, col.g, col.b);
      cols.setXYZ(i * 2 + 1, col.r, col.g, col.b);
      dots.setXYZ(i, col.r, col.g, col.b);
    });
    cols.needsUpdate = true;
    dots.needsUpdate = true;
    this.counts = counts;
  }

  /** New lines: moves them; rebuilds the box when they fall outside its range. Returns true then. */
  setLines(lines) {
    this.lines = { ...lines };
    const sc = this.scales();
    if (`${sc.lo}|${sc.hi}|${sc.yMax}` !== this.domain) {
      this.build();
      return true;
    }
    this.placeLines();
    return false;
  }

  setFocus(q) {
    this.focus = q || null;
    this.placeLines();
  }

  /** What the camera frames: the whole box, or one quadrant's part of it. */
  frame(q = this.focus) {
    const { W, H } = this.box;
    if (!q) return { cx: W * 0.04, cy: H / 2 - 0.45, halfW: W / 2 + 2.2, halfH: H / 2 + 1.6 };
    const xs = this.xs;
    const yr = this.yr;
    const [x0, x1] = q === 'scale' || q === 'fix' ? [xs, W / 2] : [-W / 2, xs];
    const [y0, y1] = q === 'scale' || q === 'boost' ? [yr, H] : [0, yr];
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, halfW: Math.max(2.2, (x1 - x0) / 2 + 0.9), halfH: Math.max(1.6, (y1 - y0) / 2 + 0.9) };
  }

  /** The line a dragged handle moves to, from a point on the plane the drag happens in. */
  lineAt(kind, point) {
    const sc = this.sc;
    if (kind === 'spend') {
      const v = sc.spendAt(point.x);
      const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
      return { ...this.lines, spend: Math.round(v / p) * p };
    }
    return { ...this.lines, roas: Math.round(sc.roasAt(point.y) * 20) / 20 };
  }

  dispose(obj = this.group) {
    obj.traverse?.((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    obj.parent?.remove(obj);
  }
}

