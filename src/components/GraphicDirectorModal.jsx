import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  BarChart2,
  TrendingUp,
  Type,
  Layers,
  Quote,
  CheckCircle2,
  AlertCircle,
  Brain,
  Sliders,
  ChevronDown,
  ChevronUp,
  Settings,
  Copy,
  Check,
  Zap,
  Play,
  Activity,
  PieChart,
  Film,
  Eye,
  EyeOff,
  Cloud,
  Cpu,
  Award,
  BookOpen,
  Clock
} from 'lucide-react';
import {
  GRAPHIC_VIBES,
  runGraphicDirectorAgent,
  applyGraphicsToProject
} from '../utils/graphicDirectorAgent.js';
import {
  GRAPHIC_TYPES,
  ANIMATION_IN_TYPES,
  POSITION_PRESETS
} from '../utils/graphicEngine.js';
import { formatTimecode } from '../utils/timeFormat.js';
import { getSavedAiConfig } from '../utils/aiClient.js';

const VIBE_ICONS = {
  doc_essay: Film,
  doc_finance: TrendingUp,
  slate_minimal: Layers,
  cyber_neon: Zap,
  gold_luxury: Award
};

function renderVibeVisualMockup(vibe) {
  const preview = vibe.preview;
  if (!preview) return null;

  if (preview.type === 'doc') {
    return (
      <div className="graphic-vibe-canvas">
        <span
          style={{
            fontSize: '8px',
            fontWeight: '800',
            letterSpacing: '1.2px',
            color: '#f59e0b',
            textTransform: 'uppercase',
            marginBottom: '3px',
            fontFamily: 'Outfit, sans-serif'
          }}
        >
          {preview.tag}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: '700',
            color: '#ffffff',
            textShadow: '0 2px 5px rgba(0,0,0,0.9)',
            marginBottom: '3px',
            fontFamily: 'Outfit, sans-serif',
            textAlign: 'center'
          }}
        >
          {preview.title}
        </span>
        <span
          style={{
            fontSize: '8px',
            fontWeight: '500',
            color: 'rgba(255, 255, 255, 0.85)',
            background: 'rgba(245, 158, 11, 0.18)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            padding: '1px 6px',
            borderRadius: '4px'
          }}
        >
          {preview.sub}
        </span>
      </div>
    );
  }

  if (preview.type === 'finance') {
    return (
      <div className="graphic-vibe-canvas">
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: '700',
            color: '#10b981',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            marginBottom: '1px'
          }}
        >
          {preview.tag}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '17px',
              fontWeight: '900',
              color: '#34d399',
              letterSpacing: '-0.5px',
              textShadow: '0 0 12px rgba(16, 185, 129, 0.45)',
              fontFamily: 'Montserrat, sans-serif'
            }}
          >
            {preview.title}
          </span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '18px' }}>
            <div style={{ width: '3px', height: '6px', background: 'rgba(16, 185, 129, 0.4)', borderRadius: '1px' }} />
            <div style={{ width: '3px', height: '10px', background: 'rgba(16, 185, 129, 0.65)', borderRadius: '1px' }} />
            <div style={{ width: '3px', height: '14px', background: 'rgba(16, 185, 129, 0.85)', borderRadius: '1px' }} />
            <div style={{ width: '3px', height: '18px', background: '#34d399', borderRadius: '1px' }} />
          </div>
        </div>
        <span style={{ fontSize: '7.5px', color: '#94a3b8', letterSpacing: '0.5px', marginTop: '2px' }}>
          {preview.sub}
        </span>
      </div>
    );
  }

  if (preview.type === 'minimal') {
    return (
      <div className="graphic-vibe-canvas">
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '6px',
            padding: '5px 12px',
            textAlign: 'center',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)'
          }}
        >
          <div
            style={{
              fontSize: '7.5px',
              fontWeight: '700',
              color: '#38bdf8',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              marginBottom: '2px'
            }}
          >
            {preview.tag}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: '600', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
            {preview.title}
          </div>
        </div>
      </div>
    );
  }

  if (preview.type === 'cyber') {
    return (
      <div className="graphic-vibe-canvas">
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: '800',
            color: '#38bdf8',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            marginBottom: '2px'
          }}
        >
          {preview.tag}
        </span>
        <span
          style={{
            fontSize: '12px',
            fontWeight: '900',
            letterSpacing: '0.8px',
            background: 'linear-gradient(90deg, #38bdf8, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 10px rgba(192, 132, 252, 0.65)',
            marginBottom: '3px'
          }}
        >
          {preview.title}
        </span>
        <span
          style={{
            fontSize: '8px',
            color: '#c084fc',
            background: 'rgba(168, 85, 247, 0.18)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            padding: '1px 5px',
            borderRadius: '3px'
          }}
        >
          {preview.sub}
        </span>
      </div>
    );
  }

  if (preview.type === 'gold') {
    return (
      <div className="graphic-vibe-canvas">
        <div style={{ width: '22px', height: '1px', background: 'rgba(251, 191, 36, 0.5)', marginBottom: '3px' }} />
        <span
          style={{
            fontSize: '11px',
            fontStyle: 'italic',
            fontWeight: '600',
            fontFamily: 'Playfair Display, serif',
            color: '#fef08a',
            textShadow: '0 2px 6px rgba(0,0,0,0.9)',
            marginBottom: '3px',
            textAlign: 'center'
          }}
        >
          {preview.title}
        </span>
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: '700',
            color: '#fbbf24',
            letterSpacing: '1.2px',
            textTransform: 'uppercase'
          }}
        >
          {preview.tag}
        </span>
      </div>
    );
  }

  return null;
}

export function GraphicDirectorModal({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  onOpenSettings = null,
  onSelectClip = null
}) {
  const aiConfig = getSavedAiConfig();
  const hasCloudConfig = Boolean(aiConfig?.baseUrl && aiConfig?.apiKey);
  const [selectedVibe, setSelectedVibe] = useState('doc_essay');
  const [engineMode, setEngineMode] = useState(hasCloudConfig ? 'cloud' : 'local'); // 'cloud' | 'local'
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressState, setProgressState] = useState({ percent: 0, message: '' });
  const [generatedResult, setGeneratedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Real-time AI Thinking state
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);
  const [copiedThinking, setCopiedThinking] = useState(false);
  const thoughtLogRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (thoughtLogRef.current && isThinkingExpanded) {
      thoughtLogRef.current.scrollTop = thoughtLogRef.current.scrollHeight;
    }
  }, [thinkingSteps, isThinkingExpanded]);

  if (!isOpen) return null;

  const transcriptSegments = project.transcript?.segments || [];
  const scenesList = project.scenes?.list || [];
  const guideTrack = (project.tracks || []).find(t => t.type === 'guide');
  const duration = project.settings?.duration || 20;

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgressState({ percent: 0, message: 'Análisis cancelado.' });
  };

  const handleStartAnalysis = async () => {
    setErrorMessage(null);
    setGeneratedResult(null);
    setThinkingSteps([]);
    setIsThinkingExpanded(true);

    if (transcriptSegments.length === 0 && scenesList.length === 0 && (!guideTrack || guideTrack.clips.length === 0)) {
      setErrorMessage(
        'Se recomienda contar con un guion o escenas previas para que el agente analice las anclas semánticas. Puedes usar "Transcribir IA" o "Editor IA" primero, o continuar con bloques automáticos.'
      );
    }

    if (engineMode === 'cloud' && !aiConfig.baseUrl) {
      setErrorMessage(
        'El endpoint de IA no está configurado. Ve a Ajustes Generales para configurar Ollama Cloud o DeepSeek, o usa el Motor Editorial Local.'
      );
      return;
    }

    setIsProcessing(true);
    setProgressState({ percent: 10, message: 'Iniciando Diseñador Gráfico IA...' });
    abortControllerRef.current = new AbortController();

    try {
      const result = await runGraphicDirectorAgent({
        transcriptSegments,
        scenes: scenesList,
        timelineDuration: duration,
        vibeId: selectedVibe,
        aiConfig,
        forceLocal: engineMode === 'local',
        signal: abortControllerRef.current.signal,
        onProgress: (prog) => {
          setProgressState({
            percent: prog.percent,
            message: prog.message
          });
        },
        onThinkingStep: (step) => {
          setThinkingSteps((prev) => [...prev, { ...step, timestamp: Date.now() }]);
        }
      });

      setGeneratedResult(result);
      setIsProcessing(false);
      setProgressState({ percent: 100, message: '¡Análisis y Composición completados!' });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setErrorMessage(err.message || 'Error durante el análisis gráfico.');
      setIsProcessing(false);
    }
  };

  // Toggle graphic for a scene
  const handleToggleSceneGraphic = (sceneNumber) => {
    if (!generatedResult) return;
    const updatedDecisions = generatedResult.decisions.map(d => {
      if (d.sceneNumber === sceneNumber) {
        const nextNeeds = !d.needsGraphic;
        return {
          ...d,
          needsGraphic: nextNeeds,
          graphicType: nextNeeds ? (d.graphicType || 'title_hero') : null
        };
      }
      return d;
    });

    const activeGraphics = updatedDecisions.filter(d => d.needsGraphic && d.generatedClip).map(d => d.generatedClip);

    setGeneratedResult({
      ...generatedResult,
      decisions: updatedDecisions,
      graphicsCount: activeGraphics.length,
      cleanVideoCount: updatedDecisions.length - activeGraphics.length,
      graphicClips: activeGraphics
    });
  };

  // Apply to project
  const handleApplyToTimeline = () => {
    if (!generatedResult || !generatedResult.graphicClips) return;

    // Filter only currently enabled graphics
    const activeClips = generatedResult.decisions
      .filter(d => d.needsGraphic && d.generatedClip)
      .map(d => d.generatedClip);

    const updated = applyGraphicsToProject(project, activeClips, { replaceExisting: true });
    onUpdateProject(updated);

    if (onSelectClip && activeClips.length > 0) {
      onSelectClip(activeClips[0].id);
    }

    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content scene-director-modal graphic-director-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '1060px', width: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '20px 24px 16px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div className="modal-title-row">
            <div
              className="modal-badge-icon"
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(99, 102, 241, 0.3))',
                borderColor: 'rgba(6, 182, 212, 0.6)',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)'
              }}
            >
              <Sparkles size={22} style={{ color: '#38bdf8' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.3px', margin: 0, color: '#ffffff' }}>
                  Editor Gráfico & Efectos IA
                </h3>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(6, 182, 212, 0.16)',
                    color: '#38bdf8',
                    border: '1px solid rgba(6, 182, 212, 0.4)',
                    fontSize: '10.5px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    letterSpacing: '0.4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Brain size={12} />
                  Cerebro de Composición en 2 Etapas
                </span>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(99, 102, 241, 0.16)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    fontSize: '10px',
                    fontWeight: '600',
                    padding: '2px 7px'
                  }}
                >
                  <Layers size={11} style={{ marginRight: '3px' }} />
                  Pista G1
                </span>
              </div>
              <p className="modal-subtitle" style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0', lineHeight: '1.45' }}>
                Analiza el guion y el metraje en 2 fases: primero determina dónde se requiere apoyo visual (cifras, estadísticas, tesis, nombres) y dónde dejar video puro, para luego componer animaciones 60fps sincronizadas.
              </p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={onClose} title="Cerrar ventana">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body scene-director-body" style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
          {/* Pre-flight Info Capsule */}
          {!generatedResult && (
            <div className="graphic-preflight-capsule">
              <div className="graphic-preflight-item">
                <BookOpen size={13} style={{ color: '#a855f7' }} />
                <span>
                  Guion: <strong>{transcriptSegments.length > 0 ? `${transcriptSegments.length} segmentos` : (guideTrack?.clips?.length ? `${guideTrack.clips.length} bloques guía` : 'Sin guion')}</strong>
                </span>
              </div>
              <div className="graphic-preflight-item">
                <Film size={13} style={{ color: '#06b6d4' }} />
                <span>
                  Escenas: <strong>{scenesList.length > 0 ? `${scenesList.length} identificadas` : 'Corte continuo'}</strong>
                </span>
              </div>
              <div className="graphic-preflight-item">
                <Clock size={13} style={{ color: '#38bdf8' }} />
                <span>
                  Duración: <strong>{formatTimecode(duration)}</strong>
                </span>
              </div>
              <div className="graphic-preflight-item">
                <Sparkles size={13} style={{ color: '#f59e0b' }} />
                <span>
                  Salida: <strong>Pista G1 (Gráficos Motion)</strong>
                </span>
              </div>
            </div>
          )}

          {/* Controls Bar: Vibe Selection & Engine Mode */}
          {!generatedResult && (
            <div className="director-config-section">
              <div className="director-section-header" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: 'rgba(6, 182, 212, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#06b6d4'
                    }}
                  >
                    <Sliders size={14} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                      1. Selecciona el Perfil Estético de Motion Graphics
                    </h4>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Elige el tono visual: adaptará tipografías, paletas de color, sombras y ritmo de animación.
                    </span>
                  </div>
                </div>
              </div>

              {/* Vibe Cards Grid with Live Visual Mockups */}
              <div className="graphic-vibe-grid">
                {GRAPHIC_VIBES.map((vibe) => {
                  const isSelected = selectedVibe === vibe.id;
                  const IconComponent = VIBE_ICONS[vibe.id] || Sparkles;

                  return (
                    <div
                      key={vibe.id}
                      onClick={() => setSelectedVibe(vibe.id)}
                      className={`graphic-vibe-card ${isSelected ? 'selected' : ''}`}
                      style={{
                        '--vibe-accent': vibe.accentColor,
                        '--vibe-glow': vibe.glowColor,
                        '--vibe-bg': vibe.bgFrom
                      }}
                    >
                      {/* Top Bar: Icon + Selection Badge */}
                      <div className="graphic-vibe-top">
                        <div className="graphic-vibe-icon-box">
                          <IconComponent size={14} />
                        </div>
                        {isSelected ? (
                          <div className="graphic-vibe-selected-badge">
                            <Check size={10} />
                            <span>ACTIVO</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#64748b' }}>Elegir</span>
                        )}
                      </div>

                      {/* Title & Badge */}
                      <div className="graphic-vibe-title">
                        {vibe.name}
                      </div>
                      <div className="graphic-vibe-badge">
                        {vibe.badge}
                      </div>

                      {/* Visual Aesthetic Mockup Canvas */}
                      {renderVibeVisualMockup(vibe)}

                      {/* Editorial Description */}
                      <p className="graphic-vibe-desc">
                        {vibe.desc}
                      </p>

                      {/* Footer Tags */}
                      <div className="graphic-vibe-footer">
                        <span>Fuente: <strong style={{ color: '#e2e8f0' }}>{vibe.font}</strong></span>
                        <span style={{ textTransform: 'capitalize' }}>{vibe.animationIn}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Engine Choice: High-end Control Panel */}
              <div className="graphic-engine-panel">
                <div className="graphic-engine-info">
                  <div className="graphic-engine-icon">
                    <Cpu size={19} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        Motor de Razonamiento Editorial:
                      </span>
                      {engineMode === 'cloud' ? (
                        <span className="badge badge-indigo" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span className="pulse-dot-green"></span>
                          Modelo IA ({aiConfig.selectedModel || 'DeepSeek'})
                        </span>
                      ) : (
                        <span className="badge badge-cyan" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span className="pulse-dot-cyan"></span>
                          Heurística Editorial Local
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '3px 0 0 0', lineHeight: '1.4' }}>
                      {engineMode === 'cloud'
                        ? `Conectado a ${aiConfig.selectedModel || 'DeepSeek'} (${aiConfig.baseUrl || 'Ollama Cloud'}) para análisis semántico, jerarquía narrativa y detección de datos.`
                        : 'Procesamiento instantáneo en navegador (<50ms). Detecta métricas, porcentajes, fechas, nombres y citas automáticamente sin dependencias externas.'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <div className="graphic-engine-switcher">
                    <button
                      type="button"
                      className={`graphic-engine-tab ${engineMode === 'cloud' ? 'active-cloud' : ''}`}
                      onClick={() => setEngineMode('cloud')}
                      title="Utilizar modelo LLM configurado para razonamiento semántico avanzado"
                    >
                      <Cloud size={13} />
                      <span>Modelo IA Cloud</span>
                    </button>
                    <button
                      type="button"
                      className={`graphic-engine-tab ${engineMode === 'local' ? 'active-local' : ''}`}
                      onClick={() => setEngineMode('local')}
                      title="Procesamiento instantáneo local por reglas heurísticas sin coste ni conexión"
                    >
                      <Zap size={13} />
                      <span>Heurística Local</span>
                    </button>
                  </div>

                  {onOpenSettings && (
                    <button
                      type="button"
                      className="btn-ghost icon-only btn-sm"
                      onClick={onOpenSettings}
                      title="Configurar endpoint y modelo de IA"
                      style={{ color: '#94a3b8' }}
                    >
                      <Settings size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                color: '#f87171',
                fontSize: '12px',
                marginBottom: '16px'
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Thinking / Progress Log */}
          {(isProcessing || thinkingSteps.length > 0) && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '20px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
                onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Brain size={16} className="text-cyan" />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#38bdf8' }}>
                    Secuencia de Razonamiento del Diseñador IA
                  </span>
                  {isProcessing && (
                    <span className="badge badge-cyan" style={{ fontSize: '10px' }}>
                      {progressState.percent}%
                    </span>
                  )}
                </div>
                {isThinkingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>

              {isProcessing && (
                <div style={{ marginTop: '10px' }}>
                  <div className="progress-bar-container" style={{ height: '6px' }}>
                    <div className="progress-bar-fill" style={{ width: `${progressState.percent}%` }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                    {progressState.message}
                  </div>
                </div>
              )}

              {isThinkingExpanded && (
                <div
                  ref={thoughtLogRef}
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    marginTop: '12px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  {thinkingSteps.map((step, idx) => (
                    <div key={idx} style={{ fontSize: '12px', lineHeight: '1.4' }}>
                      <strong style={{ color: '#38bdf8' }}>[{step.title}] </strong>
                      <span style={{ color: '#cbd5e1' }}>{step.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generated Results & Decisions List */}
          {generatedResult && (
            <div className="director-results-container">
              {/* Stats Overview */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  marginBottom: '20px'
                }}
              >
                <div
                  style={{
                    background: 'rgba(6, 182, 212, 0.1)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#38bdf8' }}>
                    {generatedResult.totalScenes}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Escenas Analizadas</div>
                </div>

                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#34d399' }}>
                    {generatedResult.graphicsCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Apoyos Gráficos Diseñados</div>
                </div>

                <div
                  style={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#818cf8' }}>
                    {generatedResult.cleanVideoCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Escenas Video Puro (Limpio)</div>
                </div>
              </div>

              {/* Scenes Review List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {generatedResult.decisions.map((dec) => {
                  const isEnabled = dec.needsGraphic;
                  const gType = GRAPHIC_TYPES.find(gt => gt.id === dec.graphicType);

                  return (
                    <div
                      key={dec.sceneNumber}
                      style={{
                        background: isEnabled ? 'rgba(8, 14, 28, 0.85)' : 'rgba(255, 255, 255, 0.02)',
                        border: isEnabled ? '1.5px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="badge badge-indigo" style={{ fontSize: '11px', fontWeight: '600' }}>
                            Escena {dec.sceneNumber}
                          </span>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            [{formatTimecode(dec.startTime)} - {formatTimecode(dec.startTime + dec.duration)}]
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>
                            {dec.title}
                          </span>
                        </div>

                        {/* Toggle Decision Switch */}
                        <button
                          type="button"
                          className="btn-ghost btn-xs"
                          onClick={() => handleToggleSceneGraphic(dec.sceneNumber)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: isEnabled ? '#34d399' : '#94a3b8',
                            background: isEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                            border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.1)'}`
                          }}
                        >
                          {isEnabled ? <Eye size={13} /> : <EyeOff size={13} />}
                          <span>{isEnabled ? 'Apoyo Gráfico Activo' : 'Solo Video (Sin Gráfico)'}</span>
                        </button>
                      </div>

                      {/* Script snippet */}
                      {dec.scriptText && (
                        <p style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', margin: '0 0 8px 0' }}>
                          “{dec.scriptText}”
                        </p>
                      )}

                      {/* Editorial Reasoning */}
                      <div
                        style={{
                          fontSize: '11px',
                          color: isEnabled ? '#38bdf8' : '#94a3b8',
                          background: isEnabled ? 'rgba(6, 182, 212, 0.08)' : 'rgba(0, 0, 0, 0.2)',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          marginBottom: isEnabled && dec.graphicSpec ? '12px' : '0'
                        }}
                      >
                        <strong>Criterio Editorial: </strong>
                        {dec.reasoning}
                      </div>

                      {/* Graphic Details if Enabled */}
                      {isEnabled && dec.graphicSpec && (
                        <div
                          style={{
                            background: 'rgba(0, 0, 0, 0.35)',
                            border: '1px solid rgba(6, 182, 212, 0.25)',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '10px',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                              Tipo de Elemento
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <span className="badge badge-cyan" style={{ fontSize: '11px' }}>
                                {gType?.name || dec.graphicType}
                              </span>
                            </div>
                          </div>

                          <div>
                            <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                              Título Principal
                            </span>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
                              {dec.graphicSpec.title}
                            </div>
                          </div>

                          {dec.graphicSpec.statNumber && (
                            <div>
                              <span style={{ fontSize: '10px', color: '#facc15', textTransform: 'uppercase', fontWeight: '700' }}>
                                Cifra / Dato Numérico
                              </span>
                              <div style={{ fontSize: '14px', fontWeight: '800', color: '#facc15', marginTop: '2px' }}>
                                {dec.graphicSpec.statNumber} {dec.graphicSpec.statText || ''}
                              </div>
                            </div>
                          )}

                          {dec.graphicSpec.chapterPrefix && (
                            <div>
                              <span style={{ fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase', fontWeight: '600' }}>
                                Prefijo Estructura
                              </span>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8', marginTop: '2px' }}>
                                {dec.graphicSpec.chapterPrefix}
                              </div>
                            </div>
                          )}

                          {dec.graphicSpec.milestones && dec.graphicSpec.milestones.length > 0 && (
                            <div>
                              <span style={{ fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase' }}>
                                Hitos Cronológicos
                              </span>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#e2e8f0', marginTop: '2px' }}>
                                {dec.graphicSpec.milestones.map(m => m.date).join(' → ')}
                              </div>
                            </div>
                          )}

                          {dec.graphicType === 'lower_third' && dec.graphicSpec.subtitle && (
                            <div>
                              <span style={{ fontSize: '10px', color: '#06b6d4', textTransform: 'uppercase' }}>
                                Cargo / Entidad
                              </span>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#38bdf8', marginTop: '2px' }}>
                                {dec.graphicSpec.subtitle}
                              </div>
                            </div>
                          )}

                          {dec.graphicSpec.quoteAuthor && (
                            <div>
                              <span style={{ fontSize: '10px', color: '#f472b6', textTransform: 'uppercase' }}>
                                Testimonio / Autor
                              </span>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#f472b6', marginTop: '2px' }}>
                                — {dec.graphicSpec.quoteAuthor}
                              </div>
                            </div>
                          )}

                          {dec.graphicSpec.kpiValue && !dec.graphicSpec.statNumber && (
                            <div>
                              <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                                Cifra / Métrica
                              </span>
                              <div style={{ fontSize: '14px', fontWeight: '800', color: '#38bdf8', marginTop: '2px' }}>
                                {dec.graphicSpec.kpiValue}
                              </div>
                            </div>
                          )}

                          <div>
                            <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                              Animación de Entrada
                            </span>
                            <div style={{ fontSize: '11px', color: '#a5b4fc', marginTop: '2px' }}>
                              {dec.graphicSpec.animationIn}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {generatedResult ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setGeneratedResult(null);
                  setThinkingSteps([]);
                }}
                style={{ color: '#94a3b8' }}
              >
                ← Volver a Configuración de Estilo
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#94a3b8' }}>
                <Sparkles size={13} style={{ color: '#06b6d4', flexShrink: 0 }} />
                <span>Criterio editorial inteligente: respeta el video limpio y sólo interviene con motion graphics en anclas semánticas.</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose} style={{ padding: '8px 16px' }}>
              Cerrar
            </button>

            {!generatedResult ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={handleStartAnalysis}
                disabled={isProcessing}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 60%, #8b5cf6 100%)',
                  boxShadow: '0 4px 18px rgba(6, 182, 212, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  fontWeight: '700',
                  fontSize: '12.5px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                <Sparkles size={15} />
                <span>{isProcessing ? 'Analizando Guion y Escenas...' : 'Ejecutar Diseñador Gráfico IA'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={handleApplyToTimeline}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                  boxShadow: '0 4px 18px rgba(16, 185, 129, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '9px 20px',
                  fontWeight: '700',
                  fontSize: '12.5px',
                  borderRadius: '8px',
                  border: 'none'
                }}
              >
                <CheckCircle2 size={15} />
                <span>Aplicar {generatedResult.graphicsCount} Gráficos a la Pista G1</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
