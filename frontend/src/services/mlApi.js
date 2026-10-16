import { BACKEND_URL } from '../constants/dashboard';
import { getToken } from './authApi';

// Client for /api/ml/* (backend/src/routes/ml.js) — the Model Maintenance
// Agent. Reads are open; train / promote / retire send the admin's JWT.

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
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function getJson(path) {
  const response = await fetch(`${BACKEND_URL}${path}`, { headers: { Accept: 'application/json' } });
  return parseJson(response);
}

async function postAsAdmin(path, body) {
  const token = getToken();
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return parseJson(response);
}

/** GET /api/ml/overview — fallback chain, active models, pending candidates, labelled-outcome counts, gate settings. */
export function fetchMlOverview() {
  return getJson('/api/ml/overview');
}

/** GET /api/ml/models — the registry, optionally filtered by segmentKey / status. */
export function fetchMlModels(params) {
  return getJson(`/api/ml/models${buildQuery(params)}`);
}

/** GET /api/ml/training-runs — newest first, each with its candidate-vs-incumbent comparison. */
export function fetchTrainingRuns(params) {
  return getJson(`/api/ml/training-runs${buildQuery(params)}`);
}

/** POST /api/ml/training-runs — manual retraining for one segment (admin). Resolves with the finished run, including failed ones. */
export function startTrainingRun(segmentKey) {
  return postAsAdmin('/api/ml/training-runs', { segmentKey });
}

/** POST /api/ml/models/:id/promote — admin approves a candidate that passed the promotion gate. */
export function promoteModel(modelId, note) {
  return postAsAdmin(`/api/ml/models/${encodeURIComponent(modelId)}/promote`, { note });
}

/** POST /api/ml/models/:id/retire — rejects a candidate, or takes the active model out of service (admin). */
export function retireModel(modelId, note) {
  return postAsAdmin(`/api/ml/models/${encodeURIComponent(modelId)}/retire`, { note });
}
