// Runs the playback bench inside Electron's Chromium (real codecs/GPU) and prints the JSON result.
// Usage: node_modules/electron/dist/electron --no-sandbox tests/playback_bench/run.cjs "<query-string>" [page]
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiIgnoreDriverChecks,PlatformHEVCDecoderSupport');

const query = process.env.BENCH_QUERY || '';
const page = process.env.BENCH_PAGE || 'tests/playback_bench/index.html';
const BASE = process.env.BENCH_BASE || 'http://127.0.0.1:5173';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, _l, msg) => { if (/error|warn/i.test(msg)) console.error('[page]', msg); });
  await win.loadURL(`${BASE}/${page}?${query}`);
  const started = Date.now();
  const tick = async () => {
    const title = win.getTitle();
    if (title === 'BENCH_DONE' || Date.now() - started > 170000) {
      const text = await win.webContents.executeJavaScript('document.getElementById("out").textContent');
      console.log(text);
      app.exit(0);
      return;
    }
    setTimeout(tick, 500);
  };
  tick();
});
