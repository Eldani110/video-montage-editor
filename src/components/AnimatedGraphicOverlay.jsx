import React, { useRef, useState, useEffect } from 'react';
import {
  computeGraphicAnimationState,
  FONT_OPTIONS
} from '../utils/graphicEngine.js';
import { Move, Check, Sparkles, RotateCw, RotateCcw, X, Type } from 'lucide-react';

export function AnimatedGraphicOverlay({
  clip,
  currentTime,
  isSelected = false,
  onSelect = null,
  onUpdatePosition = null,
  onBeginTransform = null,
  onEndTransform = null,
  stageDimensions = { width: 1280, height: 720 },
  monitorZoom = 1.0
}) {
  const containerRef = useRef(null);
  const textInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState(clip.title || clip.text || '');

  // Sync draftText whenever clip text/title changes from external edits (e.g. Inspector or Transcript)
  useEffect(() => {
    if (!isEditingText) {
      setDraftText(clip.title !== undefined ? clip.title : (clip.text || ''));
    }
  }, [clip.title, clip.text, isEditingText]);

  // Reset editing mode if deselecting
  useEffect(() => {
    if (!isSelected) {
      setIsEditingText(false);
    }
  }, [isSelected]);

  // Focus and select text when entering editing mode
  useEffect(() => {
    if (isEditingText && textInputRef.current) {
      textInputRef.current.focus();
      textInputRef.current.select();
    }
  }, [isEditingText]);

  // Keyboard Arrow Key Nudging and Escape to Deselect (Placed at top level to satisfy React Rules of Hooks)
  useEffect(() => {
    if (!isSelected || !clip) return;

    const handleKeyDown = (e) => {
      if (isEditingText) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const curX = clip.positionX ?? clip.position?.x ?? 0;
        const curY = clip.positionY ?? clip.position?.y ?? 0;
        let nextX = curX;
        let nextY = curY;

        if (e.key === 'ArrowLeft') nextX -= step;
        if (e.key === 'ArrowRight') nextX += step;
        if (e.key === 'ArrowUp') nextY -= step;
        if (e.key === 'ArrowDown') nextY += step;

        if (onUpdatePosition) {
          onUpdatePosition(clip.id, {
            positionX: nextX,
            positionY: nextY,
            position: {
              ...(clip.position || {}),
              x: nextX,
              y: nextY
            }
          }, true);
        }
      } else if (e.key === 'Escape') {
        if (onSelect) onSelect(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, clip?.id, clip?.positionX, clip?.positionY, clip?.position, onUpdatePosition, onSelect]);

  if (!clip || !clip.isGraphic) return null;

  const anim = computeGraphicAnimationState(clip, currentTime);
  if (!anim.isVisible || anim.opacity <= 0) return null;

  // Calculate resolution-independent preview scale relative to reference 1280 (or 720 for vertical 9:16)
  const stageW = stageDimensions?.width || 1280;
  const stageH = stageDimensions?.height || 720;
  const isVertical = stageH > stageW;
  const refW = isVertical ? 720 : 1280;
  const previewScale = Math.max(0.1, stageW / refW);

  // Maximum allowed width before touching video margins (leaves safe margin for handles)
  const maxSafeWidth = Math.round(refW * (isVertical ? 0.88 : 0.92));
  // Default box width optimized for comfortable 2-line formatting
  const defaultBoxWidth = Math.round(refW * (isVertical ? 0.82 : 0.78)); // ~590px in vertical 9:16, ~1000px in horizontal 16:9
  const activeBoxWidth = Math.min(maxSafeWidth, Math.max(260, Number(clip.boxWidth || defaultBoxWidth)));

  // Counter-scale factor so gizmo handles and badges stay crisp and normal-sized regardless of stage scaling
  const effectiveTotalScale = Math.max(0.1, (anim.scale || 1.0) * previewScale);
  const counterScale = 1 / effectiveTotalScale;

  const fontFam = clip.fontFamily || 'Outfit';
  const fontSize = clip.fontSize || 42;
  const accentColor = clip.accentColor || '#06b6d4';
  const textColor = clip.textColor || '#ffffff';
  const shadowBlur = clip.textShadowBlur !== undefined ? clip.textShadowBlur : 18;
  const shadowOffsetY = clip.textShadowOffsetY !== undefined ? clip.textShadowOffsetY : 4;
  const isDocType = ['doc_chapter', 'doc_stat', 'doc_date', 'doc_timeline'].includes(clip.graphicType);
  const defaultShadow = isDocType ? 'rgba(0, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.85)';
  const shadowColor = clip.textShadowColor || defaultShadow;

  let titleText = clip.title !== undefined ? clip.title : (clip.text || '');
  if (clip.textTransform === 'uppercase') {
    titleText = titleText.toUpperCase();
  }
  if (anim.typewriterRatio < 1.0) {
    const charsToShow = Math.floor(titleText.length * anim.typewriterRatio);
    titleText = titleText.substring(0, charsToShow);
  }

  // 1. Drag to Move on Canvas with normalized delta scaling
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (onSelect) onSelect(clip.id);

    if (!onUpdatePosition) return;
    if (onBeginTransform) onBeginTransform();

    setIsDragging(true);
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialPosX = clip.positionX ?? clip.position?.x ?? 0;
    const initialPosY = clip.positionY ?? clip.position?.y ?? 0;

    const handleMouseMove = (moveEvt) => {
      const deltaX = (moveEvt.clientX - startClientX) / (previewScale * monitorZoom);
      const deltaY = (moveEvt.clientY - startClientY) / (previewScale * monitorZoom);
      const nextX = Math.round(initialPosX + deltaX);
      const nextY = Math.round(initialPosY + deltaY);
      onUpdatePosition(clip.id, {
        positionX: nextX,
        positionY: nextY,
        position: {
          ...(clip.position || {}),
          x: nextX,
          y: nextY
        }
      }, false);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onEndTransform) onEndTransform();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 2. Drag to Scale with Corner Handles
  const handleStartScale = (e, handleId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsScaling(true);
    if (onBeginTransform) onBeginTransform();

    const initialScale = clip.scale ?? clip.position?.scale ?? 1.0;
    const rect = containerRef.current?.getBoundingClientRect();
    const centerX = rect ? (rect.left + rect.width / 2) : e.clientX;
    const centerY = rect ? (rect.top + rect.height / 2) : e.clientY;
    const initialDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);

    const handleMouseMove = (moveEvt) => {
      const currentDist = Math.hypot(moveEvt.clientX - centerX, moveEvt.clientY - centerY);
      const distRatio = currentDist / Math.max(12, initialDist);
      const nextScale = Math.max(0.2, Math.min(4.0, Number((initialScale * distRatio).toFixed(2))));

      if (onUpdatePosition) {
        onUpdatePosition(clip.id, {
          scale: nextScale,
          position: {
            ...(clip.position || {}),
            scale: nextScale
          }
        }, false);
      }
    };

    const handleMouseUp = () => {
      setIsScaling(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onEndTransform) onEndTransform();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 3. Drag to Rotate with Top Knob
  const handleStartRotate = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsRotating(true);
    if (onBeginTransform) onBeginTransform();

    const rect = containerRef.current?.getBoundingClientRect();
    const centerX = rect ? (rect.left + rect.width / 2) : e.clientX;
    const centerY = rect ? (rect.top + rect.height / 2) : e.clientY;

    const handleMouseMove = (moveEvt) => {
      const angleRad = Math.atan2(moveEvt.clientY - centerY, moveEvt.clientX - centerX);
      let angleDeg = Math.round((angleRad * 180) / Math.PI) - 90;

      while (angleDeg > 180) angleDeg -= 360;
      while (angleDeg < -180) angleDeg += 360;

      if (moveEvt.shiftKey) {
        angleDeg = Math.round(angleDeg / 15) * 15;
      }

      if (onUpdatePosition) {
        onUpdatePosition(clip.id, {
          rotation: angleDeg,
          position: {
            ...(clip.position || {}),
            rotation: angleDeg
          }
        }, false);
      }
    };

    const handleMouseUp = () => {
      setIsRotating(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onEndTransform) onEndTransform();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 4. Drag Side Handles (West / East) to Adjust Box Width without changing font size
  const handleStartResizeWidth = (e, handleId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizingWidth(true);
    if (onBeginTransform) onBeginTransform();

    const initialBoxW = activeBoxWidth;
    const startX = e.clientX;

    const handleMouseMove = (moveEvt) => {
      const deltaScreenX = moveEvt.clientX - startX;
      // Convert screen delta to virtual reference coordinates
      const deltaRefX = deltaScreenX / (previewScale * (anim.scale || 1.0) * monitorZoom);
      // Symmetrical horizontal resizing: dragging right handle (e) expands width, left handle (w) expands when dragging left
      const factor = handleId === 'e' ? 2 : -2;
      const newWidth = Math.round(
        Math.max(260, Math.min(maxSafeWidth, initialBoxW + deltaRefX * factor))
      );

      if (onUpdatePosition) {
        onUpdatePosition(clip.id, {
          boxWidth: newWidth,
          position: {
            ...(clip.position || {}),
            boxWidth: newWidth
          }
        }, false);
      }
    };

    const handleMouseUp = () => {
      setIsResizingWidth(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (onEndTransform) onEndTransform();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Quick Action Buttons
  const handleReset = (e) => {
    e.stopPropagation();
    const defaultY = isVertical ? 320 : 235;
    if (onUpdatePosition) {
      onUpdatePosition(clip.id, {
        positionX: 0,
        positionY: defaultY,
        scale: 1.0,
        rotation: 0,
        boxWidth: defaultBoxWidth,
        position: {
          ...(clip.position || {}),
          x: 0,
          y: defaultY,
          scale: 1.0,
          rotation: 0,
          boxWidth: defaultBoxWidth
        }
      }, true);
    }
  };

  const handleCenter = (e) => {
    e.stopPropagation();
    if (onUpdatePosition) {
      onUpdatePosition(clip.id, {
        positionX: 0,
        positionY: 0,
        position: {
          ...(clip.position || {}),
          x: 0,
          y: 0
        }
      }, true);
    }
  };

  const handleDeselect = (e) => {
    e.stopPropagation();
    if (onSelect) onSelect(null);
  };

  const handleCommitText = () => {
    const trimmed = draftText.trim();
    setIsEditingText(false);
    if (!trimmed || trimmed === (clip.title || clip.text)) return;

    if (onUpdatePosition) {
      onUpdatePosition(clip.id, {
        title: trimmed,
        text: trimmed,
        name: `Sub: ${trimmed.slice(0, 28)}`
      }, true);
    }
  };

  const handleCancelText = () => {
    setIsEditingText(false);
    setDraftText(clip.title || clip.text || '');
  };

  const curPosX = clip.positionX ?? clip.position?.x ?? 0;
  const curPosY = clip.positionY ?? clip.position?.y ?? 0;
  const curScale = clip.scale ?? clip.position?.scale ?? 1.0;
  const curRotation = clip.rotation ?? clip.position?.rotation ?? 0;
  const isSubClip = clip.graphicType === 'subtitle_caption' || clip.isSubtitle;

  const transformStyle = `translate(${anim.offsetX * previewScale}px, ${anim.offsetY * previewScale}px) scale(${anim.scale * previewScale}) ${anim.rotate ? `rotate(${anim.rotate}deg)` : ''}`;

  return (
    <div
      ref={containerRef}
      className={`animated-graphic-overlay-wrapper ${isSelected ? 'is-selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(clip.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(clip.id);
        setDraftText(clip.title || clip.text || '');
        setIsEditingText(true);
      }}
      onMouseDown={isEditingText ? undefined : handleMouseDown}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) ${transformStyle}`,
        transformOrigin: 'center center',
        width: isSubClip ? `${activeBoxWidth}px` : (clip.boxWidth ? `${activeBoxWidth}px` : 'fit-content'),
        maxWidth: `${maxSafeWidth}px`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: anim.opacity,
        zIndex: isSelected ? 160 : 120,
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        pointerEvents: 'auto',
        transition: isDragging || isScaling || isRotating || isResizingWidth ? 'none' : 'transform 0.05s ease-out'
      }}
    >
      {/* 1. Normal Transform Gizmo (Only visible when NOT in text editing mode) */}
      {isSelected && !isEditingText && (
        <div
          className="graphic-transform-gizmo-wireframe"
          style={{
            position: 'absolute',
            inset: `${-6 * counterScale}px`,
            border: `${Math.max(1.5, 1.5 * counterScale)}px solid #3898ff`,
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.7), 0 0 12px rgba(56, 152, 255, 0.45)',
            borderRadius: clip.backdropGlass ? `${12 * counterScale}px` : `${4 * counterScale}px`,
            pointerEvents: 'none',
            zIndex: 140
          }}
        >
          {/* Top Label Badge */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate(0, -100%) translateY(${-4 * counterScale}px) scale(${counterScale})`,
              transformOrigin: 'bottom left',
              background: '#3898ff',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              maxWidth: `${Math.max(140, maxSafeWidth * 0.5)}px`,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              pointerEvents: 'none'
            }}
          >
            <Type size={11} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {clip.name || (clip.isSubtitle ? 'Subtítulo' : 'Gráfico')}
            </span>
          </div>

          {/* Center Anchor Target (+) - subtle whisper */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) scale(${counterScale})`,
              transformOrigin: 'center center',
              width: '8px',
              height: '8px',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.25
            }}
          >
            <div style={{ position: 'absolute', width: '6px', height: '1px', background: '#3898ff' }} />
            <div style={{ position: 'absolute', height: '6px', width: '1px', background: '#3898ff' }} />
          </div>

          {/* Rotation Stem & Top Circular Knob */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: `${-22 * counterScale}px`,
              width: `${Math.max(1, 1.5 * counterScale)}px`,
              height: `${22 * counterScale}px`,
              background: '#3898ff',
              transform: 'translateX(-50%)',
              pointerEvents: 'none'
            }}
          />
          <div
            onMouseDown={handleStartRotate}
            title="Arrastra para rotar • Mantén Shift para pasos de 15°"
            style={{
              position: 'absolute',
              left: '50%',
              top: `${-22 * counterScale}px`,
              transform: `translate(-50%, -100%) scale(${counterScale})`,
              transformOrigin: 'center center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: isRotating ? '#2563eb' : '#3898ff',
              border: '2px solid #ffffff',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
              cursor: 'crosshair',
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}
          >
            <RotateCw size={10} strokeWidth={2.6} />
          </div>

          {/* 4 Corner Scale Handles */}
          {[
            { id: 'nw', style: { top: 0, left: 0, transform: `translate(-50%, -50%) scale(${counterScale})`, cursor: 'nwse-resize' } },
            { id: 'ne', style: { top: 0, right: 0, transform: `translate(50%, -50%) scale(${counterScale})`, cursor: 'nesw-resize' } },
            { id: 'se', style: { bottom: 0, right: 0, transform: `translate(50%, 50%) scale(${counterScale})`, cursor: 'nwse-resize' } },
            { id: 'sw', style: { bottom: 0, left: 0, transform: `translate(-50%, 50%) scale(${counterScale})`, cursor: 'nesw-resize' } }
          ].map((h) => (
            <div
              key={h.id}
              onMouseDown={(e) => handleStartScale(e, h.id)}
              title="Arrastra para escalar proporcionalmente"
              style={{
                position: 'absolute',
                width: '9px',
                height: '9px',
                background: '#ffffff',
                border: '1.5px solid #3898ff',
                borderRadius: '2px',
                pointerEvents: 'auto',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.7)',
                zIndex: 140,
                ...h.style
              }}
            />
          ))}

          {/* 2 Side Handles (West / East) for Horizontal Box Width Resize */}
          {[
            { id: 'w', title: 'Arrastra horizontalmente para ensanchar o reducir el espacio del texto (2 líneas)', style: { top: '50%', left: 0, transform: `translate(-50%, -50%) scale(${counterScale})`, cursor: 'ew-resize' } },
            { id: 'e', title: 'Arrastra horizontalmente para ensanchar o reducir el espacio del texto (2 líneas)', style: { top: '50%', right: 0, transform: `translate(50%, -50%) scale(${counterScale})`, cursor: 'ew-resize' } }
          ].map((h) => (
            <div
              key={h.id}
              onMouseDown={(e) => handleStartResizeWidth(e, h.id)}
              title={h.title}
              style={{
                position: 'absolute',
                width: '6px',
                height: '18px',
                background: '#ffffff',
                border: '1.5px solid #3898ff',
                borderRadius: '3px',
                pointerEvents: 'auto',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.7)',
                zIndex: 145,
                ...h.style
              }}
            />
          ))}

          {/* Live HUD Tooltip during dragging / scaling / rotating / resizing width */}
          {(isDragging || isRotating || isScaling || isResizingWidth) && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: `translateX(-50%) translateY(${-44 * counterScale}px) rotate(${-curRotation}deg) scale(${counterScale})`,
                transformOrigin: 'bottom center',
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid #3898ff',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.7)',
                pointerEvents: 'none',
                zIndex: 250
              }}
            >
              {isDragging && <span>↔ X: {curPosX}px &nbsp; ↕ Y: {curPosY}px</span>}
              {isScaling && <span>⤢ Escala: {Math.round(curScale * 100)}% ({curScale.toFixed(2)}x)</span>}
              {isRotating && <span>↻ Rotación: {curRotation}°</span>}
              {isResizingWidth && <span>↔ Espacio ancho: {activeBoxWidth}px</span>}
            </div>
          )}

          {/* Quick Actions Floating Toolbar (Positioned adaptively above or below) */}
          <div
            className="graphic-quick-actions-toolbar"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              ...(curPosY > 40
                ? {
                    top: 0,
                    transform: `translate(-50%, -100%) translateY(${-30 * counterScale}px) scale(${counterScale})`,
                    transformOrigin: 'bottom center'
                  }
                : {
                    bottom: 0,
                    transform: `translate(-50%, 100%) translateY(${10 * counterScale}px) scale(${counterScale})`,
                    transformOrigin: 'top center'
                  }),
              left: '50%',
              background: 'rgba(15, 23, 42, 0.94)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: '6px',
              padding: '3px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'auto',
              zIndex: 140,
              whiteSpace: 'nowrap',
              width: 'max-content'
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDraftText(clip.title || clip.text || '');
                setIsEditingText(true);
              }}
              title="Editar palabras de este subtítulo directamente (o haz doble clic)"
              style={{
                background: 'rgba(56, 152, 255, 0.18)',
                border: '1px solid rgba(56, 152, 255, 0.45)',
                color: '#3898ff',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
            >
              <Type size={11} />
              <span>Editar Texto</span>
            </button>

            <div style={{ width: '1px', height: '10px', background: 'rgba(255, 255, 255, 0.12)' }} />

            <button
              type="button"
              onClick={handleReset}
              title="Restablecer posición, escala y rotación iniciales"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 4px',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#3898ff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <RotateCcw size={10} />
              <span>Reset</span>
            </button>

            <div style={{ width: '1px', height: '10px', background: 'rgba(255, 255, 255, 0.12)' }} />

            <button
              type="button"
              onClick={handleCenter}
              title="Centrar en el monitor"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 4px',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#3898ff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <Move size={10} />
              <span>Centrar</span>
            </button>

            <div style={{ width: '1px', height: '10px', background: 'rgba(255, 255, 255, 0.12)' }} />

            <button
              type="button"
              onClick={handleDeselect}
              title="Deseleccionar recurso (Esc)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 4px',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f43f5e')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {/* 2. Text Editing Focus Ring (Clean & Minimalist, exactly like CapCut / Canva) */}
      {isSelected && isEditingText && (
        <div
          style={{
            position: 'absolute',
            inset: `${-4 * counterScale}px`,
            border: `${Math.max(1.5, 2 * counterScale)}px dashed #3898ff`,
            borderRadius: `${6 * counterScale}px`,
            pointerEvents: 'none',
            zIndex: 140
          }}
        >
          {/* Top Floating Pill Hint */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: `translateX(-50%) translateY(${-8 * counterScale}px) scale(${counterScale})`,
              transformOrigin: 'bottom center',
              background: '#0f172a',
              border: '1px solid #3898ff',
              borderRadius: '20px',
              padding: '3px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              width: 'max-content',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.7)',
              pointerEvents: 'auto'
            }}
          >
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>Enter</span>
            <span style={{ color: '#94a3b8' }}>guardar</span>
            <span style={{ color: '#475569' }}>•</span>
            <span style={{ color: '#f43f5e', fontWeight: 700 }}>Esc</span>
            <span style={{ color: '#94a3b8' }}>cancelar</span>
            <button
              type="button"
              onClick={handleCommitText}
              style={{
                marginLeft: '4px',
                background: '#10b981',
                border: 'none',
                borderRadius: '12px',
                color: '#ffffff',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '2px'
              }}
            >
              <Check size={11} />
              <span>Listo</span>
            </button>
          </div>
        </div>
      )}

      {/* Render Component According to Graphic Type */}
      {clip.graphicType === 'doc_chapter' && (
        <div
          style={{
            textAlign: 'center',
            width: 'fit-content',
            maxWidth: `${maxSafeWidth}px`,
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
            width: 'fit-content',
            maxWidth: `${maxSafeWidth}px`,
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
            width: 'fit-content',
            maxWidth: `${maxSafeWidth}px`,
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
            width: 'fit-content',
            maxWidth: `${maxSafeWidth}px`,
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
        <div style={{ textAlign: 'center', width: 'fit-content', maxWidth: `${maxSafeWidth}px`, padding: '16px' }}>
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

      {/* Subtitles & Captions Overlay (Hormozi, MrBeast, Minimal & Custom) */}
      {(clip.graphicType === 'subtitle_caption' || clip.isSubtitle) && (
        <div
          style={{
            textAlign: 'center',
            width: '100%',
            maxWidth: `${activeBoxWidth}px`,
            padding: clip.backdropGlass ? '8px 20px' : '4px 12px',
            background: clip.backdropGlass ? (clip.bgColor || 'rgba(0, 0, 0, 0.78)') : 'transparent',
            backdropFilter: clip.backdropGlass ? 'blur(10px)' : undefined,
            WebkitBackdropFilter: clip.backdropGlass ? 'blur(10px)' : undefined,
            borderRadius: clip.backdropGlass ? '12px' : undefined,
            border: clip.backdropGlass ? `1px solid ${clip.strokeColor || 'rgba(255, 255, 255, 0.15)'}` : 'none',
            display: 'block',
            wordBreak: 'normal',
            overflowWrap: 'break-word',
            userSelect: isEditingText ? 'text' : 'none'
          }}
        >
          {isEditingText ? (
            <textarea
              ref={textInputRef}
              value={draftText}
              onChange={(e) => {
                const nextVal = e.target.value;
                setDraftText(nextVal);
                if (onUpdatePosition) {
                  onUpdatePosition(clip.id, {
                    title: nextVal,
                    text: nextVal,
                    name: `Sub: ${nextVal.slice(0, 28)}`
                  }, false);
                }
              }}
              onBlur={handleCommitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCommitText();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCancelText();
                }
              }}
              rows={Math.max(1, (draftText || '').split('\n').length)}
              style={{
                width: '100%',
                background: 'transparent',
                color: textColor || '#ffffff',
                fontFamily: fontFam,
                fontSize: `${fontSize}px`,
                fontWeight: '900',
                textAlign: 'center',
                padding: '2px 0',
                margin: '0',
                border: 'none',
                outline: 'none',
                resize: 'none',
                lineHeight: '1.25',
                boxSizing: 'border-box',
                textTransform: clip.textTransform === 'uppercase' ? 'uppercase' : 'none',
                letterSpacing: `${clip.letterSpacing || 0.5}px`,
                caretColor: '#3898ff',
                display: 'block',
                textShadow: `0 2px 8px ${clip.strokeColor || '#000000'}`
              }}
              placeholder="Escribe el texto del subtítulo..."
            />
          ) : (
            (() => {
              const rawWords = (titleText || '').trim().split(/\s+/).filter(Boolean);
              if (rawWords.length === 0) return null;

              const strokeW = Number(clip.strokeWidth !== undefined ? clip.strokeWidth : 5);
              const strokeColor = clip.strokeColor || '#000000';
              const textStrokeStyle = strokeW > 0 ? `${strokeW}px ${strokeColor}` : undefined;
              const textShadowStyle = `${strokeColor} 0px 3px 8px, ${strokeColor} 0px 0px 10px`;

              if (!clip.highlightWordMode || rawWords.length <= 1) {
                return (
                  <span
                    style={{
                      fontFamily: fontFam,
                      fontSize: `${fontSize}px`,
                      fontWeight: '900',
                      color: textColor,
                      WebkitTextStroke: textStrokeStyle,
                      paintOrder: 'stroke fill',
                      textShadow: textShadowStyle,
                      letterSpacing: `${clip.letterSpacing || 0.5}px`,
                      lineHeight: '1.25',
                      display: 'inline-block'
                    }}
                  >
                    {titleText}
                  </span>
                );
              }

              // Hormozi / Viral caption style: highlight key/last word
              const highlightIdx = Math.max(0, rawWords.length - 1);

              return rawWords.map((word, wIdx) => {
                const isHighlight = wIdx === highlightIdx;
                return (
                  <span
                    key={wIdx}
                    style={{
                      fontFamily: fontFam,
                      fontSize: `${isHighlight ? fontSize * 1.05 : fontSize}px`,
                      fontWeight: '900',
                      color: isHighlight ? (accentColor || '#facc15') : textColor,
                      WebkitTextStroke: textStrokeStyle,
                      paintOrder: 'stroke fill',
                      textShadow: textShadowStyle,
                      letterSpacing: `${clip.letterSpacing || 0.5}px`,
                      lineHeight: '1.25',
                      transform: isHighlight ? 'scale(1.05)' : 'none',
                      display: 'inline-block',
                      margin: '0 4px'
                    }}
                  >
                    {word}
                  </span>
                );
              });
            })()
          )}
        </div>
      )}
    </div>
  );
}
