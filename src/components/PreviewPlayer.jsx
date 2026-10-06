import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Repeat,
  Maximize,
  Film,
  AlertCircle,
  Download,
  Sparkles,
  Eye,
  EyeOff,
  Gauge
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';
import { audioMixer } from '../utils/audioMixerEngine';
import { getTrackLayerRank } from '../utils/timelineOps';
import { AnimatedGraphicOverlay } from './AnimatedGraphicOverlay';

/**
 * Dedicated Video Track Layer Component
 * Mounts directly into the DOM for native hardware decoding, zero-drift AV sync,
 * permanent frame retention on pause (no black screen), and smooth queued seeking.
 * When the video track is hidden (isVisible === false), visual rendering is suppressed
 * but the video element remains active to keep playing audio and maintaining clock sync.
 */
const VideoTrackLayer = React.memo(function VideoTrackLayer({
  clip,
  asset,
  currentTime,
  isPlaying,
  isScrubbing = false,
  audioSettings,
  zIndex,
  isPrimary,
  hasActiveAudio = false,
  isVisible = true,
  isPrewarming = false,
  isOutgoing = false,
  playbackRate = 1.0,
  onRegisterPrimaryVideo,
  onUnregisterPrimaryVideo,
  onNativePause
}) {
  const videoRef = useRef(null);
  const playPromiseRef = useRef(null);
  const startupTimeRef = useRef(0);
  const lastSeekTimeRef = useRef(0);
  const isSeekingRef = useRef(false);
  const pendingSeekTargetRef = useRef(null);
  const [hasFrameReady, setHasFrameReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const rawOffset = Math.max(0, (currentTime - clip.startTime) + (clip.sourceStart || 0));
  const getSafeOffset = (offset) => {
    const video = videoRef.current;
    if (video && video.duration && !isNaN(video.duration) && video.duration > 0) {
      return Math.max(0, Math.min(video.duration - 0.001, offset));
    }
    return Math.max(0.001, offset);
  };
  const targetOffset = getSafeOffset(rawOffset);
  const lastTargetOffsetRef = useRef(undefined);

  // Safe seek handler with fastSeek support for long videos and queued seeking
  const performSeek = (target, isFast = false) => {
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState < 1) {
      pendingSeekTargetRef.current = { target, isFast };
      isSeekingRef.current = true;
      return;
    }

    if (video.seeking) {
      pendingSeekTargetRef.current = { target, isFast };
      return;
    }

    pendingSeekTargetRef.current = null;
    isSeekingRef.current = true;
    startupTimeRef.current = performance.now();
    lastSeekTimeRef.current = performance.now();

    try {
      if (isFast && typeof video.fastSeek === 'function') {
        video.fastSeek(target);
      } else {
        video.currentTime = target;
      }
    } catch {
      pendingSeekTargetRef.current = { target, isFast };
    }
  };

  // Initialize frame ready state on mount or asset/clip change
  useEffect(() => {
    setLoadError(false);
    if (videoRef.current && videoRef.current.readyState >= 2) {
      setHasFrameReady(true);
    } else {
      setHasFrameReady(false);
    }
    startupTimeRef.current = performance.now();
    lastSeekTimeRef.current = performance.now();
    isSeekingRef.current = false;
    performSeek(targetOffset);
  }, [asset?.url, clip?.id]);

  // Register primary video with master loop for hardware clock synchronization
  useEffect(() => {
    if (isPrimary && isPlaying && !isScrubbing && !isPrewarming && !isOutgoing && videoRef.current) {
      if (onRegisterPrimaryVideo) {
        onRegisterPrimaryVideo(videoRef.current, clip);
      }
    }
    return () => {
      if (isPrimary && onUnregisterPrimaryVideo) {
        onUnregisterPrimaryVideo(clip?.id);
      }
    };
  }, [isPrimary, isPlaying, isScrubbing, isPrewarming, isOutgoing, clip?.id]);

  // Sync volume & mute natively on the video element
  const isPastClipEnd = currentTime >= (clip.startTime + clip.duration);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isPrewarming || isOutgoing || isPastClipEnd || audioSettings.isMuted || !!clip.muted;
    const clipVolume = clip.volume !== undefined ? clip.volume : 1.0;
    video.volume = Math.max(0, Math.min(1, (audioSettings.volume ?? 1.0) * Math.min(1, clipVolume)));
  }, [audioSettings.isMuted, audioSettings.volume, isPrewarming, isOutgoing, isPastClipEnd, clip.muted, clip.volume]);

  // Safe play/pause helpers to prevent Promise cancellation / AbortError
  const safePlay = () => {
    const video = videoRef.current;
    if (!video || isPrewarming) return;

    if (video.paused && !playPromiseRef.current) {
      try {
        const p = video.play();
        if (p !== undefined) {
          playPromiseRef.current = p;
          p.then(() => {
            startupTimeRef.current = performance.now();
            setHasFrameReady(true);
          }).catch((err) => {
            // Silently ignore expected aborts during rapid seeks/pause
          }).finally(() => {
            playPromiseRef.current = null;
          });
        }
      } catch (err) {
        // Silently catch
      }
    }
  };

  const safePause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (playPromiseRef.current) {
      playPromiseRef.current.then(() => {
        if (!video.paused) {
          try { video.pause(); } catch {}
        }
      }).catch(() => {});
    } else {
      if (!video.paused) {
        try { video.pause(); } catch {}
      }
    }
  };

  // Safe cleanup on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        if (playPromiseRef.current) {
          playPromiseRef.current.then(() => {
            try { video.pause(); } catch {}
          }).catch(() => {});
        } else {
          try { video.pause(); } catch {}
        }
      }
    };
  }, []);

  // Pre-warm video frame in GPU memory when upcoming
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPrewarming) {
      const handlePrewarmLoaded = () => {
        if (video.readyState >= 2) {
          setHasFrameReady(true);
        }
      };

      video.addEventListener('seeked', handlePrewarmLoaded, { once: true });
      video.addEventListener('canplay', handlePrewarmLoaded, { once: true });
      video.addEventListener('loadeddata', handlePrewarmLoaded, { once: true });

      try {
        video.currentTime = Math.max(0.001, clip.sourceStart || 0);
      } catch {}

      if (video.readyState >= 2) {
        setHasFrameReady(true);
      }
    }
  }, [isPrewarming, clip.sourceStart]);

  // Video event listeners to guarantee hasFrameReady is always set and never stuck black
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleFrameReady = () => {
      if (video.readyState >= 2) {
        setHasFrameReady(true);
      }
    };

    const handleLoadedMetadata = () => {
      const pending = pendingSeekTargetRef.current;
      const target = pending ? (typeof pending === 'object' ? pending.target : pending) : targetOffset;
      const isFast = pending && typeof pending === 'object' ? pending.isFast : false;
      pendingSeekTargetRef.current = null;
      if (Math.abs(video.currentTime - target) > 0.02) {
        performSeek(target, isFast);
      }
      if (video.readyState >= 2) {
        setHasFrameReady(true);
      }
    };

    const handleSeeked = () => {
      isSeekingRef.current = false;
      setHasFrameReady(true);
      startupTimeRef.current = performance.now();
      lastSeekTimeRef.current = performance.now();

      // If another seek was requested while this seek was in progress, execute it now cleanly
      if (pendingSeekTargetRef.current !== null) {
        const next = pendingSeekTargetRef.current;
        pendingSeekTargetRef.current = null;
        const target = typeof next === 'object' ? next.target : next;
        const isFast = typeof next === 'object' ? next.isFast : false;
        performSeek(target, isFast);
        return;
      }

      const isActuallyScrubbing = isScrubbing || window.isTimelineScrubbing;
      if (isPlaying && !isActuallyScrubbing && !isPrewarming && !isOutgoing && video.paused) {
        safePlay();
      }
    };

    const handleNativePause = () => {
      if (isPrimary && isPlaying && !isSeekingRef.current && !isPrewarming && !isOutgoing) {
        const isActuallyScrubbing = isScrubbing || window.isTimelineScrubbing;
        if (!isActuallyScrubbing && video.ended && onNativePause) {
          onNativePause();
        }
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('canplay', handleFrameReady);
    video.addEventListener('loadeddata', handleFrameReady);
    video.addEventListener('playing', handleFrameReady);
    video.addEventListener('timeupdate', handleFrameReady);
    video.addEventListener('pause', handleNativePause);

    if (video.readyState >= 2) {
      setHasFrameReady(true);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('canplay', handleFrameReady);
      video.removeEventListener('loadeddata', handleFrameReady);
      video.removeEventListener('playing', handleFrameReady);
      video.removeEventListener('timeupdate', handleFrameReady);
      video.removeEventListener('pause', handleNativePause);
    };
  }, [isPlaying, isScrubbing, isPrewarming, isOutgoing, isPrimary, onNativePause]);

  const wasScrubbingRef = useRef(false);

  // Handle Play/Pause State Transitions cleanly
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isActuallyScrubbing = isScrubbing || window.isTimelineScrubbing;
    if (isPlaying && !isActuallyScrubbing && !isPrewarming && !isOutgoing) {
      startupTimeRef.current = performance.now();
      lastSeekTimeRef.current = performance.now();
      if (video.readyState >= 2) {
        setHasFrameReady(true);
        if (Math.abs(video.currentTime - targetOffset) > 0.08) {
          performSeek(targetOffset);
        }
        if (!video.seeking) {
          safePlay();
        }
      } else {
        const handleReady = () => {
          setHasFrameReady(true);
          if (isPlaying && !isScrubbing && !window.isTimelineScrubbing && !isPrewarming && !isOutgoing) {
            try { video.currentTime = targetOffset; } catch {}
            safePlay();
          }
        };
        video.addEventListener('canplay', handleReady, { once: true });
        video.addEventListener('loadeddata', handleReady, { once: true });
      }
    } else {
      safePause();
      if (video.playbackRate !== 1.0) {
        video.playbackRate = 1.0;
      }
    }
  }, [isPlaying, isScrubbing, isPrewarming, isOutgoing]);

  // Handle Scrubbing / Seeking (both while playing and paused)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const prevTarget = lastTargetOffsetRef.current;
    lastTargetOffsetRef.current = targetOffset;

    const isActuallyScrubbing = isScrubbing || window.isTimelineScrubbing;
    const justFinishedScrubbing = wasScrubbingRef.current && !isActuallyScrubbing;
    wasScrubbingRef.current = isActuallyScrubbing;

    const isFirstSync = prevTarget === undefined;

    // SCENARIO 1: Scrubbing (user dragging playhead across long video)
    if (isActuallyScrubbing) {
      // Use fastSeek for instantaneous, hardware-accelerated scrubbing
      performSeek(targetOffset, true);
      return;
    }

    // SCENARIO 2: Paused (exact frame preview on playhead)
    if (!isPlaying) {
      const currentDiff = Math.abs(video.currentTime - targetOffset);
      if (isFirstSync || justFinishedScrubbing || currentDiff > 0.03) {
        performSeek(targetOffset, false);
      }
      if (video.playbackRate !== playbackRate) {
        video.playbackRate = playbackRate;
      }
      return;
    }

    // SCENARIO 3: Active Playback (smooth native GPU decoding with gentle drift compensation)
    if (!video.seeking && video.readyState >= 2) {
      const drift = targetOffset - video.currentTime;
      const absDrift = Math.abs(drift);

      if (justFinishedScrubbing || absDrift > 0.85) {
        // Substantial drift (> 850ms) or transport jump: perform target seek
        performSeek(targetOffset, false);
        if (!isPrewarming && !isOutgoing && video.paused && !video.seeking) {
          safePlay();
        }
      } else if (absDrift > 0.08) {
        // Seamless micro-adjustment without decoder hitching
        const rate = drift > 0 ? (playbackRate * 1.05) : (playbackRate * 0.95);
        if (video.playbackRate !== rate) {
          video.playbackRate = rate;
        }
      } else {
        // Perfectly locked in sync
        if (video.playbackRate !== playbackRate) {
          video.playbackRate = playbackRate;
        }
      }
    }
  }, [targetOffset, isPlaying, isScrubbing, isPrewarming, isOutgoing, isPrimary, hasActiveAudio, playbackRate]);

  const fitMode = clip.fit || 'contain';
  const scale = clip.scale || 1.0;
  const opacity = clip.opacity !== undefined ? clip.opacity : 1.0;
  const posX = clip.positionX || 0;
  const posY = clip.positionY || 0;
  const rotation = clip.rotation || 0;
  const flipX = clip.flipX ? -1 : 1;
  const flipY = clip.flipY ? -1 : 1;
  const blendMode = clip.blendMode || 'normal';
  const brightness = clip.brightness !== undefined ? clip.brightness : 1.0;
  const contrast = clip.contrast !== undefined ? clip.contrast : 1.0;
  const saturate = clip.saturate !== undefined ? clip.saturate : 1.0;
  const blur = clip.blur || 0;
  const borderRadius = clip.borderRadius || 0;

  const filterStyle = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) ${blur > 0 ? `blur(${blur}px)` : ''}`.trim();
  const transformStyle = `translate(${posX}px, ${posY}px) rotate(${rotation}deg) scale(${scale * flipX}, ${scale * flipY})`;
  const effectiveVisible = isVisible && !isPrewarming;

  // Validate thumbnail is an actual image URL (not a video URL)
  const isImageThumbnail = asset?.thumbnail &&
    !asset.thumbnail.endsWith('.mp4') &&
    !asset.thumbnail.endsWith('.webm') &&
    !asset.thumbnail.includes('/video') &&
    !asset.thumbnail.startsWith('data:video');

  const isVideoLoaded = videoRef.current && videoRef.current.readyState >= 2;
  const isReady = hasFrameReady || isVideoLoaded || isImageThumbnail;

  // Layer opacity: instantaneous display without artificial delays
  const containerOpacity = effectiveVisible ? opacity : 0;

  return (
    <div
      className="preview-media-layer"
      style={{
        zIndex: isPrewarming ? 0 : zIndex,
        opacity: effectiveVisible ? containerOpacity : 0,
        visibility: isPrewarming ? 'hidden' : 'visible',
        pointerEvents: effectiveVisible ? 'auto' : 'none',
        transform: transformStyle,
        mixBlendMode: blendMode !== 'normal' ? blendMode : undefined,
        filter: filterStyle,
        borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
        overflow: borderRadius > 0 ? 'hidden' : undefined,
        backgroundImage: isImageThumbnail ? `url("${asset.thumbnail}")` : undefined,
        backgroundSize: fitMode === 'cover' ? 'cover' : 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <video
        key={asset.url}
        ref={videoRef}
        src={asset.url}
        playsInline
        preload={isPrewarming ? "metadata" : "auto"}
        crossOrigin="anonymous"
        disablePictureInPicture
        disableRemotePlayback
        className="preview-video-element"
        style={{
          objectFit: fitMode,
          borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined
        }}
        onLoadedData={() => setHasFrameReady(true)}
        onCanPlay={() => setHasFrameReady(true)}
        onSeeked={() => setHasFrameReady(true)}
        onPlaying={() => setHasFrameReady(true)}
        onTimeUpdate={() => setHasFrameReady(true)}
        onError={(e) => {
          const video = videoRef.current;
          if (video && video.error && video.error.code === 1) {
            // MediaError.MEDIA_ERR_ABORTED: Normal when seeking or rewinding, do not crash!
            return;
          }
          console.warn('Video load notice for asset:', asset?.name || asset?.url, e);
          setLoadError(true);
        }}
      />
      {loadError && effectiveVisible && (
        <div className="preview-empty-stage" style={{ color: '#f43f5e', background: 'rgba(15, 23, 42, 0.9)', padding: '16px', borderRadius: '8px' }}>
          <AlertCircle size={32} />
          <span>Error al reproducir el video: {asset?.name || 'recurso'}</span>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  // If playing continuously and not scrubbing, the video element plays natively via GPU hardware.
  if (prev.isPlaying && next.isPlaying && !prev.isScrubbing && !next.isScrubbing) {
    if (
      prev.clip?.id === next.clip?.id &&
      prev.asset?.url === next.asset?.url &&
      prev.isPrimary === next.isPrimary &&
      prev.isVisible === next.isVisible &&
      prev.isPrewarming === next.isPrewarming &&
      prev.isOutgoing === next.isOutgoing &&
      prev.zIndex === next.zIndex &&
      prev.audioSettings?.isMuted === next.audioSettings?.isMuted &&
      prev.audioSettings?.volume === next.audioSettings?.volume
    ) {
      return true; // Skip re-rendering! Native video playback continues uninterrupted
    }
  }

  // When paused, scrubbing, or state changed, standard equality:
  return (
    prev.clip?.id === next.clip?.id &&
    prev.asset?.url === next.asset?.url &&
    prev.currentTime === next.currentTime &&
    prev.isPlaying === next.isPlaying &&
    prev.isScrubbing === next.isScrubbing &&
    prev.isPrimary === next.isPrimary &&
    prev.isVisible === next.isVisible &&
    prev.isPrewarming === next.isPrewarming &&
    prev.isOutgoing === next.isOutgoing &&
    prev.zIndex === next.zIndex &&
    prev.audioSettings?.isMuted === next.audioSettings?.isMuted &&
    prev.audioSettings?.volume === next.audioSettings?.volume
  );
});

/**
 * Dedicated Image Track Layer Component
 * Pre-warms images into GPU cache so transitions to images are instantaneous with zero black frames.
 */
const ImageTrackLayer = React.memo(function ImageTrackLayer({ clip, asset, zIndex, isVisible = true, isPrewarming = false, isOutgoing = false }) {
  const [imgLoaded, setImgLoaded] = useState(false);

  // Pre-load image into browser cache immediately
  useEffect(() => {
    if (!asset?.url) return;
    setImgLoaded(false);
    const img = new Image();
    img.src = asset.url;
    if (img.complete && img.naturalWidth > 0) {
      setImgLoaded(true);
    } else {
      img.onload = () => setImgLoaded(true);
      img.onerror = () => setImgLoaded(true); // Don't block if failed
    }
  }, [asset?.url]);

  const effectiveVisible = isVisible && !isPrewarming;
  const fitMode = clip.fit || 'contain';
  const scale = clip.scale || 1.0;
  const opacity = clip.opacity !== undefined ? clip.opacity : 1.0;
  const posX = clip.positionX || 0;
  const posY = clip.positionY || 0;
  const rotation = clip.rotation || 0;
  const flipX = clip.flipX ? -1 : 1;
  const flipY = clip.flipY ? -1 : 1;
  const blendMode = clip.blendMode || 'normal';
  const brightness = clip.brightness !== undefined ? clip.brightness : 1.0;
  const contrast = clip.contrast !== undefined ? clip.contrast : 1.0;
  const saturate = clip.saturate !== undefined ? clip.saturate : 1.0;
  const blur = clip.blur || 0;
  const borderRadius = clip.borderRadius || 0;

  const filterStyle = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) ${blur > 0 ? `blur(${blur}px)` : ''}`.trim();
  const transformStyle = `translate(${posX}px, ${posY}px) rotate(${rotation}deg) scale(${scale * flipX}, ${scale * flipY})`;

  return (
    <div
      className="preview-media-layer"
      style={{
        zIndex: isPrewarming ? 0 : zIndex,
        opacity: (effectiveVisible && imgLoaded) ? opacity : (effectiveVisible && isOutgoing ? opacity : 0),
        visibility: effectiveVisible ? 'visible' : 'hidden',
        pointerEvents: effectiveVisible ? 'auto' : 'none',
        transform: transformStyle,
        mixBlendMode: blendMode !== 'normal' ? blendMode : undefined,
        filter: filterStyle,
        borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
        overflow: borderRadius > 0 ? 'hidden' : undefined
      }}
    >
      <img
        key={asset.url}
        src={asset.url}
        alt=""
        className="preview-image-element"
        style={{
          objectFit: fitMode,
          opacity: imgLoaded ? 1 : 0,
          borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
          transition: 'opacity 0.08s ease'
        }}
        onLoad={() => setImgLoaded(true)}
        draggable={false}
      />
    </div>
  );
});

export function PreviewPlayer({
  project,
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  onTogglePlayPause,
  isScrubbing = false,
  selectedClipId,
  onSelectClip = null,
  onUpdateClip = null,
  onOpenSceneBroll = null,
  onOpenBatchBroll = null
}) {
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const fallbackRafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const lastExpectedTimeRef = useRef(currentTime);
  const lastReactUpdateRef = useRef(0);
  const lastAudioUpdateRef = useRef(0);
  const primaryVideoElementRef = useRef(null);
  const primaryVideoClipRef = useRef(null);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [stageDimensions, setStageDimensions] = useState({ width: 640, height: 360 });

  const handleRegisterPrimaryVideo = useCallback((el, clip) => {
    primaryVideoElementRef.current = el;
    primaryVideoClipRef.current = clip;
  }, []);

  const handleUnregisterPrimaryVideo = useCallback((clipId) => {
    if (primaryVideoClipRef.current?.id === clipId) {
      primaryVideoElementRef.current = null;
      primaryVideoClipRef.current = null;
    }
  }, []);

  const handleNativePause = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  const duration = project.settings?.duration || 20;
  const aspectRatio = project.settings?.aspectRatio || '16:9';

  const activeScene = useMemo(() => {
    const list = project.scenes?.list || [];
    return list.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
  }, [project.scenes, currentTime]);

  // Responsive stage sizing: measures monitor viewport and computes exact pixel dimensions preserving aspect ratio
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const computeSize = () => {
      const rect = viewport.getBoundingClientRect();
      const padding = 28;
      const availW = Math.max(200, rect.width - padding);
      const availH = Math.max(120, rect.height - padding);

      const targetRatio = aspectRatio === '9:16' ? (9 / 16) : (aspectRatio === '1:1' ? 1 : (16 / 9));

      let w = availW;
      let h = availW / targetRatio;

      if (h > availH) {
        h = availH;
        w = availH * targetRatio;
      }

      setStageDimensions({
        width: Math.floor(w),
        height: Math.floor(h)
      });
    };

    computeSize();

    const ro = new ResizeObserver(() => {
      computeSize();
    });

    ro.observe(viewport);
    window.addEventListener('resize', computeSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeSize);
    };
  }, [aspectRatio]);

  // Preload and cache all audio buffers in the project for instantaneous playback
  useEffect(() => {
    audioMixer.preloadProjectBuffers(project);
  }, [project.assets, project.tracks]);

  // Map assets by ID
  const assetsMap = useMemo(() => {
    return new Map((project.assets || []).map(a => [a.id, a]));
  }, [project.assets]);

  // All video tracks (we include both visible and hidden tracks so audio & clock continue uninterrupted)
  const videoTracks = useMemo(() => {
    return (project.tracks || []).filter(t => t.type === 'video');
  }, [project.tracks]);

  // Lookahead pre-buffering and cross-cut retention constants
  const LOOKAHEAD_WINDOW = 2.0; // 2.0s lookahead ensures upcoming clips are 100% pre-buffered in GPU before cut
  const GRACE_PERIOD = 0.2; // 200ms transition retention prevents any black frames or visual hitching

  // Find all active, pre-warming, and outgoing visual clips at currentTime in track order
  const activeVisualClips = useMemo(() => {
    const list = [];
    videoTracks.forEach((track, trackIndex) => {
      const isVisible = track.visible !== false;

      for (const clip of (track.clips || [])) {
        const start = clip.startTime;
        const end = clip.startTime + clip.duration;

        // Clip is currently in its main active playing window
        const isMainActive = (currentTime >= start && currentTime < end);
        // Clip is in its outgoing grace window (holding final frame to cover incoming clip transition)
        const isOutgoing = (!isMainActive && currentTime >= end && currentTime <= (end + GRACE_PERIOD));
        const isCurrentlyActive = isMainActive || isOutgoing;

        // Clip is coming up soon (pre-warm container and decode initial frame)
        const isPrewarming = (!isCurrentlyActive && start > currentTime && start <= (currentTime + LOOKAHEAD_WINDOW));

        if (isCurrentlyActive || isPrewarming) {
          const asset = assetsMap.get(clip.assetId);
          if (asset && asset.url) {
            let isMuted = false;
            let volume = 1.0;

            if (track.muted) {
              isMuted = true;
            }

            if (asset.type === 'video') {
              const audioTracks = (project.tracks || []).filter(t => t.type === 'audio');
              // Check if this video has a separated or companion audio clip on an audio track
              const hasAudioOnAudioTrack = clip.audioSeparated || audioTracks.some(at =>
                (at.clips || []).some(ac =>
                  ac.id === clip.linkedClipId ||
                  ac.linkedClipId === clip.id
                )
              );

              if (hasAudioOnAudioTrack) {
                // Audio is handled 100% by the independent audio track in audioMixer!
                isMuted = true;
              } else if (clip.isBroll) {
                isMuted = clip.muted !== undefined ? clip.muted : true;
              } else if (clip.muted) {
                isMuted = true;
              } else if (clip.volume !== undefined) {
                volume = clip.volume;
              }
            }

            const baseLayerRank = getTrackLayerRank(track, trackIndex, videoTracks.length);
            // If clip is incoming (main active) during cut with an outgoing clip on same track, give incoming +1 zIndex
            const calculatedZIndex = isPrewarming ? 0 : (isOutgoing ? baseLayerRank : (baseLayerRank + 1));

            list.push({
              clip,
              track,
              asset,
              zIndex: calculatedZIndex,
              layerRank: baseLayerRank,
              isPrimary: false,
              isVisible,
              isCurrentlyActive,
              isOutgoing,
              isPrewarming,
              audioSettings: { isMuted: isPrewarming || isOutgoing || isMuted, volume }
            });
          }
        }
      }
    });

    // Retain all tracks and layers in proper visual stacking order (no destructive deduplication)
    const sortedClips = [...list].sort((a, b) => a.zIndex - b.zIndex);

    // Master clock selection: select exactly ONE active continuous video track (prioritizing V1)
    const activeVideos = sortedClips.filter(item => item.isCurrentlyActive && !item.isOutgoing && item.asset.type === 'video');
    if (activeVideos.length > 0) {
      const primaryCandidate = activeVideos.find(item => item.layerRank === 10 && item.isVisible)
        || activeVideos.find(item => item.isVisible)
        || activeVideos[0];
      if (primaryCandidate) {
        primaryCandidate.isPrimary = true;
      }
    }

    // Return sorted ascending by zIndex so DOM rendering order preserves correct visual stacking
    return sortedClips;
  }, [videoTracks, currentTime, assetsMap, project.tracks]);

  // Active graphic clips at currentTime
  const activeGraphicClips = useMemo(() => {
    const list = [];
    (project.tracks || []).forEach((track) => {
      if (track.visible === false) return;
      for (const clip of (track.clips || [])) {
        if (clip.isGraphic) {
          const start = clip.startTime;
          const end = clip.startTime + clip.duration;
          if (currentTime >= start && currentTime <= end) {
            list.push({ clip, track });
          }
        }
      }
    });
    return list;
  }, [project.tracks, currentTime]);

  // Check if any visual clip is currently visible on screen
  const hasVisibleClips = useMemo(() => {
    const hasVideoClips = activeVisualClips.some(item => item.isCurrentlyActive && item.isVisible);
    const hasGraphics = activeGraphicClips.length > 0;
    return hasVideoClips || hasGraphics;
  }, [activeVisualClips, activeGraphicClips]);

  // Synchronize track and clip volume and mute states in real-time
  useEffect(() => {
    audioMixer.updateVolumes(project);
  }, [project.tracks]);

  // Synchronize audio mixer with transport state (Play / Pause)
  useEffect(() => {
    if (isPlaying && !isScrubbing) {
      audioMixer.play(currentTime, project);
    } else {
      audioMixer.pause();
    }
  }, [isPlaying, isScrubbing]);

  // Centralized explicit seek handler: executes immediate sample-accurate audio & video seek
  const executeSeek = useCallback((targetTime) => {
    const clamped = Math.max(0, Math.min(duration, targetTime));
    lastExpectedTimeRef.current = clamped;
    lastTimeRef.current = performance.now();
    window.__montageCurrentTime = clamped;
    window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: clamped } }));
    setCurrentTime(clamped);
    audioMixer.seek(clamped, project);

    if (primaryVideoElementRef.current && primaryVideoClipRef.current) {
      const vid = primaryVideoElementRef.current;
      const clip = primaryVideoClipRef.current;
      const rawOffset = Math.max(0, (clamped - clip.startTime) + (clip.sourceStart || 0));
      const safeOffset = (vid.duration && !isNaN(vid.duration) && vid.duration > 0)
        ? Math.max(0, Math.min(vid.duration - 0.001, rawOffset))
        : Math.max(0.001, rawOffset);
      try { vid.currentTime = safeOffset; } catch {}
    }
  }, [duration, project, setCurrentTime]);

  // Global listener for explicit user seek requests (from ruler clicks, shortcuts, transport, etc.)
  useEffect(() => {
    const handleUserSeek = (e) => {
      if (e.detail && typeof e.detail.time === 'number') {
        executeSeek(e.detail.time);
      }
    };
    window.addEventListener('montage-user-seek', handleUserSeek);
    return () => window.removeEventListener('montage-user-seek', handleUserSeek);
  }, [executeSeek]);

  // Synchronize audio mixer with transport state (Play / Pause)
  useEffect(() => {
    if (isPlaying && !isScrubbing) {
      audioMixer.play(currentTime, project);
    } else {
      audioMixer.pause();
    }
  }, [isPlaying, isScrubbing]);

  // When paused or scrubbing, keep audio mixer synchronized with exact playhead position
  useEffect(() => {
    if (!isPlaying || isScrubbing) {
      audioMixer.seek(currentTime, project);
      lastExpectedTimeRef.current = currentTime;
    }
  }, [currentTime, isPlaying, isScrubbing, project]);

  // Continuous Master Timeline Engine with Audio-Master Hardware DAC Synchronization
  useEffect(() => {
    if (!isPlaying || isScrubbing) {
      if (fallbackRafRef.current) cancelAnimationFrame(fallbackRafRef.current);
      fallbackRafRef.current = null;
      lastTimeRef.current = null;
      audioMixer.pause();
      return;
    }

    lastTimeRef.current = performance.now();
    lastReactUpdateRef.current = performance.now();

    const masterLoop = (now) => {
      const last = lastTimeRef.current || now;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) * playbackSpeed;
      lastTimeRef.current = now;

      const primaryVid = primaryVideoElementRef.current;
      const primaryClip = primaryVideoClipRef.current;
      const hasAudio = audioMixer.hasActiveAudio();

      let t;

      // 1. Direct hardware audio DAC clock synchronization (absolute master clock)
      if (hasAudio) {
        const audioTimeline = audioMixer.getHardwareTimelineTime();
        if (audioTimeline !== null && !isNaN(audioTimeline) && audioTimeline >= 0) {
          t = audioTimeline;
        }
      }

      // 2. Direct hardware video clock synchronization
      if (t === undefined && primaryVid && primaryClip) {
        if (!primaryVid.paused && !primaryVid.seeking && primaryVid.readyState >= 2) {
          const videoTimeline = primaryVid.currentTime - (primaryClip.sourceStart || 0) + primaryClip.startTime;
          if (!isNaN(videoTimeline) && videoTimeline >= 0) {
            t = videoTimeline;
          }
        } else {
          // Primary video is buffering / starting up: HOLD TIME! Do NOT advance software clock!
          t = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : primaryClip.startTime;
        }
      }

      // 3. Fallback software clock ONLY for empty gaps, text, or image clips (when no primary video or audio exists)
      if (t === undefined) {
        const prevT = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : 0;
        t = prevT + dt;
      }

      // Strictly monotonic during continuous forward playback: cannot jump backward!
      if (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) {
        t = Math.max(lastExpectedTimeRef.current, t);
      }

      if (t >= duration) {
        if (isLooping) {
          audioMixer.seek(0, project);
          lastExpectedTimeRef.current = 0;
          setCurrentTime(0);
          window.__montageCurrentTime = 0;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: 0 } }));
        } else {
          setIsPlaying(false);
          audioMixer.pause();
          lastExpectedTimeRef.current = 0;
          setCurrentTime(0);
          window.__montageCurrentTime = 0;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: 0 } }));
          return;
        }
      } else {
        lastExpectedTimeRef.current = t;
        if (!lastAudioUpdateRef.current || (now - lastAudioUpdateRef.current) >= 70) {
          lastAudioUpdateRef.current = now;
          audioMixer.update(t, project);
        }

        // Broadcast high-precision hardware tick to timeline playhead (zero React overhead)
        window.__montageCurrentTime = t;
        window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: t } }));

        // Throttle root React tree re-renders to ~10 FPS (>= 100ms) during continuous playback.
        if ((now - lastReactUpdateRef.current) >= 100) {
          lastReactUpdateRef.current = now;
          setCurrentTime(t);
        }
      }

      fallbackRafRef.current = requestAnimationFrame(masterLoop);
    };

    fallbackRafRef.current = requestAnimationFrame(masterLoop);

    return () => {
      if (fallbackRafRef.current) cancelAnimationFrame(fallbackRafRef.current);
    };
  }, [isPlaying, isScrubbing, duration, isLooping, setCurrentTime, setIsPlaying, project, playbackSpeed]);

  // Synchronize exact playhead ONLY when transitioning from playing to paused
  const prevIsPlayingRef = useRef(isPlaying);
  useEffect(() => {
    if (prevIsPlayingRef.current && !isPlaying) {
      if (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) {
        setCurrentTime(lastExpectedTimeRef.current);
      }
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, setCurrentTime]);

  // Jump to beginning
  const handleJumpStart = () => executeSeek(0);

  // Jump to end
  const handleJumpEnd = () => executeSeek(duration);

  // Rewind 5 seconds
  const handleRewind5s = () => {
    const cur = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : currentTime;
    executeSeek(Math.max(0, cur - 5));
  };

  // Forward 5 seconds
  const handleForward5s = () => {
    const cur = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : currentTime;
    executeSeek(Math.min(duration, cur + 5));
  };

  // Step 1 second back (or 1 frame if alt key)
  const handleStepBack = (e) => {
    const delta = e?.altKey ? (1 / 30) : 1;
    const cur = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : currentTime;
    executeSeek(Math.max(0, cur - delta));
  };

  // Step 1 second forward (or 1 frame if alt key)
  const handleStepForward = (e) => {
    const delta = e?.altKey ? (1 / 30) : 1;
    const cur = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : currentTime;
    executeSeek(Math.min(duration, cur + delta));
  };

  // Cycle playback speed: 1x -> 1.25x -> 1.5x -> 2x -> 0.5x -> 1x
  const handleToggleSpeed = () => {
    setPlaybackSpeed(prev => {
      if (prev === 1.0) return 1.25;
      if (prev === 1.25) return 1.5;
      if (prev === 1.5) return 2.0;
      if (prev === 2.0) return 0.5;
      return 1.0;
    });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen();
    }
  };

  // Determine aspect ratio class
  let ratioClass = 'preview-16-9';
  if (aspectRatio === '9:16') ratioClass = 'preview-9-16';
  if (aspectRatio === '1:1') ratioClass = 'preview-1-1';

  return (
    <div className="preview-player-container" ref={containerRef}>
      {/* Visual Monitor Area */}
      <div className="monitor-viewport" ref={viewportRef}>
        <div
          className={`canvas-wrapper ${ratioClass}`}
          style={{
            width: `${stageDimensions.width}px`,
            height: `${stageDimensions.height}px`
          }}
        >
          <div className="preview-stage">
            {!hasVisibleClips && activeScene && (
              <div className="preview-scene-stage">
                <div className="preview-scene-badge">
                  <Film size={13} style={{ color: '#06b6d4' }} />
                  <span>[Escena {activeScene.sceneNumber}] {activeScene.title}</span>
                  <span
                    className="badge"
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      background: activeScene.visualType === 'video' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      color: activeScene.visualType === 'video' ? '#06b6d4' : '#818cf8'
                    }}
                  >
                    {activeScene.visualType === 'video' ? 'Video B-Roll' : 'Foto'}
                  </span>
                </div>

                {activeScene.scriptText && (
                  <p className="preview-scene-script">
                    “{activeScene.scriptText}”
                  </p>
                )}

                <div className="preview-scene-prompt">
                  <strong style={{ color: activeScene.color || '#06b6d4' }}>Toma sugerida: </strong>
                  <span>{activeScene.visualDescription}</span>
                </div>

                <div className="preview-scene-actions">
                  {onOpenSceneBroll && (
                    <button
                      type="button"
                      className="btn-primary btn-xs"
                      onClick={() => onOpenSceneBroll(activeScene)}
                      style={{
                        background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px'
                      }}
                    >
                      <Download size={12} />
                      Buscar B-Roll para esta toma
                    </button>
                  )}
                  {onOpenBatchBroll && (
                    <button
                      type="button"
                      className="btn-secondary btn-xs"
                      onClick={onOpenBatchBroll}
                      style={{
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px'
                      }}
                    >
                      <Sparkles size={12} style={{ color: '#06b6d4' }} />
                      ⚡ Auto-Descargar Todo el B-Roll
                    </button>
                  )}
                </div>
              </div>
            )}

            {!hasVisibleClips && !activeScene && (
              <div className="preview-empty-stage">
                {activeVisualClips.length > 0 ? (
                  <>
                    <EyeOff size={36} className="text-cyan" style={{ opacity: 0.6 }} />
                    <span style={{ color: '#38bdf8' }}>Pista de video oculta (audio reproduciéndose)</span>
                  </>
                ) : (
                  <>
                    <Film size={36} className="text-dim" style={{ opacity: 0.35 }} />
                    <span>Sin clips en este fotograma</span>
                  </>
                )}
              </div>
            )}

            {activeVisualClips.map((item) => {
              if (item.asset.type === 'video') {
                return (
                  <VideoTrackLayer
                    key={item.clip.id}
                    clip={item.clip}
                    asset={item.asset}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    isScrubbing={isScrubbing}
                    playbackRate={playbackSpeed}
                    audioSettings={item.audioSettings}
                    zIndex={item.zIndex}
                    isPrimary={item.isPrimary}
                    hasActiveAudio={audioMixer.hasActiveAudio()}
                    isVisible={item.isVisible}
                    isPrewarming={item.isPrewarming}
                    isOutgoing={item.isOutgoing}
                    onRegisterPrimaryVideo={handleRegisterPrimaryVideo}
                    onUnregisterPrimaryVideo={handleUnregisterPrimaryVideo}
                    onNativePause={handleNativePause}
                  />
                );
              } else {
                return (
                  <ImageTrackLayer
                    key={item.clip.id}
                    clip={item.clip}
                    asset={item.asset}
                    zIndex={item.zIndex}
                    isVisible={item.isVisible}
                    isPrewarming={item.isPrewarming}
                    isOutgoing={item.isOutgoing}
                  />
                );
              }
            })}

            {/* Animated Graphic & Motion Overlays */}
            {activeGraphicClips.map(({ clip, track }) => (
              <AnimatedGraphicOverlay
                key={clip.id}
                clip={clip}
                currentTime={currentTime}
                isSelected={selectedClipId === clip.id}
                onSelect={onSelectClip}
                onUpdatePosition={(clipId, updates) => {
                  if (onUpdateClip) {
                    onUpdateClip(clipId, updates);
                  }
                }}
                stageDimensions={stageDimensions}
              />
            ))}

            <div className="timecode-overlay timecode">
              {formatTimecode(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="playback-bar">
        <div className="playback-left">
          <div className="playback-time-badge">
            <span className="timecode text-primary">{formatTimecode(currentTime)}</span>
            <span className="time-divider">/</span>
            <span className="timecode text-muted">{formatTimecode(duration)}</span>
          </div>
        </div>

        <div className="playback-center">
          <button
            className="btn-ghost icon-only"
            title="Ir al inicio (Home)"
            onClick={handleJumpStart}
          >
            <SkipBack size={16} />
          </button>

          <button
            className="btn-ghost icon-only"
            title="Rebobinar 5 segundos (J o Shift + ←)"
            onClick={handleRewind5s}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <RotateCcw size={15} />
            <span style={{ fontSize: '8.5px', fontWeight: 800, marginLeft: '2px', letterSpacing: '-0.5px' }}>5s</span>
          </button>

          <button
            className="btn-ghost icon-only"
            title="Retroceder 1 segundo (← | Alt+← para 1 fotograma)"
            onClick={handleStepBack}
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            className={`play-btn ${isPlaying ? 'playing' : ''}`}
            title="Reproducir / Pausa (Espacio o K)"
            onClick={(e) => {
              e.currentTarget.blur();
              if (onTogglePlayPause) {
                onTogglePlayPause();
              } else {
                setIsPlaying(!isPlaying);
              }
            }}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>

          <button
            className="btn-ghost icon-only"
            title="Avanzar 1 segundo (→ | Alt+→ para 1 fotograma)"
            onClick={handleStepForward}
          >
            <ChevronRight size={18} />
          </button>

          <button
            className="btn-ghost icon-only"
            title="Acelerar / Avanzar 5 segundos (L o Shift + →)"
            onClick={handleForward5s}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span style={{ fontSize: '8.5px', fontWeight: 800, marginRight: '2px', letterSpacing: '-0.5px' }}>5s</span>
            <RotateCw size={15} />
          </button>

          <button
            className="btn-ghost icon-only"
            title="Ir al final (End)"
            onClick={handleJumpEnd}
          >
            <SkipForward size={16} />
          </button>
        </div>

        <div className="playback-right">
          <button
            className={`btn-ghost ${playbackSpeed !== 1.0 ? 'active' : ''}`}
            title="Velocidad de reproducción (Clic para alternar 1x, 1.25x, 1.5x, 2x, 0.5x)"
            onClick={handleToggleSpeed}
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              border: playbackSpeed !== 1.0 ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
              background: playbackSpeed !== 1.0 ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              color: playbackSpeed !== 1.0 ? '#38bdf8' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Gauge size={13} />
            <span>{playbackSpeed}x</span>
          </button>

          <button
            className={`btn-ghost icon-only ${isLooping ? 'active text-indigo' : 'text-dim'}`}
            title="Bucle de reproducción"
            onClick={() => setIsLooping(!isLooping)}
          >
            <Repeat size={16} />
          </button>

          <button
            className="btn-ghost icon-only"
            title="Pantalla Completa"
            onClick={toggleFullscreen}
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
