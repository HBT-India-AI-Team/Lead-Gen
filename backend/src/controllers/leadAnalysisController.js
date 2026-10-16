import { leadAnalysisService } from '../services/leadAnalysisService.js';
import { AiAnalysisService } from '../services/llm/aiAnalysisService.js';

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
// Tender record -> LeadAnalysisService (deterministic) -> AiAnalysisService
// (narrative explanation only) -> { leadAnalysis, aiAnalysis }.
//
// AiAnalysisService is constructed here rather than as a shared
// module-level singleton: its LLM client constructor throws if the configured
// provider (GEMINI_API_KEY / OLLAMA_BASE_URL) is missing from .env, and
// that check should only ever fail this one request — not crash server
// startup for every other endpoint if the AI provider isn't configured.
export async function generateWithAi(req, res, next) {
  try {
    const leadAnalysis = leadAnalysisService.generateLeadAnalysis(req.body);

    const aiAnalysisService = new AiAnalysisService();
    const aiAnalysis = await aiAnalysisService.generateAnalysis(leadAnalysis);

    return res.status(200).json({ leadAnalysis, aiAnalysis });
  } catch (error) {
    return next(error);
  }
}