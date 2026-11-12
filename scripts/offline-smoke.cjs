// Real Electron routing with blocked network transports and synthetic audio/desktop actions.
// No microphone capture, personal profile, startup registration or audible output.
const { app, BrowserWindow, shell, Notification, session } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { Writable } = require('node:stream');
const root = path.resolve(__dirname, '..'), output = path.join(root, '.verification');
fs.mkdirSync(output, { recursive: true });
const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) || 'offline';
const classic = process.argv.includes('--classic');
const profile = fs.mkdtempSync(path.join(output, 'offline-profile-'));
app.setPath('userData', profile); app.setAppPath(root);
app.setLoginItemSettings = () => { throw Error('Offline checks must not change startup'); };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  firstRunComplete: true, firstRunRelease: '8.1.0', openAtLogin: false, heyCortana: false,
  isMovable: !classic, ttsEngine: 'edge', preferredVoice: 'Missing Eva Offline Fixture',
}));
let blockedRequests = 0;
const desktopActions = [];
shell.openPath = async target => { desktopActions.push({ type: 'path', target }); return ''; };
shell.openExternal = async target => { desktopActions.push({ type: 'url', target }); };
Notification.prototype.show = () => {};
// Refuse main-process HTTP(S) at the transport boundary, before any socket opens.
for (const transport of [require('node:http'), require('node:https')]) {
  const request = () => {
    blockedRequests++;
    const req = new Writable({ write(_chunk, _encoding, done) { done(); } });
    req.setTimeout = () => req;
    req.abort = () => req.destroy();
    queueMicrotask(() => req.destroy(Object.assign(Error('Offline verification fixture'), { code: 'ENETUNREACH' })));
    return req;
  };
  transport.request = request;
  transport.get = (...args) => { const req = request(...args); req.end(); return req; };
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => {
    blockedRequests++; done({ cancel: true });
  });
});
require('../main.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
app.whenReady().then(async () => {
  let win;
  try {
    for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await delay(100); }
    if (!win) throw Error('No application window');
    await delay(5500);
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Network.enable');
    await win.webContents.debugger.sendCommand('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
    });
    const js = code => win.webContents.executeJavaScript('(async()=>{' + code + '})()');
    await js(`
      window.offlineUtterances = []; window.offlineSent = [];
      window.offlineVoices = [{ name: 'Microsoft Zira Offline Fixture', lang: 'en-US' }];
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      speechSynthesis.getVoices = () => offlineVoices;
      speechSynthesis.speak = utterance => { offlineUtterances.push(utterance); queueMicrotask(() => utterance.onend?.()); };
      Audio.prototype.play = () => Promise.resolve();
      const send = ipcRenderer.send;
      ipcRenderer.send = (channel, ...args) => {
        if (['run-command', 'run-special-command', 'open-path'].includes(channel)) { offlineSent.push({ channel, args }); return; }
        return send.call(ipcRenderer, channel, ...args);
      };
    `);
    const run = async (name, code) => {
      try {
        const detail = await js(`const waitFor = async predicate => {
          for (let i=0;i<100;i++) { if(await predicate()) return; await new Promise(r=>setTimeout(r,25)); }
          throw Error('Expected application state did not arrive');
        }; ${code}`);
        checks.push({ name, passed: detail === true || detail?.passed === true, detail });
      } catch (error) { checks.push({ name, passed: false, error: error.message }); }
      console.log(checks.at(-1).passed ? 'PASS' : 'FAIL', name, checks.at(-1).passed ? '' : JSON.stringify(checks.at(-1)));
    };
    await run('Network requests fail and the renderer is offline', `
      let failed = false; try { await fetch('https://example.com/'); } catch { failed = true; }
      return !navigator.onLine && failed;
    `);
    await run('Local calculator, time and folder/app commands remain available offline', `
      processQuery('12 * 3'); await waitFor(() => resultsDisplay.textContent.includes('36'));
      processQuery('what time is it'); await waitFor(() => resultsDisplay.textContent.includes('local time'));
      processQuery('open downloads'); await waitFor(() => resultsDisplay.textContent.includes('Opening'));
      processQuery('open notepad'); await waitFor(() => offlineSent.some(item => item.channel === 'run-special-command'));
      return true;
    `);
    await run('Both reported timer phrases create equivalent persistent 15-minute timers', `
      for (const [query, label] of [['set a timer for 15 min named Tea','Tea'], ['set a 15 min timer named Oven','Oven']]) {
        processQuery(query); await waitFor(async () => (await cortana.getTimers()).some(timer => timer.label === label));
      }
      const timers = await cortana.getTimers();
      return timers.length === 2 && timers.every(timer => timer.durationMs === 900000);
    `);
    await run('Invalid and duplicate timer requests preserve both running timers', `
      const before = await cortana.getTimers();
      for (const query of ['set a 0 min timer', 'set a 1000 hour timer', 'set a 5 min timer named Tea']) {
        processQuery(query); await new Promise(r=>setTimeout(r,100));
      }
      const after = await cortana.getTimers();
      return JSON.stringify(before.map(({id,endTime})=>({id,endTime}))) === JSON.stringify(after.map(({id,endTime})=>({id,endTime})));
    `);
    await run('Custom actions retain precedence and built-in Execute bypasses them', `
      const previous = executeActionSequence; let custom = 0;
      customActions = [{ trigger:'set a 15 min timer', actions:[{type:'speak',value:'Custom'}] }];
      executeActionSequence = () => { custom++; };
      try {
        processQuery('set a 15 min timer'); if(custom!==1) return false;
        const categories = await generateCategorizedResults('set a 15 min timer'); showSearchPanel(categories);
        const builtIn = allPanelItems.find(item => item.el.textContent.includes('Use a built-in command'));
        if(!builtIn) return false; builtIn.action();
        await waitFor(async () => (await cortana.getTimers()).length === 3);
        return custom === 1;
      } finally { customActions=[]; executeActionSequence=previous; hideSearchPanel(); }
    `);
    await run('Notebook lists and reminders save while offline', `
      processQuery('create a Shopping list'); await waitFor(async () => (await cortana.getNotebook()).lists?.length);
      processQuery('add Fresh Milk to my shopping list'); await waitFor(async () => (await cortana.getNotebook()).lists?.[0]?.items.length === 1);
      processQuery('remind me to Call Nana tomorrow at 3 pm'); await onSaveReminder();
      return (await cortana.getReminders()).some(reminder => reminder.text === 'Call Nana');
    `);
    await run('Network-only features give prompt offline feedback', `
      closeNotebook({immediate:true}); const started=performance.now();
      await getWeather('Chicago'); if(!resultsDisplay.textContent.includes('internet connection')) return false;
      await performWebSearch('offline fixture');
      return resultsDisplay.textContent.includes('internet connection') && performance.now()-started < 2000;
    `);
    await run('Edge replies fall back to system speech without replacing the saved Eva choice', `
      const before=offlineUtterances.length; await speak('Offline voice fixture');
      return offlineUtterances.length === before+1 && offlineUtterances.at(-1).voice.name.includes('Zira') &&
        preferredVoiceName==='Missing Eva Offline Fixture' && (await cortana.getSettings()).preferredVoice===preferredVoiceName;
    `);
    await run('Late voice discovery speaks once and cancellation suppresses an obsolete reply', `
      offlineVoices=[]; const before=offlineUtterances.length, pending=speak('Late voice');
      await new Promise(r=>setTimeout(r,50)); offlineVoices=[{name:'Microsoft Zira Offline Fixture',lang:'en-US'}];
      speechSynthesis.dispatchEvent(new Event('voiceschanged')); await pending;
      if(offlineUtterances.length!==before+1) return false;
      offlineVoices=[]; const cancelled=speak('Cancelled voice'); await new Promise(r=>setTimeout(r,50)); cancelSpeechOutput();
      offlineVoices=[{name:'Microsoft Zira Offline Fixture',lang:'en-US'}]; speechSynthesis.dispatchEvent(new Event('voiceschanged')); await cancelled;
      return offlineUtterances.length===before+1;
    `);
    await run('Unavailable local speech explains the failure', `
      offlineVoices=[]; await speak('Unavailable voice fixture');
      const feedback=document.getElementById('speech-feedback');
      const rect=feedback.getBoundingClientRect();
      return {passed:!feedback.hidden && rect.height>50 && rect.top>=0 && rect.bottom<=innerHeight &&
        feedback.scrollWidth<=feedback.clientWidth && document.getElementById('speech-feedback-message').textContent.includes('No Windows voice'),
        rect:rect.toJSON(),hidden:feedback.hidden,display:getComputedStyle(feedback).display};
    `);
    win.show(); win.focus(); await delay(200);
    fs.writeFileSync(path.join(output, label + '-voice-feedback.png'), (await win.webContents.capturePage()).toPNG());
    await run('Speech output feedback focuses Spoken replies settings', `
      document.getElementById('speech-feedback-settings').click(); await waitFor(()=>document.activeElement.id==='tts-engine-select');
      return !settingsContainer.hidden && !settingsContainer.classList.contains('closing');
    `);
    fs.writeFileSync(path.join(output, label + '.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, label + '.json'), JSON.stringify({ profile, classic, blockedRequests, desktopActions, checks }, null, 2));
    console.log('OFFLINE_RESULT', checks.filter(check => check.passed).length + '/' + checks.length);
    app.exit(checks.every(check => check.passed) ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Offline smoke timed out'); app.exit(1); }, 60000).unref();
