/**
 * Secondary Audio Synchronizer for Montage Pro Studio
 * Handles independent audio tracks (voiceover, dialogue, background music, sound effects,
 * and extracted/separated video audio) with sample-accurate timeline clock synchronization.
 * Every clip on an audio track has its own dedicated audio element (keyed by clip.id)
 * so clips can be moved, trimmed, deleted, or muted 100% independently.
 */

import { extractAudioTrackToWavBlob } from './audioExtractor';

export class SecondaryAudioSynchronizer {
  constructor() {
    this.audioPool = new Map(); // clipId -> HTMLAudioElement
    this.extractedUrls = new Map(); // assetUrl -> wavBlobUrl
    this.extractingInProgress = new Set(); // assetUrl
    this.isPlaying = false;
    this.currentTime = 0;
  }

  /**
   * Returns an active, playing audio element from the pool to use as clock reference.
   */
  getActiveAudioElement() {
    if (!this.isPlaying) return null;
    for (const audio of this.audioPool.values()) {
      if (!audio.paused && !audio.ended && !audio.muted && audio.readyState >= 2) {
        return audio;
      }
    }
    return null;
  }

  /**
   * Stops and pauses ALL audio elements immediately.
   */
  stopAll() {
    this.isPlaying = false;
    for (const audio of this.audioPool.values()) {
      try {
        if (!audio.paused) {
          audio.pause();
        }
      } catch {}
    }
  }

  /**
   * Cleans up all audio instances.
   */
  destroy() {
    this.stopAll();
    for (const audio of this.audioPool.values()) {
      try {
        audio.pause();
        audio.src = '';
      } catch {}
    }
    this.audioPool.clear();
  }

  /**
   * Synchronizes active audio clips to the master timeline clock.
   * @param {number} currentTime Current project timestamp in seconds
   * @param {object} project Current project data
   * @param {boolean} isPlaying Playback state
   */
  sync(currentTime, project, isPlaying) {
    this.currentTime = currentTime;
    this.isPlaying = !!isPlaying;
    if (!project || !project.tracks) return;

    // 1. If playback is paused or stopped, pause all audio elements immediately
    if (!this.isPlaying) {
      for (const audio of this.audioPool.values()) {
        try {
          if (!audio.paused) audio.pause();
        } catch {}
      }
    }

    const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
    const audioTracks = (project.tracks || []).filter(t => t.type === 'audio');

    // 2. Identify clips that are active right now (currentTime is within duration)
    const activeClipsToPlay = [];
    const allAudioClipIds = new Set();

    for (const track of audioTracks) {
      for (const clip of (track.clips || [])) {
        allAudioClipIds.add(clip.id);
        const start = clip.startTime;
        const end = clip.startTime + clip.duration;

        if (currentTime >= start && currentTime < end) {
          activeClipsToPlay.push({ clip, track });
        }
      }
    }

    const activeClipIdSet = new Set(activeClipsToPlay.map(x => x.clip.id));

    // 3. Pause any audio elements that are no longer active at this timestamp
    for (const [clipId, audio] of this.audioPool.entries()) {
      if (!activeClipIdSet.has(clipId)) {
        try {
          if (!audio.paused) audio.pause();
        } catch {}
      }
      // If clip was completely deleted from project, clean up and remove from pool
      if (!allAudioClipIds.has(clipId)) {
        try {
          audio.pause();
          audio.src = '';
        } catch {}
        this.audioPool.delete(clipId);
      }
    }

    // 4. Synchronize all currently active clips
    for (const { clip, track } of activeClipsToPlay) {
      const asset = assetsMap.get(clip.assetId);
      if (!asset || !asset.url) continue;

      let effectiveUrl = asset.url;
      const isVideoAsset = !asset.isExtractedWav && (
        asset.type === 'video' ||
        asset.sourceAssetId ||
        asset.isVideoContainerAudio ||
        (project.assets || []).some(a => a.type === 'video' && a.id !== asset.id && a.url === asset.url) ||
        (asset.name && /\((Pista Audio|Audio)\)/i.test(asset.name)) ||
        asset.url.endsWith('.mp4') ||
        asset.url.endsWith('.webm') ||
        asset.url.endsWith('.mov') ||
        (asset.name && /\.(mp4|webm|mov|mkv)$/i.test(asset.name))
      );

      if (isVideoAsset) {
        if (this.extractedUrls.has(asset.url)) {
          effectiveUrl = this.extractedUrls.get(asset.url);
        } else if (!this.extractingInProgress.has(asset.url)) {
          this.extractingInProgress.add(asset.url);
          extractAudioTrackToWavBlob(asset.url)
            .then((wavBlob) => {
              const wavUrl = URL.createObjectURL(wavBlob);
              this.extractedUrls.set(asset.url, wavUrl);
              asset.isExtractedWav = true;
              for (const a of this.audioPool.values()) {
                if (a._sourceVideoUrl === asset.url || a._loadedUrl === asset.url) {
                  const wasPaused = a.paused;
                  const curTime = a.currentTime;
                  a._loadedUrl = wavUrl;
                  a.src = wavUrl;
                  try { a.currentTime = curTime; } catch {}
                  if (!wasPaused && this.isPlaying) {
                    a.play().catch(() => {});
                  }
                }
              }
            })
            .catch(() => {});
        }
      }

      let audio = this.audioPool.get(clip.id);
      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        audio.playsInline = true;
        audio.preservesPitch = true;
        this.audioPool.set(clip.id, audio);
      }

      audio._startTime = clip.startTime;
      audio._sourceStart = clip.sourceStart || 0;
      audio._duration = clip.duration;
      audio._sourceVideoUrl = isVideoAsset ? asset.url : null;

      const targetOffset = Math.max(0, (currentTime - clip.startTime) + (clip.sourceStart || 0));

      if (audio._loadedUrl !== effectiveUrl) {
        audio._loadedUrl = effectiveUrl;
        audio.src = effectiveUrl;
        try { audio.currentTime = targetOffset; } catch {}
      }

      const isMuted = !!track.muted || !!clip.muted;
      audio.muted = isMuted;

      const clipVol = clip.volume !== undefined ? clip.volume : 1.0;
      const trackVol = track.volume !== undefined ? track.volume : 1.0;
      audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, clipVol * trackVol));

      const prevTarget = audio._lastTargetOffset;
      audio._lastTargetOffset = targetOffset;

      const isJump = prevTarget !== undefined && Math.abs(targetOffset - prevTarget) > 0.3;

      if (!this.isPlaying) {
        if (!audio.paused) {
          try { audio.pause(); } catch {}
        }
        if (Math.abs(audio.currentTime - targetOffset) > 0.05) {
          try { audio.currentTime = targetOffset; } catch {}
        }
      } else {
        // PLAYING:
        if (isJump || audio.paused || Math.abs(audio.currentTime - targetOffset) > 0.3) {
          try { audio.currentTime = targetOffset; } catch {}
        }
        if (audio.paused && !isMuted) {
          audio.play().catch(() => {});
        }
      }
    }
  }
}
