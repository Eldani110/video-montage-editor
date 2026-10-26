/**
 * AI Video Editor Brain (Cerebro Editor IA)
 * 
 * Acts like a senior human video editor in a cutting room:
 * 1. Analyzes speech transcript for verbal mistakes ("me equivoqué", "espera", "otra vez", "perdón", risas, tropiezos).
 * 2. Detects false starts, unfinished sentences, and semantic retakes (restarting an idea with better delivery).
 * 3. Multimodal alignment: Snaps cuts to acoustic waveform valleys (RMS energy drops & breath silences)
 *    so every cut is invisible, natural, and never clips speech consonants.
 * 4. Provides transparent editorial reasoning for every cut decision.
 * 5. Hybrid execution: Leverages cloud LLM reasoning (Gemini / DeepSeek / Ollama) when available,
 *    with an ultra-fast deterministic acoustic-semantic engine that works 100% offline.
 */

import { sendAiChatCompletion, parseAiJsonResponse, getSavedAiConfig } from './aiClient.js';
import { computeWordSimilarity, countMatchingPrefixWords } from './autoCutEngine.js';

// Explicit verbal mistake indicators used when a speaker stumbles on camera
export const SPANISH_MISTAKE_PATTERNS = [
  {
    id: 'me_equivoque',
    regex: /\b(?:me\s+equivoqu[eé]|me\s+confund[ií]|me\s+enred[eé]|me\s+trab[eé]|la\s+cagu[eé]|no\s+mentiras?|as[ií]\s+no\s+era|qued[oó]\s+mal)\b/i,
    label: 'Equivocación declarada ("me equivoqué")',
    type: 'mistake_discard'
  },
  {
    id: 'espera',
    regex: /\b(?:no\s*,?\s*espera|espera\s*,?\s*espera|esp[eé]rate|par[aá]\s*,?\s*par[aá]|pausa|aguanta|espera\s+un\s+momento|dame\s+un\s+segundo)\b/i,
    label: 'Interrupción o pausa ("espera")',
    type: 'mistake_discard'
  },
  {
    id: 'otra_vez',
    regex: /\b(?:otra\s+vez|va\s+de\s+nuevo|de\s+nuevo|vamos\s+de\s+nuevo|repit[ao]|desde\s+el\s+principio|arranco\s+de\s+nuevo|otra\s+toma)\b/i,
    label: 'Reinicio de toma ("otra vez / de nuevo")',
    type: 'mistake_discard'
  },
  {
    id: 'perdon',
    regex: /\b(?:perd[oó]n|disculpa|lo\s+siento|mala\s+m[ií]a)\b/i,
    label: 'Disculpa verbal ("perdón")',
    type: 'mistake_discard'
  },
  {
    id: 'tropiezo',
    regex: /\b(?:ay\s+no|uy\s+no|no\s*,?\s*no\s*,?\s*no|ash|puf|agh)\b/i,
    label: 'Tropiezo o frustración ("ay no / no no")',
    type: 'mistake_discard'
  },
  {
    id: 'corte',
    regex: /\b(?:corte|c[oó]rtala|empecemos\s+de\s+nuevo|dale\s+de\s+nuevo)\b/i,
    label: 'Orden de corte ("corte")',
    type: 'mistake_discard'
  },
  {
    id: 'olvido',
    regex: /\b(?:c[oó]mo\s+era|qu[eé]\s+era\s+lo\s+que\s+iba\s+a\s+decir|se\s+me\s+fue|se\s+me\s+olvid[oó]|me\s+perd[ií]|no\s+me\s+acuerdo|c[oó]mo\s+es\s+que\s+se\s+dice)\b/i,
    label: 'Olvido o pérdida de hilo',
    type: 'mistake_discard'
  },
  {
    id: 'risa',
    regex: /\b(?:jajaj?a?|jeje|jiji|ja\s+ja|risas?)\b/i,
    label: 'Risa o desconcentración',
    type: 'mistake_discard'
  }
];

// Incomplete phrase connectors (ending on dangling particles before an abrupt pause)
export const DANGLING_CONNECTORS_REGEX = /\b(?:que|de|para|con|el|la|los|las|un|una|en|por|y|o|pero|porque|es\s+que|o\s+sea|como)\s*$/i;

/**
 * Snaps a target timestamp to the nearest acoustic silence valley in the waveform.
 * Ensures the cut lands in natural dead air and leaves breathing headroom.
 */
export function snapToAcousticValley(timeSec, silences = [], searchWindowSec = 0.55, preferStart = true) {
  if (!silences || silences.length === 0) return timeSec;

  // Check if timestamp is already inside an existing silence
  for (const s of silences) {
    if (timeSec >= s.start && timeSec <= s.end) {
      return preferStart
        ? Number(Math.min(s.end - 0.04, Math.max(s.start + 0.04, timeSec)).toFixed(2))
        : Number(Math.max(s.start + 0.04, Math.min(s.end - 0.04, timeSec)).toFixed(2));
    }
  }

  let bestValley = null;
  let minDistance = searchWindowSec;

  for (const s of silences) {
    const distToStart = Math.abs(s.start - timeSec);
    const distToEnd = Math.abs(s.end - timeSec);

    if (distToStart < minDistance) {
      minDistance = distToStart;
      bestValley = preferStart ? s.start + 0.04 : s.start;
    }
    if (distToEnd < minDistance) {
      minDistance = distToEnd;
      bestValley = preferStart ? s.end : s.end - 0.05;
    }
  }

  return bestValley !== null ? Number(bestValley.toFixed(2)) : Number(timeSec.toFixed(2));
}

/**
 * Deterministic Semantic & Acoustic Video Editor Engine
 * Runs locally in milliseconds with 0 network dependencies.
 */
export function analyzeWithDeterministicBrain({
  speechSegments = [],
  silences = [],
  acousticValleys = [],
  totalDuration = 0,
  options = {}
}) {
  const {
    minSilenceDuration = 0.35,
    paddingMs = 120,
    filterSilences = false, // Silences are managed separately as an independent layer by the user
    filterMistakes = true,
    filterFalseStarts = true,
    filterRepeatedTakes = true
  } = options;

  const paddingSec = Math.max(0, paddingMs / 1000);
  const editorNotes = [];
  const rawCutIntervals = [];

  // Use micro-valleys if provided for millimetric audio alignment
  const snappingValleys = (acousticValleys && acousticValleys.length > 0) ? acousticValleys : silences;

  // --- PASS 1: Detect Verbal Mistakes with Multi-Segment Backward Lookback ---
  if (filterMistakes) {
    let mistakesFoundCount = 0;

    for (let i = 0; i < speechSegments.length; i++) {
      const seg = speechSegments[i];
      const text = seg.text || '';
      
      let matchedPattern = null;
      for (const p of SPANISH_MISTAKE_PATTERNS) {
        if (p.regex.test(text)) {
          matchedPattern = p;
          break;
        }
      }

      if (matchedPattern) {
        mistakesFoundCount++;
        // Contextual lookback: examine up to 3 segments back (~8 seconds) to locate where the aborted thought truly began
        let corruptStart = seg.start;
        const nextSeg = i + 1 < speechSegments.length ? speechSegments[i + 1] : null;

        for (let b = i - 1; b >= 0 && b >= i - 3; b--) {
          const prev = speechSegments[b];
          if (seg.start - prev.end > 3.5) break; // gap too large

          const isDangling = DANGLING_CONNECTORS_REGEX.test(prev.text.trim());
          const isRelatedToRecovery = nextSeg && (
            countMatchingPrefixWords(prev.text, nextSeg.text) >= 1 ||
            computeWordSimilarity(prev.text, nextSeg.text) >= 0.25
          );

          if (isDangling || isRelatedToRecovery || (seg.start - prev.end < 1.0)) {
            corruptStart = prev.start;
          } else {
            break;
          }
        }

        // Find recovery take (where speaker restarts cleanly)
        let recoveryEnd = seg.end;
        if (nextSeg) {
          recoveryEnd = nextSeg.start;
        }

        // Snap to acoustic silence valleys for an invisible audio splice
        const snappedStart = snapToAcousticValley(corruptStart, snappingValleys, 0.55, true);
        const snappedEnd = snapToAcousticValley(recoveryEnd, snappingValleys, 0.55, false);

        const cutDur = Number(Math.max(0.1, snappedEnd - snappedStart).toFixed(2));
        rawCutIntervals.push({
          start: snappedStart,
          end: snappedEnd,
          duration: cutDur,
          type: 'mistake_discard',
          severity: 'high',
          reasoning: `Equivocación detectada: "${text}". Poda desde inicio de toma fallida (${snappedStart}s) hasta retoma limpia en ${snappedEnd}s.`,
          text: `[Error: "${text.slice(0, 30)}..."]`
        });
      }
    }

    if (mistakesFoundCount > 0) {
      editorNotes.push(`🧠 Se detectaron ${mistakesFoundCount} equivocaciones o tropiezos verbales ("me equivoqué", "otra vez", disculpas) y se podaron junto a sus tomas previas.`);
    }
  }

  // --- PASS 2: Contextual False Starts & Restarts (Even without explicit mistake words) ---
  if (filterFalseStarts) {
    let falseStartsCount = 0;

    for (let i = 0; i < speechSegments.length - 1; i++) {
      const cur = speechSegments[i];

      // Contextual lookahead: look forward up to 2 segments to see if current sentence was abandoned in favor of a clean restart
      for (let f = i + 1; f <= Math.min(speechSegments.length - 1, i + 2); f++) {
        const candidate = speechSegments[f];
        const isDangling = DANGLING_CONNECTORS_REGEX.test(cur.text.trim());
        const prefixMatchCount = countMatchingPrefixWords(cur.text, candidate.text);
        const similarity = computeWordSimilarity(cur.text, candidate.text);
        const isRepeatedTakeMatch = filterRepeatedTakes && similarity >= 0.35;

        if (isDangling || prefixMatchCount >= 2 || isRepeatedTakeMatch) {
          const snappedStart = snapToAcousticValley(cur.start, snappingValleys, 0.50, true);
          const snappedEnd = snapToAcousticValley(candidate.start, snappingValleys, 0.50, false);

          if (snappedEnd > snappedStart + 0.15) {
            falseStartsCount++;
            const cutDur = Number((snappedEnd - snappedStart).toFixed(2));
            rawCutIntervals.push({
              start: snappedStart,
              end: snappedEnd,
              duration: cutDur,
              type: 'false_start',
              severity: 'medium',
              reasoning: `Retoma contextual: Intento iniciado en ${cur.start.toFixed(1)}s ("${cur.text.slice(0, 30)}...") fue abandonado y retomado limpiamente en ${candidate.start.toFixed(1)}s.`,
              text: `[Retoma: "${cur.text.slice(0, 25)}..."]`
            });
            break; // found clean restart take
          }
        }
      }
    }

    if (falseStartsCount > 0) {
      editorNotes.push(`✂️ Se podaron ${falseStartsCount} falsos comienzos y retomas contextuales donde el orador vaciló y reinició la oración.`);
    }
  }

  // --- PASS 3: Acoustic Waveform Silences & Dead Air ---
  if (filterSilences) {
    let silenceCutCount = 0;
    (silences || []).forEach((s) => {
      if (s.duration >= minSilenceDuration) {
        // Protect speech consonants with safety padding
        const maxPad = Math.max(0, (s.duration - 0.08) / 2);
        const pad = Math.min(paddingSec, maxPad);
        const cutStart = Number((s.start + pad).toFixed(2));
        const cutEnd = Number((s.end - pad).toFixed(2));

        if (cutEnd > cutStart + 0.06) {
          silenceCutCount++;
          const cutDur = Number((cutEnd - cutStart).toFixed(2));
          rawCutIntervals.push({
            start: cutStart,
            end: cutEnd,
            duration: cutDur,
            type: 'acoustic_silence',
            severity: 'low',
            reasoning: `Valle acústico en forma de onda: Pausa de respiración / silencio prolongado de ${s.duration.toFixed(1)}s recortado en ${cutDur}s.`,
            text: `[Pausa acústica ${s.duration.toFixed(1)}s]`
          });
        }
      }
    });

    if (silenceCutCount > 0) {
      editorNotes.push(`📉 Se recortaron ${silenceCutCount} valles de silencio y pausas de respiración basándose en el análisis de forma de onda RMS.`);
    }
  }

  // --- PASS 4: Merge Overlapping or Adjacent Cuts ---
  rawCutIntervals.sort((a, b) => a.start - b.start);
  const mergedCuts = [];

  for (const c of rawCutIntervals) {
    if (mergedCuts.length === 0) {
      mergedCuts.push({ ...c });
      continue;
    }
    const last = mergedCuts[mergedCuts.length - 1];
    if (c.start <= last.end + 0.05) {
      last.end = Math.max(last.end, c.end);
      last.duration = Number((last.end - last.start).toFixed(2));
      last.reasoning = `${last.reasoning} | ${c.reasoning}`;
      if (c.severity === 'high') last.severity = 'high';
    } else {
      mergedCuts.push({ ...c });
    }
  }

  // --- PASS 5: Build Complete Timeline Partitions ---
  const partitions = [];
  let cur = 0;

  for (let i = 0; i < mergedCuts.length; i++) {
    const cut = mergedCuts[i];

    // Kept speech interval
    if (cut.start > cur + 0.05) {
      const keptDur = Number((cut.start - cur).toFixed(2));
      const overlapping = (speechSegments || []).filter(s => s.end > cur + 0.05 && s.start < cut.start - 0.05);
      const text = overlapping.map(s => s.text).join(' ').trim() || `Locución limpia (${keptDur}s)`;
      partitions.push({
        id: `brain_kept_${cur.toFixed(2)}`,
        start: cur,
        end: cut.start,
        duration: keptDur,
        type: 'speech',
        isCut: false,
        text
      });
    }

    partitions.push({
      id: `brain_cut_${cut.start.toFixed(2)}`,
      start: cut.start,
      end: cut.end,
      duration: cut.duration,
      type: cut.type || 'silence',
      isCut: true,
      cutReason: cut.reasoning,
      text: cut.text,
      severity: cut.severity || 'medium'
    });

    cur = Math.max(cur, cut.end);
  }

  if (totalDuration > cur + 0.05) {
    const keptDur = Number((totalDuration - cur).toFixed(2));
    const overlapping = (speechSegments || []).filter(s => s.end > cur + 0.05 && s.start < totalDuration - 0.05);
    const text = overlapping.map(s => s.text).join(' ').trim() || `Locución limpia (${keptDur}s)`;
    partitions.push({
      id: `brain_kept_${cur.toFixed(2)}`,
      start: cur,
      end: totalDuration,
      duration: keptDur,
      type: 'speech',
      isCut: false,
      text
    });
  }

  const totalCutDuration = mergedCuts.reduce((acc, c) => acc + c.duration, 0);
  const percentSaved = totalDuration > 0 ? Math.round((totalCutDuration / totalDuration) * 100) : 0;
  editorNotes.push(`⏱️ Tiempo total optimizado por el Cerebro IA: -${totalCutDuration.toFixed(1)}s (${percentSaved}% menos metraje).`);

  return {
    success: true,
    engine: 'deterministic_brain',
    editorNotes,
    cutProposals: mergedCuts,
    partitions,
    totalCutDuration: Number(totalCutDuration.toFixed(2)),
    percentSaved
  };
}

/**
 * Cloud LLM Reasoning Editor Brain (Gemini / DeepSeek / Ollama)
 * Feeds transcript + waveform metadata to an LLM prompted as a veteran film editor.
 */
export async function analyzeWithLlmEditorBrain({
  speechSegments = [],
  silences = [],
  acousticValleys = [],
  totalDuration = 0,
  apiKey = null,
  options = {}
}) {
  const snappingValleys = (acousticValleys && acousticValleys.length > 0) ? acousticValleys : silences;

  // If speech is empty or very short, use deterministic brain immediately
  if (!speechSegments || speechSegments.length === 0) {
    return analyzeWithDeterministicBrain({ speechSegments, silences, acousticValleys, totalDuration, options });
  }

  const systemPrompt = `Eres un Editor de Video Senior de Élite especializado en 'Rough Cuts' y montaje dinámico.
Tu misión es analizar la transcripción de un locutor/actor con sus marcas de tiempo y los valles de silencio acústico de la forma de onda.

Reglas de razonamiento editorial cinematográfico:
1. Detecta equivocaciones explícitas ("me equivoqué", "espera", "va de nuevo", "perdón", risas, tropiezos).
   Corta la toma fallida completa previa (analizando los segundos antes) y la frase de equivocación, conservando solo la retoma limpia ("Toma Definitiva").
2. Detecta errores por contexto SIN que la persona diga "me equivoqué": Si el orador empieza una frase o idea, se traba, titubea, duda o la deja incompleta y luego recomienza la misma idea con mejor entonación o fluidez, analiza hacia atrás dónde empezó el intento fallido y córtalo hasta el inicio de la retoma limpia.
3. SEPARACIÓN DE CAPAS (NO CORTAR SILENCIOS COMUNES): El usuario calibra y prueba los silencios y pausas acústicas con sus propios deslizadores manuales independientes. Enfócate exclusivamente en errores semánticos, equivocaciones, falsos comienzos y retomas.
   Usa los valles de silencio acústico de la forma de onda ÚNICAMENTE para calibrar y encajar (snap) el inicio y final de tus cortes de error para no mutilar consonantes ni respiraciones naturales.
4. Explica con claridad profesional POR QUÉ realizas cada corte en "reasoning".

Debes responder ÚNICAMENTE en formato JSON con la siguiente estructura:
{
  "editorNotes": [
    "Nota del editor resumida de lo encontrado...",
    "Otra observación clave..."
  ],
  "cuts": [
    {
      "start": 5.4,
      "end": 9.8,
      "type": "mistake_discard" | "false_start" | "repeated_take",
      "reasoning": "Explicación editorial concisa de por qué se corta",
      "text": "Texto recortado o resumen"
    }
  ]
}`;

  const formattedTranscript = speechSegments
    .map((s, idx) => `[${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s] (#${idx + 1}): "${s.text}"`)
    .join('\n');

  const formattedSilences = (silences || [])
    .filter(s => s.duration >= (options.minSilenceDuration || 0.35))
    .slice(0, 30)
    .map(s => `Silencio acústico: ${s.start.toFixed(2)}s -> ${s.end.toFixed(2)}s (${s.duration.toFixed(1)}s)`)
    .join('\n');

  const userPrompt = `Analiza esta secuencia grabada (Duración total: ${totalDuration.toFixed(1)}s):

--- TRANSCRIPCIÓN CON MARCAS DE TIEMPO ---
${formattedTranscript}

--- VALLES DE FORMA DE ONDA ACÚSTICA (SILENCIOS DETECTADOS) ---
${formattedSilences}

Indica en JSON qué tramos cortar para dejar un montaje profesional, limpio y continuo.`;

  try {
    let rawResponse = null;

    // Check Gemini API first if key provided
    const resolvedGeminiKey = apiKey || (typeof localStorage !== 'undefined'
      ? (localStorage.getItem('montage_pro_gemini_api_key') || localStorage.getItem('montage_gemini_api_key') || localStorage.getItem('gemini_api_key'))
      : null);

    if (resolvedGeminiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${resolvedGeminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      }
    }

    // If Gemini wasn't used or failed, check Universal AI Client (Ollama Cloud / DeepSeek / OpenRouter)
    if (!rawResponse) {
      const aiConfig = getSavedAiConfig();
      if (aiConfig && aiConfig.apiKey) {
        const completion = await sendAiChatCompletion({
          systemPrompt,
          userPrompt,
          jsonMode: true,
          config: aiConfig
        });
        rawResponse = completion.content;
      }
    }

    if (rawResponse) {
      const parsed = parseAiJsonResponse(rawResponse);
      if (parsed && Array.isArray(parsed.cuts) && parsed.cuts.length > 0) {
        // Snap LLM cuts to exact acoustic silence valleys
        const snappedCuts = parsed.cuts.map(c => {
          const s = snapToAcousticValley(c.start, snappingValleys, 0.50, true);
          const e = snapToAcousticValley(c.end, snappingValleys, 0.50, false);
          return {
            start: s,
            end: e,
            duration: Number(Math.max(0.1, e - s).toFixed(2)),
            type: c.type || 'mistake_discard',
            reasoning: c.reasoning || 'Recorte sugerido por Cerebro IA',
            text: c.text || `[Corte Cerebro IA]`
          };
        });

        // Build partitions
        const partitions = [];
        let cur = 0;
        snappedCuts.sort((a, b) => a.start - b.start);

        for (const cut of snappedCuts) {
          if (cut.start > cur + 0.05) {
            const keptDur = Number((cut.start - cur).toFixed(2));
            const overlapping = speechSegments.filter(s => s.end > cur + 0.05 && s.start < cut.start - 0.05);
            partitions.push({
              id: `brain_kept_${cur.toFixed(2)}`,
              start: cur,
              end: cut.start,
              duration: keptDur,
              type: 'speech',
              isCut: false,
              text: overlapping.map(s => s.text).join(' ').trim() || `Locución (${keptDur}s)`
            });
          }

          partitions.push({
            id: `brain_cut_${cut.start.toFixed(2)}`,
            start: cut.start,
            end: cut.end,
            duration: cut.duration,
            type: cut.type,
            isCut: true,
            cutReason: cut.reasoning,
            text: cut.text
          });

          cur = Math.max(cur, cut.end);
        }

        if (totalDuration > cur + 0.05) {
          const keptDur = Number((totalDuration - cur).toFixed(2));
          const overlapping = speechSegments.filter(s => s.end > cur + 0.05 && s.start < totalDuration - 0.05);
          partitions.push({
            id: `brain_kept_${cur.toFixed(2)}`,
            start: cur,
            end: totalDuration,
            duration: keptDur,
            type: 'speech',
            isCut: false,
            text: overlapping.map(s => s.text).join(' ').trim() || `Locución (${keptDur}s)`
          });
        }

        const totalCutDuration = snappedCuts.reduce((acc, c) => acc + c.duration, 0);

        return {
          success: true,
          engine: 'llm_reasoning_brain',
          editorNotes: parsed.editorNotes || ['🧠 Análisis de razonamiento editorial completado con éxito.'],
          cutProposals: snappedCuts,
          partitions,
          totalCutDuration: Number(totalCutDuration.toFixed(2)),
          percentSaved: Math.round((totalCutDuration / (totalDuration || 1)) * 100)
        };
      }
    }
  } catch (err) {
    console.warn('[aiEditorBrain] LLM inference failed, gracefully falling back to deterministic engine:', err);
  }

  // Graceful deterministic fallback
  return analyzeWithDeterministicBrain({ speechSegments, silences, acousticValleys, totalDuration, options });
}

/**
 * Primary coordinator function
 */
export async function runEditorBrainAnalysis({
  speechSegments = [],
  silences = [],
  acousticValleys = [],
  totalDuration = 0,
  apiKey = null,
  options = {}
}) {
  return analyzeWithLlmEditorBrain({
    speechSegments,
    silences,
    acousticValleys,
    totalDuration,
    apiKey,
    options
  });
}
