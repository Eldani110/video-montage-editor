import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Film,
  Zap,
  PlayCircle,
  Clock,
  Video,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Brain,
  Sliders,
  ChevronDown,
  ChevronUp,
  Settings,
  Copy,
  Check,
  Layers,
  Loader2,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { RHYTHM_PROFILES, runSceneDirectorAgent } from '../utils/sceneDirectorAgent';
import { applyScenesToProject } from '../utils/sceneOps';
import { formatTimecode } from '../utils/timeFormat';
import { getSavedAiConfig } from '../utils/aiClient';
import { getSavedStockConfig } from '../utils/stockMediaClient';

export function SceneDirectorModal({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  onApplyScenes,
  onOpenSettings = null,
  onOpenTranscribeModal = null
}) {
  const stockConfig = getSavedStockConfig();
  const aiConfig = getSavedAiConfig();
  const [selectedRhythm, setSelectedRhythm] = useState('dynamic');
  const [customTargetSec, setCustomTargetSec] = useState(3.5);
  const [mediaTypePreference, setMediaTypePreference] = useState(stockConfig.preferredMediaType || 'mixed'); // 'mixed' | 'video' | 'image'
  const [engineMode, setEngineMode] = useState('cloud'); // 'cloud' | 'local'
  const [thinkingMode, setThinkingMode] = useState('none'); // Default 'none' (Sin Pensamiento) specifically for Scene Director for ultra-fast generation
  const [timeRangeMode, setTimeRangeMode] = useState('full'); // 'full' | '60s' | '180s'
  const [maxScenesLimit, setMaxScenesLimit] = useState(0); // 0 = Sin límite (procesa 100% de la transcripción completa)
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressState, setProgressState] = useState({ percent: 0, message: '' });
  const [generatedResult, setGeneratedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showThinking, setShowThinking] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Real-time AI Thought Sequence State
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [modelDeepThinking, setModelDeepThinking] = useState(null);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);
  const [copiedThinking, setCopiedThinking] = useState(false);
  const [showConfigDuringProcessing, setShowConfigDuringProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const thoughtLogRef = useRef(null);
  const abortControllerRef = useRef(null);
  const processingSectionRef = useRef(null);

  const handleSelectRhythm = (rhythmId) => {
    setSelectedRhythm(rhythmId);
  };

  useEffect(() => {
    let timer = null;
    if (isProcessing) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isProcessing]);

  useEffect(() => {
    if (thoughtLogRef.current && isThinkingExpanded) {
      thoughtLogRef.current.scrollTop = thoughtLogRef.current.scrollHeight;
    }
    if (isProcessing && processingSectionRef.current) {
      processingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [thinkingSteps, isThinkingExpanded, isProcessing]);

  // Reset modal state when opening so the user can always do a fresh analysis
  useEffect(() => {
    if (isOpen && !isProcessing) {
      setGeneratedResult(null);
      setErrorMessage(null);
      setProgressState({ percent: 0, message: '' });
      setThinkingSteps([]);
      setModelDeepThinking(null);
      setShowConfigDuringProcessing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Extract transcript segments from project with multi-source fallback
  const transcriptSegments = project.transcript?.segments || [];
  const guideTrack = (project.tracks || []).find(t => t.type === 'guide');
  const subtitleTrack = (project.tracks || []).find(t => t.type === 'subtitles' || t.type === 'text');

  let rawSegments = [];
  if (Array.isArray(transcriptSegments) && transcriptSegments.length > 0) {
    rawSegments = transcriptSegments;
  } else if (guideTrack?.clips?.length > 0) {
    rawSegments = guideTrack.clips;
  } else if (subtitleTrack?.clips?.length > 0) {
    rawSegments = subtitleTrack.clips;
  }

  const segmentsToUse = rawSegments
    .map((c, idx) => {
      const rawStart = c.start ?? c.startTime ?? 0;
      const rawEnd = c.end ?? (c.startTime != null && c.duration != null ? c.startTime + c.duration : (c.start != null ? c.start + 2.5 : 2.5));
      const start = Number(Number(rawStart).toFixed(2));
      const end = Number(Number(rawEnd).toFixed(2));
      const text = String(c.text || c.name || '').trim();
      return {
        id: c.id || `seg_${idx}`,
        start,
        end: end > start ? end : start + 2.5,
        text
      };
    })
    .filter(s => s.text.length > 0);

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setProgressState({ percent: 0, message: 'Análisis cancelado.' });
  };

  const handleStartAnalysis = async () => {
    setErrorMessage(null);
    setGeneratedResult(null);
    setThinkingSteps([]);
    setModelDeepThinking(null);
    setIsThinkingExpanded(true);

    if (segmentsToUse.length === 0) {
      setErrorMessage(
        'No hay un guion o transcripción en el proyecto. Por favor, usa primero "Transcribir IA" para obtener las marcas de tiempo.'
      );
      return;
    }

    if (engineMode === 'cloud' && !aiConfig.baseUrl) {
      setErrorMessage(
        'El endpoint de IA no está configurado. Por favor, ve a Configuración General en la pantalla principal para configurar Ollama Cloud o DeepSeek, o usa el "Motor Editorial Local".'
      );
      return;
    }

    setIsProcessing(true);
    setThinkingSteps([]);
    setModelDeepThinking(null);
    setIsThinkingExpanded(true);
    setProgressState({ percent: 10, message: 'Iniciando Agente Director...' });
    abortControllerRef.current = new AbortController();

    const timeRange = timeRangeMode === '60s'
      ? { enabled: true, start: 0, end: 60 }
      : (timeRangeMode === '180s' ? { enabled: true, start: 0, end: 180 } : { enabled: false });

    try {
      const result = await runSceneDirectorAgent(segmentsToUse, selectedRhythm, {
        aiConfig,
        thinkingMode,
        customTargetSec,
        maxScenes: (maxScenesLimit && maxScenesLimit > 0) ? maxScenesLimit : Infinity,
        timeRange,
        mediaTypePreference,
        forceLocal: engineMode === 'local',
        signal: abortControllerRef.current.signal,
        onProgress: (prog) => {
          setProgressState({
            percent: prog.percent,
            message: prog.message
          });
        },
        onThought: (thought, allThoughts) => {
          setThinkingSteps(allThoughts);
        },
        onThinkingStream: (liveThinking) => {
          setModelDeepThinking(liveThinking);
        }
      });

      if (result.thinking) {
        setModelDeepThinking(result.thinking);
      }
      if (result.thoughts) {
        setThinkingSteps(result.thoughts);
      }
      setGeneratedResult(result);
    } catch (err) {
      if (err.message && err.message.includes('cancelada')) {
        console.log('Análisis cancelado por el usuario.');
      } else {
        console.error('Scene Director Agent Error:', err);
        setErrorMessage(err.message || 'Error durante el análisis del guion.');
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCopyThinking = () => {
    const lines = thinkingSteps.map(t => `[${t.time}] [${t.phase}] ${t.text}`);
    if (modelDeepThinking) {
      lines.push('\n--- RAZONAMIENTO PROFUNDO DEL MODELO ---\n' + modelDeepThinking);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedThinking(true);
    setTimeout(() => setCopiedThinking(false), 2000);
  };

  const handleApplyToTimeline = (autoDownloadBroll = false) => {
    if (!generatedResult || !generatedResult.scenes) return;

    const updated = applyScenesToProject(project, generatedResult.scenes, {
      summary: generatedResult.summary,
      rhythmProfile: generatedResult.rhythmProfile,
      thinking: generatedResult.thinking
    });

    if (onApplyScenes) {
      onApplyScenes(updated, { autoDownloadBroll });
    } else {
      onUpdateProject(updated);
      onClose();
    }
  };

  const handleCopyPrompt = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container modal-director">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge" style={{ background: 'rgba(6, 182, 212, 0.18)' }}>
              <Film size={20} style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <h3 style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700 }}>Agente Editor IA — Detección de Escenas y Ritmo</h3>
              <p style={{ color: '#94a3b8', fontSize: '12px' }}>Analiza el guion, determina cortes precisos y sugiere tomas (Video B-Roll o Imagen)</p>
            </div>
          </div>
          <button
            className="btn-ghost icon-only"
            onClick={isProcessing ? handleCancelAnalysis : onClose}
            title={isProcessing ? 'Cancelar análisis' : 'Cerrar'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-form">
          {errorMessage && (
            <div className="alert-box alert-error" style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '13px', display: 'block', marginBottom: '2px' }}>Fallo en la Generación con el Modelo IA</strong>
                  <span style={{ fontSize: '12px', lineHeight: 1.4 }}>{errorMessage}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn-secondary btn-xs"
                  onClick={() => setErrorMessage(null)}
                >
                  Descartar
                </button>
                <button
                  type="button"
                  className="btn-primary btn-xs"
                  onClick={handleStartAnalysis}
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #6366f1)', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Sparkles size={12} />
                  Reintentar con {aiConfig.selectedModel || 'IA Remota'}
                </button>
              </div>
            </div>
          )}

          {!generatedResult ? (
            <>
              {/* No transcript warning alert */}
              {segmentsToUse.length === 0 && (
                <div
                  className="alert-box alert-warning"
                  style={{
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertCircle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: '13px', color: '#fcd34d', display: 'block' }}>Sin Guion ni Marcas de Tiempo</strong>
                      <span style={{ fontSize: '12px', color: '#e2e8f0' }}>
                        No se detectó una transcripción en el proyecto. Transcribe el audio primero para que el Agente Director pueda estructurar los cortes sincronizados.
                      </span>
                    </div>
                  </div>
                  {onOpenTranscribeModal && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={onOpenTranscribeModal}
                      style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', whiteSpace: 'nowrap', marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Sparkles size={13} />
                      Transcribir con IA
                    </button>
                  )}
                </div>
              )}

              {/* Transcript Status Banner */}
              <div
                style={{
                  background: '#141824',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge ${segmentsToUse.length > 0 ? 'badge-indigo' : 'badge-amber'}`} style={{ fontWeight: 600, fontSize: '11px' }}>
                      {segmentsToUse.length} Segmentos de Guion
                    </span>
                    <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 500 }}>
                      Duración cubierta: {segmentsToUse.length > 0 ? formatTimecode(segmentsToUse[segmentsToUse.length - 1].end) : '00:00'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>
                    {segmentsToUse.length > 0
                      ? 'El Agente Editor respetará las marcas de tiempo exactas del audio original.'
                      : 'Carga un audio o usa "Transcribir con IA" para habilitar el análisis automático.'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="badge badge-emerald" style={{ fontSize: '11px' }}>
                    Modelo: {aiConfig.selectedModel || 'DeepSeek / Ollama'}
                  </span>
                  {onOpenSettings && (
                    <button
                      type="button"
                      className="btn-ghost icon-only"
                      onClick={onOpenSettings}
                      title="Abrir Configuración de IA"
                      style={{ padding: '4px' }}
                    >
                      <Settings size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Previous Storyboard Notice & Wipe Option */}
              {(project.scenes?.list || []).length > 0 && (
                <div
                  style={{
                    background: 'rgba(6, 182, 212, 0.08)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Film size={15} style={{ color: '#06b6d4', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      El proyecto tiene actualmente <strong>{project.scenes.list.length} escenas</strong> generadas previamente.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost btn-xs text-rose"
                    onClick={() => {
                      if (window.confirm('¿Deseas limpiar las escenas anteriores del proyecto para empezar completamente desde cero?')) {
                        const tracksWithoutScenes = (project.tracks || []).filter(t => t.type !== 'scene');
                        const { scenes, ...projectWithoutScenes } = project;
                        onUpdateProject({
                          ...projectWithoutScenes,
                          tracks: tracksWithoutScenes
                        });
                      }
                    }}
                    style={{
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderColor: 'rgba(244, 63, 94, 0.3)',
                      background: 'rgba(244, 63, 94, 0.08)',
                      padding: '4px 8px'
                    }}
                    title="Eliminar las escenas anteriores de la línea de tiempo"
                  >
                    <Trash2 size={12} />
                    Limpiar Storyboard Anterior
                  </button>
                </div>
              )}

              {isProcessing && !showConfigDuringProcessing ? (
                <div
                  style={{
                    background: '#141824',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginTop: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <span className="badge badge-indigo" style={{ fontWeight: 600, fontSize: '11px' }}>
                      {engineMode === 'local' ? 'Motor Local Offline' : (aiConfig.selectedModel || 'Modelo IA')}
                    </span>
                    <span style={{ color: '#64748b' }}>•</span>
                    <span style={{ color: '#cbd5e1' }}>
                      Ritmo: <strong style={{ color: '#ffffff' }}>{(RHYTHM_PROFILES.find(r => r.id === selectedRhythm)?.name || selectedRhythm).split('(')[0].trim()}</strong>
                    </span>
                    <span style={{ color: '#64748b' }}>•</span>
                    <span style={{ color: '#cbd5e1' }}>
                      Formato: <strong style={{ color: '#ffffff' }}>{mediaTypePreference === 'video' ? 'Solo Videos' : (mediaTypePreference === 'image' ? 'Solo Imágenes' : 'Combinada')}</strong>
                    </span>
                    <span style={{ color: '#64748b' }}>•</span>
                    <span style={{ color: '#a855f7', fontWeight: 600 }}>
                      {thinkingMode === 'none' ? '⚡ Sin Pensamiento' : (thinkingMode === 'normal' ? '🧠 Pensamiento Normal' : '🔮 Ultra Profundo')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost btn-xs"
                    onClick={() => setShowConfigDuringProcessing(true)}
                    style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Sliders size={12} />
                    Ver Ajustes
                  </button>
                </div>
              ) : (
                <>
                  {isProcessing && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                      <button
                        type="button"
                        className="btn-ghost btn-xs text-indigo"
                        onClick={() => setShowConfigDuringProcessing(false)}
                        style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        ▲ Ocultar Ajustes (Enfocar Pensamiento)
                      </button>
                    </div>
                  )}

                  {/* Step 1: Engine Mode (Local vs Remote) */}
                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                        <Sparkles size={15} style={{ color: '#06b6d4' }} />
                        1. Motor de Dirección Editorial
                      </span>
                      {engineMode === 'cloud' && onOpenSettings && (
                        <button
                          type="button"
                          className="btn-ghost btn-xs text-indigo"
                          onClick={onOpenSettings}
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Settings size={12} />
                          Configurar API ({aiConfig.selectedModel || 'DeepSeek'})
                        </button>
                      )}
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div
                        className={`director-card ${engineMode === 'cloud' ? 'active' : ''}`}
                        onClick={() => !isProcessing && setEngineMode('cloud')}
                        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.85 : 1 }}
                      >
                        <div className="director-card-title">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Brain size={15} style={{ color: '#a855f7' }} />
                            Modelo IA ({aiConfig.selectedModel || 'DeepSeek'})
                          </span>
                          <span className="badge badge-indigo" style={{ fontSize: '9px', padding: '2px 6px' }}>Recomendado (100% IA)</span>
                        </div>
                        <div className="director-card-desc">
                          Estructura escenas con razonamiento cinematográfico de {aiConfig.selectedModel || 'DeepSeek'} sin atajos heurísticos ni sustitución local.
                        </div>
                      </div>

                      <div
                        className={`director-card ${engineMode === 'local' ? 'active' : ''}`}
                        onClick={() => !isProcessing && setEngineMode('local')}
                        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.85 : 1 }}
                      >
                        <div className="director-card-title">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={15} style={{ color: '#f59e0b' }} />
                            Motor Local Offline (Sin IA)
                          </span>
                          <span className="badge badge-emerald" style={{ fontSize: '9px', padding: '2px 6px' }}>Offline / Rápido</span>
                        </div>
                        <div className="director-card-desc">
                          Reglas algorítmicas locales en navegador. Úsalo únicamente si estás sin conexión a internet.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Select Editing Rhythm */}
                  <div className="form-group" style={{ marginTop: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                      <Sliders size={15} style={{ color: '#06b6d4' }} />
                      2. Seleccionar Ritmo de Edición (Pacing)
                    </label>
                    <div className="aspect-ratio-selector" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      {RHYTHM_PROFILES.map((r) => (
                        <div
                          key={r.id}
                          className={`director-card ${selectedRhythm === r.id ? 'active' : ''}`}
                          onClick={() => !isProcessing && handleSelectRhythm(r.id)}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: '96px', opacity: isProcessing ? 0.85 : 1 }}
                        >
                          <div className="director-card-title">
                            <span>{r.name.split('(')[0]}</span>
                            <span className="badge badge-indigo" style={{ fontSize: '10px', padding: '2px 6px' }}>
                              {r.targetSec}
                            </span>
                          </div>
                          <div className="director-card-desc">
                            {r.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 3: Select Media Format (Solo Imágenes, Solo Videos o Combinada) */}
                  <div className="form-group" style={{ marginTop: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                      <Film size={15} style={{ color: '#06b6d4' }} />
                      3. Formato de Recursos Visuales
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      <div
                        className={`director-card ${mediaTypePreference === 'mixed' ? 'active' : ''}`}
                        onClick={() => !isProcessing && setMediaTypePreference('mixed')}
                        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: '82px', opacity: isProcessing ? 0.85 : 1 }}
                      >
                        <div className="director-card-title">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={14} style={{ color: '#06b6d4' }} />
                            Combinada
                          </span>
                          <span className="badge badge-indigo" style={{ fontSize: '10px', padding: '2px 6px' }}>
                            Híbrido IA
                          </span>
                        </div>
                        <div className="director-card-desc">
                          La IA decide dinámicamente: video para acción/tecnología e imagen para datos/conceptos.
                        </div>
                      </div>

                      <div
                        className={`director-card ${mediaTypePreference === 'video' ? 'active' : ''}`}
                        onClick={() => !isProcessing && setMediaTypePreference('video')}
                        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: '82px', opacity: isProcessing ? 0.85 : 1 }}
                      >
                        <div className="director-card-title">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Video size={14} style={{ color: '#06b6d4' }} />
                            Solo Videos
                          </span>
                          <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4' }}>
                            Clips MP4
                          </span>
                        </div>
                        <div className="director-card-desc">
                          100% tomas cinematográficas de video B-Roll en movimiento para todas las escenas.
                        </div>
                      </div>

                      <div
                        className={`director-card ${mediaTypePreference === 'image' ? 'active' : ''}`}
                        onClick={() => !isProcessing && setMediaTypePreference('image')}
                        style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: '82px', opacity: isProcessing ? 0.85 : 1 }}
                      >
                        <div className="director-card-title">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ImageIcon size={14} style={{ color: '#818cf8' }} />
                            Solo Imágenes
                          </span>
                          <span className="badge" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
                            Fotos HD
                          </span>
                        </div>
                        <div className="director-card-desc">
                          100% fotografías e ilustraciones conceptuales fijas de alta definición.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4: Range & Max Scenes Safeguard */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={13} style={{ color: '#06b6d4' }} />
                        4. Rango del Video a Procesar
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className={`director-pill ${timeRangeMode === 'full' ? 'active' : ''}`}
                          onClick={() => !isProcessing && setTimeRangeMode('full')}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                        >
                          Todo ({formatTimecode(segmentsToUse[segmentsToUse.length - 1]?.end || 0)})
                        </button>
                        <button
                          type="button"
                          className={`director-pill ${timeRangeMode === '60s' ? 'active' : ''}`}
                          onClick={() => !isProcessing && setTimeRangeMode('60s')}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                        >
                          Primeros 60s
                        </button>
                        <button
                          type="button"
                          className={`director-pill ${timeRangeMode === '180s' ? 'active' : ''}`}
                          onClick={() => !isProcessing && setTimeRangeMode('180s')}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                        >
                          Primeros 3 min
                        </button>
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={13} style={{ color: '#6366f1' }} />
                        Cobertura de Escenas {(!maxScenesLimit || maxScenesLimit === 0) ? '(100% del Guion Completo)' : `(Límite: ${maxScenesLimit} cortes)`}
                      </label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`director-pill ${(!maxScenesLimit || maxScenesLimit === 0) ? 'active' : ''}`}
                          onClick={() => !isProcessing && setMaxScenesLimit(0)}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                        >
                          ✓ Todo el Video (100% del Guion)
                        </button>
                        {[50, 100, 150].map((num) => (
                          <button
                            key={num}
                            type="button"
                            className={`director-pill ${maxScenesLimit === num ? 'active' : ''}`}
                            onClick={() => !isProcessing && setMaxScenesLimit(num)}
                            style={{ cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                          >
                            {num} cortes máx
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Step 5: Thinking / Reasoning Mode (Sin Pensamiento, Pensamiento Normal, Ultra Profundo) */}
                  {engineMode === 'cloud' && (
                    <div className="form-group" style={{ marginTop: '14px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                          <Brain size={15} style={{ color: '#a855f7' }} />
                          5. Nivel de Pensamiento / Razonamiento IA
                        </span>
                        <span className="badge badge-emerald" style={{ fontSize: '10px', padding: '2px 8px' }}>
                          {thinkingMode === 'none' ? '⚡ Sin Pensamiento (Ultra Rápido • 0.5-5s)' : (thinkingMode === 'normal' ? '🧠 Pensamiento Normal (Ágil)' : '🔮 Ultra Profundo')}
                        </span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        {/* Option 1: Sin pensamiento */}
                        <div
                          className={`director-card ${thinkingMode === 'none' ? 'active' : ''}`}
                          onClick={() => !isProcessing && setThinkingMode('none')}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: '84px', opacity: isProcessing ? 0.85 : 1 }}
                        >
                          <div className="director-card-title">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Zap size={14} style={{ color: '#10b981' }} />
                              Sin Pensamiento
                            </span>
                            <span className="badge badge-emerald" style={{ fontSize: '9px', padding: '2px 5px' }}>
                              Recomendado • Ultra Rápido
                            </span>
                          </div>
                          <div className="director-card-desc">
                            Inferencia directa sin monólogo interno (think: false). Respuesta en 3-5 segundos, ahorro de 80% de tokens y sin riesgo de timeout.
                          </div>
                        </div>

                        {/* Option 2: Pensamiento Normal */}
                        <div
                          className={`director-card ${thinkingMode === 'normal' ? 'active' : ''}`}
                          onClick={() => !isProcessing && setThinkingMode('normal')}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: '84px', opacity: isProcessing ? 0.85 : 1 }}
                        >
                          <div className="director-card-title">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Brain size={14} style={{ color: '#a855f7' }} />
                              Pensamiento Normal
                            </span>
                            <span className="badge badge-indigo" style={{ fontSize: '9px', padding: '2px 5px' }}>
                              Opcional
                            </span>
                          </div>
                          <div className="director-card-desc">
                            Razonamiento ágil y conciso (2-4 líneas). Evalúa anclas visuales antes de emitir el JSON.
                          </div>
                        </div>

                        {/* Option 3: Ultra profundo */}
                        <div
                          className={`director-card ${thinkingMode === 'deep' ? 'active' : ''}`}
                          onClick={() => !isProcessing && setThinkingMode('deep')}
                          style={{ cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: '84px', opacity: isProcessing ? 0.85 : 1 }}
                        >
                          <div className="director-card-title">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Sparkles size={14} style={{ color: '#06b6d4' }} />
                              Ultra Profundo
                            </span>
                            <span className="badge" style={{ fontSize: '9px', padding: '2px 5px', background: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4' }}>
                              Cinematográfico
                            </span>
                          </div>
                          <div className="director-card-desc">
                            Análisis reflexivo exhaustivo de subtexto narrativo, psicología de planos y arcos dramáticos.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Processing Progress Bar */}
              {isProcessing && (
                <div ref={processingSectionRef} className="export-progress-container" style={{ marginTop: '16px' }}>
                  <div className="progress-header">
                    <span className="progress-status">
                      <Loader2 size={16} className="spinner" />
                      {progressState.message}
                    </span>
                    <span className="progress-percent timecode">{progressState.percent}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progressState.percent}%`, background: 'linear-gradient(90deg, #06b6d4, #6366f1)' }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Real-time AI Thought Sequence Terminal */}
              {(isProcessing || thinkingSteps.length > 0) && (
                <div className="thought-sequence-card" style={{ marginTop: '16px' }}>
                  <div className="thought-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="thought-pulse-icon">
                        <Brain size={16} className={isProcessing ? 'pulsing-brain' : ''} style={{ color: '#c084fc' }} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Secuencia de Pensamiento del Editor IA
                          {isProcessing ? (
                            <span className="badge badge-indigo" style={{ fontSize: '10px' }}>
                              <Loader2 size={10} className="spinner" /> Razonando en tiempo real...
                            </span>
                          ) : (
                            <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                              ✓ {thinkingSteps.length} Pasos Completados
                            </span>
                          )}
                        </h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          {aiConfig.selectedModel || 'DeepSeek / Ollama'} • Análisis narrativo y ritmo editorial
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {thinkingSteps.length > 0 && (
                        <button
                          type="button"
                          className="btn-ghost btn-xs"
                          onClick={handleCopyThinking}
                          title="Copiar secuencia de pensamiento"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {copiedThinking ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                          {copiedThinking ? 'Copiado' : 'Copiar'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                        style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        {isThinkingExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {isThinkingExpanded ? 'Contraer' : 'Expandir'}
                      </button>
                    </div>
                  </div>

                  {isThinkingExpanded && (
                    <div className="thought-log-stream" ref={thoughtLogRef}>
                      {thinkingSteps.map((step) => (
                        <div key={step.id} className={`thought-item ${step.isLatest && isProcessing ? 'thought-item-active' : ''}`}>
                          <div className="thought-item-meta">
                            <span className="thought-badge">{step.phase}</span>
                            <span className="thought-time">{step.time}</span>
                          </div>
                          <div className="thought-item-body">
                            <span className="thought-icon">{step.icon || '💡'}</span>
                            <span className="thought-text">{step.text}</span>
                          </div>
                        </div>
                      ))}

                      {/* Model's Deep Internal Thinking */}
                      {modelDeepThinking && (
                        <div className="thought-model-reasoning-box">
                          <div className="reasoning-header">
                            <Sparkles size={13} style={{ color: '#06b6d4' }} />
                            <strong>Razonamiento Profundo del Modelo ({aiConfig.selectedModel}):</strong>
                          </div>
                          <div className="reasoning-text">
                            {modelDeepThinking}
                          </div>
                        </div>
                      )}

                      {isProcessing && (
                        <div className="thought-streaming-indicator">
                          <span className="dot-pulse"></span>
                          <span style={{ fontSize: '11px', color: '#c084fc', fontStyle: 'italic' }}>
                            El agente está ponderando cortes y redactando recomendaciones visuales ({elapsedSeconds}s transcurridos)...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Results: Storyboard & Scenes Preview */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="export-success-box" style={{ padding: '12px 14px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={24} className="text-emerald" style={{ flexShrink: 0 }} />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '14px' }}>¡Estructura de Escenas Generada con Éxito!</h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Se detectaron <strong>{generatedResult.scenes.length} escenas de montaje</strong> con ritmo <em>{generatedResult.rhythmProfile?.name}</em> ({generatedResult.modelUsed || 'Modelo IA'}).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setGeneratedResult(null);
                      setThinkingSteps([]);
                      setModelDeepThinking(null);
                      setErrorMessage(null);
                      setProgressState({ percent: 0, message: '' });
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', flexShrink: 0 }}
                    title="Descartar este resultado y configurar una nueva generación"
                  >
                    <RotateCcw size={13} />
                    Rehacer desde Cero
                  </button>
                </div>
                {generatedResult.summary && (
                  <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    &ldquo;{generatedResult.summary}&rdquo;
                  </p>
                )}
              </div>

              {/* Base Conceptual y Temática Maestra del Video (Lectura Global) */}
              {generatedResult.globalBrief && (
                <div style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                      <Brain size={16} style={{ color: '#06b6d4' }} />
                      Base Conceptual y Temática del Video (Lectura Global)
                    </span>
                    <span className="badge badge-cyan" style={{ fontSize: '10px' }}>
                      Tema Maestro
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#f1f5f9', lineHeight: 1.4 }}>
                    <strong style={{ color: '#38bdf8' }}>Tema Central:</strong> {generatedResult.globalBrief.coreTopic}
                  </div>

                  {generatedResult.globalBrief.narrativeArc && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <strong style={{ color: '#94a3b8' }}>Arco Narrativo:</strong> {generatedResult.globalBrief.narrativeArc}
                    </div>
                  )}

                  {generatedResult.globalBrief.visualTone && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <strong style={{ color: '#94a3b8' }}>Tono y Estética Visual:</strong> {generatedResult.globalBrief.visualTone}
                    </div>
                  )}

                  {Array.isArray(generatedResult.globalBrief.keyAnchors) && generatedResult.globalBrief.keyAnchors.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>Anclas Clave:</span>
                      {generatedResult.globalBrief.keyAnchors.map((anchor, idx) => (
                        <span
                          key={idx}
                          className="badge"
                          style={{ fontSize: '10px', background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', border: '1px solid rgba(6, 182, 212, 0.3)' }}
                        >
                          {anchor}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI Thought Sequence & Deep Reasoning Inspector */}
              {(thinkingSteps.length > 0 || generatedResult.thinking) && (
                <div className="thought-sequence-card">
                  <div className="thought-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="thought-pulse-icon">
                        <Brain size={16} style={{ color: '#c084fc' }} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Secuencia de Pensamiento y Razonamiento Editorial
                          <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                            ✓ {thinkingSteps.length > 0 ? `${thinkingSteps.length} Pasos` : 'Completado'}
                          </span>
                        </h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          {aiConfig.selectedModel || 'DeepSeek / Ollama'} • Criterios de corte y decisiones de plano
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        onClick={handleCopyThinking}
                        title="Copiar secuencia de pensamiento"
                        style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        {copiedThinking ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                        {copiedThinking ? 'Copiado' : 'Copiar'}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        onClick={() => setShowThinking(!showThinking)}
                        style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        {showThinking ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {showThinking ? 'Contraer' : 'Inspeccionar'}
                      </button>
                    </div>
                  </div>

                  {showThinking && (
                    <div className="thought-log-stream" style={{ maxHeight: '220px' }}>
                      {thinkingSteps.map((step) => (
                        <div key={step.id} className="thought-item">
                          <div className="thought-item-meta">
                            <span className="thought-badge">{step.phase}</span>
                            <span className="thought-time">{step.time}</span>
                          </div>
                          <div className="thought-item-body">
                            <span className="thought-icon">{step.icon || '💡'}</span>
                            <span className="thought-text">{step.text}</span>
                          </div>
                        </div>
                      ))}

                      {generatedResult.thinking && (
                        <div className="thought-model-reasoning-box">
                          <div className="reasoning-header">
                            <Sparkles size={13} style={{ color: '#06b6d4' }} />
                            <strong>Razonamiento Profundo del Modelo ({aiConfig.selectedModel}):</strong>
                          </div>
                          <div className="reasoning-text">
                            {generatedResult.thinking}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Scenes Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Escenas Detectadas ({generatedResult.scenes.length}):
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                  {generatedResult.scenes.map((scene) => (
                    <div
                      key={scene.id}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: `4px solid ${scene.color}`,
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
                            [Escena {scene.sceneNumber}] {scene.title}
                          </span>
                          <span
                            className="badge"
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              background: scene.visualType === 'video' ? '#06b6d426' : '#6366f126',
                              color: scene.visualType === 'video' ? '#06b6d4' : '#818cf8',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {scene.visualType === 'video' ? <Video size={10} /> : <ImageIcon size={10} />}
                            {scene.visualTypeLabel}
                          </span>
                          {scene.visualAnchor && (
                            <span
                              className="badge"
                              style={{
                                fontSize: '9px',
                                padding: '1px 5px',
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#f59e0b',
                                border: '1px solid rgba(245, 158, 11, 0.3)'
                              }}
                            >
                              🎯 {scene.visualAnchor}
                            </span>
                          )}
                        </div>

                        <span className="timecode" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          [{formatTimecode(scene.startTime)} - {formatTimecode(scene.endTime)}] ({scene.duration}s)
                        </span>
                      </div>

                      {/* Script speech */}
                      {scene.scriptText && (
                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '4px' }}>
                          &ldquo;{scene.scriptText}&rdquo;
                        </p>
                      )}

                      {/* Visual Description & Prompt */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          <strong style={{ color: scene.color }}>Toma sugerida: </strong>
                          {scene.visualDescription}
                        </div>

                        <button
                          type="button"
                          className="btn-ghost btn-xs"
                          onClick={() => handleCopyPrompt(scene.visualDescription, scene.id)}
                          title="Copiar prompt visual sugerido"
                          style={{ flexShrink: 0 }}
                        >
                          {copiedId === scene.id ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                          {copiedId === scene.id ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>

                      {/* Stock Keywords */}
                      {Array.isArray(scene.searchKeywords) && scene.searchKeywords.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>Keywords:</span>
                          {scene.searchKeywords.slice(0, 5).map((kw, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: '9px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#94a3b8',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                padding: '1px 5px',
                                borderRadius: '3px'
                              }}
                            >
                              🔍 {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {generatedResult && (
            <button
              className="btn-secondary"
              onClick={() => {
                setGeneratedResult(null);
                setThinkingSteps([]);
                setModelDeepThinking(null);
                setErrorMessage(null);
                setProgressState({ percent: 0, message: '' });
              }}
              style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Volver a la configuración para generar un nuevo Storyboard desde cero"
            >
              <RotateCcw size={14} />
              Rehacer / Nueva Generación
            </button>
          )}

          <button
            className="btn-secondary"
            onClick={isProcessing ? handleCancelAnalysis : onClose}
          >
            {isProcessing ? 'Cancelar Análisis' : (generatedResult ? 'Cerrar' : 'Cancelar')}
          </button>

          {!generatedResult ? (
            <button
              className="btn-primary"
              onClick={handleStartAnalysis}
              disabled={isProcessing}
              style={{
                background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
                opacity: segmentsToUse.length === 0 ? 0.75 : 1
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="spinner" />
                  Analizando Guion...
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Analizar Guion y Crear Escenas IA
                </>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleApplyToTimeline(false)}
                title="Inserta únicamente las marcas visuales de guion en la línea de tiempo y abre el panel de Storyboard"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Layers size={14} />
                Solo Storyboard (Marcas de Guion)
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleApplyToTimeline(true)}
                title="Inserta las escenas en el Storyboard, abre el panel y lanza el descargador automático de videos HD a disco (projects_media/)"
                style={{
                  background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
                  boxShadow: '0 4px 14px rgba(6, 182, 212, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600
                }}
              >
                <Sparkles size={14} />
                ⚡ Insertar Storyboard y Auto-Descargar B-Roll
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
