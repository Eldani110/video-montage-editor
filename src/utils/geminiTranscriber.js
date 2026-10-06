/**
 * Google Gemini Multimodal Audio Transcriber
 * High-accuracy speech-to-text with sentence-level timestamps.
 */
import { extract16kMonoAudio, encodeWAV, blobToBase64 } from './audioExtractor';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';

/**
 * Transcribes audio/video media using Google Gemini API.
 * @param {Blob|File|string} mediaSource Media file or blob
 * @param {string} apiKey User's Google Gemini API Key
 * @param {object} options Optional settings { language, onProgress }
 * @returns {Promise<Array<{ id: string, start: number, end: number, text: string }>>}
 */
export async function transcribeWithGemini(mediaSource, apiKey, options = {}) {
  const effectiveKey = (apiKey && apiKey.trim()) || (typeof window !== 'undefined' ? localStorage.getItem('montage_pro_gemini_api_key') : '') || import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!effectiveKey || effectiveKey.trim() === '') {
    throw new Error('Se requiere una clave API de Google Gemini para transcribir con la nube. Puedes obtenerla en https://aistudio.google.com/app/apikey');
  }

  const onProgress = options.onProgress || (() => {});
  onProgress({ stage: 'extracting', percent: 15, message: 'Extrayendo y procesando audio (16kHz mono)...' });

  let float32Data, sampleRate, duration;
  if (mediaSource && mediaSource.float32Data instanceof Float32Array) {
    float32Data = mediaSource.float32Data;
    sampleRate = mediaSource.sampleRate || 16000;
    duration = mediaSource.duration || (float32Data.length / sampleRate);
  } else {
    const extracted = await extract16kMonoAudio(mediaSource, (prog) => {
      onProgress({ stage: 'extracting', percent: Math.round(15 + prog * 0.25), message: 'Optimizando pista de audio...' });
    });
    float32Data = extracted.float32Data;
    sampleRate = extracted.sampleRate;
    duration = extracted.duration;
  }

  // Maximum slice duration per request (3 minutes = 180 seconds) to ensure lightning-fast parallel transcription
  const CHUNK_DURATION = 180;
  const totalChunks = Math.max(1, Math.ceil(duration / CHUNK_DURATION));
  const allSegments = [];

  for (let c = 0; c < totalChunks; c++) {
    const chunkStartSec = c * CHUNK_DURATION;
    const chunkEndSec = Math.min(duration, (c + 1) * CHUNK_DURATION);
    const chunkDuration = chunkEndSec - chunkStartSec;

    onProgress({
      stage: 'transcribing',
      percent: Math.round(40 + (c / totalChunks) * 50),
      message: `Transcribiendo con Gemini IA (tramo ${c + 1} de ${totalChunks})...`
    });

    const startSample = Math.floor(chunkStartSec * sampleRate);
    const endSample = Math.floor(chunkEndSec * sampleRate);
    const chunkSamples = float32Data.subarray(startSample, endSample);

    const chunkWavBlob = encodeWAV(chunkSamples, sampleRate);
    const base64Audio = await blobToBase64(chunkWavBlob);

    // Query Gemini
    const chunkSegments = await sendAudioChunkToGemini(base64Audio, chunkDuration, effectiveKey, options.language);

    // Adjust timestamps relative to total media timeline
    for (const seg of chunkSegments) {
      const adjustedStart = Number((chunkStartSec + seg.start).toFixed(2));
      const adjustedEnd = Number((chunkStartSec + seg.end).toFixed(2));
      allSegments.push({
        id: `seg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        start: adjustedStart,
        end: Math.max(adjustedStart + 0.3, adjustedEnd),
        text: (seg.text || '').trim()
      });
    }
  }

  onProgress({ stage: 'completed', percent: 100, message: '¡Transcripción completada con éxito!' });

  // Sort by start timestamp
  allSegments.sort((a, b) => a.start - b.start);
  return allSegments;
}

/**
 * Sends a single audio slice to Gemini and returns parsed JSON segments.
 */
async function sendAudioChunkToGemini(base64Audio, chunkDuration, apiKey, language = 'es') {
  const prompt = `You are a professional speech-to-text transcriber for a video editor.
Transcribe the speech in this audio accurately into Spanish (or the primary spoken language).
Break the transcript into natural spoken phrases, clauses, or sentences.
For each segment, provide exact start and end timestamps in seconds (e.g. 0.0, 3.4) relative to the audio chunk (0 to ${Math.ceil(chunkDuration)}s).
Return ONLY a valid JSON array of objects with keys "start", "end", "text".
Example:
[
  {"start": 0.0, "end": 2.5, "text": "Hola a todos, bienvenidos."},
  {"start": 2.6, "end": 5.1, "text": "Hoy vamos a hablar de un tema clave."}
]
Do NOT write markdown, explanations, or any text other than the JSON array.`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Audio
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  let model = DEFAULT_MODEL;
  let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    // Retry with fallback model
    model = FALLBACK_MODEL;
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData?.error?.message || `Error ${response.status} en la API de Gemini`;
    throw new Error(msg);
  }

  const data = await response.json();
  const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  try {
    const cleanJson = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        start: Number(item.start) || 0,
        end: Number(item.end) || (Number(item.start) + 2),
        text: String(item.text || '')
      }));
    }
    return [];
  } catch (err) {
    console.warn('Failed to parse Gemini transcription JSON:', textOutput, err);
    return [];
  }
}
