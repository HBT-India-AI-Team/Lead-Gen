import { createLlmClient } from './llmClient.js';
import { buildProposalPrompt } from './proposalPromptBuilder.js';

// Turns a real evidence bundle into a structured banking-proposal draft via
// the configured LLM (Gemini by default), then strictly validates the response shape before it's trusted
// anywhere else — same constructor-injection + throw-on-invalid-shape
// pattern as qualificationAiAnalysisService.js (PHASE 1), applied to the
// PHASE 2 proposal response contract instead.
//
// This service NEVER recomputes or overrides qualification_score/
// lead_status/pipeline_status — those stay 100% owned by
// qualificationScoringService.js's deterministic rules and are only ever
// read here (via the evidence bundle), never written.

const PROPOSAL_STATUS_VALUES = ['READY_FOR_REVIEW', 'NEEDS_HUMAN_REVIEW'];

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export class ProposalGenerationService {
  constructor({ llmClient = createLlmClient() } = {}) {
    this.llmClient = llmClient;
  }

  /**
   * Runs one evidence bundle through the LLM and returns the validated
   * proposal draft. Throws on any connectivity failure or shape/enum
   * violation — callers must treat a thrown error as "proposal generation
   * failed" and must never persist a fabricated fallback in its place (see
   * PHASE 2 spec §13).
   */
  async generate(evidence) {
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('ProposalGenerationService.generate() requires an evidence object.');
    }

    const { system, user } = buildProposalPrompt(evidence);
    const parsed = await this.llmClient.chat({ system, user });

    return this.#validate(parsed);
  }

  #validate(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI proposal response is not a JSON object.');
    }

    const { proposalStatus, recommendedProduct, estimatedFundingRequirement, proposalScore, rationale, missingInformation, email } = parsed;

    if (!PROPOSAL_STATUS_VALUES.includes(proposalStatus)) {
      throw new Error(`AI proposal response returned an invalid proposalStatus: ${JSON.stringify(proposalStatus)}.`);
    }

    if (recommendedProduct !== null) {
      if (
        typeof recommendedProduct !== 'object' ||
        Array.isArray(recommendedProduct) ||
        !isNonEmptyString(recommendedProduct.name) ||
        !isNonEmptyString(recommendedProduct.reason)
      ) {
        throw new Error('AI proposal response returned an invalid recommendedProduct (must be null or { name, reason } with non-empty strings).');
      }
    }

    if (
      !estimatedFundingRequirement ||
      typeof estimatedFundingRequirement !== 'object' ||
      Array.isArray(estimatedFundingRequirement)
    ) {
      throw new Error('AI proposal response returned an invalid estimatedFundingRequirement object.');
    }
    const { amount, currency, basis } = estimatedFundingRequirement;
    if (amount !== null && !(typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)) {
      throw new Error(`AI proposal response returned an invalid estimatedFundingRequirement.amount: ${JSON.stringify(amount)}.`);
    }
    if (currency !== 'INR') {
      throw new Error(`AI proposal response returned an invalid estimatedFundingRequirement.currency: ${JSON.stringify(currency)}.`);
    }
    if (!isNonEmptyString(basis)) {
      throw new Error('AI proposal response returned an empty estimatedFundingRequirement.basis.');
    }

    if (proposalScore !== null && !(typeof proposalScore === 'number' && Number.isInteger(proposalScore) && proposalScore >= 0 && proposalScore <= 100)) {
      throw new Error(`AI proposal response returned an invalid proposalScore: ${JSON.stringify(proposalScore)}.`);
    }

    if (!isStringArray(rationale) || rationale.length === 0) {
      throw new Error('AI proposal response returned an invalid or empty rationale array.');
    }
    if (!isStringArray(missingInformation)) {
      throw new Error('AI proposal response returned an invalid missingInformation array.');
    }

    if (!email || typeof email !== 'object' || Array.isArray(email) || !isNonEmptyString(email.subject) || !isNonEmptyString(email.body)) {
      throw new Error('AI proposal response returned an invalid email object (requires non-empty subject and body).');
    }

    return {
      proposalStatus,
      recommendedProduct,
      estimatedFundingRequirement: { amount, currency, basis },
      proposalScore,
      rationale,
      missingInformation,
      email: { subject: email.subject, body: email.body },
    };
  }
}