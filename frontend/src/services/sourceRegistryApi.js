import { BACKEND_URL } from '../constants/dashboard';

// Client for /api/sources/* — no login, like the rest of the app.

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

export async function fetchSources(params) {
  const response = await fetch(`${BACKEND_URL}/api/sources${buildQuery(params)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function createSource(payload) {
  const response = await fetch(`${BACKEND_URL}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function updateSource({ id, payload }) {
  const response = await fetch(`${BACKEND_URL}/api/sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function deleteSource(id) {
  const response = await fetch(`${BACKEND_URL}/api/sources/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function updateSourceStatus({ id, enabled }) {
  const response = await fetch(`${BACKEND_URL}/api/sources/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return parseJson(response);
}

export async function updateSourceHealth({ id, health_status: healthStatus }) {
  const response = await fetch(`${BACKEND_URL}/api/sources/${id}/health`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ health_status: healthStatus }),
  });
  return parseJson(response);
}

export async function runSource(id) {
  const response = await fetch(`${BACKEND_URL}/api/sources/${id}/run`, {
    method: 'PATCH',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

export async function updateSourcePriority({ id, priority }) {
  const response = await fetch(`${BACKEND_URL}/api/sources/${id}/priority`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ priority }),
  });
  return parseJson(response);
}
