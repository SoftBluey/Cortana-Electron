// NSIS uses a stable executable path. Keep Windows' Startup Apps choice authoritative.
function createStartup(app, { platform = process.platform, executable = process.execPath,
  name = 'com.blueysoft.cortana-electron', store = process.windowsStore, diagnostic = false } = {}) {
  const options = { path: executable, args: ['--hidden'] };
  const supported = platform === 'win32' && app.isPackaged && !store && !diagnostic;
  function status() {
    if (!supported) return { supported: false, enabled: false,
      message: store ? 'Start with Windows is available in the .exe installation.' : 'Start with Windows is available in the installed app.' };
    try {
      const state = app.getLoginItemSettings(options);
      return { supported: true, registered: state.openAtLogin,
        enabled: state.openAtLogin && state.executableWillLaunchAtLogin };
    } catch (error) { return { supported: true, enabled: false, error: error.message }; }
  }
  function set(enabled) {
    if (!supported) return status();
    try {
      app.setLoginItemSettings({ ...options, name, openAtLogin: enabled, enabled });
      return status();
    } catch (error) { return { supported: true, enabled: false, error: error.message }; }
  }
  function reconcile(preference) {
    const current = status();
    if (!supported || current.error) return current;
    // Do not re-enable an existing entry that the user disabled in Windows.
    if (preference && !current.registered) return set(true);
    if (!preference && current.registered) return set(false);
    return current;
  }
  return { status, set, reconcile };
}
module.exports = { createStartup };
