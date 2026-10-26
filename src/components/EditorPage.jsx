import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Save,
  Download,
  Settings,
  Film,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Sliders,
  FileText,
  Undo2,
  Redo2,
  Trash2,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  CloudUpload,
  CloudOff,
  Loader2,
  ShieldCheck,
  RefreshCw,
  Volume2,
  Share2,
  Check,
  Eye,
  KeyRound,
  Lock
} from 'lucide-react';
import { MediaLibrary } from './MediaLibrary';
import { ClipInspector } from './ClipInspector';
import { PreviewPlayer } from './PreviewPlayer';
import { Timeline } from './Timeline';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { ExportModal } from './ExportModal';
import { TranscribeModal } from './TranscribeModal';
import { TranscriptPanel } from './TranscriptPanel';
import { AudioMixerPanel } from './AudioMixerPanel';
import { EffectControlsPanel } from './EffectControlsPanel';
import { LumetriColorPanel } from './LumetriColorPanel';
import { SceneDirectorModal } from './SceneDirectorModal';
import { GraphicDirectorModal } from './GraphicDirectorModal';
import { AutoCutModal } from './AutoCutModal';
import { SceneStoryboardPanel } from './SceneStoryboardPanel';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { AutoBrollBatchModal } from './AutoBrollBatchModal';
import { StockMediaSearchModal } from './StockMediaSearchModal';
import { saveProjectToDisk, hasDiskFileHandle } from '../utils/fileSystem';
import { saveDiskProject } from '../services/localProjectService';
import { saveProjectToCache, getCachedProject, getMediaBlob, saveMediaBlob } from '../utils/storage';
import { tabLockCoordinator } from '../utils/tabLockCoordinator';
import { getAutosaveConfig, saveAutosaveConfig } from '../utils/autosaveConfig';
import { AutosaveSettingsModal } from './AutosaveSettingsModal';
import { extractAudioTrackToWavBlob } from '../utils/audioExtractor';
import { extractWaveformData } from '../utils/audioWaveform';
import { addAssetToTimeline, sanitizeDuplicateSceneClips, separateAudioFromClip, unlinkClips } from '../utils/timelineOps';
import { migrateProjectMediaPaths, resolveProjectAssetsOnDisk } from '../utils/stockMediaClient';
import {
  clearScenesFromProject,
  deleteSingleScene,
  clearGuideTrackFromProject,
  deleteTrackFromProject,
  clearTimelineClips,
  resolveRealSceneTimelinePosition
} from '../utils/sceneOps';
import { isSubtitleClip, updateSubtitleClipWithBatchSync } from '../utils/transcriptOps';
import { UserNav } from './UserNav';
import { useRouter } from '../context/RouterContext';

export function EditorPage({
  initialProject,
  onBackToHome,
  currentDirHandle,
  onGoToAuth
}) {
  const prepareProject = (p) => migrateProjectMediaPaths(sanitizeDuplicateSceneClips(p));
  const [project, setProject] = useState(() => prepareProject(initialProject));

  useEffect(() => {
    if (initialProject) {
      setProject(prepareProject(initialProject));
    }
  }, [initialProject]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState([]);
  const selectedClipId = selectedClipIds[selectedClipIds.length - 1] || null;
  const setSelectedClipId = useCallback((idOrUpdater) => {
    if (typeof idOrUpdater === 'function') {
      setSelectedClipIds(prev => {
        const current = prev[prev.length - 1] || null;
        const next = idOrUpdater(current);
        return next ? [next] : [];
      });
    } else if (!idOrUpdater) {
      setSelectedClipIds([]);
    } else {
      setSelectedClipIds(prev => {
        if (prev.includes(idOrUpdater)) {
          return [...prev.filter(id => id !== idOrUpdater), idOrUpdater];
        }
        return [idOrUpdater];
      });
    }
  }, []);
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const selectedClipIdsRef = useRef(selectedClipIds);
  selectedClipIdsRef.current = selectedClipIds;
  const selectedClipIdRef = useRef(selectedClipId);

  const { queryParams, setQueryParam, copyShareUrl } = useRouter();
  const initialTabFromUrl = queryParams?.get('tab');
  const validInitialTab = (initialTabFromUrl === 'transcript' || initialTabFromUrl === 'scenes' || initialTabFromUrl === 'library')
    ? initialTabFromUrl
    : 'library';

  const [activeSidebarTab, setActiveSidebarTab] = useState(validInitialTab); // 'library' | 'transcript' | 'scenes'
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [activeRightTab, setActiveRightTab] = useState('effects'); // 'effects' | 'lumetri' | 'graphics' | 'mixer'
  const [activeWorkspacePreset, setActiveWorkspacePreset] = useState('ESSENTIALS'); // 'ESSENTIALS' | 'COLOR' | 'AUDIO' | 'AI'
  const [focusedPanel, setFocusedPanel] = useState('timeline'); // 'left' | 'center' | 'right' | 'timeline'
  const [rightDockWidth, setRightDockWidth] = useState(335);
  const [mountedTabs, setMountedTabs] = useState({
    library: true,
    inspector: true,
    scenes: true,
    [validInitialTab]: true
  });
  const [shareCopied, setShareCopied] = useState(false);

  // Update browser tab title to reflect active project name
  useEffect(() => {
    if (project?.name) {
      document.title = `${project.name} • Montage Studio`;
    }
    return () => {
      document.title = 'Montage Studio - Editor de Video';
    };
  }, [project?.name]);

  const handleShareProject = useCallback(() => {
    if (!project?.id) return;
    copyShareUrl(project.id);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2400);
  }, [project?.id, copyShareUrl]);

  const handleSelectSidebarTab = useCallback((tab) => {
    if (tab === 'inspector') {
      setMountedTabs(prev => prev.inspector ? prev : { ...prev, inspector: true });
      setActiveRightTab(prev => (prev === 'mixer' ? 'effects' : prev));
      setFocusedPanel('right');
      return;
    }
    if (tab === 'mixer') {
      setMountedTabs(prev => prev.mixer ? prev : { ...prev, mixer: true });
      setActiveRightTab('mixer');
      setFocusedPanel('right');
      return;
    }
    setMountedTabs(prev => prev[tab] ? prev : { ...prev, [tab]: true });
    React.startTransition(() => {
      setActiveSidebarTab(tab);
      setFocusedPanel('left');
    });
    setQueryParam('tab', tab);
  }, [setQueryParam]);

  const handleSelectScene = useCallback((sceneOrClip) => {
    if (!sceneOrClip) {
      setSelectedSceneId(null);
      return;
    }
    const sceneId = typeof sceneOrClip === 'string' ? sceneOrClip : (sceneOrClip.id || sceneOrClip.sceneId);
    const scenesList = project.scenes?.list || [];
    const sNum = sceneOrClip.sceneNumber ? Number(sceneOrClip.sceneNumber) : null;
    const nameMatch = sceneOrClip.name?.match(/\[E\s*0*(\d+)\]/i) || sceneOrClip.title?.match(/\[E\s*0*(\d+)\]/i);
    const extractedNum = nameMatch ? Number(nameMatch[1]) : null;
    const targetNum = sNum || extractedNum;

    const matchedScene = scenesList.find(s =>
      s.id === sceneId ||
      s.id === sceneOrClip.sceneId ||
      (targetNum && Number(s.sceneNumber) === targetNum)
    ) || (typeof sceneOrClip === 'object' ? sceneOrClip : null);

    const finalSceneId = matchedScene?.id || sceneId;
    setSelectedSceneId(finalSceneId);

    // Switch left panel tab directly to 'scenes' (Escenas IA)
    handleSelectSidebarTab('scenes');

    // Sync timeline clip selection if a corresponding clip is in scene track
    const sceneTrack = (project.tracks || []).find(t => t.type === 'scene');
    if (sceneTrack && Array.isArray(sceneTrack.clips)) {
      const matchingClip = sceneTrack.clips.find(c =>
        c.id === finalSceneId ||
        c.sceneId === finalSceneId ||
        (matchedScene?.sceneNumber && Number(c.sceneNumber) === Number(matchedScene.sceneNumber))
      );
      if (matchingClip && selectedClipIdRef.current !== matchingClip.id) {
        setSelectedClipIds([matchingClip.id]);
      }
    }

    if (matchedScene && typeof matchedScene.startTime === 'number') {
      setCurrentTime(matchedScene.startTime);
    }
  }, [project.scenes?.list, project.tracks, handleSelectSidebarTab, setCurrentTime, setSelectedClipIds]);

  const handleRightDockResizerMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightDockWidth;
    const onMove = (ev) => {
      const deltaX = startX - ev.clientX;
      const nextW = Math.max(270, Math.min(540, Math.round(startW + deltaX)));
      setRightDockWidth(nextW);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const [autosaveConfig, setAutosaveConfig] = useState(getAutosaveConfig);
  const [autosaveStatus, setAutosaveStatus] = useState('saved'); // 'saved' | 'saving' | 'pending' | 'disabled' | 'error'
  const [lastSavedTime, setLastSavedTime] = useState(() => new Date());
  const [showAutosaveModal, setShowAutosaveModal] = useState(false);
  const isDirtyRef = useRef(false);
  const isAutosavingRef = useRef(false);
  const autosaveTimeoutRef = useRef(null);
  const [isSaved, setIsSaved] = useState(true);
  const [saveStatusText, setSaveStatusText] = useState('Autoguardado en almacenamiento local');
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTranscribeModal, setShowTranscribeModal] = useState(false);
  const [showSceneDirectorModal, setShowSceneDirectorModal] = useState(false);
  const [showGraphicDirectorModal, setShowGraphicDirectorModal] = useState(false);
  const [showGlobalSettingsModal, setShowGlobalSettingsModal] = useState(false);
  const [showAutoCutModal, setShowAutoCutModal] = useState(false);
  const [showAutoBrollBatchModal, setShowAutoBrollBatchModal] = useState(false);
  const [selectedSceneForBrollModal, setSelectedSceneForBrollModal] = useState(null);
  const [graphicTargetScene, setGraphicTargetScene] = useState(null);
  const [toast, setToast] = useState(null); // { message: string, type: 'success' | 'info' | 'error' }
  const toastTimeoutRef = useRef(null);

  // Timeline Resizing and Expand State
  const [timelineHeight, setTimelineHeight] = useState(() => {
    try {
      const saved = localStorage.getItem('montage_timeline_height');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 160 && parsed <= 850) {
          return parsed;
        }
      }
    } catch {
      // fallback to default
    }
    return 300;
  });
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);
  const savedNormalHeightRef = useRef(300);

  // Resize Dragging
  const handleResizerMouseDown = (e) => {
    e.preventDefault();
    setIsResizingTimeline(true);
    const startY = e.clientY;
    const startHeight = timelineHeight;

    const handleMouseMove = (moveEvent) => {
      // Dragging upward increases height; dragging downward decreases it
      const deltaY = startY - moveEvent.clientY;
      const minH = 160;
      const maxH = Math.max(minH + 100, window.innerHeight - 180);
      const newHeight = Math.max(minH, Math.min(maxH, Math.round(startHeight + deltaY)));
      setTimelineHeight(newHeight);
      try {
        localStorage.setItem('montage_timeline_height', newHeight.toString());
      } catch {
        // ignore
      }
      if (newHeight < 420) {
        setIsTimelineExpanded(false);
      }
    };

    const handleMouseUp = () => {
      setIsResizingTimeline(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Toggle Maximize / Normal
  const handleToggleMaximizeTimeline = () => {
    if (isTimelineExpanded) {
      setIsTimelineExpanded(false);
      const targetH = savedNormalHeightRef.current || 300;
      setTimelineHeight(targetH);
      try {
        localStorage.setItem('montage_timeline_height', targetH.toString());
      } catch {
        // ignore
      }
    } else {
      savedNormalHeightRef.current = timelineHeight;
      setIsTimelineExpanded(true);
      const expandedH = Math.max(450, Math.min(window.innerHeight - 180, Math.round(window.innerHeight * 0.65)));
      setTimelineHeight(expandedH);
      try {
        localStorage.setItem('montage_timeline_height', expandedH.toString());
      } catch {
        // ignore
      }
    }
  };

  // Adjust timeline height if window is resized smaller than timeline
  useEffect(() => {
    const handleResize = () => {
      setTimelineHeight((prev) => {
        const maxH = Math.max(160, window.innerHeight - 180);
        return prev > maxH ? maxH : prev;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Class on body during resize to avoid text selection and maintain cursor
  useEffect(() => {
    if (isResizingTimeline) {
      document.body.classList.add('is-resizing-timeline');
    } else {
      document.body.classList.remove('is-resizing-timeline');
    }
    return () => {
      document.body.classList.remove('is-resizing-timeline');
    };
  }, [isResizingTimeline]);

  // Sidebar Width Resizing & Expand State
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('montage_sidebar_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 280 && parsed <= 900) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return 380;
  });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const savedNormalWidthRef = useRef(380);

  // Handle Sidebar Horizontal Resizing
  const handleSidebarResizerMouseDown = (e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    const startX = e.clientX;
    const startW = sidebarWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const minW = 280;
      const maxW = Math.max(minW + 100, Math.min(950, Math.round(window.innerWidth * 0.65)));
      const newWidth = Math.max(minW, Math.min(maxW, Math.round(startW + deltaX)));
      setSidebarWidth(newWidth);
      try {
        localStorage.setItem('montage_sidebar_width', newWidth.toString());
      } catch {
        // ignore
      }
      if (newWidth < 460) {
        setIsSidebarExpanded(false);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Toggle Maximize / Normal Sidebar
  const handleToggleMaximizeSidebar = () => {
    if (isSidebarExpanded) {
      setIsSidebarExpanded(false);
      const targetW = savedNormalWidthRef.current || 380;
      setSidebarWidth(targetW);
      try {
        localStorage.setItem('montage_sidebar_width', targetW.toString());
      } catch {}
    } else {
      savedNormalWidthRef.current = sidebarWidth;
      setIsSidebarExpanded(true);
      const expandedW = Math.max(540, Math.min(850, Math.round(window.innerWidth * 0.48)));
      setSidebarWidth(expandedW);
      try {
        localStorage.setItem('montage_sidebar_width', expandedW.toString());
      } catch {}
    }
  };

  // Adjust sidebar width if window is resized
  useEffect(() => {
    const handleResize = () => {
      setSidebarWidth((prev) => {
        const maxW = Math.max(280, Math.round(window.innerWidth * 0.65));
        return prev > maxW ? maxW : prev;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Class on body during sidebar resize
  useEffect(() => {
    if (isResizingSidebar) {
      document.body.classList.add('is-resizing-sidebar');
    } else {
      document.body.classList.remove('is-resizing-sidebar');
    }
    return () => {
      document.body.classList.remove('is-resizing-sidebar');
    };
  }, [isResizingSidebar]);

  const showToast = (message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const projectRef = useRef(project);
  projectRef.current = project;

  // Single-Editor Tab Lock State (Prevents race conditions & data loss across multiple browser tabs)
  const [tabLockState, setTabLockState] = useState(() => ({
    isOwner: true,
    ownerTabId: null,
    tabId: tabLockCoordinator.tabId,
    projectId: initialProject?.id || null
  }));
  const isOwnerRef = useRef(true);
  isOwnerRef.current = tabLockState.isOwner;

  // Monitor project lock across tabs
  useEffect(() => {
    if (!project?.id) return;
    tabLockCoordinator.watchProject(project.id);
    const unsubscribe = tabLockCoordinator.subscribe((state) => {
      setTabLockState(state);
    });
    return () => {
      unsubscribe();
    };
  }, [project?.id]);

  // Flush any pending dirty state if another tab asks for handover
  useEffect(() => {
    const unregister = tabLockCoordinator.onPrepareHandover(async () => {
      if (isDirtyRef.current && projectRef.current) {
        try {
          await saveProjectToCache(projectRef.current, currentDirHandle?.name);
        } catch (err) {
          console.warn('[TabLock] Error flushing project before handover:', err);
        }
      }
    });
    return () => {
      unregister();
    };
  }, [currentDirHandle]);

  // Spectator tab takes control of editing
  const handleTakeControl = useCallback(async () => {
    if (!project?.id) return;
    try {
      setSaveStatusText('Sincronizando y tomando control...');
      await tabLockCoordinator.requestHandoverAndClaim(350);

      // Reload latest cached state saved by previous tab
      const latest = await getCachedProject(project.id);
      if (latest) {
        const prepared = prepareProject(latest);
        projectRef.current = prepared;
        setProject(prepared);
      }
      setIsSaved(true);
      setSaveStatusText('Control de edición activado');
      showToast('Has tomado el control de edición de este proyecto.', 'success');
    } catch (err) {
      console.error('Error claiming tab lock:', err);
      tabLockCoordinator.claimLock();
    }
  }, [project?.id]);

  // Restore local media blobs from IndexedDB if URLs need revivification (Clipchamp-style)
  useEffect(() => {
    let isCancelled = false;

    const restoreMedia = async () => {
      if (!project?.assets || project.assets.length === 0) return;

      let hasRestored = false;
      const updatedAssets = await Promise.all(
        project.assets.map(async (asset) => {
          let currentAsset = { ...asset };
          let needsRestore = !currentAsset.url;
          if (currentAsset.url && currentAsset.url.startsWith('blob:')) {
            try {
              const resp = await fetch(currentAsset.url);
              if (!resp.ok) needsRestore = true;
            } catch {
              needsRestore = true;
            }
          }

          if (needsRestore) {
            const blob = await getMediaBlob(currentAsset.id);
            if (blob) {
              hasRestored = true;
              currentAsset = { ...currentAsset, url: URL.createObjectURL(blob) };
            } else if (currentAsset.diskPath && (currentAsset.diskPath.startsWith('/') || /^[a-zA-Z]:\\/.test(currentAsset.diskPath))) {
              hasRestored = true;
              currentAsset = {
                ...currentAsset,
                url: `/media-library/abs?path=${encodeURIComponent(currentAsset.diskPath)}`
              };
            } else if (currentAsset.name) {
              // Tolerant server media recovery by filename
              try {
                const testUrl = `/media-library/${encodeURIComponent(currentAsset.name)}`;
                const head = await fetch(testUrl, { method: 'HEAD' });
                if (head.ok) {
                  hasRestored = true;
                  const diskHeader = head.headers.get('x-resolved-disk-path');
                  currentAsset = {
                    ...currentAsset,
                    url: testUrl,
                    diskPath: diskHeader || currentAsset.diskPath || currentAsset.name
                  };
                }
              } catch (_) {}
            }
          }

          // Automatically upgrade un-extracted video container audio into real WAV audio files
          const isSeparatedVideoAudio = currentAsset.type === 'audio' && !currentAsset.isExtractedWav && (
            currentAsset.sourceAssetId ||
            currentAsset.isVideoContainerAudio ||
            (currentAsset.name && /\((Pista Audio|Audio)\)/i.test(currentAsset.name)) ||
            (project.assets || []).some(a => a.type === 'video' && a.id !== currentAsset.id && a.url === currentAsset.url)
          );

          if (isSeparatedVideoAudio && currentAsset.url) {
            try {
              const wavBlob = await extractAudioTrackToWavBlob(currentAsset.url);
              await saveMediaBlob(currentAsset.id, wavBlob, { name: `${currentAsset.name}.wav`, type: 'audio/wav' });
              const wavUrl = URL.createObjectURL(wavBlob);
              hasRestored = true;
              currentAsset = {
                ...currentAsset,
                url: wavUrl,
                isExtractedWav: true,
                size: wavBlob.size
              };
            } catch (err) {
              console.warn('Auto-extraction fallback during restoreMedia:', err);
            }
          }

          return currentAsset;
        })
      );

      if (hasRestored && !isCancelled) {
        setProject(prev => {
          const next = { ...prev, assets: updatedAssets };
          if (isOwnerRef.current) {
            saveProjectToCache(next);
          }
          return next;
        });
      }
    };

    restoreMedia();
    return () => { isCancelled = true; };
  }, []);

  // Batch resolve project assets against filesystem on mount or project switch
  useEffect(() => {
    let isCancelled = false;
    async function resolveAssets() {
      if (!project?.assets || project.assets.length === 0) return;
      const updated = await resolveProjectAssetsOnDisk(project);
      if (!isCancelled && updated && updated !== project) {
        setProject(updated);
        if (isOwnerRef.current) {
          saveProjectToCache(updated);
        }
      }
    }
    resolveAssets();
    return () => { isCancelled = true; };
  }, [project?.id]);



  // Auto-switch to scenes tab (Escenas IA) when a scene clip is selected, or inspector for normal clips
  useEffect(() => {
    if (!selectedClipId) return;

    // Check if the selected clip belongs to the dedicated scene track or is an AI scene
    const sceneTrack = (project.tracks || []).find(t => t.type === 'scene');
    const isSceneClip = sceneTrack?.clips?.some(c => c.id === selectedClipId);

    if (isSceneClip) {
      const clip = sceneTrack.clips.find(c => c.id === selectedClipId);
      const sNum = clip?.sceneNumber ? Number(clip.sceneNumber) : null;
      const nameMatch = clip?.name?.match(/\[E\s*0*(\d+)\]/i) || clip?.title?.match(/\[E\s*0*(\d+)\]/i);
      const extractedNum = nameMatch ? Number(nameMatch[1]) : null;
      const targetNum = sNum || extractedNum;

      const matchedScene = (project.scenes?.list || []).find(s =>
        s.id === clip?.id ||
        s.id === clip?.sceneId ||
        (targetNum && Number(s.sceneNumber) === targetNum)
      );

      const finalId = matchedScene?.id || clip?.sceneId || clip?.id;
      setSelectedSceneId(finalId);
      handleSelectSidebarTab('scenes');
    } else {
      handleSelectSidebarTab('inspector');
    }
  }, [selectedClipId, project.tracks, project.scenes?.list, handleSelectSidebarTab]);

  // Central Autosave Engine: saves to IndexedDB cache & silently to disk if handle exists
  const performAutosave = useCallback(async (isForced = false) => {
    if (!isOwnerRef.current) {
      return; // Do not auto-save from read-only spectator tab
    }
    if (!autosaveConfig.enabled && !isForced) {
      return;
    }
    if (isAutosavingRef.current) {
      return;
    }

    const currentProject = projectRef.current;
    if (!currentProject) return;

    isAutosavingRef.current = true;
    setAutosaveStatus('saving');

    try {
      // 1. Guardar de forma permanente en IndexedDB
      await saveProjectToCache(currentProject, currentDirHandle?.name);

      // 2. Si está habilitado y hay un archivo o carpeta vinculado, guardar silenciosamente en disco
      let savedToDisk = false;
      let diskFileName = '';
      if (autosaveConfig.saveToDiskIfHandle) {
        const hasHandle = hasDiskFileHandle(currentProject.id) || Boolean(initialProject?.fileHandle) || Boolean(currentDirHandle);
        if (hasHandle) {
          const diskRes = await saveProjectToDisk(
            currentProject,
            currentDirHandle,
            initialProject?.fileHandle,
            true // silentOnly = true
          );
          if (diskRes && diskRes.success) {
            savedToDisk = true;
            diskFileName = diskRes.fileName;
          }
        }
        if (!savedToDisk) {
          const diskRes = await saveDiskProject(currentProject, {
            fileName: currentProject.fileName,
            filePath: currentProject.filePath
          });
          if (diskRes && diskRes.success) {
            savedToDisk = true;
            diskFileName = diskRes.fileName;
          }
        }
      }

      isDirtyRef.current = false;
      const now = new Date();
      setLastSavedTime(now);
      setIsSaved(true);
      setAutosaveStatus('saved');

      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (savedToDisk && diskFileName) {
        setSaveStatusText(`Autoguardado en disco y caché (${timeStr})`);
      } else {
        setSaveStatusText(`Autoguardado en almacenamiento local (${timeStr})`);
      }
    } catch (err) {
      console.warn('Error en ciclo de autoguardado:', err);
      setAutosaveStatus('error');
      setSaveStatusText('Error al autoguardar');
    } finally {
      isAutosavingRef.current = false;
    }
  }, [autosaveConfig, currentDirHandle, initialProject]);

  // Periodic background autosave interval
  useEffect(() => {
    if (!autosaveConfig.enabled) return;

    const intervalMs = Math.max(5, autosaveConfig.intervalSeconds || 15) * 1000;
    const intervalId = setInterval(() => {
      if (isDirtyRef.current && !isAutosavingRef.current) {
        performAutosave();
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [autosaveConfig, performAutosave]);

  // Synchronize configuration changes across app
  useEffect(() => {
    const handleConfigChange = (e) => {
      if (e.detail) {
        setAutosaveConfig(e.detail);
      }
    };
    window.addEventListener('montage_autosave_config_changed', handleConfigChange);
    return () => window.removeEventListener('montage_autosave_config_changed', handleConfigChange);
  }, []);

  // Flush save on tab switch, window blur, or beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isOwnerRef.current && isDirtyRef.current && projectRef.current) {
        saveProjectToCache(projectRef.current, currentDirHandle?.name);
      }
    };

    const handleVisibilityChange = () => {
      if (isOwnerRef.current && document.visibilityState === 'hidden' && isDirtyRef.current && projectRef.current) {
        performAutosave(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
    };
  }, [currentDirHandle, performAutosave]);

  // Transaction and continuous-coalesce history refs to prevent micro-step pollution
  const historyTransactionSnapshotRef = useRef(null);
  const coalesceTimerRef = useRef(null);
  const coalesceSnapshotRef = useRef(null);

  const beginHistoryTransaction = useCallback(() => {
    if (coalesceTimerRef.current) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    }
    coalesceSnapshotRef.current = null;

    if (!historyTransactionSnapshotRef.current && projectRef.current) {
      try {
        historyTransactionSnapshotRef.current = JSON.parse(JSON.stringify(projectRef.current));
      } catch (err) {
        console.warn('Failed to snapshot transaction start:', err);
      }
    }
  }, []);

  const commitHistoryTransaction = useCallback((customSnapshot = null) => {
    if (coalesceTimerRef.current) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    }
    coalesceSnapshotRef.current = null;

    const startSnapshot = customSnapshot || historyTransactionSnapshotRef.current;
    historyTransactionSnapshotRef.current = null;
    if (!startSnapshot || !projectRef.current) return;

    try {
      const startStr = JSON.stringify(startSnapshot);
      const curStr = JSON.stringify(projectRef.current);
      if (startStr !== curStr) {
        setHistoryPast(prev => [...prev.slice(-40), startSnapshot]);
        setHistoryFuture([]);
        isDirtyRef.current = true;
        setIsSaved(false);
      }
    } catch (err) {
      console.warn('Failed to commit history transaction:', err);
    }
  }, []);

  const cancelHistoryTransaction = useCallback(() => {
    if (coalesceTimerRef.current) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    }
    coalesceSnapshotRef.current = null;

    const startSnapshot = historyTransactionSnapshotRef.current;
    historyTransactionSnapshotRef.current = null;
    if (startSnapshot) {
      projectRef.current = startSnapshot;
      setProject(startSnapshot);
    }
  }, []);

  // Mark unsaved on project modifications and trigger debounced autosave
  const updateProjectData = useCallback((updatedProject, immediate = false, recordHistory = true, customSnapshot = null) => {
    if (!isOwnerRef.current) {
      console.warn('[TabLock] Edición bloqueada: esta pestaña está en modo visualización.');
      showToast('Modo Visualización: Haz clic en "Tomar el control aquí" para editar.', 'warning');
      return;
    }
    const cleanProject = sanitizeDuplicateSceneClips(updatedProject);
    if (customSnapshot) {
      try {
        setHistoryPast(prev => [...prev.slice(-40), customSnapshot]);
        setHistoryFuture([]);
      } catch (err) {
        console.warn('Failed to snapshot history with custom snapshot:', err);
      }
    } else if (recordHistory && !historyTransactionSnapshotRef.current) {
      try {
        const snapshot = JSON.parse(JSON.stringify(projectRef.current));
        setHistoryPast(prev => [...prev.slice(-40), snapshot]);
        setHistoryFuture([]);
      } catch (err) {
        console.warn('Failed to snapshot history:', err);
      }
    }

    if (currentDirHandle && !cleanProject.directoryName) {
      cleanProject.directoryName = currentDirHandle.name;
    }

    projectRef.current = cleanProject;
    setProject(cleanProject);
    isDirtyRef.current = true;
    setIsSaved(false);

    if (autosaveConfig.enabled) {
      setAutosaveStatus('pending');
      setSaveStatusText('Guardando cambios...');

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      if (immediate) {
        performAutosave();
      } else {
        autosaveTimeoutRef.current = setTimeout(() => {
          performAutosave();
        }, autosaveConfig.debounceDelayMs || 1500);
      }
    } else {
      setAutosaveStatus('disabled');
      setSaveStatusText('Autoguardado desactivado (Usa Ctrl+S)');
    }
  }, [currentDirHandle, autosaveConfig, performAutosave]);

  // Undo and Redo handlers
  const handleUndo = useCallback(() => {
    // 1. Flush any uncommitted transaction or coalesce timer first
    if (historyTransactionSnapshotRef.current) {
      commitHistoryTransaction();
    } else if (coalesceTimerRef.current && coalesceSnapshotRef.current) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
      const snap = coalesceSnapshotRef.current;
      coalesceSnapshotRef.current = null;
      try {
        if (JSON.stringify(snap) !== JSON.stringify(projectRef.current)) {
          setHistoryPast(prev => [...prev.slice(-40), snap]);
          setHistoryFuture([]);
        }
      } catch (e) {
        console.warn('Flush error in undo:', e);
      }
    }

    setHistoryPast(prevPast => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const newPast = prevPast.slice(0, prevPast.length - 1);

      try {
        const currentSnapshot = JSON.parse(JSON.stringify(projectRef.current));
        setHistoryFuture(prevFuture => [currentSnapshot, ...prevFuture.slice(0, 40)]);
      } catch (e) {
        console.warn('Could not record redo snapshot', e);
      }

      projectRef.current = previous;
      setProject(previous);
      isDirtyRef.current = true;
      setIsSaved(false);
      setSaveStatusText('Deshacer aplicado (Ctrl+Z)');
      performAutosave();
      return newPast;
    });
  }, [commitHistoryTransaction, performAutosave]);

  const handleRedo = useCallback(() => {
    if (historyTransactionSnapshotRef.current) {
      commitHistoryTransaction();
    } else if (coalesceTimerRef.current && coalesceSnapshotRef.current) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
      coalesceSnapshotRef.current = null;
    }

    setHistoryFuture(prevFuture => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      const newFuture = prevFuture.slice(1);

      try {
        const currentSnapshot = JSON.parse(JSON.stringify(projectRef.current));
        setHistoryPast(prevPast => [...prevPast.slice(-40), currentSnapshot]);
      } catch (e) {
        console.warn('Could not record undo snapshot', e);
      }

      projectRef.current = next;
      setProject(next);
      isDirtyRef.current = true;
      setIsSaved(false);
      setSaveStatusText('Rehacer aplicado (Ctrl+Y)');
      performAutosave();
      return newFuture;
    });
  }, [commitHistoryTransaction, performAutosave]);

  // Clear Scenes from Project
  const handleClearScenes = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const updated = clearScenesFromProject(current);
    updateProjectData(updated, true);
    setSaveStatusText('Escenas eliminadas (Ctrl+Z para recuperar)');
  }, [updateProjectData]);

  // Delete Single Scene
  const handleDeleteSingleScene = useCallback((sceneId) => {
    const current = projectRef.current;
    if (!current) return;
    const updated = deleteSingleScene(current, sceneId);
    updateProjectData(updated);
  }, [updateProjectData]);

  // Delete Track
  const handleDeleteTrack = useCallback((trackId) => {
    const current = projectRef.current;
    if (!current) return;
    const track = current.tracks?.find(t => t.id === trackId);
    if (!track) return;
    const updated = deleteTrackFromProject(current, trackId);
    updateProjectData(updated, true);
    setSaveStatusText(`Pista "${track.name}" eliminada (Ctrl+Z para recuperar)`);
  }, [updateProjectData]);

  // Clear All Clips from Timeline
  const handleClearTimelineClips = () => {
    if (!window.confirm('¿Deseas vaciar toda la línea de tiempo? Se quitarán todos los clips de las pistas. (Podrás deshacer con Ctrl+Z)')) {
      return;
    }
    const updated = clearTimelineClips(project);
    updateProjectData(updated, true);
    setSaveStatusText('Línea de tiempo vaciada (Ctrl+Z para recuperar)');
  };

  // Save Project to Local Disk manually (Ctrl+S or Button)
  const handleSaveToDisk = async (forceSaveAs = false) => {
    if (!isOwnerRef.current) {
      showToast('Esta pestaña está en Modo Visualización. Haz clic en "Tomar el control aquí" para guardar.', 'warning');
      return;
    }
    try {
      setAutosaveStatus('saving');
      let res = await saveProjectToDisk(
        projectRef.current || project,
        currentDirHandle,
        forceSaveAs ? null : initialProject?.fileHandle,
        false // silentOnly = false (allow picker if needed)
      );
      if (!res?.success || (!res.isDiskFile && !res.downloaded)) {
        const diskRes = await saveDiskProject(projectRef.current || project, {
          fileName: (projectRef.current || project).fileName,
          filePath: (projectRef.current || project).filePath
        });
        if (diskRes && diskRes.success) {
          res = { success: true, fileName: diskRes.fileName, isDiskFile: true };
        }
      }
      if (res && res.success) {
        isDirtyRef.current = false;
        setIsSaved(true);
        setAutosaveStatus('saved');
        const now = new Date();
        setLastSavedTime(now);
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setSaveStatusText(`Guardado en disco: ${res.fileName} (${timeStr})`);
        await saveProjectToCache(projectRef.current || project, currentDirHandle?.name);
      }
    } catch (err) {
      console.error('Error saving to disk:', err);
      setAutosaveStatus('error');
      setSaveStatusText('Error al escribir en disco');
    }
  };

  // Central Unified Transport Controller (Guarantees absolute sync between Space, Media keys, and UI buttons)
  const handleTogglePlayPause = useCallback((forcedState) => {
    // Blur any active DOM element so subsequent Space presses never trigger button click AND keydown simultaneously
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    setIsPlaying((prev) => (typeof forcedState === 'boolean' ? forcedState : !prev));
  }, []);

  // Global Keyboard Shortcuts (Space/MediaPlayPause/Pause/K for Play/Pause, Ctrl+S for Save, Ctrl+Z / Ctrl+Y for Undo/Redo, Delete/Backspace for Clip)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if typing in an input, textarea, or contenteditable element
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.target.isContentEditable) return;

      const isPlayPauseKey =
        e.code === 'Space' ||
        e.code === 'MediaPlayPause' ||
        e.key === 'MediaPlayPause' ||
        e.code === 'Pause' ||
        e.key === 'Pause' ||
        ((e.key === 'k' || e.key === 'K') && !e.ctrlKey && !e.metaKey && !e.altKey);

      if (isPlayPauseKey) {
        e.preventDefault();
        e.stopPropagation();
        handleTogglePlayPause();
        return;
      }

      // Rewind / Retroceder: ArrowLeft (1s, con Shift 5s, con Alt 1 fotograma)
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : (e.altKey ? (1 / 30) : 1);
        setCurrentTime(prev => {
          const next = Math.max(0, prev - step);
          window.__montageCurrentTime = next;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: next } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: next } }));
          return next;
        });
        return;
      }

      // Fast-Forward / Avanzar: ArrowRight (1s, con Shift 5s, con Alt 1 fotograma)
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const dur = project?.settings?.duration || 20;
        const step = e.shiftKey ? 5 : (e.altKey ? (1 / 30) : 1);
        setCurrentTime(prev => {
          const next = Math.min(dur, prev + step);
          window.__montageCurrentTime = next;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: next } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: next } }));
          return next;
        });
        return;
      }

      // J: Retroceder / Rebobinar 2 segundos
      if ((e.key === 'j' || e.key === 'J') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setCurrentTime(prev => {
          const next = Math.max(0, prev - 2);
          window.__montageCurrentTime = next;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: next } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: next } }));
          return next;
        });
        return;
      }

      // L: Avanzar / Acelerar 2 segundos
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const dur = project?.settings?.duration || 20;
        setCurrentTime(prev => {
          const next = Math.min(dur, prev + 2);
          window.__montageCurrentTime = next;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: next } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: next } }));
          return next;
        });
        return;
      }

      // Home: Ir al inicio (00:00:00)
      if (e.key === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
        window.__montageCurrentTime = 0;
        window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: 0 } }));
        window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: 0 } }));
        return;
      }

      // End: Ir al final de la línea de tiempo
      if (e.key === 'End') {
        e.preventDefault();
        const dur = project?.settings?.duration || 20;
        setCurrentTime(dur);
        window.__montageCurrentTime = dur;
        window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: dur } }));
        window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: dur } }));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveToDisk(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'a') {
        // Select All clips across all tracks
        if (!['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) {
          e.preventDefault();
          const allClipIds = (project.tracks || []).flatMap(t => t.clips.map(c => c.id));
          setSelectedClipIds(allClipIds);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'd') {
        // Duplicate selected clip(s)
        if (!['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) {
          e.preventDefault();
          handleDuplicateClip();
        }
      } else if (e.key === 'Escape') {
        setSelectedClipIds([]);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) {
          if (selectedClipIds.length > 0 || selectedClipId) {
            e.preventDefault();
            handleDeleteClip();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, currentDirHandle, historyPast, historyFuture, selectedClipId, selectedClipIds]);

  // Hardware Media Keys & Bluetooth Headset Transport Synchronization
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        handleTogglePlayPause(true);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        handleTogglePlayPause(false);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details?.seekOffset || 5;
        setCurrentTime(prev => {
          const next = Math.max(0, prev - skipTime);
          window.__montageCurrentTime = next;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: next } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: next } }));
          return next;
        });
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const dur = project?.settings?.duration || 20;
        const skipTime = details?.seekOffset || 5;
        setCurrentTime(prev => {
          const next = Math.min(dur, prev + skipTime);
          window.__montageCurrentTime = next;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: next } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: next } }));
          return next;
        });
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details?.seekTime !== undefined) {
          setCurrentTime(details.seekTime);
          window.__montageCurrentTime = details.seekTime;
          window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: details.seekTime } }));
          window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: details.seekTime } }));
        }
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        handleTogglePlayPause(false);
        setCurrentTime(0);
        window.__montageCurrentTime = 0;
        window.dispatchEvent(new CustomEvent('montage-playback-tick', { detail: { time: 0 } }));
        window.dispatchEvent(new CustomEvent('montage-user-seek', { detail: { time: 0 } }));
      });
    } catch (err) {
      console.warn('MediaSession handler registration notice:', err);
    }

    return () => {
      if (!('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch {}
    };
  }, [project?.settings?.duration]);

  // Keep MediaSession playbackState in sync with React state
  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      } catch {}
    }
  }, [isPlaying]);

  // Asset handlers
  const handleAddAsset = useCallback((asset) => {
    const current = projectRef.current;
    const existingIndex = (current?.assets || []).findIndex(a => a.id === asset.id);
    let updatedAssets;
    if (existingIndex >= 0) {
      updatedAssets = (current?.assets || []).map(a => a.id === asset.id ? { ...a, ...asset } : a);
    } else {
      updatedAssets = [...(current?.assets || []), asset];
    }
    updateProjectData({ ...current, assets: updatedAssets });
  }, [updateProjectData]);

  const handleUpdateAsset = useCallback((updatedAsset) => {
    const current = projectRef.current;
    if (!current?.assets) return;
    const updatedAssets = current.assets.map(a => a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a);
    updateProjectData({ ...current, assets: updatedAssets });
  }, [updateProjectData]);

  const handleDeleteAsset = useCallback((assetId) => {
    const current = projectRef.current;
    const updatedAssets = (current?.assets || []).filter(a => a.id !== assetId);
    // Remove references in tracks
    const updatedTracks = (current?.tracks || []).map(t => ({
      ...t,
      clips: (t.clips || []).filter(c => c.assetId !== assetId)
    }));
    updateProjectData({ ...current, assets: updatedAssets, tracks: updatedTracks });
  }, [updateProjectData]);

  const handleAddToTimeline = useCallback((asset) => {
    const current = projectRef.current;
    let targetTrack = null;
    const activeSelectedId = selectedClipIdsRef.current[selectedClipIdsRef.current.length - 1] || null;
    if (activeSelectedId) {
      for (const t of (current?.tracks || [])) {
        if ((t.clips || []).some(c => c.id === activeSelectedId) && t.type === asset.type) {
          targetTrack = t.id;
          break;
        }
      }
    }
    if (!targetTrack && asset.type === 'audio') {
      const firstAudioTrack = (current?.tracks || []).find(t => t.type === 'audio' && !t.locked);
      if (firstAudioTrack) targetTrack = firstAudioTrack.id;
    }
    const { updatedProject, selectedClipId: newSelectedId } = addAssetToTimeline(
      current,
      asset,
      targetTrack,
      currentTimeRef.current
    );
    updateProjectData(updatedProject);
    if (newSelectedId) {
      setSelectedClipId(newSelectedId);
    }
  }, [updateProjectData, setSelectedClipId]);

  // Selected clip handlers
  const selectedClip = useMemo(() => {
    if (!selectedClipId || !project?.tracks) return null;
    for (const track of (project.tracks || [])) {
      const c = (track.clips || []).find(clip => clip.id === selectedClipId);
      if (c) return c;
    }
    return null;
  }, [selectedClipId, project?.tracks]);

  const handleUpdateClip = useCallback((clipId, updates, recordHistory = true, customSnapshot = null) => {
    const current = projectRef.current;
    if (!current) return;

    // Check if the clip being updated is a subtitle clip
    let isSubClip = false;
    for (const t of (current.tracks || [])) {
      const found = (t.clips || []).find(c => c.id === clipId);
      if (found) {
        if (isSubtitleClip(found, t)) {
          isSubClip = true;
        }
        break;
      }
    }

    let nextProject;
    if (isSubClip) {
      nextProject = updateSubtitleClipWithBatchSync(current, clipId, updates);
    } else {
      const updatedTracks = (current.tracks || []).map(t => ({
        ...t,
        clips: (t.clips || []).map(c => c.id === clipId ? { ...c, ...updates } : c)
      }));
      nextProject = { ...current, tracks: updatedTracks };
    }

    // 1. If an explicit custom snapshot was provided, commit it atomically
    if (customSnapshot) {
      updateProjectData(nextProject, false, true, customSnapshot);
      return;
    }

    // 2. If recordHistory is false or an active transaction is open, update state without history push
    if (!recordHistory || historyTransactionSnapshotRef.current) {
      updateProjectData(nextProject, false, false);
      return;
    }

    // 3. Coalesce rapid consecutive updates (e.g., slider sliding or rapid key taps) into 1 history step
    if (!coalesceSnapshotRef.current) {
      try {
        coalesceSnapshotRef.current = JSON.parse(JSON.stringify(current));
      } catch (err) {
        console.warn('Failed to snapshot coalesce start:', err);
      }
    }

    if (coalesceTimerRef.current) {
      clearTimeout(coalesceTimerRef.current);
    }

    coalesceTimerRef.current = setTimeout(() => {
      if (coalesceSnapshotRef.current && projectRef.current) {
        const snap = coalesceSnapshotRef.current;
        coalesceSnapshotRef.current = null;
        coalesceTimerRef.current = null;
        try {
          if (JSON.stringify(snap) !== JSON.stringify(projectRef.current)) {
            setHistoryPast(prev => [...prev.slice(-40), snap]);
            setHistoryFuture([]);
          }
        } catch (e) {
          console.warn('Coalesce commit error:', e);
        }
      }
    }, 350);

    // Apply change immediately to UI state without creating an immediate micro-step
    updateProjectData(nextProject, false, false);
  }, [updateProjectData]);

  const handleDeleteClip = useCallback((clipId = null) => {
    const current = projectRef.current;
    const idsToDelete = clipId ? [clipId] : (selectedClipIdsRef.current.length > 0 ? selectedClipIdsRef.current : (selectedClipIdRef.current ? [selectedClipIdRef.current] : []));
    if (idsToDelete.length === 0) return;
    const deleteSet = new Set(idsToDelete);

    const updatedTracks = (current?.tracks || []).map(t => ({
      ...t,
      clips: (t.clips || [])
        .filter(c => !deleteSet.has(c.id))
        .map(c => deleteSet.has(c.linkedClipId) ? { ...c, linkedClipId: undefined } : c)
    }));
    updateProjectData({ ...current, tracks: updatedTracks });
    setSelectedClipIds([]);
  }, [updateProjectData]);

  const handleOpenProjectSettings = useCallback(() => setShowSettingsModal(true), []);

  const handleOpenTranscribeModal = useCallback(() => setShowTranscribeModal(true), []);
  const handleOpenSceneDirector = useCallback(() => setShowSceneDirectorModal(true), []);
  const handleOpenGraphicDirector = useCallback(() => setShowGraphicDirectorModal(true), []);
  const handleOpenAutoCutModal = useCallback(() => setShowAutoCutModal(true), []);
  const handleOpenAutoBrollBatch = useCallback(() => setShowAutoBrollBatchModal(true), []);
  const handleSeekToTime = useCallback((t) => setCurrentTime(t), []);
  const handleSelectClip = useCallback((clipId) => {
    setSelectedClipId(clipId);
    if (clipId) {
      handleSelectSidebarTab('inspector');
      setActiveRightTab(prev => (prev === 'mixer' ? 'effects' : prev));
    }
  }, [handleSelectSidebarTab]);
  const handleOpenSceneBroll = useCallback((scene) => {
    if (!scene) return;
    const realPos = resolveRealSceneTimelinePosition(scene, project);
    setSelectedSceneForBrollModal({
      ...scene,
      startTime: realPos.startTime,
      duration: realPos.duration,
      endTime: Number((realPos.startTime + realPos.duration).toFixed(2))
    });
  }, [project]);
  const handleOpenGraphicForScene = useCallback((sceneOrClip) => {
    if (!sceneOrClip) return;
    setGraphicTargetScene(sceneOrClip);
    setShowGraphicDirectorModal(true);
  }, []);

  const handleSeparateAudio = async (clipId) => {
    const targetId = clipId || selectedClipId;
    if (!targetId) return;

    // 1. Separate audio in timeline structure immediately for zero UI lag
    const { updatedProject, newAudioClipId, audioAssetId, sourceAsset } = separateAudioFromClip(project, targetId);
    updateProjectData(updatedProject);
    if (newAudioClipId) {
      setSelectedClipId(newAudioClipId);
    }
    setSaveStatusText('Extrayendo audio a nivel de archivo (WAV)...');

    try {
      // 2. Obtain media data from blob URL or IndexedDB
      let mediaSource = sourceAsset?.url;
      if (sourceAsset?.id) {
        try {
          if (!mediaSource || mediaSource.startsWith('blob:')) {
            const check = await fetch(mediaSource);
            if (!check.ok) throw new Error('Blob URL no responde');
          }
        } catch {
          const storedBlob = await getMediaBlob(sourceAsset.id);
          if (storedBlob) {
            mediaSource = storedBlob;
          }
        }
      }

      if (!mediaSource) {
        throw new Error('No se encontró el archivo de video para extraer el audio');
      }

      // 3. Extract pure 16-bit PCM WAV at file level
      const wavBlob = await extractAudioTrackToWavBlob(mediaSource);
      const baseName = (sourceAsset?.name || 'audio').replace(/\.[^/.]+$/, '').replace(/\s*\(Audio\)$/i, '');
      const audioFileName = `${baseName} (Audio Separado).wav`;

      // 4. Save independent audio file to IndexedDB
      await saveMediaBlob(audioAssetId, wavBlob, { name: audioFileName, type: 'audio/wav' });
      const wavUrl = URL.createObjectURL(wavBlob);

      let wavDuration = sourceAsset?.duration || 10;
      let wavPeaks = null;
      try {
        const wf = await extractWaveformData(wavBlob);
        wavDuration = wf.duration;
        wavPeaks = wf.peaks;
      } catch (e) {
        console.warn('Error extracting waveform for separated audio', e);
      }

      // 5. Update project asset to use the standalone WAV file
      setProject(prev => {
        const nextAssets = (prev.assets || []).map(a => {
          if (a.id === audioAssetId) {
            return {
              ...a,
              url: wavUrl,
              name: audioFileName,
              duration: wavDuration,
              waveform: wavPeaks,
              isExtractedWav: true,
              isVideoContainerAudio: false,
              size: wavBlob.size
            };
          }
          return a;
        });
        const nextProj = { ...prev, assets: nextAssets };
        projectRef.current = nextProj;
        saveProjectToCache(nextProj);
        return nextProj;
      });

      setIsSaved(true);
      setAutosaveStatus('saved');
      setLastSavedTime(new Date());
      setSaveStatusText('Audio extraído y separado a nivel de archivo (WAV independiente)');
    } catch (err) {
      console.warn('Extracción WAV en segundo plano continuará en sincronizador:', err);
      setSaveStatusText('Audio separado en pista independiente');
    }
  };

  const handleUnlinkClip = useCallback((clipId) => {
    const current = projectRef.current;
    const targetId = clipId || selectedClipIdRef.current;
    if (!targetId || !current) return;
    const updatedProject = unlinkClips(current, targetId);
    updateProjectData(updatedProject);
    setSaveStatusText('Clips desvinculados (ahora son independientes)');
  }, [updateProjectData]);

  const handleDuplicateClip = useCallback((clipId = null) => {
    const current = projectRef.current;
    if (!current?.tracks) return;
    const idsToDup = clipId ? [clipId] : (selectedClipIdsRef.current.length > 0 ? selectedClipIdsRef.current : (selectedClipIdRef.current ? [selectedClipIdRef.current] : []));
    if (idsToDup.length === 0) return;
    const dupSet = new Set(idsToDup);

    const newClipsByTrack = new Map();
    const newSelectedIds = [];

    for (const track of current.tracks) {
      for (const clip of track.clips) {
        if (dupSet.has(clip.id)) {
          const newId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const newClip = {
            ...clip,
            id: newId,
            startTime: Number((clip.startTime + clip.duration + 0.2).toFixed(2)),
            name: `${clip.name} (Copia)`
          };
          newSelectedIds.push(newId);
          if (!newClipsByTrack.has(track.id)) {
            newClipsByTrack.set(track.id, []);
          }
          newClipsByTrack.get(track.id).push(newClip);
        }
      }
    }

    const updatedTracks = current.tracks.map(t => {
      const added = newClipsByTrack.get(t.id);
      if (added && added.length > 0) {
        return { ...t, clips: [...t.clips, ...added] };
      }
      return t;
    });

    updateProjectData({ ...current, tracks: updatedTracks });
    if (newSelectedIds.length > 0) {
      setSelectedClipIds(newSelectedIds);
    }
  }, [updateProjectData]);

  if (!project || !project.tracks) {
    return (
      <div className="editor-loading-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', background: 'var(--bg-main)' }}>
        <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366f1', borderRadius: '50%' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Cargando proyecto...</p>
        <button className="btn-secondary btn-sm" onClick={onBackToHome}>
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="editor-layout">
      {/* Adobe Premiere Pro Top Application Bar */}
      <header className="editor-top-bar premiere-top-bar">
        <div className="premiere-top-left">
          <button
            type="button"
            className="premiere-home-btn"
            onClick={onBackToHome}
            title="Inicio / Gestor de Proyectos"
          >
            <ArrowLeft size={15} />
          </button>

          {/* Premiere Pro Mode Tabs: Import | Edit | Export */}
          <div className="premiere-mode-tabs">
            <button
              type="button"
              className="premiere-mode-tab"
              onClick={() => {
                handleSelectSidebarTab('library');
                setFocusedPanel('left');
              }}
              title="Importar recursos al Bin"
            >
              Import
            </button>
            <button
              type="button"
              className="premiere-mode-tab active"
              title="Espacio de trabajo de Edición (Premiere Pro)"
            >
              Edit
            </button>
            <button
              type="button"
              className="premiere-mode-tab"
              onClick={() => setShowExportModal(true)}
              title="Exportar secuencia final"
            >
              Export
            </button>
          </div>

          <div className="top-divider"></div>

          {/* Undo / Redo + Save Action Buttons */}
          <div className="top-history-controls" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              className="btn-ghost icon-only"
              onClick={handleUndo}
              disabled={historyPast.length === 0}
              title="Deshacer última acción (Ctrl+Z)"
              style={{
                opacity: historyPast.length === 0 ? 0.35 : 1,
                cursor: historyPast.length === 0 ? 'not-allowed' : 'pointer',
                padding: '4px 6px'
              }}
            >
              <Undo2 size={14} />
            </button>
            <button
              className="btn-ghost icon-only"
              onClick={handleRedo}
              disabled={historyFuture.length === 0}
              title="Rehacer acción (Ctrl+Y o Ctrl+Shift+Z)"
              style={{
                opacity: historyFuture.length === 0 ? 0.35 : 1,
                cursor: historyFuture.length === 0 ? 'not-allowed' : 'pointer',
                padding: '4px 6px'
              }}
            >
              <Redo2 size={14} />
            </button>
            <button
              className="btn-ghost icon-only"
              onClick={() => handleSaveToDisk(false)}
              title="Guardar proyecto en disco (Ctrl+S)"
              style={{ padding: '4px 6px' }}
            >
              <Save size={14} />
            </button>
          </div>
        </div>

        {/* Centered Premiere Pro Project Title + Save Status */}
        <div className="premiere-top-center">
          <input
            type="text"
            className="premiere-center-title-input"
            value={project.name}
            onChange={(e) => updateProjectData({ ...project, name: e.target.value })}
            title="Haz clic para renombrar el proyecto"
          />
          <span style={{ fontSize: '11px', color: '#787878', marginLeft: '-6px' }}>
            — Edited
          </span>

          <div
            className="save-status-indicator"
            onClick={() => {
              if (!tabLockState.isOwner) {
                handleTakeControl();
              } else {
                setShowAutosaveModal(true);
              }
            }}
            title={!tabLockState.isOwner ? 'Modo visualización (Haz clic para tomar el control de edición)' : saveStatusText}
            role="button"
            tabIndex={0}
            style={{
              padding: '2px 7px',
              fontSize: '10.5px',
              background: !tabLockState.isOwner ? 'rgba(245, 158, 11, 0.15)' : '#222222',
              borderColor: !tabLockState.isOwner ? 'rgba(245, 158, 11, 0.45)' : '#303030',
              cursor: 'pointer'
            }}
          >
            {!tabLockState.isOwner ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#fbbf24', fontWeight: 600 }}>
                <Lock size={11} />
                Visualización
              </span>
            ) : autosaveStatus === 'saving' ? (
              <span className="status-saving">
                <Loader2 size={11} className="spin" style={{ color: '#3898ff' }} />
              </span>
            ) : (
              <span className="status-saved">
                <CheckCircle2 size={11} className="text-emerald" />
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-ghost icon-only"
            onClick={handleShareProject}
            title="Copiar enlace de este proyecto (para compartir o abrir en otra pestaña)"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: 600,
              background: shareCopied ? 'rgba(16, 185, 129, 0.16)' : '#222222',
              color: shareCopied ? '#34d399' : '#a8a8a8',
              border: '1px solid',
              borderColor: shareCopied ? 'rgba(16, 185, 129, 0.45)' : '#303030',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              marginLeft: '4px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {shareCopied ? <Check size={12} className="text-emerald" /> : <Share2 size={12} />}
            <span>{shareCopied ? '¡Copiado!' : 'Compartir'}</span>
          </button>
        </div>

        {/* Right Workspace Switcher + AI Studio Actions + Export + User */}
        <div className="premiere-top-right">
          <div className="premiere-workspace-pills">
            <button
              type="button"
              className={`premiere-workspace-pill ${activeWorkspacePreset === 'ESSENTIALS' ? 'active' : ''}`}
              onClick={() => {
                setActiveWorkspacePreset('ESSENTIALS');
                setMountedTabs(prev => ({ ...prev, inspector: true }));
                setActiveRightTab('effects');
              }}
            >
              ESSENTIALS
            </button>
            <button
              type="button"
              className={`premiere-workspace-pill ${activeWorkspacePreset === 'COLOR' ? 'active' : ''}`}
              onClick={() => {
                setActiveWorkspacePreset('COLOR');
                setMountedTabs(prev => ({ ...prev, inspector: true }));
                setActiveRightTab('lumetri');
                setFocusedPanel('right');
              }}
            >
              COLOR
            </button>
            <button
              type="button"
              className={`premiere-workspace-pill ${activeWorkspacePreset === 'AUDIO' ? 'active' : ''}`}
              onClick={() => {
                setActiveWorkspacePreset('AUDIO');
                setMountedTabs(prev => ({ ...prev, mixer: true }));
                setActiveRightTab('mixer');
                setFocusedPanel('right');
              }}
            >
              AUDIO
            </button>
          </div>

          <button
            className="btn-secondary btn-xs"
            onClick={() => setShowSceneDirectorModal(true)}
            title="Director de Escenas IA (Storyboard & Auto B-Roll)"
            style={{ background: '#242424', borderColor: '#383838', color: '#3898ff', padding: '4px 8px' }}
          >
            <Film size={12} />
            Editor IA
          </button>

          <button
            className="btn-secondary btn-xs"
            onClick={() => setShowGraphicDirectorModal(true)}
            title="Diseñador Gráfico IA (Títulos y Gráficos Animados)"
            style={{ background: '#242424', borderColor: '#383838', color: '#e5e5e5', padding: '4px 8px' }}
          >
            <Sparkles size={12} style={{ color: '#3898ff' }} />
            Gráficos IA
          </button>

          <button
            className="btn-secondary btn-xs"
            onClick={() => setShowTranscribeModal(true)}
            title="Transcribir audio/video con IA y generar Subtítulos CC"
            style={{ background: '#242424', borderColor: '#383838', color: '#e5e5e5', padding: '4px 8px' }}
          >
            <FileText size={12} style={{ color: '#f59e0b' }} />
            Subtítulos IA
          </button>

          <button
            className="premiere-home-btn"
            onClick={() => setShowSettingsModal(true)}
            title="Ajustes de secuencia y formato (16:9 / 9:16)"
          >
            <Settings size={14} />
          </button>

          <button
            className="premiere-home-btn"
            onClick={() => setShowExportModal(true)}
            title="Exportar secuencia de video"
            style={{ color: '#3898ff' }}
          >
            <Download size={14} />
          </button>

          <UserNav onGoToAuth={onGoToAuth} />
        </div>
      </header>

      {/* Read-Only Spectator Lock Banner when project is active in another tab */}
      {!tabLockState.isOwner && (
        <aside className="premiere-tab-lock-banner" role="status" aria-live="polite">
          <div className="tab-lock-badge-group">
            <span className="tab-lock-pill">
              <Eye size={12} className="tab-lock-icon" />
              Modo Visualización
            </span>
            <span className="tab-lock-text">
              Este proyecto está activo en otra pestaña del navegador. La edición está protegida para evitar pérdidas o conflictos.
            </span>
          </div>
          <div className="tab-lock-actions">
            <button
              type="button"
              className="btn-take-control"
              onClick={handleTakeControl}
              title="Tomar el control de edición en esta pestaña y cargar las últimas modificaciones guardadas"
            >
              <KeyRound size={13} />
              Tomar el control aquí
            </button>
          </div>
        </aside>
      )}

      {/* Upper 3-Column Adobe Premiere Pro Docked Workspace */}
      <div className="editor-workspace premiere-upper-workspace">
        {/* 1. LEFT DOCKED PANEL: Project Bin / Storyboard Scenes / Transcript CC */}
        <aside
          className={`premiere-left-dock nle-panel ${focusedPanel === 'left' ? 'is-focused' : ''}`}
          onMouseDown={() => setFocusedPanel('left')}
          style={{
            width: `${sidebarWidth}px`,
            minWidth: `${sidebarWidth}px`,
            maxWidth: `${sidebarWidth}px`
          }}
        >
          <div className="premiere-panel-header">
            <div className="premiere-panel-tabs">
              <button
                type="button"
                className={`premiere-panel-tab ${activeSidebarTab === 'library' ? 'active' : ''}`}
                onClick={() => handleSelectSidebarTab('library')}
              >
                <span>Bin: {project.name || 'Recursos'}</span>
                <span className="premiere-tab-menu-dots">≡</span>
              </button>
              <button
                type="button"
                className={`premiere-panel-tab ${activeSidebarTab === 'scenes' ? 'active' : ''}`}
                onClick={() => handleSelectSidebarTab('scenes')}
              >
                <span>Escenas IA {(project.scenes?.list || []).length > 0 ? `(${project.scenes.list.length})` : ''}</span>
              </button>
              <button
                type="button"
                className={`premiere-panel-tab ${activeSidebarTab === 'transcript' ? 'active' : ''}`}
                onClick={() => handleSelectSidebarTab('transcript')}
              >
                <span>Guion / CC {(project.tracks || []).some(t => t.type === 'guide') ? '✓' : ''}</span>
              </button>
            </div>

            <button
              type="button"
              className="premiere-bin-icon-btn"
              onClick={handleToggleMaximizeSidebar}
              title={isSidebarExpanded ? 'Restaurar ancho del Bin' : 'Ampliar panel del Bin'}
            >
              {isSidebarExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>

          <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', padding: 0 }}>
            {mountedTabs.library && (
              <div
                style={{
                  display: activeSidebarTab === 'library' ? 'flex' : 'none',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden'
                }}
              >
                <MediaLibrary
                  assets={project.assets || []}
                  onAddAsset={handleAddAsset}
                  onUpdateAsset={handleUpdateAsset}
                  onDeleteAsset={handleDeleteAsset}
                  onAddToTimeline={handleAddToTimeline}
                  project={project}
                  onOpenProjectSettings={handleOpenProjectSettings}
                />
              </div>
            )}
            {mountedTabs.transcript && (
              <div
                style={{
                  display: activeSidebarTab === 'transcript' ? 'block' : 'none',
                  height: '100%',
                  overflowY: 'auto',
                  padding: '12px'
                }}
              >
                <TranscriptPanel
                  project={project}
                  currentTime={currentTime}
                  onSeekToTime={handleSeekToTime}
                  onOpenTranscribeModal={handleOpenTranscribeModal}
                  onUpdateProject={updateProjectData}
                />
              </div>
            )}
            {mountedTabs.scenes && (
              <div
                style={{
                  display: activeSidebarTab === 'scenes' ? 'flex' : 'none',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden'
                }}
              >
                <SceneStoryboardPanel
                  project={project}
                  currentTime={currentTime}
                  setCurrentTime={setCurrentTime}
                  selectedSceneId={selectedSceneId}
                  onSelectScene={handleSelectScene}
                  onOpenSceneDirector={handleOpenSceneDirector}
                  onClearScenes={handleClearScenes}
                  onDeleteScene={handleDeleteSingleScene}
                  onUpdateProject={updateProjectData}
                  onOpenAutoBrollBatch={handleOpenAutoBrollBatch}
                  onOpenGraphicForScene={handleOpenGraphicForScene}
                />
              </div>
            )}
          </div>
        </aside>

        {/* Left Dock Splitter */}
        <div
          className={`sidebar-resizer ${isResizingSidebar ? 'resizing' : ''}`}
          onMouseDown={handleSidebarResizerMouseDown}
          onDoubleClick={handleToggleMaximizeSidebar}
          title="Arrastra para ajustar el ancho del Bin"
        >
          <div className="sidebar-resizer-handle" />
        </div>

        {/* 2. CENTER DOCKED PANEL: Source / Program Monitor */}
        <main
          className={`premiere-center-dock nle-panel ${focusedPanel === 'center' ? 'is-focused' : ''}`}
          onMouseDown={() => setFocusedPanel('center')}
        >
          <PreviewPlayer
            project={project}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            onTogglePlayPause={handleTogglePlayPause}
            isScrubbing={isScrubbing}
            selectedClipId={selectedClipId}
            onSelectClip={handleSelectClip}
            onUpdateClip={handleUpdateClip}
            onBeginTransform={beginHistoryTransaction}
            onEndTransform={commitHistoryTransaction}
            onCancelTransform={cancelHistoryTransaction}
            onOpenSceneBroll={handleOpenSceneBroll}
            onOpenBatchBroll={handleOpenAutoBrollBatch}
            onSelectScene={handleSelectScene}
          />
        </main>

        {/* Right Dock Splitter */}
        <div
          className="sidebar-resizer"
          onMouseDown={handleRightDockResizerMouseDown}
          title="Arrastra para ajustar el ancho del panel de Controles / Lumetri Color"
        >
          <div className="sidebar-resizer-handle" />
        </div>

        {/* 3. RIGHT DOCKED PANEL: Effect Controls / Lumetri Color / Essential Graphics / Audio Mixer */}
        <aside
          className={`premiere-right-dock nle-panel ${focusedPanel === 'right' ? 'is-focused' : ''}`}
          onMouseDown={() => setFocusedPanel('right')}
          style={{
            width: `${rightDockWidth}px`,
            minWidth: `${rightDockWidth}px`,
            maxWidth: `${rightDockWidth}px`
          }}
        >
          <div className="premiere-panel-header">
            <div className="premiere-panel-tabs">
              <button
                type="button"
                className={`premiere-panel-tab ${activeRightTab === 'effects' ? 'active' : ''}`}
                onClick={() => {
                  setMountedTabs(prev => ({ ...prev, inspector: true }));
                  setActiveRightTab('effects');
                }}
              >
                <span>Effect Controls</span>
              </button>
              <button
                type="button"
                className={`premiere-panel-tab ${activeRightTab === 'lumetri' ? 'active' : ''}`}
                onClick={() => {
                  setMountedTabs(prev => ({ ...prev, inspector: true }));
                  setActiveRightTab('lumetri');
                }}
              >
                <span>Lumetri Color</span>
                <span className="premiere-tab-menu-dots">≡</span>
              </button>
              <button
                type="button"
                className={`premiere-panel-tab ${activeRightTab === 'graphics' ? 'active' : ''}`}
                onClick={() => {
                  setMountedTabs(prev => ({ ...prev, inspector: true }));
                  setActiveRightTab('graphics');
                }}
              >
                <span>Essential Graphics</span>
              </button>
              <button
                type="button"
                className={`premiere-panel-tab ${activeRightTab === 'mixer' ? 'active' : ''}`}
                onClick={() => {
                  setMountedTabs(prev => ({ ...prev, mixer: true }));
                  setActiveRightTab('mixer');
                }}
              >
                <span>Audio Mixer</span>
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px', background: '#1d1d1d' }}>
            {activeRightTab === 'mixer' ? (
              <AudioMixerPanel
                project={project}
                isPlaying={isPlaying}
                onUpdateProject={updateProjectData}
                onAddTrack={(type) => {
                  const count = (project.tracks || []).filter(t => t.type === type).length + 1;
                  const newTrack = {
                    id: `track-${type}-${Date.now()}`,
                    name: `A${count} (Pista Audio)`,
                    type: 'audio',
                    visible: true,
                    muted: false,
                    locked: false,
                    volume: 1.0,
                    clips: []
                  };
                  updateProjectData({ ...project, tracks: [...(project.tracks || []), newTrack] }, true);
                }}
              />
            ) : activeRightTab === 'effects' ? (
              <EffectControlsPanel
                selectedClip={selectedClip}
                project={project}
                onUpdateClip={handleUpdateClip}
                onBeginTransform={beginHistoryTransaction}
                onEndTransform={commitHistoryTransaction}
                onDeleteClip={handleDeleteClip}
                onDuplicateClip={handleDuplicateClip}
                onSeparateAudio={handleSeparateAudio}
                onUnlinkClip={handleUnlinkClip}
              />
            ) : activeRightTab === 'lumetri' ? (
              <LumetriColorPanel
                selectedClip={selectedClip}
                onUpdateClip={handleUpdateClip}
                onBeginTransform={beginHistoryTransaction}
                onEndTransform={commitHistoryTransaction}
              />
            ) : (
              <ClipInspector
                selectedClip={selectedClip}
                selectedClipIds={selectedClipIds}
                project={project}
                onUpdateClip={handleUpdateClip}
                onBeginTransform={beginHistoryTransaction}
                onEndTransform={commitHistoryTransaction}
                onDeleteClip={handleDeleteClip}
                onDuplicateClip={handleDuplicateClip}
                onSeparateAudio={handleSeparateAudio}
                onUnlinkClip={handleUnlinkClip}
                onOpenProjectSettings={handleOpenProjectSettings}
                onUpdateProject={updateProjectData}
                onOpenGraphicForScene={handleOpenGraphicForScene}
                onOpenSceneBroll={handleOpenSceneBroll}
                onSelectScene={handleSelectScene}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Draggable Resizer Bar (Splitter) */}
      <div
        className={`timeline-resizer ${isResizingTimeline ? 'resizing' : ''}`}
        onMouseDown={handleResizerMouseDown}
        onDoubleClick={handleToggleMaximizeTimeline}
        title="Arrastra para ajustar la altura de la línea de tiempo • Doble clic para maximizar / restaurar"
      >
        <div className="timeline-resizer-handle">
          <span className="resizer-pill" />
        </div>
      </div>

      {/* Bottom Timeline Section */}
      <footer
        className={`editor-timeline-area ${isTimelineExpanded ? 'is-expanded' : ''}`}
        style={{ height: `${timelineHeight}px` }}
        onMouseDown={() => setFocusedPanel('timeline')}
      >
        <Timeline
          project={project}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          isScrubbing={isScrubbing}
          setIsScrubbing={setIsScrubbing}
          selectedClipId={selectedClipId}
          setSelectedClipId={setSelectedClipId}
          selectedClipIds={selectedClipIds}
          setSelectedClipIds={setSelectedClipIds}
          selectedSceneId={selectedSceneId}
          onSelectScene={handleSelectScene}
          onDeleteClips={handleDeleteClip}
          onDuplicateClips={handleDuplicateClip}
          onUpdateProject={updateProjectData}
          onOpenTranscribeModal={handleOpenTranscribeModal}
          onOpenSceneDirector={handleOpenSceneDirector}
          onOpenGraphicDirector={handleOpenGraphicDirector}
          onOpenAutoCutModal={handleOpenAutoCutModal}
          onOpenGraphicForScene={handleOpenGraphicForScene}
          onOpenSceneBroll={handleOpenSceneBroll}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyPast.length > 0}
          canRedo={historyFuture.length > 0}
          onClearScenes={handleClearScenes}
          onDeleteTrack={handleDeleteTrack}
          onClearTimeline={handleClearTimelineClips}
          onSeparateAudio={handleSeparateAudio}
          onUnlinkClip={handleUnlinkClip}
          isTimelineExpanded={isTimelineExpanded}
          onToggleMaximizeTimeline={handleToggleMaximizeTimeline}
          onAddAsset={handleAddAsset}
          onUpdateAsset={handleUpdateAsset}
        />
      </footer>

      {/* Modals */}
      <ProjectSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        project={project}
        onUpdateSettings={(updated) => updateProjectData({ ...project, ...updated })}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        project={project}
      />

      <TranscribeModal
        isOpen={showTranscribeModal}
        onClose={() => setShowTranscribeModal(false)}
        project={project}
        onUpdateProject={(updated) => {
          updateProjectData(updated, true);
          handleSelectSidebarTab('transcript');
          showToast('¡Guion transcrito e insertado en la Línea Guía con éxito!', 'success');
        }}
      />

      <AutoCutModal
        isOpen={showAutoCutModal}
        onClose={() => setShowAutoCutModal(false)}
        project={project}
        selectedClipIds={selectedClipIds}
        selectedClipId={selectedClipId}
        onUpdateProject={(updated) => {
          updateProjectData(updated, true);
          showToast('¡Recortes automáticos IA aplicados con éxito! (Ctrl+Z para deshacer)', 'success');
        }}
        onBeginTransform={beginHistoryTransaction}
        onEndTransform={commitHistoryTransaction}
      />

      {showSceneDirectorModal && (
        <SceneDirectorModal
          isOpen={showSceneDirectorModal}
          onClose={() => setShowSceneDirectorModal(false)}
          project={project}
          onUpdateProject={updateProjectData}
          onApplyScenes={(updatedProj, { autoDownloadBroll = false } = {}) => {
            updateProjectData(updatedProj, true);
            handleSelectSidebarTab('scenes');
            setShowSceneDirectorModal(false);
            const sceneCount = (updatedProj.scenes?.list || []).length;
            showToast(`¡${sceneCount} escenas añadidas con éxito al Storyboard y Timeline!`, 'success');
            if (autoDownloadBroll) {
              setShowAutoBrollBatchModal(true);
            }
          }}
          onOpenSettings={() => setShowGlobalSettingsModal(true)}
          onOpenTranscribeModal={() => {
            setShowSceneDirectorModal(false);
            setShowTranscribeModal(true);
          }}
        />
      )}

      <GraphicDirectorModal
        isOpen={showGraphicDirectorModal}
        onClose={() => {
          setShowGraphicDirectorModal(false);
          setGraphicTargetScene(null);
        }}
        project={project}
        currentTime={currentTime}
        onSeek={handleSeekToTime}
        targetScene={graphicTargetScene}
        initialSceneNumber={graphicTargetScene?.sceneNumber}
        onUpdateProject={(updated) => {
          updateProjectData(updated, true);
          showToast('¡Gráficos y animaciones aplicados a la pista G1 con éxito!', 'success');
        }}
        onOpenSettings={() => setShowGlobalSettingsModal(true)}
        onSelectClip={(clipId) => {
          setSelectedClipId(clipId);
          handleSelectSidebarTab('inspector');
        }}
      />

      <GlobalSettingsModal
        isOpen={showGlobalSettingsModal}
        onClose={() => setShowGlobalSettingsModal(false)}
      />

      <AutosaveSettingsModal
        isOpen={showAutosaveModal}
        onClose={() => setShowAutosaveModal(false)}
        project={project}
        currentDirHandle={currentDirHandle}
        hasDiskHandle={hasDiskFileHandle(project.id) || Boolean(initialProject?.fileHandle)}
        lastSavedTime={lastSavedTime}
        autosaveStatus={autosaveStatus}
        onForceSave={() => performAutosave(true)}
        onSaveAsNewFile={() => handleSaveToDisk(true)}
      />

      <AutoBrollBatchModal
        isOpen={showAutoBrollBatchModal}
        onClose={() => setShowAutoBrollBatchModal(false)}
        project={project}
        onBatchComplete={(updatedProj) => {
          updateProjectData(updatedProj, true);
          handleSelectSidebarTab('scenes');
          showToast('¡Tomas de video B-Roll descargadas en disco e insertadas en la pista V2!', 'success');
        }}
      />

      {selectedSceneForBrollModal && (
        <StockMediaSearchModal
          isOpen={!!selectedSceneForBrollModal}
          onClose={() => setSelectedSceneForBrollModal(null)}
          scene={selectedSceneForBrollModal}
          project={project}
          onMediaAssigned={(updatedProj) => {
            updateProjectData(updatedProj, true);
            showToast('¡Video descargado a disco e insertado en la línea de tiempo!', 'success');
          }}
        />
      )}

      {/* Floating Modern Toast Notification */}
      {toast && (
        <div className={`editor-floating-toast toast-${toast.type}`}>
          <div className="toast-icon">
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}
          </div>
          <div className="toast-message">{toast.message}</div>
          <button
            type="button"
            className="btn-ghost icon-only btn-xs toast-close"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
