const { contextBridge, ipcRenderer } = require('electron');

// Expose a narrow cortanaAPI surface using contextBridge
// Do not expose raw ipcRenderer
contextBridge.exposeInMainWorld('cortanaAPI', {
  // IPC send
  send: (channel, ...args) => {
    // Allowed send channels
    const allowedChannels = [
      'speech-start',
      'speech-stop',
      'hey-cortana-toggle',
      'set-settings-visibility',
      'open-external-link',
      'open-path',
      'set-setting',
      'set-custom-actions',
      'reset-all-settings',
      'open-application-fallback',
      'create-calendar-event',
      'synthesize-edge-tts',
      'media-control',
      'get-is-packaged',
      'hide-window',
      'close-app',
      'update-status',
      'search-web',
      'get-accent-color',
      'get-settings',
      'get-app-version',
      'check-for-updates',
      'get-edge-voices',
      'get-time-for-location',
      'open-github-releases',
      'get-reminders',
      'get-reminder',
      'remove-reminder',
      'get-app-version',
    ];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  // IPC invoke
  invoke: (channel, ...args) => {
    // Allowed invoke channels
    const allowedChannels = [
      'get-accent-color',
      'search-web',
      'ask-openai',
      'get-settings',
      'find-application',
      'search-applications',
      'search-files',
      'check-everything',
      'open-application-fallback',
      'open-external-link',
      'set-reminder',
      'start-timer',
      'cancel-timer',
      'get-timer-remaining',
      'update-reminder',
      'remove-reminder',
      'get-reminders',
      'get-app-version',
      'check-for-updates',
      'eva-voice-status',
      'synthesize-edge-tts',
      'media-control',
      'wikipedia-lookup',
      'get-edge-voices',
      'get-time-for-location',
      'update-reminder',
      'custom-actions',
    ];
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} not allowed`));
  },

  // IPC receive (one-time listener with unsubscribe)
  on: (channel, listener) => {
    const validChannels = [
      'speech-ready',
      'speech-result',
      'speech-error',
      'wake-listen',
      'wake-slim',
      'timer-fired',
      'accent-color-updated',
      'settings-force-close',
      'online-speech-status',
      'speech-capabilities',
      'hey-cortana-status',
    ];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => listener(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  },

  // Asset paths - provided by main process, safe relative paths
  get assetsPath() {
    return window.__assetsPath || '';
  },

  // Speech capabilities status
  get speechCapabilities() {
    return window.__speechCapabilities || { winRTAvailable: false, fallback: '' };
  },
});