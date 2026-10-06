import React, { useState, useEffect, useMemo } from 'react';
import { getOrLoadWaveform, getClipWaveformSlice } from '../utils/audioWaveform';

/**
 * High-fidelity Audio Waveform Visualizer for Timeline Clips (CapCut / Premiere Pro style)
 * Renders mirrored peak bars representing the exact audio slice [sourceStart, sourceStart + duration].
 */
export const AudioClipWaveform = React.memo(function AudioClipWaveform({ clip, asset, width, color = '#06b6d4', onAssetDurationResolved }) {
  const [waveData, setWaveData] = useState(() => {
    if (asset?.waveform && Array.isArray(asset.waveform)) {
      return { duration: asset.duration || 10, peaks: asset.waveform };
    }
    return null;
  });

  useEffect(() => {
    let isMounted = true;
    if (!asset) return;

    if (asset.waveform && Array.isArray(asset.waveform)) {
      setWaveData({ duration: asset.duration || 10, peaks: asset.waveform });
      return;
    }

    getOrLoadWaveform(asset).then((data) => {
      if (!isMounted || !data) return;
      setWaveData(data);
      if (
        onAssetDurationResolved &&
        data.duration &&
        Math.abs((asset.duration || 0) - data.duration) > 0.3
      ) {
        onAssetDurationResolved(asset.id, data.duration, data.peaks);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [asset?.id, asset?.url, asset?.file]);

  // Compute number of bars based on pixel width of clip
  const barCount = useMemo(() => {
    return Math.max(16, Math.min(500, Math.floor(width / 3.5)));
  }, [width]);

  // Compute the specific slice for this clip's current in-point and duration
  const sliceBars = useMemo(() => {
    if (!width || width < 12) return [];
    const peaks = waveData?.peaks || asset?.waveform || null;
    const totalDuration = waveData?.duration || asset?.duration || clip.duration;
    return getClipWaveformSlice(
      peaks,
      clip.duration,
      clip.sourceStart || 0,
      totalDuration,
      barCount
    );
  }, [waveData, asset?.waveform, asset?.duration, clip.duration, clip.sourceStart, barCount, width]);

  if (!width || width < 12) return null;

  const svgWidth = barCount * 4;
  const gradientId = `wave-grad-${clip.id}`;

  return (
    <div className="audio-waveform-container" aria-hidden="true">
      <svg
        className="audio-waveform-svg"
        viewBox={`0 0 ${svgWidth} 100`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
            <stop offset="50%" stopColor={color || '#06b6d4'} stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        {/* Center baseline reference line */}
        <line
          x1="0"
          y1="50"
          x2={svgWidth}
          y2="50"
          stroke="rgba(56, 189, 248, 0.25)"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        {/* Mirrored audio waveform bars */}
        {sliceBars.map((peak, idx) => {
          const barHeight = Math.max(5, peak * 88);
          const y = 50 - barHeight / 2;
          const x = idx * 4 + 0.8;
          return (
            <rect
              key={idx}
              x={x}
              y={y}
              width="2.4"
              height={barHeight}
              rx="1.2"
              fill={`url(#${gradientId})`}
              className="waveform-bar-rect"
            />
          );
        })}
      </svg>
    </div>
  );
});
