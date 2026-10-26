import React, { useState, useEffect } from 'react';
import { DownloadCloud, CheckCircle2, RefreshCw, X, ArrowUpCircle, AlertCircle } from 'lucide-react';

export function UpdateNotificationBanner() {
  const [updateInfo, setUpdateInfo] = useState({
    status: 'idle',
    currentVersion: '1.0.0',
    newVersion: null,
    progress: 0,
    error: null
  });
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      return; // Web browser mode: no electron updater
    }

    // Load initial version and status
    if (window.electronAPI.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setUpdateInfo(prev => ({ ...prev, currentVersion: v }));
      }).catch(() => {});
    }

    if (window.electronAPI.getUpdateStatus) {
      window.electronAPI.getUpdateStatus().then((st) => {
        if (st && st.status !== 'idle') {
          setUpdateInfo(prev => ({ ...prev, ...st }));
        }
      }).catch(() => {});
    }

    // Subscribe to IPC update events
    if (window.electronAPI.onUpdateStatus) {
      const unsubscribe = window.electronAPI.onUpdateStatus((data) => {
        setUpdateInfo(prev => ({ ...prev, ...data }));
        if (data.status === 'downloaded' || data.status === 'available') {
          setIsDismissed(false); // Make sure user sees it when ready
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  const handleInstall = () => {
    if (window.electronAPI?.quitAndInstallUpdate) {
      window.electronAPI.quitAndInstallUpdate();
    }
  };

  // Only render if we're in desktop electron and an update is active/downloaded
  if (
    isDismissed ||
    typeof window === 'undefined' ||
    !window.electronAPI ||
    updateInfo.status === 'idle' ||
    updateInfo.status === 'not-available'
  ) {
    return null;
  }

  return (
    <aside
      className="desktop-update-toast"
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        minWidth: '320px',
        maxWidth: '420px',
        background: 'linear-gradient(135deg, rgba(22, 27, 39, 0.96) 0%, rgba(13, 16, 24, 0.98) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.2)',
        borderRadius: '10px',
        padding: '14px 16px',
        backdropFilter: 'blur(16px)',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        animation: 'slideUpToast 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {updateInfo.status === 'downloaded' ? (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.18)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399'
            }}>
              <CheckCircle2 size={18} />
            </div>
          ) : updateInfo.status === 'downloading' ? (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.18)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8'
            }}>
              <DownloadCloud size={18} className="pulse" />
            </div>
          ) : updateInfo.status === 'checking' ? (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.18)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <RefreshCw size={16} className="spin" />
            </div>
          ) : (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.18)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24'
            }}>
              <ArrowUpCircle size={18} />
            </div>
          )}

          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
              {updateInfo.status === 'downloaded' && '¡Actualización Lista para Instalar!'}
              {updateInfo.status === 'downloading' && 'Descargando Actualización...'}
              {updateInfo.status === 'available' && 'Nueva Versión Disponible'}
              {updateInfo.status === 'checking' && 'Buscando actualizaciones...'}
              {updateInfo.status === 'error' && 'Aviso de Actualización'}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {updateInfo.status === 'downloaded' && `Versión ${updateInfo.newVersion || ''} descargada con éxito`}
              {updateInfo.status === 'downloading' && `Montage Studio v${updateInfo.newVersion || ''} (${updateInfo.progress}%)`}
              {updateInfo.status === 'available' && `Versión v${updateInfo.newVersion || ''} disponible en GitHub`}
              {updateInfo.status === 'checking' && 'Consultando GitHub Releases...'}
              {updateInfo.status === 'error' && (updateInfo.error || 'No se pudo conectar al servidor')}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'color 0.15s'
          }}
          title="Cerrar notificación"
        >
          <X size={14} />
        </button>
      </div>

      {updateInfo.status === 'downloading' && (
        <div style={{
          width: '100%',
          height: '5px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '999px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.max(4, updateInfo.progress)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            borderRadius: '999px',
            transition: 'width 0.25s ease-out'
          }} />
        </div>
      )}

      {updateInfo.status === 'downloaded' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            style={{
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 600,
              background: '#222734',
              color: '#94a3b8',
              border: '1px solid #333d52',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Más tarde
          </button>
          <button
            type="button"
            onClick={handleInstall}
            style={{
              padding: '5px 14px',
              fontSize: '11.5px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={12} />
            Reiniciar y Aplicar
          </button>
        </div>
      )}
    </aside>
  );
}
