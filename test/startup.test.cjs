const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStartup } = require('../lib/startup');
function fixture(state = {}, packaged = true) {
  const calls = [];
  const app = { isPackaged: packaged,
    getLoginItemSettings: () => state,
    setLoginItemSettings: value => {
      calls.push(value);
      state = { openAtLogin: value.openAtLogin, executableWillLaunchAtLogin: value.enabled && value.openAtLogin };
    } };
  return { calls, startup: createStartup(app, { platform: 'win32', executable: 'C:\\Apps\\Cortana Electron.exe' }) };
}
test('installed startup uses the app executable, launches hidden and disables explicitly', () => {
  const { startup, calls } = fixture();
  assert.equal(startup.reconcile(true).enabled, true);
  assert.equal(calls[0].path, 'C:\\Apps\\Cortana Electron.exe');
  assert.deepEqual(calls[0].args, ['--hidden']);
  assert.equal(startup.set(false).enabled, false);
  assert.equal(calls[1].openAtLogin, false);
});
test('relaunching preserves a disabled Windows Startup Apps entry', () => {
  const { startup, calls } = fixture({ openAtLogin: true, executableWillLaunchAtLogin: false });
  assert.equal(startup.reconcile(true).enabled, false);
  assert.equal(calls.length, 0);
  assert.equal(startup.set(true).enabled, true);
  assert.equal(calls.length, 1);
});
test('development and diagnostic runs cannot register startup', () => {
  const { startup, calls } = fixture({}, false);
  startup.reconcile(true); startup.set(true);
  assert.equal(startup.status().supported, false);
  assert.equal(calls.length, 0);
  const app = { isPackaged: true, setLoginItemSettings() { throw new Error('Unexpected mutation'); } };
  assert.equal(createStartup(app, { diagnostic: true }).set(true).supported, false);
});
