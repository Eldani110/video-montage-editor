/**
 * AI Graphic Director Agent (Editor Gráfico & Efectos IA)
 * 
 * Analyzes video scripts and timeline scenes like a professional Motion Graphic Designer.
 * Operates in 2 distinct stages:
 * - Stage 1: Macro-analysis of the script & timeline to decide which scenes need visual graphic support
 *            and which scenes should remain purely video to prevent visual clutter.
 * - Stage 2: Generates professional graphic composition (typography, shadows, animations,
 *            charts, metrics, lower thirds) using the graphic engine tools.
 */

import { sendAiChatCompletion, parseAiJsonResponse } from './aiClient.js';
import { formatTimecode } from './timeFormat.js';
import {
  GRAPHIC_TYPES,
  GRAPHIC_COLOR_THEMES,
  FONT_OPTIONS,
  ANIMATION_IN_TYPES,
  createGraphicClip
} from './graphicEngine.js';

export const GRAPHIC_VIBES = [
  {
    id: 'doc_essay',
    name: 'Documental & Video-Essay',
    badge: 'Vox / VisualPolitik',
    font: 'Outfit',
    theme: 'doc_classic',
    animationIn: 'fade',
    animationLoop: 'none',
    accentColor: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    bgFrom: 'rgba(245, 158, 11, 0.16)',
    desc: 'Títulos limpios sobre metraje: capítulos, cifras de impacto en amarillo documental y líneas de tiempo minimalistas. Sin tarjetas artificiales.',
    preview: {
      tag: 'CAPÍTULO 01',
      title: 'El Dilema Global',
      sub: '800M de personas',
      type: 'doc'
    }
  },
  {
    id: 'doc_finance',
    name: 'Finanzas & Cifras Clave',
    badge: 'Estadísticas / Métricas',
    font: 'Montserrat',
    theme: 'doc_yellow',
    animationIn: 'fade',
    animationLoop: 'none',
    accentColor: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.35)',
    bgFrom: 'rgba(16, 185, 129, 0.16)',
    desc: 'Cifras cuantitativas colosales y métricas clave sobre el metraje con sombra cinematográfica profunda.',
    preview: {
      tag: 'CRECIMIENTO ANUAL',
      title: '+142.8%',
      sub: 'RÉCORD HISTÓRICO',
      type: 'finance'
    }
  },
  {
    id: 'slate_minimal',
    name: 'Studio Minimalista',
    badge: 'Apple / Clean Design',
    font: 'Inter',
    theme: 'slate_minimal',
    animationIn: 'slide-up',
    animationLoop: 'none',
    accentColor: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.35)',
    bgFrom: 'rgba(56, 189, 248, 0.14)',
    desc: 'Tarjetas glassmorphism sutiles, tipografía limpia y diseño visual sobrio sin distracciones.',
    preview: {
      tag: 'KEY INSIGHT',
      title: 'Diseño Sobrio',
      sub: 'Arquitectura Limpia',
      type: 'minimal'
    }
  },
  {
    id: 'cyber_neon',
    name: 'Cyberpunk & Viral Tech',
    badge: 'TikTok / YouTube Tech',
    font: 'Outfit',
    theme: 'cyber_neon',
    animationIn: 'slide-up',
    animationLoop: 'pulse',
    accentColor: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.35)',
    bgFrom: 'rgba(168, 85, 247, 0.18)',
    desc: 'Estilo dinámico con neones cian y violetas, sombras con brillo y animaciones ágiles.',
    preview: {
      tag: 'NEON MATRIX',
      title: 'ALGORITMO IA',
      sub: '⚡ Velocidad Turbo',
      type: 'cyber'
    }
  },
  {
    id: 'gold_luxury',
    name: 'Cinemático Dorado',
    badge: 'Historia / Archivo',
    font: 'Playfair Display',
    theme: 'gold_luxury',
    animationIn: 'fade',
    animationLoop: 'none',
    accentColor: '#fbbf24',
    glowColor: 'rgba(251, 191, 36, 0.35)',
    bgFrom: 'rgba(251, 191, 36, 0.16)',
    desc: 'Tipografía serif sofisticada, tonos dorados cálidos y sombras profundas cinematográficas.',
    preview: {
      tag: 'ARCHIVO 1929',
      title: '«El Gran Legado»',
      sub: 'Crónica Histórica',
      type: 'gold'
    }
  }
];

/**
 * Helper: Distills a potentially long title into a punchy 2-6 word editorial headline
 * and shifts remaining context to subtitle.
 */
function polishGraphicCopy(spec = {}, scene = {}) {
  let rawTitle = String(spec.title || scene.title || '').trim();
  let rawSub = String(spec.subtitle || '').trim();

  // Strip trailing ellipsis or quotes
  rawTitle = rawTitle.replace(/\.{2,}$/, '').trim();

  const words = rawTitle.split(/\s+/).filter(Boolean);
  if (words.length > 6 && spec.graphicType !== 'quote_callout') {
    const headlineWords = words.slice(0, 5).join(' ').replace(/[,:;]+$/, '');
    if (!rawSub) {
      rawSub = words.slice(5, 14).join(' ');
    }
    rawTitle = headlineWords;
  }

  if (rawSub.length > 68) {
    rawSub = rawSub.slice(0, 65).replace(/\s+\S*$/, '') + '…';
  }

  return {
    ...spec,
    title: rawTitle || 'Hito Clave',
    subtitle: rawSub
  };
}

/**
 * Computes editorial priority score (0-100) for a graphic decision
 */
function scoreGraphicDecision(item, idx, totalScenes) {
  if (!item || !item.needsGraphic) return 0;
  if (idx === 0) return 99; // Opening presentation
  if (idx === totalScenes - 1 && totalScenes > 3) return 88; // Closing anchor
  switch (item.graphicType) {
    case 'doc_chapter': return 95;
    case 'doc_stat': return 91;
    case 'doc_timeline': return 89;
    case 'doc_date': return 86;
    case 'lower_third': return 82;
    case 'quote_callout': return 79;
    case 'title_hero': return 74;
    default: return 70;
  }
}

/**
 * Refines decisions with Editorial Pacing Cooldown, Copy Polishing, and Aspect Ratio Adaptation
 */
function refineEditorialDecisions(decisions = [], { isVertical = false, hasSubtitles = false } = {}) {
  const refined = decisions.map((d, idx) => ({
    ...d,
    editorialScore: scoreGraphicDecision(d, idx, decisions.length)
  }));

  // Enforce editorial breathing space: avoid back-to-back graphics within 5.5s unless both are >= 92 (chapter/intro)
  let lastApprovedTime = -999;
  let lastApprovedIdx = -999;

  for (let i = 0; i < refined.length; i++) {
    const cur = refined[i];
    if (!cur.needsGraphic || !cur.graphicSpec) continue;

    // Polish copy so titles are punchy and never truncated sentences
    cur.graphicSpec = polishGraphicCopy(cur.graphicSpec, cur);

    const timeSinceLast = (cur.startTime || 0) - lastApprovedTime;
    const isConsecutiveScene = (i - lastApprovedIdx) === 1;

    if (i > 0 && (timeSinceLast < 5.2 || isConsecutiveScene) && cur.editorialScore < 92) {
      const prev = refined[lastApprovedIdx];
      if (prev && prev.editorialScore >= cur.editorialScore) {
        // Demote current to clean video so the previous graphic can breathe
        cur.needsGraphic = false;
        cur.graphicType = null;
        cur.graphicSpec = null;
        cur.reasoning = 'Espacio de respiración editorial: se priorizó el gráfico de mayor impacto en la escena contigua para no saturar la pantalla.';
        continue;
      } else if (prev && prev.editorialScore < cur.editorialScore && lastApprovedIdx > 0) {
        // Demote previous weaker graphic in favor of this stronger one (e.g. hard statistic or date)
        prev.needsGraphic = false;
        prev.graphicType = null;
        prev.graphicSpec = null;
        prev.reasoning = 'Espacio de respiración editorial: se reservó el impacto visual para el dato duro inmediatamente posterior.';
      }
    }

    // Adapt position & typography to Vertical (9:16) vs Horizontal (16:9) and Subtitle coexistence
    const gType = cur.graphicType;
    if (isVertical) {
      cur.graphicSpec.fontSize = gType === 'lower_third' ? 38 : 44;
      if (gType === 'lower_third') {
        cur.graphicSpec.presetPosition = 'custom';
        cur.graphicSpec.posX = 0;
        cur.graphicSpec.posY = hasSubtitles ? -280 : 180;
      } else {
        cur.graphicSpec.presetPosition = 'custom';
        cur.graphicSpec.posX = 0;
        cur.graphicSpec.posY = hasSubtitles ? -110 : -40;
      }
    } else {
      cur.graphicSpec.fontSize = 48;
      if (gType === 'lower_third') {
        cur.graphicSpec.presetPosition = 'lower_third';
        cur.graphicSpec.posX = -260;
        cur.graphicSpec.posY = hasSubtitles ? 135 : 210;
      } else if (hasSubtitles) {
        cur.graphicSpec.presetPosition = 'custom';
        cur.graphicSpec.posX = 0;
        cur.graphicSpec.posY = -45;
      }
    }

    lastApprovedTime = cur.startTime || 0;
    lastApprovedIdx = i;
  }

  return refined;
}

/**
 * Runs the AI Graphic Director Agent
 */
export async function runGraphicDirectorAgent({
  projectName = '',
  projectSummary = '',
  fullScript = '',
  transcriptSegments = [],
  scenes = [],
  timelineDuration = 30,
  vibeId = 'doc_essay',
  aspectRatio = '16:9',
  hasSubtitles = false,
  aiConfig = {},
  forceLocal = false,
  signal = null,
  onProgress = () => {},
  onThinkingStep = () => {}
}) {
  const selectedVibe = GRAPHIC_VIBES.find(v => v.id === vibeId) || GRAPHIC_VIBES[0];
  const isVertical = aspectRatio === '9:16' || aspectRatio === '4:5';

  onProgress({ percent: 5, message: 'Iniciando Cerebro del Diseñador Gráfico IA...' });
  onThinkingStep({
    type: 'init',
    title: 'Inicializando Cerebro Gráfico',
    text: `Configurando perfil estético: ${selectedVibe.name} en formato ${isVertical ? 'Vertical (9:16)' : 'Horizontal (16:9)'}. Evaluando guion y ritmo editorial.`
  });

  // Prepare normalized scene candidates
  const sceneItems = buildSceneCandidates(transcriptSegments, scenes, timelineDuration);

  if (sceneItems.length === 0) {
    throw new Error('No se detectaron escenas ni fragmentos de transcripción para analizar.');
  }

  // --- Plan Macro-Editorial & Contexto Global de Historia ---
  const cleanProjectName = (projectName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  let detectedTitle = cleanProjectName && !cleanProjectName.toLowerCase().startsWith('proyecto') && !cleanProjectName.toLowerCase().startsWith('mi primer')
    ? cleanProjectName
    : '';

  if (!detectedTitle) {
    const firstText = (sceneItems[0]?.scriptText || sceneItems[1]?.scriptText || '').trim();
    const matchStory = firstText.match(/(?:la historia de|el origen de|el nacimiento de|el colapso de|el imperio de|la vida de)\s+([^.,;]+)/i);
    if (matchStory) {
      detectedTitle = matchStory[0].charAt(0).toUpperCase() + matchStory[0].slice(1);
    } else {
      detectedTitle = cleanProjectName || 'Documental Histórico';
    }
  }

  const storySummary = (projectSummary || '').trim() ||
    (fullScript ? fullScript.slice(0, 320) : sceneItems.slice(0, 5).map(s => s.scriptText).filter(Boolean).join(' ').slice(0, 320));

  const introducedEntities = new Set();

  onThinkingStep({
    type: 'global_context',
    title: 'Plan Editorial & Contexto Global Detectado',
    text: `Tema Central: "${detectedTitle}". Directrices de Director activadas: (1) Título de presentación cinematográfico al inicio, (2) Respaldo visual en todas las fechas e hitos históricos, (3) Nombres clave en primera aparición sin repeticiones posteriores, y (4) Capítulos narrativos.`
  });

  onProgress({ percent: 20, message: `Etapa 1: Analizando ${sceneItems.length} escenas para detectar apoyos gráficos...` });
  onThinkingStep({
    type: 'stage1',
    title: 'Etapa 1: Detección Editorial & Filtrado',
    text: `Escaneando guion completo para identificar datos cuantitativos, métricas, nombres clave y conceptos centrales. Determinando qué escenas requieren gráficos y cuáles se mantienen en video puro.`
  });

  let analysisDecisions = [];
  let rawThinkingLog = '';

  // Check if remote AI model should be used
  const useRemoteAi = !forceLocal && aiConfig.baseUrl && aiConfig.apiKey;

  // Estrategia de Empaquetado Inteligente y Anti-Saturación:
  // Agrupa en macro-lotes de 32 escenas (reduciendo peticiones en un 75% frente a micro-lotes de 8).
  // Esto previene saturación de sockets en Ollama Cloud y evita bloqueos de conexión.
  const BATCH_SIZE = 32;
  const batches = [];
  for (let i = 0; i < sceneItems.length; i += BATCH_SIZE) {
    batches.push(sceneItems.slice(i, i + BATCH_SIZE));
  }

  if (useRemoteAi) {
    onThinkingStep({
      type: 'chunking_strategy',
      title: 'Estrategia de Empaquetado y Reducción de Peticiones',
      text: `Empaquetando ${sceneItems.length} escenas en ${batches.length} lote(s) optimizado(s) de ${BATCH_SIZE} escenas para minimizar llamadas a Ollama Cloud y prevenir saturación de red.`
    });

    const allDecisionsMap = new Map();
    let totalAiApproved = 0;
    let consecutiveCloudErrors = 0;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (signal?.aborted) throw new Error('Operación cancelada por el usuario.');

      const currentBatch = batches[bIdx];
      const batchNum = bIdx + 1;
      const isIntroBatch = bIdx === 0;
      const progressPercent = 20 + Math.round((bIdx / batches.length) * 48);

      onProgress({
        percent: progressPercent,
        message: `Analizando Lote ${batchNum}/${batches.length} (Escenas ${currentBatch[0].sceneNumber} a ${currentBatch[currentBatch.length - 1].sceneNumber}) con ${aiConfig.selectedModel || 'Modelo IA'}...`
      });

      onThinkingStep({
        type: 'cloud_request',
        title: `Lote ${batchNum}/${batches.length} (${currentBatch.length} escenas)`,
        text: `Enviando paquete de ${currentBatch.length} escenas (${currentBatch[0].sceneNumber} a ${currentBatch[currentBatch.length - 1].sceneNumber}) a ${aiConfig.selectedModel || 'Ollama Cloud'} con contexto global: "${detectedTitle}".`
      });

      let rawDecisions = [];
      let modelUsed = aiConfig.selectedModel || 'IA';

      try {
        const prompt = buildGraphicAnalysisPrompt(currentBatch, selectedVibe, {
          storyTitle: detectedTitle,
          storySummary,
          introducedEntities: Array.from(introducedEntities),
          isIntroBatch
        });
        const systemMessage = `Eres un Director de Arte y Editor de Motion Graphics profesional para documentales. Analiza el guion considerando la historia global y devuelve en JSON exclusivamente las escenas que ameriten apoyo gráfico en la clave "graphics". Sigue estrictamente las reglas de presentación inicial, fechas clave y anti-repetición de nombres.`;

        let lastStreamUpdate = 0;
        let lastReportedLen = 0;

        const response = await sendAiChatCompletion({
          systemPrompt: systemMessage,
          userPrompt: prompt,
          config: aiConfig,
          jsonMode: true,
          signal,
          timeoutMs: 25000,
          thinkingMode: 'low',
          maxAttempts: 1,
          onThinkingChunk: (chunk, fullThinking) => {
            rawThinkingLog += chunk;
            const now = Date.now();
            if (now - lastStreamUpdate > 1200 && (fullThinking?.length || 0) - lastReportedLen > 25) {
              lastStreamUpdate = now;
              lastReportedLen = fullThinking?.length || 0;
              onThinkingStep({
                type: 'deep_thinking',
                title: `Razonamiento Lote ${batchNum}: ${aiConfig.selectedModel || 'IA'} (Procesando...)`,
                text: (fullThinking || '').slice(-180) + '...'
              });
            }
          },
          onContentChunk: (chunk, fullContent) => {
            const now = Date.now();
            if (now - lastStreamUpdate > 1500) {
              lastStreamUpdate = now;
              onThinkingStep({
                type: 'cloud_request',
                title: `Lote ${batchNum}/${batches.length}: Generando Gráficos`,
                text: `Recibiendo estructura JSON (${fullContent?.length || 0} caracteres)...`
              });
            }
          }
        });

        if (response.thinking) {
          rawThinkingLog += (rawThinkingLog ? '\n---\n' : '') + response.thinking;
          onThinkingStep({
            type: 'deep_thinking',
            title: `Razonamiento Lote ${batchNum}: ${response.model}`,
            text: response.thinking.slice(0, 220) + (response.thinking.length > 220 ? '...' : '')
          });
        }

        consecutiveCloudErrors = 0;
        modelUsed = response.model || modelUsed;
        const parsed = parseAiJsonResponse(response.content);
        const list = parsed?.graphics || parsed?.approvedGraphics || parsed?.decisions || parsed?.decisiones || (Array.isArray(parsed) ? parsed : []);
        rawDecisions = Array.isArray(list) ? list : [];

        // Integrar decisiones para las escenas de este lote con control de contexto y anti-repetición
        const batchResults = mergeAiDecisionsWithScenes(currentBatch, rawDecisions, selectedVibe, {
          storyTitle: detectedTitle,
          introducedEntities,
          isIntroBatch
        });

        // Registrar entidades presentadas en este lote para que lotes futuros no las repitan
        batchResults.forEach(item => {
          allDecisionsMap.set(item.sceneNumber, item);
          if (item.needsGraphic && item.graphicType === 'lower_third' && item.graphicSpec?.title) {
            introducedEntities.add(item.graphicSpec.title.toLowerCase().trim());
          }
        });

        const batchApproved = batchResults.filter(d => d.needsGraphic).length;
        totalAiApproved += batchApproved;

        onThinkingStep({
          type: 'cloud_success',
          title: `✓ Lote ${batchNum}/${batches.length} Completado`,
          text: `${batchApproved} gráficos aprobados para este bloque (${currentBatch.length} escenas) por ${modelUsed}.`
        });
      } catch (batchErr) {
        if (signal?.aborted) throw batchErr;
        const errDetail = batchErr.message || 'Timeout / error de conexión';
        console.warn(`[GraphicDirectorAgent] Lote ${batchNum} no respondió a tiempo (${errDetail}). Activando rescate heurístico local.`);

        onThinkingStep({
          type: 'cloud_error',
          title: `Lote ${batchNum}/${batches.length}: Rescate Local Activado`,
          text: `Servidor IA con alta latencia (${errDetail}). Analizando escenas ${currentBatch[0].sceneNumber} a ${currentBatch[currentBatch.length - 1].sceneNumber} con el motor local bajo las reglas de "${detectedTitle}".`
        });

        // Rescate heurístico local para este lote específico para que el proceso NUNCA se congele
        const localRescue = runLocalGraphicAnalysis(currentBatch, selectedVibe, () => {}, {
          storyTitle: detectedTitle,
          introducedEntities,
          isIntroBatch
        });
        localRescue.forEach(item => {
          allDecisionsMap.set(item.sceneNumber, item);
          if (item.needsGraphic && item.graphicType === 'lower_third' && item.graphicSpec?.title) {
            introducedEntities.add(item.graphicSpec.title.toLowerCase().trim());
          }
        });
        const rescueApproved = localRescue.filter(d => d.needsGraphic).length;
        totalAiApproved += rescueApproved;

        onThinkingStep({
          type: 'cloud_success',
          title: `✓ Lote ${batchNum}/${batches.length} Resuelto (Rescate Local)`,
          text: `${rescueApproved} gráficos detectados mediante motor local para este bloque.`
        });

        consecutiveCloudErrors++;
        // Si dos lotes seguidos sufren timeout en el cloud, transferir automáticamente los restantes al motor local de alta velocidad
        if (consecutiveCloudErrors >= 2 && bIdx + 1 < batches.length) {
          const remainingCount = batches.length - (bIdx + 1);
          onThinkingStep({
            type: 'cloud_error',
            title: 'Activación de Modo Heurístico Continuo',
            text: `Detectada latencia crítica o saturación en el servidor remoto de IA. Transfiriendo automáticamente los ${remainingCount} lotes restantes al motor local de alta velocidad para finalizar sin interrupciones.`
          });
          for (let remIdx = bIdx + 1; remIdx < batches.length; remIdx++) {
            const remBatch = batches[remIdx];
            const remBatchNum = remIdx + 1;
            const remProgress = 20 + Math.round((remIdx / batches.length) * 48);
            onProgress({
              percent: remProgress,
              message: `Analizando Lote ${remBatchNum}/${batches.length} (Escenas ${remBatch[0].sceneNumber} a ${remBatch[remBatch.length - 1].sceneNumber}) con motor local...`
            });
            const remRescue = runLocalGraphicAnalysis(remBatch, selectedVibe, () => {}, {
              storyTitle: detectedTitle,
              introducedEntities,
              isIntroBatch: false
            });
            remRescue.forEach(item => {
              allDecisionsMap.set(item.sceneNumber, item);
              if (item.needsGraphic && item.graphicType === 'lower_third' && item.graphicSpec?.title) {
                introducedEntities.add(item.graphicSpec.title.toLowerCase().trim());
              }
            });
            const remApproved = remRescue.filter(d => d.needsGraphic).length;
            totalAiApproved += remApproved;
          }
          break;
        }
      }

      // Pausa anti-saturación de 600ms entre lotes para no saturar el socket HTTP de Ollama Cloud
      if (bIdx + 1 < batches.length) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // Assemble unified scene decisions in order
    analysisDecisions = sceneItems.map(sc => allDecisionsMap.get(sc.sceneNumber) || {
      sceneNumber: sc.sceneNumber,
      startTime: sc.startTime,
      duration: sc.duration,
      title: sc.title,
      scriptText: sc.scriptText,
      needsGraphic: false,
      graphicType: null,
      reasoning: 'Solo video continuo.',
      graphicSpec: null
    });

    onThinkingStep({
      type: 'batches_finished',
      title: 'Procesamiento por Lotes Finalizado',
      text: `Se consolidaron ${sceneItems.length} escenas analizadas en ${batches.length} lotes. Total de apoyos gráficos diseñados: ${analysisDecisions.filter(d => d.needsGraphic).length}.`
    });
  } else if (forceLocal) {
    onThinkingStep({
      type: 'local_engine',
      title: 'Motor Heurístico Local',
      text: `Analizando ${sceneItems.length} escenas con el motor local bajo las directrices editoriales de "${detectedTitle}".`
    });
    analysisDecisions = runLocalGraphicAnalysis(sceneItems, selectedVibe, onThinkingStep, {
      storyTitle: detectedTitle,
      introducedEntities,
      isIntroBatch: true
    });
  } else {
    throw new Error('Configuración de IA incompleta: Se requiere URL base y Clave API activa para analizar con IA. Configúrala en Ajustes ⚙️ o cambia explícitamente a Heurística Local.');
  }

  // Refine editorial decisions: enforce cooldown spacing, polish copy, and adapt to 9:16 vs 16:9 + subtitles
  analysisDecisions = refineEditorialDecisions(analysisDecisions, {
    isVertical,
    hasSubtitles
  });

  onProgress({ percent: 70, message: 'Etapa 2: Diseñando composición visual, tipografía y animaciones...' });
  onThinkingStep({
    type: 'stage2',
    title: 'Etapa 2: Herramientas de Creación Gráfica',
    text: `Generando especificaciones de motion graphics adaptadas a ${isVertical ? 'formato Vertical (9:16)' : 'formato Horizontal (16:9)'} con espaciado editorial anti-saturación.`
  });

  // Stage 2: Create graphic clips for approved scenes
  const finalizedGraphics = [];
  analysisDecisions.forEach((item, idx) => {
    if (item.needsGraphic && item.graphicSpec) {
      const spec = item.graphicSpec;
      // Prevent duration overlap with next approved graphic
      const nextGraphic = analysisDecisions.slice(idx + 1).find(d => d.needsGraphic);
      let clipDuration = Math.max(2.0, Math.min(6.5, item.duration || 4.0));
      if (nextGraphic && item.startTime + clipDuration > nextGraphic.startTime) {
        clipDuration = Math.max(1.8, Number((nextGraphic.startTime - item.startTime - 0.2).toFixed(2)));
      }

      const clip = createGraphicClip({
        name: spec.name || `Gfx ${item.sceneNumber}: ${spec.title}`,
        startTime: item.startTime,
        duration: clipDuration,
        graphicType: spec.graphicType || 'doc_chapter',
        themeId: selectedVibe.theme,
        fontFamily: spec.fontFamily || selectedVibe.font,
        fontSize: spec.fontSize || (isVertical ? 44 : 50),
        title: spec.title,
        subtitle: spec.subtitle || '',
        badgeText: spec.badgeText || '',
        chapterPrefix: spec.chapterPrefix,
        statNumber: spec.statNumber,
        statText: spec.statText,
        milestones: spec.milestones,
        textColor: spec.textColor,
        accentColor: spec.accentColor,
        backdropGlass: spec.backdropGlass !== undefined ? spec.backdropGlass : false,
        kpiValue: spec.kpiValue || '',
        kpiLabel: spec.kpiLabel || '',
        kpiDelta: spec.kpiDelta || '',
        chartItems: spec.chartItems || [],
        quoteAuthor: spec.quoteAuthor || '',
        animationIn: spec.animationIn || selectedVibe.animationIn,
        animationLoop: spec.animationLoop || selectedVibe.animationLoop,
        animationOut: 'fade',
        presetPosition: spec.presetPosition || 'center',
        posX: spec.posX !== undefined ? spec.posX : 0,
        posY: spec.posY !== undefined ? spec.posY : 0,
        textShadowBlur: spec.textShadowBlur || 18,
        textShadowColor: spec.textShadowColor
      });
      item.generatedClip = clip;
      finalizedGraphics.push(clip);
    }
  });

  onProgress({ percent: 100, message: 'Diseño de Efectos & Gráficos completado con éxito.' });
  onThinkingStep({
    type: 'done',
    title: 'Montaje Gráfico Terminado',
    text: `Se determinaron ${finalizedGraphics.length} apoyos gráficos de alto impacto y ${sceneItems.length - finalizedGraphics.length} escenas en video limpio para máxima elegancia.`
  });

  return {
    vibe: selectedVibe,
    totalScenes: sceneItems.length,
    graphicsCount: finalizedGraphics.length,
    cleanVideoCount: sceneItems.length - finalizedGraphics.length,
    decisions: analysisDecisions,
    graphicClips: finalizedGraphics,
    rawThinking: rawThinkingLog
  };
}

/**
 * Normalizes scenes and transcript into consistent scene candidates
 */
function buildSceneCandidates(transcriptSegments, scenes, timelineDuration) {
  if (scenes && scenes.length > 0) {
    return scenes.map((sc, idx) => ({
      sceneNumber: sc.sceneNumber || idx + 1,
      startTime: sc.startTime !== undefined ? sc.startTime : idx * 4,
      duration: sc.duration || 4,
      title: sc.title || `Escena ${idx + 1}`,
      scriptText: sc.scriptText || sc.text || '',
      visualDescription: sc.visualDescription || ''
    }));
  }

  // Fallback from transcript segments
  if (transcriptSegments && transcriptSegments.length > 0) {
    return transcriptSegments.map((seg, idx) => ({
      sceneNumber: idx + 1,
      startTime: seg.start !== undefined ? seg.start : idx * 4,
      duration: (seg.end && seg.start) ? Math.max(2, seg.end - seg.start) : 4,
      title: `Beat ${idx + 1}`,
      scriptText: seg.text || '',
      visualDescription: ''
    }));
  }

  // Fallback demo blocks
  const count = Math.max(3, Math.floor(timelineDuration / 4));
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      sceneNumber: i + 1,
      startTime: i * 4,
      duration: 4,
      title: `Segmento ${i + 1}`,
      scriptText: '',
      visualDescription: ''
    });
  }
  return list;
}

/**
 * Local semantic analyzer for Stage 1 & Stage 2
 * Comprehensive wide-range editorial engine:
 * 1. Cifras cuantitativas, poblaciones, porcentajes y dinero (doc_stat)
 * 2. Fechas, hitos temporales e historia (doc_date)
 * 3. Cronologías de múltiples años y evoluciones (doc_timeline)
 * 4. Capítulos, aperturas y transiciones temáticas en cualquier punto (doc_chapter)
 * 5. Nombres propios de personas, ponentes, roles y entidades clave (lower_third)
 * 6. Afirmaciones centrales, tesis, reglas de oro y comparativas (title_hero)
 * 7. Citas textuales memorables (quote_callout)
 * 8. Métricas económicas, de crecimiento y multiplicadores
 */
function runLocalGraphicAnalysis(scenes, selectedVibe, onThinkingStep, globalContext = {}) {
  const {
    storyTitle = 'Documental Principal',
    introducedEntities = new Set(),
    isIntroBatch = true
  } = globalContext;

  const seenEntitiesSet = introducedEntities instanceof Set ? introducedEntities : new Set(introducedEntities || []);

  return scenes.map((scene, idx) => {
    const text = (scene.scriptText || scene.title || '').trim();
    const lower = text.toLowerCase();

    // 1. Detección de Capítulos / Secciones / Apertura
    const chapterMatch = text.match(/\b(capítulo|capitulo|parte|sección|seccion|bloque|fase|episodio)\s*(\d+|[ivxlcdm]+)?(?:\s*[:\-])?\s*(.*)/i);
    const isIntro = isIntroBatch && (scene.sceneNumber === 1 || (scene.sceneNumber === 2 && scenes[0]?.duration < 3.5));

    // 2. Detección Ampliada de Fechas e Hitos Temporales (1600s - 2099, siglos y meses)
    const fullDateMatch = text.match(/\b(\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{2,4})\b/i);
    const monthYearMatch = text.match(/\b(?:en\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(1[6-9]\d{2}|20\d{2})\b/i);
    const centuryMatch = text.match(/\b(?:en el\s+|durante el\s+|hacia el\s+)?(siglo\s+[ivxlcdm]+|siglo\s+\d+)\b/i);
    const multipleYearsMatch = [...text.matchAll(/\b(1[6-9]\d{2}|20\d{2})\b/g)];
    const singleYearWithContext = text.match(/\b(?:en|año|hacia|durante|desde|hasta|para el año|fundada en|fundado en|nació en|creada en)?\s*(1[6-9]\d{2}|20\d{2})\b/i);

    // 3. Detección de Porcentajes, Tasas y Ratios
    const percentMatch = text.match(/([+-]?\d+[\.,]?\d*)\s*%/);

    // 4. Detección de Dinero, Monedas y Cifras Financieras
    const currencyMatch = text.match(/(\$|€|usd|eur|dólares|dolares|pesos)\s*(\d{1,3}(?:\.\d{3})*|\d+[\.,]?\d*)\s*(millones|billones|mil|k|m|b)?/i) ||
      text.match(/(\d{1,3}(?:\.\d{3})+|\d+[\.,]?\d*)\s*(millones|billones)\s*(?:de\s+)?(dólares|dolares|euros|usd|eur)?/i) ||
      text.match(/\b(\d+[\.,]?\d*)\s*(millones|billones|mil|k)\b/i);

    // 5. Detección de Poblaciones, Usuarios, Volúmenes y Magnitudes
    const populationMatch = text.match(/\b(\d{1,3}(?:\.\d{3})+|\d+[\.,]?\d*)\s*(?:de\s+)?(personas|habitantes|ciudadanos|usuarios|clientes|espectadores|trabajadores|suscriptores)\b/i);
    const generalBigNumberMatch = text.match(/\b(\d{1,3}(?:\.\d{3})+)\b/);
    const generalNumberMatch = text.match(/\b(\d{2,}(?:[\.,]\d+)?)\b/);
    const metricMeasureMatch = text.match(/\b(\d+[\.,]?\d*)\s*(terabytes|gigavatios|transacciones|operaciones|km|toneladas|barriles|botellas|veces más|veces mas)\b/i);

    // 6. Detección de Multiplicadores y Crecimiento Cuantitativo
    const multiplierMatch = text.match(/\b(duplicó|duplico|triplicó|triplico|multiplicó por \d+|\d+x más|\d+x mas|creció un \d+%|caída del \d+%|caida del \d+%)\b/i);

    // 7. Detección de Vocabulario Económico, Financiero o Estadístico
    const isEconomicOrGrowth = /\b(crecimiento|ganancias|ingresos|ventas|costos|economía|economia|inflación|inflacion|precio|precios|valor|inversión|inversion|mercado|mercados|balance|estadística|estadistica|gráfico|grafico|cifra|cifras|total|recesión|recesion|crisis|burbuja|deuda|tasas|interés|interes|capital|pérdidas|perdidas|demanda|oferta|acciones|bolsa|quiebra|producción|produccion|volumen|capacidad)\b/i.test(lower);

    // 8. Detección de Comparativas y Contrastes
    const isComparison = /\b(frente a|comparado|versus|vs|más que|mas que|menos que|antes y después|antes y despues|diferencia|superó|supero|caída de|caida de|subida de|en contraste|por el contrario|a diferencia de)\b/i.test(lower);

    // 9. Detección de Nombres Propios de Personas, Ponentes, Expertos o Entidades
    const speakerRoleMatch = text.match(/\b(ceo|co-fundador|fundador|director|directora|presidente|presidenta|experto|experta|autor|autora|investigador|investigadora|economista|analista|doctor|doctora|ministro|ministra|profesor|profesora|creador|creadora|inversor|trader|líder|lider)\b/i);
    const rawProperName = text.match(/\b([A-ZÁÉÍÓÚ][a-z]+(?:\s+[A-ZÁÉÍÓÚ][a-z]+){1,2})\b/);
    const falsePositivePhrases = /^(sin embargo|por ejemplo|además de|en cambio|por tanto|el mundo|la historia|estados unidos|reino unido|gran bretaña|nueva york|edad media|guerra mundial|siglo xx|siglo xix|por otro|al mismo|de hecho|en aquel)$/i;
    const properNameMatch = rawProperName && !falsePositivePhrases.test(rawProperName[0].trim()) ? rawProperName : null;
    const keyInstitutions = text.match(/\b(heineken|gerard heineken|gerard adriaan heineken|lehman brothers|goldman sachs|reserva federal|banco central|satoshi nakamoto|steve jobs|elon musk|wall street|silicon valley|fmi|banco mundial|warren buffett|mark zuckerberg|bill gates|jeff bezos)\b/i);

    // 10. Detección de Citas Textuales entre comillas
    const quoteInQuotes = text.match(/["“]([^"”]{10,140})["”]/);

    // 11. Detección de Tesis, Reglas de Oro, Secretos o Conclusiones
    const isThesisOrRule = /\b(la verdad es|el secreto|lo más importante|lo mas importante|regla de oro|la clave está|la clave esta|recuerda que|la gran lección|la gran leccion|en conclusión|en conclusion|el resultado final|el resultado|la paradoja|el principio|la consecuencia|el punto clave)\b/i.test(lower);

    let needsGraphic = false;
    let graphicType = 'title_hero';
    let reasoning = '';
    let graphicSpec = null;

    // A. Apertura de Presentación Inicial del Video (Garantizada en Escena 1)
    if (isIntro) {
      needsGraphic = true;
      graphicType = 'title_hero';
      reasoning = `Presentación Inicial del Video: Titular cinemático potente para anclar la historia desde el primer segundo ("${storyTitle}").`;
      graphicSpec = {
        name: `Portada: ${storyTitle}`,
        graphicType: 'title_hero',
        title: storyTitle,
        subtitle: text.length > 50 ? text.slice(0, 60) + '...' : (text || 'Una Historia de Impacto'),
        badgeText: 'PRESENTACIÓN',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // B. Apertura de Capítulo o Cambio de Sección
    else if (chapterMatch) {
      needsGraphic = true;
      graphicType = 'doc_chapter';
      const chapterNum = chapterMatch[2] || (idx + 1);
      const prefix = `${chapterMatch[1].charAt(0).toUpperCase() + chapterMatch[1].slice(1).toLowerCase()} ${chapterNum}:`;
      const cleanTitle = (chapterMatch[3] || (scene.title && !scene.title.startsWith('Escena')))
        ? (chapterMatch[3] || scene.title)
        : (text.length > 0 && text.length < 50 ? text : 'Nuevo Capítulo');

      reasoning = `Cambio de sección temática detectado ("${prefix}"). Marca el inicio de un nuevo bloque analítico.`;
      graphicSpec = {
        name: `${prefix} ${cleanTitle}`,
        graphicType: 'doc_chapter',
        chapterPrefix: prefix,
        title: cleanTitle,
        subtitle: text.length > 50 ? text.slice(0, 55) + '...' : '',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // C. Cronología de múltiples fechas / años
    else if (multipleYearsMatch && multipleYearsMatch.length >= 2) {
      needsGraphic = true;
      graphicType = 'doc_timeline';
      const years = multipleYearsMatch.map(m => m[0]);
      reasoning = `Evolución cronológica histórica detectada (${years.join(', ')}). Línea de tiempo horizontal con hitos en cursiva negrita.`;
      graphicSpec = {
        name: `Línea de Tiempo: ${years.join(' - ')}`,
        graphicType: 'doc_timeline',
        title: 'Cronología Histórica',
        milestones: years.map((y, i) => ({
          date: y,
          label: i === 0 ? 'Origen' : (i === years.length - 1 ? 'Hito Clave' : 'Evolución'),
          active: i === years.length - 1
        })),
        accentColor: '#0284c7',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // D. Fechas Históricas Específicas, Años (1600s - 2099), Siglos o Meses
    else if (fullDateMatch || monthYearMatch || centuryMatch || (singleYearWithContext && /\b(en|año|hacia|durante|desde|hasta|fundad|nac|cread|hito|origen|siglo)\b/i.test(lower))) {
      needsGraphic = true;
      graphicType = 'doc_date';
      let dateText = '';
      if (fullDateMatch) dateText = fullDateMatch[0];
      else if (monthYearMatch) dateText = monthYearMatch[0];
      else if (centuryMatch) dateText = centuryMatch[0].toUpperCase();
      else if (singleYearWithContext) dateText = `Año ${singleYearWithContext[1]}`;
      else dateText = 'Hito Histórico';

      reasoning = `Hito o fecha histórica determinante para la narrativa (${dateText}). Apoyo visual en pantalla para anclar la época en el espectador.`;
      graphicSpec = {
        name: `Fecha: ${dateText}`,
        graphicType: 'doc_date',
        title: dateText,
        subtitle: scene.title && !scene.title.startsWith('Escena') ? scene.title : (text.slice(0, 50) + '...'),
        textColor: '#22c55e',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // C. Poblaciones y Grandes Cifras Humanas / Volúmenes (Screenshot 2: 800.000.000 de personas)
    else if (populationMatch) {
      needsGraphic = true;
      graphicType = 'doc_stat';
      reasoning = `Dato cuantitativo poblacional de gran escala (${populationMatch[0]}). Se destaca directamente sobre el video con número en amarillo documental (#facc15).`;
      const numberStr = populationMatch[1];
      const unitStr = populationMatch[2] ? `de ${populationMatch[2]}` : 'de personas';

      graphicSpec = {
        name: `Cifra: ${numberStr} ${unitStr}`.trim(),
        graphicType: 'doc_stat',
        statNumber: numberStr,
        statText: unitStr,
        title: `${numberStr} ${unitStr}`.trim(),
        subtitle: text.length > 50 ? text.slice(0, 60) + '...' : '',
        accentColor: '#facc15',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // D. Dinero, Finanzas y Cifras Económicas (Monedas, Pérdidas, Inversión, Ganancias)
    else if (currencyMatch) {
      needsGraphic = true;
      graphicType = 'doc_stat';
      reasoning = `Dato financiero directo en el guion (${currencyMatch[0]}). Se destaca la magnitud económica con tipografía documental de impacto.`;
      const rawNum = currencyMatch[0].trim();
      const snippet = text.slice(text.indexOf(rawNum) + rawNum.length).trim().split(' ').slice(0, 3).join(' ');
      const noun = snippet.length > 0 && snippet.length < 25 ? snippet : 'en movimiento';

      graphicSpec = {
        name: `Finanzas: ${rawNum}`,
        graphicType: 'doc_stat',
        statNumber: rawNum,
        statText: noun,
        title: `${rawNum} ${noun}`.trim(),
        subtitle: text.length > 50 ? text.slice(0, 60) + '...' : '',
        accentColor: '#facc15',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // E. Porcentajes, Tasas, Proporciones y Ratios (ej: 85%, +24.5%, 12% de inflación)
    else if (percentMatch) {
      needsGraphic = true;
      graphicType = 'doc_stat';
      reasoning = `Porcentaje o tasa cuantitativa relevante (${percentMatch[0]}). Se visualiza como cifra de impacto estadístico para anclaje inmediato.`;
      const pctValue = percentMatch[0];
      const snippetAfter = text.slice(text.indexOf(pctValue) + pctValue.length).trim().split(' ').slice(0, 3).join(' ');
      const labelText = snippetAfter.length > 0 && snippetAfter.length < 30 ? snippetAfter : (scene.title || 'de tasa registrada');

      graphicSpec = {
        name: `Estadística: ${pctValue}`,
        graphicType: 'doc_stat',
        statNumber: pctValue,
        statText: labelText,
        title: `${pctValue} ${labelText}`,
        subtitle: text.length > 50 ? text.slice(0, 60) + '...' : '',
        accentColor: '#facc15',
        animationIn: 'pop',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // I. Identificación de Protagonista, Fundador, Autoridad o Institución Clave (Anti-Repetición)
    else if (speakerRoleMatch || keyInstitutions || (properNameMatch && !properNameMatch[0].includes('Escena') && !properNameMatch[0].includes('Segmento'))) {
      const institutionName = keyInstitutions ? keyInstitutions[0] : (properNameMatch ? properNameMatch[0] : '');
      const cleanEntityKey = institutionName.toLowerCase().trim();

      // Regla Anti-Repetición: No repetir cartel para el mismo personaje si ya fue presentado
      if (cleanEntityKey && cleanEntityKey.length >= 3 && seenEntitiesSet.has(cleanEntityKey)) {
        needsGraphic = false;
        reasoning = `Personaje "${institutionName}" ya fue presentado previamente. Se mantiene video limpio para evitar repetición.`;
      } else {
        if (cleanEntityKey && cleanEntityKey.length >= 3) {
          seenEntitiesSet.add(cleanEntityKey);
        }
        needsGraphic = true;
        graphicType = 'lower_third';
        const speakerTitle = institutionName || (scene.title.length < 28 && !scene.title.startsWith('Escena') ? scene.title : 'Protagonista Clave');
        const speakerSubtitle = speakerRoleMatch ? speakerRoleMatch[0].toUpperCase() : (text.slice(0, 45) || 'Figura Central');
        reasoning = `Primera aparición de protagonista o nombre clave ("${speakerTitle}"). Se inserta tercio inferior identificador una única vez.`;

        graphicSpec = {
          name: `Identificador: ${speakerTitle}`,
          graphicType: 'lower_third',
          title: speakerTitle,
          subtitle: speakerSubtitle,
          badgeText: 'PROTAGONISTA',
          animationIn: 'slide-right',
          presetPosition: 'lower_third',
          fontFamily: selectedVibe.font,
          backdropGlass: false
        };
      }
    }
    // J. Citas Textuales Destacadas ("...")
    else if (quoteInQuotes) {
      needsGraphic = true;
      graphicType = 'quote_callout';
      reasoning = 'Declaración o cita textual directa relevante en el guion. Se apoya con diseño editorial flotante de comillas estilizadas.';
      graphicSpec = {
        name: `Cita: "${quoteInQuotes[1].slice(0, 30)}..."`,
        graphicType: 'quote_callout',
        title: quoteInQuotes[1],
        subtitle: scene.title || 'Declaración Histórica',
        quoteAuthor: 'Fuente Testimonial',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // K. Tesis, Reglas de Oro, Secretos o Conclusiones Clave
    else if (isThesisOrRule) {
      needsGraphic = true;
      graphicType = 'title_hero';
      reasoning = 'Punto de inflexión o tesis central del video. Se inserta un titular cinemático de alto impacto sin marcos artificiales.';
      graphicSpec = {
        name: `Idea Clave: ${scene.title}`,
        graphicType: 'title_hero',
        title: text.length > 50 ? text.slice(0, 50) + '...' : (text || scene.title),
        subtitle: 'Punto de Inflexión',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // L. Cierre del video
    else if (idx === scenes.length - 1 && scenes.length > 2) {
      needsGraphic = true;
      graphicType = 'title_hero';
      reasoning = 'Cierre y conclusión del montaje: Titular de impacto final para retención y llamado al espectador.';
      graphicSpec = {
        name: `Cierre: ${scene.title}`,
        graphicType: 'title_hero',
        title: scene.title && !scene.title.startsWith('Escena') ? scene.title : 'Conclusión Final',
        subtitle: text.slice(0, 48) || 'Resumen Estratégico',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }

    return {
      sceneNumber: scene.sceneNumber,
      startTime: scene.startTime,
      duration: scene.duration,
      title: scene.title,
      scriptText: scene.scriptText,
      needsGraphic,
      graphicType: needsGraphic ? graphicType : null,
      reasoning: reasoning || 'La escena se sostiene limpiamente con metraje continuo sin saturar al espectador.',
      graphicSpec
    };
  });
}

/**
 * Builds prompt for Remote AI models
 * Instructs the AI model to detect ALL relevant supporting data:
 * - Cifras cuantitativas, poblaciones, porcentajes y dinero (doc_stat)
 * - Fechas e hitos temporales relevantes (doc_date)
 * - Líneas de tiempo con secuencias de años (doc_timeline)
 * - Capítulos y divisiones de tema (doc_chapter)
 * - Identificación de personajes, expertos, empresas e instituciones (lower_third)
 * - Citas textuales clave (quote_callout)
 * - Afirmaciones centrales, tesis y reglas de oro (title_hero)
 */
/**
 * Parses flexible time string (mm:ss, hh:mm:ss, seconds) into total seconds
 */
function parseFlexibleSeconds(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(p => parseFloat(p));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  const clean = parseFloat(str.replace(/[^\d\.]/g, ''));
  return isNaN(clean) ? null : clean;
}

/**
 * Builds prompt for Remote AI models
 * Instructs the AI model to detect ALL relevant supporting data:
 * - Cifras cuantitativas, poblaciones, porcentajes y dinero (doc_stat)
 * - Fechas e hitos temporales relevantes (doc_date)
 * - Líneas de tiempo con secuencias de años (doc_timeline)
 * - Capítulos y divisiones de tema (doc_chapter)
 * - Identificación de personajes, expertos, empresas e instituciones (lower_third)
 * - Citas textuales clave (quote_callout)
 * - Afirmaciones centrales, tesis y reglas de oro (title_hero)
 */
function buildGraphicAnalysisPrompt(scenes, vibe, globalContext = {}) {
  const {
    storyTitle = 'Documental Histórico',
    storySummary = '',
    introducedEntities = [],
    isIntroBatch = false
  } = globalContext;

  const scenesSummary = scenes.map(s => {
    const textSnippet = (s.scriptText || s.title || '').trim().replace(/\s+/g, ' ').substring(0, 140);
    return `[Escena ${s.sceneNumber}] (${formatTimecode(s.startTime)}): "${textSnippet}"`;
  }).join('\n');

  return `Eres el Director de Arte y Motion Graphics para un documental profesional estilo "${vibe.name}".

CONTEXTO GLOBAL DEL VIDEO:
- Título/Tema de la Historia: "${storyTitle}"
${storySummary ? `- Sinopsis Global: "${storySummary.slice(0, 260)}..."` : ''}
${introducedEntities.length > 0 ? `- Personajes ya presentados con cartel: [${introducedEntities.join(', ')}] (NO vuelvas a crear lower_third para estos mismos nombres).` : ''}

ESCENAS A ANALIZAR EN ESTE BLOQUE (Escenas ${scenes[0]?.sceneNumber} a ${scenes[scenes.length - 1]?.sceneNumber}):
${scenesSummary}

DIRECTRICES EDITORIALES OBLIGATORIAS:
1. PRESENTACIÓN INICIAL DEL VIDEO (${isIntroBatch ? 'OBLIGATORIA EN ESCENA 1 O 2' : 'SI APLICA'}):
   ${isIntroBatch ? `En la Escena 1 (o Escena 2), DEBE crearse el TÍTULO DE PRESENTACIÓN DEL VIDEO ("title_hero") presentando el tema central (ej: "${storyTitle}"). Nunca dejes el inicio del video sin su portada/título principal.` : 'Si se abre un nuevo tema o capítulo principal, usa "doc_chapter".'}

2. FECHAS E HITOS TEMPORALES ("doc_date"):
   Toda mención de año histórico (ej: 1864, 1873, 1889, 1929, 2008), siglo o fecha concreta que marque un hito DEBE recibir apoyo visual ("doc_date") con el año o fecha como título y el acontecimiento como subtítulo.

3. PERSONAJES Y NOMBRES CLAVE (PRIMERA APARICIÓN ÚNICAMENTE) ("lower_third"):
   Cuando se introduce un fundador, protagonista o figura central por PRIMERA VEZ en la narración, genera un "lower_third" identificándolo.
   CRÍTICO: NO repitas el lower_third si el personaje ya fue presentado en la lista anterior [${introducedEntities.join(', ')}] o si su nombre se repite de pasada en escenas posteriores. Solo en su primera aparición relevante.

4. CAPÍTULOS Y PUNTOS DE QUIEBRE ("doc_chapter"):
   Si la narración cambia de etapa histórica, era o giro de la historia (ej: "Capítulo 1: El Origen", "La Gran Expansión", "La Crisis"), asigna un título de capítulo.

5. CIFRAS, DINERO Y DATOS DE IMPACTO ("doc_stat"):
   Resalta cifras cuantitativas grandes, dinero, porcentajes, volúmenes de producción o récords (ej: "$500M", "85%", "10x", "800.000 barriles").

REGLA DE RITMO Y ELEGANCIA:
Entre el 75% y 85% de las escenas deben permanecer en video limpio continuo sin gráficos para que el documental respire. Los gráficos deben colocarse con precisión donde realmente aporten anclaje visual.

FORMATO JSON ULTRA-COMPACTO:
Devuelve ÚNICAMENTE las escenas que SÍ ameriten gráfico en la clave "graphics":
{
  "graphics": [
    {
      "sceneNumber": ${scenes[0]?.sceneNumber || 1},
      "time": "${formatTimecode(scenes[0]?.startTime || 0)}",
      "type": "title_hero" | "doc_date" | "lower_third" | "doc_stat" | "doc_chapter",
      "title": "Texto principal conciso",
      "subtitle": "Texto secundario breve",
      "statNumber": "Opcional si es doc_stat",
      "statText": "Opcional si es doc_stat"
    }
  ]
}
Si ninguna escena necesita gráficos en este bloque, responde {"graphics": []}.`;
}

/**
 * Normalizes AI decision objects from various model formats (English/Spanish keys, flat or nested specs)
 */
function normalizeAiDecision(d, idx) {
  if (!d) return null;
  const rawNum = d.sceneNumber ?? d.scene ?? d.escena ?? d.id;
  let sceneNum = null;
  if (typeof rawNum === 'number') {
    sceneNum = isNaN(rawNum) ? null : rawNum;
  } else if (rawNum !== undefined && rawNum !== null) {
    const digits = String(rawNum).replace(/[^\d]/g, '');
    sceneNum = digits ? parseInt(digits, 10) : null;
  }

  const rawTime = d.time ?? d.timestamp ?? d.startTime ?? d.tiempo ?? d.segundo;
  const targetSeconds = parseFlexibleSeconds(rawTime);

  const rawNeeds = d.needsGraphic !== undefined
    ? d.needsGraphic
    : (d.necesita_grafico !== undefined
      ? d.necesita_grafico
      : (d.graphicType !== 'none' && d.tipo_grafico !== 'ninguno' && d.type !== 'none'));
  const needsGraphic = Boolean(rawNeeds);

  const rawType = String(d.graphicType || d.tipo_grafico || d.type || '').toLowerCase();
  let graphicType = 'title_hero';

  if (rawType.includes('chapter') || rawType.includes('capitulo') || rawType.includes('capítulo') || rawType.includes('seccion') || rawType.includes('sección')) {
    graphicType = 'doc_chapter';
  } else if (rawType.includes('stat') || rawType.includes('cifra') || rawType.includes('numero') || rawType.includes('número') || rawType.includes('metrica') || rawType.includes('métrica') || rawType.includes('contador') || rawType.includes('kpi') || rawType.includes('barra') || rawType.includes('grafico') || rawType.includes('gráfico')) {
    graphicType = 'doc_stat';
  } else if (rawType.includes('date') || rawType.includes('fecha') || rawType.includes('año') || rawType.includes('hito')) {
    graphicType = 'doc_date';
  } else if (rawType.includes('timeline') || rawType.includes('linea') || rawType.includes('línea') || rawType.includes('cronologia') || rawType.includes('cronología')) {
    graphicType = 'doc_timeline';
  } else if (rawType.includes('lower') || rawType.includes('tercio') || rawType.includes('ponente') || rawType.includes('nombre') || rawType.includes('identificador')) {
    graphicType = 'lower_third';
  } else if (rawType.includes('quote') || rawType.includes('cita') || rawType.includes('testimonio')) {
    graphicType = 'quote_callout';
  } else {
    graphicType = 'title_hero';
  }

  const spec = d.graphicSpec || d.especificacion || d.elementos || d;

  return {
    sceneNumber: sceneNum,
    targetSeconds,
    needsGraphic,
    graphicType,
    reasoning: d.reasoning || d.justificacion || d.explicacion || '',
    graphicSpec: {
      title: spec.title || spec.titulo || d.title || d.titulo || '',
      subtitle: spec.subtitle || spec.subtitulo || d.subtitle || d.subtitulo || '',
      badgeText: spec.badgeText || spec.categoria || d.badgeText || '',
      chapterPrefix: spec.chapterPrefix || spec.prefijo || '',
      statNumber: spec.statNumber || spec.cifra || spec.numero || d.statNumber || '',
      statText: spec.statText || spec.concepto || spec.unidad || d.statText || '',
      milestones: spec.milestones || spec.hitos || d.milestones || [],
      quoteAuthor: spec.quoteAuthor || spec.autor || d.quoteAuthor || '',
      kpiValue: spec.kpiValue || d.kpiValue || '',
      kpiLabel: spec.kpiLabel || d.kpiLabel || '',
      textColor: spec.textColor || d.textColor || (graphicType === 'doc_date' ? '#22c55e' : null),
      accentColor: spec.accentColor || d.accentColor || (graphicType === 'doc_stat' ? '#facc15' : null),
      animationIn: spec.animationIn || d.animationIn,
      presetPosition: spec.presetPosition || d.presetPosition
    }
  };
}

/**
 * Merges AI response decisions with original scenes.
 * Eliminates ghost duplicates and aligns graphics strictly to their real scene and time.
 */
function mergeAiDecisionsWithScenes(scenes, rawDecisions, vibe, globalContext = {}) {
  const {
    storyTitle = 'Documental Histórico',
    introducedEntities = new Set(),
    isIntroBatch = false
  } = globalContext;

  const sceneByNumber = new Map();
  scenes.forEach(sc => {
    sceneByNumber.set(Number(sc.sceneNumber), sc);
  });

  const matchedBySceneNumber = new Map();

  (rawDecisions || []).forEach((raw, idx) => {
    if (!raw) return;
    const norm = normalizeAiDecision(raw, idx);
    if (!norm) return;

    let targetScene = null;

    // 1. Direct match by absolute sceneNumber
    if (norm.sceneNumber !== null && sceneByNumber.has(norm.sceneNumber)) {
      targetScene = sceneByNumber.get(norm.sceneNumber);
    }

    // 2. Relative 1-based index within this batch
    // (If the model returned e.g. 1..32 for a batch whose scenes are 33..64)
    if (!targetScene && norm.sceneNumber !== null && norm.sceneNumber >= 1 && norm.sceneNumber <= scenes.length) {
      if (!scenes.some(s => s.sceneNumber === norm.sceneNumber)) {
        targetScene = scenes[norm.sceneNumber - 1];
      }
    }

    // 3. Match by time / timestamp (seconds or mm:ss)
    if (!targetScene && norm.targetSeconds !== null) {
      const sec = norm.targetSeconds;
      targetScene = scenes.find(s => sec >= s.startTime && sec < (s.endTime || (s.startTime + s.duration + 0.1)));
      if (!targetScene) {
        // Find closest scene in this batch (within 15 seconds)
        let closest = null;
        let minDiff = Infinity;
        scenes.forEach(s => {
          const diff = Math.abs(s.startTime - sec);
          if (diff < minDiff && diff <= 15) {
            minDiff = diff;
            closest = s;
          }
        });
        targetScene = closest;
      }
    }

    // 4. Match by textual anchor or keywords
    if (!targetScene && norm.graphicSpec?.title) {
      const tLower = norm.graphicSpec.title.toLowerCase();
      if (tLower.length >= 4) {
        targetScene = scenes.find(s => {
          const combined = (s.scriptText + ' ' + s.title + ' ' + (s.visualAnchor || '')).toLowerCase();
          return combined.includes(tLower) || (tLower.length >= 8 && combined.includes(tLower.slice(0, 10)));
        });
      }
    }

    if (targetScene) {
      norm.sceneNumber = targetScene.sceneNumber;
      norm.startTime = targetScene.startTime;
      norm.duration = targetScene.duration;
      // Do not overwrite if already matched to avoid duplicate conflicts
      if (!matchedBySceneNumber.has(targetScene.sceneNumber)) {
        matchedBySceneNumber.set(targetScene.sceneNumber, norm);
      }
    } else {
      console.warn(`[GraphicDirectorAgent] Descartando decisión sin correspondencia de escena en este bloque:`, raw);
    }
  });

  return scenes.map(scene => {
    let aiDecision = matchedBySceneNumber.get(scene.sceneNumber);

    // Garantía Editorial: En la Escena 1 del lote inicial, SIEMPRE garantizar el Título de Portada si la IA no lo propuso
    if (isIntroBatch && scene.sceneNumber === 1 && (!aiDecision || !aiDecision.needsGraphic)) {
      aiDecision = {
        sceneNumber: 1,
        startTime: scene.startTime,
        duration: scene.duration,
        needsGraphic: true,
        graphicType: 'title_hero',
        reasoning: `Presentación Inicial Garantizada: Titular de apertura cinematográfico ("${storyTitle}") para situar el tema desde el primer segundo.`,
        graphicSpec: {
          title: storyTitle,
          subtitle: scene.scriptText?.slice(0, 60) || 'Crónica Documental',
          badgeText: 'PRESENTACIÓN',
          animationIn: 'fade',
          presetPosition: 'center'
        }
      };
    }

    if (!aiDecision || !aiDecision.needsGraphic || !aiDecision.graphicType || aiDecision.graphicType === 'none') {
      return {
        sceneNumber: scene.sceneNumber,
        startTime: scene.startTime,
        duration: scene.duration,
        title: scene.title,
        scriptText: scene.scriptText,
        needsGraphic: false,
        graphicType: null,
        reasoning: 'Escena de video fluido sin elementos superpuestos.',
        graphicSpec: null
      };
    }

    const gType = aiDecision.graphicType;
    const spec = aiDecision.graphicSpec || {};

    // Control Estricto Anti-Repetición de Personajes
    if (gType === 'lower_third') {
      const entityKey = (spec.title || scene.title || '').toLowerCase().trim();
      if (entityKey && entityKey.length >= 3 && introducedEntities.has(entityKey)) {
        return {
          sceneNumber: scene.sceneNumber,
          startTime: scene.startTime,
          duration: scene.duration,
          title: scene.title,
          scriptText: scene.scriptText,
          needsGraphic: false,
          graphicType: null,
          reasoning: `Personaje "${spec.title}" ya fue presentado previamente en la historia. Se mantiene video limpio para no saturar al espectador.`,
          graphicSpec: null
        };
      }
      if (entityKey && entityKey.length >= 3) {
        introducedEntities.add(entityKey);
      }
    }

    const graphicSpec = {
      name: `Gfx ${scene.sceneNumber}: ${spec.title || scene.title}`,
      graphicType: gType,
      title: spec.title || scene.title,
      subtitle: spec.subtitle || '',
      badgeText: spec.badgeText || '',
      chapterPrefix: spec.chapterPrefix || (gType === 'doc_chapter' ? 'Capítulo 1:' : ''),
      statNumber: spec.statNumber || '',
      statText: spec.statText || '',
      milestones: spec.milestones || [],
      quoteAuthor: spec.quoteAuthor || '',
      kpiValue: spec.kpiValue || '',
      kpiLabel: spec.kpiLabel || '',
      textColor: spec.textColor || (gType === 'doc_date' ? '#22c55e' : null),
      accentColor: spec.accentColor || (gType === 'doc_stat' ? '#facc15' : null),
      backdropGlass: false,
      animationIn: spec.animationIn || (gType === 'lower_third' ? 'slide-right' : vibe.animationIn),
      presetPosition: spec.presetPosition || (gType === 'lower_third' ? 'lower_third' : 'center'),
      fontFamily: vibe.font
    };

    return {
      sceneNumber: scene.sceneNumber,
      startTime: scene.startTime,
      duration: scene.duration,
      title: scene.title,
      scriptText: scene.scriptText,
      needsGraphic: true,
      graphicType: gType,
      reasoning: aiDecision.reasoning || 'Apoyo gráfico generado por IA para anclaje visual.',
      graphicSpec
    };
  });
}

/**
 * Applies generated graphic clips to the project timeline
 * Inserts or updates a dedicated graphics track "G1 (Gráficos & Títulos)"
 */
export function applyGraphicsToProject(project, graphicClips = [], options = {}) {
  if (!project || !project.tracks) return project;

  const replaceExisting = options.replaceExisting !== false;
  const targetTrackId = 'track-graphics-g1';

  let tracks = [...project.tracks];
  let gfxTrack = tracks.find(
    t => (t.id === targetTrackId || t.name?.includes('Gráficos') || t.type === 'graphics') &&
         !t.isSubtitleTrack && t.id !== 'track-subtitles-1'
  );

  if (!gfxTrack) {
    // Create new dedicated graphics track and position it at the top of the video layers
    gfxTrack = {
      id: targetTrackId,
      name: 'G1 (Gráficos & Títulos)',
      type: 'graphics',
      visible: true,
      muted: false,
      locked: false,
      clips: []
    };

    // Find first video track index to place graphics directly above it
    const firstVideoIdx = tracks.findIndex(t => t.type === 'video');
    if (firstVideoIdx >= 0) {
      tracks.splice(firstVideoIdx, 0, gfxTrack);
    } else {
      tracks.unshift(gfxTrack);
    }
  }

  // Update track clips with trackId
  const assignedClips = graphicClips.map((clip, idx) => ({
    ...clip,
    id: clip.id || `gfx-clip-${Date.now()}-${idx}`,
    trackId: gfxTrack.id
  }));

  const updatedClips = replaceExisting
    ? assignedClips
    : [...(gfxTrack.clips || []), ...assignedClips];

  const updatedTracks = tracks.map(t => {
    if (t.id === gfxTrack.id) {
      return { ...t, clips: updatedClips };
    }
    return t;
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    tracks: updatedTracks
  };
}

/**
 * Generates a motion graphic clip specifically for a single scene.
 * Can execute locally (5ms) or via Cloud AI model (1-2s).
 */
export async function generateGraphicForSingleScene({
  scene,
  vibeId = 'doc_essay',
  mode = 'auto', // 'auto' | 'local' | 'ai'
  aiConfig = null,
  signal = null,
  globalContext = {}
}) {
  if (!scene) return null;

  const selectedVibe = GRAPHIC_VIBES.find(v => v.id === vibeId) || GRAPHIC_VIBES[0];
  const storyTitle = globalContext.storyTitle || 'Documental';
  const storySummary = globalContext.storySummary || '';
  const fullScript = globalContext.fullScript || '';
  const allScenes = Array.isArray(globalContext.allScenes) ? globalContext.allScenes : [];
  const scriptText = (scene.scriptText || scene.text || scene.title || '').trim();
  const sceneNum = scene.sceneNumber || 1;
  const startTime = typeof scene.startTime === 'number' ? scene.startTime : 0;
  const duration = Math.max(2.0, Math.min(6.5, scene.duration || 4.0));

  // Extract surrounding context (preceding and subsequent scenes from the documentary script)
  let prevContext = '';
  let nextContext = '';
  if (allScenes.length > 0) {
    const curIdx = allScenes.findIndex(s => Number(s.sceneNumber) === Number(sceneNum) || s.id === scene.id);
    if (curIdx > 0) {
      const prevs = allScenes.slice(Math.max(0, curIdx - 2), curIdx);
      prevContext = prevs.map(p => `• [Escena ${p.sceneNumber}]: "${p.scriptText || p.text || p.title}"`).join('\n');
    }
    if (curIdx >= 0 && curIdx < allScenes.length - 1) {
      const nexts = allScenes.slice(curIdx + 1, Math.min(allScenes.length, curIdx + 3));
      nextContext = nexts.map(n => `• [Escena ${n.sceneNumber}]: "${n.scriptText || n.text || n.title}"`).join('\n');
    }
  }

  // Fallback: window around the text in fullScript
  let scriptWindow = '';
  if (!prevContext && fullScript && scriptText) {
    const pos = fullScript.indexOf(scriptText);
    if (pos >= 0) {
      const start = Math.max(0, pos - 250);
      const end = Math.min(fullScript.length, pos + scriptText.length + 250);
      scriptWindow = fullScript.slice(start, end);
    }
  }

  let decision = null;

  // 1. Try AI Mode if requested or auto with valid key
  if (mode === 'ai' || (mode === 'auto' && aiConfig?.apiKey && aiConfig?.baseUrl)) {
    try {
      const systemMessage = `Eres un Director Creativo de Motion Graphics y Editor Periodístico para documentales de clase mundial (estilo Vox, Netflix o HBO). Tu misión es diseñar un apoyo gráfico visual de máximo impacto y rigor para la ESCENA OBJETIVO, analizando a fondo el contexto narrativo completo del guion del documental para comprender qué personas, empresas, fechas, hitos o cifras clave se están abordando. Responde estrictamente en formato JSON.`;

      const userPrompt = `══════════════════════════════════════════════════════════════════════════
TEMA Y CONTEXTO GENERAL DEL DOCUMENTAL:
- Título del Documental: "${storyTitle}"
${storySummary ? `- Tesis / Sinopsis: "${storySummary}"` : ''}
- Estilo Visual Solicitado: "${selectedVibe.name}" (${selectedVibe.desc})

══════════════════════════════════════════════════════════════════════════
HILO NARRATIVO DEL GUION (Contexto Inmediato):
${prevContext ? `[Narración Previa]:\n${prevContext}\n` : ''}${scriptWindow ? `[Fragmento del Guion]:\n"${scriptWindow}"\n` : ''}
👉 ESCENA OBJETIVO A GRAFICAR [Escena ${sceneNum}] (${formatTimecode(startTime)} - ${formatTimecode(startTime + duration)}):
"${scriptText}"
${scene.visualDescription ? `(Toma visual sugerida: ${scene.visualDescription})` : ''}

${nextContext ? `\n[Narración Posterior]:\n${nextContext}` : ''}
══════════════════════════════════════════════════════════════════════════
DIRECTRICES EDITORIALES:
1. RIGOR CONTEXTUAL: Usa el contexto del guion para descubrir de quién o qué se habla (identifica nombres de fundadores, marcas, años específicos, cifras) si la escena objetivo usa referencias indirectas o pronombres como "él", "la compañía", "aquel año".
2. TITULARES CINEMÁTICOS: Diseña un titular periodístico de impacto (4 a 6 palabras máximo), evitando títulos vacíos o genéricos como "Punto Clave".
3. ETIQUETA / BADGE: Indica el valor editorial en mayúsculas (ej: "HITO HISTÓRICO", "CIFRA CLAVE", "PERSONAJE", "EXPANSIÓN", "CAPÍTULO").
4. SELECCIÓN DE TIPO:
   - "doc_date": Si se abordan años, fechas o periodos temporales específicos.
   - "doc_stat": Si se destacan cantidades, porcentajes, balances o métricas numéricas con "statNumber" y "statText".
   - "lower_third": Si se identifica a un personaje, fundador, científico o protagonista relevante.
   - "title_hero": Si es una portada, cambio temático o titular de tesis documental.
   - "quote_callout": Si es una cita textual potente o revelación.
   - "doc_chapter": Si marca la transición a un nuevo acto o capítulo de la historia.

Devuelve exclusivamente un JSON con la estructura:
{
  "type": "doc_date" | "lower_third" | "doc_stat" | "doc_chapter" | "title_hero" | "quote_callout",
  "title": "Titular periodístico contundente contextualizado",
  "subtitle": "Bajada explicativa contextualizada breve",
  "statNumber": "Cifra destacada si aplica (ej: +142%, 1873, $500M)",
  "statText": "Etiqueta cuantitativa breve si aplica",
  "badgeText": "Etiqueta superior en mayúsculas",
  "animationIn": "${selectedVibe.animationIn}",
  "reasoning": "Explicación de cómo este gráfico aporta valor narrativo al guion"
}`;

      const res = await sendAiChatCompletion({
        systemPrompt: systemMessage,
        userPrompt,
        config: aiConfig,
        jsonMode: true,
        signal,
        timeoutMs: 14000,
        thinkingMode: 'low',
        maxAttempts: 1
      });

      const parsed = parseAiJsonResponse(res.content);
      if (parsed && (parsed.title || parsed.type)) {
        decision = {
          needsGraphic: true,
          graphicType: parsed.type || 'title_hero',
          reasoning: parsed.reasoning || `Diseñado con contexto del guion por ${res.model || 'IA'} para la escena ${sceneNum}.`,
          graphicSpec: {
            name: `Gfx [E${sceneNum}]: ${parsed.title || scene.title}`,
            graphicType: parsed.type || 'title_hero',
            title: parsed.title || scene.title || 'Punto Clave',
            subtitle: parsed.subtitle || '',
            badgeText: parsed.badgeText || (parsed.type === 'doc_date' ? 'FECHA HISTÓRICA' : (parsed.type === 'doc_stat' ? 'CIFRA CLAVE' : 'DESTACADO')),
            statNumber: parsed.statNumber || '',
            statText: parsed.statText || '',
            animationIn: parsed.animationIn || selectedVibe.animationIn,
            animationLoop: selectedVibe.animationLoop,
            presetPosition: parsed.type === 'lower_third' ? 'bottom-left' : 'center',
            fontFamily: selectedVibe.font,
            accentColor: selectedVibe.accentColor,
            textColor: '#ffffff',
            backdropGlass: selectedVibe.theme === 'slate_minimal'
          }
        };
      }
    } catch (aiErr) {
      console.warn('[generateGraphicForSingleScene] Falló generación remota IA, usando motor local:', aiErr.message);
    }
  }

  // 2. Local Heuristic Engine fallback/mode (Ultra-fast 5ms, rule-based)
  if (!decision) {
    const singleBatch = [{
      id: scene.id,
      sceneNumber: sceneNum,
      title: scene.title || `Escena ${sceneNum}`,
      scriptText,
      startTime,
      duration
    }];
    const localResults = runLocalGraphicAnalysis(singleBatch, selectedVibe, () => {}, {
      storyTitle,
      introducedEntities: globalContext.introducedEntities || new Set(),
      isIntroBatch: sceneNum === 1
    });

    const localRes = localResults[0];
    if (localRes && localRes.needsGraphic && localRes.graphicSpec) {
      decision = localRes;
    } else {
      decision = {
        needsGraphic: true,
        graphicType: 'title_hero',
        reasoning: `Apoyo visual cinematográfico enfocado en la narrativa de la escena ${sceneNum}.`,
        graphicSpec: {
          name: `Gfx [E${sceneNum}]: ${scene.title || 'Impacto'}`,
          graphicType: 'title_hero',
          title: scene.title && !scene.title.startsWith('Escena') ? scene.title : (scriptText.slice(0, 45) || 'Momento Clave'),
          subtitle: scriptText.length > 45 ? scriptText.slice(0, 65) + '...' : '',
          badgeText: 'ESCENA ' + sceneNum,
          animationIn: selectedVibe.animationIn,
          animationLoop: selectedVibe.animationLoop,
          presetPosition: 'center',
          fontFamily: selectedVibe.font,
          accentColor: selectedVibe.accentColor,
          textColor: '#ffffff',
          backdropGlass: selectedVibe.theme === 'slate_minimal'
        }
      };
    }
  }

  // 3. Assemble Graphic Clip
  const spec = decision.graphicSpec;
  const clip = createGraphicClip({
    name: spec.name || `Gfx [E${sceneNum}]: ${spec.title}`,
    startTime,
    duration,
    graphicType: spec.graphicType || 'title_hero',
    themeId: selectedVibe.theme,
    fontFamily: spec.fontFamily || selectedVibe.font,
    title: spec.title,
    subtitle: spec.subtitle || '',
    badgeText: spec.badgeText || '',
    chapterPrefix: spec.chapterPrefix || '',
    statNumber: spec.statNumber || '',
    statText: spec.statText || '',
    milestones: spec.milestones || null,
    textColor: spec.textColor || '#ffffff',
    accentColor: spec.accentColor || selectedVibe.accentColor,
    backdropGlass: spec.backdropGlass !== undefined ? spec.backdropGlass : false,
    animationIn: spec.animationIn || selectedVibe.animationIn,
    animationLoop: spec.animationLoop || selectedVibe.animationLoop,
    animationOut: 'fade',
    presetPosition: spec.presetPosition || 'center',
    textShadowBlur: 18
  });

  clip.sceneId = scene.id;
  clip.sceneNumber = sceneNum;

  return {
    clip,
    decision,
    vibe: selectedVibe
  };
}

/**
 * Inserts or replaces a graphic clip for a single scene in the project's G1 track.
 */
export function applySingleGraphicToProject(project, graphicClip) {
  if (!project || !project.tracks || !graphicClip) return project;

  const targetTrackId = 'track-graphics-g1';
  let tracks = [...project.tracks];
  let gfxTrack = tracks.find(
    t => (t.id === targetTrackId || t.name?.includes('Gráficos') || t.type === 'graphics') &&
         !t.isSubtitleTrack && t.id !== 'track-subtitles-1'
  );

  if (!gfxTrack) {
    gfxTrack = {
      id: targetTrackId,
      name: 'G1 (Gráficos & Títulos)',
      type: 'graphics',
      visible: true,
      muted: false,
      locked: false,
      clips: []
    };
    const firstVideoIdx = tracks.findIndex(t => t.type === 'video');
    if (firstVideoIdx >= 0) {
      tracks.splice(firstVideoIdx, 0, gfxTrack);
    } else {
      tracks.unshift(gfxTrack);
    }
  }

  const assignedClip = {
    ...graphicClip,
    id: graphicClip.id || `gfx-clip-${Date.now()}`,
    trackId: gfxTrack.id
  };

  // Replace existing graphic for this scene or at the same timestamp (within 0.25s)
  const existingClips = (gfxTrack.clips || []).filter(c => {
    if (c.id === assignedClip.id) return false;
    if (c.sceneId && assignedClip.sceneId && c.sceneId === assignedClip.sceneId) return false;
    if (c.sceneNumber !== undefined && assignedClip.sceneNumber !== undefined && Number(c.sceneNumber) === Number(assignedClip.sceneNumber)) return false;
    if (Math.abs(c.startTime - assignedClip.startTime) < 0.25) return false;
    return true;
  });

  const updatedClips = [...existingClips, assignedClip].sort((a, b) => a.startTime - b.startTime);

  const updatedTracks = tracks.map(t => {
    if (t.id === gfxTrack.id) {
      return { ...t, clips: updatedClips };
    }
    return t;
  });

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    tracks: updatedTracks
  };
}
