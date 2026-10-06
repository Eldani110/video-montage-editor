/**
 * Transcript Management and Guide Track Operations
 * Creates and updates the dedicated guide track ("Línea Guía") on the timeline.
 */

/**
 * Applies transcription segments to a project as a dedicated guide track.
 * @param {object} project Current project object
 * @param {Array<{ id: string, start: number, end: number, text: string }>} segments Transcribed segments
 * @param {string|null} assetId Source asset ID
 * @returns {object} Updated project
 */
export function applyTranscriptToProject(project, segments, assetId = null) {
  if (!segments || segments.length === 0) return project;

  const guideClips = segments.map((seg, idx) => ({
    id: seg.id || `guide_clip_${Date.now()}_${idx}`,
    assetId: assetId || null,
    name: seg.text,
    text: seg.text,
    startTime: Number(seg.start.toFixed(2)),
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
    // Insert guide track at the top for prominent visual guidance
    tracks = [guideTrack, ...tracks];
  }

  // Calculate new duration if transcript extends further
  const lastSegment = segments[segments.length - 1];
  const transcriptMaxTime = lastSegment ? lastSegment.end + 2 : 20;
  const newDuration = Math.max(project.settings?.duration || 20, Math.ceil(transcriptMaxTime));

  return {
    ...project,
    settings: {
      ...project.settings,
      duration: newDuration
    },
    transcript: {
      assetId,
      segments,
      updatedAt: new Date().toISOString()
    },
    tracks
  };
}
