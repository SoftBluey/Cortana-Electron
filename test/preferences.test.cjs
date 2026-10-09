const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createWriter, validNotebook, migrateInterfaceSettings } = require('../lib/preferences');
const { normalizeEndpoint, isLoopback } = require('../lib/ai-endpoint');

test('ordered atomic writes preserve newest settings, including an absent Eva preference', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cortana-test-'));
  try {
    const file = path.join(directory, 'settings.json'); const write = createWriter();
    await Promise.all(Array.from({ length: 30 }, (_, index) => write(file, JSON.stringify({ index, preferredVoice: 'Microsoft Eva Mobile' }))));
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { index: 29, preferredVoice: 'Microsoft Eva Mobile' });
    assert.deepEqual(await fs.readdir(directory), ['settings.json']);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('a failed write does not poison future writes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cortana-test-'));
  try {
    const write = createWriter(); await assert.rejects(write(path.join(directory, 'missing', 'file'), 'old'));
    const filename = path.join(directory, 'file'); await write(filename, 'new'); assert.equal(await fs.readFile(filename, 'utf8'), 'new');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('Notebook rejects oversized data, invalid task shape, and duplicate IDs', () => {
  const task = { id: 'a', text: 'Remember this', done: false };
  assert.equal(validNotebook({ notes: '<script>plain text</script>', todos: [task], introduced: true }), true);
  for (const todos of [[{ ...task, done: 'yes' }], [task, task], [{ ...task, text: '' }]]) assert.equal(validNotebook({ notes: '', todos, introduced: false }), false);
  assert.equal(validNotebook({ notes: 'x'.repeat(20001), todos: [], introduced: false }), false);
});
test('Notebook accepts old profiles and rejects invalid new personal preferences', () => {
  const old = { notes: 'keep me', todos: [], introduced: true };
  assert.equal(validNotebook(old), true);
  const profile = { name: 'Bluey', home: 'Chicago', work: '', weatherCity: 'Chicago' };
  assert.equal(validNotebook({ ...old, profile }), true);
  assert.equal(validNotebook({ ...old, profile: { ...profile, name: 'x'.repeat(81) } }), false);
  assert.equal(validNotebook({ ...old, profile: { ...profile, home: 42 } }), false);
});
test('v8 restores troubleshooting-muted cues once and preserves subsequent mute choices and unrelated settings', () => {
  const old = { listeningSounds: false, preferredVoice: 'Microsoft Eva Mobile', unknownPreference: { kept: true } };
  const upgraded = migrateInterfaceSettings(old);
  assert.equal(upgraded.listeningSounds, true);
  assert.equal(upgraded.preferredVoice, old.preferredVoice);
  assert.deepEqual(upgraded.unknownPreference, old.unknownPreference);
  assert.equal(old.listeningSounds, false);
  upgraded.listeningSounds = false;
  assert.equal(migrateInterfaceSettings(upgraded).listeningSounds, false);
});
test('audio output changes do not invalidate input capture; changing the input does', () => {
  const { inputFingerprint } = require('../lib/audio-device-policy');
  const input = { kind: 'audioinput', deviceId: 'default', groupId: 'nvidia' };
  assert.equal(inputFingerprint([input]), inputFingerprint([input, { kind: 'audiooutput', deviceId: 'hp', groupId: 'hdmi' }]));
  assert.notEqual(inputFingerprint([input]), inputFingerprint([{ ...input, groupId: 'g733' }]));
});
test('Ollama root, v1 and full endpoints normalize identically', () => {
  for (const value of ['http://localhost:11434', 'http://localhost:11434/v1/', 'http://localhost:11434/v1/chat/completions']) {
    assert.equal(normalizeEndpoint(value).href, 'http://localhost:11434/v1/chat/completions');
  }
  assert.equal(normalizeEndpoint('http://127.0.0.1:11434/v1').pathname, '/v1/chat/completions');
});
test('compatible versioned API paths and query strings are preserved', () => {
  assert.equal(normalizeEndpoint('https://host.test/openai/v1?x=1').href, 'https://host.test/openai/v1/chat/completions?x=1');
  assert.equal(normalizeEndpoint('https://host.test/v1beta/openai').pathname, '/v1beta/openai/chat/completions');
  assert.throws(() => normalizeEndpoint('file:///file')); assert.throws(() => normalizeEndpoint('https://key:secret@host.test'));
});
test('offline local AI eligibility uses parsed loopback hosts, not hostname substrings', () => {
  for (const url of ['http://localhost:11434', 'http://127.0.0.1:1234', 'http://[::1]:11434']) assert.equal(isLoopback(url), true);
  for (const url of ['https://localhost.evil.test', 'https://openai.com.evil.test', 'invalid']) assert.equal(isLoopback(url), false);
});
