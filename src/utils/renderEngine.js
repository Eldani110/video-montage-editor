/**
 * Canvas Rendering Engine & Audio/Video Compositor for Montage Pro Studio
 * High-performance double-buffered rendering with smart seek queueing
 * to eliminate flicker and playback instability.
 */

import { drawGraphicCanvas } from './graphicEngine.js';
import { preloadWebCodecsVideoSources } from './webCodecsVideoEngine.js';
import { resolveProjectAssetsOnDisk } from './stockMediaClient.js';

// In-memory media caches
const imageCache = new Map();
const videoCache = new Map();
const exportFallbackVideoCache = new Map();

/**
 * Resolves the best Chromium-compatible video URL for an asset (matching PreviewPlayer.jsx)
 */
export function resolveEffectiveExportVideoUrl(asset) {
  if (!asset) return '';
  const assetName = asset.name || asset.fileName || (typeof asset.url === 'string' && !asset.url.startsWith('blob:') ? asset.url.split('?')[0].split('/').pop() : '') || '';
  const isMovOrSpecial = /\.(mov|qt|mkv|avi|wmv|flv|ts|m2ts)$/i.test(assetName);

  let diskPath = asset.diskPath || null;
  if (!diskPath && typeof asset.url === 'string' && asset.url.includes('path=')) {
    try {
      const u = new URL(asset.url, 'http://localhost');
      diskPath = u.searchParams.get('path') || null;
    } catch { }
  }

  const streamFallback = diskPath
    ? `/media-library/stream?path=${encodeURIComponent(diskPath)}`
    : (assetName ? `/media-library/stream?name=${encodeURIComponent(assetName)}` : null);

  const hasValidStream = !!streamFallback;
  const isPreviewRawMov = typeof asset.previewUrl === 'string' && /\.(mov|qt|mkv|avi|wmv|flv|ts|m2ts)$/i.test(asset.previewUrl.split('?')[0]);
  const isPreviewStreamEndpoint = typeof asset.previewUrl === 'string' && asset.previewUrl.startsWith('/media-library/stream');

  return (
    (isPreviewStreamEndpoint ? asset.previewUrl : null) ||
    (isMovOrSpecial && hasValidStream ? streamFallback : null) ||
    (!isPreviewRawMov ? asset.previewUrl : null) ||
    streamFallback ||
    asset.previewUrl ||
    asset.url ||
    ''
  );
}

/**
 * Gets or initializes a ready HTMLVideoElement as a fail-safe decoder when WebCodecs cannot decode an asset
 */
async function getOrLoadExportVideoElement(asset, fallbackVideosMap) {
  if (!asset || !asset.id) return null;
  const map = fallbackVideosMap || exportFallbackVideoCache;
  if (map.has(asset.id)) {
    const existing = map.get(asset.id);
    if (existing && existing.readyState >= 1) return existing;
  }

  const primarySrc = resolveEffectiveExportVideoUrl(asset);
  const secondarySrc = asset.url && asset.url !== primarySrc ? asset.url : null;
  if (!primarySrc && !secondarySrc) return null;

  const tryLoadVideo = (srcUrl) => new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      vid.removeEventListener('loadeddata', onReady);
      vid.removeEventListener('canplay', onReady);
      vid.removeEventListener('error', onErr);
      resolve(ok ? vid : null);
    };
    const onReady = () => finish(vid.videoWidth > 0);
    const onErr = () => finish(false);
    const timer = setTimeout(() => finish(vid.readyState >= 1 && vid.videoWidth > 0), 5000);

    vid.addEventListener('loadeddata', onReady, { once: true });
    vid.addEventListener('canplay', onReady, { once: true });
    vid.addEventListener('error', onErr, { once: true });
    vid.src = srcUrl;
    try { vid.load(); } catch { }
  });

  let vid = primarySrc ? await tryLoadVideo(primarySrc) : null;
  if (!vid && secondarySrc) {
    vid = await tryLoadVideo(secondarySrc);
  }
  if (vid) {
    map.set(asset.id, vid);
  }
  return vid;
}

// Dedicated offscreen canvas for atomic double-buffering (eliminates 100% of flicker)
let offscreenCanvas = null;

function getOffscreenCanvas(width, height) {
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
  }
  if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
  }
  return offscreenCanvas;
}

/**
 * Retrieves or creates cached Image element with onload redraw listener
 */
export function getCachedImage(url, onNeedRedraw = null) {
  if (!url) return null;
  if (imageCache.has(url)) {
    const img = imageCache.get(url);
    if (!img.complete && onNeedRedraw) {
      img.addEventListener('load', onNeedRedraw, { once: true });
    }
    return img;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  if (onNeedRedraw) {
    img.addEventListener('load', onNeedRedraw, { once: true });
  }
  img.src = url;
  imageCache.set(url, img);
  return img;
}

/**
 * Retrieves or creates cached HTMLVideoElement for video clips
 */
export function getCachedVideo(url, onNeedRedraw = null) {
  if (!url) return null;
  if (videoCache.has(url)) {
    const vid = videoCache.get(url);
    if (onNeedRedraw && vid.readyState < 2) {
      vid.addEventListener('loadeddata', onNeedRedraw, { once: true });
    }
    return vid;
  }

  const vid = document.createElement('video');
  vid.crossOrigin = 'anonymous';
  vid.preload = 'auto';
  vid.muted = true; // Muted for canvas frame drawing (audio handled separately)
  vid.playsInline = true;
  vid._isSeeking = false;
  vid._pendingSeekTime = null;

  if (onNeedRedraw) {
    vid.addEventListener('loadeddata', onNeedRedraw, { once: true });
  }
  vid.src = url;
  videoCache.set(url, vid);
  return vid;
}

/**
 * Smart video seek that queues seeks instead of repeatedly aborting them
 * when scrubbing backward in the timeline.
 */
function smartSeekVideo(vid, targetTime, onNeedRedraw) {
  if (!vid) return;

  // Don't seek if we are already close enough
  if (Math.abs(vid.currentTime - targetTime) < 0.04) {
    return;
  }

  // If already actively seeking, queue the newest target time
  if (vid._isSeeking) {
    vid._pendingSeekTime = targetTime;
    vid._redrawCallback = onNeedRedraw;
    return;
  }

  vid._isSeeking = true;
  vid._redrawCallback = onNeedRedraw;

  const handleSeeked = () => {
    vid.removeEventListener('seeked', handleSeeked);
    vid._isSeeking = false;

    // If another seek was requested while this one was decoding, execute it next
    if (vid._pendingSeekTime !== null && Math.abs(vid.currentTime - vid._pendingSeekTime) > 0.04) {
      const nextTime = vid._pendingSeekTime;
      vid._pendingSeekTime = null;
      smartSeekVideo(vid, nextTime, vid._redrawCallback);
    } else {
      vid._pendingSeekTime = null;
      if (vid._redrawCallback) {
        vid._redrawCallback();
      }
    }
  };

  vid.addEventListener('seeked', handleSeeked, { once: true });

  try {
    if (typeof vid.fastSeek === 'function') {
      vid.fastSeek(targetTime);
    } else {
      vid.currentTime = targetTime;
    }
  } catch (err) {
    vid._isSeeking = false;
  }
}


/**
 * Helper to identify hardware-corrupted uninitialized YUV (0,0,0) textures
 * which convert to RGB (0..45, 95..165, 0..50).
 */
export function isHardwareGreenTexture(r, g, b) {
  return r < 45 && g >= 95 && g <= 165 && b <= 50;
}

/**
 * Internal single seek executor with direct frame snapshotting and safety timeout
 */
function executeSingleSeek(video, safeTarget) {
  video._isActivelySeeking = true;

  const seekPromise = new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        video._isActivelySeeking = false;
        video._activeSeekPromise = null;
        if (timer) clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', cleanup);
        video.removeEventListener('ended', cleanup);
        resolve();
      }
    };

    const onSeeked = () => {
      // Snapshot the newly decoded frame immediately into _frameCanvas
      try {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          if (!video._frameCanvas) {
            video._frameCanvas = document.createElement('canvas');
          }
          if (video._frameCanvas.width !== video.videoWidth || video._frameCanvas.height !== video.videoHeight) {
            video._frameCanvas.width = video.videoWidth;
            video._frameCanvas.height = video.videoHeight;
          }
          const fCtx = video._frameCanvas.getContext('2d');
          if (fCtx) {
            fCtx.drawImage(video, 0, 0);
            const p = fCtx.getImageData(Math.floor(video.videoWidth / 2), Math.floor(video.videoHeight / 2), 1, 1).data;
            if (!isHardwareGreenTexture(p[0], p[1], p[2])) {
              video._hasGoodFrame = true;
            }
          }
        }
      } catch {
        video._hasGoodFrame = true;
      }
      cleanup();
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', cleanup, { once: true });
    video.addEventListener('ended', cleanup, { once: true });

    // Safety timeout: 800ms max to allow keyframe decode on high-res files without premature green fallback
    timer = setTimeout(cleanup, 800);

    try {
      video.currentTime = safeTarget;
    } catch {
      cleanup();
    }
  });

  video._activeSeekPromise = seekPromise;
  return seekPromise;
}

/**
 * Helper to safely seek a video element to a specific timestamp and await completion.
 * Executes single active seeks without building unbounded promise chains or leaking memory.
 */
export function seekVideoToTime(video, targetTime) {
  if (!video) return Promise.resolve();

  const videoDuration = Number(video.duration) || 0;
  let safeTarget = Math.max(0, Number(targetTime) || 0);
  if (videoDuration > 0.05) {
    safeTarget = Math.min(safeTarget, videoDuration - 0.005);
  }

  // If already at the target (within 1ms) and ready, no seek needed
  if (Math.abs(video.currentTime - safeTarget) < 0.001 && video.readyState >= 2 && !video.seeking) {
    return Promise.resolve();
  }

  // If an active seek is currently in flight, wait for it before starting the next
  if (video._isActivelySeeking && video._activeSeekPromise) {
    return video._activeSeekPromise.then(() => {
      if (Math.abs(video.currentTime - safeTarget) < 0.001 && video.readyState >= 2 && !video.seeking) {
        return;
      }
      return executeSingleSeek(video, safeTarget);
    });
  }

  return executeSingleSeek(video, safeTarget);
}

/**
 * Preloads all visual assets (images decoded, video elements created)
 * before starting the export loop to eliminate asynchronous loading bottlenecks.
 */
export async function preloadExportAssets(project) {
  // Preload and await all Google Fonts with safety timeout to prevent stalling export
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    } catch (e) {
      console.warn('Font loading wait warning:', e);
    }
  }

  // Ensure any stale blob: URLs or missing diskPath/previewUrl are resolved against backend disk before export
  try {
    const resolvedProject = await Promise.race([
      resolveProjectAssetsOnDisk(project),
      new Promise(resolve => setTimeout(() => resolve(project), 3000))
    ]);
    if (resolvedProject && Array.isArray(resolvedProject.assets)) {
      project.assets = resolvedProject.assets;
    }
  } catch (e) {
    console.warn('Disk asset resolution warning before export:', e);
  }

  const assets = project.assets || [];
  const images = new Map();
  const fallbackVideos = new Map();

  // 1. Preload Pure WebCodecs hardware decoders
  let webCodecsSources = null;
  try {
    webCodecsSources = await preloadWebCodecsVideoSources(project);
  } catch (err) {
    console.warn('WebCodecs video preload warning (will use HTMLVideoElement fallback):', err);
  }

  // 2. Preload only image assets actually present on the timeline
  const usedAssetIds = new Set();
  (project.tracks || [])
    .filter(t => t.type === 'video' && t.visible !== false)
    .forEach(t => {
      (t.clips || []).forEach(c => {
        if (c && c.assetId) usedAssetIds.add(c.assetId);
      });
    });

  const assetsMap = new Map(assets.map(a => [a.id, a]));
  const imageAssetsToLoad = [...usedAssetIds]
    .map(id => assetsMap.get(id))
    .filter(asset => asset && asset.type === 'image' && (asset.url || asset.diskPath));

  const loadPromises = imageAssetsToLoad.map(async (asset) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = asset.url || `/media-library/abs?path=${encodeURIComponent(asset.diskPath)}`;
    await new Promise((res) => {
      if (img.complete && img.naturalWidth > 0) return res();
      img.onload = res;
      img.onerror = res;
      setTimeout(res, 2000);
    });
    images.set(asset.id, img);
  });

  await Promise.all(loadPromises);
  return {
    images,
    fallbackVideos,
    webCodecsDecoders: webCodecsSources?.decoders || webCodecsSources?.decoderPool,
    decoderPool: webCodecsSources?.decoderPool || webCodecsSources?.decoders,
    cleanup: () => {
      try {
        if (webCodecsSources?.cleanup) {
          webCodecsSources.cleanup();
        }
      } catch { }
      try {
        for (const vid of fallbackVideos.values()) {
          if (vid) {
            vid.pause?.();
            vid.removeAttribute?.('src');
            vid.load?.();
          }
        }
        fallbackVideos.clear();
      } catch { }
    }
  };
}

/**
 * Universal media drawing for both Images and Videos
 * Accurately supports positionX/Y, scale, rotation, flipX/Y, opacity, blendMode,
 * borderRadius, and CSS filters (brightness, contrast, saturate, blur).
 */
export function drawStyledMedia(ctx, media, mw, mh, cw, ch, clip) {
  if (!mw || !mh || !cw || !ch) return;

  const fitMode = clip.fit || 'contain';
  const scale = clip.scale !== undefined ? clip.scale : 1.0;
  const posX = clip.positionX || 0;
  const posY = clip.positionY || 0;
  const rotation = clip.rotation || 0;
  const flipX = clip.flipX ? -1 : 1;
  const flipY = clip.flipY ? -1 : 1;
  const opacity = clip.opacity !== undefined ? clip.opacity : 1.0;
  const blendMode = clip.blendMode || 'normal';
  const borderRadius = clip.borderRadius || 0;

  const brightness = clip.brightness !== undefined ? clip.brightness : 1.0;
  const contrast = clip.contrast !== undefined ? clip.contrast : 1.0;
  const saturate = clip.saturate !== undefined ? clip.saturate : 1.0;
  const blur = clip.blur || 0;
  const temperature = Number(clip.temperature || 0); // -100 to 100
  const tint = Number(clip.tint || 0); // -100 to 100
  const vignette = Number(clip.vignette || 0); // 0 to 100

  const cropTop = Math.max(0, Math.min(45, Number(clip.cropTop || 0))) / 100;
  const cropBottom = Math.max(0, Math.min(45, Number(clip.cropBottom || 0))) / 100;
  const cropLeft = Math.max(0, Math.min(45, Number(clip.cropLeft || 0))) / 100;
  const cropRight = Math.max(0, Math.min(45, Number(clip.cropRight || 0))) / 100;

  ctx.save();

  // Opacity
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

  // Blend mode
  if (blendMode && blendMode !== 'normal') {
    ctx.globalCompositeOperation = blendMode;
  }

  const hueRotate = Number(clip.hueRotate || 0);
  const sepia = Number(clip.sepia || 0);
  const grayscale = Number(clip.grayscale || 0);
  const invert = Number(clip.invert || 0);
  const dropShadow = Number(clip.dropShadow || 0);

  // Filters (including Lumetri temperature & tint approximations)
  const filterParts = [];
  if (brightness !== 1.0) filterParts.push(`brightness(${brightness})`);
  if (contrast !== 1.0) filterParts.push(`contrast(${contrast})`);
  if (saturate !== 1.0) filterParts.push(`saturate(${saturate})`);
  if (sepia > 0) filterParts.push(`sepia(${sepia / 100})`);
  if (grayscale > 0) filterParts.push(`grayscale(${grayscale / 100})`);
  if (invert > 0) filterParts.push(`invert(${invert / 100})`);
  if (hueRotate !== 0) filterParts.push(`hue-rotate(${hueRotate}deg)`);
  if (temperature > 0) filterParts.push(`sepia(${(temperature / 250).toFixed(2)})`);
  if (tint !== 0 || temperature < 0) {
    const hueDeg = Math.round((tint * 0.45) + (temperature < 0 ? temperature * 0.25 : 0));
    if (hueDeg !== 0) filterParts.push(`hue-rotate(${hueDeg}deg)`);
  }
  if (blur > 0) filterParts.push(`blur(${blur}px)`);
  if (dropShadow > 0) filterParts.push(`drop-shadow(0 ${Math.round(dropShadow * 0.4)}px ${dropShadow}px rgba(0,0,0,0.85))`);
  if (filterParts.length > 0) {
    ctx.filter = filterParts.join(' ');
  }

  // Calculate base width & height according to fit mode
  const cRatio = cw / ch;
  const mRatio = mw / mh;
  let baseW, baseH;

  if (fitMode === 'contain') {
    if (mRatio > cRatio) {
      baseW = cw;
      baseH = cw / mRatio;
    } else {
      baseH = ch;
      baseW = ch * mRatio;
    }
  } else if (fitMode === 'fill') {
    baseW = cw;
    baseH = ch;
  } else {
    // cover
    if (mRatio > cRatio) {
      baseH = ch;
      baseW = ch * mRatio;
    } else {
      baseW = cw;
      baseH = cw / mRatio;
    }
  }

  // Final scaled dimensions
  const finalW = baseW * scale;
  const finalH = baseH * scale;

  // Center coordinate of media layer (proportional to canvas dimension & orientation)
  const refW = ch > cw ? 720 : 1280;
  const normFactor = cw / refW;
  const centerX = (cw / 2) + (posX * normFactor);
  const centerY = (ch / 2) + (posY * normFactor);

  ctx.translate(centerX, centerY);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  ctx.scale(flipX, flipY);

  // Crop + Border radius clipping if requested
  const hasCrop = cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0;
  if (borderRadius > 0 || hasCrop) {
    ctx.beginPath();
    const rx = -finalW / 2 + finalW * cropLeft;
    const ry = -finalH / 2 + finalH * cropTop;
    const rw = Math.max(2, finalW * (1 - cropLeft - cropRight));
    const rh = Math.max(2, finalH * (1 - cropTop - cropBottom));
    const r = Math.min(borderRadius, rw / 2, rh / 2);
    if (r > 0 && typeof ctx.roundRect === 'function') {
      ctx.roundRect(rx, ry, rw, rh, r);
    } else {
      ctx.rect(rx, ry, rw, rh);
    }
    ctx.clip();
  }

  try {
    ctx.drawImage(media, -finalW / 2, -finalH / 2, finalW, finalH);
  } catch (err) {
    // ignore drawing glitch during video frame seek
  }

  // Optional Lumetri Vignette overlay
  if (vignette > 0) {
    ctx.filter = 'none';
    const maxR = Math.hypot(finalW, finalH) * 0.55;
    const innerR = maxR * Math.max(0.15, 1 - (vignette / 115));
    const grad = ctx.createRadialGradient(0, 0, innerR, 0, 0, maxR);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, vignette / 100)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-finalW / 2, -finalH / 2, finalW, finalH);
  }

  ctx.restore();
}

/**
 * Helper to determine track stacking order rank (e.g. V1 = 1, V2 = 2, V3 = 3)
 */
function getTrackRank(t) {
  const str = `${t.name || ''} ${t.id || ''}`;
  const match = str.match(/\bv(\d+)\b/i) || str.match(/v(\d+)/i);
  if (match) return parseInt(match[1], 10);
  if (/b-roll|overlay|superposici/i.test(str)) return 2;
  return 1;
}

/**
 * Renders a single frame using double-buffering to eliminate any black flashing or flicker.
 * Designed for real-time preview and scrubbing.
 */
export function renderFrame(visibleCanvas, time, project, options = {}) {
  if (!visibleCanvas || !project) return;
  const visibleCtx = visibleCanvas.getContext('2d');
  if (!visibleCtx) return;

  const width = visibleCanvas.width || 1280;
  const height = visibleCanvas.height || 720;
  const isPlaying = options.isPlaying || false;
  const onNeedRedraw = options.onNeedRedraw || null;

  // Assets map to eliminate ReferenceError
  const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));

  // Render to offscreen canvas first (double-buffering)
  const offscreen = getOffscreenCanvas(width, height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) return;

  // Clear offscreen background
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, width, height);

  // Studio letterbox outline
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  // Sort ascending: Base layer (V1) is drawn first, overlay layers (V2, V3) are drawn on top
  const videoTracks = (project.tracks || [])
    .filter(t => t.type === 'video' && t.visible !== false)
    .sort((a, b) => getTrackRank(a) - getTrackRank(b));

  let renderedAny = false;
  let hasActiveVisualClip = false;

  for (const track of videoTracks) {
    for (const clip of (track.clips || [])) {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      // Check if playhead intersects this clip
      if (time >= clipStart && time <= clipEnd) {
        hasActiveVisualClip = true;
        const asset = assetsMap.get(clip.assetId);
        if (!asset || !asset.url) continue;

        const isVideo = asset.type === 'video';

        if (isVideo) {
          const vid = getCachedVideo(asset.url, onNeedRedraw);
          if (vid) {
            const speed = Number(clip.playbackRate || 1.0);
            const clipOffset = ((time - clipStart) * speed) + (clip.sourceStart || 0);
            if (Math.abs((vid.playbackRate || 1.0) - speed) > 0.01) {
              vid.playbackRate = speed;
            }

            if (isPlaying) {
              if (vid.paused) {
                vid.currentTime = clipOffset;
                vid.play().catch(() => { });
              } else if (Math.abs(vid.currentTime - clipOffset) > 0.25) {
                vid.currentTime = clipOffset;
              }
            } else {
              if (!vid.paused) {
                vid.pause();
              }
              smartSeekVideo(vid, clipOffset, onNeedRedraw);
            }

            if (vid.videoWidth > 0) {
              if (vid.readyState >= 2 && !vid.seeking) {
                if (!vid._frameCanvas) {
                  vid._frameCanvas = document.createElement('canvas');
                }
                if (vid._frameCanvas.width !== vid.videoWidth || vid._frameCanvas.height !== vid.videoHeight) {
                  vid._frameCanvas.width = vid.videoWidth;
                  vid._frameCanvas.height = vid.videoHeight;
                }
                const fCtx = vid._frameCanvas.getContext('2d');
                if (fCtx) {
                  fCtx.drawImage(vid, 0, 0);
                  vid._hasGoodFrame = true;
                }
              }

              const mediaSource = (vid.readyState >= 2 && !vid.seeking)
                ? vid
                : (vid._hasGoodFrame ? vid._frameCanvas : vid);

              drawStyledMedia(ctx, mediaSource, vid.videoWidth, vid.videoHeight, width, height, clip);
              renderedAny = true;
            }
          }
        } else {
          // Image clip
          const img = getCachedImage(asset.url, onNeedRedraw);
          if (img && img.complete && img.naturalWidth > 0) {
            drawStyledMedia(ctx, img, img.naturalWidth, img.naturalHeight, width, height, clip);
            renderedAny = true;
          }
        }
      }
    }
  }

  // Draw Graphic Overlays (G1 track & clips with isGraphic)
  for (const track of (project.tracks || [])) {
    if (track.visible === false) continue;
    for (const clip of (track.clips || [])) {
      if (clip.isGraphic || track.type === 'graphics' || track.type === 'graphic') {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        if (time >= clipStart && time <= clipEnd) {
          drawGraphicCanvas(ctx, clip, time, width, height);
          renderedAny = true;
          hasActiveVisualClip = true;
        }
      }
    }
  }

  // Display placeholder only if there is genuinely no clip configured on the timeline at this time
  if (!renderedAny && !hasActiveVisualClip) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '500 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sin clips en este fotograma', width / 2, height / 2);
  }

  // Atomic blit: Transfer offscreen canvas to visible canvas in 1 single call
  visibleCtx.drawImage(offscreen, 0, 0);
}

/**
 * Deterministic frame renderer for Offline Exporting.
 * Awaits video seeks sequentially to guarantee 0% black frames and exact frame synchronization.
 */
export async function renderExportFrameAsync(canvas, time, project, preloadedMedia) {
  if (!canvas || !project) return { isBlackFrame: true };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { isBlackFrame: true };

  const width = canvas.width || 1920;
  const height = canvas.height || 1080;
  const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
  const {
    images,
    fallbackVideos = new Map(),
    webCodecsDecoders,
    decoderPool
  } = preloadedMedia || { images: new Map(), fallbackVideos: new Map(), webCodecsDecoders: null, decoderPool: null };
  const pool = decoderPool || webCodecsDecoders;

  const videoTracks = (project.tracks || [])
    .filter(t => t.type === 'video' && t.visible !== false)
    .sort((a, b) => getTrackRank(a) - getTrackRank(b));

  // STEP 1: Quick evaluation - Which visual clips actually have real media content right now?
  const activeMediaClips = [];
  for (const track of videoTracks) {
    for (const clip of (track.clips || [])) {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      if (time >= clipStart && time < clipEnd) {
        if (clip.isGraphic) {
          activeMediaClips.push({ type: 'graphic', clip, track });
          continue;
        }
        const asset = assetsMap.get(clip.assetId);
        if (!asset) continue;

        if (asset.type === 'video') {
          const webCodecsDecoder = webCodecsDecoders ? webCodecsDecoders.get(asset.id) : null;
          const speed = Number(clip.playbackRate || 1.0);
          const rawOffset = ((time - clipStart) * speed) + (clip.sourceStart || 0);
          const maxDuration = Number(webCodecsDecoder?.duration) || Number(asset.duration) || 0;
          const safeOffset = (maxDuration > 0.1) ? Math.min(rawOffset, maxDuration - 0.005) : rawOffset;
          activeMediaClips.push({ type: 'video', clip, track, asset, webCodecsDecoder, rawOffset: safeOffset });
        } else {
          // Image clip
          activeMediaClips.push({ type: 'image', clip, track, asset });
        }
      }
    }
  }

  // Also check graphic overlays
  const activeGraphicClips = [];
  for (const track of (project.tracks || [])) {
    if (track.visible === false) continue;
    for (const clip of (track.clips || [])) {
      if (clip.isGraphic || track.type === 'graphics' || track.type === 'graphic') {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          activeGraphicClips.push(clip);
        }
      }
    }
  }

  // -----------------------------------------------------------------
  // FAST-PATH: PUNTO NEGRO / VACÍO DETECTADO
  // Si no hay clips de video, imagen ni gráficos activos en este instante:
  // Rellenar de negro puro y salir en 0.005ms sin tocar ningún decodificador.
  // -----------------------------------------------------------------
  if (activeMediaClips.length === 0 && activeGraphicClips.length === 0) {
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, width, height);
    return { isBlackFrame: true };
  }

  // Clear background
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, width, height);

  // Seek all active video clips concurrently via Pure WebCodecs hardware
  const activeVideoSeeks = [];
  for (const item of activeMediaClips) {
    if (item.type === 'video') {
      let decoder = item.webCodecsDecoder;
      if (!decoder && pool?.getDecoder) {
        try {
          decoder = await pool.getDecoder(item.asset.id);
          item.webCodecsDecoder = decoder;
        } catch (e) {
          console.warn('Decoder retrieval notice:', e);
        }
      }
      if (decoder && decoder.isReady) {
        activeVideoSeeks.push(decoder.seekToTime(item.rawOffset, item.clip.duration || 60));
      }
    }
  }

  if (activeVideoSeeks.length > 0) {
    await Promise.race([
      Promise.all(activeVideoSeeks),
      new Promise(r => setTimeout(r, 1500))
    ]);
  }

  // Fallback to deterministic HTMLVideoElement seek for any video clip where WebCodecs did not produce a frame
  const fallbackSeeks = [];
  for (const item of activeMediaClips) {
    if (item.type === 'video' && (!item.webCodecsDecoder || !item.webCodecsDecoder.hasGoodFrame)) {
      fallbackSeeks.push((async () => {
        try {
          const vid = await getOrLoadExportVideoElement(item.asset, fallbackVideos);
          if (vid && vid.videoWidth > 0) {
            await seekVideoToTime(vid, item.rawOffset);
            item.fallbackVideo = vid;
          }
        } catch (err) {
          console.warn('Fallback HTMLVideoElement seek notice:', err);
        }
      })());
    }
  }

  if (fallbackSeeks.length > 0) {
    await Promise.race([
      Promise.all(fallbackSeeks),
      new Promise(r => setTimeout(r, 1500))
    ]);
  }

  // Draw active media layers in ascending layer order
  let renderedAny = false;
  for (const item of activeMediaClips) {
    if (item.type === 'video') {
      if (item.webCodecsDecoder && item.webCodecsDecoder.hasGoodFrame) {
        const frameSource = item.webCodecsDecoder.getFrameSource();
        if (frameSource) {
          drawStyledMedia(ctx, frameSource.canvas, frameSource.width, frameSource.height, width, height, item.clip);
          renderedAny = true;
        }
      } else if (item.fallbackVideo && item.fallbackVideo.videoWidth > 0) {
        const vid = item.fallbackVideo;
        const mediaSource = (vid._hasGoodFrame && vid._frameCanvas) ? vid._frameCanvas : vid;
        drawStyledMedia(ctx, mediaSource, vid.videoWidth, vid.videoHeight, width, height, item.clip);
        renderedAny = true;
      }
    } else if (item.type === 'image') {
      let img = images ? images.get(item.asset.id) : null;
      if ((!img || !img.naturalWidth) && (item.asset.url || item.asset.diskPath)) {
        const onDemandImg = new Image();
        onDemandImg.crossOrigin = 'anonymous';
        onDemandImg.src = item.asset.url || `/media-library/abs?path=${encodeURIComponent(item.asset.diskPath)}`;
        await new Promise((res) => {
          if (onDemandImg.complete && onDemandImg.naturalWidth > 0) return res();
          onDemandImg.onload = res;
          onDemandImg.onerror = res;
          setTimeout(res, 1200);
        });
        if (onDemandImg.naturalWidth > 0) {
          img = onDemandImg;
          if (images) images.set(item.asset.id, img);
        }
      }
      if (img && img.naturalWidth > 0) {
        drawStyledMedia(ctx, img, img.naturalWidth, img.naturalHeight, width, height, item.clip);
        renderedAny = true;
      }
    }
  }

  // Draw graphic overlays
  for (const clip of activeGraphicClips) {
    drawGraphicCanvas(ctx, clip, time, width, height);
    renderedAny = true;
  }

  return { isBlackFrame: !renderedAny };
}

/**
 * Universal Multi-Track Audio Engine for Montage Pro Studio
 * Plays audio from both standalone audio files and video files seamlessly.
 */
export class AudioManager {
  constructor() {
    this.activeMedia = [];
    this.isPlaying = false;
  }

  play(time, project) {
    this.stop();
    this.isPlaying = true;

    if (!project || !project.tracks) return;

    const assetsMap = new Map((project.assets || []).map(a => [a.id, a]));
    const audioTracks = project.tracks.filter(t => t.type === 'audio' && !t.muted);

    for (const track of audioTracks) {
      for (const clip of (track.clips || [])) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        if (time < clipEnd) {
          const asset = assetsMap.get(clip.assetId);
          if (!asset || !asset.url) continue;

          // Create an audio or video media element to extract and play sound
          const media = document.createElement(asset.type === 'video' ? 'video' : 'audio');
          media.src = asset.url;
          media.preload = 'auto';
          media.playsInline = true;
          media.muted = false; // Must be unmuted to play sound!
          const vol = clip.volume !== undefined ? clip.volume : 1.0;
          media.volume = Math.max(0, Math.min(1, vol));

          if (time >= clipStart) {
            // Already inside clip duration
            const offset = (time - clipStart) + (clip.sourceStart || 0);
            media.currentTime = offset;
            const p = media.play();
            if (p) p.catch(() => { });
          } else {
            // Clip starts in future
            const delayMs = (clipStart - time) * 1000;
            const timer = setTimeout(() => {
              if (this.isPlaying) {
                media.currentTime = clip.sourceStart || 0;
                const p = media.play();
                if (p) p.catch(() => { });
              }
            }, delayMs);
            media._scheduleTimer = timer;
          }

          this.activeMedia.push(media);
        }
      }
    }
  }

  stop() {
    this.isPlaying = false;
    for (const media of this.activeMedia) {
      if (media._scheduleTimer) {
        clearTimeout(media._scheduleTimer);
      }
      try {
        media.pause();
        media.src = '';
      } catch {
        // ignore
      }
    }
    this.activeMedia = [];

    // Also pause any playing video elements in canvas cache
    for (const vid of videoCache.values()) {
      if (!vid.paused) {
        vid.pause();
      }
    }
  }
}
