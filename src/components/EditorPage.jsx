import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { MediaLibrary } from './MediaLibrary';
import { ClipInspector } from './ClipInspector';
import { PreviewPlayer } from './PreviewPlayer';
import { Timeline } from './Timeline';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { ExportModal } from './ExportModal';
import { TranscribeModal } from './TranscribeModal';
import { TranscriptPanel } from './TranscriptPanel';
import { SceneDirectorModal } from './SceneDirectorModal';
import { GraphicDirectorModal } from './GraphicDirectorModal';
import { SceneStoryboardPanel } from './SceneStoryboardPanel';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { AutoBrollBatchModal } from './AutoBrollBatchModal';
import { StockMediaSearchModal } from './StockMediaSearchModal';
import { saveProjectToDisk, hasDiskFileHandle } from '../utils/fileSystem';
import { saveProjectToCache, getMediaBlob, saveMediaBlob } from '../utils/storage';
import { getAutosaveConfig, saveAutosaveConfig } from '../utils/autosaveConfig';
import { AutosaveSettingsModal } from './AutosaveSettingsModal';
import { extractAudioTrackToWavBlob } from '../utils/audioExtractor';
import { extractWaveformData } from '../utils/audioWaveform';
import { addAssetToTimeline, sanitizeDuplicateSceneClips, separateAudioFromClip, unlinkClips } from '../utils/timelineOps';
import {
  clearScenesFromProject,
  deleteSingleScene,
  clearGuideTrackFromProject,
  deleteTrackFromProject,
  clearTimelineClips
} from '../utils/sceneOps';
import { UserNav } from './UserNav';

export function EditorPage({
  initialProject,
  onBackToHome,
  currentDirHandle,
  onGoToAuth
}) {
  const [project, setProject] = useState(() => sanitizeDuplicateSceneClips(initialProject));

  useEffect(() => {
    if (initialProject) {
      setProject(sanitizeDuplicateSceneClips(initialProject));
    }
  }, [initialProject]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState([]);
  const selectedClipId = selectedClipIds[selectedClipIds.length - 1] || null;
  const setSelectedClipId = (idOrUpdater) => {
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
  };
  const [activeSidebarTab, setActiveSidebarTab] = useState('library'); // 'library' | 'inspector' | 'transcript' | 'scenes'
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
  const [showAutoBrollBatchModal, setShowAutoBrollBatchModal] = useState(false);
  const [selectedSceneForBrollModal, setSelectedSceneForBrollModal] = useState(null);
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
          saveProjectToCache(next);
          return next;
        });
      }
    };

    restoreMedia();
    return () => { isCancelled = true; };
  }, []);



  // Auto-switch to inspector tab when a clip is selected
  useEffect(() => {
    if (selectedClipId) {
      setActiveSidebarTab('inspector');
    }
  }, [selectedClipId]);

  // Central Autosave Engine: saves to IndexedDB cache & silently to disk if handle exists
  const performAutosave = useCallback(async (isForced = false) => {
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
      if (isDirtyRef.current && projectRef.current) {
        saveProjectToCache(projectRef.current, currentDirHandle?.name);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isDirtyRef.current && projectRef.current) {
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

  // Mark unsaved on project modifications and trigger debounced autosave
  const updateProjectData = (updatedProject, immediate = false, recordHistory = true) => {
    const cleanProject = sanitizeDuplicateSceneClips(updatedProject);
    if (recordHistory) {
      try {
        const snapshot = JSON.parse(JSON.stringify(projectRef.current));
        setHistoryPast(prev => [...prev.slice(-30), snapshot]);
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
  };

  // Undo and Redo handlers
  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    const newPast = historyPast.slice(0, historyPast.length - 1);
    
    try {
      const currentSnapshot = JSON.parse(JSON.stringify(projectRef.current));
      setHistoryFuture(prev => [currentSnapshot, ...prev.slice(0, 30)]);
    } catch (e) {
      console.warn('Could not record redo snapshot', e);
    }

    setHistoryPast(newPast);
    projectRef.current = previous;
    setProject(previous);
    isDirtyRef.current = true;
    setIsSaved(false);
    setSaveStatusText('Deshacer aplicado (Ctrl+Z)');
    performAutosave();
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    const newFuture = historyFuture.slice(1);

    try {
      const currentSnapshot = JSON.parse(JSON.stringify(projectRef.current));
      setHistoryPast(prev => [...prev.slice(-30), currentSnapshot]);
    } catch (e) {
      console.warn('Could not record undo snapshot', e);
    }

    setHistoryFuture(newFuture);
    projectRef.current = next;
    setProject(next);
    isDirtyRef.current = true;
    setIsSaved(false);
    setSaveStatusText('Rehacer aplicado (Ctrl+Y)');
    performAutosave();
  };

  // Clear Scenes from Project
  const handleClearScenes = () => {
    const updated = clearScenesFromProject(project);
    updateProjectData(updated, true);
    setSaveStatusText('Escenas eliminadas (Ctrl+Z para recuperar)');
  };

  // Delete Single Scene
  const handleDeleteSingleScene = (sceneId) => {
    const updated = deleteSingleScene(project, sceneId);
    updateProjectData(updated);
  };

  // Delete Track
  const handleDeleteTrack = (trackId) => {
    const track = project.tracks?.find(t => t.id === trackId);
    if (!track) return;
    const updated = deleteTrackFromProject(project, trackId);
    updateProjectData(updated, true);
    setSaveStatusText(`Pista "${track.name}" eliminada (Ctrl+Z para recuperar)`);
  };

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
    try {
      setAutosaveStatus('saving');
      const res = await saveProjectToDisk(
        projectRef.current || project,
        currentDirHandle,
        forceSaveAs ? null : initialProject?.fileHandle,
        false // silentOnly = false (allow picker if needed)
      );
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
  const handleTogglePlayPause = (forcedState) => {
    // Blur any active DOM element so subsequent Space presses never trigger button click AND keydown simultaneously
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    setIsPlaying((prev) => (typeof forcedState === 'boolean' ? forcedState : !prev));
  };

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
  const handleAddAsset = (asset) => {
    const updatedAssets = [...(project.assets || []), asset];
    updateProjectData({ ...project, assets: updatedAssets });
  };

  const handleDeleteAsset = (assetId) => {
    const updatedAssets = (project.assets || []).filter(a => a.id !== assetId);
    // Remove references in tracks
    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.filter(c => c.assetId !== assetId)
    }));
    updateProjectData({ ...project, assets: updatedAssets, tracks: updatedTracks });
  };

  const handleAddToTimeline = (asset) => {
    let targetTrack = null;
    if (selectedClip) {
      const parentTrack = (project.tracks || []).find(t => t.id === selectedClip.trackId);
      if (parentTrack && parentTrack.type === asset.type) {
        targetTrack = parentTrack.id;
      }
    }
    if (!targetTrack && asset.type === 'audio') {
      const firstAudioTrack = (project.tracks || []).find(t => t.type === 'audio' && !t.locked);
      if (firstAudioTrack) targetTrack = firstAudioTrack.id;
    }
    const { updatedProject, selectedClipId: newSelectedId } = addAssetToTimeline(
      project,
      asset,
      targetTrack,
      currentTime
    );
    updateProjectData(updatedProject);
    if (newSelectedId) {
      setSelectedClipId(newSelectedId);
    }
  };

  // Selected clip handlers
  const selectedClip = (() => {
    if (!selectedClipId || !project?.tracks) return null;
    for (const track of (project.tracks || [])) {
      const c = (track.clips || []).find(clip => clip.id === selectedClipId);
      if (c) return c;
    }
    return null;
  })();

  const handleUpdateClip = (clipId, updates) => {
    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.id === clipId ? { ...c, ...updates } : c)
    }));
    updateProjectData({ ...project, tracks: updatedTracks });
  };

  const handleDeleteClip = (clipId = null) => {
    const idsToDelete = clipId ? [clipId] : (selectedClipIds.length > 0 ? selectedClipIds : (selectedClipId ? [selectedClipId] : []));
    if (idsToDelete.length === 0) return;
    const deleteSet = new Set(idsToDelete);

    const updatedTracks = project.tracks.map(t => ({
      ...t,
      clips: t.clips
        .filter(c => !deleteSet.has(c.id))
        .map(c => deleteSet.has(c.linkedClipId) ? { ...c, linkedClipId: undefined } : c)
    }));
    updateProjectData({ ...project, tracks: updatedTracks });
    setSelectedClipIds([]);
  };

  const handleOpenTranscribeModal = useCallback(() => setShowTranscribeModal(true), []);
  const handleOpenSceneDirector = useCallback(() => setShowSceneDirectorModal(true), []);
  const handleOpenGraphicDirector = useCallback(() => setShowGraphicDirectorModal(true), []);
  const handleOpenAutoBrollBatch = useCallback(() => setShowAutoBrollBatchModal(true), []);
  const handleSeekToTime = useCallback((t) => setCurrentTime(t), []);
  const handleSelectClip = useCallback((clipId) => {
    setSelectedClipId(clipId);
    setActiveSidebarTab('inspector');
  }, []);
  const handleOpenSceneBroll = useCallback((scene) => setSelectedSceneForBrollModal(scene), []);

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

  const handleUnlinkClip = (clipId) => {
    const targetId = clipId || selectedClipId;
    if (!targetId) return;
    const updatedProject = unlinkClips(project, targetId);
    updateProjectData(updatedProject);
    setSaveStatusText('Clips desvinculados (ahora son independientes)');
  };

  const handleDuplicateClip = (clipId = null) => {
    const idsToDup = clipId ? [clipId] : (selectedClipIds.length > 0 ? selectedClipIds : (selectedClipId ? [selectedClipId] : []));
    if (idsToDup.length === 0) return;
    const dupSet = new Set(idsToDup);

    const newClipsByTrack = new Map();
    const newSelectedIds = [];

    for (const track of project.tracks) {
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

    const updatedTracks = project.tracks.map(t => {
      const added = newClipsByTrack.get(t.id);
      if (added && added.length > 0) {
        return { ...t, clips: [...t.clips, ...added] };
      }
      return t;
    });

    updateProjectData({ ...project, tracks: updatedTracks });
    if (newSelectedIds.length > 0) {
      setSelectedClipIds(newSelectedIds);
    }
  };

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
      {/* Top Application Bar */}
      <header className="editor-top-bar">
        <div className="top-bar-left">
          <button className="btn-ghost" onClick={onBackToHome} title="Regresar al Gestor de Proyectos">
            <ArrowLeft size={16} />
            Proyectos
          </button>

          <div className="top-divider"></div>

          {/* Undo / Redo Action Buttons */}
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
              <Undo2 size={15} />
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
              <Redo2 size={15} />
            </button>
          </div>

          <div className="top-divider"></div>

          <div className="project-title-editor">
            <input
              type="text"
              className="project-name-input"
              value={project.name}
              onChange={(e) => updateProjectData({ ...project, name: e.target.value })}
              title="Haz clic para renombrar el proyecto"
            />
            <span className="badge badge-indigo">
              {project.settings?.aspectRatio || '16:9'}
            </span>
          </div>

          <div
            className="save-status-indicator"
            onClick={() => setShowAutosaveModal(true)}
            title="Clic para ver detalles y configuración del sistema de autoguardado"
            role="button"
            tabIndex={0}
          >
            {autosaveStatus === 'saving' ? (
              <span className="status-saving">
                <Loader2 size={13} className="spin text-cyan" />
                <span>Autoguardando...</span>
              </span>
            ) : autosaveStatus === 'saved' ? (
              <span className="status-saved">
                <span className="pulsing-dot" />
                <CheckCircle2 size={13} className="text-emerald" />
                <span>{saveStatusText}</span>
              </span>
            ) : autosaveStatus === 'pending' ? (
              <span className="status-pending">
                <CloudUpload size={13} className="text-amber" />
                <span>{saveStatusText}</span>
              </span>
            ) : autosaveStatus === 'disabled' ? (
              <span className="status-disabled">
                <CloudOff size={13} className="text-dim" />
                <span>Autoguardado en pausa</span>
              </span>
            ) : (
              <span className="status-unsaved">
                <AlertCircle size={13} className="text-amber" />
                <span>{saveStatusText}</span>
              </span>
            )}
          </div>
        </div>

        <div className="top-bar-right">
          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowSceneDirectorModal(true)}
            title="Analizar guion con IA y crear escenas de montaje (Storyboard)"
            style={{
              borderColor: 'rgba(6, 182, 212, 0.45)',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.18), rgba(99, 102, 241, 0.18))',
              color: '#38bdf8'
            }}
          >
            <Film size={14} style={{ color: '#06b6d4' }} />
            Editor IA
          </button>

          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowGraphicDirectorModal(true)}
            title="Diseñar títulos con sombra, gráficos estadísticos y animaciones con el Diseñador Gráfico IA en 2 etapas"
            style={{
              borderColor: 'rgba(236, 72, 153, 0.45)',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.18), rgba(236, 72, 153, 0.18))',
              color: '#f472b6'
            }}
          >
            <Sparkles size={14} style={{ color: '#ec4899' }} />
            Efectos & Gráficos IA
          </button>

          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowTranscribeModal(true)}
            title="Transcribir audio/video con IA y generar Línea Guía"
            style={{ borderColor: 'rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.1)' }}
          >
            <Sparkles size={14} style={{ color: '#c084fc' }} />
            Transcribir IA
          </button>

          <button
            className="btn-secondary btn-sm"
            onClick={() => setShowSettingsModal(true)}
            title="Ajustes de resolución y dimensiones"
          >
            <Settings size={14} />
            Ajustes
          </button>

          <button
            className="btn-secondary btn-sm"
            onClick={() => handleSaveToDisk(false)}
            title="Guardar archivo en disco (Ctrl+S)"
          >
            <Save size={14} />
            Guardar en Disco
          </button>

          <button
            className="btn-primary btn-sm"
            onClick={() => setShowExportModal(true)}
            title="Exportar video montado como archivo final"
          >
            <Film size={14} />
            Exportar Video
          </button>

          <div style={{ width: '1px', height: '22px', background: 'var(--border-subtle)', margin: '0 4px' }} />

          <UserNav onGoToAuth={onGoToAuth} />
        </div>
      </header>

      {/* Main Workspace (Split: Left Sidebar + Center Monitor / Bottom Timeline) */}
      <div className="editor-workspace">
        {/* Left Side Panel (Tabs: Assets Library, Properties Inspector & AI Transcript) */}
        <aside
          className="editor-sidebar"
          style={{
            width: `${sidebarWidth}px`,
            minWidth: `${sidebarWidth}px`,
            maxWidth: `${sidebarWidth}px`
          }}
        >
          <div className="sidebar-tabs-header">
            <button
              className={`sidebar-tab ${activeSidebarTab === 'library' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('library')}
            >
              <Layers size={15} />
              Recursos ({project.assets?.length || 0})
            </button>
            <button
              className={`sidebar-tab ${activeSidebarTab === 'inspector' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('inspector')}
            >
              <Sliders size={15} />
              Propiedades
            </button>
            <button
              className={`sidebar-tab ${activeSidebarTab === 'transcript' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('transcript')}
            >
              <FileText size={15} style={{ color: (project.tracks || []).some(t => t.type === 'guide') ? '#c084fc' : undefined }} />
              Guion IA {(project.tracks || []).some(t => t.type === 'guide') ? '✓' : ''}
            </button>
            <button
              className={`sidebar-tab ${activeSidebarTab === 'scenes' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('scenes')}
            >
              <Film size={15} style={{ color: (project.scenes?.list || []).length > 0 ? '#06b6d4' : undefined }} />
              Escenas {(project.scenes?.list || []).length > 0 ? `(${project.scenes.list.length})` : ''}
            </button>

            {/* Quick Expand / Restore Button */}
            <button
              className={`sidebar-tab-action-btn ${isSidebarExpanded ? 'active' : ''}`}
              onClick={handleToggleMaximizeSidebar}
              title={isSidebarExpanded ? "Restaurar ancho normal" : "Ampliar panel de propiedades"}
            >
              {isSidebarExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>

          <div className="sidebar-content">
            {activeSidebarTab === 'library' && (
              <MediaLibrary
                assets={project.assets || []}
                onAddAsset={handleAddAsset}
                onDeleteAsset={handleDeleteAsset}
                onAddToTimeline={handleAddToTimeline}
                project={project}
                onOpenProjectSettings={() => setShowSettingsModal(true)}
              />
            )}
            {activeSidebarTab === 'inspector' && (
              <ClipInspector
                selectedClip={selectedClip}
                selectedClipIds={selectedClipIds}
                project={project}
                onUpdateClip={handleUpdateClip}
                onDeleteClip={handleDeleteClip}
                onDuplicateClip={handleDuplicateClip}
                onSeparateAudio={handleSeparateAudio}
                onUnlinkClip={handleUnlinkClip}
                onOpenProjectSettings={() => setShowSettingsModal(true)}
                onUpdateProject={updateProjectData}
              />
            )}
            {activeSidebarTab === 'transcript' && (
              <TranscriptPanel
                project={project}
                currentTime={currentTime}
                onSeekToTime={handleSeekToTime}
                onOpenTranscribeModal={handleOpenTranscribeModal}
              />
            )}
            {activeSidebarTab === 'scenes' && (
              <SceneStoryboardPanel
                project={project}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                onOpenSceneDirector={handleOpenSceneDirector}
                onClearScenes={handleClearScenes}
                onDeleteScene={handleDeleteSingleScene}
                onUpdateProject={updateProjectData}
                onOpenAutoBrollBatch={handleOpenAutoBrollBatch}
              />
            )}
          </div>
        </aside>

        {/* Sidebar Horizontal Resizer Splitter */}
        <div
          className={`sidebar-resizer ${isResizingSidebar ? 'resizing' : ''}`}
          onMouseDown={handleSidebarResizerMouseDown}
          onDoubleClick={handleToggleMaximizeSidebar}
          title="Arrastra para cambiar el ancho del panel lateral (doble clic para ampliar)"
        >
          <div className="sidebar-resizer-handle" />
        </div>

        {/* Center Canvas Monitor Area */}
        <main className="editor-monitor-area">
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
            onOpenSceneBroll={handleOpenSceneBroll}
            onOpenBatchBroll={handleOpenAutoBrollBatch}
          />
        </main>
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
          onDeleteClips={handleDeleteClip}
          onDuplicateClips={handleDuplicateClip}
          onUpdateProject={updateProjectData}
          onOpenTranscribeModal={handleOpenTranscribeModal}
          onOpenSceneDirector={handleOpenSceneDirector}
          onOpenGraphicDirector={handleOpenGraphicDirector}
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
          setActiveSidebarTab('transcript');
          showToast('¡Guion transcrito e insertado en la Línea Guía con éxito!', 'success');
        }}
      />

      {showSceneDirectorModal && (
        <SceneDirectorModal
          isOpen={showSceneDirectorModal}
          onClose={() => setShowSceneDirectorModal(false)}
          project={project}
          onUpdateProject={updateProjectData}
          onApplyScenes={(updatedProj, { autoDownloadBroll = false } = {}) => {
            updateProjectData(updatedProj, true);
            setActiveSidebarTab('scenes');
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
        onClose={() => setShowGraphicDirectorModal(false)}
        project={project}
        onUpdateProject={(updated) => {
          updateProjectData(updated, true);
          showToast('¡Gráficos y animaciones aplicados a la pista G1 con éxito!', 'success');
        }}
        onOpenSettings={() => setShowGlobalSettingsModal(true)}
        onSelectClip={(clipId) => {
          setSelectedClipId(clipId);
          setActiveSidebarTab('inspector');
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
          setActiveSidebarTab('scenes');
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
