/**
 * High-Speed Native FFmpeg Export Service
 * Integrates directly with the local Node.js / FFmpeg backend for 50x-100x render acceleration.
 */

import { renderProjectAudioMix } from '../utils/exportAudio.js';
import { drawGraphicCanvas } from '../utils/graphicEngine.js';

/**
 * Converts an AudioBuffer to an uncompressed 16-bit PCM WAV Blob
 */
export function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const numSamples = audioBuffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // "fmt " chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Checks if the local FFmpeg backend is reachable
 */
export async function isFFmpegBackendAvailable() {
  try {
    const res = await fetch('/api/export/ffmpeg/status?jobId=ping', { method: 'GET' });
    return res.status === 200;
  } catch (_) {
    return false;
  }
}

/**
 * Executes a full export using the native FFmpeg engine on the backend
 */
export async function exportWithNativeFFmpeg({
  project,
  width = 1920,
  height = 1080,
  duration = 10,
  fps = 30,
  bitrate = '8M',
  preset = 'veryfast',
  includeAudio = true,
  includeGraphics = true,
  signal,
  onProgress
}) {
  const jobId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  if (signal?.aborted) {
    throw new DOMException('Export cancelled', 'AbortError');
  }

  // 1. Synthesize Audio Mix offline via Web Audio Context
  let audioFilePath = null;
  if (includeAudio) {
    onProgress?.({
      percent: 3,
      phase: 'audio',
      message: 'Sintetizando pistas de audio con Web Audio...'
    });

    try {
      const audioResult = await renderProjectAudioMix(project, duration, 48000, (p) => {
        onProgress?.({
          percent: Math.min(6, 2 + Math.round((p.percent || 0) * 0.04)),
          phase: 'audio',
          message: p.message || 'Sintetizando pistas de audio con Web Audio...'
        });
      });

      if (audioResult && audioResult.audioBuffer) {
        onProgress?.({
          percent: 7,
          phase: 'audio',
          message: 'Enviando pista de audio maestro al motor FFmpeg...'
        });

        const wavBlob = audioBufferToWavBlob(audioResult.audioBuffer);
        const uploadRes = await fetch(`/api/export/ffmpeg/upload-audio?jobId=${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: wavBlob,
          signal
        });

        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          audioFilePath = uploadJson.audioFilePath;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.warn('[FFmpegExportService] Advertencia procesando audio:', err);
    }
  }

  if (signal?.aborted) {
    await fetch(`/api/export/ffmpeg/cancel?jobId=${jobId}`, { method: 'POST' }).catch(() => {});
    throw new DOMException('Export cancelled', 'AbortError');
  }

  // 2. Render Graphic Overlays (G1 track) to transparent PNGs
  const graphicOverlays = [];
  if (includeGraphics) {
    onProgress?.({
      percent: 8,
      phase: 'graphics',
      message: 'Preparando títulos y gráficos superpuestos...'
    });

    const graphicClips = [];
    for (const track of (project.tracks || [])) {
      if (track.visible === false) continue;
      for (const clip of (track.clips || [])) {
        if (clip.isGraphic || track.type === 'graphics' || track.type === 'graphic') {
          graphicClips.push(clip);
        }
      }
    }

    if (graphicClips.length > 0) {
      const gCanvas = document.createElement('canvas');
      gCanvas.width = width;
      gCanvas.height = height;
      const gCtx = gCanvas.getContext('2d');

      for (let i = 0; i < graphicClips.length; i++) {
        const clip = graphicClips[i];
        gCtx.clearRect(0, 0, width, height);

        // Render at peak presentation time (middle of clip duration) for static PNG
        const midTime = (clip.startTime || 0) + (clip.duration || 3) / 2;
        try {
          drawGraphicCanvas(gCtx, clip, midTime, width, height);
          const pngDataUrl = gCanvas.toDataURL('image/png');
          graphicOverlays.push({
            id: clip.id,
            startTime: Number(clip.startTime) || 0,
            duration: Number(clip.duration) || 3,
            fadeIn: Number(clip.animation?.inDuration) || 0.4,
            fadeOut: Number(clip.animation?.outDuration) || 0.4,
            pngDataUrl
          });
        } catch (gfxErr) {
          console.warn(`[FFmpegExportService] Error procesando gráfico ${clip.name}:`, gfxErr);
        }
      }
    }
  }

  if (signal?.aborted) {
    await fetch(`/api/export/ffmpeg/cancel?jobId=${jobId}`, { method: 'POST' }).catch(() => {});
    throw new DOMException('Export cancelled', 'AbortError');
  }

  // 3. Launch Native FFmpeg Export Job
  onProgress?.({
    percent: 10,
    phase: 'init',
    message: 'Iniciando compilación ultrarrápida con FFmpeg nativo...'
  });

  const startRes = await fetch('/api/export/ffmpeg/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      project,
      settings: {
        width,
        height,
        fps,
        bitrate,
        preset,
        duration,
        format: 'mp4'
      },
      audioFilePath,
      graphicOverlays
    }),
    signal
  });

  if (!startRes.ok) {
    const errData = await startRes.json().catch(() => ({}));
    throw new Error(errData.error || `Error al iniciar exportación (${startRes.status})`);
  }

  // 4. Poll progress loop until completed or cancelled
  return new Promise((resolve, reject) => {
    let intervalId = null;

    const cleanup = () => {
      if (intervalId) clearInterval(intervalId);
    };

    signal?.addEventListener('abort', () => {
      cleanup();
      fetch(`/api/export/ffmpeg/cancel?jobId=${jobId}`, { method: 'POST' }).catch(() => {});
      reject(new DOMException('Export cancelled', 'AbortError'));
    });

    intervalId = setInterval(async () => {
      try {
        if (signal?.aborted) {
          cleanup();
          return;
        }

        const pollRes = await fetch(`/api/export/ffmpeg/status?jobId=${jobId}`);
        if (!pollRes.ok) return;

        const data = await pollRes.json();

        if (data.status === 'rendering') {
          const fpsText = data.fps > 0 ? ` (${data.fps} FPS - ${data.speed || '1x'})` : '';
          onProgress?.({
            percent: Math.min(99, Math.max(10, data.percent || 10)),
            phase: 'encoding',
            currentFrame: data.currentFrame || 0,
            totalFrames: data.totalFrames || Math.round(duration * fps),
            fps: data.fps || 0,
            etaSeconds: data.etaSeconds || 0,
            speed: data.speed,
            message: `Renderizando con FFmpeg nativo${fpsText}...`
          });
        } else if (data.status === 'completed') {
          cleanup();
          onProgress?.({
            percent: 100,
            phase: 'done',
            currentFrame: data.totalFrames,
            totalFrames: data.totalFrames,
            fps: data.fps,
            etaSeconds: 0,
            message: '¡Montaje exportado exitosamente con FFmpeg!'
          });

          const downloadUrl = `/api/export/ffmpeg/download?jobId=${jobId}`;
          resolve({
            success: true,
            jobId,
            downloadUrl,
            fileSize: data.fileSize || 0
          });
        } else if (data.status === 'failed') {
          cleanup();
          reject(new Error(data.error || 'Fallo durante el procesamiento en FFmpeg'));
        }
      } catch (err) {
        console.warn('[FFmpegExportService] Error de sondeo:', err);
      }
    }, 350);
  });
}
