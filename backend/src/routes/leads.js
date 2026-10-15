import { Router } from 'express';
import * as leadController from '../controllers/leadController.js';
import { attachSystemUser } from '../middleware/systemUser.js';

// No login flow — every request acts as the fixed system account so
// resolveReviewerIdentity() (leadController.js) always has a req.user to
// read from.
const router = Router();

router.use(attachSystemUser);

router.get('/', leadController.list);
// Must be registered before GET /:id — otherwise Express would match this
// literal path as :id = "pipeline-summary" and 404 it via getTenderById(),
// same ordering discipline already used elsewhere (e.g. tenders.js
// registers /categories, /states, /districts before /:tenderId).
router.get('/pipeline-summary', leadController.pipelineSummary);
// Same ordering requirement — literal paths before the /:id wildcard.
router.get('/signal-categories', leadController.signalCategories);
router.get('/signals', leadController.signals);
router.get('/:id', leadController.getById);
router.post('/:id/qualify', leadController.qualify);
router.post('/:id/proposal', leadController.proposal);
router.get('/:id/proposal', leadController.getProposal);
router.patch('/:id/proposal/review', leadController.review);
router.get('/:id/decision-trail', leadController.decisionTrail);
router.get('/:id/communication', leadController.getCommunication);
router.post('/:id/communication/prepare', leadController.prepareCommunicationHandler);
router.patch('/:id/communication/review', leadController.reviewCommunicationHandler);

export default router;
