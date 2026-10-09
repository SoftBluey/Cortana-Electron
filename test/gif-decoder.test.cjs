const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto'), path = require('node:path');
const { decodeAnimation, resizeFrame } = require('../lib/gif-decoder');
const { createAnimationLoader } = require('../lib/animation-loader');
const asset = name => path.join(__dirname, '..', 'assets', name);

test('optimized decoding retains original Cortana pixels and authored timings', async () => {
  const reference = {
    'circle_static.gif': ['f550d9258dd3e66ac4498fb07e620f36c18c3a0f8e37c147ddd02419f3c34ee1', 1, 100],
    'circle_entrance.gif': ['5053ecfbd29ce09ca18c69c4652e5a87afee13893608e38bf3f548480f953500', 39, 30],
    'circle_speaking.gif': ['eb8dbb10e15a00b88b9754eb5ed2fdddf5b138e30fa57fdead5a41fb794de3a6', 83, 30],
  };
  for (const [name, [expected, count, delay]] of Object.entries(reference)) {
    const decoded = await decodeAnimation(asset(name)), hash = crypto.createHash('sha256');
    decoded.frames.forEach(frame => hash.update(frame.data));
    assert.equal(hash.digest('hex'), expected); assert.equal(decoded.frames.length, count);
    assert.ok(decoded.frames.every(frame => frame.delay === delay));
  }
});
test('scaling preserves transparent-edge coverage without darkening covered pixels', () => {
  const result = resizeFrame(new Uint8Array([255, 0]), 2, 1, 1, 1);
  assert.equal(result.data[0], 255); assert.equal(result.alpha[0], 128);
});
test('worker decoding yields to the UI and recovers from a missing asset', async () => {
  const loader = createAnimationLoader();
  try {
    let completed = false;
    const pending = loader.decode(asset('circle_speaking.gif'), 200).then(decoded => { completed = true; return decoded; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(completed, false);
    const decoded = await pending;
    assert.equal(decoded.gifHeight, 200); assert.equal(decoded.gifWidth, 172);
    assert.equal(decoded.frames.length, 83); assert.ok(decoded.frames.every(frame => frame.alpha.byteLength === frame.data.byteLength));
    await assert.rejects(loader.decode(asset('missing.gif'), 200), /ENOENT/);
    assert.equal((await loader.decode(asset('circle_static.gif'), 200)).frames.length, 1);
  } finally { await loader.dispose(); }
});
test('disposing the worker rejects a pending decode instead of leaving it hung', async () => {
  const loader = createAnimationLoader();
  const pending = loader.decode(asset('circle_speaking.gif'), 200);
  const rejected = assert.rejects(pending, /closed/);
  await loader.dispose(); await rejected;
});
