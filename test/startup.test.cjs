const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStartup } = require('../lib/startup');
function fixture(state = {}, packaged = true) {
  const calls = [];
  const app = { isPackaged: packaged,
    getLoginItemSettings: options => {
      assert.equal(options.path, '"C:\\Apps\\Cortana Electron.exe"');
      return { launchItems: state.openAtLogin ? [{ name: 'com.blueysoft.cortana-electron', scope: 'user', enabled: state.executableWillLaunchAtLogin }] : [] };
    },
    setLoginItemSettings: value => {
      calls.push(value);
      state = { openAtLogin: value.openAtLogin, executableWillLaunchAtLogin: value.enabled && value.openAtLogin };
    } };
  return { calls, app, startup: createStartup(app, { platform: 'win32', executable: 'C:\\Apps\\Cortana Electron.exe' }) };
}
test('installed startup uses the app executable, launches hidden and disables explicitly', () => {
  const { startup, calls } = fixture();
  assert.equal(startup.reconcile(true).enabled, true);
  assert.equal(calls[0].path, 'C:\\Apps\\Cortana Electron.exe');
  assert.deepEqual(calls[0].args, ['--hidden']);
  assert.equal(startup.set(false).enabled, false);
  assert.equal(calls[1].openAtLogin, false);
});

test('startup states distinguish enabled, externally disabled and unregistered entries', () => {
  assert.equal(fixture({ openAtLogin: true, executableWillLaunchAtLogin: true }).startup.status().state, 'enabled');
  assert.equal(fixture({ openAtLogin: true, executableWillLaunchAtLogin: false }).startup.status().state, 'disabled');
  assert.equal(fixture().startup.status().state, 'unregistered');
});

test('explicit re-enabling persists and remains enabled on a fresh controller', async () => {
  const { app, startup, calls } = fixture({ openAtLogin: true, executableWillLaunchAtLogin: false });
  let preference = false;
  const result = await startup.change(true, async patch => { preference = patch.openAtLogin; return { success: true }; });
  assert.equal(result.state, 'enabled');
  assert.equal(preference, true);
  const restarted = createStartup(app, { platform: 'win32', executable: 'C:\\Apps\\Cortana Electron.exe' });
  assert.equal(restarted.reconcile(preference).state, 'enabled');
  assert.equal(calls.length, 1);
});

test('failed preference saves restore both missing and Task Manager disabled entries', async () => {
  for (const initial of [{}, { openAtLogin: true, executableWillLaunchAtLogin: false }, { openAtLogin: true, executableWillLaunchAtLogin: true }]) {
    const { startup } = fixture(initial);
    const before = startup.status();
    const result = await startup.change(!before.enabled, async () => ({ success: false }));
    assert.equal(result.enabled, before.enabled);
    assert.equal(result.registered, before.registered);
    assert.match(result.error, /previous Windows setting has been kept/);
  }
});

test('startup read failures report an unknown state without mutating Windows', async () => {
  const { startup, app, calls } = fixture();
  app.getLoginItemSettings = () => { throw Error('Access denied'); };
  assert.equal(startup.status().enabled, null);
  assert.equal(startup.status().state, 'error');
  assert.match((await startup.change(true, () => assert.fail('Unexpected save'))).error, /Could not read/);
  startup.reconcile(true);
  assert.equal(calls.length, 0);
});

test('permission errors and silent registration refusal never save a successful preference', async () => {
  for (const throws of [true, false]) {
    const { startup, app } = fixture();
    app.setLoginItemSettings = () => { if (throws) throw Error('Access denied'); };
    const result = await startup.change(true, () => assert.fail('Unexpected save'));
    assert.equal(result.enabled, false);
    assert.match(result.error, throws ? /Could not change/ : /Windows did not change/);
  }
});

test('rollback failure reports the changed Windows state and offers a recovery step', async () => {
  const { startup, app } = fixture();
  const nativeSet = app.setLoginItemSettings;
  let calls = 0;
  app.setLoginItemSettings = value => { if (++calls === 2) throw Error('Access denied'); nativeSet(value); };
  const result = await startup.change(true, async () => ({ success: false }));
  assert.equal(result.enabled, true);
  assert.match(result.error, /could not be saved or restored/);
});

test('rapid startup changes save in order and do not race Windows state', async () => {
  const { startup } = fixture();
  let unblock;
  const pending = new Promise(resolve => { unblock = resolve; });
  const saved = [];
  const first = startup.change(true, async patch => { await pending; saved.push(patch); return { success: true }; });
  const second = startup.change(false, async patch => { saved.push(patch); return { success: true }; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(startup.status().enabled, true);
  unblock();
  assert.equal((await first).enabled, true);
  assert.equal((await second).enabled, false);
  assert.deepEqual(saved, [{ openAtLogin: true }, { openAtLogin: false }]);
});

test('store, non-Windows and diagnostic environments never call login-item APIs', async () => {
  const app = { isPackaged: true, getLoginItemSettings() { assert.fail('Unexpected read'); }, setLoginItemSettings() { assert.fail('Unexpected mutation'); } };
  for (const options of [{ platform: 'linux' }, { platform: 'win32', store: true }, { platform: 'win32', diagnostic: true }]) {
    const startup = createStartup(app, options);
    assert.equal(startup.status().state, 'unsupported');
    assert.equal((await startup.change(true, () => assert.fail('Unexpected save'))).supported, false);
  }
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
