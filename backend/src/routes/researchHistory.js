import { Router } from 'express';
import * as researchHistoryController from '../controllers/researchHistoryController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

const router = Router();

router.use(attachSystemUser);

// Read-only — no create/update/delete routes are exposed for research history.
router.get('/', researchHistoryController.list);
router.get('/:id', researchHistoryController.getById);

export default router;
