import { BACKEND_URL } from '../constants/dashboard';

// Client for /api/ai/* (backend/src/routes/ai.js).

async function getJson(path) {
  const response = await fetch(`${BACKEND_URL}${path}`, { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/** GET /api/ai/brief — today's Gemini brief, or { status: 'unavailable', reason }. */
export function fetchAiBrief() {
  return getJson('/api/ai/brief');
}

/** GET /api/ai/status — the configured LLM provider and model (no model call). */
export function fetchAiStatus() {
  return getJson('/api/ai/status');
}

/** GET /api/ai/usage — measured model calls, latency and tokens per feature over the last `days`. */
export function fetchAiUsage(days = 7) {
  return getJson(`/api/ai/usage?days=${encodeURIComponent(days)}`);
}
