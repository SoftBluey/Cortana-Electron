const { Worker } = require('node:worker_threads');
const path = require('node:path');

function createAnimationLoader() {
  let worker = null, nextId = 0;
  const requests = new Map();
  function fail(error) {
    for (const request of requests.values()) request.reject(error);
    requests.clear();
  }
  return {
    decode(filename, maxHeight) {
      if (!worker) {
        const current = worker = new Worker(path.join(__dirname, 'gif-worker.js'));
        current.on('message', ({ id, decoded, error }) => {
          const request = requests.get(id); if (!request) return;
          requests.delete(id);
          if (error) request.reject(new Error(error)); else request.resolve(decoded);
          if (!requests.size) current.unref();
        });
        current.on('error', error => { if (worker === current) fail(error); });
        current.on('exit', code => {
          if (worker !== current) return;
          worker = null; fail(new Error(`Animation worker stopped (${code}).`));
        });
      }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        requests.set(id, { resolve, reject }); worker.ref();
        worker.postMessage({ id, filename, maxHeight });
      });
    },
    dispose() {
      const current = worker; worker = null;
      fail(new Error('Animation loader closed.'));
      return current?.terminate();
    },
  };
}
module.exports = { createAnimationLoader };
