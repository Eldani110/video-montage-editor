/**
 * Audio Waveform & Duration Engine
 * Extracts high-fidelity audio peaks and exact duration using Web Audio API.
 * Provides caching and real-time slice computation for timeline clips.
 */

// In-memory cache for waveform peaks and exact durations
const waveformCache = new Map();
const inFlightRequests = new Map();

/**
 * Extracts exact duration and normalized peak amplitudes from an audio source (File, Blob, or URL).
 * @param {File|Blob|string} source
 * @param {number} numPoints Total points across the whole audio file
 * @returns {Promise<{ duration: number, peaks: number[] }>}
 */
export async function extractWaveformData(source, numPoints = 300) {
  let arrayBuffer;

  if (source instanceof Blob || source instanceof File) {
    arrayBuffer = await source.arrayBuffer();
  } else if (typeof source === 'string') {
    const res = await fetch(source);
    arrayBuffer = await res.arrayBuffer();
  } else {
    throw new Error('Formato de fuente de audio no compatible');
  }

  // Create temporary AudioContext to decode audio
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API no soportado');
  }

  const audioCtx = new AudioContextClass();
  let audioBuffer;

  try {
    // Clone buffer in case decodeAudioData neuters it
    const bufferCopy = arrayBuffer.slice(0);
    audioBuffer = await audioCtx.decodeAudioData(bufferCopy);
  } finally {
    audioCtx.close().catch(() => {});
  }

  const duration = Number(audioBuffer.duration.toFixed(2));
  const channelData = audioBuffer.getChannelData(0); // Left/Mono channel
  const totalSamples = channelData.length;
  const blockSize = Math.max(1, Math.floor(totalSamples / numPoints));
  const rawPeaks = [];

  for (let i = 0; i < numPoints; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, totalSamples);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const absVal = Math.abs(channelData[j]);
      if (absVal > peak) peak = absVal;
    }
    rawPeaks.push(peak);
  }

  // Find max amplitude for normalization
  let maxPeak = 0;
  for (let i = 0; i < rawPeaks.length; i++) {
    if (rawPeaks[i] > maxPeak) maxPeak = rawPeaks[i];
  }

  const normalizedPeaks = rawPeaks.map(p => {
    if (maxPeak <= 0.001) return 0.08; // Quiet baseline for pure silence
    const ratio = p / maxPeak;
    // Map smoothly with minimum floor of 0.08 so zero sounds still show a sleek baseline
    return Number(Math.max(0.08, Math.min(1.0, ratio)).toFixed(3));
  });

  return {
    duration,
    peaks: normalizedPeaks
  };
}

/**
 * Gets cached waveform or fetches and caches it asynchronously.
 * @param {object} asset The asset object { id, url, file, duration, waveform }
 * @returns {Promise<{ duration: number, peaks: number[] }|null>}
 */
export async function getOrLoadWaveform(asset) {
  if (!asset) return null;

  const cacheKey = asset.id || asset.url;
  if (waveformCache.has(cacheKey)) {
    return waveformCache.get(cacheKey);
  }

  if (asset.waveform && Array.isArray(asset.waveform) && asset.waveform.length > 0) {
    const data = {
      duration: asset.duration || 10,
      peaks: asset.waveform
    };
    waveformCache.set(cacheKey, data);
    return data;
  }

  // Check if there is already an in-flight promise for this asset
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const source = asset.file || asset.url;
      if (!source) return null;

      const data = await extractWaveformData(source, 300);
      waveformCache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.warn(`[audioWaveform] Error al extraer onda para asset ${asset.name || asset.id}:`, err);
      // Fallback: procedural wave based on duration
      const duration = (asset.duration && isFinite(asset.duration)) ? asset.duration : 10;
      const proceduralPeaks = Array.from({ length: 100 }, (_, idx) => {
        return Number((0.2 + 0.5 * Math.sin(idx * 0.35) * Math.sin(idx * 0.12)).toFixed(3));
      });
      const fallbackData = { duration, peaks: proceduralPeaks };
      waveformCache.set(cacheKey, fallbackData);
      return fallbackData;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Returns synchronous cached waveform peaks if already decoded.
 */
export function getCachedWaveform(assetIdOrUrl) {
  return waveformCache.get(assetIdOrUrl) || null;
}

/**
 * Slices the asset's full waveform peaks to the clip's specific [sourceStart, sourceStart + duration] range.
 * @param {number[]} fullPeaks Full audio peaks array
 * @param {number} clipDuration Current duration of the clip in timeline
 * @param {number} sourceStart In-point offset into source file
 * @param {number} totalAssetDuration Total duration of the underlying audio asset
 * @param {number} targetBarCount Number of visual bars to produce for the clip
 * @returns {number[]} Sliced and resampled peaks
 */
export function getClipWaveformSlice(fullPeaks, clipDuration, sourceStart = 0, totalAssetDuration = 0, targetBarCount = 100) {
  if (!fullPeaks || fullPeaks.length === 0) {
    return Array(targetBarCount).fill(0.12);
  }

  const assetDur = totalAssetDuration > 0 ? totalAssetDuration : (sourceStart + clipDuration);
  const startFrac = Math.max(0, Math.min(0.999, (sourceStart || 0) / assetDur));
  const endFrac = Math.max(startFrac + 0.001, Math.min(1.0, ((sourceStart || 0) + clipDuration) / assetDur));

  const totalPeaks = fullPeaks.length;
  const startIdx = Math.floor(startFrac * totalPeaks);
  const endIdx = Math.min(totalPeaks, Math.ceil(endFrac * totalPeaks));

  const rawSlice = fullPeaks.slice(startIdx, Math.max(startIdx + 1, endIdx));
  if (rawSlice.length === 0) {
    return Array(targetBarCount).fill(0.12);
  }

  // Resample rawSlice to exactly targetBarCount bars
  const result = [];
  const step = rawSlice.length / targetBarCount;

  for (let i = 0; i < targetBarCount; i++) {
    const fromIndex = Math.floor(i * step);
    const toIndex = Math.min(rawSlice.length, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = fromIndex; j < toIndex; j++) {
      if (rawSlice[j] > max) max = rawSlice[j];
    }
    result.push(max > 0 ? max : (rawSlice[fromIndex] || 0.1));
  }

  return result;
}
