import { Router } from 'express';
import * as leadAnalysisController from '../controllers/leadAnalysisController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

const router = Router();

router.use(attachSystemUser);

// Accepts a tender record and returns the aggregated CompanyIntelligence,
// LeadScoring and BankingRecommendation results for it.
router.post('/', leadAnalysisController.generate);

// Same input, plus an Ollama-generated narrative explanation of the
// deterministic result (executive summary, risk analysis, talking
// points, engagement strategy, next best action). Ollama never
// recalculates the score or recommendations produced above.
router.post('/ai', leadAnalysisController.generateWithAi);

export default router;