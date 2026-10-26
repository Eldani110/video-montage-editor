import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Film,
  Sparkles,
  Video,
  Image as ImageIcon,
  Play,
  Copy,
  Check,
  Search,
  Clock,
  Layers,
  Sliders,
  Trash2,
  Download,
  HardDrive,
  CheckCircle2,
  RefreshCw,
  Eye,
  X
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';
import { StockMediaSearchModal } from './StockMediaSearchModal';
import { AutoBrollBatchModal } from './AutoBrollBatchModal';
import { switchSceneAlternative } from '../utils/sceneBrollManager';
import { resolveRealSceneTimelinePosition } from '../utils/sceneOps';


export const SceneStoryboardPanel = React.memo(function SceneStoryboardPanel({
  project,
  currentTime,
  setCurrentTime,
  selectedSceneId = null,
  onSelectScene = null,
  onOpenSceneDirector,
  onClearScenes,
  onDeleteScene,
  onUpdateProject,
  onOpenAutoBrollBatch = null,
  onOpenGraphicForScene = null
}) {
  const [filterType, setFilterType] = useState('all'); // 'all' | 'video' | 'image'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [selectedSceneForBroll, setSelectedSceneForBroll] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [expandedSceneAlternatives, setExpandedSceneAlternatives] = useState(null);
  const [isSwappingAlternative, setIsSwappingAlternative] = useState(false);
  const [previewCollageModal, setPreviewCollageModal] = useState(null);
  const listContainerRef = useRef(null);
  const cardRefs = useRef({});
  const [scrollTop, setScrollTop] = useState(0);

  const handleListScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  const sceneTrack = (project.tracks || []).find(t => t.type === 'scene');
  const scenes = useMemo(() => {
    const rawScenes = project.scenes?.list || [];
    if (!sceneTrack || !Array.isArray(sceneTrack.clips)) return rawScenes;

    return rawScenes.map(s => {
      const sNum = s.sceneNumber ? Number(s.sceneNumber) : null;
      const sClip = sceneTrack.clips.find(c => {
        if (sNum && Number(c.sceneNumber) === sNum) return true;
        if (s.id && (c.sceneId === s.id || c.id === s.id)) return true;
        if (sNum && c.name) {
          const m = c.name.match(/\[E\s*0*(\d+)\]/i);
          if (m && Number(m[1]) === sNum) return true;
        }
        return false;
      });
      if (sClip && typeof sClip.startTime === 'number') {
        const dur = typeof sClip.duration === 'number' ? sClip.duration : s.duration;
        return {
          ...s,
          startTime: Number(sClip.startTime.toFixed(2)),
          duration: Number(dur.toFixed(2)),
          endTime: Number((sClip.startTime + dur).toFixed(2))
        };
      }
      return s;
    });
  }, [project.scenes?.list, sceneTrack]);
  const scenesSummary = project.scenes?.summary || null;
  const rhythmProfile = project.scenes?.rhythmProfile || null;

  const assignedCount = scenes.filter(s => s.assignedMediaUrl || s.assignedAssetId).length;

  const handleCopyPrompt = (text, id, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleJumpToScene = (startTime) => {
    setCurrentTime(startTime);
  };

  const handleUpdateScene = useCallback((sceneId, updates) => {
    const updatedScenes = (project.scenes?.list || []).map(s => {
      if (s.id === sceneId) {
        return { ...s, ...updates };
      }
      return s;
    });

    const updatedTracks = (project.tracks || []).map(t => {
      if (t.type === 'scene') {
        return {
          ...t,
          clips: (t.clips || []).map(c => {
            if (c.id === sceneId || c.sceneId === sceneId) {
              return {
                ...c,
                ...(updates.title !== undefined ? { title: updates.title, name: `[E${c.sceneNumber || ''}] ${updates.title}` } : {}),
                ...(updates.visualDescription !== undefined ? { visualDescription: updates.visualDescription } : {}),
                ...(updates.visualType !== undefined ? {
                  visualType: updates.visualType,
                  color: updates.visualType === 'video' ? '#06b6d4' : '#6366f1'
                } : {}),
                ...(updates.scriptText !== undefined ? { text: updates.scriptText } : {}),
                ...(updates.searchKeywords !== undefined ? { searchKeywords: updates.searchKeywords } : {})
              };
            }
            return c;
          })
        };
      }
      return t;
    });

    if (onUpdateProject) {
      onUpdateProject({
        ...project,
        tracks: updatedTracks,
        scenes: {
          ...(project.scenes || {}),
          list: updatedScenes
        }
      });
    }
  }, [project, onUpdateProject]);

  const handleUnassignBroll = useCallback((sceneId, e) => {
    if (e) e.stopPropagation();
    handleUpdateScene(sceneId, {
      assignedMediaUrl: null,
      assignedThumbnail: null,
      assignedTitle: null,
      assignedAssetId: null,
      curatorCritique: null
    });
  }, [handleUpdateScene]);

  // Auto-scroll directly to selected scene card whenever selectedSceneId updates
  React.useEffect(() => {
    if (!selectedSceneId || !scenes.length) return;

    const targetIdx = scenes.findIndex(s =>
      s.id === selectedSceneId ||
      String(s.sceneNumber) === String(selectedSceneId)
    );

    if (targetIdx >= 0) {
      if (listContainerRef.current) {
        const ITEM_HEIGHT = 210;
        const targetScroll = Math.max(0, (targetIdx * ITEM_HEIGHT) - 30);
        listContainerRef.current.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
        setScrollTop(targetScroll);
      }

      const timer = setTimeout(() => {
        const el = cardRefs.current[selectedSceneId] || document.getElementById(`scene-card-${selectedSceneId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 70);

      return () => clearTimeout(timer);
    }
  }, [selectedSceneId, scenes]);

  const handleToggleSceneVisualType = (sceneId, e) => {
    if (e) e.stopPropagation();
    const updatedScenes = (project.scenes?.list || []).map(s => {
      if (s.id === sceneId) {
        const nextType = s.visualType === 'video' ? 'image' : 'video';
        return {
          ...s,
          visualType: nextType,
          visualTypeLabel: nextType === 'video' ? 'Video B-Roll' : 'Imagen Conceptual',
          color: nextType === 'video' ? '#06b6d4' : '#6366f1'
        };
      }
      return s;
    });

    const updatedTracks = (project.tracks || []).map(t => {
      if (t.type === 'scene') {
        return {
          ...t,
          clips: (t.clips || []).map(c => {
            if (c.id === sceneId || c.sceneId === sceneId) {
              const nextType = c.visualType === 'video' ? 'image' : 'video';
              return {
                ...c,
                visualType: nextType,
                color: nextType === 'video' ? '#06b6d4' : '#6366f1'
              };
            }
            return c;
          })
        };
      }
      return t;
    });

    if (onUpdateProject) {
      onUpdateProject({
        ...project,
        tracks: updatedTracks,
        scenes: {
          ...(project.scenes || {}),
          list: updatedScenes
        }
      });
    }
  };

  const handleBulkConvertVisualType = (targetType) => {
    const updatedScenes = (project.scenes?.list || []).map((s, idx) => {
      let nextType = targetType;
      if (targetType === 'mixed') {
        nextType = idx % 3 === 2 ? 'image' : 'video';
      }
      return {
        ...s,
        visualType: nextType,
        visualTypeLabel: nextType === 'video' ? 'Video B-Roll' : 'Imagen Conceptual',
        color: nextType === 'video' ? '#06b6d4' : '#6366f1'
      };
    });

    const updatedTracks = (project.tracks || []).map(t => {
      if (t.type === 'scene') {
        return {
          ...t,
          clips: (t.clips || []).map((c, idx) => {
            let nextType = targetType;
            if (targetType === 'mixed') {
              nextType = idx % 3 === 2 ? 'image' : 'video';
            }
            return {
              ...c,
              visualType: nextType,
              color: nextType === 'video' ? '#06b6d4' : '#6366f1'
            };
          })
        };
      }
      return t;
    });

    if (onUpdateProject) {
      onUpdateProject({
        ...project,
        tracks: updatedTracks,
        scenes: {
          ...(project.scenes || {}),
          list: updatedScenes
        }
      });
    }
  };

  const filteredScenes = scenes.filter((s) => {
    if (filterType === 'video' && s.visualType !== 'video') return false;
    if (filterType === 'image' && s.visualType !== 'image') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (s.title || '').toLowerCase().includes(q);
      const matchScript = (s.scriptText || '').toLowerCase().includes(q);
      const matchPrompt = (s.visualDescription || '').toLowerCase().includes(q);
      return matchTitle || matchScript || matchPrompt;
    }
    return true;
  });

  if (scenes.length === 0) {
    return (
      <div className="transcript-panel-empty" style={{ padding: '24px 16px', textAlign: 'center' }}>
        <div className="empty-icon-badge" style={{ background: '#06b6d418', color: '#06b6d4', margin: '0 auto 12px' }}>
          <Film size={28} />
        </div>
        <h4>No hay escenas de montaje generadas</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          El Agente Editor IA puede analizar tu guion transcrito y dividirlo automáticamente en escenas con ritmo dinámico y tomas sugeridas.
        </p>
        <button
          className="btn-primary"
          onClick={onOpenSceneDirector}
          style={{ width: '100%', background: 'linear-gradient(135deg, #06b6d4, #6366f1)' }}
        >
          <Sparkles size={15} />
          Abrir Editor IA & Crear Escenas
        </button>
      </div>
    );
  }

  return (
    <div className="transcript-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with stats and actions */}
      <div className="transcript-header" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Film size={16} style={{ color: '#06b6d4' }} />
            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Storyboard ({scenes.length} Escenas)</h4>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn-secondary btn-xs"
              onClick={onOpenSceneDirector}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Sliders size={11} />
              Re-ajustar
            </button>
            <button
              className="btn-ghost btn-xs text-rose"
              onClick={onClearScenes}
              title="Borrar todas las escenas generadas (Ctrl+Z para recuperar)"
              style={{
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                borderColor: 'rgba(244, 63, 94, 0.25)',
                background: 'rgba(244, 63, 94, 0.08)'
              }}
            >
              <Trash2 size={11} />
              Limpiar
            </button>
          </div>
        </div>

        {/* Primary Action: Auto-Poblar B-Roll */}
        <div style={{ marginBottom: '10px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onOpenAutoBrollBatch ? onOpenAutoBrollBatch() : setShowBatchModal(true)}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(6, 182, 212, 0.2)'
            }}
          >
            <Sparkles size={14} />
            <span>⚡ Auto-Poblar B-Roll (Buscar & Descargar)</span>
          </button>
        </div>

        {/* Rhythm badge & B-roll progress stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '11px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className="badge badge-indigo" style={{ fontSize: '10px' }}>
              Ritmo: {rhythmProfile?.name?.split('(')[0] || 'Personalizado'}
            </span>
          </div>

          <span style={{ color: assignedCount > 0 ? '#34d399' : 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {assignedCount > 0 ? <CheckCircle2 size={12} /> : null}
            {assignedCount}/{scenes.length} B-Roll asignados
          </span>
        </div>

        {/* Filter pills and Bulk Format Converter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
          <div className="filter-pills" style={{ margin: 0 }}>
            <button
              className={`pill-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              Todas ({scenes.length})
            </button>
            <button
              className={`pill-btn ${filterType === 'video' ? 'active' : ''}`}
              onClick={() => setFilterType('video')}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              Videos ({scenes.filter(s => s.visualType === 'video').length})
            </button>
            <button
              className={`pill-btn ${filterType === 'image' ? 'active' : ''}`}
              onClick={() => setFilterType('image')}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              Imágenes ({scenes.filter(s => s.visualType === 'image').length})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Convertir:</span>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => handleBulkConvertVisualType('video')}
              title="Convertir todas las escenas a formato Video B-Roll"
              style={{ fontSize: '10px', padding: '2px 5px', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '4px' }}
            >
              Solo Videos
            </button>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => handleBulkConvertVisualType('image')}
              title="Convertir todas las escenas a formato Imagen Conceptual"
              style={{ fontSize: '10px', padding: '2px 5px', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '4px' }}
            >
              Solo Fotos
            </button>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => handleBulkConvertVisualType('mixed')}
              title="Convertir escenas a formato mixto / combinado dinámico"
              style={{ fontSize: '10px', padding: '2px 5px', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '4px' }}
            >
              Combinada
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="search-input-wrapper">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por título, texto o toma..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            style={{ fontSize: '11px', height: '28px' }}
          />
        </div>
      </div>

      {/* Storyboard Cards List with Lightweight Virtual Windowing */}
      {(() => {
        const ITEM_ESTIMATED_HEIGHT = 200;
        const isVirtualized = filteredScenes.length > 20;
        const visibleCount = 10;
        const overscan = 5;

        const selectedIndex = selectedSceneId
          ? filteredScenes.findIndex(s => s.id === selectedSceneId || String(s.sceneNumber) === String(selectedSceneId))
          : -1;

        const baseStart = isVirtualized
          ? Math.max(0, Math.floor(scrollTop / ITEM_ESTIMATED_HEIGHT) - overscan)
          : 0;
        const baseEnd = isVirtualized
          ? Math.min(filteredScenes.length, baseStart + visibleCount + (overscan * 2))
          : filteredScenes.length;

        const startIndex = selectedIndex !== -1 ? Math.min(baseStart, Math.max(0, selectedIndex - 2)) : baseStart;
        const endIndex = selectedIndex !== -1 ? Math.max(baseEnd, Math.min(filteredScenes.length, selectedIndex + 4)) : baseEnd;

        const visibleScenes = isVirtualized
          ? filteredScenes.slice(startIndex, endIndex)
          : filteredScenes;

        const topSpacerHeight = isVirtualized ? startIndex * ITEM_ESTIMATED_HEIGHT : 0;
        const bottomSpacerHeight = isVirtualized ? (filteredScenes.length - endIndex) * ITEM_ESTIMATED_HEIGHT : 0;

        return (
          <div
            ref={listContainerRef}
            onScroll={handleListScroll}
            className="transcript-list"
            style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px`, flexShrink: 0 }} />}
            {visibleScenes.map((scene) => {
              const isCurrent = currentTime >= scene.startTime && currentTime <= scene.endTime;
              const isSelected = Boolean(
                selectedSceneId && (
                  scene.id === selectedSceneId ||
                  (scene.sceneNumber && String(scene.sceneNumber) === String(selectedSceneId))
                )
              );
              const hasAssignedMedia = Boolean(scene.assignedMediaUrl || scene.assignedAssetId);
              const hasGraphic = (project.tracks || [])
                .find(t => t.id === 'track-graphics-g1' || t.type === 'graphics')
                ?.clips?.some(c => c.sceneNumber === scene.sceneNumber || c.sceneId === scene.id);

          return (
            <div
              key={scene.id}
              id={`scene-card-${scene.id}`}
              ref={el => { if (el) cardRefs.current[scene.id] = el; }}
              className={`transcript-item scene-card ${isSelected ? 'selected' : ''} ${isCurrent ? 'active' : ''}`}
              onClick={() => {
                if (onSelectScene) {
                  onSelectScene(scene);
                } else {
                  handleJumpToScene(scene.startTime);
                }
              }}
              style={{
                cursor: 'pointer',
                borderRadius: '8px',
                border: isSelected
                  ? '1.5px solid #06b6d4'
                  : (isCurrent ? `1px solid ${scene.color || '#06b6d4'}` : '1px solid var(--border-subtle)'),
                borderLeft: `5px solid ${isSelected ? '#06b6d4' : (scene.color || '#06b6d4')}`,
                background: isSelected
                  ? 'linear-gradient(180deg, rgba(6, 182, 212, 0.14) 0%, rgba(15, 23, 42, 0.85) 100%)'
                  : (isCurrent ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)'),
                boxShadow: isSelected
                  ? '0 0 16px rgba(6, 182, 212, 0.35), 0 4px 14px rgba(0,0,0,0.5)'
                  : undefined,
                padding: isSelected ? '12px' : '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: isSelected ? '10px' : '8px',
                transition: 'all 0.18s ease'
              }}
            >
              {/* Selected Scene Header Banner */}
              {isSelected && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.25), rgba(99, 102, 241, 0.18))',
                    padding: '6px 10px',
                    borderRadius: '5px',
                    border: '1px solid rgba(6, 182, 212, 0.35)',
                    marginBottom: '2px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sliders size={13} style={{ color: '#38bdf8' }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.04em' }}>
                      PROPIEDADES DE LA ESCENA #[E{scene.sceneNumber}]
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-cyan" style={{ fontSize: '9px', padding: '1px 6px' }}>
                      Activa
                    </span>
                    {onSelectScene && (
                      <button
                        type="button"
                        className="btn-ghost icon-only"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectScene(null);
                        }}
                        title="Cerrar propiedades de escena"
                        style={{ padding: '2px', color: 'var(--text-dim)' }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Top row: Title and format badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '12px', color: isSelected ? '#38bdf8' : 'var(--text-primary)' }}>
                    [E{scene.sceneNumber}]
                  </span>
                  {isSelected ? (
                    <input
                      type="text"
                      value={scene.title || ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUpdateScene(scene.id, { title: e.target.value })}
                      placeholder="Título de la escena..."
                      className="search-input"
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        height: '26px',
                        padding: '2px 8px',
                        flex: 1,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        borderRadius: '4px'
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {scene.title}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleToggleSceneVisualType(scene.id, e)}
                    title={`Formato actual: ${scene.visualType === 'video' ? 'Video B-Roll' : 'Imagen Conceptual'}. Haz clic para alternar.`}
                    style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      background: scene.visualType === 'video' ? 'rgba(6, 182, 212, 0.18)' : 'rgba(99, 102, 241, 0.18)',
                      color: scene.visualType === 'video' ? '#06b6d4' : '#818cf8',
                      border: scene.visualType === 'video' ? '1px solid rgba(6, 182, 212, 0.35)' : '1px solid rgba(99, 102, 241, 0.35)',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {scene.visualType === 'video' ? <Video size={9} /> : <ImageIcon size={9} />}
                    {scene.visualType === 'video' ? 'VIDEO' : 'IMAGEN'}
                  </button>
                </div>

                <span className="timecode" style={{ fontSize: '10px', color: (isSelected || isCurrent) ? '#06b6d4' : 'var(--text-dim)', flexShrink: 0, marginLeft: '6px' }}>
                  [{formatTimecode(scene.startTime)} - {formatTimecode(scene.endTime)}]
                </span>
              </div>

              {/* Timing & Timeline sync bar when selected */}
              {isSelected && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0,0,0,0.25)',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    <Clock size={12} style={{ color: '#06b6d4' }} />
                    <span>Duración: <strong style={{ color: '#fff' }}>{scene.duration.toFixed(1)}s</strong></span>
                    <span style={{ color: 'var(--text-dim)' }}>({formatTimecode(scene.startTime)} → {formatTimecode(scene.endTime)})</span>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost btn-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentTime(scene.startTime);
                    }}
                    style={{ fontSize: '10px', padding: '2px 7px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Play size={10} /> Ir a Escena
                  </button>
                </div>
              )}

              {/* Script phrase */}
              {scene.scriptText && (
                <div style={isSelected ? {
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  borderLeft: '2px solid rgba(139, 92, 246, 0.5)'
                } : undefined}>
                  {isSelected && (
                    <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, marginBottom: '2px' }}>
                      Guion Narrativo / Audio
                    </div>
                  )}
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.35 }}>
                    &ldquo;{scene.scriptText}&rdquo;
                  </p>
                </div>
              )}

              {/* Visual Prompt / Shot Description */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                background: 'rgba(0,0,0,0.22)',
                padding: '7px 8px',
                borderRadius: '5px',
                border: isSelected ? '1px solid rgba(255,255,255,0.08)' : undefined
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: scene.color || '#06b6d4' }}>
                    Toma Sugerida / Prompt Visual IA
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button
                      type="button"
                      className="btn-ghost icon-only"
                      onClick={(e) => handleCopyPrompt(scene.visualDescription, scene.id, e)}
                      title="Copiar prompt visual"
                      style={{ padding: '2px' }}
                    >
                      {copiedId === scene.id ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost icon-only"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onDeleteScene) onDeleteScene(scene.id);
                      }}
                      title="Eliminar esta escena individual (Ctrl+Z para recuperar)"
                      style={{ padding: '2px' }}
                    >
                      <Trash2 size={12} className="text-dim hover-text-rose" />
                    </button>
                  </div>
                </div>

                {isSelected ? (
                  <textarea
                    value={scene.visualDescription || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleUpdateScene(scene.id, { visualDescription: e.target.value })}
                    rows={2}
                    className="search-input"
                    placeholder="Descripción cinematográfica de la toma..."
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-primary)',
                      lineHeight: 1.35,
                      height: 'auto',
                      resize: 'vertical',
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '6px',
                      borderRadius: '4px'
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {scene.visualDescription}
                  </span>
                )}
              </div>

              {/* Visual Anchor and Search Keywords */}
              {isSelected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.18)', padding: '7px 8px', borderRadius: '5px' }}>
                  {/* Visual Anchor Edit */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, width: '90px', flexShrink: 0 }}>
                      🎯 Ancla Visual:
                    </span>
                    <input
                      type="text"
                      value={scene.visualAnchor || ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUpdateScene(scene.id, { visualAnchor: e.target.value })}
                      placeholder="Elemento focal principal..."
                      className="search-input"
                      style={{
                        fontSize: '10px',
                        color: '#f59e0b',
                        height: '24px',
                        padding: '2px 6px',
                        flex: 1,
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: '3px'
                      }}
                    />
                  </div>

                  {/* Keywords Chips + Add input */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, width: '90px', flexShrink: 0, paddingTop: '3px' }}>
                      🔍 Palabras Clave:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', flex: 1 }}>
                      {(scene.searchKeywords || []).map((kw, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: '9px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: '#cbd5e1',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const updated = (scene.searchKeywords || []).filter((_, idx) => idx !== i);
                              handleUpdateScene(scene.id, { searchKeywords: updated });
                            }}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '10px' }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder="+ Tag (Enter)"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            e.preventDefault();
                            e.stopPropagation();
                            const val = e.target.value.trim();
                            const cur = scene.searchKeywords || [];
                            if (!cur.includes(val)) {
                              handleUpdateScene(scene.id, { searchKeywords: [...cur, val] });
                            }
                            e.target.value = '';
                          }
                        }}
                        style={{
                          fontSize: '9px',
                          background: 'transparent',
                          border: '1px dashed rgba(255,255,255,0.2)',
                          color: 'var(--text-secondary)',
                          borderRadius: '3px',
                          padding: '1px 5px',
                          width: '75px',
                          height: '18px'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                (scene.visualAnchor || (Array.isArray(scene.searchKeywords) && scene.searchKeywords.length > 0)) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', paddingTop: '2px' }}>
                    {scene.visualAnchor && (
                      <span style={{
                        fontSize: '9px',
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontWeight: 600
                      }}>
                        🎯 {scene.visualAnchor}
                      </span>
                    )}
                    {Array.isArray(scene.searchKeywords) && scene.searchKeywords.slice(0, 4).map((kw, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '9px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: '#94a3b8',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          padding: '1px 4px',
                          borderRadius: '3px'
                        }}
                      >
                        🔍 {kw}
                      </span>
                    ))}
                  </div>
                )
              )}

              {/* Media Preview & Critique if populated */}
              {hasAssignedMedia && (
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  <div style={{
                    width: '68px',
                    height: '46px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    background: '#000',
                    flexShrink: 0,
                    position: 'relative'
                  }}>
                    <img
                      src={scene.assignedThumbnail || scene.assignedMediaUrl}
                      alt={scene.assignedTitle}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      background: 'rgba(0,0,0,0.75)',
                      fontSize: '8px',
                      padding: '1px 3px',
                      borderRadius: '2px',
                      color: '#fff'
                    }}>
                      {scene.visualType === 'video' ? '▶' : '🖼'}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-emerald" style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <CheckCircle2 size={10} /> En Disco
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={scene.assignedTitle}>
                        {scene.assignedTitle || 'broll.mp4'}
                      </span>
                    </div>

                    {scene.curatorCritique?.winnerReason && (
                      <p style={{ margin: 0, fontSize: '10px', color: '#38bdf8', lineHeight: 1.25, fontStyle: 'italic' }}>
                        &ldquo;{scene.curatorCritique.winnerReason}&rdquo;
                      </p>
                    )}

                    {isSelected && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button
                          type="button"
                          className="btn-ghost btn-xs text-rose"
                          onClick={(e) => handleUnassignBroll(scene.id, e)}
                          style={{ fontSize: '9px', padding: '1px 5px', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '3px' }}
                        >
                          Quitar B-Roll
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* B-Roll & Actions Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                flexWrap: 'wrap',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {!isSelected && (
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectScene) {
                          onSelectScene(scene);
                        } else {
                          handleJumpToScene(scene.startTime);
                        }
                      }}
                      style={{
                        fontSize: '10px',
                        padding: '2px 7px',
                        color: '#38bdf8',
                        background: 'rgba(6, 182, 212, 0.1)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 600
                      }}
                    >
                      <Sliders size={11} />
                      Propiedades
                    </button>
                  )}

                  {scene.candidateAlternatives && scene.candidateAlternatives.length > 0 && (
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSceneAlternatives(prev => prev === scene.id ? null : scene.id);
                      }}
                      style={{
                        fontSize: '10px',
                        padding: '2px 7px',
                        color: '#c084fc',
                        background: expandedSceneAlternatives === scene.id ? 'rgba(192, 132, 252, 0.2)' : 'rgba(192, 132, 252, 0.08)',
                        border: '1px solid rgba(192, 132, 252, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Sparkles size={11} />
                      {scene.candidateAlternatives.length} Alternativas IA {expandedSceneAlternatives === scene.id ? '▲' : '▼'}
                    </button>
                  )}

                  {scene.visualCollagePreview && (
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewCollageModal({
                          sceneTitle: scene.title,
                          collageDataUrl: scene.visualCollagePreview,
                          critique: scene.curatorCritique
                        });
                      }}
                      title="Ver el collage visual analizado por la IA"
                      style={{ fontSize: '10px', padding: '2px 6px', color: '#38bdf8' }}
                    >
                      <Eye size={11} /> Collage
                    </button>
                  )}

                  {!hasAssignedMedia && (!scene.candidateAlternatives || scene.candidateAlternatives.length === 0) && (
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <HardDrive size={10} /> Sin video asignado
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {onOpenGraphicForScene && (
                    <button
                      type="button"
                      className="btn-secondary btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        const realPos = resolveRealSceneTimelinePosition(scene, project);
                        onOpenGraphicForScene({
                          ...scene,
                          startTime: realPos.startTime,
                          duration: realPos.duration,
                          isTimelineClip: true
                        });
                      }}
                      title={hasGraphic ? "Editar Efecto Visual / Motion Graphic de esta escena en Pista G1" : "Generar Efecto Visual IA para esta escena en Pista G1"}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        borderColor: hasGraphic ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255,255,255,0.15)',
                        background: hasGraphic ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255,255,255,0.04)',
                        color: hasGraphic ? '#38bdf8' : 'var(--text-secondary)'
                      }}
                    >
                      <Sparkles size={11} style={{ color: hasGraphic ? '#38bdf8' : '#a855f7' }} />
                      <span>{hasGraphic ? 'Efecto G1' : 'Efecto Visual'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className={hasAssignedMedia ? "btn-secondary btn-xs" : "btn-primary btn-xs"}
                    onClick={(e) => {
                      e.stopPropagation();
                      const realPos = resolveRealSceneTimelinePosition(scene, project);
                      setSelectedSceneForBroll({
                        ...scene,
                        startTime: realPos.startTime,
                        duration: realPos.duration,
                        endTime: Number((realPos.startTime + realPos.duration).toFixed(2))
                      });
                    }}
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: hasAssignedMedia ? undefined : 'linear-gradient(135deg, #06b6d4, #6366f1)'
                    }}
                  >
                    {hasAssignedMedia ? (
                      <>
                        <RefreshCw size={10} />
                        Cambiar B-Roll
                      </>
                    ) : (
                      <>
                        <Search size={10} />
                        Buscar B-Roll
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable Alternatives Drawer */}
              {expandedSceneAlternatives === scene.id && scene.candidateAlternatives?.length > 0 && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#070a12',
                    border: '1px solid rgba(192, 132, 252, 0.3)',
                    borderRadius: '6px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#c084fc', fontWeight: 600 }}>
                    <span>OPCIONES ALTERNATIVAS EVALUADAS POR EL AGENTE:</span>
                    <span style={{ color: 'var(--text-dim)' }}>Haz clic en &apos;Usar&apos; para reemplazar</span>
                  </div>

                  {scene.candidateAlternatives.map((alt, altIdx) => (
                    <div
                      key={altIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '4px',
                        padding: '6px'
                      }}
                    >
                      <div style={{ width: '56px', height: '36px', borderRadius: '3px', overflow: 'hidden', background: '#000', flexShrink: 0 }}>
                        <img
                          src={alt.thumbnail || alt.previewUrl}
                          alt={alt.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          [Opción #{alt.candidateIndex || altIdx + 2}] {alt.title}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.2 }}>
                          {alt.alternativeReason || 'Alternativa evaluada por la IA'}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-primary btn-xs"
                        disabled={isSwappingAlternative}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setIsSwappingAlternative(true);
                          try {
                            const { updatedProject } = await switchSceneAlternative({
                              project,
                              sceneId: scene.id,
                              alternativeMediaItem: alt
                            });
                            if (onUpdateProject) onUpdateProject(updatedProject);
                          } catch (swapErr) {
                            console.error('Error swapping alternative:', swapErr);
                          } finally {
                            setIsSwappingAlternative(false);
                          }
                        }}
                        style={{
                          fontSize: '10px',
                          padding: '3px 8px',
                          background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                          flexShrink: 0
                        }}
                      >
                        {isSwappingAlternative ? '...' : 'Usar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
            {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px`, flexShrink: 0 }} />}
          </div>
        );
      })()}

      {/* Individual Scene B-Roll Search Modal */}
      {selectedSceneForBroll && (
        <StockMediaSearchModal
          isOpen={Boolean(selectedSceneForBroll)}
          onClose={() => setSelectedSceneForBroll(null)}
          scene={selectedSceneForBroll}
          project={project}
          onMediaAssigned={(updatedProj) => {
            if (onUpdateProject) onUpdateProject(updatedProj);
          }}
        />
      )}

      {/* Batch Auto-Populate Modal */}
      {showBatchModal && (
        <AutoBrollBatchModal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          project={project}
          onBatchComplete={(updatedProj) => {
            if (onUpdateProject) onUpdateProject(updatedProj);
          }}
        />
      )}

      {/* Visual Collage Preview Modal */}
      {previewCollageModal && (
        <div className="modal-backdrop" onClick={() => setPreviewCollageModal(null)} style={{ zIndex: 1200 }}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '840px',
              maxWidth: '92vw',
              maxHeight: '90vh',
              background: '#090d16',
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} style={{ color: '#06b6d4' }} />
                <h4 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>
                  Collage de Evaluación Visual IA: {previewCollageModal.sceneTitle}
                </h4>
              </div>
              <button className="btn-ghost icon-only" onClick={() => setPreviewCollageModal(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ borderRadius: '6px', overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img
                src={previewCollageModal.collageDataUrl}
                alt="Collage analizado por IA"
                style={{ width: '100%', maxHeight: '62vh', objectFit: 'contain' }}
              />
            </div>

            {previewCollageModal.critique && (
              <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '10px 12px', borderRadius: '6px', fontSize: '11px', color: '#e2e8f0' }}>
                <strong style={{ color: '#10b981' }}>Criterio de Elección del Agente: </strong>
                {previewCollageModal.critique.winnerReason}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.selectedSceneId !== next.selectedSceneId) return false;
  if (prev.onSelectScene !== next.onSelectScene) return false;
  if (prev.project !== next.project) return false;
  const getActiveSceneId = (props) => {
    const sceneTrack = (props.project?.tracks || []).find(t => t.type === 'scene');
    if (sceneTrack && Array.isArray(sceneTrack.clips)) {
      const c = sceneTrack.clips.find(clip => props.currentTime >= clip.startTime && props.currentTime <= (clip.startTime + clip.duration));
      if (c) return c.sceneId || c.id;
    }
    const scenes = props.project?.scenes?.list || [];
    return scenes.find(s => props.currentTime >= s.startTime && props.currentTime <= s.endTime)?.id;
  };
  return getActiveSceneId(prev) === getActiveSceneId(next);
});


