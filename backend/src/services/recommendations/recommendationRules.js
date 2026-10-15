import { INDUSTRY_RULES } from '../scoring/scoringRules.js';

// All banking-product recommendation rules. recommendationService.js
// contains zero business logic of its own — it only knows how to
// evaluate a rule's `condition`, resolve its (possibly score-dependent)
// `confidence`/`reason`, deduplicate by product, and sort the results.
// Every actual business decision (which signal maps to which product, at
// what priority/confidence) lives here.

/**
 * The bank's product catalog. Every rule's `product` below is one of
 * these, except 'Relationship Manager Follow-up' and 'Early Engagement' —
 * those two are explicitly requested rule examples that are engagement
 * actions, not financial products, so they're intentionally outside this
 * list. Letter of Credit, Payroll Services, Term Loan, Business Credit
 * Card and POS / Merchant Services have no rule mapped to them yet — no
 * trigger condition for them was specified, and inventing one wasn't
 * requested. Add a rule below whenever one is defined.
 */
export const SUPPORTED_PRODUCTS = [
  'Working Capital Loan',
  'Bank Guarantee',
  'Performance Guarantee',
  'Letter of Credit',
  'Trade Finance',
  'Corporate Current Account',
  'Cash Management',
  'Payroll Services',
  'Supply Chain Finance',
  'Term Loan',
  'Business Credit Card',
  'POS / Merchant Services'
];

export const PRIORITY = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

// Higher rank wins when deduplicating/sorting recommendations.
export const PRIORITY_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 };

// ---------------------------------------------------------------------------
// Shared condition helpers — small, explicit, reusable predicates. No
// fuzzy/substring matching on free text; every check is either an exact
// alias match or a documented, verified-safe substring check on a known,
// fixed vocabulary (mirrors the approach in ../scoring/scoringRules.js).
// ---------------------------------------------------------------------------

/** True if any of `aliases` appears (exact match) in CompanyIntelligence.signals. */
function hasSignal(companyIntelligence, aliases) {
  const signals = Array.isArray(companyIntelligence?.signals) ? companyIntelligence.signals : [];
  return aliases.some((alias) => signals.includes(alias));
}

/** True if CompanyIntelligence.tenderValue.sizeCategory names the given tier (e.g. "Large (> Rs.1 Cr)" for tier "Large"). */
function isTenderSizeTier(companyIntelligence, tier) {
  const sizeCategory = companyIntelligence?.tenderValue?.sizeCategory;
  if (!sizeCategory) return false;
  return String(sizeCategory).toUpperCase().includes(tier.toUpperCase());
}

/**
 * True if CompanyIntelligence.industry matches the given canonical
 * industry label via alias. Reuses INDUSTRY_RULES from
 * ../scoring/scoringRules.js so this service and LeadScoringService agree
 * on what counts as e.g. "Infrastructure" — CompanyIntelligenceService's
 * own industry vocabulary ("Construction", "IT & Software", ...) doesn't
 * exactly match these canonical labels, and that alias mapping is
 * maintained in exactly one place.
 */
function isIndustry(companyIntelligence, canonicalLabel) {
  const industry = companyIntelligence?.industry;
  if (!industry) return false;

  const rule = INDUSTRY_RULES.find((entry) => entry.label === canonicalLabel);
  if (!rule) return false;

  const industryUpper = String(industry).toUpperCase();
  return rule.aliases.some((alias) => alias.toUpperCase() === industryUpper);
}

/** True if the LeadScoring result's numeric score meets or exceeds `threshold`. */
function leadScoreAtLeast(leadScoring, threshold) {
  return typeof leadScoring?.score === 'number' && leadScoring.score >= threshold;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const RECOMMENDATION_RULES = [
  {
    key: 'government-buyer',
    product: 'Bank Guarantee',
    priority: PRIORITY.HIGH,
    confidence: 85,
    reason: 'Government buyers commonly require a Bank Guarantee as bid security, performance security or retention money cover.',
    triggeredBy: 'Government Buyer signal',
    condition: (companyIntelligence) => hasSignal(companyIntelligence, ['Government Buyer'])
  },
  {
    key: 'large-tender',
    product: 'Working Capital Loan',
    priority: PRIORITY.MEDIUM,
    confidence: 70,
    reason: 'A large tender value typically requires additional working capital to fund mobilization, materials and payroll before receivables are collected.',
    triggeredBy: 'Large Tender value',
    condition: (companyIntelligence) => isTenderSizeTier(companyIntelligence, 'Large')
  },
  {
    key: 'infrastructure-industry',
    product: 'Performance Guarantee',
    priority: PRIORITY.MEDIUM,
    confidence: 75,
    reason: 'Infrastructure-sector contracts commonly require a Performance Guarantee to secure timely and compliant execution.',
    triggeredBy: 'Infrastructure Industry',
    condition: (companyIntelligence) => isIndustry(companyIntelligence, 'Infrastructure')
  },
  {
    key: 'manufacturing-industry',
    product: 'Supply Chain Finance',
    priority: PRIORITY.MEDIUM,
    confidence: 70,
    reason: 'Manufacturing supply chains typically benefit from Supply Chain Finance to bridge supplier payment cycles.',
    triggeredBy: 'Manufacturing Industry',
    condition: (companyIntelligence) => isIndustry(companyIntelligence, 'Manufacturing')
  },
  {
    // No signal for this currently exists in CompanyIntelligenceService's
    // output — this rule is correctly implemented and will fire as soon
    // as that service (or a future one) emits one of these aliases, but
    // it won't trigger against today's CompanyIntelligence shape.
    key: 'export-import-signal',
    product: 'Trade Finance',
    priority: PRIORITY.MEDIUM,
    confidence: 70,
    reason: 'Cross-border trade signals indicate a likely need for Trade Finance facilities to manage import/export payment cycles.',
    triggeredBy: 'Export/Import signal',
    condition: (companyIntelligence) => hasSignal(companyIntelligence, ['Export', 'Import', 'Export/Import', 'Cross-Border'])
  },
  {
    key: 'lead-score-90',
    product: 'Working Capital Loan',
    priority: PRIORITY.HIGH,
    // Confidence scales with the actual lead score rather than a fixed
    // constant — a 99-scoring lead is a stronger signal than a 90-scoring
    // one, and this stays deterministic since it's a pure function of the
    // input score.
    confidence: (companyIntelligence, leadScoring) => leadScoring.score,
    reason: (companyIntelligence, leadScoring) =>
      `A lead score of ${leadScoring.score} marks this as a top-tier opportunity — Working Capital financing should be proactively offered.`,
    triggeredBy: 'Lead Score >= 90',
    condition: (companyIntelligence, leadScoring) => leadScoreAtLeast(leadScoring, 90)
  },
  {
    key: 'lead-score-70',
    product: 'Corporate Current Account',
    priority: PRIORITY.MEDIUM,
    confidence: (companyIntelligence, leadScoring) => leadScoring.score,
    reason: (companyIntelligence, leadScoring) =>
      `A lead score of ${leadScoring.score} qualifies this lead for proactive Corporate Current Account onboarding to capture the primary banking relationship.`,
    triggeredBy: 'Lead Score >= 70',
    condition: (companyIntelligence, leadScoring) => leadScoreAtLeast(leadScoring, 70)
  },
  {
    key: 'gst-registered',
    product: 'Cash Management',
    priority: PRIORITY.LOW,
    confidence: 60,
    reason: 'GST registration indicates formal, ongoing business operations well suited to Cash Management services for collections and payments.',
    triggeredBy: 'GST Registered signal',
    condition: (companyIntelligence) => hasSignal(companyIntelligence, ['GST Registered'])
  },
  {
    key: 'contact-available',
    product: 'Relationship Manager Follow-up',
    priority: PRIORITY.LOW,
    confidence: 50,
    reason: 'Direct contact details are available, enabling a Relationship Manager to engage the lead personally rather than through cold outreach.',
    triggeredBy: 'Contact Details Available signal',
    condition: (companyIntelligence) => hasSignal(companyIntelligence, ['Contact Available', 'Contact Details Available'])
  },
  {
    key: 'recurring-procurement',
    product: 'Supply Chain Finance',
    priority: PRIORITY.MEDIUM,
    confidence: 65,
    reason: 'Recurring procurement activity signals an ongoing supplier relationship well suited to Supply Chain Finance.',
    triggeredBy: 'Recurring Procurement signal',
    condition: (companyIntelligence) => hasSignal(companyIntelligence, ['Recurring Procurement', 'Recurring Procurement Category'])
  },
  {
    key: 'open-tender',
    product: 'Early Engagement',
    priority: PRIORITY.LOW,
    confidence: 45,
    reason: 'The tender is still open for bidding — early engagement improves the chance of being considered before the submission deadline closes.',
    triggeredBy: 'Open Tender signal',
    condition: (companyIntelligence) => hasSignal(companyIntelligence, ['Open Tender'])
  }
];