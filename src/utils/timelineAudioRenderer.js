/**
 * Timeline Audio Renderer for AI Transcription
 * Extracts, slices, and mixes audio clips strictly as arranged and trimmed on the timeline.
 * Ensures transcription only processes active cuts/trims and maps timestamps directly to timeline coordinates.
 */
import { extract16kMonoAudio, encodeWAV } from './audioExtractor';
import { getMediaBlob } from './storage';

/**
 * Returns a quick summary of audio available on timeline tracks for UI selectors and statistics.
 * @param {object} project Current project object
 * @returns {object} Summary of audio tracks, clip counts, and duration
 */
export function getTimelineAudioSummary(project) {
  if (!project || !project.tracks) {
    return {
      audioTracks: [],
      videoTracksWithAudio: [],
      totalAudioClips: 0,
      totalTimelineDuration: 0,
      effectiveAudioDuration: 0,
      hasTimelineAudio: false
    };
  }

  const audioTracks = (project.tracks || [])
    .filter(t => t.type === 'audio')
    .map(t => {
      const validClips = (t.clips || []).filter(c => c.duration > 0.05);
      const totalDuration = validClips.reduce((sum, c) => sum + (c.duration || 0), 0);
      return {
        id: t.id,
        name: t.name || `Pista ${t.id}`,
        clipCount: validClips.length,
        totalDuration,
        muted: Boolean(t.muted)
      };
    });

  const videoTracksWithAudio = (project.tracks || [])
    .filter(t => t.type === 'video')
    .map(t => {
      const validClips = (t.clips || []).filter(c => {
        if (!c.duration || c.duration <= 0.05) return false;
        const asset = (project.assets || []).find(a => a.id === c.assetId);
        return asset && (asset.type === 'video' || asset.type === 'audio');
      });
      const totalDuration = validClips.reduce((sum, c) => sum + (c.duration || 0), 0);
      return {
        id: t.id,
        name: t.name || `Pista ${t.id}`,
        clipCount: validClips.length,
        totalDuration,
        muted: Boolean(t.muted)
      };
    });

  const totalAudioClips = audioTracks.reduce((sum, t) => sum + t.clipCount, 0);
  const totalVideoClips = videoTracksWithAudio.reduce((sum, t) => sum + t.clipCount, 0);

  // Compute overall timeline span
  const allClips = (project.tracks || [])
    .filter(t => t.type === 'audio' || t.type === 'video')
    .flatMap(t => t.clips || []);

  const totalTimelineDuration = allClips.length > 0
    ? Math.max(...allClips.map(c => (c.startTime || 0) + (c.duration || 0)))
    : 0;

  const effectiveAudioDuration = audioTracks.reduce((sum, t) => sum + t.totalDuration, 0) ||
    videoTracksWithAudio.reduce((sum, t) => sum + t.totalDuration, 0);

  return {
    audioTracks,
    videoTracksWithAudio,
    totalAudioClips: totalAudioClips > 0 ? totalAudioClips : totalVideoClips,
    totalTimelineDuration,
    effectiveAudioDuration,
    hasTimelineAudio: totalAudioClips > 0 || totalVideoClips > 0
  };
}

/**
 * Extracts, slices, and mixes audio from timeline tracks taking into account cuts, trimming, and positioning.
 *
 * @param {object} project Current project
 * @param {object} options
 * @param {string} options.sourceMode 'timeline_all_audio' | 'timeline_track'
 * @param {string} [options.targetTrackId] Specific track ID if sourceMode === 'timeline_track'
 * @param {function} [options.onProgress] Progress callback ({ percent, message })
 * @returns {Promise<{
 *   wavBlob: Blob,
 *   float32Data: Float32Array,
 *   sampleRate: number,
 *   duration: number,
 *   activeIntervals: Array<{ clipId: string, trackId: string, clipName: string, startTime: number, endTime: number, sourceStart: number }>,
 *   totalClipsCount: number,
 *   effectiveDuration: number
 * }>}
 */
export async function renderTimelineAudio(project, options = {}) {
  const {
    sourceMode = 'timeline_all_audio',
    targetTrackId = null,
    onProgress = () => {}
  } = options;

  onProgress({ percent: 5, message: 'Analizando pistas y cortes de la línea de tiempo...' });

  if (!project || !project.tracks || project.tracks.length === 0) {
    throw new Error('El proyecto no contiene pistas en la línea de tiempo.');
  }

  // 1. Gather target clips according to selected mode
  let targetClips = [];

  if (sourceMode === 'timeline_track' && targetTrackId) {
    const track = project.tracks.find(t => t.id === targetTrackId);
    if (!track) {
      throw new Error(`La pista seleccionada (${targetTrackId}) no existe en el proyecto.`);
    }
    targetClips = (track.clips || [])
      .filter(c => c.duration > 0.05)
      .map(c => ({ ...c, trackId: track.id, trackName: track.name }));
  } else {
    // Mode 'timeline_all_audio': pick all unmuted audio tracks
    const audioTracks = project.tracks.filter(t => t.type === 'audio' && !t.muted);
    const audioClips = audioTracks.flatMap(t =>
      (t.clips || []).filter(c => c.duration > 0.05).map(c => ({ ...c, trackId: t.id, trackName: t.name }))
    );

    if (audioClips.length > 0) {
      targetClips = audioClips;
    } else {
      // Fallback: check unmuted video tracks with clips
      const videoTracks = project.tracks.filter(t => t.type === 'video' && !t.muted);
      targetClips = videoTracks.flatMap(t =>
        (t.clips || []).filter(c => c.duration > 0.05).map(c => ({ ...c, trackId: t.id, trackName: t.name }))
      );
    }
  }

  if (targetClips.length === 0) {
    throw new Error(
      'No se encontraron clips de audio en las pistas seleccionadas de la línea de tiempo. ' +
      'Asegúrate de colocar clips de audio o video en el montaje antes de transcribir.'
    );
  }

  onProgress({ percent: 12, message: `Se detectaron ${targetClips.length} cortes/clips en la línea de tiempo.` });

  // 2. Identify all unique assets needed
  const uniqueAssetIds = Array.from(new Set(targetClips.map(c => c.assetId).filter(Boolean)));
  if (uniqueAssetIds.length === 0) {
    throw new Error('Los clips en la línea de tiempo no tienen archivos multimedia asociados.');
  }

  // 3. Decode & cache 16kHz mono audio for each unique asset once
  const assetBuffers = new Map();
  const totalAssets = uniqueAssetIds.length;

  for (let i = 0; i < totalAssets; i++) {
    const assetId = uniqueAssetIds[i];
    const asset = (project.assets || []).find(a => a.id === assetId);
    if (!asset) {
      console.warn(`Asset ${assetId} not found in project.assets`);
      continue;
    }

    const currentPercent = Math.round(15 + (i / totalAssets) * 35);
    onProgress({
      percent: currentPercent,
      message: `Cargando y decodificando audio: ${asset.name || 'recurso'} (${i + 1}/${totalAssets})...`
    });

    try {
      let source = asset.url;
      const storedBlob = await getMediaBlob(asset.id);
      if (storedBlob) {
        source = storedBlob;
      }

      if (!source) {
        console.warn(`No media blob or URL available for asset ${asset.id}`);
        continue;
      }

      const decoded = await extract16kMonoAudio(source);
      assetBuffers.set(assetId, decoded);
    } catch (err) {
      console.error(`Error decoding audio for asset ${asset.name}:`, err);
    }
  }

  if (assetBuffers.size === 0) {
    throw new Error('No se pudo decodificar el audio de los archivos en la línea de tiempo.');
  }

  onProgress({ percent: 55, message: 'Montando y mezclando cortes a la línea de tiempo (16kHz mono)...' });

  // 4. Calculate total timeline duration to render
  const maxEndTime = Math.max(...targetClips.map(c => (c.startTime || 0) + (c.duration || 0)));
  const sampleRate = 16000;
  const totalSamples = Math.ceil(maxEndTime * sampleRate);

  // Allocate composite timeline audio buffer initialized to silence (0.0)
  const timelineBuffer = new Float32Array(totalSamples);
  const activeIntervals = [];

  // 5. Slice and place each clip into the exact timeline position
  for (const clip of targetClips) {
    const assetData = assetBuffers.get(clip.assetId);
    if (!assetData || !assetData.float32Data) continue;

    const srcData = assetData.float32Data;
    const sourceStartSec = clip.sourceStart || 0;
    const durationSec = clip.duration;
    const startTimeSec = clip.startTime || 0;

    const srcStartSample = Math.floor(sourceStartSec * sampleRate);
    const srcEndSample = Math.min(srcData.length, Math.floor((sourceStartSec + durationSec) * sampleRate));

    if (srcStartSample >= srcData.length || srcEndSample <= srcStartSample) {
      continue;
    }

    const slice = srcData.subarray(srcStartSample, srcEndSample);
    const dstStartSample = Math.floor(startTimeSec * sampleRate);
    const dstEndSample = Math.min(timelineBuffer.length, dstStartSample + slice.length);
    const volume = clip.volume !== undefined ? clip.volume : 1.0;

    for (let j = 0; j < (dstEndSample - dstStartSample); j++) {
      timelineBuffer[dstStartSample + j] += slice[j] * volume;
    }

    activeIntervals.push({
      clipId: clip.id,
      trackId: clip.trackId,
      clipName: clip.name,
      startTime: Number(startTimeSec.toFixed(2)),
      endTime: Number((startTimeSec + durationSec).toFixed(2)),
      sourceStart: Number(sourceStartSec.toFixed(2)),
      duration: Number(durationSec.toFixed(2))
    });
  }

  onProgress({ percent: 75, message: 'Normalizando mezcla de audio y evitando distorsión...' });

  // 6. Normalize peak volume to prevent digital clipping if overlapping tracks exist
  let maxPeak = 0;
  for (let i = 0; i < timelineBuffer.length; i++) {
    const val = Math.abs(timelineBuffer[i]);
    if (val > maxPeak) maxPeak = val;
  }

  if (maxPeak > 1.0) {
    const invPeak = 0.98 / maxPeak;
    for (let i = 0; i < timelineBuffer.length; i++) {
      timelineBuffer[i] *= invPeak;
    }
  }

  onProgress({ percent: 85, message: 'Codificando pista de línea de tiempo en WAV estándar...' });

  // 7. Encode to standard WAV Blob
  const wavBlob = encodeWAV(timelineBuffer, sampleRate);

  const effectiveDuration = targetClips.reduce((sum, c) => sum + c.duration, 0);

  onProgress({ percent: 95, message: 'Audio de línea de tiempo listo para transcripción con IA.' });

  return {
    wavBlob,
    float32Data: timelineBuffer,
    sampleRate,
    duration: maxEndTime,
    activeIntervals,
    totalClipsCount: targetClips.length,
    effectiveDuration: Number(effectiveDuration.toFixed(2))
  };
}

/**
 * Filters and clamps raw AI transcribed segments strictly within the active clip intervals of the timeline.
 * Discards speech hallucinations generated over silent gaps where clips were cut out.
 *
 * @param {Array<{ id: string, start: number, end: number, text: string }>} segments
 * @param {Array<{ clipId: string, trackId: string, clipName: string, startTime: number, endTime: number }>} activeIntervals
 * @returns {Array<{ id: string, start: number, end: number, text: string, clipId?: string }>}
 */
export function filterSegmentsToTimelineCuts(segments, activeIntervals) {
  if (!segments || segments.length === 0) return [];
  if (!activeIntervals || activeIntervals.length === 0) return segments;

  const filtered = [];

  for (const seg of segments) {
    // Check if segment has any overlap with any active clip on timeline
    // Overlap condition: seg.start < interval.endTime && seg.end > interval.startTime
    const overlapping = activeIntervals.filter(iv =>
      seg.start < (iv.endTime + 0.15) && seg.end > (iv.startTime - 0.15)
    );

    if (overlapping.length === 0) {
      // Completely in a silent gap where audio was cut/deleted -> drop hallucination
      continue;
    }

    // Find the best interval with highest overlap
    let bestInterval = overlapping[0];
    let maxOverlap = 0;

    for (const iv of overlapping) {
      const overlapStart = Math.max(seg.start, iv.startTime);
      const overlapEnd = Math.min(seg.end, iv.endTime);
      const overlapDur = Math.max(0, overlapEnd - overlapStart);
      if (overlapDur > maxOverlap) {
        maxOverlap = overlapDur;
        bestInterval = iv;
      }
    }

    // Clamp start and end to the timeline clip boundary
    const clampedStart = Number(Math.max(bestInterval.startTime, seg.start).toFixed(2));
    const clampedEnd = Number(Math.min(bestInterval.endTime, seg.end).toFixed(2));

    if (clampedEnd > clampedStart + 0.15) {
      filtered.push({
        ...seg,
        start: clampedStart,
        end: clampedEnd,
        clipId: bestInterval.clipId,
        trackId: bestInterval.trackId
      });
    }
  }

  // Sort by start timestamp
  filtered.sort((a, b) => a.start - b.start);
  return filtered;
}
