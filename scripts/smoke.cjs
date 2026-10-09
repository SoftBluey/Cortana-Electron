// Runs the real app with a disposable profile; never changes the user's startup registration.
const { app, BrowserWindow, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.verification');
fs.mkdirSync(output, { recursive: true });
const reuse = process.argv.find(arg => arg.startsWith('--profile='))?.slice('--profile='.length);
const profile = reuse ? path.resolve(reuse) : fs.mkdtempSync(path.join(output, 'profile-'));
if (!profile.toLowerCase().startsWith(output.toLowerCase() + path.sep)) throw new Error('Smoke profiles must be inside .verification');
app.setPath('userData', profile);
app.setAppPath(root);
app.setLoginItemSettings = () => {};
if (!reuse) fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  openAtLogin: false, heyCortana: false, isMovable: true, ttsEngine: 'system',
}));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const label = process.argv.find(arg => arg.startsWith('--label='))?.split('=')[1] || 'smoke';
const workflows = process.argv.includes('--workflows');
const classic = process.argv.includes('--classic');
const recording = process.argv.includes('--record');
let recorder;
if (classic && !reuse) fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ openAtLogin: false, heyCortana: false, isMovable: false, ttsEngine: 'system' }));
require('../main.js');
app.whenReady().then(async () => {
  try {
    for (let i = 0; i < 100 && !BrowserWindow.getAllWindows()[0]; i++) await delay(100);
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No application window');
    await delay(6000);
    const errors = [];
    win.webContents.on('console-message', (_event, ...args) => {
      const details = args[0];
      if (details?.level === 3 || details?.level === 'error') errors.push(details.message);
    });
    const checks = [];
    if (recording) {
      win.show(); win.focus();
      recorder = await require('./record-window.cjs').recordWindow(win, output, label);
      recorder.caption('Cortana Electron 8.0.0\nAutomated UI smoke tests · disposable profile');
      await delay(2500);
    }
    if (process.argv.includes('--quit')) {
      await win.webContents.executeJavaScript(`(async () => {
        ipcRenderer.send('set-setting', { key: 'closeToTray', value: false });
        if ((await ipcRenderer.invoke('get-settings')).closeToTray !== false) throw new Error('Quit preference did not apply');
        ipcRenderer.send('close-app');
      })()`);
      app.on('will-quit', () => {
        fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify({ profile, quitOnDismiss: true, hotkeysReleased: !globalShortcut.isRegistered('CommandOrControl+Shift+Alt+F12') }));
        console.log('QUIT_ON_DISMISS_PASSED');
      });
      return;
    }
    if (reuse) {
      const state = await win.webContents.executeJavaScript(`(async () => ({ notebook: await ipcRenderer.invoke('get-notebook'), settings: await ipcRenderer.invoke('get-settings') }))()`);
      if (state.notebook.notes !== 'Saved notebook note' || state.settings.preferredVoice !== 'Missing Eva Smoke Voice') throw new Error('Restart persistence failed');
      checks.push('Notebook and missing Eva preference survive process restart');
    }
    if (workflows) {
      const run = async (name, code) => {
        if (recorder) { recorder.caption(`${String(checks.length+1).padStart(2,'0')} / 21 · ${name}\nRunning`); await delay(500); }
        const result = await win.webContents.executeJavaScript(`(async () => { const demoPause = () => new Promise(resolve => setTimeout(resolve, ${recording ? 750 : 0})); ${code} })()`);
        if (result !== true) throw new Error(`${name} failed: ${JSON.stringify(result)}`);
        checks.push(name);
        if (recorder) { recorder.caption(`${String(checks.length).padStart(2,'0')} / 21 · ${name}\nPassed${/Microphone|focus notifications/i.test(name) ? ' · microphone controls simulated' : ''}`); await delay(1400); }
      };
      await run('Notebook add/check/note persistence', `
        openNotebook('todos');
        await demoPause();
        document.getElementById('todo-text').value = 'Offline task <safe>';
        document.getElementById('todo-form').requestSubmit();
        await persistNotebook();
        await demoPause();
        document.querySelector('#todo-list input').click();
        await demoPause();
        openNotebook('notes');
        const notes = document.getElementById('notebook-notes-text'); notes.value = 'Saved notebook note'; notes.dispatchEvent(new Event('input')); await persistNotebook();
        await demoPause();
        openNotebook('todos');
        const stored = await ipcRenderer.invoke('get-notebook');
        return stored.todos.length === 1 && stored.todos[0].done && stored.notes === 'Saved notebook note' && !document.querySelector('#todo-list script') && !document.getElementById('notebook-sidebar').hidden;
      `);
      await delay(200);
      console.log('NOTEBOOK_UI', await win.webContents.executeJavaScript(`(() => { const el = document.getElementById('notebook-sidebar'); return { hidden: el.hidden, class: el.className, display: getComputedStyle(el).display, rectangle: el.getBoundingClientRect().toJSON(), top: document.elementFromPoint(100, 100)?.id }; })()`));
      fs.writeFileSync(path.join(output, `${label}-notebook.png`), (await win.webContents.capturePage()).toPNG());
      await run('Reminder create/edit/delete from Notebook', `
        openNotebook('reminders');
        const created = await ipcRenderer.invoke('set-reminder', { reminder: 'Smoke reminder', reminderTime: new Date(Date.now() + 3600000).toISOString() });
        if (!created.success) return created;
        await renderNotebookReminders();
        await demoPause();
        document.querySelector('#notebook-reminder-list button').click();
        await demoPause();
        const correct = reminderTextInput.value === 'Smoke reminder' && !!reminderTimeInput.value;
        const reminders = await ipcRenderer.invoke('get-reminders');
        ipcRenderer.send('remove-reminder', reminders[0].id);
        setStateIdle();
        return correct && (await ipcRenderer.invoke('get-reminders')).length === 0;
      `);
      await run('Unavailable Eva preference is retained', `
        ipcRenderer.send('set-setting', { key: 'preferredVoice', value: 'Missing Eva Smoke Voice' });
        await loadAndApplySettings(); setupTTS();
        return (await ipcRenderer.invoke('get-settings')).preferredVoice === 'Missing Eva Smoke Voice';
      `);
      await run('Late online TTS cannot play after cancellation', `
        const originalInvoke = ipcRenderer.invoke.bind(ipcRenderer);
        const OriginalAudio = window.Audio;
        let release, played = 0, finished = 0;
        window.Audio = class { play() { played++; return Promise.resolve(); } pause() {} };
        ipcRenderer.invoke = (channel, ...args) => channel === 'synthesize-edge-tts'
          ? new Promise(resolve => { release = resolve; }) : originalInvoke(channel, ...args);
        const previousEngine = ttsEngine; ttsEngine = 'edge';
        const call = speak('Cancelled sample', () => finished++);
        while (!release) await new Promise(resolve => setTimeout(resolve, 10));
        cancelSpeechOutput(); release({ success: true, filePath: '' }); await call;
        ttsEngine = previousEngine; ipcRenderer.invoke = originalInvoke; window.Audio = OriginalAudio;
        return played === 0 && finished === 0;
      `);
      await run('Assistant shortcut registers', `return (await ipcRenderer.invoke('set-assistant-hotkey', 'CommandOrControl+Shift+Alt+F12')).success;`);
      globalShortcut.register('CommandOrControl+Shift+Alt+F11', () => {});
      await run('Conflicting shortcut preserves previous registration', `
        const result = await ipcRenderer.invoke('set-assistant-hotkey', 'CommandOrControl+Shift+Alt+F11');
        const state = await ipcRenderer.invoke('get-hotkey-status');
        return !result.success && state.accelerator === 'CommandOrControl+Shift+Alt+F12';
      `);
      globalShortcut.unregister('CommandOrControl+Shift+Alt+F11');
      await run('Shortcut disables cleanly', `return (await ipcRenderer.invoke('set-assistant-hotkey', '')).success;`);
      const server = require('node:http').createServer((request, response) => {
        let body = ''; request.setEncoding('utf8'); request.on('data', chunk => body += chunk);
        request.on('end', () => {
          const data = JSON.parse(body);
          const valid = request.url === '/v1/chat/completions' && data.model === 'phi3:mini' && data.stream === false;
          response.writeHead(valid ? 200 : 400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ choices: [{ message: { content: 'Local answer café 🌙' } }] }));
        });
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      await run('Ollama compatible request and Unicode response', `
        ipcRenderer.send('set-setting', { key: 'aiApiUrl', value: 'http://127.0.0.1:${server.address().port}/v1' });
        ipcRenderer.send('set-setting', { key: 'aiModel', value: 'phi3:mini' });
        const result = await ipcRenderer.invoke('ask-openai', 'hello');
        return result.success && result.text === 'Local answer café 🌙';
      `);
      await new Promise(resolve => server.close(resolve));
      await run('Offline local commands do not await internet suggestions', `
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        let calls = 0; const original = generateWebSuggestions;
        generateWebSuggestions = () => { calls++; return Promise.resolve([]); };
        const result = await generateCategorizedResults('open downloads');
        generateWebSuggestions = original;
        delete navigator.onLine;
        return calls === 0 && result[0].items[0].title === 'Execute "open downloads"';
      `);
      await run('Settings controls and speech diagnostics', `
        await showSettingsUI();
        await demoPause();
        const diagnostics = await ipcRenderer.invoke('speech-diagnostics');
        closeSettings();
        return diagnostics.environment.arch === 'x64' && !!document.getElementById('close-to-tray-toggle');
      `);
      await run('Notebook task deletion', `openNotebook('todos'); document.querySelector('#todo-list .notebook-delete').click(); await persistNotebook(); closeNotebook(); return notebookData.todos.length === 0;`);
      await run('Notebook contains only working pages and retains nickname preferences', `
        openNotebook(); document.getElementById('navigation-toggle').click();
        await demoPause();
        if (document.getElementById('navigation-toggle').getAttribute('aria-expanded') !== 'true') return false;
        document.getElementById('navigation-about').click();
        await demoPause();
        if (document.getElementById('notebook-about').hidden || notebookPage !== 'about') return false;
        const name = document.getElementById('notebook-name'); name.value = 'Smoke Bluey'; name.dispatchEvent(new Event('input'));
        await persistNotebook();
        document.getElementById('notebook-back').click();
        if (notebookPage !== 'overview') return false;
        const saved = await ipcRenderer.invoke('get-notebook');
        const pages = [...document.querySelectorAll('.notebook-directory [data-page]')].map(button => button.dataset.page);
        const correct = saved.profile.name === 'Smoke Bluey' && getIdleMessage().includes('Smoke Bluey') &&
          pages.join(',') === 'notes,todos,reminders,about' && !document.getElementById('notebook-services') && !document.querySelector('.notebook-quick-actions');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        document.getElementById('navigation-home').click();
        return correct && document.getElementById('navigation-home').getAttribute('aria-current') === 'page';
      `);
      await run('Input focus notifications no longer cancel speech', `
        const originalSend = ipcRenderer.send;
        const originalOnPlay = onSound.play, originalOffPlay = offSound.play;
        let starts = 0, stops = 0;
        onSound.play = offSound.play = () => Promise.resolve();
        ipcRenderer.send = (channel, ...args) => {
          if (channel === 'speech-start') { starts++; return; }
          if (channel === 'speech-stop') { stops++; return; }
          return originalSend.call(ipcRenderer, channel, ...args);
        };
        try {
          micBtn.click();
          searchBar.dispatchEvent(new FocusEvent('focus')); searchBar.dispatchEvent(new FocusEvent('blur'));
          const correct = starts === 1 && stops === 0 && micBtn.classList.contains('listening');
          _stopSpeechFromOutside(); return correct;
        } finally { ipcRenderer.send = originalSend; onSound.play = originalOnPlay; offSound.play = originalOffPlay; }
      `);
      await run('Default speech engine and audio diagnostics', `
        const settings = await ipcRenderer.invoke('get-settings');
        const diagnostics = await ipcRenderer.invoke('speech-diagnostics');
        return settings.recognitionEngine === 'winrt' && diagnostics.capabilities.recognitionEngine === 'winrt' &&
          Array.isArray(diagnostics.audioDefaults) && diagnostics.audioDefaults.some(device => device.flow === 'Capture' && device.name);
      `);
      await run('Microphone click plays enabled cues and respects mute without starting capture', `
        await new Promise(resolve => setTimeout(resolve, 350));
        const originalSend = ipcRenderer.send, originalOnPlay = onSound.play, originalOffPlay = offSound.play;
        const originalSounds = listeningSounds;
        let starts = 0, stops = 0, onPlays = 0, offPlays = 0;
        ipcRenderer.send = (channel, ...args) => {
          if (channel === 'speech-start') { starts++; return; }
          if (channel === 'speech-stop') { stops++; return; }
          return originalSend.call(ipcRenderer, channel, ...args);
        };
        onSound.play = () => { onPlays++; return Promise.resolve(); };
        offSound.play = () => { offPlays++; return Promise.resolve(); };
        try {
          const restored = (await ipcRenderer.invoke('get-settings')).listeningSounds === true;
          listeningSounds = true; micBtn.click(); _stopSpeechFromOutside();
          await new Promise(resolve => setTimeout(resolve, 350));
          listeningSounds = false; micBtn.click(); _stopSpeechFromOutside();
          return restored && starts === 2 && stops === 2 && onPlays === 1 && offPlays === 1;
        } finally { listeningSounds = originalSounds; ipcRenderer.send = originalSend; onSound.play = originalOnPlay; offSound.play = originalOffPlay; }
      `);
      await run('Settings and Notebook switch without overlapping panes or late focus changes', `
        for (let i = 0; i < 4; i++) {
          openNotebook();
          await demoPause();
          const opening = showSettingsUI();
          await demoPause();
          const notebook = document.getElementById('notebook-sidebar');
          if (!notebook.hidden || !notebook.inert || settingsContainer.hidden || !settingsContainer.classList.contains('visible')) return {stage:'to-settings', notebookHidden:notebook.hidden, notebookInert:notebook.inert, settingsHidden:settingsContainer.hidden};
          openNotebook('notes');
          await opening;
          if (!settingsContainer.hidden || !settingsContainer.inert || notebook.hidden || !notebook.classList.contains('visible') || document.activeElement.id !== 'notebook-back') return {stage:'to-notebook', settingsHidden:settingsContainer.hidden, settingsInert:settingsContainer.inert, notebookHidden:notebook.hidden, notebookVisible:notebook.classList.contains('visible'), focus:document.activeElement.id};
        }
        closeNotebook(); openNotebook();
        await new Promise(resolve => setTimeout(resolve, 220));
        const correct = !document.getElementById('notebook-sidebar').hidden && !document.getElementById('notebook-sidebar').inert;
        closeNotebook();
        await showSettingsUI();
        const troubleshooting = document.getElementById('speech-troubleshooting');
        const diagnosticsCollapsed = !troubleshooting.open && !document.getElementById('copy-speech-diagnostics').getClientRects().length;
        closeSettings();
        const version = await ipcRenderer.invoke('get-app-version');
        return correct && diagnosticsCollapsed && version === '8.0.0' || {stage:'finished',correct,diagnosticsCollapsed,version};
      `);
      win.show(); win.focus(); await delay(250);
      await run('Notebook shares idle animation, tint and visibility lifecycle', `
        const introduced = notebookData.introduced; notebookData.introduced = false;
        openNotebook(); await new Promise(resolve => setTimeout(resolve, 150));
        const oldColor = themeColor; applyThemeColor('#ff6600');
        const shared = notebookAnim instanceof AnimationManager && notebookAnim.state === AnimationState.IDLE &&
          notebookAnim.renderer.themeColor.r === 255 && notebookAnim.renderer.themeColor.g === 102 && !anim.renderer.timer;
        selectNotebookPage('about'); const stopped = !notebookAnim.renderer.timer;
        selectNotebookPage('overview'); const resumed = notebookAnim.renderer.active && notebookAnim.renderer.running;
        applyThemeColor(oldColor); notebookData.introduced = introduced; closeNotebook();
        return shared && stopped && resumed && !notebookAnim.renderer.timer || { shared, stopped, resumed, visible: windowVisible, focused: windowFocused, state: notebookAnim.state, active: notebookAnim.renderer.active, running: notebookAnim.renderer.running };
      `);
      await run('Sidebar settings icon and narrow Settings controls fit', `
        await showSettingsUI(); await new Promise(resolve => setTimeout(resolve, 400));
        const icon = document.querySelector('#settings-btn .rail-icon').getBoundingClientRect();
        const rail = document.getElementById('cortana-navigation').getBoundingClientRect();
        const content = document.querySelector('.settings-content');
        const dropdowns = [...content.querySelectorAll('select')].filter(el => el.getClientRects().length);
        const fits = dropdowns.every(el => {
          const rectangle = el.getBoundingClientRect(), pane = content.getBoundingClientRect();
          return rectangle.right <= pane.right + 1 && rectangle.left >= pane.left && getComputedStyle(el).appearance === 'none';
        });
        const verticalLabelsFit = [...document.querySelectorAll('.setting-column > label:first-child')].every(label => getComputedStyle(label).flexBasis === 'auto');
        return Math.abs(icon.x + icon.width / 2 - rail.x - 24) < 1 && fits && verticalLabelsFit && content.scrollWidth <= content.clientWidth;
      `);
      await run('Shortcut entry stays compact and development startup stays disabled', `
        const field = document.getElementById('assistant-hotkey');
        const bounds = field.getBoundingClientRect();
        const startup = document.getElementById('startup-toggle');
        const state = await ipcRenderer.invoke('get-settings');
        return bounds.height <= 36 && bounds.height >= 30 && field.scrollHeight <= 36 &&
          bounds.width <= document.querySelector('.settings-content').clientWidth && startup.disabled &&
          state.startupStatus.supported === false;
      `);
      fs.writeFileSync(path.join(output, `${label}-settings.png`), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`closeSettings()`);
      await win.webContents.executeJavaScript(`openNotebook()`); await delay(400);
      fs.writeFileSync(path.join(output, `${label}-1607-notebook.png`), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`selectNotebookPage('about')`); await delay(400);
      fs.writeFileSync(path.join(output, `${label}-1607-about.png`), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`closeNotebook()`);
      await run('Speech failure stays readable and offers Settings without sound', `
        const originalSend = ipcRenderer.send, originalError = console.error;
        const originalOnPlay = onSound.play, originalOffPlay = offSound.play;
        const originalSounds = listeningSounds;
        let plays = 0;
        onSound.play = offSound.play = () => { plays++; return Promise.resolve(); };
        listeningSounds = false;
        ipcRenderer.send = (channel, ...args) => {
          if (channel === 'speech-start' || channel === 'speech-stop') return;
          return originalSend.call(ipcRenderer, channel, ...args);
        };
        console.error = () => {};
        try {
          micBtn.click();
          const message = 'Windows stopped listening before returning words. This is a deliberately long error with details that must wrap above the search bar. Check your speech settings or continue by typing.';
          ipcRenderer.emit('speech-error', {}, message);
          const feedback = document.getElementById('speech-feedback'), search = document.querySelector('.search-container');
          const rectangle = feedback.getBoundingClientRect(), container = search.getBoundingClientRect();
          const visible = !feedback.hidden && feedback.textContent.includes('Speech recognition is unavailable') && !feedback.textContent.includes(message) && rectangle.height > 50 &&
            rectangle.top >= 0 && rectangle.bottom <= innerHeight && rectangle.left >= container.left && rectangle.right <= container.right + 1 && feedback.scrollWidth <= feedback.clientWidth;
          document.getElementById('speech-feedback-dismiss').click();
          const dismissed = feedback.hidden;
          feedback.hidden = false; document.getElementById('speech-feedback-settings').click();
          await new Promise(resolve => setTimeout(resolve, 400));
          const settingsOpened = settingsContainer.classList.contains('visible') && document.activeElement.id === 'recognition-mode-select';
          closeSettings();
          return visible && dismissed && settingsOpened && plays === 0 || {visible, dismissed, settingsOpened, plays};
        } finally {
          _stopSpeechFromOutside(); listeningSounds = originalSounds;
          ipcRenderer.send = originalSend; console.error = originalError;
          onSound.play = originalOnPlay; offSound.play = originalOffPlay;
        }
      `);
      await run('Built-in note and list phrases open the matching Notebook page', `
        for (const [phrase, page] of [['show my notes', 'notes'], ['show my lists', 'todos']]) {
          const command = priorityCommands.find(item => item.regex.test(phrase));
          if (!command) return false;
          command.handler(phrase.match(command.regex));
          if (notebookPage !== page || document.getElementById('notebook-' + page).hidden) return false;
          closeNotebook();
        }
        return true;
      `);
      await win.webContents.executeJavaScript(`document.getElementById('speech-feedback-message').textContent = 'Speech recognition is unavailable right now. Try again or type your question.'; document.getElementById('speech-feedback').hidden = false;`);
      await delay(400);
      fs.writeFileSync(path.join(output, `${label}-speech-feedback.png`), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`document.getElementById('speech-feedback').hidden = true;`);
      await run('Orb retains source proportions across Home, reminders, timers, results and Notebook', `
        const originalSpeak = speak, originalInvoke = ipcRenderer.invoke;
        speak = async () => {};
        const check = canvas => {
          const rectangle = canvas.getBoundingClientRect();
          return rectangle.width > 0 && rectangle.height > 0 && Math.abs((rectangle.width / canvas.width) / (rectangle.height / canvas.height) - 1) < 0.005;
        };
        try {
          closeNotebook({immediate:true}); closeSettings(true); setStateIdle();
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!check(gifDisplay)) return {page:'Home'};
          const idleHeight = gifDisplay.getBoundingClientRect().height;
          showReminderUI({initialText:'Review the updated interface'});
          await new Promise(resolve => setTimeout(resolve, 500));
          const form = reminderContainer.getBoundingClientRect(), orb = gifDisplay.getBoundingClientRect();
          if (orb.height >= idleHeight) return {page:'Active orb must remain smaller than idle',idleHeight,activeHeight:orb.height};
          const fits = [...reminderContainer.querySelectorAll('input, button')].every(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= form.left && bounds.right <= form.right + 1 && bounds.bottom <= innerHeight - 45;
          });
          if (!check(gifDisplay) || orb.bottom > form.top || !fits) return {page:'Reminder form',fits,orbBottom:orb.bottom,formTop:form.top};
          setStateIdle(); setStateActive(); await showReminders();
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!check(gifDisplay)) return {page:'Reminders'};
          setStateIdle(); setStateActive(); await startTimer(5, 'minute', 300000); showTimersPanel();
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!check(gifDisplay)) return {page:'Timers'};
          setStateIdle(); setStateActive();
          resultsDisplay.innerHTML = '<div class="search-results-panel">Search results</div>';
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!check(gifDisplay)) return {page:'Search results'};
          setStateIdle(); openNotebook();
          await new Promise(resolve => setTimeout(resolve, 250));
          if (!check(document.getElementById('notebook-idle-canvas'))) return {page:'Notebook'};
          const notebookHeight = document.getElementById('notebook-idle-canvas').getBoundingClientRect().height;
          if (notebookHeight <= orb.height || notebookHeight > idleHeight) return {page:'Notebook idle sizing',idleHeight,activeHeight:orb.height,notebookHeight};
          closeNotebook({immediate:true}); setStateIdle(); return true;
        } finally { cancelActiveTimer(); speak = originalSpeak; ipcRenderer.invoke = originalInvoke; }
      `);
      await win.webContents.executeJavaScript(`showReminderUI({initialText:'Review the updated interface', initialTime:formatDateTimeForInput(new Date(Date.now()+3600000))})`);
      await delay(500);
      fs.writeFileSync(path.join(output, `${label}-reminder-orb.png`), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`setStateIdle()`);
    }
    if (recorder) {
      await win.webContents.executeJavaScript(`closeNotebook({immediate:true}); closeSettings(true); setStateIdle();`);
      recorder.caption(`${checks.length} / ${checks.length} UI checks passed\nLive speech recognition remains unresolved`);
      await delay(3000);
      const video = await recorder.finish(); recorder = null;
      console.log('SMOKE_RECORDING', video);
    }
    const sample = async () => {
      const samples = [];
      for (let i = 0; i < (process.argv.includes('--quick') ? 1 : 10); i++) {
        await delay(1000);
        samples.push(app.getAppMetrics().map(({ type, cpu, memory }) => ({ type, cpu, memory })));
      }
      return samples;
    };
    const visible = await sample();
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    win.hide();
    const hidden = await sample();
    const renderer = await win.webContents.executeJavaScript(`({
      initialized: !!anim, state: anim?.state, running: anim?.renderer.running,
      timer: !!anim?.renderer.timer, errors: typeof speechDiagnostics !== 'undefined' ? speechDiagnostics : null
    })`);
    if (workflows && errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify({ profile, visible, hidden, renderer, errors, checks }, null, 2));
    console.log('SMOKE_RESULT', JSON.stringify({ label, renderer, errors }));
    app.quit();
  } catch (error) { recorder?.abort(); console.error(error); app.exit(1); }
});
setTimeout(() => { recorder?.abort(); console.error('Smoke test timed out'); app.exit(1); }, recording ? 180000 : 60000).unref();
