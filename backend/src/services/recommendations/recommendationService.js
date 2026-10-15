import { RECOMMENDATION_RULES, PRIORITY_RANK } from './recommendationRules.js';

// Pure, deterministic, rule-based banking product recommendations. No AI,
// no network calls, no database access — generateRecommendations() is a
// plain synchronous transform of its two inputs (a CompanyIntelligence
// object and a LeadScoring result), so the whole module is directly
// unit-testable without mocking anything. All business rules live in
// ./recommendationRules.js; this file only evaluates them.

/** Resolves a rule field that may be a static value or a `(companyIntelligence, leadScoring) => value` function. */
function resolve(value, companyIntelligence, leadScoring) {
  return typeof value === 'function' ? value(companyIntelligence, leadScoring) : value;
}

/** Evaluates every configured rule and returns the ones whose condition matches, before deduplication/sorting. */
export function evaluateRules(companyIntelligence = {}, leadScoring = {}) {
  return RECOMMENDATION_RULES
    .filter((rule) => rule.condition(companyIntelligence, leadScoring))
    .map((rule) => ({
      product: rule.product,
      priority: rule.priority,
      confidence: resolve(rule.confidence, companyIntelligence, leadScoring),
      reason: resolve(rule.reason, companyIntelligence, leadScoring),
      triggeredBy: rule.triggeredBy
    }));
}

/** True if `candidate` should replace `current` as the recommendation kept for a given product: higher priority wins, ties broken by higher confidence. */
function isStrictlyBetter(candidate, current) {
  const candidateRank = PRIORITY_RANK[candidate.priority] ?? 0;
  const currentRank = PRIORITY_RANK[current.priority] ?? 0;
  if (candidateRank !== currentRank) return candidateRank > currentRank;
  return candidate.confidence > current.confidence;
}

/**
 * Keeps exactly one recommendation per product. When more than one rule
 * recommends the same product (e.g. "Large Tender" and "Lead Score >= 90"
 * both recommending Working Capital Loan), the higher-priority one wins,
 * with confidence as the tiebreaker.
 */
export function deduplicateByProduct(recommendations) {
  const byProduct = new Map();

  for (const recommendation of recommendations) {
    const existing = byProduct.get(recommendation.product);
    if (!existing || isStrictlyBetter(recommendation, existing)) {
      byProduct.set(recommendation.product, recommendation);
    }
  }

  return Array.from(byProduct.values());
}

/** Sorts recommendations by priority (HIGH first), then by confidence (highest first). */
export function sortRecommendations(recommendations) {
  return [...recommendations].sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    return b.confidence - a.confidence;
  });
}

/**
 * Generates deduplicated, priority/confidence-sorted banking product
 * recommendations from a CompanyIntelligence object
 * (src/services/companyIntelligenceService.js) and a LeadScoring result
 * (src/services/scoring/leadScoringService.js#scoreLead). Pure function —
 * same input always produces the same output, no side effects.
 */
export function generateRecommendations(companyIntelligence = {}, leadScoring = {}) {
  const evaluated = evaluateRules(companyIntelligence, leadScoring);
  const deduplicated = deduplicateByProduct(evaluated);
  const recommendedProducts = sortRecommendations(deduplicated);

  return { recommendedProducts };
}

/**
 * Class wrapper matching the CompanyIntelligenceService/LeadScoringService
 * convention for callers that prefer an instantiable service over
 * standalone functions. Stateless, so a single instance can be reused
 * across requests.
 */
export class BankingRecommendationService {
  generateRecommendations(companyIntelligence, leadScoring) {
    return generateRecommendations(companyIntelligence, leadScoring);
  }
}