import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  HardDrive,
  Folder,
  FileText,
  Clock,
  CheckCircle2,
  RefreshCw,
  Save,
  AlertCircle,
  Database,
  CloudCheck,
  Check
} from 'lucide-react';
import { getAutosaveConfig, saveAutosaveConfig } from '../utils/autosaveConfig';

export function AutosaveSettingsModal({
  isOpen,
  onClose,
  project,
  currentDirHandle,
  hasDiskHandle,
  lastSavedTime,
  autosaveStatus,
  onForceSave,
  onSaveAsNewFile
}) {
  const [config, setConfig] = useState(getAutosaveConfig);
  const [isSavingNow, setIsSavingNow] = useState(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleToggleEnabled = (enabled) => {
    const updated = saveAutosaveConfig({ enabled });
    setConfig(updated);
  };

  const handleIntervalChange = (seconds) => {
    const updated = saveAutosaveConfig({ intervalSeconds: seconds });
    setConfig(updated);
  };

  const handleToggleDiskSave = (saveToDisk) => {
    const updated = saveAutosaveConfig({ saveToDiskIfHandle: saveToDisk });
    setConfig(updated);
  };

  const handleManualSave = async () => {
    setIsSavingNow(true);
    setSavedSuccessMsg(null);
    try {
      await onForceSave();
      setSavedSuccessMsg('¡Proyecto guardado exitosamente en este instante!');
      setTimeout(() => setSavedSuccessMsg(null), 3500);
    } finally {
      setIsSavingNow(false);
    }
  };

  const formatLastSave = (date) => {
    if (!date) return 'Sin registro reciente';
    const now = new Date();
    const diffSec = Math.max(0, Math.round((now - date) / 1000));
    if (diffSec < 5) return 'Hace unos instantes';
    if (diffSec < 60) return `Hace ${diffSec} segundos`;
    const diffMin = Math.floor(diffSec / 60);
    return `Hace ${diffMin} min (${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container autosave-modal-container">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3>Sistema de Autoguardado</h3>
              <p>Protección contra pérdidas de datos y sincronización continua</p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose} title="Cerrar modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Status Banner */}
          <div className="autosave-status-banner">
            <div className="status-banner-left">
              <div className={`status-pill ${config.enabled ? 'is-active' : 'is-inactive'}`}>
                {config.enabled ? (
                  <>
                    <span className="pulsing-dot" />
                    <span>Autoguardado Activo</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} className="text-amber" />
                    <span>Autoguardado Pausado</span>
                  </>
                )}
              </div>
              <div className="last-saved-meta">
                <Clock size={13} className="text-dim" />
                <span>Último guardado: <strong>{formatLastSave(lastSavedTime)}</strong></span>
              </div>
            </div>

            <button
              className="btn-secondary btn-sm"
              onClick={handleManualSave}
              disabled={isSavingNow}
            >
              <RefreshCw size={13} className={isSavingNow ? 'spin text-indigo' : ''} />
              {isSavingNow ? 'Guardando...' : 'Forzar Guardado Ahora'}
            </button>
          </div>

          {savedSuccessMsg && (
            <div className="autosave-feedback-banner">
              <CheckCircle2 size={15} className="text-emerald" />
              <span>{savedSuccessMsg}</span>
            </div>
          )}

          {/* Storage Locations Overview */}
          <div className="autosave-destinations-section">
            <h4 className="section-label">Destinos de Sincronización</h4>
            <div className="destinations-grid">
              {/* Destination 1: IndexedDB */}
              <div className="destination-card active">
                <div className="dest-icon-box text-cyan">
                  <Database size={20} />
                </div>
                <div className="dest-info">
                  <div className="dest-title-row">
                    <h5>Base de Datos Local (IndexedDB)</h5>
                    <span className="badge-connected">Activo</span>
                  </div>
                  <p>Guarda automáticamente cada edición (cortes, clips, texto, volúmenes) en el disco interno de tu navegador sin saturar la red.</p>
                </div>
              </div>

              {/* Destination 2: Local Disk File (.vproj) */}
              <div className={`destination-card ${hasDiskHandle || currentDirHandle ? 'active' : 'pending'}`}>
                <div className="dest-icon-box text-indigo">
                  <HardDrive size={20} />
                </div>
                <div className="dest-info">
                  <div className="dest-title-row">
                    <h5>Archivo en Disco (.vproj)</h5>
                    {hasDiskHandle ? (
                      <span className="badge-connected">Vinculado</span>
                    ) : (currentDirHandle ? (
                      <span className="badge-connected">Carpeta Conectada</span>
                    ) : (
                      <span className="badge-pending">No Vinculado</span>
                    ))}
                  </div>
                  <p>
                    {hasDiskHandle ? (
                      `Sincronizando directamente en el archivo ${project?.fileName || 'del proyecto'}.`
                    ) : (currentDirHandle ? (
                      `Vinculado a la carpeta "${currentDirHandle.name}". Se guardará automáticamente al editar.`
                    ) : (
                      'Guarda una vez en disco para vincular el archivo y permitir autoguardado en tiempo real en tu PC.'
                    ))}
                  </p>
                  {!hasDiskHandle && !currentDirHandle && onSaveAsNewFile && (
                    <button
                      className="btn-outline btn-xs"
                      onClick={() => {
                        onClose();
                        onSaveAsNewFile();
                      }}
                      style={{ marginTop: '8px' }}
                    >
                      <Save size={12} />
                      Vincular a archivo .vproj en disco
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="autosave-settings-form">
            <h4 className="section-label">Preferencias de Frecuencia</h4>

            {/* Switch: Enable Autosave */}
            <div className="setting-row">
              <div className="setting-text">
                <label className="setting-title">Habilitar Autoguardado</label>
                <span className="setting-desc">Guarda cambios automáticamente en segundo plano tras cada modificación</span>
              </div>
              <button
                type="button"
                className={`switch-toggle ${config.enabled ? 'is-on' : ''}`}
                onClick={() => handleToggleEnabled(!config.enabled)}
                role="switch"
                aria-checked={config.enabled}
              >
                <span className="switch-handle" />
              </button>
            </div>

            {/* Interval Selection */}
            {config.enabled && (
              <div className="setting-row">
                <div className="setting-text">
                  <label className="setting-title">Intervalo de ciclo periódico</label>
                  <span className="setting-desc">Frecuencia con la que se comprueban y consolidan cambios pendientes</span>
                </div>
                <div className="interval-buttons-group">
                  {[5, 15, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      className={`btn-interval ${config.intervalSeconds === sec ? 'active' : ''}`}
                      onClick={() => handleIntervalChange(sec)}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Switch: Save to Disk if Handle */}
            <div className="setting-row">
              <div className="setting-text">
                <label className="setting-title">Sincronizar en archivo de disco silenciosamente</label>
                <span className="setting-desc">Si el proyecto tiene un archivo o carpeta vinculada, escribe en disco sin mostrar cuadros de diálogo</span>
              </div>
              <button
                type="button"
                className={`switch-toggle ${config.saveToDiskIfHandle ? 'is-on' : ''}`}
                onClick={() => handleToggleDiskSave(!config.saveToDiskIfHandle)}
                role="switch"
                aria-checked={config.saveToDiskIfHandle}
              >
                <span className="switch-handle" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div className="footer-left-info">
            <span className="text-dim text-xs">
              Los cambios se aplican automáticamente en tiempo real
            </span>
          </div>
          <button className="btn-primary btn-sm" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
