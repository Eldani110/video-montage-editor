import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
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
  Maximize2,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Film,
  AlertCircle,
  Download,
  Sparkles,
  Eye,
  EyeOff,
  Gauge,
  Sliders
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';
import { audioMixer } from '../utils/audioMixerEngine';
import { getTrackLayerRank } from '../utils/timelineOps';
import { AnimatedGraphicOverlay } from './AnimatedGraphicOverlay';
import { TransformGizmo } from './TransformGizmo';
import { resolveRealSceneTimelinePosition } from '../utils/sceneOps';
import { attemptBackendTranscode } from '../utils/mediaTypeUtils';

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
  isSelected = false,
  onSelect = null,
  onRegisterPrimaryVideo,
  onUnregisterPrimaryVideo,
  onNativePause,
  handlesRef = null
}) {
  const videoRef = useRef(null);
  const playPromiseRef = useRef(null);
  const startupTimeRef = useRef(0);
  const lastSeekTimeRef = useRef(0);
  const isSeekingRef = useRef(false);
  const pendingSeekTargetRef = useRef(null);
  const [hasFrameReady, setHasFrameReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // While playing, React's `currentTime` is throttled and can lag the real playhead by 100-200 ms;
  // the master loop publishes the exact time every frame, so use it for offsets.
  const liveTime = (isPlaying && !isScrubbing && typeof window !== 'undefined' && typeof window.__montageCurrentTime === 'number')
    ? window.__montageCurrentTime
    : currentTime;
  // A pre-warming clip must sit on its FIRST frame (sourceStart), not on a time-shifted position.
  const rawOffset = isPrewarming
    ? Math.max(0, clip.sourceStart || 0)
    : Math.max(0, (liveTime - clip.startTime) + (clip.sourceStart || 0));
  const getSafeOffset = (offset) => {
    const video = videoRef.current;
    if (video && video.duration && !isNaN(video.duration) && video.duration > 0) {
      return Math.max(0, Math.min(video.duration - 0.001, offset));
    }
    return Math.max(0.001, offset);
  };
  const targetOffset = getSafeOffset(rawOffset);
  const lastTargetOffsetRef = useRef(undefined);
  const engineStateRef = useRef({ lastSeek: 0 });

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

  const assetName = asset?.name || asset?.fileName || (typeof asset?.url === 'string' ? asset.url.split('?')[0].split('/').pop() : '') || '';
  const isMovOrSpecial = /\.(mov|qt|mkv|avi|wmv|flv|ts|m2ts)$/i.test(assetName);

  let diskPath = asset?.diskPath || null;
  if (!diskPath && typeof asset?.url === 'string' && asset.url.startsWith('/media-library/')) {
    try {
      const u = new URL(asset.url, 'http://localhost');
      diskPath = u.searchParams.get('path') || null;
    } catch (_) {}
  }
  const streamFallback = diskPath
    ? `/media-library/stream?path=${encodeURIComponent(diskPath)}`
    : (assetName ? `/media-library/stream?name=${encodeURIComponent(assetName)}` : null);

  // Hierarchical source resolution:
  // For MOV/QT or special containers, always prefer the fast-start MP4 stream from the backend
  const hasValidStream = !!streamFallback;
  const isPreviewRawMov = typeof asset?.previewUrl === 'string' && /\.(mov|qt|mkv|avi|wmv|flv|ts|m2ts)$/i.test(asset.previewUrl.split('?')[0]);
  const isPreviewStreamEndpoint = typeof asset?.previewUrl === 'string' && asset.previewUrl.startsWith('/media-library/stream');

  const effectiveMediaSrc =
    (isPreviewStreamEndpoint ? asset.previewUrl : null) ||
    (isMovOrSpecial && hasValidStream ? streamFallback : null) ||
    (!isPreviewRawMov ? asset?.previewUrl : null) ||
    streamFallback ||
    asset?.previewUrl ||
    asset?.url ||
    '';

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
  }, [effectiveMediaSrc, clip?.id]);

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

  // Engine handle: lets the master loop (every frame) drive play / pause / mute / drift for this
  // element imperatively, independent of React's throttled render cadence.
  const baseMuted = !!(audioSettings.isMuted || clip.muted);
  useEffect(() => {
    if (!handlesRef) return undefined;
    handlesRef.current.set(clip.id, {
      videoRef,
      clip,
      baseMuted,
      state: engineStateRef.current,
      performSeek
    });
    return () => { handlesRef.current.delete(clip.id); };
  }, [handlesRef, clip, baseMuted]);

  // Sync volume & mute natively on the video element. While playing, the engine re-evaluates
  // `muted` every frame (active window + seeking); this sets the correct baseline otherwise.
  const isPastClipEnd = currentTime >= (clip.startTime + clip.duration);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isPrewarming || isOutgoing || isPastClipEnd || video.seeking || baseMuted;
    const clipVolume = clip.volume !== undefined ? clip.volume : 1.0;
    video.volume = Math.max(0, Math.min(1, (audioSettings.volume ?? 1.0) * Math.min(1, clipVolume)));
  }, [baseMuted, audioSettings.volume, isPrewarming, isOutgoing, isPastClipEnd, clip.volume]);

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
          try { video.pause(); } catch { }
        }
      }).catch(() => { });
    } else {
      if (!video.paused) {
        try { video.pause(); } catch { }
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
            try { video.pause(); } catch { }
          }).catch(() => { });
        } else {
          try { video.pause(); } catch { }
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
      } catch { }

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

      // Immediately restore native video mute state once seek completes
      const isPastClipEnd = currentTime >= (clip.startTime + clip.duration);
      video.muted = isPrewarming || isOutgoing || isPastClipEnd || baseMuted;

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
        // Already positioned (pre-warmed clip or continuing playback): never re-seek for small
        // offsets - that is what froze/repeated frames at short cuts.
        const diff = Math.abs(video.currentTime - targetOffset);
        if (diff > (video.paused ? 0.15 : 0.3)) {
          performSeek(targetOffset);
        }
        if (!video.seeking) {
          safePlay();
        }
      } else {
        const handleReady = () => {
          setHasFrameReady(true);
          if (isPlaying && !isScrubbing && !window.isTimelineScrubbing && !isPrewarming && !isOutgoing) {
            try { video.currentTime = targetOffset; } catch { }
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

    // SCENARIO 3: Active playback. The master loop engine (driveVideoElements) owns play / pause /
    // mute / drift for every element on every frame, so nothing is done here on React renders.
    if (video.playbackRate !== playbackRate && !video.seeking && Math.abs(video.playbackRate - playbackRate) > 0.2) {
      video.playbackRate = playbackRate;
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

  const hueRotate = clip.hueRotate || 0;
  const sepia = clip.sepia || 0;
  const grayscale = clip.grayscale || 0;
  const invert = clip.invert || 0;
  const dropShadow = clip.dropShadow || 0;
  const temperature = Number(clip.temperature || 0);
  const tint = Number(clip.tint || 0);
  const vignette = Number(clip.vignette || 0);

  const cropTop = Math.max(0, Math.min(45, Number(clip.cropTop || 0)));
  const cropBottom = Math.max(0, Math.min(45, Number(clip.cropBottom || 0)));
  const cropLeft = Math.max(0, Math.min(45, Number(clip.cropLeft || 0)));
  const cropRight = Math.max(0, Math.min(45, Number(clip.cropRight || 0)));
  const hasCrop = cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0;
  const clipPathStyle = hasCrop ? `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)` : undefined;
  const vignetteBoxShadow = vignette > 0 ? `inset 0 0 ${vignette * 1.6}px rgba(0,0,0,${Math.min(0.95, vignette / 90)})` : undefined;

  const filters = [];
  if (brightness !== 1.0) filters.push(`brightness(${brightness})`);
  if (contrast !== 1.0) filters.push(`contrast(${contrast})`);
  if (saturate !== 1.0) filters.push(`saturate(${saturate})`);
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (sepia > 0) filters.push(`sepia(${sepia / 100})`);
  if (grayscale > 0) filters.push(`grayscale(${grayscale / 100})`);
  if (invert > 0) filters.push(`invert(${invert / 100})`);
  if (hueRotate !== 0) filters.push(`hue-rotate(${hueRotate}deg)`);
  if (dropShadow > 0) filters.push(`drop-shadow(0 ${Math.round(dropShadow * 0.4)}px ${dropShadow}px rgba(0,0,0,0.85))`);
  if (temperature > 0) filters.push(`sepia(${(temperature / 250).toFixed(2)})`);
  if (tint !== 0 || temperature < 0) {
    const hueDeg = Math.round((tint * 0.45) + (temperature < 0 ? temperature * 0.25 : 0));
    if (hueDeg !== 0) filters.push(`hue-rotate(${hueDeg}deg)`);
  }
  const filterStyle = filters.join(' ').trim();
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
      className={`preview-media-layer ${isSelected ? 'is-selected-layer' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(clip.id);
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.stopPropagation();
          if (onSelect) onSelect(clip.id);
        }
      }}
      style={{
        zIndex: isPrewarming ? 0 : zIndex,
        opacity: effectiveVisible ? containerOpacity : 0,
        visibility: isPrewarming ? 'hidden' : 'visible',
        pointerEvents: isSelected ? 'none' : (effectiveVisible ? 'auto' : 'none'),
        transform: transformStyle,
        mixBlendMode: blendMode !== 'normal' ? blendMode : undefined,
        filter: filterStyle || undefined,
        clipPath: clipPathStyle,
        boxShadow: vignetteBoxShadow,
        borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
        overflow: borderRadius > 0 ? 'hidden' : undefined,
        backgroundImage: isImageThumbnail ? `url("${asset.thumbnail}")` : undefined,
        backgroundSize: fitMode === 'cover' ? 'cover' : 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <video
        key={effectiveMediaSrc}
        ref={videoRef}
        src={effectiveMediaSrc}
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        disablePictureInPicture
        disableRemotePlayback
        className="preview-video-element"
        style={{
          objectFit: fitMode,
          borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
          pointerEvents: 'none'
        }}
        onLoadedData={() => {
          setHasFrameReady(true);
          setLoadError(false);
          const video = videoRef.current;
          if (video && video.videoWidth === 0 && streamFallback && !video.src.includes('/media-library/stream')) {
            video.src = streamFallback;
            video.load();
          }
        }}
        onCanPlay={() => { setHasFrameReady(true); setLoadError(false); }}
        onSeeked={() => { setHasFrameReady(true); setLoadError(false); }}
        onPlaying={() => { setHasFrameReady(true); setLoadError(false); }}
        onError={async (e) => {
          const video = videoRef.current;
          if (video && video.error && video.error.code === 1) {
            // MediaError.MEDIA_ERR_ABORTED: Normal when seeking or rewinding, do not crash!
            return;
          }
          console.warn('Video load notice for asset:', asset?.name || asset?.url, e);

          if (video) {
            // 1. If we have a previewUrl or verified streamFallback that wasn't used yet:
            const fallback = asset?.previewUrl || streamFallback;
            if (fallback && video.src !== fallback && !video.src.endsWith(fallback)) {
              video.src = fallback;
              video.load();
              setLoadError(false);
              return;
            }

            // 2. If browser cannot decode natively (e.g. Apple ProRes or HEVC in .mov) and we have the raw File or can fetch from blob:
            let fileToTranscode = asset?.file;
            if (!fileToTranscode && asset?.url && asset.url.startsWith('blob:')) {
              try {
                const res = await fetch(asset.url);
                const b = await res.blob();
                fileToTranscode = new File([b], asset?.name || 'video.mov', { type: b.type || 'video/quicktime' });
              } catch (_) {}
            }

            if (fileToTranscode && typeof window !== 'undefined') {
              try {
                const transcodeRes = await attemptBackendTranscode(fileToTranscode);
                if (transcodeRes && (transcodeRes.url || transcodeRes.previewUrl)) {
                  const fastUrl = transcodeRes.url || transcodeRes.previewUrl;
                  asset.previewUrl = fastUrl;
                  if (transcodeRes.thumbnailUrl && !asset.thumbnail) {
                    asset.thumbnail = transcodeRes.thumbnailUrl;
                  }
                  video.src = fastUrl;
                  video.load();
                  setLoadError(false);
                  return;
                }
              } catch (tErr) {
                console.warn('On-the-fly backend transcode error:', tErr);
              }
            }
          }

          setLoadError(true);
        }}
      />
      {loadError && effectiveVisible && (
        <div className="preview-empty-stage" style={{ color: '#f43f5e', background: 'rgba(15, 23, 42, 0.9)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={32} />
          <span>Error al reproducir el video: {asset?.name || 'recurso'}</span>
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              setLoadError(false);
              const video = videoRef.current;
              if (video) {
                let fileToTranscode = asset?.file;
                if (!fileToTranscode && asset?.url && asset.url.startsWith('blob:')) {
                  try {
                    const res = await fetch(asset.url);
                    const b = await res.blob();
                    fileToTranscode = new File([b], asset?.name || 'video.mov', { type: b.type || 'video/quicktime' });
                  } catch (_) {}
                }
                if (fileToTranscode) {
                  try {
                    const transcodeRes = await attemptBackendTranscode(fileToTranscode);
                    if (transcodeRes && (transcodeRes.url || transcodeRes.previewUrl)) {
                      const fastUrl = transcodeRes.url || transcodeRes.previewUrl;
                      asset.previewUrl = fastUrl;
                      video.src = fastUrl;
                      video.load();
                      return;
                    }
                  } catch (_) {}
                }
                if (streamFallback) video.src = streamFallback;
                else if (asset?.url) video.src = asset.url;
                video.load();
              }
            }}
            style={{
              padding: '4px 14px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              background: 'rgba(244, 63, 94, 0.2)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Reintentar Reproducción
          </button>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  // Check if clip object or its visual properties changed
  const clipEqual = prev.clip === next.clip || (
    prev.clip?.id === next.clip?.id &&
    prev.clip?.positionX === next.clip?.positionX &&
    prev.clip?.positionY === next.clip?.positionY &&
    prev.clip?.scale === next.clip?.scale &&
    prev.clip?.rotation === next.clip?.rotation &&
    prev.clip?.flipX === next.clip?.flipX &&
    prev.clip?.flipY === next.clip?.flipY &&
    prev.clip?.opacity === next.clip?.opacity &&
    prev.clip?.cropTop === next.clip?.cropTop &&
    prev.clip?.cropBottom === next.clip?.cropBottom &&
    prev.clip?.cropLeft === next.clip?.cropLeft &&
    prev.clip?.cropRight === next.clip?.cropRight &&
    prev.clip?.brightness === next.clip?.brightness &&
    prev.clip?.contrast === next.clip?.contrast &&
    prev.clip?.saturate === next.clip?.saturate &&
    prev.clip?.blur === next.clip?.blur &&
    prev.clip?.hueRotate === next.clip?.hueRotate &&
    prev.clip?.sepia === next.clip?.sepia &&
    prev.clip?.grayscale === next.clip?.grayscale &&
    prev.clip?.invert === next.clip?.invert &&
    prev.clip?.vignette === next.clip?.vignette &&
    prev.clip?.temperature === next.clip?.temperature &&
    prev.clip?.tint === next.clip?.tint &&
    prev.clip?.borderRadius === next.clip?.borderRadius &&
    prev.clip?.blendMode === next.clip?.blendMode &&
    prev.clip?.fit === next.clip?.fit
  );

  if (!clipEqual || prev.isSelected !== next.isSelected) {
    return false; // MUST re-render on any transform or selection change!
  }

  const assetEqual =
    prev.asset?.url === next.asset?.url &&
    prev.asset?.previewUrl === next.asset?.previewUrl &&
    prev.asset?.diskPath === next.asset?.diskPath;

  if (!assetEqual) {
    return false; // MUST re-render when asset source or preview stream updates!
  }

  // If playing continuously and not scrubbing, the video element plays natively via GPU hardware.
  if (prev.isPlaying && next.isPlaying && !prev.isScrubbing && !next.isScrubbing) {
    if (
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
const ImageTrackLayer = React.memo(function ImageTrackLayer({
  clip,
  asset,
  zIndex,
  isVisible = true,
  isPrewarming = false,
  isOutgoing = false,
  isSelected = false,
  onSelect = null
}) {
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

  const hueRotate = clip.hueRotate || 0;
  const sepia = clip.sepia || 0;
  const grayscale = clip.grayscale || 0;
  const invert = clip.invert || 0;
  const dropShadow = clip.dropShadow || 0;
  const temperature = Number(clip.temperature || 0);
  const tint = Number(clip.tint || 0);
  const vignette = Number(clip.vignette || 0);

  const cropTop = Math.max(0, Math.min(45, Number(clip.cropTop || 0)));
  const cropBottom = Math.max(0, Math.min(45, Number(clip.cropBottom || 0)));
  const cropLeft = Math.max(0, Math.min(45, Number(clip.cropLeft || 0)));
  const cropRight = Math.max(0, Math.min(45, Number(clip.cropRight || 0)));
  const hasCrop = cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0;
  const clipPathStyle = hasCrop ? `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)` : undefined;
  const vignetteBoxShadow = vignette > 0 ? `inset 0 0 ${vignette * 1.6}px rgba(0,0,0,${Math.min(0.95, vignette / 90)})` : undefined;

  const filters = [];
  if (brightness !== 1.0) filters.push(`brightness(${brightness})`);
  if (contrast !== 1.0) filters.push(`contrast(${contrast})`);
  if (saturate !== 1.0) filters.push(`saturate(${saturate})`);
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (sepia > 0) filters.push(`sepia(${sepia / 100})`);
  if (grayscale > 0) filters.push(`grayscale(${grayscale / 100})`);
  if (invert > 0) filters.push(`invert(${invert / 100})`);
  if (hueRotate !== 0) filters.push(`hue-rotate(${hueRotate}deg)`);
  if (dropShadow > 0) filters.push(`drop-shadow(0 ${Math.round(dropShadow * 0.4)}px ${dropShadow}px rgba(0,0,0,0.85))`);
  if (temperature > 0) filters.push(`sepia(${(temperature / 250).toFixed(2)})`);
  if (tint !== 0 || temperature < 0) {
    const hueDeg = Math.round((tint * 0.45) + (temperature < 0 ? temperature * 0.25 : 0));
    if (hueDeg !== 0) filters.push(`hue-rotate(${hueDeg}deg)`);
  }
  const filterStyle = filters.join(' ').trim();
  const transformStyle = `translate(${posX}px, ${posY}px) rotate(${rotation}deg) scale(${scale * flipX}, ${scale * flipY})`;

  return (
    <div
      className={`preview-media-layer ${isSelected ? 'is-selected-layer' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(clip.id);
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.stopPropagation();
          if (onSelect) onSelect(clip.id);
        }
      }}
      style={{
        zIndex: isPrewarming ? 0 : zIndex,
        opacity: (effectiveVisible && imgLoaded) ? opacity : (effectiveVisible && isOutgoing ? opacity : 0),
        visibility: effectiveVisible ? 'visible' : 'hidden',
        pointerEvents: isSelected ? 'none' : (effectiveVisible ? 'auto' : 'none'),
        transform: transformStyle,
        mixBlendMode: blendMode !== 'normal' ? blendMode : undefined,
        filter: filterStyle || undefined,
        clipPath: clipPathStyle,
        boxShadow: vignetteBoxShadow,
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
          transition: 'opacity 0.08s ease',
          pointerEvents: 'none'
        }}
        onLoad={() => setImgLoaded(true)}
        draggable={false}
      />
    </div>
  );
});

const ZOOM_PRESETS = [
  { label: 'Ajustar', value: 1.0, isFit: true },
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.0 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2.0 },
  { label: '300%', value: 3.0 }
];

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
  onBeginTransform = null,
  onEndTransform = null,
  onCancelTransform = null,
  onOpenSceneBroll = null,
  onOpenBatchBroll = null,
  onSelectScene = null
}) {
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const zoomDropdownRef = useRef(null);
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

  // Canvas Zoom & Pan Navigation State
  const [viewportSize, setViewportSize] = useState({ width: 640, height: 360 });
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isFitMode, setIsFitMode] = useState(true);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isWheeling, setIsWheeling] = useState(false);
  const wheelTimeoutRef = useRef(null);
  const isSpacePressedRef = useRef(false);
  const pendingScrollRef = useRef(null);

  const workspacePadding = useMemo(() => {
    if (isFitMode) return { padX: 0, padY: 0 };
    const padX = Math.round(Math.max(viewportSize.width * 0.75, 300));
    const padY = Math.round(Math.max(viewportSize.height * 0.75, 200));
    return { padX, padY };
  }, [isFitMode, viewportSize]);

  const stateRef = useRef({ zoomLevel, isFitMode, stageDimensions, viewportSize, workspacePadding });
  useEffect(() => {
    stateRef.current = { zoomLevel, isFitMode, stageDimensions, viewportSize, workspacePadding };
  }, [zoomLevel, isFitMode, stageDimensions, viewportSize, workspacePadding]);

  // Synchronously position scrollbars after layout updates to keep canvas resolution perfectly centered
  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;

    if (isFitMode) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
      pendingScrollRef.current = null;
      return;
    }

    if (pendingScrollRef.current) {
      const { left, top } = pendingScrollRef.current;
      pendingScrollRef.current = null;
      el.scrollLeft = Math.max(0, left);
      el.scrollTop = Math.max(0, top);
    }
  }, [zoomLevel, isFitMode, stageDimensions, workspacePadding]);

  const handleZoomStep = (multiplier) => {
    const current = stateRef.current;
    const nextZoom = Math.max(0.25, Math.min(4.0, Number((current.zoomLevel * multiplier).toFixed(2))));
    if (nextZoom === current.zoomLevel && !current.isFitMode) return;

    const el = scrollAreaRef.current;
    const viewW = el ? el.clientWidth : current.viewportSize.width;
    const viewH = el ? el.clientHeight : current.viewportSize.height;
    const padX = Math.round(Math.max(viewW * 0.75, 300));
    const padY = Math.round(Math.max(viewH * 0.75, 200));

    // Keep center of resolution centered in viewport
    const nextScrollLeft = Math.round(padX + (current.stageDimensions.width * nextZoom) / 2 - viewW / 2);
    const nextScrollTop = Math.round(padY + (current.stageDimensions.height * nextZoom) / 2 - viewH / 2);

    pendingScrollRef.current = { left: nextScrollLeft, top: nextScrollTop };
    setIsFitMode(false);
    setZoomLevel(nextZoom);
  };

  const handleZoomIn = () => handleZoomStep(1.2);
  const handleZoomOut = () => handleZoomStep(0.8);

  const handleResetFit = () => {
    setIsFitMode(true);
    setZoomLevel(1.0);
    setShowZoomMenu(false);
    pendingScrollRef.current = { left: 0, top: 0 };
  };

  const handleSelectZoomPreset = (preset) => {
    setShowZoomMenu(false);
    if (preset.isFit) {
      handleResetFit();
    } else {
      const current = stateRef.current;
      const nextZoom = preset.value;
      const el = scrollAreaRef.current;
      const viewW = el ? el.clientWidth : current.viewportSize.width;
      const viewH = el ? el.clientHeight : current.viewportSize.height;
      const padX = Math.round(Math.max(viewW * 0.75, 300));
      const padY = Math.round(Math.max(viewH * 0.75, 200));

      const nextScrollLeft = Math.round(padX + (current.stageDimensions.width * nextZoom) / 2 - viewW / 2);
      const nextScrollTop = Math.round(padY + (current.stageDimensions.height * nextZoom) / 2 - viewH / 2);

      pendingScrollRef.current = { left: nextScrollLeft, top: nextScrollTop };
      setIsFitMode(false);
      setZoomLevel(nextZoom);
    }
  };

  // Intercept Ctrl/Cmd + Wheel to zoom in/out smoothly over the monitor canvas
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        setIsWheeling(true);
        if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        wheelTimeoutRef.current = setTimeout(() => setIsWheeling(false), 140);

        const current = stateRef.current;
        const scrollEl = scrollAreaRef.current;
        if (!scrollEl) return;

        const viewW = scrollEl.clientWidth;
        const viewH = scrollEl.clientHeight;
        const padX = Math.round(Math.max(viewW * 0.75, 300));
        const padY = Math.round(Math.max(viewH * 0.75, 200));

        const rect = scrollEl.getBoundingClientRect();
        const mouseRelX = Math.max(0, Math.min(viewW, e.clientX - rect.left));
        const mouseRelY = Math.max(0, Math.min(viewH, e.clientY - rect.top));

        let pointOnCanvasX, pointOnCanvasY;
        if (current.isFitMode) {
          const curCanvasLeft = (viewW - current.stageDimensions.width) / 2;
          const curCanvasTop = (viewH - current.stageDimensions.height) / 2;
          pointOnCanvasX = mouseRelX - curCanvasLeft;
          pointOnCanvasY = mouseRelY - curCanvasTop;
        } else {
          const curCanvasLeft = padX - scrollEl.scrollLeft;
          const curCanvasTop = padY - scrollEl.scrollTop;
          pointOnCanvasX = (mouseRelX - curCanvasLeft) / current.zoomLevel;
          pointOnCanvasY = (mouseRelY - curCanvasTop) / current.zoomLevel;
        }

        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        const nextZoom = Math.max(0.25, Math.min(4.0, Number((current.zoomLevel * factor).toFixed(2))));
        if (nextZoom === current.zoomLevel) return;

        const nextScrollLeft = Math.round(padX + pointOnCanvasX * nextZoom - mouseRelX);
        const nextScrollTop = Math.round(padY + pointOnCanvasY * nextZoom - mouseRelY);

        pendingScrollRef.current = { left: nextScrollLeft, top: nextScrollTop };
        setIsFitMode(false);
        setZoomLevel(nextZoom);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Close zoom presets menu on outside click
  useEffect(() => {
    if (!showZoomMenu) return;
    const handleClickOutside = (e) => {
      if (zoomDropdownRef.current && !zoomDropdownRef.current.contains(e.target)) {
        setShowZoomMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showZoomMenu]);

  // Track spacebar for pan navigation
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        isSpacePressedRef.current = true;
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Handle middle-click or spacebar drag panning across the canvas
  const handleScrollAreaMouseDown = (e) => {
    const isMiddleClick = e.button === 1;
    const isSpacePan = e.button === 0 && isSpacePressedRef.current;

    if (isMiddleClick || isSpacePan) {
      e.preventDefault();
      setIsPanning(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const startScrollLeft = scrollAreaRef.current?.scrollLeft || 0;
      const startScrollTop = scrollAreaRef.current?.scrollTop || 0;

      const onMouseMove = (moveEvt) => {
        if (!scrollAreaRef.current) return;
        scrollAreaRef.current.scrollLeft = startScrollLeft - (moveEvt.clientX - startX);
        scrollAreaRef.current.scrollTop = startScrollTop - (moveEvt.clientY - startY);
      };

      const onMouseUp = () => {
        setIsPanning(false);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return;
    }

    if (
      e.target === scrollAreaRef.current ||
      e.target.classList.contains('monitor-scroll-area') ||
      e.target.classList.contains('monitor-canvas-space')
    ) {
      if (onSelectClip) onSelectClip(null);
    }
  };

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
    const sceneTrack = (project.tracks || []).find(t => t.type === 'scene');

    // 1. Authoritative: Dedicated scene track clips (track.type === 'scene')
    if (sceneTrack && Array.isArray(sceneTrack.clips)) {
      let sClip = sceneTrack.clips.find(c => currentTime >= c.startTime && currentTime < (c.startTime + c.duration));
      if (!sClip && selectedClipId) {
        const sel = sceneTrack.clips.find(c => c.id === selectedClipId);
        if (sel && Math.abs(currentTime - sel.startTime) < 0.25) {
          sClip = sel;
        }
      }

      if (sClip) {
        const sNum = sClip.sceneNumber ? Number(sClip.sceneNumber) : null;
        const nameMatch = sClip.name?.match(/\[E\s*0*(\d+)\]/i) || sClip.title?.match(/\[E\s*0*(\d+)\]/i);
        const extractedNum = nameMatch ? Number(nameMatch[1]) : null;
        const targetNum = sNum || extractedNum;

        const matched = list.find(s =>
          (targetNum && Number(s.sceneNumber) === targetNum) ||
          (sClip.sceneId && s.id === sClip.sceneId) ||
          (sClip.id && s.id === sClip.id)
        );

        const realStart = Number(sClip.startTime.toFixed(2));
        const realDur = Number((sClip.duration || 4.0).toFixed(2));
        const realEnd = Number((realStart + realDur).toFixed(2));

        return {
          ...(matched || {}),
          id: sClip.sceneId || matched?.id || sClip.id,
          sceneNumber: targetNum || Number(matched?.sceneNumber || 1),
          title: sClip.title || matched?.title || sClip.name || `Escena ${targetNum || 1}`,
          scriptText: sClip.text || matched?.scriptText || sClip.scriptText || '',
          visualDescription: sClip.visualDescription || matched?.visualDescription || '',
          visualType: sClip.visualType || matched?.visualType || 'video',
          searchKeywords: matched?.searchKeywords || sClip.searchKeywords || [],
          color: sClip.color || matched?.color || '#06b6d4',
          startTime: realStart,
          duration: realDur,
          endTime: realEnd,
          timelineSource: 'scene_track'
        };
      }
    }

    // 2. Video track clips containing scene metadata
    const videoTracks = (project.tracks || []).filter(t => t.type === 'video');
    for (const vt of videoTracks) {
      const vClip = (vt.clips || []).find(c => currentTime >= c.startTime && currentTime < (c.startTime + c.duration));
      if (vClip) {
        const sNum = vClip.sceneNumber ? Number(vClip.sceneNumber) : null;
        const nameMatch = vClip.name?.match(/\[E\s*0*(\d+)\]/i) || vClip.title?.match(/\[E\s*0*(\d+)\]/i);
        const extractedNum = nameMatch ? Number(nameMatch[1]) : null;
        const targetNum = sNum || extractedNum;

        if (targetNum || vClip.sceneId) {
          const matched = list.find(s =>
            (targetNum && Number(s.sceneNumber) === targetNum) ||
            (vClip.sceneId && s.id === vClip.sceneId)
          );
          if (matched) {
            const realPos = resolveRealSceneTimelinePosition(matched, project, vClip);
            return {
              ...matched,
              startTime: realPos.startTime,
              duration: realPos.duration,
              endTime: Number((realPos.startTime + realPos.duration).toFixed(2)),
              timelineSource: 'video_clip'
            };
          }
        }
      }
    }

    // 3. Fallback: resolve real timeline positions for scenes in list
    for (const s of list) {
      const realPos = resolveRealSceneTimelinePosition(s, project);
      if (currentTime >= realPos.startTime && currentTime < (realPos.startTime + realPos.duration)) {
        return {
          ...s,
          startTime: realPos.startTime,
          duration: realPos.duration,
          endTime: Number((realPos.startTime + realPos.duration).toFixed(2)),
          timelineSource: realPos.source
        };
      }
    }

    // 4. Last resort (e.g. initial project state before storyboard is placed)
    const directMatch = list.find(s => currentTime >= s.startTime && currentTime <= (s.endTime || s.startTime + (s.duration || 4.0)));
    if (directMatch) {
      return directMatch;
    }

    return null;
  }, [project.scenes, project.tracks, currentTime, selectedClipId]);

  // Responsive stage sizing: measures monitor viewport and computes exact pixel dimensions preserving aspect ratio
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const computeSize = () => {
      const rect = viewport.getBoundingClientRect();
      const vw = Math.max(200, Math.floor(rect.width));
      const vh = Math.max(120, Math.floor(rect.height));
      setViewportSize({ width: vw, height: vh });

      const padding = 28;
      const availW = Math.max(200, vw - padding);
      const availH = Math.max(120, vh - padding);

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
  const LOOKAHEAD_WINDOW = 0.6; // 0.6s lookahead ensures immediate upcoming clip is pre-buffered in GPU memory
  const GRACE_PERIOD = 0.08; // 80ms transition retention prevents black flash between cuts

  // Find all active, pre-warming, and outgoing visual clips at currentTime in track order
  const activeVisualClips = useMemo(() => {
    const list = [];
    videoTracks.forEach((track, trackIndex) => {
      const isVisible = track.visible !== false;
      const trackClips = track.clips || [];

      // Sort track clips by startTime
      const sortedTrackClips = [...trackClips].sort((a, b) => a.startTime - b.startTime);

      // 1. Find the main active clip currently playing at currentTime
      const activeClip = sortedTrackClips.find(c => currentTime >= c.startTime && currentTime < (c.startTime + c.duration));

      // 2. Outgoing clip retention for cross-cut transition (retains previous clip for 80ms to prevent any black gap)
      let outgoingClip = null;
      if (isPlaying) {
        outgoingClip = sortedTrackClips.find(c => {
          if (activeClip && c.id === activeClip.id) return false;
          const end = c.startTime + c.duration;
          return currentTime >= end && currentTime <= (end + GRACE_PERIOD);
        });
      }

      // 3. Lookahead pre-warming: exactly ONE upcoming clip per track within 0.6s
      // Always pre-warm upcoming cuts (even for the same asset) so the next frame is ready before cut arrival
      let prewarmClip = null;
      if (isPlaying) {
        const nextCandidate = sortedTrackClips.find(c => c.startTime > currentTime && c.startTime <= (currentTime + LOOKAHEAD_WINDOW));
        if (nextCandidate && (!activeClip || nextCandidate.id !== activeClip.id)) {
          prewarmClip = nextCandidate;
        }
      }

      const candidateClips = [
        activeClip ? { clip: activeClip, isMainActive: true, isOutgoing: false, isPrewarming: false } : null,
        outgoingClip ? { clip: outgoingClip, isMainActive: false, isOutgoing: true, isPrewarming: false } : null,
        prewarmClip ? { clip: prewarmClip, isMainActive: false, isOutgoing: false, isPrewarming: true } : null
      ].filter(Boolean);

      for (const { clip, isOutgoing, isPrewarming } of candidateClips) {
        const asset = assetsMap.get(clip.assetId);
        if (asset && (asset.url || asset.previewUrl || asset.diskPath)) {
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
            isCurrentlyActive: !isPrewarming,
            isOutgoing,
            isPrewarming,
            audioSettings: { isMuted: isPrewarming || isOutgoing || isMuted, volume }
          });
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
  }, [videoTracks, currentTime, isPlaying, assetsMap, project.tracks]);

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

  // Look up currently selected clip across all tracks
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of (project.tracks || [])) {
      const c = (track.clips || []).find(clip => clip.id === selectedClipId);
      if (c) return { ...c, trackType: track.type, trackId: track.id };
    }
    return null;
  }, [project.tracks, selectedClipId]);

  // Check if selected clip is active / visible on screen at currentTime
  const isSelectedClipOnScreen = useMemo(() => {
    if (!selectedClip) return false;
    if (selectedClip.trackType === 'audio') return false;
    const start = selectedClip.startTime;
    const end = selectedClip.startTime + selectedClip.duration;
    return (currentTime >= start && currentTime <= (end + 0.05));
  }, [selectedClip, currentTime]);

  const selectedClipAsset = useMemo(() => {
    if (!selectedClip?.assetId) return null;
    return assetsMap.get(selectedClip.assetId);
  }, [selectedClip?.assetId, assetsMap]);

  // Global Escape key listener to deselect active clip
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedClipId && onSelectClip) {
          onSelectClip(null);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedClipId, onSelectClip]);

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
      try { vid.currentTime = safeOffset; } catch { }
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

      // 1. Hardware audio DAC clock ground truth:
      // Web Audio API runs sample-accurate and uninterrupted across cuts
      if (hasAudio) {
        const audioTimeline = audioMixer.getHardwareTimelineTime();
        if (audioTimeline !== null && !isNaN(audioTimeline) && audioTimeline >= 0) {
          t = audioTimeline;
        }
      }

      // 2. Direct hardware video clock synchronization:
      // Used when no active audio DAC or as secondary clock.
      if (t === undefined && primaryVid && primaryClip) {
        if (!primaryVid.paused && !primaryVid.seeking && primaryVid.readyState >= 2) {
          const videoTimeline = (primaryVid.currentTime - (primaryClip.sourceStart || 0)) / (primaryClip.playbackRate || 1) + primaryClip.startTime;
          const prevExpected = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : primaryClip.startTime;
          if (!isNaN(videoTimeline) && videoTimeline >= 0) {
            if (Math.abs(videoTimeline - prevExpected) < 0.35 || Math.abs(prevExpected - primaryClip.startTime) < 0.15) {
              t = videoTimeline;
            }
          }
        }
      }

      // 3. Fallback monotonic software clock ONLY for empty gaps, text, or image clips
      if (t === undefined) {
        const prevT = (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) ? lastExpectedTimeRef.current : 0;
        t = prevT + dt;
      }

      // Strictly monotonic during continuous forward playback: cannot jump backward!
      if (lastExpectedTimeRef.current !== null && !isNaN(lastExpectedTimeRef.current)) {
        t = Math.max(lastExpectedTimeRef.current, t);
      }

      // 4. Dynamic hardware drift correction: keep video tightly synchronized to master clock
      if (primaryVid && primaryClip && !primaryVid.seeking && primaryVid.readyState >= 2) {
        const clipElapsed = t - primaryClip.startTime;
        if (clipElapsed >= 0 && clipElapsed <= primaryClip.duration) {
          const expectedVidTime = clipElapsed * (primaryClip.playbackRate || 1) + (primaryClip.sourceStart || 0);
          const drift = primaryVid.currentTime - expectedVidTime;

          if (Math.abs(drift) > 0.40) {
            // Large desync (e.g. following a system hitch or keyframe delay): snap video directly
            try { primaryVid.currentTime = expectedVidTime; } catch (_) {}
          } else if (drift < -0.04) {
            // Video is slightly lagging behind master clock: gently accelerate (1.08x) to catch up
            primaryVid.playbackRate = playbackSpeed * 1.08;
          } else if (drift > 0.04) {
            // Video is slightly ahead of master clock: gently decelerate (0.92x) to allow clock to catch up
            primaryVid.playbackRate = playbackSpeed * 0.92;
          } else {
            // In tight lockstep (< 40ms): standard playback speed
            if (primaryVid.playbackRate !== playbackSpeed) {
              primaryVid.playbackRate = playbackSpeed;
            }
          }
        }
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
        if (!lastAudioUpdateRef.current || (now - lastAudioUpdateRef.current) >= 40) {
          lastAudioUpdateRef.current = now;
          audioMixer.update(t, project);
        }

        // Broadcast high-precision hardware tick to timeline playhead (zero React overhead)
        window.__montageCurrentTime = t;
        window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: t } }));

        // Detect cut boundary crossing for instantaneous React tree update
        const crossedCut = primaryClip && t >= (primaryClip.startTime + primaryClip.duration);
        if (crossedCut || (now - lastReactUpdateRef.current) >= 50) {
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
    <div
      className="preview-player-container"
      ref={containerRef}
      onMouseDown={(e) => {
        if (
          e.target === containerRef.current ||
          e.target.classList.contains('preview-player-container') ||
          e.target.classList.contains('monitor-viewport') ||
          e.target.classList.contains('canvas-wrapper')
        ) {
          if (onSelectClip) onSelectClip(null);
        }
      }}
    >
      {/* Visual Monitor Area */}
      <div
        className="monitor-viewport"
        ref={viewportRef}
        onMouseDown={(e) => {
          if (
            e.target === viewportRef.current ||
            e.target.classList.contains('monitor-viewport')
          ) {
            if (onSelectClip) onSelectClip(null);
          }
        }}
      >
        {/* Floating Monitor Zoom & Canvas Navigation HUD */}
        <div
          className="monitor-zoom-hud"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn-zoom-step"
            onClick={handleZoomOut}
            title="Alejar lienzo (Zoom Out) • Ctrl + Rueda abajo"
          >
            <ZoomOut size={13} />
          </button>

          <div className="zoom-level-dropdown-container" ref={zoomDropdownRef}>
            <button
              type="button"
              className="btn-zoom-display"
              onClick={() => setShowZoomMenu(prev => !prev)}
              title="Nivel de zoom del lienzo (Haz clic para ver opciones)"
            >
              <span>{isFitMode ? 'Ajustar' : `${Math.round(zoomLevel * 100)}%`}</span>
              <ChevronDown size={10} style={{ opacity: 0.7 }} />
            </button>

            {showZoomMenu && (
              <div className="zoom-presets-menu">
                {ZOOM_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`zoom-preset-item ${((p.isFit && isFitMode) || (!p.isFit && !isFitMode && Math.abs(zoomLevel - p.value) < 0.05)) ? 'is-active' : ''}`}
                    onClick={() => handleSelectZoomPreset(p)}
                  >
                    <span>{p.label}</span>
                    {p.isFit && <span className="zoom-preset-tag">Auto</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-zoom-step"
            onClick={handleZoomIn}
            title="Acercar lienzo (Zoom In) • Ctrl + Rueda arriba"
          >
            <ZoomIn size={13} />
          </button>

          <div className="zoom-divider" />

          <button
            type="button"
            className={`btn-zoom-fit ${isFitMode ? 'is-fit-active' : ''}`}
            onClick={handleResetFit}
            title="Restablecer tamaño (Ajustar al monitor)"
          >
            <Maximize2 size={12} />
          </button>
        </div>

        {/* Scrollable Canvas Workspace with Scrollbars */}
        <div
          className={`monitor-scroll-area ${isFitMode ? 'is-fit-mode' : ''} ${isPanning ? 'is-panning' : ''}`}
          ref={scrollAreaRef}
          onMouseDown={handleScrollAreaMouseDown}
        >
          <div
            className="monitor-canvas-space"
            style={{
              padding: isFitMode ? '0px' : `${workspacePadding.padY}px ${workspacePadding.padX}px`
            }}
          >
            <div
              className="monitor-canvas-scaler"
              style={{
                width: `${Math.round(stageDimensions.width * zoomLevel)}px`,
                height: `${Math.round(stageDimensions.height * zoomLevel)}px`,
                position: 'relative',
                flexShrink: 0,
                margin: 'auto',
                transition: isWheeling ? 'none' : 'width 0.15s cubic-bezier(0.16, 1, 0.3, 1), height 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <div
                className={`canvas-wrapper ${ratioClass}`}
                onMouseDown={(e) => {
                  if (e.target.classList.contains('canvas-wrapper')) {
                    if (onSelectClip) onSelectClip(null);
                  }
                }}
                style={{
                  width: `${stageDimensions.width}px`,
                  height: `${stageDimensions.height}px`,
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: '0 0',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transition: isWheeling ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                <div
                  className="preview-stage"
                  onMouseDown={(e) => {
                    if (
                      e.target.classList.contains('preview-stage') ||
                      e.target.classList.contains('preview-media-viewport') ||
                      e.target.classList.contains('preview-empty-stage') ||
                      e.target.classList.contains('preview-scene-stage')
                    ) {
                      if (onSelectClip) onSelectClip(null);
                    }
                  }}
                >
                  {/* Visual Media Viewport - strictly clips video & image pixels to canvas frame */}
                  <div
                    className="preview-media-viewport"
                    onMouseDown={(e) => {
                      if (e.target.classList.contains('preview-media-viewport')) {
                        if (onSelectClip) onSelectClip(null);
                      }
                    }}
                  >
                    {!hasVisibleClips && activeScene && (
                      <div className="preview-scene-stage">
                        <div
                          className="preview-scene-badge"
                          onClick={() => {
                            if (onSelectScene) onSelectScene(activeScene);
                          }}
                          style={{ cursor: onSelectScene ? 'pointer' : 'default', transition: 'all 0.15s ease' }}
                          title="Haz clic para ver y editar las propiedades de esta escena en el panel Escenas IA"
                        >
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
                          {onSelectScene && (
                            <button
                              type="button"
                              className="btn-ghost btn-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectScene(activeScene);
                              }}
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                borderRadius: '3px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                marginLeft: '4px'
                              }}
                            >
                              <Sliders size={10} />
                              Propiedades
                            </button>
                          )}
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
                              onClick={() => {
                                const realPos = resolveRealSceneTimelinePosition(activeScene, project);
                                onOpenSceneBroll({
                                  ...activeScene,
                                  startTime: realPos.startTime,
                                  duration: realPos.duration,
                                  endTime: Number((realPos.startTime + realPos.duration).toFixed(2))
                                });
                              }}
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
                            isSelected={selectedClipId === item.clip.id}
                            onSelect={onSelectClip}
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
                            isSelected={selectedClipId === item.clip.id}
                            onSelect={onSelectClip}
                          />
                        );
                      }
                    })}
                  </div>

                  {/* Animated Graphic & Motion Overlays */}
                  {activeGraphicClips.map(({ clip, track }) => (
                    <AnimatedGraphicOverlay
                      key={clip.id}
                      clip={clip}
                      currentTime={currentTime}
                      isSelected={selectedClipId === clip.id}
                      onSelect={onSelectClip}
                      onUpdatePosition={(clipId, updates, recordHistory = false) => {
                        if (onUpdateClip) {
                          onUpdateClip(clipId, updates, recordHistory);
                        }
                      }}
                      onBeginTransform={onBeginTransform}
                      onEndTransform={onEndTransform}
                      stageDimensions={stageDimensions}
                      monitorZoom={zoomLevel}
                    />
                  ))}

                  {/* Interactive On-Screen Transform Gizmo (Move, Scale, Rotate) for Selected Media Clips */}
                  {isSelectedClipOnScreen && selectedClip && !selectedClip.isGraphic && (
                    <TransformGizmo
                      clip={selectedClip}
                      asset={selectedClipAsset}
                      stageDimensions={stageDimensions}
                      onUpdateClip={onUpdateClip}
                      onBeginTransform={onBeginTransform}
                      onEndTransform={onEndTransform}
                      onDeselect={() => onSelectClip && onSelectClip(null)}
                      monitorZoom={zoomLevel}
                    />
                  )}

                  <div className="timecode-overlay timecode">
                    {formatTimecode(currentTime)}
                  </div>
                </div>
              </div>
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
