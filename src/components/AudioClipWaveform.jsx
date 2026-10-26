import React, { useState, useEffect, useMemo } from 'react';
import { getOrLoadWaveform, getClipWaveformSlice } from '../utils/audioWaveform';

/**
 * High-Fidelity Adobe Premiere Pro Audio Waveform Visualizer for Timeline Clips
 * Renders a high-density dual-layer (Peak + RMS) mirrored waveform with transient needles
 * and a Premiere Pro dB rubber-band level line over the exact [sourceStart, sourceStart + duration] slice.
 */
export const AudioClipWaveform = React.memo(function AudioClipWaveform({
  clip,
  asset,
  width,
  onAssetDurationResolved
}) {
  const [waveData, setWaveData] = useState(() => {
    if (asset?.waveform && Array.isArray(asset.waveform) && asset.waveform.length >= 400) {
      return { duration: asset.duration || 10, peaks: asset.waveform };
    }
    return null;
  });

  useEffect(() => {
    let isMounted = true;
    if (!asset) return;

    getOrLoadWaveform(asset).then((data) => {
      if (!isMounted || !data) return;
      setWaveData(data);
      if (
        onAssetDurationResolved &&
        data.duration &&
        (Math.abs((asset.duration || 0) - data.duration) > 0.3 ||
          !asset.waveform ||
          asset.waveform.length < 400)
      ) {
        onAssetDurationResolved(asset.id, data.duration, data.peaks);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [asset?.id, asset?.url, asset?.file]);

  // High sample density (~1 sample every 1.6px, up to 1100 columns) so long clips never stretch into wide blocks
  const sampleCount = useMemo(() => {
    if (!width || width < 12) return 0;
    return Math.max(36, Math.min(1100, Math.floor(width / 1.6)));
  }, [width]);

  const volumeFactor = useMemo(() => {
    if (clip?.muted) return 0.06;
    const v = clip?.volume !== undefined ? Number(clip.volume) : 1.0;
    return Math.max(0.06, Math.min(1.45, v));
  }, [clip?.volume, clip?.muted]);

  // Compute the specific slice for this clip's current in-point and duration
  const slicePeaks = useMemo(() => {
    if (!sampleCount) return [];
    const peaks = waveData?.peaks || asset?.waveform || null;
    const totalDuration = waveData?.duration || asset?.duration || clip.duration;
    return getClipWaveformSlice(
      peaks,
      clip.duration,
      clip.sourceStart || 0,
      totalDuration,
      sampleCount
    );
  }, [waveData, asset?.waveform, asset?.duration, clip.duration, clip.sourceStart, sampleCount]);

  // Build SVG paths (Peak Polygon, RMS Core Polygon, and Vertical Transient Needles) in a single pass
  const { peakPolygonPoints, rmsPolygonPoints, transientNeedlesPath, svgWidth } = useMemo(() => {
    const n = slicePeaks.length;
    if (n === 0) {
      return { peakPolygonPoints: '', rmsPolygonPoints: '', transientNeedlesPath: '', svgWidth: 100 };
    }

    const stepX = 2;
    const totalW = n * stepX;
    const centerY = 54; // Slightly below clip header label for clean Premiere Pro clearance
    const maxHalfHeight = 40;

    const topPeakPts = [];
    const botPeakPts = [];
    const topRmsPts = [];
    const botRmsPts = [];
    let needlesD = '';

    for (let i = 0; i < n; i++) {
      const x = i * stepX + 1;
      const raw = slicePeaks[i] || 0.04;
      const scaledPeak = Math.min(0.98, raw * volumeFactor);

      // Peak envelope height
      const halfPeak = Math.max(1.2, scaledPeak * maxHalfHeight);
      const yTopPeak = (centerY - halfPeak).toFixed(1);
      const yBotPeak = (centerY + halfPeak).toFixed(1);

      topPeakPts.push(`${x},${yTopPeak}`);
      botPeakPts.push(`${x},${yBotPeak}`);

      // Inner RMS energy core (smoother, ~58% of peak amplitude)
      const prev = i > 0 ? slicePeaks[i - 1] : raw;
      const next = i < n - 1 ? slicePeaks[i + 1] : raw;
      const smoothed = ((prev + raw * 2 + next) * 0.25) * volumeFactor;
      const halfRms = Math.max(0.8, Math.min(0.95, smoothed * 0.62) * maxHalfHeight);
      topRmsPts.push(`${x},${(centerY - halfRms).toFixed(1)}`);
      botRmsPts.push(`${x},${(centerY + halfRms).toFixed(1)}`);

      // Crisp vertical transient needle
      needlesD += `M${x} ${yTopPeak}V${yBotPeak}`;
    }

    return {
      peakPolygonPoints: `${topPeakPts.join(' ')} ${botPeakPts.reverse().join(' ')}`,
      rmsPolygonPoints: `${topRmsPts.join(' ')} ${botRmsPts.reverse().join(' ')}`,
      transientNeedlesPath: needlesD,
      svgWidth: totalW
    };
  }, [slicePeaks, volumeFactor]);

  if (!width || width < 12 || sampleCount === 0) return null;

  const peakGradId = `pr-wave-peak-${clip.id}`;
  const rmsGradId = `pr-wave-rms-${clip.id}`;
  // Rubber-band volume line Y position (0dB = 100% at y=54, higher volume shifts line up, muted near bottom)
  const volumeLineY = clip?.muted
    ? 88
    : Math.max(18, Math.min(86, Math.round(54 - ((clip?.volume ?? 1) - 1) * 28)));

  return (
    <div className="audio-waveform-container" aria-hidden="true">
      <svg
        className="audio-waveform-svg"
        viewBox={`0 0 ${svgWidth} 100`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={peakGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#34d399" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={rmsGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ecfdf5" stopOpacity="0.65" />
            <stop offset="50%" stopColor="#a7f3d0" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ecfdf5" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* Subtle dB Grid Reference Lines (-6dB top/bottom & 0dB center axis) */}
        <line
          x1="0"
          y1="30"
          x2={svgWidth}
          y2="30"
          stroke="rgba(167, 243, 208, 0.12)"
          strokeWidth="0.7"
          strokeDasharray="3,3"
        />
        <line
          x1="0"
          y1="54"
          x2={svgWidth}
          y2="54"
          stroke="rgba(167, 243, 208, 0.28)"
          strokeWidth="0.9"
        />
        <line
          x1="0"
          y1="78"
          x2={svgWidth}
          y2="78"
          stroke="rgba(167, 243, 208, 0.12)"
          strokeWidth="0.7"
          strokeDasharray="3,3"
        />

        {/* 1. Outer Peak Silhouette Polygon */}
        <polygon
          points={peakPolygonPoints}
          fill={`url(#${peakGradId})`}
          opacity={clip?.muted ? 0.35 : 0.72}
        />

        {/* 2. High-Density Vertical Transient Needles (Premiere Pro crisp transients) */}
        <path
          d={transientNeedlesPath}
          stroke={clip?.muted ? 'rgba(110, 231, 183, 0.35)' : '#6ee7b7'}
          strokeWidth="1.05"
          vectorEffect="non-scaling-stroke"
          opacity={clip?.muted ? 0.4 : 0.92}
        />

        {/* 3. Inner RMS Acoustic Core Polygon */}
        <polygon
          points={rmsPolygonPoints}
          fill={`url(#${rmsGradId})`}
          opacity={clip?.muted ? 0.25 : 0.85}
        />

        {/* 4. Adobe Premiere Pro Horizontal Volume / Keyframe Rubber-Band Line */}
        <line
          x1="0"
          y1={volumeLineY}
          x2={svgWidth}
          y2={volumeLineY}
          stroke={clip?.muted ? 'rgba(244, 63, 94, 0.75)' : 'rgba(255, 255, 255, 0.75)'}
          strokeWidth="1.1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
});
