import { Router } from 'express';
import * as tenderController from '../controllers/tenderController.js';

// No authenticateToken/authorizeRoles here — mirrors discovery.js/proposals.js,
// this phase's two unauthenticated route files. Auth is deferred to a later
// phase per the LeadGen workflow's current scope.
const router = Router();

router.get('/', tenderController.list);
router.get('/categories', tenderController.categories);
router.get('/lead-categories', tenderController.leadCategories);
router.get('/states', tenderController.states);
router.get('/districts', tenderController.districts);
router.get('/:tenderId', tenderController.getById);
router.get('/:tenderId/customer-check', tenderController.customerCheck);
router.get('/:tenderId/health-check', tenderController.healthCheck);

export default router;
