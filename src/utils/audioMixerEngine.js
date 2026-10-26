/**
 * Professional Web Audio API Multi-Track Mixing Engine for Montage Pro Studio
 * Provides hardware-accurate, zero-latency sample synchronization, multi-track mixing
 * (voiceover, music, sound effects, separated dialogue), per-track 3-band EQ & Voice Enhancer,
 * Stereo Panning, Solo/Mute, Auto-Ducking, Clip Fade-In/Out Envelopes, and real-time Peak/RMS VU Meters.
 */

import { getMediaBlob } from './storage';
import { extractAudioTrackToWavBlob } from './audioExtractor';

export const AUDIO_EQ_PRESETS = [
  { id: 'flat', name: 'Plano (Original)', low: 0, mid: 0, high: 0 },
  { id: 'voice_podcast', name: '🎙️ Voz Podcast / Locución', low: -3, mid: 4.5, high: 2.5 },
  { id: 'warm_bass', name: '🔊 Graves Cálidos (Cine)', low: 5, mid: -1, high: 1 },
  { id: 'bgm_soft', name: '🎵 Música de Fondo (Cama)', low: -2, mid: -4.5, high: -1.5 },
  { id: 'crisp_highs', name: '✨ Claridad & Brillo Vocal', low: -4, mid: 2.5, high: 5 }
];

function resolveEqGains(presetId = 'flat', customEq = null) {
  if (customEq && typeof customEq === 'object') {
    return {
      low: Number(customEq.low || 0),
      mid: Number(customEq.mid || 0),
      high: Number(customEq.high || 0)
    };
  }
  const found = AUDIO_EQ_PRESETS.find(p => p.id === presetId) || AUDIO_EQ_PRESETS[0];
  return { low: found.low, mid: found.mid, high: found.high };
}

function computeClipEnvelopeMultiplier(clip, currentTime) {
  if (!clip) return 1.0;
  const elapsed = currentTime - clip.startTime;
  const remaining = (clip.startTime + clip.duration) - currentTime;
  if (elapsed < 0 || remaining < 0) return 0;

  let mult = 1.0;
  const fadeIn = Number(clip.fadeIn || 0);
  const fadeOut = Number(clip.fadeOut || 0);

  if (fadeIn > 0.02 && elapsed < fadeIn) {
    mult *= Math.max(0, Math.min(1, elapsed / fadeIn));
  }
  if (fadeOut > 0.02 && remaining < fadeOut) {
    mult *= Math.max(0, Math.min(1, remaining / fadeOut));
  }
  return mult;
}

class AudioMixerEngine {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.masterCompressor = null;
    this.masterAnalyser = null;
    this.masterDataArray = null;
    this.trackBuses = new Map(); // trackId -> { inputNode, eqLow, eqMid, eqHigh, pannerNode, gainNode, analyserNode, dataArray, ... }
    this.bufferCache = new Map(); // assetId -> AudioBuffer
    this.loadingPromises = new Map(); // assetId -> Promise<AudioBuffer>
    this.activeSources = new Map(); // clipId -> { sourceNode, gainNode, pannerNode, clip, trackId }
    this.isPlaying = false;
    this.playbackTimelineStartTime = 0;
    this.audioCtxStartTime = 0;
    this.masterVolume = 1.0;
    this.masterMuted = false;
    this.playbackSessionId = 0;
  }

  /**
   * Initializes or returns the shared AudioContext (lazily created on first user interaction).
   */
  getContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.masterMuted ? 0 : this.masterVolume;

      // Broadcast Limiter / Compressor to prevent harsh digital clipping when summing multiple tracks
      this.masterCompressor = this.audioCtx.createDynamicsCompressor();
      this.masterCompressor.threshold.value = -3.0;
      this.masterCompressor.knee.value = 12.0;
      this.masterCompressor.ratio.value = 6.0;
      this.masterCompressor.attack.value = 0.005;
      this.masterCompressor.release.value = 0.15;

      this.masterAnalyser = this.audioCtx.createAnalyser();
      this.masterAnalyser.fftSize = 256;
      this.masterAnalyser.smoothingTimeConstant = 0.75;
      this.masterDataArray = new Float32Array(this.masterAnalyser.fftSize);

      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  setMasterVolume(vol = 1.0, muted = false) {
    this.masterVolume = Math.max(0, Math.min(2.0, Number(vol)));
    this.masterMuted = Boolean(muted);
    if (this.audioCtx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.masterMuted ? 0 : this.masterVolume,
        this.audioCtx.currentTime,
        0.02
      );
    }
  }

  /**
   * Returns a dedicated DSP Bus for a specific audio track (3-band EQ -> Panner -> Gain -> Analyser -> Master).
   */
  getTrackBus(track, anySoloActive = false, isBeingDucked = false) {
    const ctx = this.getContext();
    const trackId = typeof track === 'string' ? track : track.id;
    const trackObj = typeof track === 'object' && track ? track : { id: trackId };

    let bus = this.trackBuses.get(trackId);
    if (!bus) {
      const eqLow = ctx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 120;

      const eqMid = ctx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 2500;
      eqMid.Q.value = 1.0;

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 8000;

      const pannerNode = typeof ctx.createStereoPanner === 'function'
        ? ctx.createStereoPanner()
        : null;

      const gainNode = ctx.createGain();
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.75;
      const dataArray = new Float32Array(analyserNode.fftSize);

      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      if (pannerNode) {
        eqHigh.connect(pannerNode);
        pannerNode.connect(gainNode);
      } else {
        eqHigh.connect(gainNode);
      }
      gainNode.connect(analyserNode);
      analyserNode.connect(this.masterGain);

      bus = {
        trackId,
        inputNode: eqLow,
        eqLow,
        eqMid,
        eqHigh,
        pannerNode,
        gainNode,
        analyserNode,
        dataArray,
        isMuted: false,
        volume: 1.0,
        isDucked: false
      };
      this.trackBuses.set(trackId, bus);
    }

    const isMutedBySolo = anySoloActive && !trackObj.solo;
    const isMuted = Boolean(trackObj.muted || isMutedBySolo);
    const baseVolume = trackObj.volume !== undefined ? Number(trackObj.volume) : 1.0;
    const duckFactor = isBeingDucked ? Number(trackObj.duckAmount ?? 0.22) : 1.0;

    bus.isMuted = isMuted;
    bus.volume = baseVolume;
    bus.isDucked = isBeingDucked;

    const eq = resolveEqGains(trackObj.eqPreset || 'flat', trackObj.eq);
    bus.eqLow.gain.setTargetAtTime(eq.low, ctx.currentTime, 0.03);
    bus.eqMid.gain.setTargetAtTime(eq.mid, ctx.currentTime, 0.03);
    bus.eqHigh.gain.setTargetAtTime(eq.high, ctx.currentTime, 0.03);

    if (bus.pannerNode) {
      const panVal = Math.max(-1, Math.min(1, Number(trackObj.pan || 0)));
      bus.pannerNode.pan.setTargetAtTime(panVal, ctx.currentTime, 0.03);
    }

    const finalGain = isMuted ? 0 : Math.max(0, Math.min(2.0, baseVolume * duckFactor));
    const timeConstant = isBeingDucked ? 0.08 : 0.04;
    bus.gainNode.gain.setTargetAtTime(finalGain, ctx.currentTime, timeConstant);

    return bus;
  }

  /**
   * Computes real-time RMS and Peak level for a track bus (for VU meters in AudioMixerPanel)
   */
  getTrackMeter(trackId) {
    if (!this.isPlaying || !this.audioCtx) {
      return { rms: 0, peak: 0, db: -60, isDucked: false };
    }
    const bus = this.trackBuses.get(trackId);
    if (!bus || !bus.analyserNode || bus.isMuted) {
      return { rms: 0, peak: 0, db: -60, isDucked: Boolean(bus?.isDucked) };
    }
    try {
      bus.analyserNode.getFloatTimeDomainData(bus.dataArray);
      let sumSq = 0;
      let peak = 0;
      const len = bus.dataArray.length;
      for (let i = 0; i < len; i++) {
        const v = Math.abs(bus.dataArray[i]);
        sumSq += v * v;
        if (v > peak) peak = v;
      }
      const rms = Math.sqrt(sumSq / len);
      const db = peak > 0.0001 ? Math.max(-60, 20 * Math.log10(peak)) : -60;
      return {
        rms: Math.min(1, rms * 1.8),
        peak: Math.min(1, peak),
        db: Math.round(db),
        isDucked: Boolean(bus.isDucked)
      };
    } catch {
      return { rms: 0, peak: 0, db: -60, isDucked: false };
    }
  }

  /**
   * Computes real-time RMS and Peak level for the Master Bus
   */
  getMasterMeter() {
    if (!this.isPlaying || !this.audioCtx || !this.masterAnalyser || this.masterMuted) {
      return { rms: 0, peak: 0, db: -60 };
    }
    try {
      this.masterAnalyser.getFloatTimeDomainData(this.masterDataArray);
      let sumSq = 0;
      let peak = 0;
      const len = this.masterDataArray.length;
      for (let i = 0; i < len; i++) {
        const v = Math.abs(this.masterDataArray[i]);
        sumSq += v * v;
        if (v > peak) peak = v;
      }
      const rms = Math.sqrt(sumSq / len);
      const db = peak > 0.0001 ? Math.max(-60, 20 * Math.log10(peak)) : -60;
      return {
        rms: Math.min(1, rms * 1.8),
        peak: Math.min(1, peak),
        db: Math.round(db)
      };
    } catch {
      return { rms: 0, peak: 0, db: -60 };
    }
  }

  /**
   * Decodes and caches audio data into a high-performance in-memory AudioBuffer.
   */
  async loadAssetBuffer(asset) {
    if (!asset || !asset.id) return null;
    if (this.bufferCache.has(asset.id)) {
      return this.bufferCache.get(asset.id);
    }
    if (this.loadingPromises.has(asset.id)) {
      return this.loadingPromises.get(asset.id);
    }

    const promise = (async () => {
      try {
        const ctx = this.getContext();
        let arrayBuffer = null;

        const isVideoFormat = asset.type === 'video' ||
          asset.isVideoContainerAudio ||
          (asset.name && /\.(mp4|webm|mov|mkv|avi|qt)$/i.test(asset.name)) ||
          (asset.url && (asset.url.endsWith('.mp4') || asset.url.endsWith('.webm') || asset.url.endsWith('.mov')));

        // Maximum safe audio payload size to decode in WebAudio on UI thread (25 MB)
        const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

        // 0. Ultra-fast backend audio extraction for video formats:
        // Serves lightweight extracted audio (~1 MB) in ~20ms instead of 400+ MB video
        if (isVideoFormat && (asset.diskPath || asset.name)) {
          try {
            const audioUrl = `/media-library/audio?path=${encodeURIComponent(asset.diskPath || asset.name)}`;
            const res = await fetch(audioUrl);
            if (res.ok) {
              const audioData = await res.arrayBuffer();
              // Guard: If response is a full video container (>25MB), reject to prevent browser lockup
              if (audioData && audioData.byteLength > 100 && audioData.byteLength <= MAX_AUDIO_BYTES) {
                const audioBuffer = await ctx.decodeAudioData(audioData);
                if (audioBuffer) {
                  this.bufferCache.set(asset.id, audioBuffer);
                  return audioBuffer;
                }
              }
            }
          } catch (e) {
            console.warn('[audioMixer] Fast backend audio extraction fallback:', e);
          }
        }

        // If this is a video asset and the server could not provide an extracted audio track,
        // DO NOT download hundreds of megabytes of raw video container into WebAudio memory!
        if (isVideoFormat) {
          this.bufferCache.set(asset.id, null);
          return null;
        }

        // 1. Try fetching from URL (for pure audio assets)
        if (asset.url) {
          try {
            const res = await fetch(asset.url);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              if (buf.byteLength <= MAX_AUDIO_BYTES) {
                arrayBuffer = buf;
              }
            }
          } catch {}
        }

        // 1.b Fallback to asset.file (for pure audio files)
        if (!arrayBuffer && asset.file) {
          try {
            if (asset.file.size <= MAX_AUDIO_BYTES) {
              arrayBuffer = await asset.file.arrayBuffer();
            }
          } catch {}
        }

        // 2. Fallback to IndexedDB
        if (!arrayBuffer && asset.id) {
          const blob = await getMediaBlob(asset.id);
          if (blob && blob.size <= MAX_AUDIO_BYTES) {
            arrayBuffer = await blob.arrayBuffer();
          }
        }

        // 3. Fallback to source video if this is a separated audio clip
        if (!arrayBuffer && asset.sourceAssetId) {
          const sourceBlob = await getMediaBlob(asset.sourceAssetId);
          if (sourceBlob && sourceBlob.size <= MAX_AUDIO_BYTES) {
            arrayBuffer = await sourceBlob.arrayBuffer();
          }
        }

        // 4. Fallback to absolute disk path if known (pure audio only)
        if (!arrayBuffer && asset.diskPath) {
          try {
            const res = await fetch(`/media-library/abs?path=${encodeURIComponent(asset.diskPath)}`);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              if (buf.byteLength <= MAX_AUDIO_BYTES) {
                arrayBuffer = buf;
                asset.url = `/media-library/abs?path=${encodeURIComponent(asset.diskPath)}`;
              }
            }
          } catch {}
        }

        // 5. Fallback to tolerant search by asset name via /media-library/
        if (!arrayBuffer && asset.name) {
          const namesToTry = [asset.name];
          if (!asset.name.includes('.')) {
            namesToTry.push(`${asset.name}.mp3`, `${asset.name}.wav`, `${asset.name}.m4a`);
          }
          for (const nameCandidate of namesToTry) {
            try {
              const res = await fetch(`/media-library/${encodeURIComponent(nameCandidate)}`);
              if (res.ok) {
                const buf = await res.arrayBuffer();
                if (buf.byteLength <= MAX_AUDIO_BYTES) {
                  arrayBuffer = buf;
                  const resolvedDisk = res.headers.get('x-resolved-disk-path');
                  if (resolvedDisk) {
                    asset.diskPath = resolvedDisk;
                    asset.url = `/media-library/abs?path=${encodeURIComponent(resolvedDisk)}`;
                  } else {
                    asset.url = `/media-library/${encodeURIComponent(nameCandidate)}`;
                  }
                  break;
                }
              }
            } catch {}
          }
        }

        if (!arrayBuffer) {
          this.bufferCache.set(asset.id, null);
          return null;
        }

        let audioBuffer = null;

        try {
          const copy = arrayBuffer.slice(0);
          audioBuffer = await ctx.decodeAudioData(copy);
        } catch {
          try {
            const wavBlob = await extractAudioTrackToWavBlob(new Blob([arrayBuffer]));
            const wavBuf = await wavBlob.arrayBuffer();
            audioBuffer = await ctx.decodeAudioData(wavBuf);
          } catch {}
        }

        this.bufferCache.set(asset.id, audioBuffer || null);
        return audioBuffer;
      } catch (err) {
        console.warn('AudioMixerEngine: Could not decode audio asset buffer:', asset?.name || asset?.id, err);
        this.bufferCache.set(asset.id, null);
        return null;
      } finally {
        this.loadingPromises.delete(asset.id);
      }
    })();

    this.loadingPromises.set(asset.id, promise);
    return promise;
  }

  /**
   * Preloads all audio clips in the project in the background so playback is instantaneous.
   */
  preloadProjectBuffers(project) {
    if (!project || !project.tracks) return;
    const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
    const audioTracks = project.tracks.filter(t => t.type === 'audio');

    for (const track of audioTracks) {
      for (const clip of (track.clips || [])) {
        const asset = assetsMap.get(clip.assetId);
        if (asset && !this.bufferCache.has(asset.id)) {
          this.loadAssetBuffer(asset);
        }
      }
    }
  }

  /**
   * Returns true only when there are actual audio clips currently outputting sound through Web Audio.
   * If there are no audio tracks playing, returns false so video hardware clock drives the timeline.
   */
  hasActiveAudio() {
    return this.isPlaying && !!this.audioCtx && this.activeSources.size > 0;
  }

  /**
   * Returns the exact hardware DAC timeline timestamp during playback.
   */
  getHardwareTimelineTime() {
    if (!this.isPlaying || !this.audioCtx) return null;
    const elapsed = this.audioCtx.currentTime - this.audioCtxStartTime;
    if (elapsed < 0) return this.playbackTimelineStartTime;
    return this.playbackTimelineStartTime + elapsed;
  }

  /**
   * Resynchronizes the audio timeline base to match a master video clock if drift occurs.
   */
  syncClock(masterTimelineTime) {
    if (!this.isPlaying || !this.audioCtx) return;
    const cur = this.getHardwareTimelineTime();
    if (cur !== null && Math.abs(cur - masterTimelineTime) > 0.04) {
      this.playbackTimelineStartTime = masterTimelineTime;
      this.audioCtxStartTime = this.audioCtx.currentTime;
    }
  }

  /**
   * Starts multi-track audio playback from the given timeline position.
   */
  play(timelineTime, project) {
    this.playbackSessionId = (this.playbackSessionId || 0) + 1;
    const currentSession = this.playbackSessionId;
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (this.isPlaying && this.playbackSessionId === currentSession) {
          this.audioCtxStartTime = ctx.currentTime;
        }
      }).catch(() => {});
    }

    this.stopActiveSources();
    this.isPlaying = true;
    this.playbackTimelineStartTime = timelineTime;
    this.audioCtxStartTime = ctx.currentTime;

    if (!project || !project.tracks) return;
    this.update(timelineTime, project);
  }

  /**
   * Instantly stops all sound playback.
   */
  pause() {
    this.playbackSessionId = (this.playbackSessionId || 0) + 1;
    this.isPlaying = false;
    this.stopActiveSources();
  }

  /**
   * Stops all active audio source nodes immediately.
   */
  stopActiveSources() {
    for (const { sourceNode, gainNode, pannerNode } of this.activeSources.values()) {
      try {
        sourceNode.onended = null;
        sourceNode.stop();
        sourceNode.disconnect();
        if (pannerNode) pannerNode.disconnect();
        gainNode.disconnect();
      } catch {}
    }
    this.activeSources.clear();
  }

  /**
   * Seeks to a new timeline timestamp.
   */
  seek(timelineTime, project) {
    this.playbackSessionId = (this.playbackSessionId || 0) + 1;
    if (this.isPlaying) {
      this.play(timelineTime, project);
    } else {
      this.stopActiveSources();
      this.playbackTimelineStartTime = timelineTime;
    }
  }

  /**
   * Dynamically updates volume, solo, mute, EQ, pan, and auto-ducking for all active tracks and clips.
   */
  updateVolumes(project, currentTime = null) {
    if (!project || !project.tracks || !this.audioCtx) return;
    const ctx = this.audioCtx;
    const nowTime = currentTime !== null ? currentTime : (this.getHardwareTimelineTime() ?? this.playbackTimelineStartTime);

    if (project.masterAudio) {
      this.setMasterVolume(
        project.masterAudio.volume ?? 1.0,
        project.masterAudio.muted ?? false
      );
    }

    const audioTracks = project.tracks.filter(t => t.type === 'audio');
    const anySoloActive = audioTracks.some(t => Boolean(t.solo));

    // Check if any non-ducked voice/dialogue track is currently playing a clip
    const isVoicePlayingNow = audioTracks.some(t => {
      if (t.muted || t.autoDuck) return false;
      if (anySoloActive && !t.solo) return false;
      return (t.clips || []).some(c => !c.muted && nowTime >= c.startTime && nowTime < (c.startTime + c.duration));
    });

    for (const track of audioTracks) {
      const shouldDuck = Boolean(track.autoDuck && isVoicePlayingNow);
      const bus = this.getTrackBus(track, anySoloActive, shouldDuck);

      for (const clip of (track.clips || [])) {
        const entry = this.activeSources.get(clip.id);
        if (entry && entry.gainNode) {
          const isMuted = !!clip.muted || bus.isMuted;
          const clipVol = clip.volume !== undefined ? Number(clip.volume) : 1.0;
          const envMult = computeClipEnvelopeMultiplier(clip, nowTime);
          const finalGain = isMuted ? 0 : Math.max(0, Math.min(2.0, clipVol * envMult));
          entry.gainNode.gain.setTargetAtTime(finalGain, ctx.currentTime, 0.02);
          if (entry.pannerNode) {
            const clipPan = Math.max(-1, Math.min(1, Number(clip.pan || 0)));
            entry.pannerNode.pan.setTargetAtTime(clipPan, ctx.currentTime, 0.02);
          }
        }
      }
    }
  }

  /**
   * Updates multi-track playback state as the timeline advances.
   * Handles clip boundaries, transitions, fade-in/out envelopes, and auto-ducking.
   */
  update(currentTime, project) {
    if (!this.isPlaying || !project || !project.tracks) return;

    const ctx = this.getContext();
    const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
    const audioTracks = project.tracks.filter(t => t.type === 'audio');
    const anySoloActive = audioTracks.some(t => Boolean(t.solo));

    const isVoicePlayingNow = audioTracks.some(t => {
      if (t.muted || t.autoDuck) return false;
      if (anySoloActive && !t.solo) return false;
      return (t.clips || []).some(c => !c.muted && currentTime >= c.startTime && currentTime < (c.startTime + c.duration));
    });

    const LOOKAHEAD = 0.35; // 350ms lookahead for gapless transitions
    const validClipIds = new Set();

    for (const track of audioTracks) {
      const shouldDuck = Boolean(track.autoDuck && isVoicePlayingNow);
      const trackBus = this.getTrackBus(track, anySoloActive, shouldDuck);

      for (const clip of (track.clips || [])) {
        const start = clip.startTime;
        const end = clip.startTime + clip.duration;

        const isCurrentlyActive = (currentTime >= start && currentTime < end);
        const isUpcoming = (!isCurrentlyActive && start > currentTime && start <= (currentTime + LOOKAHEAD));

        if (isCurrentlyActive || isUpcoming) {
          validClipIds.add(clip.id);

          if (this.activeSources.has(clip.id)) {
            // Update envelope fade-in / fade-out and pan in real time
            const entry = this.activeSources.get(clip.id);
            if (entry && entry.gainNode) {
              const isMuted = !!clip.muted || trackBus.isMuted;
              const clipVol = clip.volume !== undefined ? Number(clip.volume) : 1.0;
              const envMult = isCurrentlyActive ? computeClipEnvelopeMultiplier(clip, currentTime) : 1.0;
              const finalGain = isMuted ? 0 : Math.max(0, Math.min(2.0, clipVol * envMult));
              entry.gainNode.gain.setTargetAtTime(finalGain, ctx.currentTime, 0.03);
            }
          } else {
            const asset = assetsMap.get(clip.assetId);
            if (!asset) continue;

            if (this.bufferCache.has(asset.id)) {
              const buffer = this.bufferCache.get(asset.id);
              if (buffer) {
                this.scheduleClipNode(clip, buffer, currentTime, trackBus);
              }
            } else {
              const session = this.playbackSessionId;
              this.loadAssetBuffer(asset).then((decodedBuf) => {
                if (session !== this.playbackSessionId) return;
                if (decodedBuf && this.isPlaying && !this.activeSources.has(clip.id)) {
                  const nowCurTime = this.getHardwareTimelineTime() || currentTime;
                  const isStillRelevant = (nowCurTime >= clip.startTime && nowCurTime < (clip.startTime + clip.duration)) ||
                    (clip.startTime > nowCurTime && clip.startTime <= (nowCurTime + LOOKAHEAD));
                  if (isStillRelevant) {
                    this.scheduleClipNode(clip, decodedBuf, nowCurTime, trackBus);
                  }
                }
              });
            }
          }
        }
      }
    }

    // Stop and disconnect any clips that are outside their playback window
    for (const [clipId, item] of this.activeSources.entries()) {
      if (!validClipIds.has(clipId)) {
        try {
          item.sourceNode.onended = null;
          item.sourceNode.stop();
          item.sourceNode.disconnect();
          if (item.pannerNode) item.pannerNode.disconnect();
          item.gainNode.disconnect();
        } catch {}
        this.activeSources.delete(clipId);
      }
    }
  }

  /**
   * Schedules a clip buffer node, either immediately or at an exact future sample time.
   */
  scheduleClipNode(clip, buffer, currentTime, trackBus) {
    if (!this.isPlaying || !this.audioCtx) return;
    const ctx = this.audioCtx;

    try {
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = buffer;
      const speed = Number(clip.playbackRate || 1.0);
      if (speed !== 1.0) {
        sourceNode.playbackRate.value = speed;
      }

      const clipGain = ctx.createGain();
      const isMuted = !!clip.muted || !!trackBus.isMuted;
      const clipVol = clip.volume !== undefined ? Number(clip.volume) : 1.0;
      const envMult = computeClipEnvelopeMultiplier(clip, currentTime);
      clipGain.gain.setValueAtTime(isMuted ? 0 : Math.max(0, Math.min(2.0, clipVol * envMult)), ctx.currentTime);

      let pannerNode = null;
      if (typeof ctx.createStereoPanner === 'function') {
        pannerNode = ctx.createStereoPanner();
        pannerNode.pan.value = Math.max(-1, Math.min(1, Number(clip.pan || 0)));
        sourceNode.connect(pannerNode);
        pannerNode.connect(clipGain);
      } else {
        sourceNode.connect(clipGain);
      }

      clipGain.connect(trackBus.inputNode || trackBus.gainNode);

      const deltaToStart = clip.startTime - this.playbackTimelineStartTime;
      const scheduledCtxTime = this.audioCtxStartTime + deltaToStart;

      if (scheduledCtxTime <= ctx.currentTime) {
        const elapsedSinceStart = ctx.currentTime - scheduledCtxTime;
        const targetOffset = (clip.sourceStart || 0) + (elapsedSinceStart * speed);
        const remainingDuration = clip.duration - elapsedSinceStart;

        if (remainingDuration <= 0.02 || targetOffset >= (buffer.duration - 0.02)) return;

        const safeOffset = Math.max(0, Math.min(buffer.duration - 0.01, targetOffset));
        const safeDuration = Math.max(0.01, Math.min((buffer.duration - safeOffset) / speed, remainingDuration));

        sourceNode.start(0, safeOffset, safeDuration * speed);
      } else {
        if ((clip.sourceStart || 0) >= (buffer.duration - 0.02)) return;
        const safeOffset = Math.max(0, Math.min(buffer.duration - 0.01, clip.sourceStart || 0));
        const safeDuration = Math.max(0.01, Math.min((buffer.duration - safeOffset) / speed, clip.duration));

        sourceNode.start(scheduledCtxTime, safeOffset, safeDuration * speed);
      }

      const entry = {
        sourceNode,
        gainNode: clipGain,
        pannerNode,
        clip,
        clipId: clip.id,
        trackId: trackBus.trackId
      };
      this.activeSources.set(clip.id, entry);

      sourceNode.onended = () => {
        if (this.activeSources.get(clip.id)?.sourceNode === sourceNode) {
          try {
            sourceNode.disconnect();
            if (pannerNode) pannerNode.disconnect();
            clipGain.disconnect();
          } catch {}
          this.activeSources.delete(clip.id);
        }
      };
    } catch (err) {
      console.warn('AudioMixerEngine: Failed to schedule clip node:', clip.id, err);
    }
  }

  /**
   * Complete teardown
   */
  destroy() {
    this.pause();
    this.trackBuses.clear();
    this.bufferCache.clear();
    this.loadingPromises.clear();
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}

// Global Singleton for the application
export const audioMixer = new AudioMixerEngine();
