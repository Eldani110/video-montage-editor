/**
 * Timeline Operations & Smart Track Insertion
 * Automatically separates audio from video clips and manages track lanes.
 */
import { getCachedWaveform } from './audioWaveform';


/**
 * Checks if a track has no overlapping clips during [startTime, startTime + duration]
 */
export function isTrackFreeAtTime(track, startTime, duration) {
  if (!track || !track.clips || track.clips.length === 0) return true;
  const endTime = startTime + duration;

  return !track.clips.some((clip) => {
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    // Overlap condition:
    return startTime < clipEnd - 0.05 && endTime > clipStart + 0.05;
  });
}

/**
 * Adds an asset to the timeline, separating audio for videos and placing
 * it on the next available or new audio track.
 */
export function addAssetToTimeline(project, asset, targetTrackId = null, preferredStartTime = 0) {
  const isVideo = asset.type === 'video';
  const isAudio = asset.type === 'audio';
  const cachedWf = getCachedWaveform(asset.id || asset.url);
  const effectiveAssetDuration = (cachedWf && cachedWf.duration > 0) ? cachedWf.duration : asset.duration;
  const duration = Number((effectiveAssetDuration || (isAudio ? 10 : 5)).toFixed(2));
  const startTime = Number(Math.max(0, preferredStartTime).toFixed(2));

  let tracks = [...(project.tracks || [])];

  if (isVideo) {
    // 1. Determine Video Track
    let videoTrack = tracks.find(t => t.id === targetTrackId && t.type === 'video' && !t.locked);
    if (!videoTrack) {
      // Find a video track that is free at this timestamp
      videoTrack = tracks.find(t => t.type === 'video' && !t.locked && isTrackFreeAtTime(t, startTime, duration));
      if (!videoTrack) {
        // Fallback to first unlocked video track
        videoTrack = tracks.find(t => t.type === 'video' && !t.locked) || tracks.find(t => t.type === 'video');
      }
    }

    if (!videoTrack) {
      videoTrack = {
        id: `track-v-${Date.now()}`,
        name: 'V1 (Video)',
        type: 'video',
        visible: true,
        muted: false,
        locked: false,
        clips: []
      };
      tracks = [videoTrack, ...tracks];
    }

    const videoClipId = 'clip_v_' + Date.now();
    const audioClipId = 'clip_a_' + Date.now();

    const videoClip = {
      id: videoClipId,
      assetId: asset.id,
      trackId: videoTrack.id,
      name: asset.name.replace(/\.[^/.]+$/, ''),
      startTime: startTime,
      duration: duration,
      fit: 'cover',
      scale: 1,
      opacity: 1,
      color: '#6366f1',
      linkedClipId: audioClipId
    };

    // 2. Separate Audio: Find free audio track or create a new one automatically
    const audioTracks = tracks.filter(t => t.type === 'audio');
    let targetAudioTrack = audioTracks.find(t => isTrackFreeAtTime(t, startTime, duration));

    if (!targetAudioTrack) {
      // All existing audio tracks are occupied during this time!
      const nextIndex = audioTracks.length + 1;
      targetAudioTrack = {
        id: `track-a-${Date.now()}`,
        name: `A${nextIndex} (Audio Video)`,
        type: 'audio',
        visible: true,
        muted: false,
        locked: false,
        clips: []
      };
      // Append the new audio track
      tracks.push(targetAudioTrack);
    }

    const audioClip = {
      id: audioClipId,
      assetId: asset.id,
      trackId: targetAudioTrack.id,
      name: `${asset.name.replace(/\.[^/.]+$/, '')} (Audio)`,
      startTime: startTime,
      duration: duration,
      volume: 1,
      color: '#06b6d4',
      linkedClipId: videoClipId
    };

    // Add clips to respective tracks
    tracks = tracks.map((t) => {
      if (t.id === videoTrack.id && t.id === targetAudioTrack.id) {
        return { ...t, clips: [...t.clips, videoClip, audioClip] };
      }
      if (t.id === videoTrack.id) {
        return { ...t, clips: [...t.clips, videoClip] };
      }
      if (t.id === targetAudioTrack.id) {
        return { ...t, clips: [...t.clips, audioClip] };
      }
      return t;
    });

    const newDuration = Math.max(project.settings?.duration || 20, Math.ceil(startTime + duration + 4));

    return {
      updatedProject: {
        ...project,
        settings: {
          ...project.settings,
          duration: newDuration
        },
        tracks
      },
      selectedClipId: videoClipId
    };
  } else if (isAudio) {
    // Audio Asset Dropped / Added
    const audioTracks = tracks.filter(t => t.type === 'audio');
    let targetAudioTrack = null;

    if (targetTrackId) {
      targetAudioTrack = tracks.find(t => t.id === targetTrackId && t.type === 'audio');
    }

    let finalStartTime = startTime;

    // 1. If no target audio track provided, try to find an audio track free at preferred startTime
    if (!targetAudioTrack) {
      targetAudioTrack = audioTracks.find(t => !t.locked && isTrackFreeAtTime(t, finalStartTime, duration));
    }

    // 2. If still no track is free at preferred startTime, place on the first available audio track right after existing clips
    if (!targetAudioTrack && audioTracks.length > 0) {
      targetAudioTrack = audioTracks.find(t => !t.locked) || audioTracks[0];
      const trackClips = targetAudioTrack.clips || [];
      if (trackClips.length > 0) {
        const lastClipEnd = Math.max(...trackClips.map(c => c.startTime + c.duration));
        finalStartTime = Number(lastClipEnd.toFixed(2));
      }
    }

    // 3. If targetAudioTrack exists and finalStartTime collides with any clip on it, nudge to the end of conflicting clip (side-by-side)
    if (targetAudioTrack && !isTrackFreeAtTime(targetAudioTrack, finalStartTime, duration)) {
      const conflicting = (targetAudioTrack.clips || []).filter(c => {
        const cStart = c.startTime;
        const cEnd = c.startTime + c.duration;
        return finalStartTime < cEnd - 0.05 && (finalStartTime + duration) > cStart + 0.05;
      });
      if (conflicting.length > 0) {
        const latestEnd = Math.max(...conflicting.map(c => c.startTime + c.duration));
        finalStartTime = Number(latestEnd.toFixed(2));
      }
    }

    // 4. Only create a brand new audio track if absolutely NO audio tracks exist in the project
    if (!targetAudioTrack) {
      const nextIndex = audioTracks.length + 1;
      targetAudioTrack = {
        id: `track-a-${Date.now()}`,
        name: `A${nextIndex} (Pista)`,
        type: 'audio',
        visible: true,
        muted: false,
        locked: false,
        clips: []
      };
      tracks.push(targetAudioTrack);
    }

    const newClip = {
      id: 'clip_a_' + Date.now(),
      assetId: asset.id,
      trackId: targetAudioTrack.id,
      name: asset.name.replace(/\.[^/.]+$/, ''),
      startTime: finalStartTime,
      duration: duration,
      volume: 1,
      color: '#06b6d4'
    };

    tracks = tracks.map((t) => {
      if (t.id === targetAudioTrack.id) {
        return { ...t, clips: [...t.clips, newClip] };
      }
      return t;
    });

    const newDuration = Math.max(project.settings?.duration || 20, Math.ceil(finalStartTime + duration + 4));

    return {
      updatedProject: {
        ...project,
        settings: {
          ...project.settings,
          duration: newDuration
        },
        tracks
      },
      selectedClipId: newClip.id
    };
  } else {
    // Image Asset
    let visualTrack = tracks.find(t => t.id === targetTrackId && (t.type === 'video' || t.type === 'graphics') && !t.locked);
    if (!visualTrack) {
      visualTrack = tracks.find(t => (t.type === 'video' || t.type === 'graphics') && !t.locked && isTrackFreeAtTime(t, startTime, duration));
      if (!visualTrack) {
        visualTrack = tracks.find(t => t.type === 'video' && !t.locked) || tracks.find(t => t.type === 'graphics' && !t.locked) || tracks.find(t => t.type === 'video');
      }
    }

    if (!visualTrack) {
      visualTrack = {
        id: `track-v-${Date.now()}`,
        name: 'V1 (Video)',
        type: 'video',
        visible: true,
        muted: false,
        locked: false,
        clips: []
      };
      tracks = [visualTrack, ...tracks];
    }

    const newClip = {
      id: 'clip_v_' + Date.now(),
      assetId: asset.id,
      trackId: visualTrack.id,
      name: asset.name.replace(/\.[^/.]+$/, ''),
      startTime: startTime,
      duration: duration,
      fit: 'cover',
      scale: 1,
      opacity: 1,
      color: '#6366f1'
    };

    tracks = tracks.map((t) => {
      if (t.id === visualTrack.id) {
        return { ...t, clips: [...t.clips, newClip] };
      }
      return t;
    });

    const newDuration = Math.max(project.settings?.duration || 20, Math.ceil(startTime + duration + 4));

    return {
      updatedProject: {
        ...project,
        settings: {
          ...project.settings,
          duration: newDuration
        },
        tracks
      },
      selectedClipId: newClip.id
    };
  }
}

/**
 * Calculates layer stacking priority rank for tracks (e.g. V2 = 20, V1 = 10)
 */
export function getTrackLayerRank(track, trackIndex = 0, totalTracks = 1) {
  if (!track) return 10;
  const str = `${track.name || ''} ${track.id || ''}`;
  const match = str.match(/\bv(\d+)\b/i) || str.match(/v(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) * 10;
  }
  if (/b-roll|overlay|superposici/i.test(str)) {
    return 20;
  }
  return Math.max(1, totalTracks - trackIndex) * 10;
}

/**
 * Normalizes and validates any incoming project structure, unwrapping envelopes (projectData)
 * and guaranteeing that id, name, settings, tracks array, assets array, scenes, and transcript exist.
 */
export function normalizeProject(raw) {
  if (!raw) return null;
  // If wrapped in projectData envelope (from file scanner, directory scans, or cached objects)
  const p = raw.projectData ? {
    ...raw.projectData,
    id: raw.id || raw.projectData.id,
    name: raw.name || raw.projectData.name,
    fileHandle: raw.fileHandle || raw.projectData.fileHandle,
    fileName: raw.fileName || raw.projectData.fileName,
    directoryName: raw.directoryName || raw.projectData.directoryName
  } : raw;

  const defaultTracks = [
    { id: 'track-v1', name: 'V1 (Video / Fotos)', type: 'video', visible: true, muted: false, locked: false, clips: [] },
    { id: 'track-a1', name: 'A1 (Audio Principal)', type: 'audio', visible: true, muted: false, locked: false, clips: [] }
  ];

  return {
    ...p,
    id: p.id || 'proj_' + Date.now(),
    name: p.name || 'Sin título',
    version: p.version || 1,
    directoryName: p.directoryName || null,
    settings: {
      duration: 20,
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      fps: 30,
      ...(p.settings || {})
    },
    tracks: Array.isArray(p.tracks) && p.tracks.length > 0 ? p.tracks.map(t => ({
      ...t,
      clips: Array.isArray(t.clips) ? t.clips : []
    })) : defaultTracks,
    assets: Array.isArray(p.assets) ? p.assets : [],
    scenes: p.scenes && Array.isArray(p.scenes.list) ? p.scenes : { list: [], summary: null, rhythmProfile: null },
    transcript: p.transcript || { segments: [], rawText: '' },
    updatedAt: p.updatedAt || new Date().toISOString()
  };
}

/**
 * Sanitizes project tracks by removing duplicate clips for the same scene across different video tracks.
 * Automatically keeps the clip on the highest layer track (e.g. V2 over V1).
 */
export function sanitizeDuplicateSceneClips(project) {
  if (!project) return null;
  const normalized = normalizeProject(project);
  if (!normalized?.tracks) return normalized;

  const videoTracks = normalized.tracks.filter(t => t.type === 'video');
  if (videoTracks.length <= 1) return normalized;

  // Sort tracks by rank descending (higher layer tracks like V2 evaluated first)
  const rankedTracks = [...videoTracks].sort((a, b) => getTrackLayerRank(b) - getTrackLayerRank(a));

  const seenScenes = new Map();
  let hasDuplicates = false;

  for (const track of rankedTracks) {
    for (const clip of (track.clips || [])) {
      let sceneKey = clip.sceneId;
      if (!sceneKey && clip.name) {
        const match = clip.name.match(/\[E(\d+)\]/);
        if (match) sceneKey = `scene_e${match[1]}`;
      }
      if (sceneKey) {
        if (seenScenes.has(sceneKey)) {
          hasDuplicates = true;
        } else {
          seenScenes.set(sceneKey, { trackId: track.id, clipId: clip.id });
        }
      }
    }
  }

  if (!hasDuplicates) return normalized;

  const updatedTracks = normalized.tracks.map(track => {
    if (track.type !== 'video') return track;
    return {
      ...track,
      clips: (track.clips || []).filter(clip => {
        let sceneKey = clip.sceneId;
        if (!sceneKey && clip.name) {
          const match = clip.name.match(/\[E(\d+)\]/);
          if (match) sceneKey = `scene_e${match[1]}`;
        }
        if (sceneKey && seenScenes.has(sceneKey)) {
          const keeper = seenScenes.get(sceneKey);
          if (keeper.trackId !== track.id || keeper.clipId !== clip.id) {
            return false;
          }
        }
        return true;
      })
    };
  });

  return {
    ...normalized,
    tracks: updatedTracks
  };
}

/**
 * Separates audio from a video clip into an independent audio track.
 * The video clip and the new audio clip become 100% independent resources.
 * If the video is deleted, moved, hidden, or covered, the audio continues to play normally.
 */
export function separateAudioFromClip(project, clipId) {
  if (!project || !clipId) return { updatedProject: project, newAudioClipId: null };

  let foundClip = null;
  let foundTrack = null;

  for (const track of (project.tracks || [])) {
    const c = (track.clips || []).find(x => x.id === clipId);
    if (c) {
      foundClip = c;
      foundTrack = track;
      break;
    }
  }

  if (!foundClip || !foundTrack) {
    return { updatedProject: project, newAudioClipId: null };
  }

  const asset = (project.assets || []).find(a => a.id === foundClip.assetId);
  const startTime = foundClip.startTime;
  const duration = foundClip.duration;
  const sourceStart = foundClip.sourceStart || 0;
  const originalVolume = foundClip.volume !== undefined ? foundClip.volume : 1.0;

  let tracks = [...project.tracks];

  // 1. Find a free audio track at this time interval, or create a new audio track
  const audioTracks = tracks.filter(t => t.type === 'audio');
  let targetAudioTrack = audioTracks.find(t => isTrackFreeAtTime(t, startTime, duration));

  if (!targetAudioTrack) {
    const nextNum = audioTracks.length + 1;
    targetAudioTrack = {
      id: `track-a-${Date.now()}`,
      name: `A${nextNum} (Audio)`,
      type: 'audio',
      visible: true,
      muted: false,
      locked: false,
      volume: 1.0,
      clips: []
    };
    tracks.push(targetAudioTrack);
  }

  // 2. Create independent audio asset in project.assets
  const audioAssetId = `asset_audio_${Date.now()}`;
  const baseName = (foundClip.name || asset?.name || 'Audio').replace(/\.[^/.]+$/, '').replace(/\s*\(Audio\)$/i, '');
  const audioAsset = {
    id: audioAssetId,
    name: `${baseName} (Pista Audio)`,
    type: 'audio',
    url: asset?.url || '',
    duration: asset?.duration || duration,
    sourceAssetId: asset?.id || null,
    isExtractedWav: false,
    isVideoContainerAudio: true,
    createdAt: new Date().toISOString()
  };

  const updatedAssets = [...(project.assets || [])];
  if (!updatedAssets.some(a => a.id === audioAssetId)) {
    updatedAssets.push(audioAsset);
  }

  // 3. Create independent audio clip
  const newAudioClipId = `clip_a_${Date.now()}`;
  const newAudioClip = {
    id: newAudioClipId,
    assetId: audioAssetId,
    trackId: targetAudioTrack.id,
    name: `${baseName} (Audio)`,
    startTime: startTime,
    duration: duration,
    sourceStart: sourceStart,
    volume: originalVolume,
    muted: false,
    color: '#06b6d4',
    linkedClipId: null // 100% independent!
  };

  // 4. Update the video clip to mute it and mark as separated
  const updatedVideoClip = {
    ...foundClip,
    audioSeparated: true,
    muted: true,
    volume: 0,
    linkedClipId: null // 100% independent!
  };

  tracks = tracks.map(t => {
    if (t.id === foundTrack.id && t.id === targetAudioTrack.id) {
      return {
        ...t,
        clips: t.clips.map(c => c.id === foundClip.id ? updatedVideoClip : c).concat(newAudioClip)
      };
    }
    if (t.id === foundTrack.id) {
      return {
        ...t,
        clips: t.clips.map(c => c.id === foundClip.id ? updatedVideoClip : c)
      };
    }
    if (t.id === targetAudioTrack.id) {
      return {
        ...t,
        clips: [...t.clips, newAudioClip]
      };
    }
    return t;
  });

  return {
    updatedProject: {
      ...project,
      assets: updatedAssets,
      tracks
    },
    newAudioClipId,
    audioAssetId,
    sourceAsset: asset
  };
}

/**
 * Unlinks linked clips (breaks pairing) so they can be moved, trimmed or deleted completely independently.
 */
export function unlinkClips(project, clipId) {
  if (!project || !clipId) return project;

  const tracks = project.tracks.map(t => ({
    ...t,
    clips: t.clips.map(c => {
      if (c.id === clipId || c.linkedClipId === clipId) {
        return { ...c, linkedClipId: null };
      }
      return c;
    })
  }));

  return { ...project, tracks };
}

