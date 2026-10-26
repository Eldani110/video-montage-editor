/**
 * Visual Collage Builder & Keyframe Extractor
 * Constructs labeled visual grids of video/image candidates for Multimodal Vision AI Evaluation.
 */

/**
 * Loads an image safely onto an offscreen canvas avoiding CORS taint and infinite hangs.
 * Always settles within timeoutMs (default 3500ms), resolving null on error or timeout.
 */
export async function loadSafeImage(src, timeoutMs = 3500) {
  if (!src || typeof src !== 'string') return null;

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const cleanupAndResolve = (result) => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      }
    };

    timer = setTimeout(() => {
      cleanupAndResolve(null);
    }, timeoutMs);

    const tryLoad = (targetUrl, isFallback = false) => {
      if (settled) return;
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          cleanupAndResolve(img);
        };

        img.onerror = () => {
          if (!isFallback && targetUrl !== src) {
            // Fallback to direct raw URL if proxy failed
            tryLoad(src, true);
          } else {
            cleanupAndResolve(null);
          }
        };

        img.src = targetUrl;
      } catch (e) {
        cleanupAndResolve(null);
      }
    };

    // Route external URLs through local CORS proxy if needed
    let initialUrl = src;
    if (typeof window !== 'undefined' && src && (src.startsWith('http://') || src.startsWith('https://'))) {
      const isSameHost = src.includes(window.location.host);
      if (!isSameHost) {
        initialUrl = `/api/ai-proxy?url=${encodeURIComponent(src)}`;
      }
    }

    tryLoad(initialUrl, false);
  });
}

/**
 * Draws an image with 'cover' aspect ratio into a canvas rectangle
 */
function drawImageCover(ctx, img, x, y, w, h, radius = 6) {
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.clip();

  const imgRatio = img.width / img.height;
  const targetRatio = w / h;
  let sWidth, sHeight, sx, sy;

  if (imgRatio > targetRatio) {
    sHeight = img.height;
    sWidth = img.height * targetRatio;
    sx = (img.width - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = img.width;
    sHeight = img.width / targetRatio;
    sx = 0;
    sy = (img.height - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
  ctx.restore();
}

/**
 * Builds a composite visual collage of 2 to 6 candidate media items
 * with high-contrast candidate labels [1], [2], [3], [4] and keyframe comparison.
 *
 * @param {object} params
 * @param {object} params.scene Scene metadata (sceneNumber, title, scriptText, visualDescription)
 * @param {Array<object>} params.candidates List of candidate media items
 * @param {number} [params.width=1200]
 * @param {number} [params.height=760]
 * @returns {Promise<{ collageDataUrl: string, base64Jpeg: string, candidateMap: Array }>}
 */
async function _internalBuildVisualCandidateCollage({
  scene,
  candidates = [],
  width = null,
  height = null
}) {
  if (typeof document === 'undefined') {
    throw new Error('Canvas collage building requires browser DOM environment.');
  }

  const count = Math.min(candidates.length, 20);

  // Dynamic canvas sizing: optimized resolution to minimize Ollama Cloud vision patch tiles while preserving sharp detail
  const finalWidth = width || (count > 12 ? 1440 : (count > 6 ? 1160 : 960));
  const finalHeight = height || (count > 12 ? 960 : (count > 6 ? 680 : 580));

  const canvas = document.createElement('canvas');
  canvas.width = finalWidth;
  canvas.height = finalHeight;
  const ctx = canvas.getContext('2d');

  // 1. Draw Deep Cinematic Background
  const bgGrad = ctx.createLinearGradient(0, 0, finalWidth, finalHeight);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(1, '#05070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, finalWidth, finalHeight);

  // 2. Header Bar
  const headerHeight = 74;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(0, 0, finalWidth, headerHeight);

  // Accent Line at top
  const accentGrad = ctx.createLinearGradient(0, 0, finalWidth, 0);
  accentGrad.addColorStop(0, '#06b6d4');
  accentGrad.addColorStop(0.5, '#6366f1');
  accentGrad.addColorStop(1, '#a855f7');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, finalWidth, 4);

  // Header Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Inter", "Segoe UI", sans-serif';
  const sceneNumText = `[ESCENA ${scene.sceneNumber || 1}]`;
  const titleText = `${scene.title || 'Secuencia Editorial'}`;
  ctx.fillText(`${sceneNumText} ${titleText}`, 20, 32);

  // Header Script Excerpt / Concept
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'italic 12px "Inter", "Segoe UI", sans-serif';
  const scriptSnippet = scene.scriptText || scene.visualDescription || '';
  const truncatedScript = scriptSnippet.length > 130 ? scriptSnippet.substring(0, 130) + '...' : scriptSnippet;
  ctx.fillText(`Guion: "${truncatedScript}"`, 20, 56);

  // Header Badge (Candidatos Totales)
  ctx.fillStyle = '#06b6d4';
  ctx.font = 'bold 12px "Inter", sans-serif';
  const badgeText = `CRITERIO EDITORIAL: COLECCIÓN DE ${count} CANDIDATOS (VARA ALTA)`;
  const badgeWidth = ctx.measureText(badgeText).width + 16;
  ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(finalWidth - badgeWidth - 20, 20, badgeWidth, 32);
  ctx.fillRect(finalWidth - badgeWidth - 20, 20, badgeWidth, 32);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(badgeText, finalWidth - badgeWidth - 12, 41);

  // 3. Calculate Grid Layout
  let cols = 2;
  let rows = 2;

  if (count <= 2) {
    cols = 2;
    rows = 1;
  } else if (count <= 4) {
    cols = 2;
    rows = 2;
  } else if (count <= 6) {
    cols = 3;
    rows = 2;
  } else if (count <= 8) {
    cols = 4;
    rows = 2; // 4x2 grid
  } else if (count <= 10) {
    cols = 5;
    rows = 2; // 5x2 grid
  } else if (count <= 12) {
    cols = 4;
    rows = 3; // 4x3 grid
  } else if (count <= 16) {
    cols = 4;
    rows = 4; // 4x4 grid
  } else {
    cols = 5;
    rows = 4; // 5x4 grid for up to 20 candidates
  }

  const marginX = 20;
  const marginY = 16;
  const gap = 12;
  const availableW = finalWidth - (marginX * 2) - ((cols - 1) * gap);
  const availableH = finalHeight - headerHeight - (marginY * 2) - ((rows - 1) * gap);
  const cellW = availableW / cols;
  const cellH = availableH / rows;

  const candidateMap = [];

  // Colors for candidate identifiers (up to 20 distinct themes)
  const CANDIDATE_COLORS = [
    { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.95)', tag: '#38bdf8' },
    { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.95)', tag: '#c084fc' },
    { border: '#10b981', bg: 'rgba(16, 185, 129, 0.95)', tag: '#34d399' },
    { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.95)', tag: '#fbbf24' },
    { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.95)', tag: '#f472b6' },
    { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.95)', tag: '#60a5fa' },
    { border: '#14b8a6', bg: 'rgba(20, 184, 166, 0.95)', tag: '#2dd4bf' },
    { border: '#f97316', bg: 'rgba(249, 115, 22, 0.95)', tag: '#fb923c' },
    { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.95)', tag: '#d8b4fe' },
    { border: '#0284c7', bg: 'rgba(2, 132, 199, 0.95)', tag: '#38bdf8' },
    { border: '#059669', bg: 'rgba(5, 150, 105, 0.95)', tag: '#6ee7b7' },
    { border: '#d97706', bg: 'rgba(217, 119, 6, 0.95)', tag: '#fde68a' },
    { border: '#e11d48', bg: 'rgba(225, 29, 72, 0.95)', tag: '#fda4af' },
    { border: '#7c3aed', bg: 'rgba(124, 58, 237, 0.95)', tag: '#ddd6fe' },
    { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.95)', tag: '#bfdbfe' },
    { border: '#0d9488', bg: 'rgba(13, 148, 136, 0.95)', tag: '#99f6e4' },
    { border: '#ea580c', bg: 'rgba(234, 88, 12, 0.95)', tag: '#fed7aa' },
    { border: '#9333ea', bg: 'rgba(147, 51, 234, 0.95)', tag: '#e9d5ff' },
    { border: '#0891b2', bg: 'rgba(8, 145, 178, 0.95)', tag: '#a5f3fc' },
    { border: '#16a34a', bg: 'rgba(22, 163, 74, 0.95)', tag: '#bbf7d0' }
  ];

  // Pre-load all candidate images concurrently in parallel for maximum speed (Promise.allSettled)
  const candidateSlice = candidates.slice(0, count);
  const preloadPromise = Promise.all(
    candidateSlice.map(async (candidate) => {
      const framesToLoad = [];
      if (candidate.keyFrames && candidate.keyFrames.length >= 2) {
        framesToLoad.push(candidate.keyFrames[0], candidate.keyFrames[1]);
      } else if (candidate.thumbnail) {
        framesToLoad.push(candidate.thumbnail);
      } else if (candidate.previewUrl) {
        framesToLoad.push(candidate.previewUrl);
      }
      const results = await Promise.allSettled(framesToLoad.map(src => loadSafeImage(src, 3000)));
      return results.map(r => (r.status === 'fulfilled' ? r.value : null));
    })
  );

  // Hard deadline of 4.5s for all image preloading: if any are still pending, continue immediately with what loaded
  const timeoutPreload = new Promise((resolve) => setTimeout(() => resolve([]), 4500));
  const preloadedFrames = await Promise.race([preloadPromise, timeoutPreload]);

  for (let i = 0; i < count; i++) {
    const candidate = candidates[i];
    const candidateIndex = i + 1;
    const col = i % cols;
    const row = Math.floor(i / cols);

    const cellX = marginX + col * (cellW + gap);
    const cellY = headerHeight + marginY + row * (cellH + gap);

    const colorTheme = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length];

    // Draw Cell Card Background & Border
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cellX, cellY, cellW, cellH, 8);
    else ctx.rect(cellX, cellY, cellW, cellH);
    ctx.fill();
    ctx.stroke();

    const imgPadding = 8;
    const mediaAreaY = cellY + 36;
    const mediaAreaH = cellH - 36 - 28; // Leave room for top banner and bottom info

    const candidateLoadedFrames = preloadedFrames[i] || [];

    if (candidateLoadedFrames.length >= 2) {
      // Dual frame comparison for video
      const frameW = (cellW - (imgPadding * 3)) / 2;
      for (let fIdx = 0; fIdx < 2; fIdx++) {
        const frameX = cellX + imgPadding + fIdx * (frameW + imgPadding);
        const img = candidateLoadedFrames[fIdx];
        if (img) {
          drawImageCover(ctx, img, frameX, mediaAreaY, frameW, mediaAreaH, 4);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(frameX + 4, mediaAreaY + 4, 38, 16);
          ctx.fillStyle = '#e2e8f0';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(fIdx === 0 ? 'FOT. 1' : 'FOT. 2', frameX + 7, mediaAreaY + 16);
        } else {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(frameX, mediaAreaY, frameW, mediaAreaH);
        }
      }
    } else if (candidateLoadedFrames.length >= 1) {
      // Single frame (image or single video thumbnail)
      const frameW = cellW - (imgPadding * 2);
      const img = candidateLoadedFrames[0];
      if (img) {
        drawImageCover(ctx, img, cellX + imgPadding, mediaAreaY, frameW, mediaAreaH, 4);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cellX + imgPadding, mediaAreaY, frameW, mediaAreaH);
      }
    } else {
      // Fallback placeholder
      const frameW = cellW - (imgPadding * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cellX + imgPadding, mediaAreaY, frameW, mediaAreaH);
    }

    // Top Identifier Banner inside cell
    ctx.fillStyle = colorTheme.bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cellX + 8, cellY + 6, cellW - 16, 24, 4);
    else ctx.rect(cellX + 8, cellY + 6, cellW - 16, 24);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Inter", sans-serif';
    const optLabel = `[CANDIDATO ${candidateIndex}]`;
    ctx.fillText(optLabel, cellX + 16, cellY + 22);

    ctx.font = '10px "Inter", sans-serif';
    const typeLabel = candidate.type === 'video' ? '🎬 VIDEO B-ROLL' : '🖼️ IMAGEN';
    const typeWidth = ctx.measureText(typeLabel).width;
    ctx.fillText(typeLabel, cellX + cellW - typeWidth - 16, cellY + 22);

    // Bottom Info Bar inside cell
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cellX + 8, cellY + cellH - 24, cellW - 16, 20);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px "Inter", sans-serif';
    const titleSnippet = (candidate.title || `Recurso ${candidateIndex}`).substring(0, 36);
    ctx.fillText(titleSnippet, cellX + 14, cellY + cellH - 10);

    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    const providerLabel = (candidate.provider || 'stock').toUpperCase();
    const provWidth = ctx.measureText(providerLabel).width;
    ctx.fillText(providerLabel, cellX + cellW - provWidth - 14, cellY + cellH - 10);

    candidateMap.push({
      candidateIndex,
      candidateId: candidate.id,
      title: candidate.title,
      type: candidate.type,
      provider: candidate.provider,
      mediaItem: candidate
    });
  }

  const collageDataUrl = canvas.toDataURL('image/jpeg', 0.80);
  const base64Jpeg = collageDataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return {
    collageDataUrl,
    base64Jpeg,
    candidateMap
  };
}

/**
 * Builds an immediate fallback collage without loading external images if timeout occurs.
 */
export function buildFallbackCandidateCollage({ scene, candidates = [] }) {
  const count = Math.min(candidates.length, 20);
  const width = 1200;
  const height = 760;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Deep dark background
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Inter", sans-serif';
  ctx.fillText(`[ESCENA ${scene?.sceneNumber || 1}] ${scene?.title || 'Secuencia'}`, 24, 38);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "Inter", sans-serif';
  ctx.fillText(`Evaluación Visual: ${count} candidatos de stock`, 24, 60);

  // Draw grid cards
  const cols = count > 8 ? 4 : (count > 4 ? 3 : 2);
  const rows = Math.ceil(count / cols);
  const marginX = 24;
  const marginY = 80;
  const gap = 12;
  const cellW = (width - marginX * 2 - gap * (cols - 1)) / cols;
  const cellH = (height - marginY - 24 - gap * (rows - 1)) / rows;

  const candidateMap = [];
  for (let i = 0; i < count; i++) {
    const c = candidates[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = marginX + col * (cellW + gap);
    const y = marginY + row * (cellH + gap);

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeRect(x, y, cellW, cellH);

    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`[CANDIDATO ${i + 1}]`, x + 10, y + 24);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    const titleSnippet = (c.title || 'Recurso de Stock').substring(0, 32);
    ctx.fillText(titleSnippet, x + 10, y + 46);

    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.fillText(`${(c.provider || 'stock').toUpperCase()} • ${(c.type || 'video').toUpperCase()}`, x + 10, y + 66);

    candidateMap.push({
      candidateIndex: i + 1,
      candidateId: c.id,
      title: c.title,
      type: c.type,
      provider: c.provider,
      mediaItem: c
    });
  }

  const collageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const base64Jpeg = collageDataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return {
    collageDataUrl,
    base64Jpeg,
    candidateMap
  };
}

/**
 * Builds composite candidate collage with a strict 7.5s master timeout safeguard.
 * Guarantees that execution NEVER freezes indefinitely.
 */
export async function buildVisualCandidateCollage(params) {
  try {
    const mainPromise = _internalBuildVisualCandidateCollage(params);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 7500));
    const res = await Promise.race([mainPromise, timeoutPromise]);
    if (res && res.collageDataUrl) return res;
    console.warn('[VisualCollageBuilder] Timeout de 7.5s alcanzado para collage visual, usando fallback inmediato.');
    return buildFallbackCandidateCollage(params);
  } catch (err) {
    console.warn('[VisualCollageBuilder] Error durante generación de collage visual:', err.message);
    return buildFallbackCandidateCollage(params);
  }
}

/**
 * Builds a Dual-Scene Composite Visual Collage (Solution 1: Mosaico Dual):
 * Renders up to 4 candidates for Scene A on the top half and up to 4 candidates for Scene B on the bottom half.
 * Allows Vision AI in Ollama Cloud to evaluate TWO scenes in a single request, cutting requests by 50%.
 *
 * @param {object} params
 * @param {object} params.sceneA Scene A metadata
 * @param {Array<object>} params.candidatesA Candidates for Scene A (up to 4)
 * @param {object} params.sceneB Scene B metadata
 * @param {Array<object>} params.candidatesB Candidates for Scene B (up to 4)
 * @returns {Promise<{ collageDataUrl: string, base64Jpeg: string, candidateMapA: Array, candidateMapB: Array }>}
 */
export async function buildDualSceneVisualCollage({
  sceneA,
  candidatesA = [],
  sceneB = null,
  candidatesB = []
}) {
  if (typeof document === 'undefined') {
    throw new Error('Canvas collage building requires browser DOM environment.');
  }

  const width = 1280;
  const height = 840;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(1, '#05070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Preload all candidate images in parallel (up to 12 per scene = 24 total)
  const allCandidates = [...candidatesA.slice(0, 12), ...(candidatesB ? candidatesB.slice(0, 12) : [])];
  const preloadPromise = Promise.all(
    allCandidates.map(async (candidate) => {
      const src = candidate.thumbnail || candidate.previewUrl || candidate.keyFrames?.[0];
      return loadSafeImage(src, 3000);
    })
  );
  const timeoutPreload = new Promise((resolve) => setTimeout(() => resolve([]), 4200));
  const preloadedImages = await Promise.race([preloadPromise, timeoutPreload]);

  const candidateMapA = [];
  const candidateMapB = [];

  // Helper to render one scene section with up to 12 candidates in a 2x6 grid
  const renderSceneSection = (scene, candidates, startIdx, yOffset, themeColor, sectionLabel) => {
    const headerHeight = 38;

    // Header Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, yOffset, width, headerHeight);

    // Accent line
    ctx.fillStyle = themeColor;
    ctx.fillRect(0, yOffset, width, 3);

    // Header text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Inter", sans-serif';
    const sceneText = `[ESCENA ${sectionLabel}: #${scene.sceneNumber || 1}] ${scene.title || 'Secuencia'}`;
    ctx.fillText(sceneText, 16, yOffset + 21);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'italic 10px "Inter", sans-serif';
    const scriptSnippet = (scene.scriptText || scene.visualDescription || '').substring(0, 100);
    ctx.fillText(`Guion: "${scriptSnippet}..."`, 16, yOffset + 33);

    // Section Badge
    const badgeText = `${sectionLabel.toUpperCase()} (Elegir [${sectionLabel}1 - ${sectionLabel}${candidates.length}])`;
    ctx.fillStyle = themeColor;
    ctx.font = 'bold 11px monospace';
    const badgeW = ctx.measureText(badgeText).width + 12;
    ctx.fillRect(width - badgeW - 16, yOffset + 9, badgeW, 20);
    ctx.fillStyle = '#090d16';
    ctx.fillText(badgeText, width - badgeW - 10, yOffset + 23);

    // Render candidate cards in a 2-row x 6-column grid (up to 12 candidates per scene)
    const count = Math.min(candidates.length, 12);
    const cols = 6;
    const marginX = 14;
    const marginY = 6;
    const gapX = 10;
    const gapY = 8;
    const availableW = width - (marginX * 2) - ((cols - 1) * gapX);
    const cellW = availableW / cols;
    const cellH = 168;

    for (let cIdx = 0; cIdx < count; cIdx++) {
      const candidate = candidates[cIdx];
      const img = preloadedImages[startIdx + cIdx];
      const col = cIdx % cols;
      const row = Math.floor(cIdx / cols);
      const cellX = marginX + col * (cellW + gapX);
      const cellY = yOffset + headerHeight + marginY + row * (cellH + gapY);

      // Card background
      ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cellX, cellY, cellW, cellH, 6);
      else ctx.rect(cellX, cellY, cellW, cellH);
      ctx.fill();
      ctx.stroke();

      // Top label badge: [A1] or [B1]
      const labelBadge = `[${sectionLabel}${cIdx + 1}]`;
      ctx.fillStyle = themeColor;
      ctx.fillRect(cellX + 6, cellY + 5, 42, 20);
      ctx.fillStyle = '#090d16';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(labelBadge, cellX + 10, cellY + 19);

      // Provider / type tag
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`${(candidate.provider || 'stock').toUpperCase()} • ${(candidate.type || 'video').toUpperCase()}`, cellX + 52, cellY + 19);

      // Media area (16:9 ratio preview)
      const mediaY = cellY + 28;
      const mediaH = cellH - 28 - 20;
      const mediaW = cellW - 12;

      if (img) {
        drawImageCover(ctx, img, cellX + 6, mediaY, mediaW, mediaH, 4);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cellX + 6, mediaY, mediaW, mediaH);
        ctx.fillStyle = '#475569';
        ctx.font = '10px sans-serif';
        ctx.fillText('Vista previa', cellX + 14, mediaY + 24);
      }

      // Title bar at bottom
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(cellX + 6, cellY + cellH - 18, mediaW, 16);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '9px sans-serif';
      const cleanTitle = (candidate.title || `Recurso ${cIdx + 1}`).substring(0, 26);
      ctx.fillText(cleanTitle, cellX + 10, cellY + cellH - 6);

      const mapping = {
        label: `${sectionLabel}${cIdx + 1}`,
        index: cIdx + 1,
        id: candidate.id,
        title: candidate.title,
        mediaItem: candidate
      };

      if (sectionLabel === 'A') candidateMapA.push(mapping);
      else candidateMapB.push(mapping);
    }
  };

  // Render Section A (Top, up to 12 candidates in 2x6 grid)
  renderSceneSection(sceneA, candidatesA.slice(0, 12), 0, 0, '#06b6d4', 'A');

  // Divider line
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(0, 412, width, 3);

  // Render Section B (Bottom, up to 12 candidates in 2x6 grid)
  if (sceneB && candidatesB && candidatesB.length > 0) {
    renderSceneSection(sceneB, candidatesB.slice(0, 12), candidatesA.slice(0, 12).length, 420, '#a855f7', 'B');
  }

  const collageDataUrl = canvas.toDataURL('image/jpeg', 0.80);
  const base64Jpeg = collageDataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return {
    collageDataUrl,
    base64Jpeg,
    candidateMapA,
    candidateMapB
  };
}
