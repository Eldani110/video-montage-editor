/**
 * Comprehensive Media Type & File Detection Utilities
 * 
 * Ensures 100% compatibility with Apple QuickTime (.mov), MP4, WebM, MKV, AVI,
 * as well as common audio and image formats.
 * 
 * Resolves browser quirks where OS file pickers or drag-and-drop report:
 * - Empty string `file.type === ""`
 * - Generic `file.type === "application/octet-stream"`
 * - Missing mime-type associations on Linux/Windows for .mov and .mkv
 */

export const ACCEPTED_MEDIA_TYPES_INPUT = [
  'image/*',
  'audio/*',
  'video/*',
  // Apple QuickTime / iOS
  '.mov',
  '.qt',
  // Video Containers
  '.mp4',
  '.m4v',
  '.webm',
  '.mkv',
  '.avi',
  '.wmv',
  '.flv',
  '.ts',
  '.mts',
  '.m2ts',
  '.3gp',
  '.ogv',
  // Audio Containers
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.flac',
  '.wma',
  '.opus',
  '.aiff',
  '.aif',
  '.alac',
  // Image Formats
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.avif'
].join(',');

const VIDEO_EXTENSIONS = new Set([
  '.mov', '.qt', '.mp4', '.m4v', '.webm', '.mkv',
  '.avi', '.wmv', '.flv', '.ts', '.mts', '.m2ts',
  '.3gp', '.3g2', '.ogv', '.vob', '.asf'
]);

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga',
  '.flac', '.wma', '.opus', '.aif', '.aiff', '.alac',
  '.mid', '.midi'
]);

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.bmp', '.ico', '.tiff', '.tif', '.avif'
]);

/**
 * Accurately determines if a file or object represents an image, audio, or video,
 * combining MIME type inspection with filename extension fallback.
 * 
 * @param {File|Blob|object} file File or object with name and type properties
 * @returns {{ type: 'video'|'audio'|'image', mime: string, extension: string, isMov: boolean } | null}
 */
export function detectMediaType(file) {
  if (!file) return null;

  const rawName = String(file.name || '').trim();
  const rawType = String(file.type || '').trim().toLowerCase();

  const dotIdx = rawName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? rawName.slice(dotIdx).toLowerCase() : '';

  // 1. Apple QuickTime (.mov / .qt) explicit check
  if (ext === '.mov' || ext === '.qt' || rawType === 'video/quicktime') {
    return {
      type: 'video',
      mime: 'video/quicktime',
      extension: ext || '.mov',
      isMov: true
    };
  }

  // 2. Video checks (MIME or Extension)
  if (rawType.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
    let mime = rawType && rawType.startsWith('video/') ? rawType : 'video/mp4';
    if (ext === '.webm') mime = 'video/webm';
    else if (ext === '.mkv') mime = 'video/x-matroska';
    else if (ext === '.avi') mime = 'video/x-msvideo';
    else if (ext === '.wmv') mime = 'video/x-ms-wmv';
    else if (ext === '.flv') mime = 'video/x-flv';
    else if (ext === '.ts' || ext === '.mts') mime = 'video/mp2t';
    else if (ext === '.3gp') mime = 'video/3gpp';

    return {
      type: 'video',
      mime,
      extension: ext || '.mp4',
      isMov: false
    };
  }

  // 3. Audio checks (MIME or Extension)
  if (rawType.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
    let mime = rawType && rawType.startsWith('audio/') ? rawType : 'audio/mpeg';
    if (ext === '.wav') mime = 'audio/wav';
    else if (ext === '.m4a') mime = 'audio/mp4';
    else if (ext === '.aac') mime = 'audio/aac';
    else if (ext === '.ogg' || ext === '.oga') mime = 'audio/ogg';
    else if (ext === '.flac') mime = 'audio/flac';
    else if (ext === '.opus') mime = 'audio/opus';
    else if (ext === '.aiff' || ext === '.aif') mime = 'audio/aiff';

    return {
      type: 'audio',
      mime,
      extension: ext || '.mp3',
      isMov: false
    };
  }

  // 4. Image checks (MIME or Extension)
  if (rawType.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
    let mime = rawType && rawType.startsWith('image/') ? rawType : 'image/jpeg';
    if (ext === '.png') mime = 'image/png';
    else if (ext === '.webp') mime = 'image/webp';
    else if (ext === '.gif') mime = 'image/gif';
    else if (ext === '.svg') mime = 'image/svg+xml';
    else if (ext === '.bmp') mime = 'image/bmp';
    else if (ext === '.avif') mime = 'image/avif';

    return {
      type: 'image',
      mime,
      extension: ext || '.jpg',
      isMov: false
    };
  }

  return null;
}

/**
 * Ensures a File or Blob has a non-empty, web-friendly MIME type.
 * Fixes issues where browsers assign "" or "application/octet-stream" to .mov files.
 */
export function normalizeMediaFile(file) {
  if (!file) return file;
  const info = detectMediaType(file);
  if (!info) return file;

  // If MIME is missing or generic octet-stream, wrap in a new File with the detected MIME
  if (!file.type || file.type === 'application/octet-stream') {
    try {
      const fileName = file.name || `recurso${info.extension}`;
      return new File([file], fileName, { type: info.mime });
    } catch {
      return file;
    }
  }

  return file;
}

/**
 * Generates an SVG video badge placeholder thumbnail when native video decoding
 * fails or is loading.
 */
export function generateVideoPlaceholderThumbnail(title = 'Video', isMov = false) {
  const badge = isMov ? 'MOV' : 'VIDEO';
  const color = isMov ? '#06b6d4' : '#6366f1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <rect width="320" height="180" fill="#0f172a"/>
    <rect x="10" y="10" width="300" height="160" rx="8" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <circle cx="160" cy="80" r="28" fill="${color}" opacity="0.85"/>
    <polygon points="152,66 174,80 152,94" fill="#ffffff"/>
    <rect x="20" y="20" width="48" height="20" rx="4" fill="${color}"/>
    <text x="44" y="34" font-family="sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">${badge}</text>
    <text x="160" y="132" font-family="sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">${title.slice(0, 32)}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Extracts metadata (duration, width, height, thumbnail) from any video file.
 * Automatically handles .mov and various containers with robust timeout protection.
 * If native playback fails (e.g. Apple ProRes in .mov), it attempts a transparent
 * backend transcode via FFmpeg.
 * 
 * @param {File|Blob} file Normalized media file
 * @param {string} objectUrl Object URL pointing to the file
 * @returns {Promise<{ duration: number, width: number, height: number, thumbnail: string, isTranscoded?: boolean, transcodedUrl?: string }>}
 */
export async function extractVideoMetadata(file, objectUrl) {
  const mediaInfo = detectMediaType(file);
  const isMov = mediaInfo?.isMov || (file.name && /\.mov$/i.test(file.name));

  // 1. First attempt: Query backend probe endpoint (fastest, supports full 10-bit HEVC & ProRes)
  if (typeof window !== 'undefined') {
    try {
      const filePath = file.path || '';
      const probeQuery = filePath
        ? `path=${encodeURIComponent(filePath)}`
        : `name=${encodeURIComponent(file.name)}`;
      const resp = await fetch(`/api/media/probe?${probeQuery}`);
      if (resp.ok) {
        const p = await resp.json();
        if (p.success) {
          return {
            duration: p.duration || 5,
            width: p.width || 1280,
            height: p.height || 720,
            rotation: p.rotation || 0,
            thumbnail: p.thumbnailUrl || generateVideoPlaceholderThumbnail(file.name, isMov),
            previewUrl: p.previewUrl,
            diskPath: p.diskPath
          };
        }
      }
    } catch (_) {}
  }

  // 2. Fallback: Native HTML5 video metadata reader for local browser objectUrl without uploading megabytes
  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(safetyTimer);
      tempVid.removeEventListener('loadedmetadata', onMetadata);
      tempVid.removeEventListener('seeked', onSeeked);
      tempVid.removeEventListener('error', onError);
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const safetyTimer = setTimeout(() => {
      if (settled) return;
      finish({
        duration: 5,
        width: 1280,
        height: 720,
        thumbnail: generateVideoPlaceholderThumbnail(file.name, isMov)
      });
    }, 3500);

    const tempVid = document.createElement('video');
    tempVid.preload = 'metadata';
    tempVid.muted = true;
    tempVid.playsInline = true;
    tempVid.crossOrigin = 'anonymous';

    let duration = 5;
    let width = 1280;
    let height = 720;

    const onMetadata = () => {
      if (isFinite(tempVid.duration) && tempVid.duration > 0) {
        duration = Number(tempVid.duration.toFixed(2));
      }
      if (tempVid.videoWidth && tempVid.videoHeight) {
        width = tempVid.videoWidth;
        height = tempVid.videoHeight;
      }

      const targetSeekTime = Math.max(0.05, Math.min(0.5, duration / 2));
      try {
        tempVid.currentTime = targetSeekTime;
      } catch {
        finish({
          duration,
          width,
          height,
          thumbnail: generateVideoPlaceholderThumbnail(file.name, isMov)
        });
      }
    };

    const onSeeked = () => {
      let thumbnail = null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tempVid, 0, 0, 160, 90);
        thumbnail = canvas.toDataURL('image/jpeg', 0.85);
      } catch {
        thumbnail = generateVideoPlaceholderThumbnail(file.name, isMov);
      }

      finish({
        duration,
        width,
        height,
        thumbnail: thumbnail || generateVideoPlaceholderThumbnail(file.name, isMov)
      });
    };

    const onError = async () => {
      // If native browser video playback failed (e.g. Apple ProRes or HEVC inside .mov):
      // Try fast backend transcode via FFmpeg!
      try {
        const transcodeRes = await attemptBackendTranscode(file);
        if (transcodeRes && transcodeRes.success) {
          finish({
            duration: transcodeRes.duration || 5,
            width: transcodeRes.width || 1280,
            height: transcodeRes.height || 720,
            thumbnail: transcodeRes.thumbnailUrl || generateVideoPlaceholderThumbnail(file.name, isMov),
            isTranscoded: true,
            transcodedUrl: transcodeRes.url,
            previewUrl: transcodeRes.url,
            diskPath: transcodeRes.transcodedPath
          });
          return;
        }
      } catch (_) {}

      finish({
        duration: 5,
        width: 1280,
        height: 720,
        thumbnail: generateVideoPlaceholderThumbnail(file.name, isMov)
      });
    };

    tempVid.addEventListener('loadedmetadata', onMetadata);
    tempVid.addEventListener('seeked', onSeeked);
    tempVid.addEventListener('error', onError);

    tempVid.src = objectUrl;
  });
}

/**
 * Attempts backend transcoding via local FFmpeg service
 */
export async function attemptBackendTranscode(file) {
  if (!file || typeof window === 'undefined') return null;

  try {
    const rawName = file.name || 'video.mov';
    const resp = await fetch(`/api/media/transcode?filename=${encodeURIComponent(rawName)}`, {
      method: 'POST',
      headers: {
        'x-filename': encodeURIComponent(rawName),
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: file
    });

    if (resp.ok) {
      const data = await resp.json();
      return data;
    }
  } catch (err) {
    console.warn('[attemptBackendTranscode] HTTP error:', err);
  }

  return null;
}

/**
 * Uploads a raw media file to the local machine's media storage folder,
 * returning full disk path, FFmpeg-probed metadata, and preview streaming URLs.
 * Automatically adapts iPhone .MOV (HEVC/ProRes) to a compatible H.264 .mov in that folder.
 */
export async function uploadMediaAsset(file, targetDir = null, onProgress = null) {
  if (!file || typeof window === 'undefined') return null;

  return new Promise((resolve) => {
    try {
      const rawName = file.name || 'video.mov';
      const query = new URLSearchParams({ name: rawName });
      if (targetDir) query.set('dir', targetDir);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/media/upload-asset?${query.toString()}`);
      xhr.setRequestHeader('x-filename', encodeURIComponent(rawName));
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            // Upload takes up to 45% of total progress, remaining 55% is server FFmpeg probe/adapt
            const p = Math.round((e.loaded / e.total) * 45);
            onProgress(p, 'Subiendo video a carpeta de medios...');
          }
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data && data.success) {
            if (onProgress) onProgress(100, '¡Video adaptado con éxito!');
            resolve(data);
            return;
          }
          if (data && data.error) {
            resolve({ success: false, error: data.error });
            return;
          }
        } catch (_) {}
        resolve(null);
      };

      xhr.onerror = () => {
        resolve({ success: false, error: 'Error de red al subir el archivo multimedia.' });
      };

      xhr.send(file);
    } catch (err) {
      console.warn('[uploadMediaAsset] Error:', err);
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Directly adapts an existing media file on disk to a compatible H.264 .mov in the same directory.
 */
export async function adaptLocalDiskFile(filePath) {
  if (!filePath || typeof window === 'undefined') return null;
  try {
    const resp = await fetch(`/api/media/adapt-file?path=${encodeURIComponent(filePath)}`, { method: 'POST' });
    const data = await resp.json().catch(() => null);
    if (data && data.success) return data;
    if (data && data.error) return { success: false, error: data.error };
  } catch (_) {}
  return null;
}
