import { CompanyIntelligenceService } from '../companyIntelligenceService.js';
import { FEATURE_SCHEMA_VERSION, OUT_OF_DISTRIBUTION_MAX_Z, POOLED_SEGMENT } from './mlConfig.js';

// Turns one tender + its winning company's Probe42 profile into the
// numeric feature vector the qualification model consumes. Uses exactly
// the inputs qualificationScoringService.js already scores from (the same
// CompanyIntelligenceService read of the tender, the same Probe42 row), so
// the model and the rules engine always look at the same evidence — the
// model just learns its own weights for it from real outcomes.
//
// Missing data is never encoded as a "bad" value: every optional input has
// a *_known / *_disclosed flag, and its value column is 0 when unknown.

const BUSINESS_CATEGORY_FEATURES = {
  'Works Contract': 'category_works',
  'Services / AMC': 'category_services',
  'Goods Supply': 'category_goods',
  'Lease / Rental': 'category_lease',
  'Auction / Disposal': 'category_auction',
};

// Order is the vector order. `kind: 'continuous'` features are range-
// checked by the out-of-distribution guard (only when their `knownFlag`,
// if any, is 1); binary features only by "was this value ever seen".
export const FEATURES = [
  { name: 'government_buyer', label: 'Government buyer', kind: 'binary' },
  { name: 'category_works', label: 'Category: works contract', kind: 'binary' },
  { name: 'category_services', label: 'Category: services / AMC', kind: 'binary' },
  { name: 'category_goods', label: 'Category: goods supply', kind: 'binary' },
  { name: 'category_lease', label: 'Category: lease / rental', kind: 'binary' },
  { name: 'category_auction', label: 'Category: auction / disposal', kind: 'binary' },
  { name: 'tender_amount_known', label: 'Tender amount known', kind: 'binary' },
  { name: 'log_tender_amount', label: 'Tender amount (log₁₀ ₹)', kind: 'continuous', knownFlag: 'tender_amount_known' },
  { name: 'data_completeness', label: 'Tender data completeness', kind: 'continuous' },
  { name: 'winning_company_known', label: 'Winning company identified', kind: 'binary' },
  { name: 'probe42_found', label: 'Probe42 profile found', kind: 'binary' },
  { name: 'revenue_disclosed', label: 'Revenue disclosed', kind: 'binary' },
  { name: 'log_revenue', label: 'Annual revenue (log₁₀ ₹)', kind: 'continuous', knownFlag: 'revenue_disclosed' },
  { name: 'profit_disclosed', label: 'Net profit disclosed', kind: 'binary' },
  { name: 'net_margin', label: 'Net profit margin', kind: 'continuous', knownFlag: 'profit_disclosed' },
  { name: 'rating_known', label: 'Credit rating available', kind: 'binary' },
  { name: 'credit_rating_grade', label: 'Credit rating grade', kind: 'continuous', knownFlag: 'rating_known' },
  { name: 'compliance_known', label: 'Compliance status known', kind: 'binary' },
  { name: 'compliance_score', label: 'Compliance status', kind: 'continuous', knownFlag: 'compliance_known' },
];

export const FEATURE_NAMES = FEATURES.map((feature) => feature.name);

// Stored on every model as feature_schema, so a model is never fed a
// vector it wasn't trained on.
export function currentFeatureSchema() {
  return { version: FEATURE_SCHEMA_VERSION, features: FEATURES };
}

// Same leading-pattern idea as qualificationRules.js CREDIT_RATING_RULES
// (most specific first), mapped onto a 0-1 grade instead of points.
const CREDIT_GRADES = [
  { pattern: /^AAA/, grade: 1.0 },
  { pattern: /^AA/, grade: 0.9 },
  { pattern: /^A/, grade: 0.75 },
  { pattern: /^BBB/, grade: 0.6 },
  { pattern: /^BB/, grade: 0.45 },
  { pattern: /^B/, grade: 0.3 },
  { pattern: /^C/, grade: 0.15 },
  { pattern: /^D/, grade: 0 },
];
const UNRECOGNIZED_RATING_GRADE = 0.3;

function creditRatingGrade(rating) {
  const normalized = String(rating).trim().toUpperCase();
  const match = CREDIT_GRADES.find(({ pattern }) => pattern.test(normalized));
  if (!match) return UNRECOGNIZED_RATING_GRADE;
  const notch = normalized.includes('+') ? 0.05 : normalized.includes('-') ? -0.05 : 0;
  return Math.min(1, Math.max(0, match.grade + notch));
}

// Both compliance vocabularies qualificationRules.js accepts.
const COMPLIANCE_SCORES = {
  'compliant': 1,
  'active compliant': 1,
  'minor delays': 0.5,
  'active non-compliant': 0,
};
const UNRECOGNIZED_COMPLIANCE_SCORE = 0.25;

const REGIONS = {
  south: ['Andhra Pradesh', 'Karnataka', 'Kerala', 'Tamil Nadu', 'Telangana', 'Puducherry', 'Lakshadweep', 'Andaman and Nicobar Islands'],
  west: ['Goa', 'Gujarat', 'Maharashtra', 'Dadra and Nagar Haveli and Daman and Diu'],
  north: ['Chandigarh', 'Delhi', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Ladakh', 'Punjab', 'Rajasthan', 'Uttar Pradesh', 'Uttarakhand'],
  central: ['Chhattisgarh', 'Madhya Pradesh'],
  east: ['Bihar', 'Jharkhand', 'Odisha', 'West Bengal'],
  northeast: ['Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'],
};
const REGION_BY_STATE = new Map(
  Object.entries(REGIONS).flatMap(([region, states]) => states.map((state) => [state.toLowerCase(), region]))
);

function slugify(value) {
  return String(value).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unclassified';
}

function log10OrZero(value) {
  return value > 0 ? Math.log10(value) : 0;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

/**
 * Segment of a lead: sector from the tender's classified industry, region
 * from its state. `keys` is the fallback chain, most specific first:
 * exact segment → sector only → pooled.
 */
export function segmentOf(tender, intelligence = new CompanyIntelligenceService().generateIntelligence(tender)) {
  const sector = slugify(intelligence.industry ?? 'Unclassified');
  const region = REGION_BY_STATE.get(String(tender.tender_state ?? '').trim().toLowerCase()) ?? 'unknown';
  return {
    sector,
    region,
    keys: [`sector=${sector}|region=${region}`, `sector=${sector}`, POOLED_SEGMENT],
  };
}

/**
 * Builds the feature vector for one lead. Returns `values` (ordered as
 * FEATURES, what the model consumes), `named` (same values keyed by
 * feature name — what's stored on ml_predictions for audit) and `segment`.
 */
export function extractFeatures(tender, probe42Profile, { companyIntelligenceService = new CompanyIntelligenceService() } = {}) {
  const intelligence = companyIntelligenceService.generateIntelligence(tender);
  const named = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0]));

  named.government_buyer = Array.isArray(intelligence.signals) && intelligence.signals.includes('Government Buyer') ? 1 : 0;
  const categoryFeature = BUSINESS_CATEGORY_FEATURES[intelligence.businessCategory];
  if (categoryFeature) named[categoryFeature] = 1;

  const amount = toNumber(tender.amount_value);
  if (amount !== null && amount > 0) {
    named.tender_amount_known = 1;
    named.log_tender_amount = log10OrZero(amount);
  }

  // Same six fields qualificationScoringService.js scoreDataCompleteness() counts.
  const completenessFields = [
    tender.title,
    tender.description,
    tender.category,
    tender.amount_value,
    tender.tender_state || tender.tender_district || tender.tender_city,
    tender.closing_date || tender.contract_date,
  ];
  named.data_completeness = completenessFields.filter((value) => value !== null && value !== undefined && value !== '').length / completenessFields.length;

  named.winning_company_known = tender.winning_company_name ? 1 : 0;

  if (probe42Profile) {
    named.probe42_found = 1;

    const revenue = toNumber(probe42Profile.annual_revenue);
    if (revenue !== null) {
      named.revenue_disclosed = 1;
      named.log_revenue = log10OrZero(revenue);
    }

    const profit = toNumber(probe42Profile.net_profit);
    if (profit !== null) {
      named.profit_disclosed = 1;
      named.net_margin = revenue && revenue > 0 ? Math.min(1, Math.max(-1, profit / revenue)) : 0;
    }

    if (probe42Profile.credit_rating) {
      named.rating_known = 1;
      named.credit_rating_grade = creditRatingGrade(probe42Profile.credit_rating);
    }

    if (probe42Profile.compliance_status) {
      named.compliance_known = 1;
      named.compliance_score = COMPLIANCE_SCORES[String(probe42Profile.compliance_status).trim().toLowerCase()] ?? UNRECOGNIZED_COMPLIANCE_SCORE;
    }
  }

  return {
    values: FEATURE_NAMES.map((name) => named[name]),
    named,
    segment: segmentOf(tender, intelligence),
  };
}

/**
 * Why a lead is outside what a model learned, given that model's training
 * statistics ({ means, stds } per feature, in FEATURES order). Empty array
 * means the lead is in-distribution and the model may score it.
 */
export function outOfDistributionReasons(values, { means, stds }) {
  const reasons = [];
  const byName = Object.fromEntries(FEATURE_NAMES.map((name, j) => [name, values[j]]));

  FEATURES.forEach((feature, j) => {
    if (feature.knownFlag && byName[feature.knownFlag] === 0) return; // value is a placeholder, its flag is checked on its own

    if (stds[j] === 0) {
      if (values[j] !== means[j]) {
        reasons.push(`${feature.label}: value ${round(values[j])} never seen in training (always ${round(means[j])})`);
      }
      return;
    }

    if (feature.kind === 'continuous') {
      const z = (values[j] - means[j]) / stds[j];
      if (Math.abs(z) > OUT_OF_DISTRIBUTION_MAX_Z) {
        reasons.push(`${feature.label}: ${round(values[j])} is ${round(Math.abs(z))} standard deviations from the training data`);
      }
    }
  });

  return reasons;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
