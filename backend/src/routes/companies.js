import { Router } from 'express';
import * as companyController from '../controllers/companyController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

const router = Router();

router.use(attachSystemUser);

router.get('/', companyController.list);
router.get('/:id', companyController.getById);
router.post('/', companyController.create);
router.put('/:id', companyController.update);
router.delete('/:id', companyController.remove);

export default router;
