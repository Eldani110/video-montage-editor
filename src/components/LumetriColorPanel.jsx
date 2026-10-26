import React from 'react';
import {
  Palette,
  Sun,
  Sliders,
  RotateCcw,
  Sparkles,
  Contrast,
  CircleDot
} from 'lucide-react';

export const LUMETRI_LOOK_PRESETS = [
  {
    id: 'natural',
    name: 'Natural (Plano)',
    color: '#94a3b8',
    patch: { temperature: 0, tint: 0, brightness: 1.0, contrast: 1.0, saturate: 1.0, sepia: 0, grayscale: 0, vignette: 0 }
  },
  {
    id: 'teal_orange',
    name: 'Teal & Orange (Cine)',
    color: '#38bdf8',
    patch: { temperature: 28, tint: -18, brightness: 1.02, contrast: 1.25, saturate: 1.35, sepia: 0, grayscale: 0, vignette: 22 }
  },
  {
    id: 'monochrome_noir',
    name: 'Noir (Cine Negro)',
    color: '#e2e8f0',
    patch: { temperature: 0, tint: 0, brightness: 0.98, contrast: 1.45, saturate: 0.0, sepia: 0, grayscale: 100, vignette: 35 }
  },
  {
    id: 'vintage_70s',
    name: 'Vintage Kodachrome',
    color: '#fbbf24',
    patch: { temperature: 45, tint: 12, brightness: 1.05, contrast: 1.15, saturate: 1.1, sepia: 32, grayscale: 0, vignette: 25 }
  },
  {
    id: 'cyber_neon',
    name: 'Cyberpunk Neon',
    color: '#a855f7',
    patch: { temperature: -30, tint: 32, brightness: 1.05, contrast: 1.25, saturate: 1.55, sepia: 0, grayscale: 0, vignette: 18 }
  },
  {
    id: 'moody_green',
    name: 'Bosque / Nórdico',
    color: '#10b981',
    patch: { temperature: -20, tint: -25, brightness: 0.95, contrast: 1.2, saturate: 0.88, sepia: 0, grayscale: 0, vignette: 30 }
  },
  {
    id: 'bleach_bypass',
    name: 'Bleach Bypass',
    color: '#cbd5e1',
    patch: { temperature: 5, tint: -5, brightness: 1.12, contrast: 1.6, saturate: 0.45, sepia: 0, grayscale: 0, vignette: 40 }
  }
];

export const LumetriColorPanel = React.memo(function LumetriColorPanel({
  selectedClip,
  onUpdateClip,
  onBeginTransform = null,
  onEndTransform = null
}) {
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
            background: 'rgba(234, 179, 8, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#eab308',
            border: '1px solid rgba(234, 179, 8, 0.25)'
          }}
        >
          <Palette size={24} />
        </div>
        <h4 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 600 }}>
          Sin Selección de Clip
        </h4>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, maxWidth: '280px' }}>
          Selecciona un clip en la línea de tiempo para aplicar corrección de color Lumetri, temperatura, balance y estilos cinematográficos.
        </p>
      </div>
    );
  }

  const temperature = Number(selectedClip.temperature || 0);
  const tint = Number(selectedClip.tint || 0);
  const brightness = selectedClip.brightness !== undefined ? Number(selectedClip.brightness) : 1.0;
  const contrast = selectedClip.contrast !== undefined ? Number(selectedClip.contrast) : 1.0;
  const saturate = selectedClip.saturate !== undefined ? Number(selectedClip.saturate) : 1.0;
  const vignette = Number(selectedClip.vignette || 0);

  const handleUpdate = (patch, recordHistory = true) => {
    if (onUpdateClip) {
      onUpdateClip(selectedClip.id, patch, recordHistory);
    }
  };

  const handleResetLumetri = () => {
    handleUpdate({
      temperature: 0,
      tint: 0,
      brightness: 1.0,
      contrast: 1.0,
      saturate: 1.0,
      vignette: 0,
      sepia: 0,
      grayscale: 0
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#e2e8f0', fontSize: '12px' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '10px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="lumetri-fx-badge" style={{ background: '#f59e0b', color: '#000' }}>fx</span>
          <strong style={{ fontSize: '13px', color: '#f1f5f9' }}>Lumetri Color Grading</strong>
        </div>
        <button
          type="button"
          onClick={handleResetLumetri}
          title="Restablecer Lumetri a valores naturales"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px'
          }}
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>
      </div>

      {/* 1. Cinematic LUT Looks Presets */}
      <div style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Sparkles size={14} style={{ color: '#eab308' }} />
          <strong style={{ color: '#f8fafc', fontSize: '12px' }}>Estilos Cinematográficos (LUTs)</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {LUMETRI_LOOK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleUpdate(preset.patch)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 8px',
                background: '#0d1117',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                color: '#cbd5e1',
                fontSize: '11px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: preset.color, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. White Balance (Temperature & Tint) */}
      <div style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <strong style={{ color: '#f8fafc', fontSize: '12px' }}>Balance de Blancos (WB)</strong>

        {/* Temperature */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Temperatura</span>
            <span style={{ color: temperature > 0 ? '#f59e0b' : temperature < 0 ? '#38bdf8' : '#94a3b8', fontFamily: 'monospace' }}>
              {temperature > 0 ? `+${temperature}` : temperature}
            </span>
          </div>
          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            className="lumetri-slider-temp"
            value={temperature}
            onChange={(e) => handleUpdate({ temperature: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Tint */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Tinte (Verde / Magenta)</span>
            <span style={{ color: tint > 0 ? '#ec4899' : tint < 0 ? '#10b981' : '#94a3b8', fontFamily: 'monospace' }}>
              {tint > 0 ? `+${tint}` : tint}
            </span>
          </div>
          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            className="lumetri-slider-tint"
            value={tint}
            onChange={(e) => handleUpdate({ tint: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* 3. Tone & Exposure */}
      <div style={{ background: '#181b24', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <strong style={{ color: '#f8fafc', fontSize: '12px' }}>Tonalidad & Exposición</strong>

        {/* Exposure / Brightness */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Exposición / Brillo</span>
            <span style={{ color: '#3898ff', fontFamily: 'monospace' }}>
              {Math.round(brightness * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.0"
            step="0.02"
            value={brightness}
            onChange={(e) => handleUpdate({ brightness: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#3898ff' }}
          />
        </div>

        {/* Contrast */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Contraste</span>
            <span style={{ color: '#3898ff', fontFamily: 'monospace' }}>
              {Math.round(contrast * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.0"
            step="0.02"
            value={contrast}
            onChange={(e) => handleUpdate({ contrast: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#3898ff' }}
          />
        </div>

        {/* Saturation */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Saturación</span>
            <span style={{ color: '#3898ff', fontFamily: 'monospace' }}>
              {Math.round(saturate * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2.5"
            step="0.05"
            value={saturate}
            onChange={(e) => handleUpdate({ saturate: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#3898ff' }}
          />
        </div>

        {/* Vignette */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#94a3b8' }}>Viñeta Lumetri</span>
            <span style={{ color: '#3898ff', fontFamily: 'monospace' }}>
              {vignette}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="2"
            value={vignette}
            onChange={(e) => handleUpdate({ vignette: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#3898ff' }}
          />
        </div>
      </div>
    </div>
  );
});
