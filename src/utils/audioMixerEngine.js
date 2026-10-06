/**
 * Professional Web Audio API Multi-Track Mixing Engine for Montage Pro Studio
 * Provides hardware-accurate, zero-latency sample synchronization, multi-track mixing
 * (voiceover, music, sound effects, separated dialogue), track/clip gain control,
 * and unified transport control without browser media-element demuxing bottlenecks.
 */

import { getMediaBlob } from './storage';
import { extractAudioTrackToWavBlob } from './audioExtractor';

class AudioMixerEngine {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.trackBuses = new Map(); // trackId -> { gainNode, isMuted, volume, trackId }
    this.bufferCache = new Map(); // assetId -> AudioBuffer
    this.loadingPromises = new Map(); // assetId -> Promise<AudioBuffer>
    this.activeSources = new Map(); // clipId -> { sourceNode, gainNode, clipId, trackId }
    this.isPlaying = false;
    this.playbackTimelineStartTime = 0;
    this.audioCtxStartTime = 0;
    this.masterVolume = 1.0;
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
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Returns a dedicated GainNode bus for a specific audio track.
   */
  getTrackBus(trackId, trackVolume = 1.0, isMuted = false) {
    const ctx = this.getContext();
    let bus = this.trackBuses.get(trackId);
    if (!bus) {
      const gainNode = ctx.createGain();
      gainNode.connect(this.masterGain);
      bus = { gainNode, isMuted, volume: trackVolume, trackId };
      this.trackBuses.set(trackId, bus);
    }
    bus.isMuted = !!isMuted;
    bus.volume = trackVolume !== undefined ? trackVolume : 1.0;
    const finalGain = bus.isMuted ? 0 : Math.max(0, Math.min(1, bus.volume));
    bus.gainNode.gain.setValueAtTime(finalGain, ctx.currentTime);
    return bus;
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

        // 1. Try fetching from URL (blob: or http:)
        if (asset.url) {
          try {
            const res = await fetch(asset.url);
            if (res.ok) {
              arrayBuffer = await res.arrayBuffer();
            }
          } catch {
            // URL might be expired, fallback to IndexedDB
          }
        }

        // 1.b Fallback to asset.file
        if (!arrayBuffer && asset.file) {
          try {
            arrayBuffer = await asset.file.arrayBuffer();
          } catch {}
        }

        // 2. Fallback to IndexedDB
        if (!arrayBuffer && asset.id) {
          const blob = await getMediaBlob(asset.id);
          if (blob) {
            arrayBuffer = await blob.arrayBuffer();
          }
        }

        // 3. Fallback to source video if this is a separated audio clip
        if (!arrayBuffer && asset.sourceAssetId) {
          const sourceBlob = await getMediaBlob(asset.sourceAssetId);
          if (sourceBlob) {
            arrayBuffer = await sourceBlob.arrayBuffer();
          }
        }

        if (!arrayBuffer) {
          return null;
        }

        // Check format hints
        const isVideoFormat = asset.type === 'video' ||
          asset.isVideoContainerAudio ||
          (asset.name && /\.(mp4|webm|mov|mkv)$/i.test(asset.name)) ||
          (asset.url && (asset.url.endsWith('.mp4') || asset.url.endsWith('.webm')));

        let audioBuffer = null;

        if (isVideoFormat && !asset.isExtractedWav) {
          // If video container, extract pure WAV first to avoid decoding errors
          try {
            const wavBlob = await extractAudioTrackToWavBlob(new Blob([arrayBuffer]));
            const wavBuf = await wavBlob.arrayBuffer();
            audioBuffer = await ctx.decodeAudioData(wavBuf);
          } catch {
            // Fallback to direct decode with buffer copy (decodeAudioData neuters buffer)
            const copy = arrayBuffer.slice(0);
            audioBuffer = await ctx.decodeAudioData(copy);
          }
        } else {
          try {
            // Slicing prevents neutering original arrayBuffer in case of fallback
            const copy = arrayBuffer.slice(0);
            audioBuffer = await ctx.decodeAudioData(copy);
          } catch {
            const wavBlob = await extractAudioTrackToWavBlob(new Blob([arrayBuffer]));
            const wavBuf = await wavBlob.arrayBuffer();
            audioBuffer = await ctx.decodeAudioData(wavBuf);
          }
        }

        if (audioBuffer) {
          this.bufferCache.set(asset.id, audioBuffer);
        }
        return audioBuffer;
      } catch (err) {
        console.warn('AudioMixerEngine: Could not decode audio asset buffer:', asset?.name || asset?.id, err);
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
   * Returns true if audio context is active and playback is running.
   */
  hasActiveAudio() {
    return this.isPlaying && !!this.audioCtx && (this.activeSources.size > 0 || this.audioCtx.state === 'running');
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
    for (const { sourceNode, gainNode } of this.activeSources.values()) {
      try {
        sourceNode.onended = null;
        sourceNode.stop();
        sourceNode.disconnect();
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
   * Dynamically updates volume and mute for all active tracks and clips without stopping playback.
   */
  updateVolumes(project) {
    if (!project || !project.tracks || !this.audioCtx) return;
    const ctx = this.audioCtx;

    for (const track of project.tracks) {
      if (track.type === 'audio') {
        const isTrackMuted = !!track.muted;
        const trackVolume = track.volume !== undefined ? track.volume : 1.0;
        const bus = this.getTrackBus(track.id, trackVolume, isTrackMuted);

        for (const clip of (track.clips || [])) {
          const entry = this.activeSources.get(clip.id);
          if (entry && entry.gainNode) {
            const isMuted = !!clip.muted || isTrackMuted;
            const clipVol = clip.volume !== undefined ? clip.volume : 1.0;
            const finalGain = isMuted ? 0 : Math.max(0, Math.min(1, clipVol));
            entry.gainNode.gain.setValueAtTime(finalGain, ctx.currentTime);
          }
        }
      }
    }
  }

  /**
   * Updates multi-track playback state as the timeline advances.
   * Handles clip boundaries, transitions, and starting newly reached clips dynamically.
   */
  update(currentTime, project) {
    if (!this.isPlaying || !project || !project.tracks) return;

    const ctx = this.getContext();
    const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
    const audioTracks = project.tracks.filter(t => t.type === 'audio');

    const LOOKAHEAD = 0.35; // 350ms lookahead for gapless transitions
    const validClipIds = new Set();

    for (const track of audioTracks) {
      const isTrackMuted = !!track.muted;
      const trackVolume = track.volume !== undefined ? track.volume : 1.0;
      const trackBus = this.getTrackBus(track.id, trackVolume, isTrackMuted);

      for (const clip of (track.clips || [])) {
        const start = clip.startTime;
        const end = clip.startTime + clip.duration;

        // Clip is relevant if it's currently active OR starting within the lookahead window
        const isCurrentlyActive = (currentTime >= start && currentTime < end);
        const isUpcoming = (!isCurrentlyActive && start > currentTime && start <= (currentTime + LOOKAHEAD));

        if (isCurrentlyActive || isUpcoming) {
          validClipIds.add(clip.id);

          // If not yet scheduled/playing, schedule it now
          if (!this.activeSources.has(clip.id)) {
            const asset = assetsMap.get(clip.assetId);
            if (!asset) continue;

            const buffer = this.bufferCache.get(asset.id);
            if (buffer) {
              this.scheduleClipNode(clip, buffer, currentTime, trackBus);
            } else {
              // Asynchronously decode and schedule
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

      const clipGain = ctx.createGain();
      const isMuted = !!clip.muted || !!trackBus.isMuted;
      const clipVol = clip.volume !== undefined ? clip.volume : 1.0;
      clipGain.gain.setValueAtTime(isMuted ? 0 : Math.max(0, Math.min(1, clipVol)), ctx.currentTime);

      sourceNode.connect(clipGain);
      clipGain.connect(trackBus.gainNode);

      const deltaToStart = clip.startTime - this.playbackTimelineStartTime;
      const scheduledCtxTime = this.audioCtxStartTime + deltaToStart;

      if (scheduledCtxTime <= ctx.currentTime) {
        // Active clip: calculate current offset
        const elapsedSinceStart = ctx.currentTime - scheduledCtxTime;
        const targetOffset = (clip.sourceStart || 0) + elapsedSinceStart;
        const remainingDuration = clip.duration - elapsedSinceStart;

        if (remainingDuration <= 0.02 || targetOffset >= (buffer.duration - 0.02)) return;

        const safeOffset = Math.max(0, Math.min(buffer.duration - 0.01, targetOffset));
        const safeDuration = Math.max(0.01, Math.min(buffer.duration - safeOffset, remainingDuration));

        sourceNode.start(0, safeOffset, safeDuration);
      } else {
        // Upcoming clip in lookahead window: schedule sample-accurately at future time
        if ((clip.sourceStart || 0) >= (buffer.duration - 0.02)) return;
        const safeOffset = Math.max(0, Math.min(buffer.duration - 0.01, clip.sourceStart || 0));
        const safeDuration = Math.max(0.01, Math.min(buffer.duration - safeOffset, clip.duration));

        sourceNode.start(scheduledCtxTime, safeOffset, safeDuration);
      }

      const entry = { sourceNode, gainNode: clipGain, clipId: clip.id, trackId: trackBus.trackId };
      this.activeSources.set(clip.id, entry);

      sourceNode.onended = () => {
        if (this.activeSources.get(clip.id)?.sourceNode === sourceNode) {
          try {
            sourceNode.disconnect();
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
