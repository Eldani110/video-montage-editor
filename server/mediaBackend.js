import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  startFFmpegJob,
  cancelFFmpegJob,
  getFFmpegJobStatus,
  serveFFmpegOutputFile
} from './ffmpegExporter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Normalizes a filename for tolerant matching: strips extension, lowercases,
// and reduces to alphanumeric-only so "a1b2_c3" matches "a1b2c3".
function normalizeMediaKey(name) {
  return String(name || '')
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const resolvedPathCache = new Map();

const IGNORED_SEARCH_DIRS = new Set([
  'node_modules', '.git', 'cache', '.cache', 'release', 'dist', 'build',
  'linux-unpacked', 'win-unpacked', '.npm', '.local', '.config', 'AppData'
]);

function searchDirRecursive(dir, targetName, targetKey, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }

  // 1. Exact filename match in current directory
  for (const entry of entries) {
    if (entry.isFile() && entry.name === targetName) {
      return path.join(dir, entry.name);
    }
  }
  // 2. Normalized key match in current directory
  for (const entry of entries) {
    if (entry.isFile() && normalizeMediaKey(entry.name) === targetKey) {
      return path.join(dir, entry.name);
    }
  }

  // 3. Recurse into subdirectories (skipping hidden and ignored dependency folders)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const n = entry.name;
      if (n.startsWith('.') || IGNORED_SEARCH_DIRS.has(n)) continue;
      const found = searchDirRecursive(path.join(dir, n), targetName, targetKey, depth + 1, maxDepth);
      if (found) return found;
    }
  }
  return null;
}

// Resolves a requested /media-library subpath to a real file, tolerating:
//  - the requested subpath existing directly (fast path)
//  - a bare filename that lives inside a project subfolder
//  - normalized-name matches (handles "_" differences and minor reordering)
// Returns every root folder we should look in when resolving a relative media path.
function getCandidateMediaRoots(primaryDir) {
  const roots = [];
  const seen = new Set();
  const add = (dir) => {
    if (!dir) return;
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) roots.push(resolved);
    } catch (_) { }
  };
  add(primaryDir);
  add(path.resolve(PROJECT_ROOT, 'projects_media'));
  add(path.resolve(os.homedir(), '.gemini/antigravity-ide/scratch/video-montage-editor/projects_media'));
  add(path.resolve(os.homedir(), 'MontageRecursos'));
  add(path.resolve(os.homedir(), 'MisRecursosNuevos'));
  add(path.resolve(os.homedir(), 'Documentos/Archivo'));
  add(path.resolve(os.homedir(), 'Archivo'));
  add(path.resolve(os.homedir(), 'Descargas'));
  add(path.resolve(os.homedir(), 'Downloads'));
  add(path.resolve(os.homedir(), 'Documentos'));
  add(path.resolve(os.homedir(), 'Vídeos'));
  add(path.resolve(os.homedir(), 'Videos'));
  add(path.resolve(os.homedir(), 'Imágenes'));
  add(path.resolve(os.homedir(), 'Pictures'));
  add(path.resolve(os.homedir(), 'Escritorio'));
  add(path.resolve(os.homedir(), 'Desktop'));
  add(path.resolve(os.homedir(), 'Música'));
  add(path.resolve(os.homedir(), 'Music'));

  // Any historical folders recorded in the config
  const cfg = readMediaConfig();
  if (Array.isArray(cfg.knownMediaDirs)) cfg.knownMediaDirs.forEach(add);
  if (cfg.baseMediaDir) add(cfg.baseMediaDir);
  return roots;
}

function resolveMediaFileTolerant(mediaDir, safePath) {
  if (!safePath) return null;
  const cacheKey = `${mediaDir}:${safePath}`;
  if (resolvedPathCache.has(cacheKey)) {
    const cached = resolvedPathCache.get(cacheKey);
    if (cached === null) return null; // Instant negative cache hit
    try {
      if (fs.existsSync(cached) && fs.statSync(cached).isFile()) return cached;
    } catch (_) {
      resolvedPathCache.delete(cacheKey);
    }
  }

  // If safePath is already an absolute path that exists
  if (path.isAbsolute(safePath)) {
    try {
      if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        resolvedPathCache.set(cacheKey, safePath);
        return safePath;
      }
    } catch (_) { }
  }

  const roots = getCandidateMediaRoots(mediaDir);
  const requestedName = path.basename(safePath);
  const requestedKey = normalizeMediaKey(requestedName);
  const requestedDir = path.dirname(safePath);

  // 1. Fast path: exact file inside any candidate root.
  for (const root of roots) {
    const direct = path.join(root, safePath);
    if (direct.startsWith(root) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
      resolvedPathCache.set(cacheKey, direct);
      return direct;
    }
  }

  // 2. Direct by basename inside candidate roots (handles files located directly in the root or in a project folder)
  for (const root of roots) {
    const directBase = path.join(root, requestedName);
    if (fs.existsSync(directBase) && fs.statSync(directBase).isFile()) {
      resolvedPathCache.set(cacheKey, directBase);
      return directBase;
    }
  }

  // 3. Tolerant deep search across candidate roots (bounded to maxDepth=2)
  for (const root of roots) {
    if (requestedDir && requestedDir !== '.') {
      const d = path.join(root, requestedDir);
      try {
        if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
          const foundInDir = searchDirRecursive(d, requestedName, requestedKey, 0, 2);
          if (foundInDir) {
            resolvedPathCache.set(cacheKey, foundInDir);
            return foundInDir;
          }
        }
      } catch (_) { }
    }

    const found = searchDirRecursive(root, requestedName, requestedKey, 0, 2);
    if (found) {
      resolvedPathCache.set(cacheKey, found);
      return found;
    }
  }

  // Negative cache to eliminate repeated expensive disk searches for missing files
  resolvedPathCache.set(cacheKey, null);
  return null;
}

// Persisted media configuration so the user's chosen base folder survives restarts.
// Store config in the user's home so it survives moving/rebuilding the project folder.
function resolveWritableConfigDir() {
  const homeCandidate = path.resolve(os.homedir(), '.video-montage-editor');
  try {
    if (!fs.existsSync(homeCandidate)) {
      fs.mkdirSync(homeCandidate, { recursive: true });
    }
    return homeCandidate;
  } catch (_) {
    const localFallback = path.resolve(PROJECT_ROOT, '.video-montage-editor');
    try {
      if (!fs.existsSync(localFallback)) {
        fs.mkdirSync(localFallback, { recursive: true });
      }
    } catch (_) { }
    return localFallback;
  }
}

const MEDIA_CONFIG_DIR = resolveWritableConfigDir();
const MEDIA_CONFIG_FILE = path.join(MEDIA_CONFIG_DIR, 'config.json');
const DEVICE_ID_FILE = path.join(MEDIA_CONFIG_DIR, 'device_id');
const ACCOUNTS_DIR = path.join(MEDIA_CONFIG_DIR, 'accounts');

function getSafeAccountFilePath(uid) {
  if (!uid || typeof uid !== 'string') return null;
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUid) return null;
  return path.join(ACCOUNTS_DIR, `${safeUid}.json`);
}

function readAccountData(uid) {
  const file = getSafeAccountFilePath(uid);
  if (!file) return null;
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8') || '{}');
    }
  } catch (err) {
    console.warn('[mediaBackend] Error reading account file:', err.message);
  }
  return null;
}

function writeAccountData(uid, data) {
  const file = getSafeAccountFilePath(uid);
  if (!file) return null;
  try {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
    const prev = readAccountData(uid) || {};
    const next = {
      ...prev,
      ...data,
      uid,
      updatedAt: new Date().toISOString()
    };
    if (data.devices) {
      next.devices = {
        ...(prev.devices || {}),
        ...data.devices
      };
    }
    if (data.generalSettings) {
      next.generalSettings = {
        ...(prev.generalSettings || {}),
        ...data.generalSettings
      };
    }
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  } catch (err) {
    console.warn('[mediaBackend] Error writing account file:', err.message);
    return null;
  }
}

function getOrCreateDeviceId() {
  try {
    if (fs.existsSync(DEVICE_ID_FILE)) {
      const id = fs.readFileSync(DEVICE_ID_FILE, 'utf-8').trim();
      if (id && id.startsWith('dev_')) return id;
    }
    const cleanHost = (os.hostname() || 'machine').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12);
    const rand = Math.random().toString(36).substring(2, 10);
    const newId = `dev_${cleanHost}_${rand}`;
    fs.mkdirSync(MEDIA_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(DEVICE_ID_FILE, newId, 'utf-8');
    return newId;
  } catch (_) {
    return `dev_${(os.hostname() || 'host').replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
}
// Legacy location (inside the project) — read for backwards compatibility.
const LEGACY_MEDIA_CONFIG_FILE = path.resolve(PROJECT_ROOT, '.media-config.json');

function readMediaConfig() {
  try {
    // Preferred location: user's home (survives project moves).
    if (fs.existsSync(MEDIA_CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(MEDIA_CONFIG_FILE, 'utf-8') || '{}');
      // Migrate any legacy "inside project" value to the new home-based config once.
      return cfg;
    }
    // One-time migration from the legacy project-local config.
    if (fs.existsSync(LEGACY_MEDIA_CONFIG_FILE)) {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_MEDIA_CONFIG_FILE, 'utf-8') || '{}');
      try {
        fs.mkdirSync(MEDIA_CONFIG_DIR, { recursive: true });
        fs.writeFileSync(MEDIA_CONFIG_FILE, JSON.stringify(legacy, null, 2), 'utf-8');
        fs.renameSync(LEGACY_MEDIA_CONFIG_FILE, LEGACY_MEDIA_CONFIG_FILE + '.migrated');
        console.log('[media-config] Migrated legacy config to', MEDIA_CONFIG_FILE);
      } catch (migErr) {
        console.warn('[media-config] Could not migrate legacy config:', migErr.message);
      }
      return legacy;
    }
  } catch (err) {
    console.warn('[media-config] No se pudo leer la config persistida:', err.message);
  }
  return {};
}

function writeMediaConfig(patch) {
  try {
    const prev = readMediaConfig();
    const knownSet = new Set(Array.isArray(prev.knownMediaDirs) ? prev.knownMediaDirs : []);
    if (prev.baseMediaDir) knownSet.add(path.resolve(prev.baseMediaDir));
    if (patch.baseMediaDir) knownSet.add(path.resolve(patch.baseMediaDir));
    knownSet.add(path.resolve(os.homedir(), 'Documentos/Archivo'));
    knownSet.add(path.resolve(os.homedir(), 'MisRecursosNuevos'));
    knownSet.add(path.resolve(os.homedir(), 'MontageRecursos'));
    const next = {
      ...prev,
      ...patch,
      knownMediaDirs: Array.from(knownSet)
    };
    fs.mkdirSync(MEDIA_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(MEDIA_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn('[media-config] No se pudo persistir la config:', err.message);
    return false;
  }
}

// Resolves the configured base folder. Creates it if missing so the user's
// choice is ALWAYS honored (never silently falls back to a stale default).
function resolveBaseMediaDir() {
  const cfg = readMediaConfig();
  if (cfg.baseMediaDir && typeof cfg.baseMediaDir === 'string' && cfg.baseMediaDir.trim()) {
    const resolved = path.resolve(cfg.baseMediaDir);
    try {
      if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
      return resolved;
    } catch (err) {
      console.warn('[media-config] Could not use configured folder, falling back:', err.message);
    }
  }
  // First-run default OUTSIDE the project if writable, otherwise project-local fallback.
  const homeDefault = path.resolve(os.homedir(), 'MontageRecursos');
  try {
    if (!fs.existsSync(homeDefault)) fs.mkdirSync(homeDefault, { recursive: true });
    return homeDefault;
  } catch (_) {
    const localMedia = path.resolve(PROJECT_ROOT, 'projects_media');
    try {
      if (!fs.existsSync(localMedia)) fs.mkdirSync(localMedia, { recursive: true });
    } catch (_) { }
    return localMedia;
  }
}

let MEDIA_DIR = resolveBaseMediaDir();

// Ensure media folder exists on disk
try {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
} catch (_) { }

// Dedicated cache directories for MOV/HEVC on-the-fly streaming, audio tracks, and thumbnails
export const PREVIEW_STREAM_CACHE_DIR = path.resolve(PROJECT_ROOT, '.cache/preview_streams');
export const AUDIO_TRACK_CACHE_DIR = path.resolve(PROJECT_ROOT, '.cache/audio_tracks');
export const THUMBNAIL_CACHE_DIR = path.resolve(PROJECT_ROOT, '.cache/thumbnails');
try {
  fs.mkdirSync(PREVIEW_STREAM_CACHE_DIR, { recursive: true });
  fs.mkdirSync(AUDIO_TRACK_CACHE_DIR, { recursive: true });
  fs.mkdirSync(THUMBNAIL_CACHE_DIR, { recursive: true });
} catch (_) { }

const ongoingPreviewJobs = new Map();
const ongoingAudioJobs = new Map();
const ongoingThumbnailJobs = new Map();

export function probeMediaFile(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_name,codec_type,pix_fmt,width,height,duration,r_frame_rate:stream_side_data=rotation:format=duration,size',
      '-of', 'json',
      filePath
    ]);

    let data = '';
    let stderr = '';
    proc.stdout.on('data', d => { data += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return resolve({
          success: false,
          error: stderr || `ffprobe exited with code ${code}`
        });
      }
      try {
        const parsed = JSON.parse(data || '{}');
        const vStream = (parsed.streams || []).find(s => s.codec_type === 'video');
        const aStream = (parsed.streams || []).find(s => s.codec_type === 'audio');

        let width = vStream?.width ? Number(vStream.width) : 1280;
        let height = vStream?.height ? Number(vStream.height) : 720;
        let duration = parsed.format?.duration ? Number(Number(parsed.format.duration).toFixed(2)) : (vStream?.duration ? Number(Number(vStream.duration).toFixed(2)) : 5);
        let rotation = 0;

        if (vStream?.side_data_list) {
          const rotEntry = vStream.side_data_list.find(sd => sd.rotation !== undefined);
          if (rotEntry) rotation = Number(rotEntry.rotation);
        }

        // Account for rotation (e.g. iPhone portrait video rotated -90 or 90)
        let displayWidth = width;
        let displayHeight = height;
        if (Math.abs(rotation) === 90 || Math.abs(rotation) === 270) {
          displayWidth = height;
          displayHeight = width;
        }

        const codec = vStream?.codec_name || 'unknown';
        const isMov = path.extname(filePath).toLowerCase() === '.mov';
        const isHevc = codec === 'hevc' || codec === 'hvc1';
        let fps = 30;
        if (vStream?.r_frame_rate && String(vStream.r_frame_rate).includes('/')) {
          const [n, d] = String(vStream.r_frame_rate).split('/').map(Number);
          if (n > 0 && d > 0) fps = n / d;
        }

        resolve({
          success: true,
          path: filePath,
          name: path.basename(filePath),
          width: displayWidth,
          height: displayHeight,
          rawWidth: width,
          rawHeight: height,
          duration,
          rotation,
          codec,
          pixFmt: vStream?.pix_fmt || '',
          fps,
          isMov,
          isHevc,
          hasAudio: !!aStream
        });
      } catch (err) {
        resolve({
          success: false,
          error: err.message
        });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

const probeCache = new Map();

// Cached probe (path + size + mtime) so repeated range requests never respawn ffprobe.
export async function probeMediaFileCached(filePath) {
  try {
    const st = fs.statSync(filePath);
    const key = `${filePath}:${st.size}:${st.mtimeMs}`;
    if (probeCache.has(key)) return probeCache.get(key);
    const res = await probeMediaFile(filePath);
    if (res && res.success) probeCache.set(key, res);
    return res;
  } catch (_) {
    return { success: false, error: 'stat failed' };
  }
}

// True when Chromium can decode this source natively and smoothly (no MOV / HEVC / ProRes / 10-bit / 4K+).
export function isChromiumFriendly(probe) {
  if (!probe || !probe.success) return false;
  // QuickTime (.mov, .qt), MKV, AVI and other special containers are NEVER friendly for real-time
  // timeline cutting because they lack +faststart and have large or variable GOPs (keyframe distance),
  // which causes Chromium to freeze, snap to frame 0, and repeat segments at cuts.
  const targetPath = (probe.path || probe.name || '').toLowerCase();
  if (probe.isMov || /\.(mov|qt|mkv|avi|wmv|flv|ts|m2ts)$/i.test(targetPath)) {
    return false;
  }
  if (probe.rotation && Math.abs(Number(probe.rotation)) > 0) {
    return false;
  }
  const codecOk = ['h264', 'vp8', 'vp9', 'av1'].includes(probe.codec);
  const pix = String(probe.pixFmt || '');
  const bitDepthOk = !pix || /^(yuv420p|yuvj420p|yuv422p|yuvj422p|nv12)$/.test(pix);
  const sizeOk = Math.max(probe.rawWidth || 0, probe.rawHeight || 0) <= 2560;
  const fpsOk = (probe.fps || 30) <= 61;
  return codecOk && bitDepthOk && sizeOk && fpsOk;
}

// Decides which file the preview <video> should receive:
//  1. an already-built proxy (GOP 30, 1080p, faststart) if companion _compat.mp4 or cached
//  2. the original if Chromium can play it natively  -> instant, never blocks on ffmpeg
//  3. otherwise build the proxy (HEVC / ProRes / MOV / 10-bit / 4K), awaiting it
export async function resolvePreviewSource(rawFilePath) {
  try {
    const ext = path.extname(rawFilePath).toLowerCase();
    const stem = path.basename(rawFilePath, ext);
    const dir = path.dirname(rawFilePath);

    // 1. Direct companion check: if a _compat.mp4 exists in the same folder, use it immediately
    const companionCompat = path.join(dir, `${stem}_compat.mp4`);
    if (fs.existsSync(companionCompat) && fs.statSync(companionCompat).size > 1024) {
      return companionCompat;
    }

    // 2. Cache check in PREVIEW_STREAM_CACHE_DIR
    const stat = fs.statSync(rawFilePath);
    const key = crypto.createHash('md5').update(`v3:${rawFilePath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
    const cachedPath = path.join(PREVIEW_STREAM_CACHE_DIR, `preview_${key}.mp4`);
    if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 1024) return cachedPath;
  } catch (_) { }

  const probe = await probeMediaFileCached(rawFilePath);
  if (isChromiumFriendly(probe)) return rawFilePath;
  return getPreviewStreamForMedia(rawFilePath);
}

export function getThumbnailForMedia(rawFilePath, durationHint = 5) {
  try {
    const stat = fs.statSync(rawFilePath);
    const cacheKey = crypto.createHash('md5').update(`${rawFilePath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
    const cachedThumb = path.join(THUMBNAIL_CACHE_DIR, `thumb_${cacheKey}.jpg`);

    if (fs.existsSync(cachedThumb) && fs.statSync(cachedThumb).size > 500) {
      return Promise.resolve(cachedThumb);
    }

    if (ongoingThumbnailJobs.has(cacheKey)) {
      return ongoingThumbnailJobs.get(cacheKey);
    }

    const jobPromise = new Promise((resolve) => {
      const seekSec = Math.max(0.1, Math.min(1.0, (durationHint || 5) / 2));
      const args = [
        '-y',
        '-ss', String(seekSec),
        '-i', rawFilePath,
        '-vframes', '1',
        '-vf', 'scale=w=320:h=-2:force_original_aspect_ratio=decrease',
        '-q:v', '2',
        cachedThumb
      ];

      const proc = spawn('ffmpeg', args);
      proc.on('close', (code) => {
        ongoingThumbnailJobs.delete(cacheKey);
        if (code === 0 && fs.existsSync(cachedThumb)) {
          resolve(cachedThumb);
        } else {
          resolve(null);
        }
      });
      proc.on('error', () => {
        ongoingThumbnailJobs.delete(cacheKey);
        resolve(null);
      });
    });

    ongoingThumbnailJobs.set(cacheKey, jobPromise);
    return jobPromise;
  } catch (_) {
    return Promise.resolve(null);
  }
}

export function getPreviewStreamForMedia(rawFilePath) {
  try {
    const stat = fs.statSync(rawFilePath);
    const ext = path.extname(rawFilePath).toLowerCase();
    const isSpecialContainer = /\.(mov|qt|mkv|avi|wmv|flv|ts|m2ts)$/i.test(ext);

    // If already an ultrafast cached preview stream with tight GOP for frame-accurate seeking
    const cacheKey = crypto.createHash('md5').update(`v3:${rawFilePath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
    const cachedPath = path.join(PREVIEW_STREAM_CACHE_DIR, `preview_${cacheKey}.mp4`);

    if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 1024) {
      return Promise.resolve(cachedPath);
    }

    if (ongoingPreviewJobs.has(cacheKey)) {
      return ongoingPreviewJobs.get(cacheKey);
    }

    const jobPromise = new Promise((resolve) => {
      const tempOut = path.join(PREVIEW_STREAM_CACHE_DIR, `temp_${cacheKey}.mp4`);

      const customEnv = {
        ...process.env,
        LIBVA_DRIVERS_PATH: process.env.LIBVA_DRIVERS_PATH || '/home/daniel/.local/lib/dri',
        LIBVA_DRIVER_NAME: process.env.LIBVA_DRIVER_NAME || 'iHD'
      };

      // 1. Try VA-API accelerated preview stream creation (scaled to max 1080p/1920 long-edge, faststart, GOP 30 for instantaneous keyframe seeks)
      const vaapiArgs = [
        '-y',
        '-hwaccel', 'vaapi',
        '-hwaccel_device', '/dev/dri/renderD128',
        '-hwaccel_output_format', 'vaapi',
        '-i', rawFilePath,
        '-vf', 'scale_vaapi=w=min(iw\\,1920):h=min(ih\\,1920):force_original_aspect_ratio=decrease,hwdownload,format=nv12',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '21',
        '-g', '30',
        '-keyint_min', '15',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-movflags', '+faststart',
        tempOut
      ];

      // 2. Fallback CPU ultrafast args if VA-API has non-standard filter limits
      const cpuArgs = [
        '-y',
        '-i', rawFilePath,
        '-vf', 'scale=w=min(iw\\,1920):h=min(ih\\,1920):force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '21',
        '-g', '30',
        '-keyint_min', '15',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-movflags', '+faststart',
        tempOut
      ];

      const runFfmpeg = (args, isFallback) => {
        const proc = spawn('ffmpeg', args, { env: customEnv });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(tempOut) && fs.statSync(tempOut).size > 1024) {
            try {
              fs.renameSync(tempOut, cachedPath);
              ongoingPreviewJobs.delete(cacheKey);
              resolve(cachedPath);
            } catch {
              ongoingPreviewJobs.delete(cacheKey);
              resolve(tempOut);
            }
          } else {
            if (!isFallback) {
              console.warn('[previewStream] Hardware VA-API transcode skipped, using CPU:', stderr.slice(-200));
              runFfmpeg(cpuArgs, true);
            } else {
              console.warn('[previewStream] FFmpeg CPU fallback error:', stderr.slice(-300));
              ongoingPreviewJobs.delete(cacheKey);
              try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch (_) { }
              resolve(rawFilePath);
            }
          }
        });

        proc.on('error', (err) => {
          if (!isFallback) {
            runFfmpeg(cpuArgs, true);
          } else {
            ongoingPreviewJobs.delete(cacheKey);
            resolve(rawFilePath);
          }
        });
      };

      runFfmpeg(vaapiArgs, false);
    });

    ongoingPreviewJobs.set(cacheKey, jobPromise);
    return jobPromise;
  } catch (err) {
    return Promise.resolve(rawFilePath);
  }
}

/**
 * Ultra-fast native audio extractor for video files.
 * Extracts high-quality 1-2 MB AAC/M4A in ~30ms using FFmpeg, avoiding 350MB browser downloads.
 */
export function getAudioTrackForMedia(rawFilePath) {
  try {
    const stat = fs.statSync(rawFilePath);
    const ext = path.extname(rawFilePath).toLowerCase();
    const isPureAudio = /\.(mp3|wav|m4a|aac|ogg|flac|opus|wma)$/i.test(ext);
    const cacheKey = crypto.createHash('md5').update(`${rawFilePath}:${stat.size}:${stat.mtimeMs}:audio`).digest('hex');
    const cachedPath = path.join(AUDIO_TRACK_CACHE_DIR, `audio_${cacheKey}.m4a`);

    if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 1024) {
      return Promise.resolve(cachedPath);
    }

    if (ongoingAudioJobs.has(cacheKey)) {
      return ongoingAudioJobs.get(cacheKey);
    }

    const jobPromise = new Promise((resolve) => {
      const tempOut = path.join(AUDIO_TRACK_CACHE_DIR, `temp_${cacheKey}.m4a`);
      // Try fast stream copy first (-c:a copy). If source container is non-standard, fallback to AAC transcode
      const proc = spawn('ffmpeg', [
        '-y',
        '-i', rawFilePath,
        '-vn',
        '-c:a', 'copy',
        tempOut
      ]);

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempOut) && fs.statSync(tempOut).size > 1024) {
          try { fs.renameSync(tempOut, cachedPath); } catch (_) { }
          ongoingAudioJobs.delete(cacheKey);
          resolve(fs.existsSync(cachedPath) ? cachedPath : tempOut);
        } else {
          // Fallback transcode to standard AAC
          const transcodeProc = spawn('ffmpeg', [
            '-y',
            '-i', rawFilePath,
            '-vn',
            '-c:a', 'aac',
            '-b:a', '192k',
            tempOut
          ]);
          transcodeProc.on('close', (tCode) => {
            ongoingAudioJobs.delete(cacheKey);
            if (tCode === 0 && fs.existsSync(tempOut) && fs.statSync(tempOut).size > 1024) {
              try { fs.renameSync(tempOut, cachedPath); } catch (_) { }
              resolve(fs.existsSync(cachedPath) ? cachedPath : tempOut);
            } else {
              try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch (_) { }
              // NEVER return a raw video file as an extracted audio track!
              resolve(isPureAudio ? rawFilePath : null);
            }
          });
        }
      });
      proc.on('error', () => {
        ongoingAudioJobs.delete(cacheKey);
        resolve(isPureAudio ? rawFilePath : null);
      });
    });

    ongoingAudioJobs.set(cacheKey, jobPromise);
    return jobPromise;
  } catch (_) {
    const ext = path.extname(rawFilePath || '').toLowerCase();
    const isPureAudio = /\.(mp3|wav|m4a|aac|ogg|flac|opus|wma)$/i.test(ext);
    return Promise.resolve(isPureAudio ? rawFilePath : null);
  }
}

// In-memory cache for DuckDuckGo search tokens (vqd)
const ddgVqdCache = new Map();

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/mp4', // video/mp4 enables native ISO-BMFF decoding in Chrome/Chromium on Linux
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg'
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


export function mediaStorageMiddleware(req, res, next) {
  // Streams a single media file with Range support. Shared by both the
  // relative /media-library/ endpoint and the absolute /media-library/abs endpoint.
  function serveMediaFile(req, res, filePath) {
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

      if (req.headers['if-none-match'] === etag) {
        res.statusCode = 304;
        res.end();
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag, X-Resolved-Disk-Path');
      res.setHeader('X-Resolved-Disk-Path', filePath);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', contentType);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (start >= fileSize || end >= fileSize || start > end) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          res.end();
          return;
        }
        const chunkSize = (end - start) + 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize);
        const fileStream = fs.createReadStream(filePath, { start, end });
        res.on('close', () => fileStream.destroy());
        fileStream.pipe(res);
        return;
      }

      res.setHeader('Content-Length', fileSize);
      const fileStream = fs.createReadStream(filePath);
      res.on('close', () => fileStream.destroy());
      fileStream.pipe(res);
    } catch (err) {
      console.error('Error serving media file:', err);
      res.statusCode = 500;
      res.end('Error reading media file');
    }
  }

  // On-the-fly streaming bridge for MOV / HEVC / ProRes
  if (req.url && req.url.startsWith('/media-library/stream')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    (async () => {
      try {
        const u = new URL(req.url, 'http://localhost');
        const targetPath = u.searchParams.get('path') || u.searchParams.get('name') || '';
        if (!targetPath) {
          res.statusCode = 400;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'Missing path or name parameter' }));
          return;
        }
        const resolved = resolveMediaFileTolerant(MEDIA_DIR, targetPath);
        if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
          res.statusCode = 404;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'Source media file not found' }));
          return;
        }
        const previewPath = await resolvePreviewSource(resolved);
        serveMediaFile(req, res, previewPath);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
    return;
  }

  // Fast Audio Stream Endpoint: serves lightweight extracted audio (1-2 MB) in ~30ms
  if (req.url && req.url.startsWith('/media-library/audio')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    (async () => {
      try {
        const u = new URL(req.url, 'http://localhost');
        const targetPath = u.searchParams.get('path') || u.searchParams.get('name') || '';
        if (!targetPath) {
          res.statusCode = 400;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'Missing path or name parameter' }));
          return;
        }
        const resolved = resolveMediaFileTolerant(MEDIA_DIR, targetPath);
        if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
          res.statusCode = 404;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'Source media file not found' }));
          return;
        }
        const audioPath = await getAudioTrackForMedia(resolved);
        if (!audioPath || !fs.existsSync(audioPath) || !fs.statSync(audioPath).isFile()) {
          res.statusCode = 404;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Audio track not available or could not be extracted' }));
          return;
        }
        serveMediaFile(req, res, audioPath);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
    return;
  }

  // Serve a media file by ABSOLUTE path, independent of the current MEDIA_DIR.
  // This keeps previously-downloaded assets working after the base folder changes.
  if (req.url && req.url.startsWith('/media-library/abs')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    try {
      const u = new URL(req.url, 'http://localhost');
      const absPath = u.searchParams.get('path');
      if (!absPath) {
        res.statusCode = 400;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: 'Missing absolute path' }));
        return;
      }
      let resolved = path.resolve(absPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        // Tolerant fallback: search by filename in all candidate roots
        const fallback = resolveMediaFileTolerant(MEDIA_DIR, path.basename(absPath));
        if (fallback && fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
          resolved = fallback;
        } else {
          res.statusCode = 404;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'Media file not found' }));
          return;
        }
      }
      serveMediaFile(req, res, resolved);
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }

  if (req.url && req.url.startsWith('/media-library/')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    const rawSubpath = req.url.replace(/^\/media-library\//, '').split('?')[0];
    const decodedPath = decodeURIComponent(rawSubpath);
    const safePath = path.normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = resolveMediaFileTolerant(MEDIA_DIR, safePath);
    const allowedRoots = getCandidateMediaRoots(MEDIA_DIR);
    const isAllowed = filePath && (
      allowedRoots.some(root => filePath.startsWith(root)) ||
      filePath.startsWith(os.homedir())
    );

    if (!isAllowed) {
      res.statusCode = 404;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Media file not found on disk' }));
      return;
    }

    serveMediaFile(req, res, filePath);
    return;
  }

  // -------------------------------------------------------------
  // Native High-Speed FFmpeg Export Engine Endpoints
  // -------------------------------------------------------------
  if (req.url && req.url.startsWith('/api/export/ffmpeg/')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }

    const u = new URL(req.url, 'http://localhost');
    const pathname = u.pathname;

    // 1. Upload mixed audio file
    if (pathname === '/api/export/ffmpeg/upload-audio' && req.method === 'POST') {
      const jobId = u.searchParams.get('jobId') || `job_${Date.now()}`;
      const audioPath = path.resolve(os.tmpdir(), `montage_audio_${jobId}.wav`);
      const writeStream = fs.createWriteStream(audioPath);

      req.pipe(writeStream);
      writeStream.on('finish', () => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: true, audioFilePath: audioPath }));
      });
      writeStream.on('error', (err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: `Error saving audio: ${err.message}` }));
      });
      return;
    }

    // 2. Start FFmpeg Export Job
    if (pathname === '/api/export/ffmpeg/start' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const jobId = data.jobId || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const job = await startFFmpegJob({
            jobId,
            project: data.project,
            settings: data.settings,
            audioFilePath: data.audioFilePath,
            graphicOverlays: data.graphicOverlays || []
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ success: true, jobId }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: err.message || 'Error al iniciar FFmpeg' }));
        }
      });
      return;
    }

    // 3. Status Poll / Progress
    if (pathname === '/api/export/ffmpeg/status' && req.method === 'GET') {
      const jobId = u.searchParams.get('jobId');
      const status = getFFmpegJobStatus(jobId);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(status || { status: 'not_found' }));
      return;
    }

    // 4. Cancel Job
    if (pathname === '/api/export/ffmpeg/cancel' && req.method === 'POST') {
      const jobId = u.searchParams.get('jobId');
      const ok = cancelFFmpegJob(jobId);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ success: ok }));
      return;
    }

    // 5. Download Finished Video
    if (pathname === '/api/export/ffmpeg/download' && req.method === 'GET') {
      const jobId = u.searchParams.get('jobId');
      serveFFmpegOutputFile(req, res, jobId);
      return;
    }
  }

  // Fast Media Transcoder (Converts unsupported MOV, Apple ProRes, MKV into web-friendly MP4 with FFmpeg)
  if (req.url && req.url.startsWith('/api/media/transcode')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }

    if (req.method === 'POST') {
      const u = new URL(req.url, 'http://localhost');
      const rawHeader = req.headers['x-filename'] || u.searchParams.get('filename') || 'video.mov';
      let filename = decodeURIComponent(rawHeader).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!filename.includes('.')) filename += '.mov';

      const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const inputTempPath = path.resolve(os.tmpdir(), `transcode_in_${stamp}_${filename}`);
      const outputTempPath = path.resolve(os.tmpdir(), `transcode_out_${stamp}.mp4`);
      const thumbTempPath = path.resolve(os.tmpdir(), `transcode_thumb_${stamp}.jpg`);

      const writeStream = fs.createWriteStream(inputTempPath);
      req.pipe(writeStream);

      writeStream.on('error', (err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: false, error: 'Write error: ' + err.message }));
      });

      writeStream.on('finish', () => {
        // 1. Run FFmpeg transcode to ultrafast H.264 + AAC MP4 with faststart
        const ffmpegArgs = [
          '-y',
          '-i', inputTempPath,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '22',
          '-g', '30',
          '-keyint_min', '15',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '160k',
          '-movflags', '+faststart',
          outputTempPath
        ];

        const proc = spawn('ffmpeg', ffmpegArgs);
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (code !== 0 || !fs.existsSync(outputTempPath)) {
            console.warn('[transcode] FFmpeg failed:', stderr.slice(-400));
            try { fs.unlinkSync(inputTempPath); } catch (_) { }
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ success: false, error: 'Transcode failed with code ' + code }));
            return;
          }

          // 2. Extract thumbnail
          try {
            const thumbProc = spawn('ffmpeg', [
              '-y',
              '-ss', '00:00:00.5',
              '-i', outputTempPath,
              '-vframes', '1',
              '-q:v', '2',
              thumbTempPath
            ]);
            thumbProc.on('close', () => {
              // 3. Probe duration and dimensions
              const probeProc = spawn('ffprobe', [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height,duration',
                '-of', 'json',
                outputTempPath
              ]);
              let probeData = '';
              probeProc.stdout.on('data', d => { probeData += d.toString(); });
              probeProc.on('close', () => {
                let width = 1280;
                let height = 720;
                let duration = 5;
                try {
                  const parsed = JSON.parse(probeData || '{}');
                  const s = parsed.streams && parsed.streams[0];
                  if (s) {
                    if (s.width) width = Number(s.width);
                    if (s.height) height = Number(s.height);
                    if (s.duration) duration = Number(Number(s.duration).toFixed(2));
                  }
                } catch (_) { }

                // Clean up raw uploaded input
                try { fs.unlinkSync(inputTempPath); } catch (_) { }

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({
                  success: true,
                  transcodedPath: outputTempPath,
                  url: `/media-library/abs?path=${encodeURIComponent(outputTempPath)}`,
                  thumbnailUrl: fs.existsSync(thumbTempPath) ? `/media-library/abs?path=${encodeURIComponent(thumbTempPath)}` : null,
                  duration,
                  width,
                  height
                }));
              });
            });
          } catch (tErr) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({
              success: true,
              transcodedPath: outputTempPath,
              url: `/media-library/abs?path=${encodeURIComponent(outputTempPath)}`,
              duration: 5,
              width: 1280,
              height: 720
            }));
          }
        });
      });
      return;
    }
  }

  // Media probe endpoint: gets video dimensions, rotation, duration, and thumbnail without transcode
  if (req.url && req.url.startsWith('/api/media/probe')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    (async () => {
      try {
        const u = new URL(req.url, 'http://localhost');
        const queryPath = u.searchParams.get('path') || u.searchParams.get('name') || '';
        let resolved = queryPath ? resolveMediaFileTolerant(MEDIA_DIR, queryPath) : null;
        if (!resolved && path.isAbsolute(queryPath) && fs.existsSync(queryPath)) {
          resolved = queryPath;
        }
        if (!resolved) {
          res.statusCode = 404;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'File not found' }));
          return;
        }

        const probeData = await probeMediaFile(resolved);
        const thumbPath = await getThumbnailForMedia(resolved, probeData.duration);
        // Pre-build the proxy in background ONLY when Chromium cannot play the source natively
        if ((probeData.isMov || probeData.isHevc) && !isChromiumFriendly(probeData)) {
          getPreviewStreamForMedia(resolved).catch(() => { });
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({
          ...probeData,
          diskPath: resolved,
          url: `/media-library/abs?path=${encodeURIComponent(resolved)}`,
          previewUrl: `/media-library/stream?path=${encodeURIComponent(resolved)}`,
          thumbnailUrl: thumbPath ? `/media-library/abs?path=${encodeURIComponent(thumbPath)}` : null
        }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // Direct raw asset upload: preserves original filename & format (.MOV untouched!)
  if (req.url && req.url.startsWith('/api/media/upload-asset')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    if (req.method === 'POST') {
      const u = new URL(req.url, 'http://localhost');
      const rawName = req.headers['x-filename'] || u.searchParams.get('name') || 'video.mov';
      const decodedName = decodeURIComponent(rawName);
      const safeName = path.basename(decodedName);

      MEDIA_DIR = resolveBaseMediaDir();
      const targetDir = MEDIA_DIR || path.resolve(PROJECT_ROOT, 'projects_media');
      try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) { }

      let finalTarget = path.join(targetDir, safeName);
      if (fs.existsSync(finalTarget)) {
        const ext = path.extname(safeName);
        const stem = path.basename(safeName, ext);
        finalTarget = path.join(targetDir, `${stem}_${Date.now().toString(36).slice(-4)}${ext}`);
      }

      const writeStream = fs.createWriteStream(finalTarget);
      req.pipe(writeStream);

      writeStream.on('error', (err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: false, error: err.message }));
      });

      writeStream.on('finish', async () => {
        try {
          const probeData = await probeMediaFile(finalTarget);
          if (!probeData.success) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({
              success: false,
              error: `El archivo '${path.basename(finalTarget)}' está incompleto o dañado (falta el encabezado 'moov atom' por desconexión durante la transferencia desde el iPhone). Por favor vuelve a transferirlo.`
            }));
            return;
          }
          const ext = path.extname(finalTarget);
          const stem = path.basename(finalTarget, ext);

          const isMov = ext.toLowerCase() === '.mov';
          const isHevc = probeData.codec === 'hevc' || probeData.codec === 'hvc1';
          const isProRes = probeData.codec === 'prores' || probeData.codec === 'qtrle';
          const isAlreadyH264 = (probeData.codec === 'h264' || probeData.codec === 'avc1') && !isHevc;
          const isAlreadyAdapted = stem.endsWith('_h264') || stem.endsWith('_compat');

          let targetForProject = finalTarget;
          let isAdapted = false;

          // For any iPhone MOV / HEVC / ProRes file:
          // Generate a web-optimized MP4 with tight GOP 30 and faststart for instantaneous frame seeking
          if ((isMov || isHevc || isProRes) && !isAlreadyAdapted) {
            const compatibleTarget = path.join(path.dirname(finalTarget), `${stem}_compat.mp4`);

            if (!fs.existsSync(compatibleTarget) || fs.statSync(compatibleTarget).size < 1024) {
              await new Promise((resolveAdapt) => {
                const ffmpegArgs = [
                  '-y',
                  '-i', finalTarget,
                  '-c:v', 'libx264',
                  '-preset', 'ultrafast',
                  '-crf', '20',
                  '-g', '30',
                  '-keyint_min', '15',
                  '-pix_fmt', 'yuv420p',
                  '-c:a', 'aac',
                  '-b:a', '192k',
                  '-movflags', '+faststart',
                  compatibleTarget
                ];
                const adaptProc = spawn('ffmpeg', ffmpegArgs);
                adaptProc.on('close', (code) => {
                  if (code === 0 && fs.existsSync(compatibleTarget) && fs.statSync(compatibleTarget).size > 1024) {
                    targetForProject = compatibleTarget;
                    isAdapted = true;
                  }
                  resolveAdapt();
                });
                adaptProc.on('error', () => {
                  resolveAdapt();
                });
              });
            } else {
              targetForProject = compatibleTarget;
              isAdapted = true;
            }
          }

          const finalProbe = isAdapted ? await probeMediaFile(targetForProject) : probeData;
          const thumbPath = await getThumbnailForMedia(targetForProject, finalProbe.duration);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            success: true,
            name: path.basename(targetForProject),
            diskPath: targetForProject,
            originalDiskPath: finalTarget,
            originalName: path.basename(finalTarget),
            size: fs.statSync(targetForProject).size,
            url: `/media-library/abs?path=${encodeURIComponent(targetForProject)}`,
            previewUrl: `/media-library/stream?path=${encodeURIComponent(targetForProject)}`,
            thumbnailUrl: thumbPath ? `/media-library/abs?path=${encodeURIComponent(thumbPath)}` : null,
            duration: finalProbe.duration || probeData.duration || 5,
            width: finalProbe.width || 1280,
            height: finalProbe.height || 720,
            rotation: finalProbe.rotation || 0,
            codec: isAdapted ? 'h264' : (finalProbe.codec || 'unknown'),
            isMov: true,
            isAdapted
          }));
        } catch (pErr) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            success: false,
            error: `Error al procesar el archivo '${path.basename(finalTarget)}': ${pErr.message}`
          }));
        }
      });
      return;
    }
  }

  // Direct in-place file adaptation endpoint: creates [name]_h264.mov in the same folder
  if (req.url && req.url.startsWith('/api/media/adapt-file')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    (async () => {
      try {
        const u = new URL(req.url, 'http://localhost');
        const targetPath = u.searchParams.get('path') || '';
        if (!targetPath) {
          res.statusCode = 400;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ success: false, error: 'Missing path' }));
          return;
        }
        const resolved = resolveMediaFileTolerant(MEDIA_DIR, targetPath);
        if (!resolved || !fs.existsSync(resolved)) {
          res.statusCode = 404;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ success: false, error: 'File not found' }));
          return;
        }
        const probeData = await probeMediaFile(resolved);
        if (!probeData.success) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            success: false,
            error: `El archivo '${path.basename(resolved)}' está incompleto o dañado (falta el encabezado 'moov atom').`
          }));
          return;
        }
        const ext = path.extname(resolved);
        const stem = path.basename(resolved, ext);
        const compatibleTarget = path.join(path.dirname(resolved), `${stem}_compat.mp4`);

        if (!fs.existsSync(compatibleTarget) || fs.statSync(compatibleTarget).size < 1024) {
          await new Promise((resolveAdapt) => {
            const ffmpegArgs = [
              '-y',
              '-i', resolved,
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-crf', '20',
              '-g', '30',
              '-keyint_min', '15',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-movflags', '+faststart',
              compatibleTarget
            ];
            const adaptProc = spawn('ffmpeg', ffmpegArgs);
            adaptProc.on('close', resolveAdapt);
            adaptProc.on('error', resolveAdapt);
          });
        }

        if (!fs.existsSync(compatibleTarget) || fs.statSync(compatibleTarget).size < 1024) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            success: false,
            error: `No se pudo adaptar el archivo '${path.basename(resolved)}' a formato compatible.`
          }));
          return;
        }

        const finalProbe = await probeMediaFile(compatibleTarget);
        const thumbPath = await getThumbnailForMedia(compatibleTarget, finalProbe.duration);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({
          success: true,
          name: path.basename(compatibleTarget),
          diskPath: compatibleTarget,
          originalDiskPath: resolved,
          originalName: path.basename(resolved),
          size: fs.statSync(compatibleTarget).size,
          url: `/media-library/abs?path=${encodeURIComponent(compatibleTarget)}`,
          previewUrl: `/media-library/stream?path=${encodeURIComponent(compatibleTarget)}`,
          thumbnailUrl: thumbPath ? `/media-library/abs?path=${encodeURIComponent(thumbPath)}` : null,
          duration: finalProbe.duration || probeData.duration || 5,
          width: finalProbe.width || 1280,
          height: finalProbe.height || 720,
          rotation: finalProbe.rotation || 0,
          codec: 'h264',
          isMov: true,
          isAdapted: true
        }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // Fast Single File Media Resolver
  if (req.url && req.url.startsWith('/api/media/resolve-file')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    const u = new URL(req.url, 'http://localhost');
    const name = u.searchParams.get('name') || '';
    const diskPath = u.searchParams.get('path') || '';
    const resolved = resolveMediaFileTolerant(MEDIA_DIR, diskPath || name);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (resolved) {
      res.end(JSON.stringify({
        found: true,
        diskPath: resolved,
        url: `/media-library/abs?path=${encodeURIComponent(resolved)}`,
        previewUrl: `/media-library/stream?path=${encodeURIComponent(resolved)}`
      }));
    } else {
      res.end(JSON.stringify({ found: false }));
    }
    return;
  }

  // Fast Batch Media Resolver (resolves all project assets in one HTTP round-trip)
  if (req.url && req.url.startsWith('/api/media/resolve-batch')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const assets = Array.isArray(data.assets) ? data.assets : [];
          const results = await Promise.all(assets.map(async (a) => {
            const query = a.diskPath || a.name || '';
            const resolved = query ? resolveMediaFileTolerant(MEDIA_DIR, query) : null;
            let previewUrl = null;
            let thumbnailUrl = null;

            if (resolved) {
              previewUrl = `/media-library/stream?path=${encodeURIComponent(resolved)}`;
              try {
                const thumbPath = await getThumbnailForMedia(resolved);
                if (thumbPath) {
                  thumbnailUrl = `/media-library/abs?path=${encodeURIComponent(thumbPath)}`;
                }
              } catch (_) { }
            }

            return {
              id: a.id,
              name: a.name,
              resolved: !!resolved,
              diskPath: resolved || a.diskPath || null,
              url: resolved ? `/media-library/abs?path=${encodeURIComponent(resolved)}` : a.url,
              previewUrl: previewUrl || a.previewUrl,
              thumbnailUrl: thumbnailUrl || a.thumbnail
            };
          }));
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ results }));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // 1.5. Folder Browser Endpoint (lets the user pick a base folder from inside the app)
  if (req.url && req.url.startsWith('/api/media/browse-folders')) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const requested = urlObj.searchParams.get('path');

      // With no path: return system roots (drives on Windows, / on Unix) + home
      if (!requested) {
        const roots = [];
        if (process.platform === 'win32') {
          for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i) + ':\\';
            if (fs.existsSync(letter)) roots.push({ name: letter, path: letter });
          }
        } else {
          roots.push({ name: '/', path: '/' });
          if (process.env.HOME) roots.push({ name: '~ (' + path.basename(process.env.HOME) + ')', path: process.env.HOME });
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ path: null, parent: null, roots, folders: [] }));
        return;
      }

      const resolved = path.resolve(requested);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Carpeta no encontrada' }));
        return;
      }

      const folders = [];
      for (const e of fs.readdirSync(resolved, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.')) continue; // hide dotfolders
        const full = path.join(resolved, e.name);
        let hasMedia = false;
        try {
          const inner = fs.readdirSync(full, { withFileTypes: true });
          hasMedia = inner.some(f => f.isFile() && /\.(mp4|webm|mov|m4v|mkv|avi|jpg|jpeg|png|webp|gif|mp3|wav|m4a|ogg|aac|flac)$/i.test(f.name));
        } catch (_) { }
        folders.push({ name: e.name, path: full, hasMedia });
      }
      folders.sort((a, b) => a.name.localeCompare(b.name));

      const parent = path.dirname(resolved);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        path: resolved,
        parent: parent === resolved ? null : parent,
        writable: (() => { try { fs.accessSync(resolved, fs.constants.W_OK); return true; } catch (_) { return false; } })(),
        folders
      }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 2. Storage Configuration & Base Directory Endpoints
  if (req.url && req.url.startsWith('/api/media/config')) {
    if (req.method === 'GET') {
      MEDIA_DIR = resolveBaseMediaDir();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        baseMediaDir: MEDIA_DIR,
        exists: fs.existsSync(MEDIA_DIR)
      }));
      return;
    }
    if (req.method === 'POST') {
      let bodyRaw = '';
      req.on('data', chunk => { bodyRaw += chunk; });
      req.on('end', () => {
        try {
          const { baseMediaDir } = JSON.parse(bodyRaw || '{}');
          if (baseMediaDir && typeof baseMediaDir === 'string') {
            const resolved = path.resolve(baseMediaDir);
            if (!fs.existsSync(resolved)) {
              fs.mkdirSync(resolved, { recursive: true });
            }
            MEDIA_DIR = resolved;
            writeMediaConfig({ baseMediaDir: resolved }); // survive restarts
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ success: true, baseMediaDir: MEDIA_DIR }));
          } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Ruta base inválida' }));
          }
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // 2b. Device Identification Endpoint
  if (req.url && req.url.startsWith('/api/media/device-info')) {
    MEDIA_DIR = resolveBaseMediaDir();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const plat = process.platform;
    const platformName = plat === 'darwin' ? 'macOS' : (plat === 'win32' ? 'Windows' : 'Linux');
    let username = 'user';
    try { username = os.userInfo().username; } catch (_) { }
    res.end(JSON.stringify({
      deviceId: getOrCreateDeviceId(),
      deviceName: `${os.hostname()} (${platformName})`,
      hostname: os.hostname(),
      platform: plat,
      platformName,
      username,
      baseMediaDir: MEDIA_DIR
    }));
    return;
  }

  // 2c. Account-Isolated User Settings Endpoint
  if (req.url && req.url.startsWith('/api/media/account-settings')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const u = new URL(req.url, 'http://localhost');
    const uidParam = u.searchParams.get('uid');

    if (req.method === 'GET') {
      if (!uidParam || typeof uidParam !== 'string' || !uidParam.trim()) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'UID de usuario requerido para cargar configuración de cuenta' }));
        return;
      }
      const accountData = readAccountData(uidParam.trim());
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      if (accountData) {
        res.end(JSON.stringify({
          exists: true,
          uid: accountData.uid,
          email: accountData.email || null,
          generalSettings: accountData.generalSettings || null,
          devices: accountData.devices || {},
          updatedAt: accountData.updatedAt || null
        }));
      } else {
        res.end(JSON.stringify({
          exists: false,
          data: null
        }));
      }
      return;
    }

    if (req.method === 'POST') {
      let bodyRaw = '';
      req.on('data', chunk => { bodyRaw += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(bodyRaw || '{}');
          const targetUid = (parsed.uid || uidParam || '').trim();
          if (!targetUid) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'UID de usuario requerido para persistir configuración' }));
            return;
          }
          const saved = writeAccountData(targetUid, parsed);
          if (saved) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: saved }));
          } else {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Error al persistir configuración de cuenta' }));
          }
        } catch (parseErr) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Cuerpo de solicitud inválido' }));
        }
      });
      return;
    }
  }

  // 3. Project Media Folders Listing Endpoint
  if (req.url && req.url.startsWith('/api/media/folders')) {
    try {
      const folders = [];
      if (fs.existsSync(MEDIA_DIR)) {
        const entries = fs.readdirSync(MEDIA_DIR, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            const folderPath = path.join(MEDIA_DIR, e.name);
            let fileCount = 0;
            let totalBytes = 0;
            try {
              const subFiles = fs.readdirSync(folderPath, { withFileTypes: true });
              for (const sf of subFiles) {
                if (sf.isFile()) {
                  fileCount++;
                  totalBytes += fs.statSync(path.join(folderPath, sf.name)).size;
                }
              }
            } catch (_) { }
            folders.push({
              name: e.name,
              fileCount,
              totalBytes,
              formattedSize: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB'
            });
          }
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ folders }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message, folders: [] }));
    }
    return;
  }

  // 3a. Projects Management in Local Projects Folder (.vproj and .json)
  if (req.url && req.url.startsWith('/api/media/projects')) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.end();
      return;
    }

    // GET /api/media/projects -> Scan and list .vproj and .json projects
    if (req.method === 'GET') {
      try {
        MEDIA_DIR = resolveBaseMediaDir();
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
        const targetDir = urlObj.searchParams.get('dir') || MEDIA_DIR;
        const resolvedDir = path.resolve(targetDir);

        const projects = [];
        if (fs.existsSync(resolvedDir)) {
          const scanQueue = [resolvedDir];
          try {
            const rootEntries = fs.readdirSync(resolvedDir, { withFileTypes: true });
            for (const entry of rootEntries) {
              if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                scanQueue.push(path.join(resolvedDir, entry.name));
              }
            }
          } catch (_) { }

          for (const currentScanDir of scanQueue) {
            try {
              const entries = fs.readdirSync(currentScanDir, { withFileTypes: true });
              for (const e of entries) {
                if (e.isFile() && (e.name.endsWith('.vproj') || e.name.endsWith('.json'))) {
                  try {
                    const fullPath = path.join(currentScanDir, e.name);
                    const stat = fs.statSync(fullPath);
                    if (stat.size > 500 * 1024 * 1024) continue;
                    const rawContent = fs.readFileSync(fullPath, 'utf-8');
                    const data = JSON.parse(rawContent);

                    if (data && (data.tracks || data.version || data.settings || data.id)) {
                      const relDir = path.relative(resolvedDir, currentScanDir);
                      const dirName = relDir && relDir !== '.' ? relDir : path.basename(resolvedDir);

                      // Strip heavy diagnostic collage data URLs from listing payload to keep Home Page lightweight
                      let sanitizedScenes = data.scenes;
                      if (sanitizedScenes?.list && Array.isArray(sanitizedScenes.list)) {
                        sanitizedScenes = {
                          ...sanitizedScenes,
                          list: sanitizedScenes.list.map(s => {
                            if (s.visualCollagePreview) {
                              const { visualCollagePreview, ...rest } = s;
                              return rest;
                            }
                            return s;
                          })
                        };
                      }

                      projects.push({
                        id: data.id || e.name.replace(/\.(vproj|json)$/, ''),
                        name: data.name || e.name.replace(/\.(vproj|json)$/, ''),
                        fileName: e.name,
                        filePath: fullPath,
                        relativeDir: relDir,
                        directoryName: dirName,
                        directoryPath: currentScanDir,
                        updatedAt: data.updatedAt || stat.mtime.toISOString(),
                        fileSize: stat.size,
                        aspectRatio: data.settings?.aspectRatio || '16:9',
                        duration: data.settings?.duration || 20,
                        trackCount: data.tracks?.length || 0,
                        assetCount: data.assets?.length || 0,
                        projectData: {
                          ...data,
                          scenes: sanitizedScenes,
                          directoryName: dirName,
                          filePath: fullPath
                        }
                      });
                    }
                  } catch (_) {
                    // Skip invalid json files
                  }
                }
              }
            } catch (_) { }
          }
        }

        projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({
          success: true,
          baseMediaDir: MEDIA_DIR,
          directoryName: path.basename(MEDIA_DIR),
          projects
        }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: err.message, projects: [] }));
      }
      return;
    }

    // POST /api/media/projects/save (or POST /api/media/projects)
    if (req.method === 'POST') {
      let bodyRaw = '';
      req.on('data', chunk => { bodyRaw += chunk; });
      req.on('end', () => {
        try {
          const { project, fileName, filePath, subfolder } = JSON.parse(bodyRaw || '{}');
          if (!project) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Falta objeto de proyecto' }));
            return;
          }

          let targetFolder = MEDIA_DIR;
          if (subfolder && typeof subfolder === 'string') {
            targetFolder = path.join(MEDIA_DIR, subfolder.replace(/^(\.\.(\/|\\|$))+/, ''));
          }
          if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
          }

          let safeFileName = fileName;
          if (!safeFileName) {
            const projName = project.name || 'proyecto';
            safeFileName = `${projName.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.vproj`;
          }
          if (!safeFileName.endsWith('.vproj') && !safeFileName.endsWith('.json')) {
            safeFileName += '.vproj';
          }

          const targetPath = filePath && path.isAbsolute(filePath) ? filePath : path.join(targetFolder, safeFileName);
          project.updatedAt = new Date().toISOString();
          project.directoryName = path.basename(path.dirname(targetPath));

          fs.writeFileSync(targetPath, JSON.stringify(project, null, 2), 'utf-8');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            success: true,
            fileName: path.basename(targetPath),
            filePath: targetPath,
            updatedAt: project.updatedAt
          }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // DELETE /api/media/projects/delete (or DELETE /api/media/projects)
    if (req.method === 'DELETE') {
      let bodyRaw = '';
      req.on('data', chunk => { bodyRaw += chunk; });
      req.on('end', () => {
        try {
          const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
          let targetPath = urlObj.searchParams.get('filePath');
          let fileName = urlObj.searchParams.get('fileName');
          let dir = urlObj.searchParams.get('dir');
          if (bodyRaw) {
            try {
              const parsed = JSON.parse(bodyRaw);
              if (!targetPath && parsed.filePath) targetPath = parsed.filePath;
              if (!fileName && parsed.fileName) fileName = parsed.fileName;
              if (!dir && parsed.dir) dir = parsed.dir;
            } catch (_) { }
          }

          MEDIA_DIR = resolveBaseMediaDir();
          let deleted = false;

          // 1. Direct path check
          if (targetPath) {
            if (fs.existsSync(targetPath)) {
              fs.unlinkSync(targetPath);
              deleted = true;
            } else {
              const resolved = path.resolve(targetPath);
              if (fs.existsSync(resolved)) {
                fs.unlinkSync(resolved);
                deleted = true;
              }
            }
          }

          // 2. Relative or filename resolution in known media directories
          const nameToFind = fileName || (targetPath && !path.isAbsolute(targetPath) ? targetPath : null);
          if (!deleted && nameToFind) {
            const checkDirs = [dir, MEDIA_DIR, path.resolve(PROJECT_ROOT, 'projects_media')].filter(Boolean);
            for (const candidateDir of checkDirs) {
              const candidatePath = path.join(candidateDir, nameToFind);
              if (fs.existsSync(candidatePath)) {
                fs.unlinkSync(candidatePath);
                deleted = true;
                break;
              }
              // Check direct subdirectories
              try {
                const entries = fs.readdirSync(candidateDir, { withFileTypes: true });
                for (const entry of entries) {
                  if (entry.isDirectory()) {
                    const subPath = path.join(candidateDir, entry.name, nameToFind);
                    if (fs.existsSync(subPath)) {
                      fs.unlinkSync(subPath);
                      deleted = true;
                      break;
                    }
                  }
                }
                if (deleted) break;
              } catch (_) { }
            }
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ success: true, deleted }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // 4. Storage Info Endpoint (Supports global or per-project folder stats with 15s caching)
  if (req.url && req.url.startsWith('/api/media/storage-info')) {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
      const requestedFolder = urlObj.searchParams.get('folder');
      const now = Date.now();

      if (global.__storageInfoCache && (now - global.__storageInfoCache.ts) < 15000 && global.__storageInfoCache.folder === requestedFolder) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify(global.__storageInfoCache.payload));
        return;
      }

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

      let folderFiles = 0;
      let folderBytes = 0;
      if (requestedFolder) {
        const safeFolder = requestedFolder.replace(/[^a-zA-Z0-9_\-\s]/g, '_').replace(/\.\./g, '');
        const subDir = path.join(MEDIA_DIR, safeFolder);
        if (fs.existsSync(subDir)) {
          const walkSub = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
              const full = path.join(dir, e.name);
              if (e.isDirectory()) walkSub(full);
              else if (e.isFile()) {
                folderFiles++;
                folderBytes += fs.statSync(full).size;
              }
            }
          };
          walkSub(subDir);
        }
      }

      const payload = {
        mediaDir: MEDIA_DIR,
        folder: requestedFolder || null,
        folderFiles,
        folderBytes,
        folderFormattedSize: (folderBytes / (1024 * 1024)).toFixed(2) + ' MB',
        exists: true,
        totalFiles,
        totalBytes,
        formattedSize: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB'
      };

      global.__storageInfoCache = {
        ts: now,
        folder: requestedFolder,
        payload
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. Media Download Endpoint: Streams remote URL directly to project folder
  if (req.url && req.url.startsWith('/api/media/download') && req.method === 'POST') {
    let bodyRaw = '';
    req.on('data', chunk => { bodyRaw += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyRaw || '{}');
        const { url, filename, projectId = 'global', projectFolder, type = 'video', fallbackUrl } = body;

        if (!url) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing media URL to download' }));
          return;
        }

        // Determine target subfolder (projectFolder takes precedence over projectId)
        const rawFolder = (projectFolder || projectId || 'default').trim();
        const safeFolder = rawFolder
          .replace(/[^a-zA-Z0-9_\-\s]/g, '_')
          .replace(/\.\./g, '')
          .replace(/\s+/g, '_') || 'default';

        const projectDir = path.join(MEDIA_DIR, safeFolder);
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
        const relativeUrl = `/media-library/${encodeURIComponent(safeFolder)}/${safeName}`;
        // Absolute URL: the asset keeps working even if the base folder changes later,
        // because it resolves the real file path directly, not the current MEDIA_DIR.
        const absoluteUrl = `/media-library/abs?path=${encodeURIComponent(targetFilePath)}`;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({
          success: true,
          filename: safeName,
          folder: safeFolder,
          localUrl: absoluteUrl,
          relativeUrl,
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
    const rawOrientation = (urlObj.searchParams.get('orientation') || 'landscape').toLowerCase().trim();
    const orientation = (rawOrientation === 'portrait' || rawOrientation === 'vertical' || rawOrientation === '9:16' || rawOrientation === '4:5')
      ? 'portrait'
      : ((rawOrientation === 'square' || rawOrientation === '1:1') ? 'square' : 'landscape');
    const defaultW = orientation === 'portrait' ? 1080 : (orientation === 'square' ? 1080 : 1920);
    const defaultH = orientation === 'portrait' ? 1920 : (orientation === 'square' ? 1080 : 1080);

    const isItemMatchingOrientation = (w, h) => {
      if (!w || !h) return true;
      if (orientation === 'portrait') return h >= w * 0.95;
      if (orientation === 'square') return Math.abs(w - h) / Math.max(w, h) <= 0.25;
      return w >= h * 0.95;
    };

    (async () => {
      try {
        let results = [];
        let totalResults = 0;
        let hasMore = false;

        // Case A: Pexels API
        if (apiKey && provider === 'pexels') {
          if (type === 'video') {
            const pexelsUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${Math.min(80, Math.max(perPage, 24))}&page=${page}&orientation=${orientation}`;
            const pexRes = await fetch(pexelsUrl, {
              headers: { Authorization: apiKey }
            });
            if (pexRes.ok) {
              const data = await pexRes.json();
              totalResults = data.total_results || 0;
              hasMore = Boolean(data.next_page) || (page * perPage < totalResults);
              results = (data.videos || []).map(v => {
                const files = v.video_files || [];
                const matchingOrientationFiles = files.filter(f => isItemMatchingOrientation(f.width || v.width, f.height || v.height));
                const candidatePool = matchingOrientationFiles.length > 0 ? matchingOrientationFiles : files;
                const bestFile = candidatePool.find(f => f.quality === 'hd' && Math.max(f.width || 0, f.height || 0) >= 1280 && f.file_type === 'video/mp4') ||
                  candidatePool.find(f => f.quality === 'hd' && f.file_type === 'video/mp4') ||
                  candidatePool.find(f => f.file_type === 'video/mp4') ||
                  candidatePool[0] ||
                  files[0];
                const sdFile = candidatePool.find(f => f.quality === 'sd' && f.file_type === 'video/mp4') || bestFile;
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
                  width: bestFile?.width || v.width || defaultW,
                  height: bestFile?.height || v.height || defaultH,
                  orientation
                };
              });
            }
          } else {
            // Photos
            const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(80, Math.max(perPage, 24))}&page=${page}&orientation=${orientation}`;
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
                downloadUrl: orientation === 'portrait'
                  ? (p.src?.portrait || p.src?.large2x || p.src?.original || p.src?.large || '')
                  : (p.src?.large2x || p.src?.original || p.src?.large || ''),
                thumbnail: orientation === 'portrait'
                  ? (p.src?.portrait || p.src?.medium || p.src?.small || '')
                  : (p.src?.small || p.src?.medium || ''),
                keyFrames: [p.src?.large || p.src?.medium || p.src?.small],
                duration: 5,
                width: p.width || defaultW,
                height: p.height || defaultH,
                orientation
              }));
            }
          }
        }

        // Case B: Pixabay API
        if (apiKey && provider === 'pixabay') {
          const safePerPage = Math.max(20, Math.min(200, perPage * 2));
          const cleanQuery = query.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
          const pixOrientation = orientation === 'portrait' ? 'vertical' : (orientation === 'landscape' ? 'horizontal' : 'all');

          if (type === 'video') {
            const fetchPixVideos = async (qStr) => {
              const pixUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(qStr)}&per_page=${safePerPage}&page=${page}`;
              const pixRes = await fetch(pixUrl);
              if (!pixRes.ok) return { totalHits: 0, hits: [] };
              return pixRes.json();
            };

            let data = await fetchPixVideos(cleanQuery);
            // If 0 results and query had > 2 words, retry with the most specific first 2 words
            if ((!data.hits || data.hits.length === 0) && cleanQuery.split(' ').length > 2) {
              const fallbackQ = cleanQuery.split(' ').slice(0, 2).join(' ');
              const fallbackData = await fetchPixVideos(fallbackQ);
              if (fallbackData?.hits?.length > 0) {
                data = fallbackData;
              }
            }

            totalResults = data.totalHits || data.total || 0;
            hasMore = page * perPage < totalResults;
            results = (data.hits || []).map(h => {
              const large = h.videos?.large?.url;
              const medium = h.videos?.medium?.url;
              const small = h.videos?.small?.url;
              const tiny = h.videos?.tiny?.url;
              const thumb = h.videos?.medium?.thumbnail || h.videos?.small?.thumbnail || h.videos?.tiny?.thumbnail || h.videos?.large?.thumbnail || h.userImageURL || '';
              const vidW = h.videos?.large?.width || h.videos?.medium?.width || h.videos?.small?.width || defaultW;
              const vidH = h.videos?.large?.height || h.videos?.medium?.height || h.videos?.small?.height || defaultH;
              return {
                id: `pixabay_v_${h.id}`,
                provider: 'pixabay',
                type: 'video',
                title: h.tags || `Pixabay Video: ${cleanQuery}`,
                tags: h.tags || cleanQuery,
                previewUrl: tiny || small || medium || large || '',
                downloadUrl: medium || large || small || tiny || '',
                thumbnail: thumb,
                keyFrames: [
                  h.videos?.medium?.thumbnail || h.videos?.small?.thumbnail || thumb,
                  h.videos?.large?.thumbnail || thumb
                ].filter(Boolean),
                duration: h.duration || 10,
                width: vidW,
                height: vidH,
                orientation: vidH > vidW ? 'portrait' : (vidW === vidH ? 'square' : 'landscape')
              };
            });
          } else {
            const fetchPixPhotos = async (qStr) => {
              const pixUrl = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(qStr)}&per_page=${safePerPage}&page=${page}&image_type=photo&orientation=${pixOrientation}`;
              const pixRes = await fetch(pixUrl);
              if (!pixRes.ok) return { totalHits: 0, hits: [] };
              return pixRes.json();
            };

            let data = await fetchPixPhotos(cleanQuery);
            if ((!data.hits || data.hits.length === 0) && cleanQuery.split(' ').length > 2) {
              const fallbackQ = cleanQuery.split(' ').slice(0, 2).join(' ');
              const fallbackData = await fetchPixPhotos(fallbackQ);
              if (fallbackData?.hits?.length > 0) {
                data = fallbackData;
              }
            }

            totalResults = data.totalHits || data.total || 0;
            hasMore = page * perPage < totalResults;
            results = (data.hits || []).map(h => ({
              id: `pixabay_p_${h.id}`,
              provider: 'pixabay',
              type: 'image',
              title: h.tags || `Pixabay Photo: ${cleanQuery}`,
              tags: h.tags || cleanQuery,
              previewUrl: h.webformatURL || h.largeImageURL || '',
              downloadUrl: h.largeImageURL || h.webformatURL || '',
              thumbnail: h.webformatURL || h.previewURL || '',
              keyFrames: [h.webformatURL || h.largeImageURL || h.previewURL].filter(Boolean),
              duration: 5,
              width: h.imageWidth || defaultW,
              height: h.imageHeight || defaultH,
              orientation
            }));
          }
        }

        // Filter and prioritize results matching target orientation
        if (results.length > 0) {
          const strictMatches = results.filter(r => isItemMatchingOrientation(r.width, r.height));
          if (strictMatches.length > 0) {
            results = strictMatches;
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
                const wikiVideoUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}+filetype:video&gsrlimit=${Math.max(perPage * 2, 24)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
                const wikiVideoRes = await fetch(wikiVideoUrl, { headers: { 'User-Agent': 'VideoMontageEditor/1.0' } });
                if (wikiVideoRes.ok) {
                  const wikiData = await wikiVideoRes.json();
                  const pages = Object.values(wikiData.query?.pages || {});
                  for (const p of pages) {
                    const info = p.imageinfo?.[0];
                    if (info && info.url) {
                      const w = info.width || defaultW;
                      const h = info.height || defaultH;
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
                        width: w,
                        height: h,
                        orientation: h > w ? 'portrait' : (w === h ? 'square' : 'landscape'),
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
              const bingAspectFilter = orientation === 'portrait'
                ? '&qft=+filterui:aspect-tall'
                : (orientation === 'square' ? '&qft=+filterui:aspect-square' : '&qft=+filterui:aspect-wide');
              const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=${first}${bingAspectFilter}`;
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
                        width: defaultW,
                        height: defaultH,
                        orientation,
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
                const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${Math.max(perPage * 2, 24)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json&origin=*`;
                const wikiRes = await fetch(wikiUrl, { headers: { 'User-Agent': 'VideoMontageEditor/1.0' } });
                if (wikiRes.ok) {
                  const wikiData = await wikiRes.json();
                  const pages = Object.values(wikiData.query?.pages || {});
                  for (const p of pages) {
                    const info = p.imageinfo?.[0];
                    if (info && info.url) {
                      const w = info.width || defaultW;
                      const h = info.height || defaultH;
                      if (!isItemMatchingOrientation(w, h) && pages.length > 4) continue;
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
                        width: w,
                        height: h,
                        orientation,
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

        const isWeb = provider === 'web' || provider === 'duckduckgo' || (results.length > 0 && results[0]?.provider === 'web');
        const resolvedProvider = isWeb ? 'web' : (apiKey ? provider : 'web');

        let filteredResults = type === 'video'
          ? results.filter(r => r.type === 'video')
          : results;

        // Final strict orientation filter/prioritization
        const matchingFinal = filteredResults.filter(r => isItemMatchingOrientation(r.width, r.height));
        if (matchingFinal.length > 0) {
          filteredResults = matchingFinal.slice(0, perPage);
        } else {
          filteredResults = filteredResults.slice(0, perPage);
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({
          query,
          type: type === 'video' ? 'video' : (isWeb ? 'image' : type),
          orientation,
          page,
          perPage,
          totalResults: Math.max(totalResults, filteredResults.length),
          hasMore,
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
}

export function aiProxyMiddleware(req, res, next) {
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

        forwardHeaders['connection'] = 'close';
        delete forwardHeaders['keep-alive'];

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
          controller.abort(new Error('AI Request Timeout (45s excedidos)'));
        }, 45000);

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
            redirect: 'follow'
          });
          clearTimeout(timeoutId);
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (!res.headersSent) {
            res.statusCode = 504;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: { message: fetchErr.message || 'Timeout o error de conexión con la API de IA' } }));
            return;
          }
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
            try { reader.cancel().catch(() => { }); } catch { }
          };
          controller.signal.addEventListener('abort', cancelOnAbort, { once: true });

          // Stream inactivity watchdog: if 25s pass without any chunks, abort to prevent hang
          let streamWatchdog = null;
          const resetStreamWatchdog = () => {
            if (streamWatchdog) clearTimeout(streamWatchdog);
            streamWatchdog = setTimeout(() => {
              controller.abort(new Error('Inactividad en upstream stream (25s)'));
            }, 25000);
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
}

export function mediaStoragePlugin() {
  const plugin = {
    name: 'media-storage-middleware',
    configureServer(server) {
      server.middlewares.use(mediaStorageMiddleware);
    }
  };
  plugin.configurePreviewServer = plugin.configureServer;
  return plugin;
}

export function aiProxyPlugin() {
  const plugin = {
    name: 'ai-proxy-middleware',
    configureServer(server) {
      server.middlewares.use(aiProxyMiddleware);
    }
  };
  plugin.configurePreviewServer = plugin.configureServer;
  return plugin;
}

export {
  CURATED_STOCK_LIBRARY,
  MIME_TYPES,
  resolveBaseMediaDir,
  readMediaConfig,
  writeMediaConfig,
  resolveMediaFileTolerant,
  getCandidateMediaRoots,
  normalizeMediaKey
};
