/**
 * Local In-Browser Speech-to-Text with Whisper via Background Web Worker
 * 100% Free, Private, Offline, and Runs in an Isolated Thread to Prevent UI Freezing.
 */
import { extract16kMonoAudio } from './audioExtractor';

/**
 * Transcribes audio/video media locally using a background Web Worker.
 * @param {Blob|File|string} mediaSource Media file, blob, or object URL
 * @param {object} options Optional settings { language, onProgress, abortController }
 * @returns {Promise<Array<{ id: string, start: number, end: number, text: string }>>}
 */
export async function transcribeWithWhisperLocal(mediaSource, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const abortController = options.abortController;

  onProgress({
    stage: 'extracting',
    percent: 8,
    message: 'Extrayendo pista de audio a 16kHz...'
  });

  // 1. Extract 16kHz mono audio buffer
  let float32Data, sampleRate, duration;
  if (mediaSource && mediaSource.float32Data instanceof Float32Array) {
    float32Data = mediaSource.float32Data;
    sampleRate = mediaSource.sampleRate || 16000;
    duration = mediaSource.duration || (float32Data.length / sampleRate);
  } else {
    const extracted = await extract16kMonoAudio(mediaSource, (prog) => {
      onProgress({
        stage: 'extracting',
        percent: Math.round(8 + prog * 0.18),
        message: 'Optimizando forma de onda de audio...'
      });
    });
    float32Data = extracted.float32Data;
    sampleRate = extracted.sampleRate;
    duration = extracted.duration;
  }

  onProgress({
    stage: 'spawning_worker',
    percent: 28,
    message: 'Iniciando motor Whisper en hilo secundario (sin congelar la app)...'
  });

  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(
        new URL('../workers/whisperWorker.js', import.meta.url),
        { type: 'module' }
      );
    } catch (err) {
      reject(new Error('No se pudo inicializar el hilo secundario (Web Worker): ' + err.message));
      return;
    }

    let isFinished = false;

    const cleanup = () => {
      if (!isFinished && worker) {
        isFinished = true;
        worker.terminate();
      }
    };

    if (abortController?.signal) {
      abortController.signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Transcripción cancelada por el usuario.'));
      });
    }

    worker.onmessage = (e) => {
      const { type, percent, message, segments, error } = e.data;

      if (type === 'progress') {
        onProgress({
          stage: 'transcribing',
          percent: percent || 50,
          message: message || 'Transcribiendo audio...'
        });
      } else if (type === 'complete') {
        cleanup();
        onProgress({
          stage: 'completed',
          percent: 100,
          message: '¡Transcripción local finalizada con éxito!'
        });

        const formatted = (segments || []).map((s, idx) => ({
          id: `whisper_${Date.now()}_${idx}`,
          start: s.start,
          end: s.end,
          text: s.text
        }));

        resolve(formatted);
      } else if (type === 'error') {
        cleanup();
        reject(new Error(error || 'Error durante la transcripción local con Whisper.'));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      console.error('Whisper worker error:', err);
      reject(new Error('El motor de Whisper encontró un error en el hilo secundario.'));
    };

    // Post audio data to worker with zero-copy buffer transfer
    const buffer = float32Data.buffer;
    worker.postMessage(
      {
        type: 'transcribe',
        data: {
          float32Data,
          sampleRate,
          language: options.language || 'spanish',
          maxChunks: options.maxChunks || null
        }
      },
      [buffer]
    );
  });
}
