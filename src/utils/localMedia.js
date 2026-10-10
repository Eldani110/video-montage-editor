/**
 * Local Media Folder Service — Clipchamp-style disk access via File System Access API.
 *
 * The user picks a real folder on their own hard drive (e.g. C:\MontageMedia).
 * That folder is where every project's media (B-roll, uploads, recordings) lives.
 * Access is browser -> user's disk, so it works identically whether the app is
 * opened locally or from a remote server over the internet. The server never
 * touches these files.
 *
 * The directory handle is persisted in IndexedDB so it can be re-connected on
 * later visits (browsers re-prompt for permission once per session).
 */

import {
  saveStoredMediaDirHandle,
  getStoredMediaDirHandle,
  clearStoredMediaDirHandle
} from './storage';

export function isLocalMediaSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/**
 * Prompts the user to pick a local media folder on their disk.
 * Returns the directory handle.
 */
export async function pickLocalMediaFolder() {
  if (!isLocalMediaSupported()) {
    throw new Error('Tu navegador no soporta acceso a carpetas locales. Usa Chrome o Edge.');
  }
  const handle = await window.showDirectoryPicker({
    id: 'montage-pro-media-dir',
    mode: 'readwrite',
    startIn: 'documents'
  });
  await saveStoredMediaDirHandle(handle);
  return handle;
}

/**
 * Returns the persisted media folder handle (if any) after verifying/requesting permission.
 * @param {boolean} requestIfPrompt - whether to show the permission prompt if needed
 */
export async function getConnectedMediaFolder(requestIfPrompt = false) {
  const stored = await getStoredMediaDirHandle();
  if (!stored || !stored.handle) return null;

  const handle = stored.handle;
  const opts = { mode: 'readwrite' };
  try {
    if (typeof handle.queryPermission === 'function') {
      let status = await handle.queryPermission(opts);
      if (status !== 'granted' && requestIfPrompt && typeof handle.requestPermission === 'function') {
        status = await handle.requestPermission(opts);
      }
      if (status !== 'granted') return { handle, name: handle.name, needsPermission: true };
    }
  } catch (err) {
    console.warn('Could not query media folder permission:', err);
  }
  return { handle, name: handle.name, needsPermission: false };
}

/**
 * Disconnects the current media folder.
 */
export async function disconnectMediaFolder() {
  await clearStoredMediaDirHandle();
}

// ---- file operations (flat: files live directly inside the chosen folder) ----

/**
 * Writes a blob/file directly into the chosen folder (no per-project subfolder).
 * Returns metadata including a blob: URL for immediate use.
 */
export async function writeLocalMediaFile({ rootHandle, filename, blob }) {
  if (!rootHandle) throw new Error('No hay carpeta de medios conectada.');
  const fileHandle = await rootHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  const written = await fileHandle.getFile();
  const objectUrl = URL.createObjectURL(written);

  return {
    filename,
    diskPath: filename,
    size: written.size,
    lastModified: written.lastModified,
    objectUrl,
    file: written
  };
}

/**
 * Reads a file directly from the chosen folder.
 * Returns a File object plus a fresh blob: URL.
 */
export async function readLocalMediaFile({ rootHandle, filename }) {
  if (!rootHandle) throw new Error('No hay carpeta de medios conectada.');
  const fileHandle = await rootHandle.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return { file, objectUrl: URL.createObjectURL(file) };
}

/**
 * Lists all media files directly inside the chosen folder.
 * Optionally recurses into subfolders so nested collections are found too.
 */
export async function listLocalMediaFiles({ rootHandle, recursive = true }) {
  if (!rootHandle) return [];

  const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi']);
  const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif']);
  const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac']);

  const files = [];

  async function walk(dirHandle, relParts) {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory') {
        if (recursive) await walk(entry, [...relParts, entry.name]);
        continue;
      }
      const ext = (entry.name.split('.').pop() || '').toLowerCase();
      let type = null;
      if (VIDEO_EXT.has(ext)) type = 'video';
      else if (IMAGE_EXT.has(ext)) type = 'image';
      else if (AUDIO_EXT.has(ext)) type = 'audio';
      if (!type) continue;

      let size = 0;
      let lastModified = 0;
      try {
        const file = await entry.getFile();
        size = file.size;
        lastModified = file.lastModified;
      } catch (_) {}

      files.push({
        filename: entry.name,
        relPath: [...relParts, entry.name].join('/'),
        handle: entry,
        type,
        ext,
        size,
        mtimeMs: lastModified
      });
    }
  }

  await walk(rootHandle, []);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

/**
 * Deletes a file from the chosen folder (supports nested relative paths).
 */
export async function deleteLocalMediaFile({ rootHandle, filename, relPath = null }) {
  if (!rootHandle) throw new Error('No hay carpeta de medios conectada.');
  const segments = String(relPath || filename).split('/').filter(Boolean);
  let dir = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segments[i]);
  }
  await dir.removeEntry(segments[segments.length - 1]);
  return true;
}

/**
 * Finds a file by name (case-insensitive) anywhere in the chosen folder tree.
 * Used to self-heal asset URLs after the folder changed.
 */
export async function locateLocalMediaFile({ rootHandle, filename }) {
  if (!rootHandle || !filename) return null;
  const targetLower = String(filename).toLowerCase();
  const targetKey = normalizeKey(filename);

  async function searchDir(dirHandle, relParts) {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory') {
        const found = await searchDir(entry, [...relParts, entry.name]);
        if (found) return found;
      } else if (entry.kind === 'file') {
        if (entry.name.toLowerCase() === targetLower || normalizeKey(entry.name) === targetKey) {
          return {
            filename: entry.name,
            relPath: [...relParts, entry.name].join('/'),
            diskPath: [...relParts, entry.name].join('/'),
            handle: entry
          };
        }
      }
    }
    return null;
  }

  return await searchDir(rootHandle, []);
}

/**
 * Reads a file by its relative path (supports nested folders).
 */
export async function readLocalMediaFileByPath({ rootHandle, relPath }) {
  if (!rootHandle) throw new Error('No hay carpeta de medios conectada.');
  const segments = String(relPath).split('/').filter(Boolean);
  let dir = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segments[i]);
  }
  const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
  const file = await fileHandle.getFile();
  return { file, objectUrl: URL.createObjectURL(file) };
}

function normalizeKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
