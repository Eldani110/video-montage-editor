import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaStorageMiddleware, aiProxyMiddleware, MIME_TYPES } from './mediaBackend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXT_MIME_TYPES = {
  ...MIME_TYPES,
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

export const DEFAULT_DESKTOP_PORT = 39281;

export function startDesktopServer({ distPath, port = DEFAULT_DESKTOP_PORT, host = '127.0.0.1' } = {}) {
  const actualDist = distPath || path.resolve(__dirname, '../dist');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // 1. Media API & streaming middleware
      mediaStorageMiddleware(req, res, (err) => {
        if (err) {
          console.error('[desktopServer] Media middleware error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(err.message);
          }
          return;
        }

        // 2. AI Proxy middleware
        aiProxyMiddleware(req, res, (err2) => {
          if (err2) {
            console.error('[desktopServer] AI proxy error:', err2);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end(err2.message);
            }
            return;
          }

          if (res.headersSent || res.writableEnded) return;

          // 3. Static assets from dist folder
          const urlObj = new URL(req.url, `http://${host}`);
          let pathname = decodeURIComponent(urlObj.pathname);

          if (pathname === '/' || !pathname) {
            pathname = '/index.html';
          }

          const safeRelative = pathname.replace(/^(\.\.(\/|\\|$))+/, '');
          let filePath = path.join(actualDist, safeRelative);

          // SPA routing fallback: only fallback to index.html for navigation routes without file extensions
          const hasFileExt = path.extname(pathname).length > 0;
          if ((!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) && !hasFileExt) {
            filePath = path.join(actualDist, 'index.html');
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = EXT_MIME_TYPES[ext] || 'application/octet-stream';
            const stat = fs.statSync(filePath);

            // Critical headers for SharedArrayBuffer, WebCodecs and multithreaded WASM (Whisper/ONNX)
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');

            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
          } else {
            res.statusCode = 404;
            res.end('Not Found');
          }
        });
      });
    });

    let currentPort = port;
    let attempts = 0;
    const maxAttempts = 5;

    function tryListen() {
      server.listen(currentPort, host);
    }

    server.once('listening', () => {
      const assignedPort = server.address().port;
      const serverUrl = `http://${host}:${assignedPort}`;
      console.log(`[desktopServer] Ready at ${serverUrl}`);
      resolve({ server, port: assignedPort, url: serverUrl });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
        attempts++;
        console.warn(`[desktopServer] Port ${currentPort} is in use, retrying on ${currentPort + 1}...`);
        currentPort++;
        setTimeout(tryListen, 150);
      } else {
        console.error('[desktopServer] Server start error:', err);
        reject(err);
      }
    });

    tryListen();
  });
}
