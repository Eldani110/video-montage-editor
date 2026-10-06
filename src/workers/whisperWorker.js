/**
 * Whisper Speech-to-Text Web Worker
 * Offloads ONNX neural network execution to a background thread to prevent UI freezing.
 * Uses quantized models and chunk pacing to protect browser memory and CPU.
 */
import { pipeline } from '@huggingface/transformers';

let transcriber = null;

self.addEventListener('message', async (e) => {
  const { type, data } = e.data;

  if (type === 'transcribe') {
    const { float32Data, sampleRate, language, maxChunks } = data;

    try {
      if (!transcriber) {
        self.postMessage({
          type: 'progress',
          percent: 10,
          message: 'Iniciando modelo Whisper cuantizado en segundo plano...'
        });

        // Use quantized 4-bit / 8-bit model to reduce memory by 75% and prevent browser OOM freezes
        transcriber = await pipeline(
          'automatic-speech-recognition',
          'onnx-community/whisper-tiny',
          {
            dtype: {
              encoder_model: 'fp32',
              decoder_model_merged: 'q4'
            },
            progress_callback: (prog) => {
              if (prog.status === 'progress') {
                const p = Math.round(prog.progress || 0);
                self.postMessage({
                  type: 'progress',
                  percent: Math.round(10 + p * 0.25),
                  message: `Descargando motor Whisper (${p}%)...`
                });
              }
            }
          }
        );
      }

      self.postMessage({
        type: 'progress',
        percent: 35,
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

      for (let i = 0; i < chunkLimit; i++) {
        const startIdx = i * chunkSamples;
        const endIdx = Math.min(totalSamples, (i + 1) * chunkSamples);
        const chunkFloatData = float32Data.subarray(startIdx, endIdx);
        const chunkStartSec = i * CHUNK_SEC;

        const currentMin = Math.round(chunkStartSec / 60);
        const percent = Math.round(35 + ((i + 1) / chunkLimit) * 60);

        self.postMessage({
          type: 'progress',
          percent,
          message: `Transcribiendo tramo local ${i + 1} de ${chunkLimit} (~minuto ${currentMin})...`
        });

        // Yield to allow background worker message loop to breathe
        await new Promise((r) => setTimeout(r, 60));

        const output = await transcriber(chunkFloatData, {
          return_timestamps: true,
          chunk_length_s: 30,
          stride_length_s: 5,
          language: language || 'spanish',
          task: 'transcribe'
        });

        const chunks = output?.chunks || [];
        if (chunks.length === 0 && output?.text) {
          const text = output.text.trim();
          if (text) {
            allSegments.push({
              start: Number(chunkStartSec.toFixed(2)),
              end: Number((chunkStartSec + (chunkFloatData.length / sampleRate)).toFixed(2)),
              text
            });
          }
        } else {
          for (const c of chunks) {
            const text = (c.text || '').trim();
            if (!text) continue;

            const startSec = Array.isArray(c.timestamp) ? c.timestamp[0] : 0;
            const endSec = Array.isArray(c.timestamp) && c.timestamp[1] !== null
              ? c.timestamp[1]
              : startSec + 2.5;

            allSegments.push({
              start: Number((chunkStartSec + startSec).toFixed(2)),
              end: Number((chunkStartSec + Math.max(startSec + 0.3, endSec)).toFixed(2)),
              text
            });
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
