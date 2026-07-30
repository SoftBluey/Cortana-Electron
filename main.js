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
} = require("electron");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs/promises");
const fssync = require("fs");
const cityTimezones = require("city-timezones");
const { EdgeTTS } = require("node-edge-tts");
const os = require("os");

let updateAvailable = false;
const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/SoftBluey/Cortana-Electron/refs/heads/main/package.json";

const APP_ID = "com.blueysoft.cortana-electron";

let mainWindow;
const winWidth = 360;
const winHeight = 640;
let isSettingsVisible = false;
let tray = null;
let isClosing = false;

let applicationCache = new Map();

let reminders = [];

let settings = {
  openAtLogin: true,
  preferredVoice: "Microsoft Zira Desktop",
  searchEngine: "bing",
  themeColor: "#0078d7",
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
  openaiApiKey: "",
  aiEnabled: false,
  aiSystemPrompt: "You are Cortana, Microsoft's virtual assistant. Be helpful, concise, and friendly. Keep responses brief and conversational. Do not use markdown formatting.",
  aiModel: "gpt-4o-mini",
  aiApiUrl: "https://api.openai.com/v1/chat/completions",
  useEverythingSearch: false,
  everythingPort: 80,
};
let SETTINGS_FILE;
let REMINDERS_FILE;
let iconPath;

const isSilentStart = process.argv.includes("--hidden");

let gotTheLock;

const scheduleReminder = (reminderData) => {
  const timeInMs = new Date(reminderData.time).getTime() - Date.now();
  if (timeInMs > 0) {
    const timeout = setTimeout(() => {
      if (Notification.isSupported()) {
        new Notification({
          title: `⏰ Reminder`,
          body: `It's time for: ${reminderData.text}`,
          icon: iconPath,
        }).show();
      }
      
      // Play reminder sound if mainWindow exists
      // Since there's no UI to set individual reminder sounds, always use the global setting
      if (mainWindow && !mainWindow.isDestroyed()) {
        const soundFile = settings.reminderSound || "notify.wav";
        mainWindow.webContents.send("play-reminder-sound", soundFile);
      }
      
      // remove the fired reminder
      reminders = reminders.filter((r) => r.id !== reminderData.id);
      saveReminders();
    }, timeInMs);
    return timeout;
  }
  return null;
};

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
    const data = await fs.readFile(REMINDERS_FILE, "utf-8");
    const loadedReminders = JSON.parse(data);
    reminders = loadedReminders
      .map((r) => {
        const timeout = scheduleReminder(r);
        return { ...r, timeout };
      })
      .filter((r) => r.timeout !== null);
    await saveReminders();
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to load reminders:", error);
    }
    reminders = [];
  }
}

async function loadSettings() {
  try {
    let data = await fs.readFile(SETTINGS_FILE, "utf-8");

    // Gracefully handle trailing data after valid JSON (common file corruption).
    // Walk backwards from the last '}' until JSON.parse succeeds.
    let parsed;
    let bracePos = data.length;
    while (true) {
      bracePos = data.lastIndexOf("}", bracePos - 1);
      if (bracePos === -1) break;
      try {
        parsed = JSON.parse(data.slice(0, bracePos + 1));
        break;
      } catch (_) {}
    }
    if (!parsed) parsed = JSON.parse(data);
    
    // Validate that parsed data is an object
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Settings file contains invalid data');
    }
    
    settings = { ...settings, ...parsed };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to load settings, using defaults:", error);
      // If settings file is corrupted, back it up and create new one
      if (error instanceof SyntaxError || error.message === 'Settings file contains invalid data') {
        try {
          const backupFile = SETTINGS_FILE + '.backup';
          await fs.copyFile(SETTINGS_FILE, backupFile);
          console.log(`Corrupted settings backed up to ${backupFile}`);
        } catch (backupError) {
          console.error("Failed to backup corrupted settings:", backupError);
        }
      }
    }
    await saveSettings();
  }
}

function compareVersions(v1, v2) {
  const v1Parts = v1.split(".").map(Number);
  const v2Parts = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  return 0;
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

async function saveSettings() {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

// Initialize app when ready
const sendAppVersion = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentVersion = app.getVersion();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-status", {
        currentVersion: currentVersion,
      });
    }
  }
};

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
  gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    app.quit();
    return;
  }
  
  // Handle second instance
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      showWindow();
    }
  });
  
  const assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "assets");
  iconPath = path.join(assetsPath, "icon.ico");

  await loadSettings();
  await loadReminders();
  await scanApplications();

  registerIpcHandlers();

  app.setLoginItemSettings({
    openAtLogin: settings.openAtLogin,
    args: ["--hidden"],
  })
  
  createWindow();

  // Check for updates in the background
  sendAppVersion();
});

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
      mainWindow.webContents.send("trigger-enter-animation");
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
    for (const app of appsInFolder) {
      if (!applicationCache.has(app.name)) {
        applicationCache.set(app.name, app.path);
      }
    }
  }
  console.log(`Scanned and cached ${applicationCache.size} applications.`);
}

function fetchDuckDuckGoResults(query) {
  return new Promise((resolve, reject) => {
    const postData = `q=${encodeURIComponent(query)}`;
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
      let data = "";
      res.on("data", (chunk) => (data += chunk));
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
  mainWindow.webContents.send("go-idle-and-close");
}

function registerIpcHandlers() {
  ipcMain.on("hide-window", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    isClosing = false;
  });

  ipcMain.on("close-app", closeApp);
  ipcMain.on("open-external-link", (event, url) => {
    shell.openExternal(url);
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
    const apiKey = settings.openaiApiKey;
    let apiUrl = settings.aiApiUrl || "https://api.openai.com/v1/chat/completions";
    const model = settings.aiModel || "gpt-4o-mini";
    const systemPrompt = settings.aiSystemPrompt || "You are a helpful assistant. Be concise and conversational.";

    try {
      const urlObj = new URL(apiUrl);
      let path = urlObj.pathname.replace(/\/+$/, "");
      if (!path.endsWith("chat/completions")) {
        path = path.replace(/\/v1\/?$/, "");
        path += "/v1/chat/completions";
        apiUrl = urlObj.origin + path + urlObj.search;
      }
    } catch (_) {
      // Invalid URL, will be caught again below
    }

    const isLocal = !apiUrl.includes("openai.com") && !apiUrl.includes("api.openai.com");
    if (!apiKey && !isLocal) {
      return { success: false, error: "No API key configured. Add your key in Settings > AI." };
    }
    try {
      const urlObj = new URL(apiUrl);
      const transport = urlObj.protocol === "https:" ? https : http;
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        max_tokens: 500,
      });
      const headers = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      const data = await new Promise((resolve, reject) => {
        const req = transport.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: "POST",
            headers,
          },
          (res) => {
            let responseData = "";
            res.on("data", (chunk) => (responseData += chunk));
            res.on("end", () => {
              try {
                resolve(JSON.parse(responseData));
              } catch (e) {
                reject(new Error("Invalid response from API"));
              }
            });
          }
        );
        req.on("error", reject);
        req.write(body);
        req.end();
      });
      if (data.choices && data.choices[0]) {
        return { success: true, text: data.choices[0].message.content.trim() };
      }
      return { success: false, error: data.error?.message || "No response from API" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-settings", async () => {
    return settings;
  });

  ipcMain.on("set-setting", async (event, { key, value }) => {
    if (key in settings) {
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
    }
  });

  ipcMain.on("set-custom-actions", async (event, actions) => {
    if (Array.isArray(actions)) {
      settings.customActions = actions;
      await saveSettings();
    }
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
      const encodedQuery = encodeURIComponent(query);
      const urlPath = `/?search=${encodedQuery}&json=1&count=10&path_column=1&sort=date_modified&ascending=0`;
      const req = http.request(
        { hostname: "localhost", port: port || 80, path: urlPath, method: "GET" },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.setTimeout(2000, () => { req.destroy(); reject(new Error("Timeout")); });
      req.end();
    });
  }

  ipcMain.handle("open-application-fallback", async (event, appName) => {
    const sanitizedAppName = appName.replace(/"/g, "");
    return new Promise((resolve) => {
      exec(`start "" "${sanitizedAppName}"`, (error) => {
        if (error) {
          console.error(`Fallback failed to open app ${appName}:`, error);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("command-failed", {
              command: "open-application",
            });
          }
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  });

  ipcMain.on("open-path", (event, fsPath) => {
    shell.openPath(fsPath).catch((err) => {
      console.error(`Failed to open path ${fsPath}:`, err);
    });
  });

  ipcMain.on("run-command", (event, command) => {
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

  ipcMain.on("run-special-command", (event, command) => {
    if (command.startsWith('ms-')) {
      shell.openExternal(command).catch((err) => {
        console.error(`Failed to open URI ${command}:`, err);
      });
    } else {
      exec(`start "" "${command}"`, (error) => {
        if (error) {
          console.error(`Failed to execute special command "${command}":`, error);
        }
      });
    }
  });

  ipcMain.handle("show-open-dialog", async (event, options) => {
    if (!mainWindow) return;
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  });

  ipcMain.on("set-reminder", async (event, { reminder, reminderTime, sound }) => {
    const newReminder = {
      id: crypto.randomUUID(),
      text: reminder,
      time: reminderTime,
      sound: sound,
      timeout: null,
    };
    newReminder.timeout = scheduleReminder(newReminder);
    if (newReminder.timeout) {
      reminders.push(newReminder);
      await saveReminders();
    }
  });

  ipcMain.on(
    "update-reminder",
    async (event, { id, reminder, reminderTime, sound }) => {
      const reminderIndex = reminders.findIndex((r) => r.id === id);
      if (reminderIndex !== -1) {
        const existingReminder = reminders[reminderIndex];
        if (existingReminder.timeout) clearTimeout(existingReminder.timeout);

        const updatedReminder = {
          ...existingReminder,
          text: reminder,
          time: reminderTime,
          sound: sound,
        };

        updatedReminder.timeout = scheduleReminder(updatedReminder);
        if (updatedReminder.timeout) {
          reminders[reminderIndex] = updatedReminder;
        } else {
          reminders.splice(reminderIndex, 1);
        }

        await saveReminders();
      }
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

  ipcMain.on("set-settings-visibility", (event, visible) => {
    isSettingsVisible = visible;
  });

  ipcMain.handle("get-time-for-location", async (event, cityInput, format) => {
    return new Promise((resolve, reject) => {
      try {
        const matches = cityTimezones.lookupViaCity(cityInput.trim());
        if (!matches || matches.length === 0) {
          return reject(
            new Error(`Could not find timezone for city: ${cityInput}`)
          );
        }

        const timezone = matches[0].timezone;
        const url = `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(
          timezone
        )}`;

        const request = https
          .get(url, (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              return reject(
                new Error(`Time API returned status ${res.statusCode}`)
              );
            }

            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => {
              try {
                const jsonData = JSON.parse(data);
                if (!jsonData.dateTime) {
                  return reject(new Error("Missing dateTime in API response"));
                }
                const dateTime = new Date(jsonData.dateTime);
                const formattedTime = dateTime.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: format !== "24",
                });

                resolve({
                  city: matches[0].city,
                  country: matches[0].country,
                  timeZone: timezone,
                  time: formattedTime,
                });
              } catch (parseError) {
                console.error(
                  `Time lookup failed for "${cityInput}" (parsing):`,
                  parseError
                );
                reject(new Error(`Failed to parse time data for ${cityInput}`));
              }
            });
          })
          .on("error", (err) => {
            console.error(
              `Time lookup failed for "${cityInput}" (network):`,
              err
            );
            reject(new Error(`Failed to get time for ${cityInput}`));
          });
          
        request.setTimeout(10000, () => {
          request.destroy();
          reject(new Error(`Request timeout for ${cityInput}`));
        });
      } catch (error) {
        console.error(`Time lookup failed for "${cityInput}" (setup):`, error);
        reject(new Error(`Failed to get time for ${cityInput}`));
      }
    });
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

  ipcMain.handle("synthesize-edge-tts", async (event, { text, voice, pitch, rate }) => {
    try {
      const tempDir = os.tmpdir();
      const outFile = path.join(tempDir, `cortana-tts-${Date.now()}.mp3`);

      const pitchStr = pitch !== undefined && pitch !== 1
        ? `${Math.round((pitch - 1) * 100)}%`
        : "default";
      const rateStr = rate !== undefined && rate !== 1
        ? `${Math.round((rate - 1) * 100)}%`
        : "default";

      const tts = new EdgeTTS({
        voice: voice || "en-US-JennyNeural",
        lang: (voice || "en-US-JennyNeural").split("-").slice(0, 2).join("-"),
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
}

function createWindow() {
  const winOptions = {
    width: winWidth,
    height: winHeight,
    frame: settings.isMovable,
    transparent: !settings.isMovable,
    resizable: settings.isMovable,
    alwaysOnTop: !settings.isMovable,
    focusable: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  };

  if (!settings.isMovable) {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const { x, y, height: screenHeight } = display.workArea;
    winOptions.x = x;
    winOptions.y = y + screenHeight - winHeight;
  }

  mainWindow = new BrowserWindow(winOptions);
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
  mainWindow.on("ready-to-show", () => {
    if (!isSilentStart) {
      showWindow();
    }
  });
}
