/**
 * Universal AI Client for Ollama Cloud, DeepSeek, and OpenAI-Compatible APIs
 * Supports dynamic model discovery, thinking/reasoning extraction, and structured JSON output.
 */

export const STORAGE_KEY_AI_CONFIG = 'montage_pro_ai_config';

export const DEFAULT_AI_CONFIG = {
  provider: 'ollama_cloud', // 'ollama_cloud' | 'deepseek' | 'openrouter' | 'groq' | 'custom'
  baseUrl: 'https://ollama.com',
  apiKey: 'e956a93ec4314b20ae3f22b32d2c0268.bd5dV_bYXSVAskXufh1x4kpl',
  selectedModel: 'deepseek-v4.1-flash',
  enableThinking: true,
  thinkingMode: 'normal', // 'none' | 'normal' | 'deep'
  thinkingEffort: 'low', // 'low' | 'medium' | 'high'
  temperature: 0.3,
  availableModels: [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro:0813',
    'glm-5.3-flash',
    'nemotron-3-super',
    'gemma4:31b',
    'mistral-large-3:675b'
  ]
};

export const PROVIDER_PRESETS = [
  {
    id: 'ollama_cloud',
    name: 'Ollama Cloud / Remoto',
    defaultUrl: 'https://ollama.com',
    keyPlaceholder: 'Clave API de Ollama Cloud o token de acceso',
    keyHelpUrl: 'https://ollama.com/settings/keys',
    description: 'Conexión oficial a Ollama Cloud (https://ollama.com) o instancia local (http://localhost:11434).',
    defaultModels: [
      'deepseek-v4.1-flash',
      'deepseek-v4-pro:0813',
      'glm-5.3-flash',
      'nemotron-3-super',
      'gemma4:31b',
      'gpt-oss:120b',
      'mistral-large-3:675b',
      'kimi-k2.7-code'
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek API',
    defaultUrl: 'https://api.deepseek.com',
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.deepseek.com/api_keys',
    description: 'Modelos DeepSeek Chat y DeepSeek Reasoner (R1) con capacidades avanzadas de pensamiento profundo.',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner']
  },
  {
    id: 'openrouter',
    name: 'OpenRouter AI',
    defaultUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    keyHelpUrl: 'https://openrouter.ai/keys',
    description: 'Acceso unificado a DeepSeek R1, Claude, GPT-4o, Llama 3, Qwen y más de 100 modelos.',
    defaultModels: ['deepseek/deepseek-r1', 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct']
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    defaultUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_...',
    keyHelpUrl: 'https://console.groq.com/keys',
    description: 'Inferencia ultra veloz por hardware LPU (DeepSeek R1 Distill, Llama 3).',
    defaultModels: ['deepseek-r1-distill-llama-70b', 'llama-3.3-70b-versatile']
  },
  {
    id: 'custom',
    name: 'Endpoint Personalizado (OpenAI / Ollama compatible)',
    defaultUrl: 'http://localhost:11434',
    keyPlaceholder: 'Opcional si es local, o Bearer token',
    keyHelpUrl: null,
    description: 'Cualquier servidor proxy o API compatible con la especificación de Chat Completions.',
    defaultModels: []
  }
];

/**
 * Loads AI configuration from localStorage
 */
export function getSavedAiConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AI_CONFIG);
    if (!raw) return DEFAULT_AI_CONFIG;
    const parsed = JSON.parse(raw);

    // Auto-heal truncated or legacy Ollama key from previous sessions
    if (parsed.apiKey && (parsed.apiKey.includes('f25af7d60a3470cb75ca28538bab58d') || parsed.apiKey.length === 56)) {
      parsed.apiKey = 'e956a93ec4314b20ae3f22b32d2c0268.bd5dV_bYXSVAskXufh1x4kpl';
      if (!parsed.selectedModel) parsed.selectedModel = 'deepseek-v4.1-flash';
      saveAiConfig(parsed);
    }

    return { ...DEFAULT_AI_CONFIG, ...parsed };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

/**
 * Saves AI configuration to localStorage
 */
export function saveAiConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY_AI_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save AI config to localStorage:', err);
  }
}

/**
 * Cleans and normalizes base URL
 */
function normalizeBaseUrl(url) {
  let u = (url || '').trim();
  if (!u) return '';
  // Ensure http:// or https:// protocol is present
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    if (u.includes('localhost') || u.includes('127.0.0.1')) {
      u = 'http://' + u;
    } else {
      u = 'https://' + u;
    }
  }
  u = u.replace(/\/+$/, ''); // Remove trailing slashes
  return u;
}

/**
 * Executes a network fetch with automatic fallback to local Vite proxy
 * if browser CORS restrictions block direct access.
 * External cloud providers like ollama.com that do not send CORS headers
 * are routed directly through the local proxy.
 */
export async function safeFetch(targetUrl, options = {}) {
  const isBrowser = typeof window !== 'undefined';

  const fetchViaProxy = async () => {
    const proxyUrl = `/api/ai-proxy?url=${encodeURIComponent(targetUrl)}`;
    return await fetch(proxyUrl, options);
  };

  if (isBrowser && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
    // External APIs (Ollama, DeepSeek, OpenRouter) should route through local proxy to bypass CORS and ensure keepalive
    try {
      return await fetchViaProxy();
    } catch (proxyErr) {
      if (options.signal && options.signal.aborted) throw proxyErr;
      console.warn('Proxy fetch failed, attempting direct fetch:', proxyErr.message);
      return await fetch(targetUrl, options);
    }
  }

  return await fetch(targetUrl, options);
}

/**
 * Fetches available models from the configured API endpoint.
 * Supports /api/tags (Ollama native & cloud) and /v1/models (OpenAI standard).
 */
export async function fetchAvailableModels(baseUrl, apiKey) {
  const normUrl = normalizeBaseUrl(baseUrl);
  if (!normUrl) throw new Error('Debes ingresar la URL base del endpoint.');

  // For GET requests, include Authorization and x-api-key if present
  const headers = {};
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    headers['x-api-key'] = apiKey.trim();
  }

  const errors = [];

  // Determine potential model endpoints
  const cleanBase = normUrl.replace(/\/api$/, '').replace(/\/v1$/, '');
  const endpointsToTry = [
    `${cleanBase}/api/tags`,          // Clean Ollama tags (e.g. https://ollama.com/api/tags)
    `${normUrl}/api/tags`,            // Ollama native
    `${normUrl}/v1/models`,           // OpenAI standard
    `${cleanBase}/v1/models`,         // Clean v1/models
    `${normUrl}/models`               // Generic models
  ];

  // Remove duplicates
  const uniqueEndpoints = [...new Set(endpointsToTry)];

  for (const endpoint of uniqueEndpoints) {
    try {
      const response = await safeFetch(endpoint, {
        method: 'GET',
        headers
      });

      if (response.ok) {
        const data = await response.json();

        // 1. Check Ollama native format: { models: [{ name: "..." }] }
        if (Array.isArray(data.models) && data.models.length > 0) {
          const modelIds = data.models
            .map(m => (typeof m === 'string' ? m : (m.name || m.model || m.id)))
            .filter(Boolean);
          if (modelIds.length > 0) {
            // If checking Ollama Cloud with a provided API key, quickly verify the key is valid for inference
            if (cleanBase.includes('ollama.com') && apiKey && apiKey.trim()) {
              try {
                const probeRes = await safeFetch(`${cleanBase}/api/chat`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey.trim()}`,
                    'x-api-key': apiKey.trim()
                  },
                  body: JSON.stringify({
                    model: modelIds[0] || 'deepseek-v4.1-flash',
                    messages: [{ role: 'user', content: 'test' }],
                    stream: false
                  })
                });
                if (probeRes.status === 401) {
                  throw new Error('La clave API para Ollama Cloud es inválida o no autorizada (HTTP 401). Verifica tu clave en https://ollama.com/settings/keys.');
                }
              } catch (probeErr) {
                if (probeErr.message.includes('401') || probeErr.message.includes('inválida')) {
                  throw probeErr;
                }
                // Non-critical probe network warning is ignored
              }
            }

            return modelIds;
          }
        }

        // 2. Check OpenAI standard data: [{ id: "..." }]
        if (Array.isArray(data.data) && data.data.length > 0) {
          const modelIds = data.data
            .map(m => (typeof m === 'string' ? m : (m.id || m.name)))
            .filter(Boolean);
          if (modelIds.length > 0) {
            return modelIds;
          }
        }

        // 3. Array format: ["model1", "model2"]
        if (Array.isArray(data) && data.length > 0) {
          const modelIds = data
            .map(m => (typeof m === 'string' ? m : (m.id || m.name)))
            .filter(Boolean);
          if (modelIds.length > 0) {
            return modelIds;
          }
        }
      } else {
        errors.push(`${endpoint} (HTTP ${response.status})`);
      }
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('inválida')) throw err;
      errors.push(`${endpoint}: ${err.message}`);
    }
  }

  throw new Error(
    `No se pudieron listar los modelos automáticamente desde el endpoint (${errors[0] || 'Error de conexión'}). ` +
    `Verifica la URL y tu clave API.`
  );
}

/**
 * Sends a chat completion prompt to the configured AI API with automatic multi-attempt persistence.
 * Extracts thinking / reasoning tokens for DeepSeek and reasoning models.
 * @param {object} params { systemPrompt, userPrompt, config, responseFormat }
 * @returns {Promise<{ content: string, thinking: string|null, model: string }>}
 */
export async function sendAiChatCompletion({
  systemPrompt,
  userPrompt,
  messages = null,
  config = null,
  aiConfig = null,
  jsonMode = false,
  signal = null,
  timeoutMs = 180000,
  images = null,
  onThinkingChunk = null,
  onContentChunk = null,
  thinkingMode = null,
  stream = true,
  maxAttempts = 1
}) {
  const activeConfig = config || aiConfig || getSavedAiConfig();
  const { baseUrl, apiKey, selectedModel, temperature } = activeConfig;
  const effectiveThinkingMode = thinkingMode || activeConfig.thinkingMode || (activeConfig.enableThinking ? (activeConfig.thinkingEffort === 'high' ? 'deep' : 'normal') : 'none');
  const isThinkingEnabled = effectiveThinkingMode !== 'none';

  let effectiveSystemPrompt = systemPrompt || '';
  let effectiveUserPrompt = userPrompt || '';

  // If a messages array was passed, extract system and user prompts
  if (Array.isArray(messages) && messages.length > 0) {
    const sysMsg = messages.find(m => m.role === 'system');
    const userMsg = messages.find(m => m.role === 'user');
    if (sysMsg && !effectiveSystemPrompt) effectiveSystemPrompt = sysMsg.content || '';
    if (userMsg && !effectiveUserPrompt) effectiveUserPrompt = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
  }

  const normUrl = normalizeBaseUrl(baseUrl);
  if (!normUrl) {
    throw new Error('La URL base de la API no está configurada. Ve a Configuración en la pantalla inicial.');
  }

  const model = selectedModel || 'deepseek-v4.1-flash';
  const cleanBase = normUrl.replace(/\/api$/, '').replace(/\/v1$/, '');

  const isOllama = cleanBase.includes('ollama') || cleanBase.includes('11434');

  const headers = {
    'Content-Type': 'application/json',
    'Connection': 'keep-alive'
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    headers['x-api-key'] = apiKey.trim();
  }

  // Format messages for Ollama native (images: [base64])
  const messagesOllama = [];
  if (effectiveSystemPrompt) {
    messagesOllama.push({ role: 'system', content: effectiveSystemPrompt });
  }
  const userMsgOllama = { role: 'user', content: effectiveUserPrompt };
  if (Array.isArray(images) && images.length > 0) {
    userMsgOllama.images = images.map(img => img.replace(/^data:image\/[a-zA-Z]+;base64,/, ''));
  }
  messagesOllama.push(userMsgOllama);

  // Format messages for OpenAI standard (content: [{ type: 'text' }, { type: 'image_url' }])
  const messagesOpenAI = [];
  if (effectiveSystemPrompt) {
    messagesOpenAI.push({ role: 'system', content: effectiveSystemPrompt });
  }
  if (Array.isArray(images) && images.length > 0) {
    messagesOpenAI.push({
      role: 'user',
      content: [
        { type: 'text', text: effectiveUserPrompt },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
        }))
      ]
    });
  } else {
    messagesOpenAI.push({ role: 'user', content: effectiveUserPrompt });
  }

  // Multi-attempt retry loop for maximum network persistence
  const MAX_ATTEMPTS = Math.max(1, maxAttempts || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal && signal.aborted) {
      throw new Error('Operación cancelada por el usuario.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Timeout de la API de IA (${timeoutMs / 1000}s). El servidor tardó demasiado en responder.`));
    }, timeoutMs);

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(signal.reason || new Error('Operación cancelada por el usuario.')));
    }

    try {
      let response = null;
      let usedEndpoint = '';

      // Determine endpoints to try: Ollama native (/api/chat) or OpenAI standard (/v1/chat/completions)
      const isOllamaCloud = cleanBase.includes('ollama.com');
      const endpointsToTry = isOllamaCloud
        ? [`${cleanBase}/api/chat`]
        : isOllama
        ? [
            `${cleanBase}/api/chat`,
            normUrl.endsWith('/v1') ? `${normUrl}/chat/completions` : `${normUrl}/v1/chat/completions`
          ]
        : [
            normUrl.endsWith('/v1') ? `${normUrl}/chat/completions` : `${normUrl}/v1/chat/completions`,
            `${cleanBase}/api/chat`
          ];

      const uniqueEndpoints = [...new Set(endpointsToTry)];

      for (const endpoint of uniqueEndpoints) {
        if (controller.signal.aborted) break;

        const isNativeOllamaChat = endpoint.endsWith('/api/chat');
        const isReasoningModel = model.toLowerCase().includes('deepseek') || model.toLowerCase().includes('reasoner') || model.toLowerCase().includes('-r1') || model.toLowerCase().includes('thinking');
        const payload = isNativeOllamaChat
          ? {
              model,
              messages: messagesOllama,
              stream: stream !== false,
              think: isThinkingEnabled, // Top-level official Ollama parameter: false completely suppresses internal <think> deliberation
              format: (jsonMode && (!isReasoningModel || !isThinkingEnabled)) ? 'json' : undefined,
              options: {
                temperature: temperature ?? 0.3,
                num_ctx: 32768
              }
            }
          : {
              model,
              messages: messagesOpenAI,
              stream: stream !== false,
              temperature: temperature ?? 0.3,
              think: isThinkingEnabled,
              ...(isThinkingEnabled
                ? { reasoning_effort: effectiveThinkingMode === 'deep' ? 'high' : 'low', thinking: { type: 'enabled' } }
                : { thinking: { type: 'disabled' } }),
              ...(jsonMode && (!model.includes('reasoner') && !model.includes('-r1') || !isThinkingEnabled) ? { response_format: { type: 'json_object' } } : {})
            };

        try {
          const res = await safeFetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          if (res.ok) {
            response = res;
            usedEndpoint = endpoint;
            clearTimeout(timeoutId); // Connected and streaming! Clear initial connection timeout
            break;
          }

          // If 404 or 405 (endpoint not implemented), fall through to next endpoint immediately
          if (res.status === 404 || res.status === 405) {
            continue;
          }

          // Read error body
          const errBody = await res.json().catch(() => ({}));
          const errMsg = errBody?.error?.message || errBody?.error || errBody?.message || `HTTP ${res.status} ${res.statusText}`;

          if (res.status === 401) {
            throw new Error(`Error 401 (No autorizado) en ${endpoint}: Clave API de Ollama no autorizada o expirada. Verifica tu clave en Configuración.`);
          }

          if (res.status === 429) {
            throw new Error(`Error 429 (Límite de peticiones / Rate Limit) en ${endpoint}: Has superado la cuota de tokens por minuto de Ollama Cloud. Espera unos segundos para enfriamiento.`);
          }

          throw new Error(`Error ${res.status} en ${endpoint}: ${errMsg}`);
        } catch (endpointErr) {
          if (controller.signal.aborted) throw endpointErr;
          if (endpoint === uniqueEndpoints[uniqueEndpoints.length - 1]) {
            throw endpointErr;
          }
        }
      }

      if (!response) {
        throw new Error('No se pudo obtener respuesta válida de ninguno de los endpoints de la API de IA.');
      }

      let rawContent = '';
      let thinkingContent = '';
      let detectedModel = model;

      // Handle Streaming Mode (stream: true)
      if (stream !== false && response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        // Sliding activity watchdog: as long as tokens are arriving, connection remains alive
        let activityTimeout = null;
        const resetActivityTimer = () => {
          if (activityTimeout) clearTimeout(activityTimeout);
          activityTimeout = setTimeout(() => {
            controller.abort(new Error('Inactividad en el flujo de tokens de IA (45s sin nuevos datos recibidos).'));
          }, 45000);
        };
        resetActivityTimer();

        // Critical bugfix: explicitly cancel reader on abort so pending reader.read() promise rejects immediately
        const cancelOnAbort = () => {
          try { reader.cancel().catch(() => {}); } catch {}
        };
        controller.signal.addEventListener('abort', cancelOnAbort, { once: true });

        try {
          while (true) {
            if (controller.signal.aborted) {
              reader.cancel().catch(() => {});
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            resetActivityTimer();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep partial line for next iteration

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;

              let jsonStr = trimmed;
              if (trimmed.startsWith('data: ')) {
                jsonStr = trimmed.slice(6).trim();
              }

              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.model) detectedModel = parsed.model;

                // 1. Ollama native stream format
                if (parsed.message) {
                  const deltaContent = parsed.message.content || '';
                  const deltaThinking = parsed.message.thinking || parsed.message.reasoning || '';

                  if (deltaThinking) {
                    thinkingContent += deltaThinking;
                    if (onThinkingChunk) onThinkingChunk(deltaThinking, thinkingContent);
                  }
                  if (deltaContent) {
                    rawContent += deltaContent;
                    if (onContentChunk) onContentChunk(deltaContent, rawContent);
                  }
                } else if (parsed.response) {
                  rawContent += parsed.response;
                  if (onContentChunk) onContentChunk(parsed.response, rawContent);
                }
                // 2. OpenAI SSE stream format
                else if (Array.isArray(parsed.choices) && parsed.choices[0]) {
                  const delta = parsed.choices[0].delta || {};
                  const deltaContent = delta.content || '';
                  const deltaThinking = delta.reasoning_content || delta.reasoning || '';

                  if (deltaThinking) {
                    thinkingContent += deltaThinking;
                    if (onThinkingChunk) onThinkingChunk(deltaThinking, thinkingContent);
                  }
                  if (deltaContent) {
                    rawContent += deltaContent;
                    if (onContentChunk) onContentChunk(deltaContent, rawContent);
                  }
                }
              } catch {
                // Line might be partial JSON or comment, ignore
              }
            }
          }

          // Process any remaining tail in buffer
          if (buffer.trim()) {
            let jsonStr = buffer.trim();
            if (jsonStr.startsWith('data: ')) jsonStr = jsonStr.slice(6).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.message?.content) rawContent += parsed.message.content;
                if (parsed.message?.thinking) thinkingContent += parsed.message.thinking;
                else if (parsed.response) rawContent += parsed.response;
                else if (parsed.choices?.[0]?.delta?.content) rawContent += parsed.choices[0].delta.content;
              } catch {}
            }
          }
        } finally {
          if (activityTimeout) clearTimeout(activityTimeout);
          controller.signal.removeEventListener('abort', cancelOnAbort);
        }
      }

      // If streaming produced no output or stream was false, fallback to standard JSON
      if (!rawContent && !thinkingContent) {
        const result = await response.json().catch(() => ({}));
        if (result.choices && result.choices.length > 0) {
          const choice = result.choices[0];
          const message = choice.message || {};
          rawContent = message.content || '';
          if (message.reasoning_content) {
            thinkingContent = message.reasoning_content;
          }
        } else if (result.message) {
          rawContent = result.message.content || '';
          if (result.message.reasoning || result.message.thinking) {
            thinkingContent = result.message.reasoning || result.message.thinking;
          }
        } else if (result.response) {
          rawContent = result.response;
        }
      }

      // Extract <think> tags if present in raw content
      if (rawContent && rawContent.includes('<think>')) {
        const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          if (!thinkingContent) thinkingContent = thinkMatch[1].trim();
          rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        }
      }

      return {
        content: rawContent,
        thinking: thinkingContent.trim() || null,
        model: detectedModel,
        usedEndpoint
      };
    } catch (attemptErr) {
      lastError = attemptErr;
      if (signal && signal.aborted) throw attemptErr;

      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[AI Client] Intento ${attempt}/${MAX_ATTEMPTS} falló (${attemptErr.message}). Reintentando conexión con la API en ${attempt * 1.5}s para mantener persistencia...`);
        await new Promise(r => setTimeout(r, attempt * 1500));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

/**
 * Safely parses JSON returned by an LLM, stripping markdown fence blocks.
 */
export function parseAiJsonResponse(text) {
  if (!text) return null;
  let clean = text.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  clean = clean.replace(/^```(?:json)?\s*/i, '');
  clean = clean.replace(/\s*```$/i, '');
  clean = clean.trim();

  // Find the first '{' or '[' and last '}' or ']'
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');

  let startIdx = -1;
  let isObject = false;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    isObject = true;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    isObject = false;
  }

  if (startIdx !== -1) {
    const endChar = isObject ? '}' : ']';
    const lastIdx = clean.lastIndexOf(endChar);
    if (lastIdx !== -1 && lastIdx > startIdx) {
      clean = clean.substring(startIdx, lastIdx + 1);
    }
  }

  try {
    return JSON.parse(clean);
  } catch (err) {
    console.warn('First JSON parse attempt failed, trying sanitized recovery:', err);
    // Sanitize trailing commas which frequently break JSON.parse in LLM outputs
    const sanitized = clean.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(sanitized);
  }
}
