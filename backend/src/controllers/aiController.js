import { getAiStatus, getTodaysBrief } from '../services/aiBriefService.js';
import { getAiUsage } from '../services/aiUsageService.js';

// GET /api/ai/brief — today's Gemini brief (generated at most once a day).
// Always 200: a brief that couldn't be generated comes back as
// { status: 'unavailable', reason } rather than an error.
export async function brief(req, res, next) {
  try {
    return res.status(200).json(await getTodaysBrief());
  } catch (error) {
    return next(error);
  }
}

// GET /api/ai/status — configured LLM provider and model. Makes no model
// call, so it's safe to poll from the Settings page.
export async function status(req, res, next) {
  try {
    return res.status(200).json(getAiStatus());
  } catch (error) {
    return next(error);
  }
}

// GET /api/ai/usage?days=7 — measured model calls, latency and tokens per
// feature (from llm_calls), plus cost when prices are configured.
export async function usage(req, res, next) {
  try {
    return res.status(200).json(await getAiUsage({ days: req.query.days }));
  } catch (error) {
    return next(error);
  }
}
