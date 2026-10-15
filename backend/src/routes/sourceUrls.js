import { Router } from 'express';
import * as sourceUrlController from '../controllers/sourceUrlController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

const router = Router();

router.use(attachSystemUser);

router.get('/', sourceUrlController.list);
router.get('/:id', sourceUrlController.getById);
router.post('/', sourceUrlController.create);
router.put('/:id', sourceUrlController.update);
router.delete('/:id', sourceUrlController.remove);

export default router;
