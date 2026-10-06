/**
 * AI Agentic Scene Director & Storyboard Generator
 * Analyzes audio transcripts with precise timestamps, evaluates pacing & rhythm,
 * and creates structured scenes with visual recommendations (video vs image).
 * 
 * Features:
 * - Smart Sentence Consolidation (merges micro-fragments into complete natural phrases)
 * - Semantic Thematic Title & Shot Prompts (no generic placeholders)
 * - Intelligent Local Editorial Engine (zero-wait, zero-timeout, rock-solid fallback)
 * - Multi-engine support (Local Heuristics vs Remote DeepSeek/Ollama API)
 * - Configurable Time Ranges (First 60s, First 3 min, Full Video, Custom Range)
 * - Pacing Limits (prevents 300+ scene explosions on long videos)
 */
import { sendAiChatCompletion, parseAiJsonResponse } from './aiClient.js';
import { formatTimecode } from './timeFormat.js';
import {
  analyzePhraseVisualWeights,
  extractDialogueVisualCore,
  segmentIntoEditorialBeats
} from './semanticWeightAnalyzer.js';
import {
  buildSceneTemplate,
  buildTemplateAiPrompt,
  compileStoryboardFromTemplate,
  generateContextualShotPrompt,
  extractSearchKeywords
} from './sceneTemplateEngine.js';

export { generateContextualShotPrompt, extractSearchKeywords };

export const RHYTHM_PROFILES = [
  {
    id: 'dynamic',
    name: 'Dinámico / Viral (Cortes por Ancla Visual)',
    targetSec: '1.8 - 3.5s',
    avgSec: 2.8,
    minSec: 1.8,
    maxSec: 3.5,
    icon: 'Zap',
    badge: 'TikTok / Reels / Shorts',
    description: 'Edición viral de alto impacto. Cortes ágiles cada 1.8 a 3.5s sincronizados a anclas de alto peso visual (dinero, acciones, cifras, emociones).'
  },
  {
    id: 'balanced',
    name: 'Equilibrado / Estándar (YouTube)',
    targetSec: '4 - 7.5s',
    avgSec: 5.2,
    minSec: 3.5,
    maxSec: 7.5,
    icon: 'PlayCircle',
    badge: 'YouTube / Video Ensayos',
    description: 'Ritmo natural de edición (4 a 7.5s). Agrupa oraciones en torno a un ancla temática principal con respiración visual adecuada.'
  },
  {
    id: 'narrative',
    name: 'Narrativo / Cinematográfico (Pausado)',
    targetSec: '8 - 15s',
    avgSec: 11.0,
    minSec: 6.5,
    maxSec: 15.0,
    icon: 'Film',
    badge: 'Documental / Explicativo',
    description: 'Tomas con respiración amplia y tomas sostenidas de atmósfera para conceptos profundos o explicaciones pausadas.'
  }
];

const SCENE_PALETTE = [
  '#06b6d4', // Cyan (Video)
  '#6366f1', // Indigo (Image)
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#14b8a6'  // Teal
];

/**
 * Consolidates fragmented transcript segments (words/half-phrases)
 * into coherent spoken sentences with complete ideas and accurate start/end times.
 */
export function consolidateSentences(segments) {
  if (!segments || segments.length === 0) return [];
  const sentences = [];
  let currentGroup = [];
  let currentText = '';
  let groupStart = segments[0].start;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const text = (s.text || '').trim();
    if (!text) continue;

    if (currentGroup.length === 0) {
      groupStart = s.start;
    }

    currentGroup.push(s);
    currentText = currentText ? `${currentText} ${text}` : text;
    const groupEnd = s.end;

    // Check sentence boundary conditions
    const isPunctuationEnd = /[.?!…]['"”)]?$/.test(text);
    const nextSegment = segments[i + 1];
    const isSilenceGap = nextSegment && (nextSegment.start - s.end > 1.1);
    const isLongEnough = (groupEnd - groupStart) >= 4.5;

    if (isPunctuationEnd || isSilenceGap || (isLongEnough && /[,;:]/.test(text)) || i === segments.length - 1) {
      sentences.push({
        id: `sent_${sentences.length + 1}`,
        start: Number(groupStart.toFixed(2)),
        end: Number(groupEnd.toFixed(2)),
        duration: Number((groupEnd - groupStart).toFixed(2)),
        text: currentText.trim(),
        segments: [...currentGroup]
      });
      currentGroup = [];
      currentText = '';
    }
  }

  if (currentGroup.length > 0) {
    const lastSeg = currentGroup[currentGroup.length - 1];
    sentences.push({
      id: `sent_${sentences.length + 1}`,
      start: Number(groupStart.toFixed(2)),
      end: Number(lastSeg.end.toFixed(2)),
      duration: Number((lastSeg.end - groupStart).toFixed(2)),
      text: currentText.trim(),
      segments: [...currentGroup]
    });
  }

  return sentences;
}

/**
 * Generates an expressive, contextual editorial title in Spanish based on sentence content.
 */
export function generateContextualTitle(sentenceText, index = 0) {
  if (!sentenceText) return `Escena ${index + 1}`;
  
  // 1. High-precision Semantic Weight & Visual Anchor Analysis
  const weightAnalysis = analyzePhraseVisualWeights(sentenceText, index);
  if (weightAnalysis && weightAnalysis.title && !weightAnalysis.title.startsWith('Escena')) {
    return weightAnalysis.title;
  }

  const lower = sentenceText.toLowerCase();

  if (/ia|inteligencia artificial|algoritmo|machine learning/.test(lower)) {
    if (/problema|imposible|resolver|dilema/.test(lower)) return 'El Dilema de la IA';
    if (/futuro|avance|modelo|revoluci/.test(lower)) return 'La Revolución de la IA';
    return 'Inteligencia Artificial y Cómputo';
  }
  if (/centro de datos|servidor|servidores|data center|rack/.test(lower)) {
    return 'Infraestructura de Datos';
  }
  if (/alta tensi|eléctric|energ|voltaje|potencia|alimentar|red/.test(lower)) {
    return 'Red y Suministro Eléctrico';
  }
  if (/dinero|mesa|inversi|presupuesto|dólar|euro|costo|millon/.test(lower)) {
    return 'Inversión y Presupuesto';
  }
  if (/meses|año|tiempo|construir|tarda|plazo/.test(lower)) {
    return 'Tiempos de Construcción';
  }
  if (/problema|difícil|complicado|obstáculo|crisis|cuello de botella/.test(lower)) {
    return 'El Desafío Crítico';
  }
  if (/persona|sociedad|mundo|gente|equipo|usuarios/.test(lower)) {
    return 'Impacto Social y Humano';
  }
  if (/idea|concepto|teoría|análisis|comprender|entender/.test(lower)) {
    return 'Análisis Conceptual';
  }

  // Extract first meaningful words as title
  const words = sentenceText
    .replace(/[^\w\s\sáéíóúÁÉÍÓÚñÑ]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['para', 'como', 'pero', 'este', 'esta', 'porque', 'desde', 'hace', 'todo', 'bien'].includes(w.toLowerCase()))
    .slice(0, 4);

  if (words.length >= 2) {
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  return `Escena ${index + 1}`;
}



/**
 * High-precision local heuristic storyboard generator with Professional Editor Intuition.
 * Segments dialogue based on semantic weight, cutting on visual punches (even if 1.8s - 3.5s in viral mode).
 */
export function generateLocalSmartStoryboard(inputSegments, rhythm, targetSec, maxScenesLimit = 40, mediaTypePreference = 'mixed') {
  if (!inputSegments || inputSegments.length === 0) return [];

  // Segment dialogue using professional editor beat intuition
  const beats = segmentIntoEditorialBeats(inputSegments, rhythm, targetSec);

  const rawScenes = [];
  for (let i = 0; i < beats.length; i++) {
    if (maxScenesLimit !== Infinity && rawScenes.length >= maxScenesLimit) {
      break;
    }

    const beat = beats[i];
    const analysis = beat.anchorAnalysis || analyzePhraseVisualWeights(beat.text, rawScenes.length);

    let isVideo;
    if (mediaTypePreference === 'video') {
      isVideo = true;
    } else if (mediaTypePreference === 'image') {
      isVideo = false;
    } else {
      isVideo = analysis.recommendedVisualType === 'video'
        ? (rawScenes.length % 4 !== 3)
        : (rawScenes.length % 3 !== 2); // 2-3 videos : 1 image in mixed mode
    }

    rawScenes.push({
      startTime: Number(beat.start.toFixed(2)),
      endTime: Number(beat.end.toFixed(2)),
      title: analysis.title,
      scriptExcerpt: beat.text,
      visualType: isVideo ? 'video' : 'image',
      visualDescription: analysis.shotPrompt || generateContextualShotPrompt(beat.text, isVideo ? 'video' : 'image', rawScenes.length),
      searchKeywords: Array.isArray(analysis.searchKeywords) && analysis.searchKeywords.length > 0
        ? analysis.searchKeywords
        : extractSearchKeywords(beat.text),
      visualWeight: analysis.visualWeight,
      visualAnchor: analysis.primaryAnchor,
      isHighImpact: analysis.isHighImpact,
      category: analysis.category,
      mood: extractMood(beat.text)
    });
  }

  return rawScenes;
}



/**
 * Extracts emotional tone / mood from dialogue.
 */
function extractMood(text) {
  const lower = (text || '').toLowerCase();
  if (/problema|imposible|crisis|dilema|riesgo|difícil/.test(lower)) return 'dramático';
  if (/dinero|millon|inversi|empresa|mercado/.test(lower)) return 'corporativo';
  if (/tecnolog|ia|servidor|futuro|algoritmo/.test(lower)) return 'futurista';
  if (/rápido|viral|construir|fácil|acción/.test(lower)) return 'dinámico';
  return 'cinematográfico';
}

/**
 * Partitions consolidated sentences into sequential, context-safe time sections
 * (default: ~150 seconds / 2.5 minutes per section) to prevent LLM context saturation,
 * prompt bloating, and output token truncations.
 */
export function partitionSentencesIntoTimeSections(sentences, targetSectionSec = 150) {
  if (!sentences || sentences.length === 0) return [];
  const sections = [];
  let currentGroup = [];
  let groupStart = sentences[0].start;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (currentGroup.length === 0) {
      groupStart = s.start;
    }
    currentGroup.push(s);

    const accumulatedDuration = s.end - groupStart;
    const isLastSentence = i === sentences.length - 1;
    const remainingTime = isLastSentence ? 0 : (sentences[sentences.length - 1].end - s.end);

    // If accumulated duration exceeds target and remaining is enough for another section (> 45s),
    // or this is the last sentence:
    if ((accumulatedDuration >= targetSectionSec && remainingTime >= 45) || isLastSentence) {
      sections.push({
        sectionIndex: sections.length + 1,
        startTime: Number(groupStart.toFixed(2)),
        endTime: Number(s.end.toFixed(2)),
        duration: Number((s.end - groupStart).toFixed(2)),
        sentences: [...currentGroup]
      });
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    const last = currentGroup[currentGroup.length - 1];
    sections.push({
      sectionIndex: sections.length + 1,
      startTime: Number(groupStart.toFixed(2)),
      endTime: Number(last.end.toFixed(2)),
      duration: Number((last.end - groupStart).toFixed(2)),
      sentences: [...currentGroup]
    });
  }

  return sections;
}

/**
 * Reads the entire transcript end-to-end to extract the core topic, overarching story arc,
 * visual tone, and recurring key anchors before section slicing begins.
 */
export async function generateGlobalScriptBrief(consolidatedSentences, aiConfig, { thinkingMode = 'normal', signal = null, onThought = null, onThinkingStream = null } = {}) {
  const totalDuration = consolidatedSentences[consolidatedSentences.length - 1]?.end || 0;
  
  // Format sentences with concise timestamps for full-script context
  const scriptOverview = consolidatedSentences
    .map(s => `[${formatTimecode(s.start)}] ${s.text}`)
    .join('\n');

  let thinkingGuidance = '';
  if (thinkingMode === 'none') {
    thinkingGuidance = 'MODO ULTRA-RÁPIDO: No incluyas monólogos internos extensos. Devuelve directamente el JSON estructurado.';
  } else if (thinkingMode === 'normal') {
    thinkingGuidance = 'MODO PENSAMIENTO NORMAL: Razona de forma concisa y ágil (2-3 líneas) sobre el tema central y anclas clave antes de emitir el JSON final.';
  } else {
    thinkingGuidance = 'MODO ULTRA PROFUNDO: Realiza un análisis conceptual y cinematográfico exhaustivo antes de emitir el JSON.';
  }

  const systemPrompt = `Eres el Director Creativo y Cinematográfico Ejecutivo de este proyecto audiovisual.
Tu tarea es leer y comprender el guion completo del video antes de planificar los cortes o escenas individuales.
Debes extraer la "Base Conceptual Maestra", el tema central, la época histórica o entorno real, el arco narrativo y las anclas visuales concretas para asegurar que todas las escenas y selecciones de B-Roll cuadren perfectamente con lo que dice el diálogo a lo largo de todo el video.

${thinkingGuidance}

REGLAS DE ORO:
1. Extrae los sujetos, nombres propios, lugares, épocas y objetos reales del guion que se te proporciona. NUNCA inventes elementos de tecnología, oficinas o servidores si el guion habla de historia, biografía, cerveza, artesanía, deportes o ciencia.
2. Cada ancla visual debe ser un objeto o sujeto tangible mencionado o sugerido directamente por el texto del narrador.

FORMATO JSON OBLIGATORIO:
{
  "coreTopic": "Tema central específico y real del guion (ej: 'Historia y fundación de la cervecería Heineken en el siglo XIX' o el tema que realmente relate el guion)",
  "narrativeArc": "Síntesis del arco de la historia (Inicio -> Conflicto -> Solución/Riesgo -> Conclusión)",
  "visualTone": "Estilo estético, época, iluminación y paleta de color coherente con la temática real del guion (ej: 'Documental histórico siglo XIX, claroscuro, luz cálida de lámparas de aceite y texturas de cobre y madera')",
  "keyAnchors": [
    "Elemento tangible 1 extraído directamente del diálogo del guion",
    "Elemento tangible 2 extraído directamente del diálogo del guion",
    "Elemento tangible 3 extraído directamente del diálogo del guion",
    "Elemento tangible 4 extraído directamente del diálogo del guion",
    "Elemento tangible 5 extraído directamente del diálogo del guion"
  ],
  "editorialPriorities": "Reglas editoriales para que cada plano cuadre exactamente con lo que narra la voz y evitar stock genérico desconectado"
}`;

  const userPrompt = `Guion Completo del Video (${formatTimecode(0)} - ${formatTimecode(totalDuration)}):\n${scriptOverview}\n\nExtrae la Base Conceptual Maestra en el formato JSON indicado. Sé ultra preciso y específico con el tema real del guion.`;

  const completionResult = await sendAiChatCompletion({
    systemPrompt,
    userPrompt,
    config: aiConfig,
    jsonMode: true,
    thinkingMode,
    signal,
    timeoutMs: 180000,
    onThinkingChunk: (delta, fullThinking) => {
      if (onThinkingStream) onThinkingStream(fullThinking);
    }
  });

  const parsed = parseAiJsonResponse(completionResult.content);
  if (!parsed || !parsed.coreTopic) {
    throw new Error('La respuesta de la IA no contiene una base conceptual válida.');
  }

  return {
    ...parsed,
    thinking: completionResult.thinking || null
  };
}

/**
 * Extracts a structured semantic conceptual base locally without AI (fast offline fallback).
 * Uses extractDialogueVisualCore across all sentences to discover authentic script subjects and anchors.
 */
export function extractLocalSemanticBrief(consolidatedSentences) {
  if (!consolidatedSentences || consolidatedSentences.length === 0) {
    return {
      coreTopic: 'Montaje Audiovisual Cinematográfico',
      narrativeArc: 'Progresión narrativa continua',
      visualTone: 'Cinematográfico moderno 4K',
      keyAnchors: ['Acción principal', 'Entorno', 'Detalles'],
      editorialPriorities: 'Cortes en cambios de ritmo y fidelidad estricta al diálogo'
    };
  }

  const collectedAnchors = [];
  const domainKeywords = [];
  
  consolidatedSentences.forEach((s, idx) => {
    const core = extractDialogueVisualCore(s.text, idx);
    if (core.visualAnchor && !core.visualAnchor.startsWith('Momento ') && !core.visualAnchor.startsWith('Escena ')) {
      collectedAnchors.push(core.visualAnchor);
    }
    if (Array.isArray(core.searchKeywords) && core.searchKeywords.length > 0) {
      domainKeywords.push(...core.searchKeywords);
    }
  });

  const uniqueAnchors = [...new Set(collectedAnchors.filter(Boolean))].slice(0, 6);
  const uniqueKeywords = [...new Set(domainKeywords.filter(k => k && k.length > 3))].slice(0, 5);

  const mainTopic = uniqueAnchors.length > 0 
    ? uniqueAnchors.slice(0, 3).join(' • ')
    : (uniqueKeywords.length > 0 ? uniqueKeywords.join(' • ') : 'Narrativa y Diálogo de Voz');

  return {
    coreTopic: `Narrativa visual enfocada en: ${mainTopic}`,
    narrativeArc: 'Estructura progresiva guiada estrictamente por el diálogo de voz',
    visualTone: 'Estilo documental cinematográfico acorde a la época y tema del relato',
    keyAnchors: uniqueAnchors.length > 0 ? uniqueAnchors : ['Sujeto principal', 'Acción clave', 'Entorno narrativo'],
    editorialPriorities: 'Máxima coherencia: cada corte y plano debe reflejar el sujeto, acción o contexto del diálogo'
  };
}

/**
 * Executes the AI Agent Editor to parse the transcript and build the storyboard.
 * @param {Array<{ id: string, start: number, end: number, text: string }>} transcriptSegments
 * @param {string} rhythmId 'dynamic' | 'balanced' | 'narrative' | 'custom'
 * @param {object} options { aiConfig, customTargetSec, maxScenes, timeRange, thinkingMode, onProgress, onThought, signal, forceLocal, sectionDurationSec }
 */
export async function runSceneDirectorAgent(transcriptSegments, rhythmId = 'dynamic', options = {}) {
  if (!transcriptSegments || transcriptSegments.length === 0) {
    throw new Error('No hay transcripción disponible en el proyecto. Transcribe un audio/video primero.');
  }

  const onProgress = options.onProgress || (() => {});
  const onThought = options.onThought || (() => {});
  const onThinkingStream = options.onThinkingStream || null;
  const signal = options.signal || null;
  const aiConfig = options.aiConfig || {};
  const forceLocal = options.forceLocal === true;
  const rhythm = RHYTHM_PROFILES.find(r => r.id === rhythmId) || RHYTHM_PROFILES[0];
  const targetSec = rhythmId === 'custom' && options.customTargetSec ? options.customTargetSec : rhythm.avgSec;

  // Thinking Mode: 'none' (ultra fast) | 'normal' (recommended agile) | 'deep' (full reasoning)
  const thinkingMode = options.thinkingMode || aiConfig.thinkingMode || (aiConfig.enableThinking ? (aiConfig.thinkingEffort === 'high' ? 'deep' : 'normal') : 'none');

  const mediaTypePreference = options.mediaTypePreference || 'mixed'; // 'mixed' | 'video' | 'image'

  // Maximum scenes limit: if options.maxScenes is specified (> 0 and not Infinity), respect it; otherwise process 100% of transcript!
  const maxScenesLimit = (options.maxScenes && options.maxScenes > 0 && options.maxScenes !== Infinity)
    ? options.maxScenes
    : Infinity;

  const agentStartTime = Date.now();
  const formatElapsed = () => `+${((Date.now() - agentStartTime) / 1000).toFixed(1)}s`;
  const allThoughts = [];

  const emitThought = (phase, text, icon = '🧠') => {
    const thought = {
      id: `th_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      time: formatElapsed(),
      phase,
      text,
      icon,
      isLatest: true
    };
    allThoughts.forEach(t => { t.isLatest = false; });
    allThoughts.push(thought);
    onThought(thought, [...allThoughts]);
    return thought;
  };

  onProgress({
    stage: 'preparing',
    percent: 8,
    message: `Consolidando frases y sintaxis del guion...`
  });

  // 1. Time Range Filtering (e.g. First 60s, First 3 min, or Full Video)
  let filteredSegments = transcriptSegments;
  if (options.timeRange && options.timeRange.enabled) {
    const rangeStart = options.timeRange.start || 0;
    const rangeEnd = options.timeRange.end || Infinity;
    filteredSegments = transcriptSegments.filter(s => s.end >= rangeStart && s.start <= rangeEnd);
  }

  if (filteredSegments.length === 0) {
    filteredSegments = transcriptSegments;
  }

  const rangeDuration = filteredSegments[filteredSegments.length - 1].end - filteredSegments[0].start;

  // Calibrate section duration dynamically with Macro-Bloques:
  // Instead of 9-10 micro-sections, long videos are grouped into 2 to 3 Macro-Blocks (max 4 for ultra-long scripts).
  // This reduces API calls by 65-70% and enables lightning-fast parallel processing.
  const idealNumMacroSections = rangeDuration <= 150 ? 1 : (rangeDuration <= 450 ? 2 : 3);
  const macroSectionSec = Math.ceil(rangeDuration / idealNumMacroSections);
  const sectionDurationSec = options.sectionDurationSec || macroSectionSec;

  emitThought(
    'Consolidación Semántica',
    `Unificando ${filteredSegments.length} fragmentos de voz en oraciones gramaticales completas (${(rangeDuration / 60).toFixed(1)} min).`,
    '📝'
  );

  // 2. Consolidate micro-segments into natural spoken sentences
  const consolidatedSentences = consolidateSentences(filteredSegments);

  // 2.1 Scan for High-Impact Visual Anchors with Editorial Weight Engine
  const highImpactAnchorsCount = filteredSegments.filter(s => analyzePhraseVisualWeights(s.text || '').isHighImpact).length;
  emitThought(
    'Análisis de Pesos y Anclas',
    `Motor Editorial Profesional activo: ${highImpactAnchorsCount} anclas de alto peso visual detectadas (dinero, servidores, acciones, gestos) listas para cortes de impacto.`,
    '🎯'
  );

  let rawScenes = [];
  let editorialSummary = '';
  let modelDeepThinking = null;
  let usedFallback = false;
  let successfulRemoteSections = 0;
  let globalBrief = null;

  // Determine if we should attempt remote cloud LLM or use high-speed local engine directly
  const hasCloudConfig = !forceLocal && aiConfig.baseUrl && (aiConfig.apiKey || aiConfig.baseUrl.includes('localhost') || aiConfig.baseUrl.includes('127.0.0.1'));
  const isLocalModel = !hasCloudConfig;

  const isShortScript = rangeDuration <= 150; // Scripts up to 2.5 min are processed in 1 single high-speed pass!

  // -------------------------------------------------------------
  // HIGH-SPEED SINGLE PASS MODE (for short scripts <= 2.5 min)
  // Generates Base Conceptual + Storyboard in 1 single fast call using the Scene Template
  // -------------------------------------------------------------
  if (hasCloudConfig && isShortScript) {
    onProgress({
      stage: 'ai_thinking',
      percent: 30,
      message: `Agente IA analizando guion (${(rangeDuration / 60).toFixed(1)} min) con Plantilla de Escenas y ${aiConfig.selectedModel || 'IA'}...`
    });

    emitThought(
      'Plantilla de Pase Único',
      `Guion de ${(rangeDuration / 60).toFixed(1)} min: Generando plantilla editorial sincronizada y solicitando visión creativa a ${aiConfig.selectedModel || 'la IA'}...`,
      '⚡'
    );

    const singlePassTemplate = buildSceneTemplate(filteredSegments, rhythm, targetSec, {
      mediaTypePreference,
      maxScenes: maxScenesLimit
    });

    globalBrief = extractLocalSemanticBrief(consolidatedSentences);

    let thinkingGuidance = '';
    if (thinkingMode === 'none') {
      thinkingGuidance = 'MODO ULTRA-RÁPIDO: Devuelve directamente el JSON estructurado sin razonamiento previo.';
    } else if (thinkingMode === 'normal') {
      thinkingGuidance = 'MODO PENSAMIENTO NORMAL: Evalúa los pesos visuales de forma concisa antes de emitir el JSON.';
    } else {
      thinkingGuidance = 'MODO ULTRA PROFUNDO: Realiza un análisis cinematográfico exhaustivo antes de emitir el JSON.';
    }

    const { systemPrompt, userPrompt } = buildTemplateAiPrompt(
      singlePassTemplate,
      globalBrief,
      rhythm,
      {
        mediaTypePreference,
        sectionNum: 1,
        totalSections: 1,
        thinkingGuidance
      }
    );

    try {
      const completionResult = await sendAiChatCompletion({
        systemPrompt,
        userPrompt,
        config: aiConfig,
        jsonMode: true,
        thinkingMode,
        signal,
        timeoutMs: 180000,
        onThinkingChunk: (delta, full) => {
          if (onThinkingStream) onThinkingStream(full);
        }
      });

      if (completionResult.thinking) {
        modelDeepThinking = completionResult.thinking;
      }

      const compiled = compileStoryboardFromTemplate(
        singlePassTemplate,
        completionResult.content,
        { globalBrief, mediaTypePreference }
      );

      if (compiled && compiled.length > 0) {
        rawScenes = compiled.slice(0, maxScenesLimit);
        editorialSummary = `Montaje cinematográfico estructurado en ${rawScenes.length} cortes sincronizados al ritmo "${rhythm.name}".`;

        emitThought(
          'Base Conceptual Establecida',
          `💡 Tema Central: "${globalBrief.coreTopic}"\n🎨 Tono Visual: ${globalBrief.visualTone}\n⚓ Anclas Clave: ${(globalBrief.keyAnchors || []).join(', ')}`,
          '💡'
        );

        emitThought(
          'Plantilla Ejecutada en Pase Único',
          `✓ ${rawScenes.length} escenas compiladas con éxito desde la plantilla con textos del Agente Director (${aiConfig.selectedModel || 'IA'}).`,
          '⚡'
        );
      } else {
        throw new Error('La respuesta de la IA no contiene escenas válidas.');
      }
    } catch (singleErr) {
      if (signal && signal.aborted) throw singleErr;
      console.warn('[SceneDirector] Pase único con plantilla falló, aplicando modo secuencial:', singleErr.message);
    }
  }

  // -------------------------------------------------------------
  // MULTI-SECTION WORKFLOW (for longer videos > 2.5 min or fallback)
  // -------------------------------------------------------------
  if (hasCloudConfig && rawScenes.length === 0) {
    onProgress({
      stage: 'global_brief',
      percent: 15,
      message: `Leyendo el guion completo para establecer la Base Conceptual Maestra con ${aiConfig.selectedModel || 'IA'}...`
    });

    emitThought(
      'Lectura Global del Guion',
      `El Agente Director está leyendo las ${consolidatedSentences.length} oraciones completas del guion para fijar el tema central, arco dramático y anclas visuales antes de estructurar cortes.`,
      '📖'
    );

    try {
      globalBrief = await generateGlobalScriptBrief(consolidatedSentences, aiConfig, {
        thinkingMode,
        signal,
        onThought: emitThought,
        onThinkingStream
      });

      if (globalBrief && globalBrief.thinking) {
        modelDeepThinking = (modelDeepThinking ? modelDeepThinking + '\n---\n' : '') + globalBrief.thinking;
      }

      emitThought(
        'Base Conceptual Establecida',
        `💡 Tema Central: "${globalBrief.coreTopic}"\n🎨 Tono Visual: ${globalBrief.visualTone}\n⚓ Anclas Clave: ${(globalBrief.keyAnchors || []).join(', ')}`,
        '💡'
      );
    } catch (briefErr) {
      if (signal && signal.aborted) throw briefErr;
      console.warn('[SceneDirector] Advertencia en lectura global de IA, aplicando síntesis semántica:', briefErr.message);
      globalBrief = extractLocalSemanticBrief(consolidatedSentences);
      emitThought(
        'Base Conceptual Semántica',
        `Tema Central detectado: "${globalBrief.coreTopic}". Procediendo a la estructuración de escenas con guía temática.`,
        '💡'
      );
    }

    // Cooldown pause between global reading and section 1 to avoid Ollama Cloud burst limits
    await new Promise(r => setTimeout(r, 1200));

    // Partition sentences into time sections (2 to 3 minutes each)
    const sections = partitionSentencesIntoTimeSections(consolidatedSentences, sectionDurationSec);
    const totalSections = sections.length;

    emitThought(
      'Calibración de Ritmo',
      maxScenesLimit === Infinity
        ? `Ritmo: "${rhythm.name}". Ventana: ~${targetSec}s por escena. Modo de pensamiento: ${thinkingMode.toUpperCase()}. Cobertura: 100% de la transcripción completa (${totalSections} sección/es de ~${(sectionDurationSec / 60).toFixed(1)} min).`
        : `Ritmo: "${rhythm.name}". Ventana: ~${targetSec}s por escena. Modo de pensamiento: ${thinkingMode.toUpperCase()}. Límite: ${maxScenesLimit} escenas configuradas (${totalSections} sección/es).`,
      '⏱️'
    );

    emitThought(
      'Partición Anti-Saturación',
      `Dividiendo el guion en ${totalSections} sección(es) secuencial(es) de ~${(sectionDurationSec / 60).toFixed(1)} min para evitar saturar el contexto de ${aiConfig.selectedModel || 'la IA remota'}.`,
      '🧩'
    );

    const allRemoteScenes = [];
    const sectionSummaries = [];

    let thinkingGuidance = '';
    if (thinkingMode === 'none') {
      thinkingGuidance = `\nMODO ULTRA-RÁPIDO: Devuelve directamente el JSON estructurado sin razonamiento previo.`;
    } else if (thinkingMode === 'normal') {
      thinkingGuidance = `\nMODO PENSAMIENTO NORMAL: Evalúa los pesos visuales de forma concisa y ágil antes de emitir el JSON final.`;
    } else {
      thinkingGuidance = `\nMODO PENSAMIENTO ULTRA PROFUNDO: Realiza un análisis cinematográfico exhaustivo antes de emitir el JSON final.`;
    }

    const sectionResults = new Array(totalSections);
    let completedSectionsCount = 0;
    const concurrencyLimit = 1;

    emitThought(
      'Ejecución Secuencial de Alta Estabilidad',
      totalSections > 1
        ? `⚡ Analizando ${totalSections} Macro-Bloques en flujo continuo con streaming en vivo (${aiConfig.selectedModel || 'IA'}).`
        : `⚡ Procesando Macro-Bloque único de alta velocidad con ${aiConfig.selectedModel || 'IA'}.`,
      '🚀'
    );

    const processSingleSection = async (secIdx) => {
      if (signal && signal.aborted) throw new Error('Operación cancelada por el usuario.');

      const section = sections[secIdx];
      const secNum = secIdx + 1;

      emitThought(
        `Macro-Bloque ${secNum}/${totalSections}`,
        `Analizando bloque [${formatTimecode(section.startTime)} - ${formatTimecode(section.endTime)}] (${(section.duration / 60).toFixed(1)} min, ${section.sentences.length} frases)...`,
        '🌐'
      );

      const sectionScriptLines = section.sentences
      // 1. Calculate cumulative start index from previous sections
      let startIndex = 0;
      for (let s = 0; s < secIdx; s++) {
        startIndex += (sectionResults[s]?.scenes?.length || 0);
      }

      // 2. Pre-build the Section Scene Template (Plantilla) using genuine rhythm beats
      const sectionTemplate = buildSceneTemplate(section.sentences, rhythm, targetSec, {
        mediaTypePreference,
        startIndex
      });

      emitThought(
        `Macro-Bloque ${secNum}/${totalSections}`,
        `Plantilla calculada (${sectionTemplate.length} escenas, [${formatTimecode(section.startTime)} - ${formatTimecode(section.endTime)}]). Solicitando visión creativa a ${aiConfig.selectedModel || 'IA'}...`,
        '🧩'
      );

      // 3. Build concise prompt asking the AI for text-only creative vision
      const { systemPrompt, userPrompt } = buildTemplateAiPrompt(
        sectionTemplate,
        globalBrief,
        rhythm,
        {
          mediaTypePreference,
          sectionNum: secNum,
          totalSections,
          thinkingGuidance
        }
      );

      let sectionScenes = null;
      let sectionSummary = null;
      let lastSectionError = null;
      const MAX_SECTION_ATTEMPTS = 2;

      for (let attempt = 1; attempt <= MAX_SECTION_ATTEMPTS; attempt++) {
        if (signal && signal.aborted) throw new Error('Operación cancelada por el usuario.');

        if (attempt > 1) {
          const reasonMsg = lastSectionError?.message
            ? (lastSectionError.message.length > 80 ? lastSectionError.message.slice(0, 77) + '...' : lastSectionError.message)
            : 'Error transitorio de comunicación';
          emitThought(
            `Reintento IA Sección ${secNum}`,
            `🔄 Reintentando Sección ${secNum}/${totalSections} con ${aiConfig.selectedModel || 'Modelo IA'} (Intento ${attempt}/${MAX_SECTION_ATTEMPTS}) • Causa: ${reasonMsg}`,
            '⏳'
          );
          await new Promise(r => setTimeout(r, 2000));
        }

        try {
          const completionResult = await sendAiChatCompletion({
            systemPrompt,
            userPrompt,
            config: aiConfig,
            jsonMode: true,
            thinkingMode,
            signal,
            timeoutMs: 180000,
            maxAttempts: 1,
            onThinkingChunk: (delta, full) => {
              if (onThinkingStream) onThinkingStream(full);
            }
          });

          if (completionResult.thinking) {
            modelDeepThinking = (modelDeepThinking ? modelDeepThinking + '\n---\n' : '') + completionResult.thinking;
          }

          const compiled = compileStoryboardFromTemplate(
            sectionTemplate,
            completionResult.content,
            { globalBrief, mediaTypePreference }
          );

          if (compiled && compiled.length > 0) {
            sectionScenes = compiled;
            sectionSummary = `Sección ${secNum} estructurada en ${sectionScenes.length} cortes sincronizados al ritmo "${rhythm.name}".`;
            break;
          } else {
            throw new Error(`La respuesta de la IA no contiene una lista de escenas válida.`);
          }
        } catch (secErr) {
          if (signal && signal.aborted) throw secErr;
          lastSectionError = secErr;
          console.warn(`[SceneDirector] Intento ${attempt}/${MAX_SECTION_ATTEMPTS} en sección ${secNum} falló:`, secErr.message);
          if (secErr.message.includes('429') || secErr.message.includes('Límite') || secErr.message.includes('Rate Limit')) {
            emitThought(
              `Límite de API (HTTP 429)`,
              `⚠️ Ollama Cloud ha alcanzado su límite de tokens por minuto. Esperando 10 segundos para enfriamiento antes de reintentar...`,
              '⏳'
            );
            await new Promise(r => setTimeout(r, 10000));
          }
        }
      }

      if (!sectionScenes || sectionScenes.length === 0) {
        const errorDetail = lastSectionError?.message || 'Tiempo de espera agotado o error de comunicación con la API.';
        
        emitThought(
          `Respaldo de Plantilla en Sección ${secNum}`,
          `⚠️ Sección ${secNum}/${totalSections}: Completando cortes con la plantilla editorial de respaldo (${errorDetail}).`,
          '🛡️'
        );
        sectionScenes = compileStoryboardFromTemplate(
          sectionTemplate,
          null,
          { globalBrief, mediaTypePreference }
        );
        sectionSummary = `Sección estructurada con plantilla editorial de respaldo (${sectionScenes.length} cortes sincronizados).`;
      }

      sectionResults[secIdx] = {
        scenes: sectionScenes,
        summary: sectionSummary
      };

      completedSectionsCount++;
      const currentPercent = 25 + Math.round((completedSectionsCount / totalSections) * 55);
      onProgress({
        stage: 'ai_thinking',
        percent: currentPercent,
        message: `Completado Macro-Bloque ${completedSectionsCount}/${totalSections} [${formatTimecode(section.startTime)} - ${formatTimecode(section.endTime)}] con ${aiConfig.selectedModel || 'IA'}...`
      });

      emitThought(
        `Macro-Bloque ${secNum} Completado`,
        `✓ Macro-Bloque ${secNum}/${totalSections}: ${sectionScenes.length} escenas estructuradas con éxito (${completedSectionsCount}/${totalSections} listos).`,
        '✨'
      );
    };

    // Run sections using the worker concurrency pool
    let nextSecIdx = 0;
    const workerPromises = Array.from({ length: concurrencyLimit }, async () => {
      while (nextSecIdx < totalSections) {
        if (signal && signal.aborted) break;
        const currentTaskIdx = nextSecIdx++;
        await processSingleSection(currentTaskIdx);
        if (nextSecIdx < totalSections) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }
    });

    await Promise.all(workerPromises);

    // Collect all results in strict chronological order
    for (let i = 0; i < totalSections; i++) {
      const res = sectionResults[i];
      if (res && Array.isArray(res.scenes)) {
        allRemoteScenes.push(...res.scenes);
      }
      if (res && res.summary) {
        sectionSummaries.push(res.summary);
      }
    }

    if (allRemoteScenes.length > 0) {
      rawScenes = allRemoteScenes.slice(0, maxScenesLimit);
      editorialSummary = sectionSummaries.join(' ') || `Montaje cinematográfico estructurado en ${totalSections} macro-secciones por el Agente Director IA.`;
      emitThought(
        'Todas las Secciones Procesadas',
        `✓ Storyboard unificado: ${rawScenes.length} escenas generadas por IA a lo largo de ${totalSections} macro-bloque(s).`,
        '🎬'
      );
    }
  } else if (!hasCloudConfig) {
    globalBrief = extractLocalSemanticBrief(consolidatedSentences);
    emitThought(
      'Base Conceptual Local',
      `Tema Central detectado por motor semántico: "${globalBrief.coreTopic}".`,
      '💡'
    );
    emitThought(
      'Motor Local Seleccionado',
      `Ejecutando Motor Editorial Local de Alta Precisión (análisis semántico instantáneo con detección de anclas visuales).`,
      '⚡'
    );
  }

  // 4. If local mode was explicitly selected, run the Local Heuristic Director
  if (isLocalModel && rawScenes.length === 0) {
    onProgress({
      stage: 'heuristic_analysis',
      percent: 60,
      message: 'Motor Editorial Local estructurando cortes dinámicos por significado y anclas visuales...'
    });

    rawScenes = generateLocalSmartStoryboard(
      filteredSegments, // pass filteredSegments so it has access to exact micro-boundaries and 1.8s - 3.5s viral cuts!
      rhythm,
      targetSec,
      maxScenesLimit,
      mediaTypePreference
    );

    editorialSummary = `Montaje dinámico generado por el Motor Editorial Local en ${rawScenes.length} cortes sincronizados al guion.`;

    emitThought(
      'Cortes Estructurados',
      `✓ Generadas ${rawScenes.length} escenas contextuales con variedad de planos B-Roll e imágenes conceptuales.`,
      '🎯'
    );
  }

  onProgress({
    stage: 'math_chaining',
    percent: 85,
    message: 'Validando continuidad temporal estricta (Zero Gaps)...'
  });

  emitThought(
    'Continuidad Temporal',
    'Alineando marcas de tiempo para asegurar fluidez continua sin huecos negros en la línea de tiempo.',
    '🛡️'
  );

  // 4. Strict Timeline Chaining and Validation
  const totalDuration = filteredSegments[filteredSegments.length - 1].end;
  let currentTimelineCursor = filteredSegments[0].start;

  const scenes = rawScenes.map((s, idx) => {
    const startTime = idx === 0 ? filteredSegments[0].start : Number(currentTimelineCursor.toFixed(2));

    let rawEnd = Number(s.endTime);
    if (isNaN(rawEnd) || rawEnd <= startTime) {
      rawEnd = startTime + targetSec;
    }

    let endTime = Number(rawEnd.toFixed(2));
    const minDuration = rhythm.minSec || 1.8;
    const maxDurationAllowed = rhythm.id === 'balanced'
      ? Math.min(rhythm.maxSec || 7.5, 7.5)
      : (rhythm.id === 'dynamic' ? Math.min(rhythm.maxSec || 3.5, 3.5) : (rhythm.maxSec || 15.0));

    if (idx === rawScenes.length - 1) {
      if (Math.abs(totalDuration - endTime) < 1.5 && (totalDuration - startTime) <= maxDurationAllowed) {
        endTime = Number(Math.max(endTime, totalDuration).toFixed(2));
      } else if ((endTime - startTime) > maxDurationAllowed) {
        endTime = Number((startTime + maxDurationAllowed).toFixed(2));
      }
    } else {
      if (endTime - startTime < minDuration) {
        endTime = Number((startTime + minDuration).toFixed(2));
      } else if (endTime - startTime > maxDurationAllowed) {
        endTime = Number((startTime + maxDurationAllowed).toFixed(2));
      }
    }

    currentTimelineCursor = endTime;
    const duration = Number((endTime - startTime).toFixed(2));
    let isVideo;
    if (mediaTypePreference === 'video') {
      isVideo = true;
    } else if (mediaTypePreference === 'image') {
      isVideo = false;
    } else {
      isVideo = (s.visualType || '').toLowerCase().includes('video');
    }

    // Semantic Weight Analysis on the final script text
    const matchedSpokenWords = filteredSegments
      .filter(seg => seg.start < endTime && seg.end > startTime)
      .map(seg => seg.text)
      .join(' ')
      .trim();
    const scriptText = s.scriptExcerpt || s.text || matchedSpokenWords || '';
    const weightAnalysis = analyzePhraseVisualWeights(scriptText || s.title || '', idx);
    const isHighImpact = Boolean(s.isHighImpact || weightAnalysis.isHighImpact);

    // Title: use LLM title if specific, otherwise use anchor title
    let title = s.title;
    if (!title || /^escena\s*\d+/i.test(title.trim())) {
      title = weightAnalysis.title;
    }

    // Keywords: ensure concrete anchor keywords are prioritized
    let searchKeywords = Array.isArray(s.searchKeywords) && s.searchKeywords.length > 0
      ? s.searchKeywords
      : weightAnalysis.searchKeywords;

    if (isHighImpact && weightAnalysis.searchKeywords?.length > 0) {
      const merged = [...weightAnalysis.searchKeywords, ...searchKeywords];
      searchKeywords = Array.from(new Set(merged)).slice(0, 6);
    }

    return {
      id: `scene_${Date.now()}_${idx}`,
      sceneNumber: idx + 1,
      startTime,
      endTime,
      duration,
      title,
      visualAnchor: s.visualAnchor || weightAnalysis.primaryAnchor || title,
      visualWeight: s.visualWeight || weightAnalysis.visualWeight,
      isHighImpact,
      category: s.category || weightAnalysis.category,
      scriptText,
      visualType: isVideo ? 'video' : 'image',
      visualTypeLabel: isVideo ? 'Video B-Roll' : 'Imagen Conceptual',
      visualDescription: s.visualDescription || weightAnalysis.shotPrompt || generateContextualShotPrompt(scriptText, isVideo ? 'video' : 'image', idx),
      searchKeywords,
      mood: s.mood || extractMood(scriptText),
      color: SCENE_PALETTE[idx % SCENE_PALETTE.length]
    };
  });

  onProgress({
    stage: 'completed',
    percent: 100,
    message: `¡${scenes.length} escenas estructuradas con éxito!`
  });

  emitThought(
    'Montaje Finalizado',
    `¡Éxito! Storyboard consolidado con ${scenes.length} escenas en perfecta sincronía editorial.`,
    '✅'
  );

  const modelUsedLabel = isLocalModel
    ? 'Motor Editorial Local (Offline)'
    : (aiConfig.selectedModel || 'Modelo IA Remoto');

  return {
    summary: editorialSummary,
    scenes,
    thinking: modelDeepThinking,
    thoughts: allThoughts,
    globalBrief,
    usedFallback: false,
    isPartialRemote: false,
    fallbackReason: null,
    modelUsed: modelUsedLabel,
    rhythmProfile: rhythm
  };
}

