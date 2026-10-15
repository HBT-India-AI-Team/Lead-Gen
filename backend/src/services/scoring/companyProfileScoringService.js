// Deterministic 0-100 scores computed directly from one company's real
// probe42_demo_profiles row (see src/repositories/probe42Repository.js) —
// no AI, no network call, same-input-same-output every time. Distinct from
// qualificationScoringService.js's tender-level qualification score (which
// blends revenue/profit with tender-specific factors); these two are
// company-level scores, standalone, meant to be checked per company on the
// Settings > Lead Management > Score Thresholds panel.
//
// Both return `null` when there's no Probe42 profile at all for the company
// (nothing to compute from) — never a guessed/fabricated number. A profile
// that exists but is missing an individual field (e.g. no net_profit)
// naturally scores that component's points as 0, mirroring
// qualificationRules.js's "genuinely unavailable data contributes 0, never
// a guessed positive or negative value" convention.

// Same real annual-revenue tier boundaries qualificationRules.js's
// REVENUE_STRENGTH_RULES already uses (>= Rs 10 Cr / >= Rs 1 Cr / any
// positive disclosed) — re-scaled onto this score's own 0-50 half of the
// 0-100 scale rather than reusing those point values directly, since this
// is a different, standalone score.
const REVENUE_HEALTH_RULES = [
  { minValue: 100000000, points: 50 }, // >= Rs. 10 Cr
  { minValue: 10000000, points: 35 },  // >= Rs. 1 Cr
  { minValue: 0.01, points: 15 },      // any positive disclosed revenue
];

// Same real net-profit tier boundaries qualificationRules.js's
// NET_PROFIT_STRENGTH_RULES uses (>= Rs 50 Lac / any positive disclosed). A
// disclosed loss or breakeven (<= 0) is a real negative signal, scored 0 —
// same as "not disclosed", never inflated.
const NET_PROFIT_HEALTH_RULES = [
  { minValue: 5000000, points: 50 }, // >= Rs. 50 Lac
  { minValue: 0.01, points: 30 },    // any positive disclosed profit
];

function tieredPoints(value, rules) {
  if (value === null || value === undefined) return 0;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  const rule = rules.find(({ minValue }) => numeric >= minValue);
  return rule?.points ?? 0;
}

/**
 * Financial Health Score (0-100) = revenue tier (0-50) + net profit tier
 * (0-50), for one company's real Probe42 profile. Returns null if there's
 * no profile to score at all (distinct from a real 0, which means "profile
 * found but no positive revenue/profit disclosed").
 */
export function computeFinancialHealthScore(probe42Profile) {
  if (!probe42Profile) return null;

  const revenuePoints = tieredPoints(probe42Profile.annual_revenue, REVENUE_HEALTH_RULES);
  const netProfitPoints = tieredPoints(probe42Profile.net_profit, NET_PROFIT_HEALTH_RULES);

  return {
    score: revenuePoints + netProfitPoints,
    revenuePoints,
    netProfitPoints,
  };
}

// Years-in-operation tiers for Business Vintage/Stability — a newer company
// hasn't yet demonstrated it can survive a full business cycle, so the
// scale weights longer real operating history more heavily. Deliberately
// coarse (six bands) rather than a continuous formula, matching the
// band-driven UI (ScoreThresholdSlider) this feeds.
const VINTAGE_YEAR_RULES = [
  { minYears: 15, points: 100 },
  { minYears: 10, points: 85 },
  { minYears: 5, points: 70 },
  { minYears: 3, points: 50 },
  { minYears: 1, points: 30 },
  { minYears: 0, points: 10 },
];

function yearsSinceIncorporation(incorporationDate) {
  const then = new Date(incorporationDate);
  if (Number.isNaN(then.getTime())) return null;
  const years = (Date.now() - then.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(years));
}

/**
 * Business Vintage / Stability Score (0-100), computed from real years in
 * operation (today - probe42Profile.incorporation_date). Returns null if
 * there's no profile, or the profile has no usable incorporation_date —
 * never a guessed vintage.
 */
export function computeBusinessVintageScore(probe42Profile) {
  if (!probe42Profile?.incorporation_date) return null;

  const yearsInOperation = yearsSinceIncorporation(probe42Profile.incorporation_date);
  if (yearsInOperation === null) return null;

  const rule = VINTAGE_YEAR_RULES.find(({ minYears }) => yearsInOperation >= minYears);

  return {
    score: rule?.points ?? 0,
    yearsInOperation,
  };
}

// Credit Rating Score — a 0-100 score derived from Probe42's own
// credit_rating field (an agency letter grade like "AA-", "BBB+" — see
// probe42Repository.js and scripts/importProbe42Xls.js), NOT a raw 300-900
// bureau score (no CIBIL bureau connection exists anywhere in this
// codebase; the "CIBIL Score" label was renamed to avoid implying that).
// Base score per broad grade, most-specific pattern first (mirrors
// qualificationRules.js's CREDIT_RATING_RULES ordering), then a +/- modifier
// for the grade's notch. Real observed values in probe42_demo_profiles today
// are just "A" and "AA-" (4-row demo dataset), so this table covers the
// full standard CRISIL/ICRA-style scale (AAA down to D) rather than only
// what's currently present, so a wider real dataset scores correctly too.
const CREDIT_RATING_BASE_SCORES = [
  { pattern: /^AAA/i, base: 97 },
  { pattern: /^AA/i, base: 87 },
  { pattern: /^A/i, base: 72 },
  { pattern: /^BBB/i, base: 57 },
  { pattern: /^BB/i, base: 40 },
  { pattern: /^B/i, base: 20 },
  { pattern: /^C/i, base: 10 },
  { pattern: /^D/i, base: 0 },
];

function ratingModifier(rating) {
  if (rating.endsWith('+')) return 4;
  if (rating.endsWith('-')) return -4;
  return 0;
}

/**
 * Credit Rating Score (0-100), computed from Probe42's credit_rating grade.
 * Returns null if there's no profile, no rating on file, or the rating
 * string doesn't match any known grade prefix — never a guessed score.
 */
export function computeCreditRatingScore(probe42Profile) {
  const rating = probe42Profile?.credit_rating ? String(probe42Profile.credit_rating).trim() : '';
  if (!rating) return null;

  const rule = CREDIT_RATING_BASE_SCORES.find(({ pattern }) => pattern.test(rating));
  if (!rule) return null;

  const score = Math.min(100, Math.max(0, rule.base + ratingModifier(rating)));
  return { score, rating };
}

// Compliance Score — a 0-100 score derived from Probe42's own
// compliance_status field, NOT actual GSTN filing data (no GSTN connection
// exists anywhere in this codebase; the "GST Compliance Score" label was
// renamed to avoid implying that). Reuses the same normalized vocabulary
// qualificationRules.js's COMPLIANCE_STATUS_POINTS already covers (both the
// original demo wording and the real Probe42 XLS export wording — see that
// file's own comment) plus two additional real-world statuses this scale
// should still handle even though they haven't appeared in the 4-row demo
// dataset yet.
const COMPLIANCE_STATUS_SCORES = {
  'compliant': 95,
  'active compliant': 95,
  'minor delays': 75,
  'non-compliant': 30,
  'active non-compliant': 30,
  'under investigation': 15,
  'struck off': 0,
};

/**
 * Compliance Score (0-100), computed from Probe42's compliance_status.
 * Returns null if there's no profile, no status on file, or the status
 * string doesn't match a known value — never a guessed score.
 */
export function computeComplianceScore(probe42Profile) {
  const status = probe42Profile?.compliance_status ? String(probe42Profile.compliance_status).trim() : '';
  if (!status) return null;

  const score = COMPLIANCE_STATUS_SCORES[status.toLowerCase()];
  if (score === undefined) return null;

  return { score, status };
}
