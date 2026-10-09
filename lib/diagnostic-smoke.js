const fs = require('node:fs/promises');
const path = require('node:path');
const { bounded, errorDetails } = require('./speech-controller');

async function run({ app, window, speech }) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const results = { packaged: app.isPackaged, versions: process.versions, profile: app.getPath('userData') };
  const watchdog = setTimeout(() => app.exit(1), 45000);
  try {
    await delay(6000);
    results.renderer = await window.webContents.executeJavaScript(`({ initialized: !!anim, notebookReady: typeof notebookData === 'object', speech: speechDiagnostics })`);
    results.capabilities = speech.capabilities();
    if (process.argv.includes('--skip-speech')) results.microphoneTestSkipped = true;
    if (speech.bindings && !results.microphoneTestSkipped) {
      // Compile, start and cancel a local wake grammar; never save recognized speech.
      const b = speech.bindings;
      const rec = new b.SpeechRecognizer();
      let session;
      try {
        rec.constraints.append(new b.SpeechRecognitionListConstraint(['Cortana'], 'packaged-probe'));
        const compilation = await bounded(rec.compileConstraintsAsync(), null, 10000);
        results.compilation = compilation.status;
        if (compilation.status === b.SpeechRecognitionResultStatus.Success) {
          session = rec.continuousRecognitionSession;
          await bounded(session.startAsync(), null, 10000);
          await delay(1000);
          await bounded(session.cancelAsync(), null, 5000);
          session = null;
          results.microphoneStartCancel = true;
        }
      } finally {
        if (session) await bounded(session.cancelAsync(), null, 3000).catch(() => {});
        rec.close();
      }
    }
  } catch (error) { results.error = errorDetails(error); }
  finally {
    await fs.writeFile(path.join(app.getPath('userData'), 'smoke-result.json'), JSON.stringify(results, null, 2));
    console.log('DIAGNOSTIC_SMOKE', JSON.stringify(results));
    clearTimeout(watchdog);
    app.quit();
  }
}
module.exports = { run };
