/**
 * Audio Extraction and Resampling Engine for AI Speech-to-Text
 * Converts video/audio assets into lightweight 16kHz mono audio buffers and WAV blobs.
 */

/**
 * Extracts and resamples audio from a media blob or URL to 16kHz mono.
 * Uses hardware-accelerated OfflineAudioContext and yields to main event loop.
 * @param {Blob|File|string} source File, Blob, or URL of media
 * @param {function} onProgress Progress callback (0-100)
 * @param {boolean} includeWavBlob Whether to also encode a full WAV blob
 * @returns {Promise<{ wavBlob?: Blob, float32Data: Float32Array, sampleRate: number, duration: number }>}
 */
export async function extract16kMonoAudio(source, onProgress = null, includeWavBlob = false) {
  if (onProgress) {
    onProgress(10);
    await new Promise((r) => setTimeout(r, 0));
  }

  let arrayBuffer;
  if (source instanceof Blob || source instanceof File) {
    arrayBuffer = await source.arrayBuffer();
  } else if (typeof source === 'string') {
    const res = await fetch(source);
    arrayBuffer = await res.arrayBuffer();
  } else {
    throw new Error('Formato de recurso no compatible para extracción de audio');
  }

  if (onProgress) {
    onProgress(30);
    await new Promise((r) => setTimeout(r, 0));
  }

  // Decode audio data using browser native AudioContext
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let decodedBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    audioCtx.close().catch(() => {});
    arrayBuffer = null; // free memory
  }

  if (onProgress) {
    onProgress(55);
    await new Promise((r) => setTimeout(r, 0));
  }

  const targetSampleRate = 16000;
  const numChannels = 1; // mono
  const duration = decodedBuffer.duration;
  const targetLength = Math.ceil(duration * targetSampleRate);

  // Use OfflineAudioContext for fast hardware-accelerated resampling to 16kHz mono
  const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    numChannels,
    targetLength,
    targetSampleRate
  );

  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = decodedBuffer;

  // Mix down multi-channel audio to mono cleanly
  if (decodedBuffer.numberOfChannels > 1) {
    const merger = offlineCtx.createChannelMerger(1);
    sourceNode.connect(merger, 0, 0);
    merger.connect(offlineCtx.destination);
  } else {
    sourceNode.connect(offlineCtx.destination);
  }

  sourceNode.start(0);

  if (onProgress) {
    onProgress(75);
    await new Promise((r) => setTimeout(r, 0));
  }

  const renderedBuffer = await offlineCtx.startRendering();
  const float32Data = renderedBuffer.getChannelData(0);
  decodedBuffer = null; // free memory

  if (onProgress) {
    onProgress(90);
    await new Promise((r) => setTimeout(r, 0));
  }

  let wavBlob = null;
  if (includeWavBlob) {
    wavBlob = encodeWAV(float32Data, targetSampleRate);
  }

  if (onProgress) {
    onProgress(100);
    await new Promise((r) => setTimeout(r, 0));
  }

  return {
    wavBlob,
    float32Data,
    sampleRate: targetSampleRate,
    duration
  };
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Encodes a 16kHz mono Float32Array into a standard 16-bit PCM WAV Blob.
 */
export function encodeWAV(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // File length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk length (16 for PCM)
  view.setUint32(16, 16, true);
  // Sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // Channel count (1 = mono)
  view.setUint16(22, 1, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sampleRate * 1 channel * 2 bytes/sample)
  view.setUint32(28, sampleRate * 2, true);
  // Block align (1 channel * 2 bytes/sample)
  view.setUint16(32, 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);
  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples (float32 to 16-bit signed integer)
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM WAV Blob (stereo or mono, preserving sample rate).
 * Interleaves channels directly into binary view to eliminate large intermediary memory allocations.
 */
export function encodeAudioBufferToWav(audioBuffer) {
  if (!audioBuffer || audioBuffer.length === 0) {
    return new Blob([], { type: 'audio/wav' });
  }

  const numChannels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;
  const length = audioBuffer.length;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM samples directly
  let offset = 44;
  if (numChannels === 2) {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    for (let i = 0; i < length; i++) {
      const sL = Math.max(-1, Math.min(1, left[i]));
      view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
      offset += 2;

      const sR = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
      offset += 2;
    }
  } else {
    const mono = audioBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, mono[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Decodes audio from an arbitrary media file (video/audio) and encodes it as a high-fidelity 16-bit PCM WAV Blob.
 * Preserves original sample rate (44.1kHz or 48kHz) and stereo/mono channels.
 * @param {Blob|File|string} source File, Blob, or URL of media
 * @returns {Promise<Blob>} Standard audio/wav Blob
 */
export async function extractAudioTrackToWavBlob(source) {
  let arrayBuffer;
  if (source instanceof Blob || source instanceof File) {
    arrayBuffer = await source.arrayBuffer();
  } else if (typeof source === 'string') {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Error HTTP al obtener recurso para extracción: ${res.status}`);
    }
    arrayBuffer = await res.arrayBuffer();
  } else {
    throw new Error('Formato no compatible para extracción de audio');
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();
  let decodedBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    audioCtx.close().catch(() => {});
    arrayBuffer = null;
  }

  return encodeAudioBufferToWav(decodedBuffer);
}

/**
 * Converts a Blob to Base64 data string
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      resolve(base64data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
