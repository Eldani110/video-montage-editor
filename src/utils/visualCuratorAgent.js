/**
 * Visual AI Curator & Research Agent
 * Implements a multi-stage intelligent stock research pipeline:
 * 1. AI-powered multi-angle search query formulation (3-4 complementary English queries)
 * 2. Cross-search relevance & quality pre-screening with AI
 * 3. High-resolution 8-candidate mosaic collage generation
 * 4. Multimodal Vision AI final curation (Anti-Cliché, cinematic lighting, narrative fit)
 */
import { sendAiChatCompletion, parseAiJsonResponse, getSavedAiConfig } from './aiClient.js';
import { buildVisualCandidateCollage } from './visualCollageBuilder.js';
import { analyzePhraseVisualWeights } from './semanticWeightAnalyzer.js';
import { extractSceneConceptPills } from './stockMediaClient.js';

/**
 * Editorial Quality Criteria applied by the Vision AI Agent
 */
export const EDITORIAL_QUALITY_CRITERIA = [
  'Concordancia Absoluta con el Tema Principal del Video (Cero discordancias/zanahorias)',
  'Concordancia Conceptual Profunda con la frase y ancla del guion',
  'Filtro Anti-Stock Cliché (Cero imágenes sosas o poses artificiales)',
  'Filtro Anti-Estrambótico (Rechazo de elementos bizarros o disonantes)',
  'Composición Cinemática, Iluminación y Textura B-Roll Premium',
  'Evaluación Temporal de Movimiento (Fotogramas 1 vs 2 en videos)'
];

/**
 * Analyzes the entire script and scene structure of a video to identify the Global Video Topic,
 * visual universe, mandatory search anchor keywords, and forbidden discordant concepts (e.g. carrots in AI videos).
 */
export async function detectGlobalVideoTopic({
  project = null,
  scenes = [],
  aiConfig = null,
  signal = null
}) {
  // 1. If project already has an explicit or saved coreTopic, reuse it
  if (project?.scenes?.coreTopic && typeof project.scenes.coreTopic === 'object' && project.scenes.coreTopic.coreTopic) {
    return project.scenes.coreTopic;
  }

  // 2. Gather text from all scenes
  const scenesList = scenes && scenes.length > 0 ? scenes : (project?.scenes?.list || []);
  const allSceneTitles = scenesList.map(s => s.title || '').join(' | ');
  const allScriptTexts = scenesList.map(s => s.scriptText || s.text || '').join(' ');
  const projectSummary = project?.scenes?.summary || project?.name || '';
  const combinedText = `${projectSummary} ${allSceneTitles} ${allScriptTexts}`.trim();

  // Try LLM for rich topic extraction if AI is available
  const configToUse = aiConfig || getSavedAiConfig();
  if (configToUse && (configToUse.apiKey || configToUse.baseUrl?.includes('localhost') || configToUse.baseUrl?.includes('127.0.0.1')) && combinedText.length > 20) {
    const systemPrompt = `Eres un Director Creativo y Productor Ejecutivo Audiovisual.
Tu tarea es analizar el guion y las escenas completas de un video para definir su TEMA PRINCIPAL y su UNIVERSO VISUAL ESTRICTO.
Esto es vital para que las búsquedas de recursos B-Roll tengan 100% de coherencia y NUNCA se mezclen elementos disonantes (ej. si el video es de Inteligencia Artificial o tecnología, jamás debe aparecer una zanahoria, hortalizas, una granja o gente cocinando, aun cuando una frase metafórica diga "alimentar la red" o "crecimiento orgánico").

Responde ÚNICAMENTE en JSON con esta estructura exacta:
{
  "coreTopic": "Nombre claro del tema principal (ej: 'Inteligencia Artificial y Modelos de Lenguaje' o 'Finanzas y Emprendimiento')",
  "visualDomain": "Descripción concisa del universo visual permitido (ej: 'Servidores, circuitos, código, interfaces digitales, oficinas tecnológicas, oficinas ejecutivas')",
  "mandatoryKeywords": ["ai", "technology", "digital", "data", "cyber"], // 3 a 5 palabras clave en inglés representativas del tema
  "forbiddenDiscordantConcepts": ["carrot", "vegetable", "farming", "harvest", "cooking", "kitchen", "barn", "tractor", "infant toys"], // conceptos ajenos a descartar
  "topicSummary": "1 frase que define de qué trata el video"
}`;

    const userPrompt = `Título / Resumen del Proyecto: "${projectSummary || 'Video Documental / Ensayo'}"
Escenas (${scenesList.length}):
${allSceneTitles.slice(0, 1000)}

Muestra del Guion:
"${allScriptTexts.slice(0, 1500)}"

Determina el Tema Principal del Video y el Universo Visual Estricto.`;

    try {
      const response = await sendAiChatCompletion({
        systemPrompt,
        userPrompt,
        config: configToUse,
        jsonMode: true,
        signal,
        timeoutMs: 25000
      });

      const parsed = parseAiJsonResponse(response.content);
      if (parsed && parsed.coreTopic && Array.isArray(parsed.mandatoryKeywords)) {
        return {
          coreTopic: parsed.coreTopic,
          visualDomain: parsed.visualDomain || 'Entorno cinematográfico profesional afín al tema',
          mandatoryKeywords: parsed.mandatoryKeywords.map(k => String(k).toLowerCase().trim()),
          forbiddenDiscordantConcepts: Array.isArray(parsed.forbiddenDiscordantConcepts)
            ? parsed.forbiddenDiscordantConcepts.map(c => String(c).toLowerCase().trim())
            : ['carrot', 'vegetable', 'farming', 'cooking'],
          topicSummary: parsed.topicSummary || parsed.coreTopic
        };
      }
    } catch (e) {
      if (signal && signal.aborted) throw e;
      console.warn('[VisualCurator] Fallo al extraer tema principal con IA, usando detector analítico local:', e.message);
    }
  }

  // 3. Robust Local Semantic Domain Extractor
  return extractLocalSemanticDomain(combinedText);
}

/**
 * Robust Local Semantic Domain Extractor when AI is offline
 */
export function extractLocalSemanticDomain(combinedText = '') {
  const text = (combinedText || '').toLowerCase();

  // Brewing / Beer / Historical Beverage Brands
  if (/cerveza|heineken|hayneken|barril|l[uú]pulo|cebada|cervecer|fermentaci[oó]n|botella\s*verde|trago|brindis|copa|bebida/i.test(text)) {
    return {
      coreTopic: 'Cervecería, Tradición Cervecera y Expansión Global',
      visualDomain: 'Cervecerías artesanales e históricas, maestros cerveceros examinando lúpulo y cebada, barriles de madera, vasos con cerveza fresca y espuma dorada, canales históricos de Ámsterdam, fábricas vintage del siglo XIX y brindis entre personas',
      mandatoryKeywords: ['beer', 'brewery', 'brewing', 'amsterdam', 'glass beer'],
      forbiddenDiscordantConcepts: [
        'baby', 'infant', 'toddler', 'newborn', 'bebe', 'bebé', 'anime', 'manga', 'drawing', 'sketch',
        'cartoon', 'comic', 'carrot', 'zanahoria', 'vegetable', 'farm tractor'
      ],
      topicSummary: 'Video documental sobre la historia de la cerveza Heineken, sus orígenes en Ámsterdam y su expansión global.'
    };
  }

  // Tech / AI Domain
  if (/ia\b|inteligencia artificial|algoritmo|red neuronal|machine learning|deep learning|software|c[oó]digo|servidor|data center|tecnolog|digital|hardware|chip|robot|cibern/i.test(text)) {
    return {
      coreTopic: 'Inteligencia Artificial y Tecnología Digital',
      visualDomain: 'Servidores, circuitos, flujos de código, interfaces digitales, redes neuronales, centros de datos, microchips y oficinas modernas de software',
      mandatoryKeywords: ['technology', 'digital', 'artificial intelligence', 'data', 'cyber'],
      forbiddenDiscordantConcepts: [
        'carrot', 'zanahoria', 'vegetable', 'vegetables', 'huerto', 'garden', 'gardening',
        'farming', 'farm', 'granja', 'tractor', 'harvest', 'cosecha', 'cooking', 'cocina',
        'recipe', 'receta', 'baking', 'cake', 'soup', 'salad', 'ensalada', 'meat',
        'barn', 'pigs', 'cows', 'chicken farm', 'infant', 'baby diaper', 'toddler toys', 'doll'
      ],
      topicSummary: 'Video centrado en inteligencia artificial, innovación computacional y desarrollo tecnológico.'
    };
  }

  // Wealth / Finance / Business Domain
  if (/dinero|plata|efectivo|billetes?|d[oó]lar|inversi[oó]n|capital|finanzas|burs[aá]til|millonario|ganancias?|negocio|banco|wall street/i.test(text)) {
    return {
      coreTopic: 'Finanzas, Capital e Inversión',
      visualDomain: 'Dinero en efectivo sobre mesas, rascacielos corporativos, gráficos financieros en pantallas, contratos ejecutivos y bolsas de valores',
      mandatoryKeywords: ['finance', 'business', 'investment', 'money', 'corporate'],
      forbiddenDiscordantConcepts: [
        'carrot', 'vegetable', 'farming', 'tractor', 'toys', 'cartoon', 'baby', 'cooking recipe', 'kitchen'
      ],
      topicSummary: 'Video centrado en finanzas, crecimiento económico, inversiones y negocios.'
    };
  }

  // Energy / High Voltage
  if (/energ[ií]a|electricidad|voltaje|alta tensi[oó]n|subestaci[oó]n|torres?\s*el[eé]ctricas?|solar|e[oó]lica/i.test(text)) {
    return {
      coreTopic: 'Energía y Redes de Alta Tensión',
      visualDomain: 'Torres de transmisión eléctrica, arcos de chispas, subestaciones, turbinas eólicas y centrales de energía al atardecer',
      mandatoryKeywords: ['energy', 'electricity', 'power grid', 'transmission', 'electric'],
      forbiddenDiscordantConcepts: ['carrot', 'vegetables', 'cooking', 'toys', 'fashion'],
      topicSummary: 'Video centrado en infraestructura energética, electricidad y redes de distribución.'
    };
  }

  // Mindset / Fitness / Sports
  if (/entrenar|m[uú]sculo|gimnasio|fitness|deporte|salud|ejercicio|carrera|atleta|motivaci[oó]n/i.test(text)) {
    return {
      coreTopic: 'Salud, Deporte y Alto Rendimiento',
      visualDomain: 'Atletas entrenando en el gimnasio, sudor, pesas, pistas de atletismo, alimentación deportiva y determinación',
      mandatoryKeywords: ['fitness', 'workout', 'training', 'athlete', 'sports'],
      forbiddenDiscordantConcepts: ['computer server', 'cyber matrix', 'chips hardware', 'office suits'],
      topicSummary: 'Video enfocado en entrenamiento deportivo, disciplina y superación física.'
    };
  }

  // Default Cinematic Domain
  return {
    coreTopic: 'Narrativa Cinematográfica y Audiovisual',
    visualDomain: 'Composición dramática, iluminación con claroscuro, texturas urbanas o naturales y tomas cinemáticas de alta gama',
    mandatoryKeywords: ['cinematic', 'dramatic', 'atmospheric', 'modern'],
    forbiddenDiscordantConcepts: ['ugly stock', 'amateur footage', 'distorted cartoon'],
    topicSummary: 'Video audiovisual con estética cinematográfica cuidada.'
  };
}

/**
 * Real-time In-Search Inspector: Evaluates if a stock resource or batch matches the Global Video Topic
 * and flags discordant items (such as carrots/vegetables in an AI video).
 */
export function assessStockItemTopicDiscordance(item, globalVideoTopic, scene = null) {
  if (!globalVideoTopic) return { isDiscordant: false, reason: null, score: 7.0 };

  const forbidden = globalVideoTopic.forbiddenDiscordantConcepts || [];
  const mandatory = globalVideoTopic.mandatoryKeywords || [];

  const textToScan = `${item.title || ''} ${item.tags || ''} ${item.searchQuery || ''} ${item.provider || ''} ${item.downloadUrl || ''}`.toLowerCase();
  const sceneContext = `${scene?.title || ''} ${scene?.visualAnchor || ''} ${(scene?.searchKeywords || []).join(' ')} ${scene?.visualDescription || ''}`.toLowerCase();

  // 1. Strict forbidden match (The "Carrot Detector") - only for concepts truly foreign to the scene
  for (const f of forbidden) {
    if (f && f.length >= 3 && !sceneContext.includes(f)) {
      const regex = new RegExp(`\\b${f}\\b`, 'i');
      if (regex.test(textToScan) || textToScan.includes(f)) {
        return {
          isDiscordant: true,
          reason: `Elemento ajeno detectado ("${f}") incompatible con el Tema Principal ("${globalVideoTopic.coreTopic}")`,
          score: 1.0,
          matchedTerm: f
        };
      }
    }
  }

  // 2. Check positive alignment with mandatory keywords
  let positiveMatches = 0;
  for (const m of mandatory) {
    if (m && textToScan.includes(m.toLowerCase())) {
      positiveMatches++;
    }
  }

  return {
    isDiscordant: false,
    reason: null,
    score: 5.0 + (positiveMatches * 1.5),
    positiveMatches
  };
}

/**
 * Cerebro de Editor Audiovisual:
 * Formula entre 2 y 3 búsquedas precisas, naturales y cinematográficas en inglés
 * basadas en la Toma Sugerida del director, las etiquetas/pastillas del explorador de B-Roll,
 * y el contexto concreto de la escena (Cero rigidez abstracta).
 */
export async function generateSceneSearchStrategiesWithAI({
  scene,
  globalVideoTopic = null,
  previousQueries = [],
  aiConfig = null,
  signal = null
}) {
  const configToUse = aiConfig || getSavedAiConfig();

  // Extract rich concept tags and pills directly matching the B-Roll Explorer modal
  const pills = extractSceneConceptPills(scene);
  const pillLabels = pills.map(p => p.label).filter(Boolean);

  const topicContext = globalVideoTopic ? `
TEMA DEL VIDEO: "${globalVideoTopic.coreTopic}" (Tono: ${globalVideoTopic.visualDomain || 'Profesional y cinematográfico'})
` : '';

  const systemPrompt = `Eres un Director de Fotografía y Montajista Audiovisual de Élite (Cerebro de Editor).
Tu objetivo es formular EXACTAMENTE entre 2 y 3 búsquedas precisas, naturales y cinematográficas en INGLÉS para bancos de stock (Pexels, Pixabay), tal como un editor humano las escribiría en el explorador de stock.
${topicContext}
CÓMO PIENSA EL CEREBRO DE UN EDITOR (CERO RIGIDEZ ABSTRACTA):
1. LA TOMA SUGERIDA ES LA PRIORIDAD #1:
   - Si la toma sugerida pide un plano u objeto concreto (ej: "Plano cenital de un mapa antiguo del mundo sobre mesa de madera", "Rascacielos con lluvia al atardecer", "Manos firmando contrato"), formula una búsqueda directa y concreta para ese plano en inglés (ej: "ancient world map table vintage", "rainy skyscrapers sunset", "hands signing contract desk").
   - NUNCA reemplaces un objeto tangible o acción física de la escena por conceptos genéricos o abstractos.
2. SUJETO, ENTORNO O LOCALIZACIÓN TANGIBLE:
   - Si la escena menciona una ciudad, lugar o sujeto específico (ej: Ámsterdam, oficina moderna, puerto marítimo, laboratorio), formula una búsqueda para capturar ese lugar o atmósfera (ej: "amsterdam canal historic aerial", "busy modern office", "cargo ships port").
3. ACCIÓN NARRATIVA / METÁFORA VISUAL:
   - Una búsqueda complementaria que capture la acción o emoción de la frase (ej: "global logistics shipping routes", "financial growth screen", "people walking modern city").
4. REGLAS DE ORO DE BÚSQUEDA:
   - Consultas de 2 a 4 palabras clave en INGLÉS altamente visuales.
   - Términos naturales que existan con abundancia en Pexels (ej: "vintage map desk", "amsterdam street tram").
   - CERO clichés corporativos vacíos ("business team happy", "success", "generic").
   - Evita repetir búsquedas recientes: [${previousQueries.slice(-10).join(', ')}].

Responde ÚNICAMENTE en JSON con esta estructura exacta:
{
  "editorPlan": "Explicación breve de 1 frase del enfoque cinematográfico para esta escena",
  "queries": [
    { "focus": "Toma sugerida directa", "query": "palabras clave en inglés", "intent": "qué busca este plano" },
    { "focus": "Entorno o localización", "query": "palabras clave en inglés", "intent": "qué busca este plano" },
    { "focus": "Acción o concepto narrativo", "query": "palabras clave en inglés", "intent": "qué busca este plano" }
  ]
}`;

  const pillsHint = pillLabels.length > 0 ? `Conceptos y Etiquetas del explorador: [${pillLabels.join(', ')}]` : '';
  const keywordsHint = Array.isArray(scene.searchKeywords) && scene.searchKeywords.length > 0
    ? `Términos sugeridos: [${scene.searchKeywords.join(', ')}]`
    : '';

  const userPrompt = `ESCENA #${scene.sceneNumber || 1}: "${scene.title}"
FRASE EXACTA DEL GUION: "${scene.scriptText || scene.visualDescription || scene.title}"
TOMA SUGERIDA DEL DIRECTOR: "${scene.visualDescription || scene.visualAnchor || scene.title}"
ANCLA VISUAL: "${scene.visualAnchor || scene.title}"
TIPO VISUAL: ${scene.visualType === 'image' ? 'Fotografía conceptual' : 'Video B-Roll cinematográfico'}
${pillsHint}
${keywordsHint}

Aplica el Cerebro de Editor: formula entre 2 y 3 búsquedas precisas en inglés priorizando la toma sugerida y el contexto tangible de la escena.`;

  try {
    const response = await sendAiChatCompletion({
      systemPrompt,
      userPrompt,
      config: configToUse,
      jsonMode: true,
      signal,
      timeoutMs: 25000
    });

    const parsed = parseAiJsonResponse(response.content);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      const cleanQueries = parsed.queries
        .map(q => typeof q === 'string' ? q : q.query)
        .filter(q => Boolean(q && typeof q === 'string' && q.trim().length > 2))
        .map(q => q.trim().replace(/["']/g, ''));

      if (cleanQueries.length > 0) {
        return {
          concept: parsed.editorPlan || scene.visualAnchor || scene.title,
          queries: cleanQueries.slice(0, 3)
        };
      }
    }
  } catch (err) {
    if (signal && signal.aborted) throw err;
    console.warn('[VisualCurator] Fallo al generar consultas con IA, usando generador analítico del explorador:', err.message);
  }

  // Resilient fallback query generator if AI is offline
  return fallbackQueryGenerator(scene, globalVideoTopic);
}

/**
 * Re-analyzes the full script sentence when initial searches yielded poor results
 * to discover alternative, non-obvious visual keywords within the global video topic.
 */
export async function refineSearchQueriesFromFullSentence({
  scene,
  globalVideoTopic = null,
  failedQueries = [],
  aiConfig = null,
  signal = null
}) {
  const configToUse = aiConfig || getSavedAiConfig();

  const topicContext = globalVideoTopic ? `TEMA PRINCIPAL DEL VIDEO: "${globalVideoTopic.coreTopic}". Todas las consultas deben encajar en este universo visual.` : '';

  const systemPrompt = `Eres un Curador Visual y Editor de Montaje de Cine.
Las búsquedas anteriores (${failedQueries.join(', ')}) arrojaron resultados mediocres, no relacionados o clichés de stock para una escena de video.
${topicContext}
Vuelve a analizar la FRASE COMPLETA del guion y extrae un ángulo temático radicalmente diferente, poético, metafórico o de entorno físico para buscar en bancos de stock en INGLÉS manteniendo estricta coherencia con el tema del video.

Responde ÚNICAMENTE en JSON con esta estructura:
{
  "refinementRationale": "Por qué el enfoque anterior falló y qué nuevo ángulo exploramos",
  "queries": [
    "consulta 1 en inglés (2 a 4 palabras)",
    "consulta 2 en inglés (2 a 4 palabras)"
  ]
}`;

  const userPrompt = `Escena #${scene.sceneNumber || 1}: "${scene.title}"
Frase completa del Guion: "${scene.scriptText || scene.visualDescription || scene.title}"
Consultas que fallaron: ${failedQueries.join(' | ')}
Tipo: ${scene.visualType === 'image' ? 'Fotografía' : 'Video B-Roll'}

Genera 2 consultas refinadas en inglés afines a "${globalVideoTopic?.coreTopic || 'el tema'}".`;

  try {
    const response = await sendAiChatCompletion({
      systemPrompt,
      userPrompt,
      config: configToUse,
      jsonMode: true,
      signal,
      timeoutMs: 25000
    });

    const parsed = parseAiJsonResponse(response.content);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      const clean = parsed.queries
        .filter(q => typeof q === 'string' && q.trim().length > 2)
        .map(q => q.trim().replace(/["']/g, ''));
      if (clean.length > 0) return clean.slice(0, 2);
    }
  } catch (err) {
    if (signal && signal.aborted) throw err;
    console.warn('[VisualCurator] Fallo al refinar con IA:', err.message);
  }

  const topicKeyword = globalVideoTopic?.mandatoryKeywords?.[0] || 'cinematic';
  return [`${topicKeyword} ${scene.title || 'abstract'} visual`, `dramatic ${scene.visualType || 'broll'} scene`];
}

export async function preFilterAndRankCandidatesWithAI({
  scene,
  globalVideoTopic = null,
  candidatePool,
  searchQueries = [],
  aiConfig = null,
  targetCount = 20,
  signal = null
}) {
  if (!candidatePool || candidatePool.length <= targetCount) {
    const cleanPool = candidatePool || [];
    return {
      selectedCandidates: cleanPool,
      qualityPassed: cleanPool.length >= 4,
      assessment: `Colección completa de ${cleanPool.length} candidatos lista para evaluación profunda.`
    };
  }

  const configToUse = aiConfig || getSavedAiConfig();

  // Create a lightweight summary of candidates for the LLM, flagging any discordant items
  const candidateSummaries = candidatePool.slice(0, 80).map((c, index) => {
    const discordance = assessStockItemTopicDiscordance(c, globalVideoTopic, scene);
    return {
      id: c.id,
      index: index + 1,
      title: c.title,
      type: c.type,
      provider: c.provider,
      duration: c.duration,
      searchAngle: c.searchQuery || '',
      discordanceWarning: discordance.isDiscordant ? `⚠️ DISCORDANCIA TEMA: ${discordance.reason}` : null
    };
  });

  const topicContext = globalVideoTopic ? `
FILTRO SUPREMO DE COHERENCIA CON EL TEMA ("${globalVideoTopic.coreTopic}"):
El video trata sobre "${globalVideoTopic.coreTopic}". Universo visual: "${globalVideoTopic.visualDomain}".
Cualquier candidato que muestre elementos ajenos, ridículos o discordantes (ej. zanahorias, vegetales, granjas o cocina en un video de tecnología/IA) DEBE ser descartado inmediatamente.
` : '';

  const systemPrompt = `Eres un Curador de Cine y Supervisor de Edición B-Roll con estándares de calidad intransigentes (Vara Alta).
Se han realizado ${searchQueries.length} búsquedas temáticas y se ha recolectado una piscina masiva de ${candidateSummaries.length} recursos multimedia candidatos para una escena.
Tu tarea es examinar los recursos y seleccionar los MEJORES ${targetCount} CANDIDATOS (colección curada) que tengan la mayor pertinencia con la frase del guion, el ancla visual y la mayor calidad cinematográfica.
${topicContext}
CRITERIOS DE SELECCIÓN ESTRICTOS:
1. CONCORDANCIA CON EL TEMA PRINCIPAL: Prioriza recursos que pertenezcan legítimamente al universo de "${globalVideoTopic?.coreTopic || 'el video'}". Descarta tajantemente elementos fuera de contexto.
2. ANCLA VISUAL PRIORITARIA: Elige recursos que muestren o sugieran directamente el ancla visual requerida (no conceptos abstractos o vacíos).
3. VARIEDAD TEMÁTICA: Distribuye la selección entre los diferentes ángulos de búsqueda formulados.
4. FILTRO ANTI-CLICHÉ: Descarta títulos genéricos o que suenen a stock barato.
5. CALIDAD DEL CONJUNTO: Evalúa si los resultados son genuinamente aprovechables o si la búsqueda fue deficiente.

Estructura JSON de respuesta obligatoria:
{
  "qualityPassed": true, // false si casi todos los recursos son deficientes o disonantes
  "selectedIndices": [1, 3, 5, 8, ...], // Hasta ${targetCount} índices de los mejores candidatos
  "assessment": "Breve explicación de la selección y variedad elegida",
  "refinedSearchNeeded": false
}`;

  const userPrompt = `TEMA PRINCIPAL DEL VIDEO: "${globalVideoTopic?.coreTopic || 'General'}"
Escena #${scene.sceneNumber}: "${scene.title}"
Frase del Guion: "${scene.scriptText || scene.visualDescription}"
Ancla Visual: "${scene.visualAnchor || scene.title}"
Consultas usadas: ${searchQueries.join(' | ')}

Candidatos disponibles (${candidateSummaries.length}):
${JSON.stringify(candidateSummaries, null, 2)}

Selecciona los mejores ${targetCount} candidatos afines a "${globalVideoTopic?.coreTopic || 'el video'}" para la colección de evaluación profunda con Ojo Crítico.`;

  try {
    const response = await sendAiChatCompletion({
      systemPrompt,
      userPrompt,
      config: configToUse,
      jsonMode: true,
      signal,
      timeoutMs: 30000
    });

    const parsed = parseAiJsonResponse(response.content);
    if (parsed && Array.isArray(parsed.selectedIndices) && parsed.selectedIndices.length > 0) {
      const selected = parsed.selectedIndices
        .map(idx => candidatePool[idx - 1])
        .filter(c => {
          if (!c) return false;
          // Filter out explicitly discordant items even if LLM accidentally picked them
          const disc = assessStockItemTopicDiscordance(c, globalVideoTopic, scene);
          return !disc.isDiscordant;
        });

      if (selected.length >= 4) {
        return {
          selectedCandidates: selected.slice(0, targetCount),
          qualityPassed: parsed.qualityPassed !== false,
          assessment: parsed.assessment || `Seleccionados ${selected.length} candidatos para la colección con IA.`
        };
      }
    }
  } catch (err) {
    if (signal && signal.aborted) throw err;
    console.warn('[VisualCurator] Fallo en pre-filtrado con IA, usando selección por diversidad y filtro de discordancia:', err.message);
  }

  // Fallback: pick diverse candidates across searches up to targetCount, filtering discordance
  const cleanCandidates = candidatePool.filter(c => !assessStockItemTopicDiscordance(c, globalVideoTopic, scene).isDiscordant);
  const poolToUse = cleanCandidates.length >= 4 ? cleanCandidates : candidatePool;

  const diverse = [];
  const seenTitles = new Set();
  for (const c of poolToUse) {
    const key = (c.title || '').toLowerCase().slice(0, 25);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      diverse.push(c);
      if (diverse.length >= targetCount) break;
    }
  }

  return {
    selectedCandidates: diverse.length >= 4 ? diverse : poolToUse.slice(0, targetCount),
    qualityPassed: true,
    assessment: `Selección filtrada de ${diverse.length} candidatos concordantes con "${globalVideoTopic?.coreTopic || 'el video'}".`
  };
}

/**
 * Runs the Visual Curator Agent to evaluate a set of candidate media items for a scene (up to 20 candidates).
 * Implements the Thinking System (evaluating candidate by candidate) and high editorial bar (saying NO).
 *
 * @param {object} params
 * @param {object} params.scene Scene object from storyboard
 * @param {Array<object>} params.candidates List of candidate media items (up to 20 candidates)
 * @param {object} [params.aiConfig] Optional AI config
 * @param {number} [params.minAcceptableScore=7.5] Minimum score required to accept a winner
 * @param {AbortSignal} [params.signal] Abort signal
 * @returns {Promise<{ winner: object, alternatives: Array<object>, critique: object, collageDataUrl: string, allRejected: boolean }>}
 */
export async function evaluateSceneCandidatesWithVisionAI({
  scene,
  globalVideoTopic = null,
  candidates,
  aiConfig = null,
  minAcceptableScore = 7.5,
  signal = null
}) {
  if (!candidates || candidates.length === 0) {
    throw new Error('No hay candidatos para evaluar en esta escena.');
  }

  // If only 1 candidate, evaluate it directly against the bar
  if (candidates.length === 1) {
    const single = candidates[0];
    const discordance = assessStockItemTopicDiscordance(single, globalVideoTopic, scene);
    const score = discordance.isDiscordant ? 1.0 : 8.0;
    const isAccepted = score >= minAcceptableScore;
    return {
      winner: isAccepted ? single : null,
      alternatives: [],
      allRejected: !isAccepted,
      rejectionReason: !isAccepted ? (discordance.reason || 'Recurso único no supera la vara de calidad.') : null,
      suggestedRescueAngle: `${scene.visualAnchor || scene.title} ${globalVideoTopic?.mandatoryKeywords?.[0] || 'cinematic'}`,
      critique: {
        winnerIndex: 1,
        winnerReason: isAccepted ? 'Único candidato disponible y validado con el tema.' : discordance.reason,
        winnerScore: score,
        rankedCandidates: [{ candidateIndex: 1, score, verdict: isAccepted ? 'ACEPTABLE' : 'RECHAZADO' }],
        candidateReviews: [{ candidateIndex: 1, score, verdict: isAccepted ? 'ACEPTABLE' : 'RECHAZADO', critique: isAccepted ? 'Aprobado' : discordance.reason }]
      },
      collageDataUrl: single.thumbnail || single.previewUrl || ''
    };
  }

  // 1. Build composite labeled visual collage with up to 20 candidates (grid)
  const candidateSlice = candidates.slice(0, 20);
  let collageResult = null;
  try {
    collageResult = await buildVisualCandidateCollage({
      scene,
      candidates: candidateSlice
    });
  } catch (err) {
    console.warn('[VisualCurator] Error generando collage visual, procediendo con reserva:', err.message);
  }

  if (!collageResult || !collageResult.candidateMap || collageResult.candidateMap.length === 0) {
    const topItem = candidateSlice[0];
    return {
      winner: topItem,
      alternatives: candidateSlice.slice(1, 4),
      allRejected: false,
      rejectionReason: null,
      critique: {
        winnerIndex: 1,
        winnerReason: 'Seleccionado por análisis analítico de reserva.',
        winnerScore: 8.0,
        candidateReviews: [{ candidateIndex: 1, score: 8.0, verdict: 'ACEPTABLE', critique: 'Aprobado como reserva' }]
      },
      collageDataUrl: topItem.thumbnail || topItem.previewUrl || ''
    };
  }

  const { collageDataUrl, base64Jpeg, candidateMap } = collageResult;
  const configToUse = aiConfig || getSavedAiConfig();

  const topicDirective = globalVideoTopic ? `
COHERENCIA TEMÁTICA SUPREMA ("${globalVideoTopic.coreTopic}"):
Todo el video trata sobre "${globalVideoTopic.coreTopic}".
Universo visual permitido: "${globalVideoTopic.visualDomain}".
En tu análisis Thinking uno por uno:
Si algún candidato muestra un objeto, acción o escenario ajeno o ridículo frente al tema (ejemplo: una zanahoria, hortalizas, una cocina o animales de granja en un video de IA/tecnología), califícalo con veredicto "RECHAZADO", puntaje <= 2.0 y razón: "Rechazado por discordancia temática total con el tema del video ('${globalVideoTopic.coreTopic}')".
` : '';

  // 2. Prepare Vision Multimodal Prompt with Fast Thinking & Concise Output
  const systemPrompt = `Eres el Agente Director de Fotografía y Curador Visual Editorial de Montaje Cinematográfico de Élite.
Tu trabajo es observar con ojo crítico implacable el MOSAICO VISUAL adjunto con la colección de ${candidateMap.length} candidatos numerados ([CANDIDATO 1] a [CANDIDATO ${candidateMap.length}]).
${topicDirective}
SISTEMA THINKING (EVALUACIÓN Y CRITERIO DE VARA ALTA):
1. CALIFICACIÓN ÁGIL CANDIDATO POR CANDIDATO:
   - Evalúa cada candidato visualmente frente al ancla y la cinematografía.
   - En "candidateScores", registra cada candidato con su número ("index"), veredicto ("EXCELENTE" | "ACEPTABLE" | "RECHAZADO") y nota ("score" del 1.0 al 10.0).
2. CRITERIO DE VARA ALTA (SABER DECIR NO):
   - Si NINGÚN candidato alcanza la vara mínima de ${minAcceptableScore}/10 o si todos son deficientes/discordantes, marca "allRejected": true, explica qué faltó en "rejectionReason" y sugiere un ángulo en "suggestedRescueAngle".
3. CONCORDANCIA NARRATIVA Y ANCLA VISUAL:
   - El ganador debe mostrar directamente el ancla visual y encajar en el universo del tema.
4. FILTRO ANTI-STOCK CLICHÉ:
   - Descarta modelos mirando a la cámara o poses artificiales.

FORMATO JSON ULTRA-CONCISO (MÁXIMA VELOCIDAD, SIN ENSAYOS):
Responde ÚNICAMENTE con esta estructura JSON:
{
  "allRejected": false, // true SOLO si ninguno alcanza ${minAcceptableScore}/10
  "rejectionReason": null, // Solo si allRejected es true
  "suggestedRescueAngle": null, // Consulta alternativa si allRejected es true
  "candidateScores": [
    { "index": 1, "score": 4.5, "verdict": "RECHAZADO" },
    { "index": 2, "score": 9.2, "verdict": "EXCELENTE" }
  ],
  "winnerIndex": 2, // Número del 1 al ${candidateMap.length}
  "winnerScore": 9.2,
  "winnerReason": "Explicación de 1 sola frase (máximo 18 palabras) de por qué gana.",
  "alternatives": [
    { "candidateIndex": 5, "note": "Alternativa viable (máx 8 palabras)" }
  ]
}`;

  const anchorText = scene.visualAnchor ? `Ancla Visual Requerida: "${scene.visualAnchor}"` : '';
  const userPrompt = `TEMA PRINCIPAL DEL VIDEO: "${globalVideoTopic?.coreTopic || 'General'}"
Escena #${scene.sceneNumber || 1}: "${scene.title}"
Frase del Guion: "${scene.scriptText || scene.visualDescription || ''}"
${anchorText}
Toma Conceptual Deseada: "${scene.visualDescription || ''}"
Tipo Visual: ${scene.visualType === 'image' ? 'Imagen Conceptual' : 'Video B-Roll'}

Aplica el Sistema Thinking inspeccionando minuciosamente cada uno de los ${candidateMap.length} candidatos visuales contra la vara alta de calidad (${minAcceptableScore}/10) y la coherencia absoluta con "${globalVideoTopic?.coreTopic || 'el video'}".`;

  try {
    const aiResponse = await sendAiChatCompletion({
      systemPrompt,
      userPrompt,
      config: configToUse,
      jsonMode: true,
      signal,
      timeoutMs: 70000,
      images: [base64Jpeg]
    });

    const parsed = parseAiJsonResponse(aiResponse.content);

    if (parsed) {
      const isAllRejected = Boolean(parsed.allRejected) || (parsed.winnerScore && Number(parsed.winnerScore) < minAcceptableScore);

      const rawScores = Array.isArray(parsed.candidateScores) ? parsed.candidateScores : (Array.isArray(parsed.candidateReviews) ? parsed.candidateReviews : []);
      const normalizedReviews = rawScores.map(r => {
        const candidateIndex = Number(r.candidateIndex ?? r.index ?? 1);
        const score = Number(r.score || 0);
        const verdict = r.verdict || (score >= minAcceptableScore ? 'ACEPTABLE' : 'RECHAZADO');
        return {
          candidateIndex,
          score,
          verdict,
          critique: r.critique || `${verdict} (${score}/10)`
        };
      });

      if (isAllRejected) {
        return {
          winner: null,
          alternatives: [],
          allRejected: true,
          rejectionReason: parsed.rejectionReason || 'Ningún candidato alcanzó la vara mínima de calidad y pertinencia temática (7.5/10).',
          suggestedRescueAngle: parsed.suggestedRescueAngle || null,
          critique: {
            critiqueSummary: parsed.critiqueSummary,
            candidateReviews: normalizedReviews,
            winnerScore: parsed.winnerScore || 5.0,
            modelUsed: aiResponse.model
          },
          collageDataUrl
        };
      }

      if (parsed.winnerIndex) {
        const winnerItem = candidateMap.find(c => c.candidateIndex === Number(parsed.winnerIndex)) || candidateMap[0];

        // Extract alternatives (up to 3)
        const altIndices = Array.isArray(parsed.alternatives)
          ? parsed.alternatives.map(a => Number(a.candidateIndex))
          : normalizedReviews.filter(r => Number(r.candidateIndex) !== Number(parsed.winnerIndex) && (r.score || 0) >= 6.5).slice(0, 3).map(r => Number(r.candidateIndex));

        const validAlternatives = altIndices
          .map(idx => {
            const found = candidateMap.find(c => c.candidateIndex === idx);
            if (!found || found.candidateIndex === winnerItem.candidateIndex) return null;
            const altNote = parsed.alternatives?.find(a => Number(a.candidateIndex) === idx)?.note ||
                            normalizedReviews.find(r => Number(r.candidateIndex) === idx)?.critique ||
                            'Opción secundaria evaluada por la IA';
            return {
              ...found.mediaItem,
              candidateIndex: found.candidateIndex,
              alternativeReason: altNote
            };
          })
          .filter(Boolean);

        return {
          winner: winnerItem.mediaItem,
          alternatives: validAlternatives.slice(0, 3),
          allRejected: false,
          critique: {
            winnerIndex: parsed.winnerIndex,
            winnerScore: parsed.winnerScore || 9.0,
            winnerReason: parsed.winnerReason || 'Seleccionado por óptima concordancia visual con el ancla y superación de la vara alta.',
            critiqueSummary: parsed.critiqueSummary,
            candidateReviews: normalizedReviews,
            modelUsed: aiResponse.model
          },
          collageDataUrl
        };
      }
    }
  } catch (visionErr) {
    if (signal && signal.aborted) throw visionErr;
    console.warn('[VisualCurator] Fallback a análisis heurístico visual con Vara Alta:', visionErr.message);
  }

  // 3. Graceful Editorial Heuristic Fallback with High Bar & Global Video Topic
  return runHeuristicVisualEvaluation({ scene, globalVideoTopic, candidateMap, collageDataUrl, minAcceptableScore });
}

/**
 * Intelligent Heuristic Visual Ranker with Thinking, Global Video Topic & High Bar ("Vara Alta")
 * Scores candidates one by one, penalizing discordance (e.g. carrots in AI videos).
 */
function runHeuristicVisualEvaluation({
  scene,
  globalVideoTopic = null,
  candidateMap,
  collageDataUrl,
  minAcceptableScore = 7.5
}) {
  const scriptKeywords = (scene.scriptText || scene.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const promptKeywords = (scene.visualDescription || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const candidateReviews = [];

  const scoredCandidates = candidateMap.map(c => {
    let score = 5.0; // Base score
    const text = `${c.title} ${c.mediaItem.title || ''}`.toLowerCase();
    const deductions = [];
    const bonuses = [];

    // 0. Strict Global Video Topic Discordance Check (Carrot detector)
    const discordance = assessStockItemTopicDiscordance(c.mediaItem, globalVideoTopic, scene);
    if (discordance.isDiscordant) {
      score -= 6.5;
      deductions.push(discordance.reason);
    } else if (discordance.positiveMatches > 0) {
      score += 1.6;
      bonuses.push(`Concordancia con tema: "${globalVideoTopic?.coreTopic || 'el video'}"`);
    }

    // Prefer video if scene is video
    if (scene.visualType === 'video' && c.type === 'video') {
      score += 1.8;
      bonuses.push('Formato video MP4 coincidente');
    }

    // Anchor & stock keywords relevance bonus
    let hasAnchorMatch = false;
    if (scene.visualAnchor && text.includes(scene.visualAnchor.toLowerCase())) {
      score += 2.8;
      hasAnchorMatch = true;
      bonuses.push(`Concordancia exacta con ancla "${scene.visualAnchor}"`);
    }

    if (Array.isArray(scene.searchKeywords)) {
      for (const kw of scene.searchKeywords) {
        if (text.includes(kw.toLowerCase())) {
          score += 1.6;
          bonuses.push(`Palabra clave: "${kw}"`);
          break;
        }
      }
    }

    // Keyword relevance
    for (const kw of scriptKeywords) {
      if (text.includes(kw)) score += 0.8;
    }
    for (const kw of promptKeywords) {
      if (text.includes(kw)) score += 1.2;
    }

    // Penalize generic stock cliché words
    if (/smile|smiling|happy business|handshake|thumbs up|call center/.test(text)) {
      score -= 3.2;
      deductions.push('Cliché de stock acartonado');
    }

    // Bonus for cinematic / high texture keywords
    if (/cinematic|aerial|data center|server|dramatic|macro|night|technology|slow motion/.test(text)) {
      score += 1.5;
      bonuses.push('Textura cinemática');
    }

    const finalScore = Math.min(9.8, Math.max(1.0, Number(score.toFixed(1))));
    const verdict = finalScore >= 8.5 ? 'EXCELENTE' : (finalScore >= minAcceptableScore ? 'ACEPTABLE' : 'RECHAZADO');
    const critiqueText = verdict === 'RECHAZADO'
      ? `Rechazado (${finalScore}/10): ${deductions.join(', ') || 'No contiene el ancla visual requerida ni coherencia temática'}`
      : `Aceptado (${finalScore}/10): ${bonuses.join(', ') || 'Buena correspondencia de plano'}`;

    candidateReviews.push({
      candidateIndex: c.candidateIndex,
      score: finalScore,
      verdict,
      critique: critiqueText
    });

    return {
      ...c,
      score: finalScore,
      verdict,
      critiqueText
    };
  });

  scoredCandidates.sort((a, b) => b.score - a.score);

  const bestCandidate = scoredCandidates[0];
  const allRejected = bestCandidate.score < minAcceptableScore;

  if (allRejected) {
    return {
      winner: null,
      alternatives: [],
      allRejected: true,
      rejectionReason: `Ninguno de los ${candidateMap.length} candidatos superó la vara mínima de calidad frente a "${globalVideoTopic?.coreTopic || 'el video'}" (${minAcceptableScore}/10). Mejor puntuación: ${bestCandidate.score}/10.`,
      suggestedRescueAngle: `${scene.visualAnchor ? scene.visualAnchor.toLowerCase() : 'cinematic'} ${globalVideoTopic?.mandatoryKeywords?.[0] || 'high quality'} broll`,
      critique: {
        critiqueSummary: `Rechazados todos los candidatos por vara alta (máxima nota ${bestCandidate.score}/10).`,
        candidateReviews,
        winnerScore: bestCandidate.score,
        modelUsed: 'Motor Heurístico Editorial'
      },
      collageDataUrl
    };
  }

  const winner = bestCandidate.mediaItem;
  const alternatives = scoredCandidates
    .filter(c => c.candidateIndex !== bestCandidate.candidateIndex && c.score >= 6.0)
    .slice(0, 3)
    .map(item => ({
      ...item.mediaItem,
      candidateIndex: item.candidateIndex,
      alternativeReason: item.critiqueText
    }));

  return {
    winner,
    alternatives,
    allRejected: false,
    critique: {
      winnerIndex: bestCandidate.candidateIndex,
      winnerScore: bestCandidate.score,
      winnerReason: `Seleccionado con nota ${bestCandidate.score}/10: ${bestCandidate.critiqueText}`,
      critiqueSummary: `Evaluación uno por uno de ${candidateMap.length} candidatos contra la vara alta (${minAcceptableScore}/10) y coherencia con "${globalVideoTopic?.coreTopic || 'el video'}".`,
      candidateReviews,
      rankedCandidates: scoredCandidates.map(s => ({
        candidateIndex: s.candidateIndex,
        score: s.score,
        verdict: s.critiqueText
      })),
      modelUsed: 'Motor Heurístico Editorial'
    },
    collageDataUrl
  };
}

/**
 * Fallback query generator based on scene text, visual anchors and Global Video Topic if AI connection is unavailable
 */
function fallbackQueryGenerator(scene, globalVideoTopic = null) {
  const contextKw = globalVideoTopic?.mandatoryKeywords?.[0] || '';

  // 1. Prioritize concept pills from the B-Roll Explorer modal
  const pills = extractSceneConceptPills(scene);
  if (pills && pills.length > 0) {
    const pillQueries = pills.map(p => p.searchTerm).filter(Boolean);
    if (pillQueries.length >= 2) {
      return {
        concept: scene.visualDescription || scene.visualAnchor || scene.title || 'Secuencia visual',
        queries: pillQueries.slice(0, 3)
      };
    }
  }

  // 2. If scene already has high-impact search keywords, prioritize them
  if (Array.isArray(scene.searchKeywords) && scene.searchKeywords.length > 0) {
    const enriched = scene.searchKeywords.map(kw => contextKw && !kw.toLowerCase().includes(contextKw) ? `${kw} ${contextKw}` : kw);
    return {
      concept: scene.visualAnchor || scene.title || 'Secuencia visual',
      queries: enriched.slice(0, 3)
    };
  }

  // 2. Scan with Semantic Weight Analyzer
  const fullText = `${scene.title || ''} ${scene.scriptText || ''} ${scene.visualDescription || ''}`;
  const weightAnalysis = analyzePhraseVisualWeights(fullText);

  if (weightAnalysis && weightAnalysis.searchKeywords && weightAnalysis.searchKeywords.length > 0) {
    return {
      concept: weightAnalysis.primaryAnchor || scene.title,
      queries: weightAnalysis.searchKeywords.slice(0, 4)
    };
  }

  const title = (scene.title || '').toLowerCase();
  const desc = (scene.visualDescription || '').toLowerCase();
  const script = (scene.scriptText || '').toLowerCase();

  const queries = [];
  if (/dinero|mesa|billetes|efectivo|d[oó]lar|inversi/.test(title + desc + script)) {
    queries.push('money on table cash', 'stacks of cash bills', 'counting money desk', 'business investment capital');
  } else if (/ia|inteligencia artificial|algoritmo|cómputo|modelo/.test(title + desc + script)) {
    queries.push('artificial intelligence technology', 'cyber neural network', 'data center servers glowing', 'modern digital technology');
  } else if (/servidor|data center|fibra|nube/.test(title + desc + script)) {
    queries.push('data center servers rack', 'server room blinking lights', 'cloud computing hardware', 'cyber network cable');
  } else if (/energ|electric|voltaje|alta tensión/.test(title + desc + script)) {
    queries.push('high voltage power lines', 'electric power grid transmission', 'energy power station', 'night lights electricity');
  } else {
    queries.push(
      `${scene.visualAnchor ? scene.visualAnchor.toLowerCase() : 'cinematic'} ${contextKw}`.trim(),
      `${scene.title ? scene.title.toLowerCase().slice(0, 18) : 'abstract'} ${contextKw} visual`.trim(),
      `cinematic ${contextKw || scene.visualType || 'broll'} scene`,
      `dramatic ${contextKw || 'atmospheric'} shot`
    );
  }

  return {
    concept: scene.visualAnchor || scene.title || 'Secuencia visual',
    queries: queries.slice(0, 4)
  };
}
