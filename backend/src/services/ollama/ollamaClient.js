import axios from 'axios';

// Generic, reusable HTTP client for Ollama's /api/chat endpoint. This
// file knows nothing about LeadAnalysis, prompts, or banking — it only
// sends chat messages to Ollama and returns parsed JSON, with retry,
// timeout and error-handling as configurable, domain-agnostic behavior.
// All prompt/business logic lives in ollamaPromptBuilder.js and
// ollamaAnalysisService.js, never here.

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

export class OllamaClient {
  /**
   * baseUrl/model default from OLLAMA_BASE_URL/OLLAMA_DEFAULT_MODEL (read
   * at construction time, never hardcoded) but can be overridden per
   * instance or per call — e.g. to route a specific call at a different
   * model (OLLAMA_SUMMARY_MODEL, OLLAMA_RISK_MODEL, etc., if a caller
   * chooses to use them; this client has no opinion on which model any
   * particular call should use beyond the configured default).
   */
  constructor({
    baseUrl = process.env.OLLAMA_BASE_URL,
    model = process.env.OLLAMA_DEFAULT_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  } = {}) {
    if (!baseUrl) {
      throw new Error('OllamaClient requires a base URL — set OLLAMA_BASE_URL in .env or pass baseUrl explicitly.');
    }
    if (!model) {
      throw new Error('OllamaClient requires a model — set OLLAMA_DEFAULT_MODEL in .env or pass model explicitly.');
    }

    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.retryDelayMs = retryDelayMs;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Sends a chat request to Ollama's /api/chat endpoint and returns the
   * parsed JSON object from the assistant's reply. `format: 'json'` asks
   * Ollama to constrain generation to valid JSON natively; the response
   * is still defensively fence-stripped and JSON.parse()'d in case the
   * model wraps it in markdown anyway.
   *
   * Retries transient failures (timeouts, network errors, 5xx) up to
   * `retries` times with a linear backoff; a non-retriable failure (4xx,
   * or a response that isn't valid JSON) fails immediately since retrying
   * it would just reproduce the same error.
   */
  async chat({ system, user, model = this.model, format = 'json', options = {} } = {}) {
    if (!user) {
      throw new Error('OllamaClient.chat() requires a "user" message.');
    }

    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });

    const totalAttempts = this.retries + 1;
    let lastError;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const response = await this.http.post('/api/chat', {
          model,
          messages,
          stream: false,
          format,
          options
        });

        return this.#parseJsonContent(response.data);
      } catch (error) {
        lastError = this.#normalizeError(error);

        const isLastAttempt = attempt === totalAttempts;
        if (isLastAttempt || !this.#isRetriable(error)) {
          throw lastError;
        }

        await sleep(this.retryDelayMs * attempt);
      }
    }

    // Unreachable (the loop always throws or returns), but keeps this
    // function's control flow explicit for readers/linters.
    throw lastError;
  }

  #parseJsonContent(data) {
    const content = data?.message?.content;
    if (!content) {
      throw new Error('Ollama response did not include message content.');
    }

    const cleaned = stripCodeFences(content);

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`Ollama response was not valid JSON: ${error.message}`);
    }
  }

  #isRetriable(error) {
    // Errors thrown by #parseJsonContent (missing content / invalid JSON)
    // aren't Axios errors — retried anyway, since LLM generation is
    // stochastic and a re-generation may produce valid JSON where the
    // last attempt didn't.
    if (!error.isAxiosError) return true;

    if (error.code === 'ECONNABORTED') return true; // timeout
    if (!error.response) return true; // network error, no response received
    return error.response.status >= 500;
  }

  #normalizeError(error) {
    if (error.response) {
      const status = error.response.status;
      const body = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
      return new Error(`Ollama request failed with HTTP ${status}: ${(body || '').slice(0, 300)}`);
    }
    if (error.code === 'ECONNABORTED') {
      return new Error(`Ollama request timed out after ${this.timeoutMs}ms.`);
    }
    if (error instanceof Error && /not valid JSON|did not include message content/.test(error.message)) {
      return error;
    }
    return new Error(`Ollama request failed: ${error.message}`);
  }
}
