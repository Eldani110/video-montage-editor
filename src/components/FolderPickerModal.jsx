import React, { useState, useEffect, useCallback } from 'react';
import { X, Folder, HardDrive, ChevronUp, Loader2, Check, Film, FolderOpen } from 'lucide-react';
import { browseFolders } from '../utils/stockMediaClient';
import { isElectronDesktop, pickDesktopFolder } from '../services/localProjectService';

/**
 * Web-based folder browser. Lets the user navigate the server's disk
 * (their own PC in a local install) and pick a base folder for projects/media.
 */
export function FolderPickerModal({ isOpen, onClose, onSelect, initialPath = null, title = 'Elegir carpeta' }) {
  const [currentPath, setCurrentPath] = useState(null);
  const [parent, setParent] = useState(null);
  const [roots, setRoots] = useState([]);
  const [folders, setFolders] = useState([]);
  const [writable, setWritable] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  const load = useCallback(async (dirPath) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await browseFolders(dirPath);
      setCurrentPath(data.path || null);
      setParent(data.parent || null);
      setRoots(data.roots || []);
      setFolders(data.folders || []);
      setWritable(data.writable !== false);
      setManualPath(data.path || '');
    } catch (err) {
      setErrorMsg(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) load(initialPath);
  }, [isOpen, initialPath, load]);

  if (!isOpen) return null;

  const handleSelect = () => {
    if (!currentPath) return;
    onSelect(currentPath);
    onClose();
  };

  const handlePickNative = async () => {
    try {
      const nativeFolder = await pickDesktopFolder();
      if (nativeFolder) {
        onSelect(nativeFolder);
        onClose();
      }
    } catch (err) {
      console.warn('Error selecting native folder:', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge"><Folder size={18} /></div>
            <h3 className="modal-title">{title}</h3>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
            Aquí se crearán las carpetas de proyecto y se descargarán los recursos. Navega y pulsa <strong>Seleccionar</strong>.
          </p>

          {isElectronDesktop() && (
            <div style={{ marginBottom: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  borderColor: 'rgba(99, 102, 241, 0.35)',
                  color: '#a5b4fc',
                  fontWeight: 500,
                  padding: '9px 14px'
                }}
                onClick={handlePickNative}
              >
                <FolderOpen size={16} className="text-indigo" />
                Examinar con el Explorador de Archivos del Sistema...
              </button>
            </div>
          )}

          {/* Manual path + up */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button
              className="btn-secondary btn-sm icon-only"
              onClick={() => load(parent)}
              disabled={!parent || isLoading}
              title="Subir un nivel"
            >
              <ChevronUp size={15} />
            </button>
            <input
              type="text"
              className="input-field"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(manualPath); }}
              placeholder="/ruta/a/carpeta"
            />
            <button className="btn-secondary btn-sm" onClick={() => load(manualPath)} disabled={isLoading}>Ir</button>
          </div>

          {currentPath && (
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-dim)', marginBottom: '8px', wordBreak: 'break-all' }}>
              {currentPath} {!writable && <span style={{ color: '#fbbf24' }}>· sin permiso de escritura</span>}
            </div>
          )}

          {errorMsg && (
            <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '8px' }}>{errorMsg}</div>
          )}

          {/* Folder list */}
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)' }}>
            {isLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)' }}>
                <Loader2 size={18} className="spinner" />
              </div>
            ) : (
              <>
                {/* Roots (when no path chosen) */}
                {roots.map((r) => (
                  <button
                    key={r.path}
                    className="folder-row"
                    onClick={() => load(r.path)}
                    style={folderRowStyle}
                  >
                    <HardDrive size={15} style={{ color: '#06b6d4', flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: 'left', fontFamily: 'monospace' }}>{r.name}</span>
                  </button>
                ))}

                {/* Subfolders */}
                {folders.map((f) => (
                  <button
                    key={f.path}
                    className="folder-row"
                    onClick={() => load(f.path)}
                    style={folderRowStyle}
                  >
                    <Folder size={15} style={{ color: f.hasMedia ? '#34d399' : 'var(--text-dim)', flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{f.name}</span>
                    {f.hasMedia && <Film size={13} style={{ color: '#34d399' }} title="Contiene archivos multimedia" />}
                  </button>
                ))}

                {!isLoading && currentPath && folders.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
                    No hay subcarpetas aquí. Puedes seleccionar esta carpeta.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            onClick={handleSelect}
            disabled={!currentPath || !writable}
          >
            <Check size={15} /> Seleccionar esta carpeta
          </button>
        </div>
      </div>
    </div>
  );
}

const folderRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  cursor: 'pointer'
};
