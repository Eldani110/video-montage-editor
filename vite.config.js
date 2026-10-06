import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.resolve(__dirname, 'projects_media');

// Ensure media folder exists on disk
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// In-memory cache for DuckDuckGo search tokens (vqd)
const ddgVqdCache = new Map();

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg'
};

// Curated royalty-free direct-streaming stock clips for offline/fallback/testing
// Curated royalty-free direct-streaming stock clips for offline/fallback/testing
const CURATED_STOCK_LIBRARY = {
  tech: [
    {
      id: 'stock_tech_1',
      title: 'Infraestructura de Red y Servidores Cloud',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_tech_2',
      title: 'Circuito Integrado y Procesamiento Microelectrónico',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_tech_3',
      title: 'Centro de Datos y Pasillos de Racks Iluminados',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1587560699334-cc4ff634909a?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1587560699334-cc4ff634909a?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1597852074816-d933c4d2b988?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_tech_4',
      title: 'Red Neuronal y Visualización Abstracta de Cómputo',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    }
  ],
  energy: [
    {
      id: 'stock_energy_1',
      title: 'Torres de Transmisión Eléctrica y Red de Alta Tensión',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1509390874185-03291a308181?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_energy_2',
      title: 'Flujo de Energía y Parques Tecnológicos Renovables',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_energy_3',
      title: 'Parque Solar y Turbinas Eólicas en Horizonte',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1508791199429-2c5950d603e8?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1508791199429-2c5950d603e8?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_energy_4',
      title: 'Subestación Eléctrica e Iluminación Nocturna',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1516937941344-00b4e0337589?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1542382257-80dedb725088?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    }
  ],
  business: [
    {
      id: 'stock_biz_1',
      title: 'Reunión Ejecutiva y Análisis Corporativo de Inversión',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_biz_2',
      title: 'Sala de Decisiones Estratégicas y Mesa Directiva',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_biz_3',
      title: 'Gráficos Bursátiles y Flujo de Capital Global',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_biz_4',
      title: 'Rascacielos Corporativos y Centro Financiero Internacional',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    }
  ],
  people: [
    {
      id: 'stock_people_1',
      title: 'Profesional Analizando Pantallas de Código y Gráficos',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_people_2',
      title: 'Persona en Plano Medio Reflexivo y Concentrado',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_people_3',
      title: 'Equipo de Ingeniería en Sala de Operaciones de Red',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    },
    {
      id: 'stock_people_4',
      title: 'Silueta Humana Frente a Gran Pantalla Futurista',
      type: 'video',
      previewUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      downloadUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&auto=format&fit=crop&q=80',
      keyFrames: [
        'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&auto=format&fit=crop&q=80'
      ],
      duration: 10,
      width: 1280,
      height: 720,
      provider: 'curated'
    }
  ]
};

function mediaStoragePlugin() {
  const plugin = {
    name: 'media-storage-middleware',
    configureServer(server) {
      // 1. Static Media File Serving with HTTP Range Request Support
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/media-library/')) {
          const rawSubpath = req.url.replace(/^\/media-library\//, '').split('?')[0];
          const decodedPath = decodeURIComponent(rawSubpath);
          const safePath = path.normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
          const filePath = path.join(MEDIA_DIR, safePath);

          if (!filePath.startsWith(MEDIA_DIR) || !fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Media file not found on disk' }));
            return;
          }

          try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) {
              res.statusCode = 400;
              res.end('Not a file');
              return;
            }

            const fileSize = stat.size;
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            const mtimeMs = Math.round(stat.mtimeMs);
            const etag = `W/"${fileSize}-${mtimeMs}"`;

            // Check for conditional If-None-Match header
            if (req.headers['if-none-match'] === etag) {
              res.statusCode = 304;
              res.end();
              return;
            }

            // Check for HTTP Range header (crucial for HTML5 video/audio playback and scrubbing)
            const range = req.headers.range;
            if (range) {
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

              if (start >= fileSize || end >= fileSize || start > end) {
                res.statusCode = 416; // Range Not Satisfiable
                res.setHeader('Content-Range', `bytes */${fileSize}`);
                res.end();
                return;
              }

              const chunkSize = (end - start) + 1;
              res.statusCode = 206; // Partial Content
              res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
              res.setHeader('Accept-Ranges', 'bytes');
              res.setHeader('Content-Length', chunkSize);
              res.setHeader('Content-Type', contentType);
              res.setHeader('ETag', etag);
              res.setHeader('Cache-Control', 'no-cache, must-revalidate');
              res.setHeader('Access-Control-Allow-Origin', '*');

              const fileStream = fs.createReadStream(filePath, { start, end });
              res.on('close', () => fileStream.destroy());
              fileStream.pipe(res);
            } else {
              res.statusCode = 200;
              res.setHeader('Content-Length', fileSize);
              res.setHeader('Accept-Ranges', 'bytes');
              res.setHeader('Content-Type', contentType);
              res.setHeader('ETag', etag);
              res.setHeader('Cache-Control', 'no-cache, must-revalidate');
              res.setHeader('Access-Control-Allow-Origin', '*');

              const fileStream = fs.createReadStream(filePath);
              res.on('close', () => fileStream.destroy());
              fileStream.pipe(res);
            }
          } catch (err) {
            console.error('Error serving media file:', err);
            res.statusCode = 500;
            res.end('Error reading media file');
          }
          return;
        }

        // 2. Storage Info Endpoint
        if (req.url && req.url === '/api/media/storage-info') {
          try {
            let totalFiles = 0;
            let totalBytes = 0;
            const walk = (dir) => {
              if (!fs.existsSync(dir)) return;
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.isFile()) {
                  totalFiles++;
                  totalBytes += fs.statSync(full).size;
                }
              }
            };
            walk(MEDIA_DIR);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({
              mediaDir: MEDIA_DIR,
              exists: true,
              totalFiles,
              totalBytes,
              formattedSize: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB'
            }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // 3. Media Download Endpoint: Streams remote URL directly to disk folder
        if (req.url && req.url.startsWith('/api/media/download') && req.method === 'POST') {
          let bodyRaw = '';
          req.on('data', chunk => { bodyRaw += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyRaw || '{}');
              const { url, filename, projectId = 'global', type = 'video', fallbackUrl } = body;

              if (!url) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing media URL to download' }));
                return;
              }

              // Create project subfolder on disk
              const safeProjectId = (projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
              const projectDir = path.join(MEDIA_DIR, safeProjectId);
              if (!fs.existsSync(projectDir)) {
                fs.mkdirSync(projectDir, { recursive: true });
              }

              // Generate safe file name
              const ext = path.extname(new URL(url).pathname) || (type === 'image' ? '.jpg' : '.mp4');
              const safeName = (filename || `media_${Date.now()}`)
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/\.[^/.]+$/, '') + ext;

              const targetFilePath = path.join(projectDir, safeName);

              // Stream file from remote URL directly into local disk file
              let remoteRes = null;
              let effectiveUrl = url;
              try {
                remoteRes = await fetch(effectiveUrl, {
                  redirect: 'follow',
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
                  }
                });
              } catch (fetchErr) {
                console.warn('Initial download fetch failed, attempting resilient fallback:', fetchErr.message);
              }

              // If primary remote host fails or blocks hotlinking (e.g. 403), try CDN fallbackUrl (e.g. Bing cached thumbnail)
              if ((!remoteRes || !remoteRes.ok) && fallbackUrl && fallbackUrl !== effectiveUrl) {
                console.log(`Direct fetch failed (${remoteRes?.status || 'error'}), retrying with CDN fallbackUrl: ${fallbackUrl}`);
                effectiveUrl = fallbackUrl;
                try {
                  remoteRes = await fetch(effectiveUrl, {
                    redirect: 'follow',
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                    }
                  });
                } catch (fallbackErr) {
                  console.warn('Fallback CDN URL also failed:', fallbackErr.message);
                }
              }

              // If still failing or rate-limited (e.g. HTTP 429), recover with guaranteed sample clip
              if (!remoteRes || !remoteRes.ok) {
                console.warn(`Download returned status ${remoteRes?.status || 'network error'} for ${effectiveUrl}. Using resilient fallback source.`);
                effectiveUrl = type === 'image'
                  ? 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1280&q=80'
                  : 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
                remoteRes = await fetch(effectiveUrl, {
                  redirect: 'follow',
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                  }
                });
              }

              if (!remoteRes.ok) {
                throw new Error(`Failed to download remote file: HTTP ${remoteRes.status} ${remoteRes.statusText}`);
              }

              const fileStream = fs.createWriteStream(targetFilePath);
              await pipeline(Readable.fromWeb(remoteRes.body), fileStream);

              const stat = fs.statSync(targetFilePath);
              const relativeUrl = `/media-library/${safeProjectId}/${safeName}`;

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({
                success: true,
                filename: safeName,
                localUrl: relativeUrl,
                diskPath: targetFilePath,
                size: stat.size,
                contentType: MIME_TYPES[ext] || remoteRes.headers.get('content-type') || 'application/octet-stream'
              }));
            } catch (err) {
              console.error('Error downloading media to disk:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: err.message || 'Download failed' }));
            }
          });
          return;
        }

        // 4. Stock Media Search API Proxy (Pexels / Pixabay with smart fallbacks & pagination)
        if (req.url && req.url.startsWith('/api/media/search')) {
          const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
          const query = (urlObj.searchParams.get('query') || '').trim();
          const type = urlObj.searchParams.get('type') || 'video'; // 'video' | 'image'
          const provider = urlObj.searchParams.get('provider') || 'pexels'; // 'pexels' | 'pixabay'
          const apiKey = urlObj.searchParams.get('apiKey') || '';
          const perPage = parseInt(urlObj.searchParams.get('per_page') || '16', 10);
          const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
          const orientation = urlObj.searchParams.get('orientation') || 'landscape';

          (async () => {
            try {
              let results = [];
              let totalResults = 0;
              let hasMore = false;

              // Case A: Pexels API
              if (apiKey && provider === 'pexels') {
                if (type === 'video') {
                  const pexelsUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=${orientation}`;
                  const pexRes = await fetch(pexelsUrl, {
                    headers: { Authorization: apiKey }
                  });
                  if (pexRes.ok) {
                    const data = await pexRes.json();
                    totalResults = data.total_results || 0;
                    hasMore = Boolean(data.next_page) || (page * perPage < totalResults);
                    results = (data.videos || []).map(v => {
                      const bestFile = (v.video_files || []).find(f => f.quality === 'hd' && f.width >= 1280) ||
                                       (v.video_files || []).find(f => f.file_type === 'video/mp4') ||
                                       v.video_files?.[0];
                      const sdFile = (v.video_files || []).find(f => f.quality === 'sd') || bestFile;
                      const slug = typeof v.url === 'string'
                        ? v.url.split('/').filter(Boolean).pop()?.replace(/-\d+$/, '').replace(/-/g, ' ')
                        : '';
                      const videoTitle = slug && slug.trim().length > 2 ? slug.trim() : `Pexels Video: ${query}`;
                      return {
                        id: `pexels_v_${v.id}`,
                        provider: 'pexels',
                        type: 'video',
                        title: videoTitle,
                        tags: slug || query,
                        previewUrl: sdFile?.link || bestFile?.link || '',
                        downloadUrl: bestFile?.link || '',
                        thumbnail: v.image || '',
                        keyFrames: (v.video_pictures || []).slice(0, 2).map(p => p.picture) || (v.image ? [v.image] : []),
                        duration: v.duration || 10,
                        width: v.width || 1920,
                        height: v.height || 1080
                      };
                    });
                  }
                } else {
                  // Photos
                  const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=${orientation}`;
                  const pexRes = await fetch(pexelsUrl, {
                    headers: { Authorization: apiKey }
                  });
                  if (pexRes.ok) {
                    const data = await pexRes.json();
                    totalResults = data.total_results || 0;
                    hasMore = Boolean(data.next_page) || (page * perPage < totalResults);
                    results = (data.photos || []).map(p => ({
                      id: `pexels_p_${p.id}`,
                      provider: 'pexels',
                      type: 'image',
                      title: p.alt || `Pexels Photo: ${query}`,
                      previewUrl: p.src?.medium || p.src?.large || '',
                      downloadUrl: p.src?.large2x || p.src?.original || p.src?.large || '',
                      thumbnail: p.src?.small || p.src?.medium || '',
                      keyFrames: [p.src?.large || p.src?.medium || p.src?.small],
                      duration: 5,
                      width: p.width || 1920,
                      height: p.height || 1080
                    }));
                  }
                }
              }

              // Case B: Pixabay API
              if (apiKey && provider === 'pixabay') {
                if (type === 'video') {
                  const pixUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
                  const pixRes = await fetch(pixUrl);
                  if (pixRes.ok) {
                    const data = await pixRes.json();
                    totalResults = data.totalHits || data.total || 0;
                    hasMore = page * perPage < totalResults;
                    results = (data.hits || []).map(h => {
                      const large = h.videos?.large?.url;
                      const medium = h.videos?.medium?.url;
                      const tiny = h.videos?.tiny?.url;
                      const thumb = `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg`;
                      return {
                        id: `pixabay_v_${h.id}`,
                        provider: 'pixabay',
                        type: 'video',
                        title: h.tags || `Pixabay Video: ${query}`,
                        previewUrl: tiny || medium || large,
                        downloadUrl: large || medium || tiny,
                        thumbnail: thumb,
                        keyFrames: [thumb],
                        duration: h.duration || 10,
                        width: h.videos?.large?.width || 1920,
                        height: h.videos?.large?.height || 1080
                      };
                    });
                  }
                } else {
                  const pixUrl = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&image_type=photo`;
                  const pixRes = await fetch(pixUrl);
                  if (pixRes.ok) {
                    const data = await pixRes.json();
                    totalResults = data.totalHits || data.total || 0;
                    hasMore = page * perPage < totalResults;
                    results = (data.hits || []).map(h => ({
                      id: `pixabay_p_${h.id}`,
                      provider: 'pixabay',
                      type: 'image',
                      title: h.tags || `Pixabay Photo: ${query}`,
                      previewUrl: h.webformatURL,
                      downloadUrl: h.largeImageURL || h.webformatURL,
                      thumbnail: h.previewURL,
                      duration: 5,
                      width: h.imageWidth || 1920,
                      height: h.imageHeight || 1080
                    }));
                  }
                }
              }

              // Case C: Open Web Image & Media Search (Bing Images + Wikimedia Commons) - 100% Free & No API Key needed
              // Automatically triggers if provider is 'web', OR if Pexels/Pixabay has no API key or returned 0 results!
              const shouldSearchWeb = (provider === 'web' || provider === 'duckduckgo' || provider === 'bing') || (results.length === 0);
              if (shouldSearchWeb) {
                try {
                  const first = (page - 1) * perPage + 1;

                  // 1. If video requested, attempt Wikimedia Commons video search first
                  if (type === 'video') {
                    try {
                      const wikiVideoUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}+filetype:video&gsrlimit=${perPage}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
                      const wikiVideoRes = await fetch(wikiVideoUrl, { headers: { 'User-Agent': 'VideoMontageEditor/1.0' } });
                      if (wikiVideoRes.ok) {
                        const wikiData = await wikiVideoRes.json();
                        const pages = Object.values(wikiData.query?.pages || {});
                        for (const p of pages) {
                          const info = p.imageinfo?.[0];
                          if (info && info.url) {
                            results.push({
                              id: `wiki_v_${p.pageid}`,
                              provider: 'web',
                              type: 'video',
                              title: (p.title || '').replace(/^File:/i, '').replace(/_/g, ' '),
                              tags: query,
                              previewUrl: info.thumburl || info.url,
                              downloadUrl: info.url,
                              fallbackUrl: info.thumburl,
                              thumbnail: info.thumburl || info.url,
                              keyFrames: [info.thumburl || info.url],
                              duration: info.duration || 10,
                              width: info.width || 1920,
                              height: info.height || 1080,
                              sourceName: 'Wikimedia Commons (Video)',
                              sourceUrl: info.descriptionurl || ''
                            });
                          }
                        }
                      }
                    } catch (wikiVidErr) {
                      console.warn('Wikimedia video search error:', wikiVidErr.message);
                    }
                  }

                  // 2. High-resolution Web Image Search via Bing Images (solo si no es búsqueda exclusiva de videos)
                  if (results.length < perPage && type !== 'video') {
                    const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=${first}`;
                    const bingRes = await fetch(bingUrl, {
                      headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
                      }
                    });

                    if (bingRes.ok) {
                      const html = await bingRes.text();
                      const regex = /m="({.*?})"/g;
                      let match;
                      let idx = 0;
                      while ((match = regex.exec(html)) !== null && results.length < perPage) {
                        try {
                          const decoded = match[1].replace(/&quot;/g, '"');
                          const json = JSON.parse(decoded);
                          if (json.murl) {
                            const cleanThumb = (json.turl || json.murl || '').replace(/&amp;/g, '&');
                            const sourceDomain = json.purl ? new URL(json.purl).hostname.replace(/^www\./, '') : 'Web';
                            results.push({
                              id: `web_${Date.now()}_${first + idx}`,
                              provider: 'web',
                              type: 'image',
                              title: json.t || json.desc || `${query} (${sourceDomain})`,
                              tags: `${query}, ${sourceDomain}`,
                              previewUrl: cleanThumb,
                              downloadUrl: json.murl,
                              fallbackUrl: cleanThumb,
                              thumbnail: cleanThumb,
                              keyFrames: [cleanThumb],
                              duration: 5,
                              width: 1920,
                              height: 1080,
                              sourceName: sourceDomain,
                              sourceUrl: json.purl || ''
                            });
                            idx++;
                          }
                        } catch (parseItemErr) {
                          // ignore malformed items
                        }
                      }
                    }
                  }

                  // 3. If still empty, fallback to Wikimedia Commons images (solo si no es búsqueda exclusiva de videos)
                  if (results.length === 0 && type !== 'video') {
                    try {
                      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${perPage}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
                      const wikiRes = await fetch(wikiUrl, { headers: { 'User-Agent': 'VideoMontageEditor/1.0' } });
                      if (wikiRes.ok) {
                        const wikiData = await wikiRes.json();
                        const pages = Object.values(wikiData.query?.pages || {});
                        for (const p of pages) {
                          const info = p.imageinfo?.[0];
                          if (info && info.url) {
                            results.push({
                              id: `wiki_${p.pageid}`,
                              provider: 'web',
                              type: 'image',
                              title: (p.title || '').replace(/^File:/i, '').replace(/_/g, ' '),
                              tags: query,
                              previewUrl: info.thumburl || info.url,
                              downloadUrl: info.url,
                              fallbackUrl: info.thumburl,
                              thumbnail: info.thumburl || info.url,
                              keyFrames: [info.thumburl || info.url],
                              duration: 5,
                              width: info.width || 1920,
                              height: info.height || 1080,
                              sourceName: 'Wikimedia Commons',
                              sourceUrl: info.descriptionurl || ''
                            });
                          }
                        }
                      }
                    } catch (wikiErr) {
                      console.warn('Wikimedia fallback error:', wikiErr.message);
                    }
                  }

                  totalResults = results.length >= perPage ? 200 : results.length;
                  hasMore = results.length >= perPage;
                } catch (webErr) {
                  console.warn('Web search proxy error:', webErr.message);
                }
              }

              // Never inject fake server/tech clips if a query returned no results
              // Returning clean results allows the frontend to handle fallback gracefully or use real web search

              const isWeb = provider === 'web' || provider === 'duckduckgo' || (results.length > 0 && results[0]?.provider === 'web');
              const resolvedProvider = isWeb ? 'web' : (apiKey ? provider : 'web');

              const filteredResults = type === 'video'
                ? results.filter(r => r.type === 'video')
                : results;

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({
                query,
                type: type === 'video' ? 'video' : (isWeb ? 'image' : type),
                page,
                perPage,
                totalResults: filteredResults.length,
                hasMore: false,
                provider: resolvedProvider,
                hasApiKey: Boolean(apiKey),
                results: filteredResults
              }));
            } catch (err) {
              console.error('Error in stock search API:', err);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({
                error: err.message,
                results: []
              }));
            }
          })();
          return;
        }

        next();
      });
    }
  };
  // Reuse the same middlewares in `vite preview` (production container)
  plugin.configurePreviewServer = plugin.configureServer;
  return plugin;
}

function aiProxyPlugin() {
  const plugin = {
    name: 'ai-proxy-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/ai-proxy')) {
          const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
          const targetUrl = urlObj.searchParams.get('url') || req.headers['x-target-url'];

          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing target url parameter' }));
            return;
          }

          // Handle preflight
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.end();
            return;
          }

          (async () => {
            try {
              // 1. Consume body completely into memory to prevent streaming stall
              let bodyBuffer = null;
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                const chunks = [];
                for await (const chunk of req) {
                  chunks.push(chunk);
                }
                if (chunks.length > 0) {
                  bodyBuffer = Buffer.concat(chunks);
                }
              }

              // 2. Prepare headers
              const forwardHeaders = {};
              for (const [key, val] of Object.entries(req.headers)) {
                const lk = key.toLowerCase();
                if (['authorization', 'content-type', 'accept', 'x-api-key', 'user-agent'].includes(lk)) {
                  forwardHeaders[lk] = val;
                }
              }

              const parsedTarget = new URL(targetUrl);
              if (bodyBuffer) {
                forwardHeaders['content-length'] = bodyBuffer.length.toString();
              }

              // 3. Fast & transparent Proxy Fetch with immediate Streaming Support
              if (req.socket) req.socket.setTimeout(0);
              if (res.socket) res.socket.setTimeout(0);

              let response = null;
              const controller = new AbortController();
              let timeoutId = setTimeout(() => {
                controller.abort(new Error('AI Request Timeout (180s excedidos)'));
              }, 180000);

              // Cancel upstream fetch if client disconnects
              req.on('close', () => {
                if (!res.writableEnded) {
                  controller.abort();
                }
              });

              try {
                response = await fetch(targetUrl, {
                  method: req.method,
                  headers: forwardHeaders,
                  body: bodyBuffer,
                  signal: controller.signal,
                  redirect: 'follow',
                  keepalive: true
                });
                clearTimeout(timeoutId);
              } catch (fetchErr) {
                clearTimeout(timeoutId);
                throw fetchErr;
              }

              if (!response) {
                throw new Error('No se pudo establecer conexión con el servidor de IA.');
              }

              // 4. Return response headers to browser (stripping content-length and content-encoding for chunked stream)
              res.statusCode = response.status;
              for (const [k, v] of response.headers.entries()) {
                const lk = k.toLowerCase();
                if (lk !== 'access-control-allow-origin' && lk !== 'content-length' && lk !== 'content-encoding') {
                  res.setHeader(k, v);
                }
              }
              res.setHeader('Access-Control-Allow-Origin', '*');

              // 5. Pipe chunks in real-time as they arrive from Ollama/OpenAI
              if (response.body) {
                const reader = response.body.getReader();
                const cancelOnAbort = () => {
                  try { reader.cancel().catch(() => {}); } catch {}
                };
                controller.signal.addEventListener('abort', cancelOnAbort, { once: true });

                // Stream inactivity watchdog: if 45s pass without any chunks, abort to prevent hang
                let streamWatchdog = null;
                const resetStreamWatchdog = () => {
                  if (streamWatchdog) clearTimeout(streamWatchdog);
                  streamWatchdog = setTimeout(() => {
                    controller.abort(new Error('Inactividad en upstream stream (45s)'));
                  }, 45000);
                };
                resetStreamWatchdog();

                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    resetStreamWatchdog();
                    res.write(value);
                  }
                } finally {
                  if (streamWatchdog) clearTimeout(streamWatchdog);
                  controller.signal.removeEventListener('abort', cancelOnAbort);
                  res.end();
                }
              } else {
                res.end();
              }
            } catch (err) {
              console.error('AI Proxy Error:', err.message);
              if (!res.headersSent) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ error: err.message || 'Error en proxy de IA' }));
              }
            }
          })();
          return;
        }
        next();
      });
    }
  };
  // Reuse the same middlewares in `vite preview` (production container)
  plugin.configurePreviewServer = plugin.configureServer;
  return plugin;
}

const ALLOWED_HOSTS = [
  'videomontageeditor.thisoftcore.com',
  ...(process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',') : []),
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mediaStoragePlugin(), aiProxyPlugin()],
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
  },
})

