import { createLlmClient } from './llmClient.js';
import { buildAiAnalysisPrompt } from './aiAnalysisPromptBuilder.js';

// The exact six fields AiAnalysisService is allowed to produce.
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
 * the configured LLM. The LeadAnalysis object is the ONLY factual input — this
 * service never recomputes lead score, confidence, or banking product
 * recommendations; it only asks the LLM to explain the deterministic
 * results already produced upstream, and validates the shape of what
 * comes back. `llmClient` is constructor-injected (defaulting to a
 * client from createLlmClient(), configured by LLM_PROVIDER in
 * .env) so this class stays test-friendly without needing to know how to
 * construct its own HTTP client.
 */
export class AiAnalysisService {
  constructor({ llmClient = createLlmClient() } = {}) {
    this.llmClient = llmClient;
  }

  /**
   * Generates the six narrative fields for one LeadAnalysis object.
   * Throws if leadAnalysis is missing, if the LLM call fails after
   * retries, or if the response doesn't contain all six expected fields —
   * callers (the controller) are expected to catch and translate this
   * into an HTTP error response rather than this service guessing at a
   * partial/fallback result.
   */
  async generateAnalysis(leadAnalysis) {
    if (!leadAnalysis || typeof leadAnalysis !== 'object') {
      throw new Error('AiAnalysisService.generateAnalysis() requires a LeadAnalysis object.');
    }

    const { system, user } = buildAiAnalysisPrompt(leadAnalysis);
    const parsed = await this.llmClient.chat({ system, user, operation: 'lead_narrative' });

    return this.#validateShape(parsed);
  }

  #validateShape(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI analysis response is not a JSON object.');
    }

    const missing = EXPECTED_FIELDS.filter((field) => !(field in parsed));
    if (missing.length > 0) {
      throw new Error(`AI analysis response is missing required field(s): ${missing.join(', ')}.`);
    }

    const result = {};
    for (const field of EXPECTED_FIELDS) {
      result[field] = parsed[field];
    }
    return result;
  }
}