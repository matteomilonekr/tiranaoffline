// Paints the demo brand's ad creatives on a canvas: bold statics, UGC video frames,
// offers, reviews, before/after splits, notes-app screenshots. Variants of one concept
// differ only by a small shift, zoom or badge, which is what real "new" ads often are.

import { rng } from '../layout.js';

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const BRAND = 'solvea';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

/** Word-wraps text into lines that fit maxWidth with the current font. */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Finds the largest font size whose wrapped text fits the box; draws it. */
function fitText(ctx, text, box, { weight = 800, family = SANS, max = 80, min = 8, lineHeight = 1.02, align = 'left', color = '#000', style = '' } = {}) {
  let size = max;
  let lines = [];
  for (; size >= min; size -= 1) {
    ctx.font = `${style} ${weight} ${size}px ${family}`;
    lines = wrap(ctx, text, box.w);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * size * lineHeight <= box.h && widest <= box.w) break;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const x = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
  lines.forEach((l, i) => ctx.fillText(l, x, box.y + i * size * lineHeight));
  return { size, height: lines.length * size * lineHeight, lines };
}

function softShadow(ctx, blur, alpha = 0.25, dy = 0) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
}

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Product packshot: dropper bottle, jar, tube or pump bottle. */
function drawProduct(ctx, shape, cx, cy, size, palette, label = BRAND) {
  ctx.save();
  const body = palette.product;
  const cap = palette.accent;
  softShadow(ctx, size * 0.18, 0.28, size * 0.06);
  if (shape === 'jar') {
    const w = size * 0.95;
    const h = size * 0.62;
    const x = cx - w / 2;
    const y = cy - h / 2 + size * 0.12;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(body, -28));
    g.addColorStop(0.35, body);
    g.addColorStop(1, shade(body, -40));
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, size * 0.08);
    ctx.fill();
    clearShadow(ctx);
    ctx.fillStyle = cap;
    roundRect(ctx, x - size * 0.02, y - size * 0.24, w + size * 0.04, size * 0.27, size * 0.05);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - size * 0.02, y - size * 0.2, w + size * 0.04, size * 0.03);
    drawLabel(ctx, label, cx, y + h * 0.45, w * 0.7, palette);
  } else if (shape === 'tube') {
    const w = size * 0.42;
    const h = size * 1.05;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(body, -30));
    g.addColorStop(0.4, body);
    g.addColorStop(1, shade(body, -45));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.03, y);
    ctx.lineTo(x + w + size * 0.03, y);
    ctx.lineTo(x + w, y + h * 0.82);
    ctx.lineTo(x, y + h * 0.82);
    ctx.closePath();
    ctx.fill();
    clearShadow(ctx);
    ctx.fillStyle = cap;
    roundRect(ctx, x + w * 0.12, y + h * 0.82, w * 0.76, h * 0.2, size * 0.03);
    ctx.fill();
    drawLabel(ctx, label, cx, y + h * 0.36, w * 0.85, palette, true);
  } else {
    const dropper = shape === 'dropper';
    const w = size * (dropper ? 0.46 : 0.5);
    const h = size * (dropper ? 0.66 : 0.78);
    const x = cx - w / 2;
    const y = cy - h / 2 + size * 0.18;
    const glass = dropper ? palette.accent : body;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(glass, -35));
    g.addColorStop(0.3, shade(glass, 25));
    g.addColorStop(0.55, glass);
    g.addColorStop(1, shade(glass, -50));
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, size * 0.07);
    ctx.fill();
    clearShadow(ctx);
    // Neck and cap / pipette bulb.
    ctx.fillStyle = shade(glass, -20);
    ctx.fillRect(cx - w * 0.2, y - size * 0.06, w * 0.4, size * 0.07);
    ctx.fillStyle = dropper ? '#1d1d1f' : cap;
    if (dropper) {
      roundRect(ctx, cx - w * 0.24, y - size * 0.22, w * 0.48, size * 0.17, size * 0.03);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, y - size * 0.27, w * 0.2, size * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      roundRect(ctx, cx - w * 0.3, y - size * 0.2, w * 0.6, size * 0.15, size * 0.02);
      ctx.fill();
      ctx.fillRect(cx - w * 0.06, y - size * 0.3, w * 0.12, size * 0.1);
      ctx.fillRect(cx - w * 0.06, y - size * 0.3, w * 0.38, size * 0.05);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + w * 0.12, y + h * 0.08, w * 0.08, h * 0.8);
    drawLabel(ctx, label, cx, y + h * 0.52, w * 0.78, palette);
  }
  ctx.restore();
}

function drawLabel(ctx, text, cx, cy, width, palette, vertical = false) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const h = width * (vertical ? 0.9 : 0.42);
  roundRect(ctx, cx - width / 2, cy - h / 2, width, h, width * 0.06);
  ctx.fill();
  ctx.fillStyle = palette.ink === '#ffffff' ? '#1d1d1f' : palette.ink;
  ctx.font = `700 ${Math.max(5, width * 0.22)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

/** Soft, out-of-focus "room" behind a person, like a phone-shot UGC frame. */
function photoBackdrop(ctx, w, h, rand, warm = true) {
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, warm ? '#d9c3ad' : '#b9c4cc');
  base.addColorStop(1, warm ? '#7d6655' : '#56626c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.7;
    const r = (0.2 + rand() * 0.45) * w;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > 0.5;
    g.addColorStop(0, light ? 'rgba(255,248,235,0.55)' : 'rgba(60,45,35,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Stylized person: hair, face, shoulders. Abstract enough to read as a photo thumbnail. */
function drawPerson(ctx, cx, cy, size, skin, rand, { spots = false, hairColor } = {}) {
  ctx.save();
  const hair = hairColor || ['#2b1d16', '#4a3020', '#7a5230', '#1a1a1a', '#a0703d'][Math.floor(rand() * 5)];
  // Shoulders.
  const sg = ctx.createLinearGradient(0, cy + size * 0.5, 0, cy + size * 1.6);
  const top = ['#f1f3f5', '#364fc7', '#e64980', '#212529', '#f59f00', '#2f9e44'][Math.floor(rand() * 6)];
  sg.addColorStop(0, top);
  sg.addColorStop(1, shade(top.startsWith('#') ? top : '#888888', -40));
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 1.25, size * 0.95, size * 0.62, 0, Math.PI, 0);
  ctx.lineTo(cx + size * 0.95, cy + size * 2);
  ctx.lineTo(cx - size * 0.95, cy + size * 2);
  ctx.fill();
  // Neck.
  ctx.fillStyle = shade(skin, -25);
  ctx.fillRect(cx - size * 0.16, cy + size * 0.35, size * 0.32, size * 0.42);
  // Hair back.
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.05, size * 0.5, size * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  // Face.
  const fg = ctx.createRadialGradient(cx - size * 0.1, cy - size * 0.1, size * 0.05, cx, cy, size * 0.5);
  fg.addColorStop(0, shade(skin, 18));
  fg.addColorStop(1, shade(skin, -22));
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.02, size * 0.36, size * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  if (spots) {
    ctx.fillStyle = 'rgba(110,60,35,0.45)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(cx + (rand() - 0.5) * size * 0.5, cy + (rand() - 0.2) * size * 0.4, size * (0.02 + rand() * 0.03), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Fringe.
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.05, cy - size * 0.36, size * 0.4, size * 0.18, -0.25, 0, Math.PI * 2);
  ctx.fill();
  // Eyes, brows, lips.
  ctx.fillStyle = 'rgba(30,20,15,0.85)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * size * 0.13, cy - size * 0.02, size * 0.04, size * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + s * size * 0.13 - size * 0.06, cy - size * 0.1, size * 0.12, size * 0.018);
  }
  ctx.fillStyle = '#b5524f';
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.24, size * 0.09, size * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bubble(ctx, text, x, y, maxW, size, { bg = '#ffffff', fg = '#111111', align = 'center' } = {}) {
  ctx.font = `700 ${size}px ${SANS}`;
  const lines = wrap(ctx, text, maxW - size);
  const lh = size * 1.18;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const bw = widest + size * 0.9;
  const bh = lines.length * lh + size * 0.55;
  const bx = align === 'center' ? x - bw / 2 : x;
  ctx.fillStyle = bg;
  roundRect(ctx, bx, y, bw, bh, size * 0.35);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, y + size * 0.3 + i * lh));
  return bh;
}

function stars(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  for (let s = 0; s < 5; s++) {
    const cx = x + s * size * 1.15 + size / 2;
    const cy = y + size / 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? size / 2 : size / 4.6;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function logo(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(BRAND, x, y);
}

const TEMPLATES = {
  headline(ctx, w, h, s, rand) {
    const p = s.palette;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.8, h * 0.85, 0, w * 0.8, h * 0.85, w * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    fitText(ctx, s.headline, { x: w * 0.07, y: h * 0.07, w: w * 0.86, h: h * 0.42 }, { color: p.ink, max: w * 0.16 });
    drawProduct(ctx, s.shape, w * 0.66, h * 0.72, Math.min(w, h) * 0.42, p);
    logo(ctx, w * 0.07, h * 0.9, w * 0.07, p.ink);
  },
  hero(ctx, w, h, s, rand) {
    const p = s.palette;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.bg2);
    g.addColorStop(1, p.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.86, w * 0.42, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    drawProduct(ctx, s.shape, w / 2, h * 0.58, Math.min(w, h) * 0.62, p);
    fitText(ctx, s.productName.toUpperCase(), { x: w * 0.1, y: h * 0.07, w: w * 0.8, h: h * 0.16 }, { color: p.ink, max: w * 0.1, align: 'center', weight: 700 });
    ctx.fillStyle = p.accent;
    roundRect(ctx, w * 0.06, h * 0.2, w * 0.18, h * 0.05, h * 0.025);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${w * 0.04}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEW', w * 0.15, h * 0.225);
  },
  ugc(ctx, w, h, s, rand) {
    photoBackdrop(ctx, w, h, rand, rand() > 0.3);
    drawPerson(ctx, w * 0.5, h * 0.5, w * 0.46, s.skin, rand);
    bubble(ctx, s.caption, w / 2, h * 0.13, w * 0.86, w * 0.075);
    // Platform chrome: progress bar and side icons.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(w * 0.05, h * 0.965, w * 0.9, h * 0.008);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w * 0.05, h * 0.965, w * 0.9 * (0.2 + rand() * 0.5), h * 0.008);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(w * 0.9, h * (0.62 + i * 0.08), w * 0.035, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `600 ${w * 0.05}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText(s.creator, w * 0.06, h * 0.9);
  },
  founder(ctx, w, h, s, rand) {
    photoBackdrop(ctx, w, h, rand, false);
    drawPerson(ctx, w * 0.5, h * 0.46, w * 0.44, s.skin, rand, { hairColor: '#1a1a1a' });
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h * 0.78, w, h * 0.14);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${w * 0.065}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Dr. Noor, founder', w * 0.06, h * 0.795);
    ctx.font = `400 ${w * 0.045}px ${SANS}`;
    ctx.fillText('Why I made ' + s.productName, w * 0.06, h * 0.85);
    bubble(ctx, s.caption, w / 2, h * 0.08, w * 0.84, w * 0.068, { bg: s.palette.accent, fg: '#ffffff' });
  },
  testimonial(ctx, w, h, s, rand) {
    const p = s.palette;
    ctx.fillStyle = '#fbf8f3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    stars(ctx, w * 0.08, h * 0.08, w * 0.09, '#f2a900');
    fitText(ctx, '“' + s.quote + '”', { x: w * 0.08, y: h * 0.2, w: w * 0.84, h: h * 0.42 }, { family: SERIF, weight: 400, style: 'italic', color: '#1d1d1f', max: w * 0.11, lineHeight: 1.18 });
    ctx.fillStyle = '#6b6b6b';
    ctx.font = `600 ${w * 0.045}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('Jess M. · verified buyer', w * 0.08, h * 0.65);
    drawProduct(ctx, s.shape, w * 0.78, h * 0.8, w * 0.3, p);
    logo(ctx, w * 0.08, h * 0.84, w * 0.08, p.ink);
  },
  beforeAfter(ctx, w, h, s, rand) {
    const half = w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, half, h);
    ctx.clip();
    photoBackdrop(ctx, w, h, rng(s.seed), true);
    drawPerson(ctx, half * 0.5 + half * 0.5, h * 0.52, w * 0.4, s.skin, rng(s.seed + 1), { spots: true, hairColor: '#4a3020' });
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(half, 0, half, h);
    ctx.clip();
    photoBackdrop(ctx, w, h, rng(s.seed), true);
    drawPerson(ctx, half * 0.5 + half * 0.5, h * 0.52, w * 0.4, shade(s.skin, 8), rng(s.seed + 1), { hairColor: '#4a3020' });
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(half - w * 0.006, 0, w * 0.012, h);
    for (const [label, x] of [['BEFORE', w * 0.25], ['AFTER', w * 0.75]]) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, x - w * 0.15, h * 0.05, w * 0.3, h * 0.07, h * 0.02);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${w * 0.055}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, h * 0.085);
    }
    bubble(ctx, '14 days of ' + s.productName, w / 2, h * 0.84, w * 0.9, w * 0.05);
  },
  offer(ctx, w, h, s, rand) {
    const p = s.palette;
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = -2; i < 8; i++) {
      ctx.save();
      ctx.translate(i * w * 0.22, 0);
      ctx.rotate(0.35);
      ctx.fillRect(0, -h, w * 0.07, h * 3);
      ctx.restore();
    }
    fitText(ctx, s.discount + ' OFF', { x: w * 0.06, y: h * 0.08, w: w * 0.88, h: h * 0.26 }, { color: '#ffffff', max: w * 0.3, align: 'center', weight: 900 });
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${w * 0.055}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(s.productName.toUpperCase(), w / 2, h * 0.39);
    drawProduct(ctx, s.shape, w / 2, h * 0.64, Math.min(w, h) * 0.42, { ...p, accent: p.ink === '#ffffff' ? '#1d1d1f' : p.ink });
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, w * 0.25, h * 0.86, w * 0.5, h * 0.08, h * 0.04);
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.font = `800 ${w * 0.05}px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('SHOP NOW', w / 2, h * 0.9);
  },
  listicle(ctx, w, h, s, rand) {
    const p = s.palette;
    ctx.fillStyle = p.bg2;
    ctx.fillRect(0, 0, w, h);
    const noun = s.productName.split(' ').slice(-1)[0].toLowerCase();
    const titles = [`3 reasons our ${noun} sells out`, `Why 40,000 people switched`, `What happens in 14 days`, `Read this before buying a ${noun}`];
    const sets = [
      ['Visible results in 14 days', 'Derm tested, fragrance free', '60-day money back'],
      ['Week 1: skin feels calmer', 'Week 2: tone looks even', 'Week 4: friends notice'],
      ['No parabens, no fragrance', 'Made for sensitive skin', 'Free returns, no questions'],
      ['Clinically proven formula', 'Works under makeup', 'Lasts 3 months'],
    ];
    const pickIdx = Math.floor(rand() * titles.length);
    fitText(ctx, titles[pickIdx], { x: w * 0.08, y: h * 0.07, w: w * 0.84, h: h * 0.24 }, { color: p.ink, max: w * 0.11, weight: 800 });
    const items = sets[Math.floor(rand() * sets.length)];
    items.forEach((t, i) => {
      const y = h * (0.4 + i * 0.13);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(w * 0.13, y + w * 0.035, w * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${w * 0.05}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), w * 0.13, y + w * 0.037);
      ctx.fillStyle = p.ink;
      ctx.font = `600 ${w * 0.048}px ${SANS}`;
      ctx.textAlign = 'left';
      ctx.fillText(t, w * 0.22, y + w * 0.037);
    });
    drawProduct(ctx, s.shape, w * 0.78, h * 0.86, w * 0.26, p);
  },
  notes(ctx, w, h, s, rand) {
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f0e6';
    ctx.fillRect(0, 0, w, h * 0.1);
    ctx.fillStyle = '#e0a800';
    ctx.font = `600 ${w * 0.05}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹ Notes', w * 0.05, h * 0.05);
    ctx.fillStyle = '#1d1d1f';
    ctx.font = `800 ${w * 0.075}px ${SANS}`;
    ctx.textBaseline = 'top';
    const titles = ['things that fixed my skin', 'my honest skincare list', 'stuff I wish I knew at 25', 'why my skin finally cleared'];
    ctx.fillText(titles[Math.floor(rand() * titles.length)], w * 0.06, h * 0.14);
    const pool = ['- stopped using 6 products', '- spf every. single. day', '- sleep (lol)', '- drink water ok fine', '- no more scrubs', '- patience. 2 weeks min', '- one active at a time', '- clean pillowcase weekly'];
    const lines = ['- ' + s.productName.toLowerCase(), ...pool.filter(() => rand() > 0.45).slice(0, 4)];
    if (rand() > 0.5) lines.reverse();
    ctx.font = `400 ${w * 0.055}px ${SANS}`;
    lines.forEach((l, i) => ctx.fillText(l, w * 0.06, h * (0.27 + i * 0.075)));
    drawProduct(ctx, s.shape, w * 0.75, h * 0.8, w * 0.28, s.palette);
  },
  comparison(ctx, w, h, s, rand) {
    const p = s.palette;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const titles = ['US VS. THEM', 'WHY PEOPLE SWITCH', 'SOLVEA VS. THE REST', 'NOT ALL SERUMS ARE EQUAL'];
    fitText(ctx, titles[Math.floor(rand() * titles.length)], { x: w * 0.08, y: h * 0.05, w: w * 0.84, h: h * 0.12 }, { color: p.ink, max: w * 0.12, align: 'center', weight: 900 });
    const allRows = ['Clinically tested', 'Fragrance free', 'Results in 14 days', 'Under $40', 'Vegan formula', 'Dermatologist made', 'Refillable bottle'];
    const rows = allRows.filter(() => rand() > 0.35).slice(0, 4 + Math.floor(rand() * 2));
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    roundRect(ctx, w * 0.06, h * 0.22, w * 0.88, h * 0.5, w * 0.04);
    ctx.fill();
    rows.forEach((r, i) => {
      const y = h * (0.27 + i * 0.11);
      ctx.fillStyle = '#1d1d1f';
      ctx.font = `600 ${w * 0.045}px ${SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(r, w * 0.1, y);
      ctx.font = `800 ${w * 0.06}px ${SANS}`;
      ctx.fillStyle = '#2f9e44';
      ctx.fillText('✓', w * 0.66, y - w * 0.008);
      ctx.fillStyle = '#e03131';
      ctx.fillText('✕', w * 0.82, y - w * 0.008);
    });
    drawProduct(ctx, s.shape, w / 2, h * 0.86, w * 0.26, p);
  },
  ingredients(ctx, w, h, s, rand) {
    const p = s.palette;
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.8);
    g.addColorStop(0, p.bg2);
    g.addColorStop(1, p.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    drawProduct(ctx, s.shape, w / 2, h * 0.56, Math.min(w, h) * 0.48, p);
    const notes = [['Niacinamide 10%', 0.15, 0.25], ['Tranexamic acid', 0.6, 0.18], ['Vitamin C', 0.1, 0.78], ['Ceramides', 0.62, 0.82]];
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = Math.max(1, w * 0.004);
    for (const [label, x, y] of notes) {
      ctx.beginPath();
      ctx.moveTo(w * (x + 0.12), h * (y + 0.03));
      ctx.lineTo(w / 2, h * 0.56);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(ctx, w * x, h * y, w * 0.3, h * 0.06, h * 0.03);
      ctx.fill();
      ctx.fillStyle = '#1d1d1f';
      ctx.font = `700 ${w * 0.034}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w * (x + 0.15), h * (y + 0.03));
    }
  },
  carousel(ctx, w, h, s, rand) {
    const p = s.palette;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const cardW = w * (0.5 + rand() * 0.2);
    const tilt = rand() > 0.5;
    for (let i = 0; i < 2; i++) {
      const x = w * 0.08 + i * (cardW + w * 0.05);
      ctx.fillStyle = (i === 0) === tilt ? p.bg : p.bg2;
      roundRect(ctx, x, h * 0.08, cardW, h * 0.7, w * 0.03);
      ctx.fill();
      drawProduct(ctx, s.shape, x + cardW / 2, h * 0.43, cardW * 0.6, p);
    }
    ctx.fillStyle = '#1d1d1f';
    ctx.font = `700 ${w * 0.05}px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(s.productName, w * 0.08, h * 0.82);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === 0 ? '#1d1d1f' : '#c9c9c9';
      ctx.beginPath();
      ctx.arc(w * (0.42 + i * 0.05), h * 0.93, w * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

/**
 * Paints a creative into `canvas` at `width` px wide for the given aspect (w/h).
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 */
export function paintCreative(canvas, spec, aspect = 0.8, width = 240) {
  const w = Math.round(width);
  const h = Math.round(width / aspect);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rand = rng(spec.seed >>> 0);
  const draw = TEMPLATES[spec.template] || TEMPLATES.headline;
  ctx.save();
  // Variants: a nudge and a zoom around the centre, the edits that don't fool Meta.
  ctx.translate(w / 2 + (spec.dx || 0) * w, h / 2 + (spec.dy || 0) * h);
  ctx.scale(spec.zoom || 1, spec.zoom || 1);
  ctx.translate(-w / 2, -h / 2);
  draw(ctx, w, h, spec, rand);
  ctx.restore();
  if (spec.badge) {
    ctx.fillStyle = spec.palette.accent;
    roundRect(ctx, w * 0.62, h * 0.04, w * 0.33, h * 0.06, h * 0.03);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${w * 0.042}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BESTSELLER', w * 0.785, h * 0.07);
  }
  return canvas;
}
