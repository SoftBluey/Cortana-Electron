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
} = require("electron");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { exec, spawn, execSync } = require("child_process");
const fs = require("fs/promises");
const fssync = require("fs");
const cityTimezones = require("city-timezones");
const { EdgeTTS } = require("node-edge-tts");
const os = require("os");

let updateAvailable = false;
const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/SoftBluey/Cortana-Electron/refs/heads/main/package.json";

const APP_ID = "com.blueysoft.cortana-electron";

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') { /* ignore broken pipe from WASM debug logs */ }
});

let mainWindow;
let speechRecognizer = null;
let wakeEnabled = false;
let wakeRunning = false;
let wakeRecognizer = null;
let wakeRestartTimer = null;
let wakeRetryAttempt = 0;
let wakeGeneration = 0;

const speechState = {
  recognizer: null,
  queryRecognizer: null,
  process: null,
  starting: false,
  cancelled: false,
  generation: 0,
};

function stopSapiFallback() {
  const processToStop = speechState.process;
  speechState.process = null;

  if (processToStop) {
    try {
      processToStop.kill();
    } catch (_) {}
  }
}

function startSapiFallback(generation) {
  if (speechState.process || speechState.cancelled) return false;

  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'speech.ps1')
    : path.join(__dirname, 'speech.ps1');

  const ps = spawn('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
  ], {
    windowsHide: true,
  });

  speechState.process = ps;
  let buffer = '';

  ps.stdout.on('data', (data) => {
    if (
      speechState.cancelled ||
      generation !== speechState.generation ||
      speechState.process !== ps
    ) {
      return;
    }

    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;

      if (text === 'READY') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('speech-ready');
        }
      } else if (text.startsWith('FINAL:')) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('speech-result', {
            final: true,
            text: text.substring(6).trim(),
          });
        }
      } else if (text.startsWith('ERROR:')) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            'speech-error',
            text.substring(6).trim()
          );
        }
        stopSapiFallback();
      } else if (text.startsWith('ENGINE:')) {
        console.log('[speech]', text);
      }
    }
  });

  ps.stderr.on('data', (data) => {
    if (!speechState.cancelled) {
      console.error('[speech:SAPI]', data.toString().trim());
    }
  });

  ps.on('error', (error) => {
    if (
      !speechState.cancelled &&
      generation === speechState.generation
    ) {
      console.error('[speech:SAPI] Failed to start:', error.message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          'speech-error',
          'Speech recognition is unavailable. Try restarting the app.'
        );
      }
    }
  });

  ps.on('close', () => {
    if (speechState.process === ps) {
      speechState.process = null;
    }
  });

  return true;
}

function cancelManualSpeech({ stopFallback = true } = {}) {
  speechState.cancelled = true;
  speechState.generation += 1;
  speechState.starting = false;

  const recognizer = speechState.recognizer;
  speechState.recognizer = null;

  if (recognizer) {
    try {
      recognizer.close();
    } catch (_) {}
  }

  const queryRecognizer = speechState.queryRecognizer;
  speechState.queryRecognizer = null;

  if (queryRecognizer) {
    try {
      queryRecognizer.close();
    } catch (_) {}
  }

  if (stopFallback) {
    stopSapiFallback();
  }
}

const winWidth = 360;
const winHeight = 640;
let isSettingsVisible = false;
let tray = null;
let isClosing = false;
let lastHiddenTime = 0;

let applicationCache = new Map();
let lastAppScanTime = 0;

let reminders = [];

let activeTimer = null;
let timerIdCounter = 0;

const DEFAULT_SETTINGS = {
  openAtLogin: true,
  preferredVoice: "Microsoft Zira Desktop",
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
  everythingPort: 80,
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

function normalizeAccentColor(raw) {
  if (!raw) return null;
  // getAccentColor() returns RRGGBBAA (8 hex chars, no #)
  // Strip the alpha channel and prepend #
  const hex = raw.replace(/^#/, '');
  return '#' + hex.substring(0, 6);
}

const EVA_TTS_DIR = "C:\\Windows\\Speech_OneCore\\Engines\\TTS\\en-US";
const EVA_REG_TOKEN = "MSTTS_V110_enUS_EvaM";
const EVA_TOKEN_PATH = `HKLM\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\${EVA_REG_TOKEN}`;

function getEvaVoiceStatus() {
  let registryPresent = false;
  try {
    const out = execSync(`reg query "${EVA_TOKEN_PATH}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
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

function validateReminderInput({ reminder, reminderTime, sound }) {
  if (typeof reminder !== 'string' || !reminder.trim()) {
    return { success: false, error: 'Please enter something to be reminded about.' };
  }

  if (typeof reminderTime !== 'string') {
    return { success: false, error: 'Please choose a valid reminder time.' };
  }

  const timestamp = Date.parse(reminderTime);
  if (!Number.isFinite(timestamp)) {
    return { success: false, error: 'Please choose a valid reminder time.' };
  }

  if (timestamp <= Date.now()) {
    return { success: false, error: 'Reminder time must be in the future.' };
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
  if (!reminders.some((item) => item.id === reminder.id)) {
    return;
  }

  clearReminderTimeout(reminder);

  if (Notification.isSupported()) {
    new Notification({
      title: '⏰ Reminder',
      body: `It's time for: ${reminder.text}`,
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

  reminders = reminders.filter((item) => item.id !== reminder.id);
  saveReminders();
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

async function saveReminders() {
  try {
    const remindersToSave = reminders.map(({ id, text, time, sound }) => ({
      id,
      text,
      time,
      sound,
    }));
    await fs.writeFile(
      REMINDERS_FILE,
      JSON.stringify(remindersToSave, null, 2)
    );
  } catch (error) {
    console.error("Failed to save reminders:", error);
  }
}

async function loadReminders() {
  try {
    const data = await fs.readFile(REMINDERS_FILE, 'utf8');
    const parsed = JSON.parse(data);

    if (!Array.isArray(parsed)) {
      throw new Error('Reminder file must contain an array');
    }

    const now = Date.now();

    reminders = parsed
      .filter((item) => {
        return (
          item &&
          typeof item.id === 'string' &&
          typeof item.text === 'string' &&
          item.text.trim() &&
          typeof item.time === 'string' &&
          Number.isFinite(Date.parse(item.time)) &&
          Date.parse(item.time) > now
        );
      })
      .map((item) => ({
        id: item.id,
        text: item.text.trim(),
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

    await saveReminders();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to load reminders:', error);
    }
    reminders = [];
  }
}

const VALID_ENUMS = {
  searchEngine: ['bing', 'duckduckgo', 'google', 'brave', 'ecosia'],
  ttsEngine: ['edge', 'system'],
  timeFormat: ['12', '24'],
  weatherUnits: ['metric', 'imperial'],
  idleGreetingMode: ['random', 'specific', 'custom'],
  aiProvider: ['', 'openai', 'ollama', 'lmstudio', 'groq', 'together', 'openrouter', 'perplexity', 'xai', 'mistral', 'google-gemini', 'deepseek', 'custom'],
};

function validateSettingValue(key, value) {
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

function atomicWriteFile(filePath, data) {
  const tempPath = filePath + '.tmp.' + Date.now() + '.' + crypto.randomUUID().slice(0, 8);
  return fs.writeFile(tempPath, data).then(() => {
    return fs.rename(tempPath, filePath);
  }).catch((err) => {
    try { fssync.unlinkSync(tempPath); } catch (_) {}
    throw err;
  });
}

function loadValidatedSettings(rawData) {
  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch (_) {
    return { success: false, error: 'Invalid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { success: false, error: 'Settings must be an object' };
  }

  // Validate each known key, ignore unknown keys
  const recovered = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (validateSettingValue(key, value)) {
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
    settings = restoreDefaults();
    await saveSettings();
    return;
  }

  // Handle empty file - treat as corrupt, back it up, restore defaults
  if (!data || data.trim() === '') {
    try {
      const backupName = generateUniqueBackupName(SETTINGS_FILE);
      await fs.copyFile(SETTINGS_FILE, backupName);
      console.log(`Empty/corrupt settings backed up to ${backupName}`);
    } catch (_) {}
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
    } catch (_) {}
    settings = restoreDefaults();
    await saveSettings();
    return;
  }

  // Valid settings - merge with defaults, preserving unknown keys behavior
  settings = { ...restoreDefaults(), ...validationResult.data };

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

async function saveSettings() {
  try {
    await atomicWriteFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

async function checkForUpdates() {
  try {
    const currentVersion = app.getVersion();

    const response = await new Promise((resolve, reject) => {
      https
        .get(GITHUB_RAW_URL, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Request failed with status ${res.statusCode}`));
            return;
          }

          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        })
        .on("error", reject);
    });

    const remotePackage = JSON.parse(response);
    const remoteVersion = remotePackage.version;

    updateAvailable = compareVersions(currentVersion, remoteVersion) < 0;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-status", {
        available: updateAvailable,
        currentVersion,
        remoteVersion,
      });
    }

    return { available: updateAvailable, currentVersion, remoteVersion };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return { available: false, error: error.message };
  }
}

const sendAppVersion = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentVersion = app.getVersion();
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
  
  assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "assets");
  iconPath = path.join(assetsPath, "icon.ico");

  await loadSettings();
  await loadReminders();

  powerMonitor.on('resume', async () => {
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

    await saveReminders();

    // Null out the WinRT recognizer so it is recreated fresh on next use
    if (speechRecognizer) {
      try { speechRecognizer.close(); } catch (_) {}
      speechRecognizer = null;
    }

    // Stop any stale SAPI process — it will restart on next mic press
    stopSapiFallback();

    // Restart Hey Cortana if it was enabled
    if (wakeEnabled) {
      if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null; }
      if (wakeRecognizer) {
        try {
          if (wakeRecognizer.continuousRecognitionSession) {
            try { await wakeRecognizer.continuousRecognitionSession.stopAsync(); } catch (_) {}
          }
          wakeRecognizer.close();
        } catch (_) {}
        wakeRecognizer = null;
      }
      wakeRunning = false;
      // Restart wake loop with fresh backoff
      startWakeLoop(0);
    } else if (wakeRunning && !wakeRecognizer) {
      // If Hey Cortana wasn't enabled but wakeRunning is stuck, reset it
      wakeRunning = false;
    }
  });

  systemPreferences.on('accent-color-changed', (event, newColor) => {
    if (mainWindow && !mainWindow.isDestroyed() && settings.useWindowsAccent) {
      const normalized = normalizeAccentColor(newColor);
      if (normalized) mainWindow.webContents.send('accent-color-updated', normalized);
    }
  });

  scanApplications();

  setInterval(() => {
    scanApplications();
  }, 30 * 60 * 1000); // rescan every 30 minutes

  let powerBlocker = null;

  registerIpcHandlers();

  app.setLoginItemSettings({
    openAtLogin: settings.openAtLogin,
    args: ["--hidden"],
  })

  onlineSpeechEnabled = await new Promise((resolve) => {
    const cmd = `reg query "HKCU\\Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy" /v HasAccepted`;
    exec(cmd, { timeout: 3000, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(/HasAccepted\s+REG_DWORD\s+0x1/i.test(stdout || ""));
    });
  });

  const bindingsPath = app.isPackaged
    ? path.join(__dirname, '.winapp', 'bindings')
    : '#winapp/bindings';
  let SpeechRecognizer, SpeechRecognitionTopicConstraint, SpeechRecognitionScenario;
  let winRTBindingsAvailable = false;
  try {
    const bindings = require(bindingsPath);
    SpeechRecognizer = bindings.SpeechRecognizer;
    SpeechRecognitionTopicConstraint = bindings.SpeechRecognitionTopicConstraint;
    SpeechRecognitionScenario = bindings.SpeechRecognitionScenario;
    winRTBindingsAvailable = true;
    console.log('[speech] WinRT bindings loaded successfully');
  } catch (err) {
    console.error('[speech] Failed to load WinRT bindings:', err.message);
    winRTBindingsAvailable = false;
  }

  // When WinRT bindings are unavailable, disable Hey Cortana and persist the setting
  if (!winRTBindingsAvailable) {
    wakeEnabled = false;
    settings.heyCortana = false;
    // Stop any powerSaveBlocker since Hey Cortana can't run
    if (powerBlocker) {
      require('electron').powerSaveBlocker.stop(powerBlocker);
      powerBlocker = null;
    }
    // Notify renderer of speech capabilities status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('speech-capabilities', { winRTAvailable: false, fallback: 'sapi' });
    }
  }

  ipcMain.on('speech-start', async () => {
    if (isSettingsVisible) {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('speech-force-stop');
      return;
    }

    if (speechState.starting || speechState.process) return;

    const generation = ++speechState.generation;
    speechState.cancelled = false;
    speechState.starting = true;

    try {
      if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null; }
      if (wakeRecognizer) {
        try { 
          if (wakeRecognizer.continuousRecognitionSession) {
            try { await wakeRecognizer.continuousRecognitionSession.stopAsync(); } catch (_) {}
          }
        } catch (_) {}
        try { wakeRecognizer.close(); } catch (_) {}
        wakeRecognizer = null;
        wakeRunning = false;
      }
      if (speechState.queryRecognizer) {
        try { speechState.queryRecognizer.close(); } catch (_) {}
        speechState.queryRecognizer = null;
      }
      if (speechState.recognizer) {
        try { speechState.recognizer.close(); } catch (_) {}
        speechState.recognizer = null;
      }

      // Check if WinRT bindings are available
      if (!SpeechRecognizer || !SpeechRecognitionTopicConstraint || !SpeechRecognitionScenario) {
        // Attempt SAPI fallback for manual voice recognition
        console.log('[speech] WinRT not available, attempting SAPI fallback');
        const started = startSapiFallback(generation);
        if (!started && !speechState.cancelled) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
              'speech-capabilities',
              { winRTAvailable: false, fallback: 'sapi unavailable' }
            );
          }
        }
        // Don't throw - allow SAPI fallback to handle it
        // If SAPI also fails, the error will be sent in startSapiFallback
        return;
      }

      try {
        const recognizer = new SpeechRecognizer();
        speechState.recognizer = recognizer;

        const constraint = new SpeechRecognitionTopicConstraint(
          SpeechRecognitionScenario.Dictation, 'dictation');
        recognizer.constraints.append(constraint);
        await recognizer.compileConstraintsAsync();

        if (
          speechState.cancelled ||
          generation !== speechState.generation
        ) {
          try {
            recognizer.close();
          } catch (_) {}
          return;
        }

        console.log('[speech] ENGINE:WinRT');
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('speech-ready');

        const result = await recognizer.recognizeAsync();

        if (
          speechState.cancelled ||
          generation !== speechState.generation
        ) {
          return;
        }

        const text = result && result.text;
        if (text && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('speech-result', { final: true, text });
        }
      } catch (e) {
        if (
          speechState.cancelled ||
          generation !== speechState.generation
        ) {
          return;
        }

        console.error('[speech] WinRT failed, attempting SAPI fallback:', e.message);

        const started = startSapiFallback(generation);
        if (!started && !speechState.cancelled) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
              'speech-error',
              'Speech recognition is unavailable. Try restarting the app.'
            );
          }
        }
      } finally {
        if (
          speechState.recognizer &&
          generation === speechState.generation
        ) {
          try {
            speechState.recognizer.close();
          } catch (_) {}
          speechState.recognizer = null;
        }

        if (generation === speechState.generation) {
          speechState.starting = false;
        }
      }
    } finally {
      if (speechState.starting && generation === speechState.generation) {
        speechState.starting = false;
      }
    }
  });

  ipcMain.on('speech-stop', () => {
    cancelManualSpeech({ stopFallback: true });
    if (wakeEnabled && !wakeRunning && !wakeRestartTimer && !isSettingsVisible) {
      wakeRestartTimer = setTimeout(() => {
        wakeRestartTimer = null;
        if (wakeEnabled && !isSettingsVisible) startWakeLoop(0);
      }, 500);
    }
  });

ipcMain.handle('get-speech-capabilities', async () => {
    return { winRTAvailable: !!winRTBindingsAvailable, fallback: winRTBindingsAvailable ? undefined : 'sapi' };
  });

  ipcMain.on('hey-cortana-toggle', async (event, enabled) => {
    wakeEnabled = enabled;
    if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null; }
    if (enabled) {
      if (!winRTBindingsAvailable) {
        console.warn('[hey-cortana] Hey Cortana cannot be enabled: WinRT bindings unavailable');
        wakeEnabled = false;
        settings.heyCortana = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('speech-capabilities', { winRTAvailable: false, fallback: 'sapi' });
          mainWindow.webContents.send('hey-cortana-status', { enabled: false, reason: 'WinRT bindings unavailable' });
        }
        if (powerBlocker) {
          require('electron').powerSaveBlocker.stop(powerBlocker);
          powerBlocker = null;
        }
        return;
      }
      if (!powerBlocker) powerBlocker = require('electron').powerSaveBlocker.start('prevent-app-suspension');
      if (!wakeRunning) startWakeLoop(0);
    }
    if (!enabled) {
      wakeRunning = false;
      if (wakeRecognizer) {
        try {
          if (wakeRecognizer.continuousRecognitionSession) {
            try {
              await wakeRecognizer.continuousRecognitionSession.stopAsync();
            } catch (_) {}
          }
        } catch (_) {}
        try { wakeRecognizer.close(); } catch (_) {}
      }
      wakeRecognizer = null;
      if (powerBlocker) {
        require('electron').powerSaveBlocker.stop(powerBlocker);
        powerBlocker = null;
      }
    }
  });

async function startWakeLoop(backoff = 0) {
    if (wakeRunning) return;
    if (isSettingsVisible) return;
    if (speechState.starting || speechState.recognizer || speechState.process) {
      console.log('[wake] Deferring: manual speech active.');
      return;
    }

    // Use generation token to prevent stale restarts.
    // The module-scope wakeGeneration counter is bumped whenever the wake
    // context is invalidated (disable, settings, suspend, quit), so callbacks
    // compare against it to detect stale generations.
    const token = ++wakeGeneration;

    // Check if WinRT bindings are available
    if (!SpeechRecognizer || !SpeechRecognitionTopicConstraint || !SpeechRecognitionScenario) {
      console.warn('[wake] WinRT bindings not available, cannot start wake loop');
      wakeRunning = false;
      wakeRetryAttempt = 0; // Reset retry attempt when bindings unavailable
      // Notify renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('speech-capabilities', { winRTAvailable: false, fallback: 'sapi' });
      }
      return;
    }

    wakeRunning = true;
    wakeRetryAttempt = 0; // Reset retry attempt on healthy session start
    let wakeTriggered = false;
    let rec = null;
    let completionStatus = null;

    let sessionEndedResolve = null;
    const sessionEndedPromise = new Promise(resolve => { sessionEndedResolve = resolve; });

    try {
      rec = new SpeechRecognizer();
      wakeRecognizer = rec;

      const constraint = new SpeechRecognitionTopicConstraint(
        SpeechRecognitionScenario.Dictation, 'dictation'
      );
      rec.constraints.append(constraint);
      await rec.compileConstraintsAsync();

      const session = rec.continuousRecognitionSession;

      session.onResultGenerated(async (sender, args) => {
        // Verify generation token to prevent stale callbacks
        if (wakeGeneration !== token) return;
        if (!wakeRunning || wakeTriggered) return;
        let text = '';
        try {
          text = (args.result && args.result.text || '').toLowerCase().trim();
        } catch (_) {}
        if (!text.includes('cortana')) return;
        if (isSettingsVisible) return;

        wakeTriggered = true;
        wakeRunning = false;
        console.log('[wake] Wake word detected:', text);

        try { await session.stopAsync(); } catch (_) {}
        sessionEndedResolve();

        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isVisible()) {
            mainWindow.webContents.send('wake-listen');
          } else {
            mainWindow.webContents.send('wake-slim');
            if (settings.useWindowsAccent) {
              try {
                const accent = normalizeAccentColor(systemPreferences.getAccentColor());
                if (accent) mainWindow.webContents.send('accent-color-updated', accent);
              } catch (_) {}
            }
            showWindow();
          }
        }

        try { rec.close(); } catch (_) {}
        rec = null;
        wakeRecognizer = null;

        if (mainWindow && !mainWindow.isDestroyed()) {
          let qr = null;
          try {
            qr = new SpeechRecognizer();
            speechState.queryRecognizer = qr;
            qr.constraints.append(new SpeechRecognitionTopicConstraint(
              SpeechRecognitionScenario.Dictation, 'dictation'));
            await qr.compileConstraintsAsync();
            const qres = await qr.recognizeAsync();
            const qtext = qres && qres.text;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('speech-result',
                { final: true, text: qtext || '' });
            }
          } catch (e) {
            console.warn('[wake] Query recognition failed:', e.message);
          } finally {
            if (qr) { try { qr.close(); } catch (_) {} }
            if (speechState.queryRecognizer === qr) speechState.queryRecognizer = null;
          }
        }

        if (wakeEnabled && !wakeRestartTimer && !isSettingsVisible) {
          wakeRestartTimer = setTimeout(() => {
            // Verify generation token before restarting
            if (wakeGeneration === token && wakeEnabled && !isSettingsVisible) {
              wakeRestartTimer = null;
              startWakeLoop(0);
            }
          }, 1000);
        }
      });

      session.onCompleted((sender, args) => {
        if (wakeTriggered) return;
        // Verify generation token
        if (wakeGeneration !== token) return;
        completionStatus = (args && args.status != null) ? args.status : null;
        console.warn('[wake] ContinuousRecognitionSession ended (status ' + completionStatus + ')');
        wakeRunning = false;
        sessionEndedResolve();
      });

      console.log('[wake] Starting continuous recognition session...');
      await session.startAsync();
      backoff = 0;
      console.log('[wake] Continuous session active — listening for Hey Cortana.');

      await sessionEndedPromise;

      if (!wakeTriggered) {
        try { await session.stopAsync(); } catch (_) {}
      }

    } catch (outerErr) {
      wakeRunning = false;
      completionStatus = 'error';
      console.error('[wake] Fatal wake loop error:', outerErr.message || outerErr);
      // Increment retry attempt on failure
      wakeRetryAttempt++;
      const delay = Math.min(500 * Math.pow(2, wakeRetryAttempt), 30000);
      console.warn('[wake] Session failed; retrying in ' + delay + 'ms (attempt ' + wakeRetryAttempt + ')');
      if (wakeEnabled && !wakeRestartTimer) {
        wakeRestartTimer = setTimeout(() => {
          // Verify generation token before retry
          if (wakeGeneration === token) {
            wakeRestartTimer = null;
            startWakeLoop(backoff);
          }
        }, delay);
      }
    } finally {
      // Only reset running state if this session wasn't replaced by a newer generation
      if (wakeGeneration === token) {
        if (rec) { try { rec.close(); } catch (_) {} }
        if (wakeRecognizer === rec) wakeRecognizer = null;
      }
    }

    // Expected session end: short restart delay only if wake is still enabled
    // and manual recognition/settings are inactive
    if (wakeEnabled && !wakeRestartTimer && !wakeTriggered
        && !speechState.starting && !speechState.recognizer && !speechState.process
        && !isSettingsVisible) {
      console.log('[wake] Expected session end; restarting in 1000ms');
      wakeRestartTimer = setTimeout(() => {
        wakeRestartTimer = null;
        // Verify generation token before restarting
        if (wakeGeneration === token) {
          startWakeLoop(0);
        }
      }, 1000);
    }
  }

  app.on('before-quit', () => {
    app.isQuitting = true;
    wakeRunning = false;
    cancelManualSpeech({ stopFallback: true });
    // Stop any powerSaveBlocker
    if (powerBlocker) {
      require('electron').powerSaveBlocker.stop(powerBlocker);
      powerBlocker = null;
    }
    // Notify renderer to cancel any ongoing speech synthesis
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('speech-force-stop');
    }
    // Clear wake restart timer
    if (wakeRestartTimer) {
      clearTimeout(wakeRestartTimer);
      wakeRestartTimer = null;
    }
    // Stop and close the recognizer/session
    if (wakeRecognizer) {
      if (wakeRecognizer.continuousRecognitionSession) {
        (async () => { try { await wakeRecognizer.continuousRecognitionSession.stopAsync(); } catch (_) {} })();
      }
      try { wakeRecognizer.close(); } catch (_) {}
      wakeRecognizer = null;
    }
    wakeRunning = false;
    // Clear reminder and timer timeouts
    reminders.forEach((reminder) => {
      if (reminder.timeout) clearTimeout(reminder.timeout);
    });
    // Clear active timer
    if (activeTimer) {
      clearTimeout(activeTimer.timeout);
      activeTimer = null;
    }
    // Destroy the tray
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  ipcMain.on("set-settings-visibility", (event, visible) => {
    isSettingsVisible = visible;
    if (visible) {
      cancelManualSpeech({ stopFallback: true });
      if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null; }
if (wakeRecognizer) {
        wakeRunning = false;
        try { wakeRecognizer.close(); } catch (_) {}
        wakeRecognizer = null;
      }
      stopSapiFallback();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('speech-force-stop');
      }
    } else if (wakeEnabled) {
      if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null; }
      if (!wakeRunning) startWakeLoop(0);
    }
  });

  createWindow();

  if (settings.heyCortana) {
    wakeEnabled = true;
    setTimeout(() => {
      if (!wakeRunning) startWakeLoop(0);
    }, 3000);
  }

  sendAppVersion();
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
  lastHiddenTime = Date.now();
  mainWindow.webContents.send("go-idle-and-close");
}

function registerIpcHandlers() {
  ipcMain.on("get-is-packaged", (event) => {
    event.returnValue = app.isPackaged;
  });

  ipcMain.on("hide-window", () => {
    cancelManualSpeech({ stopFallback: true });
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
    const systemPrompt = settings.aiSystemPrompt || "You are a helpful assistant. Be concise and conversational.";

    if (typeof model !== 'string' || !model.trim()) {
      return { success: false, error: 'Invalid model.' };
    }
    if (typeof systemPrompt !== 'string') {
      return { success: false, error: 'Invalid system prompt.' };
    }

    let urlObj;
    try {
      urlObj = new URL(apiUrl);
      let path = urlObj.pathname.replace(/\/+$/, "");
      if (!path.endsWith("chat/completions")) {
        path = path.replace(/\/v1\/?$/, "");
        path += "/v1/chat/completions";
        apiUrl = urlObj.origin + path + urlObj.search;
        urlObj = new URL(apiUrl);
      }
    } catch (_) {
      return { success: false, error: 'Invalid AI API URL.' };
    }

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { success: false, error: 'AI API URL must use http or https.' };
    }

    const isLocal = !apiUrl.includes("openai.com") && !apiUrl.includes("api.openai.com");
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

        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
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
            let responseData = '';
            let responseBytes = 0;

            res.on('data', (chunk) => {
              responseBytes += chunk.length;

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
                const providerMessage =
                  parsed &&
                  parsed.error &&
                  typeof parsed.error.message === 'string'
                    ? parsed.error.message
                    : `AI provider returned HTTP ${res.statusCode}.`;

                finish(reject, new Error(providerMessage));
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
        typeof data.choices[0].message.content === 'string'
      ) {
        return { success: true, text: data.choices[0].message.content.trim() };
      }

      return { success: false, error: 'AI provider returned an unexpected response format.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-settings", async () => {
    return settings;
  });

  ipcMain.on("set-setting", async (event, { key, value }) => {
    if (!key) return;

    // Handle known enum keys using shared validation
    if (key in VALID_ENUMS) {
      if (!validateSettingValue(key, value)) {
        console.warn(`[set-setting] Invalid value for ${key}:`, value);
        return;
      }
    } else if (key === 'openaiApiKey') {
      // Special: validate api key length and format
      if (typeof value !== 'string' || value.length > 512) {
        console.warn(`[set-setting] Invalid value for ${key}:`, value);
        return;
      }
      // Check for embedded credentials in URL style
      if (value.includes(':')) {
        const parts = value.split(':');
        if (parts[0].length <= 2) {
          console.warn(`[set-setting] Invalid value for ${key}: likely malformed key`, value);
          return;
        }
      }
    } else if (key === 'pitch') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 2.0) {
        console.warn(`[set-setting] Invalid value for ${key}:`, value);
        return;
      }
    } else if (key === 'rate') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 2.0) {
        console.warn(`[set-setting] Invalid value for ${key}:`, value);
        return;
      }
    } else if (key === 'reminderSound') {
      if (typeof value !== 'string') {
        console.warn(`[set-setting] Invalid value for ${key}:`, value);
        return;
      }
      const ext = value.split('.').pop().toLowerCase();
      if (ext && !['wav', 'mp3', 'ogg', 'm4a', 'aac'].includes(ext)) {
        console.warn(`[set-setting] Invalid value for ${key}: unsupported audio extension`, value);
        return;
      }
    } else {
      // For other keys, do basic type validation
      const expectedType = typeof settings[key];
      if (expectedType === 'undefined' || value === undefined) return;
      if (typeof value !== expectedType) {
        console.warn(`[set-setting] Invalid type for ${key}:`, value);
        return;
      }
    }

    settings[key] = value;
    if (key === "openAtLogin") {
      app.setLoginItemSettings({
        openAtLogin: value,
        args: ["--hidden"],
      });
    }
    if (key === "isMovable") {
      app.relaunch();
      app.exit();
    }
    await saveSettings();
  });

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
    settings.customActions = actions;
    await saveSettings();
    return { success: true };
  });

  ipcMain.on("reset-all-settings", async () => {
    try {
      reminders.forEach((reminder) => {
        if (reminder.timeout) clearTimeout(reminder.timeout);
      });
      reminders = [];
      settings.customActions = [];

      await fs.unlink(SETTINGS_FILE).catch((err) => {
        if (err.code !== "ENOENT") throw err;
      });
      await fs.unlink(REMINDERS_FILE).catch((err) => {
        if (err.code !== "ENOENT") throw err;
      });

      app.relaunch();
      app.exit();
    } catch (error) {
      console.error("Failed to reset all settings:", error);
    }
  });

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

    return await new Promise((resolve) => {
      const child = spawn(
        'cmd.exe',
        ['/d', '/s', '/c', 'start', '', target],
        {
          windowsHide: true,
          detached: false,
          shell: false,
        }
      );

      let finished = false;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        resolve(result);
      };

      child.on('error', (error) => {
        console.error(
          `Fallback failed to open app ${target}:`,
          error
        );

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('command-failed', {
            command: 'open-application',
          });
        }

        finish({
          success: false,
          error: 'Application could not be opened.',
        });
      });

      child.on('exit', (code) => {
        finish(
          code === 0
            ? { success: true }
            : {
                success: false,
                error: 'Application could not be opened.',
              }
        );
      });
    });
  }
);

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

function isPathControlValue(fsPath) {
  return !fsPath || /[\0-\x1f\x7f]/.test(fsPath);
}

ipcMain.on("open-path", (event, fsPath) => {
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
      }
    }).catch((err) => {
      console.error(`Failed to open path ${normalizedPath}:`, err);
    });
  });

  const MAX_COMMAND_LENGTH = 4096;

function hasControlChars(str) {
  return /[\0-\x1f\x7f]/.test(str);
}

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
  'ms-settings:autoPlay',
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

  ipcMain.handle('set-reminder', async (event, payload) => {
    try {
      const validation = validateReminderInput(payload || {});
      if (!validation.success) return validation;

      const newReminder = {
        id: crypto.randomUUID(),
        ...validation.value,
        timeout: null,
      };

      reminders.push(newReminder);

      try {
        await saveReminders();
        scheduleReminder(newReminder);
      } catch (error) {
        reminders = reminders.filter(
          (item) => item.id !== newReminder.id
        );
        clearReminderTimeout(newReminder);
        throw error;
      }

      return {
        success: true,
        reminder: {
          id: newReminder.id,
          text: newReminder.text,
          time: newReminder.time,
          sound: newReminder.sound,
        },
      };
    } catch (error) {
      console.error('Failed to create reminder:', error);
      return {
        success: false,
        error: 'The reminder could not be saved.',
      };
    }
  });

  ipcMain.handle('start-timer', (event, payload) => {
    const ms = payload && payload.ms;
    const label =
      payload && typeof payload.label === 'string'
        ? payload.label
        : '';

    const validation = validateTimerDuration(ms);
    if (!validation.success) return validation;

    // Reject creation of a second timer - only one timer is supported
    if (activeTimer) {
      return {
        success: false,
        error: 'A timer is already running. Cancel it before starting another.'
      };
    }

    const id = ++timerIdCounter;
    const endTime = Date.now() + ms;

    const timeout = setTimeout(() => {
      if (!activeTimer || activeTimer.id !== id) return;
      activeTimer = null;

      if (Notification.isSupported()) {
        new Notification({
          title: '⏰ Timer',
          body: label || "Time's up!",
          icon: path.join(assetsPath, 'cortana.png'),
        }).show();
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('timer-fired', { id, label });
      }
    }, ms);

    activeTimer = {
      id,
      timeout,
      endTime,
      durationMs: ms,
      label,
    };

    return {
      success: true,
      id,
      endTime,
    };
  });

  ipcMain.handle('cancel-timer', async (event, id) => {
    if (activeTimer && activeTimer.id === id) {
      clearTimeout(activeTimer.timeout);
      activeTimer = null;
      return { success: true };
    }
    return { success: false, error: 'Timer not found or already cancelled.' };
  });

  ipcMain.handle('get-active-timer', () => {
    if (!activeTimer) {
      return { id: null, label: '', remaining: 0, active: false, endTime: 0 };
    }
    const remaining = Math.max(0, activeTimer.endTime - Date.now());
    return {
      id: activeTimer.id,
      label: activeTimer.label,
      remaining: remaining,
      active: true,
      endTime: activeTimer.endTime,
    };
  });

  ipcMain.handle('get-timer-remaining', (event, id) => {
    if (!activeTimer || activeTimer.id !== id) {
      return { remaining: 0, active: false };
    }
    return { remaining: Math.max(0, activeTimer.endTime - Date.now()), active: true };
  });

  ipcMain.handle(
    "update-reminder",
    async (event, { id, reminder, reminderTime, sound }) => {
      const reminderIndex = reminders.findIndex((r) => r.id === id);
      if (reminderIndex === -1) {
        return { success: false, error: 'Reminder not found.' };
      }

      const validation = validateReminderInput({ reminder, reminderTime, sound });
      if (!validation.success) return validation;

      const existingReminder = reminders[reminderIndex];
      const originalReminder = { ...existingReminder };

      clearReminderTimeout(existingReminder);

      const updatedReminder = {
        ...existingReminder,
        text: validation.value.text,
        time: validation.value.time,
        sound: validation.value.sound,
      };

      reminders[reminderIndex] = updatedReminder;

      try {
        await saveReminders();
        scheduleReminder(updatedReminder);
      } catch (error) {
        reminders[reminderIndex] = originalReminder;
        clearReminderTimeout(updatedReminder);
        scheduleReminder(originalReminder);
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
        },
      };
    }
  );

  ipcMain.on("remove-reminder", async (event, id) => {
    const reminderIndex = reminders.findIndex((r) => r.id === id);
    if (reminderIndex !== -1) {
      clearTimeout(reminders[reminderIndex].timeout);
      reminders.splice(reminderIndex, 1);
      await saveReminders();
    }
  });

  ipcMain.handle("get-reminders", () => {
    return reminders.map(({ id, text, time, sound }) => ({ id, text, time, sound }));
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("check-for-updates", async () => {
    return await checkForUpdates();
  });

  ipcMain.on("open-github-releases", () => {
    shell.openExternal(
      "https://github.com/SoftBluey/Cortana-Electron/releases"
    );
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
        .split(",")
        .map((s) => s.trim());
      const cityName = parts[0];
      let regionFilter = parts.length > 1 ? parts.slice(1).join(", ") : null;

      // Expand abbreviations
      if (regionFilter) {
        const expanded = regionAliases[regionFilter.toLowerCase()];
        if (expanded) regionFilter = expanded;
      }

      const matches = cityTimezones.lookupViaCity(cityName);
      if (!matches || matches.length === 0) {
        throw new Error(`Could not find timezone for city: ${cityInput}`);
      }

      let filtered = matches;
      if (regionFilter) {
        const lowerRegion = regionFilter.toLowerCase();
        filtered = matches.filter(
          (m) =>
            (m.province && m.province.toLowerCase().includes(lowerRegion)) ||
            m.country.toLowerCase().includes(lowerRegion)
        );
        if (filtered.length === 0) {
          filtered = matches;
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
              ? `${m.city}, ${m.province}`
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

      return { success: true, filePath: outFile };
    } catch (error) {
      console.error("Edge TTS synthesis failed:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("media-control", async (event, action) => {
    const vkMap = {
      volup: 0xAF, voldown: 0xAE, mute: 0xAD,
      playpause: 0xB3, next: 0xB0, prev: 0xB1, stop: 0xB2,
    };
    const vk = vkMap[action];
    if (!vk) return { success: false, error: "Unknown action" };

    try {
      const psPath = path.join(os.tmpdir(), `cortana-key-${Date.now()}.ps1`);
      const psContent = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MediaKey {
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, int fl, int ex);
public static void Press(byte k) { keybd_event(k,0,0,0); System.Threading.Thread.Sleep(50); keybd_event(k,0,2,0); }
}
"@
[MediaKey]::Press(${vk})
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force
`;
      await fs.writeFile(psPath, psContent);
      return new Promise((resolve) => {
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, (error, stdout, stderr) => {
          if (error) console.error("media-control error:", stderr || error.message);
          resolve({ success: !error });
        });
      });
    } catch (e) {
      console.error("media-control setup error:", e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("wikipedia-lookup", async (event, query) => {
    try {
      const ua = `Cortana/${app.getVersion()} (https://github.com/SoftBluey/Cortana-Electron)`;
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
      return { success: false, error: error.message };
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
      await shell.openPath(icsPath);
      setTimeout(() => {
        fs.unlink(icsPath).catch((err) => {
          console.warn('[calendar] Failed to clean up ICS file:', err.message);
        });
      }, 5000);
      return { success: true };
    } catch (error) {
      console.error("Failed to create calendar event:", error);
      return { success: false, error: error.message };
    }
  });
}

function createWindow() {
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
      nodeIntegration: true,
      contextIsolation: false,
      // TODO: Complete context-isolation migration in a dedicated change.
      // renderer.js currently depends on Node APIs for GIF decoding,
      // filesystem asset loading, path handling, HTTPS suggestions, and audio cleanup.
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
      if (settings.isMovable) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      } else {
        closeApp();
      }
    }
  });

  mainWindow.loadFile("index.html");
  mainWindow.webContents.on('did-finish-load', () => {
    if (settings.useWindowsAccent) {
      try {
        const accent = normalizeAccentColor(systemPreferences.getAccentColor());
        if (accent) mainWindow.webContents.send('accent-color-updated', accent);
      } catch (_) {}
    }
  });
  mainWindow.on("ready-to-show", () => {
    if (!isSilentStart) {
      showWindow();
    }
  });
}
