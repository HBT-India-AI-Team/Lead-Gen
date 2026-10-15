import { Router } from 'express';
import * as tenderProposalController from '../controllers/tenderProposalController.js';

// No authenticateToken/authorizeRoles here — mirrors discovery.js/proposals.js,
// this phase's two unauthenticated route files. Auth is deferred to a later
// phase per the LeadGen workflow's current scope.
const router = Router();

router.post('/', tenderProposalController.create);
router.get('/', tenderProposalController.list);
router.put('/:id/approve', tenderProposalController.approve);

export default router;
