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
 * Runs the AI Graphic Director Agent
 */
export async function runGraphicDirectorAgent({
  transcriptSegments = [],
  scenes = [],
  timelineDuration = 30,
  vibeId = 'cyber_neon',
  aiConfig = {},
  forceLocal = false,
  signal = null,
  onProgress = () => {},
  onThinkingStep = () => {}
}) {
  const selectedVibe = GRAPHIC_VIBES.find(v => v.id === vibeId) || GRAPHIC_VIBES[0];

  onProgress({ percent: 5, message: 'Iniciando Cerebro del Diseñador Gráfico IA...' });
  onThinkingStep({
    type: 'init',
    title: 'Inicializando Cerebro Gráfico',
    text: `Configurando perfil estético: ${selectedVibe.name}. Evaluando guion y estructura de escenas.`
  });

  // Prepare normalized scene candidates
  const sceneItems = buildSceneCandidates(transcriptSegments, scenes, timelineDuration);

  if (sceneItems.length === 0) {
    throw new Error('No se detectaron escenas ni fragmentos de transcripción para analizar.');
  }

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

  // Anti-saturation chunking strategy:
  // Partitions scenes into focused batches of maximum 8 scenes.
  // This prevents context overflow, avoids token output truncation, and guarantees high-focus semantic attention.
  const BATCH_SIZE = 8;
  const batches = [];
  for (let i = 0; i < sceneItems.length; i += BATCH_SIZE) {
    batches.push(sceneItems.slice(i, i + BATCH_SIZE));
  }

  if (useRemoteAi) {
    onThinkingStep({
      type: 'chunking_strategy',
      title: 'Estrategia Anti-Saturación de Contexto',
      text: `Dividiendo ${sceneItems.length} escenas en ${batches.length} lote(s) secuencial(es) de máx ${BATCH_SIZE} escenas para garantizar atención focalizada, evitar truncamiento de tokens y prevenir saturación de contexto en ${aiConfig.selectedModel || 'el modelo IA'}.`
    });

    const allDecisionsMap = new Map();
    let totalAiApproved = 0;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (signal?.aborted) throw new Error('Operación cancelada por el usuario.');

      const currentBatch = batches[bIdx];
      const batchNum = bIdx + 1;
      const progressPercent = 20 + Math.round((bIdx / batches.length) * 45);

      onProgress({
        percent: progressPercent,
        message: `Analizando Lote ${batchNum}/${batches.length} (Escenas ${currentBatch[0].sceneNumber} a ${currentBatch[currentBatch.length - 1].sceneNumber}) con ${aiConfig.selectedModel || 'Modelo IA'}...`
      });

      onThinkingStep({
        type: 'cloud_request',
        title: `Lote ${batchNum}/${batches.length} (${currentBatch.length} escenas)`,
        text: `Enviando escenas ${currentBatch[0].sceneNumber} a ${currentBatch[currentBatch.length - 1].sceneNumber} a ${aiConfig.selectedModel || 'Ollama Cloud'} para detección precisa de apoyos visuales.`
      });

      try {
        const prompt = buildGraphicAnalysisPrompt(currentBatch, selectedVibe);
        const systemMessage = `Eres un Director de Arte y Editor de Motion Graphics profesional para videos virales, documentales y YouTube de alta gama.
Tu trabajo es analizar el guion de un video y decidir con criterio editorial estricto qué partes necesitan un apoyo gráfico (título con sombra, gráfico de barras, métrica KPI, lower-third o cita) y cuáles NO necesitan gráficos (dejando solo el video para evitar saturar al espectador).
Responde siempre con JSON estrictamente válido conforme al esquema solicitado con la clave "decisions".`;

        const response = await sendAiChatCompletion({
          systemPrompt: systemMessage,
          userPrompt: prompt,
          config: aiConfig,
          jsonMode: true,
          signal,
          timeoutMs: 60000,
          onThinkingChunk: (chunk) => {
            rawThinkingLog += chunk;
          }
        });

        if (response.thinking) {
          rawThinkingLog += (rawThinkingLog ? '\n---\n' : '') + response.thinking;
          onThinkingStep({
            type: 'deep_thinking',
            title: `Razonamiento Lote ${batchNum}: ${response.model}`,
            text: response.thinking.slice(0, 250) + (response.thinking.length > 250 ? '...' : '')
          });
        }

        const parsed = parseAiJsonResponse(response.content);
        const rawDecisions = parsed?.decisions || parsed?.decisiones || (Array.isArray(parsed) ? parsed : null);

        if (Array.isArray(rawDecisions) && rawDecisions.length > 0) {
          const batchResults = mergeAiDecisionsWithScenes(currentBatch, rawDecisions, selectedVibe);
          batchResults.forEach(item => allDecisionsMap.set(item.sceneNumber, item));
          const batchApproved = batchResults.filter(d => d.needsGraphic).length;
          totalAiApproved += batchApproved;

          onThinkingStep({
            type: 'cloud_success',
            title: `✓ Lote ${batchNum}/${batches.length} Completado`,
            text: `${batchApproved} gráficos aprobados para este bloque por ${response.model}.`
          });
        } else {
          throw new Error(`Respuesta del lote ${batchNum} sin estructura de decisiones válida.`);
        }
      } catch (batchErr) {
        if (signal?.aborted) throw batchErr;
        console.warn(`Lote ${batchNum} falló (${batchErr.message}). Aplicando fallback local a este lote para no detener el proceso.`);
        onThinkingStep({
          type: 'fallback',
          title: `Fallback en Lote ${batchNum}`,
          text: `La IA tuvo un inconveniente en el lote ${batchNum} (${batchErr.message}). Se aplica el analizador local a estas ${currentBatch.length} escenas sin afectar los demás lotes.`
        });
        const fallbackResults = runLocalGraphicAnalysis(currentBatch, selectedVibe, () => {});
        fallbackResults.forEach(item => allDecisionsMap.set(item.sceneNumber, item));
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
  } else {
    onThinkingStep({
      type: 'local_engine',
      title: 'Motor Semántico Editorial Local',
      text: `Analizando ${sceneItems.length} escenas con el motor local de alta velocidad.`
    });
    analysisDecisions = runLocalGraphicAnalysis(sceneItems, selectedVibe, onThinkingStep);
  }

  onProgress({ percent: 70, message: 'Etapa 2: Diseñando composición visual, tipografía y animaciones...' });
  onThinkingStep({
    type: 'stage2',
    title: 'Etapa 2: Herramientas de Creación Gráfica',
    text: `Generando especificaciones de motion graphics: tipografía con sombras calibradas, paletas de color, animaciones de entrada/loop/salida y conjuntos de datos para gráficos.`
  });

  // Stage 2: Create graphic clips for approved scenes
  const finalizedGraphics = [];
  analysisDecisions.forEach((item, idx) => {
    if (item.needsGraphic && item.graphicSpec) {
      const spec = item.graphicSpec;
      const clip = createGraphicClip({
        name: spec.name || `Gfx ${idx + 1}: ${spec.title}`,
        startTime: item.startTime,
        duration: Math.max(2.5, Math.min(6.5, item.duration)),
        graphicType: spec.graphicType || 'doc_chapter',
        themeId: selectedVibe.theme,
        fontFamily: spec.fontFamily || selectedVibe.font,
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
function runLocalGraphicAnalysis(scenes, selectedVibe, onThinkingStep) {
  return scenes.map((scene, idx) => {
    const text = (scene.scriptText || scene.title || '').trim();
    const lower = text.toLowerCase();

    // 1. Detección de Capítulos / Secciones / Apertura (en cualquier escena, no solo idx === 0)
    const chapterMatch = text.match(/\b(capítulo|capitulo|parte|sección|seccion|bloque|fase|episodio)\s*(\d+|[ivxlcdm]+)?(?:\s*[:\-])?\s*(.*)/i);
    const isIntro = idx === 0;

    // 2. Detección de Fechas e Hitos Temporales
    const fullDateMatch = text.match(/\b(\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{2,4})\b/i);
    const multipleYearsMatch = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
    const singleYearWithContext = text.match(/\b(?:en|año|hacia|durante|desde|hasta|para el año)?\s*(19\d{2}|20\d{2})\b/i);

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
    const metricMeasureMatch = text.match(/\b(\d+[\.,]?\d*)\s*(terabytes|gigavatios|transacciones|operaciones|km|toneladas|veces más|veces mas)\b/i);

    // 6. Detección de Multiplicadores y Crecimiento Cuantitativo
    const multiplierMatch = text.match(/\b(duplicó|duplico|triplicó|triplico|multiplicó por \d+|\d+x más|\d+x mas|creció un \d+%|caída del \d+%|caida del \d+%)\b/i);

    // 7. Detección de Vocabulario Económico, Financiero o Estadístico (rango amplio de la versión previa)
    const isEconomicOrGrowth = /\b(crecimiento|ganancias|ingresos|ventas|costos|economía|economia|inflación|inflacion|precio|precios|valor|inversión|inversion|mercado|mercados|balance|estadística|estadistica|gráfico|grafico|cifra|cifras|total|recesión|recesion|crisis|burbuja|deuda|tasas|interés|interes|capital|pérdidas|perdidas|demanda|oferta|acciones|bolsa|quiebra|producción|produccion|volumen|capacidad)\b/i.test(lower);

    // 8. Detección de Comparativas y Contrastes
    const isComparison = /\b(frente a|comparado|versus|vs|más que|mas que|menos que|antes y después|antes y despues|diferencia|superó|supero|caída de|caida de|subida de|en contraste|por el contrario|a diferencia de)\b/i.test(lower);

    // 9. Detección de Nombres Propios de Personas, Ponentes, Expertos o Entidades
    const speakerRoleMatch = text.match(/\b(ceo|co-fundador|fundador|director|directora|presidente|presidenta|experto|experta|autor|autora|investigador|investigadora|economista|analista|doctor|doctora|ministro|ministra|profesor|profesora|creador|creadora|inversor|trader|líder|lider)\b/i);
    const properNameMatch = text.match(/\b([A-ZÁÉÍÓÚ][a-z]+(?:\s+[A-ZÁÉÍÓÚ][a-z]+){1,2})\b/);
    const keyInstitutions = text.match(/\b(lehman brothers|goldman sachs|reserva federal|banco central|satoshi nakamoto|steve jobs|elon musk|wall street|silicon valley|fmi|banco mundial|warren buffett|mark zuckerberg|bill gates|jeff bezos|alan greenspan|milton friedman|john maynard keynes)\b/i);

    // 10. Detección de Citas Textuales entre comillas
    const quoteInQuotes = text.match(/["“]([^"”]{10,140})["”]/);

    // 11. Detección de Tesis, Reglas de Oro, Secretos o Conclusiones
    const isThesisOrRule = /\b(la verdad es|el secreto|lo más importante|lo mas importante|regla de oro|la clave está|la clave esta|recuerda que|la gran lección|la gran leccion|en conclusión|en conclusion|el resultado final|el resultado|la paradoja|el principio|la consecuencia|el punto clave)\b/i.test(lower);

    let needsGraphic = false;
    let graphicType = 'title_hero';
    let reasoning = '';
    let graphicSpec = null;

    // A. Apertura de Capítulo o Cambio de Sección (en cualquier escena)
    if (chapterMatch || isIntro) {
      needsGraphic = true;
      graphicType = 'doc_chapter';
      const chapterNum = chapterMatch?.[2] || (idx + 1);
      const prefix = chapterMatch ? `${chapterMatch[1].charAt(0).toUpperCase() + chapterMatch[1].slice(1).toLowerCase()} ${chapterNum}:` : 'Capítulo 1:';
      const candidateTitle = chapterMatch?.[3] || scene.title;
      const cleanTitle = (candidateTitle && !candidateTitle.startsWith('Escena') && !candidateTitle.startsWith('Segmento'))
        ? candidateTitle
        : (text.length > 0 && text.length < 50 ? text : 'El auge del dinero digital');

      reasoning = isIntro
        ? 'Apertura del video: Título directo sobre metraje estilo video-essay ("Capítulo 1:") con tipografía cinematográfica para retención inmediata.'
        : `Cambio de sección temática detectado ("${prefix}"). Marca el inicio de un nuevo bloque analítico.`;

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
    // B. Cronología de múltiples fechas / años
    else if (multipleYearsMatch && multipleYearsMatch.length >= 2) {
      needsGraphic = true;
      graphicType = 'doc_timeline';
      reasoning = `Evolución cronológica histórica detectada (${multipleYearsMatch.map(m => m[0]).join(', ')}). Se genera una línea de tiempo horizontal con hitos en cursiva negrita.`;
      const years = multipleYearsMatch.map(m => m[0]);
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
    // F. Fechas Históricas Específicas (Screenshot 3: 15 Septiembre 2008)
    else if (fullDateMatch || (singleYearWithContext && /\b(en|año|hacia|durante|desde|hito|momento|origen)\b/i.test(lower))) {
      needsGraphic = true;
      graphicType = 'doc_date';
      reasoning = 'Hito o fecha histórica determinante para la narrativa. Se destaca en verde documental vibrante con sombra cinematográfica.';
      const dateText = fullDateMatch ? fullDateMatch[0] : (singleYearWithContext ? (singleYearWithContext[0].length > 4 ? singleYearWithContext[0] : `Año ${singleYearWithContext[1]}`) : '15 Septiembre 2008');

      graphicSpec = {
        name: `Fecha: ${dateText}`,
        graphicType: 'doc_date',
        title: dateText,
        subtitle: scene.title && !scene.title.startsWith('Escena') ? scene.title : text.slice(0, 48),
        textColor: '#22c55e',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // G. Datos Cuantitativos Generales, Métricas o Multiplicadores (ej: 10x más rápido, 500 terabytes, duplicó, datos numéricos con vocabulario económico)
    else if (metricMeasureMatch || multiplierMatch || generalBigNumberMatch || (generalNumberMatch && isEconomicOrGrowth)) {
      needsGraphic = true;
      graphicType = 'doc_stat';
      const matchVal = (metricMeasureMatch || multiplierMatch || generalBigNumberMatch || generalNumberMatch)[0];
      const contextNoun = isEconomicOrGrowth ? (text.match(/\b(crecimiento|ingresos|ventas|inflación|precio|valor|deuda|capital|mercado)\b/i)?.[0] || 'registrado') : 'registrado';
      reasoning = `Métrica cuantitativa económica o multiplicador (${matchVal}). Se resalta como cifra clave para anclaje visual.`;

      graphicSpec = {
        name: `Cifra Clave: ${matchVal}`,
        graphicType: 'doc_stat',
        statNumber: matchVal,
        statText: contextNoun,
        title: `${matchVal} ${contextNoun}`,
        subtitle: text.length > 50 ? text.slice(0, 60) + '...' : '',
        accentColor: '#facc15',
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // H. Comparativas y Contrastes (vs, frente a, comparado, antes y después)
    else if (isComparison) {
      needsGraphic = true;
      graphicType = 'title_hero';
      reasoning = 'Contraste o comparativa conceptual relevante en el guion. Titular de impacto para clarificar la diferencia ante el espectador.';
      graphicSpec = {
        name: `Comparativa: ${scene.title}`,
        graphicType: 'title_hero',
        title: scene.title && !scene.title.startsWith('Escena') ? scene.title : 'Comparativa Clave',
        subtitle: text.length > 50 ? text.slice(0, 60) + '...' : text,
        animationIn: 'fade',
        presetPosition: 'center',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
    }
    // I. Identificación de Ponente, Experto, Institución o Nombre Propio (Lower Third flotante)
    else if (speakerRoleMatch || keyInstitutions || (properNameMatch && !properNameMatch[0].includes('Escena'))) {
      needsGraphic = true;
      graphicType = 'lower_third';
      reasoning = 'Mención de protagonista, autoridad, institución o persona clave. Se inserta un tercio inferior flotante con línea de acento sin tapar el metraje.';
      const institutionName = keyInstitutions ? keyInstitutions[0] : (properNameMatch ? properNameMatch[0] : '');
      const speakerTitle = institutionName || (scene.title.length < 28 && !scene.title.startsWith('Escena') ? scene.title : 'Especialista / Portavoz');
      const speakerSubtitle = speakerRoleMatch ? speakerRoleMatch[0].toUpperCase() : (text.slice(0, 45) || 'Análisis Especializado');

      graphicSpec = {
        name: `Identificador: ${speakerTitle}`,
        graphicType: 'lower_third',
        title: speakerTitle,
        subtitle: speakerSubtitle,
        badgeText: 'REFERENCIA',
        animationIn: 'slide-right',
        presetPosition: 'lower_third',
        fontFamily: selectedVibe.font,
        backdropGlass: false
      };
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
function buildGraphicAnalysisPrompt(scenes, vibe) {
  const scenesSummary = scenes.map(s => (
    `- Escena ${s.sceneNumber} (${formatTimecode(s.startTime)} - dur: ${s.duration.toFixed(1)}s):
  Título: "${s.title}"
  Guion transcrito: "${s.scriptText || 'Sin transcripción'}"`
  )).join('\n\n');

  return `Analiza como Director de Motion Graphics y Arte las siguientes ${scenes.length} escenas de video.
Estilo visual seleccionado: "${vibe.name}" (${vibe.desc}).

CRITERIO EDITORIAL Y TIPOLOGÍA DE APOYO VISUAL:
Tu objetivo es identificar TODOS los datos y momentos relevantes que necesitan un apoyo visual elegante para anclar la atención del espectador:
1. "doc_stat": Para CUALQUIER dato numérico, cuantitativo, monetario o estadístico.
   - Porcentajes (ej: "85%", "+24.5% de inflación", "3 de cada 10").
   - Cifras monetarias o financieras (ej: "$4.2 Billones", "500 millones de euros", "$100 USD").
   - Poblaciones, usuarios o magnitudes (ej: "800.000.000 de personas", "50M de usuarios", "10.000 transacciones").
   - Multiplicadores o escalas (ej: "10x más rápido", "duplicó su valor").
   -> Extrae "statNumber" (el número o porcentaje) y "statText" (la unidad o concepto).
2. "doc_date": Para fechas históricas exactas o años con peso decisivo en la narrativa (ej: "15 Septiembre 2008", "Octubre de 1929").
3. "doc_timeline": Para secuencias cronológicas de 2 o más años o hitos sucesivos (ej: 1975, 1976, 1981).
   -> Extrae array de "milestones": [{"date": "1975", "label": "Origen"}, ...].
4. "doc_chapter": Para inicio de capítulo, sección o cambio temático (ej: "Capítulo 1: El auge del dinero digital").
   -> Extrae "chapterPrefix" (ej: "Capítulo 1:") y "title".
5. "lower_third": Para identificar ponentes, expertos, protagonistas, empresas o instituciones clave (ej: "Satoshi Nakamoto", "Jerome Powell - Presidente de la Fed", "Lehman Brothers").
6. "title_hero": Para tesis centrales, reglas de oro, secretos o puntos de inflexión (ej: "La Regla de Oro del Mercado").
7. "quote_callout": Para citas textuales directas memorables.

REGLAS DE MONTAJE:
- Mantén limpias (needsGraphic: false) las escenas donde solo haya narrativa puente o metraje continuo para que el video respire y no sature.
- Todos los títulos flotan directamente sobre el metraje con sombras naturales de película (backdropGlass: false).

Devuelve JSON estrictamente válido con este esquema:
{
  "decisions": [
    {
      "sceneNumber": 1,
      "needsGraphic": true,
      "graphicType": "doc_chapter",
      "reasoning": "Apertura de capítulo temático.",
      "graphicSpec": {
        "title": "El auge del dinero digital",
        "chapterPrefix": "Capítulo 1:",
        "subtitle": "",
        "animationIn": "fade",
        "presetPosition": "center"
      }
    },
    {
      "sceneNumber": 2,
      "needsGraphic": true,
      "graphicType": "doc_stat",
      "reasoning": "Dato cuantitativo poblacional de enorme escala.",
      "graphicSpec": {
        "title": "800.000.000 de personas",
        "statNumber": "800.000.000",
        "statText": "de personas",
        "accentColor": "#facc15",
        "animationIn": "fade",
        "presetPosition": "center"
      }
    },
    {
      "sceneNumber": 3,
      "needsGraphic": true,
      "graphicType": "lower_third",
      "reasoning": "Identificación de autoridad o protagonista.",
      "graphicSpec": {
        "title": "Jerome Powell",
        "subtitle": "Presidente de la Reserva Federal",
        "animationIn": "slide-right",
        "presetPosition": "lower_third"
      }
    },
    {
      "sceneNumber": 4,
      "needsGraphic": false,
      "graphicType": null,
      "reasoning": "Metraje continuo sin elementos superpuestos para mantener ritmo y respiración visual.",
      "graphicSpec": null
    }
  ]
}

ESCENAS:
${scenesSummary}`;
}

/**
 * Normalizes AI decision objects from various model formats (English/Spanish keys, flat or nested specs)
 */
function normalizeAiDecision(d, idx) {
  if (!d) return null;
  const rawNum = d.sceneNumber || d.escena || d.scene || d.id || (idx + 1);
  const sceneNum = Number(rawNum) || (idx + 1);

  const rawNeeds = d.needsGraphic !== undefined
    ? d.needsGraphic
    : (d.necesita_grafico !== undefined
      ? d.necesita_grafico
      : (d.graphicType !== 'none' && d.tipo_grafico !== 'ninguno'));
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

  const spec = d.graphicSpec || d.especificacion || d.elementos || {};

  return {
    sceneNumber: sceneNum,
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
 * Merges AI response decisions with original scenes
 */
function mergeAiDecisionsWithScenes(scenes, aiDecisions, vibe) {
  const normalizedList = (aiDecisions || []).map((d, i) => normalizeAiDecision(d, i)).filter(Boolean);
  const map = new Map(normalizedList.map(d => [d.sceneNumber, d]));

  return scenes.map((scene, idx) => {
    const aiDecision = map.get(scene.sceneNumber) || normalizedList[idx];
    if (!aiDecision) {
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

    const needsGraphic = Boolean(aiDecision.needsGraphic && aiDecision.graphicType && aiDecision.graphicType !== 'none');
    let graphicSpec = null;

    if (needsGraphic && aiDecision.graphicSpec) {
      const gType = aiDecision.graphicType;
      const spec = aiDecision.graphicSpec;
      graphicSpec = {
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
    }

    return {
      sceneNumber: scene.sceneNumber,
      startTime: scene.startTime,
      duration: scene.duration,
      title: scene.title,
      scriptText: scene.scriptText,
      needsGraphic,
      graphicType: needsGraphic ? aiDecision.graphicType : null,
      reasoning: aiDecision.reasoning || (needsGraphic ? 'Apoyo gráfico generado por IA.' : 'Solo video.'),
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
  let gfxTrack = tracks.find(t => t.id === targetTrackId || t.name?.includes('Gráficos') || t.type === 'graphics');

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
