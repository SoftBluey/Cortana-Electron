// Read Windows' current choice without undoing it when Cortana launches.
function createStartup(app, { platform = process.platform, executable = process.execPath,
  name = 'com.blueysoft.cortana-electron', store = process.windowsStore, diagnostic = false } = {}) {
  const options = { path: executable, args: ['--hidden'] };
  const supported = platform === 'win32' && app.isPackaged && !store && !diagnostic;
  let queue = Promise.resolve();
  function status() {
    if (!supported) return { supported: false, state: 'unsupported', enabled: false,
      message: store ? 'Start with Windows is available in the .exe installation.' : 'Start with Windows is available in the installed app.' };
    try {
      // Electron parses this lookup as a command line. Unquoted paths containing
      // spaces find no launchItems, even when registration succeeds.
      const state = app.getLoginItemSettings({ ...options, path: `"${executable}"` });
      const item = state.launchItems.find(item => item.name === name && item.scope === 'user');
      return { supported: true, state: item ? (item.enabled ? 'enabled' : 'disabled') : 'unregistered', registered: !!item, enabled: item?.enabled === true };
    } catch (_) { return { supported: true, state: 'error', enabled: null,
      error: 'Could not read Windows startup settings. Try again or check Startup apps in Windows Settings.' }; }
  }
  function set(enabled) {
    if (!supported) return status();
    try {
      app.setLoginItemSettings({ ...options, name, openAtLogin: enabled, enabled });
      const result = status();
      if (!result.error && result.enabled !== enabled) result.error =
        'Windows did not change Cortana\'s startup setting. Try again or check Startup apps in Windows Settings.';
      return result;
    } catch (_) { return { ...status(), error: 'Could not change Windows startup settings. Try again or check Startup apps in Windows Settings.' }; }
  }
  function reconcile(preference) {
    const current = status();
    if (!supported || current.error) return current;
    // Do not re-enable an existing entry that the user disabled in Windows.
    if (preference && !current.registered) return set(true);
    if (!preference && current.registered) return set(false);
    return current;
  }
  // Keep the Windows entry and saved preference together. On disk failure,
  // restore even an externally disabled registration, rather than losing it.
  function change(enabled, save) {
    const operation = async () => {
      const before = status();
      if (!before.supported || before.error) return before;
      const result = set(enabled);
      if (result.error) return result;
      const saved = await save({ openAtLogin: enabled });
      if (saved.success) return result;
      try {
        app.setLoginItemSettings({ ...options, name, openAtLogin: before.registered, enabled: before.enabled });
      } catch (_) { /* Report the actual resulting state below. */ }
      const restored = status();
      const rolledBack = !restored.error && restored.registered === before.registered && restored.enabled === before.enabled;
      return { ...restored, error: rolledBack
        ? 'Could not save the startup preference. Your previous Windows setting has been kept. Check the data folder and try again.'
        : 'Windows startup changed, but the preference could not be saved or restored. Check Startup apps in Windows Settings before restarting Cortana.' };
    };
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  return { status, set, reconcile, change };
}
module.exports = { createStartup };
