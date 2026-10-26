/**
 * Timeline Operations & Smart Track Insertion
 * Automatically separates audio from video clips and manages track lanes.
 */
import { getCachedWaveform } from './audioWaveform.js';
import { resolveRealSceneTimelinePosition } from './sceneOps.js';


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
  let effectiveAssetDuration = (cachedWf && cachedWf.duration > 0) ? cachedWf.duration : asset.duration;
  let duration = Number((effectiveAssetDuration || (isAudio ? 10 : 5)).toFixed(2));
  let startTime = Number(Math.max(0, preferredStartTime).toFixed(2));

  // If this asset was downloaded for/associated with a scene, lock it to the scene bounds!
  if (asset.sceneId || asset.isBroll) {
    const matchedScene = (project?.scenes?.list || []).find(s =>
      (asset.sceneId && s.id === asset.sceneId) ||
      (asset.sceneNumber && Number(s.sceneNumber) === Number(asset.sceneNumber))
    );
    if (matchedScene) {
      const realPos = resolveRealSceneTimelinePosition(matchedScene, project);
      startTime = realPos.startTime;
      if (isVideo) {
        duration = Math.min(duration, realPos.duration);
      }
    }
  }

  let tracks = [...(project.tracks || [])];

  // Smart Gap Snapping: If inserting onto or near a video track with a gap:
  const primaryVideoTrack = (targetTrackId ? tracks.find(t => t.id === targetTrackId && t.type === 'video') : null)
    || tracks.find(t => t.type === 'video' && (t.clips?.length || 0) > 0)
    || tracks.find(t => t.type === 'video');

  if (isVideo && primaryVideoTrack && !primaryVideoTrack.locked) {
    const sorted = [...(primaryVideoTrack.clips || [])].sort((a, b) => a.startTime - b.startTime);
    if (sorted.length > 0) {
      // Gap at start of track
      if (sorted[0].startTime > 0.08) {
        const gapStart = 0;
        const gapEnd = Number(sorted[0].startTime.toFixed(2));
        if (Math.abs(gapStart - startTime) < 1.5 || (startTime >= gapStart && startTime < gapEnd)) {
          startTime = gapStart;
          duration = Number(Math.min(duration, gapEnd - gapStart).toFixed(2));
          targetTrackId = primaryVideoTrack.id;
        }
      }
      // Gap between clips
      let pEnd = sorted[0].startTime + sorted[0].duration;
      for (let i = 1; i < sorted.length; i++) {
        const c = sorted[i];
        if (c.startTime - pEnd > 0.08) {
          const gapStart = Number(pEnd.toFixed(2));
          const gapEnd = Number(c.startTime.toFixed(2));
          const gapDur = Number((gapEnd - gapStart).toFixed(2));
          if (Math.abs(gapStart - startTime) < 1.5 || (startTime >= gapStart - 0.1 && startTime <= gapEnd + 0.1)) {
            startTime = gapStart;
            duration = gapDur;
            targetTrackId = primaryVideoTrack.id;
            break;
          }
        }
        pEnd = Math.max(pEnd, c.startTime + c.duration);
      }
    }
  }

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
      audioSeparated: true,
      muted: true,
      volume: 0,
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

  const rawTracks = Array.isArray(p.tracks) && p.tracks.length > 0 ? p.tracks : defaultTracks;
  const rawAssets = Array.isArray(p.assets) ? p.assets : [];
  const assetTypeById = new Map(rawAssets.map(a => [a.id, a.type]));
  const hasAnyAudioClips = rawTracks.some(t => t.type === 'audio' && Array.isArray(t.clips) && t.clips.length > 0);

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
    tracks: rawTracks.map(t => ({
      ...t,
      clips: Array.isArray(t.clips)
        ? t.clips.map(c => {
          if (t.type === 'video' && !c.isGraphic && assetTypeById.get(c.assetId) !== 'image') {
            if (c.linkedClipId || c.audioSeparated || hasAnyAudioClips) {
              return {
                ...c,
                audioSeparated: true,
                muted: true,
                volume: 0
              };
            }
          }
          return c;
        })
        : []
    })),
    assets: rawAssets.map(a => {
      if (!a || typeof a !== 'object') return a;
      const isValidBlob = typeof Blob !== 'undefined' && a.file instanceof Blob && a.file.size > 0;
      if (a.file && !isValidBlob) {
        const { file, ...rest } = a;
        return rest;
      }
      return a;
    }),
    scenes: p.scenes && Array.isArray(p.scenes.list) ? {
      ...p.scenes,
      list: p.scenes.list.map(s => {
        if (s.visualCollagePreview && typeof s.visualCollagePreview === 'string' && s.visualCollagePreview.length > 2000) {
          const { visualCollagePreview, ...rest } = s;
          return rest;
        }
        return s;
      })
    } : (p.scenes || { list: [], summary: null, rhythmProfile: null }),
    transcript: p.transcript || { segments: [], rawText: '' },
    updatedAt: p.updatedAt || new Date().toISOString()
  };
}

/**
 * Normalizes project tracks without destroying user timeline clips.
 * Preserves all user clips across all video and audio tracks (e.g. V1 base clips and V2 overlays).
 */
export function sanitizeDuplicateSceneClips(project) {
  if (!project) return null;
  return normalizeProject(project);
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
        if (t.type === 'video') {
          return {
            ...c,
            linkedClipId: null,
            audioSeparated: true,
            muted: true,
            volume: 0
          };
        }
        return { ...c, linkedClipId: null };
      }
      return c;
    })
  }));

  return { ...project, tracks };
}

/**
 * Detects all empty gaps between clips (and before the first clip) in a given track.
 */
export function getTrackGaps(track) {
  if (!track || !track.clips || track.clips.length === 0 || track.locked || track.visible === false) {
    return [];
  }
  const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);
  const gaps = [];

  // Gap before the first clip if it starts after 0.08s
  if (sorted[0].startTime > 0.08) {
    gaps.push({
      id: `gap-${track.id}-start-0`,
      start: 0,
      end: sorted[0].startTime,
      duration: Number(sorted[0].startTime.toFixed(2))
    });
  }

  let prevEnd = sorted[0].startTime + sorted[0].duration;
  for (let i = 1; i < sorted.length; i++) {
    const clip = sorted[i];
    if (clip.startTime - prevEnd > 0.08) {
      gaps.push({
        id: `gap-${track.id}-${i}-${prevEnd.toFixed(2)}`,
        start: Number(prevEnd.toFixed(2)),
        end: Number(clip.startTime.toFixed(2)),
        duration: Number((clip.startTime - prevEnd).toFixed(2))
      });
    }
    prevEnd = Math.max(prevEnd, clip.startTime + clip.duration);
  }

  return gaps;
}

/**
 * Ripple Deletes a gap in a track:
 * Closes the empty space between clips by shifting subsequent clips leftward.
 * If any shifted clip is grouped or linked (e.g. linkedClipId or groupId),
 * all associated partner clips across all tracks are shifted together by the same amount.
 * If the clips are independent (not linked/grouped), only the clips in targetTrackId are shifted.
 */
export function rippleDeleteGap(project, targetTrackId, gapStart, gapDuration) {
  if (!project || !project.tracks || !targetTrackId || gapDuration <= 0.001) {
    return project;
  }

  const tracks = project.tracks.map(t => ({
    ...t,
    clips: [...(t.clips || [])]
  }));

  const targetTrack = tracks.find(t => t.id === targetTrackId);
  if (!targetTrack) return project;

  // Identify clips in the target track that start at or after the gap
  const targetShiftClips = targetTrack.clips.filter(c => c.startTime >= gapStart + gapDuration - 0.02);
  if (targetShiftClips.length === 0) return project;

  // Collect all clip IDs that must be shifted:
  const clipIdsToShift = new Set(targetShiftClips.map(c => c.id));

  // Find all linked partners and group members:
  // If a clip being shifted has linkedClipId or groupId, add those partner clips too!
  let addedNew = true;
  while (addedNew) {
    addedNew = false;
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clipIdsToShift.has(clip.id)) {
          // Check linkedClipId
          if (clip.linkedClipId && !clipIdsToShift.has(clip.linkedClipId)) {
            clipIdsToShift.add(clip.linkedClipId);
            addedNew = true;
          }
          // Check groupId
          if (clip.groupId) {
            for (const otherTrack of tracks) {
              for (const otherClip of otherTrack.clips) {
                if (otherClip.groupId === clip.groupId && !clipIdsToShift.has(otherClip.id)) {
                  clipIdsToShift.add(otherClip.id);
                  addedNew = true;
                }
              }
            }
          }
        } else {
          // If this clip links to a clip that is being shifted, include it too
          if (clip.linkedClipId && clipIdsToShift.has(clip.linkedClipId)) {
            clipIdsToShift.add(clip.id);
            addedNew = true;
          }
        }
      }
    }
  }

  // Shift all identified clips to the left by gapDuration
  const updatedTracks = tracks.map(t => ({
    ...t,
    clips: t.clips.map(c => {
      if (clipIdsToShift.has(c.id)) {
        const nextStart = Math.max(0, Number((c.startTime - gapDuration).toFixed(2)));
        return {
          ...c,
          startTime: nextStart
        };
      }
      return c;
    })
  }));

  // Recalculate max duration if needed
  let maxEndTime = 0;
  updatedTracks.forEach(t => {
    t.clips.forEach(c => {
      maxEndTime = Math.max(maxEndTime, c.startTime + c.duration);
    });
  });

  const currentDuration = project.settings?.duration || 20;
  const newDuration = Math.max(5, Math.max(maxEndTime, Number((currentDuration - gapDuration).toFixed(2))));

  return {
    ...project,
    updatedAt: new Date().toISOString(),
    settings: {
      ...(project.settings || {}),
      duration: newDuration
    },
    tracks: updatedTracks
  };
}

/**
 * Ripple Deletes one or more clips:
 * Removes the specified clips and shifts subsequent clips on affected tracks leftward to close the gap.
 */
export function rippleDeleteClips(project, clipIds = []) {
  if (!project || !project.tracks || !Array.isArray(clipIds) || clipIds.length === 0) {
    return project;
  }

  const idSet = new Set(clipIds);
  // Also include linked companions if their primary clip is being ripple-deleted
  for (const track of project.tracks) {
    for (const clip of (track.clips || [])) {
      if (idSet.has(clip.id) && clip.linkedClipId) {
        idSet.add(clip.linkedClipId);
      }
    }
  }

  // Record the deleted intervals per track so we can shift subsequent clips on those tracks
  const intervalsByTrack = new Map();
  for (const track of project.tracks) {
    if (track.locked) continue;
    const removed = (track.clips || []).filter(c => idSet.has(c.id));
    if (removed.length > 0) {
      const minStart = Math.min(...removed.map(c => c.startTime));
      const maxEnd = Math.max(...removed.map(c => c.startTime + c.duration));
      intervalsByTrack.set(track.id, {
        start: minStart,
        duration: Math.max(0, Number((maxEnd - minStart).toFixed(2)))
      });
    }
  }

  // 1. Remove the deleted clips
  let currProject = {
    ...project,
    tracks: project.tracks.map(t => ({
      ...t,
      clips: (t.clips || [])
        .filter(c => !idSet.has(c.id))
        .map(c => (idSet.has(c.linkedClipId) ? { ...c, linkedClipId: null } : c))
    }))
  };

  // 2. Ripple close the gap on each affected track
  for (const [trackId, interval] of intervalsByTrack.entries()) {
    if (interval.duration > 0.01) {
      currProject = rippleDeleteGap(currProject, trackId, interval.start, interval.duration);
    }
  }

  return currProject;
}

/**
 * Splits a clip at a specific timestamp (or finds the top-most unlocked clip under splitTime if targetClipId is null).
 * Returns { updatedProject, newClipId }.
 */
export function splitClipAtTime(project, targetClipId = null, splitTime = 0) {
  if (!project || !project.tracks) return { updatedProject: project, newClipId: null };

  let foundClip = null;
  let foundTrack = null;

  if (targetClipId) {
    for (const t of project.tracks) {
      if (t.locked) continue;
      const c = (t.clips || []).find(x => x.id === targetClipId);
      if (c && splitTime > c.startTime + 0.08 && splitTime < (c.startTime + c.duration - 0.08)) {
        foundClip = c;
        foundTrack = t;
        break;
      }
    }
  }

  // Auto-detect clip under splitTime if targetClipId wasn't provided or wasn't under splitTime
  if (!foundClip) {
    for (const t of project.tracks) {
      if (t.locked || t.visible === false || t.type === 'guide' || t.type === 'scene') continue;
      const c = (t.clips || []).find(x => splitTime > x.startTime + 0.08 && splitTime < (x.startTime + x.duration - 0.08));
      if (c) {
        foundClip = c;
        foundTrack = t;
        break;
      }
    }
  }

  if (!foundClip || !foundTrack) {
    return { updatedProject: project, newClipId: null };
  }

  const clipStart = foundClip.startTime;
  const clipEnd = foundClip.startTime + foundClip.duration;
  const firstDuration = Number((splitTime - clipStart).toFixed(2));
  const secondDuration = Number((clipEnd - splitTime).toFixed(2));
  const rate = Number(foundClip.playbackRate) > 0 ? Number(foundClip.playbackRate) : 1;
  const secondSourceStart = Number(((foundClip.sourceStart || 0) + firstDuration * rate).toFixed(2));

  const newSecondId = 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
  const updatedFirst = { ...foundClip, duration: firstDuration };

  let linkedClip = null;
  let linkedTrack = null;
  if (foundClip.linkedClipId) {
    for (const t of project.tracks) {
      const lc = (t.clips || []).find(x => x.id === foundClip.linkedClipId);
      if (lc) {
        linkedClip = lc;
        linkedTrack = t;
        break;
      }
    }
  }

  let newLinkedSecondId = null;
  let updatedLinkedFirst = null;
  let newLinkedSecond = null;

  if (linkedClip && linkedTrack && !linkedTrack.locked) {
    newLinkedSecondId = 'clip_linked_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
    const linkedRate = Number(linkedClip.playbackRate) > 0 ? Number(linkedClip.playbackRate) : 1;
    updatedLinkedFirst = {
      ...linkedClip,
      duration: firstDuration,
      linkedClipId: foundClip.id
    };
    newLinkedSecond = {
      ...linkedClip,
      id: newLinkedSecondId,
      startTime: Number(splitTime.toFixed(2)),
      duration: secondDuration,
      sourceStart: Number(((linkedClip.sourceStart || 0) + firstDuration * linkedRate).toFixed(2)),
      name: `${linkedClip.name.replace(/\s*\(Parte \d+\)$/i, '')} (Parte 2)`,
      linkedClipId: newSecondId
    };
    updatedFirst.linkedClipId = linkedClip.id;
  }

  const newSecond = {
    ...foundClip,
    id: newSecondId,
    startTime: Number(splitTime.toFixed(2)),
    duration: secondDuration,
    sourceStart: secondSourceStart,
    name: `${(foundClip.name || 'Clip').replace(/\s*\(Parte \d+\)$/i, '')} (Parte 2)`,
    linkedClipId: newLinkedSecondId || undefined
  };

  const updatedTracks = project.tracks.map(t => {
    let clips = t.clips || [];
    if (t.id === foundTrack.id) {
      clips = clips.map(c => c.id === foundClip.id ? updatedFirst : c).concat(newSecond);
      clips.sort((a, b) => a.startTime - b.startTime);
    }
    if (linkedTrack && t.id === linkedTrack.id && t.id !== foundTrack.id) {
      clips = clips.map(c => c.id === linkedClip.id ? updatedLinkedFirst : c).concat(newLinkedSecond);
      clips.sort((a, b) => a.startTime - b.startTime);
    }
    return { ...t, clips };
  });

  return {
    updatedProject: {
      ...project,
      updatedAt: new Date().toISOString(),
      tracks: updatedTracks
    },
    newClipId: newSecondId
  };
}


