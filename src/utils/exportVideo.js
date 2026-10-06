/**
 * Montage Pro Studio - Professional Video Exporter
 *
 * Pure WebCodecs Hardware Rendering Architecture:
 * Hardware-accelerated WebCodecs API (VideoEncoder, AudioEncoder)
 * paired with MP4-Muxer and WebM-Muxer for lightning-fast, microsecond-accurate,
 * zero-dropped-frame rendering with true 48kHz stereo audio multiplexing.
 */

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import aac from '@audio/encode-aac';
import { preloadExportAssets, renderExportFrameAsync } from './renderEngine.js';
import { renderProjectAudioMix } from './exportAudio.js';

/**
 * Checks if the browser natively supports the WebCodecs API
 */
export function isWebCodecsSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder === 'function' &&
    typeof window.VideoFrame === 'function'
  );
}

/**
 * Encodes an AudioBuffer into standard AAC-LC frames suitable for mp4-muxer
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<Array<{ data: Uint8Array, timestampUs: number, durationUs: number }>>}
 */
/**
 * Encodes an AudioBuffer into standard AAC-LC frames suitable for mp4-muxer
 * @param {AudioBuffer} audioBuffer
 * @param {number} audioBitrate - Bitrate in kbps (e.g. 128, 192, 320)
 * @returns {Promise<Array<{ data: Uint8Array, timestampUs: number, durationUs: number }>>}
 */
async function encodeAudioBufferToAacFrames(audioBuffer, audioBitrate = 192) {
  if (!audioBuffer) return [];
  const sampleRate = audioBuffer.sampleRate || 48000;
  const channels = Math.min(2, audioBuffer.numberOfChannels || 1);
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = (channels > 1 && audioBuffer.numberOfChannels > 1) ? audioBuffer.getChannelData(1) : ch0;

  const validBitrate = Math.min(320, Math.max(96, Number(audioBitrate) || 192));
  const enc = await aac({ sampleRate, channels: 2, bitrate: validBitrate });
  const adts1 = await enc.encode([ch0, ch1]);
  const adts2 = await enc.flush();

  const allAdts = new Uint8Array(adts1.length + adts2.length);
  allAdts.set(adts1, 0);
  allAdts.set(adts2, adts1.length);

  // Parse discrete raw AAC-LC frames (stripping 7/9-byte ADTS header)
  const frames = [];
  let offset = 0;
  let timestampUs = 0;
  // AAC-LC frame is 1024 samples
  const frameDurationUs = Math.round((1024 / sampleRate) * 1_000_000);

  while (offset + 7 <= allAdts.length) {
    if (allAdts[offset] !== 0xFF || (allAdts[offset + 1] & 0xF0) !== 0xF0) {
      break;
    }
    const hasCrc = (allAdts[offset + 1] & 0x01) === 0;
    const headerLen = hasCrc ? 9 : 7;
    const frameLen = ((allAdts[offset + 3] & 0x03) << 11) |
                     (allAdts[offset + 4] << 3) |
                     ((allAdts[offset + 5] & 0xE0) >> 5);
    if (frameLen <= headerLen || offset + frameLen > allAdts.length) break;

    const rawData = allAdts.slice(offset + headerLen, offset + frameLen);
    frames.push({
      data: rawData,
      timestampUs,
      durationUs: frameDurationUs
    });
    timestampUs += frameDurationUs;
    offset += frameLen;
  }
  return frames;
}

/**
 * Detects the best supported H.264 / AVC video codec string and configuration for WebCodecs.
 * Supports 4K Ultra HD (Level 5.1/5.2), 2K QHD (Level 5.0/5.1), and 1080p/720p (Level 4.0/4.2).
 */
async function getBestAvcCodec(width, height, fps, bitrate) {
  const is4K = width >= 3840 || height >= 2160 || (width * height >= 3840 * 2160 * 0.9);
  const is2K = width >= 2560 || height >= 1440 || (width * height >= 2560 * 1440 * 0.9);

  let candidateCodecs;
  let fallbackCodec;

  if (is4K) {
    // 4K Ultra HD: Level 5.1 (3840x2160 @ 30fps) and Level 5.2 (3840x2160 @ 60fps)
    candidateCodecs = [
      'avc1.640034', // High Profile, Level 5.2
      'avc1.640033', // High Profile, Level 5.1
      'avc1.4d0034', // Main Profile, Level 5.2
      'avc1.4d0033', // Main Profile, Level 5.1
      'avc1.420034', // Baseline Profile, Level 5.2
      'avc1.420033', // Baseline Profile, Level 5.1
      'avc1.640032', // Level 5.0 fallback
      'avc1.4d0032',
      'avc1.420028'
    ];
    fallbackCodec = 'avc1.640033';
  } else if (is2K) {
    // 2K QHD: Level 5.0 / 5.1
    candidateCodecs = [
      'avc1.640033', // High Profile, Level 5.1
      'avc1.640032', // High Profile, Level 5.0 (2560x1440 @ 60fps)
      'avc1.4d0033', // Main Profile, Level 5.1
      'avc1.4d0032', // Main Profile, Level 5.0
      'avc1.420032', // Baseline Profile, Level 5.0
      'avc1.64002a', // High Profile, Level 4.2
      'avc1.4d002a', // Main Profile, Level 4.2
      'avc1.420028'  // Baseline Profile, Level 4.0
    ];
    fallbackCodec = 'avc1.640032';
  } else {
    // 1080p, 720p, and smaller (Level 4.0 / 4.2)
    candidateCodecs = [
      'avc1.420028', // Baseline Profile, Level 4.0 (strictly no B-frames, zero presentation timestamp stutter)
      'avc1.42001f', // Baseline Profile, Level 3.1
      'avc1.4d002a', // Main Profile, Level 4.2
      'avc1.640028', // High Profile, Level 4.0
      'avc1.640029', // High Profile, Level 4.1
      'avc1.640033'  // High Profile, Level 5.1 (fallback)
    ];
    fallbackCodec = 'avc1.420028';
  }

  // Prioritize prefer-software to avoid Linux/Chromium VA-API dmabuf green texture glitches,
  // but also test no-preference and prefer-hardware
  for (const hw of ['prefer-software', 'no-preference', 'prefer-hardware']) {
    for (const codec of candidateCodecs) {
      try {
        const config = {
          codec,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: hw
        };
        const support = await VideoEncoder.isConfigSupported(config);
        if (support && support.supported) {
          return { codec, config: support.config || config };
        }
      } catch {
        // try next
      }
    }
  }

  return {
    codec: fallbackCodec,
    config: {
      codec: fallbackCodec,
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: 'no-preference'
    }
  };
}

/**
 * Detects the best supported VP9 / VP8 video codec string for WebM
 */
async function getBestVpCodec(width, height, fps, bitrate) {
  const is4K = width >= 3840 || height >= 2160 || (width * height >= 3840 * 2160 * 0.9);
  const is2K = width >= 2560 || height >= 1440 || (width * height >= 2560 * 1440 * 0.9);

  const candidateCodecs = is4K ? [
    'vp09.00.51.08', // VP9 Level 5.1 (4K 60fps)
    'vp09.00.50.08', // VP9 Level 5.0 (4K 30fps)
    'vp09.00.41.08',
    'vp09.00.10.08',
    'vp8'
  ] : is2K ? [
    'vp09.00.50.08', // VP9 Level 5.0
    'vp09.00.41.08',
    'vp09.00.40.08',
    'vp09.00.10.08',
    'vp8'
  ] : [
    'vp09.00.40.08', // VP9 Level 4.0 (1080p)
    'vp09.00.10.08', // VP9 Profile 0
    'vp8'
  ];

  const fallbackCodec = is4K ? 'vp09.00.50.08' : (is2K ? 'vp09.00.50.08' : 'vp09.00.10.08');

  // Prioritize prefer-software to avoid Linux GPU driver texture hazards
  for (const hw of ['prefer-software', 'no-preference', 'prefer-hardware']) {
    for (const codec of candidateCodecs) {
      try {
        const config = {
          codec,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: hw
        };
        const support = await VideoEncoder.isConfigSupported(config);
        if (support && support.supported) {
          return { codec, config: support.config || config };
        }
      } catch {
        // try next
      }
    }
  }

  return {
    codec: fallbackCodec,
    config: {
      codec: fallbackCodec,
      width,
      height,
      bitrate,
      framerate: fps,
      hardwareAcceleration: 'no-preference'
    }
  };
}

/**
 * Checks if AudioEncoder supports the requested audio codec
 */
async function isAudioCodecSupported(codec, sampleRate = 48000, numberOfChannels = 2, bitrate = 192000) {
  if (typeof window === 'undefined' || typeof window.AudioEncoder !== 'function') {
    return false;
  }
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec,
      sampleRate,
      numberOfChannels,
      bitrate
    });
    return !!(support && support.supported);
  } catch {
    return false;
  }
}

/**
 * Primary Video Export Function
 * Supports MP4 and WebM, custom resolutions (1080p, 4K, 9:16 vertical),
 * framerates (24, 30, 60 fps), bitrates, multi-track audio mixing, and real-time stats.
 *
 * @param {object} project - The project state object
 * @param {object|function} optionsOrProgress - Export options or legacy onProgress callback
 * @returns {Promise<Blob>} The generated video Blob (MP4 or WebM)
 */
export async function exportMontageVideo(project, optionsOrProgress = {}) {
  let options = {};
  let progressCallback = null;

  if (typeof optionsOrProgress === 'function') {
    progressCallback = optionsOrProgress;
  } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
    options = optionsOrProgress;
    progressCallback = options.onProgress || null;
  }

  const format = (options.format || 'mp4').toLowerCase(); // 'mp4' | 'webm'
  const width = options.width || project.settings?.width || 1920;
  const height = options.height || project.settings?.height || 1080;
  const duration = options.duration || project.settings?.duration || 20;
  const fps = options.fps || project.settings?.fps || 30;
  const bitrate = options.bitrate || 8000000; // default 8 Mbps
  const audioBitrate = options.audioBitrate || 192; // default 192 kbps
  const includeAudio = options.includeAudio !== false;
  const signal = options.signal || null;
  const pacingMs = typeof options.pacingMs === 'number'
    ? options.pacingMs
    : (options.throttleMode === 'fast' ? 2 : 12); // Default 12ms for gentle CPU load

  const emitProgress = (data) => {
    if (progressCallback) {
      if (typeof data === 'number') {
        progressCallback(data);
      } else {
        progressCallback(data);
      }
    }
  };

  if (!isWebCodecsSupported()) {
    throw new Error('Tu navegador no soporta la API WebCodecs (VideoEncoder / VideoFrame). Se requiere Chrome 94+, Edge 94+ o un navegador compatible.');
  }

  return await exportViaWebCodecs({
    project,
    format,
    width,
    height,
    duration,
    fps,
    bitrate,
    audioBitrate,
    includeAudio,
    pacingMs,
    signal,
    emitProgress
  });
}

/**
 * Pipeline 1: WebCodecs + Muxer (GPU-accelerated, exact frame timing, zero drops)
 */
async function exportViaWebCodecs({
  project,
  format,
  width,
  height,
  duration,
  fps,
  bitrate,
  audioBitrate = 192,
  includeAudio,
  pacingMs = 12,
  signal,
  emitProgress
}) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

  // Ensure clean even dimensions (multiples of 2 required by H.264 / VP9 hardware encoders)
  const cleanWidth = Math.max(128, Math.round(width / 2) * 2);
  const cleanHeight = Math.max(128, Math.round(height / 2) * 2);

  // 1. Preload visual media into GPU memory
  emitProgress({
    percent: 3,
    phase: 'preloading',
    message: 'Preparando recursos visuales y pre-cargando decodificadores...'
  });
  const preloadedMedia = await Promise.race([
    preloadExportAssets(project),
    new Promise((resolve) => setTimeout(() => {
      console.warn('preloadExportAssets hit safety timeout, proceeding with best-effort assets');
      resolve({
        images: new Map(),
        webCodecsDecoders: null,
        cleanup: () => {}
      });
    }, 12000))
  ]);

  try {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    // 2. Mix multi-track audio offline (48kHz stereo)
    emitProgress({
      percent: 8,
      phase: 'audio',
      message: 'Sintetizando y mezclando pistas de audio en estéreo 48kHz...'
    });
    let audioResult = { hasAudio: false, audioBuffer: null };
    if (includeAudio) {
      audioResult = await renderProjectAudioMix(project, duration, 48000);
    }

    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    // 3. Initialize Muxer and Encoders
    emitProgress({
      percent: 14,
      phase: 'init',
      message: 'Configurando canal acelerado de renderizado...'
    });

    let muxer;
    let videoEncoder;
    let audioEncoder = null;
    let audioCodecType = null;
    let audioCodecUsed = null;
    let encoderError = null;
    let audioEncoderError = null;

    const audioSampleRate = 48000;
    const audioChannels = 2;
    const hasAudioTrack = includeAudio && audioResult.hasAudio && !!audioResult.audioBuffer;

    let aacFrames = [];
    let aacFrameIndex = 0;

    if (format === 'mp4') {
      if (hasAudioTrack) {
        emitProgress({
          percent: 10,
          phase: 'audio',
          message: 'Codificando pista de audio AAC-LC estándar...'
        });
        try {
          aacFrames = await encodeAudioBufferToAacFrames(audioResult.audioBuffer, audioBitrate);
        } catch (err) {
          console.warn('AAC encoding warning:', err);
        }
      }

      const avcInfo = await getBestAvcCodec(cleanWidth, cleanHeight, fps, bitrate);

      muxer = new Mp4Muxer({
        target: new Mp4ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: cleanWidth,
          height: cleanHeight
        },
        audio: (hasAudioTrack && aacFrames.length > 0) ? {
          codec: 'aac',
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate
        } : undefined,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset'
      });

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          console.error('VideoEncoder error:', e);
          encoderError = e;
        }
      });

      try {
        videoEncoder.configure(avcInfo.config);
      } catch (confErr) {
        console.warn('Initial configure failed with ' + avcInfo.codec + ':', confErr);
        const altCodec = (cleanWidth >= 3840 || cleanHeight >= 2160) ? 'avc1.640033' : 'avc1.420028';
        videoEncoder.configure({
          codec: altCodec,
          width: cleanWidth,
          height: cleanHeight,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference'
        });
      }
    } else {
      // WebM
      const opusBitrate = Math.round(audioBitrate * 1000);
      const isOpusSupported = hasAudioTrack
        ? await isAudioCodecSupported('opus', audioSampleRate, audioChannels, opusBitrate)
        : false;

      const vpInfo = await getBestVpCodec(cleanWidth, cleanHeight, fps, bitrate);

      muxer = new WebmMuxer({
        target: new WebmArrayBufferTarget(),
        video: {
          codec: vpInfo.codec === 'vp8' ? 'V_VP8' : 'V_VP9',
          width: cleanWidth,
          height: cleanHeight,
          frameRate: fps
        },
        audio: isOpusSupported ? {
          codec: 'A_OPUS',
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate
        } : undefined,
        firstTimestampBehavior: 'offset'
      });

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          console.error('VideoEncoder error:', e);
          encoderError = e;
        }
      });

      try {
        videoEncoder.configure(vpInfo.config);
      } catch (confErr) {
        console.warn('Initial VP configure failed with ' + vpInfo.codec + ':', confErr);
        const altVpCodec = (cleanWidth >= 3840 || cleanHeight >= 2160) ? 'vp09.00.50.08' : 'vp09.00.10.08';
        videoEncoder.configure({
          codec: altVpCodec,
          width: cleanWidth,
          height: cleanHeight,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference'
        });
      }

      if (isOpusSupported) {
        audioCodecType = 'opus';
        audioCodecUsed = 'opus';
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => {
            console.error('AudioEncoder error:', e);
            audioEncoderError = e;
          }
        });
        audioEncoder.configure({
          codec: 'opus',
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
          bitrate: Math.min(320000, Math.max(96000, opusBitrate))
        });
      }
    }

  // 4. Chronological Audio-Video Interleaving Setup
  let audioOffset = 0;
  // Standard packet size: 960 samples for Opus (20ms at 48kHz), 1024 samples for AAC
  const audioChunkSize = audioCodecType === 'opus' ? 960 : 1024;
  const audioBuf = audioResult?.audioBuffer;
  const totalAudioFrames = (audioEncoder && audioBuf) ? audioBuf.length : 0;
  const chan0 = audioBuf ? audioBuf.getChannelData(0) : null;
  const chan1 = (audioBuf && audioBuf.numberOfChannels > 1) ? audioBuf.getChannelData(1) : chan0;

  // Encodes audio chunks progressively up to the specified timeline timestamp
  const encodeAudioUpTo = (targetTimeSec, isFinal = false) => {
    if (!audioEncoder || !audioBuf || audioOffset >= totalAudioFrames || audioEncoderError) return;
    const targetFrames = Math.min(totalAudioFrames, Math.floor(targetTimeSec * audioSampleRate));

    while (audioOffset < targetFrames && !audioEncoderError) {
      const remainingInTarget = targetFrames - audioOffset;
      // In intermediate frames, only encode full standard chunks (1024 or 960) to avoid timestamp jitter & decoder stalls
      if (!isFinal && remainingInTarget < audioChunkSize) {
        break;
      }

      const availableSamples = Math.min(audioChunkSize, totalAudioFrames - audioOffset);
      if (availableSamples <= 0) break;

      // Always create a standard audioChunkSize packet (pad trailing samples with silence if needed)
      const count = isFinal ? audioChunkSize : availableSamples;
      const planar = new Float32Array(count * 2);
      planar.set(chan0.subarray(audioOffset, audioOffset + availableSamples), 0);
      planar.set(chan1.subarray(audioOffset, audioOffset + availableSamples), count);

      const timestampUs = Math.round((audioOffset / audioSampleRate) * 1_000_000);
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioSampleRate,
        numberOfFrames: count,
        numberOfChannels: 2,
        timestamp: timestampUs,
        data: planar
      });

      audioEncoder.encode(audioData);
      audioData.close();
      audioOffset += availableSamples;
    }
  };

  // 5. Render & Encode Video Frames Interleaved with Audio
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const frameInterval = 1 / fps;
  const canvas = document.createElement('canvas');
  canvas.width = cleanWidth;
  canvas.height = cleanHeight;

  const startTime = performance.now();
  let lastEmitTime = 0;

  for (let f = 0; f < totalFrames; f++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    if (encoderError) {
      throw new Error(`Error en el codificador de video: ${encoderError.message || encoderError}`);
    }
    if (videoEncoder.state === 'closed') {
      throw new Error('El codificador de video se cerró inesperadamente durante el proceso.');
    }

    // Backpressure: only wait if encoder queue exceeds 24 frames
    let queueWaitCount = 0;
    while (videoEncoder.encodeQueueSize > 24 && queueWaitCount < 50) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (videoEncoder.state === 'closed') break;
      await new Promise(r => setTimeout(r, 10));
      queueWaitCount++;
    }

    const t = f * frameInterval;

    // A. Interleave audio chunks matching this timeline window
    if (format === 'mp4' && aacFrames.length > 0) {
      const windowEndUs = Math.round((t + frameInterval) * 1_000_000);
      while (aacFrameIndex < aacFrames.length && aacFrames[aacFrameIndex].timestampUs < windowEndUs) {
        const aFrame = aacFrames[aacFrameIndex];
        muxer.addAudioChunkRaw(aFrame.data, 'key', aFrame.timestampUs, aFrame.durationUs);
        aacFrameIndex++;
      }
    } else if (format === 'webm') {
      encodeAudioUpTo(t + frameInterval);
    }

    // B. Render visual frame
    const frameResult = await renderExportFrameAsync(canvas, t, project, preloadedMedia);
    const isBlackFrame = !!frameResult?.isBlackFrame;

    // C. Convert canvas to ImageBitmap to isolate memory buffer from GPU driver dmabuf zero-memory bugs
    const frameDurationUs = Math.round(1_000_000 / fps);
    const timestampUs = Math.round((f * 1_000_000) / fps);
    const bitmap = await createImageBitmap(canvas);
    const videoFrame = new VideoFrame(bitmap, { timestamp: timestampUs, duration: frameDurationUs });
    const isKeyFrame = f % (fps * 2) === 0;

    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();
    bitmap.close();

    // Stats calculations
    const elapsedSec = (performance.now() - startTime) / 1000;
    const currentFps = elapsedSec > 0 ? (f + 1) / elapsedSec : 0;
    const remainingFrames = totalFrames - (f + 1);
    const etaSeconds = currentFps > 0 ? Math.round(remainingFrames / currentFps) : 0;
    const percent = Math.min(96, Math.round(20 + ((f + 1) / totalFrames) * 76));

    // Throttle progress updates to avoid freezing React component renders
    const now = performance.now();
    if (f === totalFrames - 1 || now - lastEmitTime >= 120) {
      lastEmitTime = now;
      emitProgress({
        percent,
        phase: 'encoding',
        currentFrame: f + 1,
        totalFrames,
        fps: Math.round(currentFps),
        etaSeconds,
        message: isBlackFrame
          ? `Avanzando fotograma ${f + 1} de ${totalFrames} (Vacío)...`
          : `Renderizando fotograma ${f + 1} de ${totalFrames} (${Math.round(currentFps)} FPS)...`,
        canvas
      });
    }

    // CPU-friendly pacing:
    // In black empty frames: NO pacing delay! Fast forward (fa-fa-fa at 100+ FPS)
    // In normal content frames: gentle pacing (pacingMs) so OS and browser stay 100% responsive
    if (isBlackFrame) {
      if (f % 25 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    } else {
      await new Promise((r) => setTimeout(r, Math.max(1, pacingMs)));
    }
  }

  // D. Ensure any remaining audio up to project duration is encoded
  if (format === 'mp4' && aacFrames.length > 0) {
    while (aacFrameIndex < aacFrames.length) {
      const aFrame = aacFrames[aacFrameIndex];
      muxer.addAudioChunkRaw(aFrame.data, 'key', aFrame.timestampUs, aFrame.durationUs);
      aacFrameIndex++;
    }
  } else if (format === 'webm') {
    encodeAudioUpTo(duration, true);
  }

  // 6. Flush Encoders and Finalize Muxer
  emitProgress({
    percent: 98,
    phase: 'muxing',
    message: 'Finalizando archivo y empaquetando contenedor...'
  });

  await videoEncoder.flush();
  if (audioEncoder) {
    await audioEncoder.flush();
  }
  muxer.finalize();

  const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
  const blob = new Blob([muxer.target.buffer], { type: mimeType });

  emitProgress({
    percent: 100,
    phase: 'complete',
    message: '¡Video renderizado con éxito!'
  });

  return blob;
  } finally {
    if (preloadedMedia?.cleanup) {
      preloadedMedia.cleanup();
    }
  }
}
