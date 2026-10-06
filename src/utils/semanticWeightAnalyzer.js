/**
 * Professional Video Editor Semantic Weight & Visual Anchor Engine
 * 
 * Implements editorial intuition for viral and dynamic video editing:
 * 1. Analyzes spoken words by visual/emotional weight (not just mechanical word count).
 * 2. Detects high-impact "Visual Anchors" (e.g., "dinero sobre la mesa", "servidores", "alta tensión").
 * 3. Cuts scenes on visual punches (even if 1.8s - 3.5s in viral/dynamic mode).
 * 4. Generates ultra-sharp, high-conversion stock keywords in English & Spanish.
 * 5. Provides vivid, concrete shot descriptions tailored to the focal anchor.
 */

export const VISUAL_ANCHOR_PATTERNS = [
  // --- WEALTH, MONEY & BUSINESS TRANSACTIONS (Weight 9.5 - 10.0) ---
  {
    id: 'money_on_table',
    pattern: /\b(?:dinero|plata|efectivo|billetes?|d[oó]lar(?:es)?|euros?|fajos?)\s*(?:puesto[s]?|pusi[a-z]*|colocado[s]?|sobre|encima\s*de|en)?\s*(?:la|una)?\s*mesa\b/i,
    weight: 10.0,
    category: 'wealth',
    title: 'Dinero Sobre la Mesa',
    shotPrompt: 'Plano detalle cenital en cámara lenta e iluminación lateral dramática de fajos de billetes en dólares y documentos ejecutivos sobre una mesa de madera oscura.',
    keywords: ['money on table', 'cash on table', 'stacks of cash table', 'dinero mesa', 'money desk meeting'],
    visualType: 'video'
  },
  {
    id: 'cash_bills',
    pattern: /\b(?:dinero|plata|efectivo|fajos?|billetes?|contar\s*dinero|bolsa\s*de\s*dinero|billetera\s*llena)\b/i,
    weight: 9.6,
    category: 'wealth',
    title: 'Fajos de Efectivo',
    shotPrompt: 'Plano detalle de manos enguantadas o ejecutivas manipulando y contando fajos de billetes en efectivo con iluminación cálida cinematográfica.',
    keywords: ['cash money', 'stacks of bills', 'counting money hands', 'holding cash', 'dinero efectivo'],
    visualType: 'video'
  },
  {
    id: 'investment_millions',
    pattern: /\b(?:inversi[oó]n|inversionista[s]?|capital|millones?\s*(?:de\s*d[oó]lares|de\s*euros)?|presupuesto|ganancias?|rentabilidad|fondos?\s*de\s*inversi[oó]n)\b/i,
    weight: 8.8,
    category: 'wealth',
    title: 'Inversión y Capital Millonario',
    shotPrompt: 'Plano medio de gráficos de crecimiento financiero ascendente en pantallas de alta resolución y ejecutivos analizando balances presupuestarios.',
    keywords: ['financial investment', 'business growth charts', 'corporate capital', 'inversion dinero', 'stock market profit'],
    visualType: 'video'
  },
  {
    id: 'contract_deal',
    pattern: /\b(?:contrato|firmar|acuerdo|apret[oó]n\s*de\s*manos|cerrar\s*el\s*trato|alianza|firma\s*del\s*documento)\b/i,
    weight: 9.2,
    category: 'business',
    title: 'Cierre de Trato y Contrato',
    shotPrompt: 'Plano detalle de una pluma estilográfica firmando las últimas líneas de un contrato corporativo seguido de un apretón de manos formal.',
    keywords: ['signing contract', 'business handshake deal', 'agreement signature', 'firma contrato', 'executive meeting'],
    visualType: 'video'
  },
  {
    id: 'bankruptcy_crash',
    pattern: /\b(?:bancarrota|quiebra|deuda[s]?|p[eé]rdida[s]?|n[uú]meros\s*rojos|desplome|crisis\s*financiera|arruinado)\b/i,
    weight: 9.0,
    category: 'business',
    title: 'Crisis Financiera y Quiebra',
    shotPrompt: 'Plano medio dramático con iluminación en claroscuro de un empresario abatido frente a gráficos financieros con curvas en rojo descendentes.',
    keywords: ['financial crisis collapse', 'stressed businessman debt', 'stock market crash', 'quiebra dinero', 'bankruptcy'],
    visualType: 'video'
  },

  // --- TECH, INFRASTRUCTURE & DIGITAL (Weight 9.0 - 9.8) ---
  {
    id: 'servers_datacenter',
    pattern: /\b(?:servidor(?:es)?|data\s*center|centro\s*de\s*datos|racks?|fibra\s*[oó]ptica|sala\s*de\s*servidores)\b/i,
    weight: 9.7,
    category: 'tech',
    title: 'Infraestructura de Servidores',
    shotPrompt: 'Plano travelling en steadicam por pasillos de un centro de datos masivo con racks de servidores y luces LED titilando en la penumbra.',
    keywords: ['data center servers', 'server rack blinking lights', 'cyber infrastructure', 'servidores datacenter', 'cloud computing'],
    visualType: 'video'
  },
  {
    id: 'ai_neural_net',
    pattern: /\b(?:inteligencia\s*artificial|ia\b|algoritmo[s]?|red\s*neuronal|machine\s*learning|deep\s*learning|modelo\s*de\s*lenguaje)\b/i,
    weight: 9.3,
    category: 'tech',
    title: 'Inteligencia Artificial y Cómputo',
    shotPrompt: 'Composición 3D futurista y volumétrica que representa conexiones sinápticas de una red neuronal artificial con flujos de luz y datos en movimiento.',
    keywords: ['artificial intelligence neural', 'futuristic ai network', 'cyber brain technology', 'inteligencia artificial datos', 'machine learning'],
    visualType: 'video'
  },
  {
    id: 'coding_developer',
    pattern: /\b(?:c[oó]digo|programador(?:es)?|programar|pantalla\s*(?:con)?\s*c[oó]digo|software|hacker|desarrollador|terminal)\b/i,
    weight: 8.9,
    category: 'tech',
    title: 'Desarrollo de Software y Código',
    shotPrompt: 'Plano detalle con lente macro enfocado en líneas de código desplazándose a toda velocidad por un monitor oscuro iluminando el rostro del desarrollador.',
    keywords: ['coding screen computer', 'programmer typing code', 'cyber security matrix', 'codigo programacion', 'software developer'],
    visualType: 'video'
  },
  {
    id: 'chips_hardware',
    pattern: /\b(?:chips?|microchips?|gpus?|cpus?|procesador(?:es)?|silicio|hardware|placa\s*madre)\b/i,
    weight: 9.1,
    category: 'tech',
    title: 'Arquitectura de Chips y Hardware',
    shotPrompt: 'Macro cinematográfico extremo de un microprocesador de última generación con pistas doradas y reflectantes bajo luz de estudio rasante.',
    keywords: ['microchip processor macro', 'gpu computer circuit', 'silicon wafer hardware', 'procesador microchip', 'computer board'],
    visualType: 'video'
  },
  {
    id: 'robotics_automation',
    pattern: /\b(?:robot(?:s|es)?|rob[oó]tica|humanoide|automatizaci[oó]n|brazo\s*rob[oó]tico|cibern[eé]tica)\b/i,
    weight: 9.0,
    category: 'tech',
    title: 'Robótica y Automatización',
    shotPrompt: 'Plano medio de precisión quirúrgica de brazos robóticos automatizados operando en una línea de montaje futurista de alta tecnología.',
    keywords: ['robotic arm automation', 'humanoid robot technology', 'industrial robot factory', 'robotica futuro'],
    visualType: 'video'
  },

  // --- ENERGY, POWER & ELECTRIC GRID (Weight 9.2 - 9.8) ---
  {
    id: 'high_voltage_grid',
    pattern: /\b(?:alta\s*tensi[oó]n|torres?\s*(?:el[eé]ctricas?|de\s*alta\s*tensi[oó]n)|red\s*el[eé]ctrica|subestaci[oó]n|tendido\s*el[eé]ctrico)\b/i,
    weight: 9.8,
    category: 'energy',
    title: 'Torres y Red de Alta Tensión',
    shotPrompt: 'Toma aérea cinemática con dron al atardecer sobre gigantescas torres de transmisión eléctrica de alta tensión cruzando el horizonte.',
    keywords: ['high voltage power lines', 'power grid transmission', 'electric towers sunset', 'alta tension torres', 'substation energy'],
    visualType: 'video'
  },
  {
    id: 'electric_sparks_power',
    pattern: /\b(?:electricidad|chispas?|rel[aá]mpago[s]?|rayos?|voltaje|descarga\s*el[eé]ctrica|potencia\s*el[eé]ctrica|cortocircuito)\b/i,
    weight: 9.4,
    category: 'energy',
    title: 'Energía y Descarga Eléctrica',
    shotPrompt: 'Cámara lenta a 240fps capturando arcos de electricidad y chispas azules brillantes iluminando la oscuridad con tremenda fuerza.',
    keywords: ['electric spark energy', 'lightning electricity slow motion', 'power electric surge', 'chispa electrica rayo', 'energy burst'],
    visualType: 'video'
  },
  {
    id: 'renewable_energy',
    pattern: /\b(?:energ[ií]a\s*solar|paneles?\s*solares?|e[oó]lica|turbinas?|energ[ií]a\s*limpia|renovable)\b/i,
    weight: 8.7,
    category: 'energy',
    title: 'Energía Renovable y Sostenible',
    shotPrompt: 'Toma aérea en perspectiva amplia de un parque eólico con turbinas girando suavemente bajo una puesta de sol dorada.',
    keywords: ['solar panels field aerial', 'wind turbines sunset', 'renewable green energy', 'paneles solares eolica'],
    visualType: 'video'
  },

  // --- DYNAMIC ACTION, MOTION & DRAMA (Weight 9.0 - 9.6) ---
  {
    id: 'running_escape',
    pattern: /\b(?:correr|corriendo|escapar|huida|persecuci[oó]n|a\s*toda\s*velocidad|salir\s*corriendo|salieron\s*corriendo)\b/i,
    weight: 9.4,
    category: 'action',
    title: 'Huida y Carrera a Toda Velocidad',
    shotPrompt: 'Plano dinámico en seguimiento a ras de suelo de pies corriendo velozmente por el asfalto nocturno con reflejos de lluvia y luces urbanas.',
    keywords: ['running fast escape', 'running city street hurry', 'chase sprint action', 'persona corriendo huida', 'fast running feet'],
    visualType: 'video'
  },
  {
    id: 'fire_explosion',
    pattern: /\b(?:fuego|llamas?|ardiendo|incendio|explosi[oó]n|estallar|humo\s*denso|ardieron)\b/i,
    weight: 9.6,
    category: 'action',
    title: 'Fuego y Llamas en Cámara Lenta',
    shotPrompt: 'Plano detalle a 120fps de lenguas de fuego vivas y partículas de ceniza ardiendo flotando en un entorno dramático y oscuro.',
    keywords: ['fire flames slow motion', 'explosion blast cinematic', 'burning fire smoke', 'fuego llamas', 'fire texture background'],
    visualType: 'video'
  },
  {
    id: 'car_highway_speed',
    pattern: /\b(?:coche|auto|carretera|autopista|conducir|volante|tr[aá]fico|acelerar)\b/i,
    weight: 8.8,
    category: 'action',
    title: 'Velocidad en Carretera',
    shotPrompt: 'Plano cinematográfico en ángulo bajo desde el lateral de un vehículo a alta velocidad con el asfalto y las líneas de la carretera borrosas.',
    keywords: ['car driving highway speed', 'night road car headlights', 'fast sports car driving', 'coche carretera velocidad'],
    visualType: 'video'
  },
  {
    id: 'airplane_flight',
    pattern: /\b(?:avi[oó]n|vuelo|volar|aeropuerto|despegue|aterrizaje|pista\s*de\s*aterrizaje)\b/i,
    weight: 8.9,
    category: 'action',
    title: 'Vuelo y Despegue de Aviación',
    shotPrompt: 'Plano abierto con teleobjetivo de un avión de pasajeros despegando suavemente hacia un cielo de nubes doradas al amanecer.',
    keywords: ['airplane taking off sunset', 'airport runway flight', 'passenger plane sky', 'avion despegue vuelo'],
    visualType: 'video'
  },
  {
    id: 'collapse_fall',
    pattern: /\b(?:colapso|ca[ií]da|derrumbe|abismo|caer|desmoronar|caerse)\b/i,
    weight: 9.1,
    category: 'action',
    title: 'Colapso y Caída Dramática',
    shotPrompt: 'Plano cinematográfico en cámara lenta de una estructura desplomándose con nubes de polvo o una figura al borde de un abismo.',
    keywords: ['falling slow motion', 'building collapse dust', 'dramatic fall drop', 'caida colapso', 'cliff edge drama'],
    visualType: 'video'
  },

  // --- HUMAN EMOTIONS, EXPRESSIONS & GESTURES (Weight 8.5 - 9.2) ---
  {
    id: 'shock_silence',
    pattern: /\b(?:quedar(?:on)?\s*en\s*silencio|silencio\s*total|asombro|estupefacto|sin\s*palabras|boquiabierto|miraron\s*con\s*asombro)\b/i,
    weight: 9.2,
    category: 'emotion',
    title: 'Impacto y Silencio Absoluto',
    shotPrompt: 'Primer plano cerrado e intenso de una mirada fija con pupilas dilatadas que transmite conmoción, asombro y silencio absoluto.',
    keywords: ['shocked face reaction', 'stunned look close up', 'silence expression', 'cara asombro impacto', 'intense gaze eyes'],
    visualType: 'video'
  },
  {
    id: 'stress_burnout',
    pattern: /\b(?:estr[eé]s|desesperaci[oó]n|manos\s*a\s*la\s*cabeza|agobio|agotamiento|no\s*pod[ií]a\s*m[aá]s|frustraci[oó]n|dolor\s*de\s*cabeza)\b/i,
    weight: 8.8,
    category: 'emotion',
    title: 'Estrés y Tensión Extrema',
    shotPrompt: 'Plano medio con iluminación en claroscuro de un profesional con las manos en la cabeza y expresión de agobio frente a pantallas con problemas.',
    keywords: ['stressed person hands on head', 'frustrated office worker', 'burnout exhaustion desk', 'persona estresada cabeza'],
    visualType: 'video'
  },
  {
    id: 'celebration_victory',
    pattern: /\b(?:celebraci[oó]n|festejo|victoria|aplausos?|ganador|éxito\s*total|gritar\s*de\s*alegr[ií]a|chocar\s*los\s*cinco)\b/i,
    weight: 9.0,
    category: 'emotion',
    title: 'Celebración y Euforia de Victoria',
    shotPrompt: 'Cámara lenta a 120fps de un equipo celebrando eufórico con aplausos, risas y abrazos espontáneos tras lograr una gran meta.',
    keywords: ['celebration cheering victory', 'applause crowd clapping', 'business team celebrating', 'celebracion festejo exito'],
    visualType: 'video'
  },
  {
    id: 'tears_sadness',
    pattern: /\b(?:l[aá]grimas?|llanto|llorar|tristeza|emoci[oó]n\s*hasta\s*las\s*l[aá]grimas|conmovedor)\b/i,
    weight: 8.9,
    category: 'emotion',
    title: 'Lágrimas y Emoción Profunda',
    shotPrompt: 'Primerísimo primer plano macro con luz suave de una lágrima rodando lentamente por la mejilla de una persona conmovida.',
    keywords: ['crying tears close up', 'emotional face sadness', 'person weeping dramatic', 'lagrimas llanto emocion'],
    visualType: 'video'
  },
  {
    id: 'boardroom_debate',
    pattern: /\b(?:junta\s*directiva|sala\s*de\s*juntas|reuni[oó]n\s*(?:urgente|ejecutiva)|mesa\s*de\s*reuniones|debate\s*intenso)\b/i,
    weight: 8.7,
    category: 'business',
    title: 'Tensión en Sala de Juntas',
    shotPrompt: 'Plano medio de una mesa de reuniones ejecutiva donde varios directivos debaten con gestos enfáticos y documentos abiertos.',
    keywords: ['boardroom meeting debate', 'executives discussing table', 'business meeting tension', 'junta directiva reunion'],
    visualType: 'video'
  },

  // --- TIME, URGENCY & NATURE (Weight 8.4 - 9.0) ---
  {
    id: 'clock_countdown',
    pattern: /\b(?:reloj|segundos?|medianoche|cuenta\s*regresiva|tiempo\s*l[ií]mite|sin\s*tiempo|tictac|el\s*tiempo\s*se\s*acaba)\b/i,
    weight: 9.1,
    category: 'time',
    title: 'Contrarreloj y Tiempo Límite',
    shotPrompt: 'Macro cinematográfico de un reloj mecánico clásico o digital con el segundero avanzando vertiginosamente mientras se agota el tiempo.',
    keywords: ['clock ticking time lapse', 'countdown timer seconds', 'stopwatch running out', 'reloj tiempo limite', 'hourglass sand'],
    visualType: 'video'
  },
  {
    id: 'city_metropolis',
    pattern: /\b(?:ciudad|rascacielos|urbe|metr[oó]polis|multitud|calles?\s*llena[s]?|avenida)\b/i,
    weight: 8.5,
    category: 'urban',
    title: 'Metrópolis y Vida Urbana',
    shotPrompt: 'Timelapse cenital cinematográfico al atardecer sobre una densa metrópolis con rascacielos iluminados y estelas de luz del tráfico.',
    keywords: ['city skyscrapers timelapse', 'urban crowd walking', 'aerial city traffic night', 'ciudad rascacielos noche'],
    visualType: 'video'
  },
  {
    id: 'secret_briefcase',
    pattern: /\b(?:malet[ií]n|caja\s*fuerte|documentos?\s*confidenciales|abrir\s*el\s*malet[ií]n|carpeta\s*secreta)\b/i,
    weight: 9.0,
    category: 'mystery',
    title: 'Maletín y Documentación Confidencial',
    shotPrompt: 'Plano detalle con iluminación dramática cenital de la apertura de un maletín ejecutivo metálico que revela documentos y llaves maestras.',
    keywords: ['open briefcase documents', 'safe deposit box vault', 'confidential folder papers', 'maletin secreto documentos'],
    visualType: 'video'
  }
];

// Common Spanish stop words and conversational filler phrases that have zero visual weight
const FILLER_PHRASES = [
  'como te venía diciendo', 'como les venía contando', 'como te decía', 'por así decirlo',
  'en realidad', 'la verdad es que', 'bueno pues', 'o sea', 'básicamente', 'digamos que',
  'a fin de cuentas', 'en este sentido', 'por otra parte', 'en primer lugar', 'por lo tanto',
  'cada vez que', 'de alguna manera', 'a lo mejor', 'sin embargo', 'no obstante'
];

const STOP_WORDS_SPANISH = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
  'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o',
  'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también',
  'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos',
  'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto',
  'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto',
  'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'sea', 'poco', 'ella',
  'estar', 'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tú', 'te', 'ti', 'tu',
  'tus', 'ellas', 'nosotras', 'vosotros', 'vosotras', 'os', 'mío', 'mía', 'míos', 'mías',
  'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos', 'suyas', 'nuestro', 'nuestra',
  'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras', 'esos', 'esas',
  'estoy', 'estás', 'está', 'estamos', 'estáis', 'están', 'esté', 'estés', 'estemos',
  'estéis', 'estén', 'estaré', 'estarás', 'estará', 'estaremos', 'estaréis', 'estarán',
  'estaría', 'estarías', 'estaríamos', 'estaríais', 'estarían', 'estaba', 'estabas',
  'estábamos', 'estabais', 'estaban', 'estuve', 'estuviste', 'estuvo', 'estuvimos',
  'estuvisteis', 'estuvieron', 'hubiera', 'hubiese', 'hubo', 'había', 'habían', 'hemos',
  'han', 'has', 'ha', 'he', 'bueno', 'así', 'bien', 'claro', 'digo', 'entonces', 'pues'
]);

/**
 * Evaluates semantic and visual weights of a spoken text snippet.
 * Identifies the focal visual anchor (e.g. "dinero sobre la mesa") and provides
 * direct, high-relevance search keywords, a concrete title, and a shot prompt.
 * 
 * @param {string} text Spoken dialogue excerpt
 * @param {number} [sceneIndex=0]
 * @returns {object} Analysis result { visualWeight, primaryAnchor, title, shotPrompt, searchKeywords, isHighImpact, category }
 */
export function analyzePhraseVisualWeights(text, sceneIndex = 0) {
  const normalized = (text || '').trim();
  const lower = normalized.toLowerCase();

  // 1. Scan against registered Visual Anchor Patterns
  const matchedAnchors = [];

  for (const patternDef of VISUAL_ANCHOR_PATTERNS) {
    const match = lower.match(patternDef.pattern);
    if (match) {
      matchedAnchors.push({
        ...patternDef,
        matchSnippet: match[0],
        matchIndex: match.index
      });
    }
  }

  // Sort matched anchors by weight (highest impact first)
  matchedAnchors.sort((a, b) => b.weight - a.weight);

  if (matchedAnchors.length > 0) {
    const winner = matchedAnchors[0];
    return {
      visualWeight: winner.weight,
      isHighImpact: winner.weight >= 8.5,
      category: winner.category,
      primaryAnchor: winner.title,
      title: winner.title,
      shotPrompt: winner.shotPrompt,
      searchKeywords: [...winner.keywords],
      recommendedVisualType: winner.visualType || 'video',
      allMatchedAnchors: matchedAnchors
    };
  }

  // 2. Dynamic Dialogue Semantic Entity & Visual Extraction for Unmatched Phrases:
  // Detects proper nouns, historical dates, domain entities, and tangible actions from the spoken text
  const dialogueCore = extractDialogueVisualCore(text, sceneIndex);

  let cleanedText = lower;
  for (const filler of FILLER_PHRASES) {
    cleanedText = cleanedText.replace(new RegExp(`\\b${filler}\\b`, 'gi'), ' ');
  }

  cleanedText = cleanedText
    .replace(/\bi\.a\b/g, 'ia')
    .replace(/\blaia\b/g, 'ia')
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, ' ');

  const words = cleanedText
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS_SPANISH.has(w));

  const uniqueWords = Array.from(new Set(words));
  const weight = Math.min(8.2, Math.max(4.5, Number((4.5 + Math.min(uniqueWords.length * 0.7, 3.5)).toFixed(1))));

  return {
    visualWeight: weight,
    isHighImpact: dialogueCore.isHighImpact,
    category: dialogueCore.category || 'general',
    primaryAnchor: dialogueCore.visualAnchor,
    title: dialogueCore.title,
    shotPrompt: dialogueCore.shotPrompt,
    searchKeywords: dialogueCore.searchKeywords.length > 0 ? dialogueCore.searchKeywords : uniqueWords.slice(0, 5),
    recommendedVisualType: dialogueCore.recommendedVisualType || 'video',
    allMatchedAnchors: []
  };
}

/**
 * Deep Dialogue-to-Visual Grounding Engine
 * Analyzes the dialogue sentence to extract proper names, dates/centuries,
 * core action verbs, and domain entities, synthesizing a vivid, tailored
 * title, visual anchor, shot prompt, and search keywords that 100% match what is being said.
 */
export function extractDialogueVisualCore(phraseText, sceneIndex = 0, visualType = 'video') {
  const rawText = (phraseText || '').trim();
  const lower = rawText.toLowerCase();

  // 1. Extract proper nouns (capitalized words that are not just the first word unless length <= 3)
  const rawWords = rawText.split(/\s+/);
  const properNouns = [];
  for (let i = 0; i < rawWords.length; i++) {
    const cleanW = rawWords[i].replace(/[^\wáéíóúÁÉÍÓÚñÑ]/g, '');
    if (cleanW.length >= 3 && /^[A-ZÁÉÍÓÚ]/.test(cleanW)) {
      if (i > 0 || rawWords.length <= 4) {
        properNouns.push(cleanW);
      }
    }
  }

  // 2. Extract historical dates, years and centuries
  const yearMatch = rawText.match(/\b(1[6789]\d\d|20[012]\d)\b/);
  const centuryMatch = rawText.match(/\bsiglo\s+([a-zivxlcdm0-9]+)\b/i);
  const timeContext = yearMatch ? yearMatch[1] : (centuryMatch ? centuryMatch[0] : null);

  // 3. Domain detection
  const isBrewingOrFood = /\b(cerveza|cervecer[ií]a|ginebra|vino|bebida|alcohol|f[aá]brica|planta|producci|levadura|l[uú]pulo|cebada|receta|ingrediente|barril|barriles|botella|botellas|fermentaci|cocina|alimento|comida)\b/i.test(lower);
  const isHistorical = /\b(antigu[ao]|hist[oó]ric|siglo|a[ñn]o\s*1\d\d\d|fund[oó]|fundaci|origen|comienzo|cre[oó]|compr[oó]|naci[oó]|imperio|rey|reina|monarqu|colonia|barco|barcos|carreta|caballo)\b/i.test(lower) || Boolean(yearMatch) || Boolean(centuryMatch);
  const isScienceOrLab = /\b(laboratorio|qu[ií]mic|m[eé]dic|ciencia|cient[ií]fic|investigaci|f[oó]rmula|descubri|microscopio|ensayo|experimento|levadura\s*a|pasteur|vacuna|medicina|bacteria|c[eé]lula)\b/i.test(lower);
  const isBusinessOrMoney = /\b(dinero|d[oó]lar|euro|fajo|inversi|capital|millon|banco|costo|presupuesto|contrato|acuerdo|compra|pago|mesa|empresa|socio|negocio|mercado)\b/i.test(lower);
  const isTechOrCyber = /\b(ia|inteligencia artificial|servidor|servidores|algoritmo|data center|computaci|chip|gpu|hardware|software|red neuronal|ciber)\b/i.test(lower);
  const isTransportOrWater = /\b(barco|barcos|buque|puerto|canal|canales|naveg|env[ií]o|transporte|mar|r[ií]o|muelle|carga|distribuci)\b/i.test(lower);
  const isConflictOrProblem = /\b(guerra|crisis|problema|prohibici|obst[aá]culo|competencia|rival|amenaza|quiebra|desaf[ií]o|dif[ií]cil|imposible|caos|destrucci)\b/i.test(lower);

  const stopWords = new Set([
    'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no',
    'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta',
    'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde',
    'enfrenta', 'hace', 'tiene', 'tienen', 'cada', 'todo', 'todos', 'esta', 'estos', 'estas', 'ser', 'son',
    'fue', 'era', 'había', 'habia', 'decidió', 'decidio', 'vio', 'iban', 'así', 'asi', 'esto', 'eso'
  ]);

  const meaningfulWords = rawWords
    .map(w => w.replace(/[^\wáéíóúÁÉÍÓÚñÑ]/g, '').trim())
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));

  // Visual Anchor: concrete entity mentioned in dialogue
  let visualAnchor = '';
  if (properNouns.length > 0 && timeContext) {
    visualAnchor = `${properNouns.slice(0, 2).join(' ')} ${timeContext}`;
  } else if (properNouns.length > 0) {
    visualAnchor = properNouns.slice(0, 3).join(' ');
  } else if (isBrewingOrFood) {
    const brewTerm = meaningfulWords.find(w => /cerveza|cervecer|ginebra|levadura|barril|fábrica|lúpulo|receta/i.test(w)) || 'Cervecería';
    visualAnchor = `${brewTerm.charAt(0).toUpperCase() + brewTerm.slice(1)} ${timeContext || ''}`.trim();
  } else {
    visualAnchor = meaningfulWords.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || `Momento ${sceneIndex + 1}`;
  }

  // Title: meaningful summary of dialogue action
  let title = '';
  if (properNouns.length > 0 && timeContext) {
    title = `${properNouns.slice(0, 2).join(' ')} (${timeContext})`;
  } else if (meaningfulWords.length >= 2) {
    title = meaningfulWords.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } else {
    title = visualAnchor || `Escena ${sceneIndex + 1}`;
  }

  // Shot Prompt: tailored directly to the spoken words
  let shotPrompt = '';
  if (isHistorical && isBrewingOrFood) {
    shotPrompt = `Plano cinematográfico de época recreando ${rawText.slice(0, 80).toLowerCase()}, ambientado en el siglo XIX con arquitectura rústica, trabajadores de cervecería, barricas de madera e iluminación cálida en claroscuro.`;
  } else if (isHistorical) {
    shotPrompt = `Plano cinematográfico de época ilustrando ${rawText.slice(0, 85).toLowerCase()}, con vestuario histórico auténtico, ambientación de época ${timeContext ? `alrededor de ${timeContext}` : ''} e iluminación natural cinematográfica.`;
  } else if (isBrewingOrFood) {
    shotPrompt = `Plano detalle en cámara lenta de ${meaningfulWords.slice(0, 3).join(' ')}, mostrando texturas artesanales, ingredientes genuinos y líquidos dorados bajo iluminación volumétrica de fábrica tradicional.`;
  } else if (isScienceOrLab) {
    shotPrompt = `Plano medio cinematográfico en un laboratorio de investigación con científicos analizando ${meaningfulWords.slice(0, 3).join(' ')}, instrumental de vidrio y muestras bajo luz focalizada.`;
  } else if (isBusinessOrMoney) {
    shotPrompt = `Plano detalle con iluminación dramática de documentos comerciales y elementos de inversión simbolizando ${rawText.slice(0, 75).toLowerCase()}, transmitiendo trascendencia corporativa.`;
  } else if (isTechOrCyber) {
    shotPrompt = `Plano cinematográfico con iluminación volumétrica de alta tecnología centrado en ${meaningfulWords.slice(0, 3).join(' ')}, luces tenues y atmósfera moderna en 4K.`;
  } else if (isTransportOrWater) {
    shotPrompt = `Toma angular abierta de ${meaningfulWords.slice(0, 3).join(' ')} en canales de agua o muelles de transporte, con movimiento fluido y luz rasante de amanecer o atardecer.`;
  } else if (isConflictOrProblem) {
    shotPrompt = `Plano dramático con sombras profundas y alto contraste expresando la tensión de ${rawText.slice(0, 80).toLowerCase()}, composición cinematográfica de incertidumbre.`;
  } else {
    shotPrompt = `Plano cinematográfico con encuadre medio y suave movimiento de cámara enfocado en ${meaningfulWords.slice(0, 3).join(' ')}, ilustrando directamente el relato: "${rawText.slice(0, 85)}" con iluminación estética cuidada.`;
  }

  // Keywords
  const keywords = [];
  if (properNouns.length > 0) keywords.push(properNouns.join(' '));
  if (timeContext) keywords.push(timeContext);
  if (isHistorical) keywords.push('vintage historic 19th century');
  if (isBrewingOrFood) keywords.push('brewery beer craft');
  if (isScienceOrLab) keywords.push('laboratory science research');
  if (isBusinessOrMoney) keywords.push('business money investment');
  meaningfulWords.slice(0, 3).forEach(w => keywords.push(w.toLowerCase()));

  const uniqueKeywords = Array.from(new Set(keywords)).slice(0, 6);

  return {
    title,
    visualAnchor,
    shotPrompt,
    searchKeywords: uniqueKeywords,
    recommendedVisualType: visualType,
    category: isHistorical ? 'history' : (isBrewingOrFood ? 'craft' : (isScienceOrLab ? 'science' : 'general')),
    isHighImpact: Boolean(properNouns.length > 0 || timeContext || isBrewingOrFood || isHistorical)
  };
}

/**
 * Splits any speech segment whose duration exceeds maxDuration into natural sub-segments.
 * Splits at internal punctuation (. , ; : ! ? — -) or word boundaries proportionally.
 * Guarantees that no individual segment sent to the beat combiner exceeds maxDuration.
 */
export function splitLongSegments(segments, maxDuration, minDuration = 3.0) {
  if (!segments || segments.length === 0) return [];
  const result = [];

  for (const seg of segments) {
    const dur = seg.end - seg.start;
    if (dur <= maxDuration) {
      result.push(seg);
      continue;
    }

    // Segment exceeds maxDuration (e.g. > 7.5s). Split into N sub-segments.
    const numParts = Math.ceil(dur / (maxDuration * 0.9));
    const targetPartDur = dur / numParts;
    const text = (seg.text || '').trim();
    const words = text.split(/\s+/).filter(Boolean);

    if (words.length <= 1) {
      for (let p = 0; p < numParts; p++) {
        const pStart = Number((seg.start + p * targetPartDur).toFixed(2));
        const pEnd = Number((p === numParts - 1 ? seg.end : seg.start + (p + 1) * targetPartDur).toFixed(2));
        result.push({
          ...seg,
          id: `${seg.id || 'seg'}_p${p + 1}`,
          start: pStart,
          end: pEnd,
          text: p === 0 ? text : `(${text})`
        });
      }
      continue;
    }

    let currentPartWords = [];
    let currentPartStart = seg.start;
    const totalChars = text.length || 1;
    let accumulatedChars = 0;

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const w = words[wIdx];
      currentPartWords.push(w);
      accumulatedChars += w.length + 1;
      const progressRatio = accumulatedChars / totalChars;
      const estimatedTime = seg.start + dur * progressRatio;
      const currentPartDuration = estimatedTime - currentPartStart;
      const isPunctuation = /[.,;:!?…—–]$/.test(w);
      const isNearTarget = currentPartDuration >= (targetPartDur * 0.85);
      const isMaxExceeded = currentPartDuration >= maxDuration;
      const isLastWord = wIdx === words.length - 1;

      if (isLastWord) {
        result.push({
          ...seg,
          id: `${seg.id || 'seg'}_p${result.length + 1}`,
          start: Number(currentPartStart.toFixed(2)),
          end: Number(seg.end.toFixed(2)),
          text: currentPartWords.join(' ')
        });
      } else if (isMaxExceeded || (isNearTarget && isPunctuation) || currentPartDuration >= maxDuration * 0.95) {
        const partEnd = Number(Math.min(seg.end, Math.max(currentPartStart + minDuration, estimatedTime)).toFixed(2));
        result.push({
          ...seg,
          id: `${seg.id || 'seg'}_p${result.length + 1}`,
          start: Number(currentPartStart.toFixed(2)),
          end: partEnd,
          text: currentPartWords.join(' ')
        });
        currentPartStart = partEnd;
        currentPartWords = [];
      }
    }
  }

  return result;
}

/**
 * Intelligent Editorial Beat Segmenter
 * Groups and partitions transcript segments into scenes using professional video editor intuition:
 * - In 'dynamic' (viral) mode: Any high-impact visual anchor triggers its own punchy scene cut (1.8s - 3.5s).
 * - In 'balanced' (standard) mode: Cuts strictly respect 4.0s - 7.5s, cutting on punctuation, clauses or anchors,
 *   never exceeding 7.5 seconds.
 * - In 'narrative' mode: Scenes group phrases around sustained atmospheric shots (8s - 15s).
 * 
 * @param {Array<{ id: string, start: number, end: number, text: string }>} rawSegments
 * @param {object} rhythm Profile { id, avgSec, minSec, maxSec }
 * @param {number} targetSec
 * @returns {Array<{ start: number, end: number, duration: number, text: string, anchorAnalysis: object, segments: Array }>}
 */
export function segmentIntoEditorialBeats(rawSegments, rhythm, targetSec) {
  if (!rawSegments || rawSegments.length === 0) return [];

  const isViralMode = rhythm?.id === 'dynamic';
  const isBalancedMode = rhythm?.id === 'balanced' || rhythm?.id === 'standard';

  const minDuration = isViralMode
    ? (rhythm?.minSec || 1.8)
    : (isBalancedMode ? Math.min(rhythm?.minSec || 3.5, 3.5) : (rhythm?.minSec || 6.5));

  // Strictly enforce maxDuration limit: balanced mode must NEVER exceed 7.5s
  const maxDuration = isViralMode
    ? (rhythm?.maxSec || 3.5)
    : (isBalancedMode ? Math.min(rhythm?.maxSec || 7.5, 7.5) : (rhythm?.maxSec || 15.0));

  const effectiveTarget = targetSec || (isViralMode ? 2.8 : (isBalancedMode ? 5.2 : rhythm?.avgSec || 11.0));

  // 1. Pre-split any individual raw segments that by themselves exceed maxDuration
  const segments = splitLongSegments(rawSegments, maxDuration, minDuration * 0.8);

  const editorialBeats = [];
  let currentGroup = [];
  let currentStart = segments[0].start;
  let currentText = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segText = (seg.text || '').trim();
    if (!segText) continue;

    const isLastSegment = i === segments.length - 1;

    // PRE-CHECK: If adding this segment would push the accumulated duration past maxDuration (7.5s in balanced mode),
    // and we already have a valid group, cut the current group BEFORE adding this segment!
    if (currentGroup.length > 0) {
      const wouldBeDuration = seg.end - currentStart;
      const currentDuration = currentGroup[currentGroup.length - 1].end - currentStart;

      if (wouldBeDuration > maxDuration && currentDuration >= minDuration * 0.85) {
        const beatEnd = currentGroup[currentGroup.length - 1].end;
        editorialBeats.push({
          id: `beat_${editorialBeats.length + 1}`,
          start: Number(currentStart.toFixed(2)),
          end: Number(beatEnd.toFixed(2)),
          duration: Number((beatEnd - currentStart).toFixed(2)),
          text: currentText.trim(),
          anchorAnalysis: analyzePhraseVisualWeights(currentText),
          segments: [...currentGroup]
        });

        currentGroup = [];
        currentText = '';
        currentStart = seg.start;
      }
    }

    if (currentGroup.length === 0) {
      currentStart = seg.start;
    }

    currentGroup.push(seg);
    currentText = currentText ? `${currentText} ${segText}` : segText;
    const currentEnd = seg.end;
    const accumulatedDuration = currentEnd - currentStart;

    // Analyze semantic weight of the accumulated text and current segment
    const segAnalysis = analyzePhraseVisualWeights(segText);
    const accumulatedAnalysis = analyzePhraseVisualWeights(currentText);

    // Lookahead at next segment to see if there is a dramatic visual shift
    const nextSeg = !isLastSegment ? segments[i + 1] : null;
    const nextAnalysis = nextSeg ? analyzePhraseVisualWeights(nextSeg.text || '') : null;
    const nextIsNewHighAnchor = nextAnalysis && nextAnalysis.isHighImpact && nextAnalysis.title !== accumulatedAnalysis.title;

    // Boundaries conditions for professional cut
    let shouldCut = false;

    if (isLastSegment) {
      shouldCut = true;
    } else if (accumulatedDuration >= maxDuration) {
      shouldCut = true;
    } else if (isViralMode) {
      // VIRAL / DYNAMIC EDITING RULES (1.8s - 3.5s):
      if (accumulatedDuration >= minDuration && accumulatedAnalysis.isHighImpact && nextIsNewHighAnchor) {
        shouldCut = true;
      } else if (accumulatedDuration >= effectiveTarget && /[.?!,;:]['"”)]?$/.test(segText)) {
        shouldCut = true;
      } else if (nextSeg && (nextSeg.start - seg.end) > 0.65 && accumulatedDuration >= minDuration) {
        shouldCut = true;
      }
    } else if (isBalancedMode) {
      // BALANCED / STANDARD RULES (4.0s - 7.5s):
      // 1. Natural sentence end punctuation (. ? ! …) once minimum duration is reached
      if (accumulatedDuration >= minDuration && /[.?!…]['"”)]?$/.test(segText)) {
        shouldCut = true;
      }
      // 2. Clause break on comma/semicolon/colon once near target duration (>= 4.2s)
      else if (accumulatedDuration >= 4.2 && /[,;:]['"”)]?$/.test(segText)) {
        shouldCut = true;
      }
      // 3. Meaningful speech pause (> 0.65s silence gap) once minimum duration is reached
      else if (nextSeg && (nextSeg.start - seg.end) > 0.65 && accumulatedDuration >= minDuration) {
        shouldCut = true;
      }
      // 4. Visual anchor transition once comfortably past target duration
      else if (accumulatedDuration >= 4.8 && nextIsNewHighAnchor) {
        shouldCut = true;
      }
      // 5. Approaching max limit (>= 6.5s)
      else if (accumulatedDuration >= 6.5) {
        shouldCut = true;
      }
    } else {
      // NARRATIVE / CINEMATIC RULES (8s - 15s):
      if (accumulatedDuration >= effectiveTarget * 0.85 && /[.?!…]['"”)]?$/.test(segText)) {
        shouldCut = true;
      } else if (nextSeg && (nextSeg.start - seg.end) > 0.9 && accumulatedDuration >= minDuration) {
        shouldCut = true;
      }
    }

    if (shouldCut && currentGroup.length > 0) {
      editorialBeats.push({
        id: `beat_${editorialBeats.length + 1}`,
        start: Number(currentStart.toFixed(2)),
        end: Number(currentEnd.toFixed(2)),
        duration: Number((currentEnd - currentStart).toFixed(2)),
        text: currentText.trim(),
        anchorAnalysis: accumulatedAnalysis,
        segments: [...currentGroup]
      });

      currentGroup = [];
      currentText = '';
    }
  }

  // Handle any leftover group
  if (currentGroup.length > 0) {
    const lastSeg = currentGroup[currentGroup.length - 1];
    const leftoverText = currentText.trim();
    editorialBeats.push({
      id: `beat_${editorialBeats.length + 1}`,
      start: Number(currentStart.toFixed(2)),
      end: Number(lastSeg.end.toFixed(2)),
      duration: Number((lastSeg.end - currentStart).toFixed(2)),
      text: leftoverText,
      anchorAnalysis: analyzePhraseVisualWeights(leftoverText),
      segments: [...currentGroup]
    });
  }

  return editorialBeats;
}
