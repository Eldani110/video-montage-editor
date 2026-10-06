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
  Database
} from 'lucide-react';
import {
  isFileSystemAccessSupported,
  pickLocalDirectory,
  scanDirectoryForProjects,
  readProjectFromFile,
  exportProjectAsDownload,
  verifyDirectoryPermission
} from '../utils/fileSystem';
import {
  getAllCachedProjects,
  deleteCachedProject,
  saveProjectToCache,
  saveStoredDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
  getStoredDirectoryNameFallback
} from '../utils/storage';
import { createNewProjectTemplate } from '../utils/sampleData';
import { NewProjectModal } from './NewProjectModal';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { UserNav } from './UserNav';

export function HomePage({ onOpenProject, currentDirHandle, setCurrentDirHandle, onGoToAuth }) {
  const [folderProjects, setFolderProjects] = useState([]);
  const [cachedProjects, setCachedProjects] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [directoryName, setDirectoryName] = useState(currentDirHandle?.name || getStoredDirectoryNameFallback() || null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'folder', 'cached'

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Load cached projects and persistent directory from IndexedDB on start
  useEffect(() => {
    loadCachedProjectsList();

    const initDirectory = async () => {
      let handle = currentDirHandle;
      if (!handle) {
        const stored = await getStoredDirectoryHandle();
        if (stored && stored.handle) {
          handle = stored.handle;
          setCurrentDirHandle(handle);
          setDirectoryName(stored.name || handle.name);
        } else {
          const fallbackName = getStoredDirectoryNameFallback();
          if (fallbackName) {
            setDirectoryName(fallbackName);
          }
        }
      }

      if (handle) {
        setDirectoryName(handle.name);
        scanFolder(handle, false);
      }
    };

    initDirectory();
  }, [currentDirHandle]);

  const loadCachedProjectsList = async () => {
    const list = await getAllCachedProjects();
    setCachedProjects(list);
    // If no projects in cache, create and cache a starter demo project so projects are always available out of the box
    if (list.length === 0) {
      try {
        const demo = createNewProjectTemplate('Mi Primer Montaje');
        await saveProjectToCache(demo, 'Demostración');
        const refreshed = await getAllCachedProjects();
        setCachedProjects(refreshed);
      } catch (_) {}
    }
  };

  // Scan local directory for .vproj and .json files
  const scanFolder = async (dirHandle, userTriggered = false) => {
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

      // Sincronizar en caché local de IndexedDB con la carpeta asignada
      for (const p of list) {
        if (p.projectData) {
          saveProjectToCache(p.projectData, dirHandle.name);
        }
      }
    } catch (err) {
      console.error('Error scanning folder:', err);
      if (err.name === 'NotAllowedError') {
        setNeedsPermission(true);
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Pick folder using File System Access API and save to IndexedDB
  const handleSelectFolder = async () => {
    try {
      const dirHandle = await pickLocalDirectory();
      setCurrentDirHandle(dirHandle);
      setDirectoryName(dirHandle.name);
      setNeedsPermission(false);
      // Guardar en la base de datos local (IndexedDB)
      await saveStoredDirectoryHandle(dirHandle);
      await scanFolder(dirHandle, true);
      await loadCachedProjectsList();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Directory picker cancelled or error:', err);
      }
    }
  };

  // Reconectar acceso si el navegador requiere confirmación
  const handleConnectFolder = async () => {
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
        await scanFolder(handle, true);
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
    setDirectoryName(null);
    setFolderProjects([]);
    setNeedsPermission(false);
    await clearStoredDirectoryHandle();
  };

  // Create new project and associate with current directory in IndexedDB
  const handleCreateNewProject = async (newProj) => {
    if (directoryName) {
      newProj.directoryName = directoryName;
    }
    await saveProjectToCache(newProj, directoryName);
    await loadCachedProjectsList();
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

  // Delete cached project
  const handleDeleteCached = async (id, e) => {
    e.stopPropagation();
    if (confirm('¿Eliminar este proyecto del historial local?')) {
      await deleteCachedProject(id);
      loadCachedProjectsList();
    }
  };

  const handleDownloadCopy = (project, e) => {
    e.stopPropagation();
    exportProjectAsDownload(project.projectData || project);
  };

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
                    <span className="badge badge-indigo" title="Guardada permanentemente en IndexedDB">
                      <Database size={11} /> Guardada en BD Local
                    </span>
                  </>
                )}
              </div>
              <p className="folder-desc">
                {needsPermission
                  ? `La carpeta "${directoryName}" está guardada en tu base de datos local. Haz clic en "Reconectar Acceso" para que el navegador reactive los permisos y muestre tus proyectos.`
                  : (directoryName
                      ? `Mostrando proyectos .vproj guardados en la carpeta "${directoryName}" (registrada en la base de datos local). Los cambios se sincronizan automáticamente.`
                      : 'Selecciona una carpeta de tu disco duro para cargarla y guardarla en la base de datos local con persistencia automática.')}
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

            {isFileSystemAccessSupported() ? (
              <button className="btn-primary" onClick={handleSelectFolder}>
                <FolderOpen size={16} />
                {directoryName ? 'Cambiar Carpeta Local' : 'Seleccionar Carpeta Local'}
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen size={16} />
                Cargar Carpeta de Proyectos
              </button>
            )}

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
                  onClick={() => scanFolder(currentDirHandle, true)}
                  title="Volver a escanear carpeta"
                  disabled={isScanning}
                >
                  <RefreshCw size={16} className={isScanning ? 'spinner' : ''} />
                </button>

                <button
                  className="btn-ghost icon-only text-dim"
                  onClick={handleClearFolder}
                  title="Desvincular carpeta de la base de datos local"
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

        {/* Section: Projects in Folder */}
        <div className="projects-section">
          <div className="section-header">
            <div className="section-title-group">
              <Folder size={18} className="text-indigo" />
              <h2>Proyectos en Carpeta Local {(folderProjects.length > 0 ? folderProjects.length : cachedProjects.filter(p => !directoryName || p.directoryName === directoryName).length) > 0 ? `(${(folderProjects.length > 0 ? folderProjects.length : cachedProjects.filter(p => !directoryName || p.directoryName === directoryName).length)})` : ''}</h2>
            </div>
            {directoryName && (
              <span className="section-meta">
                {needsPermission ? 'Copia local disponible • Requiere reconectar disco' : 'Archivos sincronizados con el sistema'}
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

          {(folderProjects.length === 0 && cachedProjects.filter(p => !directoryName || p.directoryName === directoryName).length === 0) ? (
            <div className="empty-projects-card">
              <Film size={40} className="text-dim" />
              <h4>{directoryName ? 'No se encontraron proyectos .vproj en esta carpeta' : 'No hay carpeta seleccionada'}</h4>
              <p>
                {directoryName
                  ? 'Crea un nuevo proyecto y guárdalo en esta carpeta, o selecciona otra ruta en tu disco.'
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
              {(folderProjects.length > 0 ? folderProjects : cachedProjects.filter(p => !directoryName || p.directoryName === directoryName)).map((p) => (
                <div
                  key={p.id}
                  className="project-card"
                  onClick={() => onOpenProject(p.projectData || p)}
                >
                  <div className="project-thumbnail-box">
                    <div className="project-preview-art">
                      <FileVideo size={44} className="text-indigo" />
                    </div>
                    <span className="project-aspect-badge">{p.aspectRatio || p.settings?.aspectRatio || '16:9'}</span>
                  </div>

                  <div className="project-details">
                    <h4 className="project-name" title={p.name}>{p.name}</h4>
                    <span className="project-filename text-dim">{p.fileName || p.directoryName || 'Copia Local Guardada'}</span>

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
                          title="Descargar copia"
                          onClick={(e) => handleDownloadCopy(p, e)}
                        >
                          <Download size={13} />
                        </button>
                        <button
                          className="btn-primary btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProject(p.projectData || p);
                          }}
                        >
                          Abrir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section: Cached / Recent Projects in Storage */}
        {cachedProjects.length > 0 && (
          <div className="projects-section">
            <div className="section-header">
              <div className="section-title-group">
                <HardDrive size={18} className="text-cyan" />
                <h2>Historial y Proyectos Recientes en Memoria ({cachedProjects.length})</h2>
              </div>
              <span className="section-meta">
                Guardados automáticamente en el almacenamiento local del navegador
              </span>
            </div>

            <div className="projects-grid">
              {cachedProjects.map((p) => (
                <div
                  key={p.id}
                  className="project-card"
                  onClick={() => onOpenProject(p.projectData || p)}
                >
                  <div className="project-thumbnail-box">
                    <div className="project-preview-art">
                      <Film size={40} className="text-cyan" />
                    </div>
                    <span className="project-aspect-badge">
                      {p.settings?.aspectRatio || '16:9'}
                    </span>
                  </div>

                  <div className="project-details">
                    <h4 className="project-name" title={p.name}>{p.name}</h4>
                    <span className="project-filename text-dim" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {p.directoryName ? (
                        <>
                          <Folder size={11} className="text-indigo" />
                          <span>{p.directoryName}</span>
                        </>
                      ) : (
                        'Copia Local Guardada'
                      )}
                    </span>

                    <div className="project-meta-row">
                      <span className="meta-item">
                        <Clock size={12} />
                        {p.settings?.duration || 20}s
                      </span>
                      <span className="meta-item">
                        <Layers size={12} />
                        {p.tracks?.length || 0} pistas
                      </span>
                    </div>

                    <div className="project-footer">
                      <span className="project-date">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                      <div className="project-card-actions">
                        <button
                          className="btn-ghost icon-only btn-xs text-dim"
                          title="Eliminar de historial"
                          onClick={(e) => handleDeleteCached(p.id, e)}
                        >
                          <Trash2 size={13} />
                        </button>
                        <button
                          className="btn-ghost icon-only btn-xs"
                          title="Descargar archivo .vproj"
                          onClick={(e) => handleDownloadCopy(p, e)}
                        >
                          <Download size={13} />
                        </button>
                        <button
                          className="btn-secondary btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProject(p.projectData || p);
                          }}
                        >
                          Abrir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
    </div>
  );
}
