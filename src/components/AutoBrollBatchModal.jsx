import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Download,
  Film,
  HardDrive,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Layers,
  StopCircle,
  Eye,
  Sliders,
  Check,
  ChevronRight,
  ShieldAlert,
  Camera,
  RotateCcw
} from 'lucide-react';
import { autoPopulateAllScenesBroll, getProjectScenesStatus } from '../utils/sceneBrollManager';
import { getSavedStockConfig, getStorageDiskInfo } from '../utils/stockMediaClient';

export function AutoBrollBatchModal({
  isOpen,
  onClose,
  project,
  onBatchComplete
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0, message: '' });
  const [logs, setLogs] = useState([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [diskInfo, setDiskInfo] = useState(null);
  const [useVisionAI, setUseVisionAI] = useState(true);
  const [currentCollage, setCurrentCollage] = useState(null);
  const [curatedScenesCount, setCuratedScenesCount] = useState(0);
  const [detectedGlobalTopic, setDetectedGlobalTopic] = useState(null);

  const abortControllerRef = useRef(null);
  const logContainerRef = useRef(null);
  const latestProjectRef = useRef(project);

  const scenes = project?.scenes?.list || [];
  const sceneStatus = getProjectScenesStatus(project);
  const stockConfig = getSavedStockConfig();
  const [mediaTypePreference, setMediaTypePreference] = useState(stockConfig.preferredMediaType || 'mixed');
  const [batchMode, setBatchMode] = useState('all'); // 'resume' | 'all' | 'range'
  const [customStartScene, setCustomStartScene] = useState(1);
  const [customEndScene, setCustomEndScene] = useState(scenes.length || 1);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    // Only reset state when modal actually opens (transition from closed to open)
    if (isOpen && !prevIsOpenRef.current) {
      setIsRunning(false);
      setIsCompleted(false);
      setErrorMessage(null);
      latestProjectRef.current = project;

      const currentStatus = getProjectScenesStatus(project);
      const defaultMode = (currentStatus.populatedCount > 0 && currentStatus.emptyCount > 0) ? 'resume' : 'all';
      setBatchMode(defaultMode);
      setCustomStartScene(currentStatus.firstEmptyScene?.sceneNumber || 1);
      setCustomEndScene(scenes.length || 1);

      const targetCount = defaultMode === 'resume' ? currentStatus.emptyCount : scenes.length;
      setProgress({
        current: 0,
        total: targetCount,
        overallCurrent: currentStatus.populatedCount,
        overallTotal: scenes.length,
        percent: defaultMode === 'resume' ? Math.round((currentStatus.populatedCount / (scenes.length || 1)) * 100) : 0,
        message: defaultMode === 'resume'
          ? `Listo para continuar desde Escena #${currentStatus.firstEmptyScene?.sceneNumber || 1} (${currentStatus.emptyCount} pendientes)`
          : 'Listo para iniciar'
      });
      setLogs([]);
      setCurrentCollage(null);
      setCuratedScenesCount(0);
      setDetectedGlobalTopic(null);
      setMediaTypePreference(stockConfig.preferredMediaType || 'mixed');
      getStorageDiskInfo().then(info => setDiskInfo(info));
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  const handleStart = async () => {
    setIsRunning(true);
    setIsCompleted(false);
    setErrorMessage(null);
    setLogs([]);
    setCurrentCollage(null);
    setCuratedScenesCount(0);
    setDetectedGlobalTopic(null);
    abortControllerRef.current = new AbortController();
    latestProjectRef.current = project;

    try {
      const isResume = batchMode === 'resume';
      const isRange = batchMode === 'range';
      const currentStatus = getProjectScenesStatus(project);

      const updatedProject = await autoPopulateAllScenesBroll({
        project: latestProjectRef.current,
        onlyEmptyScenes: isResume,
        startFromSceneNumber: isRange ? Number(customStartScene) : (isResume ? currentStatus.firstEmptyScene?.sceneNumber : null),
        endAtSceneNumber: isRange ? Number(customEndScene) : null,
        useVisionAI,
        mediaTypePreference,
        onProgress: (p) => setProgress(p),
        onCurrentCollage: (colData) => {
          setCurrentCollage(colData);
          setCuratedScenesCount(prev => prev + 1);
        },
        onLog: (logItem) => {
          if (logItem.topicData) {
            setDetectedGlobalTopic(logItem.topicData);
          }
          setLogs((prev) => [...prev, { ...logItem, timestamp: new Date().toLocaleTimeString() }]);
        },
        onSceneAssigned: (incrementalProject) => {
          // Guardar incrementalmente en ref sin disparar re-renderizado externo que resetee el modal
          latestProjectRef.current = incrementalProject;
        },
        signal: abortControllerRef.current.signal
      });

      latestProjectRef.current = updatedProject;
      setIsCompleted(true);
      getStorageDiskInfo().then(info => setDiskInfo(info));

      if (onBatchComplete) {
        onBatchComplete(updatedProject);
      }
    } catch (err) {
      console.error('Batch auto-populate error:', err);
      setErrorMessage(err.message || 'Error en el proceso de auto-población de B-Roll');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
    // Preservar en el timeline todas las escenas descargadas hasta el momento exacto de detención
    if (onBatchComplete && latestProjectRef.current) {
      onBatchComplete(latestProjectRef.current);
    }
  };

  const handleCloseModal = () => {
    if (isRunning) return;
    if (onBatchComplete && latestProjectRef.current && latestProjectRef.current !== project) {
      onBatchComplete(latestProjectRef.current);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={isRunning ? undefined : handleCloseModal} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '880px',
          maxWidth: '94vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          background: 'var(--bg-panel)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)'
            }}>
              <Eye size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Agente Curador Visual IA: Autopoblación Cinematográfica
                <span className="badge badge-emerald" style={{ fontSize: '10px' }}>Ojo Crítico Multimodal</span>
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                Búsqueda con criterio editorial humano (estándar de explorador), mosaico 4x4 de 16 candidatos, carga ultra-rápida en paralelo y evaluación visual concisa.
              </p>
            </div>
          </div>

          {!isRunning && (
            <button className="btn-ghost icon-only" onClick={handleCloseModal}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>

          {/* Editorial Quality Criteria Pills */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={13} style={{ color: '#06b6d4' }} />
                Criterios del Pipeline de Curaduría e Investigación Visual:
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: '#38bdf8' }}>
                <input
                  type="checkbox"
                  checked={useVisionAI}
                  onChange={(e) => setUseVisionAI(e.target.checked)}
                  disabled={isRunning}
                  style={{ cursor: 'pointer' }}
                />
                <strong>Mosaico 4x4 (16 Candidatos) & Ojo Crítico Activo</strong>
              </label>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)' }}>
                🌐 Tema Global & Contexto
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
                🥕 Filtro Anti-Discordancias
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                🎬 Toma Sugerida Prioritaria
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                🔍 Búsqueda Estilo Editor (Píldoras del explorador)
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                🧩 Mosaico 4x4 (16 Candidatos)
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                🧠 Sistema Thinking (Evaluación Uno por Uno)
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                🛑 Vara Alta (Saber Decir NO & Auto-Rescate)
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                🎯 Concordancia con Ancla Visual
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                🛡️ Anti-Repetición (0 Duplicados en Proyecto)
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                🌐 Web Abierta (Bing/Wikimedia en Paralelo)
              </span>
            </div>
          </div>

          {/* Global Video Topic Banner */}
          {detectedGlobalTopic && (
            <div style={{
              background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.15), rgba(139, 92, 246, 0.15))',
              border: '1px solid rgba(6, 182, 212, 0.35)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🎯 TEMA PRINCIPAL DEL VIDEO (UNIVERSE LOCK):
                </span>
                <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                  {detectedGlobalTopic.visualDomain || 'Dominio Visual'}
                </span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>
                {detectedGlobalTopic.coreTopic}
              </div>
              {detectedGlobalTopic.forbiddenDiscordantConcepts?.length > 0 && (
                <div style={{ fontSize: '10px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <span>🚫 Filtro Anti-Discordancias:</span>
                  <span style={{ opacity: 0.9 }}>
                    Descartando {detectedGlobalTopic.forbiddenDiscordantConcepts.slice(0, 7).join(', ')}...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Media Format Preference Selector (Solo Videos, Solo Imágenes, Combinada) */}
          {!isRunning && !isCompleted && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.5)',
              borderRadius: '8px',
              padding: '12px 14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Film size={13} style={{ color: '#06b6d4' }} />
                  Formato de Recursos a Descargar e Insertar:
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {mediaTypePreference === 'mixed' && `Combinada: ${scenes.filter(s => s.visualType === 'video').length} videos / ${scenes.filter(s => s.visualType === 'image').length} fotos`}
                  {mediaTypePreference === 'video' && `Solo Videos: ${scenes.length} clips MP4`}
                  {mediaTypePreference === 'image' && `Solo Imágenes: ${scenes.length} fotos HD`}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setMediaTypePreference('mixed')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: mediaTypePreference === 'mixed' ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: mediaTypePreference === 'mixed' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    color: mediaTypePreference === 'mixed' ? '#c084fc' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={12} style={{ color: '#06b6d4' }} />
                    Combinada (Híbrida)
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 400, opacity: 0.75 }}>Videos e imágenes según guion</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMediaTypePreference('video')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: mediaTypePreference === 'video' ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: mediaTypePreference === 'video' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    color: mediaTypePreference === 'video' ? '#38bdf8' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Film size={12} />
                    Solo Videos
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 400, opacity: 0.75 }}>100% Clips de video MP4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMediaTypePreference('image')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: mediaTypePreference === 'image' ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: mediaTypePreference === 'image' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    color: mediaTypePreference === 'image' ? '#818cf8' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Camera size={12} />
                    Solo Imágenes
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 400, opacity: 0.75 }}>100% Fotos conceptuales HD</span>
                </button>
              </div>
            </div>
          )}

          {/* Execution & Resume Mode Selector */}
          {!isRunning && !isCompleted && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.5)',
              borderRadius: '8px',
              padding: '12px 14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={13} style={{ color: '#06b6d4' }} />
                  Modo de Ejecución & Reanudación:
                </span>
                <span style={{ fontSize: '11px', color: sceneStatus.populatedCount > 0 ? '#34d399' : 'var(--text-dim)' }}>
                  {sceneStatus.populatedCount > 0
                    ? `✓ ${sceneStatus.populatedCount} con video • ⏳ ${sceneStatus.emptyCount} pendientes`
                    : `${scenes.length} escenas en total`}
                </span>
              </div>

              {/* Grid with modes */}
              <div style={{ display: 'grid', gridTemplateColumns: sceneStatus.populatedCount > 0 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '8px' }}>
                {sceneStatus.populatedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchMode('resume')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: batchMode === 'resume' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: batchMode === 'resume' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: batchMode === 'resume' ? '#34d399' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '3px',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Play size={12} style={{ color: '#10b981' }} />
                        Reanudar Vacías
                      </span>
                      <span className="badge badge-emerald" style={{ fontSize: '9px', padding: '1px 5px' }}>
                        Recomendado
                      </span>
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 400, opacity: 0.85 }}>
                      {sceneStatus.emptyCount} pendientes (desde #{sceneStatus.firstEmptyScene?.sceneNumber || 1})
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setBatchMode('all')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: batchMode === 'all' ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: batchMode === 'all' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: batchMode === 'all' ? '#38bdf8' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '3px',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <RotateCcw size={12} />
                    Reprocesar Todas
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 400, opacity: 0.85 }}>
                    Todas las {scenes.length} escenas (de 1 a {scenes.length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchMode('range')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: batchMode === 'range' ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: batchMode === 'range' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: batchMode === 'range' ? '#c084fc' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '3px',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sliders size={12} />
                    Rango Manual
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 400, opacity: 0.85 }}>
                    Escenas #{customStartScene} a #{customEndScene}
                  </span>
                </button>
              </div>

              {/* Range inputs if batchMode === 'range' */}
              {batchMode === 'range' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  borderRadius: '6px',
                  fontSize: '11px'
                }}>
                  <span>Desde Escena:</span>
                  <input
                    type="number"
                    min="1"
                    max={scenes.length}
                    value={customStartScene}
                    onChange={(e) => setCustomStartScene(Math.max(1, Math.min(scenes.length, Number(e.target.value))))}
                    style={{ width: '60px', padding: '3px 6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#fff', fontSize: '11px' }}
                  />
                  <span>Hasta Escena:</span>
                  <input
                    type="number"
                    min={customStartScene}
                    max={scenes.length}
                    value={customEndScene}
                    onChange={(e) => setCustomEndScene(Math.max(customStartScene, Math.min(scenes.length, Number(e.target.value))))}
                    style={{ width: '60px', padding: '3px 6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#fff', fontSize: '11px' }}
                  />
                  <span style={{ color: 'var(--text-dim)', fontSize: '10px', marginLeft: 'auto' }}>
                    ({Math.max(0, customEndScene - customStartScene + 1)} escenas en este rango)
                  </span>
                </div>
              )}

              {/* Informative notice for resume mode */}
              {batchMode === 'resume' && sceneStatus.populatedCount > 0 && (
                <div style={{
                  fontSize: '11px',
                  color: '#34d399',
                  background: 'rgba(16, 185, 129, 0.08)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                  <span>
                    Las <strong>{sceneStatus.populatedCount} escenas</strong> ya procesadas se conservan intactas en tu línea de tiempo. Se investigarán únicamente las <strong>{sceneStatus.emptyCount} escenas vacías</strong> empezando por la Escena #{sceneStatus.firstEmptyScene?.sceneNumber || 1}.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action trigger before running */}
          {!isRunning && !isCompleted && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '8px',
              padding: '14px 16px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '13px' }}>
                  {batchMode === 'resume'
                    ? `${sceneStatus.emptyCount} escenas vacías por procesar`
                    : (batchMode === 'range' ? `${Math.max(0, customEndScene - customStartScene + 1)} escenas en rango` : `${scenes.length} escenas totales`)}
                </h4>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {batchMode === 'resume'
                    ? `Reanudando desde Escena #${sceneStatus.firstEmptyScene?.sceneNumber || 1} • Conservando ${sceneStatus.populatedCount} ya pobladas`
                    : `Carpeta destino: projects_media/${project.id || 'default'}/ • Pista: V2 B-Roll`}
                </p>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={handleStart}
                style={{
                  background: batchMode === 'resume'
                    ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                    : 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                  padding: '9px 20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: batchMode === 'resume'
                    ? '0 4px 14px rgba(16, 185, 129, 0.35)'
                    : '0 4px 14px rgba(6, 182, 212, 0.35)'
                }}
              >
                {batchMode === 'resume' ? <Play size={15} /> : <Sparkles size={15} />}
                {batchMode === 'resume'
                  ? `Reanudar desde Escena #${sceneStatus.firstEmptyScene?.sceneNumber || 1} (${sceneStatus.emptyCount} pendientes)`
                  : (batchMode === 'range' ? `Procesar Rango (#${customStartScene} - #${customEndScene})` : 'Iniciar Autopoblación Completa')}
              </button>
            </div>
          )}

          {/* Progress bar while running or completed */}
          {(isRunning || isCompleted) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isRunning && <Loader2 size={13} className="spin text-cyan" />}
                  {isRunning ? progress.message || 'Evaluando material visual...' : '¡Autopoblación con IA Finalizada con Éxito!'}
                </span>
                <span style={{ fontWeight: 600, color: '#06b6d4' }}>
                  {progress.percent}% ({progress.overallCurrent || progress.current}/{progress.overallTotal || progress.total} Escenas)
                </span>
              </div>

              <div style={{ width: '100%', height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${progress.percent}%`,
                  height: '100%',
                  background: isCompleted ? '#10b981' : 'linear-gradient(90deg, #06b6d4, #8b5cf6)',
                  transition: 'width 0.25s ease'
                }} />
              </div>
            </div>
          )}

          {/* Live Visual Collage Inspector */}
          {currentCollage && (
            <div style={{
              background: '#070a12',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={14} />
                  Inspección Visual en Tiempo Real: [Escena #{currentCollage.sceneNumber}] {currentCollage.sceneTitle}
                </span>
                <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                  ✓ Ganador Candidato #{currentCollage.critique?.winnerIndex || 1}
                </span>
              </div>

              {/* Rendered Collage Image */}
              <div style={{
                position: 'relative',
                borderRadius: '6px',
                overflow: 'hidden',
                maxHeight: '260px',
                background: '#000',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <img
                  src={currentCollage.collageDataUrl}
                  alt="Collage de candidatos"
                  style={{ width: '100%', maxHeight: '260px', objectFit: 'contain' }}
                />
              </div>

              {/* Critique breakdown & winner rationale */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.7)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <div style={{ color: 'var(--text-primary)' }}>
                  <strong style={{ color: '#10b981' }}>Veredicto Editorial IA: </strong>
                  {currentCollage.critique?.winnerReason}
                </div>
                {currentCollage.alternatives?.length > 0 && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                    <strong style={{ color: '#8b5cf6' }}>Alternativas Guardadas: </strong>
                    {currentCollage.alternatives.map((alt, idx) => (
                      <span key={idx} style={{ marginRight: '8px' }}>
                        Opción #{alt.candidateIndex}: {alt.title?.substring(0, 30)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Log Stream Box */}
          {logs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Registro del Agente en Vivo:
              </span>
              <div
                ref={logContainerRef}
                style={{
                  background: '#090d16',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '10px',
                  height: currentCollage ? '120px' : '180px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  lineHeight: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                {logs.map((log, index) => (
                  <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '10px', flexShrink: 0 }}>
                      [{log.timestamp}]
                    </span>
                    <span style={{ flexShrink: 0 }}>{log.icon || '•'}</span>
                    <span style={{ color: '#06b6d4', fontWeight: 600, flexShrink: 0 }}>
                      [{log.phase}]
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error display */}
          {errorMessage && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#f87171',
              fontSize: '12px'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            {diskInfo ? (
              <span>Espacio en disco del proyecto: <strong>{diskInfo.totalFiles} archivos ({diskInfo.totalSizeFormatted})</strong></span>
            ) : (
              <span>Descargas sincronizadas en disco local</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {isRunning ? (
              <button
                type="button"
                className="btn-danger"
                onClick={handleCancel}
                style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <StopCircle size={14} />
                Detener
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCloseModal}
                style={{ fontSize: '12px' }}
              >
                {isCompleted ? 'Cerrar & Ver en Timeline' : 'Cerrar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
