// Visual signature of a creative: a 256-bit difference hash (16x16 gradient signs, the
// layout and shapes) plus a 3x3 grid of average colors (the palette). Computed from any
// drawable: <img>, <canvas>, bitmap. Browser only; compared in stacks.js.

let surfaces = null;

function makeSurface(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  return { canvas, ctx, w, h };
}

function getSurfaces() {
  if (!surfaces) {
    surfaces = { work: makeSurface(68, 64), fine: makeSurface(17, 16), grid: makeSurface(3, 3) };
  }
  return surfaces;
}

/**
 * @param {CanvasImageSource} source
 * @returns {{bits:number[], grid:number[], aspect:number}|null}
 */
export function computeSignature(source) {
  const sw = source.naturalWidth || source.videoWidth || source.width;
  const sh = source.naturalHeight || source.videoHeight || source.height;
  if (!sw || !sh) return null;
  const { work, fine, grid } = getSurfaces();

  // Two-step downscale: straight to 17x16 aliases badly on large images.
  work.ctx.clearRect(0, 0, work.w, work.h);
  work.ctx.drawImage(source, 0, 0, work.w, work.h);
  fine.ctx.clearRect(0, 0, fine.w, fine.h);
  fine.ctx.drawImage(work.canvas, 0, 0, fine.w, fine.h);
  grid.ctx.clearRect(0, 0, grid.w, grid.h);
  grid.ctx.drawImage(work.canvas, 0, 0, grid.w, grid.h);

  let px;
  let cells;
  try {
    px = fine.ctx.getImageData(0, 0, fine.w, fine.h).data;
    cells = grid.ctx.getImageData(0, 0, grid.w, grid.h).data;
  } catch {
    return null; // Tainted canvas: a cross-origin image served without CORS.
  }

  const bits = [0, 0, 0, 0, 0, 0, 0, 0];
  let bit = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 17 + x) * 4;
      const a = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      const b = px[i + 4] * 0.299 + px[i + 5] * 0.587 + px[i + 6] * 0.114;
      if (a < b) bits[bit >> 5] = (bits[bit >> 5] | (1 << (31 - (bit & 31)))) >>> 0;
      bit++;
    }
  }
  const gridColors = [];
  for (let i = 0; i < 9; i++) gridColors.push(cells[i * 4], cells[i * 4 + 1], cells[i * 4 + 2]);
  return { bits, grid: gridColors, aspect: sw / sh };
}
