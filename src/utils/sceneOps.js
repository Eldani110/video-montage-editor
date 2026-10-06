/**
 * Scene Operations and Timeline Scene Track Integration
 * Embeds AI-generated scenes into project metadata and dedicated timeline tracks.
 */

/**
 * Applies AI-generated scenes to a project, creating or updating the scene track on the timeline.
 * @param {object} project Current project object
 * @param {Array<object>} scenes List of scene objects from sceneDirectorAgent
 * @param {object} metadata Additional metadata (summary, rhythmProfile, thinking)
 * @returns {object} Updated project
 */
export function applyScenesToProject(project, scenes, metadata = {}) {
  if (!scenes || scenes.length === 0) return project;

  const sceneClips = scenes.map((s, idx) => ({
    id: s.id || `scene_clip_${Date.now()}_${idx}`,
    sceneNumber: s.sceneNumber,
    name: `[E${s.sceneNumber}] ${s.title}`,
    title: s.title,
    text: s.scriptText,
    visualType: s.visualType, // 'video' | 'image'
    visualDescription: s.visualDescription,
    searchKeywords: s.searchKeywords || [],
    startTime: s.startTime,
    duration: s.duration,
    color: s.color || (s.visualType === 'video' ? '#06b6d4' : '#6366f1')
  }));

  let tracks = [...(project.tracks || [])];
  const existingSceneIndex = tracks.findIndex(t => t.type === 'scene');

  const sceneTrack = {
    id: existingSceneIndex >= 0 ? tracks[existingSceneIndex].id : 'track-scenes-storyboard',
    name: 'Escenas IA (Storyboard)',
    type: 'scene',
    visible: true,
    locked: false,
    clips: sceneClips
  };

  if (existingSceneIndex >= 0) {
    tracks[existingSceneIndex] = sceneTrack;
  } else {
    // If guide track exists, insert right next to guide track for cohesive visual planning
    const guideIndex = tracks.findIndex(t => t.type === 'guide');
    if (guideIndex >= 0) {
      tracks.splice(guideIndex + 1, 0, sceneTrack);
    } else {
      tracks = [sceneTrack, ...tracks];
    }
  }

  const lastScene = scenes[scenes.length - 1];
  const sceneMaxTime = lastScene ? lastScene.endTime : 20;
  const newDuration = Math.max(project.settings?.duration || 20, Math.ceil(sceneMaxTime));

  return {
    ...project,
    settings: {
      ...project.settings,
      duration: newDuration
    },
    scenes: {
      list: scenes,
      summary: metadata.summary || null,
      rhythmProfile: metadata.rhythmProfile || null,
      thinking: metadata.thinking || null,
      updatedAt: new Date().toISOString()
    },
    tracks
  };
}

/**
 * Removes the AI scene track and project scene metadata.
 * @param {object} project Current project object
 * @returns {object} Updated project
 */
export function clearScenesFromProject(project) {
  const updatedTracks = (project.tracks || []).filter(t => t.type !== 'scene');
  const { scenes, ...rest } = project;
  return {
    ...rest,
    tracks: updatedTracks
  };
}

/**
 * Deletes a single scene from the project by its ID and updates the scene track.
 * @param {object} project Current project object
 * @param {string} sceneId ID of the scene to delete
 * @returns {object} Updated project
 */
export function deleteSingleScene(project, sceneId) {
  const targetScene = (project.scenes?.list || []).find(s => s.id === sceneId);
  const remainingScenes = (project.scenes?.list || []).filter(s => s.id !== sceneId);
  const sceneNum = targetScene?.sceneNumber;

  const isMatchingClip = (c) => {
    if (c.id === sceneId || c.sceneId === sceneId) return true;
    if (sceneNum && (c.name?.startsWith(`[E${sceneNum}]`) || c.name?.startsWith(`[E${sceneNum} `))) return true;
    return false;
  };

  const updatedTracks = (project.tracks || []).map(t => {
    if (t.type === 'scene' || t.type === 'video') {
      return {
        ...t,
        clips: (t.clips || []).filter(c => !isMatchingClip(c))
      };
    }
    return t;
  });

  return {
    ...project,
    scenes: {
      ...project.scenes,
      list: remainingScenes
    },
    tracks: updatedTracks
  };
}

/**
 * Removes the AI transcript guide track from the timeline.
 * @param {object} project Current project object
 * @returns {object} Updated project
 */
export function clearGuideTrackFromProject(project) {
  const updatedTracks = (project.tracks || []).filter(t => t.type !== 'guide');
  return {
    ...project,
    tracks: updatedTracks
  };
}

/**
 * Deletes any track from the project by its trackId. If it's a scene track, also clears project.scenes.
 * @param {object} project Current project object
 * @param {string} trackId ID of track to delete
 * @returns {object} Updated project
 */
export function deleteTrackFromProject(project, trackId) {
  const targetTrack = (project.tracks || []).find(t => t.id === trackId);
  let updatedProject = {
    ...project,
    tracks: (project.tracks || []).filter(t => t.id !== trackId)
  };
  if (targetTrack?.type === 'scene') {
    const { scenes, ...rest } = updatedProject;
    updatedProject = rest;
  }
  return updatedProject;
}

/**
 * Clears all clips from all tracks on the timeline, giving a clean slate.
 * @param {object} project Current project object
 * @returns {object} Updated project
 */
export function clearTimelineClips(project) {
  const updatedTracks = (project.tracks || []).map(t => ({
    ...t,
    clips: []
  }));
  const { scenes, ...rest } = project;
  return {
    ...rest,
    tracks: updatedTracks
  };
}

