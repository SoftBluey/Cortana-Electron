const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EdgeTTS } = require('../lib/edge-tts');

test('Edge connection uses the established endpoint, v2 protocol and a unique request ID', async () => {
  const sockets = [], requests = [];
  const tts = new EdgeTTS({ timeout: 1200 }, (url, options) => {
    const socket = new EventEmitter(); sockets.push(socket); requests.push({ url: new URL(url), options }); return socket;
  });
  const first = tts._connectWebSocket(); sockets[0].emit('open'); assert.equal(await first, sockets[0]);
  const second = tts._connectWebSocket(); sockets[1].emit('open'); await second;
  for (const { url, options } of requests) {
    assert.equal(url.protocol, 'wss:'); assert.equal(url.hostname, 'speech.platform.bing.com');
    assert.match(url.searchParams.get('Sec-MS-GEC'), /^[A-F0-9]{16}-[A-F0-9]{64}$/);
    assert.match(url.searchParams.get('Sec-MS-GEC-Version'), /^2-/);
    assert.match(url.searchParams.get('ConnectionId'), /^[a-f0-9]{32}$/);
    assert.equal(options.handshakeTimeout, 1200);
    assert.equal(options.rejectUnauthorized, undefined);
  }
  assert.notEqual(requests[0].url.searchParams.get('ConnectionId'), requests[1].url.searchParams.get('ConnectionId'));
  for (const socket of sockets) { socket.emit('error', Error('Termination error')); socket.emit('close'); assert.equal(socket.listenerCount('error'), 0); }
});

test('Edge connection rejects a failed or prematurely closed handshake', async () => {
  let socket;
  const tts = new EdgeTTS({}, () => (socket = new EventEmitter()));
  const failed = tts._connectWebSocket(); socket.emit('error', Error('Fixture handshake failed'));
  await assert.rejects(failed, /handshake failed/); socket.emit('close');
  const closed = tts._connectWebSocket(); socket.emit('close');
  await assert.rejects(closed, /closed before/);
  assert.equal(socket.listenerCount('open'), 0); assert.equal(socket.listenerCount('error'), 0);
});

function synthesisFixture() {
  const source = fs.readFileSync(require.resolve('../main.js'), 'utf8');
  const code = source.slice(source.indexOf('const MAX_TTS_TEXT_LENGTH ='), source.indexOf('  const media=createMedia'));
  let synthesize, mode = 'success', count = 0, backendCalls = 0;
  const files = new Map(), generated = new Set();
  vm.runInNewContext(code, {
    ipcMain: { handle: (_name, handler) => { synthesize = handler; } },
    os: { tmpdir: () => 'fixture-temp' }, path, crypto: { randomUUID: () => String(++count) },
    fs: { stat: async file => ({ size: files.get(file)?.length || 0 }), unlink: async file => { files.delete(file); } },
    EdgeTTS: class { async ttsPromise(_text, file) {
      backendCalls++; files.set(file, mode === 'empty' ? '' : 'fixture audio');
      if (mode === 'failure') throw Error('Fixture interrupted synthesis');
    } },
    generatedTtsFiles: generated, console: { error() {} }, logSpeech() {}, errorDetails: error => ({ message: error.message }),
  });
  return { files, generated, get backendCalls() { return backendCalls; }, set mode(value) { mode = value; },
    run: payload => synthesize({}, { text: 'Hello', voice: 'en-US-JennyNeural', pitch: 1, rate: 1, ...payload }) };
}

test('failed and empty Edge synthesis removes its partial file instead of reporting success', async () => {
  const f = synthesisFixture();
  f.mode = 'failure'; assert.equal((await f.run()).success, false);
  assert.equal(f.files.size, 0); assert.equal(f.generated.size, 0);
  f.mode = 'empty'; assert.match((await f.run()).error, /no audio/);
  assert.equal(f.files.size, 0); assert.equal(f.generated.size, 0);
  f.mode = 'success'; const result = await f.run();
  assert.equal(result.success, true); assert.ok(f.files.has(result.filePath)); assert.ok(f.generated.has(result.filePath));
});

test('invalid speech payloads cannot reach the synthesis backend', async () => {
  const f = synthesisFixture();
  for (const payload of [{ text: '' }, { text: 'a'.repeat(4097) }, { voice: '../unknown' }, { pitch: Infinity }, { rate: -1 }]) {
    assert.equal((await f.run(payload)).success, false);
  }
  assert.equal(f.backendCalls, 0); assert.equal(f.files.size, 0);
});
