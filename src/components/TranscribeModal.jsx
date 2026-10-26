import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Sparkles,
  Cpu,
  Cloud,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  Key,
  ExternalLink,
  Scissors,
  Volume2,
  Check,
  Zap,
  Award,
  Globe,
  RotateCcw
} from 'lucide-react';
import { applyTranscriptToProject } from '../utils/transcriptOps';
import { formatTimecode } from '../utils/timeFormat';
import { getMediaBlob } from '../utils/storage';
import {
  renderTimelineAudio,
  getTimelineAudioSummary,
  filterSegmentsToTimelineCuts
} from '../utils/timelineAudioRenderer';
import { useAuth } from '../context/AuthContext';
import { saveUserGeneralSettings } from '../services/userSettingsService';

const STORAGE_KEY_GEMINI = 'montage_pro_gemini_api_key';
const STORAGE_KEY_WHISPER_MODEL = 'montage_pro_whisper_model';

export const LOCAL_WHISPER_MODELS = [
  {
    id: 'whisper-base',
    onnxModel: 'onnx-community/whisper-base',
    name: 'Whisper Base',
    badge: 'Recomendado',
    badgeColor: '#38bdf8',
    badgeBg: 'rgba(6, 182, 212, 0.15)',
    badgeBorder: 'rgba(6, 182, 212, 0.35)',
    size: '74 MB',
    speed: 'Rápido',
    accuracy: 'Equilibrada',
    desc: 'Equilibrio ideal de velocidad y precisión en español. Detecta correctamente nombres y reduce confusiones fonéticas.',
    icon: Cpu
  },
  {
    id: 'whisper-tiny',
    onnxModel: 'onnx-community/whisper-tiny',
    name: 'Whisper Tiny',
    badge: 'Ultra Rápido',
    badgeColor: '#facc15',
    badgeBg: 'rgba(234, 179, 8, 0.15)',
    badgeBorder: 'rgba(234, 179, 8, 0.35)',
    size: '39 MB',
    speed: 'Instantáneo',
    accuracy: 'Estándar',
    desc: 'El modelo más ligero y veloz. Mínimo consumo de RAM; ideal para computadoras portátiles o revisiones rápidas.',
    icon: Zap
  },
  {
    id: 'whisper-small',
    onnxModel: 'onnx-community/whisper-small',
    name: 'Whisper Small',
    badge: 'Alta Calidad',
    badgeColor: '#c084fc',
    badgeBg: 'rgba(168, 85, 247, 0.15)',
    badgeBorder: 'rgba(168, 85, 247, 0.35)',
    size: '244 MB',
    speed: 'Moderado',
    accuracy: 'Muy Alta',
    desc: 'Mayor fidelidad en acentos regionales (Colombia, México, etc.), jerga y dicción rápida. Menor tasa de errores.',
    icon: Sparkles
  },
  {
    id: 'whisper-large-v3-turbo',
    onnxModel: 'onnx-community/whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    badge: 'Estudio Pro',
    badgeColor: '#34d399',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeBorder: 'rgba(16, 185, 129, 0.35)',
    size: '800 MB',
    speed: 'Intensivo',
    accuracy: 'Máxima',
    desc: 'Máxima fidelidad de estudio para audios con ruido de fondo, música o múltiples oradores. Requiere buena CPU/GPU.',
    icon: Award
  }
];

export function TranscribeModal({ isOpen, onClose, project, onUpdateProject, initialAssetId = null }) {
  const { user } = useAuth();
  // Summary of audio currently cut and placed on the timeline
  const timelineSummary = useMemo(() => getTimelineAudioSummary(project), [project]);

  // Source selection: 'timeline' (default if timeline has clips) | 'library' (raw full file)
  const [sourceType, setSourceType] = useState(() =>
    timelineSummary.hasTimelineAudio ? 'timeline' : 'library'
  );

  // 'all' = all active unmuted audio tracks, or specific track id
  const [selectedTrackId, setSelectedTrackId] = useState('all');
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId || '');

  const [provider, setProvider] = useState('gemini'); // 'gemini' | 'whisper'
  const [apiKey, setApiKey] = useState('');
  const [language, setLanguage] = useState('spanish');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressState, setProgressState] = useState({ percent: 0, message: '' });
  const [extractedSegments, setExtractedSegments] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [whisperScope, setWhisperScope] = useState('sample'); // 'sample' (first 2m safe) | 'full'
  const [whisperModel, setWhisperModel] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return (
        localStorage.getItem(STORAGE_KEY_WHISPER_MODEL) ||
        localStorage.getItem('montage_autocut_model') ||
        'whisper-base'
      );
    }
    return 'whisper-base';
  });

  const handleSelectWhisperModel = (modelId) => {
    setWhisperModel(modelId);
    try {
      localStorage.setItem(STORAGE_KEY_WHISPER_MODEL, modelId);
    } catch (_) {}
  };

  const abortControllerRef = useRef(null);

  // Load saved Gemini API Key
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_GEMINI);
    if (saved) {
      setApiKey(saved);
    }
  }, []);

  // Filter eligible raw audio/video assets for library mode
  const mediaAssets = (project.assets || []).filter(
    (a) => a.type === 'video' || a.type === 'audio'
  );

  // Update default selected asset when list changes
  useEffect(() => {
    if (mediaAssets.length > 0 && !selectedAssetId) {
      setSelectedAssetId(mediaAssets[0].id);
    }
  }, [mediaAssets, selectedAssetId]);

  // Reset or select timeline if clips are available
  useEffect(() => {
    if (timelineSummary.hasTimelineAudio && !initialAssetId) {
      setSourceType('timeline');
    }
  }, [timelineSummary.hasTimelineAudio, initialAssetId]);

  if (!isOpen) return null;

  const handleSaveApiKey = (key) => {
    setApiKey(key);
    saveUserGeneralSettings(user, { geminiApiKey: key });
  };

  const handleCancelTranscription = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setProgressState({ percent: 0, message: 'Transcripción cancelada' });
    }
  };

  const handleStartTranscription = async () => {
    setErrorMessage(null);
    setExtractedSegments(null);

    if (provider === 'gemini' && (!apiKey || apiKey.trim() === '')) {
      setErrorMessage('Por favor, ingresa tu clave API de Google Gemini (o cambia a Whisper Local).');
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsProcessing(true);
    setProgressState({ percent: 4, message: 'Preparando fuentes de audio...' });

    try {
      let audioInput = null;
      let activeIntervals = null;
      let sourceAssetId = null;

      if (sourceType === 'timeline') {
        // Render timeline audio composite strictly respecting cuts, trimming, and timeline timestamps
        const rendered = await renderTimelineAudio(project, {
          sourceMode: selectedTrackId === 'all' ? 'timeline_all_audio' : 'timeline_track',
          targetTrackId: selectedTrackId === 'all' ? null : selectedTrackId,
          onProgress: (prog) => {
            setProgressState({
              percent: Math.round(prog.percent * 0.35),
              message: prog.message
            });
          }
        });

        audioInput = rendered;
        activeIntervals = rendered.activeIntervals;
        sourceAssetId = 'timeline_audio';
      } else {
        // Raw asset from media library
        const asset = (project.assets || []).find((a) => a.id === selectedAssetId);
        if (!asset) {
          throw new Error('Por favor, selecciona un video o audio de la biblioteca para transcribir.');
        }
        sourceAssetId = asset.id;
        let mediaSource = asset.url;
        const storedBlob = await getMediaBlob(asset.id);
        if (storedBlob) {
          mediaSource = storedBlob;
        }
        audioInput = mediaSource;
      }

      let rawSegments = [];

      if (provider === 'gemini') {
        handleSaveApiKey(apiKey.trim());
        const { transcribeWithGemini } = await import('../utils/geminiTranscriber');
        rawSegments = await transcribeWithGemini(audioInput, apiKey.trim(), {
          language,
          onProgress: (prog) => {
            setProgressState({
              percent: Math.round(35 + prog.percent * 0.65),
              message: prog.message
            });
          }
        });
      } else {
        // Whisper Local via background Web Worker
        const { transcribeWithWhisperLocal } = await import('../utils/whisperTranscriber');
        const maxChunks = (isLongDuration && whisperScope === 'sample') ? 4 : null;
        const selectedModelObj = LOCAL_WHISPER_MODELS.find((m) => m.id === whisperModel);
        const onnxModelId = selectedModelObj ? selectedModelObj.onnxModel : 'onnx-community/whisper-base';

        rawSegments = await transcribeWithWhisperLocal(audioInput, {
          language,
          model: onnxModelId,
          whisperModel: onnxModelId,
          maxChunks,
          abortController,
          onProgress: (prog) => {
            const scaledPercent = sourceType === 'timeline'
              ? Math.round(35 + (prog.percent || 0) * 0.65)
              : Math.round(prog.percent || 0);
            setProgressState({
              percent: Math.min(100, Math.max(1, scaledPercent)),
              message: prog.message || 'Procesando transcripción...'
            });
          }
        });
      }

      if (!rawSegments || rawSegments.length === 0) {
        throw new Error('No se detectó voz audible en el audio procesado.');
      }

      // Filter and clamp segments strictly to timeline cuts if transcribed from timeline
      let finalSegments = rawSegments;
      if (sourceType === 'timeline' && activeIntervals && activeIntervals.length > 0) {
        finalSegments = filterSegmentsToTimelineCuts(rawSegments, activeIntervals);
        if (finalSegments.length === 0) {
          // If strictly filtered out due to minor threshold, fallback to raw segments
          finalSegments = rawSegments;
        }
      }

      setExtractedSegments(finalSegments);
    } catch (err) {
      console.error('Transcription error:', err);
      setErrorMessage(err.message || 'Error durante la transcripción.');
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleApplyToTimeline = () => {
    if (!extractedSegments) return;

    const sourceId = sourceType === 'timeline' ? 'timeline_audio' : selectedAssetId;
    const updated = applyTranscriptToProject(project, extractedSegments, sourceId, { enableSubtitles: true });
    onUpdateProject(updated);
    onClose();
  };

  const selectedAsset = (project.assets || []).find((a) => a.id === selectedAssetId);
  const effectiveDuration = sourceType === 'timeline'
    ? timelineSummary.effectiveAudioDuration
    : (selectedAsset?.duration || 0);
  const isLongDuration = effectiveDuration > 180;

  return (
    <div className="modal-backdrop">
      <div className="modal-container modal-large transcribe-modal-container">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge" style={{ background: '#8b5cf626' }}>
              <Sparkles size={20} style={{ color: '#8b5cf6' }} />
            </div>
            <div>
              <h3>Transcripción y Guion con IA</h3>
              <p>Genera la línea guía sincronizada con los cortes exactos de la línea de tiempo</p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={isProcessing ? handleCancelTranscription : onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-form">
          {errorMessage && (
            <div className="alert-box alert-error">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {!extractedSegments && (
            <>
              {/* Step 1: Select Source (Timeline Audio Tracks vs Full Raw File) */}
              <div className="form-group" style={{ gap: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>1. Origen del Audio a Transcribir</label>
                <div className="aspect-ratio-selector" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '8px', gap: '8px' }}>
                  <button
                    type="button"
                    className={`ratio-btn ${sourceType === 'timeline' ? 'active' : ''}`}
                    style={{ padding: '8px 12px' }}
                    onClick={() => setSourceType('timeline')}
                    disabled={isProcessing || !timelineSummary.hasTimelineAudio}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Scissors size={16} style={{ color: '#06b6d4' }} />
                      <span className="ratio-label">Pistas de la Línea de Tiempo</span>
                    </div>
                    <span className="ratio-sub" style={{ fontSize: '10px' }}>
                      {timelineSummary.hasTimelineAudio
                        ? `✓ Respeta cortes y achiques (${timelineSummary.totalAudioClips} clips • ${timelineSummary.effectiveAudioDuration.toFixed(1)}s)`
                        : 'Sin clips en la línea de tiempo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`ratio-btn ${sourceType === 'library' ? 'active' : ''}`}
                    style={{ padding: '8px 12px' }}
                    onClick={() => setSourceType('library')}
                    disabled={isProcessing || mediaAssets.length === 0}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={16} style={{ color: '#a5b4fc' }} />
                      <span className="ratio-label">Archivo Completo (Biblioteca)</span>
                    </div>
                    <span className="ratio-sub" style={{ fontSize: '10px' }}>
                      {mediaAssets.length > 0 ? `${mediaAssets.length} archivos en biblioteca` : 'Sin archivos'}
                    </span>
                  </button>
                </div>

                {/* Sub-selector for Timeline Mode */}
                {sourceType === 'timeline' && (
                  <div
                    style={{
                      background: 'rgba(6, 182, 212, 0.08)',
                      border: '1px solid rgba(6, 182, 212, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Volume2 size={14} /> Pista a procesar:
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                        Duración efectiva: <strong>{timelineSummary.effectiveAudioDuration.toFixed(1)}s</strong>
                      </span>
                    </div>

                    <select
                      className="input-field"
                      value={selectedTrackId}
                      onChange={(e) => setSelectedTrackId(e.target.value)}
                      disabled={isProcessing}
                    >
                      <option value="all">
                        Todas las pistas de audio de la línea de tiempo (Mezcla de cortes)
                      </option>
                      {timelineSummary.audioTracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.clipCount} {t.clipCount === 1 ? 'clip cortado' : 'clips cortados'} • {t.totalDuration.toFixed(1)}s)
                        </option>
                      ))}
                      {timelineSummary.audioTracks.length === 0 &&
                        timelineSummary.videoTracksWithAudio.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.clipCount} clips de video • {t.totalDuration.toFixed(1)}s)
                          </option>
                        ))}
                    </select>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      <Check size={14} style={{ color: '#10b981', flexShrink: 0, marginTop: '1px' }} />
                      <span>
                        Solo se transcribirán los fragmentos visibles en la línea de tiempo. Las partes recortadas, silencios vacíos o clips eliminados serán omitidos automáticamente.
                      </span>
                    </div>
                  </div>
                )}

                {/* Sub-selector for Library Mode */}
                {sourceType === 'library' && (
                  <div>
                    {mediaAssets.length === 0 ? (
                      <p className="text-muted" style={{ fontSize: '12px' }}>
                        No hay videos ni audios en la biblioteca.
                      </p>
                    ) : (
                      <select
                        className="input-field"
                        value={selectedAssetId}
                        onChange={(e) => setSelectedAssetId(e.target.value)}
                        disabled={isProcessing}
                      >
                        {mediaAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name} ({asset.type.toUpperCase()} • {asset.duration ? `${Math.round(asset.duration)}s` : 'audio'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Choose AI Provider */}
              <div className="form-group" style={{ gap: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>2. Motor de Inteligencia Artificial</label>
                <div className="aspect-ratio-selector" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    className={`ratio-btn ${provider === 'gemini' ? 'active' : ''}`}
                    style={{ padding: '8px 12px' }}
                    onClick={() => setProvider('gemini')}
                    disabled={isProcessing}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Cloud size={16} style={{ color: '#6366f1' }} />
                      <span className="ratio-label">Google Gemini API</span>
                    </div>
                    <span className="ratio-sub" style={{ fontSize: '10px' }}>
                      {isLongDuration ? '⚡ Recomendado (Procesa en 10 seg)' : 'Ultrarrápido y ultrapreciso en la nube'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`ratio-btn ${provider === 'whisper' ? 'active' : ''}`}
                    style={{ padding: '8px 12px' }}
                    onClick={() => setProvider('whisper')}
                    disabled={isProcessing}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Cpu size={16} style={{ color: '#06b6d4' }} />
                      <span className="ratio-label">Whisper Local (Web Worker)</span>
                    </div>
                    <span className="ratio-sub" style={{ fontSize: '10px' }}>100% privado en tu equipo (Sin claves)</span>
                  </button>
                </div>
              </div>

              {/* Provider details */}
              {provider === 'gemini' && (
                <div className="form-group" style={{ background: 'var(--bg-input)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <Key size={13} style={{ color: '#6366f1' }} /> Clave API de Google Gemini (Gratuita)
                    </label>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '11px', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                    >
                      Obtener clave gratis <ExternalLink size={11} />
                    </a>
                  </div>
                  <input
                    type="password"
                    placeholder="Pega aquí tu clave: AIzaSy..."
                    className="input-field"
                    value={apiKey}
                    onChange={(e) => handleSaveApiKey(e.target.value)}
                    disabled={isProcessing}
                    style={{ padding: '7px 10px' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block' }}>
                    ✓ Procesa el audio en segundos con marcas de tiempo exactas. Se guarda localmente.
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                    <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                      <Globe size={13} style={{ color: '#6366f1' }} /> Idioma del audio:
                    </label>
                    <select
                      className="input-field"
                      style={{ fontSize: '12px', padding: '4px 8px', maxWidth: '220px' }}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      disabled={isProcessing}
                    >
                      <option value="spanish">Español (Recomendado)</option>
                      <option value="english">Inglés (English)</option>
                      <option value="portuguese">Portugués</option>
                      <option value="french">Francés</option>
                      <option value="italian">Italiano</option>
                      <option value="german">Alemán</option>
                      <option value="auto">Detectar automáticamente</option>
                    </select>
                  </div>
                </div>
              )}

              {provider === 'whisper' && (
                <div
                  className="form-group"
                  style={{
                    background: 'var(--bg-input)',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '5px',
                          background: 'rgba(6, 182, 212, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Cpu size={14} style={{ color: '#06b6d4' }} />
                      </div>
                      <div>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Whisper Local (WebAssembly Cuantizado)
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                          — 100% privado en Web Worker sin enviar audio fuera
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Model Choice 2x2 Grid */}
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                      {LOCAL_WHISPER_MODELS.map((m) => {
                        const isSelected = whisperModel === m.id;
                        const IconComponent = m.icon;
                        return (
                          <div
                            key={m.id}
                            onClick={() => !isProcessing && handleSelectWhisperModel(m.id)}
                            style={{
                              background: isSelected ? 'rgba(6, 182, 212, 0.12)' : 'var(--bg-card)',
                              border: isSelected ? '1.5px solid #06b6d4' : '1px solid var(--border-subtle)',
                              borderRadius: '7px',
                              padding: '8px 10px',
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              position: 'relative',
                              boxShadow: isSelected ? '0 0 12px rgba(6, 182, 212, 0.22)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <IconComponent size={14} style={{ color: isSelected ? '#38bdf8' : 'var(--text-secondary)' }} />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: isSelected ? '#fff' : 'var(--text-primary)' }}>
                                  {m.name}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '9.5px',
                                  fontWeight: 600,
                                  color: m.badgeColor,
                                  background: m.badgeBg,
                                  border: `1px solid ${m.badgeBorder}`,
                                  borderRadius: '999px',
                                  padding: '1px 5px'
                                }}
                              >
                                {m.badge}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: 'var(--text-dim)' }}>
                              <span>{m.size}</span>
                              <span>•</span>
                              <span>{m.speed}</span>
                              <span>•</span>
                              <span>{m.accuracy}</span>
                            </div>

                            <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: '1.25' }}>
                              {m.desc}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Language Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                    <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                      <Globe size={13} style={{ color: '#06b6d4' }} /> Idioma del audio:
                    </label>
                    <select
                      className="input-field"
                      style={{ fontSize: '12px', padding: '4px 8px', maxWidth: '240px' }}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      disabled={isProcessing}
                    >
                      <option value="spanish">Español (Recomendado)</option>
                      <option value="english">Inglés (English)</option>
                      <option value="portuguese">Portugués</option>
                      <option value="french">Francés</option>
                      <option value="italian">Italiano</option>
                      <option value="german">Alemán</option>
                      <option value="auto">Detectar automáticamente</option>
                    </select>
                  </div>

                  {isLongDuration && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', padding: '10px', marginTop: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#f59e0b', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span>Audio extenso ({Math.round(effectiveDuration / 60)} minutos) detectado:</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="whisperScope"
                            checked={whisperScope === 'sample'}
                            onChange={() => setWhisperScope('sample')}
                            disabled={isProcessing}
                          />
                          <span><strong>Muestra rápida (Primeros 2 minutos)</strong> — Rápido, no satura el navegador</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="whisperScope"
                            checked={whisperScope === 'full'}
                            onChange={() => setWhisperScope('full')}
                            disabled={isProcessing}
                          />
                          <span><strong>Transcribir todo el montaje ({Math.round(effectiveDuration / 60)} min)</strong></span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Progress Bar during execution */}
              {isProcessing && (
                <div className="export-progress-container" style={{ marginTop: '10px' }}>
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
                      style={{ width: `${progressState.percent}%` }}
                    ></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn-danger btn-xs"
                      onClick={handleCancelTranscription}
                    >
                      Cancelar transcripción
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Results Preview */}
          {extractedSegments && (
            <div className="export-success-box" style={{ padding: '8px 0' }}>
              <CheckCircle size={32} className="text-emerald" />
              <h4>¡Guion y Tiempos Extraídos con Éxito!</h4>
              <p>
                Se detectaron <strong>{extractedSegments.length} segmentos hablados</strong> sincronizados exactamente con la línea de tiempo.
              </p>

              {/* Snippet list preview */}
              <div
                style={{
                  width: '100%',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                {extractedSegments.slice(0, 10).map((seg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '8px',
                      fontSize: '12px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <span
                      className="timecode"
                      style={{ color: '#8b5cf6', fontSize: '10px', flexShrink: 0 }}
                    >
                      [{formatTimecode(seg.start)} - {formatTimecode(seg.end)}]
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{seg.text}</span>
                  </div>
                ))}
                {extractedSegments.length > 10 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '4px' }}>
                    + {extractedSegments.length - 10} segmentos adicionales...
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isProcessing}>
            Cancelar
          </button>

          {!extractedSegments ? (
            <button
              className="btn-primary"
              onClick={handleStartTranscription}
              disabled={isProcessing || (sourceType === 'timeline' ? !timelineSummary.hasTimelineAudio : mediaAssets.length === 0)}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="spinner" />
                  Procesando audio...
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  {sourceType === 'timeline'
                    ? `Transcribir Cortes de la Línea de Tiempo`
                    : `Transcribir Archivo`}
                </>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setExtractedSegments(null)}
              >
                <RotateCcw size={14} />
                Volver a Transcribir / Configurar
              </button>

              <button className="btn-primary" onClick={handleApplyToTimeline}>
                <Sparkles size={15} />
                Insertar y Subtitular en Línea de Tiempo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
