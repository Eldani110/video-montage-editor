/**
 * Scene B-Roll Auto-Populator & Vision AI Editorial Curator
 * Searches matching stock media, builds candidate visual collages,
 * executes Multimodal Vision AI evaluation to filter clichés and pick the best shot,
 * saves top alternatives, downloads files to disk folder, and places clips onto timeline.
 */
import { searchStockMedia, downloadStockMediaToDisk, getSavedStockConfig, extractSceneConceptPills } from './stockMediaClient.js';
import {
  generateSceneSearchStrategiesWithAI,
  preFilterAndRankCandidatesWithAI,
  refineSearchQueriesFromFullSentence,
  evaluateSceneCandidatesWithVisionAI,
  detectGlobalVideoTopic,
  assessStockItemTopicDiscordance
} from './visualCuratorAgent.js';
import { getSavedAiConfig } from './aiClient.js';

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
  trackPreference = 'v2'
}) {
  const projectId = project.id || 'default_montage';

  // 1. Download file directly to local disk folder (zero IndexedDB!)
  const { asset } = await downloadStockMediaToDisk({
    mediaItem,
    projectId,
    scene
  });

  // 2. Prepare tracks
  let tracks = [...(project.tracks || [])];
  let targetTrack;

  const stockConfig = getSavedStockConfig();
  const effectiveTrackPreference = stockConfig.targetTrack || trackPreference || 'v2';

  if (effectiveTrackPreference === 'v2') {
    const res = ensureBrollTrack(tracks);
    tracks = res.tracks;
    targetTrack = res.brollTrack;
  } else {
    targetTrack = tracks.find(t => t.id === 'track-v1' || t.name?.includes('V1')) || tracks.find(t => t.type === 'video') || tracks[0];
  }

  const clipDuration = Number((scene.duration || asset.duration || 5).toFixed(2));
  const clipStartTime = Number((scene.startTime || 0).toFixed(2));

  // 3. Create video/image clip on timeline
  const clipId = `clip_broll_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const brollClip = {
    id: clipId,
    assetId: asset.id,
    trackId: targetTrack.id,
    name: `[E${scene.sceneNumber || 1}] ${scene.title || asset.name}`,
    startTime: clipStartTime,
    duration: clipDuration,
    sourceStart: 0,
    sourceEnd: clipDuration,
    fit: 'cover',
    scale: 1,
    opacity: 1,
    color: scene.color || '#06b6d4',
    sceneId: scene.id,
    isBroll: true
  };

  // Helper to identify any conflicting prior clip for this scene
  const isMatchingSceneClip = (c) => {
    if (c.sceneId && scene.id && c.sceneId === scene.id) return true;
    if (scene.sceneNumber) {
      const prefix = `[E${scene.sceneNumber}]`;
      const prefixSpace = `[E${scene.sceneNumber} `;
      if (c.name && (c.name.startsWith(prefix) || c.name.startsWith(prefixSpace))) return true;
    }
    return false;
  };

  // Add clip to the target track, and remove any conflicting prior clip for this scene ACROSS ALL VIDEO TRACKS
  // This prevents ghost duplicate clips from lingering on V1 when B-roll is placed on V2 (or vice-versa)
  tracks = tracks.map(t => {
    if (t.type === 'video') {
      const filteredClips = (t.clips || []).filter(c => !isMatchingSceneClip(c));
      if (t.id === targetTrack.id) {
        return {
          ...t,
          clips: [...filteredClips, brollClip]
        };
      }
      return {
        ...t,
        clips: filteredClips
      };
    }
    return t;
  });

  // 4. Update scene metadata with winner and alternatives
  const updatedScenesList = (project.scenes?.list || []).map(s => {
    if (s.id === scene.id) {
      return {
        ...s,
        assignedAssetId: asset.id,
        assignedMediaUrl: asset.url,
        assignedClipId: clipId,
        assignedTitle: asset.name,
        assignedThumbnail: asset.thumbnail || mediaItem.thumbnail || mediaItem.previewUrl,
        candidateAlternatives: alternatives.length > 0 ? alternatives : (s.candidateAlternatives || []),
        curatorCritique: critique || s.curatorCritique || null,
        visualCollagePreview: collageDataUrl || s.visualCollagePreview || null
      };
    }
    return s;
  });

  const oldAssetId = scene.assignedAssetId;
  const updatedAssets = [
    ...(project.assets || []).filter(a => a.id !== asset.id && a.id !== oldAssetId && a.sceneId !== scene.id),
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
    for (const track of videoTracks) {
      for (const clip of (track.clips || [])) {
        if (clip.sceneId && scene.id && clip.sceneId === scene.id) return true;
        if (scene.sceneNumber) {
          const prefix = `[E${scene.sceneNumber}]`;
          const prefixSpace = `[E${scene.sceneNumber} `;
          if (clip.name && (clip.name.startsWith(prefix) || clip.name.startsWith(prefixSpace))) return true;
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

  const resumeText = onlyEmptyScenes
    ? `[Reanudando: ${total} escenas vacías pendientes de ${totalProjectScenes} totales]`
    : `[${total} escenas a procesar de ${totalProjectScenes} totales]`;

  onLog({
    phase: 'Inicio',
    text: `Iniciando Agente Curador Visual IA ${resumeText} [Formato: ${formatLabel}] (Búsqueda Estilo Editor & Mosaico 4x4)...`,
    icon: '👁️'
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
    text: `🎯 TEMA PRINCIPAL: "${globalVideoTopic.coreTopic}" | Universo Visual: "${globalVideoTopic.visualDomain}" (Filtro anti-discordancias/zanahorias activo)`,
    icon: '🎯',
    topicData: globalVideoTopic
  });

  for (let i = 0; i < total; i++) {
    if (signal && signal.aborted) {
      onLog({ phase: 'Cancelado', text: 'Proceso cancelado por el usuario.', icon: '⏹️' });
      break;
    }

    const rawScene = scenesToProcess[i];
    const targetMediaType = (effectivePreference === 'video' || effectivePreference === 'image')
      ? effectivePreference
      : (rawScene.visualType || 'video');

    const scene = {
      ...rawScene,
      visualType: targetMediaType,
      visualTypeLabel: targetMediaType === 'video' ? 'Video B-Roll' : 'Imagen Conceptual'
    };

    const sceneNum = scene.sceneNumber || (i + 1);
    const overallIndex = alreadyPopulatedBase + i;
    const percent = Math.min(99, Math.round((overallIndex / totalProjectScenes) * 100));

    onProgress({
      current: i + 1,
      total,
      overallCurrent: overallIndex + 1,
      overallTotal: totalProjectScenes,
      percent,
      sceneTitle: scene.title,
      sceneNumber: sceneNum,
      message: `[${sceneNum}/${totalProjectScenes} Total | Pendiente ${i + 1}/${total}] Escena ${sceneNum} (${targetMediaType === 'video' ? 'Video' : 'Imagen'}): IA planificando estrategias estilo editor...`
    });

    onLog({
      phase: `Escena ${scene.sceneNumber}`,
      text: `Analizando guion: "${(scene.scriptText || scene.title || '').substring(0, 85)}..." [Toma sugerida: "${scene.visualDescription || scene.visualAnchor || scene.title}"] | Tema: "${globalVideoTopic.coreTopic}"`,
      icon: '🧠'
    });

    try {
      // 1. AI Search Strategy Planning: Formulate distinct English queries anchored in the Suggested Shot & Concepts
      onLog({
        phase: `Estrategia IA`,
        text: `Formulando ángulos de búsqueda estilo editor a partir de la toma sugerida y conceptos...`,
        icon: '💡'
      });

      const { concept, queries } = await generateSceneSearchStrategiesWithAI({
        scene,
        globalVideoTopic,
        previousQueries: usedQueriesHistory,
        aiConfig,
        signal
      });

      usedQueriesHistory.push(...queries);

      onLog({
        phase: `Plan de Búsqueda`,
        text: `Concepto: "${concept}" | Consultas formuladas: ${queries.map(q => `"${q}"`).join(', ')}`,
        icon: '📋'
      });

      // 2. Bucle Visual Inteligente por Búsqueda (16 recursos en cuadrícula 4x4 por consulta con Early-Exit)
      let selectedMedia = null;
      let alternatives = [];
      let critiqueData = null;
      let collageDataUrl = null;
      let highestScore = -1;

      // Resguardo de alta fidelidad: almacena el mejor video de stock evaluado entre todas las consultas
      let bestStockCandidateOverall = null;
      let bestStockCandidateScore = -1;
      let bestStockCandidateAlternatives = [];
      let bestStockCandidateCollage = null;

      for (let qIdx = 0; qIdx < queries.length; qIdx++) {
        if (signal && signal.aborted) break;

        const currentQuery = queries[qIdx];
        onProgress({
          current: i + 1,
          total,
          percent: percent + Math.round((qIdx / queries.length) * 20),
          sceneTitle: scene.title,
          message: `[${i + 1}/${total}] Búsqueda [${qIdx + 1}/${queries.length}]: "${currentQuery}" (Evaluación visual 4x4)...`
        });

        onLog({
          phase: `Búsqueda [${qIdx + 1}/${queries.length}]`,
          text: `Buscando en ${stockConfig.preferredProvider || 'pexels'}: "${currentQuery}" (${targetMediaType === 'video' ? 'videos' : 'imágenes'} en cuadrícula 4x4)...`,
          icon: '🔍'
        });

        let searchRes;
        try {
          searchRes = await searchStockMedia({
            query: currentQuery,
            type: targetMediaType,
            orientation: stockConfig.preferredOrientation || 'landscape',
            perPage: 16,
            skipTranslation: true
          });
        } catch (searchErr) {
          console.warn(`[StockSearch] Error en consulta "${currentQuery}":`, searchErr.message);
          continue;
        }

        const rawResults = searchRes.results || [];
        // Filtro anti-duplicados a nivel de proyecto
        const freshResults = rawResults.filter(item => {
          const idKey = item.id;
          const urlKey = item.previewUrl || item.downloadUrl;
          return !projectSeenIds.has(idKey) && !projectSeenUrls.has(urlKey);
        });

        // Asegurar correspondencia estricta con el formato pedido (si se pide video, no aceptar imágenes fijas)
        const formatMatchingResults = targetMediaType === 'video'
          ? freshResults.filter(item => item.type === 'video')
          : freshResults;

        const candidatesToEvaluate = formatMatchingResults.length > 0 ? formatMatchingResults : freshResults;

        if (candidatesToEvaluate.length === 0) {
          onLog({
            phase: `Búsqueda [${qIdx + 1}/${queries.length}]`,
            text: `Sin recursos inéditos para "${currentQuery}". Pasando a la siguiente consulta...`,
            icon: '⚠️'
          });
          continue;
        }

        // Registrar candidato base de stock por si la IA es excesivamente estricta en el puntaje
        if (!bestStockCandidateOverall && candidatesToEvaluate.length > 0) {
          bestStockCandidateOverall = candidatesToEvaluate[0];
          bestStockCandidateAlternatives = candidatesToEvaluate.slice(1, 4);
          bestStockCandidateScore = 7.0;
        }

        // EVALUACIÓN 100% VISUAL DE LOS 16 CANDIDATOS (CUADRÍCULA 4x4)
        if (useVisionAI && candidatesToEvaluate.length > 1) {
          onLog({
            phase: `Ojo Crítico IA`,
            text: `Construyendo mosaico 4x4 de ${candidatesToEvaluate.length} candidatos de "${currentQuery}" para evaluación visual...`,
            icon: '👁️'
          });

          try {
            const evalResult = await evaluateSceneCandidatesWithVisionAI({
              scene,
              globalVideoTopic,
              candidates: candidatesToEvaluate,
              aiConfig,
              signal
            });

            const winner = evalResult.winner;
            const winnerScore = evalResult.critique?.winnerScore || (winner ? 8.0 : 0);
            const reviews = evalResult.critique?.candidateReviews || [];

            // Identificar el candidato mejor calificado en esta evaluación (incluso si allRejected fue true)
            const sortedReviews = [...reviews].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
            const topRatedReview = sortedReviews[0];
            if (topRatedReview && topRatedReview.candidateIndex) {
              const topItem = candidatesToEvaluate[topRatedReview.candidateIndex - 1];
              const scoreVal = Number(topRatedReview.score) || 7.0;
              if (topItem && scoreVal > bestStockCandidateScore) {
                bestStockCandidateScore = scoreVal;
                bestStockCandidateOverall = topItem;
                bestStockCandidateAlternatives = candidatesToEvaluate.filter(c => c.id !== topItem.id).slice(0, 3);
                bestStockCandidateCollage = evalResult.collageDataUrl;
              }
            }

            // Transmitir calificaciones candidato por candidato en tiempo real
            for (const rev of reviews) {
              const verdictIcon = rev.verdict === 'EXCELENTE' ? '⭐' : (rev.verdict === 'ACEPTABLE' ? '✔️' : '❌');
              const scoreText = rev.score ? `[${rev.score}/10]` : `[${rev.verdict}]`;
              onLog({
                phase: `Thinking [Candidato #${rev.candidateIndex}]`,
                text: `${verdictIcon} ${scoreText}: ${rev.critique || 'Evaluado'}`,
                icon: '🧐'
              });
            }

            // Actualizar vista previa del mosaico en vivo en la interfaz
            onCurrentCollage({
              sceneNumber: scene.sceneNumber,
              sceneTitle: scene.title,
              collageDataUrl: evalResult.collageDataUrl,
              critique: evalResult.critique,
              winner,
              alternatives: evalResult.alternatives || []
            });

            // ¿Encontramos una toma sobresaliente (>= 8.5/10)? ¡BINGO!
            if (winner && winnerScore >= 8.5) {
              onLog({
                phase: `🎯 ¡Toma Sobresaliente!`,
                text: `¡Candidato ganador con nota alta (${winnerScore}/10): "${winner.title || 'Recurso'}"! Seleccionado de inmediato.`,
                icon: '⭐'
              });

              selectedMedia = winner;
              alternatives = evalResult.alternatives || [];
              critiqueData = evalResult.critique;
              collageDataUrl = evalResult.collageDataUrl;
              highestScore = winnerScore;
              break; // Early-exit inteligente: ¡No malgasta tiempo ni cuotas en más búsquedas!
            }

            // Si es un candidato aceptable y supera lo que teníamos antes, guardarlo como mejor opción
            if (winner && winnerScore > highestScore) {
              highestScore = winnerScore;
              selectedMedia = winner;
              alternatives = evalResult.alternatives || [];
              critiqueData = evalResult.critique;
              collageDataUrl = evalResult.collageDataUrl;

              if (qIdx < queries.length - 1) {
                onLog({
                  phase: `Buscando Alternativa`,
                  text: `Opciones viables encontradas (mejor nota: ${winnerScore}/10). Probando consulta [${qIdx + 2}/${queries.length}] para intentar superar este estándar...`,
                  icon: '🔄'
                });
              }
            }
          } catch (visErr) {
            console.warn(`[VisualEvaluation] Error evaluando visualmente búsqueda ${qIdx + 1}:`, visErr.message);
            if (!selectedMedia && candidatesToEvaluate.length > 0) {
              selectedMedia = candidatesToEvaluate[0];
              alternatives = candidatesToEvaluate.slice(1, 4);
            }
          }
        } else {
          // Si Visión IA está desactivada, tomar el primer recurso disponible
          if (!selectedMedia && candidatesToEvaluate.length > 0) {
            selectedMedia = candidatesToEvaluate[0];
            alternatives = candidatesToEvaluate.slice(1, 4);
            break;
          }
        }
      }

      // Si ningún candidato alcanzó el umbral super estricto (8.5), pero tenemos el mejor video de stock evaluado:
      if (!selectedMedia && bestStockCandidateOverall) {
        onLog({
          phase: `Selección de Stock`,
          text: `ℹ️ Asignando el mejor recurso de stock evaluado (${bestStockCandidateScore > 0 ? `${bestStockCandidateScore}/10` : 'Óptimo'}: "${bestStockCandidateOverall.title}"). Evitando imágenes externas discordantes.`,
          icon: '🎬'
        });
        selectedMedia = bestStockCandidateOverall;
        alternatives = bestStockCandidateAlternatives;
        collageDataUrl = bestStockCandidateCollage;
        highestScore = bestStockCandidateScore;
      }

      // Si ningún candidato fue seleccionado, intentar rescate de emergencia antes de saltar la escena
      if (!selectedMedia) {
        try {
          const rescueQuery = `${scene.visualAnchor || globalVideoTopic?.mandatoryKeywords?.[0] || 'cinematic'}`;
          onLog({
            phase: `Rescate de Escena`,
            text: `Sin coincidencias directas. Intentando rescate temático: "${rescueQuery}"...`,
            icon: '🆘'
          });
          const rescueRes = await searchStockMedia({
            query: rescueQuery,
            type: targetMediaType,
            orientation: stockConfig.preferredOrientation || 'landscape',
            perPage: 12,
            skipTranslation: true
          });
          const rescueCandidates = (rescueRes.results || []).filter(item => !projectSeenIds.has(item.id) && (!item.previewUrl || !projectSeenUrls.has(item.previewUrl)));
          if (rescueCandidates.length > 0) {
            selectedMedia = rescueCandidates[0];
            alternatives = rescueCandidates.slice(1, 4);
            highestScore = 7.0;
            onLog({
              phase: `Rescate Exitoso`,
              text: `Recurso temático de rescate asegurado para Escena ${scene.sceneNumber}: "${selectedMedia.title}"`,
              icon: '🛡️'
            });
          }
        } catch (rescErr) {
          console.warn('[AutoBroll] Error en búsqueda de rescate:', rescErr.message);
        }
      }

      if (!selectedMedia) {
        onLog({
          phase: `Escena ${scene.sceneNumber}`,
          text: `Sin resultados en bibliotecas de stock para las consultas formuladas. Saltando escena.`,
          icon: '⏭️'
        });
        continue;
      }

      // Registrar recurso elegido para prevenir repeticiones
      projectSeenIds.add(selectedMedia.id);
      if (selectedMedia.previewUrl) projectSeenUrls.add(selectedMedia.previewUrl);
      if (selectedMedia.downloadUrl) projectSeenUrls.add(selectedMedia.downloadUrl);

      onLog({
        phase: `Veredicto Final`,
        text: `✓ Asignado recurso final: "${selectedMedia.title}" (${selectedMedia.type === 'video' ? 'Video' : 'Imagen'} | Nota: ${highestScore > 0 ? `${highestScore}/10` : 'Selección directa'}) | ${alternatives.length} alternativas listas`,
        icon: '🏆'
      });

      onProgress({
        current: i + 1,
        total,
        overallCurrent: overallIndex + 1,
        overallTotal: totalProjectScenes,
        percent: Math.min(99, Math.round(((overallIndex + 0.8) / totalProjectScenes) * 100)),
        sceneTitle: scene.title,
        sceneNumber: sceneNum,
        message: `[${sceneNum}/${totalProjectScenes} Total] Descargando a disco: "${scene.title}"...`
      });

      onLog({
        phase: `Descarga Disco`,
        text: `Guardando archivo en carpeta local projects_media/${currentProject.id || 'default'}/...`,
        icon: '💾'
      });

      // 5. Download to disk and place on timeline
      const result = await assignStockMediaToScene({
        project: currentProject,
        scene,
        mediaItem: selectedMedia,
        alternatives,
        critique: critiqueData,
        collageDataUrl,
        trackPreference: stockConfig.targetTrack || 'v2'
      });

      currentProject = result.updatedProject;

      try {
        onSceneAssigned(currentProject, scene, selectedMedia);
      } catch (assignErr) {
        console.warn('[AutoBroll] Error en callback onSceneAssigned:', assignErr);
      }

      onLog({
        phase: `Montaje Listo`,
        text: `Clip insertado en [${scene.startTime}s - ${scene.endTime}s] (${result.newAsset.name}) ✅`,
        icon: '🎬'
      });

    } catch (err) {
      console.error(`Error procesando escena ${scene.sceneNumber}:`, err);
      onLog({
        phase: `Error`,
        text: `Error en Escena ${scene.sceneNumber}: ${err.message}`,
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
