/**
 * AI Auto-Cut Engine (Recortes Automáticos IA)
 * 
 * Provides:
 * 1. Millisecond-accurate silence & breath detection from audio waveform (RMS energy).
 * 2. Speech-to-text alignment using local Whisper (or existing project transcripts).
 * 3. Intelligent repeated takes & false start detection (detects when a speaker stumbles and re-records the same idea/phrase).
 * 4. Filler words and stutter detection ("eh", "um", "ah", "este...").
 * 5. Configurable safety padding / margin to prevent cutting speech abruptly ("alargar la toma").
 * 6. Non-destructive timeline cut applicator with seamless ripple closing and companion track synchronization.
 */

import { extract16kMonoAudio } from './audioExtractor';
import { getMediaBlob } from './storage';

// Common Spanish filler words / muletillas and hesitation stumbles
export const SPANISH_FILLER_WORDS = new Set([
  'eh', 'ehh', 'ehhh', 'em', 'emm', 'um', 'umm', 'ummm', 'uh', 'uhh',
  'ah', 'ahh', 'este', 'estee', 'mmm', 'mm', 'bueno', 'o sea'
]);

/**
 * Normalizes text for semantic and phrase-level comparison:
 * Lowercases, strips punctuation, normalizes whitespace and accents.
 */
export function normalizeTextForComparison(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\w\s]/g, ' ')       // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Jaccard word similarity between two phrases (0.0 to 1.0)
 */
export function computeWordSimilarity(textA, textB) {
  const normA = normalizeTextForComparison(textA);
  const normB = normalizeTextForComparison(textB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const wordsA = normA.split(' ').filter(w => w.length > 1 && !SPANISH_FILLER_WORDS.has(w));
  const wordsB = normB.split(' ').filter(w => w.length > 1 && !SPANISH_FILLER_WORDS.has(w));
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? (intersection / union) : 0;
}

/**
 * Detects common prefix words between two phrases
 */
export function countMatchingPrefixWords(textA, textB) {
  const wordsA = normalizeTextForComparison(textA).split(' ').filter(Boolean);
  const wordsB = normalizeTextForComparison(textB).split(' ').filter(Boolean);
  let count = 0;
  const minLen = Math.min(wordsA.length, wordsB.length);
  for (let i = 0; i < minLen; i++) {
    if (wordsA[i] === wordsB[i]) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Detects silences and breathing pauses directly from 16kHz mono audio Float32Array using RMS energy.
 * @param {Float32Array} float32Data Audio samples
 * @param {number} sampleRate e.g. 16000
 * @param {object} options { minSilenceDuration, energyThreshold, frameSizeMs }
 * @returns {Array<{ start: number, end: number, duration: number }>}
 */
export function detectAudioSilences(float32Data, sampleRate = 16000, options = {}) {
  const {
    minSilenceDuration = 0.45, // seconds
    energyThreshold = 0.012,   // ~ -38 dB
    frameSizeMs = 20           // 20ms frame = 320 samples at 16kHz
  } = options;

  if (!float32Data || float32Data.length === 0) return [];

  const frameSamples = Math.floor((frameSizeMs / 1000) * sampleRate);
  const totalFrames = Math.floor(float32Data.length / frameSamples);
  const isSilentFrame = new Uint8Array(totalFrames);

  for (let f = 0; f < totalFrames; f++) {
    const startSample = f * frameSamples;
    let sumSq = 0;
    for (let i = 0; i < frameSamples; i++) {
      const s = float32Data[startSample + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / frameSamples);
    if (rms < energyThreshold) {
      isSilentFrame[f] = 1;
    }
  }

  // Group contiguous silent frames
  const rawSilences = [];
  let inSilence = false;
  let silenceStartFrame = 0;

  for (let f = 0; f < totalFrames; f++) {
    if (isSilentFrame[f] === 1) {
      if (!inSilence) {
        inSilence = true;
        silenceStartFrame = f;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        const durSec = (f - silenceStartFrame) * (frameSizeMs / 1000);
        if (durSec >= minSilenceDuration) {
          rawSilences.push({
            start: Number((silenceStartFrame * (frameSizeMs / 1000)).toFixed(2)),
            end: Number((f * (frameSizeMs / 1000)).toFixed(2)),
            duration: Number(durSec.toFixed(2))
          });
        }
      }
    }
  }

  if (inSilence) {
    const durSec = (totalFrames - silenceStartFrame) * (frameSizeMs / 1000);
    if (durSec >= minSilenceDuration) {
      rawSilences.push({
        start: Number((silenceStartFrame * (frameSizeMs / 1000)).toFixed(2)),
        end: Number((totalFrames * (frameSizeMs / 1000)).toFixed(2)),
        duration: Number(durSec.toFixed(2))
      });
    }
  }

  // Merge silences that are separated by micro-blips (< 60ms)
  const merged = [];
  for (const s of rawSilences) {
    if (merged.length === 0) {
      merged.push({ ...s });
      continue;
    }
    const prev = merged[merged.length - 1];
    if (s.start - prev.end < 0.08) {
      prev.end = s.end;
      prev.duration = Number((prev.end - prev.start).toFixed(2));
    } else {
      merged.push({ ...s });
    }
  }

  return merged;
}

/**
 * Downsamples float32 audio data into normalized peak amplitudes (0.0 to 1.0)
 * for visual acoustic waveform rendering in the editor scrubber strip.
 */
export function extractWaveformPeaks(float32Data, targetPoints = 300) {
  if (!float32Data || float32Data.length === 0) return [];
  const blockSize = Math.floor(float32Data.length / targetPoints);
  if (blockSize <= 0) return [];

  const peaks = [];
  for (let i = 0; i < targetPoints; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, float32Data.length);
    let maxAmp = 0;
    for (let j = start; j < end; j++) {
      const absVal = Math.abs(float32Data[j]);
      if (absVal > maxAmp) maxAmp = absVal;
    }
    peaks.push(Number(Math.min(1.0, maxAmp * 1.6).toFixed(3)));
  }
  return peaks;
}

/**
 * Acoustically aligns speech segment boundaries to the physical audio waveform onset and decay.
 * Inspects a window around start and end timestamps, finding where vocal energy actually rises and falls.
 * Guarantees millimetric cut placement without clipping consonants or breath pauses.
 */
export function refineSpeechBoundariesWithWaveform(segments, float32Data, sampleRate = 16000, options = {}) {
  if (!float32Data || float32Data.length === 0 || !segments || segments.length === 0) {
    return segments;
  }

  const {
    energyThreshold = 0.010, // ~ -40dB noise floor
    searchWindowSec = 0.45,  // ±450ms search window
    frameSizeMs = 15         // 15ms frame resolution
  } = options;

  const frameSamples = Math.floor((frameSizeMs / 1000) * sampleRate);
  const totalFrames = Math.floor(float32Data.length / frameSamples);

  const getFrameRms = (frameIdx) => {
    if (frameIdx < 0 || frameIdx >= totalFrames) return 0;
    const startSample = frameIdx * frameSamples;
    let sumSq = 0;
    for (let i = 0; i < frameSamples; i++) {
      const s = float32Data[startSample + i];
      sumSq += s * s;
    }
    return Math.sqrt(sumSq / frameSamples);
  };

  return segments.map((seg) => {
    const rawStartFrame = Math.round((seg.start * sampleRate) / frameSamples);
    const rawEndFrame = Math.round((seg.end * sampleRate) / frameSamples);
    const windowFrames = Math.round((searchWindowSec * sampleRate) / frameSamples);

    // 1. Refine onset: search for where energy rises from silence to voice
    let bestStartFrame = rawStartFrame;
    const minStartSearch = Math.max(0, rawStartFrame - windowFrames);
    const maxStartSearch = Math.min(rawEndFrame - 2, rawStartFrame + windowFrames);

    if (getFrameRms(rawStartFrame) >= energyThreshold) {
      for (let f = rawStartFrame; f >= minStartSearch; f--) {
        if (getFrameRms(f) < energyThreshold) {
          bestStartFrame = f + 1;
          break;
        }
      }
    } else {
      for (let f = rawStartFrame; f <= maxStartSearch; f++) {
        if (getFrameRms(f) >= energyThreshold) {
          bestStartFrame = f;
          break;
        }
      }
    }

    // 2. Refine offset: search for where energy decays into silence
    let bestEndFrame = rawEndFrame;
    const minEndSearch = Math.max(bestStartFrame + 2, rawEndFrame - windowFrames);
    const maxEndSearch = Math.min(totalFrames - 1, rawEndFrame + windowFrames);

    if (getFrameRms(rawEndFrame) < energyThreshold) {
      for (let f = rawEndFrame; f >= minEndSearch; f--) {
        if (getFrameRms(f) >= energyThreshold) {
          bestEndFrame = f + 1;
          break;
        }
      }
    } else {
      for (let f = rawEndFrame; f <= maxEndSearch; f++) {
        if (getFrameRms(f) < energyThreshold) {
          bestEndFrame = f;
          break;
        }
      }
    }

    const refinedStart = Number((bestStartFrame * (frameSizeMs / 1000)).toFixed(2));
    const refinedEnd = Number((bestEndFrame * (frameSizeMs / 1000)).toFixed(2));

    return {
      ...seg,
      start: refinedStart,
      end: Math.max(refinedStart + 0.15, refinedEnd)
    };
  });
}

/**
 * Detects repeated take groups (false starts / restarts / stumbles with the same intention).
 * E.g., "Hola bienvenidos a mi canal de Youtube... [pausa]... Hola amigos bienvenidos a mi canal de gameplays"
 */
export function detectRepeatedTakes(speechSegments, similarityThreshold = 0.40) {
  if (!speechSegments || speechSegments.length < 2) return [];

  const groups = [];
  const visited = new Set();

  for (let i = 0; i < speechSegments.length - 1; i++) {
    if (visited.has(i)) continue;
    const segA = speechSegments[i];
    const textA = segA.text || '';
    if (textA.length < 5) continue;

    const groupCandidates = [i];

    // Look ahead up to 3 segments for repetition
    for (let j = i + 1; j < Math.min(speechSegments.length, i + 4); j++) {
      if (visited.has(j)) continue;
      const segB = speechSegments[j];
      const textB = segB.text || '';
      if (textB.length < 5) continue;

      const sim = computeWordSimilarity(textA, textB);
      const prefixMatch = countMatchingPrefixWords(textA, textB);

      // Condition: high word similarity or 2+ matching prefix words
      if (sim >= similarityThreshold || prefixMatch >= 2) {
        groupCandidates.push(j);
      } else {
        break;
      }
    }

    if (groupCandidates.length > 1) {
      groupCandidates.forEach(idx => visited.add(idx));

      // Build repeated group
      // By default: the LAST take in the candidate series is the successful final take (Keeper / Recommended)!
      // The earlier takes were false starts/stumbles (Cut / Discarded).
      const takes = groupCandidates.map((idx, takeNum) => {
        const seg = speechSegments[idx];
        const isLastTake = takeNum === groupCandidates.length - 1;
        return {
          id: `take_${seg.id || idx}`,
          segmentIndex: idx,
          takeNumber: takeNum + 1,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          isRecommended: isLastTake,
          isChosen: isLastTake // true for winning take, false for discarded take
        };
      });

      const firstSeg = speechSegments[groupCandidates[0]];
      const lastSeg = speechSegments[groupCandidates[groupCandidates.length - 1]];

      groups.push({
        id: `repeat_group_${Date.now()}_${i}`,
        start: firstSeg.start,
        end: lastSeg.end,
        title: `Re-grabación / Misma intención (${takes.length} tomas)`,
        takes
      });
    }
  }

  return groups;
}

/**
 * Builds composite cut intervals combining speech segments, silences, repeated takes and filler words,
 * applying safety padding/margin around kept words.
 */
export function buildCompositeCutIntervals({
  speechSegments = [],
  silences = [],
  repeatedTakeGroups = [],
  editorBrainCuts = [],
  totalDuration = 0,
  settings = {}
}) {
  const {
    paddingMs = 120,           // Margin buffer in ms (default 120ms)
    filterSilences = true,
    filterRepeatedTakes = true,
    filterFillerWords = true,
    minSilenceDuration = 0.35  // Default 350ms catches normal breathing pauses
  } = settings;

  const paddingSec = Math.max(0, paddingMs / 1000);

  // 1. Collect all candidate cut intervals across timeline
  const rawCutIntervals = [];

  // A. Waveform RMS silences and pauses (Manually tuned by user)
  if (filterSilences) {
    (silences || []).forEach((s) => {
      if (s.duration >= minSilenceDuration) {
        // Pad silence so speech boundaries have natural breathing headroom
        const maxPad = Math.max(0, (s.duration - 0.08) / 2);
        const pad = Math.min(paddingSec, maxPad);
        const cutStart = Number((s.start + pad).toFixed(2));
        const cutEnd = Number((s.end - pad).toFixed(2));
        if (cutEnd > cutStart + 0.05) {
          rawCutIntervals.push({
            start: cutStart,
            end: cutEnd,
            duration: Number((cutEnd - cutStart).toFixed(2)),
            type: 'silence',
            cutReason: `Pausa de respiración / Silencio (${s.duration.toFixed(1)}s)`,
            text: `[Pausa / Silencio ${s.duration.toFixed(1)}s]`
          });
        }
      }
    });
  }

  // B. Discarded takes from repeated take groups
  if (filterRepeatedTakes) {
    (repeatedTakeGroups || []).forEach((grp) => {
      grp.takes.forEach((t) => {
        if (!t.isChosen) {
          rawCutIntervals.push({
            start: t.start,
            end: t.end,
            duration: Number((t.end - t.start).toFixed(2)),
            type: 'repeated_take',
            groupId: grp.id,
            cutReason: `Toma ${t.takeNumber} descartada (Re-grabada en Toma ${grp.takes.find(x => x.isChosen)?.takeNumber || 2})`,
            text: `[Toma descartada: "${(t.text || '').slice(0, 35)}..."]`
          });
        }
      });
    });
  }

  // C. Standalone filler words and hesitations ("eh", "um", "este...")
  if (filterFillerWords) {
    (speechSegments || []).forEach((seg) => {
      const norm = normalizeTextForComparison(seg.text);
      if (SPANISH_FILLER_WORDS.has(norm)) {
        rawCutIntervals.push({
          start: seg.start,
          end: seg.end,
          duration: Number((seg.end - seg.start).toFixed(2)),
          type: 'filler',
          cutReason: `Muletilla / Vacilación ("${seg.text}")`,
          text: `[Muletilla: "${seg.text}"]`
        });
      }
    });
  }

  // D. Persistent Cerebro Editor IA Semantic Cuts (Mistakes, false starts, and abandoned sentences)
  if (editorBrainCuts && editorBrainCuts.length > 0) {
    editorBrainCuts.forEach((bc) => {
      rawCutIntervals.push({
        start: bc.start,
        end: bc.end,
        duration: bc.duration || Number((bc.end - bc.start).toFixed(2)),
        type: bc.type || 'mistake_discard',
        cutReason: bc.reasoning || bc.cutReason || 'Poda editorial por Cerebro IA',
        text: bc.text || '[Corte Cerebro IA]'
      });
    });
  }

  // Sort and merge overlapping cut intervals
  rawCutIntervals.sort((a, b) => a.start - b.start);
  const mergedCuts = [];
  for (const c of rawCutIntervals) {
    if (mergedCuts.length === 0) {
      mergedCuts.push({ ...c });
      continue;
    }
    const last = mergedCuts[mergedCuts.length - 1];
    if (c.start <= last.end + 0.05) {
      // Overlapping or touching cuts: merge into one cut
      last.end = Math.max(last.end, c.end);
      last.duration = Number((last.end - last.start).toFixed(2));
      // Give semantic mistake/false start priority over generic silence for styling & reasoning
      if (c.type === 'mistake_discard' || c.type === 'false_start') {
        last.type = c.type;
        last.text = c.text;
      }
      last.cutReason = `${last.cutReason} + ${c.cutReason}`;
    } else {
      mergedCuts.push({ ...c });
    }
  }

  // 2. Build complete chronological partitions covering [0, totalDuration]
  const partitions = [];
  let cur = 0;

  for (let i = 0; i < mergedCuts.length; i++) {
    const cut = mergedCuts[i];

    // Kept speech interval before cut
    if (cut.start > cur + 0.05) {
      const keptDur = Number((cut.start - cur).toFixed(2));
      const overlapping = (speechSegments || []).filter(s => s.end > cur + 0.05 && s.start < cut.start - 0.05);
      const text = overlapping.map(s => s.text).join(' ').trim() || `Locución (${keptDur}s)`;
      partitions.push({
        id: `kept_${cur.toFixed(2)}`,
        start: cur,
        end: cut.start,
        duration: keptDur,
        type: 'speech',
        isCut: false,
        text
      });
    }

    partitions.push({
      id: `cut_${cut.start.toFixed(2)}`,
      start: cut.start,
      end: cut.end,
      duration: cut.duration,
      type: cut.type || 'silence',
      isCut: true,
      cutReason: cut.cutReason,
      text: cut.text,
      groupId: cut.groupId
    });

    cur = Math.max(cur, cut.end);
  }

  // Trailing kept region
  if (totalDuration > cur + 0.05) {
    const keptDur = Number((totalDuration - cur).toFixed(2));
    const overlapping = (speechSegments || []).filter(s => s.end > cur + 0.05 && s.start < totalDuration - 0.05);
    const text = overlapping.map(s => s.text).join(' ').trim() || `Locución (${keptDur}s)`;
    partitions.push({
      id: `kept_${cur.toFixed(2)}`,
      start: cur,
      end: totalDuration,
      duration: keptDur,
      type: 'speech',
      isCut: false,
      text
    });
  }

  return partitions;
}

/**
 * Full Analysis Coordinator:
 * Extracts audio from target clips on timeline, runs local Whisper, detects silences & repeated takes,
 * and builds initial cut partitions.
 */
export async function analyzeClipsForAutoCut({
  project,
  targetClipIds = [],
  onProgress = () => {},
  abortController = null,
  options = {}
}) {
  onProgress({ percent: 5, stage: 'locating_clips', message: 'Identificando clips seleccionados en la línea de tiempo...' });

  if (!project || !project.tracks) {
    throw new Error('El proyecto no contiene pistas en la línea de tiempo.');
  }

  // 1. Resolve target clips
  const idSet = new Set(targetClipIds || []);
  let targetClips = [];

  for (const track of project.tracks) {
    if (track.locked || track.visible === false) continue;
    for (const clip of (track.clips || [])) {
      if (idSet.has(clip.id)) {
        targetClips.push({ ...clip, trackType: track.type, trackId: track.id });
      }
    }
  }

  // If no clips were explicitly selected, auto-select all unmuted video or audio clips on timeline
  if (targetClips.length === 0) {
    const candidateTrack = project.tracks.find(t => (t.type === 'video' || t.type === 'audio') && !t.locked && !t.muted && (t.clips || []).length > 0);
    if (candidateTrack) {
      targetClips = (candidateTrack.clips || []).map(c => ({ ...c, trackType: candidateTrack.type, trackId: candidateTrack.id }));
    }
  }

  if (targetClips.length === 0) {
    throw new Error('No hay clips de video o audio en la línea de tiempo. Por favor, agrega o selecciona los clips que deseas recortar.');
  }

  targetClips.sort((a, b) => a.startTime - b.startTime);

  const minStartTime = Math.min(...targetClips.map(c => c.startTime));
  const maxEndTime = Math.max(...targetClips.map(c => c.startTime + c.duration));
  const totalSpanDuration = Number((maxEndTime - minStartTime).toFixed(2));

  onProgress({
    percent: 15,
    stage: 'extracting_audio',
    message: `Extrayendo y optimizando audio de ${targetClips.length} clips (${totalSpanDuration}s)...`
  });

  // 2. Decode audio for each unique asset
  const uniqueAssetIds = Array.from(new Set(targetClips.map(c => c.assetId).filter(Boolean)));
  const assetAudioMap = new Map();

  for (let i = 0; i < uniqueAssetIds.length; i++) {
    const assetId = uniqueAssetIds[i];
    const asset = (project.assets || []).find(a => a.id === assetId);
    if (!asset) continue;

    let source = null;
    // Always prefer lightweight audio endpoint (~150 KB) from backend instead of multi-hundred MB video container
    if (asset.diskPath || (asset.url && asset.url.includes('/media-library/'))) {
      source = `/media-library/audio?path=${encodeURIComponent(asset.diskPath || asset.name)}`;
    } else {
      const storedBlob = await getMediaBlob(asset.id);
      if (storedBlob) {
        source = storedBlob;
      } else if (asset.file && asset.file.size > 0 && asset.file.size <= 25 * 1024 * 1024) {
        source = asset.file;
      } else if (asset.url) {
        source = asset.url;
      }
    }

    if (!source) continue;

    try {
      const extracted = await extract16kMonoAudio(source);
      assetAudioMap.set(assetId, extracted);
    } catch (err) {
      console.warn('[autoCutEngine] Primary audio extraction failed for asset:', asset.name, err);
      if (asset.url && source !== asset.url) {
        try {
          const fallbackExtracted = await extract16kMonoAudio(asset.url);
          assetAudioMap.set(assetId, fallbackExtracted);
        } catch {}
      }
    }
  }

  // 3. Assemble composite audio buffer for the selected clips' span
  const sampleRate = 16000;
  const compositeSamples = Math.ceil(totalSpanDuration * sampleRate);
  const compositeBuffer = new Float32Array(compositeSamples);

  for (const clip of targetClips) {
    const assetData = assetAudioMap.get(clip.assetId);
    if (!assetData || !assetData.float32Data) continue;

    const srcData = assetData.float32Data;
    const sourceStartSample = Math.floor((clip.sourceStart || 0) * sampleRate);
    const destStartSample = Math.floor((clip.startTime - minStartTime) * sampleRate);
    const numSamples = Math.min(
      Math.floor(clip.duration * sampleRate),
      srcData.length - sourceStartSample,
      compositeSamples - destStartSample
    );

    if (numSamples > 0 && sourceStartSample >= 0 && destStartSample >= 0) {
      for (let s = 0; s < numSamples; s++) {
        compositeBuffer[destStartSample + s] = srcData[sourceStartSample + s];
      }
    }
  }

  onProgress({
    percent: 30,
    stage: 'detecting_silences',
    message: 'Analizando forma de onda RMS para detectar pausas de respiración y silencios...'
  });

  // 4. Waveform silence detection (direct RMS amplitude analysis)
  const detectedSilences = detectAudioSilences(compositeBuffer, sampleRate, {
    minSilenceDuration: options.minSilenceDuration || 0.35,
    energyThreshold: options.energyThreshold || 0.012
  });

  // High-resolution acoustic valleys map (detects micro-pauses >= 100ms for millimetric cut snapping)
  const acousticValleys = detectAudioSilences(compositeBuffer, sampleRate, {
    minSilenceDuration: 0.10,
    energyThreshold: 0.015
  });

  // Extract visual waveform peak envelope (for acoustic wave display in editor)
  const waveformPeaks = extractWaveformPeaks(compositeBuffer, 300);

  onProgress({
    percent: 45,
    stage: 'transcribing',
    message: 'Alineando texto y locución para cortes inteligentes...'
  });

  // 5. Transcribe speech using user-selected model
  const transcriptionModel = options.transcriptionModel || 'whisper-base';
  let rawSegments = [];
  let transcriptionProvider = transcriptionModel;

  // Option A: Use pre-existing Guide Track if requested
  if (transcriptionModel === 'guide') {
    const guideTrack = (project.tracks || []).find(t => t.type === 'guide');
    if (guideTrack && (guideTrack.clips || []).length > 0) {
      const existing = (guideTrack.clips || [])
        .filter(c => c.startTime >= minStartTime && (c.startTime + c.duration) <= maxEndTime)
        .map(c => ({
          id: c.id,
          start: Number((c.startTime - minStartTime).toFixed(2)),
          end: Number(((c.startTime + c.duration) - minStartTime).toFixed(2)),
          text: c.name || c.text || ''
        }));
      if (existing.length > 0) {
        rawSegments = existing;
      }
    }
  }

  // Option B: Google Gemini Cloud AI Transcription
  if (transcriptionModel === 'gemini' && rawSegments.length === 0) {
    const apiKey = options.geminiApiKey || (typeof localStorage !== 'undefined'
      ? (localStorage.getItem('montage_pro_gemini_api_key') || localStorage.getItem('montage_gemini_api_key') || localStorage.getItem('gemini_api_key'))
      : null) || project?.geminiApiKey;

    if (!apiKey) {
      throw new Error('Se requiere una clave API de Google Gemini para usar la transcripción en la nube.');
    }

    try {
      const { transcribeWithGemini } = await import('./geminiTranscriber');
      rawSegments = await transcribeWithGemini(
        { float32Data: compositeBuffer, sampleRate, duration: totalSpanDuration },
        apiKey,
        {
          language: options.language || 'spanish',
          onProgress: (p) => {
            onProgress({
              percent: Math.round(45 + (p.percent || 50) * 0.45),
              stage: 'transcribing_gemini',
              message: p.message || 'Transcribiendo con Gemini IA en la nube...'
            });
          }
        }
      );
    } catch (gErr) {
      console.warn('Gemini transcription failed:', gErr);
      throw gErr;
    }
  }

  // Option C: Local Whisper (Tiny, Base, or Small)
  if (transcriptionModel.startsWith('whisper') && rawSegments.length === 0) {
    const modelMap = {
      'whisper-tiny': 'onnx-community/whisper-tiny',
      'whisper-base': 'onnx-community/whisper-base',
      'whisper-small': 'onnx-community/whisper-small'
    };
    const targetModel = modelMap[transcriptionModel] || 'onnx-community/whisper-base';
    const modelLabel = targetModel.replace('onnx-community/', '').toUpperCase();

    try {
      const { transcribeWithWhisperLocal } = await import('./whisperTranscriber');
      rawSegments = await transcribeWithWhisperLocal(
        { float32Data: compositeBuffer, sampleRate, duration: totalSpanDuration },
        {
          language: options.language || 'spanish',
          model: targetModel,
          abortController,
          onProgress: (p) => {
            onProgress({
              percent: Math.round(45 + (p.percent || 50) * 0.45),
              stage: 'transcribing_whisper',
              message: p.message || `Transcribiendo con ${modelLabel}...`
            });
          }
        }
      );
    } catch (err) {
      console.warn('Whisper transcription warning:', err);
    }
  }

  // Option D: Pure Waveform Voice Activity Detection (VAD) (Used if 'vad' is chosen or as ultimate fallback)
  if (!rawSegments || rawSegments.length === 0) {
    transcriptionProvider = 'vad';
    let lastEnd = 0;
    (detectedSilences || []).forEach((silence, sIdx) => {
      if (silence.start > lastEnd + 0.12) {
        rawSegments.push({
          id: `speech_vad_${sIdx}`,
          start: Number(lastEnd.toFixed(2)),
          end: Number(silence.start.toFixed(2)),
          text: `Voz / Locución (${(silence.start - lastEnd).toFixed(1)}s)`
        });
      }
      lastEnd = Math.max(lastEnd, silence.end);
    });
    if (lastEnd < totalSpanDuration - 0.12) {
      rawSegments.push({
        id: `speech_vad_end`,
        start: Number(lastEnd.toFixed(2)),
        end: Number(totalSpanDuration.toFixed(2)),
        text: `Voz / Locución (${(totalSpanDuration - lastEnd).toFixed(1)}s)`
      });
    }
    if (rawSegments.length === 0) {
      rawSegments.push({
        id: 'speech_all',
        start: 0,
        end: Number(totalSpanDuration.toFixed(2)),
        text: `Locución continua (${totalSpanDuration.toFixed(1)}s)`
      });
    }
  }

  // 5b. Acoustically align all transcription boundaries to actual physical audio onset and decay
  if (transcriptionProvider !== 'vad' && rawSegments.length > 0) {
    rawSegments = refineSpeechBoundariesWithWaveform(rawSegments, compositeBuffer, sampleRate);
  }

  onProgress({
    percent: 92,
    stage: 'analyzing_intentions',
    message: 'Analizando tomas repetidas, falsos comienzos y muletillas...'
  });

  // 6. Detect repeated takes
  const repeatedTakeGroups = detectRepeatedTakes(rawSegments, options.similarityThreshold || 0.40);

  // 7. Build composite partitions
  const defaultSettings = {
    paddingMs: options.paddingMs !== undefined ? options.paddingMs : 120,
    filterSilences: true,
    filterRepeatedTakes: true,
    filterFillerWords: true,
    minSilenceDuration: options.minSilenceDuration || 0.35
  };

  const partitions = buildCompositeCutIntervals({
    speechSegments: rawSegments,
    silences: detectedSilences,
    repeatedTakeGroups,
    totalDuration: totalSpanDuration,
    settings: defaultSettings
  });

  onProgress({ percent: 100, stage: 'complete', message: '¡Análisis de recortes completado con éxito!' });

  return {
    targetClips,
    minStartTime,
    maxEndTime,
    totalSpanDuration,
    rawSegments,
    detectedSilences,
    acousticValleys,
    repeatedTakeGroups,
    partitions,
    settings: defaultSettings,
    transcriptionProvider,
    waveformPeaks
  };
}

/**
 * Applies the approved cuts onto the actual project timeline:
 * Splits and trims target clips, ripple-deletes discarded intervals,
 * and maintains audio/video synchronization.
 *
 * @param {object} project Current project object
 * @param {Array<string>} targetClipIds IDs of clips being cut
 * @param {Array<object>} partitions All cut partitions
 * @param {number} minStartTime Origin offset of the analyzed span
 * @param {object} options { rippleClose: boolean }
 * @returns {{ updatedProject: object, summary: object }}
 */
export function applyAutoCutsToProject(project, targetClipIds, partitions, minStartTime = 0, options = {}) {
  const { rippleClose = true } = options;

  if (!project || !project.tracks || partitions.length === 0) {
    return { updatedProject: project, summary: { cutsCount: 0, removedSeconds: 0 } };
  }

  const targetClipIdSet = new Set(targetClipIds || []);

  // Collect companion audio/video clips linked to any target clip
  for (const track of project.tracks) {
    for (const c of (track.clips || [])) {
      if (targetClipIdSet.has(c.id) && c.linkedClipId) {
        targetClipIdSet.add(c.linkedClipId);
      }
    }
  }

  // Calculate boundary span [effectiveMinStartTime, maxEndTime] across all target clips
  let targetMinStart = Infinity;
  let targetMaxEnd = -Infinity;

  for (const track of project.tracks) {
    for (const c of (track.clips || [])) {
      if (targetClipIdSet.has(c.id)) {
        targetMinStart = Math.min(targetMinStart, c.startTime);
        targetMaxEnd = Math.max(targetMaxEnd, c.startTime + c.duration);
      }
    }
  }

  const effectiveMinStartTime = Number.isFinite(targetMinStart) ? targetMinStart : (minStartTime || 0);
  const maxEndTime = options.maxEndTime !== undefined
    ? options.maxEndTime
    : (Number.isFinite(targetMaxEnd)
        ? targetMaxEnd
        : effectiveMinStartTime + (partitions.reduce((acc, p) => acc + (p.duration || 0), 0)));

  // 1. Gather all KEPT time intervals relative to the timeline: [timelineStart, timelineEnd]
  const keptTimelineIntervals = partitions
    .filter(p => !p.isCut)
    .map(p => {
      const s = p.paddedStart !== undefined ? p.paddedStart : p.start;
      const e = p.paddedEnd !== undefined ? p.paddedEnd : p.end;
      return {
        start: Number((effectiveMinStartTime + s).toFixed(2)),
        end: Number((effectiveMinStartTime + e).toFixed(2)),
        duration: Number((e - s).toFixed(2))
      };
    })
    .filter(iv => iv.duration > 0.08)
    .sort((a, b) => a.start - b.start);

  if (keptTimelineIntervals.length === 0) {
    throw new Error('Todos los fragmentos están marcados para cortar. Debes conservar al menos una parte del video.');
  }

  // Merge any adjacent kept intervals that touch or overlap
  const mergedKept = [];
  for (const iv of keptTimelineIntervals) {
    if (mergedKept.length === 0) {
      mergedKept.push({ ...iv });
      continue;
    }
    const last = mergedKept[mergedKept.length - 1];
    if (iv.start <= last.end + 0.04) {
      last.end = Math.max(last.end, iv.end);
      last.duration = Number((last.end - last.start).toFixed(2));
    } else {
      mergedKept.push({ ...iv });
    }
  }

  // 2. Transform target clips into trimmed sub-clips matching mergedKept
  const newTracks = project.tracks.map(track => {
    if (track.locked) return track;

    const clips = [];

    for (const clip of (track.clips || [])) {
      if (!targetClipIdSet.has(clip.id)) {
        // Keep non-target clips as is
        clips.push(clip);
        continue;
      }

      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      const rate = Number(clip.playbackRate) > 0 ? Number(clip.playbackRate) : 1;
      const originalSourceStart = clip.sourceStart || 0;

      // Find all kept intervals that intersect with this clip
      const intersectingKept = mergedKept
        .filter(iv => iv.end > clipStart + 0.04 && iv.start < clipEnd - 0.04)
        .map(iv => ({
          timelineStart: Math.max(clipStart, iv.start),
          timelineEnd: Math.min(clipEnd, iv.end)
        }))
        .filter(seg => (seg.timelineEnd - seg.timelineStart) > 0.08);

      if (intersectingKept.length === 0) {
        // Clip completely cut out
        continue;
      }

      // Generate sub-clips for each kept intersection
      intersectingKept.forEach((seg, sIdx) => {
        const segDuration = Number((seg.timelineEnd - seg.timelineStart).toFixed(2));
        const offsetIntoClip = seg.timelineStart - clipStart;
        const newSourceStart = Number((originalSourceStart + offsetIntoClip * rate).toFixed(2));

        const subClipId = `${clip.id}_cut_${sIdx}`;
        const newLinkedClipId = clip.linkedClipId ? `${clip.linkedClipId}_cut_${sIdx}` : null;

        clips.push({
          ...clip,
          id: subClipId,
          startTime: Number(seg.timelineStart.toFixed(2)),
          duration: segDuration,
          sourceStart: newSourceStart,
          linkedClipId: newLinkedClipId,
          name: intersectingKept.length > 1
            ? `${clip.name.replace(/\s*\(Corte \d+\)$/i, '')} (Corte ${sIdx + 1})`
            : clip.name
        });
      });
    }

    return { ...track, clips };
  });

  // 3. Ripple Closing (Pack kept clips tightly together if rippleClose is enabled)
  let finalProjectTracks = newTracks;
  let totalRemovedSec = 0;

  if (rippleClose) {
    // Sort all target clips on the primary tracks
    const targetTracks = finalProjectTracks.filter(t => (t.clips || []).some(c => targetClipIdSet.has(c.id.split('_cut_')[0])));

    // Build timeline shift map
    const sortedSubClips = [];
    targetTracks.forEach(t => {
      (t.clips || []).forEach(c => {
        if (targetClipIdSet.has(c.id.split('_cut_')[0])) {
          sortedSubClips.push(c);
        }
      });
    });

    sortedSubClips.sort((a, b) => a.startTime - b.startTime);

    // Group concurrent clips (e.g. video + linked audio) by their original startTime
    const timeGroups = new Map();
    sortedSubClips.forEach(c => {
      const key = c.startTime.toFixed(2);
      if (!timeGroups.has(key)) timeGroups.set(key, []);
      timeGroups.get(key).push(c);
    });

    const shiftMap = new Map();
    let currentNewStart = effectiveMinStartTime;

    Array.from(timeGroups.keys()).sort((a, b) => Number(a) - Number(b)).forEach(origTimeStr => {
      const groupClips = timeGroups.get(origTimeStr);
      const maxDur = Math.max(...groupClips.map(c => c.duration));
      groupClips.forEach(c => {
        shiftMap.set(c.id, currentNewStart);
      });
      currentNewStart = Number((currentNewStart + maxDur).toFixed(2));
    });

    totalRemovedSec = Math.max(0, (maxEndTime - effectiveMinStartTime) - (currentNewStart - effectiveMinStartTime));

    // Shift subsequent non-target clips that were placed AFTER the analyzed span
    const timeDelta = totalRemovedSec;

    finalProjectTracks = finalProjectTracks.map(t => {
      const shiftedClips = (t.clips || []).map(c => {
        if (shiftMap.has(c.id)) {
          return { ...c, startTime: shiftMap.get(c.id) };
        } else if (c.startTime >= maxEndTime - 0.05) {
          // Clips that were downstream of the cut region shift leftward by the total time removed!
          return { ...c, startTime: Math.max(0, Number((c.startTime - timeDelta).toFixed(2))) };
        }
        return c;
      });
      shiftedClips.sort((a, b) => a.startTime - b.startTime);
      return { ...t, clips: shiftedClips };
    });
  }

  const cutsCount = partitions.filter(p => p.isCut).length;
  const newProjectDuration = rippleClose && totalRemovedSec > 0
    ? Math.max(10, Math.ceil((project.settings?.duration || 20) - totalRemovedSec))
    : (project.settings?.duration || 20);

  return {
    updatedProject: {
      ...project,
      settings: {
        ...(project.settings || {}),
        duration: newProjectDuration
      },
      updatedAt: new Date().toISOString(),
      tracks: finalProjectTracks
    },
    summary: {
      cutsCount,
      removedSeconds: Number(totalRemovedSec.toFixed(2)),
      originalSpan: Number((maxEndTime - effectiveMinStartTime).toFixed(2)),
      finalSpan: Number(Math.max(0, (maxEndTime - effectiveMinStartTime) - totalRemovedSec).toFixed(2))
    }
  };
}
