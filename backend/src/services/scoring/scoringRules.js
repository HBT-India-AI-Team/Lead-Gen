// Centralized, editable rule set for leadScoringService.js. Every point
// value the scoring service can award lives here — the scoring logic
// never hardcodes a number, so adjusting business rules never requires
// touching the algorithm itself.
//
// Rule labels are matched against the CompanyIntelligence shape returned
// by src/services/companyIntelligenceService.js. Where that service's own
// vocabulary doesn't line up 1:1 with these rule labels (e.g. it emits
// "Verified Normalized Record", not "Verified Record"), the mismatch is
// bridged with explicit aliases below rather than fuzzy/substring
// guessing, so every match is exact and auditable.

export const TENDER_VALUE_RULES = {
  Large: 30,
  Medium: 20,
  Small: 10
};

// Priority-ordered (first pattern match wins) — a governmentDepartment
// string like "Ministry of Railways" could match more than one pattern
// (e.g. both Railway and Central Government), so more specific categories
// are listed before the generic State/Central Government catch-alls.
export const GOVERNMENT_DEPARTMENT_RULES = [
  { label: 'Railway', points: 20, pattern: /railway/i },
  { label: 'Defence', points: 20, pattern: /defence|defense|\barmy\b|\bnavy\b|air\s*force|military|ordnance/i },
  { label: 'Oil & Gas', points: 18, pattern: /oil\s*&?\s*gas|petroleum|\bongc\b|\biocl\b|\bhpcl\b|\bbpcl\b/i },
  { label: 'Power', points: 18, pattern: /\bpower\b|electricity|discom/i },
  { label: 'State Government', points: 15, pattern: /state\s*government|state\s*govt/i },
  { label: 'Central Government', points: 18, pattern: /central\s*government|central\s*govt|government\s*of\s*india|\bgoi\b|ministry/i }
];

// Each industry supports multiple aliases so CompanyIntelligenceService's
// own vocabulary (e.g. "Construction", "IT & Software") lines up with
// these rule labels without modifying that service. Matching is exact and
// case-insensitive, alias-by-alias — deliberately not fuzzy/substring, so
// e.g. "IT" never false-positives inside an unrelated value like
// "Furniture". Every alias must be unique across the whole list (verified
// disjoint below) so at most one industry can ever match a given value.
export const INDUSTRY_RULES = [
  {
    label: 'Infrastructure',
    points: 15,
    aliases: ['Infrastructure', 'Construction', 'Civil Engineering', 'Road Works', 'Bridge', 'Highway']
  },
  {
    label: 'Manufacturing',
    points: 12,
    aliases: ['Manufacturing', 'Industrial', 'Factory', 'Production']
  },
  {
    label: 'IT',
    points: 8,
    aliases: ['IT', 'IT & Software', 'Software', 'Technology']
  },
  {
    label: 'Healthcare',
    points: 10,
    aliases: ['Healthcare', 'Medical', 'Hospital', 'Pharmaceutical']
  },
  {
    label: 'Mining',
    points: 15,
    aliases: ['Mining', 'Coal', 'Mineral', 'Excavation', 'Quarry']
  }
];

// Matched case-insensitively against CompanyIntelligence.businessCategory
// by substring — verified safe for every label
// src/services/companyIntelligenceService.js can emit ("Services" only
// appears in "Services / AMC", "Lease" only in "Lease / Rental", etc.).
export const BUSINESS_CATEGORY_RULES = [
  { label: 'Works Contract', points: 12, keyword: 'works contract' },
  { label: 'Goods Supply', points: 8, keyword: 'goods supply' },
  { label: 'Services', points: 6, keyword: 'services' },
  { label: 'Lease', points: 4, keyword: 'lease' }
];

// Each rule fires at most once, if ANY of its aliases appears (exact
// string match) in CompanyIntelligence.signals.
export const SIGNAL_RULES = [
  { label: 'Government Buyer', points: 10, matchesAnyOf: ['Government Buyer'] },
  { label: 'GST Registered', points: 5, matchesAnyOf: ['GST Registered'] },
  { label: 'Verified Record', points: 5, matchesAnyOf: ['Verified Record', 'Verified Normalized Record'] },
  { label: 'Contact Available', points: 5, matchesAnyOf: ['Contact Available', 'Contact Details Available'] },
  { label: 'Recurring Procurement', points: 8, matchesAnyOf: ['Recurring Procurement', 'Recurring Procurement Category'] },
  { label: 'Open Tender', points: 6, matchesAnyOf: ['Open Tender'] }
];

export const CONFIDENCE_RULES = {
  High: 5,
  Medium: 2,
  Low: 0
};

// Ordered highest-first; the first threshold the score meets or exceeds
// wins. Open-ended at both ends so every possible score maps to exactly
// one grade, even if the raw sum exceeds the nominal 90-100 band.
export const GRADE_BANDS = [
  { grade: 'HOT', minScore: 90 },
  { grade: 'WARM', minScore: 70 },
  { grade: 'QUALIFIED', minScore: 50 },
  { grade: 'LOW PRIORITY', minScore: 0 }
];

export const MIN_SCORE = 0;
export const MAX_SCORE = 100;