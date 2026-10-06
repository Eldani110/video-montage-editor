import React, { useRef, useState } from 'react';
import {
  computeGraphicAnimationState,
  FONT_OPTIONS
} from '../utils/graphicEngine.js';
import { Move, Check, Sparkles } from 'lucide-react';

export function AnimatedGraphicOverlay({
  clip,
  currentTime,
  isSelected = false,
  onSelect = null,
  onUpdatePosition = null,
  stageDimensions = { width: 1280, height: 720 }
}) {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!clip || !clip.isGraphic) return null;

  const anim = computeGraphicAnimationState(clip, currentTime);
  if (!anim.isVisible || anim.opacity <= 0) return null;

  // Calculate resolution-independent preview scale relative to reference 1280 (or 720 for vertical 9:16)
  const stageW = stageDimensions?.width || 1280;
  const stageH = stageDimensions?.height || 720;
  const isVertical = stageH > stageW;
  const refW = isVertical ? 720 : 1280;
  const previewScale = Math.max(0.1, stageW / refW);

  const fontFam = clip.fontFamily || 'Outfit';
  const fontSize = clip.fontSize || 42;
  const accentColor = clip.accentColor || '#06b6d4';
  const textColor = clip.textColor || '#ffffff';
  const shadowBlur = clip.textShadowBlur !== undefined ? clip.textShadowBlur : 18;
  const shadowOffsetY = clip.textShadowOffsetY !== undefined ? clip.textShadowOffsetY : 4;
  const isDocType = ['doc_chapter', 'doc_stat', 'doc_date', 'doc_timeline'].includes(clip.graphicType);
  const defaultShadow = isDocType ? 'rgba(0, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.85)';
  const shadowColor = clip.textShadowColor || defaultShadow;

  let titleText = clip.title || '';
  if (clip.textTransform === 'uppercase') {
    titleText = titleText.toUpperCase();
  }
  if (anim.typewriterRatio < 1.0) {
    const charsToShow = Math.floor(titleText.length * anim.typewriterRatio);
    titleText = titleText.substring(0, charsToShow);
  }

  // Handle Dragging on Canvas with normalized delta scaling
  const handleMouseDown = (e) => {
    e.stopPropagation();
    if (onSelect) onSelect(clip.id);

    if (!onUpdatePosition) return;

    setIsDragging(true);
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialPosX = clip.position?.x || 0;
    const initialPosY = clip.position?.y || 0;

    const handleMouseMove = (moveEvt) => {
      const deltaX = (moveEvt.clientX - startClientX) / previewScale;
      const deltaY = (moveEvt.clientY - startClientY) / previewScale;
      onUpdatePosition(clip.id, {
        position: {
          ...(clip.position || {}),
          x: Math.round(initialPosX + deltaX),
          y: Math.round(initialPosY + deltaY)
        }
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const transformStyle = `translate(${anim.offsetX * previewScale}px, ${anim.offsetY * previewScale}px) scale(${anim.scale * previewScale}) ${anim.rotate ? `rotate(${anim.rotate}deg)` : ''}`;

  return (
    <div
      ref={containerRef}
      className={`animated-graphic-overlay-wrapper ${isSelected ? 'is-selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(clip.id);
      }}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) ${transformStyle}`,
        transformOrigin: 'center center',
        width: 'max-content',
        maxWidth: `${refW}px`,
        opacity: anim.opacity,
        zIndex: 50,
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        pointerEvents: 'auto',
        transition: isDragging ? 'none' : 'transform 0.05s ease-out'
      }}
    >
      {/* Selection Bounding Box Indicator */}
      {isSelected && (
        <div
          className="graphic-selection-outline"
          style={{
            position: 'absolute',
            inset: '-10px',
            border: '1.5px dashed #06b6d4',
            borderRadius: '12px',
            pointerEvents: 'none',
            boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-14px',
              left: '8px',
              background: '#06b6d4',
              color: '#000000',
              fontSize: '10px',
              fontWeight: '700',
              padding: '1px 6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Move size={10} />
            <span>{clip.name || 'Gráfico'} • Arrastra para mover</span>
          </div>
        </div>
      )}

      {/* Render Component According to Graphic Type */}
      {clip.graphicType === 'doc_chapter' && (
        <div
          style={{
            textAlign: 'center',
            maxWidth: '920px',
            padding: '12px 24px',
            background: clip.backdropGlass ? (clip.bgColor || 'rgba(0, 0, 0, 0.65)') : 'transparent',
            backdropFilter: clip.backdropGlass ? 'blur(12px)' : 'none',
            borderRadius: clip.backdropGlass ? '16px' : '0',
            border: clip.backdropGlass ? `1px solid ${clip.borderColor || 'rgba(255, 255, 255, 0.15)'}` : 'none'
          }}
        >
          {/* Chapter Prefix e.g. "Capítulo 1:" */}
          {(clip.chapterPrefix || clip.badgeText) && (
            <div
              style={{
                fontFamily: fontFam,
                fontSize: `${Math.max(18, Math.round(fontSize * 0.52))}px`,
                fontWeight: '600',
                color: '#ffffff',
                opacity: 0.95,
                textShadow: `0 2px 4px rgba(0, 0, 0, 0.9), 0 4px 14px rgba(0, 0, 0, 0.85)`,
                marginBottom: '4px',
                letterSpacing: '0.01em'
              }}
            >
              {clip.chapterPrefix || clip.badgeText}
            </div>
          )}

          {/* Main Chapter Title e.g. "El auge del dinero digital" */}
          <div
            style={{
              fontFamily: fontFam,
              fontSize: `${fontSize}px`,
              fontWeight: '800',
              color: textColor || '#ffffff',
              lineHeight: '1.15',
              letterSpacing: `${clip.letterSpacing || 0}px`,
              textShadow: `${shadowColor} 0px ${shadowOffsetY}px ${shadowBlur}px, 0 2px 4px rgba(0, 0, 0, 0.95)`
            }}
          >
            {titleText || 'El auge del dinero digital'}
          </div>

          {clip.subtitle && (
            <div
              style={{
                fontFamily: fontFam,
                fontSize: `${Math.max(14, Math.round(fontSize * 0.38))}px`,
                fontWeight: '500',
                color: '#e2e8f0',
                marginTop: '10px',
                textShadow: `${shadowColor} 0px 2px 8px, 0 1px 3px rgba(0, 0, 0, 0.9)`
              }}
            >
              {clip.subtitle}
            </div>
          )}
        </div>
      )}

      {clip.graphicType === 'doc_stat' && (
        <div
          style={{
            textAlign: 'center',
            maxWidth: '960px',
            padding: '12px 24px',
            background: clip.backdropGlass ? (clip.bgColor || 'rgba(0, 0, 0, 0.65)') : 'transparent',
            backdropFilter: clip.backdropGlass ? 'blur(12px)' : 'none',
            borderRadius: clip.backdropGlass ? '16px' : '0'
          }}
        >
          {/* Cifra de Impacto / Estadística e.g. "800.000.000 de personas" */}
          <div
            style={{
              fontFamily: fontFam,
              fontSize: `${Math.round(fontSize * 1.18)}px`,
              fontWeight: '800',
              lineHeight: '1.12',
              letterSpacing: `${clip.letterSpacing || 0}px`,
              textShadow: `${shadowColor} 0px ${shadowOffsetY}px ${shadowBlur}px, 0 2px 4px rgba(0, 0, 0, 0.95)`,
              display: 'inline-flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            {clip.statNumber && clip.statText ? (
              <>
                <span style={{ color: clip.accentColor || '#facc15' }}>
                  {clip.statNumber}
                </span>
                <span style={{ color: clip.textColor || clip.accentColor || '#facc15' }}>
                  {clip.statText}
                </span>
              </>
            ) : (
              <span style={{ color: clip.accentColor || '#facc15' }}>
                {titleText || '800.000.000 de personas'}
              </span>
            )}
          </div>

          {clip.subtitle && (
            <div
              style={{
                fontFamily: fontFam,
                fontSize: `${Math.max(14, Math.round(fontSize * 0.38))}px`,
                fontWeight: '500',
                color: '#ffffff',
                marginTop: '10px',
                textShadow: `${shadowColor} 0px 2px 8px, 0 1px 3px rgba(0, 0, 0, 0.9)`
              }}
            >
              {clip.subtitle}
            </div>
          )}
        </div>
      )}

      {clip.graphicType === 'doc_date' && (
        <div
          style={{
            textAlign: 'center',
            maxWidth: '920px',
            padding: '12px 24px',
            background: clip.backdropGlass ? (clip.bgColor || 'rgba(0, 0, 0, 0.65)') : 'transparent',
            backdropFilter: clip.backdropGlass ? 'blur(12px)' : 'none',
            borderRadius: clip.backdropGlass ? '16px' : '0'
          }}
        >
          {/* Fecha / Hito Histórico e.g. "15 Septiembre 2008" */}
          <div
            style={{
              fontFamily: fontFam,
              fontSize: `${Math.round(fontSize * 1.15)}px`,
              fontWeight: '800',
              color: clip.textColor || clip.accentColor || '#22c55e',
              lineHeight: '1.15',
              letterSpacing: `${clip.letterSpacing || 0}px`,
              textShadow: `${shadowColor} 0px ${shadowOffsetY}px ${shadowBlur}px, 0 2px 4px rgba(0, 0, 0, 0.95)`
            }}
          >
            {titleText || '15 Septiembre 2008'}
          </div>

          {clip.subtitle && (
            <div
              style={{
                fontFamily: fontFam,
                fontSize: `${Math.max(15, Math.round(fontSize * 0.42))}px`,
                fontWeight: '600',
                color: '#ffffff',
                marginTop: '8px',
                textShadow: `0 2px 6px rgba(0, 0, 0, 0.9)`
              }}
            >
              {clip.subtitle}
            </div>
          )}
        </div>
      )}

      {clip.graphicType === 'doc_timeline' && (
        <div
          style={{
            width: '840px',
            maxWidth: '94vw',
            padding: '24px 20px',
            background: clip.backdropGlass ? (clip.bgColor || 'rgba(8, 16, 32, 0.75)') : 'transparent',
            backdropFilter: clip.backdropGlass ? 'blur(12px)' : 'none',
            borderRadius: clip.backdropGlass ? '18px' : '0',
            position: 'relative'
          }}
        >
          {/* Horizontal Timeline Bar */}
          <div
            style={{
              position: 'relative',
              height: '4px',
              margin: '38px 30px',
              background: `linear-gradient(90deg, transparent 0%, ${clip.accentColor || '#0284c7'} 15%, ${clip.accentColor || '#0284c7'} 85%, transparent 100%)`,
              boxShadow: `0 0 12px ${(clip.accentColor || '#0284c7')}88`
            }}
          >
            {/* Milestones along axis */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0 40px'
              }}
            >
              {(clip.milestones && clip.milestones.length > 0 ? clip.milestones : [
                { date: '1975', label: 'Homebrew Club', active: false },
                { date: '1976', label: 'Apple I', active: false },
                { date: '1981', label: 'IBM PC', active: true }
              ]).map((m, idx) => {
                const isActive = m.active;
                const timelineColor = clip.accentColor || '#0284c7';
                return (
                  <div
                    key={idx}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    {/* Year Above */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '16px',
                        fontFamily: fontFam,
                        fontStyle: 'italic',
                        fontSize: `${Math.max(22, Math.round(fontSize * 0.65))}px`,
                        fontWeight: '800',
                        color: isActive ? '#38bdf8' : '#ffffff',
                        textShadow: `0 2px 4px rgba(0, 0, 0, 0.95), 0 4px 14px rgba(0, 0, 0, 0.9)`,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {m.date}
                    </div>

                    {/* Node Dot */}
                    <div
                      style={{
                        width: isActive ? '16px' : '12px',
                        height: isActive ? '16px' : '12px',
                        borderRadius: '50%',
                        background: isActive ? '#38bdf8' : timelineColor,
                        border: '2.5px solid #ffffff',
                        boxShadow: isActive ? `0 0 16px #38bdf8` : `0 0 8px rgba(0, 0, 0, 0.8)`,
                        zIndex: 2,
                        transform: 'translateY(-1px)'
                      }}
                    />

                    {/* Label Below */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '18px',
                        fontFamily: fontFam,
                        fontSize: `${Math.max(12, Math.round(fontSize * 0.35))}px`,
                        fontWeight: '600',
                        color: '#f1f5f9',
                        textShadow: `0 2px 4px rgba(0, 0, 0, 0.95), 0 4px 12px rgba(0, 0, 0, 0.85)`,
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.01em'
                      }}
                    >
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Render Component According to Graphic Type */}
      {clip.graphicType === 'kpi_metric' && (
        <div
          style={{
            minWidth: '380px',
            maxWidth: '520px',
            padding: '24px 32px',
            borderRadius: '18px',
            background: clip.backdropGlass !== false ? (clip.bgColor || 'rgba(10, 15, 30, 0.88)') : 'transparent',
            backdropFilter: clip.backdropGlass !== false ? 'blur(16px)' : 'none',
            border: clip.backdropGlass !== false ? `1px solid ${clip.borderColor || 'rgba(6, 182, 212, 0.35)'}` : 'none',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              fontFamily: fontFam,
              fontSize: `${fontSize * 1.5}px`,
              fontWeight: '800',
              color: accentColor,
              textShadow: `${shadowColor} 0px ${shadowOffsetY}px ${shadowBlur}px`,
              lineHeight: '1.1',
              marginBottom: '6px'
            }}
          >
            {clip.kpiValue || '100%'}
          </div>
          <div
            style={{
              fontFamily: fontFam,
              fontSize: `${Math.max(16, fontSize * 0.42)}px`,
              fontWeight: '600',
              color: textColor,
              letterSpacing: `${clip.letterSpacing || 1}px`
            }}
          >
            {clip.kpiLabel || clip.title}
          </div>
          {clip.kpiDelta && (
            <div
              style={{
                fontFamily: fontFam,
                fontSize: `${Math.max(13, fontSize * 0.34)}px`,
                fontWeight: '500',
                color: '#34d399',
                marginTop: '6px',
                display: 'inline-block',
                background: 'rgba(52, 211, 153, 0.12)',
                padding: '2px 8px',
                borderRadius: '6px'
              }}
            >
              {clip.kpiDelta}
            </div>
          )}
        </div>
      )}

      {clip.graphicType === 'chart_bar' && (
        <div
          style={{
            width: '540px',
            padding: '22px 28px',
            borderRadius: '18px',
            background: clip.backdropGlass !== false ? (clip.bgColor || 'rgba(10, 15, 30, 0.9)') : 'transparent',
            backdropFilter: clip.backdropGlass !== false ? 'blur(16px)' : 'none',
            border: clip.backdropGlass !== false ? `1px solid ${clip.borderColor || 'rgba(6, 182, 212, 0.35)'}` : 'none',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontFamily: fontFam, fontSize: '20px', fontWeight: '700', color: textColor }}>
                {titleText}
              </div>
              {clip.subtitle && (
                <div style={{ fontFamily: fontFam, fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                  {clip.subtitle}
                </div>
              )}
            </div>
            {clip.badgeText && (
              <span className="badge badge-cyan" style={{ fontSize: '10px' }}>
                {clip.badgeText}
              </span>
            )}
          </div>

          {/* Bar Columns */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '120px', paddingTop: '10px' }}>
            {(clip.chartItems || [
              { label: 'Q1', value: 40, color: '#06b6d4' },
              { label: 'Q2', value: 75, color: '#38bdf8' },
              { label: 'Q3', value: 95, color: '#6366f1' },
              { label: 'Q4', value: 130, color: '#a855f7' }
            ]).map((item, idx) => {
              const maxVal = Math.max(...(clip.chartItems || []).map(i => i.value || 10), 10);
              const heightPct = Math.min(100, Math.max(15, (item.value / maxVal) * 100));
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '60px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', marginBottom: '4px' }}>
                    {item.value}
                  </span>
                  <div
                    style={{
                      width: '36px',
                      height: `${heightPct}%`,
                      borderRadius: '6px 6px 0 0',
                      background: `linear-gradient(180deg, ${item.color || accentColor}, rgba(15, 23, 42, 0.5))`,
                      boxShadow: `0 0 12px ${(item.color || accentColor)}55`,
                      transition: 'height 0.4s ease-out'
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {clip.graphicType === 'chart_line' && (
        <div
          style={{
            width: '540px',
            padding: '22px 28px',
            borderRadius: '18px',
            background: clip.backdropGlass !== false ? (clip.bgColor || 'rgba(10, 15, 30, 0.9)') : 'transparent',
            backdropFilter: clip.backdropGlass !== false ? 'blur(16px)' : 'none',
            border: clip.backdropGlass !== false ? `1px solid ${clip.borderColor || 'rgba(6, 182, 212, 0.35)'}` : 'none',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)'
          }}
        >
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontFamily: fontFam, fontSize: '20px', fontWeight: '700', color: textColor }}>
              {titleText}
            </div>
            {clip.subtitle && (
              <div style={{ fontFamily: fontFam, fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                {clip.subtitle}
              </div>
            )}
          </div>

          <svg width="480" height="110" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id={`grad-line-${clip.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.45" />
                <stop offset="100%" stopColor={accentColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Smooth SVG wave curve */}
            <path
              d="M 20 80 Q 90 20, 160 55 T 300 25 T 460 15 L 460 100 L 20 100 Z"
              fill={`url(#grad-line-${clip.id})`}
            />
            <path
              d="M 20 80 Q 90 20, 160 55 T 300 25 T 460 15"
              fill="none"
              stroke={accentColor}
              strokeWidth="3.5"
              style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }}
            />
            {/* Glowing nodes */}
            <circle cx="20" cy="80" r="4.5" fill={accentColor} />
            <circle cx="160" cy="55" r="4.5" fill={accentColor} />
            <circle cx="300" cy="25" r="4.5" fill={accentColor} />
            <circle cx="460" cy="15" r="5" fill="#ffffff" stroke={accentColor} strokeWidth="2" />
          </svg>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
            <span>Inicio</span>
            <span>Tendencia Positiva</span>
            <span style={{ color: '#34d399', fontWeight: '600' }}>+48% Pico Máximo</span>
          </div>
        </div>
      )}

      {clip.graphicType === 'chart_donut' && (
        <div
          style={{
            width: '500px',
            padding: '22px 28px',
            borderRadius: '18px',
            background: clip.backdropGlass !== false ? (clip.bgColor || 'rgba(10, 15, 30, 0.9)') : 'transparent',
            backdropFilter: clip.backdropGlass !== false ? 'blur(16px)' : 'none',
            border: clip.backdropGlass !== false ? `1px solid ${clip.borderColor || 'rgba(6, 182, 212, 0.35)'}` : 'none',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '24px'
          }}
        >
          {/* Radial Donut SVG */}
          <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="14" />
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke={accentColor}
                strokeWidth="14"
                strokeDasharray={`${(parseFloat(clip.kpiValue) || 75) * 3.01} 301`}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }}
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fontFam,
                fontSize: '22px',
                fontWeight: '800',
                color: textColor
              }}
            >
              {clip.kpiValue || '75%'}
            </div>
          </div>

          <div>
            <div style={{ fontFamily: fontFam, fontSize: '20px', fontWeight: '700', color: textColor, marginBottom: '4px' }}>
              {titleText}
            </div>
            <div style={{ fontFamily: fontFam, fontSize: '13px', color: '#94a3b8', lineHeight: '1.4' }}>
              {clip.subtitle || clip.kpiLabel || 'Proporción analizada en la escena'}
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
              <span className="badge badge-cyan" style={{ fontSize: '10px' }}>
                Cuota Mayoritaria
              </span>
            </div>
          </div>
        </div>
      )}

      {clip.graphicType === 'lower_third' && (
        <div
          style={{
            minWidth: clip.backdropGlass !== false ? '420px' : 'auto',
            maxWidth: '560px',
            padding: clip.backdropGlass !== false ? '16px 24px' : '8px 16px',
            borderRadius: clip.backdropGlass !== false ? '14px' : '4px',
            background: clip.backdropGlass !== false ? (clip.bgColor || 'rgba(10, 15, 30, 0.92)') : 'transparent',
            backdropFilter: clip.backdropGlass !== false ? 'blur(16px)' : 'none',
            border: clip.backdropGlass !== false ? `1px solid ${clip.borderColor || 'rgba(6, 182, 212, 0.45)'}` : 'none',
            boxShadow: clip.backdropGlass !== false ? '0 16px 36px rgba(0, 0, 0, 0.6)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}
        >
          {/* Glowing Vertical Line */}
          <div
            style={{
              width: '4px',
              height: '42px',
              borderRadius: '2px',
              background: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
              flexShrink: 0
            }}
          />
          <div>
            <div
              style={{
                fontFamily: fontFam,
                fontSize: '22px',
                fontWeight: '700',
                color: textColor,
                textShadow: `0 2px 4px rgba(0, 0, 0, 0.95), 0 4px 16px rgba(0, 0, 0, 0.9)`,
                lineHeight: '1.2'
              }}
            >
              {titleText}
            </div>
            {clip.subtitle && (
              <div
                style={{
                  fontFamily: fontFam,
                  fontSize: '13px',
                  fontWeight: '600',
                  color: accentColor,
                  textShadow: `0 2px 6px rgba(0, 0, 0, 0.9)`,
                  marginTop: '2px',
                  letterSpacing: '0.02em'
                }}
              >
                {clip.subtitle}
              </div>
            )}
          </div>
        </div>
      )}

      {clip.graphicType === 'quote_callout' && (
        <div
          style={{
            maxWidth: '680px',
            padding: clip.backdropGlass !== false ? '24px 32px' : '16px 24px',
            borderRadius: clip.backdropGlass !== false ? '18px' : '0',
            background: clip.backdropGlass !== false ? (clip.bgColor || 'rgba(12, 18, 36, 0.9)') : 'transparent',
            backdropFilter: clip.backdropGlass !== false ? 'blur(18px)' : 'none',
            border: clip.backdropGlass !== false ? `1px solid ${clip.borderColor || 'rgba(6, 182, 212, 0.4)'}` : 'none',
            boxShadow: clip.backdropGlass !== false ? '0 20px 45px rgba(0, 0, 0, 0.6)' : 'none',
            position: 'relative',
            textAlign: clip.backdropGlass !== false ? 'left' : 'center'
          }}
        >
          <div
            style={{
              fontSize: '44px',
              color: accentColor,
              fontFamily: 'serif',
              lineHeight: '1',
              marginBottom: '-12px',
              textShadow: `0 2px 8px rgba(0, 0, 0, 0.95)`
            }}
          >
            “
          </div>
          <div
            style={{
              fontFamily: fontFam,
              fontSize: '20px',
              fontStyle: 'italic',
              fontWeight: '500',
              color: textColor,
              lineHeight: '1.45',
              textShadow: `0 2px 4px rgba(0, 0, 0, 0.95), 0 4px 18px rgba(0, 0, 0, 0.9)`
            }}
          >
            {titleText}
          </div>
          {(clip.quoteAuthor || clip.subtitle) && (
            <div
              style={{
                textAlign: 'right',
                marginTop: '12px',
                fontSize: '14px',
                fontWeight: '600',
                color: accentColor,
                textShadow: `0 2px 6px rgba(0, 0, 0, 0.95)`
              }}
            >
              — {clip.quoteAuthor || clip.subtitle}
            </div>
          )}
        </div>
      )}

      {clip.graphicType === 'title_hero' && (
        <div style={{ textAlign: 'center', maxWidth: '820px', padding: '16px' }}>
          {clip.badgeText && (
            <div style={{ marginBottom: '8px' }}>
              <span
                style={{
                  background: 'rgba(6, 182, 212, 0.2)',
                  color: accentColor,
                  border: `1px solid ${accentColor}`,
                  borderRadius: '20px',
                  padding: '3px 12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  letterSpacing: '1px',
                  display: 'inline-block'
                }}
              >
                {clip.badgeText.toUpperCase()}
              </span>
            </div>
          )}

          <div
            style={{
              fontFamily: fontFam,
              fontSize: `${fontSize}px`,
              fontWeight: '800',
              color: textColor,
              textShadow: `${shadowColor} 0px ${shadowOffsetY}px ${shadowBlur}px`,
              letterSpacing: `${clip.letterSpacing || 1}px`,
              lineHeight: '1.15'
            }}
          >
            {titleText}
          </div>

          {clip.subtitle && (
            <div
              style={{
                fontFamily: fontFam,
                fontSize: `${Math.max(16, fontSize * 0.42)}px`,
                fontWeight: '500',
                color: accentColor,
                letterSpacing: '1px',
                marginTop: '10px',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)'
              }}
            >
              {clip.subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
