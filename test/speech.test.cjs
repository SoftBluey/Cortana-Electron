const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpeechController, bounded, errorDetails } = require('../lib/speech-controller');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ compile, recognize, consent = true, mode = 'dictation', start, getWindowState } = {}) {
  const events = [], records = [], instances = [], diagnostics = [];
  const bindings = {
    SpeechRecognitionResultStatus: { Success: 0, UserCanceled: 5, Unknown: 6 }, SpeechRecognitionScenario: { Dictation: 0 },
    SpeechRecognitionTopicConstraint: class { constructor(_, tag) { this.tag = tag; } },
    SpeechRecognitionListConstraint: class { constructor(words, tag) { this.words = words; this.tag = tag; } },
    SpeechRecognizer: class {
      constructor() {
        instances.push(this); this.constraints = { append: constraint => { this.constraint = constraint; } };
        this.currentLanguage = { languageTag: 'en-US' };
        this.continuousRecognitionSession = {
          onResultGenerated: callback => { this.resultCallback = callback; return () => records.push('unsubscribe-result'); },
          onCompleted: callback => { this.completedCallback = callback; return () => records.push('unsubscribe-completed'); },
          startAsync: async () => {
            records.push('capture-start');
            if (start) return start(this);
            if (this.constraint.tag !== 'wake') setImmediate(async () => {
              try { this.resultCallback(null, { result: recognize ? await recognize() : { status: 0, text: 'hello' } }); }
              catch { this.completedCallback(null, { status: 6 }); }
            });
          },
          cancelAsync: async () => records.push('capture-cancel'),
        };
      }
      async compileConstraintsAsync() { return compile ? compile() : { status: 0 }; }
      onStateChanged(callback) { this.stateCallback = callback; return () => records.push('unsubscribe-state'); }
      onHypothesisGenerated(callback) { this.hypothesisCallback = callback; return () => records.push('unsubscribe-hypothesis'); }
      close() { records.push('close'); this.closed = true; }
    },
  };
  const controller = new SpeechController({ loadBindings: () => bindings, onlineConsent: async () => consent,
    getMode: () => mode, getIdentity: () => false, getWindowState,
    send: (channel, data) => events.push({ channel, data }), log: (stage, details) => diagnostics.push({ stage, ...details }) });
  return { controller, events, records, instances, diagnostics };
}

test('native cancellation records capture context without blaming consent or logging speech', async () => {
  let windowFocused = true;
  const f = fixture({
    getWindowState: () => ({ visible: true, focused: windowFocused, minimized: false, title: 'private window title' }),
    start: rec => setImmediate(() => {
      rec.stateCallback(null, { state: 5 });
      rec.hypothesisCallback(null, { hypothesis: { text: 'private spoken words' } });
      windowFocused = false;
      rec.completedCallback(null, { status: 5 });
    }),
  });
  await f.controller.startManual();
  const completed = f.diagnostics.find(event => event.stage === 'manual-completed');
  assert.equal(completed.source, 'windows'); assert.equal(completed.statusName, 'UserCanceled');
  assert.equal(completed.packageIdentity, false); assert.equal(completed.windowFocused, false);
  assert.equal(completed.speechDetected, true); assert.equal(completed.hypothesisGenerated, true);
  assert.ok(completed.listeningMs >= 0);
  assert.equal(f.records.includes('capture-cancel'), false);
  assert.match(f.events.at(-1).data, /without you pressing Cancel/);
  assert.doesNotMatch(f.events.at(-1).data, /permission|consent/i);
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /private window title|private spoken words/);
  assert.ok(f.records.includes('unsubscribe-hypothesis'));
  const count = f.diagnostics.length;
  f.instances[0].stateCallback(null, { state: 1 });
  f.instances[0].hypothesisCallback(null, { hypothesis: { text: 'late words' } });
  assert.equal(f.diagnostics.length, count);
});

test('unavailable window diagnostics cannot prevent recognition', async () => {
  const f = fixture({ getWindowState: () => { throw Error('window destroyed'); } });
  await f.controller.startManual();
  assert.equal(f.events.at(-1).channel, 'speech-result');
  assert.equal(f.diagnostics.find(event => event.stage === 'manual-listening').windowFocused, null);
});

test('loading capabilities does not activate a recognizer or microphone', () => {
  const f = fixture(); assert.equal(f.controller.initialize(), true); assert.equal(f.instances.length, 0);
});

test('default speech uses only WinRT continuous dictation', async () => {
  const f = fixture(); await f.controller.startManual();
  assert.equal(f.instances.length, 1); assert.equal(f.instances[0].constraint.tag, 'dictation');
  assert.equal(f.controller.capabilities().recognitionEngine, 'winrt');
});
test('wake holds one WinRT capture through silence and releases it before TTS', async () => {
  const f = fixture(); f.controller.wakeEnabled = true;
  await f.controller.startWake(); await f.controller.setSpeaking(false);
  assert.equal(f.instances.length, 1); assert.equal(f.controller.active.kind, 'wake');
  await f.controller.setSpeaking(true); assert.ok(f.records.includes('capture-cancel'));
  assert.equal(f.controller.active, null); await f.controller.shutdown();
});
test('wake failures stop reopening the microphone after three failures', async () => {
  const f = fixture({ start: () => { throw new Error('failure'); } }); f.controller.wakeEnabled = true;
  for (let i = 0; i < 3; i++) { await f.controller.startWake(); clearTimeout(f.controller.retryTimer); f.controller.retryTimer = null; }
  assert.equal(f.instances.length, 3); assert.equal(f.controller.wakeBlocked, true);
  await f.controller.startWake(); assert.equal(f.instances.length, 3); await f.controller.shutdown();
});

test('cancel during wake startup never cancels an unstarted native session', async () => {
  const f = fixture(); f.controller.wakeEnabled = true;
  const pending = deferred(); f.controller.initialize();
  const Original = f.controller.bindings.SpeechRecognizer;
  f.controller.bindings.SpeechRecognizer = class extends Original {
    constructor() { super(); this.continuousRecognitionSession.startAsync = () => pending.promise; }
  };
  const start = f.controller.startWake(); await tick(); await f.controller.stop(false);
  pending.resolve(); await start;
  assert.equal(f.records.includes('capture-cancel'), false); assert.ok(f.records.includes('close'));
  await f.controller.shutdown();
});
test('manual result is emitted only after microphone release', async () => {
  const f = fixture(); await f.controller.startManual();
  assert.ok(f.records.indexOf('capture-cancel') < f.records.indexOf('close')); assert.equal(f.events.at(-1).data.text, 'hello'); assert.equal(f.controller.active, null);
});
test('WinRT failure returns actionable error and never invokes an older speech API', async () => {
  const f = fixture({ recognize: () => { throw new Error('backend error'); } }); await f.controller.startManual();
  assert.equal(f.instances.length, 1); assert.equal(f.events.at(-1).channel, 'speech-error');
  assert.match(f.events.at(-1).data, /Unknown \(6\)/);
  assert.ok(f.records.includes('close')); assert.equal(f.records.includes('capture-cancel'), false);
});
test('online dictation without consent fails before opening the microphone', async () => {
  const f = fixture({ consent: false }); await f.controller.startManual();
  assert.equal(f.instances.length, 0);
  assert.equal(f.diagnostics.find(event => event.stage === 'manual-failed').code, 'ONLINE_SPEECH_CONSENT_UNCONFIRMED');
  assert.equal(f.events.some(event => event.channel === 'speech-ready'), false);
  assert.match(f.events.at(-1).data, /did not open the microphone/);
});
test('WinRT built-in commands work without online consent', async () => {
  const f = fixture({ consent: false, mode: 'commands' }); await f.controller.startManual();
  assert.equal(f.instances[0].constraint.tag, 'commands');
  assert.ok(f.instances[0].constraint.words.includes('what time is it'));
  assert.equal(f.events.at(-1).data.text, 'hello');
});

test('cancel during compilation prevents late recognition and results', async () => {
  const pending = deferred(); const f = fixture({ compile: () => pending.promise });
  const started = f.controller.startManual(); await tick(); await f.controller.stop(false);
  pending.resolve({ status: 0 }); await started;
  assert.equal(f.events.some(event => event.channel === 'speech-result'), false); assert.equal(f.controller.active, null);
});
test('cancel during recognition and immediate reinitialization suppress stale output', async () => {
  const pending = deferred(); let calls = 0;
  const f = fixture({ recognize: () => ++calls === 1 ? pending.promise : { status: 0, text: 'new' } });
  const old = f.controller.startManual(); await tick(); await f.controller.stop(false);
  await f.controller.startManual(); pending.resolve({ status: 0, text: 'old' }); await old;
  assert.deepEqual(f.events.filter(e => e.channel === 'speech-result').map(e => e.data.text), ['new']);
});
test('TTS awaits WinRT capture teardown and prevents wake capture', async () => {
  const f = fixture({ start: async () => {} }); const manual = f.controller.startManual(); await tick();
  await f.controller.setSpeaking(true); await manual;
  assert.ok(f.records.includes('capture-cancel')); assert.equal(f.controller.active, null);
  await f.controller.setWake(true); assert.equal(f.controller.retryTimer, null); await f.controller.shutdown();
});

test('wake cancellation unsubscribes event handlers and rejects stale detections', async () => {
  const f = fixture(); f.controller.wakeEnabled = true; await f.controller.startWake();
  const rec = f.instances[0]; await f.controller.setWake(false);
  rec.resultCallback(null, { result: { status: 0, text: 'Hey Cortana' } });
  assert.equal(f.events.some(e => e.channel === 'wake-activate'), false);
  assert.ok(f.records.includes('unsubscribe-result')); assert.ok(f.records.includes('unsubscribe-completed'));
  await f.controller.shutdown();
});
test('shutdown cancels compilation, releases resources, and cannot restart wake', async () => {
  const pending = deferred(); const f = fixture({ compile: () => pending.promise });
  const started = f.controller.startManual(); await tick(); await f.controller.shutdown();
  pending.resolve({ status: 0 }); await started; await f.controller.startManual();
  assert.equal(f.controller.active, null); assert.equal(f.controller.retryTimer, null);
});
test('manual activation supersedes a wake start waiting for prior cleanup', async () => {
  const pending = deferred(); const f = fixture();
  f.controller.cleanup = pending.promise; f.controller.wakeEnabled = true;
  const wake = f.controller.startWake(); const manual = f.controller.startManual();
  pending.resolve(); await Promise.all([wake, manual]);
  assert.equal(f.instances.length, 1); assert.equal(f.instances[0].constraint.tag, 'dictation');
  assert.equal(f.events.at(-1).data.text, 'hello'); await f.controller.shutdown();
});
test('bounded native operation times out and errors retain HRESULT and stage advice', async () => {
  await assert.rejects(bounded(new Promise(() => {}), null, 5), /timed out/);
  const error = errorDetails(new Error('HRESULT 0x80070005 Access denied'));
  assert.equal(error.hresult, '0x80070005'); assert.match(error.advice, /microphone access/);
});
