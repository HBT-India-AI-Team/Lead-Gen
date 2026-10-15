import * as tenderService from './tenderService.js';
import * as tenderProposalRepository from '../repositories/tenderProposalRepository.js';
import { generateProposalEmail, buildProposalSummary } from './emailGenerator.js';
import { ApiError } from '../utils/ApiError.js';

// Generates a tender-scoped proposal — a fully separate flow from the
// legacy_companies-keyed proposals table/service (src/services/
// proposalService.js), which this never touches. Reuses
// generateProposalEmail()/buildProposalSummary() (src/services/
// emailGenerator.js) unmodified: with no OPENAI_API_KEY configured (the
// expected setup for this demo), generateProposalEmail() already falls back
// to a deterministic templated email — exactly the "hardcoded for this
// demo" behavior asked for, with no new template code needed here.

/**
 * Maps a `tenders` row into the {name, sector, focus_area, tags}-shaped
 * "company" context emailGenerator.js expects, plus a predictiveNeed-shaped
 * {trigger_signal} built from the tender's own title/description — this
 * mapping is the only new logic in this file.
 */
function toEmailContext(tender) {
  const company = {
    name: tender.winning_company_name || tender.company_name || 'the winning bidder',
    sector: tender.category || 'General Procurement',
    focus_area: tender.tender_type || tender.category || null,
    data_source_url: tender.url || null,
    tags: tender.title || null,
  };

  const predictiveNeed = {
    service_name: tender.category || null,
    trigger_signal: tender.title || tender.description || `Won tender ${tender.tender_id}`,
  };

  return { company, predictiveNeed };
}

export async function generateProposal(tenderId) {
  const tender = await tenderService.getTenderById(tenderId);

  const { company, predictiveNeed } = toEmailContext(tender);

  const proposalSummary = buildProposalSummary(company, predictiveNeed);
  const emailDraft = await generateProposalEmail(company, predictiveNeed);

  return tenderProposalRepository.createProposal({
    tenderId: tender.tender_id,
    winningCompanyName: tender.winning_company_name,
    proposalSummary,
    emailDraft,
  });
}

export async function listProposals(tenderId) {
  return tenderProposalRepository.listByTenderId(tenderId);
}

export async function approveProposal(id) {
  const existing = await tenderProposalRepository.getById(id);
  if (!existing) {
    throw ApiError.notFound(`Proposal with ID ${id} not found.`);
  }
  return tenderProposalRepository.approveProposal(id);
}
