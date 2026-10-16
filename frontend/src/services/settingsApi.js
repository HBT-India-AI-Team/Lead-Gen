import { BACKEND_URL } from '../constants/dashboard';

// Client for /api/settings/* (backend/src/routes/settings.js) — per-category
// lead settings shared by everyone using the app.

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/** GET /api/settings/lead-categories — every category's saved settings (rows with snake_case columns). */
export async function fetchLeadCategorySettings() {
  const response = await fetch(`${BACKEND_URL}/api/settings/lead-categories`, { headers: { Accept: 'application/json' } });
  return parseJson(response);
}

/** PUT /api/settings/lead-categories/:key — upserts one category's settings. */
export async function saveLeadCategorySettings(category, { tenderValueMin, tenderValueMax, decisionWindowDays, scoreThresholds }) {
  const response = await fetch(`${BACKEND_URL}/api/settings/lead-categories/${encodeURIComponent(category)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ tenderValueMin, tenderValueMax, decisionWindowDays, scoreThresholds }),
  });
  return parseJson(response);
}
