// Card artwork for the 3D view: the creative, cover-fit, with paper layers behind it when
// several ads share the visual, a count badge, and a dashed outline when the funnel
// position is estimated. Also a tiny blurred copy used for depth of field.

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, source, x, y, w, h) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) {
    ctx.fillStyle = '#26262a';
    ctx.fillRect(x, y, w, h);
    return;
  }
  const scale = Math.max(w / sw, h / sh);
  const cw = w / scale;
  const ch = h / scale;
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}

/** Neutral stand-in when a preview fails to load. */
export function placeholderCanvas(label = '', aspect = 0.8) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = Math.round(160 / aspect);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#2b2b30');
  g.addColorStop(1, '#1d1d21');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '600 13px -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label.slice(0, 22), c.width / 2, c.height / 2);
  return c;
}

/**
 * @param {CanvasImageSource} source
 * @param {{aspect:number, count:number, dashed:boolean, width?:number}} opts
 * @returns {{sharp:HTMLCanvasElement, soft:HTMLCanvasElement, frame:{x:number,y:number,w:number,h:number}, outW:number, outH:number}}
 */
export function buildCardCanvases(source, opts) {
  const width = opts.width || 220;
  const aspect = Math.max(0.5, Math.min(1.91, opts.aspect || 0.8));
  const imgW = width;
  const imgH = Math.round(width / aspect);
  const layers = opts.count > 1 ? Math.min(2, opts.count - 1) : 0;
  const step = Math.round(width * 0.045);
  const pad = Math.round(width * 0.03);
  const W = imgW + pad * 2 + layers * step;
  const H = imgH + pad * 2 + layers * step;

  const sharp = document.createElement('canvas');
  sharp.width = W;
  sharp.height = H;
  const ctx = sharp.getContext('2d');
  const x0 = pad;
  const y0 = pad + layers * step;
  const r = Math.max(2, width * 0.018);

  // Paper layers peek out to the upper right, one per extra ad (two at most).
  for (let i = layers; i >= 1; i--) {
    ctx.fillStyle = i === 1 ? 'rgba(232,230,224,0.62)' : 'rgba(232,230,224,0.34)';
    roundRect(ctx, x0 + i * step, y0 - i * step, imgW, imgH, r);
    ctx.fill();
  }

  ctx.save();
  roundRect(ctx, x0, y0, imgW, imgH, r);
  ctx.clip();
  drawCover(ctx, source, x0, y0, imgW, imgH);
  ctx.restore();

  if (opts.dashed) {
    ctx.save();
    ctx.setLineDash([width * 0.045, width * 0.03]);
    ctx.lineWidth = Math.max(2, width * 0.012);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    roundRect(ctx, x0 + 1.5, y0 + 1.5, imgW - 3, imgH - 3, r);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.lineWidth = Math.max(1, width * 0.005);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    roundRect(ctx, x0 + 0.5, y0 + 0.5, imgW - 1, imgH - 1, r);
    ctx.stroke();
  }

  if (opts.count > 1) {
    const label = opts.count + '×';
    const fs = Math.round(width * 0.085);
    ctx.font = `700 ${fs}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + fs * 0.9;
    const bh = fs * 1.45;
    const bx = x0 + width * 0.04;
    const by = y0 + imgH - bh - width * 0.04;
    ctx.fillStyle = 'rgba(12,12,14,0.82)';
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + fs * 0.04);
  }

  // Blurred twin: repeated halving acts as a cheap box blur, then GPU bilinear does the rest.
  let soft = sharp;
  for (let i = 0; i < 3; i++) {
    const next = document.createElement('canvas');
    next.width = Math.max(4, Math.round(soft.width / 2));
    next.height = Math.max(4, Math.round(soft.height / 2));
    const nctx = next.getContext('2d');
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(soft, 0, 0, next.width, next.height);
    soft = next;
  }

  return { sharp, soft, frame: { x: x0, y: y0, w: imgW, h: imgH }, outW: W, outH: H };
}
