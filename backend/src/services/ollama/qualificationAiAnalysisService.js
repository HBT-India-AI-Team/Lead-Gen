import { OllamaClient } from './ollamaClient.js';
import { buildQualificationAnalysisPrompt } from './qualificationAnalysisPromptBuilder.js';

// Turns a real evidence bundle into an AI qualification analysis via
// Ollama, then strictly validates the response shape before it's trusted
// anywhere else. Mirrors ollamaAnalysisService.js's constructor-injection
// pattern (a real OllamaClient by default) but validates a different
// response contract — see qualificationAnalysisPromptBuilder.js.
//
// This service NEVER decides the tender's persisted lead_status/
// pipeline_status/qualification_score — those stay 100% owned by
// qualificationScoringService.js's deterministic rules. Its output is
// advisory analysis only.

const CLASSIFICATION_VALUES = ['QUALIFIED_GOOD', 'QUALIFIED_HITL', 'QUALIFIED_BAD'];
const NEXT_ACTION_VALUES = ['READY_FOR_PROPOSAL', 'AWAITING_QUALITY_REVIEW', 'ON_HOLD'];

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export class QualificationAiAnalysisService {
  constructor({ ollamaClient = new OllamaClient() } = {}) {
    this.ollamaClient = ollamaClient;
  }

  /**
   * Runs one evidence bundle through Ollama and returns the validated
   * analysis. Throws on any connectivity failure or shape/enum violation —
   * callers must treat a thrown error as "AI analysis unavailable" and
   * must never fabricate a fallback score/classification in its place.
   */
  async analyze(evidence) {
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('QualificationAiAnalysisService.analyze() requires an evidence object.');
    }

    const { system, user } = buildQualificationAnalysisPrompt(evidence);
    const parsed = await this.ollamaClient.chat({ system, user });

    return this.#validate(parsed);
  }

  #validate(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Ollama qualification analysis response is not a JSON object.');
    }

    const { score, classification, confidence, reasoning, positiveSignals, riskFactors, missingEvidence, recommendedNextAction } = parsed;

    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(`Ollama qualification analysis returned an invalid score: ${JSON.stringify(score)}.`);
    }
    if (!CLASSIFICATION_VALUES.includes(classification)) {
      throw new Error(`Ollama qualification analysis returned an invalid classification: ${JSON.stringify(classification)}.`);
    }
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`Ollama qualification analysis returned an invalid confidence: ${JSON.stringify(confidence)}.`);
    }
    if (typeof reasoning !== 'string' || !reasoning.trim()) {
      throw new Error('Ollama qualification analysis returned an empty reasoning.');
    }
    if (!isStringArray(positiveSignals)) {
      throw new Error('Ollama qualification analysis returned an invalid positiveSignals array.');
    }
    if (!isStringArray(riskFactors)) {
      throw new Error('Ollama qualification analysis returned an invalid riskFactors array.');
    }
    if (!isStringArray(missingEvidence)) {
      throw new Error('Ollama qualification analysis returned an invalid missingEvidence array.');
    }
    if (!NEXT_ACTION_VALUES.includes(recommendedNextAction)) {
      throw new Error(`Ollama qualification analysis returned an invalid recommendedNextAction: ${JSON.stringify(recommendedNextAction)}.`);
    }

    return { score, classification, confidence, reasoning, positiveSignals, riskFactors, missingEvidence, recommendedNextAction };
  }
}
