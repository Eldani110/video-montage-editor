import { app, BrowserWindow, shell, Menu, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDesktopServer, DEFAULT_DESKTOP_PORT } from '../server/desktopServer.js';
import { setupAutoUpdater } from './updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Linux VA-API non-free driver for hardware HEVC 10-bit playback
if (process.platform === 'linux') {
  if (!process.env.LIBVA_DRIVERS_PATH && fs.existsSync('/home/daniel/.local/lib/dri/iHD_drv_video.so')) {
    process.env.LIBVA_DRIVERS_PATH = '/home/daniel/.local/lib/dri';
  }
  if (!process.env.LIBVA_DRIVER_NAME) {
    process.env.LIBVA_DRIVER_NAME = 'iHD';
  }
}

// Explicit identity so Chromium preserves app storage, IndexedDB, and cookies permanently
app.name = 'Montage Studio';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.thisoftcore.videomontageeditor');
}

const isDev = !app.isPackaged && (process.env.NODE_ENV === 'development' || process.argv.includes('--dev'));

// Performance and GPU hardware acceleration switches for WebCodecs, HEVC & Canvas
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,VaapiVideoDecoder,VaapiVideoDecodeLinuxGL,CanvasOopRasterization');

let mainWindow = null;
let localServerInstance = null;

// Ensure only a single instance of the application runs
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  const iconPath = path.resolve(__dirname, '../build-resources/icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Montage Studio',
    backgroundColor: '#090d16',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  });

  // Open links in external default browser rather than navigating inside the editor
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] (level=${level}) ${message} [${sourceId}:${line}]`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Failed Load] code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (isDev) {
    let devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (!devServerUrl) {
      for (const p of [5173, 5174, 5175]) {
        try {
          await fetch(`http://127.0.0.1:${p}`, { signal: AbortSignal.timeout(400) });
          devServerUrl = `http://localhost:${p}`;
          break;
        } catch (_) {}
      }
    }
    devServerUrl = devServerUrl || 'http://localhost:5173';
    console.log(`[electron] Loading dev server: ${devServerUrl}`);
    await mainWindow.loadURL(devServerUrl);
  } else {
    // Production / Packaged mode: start embedded local server on fixed persistent port
    const distPath = path.resolve(__dirname, '../dist');
    const { url, server } = await startDesktopServer({ distPath, port: DEFAULT_DESKTOP_PORT });
    localServerInstance = server;
    console.log(`[electron] Loading local app: ${url}`);
    await mainWindow.loadURL(url);
  }

  // Developer shortcuts in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(async () => {
  // Set minimal application menu for shortcuts (Reload, Fullscreen, Quit)
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Archivo',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar Recarga' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño Original' },
        { role: 'zoomIn', label: 'Aumentar Zoom' },
        { role: 'zoomOut', label: 'Reducir Zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla Completa' },
        { role: 'toggleDevTools', label: 'Herramientas de Desarrollador' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // IPC handler for native folder picker
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar Carpeta de Proyectos del Sistema Local',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // IPC handler for opening folders or files in the native OS file explorer
  ipcMain.handle('shell:openPath', async (_event, targetPath) => {
    if (targetPath) {
      return shell.openPath(targetPath);
    }
    return null;
  });

  await createWindow();
  setupAutoUpdater(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function stopServer() {
  if (localServerInstance) {
    try {
      localServerInstance.close();
    } catch (_) {}
    localServerInstance = null;
  }
}

app.on('before-quit', () => {
  stopServer();
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
