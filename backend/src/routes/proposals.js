import { Router } from 'express';
import * as proposalController from '../controllers/proposalController.js';

const router = Router();

// Toggles proposal status to 'approved' and triggers the final email state hook.
router.put('/:id/approve', proposalController.approve);

export default router;