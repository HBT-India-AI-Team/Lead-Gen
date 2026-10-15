import { CompanyIntelligenceService } from '../companyIntelligenceService.js';
import {
  TENDER_VALUE_POINTS,
  GOVERNMENT_RELEVANCE_POINTS,
  BUSINESS_FIT_POINTS,
  DATA_COMPLETENESS_FIELD_POINTS,
  DATA_COMPLETENESS_MAX_POINTS,
  WINNING_COMPANY_AVAILABLE_POINTS,
  PROBE42_PROFILE_AVAILABLE_POINTS,
  REVENUE_STRENGTH_RULES,
  REVENUE_STRENGTH_MAX_POINTS,
  NET_PROFIT_STRENGTH_RULES,
  NET_PROFIT_STRENGTH_MAX_POINTS,
  CREDIT_RATING_RULES,
  CREDIT_RATING_UNRECOGNIZED_POINTS,
  COMPLIANCE_STATUS_POINTS,
  QUALIFICATION_MIN_SCORE,
  QUALIFICATION_MAX_SCORE,
  QUALIFIED_BAD_MAX,
  QUALIFIED_HITL_MIN,
  QUALIFIED_HITL_MAX,
  QUALIFIED_GOOD_MIN,
} from './qualificationRules.js';

// Deterministic (no AI, no network call) Lead Qualification scorer for
// PHASE 1. Pure functions only — same tender + Probe42 profile input always
// produces the same score, so this is directly unit-testable and never
// varies between runs. Reuses CompanyIntelligenceService
// (src/services/companyIntelligenceService.js, already proven by the
// Health Check feature) for the tender-side classification (industry/
// businessCategory/government-buyer signal) rather than re-deriving that
// logic — this file only adds the NEW factors PHASE 1 needs: winning
// company / Probe42 availability, revenue, net profit, credit rating,
// compliance. It never modifies CompanyIntelligenceService or
// leadScoringService.js, so the existing Health Check feature's output is
// completely unaffected by this file's existence.

function extractTenderValueTier(sizeCategory) {
  if (!sizeCategory) return null;
  const upper = String(sizeCategory).toUpperCase();
  if (upper.includes('LARGE')) return 'Large';
  if (upper.includes('MEDIUM')) return 'Medium';
  if (upper.includes('SMALL')) return 'Small';
  return null;
}

function scoreTenderValue(intelligence) {
  const tier = extractTenderValueTier(intelligence.tenderValue?.sizeCategory);
  if (!tier) return { matched: false, label: 'Unknown', points: 0 };
  return { matched: true, label: tier, points: TENDER_VALUE_POINTS[tier] ?? 0 };
}

function scoreGovernmentRelevance(intelligence) {
  const isGovernment = Array.isArray(intelligence.signals) && intelligence.signals.includes('Government Buyer');
  return { matched: isGovernment, label: isGovernment ? 'Government Buyer' : 'Not a government buyer', points: isGovernment ? GOVERNMENT_RELEVANCE_POINTS : 0 };
}

function scoreBusinessFit(intelligence) {
  const category = intelligence.businessCategory;
  const points = BUSINESS_FIT_POINTS[category] ?? 0;
  return { matched: Boolean(category), label: category ?? 'Unknown', points };
}

/** Counts how many of the tender's key descriptive fields are actually present. */
function scoreDataCompleteness(tender) {
  const fields = [
    tender.title,
    tender.description,
    tender.category,
    tender.amount_value,
    tender.tender_state || tender.tender_district || tender.tender_city,
    tender.closing_date || tender.contract_date,
  ];
  const presentCount = fields.filter((value) => value !== null && value !== undefined && value !== '').length;
  const points = Math.min(DATA_COMPLETENESS_MAX_POINTS, presentCount * DATA_COMPLETENESS_FIELD_POINTS);
  return { matched: presentCount > 0, label: `${presentCount}/${fields.length} key fields present`, points };
}

function scoreWinningCompanyAvailability(tender) {
  const available = Boolean(tender.winning_company_name);
  return { matched: available, label: available ? 'Winning company identified' : 'Winning company not yet identified', points: available ? WINNING_COMPANY_AVAILABLE_POINTS : 0 };
}

function scoreProbe42Availability(probe42Profile) {
  const available = Boolean(probe42Profile);
  return { matched: available, label: available ? 'Found' : 'Unavailable', points: available ? PROBE42_PROFILE_AVAILABLE_POINTS : 0 };
}

// Row labels (e.g. "Revenue", "Net Profit") already state the field on the
// frontend (ScoreBreakdown.tsx) — factor labels here must carry only the
// raw value, never the field name again, or the breakdown panel reads as
// "Revenue: Annual revenue 5,47,80,00,000". `-` sign (if any) sorts before
// `₹`, matching how negative currency is conventionally written.
function formatInr(value) {
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN')}`;
}

function tieredScore(value, rules) {
  if (value === null || value === undefined) return { matched: false, points: 0 };
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return { matched: false, points: 0 };

  const rule = rules.find(({ minValue }) => numeric >= minValue);
  return { matched: true, points: rule?.points ?? 0, numeric };
}

function scoreRevenueStrength(probe42Profile) {
  if (!probe42Profile) return { matched: false, label: 'Probe42 profile unavailable', points: 0 };
  const { matched, points, numeric } = tieredScore(probe42Profile.annual_revenue, REVENUE_STRENGTH_RULES);
  if (!matched) return { matched: false, label: 'Not disclosed', points: 0 };
  return { matched: true, label: formatInr(numeric), points };
}

function scoreNetProfitStrength(probe42Profile) {
  if (!probe42Profile) return { matched: false, label: 'Probe42 profile unavailable', points: 0 };
  const { matched, points, numeric } = tieredScore(probe42Profile.net_profit, NET_PROFIT_STRENGTH_RULES);
  if (!matched) return { matched: false, label: 'Not disclosed', points: 0 };
  if (points === 0) return { matched: true, label: `${formatInr(numeric)} (breakeven or loss)`, points: 0 };
  return { matched: true, label: formatInr(numeric), points };
}

function scoreCreditRating(probe42Profile) {
  const rating = probe42Profile?.credit_rating;
  if (!rating) return { matched: false, label: 'Unavailable', points: 0 };

  const rule = CREDIT_RATING_RULES.find(({ pattern }) => pattern.test(String(rating).trim()));
  const points = rule ? rule.points : CREDIT_RATING_UNRECOGNIZED_POINTS;
  return { matched: true, label: String(rating), points };
}

function scoreComplianceStatus(probe42Profile) {
  const status = probe42Profile?.compliance_status;
  if (!status) return { matched: false, label: 'Unavailable', points: 0 };
  const points = COMPLIANCE_STATUS_POINTS[status] ?? 0;
  return { matched: true, label: status, points };
}

/**
 * Computes the deterministic 0-100 qualification score for one tender.
 * `probe42Profile` is the row returned by
 * src/repositories/probe42Repository.js's findByCompanyName(), or null if
 * no winning company is known yet or none was found — never fabricated.
 * Returns { score, factors, reasons } where `factors` is the full
 * named-factor breakdown (persisted as-is into tenders.qualification_reason
 * so the UI can explain the score later) and `reasons` is a flat list of
 * human-readable strings for the factors that actually contributed points.
 */
export function computeQualificationScore(tender, probe42Profile, { companyIntelligenceService = new CompanyIntelligenceService() } = {}) {
  const intelligence = companyIntelligenceService.generateIntelligence(tender);

  const factors = {
    tenderValue: scoreTenderValue(intelligence),
    governmentRelevance: scoreGovernmentRelevance(intelligence),
    businessFit: scoreBusinessFit(intelligence),
    dataCompleteness: scoreDataCompleteness(tender),
    winningCompanyAvailability: scoreWinningCompanyAvailability(tender),
    probe42Availability: scoreProbe42Availability(probe42Profile),
    revenueStrength: scoreRevenueStrength(probe42Profile),
    netProfitStrength: scoreNetProfitStrength(probe42Profile),
    creditRating: scoreCreditRating(probe42Profile),
    complianceStatus: scoreComplianceStatus(probe42Profile),
  };

  const rawScore = Object.values(factors).reduce((sum, factor) => sum + factor.points, 0);
  const score = Math.min(QUALIFICATION_MAX_SCORE, Math.max(QUALIFICATION_MIN_SCORE, rawScore));

  const reasons = Object.entries(factors)
    .filter(([, factor]) => factor.matched)
    .map(([key, factor]) => `${factor.label} (+${factor.points})`);

  return { score, factors, reasons };
}

/**
 * Converts a 0-100 score into the exact lead_status per the fixed business
 * thresholds (PHASE 1 spec):
 *   0 <= score <= 59      -> QUALIFIED_BAD
 *   60 <= score <= 79     -> QUALIFIED_HITL
 *   80 <= score <= 100    -> QUALIFIED_GOOD
 * These boundaries are owned by application business logic only — never by
 * an LLM or any other component.
 */
export function resolveLeadStatusFromScore(score) {
  if (score <= QUALIFIED_BAD_MAX) return 'QUALIFIED_BAD';
  if (score >= QUALIFIED_HITL_MIN && score <= QUALIFIED_HITL_MAX) return 'QUALIFIED_HITL';
  if (score >= QUALIFIED_GOOD_MIN) return 'QUALIFIED_GOOD';
  // Unreachable for any integer score in [0,100] given the thresholds
  // above, but kept explicit rather than silently falling through.
  throw new Error(`Score ${score} did not resolve to any lead status band.`);
}

/** Maps a completed qualification's lead_status to its pipeline_status, per the PHASE 1 transition table. */
export function resolvePipelineStatusFromLeadStatus(leadStatus) {
  switch (leadStatus) {
    case 'QUALIFIED_BAD':
      return 'ON_HOLD';
    case 'QUALIFIED_HITL':
      return 'AWAITING_QUALITY_REVIEW';
    case 'QUALIFIED_GOOD':
      return 'READY_FOR_PROPOSAL';
    default:
      throw new Error(`"${leadStatus}" is not a completed qualification lead_status.`);
  }
}