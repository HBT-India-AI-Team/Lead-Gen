import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login — public
router.post('/login', authController.login);

// POST /api/auth/logout — any authenticated Admin or Relationship Manager
router.post('/logout', authenticateToken, authorizeRoles('Admin', 'Relationship Manager'), authController.logout);

// GET /api/auth/me — any authenticated Admin or Relationship Manager
router.get('/me', authenticateToken, authorizeRoles('Admin', 'Relationship Manager'), authController.me);

export default router;
