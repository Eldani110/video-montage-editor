import React, { useState } from 'react';
import { X, Film, Sparkles } from 'lucide-react';
import { createNewProjectTemplate } from '../utils/sampleData';

export function NewProjectModal({ isOpen, onClose, onCreateProject }) {
  const [name, setName] = useState('Mi Montaje Pro');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(20);
  const [includeSamples, setIncludeSamples] = useState(true);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const project = createNewProjectTemplate(name.trim() || 'Nuevo Proyecto');
    project.settings.duration = Number(duration);
    project.settings.aspectRatio = aspectRatio;

    if (aspectRatio === '9:16') {
      project.settings.width = 1080;
      project.settings.height = 1920;
    } else if (aspectRatio === '1:1') {
      project.settings.width = 1080;
      project.settings.height = 1080;
    } else {
      project.settings.width = 1920;
      project.settings.height = 1080;
    }

    if (!includeSamples) {
      project.assets = [];
      project.tracks.forEach(t => t.clips = []);
    }

    onCreateProject(project);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <Film size={20} className="text-indigo" />
            </div>
            <div>
              <h3>Crear Nuevo Proyecto</h3>
              <p>Configura las dimensiones y duración de tu secuencia</p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Nombre del Proyecto</label>
            <input
              type="text"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Viaje Vacaciones 2026"
              autoFocus
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
                <span className="ratio-label">16:9</span>
                <span className="ratio-sub">Horizontal (YouTube / TV)</span>
              </button>

              <button
                type="button"
                className={`ratio-btn ${aspectRatio === '9:16' ? 'active' : ''}`}
                onClick={() => setAspectRatio('9:16')}
              >
                <div className="ratio-box ratio-9-16"></div>
                <span className="ratio-label">9:16</span>
                <span className="ratio-sub">Vertical (Reels / TikTok)</span>
              </button>

              <button
                type="button"
                className={`ratio-btn ${aspectRatio === '1:1' ? 'active' : ''}`}
                onClick={() => setAspectRatio('1:1')}
              >
                <div className="ratio-box ratio-1-1"></div>
                <span className="ratio-label">1:1</span>
                <span className="ratio-sub">Cuadrado (Instagram Feed)</span>
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Duración Inicial (segundos)</label>
              <input
                type="number"
                min="5"
                max="300"
                className="input-field"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="form-group flex-1">
              <label>Velocidad de Cuadros</label>
              <input
                type="text"
                className="input-field"
                value="30 FPS (Estándar)"
                disabled
              />
            </div>
          </div>

          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeSamples}
                onChange={(e) => setIncludeSamples(e.target.checked)}
              />
              <span>Incluir recursos de muestra y música de prueba</span>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              <Sparkles size={16} />
              Iniciar Edición
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
