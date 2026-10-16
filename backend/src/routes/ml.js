import { Router } from 'express';
import * as mlController from '../controllers/mlController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

// Model Maintenance Agent API. Reads are open (same as /api/leads); every
// write changes which model scores leads, so it requires an Admin JWT.
const router = Router();
const adminOnly = [authenticateToken, authorizeRoles('Admin')];

router.get('/overview', mlController.overview);
router.get('/models', mlController.listModels);
router.post('/models/:id/promote', ...adminOnly, mlController.promoteModel);
router.post('/models/:id/retire', ...adminOnly, mlController.retireModel);
router.get('/training-runs', mlController.listTrainingRuns);
router.get('/training-runs/:id', mlController.getTrainingRun);
router.post('/training-runs', ...adminOnly, mlController.startTrainingRun);

export default router;
