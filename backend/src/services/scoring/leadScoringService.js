import {
  TENDER_VALUE_RULES,
  GOVERNMENT_DEPARTMENT_RULES,
  INDUSTRY_RULES,
  BUSINESS_CATEGORY_RULES,
  SIGNAL_RULES,
  CONFIDENCE_RULES,
  GRADE_BANDS,
  MIN_SCORE,
  MAX_SCORE
} from './scoringRules.js';

// Pure, deterministic, rule-based lead scoring. No AI, no network calls,
// no database access — every function here is a plain synchronous
// transform of its input (a CompanyIntelligence object, as returned by
// src/services/companyIntelligenceService.js), so the whole module is
// directly unit-testable without mocking anything. All point values and
// thresholds live in ./scoringRules.js; nothing here is hardcoded.

function emptyMatch() {
  return { matched: false, label: null, points: 0 };
}

function extractTenderValueTier(sizeCategory) {
  if (!sizeCategory) return null;
  const upper = String(sizeCategory).toUpperCase();
  if (upper.includes('LARGE')) return 'Large';
  if (upper.includes('MEDIUM')) return 'Medium';
  if (upper.includes('SMALL')) return 'Small';
  return null;
}

/** Scores CompanyIntelligence.tenderValue.sizeCategory against TENDER_VALUE_RULES. */
export function scoreTenderValue(companyIntelligence = {}) {
  const tier = extractTenderValueTier(companyIntelligence.tenderValue?.sizeCategory);
  if (!tier) return emptyMatch();

  return { matched: true, label: tier, points: TENDER_VALUE_RULES[tier] ?? 0 };
}

/** Scores CompanyIntelligence.governmentDepartment against GOVERNMENT_DEPARTMENT_RULES (first pattern match wins). */
export function scoreGovernmentDepartment(companyIntelligence = {}) {
  const text = companyIntelligence.governmentDepartment;
  if (!text) return emptyMatch();

  const rule = GOVERNMENT_DEPARTMENT_RULES.find(({ pattern }) => pattern.test(text));
  if (!rule) return emptyMatch();

  return { matched: true, label: rule.label, points: rule.points };
}

/** Scores CompanyIntelligence.industry against INDUSTRY_RULES — matched case-insensitively against each rule's alias list, exact match only (no substring/fuzzy matching). */
export function scoreIndustry(companyIntelligence = {}) {
  const industry = companyIntelligence.industry;
  if (!industry) return emptyMatch();

  const industryUpper = String(industry).toUpperCase();
  const rule = INDUSTRY_RULES.find(({ aliases }) =>
    aliases.some((alias) => alias.toUpperCase() === industryUpper)
  );
  if (!rule) return emptyMatch();

  return { matched: true, label: rule.label, points: rule.points };
}

/** Scores CompanyIntelligence.businessCategory against BUSINESS_CATEGORY_RULES (case-insensitive substring match). */
export function scoreBusinessCategory(companyIntelligence = {}) {
  const businessCategory = companyIntelligence.businessCategory;
  if (!businessCategory) return emptyMatch();

  const lower = String(businessCategory).toLowerCase();
  const rule = BUSINESS_CATEGORY_RULES.find(({ keyword }) => lower.includes(keyword));
  if (!rule) return emptyMatch();

  return { matched: true, label: rule.label, points: rule.points };
}

/** Scores CompanyIntelligence.signals against SIGNAL_RULES — every rule whose aliases intersect the signals array fires. */
export function scoreSignals(companyIntelligence = {}) {
  const signals = Array.isArray(companyIntelligence.signals) ? companyIntelligence.signals : [];

  return SIGNAL_RULES
    .filter((rule) => rule.matchesAnyOf.some((alias) => signals.includes(alias)))
    .map((rule) => ({ label: rule.label, points: rule.points }));
}

/** Scores CompanyIntelligence.confidence.level against CONFIDENCE_RULES. */
export function scoreConfidence(companyIntelligence = {}) {
  const level = companyIntelligence.confidence?.level;
  if (!level) return emptyMatch();

  const matchedKey = Object.keys(CONFIDENCE_RULES).find(
    (key) => key.toUpperCase() === String(level).toUpperCase()
  );
  if (!matchedKey) return emptyMatch();

  return { matched: true, label: matchedKey, points: CONFIDENCE_RULES[matchedKey] };
}

/** Maps a numeric score to its grade band. Open-ended top/bottom bands guarantee every score resolves to exactly one grade. */
export function resolveGrade(score) {
  const band = GRADE_BANDS.find(({ minScore }) => score >= minScore);
  return band ? band.grade : GRADE_BANDS[GRADE_BANDS.length - 1].grade;
}

function buildReasons(breakdown) {
  const reasons = [];

  if (breakdown.tenderValue.matched) {
    reasons.push(`${breakdown.tenderValue.label} tender value (+${breakdown.tenderValue.points})`);
  }
  if (breakdown.governmentDepartment.matched) {
    reasons.push(`${breakdown.governmentDepartment.label} government department (+${breakdown.governmentDepartment.points})`);
  }
  if (breakdown.industry.matched) {
    reasons.push(`${breakdown.industry.label} industry (+${breakdown.industry.points})`);
  }
  if (breakdown.businessCategory.matched) {
    reasons.push(`${breakdown.businessCategory.label} business category (+${breakdown.businessCategory.points})`);
  }
  for (const signal of breakdown.signals) {
    reasons.push(`${signal.label} signal (+${signal.points})`);
  }
  if (breakdown.confidence.matched && breakdown.confidence.points > 0) {
    reasons.push(`${breakdown.confidence.label} confidence (+${breakdown.confidence.points})`);
  }

  return reasons;
}

/**
 * Scores a CompanyIntelligence object (as returned by
 * src/services/companyIntelligenceService.js) into a lead score. Pure
 * function — same input always produces the same output, no side effects.
 * Missing/unrecognized fields simply contribute 0 points rather than
 * throwing, so a sparse CompanyIntelligence object still scores (typically
 * into LOW PRIORITY) instead of crashing the caller.
 */
export function scoreLead(companyIntelligence = {}) {
  const breakdown = {
    tenderValue: scoreTenderValue(companyIntelligence),
    governmentDepartment: scoreGovernmentDepartment(companyIntelligence),
    industry: scoreIndustry(companyIntelligence),
    businessCategory: scoreBusinessCategory(companyIntelligence),
    signals: scoreSignals(companyIntelligence),
    confidence: scoreConfidence(companyIntelligence)
  };

  const rawScore =
    breakdown.tenderValue.points +
    breakdown.governmentDepartment.points +
    breakdown.industry.points +
    breakdown.businessCategory.points +
    breakdown.signals.reduce((sum, signal) => sum + signal.points, 0) +
    breakdown.confidence.points;

  const score = Math.min(MAX_SCORE, Math.max(MIN_SCORE, rawScore));
  const grade = resolveGrade(score);
  const confidence = companyIntelligence.confidence?.level ?? 'Low';
  const reasons = buildReasons(breakdown);

  return { score, grade, confidence, reasons, breakdown };
}

/**
 * Class wrapper matching the CompanyIntelligenceService convention
 * (src/services/companyIntelligenceService.js) for callers that prefer an
 * instantiable service over standalone functions. Stateless, so a single
 * instance can be reused across requests.
 */
export class LeadScoringService {
  score(companyIntelligence) {
    return scoreLead(companyIntelligence);
  }
}