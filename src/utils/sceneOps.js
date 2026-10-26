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

/**
 * Resolves the true start time and duration of a scene on the timeline,
 * prioritizing scene track clips, then video track clips, then scene metadata.
 * @param {object} scene Target scene object
 * @param {object} project Current project object
 * @param {object} specificClip Optional specific clip
 * @returns {{ startTime: number, duration: number, sceneNumber: number, sceneId: string|null, source: string }}
 */
export function resolveRealSceneTimelinePosition(scene, project, specificClip = null) {
  if (!project) {
    const sStart = typeof scene?.startTime === 'number' ? Number(scene.startTime.toFixed(2)) : 0;
    const sDur = typeof scene?.duration === 'number'
      ? Number(scene.duration.toFixed(2))
      : (typeof scene?.endTime === 'number' && scene.endTime > sStart ? Number((scene.endTime - sStart).toFixed(2)) : 4.0);
    return {
      startTime: sStart,
      duration: Math.max(0.5, sDur),
      sceneNumber: Number(scene?.sceneNumber || 1),
      sceneId: scene?.id || null,
      source: 'fallback'
    };
  }

  // 1. If a specific timeline clip was passed directly
  if (specificClip && typeof specificClip.startTime === 'number') {
    const sDur = typeof specificClip.duration === 'number' ? Number(specificClip.duration.toFixed(2)) : 4.0;
    return {
      startTime: Number(specificClip.startTime.toFixed(2)),
      duration: Math.max(0.5, sDur),
      sceneNumber: Number(specificClip.sceneNumber || scene?.sceneNumber || 1),
      sceneId: specificClip.sceneId || scene?.id || specificClip.id || null,
      source: 'passed_clip'
    };
  }

  const sNum = scene?.sceneNumber ? Number(scene.sceneNumber) : null;
  const sId = scene?.id;

  const clipMatchesScene = (c) => {
    if (!c) return false;
    if (sNum && Number(c.sceneNumber) === sNum) return true;
    if (sId && (c.sceneId === sId || c.id === sId)) return true;
    if (sNum && c.name) {
      const m = c.name.match(/\[E\s*0*(\d+)\]/i) || c.name.match(/\bEscena\s*0*(\d+)\b/i);
      if (m && Number(m[1]) === sNum) return true;
    }
    if (sNum && c.title) {
      const m = c.title.match(/\[E\s*0*(\d+)\]/i) || c.title.match(/\bEscena\s*0*(\d+)\b/i);
      if (m && Number(m[1]) === sNum) return true;
    }
    return false;
  };

  // 2. Look for the clip on the dedicated Scene Track first (track.type === 'scene')
  // The Scene track represents the master storyboard breakdown on the timeline!
  const sceneTrack = (project.tracks || []).find(t => t.type === 'scene');
  if (sceneTrack && Array.isArray(sceneTrack.clips)) {
    const sClip = sceneTrack.clips.find(c => clipMatchesScene(c));
    if (sClip && typeof sClip.startTime === 'number') {
      const sDur = typeof sClip.duration === 'number' ? Number(sClip.duration.toFixed(2)) : 4.0;
      return {
        startTime: Number(sClip.startTime.toFixed(2)),
        duration: Math.max(0.5, sDur),
        sceneNumber: Number(sClip.sceneNumber || sNum || 1),
        sceneId: sClip.sceneId || sClip.id || sId || null,
        source: 'scene_track'
      };
    }
  }

  // 3. Look for an existing clip on Video Tracks (e.g. V2, V1)
  const videoTracks = (project.tracks || []).filter(t => t.type === 'video');
  for (const vt of videoTracks) {
    const vClip = (vt.clips || []).find(c => clipMatchesScene(c));
    if (vClip && typeof vClip.startTime === 'number') {
      const vDur = typeof vClip.duration === 'number' ? Number(vClip.duration.toFixed(2)) : 4.0;
      return {
        startTime: Number(vClip.startTime.toFixed(2)),
        duration: Math.max(0.5, vDur),
        sceneNumber: Number(vClip.sceneNumber || sNum || 1),
        sceneId: vClip.sceneId || sId || null,
        source: 'video_track'
      };
    }
  }

  // 4. Fallback to scene's metadata/object only if no timeline clip was found on scene/video tracks
  if (typeof scene?.startTime === 'number' && !isNaN(scene.startTime)) {
    const sDur = typeof scene?.duration === 'number' && scene.duration > 0
      ? Number(scene.duration.toFixed(2))
      : (typeof scene?.endTime === 'number' && scene.endTime > scene.startTime ? Number((scene.endTime - scene.startTime).toFixed(2)) : 4.0);
    return {
      startTime: Number(scene.startTime.toFixed(2)),
      duration: Math.max(0.5, sDur),
      sceneNumber: Number(sNum || scene?.sceneNumber || 1),
      sceneId: sId || scene?.id || null,
      source: 'scene_object'
    };
  }

  // 5. Fallback to scene's metadata
  const metaStart = typeof scene?.startTime === 'number' ? Number(scene.startTime.toFixed(2)) : 0;
  const metaDur = typeof scene?.duration === 'number'
    ? Number(scene.duration.toFixed(2))
    : (typeof scene?.endTime === 'number' && scene.endTime > metaStart ? Number((scene.endTime - metaStart).toFixed(2)) : 4.0);

  return {
    startTime: metaStart,
    duration: Math.max(0.5, metaDur),
    sceneNumber: sNum || 1,
    sceneId: sId || null,
    source: 'metadata'
  };
}

