import React, { useState, useEffect } from 'react';
import { X, Settings, Check, ShieldCheck, HardDrive, Folder, FolderPlus, RefreshCw, FolderSearch } from 'lucide-react';
import { getAutosaveConfig, saveAutosaveConfig } from '../utils/autosaveConfig';
import { getProjectMediaFolder, getStorageDiskInfo, getDiskMediaFolders } from '../utils/stockMediaClient';
import { isFileSystemAccessSupported, pickLocalDirectory } from '../utils/fileSystem';

export function ProjectSettingsModal({ isOpen, onClose, project, onUpdateSettings }) {
  const [name, setName] = useState(project?.name || '');
  const [aspectRatio, setAspectRatio] = useState(project?.settings?.aspectRatio || '16:9');
  const [duration, setDuration] = useState(project?.settings?.duration || 20);
  const [autosaveConfig, setAutosaveConfig] = useState(getAutosaveConfig);

  // Per-project media folder
  const [mediaFolder, setMediaFolder] = useState(() => {
    return project?.settings?.mediaFolder || project?.mediaFolder || '';
  });
  const [folderStats, setFolderStats] = useState(null);
  const [availableFolders, setAvailableFolders] = useState([]);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

  const effectiveFolder = (mediaFolder.trim() || getProjectMediaFolder({ ...project, name }));

  useEffect(() => {
    if (isOpen && project) {
      setName(project.name || '');
      setAspectRatio(project.settings?.aspectRatio || '16:9');
      setDuration(project.settings?.duration || 20);
      setMediaFolder(project.settings?.mediaFolder || project.mediaFolder || '');

      const currentEff = (project.settings?.mediaFolder || project.mediaFolder || getProjectMediaFolder(project));
      getStorageDiskInfo(currentEff).then(info => setFolderStats(info));
      getDiskMediaFolders().then(list => setAvailableFolders(list));
    }
  }, [isOpen, project]);

  useEffect(() => {
    if (isOpen) {
      getStorageDiskInfo(effectiveFolder).then(info => setFolderStats(info));
    }
  }, [effectiveFolder, isOpen]);

  if (!isOpen || !project) return null;

  const handleToggleAutosave = (enabled) => {
    const updated = saveAutosaveConfig({ enabled });
    setAutosaveConfig(updated);
  };

  const handleIntervalChange = (intervalSeconds) => {
    const updated = saveAutosaveConfig({ intervalSeconds });
    setAutosaveConfig(updated);
  };

  const handlePickLocalDiskFolder = async () => {
    try {
      if (!isFileSystemAccessSupported()) {
        alert('Tu navegador no soporta selección directa de carpetas de disco (disponible en Chrome / Edge). Puedes escribir el nombre de la carpeta abajo.');
        return;
      }
      const dirHandle = await pickLocalDirectory();
      if (dirHandle && dirHandle.name) {
        setMediaFolder(dirHandle.name);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Error al seleccionar carpeta:', err);
      }
    }
  };

  const handleResetToDefaultFolder = () => {
    const autoFolder = getProjectMediaFolder({ ...project, name, settings: { ...project.settings, mediaFolder: '' } });
    setMediaFolder(autoFolder);
  };

  const handleSave = (e) => {
    e.preventDefault();
    let width = 1920;
    let height = 1080;
    if (aspectRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    }

    const cleanFolder = mediaFolder.trim();

    onUpdateSettings({
      name: name.trim() || project.name,
      mediaFolder: cleanFolder,
      settings: {
        ...project.settings,
        width,
        height,
        aspectRatio,
        duration: Math.max(5, Math.round(Number(duration) || 0)),
        mediaFolder: cleanFolder
      }
    });
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <Settings size={20} className="text-indigo" />
            </div>
            <div>
              <h3>Ajustes del Proyecto</h3>
              <p>Formato, dimensiones, carpeta multimedia local y autoguardado</p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <div className="form-group">
            <label>Título del Proyecto</label>
            <input
              type="text"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Relación de Aspecto</label>
            <div className="aspect-ratio-selector">
              <button
                type="button"
                className={`ratio-btn ${aspectRatio === '16:9' ? 'active' : ''}`}
                onClick={() => setAspectRatio('16:9')}
              >
                <div className="ratio-box ratio-16-9"></div>
                <span className="ratio-label">16:9 Horizontal</span>
              </button>

              <button
                type="button"
                className={`ratio-btn ${aspectRatio === '9:16' ? 'active' : ''}`}
                onClick={() => setAspectRatio('9:16')}
              >
                <div className="ratio-box ratio-9-16"></div>
                <span className="ratio-label">9:16 Vertical</span>
              </button>

              <button
                type="button"
                className={`ratio-btn ${aspectRatio === '1:1' ? 'active' : ''}`}
                onClick={() => setAspectRatio('1:1')}
              >
                <div className="ratio-box ratio-1-1"></div>
                <span className="ratio-label">1:1 Cuadrado</span>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Duración Total de la Línea de Tiempo (segundos)</label>
            <input
              type="number"
              min="5"
              step="1"
              className="input-field"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Ej: 3600 (1 hora) o el valor que necesites"
            />
          </div>

          {/* Carpeta Multimedia Local por Proyecto */}
          <div className="form-group" style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(6, 182, 212, 0.04)',
            padding: '14px',
            borderRadius: '8px',
            border: '1px solid rgba(6, 182, 212, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#06b6d4' }}>
                <HardDrive size={16} />
                Carpeta Multimedia de este Proyecto
              </label>
              {folderStats && (
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                  {folderStats.folderFiles || 0} archivos • {folderStats.folderFormattedSize || '0.00 MB'}
                </span>
              )}
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
              Los videos B-roll, clips descargados y medios de este proyecto se guardarán en esta carpeta local específica:
            </p>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.3)',
                padding: '0 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                flex: 1
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>projects_media/</span>
                <input
                  type="text"
                  className="input-field"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '8px 4px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: '#38bdf8'
                  }}
                  value={mediaFolder}
                  placeholder={effectiveFolder}
                  onChange={(e) => setMediaFolder(e.target.value)}
                />
              </div>

              {isFileSystemAccessSupported() && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={handlePickLocalDiskFolder}
                  title="Elegir una carpeta de tu disco local con el explorador de archivos"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                >
                  <FolderSearch size={14} className="text-cyan" />
                  Elegir Carpeta
                </button>
              )}

              <button
                type="button"
                className="btn-ghost icon-only btn-sm"
                onClick={handleResetToDefaultFolder}
                title="Restablecer a nombre automático de proyecto"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Quick folder selector from existing projects_media */}
            {availableFolders.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: '2px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                >
                  <Folder size={12} />
                  <span>{showFolderDropdown ? 'Ocultar carpetas existentes en disco' : `Ver carpetas existentes en disco (${availableFolders.length})`}</span>
                </button>

                {showFolderDropdown && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginTop: '6px',
                    padding: '8px',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '6px',
                    maxHeight: '110px',
                    overflowY: 'auto'
                  }}>
                    {availableFolders.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => { setMediaFolder(f.name); setShowFolderDropdown(false); }}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: effectiveFolder === f.name ? '1px solid #06b6d4' : '1px solid var(--border-subtle)',
                          background: effectiveFolder === f.name ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-card)',
                          color: effectiveFolder === f.name ? '#38bdf8' : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        📁 {f.name} ({f.fileCount} arch. • {f.formattedSize})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Autosave Preference in Project Settings */}
          <div className="form-group" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                <ShieldCheck size={16} className="text-emerald" />
                Autoguardado Automático
              </label>
              <button
                type="button"
                className={`switch-toggle ${autosaveConfig.enabled ? 'is-on' : ''}`}
                onClick={() => handleToggleAutosave(!autosaveConfig.enabled)}
                role="switch"
                aria-checked={autosaveConfig.enabled}
              >
                <span className="switch-handle" />
              </button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '10px' }}>
              Guarda tus ediciones continuamente en IndexedDB y sincroniza en disco.
            </span>
            {autosaveConfig.enabled && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Frecuencia de consolidación:</span>
                <div className="interval-buttons-group">
                  {[5, 15, 30, 60].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`btn-interval ${autosaveConfig.intervalSeconds === s ? 'active' : ''}`}
                      onClick={() => handleIntervalChange(s)}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              <Check size={16} />
              Guardar Ajustes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
