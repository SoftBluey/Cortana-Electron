function errorDetails(error) {
  const message = String(error?.message || error);
  const code = error?.hresult ?? error?.code;
  const hresult = typeof code === 'number' && (error?.hresult !== undefined || code < 0 || code >= 0x80000000)
    ? `0x${(code >>> 0).toString(16).padStart(8, '0')}`
    : message.match(/0x[\da-f]{8}/i)?.[0];
  let advice = 'Check the default input device and installed Windows speech language.';
  if (/80070005|access.*denied/i.test(message + hresult)) advice = 'Enable microphone access and desktop app microphone access in Windows Privacy settings.';
  if (/80040154|class.*registered/i.test(message + hresult)) advice = 'The Windows speech component is missing or unavailable for this process architecture.';
  if (/80045509/i.test(message + hresult)) advice = 'Enable Online speech recognition in Windows, or select the WinRT built-in commands mode.';
  if (/Unknown \(6\)/i.test(message)) advice = 'Windows dictation ended unexpectedly. Check package identity and online speech consent in speech diagnostics, or try WinRT built-in commands.';
  if (/UserCanceled \(5\)/i.test(message)) advice = 'Windows stopped listening before returning words. Try again, or try WinRT built-in commands in Speech settings.';
  return { message, hresult, code, advice, stack: error?.stack };
}

// Bound native calls and invalidate late results; aborting also cancels generated WinRT operations.
function bounded(operation, signal, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const abort = () => finish(reject, new Error('Speech operation cancelled'));
    const finish = (fn, value) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error(`Speech operation timed out after ${timeout}ms`)), timeout);
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(operation).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

// This small local grammar is an explicit offline mode, not free-form dictation.
const BUILT_IN_COMMANDS = [
  'what time is it', 'what is the time', 'what is the date', 'what day is it',
  'open downloads', 'open documents', 'open pictures', 'open music', 'open videos',
  'open desktop', 'open settings', 'open notepad', 'open calculator',
  'open notebook', 'show my notes', 'show my reminders', 'show my lists',
  'tell me a joke', 'hello', 'who are you', 'help',
  'set a timer for one minute', 'set a timer for five minutes',
  'set a timer for ten minutes', 'cancel timer',
];

class SpeechController {
  constructor({ loadBindings, onlineConsent, send, log, getMode = () => 'dictation', getIdentity = () => null }) {
    Object.assign(this, { loadBindings, onlineConsent, send, log, getMode, getIdentity });
    this.generation = 0;
    this.active = null;
    this.cleanup = Promise.resolve();
    this.wakeEnabled = false;
    this.paused = false;
    this.speaking = false;
    this.shuttingDown = false;
    this.retry = 0;
    this.retryTimer = null;
    this.bindings = null;
    this.loadError = null;
    this.wakeBlocked = false;
  }

  initialize() {
    if (this.bindings) return true;
    try {
      this.bindings = this.loadBindings();
      if (!this.bindings.SpeechRecognizer || !this.bindings.SpeechRecognitionResultStatus) throw new Error('Speech bindings are incomplete; run npm run generate-bindings.');
      this.loadError = null;
      this.log('bindings-ready', { microphoneActive: false });
      return true;
    } catch (error) {
      this.bindings = null;
      this.loadError = errorDetails(error);
      this.log('bindings-failed', this.loadError);
      return false;
    }
  }

  capabilities() {
    return { winRTAvailable: !!this.bindings, error: this.loadError,
      state: this.active?.kind || 'idle', wakeEnabled: this.wakeEnabled, speaking: this.speaking,
      recognitionEngine: 'winrt', recognitionMode: this.getMode(), packageIdentity: this.getIdentity(), wakeBlocked: this.wakeBlocked };
  }

  statusName(status) {
    const enumeration = this.bindings?.SpeechRecognitionResultStatus || {};
    return Object.keys(enumeration).find(key => enumeration[key] === status) || String(status ?? 'unavailable');
  }

  observeRecognizer(context) {
    context.subscriptions ||= [];
    const recognizer = context.recognizer;
    if (recognizer.onStateChanged) context.subscriptions.push(recognizer.onStateChanged((_sender, args) => {
      if (this.active !== context) return;
      this.log('winrt-state', { kind: context.kind, state: args?.state });
    }));
    if (recognizer.onRecognitionQualityDegrading) context.subscriptions.push(recognizer.onRecognitionQualityDegrading((_sender, args) => {
      if (this.active !== context) return;
      this.log('winrt-audio-quality', { problem: args?.problem });
    }));
  }

  async dispose(context) {
    if (!context) return;
    if (context.disposal) return context.disposal;
    context.abort.abort();
    context.disposal = (async () => {
      if (context.session && context.sessionStarted && !context.sessionCompleted) {
        try { await bounded(context.session.cancelAsync(), null, 3000); }
        catch (error) { this.log('session-stop-failed', errorDetails(error)); }
      }
      // Let WinRT event delivery return before removing handlers or closing its
      // sender; teardown inside a callback can block the native event thread.
      await new Promise(resolve => setImmediate(resolve));
      for (const unsubscribe of context.subscriptions || []) {
        try { unsubscribe(); } catch (error) { this.log('unsubscribe-failed', errorDetails(error)); }
      }
      if (context.recognizer) {
        try { context.recognizer.close(); } catch (error) { this.log('recognizer-close-failed', errorDetails(error)); }
      }
      this.log('resources-released', { kind: context.kind });
    })();
    return context.disposal;
  }

  async stop(resumeWake = true, reason = 'requested') {
    this.log('capture-stop', { reason, kind: this.active?.kind || 'idle', generation: this.generation });
    ++this.generation;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const context = this.active;
    this.active = null;
    // Disposal begins immediately, including aborting in-flight compilation.
    const disposal = this.dispose(context);
    this.cleanup = Promise.all([this.cleanup, disposal]).then(() => undefined);
    try { await this.cleanup; }
    catch (error) { this.log('cleanup-failed', errorDetails(error)); throw error; }
    if (resumeWake) this.scheduleWake();
  }

  scheduleWake() {
    if (!this.wakeEnabled || this.wakeBlocked || this.paused || this.speaking || this.shuttingDown || this.active || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.startWake().catch(error => this.log('wake-start-failed', errorDetails(error)));
    }, Math.min(1000 * 2 ** this.retry, 30000));
  }

  async setWake(enabled) {
    this.wakeEnabled = enabled === true;
    this.retry = 0;
    this.wakeBlocked = false;
    if (!this.wakeEnabled && this.active?.kind === 'wake') await this.stop(false);
    if (!this.wakeEnabled) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    else this.scheduleWake();
  }

  async setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) await this.stop(false, 'navigation/suspend');
    else this.scheduleWake();
  }

  async setSpeaking(speaking) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    if (speaking) await this.stop(false, 'tts-begin');
    else this.scheduleWake();
  }

  async startManual() {
    if (this.paused || this.shuttingDown) return;
    this.speaking = false;
    const stopping = this.stop(false, 'manual-start');
    const generation = this.generation;
    try { await stopping; } catch (error) { this.send('speech-error', errorDetails(error).advice); return; }
    if (generation !== this.generation || this.paused || this.shuttingDown) return;
    let context = { kind: 'manual', abort: new AbortController() };
    this.active = context;
    const valid = () => generation === this.generation && !this.paused && !this.shuttingDown;
    let result;
    let failure;
    try {
      if (!this.initialize()) throw new Error(this.loadError?.message || 'WinRT speech is unavailable.');
      const commands = this.getMode() === 'commands';
      if (!commands && !await this.onlineConsent()) throw new Error('Enable Windows Online speech recognition, or choose WinRT built-in commands in Settings.');
      if (!valid()) return;
      const b = this.bindings;
      const rec = context.recognizer = new b.SpeechRecognizer();
      this.observeRecognizer(context);
      rec.constraints.append(commands
        ? new b.SpeechRecognitionListConstraint(BUILT_IN_COMMANDS, 'commands')
        : new b.SpeechRecognitionTopicConstraint(b.SpeechRecognitionScenario.Dictation, 'dictation'));
      this.log('manual-compile', { language: rec.currentLanguage?.languageTag, mode: commands ? 'commands' : 'dictation' });
      const compilation = await bounded(rec.compileConstraintsAsync(context.abort.signal), context.abort.signal);
      if (!valid()) return;
      if (compilation.status !== b.SpeechRecognitionResultStatus.Success) throw new Error(`Speech compilation: ${this.statusName(compilation.status)} (${compilation.status})`);
      result = await this.recognizeContinuous(context, valid);
    } catch (error) {
      failure = error;
      if (valid()) this.log('manual-failed', errorDetails(error));
    } finally {
      try { await this.dispose(context); } catch (error) { failure = error; }
      if (this.active === context) this.active = null;
    }
    if (!valid()) return;
    if (result) this.send('speech-result', { final: true, text: result });
    else this.send('speech-error', `${failure?.message || 'No speech was recognized.'} ${failure ? errorDetails(failure).advice : ''}`);
    this.scheduleWake();
  }

  async recognizeContinuous(context, valid) {
    const b = this.bindings;
    const session = context.session = context.recognizer.continuousRecognitionSession;
    let settleResult, settleError;
    const result = new Promise((resolve, reject) => { settleResult = resolve; settleError = reject; });
    // Attach rejection handling before native startup, which can fail or emit
    // completion before startAsync has returned.
    result.catch(() => {});
    context.subscriptions.push(session.onResultGenerated((_sender, args) => {
      if (!valid()) return;
      const recognized = args?.result;
      this.log('manual-result-generated', { status: recognized?.status, confidence: recognized?.confidence, textPresent: !!recognized?.text });
      if (recognized?.status !== b.SpeechRecognitionResultStatus.Success || !recognized.text?.trim()) return;
      // Submit the first final utterance. Never put transcripts into diagnostics.
      settleResult(recognized.text.trim());
    }));
    context.subscriptions.push(session.onCompleted((_sender, args) => {
      context.sessionCompleted = true;
      if (!valid()) return;
      this.log('manual-completed', { status: args?.status });
      const error = new Error(`Speech session ended: ${this.statusName(args?.status)} (${args?.status}) without a final utterance.`);
      settleError(error);
    }));
    await bounded(session.startAsync(context.abort.signal), context.abort.signal);
    context.sessionStarted = true;
    if (!valid()) return;
    this.log('manual-listening', { engine: 'winrt', mode: this.getMode() });
    this.send('speech-ready');
    return bounded(result, context.abort.signal, 30000);
  }

  async engineChanged() {
    this.wakeBlocked = false;
    this.retry = 0;
    await this.stop(true, 'engine-change');
  }

  async wakeFailure(error, generation) {
    if (generation !== this.generation) return;
    this.retry++;
    this.wakeBlocked = this.retry >= 3;
    this.log('wake-failed', { ...errorDetails(error), attempt: this.retry, retryBlocked: this.wakeBlocked });
    this.send('hey-cortana-status', { enabled: false, reason: this.wakeBlocked
      ? 'Wake listening stopped after repeated failures. Check speech diagnostics, then toggle it on to retry.' : errorDetails(error).message });
    await this.stop(!this.wakeBlocked, 'wake-failure');
  }

  async startWake() {
    if (this.active || !this.wakeEnabled || this.wakeBlocked || this.paused || this.speaking || this.shuttingDown) return;
    if (!this.initialize()) {
      this.send('hey-cortana-status', { enabled: false, reason: 'WinRT speech is unavailable. Check speech diagnostics.' });
      return;
    }
    const pendingGeneration = this.generation;
    await this.cleanup;
    if (pendingGeneration !== this.generation || this.active || !this.wakeEnabled || this.paused || this.speaking || this.shuttingDown) return;
    const generation = ++this.generation;
    const context = { kind: 'wake', abort: new AbortController(), subscriptions: [] };
    this.active = context;
    try {
      const b = this.bindings;
      const rec = context.recognizer = new b.SpeechRecognizer();
      this.observeRecognizer(context);
      // A local list grammar avoids streaming idle dictation to an online provider.
      rec.constraints.append(new b.SpeechRecognitionListConstraint(['Hey Cortana', 'Cortana'], 'wake'));
      const compilation = await bounded(rec.compileConstraintsAsync(context.abort.signal), context.abort.signal);
      if (generation !== this.generation) return;
      if (compilation.status !== b.SpeechRecognitionResultStatus.Success) throw new Error(`Wake grammar compilation: ${this.statusName(compilation.status)} (${compilation.status})`);
      const session = context.session = rec.continuousRecognitionSession;
      context.subscriptions.push(session.onResultGenerated((_sender, args) => {
        if (generation !== this.generation || context.triggered) return;
        const result = args?.result;
        if (result?.status !== b.SpeechRecognitionResultStatus.Success || !/^(hey\s+)?cortana[.!?]?$/i.test(result.text?.trim() || '')) return;
        context.triggered = true;
        this.log('wake-detected', {});
        // UI prepares for manual recognition; startManual serializes teardown.
        queueMicrotask(() => {
          if (generation !== this.generation) return;
          this.send('wake-activate');
          this.startManual().catch(error => this.log('wake-query-failed', errorDetails(error)));
        });
      }));
      context.subscriptions.push(session.onCompleted((_sender, args) => {
        if (generation !== this.generation || context.triggered) return;
        context.sessionCompleted = true;
        this.log('wake-completed', { status: args?.status });
        queueMicrotask(() => {
          this.wakeFailure(new Error(`Wake session ended: ${this.statusName(args?.status)}`), generation)
            .catch(error => this.log('wake-stop-failed', errorDetails(error)));
        });
      }));
      await bounded(session.startAsync(context.abort.signal), context.abort.signal);
      context.sessionStarted = true;
      this.log('wake-listening', { engine: 'winrt' });
      this.send('hey-cortana-status', { enabled: true });
    } catch (error) {
      await this.wakeFailure(error, generation);
    }
  }

  async shutdown() {
    this.shuttingDown = true;
    this.wakeEnabled = false;
    await this.stop(false);
  }
}

module.exports = { SpeechController, errorDetails, bounded };
