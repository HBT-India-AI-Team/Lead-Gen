import { Router } from 'express';
import * as discoveryController from '../controllers/discoveryController.js';

const router = Router();

// Accepts a target payload (sector or manual URL) to initiate a record placeholder.
router.post('/research', discoveryController.research);

// Returns all companies filtered by sector or opportunity score, with joined predictive banking needs and risk states.
router.get('/recommendations', discoveryController.recommendations);

export default router;