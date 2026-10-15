import { CompanyIntelligenceService } from './companyIntelligenceService.js';
import { LeadScoringService } from './scoring/leadScoringService.js';
import { BankingRecommendationService } from './recommendations/recommendationService.js';

// Bump whenever the shape of generateLeadAnalysis()'s response changes —
// exposed in metadata.version so API consumers can detect a breaking
// change to this aggregate response.
const LEAD_ANALYSIS_VERSION = '1.0.0';

/**
 * Aggregates CompanyIntelligenceService, LeadScoringService and
 * BankingRecommendationService into one response for a single tender
 * record. This class contains no business rules of its own — every
 * decision (how to classify an industry, how to score a lead, which
 * product to recommend) already lives in the three injected services;
 * this only calls them in sequence and assembles their outputs. No AI, no
 * database access, no network calls — purely in-memory orchestration, so
 * it's as fast and deterministic as its three dependencies are.
 *
 * The three dependencies are constructor-injected (defaulting to the real
 * services) so callers — and tests — can supply stubs/mocks without this
 * class needing to know how to construct them.
 */
export class LeadAnalysisService {
  constructor({
    companyIntelligenceService = new CompanyIntelligenceService(),
    leadScoringService = new LeadScoringService(),
    bankingRecommendationService = new BankingRecommendationService()
  } = {}) {
    this.companyIntelligenceService = companyIntelligenceService;
    this.leadScoringService = leadScoringService;
    this.bankingRecommendationService = bankingRecommendationService;
  }

  /**
   * Lightweight "who is this about" summary, read directly off the
   * already-computed CompanyIntelligence — no new derivation, just a
   * convenience projection so callers don't have to dig into
   * `intelligence` for the company's identifying fields.
   */
  #summarizeCompany(intelligence) {
    return {
      name: intelligence.companyName,
      industry: intelligence.industry,
      location: intelligence.location
    };
  }

  /**
   * Runs one tender record through all three services and assembles the
   * combined result. Synchronous, since none of the three dependencies do
   * any I/O.
   */
  generateLeadAnalysis(tenderRecord = {}) {
    const startedAt = Date.now();

    const intelligence = this.companyIntelligenceService.generateIntelligence(tenderRecord);
    const score = this.leadScoringService.score(intelligence);
    const recommendations = this.bankingRecommendationService.generateRecommendations(intelligence, score);

    const company = this.#summarizeCompany(intelligence);
    const processingTime = Date.now() - startedAt;

    return {
      company,
      intelligence,
      score,
      recommendations,
      metadata: {
        generatedAt: new Date().toISOString(),
        version: LEAD_ANALYSIS_VERSION,
        processingTime
      }
    };
  }
}

// Convenience singleton for callers (e.g. the controller) that don't need
// custom dependency injection. Stateless, so it's safe to share.
export const leadAnalysisService = new LeadAnalysisService();

/** Functional convenience wrapper around the default singleton instance. */
export function generateLeadAnalysis(tenderRecord) {
  return leadAnalysisService.generateLeadAnalysis(tenderRecord);
}