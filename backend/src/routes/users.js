import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

const router = Router();

router.use(attachSystemUser);

// GET /api/users/profile
router.get('/profile', userController.getProfile);

// PUT /api/users/profile
router.put('/profile', userController.updateProfile);

// PUT /api/users/change-password
router.put('/change-password', userController.changePassword);

export default router;
