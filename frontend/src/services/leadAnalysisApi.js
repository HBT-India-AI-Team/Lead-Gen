import { BACKEND_URL } from '../constants/dashboard';

// Centralized client for the backend's lead-analysis endpoints
// (src/routes/leadAnalysis.js), which orchestrate CompanyIntelligenceService
// -> LeadScoringService -> BankingRecommendationService -> LeadAnalysisService
// (and, for the /ai variant, OllamaAnalysisService).

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * POST /api/lead-analysis — deterministic result for one tender record:
 * { company, intelligence, score, recommendations, metadata }.
 */
export async function fetchLeadAnalysis(tenderRecord, signal) {
  const response = await fetch(`${BACKEND_URL}/api/lead-analysis`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tenderRecord),
  });
  return parseJson(response);
}

/**
 * POST /api/lead-analysis/ai — same deterministic result plus the
 * Ollama-generated narrative analysis: { leadAnalysis, aiAnalysis }.
 */
export async function fetchLeadAnalysisWithAi(tenderRecord, signal) {
  const response = await fetch(`${BACKEND_URL}/api/lead-analysis/ai`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tenderRecord),
  });
  return parseJson(response);
}
