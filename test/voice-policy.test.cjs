const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultVoice, resolveVoice, waitForVoices } = require('../lib/voice-policy');
test('regular Zira takes priority over Desktop regardless of enumeration order', () => {
  const voices = [{ name: 'Microsoft Zira Desktop' }, { name: 'Microsoft David' }, { name: 'Microsoft Zira - English (United States)' }];
  assert.equal(defaultVoice(voices), voices[2]);
  assert.equal(resolveVoice(voices, 'Microsoft Zira'), voices[2]);
  assert.equal(resolveVoice(voices, 'Microsoft David'), voices[1]);
});
test('missing Zira still resolves an available voice without discarding custom preferences', () => {
  const voices = [{ name: 'Microsoft David' }];
  assert.equal(resolveVoice(voices, 'custom voice'), voices[0]);
  assert.equal(defaultVoice([]), null);
});

test('voice readiness waits for Windows and removes its event subscription', async () => {
  const synthesis = new EventTarget();
  let voices = [], listeners = 0;
  const add = synthesis.addEventListener.bind(synthesis), remove = synthesis.removeEventListener.bind(synthesis);
  synthesis.addEventListener = (...args) => { listeners++; add(...args); };
  synthesis.removeEventListener = (...args) => { listeners--; remove(...args); };
  synthesis.getVoices = () => voices;
  const ready = waitForVoices(synthesis);
  voices = [{ name: 'Microsoft Zira' }];
  synthesis.dispatchEvent(new Event('voiceschanged'));
  assert.equal(await ready, voices);
  assert.equal(listeners, 0);
});

test('voice readiness is bounded and can be cancelled before Windows responds', async () => {
  const synthesis = new EventTarget();
  synthesis.getVoices = () => [];
  const abort = new AbortController();
  const ready = waitForVoices(synthesis, { signal: abort.signal });
  abort.abort();
  assert.deepEqual(await ready, []);
  assert.deepEqual(await waitForVoices(synthesis, { timeout: 5 }), []);
  synthesis.getVoices = () => assert.fail('cancelled request must not enumerate voices');
  assert.deepEqual(await waitForVoices(synthesis, { signal: abort.signal }), []);
});
