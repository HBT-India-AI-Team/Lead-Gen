// Presentational helpers for real `tenders` table data. TenderBook has no
// separate "tender title" field distinct from the buyer/organization name
// (see title/company_name), and closing_date/status aren't literal columns
// either — these derive a readable UI shape from the real fields that do
// exist, without inventing any data.

/** SUM(amount_value) is a plain-rupee DECIMAL total — scaled to Cr/Lakh here since that's how every individual tender's own `amount` column is already displayed (see topTenderValues.mjs: 2605500000.00 -> "₹260.55 Cr"). */
export function formatInrCompact(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || value === null || value === undefined) return '—';
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)} Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)} L`;
  return `₹${num.toLocaleString('en-IN')}`;
}

/** Date-only (YYYY-MM-DD) formatter — formatDateTime() in utils/formatters.js assumes a timestamp and renders an irrelevant hour:minute for these. */
export function formatDate(value) {
  if (!value) return '—';
  try {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return '—';
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
  } catch {
    return '—';
  }
}

/**
 * TenderBook's card description reads "<Buyer> has published <what's being
 * tendered>. Last date of submission is... This is a <type> tender in...".
 * The buyer is already shown in its own column, so this strips that lead-in
 * (when it matches company_name) and the trailing boilerplate sentence,
 * leaving the actual tender description as a title-like line.
 */
export function tenderTitleFrom(tender) {
  const description = tender.description || '';
  const buyer = tender.company_name || tender.title || '';

  let text = description;

  const prefix = `${buyer} has published `;
  if (buyer && text.toLowerCase().startsWith(prefix.toLowerCase())) {
    text = text.slice(prefix.length);
  }

  const cutMarker = text.search(/\.\s*Last date of submission/i);
  if (cutMarker > -1) {
    text = text.slice(0, cutMarker);
  }

  text = text.trim();

  if (!text) return buyer || 'Untitled Tender';

  return text.length > 140 ? `${text.slice(0, 140).trim()}…` : text;
}

/** TenderBook occasionally renders a missing city as the literal string "null" rather than leaving it blank — treated as empty here rather than displayed. */
function cleanPart(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  return /^(null|undefined)$/i.test(trimmed) ? '' : trimmed;
}

/** Prefers the split tender_city/tender_state columns; falls back to the older combined `location` string for rows scraped before that split existed. */
export function tenderLocation(tender) {
  const city = cleanPart(tender.tender_city);
  const state = cleanPart(tender.tender_state);

  if (city || state) {
    return [city, state].filter(Boolean).join(', ');
  }

  return cleanPart(tender.location) || '—';
}

/**
 * Status is derived, not stored: a winning bidder means the tender is
 * settled; otherwise it's Open or Closed depending on whether the real
 * closing_date (parsed from TenderBook's own description text) has passed.
 * No closing_date at all (common — many rows predate that extraction, or
 * the sentence didn't parse) is treated as Open rather than guessed.
 */
export function tenderStatus(tender) {
  if (tender.winning_company_name) {
    return { label: 'Awarded', tone: 'success' };
  }

  if (tender.closing_date) {
    const [year, month, day] = tender.closing_date.split('-').map(Number);
    const closing = new Date(year, (month || 1) - 1, day || 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (closing < today) {
      return { label: 'Closed', tone: 'neutral' };
    }
  }

  return { label: 'Open', tone: 'info' };
}

/**
 * The real `tenders.pipeline_status` enum (see
 * src/db/migrations/addLeadQualificationSchema.js's PIPELINE_STATUSES) —
 * this is the universal RM workflow stage, the same concept regardless
 * of lead category (Tender, GST Registration, Company Expansion, ...), NOT
 * a tender-specific "won/not won" outcome. Every key here is a real DB
 * value; there is no "Cancelled"/"Result Awaited" state anywhere in the
 * schema, so none is offered.
 */
export const PIPELINE_STATUS_META = {
  IDENTIFYING: { label: 'Identifying', tone: 'info' },
  READY_FOR_QUALIFY: { label: 'Ready to Qualify', tone: 'info' },
  QUALIFYING: { label: 'Qualifying', tone: 'warning' },
  READY_FOR_PROPOSAL: { label: 'Ready for Proposal', tone: 'success' },
  AWAITING_PROPOSAL_REVIEW: { label: 'Awaiting Proposal Review', tone: 'warning' },
  AWAITING_QUALITY_REVIEW: { label: 'Awaiting Quality Review', tone: 'warning' },
  ON_HOLD: { label: 'On Hold', tone: 'neutral' },
};

/**
 * Status column shown on the Leads page/Dashboard: the tender-specific
 * "Winner" outcome (winning_company_name is a real, already-scraped
 * TenderBook fact) takes precedence when known, since it's more concrete
 * than the RM's internal workflow stage; otherwise falls back to the
 * universal pipeline_status. These are deliberately two separate concepts
 * (tender outcome vs. lead workflow stage) that happen to share one column.
 */
export function leadWorkflowStatus(tender) {
  if (tender.winning_company_name) {
    return { label: 'Winner', tone: 'success' };
  }
  return PIPELINE_STATUS_META[tender.pipeline_status] ?? { label: tender.pipeline_status || 'Identifying', tone: 'neutral' };
}

/**
 * Priority is NOT a stored column — it's the real `tenders.lead_status`
 * qualification outcome (QUALIFIED_GOOD/HITL/BAD), computed by
 * src/services/scoring/qualificationScoringService.js from the tender's
 * deterministic 0-100 qualification_score, relabeled for display. Reuses
 * the exact same tone convention HumanReview.tsx's QUALIFICATION_TONE
 * already uses for these values. Only ~14 of 1,901 real rows have gone
 * through qualification as of this writing — every other row (lead_status
 * defaults to 'IDENTIFYING') has genuinely not been scored yet, so this
 * returns null rather than guessing a priority for it.
 */
export const LEAD_PRIORITY_META = {
  QUALIFIED_GOOD: { label: 'High', tone: 'success' },
  QUALIFIED_HITL: { label: 'Medium', tone: 'warning' },
  QUALIFIED_BAD: { label: 'Low', tone: 'danger' },
};

export function leadPriority(tender) {
  return LEAD_PRIORITY_META[tender.lead_status] ?? null;
}
