import { BACKEND_URL } from '../constants/dashboard';

// Client for /api/leads/* (src/routes/leads.js).

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'All') {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** GET /api/leads — same filters as GET /api/tenders, plus `pipeline_status` (used by the Human Review queue to find leads sitting at AWAITING_PROPOSAL_REVIEW). */
export async function fetchLeads(params) {
  const response = await fetch(`${BACKEND_URL}/api/leads${buildQuery(params)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** GET /api/leads/pipeline-summary — real aggregate counts (qualification/proposal/communication distributions) for the Dashboard's Pipeline Status section. See src/services/pipelineSummaryService.js for why this one endpoint exists. */
export async function fetchPipelineSummary() {
  const response = await fetch(`${BACKEND_URL}/api/leads/pipeline-summary`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** GET /api/leads/signal-categories — real Lead Category dropdown options (signal_type + friendly label + live count), only for types that currently have at least one real lead_signals row. */
export async function fetchLeadSignalCategories() {
  const response = await fetch(`${BACKEND_URL}/api/leads/signal-categories`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** GET /api/leads/signals — real, paginated lead_signals rows, optionally filtered by `signal_type`. Backs the Dashboard's Lead Category filter results. */
export async function fetchLeadSignals(params) {
  const response = await fetch(`${BACKEND_URL}/api/leads/signals${buildQuery(params)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** GET /api/leads/:id — the real tender/lead row, including pipeline_status/lead_status/qualification_score/qualification_reason (the Communication page's Qualification section reads these). */
export async function fetchLeadById(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** POST /api/leads/:id/qualify — re-runs the rules score plus the Gemini advisory for one tender and returns the persisted lead. */
export async function qualifyLead(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/qualify`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** POST /api/leads/:id/proposal — Gemini drafts the product proposal and email. 409s unless the lead is QUALIFIED_GOOD and READY_FOR_PROPOSAL. */
export async function generateLeadProposal(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/proposal`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** GET /api/leads/:id/proposal — the real, persisted generated proposal for one tender. Throws (status 404) if none exists yet. */
export async function fetchLeadProposal(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/proposal`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** PATCH /api/leads/:id/proposal/review — records a human decision (APPROVED/CHANGES_REQUESTED/REJECTED/ON_HOLD) plus an optional comment. */
export async function reviewLeadProposal(tenderId, { decision, reviewComment }) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/proposal/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ decision, reviewComment }),
  });
  return parseJson(response);
}

/** GET /api/leads/:id/communication — the real communication draft (reused from the approved proposal's own email) plus its preparation/review state. 404s if no proposal exists; 409s if the proposal exists but isn't APPROVED yet. */
export async function fetchLeadCommunication(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/communication`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** POST /api/leads/:id/communication/prepare — marks an APPROVED proposal's communication draft as prepared (DRAFT_READY). Never sends anything. */
export async function prepareLeadCommunication(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/communication/prepare`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** PATCH /api/leads/:id/communication/review — records a human decision (APPROVE/ON_HOLD/REJECT) plus an optional comment. APPROVE only ever moves status to AWAITING_SEND_APPROVAL — never sends anything. */
export async function reviewLeadCommunication(tenderId, { decision, reviewComment }) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/communication/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ decision, reviewComment }),
  });
  return parseJson(response);
}
/** GET /api/leads/:id/decision-trail — every rules/AI/human decision taken on this lead, oldest first. */
export async function fetchLeadDecisionTrail(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/decision-trail`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** GET /api/leads/:id/recommendations — recommended banking products + relationship strategy from the lead's AI proposal and the product catalog. */
export async function fetchLeadRecommendations(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/leads/${encodeURIComponent(tenderId)}/recommendations`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}
