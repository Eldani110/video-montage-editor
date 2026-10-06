/**
 * Local File System & Directory Access Service
 * Uses the File System Access API with comprehensive fallback to standard File API.
 */

// In-memory handle cache for direct disk saving
const fileHandlesMap = new Map();

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/**
 * Prompts user to select a folder on their local hard drive
 */
export async function pickLocalDirectory() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Tu navegador no soporta File System Access API nativa. Usa la opción de abrir archivos o selección de carpeta alternativa.');
  }

  const dirHandle = await window.showDirectoryPicker({
    id: 'montage-pro-projects-dir',
    mode: 'readwrite',
    startIn: 'documents'
  });

  return dirHandle;
}

/**
 * Checks or requests permission for a directory handle.
 * If requestIfPrompt is false, only queries status without popping up dialog (safe for page load).
 */
export async function verifyDirectoryPermission(dirHandle, requestIfPrompt = false, readWrite = true) {
  if (!dirHandle) return false;
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  try {
    if (typeof dirHandle.queryPermission === 'function') {
      const status = await dirHandle.queryPermission(options);
      if (status === 'granted') {
        return true;
      }
      if (status === 'prompt' && requestIfPrompt && typeof dirHandle.requestPermission === 'function') {
        const reqStatus = await dirHandle.requestPermission(options);
        return reqStatus === 'granted';
      }
    }
  } catch (err) {
    console.warn('Could not query/request directory permission:', err);
  }
  return false;
}

/**
 * Scans a directory handle for .vproj and .json project files
 */
export async function scanDirectoryForProjects(dirHandle) {
  if (!dirHandle) return [];
  const projects = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && (entry.name.endsWith('.vproj') || entry.name.endsWith('.json'))) {
      try {
        const file = await entry.getFile();
        const text = await file.text();
        const data = JSON.parse(text);

        // Verify it looks like a Montage Pro project
        if (data && (data.tracks || data.version || data.settings)) {
          // Cache handle for immediate saving
          fileHandlesMap.set(data.id || entry.name, entry);

          projects.push({
            id: data.id || entry.name,
            name: data.name || entry.name.replace(/\.(vproj|json)$/, ''),
            fileName: entry.name,
            directoryName: dirHandle.name,
            updatedAt: data.updatedAt || new Date(file.lastModified).toISOString(),
            fileSize: file.size,
            aspectRatio: data.settings?.aspectRatio || '16:9',
            duration: data.settings?.duration || 20,
            trackCount: data.tracks?.length || 0,
            assetCount: data.assets?.length || 0,
            projectData: {
              ...data,
              directoryName: dirHandle.name
            },
            fileHandle: entry
          });
        }
      } catch (err) {
        console.warn(`Error reading project file ${entry.name}:`, err);
      }
    }
  }

  // Sort by updatedAt descending
  return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Checks if a project has an active file handle in memory
 */
export function hasDiskFileHandle(projectId) {
  return fileHandlesMap.has(projectId);
}

/**
 * Saves project data to disk via an existing file handle or creates a new file in directory.
 * When silentOnly is true, it only writes to an already bound file handle or directory without prompting pickers.
 */
export async function saveProjectToDisk(project, dirHandle = null, existingFileHandle = null, silentOnly = false) {
  const fileName = project.fileName || `${(project.name || 'proyecto').toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.vproj`;
  project.updatedAt = new Date().toISOString();
  if (dirHandle && !project.directoryName) {
    project.directoryName = dirHandle.name;
  }

  let targetHandle = existingFileHandle || fileHandlesMap.get(project.id);

  // If no handle yet but we have directory handle, create or get file
  if (!targetHandle && dirHandle) {
    try {
      targetHandle = await dirHandle.getFileHandle(fileName, { create: true });
      fileHandlesMap.set(project.id, targetHandle);
    } catch (e) {
      // Permission might be needed or folder not writeable
    }
  }

  if (targetHandle && typeof targetHandle.createWritable === 'function') {
    try {
      const writable = await targetHandle.createWritable();
      await writable.write(JSON.stringify(project, null, 2));
      await writable.close();
      return { success: true, fileName: targetHandle.name, handle: targetHandle, isDiskFile: true };
    } catch (writeErr) {
      console.warn('Error writing to disk handle:', writeErr);
      if (silentOnly) {
        return { success: false, reason: 'write_failed', error: writeErr };
      }
    }
  }

  // If silentOnly is true (used by background autosave), DO NOT open file dialog or trigger browser download!
  if (silentOnly) {
    return { success: false, reason: 'no_existing_handle' };
  }

  // Fallback to Save File Picker if available
  if (typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{
        description: 'Proyecto de Video Montage (.vproj)',
        accept: { 'application/json': ['.vproj', '.json'] }
      }]
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(project, null, 2));
    await writable.close();
    fileHandlesMap.set(project.id, handle);
    return { success: true, fileName: handle.name, handle, isDiskFile: true };
  }

  // Universal browser download fallback
  exportProjectAsDownload(project, fileName);
  return { success: true, fileName, downloaded: true };
}

/**
 * Direct file download fallback
 */
export function exportProjectAsDownload(project, customName = null) {
  const fileName = customName || project.fileName || `${(project.name || 'proyecto').toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.vproj`;
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open project from an input file element
 */
export function readProjectFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const project = JSON.parse(e.target.result);
        if (!project.id) project.id = 'proj_' + Date.now();
        project.fileName = file.name;
        resolve(project);
      } catch (err) {
        reject(new Error('El archivo no contiene un formato de proyecto válido.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo del disco.'));
    reader.readAsText(file);
  });
}
