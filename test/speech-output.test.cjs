const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../lib/voice-policy');
const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
const speech = source.slice(source.indexOf('let currentEdgeAudio ='), source.indexOf('function onActionFinished()'));

function fixture(voiceTimeout = 2000) {
  const synthesis = new EventTarget(), utterances = [], errors = [], sent = [];
  let voices = [];
  synthesis.getVoices = () => voices;
  synthesis.cancel = () => {};
  synthesis.speak = utterance => utterances.push(utterance);
  const feedback = { hidden: true, dataset: {} }, message = { textContent: '' };
  const context = vm.createContext({
    AbortController, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    window: { speechSynthesis: synthesis }, navigator: { onLine: false },
    CortanaVoicePolicy: { ...policy, waitForVoices: (synth, options) => policy.waitForVoices(synth, { timeout: voiceTimeout, ...options }) },
    resolveVoice: policy.resolveVoice, availableVoices: [], currentVoice: null,
    preferredVoiceName: 'Missing Eva Voice', pitch: 1, rate: 1, ttsEngine: 'edge',
    recordSpeechError: text => errors.push(text),
    document: { getElementById: id => id === 'speech-feedback' ? feedback : message },
    ipcRenderer: { send: (...args) => sent.push(args), invoke: async () => ({ success: true }) },
    console,
  });
  vm.runInContext(speech, context);
  return { context, synthesis, utterances, errors, sent, feedback, message,
    voices(value) { voices = value; synthesis.dispatchEvent(new Event('voiceschanged')); } };
}

test('offline Edge fallback waits for a late Windows voice and preserves missing Eva choice', async () => {
  const f = fixture();
  const speaking = vm.runInContext("speak('Hello', () => { globalThis.finished = true; })", f.context);
  await new Promise(resolve => setImmediate(resolve));
  f.voices([{ name: 'Microsoft Zira' }]);
  await speaking;
  assert.equal(f.utterances.length, 1);
  assert.equal(f.utterances[0].voice.name, 'Microsoft Zira');
  assert.equal(f.context.preferredVoiceName, 'Missing Eva Voice');
  assert.equal(f.context.finished, undefined);
  f.utterances[0].onend();
  assert.equal(f.context.finished, true);
});

test('cancelling while voices load cannot speak or finish an obsolete reply', async () => {
  const f = fixture();
  const speaking = vm.runInContext("speak('Old reply', () => { globalThis.finished = true; })", f.context);
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext('cancelSpeechOutput()', f.context);
  f.voices([{ name: 'Microsoft Zira' }]);
  await speaking;
  assert.equal(f.utterances.length, 0);
  assert.equal(f.context.finished, undefined);
  assert.equal(f.feedback.hidden, true);
});

test('no local voices and playback errors produce actionable feedback without logging reply text', async () => {
  const f = fixture(5);
  await vm.runInContext("speak('Private reply content', () => { globalThis.finished = true; })", f.context);
  assert.equal(f.context.finished, true);
  assert.equal(f.feedback.hidden, false);
  assert.match(f.message.textContent, /No Windows voice/);
  assert.equal(f.feedback.dataset.settingsTarget, 'tts-engine-select');
  assert.equal(f.errors.some(error => error.includes('Private')), false);
  assert.equal(f.context.preferredVoiceName, 'Missing Eva Voice');
  f.voices([{ name: 'Microsoft Zira' }]);
  await vm.runInContext("speak('Another private reply')", f.context);
  f.utterances[0].onerror();
  assert.match(f.message.textContent, /could not play/);
  assert.equal(f.errors.some(error => error.includes('private')), false);
});

test('an Edge media error and rejected play promise start only one local fallback', async () => {
  const f = fixture();
  f.context.navigator.onLine = true;
  f.context.edgeVoice = 'en-US-JennyNeural';
  f.context.window.cortana = { fileUrl: value => value };
  f.context.ipcRenderer.invoke = async channel => channel === 'synthesize-edge-tts'
    ? { success: true, filePath: 'fixture.mp3' } : { success: true };
  f.context.Audio = class {
    pause() {}
    play() { this.onerror(); return Promise.reject(Error('Fixture playback failure')); }
  };
  await vm.runInContext("speak('Edge fallback fixture')", f.context);
  await new Promise(resolve => setImmediate(resolve));
  f.voices([{ name: 'Microsoft Zira' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.utterances.length, 1);
  assert.match(f.message.textContent, /Using your Windows voice for this reply/);
  assert.equal(f.context.edgeVoice, 'en-US-JennyNeural');
});
