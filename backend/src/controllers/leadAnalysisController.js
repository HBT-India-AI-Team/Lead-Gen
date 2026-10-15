import { leadAnalysisService } from '../services/leadAnalysisService.js';
import { OllamaAnalysisService } from '../services/ollama/ollamaAnalysisService.js';

// POST /api/lead-analysis
// Runs the request body (a tender record) through LeadAnalysisService and
// returns its combined company/intelligence/score/recommendations result.
// Synchronous under the hood (no AI/DB/network calls), but kept as an
// async handler for consistency with every other controller in this
// codebase.
export async function generate(req, res, next) {
  try {
    const analysis = leadAnalysisService.generateLeadAnalysis(req.body);
    return res.status(200).json(analysis);
  } catch (error) {
    return next(error);
  }
}

// POST /api/lead-analysis/ai
// Tender record -> LeadAnalysisService (deterministic) -> OllamaAnalysisService
// (narrative explanation only) -> { leadAnalysis, aiAnalysis }.
//
// OllamaAnalysisService is constructed here rather than as a shared
// module-level singleton: its constructor reads OLLAMA_BASE_URL/
// OLLAMA_DEFAULT_MODEL from .env and throws if either is missing, and
// that check should only ever fail this one request — not crash server
// startup for every other endpoint if Ollama isn't configured.
export async function generateWithAi(req, res, next) {
  try {
    const leadAnalysis = leadAnalysisService.generateLeadAnalysis(req.body);

    const ollamaAnalysisService = new OllamaAnalysisService();
    const aiAnalysis = await ollamaAnalysisService.generateAnalysis(leadAnalysis);

    return res.status(200).json({ leadAnalysis, aiAnalysis });
  } catch (error) {
    return next(error);
  }
}