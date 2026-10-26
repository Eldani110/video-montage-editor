import React, { useRef, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import {
  Scissors,
  Trash2,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Expand,
  Focus,
  ChevronUp,
  ChevronDown,
  Magnet,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Plus,
  Video,
  Music,
  Film,
  FileText,
  Sparkles,
  Undo2,
  Redo2,
  RotateCcw,
  Unlink,
  BookOpen,
  Calendar,
  GitCommit,
  TrendingUp,
  Type,
  CheckSquare,
  ArrowLeftRight,
  Download,
  MousePointer2,
  Sliders,
  SlidersHorizontal,
  Subtitles,
  X
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';
import { addAssetToTimeline, getTrackGaps, rippleDeleteGap, rippleDeleteClips, splitClipAtTime } from '../utils/timelineOps';
import { createGraphicClip } from '../utils/graphicEngine';
import { AudioClipWaveform } from './AudioClipWaveform';
import {
  generateSubtitlesTrackFromTranscript,
  toggleSubtitlesTrackVisibility,
  applyGlobalSubtitleStyle,
  getDefaultSubtitleSettings,
  isSubtitleClip,
  SUBTITLE_TRACK_ID
} from '../utils/transcriptOps';
import { getCachedWaveform } from '../utils/audioWaveform';
import { saveMediaBlob } from '../utils/storage';
import { audioMixer } from '../utils/audioMixerEngine';
import {
  detectMediaType,
  normalizeMediaFile,
  extractVideoMetadata,
  uploadMediaAsset
} from '../utils/mediaTypeUtils';
import { MediaAdaptModal } from './MediaAdaptModal';

export const MIN_TIMELINE_ZOOM = 0.5; // pixels per second (enables viewing >1 hour of timeline on screen)
export const MAX_TIMELINE_ZOOM = 1000; // pixels per second (sub-frame micro precision)

// Logarithmic conversion for zoom slider [0, 100] <-> [MIN_TIMELINE_ZOOM, MAX_TIMELINE_ZOOM]
export const zoomToSlider = (z) => {
  const safeZ = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, z || 60));
  return Math.round((Math.log(safeZ / MIN_TIMELINE_ZOOM) / Math.log(MAX_TIMELINE_ZOOM / MIN_TIMELINE_ZOOM)) * 100);
};

export const sliderToZoom = (v) => {
  const ratio = Math.max(0, Math.min(100, v)) / 100;
  const z = MIN_TIMELINE_ZOOM * Math.pow(MAX_TIMELINE_ZOOM / MIN_TIMELINE_ZOOM, ratio);
  return z < 10 ? Number(z.toFixed(1)) : Math.round(z);
};

export const getZoomLabel = (z) => {
  const pct = Math.round((z / 60) * 100);
  return `${pct}%`;
};

export const getZoomTooltip = (z) => {
  const pct = Math.round((z / 60) * 100);
  if (z <= 1) {
    return `Zoom Panorámico (${pct}%) • ~1 hora visible • (Ctrl + Scroll)`;
  } else if (z < 10) {
    return `Zoom General (${pct}%) • ~10-20 min visibles • (Ctrl + Scroll)`;
  } else if (z >= 300) {
    return `Zoom Ultra-Preciso (${pct}%) • Nivel fotograma/audio • (Ctrl + Scroll)`;
  }
  return `Zoom: ${pct}% • ${z < 10 ? z : Math.round(z)} px/s • (Ctrl + Scroll para zoom fluido)`;
};

/**
 * Checks compatibility between track types for clip dragging and track transfer.
 * Audio tracks accept audio clips; video & graphics tracks accept visual clips.
 * Fixed guide and scene tracks are isolated from media.
 */
export function areTrackTypesCompatible(srcType, targetType) {
  if (!srcType || !targetType) return false;
  if (srcType === 'guide' || targetType === 'guide') return srcType === targetType;
  if (srcType === 'scene' || targetType === 'scene') return srcType === targetType;
  if (srcType === 'audio') return targetType === 'audio';
  if (srcType === 'video' || srcType === 'graphics') {
    return targetType === 'video' || targetType === 'graphics';
  }
  return false;
}

export const Timeline = React.memo(function Timeline({
  project,
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  isScrubbing: propIsScrubbing,
  setIsScrubbing: propSetIsScrubbing,
  selectedClipId,
  setSelectedClipId,
  selectedClipIds = [],
  setSelectedClipIds,
  onDeleteClips,
  onDuplicateClips,
  onUpdateProject,
  onOpenTranscribeModal,
  onOpenSceneDirector,
  onOpenGraphicDirector,
  onOpenAutoCutModal = null,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClearScenes,
  onDeleteTrack,
  onClearTimeline,
  onSeparateAudio,
  onUnlinkClip,
  isTimelineExpanded,
  onToggleMaximizeTimeline,
  onAddAsset,
  onUpdateAsset = null,
  onOpenGraphicForScene,
  onOpenSceneBroll = null,
  selectedSceneId = null,
  onSelectScene = null
}) {
  const [zoomLevel, setZoomLevel] = useState(60); // pixels per second
  const [snapping, setSnapping] = useState(true);
  const [activeTool, setActiveTool] = useState('select'); // 'select' (V) | 'razor' (C) | 'rolling' (N) | 'slip' (Y)
  const [razorHoverTime, setRazorHoverTime] = useState(null); // number | null
  const [activeSnapGuide, setActiveSnapGuide] = useState(null); // { time: number, label: string }
  const [localIsScrubbing, setLocalIsScrubbing] = useState(false);
  const isScrubbing = propIsScrubbing !== undefined ? propIsScrubbing : localIsScrubbing;
  const setIsScrubbing = propSetIsScrubbing || setLocalIsScrubbing;
  const isScrubbingRef = useRef(isScrubbing);
  const [adaptModal, setAdaptModal] = useState({
    isOpen: false,
    currentFile: '',
    currentIndex: 1,
    totalFiles: 1,
    percent: 0,
    statusText: '',
    isFinished: false
  });
  const projectRef = useRef(project);
  projectRef.current = project;
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [dropTargetTrackId, setDropTargetTrackId] = useState(null);
  const [dragState, setDragState] = useState(null); // { type: 'move' | 'trim-left' | 'trim-right', clipId, initialX, initialStartTime, initialDuration, trackId }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, clip, track, isMulti, count }
  const [showQuickTitleMenu, setShowQuickTitleMenu] = useState(false);
  const [marqueeState, setMarqueeState] = useState(null); // { active, hasMoved, startX, startY, currentX, currentY, startClientX, startClientY, isModifier, initialSelection }
  const dragStateRef = useRef(dragState);
  const initialDragProjectSnapshotRef = useRef(null);
  const marqueeStateRef = useRef(marqueeState);
  const isMarqueeDraggingRef = useRef(false);
  const lastMarqueeEndTimeRef = useRef(0);

  useEffect(() => {
    marqueeStateRef.current = marqueeState;
  }, [marqueeState]);

  const setMultiSelection = (ids) => {
    if (setSelectedClipIds) {
      setSelectedClipIds(ids);
    } else if (setSelectedClipId) {
      setSelectedClipId(ids.length > 0 ? ids[ids.length - 1] : null);
    }
  };

  const isClipSelected = (clipId) => {
    if (selectedClipIds && selectedClipIds.length > 0) {
      return selectedClipIds.includes(clipId);
    }
    return clipId === selectedClipId;
  };

  const selectedClipsList = useMemo(() => {
    if (!selectedClipIds || selectedClipIds.length === 0) return [];
    const list = [];
    const idSet = new Set(selectedClipIds);
    project.tracks?.forEach(t => {
      t.clips?.forEach(c => {
        if (idSet.has(c.id)) {
          list.push(c);
        }
      });
    });
    return list;
  }, [project.tracks, selectedClipIds]);

  const selectedClipsDuration = useMemo(() => {
    return selectedClipsList.reduce((acc, c) => acc + (c.duration || 0), 0);
  }, [selectedClipsList]);

  const rulerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const playheadLineRef = useRef(null);
  const timelineContainerRef = useRef(null);
  const dragRafRef = useRef(null);
  const scrubRafRef = useRef(null);
  const lastProjectRef = useRef(project);
  const wasPlayingRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const zoomLevelRef = useRef(zoomLevel);
  const accumulatedZoomRef = useRef(zoomLevel);
  const currentTimeRef = useRef(currentTime);
  const pendingZoomAnchorRef = useRef(null);
  const rafThrottleRef = useRef(null);
  const isZoomingRef = useRef(false);
  const zoomTimeoutRef = useRef(null);

  const playheadHeadRef = useRef(null);
  const timecodeBadgeRef = useRef(null);
  const followPlayheadRef = useRef(followPlayhead);
  const isPlayingRef = useRef(isPlaying);
  const lastActiveClipCheckRef = useRef(0);
  const lastActiveGuideIdRef = useRef(null);
  const lastActiveSceneIdRef = useRef(null);

  useEffect(() => {
    followPlayheadRef.current = followPlayhead;
  }, [followPlayhead]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // High-performance hardware tick handler: updates playhead & timecode directly in DOM with 0% React re-render overhead
  useEffect(() => {
    const handlePlaybackTick = (e) => {
      const t = e.detail?.time ?? 0;
      currentTimeRef.current = t;
      const px = t * zoomLevelRef.current;

      if (playheadHeadRef.current) {
        playheadHeadRef.current.style.left = `${px}px`;
      }
      if (playheadLineRef.current) {
        playheadLineRef.current.style.left = `calc(var(--timeline-header-width) + ${px}px)`;
        const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
        playheadLineRef.current.style.display = px < scrollLeft ? 'none' : 'block';
      }
      if (timecodeBadgeRef.current) {
        timecodeBadgeRef.current.textContent = formatTimecode(t);
      }

      // Periodically update active guide and scene clip classes directly on DOM (every ~200ms)
      const now = performance.now();
      if (now - lastActiveClipCheckRef.current >= 200) {
        lastActiveClipCheckRef.current = now;
        const currentProject = lastProjectRef.current;
        if (currentProject) {
          const guideTrack = currentProject.tracks?.find(tr => tr.type === 'guide');
          if (guideTrack) {
            const activeGuide = guideTrack.clips?.find(c => t >= c.startTime && t <= (c.startTime + c.duration));
            const activeGuideId = activeGuide?.id || null;
            if (activeGuideId !== lastActiveGuideIdRef.current) {
              lastActiveGuideIdRef.current = activeGuideId;
              document.querySelectorAll('.clip-guide.is-active-guide').forEach(el => el.classList.remove('is-active-guide'));
              if (activeGuideId) {
                const el = document.querySelector(`.clip-guide[data-clip-id="${activeGuideId}"]`);
                if (el) el.classList.add('is-active-guide');
              }
            }
          }

          const sceneTrack = currentProject.tracks?.find(tr => tr.type === 'scene');
          if (sceneTrack) {
            const activeScene = sceneTrack.clips?.find(c => t >= c.startTime && t <= (c.startTime + c.duration));
            const activeSceneId = activeScene?.id || null;
            if (activeSceneId !== lastActiveSceneIdRef.current) {
              lastActiveSceneIdRef.current = activeSceneId;
              document.querySelectorAll('.clip-scene.is-active-scene').forEach(el => el.classList.remove('is-active-scene'));
              if (activeSceneId) {
                const el = document.querySelector(`.clip-scene[data-clip-id="${activeSceneId}"]`);
                if (el) el.classList.add('is-active-scene');
              }
            }
          }
        }
      }

      // High-performance auto-scroll (direct DOM assignment without layout animation thrashing)
      if (followPlayheadRef.current && isPlayingRef.current) {
        const el = scrollContainerRef.current;
        if (el) {
          const headerWidth = 220;
          const visibleWidth = el.clientWidth - headerWidth;
          if (visibleWidth > 50) {
            const playheadOffsetInView = px - el.scrollLeft;
            if (now - lastScrollTimeRef.current >= 150) {
              if (playheadOffsetInView > visibleWidth * 0.85) {
                lastScrollTimeRef.current = now;
                el.scrollLeft = Math.max(0, px - visibleWidth * 0.2);
              } else if (playheadOffsetInView < -20) {
                lastScrollTimeRef.current = now;
                el.scrollLeft = Math.max(0, px - visibleWidth * 0.2);
              }
            }
          }
        }
      }
    };

    window.addEventListener('montage-playback-tick', handlePlaybackTick);
    return () => {
      window.removeEventListener('montage-playback-tick', handlePlaybackTick);
    };
  }, []);

  useEffect(() => {
    lastProjectRef.current = project;
  }, [project]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
    accumulatedZoomRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
    const px = currentTime * zoomLevelRef.current;
    if (playheadHeadRef.current) {
      playheadHeadRef.current.style.left = `${px}px`;
    }
    if (playheadLineRef.current) {
      playheadLineRef.current.style.left = `calc(var(--timeline-header-width) + ${px}px)`;
      const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
      playheadLineRef.current.style.display = px < scrollLeft ? 'none' : 'block';
    }
    if (timecodeBadgeRef.current) {
      timecodeBadgeRef.current.textContent = formatTimecode(currentTime);
    }
  }, [currentTime]);

  useEffect(() => {
    isScrubbingRef.current = isScrubbing;
  }, [isScrubbing]);

  // Synchronous DOM layout anchor: runs BEFORE paint so new scrollLeft & new width align with zero jitter/clamping
  useLayoutEffect(() => {
    if (pendingZoomAnchorRef.current && scrollContainerRef.current) {
      const { anchorTime, oldZoom, newZoom, currentScrollLeft } = pendingZoomAnchorRef.current;
      const scrollEl = scrollContainerRef.current;
      const deltaZoom = newZoom - oldZoom;
      const targetScroll = Math.max(0, Math.round(currentScrollLeft + anchorTime * deltaZoom));
      scrollEl.scrollLeft = targetScroll;
      pendingZoomAnchorRef.current = null;
    }
  }, [zoomLevel]);

  // Dynamically hide playhead line if it scrolls behind the sticky track headers sidebar (x < 220px)
  const handleTimelineScroll = useCallback((e) => {
    if (!playheadLineRef.current) return;
    const scrollLeft = e.currentTarget.scrollLeft;
    const currentPlayheadPx = currentTimeRef.current * zoomLevelRef.current;
    playheadLineRef.current.style.display = currentPlayheadPx < scrollLeft ? 'none' : 'block';
  }, []);

  useEffect(() => {
    if (!scrollContainerRef.current || !playheadLineRef.current) return;
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const currentPlayheadPx = currentTime * zoomLevel;
    playheadLineRef.current.style.display = currentPlayheadPx < scrollLeft ? 'none' : 'block';
  }, [currentTime, zoomLevel]);

  // Handle Ctrl + Scroll (Wheel) to zoom in / out with instant, butter-smooth 60/120fps anchor
  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      // Intercept Ctrl or Cmd + Wheel
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        // Add performance class to body to disable pointer events & transitions
        if (!isZoomingRef.current) {
          isZoomingRef.current = true;
          document.body.classList.add('is-zooming-timeline');
        }
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(() => {
          isZoomingRef.current = false;
          document.body.classList.remove('is-zooming-timeline');
        }, 150);

        const currentZoom = zoomLevelRef.current;
        const curTime = currentTimeRef.current;
        const scrollEl = scrollContainerRef.current;
        const currentScroll = scrollEl?.scrollLeft || 0;

        // Determine anchor time under mouse cursor
        let anchorTime = curTime;
        const rulerEl = rulerRef.current;
        if (rulerEl) {
          const rulerRect = rulerEl.getBoundingClientRect();
          const cursorOffset = e.clientX - rulerRect.left;
          if (cursorOffset >= 0) {
            anchorTime = cursorOffset / currentZoom;
          }
        }

        // Clean exponential step: responsive for mouse wheel and trackpad
        let factor = Math.exp(-e.deltaY * 0.0028);
        factor = Math.max(0.72, Math.min(1.38, factor));

        let nextTarget = accumulatedZoomRef.current * factor;
        nextTarget = nextTarget < 10 ? Number(nextTarget.toFixed(1)) : Math.round(nextTarget);
        if (nextTarget === accumulatedZoomRef.current) {
          const stepMultiplier = e.deltaY < 0 ? 1.15 : 0.85;
          nextTarget = accumulatedZoomRef.current * stepMultiplier;
          nextTarget = nextTarget < 10 ? Number(nextTarget.toFixed(1)) : Math.round(nextTarget);
        }
        nextTarget = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, nextTarget));
        accumulatedZoomRef.current = nextTarget;

        pendingZoomAnchorRef.current = {
          anchorTime,
          oldZoom: currentZoom,
          newZoom: nextTarget,
          currentScrollLeft: currentScroll
        };

        // Throttle state update so at most 1 render occurs per screen refresh frame
        if (!rafThrottleRef.current) {
          rafThrottleRef.current = requestAnimationFrame(() => {
            rafThrottleRef.current = null;
            setZoomLevel(accumulatedZoomRef.current);
          });
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (rafThrottleRef.current) cancelAnimationFrame(rafThrottleRef.current);
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
      document.body.classList.remove('is-zooming-timeline');
    };
  }, []);

  const maxClipEnd = useMemo(() => {
    let max = 0;
    (project.tracks || []).forEach(t => {
      (t.clips || []).forEach(c => {
        const end = (c.startTime || 0) + (c.duration || 0);
        if (end > max) max = end;
      });
    });
    return max;
  }, [project.tracks]);

  const duration = Math.max(project.settings?.duration || 20, maxClipEnd + 10);
  const timelineWidth = Math.max(1200, duration * zoomLevel + 200);

  // Zoom to Fit (Ajustar toda la línea de tiempo a la pantalla)
  const handleZoomToFit = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    const headerWidth = 220;
    const visibleWidth = Math.max(300, el.clientWidth - headerWidth - 60);
    const contentTime = Math.max(6, maxClipEnd || duration);
    let fitZoom = visibleWidth / contentTime;
    fitZoom = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, fitZoom));
    fitZoom = fitZoom < 10 ? Number(fitZoom.toFixed(1)) : Math.round(fitZoom);

    accumulatedZoomRef.current = fitZoom;
    setZoomLevel(fitZoom);
    el.scrollTo({ left: 0, behavior: 'smooth' });
  }, [duration, maxClipEnd]);

  // Global Keyboard Shortcuts for Timeline Zoom
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
        return;
      }

      // Shift + Z or Backslash (\) -> Zoom to Fit
      if ((e.shiftKey && (e.key === 'Z' || e.key === 'z')) || e.key === '\\') {
        e.preventDefault();
        handleZoomToFit();
        return;
      }

      // Premiere Pro Tool Shortcuts: V (Select), C (Razor), N (Rolling), Y (Slip)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'v' || e.key === 'V') {
          setActiveTool('select');
          setRazorHoverTime(null);
          return;
        }
        if (e.key === 'c' || e.key === 'C') {
          setActiveTool(prev => prev === 'razor' ? 'select' : 'razor');
          return;
        }
        if (e.key === 'n' || e.key === 'N') {
          setActiveTool(prev => prev === 'rolling' ? 'select' : 'rolling');
          setRazorHoverTime(null);
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          setActiveTool(prev => prev === 'slip' ? 'select' : 'slip');
          setRazorHoverTime(null);
          return;
        }
      }

      // Shift + Delete / Shift + Backspace -> Ripple Delete (Elimina clip y cierra hueco)
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        e.stopPropagation();
        const ids = selectedClipIds && selectedClipIds.length > 0
          ? selectedClipIds
          : (selectedClipId ? [selectedClipId] : []);
        if (ids.length > 0) {
          const updated = rippleDeleteClips(projectRef.current || project, ids);
          projectRef.current = updated;
          onUpdateProject(updated, true, true);
          setMultiSelection([]);
        }
        return;
      }

      // Plus / Equal -> Zoom In
      if (e.key === '+' || e.key === '=') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const currentZ = zoomLevelRef.current || zoomLevel;
          let nextZ = currentZ >= 100 ? Math.round(currentZ * 1.35) : (currentZ >= 10 ? Math.round(currentZ * 1.25) : Number((currentZ * 1.25).toFixed(1)));
          nextZ = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, nextZ));
          accumulatedZoomRef.current = nextZ;
          setZoomLevel(nextZ);
        }
      }

      // Minus / Dash -> Zoom Out
      if (e.key === '-' || e.key === '_') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const currentZ = zoomLevelRef.current || zoomLevel;
          let nextZ = currentZ >= 100 ? Math.round(currentZ / 1.35) : (currentZ >= 10 ? Math.round(currentZ / 1.25) : Number((currentZ / 1.25).toFixed(1)));
          nextZ = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, nextZ));
          accumulatedZoomRef.current = nextZ;
          setZoomLevel(nextZ);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomToFit, zoomLevel]);

  // Helper to find clip by ID
  const findClipAndTrack = (clipId) => {
    for (const track of project.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) return { clip, track };
    }
    return null;
  };

  const selectedClipData = selectedClipId ? findClipAndTrack(selectedClipId) : null;
  const canSeparateAudio =
    selectedClipData?.track?.type === 'video' &&
    selectedClipData?.clip?.audioSeparated === false &&
    !selectedClipData?.clip?.linkedClipId;
  const canUnlinkClip = Boolean(selectedClipData?.clip?.linkedClipId);

  // Close context menu on global click or scroll
  useEffect(() => {
    const handleCloseContextMenu = () => {
      setContextMenu(null);
    };
    window.addEventListener('click', handleCloseContextMenu);
    window.addEventListener('scroll', handleCloseContextMenu, true);
    return () => {
      window.removeEventListener('click', handleCloseContextMenu);
      window.removeEventListener('scroll', handleCloseContextMenu, true);
    };
  }, []);

  // Convert clientX to timeline seconds
  const clientXToSeconds = (clientX) => {
    if (!rulerRef.current) return 0;
    const rulerRect = rulerRef.current.getBoundingClientRect();
    const offsetX = clientX - rulerRect.left;
    const seconds = Math.max(0, Math.min(duration, offsetX / zoomLevel));
    return seconds;
  };

  // Handle Scrubbing on Ruler
  const handleRulerMouseDown = (e) => {
    e.preventDefault();
    if (isPlaying) {
      wasPlayingRef.current = true;
      if (setIsPlaying) setIsPlaying(false);
    } else {
      wasPlayingRef.current = false;
    }
    window.isTimelineScrubbing = true;
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    const time = clientXToSeconds(e.clientX);
    setCurrentTime(time);
    window.__montageCurrentTime = time;
    window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time } }));
    window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time } }));

    const onScrubMove = (moveEvt) => {
      if (!isScrubbingRef.current) return;
      const clientX = moveEvt.clientX;
      if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = requestAnimationFrame(() => {
        const t = clientXToSeconds(clientX);
        setCurrentTime(t);
        window.__montageCurrentTime = t;
        window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: t } }));
        window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: t } }));
      });
      if (scrollContainerRef.current) {
        const rect = scrollContainerRef.current.getBoundingClientRect();
        if (moveEvt.clientX > rect.right - 50) {
          scrollContainerRef.current.scrollLeft += 16;
        } else if (moveEvt.clientX < rect.left + 230) {
          scrollContainerRef.current.scrollLeft -= 16;
        }
      }
    };

    const onScrubUp = (upEvt) => {
      window.isTimelineScrubbing = false;
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      window.removeEventListener('mousemove', onScrubMove);
      window.removeEventListener('mouseup', onScrubUp);
      if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current);

      if (upEvt && upEvt.clientX !== undefined) {
        const finalTime = clientXToSeconds(upEvt.clientX);
        setCurrentTime(finalTime);
        window.__montageCurrentTime = finalTime;
        window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: finalTime } }));
        window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: finalTime } }));
      }

      if (wasPlayingRef.current) {
        wasPlayingRef.current = false;
        // Yield to allow hardware decoders (video and audio) to complete target seek before resuming
        setTimeout(() => {
          if (setIsPlaying) setIsPlaying(true);
        }, 40);
      }
    };

    window.addEventListener('mousemove', onScrubMove);
    window.addEventListener('mouseup', onScrubUp);
  };

  // Comprehensive magnetic snap calculator (CapCut / Adobe Premiere Pro style)
  const getSnapTarget = useCallback((candidateStart, clipDuration = 0, excludedClipIds = [], targetTrackId = null) => {
    if (!snapping) return { snappedStart: candidateStart, guide: null };

    const snapThresholdPx = 11;
    const snapThreshold = snapThresholdPx / zoomLevel;

    // Collect all snap points in the timeline
    const curPlayheadTime = currentTimeRef.current;
    const targets = [
      { time: 0, label: '00:00:00:00' },
      { time: curPlayheadTime, label: `Cabezal (${formatTimecode(curPlayheadTime)})` }
    ];

    const excludeSet = new Set(excludedClipIds);

    // Clips across all tracks
    (projectRef.current?.tracks || project.tracks || []).forEach(t => {
      const isSameTrack = targetTrackId && t.id === targetTrackId;
      (t.clips || []).forEach(c => {
        if (excludeSet.has(c.id)) return;
        const cStart = c.startTime;
        const cEnd = c.startTime + c.duration;
        targets.push({
          time: cStart,
          label: isSameTrack ? `Pegado a ${c.name}` : `Alineado con ${c.name}`,
          isSameTrack,
          clipId: c.id
        });
        targets.push({
          time: cEnd,
          label: isSameTrack ? `Pegado a ${c.name}` : `Alineado con fin de ${c.name}`,
          isSameTrack,
          clipId: c.id
        });
      });
    });

    let bestDiff = snapThreshold;
    let snappedStart = candidateStart;
    let guide = null;

    // A) Check candidateStart (left edge of dragged clip) snapping to any target
    for (const tgt of targets) {
      const diff = Math.abs(candidateStart - tgt.time);
      if (diff < bestDiff) {
        bestDiff = diff;
        snappedStart = tgt.time;
        guide = { time: tgt.time, label: tgt.label };
      }
    }

    // B) Check candidateStart + clipDuration (right edge of dragged clip) snapping to any target
    if (clipDuration > 0) {
      const candidateEnd = candidateStart + clipDuration;
      for (const tgt of targets) {
        const diff = Math.abs(candidateEnd - tgt.time);
        if (diff < bestDiff) {
          bestDiff = diff;
          snappedStart = Math.max(0, tgt.time - clipDuration);
          guide = { time: tgt.time, label: tgt.label };
        }
      }
    }

    return {
      snappedStart: Number(snappedStart.toFixed(2)),
      guide: bestDiff < snapThreshold ? guide : null
    };
  }, [snapping, zoomLevel, project.tracks]);

  // Clip Drag Handling (Move, Trim Left, Trim Right)
  const handleClipDrag = (clientX, clientY) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const deltaX = clientX - ds.initialX;
    const deltaY = (clientY !== undefined && ds.initialY !== undefined) ? clientY - ds.initialY : 0;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      ds.hasMoved = true;
    }

    const {
      clipId,
      type,
      initialStartTime,
      initialDuration,
      initialSourceStart,
      snapshots,
      trackId,
      assetDuration
    } = ds;
    const currentTrackId = ds.currentTrackId || trackId;

    const currentProject = projectRef.current || project;

    // Check if this clip is linked to an audio or video partner
    let draggedClip = null;
    let sourceTrack = null;
    for (const t of (currentProject.tracks || [])) {
      const c = (t.clips || []).find(x => x.id === clipId);
      if (c) { draggedClip = c; sourceTrack = t; break; }
    }
    const linkedId = draggedClip?.linkedClipId;

    const clipAsset = draggedClip ? (currentProject.assets || []).find(a => a.id === draggedClip.assetId) : null;
    const isUnconstrainedMedia = Boolean(
      draggedClip?.isGraphic ||
      clipAsset?.type === 'image' ||
      sourceTrack?.type === 'graphics' ||
      sourceTrack?.type === 'scene' ||
      sourceTrack?.type === 'guide'
    );
    const effectiveAssetDuration = isUnconstrainedMedia ? null : (assetDuration || null);

    let targetNewStart = initialStartTime;
    let targetNewDuration = initialDuration;
    let targetNewSourceStart = initialSourceStart || 0;
    let appliedDelta = 0;

    if (type === 'move') {
      const rawDeltaTime = deltaX / zoomLevel;
      const effectiveSnapshots = (snapshots && snapshots.length > 0) ? snapshots : [{
        clipId,
        trackId: ds.trackId,
        originalTrackId: ds.trackId,
        trackType: ds.sourceTrackType || sourceTrack?.type,
        initialStartTime,
        initialDuration,
        initialSourceStart: initialSourceStart || 0,
        linkedClipId: linkedId,
        isPrimary: true,
        isCompanion: false
      }];

      // 1. Calculate horizontal time delta with boundaries
      const minStartTime = Math.min(...effectiveSnapshots.map(s => s.initialStartTime));
      let effectiveDelta = Math.max(-minStartTime, rawDeltaTime);

      const primarySnap = effectiveSnapshots.find(s => s.isPrimary) || effectiveSnapshots.find(s => s.clipId === clipId) || effectiveSnapshots[0];
      const primaryStart = primarySnap ? primarySnap.initialStartTime : initialStartTime;
      const primaryDuration = primarySnap ? primarySnap.initialDuration : initialDuration;

      // 2. Vertical Target Track Resolution
      const primaryTrackType = ds.sourceTrackType || sourceTrack?.type;
      let targetTrackId = ds.currentTrackId || ds.trackId;

      if (clientY !== undefined && primaryTrackType) {
        const rows = Array.from(document.querySelectorAll('.timeline-track-row[data-track-id]'));
        let bestCandidateId = null;
        let minDistance = Infinity;

        for (const row of rows) {
          const candidateId = row.getAttribute('data-track-id');
          const candidateType = row.getAttribute('data-track-type');
          if (!areTrackTypesCompatible(primaryTrackType, candidateType)) continue;

          const candidateTrack = (currentProject.tracks || []).find(t => t.id === candidateId);
          if (!candidateTrack || candidateTrack.locked) continue;

          const rect = row.getBoundingClientRect();
          if (clientY >= rect.top && clientY <= rect.bottom) {
            bestCandidateId = candidateId;
            minDistance = 0;
            break;
          }

          const centerY = rect.top + rect.height / 2;
          const dist = Math.abs(clientY - centerY);
          if (dist < minDistance) {
            minDistance = dist;
            bestCandidateId = candidateId;
          }
        }

        if (bestCandidateId) {
          targetTrackId = bestCandidateId;
        }
      }

      if (targetTrackId !== ds.currentTrackId) {
        ds.currentTrackId = targetTrackId;
        setDragState(prev => prev ? { ...prev, trackId: targetTrackId, currentTrackId: targetTrackId } : null);
      }

      // 3. Magnetic Snapping
      let guide = null;
      if (snapping) {
        const candidatePrimaryStart = primaryStart + effectiveDelta;
        const snapRes = getSnapTarget(
          candidatePrimaryStart,
          primaryDuration,
          effectiveSnapshots.map(s => s.clipId),
          targetTrackId
        );
        if (snapRes.guide) {
          effectiveDelta = snapRes.snappedStart - primaryStart;
          guide = snapRes.guide;
        }
      }

      // 4. Gentle same-track magnetic gluing (only when within 14px of neighbor clip edges)
      const targetTrackObj = (currentProject.tracks || []).find(t => t.id === targetTrackId);
      if (targetTrackObj && targetTrackObj.type !== 'guide' && targetTrackObj.type !== 'scene') {
        const movingClipIds = new Set(effectiveSnapshots.map(s => s.clipId));
        const otherClips = (targetTrackObj.clips || []).filter(c => !movingClipIds.has(c.id));
        const snapThresholdTime = 14 / zoomLevel;
        const candidateStart = primaryStart + effectiveDelta;

        for (const obst of otherClips) {
          const obstStart = obst.startTime;
          const obstEnd = obst.startTime + obst.duration;
          if (Math.abs(candidateStart - obstEnd) <= snapThresholdTime) {
            effectiveDelta = obstEnd - primaryStart;
            if (!guide) guide = { time: obstEnd, label: `Pegado a ${obst.name}` };
            break;
          }
          if (Math.abs((candidateStart + primaryDuration) - obstStart) <= snapThresholdTime) {
            effectiveDelta = Math.max(-primaryStart, obstStart - primaryDuration - primaryStart);
            if (!guide) guide = { time: obstStart, label: `Pegado a ${obst.name}` };
            break;
          }
        }
      }

      setActiveSnapGuide(guide);

      // 5. Track destination calculation for each clip
      const compatibleTracks = (currentProject.tracks || []).filter(t =>
        areTrackTypesCompatible(primaryTrackType, t.type) && !t.locked
      );
      const sourceTrackIdx = compatibleTracks.findIndex(t => t.id === ds.sourceTrackId);
      const targetTrackIdx = compatibleTracks.findIndex(t => t.id === targetTrackId);
      const trackIndexDelta = (sourceTrackIdx >= 0 && targetTrackIdx >= 0) ? (targetTrackIdx - sourceTrackIdx) : 0;

      const destTrackMap = new Map();
      effectiveSnapshots.forEach(s => {
        if (s.isPrimary) {
          destTrackMap.set(s.clipId, targetTrackId);
        } else if (s.isCompanion && !areTrackTypesCompatible(primaryTrackType, s.trackType)) {
          // Companion clip of different media type (e.g. video companion for audio primary) stays on its track
          destTrackMap.set(s.clipId, s.originalTrackId);
        } else if (areTrackTypesCompatible(primaryTrackType, s.trackType)) {
          const origIdx = compatibleTracks.findIndex(t => t.id === s.originalTrackId);
          if (origIdx >= 0) {
            const newIdx = Math.max(0, Math.min(compatibleTracks.length - 1, origIdx + trackIndexDelta));
            destTrackMap.set(s.clipId, compatibleTracks[newIdx].id);
          } else {
            destTrackMap.set(s.clipId, s.originalTrackId);
          }
        } else {
          destTrackMap.set(s.clipId, s.originalTrackId);
        }
      });

      // 6. Build updated clip representations
      const movedClipsMap = new Map();
      effectiveSnapshots.forEach(s => {
        const destTrack = destTrackMap.get(s.clipId) || s.originalTrackId;
        const newStart = Number(Math.max(0, s.initialStartTime + effectiveDelta).toFixed(2));

        let existingClip = null;
        for (const t of (currentProject.tracks || [])) {
          const found = (t.clips || []).find(c => c.id === s.clipId);
          if (found) { existingClip = found; break; }
        }
        if (!existingClip) {
          existingClip = {
            id: s.clipId,
            startTime: newStart,
            duration: s.initialDuration,
            sourceStart: s.initialSourceStart,
            linkedClipId: s.linkedClipId
          };
        }

        movedClipsMap.set(s.clipId, {
          ...existingClip,
          startTime: newStart,
          trackId: destTrack
        });
      });

      // 7. Update all project tracks immutably
      const updatedTracks = (currentProject.tracks || []).map(t => {
        const remainingClips = (t.clips || []).filter(c => {
          const moved = movedClipsMap.get(c.id);
          if (!moved) return true;
          return moved.trackId === t.id;
        });

        const destinationClips = [];
        for (const movedClip of movedClipsMap.values()) {
          if (movedClip.trackId === t.id) {
            destinationClips.push(movedClip);
          }
        }

        const mergedClips = [...remainingClips];
        for (const destClip of destinationClips) {
          const existingIdx = mergedClips.findIndex(c => c.id === destClip.id);
          if (existingIdx >= 0) {
            mergedClips[existingIdx] = destClip;
          } else {
            mergedClips.push(destClip);
          }
        }

        mergedClips.sort((a, b) => a.startTime - b.startTime);

        return {
          ...t,
          clips: mergedClips
        };
      });

      const nextProject = { ...currentProject, tracks: updatedTracks };
      projectRef.current = nextProject;
      onUpdateProject(nextProject, false, false);
      return;
    } else if (type === 'trim-right') {
      const rawDeltaTime = deltaX / zoomLevel;
      let candidateDuration = Math.max(0.3, initialDuration + rawDeltaTime);
      let candidateEnd = initialStartTime + candidateDuration;
      let guide = null;

      // 1. Hard media file end boundary constraint (only applies to media files with genuine length like video/audio)
      if (effectiveAssetDuration && effectiveAssetDuration > 0) {
        const initialSrcStart = initialSourceStart || 0;
        const maxAllowedDuration = Math.max(0.3, effectiveAssetDuration - initialSrcStart);
        if (candidateDuration >= maxAllowedDuration) {
          candidateDuration = maxAllowedDuration;
          candidateEnd = initialStartTime + maxAllowedDuration;
          guide = { time: candidateEnd, label: `Fin de archivo (${formatTimecode(effectiveAssetDuration)})` };
        }
      }

      if (snapping) {
        const snapRes = getSnapTarget(candidateEnd, 0, linkedId ? [clipId, linkedId] : [clipId], currentTrackId);
        if (snapRes.guide) {
          let snappedDur = Math.max(0.3, snapRes.snappedStart - initialStartTime);
          if (effectiveAssetDuration && effectiveAssetDuration > 0) {
            const maxAllowedDuration = Math.max(0.3, effectiveAssetDuration - (initialSourceStart || 0));
            snappedDur = Math.min(snappedDur, maxAllowedDuration);
          }
          candidateDuration = snappedDur;
          guide = snapRes.guide;
        }
      }

      setActiveSnapGuide(guide);
      targetNewDuration = Number(candidateDuration.toFixed(2));
    } else if (type === 'trim-left') {
      const rawDeltaTime = deltaX / zoomLevel;
      const initialSrcStart = initialSourceStart || 0;
      let candidateStart = Math.max(0, initialStartTime + rawDeltaTime);
      let guide = null;

      // 1. Media file start boundary constraint
      const isMediaFile = Boolean(effectiveAssetDuration && effectiveAssetDuration > 0);
      let minAllowedStart = 0;
      if (isMediaFile) {
        const maxExpandLeft = Math.max(0, initialSrcStart);
        minAllowedStart = Math.max(0, initialStartTime - maxExpandLeft);
        if (candidateStart <= minAllowedStart) {
          candidateStart = minAllowedStart;
          if (maxExpandLeft > 0) {
            guide = { time: minAllowedStart, label: 'Inicio de archivo (00:00:00:00)' };
          }
        }
      } else {
        if (candidateStart <= 0) {
          candidateStart = 0;
          guide = { time: 0, label: 'Inicio de línea de tiempo' };
        }
      }

      // 2. Minimum clip duration constraint (cannot shrink clip to less than 0.3s)
      const maxAllowedStart = initialStartTime + initialDuration - 0.3;
      if (candidateStart >= maxAllowedStart) {
        candidateStart = maxAllowedStart;
      }

      if (snapping) {
        const snapRes = getSnapTarget(candidateStart, 0, linkedId ? [clipId, linkedId] : [clipId], currentTrackId);
        if (snapRes.guide) {
          let snappedSt = Math.max(minAllowedStart, Math.min(maxAllowedStart, snapRes.snappedStart));
          candidateStart = snappedSt;
          guide = snapRes.guide;
        }
      }

      setActiveSnapGuide(guide);
      appliedDelta = candidateStart - initialStartTime;
      targetNewStart = Number(candidateStart.toFixed(2));
      targetNewDuration = Number(Math.max(0.3, initialDuration - appliedDelta).toFixed(2));
      targetNewSourceStart = Number(Math.max(0, initialSrcStart + appliedDelta).toFixed(2));
    } else if (type === 'slip') {
      // Premiere Pro Slip Edit (Y): shift sourceStart without moving clip on timeline
      const rawDeltaTime = deltaX / zoomLevel;
      const initialSrcStart = initialSourceStart || 0;
      const maxSrcStart = (effectiveAssetDuration && effectiveAssetDuration > initialDuration)
        ? Math.max(0, effectiveAssetDuration - initialDuration)
        : 3600;
      const nextSrc = Math.max(0, Math.min(maxSrcStart, initialSrcStart - rawDeltaTime));
      appliedDelta = nextSrc - initialSrcStart;
      targetNewSourceStart = Number(nextSrc.toFixed(2));
      setActiveSnapGuide({
        time: initialStartTime,
        label: `Slip In: ${formatTimecode(targetNewSourceStart)} → Out: ${formatTimecode(targetNewSourceStart + initialDuration)}`
      });
    } else if (type === 'rolling' && ds.leftClip && ds.rightClip) {
      // Premiere Pro Rolling Edit (N): move cut point between two adjacent clips simultaneously
      const rawDeltaTime = deltaX / zoomLevel;
      const { leftClip, rightClip } = ds;
      const initialCut = rightClip.initialStartTime;
      let minCut = leftClip.initialStartTime + 0.3;
      if (rightClip.initialSourceStart !== undefined) {
        minCut = Math.max(minCut, rightClip.initialStartTime - (rightClip.initialSourceStart || 0));
      }
      let maxCut = rightClip.initialStartTime + rightClip.initialDuration - 0.3;
      if (leftClip.assetDuration && leftClip.assetDuration > 0) {
        const maxLeftDur = Math.max(0.3, leftClip.assetDuration - (leftClip.initialSourceStart || 0));
        maxCut = Math.min(maxCut, leftClip.initialStartTime + maxLeftDur);
      }

      const candidateCut = Math.max(minCut, Math.min(maxCut, initialCut + rawDeltaTime));
      const cutDelta = candidateCut - initialCut;
      const newLeftDur = Number(Math.max(0.3, leftClip.initialDuration + cutDelta).toFixed(2));
      const newRightStart = Number(candidateCut.toFixed(2));
      const newRightDur = Number(Math.max(0.3, rightClip.initialDuration - cutDelta).toFixed(2));
      const newRightSrcStart = Number(Math.max(0, (rightClip.initialSourceStart || 0) + cutDelta).toFixed(2));

      setActiveSnapGuide({
        time: newRightStart,
        label: `Rolling Cut: ${formatTimecode(newRightStart)} (${cutDelta >= 0 ? '+' : ''}${cutDelta.toFixed(2)}s)`
      });

      const updatedRollingTracks = (currentProject.tracks || []).map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id === leftClip.id || (leftClip.linkedId && clip.id === leftClip.linkedId)) {
            return { ...clip, duration: newLeftDur };
          }
          if (clip.id === rightClip.id || (rightClip.linkedId && clip.id === rightClip.linkedId)) {
            return {
              ...clip,
              startTime: newRightStart,
              duration: newRightDur,
              sourceStart: clip.id === rightClip.id
                ? newRightSrcStart
                : Number(Math.max(0, (clip.sourceStart || 0) + cutDelta).toFixed(2))
            };
          }
          return clip;
        })
      }));

      const nextRollingProject = { ...currentProject, tracks: updatedRollingTracks };
      projectRef.current = nextRollingProject;
      onUpdateProject(nextRollingProject, false, false);
      return;
    }

    const updatedTracks = (currentProject.tracks || []).map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id === clipId || clip.id === linkedId) {
          if (type === 'trim-right') {
            return { ...clip, duration: targetNewDuration };
          } else if (type === 'trim-left') {
            const companionSrcStart = clip.id === clipId
              ? targetNewSourceStart
              : Number(Math.max(0, (clip.sourceStart || 0) + appliedDelta).toFixed(2));
            return {
              ...clip,
              startTime: targetNewStart,
              duration: targetNewDuration,
              sourceStart: companionSrcStart
            };
          } else if (type === 'slip') {
            const companionSrcStart = clip.id === clipId
              ? targetNewSourceStart
              : Number(Math.max(0, (clip.sourceStart || 0) + appliedDelta).toFixed(2));
            return {
              ...clip,
              sourceStart: companionSrcStart
            };
          }
        }
        return clip;
      })
    }));

    const nextProject = { ...currentProject, tracks: updatedTracks };
    projectRef.current = nextProject;
    onUpdateProject(nextProject, false, false);
  };

  const handleClipDragRef = useRef(handleClipDrag);
  handleClipDragRef.current = handleClipDrag;

  const isClipDragging = Boolean(dragState);

  useEffect(() => {
    // Event listener dedicated to clip dragging
    if (!isClipDragging) return;

    if (!initialDragProjectSnapshotRef.current) {
      try {
        initialDragProjectSnapshotRef.current = JSON.parse(JSON.stringify(projectRef.current || project));
      } catch (e) {
        console.warn('Failed to snapshot timeline project before drag', e);
      }
    }

    const originalUserSelect = document.body.style.userSelect;
    const originalCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    if (dragState?.type?.startsWith('trim')) {
      document.body.style.cursor = 'ew-resize';
    } else {
      document.body.style.cursor = 'grabbing';
    }

    const handleMouseMove = (e) => {
      if (dragStateRef.current) {
        if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
        const clientX = e.clientX;
        const clientY = e.clientY;
        dragRafRef.current = requestAnimationFrame(() => {
          if (handleClipDragRef.current) {
            handleClipDragRef.current(clientX, clientY);
          }
        });
      }
    };

    const handleMouseUp = () => {
      if (dragStateRef.current) {
        if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
        const ds = dragStateRef.current;
        if (!ds.hasMoved && ds.startedWithMulti) {
          setMultiSelection([ds.clipId]);
        }
        if (ds.hasMoved && initialDragProjectSnapshotRef.current) {
          const snapshot = initialDragProjectSnapshotRef.current;
          initialDragProjectSnapshotRef.current = null;
          onUpdateProject(projectRef.current || project, true, true, snapshot);
        } else {
          initialDragProjectSnapshotRef.current = null;
        }
        setDragState(null);
        dragStateRef.current = null;
        setActiveSnapGuide(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = originalUserSelect;
      document.body.style.cursor = originalCursor;
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
    };
  }, [isClipDragging, dragState?.type]);

  // Global Marquee Selection Listener (Lasso Drag on Timeline Tracks)
  useEffect(() => {
    if (!marqueeState?.active) return;

    const handleMarqueeMove = (e) => {
      const ms = marqueeStateRef.current;
      if (!ms || !ms.active) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      const dist = Math.hypot(e.clientX - ms.startClientX, e.clientY - ms.startClientY);
      const hasMoved = dist > 4;

      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;

      if (hasMoved) {
        isMarqueeDraggingRef.current = true;
      }

      setMarqueeState(prev => prev ? {
        ...prev,
        hasMoved: prev.hasMoved || hasMoved,
        currentX,
        currentY
      } : null);

      if (hasMoved || ms.hasMoved) {
        const boxLeft = Math.min(ms.startClientX, e.clientX);
        const boxRight = Math.max(ms.startClientX, e.clientX);
        const boxTop = Math.min(ms.startClientY, e.clientY);
        const boxBottom = Math.max(ms.startClientY, e.clientY);

        const clipEls = container.querySelectorAll('.timeline-clip[data-clip-id]');
        const matchedIds = [];

        clipEls.forEach(el => {
          const cRect = el.getBoundingClientRect();
          const overlaps = !(
            cRect.right < boxLeft ||
            cRect.left > boxRight ||
            cRect.bottom < boxTop ||
            cRect.top > boxBottom
          );
          if (overlaps) {
            const cid = el.getAttribute('data-clip-id');
            if (cid && !matchedIds.includes(cid)) {
              matchedIds.push(cid);
            }
          }
        });

        let newSelection;
        if (ms.isModifier) {
          newSelection = [...ms.initialSelection];
          matchedIds.forEach(id => {
            if (!newSelection.includes(id)) newSelection.push(id);
          });
        } else {
          newSelection = matchedIds;
        }

        setMultiSelection(newSelection);
      }
    };

    const handleMarqueeUp = () => {
      const ms = marqueeStateRef.current;
      if (ms && ms.active) {
        if (ms.hasMoved || isMarqueeDraggingRef.current) {
          lastMarqueeEndTimeRef.current = Date.now();
        } else {
          // Plain click on empty space without dragging: clear selection and move playhead
          if (!ms.isModifier) {
            setMultiSelection([]);
          }
          const time = clientXToSeconds(ms.startClientX);
          setCurrentTime(time);
          window.__montageCurrentTime = time;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time } }));
        }
        setMarqueeState(null);
        isMarqueeDraggingRef.current = false;
      }
    };

    window.addEventListener('mousemove', handleMarqueeMove);
    window.addEventListener('mouseup', handleMarqueeUp);
    return () => {
      window.removeEventListener('mousemove', handleMarqueeMove);
      window.removeEventListener('mouseup', handleMarqueeUp);
    };
  }, [marqueeState?.active]);

  // Auto-scroll timeline to maintain focus on playhead during playback
  useEffect(() => {
    if (!followPlayhead || !isPlaying) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const now = performance.now();
    // Throttle checks to 250ms to prevent layout thrashing on every 16ms render
    if (now - lastScrollTimeRef.current < 250) return;

    const headerWidth = 220; // sticky track headers width
    const visibleWidth = el.clientWidth - headerWidth;
    if (visibleWidth <= 50) return;

    const playheadX = currentTime * zoomLevel;
    const currentScroll = el.scrollLeft;
    const playheadOffsetInView = playheadX - currentScroll;

    // 1. Playback running: keep playhead in focus
    if (playheadOffsetInView > visibleWidth * 0.85) {
      lastScrollTimeRef.current = now;
      const targetScroll = Math.max(0, playheadX - visibleWidth * 0.2);
      el.scrollLeft = targetScroll;
    } else if (playheadOffsetInView < -20) {
      lastScrollTimeRef.current = now;
      const targetScroll = Math.max(0, playheadX - visibleWidth * 0.2);
      el.scrollLeft = targetScroll;
    }
  }, [currentTime, isPlaying, zoomLevel, followPlayhead]);

  // Reorder Tracks (Move up / down in layer order)
  const moveTrackOrder = (trackId, direction) => {
    const track = project.tracks.find(t => t.id === trackId);
    if (!track || track.type === 'guide' || track.type === 'scene') return;

    const sameTypeTracks = project.tracks.filter(t => t.type === track.type);
    const currentIdx = sameTypeTracks.findIndex(t => t.id === trackId);
    const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;

    if (targetIdx < 0 || targetIdx >= sameTypeTracks.length) return;

    const targetTrack = sameTypeTracks[targetIdx];
    const fromGlobal = project.tracks.findIndex(t => t.id === track.id);
    const toGlobal = project.tracks.findIndex(t => t.id === targetTrack.id);

    const updatedTracks = [...project.tracks];
    updatedTracks[fromGlobal] = targetTrack;
    updatedTracks[toGlobal] = track;

    onUpdateProject({ ...project, tracks: updatedTracks });
  };

  // Move clip(s) to another compatible track (e.g. from context menu or command)
  const handleMoveClipToTrack = (destTrackId) => {
    if (!destTrackId) return;
    const currentProject = projectRef.current || project;
    const destTrack = (currentProject.tracks || []).find(t => t.id === destTrackId);
    if (!destTrack || destTrack.locked) return;

    const targetClipIds = contextMenu?.isMulti
      ? (selectedClipIds || [contextMenu.clip.id])
      : [contextMenu ? contextMenu.clip.id : selectedClipId].filter(Boolean);

    if (targetClipIds.length === 0) return;

    // Find all target clips that are compatible with destination track
    const clipsToMove = [];
    (currentProject.tracks || []).forEach(t => {
      (t.clips || []).forEach(c => {
        if (targetClipIds.includes(c.id) && areTrackTypesCompatible(t.type, destTrack.type)) {
          clipsToMove.push({ ...c, trackId: destTrackId });
        }
      });
    });

    if (clipsToMove.length === 0) return;
    const moveSet = new Set(clipsToMove.map(c => c.id));

    const updatedTracks = (currentProject.tracks || []).map(t => {
      const remaining = (t.clips || []).filter(c => !moveSet.has(c.id));

      if (t.id === destTrackId) {
        const merged = [...remaining, ...clipsToMove];
        merged.sort((a, b) => a.startTime - b.startTime);
        return { ...t, clips: merged };
      }

      return { ...t, clips: remaining };
    });

    const nextProject = { ...currentProject, tracks: updatedTracks };
    projectRef.current = nextProject;
    onUpdateProject(nextProject, true, true);
  };

  // Razor / Split Tool (splits selected clip or clip under playhead/click)
  const handleSplitClip = useCallback((customClipId = null, customTime = null) => {
    const targetId = typeof customClipId === 'string' ? customClipId : selectedClipId;
    const splitTime = typeof customTime === 'number' ? customTime : currentTime;
    const { updatedProject, newClipId } = splitClipAtTime(projectRef.current || project, targetId, splitTime);
    if (newClipId) {
      projectRef.current = updatedProject;
      onUpdateProject(updatedProject, true, true);
      setMultiSelection([newClipId]);
    }
  }, [selectedClipId, currentTime, project, onUpdateProject]);

  // Delete Selected Clip(s)
  const handleDeleteClip = () => {
    if (onDeleteClips) {
      onDeleteClips();
      return;
    }
    const ids = selectedClipIds && selectedClipIds.length > 0
      ? selectedClipIds
      : (selectedClipId ? [selectedClipId] : []);
    if (ids.length === 0) return;

    const idSet = new Set(ids);
    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips
        .filter(c => !idSet.has(c.id))
        .map(c => (idSet.has(c.linkedClipId) ? { ...c, linkedClipId: null } : c))
    }));
    onUpdateProject({ ...project, tracks: updatedTracks });
    setMultiSelection([]);
  };

  // Ripple Delete Selected Clip(s) (Shift + Delete: removes clip and closes gap automatically)
  const handleRippleDeleteClip = useCallback(() => {
    const ids = selectedClipIds && selectedClipIds.length > 0
      ? selectedClipIds
      : (selectedClipId ? [selectedClipId] : []);
    if (ids.length === 0) return;
    const updated = rippleDeleteClips(projectRef.current || project, ids);
    projectRef.current = updated;
    onUpdateProject(updated, true, true);
    setMultiSelection([]);
  }, [selectedClipIds, selectedClipId, project, onUpdateProject]);

  // Delete Gap (Ripple close empty space between clips)
  const handleDeleteGap = useCallback((trackId, gapStart, gapDuration) => {
    if (!project) return;
    const updated = rippleDeleteGap(project, trackId, gapStart, gapDuration);
    if (onUpdateProject) {
      onUpdateProject(updated, true, true);
    }
  }, [project, onUpdateProject]);

  // Duplicate Selected Clip(s)
  const handleDuplicateClip = () => {
    if (onDuplicateClips) {
      onDuplicateClips();
      return;
    }
    const ids = selectedClipIds && selectedClipIds.length > 0
      ? selectedClipIds
      : (selectedClipId ? [selectedClipId] : []);
    if (ids.length === 0) return;

    const newClipsByTrack = new Map();
    const newCreatedIds = [];

    project.tracks.forEach(track => {
      const clipsToDup = track.clips.filter(c => ids.includes(c.id));
      if (clipsToDup.length > 0) {
        const maxEndInTrack = track.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
        const dupes = clipsToDup.map((c, i) => {
          const newId = 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
          newCreatedIds.push(newId);
          return {
            ...c,
            id: newId,
            startTime: Number((maxEndInTrack + 0.3 + (i * (c.duration + 0.2))).toFixed(2)),
            name: `${c.name} (Copia)`
          };
        });
        newClipsByTrack.set(track.id, dupes);
      }
    });

    const updatedTracks = project.tracks.map(t => {
      const dupes = newClipsByTrack.get(t.id);
      if (!dupes || dupes.length === 0) return t;
      return { ...t, clips: [...t.clips, ...dupes] };
    });

    onUpdateProject({ ...project, tracks: updatedTracks });
    setMultiSelection(newCreatedIds);
  };

  // Toggle Mute on Selected Audio Clip(s) (Video clips with separated audio remain strictly silent)
  const handleBatchToggleMute = () => {
    const ids = selectedClipIds && selectedClipIds.length > 0
      ? selectedClipIds
      : (selectedClipId ? [selectedClipId] : []);
    if (ids.length === 0) return;
    const idSet = new Set(ids);

    let anyAudible = false;
    project.tracks.forEach(t => {
      if (t.type !== 'audio') return;
      t.clips.forEach(c => {
        if (idSet.has(c.id) && (c.muted === false || c.muted === undefined)) {
          anyAudible = true;
        }
      });
    });

    const targetMute = anyAudible;

    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (idSet.has(c.id)) {
          if (t.type === 'video' && c.audioSeparated !== false) {
            return { ...c, muted: true, volume: 0 };
          }
          return { ...c, muted: targetMute };
        }
        return c;
      })
    }));

    onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const handleClipClick = (_clipId, e) => {
    e.stopPropagation();
    // Selection toggle is fully handled in handleClipMouseDown to prevent double-toggle bugs
  };

  const handleTrimHandleMouseDown = (side, clip, track, effectiveDuration, e) => {
    e.stopPropagation();
    setMultiSelection([clip.id]);

    // Check if Rolling Edit (N tool or Alt+Drag on trim handle) is applicable with an adjacent clip
    if (activeTool === 'rolling' || e.altKey) {
      const sortedClips = [...(track.clips || [])].sort((a, b) => a.startTime - b.startTime);
      const idx = sortedClips.findIndex(c => c.id === clip.id);
      let leftC = null;
      let rightC = null;
      if (side === 'right' && idx >= 0 && idx < sortedClips.length - 1) {
        const nextC = sortedClips[idx + 1];
        if (Math.abs((clip.startTime + clip.duration) - nextC.startTime) <= 0.15) {
          leftC = clip;
          rightC = nextC;
        }
      } else if (side === 'left' && idx > 0) {
        const prevC = sortedClips[idx - 1];
        if (Math.abs((prevC.startTime + prevC.duration) - clip.startTime) <= 0.15) {
          leftC = prevC;
          rightC = clip;
        }
      }

      if (leftC && rightC) {
        const leftAsset = (project.assets || []).find(a => a.id === leftC.assetId);
        const rightAsset = (project.assets || []).find(a => a.id === rightC.assetId);
        const leftDur = (leftAsset?.type !== 'image' && leftAsset?.duration > 0)
          ? leftAsset.duration
          : (getCachedWaveform(leftC.assetId)?.duration || null);
        const rightDur = (rightAsset?.type !== 'image' && rightAsset?.duration > 0)
          ? rightAsset.duration
          : (getCachedWaveform(rightC.assetId)?.duration || null);

        const newDrag = {
          type: 'rolling',
          clipId: clip.id,
          initialX: e.clientX,
          initialY: e.clientY,
          initialStartTime: clip.startTime,
          initialDuration: clip.duration,
          initialSourceStart: clip.sourceStart || 0,
          trackId: track.id,
          currentTrackId: track.id,
          leftClip: {
            id: leftC.id,
            linkedId: leftC.linkedClipId,
            initialStartTime: leftC.startTime,
            initialDuration: leftC.duration,
            initialSourceStart: leftC.sourceStart || 0,
            assetDuration: leftDur
          },
          rightClip: {
            id: rightC.id,
            linkedId: rightC.linkedClipId,
            initialStartTime: rightC.startTime,
            initialDuration: rightC.duration,
            initialSourceStart: rightC.sourceStart || 0,
            assetDuration: rightDur
          }
        };
        dragStateRef.current = newDrag;
        setDragState(newDrag);
        return;
      }
    }

    const newDrag = {
      type: side === 'left' ? 'trim-left' : 'trim-right',
      clipId: clip.id,
      initialX: e.clientX,
      initialY: e.clientY,
      initialStartTime: clip.startTime,
      initialDuration: clip.duration,
      initialSourceStart: clip.sourceStart || 0,
      assetDuration: effectiveDuration,
      trackId: track.id,
      currentTrackId: track.id
    };
    dragStateRef.current = newDrag;
    setDragState(newDrag);
  };

  const handleClipMouseDown = (clip, track, e) => {
    if (track.locked) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    // If Razor Tool ('C') is active, clicking on the clip splits it at the exact mouse timestamp!
    if (activeTool === 'razor') {
      const cutTime = clientXToSeconds(e.clientX);
      handleSplitClip(clip.id, cutTime);
      return;
    }

    // If Slip Tool ('Y') is active (or Alt+Drag on a video/audio clip), initiate Slip Edit!
    if ((activeTool === 'slip' || e.altKey) && (track.type === 'video' || track.type === 'audio') && !clip.isGraphic) {
      setMultiSelection([clip.id]);
      const asset = (project.assets || []).find(a => a.id === clip.assetId);
      const isImageAsset = asset?.type === 'image';
      const effectiveDuration = (!isImageAsset && asset?.duration && asset.duration > 0)
        ? asset.duration
        : (isImageAsset ? null : (getCachedWaveform(clip.assetId)?.duration || null));
      const newDrag = {
        type: 'slip',
        clipId: clip.id,
        initialX: e.clientX,
        initialY: e.clientY,
        initialStartTime: clip.startTime,
        initialDuration: clip.duration,
        initialSourceStart: clip.sourceStart || 0,
        assetDuration: effectiveDuration,
        trackId: track.id,
        currentTrackId: track.id
      };
      dragStateRef.current = newDrag;
      setDragState(newDrag);
      return;
    }

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const currentSelection = [...(selectedClipIds || [])];
    const isAlreadySelected = currentSelection.includes(clip.id);

    let nextSelection = currentSelection;

    if (isModifier) {
      if (isAlreadySelected) {
        nextSelection = currentSelection.filter(id => id !== clip.id);
      } else {
        nextSelection = [...currentSelection, clip.id];
      }
      setMultiSelection(nextSelection);
    } else {
      if (!isAlreadySelected) {
        nextSelection = [clip.id];
        setMultiSelection(nextSelection);
      }
    }

    if (track.type === 'scene' && onSelectScene) {
      onSelectScene(clip);
    }

    const activeProject = projectRef.current || project;
    const targetIds = nextSelection.includes(clip.id) ? nextSelection : [clip.id];
    const snapshots = [];
    const snapshotIds = new Set();

    (activeProject.tracks || []).forEach(t => {
      (t.clips || []).forEach(c => {
        if (targetIds.includes(c.id)) {
          snapshots.push({
            clipId: c.id,
            trackId: t.id,
            originalTrackId: t.id,
            trackType: t.type,
            initialStartTime: c.startTime,
            initialDuration: c.duration,
            initialSourceStart: c.sourceStart || 0,
            linkedClipId: c.linkedClipId,
            isPrimary: c.id === clip.id,
            isCompanion: false
          });
          snapshotIds.add(c.id);
        }
      });
    });

    // Add linked companions if not already present
    snapshots.forEach(s => {
      if (s.linkedClipId && !snapshotIds.has(s.linkedClipId)) {
        for (const t of (activeProject.tracks || [])) {
          const lc = (t.clips || []).find(x => x.id === s.linkedClipId);
          if (lc) {
            snapshots.push({
              clipId: lc.id,
              trackId: t.id,
              originalTrackId: t.id,
              trackType: t.type,
              initialStartTime: lc.startTime,
              initialDuration: lc.duration,
              initialSourceStart: lc.sourceStart || 0,
              linkedClipId: s.clipId,
              isPrimary: false,
              isCompanion: true
            });
            snapshotIds.add(lc.id);
            break;
          }
        }
      }
    });

    const newDrag = {
      type: 'move',
      clipId: clip.id,
      trackId: track.id,
      currentTrackId: track.id,
      sourceTrackId: track.id,
      sourceTrackType: track.type,
      initialX: e.clientX,
      initialY: e.clientY,
      initialStartTime: clip.startTime,
      initialDuration: clip.duration,
      initialSourceStart: clip.sourceStart || 0,
      snapshots,
      hasMoved: false,
      startedWithMulti: !isModifier && isAlreadySelected && currentSelection.length > 1
    };
    dragStateRef.current = newDrag;
    setDragState(newDrag);
  };

  const handleClipContextMenu = (clip, track, e) => {
    e.preventDefault();
    e.stopPropagation();
    let current = [...(selectedClipIds || [])];
    if (!current.includes(clip.id)) {
      current = [clip.id];
      setMultiSelection(current);
    }
    setContextMenu({
      x: Math.min(window.innerWidth - 250, e.clientX),
      y: Math.min(window.innerHeight - 300, e.clientY),
      clip,
      track,
      isMulti: current.length > 1,
      count: current.length
    });
  };

  const handleTimelineMouseDown = (e) => {
    if (e.button !== 0) return;
    if (
      e.target.closest('.timeline-clip') ||
      e.target.closest('.clip-handle') ||
      e.target.closest('.track-header-item') ||
      e.target.closest('.timeline-ruler') ||
      e.target.closest('.timeline-top-row') ||
      e.target.closest('button') ||
      e.target.closest('input')
    ) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX - rect.left + container.scrollLeft;
    const startY = e.clientY - rect.top + container.scrollTop;
    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const initialSelection = isModifier ? [...(selectedClipIds || [])] : [];

    isMarqueeDraggingRef.current = false;

    setMarqueeState({
      active: true,
      hasMoved: false,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      startClientX: e.clientX,
      startClientY: e.clientY,
      isModifier,
      initialSelection
    });
  };

  // Track Header Actions
  const toggleTrackVisibility = (trackId) => {
    const updatedTracks = project.tracks.map(t => {
      if (t.id === trackId) return { ...t, visible: t.visible === false ? true : false };
      return t;
    });
    onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const toggleTrackMute = (trackId) => {
    const updatedTracks = project.tracks.map(t => {
      if (t.id === trackId) return { ...t, muted: !t.muted };
      return t;
    });
    onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const toggleTrackLock = (trackId) => {
    const updatedTracks = project.tracks.map(t => {
      if (t.id === trackId) return { ...t, locked: !t.locked };
      return t;
    });
    onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const addTrack = (type) => {
    const isVideo = type === 'video';
    const isGraphics = type === 'graphics';
    const count = project.tracks.filter(t => t.type === type).length + 1;
    let name = isVideo ? `V${count} (Capa)` : `A${count} (Pista)`;
    if (isGraphics) name = `G${count} (Gráficos & Títulos)`;

    const newTrack = {
      id: `track-${type}-${Date.now()}`,
      name,
      type,
      visible: true,
      muted: false,
      locked: false,
      clips: []
    };

    // If graphics or video, insert at top; if audio, insert at bottom
    let updatedTracks;
    if (isGraphics || isVideo) {
      updatedTracks = [newTrack, ...project.tracks];
    } else {
      updatedTracks = [...project.tracks, newTrack];
    }

    onUpdateProject({ ...project, tracks: updatedTracks });
  };

  const handleAddQuickTitle = (type = 'doc_chapter') => {
    setShowQuickTitleMenu(false);
    let tracks = [...(project.tracks || [])];
    let gfxTrack = tracks.find(t => t.type === 'graphics' || t.name?.includes('Gráficos'));

    if (!gfxTrack) {
      gfxTrack = {
        id: `track-graphics-${Date.now()}`,
        name: 'G1 (Gráficos & Títulos)',
        type: 'graphics',
        visible: true,
        muted: false,
        locked: false,
        clips: []
      };
      tracks = [gfxTrack, ...tracks];
    }

    let defaultTitle = 'El auge del dinero digital';
    let chapterPrefix = 'Capítulo 1:';
    let statNumber = '800.000.000';
    let statText = 'de personas';
    let themeId = 'doc_classic';
    let color = '#ffffff';

    if (type === 'doc_chapter') {
      defaultTitle = 'El auge del dinero digital';
      chapterPrefix = 'Capítulo 1:';
      themeId = 'doc_classic';
      color = '#ffffff';
    } else if (type === 'doc_stat') {
      defaultTitle = '800.000.000 de personas';
      statNumber = '800.000.000';
      statText = 'de personas';
      themeId = 'doc_yellow';
      color = '#facc15';
    } else if (type === 'doc_date') {
      defaultTitle = '15 Septiembre 2008';
      themeId = 'doc_green';
      color = '#22c55e';
    } else if (type === 'doc_timeline') {
      defaultTitle = 'Cronología Histórica';
      themeId = 'doc_blue';
      color = '#0284c7';
    }

    const newClip = createGraphicClip({
      trackId: gfxTrack.id,
      graphicType: type,
      title: defaultTitle,
      chapterPrefix,
      statNumber,
      statText,
      themeId,
      color,
      startTime: currentTime,
      duration: 4.0,
      backdropGlass: false
    });

    const updatedTracks = tracks.map(t => {
      if (t.id === gfxTrack.id) {
        return {
          ...t,
          clips: [...(t.clips || []), newClip]
        };
      }
      return t;
    });

    onUpdateProject({ ...project, tracks: updatedTracks });
    setMultiSelection([newClip.id]);
  };

  // Build Ruler Marks with dynamic level-of-detail for high-FPS performance (Memoized!)
  const rulerMarks = useMemo(() => {
    const marks = [];
    const CANDIDATE_INTERVALS = [
      0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600
    ];

    // Target around 80px - 160px between major labels so timecodes never collide
    const targetPxBetweenTicks = 85;
    let interval = CANDIDATE_INTERVALS[CANDIDATE_INTERVALS.length - 1];
    for (const cand of CANDIDATE_INTERVALS) {
      if (cand * zoomLevel >= targetPxBetweenTicks) {
        interval = cand;
        break;
      }
    }

    // Safety guard: ensure total major ticks never exceed 350 for constant 60fps performance
    if (duration / interval > 350) {
      interval = Math.ceil(duration / 300);
    }

    const tickDistance = interval * zoomLevel;
    const renderSubTicks = tickDistance >= 50;
    const totalTicks = Math.floor(duration / interval);

    for (let i = 0; i <= totalTicks; i++) {
      const sec = Number((i * interval).toFixed(3));
      const left = sec * zoomLevel;
      marks.push(
        <div key={`maj_${i}`} className="ruler-major-tick" style={{ left: `${left}px` }}>
          <span className="ruler-time-label timecode">{formatTimecode(sec)}</span>
        </div>
      );

      // Minor sub-ticks only rendered if space permits
      if (renderSubTicks && i < totalTicks) {
        const subSteps = tickDistance >= 110 ? 4 : 2;
        for (let s = 1; s < subSteps; s++) {
          const subSec = Number((sec + (s * interval / subSteps)).toFixed(3));
          const subLeft = subSec * zoomLevel;
          marks.push(
            <div key={`min_${i}_${s}`} className="ruler-minor-tick" style={{ left: `${subLeft}px` }} />
          );
        }
      }
    }
    return marks;
  }, [zoomLevel, duration]);

  const playheadPositionPx = currentTime * zoomLevel;
  const assetsMap = useMemo(() => {
    return new Map((project.assets || []).map(a => [a.id, a]));
  }, [project.assets]);

  // Compute empty gaps per track (only recomputed when project.tracks change)
  const trackGapsMap = useMemo(() => {
    const map = new Map();
    if (!project?.tracks) return map;
    for (const track of project.tracks) {
      if (!track.locked && track.visible !== false && track.clips?.length > 0) {
        map.set(track.id, getTrackGaps(track));
      }
    }
    return map;
  }, [project?.tracks]);

  // Resolve target track intelligently based on requested track ID and asset type
  const resolveTargetTrack = useCallback((targetTrackId, assetType) => {
    const isAudio = assetType === 'audio';
    const isVisual = assetType === 'video' || assetType === 'image';
    const tracks = project.tracks || [];

    // 1. If targetTrackId is provided, check if it's compatible and unlocked
    if (targetTrackId) {
      const track = tracks.find(t => t.id === targetTrackId);
      if (track && !track.locked) {
        if (isAudio && track.type === 'audio') return track;
        if (isVisual && (track.type === 'video' || track.type === 'graphics')) return track;
      }
    }

    // 2. Fallback: Find first unlocked compatible track
    if (isAudio) {
      return tracks.find(t => t.type === 'audio' && !t.locked) || tracks.find(t => t.type === 'audio') || null;
    }
    if (isVisual) {
      return tracks.find(t => (t.type === 'video' || t.type === 'graphics') && !t.locked) || tracks.find(t => t.type === 'video') || null;
    }
    return tracks.find(t => t.type !== 'guide' && t.type !== 'scene' && !t.locked) || tracks[0] || null;
  }, [project.tracks]);

  // Get dropped asset from window fallback or dataTransfer
  const getDroppedAsset = useCallback((e) => {
    if (window.__draggedAsset) {
      return window.__draggedAsset;
    }
    try {
      const assetId = e.dataTransfer.getData('application/x-montage-asset-id') || e.dataTransfer.getData('text/plain');
      if (assetId) {
        const found = assetsMap.get(assetId) || (project.assets || []).find(a => String(a.id) === String(assetId));
        if (found) return found;
      }
    } catch (err) {
      console.warn('Error reading dataTransfer:', err);
    }
    return null;
  }, [assetsMap, project.assets]);

  // Handle media files dropped directly from the user's OS file system
  const handleFilesDropOnTimeline = useCallback(async (files, clientX, targetTrackId = null) => {
    const rawDropTime = clientXToSeconds(clientX);
    let currentDropTime = rawDropTime;
    let currProject = project;

    const rawFiles = Array.from(files);
    const movFiles = rawFiles.filter(f => {
      const info = detectMediaType(f);
      return info?.type === 'video' && (/\.(mov|qt)$/i.test(f.name) || f.type === 'video/quicktime');
    });

    const isAdapting = movFiles.length > 0;
    if (isAdapting) {
      setAdaptModal({
        isOpen: true,
        currentFile: movFiles[0].name,
        currentIndex: 1,
        totalFiles: movFiles.length,
        percent: 5,
        statusText: 'Iniciando adaptación de video iPhone...',
        isFinished: false
      });
    }

    let movIndex = 0;
    for (const rawFile of rawFiles) {
      const mediaInfo = detectMediaType(rawFile);
      if (!mediaInfo) continue;

      const file = normalizeMediaFile(rawFile);
      const isImage = mediaInfo.type === 'image';
      const isAudio = mediaInfo.type === 'audio';
      const isVideo = mediaInfo.type === 'video';

      const assetId = 'asset-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const objectUrl = URL.createObjectURL(file);
      try {
        saveMediaBlob(assetId, file, { name: file.name, type: mediaInfo.mime });
      } catch (err) {
        console.warn('Could not save media blob:', err);
      }

      const newAsset = {
        id: assetId,
        name: file.name,
        type: mediaInfo.type,
        url: objectUrl,
        file: file,
        duration: isAudio ? 10 : 5,
        size: file.size,
        color: isImage ? '#6366f1' : (isAudio ? '#06b6d4' : '#10b981')
      };

      if (isImage) {
        newAsset.thumbnail = objectUrl;
      } else if (isVideo) {
        const isMov = /\.(mov|qt)$/i.test(file.name) || file.type === 'video/quicktime';
        if (isMov) {
          movIndex++;
          setAdaptModal(prev => ({
            ...prev,
            currentFile: file.name,
            currentIndex: movIndex,
            percent: Math.round(((movIndex - 0.7) / movFiles.length) * 100),
            statusText: `Adaptando video ${movIndex} de ${movFiles.length} a H.264 compatible...`
          }));

          const upRes = await uploadMediaAsset(file, null, (p, text) => {
            const baseP = ((movIndex - 1) / movFiles.length) * 100;
            const filePortion = (p / 100) * (100 / movFiles.length);
            setAdaptModal(prev => ({
              ...prev,
              percent: Math.min(95, Math.round(baseP + filePortion)),
              statusText: text
            }));
          });

          if (upRes && !upRes.success && upRes.error) {
            alert(`No se pudo colocar "${file.name}" en la línea de tiempo:\n\n${upRes.error}`);
            continue;
          }

          if (upRes && upRes.success) {
            newAsset.name = upRes.name;
            newAsset.diskPath = upRes.diskPath;
            newAsset.url = upRes.url;
            newAsset.previewUrl = upRes.previewUrl;
            if (upRes.thumbnailUrl) newAsset.thumbnail = upRes.thumbnailUrl;
            if (upRes.duration) newAsset.duration = upRes.duration;
            if (upRes.width) newAsset.width = upRes.width;
            if (upRes.height) newAsset.height = upRes.height;
            if (upRes.rotation) newAsset.rotation = upRes.rotation;
            newAsset.isAdapted = true;
            newAsset.originalName = upRes.originalName;
            newAsset.originalDiskPath = upRes.originalDiskPath;
          } else {
            try {
              const meta = await extractVideoMetadata(file, objectUrl);
              newAsset.duration = meta.duration || 5;
              newAsset.width = meta.width || 1280;
              newAsset.height = meta.height || 720;
              newAsset.thumbnail = meta.thumbnail;
            } catch (_) {}
          }
        } else {
          try {
            const meta = await extractVideoMetadata(file, objectUrl);
            newAsset.duration = meta.duration || 5;
            newAsset.width = meta.width || 1280;
            newAsset.height = meta.height || 720;
            newAsset.thumbnail = meta.thumbnail;
            if (meta.previewUrl) newAsset.previewUrl = meta.previewUrl;
            if (meta.diskPath) newAsset.diskPath = meta.diskPath;
          } catch (_) {}

          uploadMediaAsset(file).then((upRes) => {
            if (upRes && upRes.success && onUpdateAsset) {
              newAsset.diskPath = upRes.diskPath;
              newAsset.previewUrl = upRes.previewUrl;
              if (upRes.thumbnailUrl) newAsset.thumbnail = upRes.thumbnailUrl;
              onUpdateAsset(newAsset);
            }
          }).catch(() => {});
        }
      }

      const assetAlreadyInList = (currProject.assets || []).some(a => a.id === newAsset.id);
      const updatedAssets = assetAlreadyInList
        ? (currProject.assets || []).map(a => a.id === newAsset.id ? { ...a, ...newAsset } : a)
        : [...(currProject.assets || []), newAsset];

      const target = resolveTargetTrack(targetTrackId, newAsset.type);
      const { updatedProject } = addAssetToTimeline(
        { ...currProject, assets: updatedAssets },
        newAsset,
        target?.id || targetTrackId,
        currentDropTime
      );

      currProject = updatedProject;
      currentDropTime += newAsset.duration;
    }

    if (isAdapting) {
      setAdaptModal(prev => ({
        ...prev,
        percent: 100,
        statusText: '¡Videos adaptados y colocados en la línea de tiempo!',
        isFinished: true
      }));
      setTimeout(() => {
        setAdaptModal(prev => ({ ...prev, isOpen: false }));
      }, 800);
    }

    onUpdateProject(currProject);
  }, [clientXToSeconds, project, resolveTargetTrack, onUpdateAsset, onUpdateProject]);

  // Real-time stereo meter DOM refs for zero-React-overhead animation on the right dock
  const meterLeftRef = useRef(null);
  const meterRightRef = useRef(null);

  useEffect(() => {
    let rafId = null;
    const updateMeters = () => {
      if (isPlayingRef.current) {
        const m = audioMixer.getMasterMeter ? audioMixer.getMasterMeter() : { rms: 0.25, peak: 0.35 };
        const basePct = Math.min(98, Math.max(4, Math.round((m.peak || 0) * 105)));
        const lPct = Math.min(98, Math.max(0, basePct + Math.round(Math.sin(performance.now() * 0.015) * 4)));
        const rPct = Math.min(98, Math.max(0, basePct + Math.round(Math.cos(performance.now() * 0.017) * 4)));
        if (meterLeftRef.current) meterLeftRef.current.style.height = `${lPct}%`;
        if (meterRightRef.current) meterRightRef.current.style.height = `${rPct}%`;
      } else {
        if (meterLeftRef.current) meterLeftRef.current.style.height = '0%';
        if (meterRightRef.current) meterRightRef.current.style.height = '0%';
      }
      rafId = requestAnimationFrame(updateMeters);
    };
    rafId = requestAnimationFrame(updateMeters);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="premiere-timeline-shell">
      {/* 1. Far-Left Vertical Adobe Premiere Pro Tool Strip */}
      <div className="premiere-tool-strip">
        <button
          type="button"
          className={`premiere-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
          title="Herramienta Selección (V)"
          onClick={() => { setActiveTool('select'); setRazorHoverTime(null); }}
        >
          <MousePointer2 size={15} />
        </button>

        <button
          type="button"
          className={`premiere-tool-btn ${activeTool === 'rolling' ? 'active' : ''}`}
          title="Herramienta Edición Rizo / Rolling Edit (N)"
          onClick={() => { setActiveTool(prev => prev === 'rolling' ? 'select' : 'rolling'); setRazorHoverTime(null); }}
        >
          <ArrowLeftRight size={15} />
        </button>

        <button
          type="button"
          className={`premiere-tool-btn ${activeTool === 'razor' ? 'active' : ''}`}
          title="Herramienta Cuchilla / Razor Tool (C)"
          onClick={() => setActiveTool(prev => prev === 'razor' ? 'select' : 'razor')}
        >
          <Scissors size={15} />
        </button>

        <button
          type="button"
          className={`premiere-tool-btn ${activeTool === 'slip' ? 'active' : ''}`}
          title="Herramienta Desplazar / Slip Tool (Y)"
          onClick={() => { setActiveTool(prev => prev === 'slip' ? 'select' : 'slip'); setRazorHoverTime(null); }}
        >
          <SlidersHorizontal size={15} />
        </button>

        <button
          type="button"
          className="premiere-tool-btn"
          title="Seleccionar todos los clips de la secuencia (Ctrl+A)"
          onClick={() => {
            const allIds = (project.tracks || []).flatMap(t => t.clips.map(c => c.id));
            setMultiSelection(allIds);
          }}
        >
          <CheckSquare size={14} />
        </button>

        <button
          type="button"
          className="premiere-tool-btn"
          title="Ajustar zoom de toda la secuencia a la ventana (Shift+Z)"
          onClick={handleZoomToFit}
        >
          <Expand size={14} />
        </button>

        <button
          type="button"
          className={`premiere-tool-btn ${showQuickTitleMenu ? 'active' : ''}`}
          title="Herramienta Texto / Añadir Título Documental (T)"
          onClick={() => handleAddQuickTitle('doc_chapter')}
        >
          <Type size={15} />
        </button>
      </div>

      {/* 2. Center Adobe Premiere Pro Sequence Timeline Panel */}
      <div className="timeline-container premiere-sequence-panel" ref={timelineContainerRef}>
        {/* Timeline Control Bar with Sequence Tab */}
        <div className="timeline-toolbar" style={{ background: '#181818', borderBottom: '1px solid #0e0e0e', height: '32px', padding: '0 8px' }}>
          <div className="timeline-toolbar-left" style={{ gap: '6px' }}>
            {/* Premiere Pro Active Sequence Tab */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: '#222222',
                borderBottom: '2px solid #2b7de9',
                color: '#ffffff',
                fontSize: '11.5px',
                fontWeight: 600,
                height: '32px'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '1px', background: '#22c55e', display: 'inline-block' }} />
              <span>{project?.name || 'Secuencia 01'}</span>
              <span style={{ color: '#787878', marginLeft: '2px' }}>≡</span>
            </div>

            <div className="toolbar-divider"></div>

            {/* Undo / Redo */}
            {onUndo && (
              <button
                className="btn-ghost icon-only"
                title="Deshacer (Ctrl+Z)"
                onClick={onUndo}
                disabled={!canUndo}
                style={{ opacity: canUndo ? 1 : 0.35 }}
              >
                <Undo2 size={15} />
              </button>
            )}

            {onRedo && (
              <button
                className="btn-ghost icon-only"
                title="Rehacer (Ctrl+Y o Ctrl+Shift+Z)"
                onClick={onRedo}
                disabled={!canRedo}
                style={{ opacity: canRedo ? 1 : 0.35 }}
              >
                <Redo2 size={15} />
              </button>
            )}

            <div className="toolbar-divider"></div>

            {/* Premiere Pro Editing Tool Palette (V / C / N / Y) */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              background: '#141414',
              border: '1px solid #2b2b2b',
              borderRadius: '4px',
              padding: '1px'
            }}>
              <button
                type="button"
                className={`btn-ghost icon-only ${activeTool === 'select' ? 'active' : 'text-dim'}`}
                title="Herramienta Selección / Mover (Tecla V)"
                onClick={() => { setActiveTool('select'); setRazorHoverTime(null); }}
                style={{
                  width: '24px',
                  height: '22px',
                  background: activeTool === 'select' ? 'rgba(43, 125, 233, 0.22)' : 'transparent',
                  color: activeTool === 'select' ? '#3898ff' : undefined
                }}
              >
                <MousePointer2 size={13} />
              </button>
              <button
                type="button"
                className={`btn-ghost icon-only ${activeTool === 'razor' ? 'active text-rose' : 'text-dim'}`}
                title="Herramienta Cuchilla: Haz clic sobre cualquier clip para cortarlo al instante (Tecla C)"
                onClick={() => setActiveTool(prev => prev === 'razor' ? 'select' : 'razor')}
                style={{
                  width: '24px',
                  height: '22px',
                  background: activeTool === 'razor' ? 'rgba(244, 63, 94, 0.25)' : 'transparent',
                  color: activeTool === 'razor' ? '#fb7185' : undefined
                }}
              >
                <Scissors size={13} />
              </button>
              <button
                type="button"
                className={`btn-ghost icon-only ${activeTool === 'rolling' ? 'active' : 'text-dim'}`}
                title="Herramienta Rolling Edit: Arrastra el borde entre dos clips contiguos para rodar el punto de corte (Tecla N o Alt+Borde)"
                onClick={() => { setActiveTool(prev => prev === 'rolling' ? 'select' : 'rolling'); setRazorHoverTime(null); }}
                style={{
                  width: '24px',
                  height: '22px',
                  background: activeTool === 'rolling' ? 'rgba(43, 125, 233, 0.22)' : 'transparent',
                  color: activeTool === 'rolling' ? '#3898ff' : undefined
                }}
              >
                <ArrowLeftRight size={13} />
              </button>
              <button
                type="button"
                className={`btn-ghost icon-only ${activeTool === 'slip' ? 'active text-amber' : 'text-dim'}`}
                title="Herramienta Slip Edit: Arrastra dentro de un clip para deslizar su tiempo interno sin moverlo en la línea de tiempo (Tecla Y o Alt+Clip)"
                onClick={() => { setActiveTool(prev => prev === 'slip' ? 'select' : 'slip'); setRazorHoverTime(null); }}
                style={{
                  width: '24px',
                  height: '22px',
                  background: activeTool === 'slip' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                  color: activeTool === 'slip' ? '#fbbf24' : undefined
                }}
              >
                <SlidersHorizontal size={13} />
              </button>
            </div>

          <div className="toolbar-divider"></div>

          {/* Action Buttons */}
          <button
            className="btn-ghost icon-only"
            title="Dividir clip en la posición del cabezal (✂️)"
            onClick={() => handleSplitClip()}
          >
            <Scissors size={16} className="text-rose" />
          </button>

          {onOpenAutoCutModal && (
            <button
              className="btn-ghost icon-only"
              title="Recortes Automáticos IA (Elimina silencios y errores en los clips seleccionados)"
              onClick={onOpenAutoCutModal}
              style={{ color: '#06b6d4' }}
            >
              <Sparkles size={16} />
            </button>
          )}

          {onSeparateAudio && (
            <button
              className={`btn-ghost icon-only ${canSeparateAudio ? 'text-emerald' : 'text-dim'}`}
              title={canSeparateAudio ? "Separar audio de este video a una pista de audio independiente (A1)" : "Separar audio a pista (selecciona un clip de video)"}
              onClick={() => selectedClipId && onSeparateAudio(selectedClipId)}
              disabled={!canSeparateAudio}
            >
              <Music size={16} />
            </button>
          )}

          {onUnlinkClip && (
            <button
              className={`btn-ghost icon-only ${canUnlinkClip ? 'text-amber' : 'text-dim'}`}
              title={canUnlinkClip ? "Desvincular video y audio para moverlos por separado" : "Desvincular clip (selecciona un clip vinculado)"}
              onClick={() => selectedClipId && onUnlinkClip(selectedClipId)}
              disabled={!canUnlinkClip}
            >
              <Unlink size={16} />
            </button>
          )}

          <button
            className={`btn-ghost icon-only ${selectedClipIds.length > 0 ? 'text-indigo active' : 'text-dim'}`}
            title="Seleccionar todos los clips (Ctrl+A)"
            onClick={() => {
              const allIds = (project.tracks || []).flatMap(t => t.clips.map(c => c.id));
              setMultiSelection(allIds);
            }}
          >
            <CheckSquare size={16} />
          </button>

          <button
            className="btn-ghost icon-only"
            title={selectedClipIds.length > 1 ? `Duplicar ${selectedClipIds.length} clips seleccionados (Ctrl+D)` : "Duplicar clip seleccionado (Ctrl+D)"}
            onClick={handleDuplicateClip}
            disabled={!selectedClipId && selectedClipIds.length === 0}
          >
            <Copy size={16} />
          </button>

          <button
            className="btn-ghost icon-only"
            title={selectedClipIds.length > 1 ? `Eliminar ${selectedClipIds.length} clips seleccionados (Supr / Backspace)` : "Eliminar clip seleccionado (Supr / Backspace)"}
            onClick={handleDeleteClip}
            disabled={!selectedClipId && selectedClipIds.length === 0}
          >
            <Trash2 size={16} className={(selectedClipId || selectedClipIds.length > 0) ? 'text-rose' : 'text-dim'} />
          </button>

          <button
            className="btn-ghost icon-only"
            title="Eliminación Rizo (Ripple Delete): Elimina el clip seleccionado y cierra el hueco automáticamente (Shift+Supr)"
            onClick={handleRippleDeleteClip}
            disabled={!selectedClipId && selectedClipIds.length === 0}
            style={{
              color: (selectedClipId || selectedClipIds.length > 0) ? '#f59e0b' : undefined
            }}
          >
            <ArrowLeftRight size={15} />
          </button>

          {onClearTimeline && (
            <button
              className="btn-ghost icon-only"
              title="Vaciar toda la línea de tiempo (Ctrl+Z para recuperar)"
              onClick={onClearTimeline}
            >
              <RotateCcw size={15} className="text-dim hover-text-rose" />
            </button>
          )}

          <div className="toolbar-divider"></div>

          <button
            className={`btn-ghost icon-only ${snapping ? 'active text-indigo' : 'text-dim'}`}
            title="Magnetismo / Ajuste automático (Snap)"
            onClick={() => setSnapping(!snapping)}
          >
            <Magnet size={16} />
          </button>
        </div>

        <div className="timeline-toolbar-right">
          {/* Quick Clear Scenes button if scenes exist */}
          {(project.scenes?.list?.length > 0 || project.tracks?.some(t => t.type === 'scene')) && (
            <button
              className="btn-ghost btn-xs text-rose"
              onClick={onClearScenes}
              title="Eliminar pista de Escenas IA y limpiar storyboard (Ctrl+Z para deshacer)"
              style={{
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                borderColor: 'rgba(244, 63, 94, 0.3)',
                background: 'rgba(244, 63, 94, 0.08)'
              }}
            >
              <Trash2 size={12} />
              Borrar Escenas
            </button>
          )}

          {/* AI Tools */}
          {onOpenGraphicDirector && (
            <button
              className="btn-secondary btn-xs"
              onClick={onOpenGraphicDirector}
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.22), rgba(236, 72, 153, 0.22))',
                borderColor: 'rgba(6, 182, 212, 0.45)',
                color: '#38bdf8'
              }}
              title="Diseñar títulos, gráficos animados e infografías con IA (Cerebro en 2 etapas)"
            >
              <Sparkles size={13} style={{ color: '#38bdf8' }} />
              Efectos IA
            </button>
          )}

          <button
            className="btn-secondary btn-xs"
            onClick={onOpenSceneDirector}
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(99, 102, 241, 0.2))',
              borderColor: 'rgba(6, 182, 212, 0.4)',
              color: '#38bdf8'
            }}
            title="Analizar guion con IA y crear escenas de montaje (Storyboard)"
          >
            <Film size={13} />
            Editor IA
          </button>

          <button
            className="btn-secondary btn-xs"
            onClick={onOpenTranscribeModal}
            style={{ background: 'rgba(139, 92, 246, 0.15)', borderColor: 'rgba(139, 92, 246, 0.35)', color: '#c084fc' }}
            title="Transcribir audio/video con IA y generar Línea Guía"
          >
            <Sparkles size={13} />
            Guion IA
          </button>

          {onOpenAutoCutModal && (
            <button
              className="btn-secondary btn-xs"
              onClick={onOpenAutoCutModal}
              style={{
                background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.22), rgba(6, 182, 212, 0.22))',
                borderColor: 'rgba(244, 63, 94, 0.45)',
                color: '#ffffff',
                fontWeight: 600
              }}
              title="Recortes Automáticos IA: Detecta y elimina silencios, respiraciones y tomas repetidas en los clips seleccionados"
            >
              <Scissors size={13} style={{ color: '#f43f5e' }} />
              Recortes IA
            </button>
          )}

          {/* Quick Insert Documentary Titles */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn-secondary btn-xs"
              onClick={() => setShowQuickTitleMenu(!showQuickTitleMenu)}
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(16, 185, 129, 0.25))',
                borderColor: 'rgba(6, 182, 212, 0.4)',
                color: '#ffffff',
                fontWeight: '600'
              }}
              title="Añadir título documental directamente sobre el cabezal (Capítulo, Cifra, Fecha, Línea de Tiempo)"
            >
              <Plus size={13} style={{ color: '#38bdf8' }} />
              <Type size={13} style={{ color: '#34d399' }} />
              + Título
            </button>

            {showQuickTitleMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '6px',
                  background: '#0a0f1d',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                  borderRadius: '10px',
                  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.8)',
                  padding: '6px',
                  zIndex: 100,
                  minWidth: '220px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ fontSize: '10px', color: '#94a3b8', padding: '4px 8px', fontWeight: '700', textTransform: 'uppercase' }}>
                  Títulos Video-Essay / Documental
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={() => handleAddQuickTitle('doc_chapter')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', justifyContent: 'flex-start', color: '#ffffff', textAlign: 'left' }}
                >
                  <BookOpen size={14} style={{ color: '#ffffff' }} />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '12px' }}>Capítulo Documental</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Capítulo 1: + Título</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={() => handleAddQuickTitle('doc_stat')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', justifyContent: 'flex-start', color: '#facc15', textAlign: 'left' }}
                >
                  <TrendingUp size={14} style={{ color: '#facc15' }} />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: '#facc15' }}>Cifra de Impacto</div>
                    <div style={{ fontSize: '10px', color: '#cbd5e1' }}>800.000.000 de personas</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={() => handleAddQuickTitle('doc_date')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', justifyContent: 'flex-start', color: '#22c55e', textAlign: 'left' }}
                >
                  <Calendar size={14} style={{ color: '#22c55e' }} />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: '#22c55e' }}>Fecha o Hito Histórico</div>
                    <div style={{ fontSize: '10px', color: '#cbd5e1' }}>15 Septiembre 2008</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={() => handleAddQuickTitle('doc_timeline')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', justifyContent: 'flex-start', color: '#38bdf8', textAlign: 'left' }}
                >
                  <GitCommit size={14} style={{ color: '#38bdf8' }} />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: '#38bdf8' }}>Línea de Tiempo</div>
                    <div style={{ fontSize: '10px', color: '#cbd5e1' }}>1975 • 1976 • 1981</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button className="btn-secondary btn-xs" onClick={() => addTrack('graphics')} title="Añadir pista para superposiciones de títulos y gráficos">
            <Plus size={13} />
            <Sparkles size={13} />
            Pista Gráficos
          </button>
          <button className="btn-secondary btn-xs" onClick={() => addTrack('video')}>
            <Plus size={13} />
            <Video size={13} />
            Pista Video
          </button>
          <button className="btn-secondary btn-xs" onClick={() => addTrack('audio')}>
            <Plus size={13} />
            <Music size={13} />
            Pista Audio
          </button>

          <div className="toolbar-divider"></div>

          {/* Follow Playhead (Mantener foco en cabezal) */}
          <button
            className={`btn-ghost icon-only ${followPlayhead ? 'active' : ''}`}
            title={followPlayhead ? "Seguimiento automático del cabezal activo (mantener foco al reproducir • Clic para centrar o alternar)" : "Activar seguimiento automático del cabezal"}
            onClick={() => {
              const next = !followPlayhead;
              setFollowPlayhead(next);
              if (scrollContainerRef.current) {
                const el = scrollContainerRef.current;
                const headerWidth = 220;
                const visibleWidth = el.clientWidth - headerWidth;
                const playheadX = currentTime * zoomLevel;
                const targetScroll = Math.max(0, playheadX - visibleWidth * 0.25);
                el.scrollTo({ left: targetScroll, behavior: 'smooth' });
              }
            }}
            style={{
              background: followPlayhead ? 'rgba(99, 102, 241, 0.16)' : undefined,
              color: followPlayhead ? '#818cf8' : undefined
            }}
          >
            <Focus size={15} />
          </button>

          {/* Zoom controls */}
          <div className="timeline-zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              className="btn-ghost icon-only"
              title="Reducir Zoom (Ctrl + Scroll abajo o tecla -)"
              onClick={() => {
                const currentZ = zoomLevelRef.current || zoomLevel;
                let nextZ = currentZ >= 100 ? Math.round(currentZ / 1.35) : (currentZ >= 10 ? Math.round(currentZ / 1.25) : Number((currentZ / 1.25).toFixed(1)));
                nextZ = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, nextZ));
                accumulatedZoomRef.current = nextZ;
                setZoomLevel(nextZ);
              }}
            >
              <ZoomOut size={15} />
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={zoomToSlider(zoomLevel)}
              onChange={(e) => {
                const nextZ = sliderToZoom(Number(e.target.value));
                accumulatedZoomRef.current = nextZ;
                setZoomLevel(nextZ);
              }}
              className="zoom-slider"
              title={getZoomTooltip(zoomLevel)}
            />

            <button
              className="btn-ghost icon-only"
              title="Aumentar Zoom (Ctrl + Scroll arriba o tecla +)"
              onClick={() => {
                const currentZ = zoomLevelRef.current || zoomLevel;
                let nextZ = currentZ >= 100 ? Math.round(currentZ * 1.35) : (currentZ >= 10 ? Math.round(currentZ * 1.25) : Number((currentZ * 1.25).toFixed(1)));
                nextZ = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, nextZ));
                accumulatedZoomRef.current = nextZ;
                setZoomLevel(nextZ);
              }}
            >
              <ZoomIn size={15} />
            </button>

            <span
              className="zoom-level-badge"
              title={`${getZoomTooltip(zoomLevel)} • Clic para ajustar todo a pantalla (Shift+Z)`}
              onClick={handleZoomToFit}
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: '600',
                color: '#94a3b8',
                padding: '2px 5px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
                userSelect: 'none',
                minWidth: '42px',
                textAlign: 'center'
              }}
            >
              {getZoomLabel(zoomLevel)}
            </span>

            <button
              className="btn-ghost icon-only"
              title="Ajustar toda la línea de tiempo a la pantalla (Shift + Z o tecla \)"
              onClick={handleZoomToFit}
            >
              <Expand size={14} />
            </button>
          </div>

          {onToggleMaximizeTimeline && (
            <>
              <div className="toolbar-divider"></div>
              <button
                className={`btn-ghost icon-only ${isTimelineExpanded ? 'active text-indigo' : ''}`}
                title={isTimelineExpanded ? "Restaurar altura normal de la línea de tiempo" : "Ampliar línea de tiempo hacia arriba"}
                onClick={onToggleMaximizeTimeline}
                style={{
                  background: isTimelineExpanded ? 'rgba(99, 102, 241, 0.15)' : undefined,
                  color: isTimelineExpanded ? '#818cf8' : undefined
                }}
              >
                {isTimelineExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Timeline Workspace (Unified 2D Scroll Container) */}
      <div
        className="timeline-workspace"
        ref={scrollContainerRef}
        onMouseDown={handleTimelineMouseDown}
        onScroll={handleTimelineScroll}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          const dragged = window.__draggedAsset;
          const target = resolveTargetTrack(null, dragged?.type);
          if (target && dropTargetTrackId !== target.id) {
            setDropTargetTrackId(target.id);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return;
          setDropTargetTrackId(null);
          setActiveSnapGuide(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropTargetTrackId(null);
          setActiveSnapGuide(null);

          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesDropOnTimeline(e.dataTransfer.files, e.clientX, null);
            return;
          }

          const asset = getDroppedAsset(e);
          if (!asset) return;

          const rowElem = document.elementFromPoint(e.clientX, e.clientY)?.closest('.timeline-track-row');
          const hoveredTrackId = rowElem?.getAttribute('data-track-id') || null;
          const compatibleTrack = resolveTargetTrack(hoveredTrackId, asset.type);
          const finalTrackId = compatibleTrack ? compatibleTrack.id : hoveredTrackId;

          const rawDropTime = clientXToSeconds(e.clientX);
          const approxDuration = asset.duration || (asset.type === 'audio' ? 10 : 5);
          const snapRes = getSnapTarget(rawDropTime, approxDuration, [], finalTrackId);
          const finalDropTime = snapRes ? snapRes.snappedStart : rawDropTime;

          const { updatedProject, selectedClipId: newSelectedId } = addAssetToTimeline(
            project,
            asset,
            finalTrackId,
            finalDropTime
          );

          onUpdateProject(updatedProject);
          if (newSelectedId) {
            setMultiSelection([newSelectedId]);
          }
          window.__draggedAsset = null;
        }}
      >
        <div
          className="timeline-scroll-content"
          style={{ width: `calc(var(--timeline-header-width) + ${timelineWidth}px)` }}
        >
          {/* Top Sticky Row (Corner Header with Premiere Blue LED Timecode + Ruler + Playhead Head) */}
          <div className="timeline-top-row">
            <div className="timeline-headers-corner" style={{ justifyContent: 'space-between', padding: '0 8px', background: '#1b1b1b' }}>
              <span
                className="premiere-led-timecode timecode"
                ref={timecodeBadgeRef}
                style={{ fontSize: '13.5px' }}
              >
                {formatTimecode(currentTime)}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className={`premiere-bin-icon-btn ${snapping ? 'active' : ''}`}
                  title="Ajuste magnético en la línea de tiempo (Snap)"
                  onClick={() => setSnapping(!snapping)}
                  style={{ width: '20px', height: '20px' }}
                >
                  <Magnet size={12} />
                </button>
                {(() => {
                  const subTrack = (project.tracks || []).find(t => t.id === SUBTITLE_TRACK_ID || t.isSubtitleTrack);
                  const hasSubTrack = Boolean(subTrack && (subTrack.clips || []).length > 0);
                  const isSubActive = Boolean(hasSubTrack && subTrack.visible !== false);
                  const hasGuide = Boolean((project.tracks || []).some(t => t.type === 'guide' && (t.clips || []).length > 0) || (project.transcript?.segments || []).length > 0);
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (onUpdateProject) {
                            const updated = toggleSubtitlesTrackVisibility(project);
                            onUpdateProject(updated);
                          }
                        }}
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '2px',
                          background: isSubActive ? '#eab308' : '#2a2a2a',
                          color: isSubActive ? '#000000' : '#bcbcbc',
                          border: isSubActive ? '1px solid #ca8a04' : '1px solid #3c3c3c',
                          cursor: 'pointer',
                          lineHeight: '1.4'
                        }}
                        title={isSubActive ? 'Subtítulos Activos en Pantalla (Clic para ocultar)' : 'Subtítulos Inactivos (Clic para activar/generar)'}
                      >
                        CC
                      </button>

                      {(hasSubTrack || hasGuide) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onUpdateProject) {
                              const updated = generateSubtitlesTrackFromTranscript(project, { enabled: true });
                              onUpdateProject(updated);
                            }
                          }}
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '2px',
                            background: '#242b3b',
                            color: '#fef08a',
                            border: '1px solid rgba(234, 179, 8, 0.45)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            lineHeight: '1.4'
                          }}
                          title="Volver a subtitular: Regenerar todos los subtítulos de la pista S1 desde el guion actual"
                        >
                          <RotateCcw size={8} />
                          <span>RE-SUB</span>
                        </button>
                      )}

                      {isSubActive && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentApply = project.subtitleSettings?.applyToAll !== false;
                            if (onUpdateProject) {
                              onUpdateProject({
                                ...project,
                                subtitleSettings: {
                                  ...getDefaultSubtitleSettings(project),
                                  ...(project.subtitleSettings || {}),
                                  applyToAll: !currentApply
                                }
                              });
                            }
                          }}
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 4px',
                            borderRadius: '2px',
                            background: project.subtitleSettings?.applyToAll !== false ? 'rgba(234, 179, 8, 0.25)' : '#242b3b',
                            color: project.subtitleSettings?.applyToAll !== false ? '#fef08a' : '#94a3b8',
                            border: project.subtitleSettings?.applyToAll !== false ? '1px solid #eab308' : '1px solid #3c3c3c',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            lineHeight: '1.4'
                          }}
                          title={project.subtitleSettings?.applyToAll !== false ? 'Sincronizar cambios a todos los subtítulos (CapCut: ACTIVO)' : 'Edición individual de subtítulos (CapCut: DESACTIVADO)'}
                        >
                          <Sparkles size={8} />
                          <span>{project.subtitleSettings?.applyToAll !== false ? 'TODOS' : 'INDIV'}</span>
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <div
              className="timeline-ruler"
              ref={rulerRef}
              style={{ width: `${timelineWidth}px` }}
              onMouseDown={handleRulerMouseDown}
            >
              {rulerMarks}

              {/* Playhead Head (Inside ruler, horizontally positioned at playheadPositionPx) */}
              <div
                ref={playheadHeadRef}
                className="playhead-head"
                style={{ left: `${playheadPositionPx}px` }}
                onMouseDown={handleRulerMouseDown}
                title="Cabezal de reproducción (Arrastra para mover)"
              >
                <div className="playhead-head-inner"></div>
              </div>
            </div>
          </div>

          {/* Track Rows List (Each track binds Header and Lane together) */}
          <div className="timeline-track-rows-list">
            {project.tracks.map((track) => {
              const hasGuide = project.tracks.some(t => t.type === 'guide');
              const isFixed = track.type === 'guide' || track.type === 'scene';
              let stickyTop = undefined;
              let stickyZIndex = undefined;
              if (track.type === 'guide') {
                stickyTop = 36;
                stickyZIndex = 82;
              } else if (track.type === 'scene') {
                stickyTop = hasGuide ? 36 + 42 : 36;
                stickyZIndex = 81;
              }

              const sameTypeTracks = !isFixed ? project.tracks.filter(t => t.type === track.type) : [];
              const idxInType = !isFixed ? sameTypeTracks.findIndex(t => t.id === track.id) : -1;
              const canMoveUp = idxInType > 0;
              const canMoveDown = idxInType >= 0 && idxInType < sameTypeTracks.length - 1;
              const isSubTrack = track.isSubtitleTrack || track.id === 'track-subtitles-1';
              const patchLabel = isSubTrack
                ? 'C1'
                : (track.type === 'graphics'
                    ? `G${idxInType + 1}`
                    : (track.type === 'video'
                        ? `V${idxInType + 1}`
                        : (track.type === 'audio' ? `A${idxInType + 1}` : null)));

              return (
                <div
                  key={track.id}
                  className={`timeline-track-row ${isFixed ? 'track-row-fixed' : 'track-row-media'} ${
                    track.type === 'guide' ? 'track-row-guide' : (track.type === 'scene' ? 'track-row-scene' : '')
                  }`}
                  data-track-id={track.id}
                  data-track-type={track.type}
                  style={isFixed ? { position: 'sticky', top: `${stickyTop}px`, zIndex: stickyZIndex } : undefined}
                >
                  {/* Left Track Header (Sticky Left) */}
                  <div
                    className={`track-header-item ${
                      track.type === 'guide'
                        ? 'is-guide'
                        : (track.type === 'scene'
                            ? 'is-scene'
                            : (track.type === 'graphics'
                                ? 'is-graphics'
                                : (track.type === 'audio' ? 'is-audio' : 'is-video')))
                    }`}
                  >
                    <div className="track-header-left">
                      {patchLabel ? (
                        <span
                          className={`premiere-patch-badge ${isSubTrack ? 'is-subtitle' : ''}`}
                          title={`Parche de origen ${patchLabel}`}
                        >
                          {patchLabel}
                        </span>
                      ) : (
                        <>
                          {track.type === 'guide' && (
                            <FileText size={14} className="track-type-icon" style={{ color: '#a855f7' }} />
                          )}
                          {track.type === 'scene' && (
                            <Film size={14} className="track-type-icon" style={{ color: '#3898ff' }} />
                          )}
                        </>
                      )}
                      <span
                        className="track-title"
                        title={track.clips?.length > 0 ? `${track.name} (Clic para seleccionar clips de esta pista)` : track.name}
                        style={{
                          opacity: track.visible === false ? 0.6 : 1,
                          cursor: track.clips?.length > 0 ? 'pointer' : 'default'
                        }}
                        onClick={() => {
                          if (track.clips && track.clips.length > 0) {
                            setMultiSelection(track.clips.map(c => c.id));
                          }
                        }}
                      >
                        {isSubTrack ? 'Subtitle' : track.name}
                      </span>
                      {isFixed && (
                        <span className="badge-fixed-track" title="Pista de referencia fija">
                          Fija
                        </span>
                      )}
                    </div>

                    <div className="track-header-controls">
                      {/* Reorder Buttons for non-fixed tracks (Rodar orden de pista) */}
                      {!isFixed && (
                        <div className="track-order-buttons">
                          <button
                            className="btn-ghost icon-only btn-micro"
                            title="Subir pista de orden (rodar hacia arriba)"
                            onClick={() => moveTrackOrder(track.id, 'up')}
                            disabled={!canMoveUp}
                            style={{ opacity: canMoveUp ? 1 : 0.25 }}
                          >
                            <ChevronUp size={11} className="text-dim hover-text-primary" />
                          </button>
                          <button
                            className="btn-ghost icon-only btn-micro"
                            title="Bajar pista de orden (rodar hacia abajo)"
                            onClick={() => moveTrackOrder(track.id, 'down')}
                            disabled={!canMoveDown}
                            style={{ opacity: canMoveDown ? 1 : 0.25 }}
                          >
                            <ChevronDown size={11} className="text-dim hover-text-primary" />
                          </button>
                        </div>
                      )}

                      {track.type !== 'audio' ? (
                        <>
                          {isSubTrack && (
                            <button
                              type="button"
                              className="btn-ghost icon-only btn-xs"
                              title="Volver a subtitular: Regenerar subtítulos de la pista S1 desde el guion"
                              onClick={() => {
                                if (onUpdateProject) {
                                  const updated = generateSubtitlesTrackFromTranscript(project, { enabled: true });
                                  onUpdateProject(updated);
                                }
                              }}
                              style={{ color: '#facc15' }}
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                          <button
                            className="btn-ghost icon-only btn-xs"
                            title={track.visible === false ? 'Mostrar pista de video (actualmente oculta, audio activo)' : 'Ocultar pista de video (el audio continúa activo)'}
                            onClick={() => toggleTrackVisibility(track.id)}
                          >
                            {track.visible === false ? (
                              <EyeOff size={13} className="text-dim" />
                            ) : (
                              <Eye size={13} className="text-secondary" />
                            )}
                          </button>
                        </>
                      ) : (
                      <>
                        <button
                          type="button"
                          className="btn-ghost icon-only btn-xs"
                          title={track.muted ? 'Activar sonido (M)' : 'Silenciar pista (M)'}
                          onClick={(e) => {
                            e.currentTarget.blur();
                            toggleTrackMute(track.id);
                          }}
                        >
                          {track.muted ? (
                            <VolumeX size={13} className="text-rose" />
                          ) : (
                            <Volume2 size={13} className="text-secondary" />
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost icon-only btn-xs"
                          title={track.solo ? 'Desactivar Solo (S)' : 'Solo (S): escuchar únicamente esta pista'}
                          onClick={(e) => {
                            e.currentTarget.blur();
                            const updatedTracks = project.tracks.map(t =>
                              t.id === track.id ? { ...t, solo: !t.solo } : t
                            );
                            onUpdateProject({ ...project, tracks: updatedTracks });
                          }}
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '0 4px',
                            borderRadius: '3px',
                            background: track.solo ? 'rgba(250, 204, 21, 0.22)' : 'transparent',
                            color: track.solo ? '#facc15' : '#64748b',
                            border: track.solo ? '1px solid rgba(250, 204, 21, 0.45)' : '1px solid transparent'
                          }}
                        >
                          S
                        </button>
                        <button
                          type="button"
                          className="btn-ghost icon-only btn-xs"
                          title={track.autoDuck ? 'Auto-Ducking activo: atenúa música al hablar la voz principal' : 'Activar Auto-Ducking en esta pista de música'}
                          onClick={(e) => {
                            e.currentTarget.blur();
                            const updatedTracks = project.tracks.map(t =>
                              t.id === track.id ? { ...t, autoDuck: !t.autoDuck } : t
                            );
                            onUpdateProject({ ...project, tracks: updatedTracks });
                          }}
                          style={{
                            fontSize: '10px',
                            padding: '0 3px',
                            borderRadius: '3px',
                            background: track.autoDuck ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
                            opacity: track.autoDuck ? 1 : 0.45
                          }}
                        >
                          🦆
                        </button>
                        {track.type === 'audio' && (
                          <div className="track-volume-control" title={`Volumen de pista: ${Math.round((track.muted ? 0 : (track.volume ?? 1)) * 100)}%`}>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={track.muted ? 0 : (track.volume ?? 1)}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                const updatedTracks = project.tracks.map(t =>
                                  t.id === track.id ? { ...t, volume: val, muted: val === 0 } : t
                                );
                                onUpdateProject({ ...project, tracks: updatedTracks });
                              }}
                              className="track-volume-mini-slider"
                            />
                          </div>
                        )}
                      </>
                    )}

                    <button
                      className="btn-ghost icon-only btn-xs"
                      title={track.locked ? 'Desbloquear pista' : 'Bloquear pista'}
                      onClick={() => toggleTrackLock(track.id)}
                    >
                      {track.locked ? (
                        <Lock size={12} className="text-amber" />
                      ) : (
                        <Unlock size={12} className="text-dim" />
                      )}
                    </button>

                    <button
                      className="btn-ghost icon-only btn-xs btn-delete-track"
                      title={
                        track.type === 'scene'
                          ? 'Eliminar pista de Escenas (Ctrl+Z para recuperar)'
                          : (track.type === 'guide'
                              ? 'Eliminar pista Guía (Ctrl+Z para recuperar)'
                              : 'Eliminar pista (Ctrl+Z para recuperar)')
                      }
                      onClick={() => {
                        if (onDeleteTrack) {
                          onDeleteTrack(track.id);
                        } else {
                          const updatedTracks = project.tracks.filter(t => t.id !== track.id);
                          onUpdateProject({ ...project, tracks: updatedTracks });
                        }
                      }}
                    >
                      <Trash2 size={12} className="text-dim hover-text-rose" />
                    </button>
                  </div>
                </div>

                {/* Right Track Lane (Scrolls with tracks) */}
                <div
                  className={`track-lane ${
                    track.type === 'guide'
                      ? 'lane-guide'
                      : (track.type === 'scene'
                          ? 'lane-scene'
                          : (track.type === 'audio' ? 'lane-audio' : 'lane-video'))
                  } ${track.locked ? 'lane-locked' : ''} ${track.visible === false ? 'lane-hidden' : ''} ${(dropTargetTrackId === track.id || (dragState?.type === 'move' && dragState?.currentTrackId === track.id && dragState?.trackId !== track.id)) ? 'lane-dragover' : ''}`}
                  style={{ width: `${timelineWidth}px` }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';

                    const dragged = window.__draggedAsset;
                    const compatibleTrack = resolveTargetTrack(track.id, dragged?.type);
                    const targetId = compatibleTrack ? compatibleTrack.id : track.id;

                    if (dropTargetTrackId !== targetId) {
                      setDropTargetTrackId(targetId);
                    }
                    const rawDropTime = clientXToSeconds(e.clientX);
                    const snapRes = getSnapTarget(rawDropTime, 0, [], targetId);
                    if (snapRes && snapRes.guide) {
                      setActiveSnapGuide(snapRes.guide);
                    } else {
                      setActiveSnapGuide(null);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    setDropTargetTrackId(null);
                    setActiveSnapGuide(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTargetTrackId(null);
                    setActiveSnapGuide(null);

                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFilesDropOnTimeline(e.dataTransfer.files, e.clientX, track.id);
                      return;
                    }

                    const asset = getDroppedAsset(e);
                    if (!asset) return;

                    const compatibleTrack = resolveTargetTrack(track.id, asset.type);
                    const finalTrackId = compatibleTrack ? compatibleTrack.id : track.id;

                    const rawDropTime = clientXToSeconds(e.clientX);
                    const approxDuration = asset.duration || (asset.type === 'audio' ? 10 : 5);
                    const snapRes = getSnapTarget(rawDropTime, approxDuration, [], finalTrackId);
                    const finalDropTime = snapRes ? snapRes.snappedStart : rawDropTime;

                    const { updatedProject, selectedClipId: newSelectedId } = addAssetToTimeline(
                      project,
                      asset,
                      finalTrackId,
                      finalDropTime
                    );

                    onUpdateProject(updatedProject);
                    if (newSelectedId) {
                      setMultiSelection([newSelectedId]);
                    }
                    window.__draggedAsset = null;
                  }}
                >
                  {track.clips.map((clip) => {
                    const isSelected = isClipSelected(clip.id);
                    const left = clip.startTime * zoomLevel;
                    const width = Math.max(2, clip.duration * zoomLevel);
                    const asset = assetsMap.get(clip.assetId);

                    if (track.type === 'guide') {
                      const isCurrent = currentTime >= clip.startTime && currentTime <= (clip.startTime + clip.duration);
                      return (
                        <div
                          key={clip.id}
                          data-clip-id={clip.id}
                          className={`timeline-clip clip-guide ${isSelected ? 'selected' : ''} ${
                            isCurrent ? 'is-active-guide' : ''
                          }`}
                          style={{
                            left: `${left}px`,
                            width: `${width}px`,
                            backgroundColor: isCurrent ? 'rgba(139, 92, 246, 0.45)' : 'rgba(139, 92, 246, 0.18)',
                            borderColor: isSelected ? '#38bdf8' : (isCurrent ? '#c084fc' : 'rgba(139, 92, 246, 0.5)')
                          }}
                          onClick={(e) => handleClipClick(clip.id, e)}
                          onContextMenu={(e) => handleClipContextMenu(clip, track, e)}
                          onMouseDown={(e) => handleClipMouseDown(clip, track, e)}
                          title={`[${formatTimecode(clip.startTime)}] ${clip.text || clip.name}`}
                        >
                          <div className="clip-content-body clip-guide-body">
                            <span className="clip-guide-text">{clip.text || clip.name}</span>
                          </div>
                        </div>
                      );
                    }

                    if (track.type === 'scene') {
                      const isCurrent = currentTime >= clip.startTime && currentTime <= (clip.startTime + clip.duration);
                      const isSceneSelected = isSelected || Boolean(
                        selectedSceneId && (
                          clip.sceneId === selectedSceneId ||
                          clip.id === selectedSceneId ||
                          (clip.sceneNumber && String(clip.sceneNumber) === String(selectedSceneId))
                        )
                      );
                      return (
                        <div
                          key={clip.id}
                          data-clip-id={clip.id}
                          className={`timeline-clip clip-scene ${isSceneSelected ? 'selected' : ''} ${
                            isCurrent ? 'is-active-scene' : ''
                          }`}
                          style={{
                            left: `${left}px`,
                            width: `${width}px`,
                            backgroundColor: isCurrent ? `${clip.color || '#06b6d4'}45` : `${clip.color || '#06b6d4'}22`,
                            borderColor: isSceneSelected ? '#38bdf8' : (isCurrent ? '#ffffff' : (clip.color || '#06b6d4'))
                          }}
                          onClick={(e) => {
                            handleClipClick(clip.id, e);
                            if (onSelectScene) {
                              onSelectScene(clip);
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (onOpenSceneBroll) {
                              onOpenSceneBroll({
                                ...clip,
                                startTime: Number(clip.startTime.toFixed(2)),
                                duration: Number(clip.duration.toFixed(2)),
                                endTime: Number((clip.startTime + clip.duration).toFixed(2))
                              });
                            }
                          }}
                          onContextMenu={(e) => handleClipContextMenu(clip, track, e)}
                          onMouseDown={(e) => {
                            handleClipMouseDown(clip, track, e);
                            if (onSelectScene) {
                              onSelectScene(clip);
                            }
                          }}
                          title={`[${formatTimecode(clip.startTime)} - ${formatTimecode(clip.startTime + clip.duration)}] ${clip.name} | ${clip.visualType === 'video' ? 'VIDEO' : 'IMAGEN'}: ${clip.visualDescription || ''}`}
                        >
                          {!track.locked && width >= 14 && (
                            <div
                              className="clip-handle clip-handle-left"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setMultiSelection([clip.id]);
                                const newDrag = {
                                  type: 'trim-left',
                                  clipId: clip.id,
                                  initialX: e.clientX,
                                  initialY: e.clientY,
                                  initialStartTime: clip.startTime,
                                  initialDuration: clip.duration,
                                  initialSourceStart: clip.sourceStart || 0,
                                  assetDuration: null,
                                  trackId: track.id,
                                  currentTrackId: track.id
                                };
                                dragStateRef.current = newDrag;
                                setDragState(newDrag);
                              }}
                            />
                          )}

                          <div className="clip-content-body clip-scene-body">
                            <span
                              className="clip-scene-tag"
                              style={{
                                background: clip.visualType === 'video' ? '#06b6d4' : '#6366f1',
                                color: '#ffffff'
                              }}
                            >
                              {clip.visualType === 'video' ? 'VID' : 'IMG'}
                            </span>
                            <span className="clip-scene-text">{clip.name}</span>
                          </div>

                          {!track.locked && width >= 14 && (
                            <div
                              className="clip-handle clip-handle-right"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setMultiSelection([clip.id]);
                                const newDrag = {
                                  type: 'trim-right',
                                  clipId: clip.id,
                                  initialX: e.clientX,
                                  initialY: e.clientY,
                                  initialStartTime: clip.startTime,
                                  initialDuration: clip.duration,
                                  initialSourceStart: clip.sourceStart || 0,
                                  assetDuration: null,
                                  trackId: track.id,
                                  currentTrackId: track.id
                                };
                                dragStateRef.current = newDrag;
                                setDragState(newDrag);
                              }}
                            />
                          )}
                        </div>
                      );
                    }

                    if (clip.isGraphic || track.type === 'graphics') {
                      const isSubCaption = clip.graphicType === 'subtitle_caption' || track.isSubtitleTrack || track.id === 'track-subtitles-1';
                      return (
                        <div
                          key={clip.id}
                          data-clip-id={clip.id}
                          className={`timeline-clip clip-graphic ${isSubCaption ? 'clip-subtitle-amber' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={(e) => handleClipClick(clip.id, e)}
                          onContextMenu={(e) => handleClipContextMenu(clip, track, e)}
                          onMouseDown={(e) => handleClipMouseDown(clip, track, e)}
                          onMouseMove={(e) => {
                            if (activeTool === 'razor') {
                              setRazorHoverTime(clientXToSeconds(e.clientX));
                            }
                          }}
                          onMouseLeave={() => {
                            if (activeTool === 'razor') setRazorHoverTime(null);
                          }}
                          style={{
                            left: `${left}px`,
                            width: `${width}px`,
                            backgroundColor: isSubCaption ? undefined : (clip.color ? `${clip.color}35` : 'rgba(168, 139, 250, 0.35)'),
                            borderColor: isSelected ? '#ffffff' : (isSubCaption ? '#fde68a' : (clip.color || '#a78bfa')),
                            cursor: activeTool === 'razor' ? 'crosshair' : undefined
                          }}
                          title={`[${formatTimecode(clip.startTime)}] ${clip.name} | ${clip.title || ''}`}
                        >
                          {!track.locked && width >= 14 && (
                            <div
                              className="clip-handle clip-handle-left"
                              onMouseDown={(e) => handleTrimHandleMouseDown('left', clip, track, null, e)}
                            />
                          )}

                          <div className="clip-content-body clip-graphic-body" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 6px' }}>
                            {!isSubCaption && (
                              <span className="clip-fx-badge">fx</span>
                            )}
                            <span
                              className="clip-name"
                              style={{
                                fontWeight: isSubCaption ? '700' : '600',
                                color: isSubCaption ? '#111111' : '#ffffff',
                                fontSize: '11px'
                              }}
                            >
                              {clip.title || clip.name}
                            </span>
                            {clip.animation?.inType && !isSubCaption && (
                              <span style={{ fontSize: '9.5px', color: '#dcdcdc', marginLeft: 'auto', flexShrink: 0, opacity: 0.75 }}>
                                {clip.animation.inType}
                              </span>
                            )}
                          </div>

                          {!track.locked && width >= 14 && (
                            <div
                              className="clip-handle clip-handle-right"
                              onMouseDown={(e) => handleTrimHandleMouseDown('right', clip, track, null, e)}
                            />
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={clip.id}
                        data-clip-id={clip.id}
                        className={`timeline-clip ${isSelected ? 'selected' : ''} ${
                          track.type === 'audio' ? 'clip-audio' : 'clip-video'
                        }`}
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          backgroundColor: clip.color ? `${clip.color}28` : undefined,
                          borderColor: isSelected ? '#38bdf8' : (clip.color || '#6366f1'),
                          cursor: activeTool === 'razor'
                            ? 'crosshair'
                            : (activeTool === 'slip' ? 'ew-resize' : undefined)
                        }}
                        onClick={(e) => handleClipClick(clip.id, e)}
                        onContextMenu={(e) => handleClipContextMenu(clip, track, e)}
                        onMouseDown={(e) => handleClipMouseDown(clip, track, e)}
                        onMouseMove={(e) => {
                          if (activeTool === 'razor') {
                            setRazorHoverTime(clientXToSeconds(e.clientX));
                          }
                        }}
                        onMouseLeave={() => {
                          if (activeTool === 'razor') setRazorHoverTime(null);
                        }}
                      >
                        {/* Fade-In / Fade-Out Visual Triangles */}
                        {clip.fadeIn > 0 && (
                          <div
                            title={`Fade In: ${Number(clip.fadeIn).toFixed(1)}s`}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: `${Math.min(width * 0.5, clip.fadeIn * zoomLevel)}px`,
                              height: '100%',
                              background: 'linear-gradient(to top right, transparent 48%, rgba(56, 189, 248, 0.35) 50%)',
                              borderTop: '2px solid #38bdf8',
                              pointerEvents: 'none',
                              zIndex: 3
                            }}
                          />
                        )}
                        {clip.fadeOut > 0 && (
                          <div
                            title={`Fade Out: ${Number(clip.fadeOut).toFixed(1)}s`}
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: 0,
                              width: `${Math.min(width * 0.5, clip.fadeOut * zoomLevel)}px`,
                              height: '100%',
                              background: 'linear-gradient(to top left, transparent 48%, rgba(56, 189, 248, 0.35) 50%)',
                              borderTop: '2px solid #38bdf8',
                              pointerEvents: 'none',
                              zIndex: 3
                            }}
                          />
                        )}

                        {/* Trim Left Handle */}
                        {!track.locked && width >= 14 && (
                          <div
                            className="clip-handle clip-handle-left"
                            onMouseDown={(e) => {
                              const isImageAsset = asset?.type === 'image';
                              const effectiveDuration = (!isImageAsset && asset?.duration && asset.duration > 0)
                                ? asset.duration
                                : (isImageAsset ? null : (getCachedWaveform(clip.assetId)?.duration || null));
                              handleTrimHandleMouseDown('left', clip, track, effectiveDuration, e);
                            }}
                          ></div>
                        )}

                        {/* Audio Waveform Renderer */}
                        {track.type === 'audio' && (
                          <AudioClipWaveform
                            clip={clip}
                            asset={asset}
                            width={width}
                            color={clip.color}
                            onAssetDurationResolved={(assetId, exactDuration, peaks) => {
                              if (onUpdateProject && project) {
                                const nextAssets = (project.assets || []).map(a =>
                                  a.id === assetId ? { ...a, duration: exactDuration, waveform: peaks } : a
                                );
                                onUpdateProject({ ...project, assets: nextAssets });
                              }
                            }}
                          />
                        )}

                        {/* Clip Content */}
                        <div className="clip-content-body">
                          {track.type === 'video' && (
                            (asset?.thumbnail || (asset?.type === 'image' && asset?.url)) ? (
                              <img
                                src={asset.thumbnail || asset.url}
                                alt=""
                                className="clip-thumb-preview"
                                draggable={false}
                              />
                            ) : (
                              <div className="clip-thumb-icon-box">
                                <Film size={14} className="text-emerald" />
                              </div>
                            )
                          )}

                          <span
                            className={`clip-fx-badge ${
                              (clip.scale && clip.scale !== 1) ||
                              (clip.brightness && clip.brightness !== 1) ||
                              (clip.contrast && clip.contrast !== 1) ||
                              clip.temperature ||
                              clip.tint ||
                              (clip.volume !== undefined && clip.volume !== 1)
                                ? 'is-customized'
                                : ''
                            }`}
                          >
                            fx
                          </span>

                          <div className="clip-labels">
                            <span className="clip-title-text" title={clip.name}>
                              {clip.name}
                            </span>
                            <span className="clip-duration-text timecode" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {clip.duration.toFixed(1)}s
                              {clip.playbackRate && Number(clip.playbackRate) !== 1 && (
                                <span style={{
                                  fontSize: '9px',
                                  padding: '0 4px',
                                  borderRadius: '3px',
                                  background: 'rgba(245, 158, 11, 0.25)',
                                  color: '#fbbf24',
                                  fontWeight: 700
                                }}>
                                  {clip.playbackRate}x
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Trim Right Handle */}
                        {!track.locked && width >= 14 && (
                          <div
                            className="clip-handle clip-handle-right"
                            onMouseDown={(e) => {
                              const isImageAsset = asset?.type === 'image';
                              const effectiveDuration = (!isImageAsset && asset?.duration && asset.duration > 0)
                                ? asset.duration
                                : (isImageAsset ? null : (getCachedWaveform(clip.assetId)?.duration || null));
                              handleTrimHandleMouseDown('right', clip, track, effectiveDuration, e);
                            }}
                          ></div>
                        )}
                      </div>
                    );
                  })}

                  {/* Empty Gap Closer Badges (Eliminar Vacío / Unir Partes) */}
                  {!track.locked && (trackGapsMap.get(track.id) || []).map((gap) => {
                    const gapLeft = gap.start * zoomLevel;
                    const gapWidth = Math.max(2, gap.duration * zoomLevel);
                    const isCompact = gapWidth < 54;
                    const isTiny = gapWidth < 22;

                    return (
                      <div
                        key={gap.id}
                        className={`timeline-track-gap ${isCompact ? 'is-compact' : ''} ${isTiny ? 'is-tiny' : ''} ${dragState ? 'is-dragging-mode' : ''}`}
                        style={{
                          left: `${gapLeft}px`,
                          width: `${gapWidth}px`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                        title={`Espacio vacío (${gap.duration.toFixed(2)}s)`}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          className="gap-delete-btn"
                          title={`Eliminar vacío (${gap.duration.toFixed(2)}s) y unir pistas`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGap(track.id, gap.start, gap.duration);
                          }}
                        >
                          <ArrowLeftRight size={11} className="gap-btn-icon" />
                          {!isCompact && (
                            <span className="gap-btn-label">Unir</span>
                          )}
                        </button>

                        {track.type === 'video' && onOpenSceneBroll && !isTiny && (
                          <button
                            type="button"
                            className="gap-broll-btn"
                            title={`Llenar espacio vacío (${gap.duration.toFixed(2)}s) con B-Roll`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const sceneTrack = (project.tracks || []).find(t => t.type === 'scene');
                              const matchedSc = sceneTrack?.clips?.find(sc => {
                                const overlaps = Math.max(0, Math.min(gap.start + gap.duration, sc.startTime + sc.duration) - Math.max(gap.start, sc.startTime));
                                return Math.abs(sc.startTime - gap.start) < 0.6 || overlaps > 0.1;
                              });
                              let fullScene = null;
                              if (matchedSc) {
                                const sNum = matchedSc.sceneNumber ? Number(matchedSc.sceneNumber) : null;
                                const nameMatch = matchedSc.name?.match(/\[E\s*0*(\d+)\]/i) || matchedSc.title?.match(/\[E\s*0*(\d+)\]/i);
                                const extractedNum = nameMatch ? Number(nameMatch[1]) : null;
                                const targetNum = sNum || extractedNum;
                                fullScene = (project.scenes?.list || []).find(s =>
                                  (targetNum && Number(s.sceneNumber) === targetNum) ||
                                  (matchedSc.sceneId && s.id === matchedSc.sceneId) ||
                                  (matchedSc.id && s.id === matchedSc.id)
                                );
                              }
                              onOpenSceneBroll({
                                ...(fullScene || {}),
                                ...(matchedSc || {}),
                                id: matchedSc?.sceneId || fullScene?.id || matchedSc?.id,
                                sceneNumber: matchedSc?.sceneNumber || fullScene?.sceneNumber || 1,
                                searchKeywords: fullScene?.searchKeywords || matchedSc?.searchKeywords || [],
                                visualDescription: fullScene?.visualDescription || matchedSc?.visualDescription || '',
                                title: matchedSc?.title || fullScene?.title || matchedSc?.name || 'Escena',
                                startTime: Number(gap.start.toFixed(2)),
                                duration: Number(gap.duration.toFixed(2)),
                                endTime: Number((gap.start + gap.duration).toFixed(2))
                              });
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '2px 5px',
                              fontSize: '10px',
                              fontWeight: 600,
                              background: 'rgba(6, 182, 212, 0.25)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <Download size={10} />
                            {!isCompact && <span>+ B-Roll</span>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Marquee Selection Rectangle Box */}
        {marqueeState && marqueeState.hasMoved && (
          <div
            className="timeline-marquee-box"
            style={{
              left: `${Math.min(marqueeState.startX, marqueeState.currentX)}px`,
              top: `${Math.min(marqueeState.startY, marqueeState.currentY)}px`,
              width: `${Math.abs(marqueeState.currentX - marqueeState.startX)}px`,
              height: `${Math.abs(marqueeState.currentY - marqueeState.startY)}px`
            }}
          />
        )}

        {/* Playhead Vertical Line (Extends down across all tracks on top of all clips and tracks) */}
        <div
          ref={playheadLineRef}
          className="playhead-line-track"
          style={{
            left: `calc(var(--timeline-header-width) + ${playheadPositionPx}px)`,
            display: playheadPositionPx < (scrollContainerRef.current?.scrollLeft || 0) ? 'none' : 'block'
          }}
        />

        {/* Magnetic Alignment Snap Guide (CapCut / Adobe Premiere style) */}
        {activeSnapGuide && (
          <div
            className="timeline-snap-guide-line"
            style={{
              left: `calc(var(--timeline-header-width) + ${activeSnapGuide.time * zoomLevel}px)`,
              display: (activeSnapGuide.time * zoomLevel) < (scrollContainerRef.current?.scrollLeft || 0) ? 'none' : 'block'
            }}
          >
            <div className="timeline-snap-guide-tag">
              <Magnet size={11} className="snap-tag-icon" />
              <span>{activeSnapGuide.label || 'Alineado'}</span>
            </div>
          </div>
        )}

        {/* Razor Tool (C) Live Cut Preview Line */}
        {activeTool === 'razor' && razorHoverTime !== null && (
          <div
            style={{
              position: 'absolute',
              top: '36px',
              bottom: 0,
              left: `calc(var(--timeline-header-width) + ${razorHoverTime * zoomLevel}px)`,
              width: '2px',
              borderLeft: '2px dashed #f43f5e',
              pointerEvents: 'none',
              zIndex: 95
            }}
          >
            <div style={{
              position: 'absolute',
              top: '4px',
              left: '6px',
              background: 'rgba(244, 63, 94, 0.92)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              ✂️ Cortar {formatTimecode(razorHoverTime)}
            </div>
          </div>
        )}
      </div>

      {/* Floating Multi-Selection Action Bar */}
      {selectedClipIds && selectedClipIds.length > 1 && (
        <div className="timeline-multiselect-floating-bar">
          <div className="multiselect-badge-info">
            <span className="multiselect-count-tag">
              <CheckSquare size={13} style={{ color: '#38bdf8' }} />
              <strong>{selectedClipIds.length}</strong> clips
            </span>
            <span className="multiselect-duration-tag">
              ⏱ {selectedClipsDuration.toFixed(1)}s total
            </span>
          </div>
          <div className="multiselect-actions">
            <button
              type="button"
              className="btn-multiselect"
              onClick={handleDuplicateClip}
              title="Duplicar selección (Ctrl+D)"
            >
              <Copy size={13} />
              <span>Duplicar ({selectedClipIds.length})</span>
            </button>
            <button
              type="button"
              className="btn-multiselect"
              onClick={handleBatchToggleMute}
              title="Alternar silencio/audio en lote"
            >
              <Volume2 size={13} />
              <span>Audio</span>
            </button>
            <button
              type="button"
              className="btn-multiselect"
              onClick={handleRippleDeleteClip}
              title="Eliminar y cerrar hueco (Shift+Supr)"
              style={{ color: '#fbbf24' }}
            >
              <ArrowLeftRight size={13} />
              <span>Rizo</span>
            </button>
            <button
              type="button"
              className="btn-multiselect btn-multiselect-danger"
              onClick={handleDeleteClip}
              title="Eliminar clips seleccionados (Supr / Backspace)"
            >
              <Trash2 size={13} />
              <span>Eliminar ({selectedClipIds.length})</span>
            </button>
            <div className="multiselect-sep" />
            <button
              type="button"
              className="btn-multiselect btn-multiselect-close"
              onClick={() => setMultiSelection([])}
              title="Deseleccionar todo (Esc)"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Context Menu for Clips */}
      {contextMenu && (
        <div
          className="timeline-context-menu"
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: '700',
            color: 'var(--text-secondary)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {contextMenu.isMulti ? (
              <>
                <CheckSquare size={13} style={{ color: '#38bdf8' }} />
                <span>{contextMenu.count} clips seleccionados</span>
              </>
            ) : (
              <span>{contextMenu.clip.name || 'Clip'}</span>
            )}
          </div>

          {!contextMenu.isMulti && isSubtitleClip(contextMenu.clip, contextMenu.track) && (
            <>
              <button
                type="button"
                className="context-menu-item"
                style={{ color: '#eab308', fontWeight: '600' }}
                onClick={() => {
                  const currentApply = project.subtitleSettings?.applyToAll !== false;
                  if (onUpdateProject) {
                    onUpdateProject({
                      ...project,
                      subtitleSettings: {
                        ...getDefaultSubtitleSettings(project),
                        ...(project.subtitleSettings || {}),
                        applyToAll: !currentApply
                      }
                    });
                  }
                  setContextMenu(null);
                }}
              >
                <Sparkles size={14} style={{ color: '#eab308' }} />
                <span>
                  {project.subtitleSettings?.applyToAll !== false
                    ? '✓ Aplicar a todos los subtítulos (CapCut: Activo)'
                    : '○ Activar "Aplicar a todos" (CapCut)'}
                </span>
              </button>

              <button
                type="button"
                className="context-menu-item"
                style={{ color: '#fef08a' }}
                onClick={() => {
                  if (onUpdateProject) {
                    const c = contextMenu.clip;
                    const updated = applyGlobalSubtitleStyle(project, {
                      styleId: c.subtitleStyle || 'hormozi_active',
                      fontFamily: c.fontFamily,
                      fontSize: c.fontSize,
                      textColor: c.textColor,
                      accentColor: c.accentColor,
                      bgColor: c.bgColor,
                      strokeColor: c.strokeColor,
                      strokeWidth: c.strokeWidth,
                      textTransform: c.textTransform,
                      backdropGlass: c.backdropGlass,
                      highlightWordMode: c.highlightWordMode,
                      letterSpacing: c.letterSpacing,
                      textShadowBlur: c.textShadowBlur,
                      textShadowOffsetY: c.textShadowOffsetY,
                      textShadowColor: c.textShadowColor,
                      animationIn: c.animationIn,
                      animationInDuration: c.animationInDuration,
                      animationLoop: c.animationLoop,
                      animationOut: c.animationOut,
                      animationOutDuration: c.animationOutDuration,
                      posX: c.position?.x ?? c.positionX,
                      posY: c.position?.y ?? c.positionY,
                      scale: c.position?.scale ?? c.scale,
                      opacity: c.opacity
                    });
                    onUpdateProject(updated);
                  }
                  setContextMenu(null);
                }}
              >
                <Copy size={14} />
                <span>Aplicar estilo de este subtítulo a todos</span>
              </button>
            </>
          )}

          {!contextMenu.isMulti && contextMenu.track.type === 'scene' && (
            <button
              type="button"
              className="context-menu-item"
              style={{ color: '#06b6d4', fontWeight: '600' }}
              onClick={() => {
                if (onSelectScene) onSelectScene(contextMenu.clip);
                setContextMenu(null);
              }}
            >
              <Sliders size={14} className="text-cyan" />
              <span>⚙️ Ver Propiedades en Escenas IA</span>
            </button>
          )}

          {!contextMenu.isMulti && contextMenu.track.type === 'scene' && onOpenSceneBroll && (
            <button
              type="button"
              className="context-menu-item"
              style={{ color: '#38bdf8', fontWeight: '600' }}
              onClick={() => {
                const sClip = contextMenu.clip;
                const sNum = sClip.sceneNumber ? Number(sClip.sceneNumber) : null;
                const nameMatch = sClip.name?.match(/\[E\s*0*(\d+)\]/i) || sClip.title?.match(/\[E\s*0*(\d+)\]/i);
                const extractedNum = nameMatch ? Number(nameMatch[1]) : null;
                const targetNum = sNum || extractedNum;
                const fullScene = (project.scenes?.list || []).find(s =>
                  (targetNum && Number(s.sceneNumber) === targetNum) ||
                  (sClip.sceneId && s.id === sClip.sceneId) ||
                  (sClip.id && s.id === sClip.id)
                );
                onOpenSceneBroll({
                  ...(fullScene || {}),
                  ...sClip,
                  id: sClip.sceneId || fullScene?.id || sClip.id,
                  sceneNumber: targetNum || fullScene?.sceneNumber || 1,
                  searchKeywords: fullScene?.searchKeywords || sClip.searchKeywords || [],
                  visualDescription: fullScene?.visualDescription || sClip.visualDescription || '',
                  title: sClip.title || fullScene?.title || sClip.name || `Escena ${targetNum || 1}`,
                  startTime: Number(sClip.startTime.toFixed(2)),
                  duration: Number(sClip.duration.toFixed(2)),
                  endTime: Number((sClip.startTime + sClip.duration).toFixed(2))
                });
                setContextMenu(null);
              }}
            >
              <Download size={14} className="text-cyan" />
              <span>🎬 Buscar / Asignar B-Roll para esta Escena</span>
            </button>
          )}

          {!contextMenu.isMulti && contextMenu.track.type === 'scene' && onOpenGraphicForScene && (
            <button
              type="button"
              className="context-menu-item"
              style={{ color: '#06b6d4', fontWeight: '600' }}
              onClick={() => {
                onOpenGraphicForScene({
                  ...contextMenu.clip,
                  startTime: Number(contextMenu.clip.startTime.toFixed(2)),
                  duration: Number(contextMenu.clip.duration.toFixed(2)),
                  isTimelineClip: true
                });
                setContextMenu(null);
              }}
            >
              <Sparkles size={14} className="text-cyan" />
              <span>✨ Generar Efecto Visual IA para esta Escena</span>
            </button>
          )}

          {!contextMenu.isMulti && contextMenu.track.type !== 'scene' && !contextMenu.clip.isGraphic && contextMenu.track.type !== 'audio' && onOpenGraphicForScene && (() => {
            const sNumFromClip = contextMenu.clip.sceneNumber ? Number(contextMenu.clip.sceneNumber) : null;
            const nameMatch = contextMenu.clip.name?.match(/\[E\s*0*(\d+)\]/i) || contextMenu.clip.name?.match(/\bEscena\s*0*(\d+)\b/i);
            const extractedNum = nameMatch ? Number(nameMatch[1]) : null;

            const matchedScene = (project.scenes?.list || []).find(s =>
              (sNumFromClip && Number(s.sceneNumber) === sNumFromClip) ||
              (extractedNum && Number(s.sceneNumber) === extractedNum) ||
              (contextMenu.clip.sceneId && s.id === contextMenu.clip.sceneId) ||
              (contextMenu.clip.startTime >= s.startTime && contextMenu.clip.startTime < (s.endTime || s.startTime + s.duration))
            );

            const targetSceneData = {
              ...(matchedScene || {}),
              ...contextMenu.clip,
              id: contextMenu.clip.id,
              sceneId: contextMenu.clip.sceneId || matchedScene?.id,
              sceneNumber: sNumFromClip || extractedNum || matchedScene?.sceneNumber || 1,
              title: contextMenu.clip.title || matchedScene?.title || contextMenu.clip.name || 'Escena',
              scriptText: contextMenu.clip.text || matchedScene?.scriptText || contextMenu.clip.name || '',
              visualDescription: contextMenu.clip.visualDescription || matchedScene?.visualDescription || '',
              visualType: contextMenu.clip.visualType || 'video',
              startTime: Number(contextMenu.clip.startTime.toFixed(2)),
              duration: Number(contextMenu.clip.duration.toFixed(2)),
              isTimelineClip: true
            };

            return (
              <button
                type="button"
                className="context-menu-item"
                style={{ color: '#06b6d4', fontWeight: '600' }}
                onClick={() => {
                  onOpenGraphicForScene(targetSceneData);
                  setContextMenu(null);
                }}
              >
                <Sparkles size={14} className="text-cyan" />
                <span>
                  {matchedScene
                    ? `✨ Generar Efecto Visual IA (Escena #${targetSceneData.sceneNumber})`
                    : '✨ Generar Efecto Visual IA para este Clip'}
                </span>
              </button>
            );
          })()}

          {!contextMenu.isMulti && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                handleSplitClip();
                setContextMenu(null);
              }}
            >
              <Scissors size={14} className="text-rose" />
              <span>Dividir en Cabezal (✂️)</span>
            </button>
          )}

          {!contextMenu.isMulti && contextMenu.track.type === 'video' && contextMenu.clip.audioSeparated === false && !contextMenu.clip.linkedClipId && onSeparateAudio && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onSeparateAudio(contextMenu.clip.id);
                setContextMenu(null);
              }}
            >
              <Music size={14} className="text-emerald" />
              <span>Separar Audio a Pista Independiente</span>
            </button>
          )}

          {!contextMenu.isMulti && contextMenu.clip.linkedClipId && onUnlinkClip && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onUnlinkClip(contextMenu.clip.id);
                setContextMenu(null);
              }}
            >
              <Unlink size={14} className="text-amber" />
              <span>Desvincular Clip</span>
            </button>
          )}

          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              handleDuplicateClip();
              setContextMenu(null);
            }}
          >
            <Copy size={14} style={{ color: '#38bdf8' }} />
            <span>{contextMenu.isMulti ? `Duplicar Selección (${contextMenu.count})` : 'Duplicar Clip'}</span>
          </button>

          {contextMenu.isMulti && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                handleBatchToggleMute();
                setContextMenu(null);
              }}
            >
              <Volume2 size={14} style={{ color: '#818cf8' }} />
              <span>Silenciar / Activar Audio</span>
            </button>
          )}

          {/* Mover a otra pista compatible */}
          {(() => {
            const compatibleTracks = (project.tracks || []).filter(t =>
              t.id !== contextMenu.track.id &&
              areTrackTypesCompatible(contextMenu.track.type, t.type) &&
              !t.locked &&
              t.type !== 'guide' &&
              t.type !== 'scene'
            );
            if (compatibleTracks.length === 0) return null;

            return (
              <>
                <div className="context-menu-divider" />
                <div className="context-menu-section-header">
                  <span>Mover a pista:</span>
                </div>
                {compatibleTracks.map(targetTrack => (
                  <button
                    key={targetTrack.id}
                    type="button"
                    className="context-menu-item"
                    onClick={() => {
                      handleMoveClipToTrack(targetTrack.id);
                      setContextMenu(null);
                    }}
                  >
                    {targetTrack.type === 'audio' ? (
                      <Music size={13} className="text-cyan" />
                    ) : (
                      <Video size={13} className="text-indigo" />
                    )}
                    <span>{targetTrack.name}</span>
                  </button>
                ))}
              </>
            );
          })()}

          <div className="context-menu-divider" />

          <button
            type="button"
            className="context-menu-item"
            style={{ color: '#fbbf24' }}
            onClick={() => {
              handleRippleDeleteClip();
              setContextMenu(null);
            }}
          >
            <ArrowLeftRight size={14} />
            <span>{contextMenu.isMulti ? `Eliminar y Cerrar Hueco (${contextMenu.count})` : 'Eliminar y Cerrar Hueco (Shift+Supr)'}</span>
          </button>

          <button
            type="button"
            className="context-menu-item text-danger"
            onClick={() => {
              handleDeleteClip();
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            <span>{contextMenu.isMulti ? `Eliminar Selección (${contextMenu.count})` : 'Eliminar Clip'}</span>
          </button>
        </div>
      )}
        </div>
      </div>

      {/* 3. Far-Right Vertical Stereo Audio Meter Dock (0 to -54 dB) */}
      <div className="premiere-meter-dock" title="Medidor Maestro de Nivel de Audio Estéreo (L / R dB)">
        <div className="premiere-meter-body">
          <div className="premiere-meter-bars">
            <div className="premiere-meter-channel">
              <div ref={meterLeftRef} className="premiere-meter-fill" style={{ height: '0%' }} />
            </div>
            <div className="premiere-meter-channel">
              <div ref={meterRightRef} className="premiere-meter-fill" style={{ height: '0%' }} />
            </div>
          </div>

          <div className="premiere-meter-scale">
            <span>0</span>
            <span>-6</span>
            <span>-12</span>
            <span>-18</span>
            <span>-24</span>
            <span>-30</span>
            <span>-36</span>
            <span>-42</span>
            <span>-48</span>
            <span>-54</span>
            <span>dB</span>
          </div>
        </div>

        <div className="premiere-meter-footer">
          <span className={`premiere-meter-solo-tag ${(project.tracks || []).some(t => t.solo) ? 'active' : ''}`}>S</span>
          <span className={`premiere-meter-solo-tag ${(project.tracks || []).some(t => t.solo) ? 'active' : ''}`}>S</span>
        </div>
      </div>
      <MediaAdaptModal {...adaptModal} />
    </div>
  );
}, (prev, next) => {
  // 1. Continuous Playback Fast-Path:
  // When playback is running (and not scrubbing or editing), bypass React reconciliation
  // of the entire 3,200+ line Timeline component. The playhead, timecode badge, active clip
  // highlights, and auto-scrolling are already handled at 60 FPS directly on the DOM!
  if (prev.isPlaying && next.isPlaying && !prev.isScrubbing && !next.isScrubbing) {
    if (
      prev.project !== next.project ||
      prev.selectedClipId !== next.selectedClipId ||
      prev.selectedClipIds !== next.selectedClipIds ||
      prev.isTimelineExpanded !== next.isTimelineExpanded ||
      prev.canUndo !== next.canUndo ||
      prev.canRedo !== next.canRedo
    ) {
      return false;
    }
    return true; // Skip 100% of Timeline React re-rendering!
  }

  // 2. Standard equality comparison when paused, scrubbing, or editing:
  return (
    prev.project === next.project &&
    prev.currentTime === next.currentTime &&
    prev.isPlaying === next.isPlaying &&
    prev.isScrubbing === next.isScrubbing &&
    prev.selectedClipId === next.selectedClipId &&
    prev.selectedClipIds === next.selectedClipIds &&
    prev.isTimelineExpanded === next.isTimelineExpanded &&
    prev.canUndo === next.canUndo &&
    prev.canRedo === next.canRedo
  );
});
