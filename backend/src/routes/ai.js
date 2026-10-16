import { Router } from 'express';
import * as aiController from '../controllers/aiController.js';

// Read-only AI endpoints for the dashboard shell: the daily brief and the
// configured model. Open like /api/leads.
const router = Router();

router.get('/brief', aiController.brief);
router.get('/status', aiController.status);
router.get('/usage', aiController.usage);

export default router;
