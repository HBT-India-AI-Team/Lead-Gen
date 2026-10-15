import axios from 'axios';

// Generic, reusable HTTP client for the Gemini API's generateContent
// endpoint. Same contract as ollamaClient.js — chat() takes { system, user }
// and returns parsed JSON, with retry, timeout and code-fence stripping —
// so any service can swap one client for the other via llmClient.js
// without changing its own code. Like OllamaClient, this file knows
// nothing about tenders, prompts, or banking.

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.5-flash';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strips a ```json ... ``` or ``` ... ``` code fence if the model wrapped its JSON response in one. */
function stripCodeFences(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export class GeminiClient {
  /**
   * apiKey/model default from GEMINI_API_KEY/GEMINI_MODEL (read at
   * construction time) but can be overridden per instance or per call.
   */
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
    baseUrl = process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  } = {}) {
    if (!apiKey) {
      throw new Error('GeminiClient requires an API key — set GEMINI_API_KEY in .env or pass apiKey explicitly.');
    }

    this.provider = 'gemini';
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.retryDelayMs = retryDelayMs;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
    });
  }

  /** Sends one chat turn and returns the parsed JSON reply (or the raw string when format is 'text'). */
  async chat(params = {}) {
    const { data } = await this.chatWithMeta(params);
    return data;
  }

  /**
   * Same as chat(), but also returns the raw API payload and normalized
   * token usage ({ prompt, completion, total }) for callers that persist
   * or log them (the batch jobs under src/jobs/).
   *
   * `schema` is an optional JSON Schema object; when given it's passed as
   * responseJsonSchema so Gemini constrains generation to that shape.
   *
   * Retries transient failures (timeouts, network errors, 429, 5xx, and
   * unparseable replies) up to `retries` times with a linear backoff.
   */
  async chatWithMeta({ system, user, model = this.model, format = 'json', schema, temperature, options = {} } = {}) {
    if (!user) {
      throw new Error('GeminiClient.chat() requires a "user" message.');
    }

    const generationConfig = { ...options };
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (format === 'json') {
      generationConfig.responseMimeType = 'application/json';
      if (schema) generationConfig.responseJsonSchema = schema;
    }

    const body = {
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const totalAttempts = this.retries + 1;
    let lastError;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const response = await this.http.post(`/models/${encodeURIComponent(model)}:generateContent`, body);
        const payload = response.data;
        const content = this.#extractText(payload);

        return {
          data: format === 'json' ? this.#parseJson(content) : content,
          payload,
          usage: {
            prompt: payload.usageMetadata?.promptTokenCount || 0,
            completion: payload.usageMetadata?.candidatesTokenCount || 0,
            total: payload.usageMetadata?.totalTokenCount || 0
          }
        };
      } catch (error) {
        lastError = this.#normalizeError(error);

        const isLastAttempt = attempt === totalAttempts;
        if (isLastAttempt || !this.#isRetriable(error)) {
          throw lastError;
        }

        await sleep(this.retryDelayMs * attempt);
      }
    }

    throw lastError;
  }

  #extractText(payload) {
    const blockReason = payload?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Gemini blocked the prompt: ${blockReason}.`);
    }

    const parts = payload?.candidates?.[0]?.content?.parts;
    const content = Array.isArray(parts) ? parts.map((part) => part.text || '').join('') : '';
    if (!content) {
      const finishReason = payload?.candidates?.[0]?.finishReason;
      throw new Error(`Gemini response did not include message content${finishReason ? ` (finishReason: ${finishReason})` : ''}.`);
    }
    return content;
  }

  #parseJson(content) {
    try {
      return JSON.parse(stripCodeFences(content));
    } catch (error) {
      throw new Error(`Gemini response was not valid JSON: ${error.message}`);
    }
  }

  #isRetriable(error) {
    // Content/JSON errors aren't Axios errors — retried anyway, since a
    // re-generation may produce valid JSON where the last attempt didn't.
    if (!error.isAxiosError) return true;

    if (error.code === 'ECONNABORTED') return true; // timeout
    if (!error.response) return true; // network error, no response received
    const { status } = error.response;
    return status === 429 || status >= 500;
  }

  #normalizeError(error) {
    if (error.response) {
      const status = error.response.status;
      const body = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
      return new Error(`Gemini request failed with HTTP ${status}: ${(body || '').slice(0, 300)}`);
    }
    if (error.code === 'ECONNABORTED') {
      return new Error(`Gemini request timed out after ${this.timeoutMs}ms.`);
    }
    if (!error.isAxiosError) {
      return error;
    }
    return new Error(`Gemini request failed: ${error.message}`);
  }
}
