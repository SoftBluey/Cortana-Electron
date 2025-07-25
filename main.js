const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
const winWidth = 360;
let isWebViewVisible = false;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, height: screenHeight } = primaryDisplay.workArea;

  const winHeight = 640;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: x,
    y: screenHeight - winHeight,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
    },
  });

  const closeApp = () => {
    mainWindow.webContents.send('start-close-animation');
    setTimeout(() => app.quit(), 400);
  };

  const handleBlur = () => {
    if (!mainWindow || mainWindow.isDestroyed() || isWebViewVisible) {
      return;
    }
    closeApp();
  };
  
  mainWindow.on('blur', handleBlur);
  
  ipcMain.on('close-app', closeApp);

  ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeListener('blur', handleBlur);
        closeApp();
    }
  });

  ipcMain.on('set-webview-visibility', (event, visible) => {
    isWebViewVisible = visible;
  });

  ipcMain.on('media-pause', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('execute-webview-pause');
    }
  });

  ipcMain.on('media-play', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('execute-webview-play');
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('trigger-enter-animation');
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});