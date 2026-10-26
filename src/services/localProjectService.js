/**
 * Local System Project Management Service
 * 
 * Interacts with the backend media/project engine and Electron native APIs
 * to seamlessly list, load, save, and persist .vproj project files in the
 * machine's designated local projects folder.
 */

export function isElectronDesktop() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isDesktop);
}

/**
 * Prompts the user using Electron native folder picker if running in desktop app,
 * returning the absolute filesystem path on the host system.
 */
export async function pickDesktopFolder() {
  if (isElectronDesktop() && typeof window.electronAPI?.selectFolder === 'function') {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      return folderPath || null;
    } catch (err) {
      console.warn('[localProjectService] Error picking native folder:', err);
    }
  }
  return null;
}

/**
 * Opens a folder or file in the native OS file explorer (Windows Explorer, Finder, Nautilus)
 */
export async function openFolderInOS(targetPath) {
  if (isElectronDesktop() && typeof window.electronAPI?.openPath === 'function') {
    try {
      await window.electronAPI.openPath(targetPath);
      return true;
    } catch (_) {}
  }
  return false;
}

/**
 * Fetches all .vproj and .json projects from the machine's configured local directory.
 */
export async function fetchDiskProjects(targetDir = null) {
  try {
    const query = targetDir ? `?dir=${encodeURIComponent(targetDir)}` : '';
    const res = await fetch(`/api/media/projects${query}`);
    if (res.ok) {
      const data = await res.json();
      return {
        success: Boolean(data.success),
        baseMediaDir: data.baseMediaDir || null,
        directoryName: data.directoryName || (data.baseMediaDir ? data.baseMediaDir.split(/[/\\]/).filter(Boolean).pop() : 'Carpeta Local'),
        projects: Array.isArray(data.projects) ? data.projects : []
      };
    }
  } catch (err) {
    console.warn('[localProjectService] Could not fetch projects from backend:', err);
  }
  return {
    success: false,
    baseMediaDir: null,
    directoryName: null,
    projects: []
  };
}

/**
 * Saves a .vproj project directly to the local machine hard drive in the configured directory.
 */
export async function saveDiskProject(project, { fileName = null, filePath = null, subfolder = null } = {}) {
  if (!project) return { success: false, error: 'No project data provided' };
  try {
    const res = await fetch('/api/media/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        fileName,
        filePath,
        subfolder
      })
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: Boolean(data.success),
        fileName: data.fileName,
        filePath: data.filePath,
        updatedAt: data.updatedAt
      };
    }
  } catch (err) {
    console.warn('[localProjectService] Could not save project to disk:', err);
  }
  return { success: false, error: 'Network or disk error' };
}

/**
 * Deletes a project file from the local machine hard drive.
 */
export async function deleteDiskProject(filePath, fileName = null, dir = null) {
  if (!filePath && !fileName) return { success: false };
  try {
    const params = new URLSearchParams();
    if (filePath) params.set('filePath', filePath);
    if (fileName) params.set('fileName', fileName);
    if (dir) params.set('dir', dir);

    const res = await fetch(`/api/media/projects?${params.toString()}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, fileName, dir })
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({ success: true }));
      return { success: Boolean(data.success) };
    }
  } catch (err) {
    console.warn('[localProjectService] Could not delete project from disk:', err);
  }
  return { success: false };
}
