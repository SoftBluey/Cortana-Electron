const fs = require('node:fs/promises');
const { parseGIF, decompressFrames } = require('gifuct-js');

// Average covered pixels separately from transparency, preserving soft edges when scaled.
function resizeFrame(source, width, height, targetWidth, targetHeight) {
  const data = new Uint8Array(targetWidth * targetHeight), alpha = new Uint8Array(data.length);
  const scaleX = width / targetWidth, scaleY = height / targetHeight;
  for (let y = 0; y < targetHeight; y++) {
    const top = y * scaleY, bottom = (y + 1) * scaleY;
    for (let x = 0; x < targetWidth; x++) {
      const left = x * scaleX, right = (x + 1) * scaleX;
      let sum = 0, coverage = 0;
      for (let sy = Math.floor(top); sy < Math.min(height, Math.ceil(bottom)); sy++) {
        const weightY = Math.min(bottom, sy + 1) - Math.max(top, sy);
        for (let sx = Math.floor(left); sx < Math.min(width, Math.ceil(right)); sx++) {
          const value = source[sy * width + sx];
          if (!value) continue;
          const weight = weightY * (Math.min(right, sx + 1) - Math.max(left, sx));
          sum += value * weight; coverage += weight;
        }
      }
      const index = y * targetWidth + x;
      if (coverage) { data[index] = Math.round(sum / coverage); alpha[index] = Math.round(255 * coverage / (scaleX * scaleY)); }
    }
  }
  return { data, alpha };
}
async function decodeAnimation(filename, maxHeight = Infinity) {
  const gif = parseGIF(await fs.readFile(filename));
  const width = gif.lsd.width, height = gif.lsd.height;
  const gifHeight = Math.min(height, Math.max(1, Math.round(maxHeight)));
  const gifWidth = Math.max(1, Math.round(width * gifHeight / height));
  const frames = [];
  let previous = new Uint8Array(width * height), previousDisposal = 0;
  for (const raw of decompressFrames(gif)) {
    const frame = new Uint8Array(width * height);
    if (previousDisposal === 0 || previousDisposal === 1) frame.set(previous);
    const palette = raw.colorTable.map(([r, g, b]) => {
      const luminance = .299 * r + .587 * g + .114 * b;
      return luminance < 10 ? 0 : Math.round(luminance);
    });
    const { left, top, width: patchWidth, height: patchHeight } = raw.dims;
    for (let y = 0; y < patchHeight; y++) {
      for (let x = 0; x < patchWidth; x++) {
        const index = raw.pixels[y * patchWidth + x];
        if (index < palette.length) frame[(top + y) * width + left + x] = palette[index];
      }
    }
    frames.push({ ...(gifHeight === height ? { data: frame } : resizeFrame(frame, width, height, gifWidth, gifHeight)), delay: Math.max(raw.delay, 20) });
    previous = raw.disposalType === 2 ? new Uint8Array(width * height) : frame;
    previousDisposal = raw.disposalType;
  }
  return { frames, gifWidth, gifHeight };
}
module.exports = { decodeAnimation, resizeFrame };
