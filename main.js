const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  shell,
  Notification,
  Tray,
  Menu,
  dialog,
  systemPreferences,
  powerMonitor,
  globalShortcut,
} = require("electron");

// Keep Chromium's classic (non-Fluent) scrollbar renderer. Must run before
// app.whenReady()/any window is created.
app.commandLine.appendSwitch("disable-features", "FluentScrollbar,FluentOverlayScrollbar");

const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { exec, execFile, spawn, execSync } = require("child_process");
const animations = require('./lib/animation-loader').createAnimationLoader();
app.on('will-quit', () => animations.dispose());
const fs = require("fs/promises");
const fssync = require("fs");
const cityTimezones = require("city-timezones");
const { EdgeTTS } = require("node-edge-tts");
const os = require("os");
const { SpeechController, errorDetails } = require('./lib/speech-controller');
const { createWriter, createSettingsSaver, createMutationQueue, validNotebook, migrateInterfaceSettings, migrateFirstRunSettings } = require('./lib/preferences');
const { releaseInfo } = require('./lib/release');
const { parseShortcut } = require('./lib/shortcuts');
const { normalizeEndpoint, isLoopback } = require('./lib/ai-endpoint');
const { validRecurrence, nextOccurrence, validRecurrenceClock } = require('./lib/recurrence');
const { createMedia } = require('./lib/media');
const { createTimers } = require('./lib/timers');
const { createStartup } = require('./lib/startup');
const APP_ID = 'com.blueysoft.cortana-electron';
const atomicWriteFile = createWriter();
const generatedTtsFiles = new Set();
const mutateReminders = createMutationQueue();
let speech = null;
let appScanInterval = null;
let registeredHotkey = '';
let notebook = { notes: '', todos: [], introduced: false };
let NOTEBOOK_FILE;
let diagnosticsFile;
let diagnosticWrite = Promise.resolve();
const diagnosticEvents = [];
let settingsWritable = true;
let notebookWritable = true;
let remindersWritable = true;
// Explicit diagnostic mode creates its own profile and skips Windows startup registration.
const diagnosticSmoke = process.argv.includes('--diagnostic-smoke');
const startup = createStartup(app, { name: APP_ID, diagnostic: diagnosticSmoke });
if (diagnosticSmoke) app.setPath('userData', fssync.mkdtempSync(path.join(os.tmpdir(), 'cortana-smoke-')));

function logSpeech(stage, details = {}) {
  const record = { timestamp: new Date().toISOString(), stage, ...details };
  diagnosticEvents.push(record);
  if (diagnosticEvents.length > 100) diagnosticEvents.shift();
  if (diagnosticSmoke || process.argv.includes('--speech-debug')) console.log('[speech]', stage, details);
  if (diagnosticsFile) {
    diagnosticWrite = diagnosticWrite.then(async () => {
      try {
        const stat = await fs.stat(diagnosticsFile).catch(() => null);
        if (stat?.size > 1024 * 1024) await fs.rename(diagnosticsFile, diagnosticsFile + '.previous').catch(() => {});
        await fs.appendFile(diagnosticsFile, JSON.stringify(record) + '\n');
      } catch (error) { console.error('Could not write speech diagnostics:', error.message); }
    });
  }
}

function cancelManualSpeech(reason = 'manual-cancel') {
  // Hiding an idle window must not tear down and reopen wake capture.
  if (speech?.active?.kind === 'wake') return;
  speech?.stop(true, typeof reason === 'string' ? reason : 'manual-cancel')
    .catch(error => logSpeech('stop-failed', errorDetails(error)));
}

function registerAssistantHotkey(accelerator) {
  if (accelerator === registeredHotkey) return { success: true, accelerator };
  if (!accelerator) {
    if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
    registeredHotkey = '';
    return { success: true, accelerator: '' };
  }
  try {
    const registered = globalShortcut.register(accelerator, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      showWindow();
      if (settings.hotkeyStartsListening) mainWindow.webContents.send('activate-assistant');
    });
    if (!registered) return { success: false, error: 'This shortcut is already in use by Windows or another app. Choose a different combination.' };
    if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
    registeredHotkey = accelerator;
    return { success: true, accelerator };
  } catch (_) { return { success: false, error: 'That shortcut is not valid. Try Ctrl+Shift+C.' }; }
}

let updateAvailable = false;
let verifiedReleaseUrl = null;
let updateCheckPromise = null;
let updateCheckInterval = null;
const GITHUB_RELEASES_API_URL =
  "https://api.github.com/repos/SoftBluey/Cortana-Electron/releases/latest";
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

// Electron script entry points otherwise report Electron's own version.
const APP_VERSION = require('./package.json').version;

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') { /* ignore broken pipe from WASM debug logs */ }
});

let mainWindow;
const winWidth = 360;
const winHeight = 640;
let isSettingsVisible = false;
let tray = null;
let isClosing = false;
let quitAfterDismiss = false;
let lastHiddenTime = 0;

let applicationCache = new Map();
let lastAppScanTime = 0;

let reminders = [];

let timers;

const DEFAULT_SETTINGS = {
  interfaceRelease: 8,
  firstRunComplete: false,
  openAtLogin: true,
  preferredVoice: "Microsoft Zira",
  searchEngine: "bing",
  themeColor: "#0078d7",
  useWindowsAccent: false,
  customActions: [],
  isMovable: false,
  pitch: 1,
  rate: 1,
  idleGreetingMode: "random",
  specificIdleGreeting: "What's on your mind?",
  customIdleGreeting: "",
  reminderSound: "notify.wav",
  ttsEngine: "edge",
  edgeVoice: "en-US-JennyNeural",
  timeFormat: "12",
  weatherUnits: "metric",
  openaiApiKey: "",
  aiEnabled: false,
  aiSystemPrompt: "You are Cortana, Microsoft's virtual assistant. Be helpful, concise, and friendly. Keep responses brief and conversational. Do not use markdown formatting.",
  aiModel: "gpt-4o-mini",
  aiApiUrl: "https://api.openai.com/v1/chat/completions",
  aiProvider: "",
  useEverythingSearch: false,
  heyCortana: false,
  recognitionEngine: 'winrt',
  recognitionMode: 'dictation',
  listeningSounds: true,
  everythingPort: 80,
  closeToTray: true,
  assistantHotkey: "",
  hotkeyStartsListening: false,
};

let settings = {
  ...DEFAULT_SETTINGS,
  customActions: [],
};
let SETTINGS_FILE;
let REMINDERS_FILE;
let iconPath;
let assetsPath;
let onlineSpeechEnabled = false;

// Reads Windows' "Online speech recognition" privacy consent. Re-checked
// fresh on every manual speech-start since it can change while the app runs.
function checkOnlineSpeechEnabled() {
  return new Promise((resolve) => {
    const cmd = `reg query "HKCU\\Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy" /v HasAccepted`;
    exec(cmd, { timeout: 3000, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(/HasAccepted\s+REG_DWORD\s+0x1/i.test(stdout || ""));
    });
  });
}

function normalizeAccentColor(raw) {
  if (!raw) return null;
  // getAccentColor() returns RRGGBBAA (8 hex chars, no #)
  // Strip the alpha channel and prepend #
  const hex = raw.replace(/^#/, '');
  return '#' + hex.substring(0, 6);
}

const EVA_TTS_DIR = path.join(process.env.WINDIR || 'C:\\Windows', 'Speech_OneCore', 'Engines', 'TTS', 'en-US');
const EVA_REG_TOKEN = "MSTTS_V110_enUS_EvaM";
const EVA_TOKEN_PATH = `HKLM\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\${EVA_REG_TOKEN}`;

function getEvaVoiceStatus() {
  let registryPresent = false;
  try {
    const out = execSync(`reg query "${EVA_TOKEN_PATH}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
      windowsHide: true,
    });
    registryPresent = out.includes(EVA_REG_TOKEN);
  } catch (_) {
    registryPresent = false;
  }
  const filesPresent = fssync.existsSync(path.join(EVA_TTS_DIR, "M1033Eva.INI"));
  return {
    installed: registryPresent && filesPresent,
    registryPresent,
    filesPresent,
  };
}

function readLogRetry(logPath, done) {
  const attempts = 10;
  const tryRead = (n) => {
    try {
      done(fssync.readFileSync(logPath, "utf8"));
    } catch (_) {
      if (n < attempts) {
        setTimeout(() => tryRead(n + 1), 150);
      } else {
        done("");
      }
    }
  };
  tryRead(0);
}

const isSilentStart = process.argv.includes("--hidden");

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      showWindow();
    }
  });
}

const MAX_TIMEOUT_MS = 2_147_483_647;

const REMINDER_CHECKPOINT_MS = Math.min(
  MAX_TIMEOUT_MS,
  24 * 60 * 60 * 1000
);

const MAX_TIMER_MS = 30 * 24 * 60 * 60 * 1000;

function validateReminderInput({ reminder, reminderTime, sound, recurrence = null }) {
  if (typeof reminder !== 'string' || !reminder.trim()) {
    return { success: false, error: 'Please enter something to be reminded about.' };
  }

  if (typeof reminderTime !== 'string') {
    return { success: false, error: 'Please choose a valid reminder time.' };
  }

  if (!validRecurrence(recurrence)) return {success:false,error:'Choose a supported repeat schedule.'};
  const timestamp = Date.parse(reminderTime);
  if (!Number.isFinite(timestamp)) {
    return { success: false, error: 'Please choose a valid reminder time.' };
  }

  if (timestamp <= Date.now()) {
    return { success: false, error: 'Reminder time must be in the future.' };
  }
  if (recurrence === 'weekdays' && [0,6].includes(new Date(timestamp).getDay())) {
    return {success:false,error:'Choose a weekday for the first reminder.'};
  }

  if (sound !== undefined && typeof sound !== 'string') {
    return { success: false, error: 'Invalid reminder sound.' };
  }

  return {
    success: true,
    value: {
      text: reminder.trim(),
      time: new Date(timestamp).toISOString(),
      sound: sound || settings.reminderSound || 'notify.wav',
      recurrence,
      recurrenceClock: recurrence ? {hour:new Date(timestamp).getHours(),minute:new Date(timestamp).getMinutes()} : null,
    },
  };
}

function validateTimerDuration(ms) {
  if (
    typeof ms !== 'number' ||
    !Number.isFinite(ms) ||
    !Number.isSafeInteger(ms)
  ) {
    return {
      success: false,
      error: 'Please choose a valid timer duration.',
    };
  }

  if (ms <= 0) {
    return {
      success: false,
      error: 'Timer duration must be greater than zero.',
    };
  }

  if (ms > MAX_TIMER_MS) {
    return {
      success: false,
      error: 'Timers can be set for up to 30 days.',
    };
  }

  return { success: true };
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function isSafeFallbackAppName(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 260 &&
    !/[\r\n\0&|<>^%]/.test(value)
  );
}

function validateExternalUrl(rawUrl, allowedProtocols = ['http:', 'https:']) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 4096) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    return allowedProtocols.includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch (_) {
    return null;
  }
}

const AI_REQUEST_TIMEOUT_MS = 30_000;
const AI_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function clearReminderTimeout(reminder) {
  if (reminder && reminder.timeout) {
    clearTimeout(reminder.timeout);
    reminder.timeout = null;
  }
}

function fireReminder(reminder) {
  return mutateReminders(async () => {
  if (!reminders.includes(reminder)) {
    return;
  }

  clearReminderTimeout(reminder);
  const nextTime = nextOccurrence(reminder.time, reminder.recurrence, Date.now(), reminder.recurrenceClock);
  const nextReminder = nextTime ? {...reminder,time:nextTime,timeout:null} : null;
  const next = nextReminder ? reminders.map(item=>item===reminder?nextReminder:item) : reminders.filter(item=>item!==reminder);
  try { await saveReminders(next); }
  catch(error) { reminder.timeout=setTimeout(()=>fireReminder(reminder),10000);console.error('Reminder delivery will retry after a save failure:',error.message);return; }
  reminders=next;
  if(nextReminder)scheduleReminder(nextReminder);

  if (Notification.isSupported()) {
    new Notification({
      title: '⏰ Reminder',
      body: `${notebook.profile?.name.trim() ? notebook.profile.name.trim()+', ' : ''}it's time for: ${reminder.text}`,
      icon: path.join(assetsPath, 'cortana.png'),
    }).show();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    const soundFile =
      reminder.sound ||
      settings.reminderSound ||
      'notify.wav';

    mainWindow.webContents.send(
      'play-reminder-sound',
      soundFile
    );
  }

  });
}

function scheduleReminder(reminder) {
  clearReminderTimeout(reminder);

  const timestamp = Date.parse(reminder.time);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const remaining = timestamp - Date.now();

  if (remaining <= 0) {
    fireReminder(reminder);
    return true;
  }

  const delay = Math.min(remaining, REMINDER_CHECKPOINT_MS);

  reminder.timeout = setTimeout(() => {
    reminder.timeout = null;

    const nextRemaining = timestamp - Date.now();
    if (nextRemaining <= 0) {
      fireReminder(reminder);
    } else {
      scheduleReminder(reminder);
    }
  }, delay);

  return true;
}

async function saveReminders(snapshot = reminders) {
  if (!remindersWritable) throw new Error('The existing reminders file could not be read. It has been retained; check its permissions or contents before adding reminders.');
  try {
    const remindersToSave = snapshot.map(({ id, text, time, sound, recurrence, recurrenceClock }) => ({
      id,
      text,
      time,
      sound,
      recurrence,
      recurrenceClock,
    }));
    await atomicWriteFile(
      REMINDERS_FILE,
      JSON.stringify(remindersToSave, null, 2)
    );
  } catch (error) {
    console.error("Failed to save reminders:", error);
    throw error;
  }
}

async function loadReminders() {
  try {
    const data = await fs.readFile(REMINDERS_FILE, 'utf8');
    const parsed = JSON.parse(data);

    if (!Array.isArray(parsed)) {
      throw new Error('Reminder file must contain an array');
    }

    reminders = parsed
      .filter((item) => {
        return (
          item &&
          typeof item.id === 'string' &&
          typeof item.text === 'string' &&
          item.text.trim() &&
          typeof item.time === 'string' &&
          Number.isFinite(Date.parse(item.time)) && validRecurrence(item.recurrence) && validRecurrenceClock(item.recurrenceClock)
        );
      })
      .map((item) => ({
        id: item.id,
        text: item.text.trim(),
        recurrence: item.recurrence || null,
        recurrenceClock: item.recurrenceClock || (item.recurrence ? {hour:new Date(item.time).getHours(),minute:new Date(item.time).getMinutes()} : null),
        time: new Date(Date.parse(item.time)).toISOString(),
        sound:
          typeof item.sound === 'string'
            ? item.sound
            : settings.reminderSound || 'notify.wav',
        timeout: null,
      }));

    for (const reminder of reminders) {
      scheduleReminder(reminder);
    }

  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to load reminders:', error);
      remindersWritable = false;
    }
    reminders = [];
  }
}

const VALID_ENUMS = {
  recognitionEngine: ['winrt'],
  recognitionMode: ['dictation', 'commands'],
  searchEngine: ['bing', 'duckduckgo', 'google', 'brave', 'ecosia'],
  ttsEngine: ['edge', 'system'],
  timeFormat: ['12', '24'],
  weatherUnits: ['metric', 'imperial'],
  idleGreetingMode: ['random', 'specific', 'custom'],
  aiProvider: ['', 'openai', 'ollama', 'lmstudio', 'groq', 'together', 'openrouter', 'perplexity', 'xai', 'mistral', 'google-gemini', 'deepseek', 'custom'],
};

function validateSettingValue(key, value) {
  if (key === 'interfaceRelease' && (!Number.isInteger(value) || value < 0)) return false;
  if (typeof DEFAULT_SETTINGS[key] === 'boolean' && typeof value !== 'boolean') return false;
  if (key === 'assistantHotkey' && (typeof value !== 'string' || value.length > 128 || /[\r\n\0]/.test(value))) return false;
  if (key === 'customActions') return Array.isArray(value) && value.length <= 50 && value.every(action =>
    action && typeof action.trigger === 'string' && action.trigger.length <= 256 && Array.isArray(action.actions) &&
    action.actions.length <= 20 && action.actions.every(step => step && ['speak', 'open_app', 'open_url', 'play_sound', 'run_command'].includes(step.type) && typeof step.value === 'string' && step.value.length <= 4096));
  if (key === 'everythingPort' && (!Number.isInteger(value) || value < 1 || value > 65535)) return false;
  if (['pitch', 'rate'].includes(key) && !Number.isFinite(value)) return false;
  if (key === 'themeColor' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) return false;
  if (key in VALID_ENUMS) {
    if (!VALID_ENUMS[key].includes(value)) {
      return false;
    }
  }

  if (key === 'preferredVoice' || key === 'edgeVoice') {
    if (typeof value !== 'string') return false;
  }

  if (key === 'customIdleGreeting' || key === 'specificIdleGreeting') {
    if (typeof value !== 'string') return false;
    if (value.length > 512) return false;
  }

  if (key === 'reminderSound') {
    if (typeof value !== 'string') return false;
    const ext = value.split('.').pop().toLowerCase();
    if (ext && !['wav', 'mp3', 'ogg', 'm4a', 'aac'].includes(ext)) {
      return false;
    }
  }

  if (key === 'aiModel') {
    if (typeof value !== 'string') return false;
    if (value.length > 128) return false;
  }

  if (key === 'aiApiUrl') {
    if (typeof value !== 'string') return false;
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    } catch (_) {
      return false;
    }
  }

  if (key === 'aiSystemPrompt') {
    if (typeof value !== 'string') return false;
    if (value.length > 2048) return false;
  }

  if (key === 'openaiApiKey') {
    if (typeof value !== 'string') return false;
    if (value.length > 512) return false;
    // Check for embedded credentials in URL style
    if (value.includes(':')) {
      const parts = value.split(':');
      if (parts[0].length <= 2) return false; // likely sk-... format
    }
  }

  if (key === 'pitch') {
    if (typeof value !== 'number') return false;
    if (value < 0.1 || value > 2.0) return false;
  }

  if (key === 'rate') {
    if (typeof value !== 'number') return false;
    if (value < 0.1 || value > 2.0) return false;
  }

  return true;
}

function loadValidatedSettings(rawData) {
  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch (_) {
    return { success: false, error: 'Invalid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { success: false, error: 'Settings must be an object' };
  }

  // Validate each known key, ignore unknown keys
  const recovered = Object.create(null);
  for (const [key, value] of Object.entries(parsed)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key) || validateSettingValue(key, value)) {
      recovered[key] = value;
    }
  }

  return { success: true, data: recovered };
}

function generateUniqueBackupName(basePath) {
  return basePath + '.backup.' + Date.now() + '.' + crypto.randomUUID().slice(0, 8);
}

async function loadSettings() {
  let data;
  try {
    data = await fs.readFile(SETTINGS_FILE, "utf-8");
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No settings file exists yet; start fresh with defaults
      await saveSettings();
      return;
    }
    // Startup resilience: never block window creation because settings could not be read
    console.error("Failed to read settings; falling back to defaults:", error);
    settingsWritable = false;
    settings = restoreDefaults();
    return;
  }

  // Handle empty file - treat as corrupt, back it up, restore defaults
  if (!data || data.trim() === '') {
    try {
      const backupName = generateUniqueBackupName(SETTINGS_FILE);
      await fs.copyFile(SETTINGS_FILE, backupName);
      console.log(`Empty/corrupt settings backed up to ${backupName}`);
    } catch (_) { settingsWritable = false; }
    settings = restoreDefaults();
    await saveSettings();
    return;
  }

  const validationResult = loadValidatedSettings(data);

  if (!validationResult.success) {
    // File has invalid JSON or structure - back it up and restore defaults
    try {
      const backupName = generateUniqueBackupName(SETTINGS_FILE);
      await fs.copyFile(SETTINGS_FILE, backupName);
      console.log(`Corrupted settings backed up to ${backupName}`);
    } catch (_) { settingsWritable = false; }
    settings = restoreDefaults();
    await saveSettings();
    return;
  }

  // Valid settings - merge with defaults, preserving unknown keys behavior
  settings = { ...restoreDefaults(), ...migrateFirstRunSettings(migrateInterfaceSettings(validationResult.data)) };

  // Ensure defaults are applied for any missing keys
  await saveSettings();
}

function restoreDefaults() {
  settings = {
    ...DEFAULT_SETTINGS,
    customActions: [],
  };
  return settings;
}

const saveSettings = createSettingsSaver({
  read: () => settings,
  commit: value => { settings = value; },
  write: value => atomicWriteFile(SETTINGS_FILE, JSON.stringify(value, null, 2)),
  writable: () => settingsWritable,
  onError: error => console.error('Failed to save settings:', error),
});

function checkForUpdates() {
  if (!updateCheckPromise) updateCheckPromise = fetchLatestRelease().finally(() => { updateCheckPromise = null; });
  return updateCheckPromise;
}

async function fetchLatestRelease() {
  try {
    const currentVersion = APP_VERSION;

    // Ask GitHub for the latest published release (not just the version
    // baked into package.json on main) so this reflects real releases.
    // /releases/latest only ever returns a full, non-draft, non-prerelease
    // release, so an in-progress dev/prerelease build on GitHub is never
    // mistaken for "the update to install".
    const response = await new Promise((resolve, reject) => {
      const req = https
        .get(
          GITHUB_RELEASES_API_URL,
          {
            headers: {
              "User-Agent": "Cortana-Electron-Update-Check",
              Accept: "application/vnd.github+json",
            },
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error(`Request failed with status ${res.statusCode}`));
              return;
            }

            let data = "";
            let receivedBytes = 0;
            res.setEncoding('utf8');
            res.on('error', reject);
            res.on('aborted', () => reject(new Error('The update connection was interrupted.')));
            res.on("data", (chunk) => {
              receivedBytes += Buffer.byteLength(chunk);
              if (receivedBytes > 1024 * 1024) {
                const error = new Error('The update response was too large.');
                reject(error);
                req.destroy(error);
                return;
              }
              data += chunk;
            });
            res.on("end", () => resolve(data));
          }
        )
        .on("error", reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error("Request timed out"));
      });
    });

    const latestRelease = JSON.parse(response);
    const result = releaseInfo(latestRelease, currentVersion);
    updateAvailable = result.available;
    verifiedReleaseUrl = result.available ? result.releaseUrl : null;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-status", result);
    }

    return result;
  } catch (error) {
    console.error("Failed to check for updates:", error);
    updateAvailable = false;
    verifiedReleaseUrl = null;
    const result = { available: false, currentVersion: APP_VERSION,
      error: 'Could not check for updates. Check your internet connection and try again.' };
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', result);
    return result;
  }
}

const sendAppVersion = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentVersion = APP_VERSION;
    mainWindow.webContents.send("update-status", {
      currentVersion: currentVersion,
    });
  }
};

if (gotTheLock) {
  app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  
  // Clean up old Edge TTS temp files from previous sessions
  try {
    const tempDir = os.tmpdir();
    const files = fssync.readdirSync(tempDir);
    for (const file of files) {
      if (file.startsWith("cortana-tts-") && file.endsWith(".mp3")) {
        fssync.unlinkSync(path.join(tempDir, file));
      }
    }
  } catch (e) { /* ignore cleanup errors */ }
  
  SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
  REMINDERS_FILE = path.join(app.getPath("userData"), "reminders.json");
  NOTEBOOK_FILE = path.join(app.getPath('userData'), 'notebook.json');
  diagnosticsFile = path.join(app.getPath('userData'), 'speech-diagnostics.jsonl');
  logSpeech('environment', { platform: process.platform, arch: process.arch, os: os.release(),
    versions: process.versions, packaged: app.isPackaged, microphoneAccess: systemPreferences.getMediaAccessStatus('microphone') });
  try {
    const saved = JSON.parse(await fs.readFile(NOTEBOOK_FILE, 'utf8'));
    if (validNotebook(saved)) notebook = saved;
    else { notebookWritable = false; console.error('Invalid notebook data; original file retained.'); }
  } catch (error) { if (error.code !== 'ENOENT') { notebookWritable = false; console.error('Notebook could not be loaded; original file retained:', error.message); } }
  
  assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "assets");
  iconPath = path.join(assetsPath, "icon.ico");

  await loadSettings();
  const timerFile=path.join(app.getPath('userData'),'timers.json');
  timers=createTimers({read:async()=>JSON.parse(await fs.readFile(timerFile,'utf8')),
    write:values=>atomicWriteFile(timerFile,JSON.stringify(values,null,2)),
    onFire:({id,label})=>{
      if(Notification.isSupported())new Notification({title:'⏰ Timer',body:label?`${label}: time's up!`:"Time's up!",icon:path.join(assetsPath,'cortana.png')}).show();
      if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('timer-fired',{id,label});
    }});
  await timers.load();
  await loadReminders();

  powerMonitor.on('resume', async () => {
    timers.resume();
    console.log('[powerMonitor] System resumed — rescheduling reminders and invalidating stale recognizers.');

    const reminderSnapshot = [...reminders];

    for (const reminder of reminderSnapshot) {
      clearReminderTimeout(reminder);

      if (Date.parse(reminder.time) <= Date.now()) {
        fireReminder(reminder);
      } else {
        scheduleReminder(reminder);
      }
    }

    cancelManualSpeech();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('speech-force-stop');
  });
  powerMonitor.on('suspend', () => speech?.setPaused(true).catch(error => logSpeech('suspend-failed', errorDetails(error))));
  powerMonitor.on('resume', () => speech?.setPaused(isSettingsVisible).catch(error => logSpeech('resume-failed', errorDetails(error))));

  systemPreferences.on('accent-color-changed', (event, newColor) => {
    if (mainWindow && !mainWindow.isDestroyed() && settings.useWindowsAccent) {
      const normalized = normalizeAccentColor(newColor);
      if (normalized) mainWindow.webContents.send('accent-color-updated', normalized);
    }
  });

  scanApplications();

  appScanInterval = setInterval(() => {
    scanApplications();
  }, 30 * 60 * 1000); // rescan every 30 minutes


  registerIpcHandlers();

  const startupStatus = startup.reconcile(settings.openAtLogin);
  if (startupStatus.error) console.error('Windows startup registration failed:', startupStatus.error);

  onlineSpeechEnabled = await checkOnlineSpeechEnabled();

  const bindingsPath = app.isPackaged ? path.join(__dirname, '.winapp', 'bindings') : '#winapp/bindings';
  speech = new SpeechController({
    loadBindings: () => {
      const runtime = require('@microsoft/dynwinrt');
      // Electron initializes its Windows main thread as STA. Accept an existing MTA too.
      try { runtime.roInitialize(0); }
      catch (error) {
        if (!/80010106|changed.*mode/i.test(error.message)) throw error;
        runtime.roInitialize(1);
      }
      logSpeech('apartment-ready', { packageIdentity: runtime.hasPackageIdentity() });
      return require(bindingsPath);
    },
    onlineConsent: checkOnlineSpeechEnabled,
    getMode: () => settings.recognitionMode,
    getIdentity: () => require('@microsoft/dynwinrt').hasPackageIdentity(),
    log: logSpeech,
    send: (channel, data) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (channel === 'wake-activate') {
        const visible = mainWindow.isVisible();
        showWindow();
        mainWindow.webContents.send(visible ? 'wake-listen' : 'wake-slim');
      } else mainWindow.webContents.send(channel, data);
    },
  });
  // Load speech bindings after the first usable view; microphone actions also initialize on demand.
  ipcMain.on('speech-start', () => speech.startManual().catch(error => logSpeech('manual-unhandled', errorDetails(error))));
  ipcMain.on('speech-stop', (_event, reason) => cancelManualSpeech(reason));
  ipcMain.handle('get-speech-capabilities', () => speech.capabilities());
  ipcMain.on('hey-cortana-toggle', (_event, enabled) => speech.setWake(enabled).catch(error => logSpeech('wake-toggle-failed', errorDetails(error))));
  ipcMain.handle('tts-begin', async () => { await speech.setSpeaking(true); return { success: true }; });
  ipcMain.on('tts-end', () => speech.setSpeaking(false).catch(error => logSpeech('tts-end-failed', errorDetails(error))));
  ipcMain.on('speech-device-changed', () => {
    logSpeech('default-input-change', {});
    speech.engineChanged().catch(error => logSpeech('device-reset-failed', errorDetails(error)));
    mainWindow?.webContents.send('speech-force-stop');
  });
  ipcMain.on('set-settings-visibility', (_event, visible) => {
    isSettingsVisible = visible === true;
    speech.setPaused(isSettingsVisible).catch(error => logSpeech('settings-pause-failed', errorDetails(error)));
    if (isSettingsVisible && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('speech-force-stop');
  });
  app.on('before-quit', event => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();
    clearInterval(appScanInterval);
    clearInterval(updateCheckInterval);
    reminders.forEach(clearReminderTimeout);
    timers?.stop();
    if (!speech.shuttingDown) {
      event.preventDefault();
      speech.shutdown().catch(error => logSpeech('shutdown-failed', errorDetails(error)))
        .finally(async () => {
          try { await saveSettings(); await mutateReminders(() => saveReminders()); await diagnosticWrite; }
          catch (error) { console.error('Shutdown persistence failed:', error.message); }
          finally { app.quit(); }
        });
    }
  });

  createWindow();
  if (diagnosticSmoke) require('./lib/diagnostic-smoke').run({ app, window: mainWindow, speech });

  const hotkeyResult = registerAssistantHotkey(settings.assistantHotkey);
  if (!hotkeyResult.success) logSpeech('hotkey-registration-failed', { message: hotkeyResult.error });

  sendAppVersion();

  // Check for updates once shortly after launch, then periodically while
  // the app stays open, so a long-running session still notices a new
  // release without needing a full restart.
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
  updateCheckInterval = setInterval(() => {
    checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
});
}

function showWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible() && !settings.isMovable) {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const { x, y, height: screenHeight } = display.workArea;
      mainWindow.setPosition(x, y + screenHeight - winHeight);
    }
    isClosing = false;
    quitAfterDismiss = false;
    mainWindow.show();
    mainWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("trigger-enter-animation", {
        timeSinceHidden: Date.now() - lastHiddenTime
      });
    }
    mainWindow.webContents.send('online-speech-status', { enabled: onlineSpeechEnabled });
    if (settings.useWindowsAccent) {
      try {
        const accent = normalizeAccentColor(systemPreferences.getAccentColor());
        if (accent) mainWindow.webContents.send('accent-color-updated', accent);
      } catch (_) {}
    }
    mainWindow.webContents.send('settings-force-close');
    const timeSinceCache = Date.now() - lastAppScanTime;
    if (timeSinceCache > 5 * 60 * 1000) {
      scanApplications();
    }
  }
}

async function findApplicationsIn(folder) {
  let results = [];
  try {
    const files = await fs.readdir(folder, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(folder, file.name);
      if (file.isDirectory()) {
        results = results.concat(await findApplicationsIn(fullPath));
      } else if (
        file.name.toLowerCase().endsWith(".lnk") ||
        file.name.toLowerCase().endsWith(".exe")
      ) {
        results.push({
          name: path.parse(file.name).name,
          path: fullPath,
        });
      }
    }
  } catch (err) {
    console.error(`Failed to read application folder: ${folder}`, err);
  }
  return results;
}

async function scanApplications() {
  applicationCache.clear();
  const startMenuFolders = [
    path.join(
      "C:",
      "ProgramData",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs"
    ),
    app.getPath("appData")
      ? path.join(
          app.getPath("appData"),
          "Microsoft",
          "Windows",
          "Start Menu",
          "Programs"
        )
      : null,
  ].filter(Boolean);

  for (const folder of startMenuFolders) {
    const appsInFolder = await findApplicationsIn(folder);
    for (const appEntry of appsInFolder) {
      if (!applicationCache.has(appEntry.name)) {
        applicationCache.set(appEntry.name, appEntry.path);
      }
    }
  }
  console.log(`Scanned and cached ${applicationCache.size} applications.`);
  lastAppScanTime = Date.now();
}

function fetchDuckDuckGoResults(query) {
  return new Promise((resolve, reject) => {
    // Limit query length
    const safeQuery = query.length > 1024 ? query.slice(0, 1024) : query;
    const postData = `q=${encodeURIComponent(safeQuery)}`;
    const options = {
      hostname: "html.duckduckgo.com",
      path: "/html/",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    };
    const req = https.request(options, (res) => {
      // Validate HTTP status code
      if (res.statusCode !== 200) {
        reject(new Error(`DuckDuckGo request failed with status ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => {
        // Limit response size
        if ((data += chunk).length > 1_000_000) {
          req.destroy();
          reject(new Error('DuckDuckGo response was too large.'));
          return;
        }
      });
      res.on("end", () => {
        try {
          const results = parseDuckDuckGoHTML(data);
          resolve(results);
        } catch (e) {
          reject(new Error("Failed to parse search results"));
        }
      });
    });
    req.on("error", reject);
    // Add request timeout
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('DuckDuckGo request timed out.'));
    });
    req.write(postData);
    req.end();
  });
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseDuckDuckGoHTML(html) {
  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links = [];
  let match;
  while ((match = resultRegex.exec(html)) !== null) {
    let url = match[1];
    const ddgRedirect = /uddg=([^&]+)/;
    const redirMatch = ddgRedirect.exec(url);
    if (redirMatch) {
      url = decodeURIComponent(redirMatch[1]);
    }
    const title = decodeHTMLEntities(match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
    if (title && url && !url.startsWith("//duckduckgo.com")) {
      links.push({ url, title });
    }
  }

  const snippets = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(decodeHTMLEntities(match[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()));
  }

  for (let i = 0; i < links.length && i < 8; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || "",
    });
  }

  return results;
}

function closeApp() {
  if (
    isClosing ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isVisible()
  ) {
    return;
  }
  isClosing = true;
  quitAfterDismiss = !settings.closeToTray;
  lastHiddenTime = Date.now();
  mainWindow.webContents.send("go-idle-and-close");
}

function registerIpcHandlers() {
  ipcMain.handle('decode-animation', (_event, filename, maxHeight) => {
    if (typeof filename !== 'string' || !/^[\w -]+\.gif$/i.test(filename)) throw new Error('Invalid animation asset');
    if (!Number.isInteger(maxHeight) || maxHeight < 1 || maxHeight > 822) throw new Error('Invalid animation size');
    return animations.decode(path.join(assetsPath, filename), maxHeight);
  });
  ipcMain.on("get-is-packaged", (event) => {
    event.returnValue = app.isPackaged;
  });

  ipcMain.on("hide-window", () => {
    cancelManualSpeech({ stopFallback: true });
    if (isClosing && quitAfterDismiss) {
      app.isQuitting = true;
      app.quit();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    isClosing = false;
  });

  ipcMain.on("close-app", closeApp);

  ipcMain.handle("get-accent-color", () => {
    try {
      const accent = systemPreferences.getAccentColor();
      return { success: true, color: normalizeAccentColor(accent) };
    } catch (e) {
      return { success: false };
    }
  });

  ipcMain.handle("search-web", async (event, query) => {
    try {
      const results = await fetchDuckDuckGoResults(query);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("ask-openai", async (event, query) => {
    if (typeof query !== 'string' || !query.trim()) {
      return { success: false, error: 'Empty query.' };
    }

    const apiKey = settings.openaiApiKey;
    let apiUrl = settings.aiApiUrl || "https://api.openai.com/v1/chat/completions";
    const model = settings.aiModel || "gpt-4o-mini";
    const systemPrompt = settings.aiSystemPrompt || DEFAULT_SETTINGS.aiSystemPrompt;

    if (typeof model !== 'string' || !model.trim()) {
      return { success: false, error: 'Invalid model.' };
    }
    if (typeof systemPrompt !== 'string') {
      return { success: false, error: 'Invalid system prompt.' };
    }

    let urlObj;
    try {
      urlObj = normalizeEndpoint(apiUrl);
      apiUrl = urlObj.toString();
    } catch (_) {
      return { success: false, error: 'Invalid AI API URL.' };
    }

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { success: false, error: 'AI API URL must use http or https.' };
    }

    const isLocal = isLoopback(apiUrl);
    if (!apiKey && !isLocal) {
      return { success: false, error: "No API key configured. Add your key in Settings > AI." };
    }

    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query.trim() },
      ],
      max_tokens: 500,
      stream: false,
    });

    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const transport = urlObj.protocol === "https:" ? https : http;

    try {
      const data = await new Promise((resolve, reject) => {
        let settled = false;
        let deadline;

        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          callback(value);
        };

        const req = transport.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: "POST",
            headers,
          },
          (res) => {
            res.setEncoding('utf8');
            let responseData = '';
            let responseBytes = 0;

            res.on('data', (chunk) => {
              responseBytes += Buffer.byteLength(chunk);

              if (responseBytes > AI_MAX_RESPONSE_BYTES) {
                req.destroy();
                finish(
                  reject,
                  new Error('AI provider response was too large.')
                );
                return;
              }

              responseData += chunk;
            });

            res.on('error', error => finish(reject, error));
            res.on('aborted', () => finish(reject, new Error('AI provider disconnected before completing its response.')));
            res.on('end', () => {
              if (settled) return;

              let parsed;
              try {
                parsed = responseData
                  ? JSON.parse(responseData)
                  : null;
              } catch (_) {
                finish(
                  reject,
                  new Error(
                    `AI provider returned an invalid response${
                      res.statusCode ? ` (HTTP ${res.statusCode})` : ''
                    }.`
                  )
                );
                return;
              }

              if (
                typeof res.statusCode === 'number' &&
                (res.statusCode < 200 || res.statusCode >= 300)
              ) {
                const failure = new Error('AI provider request failed.');
                failure.status = res.statusCode;
                finish(reject, failure);
                return;
              }

              finish(resolve, parsed);
            });
          }
        );

        req.setTimeout(AI_REQUEST_TIMEOUT_MS, () => {
          req.destroy(
            new Error('AI provider request timed out.')
          );
        });
        deadline = setTimeout(() => req.destroy(new Error('AI provider request timed out.')), AI_REQUEST_TIMEOUT_MS);

        req.on('error', (error) => {
          finish(reject, error);
        });

        req.write(body);
        req.end();
      });

      if (
        data &&
        Array.isArray(data.choices) &&
        data.choices[0] &&
        data.choices[0].message &&
        typeof data.choices[0].message.content === 'string' && data.choices[0].message.content.trim()
      ) {
        return { success: true, text: data.choices[0].message.content.trim() };
      }

      return { success: false, error: 'Your AI provider did not return an answer. Check the model in Settings and try again.' };
    } catch (error) {
      const message = error.code === 'ECONNREFUSED' && isLocal
        ? 'Your local AI server is not running at this address. Start it and check the server address and model in Settings.' :
        [401, 403].includes(error.status) ? 'Your AI provider did not accept the request. Check your API key and model access in Settings.' :
        error.status === 429 ? 'Your AI provider has reached its usage limit. Wait a little or check your account with the provider.' :
        [400, 404].includes(error.status) ? 'Your AI provider could not use these settings. Check the model and server address in Settings.' :
        'Could not get an answer from your AI provider. Check your connection and provider settings, then try again.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('set-assistant-hotkey', async (_event, accelerator) => {
    if (typeof accelerator !== 'string') return { success: false, error: 'Enter a shortcut such as Ctrl+Shift+C.' };
    accelerator = parseShortcut(accelerator);
    if (!validateSettingValue('assistantHotkey', accelerator)) return { success: false, error: 'Invalid keyboard shortcut.' };
    const previous = registeredHotkey;
    const result = registerAssistantHotkey(accelerator);
    if (!result.success) return result;
    const saved = await saveSettings({ assistantHotkey: accelerator });
    if (!saved.success) {
      const restored = registerAssistantHotkey(previous);
      return { ...saved, error: restored.success ? saved.error : saved.error + ' The previous shortcut could not be restored; apply it again.' };
    }
    return result;
  });
  ipcMain.handle('get-hotkey-status', () => ({ accelerator: registeredHotkey, configured: settings.assistantHotkey }));
  ipcMain.handle('search-suggestions', async (_event, query) => {
    if (typeof query !== 'string' || query.length > 512 || !query.trim()) return [];
    return new Promise(resolve => {
      const req=https.get('https://suggestqueries.google.com/complete/search?client=chrome&q='+encodeURIComponent(query),res=>{
        let data=''; res.on('data',chunk=>{ data+=chunk; if(data.length>65536)req.destroy(); });
        res.on('error',()=>resolve([])); res.on('end',()=>{try{const values=JSON.parse(data)[1];resolve(Array.isArray(values)?values.filter(v=>typeof v==='string').slice(0,4):[]);}catch{resolve([]);}});
      }); req.on('error',()=>resolve([])); req.setTimeout(3000,()=>{req.destroy();resolve([]);});
    });
  });
  ipcMain.handle('release-tts-file', async (_event, filename) => {
    if (!generatedTtsFiles.delete(filename)) return false;
    await fs.unlink(filename).catch(()=>{}); return true;
  });
  ipcMain.handle('get-notebook', () => notebook);
  ipcMain.handle('save-notebook', async (_event, value) => {
    if (!notebookWritable) return { success: false, error: 'Your Notebook could not be read safely. The original file has been kept; check it before saving changes.' };
    if (!validNotebook(value)) return { success: false, error: 'Invalid notebook data or maximum size exceeded.' };
    try {
      await atomicWriteFile(NOTEBOOK_FILE, JSON.stringify(value, null, 2));
      notebook = value;
      return { success: true };
    } catch (error) { return { success: false, error: 'Could not save your Notebook on this computer. Your changes are still here; check the data folder and try again.' }; }
  });
  ipcMain.handle('speech-diagnostics', async () => ({ environment: { arch: process.arch, os: os.release(),
    versions: process.versions, packaged: app.isPackaged, microphoneAccess: systemPreferences.getMediaAccessStatus('microphone') },
    audioDefaults: await new Promise(resolve => {
      execFile('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File',
        app.isPackaged ? path.join(process.resourcesPath, 'speech.ps1') : path.join(__dirname, 'speech.ps1'), '-Inventory'],
      { windowsHide: true, timeout: 5000, maxBuffer: 32768 }, (error, stdout) => {
        try { resolve(error ? { error: error.message } : JSON.parse(stdout)); }
        catch (_) { resolve({ error: 'Audio defaults could not be read.' }); }
      });
    }), capabilities: speech?.capabilities(), events: diagnosticEvents, logPath: diagnosticsFile }));
  ipcMain.handle('open-local-folder', async (_event, name) => {
    if (!['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos', 'home'].includes(name)) return { success: false, error: 'Unknown local folder.' };
    const error = await shell.openPath(app.getPath(name));
    return error ? { success: false, error } : { success: true };
  });

  ipcMain.handle("get-settings", async () => {
    const startupStatus = startup.status();
    return { ...settings, startupStatus, openAtLogin: startupStatus.supported && !startupStatus.error ? startupStatus.enabled : settings.openAtLogin };
  });

  ipcMain.handle('set-startup', async (_event, enabled) => {
    if (typeof enabled !== 'boolean') return { ...startup.status(), error: 'Invalid startup setting.' };
    return startup.change(enabled, saveSettings);
  });

  function validSettingsPatch(patch) {
    return patch && !Array.isArray(patch) && typeof patch === 'object' && Object.keys(patch).length > 0 &&
      Object.entries(patch).every(([key, value]) => Object.hasOwn(DEFAULT_SETTINGS, key) &&
        !['assistantHotkey', 'customActions', 'interfaceRelease', 'openAtLogin'].includes(key) &&
        typeof value === typeof DEFAULT_SETTINGS[key] && validateSettingValue(key, value));
  }
  async function setSettings(patch) {
    if (!validSettingsPatch(patch)) return { success: false, error: 'That setting could not be saved. Check the value and try again.' };
    const result = await saveSettings(patch);
    if (!result.success) return result;
    if (Object.hasOwn(patch, 'recognitionMode')) {
      await speech.engineChanged().catch(error => logSpeech('engine-change-failed', errorDetails(error)));
      mainWindow?.webContents.send('speech-force-stop');
    }
    if (Object.hasOwn(patch, 'heyCortana')) await speech.setWake(patch.heyCortana).catch(error => logSpeech('wake-toggle-failed', errorDetails(error)));
    if (Object.hasOwn(patch, 'isMovable')) {
      app.relaunch();
      app.quit();
    }
    return result;
  }
  ipcMain.handle('set-settings', (_event, patch) => setSettings(patch));
  ipcMain.handle('set-setting', (_event, { key, value } = {}) => setSettings({ [key]: value }));

  const MAX_CUSTOM_ACTIONS = 50;
const MAX_TRIGGER_LENGTH = 256;
const MAX_ACTION_COUNT_PER_SEQUENCE = 20;
const VALID_ACTION_TYPES = new Set(['speak', 'open_app', 'open_url', 'play_sound', 'run_command']);

// A single executable step inside a custom action sequence.
// Shape: { type, value }
function validateActionStep(step) {
  if (typeof step !== 'object' || step === null || Array.isArray(step)) return false;

  const allowedKeys = new Set(['type', 'value']);
  for (const key of Object.keys(step)) {
    if (!allowedKeys.has(key)) return false;
  }

  if (typeof step.type !== 'string') return false;
  if (!VALID_ACTION_TYPES.has(step.type)) return false;
  if (typeof step.value !== 'string' || !step.value.trim()) return false;

  if (step.type === 'open_url') {
    if (!step.value.startsWith('http:') && !step.value.startsWith('https:')) {
      return false;
    }
  } else if (step.type === 'open_app' || step.type === 'play_sound') {
    if (!isSafeFallbackAppName(step.value)) return false;
  } else if (step.type === 'run_command') {
    if (step.value.length > 4096) return false;
    if (hasControlChars(step.value)) return false;
  } else if (step.type === 'speak') {
    if (step.value.length > 4096) return false;
    if (hasControlChars(step.value)) return false;
  }

  return true;
}

// A single user-defined custom action.
// Shape: { trigger, actions: [ActionStep] }
function validateCustomAction(customAction) {
  if (typeof customAction !== 'object' || customAction === null || Array.isArray(customAction)) return false;

  const allowedKeys = new Set(['trigger', 'actions']);
  for (const key of Object.keys(customAction)) {
    if (!allowedKeys.has(key)) return false;
  }

  if (typeof customAction.trigger !== 'string') return false;
  if (customAction.trigger.trim().length === 0) return false;
  if (customAction.trigger.length > MAX_TRIGGER_LENGTH) return false;
  if (hasControlChars(customAction.trigger)) return false;

  if (!Array.isArray(customAction.actions)) return false;
  if (customAction.actions.length === 0) return false;
  if (customAction.actions.length > MAX_ACTION_COUNT_PER_SEQUENCE) return false;

  for (const step of customAction.actions) {
    if (!validateActionStep(step)) return false;
  }

  return true;
}

function validateCustomActions(actions) {
  if (!Array.isArray(actions)) return false;
  if (actions.length === 0) return true;
  if (actions.length > MAX_CUSTOM_ACTIONS) return false;

  for (const action of actions) {
    if (!validateCustomAction(action)) return false;
  }
  return true;
}

ipcMain.handle("set-custom-actions", async (event, actions) => {
    if (!validateCustomActions(actions)) {
      return { success: false, error: 'Invalid custom actions format.' };
    }
    return await saveSettings({ customActions: actions });
  });

  ipcMain.handle('reset-all-settings', () => mutateReminders(async () => {
    const previousSettings = settings;
    const previousReminders = reminders;
    // Keep the same reset scope: settings, actions and reminders; never Notebook or installed voices.
    const saved = await saveSettings({ ...DEFAULT_SETTINGS, firstRunComplete: settings.firstRunComplete, customActions: [] }, true);
    if (!saved.success) return saved;
    try {
      await saveReminders([]);
      reminders = [];
    } catch (error) {
      reminders = previousReminders;
      const restored = await saveSettings(previousSettings, true);
      return { success: false, error: restored.success
        ? 'Could not reset reminders. Your settings and reminders have been kept. Check the data folder and try again.'
        : 'The reset could not finish. Reminders have been kept, but some settings may have changed. Check the data folder before trying again.' };
    }
    previousReminders.forEach(clearReminderTimeout);
    await speech.setWake(false).catch(error => logSpeech('reset-wake-stop-failed', errorDetails(error)));
    registerAssistantHotkey('');
    app.relaunch();
    app.quit();
    return { success: true };
  }));

  ipcMain.handle("find-application", async (event, query) => {
    const queryLower = query.toLowerCase();
    const matchingApps = [];

    for (const [name, appPath] of applicationCache.entries()) {
      if (name.toLowerCase().includes(queryLower)) {
        matchingApps.push({ name, path: appPath });
      }
    }
    return matchingApps;
  });

  ipcMain.handle("search-applications", async (event, query) => {
    const queryLower = query.toLowerCase();
    const matchingAppNames = [];

    for (const [name] of applicationCache.entries()) {
      if (name.toLowerCase().includes(queryLower)) {
        matchingAppNames.push(name);
        if (matchingAppNames.length >= 5) break;
      }
    }
    return matchingAppNames;
  });

  ipcMain.handle("search-files", async (event, query) => {
    if (settings.useEverythingSearch) {
      try {
        const port = settings.everythingPort || 80;
        const results = await queryEverything(query, port);
        if (results && results.results) {
          return results.results.map(r => ({
            name: r.name,
            path: r.path ? path.join(r.path, r.name) : r.name,
          }));
        }
      } catch (_) {}
    }
    const results = [];
    const queryLower = query.toLowerCase();
    const searchFolders = [
      path.join(os.homedir(), "Documents"),
      path.join(os.homedir(), "Desktop"),
      path.join(os.homedir(), "Downloads"),
    ];
    for (const folder of searchFolders) {
      try {
        const entries = await fs.readdir(folder, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.toLowerCase().includes(queryLower)) {
            results.push({ name: entry.name, path: path.join(folder, entry.name) });
          }
        }
      } catch (_) {}
    }
    return results.slice(0, 10);
  });

  ipcMain.handle("check-everything", async () => {
    try {
      const port = settings.everythingPort || 80;
      await queryEverything("test", port);
      return true;
    } catch (_) {
      return false;
    }
  });

  function queryEverything(query, port) {
    return new Promise((resolve, reject) => {
      // Validate port - must be a valid port number
      const effectivePort = port && Number.isInteger(port) && port > 0 && port <= 65535 ? port : 80;
      // Limit query length, then build the query from the truncated value
      const safeQuery =
        typeof query === 'string'
          ? query.slice(0, 256)
          : '';
      const encodedQuery = encodeURIComponent(safeQuery);
      const urlPath = `/?search=${encodedQuery}&json=1&count=10&path_column=1&sort=date_modified&ascending=0`;
      // Everything Search must remain limited to loopback hosts
      const options = {
        hostname: "localhost",
        port: effectivePort,
        path: urlPath,
        method: "GET",
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          // Limit response size
          if ((data += chunk).length > 1_000_000) {
            req.destroy();
            reject(new Error('Everything response was too large.'));
            return;
          }
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on("error", reject);
      // Add request timeout
      req.setTimeout(2000, () => {
        req.destroy();
        reject(new Error('Everything request timed out.'));
      });
      req.end();
    });
  }

  ipcMain.handle(
  'open-application-fallback',
  async (event, appName) => {
    if (!isSafeFallbackAppName(appName)) {
      return {
        success: false,
        error: 'Invalid application name.',
      };
    }

    const target = appName.trim();
    if (!/^[a-z0-9_.-]+(?:\.exe)?$/i.test(target)) return { success: false, error: 'Choose a Start Menu application, configured shortcut, or executable name.' };
    return new Promise(resolve => {
      const child = spawn(target, [], { windowsHide: false, shell: false, detached: true, stdio: 'ignore' });
      child.once('error', () => resolve({ success: false, error: 'Application could not be opened.' }));
      child.once('spawn', () => { child.unref(); resolve({ success: true }); });
    });
  });

  ipcMain.on("open-external-link", (event, url) => {
    const validated = validateExternalUrl(url);
    if (!validated) {
      console.warn('[open-external-link] Rejected invalid URL:', url);
      return;
    }
    shell.openExternal(validated).catch((err) => {
      console.error(`Failed to open external link ${validated}:`, err);
    });
  });

  const MAX_PATH_LENGTH = 4096;
  ipcMain.handle('open-action-url', async (_event, url) => {
    const validated = validateExternalUrl(url);
    if (!validated) return { success: false };
    try { await shell.openExternal(validated); return { success: true }; }
    catch (_) { return { success: false }; }
  });
  ipcMain.handle('open-action-path', async (_event, filename) => {
    if (typeof filename !== 'string' || filename.length > MAX_PATH_LENGTH || isPathControlValue(filename)) return { success: false };
    try { return { success: !(await shell.openPath(path.resolve(filename))) }; }
    catch (_) { return { success: false }; }
  });

function isPathControlValue(fsPath) {
  return !fsPath || /[\0-\x1f\x7f]/.test(fsPath);
}

ipcMain.on("open-path", (event, fsPath, failureCommand) => {
    if (typeof fsPath !== 'string' || !fsPath.trim() || fsPath.length > MAX_PATH_LENGTH) {
      return;
    }
    if (isPathControlValue(fsPath)) {
      console.warn('[open-path] Rejected path with control characters');
      return;
    }
    const normalizedPath = path.resolve(fsPath);
    shell.openPath(normalizedPath).then((result) => {
      if (result) {
        console.error(`Failed to open path ${normalizedPath}:`, result);
        if (failureCommand === 'open-application' && !event.sender.isDestroyed()) {
          event.sender.send('command-failed', { command: 'open-application' });
        }
      }
    }).catch((err) => {
      console.error(`Failed to open path ${normalizedPath}:`, err);
      if (failureCommand === 'open-application' && !event.sender.isDestroyed()) {
        event.sender.send('command-failed', { command: 'open-application' });
      }
    });
  });

  const MAX_COMMAND_LENGTH = 4096;

function hasControlChars(str) {
  return /[\0-\x1f\x7f]/.test(str);
}

ipcMain.handle('run-action-command', (_event, command) => {
  if (typeof command !== 'string' || !command.trim() || command.length > MAX_COMMAND_LENGTH || hasControlChars(command)) {
    return { success: false, error: 'Check the command in this action.' };
  }
  return new Promise(resolve => exec(command, { windowsHide: true }, error => resolve(error
    ? { success: false, error: 'Windows could not complete this command. Check it in Settings.' }
    : { success: true })));
});

ipcMain.on("run-command", (event, command) => {
    if (typeof command !== 'string' || !command.trim() || command.length > MAX_COMMAND_LENGTH || hasControlChars(command)) {
      return;
    }
    exec(command, (error) => {
      if (error) {
        console.error(`Failed to execute command "${command}":`, error);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("command-failed", {
            command: "run-command",
          });
        }
      }
    });
  });

  const MS_SETTINGS_URI_WHITELIST = new Set([
  'ms-settings:display',
  'ms-settings:sound',
  'ms-settings:notifications',
  'ms-settings:quiethours',
  'ms-settings:powersleep',
  'ms-settings:battery',
  'ms-settings:storagesense',
  'ms-settings:tabletmode',
  'ms-settings:multitasking',
  'ms-settings:clipboard',
  'ms-settings:bluetooth',
  'ms-settings:printers',
  'ms-settings:mousetouchpad',
  'ms-settings:devices-touchpad',
  'ms-settings:typing',
  'ms-settings:pen',
  'ms-settings:autoplay',
  'ms-settings:',
  'ms-settings:usb',
  'ms-settings:network',
  'ms-settings:network-wifi',
  'ms-settings:network-ethernet',
  'ms-settings:network-vpn',
  'ms-settings:network-airplanemode',
  'ms-settings:network-mobilehotspot',
  'ms-settings:datausage',
  'ms-settings:network-proxy',
  'ms-settings:personalization',
  'ms-settings:personalization-background',
  'ms-settings:personalization-colors',
  'ms-settings:lockscreen',
  'ms-settings:themes',
  'ms-settings:fonts',
  'ms-settings:personalization-start',
  'ms-settings:taskbar',
  'ms-settings:appsfeatures',
  'ms-settings:defaultapps',
  'ms-settings:maps',
  'ms-settings:videoplayback',
  'ms-settings:accounts',
  'ms-settings:yourinfo',
  'ms-settings:emailandaccounts',
  'ms-settings:signinoptions',
  'ms-settings:workplace',
  'ms-settings:otherusers',
  'ms-settings:dateandtime',
  'ms-settings:regionlanguage',
  'ms-settings:speech',
  'ms-settings:gaming-gamebar',
  'ms-settings:gaming-gamedvr',
  'ms-settings:gaming-gamemode',
  'ms-settings:easeofaccess',
  'ms-settings:easeofaccess-narrator',
  'ms-settings:easeofaccess-magnifier',
  'ms-settings:easeofaccess-highcontrast',
  'ms-settings:easeofaccess-closedcaptioning',
  'ms-settings:easeofaccess-keyboard',
  'ms-settings:cortana',
  'ms-settings:search',
  'ms-settings:privacy',
  'ms-settings:privacy-microphone',
  'ms-settings:windowsupdate',
  'ms-settings:backup',
  'ms-settings:troubleshoot',
  'ms-settings:recovery',
  'ms-settings:about',
]);

ipcMain.on("run-special-command", (event, command) => {
    if (typeof command !== 'string' || !command.trim() || command.length > 4096) {
      return;
    }

    if (command.startsWith('ms-settings:')) {
      if (MS_SETTINGS_URI_WHITELIST.has(command)) {
        shell.openExternal(command).catch((err) => {
          console.error(`Failed to open URI ${command}:`, err);
          if (!event.sender.isDestroyed()) event.sender.send('command-failed', { command: 'open-application' });
        });
      } else {
        console.warn('[run-special-command] Rejected unrecognized ms-settings: URI:', command);
      }
      return;
    }

    const knownCommands = [
      'control',
      'taskmgr',
      'cmd',
      'powershell',
      'notepad',
      'calc',
      'mspaint',
      'snippingtool',
      'explorer',
    ];

    const parts = command.trim().split(/\s+/);
    const baseCommand = parts[0].toLowerCase();
    if (knownCommands.includes(baseCommand)) {
      const args = parts.slice(1).filter((arg) => arg && !/[\0-\x1f\x7f]/.test(arg));
      const child = spawn(baseCommand, args, {
        windowsHide: true,
        detached: false,
        shell: false,
      });
      child.on('error', (error) => {
        console.error(`Failed to execute special command "${command}":`, error);
        if (!event.sender.isDestroyed()) event.sender.send('command-failed', { command: 'open-application' });
      });
      return;
    }

    console.warn('[run-special-command] Rejected unknown command:', command);
  });

  const SHOW_DIALOG_OPERATIONS = {
  reminderAudio: { properties: ['openFile'], filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'aac'] }] },
  application: { properties: ['openFile'], filters: [{ name: 'Applications', extensions: ['exe', 'lnk'] }] },
  default: { properties: ['openFile'], filters: [{ name: 'Files', extensions: ['*'] }] },
};

ipcMain.handle("show-open-dialog", async (event, operation) => {
    if (!mainWindow) return;

    let options;
    if (typeof operation === 'string' && operation) {
      // New-style operation key validated against the allowlist
      options = SHOW_DIALOG_OPERATIONS[operation] || SHOW_DIALOG_OPERATIONS.default;
    } else if (operation && typeof operation === 'object' && !Array.isArray(operation)) {
      // Legacy object form from the pre-context-isolation renderer.
      // Constrain to safe openFile-only dialogs.
      options = {
        properties: Array.isArray(operation.properties)
          ? operation.properties.filter((p) => p === 'openFile')
          : ['openFile'],
        filters: Array.isArray(operation.filters)
          ? operation.filters.filter(
              (f) => f && typeof f === 'object' && Array.isArray(f.extensions) && f.extensions.length <= 20
            )
          : [],
      };
    } else {
      options = SHOW_DIALOG_OPERATIONS.default;
    }

    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  });

  ipcMain.handle('set-reminder', (event, payload) => mutateReminders(async () => {
    try {
      const validation = validateReminderInput(payload || {});
      if (!validation.success) return validation;

      const newReminder = {
        id: crypto.randomUUID(),
        ...validation.value,
        timeout: null,
      };

      const next = [...reminders, newReminder];
      await saveReminders(next);
      reminders = next;
      scheduleReminder(newReminder);

      return {
        success: true,
        reminder: {
          id: newReminder.id,
          text: newReminder.text,
          time: newReminder.time,
          sound: newReminder.sound,
          recurrence: newReminder.recurrence,
        },
      };
    } catch (error) {
      console.error('Failed to create reminder:', error);
      return {
        success: false,
        error: 'The reminder could not be saved.',
      };
    }
  }));

  ipcMain.handle('start-timer', (_event,payload)=>timers.start(payload));
  ipcMain.handle('cancel-timer', (_event,id)=>timers.cancel(id));
  ipcMain.handle('get-timers', ()=>timers.list());
  ipcMain.handle('get-active-timer', ()=>timers.list().at(-1)||{id:null,label:'',remaining:0,active:false,endTime:0});
  ipcMain.handle('get-timer-remaining', (_event,id)=>timers.list().find(t=>t.id===id)||{remaining:0,active:false});

  ipcMain.handle(
    "update-reminder",
    (event, { id, reminder, reminderTime, sound, recurrence }) => mutateReminders(async () => {
      const reminderIndex = reminders.findIndex((r) => r.id === id);
      if (reminderIndex === -1) {
        return { success: false, error: 'Reminder not found.' };
      }

      const validation = validateReminderInput({ reminder, reminderTime, sound, recurrence });
      if (!validation.success) return validation;

      const existingReminder = reminders[reminderIndex];
      const updatedReminder = {
        ...existingReminder,
        text: validation.value.text,
        time: validation.value.time,
        sound: validation.value.sound,
        recurrence: validation.value.recurrence,
        recurrenceClock: existingReminder.recurrence===validation.value.recurrence&&existingReminder.time===validation.value.time
          ? existingReminder.recurrenceClock : validation.value.recurrenceClock,
        timeout: null,
      };
      const next = reminders.map(item => item === existingReminder ? updatedReminder : item);

      try {
        await saveReminders(next);
        clearReminderTimeout(existingReminder);
        reminders = next;
        scheduleReminder(updatedReminder);
      } catch (error) {
        console.error('Failed to update reminder:', error);
        return { success: false, error: 'The reminder could not be updated.' };
      }

      return {
        success: true,
        reminder: {
          id: updatedReminder.id,
          text: updatedReminder.text,
          time: updatedReminder.time,
          sound: updatedReminder.sound,
          recurrence: updatedReminder.recurrence,
        },
      };
    })
  );

  ipcMain.handle('remove-reminder', (_event, id) => mutateReminders(async () => {
    const index = reminders.findIndex(reminder => reminder.id === id);
    if (index < 0) return { success: false, error: 'That reminder is no longer in the list.' };
    const removed = reminders[index];
    const next = reminders.filter(item => item !== removed);
    try {
      await saveReminders(next);
      reminders = next;
      clearReminderTimeout(removed);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Could not delete this reminder. It is still scheduled. Try again.' };
    }
  }));

  ipcMain.handle("get-reminders", () => {
    return reminders.map(({ id, text, time, sound, recurrence }) => ({ id, text, time, sound, recurrence }));
  });

  ipcMain.handle("get-app-version", () => {
    return APP_VERSION;
  });

  ipcMain.handle("check-for-updates", async () => {
    return await checkForUpdates();
  });

  ipcMain.handle('open-update-release', async () => {
    if (!verifiedReleaseUrl) return { success: false, error: 'Check for updates again before opening the release.' };
    try { await shell.openExternal(verifiedReleaseUrl); return { success: true }; }
    catch (_) { return { success: false, error: 'Could not open your browser. Try again.' }; }
  });

  ipcMain.handle("eva-voice-status", () => {
    return getEvaVoiceStatus();
  });

  ipcMain.on("install-eva-voice", () => {
    shell.openExternal(
      "https://1drv.ms/u/c/cc24422cfecfe7e7/IQBWS7LMFWNHQZS1ZtcdaJTBAVTi4FJjAT7PFbGEfIdZiYk?e=GsGtIg"
    );
  });

  const regionAliases = {
    // US states
    al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas",
    ca: "California", co: "Colorado", ct: "Connecticut", de: "Delaware",
    fl: "Florida", ga: "Georgia", hi: "Hawaii", id: "Idaho",
    il: "Illinois", in: "Indiana", ia: "Iowa", ks: "Kansas",
    ky: "Kentucky", la: "Louisiana", me: "Maine", md: "Maryland",
    ma: "Massachusetts", mi: "Michigan", mn: "Minnesota", ms: "Mississippi",
    mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada",
    nh: "New Hampshire", nj: "New Jersey", nm: "New Mexico",
    ny: "New York", nc: "North Carolina", nd: "North Dakota",
    oh: "Ohio", ok: "Oklahoma", or: "Oregon", pa: "Pennsylvania",
    ri: "Rhode Island", sc: "South Carolina", sd: "South Dakota",
    tn: "Tennessee", tx: "Texas", ut: "Utah", vt: "Vermont",
    va: "Virginia", wa: "Washington", wv: "West Virginia",
    wi: "Wisconsin", wy: "Wyoming",
    // Canadian provinces
    ab: "Alberta", bc: "British Columbia", mb: "Manitoba",
    nb: "New Brunswick", nl: "Newfoundland and Labrador",
    ns: "Nova Scotia", nt: "Northwest Territories", nu: "Nunavut",
    on: "Ontario", pe: "Prince Edward Island", qc: "Quebec",
    sk: "Saskatchewan", yt: "Yukon",
    // Country aliases
    uk: "United Kingdom", usa: "United States of America",
    "us": "United States of America",
  };

  ipcMain.handle("get-time-for-location", async (event, cityInput, format) => {
    try {
      const parts = cityInput
        .trim()
        .replace(/[?!.]+$/, '')
        .split(",")
        .map((s) => s.trim());
      const cityName = parts[0];
      const regionFilters = parts.slice(1).map(region => regionAliases[region.toLowerCase()] || region);

      const matches = cityTimezones.lookupViaCity(cityName);
      if (!matches || matches.length === 0) {
        throw new Error(`Could not find timezone for city: ${cityInput}`);
      }

      let filtered = matches;
      if (regionFilters.length) {
        filtered = matches.filter(
          (m) => regionFilters.every(region => {
            const lowerRegion = region.toLowerCase();
            return !!lowerRegion && (
            (m.province && m.province.toLowerCase().includes(lowerRegion)) ||
            m.country.toLowerCase().includes(lowerRegion));
          })
        );
        if (filtered.length === 0) {
          throw new Error(`Could not find a matching region for city: ${cityInput}`);
        }
      }

      if (filtered.length > 1) {
        return {
          ambiguous: true,
          options: filtered.map((m) => ({
            city: m.city,
            province: m.province || "",
            country: m.country,
            timezone: m.timezone,
            fullQuery: m.province
              ? `${m.city}, ${m.province}, ${m.country}`
              : `${m.city}, ${m.country}`,
          })),
        };
      }

      const match = filtered[0];
      const now = new Date();
      const formattedTime = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: format !== "24",
        timeZone: match.timezone,
      });

      return {
        city: match.city,
        country: match.country,
        timeZone: match.timezone,
        time: formattedTime,
      };
    } catch (error) {
      console.error(`Time lookup failed for "${cityInput}":`, error);
      throw new Error(`Failed to get time for ${cityInput}`);
    }
  });

  ipcMain.handle("get-edge-voices", async () => {
    return [
      { ShortName: "en-US-JennyNeural", FriendlyName: "Jenny (English, US)", Gender: "Female" },
      { ShortName: "en-US-GuyNeural", FriendlyName: "Guy (English, US)", Gender: "Male" },
      { ShortName: "en-US-AriaNeural", FriendlyName: "Aria (English, US)", Gender: "Female" },
      { ShortName: "en-US-AndrewNeural", FriendlyName: "Andrew (English, US)", Gender: "Male" },
      { ShortName: "en-US-EmmaNeural", FriendlyName: "Emma (English, US)", Gender: "Female" },
      { ShortName: "en-US-BrianNeural", FriendlyName: "Brian (English, US)", Gender: "Male" },
      { ShortName: "en-US-ChristopherNeural", FriendlyName: "Christopher (English, US)", Gender: "Male" },
      { ShortName: "en-US-EricNeural", FriendlyName: "Eric (English, US)", Gender: "Male" },
      { ShortName: "en-US-MichelleNeural", FriendlyName: "Michelle (English, US)", Gender: "Female" },
      { ShortName: "en-GB-SoniaNeural", FriendlyName: "Sonia (English, UK)", Gender: "Female" },
      { ShortName: "en-GB-RyanNeural", FriendlyName: "Ryan (English, UK)", Gender: "Male" },
      { ShortName: "en-AU-NatashaNeural", FriendlyName: "Natasha (English, AU)", Gender: "Female" },
      { ShortName: "en-AU-WilliamNeural", FriendlyName: "William (English, AU)", Gender: "Male" },
      { ShortName: "en-IE-ConnorNeural", FriendlyName: "Connor (English, IE)", Gender: "Male" },
      { ShortName: "en-IN-NeerjaNeural", FriendlyName: "Neerja (English, IN)", Gender: "Female" },
      { ShortName: "en-IN-PrabhatNeural", FriendlyName: "Prabhat (English, IN)", Gender: "Male" },
    ];
  });

  const MAX_TTS_TEXT_LENGTH = 4096;
const VALID_TTS_VOICES = [
  "en-US-JennyNeural",
  "en-US-GuyNeural",
  "en-US-AriaNeural",
  "en-US-AndrewNeural",
  "en-US-EmmaNeural",
  "en-US-BrianNeural",
  "en-US-ChristopherNeural",
  "en-US-EricNeural",
  "en-US-MichelleNeural",
  "en-GB-SoniaNeural",
  "en-GB-RyanNeural",
  "en-AU-NatashaNeural",
  "en-AU-WilliamNeural",
  "en-IE-ConnorNeural",
  "en-IN-NeerjaNeural",
  "en-IN-PrabhatNeural",
];

ipcMain.handle("synthesize-edge-tts", async (event, { text, voice, pitch, rate }) => {
    try {
      // Validate text
      if (typeof text !== 'string' || !text.trim()) {
        return { success: false, error: 'Text must be a non-empty string.' };
      }
      if (text.length > MAX_TTS_TEXT_LENGTH) {
        return { success: false, error: `Text exceeds maximum length of ${MAX_TTS_TEXT_LENGTH} characters.` };
      }

      // Validate voice
      if (typeof voice !== 'string' || !VALID_TTS_VOICES.includes(voice)) {
        return { success: false, error: `Invalid voice. Supported voices: ${VALID_TTS_VOICES.join(', ')}` };
      }

      // Validate pitch
      if (typeof pitch !== 'number' || !Number.isFinite(pitch) || pitch < 0.1 || pitch > 2.0) {
        return { success: false, error: 'Pitch must be between 0.1 and 2.0.' };
      }

      // Validate rate
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0.1 || rate > 2.0) {
        return { success: false, error: 'Rate must be between 0.1 and 2.0.' };
      }

      const tempDir = os.tmpdir();
      const outFile = path.join(tempDir, `cortana-tts-${crypto.randomUUID()}.mp3`);

      const pitchVal = Math.round((pitch - 1) * 100);
      const pitchStr = pitch !== undefined && pitch !== 1
        ? `${pitchVal > 0 ? '+' : ''}${pitchVal}%`
        : "default";

      const rateVal = Math.round((rate - 1) * 100);
      const rateStr = rate !== undefined && rate !== 1
        ? `${rateVal > 0 ? '+' : ''}${rateVal}%`
        : "default";

      const tts = new EdgeTTS({
        voice: voice,
        lang: voice.split("-").slice(0, 2).join("-"),
        outputFormat: "audio-24khz-96kbitrate-mono-mp3",
        pitch: pitchStr,
        rate: rateStr,
      });
      await tts.ttsPromise(text, outFile);

      generatedTtsFiles.add(outFile);
      return { success: true, filePath: outFile };
    } catch (error) {
      console.error("Edge TTS synthesis failed:", error);
      logSpeech('edge-tts-failed', errorDetails(error));
      return { success: false, error: error.message };
    }
  });

  const media=createMedia({
    dispose:value=>{if(value)try{require(app.isPackaged?path.join(__dirname,'.winapp','bindings','lifetime'):'#winapp/bindings/lifetime').releaseProjected(value);}catch(error){console.error('Media resource release failed:',error.message);}},
    getManager:async()=>{
      const runtime=require('@microsoft/dynwinrt');
      try{runtime.roInitialize(0);}catch(error){if(!/80010106|changed.*mode/i.test(error.message))throw error;runtime.roInitialize(1);}
      const {GlobalSystemMediaTransportControlsSessionManager}=require(app.isPackaged?path.join(__dirname,'.winapp','bindings'):'#winapp/bindings');
      return GlobalSystemMediaTransportControlsSessionManager.requestAsync(AbortSignal.timeout(5000));
    },
    volume:(action,level)=>new Promise(resolve=>{
      const script=app.isPackaged?path.join(process.resourcesPath,'media.ps1'):path.join(__dirname,'media.ps1');
      const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Action',action];
      if(action==='setvolume')args.push('-Level',String(level));
      execFile('powershell.exe',args,{windowsHide:true,timeout:10000,maxBuffer:32768},(error,stdout)=>{
        try{resolve(JSON.parse(stdout));}catch{resolve({success:false,error:'Windows could not access the default playback device.'});}
      });
    }),
  });
  ipcMain.handle('media-control',(_event,payload)=>media.control(payload));
  ipcMain.handle('media-state',()=>media.state());

  ipcMain.handle("wikipedia-lookup", async (event, query) => {
    try {
      const ua = `Cortana/${APP_VERSION} (https://github.com/SoftBluey/Cortana-Electron)`;
      const fetchJson = (url) => new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { "User-Agent": ua } }, (res) => {
          // Validate HTTP status code - follow only redirects we expect
          if (res.statusCode !== 200 && res.statusCode !== 302) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            // Do not follow redirects automatically - let the caller handle
            if (res.statusCode === 302) {
              reject(new Error('Wikipedia redirect received - unexpected response'));
              return;
            }
            try { resolve(JSON.parse(data)); } catch(e) { reject(new Error("Invalid JSON response")); }
          });
        });
        req.on("error", reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error("Timeout")); });
      });

      const searchData = await fetchJson(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&redirects=resolve`
      );

      const pageTitle = Array.isArray(searchData) && searchData[1] && searchData[1][0];
      if (!pageTitle) return { success: false, error: `No Wikipedia article found for "${query}".` };

      const extractData = await fetchJson(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&redirects=1`
      );

      if (!extractData || !extractData.query || !extractData.query.pages) {
        return { success: false, error: "Could not retrieve article content." };
      }

      const pages = extractData.query.pages;
      const page = pages[Object.keys(pages)[0]];
      if (!page || !page.extract) return { success: false, error: "Could not extract article content." };

      let extract = page.extract;
      if (extract.length > 600) {
        extract = extract.substring(0, extract.lastIndexOf(" ", 600)) + "...";
      }

      return { success: true, title: page.title, extract, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}` };
    } catch (error) {
      console.error("Wikipedia lookup failed:", error);
      return { success: false, error: 'Could not load Wikipedia. Check your connection and try again.' };
    }
  });

  ipcMain.handle("create-calendar-event", async (event, { title, dateTime }) => {
    try {
      const startDate = new Date(dateTime);
      if (!Number.isFinite(startDate.getTime())) {
        return { success: false, error: 'Invalid date/time.' };
      }
      const endDate = new Date(startDate.getTime() + 60 * 60000);
      const pad = (n) => n.toString().padStart(2, "0");
      const fmt = (d) =>
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

      const safeTitle = escapeIcsText(title);

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Cortana-Electron//EN",
        "BEGIN:VEVENT",
        `DTSTART:${fmt(startDate)}`,
        `DTEND:${fmt(endDate)}`,
        `SUMMARY:${safeTitle}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      const icsPath = path.join(os.tmpdir(), `cortana-event-${Date.now()}.ics`);
      await fs.writeFile(icsPath, ics);
      const openError = await shell.openPath(icsPath);
      setTimeout(() => {
        fs.unlink(icsPath).catch((err) => {
          console.warn('[calendar] Failed to clean up ICS file:', err.message);
        });
      }, 5000);
      return openError ? { success: false, error: 'Could not open the calendar file. Choose a calendar app in Windows and try again.' } : { success: true };
    } catch (error) {
      console.error("Failed to create calendar event:", error);
      return { success: false, error: 'Could not prepare this calendar event. Try again.' };
    }
  });
}

function createWindow() {
  let initialColor = settings.themeColor || '#0078d7';
  if (settings.useWindowsAccent) {
    try { initialColor = normalizeAccentColor(systemPreferences.getAccentColor()) || initialColor; } catch (_) {}
  }
  const presentation = { themeColor: initialColor, useWindowsAccent: settings.useWindowsAccent,
    firstRunComplete: settings.firstRunComplete,
    isMovable: settings.isMovable, idleGreetingMode: settings.idleGreetingMode,
    specificIdleGreeting: settings.specificIdleGreeting, customIdleGreeting: settings.customIdleGreeting,
    name: notebook.profile?.name || '' };
  const winOptions = {
    width: winWidth,
    height: winHeight,
    icon: iconPath,
    frame: settings.isMovable,
    transparent: !settings.isMovable,
    resizable: settings.isMovable,
    alwaysOnTop: !settings.isMovable,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: true,
      additionalArguments: ['--cortana-presentation=' + JSON.stringify(presentation)],
    },
  };

  if (!settings.isMovable) {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const { x, y, height: screenHeight } = display.workArea;
    winOptions.x = x;
    winOptions.y = y + screenHeight - winHeight;
  }

  mainWindow = new BrowserWindow({
    ...winOptions,
  });
  if (settings.isMovable) {
    mainWindow.setMenu(null);
  }

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Cortana", click: showWindow },
    {
      label: "Settings",
      click: () => {
        if (mainWindow) {
          showWindow();
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send("show-settings-ui");
          }
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("Cortana");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isVisible() ? closeApp() : showWindow();
    }
  });

  const handleBlur = () => {
    if (isSettingsVisible || settings.isMovable) {
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    closeApp();
  };

  mainWindow.on("blur", handleBlur);
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      if (!mainWindow.isVisible() && !settings.closeToTray) { app.isQuitting = true; app.quit(); return; }
      closeApp();
    }
  });

  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safe = validateExternalUrl(url);
    if (safe) shell.openExternal(safe);
    return { action: 'deny' };
  });
  mainWindow.on('hide', () => {
    mainWindow.webContents.send('window-visibility', false);
    mainWindow.webContents.send('speech-force-stop');
    cancelManualSpeech();
  });
  mainWindow.on('show', () => mainWindow.webContents.send('window-visibility', true));
  mainWindow.on('focus', () => mainWindow.webContents.send('window-focus', true));
  mainWindow.on('blur', () => mainWindow.webContents.send('window-focus', false));
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logSpeech('renderer-gone', details);
    speech?.setSpeaking(false).catch(() => {});
    cancelManualSpeech();
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    if (settings.useWindowsAccent) {
      try {
        const accent = normalizeAccentColor(systemPreferences.getAccentColor());
        if (accent) mainWindow.webContents.send('accent-color-updated', accent);
      } catch (_) {}
    }
  });
  let nativeReady = false, rendererReady = false, started = false;
  const showWhenReady = () => {
    if (started || !nativeReady || !rendererReady) return;
    started = true;
    if (!isSilentStart) showWindow();
    setTimeout(() => {
      if (app.isQuitting) return;
      speech.initialize();
      speech.setWake(settings.heyCortana).catch(error => logSpeech('wake-startup-failed', errorDetails(error)));
    }, 500);
  };
  const onRendererReady = event => {
    if (event.sender !== mainWindow.webContents) return;
    rendererReady = true; showWhenReady();
  };
  ipcMain.on('renderer-ready', onRendererReady);
  mainWindow.once('closed', () => ipcMain.removeListener('renderer-ready', onRendererReady));
  mainWindow.on('ready-to-show', () => { nativeReady = true; showWhenReady(); });
}
