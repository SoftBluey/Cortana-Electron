const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSettingsSaver } = require('../lib/preferences');
const { releaseInfo } = require('../lib/release');
const { formatShortcut, parseShortcut } = require('../lib/shortcuts');
const { createStartup } = require('../lib/startup');

test('failed settings writes leave committed data intact and later patches retain unrelated preferences', async () => {
  let current = { rate: 1, preferredVoice: 'Microsoft Eva Mobile', unknown: 'keep' };
  let fail = true;
  const saved = [];
  const save = createSettingsSaver({ read: () => current, commit: value => { current = value; },
    write: async value => { if (fail) { fail = false; throw Error('Permission denied'); } saved.push(value); } });
  assert.equal((await save({ rate: 1.2 })).success, false);
  assert.equal(current.rate, 1);
  await Promise.all([save({ rate: 1.3 }), save({ pitch: 1.4 })]);
  assert.deepEqual(current, { rate: 1.3, preferredVoice: 'Microsoft Eva Mobile', unknown: 'keep', pitch: 1.4 });
  assert.equal(saved.length, 2);
});

test('unreadable settings cannot overwrite the original file', async () => {
  const save = createSettingsSaver({ writable: () => false, read: () => ({}),
    write: () => assert.fail('Unexpected write'), commit: () => assert.fail('Unexpected commit') });
  assert.equal((await save({ rate: 1 })).success, false);
});

test('update comparison handles equal, older and newer versions and requires the exact stable release page', () => {
  const release = tag => ({ tag_name: tag, html_url: 'https://github.com/SoftBluey/Cortana-Electron/releases/tag/' + tag });
  assert.equal(releaseInfo(release('v8.0.0'), '8.0.0').available, false);
  assert.equal(releaseInfo(release('v7.2.1'), '8.0.0').available, false);
  assert.equal(releaseInfo(release('v8.10.0'), '8.2.0').available, true);
  for (const value of [{ ...release('v9.0.0'), prerelease: true }, { ...release('v9.0.0'), draft: true },
    release('v9.0.0-beta'), { ...release('v9.0.0'), html_url: 'https://example.com/download' }, {}]) {
    assert.throws(() => releaseInfo(value, '8.0.0'));
  }
});

test('Windows shortcut names round-trip while existing Electron accelerators remain compatible', () => {
  assert.equal(formatShortcut('CommandOrControl+Shift+C'), 'Ctrl+Shift+C');
  assert.equal(parseShortcut(' ctrl + shift + C '), 'Control+Shift+C');
  assert.equal(parseShortcut('Windows+Enter'), 'Super+Return');
  assert.equal(parseShortcut('CommandOrControl+Shift+C'), 'CommandOrControl+Shift+C');
  assert.equal(parseShortcut(''), '');
});

test('startup uses Cortana own current-user entry and detects silent Windows rejection', () => {
  const app = { isPackaged: true, setLoginItemSettings() {},
    getLoginItemSettings: () => ({ openAtLogin: false, executableWillLaunchAtLogin: true,
      launchItems: [{ name: 'another-entry', scope: 'user', enabled: true },
        { name: 'com.blueysoft.cortana-electron', scope: 'machine', enabled: true },
        { name: 'com.blueysoft.cortana-electron', scope: 'user', enabled: false }] }) };
  const startup = createStartup(app, { platform: 'win32', executable: 'C:\\Program Files\\Cortana Electron.exe', store: false });
  assert.equal(startup.status().registered, true);
  assert.equal(startup.status().enabled, false);
  assert.match(startup.set(true).error, /Windows did not change/);
});
