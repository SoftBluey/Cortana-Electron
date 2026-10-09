const { parentPort } = require('node:worker_threads');
const { decodeAnimation } = require('./gif-decoder');
let pending = Promise.resolve();
parentPort.on('message', ({ id, filename, maxHeight }) => {
  pending = pending.then(async () => {
    try {
      const decoded = await decodeAnimation(filename, maxHeight);
      const buffers = decoded.frames.flatMap(frame => frame.alpha ? [frame.data.buffer, frame.alpha.buffer] : [frame.data.buffer]);
      parentPort.postMessage({ id, decoded }, buffers);
    } catch (error) { parentPort.postMessage({ id, error: error.message }); }
  });
});
