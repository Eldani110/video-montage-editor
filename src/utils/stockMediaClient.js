/**
 * Stock Media API Client & Local Disk Downloader
 * Connects to Pexels / Pixabay APIs via local Vite server proxy,
 * downloads matching videos/images directly to the project's local disk folder,
 * and registers them as standard project resources without touching IndexedDB.
 */

const STORAGE_KEY_STOCK = 'montage_stock_config';
const API_BASE = typeof window !== 'undefined' ? '' : 'http://localhost:5173';

export const DEFAULT_STOCK_CONFIG = {
  pexelsApiKey: '',
  pixabayApiKey: '',
  preferredProvider: 'web', // Default to 'web' (Bing Images + Wikimedia Commons) - 100% Free & No API Key needed
  preferredOrientation: 'landscape', // 'landscape' | 'portrait'
  preferredMediaType: 'mixed', // 'mixed' (Combinada) | 'video' (Solo Videos) | 'image' (Solo Imágenes)
  targetTrack: 'auto', // 'auto' (Detección inteligente de pista con hueco / secuencia) | 'v1' | 'v2'
  autoMuteAudio: true
};

export function getSavedStockConfig() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_STOCK);
      if (raw) {
        const parsed = JSON.parse(raw);
        // If preferred provider has no API key set, auto-switch to 'web' (Bing + Wikimedia)
        // so user receives real matching photos and videos instead of failing searches!
        if ((!parsed.pexelsApiKey && parsed.preferredProvider === 'pexels') ||
            (!parsed.pixabayApiKey && parsed.preferredProvider === 'pixabay')) {
          parsed.preferredProvider = 'web';
        }
        return { ...DEFAULT_STOCK_CONFIG, ...parsed };
      }
    }
  } catch (err) {
    console.warn('Could not read stock config from localStorage:', err);
  }
  return { ...DEFAULT_STOCK_CONFIG };
}

export function saveStockConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(config));
  } catch (err) {
    console.warn('Could not save stock config to localStorage:', err);
  }
}

/**
 * Automatically resolves the stock search orientation ('portrait' | 'square' | 'landscape')
 * from the active project's aspect ratio or dimensions.
 */
export function resolveProjectOrientation(project, fallbackOrientation = null) {
  const aspectRatio = String(project?.settings?.aspectRatio || '').trim();
  const width = Number(project?.settings?.width) || 0;
  const height = Number(project?.settings?.height) || 0;

  if (aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '3:4') {
    return 'portrait';
  }
  if (aspectRatio === '1:1') {
    return 'square';
  }
  if (aspectRatio === '16:9' || aspectRatio === '21:9') {
    return 'landscape';
  }
  if (width > 0 && height > 0) {
    if (height > width * 1.05) return 'portrait';
    if (Math.abs(width - height) <= Math.max(width, height) * 0.1) return 'square';
    return 'landscape';
  }

  if (fallbackOrientation) {
    const clean = String(fallbackOrientation).toLowerCase().trim();
    if (clean === 'portrait' || clean === 'vertical' || clean === '9:16' || clean === '4:5') return 'portrait';
    if (clean === 'square' || clean === '1:1') return 'square';
    if (clean === 'landscape' || clean === 'horizontal' || clean === '16:9') return 'landscape';
  }

  const saved = getSavedStockConfig();
  return saved?.preferredOrientation || 'landscape';
}

export function getOrientationLabel(orientation) {
  if (orientation === 'portrait' || orientation === 'vertical') return 'Vertical (9:16)';
  if (orientation === 'square') return 'Cuadrado (1:1)';
  return 'Horizontal (16:9)';
}

export function isMediaMatchingOrientation(item, targetOrientation = 'landscape') {
  if (!item) return false;
  const w = Number(item.width) || 0;
  const h = Number(item.height) || 0;
  if (!w || !h) return true;
  if (targetOrientation === 'portrait') return h >= w * 0.95;
  if (targetOrientation === 'square') return Math.abs(w - h) / Math.max(w, h) <= 0.25;
  return w >= h * 0.95;
}

/**
 * Comprehensive semantic dictionary and category matching for stock video catalogs
 */
const CATEGORY_MAP = [
  {
    regex: /\b(ia|ai|laia|inteligencia artificial|algoritmo|machine learning|c[oó]mputo|computaci[oó]n|red neuronal|gpu|chip|hardware)\b/i,
    primary: 'artificial intelligence AI technology',
    composite: 'artificial intelligence'
  },
  {
    regex: /\b(servidor|servidores|data center|centro de datos|rack|fibra|nube|cloud)\b/i,
    primary: 'data center servers rack technology',
    composite: 'data center servers'
  },
  {
    regex: /\b(alta tensi[oó]n|el[eé]ctric|energ[ií]a|voltaje|torre el[eé]ctrica|subestaci[oó]n|cables|potencia|solar|e[oó]lica)\b/i,
    primary: 'power transmission electricity grid',
    composite: 'power electricity grid'
  },
  {
    regex: /\b(dinero|inversi[oó]n|presupuesto|d[oó]lar|costo|millon|millones|finanzas|financiera|negocio|reuni[oó]n corporativa)\b/i,
    primary: 'business finance investment office meeting',
    composite: 'business finance investment'
  },
  {
    regex: /\b(problema|dilema|desaf[ií]o|crisis|obst[aá]culo|cuello de botella|dif[ií]cil|conflicto|riesgo)\b/i,
    primary: 'technology challenge problem solving decision',
    composite: 'challenge problem technology'
  },
  {
    regex: /\b(construcci[oó]n|construir|obra|arquitect|ingenier[ií]a|edificio|faena)\b/i,
    primary: 'construction engineering architecture site',
    composite: 'construction engineering'
  },
  {
    regex: /\b(persona|personas|gente|sociedad|humano|equipo|ciudad|tr[aá]fico|urbano)\b/i,
    primary: 'city modern skyline people crowd',
    composite: 'modern city people'
  },
  {
    regex: /\b(futuro|avance|innovaci[oó]n|ciencia|laboratorio|investigaci[oó]n)\b/i,
    primary: 'futuristic innovation technology science',
    composite: 'futuristic technology'
  },
  {
    regex: /\b(computadora|pantalla|pantallas|c[oó]digo|programaci[oó]n|datos|software|gr[aá]fico)\b/i,
    primary: 'computer code screen analytics programming',
    composite: 'data screen code'
  },
  {
    regex: /\b(dron|drone|a[eé]re[ao]|panor[aá]mica|cenital|horizonte|vista)\b/i,
    primary: 'drone aerial view cinematic landscape',
    composite: 'drone aerial cinematic'
  }
];

// Domain-specific keyword expansion dictionary for video storytelling
const WORD_TRANSLATIONS = {
  // Bebidas, Alimentos y Elaboración
  'cerveza': 'beer',
  'cervezas': 'beers',
  'botella': 'bottle',
  'botellas': 'bottles',
  'vaso': 'glass',
  'vasos': 'glasses',
  'copa': 'glass',
  'copas': 'glasses',
  'espuma': 'foam',
  'barril': 'barrel keg',
  'barriles': 'barrels kegs',
  'lupulo': 'hops',
  'lúpulo': 'hops',
  'trigo': 'wheat',
  'malta': 'malt',
  'levadura': 'yeast',
  'bebida': 'drink beverage',
  'bebidas': 'drinks beverages',
  'brindis': 'cheers toast',
  'brindar': 'cheers toast',
  'brindando': 'cheers toast',
  'servir': 'pouring',
  'vertiendo': 'pouring',
  'sirviendo': 'pouring',
  'tomando': 'drinking',
  'tomar': 'drinking',
  'bebiendo': 'drinking',
  'fria': 'cold',
  'fría': 'cold',
  'frio': 'cold',
  'frío': 'cold',
  'helada': 'ice cold',
  'helado': 'cold frozen',
  'hielo': 'ice',
  'condensacion': 'drops cold',
  'condensación': 'drops cold',
  'gotas': 'water drops',
  'gotitas': 'droplets',
  'verde': 'green',
  'ambar': 'amber golden',
  'ámbar': 'amber golden',
  'dorada': 'golden',
  'dorado': 'golden',
  'negra': 'dark stout',
  'artesanal': 'craft handmade',
  'fabrica': 'brewery factory',
  'fábrica': 'brewery factory',
  'cerveceria': 'brewery',
  'cervecería': 'brewery',
  'tanque': 'fermentation tank',
  'tanques': 'fermentation tanks',
  'bar': 'pub bar',
  'taberna': 'pub tavern',
  'restaurante': 'restaurant',

  // Colores y atributos visuales
  'azul': 'blue',
  'rojo': 'red',
  'amarillo': 'yellow',
  'blanco': 'white',
  'negro': 'black',
  'primer': 'close up',
  'plano': 'shot',
  'macro': 'macro close up',
  'lento': 'slow motion',
  'lenta': 'slow motion',
  'fondo': 'background',
  'luces': 'lights glowing',
  'luz': 'light lighting',
  'sol': 'sunlight',
  'brillante': 'bright glowing',
  'oscuro': 'dark moody',
  'detalle': 'close up detail',

  // Naturaleza, ciudad y lugares
  'campo': 'field meadow',
  'agricultura': 'farming harvest',
  'cosecha': 'harvest crop',
  'grano': 'grain barley',
  'ciudad': 'city skyline',
  'calle': 'street urban',
  'noche': 'night',
  'atardecer': 'sunset golden hour',
  'amanecer': 'sunrise dawn',
  'mar': 'sea ocean',
  'agua': 'water',
  'rio': 'river',
  'río': 'river',
  'cielo': 'sky clouds',
  'canales': 'canals waterway',
  'amsterdam': 'amsterdam',
  'holanda': 'netherlands',

  // Personas y acciones
  'persona': 'person',
  'personas': 'people crowd',
  'gente': 'people crowd',
  'hombre': 'man',
  'mujer': 'woman',
  'amigos': 'friends group',
  'trabajador': 'worker artisan',
  'celebrando': 'celebrating cheers',
  'fiesta': 'party celebration',

  // Tecnología e industria
  'ia': 'artificial intelligence AI',
  'ai': 'artificial intelligence AI',
  'tecnologia': 'technology',
  'tecnología': 'technology',
  'computadora': 'computer',
  'pantalla': 'screen display',
  'servidor': 'server',
  'servidores': 'servers data center',
  'datos': 'data analytics',
  'algoritmo': 'algorithm code',
  'laboratorio': 'laboratory science',
  'robot': 'robot automation',
  'maquina': 'machinery industrial',
  'máquina': 'machinery industrial',
  'linea': 'production line',
  'línea': 'production line',
  'produccion': 'production conveyor',
  'producción': 'production conveyor',
  'etiqueta': 'bottle label',
  'chapa': 'bottle cap',
  'tapa': 'bottle cap',
  'problema': 'challenge problem',
  'desafio': 'challenge',
  'desafío': 'challenge'
};

const COMMON_STOP_WORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no',
  'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta',
  'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde',
  'enfrenta', 'hace', 'tiene', 'tienen', 'cada', 'todo', 'todos', 'esta', 'estos', 'estas', 'ser', 'son',
  'fue', 'era', 'había', 'habia', 'decidió', 'decidio', 'vio', 'iban', 'así', 'asi', 'esto', 'eso',
  'alguna', 'alguno', 'algun', 'algún', 'algunas', 'algunos', 'vez', 'veces', 'has', 'he', 'ha', 'hemos',
  'han', 'habían', 'habian', 'tenido', 'sido', 'puede', 'pueden', 'podría', 'podria', 'podían', 'podian',
  'bueno', 'pues', 'entonces', 'mientras', 'tanto', 'aquí', 'aqui', 'allí', 'alli', 'ahí', 'ahi', 'bien',
  'mal', 'hacer', 'hizo', 'hacía', 'hacia', 'dar', 'dio', 'ver', 'visto', 'mirar', 'saber', 'sabía', 'sabia',
  'decir', 'dijo', 'decía', 'decia', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma'
]);

export function translateQueryForStock(query) {
  if (!query) return 'cinematic footage';
  const clean = query.trim().toLowerCase();

  // 1. First, attempt specific word-by-word semantic translation
  const validTwoLetter = new Set(['ia', 'ai', 'vr', 'ar', '3d', '4k', 'hd', '5g', 'it', 'pc']);
  const words = clean
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ-]/g, ' ')
    .split(/\s+/)
    .filter(w => (w.length > 2 || validTwoLetter.has(w)) && !COMMON_STOP_WORDS.has(w));

  if (words.length > 0) {
    let hasTranslatedSpecific = false;
    const translatedList = words.map(w => {
      if (WORD_TRANSLATIONS[w]) {
        hasTranslatedSpecific = true;
        return WORD_TRANSLATIONS[w];
      }
      return w;
    });

    if (hasTranslatedSpecific) {
      // Keep up to 3 core search concepts for optimum catalog hit rates
      return translatedList.slice(0, 3).join(' ');
    }
  }

  // 2. Fall back to thematic category match if no specific word translated
  const matchedCategories = [];
  for (const cat of CATEGORY_MAP) {
    if (cat.regex.test(clean)) {
      matchedCategories.push(cat);
    }
  }

  if (matchedCategories.length >= 2) {
    return matchedCategories.slice(0, 2).map(c => c.composite).join(' ');
  }

  if (matchedCategories.length === 1) {
    return matchedCategories[0].primary;
  }

  if (words.length > 0) {
    return words.slice(0, 3).join(' ');
  }

  return clean.slice(0, 50);
}

/**
 * Extracts rich, clickable concept pills and visual tags from a scene,
 * used both by the Explorer modal and the AI Visual Curator Agent.
 */
export function extractSceneConceptPills(scene) {
  if (!scene) return [];
  const pills = [];
  const added = new Set();

  const addPill = (label, searchTerm, icon = null) => {
    if (!label || typeof label !== 'string') return;
    const key = label.toLowerCase().trim();
    if (key.length > 2 && !added.has(key) && !COMMON_STOP_WORDS.has(key)) {
      added.add(key);
      pills.push({ label: label.trim(), searchTerm: searchTerm || label.trim(), icon });
    }
  };

  const text = `${scene.title || ''} ${scene.visualAnchor || ''} ${scene.scriptExcerpt || scene.scriptText || ''} ${scene.visualDescription || ''}`.toLowerCase();

  // Core thematic domains
  if (/cerveza|cervecer|barril|l[uú]pulo|levadura|trigo|malta|craft beer|artesanal|heineken|botella|vaso|espuma/.test(text)) {
    addPill('Cerveza y Elaboración', 'craft beer brewery pouring', '🍺');
  }
  if (/ia|inteligencia artificial|algoritmo|machine learning|c[oó]mputo|modelo|red neuronal|gpu|chip/.test(text)) {
    addPill('Inteligencia Artificial', 'artificial intelligence AI', '🤖');
  }
  if (/data center|servidor|servidores|rack|infraestructura/.test(text)) {
    addPill('Data Center / Servidores', 'data center servers rack', '🖥️');
  }
  if (/alta tensi|el[eé]ctric|energ|voltaje|torre|red el[eé]ctrica|subestaci/.test(text)) {
    addPill('Red Eléctrica / Alta Tensión', 'high voltage power lines electricity', '⚡');
  }
  if (/dinero|inversi|presupuesto|d[oó]lar|costo|millon|financ|empresa/.test(text)) {
    addPill('Inversión y Negocios', 'corporate investment business finance', '📊');
  }
  if (/problema|crisis|dilema|desaf[ií]o|obst[aá]culo|cuello de botella|dif[ií]cil|riesgo/.test(text)) {
    addPill('Desafío / Crisis', 'technology challenge problem solving', '🧠');
  }
  if (/ciudad|gente|sociedad|humano|mundo|urbano|personas|calle|amsterdam|canal/.test(text)) {
    addPill('Ciudad y Sociedad', 'modern city crowd urban people', '🏙️');
  }
  if (/pantalla|c[oó]digo|gr[aá]ficos|programac|software|datos/.test(text)) {
    addPill('Pantallas y Datos', 'data screens code analytics', '💻');
  }
  if (/dron|a[eé]rea|panor[aá]mica|horizonte/.test(text)) {
    addPill('Toma Aérea', 'drone aerial view cinematic', '🚁');
  }
  if (/mapa|ruta|exportac|mundo|global|barco|comercio|transporte|mar[ií]timo/.test(text)) {
    addPill('Mapa y Rutas Globales', 'world map global routes trade', '🗺️');
  }

  // Visual anchor from scene as top specific pill
  if (scene.visualAnchor && scene.visualAnchor.length > 2 && !/^(escena|momento)\s*\d*$/i.test(scene.visualAnchor)) {
    addPill(scene.visualAnchor, scene.visualAnchor, '🎯');
  }

  // Scene title as preset (stripped of [E1] prefix)
  const cleanTitle = (scene.title || '').replace(/^\[E\d+\]\s*/i, '').split(/[:(]/)[0].trim();
  if (cleanTitle && cleanTitle.length > 3 && !/^(escena|momento)\s*\d*$/i.test(cleanTitle)) {
    addPill(cleanTitle, cleanTitle, '🎬');
  }

  // Add individual keywords from scene, strictly filtering out stop words and boilerplates
  if (Array.isArray(scene.searchKeywords)) {
    scene.searchKeywords.forEach(kw => {
      let clean = String(kw).toLowerCase().replace(/laia/g, 'ia').trim();
      if (clean === 'ia') {
        addPill('IA', 'artificial intelligence AI', '✨');
      } else if (clean.length > 2 && !COMMON_STOP_WORDS.has(clean) && !clean.includes('brewery beer craft') && !clean.includes('laboratory science')) {
        const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        addPill(capitalized, clean);
      }
    });
  }

  return pills.slice(0, 10);
}

/**
 * Searches stock videos or photos via Vite server proxy with pagination
 */
export async function searchStockMedia({
  query,
  type = 'video',
  provider = null,
  apiKey = null,
  orientation = null,
  project = null,
  page = 1,
  perPage = 16,
  skipTranslation = false
}) {
  const cfg = getSavedStockConfig();
  const activeProvider = provider || cfg.preferredProvider || 'pexels';
  const activeKey = apiKey !== null ? apiKey : (activeProvider === 'pexels' ? cfg.pexelsApiKey : cfg.pixabayApiKey);
  const activeOrientation = orientation
    ? resolveProjectOrientation(null, orientation)
    : resolveProjectOrientation(project, cfg.preferredOrientation || 'landscape');

  const isWeb = activeProvider === 'web' || activeProvider === 'duckduckgo' || activeProvider === 'bing';
  const translatedQuery = (skipTranslation || isWeb) ? query.trim() : translateQueryForStock(query);

  const params = new URLSearchParams({
    query: translatedQuery,
    type: isWeb ? 'image' : type,
    provider: activeProvider,
    apiKey: activeKey || '',
    orientation: activeOrientation,
    page: page.toString(),
    per_page: perPage.toString()
  });

  const response = await fetch(`${API_BASE}/api/media/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Error buscando stock media: HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawResults = data.results || [];
  const matchingResults = rawResults.filter(item => isMediaMatchingOrientation(item, activeOrientation));
  const finalResults = matchingResults.length > 0 ? matchingResults : rawResults;

  return {
    query: data.query,
    originalQuery: query,
    translatedQuery,
    orientation: activeOrientation,
    page: data.page || page,
    perPage: data.perPage || perPage,
    totalResults: data.totalResults || finalResults.length,
    hasMore: Boolean(data.hasMore),
    provider: data.provider,
    hasApiKey: data.hasApiKey,
    results: finalResults
  };
}

/**
 * Resolves the sanitized media folder for a given project.
 * Uses custom mediaFolder if set, or falls back to clean project title + id or default.
 */
export function getProjectMediaFolder(project) {
  if (!project) return 'default';

  const custom = project.settings?.mediaFolder || project.mediaFolder;
  if (custom && typeof custom === 'string' && custom.trim()) {
    return custom
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 40) || 'default';
  }

  const name = project.name || 'proyecto';
  const cleanName = name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 24);

  const shortId = (project.id || '')
    .replace(/^proj_/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6);

  return shortId ? `${cleanName || 'proj'}_${shortId}` : cleanName || project.id || 'default';
}

/**
 * Returns the current base media folder configured on the server (absolute).
 */
export async function getBaseMediaDir() {
  const cfg = await getStorageConfig();
  return cfg?.baseMediaDir || null;
}

/**
 * Builds the absolute /media-library/abs URL for an asset, given its absolute disk path.
 */
export function absoluteMediaUrl(absDiskPath) {
  return `/media-library/abs?path=${encodeURIComponent(absDiskPath)}`;
}

/**
 * Migrates a whole project's assets so each one uses an ABSOLUTE path and URL.
 * This makes every asset independent of the current base folder:
 *   - Existing assets keep working from their original location.
 *   - New downloads go to whatever base folder is currently configured.
 * Returns a new project object (or the same one if nothing changed).
 */
export function migrateProjectMediaPaths(project) {
  if (!project || !Array.isArray(project.assets)) return project;
  let changed = false;
  const assets = project.assets.map((a) => {
    let absPath = null;

    // 1. diskPath already absolute and looks like a real filesystem path
    if (a.diskPath && (a.diskPath.startsWith('/') || /^[a-zA-Z]:\\/.test(a.diskPath))) {
      absPath = a.diskPath.split('?')[0].replace(/\\/g, '/');
    } else if (a.diskPath) {
      absPath = null;
    }

    // 2. Extract diskPath if url is already /media-library/abs?path=...
    if (!absPath && a.url && a.url.includes('/media-library/abs?path=')) {
      try {
        const u = new URL(a.url, 'http://localhost');
        const p = u.searchParams.get('path');
        if (p) absPath = p.replace(/\\/g, '/');
      } catch (_) {}
    }

    // 3. Normalize hardcoded localhost or 127.0.0.1 URLs to relative paths
    let cleanUrl = a.url;
    if (cleanUrl && typeof cleanUrl === 'string' && /^https?:\/\/[^/]+\/media-library\//.test(cleanUrl)) {
      cleanUrl = cleanUrl.replace(/^https?:\/\/[^/]+/, '');
      if (cleanUrl !== a.url) changed = true;
    }

    // 4. Rebuild URL from absolute path when available
    if (absPath) {
      const newUrl = absoluteMediaUrl(absPath);
      const newDisk = absPath;
      if (newUrl !== cleanUrl || newDisk !== a.diskPath) {
        changed = true;
        return { ...a, url: newUrl, diskPath: newDisk };
      }
    }

    // 5. Stale blob: URLs from previous sessions must be migrated to tolerant /media-library/ endpoints
    if ((!cleanUrl || cleanUrl.startsWith('blob:')) && a.name) {
      const fallbackUrl = `/media-library/${encodeURIComponent(a.name)}`;
      if (fallbackUrl !== a.url) {
        changed = true;
        return { ...a, url: fallbackUrl };
      }
    }

    if (cleanUrl !== a.url) {
      return { ...a, url: cleanUrl };
    }

    return a;
  });
  return changed ? { ...project, assets } : project;
}

/**
 * Batched project asset disk resolver:
 * Calls the backend /api/media/resolve-batch endpoint to query real filesystem paths
 * for all project assets (audio, video, images) and updates the project object.
 */
export async function resolveProjectAssetsOnDisk(project) {
  if (!project || !Array.isArray(project.assets) || project.assets.length === 0) return project;

  // Filter assets that don't already have verified absolute diskPath, or lack previewUrl/real thumbnail
  const unresolvedAssets = project.assets.filter(a =>
    !a.diskPath ||
    (!a.diskPath.startsWith('/') && !/^[a-zA-Z]:\\/.test(a.diskPath)) ||
    !a.url || a.url.startsWith('blob:') ||
    (!a.previewUrl && /\.(mov|qt|mkv|avi)$/i.test(a.name || '')) ||
    (!a.thumbnail || a.thumbnail.startsWith('data:image/svg+xml'))
  );

  if (unresolvedAssets.length === 0) return project;

  try {
    const res = await fetch('/api/media/resolve-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assets: unresolvedAssets.map(a => ({
          id: a.id,
          name: a.name,
          diskPath: a.diskPath,
          url: a.url
        }))
      })
    });

    if (!res.ok) return project;
    const data = await res.json();
    if (!data || !Array.isArray(data.results)) return project;

    const resultMap = new Map(data.results.map(r => [r.id, r]));
    let changed = false;

    const updatedAssets = project.assets.map(a => {
      const match = resultMap.get(a.id);
      if (match && match.resolved && match.diskPath) {
        changed = true;
        return {
          ...a,
          diskPath: match.diskPath,
          url: match.url || absoluteMediaUrl(match.diskPath),
          previewUrl: match.previewUrl || `/media-library/stream?path=${encodeURIComponent(match.diskPath)}`,
          thumbnail: match.thumbnailUrl || a.thumbnail
        };
      }
      return a;
    });

    return changed ? { ...project, assets: updatedAssets } : project;
  } catch (err) {
    console.warn('[resolveProjectAssetsOnDisk] Error resolving assets with backend:', err);
    return project;
  }
}

/**
 * Downloads a chosen stock media item directly to the project's disk folder
 * Returns metadata and static /media-library/ URL
 */
export async function downloadStockMediaToDisk({
  mediaItem,
  projectId = 'default',
  projectFolder = null,
  scene = null,
  customFilename = null
}) {
  if (!mediaItem || !mediaItem.downloadUrl) {
    throw new Error('Elemento multimedia no contiene URL de descarga');
  }

  const cleanTitle = (scene?.title || 'toma')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 18);

  const mediaIdHash = String(mediaItem.id || 'res').replace(/[^a-zA-Z0-9]/g, '').slice(-8);
  const timeSalt = Date.now().toString(36).slice(-5);

  const filename = customFilename || (scene
    ? `broll_e${scene.sceneNumber || 1}_${cleanTitle}_${mediaIdHash}_${timeSalt}`
    : `broll_${mediaIdHash}_${timeSalt}`);

  const targetFolder = (projectFolder || projectId || 'default').trim();

  const payload = {
    url: mediaItem.downloadUrl,
    fallbackUrl: mediaItem.fallbackUrl || mediaItem.thumbnail || null,
    filename,
    projectId: targetFolder,
    projectFolder: targetFolder,
    type: mediaItem.type || 'video'
  };

  const response = await fetch(`${API_BASE}/api/media/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error al descargar a disco: HTTP ${response.status}`);
  }

  const result = await response.json();

  // Construct a standard Project Asset Object (No IndexedDB!)
  const isVideo = mediaItem.type === 'video' || (result.contentType || '').includes('video');
  const assetId = `asset_broll_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const cacheBuster = `t=${Date.now()}`;
  const freshLocalUrl = result.localUrl
    ? (result.localUrl.includes('?') ? `${result.localUrl}&${cacheBuster}` : `${result.localUrl}?${cacheBuster}`)
    : result.localUrl;

  const newAsset = {
    id: assetId,
    name: result.filename,
    type: isVideo ? 'video' : 'image',
    url: freshLocalUrl, // Served directly by Vite server with HTTP Range support + cache buster
    diskPath: result.diskPath,
    size: result.size,
    duration: mediaItem.duration || (scene ? scene.duration : 10),
    width: mediaItem.width || 1280,
    height: mediaItem.height || 720,
    thumbnail: mediaItem.thumbnail || freshLocalUrl,
    color: isVideo ? '#06b6d4' : '#6366f1',
    source: 'stock_api',
    sceneId: scene ? scene.id : null,
    isBroll: true
  };

  return {
    asset: newAsset,
    downloadResult: result
  };
}

// Global in-memory cache for the resolved media storage configuration
let cachedStorageConfig = null;

export function getCachedBaseMediaDir() {
  return cachedStorageConfig?.baseMediaDir || null;
}

export function getBaseFolderName(dirPath) {
  if (!dirPath) return 'projects_media';
  const clean = dirPath.replace(/\/+$/, '');
  const segments = clean.split('/').filter(Boolean);
  return segments.pop() || clean || 'projects_media';
}

export function formatFullMediaFolderPath(baseDir, projectFolder) {
  const base = (baseDir || cachedStorageConfig?.baseMediaDir || 'projects_media').replace(/\/+$/, '');
  return projectFolder ? `${base}/${projectFolder}/` : `${base}/`;
}

/**
 * Checks storage directory status on host disk, optionally filtering by project folder
 */
export async function getStorageDiskInfo(projectFolder = null) {
  try {
    const url = projectFolder
      ? `${API_BASE}/api/media/storage-info?folder=${encodeURIComponent(projectFolder)}`
      : `${API_BASE}/api/media/storage-info`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data?.mediaDir) {
        cachedStorageConfig = { baseMediaDir: data.mediaDir, exists: true };
      }
      return data;
    }
  } catch (err) {
    console.warn('Could not query storage info:', err);
  }
  return {
    mediaDir: cachedStorageConfig?.baseMediaDir || 'projects_media',
    folder: projectFolder,
    folderFiles: 0,
    folderBytes: 0,
    folderFormattedSize: '0.00 MB',
    exists: false,
    totalFiles: 0,
    totalBytes: 0,
    formattedSize: '0.00 MB'
  };
}

/**
 * Fetches the list of subfolders in the media directory
 */
export async function getDiskMediaFolders() {
  try {
    const res = await fetch(`${API_BASE}/api/media/folders`);
    if (res.ok) {
      const data = await res.json();
      return data.folders || [];
    }
  } catch (err) {
    console.warn('Could not list media folders:', err);
  }
  return [];
}

export function invalidateStorageConfigCache() {
  cachedStorageConfig = null;
}

/**
 * Gets base media storage configuration
 */
export async function getStorageConfig(forceRefresh = false) {
  if (cachedStorageConfig && !forceRefresh) return cachedStorageConfig;
  try {
    const res = await fetch(`${API_BASE}/api/media/config`);
    if (res.ok) {
      const data = await res.json();
      if (data?.baseMediaDir) {
        cachedStorageConfig = data;
      }
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch storage config:', err);
  }
  return cachedStorageConfig || { baseMediaDir: 'projects_media', exists: true };
}

/**
 * Browses server folders to let the user pick a base directory.
 * Pass no path to get system roots; pass a path to list its subfolders.
 */
export async function browseFolders(dirPath = null) {
  try {
    const url = dirPath
      ? `${API_BASE}/api/media/browse-folders?path=${encodeURIComponent(dirPath)}`
      : `${API_BASE}/api/media/browse-folders`;
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Could not browse folders:', err);
  }
  return { path: null, parent: null, roots: [], folders: [] };
}

/**
 * Updates base media storage directory on host
 */
export async function updateBaseMediaDir(newBaseDir) {
  const res = await fetch(`${API_BASE}/api/media/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseMediaDir: newBaseDir })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const result = await res.json();
  if (result?.baseMediaDir) {
    cachedStorageConfig = { baseMediaDir: result.baseMediaDir, exists: true };
  }
  return result;
}

