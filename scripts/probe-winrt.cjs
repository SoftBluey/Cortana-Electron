// Deliberate, short default-microphone test; records stages, never transcripts.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SpeechController } = require('../lib/speech-controller');
const mode = process.argv.includes('--commands') ? 'commands' : 'dictation';
const wake = process.argv.includes('--wake');
const output = path.resolve(__dirname, '../.verification');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'winrt-probe-')));
const records = [];
const record = (stage, details = {}) => { const event = { stage, ...details }; records.push(event); console.log(JSON.stringify(event)); };
app.whenReady().then(async () => {
  const runtime = require('@microsoft/dynwinrt');
  runtime.roInitialize(0);
  record('identity', { present: runtime.hasPackageIdentity() });
  const speech = new SpeechController({
    loadBindings: () => require('../.winapp/bindings'), onlineConsent: async () => true,
    getMode: () => mode, log: record,
    send: (channel, data) => record(channel, channel === 'speech-result' ? { textPresent: !!data?.text } : channel === 'speech-error' ? { error: data } : {}),
  });
  if (wake) {
    try {
      await speech.setWake(true);
      await new Promise(resolve => setTimeout(resolve, 4000));
    } finally {
      await speech.shutdown();
      fs.writeFileSync(path.join(output, 'winrt-wake-probe.json'), JSON.stringify(records, null, 2));
      app.quit();
    }
    return;
  }
  const stopping = setTimeout(() => speech.stop(false, 'probe-duration').catch(error => record('stop-error', { error: error.message })), 6000);
  try { await speech.startManual(); }
  finally {
    clearTimeout(stopping); await speech.shutdown();
    fs.writeFileSync(path.join(output, `winrt-${mode}-probe.json`), JSON.stringify(records, null, 2));
    app.quit();
  }
});
setTimeout(() => {
  record('watchdog', { timeout: true });
  fs.writeFileSync(path.join(output, `winrt-${mode}-probe.json`), JSON.stringify(records, null, 2));
  app.exit(1);
}, 25000).unref();
