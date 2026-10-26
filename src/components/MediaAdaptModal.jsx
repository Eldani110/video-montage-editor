import React from 'react';
import { RefreshCw, CheckCircle2, Film, HardDrive } from 'lucide-react';

/**
 * Modern Premiere-styled progress modal shown when adapting iPhone .MOV (HEVC/ProRes)
 * videos into compatible H.264 .mov files right in the project's local media folder.
 */
export function MediaAdaptModal({
  isOpen,
  currentFile = '',
  currentIndex = 1,
  totalFiles = 1,
  percent = 0,
  statusText = 'Adaptando video de iPhone al editor...',
  isFinished = false
}) {
  if (!isOpen) return null;

  const targetFileName = currentFile ? currentFile.replace(/\.(mov|qt)$/i, '_h264.mov') : 'video_h264.mov';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(7, 10, 19, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '490px',
          background: 'linear-gradient(145deg, #131b2e 0%, #0d1322 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(56, 152, 255, 0.32)',
          boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.75), 0 0 35px rgba(56, 152, 255, 0.18)',
          padding: '28px 24px',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Top ambient glow */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '260px',
            height: '120px',
            background: 'radial-gradient(circle, rgba(56, 152, 255, 0.3) 0%, transparent 70%)',
            pointerEvents: 'none',
            borderRadius: '50%'
          }}
        />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: isFinished ? 'rgba(16, 185, 129, 0.18)' : 'rgba(56, 152, 255, 0.15)',
              border: isFinished ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 152, 255, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {isFinished ? (
              <CheckCircle2 size={24} style={{ color: '#10b981' }} />
            ) : (
              <RefreshCw
                size={22}
                style={{
                  color: '#3898ff',
                  animation: 'spin 2s linear infinite'
                }}
              />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#ffffff' }}>
              {isFinished ? '¡Videos Adaptados con Éxito!' : 'Adaptando Video de iPhone al Editor'}
            </h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              {isFinished
                ? 'Versión H.264 (.mov) seleccionada en el proyecto'
                : 'Generando versión H.264 (.mov) compatible en tu carpeta local'}
            </span>
          </div>
        </div>

        {/* File mapping card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Archivo {currentIndex} de {totalFiles}
            </span>
            <span style={{ fontSize: '11px', color: '#3898ff', fontWeight: 600 }}>
              {Math.min(100, Math.max(0, Math.round(percent)))}%
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <Film size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <span
              style={{
                color: '#e2e8f0',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '160px'
              }}
              title={currentFile}
            >
              {currentFile || 'Video de iPhone'}
            </span>
            <span style={{ color: '#64748b', fontSize: '11px' }}>➔</span>
            <span
              style={{
                color: '#3898ff',
                fontWeight: 600,
                fontSize: '12px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '180px'
              }}
              title={targetFileName}
            >
              {targetFileName}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            style={{
              height: '8px',
              width: '100%',
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              borderRadius: '999px',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(3, percent))}%`,
                background: isFinished
                  ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(90deg, #3898ff 0%, #6366f1 100%)',
                borderRadius: '999px',
                transition: 'width 0.25s ease-out',
                boxShadow: isFinished ? '0 0 10px rgba(16, 185, 129, 0.5)' : '0 0 10px rgba(56, 152, 255, 0.5)'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: '#94a3b8' }}>
            <span>{statusText || 'Procesando códec para edición nativa...'}</span>
            <span>{Math.round(percent)}%</span>
          </div>
        </div>

        {/* Bottom notice */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            color: '#64748b',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            paddingTop: '12px'
          }}
        >
          <HardDrive size={13} style={{ flexShrink: 0, color: '#3898ff' }} />
          <span>
            El archivo original se conserva intacto en la misma carpeta junto a la nueva versión.
          </span>
        </div>
      </div>
    </div>
  );
}
