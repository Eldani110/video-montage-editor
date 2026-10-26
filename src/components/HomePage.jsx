import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  Plus,
  Upload,
  Film,
  Sparkles,
  Clock,
  Layers,
  HardDrive,
  RefreshCw,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Play,
  Settings,
  Unlink,
  Database,
  ExternalLink
} from 'lucide-react';
import {
  isFileSystemAccessSupported,
  pickLocalDirectory,
  scanDirectoryForProjects,
  readProjectFromFile,
  exportProjectAsDownload,
  verifyDirectoryPermission,
  deleteProjectFromDirectoryHandle,
  saveProjectToDisk
} from '../utils/fileSystem';
import {
  getAllCachedProjects,
  deleteCachedProject,
  deleteCachedProjectByFileName,
  saveProjectToCache,
  saveStoredDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
  getStoredDirectoryNameFallback
} from '../utils/storage';
import { createNewProjectTemplate } from '../utils/sampleData';
import { NewProjectModal } from './NewProjectModal';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { FolderPickerModal } from './FolderPickerModal';
import { UserNav } from './UserNav';
import { useAuth } from '../context/AuthContext';
import { saveDeviceMediaDir } from '../services/userSettingsService';
import { getCurrentDeviceInfo } from '../services/deviceService';
import { getStorageConfig } from '../utils/stockMediaClient';
import {
  isElectronDesktop,
  pickDesktopFolder,
  openFolderInOS,
  fetchDiskProjects,
  saveDiskProject,
  deleteDiskProject
} from '../services/localProjectService';

export function HomePage({ onOpenProject, currentDirHandle, setCurrentDirHandle, onGoToAuth }) {
  const { user } = useAuth();
  const [folderProjects, setFolderProjects] = useState([]);
  const [cachedProjects, setCachedProjects] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [localFolderPath, setLocalFolderPath] = useState(null);
  const [directoryName, setDirectoryName] = useState(currentDirHandle?.name || (user ? getStoredDirectoryNameFallback() : null) || null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFolderPickerModal, setShowFolderPickerModal] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Load cached projects and persistent local system directory on start
  useEffect(() => {
    document.title = 'Mis Proyectos • Montage Studio';
    loadCachedProjectsList();

    const initDirectory = async () => {
      setIsScanning(true);
      try {
        // 1. When NO user is authenticated (guest mode or before login):
        if (!user) {
          const savedLocalDir = (typeof localStorage !== 'undefined' ? localStorage.getItem('montage_device_local_dir') : null);
          if (savedLocalDir && typeof savedLocalDir === 'string' && savedLocalDir.trim()) {
            const cleanDir = savedLocalDir.trim();
            setLocalFolderPath(cleanDir);
            const simpleName = cleanDir.split(/[/\\]/).filter(Boolean).pop() || cleanDir;
            setDirectoryName(simpleName);
            setNeedsPermission(false);
            const diskRes = await fetchDiskProjects(cleanDir);
            if (diskRes.success) {
              setFolderProjects(diskRes.projects);
            }
            setIsScanning(false);
            return;
          }

          let handle = currentDirHandle;
          if (!handle) {
            const stored = await getStoredDirectoryHandle();
            if (stored && stored.handle) {
              handle = stored.handle;
              setCurrentDirHandle(handle);
              setDirectoryName(stored.name || handle.name);
            }
          }

          if (handle) {
            setDirectoryName(handle.name);
            await scanHandleFolder(handle, false);
          } else {
            // Clean empty state: no folder preselected in incognito / guest mode!
            setLocalFolderPath(null);
            setDirectoryName(null);
            setFolderProjects([]);
            setNeedsPermission(false);
          }
          setIsScanning(false);
          return;
        }

        // 2. When user IS authenticated: restore only this user's registered folder for this device
        const savedUserDir = (typeof localStorage !== 'undefined' ? localStorage.getItem('montage_device_local_dir') : null);
        if (savedUserDir && typeof savedUserDir === 'string' && savedUserDir.trim()) {
          const cleanDir = savedUserDir.trim();
          setLocalFolderPath(cleanDir);
          const simpleName = cleanDir.split(/[/\\]/).filter(Boolean).pop() || cleanDir;
          setDirectoryName(simpleName);
          setNeedsPermission(false);

          const diskRes = await fetchDiskProjects(cleanDir);
          if (diskRes.success) {
            setFolderProjects(diskRes.projects);
          }
        } else {
          // Authenticated user with no folder registered for this device yet
          setLocalFolderPath(null);
          setDirectoryName(null);
          setFolderProjects([]);
          setNeedsPermission(false);
        }
      } catch (err) {
        console.warn('Error initializing project directory:', err);
      } finally {
        setIsScanning(false);
      }
    };

    initDirectory();

    // Listen for device folder synchronization events (e.g. from Global Settings Modal or Login)
    const handleDeviceFolderSynced = (e) => {
      if (e.detail?.baseMediaDir) {
        const newPath = e.detail.baseMediaDir;
        setLocalFolderPath(newPath);
        const simpleName = newPath.split(/[/\\]/).filter(Boolean).pop() || newPath;
        setDirectoryName(simpleName);
        setNeedsPermission(false);
        rescanDiskFolder(newPath);
      } else {
        // baseMediaDir is null (e.g. on logout or user unlinking folder)
        setLocalFolderPath(null);
        setDirectoryName(null);
        setFolderProjects([]);
        setNeedsPermission(false);
      }
    };

    window.addEventListener('montage_device_folder_synced', handleDeviceFolderSynced);
    return () => {
      window.removeEventListener('montage_device_folder_synced', handleDeviceFolderSynced);
    };
  }, [user, currentDirHandle]);

  const loadCachedProjectsList = async () => {
    try {
      const list = await getAllCachedProjects();
      setCachedProjects(list || []);
    } catch (_) {
      setCachedProjects([]);
    }
  };

  // Rescan disk projects from the local system folder
  const rescanDiskFolder = async (targetDir = null) => {
    setIsScanning(true);
    try {
      const dirToScan = targetDir || localFolderPath;
      if (dirToScan) {
        const diskRes = await fetchDiskProjects(dirToScan);
        if (diskRes.success) {
          setFolderProjects(diskRes.projects);
          return;
        }
      }
      if (currentDirHandle) {
        await scanHandleFolder(currentDirHandle, true);
      }
    } catch (err) {
      console.warn('Error rescanning local folder:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Scan browser handle for .vproj and .json files
  const scanHandleFolder = async (dirHandle, userTriggered = false) => {
    if (!dirHandle) return;
    setIsScanning(true);
    try {
      const hasPerm = await verifyDirectoryPermission(dirHandle, userTriggered, false);
      if (!hasPerm) {
        setNeedsPermission(true);
        setDirectoryName(dirHandle.name);
        return;
      }
      setNeedsPermission(false);
      const list = await scanDirectoryForProjects(dirHandle);
      setFolderProjects(list);
      setDirectoryName(dirHandle.name);
    } catch (err) {
      console.error('Error scanning folder handle:', err);
      if (err.name === 'NotAllowedError') {
        setNeedsPermission(true);
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Pick folder: Opens in-app folder picker directly (with native OS explorer button available inside for Desktop)
  const handleSelectFolder = () => {
    setShowFolderPickerModal(true);
  };

  // Applies a real filesystem path to the current device and persists it
  const applySelectedLocalPath = async (newPath) => {
    if (!newPath) return;
    const cleanPath = newPath.trim();
    if (!cleanPath) return;
    setIsScanning(true);
    try {
      setLocalFolderPath(cleanPath);
      const simpleName = cleanPath.split(/[/\\]/).filter(Boolean).pop() || cleanPath;
      setDirectoryName(simpleName);
      setNeedsPermission(false);

      // Persist to local machine disk and user account in Firestore for this hardware device
      await saveDeviceMediaDir(user, cleanPath);

      // Fetch projects immediately from this folder
      const diskRes = await fetchDiskProjects(cleanPath);
      if (diskRes.success) {
        setFolderProjects(diskRes.projects);
        for (const p of diskRes.projects) {
          if (p.projectData) {
            saveProjectToCache(p.projectData, simpleName);
          }
        }
      }
      await loadCachedProjectsList();
    } catch (err) {
      console.error('Error applying selected local folder path:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Reconectar acceso si el navegador requiere confirmación
  const handleConnectFolder = async () => {
    if (localFolderPath) {
      await rescanDiskFolder(localFolderPath);
      return;
    }
    let handle = currentDirHandle;
    if (!handle) {
      const stored = await getStoredDirectoryHandle();
      handle = stored?.handle;
      if (handle) {
        setCurrentDirHandle(handle);
      }
    }
    if (!handle) {
      handleSelectFolder();
      return;
    }
    try {
      const granted = await verifyDirectoryPermission(handle, true, false);
      if (granted) {
        setNeedsPermission(false);
        await scanHandleFolder(handle, true);
        await loadCachedProjectsList();
      } else {
        handleSelectFolder();
      }
    } catch (err) {
      console.warn('Error requesting directory permission:', err);
      handleSelectFolder();
    }
  };

  // Desvincular carpeta de la base de datos local
  const handleClearFolder = async () => {
    setCurrentDirHandle(null);
    setLocalFolderPath(null);
    setDirectoryName(null);
    setFolderProjects([]);
    setNeedsPermission(false);
    await clearStoredDirectoryHandle();
    try {
      localStorage.removeItem('montage_device_local_dir');
    } catch (_) {}
  };

  // Create new project and associate with current directory on disk and in cache
  const handleCreateNewProject = async (newProj) => {
    if (directoryName) {
      newProj.directoryName = directoryName;
    }
    // 1. Guardar en caché local
    await saveProjectToCache(newProj, directoryName);

    // 2. Guardar archivo físico .vproj en la carpeta local del sistema
    if (localFolderPath) {
      try {
        const diskRes = await saveDiskProject(newProj, { dir: localFolderPath });
        if (diskRes.success) {
          newProj.filePath = diskRes.filePath;
          newProj.fileName = diskRes.fileName;
        }
      } catch (_) {}
    } else if (currentDirHandle) {
      try {
        const handleRes = await saveProjectToDisk(newProj, currentDirHandle);
        if (handleRes?.success && handleRes.fileName) {
          newProj.fileName = handleRes.fileName;
        }
      } catch (_) {}
    }

    await loadCachedProjectsList();
    if (localFolderPath) {
      await rescanDiskFolder(localFolderPath);
    }
    onOpenProject(newProj);
  };

  // Fallback folder picker using <input webkitdirectory>
  const handleFolderUploadFallback = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    const projects = [];

    for (const file of Array.from(files)) {
      if (file.name.endsWith('.vproj') || file.name.endsWith('.json')) {
        try {
          const project = await readProjectFromFile(file);
          project.directoryName = 'Carpeta Seleccionada';
          await saveProjectToCache(project, 'Carpeta Seleccionada');
          projects.push({
            id: project.id,
            name: project.name || file.name,
            fileName: file.name,
            directoryName: 'Carpeta Seleccionada',
            updatedAt: project.updatedAt || new Date(file.lastModified).toISOString(),
            aspectRatio: project.settings?.aspectRatio || '16:9',
            duration: project.settings?.duration || 20,
            trackCount: project.tracks?.length || 0,
            assetCount: project.assets?.length || 0,
            projectData: project
          });
        } catch {
          // ignore non-project json
        }
      }
    }

    setFolderProjects(projects);
    setDirectoryName('Carpeta Seleccionada');
    setIsScanning(false);
    loadCachedProjectsList();
  };

  // Open single file from disk
  const handleOpenSingleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const project = await readProjectFromFile(file);
      await saveProjectToCache(project, directoryName);
      await loadCachedProjectsList();
      onOpenProject(project);
    } catch (err) {
      alert('Error al abrir el archivo de proyecto: ' + err.message);
    }
  };

  // Load pre-made demo project
  const handleLoadDemoProject = () => {
    const demo = createNewProjectTemplate('Montaje Paisajes & Música');
    onOpenProject(demo);
  };

  // Delete project from disk, browser directory handle, and local cache
  const handleDeleteProject = async (project, e) => {
    e.stopPropagation();
    const projName = project.name || project.fileName || 'este proyecto';
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el proyecto "${projName}"?`)) {
      return;
    }

    setIsScanning(true);
    try {
      const projectId = project.id;
      const filePath = project.filePath || (localFolderPath && project.fileName ? `${localFolderPath}/${project.fileName}` : null);
      const fileName = project.fileName || (project.filePath ? project.filePath.split(/[/\\]/).pop() : null);

      // 1. Delete physical file on disk via backend
      if (filePath || fileName) {
        await deleteDiskProject(filePath, fileName, localFolderPath);
      }

      // 2. Delete from browser directory handle if active
      if (currentDirHandle && fileName) {
        await deleteProjectFromDirectoryHandle(currentDirHandle, fileName, projectId);
      }

      // 3. Delete from IndexedDB & localStorage cache
      if (projectId) {
        await deleteCachedProject(projectId);
      }
      if (fileName) {
        await deleteCachedProjectByFileName(fileName);
      }

      // 4. Update UI immediately
      setFolderProjects(prev => prev.filter(p => 
        p.id !== projectId && 
        (!fileName || p.fileName !== fileName) && 
        (!filePath || p.filePath !== filePath)
      ));
      setCachedProjects(prev => prev.filter(p => 
        p.id !== projectId && 
        (!fileName || p.fileName !== fileName) && 
        (!filePath || p.filePath !== filePath)
      ));

      // 5. Fresh disk rescan
      if (localFolderPath) {
        const diskRes = await fetchDiskProjects(localFolderPath);
        if (diskRes.success) {
          setFolderProjects(diskRes.projects);
        }
      } else if (currentDirHandle) {
        await scanHandleFolder(currentDirHandle, true);
      }
      await loadCachedProjectsList();
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Error al eliminar el proyecto: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleDownloadCopy = (project, e) => {
    e.stopPropagation();
    exportProjectAsDownload(project.projectData || project);
  };

  // Single unified list of projects for the local folder
  const displayedProjects = React.useMemo(() => {
    const map = new Map();

    // 1. Projects found directly in the local folder / disk
    folderProjects.forEach(p => {
      if (p) {
        const key = p.id || p.filePath || p.fileName;
        if (key) map.set(key, p);
      }
    });

    // 2. Include any cached project that belongs to this local directory if not already listed
    cachedProjects.forEach(p => {
      if (p) {
        const key = p.id || p.filePath || p.fileName;
        const matchesDir = !directoryName || p.directoryName === directoryName || (p.filePath && localFolderPath && p.filePath.startsWith(localFolderPath));
        if (matchesDir && key && !map.has(key)) {
          const duplicateFile = p.fileName && Array.from(map.values()).some(existing => existing.fileName === p.fileName);
          if (!duplicateFile) {
            map.set(key, p);
          }
        }
      }
    });

    // 3. Fallback: If no folder is linked at all, show any cached projects
    if (!directoryName && !localFolderPath && !currentDirHandle && map.size === 0) {
      cachedProjects.forEach(p => {
        if (p) {
          const key = p.id || p.filePath || p.fileName;
          if (key && !map.has(key)) map.set(key, p);
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }, [folderProjects, cachedProjects, directoryName, localFolderPath, currentDirHandle]);

  return (
    <div className="home-container">
      {/* Studio Header */}
      <header className="home-header">
        <div className="home-brand">
          <div className="brand-logo">
            <Film size={26} className="text-white" />
          </div>
          <div>
            <h1 className="brand-title">Montage Pro Studio</h1>
            <p className="brand-subtitle">
              Editor de video por capas & línea de tiempo para archivos locales
            </p>
          </div>
        </div>

        <div className="home-header-actions">
          <button
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            title="Abrir un archivo individual .vproj desde cualquier lugar de tu disco"
          >
            <FolderOpen size={16} />
            Abrir Archivo (.vproj)
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleOpenSingleFile}
            accept=".vproj,.json"
            style={{ display: 'none' }}
          />

          <button
            className="btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            title="Configuración General del Editor e IA Agéntica (Ollama Cloud, DeepSeek)"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Settings size={15} style={{ color: '#818cf8' }} />
            Configuración IA
          </button>

          <button
            className="btn-primary"
            onClick={() => setShowNewModal(true)}
          >
            <Plus size={16} />
            Nuevo Proyecto
          </button>

          <div className="header-action-divider" style={{ width: '1px', height: '24px', background: 'var(--border-subtle)', margin: '0 4px' }} />

          <UserNav onGoToAuth={onGoToAuth} />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="home-content">
        {/* Local Folder Selector Banner */}
        <div className="folder-selection-card">
          <div className="folder-info">
            <div className="folder-icon-circle">
              <HardDrive size={28} className="text-indigo" />
            </div>
            <div>
              <div className="folder-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3>Carpeta de Proyectos del Sistema Local</h3>
                {directoryName && (
                  <>
                    <span className={`badge ${needsPermission ? 'badge-amber' : 'badge-emerald'}`}>
                      {needsPermission ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                      {directoryName} {needsPermission ? '(Permiso en pausa)' : ''}
                    </span>
                    {localFolderPath && (
                      <span className="badge badge-indigo" title={localFolderPath} style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <HardDrive size={11} /> {localFolderPath}
                      </span>
                    )}
                    <span className="badge badge-indigo" title="Carpeta asignada y guardada en este equipo">
                      <Database size={11} /> Vinculada a este Dispositivo
                    </span>
                  </>
                )}
              </div>
              <p className="folder-desc">
                {needsPermission
                  ? `La carpeta "${directoryName}" está guardada en tu base de datos local. Haz clic en "Reconectar Acceso" para que el navegador reactive los permisos y muestre tus proyectos.`
                  : (directoryName
                      ? `Mostrando proyectos .vproj guardados en "${localFolderPath || directoryName}" (registrada para este equipo). Los proyectos y cambios se guardan permanentemente en tu disco.`
                      : 'Selecciona una carpeta de tu disco duro para cargarla y guardarla en la base de datos con persistencia automática por dispositivo.')}
              </p>
            </div>
          </div>

          <div className="folder-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {needsPermission && (
              <button
                className="btn-amber"
                onClick={handleConnectFolder}
                title="Habilitar permiso para leer y escribir en esta carpeta"
              >
                <AlertCircle size={16} />
                Reconectar Acceso
              </button>
            )}

            {isElectronDesktop() && localFolderPath && (
              <button
                className="btn-secondary"
                onClick={() => openFolderInOS(localFolderPath)}
                title="Abrir carpeta en el explorador de archivos del sistema"
              >
                <Folder size={16} />
                Abrir en Explorador
              </button>
            )}

            <button className="btn-primary" onClick={handleSelectFolder}>
              <FolderOpen size={16} />
              {directoryName ? 'Cambiar Carpeta Local' : 'Seleccionar Carpeta Local'}
            </button>

            <input
              type="file"
              ref={folderInputRef}
              onChange={handleFolderUploadFallback}
              webkitdirectory="true"
              directory="true"
              multiple
              style={{ display: 'none' }}
            />

            {directoryName && (
              <>
                <button
                  className="btn-secondary icon-only"
                  onClick={() => rescanDiskFolder()}
                  title="Volver a escanear carpeta de proyectos"
                  disabled={isScanning}
                >
                  <RefreshCw size={16} className={isScanning ? 'spinner' : ''} />
                </button>

                <button
                  className="btn-ghost icon-only text-dim"
                  onClick={handleClearFolder}
                  title="Desvincular carpeta de este equipo"
                >
                  <Unlink size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Quick Demo Banner */}
        <div className="demo-banner">
          <div className="demo-content">
            <Sparkles size={20} className="text-amber" />
            <div>
              <strong>¿Quieres probar el editor de inmediato?</strong>
              <p>Carga un montaje de demostración con 4 imágenes 4K de prueba y pista de música ya configuradas.</p>
            </div>
          </div>
          <button className="btn-secondary" onClick={handleLoadDemoProject}>
            <Play size={14} />
            Cargar Proyecto Demo
          </button>
        </div>

        {/* Unified Projects Section */}
        <div className="projects-section">
          <div className="section-header">
            <div className="section-title-group">
              <Folder size={18} className="text-indigo" />
              <h2>Proyectos en Carpeta Local {displayedProjects.length > 0 ? `(${displayedProjects.length})` : ''}</h2>
            </div>
            {directoryName && (
              <span className="section-meta">
                {needsPermission ? 'Copia local disponible • Requiere reconectar disco' : 'Archivos .vproj sincronizados con tu carpeta local'}
              </span>
            )}
          </div>

          {needsPermission && directoryName && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#fcd34d' }}>
                  El navegador pausó el permiso de lectura en "{directoryName}". Haz clic en Reconectar para sincronizar el disco.
                </span>
              </div>
              <button className="btn-amber btn-sm" onClick={handleConnectFolder}>
                <RefreshCw size={13} />
                Reconectar Acceso a Disco
              </button>
            </div>
          )}

          {displayedProjects.length === 0 ? (
            <div className="empty-projects-card">
              <Film size={40} className="text-dim" />
              <h4>{directoryName ? 'No se encontraron proyectos .vproj en esta carpeta' : 'No hay carpeta seleccionada'}</h4>
              <p>
                {directoryName
                  ? 'Crea un nuevo proyecto para guardarlo en esta carpeta, o carga el montaje de demostración.'
                  : 'Haz clic en "Seleccionar Carpeta Local" arriba para cargar los archivos de tu sistema.'}
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  className="btn-primary"
                  onClick={() => setShowNewModal(true)}
                >
                  <Plus size={15} />
                  Crear Nuevo Proyecto
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleLoadDemoProject}
                >
                  <Play size={14} />
                  Cargar Proyecto Demo
                </button>
              </div>
            </div>
          ) : (
            <div className="projects-grid">
              {displayedProjects.map((p) => {
                const projId = p.id || p.projectData?.id || p.fileName;
                const projUrl = `/project/${encodeURIComponent(projId)}`;

                return (
                  <a
                    key={p.id || p.filePath || p.fileName}
                    href={projUrl}
                    className="project-card"
                    onClick={(e) => {
                      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        onOpenProject(p.projectData || p);
                      }
                    }}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="project-thumbnail-box">
                      <div className="project-preview-art">
                        <FileVideo size={44} className="text-indigo" />
                      </div>
                      <span className="project-aspect-badge">{p.aspectRatio || p.settings?.aspectRatio || '16:9'}</span>
                    </div>

                    <div className="project-details">
                      <h4 className="project-name" title={p.name}>{p.name}</h4>
                      <span className="project-filename text-dim">{p.fileName || p.directoryName || 'Archivo de Proyecto'}</span>

                      <div className="project-meta-row">
                        <span className="meta-item">
                          <Clock size={12} />
                          {p.duration || p.settings?.duration || 20}s
                        </span>
                        <span className="meta-item">
                          <Layers size={12} />
                          {p.trackCount || p.tracks?.length || 0} pistas
                        </span>
                      </div>

                      <div className="project-footer">
                        <span className="project-date">
                          {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'Reciente'}
                        </span>
                        <div className="project-card-actions">
                          <button
                            className="btn-ghost icon-only btn-xs"
                            title="Abrir en una pestaña nueva"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(projUrl, '_blank');
                            }}
                          >
                            <ExternalLink size={13} />
                          </button>
                          <button
                            className="btn-ghost icon-only btn-xs btn-delete-project"
                            title="Eliminar proyecto permanentemente"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteProject(p, e);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            className="btn-ghost icon-only btn-xs"
                            title="Descargar copia (.vproj)"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDownloadCopy(p, e);
                            }}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            className="btn-primary btn-xs"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenProject(p.projectData || p);
                            }}
                          >
                            Abrir
                          </button>
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreateProject={handleCreateNewProject}
      />

      {/* Global Settings & AI Agent Modal */}
      <GlobalSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* Host System Folder Browser Modal */}
      <FolderPickerModal
        isOpen={showFolderPickerModal}
        onClose={() => setShowFolderPickerModal(false)}
        initialPath={localFolderPath || null}
        title="Seleccionar Carpeta de Proyectos del Sistema Local"
        onSelect={(selectedPath) => {
          applySelectedLocalPath(selectedPath);
        }}
      />
    </div>
  );
}
