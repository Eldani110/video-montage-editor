/**
 * Stock Media API Client & Local Disk Downloader
 * Connects to Pexels / Pixabay APIs via local Vite server proxy,
 * downloads matching videos/images directly to the project's local disk folder,
 * and registers them as standard project resources without touching IndexedDB.
 */

import { getConnectedMediaFolder, writeLocalMediaFile } from './localMedia';

const STORAGE_KEY_STOCK = 'montage_stock_config';
const API_BASE = typeof window !== 'undefined' ? '' : 'http://localhost:5173';

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
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read stock config from localStorage:', err);
  }
  return {
    pexelsApiKey: '',
    pixabayApiKey: '',
    preferredProvider: 'web', // Default to 'web' (Bing Images + Wikimedia Commons) - 100% Free & No API Key needed
    preferredOrientation: 'landscape', // 'landscape' | 'portrait'
    preferredMediaType: 'mixed', // 'mixed' (Combinada) | 'video' (Solo Videos) | 'image' (Solo Imágenes)
    targetTrack: 'v2', // 'v2' (Overlay / B-roll track) | 'v1'
    autoMuteAudio: true
  };
}

export function saveStockConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY_STOCK, JSON.stringify(config));
  } catch (err) {
    console.warn('Could not save stock config to localStorage:', err);
  }
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

export function translateQueryForStock(query) {
  if (!query) return 'technology business abstract';
  const clean = query.trim().toLowerCase();

  // 1. Detect all matching semantic domains (multi-concept support)
  const matchedCategories = [];
  for (const cat of CATEGORY_MAP) {
    if (cat.regex.test(clean)) {
      matchedCategories.push(cat);
    }
  }

  // If multiple concepts matched (e.g. IA + problema or Servidores + Energía)
  if (matchedCategories.length >= 2) {
    const combined = matchedCategories.slice(0, 2).map(c => c.composite).join(' ');
    return combined;
  }

  // If a single concept matched, return its rich search string
  if (matchedCategories.length === 1) {
    return matchedCategories[0].primary;
  }

  // 2. Remove common Spanish stop words and keep meaningful terms
  const stopWords = new Set([
    'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no',
    'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta',
    'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde',
    'enfrenta', 'hace', 'tiene', 'tienen', 'cada', 'todo', 'todos', 'esta', 'estos', 'estas'
  ]);

  // Keep tech 2-letter words like ia, ai, vr, ar, 3d, 4k
  const validTwoLetter = new Set(['ia', 'ai', 'vr', 'ar', '3d', '4k', 'hd', '5g', 'it', 'pc']);

  const words = clean
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, ' ')
    .split(/\s+/)
    .filter(w => (w.length > 2 || validTwoLetter.has(w)) && !stopWords.has(w));

  if (words.length > 0) {
    // Check if any word is 'ia' or 'ai' or 'laia'
    const translatedWords = words.map(w => {
      if (w === 'ia' || w === 'ai' || w === 'laia') return 'artificial intelligence AI';
      if (w === 'problema') return 'problem challenge';
      if (w === 'datos') return 'data';
      if (w === 'servidores') return 'servers';
      if (w === 'energia') return 'energy';
      return w;
    });
    return translatedWords.slice(0, 4).join(' ');
  }

  return clean;
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
    const key = label.toLowerCase();
    if (!added.has(key)) {
      added.add(key);
      pills.push({ label, searchTerm: searchTerm || label, icon });
    }
  };

  const text = `${scene.title || ''} ${scene.scriptExcerpt || scene.scriptText || ''} ${scene.visualDescription || ''}`.toLowerCase();

  // Core thematic domains
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

  // Add individual keywords from scene
  if (Array.isArray(scene.searchKeywords)) {
    scene.searchKeywords.forEach(kw => {
      let clean = String(kw).toLowerCase().replace(/laia/g, 'ia').trim();
      if (clean === 'ia') {
        addPill('IA', 'artificial intelligence AI', '✨');
      } else if (clean.length > 2 && !['para', 'como', 'pero', 'este', 'esta', 'porque', 'enfrenta'].includes(clean)) {
        const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        addPill(capitalized, clean);
      }
    });
  }

  // Scene title as preset
  if (scene.title && scene.title.length > 3) {
    addPill(scene.title, scene.title, '🎬');
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
  orientation = 'landscape',
  page = 1,
  perPage = 16,
  skipTranslation = false
}) {
  const cfg = getSavedStockConfig();
  const activeProvider = provider || cfg.preferredProvider || 'pexels';
  const activeKey = apiKey !== null ? apiKey : (activeProvider === 'pexels' ? cfg.pexelsApiKey : cfg.pixabayApiKey);
  const activeOrientation = orientation || cfg.preferredOrientation || 'landscape';

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
  return {
    query: data.query,
    originalQuery: query,
    translatedQuery,
    page: data.page || page,
    perPage: data.perPage || perPage,
    totalResults: data.totalResults || (data.results || []).length,
    hasMore: Boolean(data.hasMore),
    provider: data.provider,
    hasApiKey: data.hasApiKey,
    results: data.results || []
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
 * Downloads a chosen stock media item directly to the project's disk folder
 * Returns metadata and static /media-library/ URL
 */
/**
 * Attempts to persist a stock media item straight into the user's connected local
 * media folder. Returns { asset, downloadResult } on success, or null when no local
 * folder is connected (in which case the caller falls back to the server).
 */
async function tryWriteStockMediaLocally({ mediaItem, targetFolder, filename }) {
  try {
    const connected = await getConnectedMediaFolder(false);
    if (!connected || !connected.handle || connected.needsPermission) return null;

    const remoteUrl = mediaItem.downloadUrl;
    const resp = await fetch(remoteUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();

    const written = await writeLocalMediaFile({
      rootHandle: connected.handle,
      filename,
      blob
    });

    const isVideo = mediaItem.type === 'video' || (blob.type || '').includes('video');
    const assetId = `asset_broll_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const newAsset = {
      id: assetId,
      name: written.filename,
      type: isVideo ? 'video' : 'image',
      url: written.objectUrl,
      diskPath: written.diskPath,
      localDisk: true,
      size: written.size,
      duration: mediaItem.duration || 10,
      width: mediaItem.width || 1280,
      height: mediaItem.height || 720,
      thumbnail: mediaItem.thumbnail || written.objectUrl,
      color: isVideo ? '#06b6d4' : '#6366f1',
      source: 'stock_api',
      isBroll: true
    };

    return {
      asset: newAsset,
      downloadResult: {
        success: true,
        filename: written.filename,
        localUrl: written.objectUrl,
        diskPath: written.diskPath,
        size: written.size,
        local: true
      }
    };
  } catch (err) {
    console.warn('Local media write failed, falling back to server:', err);
    return null;
  }
}

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

  // 1. Try saving directly to the user's LOCAL disk folder (Clipchamp-style),
  //    so media lives on the user's machine regardless of where the app is served.
  const localResult = await tryWriteStockMediaLocally({
    mediaItem,
    targetFolder,
    filename
  });
  if (localResult) {
    return localResult;
  }

  // 2. Fallback: server-side download into projects_media (original behaviour)
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
  const cacheBuster = `?t=${Date.now()}`;
  const freshLocalUrl = result.localUrl ? `${result.localUrl}${cacheBuster}` : result.localUrl;

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

/**
 * Checks storage directory status on host disk, optionally filtering by project folder
 */
export async function getStorageDiskInfo(projectFolder = null) {
  try {
    const url = projectFolder
      ? `${API_BASE}/api/media/storage-info?folder=${encodeURIComponent(projectFolder)}`
      : `${API_BASE}/api/media/storage-info`;
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Could not query storage info:', err);
  }
  return {
    mediaDir: 'projects_media',
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
 * Lists the actual media files present inside a project's disk folder.
 * Enables the editor to auto-discover media already on disk (not just app-registered assets).
 */
export async function listDiskMediaFiles(projectFolder = null) {
  try {
    const url = projectFolder
      ? `${API_BASE}/api/media/list?folder=${encodeURIComponent(projectFolder)}`
      : `${API_BASE}/api/media/list`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.files || [];
    }
  } catch (err) {
    console.warn('Could not list disk media files:', err);
  }
  return [];
}

/**
 * Locates a media file by name anywhere inside the base media dir (recursive).
 * Returns { found, url, folder, filename } — used to self-heal broken asset URLs.
 */
export async function locateMediaFile(filename) {
  if (!filename) return { found: false };
  try {
    const res = await fetch(`${API_BASE}/api/media/locate?filename=${encodeURIComponent(filename)}`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Could not locate media file:', err);
  }
  return { found: false };
}

/**
 * Repairs asset URLs: for each asset whose file can no longer be found at its
 * stored path, tries to locate it elsewhere and rewrites the URL.
 * Returns a new array of assets (only changed ones differ).
 */
export async function repairAssetUrls(assets = [], onProgress = null) {
  const repaired = [];
  let fixedCount = 0;
  let checkedCount = 0;

  for (const asset of assets) {
    checkedCount++;
    if (onProgress) onProgress(checkedCount, assets.length);

    // Only disk-backed assets with a name can be repaired
    const isDiskAsset = asset.url && String(asset.url).includes('/media-library/');
    if (!isDiskAsset || !asset.name) {
      repaired.push(asset);
      continue;
    }

    const bareUrl = String(asset.url).split('?')[0];

    // Resolve the canonical on-disk location for this asset name.
    // This also reconciles file-name drift (e.g. single vs double underscore).
    const loc = await locateMediaFile(asset.name);

    if (loc && loc.found && loc.url) {
      const canonicalBare = String(loc.url).split('?')[0];
      const nameChanged = loc.filename && loc.filename !== asset.name;
      const urlChanged = canonicalBare !== bareUrl;

      if (nameChanged || urlChanged) {
        repaired.push({
          ...asset,
          name: loc.filename || asset.name,
          url: canonicalBare + '?t=' + Date.now(),
          diskPath: canonicalBare
        });
        fixedCount++;
      } else {
        repaired.push(asset);
      }
      continue;
    }

    // Could not locate anywhere: only keep the asset if its URL still responds
    let alive = false;
    try {
      const head = await fetch(bareUrl, { method: 'HEAD' });
      alive = head.ok;
    } catch (_) {
      alive = false;
    }

    repaired.push(asset);
    if (!alive) {
      // Mark as missing so the UI can flag it (kept in project to avoid data loss)
      repaired[repaired.length - 1] = { ...asset, missing: true };
    }
  }

  return { assets: repaired, fixedCount };
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

/**
 * Gets base media storage configuration
 */
export async function getStorageConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/media/config`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Could not fetch storage config:', err);
  }
  return { baseMediaDir: 'projects_media', exists: true };
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
  return await res.json();
}
