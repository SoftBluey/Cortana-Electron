// Samples actual rendered navigation frames with a disposable, microphone-free profile.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.verification');
fs.mkdirSync(output, { recursive: true });
const classic = process.argv.includes('--classic');
const baseline = process.argv.includes('--baseline');
const label = `motion-${classic ? 'classic' : 'movable'}${baseline ? '-before' : ''}`;
app.setPath('userData', fs.mkdtempSync(path.join(output, 'motion-profile-')));
app.setAppPath(root);
app.setLoginItemSettings = () => {};
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({
  openAtLogin: false, heyCortana: false, isMovable: !classic, ttsEngine: 'system', listeningSounds: false, interfaceRelease: 8,
}));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
require('../main.js');
app.whenReady().then(async () => {
  try {
    for (let i = 0; i < 100 && !BrowserWindow.getAllWindows()[0]; i++) await delay(100);
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No application window');
    await delay(6000);
    win.show(); win.focus();
    const samples = await win.webContents.executeJavaScript(`(async () => {
      closeNotebook({immediate:true}); closeSettings(true); setStateIdle();
      collapseNavigation();
      const frames = [];
      void showSettingsUI();
      const start = performance.now();
      while (performance.now() - start < 450) {
        const pane = settingsContainer.getBoundingClientRect();
        const back = document.getElementById('settings-back-btn').getBoundingClientRect();
        const rail = document.querySelector('#settings-btn .rail-icon').getBoundingClientRect();
        const content = document.querySelector('.settings-main-content').getBoundingClientRect();
        frames.push({ms:performance.now()-start, paneX:pane.x, backX:back.x, railX:rail.x, contentX:content.x,
          scrollX:document.documentElement.scrollLeft, paneScrollX:settingsContainer.scrollLeft,
          animations:settingsContainer.getAnimations({subtree:true}).map(animation => ({
            target:animation.effect.target.id || animation.effect.target.className,
            frames:animation.effect.getKeyframes().map(frame => ({transform:frame.transform,opacity:frame.opacity}))
          }))});
        await new Promise(requestAnimationFrame);
      }
      return frames;
    })()`);
    const range = field => Math.max(...samples.map(frame => frame[field])) - Math.min(...samples.map(frame => frame[field]));
    const results = { label, frames: samples, displacement: {pane:range('paneX'),back:range('backX'),rail:range('railX')} };
    fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    if (!baseline && (results.displacement.pane > 0.1 || results.displacement.back > 0.1 || results.displacement.rail > 0.1 || samples.some(frame => frame.scrollX || frame.paneScrollX))) {
      throw new Error(`Navigation moved stationary controls: ${JSON.stringify(results.displacement)}`);
    }
    if (!baseline) {
      const navigation = await win.webContents.executeJavaScript(`(async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const rail = document.getElementById('cortana-navigation');
        collapseNavigation(); await wait(200);
        if (document.elementFromPoint(100,24)?.closest('#cortana-navigation')) return {stage:'collapsed hit area'};
        document.getElementById('navigation-toggle').click(); await wait(350);
        if (!document.elementFromPoint(100,24)?.closest('#cortana-navigation')) return {stage:'expanded hit area'};
        closeSettings(true);
        void showSettingsUI();
        const body = document.querySelector('.settings-main-content');
        const first = body.getAnimations()[0];
        void showSettingsUI();
        if (first !== body.getAnimations()[0]) return {stage:'repeat restarted entrance'};
        const backX = document.getElementById('settings-back-btn').getBoundingClientRect().x;
        const titleX = document.querySelector('#settings-container h1').offsetLeft;
        openNotebook();
        const back = document.getElementById('notebook-back');
        if (back.getBoundingClientRect().x !== backX || document.getElementById('notebook-title').offsetLeft !== titleX) return {stage:'shared header alignment'};
        selectNotebookPage('notes');
        const notebookBody = document.querySelector('.notebook-body');
        const forward = notebookBody.getAnimations()[0];
        selectNotebookPage('notes');
        if (forward !== notebookBody.getAnimations()[0]) return {stage:'same page restarted entrance'};
        await wait(50);
        const before = notebookBody.getBoundingClientRect().x;
        selectNotebookPage('about');
        const after = notebookBody.getBoundingClientRect().x;
        if (Math.abs(before-after) > 0.1) return {stage:'interrupted motion jumped',before,after};
        closeNotebook(); openNotebook();
        await wait(400);
        if (document.getElementById('notebook-sidebar').hidden || back.getBoundingClientRect().x !== backX || rail.scrollLeft || document.documentElement.scrollLeft) return {stage:'rapid reopen or scroll'};
        return true;
      })()`);
      if (navigation !== true) throw new Error(`Navigation regression: ${JSON.stringify(navigation)}`);
      results.navigation = true;
      await win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      const reduced = await win.webContents.executeJavaScript(`(async () => {
        closeSettings(true); openNotebook(); selectNotebookPage('notes');
        const notebook = document.getElementById('notebook-sidebar');
        if (notebook.getAnimations({subtree:true}).some(animation => animation.playState === 'running')) return false;
        await showSettingsUI();
        return !settingsContainer.getAnimations({subtree:true}).some(animation => animation.playState === 'running') && notebook.hidden && !settingsContainer.hidden;
      })()`);
      await win.webContents.debugger.detach();
      if (!reduced) throw new Error('Reduced-motion navigation animated');
      results.reducedMotion = true;
      fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify(results, null, 2));
    }
    console.log('MOTION_RESULT', JSON.stringify({label, sampledFrames:samples.length, displacement:results.displacement, reducedMotion:results.reducedMotion}));
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Motion verification timed out'); app.exit(1); }, 30000).unref();
