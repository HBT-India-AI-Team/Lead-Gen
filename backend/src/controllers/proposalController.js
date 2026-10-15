import * as proposalService from '../services/proposalService.js';

// PUT /api/v1/proposals/:id/approve
export async function approve(req, res, next) {
  try {
    const { proposal, emailHook } = await proposalService.approveProposal(req.params.id);
    return res.json({
      message: 'Proposal successfully approved and email state hook triggered.',
      proposal,
      email_hook: emailHook
    });
  } catch (error) {
    return next(error);
  }
}