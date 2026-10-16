import { BACKEND_URL } from '../constants/dashboard';

// GET /api/tenders is unauthenticated for this phase of the LeadGen
// workflow (see src/routes/tenders.js on the backend) — no token handling
// here, unlike sourceRegistryApi.js.

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

/** Lists tenders with search/category/hasWinner filters, sort, and page/limit pagination — mirrors fetchSources()'s shape. */
export async function fetchTenders(params) {
  const response = await fetch(`${BACKEND_URL}/api/tenders${buildQuery(params)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** Distinct real category values, for the Lead Dashboard's category filter dropdown. */
export async function fetchTenderCategories() {
  const response = await fetch(`${BACKEND_URL}/api/tenders/categories`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** Lead Category values the backend can actually back with real lead_signals evidence — for the Lead Category filter dropdown. */
export async function fetchTenderLeadCategories() {
  const response = await fetch(`${BACKEND_URL}/api/tenders/lead-categories`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** Distinct real tender_state values, for the State filter dropdown. */
export async function fetchTenderStates() {
  const response = await fetch(`${BACKEND_URL}/api/tenders/states`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** Distinct real district values, optionally narrowed to one state — for the State-dependent District filter dropdown. */
export async function fetchTenderDistricts(state) {
  const response = await fetch(`${BACKEND_URL}/api/tenders/districts${buildQuery({ state })}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** A single tender by its natural key (tender_id), for the Lead Details page. */
export async function fetchTenderById(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/tenders/${encodeURIComponent(tenderId)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** Existing Customer Check step — matches the tender's winning company against the demo customer dataset. */
export async function fetchSbiCheck(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/tenders/${encodeURIComponent(tenderId)}/sbi-check`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** Health Check step — Probe42-demo company profile + repurposed lead-analysis score. */
export async function fetchHealthCheck(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/tenders/${encodeURIComponent(tenderId)}/health-check`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** Generates a new tender-scoped proposal (draft summary + email). */
export async function createProposal(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/tender-proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ tenderId }),
  });
  return parseJson(response);
}

/** Lists proposals already generated for a tender. */
export async function fetchProposals(tenderId) {
  const response = await fetch(`${BACKEND_URL}/api/tender-proposals${buildQuery({ tenderId })}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function approveProposal(id) {
  const response = await fetch(`${BACKEND_URL}/api/tender-proposals/${id}/approve`, {
    method: 'PUT',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}
