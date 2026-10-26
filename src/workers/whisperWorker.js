/**
 * Whisper Speech-to-Text Web Worker
 * Offloads ONNX neural network execution to a background thread to prevent UI freezing.
 * Uses quantized models (q4) and chunk pacing to protect browser memory and CPU.
 */
import { pipeline, env } from '@huggingface/transformers';

// Configure environment for maximum browser performance & caching
env.allowLocalModels = false;
env.useBrowserCache = true;
if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
  env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(1, navigator.hardwareConcurrency - 1));
}

let transcriber = null;
let currentModelName = null;

self.addEventListener('message', async (e) => {
  const { type, data } = e.data || {};

  if (type === 'transcribe') {
    const {
      float32Data,
      sampleRate = 16000,
      language = 'spanish',
      maxChunks = null,
      model: rawModel = 'onnx-community/whisper-base'
    } = data || {};

    if (!float32Data || float32Data.length === 0) {
      self.postMessage({
        type: 'error',
        error: 'No se recibió señal de audio válida para la transcripción.'
      });
      return;
    }

    const modelMap = {
      'whisper-tiny': 'onnx-community/whisper-tiny',
      'whisper-base': 'onnx-community/whisper-base',
      'whisper-small': 'onnx-community/whisper-small',
      'whisper-large': 'onnx-community/whisper-large-v3-turbo',
      'whisper-large-v3-turbo': 'onnx-community/whisper-large-v3-turbo'
    };
    const model = modelMap[rawModel] || rawModel;
    const modelLabel = model.replace('onnx-community/', '').toUpperCase();

    try {
      if (!transcriber || currentModelName !== model) {
        self.postMessage({
          type: 'progress',
          percent: 5,
          message: `Iniciando motor ${modelLabel} en segundo plano...`
        });

        const progressTracker = (prog) => {
          if (prog.status === 'progress_total') {
            const p = Math.round(prog.progress || 0);
            const loadedMB = (prog.loaded / (1024 * 1024)).toFixed(1);
            const totalMB = (prog.total / (1024 * 1024)).toFixed(1);
            self.postMessage({
              type: 'progress',
              percent: Math.round(5 + p * 0.30),
              message: `Descargando motor ${modelLabel}: ${loadedMB}MB / ${totalMB}MB (${p}%)...`
            });
          } else if (prog.status === 'progress') {
            const p = Math.round(prog.progress || 0);
            const fileName = prog.file ? prog.file.split('/').pop() : 'pesos del modelo';
            self.postMessage({
              type: 'progress',
              percent: Math.round(5 + p * 0.30),
              message: `Descargando ${fileName} (${p}%)...`
            });
          } else if (prog.status === 'ready') {
            self.postMessage({
              type: 'progress',
              percent: 35,
              message: `Motor ${modelLabel} compilado en memoria. Procesando audio...`
            });
          }
        };

        // Use 4-bit quantized encoder and decoder (q4)
        // CRITICAL: whisper-large-v3-turbo encoder in fp32 is 2.5GB and causes browser WASM out-of-memory.
        // Both encoder_model_q4 (405MB) and decoder_model_merged_q4 (318MB) fit safely in memory.
        try {
          transcriber = await pipeline(
            'automatic-speech-recognition',
            model,
            {
              dtype: {
                encoder_model: 'q4',
                decoder_model_merged: 'q4'
              },
              device: 'wasm',
              progress_callback: progressTracker
            }
          );
        } catch (pipeErr) {
          console.warn(`[whisperWorker] Reintentando pipeline con dtype: 'q4' para ${model}:`, pipeErr);
          try {
            transcriber = await pipeline(
              'automatic-speech-recognition',
              model,
              {
                dtype: 'q4',
                progress_callback: progressTracker
              }
            );
          } catch (fallbackErr) {
            console.warn(`[whisperWorker] Reintentando con configuración estándar para ${model}:`, fallbackErr);
            transcriber = await pipeline(
              'automatic-speech-recognition',
              model,
              {
                progress_callback: progressTracker
              }
            );
          }
        }

        currentModelName = model;
      }

      self.postMessage({
        type: 'progress',
        percent: 38,
        message: 'Preparando tramos de audio para transcripción local...'
      });

      const CHUNK_SEC = 30;
      const totalSamples = float32Data.length;
      const chunkSamples = CHUNK_SEC * sampleRate;
      const totalAvailableChunks = Math.max(1, Math.ceil(totalSamples / chunkSamples));
      const totalDurationMin = Math.round((totalSamples / sampleRate) / 60);

      // Apply chunk safety cap if specified (to prevent browser crashes on 20+ min files)
      const chunkLimit = maxChunks ? Math.min(totalAvailableChunks, maxChunks) : totalAvailableChunks;

      const allSegments = [];
      let supportsWordTimestamps = true;

      for (let i = 0; i < chunkLimit; i++) {
        const startIdx = i * chunkSamples;
        const endIdx = Math.min(totalSamples, (i + 1) * chunkSamples);
        const chunkFloatData = float32Data.subarray(startIdx, endIdx);
        const chunkStartSec = i * CHUNK_SEC;

        const currentMin = Math.round(chunkStartSec / 60);
        const percent = Math.round(38 + ((i + 1) / chunkLimit) * 58);

        self.postMessage({
          type: 'progress',
          percent,
          message: `Transcribiendo tramo local ${i + 1} de ${chunkLimit} (~minuto ${currentMin})...`
        });

        // Yield to allow background worker message loop to breathe
        await new Promise((r) => setTimeout(r, 60));

        let output;
        if (supportsWordTimestamps) {
          try {
            output = await transcriber(chunkFloatData, {
              return_timestamps: 'word',
              chunk_length_s: 30,
              stride_length_s: 5,
              language: language || 'spanish',
              task: 'transcribe'
            });
          } catch (wordErr) {
            supportsWordTimestamps = false;
            output = await transcriber(chunkFloatData, {
              return_timestamps: true,
              chunk_length_s: 30,
              stride_length_s: 5,
              language: language || 'spanish',
              task: 'transcribe'
            });
          }
        } else {
          output = await transcriber(chunkFloatData, {
            return_timestamps: true,
            chunk_length_s: 30,
            stride_length_s: 5,
            language: language || 'spanish',
            task: 'transcribe'
          });
        }

        const rawChunks = output?.chunks || [];
        if (rawChunks.length === 0 && output?.text) {
          const text = output.text.trim();
          if (text) {
            allSegments.push({
              start: Number(chunkStartSec.toFixed(2)),
              end: Number((chunkStartSec + (chunkFloatData.length / sampleRate)).toFixed(2)),
              text,
              words: []
            });
          }
        } else {
          // Check if chunks are word-level (single words) or phrase-level
          const isWordLevel = rawChunks.length > 3 && rawChunks.slice(0, 5).every(c => (c.text || '').trim().split(/\s+/).length <= 2);

          if (isWordLevel) {
            // Group word tokens into natural coherent spoken clauses
            let curGroup = null;

            for (let cIdx = 0; cIdx < rawChunks.length; cIdx++) {
              const c = rawChunks[cIdx];
              const wText = (c.text || '').trim();
              if (!wText) continue;

              const wStart = Number((chunkStartSec + (Array.isArray(c.timestamp) ? (c.timestamp[0] ?? 0) : 0)).toFixed(2));
              const rawEnd = (Array.isArray(c.timestamp) && c.timestamp[1] !== null)
                ? c.timestamp[1]
                : (Array.isArray(c.timestamp) ? (c.timestamp[0] ?? 0) + Math.max(0.15, wText.length * 0.065) : 0.3);
              const wEnd = Number((chunkStartSec + Math.max(wStart + 0.12, rawEnd)).toFixed(2));

              const wordObj = { text: wText, start: wStart, end: wEnd };

              if (!curGroup) {
                curGroup = { start: wStart, end: wEnd, text: wText, words: [wordObj] };
              } else {
                const pauseGap = Number((wStart - curGroup.end).toFixed(2));
                const endsSentence = /[.?!]$/.test(curGroup.text.trim());

                // Break phrase if there's a natural breath/pause (>= 0.35s) or sentence ending
                if (pauseGap >= 0.35 || endsSentence || curGroup.words.length >= 14) {
                  allSegments.push(curGroup);
                  curGroup = { start: wStart, end: wEnd, text: wText, words: [wordObj] };
                } else {
                  curGroup.end = wEnd;
                  curGroup.text += ' ' + wText;
                  curGroup.words.push(wordObj);
                }
              }
            }
            if (curGroup) allSegments.push(curGroup);
          } else {
            // Phrase-level chunk processing with proportional duration protection
            for (let cIdx = 0; cIdx < rawChunks.length; cIdx++) {
              const c = rawChunks[cIdx];
              const text = (c.text || '').trim();
              if (!text) continue;

              const startSec = Array.isArray(c.timestamp) ? (c.timestamp[0] ?? 0) : 0;
              const nextStart = (cIdx + 1 < rawChunks.length && Array.isArray(rawChunks[cIdx + 1].timestamp))
                ? rawChunks[cIdx + 1].timestamp[0]
                : null;

              const wordCount = text.split(/\s+/).length;
              const estimatedDur = Math.max(0.35, Math.min(6.0, wordCount * 0.35));

              let endSec;
              if (Array.isArray(c.timestamp) && c.timestamp[1] !== null && c.timestamp[1] > startSec) {
                endSec = c.timestamp[1];
              } else if (nextStart !== null && nextStart > startSec) {
                endSec = Math.min(startSec + estimatedDur, nextStart - 0.04);
              } else {
                endSec = startSec + estimatedDur;
              }

              allSegments.push({
                start: Number((chunkStartSec + startSec).toFixed(2)),
                end: Number((chunkStartSec + Math.max(startSec + 0.2, endSec)).toFixed(2)),
                text,
                words: []
              });
            }
          }
        }

        // Brief cooldown to avoid thermal throttling and allow garbage collection
        await new Promise((r) => setTimeout(r, 80));
      }

      self.postMessage({
        type: 'complete',
        segments: allSegments,
        wasLimited: chunkLimit < totalAvailableChunks,
        processedMinutes: Math.round((chunkLimit * CHUNK_SEC) / 60)
      });
    } catch (err) {
      console.error('Whisper worker error:', err);
      self.postMessage({
        type: 'error',
        error: err.message || 'Error en el worker de Whisper'
      });
    }
  }
});
