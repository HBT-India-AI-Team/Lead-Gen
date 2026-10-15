import { BACKEND_URL } from '../constants/dashboard';

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed with HTTP ${response.status}`);
  }
  return data;
}

export async function fetchRecommendations({ sector = 'All', minOpportunityScore = 50, signal } = {}) {
  const params = new URLSearchParams();
  if (sector !== 'All') params.set('sector', sector);
  if (Number(minOpportunityScore) > 50) params.set('minOpportunityScore', String(minOpportunityScore));

  const suffix = params.toString() ? `?${params}` : '';
  const response = await fetch(`${BACKEND_URL}/api/v1/discovery/recommendations${suffix}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  return parseJson(response);
}

export async function createResearch(payload, signal) {
  const response = await fetch(`${BACKEND_URL}/api/v1/discovery/research`, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson(response);
}

export async function approveProposal(proposalId) {
  const response = await fetch(`${BACKEND_URL}/api/v1/proposals/${proposalId}/approve`, {
    method: 'PUT',
    headers: { Accept: 'application/json' },
  });

  return parseJson(response);
}

export async function verifyWebsite(rawUrl, signal) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('HTTPS required');
  }

  const timeout = AbortSignal.timeout ? AbortSignal.timeout(8000) : null;
  const signals = [signal, timeout].filter(Boolean);
  const combinedSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

  const startedAt = performance.now();
  const response = await fetch(url.toString(), {
    method: 'HEAD',
    redirect: 'follow',
    signal: combinedSignal,
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'Verification timed out' : 'URL unreachable or blocked');
  });

  if (!response.ok) {
    throw new Error(`Invalid URL: HTTP ${response.status}`);
  }

  return {
    ok: true,
    statusCode: response.status,
    redirected: response.redirected,
    finalUrl: response.url,
    ssl: url.protocol === 'https:',
    latencyMs: Math.round(performance.now() - startedAt),
  };
}
