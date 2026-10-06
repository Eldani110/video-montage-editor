import React, { useState } from 'react';
import { X, Settings, Check, ShieldCheck } from 'lucide-react';
import { getAutosaveConfig, saveAutosaveConfig } from '../utils/autosaveConfig';

export function ProjectSettingsModal({ isOpen, onClose, project, onUpdateSettings }) {
  const [name, setName] = useState(project?.name || '');
  const [aspectRatio, setAspectRatio] = useState(project?.settings?.aspectRatio || '16:9');
  const [duration, setDuration] = useState(project?.settings?.duration || 20);
  const [autosaveConfig, setAutosaveConfig] = useState(getAutosaveConfig);

  if (!isOpen || !project) return null;

  const handleToggleAutosave = (enabled) => {
    const updated = saveAutosaveConfig({ enabled });
    setAutosaveConfig(updated);
  };

  const handleIntervalChange = (intervalSeconds) => {
    const updated = saveAutosaveConfig({ intervalSeconds });
    setAutosaveConfig(updated);
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

    onUpdateSettings({
      name: name.trim() || project.name,
      settings: {
        ...project.settings,
        width,
        height,
        aspectRatio,
        duration: Math.max(5, Number(duration))
      }
    });
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <Settings size={20} className="text-indigo" />
            </div>
            <div>
              <h3>Ajustes del Proyecto</h3>
              <p>Modifica el formato, dimensiones y autoguardado</p>
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
              max="600"
              className="input-field"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
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
