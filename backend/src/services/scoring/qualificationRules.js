// Centralized, editable rule set for qualificationScoringService.js — the
// deterministic (no AI) Lead Qualification score. Every point value the
// scorer can award lives here, same convention as ./scoringRules.js (used
// by leadScoringService.js for the separate Health Check feature — this
// file is independent of that one so tuning either never affects the
// other).
//
// Ten named factors, weights sum to exactly 100:
//   tender value (15) + government relevance (10) + business/tender fit (10)
//   + data completeness (10) + winning company availability (10)
//   + Probe42 profile availability (10) + revenue strength (12)
//   + net profit strength (12) + credit rating (6) + compliance status (5)
// A factor that is genuinely unavailable (no data) contributes 0 — never a
// guessed positive or negative value.

export const TENDER_VALUE_POINTS = { Large: 15, Medium: 10, Small: 5 };

export const GOVERNMENT_RELEVANCE_POINTS = 10;

// Matches CompanyIntelligenceService's businessCategory labels
// (src/services/companyIntelligenceService.js) exactly.
export const BUSINESS_FIT_POINTS = {
  'Works Contract': 10,
  'Services / AMC': 8,
  'Goods Supply': 6,
  'Lease / Rental': 4,
  'Auction / Disposal': 2,
  'General Procurement': 0,
};

// Data completeness: 2 points per present field, up to the 10-point cap.
export const DATA_COMPLETENESS_FIELD_POINTS = 2;
export const DATA_COMPLETENESS_MAX_POINTS = 10;

export const WINNING_COMPANY_AVAILABLE_POINTS = 10;
export const PROBE42_PROFILE_AVAILABLE_POINTS = 10;

// Annual revenue tiers (INR). Only applied when a Probe42 profile was found
// — no profile means "unavailable", scored 0, never guessed.
export const REVENUE_STRENGTH_RULES = [
  { minValue: 100000000, points: 12 }, // >= Rs. 10 Cr
  { minValue: 10000000, points: 8 },   // >= Rs. 1 Cr
  { minValue: 0.01, points: 4 },       // any positive disclosed revenue
];
export const REVENUE_STRENGTH_MAX_POINTS = 12;

// Net profit tiers (INR). A disclosed loss/breakeven (<= 0) is a real,
// negative signal — scored 0, same as "unavailable" — never inflated.
export const NET_PROFIT_STRENGTH_RULES = [
  { minValue: 5000000, points: 12 }, // >= Rs. 50 Lac
  { minValue: 0.01, points: 6 },     // any positive disclosed profit
];
export const NET_PROFIT_STRENGTH_MAX_POINTS = 12;

// Matched against the first letters of the stored rating string
// (case-insensitive), most-specific pattern first.
export const CREDIT_RATING_RULES = [
  { pattern: /^AAA/i, points: 6 },
  { pattern: /^AA/i, points: 6 },
  { pattern: /^A/i, points: 5 },
  { pattern: /^BBB/i, points: 4 },
  { pattern: /^BB/i, points: 2 },
  { pattern: /^B/i, points: 1 },
];
export const CREDIT_RATING_UNRECOGNIZED_POINTS = 1;

// Real Probe42 exports report compliance as "Active Compliant" /
// "Active Non-compliant" (see scripts/importProbe42Xls.js), not the old
// demo vocabulary ("Compliant" / "Minor Delays") this table originally
// only covered — both vocabularies are kept here rather than replaced, so
// point values stay exactly as before for either wording.
const COMPLIANCE_STATUS_POINT_RULES = {
  'compliant': 5,
  'active compliant': 5, // same positive score "Compliant" already had
  'minor delays': 2,
  'active non-compliant': 0, // must NOT receive the compliant score
};

function normalizeComplianceKey(value) {
  return String(value).trim().toLowerCase();
}

/**
 * Case/whitespace-insensitive compliance-status -> points lookup, exposed
 * as a Proxy so qualificationScoringService.js's existing
 * `COMPLIANCE_STATUS_POINTS[status]` bracket lookup keeps working
 * unchanged while gaining that robustness — the normalization lives here,
 * not there.
 */
export const COMPLIANCE_STATUS_POINTS = new Proxy(COMPLIANCE_STATUS_POINT_RULES, {
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    return target[normalizeComplianceKey(prop)];
  },
});

export const QUALIFICATION_MIN_SCORE = 0;
export const QUALIFICATION_MAX_SCORE = 100;

// Exact business thresholds — see PHASE 1 spec. Do not let any other
// component (LLM or otherwise) decide these boundaries.
//   0 <= score <= 59      -> QUALIFIED_BAD
//   60 <= score <= 79     -> QUALIFIED_HITL
//   80 <= score <= 100    -> QUALIFIED_GOOD
export const QUALIFIED_BAD_MAX = 59;
export const QUALIFIED_HITL_MIN = 60;
export const QUALIFIED_HITL_MAX = 79;
export const QUALIFIED_GOOD_MIN = 80;