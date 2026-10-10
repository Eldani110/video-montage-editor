/**
 * IndexedDB Local Storage for Montage Projects and Media Assets (Clipchamp-style local persistence)
 * Supports persistent File System Directory Handles and Project metadata
 */

const DB_NAME = 'MontageProStudioDB';
const DB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_MEDIA = 'media_assets';
const STORE_SETTINGS = 'app_settings';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('IndexedDB open request timed out'));
      }
    }, 3500);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onblocked = () => {
      console.warn('IndexedDB upgrade blocked by another connection');
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      }
    };

    request.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        dbPromise = null;
        reject(request.error);
      }
    };
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

/**
 * Saves active local project directory handle to IndexedDB for persistent reconnection
 */
export async function saveStoredDirectoryHandle(dirHandle) {
  if (!dirHandle) return false;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.put({
        key: 'active_project_directory',
        handle: dirHandle,
        name: dirHandle.name,
        updatedAt: new Date().toISOString()
      });
      req.onsuccess = () => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('montage_saved_dir_name', dirHandle.name);
          }
        } catch (_) {}
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not save directory handle to IndexedDB:', err);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('montage_saved_dir_name', dirHandle.name);
      }
    } catch (_) {}
    return false;
  }
}

/**
 * Retrieves the saved local project directory handle from IndexedDB
 */
export async function getStoredDirectoryHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.get('active_project_directory');
      req.onsuccess = () => {
        const result = req.result;
        if (result && result.handle) {
          resolve({
            handle: result.handle,
            name: result.name || result.handle.name,
            updatedAt: result.updatedAt
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not get stored directory handle from IndexedDB:', err);
    return null;
  }
}

/**
 * Saves the local MEDIA folder handle (Clipchamp-style) to IndexedDB.
 */
export async function saveStoredMediaDirHandle(dirHandle) {
  if (!dirHandle) return false;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.put({
        key: 'active_media_directory',
        handle: dirHandle,
        name: dirHandle.name,
        updatedAt: new Date().toISOString()
      });
      req.onsuccess = () => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('montage_media_dir_name', dirHandle.name);
          }
        } catch (_) {}
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not save media directory handle to IndexedDB:', err);
    return false;
  }
}

/**
 * Retrieves the saved local MEDIA folder handle from IndexedDB.
 */
export async function getStoredMediaDirHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.get('active_media_directory');
      req.onsuccess = () => {
        const result = req.result;
        if (result && result.handle) {
          resolve({
            handle: result.handle,
            name: result.name || result.handle.name,
            updatedAt: result.updatedAt
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not get media directory handle from IndexedDB:', err);
    return null;
  }
}

/**
 * Clears the saved MEDIA folder handle from IndexedDB.
 */
export async function clearStoredMediaDirHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.delete('active_media_directory');
      req.onsuccess = () => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('montage_media_dir_name');
          }
        } catch (_) {}
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not clear media directory handle from IndexedDB:', err);
    return false;
  }
}

/**
 * Gets the saved MEDIA folder name from localStorage as instant fallback.
 */
export function getStoredMediaDirNameFallback() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('montage_media_dir_name');
    }
  } catch (_) {}
  return null;
}

/**
 * Clears the saved directory handle from IndexedDB
 */
export async function clearStoredDirectoryHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.delete('active_project_directory');
      req.onsuccess = () => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('montage_saved_dir_name');
          }
        } catch (_) {}
        resolve(true);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not clear stored directory handle from IndexedDB:', err);
    return false;
  }
}

/**
 * Gets the saved directory name from localStorage as instant fallback
 */
export function getStoredDirectoryNameFallback() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('montage_saved_dir_name');
    }
  } catch (_) {}
  return null;
}

/**
 * Saves raw File / Blob directly to local IndexedDB (zero memory overhead)
 */
export async function saveMediaBlob(id, blob, metadata = {}) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.put({
        id,
        blob,
        name: metadata.name || 'recurso',
        type: metadata.type || blob.type,
        updatedAt: new Date().toISOString()
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not save media blob to IndexedDB:', err);
    return false;
  }
}

/**
 * Retrieves raw File / Blob from local IndexedDB
 */
export async function getMediaBlob(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_MEDIA);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not get media blob from IndexedDB:', err);
    return null;
  }
}

/**
 * Saves or updates project in local IndexedDB cache, attaching directory info
 */
export async function saveProjectToCache(project, directoryName = null) {
  if (!project) return false;
  const dirName = directoryName || project.directoryName || getStoredDirectoryNameFallback();
  const cleanProject = {
    ...project,
    directoryName: dirName || null,
    updatedAt: project.updatedAt || new Date().toISOString()
  };

  // 1. Instant fail-safe localStorage backup
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('montage_cached_projects_backup');
      const list = raw ? JSON.parse(raw) : [];
      const summary = {
        id: cleanProject.id,
        name: cleanProject.name || 'Proyecto',
        directoryName: dirName || null,
        updatedAt: cleanProject.updatedAt,
        settings: cleanProject.settings,
        trackCount: cleanProject.tracks?.length || 0,
        assetCount: cleanProject.assets?.length || 0,
        tracks: cleanProject.tracks,
        assets: cleanProject.assets?.map(a => ({
          ...a,
          url: a.url?.startsWith('data:') && a.url.length > 50000 ? '' : a.url
        })),
        scenes: cleanProject.scenes,
        transcript: cleanProject.transcript
      };
      const filtered = list.filter(p => p && p.id !== summary.id);
      filtered.unshift(summary);
      localStorage.setItem('montage_cached_projects_backup', JSON.stringify(filtered.slice(0, 15)));
    }
  } catch (_) {}

  // 2. Full IndexedDB persistence
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.put(cleanProject);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not cache project in IndexedDB:', err);
    return false;
  }
}

export async function getAllCachedProjects() {
  let dbList = [];
  try {
    const db = await openDB();
    dbList = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not read cached projects from IndexedDB:', err);
  }

  // Merge with localStorage backup
  let lsList = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('montage_cached_projects_backup');
      if (raw) {
        lsList = JSON.parse(raw);
      }
    }
  } catch (_) {}

  const map = new Map();
  lsList.forEach(p => { if (p && p.id) map.set(p.id, p); });
  dbList.forEach(p => { if (p && p.id) map.set(p.id, p); });

  const merged = Array.from(map.values());
  return merged.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getCachedProject(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not get project from IndexedDB:', err);
    return null;
  }
}

export async function deleteCachedProject(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not delete project from IndexedDB:', err);
  }
}
