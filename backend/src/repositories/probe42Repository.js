import { get, all } from '../config/database.js';

// Data-access layer for the Probe42 company-profile dataset
// (probe42_demo_profiles — see src/db/migrations/addProbe42DemoSchema.js,
// populated from real XLS files by scripts/importProbe42Xls.js).
// findByCompanyName() is the ONLY function the rest of this feature calls —
// swapping this for a real Probe42 (or other KYB provider) API integration
// later means rewriting this one function's body, nothing above it.

// Legal-entity-type tokens stripped from the END of a normalized name
// (iteratively — "Private Limited" is two tokens). Real winner names and
// real Probe42 legal names disagree on which of these are present/spelled
// out (e.g. tenders.winning_company_name "M/s. p p enterprises" vs Probe42
// "P P ENTERPRISES PVT LTD" — the tender name omits "Pvt Ltd" entirely), so
// matching on the pre-suffix "core" name is what actually resolves real
// pairs. Deliberately just this fixed, deterministic token-stripping rule —
// no fuzzy/edit-distance matching.
const LEGAL_SUFFIX_TOKENS = new Set([
  'limited', 'ltd', 'private', 'pvt', 'plc', 'llp', 'co', 'company', 'corporation', 'corp', 'inc',
]);

/**
 * Normalizes a company name for matching: lowercase, trim, drop an "M/s."
 * / "M/S" prefix, drop periods/commas (typographic noise — parentheses are
 * kept since e.g. "Mallcom (India)" needs them to stay meaningful),
 * collapse whitespace, then iteratively strip trailing legal-entity-type
 * tokens.
 */
function normalizeForMatch(name) {
  let value = String(name || '').toLowerCase().trim();
  if (!value) return '';

  value = value.replace(/^m\/s\.?\s*/i, '');
  value = value.replace(/[.,]/g, '');
  value = value.replace(/\s+/g, ' ').trim();

  const tokens = value.split(' ');
  while (tokens.length > 1 && LEGAL_SUFFIX_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(' ').trim();
}

export async function findByCompanyName(companyName) {
  const normalized = normalizeForMatch(companyName);
  if (!normalized) return null;

  // Fast path: exact match on the raw (lowercased/trimmed) name, same
  // behavior as before this normalization was added.
  const exact = await get(
    'SELECT * FROM probe42_demo_profiles WHERE LOWER(TRIM(company_name)) = ?',
    [String(companyName).trim().toLowerCase()]
  );
  if (exact) return exact;

  // Normalized fallback: strips "M/s."/legal-suffix noise from both sides
  // before comparing. The table stays small (real Probe42 coverage is
  // necessarily a fraction of all tender winners), so scanning every row
  // in JS is simpler and just as correct as pushing the same normalization
  // into SQL.
  const rows = await all('SELECT * FROM probe42_demo_profiles');
  return rows.find((row) => normalizeForMatch(row.company_name) === normalized) ?? null;
}
