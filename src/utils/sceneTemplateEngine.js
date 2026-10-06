/**
 * Scene Template Engine (Motor de Plantillas de Escenas)
 * 
 * Implementa la arquitectura solicitada:
 * 1. Genera la PLANTILLA (template) de escenas matemáticamente perfecta a partir
 *    de la transcripción y el ritmo editorial seleccionado (tiempos, cortes, frases y valores por defecto).
 * 2. Permite que el Agente IA genere ÚNICAMENTE los textos creativos (títulos, tipo visual,
 *    descripciones cinematográficas y palabras clave) sin saturarse calculando tiempos o esquemas JSON pesados.
 * 3. Ejecuta la plantilla compilando los textos generados en el JSON final listo para la línea de tiempo,
 *    con garantía absoluta de continuidad temporal, cero huecos y tolerancia a fallos.
 */

import { formatTimecode } from './timeFormat.js';
import { parseAiJsonResponse } from './aiClient.js';
import {
  analyzePhraseVisualWeights,
  segmentIntoEditorialBeats,
  extractDialogueVisualCore
} from './semanticWeightAnalyzer.js';

export { extractDialogueVisualCore };

/**
 * Extracts key search keywords from dialogue for stock footage search,
 * prioritized by visual anchor weight and dialogue entities.
 */
export function extractSearchKeywords(text) {
  const core = extractDialogueVisualCore(text);
  if (core && core.searchKeywords && core.searchKeywords.length > 0) {
    return core.searchKeywords;
  }

  const weightAnalysis = analyzePhraseVisualWeights(text);
  if (weightAnalysis && weightAnalysis.searchKeywords && weightAnalysis.searchKeywords.length > 0) {
    return weightAnalysis.searchKeywords;
  }

  return ['cinematic', 'b-roll', 'visual'];
}

/**
 * Generates a specific, evocative visual prompt tailored directly to the spoken words.
 */
export function generateContextualShotPrompt(sentenceText, visualType = 'video', sceneIndex = 0) {
  const weightAnalysis = analyzePhraseVisualWeights(sentenceText, sceneIndex);
  if (weightAnalysis && weightAnalysis.isHighImpact && weightAnalysis.shotPrompt) {
    return weightAnalysis.shotPrompt;
  }

  const core = extractDialogueVisualCore(sentenceText, sceneIndex, visualType);
  return core.shotPrompt;
}

/**
 * Builds the mathematically precise Scene Template from speech segments and rhythm.
 * 
 * @param {Array<object>} inputSegments Raw transcript segments or consolidated sentences
 * @param {object} rhythm Selected rhythm profile ({ id, avgSec, minSec, maxSec })
 * @param {number} targetSec Target seconds per scene
 * @param {object} options Additional options (mediaTypePreference, startIndex, maxScenes)
 * @returns {Array<object>} Array of SceneTemplateItem
 */
export function buildSceneTemplate(inputSegments, rhythm, targetSec, options = {}) {
  if (!inputSegments || inputSegments.length === 0) return [];

  const mediaTypePreference = options.mediaTypePreference || 'mixed';
  const startIndex = options.startIndex || 0;
  const maxScenes = (options.maxScenes && options.maxScenes > 0 && options.maxScenes !== Infinity)
    ? options.maxScenes
    : Infinity;

  // Flatten segments if input contains sentence groups with child segments
  const flattened = [];
  inputSegments.forEach(item => {
    if (Array.isArray(item.segments) && item.segments.length > 0) {
      flattened.push(...item.segments);
    } else {
      flattened.push(item);
    }
  });

  const sourceSegments = flattened.length > 0 ? flattened : inputSegments;

  // Segment speech into editorial beats respecting the chosen rhythm profile
  const beats = segmentIntoEditorialBeats(sourceSegments, rhythm, targetSec);

  const template = [];
  for (let i = 0; i < beats.length; i++) {
    if (template.length >= maxScenes) break;

    const beat = beats[i];
    const sceneNum = startIndex + i + 1;
    const analysis = beat.anchorAnalysis || analyzePhraseVisualWeights(beat.text, i);

    let defaultType = 'video';
    if (mediaTypePreference === 'video') {
      defaultType = 'video';
    } else if (mediaTypePreference === 'image') {
      defaultType = 'image';
    } else {
      defaultType = analysis.recommendedVisualType === 'video'
        ? (i % 4 !== 3 ? 'video' : 'image')
        : (i % 3 !== 2 ? 'video' : 'image');
    }

    const dialogueCore = extractDialogueVisualCore(beat.text, i, defaultType);

    const defaultTitle = (analysis.title && !analysis.title.startsWith('Escena') && analysis.isHighImpact)
      ? analysis.title
      : dialogueCore.title;

    const defaultDesc = (analysis.isHighImpact && analysis.shotPrompt)
      ? analysis.shotPrompt
      : dialogueCore.shotPrompt;

    const defaultKeywords = Array.isArray(analysis.searchKeywords) && analysis.searchKeywords.length > 0 && analysis.isHighImpact
      ? analysis.searchKeywords
      : dialogueCore.searchKeywords;

    const defaultAnchor = (analysis.primaryAnchor && !analysis.primaryAnchor.startsWith('Escena') && analysis.isHighImpact)
      ? analysis.primaryAnchor
      : dialogueCore.visualAnchor;

    template.push({
      id: sceneNum,
      startTime: Number(beat.start.toFixed(2)),
      endTime: Number(beat.end.toFixed(2)),
      duration: Number((beat.end - beat.start).toFixed(2)),
      scriptExcerpt: beat.text.trim(),
      defaultTitle,
      defaultVisualType: defaultType,
      defaultVisualDescription: defaultDesc,
      defaultKeywords,
      visualWeight: analysis.visualWeight || 6,
      visualAnchor: defaultAnchor,
      isHighImpact: Boolean(analysis.isHighImpact)
    });
  }

  return template;
}

/**
 * Formats the Scene Template into a clean, token-efficient text format for the AI prompt.
 * Provides the COMPLETE dialogue sentence so the AI understands 100% of the speech context.
 * 
 * @param {Array<object>} template Array of SceneTemplateItem
 * @returns {string} Formatted text lines of the template
 */
export function formatTemplateLines(template) {
  return template.map(t => {
    const timeStr = `${formatTimecode(t.startTime)} - ${formatTimecode(t.endTime)}`;
    const cleanDialogue = (t.scriptExcerpt || '').replace(/\s+/g, ' ').trim();
    return `[${t.id}] ${timeStr} | Diálogo: "${cleanDialogue}"`;
  }).join('\n');
}

/**
 * Builds the AI prompt instructing the model to complete ONLY the creative text fields
 * for the pre-existing Scene Template.
 * 
 * @param {Array<object>} template Array of SceneTemplateItem
 * @param {object} globalBrief Master conceptual brief (coreTopic, visualTone, etc.)
 * @param {object} rhythm Rhythm profile
 * @param {object} options { mediaTypePreference, sectionNum, totalSections, thinkingGuidance }
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildTemplateAiPrompt(template, globalBrief, rhythm, options = {}) {
  const {
    mediaTypePreference = 'mixed',
    sectionNum = 1,
    totalSections = 1,
    thinkingGuidance = ''
  } = options;

  let typeRule = `3. TIPO VISUAL (HÍBRIDO): Usa 'video' para acción/dinamismo o 'image' para conceptos/metáforas.`;
  if (mediaTypePreference === 'video') {
    typeRule = `3. FORMATO EXCLUSIVO: El usuario ha configurado SOLO VIDEOS. Todos los "type" DEBEN ser obligatoriamente "video".`;
  } else if (mediaTypePreference === 'image') {
    typeRule = `3. FORMATO EXCLUSIVO: El usuario ha configurado SOLO IMÁGENES. Todos los "type" DEBEN ser obligatoriamente "image".`;
  }

  const systemPrompt = `Eres un Director de Fotografía y Montador Cinematográfico de élite (estilo HBO, National Geographic, Vox y Apple TV).
Tu misión es diseñar los conceptos visuales, tomas sugeridas y palabras clave de búsqueda para la siguiente PLANTILLA DE ESCENAS ya sincronizada al audio.

BASE CONCEPTUAL MAESTRA DEL VIDEO:
- TEMA CENTRAL: ${globalBrief?.coreTopic || 'Montaje audiovisual'}
- ARCO NARRATIVO: ${globalBrief?.narrativeArc || 'Desarrollo narrativo fluido'}
- TONO Y ESTÉTICA VISUAL: ${globalBrief?.visualTone || 'Cinematográfico 4K, iluminación natural volumétrica y texturas de alta definición'}
- ANCLAS VISUALES CLAVE: ${(globalBrief?.keyAnchors || []).join(', ')}

${thinkingGuidance}

REGLA FUNDAMENTAL #1: MÁXIMO ESFUERZO PARA QUE CADA ESCENA CUADRE CON SU DIÁLOGO (CERO DESCONEXIÓN)
El creador de la escena DEBE esforzarse activamente para que el concepto visual, la toma sugerida ("visual"), el ancla ("anchor") y las palabras clave ("keywords") CUADREN DIRECTA Y LITERALMENTE CON LO QUE DICE EL DIÁLOGO en cada momento:
1. Lee con extrema atención el texto del campo 'Diálogo' de cada escena.
2. Identifica los sujetos reales, las acciones físicas, lugares, épocas u objetos específicos que el narrador está pronunciando en esa frase exacta.
3. La toma sugerida ("visual") DEBE ilustrar y escenificar con precisión lo que se dice en ese diálogo:
   - Si el diálogo es histórico (ej: siglo XIX, Ámsterdam, fundación de una cervecería, reyes, guerras), la escena DEBE ambientarse en esa época histórica con arquitectura, vestuario e iluminación de época (¡CERO computadoras modernas u oficinas de hoy!).
   - Si el diálogo habla de un producto, ingrediente o herramienta específica (ej: cerveza, jarras de ginebra, levadura, barricas de madera, barcos en canales), la toma DEBE mostrar esos elementos físicos en acción.
   - Si el diálogo relata una acción concreta (ej: "compró la cervecería", "viajó a París", "desarrolló la fórmula"), describe esa acción física con encuadre de cámara e iluminación cinematográfica.
   - ESTÁ TOTALMENTE PROHIBIDO crear conceptos abstractos o escenas genéricas desconectadas del diálogo (ej. personas con laptops modernas, oficinas genéricas o fondos abstractos cuando el diálogo habla de otra cosa).
4. El campo "anchor" DEBE contener la entidad o sujeto visual directo extraído del diálogo (ej: "Cervecería Haystack 1864", "Gerard Heineken Ámsterdam", "Fórmula de Levadura A", "Jarras de ginebra en taberna").
5. Las "keywords" DEBEN contener términos precisos en inglés y español derivados de las palabras clave del diálogo para encontrar el material exacto en bancos de stock y en la web abierta.
${typeRule}

FORMATO JSON DE RESPUESTA DIRECTO (solo los textos creativos por cada id):
[
  {
    "id": 1,
    "title": "Título que sintetiza la acción del diálogo",
    "anchor": "Sujeto visual específico del diálogo",
    "type": "${mediaTypePreference === 'image' ? 'image' : 'video'}",
    "visual": "Toma sugerida: Plano cinematográfico con encuadre, sujeto real del diálogo en acción física, ambientación de época e iluminación",
    "keywords": ["specific english term from dialogue", "historical subject", "action descriptor", "termino en espanol"]
  }
]`;

  const templateText = formatTemplateLines(template);
  const sectionHeader = totalSections > 1
    ? `Sección ${sectionNum} de ${totalSections} (${template.length} escenas en la plantilla):`
    : `Plantilla de Montaje (${template.length} escenas en total):`;

  const userPrompt = `${sectionHeader}
${templateText}

Redacta los conceptos visuales, tomas sugeridas cinematográficas, ancla y palabras clave para cada una de las ${template.length} escenas (ids 1 a ${template.length}).
Cada escena DEBE cuadrar al 100% con lo que narra la voz en off en su campo "Diálogo".
Mantén la más alta calidad cinematográfica y coherencia absoluta con el Tema Central: "${globalBrief?.coreTopic || 'el video'}".
Devuelve directamente el JSON con la lista de escenas.`;

  return { systemPrompt, userPrompt };
}

/**
 * Fallback parser for text line formats if the AI returns lines instead of valid JSON:
 * e.g. "1 | Título | video | Descripción visual | kw1, kw2"
 * or "[1] Título: ... | Tipo: video | Visual: ... | Keywords: ..."
 */
export function parseTextLineItems(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const items = [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Try pipe-separated: 1 | Title | type | visual | keywords
    const pipeParts = line.split('|').map(p => p.trim());
    if (pipeParts.length >= 3) {
      const idMatch = pipeParts[0].match(/(\d+)/);
      if (idMatch) {
        const id = parseInt(idMatch[1], 10);
        const title = pipeParts[1];
        let type = 'video';
        let visual = '';
        let keywords = [];

        if (pipeParts.length === 3) {
          visual = pipeParts[2];
        } else if (pipeParts.length === 4) {
          type = pipeParts[2].toLowerCase().includes('image') ? 'image' : 'video';
          visual = pipeParts[3];
        } else if (pipeParts.length >= 5) {
          type = pipeParts[2].toLowerCase().includes('image') ? 'image' : 'video';
          visual = pipeParts[3];
          keywords = pipeParts[4].split(',').map(k => k.trim()).filter(Boolean);
        }

        items.push({ id, title, type, visual, keywords });
        continue;
      }
    }

    // Try labelled format: "[1] Title: ... | Type: ... | Visual: ..."
    const bracketMatch = line.match(/^\[?(\d+)\]?[:\.\s]+(.+)$/);
    if (bracketMatch) {
      const id = parseInt(bracketMatch[1], 10);
      const rest = bracketMatch[2];
      const titleMatch = rest.match(/t[ií]tulo[:\s]+([^|;]+)/i);
      const visualMatch = rest.match(/(?:visual|descripci[oó]n)[:\s]+([^|;]+)/i);
      const keywordsMatch = rest.match(/(?:keywords|palabras)[:\s]+([^|;]+)/i);
      const typeMatch = rest.match(/(?:tipo|type)[:\s]+(video|image|imagen)/i);

      items.push({
        id,
        title: titleMatch ? titleMatch[1].trim() : rest.split('|')[0].trim(),
        type: typeMatch && typeMatch[1].toLowerCase().includes('imag') ? 'image' : 'video',
        visual: visualMatch ? visualMatch[1].trim() : '',
        keywords: keywordsMatch ? keywordsMatch[1].split(',').map(k => k.trim()).filter(Boolean) : []
      });
    }
  }

  return items;
}

/**
 * Script / Tool that compiles the complete final storyboard JSON from the pre-existing Scene Template
 * and the AI-generated creative texts.
 * 
 * Guarantee:
 * - 100% timeline continuity with zero gaps or overlaps (math preserved from template).
 * - Every scene is populated with high-quality creative text from the AI or intelligent defaults.
 * - Respects the user's mediaTypePreference.
 * 
 * @param {Array<object>} template Pre-existing Scene Template
 * @param {string|object|Array} aiOutput Raw AI response or parsed objects
 * @param {object} options { globalBrief, mediaTypePreference }
 * @returns {Array<object>} Array of compiled, production-ready scene objects
 */
export function compileStoryboardFromTemplate(template, aiOutput, options = {}) {
  if (!template || template.length === 0) return [];

  const { mediaTypePreference = 'mixed' } = options;
  let parsedItems = [];

  // Parse AI output
  if (typeof aiOutput === 'string') {
    const jsonParsed = parseAiJsonResponse(aiOutput);
    if (jsonParsed) {
      if (Array.isArray(jsonParsed)) {
        parsedItems = jsonParsed;
      } else if (Array.isArray(jsonParsed.scenes)) {
        parsedItems = jsonParsed.scenes;
      } else if (typeof jsonParsed === 'object') {
        const potentialArray = Object.values(jsonParsed).find(v => Array.isArray(v));
        if (potentialArray) parsedItems = potentialArray;
      }
    }

    if (parsedItems.length === 0) {
      parsedItems = parseTextLineItems(aiOutput);
    }
  } else if (Array.isArray(aiOutput)) {
    parsedItems = aiOutput;
  } else if (aiOutput && Array.isArray(aiOutput.scenes)) {
    parsedItems = aiOutput.scenes;
  }

  // Build lookup map by ID and sequential index
  const itemMap = new Map();
  parsedItems.forEach((item, idx) => {
    if (!item) return;

    if (Array.isArray(item)) {
      const idVal = item[0] !== undefined ? String(item[0]).replace(/\D/g, '') : String(idx + 1);
      const converted = {
        id: idVal,
        title: item[1] || '',
        type: item[2] || '',
        visual: item[3] || '',
        keywords: Array.isArray(item[4]) ? item[4] : (typeof item[4] === 'string' ? item[4].split(',') : [])
      };
      itemMap.set(idVal, converted);
      return;
    }

    const idVal = item.id !== undefined
      ? String(item.id).replace(/\D/g, '')
      : (item.sceneId !== undefined ? String(item.sceneId).replace(/\D/g, '') : String(idx + 1));

    if (idVal) {
      itemMap.set(idVal, item);
    }
  });

  // Compile final scenes by merging the template with AI texts
  const compiledScenes = template.map((tmpl, idx) => {
    const aiItem = itemMap.get(String(tmpl.id))
      || itemMap.get(String(idx + 1))
      || parsedItems[idx]
      || {};

    // 1. Visual Type
    let visualType = tmpl.defaultVisualType;
    if (mediaTypePreference === 'video') {
      visualType = 'video';
    } else if (mediaTypePreference === 'image') {
      visualType = 'image';
    } else if (aiItem.type || aiItem.visualType) {
      const rawType = String(aiItem.type || aiItem.visualType).toLowerCase();
      visualType = (rawType.includes('image') || rawType.includes('imagen') || rawType.includes('foto'))
        ? 'image'
        : 'video';
    }

    // 2. Title
    const rawTitle = (aiItem.title && String(aiItem.title).trim()) || '';
    const title = (rawTitle && !rawTitle.match(/^escena\s*\d+$/i))
      ? rawTitle
      : tmpl.defaultTitle;

    // 3. Visual Anchor (Entity)
    const rawAnchor = String(
      aiItem.anchor ||
      aiItem.visualAnchor ||
      aiItem.ancla ||
      aiItem.sujeto ||
      ''
    ).trim();
    const visualAnchor = (rawAnchor && rawAnchor.length > 2 && !rawAnchor.match(/^escena\s*\d+$/i))
      ? rawAnchor
      : (tmpl.visualAnchor || title);

    // 4. Visual Description (Toma sugerida)
    const rawDesc = String(
      aiItem.visual ||
      aiItem.visualDescription ||
      aiItem.toma ||
      aiItem.tomaSugerida ||
      aiItem.toma_sugerida ||
      aiItem.shotPrompt ||
      aiItem.shot_prompt ||
      aiItem.desc ||
      aiItem.description ||
      ''
    ).trim();

    // Check if rawDesc is a generic modern tech mismatch on a non-tech dialogue
    const isGenericMismatch = /tecnolog[ií]a moderna|centro de datos|servidores en rack|microprocesador/i.test(rawDesc) &&
                              !/tecnolog|ia|servidor|chip|software|computaci/i.test(tmpl.scriptExcerpt);

    const visualDescription = (rawDesc && rawDesc.length > 10 && !isGenericMismatch)
      ? rawDesc
      : tmpl.defaultVisualDescription;

    // 5. Search Keywords
    let searchKeywords = [];
    const rawKw = aiItem.keywords || aiItem.searchKeywords;
    if (Array.isArray(rawKw) && rawKw.length > 0) {
      searchKeywords = rawKw.map(k => String(k).trim()).filter(Boolean);
    } else if (typeof rawKw === 'string' && rawKw.trim()) {
      searchKeywords = rawKw.split(',').map(k => k.trim()).filter(Boolean);
    }

    if (searchKeywords.length === 0 || isGenericMismatch) {
      searchKeywords = tmpl.defaultKeywords || [];
    }

    // Ensure visual anchor is accessible in searchKeywords
    if (visualAnchor && visualAnchor.length > 3 && !searchKeywords.some(k => k.toLowerCase() === visualAnchor.toLowerCase())) {
      searchKeywords.unshift(visualAnchor);
    }

    return {
      startTime: tmpl.startTime,
      endTime: tmpl.endTime,
      duration: tmpl.duration,
      title,
      scriptExcerpt: tmpl.scriptExcerpt,
      visualType,
      visualDescription,
      searchKeywords,
      visualWeight: tmpl.visualWeight,
      visualAnchor,
      isHighImpact: tmpl.isHighImpact,
      isAiCurated: Boolean(aiItem.title || aiItem.visual || aiItem.keywords)
    };
  });

  return compiledScenes;
}
