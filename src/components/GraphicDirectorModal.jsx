import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  BarChart2,
  TrendingUp,
  Type,
  Layers,
  Quote,
  CheckCircle2,
  AlertCircle,
  Brain,
  Sliders,
  ChevronDown,
  ChevronUp,
  Settings,
  Copy,
  Check,
  Zap,
  Play,
  Activity,
  PieChart,
  Film,
  Eye,
  EyeOff,
  Cloud,
  Cpu,
  Award,
  BookOpen,
  Clock,
  Calendar,
  User,
  Trash2,
  RotateCcw
} from 'lucide-react';
import {
  GRAPHIC_VIBES,
  runGraphicDirectorAgent,
  applyGraphicsToProject,
  generateGraphicForSingleScene,
  applySingleGraphicToProject
} from '../utils/graphicDirectorAgent.js';
import {
  GRAPHIC_TYPES,
  ANIMATION_IN_TYPES,
  POSITION_PRESETS
} from '../utils/graphicEngine.js';
import { formatTimecode } from '../utils/timeFormat.js';
import { getSavedAiConfig } from '../utils/aiClient.js';

const VIBE_ICONS = {
  doc_essay: Film,
  doc_finance: TrendingUp,
  slate_minimal: Layers,
  cyber_neon: Zap,
  gold_luxury: Award
};

const GRAPHIC_TYPE_OPTIONS = [
  { id: 'title_hero', name: 'Titular / Portada Cinemática', icon: Sparkles, color: '#6366f1' },
  { id: 'doc_stat', name: 'Cifra / Métrica de Impacto', icon: TrendingUp, color: '#10b981' },
  { id: 'doc_date', name: 'Fecha Histórica / Hito', icon: Calendar, color: '#f59e0b' },
  { id: 'lower_third', name: 'Identificación de Personaje', icon: User, color: '#38bdf8' },
  { id: 'quote_callout', name: 'Cita Textual Destacada', icon: Quote, color: '#ec4899' },
  { id: 'doc_chapter', name: 'Apertura de Capítulo', icon: BookOpen, color: '#c084fc' }
];

function renderVibeVisualMockup(vibe) {
  const preview = vibe.preview;
  if (!preview) return null;

  if (preview.type === 'doc') {
    return (
      <div className="graphic-vibe-canvas">
        <span
          style={{
            fontSize: '8px',
            fontWeight: '800',
            letterSpacing: '1.2px',
            color: '#f59e0b',
            textTransform: 'uppercase',
            marginBottom: '3px',
            fontFamily: 'Outfit, sans-serif'
          }}
        >
          {preview.tag}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: '700',
            color: '#ffffff',
            textShadow: '0 2px 5px rgba(0,0,0,0.9)',
            marginBottom: '3px',
            fontFamily: 'Outfit, sans-serif',
            textAlign: 'center'
          }}
        >
          {preview.title}
        </span>
        <span
          style={{
            fontSize: '8px',
            fontWeight: '500',
            color: 'rgba(255, 255, 255, 0.85)',
            background: 'rgba(245, 158, 11, 0.18)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            padding: '1px 6px',
            borderRadius: '4px'
          }}
        >
          {preview.sub}
        </span>
      </div>
    );
  }

  if (preview.type === 'finance') {
    return (
      <div className="graphic-vibe-canvas">
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: '700',
            color: '#10b981',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            marginBottom: '1px'
          }}
        >
          {preview.tag}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '15px',
              fontWeight: '900',
              color: '#34d399',
              fontFamily: 'Montserrat, sans-serif',
              letterSpacing: '-0.5px'
            }}
          >
            {preview.num}
          </span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
            <div style={{ width: '3px', height: '6px', background: '#10b981', borderRadius: '1px' }} />
            <div style={{ width: '3px', height: '10px', background: '#10b981', borderRadius: '1px' }} />
            <div style={{ width: '3px', height: '14px', background: '#34d399', borderRadius: '1px' }} />
          </div>
        </div>
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: '600',
            color: '#94a3b8',
            marginTop: '1px',
            letterSpacing: '0.4px'
          }}
        >
          {preview.sub}
        </span>
      </div>
    );
  }

  if (preview.type === 'minimal') {
    return (
      <div className="graphic-vibe-canvas">
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            padding: '4px 10px',
            textAlign: 'center'
          }}
        >
          <span
            style={{
              fontSize: '7px',
              fontWeight: '700',
              color: '#38bdf8',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: '1px'
            }}
          >
            {preview.tag}
          </span>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: '600',
              color: '#f8fafc',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {preview.title}
          </span>
        </div>
      </div>
    );
  }

  if (preview.type === 'neon') {
    return (
      <div className="graphic-vibe-canvas">
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: '800',
            color: '#06b6d4',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            textShadow: '0 0 8px rgba(6, 182, 212, 0.7)',
            marginBottom: '2px'
          }}
        >
          {preview.tag}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #38bdf8, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 10px rgba(192, 132, 252, 0.65)',
            marginBottom: '3px'
          }}
        >
          {preview.title}
        </span>
        <span
          style={{
            fontSize: '8px',
            color: '#c084fc',
            background: 'rgba(168, 85, 247, 0.18)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            padding: '1px 5px',
            borderRadius: '3px'
          }}
        >
          {preview.sub}
        </span>
      </div>
    );
  }

  if (preview.type === 'gold') {
    return (
      <div className="graphic-vibe-canvas">
        <div style={{ width: '22px', height: '1px', background: 'rgba(251, 191, 36, 0.5)', marginBottom: '3px' }} />
        <span
          style={{
            fontSize: '11px',
            fontStyle: 'italic',
            fontWeight: '600',
            fontFamily: 'Playfair Display, serif',
            color: '#fef08a',
            textShadow: '0 2px 6px rgba(0,0,0,0.9)',
            marginBottom: '3px',
            textAlign: 'center'
          }}
        >
          {preview.title}
        </span>
        <span
          style={{
            fontSize: '7.5px',
            fontWeight: '700',
            color: '#fbbf24',
            letterSpacing: '1.2px',
            textTransform: 'uppercase'
          }}
        >
          {preview.tag}
        </span>
      </div>
    );
  }

  return null;
}

import { resolveRealSceneTimelinePosition } from '../utils/sceneOps';
export { resolveRealSceneTimelinePosition };

export function GraphicDirectorModal({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  currentTime = 0,
  onSeek = null,
  targetScene = null,
  initialSceneNumber = null,
  onOpenSettings = null,
  onSelectClip = null
}) {
  const aiConfig = getSavedAiConfig();
  const hasCloudConfig = Boolean(aiConfig?.baseUrl && aiConfig?.apiKey);

  const transcriptSegments = project.transcript?.segments || [];
  const guideTrack = (project.tracks || []).find(t => t.type === 'guide');
  const duration = project.settings?.duration || 20;

  // Real timeline position resolution for all scenes
  const enrichedScenesList = useMemo(() => {
    const rawList = project.scenes?.list || [];
    let list = [];

    if (rawList.length > 0) {
      list = rawList.map(s => {
        const isTarget = targetScene && (
          (targetScene.sceneNumber && Number(targetScene.sceneNumber) === Number(s.sceneNumber)) ||
          (targetScene.id && (targetScene.id === s.id || targetScene.sceneId === s.id)) ||
          (targetScene.isTimelineClip && Math.abs(targetScene.startTime - s.startTime) < 0.25)
        );
        const pos = resolveRealSceneTimelinePosition(s, project, isTarget ? targetScene : null);
        return {
          ...s,
          sceneNumber: Number(s.sceneNumber),
          startTime: pos.startTime,
          duration: pos.duration,
          endTime: Number((pos.startTime + pos.duration).toFixed(2)),
          timelineSource: pos.source
        };
      });
    } else {
      // Fallback: build scenes list directly from timeline tracks if project.scenes.list is empty
      const sceneTrack = (project.tracks || []).find(t => t.type === 'scene');
      if (sceneTrack && Array.isArray(sceneTrack.clips) && sceneTrack.clips.length > 0) {
        list = sceneTrack.clips.map((c, idx) => ({
          id: c.id,
          sceneNumber: Number(c.sceneNumber || (idx + 1)),
          title: c.title || c.name || `Escena ${idx + 1}`,
          scriptText: c.text || c.scriptText || '',
          visualDescription: c.visualDescription || '',
          visualType: c.visualType || 'video',
          startTime: Number(c.startTime.toFixed(2)),
          duration: Number((c.duration || 4.0).toFixed(2)),
          endTime: Number((c.startTime + (c.duration || 4.0)).toFixed(2)),
          timelineSource: 'scene_track'
        }));
      } else {
        const v1Track = (project.tracks || []).find(t => t.type === 'video');
        if (v1Track && Array.isArray(v1Track.clips) && v1Track.clips.length > 0) {
          list = v1Track.clips.map((c, idx) => ({
            id: c.id,
            sceneNumber: Number(c.sceneNumber || (idx + 1)),
            title: c.name || `Escena ${idx + 1}`,
            scriptText: c.notes || c.name || '',
            visualDescription: '',
            visualType: 'video',
            startTime: Number(c.startTime.toFixed(2)),
            duration: Number((c.duration || 4.0).toFixed(2)),
            endTime: Number((c.startTime + (c.duration || 4.0)).toFixed(2)),
            timelineSource: 'video_track'
          }));
        }
      }
    }

    // If targetScene was passed as a timeline clip and is not present in list, include it
    if (targetScene && typeof targetScene.startTime === 'number') {
      const alreadyIncluded = list.some(s =>
        (targetScene.sceneNumber && Number(s.sceneNumber) === Number(targetScene.sceneNumber)) ||
        (targetScene.id && (s.id === targetScene.id || s.sceneId === targetScene.id)) ||
        Math.abs(s.startTime - targetScene.startTime) < 0.1
      );
      if (!alreadyIncluded) {
        const customScene = {
          id: targetScene.id || `target_scene_${Date.now()}`,
          sceneNumber: Number(targetScene.sceneNumber || list.length + 1),
          title: targetScene.title || targetScene.name || `Clip (${formatTimecode(targetScene.startTime)})`,
          scriptText: targetScene.scriptText || targetScene.text || targetScene.name || '',
          visualDescription: targetScene.visualDescription || '',
          visualType: targetScene.visualType || 'video',
          startTime: Number(targetScene.startTime.toFixed(2)),
          duration: Number((targetScene.duration || 4.0).toFixed(2)),
          endTime: Number((targetScene.startTime + (targetScene.duration || 4.0)).toFixed(2)),
          timelineSource: 'passed_clip'
        };
        list.push(customScene);
        list.sort((a, b) => a.startTime - b.startTime);
      }
    }

    return list;
  }, [project.scenes?.list, project.tracks, targetScene]);

  const scenesList = enrichedScenesList;

  // Scope: 'single' (Escena Individual) vs 'batch' (Todo el proyecto)
  const [modalScope, setModalScope] = useState('single');
  const [selectedVibe, setSelectedVibe] = useState('doc_essay');
  const [engineMode, setEngineMode] = useState(hasCloudConfig ? 'cloud' : 'local');

  // Single Scene State
  const [selectedSceneNumber, setSelectedSceneNumber] = useState(1);
  const [isSingleGenerating, setIsSingleGenerating] = useState(false);
  const [singleResult, setSingleResult] = useState(null);
  const [singleTitle, setSingleTitle] = useState('');
  const [singleSubtitle, setSingleSubtitle] = useState('');
  const [singleBadge, setSingleBadge] = useState('');
  const [singleStatNumber, setSingleStatNumber] = useState('');
  const [singleStatText, setSingleStatText] = useState('');
  const [singleType, setSingleType] = useState('title_hero');
  const [singleDuration, setSingleDuration] = useState(4.0);
  const [singleErrorMessage, setSingleErrorMessage] = useState(null);

  // Batch Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressState, setProgressState] = useState({ percent: 0, message: '' });
  const [generatedResult, setGeneratedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Real-time AI Thinking state for batch
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);
  const thoughtLogRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Determine active scene based on real enriched list
  const activeScene = useMemo(() => {
    if (!enrichedScenesList || enrichedScenesList.length === 0) return null;
    return enrichedScenesList.find(s => Number(s.sceneNumber) === Number(selectedSceneNumber)) || enrichedScenesList[0];
  }, [enrichedScenesList, selectedSceneNumber]);

  // Check if active scene has an existing graphic on track G1
  const existingGraphicOnG1 = useMemo(() => {
    if (!activeScene || !project?.tracks) return null;
    const gTrack = project.tracks.find(t => t.id === 'track-graphics-g1' || t.type === 'graphics' || t.name?.includes('Gráficos'));
    if (!gTrack?.clips) return null;
    return gTrack.clips.find(c =>
      (c.sceneNumber !== undefined && Number(c.sceneNumber) === Number(activeScene.sceneNumber)) ||
      (c.sceneId && c.sceneId === activeScene.id) ||
      Math.abs(c.startTime - activeScene.startTime) < 0.35
    ) || null;
  }, [activeScene, project?.tracks]);

  // Helper to jump to scene at playhead
  const handleSelectSceneAtPlayhead = () => {
    const allTimelineClips = (project?.tracks || [])
      .filter(t => t.type === 'scene' || t.type === 'video')
      .flatMap(t => t.clips || []);

    const clipAtPlayhead = allTimelineClips.find(c =>
      currentTime >= c.startTime && currentTime < (c.startTime + c.duration)
    );

    if (clipAtPlayhead) {
      const sceneForClip = enrichedScenesList.find(s =>
        (clipAtPlayhead.sceneNumber && Number(s.sceneNumber) === Number(clipAtPlayhead.sceneNumber)) ||
        (clipAtPlayhead.sceneId && s.id === clipAtPlayhead.sceneId) ||
        Math.abs(s.startTime - clipAtPlayhead.startTime) < 0.35 ||
        (currentTime >= s.startTime && currentTime < (s.endTime || s.startTime + s.duration))
      );
      if (sceneForClip) {
        setSelectedSceneNumber(Number(sceneForClip.sceneNumber));
        return;
      }
    }

    const sceneAtPlayhead = enrichedScenesList.find(s =>
      currentTime >= s.startTime && currentTime < (s.endTime || s.startTime + s.duration)
    );

    if (sceneAtPlayhead) {
      setSelectedSceneNumber(Number(sceneAtPlayhead.sceneNumber));
    }
  };

  // Sync initial scene number or current playhead on modal open
  useEffect(() => {
    if (!isOpen) return;

    if (targetScene && targetScene.sceneNumber) {
      setSelectedSceneNumber(Number(targetScene.sceneNumber));
      setModalScope('single');
    } else if (targetScene && typeof targetScene.startTime === 'number') {
      const match = enrichedScenesList.find(s =>
        Math.abs(s.startTime - targetScene.startTime) < 0.35 ||
        (targetScene.startTime >= s.startTime && targetScene.startTime < (s.endTime || s.startTime + s.duration))
      );
      if (match) {
        setSelectedSceneNumber(Number(match.sceneNumber));
      } else if (enrichedScenesList.length > 0) {
        setSelectedSceneNumber(Number(enrichedScenesList[0].sceneNumber));
      }
      setModalScope('single');
    } else if (initialSceneNumber) {
      setSelectedSceneNumber(Number(initialSceneNumber));
      setModalScope('single');
    } else if (enrichedScenesList.length > 0) {
      handleSelectSceneAtPlayhead();
      setModalScope('single');
    } else {
      setModalScope('batch');
    }
  }, [isOpen, initialSceneNumber, targetScene, enrichedScenesList.length]);

  // When active scene changes, populate fields from existing graphic or proposal
  useEffect(() => {
    if (!activeScene) return;

    if (existingGraphicOnG1) {
      setSingleType(existingGraphicOnG1.graphicType || 'title_hero');
      setSingleTitle(existingGraphicOnG1.title || '');
      setSingleSubtitle(existingGraphicOnG1.subtitle || '');
      setSingleBadge(existingGraphicOnG1.badgeText || '');
      setSingleStatNumber(existingGraphicOnG1.statNumber || '');
      setSingleStatText(existingGraphicOnG1.statText || '');
      setSingleDuration(existingGraphicOnG1.duration || Math.min(6, Math.max(2, activeScene.duration || 4)));
      setSingleResult({ clip: existingGraphicOnG1 });
    } else {
      // Clear fields and generate quick heuristic proposal
      setSingleTitle(activeScene.title || '');
      setSingleSubtitle(activeScene.scriptText?.slice(0, 50) || '');
      setSingleBadge(`ESCENA ${activeScene.sceneNumber}`);
      setSingleStatNumber('');
      setSingleStatText('');
      setSingleType('title_hero');
      setSingleDuration(Math.min(6, Math.max(2, activeScene.duration || 4)));
      setSingleResult(null);
    }
    setSingleErrorMessage(null);
  }, [activeScene?.sceneNumber, existingGraphicOnG1?.id]);

  useEffect(() => {
    if (thoughtLogRef.current && isThinkingExpanded) {
      thoughtLogRef.current.scrollTop = thoughtLogRef.current.scrollHeight;
    }
  }, [thinkingSteps, isThinkingExpanded]);

  if (!isOpen) return null;

  // Single Scene: Generate Graphic with Full Script & Timeline Context
  const handleGenerateSingleGraphic = async () => {
    if (!activeScene) return;
    setIsSingleGenerating(true);
    setSingleErrorMessage(null);

    try {
      const storyTitle = project?.settings?.title || project?.name || 'Documental';
      const storySummary = project?.scenes?.summary || '';
      const fullScript = (transcriptSegments.length > 0
        ? transcriptSegments.map(s => s.text || '').join(' ')
        : enrichedScenesList.map(s => s.scriptText || '').join(' ')
      ).trim();

      const res = await generateGraphicForSingleScene({
        scene: {
          id: activeScene.id,
          sceneNumber: activeScene.sceneNumber,
          title: activeScene.title,
          scriptText: activeScene.scriptText || activeScene.text || '',
          visualDescription: activeScene.visualDescription || '',
          visualType: activeScene.visualType || 'video',
          startTime: activeScene.startTime,
          duration: activeScene.duration || 4.0
        },
        vibeId: selectedVibe,
        mode: engineMode === 'cloud' ? 'ai' : 'local',
        aiConfig,
        globalContext: {
          storyTitle,
          storySummary,
          fullScript,
          allScenes: enrichedScenesList,
          introducedEntities: new Set()
        }
      });

      if (res?.clip) {
        setSingleResult(res);
        setSingleType(res.clip.graphicType || 'title_hero');
        setSingleTitle(res.clip.title || '');
        setSingleSubtitle(res.clip.subtitle || '');
        setSingleBadge(res.clip.badgeText || `ESCENA ${activeScene.sceneNumber}`);
        setSingleStatNumber(res.clip.statNumber || '');
        setSingleStatText(res.clip.statText || '');
        setSingleDuration(res.clip.duration || Math.min(6, Math.max(2, activeScene.duration || 4)));
      }
    } catch (err) {
      console.error(err);
      setSingleErrorMessage(err.message || 'Error al generar efecto para la escena.');
    } finally {
      setIsSingleGenerating(false);
    }
  };

  // Single Scene: Apply to Timeline G1 with Exact Real Timeline Position
  const handleApplySingleToTimeline = () => {
    if (!activeScene) return;
    const currentVibeData = GRAPHIC_VIBES.find(v => v.id === selectedVibe) || GRAPHIC_VIBES[0];

    const isTarget = targetScene && (
      (targetScene.sceneNumber && Number(targetScene.sceneNumber) === Number(activeScene.sceneNumber)) ||
      (targetScene.id && (targetScene.id === activeScene.id || targetScene.sceneId === activeScene.id)) ||
      (targetScene.isTimelineClip && Math.abs(targetScene.startTime - activeScene.startTime) < 0.25)
    );

    const timelinePos = resolveRealSceneTimelinePosition(
      activeScene,
      project,
      isTarget ? targetScene : null
    );

    const appliedStartTime = Number(timelinePos.startTime.toFixed(2));
    const appliedDuration = Number(
      (singleDuration ? Number(singleDuration) : timelinePos.duration || 4.0).toFixed(2)
    );

    const clipToApply = {
      ...(singleResult?.clip || {}),
      id: existingGraphicOnG1?.id || `gfx_scene_${activeScene.sceneNumber}_${Date.now()}`,
      name: `[G1] ${singleTitle || 'Gráfico'} (${singleType})`,
      title: singleTitle,
      subtitle: singleSubtitle,
      badgeText: singleBadge,
      statNumber: singleStatNumber,
      statText: singleStatText,
      graphicType: singleType,
      themeId: currentVibeData.theme,
      fontFamily: currentVibeData.font,
      animationIn: currentVibeData.animationIn || 'slide-up',
      animationLoop: currentVibeData.animationLoop || 'none',
      accentColor: currentVibeData.accentColor,
      startTime: appliedStartTime,
      duration: appliedDuration,
      sceneId: activeScene.id,
      sceneNumber: Number(activeScene.sceneNumber),
      isGraphic: true
    };

    const updatedProject = applySingleGraphicToProject(project, clipToApply);
    if (onUpdateProject) {
      onUpdateProject(updatedProject);
    }

    if (onSeek) {
      onSeek(timelinePos.startTime);
    }

    if (onSelectClip) {
      onSelectClip(clipToApply.id);
    }

    onClose();
  };

  // Single Scene: Remove Graphic from G1
  const handleRemoveSingleFromTimeline = () => {
    if (!activeScene || !project?.tracks) return;
    const gTrack = project.tracks.find(
      t => (t.id === 'track-graphics-g1' || t.type === 'graphics' || t.name?.includes('Gráficos')) &&
           !t.isSubtitleTrack && t.id !== 'track-subtitles-1'
    );
    if (!gTrack) return;

    const updatedClips = (gTrack.clips || []).filter(c =>
      Number(c.sceneNumber) !== Number(activeScene.sceneNumber) && c.sceneId !== activeScene.id
    );

    const updatedTracks = project.tracks.map(t => t.id === gTrack.id ? { ...t, clips: updatedClips } : t);
    if (onUpdateProject) {
      onUpdateProject({ ...project, tracks: updatedTracks });
    }
    setSingleResult(null);
  };

  // Batch Mode: Start Analysis
  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgressState({ percent: 0, message: 'Análisis cancelado.' });
  };

  const handleModalClose = () => {
    if (isProcessing) {
      handleCancelAnalysis();
    }
    onClose();
  };

  const handleStartAnalysis = async () => {
    setErrorMessage(null);
    setGeneratedResult(null);
    setThinkingSteps([]);
    setIsThinkingExpanded(true);

    if (transcriptSegments.length === 0 && scenesList.length === 0 && (!guideTrack || guideTrack.clips.length === 0)) {
      setErrorMessage(
        'Se recomienda contar con un guion o escenas previas para que el agente analice las anclas semánticas.'
      );
    }

    if (engineMode === 'cloud' && (!aiConfig.baseUrl || !aiConfig.apiKey)) {
      setErrorMessage(
        'La API de IA no está configurada o falta la clave API. Configúrala en Ajustes Generales ⚙️ o utiliza Heurística Local.'
      );
      return;
    }

    setIsProcessing(true);
    setProgressState({ percent: 10, message: 'Iniciando Diseñador Gráfico IA...' });
    abortControllerRef.current = new AbortController();

    try {
      const projectName = project?.settings?.title || project?.name || 'Documental';
      const projectSummary = project?.scenes?.summary || '';
      const fullScript = (transcriptSegments.length > 0
        ? transcriptSegments.map(s => s.text || '').join(' ')
        : scenesList.map(s => s.scriptText || '').join(' ')
      ).trim();

      const hasActiveSubtitles = (project?.tracks || []).some(
        t => (t.id === 'track-subtitles-1' || t.isSubtitleTrack) && t.visible !== false && (t.clips || []).length > 0
      );

      const result = await runGraphicDirectorAgent({
        projectName,
        projectSummary,
        fullScript,
        transcriptSegments,
        scenes: scenesList,
        timelineDuration: duration,
        vibeId: selectedVibe,
        aspectRatio: project?.settings?.aspectRatio || '16:9',
        hasSubtitles: hasActiveSubtitles,
        aiConfig,
        forceLocal: engineMode === 'local',
        signal: abortControllerRef.current.signal,
        onProgress: (prog) => {
          setProgressState({
            percent: prog.percent,
            message: prog.message
          });
        },
        onThinkingStep: (step) => {
          setThinkingSteps((prev) => [...prev, { ...step, timestamp: Date.now() }]);
        }
      });

      setGeneratedResult(result);
      setIsProcessing(false);
      setProgressState({ percent: 100, message: '¡Análisis y Composición completados!' });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setErrorMessage(err.message || 'Error durante el análisis gráfico.');
      setIsProcessing(false);
    }
  };

  const handleToggleSceneGraphic = (sceneNumber) => {
    if (!generatedResult) return;
    const updatedDecisions = generatedResult.decisions.map(d => {
      if (d.sceneNumber === sceneNumber) {
        const nextNeeds = !d.needsGraphic;
        return {
          ...d,
          needsGraphic: nextNeeds,
          graphicType: nextNeeds ? (d.graphicType || 'title_hero') : null
        };
      }
      return d;
    });

    const activeGraphics = updatedDecisions.filter(d => d.needsGraphic && d.generatedClip).map(d => d.generatedClip);

    setGeneratedResult({
      ...generatedResult,
      decisions: updatedDecisions,
      graphicsCount: activeGraphics.length,
      cleanVideoCount: updatedDecisions.length - activeGraphics.length,
      graphicClips: activeGraphics
    });
  };

  const handleApplyToTimeline = () => {
    if (!generatedResult || !generatedResult.graphicClips) return;
    const activeClips = generatedResult.decisions
      .filter(d => d.needsGraphic && d.generatedClip)
      .map(d => d.generatedClip);

    const updated = applyGraphicsToProject(project, activeClips, { replaceExisting: true });
    if (onUpdateProject) {
      onUpdateProject(updated);
    }
    if (onSelectClip && activeClips.length > 0) {
      onSelectClip(activeClips[0].id);
    }
    onClose();
  };

  const currentVibeData = GRAPHIC_VIBES.find(v => v.id === selectedVibe) || GRAPHIC_VIBES[0];

  return (
    <div className="modal-backdrop" onClick={handleModalClose}>
      <div
        className="modal-content scene-director-modal graphic-director-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '1060px', width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '18px 24px 14px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div className="modal-title-row">
            <div
              className="modal-badge-icon"
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(99, 102, 241, 0.3))',
                borderColor: 'rgba(6, 182, 212, 0.6)',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)'
              }}
            >
              <Sparkles size={22} style={{ color: '#38bdf8' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.3px', margin: 0, color: '#ffffff' }}>
                  Editor Gráfico & Efectos IA
                </h3>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(99, 102, 241, 0.16)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.35)',
                    fontSize: '10px',
                    fontWeight: '600',
                    padding: '2px 7px'
                  }}
                >
                  <Layers size={11} style={{ marginRight: '3px' }} />
                  Pista G1
                </span>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(6, 182, 212, 0.16)',
                    color: '#38bdf8',
                    border: '1px solid rgba(6, 182, 212, 0.4)',
                    fontSize: '10px',
                    fontWeight: '700',
                    padding: '2px 8px'
                  }}
                >
                  60 FPS Cinemático
                </span>
              </div>
              <p className="modal-subtitle" style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0', lineHeight: '1.45' }}>
                {modalScope === 'single'
                  ? 'Selecciona una escena específica para diseñar su titular o motion graphic en 1 clic.'
                  : 'Analiza el guion completo y compone animaciones automáticas en las escenas que lo requieran.'}
              </p>
            </div>
          </div>
          <button className="btn-ghost icon-only" onClick={handleModalClose} title="Cerrar ventana">
            <X size={18} />
          </button>
        </div>

        {/* Modal Scope Selector Tabs */}
        <div style={{ padding: '14px 24px 0 24px', background: 'rgba(10, 16, 30, 0.4)' }}>
          <div className="graphic-scope-tabs">
            <button
              type="button"
              className={`graphic-scope-tab-btn ${modalScope === 'single' ? 'active' : ''}`}
              onClick={() => setModalScope('single')}
            >
              <Sparkles size={15} style={{ color: modalScope === 'single' ? '#38bdf8' : '#64748b' }} />
              <span>🎯 Generar por Escena Específica (Yo elijo la escena)</span>
              <span className="graphic-scope-pill">RECOMENDADO</span>
            </button>
            <button
              type="button"
              className={`graphic-scope-tab-btn ${modalScope === 'batch' ? 'active' : ''}`}
              onClick={() => setModalScope('batch')}
            >
              <Layers size={15} style={{ color: modalScope === 'batch' ? '#a5b4fc' : '#64748b' }} />
              <span>⚡ Todo el Proyecto en Lote ({scenesList.length} Escenas)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body scene-director-body" style={{ overflowY: 'auto', flex: 1, padding: '18px 24px' }}>

          {/* ========================================================================= */}
          {/* TAB 1: GENERACIÓN POR ESCENA ESPECÍFICA                                   */}
          {/* ========================================================================= */}
          {modalScope === 'single' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Scene Picker & Jump to Playhead */}
              <div className="single-scene-picker-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  <Film size={17} style={{ color: '#06b6d4', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                    Escena a Diseñar:
                  </span>
                  {scenesList.length > 0 ? (
                    <select
                      className="single-scene-select"
                      value={selectedSceneNumber}
                      onChange={(e) => setSelectedSceneNumber(Number(e.target.value))}
                    >
                      {scenesList.map((s) => (
                        <option key={s.sceneNumber} value={s.sceneNumber}>
                          Escena {s.sceneNumber}: {s.title} ({formatTimecode(s.startTime)} - {formatTimecode(s.endTime || s.startTime + s.duration)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      No hay escenas creadas. Usa "Editor IA" primero o ejecuta análisis en lote.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {scenesList.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary btn-xs"
                      onClick={handleSelectSceneAtPlayhead}
                      title="Seleccionar automáticamente la escena donde se encuentra el cabezal de reproducción"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '6px 10px' }}
                    >
                      <Clock size={12} className="text-cyan" />
                      <span>Escena en Cabezal ({formatTimecode(currentTime)})</span>
                    </button>
                  )}

                  {existingGraphicOnG1 ? (
                    <span className="badge badge-cyan" style={{ fontSize: '10px', padding: '4px 8px' }}>
                      ✨ Activo en G1
                    </span>
                  ) : (
                    <span className="badge" style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                      Sin Efecto
                    </span>
                  )}
                </div>
              </div>

              {/* Active Scene Script Box */}
              {activeScene && (
                <div className="single-scene-quote-box">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Guion de la Escena #{activeScene.sceneNumber} ({activeScene.duration.toFixed(1)}s)
                      </span>
                      <span className="badge badge-indigo" style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px' }}>
                        📍 Posición en Timeline: {formatTimecode(activeScene.startTime)} - {formatTimecode(activeScene.startTime + activeScene.duration)}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {formatTimecode(activeScene.startTime)} → {formatTimecode(activeScene.startTime + activeScene.duration)}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#f1f5f9', fontStyle: 'italic', lineHeight: '1.45' }}>
                    &ldquo;{activeScene.scriptText || activeScene.text || 'Sin texto de guión registrado.'}&rdquo;
                  </p>
                  {activeScene.visualDescription && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
                      <strong style={{ color: '#cbd5e1' }}>Toma visual: </strong>
                      {activeScene.visualDescription}
                    </div>
                  )}
                </div>
              )}

              {/* Vibe Selection Grid */}
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#cbd5e1', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={14} className="text-cyan" />
                  <span>Estilo Visual & Tipografía Cinemática:</span>
                </div>

                <div className="graphic-vibe-grid" style={{ marginBottom: '14px' }}>
                  {GRAPHIC_VIBES.map((vibe) => {
                    const isSelected = selectedVibe === vibe.id;
                    const IconComponent = VIBE_ICONS[vibe.id] || Sparkles;

                    return (
                      <div
                        key={vibe.id}
                        onClick={() => setSelectedVibe(vibe.id)}
                        className={`graphic-vibe-card ${isSelected ? 'selected' : ''}`}
                        style={{
                          '--vibe-accent': vibe.accentColor,
                          '--vibe-glow': vibe.glowColor,
                          '--vibe-bg': vibe.bgFrom
                        }}
                      >
                        <div className="graphic-vibe-top">
                          <div className="graphic-vibe-icon-box">
                            <IconComponent size={14} />
                          </div>
                          {isSelected ? (
                            <div className="graphic-vibe-selected-badge">
                              <Check size={10} />
                              <span>ACTIVO</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '10px', color: '#64748b' }}>Elegir</span>
                          )}
                        </div>

                        <div className="graphic-vibe-title">{vibe.name}</div>
                        <div className="graphic-vibe-badge">{vibe.badge}</div>

                        {renderVibeVisualMockup(vibe)}

                        <p className="graphic-vibe-desc">{vibe.desc}</p>
                        <div className="graphic-vibe-footer">
                          <span>Fuente: <strong style={{ color: '#e2e8f0' }}>{vibe.font}</strong></span>
                          <span style={{ textTransform: 'capitalize' }}>{vibe.animationIn}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Engine Bar & Generate Action */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '12px 16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Cpu size={16} className="text-cyan" />
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#cbd5e1' }}>
                    Motor de Generación:
                  </span>
                  <div className="graphic-engine-switcher">
                    <button
                      type="button"
                      className={`graphic-engine-tab ${engineMode === 'local' ? 'active-local' : ''}`}
                      onClick={() => setEngineMode('local')}
                    >
                      <Zap size={12} />
                      <span>Heurística Instantánea (5ms)</span>
                    </button>
                    <button
                      type="button"
                      className={`graphic-engine-tab ${engineMode === 'cloud' ? 'active-cloud' : ''}`}
                      onClick={() => setEngineMode('cloud')}
                    >
                      <Cloud size={12} />
                      <span>Modelo IA Cloud (1s)</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleGenerateSingleGraphic}
                  disabled={isSingleGenerating || !activeScene}
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
                    boxShadow: '0 4px 16px rgba(6, 182, 212, 0.35)',
                    padding: '8px 18px',
                    fontSize: '12px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px'
                  }}
                >
                  <Sparkles size={14} />
                  <span>
                    {isSingleGenerating
                      ? 'Analizando Escena...'
                      : existingGraphicOnG1
                      ? `Re-generar para Escena #${activeScene?.sceneNumber || 1}`
                      : `Generar Efecto para Escena #${activeScene?.sceneNumber || 1}`}
                  </span>
                </button>
              </div>

              {singleErrorMessage && (
                <div style={{ color: '#f87171', fontSize: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px' }}>
                  {singleErrorMessage}
                </div>
              )}

              {/* Live Preview Card */}
              <div
                className="single-scene-preview-card"
                style={{
                  border: `1.5px solid ${currentVibeData.accentColor || '#6366f1'}55`,
                  boxShadow: `inset 0 0 40px ${currentVibeData.accentColor || '#6366f1'}15`
                }}
              >
                {singleBadge && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 800,
                      letterSpacing: '1px',
                      color: currentVibeData.accentColor || '#38bdf8',
                      textTransform: 'uppercase',
                      marginBottom: '6px',
                      padding: '2px 8px',
                      background: `${currentVibeData.accentColor || '#38bdf8'}22`,
                      borderRadius: '4px',
                      border: `1px solid ${currentVibeData.accentColor || '#38bdf8'}44`
                    }}
                  >
                    {singleBadge}
                  </span>
                )}

                {singleStatNumber && (
                  <div
                    style={{
                      fontSize: '32px',
                      fontWeight: 900,
                      color: currentVibeData.accentColor || '#10b981',
                      fontFamily: currentVibeData.font + ', sans-serif',
                      letterSpacing: '-1px',
                      textShadow: '0 0 20px rgba(16, 185, 129, 0.5)',
                      marginBottom: '2px'
                    }}
                  >
                    {singleStatNumber}
                    {singleStatText && <span style={{ fontSize: '14px', fontWeight: 600, marginLeft: '6px', color: '#e2e8f0' }}>{singleStatText}</span>}
                  </div>
                )}

                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: '#ffffff',
                    fontFamily: currentVibeData.font + ', sans-serif',
                    letterSpacing: '-0.3px',
                    textShadow: '0 2px 14px rgba(0, 0, 0, 0.9)',
                    maxWidth: '90%',
                    lineHeight: 1.25
                  }}
                >
                  {singleTitle || 'Escribe o genera un título'}
                </div>

                {singleSubtitle && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#cbd5e1',
                      fontFamily: currentVibeData.font + ', sans-serif',
                      marginTop: '6px',
                      maxWidth: '85%',
                      lineHeight: 1.35
                    }}
                  >
                    {singleSubtitle}
                  </div>
                )}

                <div style={{ position: 'absolute', bottom: '8px', right: '12px', fontSize: '9px', color: '#64748b' }}>
                  {currentVibeData.animationIn} • {singleDuration}s
                </div>
              </div>

              {/* Fine-Tuning Inputs */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sliders size={13} className="text-cyan" />
                  <span>Ajustes Rápidos del Efecto Visual:</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Tipo de Motion Graphic
                    </label>
                    <select
                      className="input-field"
                      value={singleType}
                      onChange={(e) => setSingleType(e.target.value)}
                      style={{ fontSize: '12px', padding: '6px 10px', height: '34px' }}
                    >
                      {GRAPHIC_TYPE_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Etiqueta / Badge Superior
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={singleBadge}
                      onChange={(e) => setSingleBadge(e.target.value)}
                      placeholder="Ej: CAPÍTULO 01, DATO CLAVE..."
                      style={{ fontSize: '12px', padding: '6px 10px', height: '34px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Título Principal
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={singleTitle}
                      onChange={(e) => setSingleTitle(e.target.value)}
                      placeholder="Texto del titular..."
                      style={{ fontSize: '12px', padding: '6px 10px', height: '34px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Subtítulo / Bajada
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={singleSubtitle}
                      onChange={(e) => setSingleSubtitle(e.target.value)}
                      placeholder="Texto secundario o contexto..."
                      style={{ fontSize: '12px', padding: '6px 10px', height: '34px' }}
                    />
                  </div>
                </div>

                {singleType === 'doc_stat' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Cifra / Valor Numérico
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        value={singleStatNumber}
                        onChange={(e) => setSingleStatNumber(e.target.value)}
                        placeholder="Ej: +142%, $50M..."
                        style={{ fontSize: '12px', padding: '6px 10px', height: '34px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Etiqueta de Métrica
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        value={singleStatText}
                        onChange={(e) => setSingleStatText(e.target.value)}
                        placeholder="Ej: Crecimiento interanual..."
                        style={{ fontSize: '12px', padding: '6px 10px', height: '34px' }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>Duración del Gráfico:</span>
                    <strong style={{ color: '#38bdf8' }}>{Number(singleDuration).toFixed(1)} segundos</strong>
                  </div>
                  <input
                    type="range"
                    min="1.5"
                    max={Math.max(4, activeScene?.duration || 6)}
                    step="0.5"
                    value={singleDuration}
                    onChange={(e) => setSingleDuration(Number(e.target.value))}
                    className="range-slider"
                  />
                </div>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: ANALIZAR TODO EL PROYECTO EN LOTE                                  */}
          {/* ========================================================================= */}
          {modalScope === 'batch' && (
            <div>
              {/* Pre-flight Info Capsule */}
              {!generatedResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  <div className="graphic-preflight-capsule" style={{ marginBottom: 0 }}>
                    <div className="graphic-preflight-item">
                      <BookOpen size={13} style={{ color: '#a855f7' }} />
                      <span>
                        Guion: <strong>{transcriptSegments.length > 0 ? `${transcriptSegments.length} segmentos` : (guideTrack?.clips?.length ? `${guideTrack.clips.length} bloques guía` : 'Sin guion')}</strong>
                      </span>
                    </div>
                    <div className="graphic-preflight-item">
                      <Film size={13} style={{ color: '#06b6d4' }} />
                      <span>
                        Escenas: <strong>{scenesList.length > 0 ? `${scenesList.length} identificadas` : 'Corte continuo'}</strong>
                      </span>
                    </div>
                    <div className="graphic-preflight-item">
                      <Clock size={13} style={{ color: '#38bdf8' }} />
                      <span>
                        Duración: <strong>{formatTimecode(duration)}</strong>
                      </span>
                    </div>
                    <div className="graphic-preflight-item">
                      <Sparkles size={13} style={{ color: '#f59e0b' }} />
                      <span>
                        Salida: <strong>Pista G1 (Gráficos Motion)</strong>
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 14px',
                      background: 'rgba(6, 182, 212, 0.08)',
                      border: '1px solid rgba(6, 182, 212, 0.22)',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: '#94a3b8'
                    }}
                  >
                    <div style={{ color: '#06b6d4', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      <Award size={13} />
                      <span>Plan Editorial IA:</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', color: '#cbd5e1' }}>
                      <span>🎬 <strong>Portada inicial</strong> en escena 1</span>
                      <span>•</span>
                      <span>📅 <strong>Fechas e hitos</strong> históricos</span>
                      <span>•</span>
                      <span>👤 <strong>Personajes</strong> (1ª aparición sin repetición)</span>
                      <span>•</span>
                      <span>📊 <strong>Cifras de impacto</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Vibe Selection Grid */}
              {!generatedResult && (
                <div className="director-config-section">
                  <div className="director-section-header" style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          background: 'rgba(6, 182, 212, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#06b6d4'
                        }}
                      >
                        <Sliders size={14} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                          1. Selecciona el Perfil Estético de Motion Graphics
                        </h4>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Elige el tono visual: adaptará tipografías, paletas de color, sombras y ritmo de animación.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="graphic-vibe-grid">
                    {GRAPHIC_VIBES.map((vibe) => {
                      const isSelected = selectedVibe === vibe.id;
                      const IconComponent = VIBE_ICONS[vibe.id] || Sparkles;

                      return (
                        <div
                          key={vibe.id}
                          onClick={() => setSelectedVibe(vibe.id)}
                          className={`graphic-vibe-card ${isSelected ? 'selected' : ''}`}
                          style={{
                            '--vibe-accent': vibe.accentColor,
                            '--vibe-glow': vibe.glowColor,
                            '--vibe-bg': vibe.bgFrom
                          }}
                        >
                          <div className="graphic-vibe-top">
                            <div className="graphic-vibe-icon-box">
                              <IconComponent size={14} />
                            </div>
                            {isSelected ? (
                              <div className="graphic-vibe-selected-badge">
                                <Check size={10} />
                                <span>ACTIVO</span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '10px', color: '#64748b' }}>Elegir</span>
                            )}
                          </div>

                          <div className="graphic-vibe-title">{vibe.name}</div>
                          <div className="graphic-vibe-badge">{vibe.badge}</div>

                          {renderVibeVisualMockup(vibe)}

                          <p className="graphic-vibe-desc">{vibe.desc}</p>
                          <div className="graphic-vibe-footer">
                            <span>Fuente: <strong style={{ color: '#e2e8f0' }}>{vibe.font}</strong></span>
                            <span style={{ textTransform: 'capitalize' }}>{vibe.animationIn}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Engine Choice */}
                  <div className="graphic-engine-panel">
                    <div className="graphic-engine-info">
                      <div className="graphic-engine-icon">
                        <Cpu size={19} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                            Motor de Razonamiento Editorial:
                          </span>
                          {engineMode === 'cloud' ? (
                            <span className="badge badge-indigo" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span className="pulse-dot-green"></span>
                              Modelo IA ({aiConfig.selectedModel || 'DeepSeek'})
                            </span>
                          ) : (
                            <span className="badge badge-cyan" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span className="pulse-dot-cyan"></span>
                              Heurística Editorial Local
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '3px 0 0 0', lineHeight: '1.4' }}>
                          {engineMode === 'cloud'
                            ? `Conectado a ${aiConfig.selectedModel || 'DeepSeek'} (${aiConfig.baseUrl || 'Ollama Cloud'}) para análisis semántico.`
                            : 'Procesamiento instantáneo en navegador (<50ms). Detecta métricas, fechas y citas automáticamente.'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <div className="graphic-engine-switcher">
                        <button
                          type="button"
                          className={`graphic-engine-tab ${engineMode === 'cloud' ? 'active-cloud' : ''}`}
                          onClick={() => setEngineMode('cloud')}
                        >
                          <Cloud size={13} />
                          <span>Modelo IA Cloud</span>
                        </button>
                        <button
                          type="button"
                          className={`graphic-engine-tab ${engineMode === 'local' ? 'active-local' : ''}`}
                          onClick={() => setEngineMode('local')}
                        >
                          <Zap size={13} />
                          <span>Heurística Local</span>
                        </button>
                      </div>

                      {onOpenSettings && (
                        <button
                          type="button"
                          className="btn-ghost icon-only btn-sm"
                          onClick={onOpenSettings}
                          title="Configurar endpoint y modelo de IA"
                          style={{ color: '#94a3b8' }}
                        >
                          <Settings size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {errorMessage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(244, 63, 94, 0.12)',
                    border: '1px solid rgba(244, 63, 94, 0.35)',
                    color: '#f87171',
                    fontSize: '12px',
                    marginBottom: '16px'
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{errorMessage}</div>
                </div>
              )}

              {/* Thinking / Progress Log */}
              {(isProcessing || thinkingSteps.length > 0) && (
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginBottom: '20px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                    onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Brain size={16} className="text-cyan" />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#38bdf8' }}>
                        Secuencia de Razonamiento del Diseñador IA
                      </span>
                      {isProcessing && (
                        <span className="badge badge-cyan" style={{ fontSize: '10px' }}>
                          {progressState.percent}%
                        </span>
                      )}
                    </div>
                    {isThinkingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>

                  {isProcessing && (
                    <div style={{ marginTop: '10px' }}>
                      <div className="progress-bar-container" style={{ height: '6px' }}>
                        <div className="progress-bar-fill" style={{ width: `${progressState.percent}%` }} />
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                        {progressState.message}
                      </div>
                    </div>
                  )}

                  {isThinkingExpanded && (
                    <div
                      ref={thoughtLogRef}
                      style={{
                        maxHeight: '180px',
                        overflowY: 'auto',
                        marginTop: '12px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      {thinkingSteps.map((step, idx) => (
                        <div key={idx} style={{ fontSize: '12px', lineHeight: '1.4' }}>
                          <strong style={{ color: '#38bdf8' }}>[{step.title}] </strong>
                          <span style={{ color: '#cbd5e1' }}>{step.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Generated Results & Decisions List */}
              {generatedResult && (
                <div className="director-results-container">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      marginBottom: '20px'
                    }}
                  >
                    <div
                      style={{
                        background: 'rgba(6, 182, 212, 0.1)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        borderRadius: '8px',
                        padding: '12px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#38bdf8' }}>
                        {generatedResult.totalScenes}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Escenas Analizadas</div>
                    </div>

                    <div
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: '8px',
                        padding: '12px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#34d399' }}>
                        {generatedResult.graphicsCount}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Apoyos Gráficos Diseñados</div>
                    </div>

                    <div
                      style={{
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '8px',
                        padding: '12px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '20px', fontWeight: '800', color: '#818cf8' }}>
                        {generatedResult.cleanVideoCount}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Escenas Video Puro (Limpio)</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {generatedResult.decisions.map((dec) => {
                      const isEnabled = dec.needsGraphic;
                      const gType = GRAPHIC_TYPES.find(gt => gt.id === dec.graphicType);

                      return (
                        <div
                          key={dec.sceneNumber}
                          style={{
                            background: isEnabled ? 'rgba(8, 14, 28, 0.85)' : 'rgba(255, 255, 255, 0.02)',
                            border: isEnabled ? '1.5px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '10px',
                            padding: '14px 16px',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="badge badge-indigo" style={{ fontSize: '11px', fontWeight: '600' }}>
                                Escena {dec.sceneNumber}
                              </span>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                [{formatTimecode(dec.startTime)} - {formatTimecode(dec.startTime + dec.duration)}]
                              </span>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>
                                {dec.title}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="btn-ghost btn-xs"
                              onClick={() => handleToggleSceneGraphic(dec.sceneNumber)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: isEnabled ? '#34d399' : '#94a3b8',
                                background: isEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                                border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                                padding: '4px 10px',
                                borderRadius: '6px'
                              }}
                            >
                              {isEnabled ? <Check size={12} /> : null}
                              <span>{isEnabled ? 'Motion Graphic Activo' : 'Mantener Video Limpio'}</span>
                            </button>
                          </div>

                          {isEnabled && dec.generatedClip && (
                            <div
                              style={{
                                background: 'rgba(6, 182, 212, 0.08)',
                                border: '1px solid rgba(6, 182, 212, 0.25)',
                                borderRadius: '6px',
                                padding: '10px 12px',
                                marginTop: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <div>
                                <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: '700', textTransform: 'uppercase' }}>
                                  {gType?.name || 'Titular'}
                                </span>
                                <div style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
                                  {dec.generatedClip.title}
                                </div>
                                {dec.generatedClip.subtitle && (
                                  <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                                    {dec.generatedClip.subtitle}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {modalScope === 'single' ? (
              existingGraphicOnG1 && (
                <button
                  type="button"
                  className="btn-danger btn-xs"
                  onClick={handleRemoveSingleFromTimeline}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Trash2 size={13} />
                  <span>Eliminar Efecto de la Escena #{activeScene?.sceneNumber} en G1</span>
                </button>
              )
            ) : generatedResult ? (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setGeneratedResult(null);
                  setThinkingSteps([]);
                }}
                style={{ color: '#94a3b8' }}
              >
                ← Volver a Configuración de Estilo
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#94a3b8' }}>
                <Sparkles size={13} style={{ color: '#06b6d4', flexShrink: 0 }} />
                <span>Criterio editorial: interviene con motion graphics solo en anclas semánticas.</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button type="button" className="btn-secondary btn-sm" onClick={handleModalClose} style={{ padding: '8px 16px' }}>
              Cerrar
            </button>

            {modalScope === 'single' ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={handleApplySingleToTimeline}
                disabled={!activeScene}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                  boxShadow: '0 4px 18px rgba(16, 185, 129, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '9px 20px',
                  fontWeight: '700',
                  fontSize: '12.5px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <CheckCircle2 size={15} />
                <span>Aplicar Efecto a Escena #{activeScene?.sceneNumber || 1} en Pista G1</span>
              </button>
            ) : (
              <>
                {isProcessing && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={handleCancelAnalysis}
                    style={{
                      background: 'rgba(239, 68, 68, 0.16)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={14} />
                    <span>Detener Análisis</span>
                  </button>
                )}

                {!generatedResult ? (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={handleStartAnalysis}
                    disabled={isProcessing}
                    style={{
                      background: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 60%, #8b5cf6 100%)',
                      boxShadow: '0 4px 18px rgba(6, 182, 212, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 20px',
                      fontWeight: '700',
                      fontSize: '12.5px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: isProcessing ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Sparkles size={15} />
                    <span>{isProcessing ? 'Analizando Guion y Escenas...' : 'Ejecutar Diseñador Gráfico en Lote'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={handleApplyToTimeline}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                      boxShadow: '0 4px 18px rgba(16, 185, 129, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '9px 20px',
                      fontWeight: '700',
                      fontSize: '12.5px',
                      borderRadius: '8px',
                      border: 'none'
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>Aplicar {generatedResult.graphicsCount} Gráficos a la Pista G1</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
