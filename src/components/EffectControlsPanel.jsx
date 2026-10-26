import React, { useState } from 'react';
import {
  Sliders,
  Move,
  Palette,
  Volume2,
  VolumeX,
  Clock,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Scissors,
  Sparkles,
  Zap,
  Music,
  Unlink,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Sun,
  Layers,
  Film
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';

export const EffectControlsPanel = React.memo(function EffectControlsPanel({
  selectedClip,
  project,
  onUpdateClip,
  onBeginTransform = null,
  onEndTransform = null,
  onDeleteClip,
  onDuplicateClip,
  onSeparateAudio,
  onUnlinkClip
}) {
  // Collapsible section states
  const [openSections, setOpenSections] = useState({
    motion: true,
    opacity: true,
    crop: true,
    filters: true,
    animation: true,
    audio: true
  });

  const toggleSection = (section) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (!selectedClip) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '32px 20px',
          textAlign: 'center',
          color: '#94a3b8',
          gap: '14px'
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(56, 152, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3898ff',
            border: '1px solid rgba(56, 152, 255, 0.25)'
          }}
        >
          <Sliders size={24} />
        </div>
        <h4 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 600 }}>
          Sin Selección de Clip
        </h4>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, maxWidth: '280px' }}>
          Haz clic en cualquier video, imagen o clip de audio en la línea de tiempo para ver y controlar
          todos sus efectos en tiempo real.
        </p>
      </div>
    );
  }

  const track = project?.tracks?.find((t) => t.id === selectedClip.trackId);
  const isAudioTrack = track?.type === 'audio';
  const isVisualClip = !isAudioTrack;
  const isVideoTrack = isVisualClip;

  // Transform values (harmonized across video, image, and graphic clips)
  const posX = selectedClip.positionX ?? selectedClip.position?.x ?? 0;
  const posY = selectedClip.positionY ?? selectedClip.position?.y ?? 0;
  const scale = selectedClip.scale ?? selectedClip.position?.scale ?? 1.0;
  const rotation = selectedClip.rotation ?? selectedClip.position?.rotation ?? 0;
  const flipX = Boolean(selectedClip.flipX);
  const flipY = Boolean(selectedClip.flipY);
  const fitMode = selectedClip.fit || 'contain';

  // Opacity & Blend
  const opacity = selectedClip.opacity !== undefined ? selectedClip.opacity : 1.0;
  const blendMode = selectedClip.blendMode || 'normal';

  // Crop & Border Radius
  const cropTop = selectedClip.cropTop || 0;
  const cropBottom = selectedClip.cropBottom || 0;
  const cropLeft = selectedClip.cropLeft || 0;
  const cropRight = selectedClip.cropRight || 0;
  const borderRadius = selectedClip.borderRadius || 0;

  // Video Filters
  const brightness = selectedClip.brightness !== undefined ? selectedClip.brightness : 1.0;
  const contrast = selectedClip.contrast !== undefined ? selectedClip.contrast : 1.0;
  const saturate = selectedClip.saturate !== undefined ? selectedClip.saturate : 1.0;
  const blur = selectedClip.blur || 0;
  const hueRotate = selectedClip.hueRotate || 0;
  const sepia = selectedClip.sepia || 0;
  const grayscale = selectedClip.grayscale || 0;
  const invert = selectedClip.invert || 0;
  const vignette = selectedClip.vignette || 0;
  const dropShadow = selectedClip.dropShadow || 0;

  // Motion Presets & Fades
  const motionPreset = selectedClip.motionPreset || 'none';
  const fadeIn = selectedClip.fadeIn || 0;
  const fadeOut = selectedClip.fadeOut || 0;

  // Audio properties
  const volume = selectedClip.volume !== undefined ? selectedClip.volume : 1.0;
  const isMuted = Boolean(selectedClip.muted);

  const handleUpdate = (patch, recordHistory = true) => {
    const merged = { ...patch };
    // Synchronize both positionX/Y and position: { x, y }
    if ('positionX' in patch || 'positionY' in patch) {
      const newX = patch.positionX !== undefined ? patch.positionX : posX;
      const newY = patch.positionY !== undefined ? patch.positionY : posY;
      merged.positionX = newX;
      merged.positionY = newY;
      merged.position = { ...(selectedClip.position || {}), x: newX, y: newY };
    }
    if ('scale' in patch) {
      merged.scale = patch.scale;
      merged.position = { ...(selectedClip.position || {}), scale: patch.scale };
    }
    if ('rotation' in patch) {
      merged.rotation = patch.rotation;
      merged.position = { ...(selectedClip.position || {}), rotation: patch.rotation };
    }
    if (onUpdateClip) {
      onUpdateClip(selectedClip.id, merged, recordHistory);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#e2e8f0', fontSize: '12px' }}>
      {/* Clip Header Banner */}
      <div
        style={{
          background: '#161922',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: selectedClip.color || '#3898ff',
                flexShrink: 0
              }}
            />
            <input
              type="text"
              value={selectedClip.name || ''}
              onChange={(e) => handleUpdate({ name: e.target.value })}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                width: '100%',
                outline: 'none'
              }}
              title="Haz clic para renombrar el clip"
            />
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(56, 152, 255, 0.15)',
              color: '#3898ff',
              border: '1px solid rgba(56, 152, 255, 0.3)',
              textTransform: 'uppercase'
            }}
          >
            {track?.name || 'Pista'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
          <span>Inicio: <strong style={{ color: '#cbd5e1' }}>{formatTimecode(selectedClip.startTime)}</strong></span>
          <span>Duración: <strong style={{ color: '#cbd5e1' }}>{selectedClip.duration?.toFixed(2)}s</strong></span>
        </div>
      </div>

      {/* 1. MOTION / MOVIMIENTO SECTION */}
      {isVideoTrack && (
        <div className="effect-box" style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
          <div
            onClick={() => toggleSection('motion')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#13161f',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: openSections.motion ? '1px solid rgba(255, 255, 255, 0.06)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="lumetri-fx-badge" style={{ background: '#2563eb', color: '#fff' }}>fx</span>
              <Move size={14} style={{ color: '#60a5fa' }} />
              <strong style={{ fontSize: '12px', color: '#f1f5f9' }}>Movimiento (Motion)</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdate({ positionX: 0, positionY: 0, scale: 1.0, rotation: 0, flipX: false, flipY: false });
                }}
                title="Restablecer Movimiento"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <RotateCcw size={12} />
              </button>
              {openSections.motion ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </div>
          </div>

          {openSections.motion && (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Position X and Y */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>Posición (X, Y)</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>X:</span>
                      <input
                        type="number"
                        value={posX}
                        onChange={(e) => handleUpdate({ positionX: Number(e.target.value) || 0 })}
                        style={{
                          width: '52px',
                          background: '#0d1117',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '4px',
                          color: '#3898ff',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          padding: '1px 4px',
                          textAlign: 'right'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>Y:</span>
                      <input
                        type="number"
                        value={posY}
                        onChange={(e) => handleUpdate({ positionY: Number(e.target.value) || 0 })}
                        style={{
                          width: '52px',
                          background: '#0d1117',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '4px',
                          color: '#3898ff',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          padding: '1px 4px',
                          textAlign: 'right'
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>X</span>
                    <input
                      type="range"
                      min="-800"
                      max="800"
                      step="1"
                      value={posX}
                      onChange={(e) => handleUpdate({ positionX: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#3898ff' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>Y</span>
                    <input
                      type="range"
                      min="-800"
                      max="800"
                      step="1"
                      value={posY}
                      onChange={(e) => handleUpdate({ positionY: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#3898ff' }}
                    />
                  </div>
                </div>
              </div>

              {/* Scale / Zoom */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>Escala / Zoom</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      max="5.0"
                      value={Number(scale.toFixed(2))}
                      onChange={(e) => handleUpdate({ scale: Math.max(0.05, Math.min(5.0, Number(e.target.value) || 1)) })}
                      style={{
                        width: '56px',
                        background: '#0d1117',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '4px',
                        color: '#3898ff',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        padding: '1px 4px',
                        textAlign: 'right'
                      }}
                    />
                    <span style={{ color: '#64748b', fontSize: '10px' }}>({Math.round(scale * 100)}%)</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="4.0"
                  step="0.05"
                  value={scale}
                  onChange={(e) => handleUpdate({ scale: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#3898ff', marginBottom: '6px' }}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[0.5, 1.0, 1.25, 1.5, 2.0].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleUpdate({ scale: s })}
                      style={{
                        flex: 1,
                        padding: '3px 0',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: Math.abs(scale - s) < 0.03 ? '1px solid #3898ff' : '1px solid rgba(255,255,255,0.08)',
                        background: Math.abs(scale - s) < 0.03 ? 'rgba(56, 152, 255, 0.15)' : '#0d1117',
                        color: Math.abs(scale - s) < 0.03 ? '#3898ff' : '#94a3b8',
                        cursor: 'pointer'
                      }}
                    >
                      {Math.round(s * 100)}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Rotation & Flip */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>Rotación</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      step="1"
                      min="-180"
                      max="180"
                      value={rotation}
                      onChange={(e) => handleUpdate({ rotation: Number(e.target.value) || 0 })}
                      style={{
                        width: '52px',
                        background: '#0d1117',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '4px',
                        color: '#3898ff',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        padding: '1px 4px',
                        textAlign: 'right'
                      }}
                    />
                    <span style={{ color: '#64748b', fontSize: '10px' }}>°</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotation}
                  onChange={(e) => handleUpdate({ rotation: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#3898ff', marginBottom: '6px' }}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[0, 90, 180, -90].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => handleUpdate({ rotation: deg })}
                      style={{
                        flex: 1,
                        padding: '3px 0',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: rotation === deg ? '1px solid #3898ff' : '1px solid rgba(255,255,255,0.08)',
                        background: rotation === deg ? 'rgba(56, 152, 255, 0.15)' : '#0d1117',
                        color: rotation === deg ? '#3898ff' : '#94a3b8',
                        cursor: 'pointer'
                      }}
                    >
                      {deg}°
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleUpdate({ flipX: !flipX })}
                    title="Volteo Horizontal"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '3px 0',
                      fontSize: '10px',
                      borderRadius: '4px',
                      border: flipX ? '1px solid #3898ff' : '1px solid rgba(255,255,255,0.08)',
                      background: flipX ? 'rgba(56, 152, 255, 0.15)' : '#0d1117',
                      color: flipX ? '#3898ff' : '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    <FlipHorizontal size={11} />
                    <span>Flip X</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdate({ flipY: !flipY })}
                    title="Volteo Vertical"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '3px 0',
                      fontSize: '10px',
                      borderRadius: '4px',
                      border: flipY ? '1px solid #3898ff' : '1px solid rgba(255,255,255,0.08)',
                      background: flipY ? 'rgba(56, 152, 255, 0.15)' : '#0d1117',
                      color: flipY ? '#3898ff' : '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    <FlipVertical size={11} />
                    <span>Flip Y</span>
                  </button>
                </div>
              </div>

              {/* Fit Mode */}
              <div>
                <span style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Ajuste de Lienzo</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { id: 'cover', label: 'Rellenar (Cover)' },
                    { id: 'contain', label: 'Ajustar (Contain)' },
                    { id: 'fill', label: 'Estirar (Fill)' }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleUpdate({ fit: mode.id })}
                      style={{
                        flex: 1,
                        padding: '4px 0',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: fitMode === mode.id ? '1px solid #3898ff' : '1px solid rgba(255,255,255,0.08)',
                        background: fitMode === mode.id ? 'rgba(56, 152, 255, 0.18)' : '#0d1117',
                        color: fitMode === mode.id ? '#ffffff' : '#94a3b8',
                        cursor: 'pointer'
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. OPACITY & BLEND MODE SECTION */}
      {isVideoTrack && (
        <div className="effect-box" style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
          <div
            onClick={() => toggleSection('opacity')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#13161f',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: openSections.opacity ? '1px solid rgba(255, 255, 255, 0.06)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="lumetri-fx-badge" style={{ background: '#8b5cf6', color: '#fff' }}>fx</span>
              <Layers size={14} style={{ color: '#c084fc' }} />
              <strong style={{ fontSize: '12px', color: '#f1f5f9' }}>Opacidad & Modos de Fusión</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdate({ opacity: 1.0, blendMode: 'normal' });
                }}
                title="Restablecer Opacidad"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <RotateCcw size={12} />
              </button>
              {openSections.opacity ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </div>
          </div>

          {openSections.opacity && (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>Opacidad</span>
                  <span style={{ color: '#c084fc', fontFamily: 'monospace' }}>
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={opacity}
                  onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#c084fc' }}
                />
              </div>

              <div>
                <span style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Modo de Fusión</span>
                <select
                  value={blendMode}
                  onChange={(e) => handleUpdate({ blendMode: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    outline: 'none'
                  }}
                >
                  <option value="normal">Normal</option>
                  <option value="multiply">Multiplicar (Multiply)</option>
                  <option value="screen">Pantalla (Screen)</option>
                  <option value="overlay">Superponer (Overlay)</option>
                  <option value="soft-light">Luz Suave (Soft Light)</option>
                  <option value="hard-light">Luz Fuerte (Hard Light)</option>
                  <option value="difference">Diferencia (Difference)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. CROP & CORNER RADIUS SECTION */}
      {isVideoTrack && (
        <div className="effect-box" style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
          <div
            onClick={() => toggleSection('crop')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#13161f',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: openSections.crop ? '1px solid rgba(255, 255, 255, 0.06)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="lumetri-fx-badge" style={{ background: '#059669', color: '#fff' }}>fx</span>
              <Scissors size={14} style={{ color: '#34d399' }} />
              <strong style={{ fontSize: '12px', color: '#f1f5f9' }}>Recorte (Crop) & Esquinas</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdate({ cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, borderRadius: 0 });
                }}
                title="Restablecer Recorte"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <RotateCcw size={12} />
              </button>
              {openSections.crop ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </div>
          </div>

          {openSections.crop && (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Arriba</span>
                    <span style={{ color: '#34d399' }}>{cropTop}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    step="1"
                    value={cropTop}
                    onChange={(e) => handleUpdate({ cropTop: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#34d399' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Abajo</span>
                    <span style={{ color: '#34d399' }}>{cropBottom}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    step="1"
                    value={cropBottom}
                    onChange={(e) => handleUpdate({ cropBottom: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#34d399' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Izquierda</span>
                    <span style={{ color: '#34d399' }}>{cropLeft}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    step="1"
                    value={cropLeft}
                    onChange={(e) => handleUpdate({ cropLeft: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#34d399' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Derecha</span>
                    <span style={{ color: '#34d399' }}>{cropRight}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    step="1"
                    value={cropRight}
                    onChange={(e) => handleUpdate({ cropRight: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#34d399' }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>Bordes Redondeados</span>
                  <span style={{ color: '#34d399', fontFamily: 'monospace' }}>{borderRadius}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={borderRadius}
                  onChange={(e) => handleUpdate({ borderRadius: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#34d399' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. REAL-TIME VIDEO FILTERS & EFFECTS */}
      {isVideoTrack && (
        <div className="effect-box" style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
          <div
            onClick={() => toggleSection('filters')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#13161f',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: openSections.filters ? '1px solid rgba(255, 255, 255, 0.06)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="lumetri-fx-badge" style={{ background: '#d97706', color: '#fff' }}>fx</span>
              <Sparkles size={14} style={{ color: '#fbbf24' }} />
              <strong style={{ fontSize: '12px', color: '#f1f5f9' }}>Filtros & Efectos de Video</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdate({
                    blur: 0,
                    brightness: 1.0,
                    contrast: 1.0,
                    saturate: 1.0,
                    hueRotate: 0,
                    sepia: 0,
                    grayscale: 0,
                    invert: 0,
                    vignette: 0,
                    dropShadow: 0
                  });
                }}
                title="Restablecer Filtros"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <RotateCcw size={12} />
              </button>
              {openSections.filters ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </div>
          </div>

          {openSections.filters && (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Blur */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: '#94a3b8' }}>Desenfoque Gaussiano</span>
                  <span style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{blur}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="0.5"
                  value={blur}
                  onChange={(e) => handleUpdate({ blur: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#fbbf24' }}
                />
              </div>

              {/* Brightness & Contrast */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Brillo</span>
                    <span style={{ color: '#fbbf24' }}>{Math.round(brightness * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="2.0"
                    step="0.05"
                    value={brightness}
                    onChange={(e) => handleUpdate({ brightness: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Contraste</span>
                    <span style={{ color: '#fbbf24' }}>{Math.round(contrast * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="2.0"
                    step="0.05"
                    value={contrast}
                    onChange={(e) => handleUpdate({ contrast: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
              </div>

              {/* Saturation & Hue Rotate */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Saturación</span>
                    <span style={{ color: '#fbbf24' }}>{Math.round(saturate * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2.5"
                    step="0.05"
                    value={saturate}
                    onChange={(e) => handleUpdate({ saturate: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Giro de Tono</span>
                    <span style={{ color: '#fbbf24' }}>{hueRotate}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    value={hueRotate}
                    onChange={(e) => handleUpdate({ hueRotate: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
              </div>

              {/* Stylized FX: Sepia, Grayscale, Invert */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                    <span>Sepia</span>
                    <span style={{ color: '#fbbf24' }}>{sepia}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={sepia}
                    onChange={(e) => handleUpdate({ sepia: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                    <span>B&W</span>
                    <span style={{ color: '#fbbf24' }}>{grayscale}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={grayscale}
                    onChange={(e) => handleUpdate({ grayscale: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                    <span>Invert</span>
                    <span style={{ color: '#fbbf24' }}>{invert}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={invert}
                    onChange={(e) => handleUpdate({ invert: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
              </div>

              {/* Vignette & Drop Shadow */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Viñeta Cine</span>
                    <span style={{ color: '#fbbf24' }}>{vignette}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="2"
                    value={vignette}
                    onChange={(e) => handleUpdate({ vignette: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Sombra Drop</span>
                    <span style={{ color: '#fbbf24' }}>{dropShadow}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={dropShadow}
                    onChange={(e) => handleUpdate({ dropShadow: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#fbbf24' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. DISSOLVE & MOTION PRESETS (FADES & KEN BURNS) */}
      {isVideoTrack && (
        <div className="effect-box" style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
          <div
            onClick={() => toggleSection('animation')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#13161f',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: openSections.animation ? '1px solid rgba(255, 255, 255, 0.06)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="lumetri-fx-badge" style={{ background: '#0284c7', color: '#fff' }}>fx</span>
              <Film size={14} style={{ color: '#38bdf8' }} />
              <strong style={{ fontSize: '12px', color: '#f1f5f9' }}>Transiciones & Disoluciones</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdate({ fadeIn: 0, fadeOut: 0, motionPreset: 'none' });
                }}
                title="Restablecer Animación"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <RotateCcw size={12} />
              </button>
              {openSections.animation ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </div>
          </div>

          {openSections.animation && (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Fade In</span>
                    <span style={{ color: '#38bdf8' }}>{fadeIn.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={fadeIn}
                    onChange={(e) => handleUpdate({ fadeIn: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Fade Out</span>
                    <span style={{ color: '#38bdf8' }}>{fadeOut.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={fadeOut}
                    onChange={(e) => handleUpdate({ fadeOut: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. AUDIO EFFECTS (VOLUME, MUTE, SEPARATION) */}
      {(isAudioTrack || track?.type === 'video') && (
        <div className="effect-box" style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
          <div
            onClick={() => toggleSection('audio')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#13161f',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: openSections.audio ? '1px solid rgba(255, 255, 255, 0.06)' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="lumetri-fx-badge" style={{ background: '#10b981', color: '#fff' }}>fx</span>
              <Volume2 size={14} style={{ color: '#34d399' }} />
              <strong style={{ fontSize: '12px', color: '#f1f5f9' }}>Efectos de Audio del Clip</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdate({ volume: 1.0, muted: false });
                }}
                title="Restablecer Audio"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <RotateCcw size={12} />
              </button>
              {openSections.audio ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </div>
          </div>

          {openSections.audio && (
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleUpdate({ muted: !isMuted })}
                  style={{
                    background: isMuted ? '#ef4444' : '#242b3b',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px',
                    color: isMuted ? '#fff' : '#94a3b8',
                    cursor: 'pointer'
                  }}
                  title={isMuted ? 'Activar Sonido' : 'Silenciar'}
                >
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Nivel de Volumen</span>
                    <span style={{ color: '#34d399', fontFamily: 'monospace' }}>
                      {isMuted ? 'Muted' : `${Math.round(volume * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2.0"
                    step="0.02"
                    value={isMuted ? 0 : volume}
                    disabled={isMuted}
                    onChange={(e) => handleUpdate({ volume: Number(e.target.value), muted: false })}
                    style={{ width: '100%', accentColor: '#34d399' }}
                  />
                </div>
              </div>

              {/* Separate Audio Button */}
              {track?.type === 'video' && !selectedClip.audioSeparated && onSeparateAudio && (
                <button
                  type="button"
                  onClick={() => onSeparateAudio(selectedClip.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#34d399',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Music size={13} />
                  <span>Separar Audio a Pista Independiente</span>
                </button>
              )}

              {/* Unlink Button */}
              {selectedClip.linkedClipId && onUnlinkClip && (
                <button
                  type="button"
                  onClick={() => onUnlinkClip(selectedClip.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fbbf24',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Unlink size={13} />
                  <span>Desvincular Video y Audio</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clip Actions (Duplicate / Delete) */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        {onDuplicateClip && (
          <button
            type="button"
            onClick={() => onDuplicateClip(selectedClip.id)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              background: '#242b3b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <Copy size={13} />
            <span>Duplicar</span>
          </button>
        )}
        {onDeleteClip && (
          <button
            type="button"
            onClick={() => onDeleteClip(selectedClip.id)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <Trash2 size={13} />
            <span>Eliminar</span>
          </button>
        )}
      </div>
    </div>
  );
});
