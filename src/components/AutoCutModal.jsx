import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X,
  Scissors,
  Sparkles,
  Play,
  Pause,
  Check,
  AlertTriangle,
  Volume2,
  VolumeX,
  Clock,
  Sliders,
  CheckCircle2,
  ArrowRight,
  SkipForward,
  SkipBack,
  HelpCircle,
  Film,
  Cpu,
  Zap,
  Cloud,
  RotateCcw,
  Key,
  Brain,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { formatTimecode } from '../utils/timeFormat';
import {
  analyzeClipsForAutoCut,
  buildCompositeCutIntervals,
  applyAutoCutsToProject
} from '../utils/autoCutEngine';
import { runEditorBrainAnalysis } from '../utils/aiEditorBrain';
import { getMediaBlob } from '../utils/storage';

const AVAILABLE_MODELS = [
  {
    id: 'whisper-base',
    title: 'Whisper Base (Local)',
    specs: '74 MB • Web Worker',
    badge: 'Recomendado',
    badgeBg: 'rgba(6, 182, 212, 0.2)',
    badgeColor: '#38bdf8',
    badgeBorder: 'rgba(6, 182, 212, 0.4)',
    description: 'Equilibrio ideal de velocidad y precisión en español. Reconoce correctamente nombres y reduce confusiones fonéticas.',
    icon: <Cpu size={18} />
  },
  {
    id: 'whisper-tiny',
    title: 'Whisper Tiny (Ultra Rápido)',
    specs: '39 MB • Web Worker',
    badge: 'Rápido',
    badgeBg: 'rgba(234, 179, 8, 0.2)',
    badgeColor: '#facc15',
    badgeBorder: 'rgba(234, 179, 8, 0.4)',
    description: 'El modelo más veloz y ligero. Ideal para computadoras con recursos moderados o revisiones ágiles.',
    icon: <Zap size={18} />
  },
  {
    id: 'whisper-small',
    title: 'Whisper Small (Máxima Calidad)',
    specs: '244 MB • Web Worker',
    badge: 'Alta Fidelidad',
    badgeBg: 'rgba(168, 85, 247, 0.2)',
    badgeColor: '#c084fc',
    badgeBorder: 'rgba(168, 85, 247, 0.4)',
    description: 'La mayor precisión de Whisper en local. Excelente para acentos regionales (Colombia, México, etc.) y jerga.',
    icon: <Sparkles size={18} />
  },
  {
    id: 'gemini',
    title: 'Google Gemini 2.0 Flash (Nube)',
    specs: 'Nube • Requiere API Key',
    badge: '100% Precisión',
    badgeBg: 'rgba(16, 185, 129, 0.2)',
    badgeColor: '#34d399',
    badgeBorder: 'rgba(16, 185, 129, 0.4)',
    description: 'Transcripción perfecta en milisegundos con comprensión contextual total de nombres propios y terminología.',
    icon: <Cloud size={18} />
  },
  {
    id: 'vad',
    title: 'Solo Silencios y Respiraciones (VAD)',
    specs: '0 MB • Instantáneo',
    badge: 'Sin IA de Texto',
    badgeBg: 'rgba(100, 116, 139, 0.2)',
    badgeColor: '#94a3b8',
    badgeBorder: 'rgba(100, 116, 139, 0.4)',
    description: 'Corta silencios y pausas acústicas en 1 segundo usando análisis de energía de onda RMS sin transcribir.',
    icon: <VolumeX size={18} />
  }
];

export function AutoCutModal({
  isOpen,
  onClose,
  project,
  selectedClipIds = [],
  selectedClipId = null,
  onUpdateProject,
  onBeginTransform = null,
  onEndTransform = null
}) {
  // Modal Stages: 'setup' | 'analyzing' | 'preview_editor'
  const [stage, setStage] = useState('setup');
  const [progress, setProgress] = useState({ percent: 0, message: '' });
  const [errorMessage, setErrorMessage] = useState(null);

  // Model & Key selection
  const [selectedModel, setSelectedModel] = useState(() => {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('montage_autocut_model')) || 'whisper-base';
  });
  const [geminiKeyInput, setGeminiKeyInput] = useState(() => {
    return (typeof localStorage !== 'undefined' && (localStorage.getItem('montage_pro_gemini_api_key') || localStorage.getItem('gemini_api_key'))) || '';
  });

  // Analysis result state
  const [analysisData, setAnalysisData] = useState(null);
  const [partitions, setPartitions] = useState([]);
  const [repeatedGroups, setRepeatedGroups] = useState([]);

  // Cut Settings
  const [paddingMs, setPaddingMs] = useState(120); // Margin buffer (default 120ms)
  const [minSilenceDuration, setMinSilenceDuration] = useState(0.35); // 0.35s catches natural speech pauses
  const [filterSilences, setFilterSilences] = useState(true);
  const [filterRepeatedTakes, setFilterRepeatedTakes] = useState(true);
  const [filterFillerWords, setFilterFillerWords] = useState(true);
  const [rippleClose, setRippleClose] = useState(true);

  // Cerebro Editor IA State
  const [useBrainOnAnalysis, setUseBrainOnAnalysis] = useState(true);
  const [isBrainRunning, setIsBrainRunning] = useState(false);
  const [editorBrainNotes, setEditorBrainNotes] = useState([]);
  const [editorBrainCuts, setEditorBrainCuts] = useState([]);

  // Video & Mini-Timeline Preview Player State
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate] = useState(1.0);
  const [activeTab, setActiveTab] = useState('brain'); // 'brain' | 'repeated' | 'transcript' | 'settings'
  const [transcriptFilter, setTranscriptFilter] = useState('all'); // 'all' | 'cut' | 'kept'
  const [skipCutsInPreview, setSkipCutsInPreview] = useState(true);

  const abortControllerRef = useRef(null);
  const [timelineZoom, setTimelineZoom] = useState(1); // 1.0x to 10.0x
  const timelineScrollContainerRef = useRef(null);
  const timelineStripRef = useRef(null);
  const rafRef = useRef(null);

  // Time ruler ticks for millimetric inspection when zoomed in
  const timelineTicks = useMemo(() => {
    if (!analysisData?.totalSpanDuration) return [];
    const total = analysisData.totalSpanDuration;
    const step = timelineZoom >= 6 ? 0.5 : timelineZoom >= 3 ? 1 : timelineZoom >= 2 ? 2 : 5;
    const ticks = [];
    for (let t = 0; t <= total; t += step) {
      ticks.push(Number(t.toFixed(1)));
    }
    return ticks;
  }, [analysisData?.totalSpanDuration, timelineZoom]);

  // Handle Ctrl / Meta + Wheel zoom on the timeline strip
  const handleTimelineWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.5 : -0.5;
      setTimelineZoom((prev) => Math.min(10, Math.max(1, Number((prev + delta).toFixed(1)))));
    }
  }, []);

  // Auto-scroll timeline when zoomed in to keep the playhead visible during playback
  useEffect(() => {
    if (timelineZoom > 1 && timelineScrollContainerRef.current && analysisData?.totalSpanDuration) {
      const container = timelineScrollContainerRef.current;
      const progress = currentTime / analysisData.totalSpanDuration;
      const playheadPx = progress * container.scrollWidth;
      const visibleStart = container.scrollLeft;
      const visibleEnd = visibleStart + container.clientWidth;

      if (playheadPx < visibleStart + 50 || playheadPx > visibleEnd - 50) {
        container.scrollTo({
          left: Math.max(0, playheadPx - container.clientWidth / 2),
          behavior: isPlaying ? 'smooth' : 'auto'
        });
      }
    }
  }, [currentTime, timelineZoom, analysisData?.totalSpanDuration, isPlaying]);

  // Determine target clip IDs
  const effectiveTargetClipIds = useMemo(() => {
    if (selectedClipIds && selectedClipIds.length > 0) return selectedClipIds;
    if (selectedClipId) return [selectedClipId];
    return [];
  }, [selectedClipIds, selectedClipId]);

  // Target clips information (uses analysisData if available, falls back to explicit selection or primary track)
  const targetClipsInfo = useMemo(() => {
    if (!project || !project.tracks) return [];
    if (analysisData?.targetClips && analysisData.targetClips.length > 0) {
      return analysisData.targetClips;
    }
    const idSet = new Set(effectiveTargetClipIds);
    if (idSet.size > 0) {
      const clips = [];
      (project.tracks || []).forEach(t => {
        (t.clips || []).forEach(c => {
          if (idSet.has(c.id)) {
            clips.push({ ...c, trackName: t.name, trackType: t.type });
          }
        });
      });
      if (clips.length > 0) return clips;
    }
    const primaryTrack = (project.tracks || []).find(t => (t.type === 'video' || t.type === 'audio') && !t.locked && !t.muted && (t.clips || []).length > 0);
    return (primaryTrack?.clips || []).map(c => ({ ...c, trackName: primaryTrack.name, trackType: primaryTrack.type }));
  }, [project, effectiveTargetClipIds, analysisData]);

  // Target clips span summary
  const targetClipsSpan = useMemo(() => {
    if (!targetClipsInfo || targetClipsInfo.length === 0) return { count: 0, duration: 0 };
    const minStart = Math.min(...targetClipsInfo.map(c => c.startTime));
    const maxEnd = Math.max(...targetClipsInfo.map(c => c.startTime + c.duration));
    return {
      count: targetClipsInfo.length,
      duration: Math.max(0, Number((maxEnd - minStart).toFixed(2))),
      minStart,
      maxEnd
    };
  }, [targetClipsInfo]);

  // Resolve the active clip on the timeline for current playback position
  const currentActiveClip = useMemo(() => {
    if (!targetClipsInfo || targetClipsInfo.length === 0) return null;
    const minStart = analysisData?.minStartTime || 0;
    const t = minStart + currentTime;
    return targetClipsInfo.find(c => t >= c.startTime && t < (c.startTime + c.duration))
      || targetClipsInfo[0];
  }, [targetClipsInfo, analysisData?.minStartTime, currentTime]);

  // Load preview media URL for the active video clip
  useEffect(() => {
    let active = true;
    let createdUrl = null;

    async function loadAssetUrl() {
      if (!isOpen || !currentActiveClip) return;
      const asset = (project.assets || []).find(a => a.id === currentActiveClip.assetId);
      if (!asset) return;

      const storedBlob = await getMediaBlob(asset.id);
      if (!active) return;

      if (storedBlob) {
        createdUrl = URL.createObjectURL(storedBlob);
        setVideoUrl(createdUrl);
      } else if (asset.previewUrl) {
        setVideoUrl(asset.previewUrl);
      } else if (asset.url) {
        setVideoUrl(asset.url);
      }
    }

    loadAssetUrl();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isOpen, currentActiveClip, project?.assets]);

  // Start Analysis Handler
  const handleStartAnalysis = useCallback(async (modelChoice = selectedModel) => {
    setErrorMessage(null);
    setStage('analyzing');
    setProgress({ percent: 5, message: 'Iniciando motor de recortes IA...' });

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('montage_autocut_model', modelChoice);
      if (geminiKeyInput.trim()) {
        localStorage.setItem('montage_pro_gemini_api_key', geminiKeyInput.trim());
      }
    }

    abortControllerRef.current = new AbortController();

    try {
      const res = await analyzeClipsForAutoCut({
        project,
        targetClipIds: effectiveTargetClipIds,
        onProgress: setProgress,
        abortController: abortControllerRef.current,
        options: {
          minSilenceDuration,
          paddingMs,
          transcriptionModel: modelChoice,
          geminiApiKey: geminiKeyInput.trim()
        }
      });

      setAnalysisData(res);
      setRepeatedGroups(res.repeatedTakeGroups || []);

      // If Cerebro Editor IA is active, run senior video editor reasoning
      if (useBrainOnAnalysis && res.rawSegments && res.rawSegments.length > 0) {
        setProgress({ percent: 92, message: '🧠 Razonando montaje con Cerebro Editor IA (analizando equivocaciones y ondas)...' });
        try {
          const brainRes = await runEditorBrainAnalysis({
            speechSegments: res.rawSegments,
            silences: res.detectedSilences,
            acousticValleys: res.acousticValleys || [],
            totalDuration: res.totalSpanDuration,
            apiKey: geminiKeyInput.trim(),
            options: {
              minSilenceDuration,
              paddingMs,
              filterSilences: false, // Silences are managed independently by user controls
              filterMistakes: true,
              filterFalseStarts: true,
              filterRepeatedTakes: true
            }
          });

          if (brainRes && brainRes.cutProposals && brainRes.cutProposals.length > 0) {
            setEditorBrainCuts(brainRes.cutProposals);
            setEditorBrainNotes(brainRes.editorNotes || []);
            // Superimpose Cerebro IA cuts with user silences
            const composite = buildCompositeCutIntervals({
              speechSegments: res.rawSegments,
              silences: res.detectedSilences,
              repeatedTakeGroups: res.repeatedTakeGroups || [],
              editorBrainCuts: brainRes.cutProposals,
              totalDuration: res.totalSpanDuration,
              settings: {
                minSilenceDuration,
                paddingMs,
                filterSilences,
                filterRepeatedTakes: true,
                filterFillerWords: true
              }
            });
            setPartitions(composite);
            setActiveTab('brain');
          } else {
            setEditorBrainCuts([]);
            setPartitions(res.partitions);
            setActiveTab((res.repeatedTakeGroups || []).length > 0 ? 'repeated' : 'transcript');
          }
        } catch (bErr) {
          console.warn('Cerebro IA reasoning fallback:', bErr);
          setPartitions(res.partitions);
          setActiveTab((res.repeatedTakeGroups || []).length > 0 ? 'repeated' : 'transcript');
        }
      } else {
        setPartitions(res.partitions);
        if ((res.repeatedTakeGroups || []).length > 0) {
          setActiveTab('repeated');
        } else {
          setActiveTab('transcript');
        }
      }

      setStage('preview_editor');
      setCurrentTime(0);
    } catch (err) {
      if (err.message?.includes('cancelada')) {
        setStage('setup');
      } else {
        console.error('AutoCut Analysis Error:', err);
        setErrorMessage(err.message || 'Error durante el análisis de recortes IA.');
        setStage('setup');
      }
    }
  }, [project, effectiveTargetClipIds, minSilenceDuration, paddingMs, selectedModel, geminiKeyInput, useBrainOnAnalysis, filterSilences]);

  // Trigger Cerebro Editor IA on demand from Preview Editor
  const handleTriggerEditorBrain = useCallback(async () => {
    if (!analysisData) return;
    setIsBrainRunning(true);
    try {
      const brainRes = await runEditorBrainAnalysis({
        speechSegments: analysisData.rawSegments || [],
        silences: analysisData.detectedSilences || [],
        acousticValleys: analysisData.acousticValleys || [],
        totalDuration: analysisData.totalSpanDuration || 0,
        apiKey: geminiKeyInput.trim(),
        options: {
          minSilenceDuration,
          paddingMs,
          filterSilences: false, // Silences are managed independently by user controls
          filterMistakes: true,
          filterFalseStarts: true,
          filterRepeatedTakes: true
        }
      });
      if (brainRes && brainRes.cutProposals && brainRes.cutProposals.length > 0) {
        setEditorBrainCuts(brainRes.cutProposals);
        setEditorBrainNotes(brainRes.editorNotes || []);
        // Superimpose Cerebro IA cuts with user silences
        const composite = buildCompositeCutIntervals({
          speechSegments: analysisData.rawSegments,
          silences: analysisData.detectedSilences,
          repeatedTakeGroups: repeatedGroups,
          editorBrainCuts: brainRes.cutProposals,
          totalDuration: analysisData.totalSpanDuration,
          settings: {
            minSilenceDuration,
            paddingMs,
            filterSilences,
            filterRepeatedTakes: true,
            filterFillerWords: true
          }
        });
        setPartitions(composite);
        setActiveTab('brain');
      }
    } catch (err) {
      console.error('Error triggering Cerebro Editor IA:', err);
    } finally {
      setIsBrainRunning(false);
    }
  }, [analysisData, geminiKeyInput, minSilenceDuration, paddingMs, filterSilences, repeatedGroups]);


  // Reset state on close
  const handleClose = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setStage('setup');
    setAnalysisData(null);
    setPartitions([]);
    setRepeatedGroups([]);
    setVideoUrl(null);
    setIsPlaying(false);
    onClose();
  }, [onClose]);

  // Recalculate cut intervals whenever sliders or settings change (Preserves Cerebro IA cuts!)
  const handleRecomputePartitions = (newSettings = {}) => {
    if (!analysisData) return;
    const mergedSettings = {
      paddingMs: newSettings.paddingMs !== undefined ? newSettings.paddingMs : paddingMs,
      minSilenceDuration: newSettings.minSilenceDuration !== undefined ? newSettings.minSilenceDuration : minSilenceDuration,
      filterSilences: newSettings.filterSilences !== undefined ? newSettings.filterSilences : filterSilences,
      filterRepeatedTakes: newSettings.filterRepeatedTakes !== undefined ? newSettings.filterRepeatedTakes : filterRepeatedTakes,
      filterFillerWords: newSettings.filterFillerWords !== undefined ? newSettings.filterFillerWords : filterFillerWords
    };

    if (newSettings.minSilenceDuration !== undefined) setMinSilenceDuration(newSettings.minSilenceDuration);
    if (newSettings.paddingMs !== undefined) setPaddingMs(newSettings.paddingMs);
    if (newSettings.filterSilences !== undefined) setFilterSilences(newSettings.filterSilences);
    if (newSettings.filterRepeatedTakes !== undefined) setFilterRepeatedTakes(newSettings.filterRepeatedTakes);
    if (newSettings.filterFillerWords !== undefined) setFilterFillerWords(newSettings.filterFillerWords);

    const newPartitions = buildCompositeCutIntervals({
      speechSegments: analysisData.rawSegments,
      silences: analysisData.detectedSilences,
      repeatedTakeGroups: repeatedGroups,
      editorBrainCuts: editorBrainCuts, // Superimposes acoustic silences on top of persistent Cerebro IA cuts
      totalDuration: analysisData.totalSpanDuration,
      settings: mergedSettings
    });

    setPartitions(newPartitions);
  };

  // Toggle single partition between Cut and Kept
  const handleTogglePartition = (partitionId) => {
    setPartitions(prev => prev.map(p => {
      if (p.id === partitionId) {
        const nextCut = !p.isCut;
        return {
          ...p,
          isCut: nextCut,
          cutReason: nextCut ? (p.cutReason || 'Recortado manualmente por el usuario') : null
        };
      }
      return p;
    }));
  };

  // User chooses which take to keep in a repeated take group
  const handleChooseTake = (groupId, winningTakeIndex) => {
    // 1. Update repeated take group state
    const updatedGroups = repeatedGroups.map(grp => {
      if (grp.id === groupId) {
        return {
          ...grp,
          takes: grp.takes.map((t, idx) => ({
            ...t,
            isChosen: idx === winningTakeIndex
          }))
        };
      }
      return grp;
    });
    setRepeatedGroups(updatedGroups);

    // 2. Reflect directly in partitions
    const targetGroup = updatedGroups.find(g => g.id === groupId);
    if (!targetGroup) return;

    const chosenTake = targetGroup.takes.find(t => t.isChosen);

    setPartitions(prev => prev.map(p => {
      if (p.groupId === groupId) {
        const isThisWinningTake = chosenTake && Math.abs(p.start - chosenTake.start) < 0.1;
        return {
          ...p,
          isCut: !isThisWinningTake,
          cutReason: !isThisWinningTake ? `Descartada a favor de Toma ${chosenTake?.takeNumber || 2}` : null
        };
      }
      return p;
    }));
  };

  // Seek video to specific time along the analyzed span
  const handleSeek = useCallback((timeSec) => {
    const totalSpan = analysisData?.totalSpanDuration || 999;
    const minStart = analysisData?.minStartTime || 0;
    const clamped = Math.max(0, Math.min(totalSpan, Number(timeSec.toFixed(2))));

    setCurrentTime(clamped);

    const video = videoRef.current;
    if (!video) return;

    const targetTimeOnTimeline = minStart + clamped;
    const targetClip = (targetClipsInfo || []).find(c => targetTimeOnTimeline >= c.startTime && targetTimeOnTimeline < (c.startTime + c.duration)) || targetClipsInfo[0];

    if (targetClip) {
      const offsetInClip = targetTimeOnTimeline - targetClip.startTime;
      const targetTimeInMedia = (targetClip.sourceStart || 0) + offsetInClip;
      video.currentTime = targetTimeInMedia;
    }
  }, [targetClipsInfo, analysisData]);

  // Video Time Update & Smart Cut Skipping during preview
  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !analysisData) return;

    const totalSpan = analysisData.totalSpanDuration || 0;
    const minStart = analysisData.minStartTime || 0;

    const targetTimeOnTimeline = minStart + currentTime;
    const targetClip = (targetClipsInfo || []).find(c => targetTimeOnTimeline >= c.startTime && targetTimeOnTimeline < (c.startTime + c.duration)) || targetClipsInfo[0];

    const sourceOffset = targetClip?.sourceStart || 0;
    const offsetInClip = Math.max(0, video.currentTime - sourceOffset);
    const spanCur = Math.max(0, Math.min(totalSpan, Number(((targetClip.startTime - minStart) + offsetInClip).toFixed(2))));

    // Guard: Never allow time to exceed total span duration!
    if (spanCur >= totalSpan) {
      video.pause();
      setIsPlaying(false);
      setCurrentTime(totalSpan);
      return;
    }

    setCurrentTime(spanCur);

    // If skip cuts is active and we hit a cut region, automatically leap forward to the next kept region!
    if (skipCutsInPreview && isPlaying) {
      const activeCut = partitions.find(p => p.isCut && spanCur >= p.start && spanCur < (p.end - 0.05));
      if (activeCut) {
        const nextKept = partitions.find(p => !p.isCut && p.start >= activeCut.end);
        if (nextKept) {
          handleSeek(nextKept.start);
        } else {
          video.pause();
          setIsPlaying(false);
          setCurrentTime(totalSpan);
        }
      }
    }
  };

  // Play / Pause toggle
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Keyboard shortcuts in modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen || stage !== 'preview_editor') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 2));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeek(Math.min(analysisData?.totalSpanDuration || 999, currentTime + 2));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, stage, analysisData, currentTime, handleSeek, handleClose, togglePlayPause]);

  // Scrub on Mini Timeline Strip (Supports horizontal scrolling and zooming)
  const handleTimelineStripMouseDown = (e) => {
    if (!timelineStripRef.current || !analysisData) return;
    const updateFromMouse = (evt) => {
      if (!timelineStripRef.current || !analysisData) return;
      const rect = timelineStripRef.current.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(rect.width, evt.clientX - rect.left));
      const ratio = rect.width > 0 ? offsetX / rect.width : 0;
      const targetTime = ratio * (analysisData.totalSpanDuration || 1);
      handleSeek(targetTime);
    };

    updateFromMouse(e);

    const onMouseMove = (moveEvt) => updateFromMouse(moveEvt);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Apply cuts to the real project timeline
  const handleApplyCutsToTimeline = () => {
    if (!analysisData || partitions.length === 0) return;

    if (onBeginTransform) onBeginTransform();

    try {
      const clipIdsToCut = (analysisData?.targetClips && analysisData.targetClips.length > 0)
        ? analysisData.targetClips.map(c => c.id)
        : (effectiveTargetClipIds.length > 0 ? effectiveTargetClipIds : targetClipsInfo.map(c => c.id));

      const { updatedProject } = applyAutoCutsToProject(
        project,
        clipIdsToCut,
        partitions,
        analysisData?.minStartTime ?? 0,
        {
          rippleClose,
          maxEndTime: analysisData?.maxEndTime
        }
      );

      if (onUpdateProject) {
        onUpdateProject(updatedProject);
      }

      if (onEndTransform) onEndTransform();

      handleClose();
    } catch (err) {
      console.error('Failed to apply auto cuts:', err);
      alert('Error al aplicar recortes: ' + err.message);
    }
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const totalDuration = analysisData?.totalSpanDuration || 0;
    const cutDuration = partitions.filter(p => p.isCut).reduce((sum, p) => sum + (p.duration || 0), 0);
    const keptDuration = Math.max(0, totalDuration - cutDuration);
    const percentSaved = totalDuration > 0 ? Math.round((cutDuration / totalDuration) * 100) : 0;
    const totalCuts = partitions.filter(p => p.isCut).length;

    return {
      totalDuration,
      cutDuration,
      keptDuration,
      percentSaved,
      totalCuts
    };
  }, [analysisData, partitions]);

  // Current subtitle text to display over video
  const currentSubtitleText = useMemo(() => {
    const active = partitions.find(p => p.type === 'speech' && currentTime >= p.start && currentTime <= p.end);
    return active ? active.text : '';
  }, [partitions, currentTime]);

  const activePartitionUnderPlayhead = useMemo(() => {
    return partitions.find(p => currentTime >= p.start && currentTime <= p.end);
  }, [partitions, currentTime]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop autocut-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(5, 7, 12, 0.88)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="autocut-modal-container"
        style={{
          width: '95vw',
          maxWidth: '1440px',
          height: '92vh',
          maxHeight: '940px',
          background: '#0d1117',
          border: '1px solid rgba(6, 182, 212, 0.35)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(6, 182, 212, 0.15)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* 1. MODAL TOP HEADER */}
        <div
          style={{
            padding: '12px 20px',
            background: 'linear-gradient(90deg, #131926 0%, #0d121c 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #06b6d4, #f43f5e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)'
              }}
            >
              <Scissors size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.01em' }}>
                  Recortes Automáticos IA
                </h3>
                <span style={{ fontSize: '10px', background: 'rgba(6, 182, 212, 0.2)', color: '#38bdf8', border: '1px solid rgba(6, 182, 212, 0.4)', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>
                  {analysisData?.transcriptionProvider === 'gemini'
                    ? 'Gemini 2.0 Flash • Alta Precisión'
                    : (analysisData?.transcriptionProvider === 'guide'
                      ? 'Guion de Línea Guía'
                      : (analysisData?.transcriptionProvider === 'vad'
                        ? 'Detección VAD por Onda Acústica'
                        : 'Smart Rough Cut • Whisper Local'))}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                Detecta y elimina silencios, pausas de respiración y tomas repetidas en los clips seleccionados
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar & Switch Model in Header (only when editor is loaded) */}
          {stage === 'preview_editor' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* CEREBRO EDITOR IA BUTTON */}
              <button
                type="button"
                onClick={handleTriggerEditorBrain}
                disabled={isBrainRunning}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(6, 182, 212, 0.25))',
                  border: '1.5px solid #c084fc',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: isBrainRunning ? 'wait' : 'pointer',
                  boxShadow: '0 0 16px rgba(168, 85, 247, 0.35)',
                  transition: 'all 0.2s ease'
                }}
                title="Ejecuta el Cerebro Editor IA: analiza equivocaciones ('me equivoqué'), falsos inicios y alinea cortes a las caídas de onda acústica"
              >
                <Brain size={14} color="#e879f9" />
                <span>{isBrainRunning ? 'Razonando Edición...' : '🧠 Cerebro Editor IA'}</span>
                <span style={{ fontSize: '9px', background: '#a855f7', color: '#fff', borderRadius: '4px', padding: '1px 5px', fontWeight: 800 }}>
                  Mini-Agente
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStage('setup')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  color: '#38bdf8',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Cambiar el nivel de Whisper o motor y re-analizar"
              >
                <RotateCcw size={12} />
                <span>Cambiar modelo / Re-analizar</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#161e2e', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <Clock size={12} color="#94a3b8" />
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Original:</span>
                <strong style={{ fontSize: '11px', color: '#e2e8f0', fontFamily: 'monospace' }}>{formatTimecode(stats.totalDuration)}</strong>
                <ArrowRight size={11} color="#64748b" />
                <span style={{ fontSize: '11px', color: '#34d399' }}>Editado:</span>
                <strong style={{ fontSize: '11px', color: '#34d399', fontFamily: 'monospace' }}>{formatTimecode(stats.keptDuration)}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 8px', borderRadius: '6px' }}>
                <Sparkles size={12} color="#10b981" />
                <strong style={{ fontSize: '11px', color: '#10b981' }}>
                  -{stats.cutDuration.toFixed(1)}s ({stats.percentSaved}% menos)
                </strong>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="btn-ghost icon-only"
            style={{ color: '#94a3b8', padding: '4px', borderRadius: '6px' }}
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. BODY CONTENT */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* A. ANALYZING / LOADING SCREEN */}
          {stage === 'analyzing' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                textAlign: 'center',
                gap: '20px'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: 'rgba(6, 182, 212, 0.12)',
                  border: '1.5px solid rgba(6, 182, 212, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#06b6d4',
                  boxShadow: '0 0 30px rgba(6, 182, 212, 0.25)',
                  animation: 'pulse 2s infinite'
                }}
              >
                <Scissors size={32} />
              </div>

              <div style={{ maxWidth: '420px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '17px', color: '#f1f5f9', fontWeight: 600 }}>
                  Procesando Recortes Automáticos
                </h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                  {progress.message || 'Extrayendo pistas y detectando silencios...'}
                </p>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${progress.percent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #06b6d4, #10b981)',
                      borderRadius: '4px',
                      transition: 'width 0.25s ease'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                  <span>Procesando en tu navegador (100% privado)</span>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>{progress.percent}%</span>
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleClose}
                style={{ marginTop: '12px' }}
              >
                Cancelar
              </button>
            </div>
          )}

          {/* SETUP SCREEN: Choose Whisper level & parameters */}
          {stage === 'setup' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* Top Banner info */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '14px 18px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
                    <Film size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f1f5f9' }}>
                      {targetClipsInfo.length} {targetClipsInfo.length === 1 ? 'clip listo para recortar' : 'clips listos en la línea de tiempo'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Duración total a procesar: <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{formatTimecode(targetClipsSpan.duration)}</strong> ({targetClipsSpan.duration}s)
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
                  <Sparkles size={14} color="#f43f5e" />
                  <span>Detección automática de silencios, tomas repetidas y pausas de respiración</span>
                </div>
              </div>

              {errorMessage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '12px 16px', borderRadius: '8px', color: '#fca5a5', fontSize: '13px' }}>
                  <AlertTriangle size={16} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Step 1: Model Choice */}
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', fontWeight: 600 }}>
                    1. Selecciona el Nivel de Transcripción Whisper / Motor de Detección
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Elige el modelo según la potencia de tu equipo y la precisión fonética que buscas:
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  {AVAILABLE_MODELS.map(m => {
                    const isSelected = selectedModel === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        style={{
                          background: isSelected ? 'rgba(6, 182, 212, 0.12)' : '#161e2e',
                          border: isSelected ? '1.5px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          padding: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: isSelected ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? '#38bdf8' : '#94a3b8' }}>
                              {m.icon}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#f8fafc' : '#cbd5e1' }}>
                                {m.title}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                {m.specs}
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: m.badgeBg, color: m.badgeColor, border: `1px solid ${m.badgeBorder}` }}>
                            {m.badge}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.45 }}>
                          {m.description}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Gemini API Key input if Gemini is selected */}
                {selectedModel === 'gemini' && (
                  <div style={{ marginTop: '14px', background: '#111827', border: '1px solid rgba(6, 182, 212, 0.35)', borderRadius: '10px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>
                      <Key size={14} />
                      <span>Clave API de Google Gemini (Gratis en Google AI Studio):</span>
                    </div>
                    <input
                      type="password"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      placeholder="Pega aquí tu clave API (ej. AIzaSy...)"
                      style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '12px' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Se guardará de forma segura en tu navegador para futuros análisis de este y otros proyectos.
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Cut Sensitivity */}
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', fontWeight: 600 }}>
                    2. Sensibilidad y Margen de Silencios
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Controla la duración de pausas que se considerarán silencio y la holgura alrededor de cada palabra:
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', background: '#161e2e', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '18px 20px' }}>
                  {/* Min Silence Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                      <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Pausa mínima de silencio:</span>
                      <strong style={{ color: '#06b6d4', fontFamily: 'monospace' }}>{minSilenceDuration.toFixed(2)}s</strong>
                    </div>
                    <input
                      type="range"
                      min="0.20"
                      max="1.00"
                      step="0.05"
                      value={minSilenceDuration}
                      onChange={(e) => setMinSilenceDuration(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: '#06b6d4' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      Pausas y respiraciones mayores a este tiempo se recortarán automáticamente.
                    </div>
                  </div>

                  {/* Padding Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                      <span style={{ color: '#cbd5e1', fontWeight: 500 }}>Margen de respiro (Padding):</span>
                      <strong style={{ color: '#10b981', fontFamily: 'monospace' }}>{paddingMs} ms</strong>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="250"
                      step="10"
                      value={paddingMs}
                      onChange={(e) => setPaddingMs(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: '#10b981' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      Espacio de aire conservado antes y después de cada frase para evitar cortes bruscos.
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Cerebro Editor IA Option */}
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', fontWeight: 600 }}>
                    3. Cerebro Editor IA (Mini-Agente de Razonamiento)
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    Aplica criterio editorial para detectar errores de habla y alinear a los valles de la onda de audio:
                  </p>
                </div>

                <div
                  onClick={() => setUseBrainOnAnalysis(!useBrainOnAnalysis)}
                  style={{
                    background: useBrainOnAnalysis ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(6, 182, 212, 0.15))' : '#161e2e',
                    border: useBrainOnAnalysis ? '1.5px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    transition: 'all 0.2s ease',
                    boxShadow: useBrainOnAnalysis ? '0 0 25px rgba(168, 85, 247, 0.2)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: useBrainOnAnalysis ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.05)', border: useBrainOnAnalysis ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: useBrainOnAnalysis ? '#e879f9' : '#94a3b8' }}>
                      <Brain size={22} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h5 style={{ margin: 0, fontSize: '13.5px', color: '#f8fafc', fontWeight: 700 }}>
                          Razonar Edición con Cerebro IA
                        </h5>
                        <span style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.3)', color: '#e879f9', border: '1px solid rgba(168, 85, 247, 0.5)', borderRadius: '4px', padding: '1px 6px', fontWeight: 700 }}>
                          Recomendado
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: '#cbd5e1', lineHeight: 1.45 }}>
                        Detecta automáticamente equivocaciones verbales ("me equivoqué", "espera", "va de nuevo"), frases inconclusas y descarta la toma fallida hasta la retoma limpia, ajustando cada corte al valle de la onda de audio.
                      </p>
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={useBrainOnAnalysis}
                    onChange={(e) => setUseBrainOnAnalysis(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: '#a855f7', width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                  />
                </div>
              </div>

              {/* Step 4: Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleClose}
                  style={{ padding: '10px 18px' }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleStartAnalysis(selectedModel)}
                  style={{
                    padding: '10px 24px',
                    background: 'linear-gradient(135deg, #06b6d4, #f43f5e)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '13px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(6, 182, 212, 0.35)',
                    cursor: 'pointer'
                  }}
                >
                  <Sparkles size={16} />
                  Iniciar Análisis y Recortes IA
                </button>
              </div>
            </div>
          )}

          {/* C. MINI-EDITOR WORKSPACE (MAIN VIEW) */}
          {stage === 'preview_editor' && analysisData && (
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
              {/* LEFT / CENTER: Video Monitor + Mini Timeline Scrubber (58% width) */}
              <div
                style={{
                  flex: '1 1 58%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                  background: '#090d14',
                  minWidth: 0
                }}
              >
                {/* 1. Video Monitor Preview Stage */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    background: '#000000',
                    overflow: 'hidden'
                  }}
                >
                  {videoUrl ? (
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={() => setIsPlaying(false)}
                      muted={isMuted}
                      playbackRate={playbackRate}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain'
                      }}
                      onClick={togglePlayPause}
                    />
                  ) : (
                    <div style={{ color: '#64748b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Film size={20} />
                      <span>Cargando previsualización del video...</span>
                    </div>
                  )}

                  {/* Cut / Kept Indicator Badge on Monitor */}
                  {activePartitionUnderPlayhead && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: activePartitionUnderPlayhead.isCut
                          ? 'rgba(239, 68, 68, 0.85)'
                          : 'rgba(16, 185, 129, 0.85)',
                        color: '#ffffff',
                        backdropFilter: 'blur(8px)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
                      }}
                    >
                      {activePartitionUnderPlayhead.isCut ? (
                        <>
                          <Scissors size={12} />
                          <span>RECORTADO (Se eliminará)</span>
                        </>
                      ) : (
                        <>
                          <Check size={12} />
                          <span>CONSERVADO</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Synchronized Subtitles Box Over Video */}
                  {currentSubtitleText && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '24px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0, 0, 0, 0.75)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#ffffff',
                        padding: '6px 16px',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: '600',
                        textAlign: 'center',
                        maxWidth: '85%',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                      }}
                    >
                      {currentSubtitleText}
                    </div>
                  )}
                </div>

                {/* 2. Video Player Control Bar */}
                <div
                  style={{
                    padding: '8px 16px',
                    background: '#111622',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-ghost icon-only"
                      onClick={() => handleSeek(currentTime - 2)}
                      title="Retroceder 2s (Flecha Izquierda)"
                      style={{ padding: '6px' }}
                    >
                      <SkipBack size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={togglePlayPause}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: '#06b6d4',
                        border: 'none',
                        color: '#000000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                      title="Reproducir / Pausar (Barra Espaciadora)"
                    >
                      {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
                    </button>

                    <button
                      type="button"
                      className="btn-ghost icon-only"
                      onClick={() => handleSeek(currentTime + 2)}
                      title="Avanzar 2s (Flecha Derecha)"
                      style={{ padding: '6px' }}
                    >
                      <SkipForward size={15} />
                    </button>

                    <span style={{ fontSize: '12px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: '600', marginLeft: '6px' }}>
                      {formatTimecode(currentTime)}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>/</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      {formatTimecode(analysisData.totalSpanDuration)}
                    </span>
                  </div>

                  {/* Preview Mode Toggle: Skip Cuts automatically */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={skipCutsInPreview}
                        onChange={(e) => setSkipCutsInPreview(e.target.checked)}
                        style={{ accentColor: '#06b6d4' }}
                      />
                      <span>Saltar cortes al previsualizar</span>
                    </label>

                    <button
                      type="button"
                      className="btn-ghost icon-only"
                      onClick={() => setIsMuted(!isMuted)}
                      title={isMuted ? 'Activar sonido' : 'Silenciar'}
                      style={{ padding: '6px' }}
                    >
                      {isMuted ? <VolumeX size={15} color="#f43f5e" /> : <Volume2 size={15} />}
                    </button>
                  </div>
                </div>

                {/* 3. MINI TIMELINE VISUAL STRIP (Interactive Cuts Scrubber with Millimetric Zoom) */}
                <div
                  style={{
                    padding: '12px 16px',
                    background: '#0d1117',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Scissors size={13} style={{ color: '#38bdf8' }} />
                        Línea de Cortes IA
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
                          Conservado
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#e879f9' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#c084fc' }} />
                          🧠 Poda Cerebro IA ({editorBrainCuts.length})
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f87171' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'rgba(239, 68, 68, 0.6)' }} />
                          Silencio ({partitions.filter(p => p.isCut && p.type === 'silence').length})
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'rgba(56, 189, 248, 0.7)' }} />
                          Onda RMS
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      {/* Independent Manual Silence Range Tuning Pill */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          borderRadius: '6px',
                          padding: '2px 8px'
                        }}
                        title="Calibra el rango de silencios acústicos. Se superpone en tiempo real sin borrar el trabajo del Cerebro IA."
                      >
                        <VolumeX size={12} style={{ color: '#f87171' }} />
                        <span style={{ fontSize: '10px', color: '#fca5a5', fontWeight: 600 }}>Pausas mín:</span>
                        <input
                          type="range"
                          min="0.15"
                          max="1.50"
                          step="0.05"
                          value={minSilenceDuration}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            handleRecomputePartitions({ minSilenceDuration: val });
                          }}
                          style={{
                            width: '56px',
                            height: '4px',
                            accentColor: '#ef4444',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ fontSize: '10px', color: '#ffffff', fontFamily: 'monospace', fontWeight: 700 }}>
                          {minSilenceDuration.toFixed(2)}s
                        </span>
                      </div>

                      {/* Timeline Zoom Toolbar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#64748b', fontSize: '10px', marginRight: '4px' }}>
                        Zoom Línea:
                      </span>
                      <button
                        type="button"
                        onClick={() => setTimelineZoom(prev => Math.max(1, Number((prev - 0.5).toFixed(1))))}
                        disabled={timelineZoom <= 1}
                        title="Alejar línea de tiempo (Zoom Out)"
                        style={{
                          background: timelineZoom <= 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                          color: timelineZoom <= 1 ? '#475569' : '#cbd5e1',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '4px',
                          padding: '3px 6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '11px',
                          cursor: timelineZoom <= 1 ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <ZoomOut size={13} />
                      </button>

                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.25"
                        value={timelineZoom}
                        onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                        title={`Zoom: ${timelineZoom.toFixed(2)}x`}
                        style={{
                          width: '76px',
                          height: '4px',
                          accentColor: '#38bdf8',
                          cursor: 'pointer'
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => setTimelineZoom(prev => Math.min(10, Number((prev + 0.5).toFixed(1))))}
                        disabled={timelineZoom >= 10}
                        title="Acercar línea de tiempo (Zoom In - Inspección Milimétrica)"
                        style={{
                          background: timelineZoom >= 10 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                          color: timelineZoom >= 10 ? '#475569' : '#cbd5e1',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '4px',
                          padding: '3px 6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '11px',
                          cursor: timelineZoom >= 10 ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <ZoomIn size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setTimelineZoom(1)}
                        title="Restablecer a vista completa (1.0x)"
                        style={{
                          background: timelineZoom > 1 ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.05)',
                          color: timelineZoom > 1 ? '#38bdf8' : '#94a3b8',
                          border: timelineZoom > 1 ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '4px',
                          padding: '2px 7px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {timelineZoom.toFixed(1)}x
                      </button>
                    </div>
                  </div>
                </div>

                  {/* Scrollable Container with Custom Sleek Scrollbar */}
                  <div
                    ref={timelineScrollContainerRef}
                    onWheel={handleTimelineWheel}
                    style={{
                      width: '100%',
                      overflowX: timelineZoom > 1 ? 'auto' : 'hidden',
                      overflowY: 'hidden',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      background: '#090d16',
                      position: 'relative'
                    }}
                  >
                    {/* Inner Track stretched according to timelineZoom */}
                    <div
                      ref={timelineStripRef}
                      onMouseDown={handleTimelineStripMouseDown}
                      style={{
                        height: '52px',
                        width: `${timelineZoom * 100}%`,
                        minWidth: '100%',
                        position: 'relative',
                        cursor: 'pointer',
                        display: 'flex',
                        userSelect: 'none',
                        background: '#070b12'
                      }}
                    >
                      {/* Visual Audio Waveform Envelope in Background */}
                      {analysisData.waveformPeaks && analysisData.waveformPeaks.length > 0 && (
                        <svg
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none',
                            zIndex: 1,
                            opacity: 0.5
                          }}
                          preserveAspectRatio="none"
                          viewBox={`0 0 ${analysisData.waveformPeaks.length} 100`}
                        >
                          {analysisData.waveformPeaks.map((peak, idx) => {
                            const h = Math.max(2, peak * 86);
                            const y = (100 - h) / 2;
                            return (
                              <rect
                                key={idx}
                                x={idx}
                                y={y}
                                width={0.85}
                                height={h}
                                fill="#38bdf8"
                              />
                            );
                          })}
                        </svg>
                      )}

                      {/* Time Ruler Ticks for Millimetric Precision */}
                      {timelineTicks.length > 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '14px',
                            pointerEvents: 'none',
                            zIndex: 4,
                            overflow: 'hidden'
                          }}
                        >
                          {timelineTicks.map((t) => {
                            const leftPct = (t / (analysisData.totalSpanDuration || 1)) * 100;
                            return (
                              <div
                                key={t}
                                style={{
                                  position: 'absolute',
                                  left: `${leftPct}%`,
                                  top: 0,
                                  height: '100%',
                                  borderLeft: '1px solid rgba(255, 255, 255, 0.22)',
                                  paddingLeft: '3px',
                                  fontSize: '9px',
                                  color: 'rgba(255, 255, 255, 0.45)',
                                  fontFamily: 'monospace',
                                  lineHeight: '12px',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {t}s
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {partitions.map((part) => {
                        const totalSpan = analysisData.totalSpanDuration || 1;
                        const widthPercent = (part.duration / totalSpan) * 100;
                        const isRepeat = Boolean(part.groupId);
                        const isBrainMistake = part.type === 'mistake_discard';
                        const isFalseStart = part.type === 'false_start';

                        let bg = 'rgba(16, 185, 129, 0.75)'; // Kept speech
                        let borderTop = 'none';

                        if (part.isCut) {
                          if (isBrainMistake) {
                            bg = 'repeating-linear-gradient(45deg, rgba(217, 70, 239, 0.5), rgba(217, 70, 239, 0.5) 6px, rgba(168, 85, 247, 0.75) 6px, rgba(168, 85, 247, 0.75) 12px)';
                            borderTop = '2px solid #e879f9';
                          } else if (isFalseStart) {
                            bg = 'repeating-linear-gradient(45deg, rgba(249, 115, 22, 0.45), rgba(249, 115, 22, 0.45) 6px, rgba(234, 88, 12, 0.7) 6px, rgba(234, 88, 12, 0.7) 12px)';
                            borderTop = '2px solid #fb923c';
                          } else {
                            bg = 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.45), rgba(239, 68, 68, 0.45) 6px, rgba(239, 68, 68, 0.7) 6px, rgba(239, 68, 68, 0.7) 12px)';
                            borderTop = '2px solid #ef4444';
                          }
                        } else if (isRepeat) {
                          bg = 'rgba(2, 132, 199, 0.85)';
                          borderTop = '2px solid #f59e0b';
                        }

                        // Check if block has enough rendered pixel space to show text snippet
                        const showBlockText = (widthPercent * timelineZoom) > 3.5;

                        return (
                          <div
                            key={part.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePartition(part.id);
                            }}
                            style={{
                              width: `${widthPercent}%`,
                              height: '100%',
                              background: bg,
                              borderRight: '1px solid rgba(0, 0, 0, 0.5)',
                              borderTop,
                              position: 'relative',
                              transition: 'opacity 0.15s ease',
                              opacity: part.isCut ? 0.75 : 0.95,
                              zIndex: 3,
                              display: 'flex',
                              alignItems: 'flex-end',
                              padding: '2px 4px',
                              overflow: 'hidden'
                            }}
                            title={`${part.text} (${part.duration}s)\n${part.isCut ? '✕ RECORTADO (Clic para recuperar)' : '✓ CONSERVADO (Clic para recortar)'}`}
                          >
                            {showBlockText && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  color: '#ffffff',
                                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  pointerEvents: 'none',
                                  opacity: 0.9
                                }}
                              >
                                {part.text || (part.isCut ? 'Corte' : 'Voz')}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Red Playhead Needle on Mini Timeline */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${(currentTime / (analysisData.totalSpanDuration || 1)) * 100}%`,
                          width: '2px',
                          background: '#ef4444',
                          boxShadow: '0 0 8px rgba(239, 68, 68, 0.9)',
                          pointerEvents: 'none',
                          zIndex: 10
                        }}
                      >
                        <div
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#ef4444',
                            position: 'absolute',
                            top: 0,
                            left: '-4px',
                            boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#64748b' }}>
                    <span>Haz clic en cualquier bloque de la línea para alternar entre recortar o conservar</span>
                    <span>Usa Ctrl + Rueda del ratón o el deslizador para zoom de 1x hasta 10x</span>
                  </div>
                </div>
              </div>

              {/* RIGHT: INSPECTOR & DECISION TABS (42% width) */}
              <div
                style={{
                  flex: '1 1 42%',
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#0d1117',
                  minWidth: 0,
                  overflow: 'hidden'
                }}
              >
                {/* Right Tab Navigation */}
                <div
                  style={{
                    display: 'flex',
                    background: '#111622',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '0 8px',
                    gap: '4px',
                    flexShrink: 0
                  }}
                >
                  <button
                    type="button"
                    className={`premiere-panel-tab ${activeTab === 'brain' ? 'active' : ''}`}
                    onClick={() => setActiveTab('brain')}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      color: activeTab === 'brain' ? '#e879f9' : '#cbd5e1'
                    }}
                  >
                    <Brain size={13} color={activeTab === 'brain' ? '#e879f9' : '#a855f7'} />
                    <span>Cerebro IA</span>
                    {editorBrainNotes.length > 0 && (
                      <span
                        style={{
                          marginLeft: '2px',
                          background: 'linear-gradient(135deg, #a855f7, #06b6d4)',
                          color: '#ffffff',
                          fontSize: '9px',
                          fontWeight: '800',
                          padding: '1px 5px',
                          borderRadius: '10px'
                        }}
                      >
                        {editorBrainCuts.length > 0 ? `${editorBrainCuts.length} cortes` : editorBrainNotes.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    className={`premiere-panel-tab ${activeTab === 'repeated' ? 'active' : ''}`}
                    onClick={() => setActiveTab('repeated')}
                    style={{ position: 'relative' }}
                  >
                    <span>Tomas Repetidas</span>
                    {repeatedGroups.length > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          background: '#f59e0b',
                          color: '#000000',
                          fontSize: '10px',
                          fontWeight: '800',
                          padding: '1px 5px',
                          borderRadius: '10px'
                        }}
                      >
                        {repeatedGroups.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    className={`premiere-panel-tab ${activeTab === 'transcript' ? 'active' : ''}`}
                    onClick={() => setActiveTab('transcript')}
                  >
                    <span>Transcripción & Cortes ({partitions.length})</span>
                  </button>

                  <button
                    type="button"
                    className={`premiere-panel-tab ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                  >
                    <Sliders size={12} style={{ marginRight: '4px' }} />
                    <span>Ajustes</span>
                  </button>
                </div>

                {/* Right Tab Content View */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* TAB 0: CEREBRO EDITOR IA */}
                  {activeTab === 'brain' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Hero Card */}
                      <div
                        style={{
                          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.16) 0%, rgba(6, 182, 212, 0.12) 100%)',
                          border: '1.5px solid rgba(168, 85, 247, 0.45)',
                          borderRadius: '10px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          boxShadow: '0 4px 20px rgba(168, 85, 247, 0.15)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.3)', border: '1px solid rgba(168, 85, 247, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e879f9', boxShadow: '0 0 12px rgba(168, 85, 247, 0.3)' }}>
                              <Brain size={18} />
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>
                                Cerebro Editor IA — Mini-Agente
                              </div>
                              <div style={{ fontSize: '11px', color: '#38bdf8' }}>
                                Razonamiento semántico + Valles de onda acústica
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleTriggerEditorBrain}
                            disabled={isBrainRunning}
                            style={{
                              background: '#a855f7',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 12px',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: isBrainRunning ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              boxShadow: '0 0 12px rgba(168, 85, 247, 0.4)'
                            }}
                          >
                            <Brain size={12} />
                            <span>{isBrainRunning ? 'Razonando...' : 'Re-razonar'}</span>
                          </button>
                        </div>

                        <p style={{ margin: 0, fontSize: '11.5px', color: '#cbd5e1', lineHeight: 1.45 }}>
                          Analiza el discurso de la persona: cuando dice <em>"me equivoqué"</em>, <em>"espera"</em>, risas o se traba, poda la toma fallida completa hasta la retoma limpia y fija los cortes justo en las caídas de sonido de la forma de onda.
                        </p>
                      </div>

                      {/* Superimposed Acoustic Silence Tuning Card (Independent Manual Layer) */}
                      <div
                        style={{
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: '0 2px 12px rgba(0,0,0,0.3)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <VolumeX size={15} style={{ color: '#f87171' }} />
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#f1f5f9' }}>
                              Capa Acústica de Silencios (Superpuesta)
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#f87171', fontFamily: 'monospace', fontWeight: 800 }}>
                            {minSilenceDuration.toFixed(2)} s
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                          El Cerebro IA se encarga exclusivamente del concepto (errores, retomas y tropiezos). Puedes calibrar o probar aquí los silencios acústicos en tiempo real sin borrar ni alterar los cortes de la IA.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                          <span style={{ fontSize: '9.5px', color: '#64748b' }}>0.15s (rápido)</span>
                          <input
                            type="range"
                            min="0.15"
                            max="1.50"
                            step="0.05"
                            value={minSilenceDuration}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              handleRecomputePartitions({ minSilenceDuration: val });
                            }}
                            style={{ flex: 1, accentColor: '#ef4444', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '9.5px', color: '#64748b' }}>1.50s (largo)</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#cbd5e1', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <span>🧠 Cortes IA preservados: <strong style={{ color: '#e879f9' }}>{editorBrainCuts.length}</strong></span>
                          <span>🔇 Silencios activos: <strong style={{ color: '#f87171' }}>{partitions.filter(p => p.isCut && p.type === 'silence').length}</strong></span>
                        </div>
                      </div>

                      {/* Notes / Bitácora Section */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sparkles size={14} color="#e879f9" />
                          <span>Bitácora de Razonamiento del Editor IA:</span>
                        </div>

                        {editorBrainNotes.length === 0 ? (
                          <div style={{ background: '#131824', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '11.5px' }}>
                            Haz clic en <strong>"Re-razonar"</strong> arriba para generar la bitácora editorial completa.
                          </div>
                        ) : (
                          editorBrainNotes.map((note, nIdx) => (
                            <div
                              key={nIdx}
                              style={{
                                background: '#131824',
                                border: '1px solid rgba(168, 85, 247, 0.25)',
                                borderRadius: '8px',
                                padding: '9px 12px',
                                fontSize: '11.5px',
                                color: '#e2e8f0',
                                lineHeight: 1.45,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px'
                              }}
                            >
                              <span>{note}</span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Smart Cuts Proposed by Brain */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#f8fafc' }}>
                            Cortes Razonados ({partitions.filter(p => p.isCut).length}):
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                            Alineados a la caída de onda
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {partitions.filter(p => p.isCut).map(cut => {
                            const isMistake = cut.type === 'mistake_discard';
                            const isFalseStart = cut.type === 'false_start';

                            return (
                              <div
                                key={cut.id}
                                style={{
                                  background: isMistake
                                    ? 'rgba(217, 70, 239, 0.08)'
                                    : (isFalseStart ? 'rgba(249, 115, 22, 0.08)' : 'rgba(239, 68, 68, 0.08)'),
                                  border: isMistake
                                    ? '1.5px solid rgba(217, 70, 239, 0.4)'
                                    : (isFalseStart ? '1.5px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(239, 68, 68, 0.25)'),
                                  borderRadius: '8px',
                                  padding: '9px 12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '10px'
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                    <span
                                      style={{
                                        fontSize: '9.5px',
                                        fontWeight: '800',
                                        color: isMistake ? '#f472b6' : (isFalseStart ? '#fb923c' : '#38bdf8'),
                                        background: isMistake ? 'rgba(217, 70, 239, 0.2)' : (isFalseStart ? 'rgba(249, 115, 22, 0.2)' : 'rgba(6, 182, 212, 0.2)'),
                                        padding: '1px 5px',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      {isMistake
                                        ? '⚠️ Equivocación ("me equivoqué")'
                                        : (isFalseStart ? '🔄 Falso Comienzo / Retoma' : '🌊 Pausa en Onda Acústica')}
                                    </span>

                                    <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                      {formatTimecode(cut.start)} - {formatTimecode(cut.end)} ({cut.duration}s)
                                    </span>
                                  </div>

                                  <div style={{ fontSize: '11px', color: '#f1f5f9', lineHeight: 1.35 }}>
                                    {cut.cutReason || cut.text}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button
                                    type="button"
                                    className="btn-ghost icon-only"
                                    onClick={() => handleSeek(cut.start)}
                                    title="Previsualizar corte en el monitor"
                                    style={{ padding: '4px' }}
                                  >
                                    <Play size={12} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleTogglePartition(cut.id)}
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: '600',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'rgba(16, 185, 129, 0.2)',
                                      color: '#34d399',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Recuperar
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* TAB 1: TOMAS REPETIDAS (RE-RECORDINGS RESOLVER) */}
                  {activeTab === 'repeated' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', padding: '10px', display: 'flex', gap: '8px' }}>
                        <HelpCircle size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '11.5px', color: '#fcd34d', lineHeight: 1.45 }}>
                          <strong>Detección de Misma Intención:</strong> La IA encontró frases re-grabadas o stumbles. Por defecto se conserva la última toma (la correcta) y se recorta la anterior. Puedes elegir con un clic cuál dejar.
                        </div>
                      </div>

                      {repeatedGroups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b', fontSize: '12px' }}>
                          <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                          No se detectaron tomas repetidas en los clips seleccionados.
                        </div>
                      ) : (
                        repeatedGroups.map((grp, gIdx) => (
                          <div
                            key={grp.id}
                            style={{
                              background: '#131824',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '10px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
                                Grupo {gIdx + 1}: Intento re-grabado
                              </span>
                              <span style={{ fontSize: '10.5px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                {formatTimecode(grp.start)} - {formatTimecode(grp.end)}
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {grp.takes.map((take, tIdx) => (
                                <div
                                  key={take.id}
                                  style={{
                                    background: take.isChosen
                                      ? 'rgba(16, 185, 129, 0.12)'
                                      : 'rgba(239, 68, 68, 0.08)',
                                    border: take.isChosen
                                      ? '1.5px solid #10b981'
                                      : '1px solid rgba(239, 68, 68, 0.25)',
                                    borderRadius: '8px',
                                    padding: '8px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '10px'
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                      <span
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          color: take.isChosen ? '#10b981' : '#f87171',
                                          textTransform: 'uppercase'
                                        }}
                                      >
                                        Toma {take.takeNumber} {take.isRecommended ? '★ Recomendada' : '(Error / Falso inicio)'}
                                      </span>
                                      <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                                        {formatTimecode(take.start)}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: take.isChosen ? '#ffffff' : '#94a3b8', textDecoration: take.isChosen ? 'none' : 'line-through' }}>
                                      "{take.text}"
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn-ghost icon-only"
                                      onClick={() => handleSeek(take.start)}
                                      title="Escuchar esta toma"
                                      style={{ padding: '4px' }}
                                    >
                                      <Play size={13} />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleChooseTake(grp.id, tIdx)}
                                      style={{
                                        background: take.isChosen ? '#10b981' : '#1e293b',
                                        color: take.isChosen ? '#000000' : '#ffffff',
                                        border: 'none',
                                        borderRadius: '5px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      {take.isChosen ? <Check size={12} /> : null}
                                      <span>{take.isChosen ? 'Esta sí' : 'Elegir esta'}</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB 2: INTERACTIVE TRANSCRIPT & CUTS LIST */}
                  {activeTab === 'transcript' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Sub-filter bar */}
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                        {[
                          { id: 'all', label: 'Todos los fragmentos' },
                          { id: 'cut', label: `Solo Recortados (${stats.totalCuts})` },
                          { id: 'kept', label: 'Solo Conservados' }
                        ].map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setTranscriptFilter(f.id)}
                            style={{
                              padding: '3px 8px',
                              fontSize: '10px',
                              borderRadius: '4px',
                              border: transcriptFilter === f.id ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                              background: transcriptFilter === f.id ? 'rgba(6, 182, 212, 0.2)' : '#161b26',
                              color: transcriptFilter === f.id ? '#38bdf8' : '#94a3b8',
                              cursor: 'pointer'
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      {/* Partitions List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {partitions
                          .filter(p => {
                            if (transcriptFilter === 'cut') return p.isCut;
                            if (transcriptFilter === 'kept') return !p.isCut;
                            return true;
                          })
                          .map(part => (
                            <div
                              key={part.id}
                              style={{
                                background: part.isCut ? 'rgba(239, 68, 68, 0.08)' : '#131824',
                                border: part.isCut ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: '6px',
                                padding: '8px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                  <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                                    {formatTimecode(part.start)} - {formatTimecode(part.end)} ({part.duration}s)
                                  </span>
                                  {part.isCut && (
                                    <span style={{ fontSize: '9px', background: 'rgba(239, 68, 68, 0.25)', color: '#f87171', padding: '1px 4px', borderRadius: '3px' }}>
                                      {part.cutReason || 'Recorte'}
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: '11.5px',
                                    color: part.isCut ? '#94a3b8' : '#f1f5f9',
                                    textDecoration: part.isCut ? 'line-through' : 'none'
                                  }}
                                >
                                  {part.text}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="btn-ghost icon-only"
                                  onClick={() => handleSeek(part.start)}
                                  title="Reproducir desde aquí"
                                  style={{ padding: '4px' }}
                                >
                                  <Play size={12} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleTogglePartition(part.id)}
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: part.isCut ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                    color: part.isCut ? '#34d399' : '#f87171',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {part.isCut ? 'Recuperar' : 'Cortar'}
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: SETTINGS & FINE TUNING (PADDING & THRESHOLDS) */}
                  {activeTab === 'settings' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Safety Padding (Holgura) Slider */}
                      <div style={{ background: '#131824', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                            Margen de respiro / Holgura (Padding)
                          </span>
                          <span style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
                            {paddingMs} ms
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="400"
                          step="10"
                          value={paddingMs}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setPaddingMs(val);
                            handleRecomputePartitions({ paddingMs: val });
                          }}
                          style={{ width: '100%', accentColor: '#06b6d4' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                          <span>0ms (Corte ajustado)</span>
                          <span>150ms (Recomendado)</span>
                          <span>400ms (Muy holgado)</span>
                        </div>
                        <p style={{ margin: '6px 0 0 0', fontSize: '10.5px', color: '#94a3b8', lineHeight: 1.4 }}>
                          Evita que las palabras se corten de forma brusca o que se pierda la toma de aire al iniciar la frase.
                        </p>
                      </div>

                      {/* Minimum Silence Threshold Slider */}
                      <div style={{ background: '#131824', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                            Umbral mínimo de silencio
                          </span>
                          <span style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
                            {minSilenceDuration.toFixed(2)} s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.25"
                          max="1.50"
                          step="0.05"
                          value={minSilenceDuration}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setMinSilenceDuration(val);
                            handleRecomputePartitions({ minSilenceDuration: val });
                          }}
                          style={{ width: '100%', accentColor: '#06b6d4' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                          <span>0.25s (Recorta micro-pausas)</span>
                          <span>0.45s (Estándar)</span>
                          <span>1.50s (Solo silencios largos)</span>
                        </div>
                      </div>

                      {/* Toggles */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#131824', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                          <div>
                            <div style={{ fontSize: '11.5px', color: '#f1f5f9', fontWeight: 600 }}>Eliminar pausas de respiración y silencios</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Corta silencios mayores al umbral configurado</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={filterSilences}
                            onChange={(e) => {
                              setFilterSilences(e.target.checked);
                              handleRecomputePartitions({ filterSilences: e.target.checked });
                            }}
                            style={{ accentColor: '#06b6d4', width: '16px', height: '16px' }}
                          />
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#131824', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                          <div>
                            <div style={{ fontSize: '11.5px', color: '#f1f5f9', fontWeight: 600 }}>Descartar tomas repetidas / fallidas</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Detecta stumbles y re-grabaciones de la misma intención</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={filterRepeatedTakes}
                            onChange={(e) => {
                              setFilterRepeatedTakes(e.target.checked);
                              handleRecomputePartitions({ filterRepeatedTakes: e.target.checked });
                            }}
                            style={{ accentColor: '#06b6d4', width: '16px', height: '16px' }}
                          />
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#131824', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                          <div>
                            <div style={{ fontSize: '11.5px', color: '#f1f5f9', fontWeight: 600 }}>Eliminar muletillas y vacilaciones</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Corta automáticamente "eh", "um", "ah", "este..."</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={filterFillerWords}
                            onChange={(e) => {
                              setFilterFillerWords(e.target.checked);
                              handleRecomputePartitions({ filterFillerWords: e.target.checked });
                            }}
                            style={{ accentColor: '#06b6d4', width: '16px', height: '16px' }}
                          />
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#131824', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                          <div>
                            <div style={{ fontSize: '11.5px', color: '#f1f5f9', fontWeight: 600 }}>Cierre de rizo magnético (Ripple Delete)</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Junta las partes conservadas para que no queden huecos vacíos</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={rippleClose}
                            onChange={(e) => setRippleClose(e.target.checked)}
                            style={{ accentColor: '#06b6d4', width: '16px', height: '16px' }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. MODAL FOOTER */}
        <div
          style={{
            padding: '12px 20px',
            background: '#131926',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0
          }}
        >
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            {stage === 'preview_editor' && (
              <span>
                💡 Puedes deshacer este corte en cualquier momento presionando <strong style={{ color: '#ffffff' }}>Ctrl+Z</strong>.
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClose}
            >
              Cancelar
            </button>

            {stage === 'preview_editor' && (
              <button
                type="button"
                className="btn-primary"
                onClick={handleApplyCutsToTimeline}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4, #f43f5e)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '8px 18px',
                  boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)'
                }}
              >
                <Scissors size={14} style={{ marginRight: '6px' }} />
                <span>Aplicar Recortes a la Línea de Tiempo</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
