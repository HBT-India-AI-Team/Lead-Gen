import * as tenderService from './tenderService.js';
import * as tenderProposalRepository from '../repositories/tenderProposalRepository.js';
import { recommendBankingProducts } from './emailGenerator.js';
import { toEmailContext } from './tenderProposalService.js';

// Recommended banking products + relationship strategy for one lead, for
// the Lead Details page. Assembled entirely from what the pipeline already
// produced — the Gemini proposal agent's recommendation and rationale when
// a proposal exists, plus the product catalog match for the opportunity —
// so viewing a lead never spends a model call. Every item says where it
// came from.

function parseJson(value) {
  if (value == null || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** One plain next step from the lead's real pipeline position. */
function nextStep(tender, proposal) {
  const company = tender.winning_company_name || 'the winning company';
  if (proposal) {
    if (proposal.communication_status === 'AWAITING_SEND_APPROVAL') return `Outreach approved — contact ${company}.`;
    if (proposal.communication_status === 'DRAFT_READY') return 'Outreach email drafted — waiting for a reviewer to approve it in Communication.';
    switch (proposal.status) {
      case 'APPROVED':
        return 'Proposal approved — prepare the outreach email in Communication.';
      case 'REJECTED':
        return 'The reviewer rejected the proposal; no outreach planned.';
      case 'CHANGES_REQUESTED':
        return 'The reviewer asked for changes to the proposal before outreach.';
      case 'ON_HOLD':
        return 'Proposal on hold by the reviewer.';
      default:
        return 'Proposal drafted — waiting for expert review.';
    }
  }
  switch (tender.lead_status) {
    case 'QUALIFIED_GOOD':
      return 'Qualified — ready for an AI-drafted proposal.';
    case 'QUALIFIED_HITL':
      return 'Borderline score — needs an expert quality review before a proposal.';
    case 'QUALIFIED_BAD':
      return 'Scored below 60 — not a priority for outreach.';
    default:
      return 'Not qualified yet — run qualification to score this lead.';
  }
}

export async function getLeadRecommendations(tenderId) {
  const tender = await tenderService.getTenderById(tenderId);
  const row = await tenderProposalRepository.findLatestGeneratedProposalByTenderId(tenderId);

  const proposal = row
    ? {
        ...row,
        recommended_product: parseJson(row.recommended_product),
        rationale: parseJson(row.rationale) ?? [],
        missing_information: parseJson(row.missing_information) ?? [],
      }
    : null;

  // Every lead here is a won government tender, but tender titles rarely say
  // "tender" — state it so the catalog picks its tender-award products.
  const { company, predictiveNeed } = toEmailContext(tender);
  const catalog = recommendBankingProducts(company, { ...predictiveNeed, service_name: `tender award ${predictiveNeed.service_name ?? ''}`.trim() });

  return {
    tenderId,
    aiRecommendation: proposal?.recommended_product?.name
      ? {
          product: proposal.recommended_product.name,
          reason: proposal.recommended_product.reason ?? null,
          proposalStatus: proposal.status,
          source: 'Gemini proposal agent',
        }
      : null,
    catalogMatches: {
      products: catalog.products,
      opportunityType: catalog.scenario,
      source: 'Product catalog match for this type of opportunity',
    },
    strategy: {
      financingNeed: catalog.financialNeed,
      talkingPoints: Array.isArray(proposal?.rationale) ? proposal.rationale.slice(0, 3) : [],
      missingInformation: Array.isArray(proposal?.missing_information) ? proposal.missing_information : [],
      nextStep: nextStep(tender, proposal),
    },
  };
}
