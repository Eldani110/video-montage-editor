import React, { useRef, useState, useEffect } from 'react';
import {
  RotateCw,
  RotateCcw,
  Move,
  Maximize2,
  Trash2,
  Film,
  Image as ImageIcon,
  Type,
  X
} from 'lucide-react';

/**
 * On-Screen Transform Gizmo / Bounding Box Component
 * Displays a professional NLE wireframe bounding box over any selected media or graphic clip in the monitor.
 * Provides:
 * 1. Move: Clicking & dragging inside the wireframe or borders updates position (X, Y) in real time.
 * 2. Scale: Dragging any of the 4 corner handles resizes the clip proportionally from its center.
 * 3. Rotate: Dragging the top circular handle (rotation stem) smoothly rotates the clip around its center.
 * 4. HUD: Floating coordinates/scale/rotation badge during dragging.
 * 5. Quick Actions: Reset position/scale/rotation or center clip with a single click.
 */
export function TransformGizmo({
  clip,
  asset,
  stageDimensions = { width: 640, height: 360 },
  onUpdateClip,
  onBeginTransform = null,
  onEndTransform = null,
  onDeselect = null,
  monitorZoom = 1.0
}) {
  const boxRef = useRef(null);
  const [isMoving, setIsMoving] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  if (!clip) return null;

  const stageW = stageDimensions?.width || 640;
  const stageH = stageDimensions?.height || 360;

  // Extract transform values from clip (supports both clip.positionX and clip.position.x)
  const posX = clip.positionX ?? clip.position?.x ?? 0;
  const posY = clip.positionY ?? clip.position?.y ?? 0;
  const scale = clip.scale ?? clip.position?.scale ?? 1.0;
  const rotation = clip.rotation ?? clip.position?.rotation ?? 0;
  const flipX = clip.flipX ? -1 : 1;
  const flipY = clip.flipY ? -1 : 1;

  // Calculate base dimensions of the bounding box
  let boxW = stageW;
  let boxH = stageH;

  if (clip.isGraphic) {
    boxW = Math.min(stageW * 0.88, 520);
    boxH = Math.min(stageH * 0.45, 170);
  } else {
    const fitMode = clip.fit || 'contain';
    const stageRatio = stageW / stageH;
    const assetW = asset?.width || stageW;
    const assetH = asset?.height || stageH;
    const assetRatio = (assetW && assetH) ? (assetW / assetH) : stageRatio;

    if (fitMode === 'contain') {
      if (assetRatio > stageRatio) {
        boxW = stageW;
        boxH = stageW / assetRatio;
      } else {
        boxH = stageH;
        boxW = stageH * assetRatio;
      }
    } else if (fitMode === 'cover') {
      if (assetRatio > stageRatio) {
        boxH = stageH;
        boxW = stageH * assetRatio;
      } else {
        boxW = stageW;
        boxH = stageW / assetRatio;
      }
    } else {
      // 'fill'
      boxW = stageW;
      boxH = stageH;
    }
  }

  // 1. DRAG TO MOVE
  const handleStartMove = (e) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsMoving(true);
    if (onBeginTransform) onBeginTransform();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const initialX = posX;
    const initialY = posY;

    const onMouseMove = (moveEvt) => {
      const dx = (moveEvt.clientX - startMouseX) / monitorZoom;
      const dy = (moveEvt.clientY - startMouseY) / monitorZoom;
      const nextX = Math.round(initialX + dx);
      const nextY = Math.round(initialY + dy);

      if (onUpdateClip) {
        onUpdateClip(clip.id, {
          positionX: nextX,
          positionY: nextY,
          position: {
            ...(clip.position || {}),
            x: nextX,
            y: nextY
          }
        }, false);
      }
    };

    const onMouseUp = () => {
      setIsMoving(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (onEndTransform) onEndTransform();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 2. CORNER RESIZE / SCALE
  const handleStartScale = (e, corner) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsScaling(true);
    if (onBeginTransform) onBeginTransform();

    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const startDist = Math.max(12, Math.hypot(e.clientX - centerX, e.clientY - centerY));
    const startScale = Math.max(0.05, scale);

    const onMouseMove = (moveEvt) => {
      const curDist = Math.hypot(moveEvt.clientX - centerX, moveEvt.clientY - centerY);
      const factor = curDist / startDist;
      let nextScale = Number((startScale * factor).toFixed(2));
      nextScale = Math.max(0.1, Math.min(4.5, nextScale));

      if (onUpdateClip) {
        onUpdateClip(clip.id, {
          scale: nextScale,
          position: {
            ...(clip.position || {}),
            scale: nextScale
          }
        }, false);
      }
    };

    const onMouseUp = () => {
      setIsScaling(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (onEndTransform) onEndTransform();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 3. ROTATION HANDLE
  const handleStartRotate = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsRotating(true);
    if (onBeginTransform) onBeginTransform();

    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Initial mouse angle in degrees
    const startMouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const startRotation = rotation;

    const onMouseMove = (moveEvt) => {
      const currentMouseAngle = Math.atan2(moveEvt.clientY - centerY, moveEvt.clientX - centerX) * (180 / Math.PI);
      const angleDelta = currentMouseAngle - startMouseAngle;
      let nextRotation = Math.round(startRotation + angleDelta);

      // Normalize to [-180, 180]
      while (nextRotation > 180) nextRotation -= 360;
      while (nextRotation < -180) nextRotation += 360;

      // Snapping: holding Shift snaps to 15-degree steps; close to 0, 90, -90, 180 snaps cleanly
      if (moveEvt.shiftKey) {
        nextRotation = Math.round(nextRotation / 15) * 15;
      } else if (Math.abs(nextRotation) < 2.5) {
        nextRotation = 0;
      } else if (Math.abs(nextRotation - 90) < 2.5) {
        nextRotation = 90;
      } else if (Math.abs(nextRotation + 90) < 2.5) {
        nextRotation = -90;
      } else if (Math.abs(Math.abs(nextRotation) - 180) < 2.5) {
        nextRotation = 180;
      }

      if (onUpdateClip) {
        onUpdateClip(clip.id, {
          rotation: nextRotation,
          position: {
            ...(clip.position || {}),
            rotation: nextRotation
          }
        }, false);
      }
    };

    const onMouseUp = () => {
      setIsRotating(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (onEndTransform) onEndTransform();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Keyboard nudge with Arrow Keys & Escape to Deselect
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't nudge if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (onDeselect) onDeselect();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!e.altKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          let deltaX = 0;
          let deltaY = 0;
          if (e.key === 'ArrowLeft') deltaX = -step;
          if (e.key === 'ArrowRight') deltaX = step;
          if (e.key === 'ArrowUp') deltaY = -step;
          if (e.key === 'ArrowDown') deltaY = step;

          const nextX = posX + deltaX;
          const nextY = posY + deltaY;

          if (onUpdateClip) {
            onUpdateClip(clip.id, {
              positionX: nextX,
              positionY: nextY,
              position: {
                ...(clip.position || {}),
                x: nextX,
                y: nextY
              }
            });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clip.id, posX, posY, onUpdateClip, onDeselect]);

  const clipIcon = clip.isGraphic ? (
    <Type size={11} />
  ) : asset?.type === 'image' ? (
    <ImageIcon size={11} />
  ) : (
    <Film size={11} />
  );

  return (
    <div
      ref={boxRef}
      className={`transform-gizmo-box ${isMoving ? 'is-moving' : ''} ${isScaling ? 'is-scaling' : ''} ${isRotating ? 'is-rotating' : ''}`}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${boxW}px`,
        height: `${boxH}px`,
        transform: `translate(-50%, -50%) translate(${posX}px, ${posY}px) rotate(${rotation}deg) scale(${scale}, ${scale})`,
        transformOrigin: 'center center',
        zIndex: clip.isGraphic ? 170 : 70,
        pointerEvents: 'none'
      }}
    >
      {/* 1. Wireframe Border & Interior Drag Area */}
      <div
        className="transform-gizmo-drag-area"
        onMouseDown={handleStartMove}
        title="Arrastra para mover en el monitor • Usa teclas de dirección para ajuste fino"
        style={{
          position: 'absolute',
          inset: 0,
          border: '1.5px solid #3898ff',
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.7), 0 0 14px rgba(56, 152, 255, 0.45)',
          background: isMoving ? 'rgba(56, 152, 255, 0.12)' : 'rgba(56, 152, 255, 0.04)',
          cursor: isMoving ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          borderRadius: clip.borderRadius ? `${clip.borderRadius}px` : '2px',
          transition: isMoving ? 'none' : 'border-color 0.15s ease'
        }}
      />

      {/* 2. Top Clip Label Badge */}
      <div
        className="transform-gizmo-badge"
        style={{
          position: 'absolute',
          top: '-15px',
          left: '6px',
          background: '#3898ff',
          color: '#ffffff',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '4px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          whiteSpace: 'nowrap',
          maxWidth: '240px',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {clipIcon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.name || 'Recurso'}</span>
      </div>

      {/* 3. Center Anchor Target (+) */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '16px',
          height: '16px',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.85
        }}
      >
        <div style={{ position: 'absolute', width: '12px', height: '1.5px', background: '#3898ff', boxShadow: '0 0 2px #000' }} />
        <div style={{ position: 'absolute', height: '12px', width: '1.5px', background: '#3898ff', boxShadow: '0 0 2px #000' }} />
        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#ffffff', border: '1px solid #3898ff' }} />
      </div>

      {/* 4. Rotation Stem & Top Circular Knob */}
      <div
        className="transform-gizmo-rotate-stem"
        style={{
          position: 'absolute',
          left: '50%',
          top: '-28px',
          width: '1.5px',
          height: '28px',
          background: '#3898ff',
          boxShadow: '0 0 2px rgba(0,0,0,0.8)',
          transform: 'translateX(-50%)',
          pointerEvents: 'none'
        }}
      />
      <div
        className="transform-gizmo-rotate-knob"
        onMouseDown={handleStartRotate}
        title="Arrastra para rotar • Mantén Shift para pasos de 15°"
        style={{
          position: 'absolute',
          left: '50%',
          top: '-40px',
          transform: 'translateX(-50%)',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: isRotating ? '#2563eb' : '#3898ff',
          border: '2px solid #ffffff',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.6)',
          cursor: 'crosshair',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          transition: 'transform 0.1s ease, background 0.1s ease'
        }}
      >
        <RotateCw size={11} strokeWidth={2.6} />
      </div>

      {/* 5. Four Corner Scale Handles */}
      {[
        { id: 'nw', style: { top: '-6px', left: '-6px', cursor: 'nwse-resize' } },
        { id: 'ne', style: { top: '-6px', right: '-6px', cursor: 'nesw-resize' } },
        { id: 'se', style: { bottom: '-6px', right: '-6px', cursor: 'nwse-resize' } },
        { id: 'sw', style: { bottom: '-6px', left: '-6px', cursor: 'nesw-resize' } }
      ].map((handle) => (
        <div
          key={handle.id}
          className={`transform-gizmo-handle handle-${handle.id}`}
          onMouseDown={(e) => handleStartScale(e, handle.id)}
          title="Arrastra para escalar / zoom proporcional"
          style={{
            position: 'absolute',
            width: '11px',
            height: '11px',
            background: '#ffffff',
            border: '2px solid #3898ff',
            borderRadius: '2px',
            pointerEvents: 'auto',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.7)',
            zIndex: 135,
            ...handle.style
          }}
        />
      ))}

      {/* 6. Live HUD Tooltip during dragging / rotating / scaling */}
      {(isMoving || isRotating || isScaling) && (
        <div
          className="transform-gizmo-hud"
          style={{
            position: 'absolute',
            top: '-74px',
            left: '50%',
            transform: `translateX(-50%) rotate(${-rotation}deg)`,
            transformOrigin: 'center center',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #3898ff',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#ffffff',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'none',
            zIndex: 250
          }}
        >
          {isMoving && (
            <span>
              ↔ X: {posX > 0 ? `+${posX}` : posX}px &nbsp; ↕ Y: {posY > 0 ? `+${posY}` : posY}px
            </span>
          )}
          {isScaling && (
            <span>
              ⤢ Escala: {Math.round(scale * 100)}% ({scale.toFixed(2)}x)
            </span>
          )}
          {isRotating && (
            <span>
              ↻ Rotación: {rotation}°
            </span>
          )}
        </div>
      )}

      {/* 7. Quick Reset / Center Floating Bar */}
      <div
        className="transform-gizmo-toolbar"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: '-34px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.92)',
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
            if (onUpdateClip) {
              onUpdateClip(clip.id, {
                positionX: 0,
                positionY: 0,
                scale: 1.0,
                rotation: 0,
                flipX: false,
                flipY: false,
                position: {
                  ...(clip.position || {}),
                  x: 0,
                  y: 0,
                  scale: 1.0,
                  rotation: 0
                }
              });
            }
          }}
          title="Restablecer Posición, Escala y Rotación a valores iniciales"
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
          onClick={(e) => {
            e.stopPropagation();
            if (onUpdateClip) {
              onUpdateClip(clip.id, {
                positionX: 0,
                positionY: 0,
                position: {
                  ...(clip.position || {}),
                  x: 0,
                  y: 0
                }
              });
            }
          }}
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
          onClick={(e) => {
            e.stopPropagation();
            if (onDeselect) onDeselect();
          }}
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
          <span>Deseleccionar</span>
        </button>
      </div>
    </div>
  );
}
