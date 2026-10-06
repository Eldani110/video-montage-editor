/**
 * Graphic Engine & Animation System for Montage Pro Studio
 * Provides high-fidelity titles, animated infographics, financial & statistic charts,
 * lower-thirds, KPI callouts, and multi-stage motion animation.
 */

export const FONT_OPTIONS = [
  { id: 'Outfit', name: 'Outfit (Moderno & Viral)', family: "'Outfit', sans-serif" },
  { id: 'Anton', name: 'Anton (Impacto Titular / Negrita)', family: "'Anton', sans-serif" },
  { id: 'Montserrat', name: 'Montserrat (Geométrico & Sólido)', family: "'Montserrat', sans-serif" },
  { id: 'Poppins', name: 'Poppins (Limpio & Elegante)', family: "'Poppins', sans-serif" },
  { id: 'Playfair Display', name: 'Playfair Display (Cinemático & Lujo)', family: "'Playfair Display', serif" },
  { id: 'Syne', name: 'Syne (Vanguardista & Creativo)', family: "'Syne', sans-serif" },
  { id: 'Bebas Neue', name: 'Bebas Neue (Titulares Altos)', family: "'Bebas Neue', sans-serif" },
  { id: 'Inter', name: 'Inter (Editorial & Minimalista)', family: "'Inter', sans-serif" },
  { id: 'JetBrains Mono', name: 'JetBrains Mono (Código & Métricas)', family: "'JetBrains Mono', monospace" }
];

export const ANIMATION_IN_TYPES = [
  { id: 'fade', name: 'Fundido Suave (Fade In)', icon: 'Sparkles', desc: 'Opacidad progresiva elegante' },
  { id: 'slide-up', name: 'Deslizar desde Abajo (Slide Up)', icon: 'ArrowUp', desc: 'Sube con suavizado dinámico' },
  { id: 'slide-down', name: 'Deslizar desde Arriba (Slide Down)', icon: 'ArrowDown', desc: 'Baja desde la parte superior' },
  { id: 'slide-left', name: 'Deslizar desde la Derecha (Slide Left)', icon: 'ArrowLeft', desc: 'Entrada lateral derecha' },
  { id: 'slide-right', name: 'Deslizar desde la Izquierda (Slide Right)', icon: 'ArrowRight', desc: 'Entrada lateral izquierda' },
  { id: 'pop', name: 'Pop / Zoom Elástico (Scale In)', icon: 'Maximize2', desc: 'Escalado 0 a 1 con rebote suave' },
  { id: 'bounce', name: 'Rebote Cinético (Bounce)', icon: 'Zap', desc: 'Entrada rápida con amortiguación' },
  { id: 'typewriter', name: 'Efecto Escritura (Typewriter)', icon: 'Type', desc: 'Letras apareciendo una a una' },
  { id: 'glitch', name: 'Glitch Cyberpunk', icon: 'Cpu', desc: 'Destellos y aberración cromática' }
];

export const ANIMATION_LOOP_TYPES = [
  { id: 'none', name: 'Fijo (Sin animación continua)' },
  { id: 'pulse', name: 'Pulso Sutil (Pulse Glow)' },
  { id: 'float', name: 'Flotación Suave (Levitación)' },
  { id: 'shimmer', name: 'Destello Metálico (Shimmer)' }
];

export const ANIMATION_OUT_TYPES = [
  { id: 'fade', name: 'Fundido Salida (Fade Out)' },
  { id: 'slide-down', name: 'Deslizar hacia Abajo' },
  { id: 'slide-up', name: 'Deslizar hacia Arriba' },
  { id: 'zoom-out', name: 'Zoom Out / Disolver' }
];

export const GRAPHIC_TYPES = [
  {
    id: 'doc_chapter',
    name: 'Capítulo Documental',
    badge: 'Capítulo / Sección',
    icon: 'BookOpen',
    desc: 'Encabezado documental estilo YouTube video-essay (Capítulo 1 + Título principal) flotando directo sobre el metraje con sombra fílmica.'
  },
  {
    id: 'doc_stat',
    name: 'Cifra de Impacto / Estadística',
    badge: 'Cifra / Número',
    icon: 'TrendingUp',
    desc: 'Cifra o número colosal destacado en amarillo documental con sombra profunda (ej: 800.000.000 de personas), sin marcos artificiales.'
  },
  {
    id: 'doc_date',
    name: 'Fecha o Hito Histórico',
    badge: 'Fecha / Suceso',
    icon: 'Calendar',
    desc: 'Fecha o suceso histórico en verde documental de alto impacto flotando sobre el video con sombra cinematográfica.'
  },
  {
    id: 'doc_timeline',
    name: 'Línea de Tiempo Minimalista',
    badge: 'Cronología',
    icon: 'GitCommit',
    desc: 'Eje horizontal elegante con hitos cronológicos, años en cursiva negrita arriba y eventos abajo.'
  },
  {
    id: 'title_hero',
    name: 'Titular Cinematográfico Directo',
    badge: 'Titular / Frase Clave',
    icon: 'Type',
    desc: 'Texto flotante centrado de alto impacto con sombra cinematográfica profunda sin marcos artificiales.'
  },
  {
    id: 'lower_third',
    name: 'Tercio Inferior Limpio',
    badge: 'Presentador / Concepto',
    icon: 'Layers',
    desc: 'Banda inferior minimalista con nombre, cargo o etiqueta temática y acento visual.'
  },
  {
    id: 'quote_callout',
    name: 'Cita / Afirmación Editorial',
    badge: 'Cita Textual',
    icon: 'Quote',
    desc: 'Caja o frase reflexiva glassmorphism con comillas estilizadas y texto de alto valor.'
  },
  {
    id: 'kpi_metric',
    name: 'Métrica KPI con Tarjeta',
    badge: 'Estadística / Finanzas',
    icon: 'TrendingUp',
    desc: 'Número resaltado con tarjeta glassmorphism, indicador de porcentaje o tendencia y etiqueta explicativa.'
  },
  {
    id: 'chart_bar',
    name: 'Gráfico de Barras Estadístico',
    badge: 'Gráfico Cuantitativo',
    icon: 'BarChart2',
    desc: 'Barras comparativas animadas con valores, porcentajes y etiquetas categóricas.'
  },
  {
    id: 'chart_line',
    name: 'Gráfico de Tendencia / Línea',
    badge: 'Crecimiento Temporal',
    icon: 'Activity',
    desc: 'Curva suave de evolución temporal con área degradada y puntos clave destacados.'
  },
  {
    id: 'chart_donut',
    name: 'Gráfico Circular / Dona',
    badge: 'Distribución / Cuota',
    icon: 'PieChart',
    desc: 'Anillo radial con porcentaje central y desglose porcentual de categorías.'
  }
];

export const GRAPHIC_COLOR_THEMES = [
  {
    id: 'doc_classic',
    name: 'Documental Blanco & Fílmico',
    primary: '#ffffff',
    secondary: '#cbd5e1',
    accent: '#f8fafc',
    text: '#ffffff',
    bg: 'rgba(0, 0, 0, 0.65)',
    shadow: 'rgba(0, 0, 0, 0.95)',
    border: 'rgba(255, 255, 255, 0.15)'
  },
  {
    id: 'doc_yellow',
    name: 'Amarillo Documental (Estadística)',
    primary: '#facc15',
    secondary: '#eab308',
    accent: '#fde047',
    text: '#facc15',
    bg: 'rgba(20, 16, 5, 0.85)',
    shadow: 'rgba(0, 0, 0, 0.95)',
    border: 'rgba(250, 204, 21, 0.3)'
  },
  {
    id: 'doc_green',
    name: 'Verde Fecha Histórica',
    primary: '#22c55e',
    secondary: '#16a34a',
    accent: '#4ade80',
    text: '#22c55e',
    bg: 'rgba(5, 20, 10, 0.85)',
    shadow: 'rgba(0, 0, 0, 0.95)',
    border: 'rgba(34, 197, 94, 0.3)'
  },
  {
    id: 'doc_blue',
    name: 'Azul Cronológico (Línea de Tiempo)',
    primary: '#0284c7',
    secondary: '#0369a1',
    accent: '#38bdf8',
    text: '#ffffff',
    bg: 'rgba(8, 16, 32, 0.85)',
    shadow: 'rgba(0, 0, 0, 0.9)',
    border: 'rgba(56, 189, 248, 0.3)'
  },
  {
    id: 'cyber_neon',
    name: 'Cyber Neon',
    primary: '#06b6d4',
    secondary: '#6366f1',
    accent: '#38bdf8',
    text: '#ffffff',
    bg: 'rgba(8, 14, 28, 0.85)',
    shadow: 'rgba(6, 182, 212, 0.45)',
    border: 'rgba(6, 182, 212, 0.4)'
  },
  {
    id: 'gold_luxury',
    name: 'Cinemático Dorado',
    primary: '#f59e0b',
    secondary: '#d97706',
    accent: '#fbbf24',
    text: '#ffffff',
    bg: 'rgba(20, 16, 10, 0.88)',
    shadow: 'rgba(245, 158, 11, 0.4)',
    border: 'rgba(245, 158, 11, 0.35)'
  },
  {
    id: 'emerald_growth',
    name: 'Esmeralda Crecimiento',
    primary: '#10b981',
    secondary: '#059669',
    accent: '#34d399',
    text: '#ffffff',
    bg: 'rgba(6, 26, 18, 0.88)',
    shadow: 'rgba(16, 185, 129, 0.4)',
    border: 'rgba(16, 185, 129, 0.35)'
  },
  {
    id: 'crimson_passion',
    name: 'Púrpura & Fucsia Vibrante',
    primary: '#ec4899',
    secondary: '#8b5cf6',
    accent: '#f43f5e',
    text: '#ffffff',
    bg: 'rgba(26, 10, 24, 0.88)',
    shadow: 'rgba(236, 72, 153, 0.4)',
    border: 'rgba(236, 72, 153, 0.35)'
  },
  {
    id: 'slate_minimal',
    name: 'Minimalista Slate Studio',
    primary: '#ffffff',
    secondary: '#94a3b8',
    accent: '#38bdf8',
    text: '#ffffff',
    bg: 'rgba(15, 23, 42, 0.88)',
    shadow: 'rgba(0, 0, 0, 0.65)',
    border: 'rgba(255, 255, 255, 0.15)'
  }
];

export const POSITION_PRESETS = [
  { id: 'center', name: 'Centro de Pantalla', x: 0, y: 0, scale: 1 },
  { id: 'lower_third', name: 'Tercio Inferior (Broadcast)', x: 0, y: 220, scale: 0.95 },
  { id: 'top_center', name: 'Superior Centrado', x: 0, y: -240, scale: 0.9 },
  { id: 'bottom_left', name: 'Inferior Izquierda', x: -280, y: 220, scale: 0.9 },
  { id: 'center_left', name: 'Lateral Izquierda', x: -260, y: 0, scale: 0.92 },
  { id: 'center_right', name: 'Lateral Derecha', x: 260, y: 0, scale: 0.92 }
];

/**
 * Creates a fully initialized graphic clip ready to be inserted into a project
 */
export function createGraphicClip({
  id = null,
  trackId = 'track-graphics-1',
  name = 'Gráfico Animado',
  startTime = 0,
  duration = 4.0,
  graphicType = 'doc_chapter',
  themeId = 'doc_classic',
  fontFamily = 'Outfit',
  title = 'El auge del dinero digital',
  subtitle = '',
  badgeText = '',
  // Documentary Fields
  chapterPrefix = 'Capítulo 1:',
  statNumber = '800.000.000',
  statText = 'de personas',
  milestones = [
    { date: '1975', label: 'Homebrew Club', active: false },
    { date: '1976', label: 'Apple I', active: false },
    { date: '1981', label: 'IBM PC', active: true }
  ],
  // Data for charts/metrics
  kpiValue = '800M',
  kpiLabel = 'Alcance Global',
  kpiDelta = '+12.4% anual',
  chartItems = [
    { label: 'Q1', value: 35, color: '#06b6d4' },
    { label: 'Q2', value: 58, color: '#38bdf8' },
    { label: 'Q3', value: 84, color: '#6366f1' },
    { label: 'Q4', value: 120, color: '#a855f7' }
  ],
  quoteAuthor = 'Fuente Editorial',
  // Animations
  animationIn = 'fade',
  animationInDuration = 0.5,
  animationLoop = 'none',
  animationOut = 'fade',
  animationOutDuration = 0.5,
  // Typography & Styling
  fontSize = 50,
  textColor = null,
  accentColor = null,
  textShadowBlur = 18,
  textShadowOffsetY = 3,
  textShadowColor = 'rgba(0, 0, 0, 0.95)',
  textTransform = 'none', // 'none' | 'uppercase'
  letterSpacing = 0,
  backdropGlass = null,
  // Position
  presetPosition = 'center',
  posX = 0,
  posY = 0,
  scale = 1.0,
  opacity = 1.0,
  color = null
} = {}) {
  const clipId = id || `clip-gfx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const theme = GRAPHIC_COLOR_THEMES.find(t => t.id === themeId) || GRAPHIC_COLOR_THEMES[0];

  // By default, documentary titles do NOT have background glass cards (floating clean directly over footage)
  const isDocType = ['doc_chapter', 'doc_stat', 'doc_date', 'doc_timeline', 'title_hero'].includes(graphicType);
  const resolvedBackdropGlass = backdropGlass !== null ? backdropGlass : (isDocType ? false : true);

  // Type specific color tuning if not explicitly passed
  let resolvedTextColor = textColor || theme.text;
  let resolvedAccentColor = accentColor || theme.accent;
  if (graphicType === 'doc_stat' && !accentColor) {
    resolvedAccentColor = '#facc15';
  } else if (graphicType === 'doc_date' && !textColor) {
    resolvedTextColor = '#22c55e';
  }

  return {
    id: clipId,
    trackId,
    name,
    isGraphic: true,
    startTime: Number(startTime.toFixed(2)),
    duration: Number(duration.toFixed(2)),
    color: color || theme.primary,
    graphicType,
    themeId,
    title,
    subtitle,
    badgeText,
    chapterPrefix,
    statNumber,
    statText,
    milestones: milestones ? milestones.map(m => ({ ...m })) : [],
    kpiValue,
    kpiLabel,
    kpiDelta,
    chartItems: [...chartItems],
    quoteAuthor,
    fontFamily,
    fontSize,
    textColor: resolvedTextColor,
    accentColor: resolvedAccentColor,
    bgColor: theme.bg,
    borderColor: theme.border,
    textShadowBlur,
    textShadowOffsetY,
    textShadowColor: textShadowColor || theme.shadow,
    textTransform,
    letterSpacing,
    backdropGlass: resolvedBackdropGlass,
    animation: {
      inType: animationIn,
      inDuration: animationInDuration,
      loopType: animationLoop,
      outType: animationOut,
      outDuration: animationOutDuration
    },
    position: {
      preset: presetPosition,
      x: posX,
      y: posY,
      scale
    },
    opacity
  };
}

/**
 * Calculates real-time animation values for a graphic clip at a specific timestamp
 */
export function computeGraphicAnimationState(clip, currentTime) {
  if (!clip || !clip.isGraphic) return { isVisible: false, opacity: 0, transform: '' };

  const start = clip.startTime;
  const end = clip.startTime + clip.duration;

  if (currentTime < start || currentTime > end) {
    return { isVisible: false, opacity: 0, transform: '' };
  }

  const timeInClip = currentTime - start;
  const timeRemaining = end - currentTime;

  const inDuration = clip.animation?.inDuration || 0.5;
  const outDuration = clip.animation?.outDuration || 0.5;
  const inType = clip.animation?.inType || 'slide-up';
  const loopType = clip.animation?.loopType || 'none';
  const outType = clip.animation?.outType || 'fade';

  let currentOpacity = clip.opacity !== undefined ? clip.opacity : 1.0;
  let offsetX = clip.position?.x || 0;
  let offsetY = clip.position?.y || 0;
  let scale = clip.position?.scale || 1.0;
  let rotate = 0;
  let typewriterRatio = 1.0;
  let isGlitching = false;

  // 1. IN ANIMATION PHASE
  if (timeInClip < inDuration && inDuration > 0) {
    const progress = Math.min(1, Math.max(0, timeInClip / inDuration));
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const easeBack = 1 + 2.7 * Math.pow(progress - 1, 3) + 1.7 * Math.pow(progress - 1, 2);

    switch (inType) {
      case 'fade':
        currentOpacity *= ease;
        break;
      case 'slide-up':
        currentOpacity *= ease;
        offsetY += (1 - ease) * 60;
        break;
      case 'slide-down':
        currentOpacity *= ease;
        offsetY -= (1 - ease) * 60;
        break;
      case 'slide-left':
        currentOpacity *= ease;
        offsetX += (1 - ease) * 80;
        break;
      case 'slide-right':
        currentOpacity *= ease;
        offsetX -= (1 - ease) * 80;
        break;
      case 'pop':
        currentOpacity *= Math.min(1, progress * 1.5);
        scale *= Math.max(0.2, easeBack);
        break;
      case 'bounce':
        currentOpacity *= Math.min(1, progress * 2);
        offsetY += Math.sin((1 - progress) * Math.PI * 2) * 25 * (1 - progress);
        break;
      case 'typewriter':
        typewriterRatio = progress;
        break;
      case 'glitch':
        if (progress < 0.7) {
          isGlitching = true;
          offsetX += (Math.random() - 0.5) * 12;
          offsetY += (Math.random() - 0.5) * 8;
        }
        currentOpacity *= progress > 0.1 ? 1 : 0.4;
        break;
      default:
        currentOpacity *= ease;
    }
  }
  // 2. OUT ANIMATION PHASE
  else if (timeRemaining < outDuration && outDuration > 0) {
    const outProgress = Math.min(1, Math.max(0, (outDuration - timeRemaining) / outDuration));
    const easeIn = Math.pow(outProgress, 2);

    switch (outType) {
      case 'fade':
        currentOpacity *= (1 - easeIn);
        break;
      case 'slide-down':
        currentOpacity *= (1 - easeIn);
        offsetY += easeIn * 60;
        break;
      case 'slide-up':
        currentOpacity *= (1 - easeIn);
        offsetY -= easeIn * 60;
        break;
      case 'zoom-out':
        currentOpacity *= (1 - easeIn);
        scale *= (1 - easeIn * 0.35);
        break;
      default:
        currentOpacity *= (1 - easeIn);
    }
  }
  // 3. SUSTAIN / AMBIENT LOOP PHASE
  else {
    const loopT = timeInClip - inDuration;
    if (loopType === 'pulse') {
      const pulseFactor = Math.sin(loopT * 3.5) * 0.025;
      scale *= (1 + pulseFactor);
    } else if (loopType === 'float') {
      offsetY += Math.sin(loopT * 2.2) * 5;
    }
  }

  return {
    isVisible: currentOpacity > 0.01,
    opacity: currentOpacity,
    offsetX,
    offsetY,
    scale,
    rotate,
    typewriterRatio,
    isGlitching
  };
}

/**
 * Draws a high-resolution graphic overlay directly onto an HTML Canvas (2D Context)
 * Used by renderEngine for preview playback and video WebM export!
 */
export function drawGraphicCanvas(ctx, clip, currentTime, canvasWidth, canvasHeight) {
  if (!ctx || !clip || !clip.isGraphic) return;

  const anim = computeGraphicAnimationState(clip, currentTime);
  if (!anim.isVisible || anim.opacity <= 0) return;

  // Normalized reference scale: base 1280 (or 720 for vertical 9:16)
  const isVertical = canvasHeight > canvasWidth;
  const refW = isVertical ? 720 : 1280;
  const s = canvasWidth / refW;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, anim.opacity));

  const centerX = canvasWidth / 2 + anim.offsetX * s;
  const centerY = canvasHeight / 2 + anim.offsetY * s;

  ctx.translate(centerX, centerY);
  ctx.scale(anim.scale * s, anim.scale * s);
  if (anim.rotate) ctx.rotate((anim.rotate * Math.PI) / 180);

  const fontFam = clip.fontFamily || 'Outfit';
  const fontSize = clip.fontSize || 42;
  const accentColor = clip.accentColor || '#06b6d4';
  const textColor = clip.textColor || '#ffffff';
  const shadowBlur = clip.textShadowBlur !== undefined ? clip.textShadowBlur : 18;
  const shadowOffsetY = clip.textShadowOffsetY !== undefined ? clip.textShadowOffsetY : 4;
  const isDocType = ['doc_chapter', 'doc_stat', 'doc_date', 'doc_timeline'].includes(clip.graphicType);
  const defaultShadow = isDocType ? 'rgba(0, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.85)';
  const shadowColor = clip.textShadowColor || defaultShadow;

  let titleText = clip.title || '';
  if (clip.textTransform === 'uppercase') {
    titleText = titleText.toUpperCase();
  }
  if (anim.typewriterRatio < 1.0) {
    const charsToShow = Math.floor(titleText.length * anim.typewriterRatio);
    titleText = titleText.substring(0, charsToShow);
  }

  // Draw Specific Graphic Sub-Types
  switch (clip.graphicType) {
    case 'doc_chapter': {
      // Documentary Chapter Title directly on footage
      const prefix = clip.chapterPrefix !== undefined ? clip.chapterPrefix : (clip.badgeText || 'Capítulo 1:');
      const mainTitle = titleText || 'El auge del dinero digital';
      const subTitle = clip.subtitle;

      const prefixFont = `600 ${Math.max(18, Math.round(fontSize * 0.52))}px ${fontFam}, sans-serif`;
      const titleFont = `800 ${fontSize}px ${fontFam}, sans-serif`;
      const subFont = `500 ${Math.max(14, Math.round(fontSize * 0.38))}px ${fontFam}, sans-serif`;

      const prefixH = prefix ? Math.round(fontSize * 0.6) : 0;
      const titleH = fontSize;
      const subH = subTitle ? Math.round(fontSize * 0.45) : 0;
      const totalH = prefixH + titleH + (subTitle ? subH + 10 : 0);

      // Backdrop card if enabled
      if (clip.backdropGlass) {
        ctx.font = titleFont;
        const mainW = ctx.measureText(mainTitle).width;
        let maxW = mainW;
        if (prefix) {
          ctx.font = prefixFont;
          maxW = Math.max(maxW, ctx.measureText(prefix).width);
        }
        if (subTitle) {
          ctx.font = subFont;
          maxW = Math.max(maxW, ctx.measureText(subTitle).width);
        }
        const cardW = Math.min(920, Math.max(380, maxW + 64));
        const cardH = totalH + 40;
        drawRoundedBox(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16, clip.bgColor || 'rgba(0, 0, 0, 0.65)', clip.borderColor || 'rgba(255, 255, 255, 0.15)');
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let curY = -totalH / 2 + (prefix ? prefixH / 2 : titleH / 2);

      // 1. Chapter Prefix
      if (prefix) {
        ctx.font = prefixFont;
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = Math.round(shadowBlur * 0.8);
        ctx.shadowOffsetY = 2;
        ctx.shadowOffsetX = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(prefix, 0, curY);
        curY += (prefixH / 2 + titleH / 2 + 4);
      }

      // 2. Main Title
      ctx.font = titleFont;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetY = shadowOffsetY;
      ctx.shadowOffsetX = 0;
      ctx.fillStyle = textColor || '#ffffff';
      if ('letterSpacing' in ctx && clip.letterSpacing) {
        ctx.letterSpacing = `${clip.letterSpacing}px`;
      }
      ctx.fillText(mainTitle, 0, curY);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      // 3. Subtitle
      if (subTitle) {
        curY += (titleH / 2 + subH / 2 + 10);
        ctx.font = subFont;
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        ctx.shadowOffsetX = 0;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(subTitle, 0, curY);
      }
      break;
    }

    case 'doc_stat': {
      // Impact Number / Statistic Title directly on footage
      const numPart = clip.statNumber !== undefined ? clip.statNumber : (clip.kpiValue || '');
      const textPart = clip.statText !== undefined ? clip.statText : '';
      const subTitle = clip.subtitle;
      const statColor = clip.accentColor || '#facc15';
      const labelColor = clip.textColor || statColor;
      const statFontSize = Math.round(fontSize * 1.18);
      const statFont = `800 ${statFontSize}px ${fontFam}, sans-serif`;
      const subFont = `500 ${Math.max(14, Math.round(fontSize * 0.38))}px ${fontFam}, sans-serif`;

      ctx.font = statFont;
      let totalW = 0;
      let numW = 0;
      const gap = 12;

      if (numPart && textPart) {
        numW = ctx.measureText(numPart).width;
        const textW = ctx.measureText(textPart).width;
        totalW = numW + gap + textW;
      } else {
        const full = titleText || `${numPart} ${textPart}`.trim() || '800.000.000 de personas';
        totalW = ctx.measureText(full).width;
      }

      // Backdrop card if enabled
      if (clip.backdropGlass) {
        const cardW = Math.min(960, Math.max(360, totalW + 64));
        const cardH = statFontSize + (subTitle ? Math.round(fontSize * 0.5) + 30 : 36);
        drawRoundedBox(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16, clip.bgColor || 'rgba(0, 0, 0, 0.65)', clip.borderColor || 'rgba(250, 204, 21, 0.3)');
      }

      const centerYOffset = subTitle ? -Math.round(fontSize * 0.22) : 0;

      ctx.textBaseline = 'middle';
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetY = shadowOffsetY;
      ctx.shadowOffsetX = 0;

      if ('letterSpacing' in ctx && clip.letterSpacing) {
        ctx.letterSpacing = `${clip.letterSpacing}px`;
      }

      if (numPart && textPart) {
        ctx.textAlign = 'left';
        ctx.fillStyle = statColor;
        ctx.fillText(numPart, -totalW / 2, centerYOffset);

        ctx.fillStyle = labelColor;
        ctx.fillText(textPart, -totalW / 2 + numW + gap, centerYOffset);
      } else {
        const full = titleText || `${numPart} ${textPart}`.trim() || '800.000.000 de personas';
        ctx.textAlign = 'center';
        ctx.fillStyle = statColor;
        ctx.fillText(full, 0, centerYOffset);
      }

      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      if (subTitle) {
        ctx.font = subFont;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        ctx.fillText(subTitle, 0, centerYOffset + statFontSize * 0.65 + 10);
      }
      break;
    }

    case 'doc_date': {
      // Historical Date Title directly on footage
      const dateText = titleText || '15 Septiembre 2008';
      const dateColor = clip.textColor || clip.accentColor || '#22c55e';
      const subTitle = clip.subtitle;
      const dateFontSize = Math.round(fontSize * 1.15);
      const dateFont = `800 ${dateFontSize}px ${fontFam}, sans-serif`;
      const subFont = `600 ${Math.max(15, Math.round(fontSize * 0.42))}px ${fontFam}, sans-serif`;

      ctx.font = dateFont;
      const textW = ctx.measureText(dateText).width;

      if (clip.backdropGlass) {
        const cardW = Math.min(920, Math.max(340, textW + 64));
        const cardH = dateFontSize + (subTitle ? Math.round(fontSize * 0.5) + 30 : 36);
        drawRoundedBox(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16, clip.bgColor || 'rgba(0, 0, 0, 0.65)', clip.borderColor || 'rgba(34, 197, 94, 0.3)');
      }

      const centerYOffset = subTitle ? -Math.round(fontSize * 0.22) : 0;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = dateFont;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetY = shadowOffsetY;
      ctx.shadowOffsetX = 0;
      ctx.fillStyle = dateColor;

      if ('letterSpacing' in ctx && clip.letterSpacing) {
        ctx.letterSpacing = `${clip.letterSpacing}px`;
      }
      ctx.fillText(dateText, 0, centerYOffset);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      if (subTitle) {
        ctx.font = subFont;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        ctx.fillText(subTitle, 0, centerYOffset + dateFontSize * 0.65 + 8);
      }
      break;
    }

    case 'doc_timeline': {
      const timelineW = 760;
      const startX = -timelineW / 2;
      const endX = timelineW / 2;
      const lineY = 0;
      const timelineColor = clip.accentColor || '#0284c7';

      if (clip.backdropGlass) {
        drawRoundedBox(ctx, -420, -75, 840, 150, 18, clip.bgColor || 'rgba(8, 16, 32, 0.75)', clip.borderColor || 'rgba(56, 189, 248, 0.3)');
      }

      // 1. Glowing horizontal timeline axis
      const lineGrad = ctx.createLinearGradient(startX, 0, endX, 0);
      lineGrad.addColorStop(0, 'rgba(2, 132, 199, 0)');
      lineGrad.addColorStop(0.12, timelineColor);
      lineGrad.addColorStop(0.88, timelineColor);
      lineGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 4;
      ctx.shadowColor = timelineColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(startX, lineY);
      ctx.lineTo(endX, lineY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 2. Milestones
      const milestones = clip.milestones && clip.milestones.length > 0 ? clip.milestones : [
        { date: '1975', label: 'Homebrew Club', active: false },
        { date: '1976', label: 'Apple I', active: false },
        { date: '1981', label: 'IBM PC', active: true }
      ];

      const step = milestones.length > 1 ? (timelineW * 0.8) / (milestones.length - 1) : 0;
      const mStartX = -(milestones.length - 1) * step / 2;

      milestones.forEach((m, idx) => {
        const mx = mStartX + idx * step;

        // Node Circle on the axis
        ctx.beginPath();
        ctx.arc(mx, lineY, m.active ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = m.active ? '#38bdf8' : timelineColor;
        ctx.shadowColor = m.active ? '#38bdf8' : 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = m.active ? 14 : 6;
        ctx.fill();

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Year / Date Above in Italic Bold
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = `italic 800 ${Math.max(22, Math.round(fontSize * 0.65))}px ${fontFam}, sans-serif`;
        ctx.fillStyle = m.active ? '#38bdf8' : '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 3;
        ctx.fillText(m.date || '', mx, lineY - 16);

        // Label Below
        ctx.textBaseline = 'top';
        ctx.font = `600 ${Math.max(12, Math.round(fontSize * 0.35))}px ${fontFam}, sans-serif`;
        ctx.fillStyle = '#f1f5f9';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 2;
        ctx.fillText(m.label || '', mx, lineY + 18);
      });
      break;
    }

    case 'kpi_metric': {
      // Background Card
      if (clip.backdropGlass !== false) {
        drawRoundedBox(ctx, -260, -90, 520, 180, 16, clip.bgColor || 'rgba(10, 15, 30, 0.85)', clip.borderColor || 'rgba(6, 182, 212, 0.35)');
      }

      // Metric Value (Hero Number)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${fontSize * 1.5}px ${fontFam}, sans-serif`;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.fillStyle = accentColor;
      ctx.fillText(clip.kpiValue || '100%', 0, -18);

      // Label & Delta
      ctx.shadowBlur = 0;
      ctx.font = `600 ${Math.max(16, fontSize * 0.42)}px ${fontFam}, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.fillText(clip.kpiLabel || clip.title || '', 0, 36);

      if (clip.kpiDelta) {
        ctx.font = `500 ${Math.max(13, fontSize * 0.34)}px ${fontFam}, sans-serif`;
        ctx.fillStyle = '#34d399';
        ctx.fillText(clip.kpiDelta, 0, 62);
      }
      break;
    }

    case 'chart_bar': {
      // Statistics Bar Chart Card
      const cardW = 540;
      const cardH = 260;
      if (clip.backdropGlass !== false) {
        drawRoundedBox(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16, clip.bgColor || 'rgba(10, 15, 30, 0.88)', clip.borderColor || 'rgba(6, 182, 212, 0.35)');
      }

      // Title & Subtitle at top of card
      ctx.textAlign = 'left';
      ctx.font = `700 20px ${fontFam}, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.fillText(titleText, -cardW / 2 + 28, -cardH / 2 + 36);

      if (clip.subtitle) {
        ctx.font = `400 13px ${fontFam}, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(clip.subtitle, -cardW / 2 + 28, -cardH / 2 + 56);
      }

      // Bars
      const items = clip.chartItems || [
        { label: 'Q1', value: 40, color: '#06b6d4' },
        { label: 'Q2', value: 75, color: '#38bdf8' },
        { label: 'Q3', value: 95, color: '#6366f1' },
        { label: 'Q4', value: 130, color: '#a855f7' }
      ];
      const maxVal = Math.max(...items.map(i => i.value || 10), 10);
      const chartBottomY = cardH / 2 - 38;
      const chartHeight = 110;
      const slotW = (cardW - 60) / items.length;
      const barW = Math.min(48, slotW * 0.55);

      items.forEach((item, idx) => {
        const itemX = -cardW / 2 + 30 + idx * slotW + (slotW - barW) / 2;
        const barH = (item.value / maxVal) * chartHeight;
        const barY = chartBottomY - barH;

        // Bar fill with gradient
        const barGrad = ctx.createLinearGradient(0, barY, 0, chartBottomY);
        barGrad.addColorStop(0, item.color || accentColor);
        barGrad.addColorStop(1, 'rgba(15, 23, 42, 0.6)');

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(itemX, barY, barW, barH, [6, 6, 0, 0]);
        } else {
          ctx.rect(itemX, barY, barW, barH);
        }
        ctx.fill();

        // Top value
        ctx.textAlign = 'center';
        ctx.font = `600 12px ${fontFam}, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.fillText(item.value.toString(), itemX + barW / 2, barY - 6);

        // Bottom label
        ctx.font = `500 11px ${fontFam}, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(item.label, itemX + barW / 2, chartBottomY + 16);
      });
      break;
    }

    case 'chart_line': {
      // Trend Curve
      const cardW = 540;
      const cardH = 260;
      if (clip.backdropGlass !== false) {
        drawRoundedBox(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16, clip.bgColor || 'rgba(10, 15, 30, 0.88)', clip.borderColor || 'rgba(6, 182, 212, 0.35)');
      }

      ctx.textAlign = 'left';
      ctx.font = `700 20px ${fontFam}, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.fillText(titleText, -cardW / 2 + 28, -cardH / 2 + 36);

      if (clip.subtitle) {
        ctx.font = `400 13px ${fontFam}, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(clip.subtitle, -cardW / 2 + 28, -cardH / 2 + 56);
      }

      const items = clip.chartItems || [
        { label: 'Ene', value: 20 },
        { label: 'Feb', value: 45 },
        { label: 'Mar', value: 38 },
        { label: 'Abr', value: 80 },
        { label: 'May', value: 92 },
        { label: 'Jun', value: 125 }
      ];
      const maxVal = Math.max(...items.map(i => i.value || 10), 10);
      const startX = -cardW / 2 + 45;
      const endX = cardW / 2 - 45;
      const chartBottomY = cardH / 2 - 38;
      const chartHeight = 110;
      const stepX = (endX - startX) / (items.length - 1);

      // Points
      const points = items.map((it, idx) => ({
        x: startX + idx * stepX,
        y: chartBottomY - (it.value / maxVal) * chartHeight,
        item: it
      }));

      // Draw glowing line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const xc = (points[i].x + points[i - 1].x) / 2;
        const yc = (points[i].y + points[i - 1].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw points & labels
      points.forEach(pt => {
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.font = `500 11px ${fontFam}, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(pt.item.label, pt.x, chartBottomY + 16);
      });
      break;
    }

    case 'chart_donut': {
      // Donut Chart
      const cardW = 500;
      const cardH = 240;
      if (clip.backdropGlass !== false) {
        drawRoundedBox(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16, clip.bgColor || 'rgba(10, 15, 30, 0.88)', clip.borderColor || 'rgba(6, 182, 212, 0.35)');
      }

      const ringCenterX = -cardW / 2 + 130;
      const ringCenterY = 0;
      const radius = 64;
      const strokeW = 16;

      // Track ring
      ctx.beginPath();
      ctx.arc(ringCenterX, ringCenterY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = strokeW;
      ctx.stroke();

      // Active arc (e.g. 78%)
      const pct = parseFloat(clip.kpiValue) || 75;
      const arcAngle = (pct / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(ringCenterX, ringCenterY, radius, -Math.PI / 2, -Math.PI / 2 + arcAngle);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Center stat
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 26px ${fontFam}, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.fillText(`${pct}%`, ringCenterX, ringCenterY);

      // Legend on Right
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 20px ${fontFam}, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.fillText(titleText, -cardW / 2 + 230, -32);

      ctx.font = `400 14px ${fontFam}, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(clip.subtitle || clip.kpiLabel || 'Participación / Métrica Total', -cardW / 2 + 230, -2);
      break;
    }

    case 'lower_third': {
      // Lower Third Bar
      const ltw = 520;
      const lth = 78;
      const ltx = -ltw / 2;
      const lty = -lth / 2;

      // Pill Background
      drawRoundedBox(ctx, ltx, lty, ltw, lth, 14, clip.bgColor || 'rgba(10, 15, 30, 0.92)', clip.borderColor || 'rgba(6, 182, 212, 0.45)');

      // Glowing left accent indicator
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(ltx + 4, lty + 6, 8, lth - 12, 4);
      } else {
        ctx.rect(ltx + 4, lty + 6, 8, lth - 12);
      }
      ctx.fill();

      // Name & Subtitle
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 22px ${fontFam}, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur / 2;
      ctx.fillText(titleText, ltx + 28, lty + 34);

      ctx.shadowBlur = 0;
      ctx.font = `500 14px ${fontFam}, sans-serif`;
      ctx.fillStyle = accentColor;
      ctx.fillText(clip.subtitle || '', ltx + 28, lty + 58);
      break;
    }

    case 'quote_callout': {
      // Quote Card
      const qW = 580;
      const qH = 160;
      if (clip.backdropGlass !== false) {
        drawRoundedBox(ctx, -qW / 2, -qH / 2, qW, qH, 16, clip.bgColor || 'rgba(12, 18, 36, 0.88)', clip.borderColor || 'rgba(6, 182, 212, 0.35)');
      }

      // Quote symbol
      ctx.textAlign = 'left';
      ctx.font = `800 50px serif`;
      ctx.fillStyle = accentColor;
      ctx.fillText('“', -qW / 2 + 24, -qH / 2 + 48);

      // Quote text
      ctx.font = `italic 600 18px ${fontFam}, sans-serif`;
      ctx.fillStyle = textColor;
      wrapText(ctx, titleText, -qW / 2 + 58, -qH / 2 + 40, qW - 85, 24);

      // Author at bottom
      if (clip.quoteAuthor || clip.subtitle) {
        ctx.textAlign = 'right';
        ctx.font = `600 13px ${fontFam}, sans-serif`;
        ctx.fillStyle = accentColor;
        ctx.fillText(`— ${clip.quoteAuthor || clip.subtitle}`, qW / 2 - 28, qH / 2 - 22);
      }
      break;
    }

    case 'title_hero':
    default: {
      // Hero Title (Centered, impactful, cinematic)
      const subTitle = clip.subtitle;

      // Optional Category Badge
      if (clip.badgeText) {
        ctx.font = `700 11px ${fontFam}, sans-serif`;
        const badgeTextW = ctx.measureText(clip.badgeText.toUpperCase()).width;
        const badgeW = Math.max(80, badgeTextW + 24);
        drawRoundedBox(ctx, -badgeW / 2, -fontSize * 0.7 - 26, badgeW, 22, 11, 'rgba(6, 182, 212, 0.2)', accentColor);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = accentColor;
        ctx.shadowBlur = 0;
        ctx.fillText(clip.badgeText.toUpperCase(), 0, -fontSize * 0.7 - 15);
      }

      // Backdrop card if enabled
      if (clip.backdropGlass) {
        ctx.font = `800 ${fontSize}px ${fontFam}, sans-serif`;
        const mainW = ctx.measureText(titleText).width;
        const cardW = Math.min(820, Math.max(340, mainW + 64));
        const cardH = fontSize + (subTitle ? Math.round(fontSize * 0.5) + 36 : 40);
        drawRoundedBox(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 18, clip.bgColor || 'rgba(10, 15, 30, 0.85)', clip.borderColor || 'rgba(6, 182, 212, 0.35)');
      }

      // Big Title with Shadow
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${fontSize}px ${fontFam}, sans-serif`;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetY = shadowOffsetY;
      ctx.shadowOffsetX = 0;
      ctx.fillStyle = textColor;
      if ('letterSpacing' in ctx && clip.letterSpacing) {
        ctx.letterSpacing = `${clip.letterSpacing}px`;
      }
      ctx.fillText(titleText, 0, 0);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      // Subtitle below
      if (subTitle) {
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.font = `500 ${Math.max(16, Math.round(fontSize * 0.42))}px ${fontFam}, sans-serif`;
        ctx.fillStyle = accentColor;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
        ctx.fillText(subTitle, 0, fontSize * 0.65 + 10);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      }
      break;
    }
  }

  ctx.restore();
}

/**
 * Utility: draws a rounded rectangle with fill and stroke
 */
function drawRoundedBox(ctx, x, y, w, h, radius, fillColor, strokeColor) {
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Utility: wraps text to fit within a maxWidth
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = (text || '').split(' ');
  let line = '';
  let curY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}

/**
 * Renders a graphic clip to a Data URL image snapshot for thumbnails
 */
export function renderGraphicSnapshot(clip, width = 640, height = 360) {
  if (typeof document === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Dark canvas background
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, width, height);

    // Draw at midpoint of duration to capture full entrance
    const midTime = clip.startTime + (clip.duration / 2);
    drawGraphicCanvas(ctx, clip, midTime, width, height);

    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    console.error('Failed to render graphic snapshot:', err);
    return '';
  }
}
