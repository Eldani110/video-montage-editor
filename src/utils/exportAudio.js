/**
 * Multi-Track Audio Renderer and Resampler for Video Export
 * Mixes all active audio tracks, voiceovers, effects, and source video audio
 * into a single high-fidelity, sample-accurate stereo 48kHz AudioBuffer using OfflineAudioContext.
 */

import { audioMixer } from './audioMixerEngine.js';

/**
 * Creates an empty silent AudioBuffer as a safe fallback
 */
export function createSilentAudioResult(sampleRate = 48000, duration = 1) {
  if (typeof window === 'undefined') {
    return { audioBuffer: null, hasAudio: false, sampleRate, duration, numberOfChannels: 2 };
  }
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) {
    return { audioBuffer: null, hasAudio: false, sampleRate, duration, numberOfChannels: 2 };
  }
  try {
    const ctx = new AudioCtxClass();
    const samples = Math.max(1, Math.min(48000, Math.ceil(duration * sampleRate)));
    const buffer = ctx.createBuffer(2, samples, sampleRate);
    ctx.close().catch(() => {});
    return {
      audioBuffer: buffer,
      hasAudio: false,
      sampleRate,
      duration,
      numberOfChannels: 2
    };
  } catch {
    return { audioBuffer: null, hasAudio: false, sampleRate, duration, numberOfChannels: 2 };
  }
}

/**
 * Renders an offline multi-track mix for the given project.
 * @param {object} project - The project definition with tracks, clips, and assets.
 * @param {number} duration - Desired export duration in seconds.
 * @param {number} sampleRate - Output audio sample rate (default 48000 Hz for video standards).
 * @param {function} onProgress - Optional callback for reporting sub-phase progress.
 * @returns {Promise<{ audioBuffer: AudioBuffer, hasAudio: boolean, sampleRate: number, duration: number, numberOfChannels: number }>}
 */
export async function renderProjectAudioMix(project, duration, sampleRate = 48000, onProgress = null) {
  const targetDuration = Math.max(0.1, duration || project.settings?.duration || 10);
  const totalSamples = Math.ceil(targetDuration * sampleRate);

  if (typeof window === 'undefined') {
    return createSilentAudioResult(sampleRate, targetDuration);
  }

  const OfflineAudioCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineAudioCtxClass) {
    console.warn('OfflineAudioContext is not supported in this browser.');
    return createSilentAudioResult(sampleRate, targetDuration);
  }

  const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
  const audioTracks = (project.tracks || []).filter(t => t.type === 'audio' && !t.muted);
  const videoTracks = (project.tracks || []).filter(t => t.type === 'video' && !t.muted);

  // Companion audio set: if a video clip already had its audio extracted/separated onto an audio track,
  // the audio track handles it. Do NOT duplicate or attempt to decode video audio!
  const allAudioClips = audioTracks.flatMap(t => t.clips || []);
  const audioCompanionSet = new Set();
  for (const ac of allAudioClips) {
    if (ac.linkedClipId) audioCompanionSet.add(ac.linkedClipId);
    if (ac.sourceClipId) audioCompanionSet.add(ac.sourceClipId);
  }

  const isVideoClipAudible = (clip) => {
    if (!clip || clip.muted === true) return false;
    if (clip.volume !== undefined && clip.volume <= 0) return false;
    // B-Roll clips are muted by default in montage editor unless explicitly unmuted (clip.muted === false)
    if (clip.isBroll && clip.muted !== false) return false;
    // If audio was extracted or separated to an audio track, the audio track is the master
    if (clip.audioSeparated) return false;
    if (audioCompanionSet.has(clip.id)) return false;
    return true;
  };

  // 1. Gather all truly audible clips
  const audibleClips = [];

  for (const track of audioTracks) {
    const trackVol = track.volume !== undefined ? Math.max(0, Math.min(1, track.volume)) : 1.0;
    if (trackVol <= 0) continue;
    for (const clip of (track.clips || [])) {
      if (!clip.muted && (clip.volume === undefined || clip.volume > 0)) {
        audibleClips.push({ clip, track });
      }
    }
  }

  for (const track of videoTracks) {
    const trackVol = track.volume !== undefined ? Math.max(0, Math.min(1, track.volume)) : 1.0;
    if (trackVol <= 0) continue;
    for (const clip of (track.clips || [])) {
      if (isVideoClipAudible(clip)) {
        audibleClips.push({ clip, track });
      }
    }
  }

  // Zero audible clips fast path: immediately return without spinning up OfflineAudioContext
  if (audibleClips.length === 0) {
    console.log('No audible clips found in project. Skipping audio rendering.');
    return {
      audioBuffer: null,
      hasAudio: false,
      sampleRate,
      duration: targetDuration,
      numberOfChannels: 2
    };
  }

  // 2. Preload unique asset audio buffers with controlled concurrency and safety timeouts
  const uniqueAssetIds = [...new Set(audibleClips.map(item => item.clip.assetId).filter(Boolean))];
  const assetBufferMap = new Map();
  const BATCH_SIZE = 3;

  for (let i = 0; i < uniqueAssetIds.length; i += BATCH_SIZE) {
    const batch = uniqueAssetIds.slice(i, i + BATCH_SIZE);
    if (onProgress) {
      onProgress({
        percent: Math.round((i / uniqueAssetIds.length) * 80),
        message: `Cargando pistas de audio (${i + 1}/${uniqueAssetIds.length})...`
      });
    }

    await Promise.all(
      batch.map(async (assetId) => {
        const asset = assetsMap.get(assetId);
        if (!asset) return;
        try {
          const buffer = await Promise.race([
            audioMixer.loadAssetBuffer(asset),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Audio load timeout')), 8000))
          ]);
          if (buffer && buffer.duration > 0) {
            assetBufferMap.set(assetId, buffer);
          }
        } catch (err) {
          console.warn('Could not decode audio for asset:', asset.name || asset.id, err);
        }
      })
    );
  }

  // 3. Initialize OfflineAudioContext safely
  let offlineCtx = null;
  try {
    offlineCtx = new OfflineAudioCtxClass(
      2, // Stereo output
      Math.max(1, totalSamples),
      sampleRate
    );
  } catch (err) {
    console.warn('Could not initialize OfflineAudioContext with high sample count:', err);
    try {
      offlineCtx = new OfflineAudioCtxClass(2, Math.max(1, Math.min(totalSamples, 48000 * 600)), sampleRate);
    } catch {
      return createSilentAudioResult(sampleRate, targetDuration);
    }
  }

  // 4. Schedule clip buffer sources on the offline audio timeline
  let hasScheduledAny = false;
  const trackGainMap = new Map();

  for (const { clip, track } of audibleClips) {
    const buffer = assetBufferMap.get(clip.assetId);
    if (!buffer) continue;

    const clipStart = Math.max(0, clip.startTime);
    if (clipStart >= targetDuration) continue;

    const offset = Math.max(0, clip.sourceStart || 0);
    if (offset >= buffer.duration) continue;

    const maxAvailableDuration = buffer.duration - offset;
    const scheduledDuration = Math.min(clip.duration, maxAvailableDuration, targetDuration - clipStart);
    if (scheduledDuration <= 0) continue;

    let trackGain = trackGainMap.get(track.id);
    if (!trackGain) {
      const trackVol = track.volume !== undefined ? Math.max(0, Math.min(1, track.volume)) : 1.0;
      trackGain = offlineCtx.createGain();
      trackGain.gain.value = trackVol;
      trackGain.connect(offlineCtx.destination);
      trackGainMap.set(track.id, trackGain);
    }

    const clipVol = clip.volume !== undefined ? Math.max(0, Math.min(1, clip.volume)) : 1.0;

    try {
      const sourceNode = offlineCtx.createBufferSource();
      sourceNode.buffer = buffer;

      const clipGain = offlineCtx.createGain();
      clipGain.gain.value = clipVol;

      sourceNode.connect(clipGain);
      clipGain.connect(trackGain);

      sourceNode.start(clipStart, offset, scheduledDuration);
      hasScheduledAny = true;
    } catch (nodeErr) {
      console.warn('Failed to schedule audio node for clip:', clip.id, nodeErr);
    }
  }

  if (!hasScheduledAny) {
    console.log('No audio clips could be scheduled. Returning empty audio.');
    return {
      audioBuffer: null,
      hasAudio: false,
      sampleRate,
      duration: targetDuration,
      numberOfChannels: 2
    };
  }

  if (onProgress) {
    onProgress({ percent: 90, message: 'Mezclando y masterizando audio 48kHz...' });
  }

  try {
    const renderTimeoutMs = Math.max(90000, Math.ceil(targetDuration * 120));
    const renderedBuffer = await Promise.race([
      offlineCtx.startRendering(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('startRendering timeout')), renderTimeoutMs))
    ]);

    return {
      audioBuffer: renderedBuffer,
      hasAudio: true,
      sampleRate,
      duration: targetDuration,
      numberOfChannels: 2
    };
  } catch (err) {
    console.error('Audio offline rendering error:', err);
    return createSilentAudioResult(sampleRate, targetDuration);
  }
}
