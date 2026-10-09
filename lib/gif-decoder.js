const fs = require('node:fs/promises');
const { parseGIF, decompressFrames } = require('gifuct-js');
const CHROMA_KEY_THRESHOLD = 10;
const getLuminance = (r,g,b) => 0.299*r+0.587*g+0.114*b;
async function decodeAnimation(filename) {
 const buffer = await fs.readFile(filename);
    const gif = parseGIF(buffer);
    const rawFrames = decompressFrames(gif);

    const gifWidth = gif.lsd.width;
    const gifHeight = gif.lsd.height;
    const frames = [];
    let prevData = new Uint8ClampedArray(gifWidth * gifHeight * 4);
    let prevDisposal = 0;

    for (const raw of rawFrames) {
      const { left, top, width, height } = raw.dims;
      const pixels = raw.pixels;
      const colorTable = raw.colorTable;
      const frameData = new Uint8ClampedArray(gifWidth * gifHeight * 4);

      if (prevDisposal === 0 || prevDisposal === 1) {
        frameData.set(prevData);
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const si = y * width + x;
          const di = ((top + y) * gifWidth + (left + x)) * 4;

          const index = pixels[si];
          const color = colorTable[index];
          if (!color) continue;

          const pr = color[0];
          const pg = color[1];
          const pb = color[2];

          const lum = getLuminance(pr, pg, pb);

          if (lum < CHROMA_KEY_THRESHOLD) {
            frameData[di] = 0;
            frameData[di + 1] = 0;
            frameData[di + 2] = 0;
            frameData[di + 3] = 0;
          } else {
            frameData[di] = pr;
            frameData[di + 1] = pg;
            frameData[di + 2] = pb;
            frameData[di + 3] = 255;
          }
        }
      }

      // Animations are tinted monochrome. Store one intensity byte instead of four RGBA bytes.
      const intensity = new Uint8Array(gifWidth * gifHeight);
      for (let i = 0; i < intensity.length; i++) {
        const offset = i * 4;
        intensity[i] = frameData[offset + 3] ? Math.round(getLuminance(frameData[offset], frameData[offset + 1], frameData[offset + 2])) : 0;
      }
      frames.push({ data: intensity, delay: Math.max(raw.delay, 20) });

      prevData = raw.disposalType === 2
        ? new Uint8ClampedArray(gifWidth * gifHeight * 4)
        : new Uint8ClampedArray(frameData);
      prevDisposal = raw.disposalType;
    }

 return { frames, gifWidth, gifHeight };
}
module.exports = { decodeAnimation };
