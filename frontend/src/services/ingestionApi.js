import { BACKEND_URL } from '../constants/dashboard';

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

/** GET /api/ingestion/scrape/status — recent runs of the tender scrape job. */
export async function fetchScrapeStatus() {
  const response = await fetch(`${BACKEND_URL}/api/ingestion/scrape/status`, {
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}

/** POST /api/ingestion/scrape — starts a scrape; 409 if one is already running. */
export async function startScrape() {
  const response = await fetch(`${BACKEND_URL}/api/ingestion/scrape`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  return parseJson(response);
}
