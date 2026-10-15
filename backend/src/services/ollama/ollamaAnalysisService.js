import { OllamaClient } from './ollamaClient.js';
import { buildOllamaPrompt } from './ollamaPromptBuilder.js';

// The exact six fields OllamaAnalysisService is allowed to produce.
// Nothing here recomputes score, confidence, or recommendations — those
// are read-only inputs from the caller's LeadAnalysis object.
const EXPECTED_FIELDS = [
  'executiveSummary',
  'businessOpportunity',
  'riskAnalysis',
  'talkingPoints',
  'engagementStrategy',
  'nextBestAction'
];

/**
 * Turns a LeadAnalysisService result into narrative AI analysis via
 * Ollama. The LeadAnalysis object is the ONLY factual input — this
 * service never recomputes lead score, confidence, or banking product
 * recommendations; it only asks Ollama to explain the deterministic
 * results already produced upstream, and validates the shape of what
 * comes back. `ollamaClient` is constructor-injected (defaulting to a
 * real OllamaClient reading OLLAMA_BASE_URL/OLLAMA_DEFAULT_MODEL from
 * .env) so this class stays test-friendly without needing to know how to
 * construct its own HTTP client.
 */
export class OllamaAnalysisService {
  constructor({ ollamaClient = new OllamaClient() } = {}) {
    this.ollamaClient = ollamaClient;
  }

  /**
   * Generates the six narrative fields for one LeadAnalysis object.
   * Throws if leadAnalysis is missing, if the Ollama call fails after
   * retries, or if the response doesn't contain all six expected fields —
   * callers (the controller) are expected to catch and translate this
   * into an HTTP error response rather than this service guessing at a
   * partial/fallback result.
   */
  async generateAnalysis(leadAnalysis) {
    if (!leadAnalysis || typeof leadAnalysis !== 'object') {
      throw new Error('OllamaAnalysisService.generateAnalysis() requires a LeadAnalysis object.');
    }

    const { system, user } = buildOllamaPrompt(leadAnalysis);
    const parsed = await this.ollamaClient.chat({ system, user });

    return this.#validateShape(parsed);
  }

  #validateShape(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Ollama response is not a JSON object.');
    }

    const missing = EXPECTED_FIELDS.filter((field) => !(field in parsed));
    if (missing.length > 0) {
      throw new Error(`Ollama response is missing required field(s): ${missing.join(', ')}.`);
    }

    const result = {};
    for (const field of EXPECTED_FIELDS) {
      result[field] = parsed[field];
    }
    return result;
  }
}