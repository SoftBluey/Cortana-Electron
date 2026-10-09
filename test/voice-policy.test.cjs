const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultVoice, resolveVoice } = require('../lib/voice-policy');
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
