import * as tenderProposalService from '../services/tenderProposalService.js';
import { ApiError } from '../utils/ApiError.js';

export async function create(req, res, next) {
  try {
    const { tenderId } = req.body || {};
    if (!tenderId) {
      throw ApiError.badRequest('"tenderId" is required.');
    }
    const proposal = await tenderProposalService.generateProposal(tenderId);
    return res.status(201).json({ message: 'Proposal generated successfully.', proposal });
  } catch (error) {
    return next(error);
  }
}

export async function list(req, res, next) {
  try {
    const { tenderId } = req.query;
    if (!tenderId) {
      throw ApiError.badRequest('A "tenderId" query parameter is required.');
    }
    const proposals = await tenderProposalService.listProposals(tenderId);
    return res.status(200).json({ proposals });
  } catch (error) {
    return next(error);
  }
}

export async function approve(req, res, next) {
  try {
    const proposal = await tenderProposalService.approveProposal(req.params.id);
    return res.status(200).json({ message: 'Proposal approved successfully.', proposal });
  } catch (error) {
    return next(error);
  }
}
