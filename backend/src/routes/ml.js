import { Router } from 'express';
import * as mlController from '../controllers/mlController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

// Model Maintenance Agent API. No login, like the rest of the app: every
// request acts as the fixed system account (same as routes/leads.js), so
// approvals and retraining runs are recorded under that name. Promotion is
// still a deliberate human action on a gate-passing candidate — never
// automatic.
const router = Router();

router.use(attachSystemUser);

router.get('/overview', mlController.overview);
router.get('/models', mlController.listModels);
router.post('/models/:id/promote', mlController.promoteModel);
router.post('/models/:id/retire', mlController.retireModel);
router.get('/training-runs', mlController.listTrainingRuns);
router.get('/training-runs/:id', mlController.getTrainingRun);
router.post('/training-runs', mlController.startTrainingRun);

export default router;
