import * as leadSignalRepository from '../repositories/leadSignalRepository.js';

// Thin pass-through over leadSignalRepository.js, same shape as
// tenderService.js's own wrapper over tenderRepository.js — keeps
// leadController.js consistently calling services, never repositories,
// for the Dashboard's Lead Category filter.

// Real signal_type -> user-friendly display label. Purely cosmetic (the
// filter value sent to/from the backend is always the real enum value);
// covers every value the addLeadSignalsSchema.js CHECK constraint allows,
// so a currently-zero-count type would still get a sensible label if it's
// ever populated.
const SIGNAL_TYPE_LABELS = {
  TENDER: 'Tender',
  NEW_COMPANY_REGISTRATION: 'New Company Registration',
  GST_REGISTRATION: 'GST Registration',
  GOVERNMENT_TENDER_BID: 'Government Tender Bid',
  GOVERNMENT_TENDER_WIN: 'Government Tender Win',
  COMPANY_EXPANSION: 'Company Expansion',
  GOVERNMENT_SCHEME_APPROVAL: 'Government Scheme Approval',
};

/**
 * Real Lead Category options for the Dashboard dropdown: one entry per
 * signal_type that actually has at least one row right now, with its real
 * live count. Never a fixed/hardcoded list — a type with zero rows today
 * simply doesn't appear, and would appear on its own once real data exists
 * for it.
 */
export async function listSignalCategories() {
  const counts = await leadSignalRepository.getSignalTypeCounts();
  return counts.map(({ signalType, count }) => ({
    value: signalType,
    label: SIGNAL_TYPE_LABELS[signalType] ?? signalType,
    count,
  }));
}

/** Real, paginated lead_signals rows for the Dashboard's Lead Category filter — see leadSignalRepository.listSignals(). */
export async function listSignals(query = {}) {
  return leadSignalRepository.listSignals(query);
}
