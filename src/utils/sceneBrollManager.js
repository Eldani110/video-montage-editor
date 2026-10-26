/**
 * Scene B-Roll Auto-Populator & Vision AI Editorial Curator
 * Searches matching stock media, builds candidate visual collages,
 * executes Multimodal Vision AI evaluation to filter clichés and pick the best shot,
 * saves top alternatives, downloads files to disk folder, and places clips onto timeline.
 */
import { searchStockMedia, downloadStockMediaToDisk, getSavedStockConfig, extractSceneConceptPills, getProjectMediaFolder, getCachedBaseMediaDir, resolveProjectOrientation, getOrientationLabel, isMediaMatchingOrientation } from './stockMediaClient.js';
import {
  generateSceneSearchStrategiesWithAI,
  generateBatchSceneSearchStrategiesWithAI,
  fallbackQueryGenerator,
  preFilterAndRankCandidatesWithAI,
  refineSearchQueriesFromFullSentence,
  evaluateSceneCandidatesWithVisionAI,
  evaluateDualScenesWithVisionAI,
  detectGlobalVideoTopic
} from './visualCuratorAgent.js';
import { getSavedAiConfig } from './aiClient.js';
import { resolveRealSceneTimelinePosition } from './sceneOps.js';

/**
 * Ensures a dedicated B-Roll overlay video track exists on the timeline
 */
export function ensureBrollTrack(tracks) {
  const currentTracks = [...tracks];
  let brollTrack = currentTracks.find(t =>
    t.id === 'track-v2' ||
    t.id === 'track-broll-v2' ||
    /\bv2\b/i.test(t.name || '') ||
    /b-roll/i.test(t.name || '') ||
    /superposici/i.test(t.name || '')
  );

  if (!brollTrack) {
    brollTrack = {
      id: 'track-v2',
      name: 'V2 (Superposición / B-Roll)',
      type: 'video',
      visible: true,
      muted: false,
      locked: false,
      clips: []
    };

    const v1Index = currentTracks.findIndex(t => t.type === 'video');
    if (v1Index >= 0) {
      // Place V2 above V1 so it is visually on top in the timeline and preview
      currentTracks.splice(v1Index, 0, brollTrack);
    } else {
      currentTracks.unshift(brollTrack);
    }
  }

  return { tracks: currentTracks, brollTrack };
}

/**
 * Selects up to targetCount candidates equitably across the search queries (round-robin),
 * ensuring balanced visual representation from all angles in the mosaic.
 */
export function selectEquitableCandidates(candidatesByQuery, fallbackPool = [], targetCount = 16) {
  const queryKeys = Object.keys(candidatesByQuery || {});
  if (queryKeys.length === 0) {
    return (fallbackPool || []).slice(0, targetCount);
  }

  const selected = [];
  const chosenIds = new Set();
  let addedAny = true;

  while (selected.length < targetCount && addedAny) {
    addedAny = false;
    for (const q of queryKeys) {
      if (selected.length >= targetCount) break;
      const list = candidatesByQuery[q] || [];
      const nextCandidate = list.find(c => !chosenIds.has(c.id));
      if (nextCandidate) {
        chosenIds.add(nextCandidate.id);
        selected.push(nextCandidate);
        addedAny = true;
      }
    }
  }

  // If queries had fewer items in total, fill remaining slots from the fallback pool
  if (selected.length < targetCount && fallbackPool) {
    for (const c of fallbackPool) {
      if (selected.length >= targetCount) break;
      if (!chosenIds.has(c.id)) {
        chosenIds.add(c.id);
        selected.push(c);
      }
    }
  }

  return selected;
}

/**
 * Assigns a specific stock media item to a scene, downloads it to disk,
 * updates scene metadata with alternatives and critiques, and inserts it onto the timeline.
 */
export async function assignStockMediaToScene({
  project,
  scene,
  mediaItem,
  alternatives = [],
  critique = null,
  collageDataUrl = null,
  targetTrackId = null,
  trackPreference = 'v1',
  projectFolder = null
}) {
  const targetFolder = (projectFolder || getProjectMediaFolder(project)).trim();

  // 1. Download file directly to local disk folder (zero IndexedDB!)
  const { asset } = await downloadStockMediaToDisk({
    mediaItem,
    projectId: targetFolder,
    projectFolder: targetFolder,
    scene
  });

  // 2. Authoritative timeline placement:
  // Must use the real timeline position of the scene ("el lugar de la escena"),
  // NOT the script/transcript metadata timestamp ("el tiempo del guión")!
  const realPos = resolveRealSceneTimelinePosition(scene, project);
  let clipStartTime = Number(realPos.startTime.toFixed(2));
  let clipDuration = Number((realPos.duration || scene.duration || (scene.endTime ? scene.endTime - scene.startTime : 0) || 4.0).toFixed(2));
  if (!clipDuration || clipDuration <= 0) clipDuration = 4.0;
  clipDuration = Math.max(0.5, clipDuration);

  // Target scene number and ID
  let targetSceneNumber = null;
  if (scene?.sceneNumber !== undefined && scene?.sceneNumber !== null) {
    targetSceneNumber = Number(scene.sceneNumber);
  } else if (scene?.name) {
    const m = scene.name.match(/\[E\s*0*(\d+)\]/i) || scene.name.match(/\bEscena\s*0*(\d+)\b/i);
    if (m) targetSceneNumber = Number(m[1]);
  } else if (scene?.title) {
    const m = scene.title.match(/\[E\s*0*(\d+)\]/i) || scene.title.match(/\bEscena\s*0*(\d+)\b/i);
    if (m) targetSceneNumber = Number(m[1]);
  }
  const targetSceneId = scene?.id || scene?.sceneId || (targetSceneNumber ? `scene_${targetSceneNumber}` : `scene_${Date.now()}`);

  // 3. Prepare target track
  let tracks = [...(project.tracks || [])];
  let targetTrack = null;

  if (targetTrackId && targetTrackId !== 'auto') {
    targetTrack = tracks.find(t => t.id === targetTrackId);
  }

  // If no explicit targetTrackId or if invalid, find the track with the gap or with clips
  if (!targetTrack) {
    const videoTracks = tracks.filter(t => t.type === 'video');

    // Priority A: The video track that has an empty gap at or around clipStartTime!
    const trackWithMatchingGap = videoTracks.find(t => {
      const sorted = [...(t.clips || [])].sort((a, b) => a.startTime - b.startTime);
      if (sorted.length === 0) return false;
      if (sorted[0].startTime > 0.08) {
        const gapStart = 0;
        const gapEnd = Number(sorted[0].startTime.toFixed(2));
        const overlaps = Math.max(0, Math.min(gapEnd, clipStartTime + clipDuration) - Math.max(gapStart, clipStartTime));
        if (Math.abs(gapStart - clipStartTime) < 1.0 || overlaps > 0.1 || (clipStartTime >= gapStart - 0.1 && clipStartTime <= gapEnd + 0.1)) {
          return true;
        }
      }
      let prevEnd = sorted[0].startTime + sorted[0].duration;
      for (let i = 1; i < sorted.length; i++) {
        const c = sorted[i];
        if (c.startTime - prevEnd > 0.08) {
          const gapStart = Number(prevEnd.toFixed(2));
          const gapEnd = Number(c.startTime.toFixed(2));
          const overlaps = Math.max(0, Math.min(gapEnd, clipStartTime + clipDuration) - Math.max(gapStart, clipStartTime));
          if (Math.abs(gapStart - clipStartTime) < 1.0 || overlaps > 0.1 || (clipStartTime >= gapStart - 0.1 && clipStartTime <= gapEnd + 0.1)) {
            return true;
          }
        }
        prevEnd = Math.max(prevEnd, c.startTime + c.duration);
      }
      return false;
    });

    if (trackWithMatchingGap) {
      targetTrack = trackWithMatchingGap;
    } else {
      // Priority B: The video track that actually holds the sequence (most clips)
      const trackWithMostClips = [...videoTracks].sort((a, b) => (b.clips?.length || 0) - (a.clips?.length || 0))[0];
      if (trackWithMostClips && (trackWithMostClips.clips?.length || 0) > 0) {
        targetTrack = trackWithMostClips;
      } else {
        targetTrack = videoTracks[0] || tracks[0];
      }
    }
  }

  if (!targetTrack) {
    const res = ensureBrollTrack(tracks);
    tracks = res.tracks;
    targetTrack = res.brollTrack;
  }

  // Snug gap fitting: if targetTrack has an empty gap matching clipStartTime, snap to it!
  const sortedTargetClips = [...(targetTrack.clips || [])].sort((a, b) => a.startTime - b.startTime);
  if (sortedTargetClips.length > 0) {
    if (sortedTargetClips[0].startTime > 0.08) {
      const gapStart = 0;
      const gapEnd = Number(sortedTargetClips[0].startTime.toFixed(2));
      const overlaps = Math.max(0, Math.min(gapEnd, clipStartTime + clipDuration) - Math.max(gapStart, clipStartTime));
      if (Math.abs(gapStart - clipStartTime) < 1.0 || overlaps > 0.1 || (clipStartTime >= gapStart - 0.1 && clipStartTime <= gapEnd + 0.1)) {
        clipStartTime = gapStart;
        clipDuration = Number((gapEnd - gapStart).toFixed(2));
      }
    }
    let pEnd = sortedTargetClips[0].startTime + sortedTargetClips[0].duration;
    for (let i = 1; i < sortedTargetClips.length; i++) {
      const c = sortedTargetClips[i];
      if (c.startTime - pEnd > 0.08) {
        const gapStart = Number(pEnd.toFixed(2));
        const gapEnd = Number(c.startTime.toFixed(2));
        const overlaps = Math.max(0, Math.min(gapEnd, clipStartTime + clipDuration) - Math.max(gapStart, clipStartTime));
        if (Math.abs(gapStart - clipStartTime) < 1.0 || overlaps > 0.1 || (clipStartTime >= gapStart - 0.1 && clipStartTime <= gapEnd + 0.1)) {
          clipStartTime = gapStart;
          clipDuration = Number((gapEnd - gapStart).toFixed(2));
          break;
        }
      }
      pEnd = Math.max(pEnd, c.startTime + c.duration);
    }
  }

  // 4. Create video/image clip on timeline
  const clipId = `clip_broll_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const isVideoAsset = asset.type === 'video' || (mediaItem?.type === 'video');

  const brollClip = {
    id: clipId,
    assetId: asset.id,
    trackId: targetTrack.id,
    name: `[E${targetSceneNumber || ''}] ${scene.title || asset.name}`,
    startTime: clipStartTime,
    duration: clipDuration,
    sourceStart: 0,
    sourceEnd: isVideoAsset && asset.duration && asset.duration > 0 ? Math.min(clipDuration, asset.duration) : clipDuration,
    fit: 'cover',
    scale: 1,
    opacity: 1,
    color: scene.color || '#06b6d4',
    sceneId: targetSceneId,
    sceneNumber: targetSceneNumber,
    isBroll: true
  };

  // 5. Helper to identify prior clip specifically for THIS scene on THIS track
  const isMatchingSceneClip = (c) => {
    if (!c) return false;
    // Strict ID match
    if (scene.assignedClipId && c.id === scene.assignedClipId) return true;
    if (c.sceneId && targetSceneId && c.sceneId === targetSceneId) return true;
    // Strict sceneNumber match within scene's timeline interval
    if (targetSceneNumber && c.sceneNumber && Number(c.sceneNumber) === Number(targetSceneNumber)) {
      return true;
    }
    // Name pattern match strictly for this scene number [E#]
    if (targetSceneNumber && c.name) {
      const match = c.name.match(/\[E\s*0*(\d+)\]/i) || c.name.match(/\bEscena\s*0*(\d+)\b/i);
      if (match && Number(match[1]) === Number(targetSceneNumber)) return true;
    }
    // Exact slot replacement (within 0.05s) on this track only if it does not belong to another scene
    if (Math.abs(c.startTime - clipStartTime) < 0.05) {
      if (c.sceneNumber && targetSceneNumber && Number(c.sceneNumber) !== Number(targetSceneNumber)) {
        return false;
      }
      return true;
    }
    return false;
  };

  // Add clip to the target track, replacing ONLY prior clip for this specific scene!
  // All other clips (before, after, and on other tracks) remain 100% untouched!
  tracks = tracks.map(t => {
    if (t.id === targetTrack.id) {
      const filteredClips = (t.clips || []).filter(c => !isMatchingSceneClip(c));
      return {
        ...t,
        clips: [...filteredClips, brollClip].sort((a, b) => a.startTime - b.startTime)
      };
    }
    if (t.type === 'scene') {
      const updatedSceneClips = (t.clips || []).map(sc => {
        if (sc.id === targetSceneId || (targetSceneNumber && Number(sc.sceneNumber) === Number(targetSceneNumber))) {
          return {
            ...sc,
            assignedAssetId: asset.id,
            assignedMediaUrl: asset.url,
            assignedTitle: asset.name,
            assignedThumbnail: asset.thumbnail || mediaItem.thumbnail || mediaItem.previewUrl
          };
        }
        return sc;
      });
      return { ...t, clips: updatedSceneClips };
    }
    return t;
  });

  // 6. Update scene metadata
  let updatedScenesList = [...(project.scenes?.list || [])];
  const foundIndex = updatedScenesList.findIndex(s =>
    (targetSceneId && s.id === targetSceneId) ||
    (targetSceneNumber && Number(s.sceneNumber) === Number(targetSceneNumber))
  );

  const sceneMetaUpdate = {
    assignedAssetId: asset.id,
    assignedMediaUrl: asset.url,
    assignedClipId: clipId,
    assignedTitle: asset.name,
    assignedThumbnail: asset.thumbnail || mediaItem.thumbnail || mediaItem.previewUrl,
    candidateAlternatives: alternatives.length > 0 ? alternatives : (foundIndex >= 0 ? updatedScenesList[foundIndex].candidateAlternatives || [] : []),
    curatorCritique: critique || (foundIndex >= 0 ? updatedScenesList[foundIndex].curatorCritique || null : null),
    visualCollagePreview: null
  };

  if (foundIndex >= 0) {
    updatedScenesList = updatedScenesList.map((s, idx) => idx === foundIndex ? {
      ...s,
      startTime: clipStartTime,
      duration: clipDuration,
      endTime: Number((clipStartTime + clipDuration).toFixed(2)),
      ...sceneMetaUpdate
    } : s);
  } else if (updatedScenesList.length > 0) {
    updatedScenesList = [...updatedScenesList, {
      id: targetSceneId,
      sceneNumber: targetSceneNumber,
      title: scene.title || `Escena ${targetSceneNumber}`,
      scriptText: scene.scriptText || '',
      visualDescription: scene.visualDescription || '',
      visualType: isVideoAsset ? 'video' : 'image',
      visualTypeLabel: isVideoAsset ? 'Video B-Roll' : 'Foto',
      startTime: clipStartTime,
      duration: clipDuration,
      endTime: Number((clipStartTime + clipDuration).toFixed(2)),
      color: scene.color || '#06b6d4',
      ...sceneMetaUpdate
    }].sort((a, b) => a.startTime - b.startTime);
  } else {
    updatedScenesList = [{
      id: targetSceneId,
      sceneNumber: targetSceneNumber,
      title: scene.title || `Escena ${targetSceneNumber}`,
      scriptText: scene.scriptText || '',
      visualDescription: scene.visualDescription || '',
      visualType: isVideoAsset ? 'video' : 'image',
      visualTypeLabel: isVideoAsset ? 'Video B-Roll' : 'Foto',
      startTime: clipStartTime,
      duration: clipDuration,
      endTime: Number((clipStartTime + clipDuration).toFixed(2)),
      color: scene.color || '#06b6d4',
      ...sceneMetaUpdate
    }];
  }

  // 7. Update assets list safely without accidentally dropping assets
  const oldAssetId = scene.assignedAssetId;
  const updatedAssets = [
    ...(project.assets || []).filter(a => {
      if (a.id === asset.id) return false;
      if (oldAssetId && a.id === oldAssetId) return false;
      if (targetSceneId && a.sceneId && a.sceneId === targetSceneId) return false;
      return true;
    }),
    asset
  ];

  const updatedProject = {
    ...project,
    assets: updatedAssets,
    tracks,
    scenes: {
      ...(project.scenes || {}),
      list: updatedScenesList
    }
  };

  return {
    updatedProject,
    newAsset: asset,
    newClip: brollClip
  };
}

/**
 * Swaps a scene's current media with one of its saved alternative candidates with 1 click.
 */
export async function switchSceneAlternative({
  project,
  sceneId,
  alternativeMediaItem,
  trackPreference = 'v2'
}) {
  const scene = (project.scenes?.list || []).find(s => s.id === sceneId);
  if (!scene) throw new Error('Escena no encontrada en el proyecto.');

  // Current media becomes one of the alternatives, and the selected alternative becomes the winner
  const previousWinnerMedia = {
    id: scene.assignedAssetId,
    title: scene.assignedTitle,
    previewUrl: scene.assignedMediaUrl,
    thumbnail: scene.assignedThumbnail || scene.assignedMediaUrl,
    type: scene.visualType || 'video',
    alternativeReason: 'Anterior selección del usuario'
  };

  const updatedAlternatives = (scene.candidateAlternatives || [])
    .filter(a => a.id !== alternativeMediaItem.id && a.previewUrl !== alternativeMediaItem.previewUrl);

  updatedAlternatives.unshift(previousWinnerMedia);

  const stockConfig = getSavedStockConfig();
  const effectiveTrackPreference = stockConfig.targetTrack || trackPreference || 'v2';

  return await assignStockMediaToScene({
    project,
    scene,
    mediaItem: alternativeMediaItem,
    alternatives: updatedAlternatives.slice(0, 3),
    critique: {
      ...scene.curatorCritique,
      winnerReason: `Seleccionado manualmente por el usuario desde las alternativas IA: "${alternativeMediaItem.title}"`
    },
    trackPreference: effectiveTrackPreference
  });
}

/**
 * Checks whether a scene already has media assigned or an active clip on the timeline
 */
export function isScenePopulated(scene, project) {
  if (!scene) return false;
  // 1. Direct assigned asset or media URL
  if (scene.assignedAssetId || scene.assignedMediaUrl) {
    return true;
  }
  // 2. Video track clip covering this scene
  if (project?.tracks) {
    const videoTracks = project.tracks.filter(t => t.type === 'video');
    const sNum = scene.sceneNumber ? Number(scene.sceneNumber) : null;
    for (const track of videoTracks) {
      for (const clip of (track.clips || [])) {
        if (clip.sceneId && scene.id && clip.sceneId === scene.id) return true;
        if (sNum && clip.sceneNumber && Number(clip.sceneNumber) === sNum) return true;
        if (sNum) {
          const match = clip.name?.match(/\[E\s*0*(\d+)\]/i) || clip.name?.match(/\bEscena\s*0*(\d+)\b/i);
          if (match && Number(match[1]) === sNum) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Classifies all project scenes into populated vs empty/pending
 */
export function getProjectScenesStatus(project) {
  const allScenes = project?.scenes?.list || [];
  const populated = [];
  const empty = [];

  for (const s of allScenes) {
    if (isScenePopulated(s, project)) {
      populated.push(s);
    } else {
      empty.push(s);
    }
  }

  return {
    total: allScenes.length,
    populatedCount: populated.length,
    emptyCount: empty.length,
    populatedScenes: populated,
    emptyScenes: empty,
    firstEmptyScene: empty[0] || null
  };
}

/**
 * Automatically searches, visually evaluates with Vision AI collage, downloads to disk,
 * and populates B-Roll for scenes. Supports resumption from empty scenes without restarting.
 *
 * @param {object} params
 * @param {object} params.project Active project object
 * @param {Array<object>} [params.scenes] Optional scenes subset
 * @param {boolean} [params.onlyEmptyScenes=false] If true, only processes unpopulated scenes
 * @param {number} [params.startFromSceneNumber] Optional scene number to start from
 * @param {number} [params.endAtSceneNumber] Optional scene number to end at
 * @param {boolean} [params.useVisionAI=true] If true, executes Vision AI candidate collage analysis
 * @param {Function} [params.onProgress] Progress callback
 * @param {Function} [params.onLog] Log item callback
 * @param {Function} [params.onCurrentCollage] Callback for real-time visual collage inspection
 * @param {Function} [params.onSceneAssigned] Callback invoked immediately after each scene is populated
 * @param {AbortSignal} [params.signal] AbortController signal
 */
export async function autoPopulateAllScenesBroll({
  project,
  scenes = null,
  onlyEmptyScenes = false,
  startFromSceneNumber = null,
  endAtSceneNumber = null,
  useVisionAI = true,
  mediaTypePreference = 'mixed', // 'mixed' | 'video' | 'image'
  onProgress = () => {},
  onLog = () => {},
  onCurrentCollage = () => {},
  onSceneAssigned = () => {},
  signal = null
}) {
  const allProjectScenes = project?.scenes?.list || [];
  let scenesToProcess = scenes || allProjectScenes;

  if (onlyEmptyScenes) {
    scenesToProcess = allProjectScenes.filter(s => !isScenePopulated(s, project));
  }

  if (startFromSceneNumber) {
    const minNum = Number(startFromSceneNumber);
    scenesToProcess = scenesToProcess.filter(s => (s.sceneNumber || 1) >= minNum);
  }

  if (endAtSceneNumber) {
    const maxNum = Number(endAtSceneNumber);
    scenesToProcess = scenesToProcess.filter(s => (s.sceneNumber || 1) <= maxNum);
  }

  if (scenesToProcess.length === 0) {
    onLog({
      phase: 'Finalizado',
      text: 'Todas las escenas seleccionadas ya están pobladas con recursos visuales. Nada que procesar.',
      icon: '✅'
    });
    return project;
  }

  const stockConfig = getSavedStockConfig();
  const effectivePreference = (mediaTypePreference && mediaTypePreference !== 'mixed')
    ? mediaTypePreference
    : (stockConfig.preferredMediaType || 'mixed');

  const aiConfig = getSavedAiConfig();
  let currentProject = { ...project };
  const total = scenesToProcess.length;
  const totalProjectScenes = allProjectScenes.length || total;
  const alreadyPopulatedBase = totalProjectScenes - total;

  const usedQueriesHistory = [];
  const projectSeenIds = new Set();
  const projectSeenUrls = new Set();

  // Pre-cargar recursos ya asignados en el proyecto para evitar repeticiones en las nuevas escenas
  for (const s of (currentProject.scenes?.list || [])) {
    if (s.assignedAssetId) projectSeenIds.add(s.assignedAssetId);
    if (s.assignedMediaUrl) projectSeenUrls.add(s.assignedMediaUrl);
  }
  for (const a of (currentProject.assets || [])) {
    if (a.id) projectSeenIds.add(a.id);
    if (a.url) projectSeenUrls.add(a.url);
  }

  const formatLabel = effectivePreference === 'video' ? 'Solo Videos' : (effectivePreference === 'image' ? 'Solo Imágenes' : 'Combinada (Híbrido)');
  const projectOrientation = resolveProjectOrientation(currentProject, stockConfig.preferredOrientation);
  const orientationBadge = getOrientationLabel(projectOrientation);

  const resumeText = onlyEmptyScenes
    ? `[Reanudando: ${total} escenas vacías pendientes de ${totalProjectScenes} totales]`
    : `[${total} escenas a procesar de ${totalProjectScenes} totales]`;

  onLog({
    phase: 'Inicio',
    text: `Iniciando Agente Curador Visual IA ${resumeText} [Formato: ${formatLabel} • Encuadre: ${orientationBadge}] (Búsqueda Estilo Editor & Mosaico)...`,
    icon: projectOrientation === 'portrait' ? '📱' : '👁️'
  });

  // Step 0: Detect Global Video Topic & Visual Universe
  onLog({
    phase: 'Tema Global',
    text: `Identificando Tema Principal del Video y Universo Visual para garantizar máxima concordancia y descartar elementos ajenos...`,
    icon: '🌐'
  });

  const globalVideoTopic = await detectGlobalVideoTopic({
    project: currentProject,
    scenes: scenesToProcess,
    aiConfig,
    signal
  });

  onLog({
    phase: 'Tema Fijado',
    text: `🎯 TEMA PRINCIPAL: "${globalVideoTopic.coreTopic}" | Universo Visual: "${globalVideoTopic.visualDomain}" | Orientación: ${orientationBadge}`,
    icon: '🎯',
    topicData: globalVideoTopic
  });

  // Step 1: Batch Visual Search Strategy Planning
  // Groups all scenes to process into optimized AI batches (BATCH_SIZE = 8),
  // reducing Ollama Cloud requests and prompt token consumption by ~85% while providing panoramic narrative continuity.
  onLog({
    phase: 'Planificación en Lote',
    text: `Planificando ángulos de búsqueda en lote con IA para ${total} escenas (visión panorámica y ahorro de peticiones)...`,
    icon: '📋'
  });

  const batchStrategiesMap = await generateBatchSceneSearchStrategiesWithAI({
    scenes: scenesToProcess,
    globalVideoTopic,
    aiConfig,
    signal,
    onLog
  });

  onLog({
    phase: 'Estrategia Lista',
    text: `✓ Estrategias de búsqueda en lote consolidadas para las ${total} escenas (${orientationBadge}). Iniciando búsqueda y montaje...`,
    icon: '🎯'
  });

  // Helper to fetch candidates for a single scene (max 2 queries, max 12 fresh candidates strictly matching orientation)
  const fetchCandidatesForScene = async (scene, queries, targetType) => {
    const queriesToUse = (queries && queries.length > 0 ? queries.slice(0, 2) : ['cinematic visual']);
    const candidatesByQuery = {};
    const allFound = [];

    for (const q of queriesToUse) {
      if (signal && signal.aborted) break;
      try {
        const res = await searchStockMedia({
          query: q,
          type: targetType,
          orientation: projectOrientation,
          project: currentProject,
          perPage: 16,
          skipTranslation: true
        });
        const fresh = (res.results || []).filter(item => {
          return !projectSeenIds.has(item.id) && !projectSeenUrls.has(item.previewUrl || item.downloadUrl);
        });
        const orientationMatched = fresh.filter(item => isMediaMatchingOrientation(item, projectOrientation));
        const pool = orientationMatched.length > 0 ? orientationMatched : fresh;
        const matching = targetType === 'video' ? pool.filter(item => item.type === 'video') : pool;
        const list = matching.length > 0 ? matching : pool;
        candidatesByQuery[q] = list;
        allFound.push(...list);
      } catch (err) {
        console.warn(`[StockSearch] Error en "${q}":`, err.message);
      }
    }

    return selectEquitableCandidates(candidatesByQuery, allFound, 12);
  };

  // Helper to resolve rescue candidate if no stock matched
  const rescueSceneCandidate = async (scene, targetType) => {
    try {
      const rescueQuery = `${scene.visualAnchor || globalVideoTopic?.mandatoryKeywords?.[0] || 'cinematic'}`;
      onLog({
        phase: `Rescate de Escena`,
        text: `Sin coincidencias directas para Escena ${scene.sceneNumber}. Intentando rescate temático (${orientationBadge}): "${rescueQuery}"...`,
        icon: '🆘'
      });
      const rescueRes = await searchStockMedia({
        query: rescueQuery,
        type: targetType,
        orientation: projectOrientation,
        project: currentProject,
        perPage: 16,
        skipTranslation: true
      });
      const freshRescue = (rescueRes.results || []).filter(item => !projectSeenIds.has(item.id) && (!item.previewUrl || !projectSeenUrls.has(item.previewUrl)));
      const orientedRescue = freshRescue.filter(item => isMediaMatchingOrientation(item, projectOrientation));
      const rescueCandidates = orientedRescue.length > 0 ? orientedRescue : freshRescue;
      if (rescueCandidates.length > 0) {
        return {
          winner: rescueCandidates[0],
          alternatives: rescueCandidates.slice(1, 12),
          score: 7.0
        };
      }
    } catch (rescErr) {
      console.warn('[AutoBroll] Error en búsqueda de rescate:', rescErr.message);
    }
    return null;
  };

  // Step 2: Dual-Scene Mosaic & Unified Mount Loop (Solution 1: Evaluates 2 scenes per Vision AI call!)
  for (let i = 0; i < total; i += 2) {
    if (signal && signal.aborted) {
      onLog({ phase: 'Cancelado', text: 'Proceso cancelado por el usuario.', icon: '⏹️' });
      break;
    }

    const rawSceneA = scenesToProcess[i];
    const rawSceneB = (i + 1 < total) ? scenesToProcess[i + 1] : null;

    // Prepare Scene A
    const targetMediaTypeA = (effectivePreference === 'video' || effectivePreference === 'image')
      ? effectivePreference
      : (rawSceneA.visualType || 'video');
    const sceneA = {
      ...rawSceneA,
      visualType: targetMediaTypeA,
      visualTypeLabel: targetMediaTypeA === 'video' ? 'Video B-Roll' : 'Imagen Conceptual'
    };

    // Prepare Scene B (if exists)
    let sceneB = null;
    let targetMediaTypeB = 'video';
    if (rawSceneB) {
      targetMediaTypeB = (effectivePreference === 'video' || effectivePreference === 'image')
        ? effectivePreference
        : (rawSceneB.visualType || 'video');
      sceneB = {
        ...rawSceneB,
        visualType: targetMediaTypeB,
        visualTypeLabel: targetMediaTypeB === 'video' ? 'Video B-Roll' : 'Imagen Conceptual'
      };
    }

    const pairLabel = sceneB ? `Escenas ${sceneA.sceneNumber} y ${sceneB.sceneNumber}` : `Escena ${sceneA.sceneNumber}`;
    const overallIndex = alreadyPopulatedBase + i;
    const percent = Math.min(99, Math.round((overallIndex / totalProjectScenes) * 100));

    onProgress({
      current: i + 1,
      total,
      overallCurrent: overallIndex + 1,
      overallTotal: totalProjectScenes,
      percent,
      sceneTitle: sceneA.title,
      sceneNumber: sceneA.sceneNumber,
      message: `[${overallIndex + 1}/${totalProjectScenes} Total] ${pairLabel}: Buscando candidatos de stock...`
    });

    onLog({
      phase: pairLabel,
      text: sceneB
        ? `Iniciando bloque dual: Escena ${sceneA.sceneNumber} ("${sceneA.title}") + Escena ${sceneB.sceneNumber} ("${sceneB.title}")...`
        : `Analizando Escena ${sceneA.sceneNumber} ("${sceneA.title}")...`,
      icon: '🎬'
    });

    try {
      // 1. Obtener estrategias de búsqueda en lote
      const stratA = batchStrategiesMap.get(sceneA.id) || batchStrategiesMap.get(sceneA.sceneNumber) || fallbackQueryGenerator(sceneA, globalVideoTopic);
      const stratB = sceneB ? (batchStrategiesMap.get(sceneB.id) || batchStrategiesMap.get(sceneB.sceneNumber) || fallbackQueryGenerator(sceneB, globalVideoTopic)) : null;

      usedQueriesHistory.push(...stratA.queries);
      if (stratB) usedQueriesHistory.push(...stratB.queries);

      // 2. Buscar candidatos de stock para Escena A y B
      const candidatesA = await fetchCandidatesForScene(sceneA, stratA.queries, targetMediaTypeA);
      const candidatesB = sceneB ? await fetchCandidatesForScene(sceneB, stratB.queries, targetMediaTypeB) : [];

      // 3. EVALUACIÓN VISUAL DUAL CON OJO CRÍTICO (1 SOLA LLAMADA A OLLAMA CLOUD PARA AMBAS ESCENAS)
      let winnerDataA = null;
      let winnerDataB = null;

      if (useVisionAI && (candidatesA.length > 1 || candidatesB.length > 1)) {
        if (sceneB && candidatesB.length > 0) {
          onLog({
            phase: `Mosaico Dual IA`,
            text: `👁️ Evaluando Mosaico Dual para Escenas ${sceneA.sceneNumber} y ${sceneB.sceneNumber} en 1 sola llamada a Ollama Cloud...`,
            icon: '✨'
          });

          try {
            const dualResult = await evaluateDualScenesWithVisionAI({
              sceneA,
              candidatesA,
              sceneB,
              candidatesB,
              globalVideoTopic,
              aiConfig,
              signal
            });

            winnerDataA = dualResult.sceneA;
            winnerDataB = dualResult.sceneB;

            // Actualizar vista previa en vivo en la interfaz
            if (dualResult.sceneA?.collageDataUrl) {
              onCurrentCollage({
                sceneNumber: `${sceneA.sceneNumber} & #${sceneB.sceneNumber}`,
                sceneTitle: `[A] "${sceneA.title}" • [B] "${sceneB.title}"`,
                collageDataUrl: dualResult.sceneA.collageDataUrl,
                critique: {
                  winnerIndex: `A${dualResult.sceneA.critique?.winnerIndex || 1} | B${dualResult.sceneB.critique?.winnerIndex || 1}`,
                  winnerReason: `[Escena ${sceneA.sceneNumber}]: ${dualResult.sceneA.critique?.winnerReason || 'OK'} • [Escena ${sceneB.sceneNumber}]: ${dualResult.sceneB.critique?.winnerReason || 'OK'}`
                },
                winner: dualResult.sceneA.winner,
                alternatives: [
                  ...(dualResult.sceneA.alternatives || []).slice(0, 2),
                  ...(dualResult.sceneB.alternatives || []).slice(0, 2)
                ]
              });
            }
          } catch (dualErr) {
            console.warn('[AutoBroll] Error en evaluación dual:', dualErr.message);
          }
        } else {
          // Solo Escena A (impar o última)
          onLog({
            phase: `Ojo Crítico IA`,
            text: `👁️ Evaluando Escena ${sceneA.sceneNumber} con Visión IA (${candidatesA.length} candidatos)...`,
            icon: '👁️'
          });

          try {
            winnerDataA = await evaluateSceneCandidatesWithVisionAI({
              scene: sceneA,
              candidates: candidatesA,
              globalVideoTopic,
              aiConfig,
              minAcceptableScore: 7.5,
              signal
            });

            if (winnerDataA?.collageDataUrl) {
              onCurrentCollage({
                sceneNumber: sceneA.sceneNumber,
                sceneTitle: sceneA.title,
                collageDataUrl: winnerDataA.collageDataUrl,
                critique: winnerDataA.critique,
                winner: winnerDataA.winner,
                alternatives: winnerDataA.alternatives || []
              });
            }
          } catch (singleErr) {
            console.warn('[AutoBroll] Error en evaluación simple:', singleErr.message);
          }
        }
      }

      // Manejo de Rechazo por Calidad y Auto-Rescate Independiente para cada Escena
      if (winnerDataA?.allRejected || !winnerDataA?.winner) {
        onLog({
          phase: `Auto-Rescate Escena ${sceneA.sceneNumber}`,
          text: `⚠️ Candidatos de Escena ${sceneA.sceneNumber} no alcanzaron la calidad mínima (${winnerDataA?.score || 5}/10). Buscando rescate temático...`,
          icon: '🆘'
        });
        const rescuedA = await rescueSceneCandidate(sceneA, targetMediaTypeA);
        if (rescuedA?.winner) {
          winnerDataA = rescuedA;
        } else if (candidatesA.length > 0) {
          winnerDataA = {
            winner: candidatesA[0],
            alternatives: candidatesA.slice(1, 12),
            score: 6.5,
            critique: { winnerScore: 6.5, winnerReason: 'Opción de reserva tras rescate temático' }
          };
        }
      }

      if (sceneB && (winnerDataB?.allRejected || !winnerDataB?.winner)) {
        onLog({
          phase: `Auto-Rescate Escena ${sceneB.sceneNumber}`,
          text: `⚠️ Candidatos de Escena ${sceneB.sceneNumber} no alcanzaron la calidad mínima (${winnerDataB?.score || 5}/10). Buscando rescate temático...`,
          icon: '🆘'
        });
        const rescuedB = await rescueSceneCandidate(sceneB, targetMediaTypeB);
        if (rescuedB?.winner) {
          winnerDataB = rescuedB;
        } else if (candidatesB.length > 0) {
          winnerDataB = {
            winner: candidatesB[0],
            alternatives: candidatesB.slice(1, 12),
            score: 6.5,
            critique: { winnerScore: 6.5, winnerReason: 'Opción de reserva tras rescate temático' }
          };
        }
      }

      // 4. Descarga a Disco y Asignación para Escena A
      if (winnerDataA?.winner) {
        const selectedA = winnerDataA.winner;
        projectSeenIds.add(selectedA.id);
        if (selectedA.previewUrl) projectSeenUrls.add(selectedA.previewUrl);
        if (selectedA.downloadUrl) projectSeenUrls.add(selectedA.downloadUrl);

        const projectFolder = getProjectMediaFolder(currentProject);
        const resA = await assignStockMediaToScene({
          project: currentProject,
          scene: sceneA,
          mediaItem: selectedA,
          alternatives: winnerDataA.alternatives || [],
          critique: winnerDataA.critique || null,
          collageDataUrl: winnerDataA.collageDataUrl || null,
          trackPreference: stockConfig.targetTrack || 'v2',
          projectFolder
        });
        currentProject = resA.updatedProject;

        try { onSceneAssigned(currentProject, sceneA, selectedA); } catch (e) {}

        onLog({
          phase: `Montaje Escena ${sceneA.sceneNumber}`,
          text: `✓ Asignado recurso: "${selectedA.title}" (${selectedA.type === 'video' ? 'Video' : 'Imagen'}) [${sceneA.startTime}s - ${sceneA.endTime}s] ✅`,
          icon: '🏆'
        });
      }

      // 5. Descarga a Disco y Asignación para Escena B (si existe)
      if (sceneB && winnerDataB?.winner) {
        const selectedB = winnerDataB.winner;
        projectSeenIds.add(selectedB.id);
        if (selectedB.previewUrl) projectSeenUrls.add(selectedB.previewUrl);
        if (selectedB.downloadUrl) projectSeenUrls.add(selectedB.downloadUrl);

        const projectFolder = getProjectMediaFolder(currentProject);
        const resB = await assignStockMediaToScene({
          project: currentProject,
          scene: sceneB,
          mediaItem: selectedB,
          alternatives: winnerDataB.alternatives || [],
          critique: winnerDataB.critique || null,
          collageDataUrl: winnerDataB.collageDataUrl || null,
          trackPreference: stockConfig.targetTrack || 'v2',
          projectFolder
        });
        currentProject = resB.updatedProject;

        try { onSceneAssigned(currentProject, sceneB, selectedB); } catch (e) {}

        onLog({
          phase: `Montaje Escena ${sceneB.sceneNumber}`,
          text: `✓ Asignado recurso: "${selectedB.title}" (${selectedB.type === 'video' ? 'Video' : 'Imagen'}) [${sceneB.startTime}s - ${sceneB.endTime}s] ✅`,
          icon: '🏆'
        });
      }

      const currentPairCount = Math.min(i + (sceneB ? 2 : 1), total);
      onProgress({
        current: currentPairCount,
        total,
        overallCurrent: alreadyPopulatedBase + currentPairCount,
        overallTotal: totalProjectScenes,
        percent: Math.min(99, Math.round(((alreadyPopulatedBase + currentPairCount) / totalProjectScenes) * 100)),
        sceneTitle: sceneB?.title || sceneA.title,
        sceneNumber: sceneB?.sceneNumber || sceneA.sceneNumber,
        message: `[${alreadyPopulatedBase + currentPairCount}/${totalProjectScenes} Total] Procesadas ${currentPairCount}/${total} escenas...`
      });

    } catch (err) {
      console.error(`Error procesando bloque dual:`, err);
      onLog({
        phase: `Error`,
        text: `Error en ${pairLabel}: ${err.message}`,
        icon: '❌'
      });
    }
  }

  onProgress({
    current: total,
    total,
    percent: 100,
    message: `¡Autopoblación con Agente Visual IA completada con éxito!`
  });

  onLog({
    phase: 'Finalizado',
    text: `¡Todas las escenas investigadas con criterio editorial (búsquedas inteligentes del explorador + mosaico 4x4 de 16 candidatos), evaluadas con Ojo Crítico Multimodal y montadas en disco!`,
    icon: '🎉'
  });

  return currentProject;
}
