// Per-category lead scoring/config settings for the Settings page's tab bar
// (rendered per-category by components/settings/LeadCategorySettings.tsx,
// with Settings.tsx owning the tab selection itself).
//
// HONESTY NOTES (verified against the backend on 2026-08-15):
//   • These per-category settings are saved on the server
//     (GET/PUT /api/settings/lead-categories, src/routes/settings.js) and
//     shared by everyone; the localStorage copy written below is only the
//     first paint and the fallback when the API is unreachable. The other
//     Settings sections (preferences, notifications) are still per-browser.
//   • All four score types below are deterministic 0-100 scores computed
//     per company from actual Probe42 fields (see
//     src/services/scoring/companyProfileScoringService.js), wired through
//     the existing GET /api/tenders/:id/health-check endpoint and shown
//     live in the "Check a Real Company" panel below: Financial Health
//     (annual_revenue + net_profit), Business Vintage/Stability
//     (incorporation_date), Credit Rating Score (credit_rating — Probe42's
//     own agency letter grade, e.g. "AA-", NOT a 300-900 bureau score; no
//     credit-bureau connection exists in this codebase, hence the label),
//     and Compliance Score (compliance_status, e.g. "Active Compliant" —
//     NOT actual GSTN filing data; no GSTN connection exists either, hence
//     the label). Distinct from qualificationScoringService.js
//     /qualificationRules.js's separate tender-level qualification score,
//     which blends revenue/profit with tender-specific factors — these four
//     are standalone, company-level scores.
//   • Only "Tender" has real backing data end-to-end. Every other category
//     (New company registration, GST registration, Company expansion
//     (hiring), Government scheme approvals) has no dedicated lead data or
//     scoring fields, so those tabs render a disabled Work-In-Progress
//     placeholder instead of a form with nothing real behind it.

import { LEAD_CATEGORY_OPTIONS } from './settingsPreferences';
import type { LeadCategoryOption } from './settingsPreferences';

export const LEAD_CATEGORY_SETTINGS_STORAGE_KEY = 'leadgen.settings.leadCategorySettings.v1';

// Re-export the single source of truth so the tabs never hardcode a second
// copy of the category list — they render straight from the same array the
// Leads page filter uses.
export const LEAD_CATEGORY_TABS = LEAD_CATEGORY_OPTIONS;

// Categories with no real lead data / scoring fields yet — rendered as a
// disabled "Work In Progress" tab instead of fabricated controls. Only
// "Tender" has real backing data (tenders/lead_signals/probe42_demo_profiles)
// today, so every other category stays WIP rather than shipping a form with
// nothing real behind it.
export const WIP_CATEGORIES: readonly LeadCategoryOption[] = [
  'New company registration',
  'GST registration',
  'Company expansion (hiring)',
  'Government scheme approvals',
] as const;

export function isWipCategory(category: LeadCategoryOption): boolean {
  return WIP_CATEGORIES.includes(category);
}

// ---- Score threshold definitions --------------------------------------
// Shared band palette reused across score types (Poor→Excellent).
const BAND_POOR = '#C62828';
const BAND_FAIR = '#B76513';
const BAND_GOOD = '#1967D2';
const BAND_EXCELLENT = '#2E7D32';

export interface ScoreDefinition {
  key: 'financialHealth' | 'cibil' | 'gstCompliance' | 'businessVintage';
  label: string;
  min: number;
  max: number;
  step: number;
  defaultThreshold: number;
  hint: string;
  bands: { label: string; from: number; color: string }[];
}

// 0–100 four-band scale reused by the three percentage-style scores.
function pct100Bands() {
  return [
    { label: 'Poor', from: 0, color: BAND_POOR },
    { label: 'Fair', from: 40, color: BAND_FAIR },
    { label: 'Good', from: 65, color: BAND_GOOD },
    { label: 'Excellent', from: 85, color: BAND_EXCELLENT },
  ];
}

export const SCORE_DEFINITIONS: ScoreDefinition[] = [
  {
    key: 'financialHealth',
    label: 'Financial Health Score',
    min: 0,
    max: 100,
    step: 1,
    defaultThreshold: 60,
    hint: 'Composite health cutoff (0–100), computed from revenue + net profit',
    bands: pct100Bands(),
  },
  {
    key: 'cibil',
    label: 'Credit Rating Score',
    min: 0,
    max: 100,
    step: 1,
    defaultThreshold: 65,
    hint: "Credit-rating cutoff (0–100), computed from Probe42's credit rating grade — not a bureau CIBIL score",
    bands: [
      { label: 'Poor', from: 0, color: BAND_POOR },
      { label: 'Fair', from: 50, color: BAND_FAIR },
      { label: 'Good', from: 65, color: BAND_GOOD },
      { label: 'Excellent', from: 80, color: BAND_EXCELLENT },
    ],
  },
  {
    key: 'gstCompliance',
    label: 'Compliance Score',
    min: 0,
    max: 100,
    step: 1,
    defaultThreshold: 65,
    hint: "Compliance-status cutoff (0–100), computed from Probe42's compliance status — not GSTN filing data",
    bands: [
      { label: 'Non-Compliant', from: 0, color: BAND_POOR },
      { label: 'Minor Flags', from: 65, color: BAND_FAIR },
      { label: 'Compliant', from: 90, color: BAND_EXCELLENT },
    ],
  },
  {
    key: 'businessVintage',
    label: 'Business Vintage / Stability Score',
    min: 0,
    max: 100,
    step: 1,
    defaultThreshold: 50,
    hint: 'Operating history & stability (0–100), computed from incorporation date',
    bands: pct100Bands(),
  },
];

export type ScoreThresholds = Record<ScoreDefinition['key'], number>;

export interface CategorySettings {
  tenderValueMin: number;
  tenderValueMax: number;
  decisionWindowDays: number;
  scoreThresholds: ScoreThresholds;
}

// Tender value slider bounds — ₹0 to ₹100 Cr, stepping in ₹1 L, matching the
// Cr/L convention formatInrCompact() already uses across the app.
export const TENDER_VALUE_MIN = 0;
export const TENDER_VALUE_MAX = 1_000_000_000; // ₹100 Cr
export const TENDER_VALUE_STEP = 100_000; // ₹1 L

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = SCORE_DEFINITIONS.reduce(
  (acc, def) => ({ ...acc, [def.key]: def.defaultThreshold }),
  {} as ScoreThresholds
);

export const DEFAULT_CATEGORY_SETTINGS: CategorySettings = {
  tenderValueMin: 0,
  tenderValueMax: 100_000_000, // ₹10 Cr
  decisionWindowDays: 30,
  scoreThresholds: DEFAULT_SCORE_THRESHOLDS,
};

export type AllCategorySettings = Record<string, CategorySettings>;

function seedAll(): AllCategorySettings {
  return LEAD_CATEGORY_TABS.reduce(
    (acc, category) => ({ ...acc, [category]: { ...DEFAULT_CATEGORY_SETTINGS } }),
    {} as AllCategorySettings
  );
}

export function readLeadCategorySettings(): AllCategorySettings {
  const seeded = seedAll();
  try {
    const raw = localStorage.getItem(LEAD_CATEGORY_SETTINGS_STORAGE_KEY);
    if (!raw) return seeded;
    const parsed = JSON.parse(raw) as Partial<AllCategorySettings>;
    // Merge per-category so a newly added category still gets defaults, and a
    // partial stored blob can't drop required fields.
    return LEAD_CATEGORY_TABS.reduce((acc, category) => {
      const stored = parsed[category];
      acc[category] = {
        ...DEFAULT_CATEGORY_SETTINGS,
        ...stored,
        scoreThresholds: { ...DEFAULT_SCORE_THRESHOLDS, ...stored?.scoreThresholds },
      };
      return acc;
    }, {} as AllCategorySettings);
  } catch {
    return seeded;
  }
}

export function writeLeadCategorySettings(value: AllCategorySettings): void {
  localStorage.setItem(LEAD_CATEGORY_SETTINGS_STORAGE_KEY, JSON.stringify(value));
}
