/**
 * Multi-Track Audio Renderer and Resampler for Video Export
 * Mixes all active audio tracks, voiceovers, effects, and source video audio
 * into a single high-fidelity, sample-accurate stereo 48kHz AudioBuffer using OfflineAudioContext.
 */

import { audioMixer } from './audioMixerEngine.js';

/**
 * Renders an offline multi-track mix for the given project.
 * @param {object} project - The project definition with tracks, clips, and assets.
 * @param {number} duration - Desired export duration in seconds.
 * @param {number} sampleRate - Output audio sample rate (default 48000 Hz for video standards).
 * @returns {Promise<{ audioBuffer: AudioBuffer, hasAudio: boolean, sampleRate: number, duration: number, numberOfChannels: number }>}
 */
export async function renderProjectAudioMix(project, duration, sampleRate = 48000) {
  const targetDuration = Math.max(0.1, duration || project.settings?.duration || 10);
  const totalSamples = Math.ceil(targetDuration * sampleRate);

  const OfflineAudioCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineAudioCtxClass) {
    console.warn('OfflineAudioContext is not supported in this browser.');
    return createSilentAudioResult(sampleRate, targetDuration);
  }

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

  const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
  const audioTracks = (project.tracks || []).filter(t => t.type === 'audio' && !t.muted);
  const videoTracks = (project.tracks || []).filter(t => t.type === 'video' && !t.muted);

  // 1. Gather all clips that need audio buffers
  const clipsToPreload = [];

  for (const track of audioTracks) {
    for (const clip of (track.clips || [])) {
      if (!clip.muted && (clip.volume === undefined || clip.volume > 0)) {
        clipsToPreload.push(clip);
      }
    }
  }

  for (const track of videoTracks) {
    for (const clip of (track.clips || [])) {
      if (!clip.muted && (clip.volume === undefined || clip.volume > 0)) {
        clipsToPreload.push(clip);
      }
    }
  }

  // 2. Preload and decode audio buffers in parallel
  const clipBufferMap = new Map();
  await Promise.all(
    clipsToPreload.map(async (clip) => {
      const asset = assetsMap.get(clip.assetId);
      if (!asset) return;
      try {
        const buffer = await audioMixer.loadAssetBuffer(asset);
        if (buffer && buffer.duration > 0) {
          clipBufferMap.set(clip.id, buffer);
        }
      } catch (err) {
        console.warn('Could not decode audio for asset:', asset.name || asset.id, err);
      }
    })
  );

  // 3. Schedule clip buffer sources on the offline audio timeline
  let hasScheduledAny = false;

  const scheduleTracks = (tracks) => {
    for (const track of tracks) {
      const trackVol = track.volume !== undefined ? Math.max(0, Math.min(1, track.volume)) : 1.0;
      if (trackVol <= 0) continue;

      const trackGain = offlineCtx.createGain();
      trackGain.gain.value = trackVol;
      trackGain.connect(offlineCtx.destination);

      for (const clip of (track.clips || [])) {
        if (clip.muted) continue;
        const clipVol = clip.volume !== undefined ? Math.max(0, Math.min(1, clip.volume)) : 1.0;
        if (clipVol <= 0) continue;

        const buffer = clipBufferMap.get(clip.id);
        if (!buffer) continue;

        const clipStart = Math.max(0, clip.startTime);
        if (clipStart >= targetDuration) continue;

        const offset = Math.max(0, clip.sourceStart || 0);
        if (offset >= buffer.duration) continue;

        const maxAvailableDuration = buffer.duration - offset;
        const scheduledDuration = Math.min(clip.duration, maxAvailableDuration, targetDuration - clipStart);
        if (scheduledDuration <= 0) continue;

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
    }
  };

  scheduleTracks(audioTracks);
  scheduleTracks(videoTracks);

  try {
    const renderedBuffer = await offlineCtx.startRendering();
    return {
      audioBuffer: renderedBuffer,
      hasAudio: hasScheduledAny,
      sampleRate,
      duration: targetDuration,
      numberOfChannels: 2
    };
  } catch (err) {
    console.error('Audio offline rendering error:', err);
    return createSilentAudioResult(sampleRate, targetDuration);
  }
}

/**
 * Creates an empty silent AudioBuffer as a safe fallback
 */
function createSilentAudioResult(sampleRate, duration) {
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) {
    return { audioBuffer: null, hasAudio: false, sampleRate, duration, numberOfChannels: 2 };
  }
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
}
