// Deliberate, short default-microphone test; records stages, never transcripts.
const app = process.versions.electron ? require('electron').app : null;
const fs = require('node:fs');
const path = require('node:path');
const { SpeechController, bounded, errorDetails } = require('../lib/speech-controller');
const webSearch = process.argv.includes('--web-search');
const systemUI = process.argv.includes('--system-ui');
const mode = process.argv.includes('--commands') ? 'commands' : webSearch ? 'web-search' : 'dictation';
const wake = process.argv.includes('--wake');
const single = process.argv.includes('--single') || systemUI;
if (webSearch && (!single || mode === 'commands' || wake)) throw Error('--web-search requires --single or --system-ui, without --commands/--wake');
if (systemUI && (!app || !process.argv.includes('--window') || wake)) throw Error('--system-ui requires Electron --window, without --wake');
const duration = Number(process.argv.find(arg => arg.startsWith('--duration='))?.slice(11) || 6000);
if (!Number.isInteger(duration) || duration < 1000 || duration > 30000) throw Error('Duration must be 1000–30000 milliseconds');
const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) || (wake ? 'wake-probe' : `${mode}-probe`);
if (!/^[a-zA-Z0-9._-]+$/.test(label)) throw Error('Use a simple report label');
const output = path.resolve(__dirname, '../.verification');
fs.mkdirSync(output, { recursive: true });
app?.setPath('userData', fs.mkdtempSync(path.join(output, 'winrt-probe-')));
const records = [];
let probeWindow;
const started = performance.now();
function record(stage, details = {}) {
  const event = { stage, elapsedMs: Math.round(performance.now() - started), ...details };
  records.push(event);
  console.log(JSON.stringify(event));
  const listening = stage === 'speech-ready' || (stage === 'single-state' && details.state === 1);
  if (listening && probeWindow && !probeWindow.isDestroyed()) {
    probeWindow.setTitle('Listening - say “what time is it”');
    probeWindow.webContents.executeJavaScript("document.getElementById('status').textContent = 'Listening. Say “what time is it” now.'").catch(() => {});
  }
}
const save = () => fs.writeFileSync(path.join(output, `winrt-${label}.json`), JSON.stringify(records, null, 2));
const quit = () => app ? app.quit() : undefined;
(app ? app.whenReady() : Promise.resolve()).then(async () => {
  if (process.argv.includes('--window')) {
    if (!app) throw Error('The foreground-window probe requires Electron');
    const window = probeWindow = new (require('electron').BrowserWindow)({ width: 480, height: 260,
      title: 'Preparing Cortana speech diagnostic', backgroundColor: '#171717', show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"></head><body style="background:#171717;color:white;font:18px Segoe UI;padding:24px"><h2>Speech recognition test</h2><p id="status">Preparing. Wait for the Listening cue.</p><p>Keep this window focused while listening. Audio and transcripts are not saved.</p></body></html>'));
    window.on('focus', () => record('probe-window-focus', { focused: true }));
    window.on('blur', () => record('probe-window-focus', { focused: false }));
    window.show(); window.focus();
    record('probe-window', { focused: window.isFocused() });
  }
  const runtime = require('@microsoft/dynwinrt');
  runtime.roInitialize(process.argv.includes('--mta') ? 1 : 0);
  record('environment', { node: process.versions.node, electron: process.versions.electron || null,
    runtime: require('../package.json').dependencies['@microsoft/dynwinrt'], os: require('node:os').release(),
    apartment: process.argv.includes('--mta') ? 'MTA' : 'STA', mode, api: systemUI ? 'system-ui' : single ? 'single' : 'continuous' });
  record('identity', { present: runtime.hasPackageIdentity() });
  const loadBindings = () => {
    const b = require('../.winapp/bindings');
    return { ...b, SpeechRecognizer: class extends b.SpeechRecognizer {
      constructor() {
        super();
        if (process.argv.includes('--extend-silence')) this.timeouts.initialSilenceTimeout = { duration: BigInt(duration)*10000n };
        const milliseconds = value => Number(value.duration)/10000;
        record('recognizer-created', { language: this.currentLanguage.languageTag,
          initialSilenceMs: milliseconds(this.timeouts.initialSilenceTimeout),
          endSilenceMs: milliseconds(this.timeouts.endSilenceTimeout), babbleMs: milliseconds(this.timeouts.babbleTimeout) });
      }
    } };
  };
  if (single) {
    const b = loadBindings(), rec = new b.SpeechRecognizer(), abort = new AbortController();
    const subscriptions = [];
    try {
      subscriptions.push(rec.onStateChanged((_sender, args) => record('single-state', { state: args.state })));
      subscriptions.push(rec.onRecognitionQualityDegrading((_sender, args) => record('single-audio-quality', { problem: args.problem })));
      if (rec.onHypothesisGenerated) subscriptions.push(rec.onHypothesisGenerated((_sender, args) => record('single-hypothesis', { textPresent: !!args.hypothesis?.text })));
      rec.constraints.append(mode === 'commands'
        ? new b.SpeechRecognitionListConstraint(['what time is it', 'hello Cortana'], 'commands')
        : new b.SpeechRecognitionTopicConstraint(webSearch ? b.SpeechRecognitionScenario.WebSearch : b.SpeechRecognitionScenario.Dictation, mode));
      const compilation = await bounded(rec.compileConstraintsAsync(abort.signal), abort.signal);
      record('single-compiled', { status: compilation.status });
      if (compilation.status === b.SpeechRecognitionResultStatus.Success) {
        if (systemUI) {
          // Avoid playing a prompt or reading the recognized words aloud.
          rec.uIOptions.audiblePrompt = '';
          rec.uIOptions.isReadBackEnabled = false;
          rec.uIOptions.showConfirmation = false;
        }
        record('single-listening');
        const result = await bounded(systemUI ? rec.recognizeWithUIAsync(abort.signal) : rec.recognizeAsync(abort.signal), abort.signal, duration);
        record('single-result', { status: result.status, confidence: result.confidence, textPresent: !!result.text?.trim(),
          ...(process.argv.includes('--test-phrase') ? { testPhraseMatched: /^what time is it[.!?]*$/i.test(result.text?.trim() || '') } : {}) });
      }
    } catch (error) { record('single-error', errorDetails(error)); }
    finally { abort.abort(); await new Promise(resolve => setImmediate(resolve)); subscriptions.forEach(unsubscribe => unsubscribe()); rec.close(); save(); quit(); }
    return;
  }
  const speech = new SpeechController({
    loadBindings, onlineConsent: async () => true,
    getMode: () => mode, getIdentity: () => runtime.hasPackageIdentity(), log: record,
    getWindowState: () => probeWindow && !probeWindow.isDestroyed() ? {
      visible: probeWindow.isVisible(), focused: probeWindow.isFocused(), minimized: probeWindow.isMinimized(),
    } : null,
    send: (channel, data) => record(channel, channel === 'speech-result'
      ? { textPresent: !!data?.text, ...(process.argv.includes('--test-phrase') ? { testPhraseMatched: /^what time is it[.!?]*$/i.test(data?.text?.trim() || '') } : {}) }
      : channel === 'speech-error' ? { error: data } : {}),
  });
  if (wake) {
    try {
      await speech.setWake(true);
      await new Promise(resolve => setTimeout(resolve, duration));
    } finally {
      await speech.shutdown();
      save(); quit();
    }
    return;
  }
  const stopping = setTimeout(() => speech.stop(false, 'probe-duration').catch(error => record('stop-error', { error: error.message })), duration);
  try { await speech.startManual(); }
  finally {
    clearTimeout(stopping); await speech.shutdown();
    save(); quit();
  }
}).catch(error => { record('probe-error', errorDetails(error)); save(); if (app) app.exit(1); else process.exitCode=1; });
setTimeout(() => {
  record('watchdog', { timeout: true });
  save(); if (app) app.exit(1); else process.exit(1);
}, duration+20000).unref();
