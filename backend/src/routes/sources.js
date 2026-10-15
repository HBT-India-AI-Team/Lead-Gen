import { Router } from 'express';
import * as sourceController from '../controllers/sourceController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

const router = Router();

router.use(attachSystemUser);

router.get('/', sourceController.list);
router.get('/:id', sourceController.getById);
router.post('/', sourceController.create);
router.put('/:id', sourceController.update);
router.delete('/:id', sourceController.remove);
router.patch('/:id/status', sourceController.updateStatus);
router.patch('/:id/health', sourceController.updateHealth);
router.patch('/:id/run', sourceController.recordRun);
router.patch('/:id/priority', sourceController.updatePriority);

export default router;
