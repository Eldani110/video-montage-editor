import React, { useState } from 'react';
import {
  Sparkles,
  FileText,
  Search,
  Clock,
  Play,
  Copy,
  Check,
  RotateCcw
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';

export const TranscriptPanel = React.memo(function TranscriptPanel({ project, currentTime, onSeekToTime, onOpenTranscribeModal }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const guideTrack = (project.tracks || []).find(t => t.type === 'guide');
  const segments = guideTrack?.clips || project.transcript?.segments || [];

  const filteredSegments = segments.filter((seg) => {
    if (!searchQuery.trim()) return true;
    const text = seg.text || seg.name || '';
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleCopyFullText = () => {
    const fullText = segments.map(s => `[${formatTimecode(s.startTime || s.start)}] ${s.text || s.name}`).join('\n');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Header Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
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
            title="Volver a transcribir"
            onClick={onOpenTranscribeModal}
          >
            <RotateCcw size={12} />
          </button>
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
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
        {filteredSegments.map((seg) => {
          const segStart = seg.startTime !== undefined ? seg.startTime : seg.start;
          const segDur = seg.duration !== undefined ? seg.duration : (seg.end - seg.start);
          const segEnd = segStart + segDur;
          const isCurrent = currentTime >= segStart && currentTime <= segEnd;
          const text = seg.text || seg.name || '';

          return (
            <div
              key={seg.id}
              onClick={() => onSeekToTime(segStart)}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isCurrent ? 'rgba(139, 92, 246, 0.18)' : 'var(--bg-surface)',
                border: isCurrent ? '1px solid #a855f7' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
              title="Haz clic para saltar a este momento en la línea de tiempo"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  className="timecode"
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: isCurrent ? '#c084fc' : '#8b5cf6'
                  }}
                >
                  {formatTimecode(segStart)}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                  {segDur.toFixed(1)}s
                </span>
              </div>
              <p
                style={{
                  fontSize: '12px',
                  lineHeight: '1.4',
                  margin: 0,
                  color: isCurrent ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: isCurrent ? 500 : 400
                }}
              >
                {text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}, (prev, next) => {
  if (prev.project !== next.project) return false;
  const getActiveId = (props) => {
    const guideTrack = (props.project?.tracks || []).find(t => t.type === 'guide');
    const segments = guideTrack?.clips || props.project?.transcript?.segments || [];
    return segments.find(s => {
      const start = s.startTime !== undefined ? s.startTime : s.start;
      const dur = s.duration !== undefined ? s.duration : (s.end - s.start);
      return props.currentTime >= start && props.currentTime <= (start + dur);
    })?.id;
  };
  return getActiveId(prev) === getActiveId(next);
});
