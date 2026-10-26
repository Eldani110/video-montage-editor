import { app, ipcMain } from 'electron';
import pkg from 'electron-updater';

const { autoUpdater } = pkg;

let isInitialized = false;
let updateStatus = {
  status: 'idle', // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: app.getVersion(),
  newVersion: null,
  progress: 0,
  error: null
};

export function setupAutoUpdater(mainWindow) {
  if (isInitialized) return;
  isInitialized = true;

  updateStatus.currentVersion = app.getVersion();

  const sendStatus = (statusUpdate) => {
    updateStatus = { ...updateStatus, ...statusUpdate };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', updateStatus);
    }
  };

  // Configure electron-updater logger and preferences
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Buscando actualizaciones en GitHub Releases...');
    sendStatus({ status: 'checking', error: null });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] ¡Nueva versión disponible!', info.version);
    sendStatus({
      status: 'available',
      newVersion: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
      error: null
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] La aplicación está al día. Versión actual:', info?.version || app.getVersion());
    sendStatus({
      status: 'not-available',
      newVersion: null,
      error: null
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent || 0);
    console.log(`[AutoUpdater] Descargando actualización: ${percent}% (${Math.round((progressObj.bytesPerSecond || 0) / 1024)} KB/s)`);
    sendStatus({
      status: 'downloading',
      progress: percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Actualización descargada con éxito. Lista para instalar:', info.version);
    sendStatus({
      status: 'downloaded',
      newVersion: info.version,
      progress: 100,
      error: null
    });
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Error en el ciclo de actualización:', err?.message || err);
    sendStatus({
      status: 'error',
      error: err?.message || 'Error al buscar actualizaciones'
    });
  });

  // IPC Handlers for React Frontend
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged && !process.env.TEST_UPDATER) {
      console.log('[AutoUpdater] En modo desarrollo no se consulta GitHub Releases.');
      return { status: 'dev-mode', currentVersion: app.getVersion() };
    }
    try {
      sendStatus({ status: 'checking', error: null });
      const checkResult = await autoUpdater.checkForUpdates();
      return {
        success: true,
        version: checkResult?.updateInfo?.version || null,
        files: checkResult?.updateInfo?.files?.map(f => f.url) || []
      };
    } catch (err) {
      const errMsg = err?.message || String(err);
      console.warn('[AutoUpdater] Error en comprobación manual:', errMsg);
      sendStatus({ status: 'error', error: errMsg });
      return { success: false, error: errMsg };
    }
  });

  ipcMain.handle('updater:install', () => {
    console.log('[AutoUpdater] Aplicando actualización y reiniciando aplicación...');
    try {
      autoUpdater.quitAndInstall(false, true);
      return { success: true };
    } catch (err) {
      console.error('[AutoUpdater] Error al aplicar actualización:', err);
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.handle('updater:getStatus', () => {
    return { ...updateStatus };
  });

  // Auto-check 8 seconds after window startup in packaged production releases
  if (app.isPackaged || process.env.TEST_UPDATER === '1') {
    setTimeout(() => {
      console.log('[AutoUpdater] Comprobación inicial de actualización al arrancar...');
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[AutoUpdater] Fallo silencioso en comprobación inicial:', err.message);
      });
    }, 8000);
  }
}
