import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Search,
  Copy,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
  Type,
  Edit2,
  X
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';
import {
  generateSubtitlesTrackFromTranscript,
  toggleSubtitlesTrackVisibility,
  applyGlobalSubtitleStyle,
  getDefaultSubtitleSettings,
  updateTranscriptSegmentAndSync,
  SUBTITLE_TRACK_ID
} from '../utils/transcriptOps';
import { SUBTITLE_STYLE_PRESETS } from '../utils/graphicEngine';

export const TranscriptPanel = React.memo(function TranscriptPanel({
  project,
  currentTime,
  onSeekToTime,
  onOpenTranscribeModal,
  onUpdateProject
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [editingSegId, setEditingSegId] = useState(null);
  const [editingSegText, setEditingSegText] = useState('');
  const listContainerRef = useRef(null);

  const handleStartEditSeg = (e, seg) => {
    e.stopPropagation();
    setEditingSegId(seg.id);
    setEditingSegText(seg.text || seg.name || '');
  };

  const handleSaveSegText = (segId) => {
    const trimmed = editingSegText.trim();
    setEditingSegId(null);
    if (!trimmed || !onUpdateProject) return;

    const updated = updateTranscriptSegmentAndSync(project, segId, { text: trimmed });
    onUpdateProject(updated);
  };

  const handleCancelEditSeg = () => {
    setEditingSegId(null);
    setEditingSegText('');
  };

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };

  const guideTrack = (project.tracks || []).find((t) => t.type === 'guide');
  const segments = guideTrack?.clips || project.transcript?.segments || [];

  const subTrack = (project.tracks || []).find(
    (t) => t.id === SUBTITLE_TRACK_ID || t.isSubtitleTrack
  );
  const hasSubtitles = Boolean(subTrack && (subTrack.clips || []).length > 0);
  const isSubtitlesVisible = hasSubtitles && subTrack.visible !== false;
  const currentStyleId = project.subtitleSettings?.styleId || 'hormozi_active';
  const applyToAll = project.subtitleSettings?.applyToAll !== false;
  const currentChunkMode = project.subtitleSettings?.chunkMode || 'smart';
  const [justRegenerated, setJustRegenerated] = useState(false);

  const handleRegenerateSubtitles = (overrideSettings = {}) => {
    if (!onUpdateProject) return;
    const currentSettings = project.subtitleSettings || getDefaultSubtitleSettings(project);
    const updated = generateSubtitlesTrackFromTranscript(project, {
      ...currentSettings,
      ...overrideSettings,
      enabled: true
    });
    onUpdateProject(updated);
    setJustRegenerated(true);
    setTimeout(() => setJustRegenerated(false), 2200);
  };

  const handleChunkModeChange = (chunkMode) => {
    if (!onUpdateProject) return;
    const currentSettings = project.subtitleSettings || getDefaultSubtitleSettings(project);
    const updated = generateSubtitlesTrackFromTranscript(project, {
      ...currentSettings,
      chunkMode,
      enabled: true
    });
    onUpdateProject(updated);
    setJustRegenerated(true);
    setTimeout(() => setJustRegenerated(false), 2200);
  };

  const handleToggleSubtitles = () => {
    if (!onUpdateProject) return;
    const updated = toggleSubtitlesTrackVisibility(project);
    onUpdateProject(updated);
  };

  const handleStyleChange = (styleId) => {
    if (!onUpdateProject) return;
    const updated = applyGlobalSubtitleStyle(project, { styleId });
    onUpdateProject(updated);
  };

  const handleToggleApplyToAll = (newVal) => {
    if (!onUpdateProject) return;
    onUpdateProject({
      ...project,
      subtitleSettings: {
        ...getDefaultSubtitleSettings(project),
        ...(project.subtitleSettings || {}),
        applyToAll: newVal
      }
    });
  };

  const filteredSegments = segments.filter((seg) => {
    if (!searchQuery.trim()) return true;
    const text = seg.text || seg.name || '';
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleCopyFullText = () => {
    const fullText = segments
      .map((s) => `[${formatTimecode(s.startTime || s.start)}] ${s.text || s.name}`)
      .join('\n');
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (segments.length === 0) {
    return (
      <div className="inspector-empty" style={{ padding: '36px 16px' }}>
        <div className="modal-icon-badge" style={{ background: '#8b5cf626', width: '48px', height: '48px' }}>
          <Sparkles size={24} style={{ color: '#8b5cf6' }} />
        </div>
        <h4>Sin Guion o Transcripción</h4>
        <p style={{ maxWidth: '280px', margin: '0 auto', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Extrae automáticamente el guion y marcas de tiempo del audio o video con Inteligencia Artificial.
        </p>
        <button
          className="btn-primary btn-sm"
          style={{ marginTop: '12px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
          onClick={onOpenTranscribeModal}
        >
          <Sparkles size={14} />
          Transcribir con IA
        </button>
      </div>
    );
  }

  const ITEM_ESTIMATED_HEIGHT = 64;
  const isVirtualized = filteredSegments.length > 25;
  const viewportHeight = 600;
  const overscan = 8;

  const startIndex = isVirtualized ? Math.max(0, Math.floor(scrollTop / ITEM_ESTIMATED_HEIGHT) - overscan) : 0;
  const endIndex = isVirtualized
    ? Math.min(filteredSegments.length, Math.ceil((scrollTop + viewportHeight) / ITEM_ESTIMATED_HEIGHT) + overscan)
    : filteredSegments.length;

  const visibleSegments = isVirtualized ? filteredSegments.slice(startIndex, endIndex) : filteredSegments;
  const topSpacerHeight = isVirtualized ? startIndex * ITEM_ESTIMATED_HEIGHT : 0;
  const bottomSpacerHeight = isVirtualized ? (filteredSegments.length - endIndex) * ITEM_ESTIMATED_HEIGHT : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Header Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '10px'
        }}
      >
        <div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
            Guion Transcrito
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            {segments.length} frases • Línea Guía activa
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="btn-ghost icon-only btn-xs"
            title="Copiar guion completo"
            onClick={handleCopyFullText}
          >
            {copied ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
          </button>
          <button
            className="btn-secondary btn-xs"
            title="Volver a transcribir audio con IA (Whisper o Gemini)"
            onClick={onOpenTranscribeModal}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RotateCcw size={12} />
            <span>Re-Transcribir</span>
          </button>
        </div>
      </div>

      {/* Subtitles S1 Control Card */}
      <div
        style={{
          background: isSubtitlesVisible ? 'rgba(234, 179, 8, 0.1)' : '#161922',
          border: isSubtitlesVisible ? '1px solid rgba(234, 179, 8, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '800',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isSubtitlesVisible ? '#eab308' : '#242b3b',
                color: isSubtitlesVisible ? '#000000' : '#94a3b8'
              }}
            >
              CC
            </span>
            <span style={{ fontSize: '12px', fontWeight: '600', color: isSubtitlesVisible ? '#fef08a' : '#cbd5e1' }}>
              Subtítulos en Pantalla (S1)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handleToggleSubtitles}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: '600',
                borderRadius: '4px',
                border: isSubtitlesVisible ? '1px solid #eab308' : '1px solid rgba(255,255,255,0.15)',
                background: isSubtitlesVisible ? '#eab308' : 'transparent',
                color: isSubtitlesVisible ? '#000000' : '#e2e8f0',
                cursor: 'pointer'
              }}
            >
              {isSubtitlesVisible ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>{isSubtitlesVisible ? 'Visibles' : 'Mostrar'}</span>
            </button>
          </div>
        </div>

        {/* Action Button: Volver a Subtitular / Regenerar */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => handleRegenerateSubtitles()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: '700',
              borderRadius: '5px',
              border: justRegenerated ? '1px solid #10b981' : '1px solid rgba(234, 179, 8, 0.45)',
              background: justRegenerated ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.16)',
              color: justRegenerated ? '#34d399' : '#fef08a',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title="Volver a generar todos los subtítulos en la pista S1 a partir del guion actual respetando tiempos y estilo"
          >
            {justRegenerated ? <Check size={13} className="text-emerald" /> : <RotateCcw size={13} />}
            <span>{justRegenerated ? '¡Subtítulos Regenerados!' : 'Volver a Subtitular'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenTranscribeModal}
            className="btn-secondary btn-xs"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 8px',
              fontSize: '11px',
              borderRadius: '5px'
            }}
            title="Volver a transcribir con IA (Whisper o Gemini) si modificaste cortes de audio o clips"
          >
            <Sparkles size={12} style={{ color: '#c084fc' }} />
            <span>Re-Transcribir</span>
          </button>
        </div>

        {/* Controls Grid: ChunkMode & Preset Style */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Corte / Ritmo:</span>
            <select
              value={currentChunkMode}
              onChange={(e) => handleChunkModeChange(e.target.value)}
              style={{
                background: '#0d1117',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '11px',
                padding: '4px 6px',
                borderRadius: '4px',
                outline: 'none'
              }}
            >
              <option value="smart">Dinámico (4-6 palabras)</option>
              <option value="segment">Frases completas</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Estilo Viral:</span>
            <select
              value={currentStyleId}
              onChange={(e) => handleStyleChange(e.target.value)}
              style={{
                background: '#0d1117',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '11px',
                padding: '4px 6px',
                borderRadius: '4px',
                outline: 'none'
              }}
            >
              {SUBTITLE_STYLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CapCut Apply to All Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '6px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              userSelect: 'none'
            }}
            title="Al editar un subtítulo, sincroniza automáticamente el estilo, color, fuente y posición en todos los subtítulos (modo CapCut)"
          >
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => handleToggleApplyToAll(e.target.checked)}
              style={{ accentColor: '#eab308', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', color: applyToAll ? '#fef08a' : '#94a3b8', fontWeight: applyToAll ? '600' : '400' }}>
              Aplicar cambios a todos (CapCut)
            </span>
          </label>
          <span style={{
            fontSize: '9px',
            color: applyToAll ? '#eab308' : '#64748b',
            background: applyToAll ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            padding: '2px 5px',
            borderRadius: '4px',
            fontWeight: '700'
          }}>
            {applyToAll ? 'GLOBAL' : 'INDIVIDUAL'}
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-dim)' }} />
        <input
          type="text"
          placeholder="Buscar palabras en el guion..."
          className="input-field"
          style={{ paddingLeft: '30px', fontSize: '12px' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Transcript Items List */}
      <div
        ref={listContainerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}
      >
        {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px`, flexShrink: 0 }} />}
        {visibleSegments.map((seg) => {
          const segStart = seg.startTime !== undefined ? seg.startTime : seg.start;
          const segDur = seg.duration !== undefined ? seg.duration : (seg.end - seg.start);
          const segEnd = segStart + segDur;
          const isCurrent = currentTime >= segStart && currentTime <= segEnd;
          const text = seg.text || seg.name || '';

          const isEditingThis = editingSegId === seg.id;

          return (
            <div
              key={seg.id}
              onClick={() => onSeekToTime(segStart)}
              onDoubleClick={(e) => handleStartEditSeg(e, seg)}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isCurrent ? 'rgba(139, 92, 246, 0.18)' : 'var(--bg-surface)',
                border: isEditingThis ? '1.5px solid #3898ff' : (isCurrent ? '1px solid #a855f7' : '1px solid var(--border-subtle)'),
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  className="timecode"
                  style={{
                    color: isCurrent ? '#c084fc' : '#8b5cf6',
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  {formatTimecode(segStart)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                    {segDur.toFixed(1)}s
                  </span>
                  {!isEditingThis && (
                    <button
                      type="button"
                      className="btn-ghost icon-only btn-micro"
                      title="Editar palabras de esta frase (o doble clic)"
                      onClick={(e) => handleStartEditSeg(e, seg)}
                      style={{ padding: '2px', opacity: 0.6 }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                    >
                      <Edit2 size={10} className="text-secondary" />
                    </button>
                  )}
                </div>
              </div>

              {isEditingThis ? (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <textarea
                    autoFocus
                    rows={2}
                    value={editingSegText}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setEditingSegText(nextVal);
                      if (onUpdateProject) {
                        const updated = updateTranscriptSegmentAndSync(project, seg.id, { text: nextVal });
                        onUpdateProject(updated);
                      }
                    }}
                    onBlur={() => handleSaveSegText(seg.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveSegText(seg.id);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelEditSeg();
                      }
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input, #0d1117)',
                      border: '1px solid #3898ff',
                      borderRadius: '4px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      lineHeight: '1.4',
                      padding: '6px 8px',
                      resize: 'vertical',
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={handleCancelEditSeg}
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-primary btn-xs"
                      onClick={() => handleSaveSegText(seg.id)}
                      style={{ fontSize: '10px', padding: '2px 8px', background: '#10b981' }}
                    >
                      <Check size={11} />
                      <span>Guardar</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  title="Doble clic para editar palabras"
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: isCurrent ? '#f3e8ff' : 'var(--text-secondary)',
                    lineHeight: '1.4'
                  }}
                >
                  {text}
                </p>
              )}
            </div>
          );
        })}
        {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px`, flexShrink: 0 }} />}
      </div>
    </div>
  );
});
