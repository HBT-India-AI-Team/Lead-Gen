import axios from 'axios';
import { recordLlmCall } from './llmTelemetry.js';

// Generic, reusable HTTP client for the Gemini API's generateContent
// endpoint. Same contract as ollamaClient.js — chat() takes { system, user }
// and returns parsed JSON, with retry, timeout and code-fence stripping —
// so any service can swap one client for the other via llmClient.js
// without changing its own code. Like OllamaClient, this file knows
// nothing about tenders, prompts, or banking.
//
// Errors carry two flags callers can act on:
//   error.code === 'LLM_QUOTA_EXHAUSTED'  quota used up; error.retryAfterSeconds
//                                         says for how long. Never retried here.
//   error.transient === true              overload / timeout / network — worth
//                                         retrying later, not a property of the input.
// Every call (success or final failure) is logged by llmTelemetry.js.

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
// A rate-limit (429) is only waited out when Google asks for a short pause
// (a per-minute limit). Anything longer — e.g. the free tier's daily cap,
// which asks for hours — fails immediately instead of burning retries.
const MAX_RATE_LIMIT_WAIT_MS = 20000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strips a ```json ... ``` or ``` ... ``` code fence if the model wrapped its JSON response in one. */
function stripCodeFences(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

/** Google's RetryInfo delay ("37s") and QuotaFailure id from a 429 body, when present. */
function rateLimitDetails(error) {
  const details = error?.response?.data?.error?.details ?? [];
  const retry = details.find((detail) => String(detail['@type']).endsWith('RetryInfo'));
  const quota = details.find((detail) => String(detail['@type']).endsWith('QuotaFailure'));
  const seconds = retry?.retryDelay ? parseFloat(String(retry.retryDelay)) : null;
  const violation = quota?.violations?.[0];
  return {
    retryAfterMs: Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null,
    quotaId: violation?.quotaId ?? null,
    quotaLimit: violation?.quotaValue ?? null,
  };
}

export class GeminiClient {
  /**
   * apiKey/model default from GEMINI_API_KEY/GEMINI_MODEL (read at
   * construction time) but can be overridden per instance or per call.
   * GEMINI_THINKING_LEVEL (e.g. "low"), when set, is sent as the thinking
   * level — lower means faster, cheaper answers on Gemini 3 models.
   */
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
    baseUrl = process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL,
    thinkingLevel = process.env.GEMINI_THINKING_LEVEL || null,
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
    this.thinkingLevel = thinkingLevel;
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
   * `operation` names the feature making the call, for telemetry.
   *
   * Retries transient failures (timeouts, network errors, 5xx, short
   * rate-limit pauses, and unparseable replies) up to `retries` times.
   */
  async chatWithMeta({ system, user, model = this.model, format = 'json', schema, temperature, options = {}, operation = 'chat' } = {}) {
    if (!user) {
      throw new Error('GeminiClient.chat() requires a "user" message.');
    }

    const generationConfig = { ...options };
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (this.thinkingLevel && !generationConfig.thinkingConfig) generationConfig.thinkingConfig = { thinkingLevel: this.thinkingLevel };
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
    const started = Date.now();
    let lastError;
    let attempt = 1;

    for (; attempt <= totalAttempts; attempt++) {
      try {
        const response = await this.http.post(`/models/${encodeURIComponent(model)}:generateContent`, body);
        const payload = response.data;
        const content = this.#extractText(payload);
        const result = {
          data: format === 'json' ? this.#parseJson(content) : content,
          payload,
          usage: {
            prompt: payload.usageMetadata?.promptTokenCount || 0,
            completion: payload.usageMetadata?.candidatesTokenCount || 0,
            total: payload.usageMetadata?.totalTokenCount || 0
          }
        };
        recordLlmCall({ provider: this.provider, model, operation, ok: true, latencyMs: Date.now() - started, attempts: attempt, usage: result.usage });
        return result;
      } catch (error) {
        lastError = this.#normalizeError(error);

        const isLastAttempt = attempt === totalAttempts;
        if (isLastAttempt || !this.#isRetriable(error)) break;

        const { retryAfterMs } = error.response?.status === 429 ? rateLimitDetails(error) : {};
        await sleep(retryAfterMs ?? this.retryDelayMs * attempt);
      }
    }

    recordLlmCall({
      provider: this.provider,
      model,
      operation,
      ok: false,
      latencyMs: Date.now() - started,
      attempts: Math.min(attempt, totalAttempts),
      errorCode: lastError.code ?? (lastError.transient ? 'TRANSIENT' : 'ERROR'),
    });
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
    if (status === 429) {
      const { retryAfterMs } = rateLimitDetails(error);
      return retryAfterMs !== null && retryAfterMs <= MAX_RATE_LIMIT_WAIT_MS;
    }
    return status >= 500;
  }

  #normalizeError(error) {
    if (error.response) {
      const status = error.response.status;

      if (status === 429) {
        const { retryAfterMs, quotaId, quotaLimit } = rateLimitDetails(error);
        const waitSeconds = retryAfterMs !== null ? Math.ceil(retryAfterMs / 1000) : null;
        const quota = quotaId ? ` (${quotaId}${quotaLimit ? `, limit ${quotaLimit}` : ''})` : '';
        const quotaError = new Error(
          `Gemini quota exhausted${quota}${waitSeconds !== null ? `; Google asks to retry in ${waitSeconds}s` : ''}.`
        );
        quotaError.code = 'LLM_QUOTA_EXHAUSTED';
        quotaError.transient = true;
        quotaError.retryAfterSeconds = waitSeconds;
        return quotaError;
      }

      const body = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
      const httpError = new Error(`Gemini request failed with HTTP ${status}: ${(body || '').slice(0, 300)}`);
      httpError.transient = status >= 500;
      return httpError;
    }
    if (error.code === 'ECONNABORTED') {
      const timeoutError = new Error(`Gemini request timed out after ${this.timeoutMs}ms.`);
      timeoutError.transient = true;
      return timeoutError;
    }
    if (!error.isAxiosError) {
      return error;
    }
    const networkError = new Error(`Gemini request failed: ${error.message}`);
    networkError.transient = true;
    return networkError;
  }
}
