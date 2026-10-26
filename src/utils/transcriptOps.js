/**
 * Transcript Management, Guide Track, and Interactive Subtitles / Captions Engine
 * Creates and updates the dedicated guide track ("Línea Guía") and synchronizes
 * visible, editable subtitles ("S1 (Subtítulos)") on the video & timeline.
 */

import { createGraphicClip, SUBTITLE_STYLE_PRESETS } from './graphicEngine.js';

export const SUBTITLE_TRACK_ID = 'track-subtitles-1';

export const SUBTITLE_STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'textColor',
  'accentColor',
  'bgColor',
  'strokeColor',
  'strokeWidth',
  'textTransform',
  'backdropGlass',
  'highlightWordMode',
  'subtitleStyle',
  'letterSpacing',
  'textShadowBlur',
  'textShadowOffsetY',
  'textShadowColor',
  'animation',
  'animationIn',
  'animationInDuration',
  'animationLoop',
  'animationOut',
  'animationOutDuration',
  'position',
  'positionX',
  'positionY',
  'scale',
  'boxWidth',
  'opacity',
  'color'
];

/**
 * Determines whether a given clip or track is a subtitle
 */
export function isSubtitleClip(clip, track = null) {
  if (!clip) return false;
  return Boolean(
    clip.isSubtitle ||
    clip.graphicType === 'subtitle_caption' ||
    (track && (track.isSubtitleTrack || track.id === SUBTITLE_TRACK_ID)) ||
    clip.trackId === SUBTITLE_TRACK_ID
  );
}

/**
 * Resolves default subtitle settings adapted to project aspect ratio (9:16 vertical vs 16:9 horizontal)
 */
export function getDefaultSubtitleSettings(project) {
  const aspect = project?.settings?.aspectRatio || '16:9';
  const isVertical = aspect === '9:16' || aspect === '4:5';
  const preset = SUBTITLE_STYLE_PRESETS[0]; // hormozi_active

  return {
    enabled: false,
    applyToAll: true, // CapCut style: editing a subtitle applies style to all other subtitles
    styleId: preset.id,
    fontFamily: preset.fontFamily,
    fontSize: isVertical ? 40 : 38,
    textColor: preset.textColor,
    accentColor: preset.accentColor,
    bgColor: preset.bgColor,
    strokeColor: preset.strokeColor,
    strokeWidth: preset.strokeWidth,
    textTransform: preset.textTransform,
    backdropGlass: preset.backdropGlass,
    highlightWordMode: preset.highlightWordMode,
    posX: 0,
    posY: isVertical ? 320 : 235,
    scale: 1.0,
    boxWidth: isVertical ? 605 : 960,
    chunkMode: 'smart', // 'smart' (5-7 words per caption) | 'segment' (exact segment)
    ...(project?.subtitleSettings || {})
  };
}

/**
 * Splits a transcript segment into readable caption chunks if 'smart' chunkMode is active
 */
function buildCaptionChunksFromSegments(segments, chunkMode = 'smart') {
  const chunks = [];

  segments.forEach((seg, idx) => {
    const segId = seg.id || `seg_${idx}`;
    const start = Number(seg.startTime !== undefined ? seg.startTime : (seg.start || 0));
    const dur = Number(seg.duration !== undefined ? seg.duration : Math.max(0.5, (seg.end || start + 2) - start));
    const rawText = String(seg.text || seg.name || '').trim();
    if (!rawText) return;

    const words = rawText.split(/\s+/).filter(Boolean);
    if (chunkMode !== 'smart' || words.length <= 8) {
      chunks.push({
        id: `sub_${segId}_0`,
        segmentId: segId,
        text: rawText,
        startTime: Number(start.toFixed(2)),
        duration: Number(Math.max(0.4, dur).toFixed(2))
      });
      return;
    }

    // Split into balanced 5-6 word chunks proportional to word count
    const maxWordsPerChunk = 6;
    const numChunks = Math.ceil(words.length / maxWordsPerChunk);
    const wordsPerChunk = Math.ceil(words.length / numChunks);

    let cursorTime = start;
    for (let c = 0; c < numChunks; c++) {
      const slice = words.slice(c * wordsPerChunk, (c + 1) * wordsPerChunk);
      if (slice.length === 0) continue;
      const ratio = slice.length / words.length;
      const chunkDur = c === numChunks - 1
        ? Math.max(0.35, (start + dur) - cursorTime)
        : Math.max(0.35, dur * ratio);

      chunks.push({
        id: `sub_${segId}_${c}`,
        segmentId: segId,
        text: slice.join(' '),
        startTime: Number(cursorTime.toFixed(2)),
        duration: Number(chunkDur.toFixed(2))
      });
      cursorTime += chunkDur;
    }
  });

  return chunks;
}

/**
 * Applies transcription segments to a project as a dedicated guide track,
 * and optionally generates visible subtitles on S1 (Subtítulos).
 */
export function applyTranscriptToProject(project, segments, assetId = null, options = {}) {
  if (!segments || segments.length === 0) return project;

  const normalizedSegments = segments.map((seg, idx) => {
    const start = Number(seg.start !== undefined ? seg.start : (seg.startTime || 0));
    const end = Number(seg.end !== undefined ? seg.end : (start + (seg.duration || 2)));
    return {
      id: seg.id || `guide_clip_${Date.now()}_${idx}`,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      text: String(seg.text || seg.name || '').trim()
    };
  });

  const guideClips = normalizedSegments.map((seg) => ({
    id: seg.id,
    assetId: assetId || null,
    name: seg.text,
    text: seg.text,
    startTime: seg.start,
    duration: Number(Math.max(0.4, seg.end - seg.start).toFixed(2)),
    color: '#8b5cf6' // Amethyst purple for guide track
  }));

  let tracks = [...(project.tracks || [])];
  const existingGuideIndex = tracks.findIndex(t => t.type === 'guide');

  const guideTrack = {
    id: existingGuideIndex >= 0 ? tracks[existingGuideIndex].id : 'track-guide-transcript',
    name: 'Guion (Línea Guía)',
    type: 'guide',
    visible: true,
    locked: false,
    clips: guideClips
  };

  if (existingGuideIndex >= 0) {
    tracks[existingGuideIndex] = guideTrack;
  } else {
    tracks = [guideTrack, ...tracks];
  }

  const lastSegment = normalizedSegments[normalizedSegments.length - 1];
  const transcriptMaxTime = lastSegment ? lastSegment.end + 2 : 20;
  const newDuration = Math.max(project.settings?.duration || 20, Math.ceil(transcriptMaxTime));

  let updatedProject = {
    ...project,
    settings: {
      ...project.settings,
      duration: newDuration
    },
    transcript: {
      assetId,
      segments: normalizedSegments,
      updatedAt: new Date().toISOString()
    },
    tracks
  };

  if (options.enableSubtitles || project?.subtitleSettings?.enabled) {
    updatedProject = generateSubtitlesTrackFromTranscript(updatedProject, {
      ...(project?.subtitleSettings || {}),
      enabled: true
    });
  }

  return updatedProject;
}

/**
 * Generates or updates the visible S1 (Subtítulos) track from the project's transcript
 */
export function generateSubtitlesTrackFromTranscript(project, customSettings = {}) {
  const guideTrack = (project.tracks || []).find(t => t.type === 'guide');
  const rawSegments = guideTrack?.clips?.length
    ? guideTrack.clips
    : (project.transcript?.segments || []);

  if (!rawSegments || rawSegments.length === 0) return project;

  const existingSubTrack = (project.tracks || []).find(
    t => t.id === SUBTITLE_TRACK_ID || t.isSubtitleTrack
  );
  const sampleClip = (existingSubTrack?.clips || []).find(c => c.isSubtitle || c.graphicType === 'subtitle_caption') || existingSubTrack?.clips?.[0];
  const inheritedClipStyles = sampleClip ? {
    styleId: sampleClip.subtitleStyle || sampleClip.styleId,
    fontFamily: sampleClip.fontFamily,
    fontSize: sampleClip.fontSize,
    textColor: sampleClip.textColor,
    accentColor: sampleClip.accentColor,
    bgColor: sampleClip.bgColor,
    strokeColor: sampleClip.strokeColor,
    strokeWidth: sampleClip.strokeWidth,
    textTransform: sampleClip.textTransform,
    backdropGlass: sampleClip.backdropGlass,
    highlightWordMode: sampleClip.highlightWordMode,
    posX: sampleClip.position?.x ?? sampleClip.posX,
    posY: sampleClip.position?.y ?? sampleClip.posY,
    scale: sampleClip.position?.scale ?? sampleClip.scale,
    boxWidth: sampleClip.boxWidth ?? sampleClip.position?.boxWidth
  } : {};
  Object.keys(inheritedClipStyles).forEach(k => {
    if (inheritedClipStyles[k] === undefined || inheritedClipStyles[k] === null) {
      delete inheritedClipStyles[k];
    }
  });

  const settings = {
    ...getDefaultSubtitleSettings(project),
    ...inheritedClipStyles,
    ...(project.subtitleSettings || {}),
    ...customSettings,
    enabled: true
  };

  const chunks = buildCaptionChunksFromSegments(rawSegments, settings.chunkMode || 'smart');

  const subtitleClips = chunks.map((chunk) =>
    createGraphicClip({
      id: chunk.id,
      trackId: SUBTITLE_TRACK_ID,
      name: `Sub: ${chunk.text.slice(0, 28)}`,
      startTime: chunk.startTime,
      duration: chunk.duration,
      graphicType: 'subtitle_caption',
      isSubtitle: true,
      segmentId: chunk.segmentId,
      subtitleStyle: settings.styleId || 'hormozi_active',
      title: chunk.text,
      fontFamily: settings.fontFamily || 'Montserrat',
      fontSize: Number(settings.fontSize || 40),
      textColor: settings.textColor || '#ffffff',
      accentColor: settings.accentColor || '#facc15',
      bgColor: settings.bgColor || 'rgba(8, 12, 22, 0.82)',
      strokeColor: settings.strokeColor || '#000000',
      strokeWidth: settings.strokeWidth !== undefined ? Number(settings.strokeWidth) : 5,
      textTransform: settings.textTransform || 'none',
      backdropGlass: Boolean(settings.backdropGlass),
      highlightWordMode: settings.highlightWordMode !== false,
      animationIn: 'pop',
      animationInDuration: 0.14,
      animationLoop: 'none',
      animationOut: 'fade',
      animationOutDuration: 0.1,
      presetPosition: 'custom',
      posX: Number(settings.posX || 0),
      posY: Number(settings.posY !== undefined ? settings.posY : 235),
      scale: Number(settings.scale || 1.0),
      boxWidth: Number(settings.boxWidth || (project?.settings?.aspectRatio === '9:16' ? 605 : 960)),
      color: '#eab308'
    })
  );

  let tracks = [...(project.tracks || [])];
  const existingSubIdx = tracks.findIndex(
    t => t.id === SUBTITLE_TRACK_ID || t.isSubtitleTrack
  );

  const subtitleTrack = {
    id: existingSubIdx >= 0 ? tracks[existingSubIdx].id : SUBTITLE_TRACK_ID,
    name: 'S1 (Subtítulos)',
    type: 'graphics',
    isSubtitleTrack: true,
    visible: true,
    locked: false,
    clips: subtitleClips
  };

  if (existingSubIdx >= 0) {
    tracks[existingSubIdx] = subtitleTrack;
  } else {
    // Insert right below the guide track (or at top of graphics tracks)
    const guideIdx = tracks.findIndex(t => t.type === 'guide');
    if (guideIdx >= 0) {
      tracks.splice(guideIdx + 1, 0, subtitleTrack);
    } else {
      tracks = [subtitleTrack, ...tracks];
    }
  }

  return {
    ...project,
    subtitleSettings: settings,
    tracks
  };
}

/**
 * Toggles visibility of the subtitle track on the video, generating it if it doesn't exist yet
 */
export function toggleSubtitlesTrackVisibility(project, forceVisible = null) {
  const existingSubTrack = (project.tracks || []).find(
    t => t.id === SUBTITLE_TRACK_ID || t.isSubtitleTrack
  );

  if (!existingSubTrack || (existingSubTrack.clips || []).length === 0) {
    return generateSubtitlesTrackFromTranscript(project, { enabled: true });
  }

  const nextVisible = forceVisible !== null ? forceVisible : !existingSubTrack.visible;
  return {
    ...project,
    subtitleSettings: {
      ...getDefaultSubtitleSettings(project),
      ...(project.subtitleSettings || {}),
      enabled: nextVisible
    },
    tracks: (project.tracks || []).map(t =>
      t.id === existingSubTrack.id ? { ...t, visible: nextVisible } : t
    )
  };
}

/**
 * Updates a global subtitle style setting and applies it to all subtitle clips on the timeline
 */
export function applyGlobalSubtitleStyle(project, stylePatch = {}) {
  const currentSettings = getDefaultSubtitleSettings(project);
  let nextSettings = { ...currentSettings, ...stylePatch };

  // If switching preset styleId, merge preset defaults unless overridden in stylePatch
  if (stylePatch.styleId) {
    const preset = SUBTITLE_STYLE_PRESETS.find(p => p.id === stylePatch.styleId);
    if (preset) {
      nextSettings = {
        ...nextSettings,
        styleId: preset.id,
        fontFamily: stylePatch.fontFamily || preset.fontFamily,
        fontSize: stylePatch.fontSize || preset.fontSize,
        textColor: stylePatch.textColor || preset.textColor,
        accentColor: stylePatch.accentColor || preset.accentColor,
        bgColor: stylePatch.bgColor || preset.bgColor,
        strokeColor: stylePatch.strokeColor || preset.strokeColor,
        strokeWidth: stylePatch.strokeWidth !== undefined ? stylePatch.strokeWidth : preset.strokeWidth,
        textTransform: stylePatch.textTransform || preset.textTransform,
        backdropGlass: stylePatch.backdropGlass !== undefined ? stylePatch.backdropGlass : preset.backdropGlass,
        highlightWordMode: stylePatch.highlightWordMode !== undefined ? stylePatch.highlightWordMode : preset.highlightWordMode
      };
    }
  }

  // If chunkMode changed, regenerate subtitle clips from transcript
  if (stylePatch.chunkMode && stylePatch.chunkMode !== currentSettings.chunkMode) {
    return generateSubtitlesTrackFromTranscript(project, nextSettings);
  }

  const updatedTracks = (project.tracks || []).map(track => {
    const hasSubtitles = track.id === SUBTITLE_TRACK_ID || track.isSubtitleTrack ||
      (track.clips || []).some(c => c.isSubtitle || c.graphicType === 'subtitle_caption');
    if (!hasSubtitles) return track;

    return {
      ...track,
      clips: (track.clips || []).map(clip => {
        if (!clip.isSubtitle && clip.graphicType !== 'subtitle_caption') return clip;
        return {
          ...clip,
          subtitleStyle: nextSettings.styleId,
          fontFamily: nextSettings.fontFamily,
          fontSize: Number(nextSettings.fontSize),
          textColor: nextSettings.textColor,
          accentColor: nextSettings.accentColor,
          bgColor: nextSettings.bgColor,
          strokeColor: nextSettings.strokeColor,
          strokeWidth: Number(nextSettings.strokeWidth),
          textTransform: nextSettings.textTransform,
          backdropGlass: Boolean(nextSettings.backdropGlass),
          highlightWordMode: Boolean(nextSettings.highlightWordMode),
          letterSpacing: stylePatch.letterSpacing !== undefined ? stylePatch.letterSpacing : (clip.letterSpacing || 0.5),
          textShadowBlur: stylePatch.textShadowBlur !== undefined ? stylePatch.textShadowBlur : clip.textShadowBlur,
          textShadowOffsetY: stylePatch.textShadowOffsetY !== undefined ? stylePatch.textShadowOffsetY : clip.textShadowOffsetY,
          textShadowColor: stylePatch.textShadowColor !== undefined ? stylePatch.textShadowColor : clip.textShadowColor,
          animation: stylePatch.animation ? { ...(clip.animation || {}), ...stylePatch.animation } : clip.animation,
          animationIn: stylePatch.animationIn || clip.animationIn,
          animationInDuration: stylePatch.animationInDuration !== undefined ? stylePatch.animationInDuration : clip.animationInDuration,
          animationLoop: stylePatch.animationLoop || clip.animationLoop,
          animationOut: stylePatch.animationOut || clip.animationOut,
          animationOutDuration: stylePatch.animationOutDuration !== undefined ? stylePatch.animationOutDuration : clip.animationOutDuration,
          opacity: stylePatch.opacity !== undefined ? stylePatch.opacity : (clip.opacity ?? 1.0),
          position: {
            ...(clip.position || {}),
            preset: 'custom',
            x: nextSettings.posX !== undefined ? Number(nextSettings.posX) : (clip.position?.x || 0),
            y: nextSettings.posY !== undefined ? Number(nextSettings.posY) : (clip.position?.y || 235),
            scale: nextSettings.scale !== undefined ? Number(nextSettings.scale) : (clip.position?.scale || 1.0)
          }
        };
      })
    };
  });

  return {
    ...project,
    subtitleSettings: nextSettings,
    tracks: updatedTracks
  };
}

/**
 * Updates a subtitle clip with CapCut-style batch propagation support.
 * When applyToAll is active (true by default), style, color, typography, outline, animation,
 * and position changes are synchronized to all other subtitle clips, while preserving their
 * individual texts and timings.
 */
export function updateSubtitleClipWithBatchSync(project, clipId, updates = {}, forceApplyToAll = null) {
  if (!project) return project;

  const currentSettings = getDefaultSubtitleSettings(project);
  const applyToAll = forceApplyToAll !== null
    ? forceApplyToAll
    : (updates._applyToAll !== undefined
        ? Boolean(updates._applyToAll)
        : (project.subtitleSettings?.applyToAll !== false));

  // Remove internal flags from clean updates
  const cleanUpdates = { ...updates };
  delete cleanUpdates._applyToAll;

  // Extract style/visual properties that can be propagated
  const stylePatch = {};
  SUBTITLE_STYLE_KEYS.forEach(key => {
    if (cleanUpdates[key] !== undefined) {
      stylePatch[key] = cleanUpdates[key];
    }
  });

  // Extract position properties
  const posX = cleanUpdates.position?.x !== undefined ? cleanUpdates.position.x : cleanUpdates.positionX;
  const posY = cleanUpdates.position?.y !== undefined ? cleanUpdates.position.y : cleanUpdates.positionY;
  const posScale = cleanUpdates.position?.scale !== undefined ? cleanUpdates.position.scale : cleanUpdates.scale;
  const boxWidth = cleanUpdates.position?.boxWidth !== undefined ? cleanUpdates.position.boxWidth : cleanUpdates.boxWidth;

  // If subtitle preset styleId changed, merge preset styles into stylePatch
  if (cleanUpdates.subtitleStyle) {
    stylePatch.subtitleStyle = cleanUpdates.subtitleStyle;
    const preset = SUBTITLE_STYLE_PRESETS.find(p => p.id === cleanUpdates.subtitleStyle);
    if (preset) {
      if (cleanUpdates.fontFamily === undefined) stylePatch.fontFamily = preset.fontFamily;
      if (cleanUpdates.fontSize === undefined) stylePatch.fontSize = preset.fontSize;
      if (cleanUpdates.textColor === undefined) stylePatch.textColor = preset.textColor;
      if (cleanUpdates.accentColor === undefined) stylePatch.accentColor = preset.accentColor;
      if (cleanUpdates.bgColor === undefined) stylePatch.bgColor = preset.bgColor;
      if (cleanUpdates.strokeColor === undefined) stylePatch.strokeColor = preset.strokeColor;
      if (cleanUpdates.strokeWidth === undefined) stylePatch.strokeWidth = preset.strokeWidth;
      if (cleanUpdates.textTransform === undefined) stylePatch.textTransform = preset.textTransform;
      if (cleanUpdates.backdropGlass === undefined) stylePatch.backdropGlass = preset.backdropGlass;
      if (cleanUpdates.highlightWordMode === undefined) stylePatch.highlightWordMode = preset.highlightWordMode;
    }
  }

  const hasStyleUpdates = Object.keys(stylePatch).length > 0 || posX !== undefined || posY !== undefined || posScale !== undefined || boxWidth !== undefined;
  let targetClipFound = null;

  const updatedTracks = (project.tracks || []).map(track => {
    const isSubTrack = track.id === SUBTITLE_TRACK_ID || track.isSubtitleTrack;
    return {
      ...track,
      clips: (track.clips || []).map(clip => {
        if (clip.id === clipId) {
          targetClipFound = clip;
          const merged = { ...clip, ...cleanUpdates, ...stylePatch };
          if (cleanUpdates.title !== undefined || cleanUpdates.text !== undefined) {
            const txt = cleanUpdates.title !== undefined ? cleanUpdates.title : cleanUpdates.text;
            merged.title = txt;
            merged.text = txt;
            merged.name = `Sub: ${String(txt).slice(0, 28)}`;
          }
          if (cleanUpdates.position) {
            merged.position = { ...(clip.position || {}), ...cleanUpdates.position };
          }
          if (posX !== undefined) merged.positionX = posX;
          if (posY !== undefined) merged.positionY = posY;
          if (posScale !== undefined) merged.scale = posScale;
          if (boxWidth !== undefined) merged.boxWidth = boxWidth;
          return merged;
        }

        // If applyToAll is enabled and this other clip is also a subtitle, propagate style updates
        const isThisSub = isSubtitleClip(clip, track) || isSubTrack;
        if (applyToAll && hasStyleUpdates && isThisSub) {
          const updatedOther = { ...clip, ...stylePatch };
          if (cleanUpdates.position || posX !== undefined || posY !== undefined || posScale !== undefined) {
            updatedOther.position = {
              ...(clip.position || {}),
              ...(cleanUpdates.position || {}),
              ...(posX !== undefined ? { x: posX } : {}),
              ...(posY !== undefined ? { y: posY } : {}),
              ...(posScale !== undefined ? { scale: posScale } : {})
            };
            if (posX !== undefined) updatedOther.positionX = posX;
            if (posY !== undefined) updatedOther.positionY = posY;
            if (posScale !== undefined) updatedOther.scale = posScale;
            if (boxWidth !== undefined) updatedOther.boxWidth = boxWidth;
          }
          return updatedOther;
        }

        return clip;
      })
    };
  });

  // Synchronize project subtitleSettings
  let nextSubtitleSettings = {
    ...currentSettings,
    ...(project.subtitleSettings || {}),
    applyToAll
  };

  if (hasStyleUpdates) {
    nextSubtitleSettings = {
      ...nextSubtitleSettings,
      ...(stylePatch.subtitleStyle ? { styleId: stylePatch.subtitleStyle } : {}),
      ...(stylePatch.fontFamily ? { fontFamily: stylePatch.fontFamily } : {}),
      ...(stylePatch.fontSize ? { fontSize: stylePatch.fontSize } : {}),
      ...(stylePatch.textColor ? { textColor: stylePatch.textColor } : {}),
      ...(stylePatch.accentColor ? { accentColor: stylePatch.accentColor } : {}),
      ...(stylePatch.bgColor ? { bgColor: stylePatch.bgColor } : {}),
      ...(stylePatch.strokeColor ? { strokeColor: stylePatch.strokeColor } : {}),
      ...(stylePatch.strokeWidth !== undefined ? { strokeWidth: stylePatch.strokeWidth } : {}),
      ...(stylePatch.textTransform ? { textTransform: stylePatch.textTransform } : {}),
      ...(stylePatch.backdropGlass !== undefined ? { backdropGlass: stylePatch.backdropGlass } : {}),
      ...(stylePatch.highlightWordMode !== undefined ? { highlightWordMode: stylePatch.highlightWordMode } : {}),
      ...(posX !== undefined ? { posX: Number(posX) } : {}),
      ...(posY !== undefined ? { posY: Number(posY) } : {}),
      ...(posScale !== undefined ? { scale: Number(posScale) } : {}),
      ...(boxWidth !== undefined ? { boxWidth: Number(boxWidth) } : {})
    };
  }

  let nextProject = {
    ...project,
    subtitleSettings: nextSubtitleSettings,
    tracks: updatedTracks
  };

  // If text of target subtitle changed, sync with linked transcript segment and guide track
  const newText = cleanUpdates.title !== undefined ? cleanUpdates.title : cleanUpdates.text;
  if (targetClipFound && newText !== undefined) {
    // 1. Identify target segment ID: by direct link, or by time overlap with guide track clips / transcript segments
    let matchedSegId = targetClipFound.segmentId || targetClipFound.linkedClipId;

    const guideTrack = (nextProject.tracks || []).find(t => t.type === 'guide');
    const candidateSegments = guideTrack?.clips?.length
      ? guideTrack.clips
      : (nextProject.transcript?.segments || []);

    if (!matchedSegId && candidateSegments.length > 0) {
      const clipStart = targetClipFound.startTime || 0;
      const clipDur = targetClipFound.duration || 1;
      const clipEnd = clipStart + clipDur;

      let bestCand = null;
      let maxOverlap = -1;

      for (const cand of candidateSegments) {
        const cStart = cand.startTime !== undefined ? cand.startTime : (cand.start || 0);
        const cDur = cand.duration !== undefined ? cand.duration : Math.max(0.4, (cand.end || cStart + 1) - cStart);
        const cEnd = cStart + cDur;
        const overlap = Math.min(clipEnd, cEnd) - Math.max(clipStart, cStart);
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          bestCand = cand;
        }
      }

      if (bestCand && (maxOverlap > 0 || Math.abs(clipStart - (bestCand.startTime ?? bestCand.start)) < 1.0)) {
        matchedSegId = bestCand.id;
        targetClipFound.segmentId = matchedSegId;
      }
    }

    if (matchedSegId) {
      const updatedSegments = (nextProject.transcript?.segments || []).map(seg => {
        if (seg.id === matchedSegId) {
          return { ...seg, text: newText };
        }
        return seg;
      });

      const guideTracks = nextProject.tracks.map(t => {
        if (t.type !== 'guide') return t;
        return {
          ...t,
          clips: (t.clips || []).map(c => {
            if (c.id === matchedSegId || c.segmentId === matchedSegId) {
              return { ...c, text: newText, name: newText };
            }
            return c;
          })
        };
      });

      nextProject = {
        ...nextProject,
        tracks: guideTracks,
        transcript: nextProject.transcript ? {
          ...nextProject.transcript,
          segments: updatedSegments,
          updatedAt: new Date().toISOString()
        } : nextProject.transcript
      };
    }
  }

  return nextProject;
}

/**
 * Edits a transcript segment's text or timing and updates both Guide Track and linked Subtitles
 */
export function updateTranscriptSegmentAndSync(project, segmentId, updates = {}) {
  const newText = updates.text !== undefined ? String(updates.text) : (updates.title !== undefined ? String(updates.title) : undefined);
  const newStart = updates.startTime !== undefined ? Number(updates.startTime) : undefined;
  const newDuration = updates.duration !== undefined ? Math.max(0.3, Number(updates.duration)) : undefined;

  // Retrieve timing of target segment for fallback time-overlap matching
  const targetSeg = (project.tracks || []).flatMap(t => t.clips || []).find(c => c.id === segmentId)
    || (project.transcript?.segments || []).find(s => s.id === segmentId);
  const sStart = targetSeg ? (targetSeg.startTime !== undefined ? targetSeg.startTime : targetSeg.start) : null;
  const sDur = targetSeg ? (targetSeg.duration !== undefined ? targetSeg.duration : (targetSeg.end - targetSeg.start)) : null;
  const sEnd = (sStart !== null && sDur !== null) ? sStart + sDur : null;

  const updatedTracks = (project.tracks || []).map(track => {
    if (track.type === 'guide') {
      return {
        ...track,
        clips: (track.clips || []).map(clip => {
          if (clip.id !== segmentId && clip.segmentId !== segmentId) return clip;
          return {
            ...clip,
            ...(newText !== undefined ? { text: newText, name: newText } : {}),
            ...(newStart !== undefined ? { startTime: newStart } : {}),
            ...(newDuration !== undefined ? { duration: newDuration } : {})
          };
        })
      };
    }

    if (track.id === SUBTITLE_TRACK_ID || track.isSubtitleTrack) {
      // 1. Match by segmentId or ID
      let matching = (track.clips || []).filter(c => c.segmentId === segmentId || c.id === segmentId);

      // 2. Fallback to time overlap if segmentId wasn't stored
      if (matching.length === 0 && sStart !== null && sEnd !== null) {
        matching = (track.clips || []).filter(c => {
          const cStart = c.startTime || 0;
          const cEnd = cStart + (c.duration || 1);
          return Math.max(sStart, cStart) < Math.min(sEnd, cEnd) || Math.abs(sStart - cStart) < 0.35;
        });
      }

      const matchingIds = new Set(matching.map(m => m.id));

      if (matching.length === 1) {
        return {
          ...track,
          clips: (track.clips || []).map(clip => {
            if (!matchingIds.has(clip.id)) return clip;
            return {
              ...clip,
              segmentId: segmentId,
              ...(newText !== undefined ? { title: newText, text: newText, name: `Sub: ${newText.slice(0, 28)}` } : {}),
              ...(newStart !== undefined ? { startTime: newStart } : {}),
              ...(newDuration !== undefined ? { duration: newDuration } : {})
            };
          })
        };
      } else if (matching.length > 1 && newText !== undefined) {
        // Re-distribute words across matching chunks
        const words = newText.trim().split(/\s+/).filter(Boolean);
        const wordsPerClip = Math.max(1, Math.ceil(words.length / matching.length));
        let mIdx = 0;
        return {
          ...track,
          clips: (track.clips || []).map(clip => {
            if (!matchingIds.has(clip.id)) return clip;
            const slice = words.slice(mIdx * wordsPerClip, (mIdx + 1) * wordsPerClip).join(' ');
            mIdx++;
            const chunkText = slice || newText;
            return {
              ...clip,
              segmentId: segmentId,
              title: chunkText,
              text: chunkText,
              name: `Sub: ${chunkText.slice(0, 28)}`
            };
          })
        };
      }
    }

    return track;
  });

  const updatedTranscriptSegments = (project.transcript?.segments || []).map(seg => {
    if (seg.id !== segmentId) return seg;
    const start = newStart !== undefined ? newStart : seg.start;
    const end = newDuration !== undefined ? start + newDuration : seg.end;
    return {
      ...seg,
      ...(newText !== undefined ? { text: newText } : {}),
      start,
      end
    };
  });

  return {
    ...project,
    transcript: project.transcript
      ? {
          ...project.transcript,
          segments: updatedTranscriptSegments,
          updatedAt: new Date().toISOString()
        }
      : project.transcript,
    tracks: updatedTracks
  };
}
