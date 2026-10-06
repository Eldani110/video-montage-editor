import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Download,
  Film,
  CheckCircle2,
  Loader2,
  Sliders,
  Volume2,
  VolumeX,
  Sparkles,
  Play,
  Pause,
  Clock,
  HardDrive,
  Zap,
  AlertTriangle,
  RotateCcw,
  Monitor,
  Smartphone,
  Square,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock
} from 'lucide-react';
import { exportMontageVideo, isWebCodecsSupported } from '../utils/exportVideo';

const ASPECT_INFO = {
  '16:9': { label: '16:9 Panorámico', sub: 'YouTube, TV, Horizontal', icon: Monitor },
  '9:16': { label: '9:16 Vertical', sub: 'TikTok, Reels, Shorts', icon: Smartphone },
  '1:1': { label: '1:1 Cuadrado', sub: 'Instagram Feed, Post', icon: Square },
  '4:5': { label: '4:5 Retrato', sub: 'Instagram Vertical', icon: Smartphone },
  '21:9': { label: '21:9 Ultra Ancho', sub: 'Cinemático', icon: Monitor },
};

export function ExportModal({ isOpen, onClose, project }) {
  // Config state
  const [format, setFormat] = useState('mp4'); // 'mp4' | 'webm'
  const [exportAspectMode, setExportAspectMode] = useState('project'); // 'project' | '16:9' | '9:16' | '1:1' | '4:5' | '21:9'
  const [showAspectOverride, setShowAspectOverride] = useState(false);

  const [resolutionPreset, setResolutionPreset] = useState('1080p'); // '1080p' | '720p' | '2k' | '4k' | 'project' | 'custom'
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  const [fps, setFps] = useState(30); // 24 | 25 | 30 | 50 | 60
  const [bitratePreset, setBitratePreset] = useState('auto'); // 'auto' | '4m' | '8m' | '16m' | '28m' | '45m' | 'custom'
  const [customBitrateMbps, setCustomBitrateMbps] = useState(14);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [audioBitrate, setAudioBitrate] = useState(192); // 128 | 192 | 320
  const [performanceMode, setPerformanceMode] = useState('balanced'); // 'balanced' | 'fast'

  // Export progress state
  const [isExporting, setIsExporting] = useState(false);
  const [progressData, setProgressData] = useState({
    percent: 0,
    phase: 'init',
    currentFrame: 0,
    totalFrames: 0,
    fps: 0,
    etaSeconds: 0,
    message: ''
  });

  // Result state
  const [videoBlob, setVideoBlob] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const [customFilename, setCustomFilename] = useState('');
  const [error, setError] = useState(null);

  // References
  const abortControllerRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const resultVideoRef = useRef(null);
  const lastCanvasDrawRef = useRef(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Project base specs
  const projectWidth = project?.settings?.width || 1920;
  const projectHeight = project?.settings?.height || 1080;
  const projectAspect = project?.settings?.aspectRatio || '16:9';

  // Active aspect ratio for export
  const activeAspect = exportAspectMode === 'project' ? projectAspect : exportAspectMode;

  // Calculate resolution presets strictly respecting the chosen aspect ratio
  const getPresetDimensions = (preset, aspect) => {
    switch (preset) {
      case '720p':
        if (aspect === '9:16') return { width: 720, height: 1280 };
        if (aspect === '1:1') return { width: 720, height: 720 };
        if (aspect === '4:5') return { width: 720, height: 900 };
        if (aspect === '21:9') return { width: 1680, height: 720 };
        return { width: 1280, height: 720 };
      case '1080p':
        if (aspect === '9:16') return { width: 1080, height: 1920 };
        if (aspect === '1:1') return { width: 1080, height: 1080 };
        if (aspect === '4:5') return { width: 1080, height: 1350 };
        if (aspect === '21:9') return { width: 2560, height: 1080 };
        return { width: 1920, height: 1080 };
      case '2k':
        if (aspect === '9:16') return { width: 1440, height: 2560 };
        if (aspect === '1:1') return { width: 1440, height: 1440 };
        if (aspect === '4:5') return { width: 1440, height: 1800 };
        if (aspect === '21:9') return { width: 3440, height: 1440 };
        return { width: 2560, height: 1440 };
      case '4k':
        if (aspect === '9:16') return { width: 2160, height: 3840 };
        if (aspect === '1:1') return { width: 2160, height: 2160 };
        if (aspect === '4:5') return { width: 2160, height: 2700 };
        if (aspect === '21:9') return { width: 5120, height: 2160 };
        return { width: 3840, height: 2160 };
      case 'project':
        return { width: projectWidth, height: projectHeight };
      case 'custom':
      default:
        return { width: customWidth, height: customHeight };
    }
  };

  const activeDimensions = getPresetDimensions(resolutionPreset, activeAspect);
  const exportWidth = resolutionPreset === 'custom'
    ? Math.max(128, Number(customWidth) || 1920)
    : activeDimensions.width;
  const exportHeight = resolutionPreset === 'custom'
    ? Math.max(128, Number(customHeight) || 1080)
    : activeDimensions.height;

  // Calculate intelligent auto bitrate based on pixel density and framerate
  const getAutoBitrate = (w, h, currentFps) => {
    const pixels = w * h;
    const isHighFps = currentFps >= 50;
    if (pixels >= 3840 * 2160 * 0.8) {
      // 4K Ultra HD
      return isHighFps ? 65000000 : 45000000;
    } else if (pixels >= 2560 * 1440 * 0.8) {
      // 2K QHD
      return isHighFps ? 30000000 : 20000000;
    } else if (pixels >= 1920 * 1080 * 0.8) {
      // 1080p Full HD
      return isHighFps ? 16000000 : 10000000;
    } else {
      // 720p HD or lower
      return isHighFps ? 8000000 : 5000000;
    }
  };

  const getEffectiveBitrate = () => {
    switch (bitratePreset) {
      case 'auto':
        return getAutoBitrate(exportWidth, exportHeight, fps);
      case '4m':
        return 4000000;
      case '8m':
        return 8000000;
      case '16m':
        return 16000000;
      case '28m':
        return 28000000;
      case '45m':
        return 45000000;
      case 'custom':
        return Math.max(1000000, Math.round(Number(customBitrateMbps || 8) * 1000000));
      default:
        return 8000000;
    }
  };

  const autoBitrateMbps = Math.round(getAutoBitrate(exportWidth, exportHeight, fps) / 1000000);
  const livePreviewHeight = Math.max(120, Math.round(320 * (exportHeight / exportWidth)));

  // Compute actual duration up to the last clip in the timeline
  const effectiveContentDuration = React.useMemo(() => {
    let maxEnd = 0;
    (project?.tracks || []).forEach(t => {
      (t.clips || []).forEach(c => {
        const end = (c.startTime || 0) + (c.duration || 0);
        if (end > maxEnd) maxEnd = end;
      });
    });
    return maxEnd > 0 ? Number(maxEnd.toFixed(2)) : (project?.settings?.duration || 20);
  }, [project]);

  const sequenceDuration = project?.settings?.duration || 20;

  const [durationMode, setDurationMode] = useState('content'); // 'content' | 'sequence' | 'custom'
  const [customDuration] = useState(effectiveContentDuration);

  const exportDuration = durationMode === 'content'
    ? effectiveContentDuration
    : (durationMode === 'sequence' ? sequenceDuration : Math.max(1, Number(customDuration) || 1));

  // Initialize default filename
  useEffect(() => {
    if (project?.name) {
      const clean = project.name.toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
      setCustomFilename(`${clean}_render`);
    } else {
      setCustomFilename(`montaje_${Date.now()}`);
    }
  }, [project?.name, isOpen]);

  // Clean up object URLs on unmount or reset
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setError(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
      setVideoBlob(null);
    }

    setProgressData({
      percent: 0,
      phase: 'preloading',
      currentFrame: 0,
      totalFrames: Math.floor(exportDuration * fps),
      fps: 0,
      etaSeconds: 0,
      message: 'Iniciando motor de exportación...'
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const blob = await exportMontageVideo(project, {
        format,
        width: exportWidth,
        height: exportHeight,
        duration: exportDuration,
        fps,
        bitrate: getEffectiveBitrate(),
        audioBitrate,
        includeAudio,
        throttleMode: performanceMode,
        pacingMs: performanceMode === 'balanced' ? 12 : 2,
        signal: abortController.signal,
        onProgress: (prog) => {
          if (typeof prog === 'number') {
            setProgressData(prev => ({ ...prev, percent: prog }));
          } else if (prog && typeof prog === 'object') {
            setProgressData(prog);

            // Mirror live canvas frame to thumbnail monitor (throttled to save CPU and GPU blits)
            if (prog.canvas && previewCanvasRef.current) {
              const now = performance.now();
              if (now - lastCanvasDrawRef.current >= 120) {
                lastCanvasDrawRef.current = now;
                const targetCanvas = previewCanvasRef.current;
                const tCtx = targetCanvas.getContext('2d');
                if (tCtx) {
                  const targetW = 320;
                  const targetH = Math.max(120, Math.round(320 * (exportHeight / exportWidth)));
                  if (targetCanvas.width !== targetW || targetCanvas.height !== targetH) {
                    targetCanvas.width = targetW;
                    targetCanvas.height = targetH;
                  }
                  tCtx.drawImage(prog.canvas, 0, 0, targetW, targetH);
                }
              }
            }
          }
        }
      });

      const url = URL.createObjectURL(blob);
      setVideoBlob(blob);
      setDownloadUrl(url);
      setFileSizeBytes(blob.size);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Exportación cancelada por el usuario.');
      } else {
        console.error('Error durante la exportación:', err);
        setError(`Error durante la exportación: ${err.message || 'Fallo desconocido'}`);
      }
    } finally {
      setIsExporting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    const extension = format === 'mp4' ? 'mp4' : 'webm';
    const finalName = (customFilename.trim() || 'montaje_exportado') + '.' + extension;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return mb.toFixed(2) + ' MB';
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleResetForNewExport = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    setVideoBlob(null);
    setError(null);
  };

  const webCodecsAvailable = isWebCodecsSupported();

  return (
    <div className="modal-backdrop">
      <div className="modal-container export-modal-dialog">
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge export-icon-badge">
              <Film size={22} className="text-cyan" />
            </div>
            <div>
              <h3>Exportar Montaje Audiovisual</h3>
              <p>Renderizado profesional de alta fidelidad con WebCodecs por hardware</p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose} disabled={isExporting}>
            <X size={18} />
          </button>
        </div>

        <div className="export-content">
          {error && (
            <div className="alert-box alert-error">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* STATE 1: CONFIGURATION (Before Export) */}
          {!isExporting && !downloadUrl && (
            <div className="export-config-panel">
              {/* Hardware Acceleration Indicator */}
              <div className="hw-accel-banner">
                <div className="hw-accel-left">
                  <Zap size={16} className={webCodecsAvailable ? 'text-amber' : 'text-slate'} />
                  <div>
                    <span className="hw-accel-title">
                      ⚡ Motor WebCodecs GPU Puro
                    </span>
                    <p className="hw-accel-desc">
                      Renderizado y decodificación directa por hardware con soporte 4K Ultra HD y audio AAC-LC / Opus sin caídas de cuadros.
                    </p>
                  </div>
                </div>
                <span className="badge-tech">GPU Hardware</span>
              </div>

              {/* SECTION: Canvas & Aspect Ratio Context */}
              <div className="form-group">
                <div className="canvas-banner-card">
                  <div className="canvas-banner-main">
                    <div className="canvas-banner-icon-box">
                      {React.createElement(ASPECT_INFO[activeAspect]?.icon || Monitor, {
                        size: 20,
                        className: 'text-cyan'
                      })}
                    </div>
                    <div className="canvas-banner-text">
                      <div className="canvas-banner-title-row">
                        <span className="canvas-banner-title">
                          Lienzo del Proyecto: <strong>{ASPECT_INFO[projectAspect]?.label || projectAspect}</strong>
                        </span>
                        <span className="badge badge-indigo">
                          {projectWidth} × {projectHeight} px
                        </span>
                      </div>
                      <p className="canvas-banner-desc">
                        {activeAspect === projectAspect
                          ? 'Las resoluciones de salida se adaptan automáticamente a la proporción del proyecto para un encuadre perfecto sin barras negras ni estiramiento.'
                          : `Exportando adaptado a formato ${ASPECT_INFO[activeAspect]?.label || activeAspect}. Las resoluciones se calculan según esta proporción.`}
                      </p>
                    </div>
                  </div>

                  <div className="canvas-banner-actions">
                    <button
                      type="button"
                      className={`btn-secondary btn-sm ${showAspectOverride ? 'active' : ''}`}
                      onClick={() => setShowAspectOverride(!showAspectOverride)}
                    >
                      <SlidersHorizontal size={13} />
                      <span>{showAspectOverride ? 'Ocultar opciones de formato' : 'Adaptar a otra red social'}</span>
                      {showAspectOverride ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {showAspectOverride && (
                    <div className="canvas-ratio-picker">
                      <label className="ratio-picker-label">Seleccionar formato de salida:</label>
                      <div className="ratio-picker-grid">
                        <button
                          type="button"
                          className={`ratio-pick-chip ${exportAspectMode === 'project' ? 'active' : ''}`}
                          onClick={() => setExportAspectMode('project')}
                        >
                          <span className="ratio-chip-title">Mismo del Proyecto</span>
                          <span className="ratio-chip-sub">{projectAspect} Original</span>
                        </button>
                        {Object.entries(ASPECT_INFO).map(([key, info]) => (
                          <button
                            key={key}
                            type="button"
                            className={`ratio-pick-chip ${exportAspectMode === key ? 'active' : ''}`}
                            onClick={() => setExportAspectMode(key)}
                          >
                            <span className="ratio-chip-title">{info.label}</span>
                            <span className="ratio-chip-sub">{info.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Format Selection */}
              <div className="form-group">
                <label className="export-field-label">Formato de Salida</label>
                <div className="export-pill-grid format-pill-grid">
                  <button
                    type="button"
                    className={`export-pill-btn ${format === 'mp4' ? 'active' : ''}`}
                    onClick={() => setFormat('mp4')}
                  >
                    <div className="pill-header">
                      <span className="pill-title">MP4 Video</span>
                      <span className="pill-badge pill-badge-cyan">Recomendado</span>
                    </div>
                    <span className="pill-subtitle">H.264 / AAC — Máxima compatibilidad (Redes, Apple, Windows, TV, Móvil)</span>
                  </button>

                  <button
                    type="button"
                    className={`export-pill-btn ${format === 'webm' ? 'active' : ''}`}
                    onClick={() => setFormat('webm')}
                  >
                    <div className="pill-header">
                      <span className="pill-title">WebM Video</span>
                      <span className="pill-badge pill-badge-purple">Ultra HD</span>
                    </div>
                    <span className="pill-subtitle">VP9 / Opus — Alta compresión y fidelidad para web moderna y navegadores</span>
                  </button>
                </div>
              </div>

              {/* Resolution Selection Strictly Respecting Project Canvas Aspect */}
              <div className="form-group">
                <div className="label-with-meta">
                  <label className="export-field-label">Resolución de Exportación</label>
                  <span className="label-meta-highlight">
                    {exportWidth} × {exportHeight} ({activeAspect})
                  </span>
                </div>
                <div className="export-resolution-grid">
                  {[
                    {
                      id: '1080p',
                      title: '1080p Full HD',
                      badge: 'Estándar Pro',
                      badgeColor: 'cyan',
                      dims: getPresetDimensions('1080p', activeAspect),
                      icon: Sparkles
                    },
                    {
                      id: '4k',
                      title: '4K Ultra HD',
                      badge: 'Master UHD',
                      badgeColor: 'purple',
                      dims: getPresetDimensions('4k', activeAspect),
                      icon: Zap
                    },
                    {
                      id: '2k',
                      title: '2K QHD',
                      badge: 'Alta Nitidez',
                      badgeColor: 'indigo',
                      dims: getPresetDimensions('2k', activeAspect),
                      icon: Monitor
                    },
                    {
                      id: '720p',
                      title: '720p HD',
                      badge: 'Rápido',
                      badgeColor: 'slate',
                      dims: getPresetDimensions('720p', activeAspect),
                      icon: Film
                    },
                    {
                      id: 'project',
                      title: 'Lienzo Nativo',
                      badge: `${projectWidth}×${projectHeight}`,
                      badgeColor: 'emerald',
                      dims: { width: projectWidth, height: projectHeight },
                      icon: HardDrive
                    },
                    {
                      id: 'custom',
                      title: 'Personalizada',
                      badge: 'A Medida',
                      badgeColor: 'amber',
                      dims: { width: customWidth, height: customHeight },
                      icon: Sliders
                    }
                  ].map((res) => {
                    const IconComp = res.icon;
                    const isSelected = resolutionPreset === res.id;
                    return (
                      <button
                        key={res.id}
                        type="button"
                        className={`resolution-card-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setResolutionPreset(res.id);
                          if (res.id !== 'custom') {
                            setCustomWidth(res.dims.width);
                            setCustomHeight(res.dims.height);
                          }
                        }}
                      >
                        <div className="res-card-top">
                          <div className="res-title-group">
                            <IconComp size={15} className={isSelected ? 'text-cyan' : 'text-slate'} />
                            <span className="res-card-title">{res.title}</span>
                          </div>
                          {res.badge && (
                            <span className={`pill-badge pill-badge-${res.badgeColor}`}>
                              {res.badge}
                            </span>
                          )}
                        </div>
                        <div className="res-card-bottom">
                          <span className="res-card-dims">
                            {res.dims.width} × {res.dims.height} px
                          </span>
                          <span className="res-card-ratio">{activeAspect}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {resolutionPreset === 'custom' && (
                  <div className="custom-resolution-box">
                    <div className="custom-res-field">
                      <label>Ancho (px):</label>
                      <input
                        type="number"
                        min="240"
                        max="7680"
                        step="2"
                        className="input-field input-sm"
                        value={customWidth}
                        onChange={(e) => {
                          const w = Math.max(128, parseInt(e.target.value, 10) || 0);
                          setCustomWidth(w);
                          if (lockAspectRatio) {
                            const ratio = activeDimensions ? (activeDimensions.height / activeDimensions.width) : (9 / 16);
                            setCustomHeight(Math.round((w * ratio) / 2) * 2);
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className={`btn-subtle icon-only ${lockAspectRatio ? 'active' : ''}`}
                      title={lockAspectRatio ? 'Proporción bloqueada' : 'Proporción libre'}
                      onClick={() => setLockAspectRatio(!lockAspectRatio)}
                    >
                      {lockAspectRatio ? <Lock size={15} className="text-cyan" /> : <Unlock size={15} />}
                    </button>
                    <div className="custom-res-field">
                      <label>Alto (px):</label>
                      <input
                        type="number"
                        min="240"
                        max="4320"
                        step="2"
                        className="input-field input-sm"
                        value={customHeight}
                        onChange={(e) => {
                          const h = Math.max(128, parseInt(e.target.value, 10) || 0);
                          setCustomHeight(h);
                          if (lockAspectRatio) {
                            const ratio = activeDimensions ? (activeDimensions.width / activeDimensions.height) : (16 / 9);
                            setCustomWidth(Math.round((h * ratio) / 2) * 2);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Framerate & Quality Row */}
              <div className="export-two-col">
                {/* Framerate */}
                <div className="form-group">
                  <label className="export-field-label">Cuadros por Segundo (FPS)</label>
                  <div className="export-pill-row">
                    {[
                      { val: 24, label: '24 FPS', sub: 'Cine' },
                      { val: 25, label: '25 FPS', sub: 'PAL' },
                      { val: 30, label: '30 FPS', sub: 'Estándar' },
                      { val: 50, label: '50 FPS', sub: 'PAL HD' },
                      { val: 60, label: '60 FPS', sub: 'Fluido' },
                    ].map(f => (
                      <button
                        key={f.val}
                        type="button"
                        className={`fps-chip ${fps === f.val ? 'active' : ''}`}
                        onClick={() => setFps(f.val)}
                      >
                        {f.label} <small>{f.sub}</small>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bitrate / Quality */}
                <div className="form-group">
                  <div className="label-with-meta">
                    <label className="export-field-label">Tasa de Bits (Calidad)</label>
                    <span className="label-meta-highlight">
                      {Math.round(getEffectiveBitrate() / 1000000)} Mbps
                    </span>
                  </div>
                  <div className="bitrate-pill-row">
                    <button
                      type="button"
                      className={`fps-chip ${bitratePreset === 'auto' ? 'active' : ''}`}
                      onClick={() => setBitratePreset('auto')}
                    >
                      Auto <small>{autoBitrateMbps} Mbps</small>
                    </button>
                    <button
                      type="button"
                      className={`fps-chip ${bitratePreset === '4m' ? 'active' : ''}`}
                      onClick={() => setBitratePreset('4m')}
                    >
                      4 Mbps <small>Ligero</small>
                    </button>
                    <button
                      type="button"
                      className={`fps-chip ${bitratePreset === '8m' ? 'active' : ''}`}
                      onClick={() => setBitratePreset('8m')}
                    >
                      8 Mbps <small>Estándar</small>
                    </button>
                    <button
                      type="button"
                      className={`fps-chip ${bitratePreset === '16m' ? 'active' : ''}`}
                      onClick={() => setBitratePreset('16m')}
                    >
                      16 Mbps <small>Alta</small>
                    </button>
                    <button
                      type="button"
                      className={`fps-chip ${bitratePreset === '28m' ? 'active' : ''}`}
                      onClick={() => setBitratePreset('28m')}
                    >
                      28 Mbps <small>Pro 2K</small>
                    </button>
                    <button
                      type="button"
                      className={`fps-chip ${bitratePreset === '45m' ? 'active' : ''}`}
                      onClick={() => setBitratePreset('45m')}
                    >
                      45 Mbps <small>Master 4K</small>
                    </button>
                    <button
                      type="button"
                      className={`fps-chip ${bitratePreset === 'custom' ? 'active' : ''}`}
                      onClick={() => setBitratePreset('custom')}
                    >
                      Manual <small>Personalizado</small>
                    </button>
                  </div>
                  {bitratePreset === 'custom' && (
                    <div className="custom-bitrate-input-row">
                      <label>Tasa de bits deseada:</label>
                      <input
                        type="number"
                        min="1"
                        max="150"
                        className="input-field input-sm"
                        style={{ width: '80px' }}
                        value={customBitrateMbps}
                        onChange={(e) => setCustomBitrateMbps(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      />
                      <span className="unit-label">Mbps</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Audio Settings Card */}
              <div className="audio-toggle-card">
                <div className="audio-toggle-top">
                  <div className="audio-toggle-left">
                    {includeAudio ? <Volume2 size={20} className="text-cyan" /> : <VolumeX size={20} className="text-slate" />}
                    <div>
                      <span className="audio-toggle-title">Incluir Mezcla de Audio Multicanal</span>
                      <p className="audio-toggle-desc">
                        Sintetiza música de fondo, efectos de sonido y pistas de video en un flujo estéreo a 48kHz.
                      </p>
                    </div>
                  </div>
                  <label className="switch-toggle">
                    <input
                      type="checkbox"
                      checked={includeAudio}
                      onChange={(e) => setIncludeAudio(e.target.checked)}
                    />
                    <span className="slider-round"></span>
                  </label>
                </div>

                {includeAudio && (
                  <div className="audio-quality-row">
                    <span className="audio-quality-label">Calidad y Tasa de Audio:</span>
                    <div className="audio-chip-group">
                      {[
                        { val: 128, label: '128 kbps', sub: 'Estándar Web' },
                        { val: 192, label: '192 kbps', sub: 'Estudio (Recomendado)' },
                        { val: 320, label: '320 kbps', sub: 'Master Hi-Fi' },
                      ].map(a => (
                        <button
                          key={a.val}
                          type="button"
                          className={`audio-chip ${audioBitrate === a.val ? 'active' : ''}`}
                          onClick={() => setAudioBitrate(a.val)}
                        >
                          {a.label} <small>{a.sub}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Range & Duration Selection */}
              <div className="form-group">
                <div className="label-with-meta">
                  <label className="export-field-label">Rango de Exportación</label>
                  <span className="label-meta-highlight">
                    {exportDuration}s ({formatSeconds(exportDuration)}) • {Math.floor(exportDuration * fps)} cuadros
                  </span>
                </div>
                <div className="export-pill-grid duration-pill-grid">
                  <button
                    type="button"
                    className={`export-pill-btn ${durationMode === 'content' ? 'active' : ''}`}
                    onClick={() => setDurationMode('content')}
                  >
                    <div className="pill-header">
                      <span className="pill-title">Montaje Editado (Hasta el último clip)</span>
                      <span className="pill-badge pill-badge-cyan">Recomendado</span>
                    </div>
                    <span className="pill-subtitle">
                      {effectiveContentDuration}s ({formatSeconds(effectiveContentDuration)}) — Exporta exclusivamente los clips editados en la línea de tiempo.
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`export-pill-btn ${durationMode === 'sequence' ? 'active' : ''}`}
                    onClick={() => setDurationMode('sequence')}
                  >
                    <div className="pill-header">
                      <span className="pill-title">Secuencia Completa</span>
                      {sequenceDuration > 300 && (
                        <span className="pill-badge pill-badge-purple">Total: {formatSeconds(sequenceDuration)}</span>
                      )}
                    </div>
                    <span className="pill-subtitle">
                      {sequenceDuration}s ({formatSeconds(sequenceDuration)}) — Exporta toda la duración configurada en el proyecto.
                    </span>
                  </button>
                </div>
              </div>

              {/* Performance & System Load Mode */}
              <div className="form-group">
                <div className="label-with-meta">
                  <label className="export-field-label">Carga del Sistema y Rendimiento</label>
                  <span className="label-meta-highlight">
                    {performanceMode === 'balanced' ? '⚡ Uso de CPU Moderado (30-40%)' : '🚀 Máxima Velocidad'}
                  </span>
                </div>
                <div className="export-pill-grid duration-pill-grid">
                  <button
                    type="button"
                    className={`export-pill-btn ${performanceMode === 'balanced' ? 'active' : ''}`}
                    onClick={() => setPerformanceMode('balanced')}
                  >
                    <div className="pill-header">
                      <span className="pill-title">Modo Fluido / Segundo Plano</span>
                      <span className="pill-badge pill-badge-cyan">Recomendado</span>
                    </div>
                    <span className="pill-subtitle">
                      Pausa micro-ciclos entre cuadros para que tu computadora, navegador y mouse se mantengan 100% ágiles y sin sobrecalentarse.
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`export-pill-btn ${performanceMode === 'fast' ? 'active' : ''}`}
                    onClick={() => setPerformanceMode('fast')}
                  >
                    <div className="pill-header">
                      <span className="pill-title">Máxima Potencia</span>
                      <span className="pill-badge pill-badge-purple">Prioritario</span>
                    </div>
                    <span className="pill-subtitle">
                      Aprovecha toda la capacidad disponible de la CPU/GPU para finalizar en el menor tiempo posible.
                    </span>
                  </button>
                </div>
              </div>

              {/* Summary Overview */}
              <div className="export-summary-box">
                <div className="summary-stat-cell">
                  <span className="stat-label">Duración</span>
                  <span className="stat-value">{exportDuration}s</span>
                </div>
                <div className="summary-stat-divider" />
                <div className="summary-stat-cell">
                  <span className="stat-label">Fotogramas</span>
                  <span className="stat-value">{Math.floor(exportDuration * fps)} cuadros</span>
                </div>
                <div className="summary-stat-divider" />
                <div className="summary-stat-cell">
                  <span className="stat-label">FPS</span>
                  <span className="stat-value">{fps} FPS</span>
                </div>
                <div className="summary-stat-divider" />
                <div className="summary-stat-cell">
                  <span className="stat-label">Bitrate</span>
                  <span className="stat-value">{Math.round(getEffectiveBitrate() / 1000000)} Mbps</span>
                </div>
                <div className="summary-stat-divider" />
                <div className="summary-stat-cell">
                  <span className="stat-label">Resolución</span>
                  <span className="stat-value">{exportWidth}×{exportHeight}</span>
                </div>
                <div className="summary-stat-divider" />
                <div className="summary-stat-cell">
                  <span className="stat-label">Codec</span>
                  <span className="stat-value">{format === 'mp4' ? 'H.264 / AAC' : 'VP9 / Opus'}</span>
                </div>
              </div>

              {/* Launch Button */}
              <button
                type="button"
                className="btn-primary btn-large full-width export-start-btn"
                onClick={handleStartExport}
              >
                <Film size={20} />
                <span>Comenzar Renderizado Profesional ({exportWidth}×{exportHeight})</span>
              </button>
            </div>
          )}

          {/* STATE 2: ACTIVE EXPORT IN PROGRESS */}
          {isExporting && (
            <div className="export-progress-panel">
              {/* Live Preview Monitor */}
              <div className="export-live-monitor">
                <canvas
                  ref={previewCanvasRef}
                  className="live-render-canvas"
                  width={320}
                  height={180}
                />
                <div className="live-monitor-badge">
                  <span className="live-indicator-dot"></span>
                  <span>EN VIVO: PROCESANDO</span>
                </div>
              </div>

              {/* Progress status and metrics */}
              <div className="export-metrics-box">
                <div className="metrics-header">
                  <div className="metrics-title">
                    <Loader2 size={18} className="spinner text-cyan" />
                    <span className="metrics-message">{progressData.message || 'Procesando fotogramas...'}</span>
                  </div>
                  <span className="metrics-percentage timecode">{progressData.percent}%</span>
                </div>

                {/* Progress bar */}
                <div className="export-progress-track">
                  <div
                    className="export-progress-fill"
                    style={{ width: `${Math.max(2, progressData.percent)}%` }}
                  ></div>
                </div>

                {/* Detailed stats chips */}
                <div className="export-stats-chips">
                  <div className="stats-chip">
                    <Film size={13} className="text-secondary" />
                    <span>
                      Fotograma {progressData.currentFrame || 0} / {progressData.totalFrames || Math.floor(exportDuration * fps)}
                    </span>
                  </div>

                  {progressData.fps > 0 && (
                    <div className="stats-chip">
                      <Zap size={13} className="text-amber" />
                      <span>{progressData.fps} FPS</span>
                    </div>
                  )}

                  {progressData.etaSeconds > 0 && (
                    <div className="stats-chip">
                      <Clock size={13} className="text-emerald" />
                      <span>Restante: {formatSeconds(progressData.etaSeconds)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="export-running-actions">
                <button
                  type="button"
                  className="btn-secondary btn-cancel-export"
                  onClick={handleCancelExport}
                >
                  <X size={16} />
                  Cancelar Renderizado
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: COMPLETED SUCCESS VIEW */}
          {!isExporting && downloadUrl && (
            <div className="export-success-panel">
              <div className="success-header-badge">
                <div className="success-icon-circle">
                  <CheckCircle2 size={36} className="text-emerald" />
                </div>
                <h4>¡Video Renderizado con Éxito!</h4>
                <p>Tu video ha sido codificado sin pérdidas y optimizado para compartir.</p>
              </div>

              {/* Player Preview */}
              <div className="rendered-preview-container">
                <video
                  ref={resultVideoRef}
                  src={downloadUrl}
                  controls
                  playsInline
                  className="rendered-video-player"
                  onPlay={() => setIsVideoPlaying(true)}
                  onPause={() => setIsVideoPlaying(false)}
                />
              </div>

              {/* Technical Specifications of the exported file */}
              <div className="rendered-file-card">
                <div className="file-info-item">
                  <HardDrive size={15} className="text-cyan" />
                  <span className="file-info-label">Tamaño:</span>
                  <span className="file-info-value">{formatFileSize(fileSizeBytes)}</span>
                </div>
                <div className="file-info-item">
                  <Monitor size={15} className="text-indigo" />
                  <span className="file-info-label">Resolución:</span>
                  <span className="file-info-value">{exportWidth} × {exportHeight}</span>
                </div>
                <div className="file-info-item">
                  <Clock size={15} className="text-emerald" />
                  <span className="file-info-label">Duración:</span>
                  <span className="file-info-value">{exportDuration}s ({fps} FPS)</span>
                </div>
                <div className="file-info-item">
                  <Film size={15} className="text-amber" />
                  <span className="file-info-label">Contenedor:</span>
                  <span className="file-info-value">{format.toUpperCase()}</span>
                </div>
              </div>

              {/* Filename Input */}
              <div className="export-filename-row">
                <label className="filename-label">Nombre del archivo:</label>
                <div className="filename-input-group">
                  <input
                    type="text"
                    className="input-field filename-input"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder="nombre_del_video"
                  />
                  <span className="filename-ext">.{format}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="export-success-actions">
                <button
                  type="button"
                  className="btn-primary btn-large full-width export-download-btn"
                  onClick={handleDownload}
                >
                  <Download size={20} />
                  <span>Descargar Video ({format.toUpperCase()})</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary full-width"
                  onClick={handleResetForNewExport}
                >
                  <RotateCcw size={16} />
                  <span>Exportar en Otra Resolución / Formato</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isExporting}
          >
            {downloadUrl ? 'Finalizar' : 'Cerrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
