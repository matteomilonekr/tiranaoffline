// Turns grouped stacks into 3D positions: one horizontal ring per group, stacked down
// the y axis, cards scattered in a band around each ring. In funnel mode the rings
// narrow from prospecting down to reactivation; in the other arrangements the groups
// are sorted by spend, which keeps the same silhouette. Pure module, no DOM.

export const FUNNEL_GEOMETRY = {
  top: { y: 4.4, r: 7.2, below: 0.7, above: 2.5, spread: 1.24, scale: 0.95 },
  middle: { y: 1.5, r: 5.2, below: 0.8, above: 1.0, spread: 1.04, scale: 1.05 },
  bottom: { y: -1.25, r: 3.4, below: 0.65, above: 0.8, spread: 1.0, scale: 1.05 },
  reactivation: { y: -3.55, r: 1.9, below: 0.5, above: 0.6, spread: 1.0, scale: 1 },
};

/** Deterministic 32-bit hash of a string (FNV-1a). */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function groupGeometry(groups, mode) {
  if (mode === 'funnel') {
    return groups.map((g) => {
      const geo = FUNNEL_GEOMETRY[g.key] || FUNNEL_GEOMETRY.middle;
      return { ...geo };
    });
  }
  const n = groups.length;
  const maxSpend = Math.max(1, ...groups.map((g) => g.spend));
  const span = n > 1 ? 8.0 / (n - 1) : 0;
  return groups.map((g, i) => {
    const y = n > 1 ? 4.4 - i * span : 1;
    const r = 1.7 + 5.5 * Math.sqrt(g.spend / maxSpend);
    const half = Math.min(0.85, Math.max(0.4, span * 0.4));
    return { y, r, below: half, above: half + (i === 0 ? 1.2 : 0.1), spread: 1.05, scale: g.stacks.length > 60 ? 0.92 : 1 };
  });
}

/**
 * @param {Array<{key:string, color:string, spend:number, stacks:Array}>} groups in display order
 * @param {{mode:string, placement?:Map<string,{depth:number}>, maxCards?:number}} options
 */
export function computeLayout(groups, options = {}) {
  const mode = options.mode || 'funnel';
  const placement = options.placement || new Map();
  const geometry = groupGeometry(groups, mode);

  const all = groups.flatMap((g) => g.stacks);
  const maxCards = options.maxCards || 320;
  const visible = new Set(
    [...all].sort((a, b) => b.metrics.spend - a.metrics.spend).slice(0, maxCards).map((s) => s.id),
  );
  const maxSpend = Math.max(1, ...all.map((s) => s.metrics.spend));

  const rings = groups.map((g, i) => ({
    key: g.key,
    index: i,
    color: g.color,
    y: geometry[i].y,
    r: geometry[i].r,
    band: [geometry[i].y - geometry[i].below, geometry[i].y + geometry[i].above],
  }));

  const cards = [];
  groups.forEach((g, gi) => {
    const geo = geometry[gi];
    const stacks = g.stacks.filter((s) => visible.has(s.id));
    const n = stacks.length;
    if (!n) return;
    // Spread sizes across the disc: seeded shuffle so big cards don't all sit in the middle.
    const order = stacks
      .map((s) => ({ s, k: rng(hashString(s.id + ':' + g.key))() }))
      .sort((a, b) => a.k - b.k)
      .map((o) => o.s);
    const rotation = rng(hashString(g.key))() * Math.PI * 2;
    const radius = geo.r * geo.spread;
    const [lo, hi] = [geo.y - geo.below, geo.y + geo.above];

    order.forEach((stack, i) => {
      const rand = rng(hashString(stack.id));
      const t = (i + 0.5) / n;
      const rho = radius * Math.sqrt(t) * (0.82 + 0.18 * rand());
      const theta = rotation + i * GOLDEN_ANGLE + (rand() - 0.5) * 0.35;
      const depth = placement.get(stack.id)?.depth ?? rand();
      const y = hi - depth * (hi - lo) + (rand() - 0.5) * 0.22;
      const aspect = Math.max(0.5, Math.min(1.91, stack.rep.creative?.aspect || 0.8));
      let h = geo.scale * (0.6 + 0.75 * Math.sqrt(stack.metrics.spend / maxSpend));
      h = Math.max(0.5, Math.min(1.35, h));
      let w = h * aspect;
      if (w > 1.6) {
        h *= 1.6 / w;
        w = 1.6;
      }
      cards.push({
        stack,
        group: g.key,
        ring: gi,
        x: Math.cos(theta) * rho,
        y,
        z: Math.sin(theta) * rho,
        w,
        h,
        band: [lo, hi],
        maxRadius: radius * 1.12,
      });
    });
  });

  relax(cards, options.iterations ?? 24);
  return { rings, cards, hidden: all.length - visible.size };
}

/** Pushes overlapping cards of the same ring apart, keeping them inside their band. */
export function relax(cards, iterations = 24) {
  const byRing = new Map();
  for (const c of cards) {
    if (!byRing.has(c.ring)) byRing.set(c.ring, []);
    byRing.get(c.ring).push(c);
  }
  for (const list of byRing.values()) {
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const ra = 0.36 * Math.max(a.w, a.h);
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          const rb = 0.36 * Math.max(b.w, b.h);
          const dx = b.x - a.x;
          const dy = (b.y - a.y) * 1.6;
          const dz = b.z - a.z;
          const d = Math.hypot(dx, dy, dz) || 1e-4;
          const min = ra + rb;
          if (d >= min) continue;
          const push = (min - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          const uy = dy / d / 1.6;
          a.x -= ux * push;
          a.z -= uz * push;
          a.y -= uy * push * 0.5;
          b.x += ux * push;
          b.z += uz * push;
          b.y += uy * push * 0.5;
          moved = true;
        }
      }
      for (const c of list) {
        c.y = Math.max(c.band[0], Math.min(c.band[1], c.y));
        const r = Math.hypot(c.x, c.z);
        if (r > c.maxRadius) {
          c.x *= c.maxRadius / r;
          c.z *= c.maxRadius / r;
        }
      }
      if (!moved) break;
    }
  }
  return cards;
}

/**
 * Control points for the funnel's meridian lines: a flared lip above the first ring,
 * every ring, then a bulb below the last one.
 */
export function meridianProfile(rings) {
  if (!rings.length) return [];
  const first = rings[0];
  const last = rings[rings.length - 1];
  const pts = [
    { y: first.y + 3.0, r: first.r * 1.75 },
    { y: first.y + 1.4, r: first.r * 1.24 },
    ...rings.map((r) => ({ y: r.y, r: r.r })),
    { y: last.y - 0.75, r: last.r * 0.82 },
    { y: last.y - 1.45, r: last.r * 0.78 },
    { y: last.y - 2.05, r: last.r * 0.32 },
    { y: last.y - 2.2, r: 0 },
  ];
  return pts;
}
