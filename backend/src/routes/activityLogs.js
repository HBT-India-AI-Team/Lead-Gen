import { Router } from 'express';
import * as activityLogController from '../controllers/activityLogController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

const router = Router();

router.use(attachSystemUser);

// Read-only — no create/update/delete routes are exposed for activity logs.
router.get('/', activityLogController.list);
router.get('/:id', activityLogController.getById);

export default router;
