// Deliberately slow settings/Notebook replies to verify the first visible paint.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.verification');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'opening-profile-')));
app.setAppPath(root);
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({
  firstRunComplete: true, firstRunRelease: '8.1.0', openAtLogin: false, heyCortana: false, ttsEngine: 'system', isMovable: false,
}));
let settingsReplied = false;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
  if (['get-notebook', 'get-settings'].includes(channel)) await new Promise(resolve => setTimeout(resolve, 2500));
  const result = await listener(...args);
  if (channel === 'get-settings') settingsReplied = true;
  return result;
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
require('../main.js');
app.whenReady().then(async () => {
  try {
    while (!BrowserWindow.getAllWindows()[0]) await delay(20);
    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await delay(350);
    const firstPaint = await win.webContents.executeJavaScript(`({
      text: document.getElementById('results-display').textContent,
      opacity: getComputedStyle(document.querySelector('#results-display p')).opacity,
      visible: document.getElementById('app-container').classList.contains('visible')
    })`);
    const passed = !settingsReplied && firstPaint.visible && firstPaint.text.length > 0 && firstPaint.opacity === '1';
    fs.writeFileSync(path.join(output, 'opening-slow-settings.json'), JSON.stringify({ passed, settingsReplied, firstPaint }, null, 2));
    fs.writeFileSync(path.join(output, 'opening-slow-settings.png'), (await win.webContents.capturePage()).toPNG());
    console.log('OPENING_SMOKE', JSON.stringify({ passed, settingsReplied, firstPaint }));
    app.exit(passed ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => app.exit(1), 20000).unref();
